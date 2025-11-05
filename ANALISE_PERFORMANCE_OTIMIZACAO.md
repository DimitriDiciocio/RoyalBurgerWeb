# Análise de Performance e Otimização - RoyalBurger Web

## Sumário Executivo

Este documento identifica problemas de performance no frontend Web do RoyalBurger e propõe soluções de otimização. A análise focou em:

- Requisições HTTP redundantes e falta de cache eficiente
- Manipulação excessiva de DOM
- Problemas de renderização e reflow
- Uso inadequado de event listeners
- Carregamento de recursos não otimizado
- Falta de lazy loading e code splitting
- Problemas de segurança (XSS via innerHTML)

**Nota Importante**: Todas as soluções propostas utilizam apenas APIs nativas do JavaScript/HTML5/CSS3 ou bibliotecas já presentes no projeto (jQuery, FontAwesome). Não serão adicionadas novas dependências externas.

---

## 1. Problemas Críticos de Performance

### 1.1. Requisições HTTP Repetidas sem Cache Adequado ✅ **CONCLUÍDO**

**Problema Identificado**:

- Múltiplas requisições para os mesmos endpoints em poucos segundos
- Cache em memória básico sem estratégia de invalidação clara
- Cache compartilhado entre páginas não implementado
- Requisições duplicadas ao recarregar dados já em cache

**Locais Afetados**:

- `src/js/ui/home.js` - Cache local simples (5min TTL) sem controle de versão
- `src/js/api/*.js` - Sem cache entre chamadas de função
- `src/js/ui/produto.js` - Produtos e ingredientes carregados múltiplas vezes
- `src/js/ui/cesta.js` - Carrinho buscado repetidamente

**Impacto**:

- Alto: Aumenta latência percebida e carga no servidor
- Requisições desnecessárias consomem banda e recursos

**Solução Implementada**:

1. ✅ **Módulo `cache-manager.js` implementado**:

   - Cache em memória (`Map`) para acesso rápido
   - Persistência via `sessionStorage` para compartilhamento entre páginas
   - TTL configurável por tipo de recurso (padrão: 5 minutos)
   - Limpeza automática de entradas expiradas ao iniciar
   - Métodos:
     - `get(key)`: Obtém valor do cache (memória primeiro, depois sessionStorage)
     - `set(key, value, ttl)`: Armazena valor no cache com TTL opcional
     - `invalidate(key)`: Remove chave específica do cache
     - `invalidatePattern(pattern)`: Remove múltiplas chaves por padrão (RegExp)
     - `clear()`: Limpa todo o cache
     - `getStats()`: Retorna estatísticas do cache (debugging)

2. ✅ **Integração em `home.js`**:

   - Cache para produtos (`products_all`)
   - Cache para categorias (`categories_all`)
   - Função `clearProductsCache()` para invalidação quando produtos são atualizados

3. ✅ **Integração em `produto.js`**:

   - Cache para produtos individuais (`product_{id}`)
   - Cache para ingredientes de produtos (`product_ingredients_{id}`)
   - Cache compartilhado para lista completa de ingredientes (`ingredients_all`)

4. ✅ **Funcionalidades adicionais**:
   - Fallback silencioso se `sessionStorage` estiver indisponível ou cheio
   - Restauração automática de sessionStorage para memória quando acessado
   - Limpeza de entradas expiradas ao inicializar

**Nota**: Alguns módulos ainda usam cache local (ex: `settings.js`, `categorias-gerenciamento.js`). Podem ser migrados para o cache manager compartilhado no futuro para melhor consistência.

**Ganho Esperado**: 60-80% de redução em requisições HTTP redundantes

---

### 1.2. Manipulação Excessiva de DOM com innerHTML ✅ **CONCLUÍDO**

**Problema Identificado**:

- Uso extensivo de `innerHTML` para renderizar listas completas
- Re-renderização completa ao invés de atualizações incrementais
- Criação de elementos via string HTML (XSS risk + performance)
- Queries DOM repetidas sem cache

**Locais Afetados**:

- `src/js/ui/home.js:319` - `rolagemInfinita.innerHTML += ...` (concatenação ineficiente)
- `src/js/ui/cesta.js:375` - `listaItens.innerHTML = ...` (re-renderiza tudo)
- `src/js/ui/admin/*.js` - Múltiplos usos de innerHTML para tabelas
- `src/js/ui/clube-royal.js:367` - `div.innerHTML = ...` (template strings)

**Impacto**:

- Crítico: Reflow completo do DOM a cada atualização
- Alto risco de XSS se dados não sanitizados
- Performance degradada com listas grandes

**Solução Implementada**:

1. ✅ **Módulo `dom-renderer.js` implementado**:

   - Função `renderList(container, items, templateFn, keyFn)`:
     - Compara itens antigos vs novos usando `keyFn` para identificar mudanças
     - Remove apenas elementos que não existem mais
     - Atualiza apenas elementos que mudaram (comparando HTML)
     - Adiciona apenas novos elementos
     - Usa `DocumentFragment` para inserções batch eficientes
   - Função `renderListBatch(container, items, templateFn)` para renderização em batch simples
   - Integração com `html-sanitizer.js` para prevenir XSS

2. ✅ **Integração em `home.js`**:

   - Substituído concatenação `innerHTML +=` por `renderListInChunks()`
   - Renderização incremental em chunks para listas grandes (>10 itens)
   - Usa `requestAnimationFrame` para renderização não-bloqueante

3. ✅ **Integração em `cesta.js`**:

   - Substituído `listaItens.innerHTML = ...` por `renderList()`
   - Renderização incremental de itens do carrinho
   - Atualiza apenas itens que mudaram (usando `cartItemId` como chave)

4. ✅ **Sanitização automática**:
   - Todas as renderizações usam `escapeHTML` de `html-sanitizer.js`
   - Prevenção de XSS em dados dinâmicos

**Nota**: Alguns arquivos ainda usam `innerHTML` para listas menores ou casos específicos (`pagamento.js`, `order-management.js`, `categorias-gerenciamento.js`). Podem ser otimizados no futuro se necessário, mas não são críticos para performance pois lidam com listas menores.

**Ganho Esperado**: 70-90% de redução em tempo de renderização para listas grandes

---

### 1.3. Event Listeners Não Removidos e Memory Leaks ✅ **CONCLUÍDO**

**Problema Identificado**:

- Event listeners adicionados repetidamente sem remoção
- Listeners globais em elementos criados dinamicamente
- `setInterval` sem cleanup adequado
- Event delegation não utilizada onde apropriado

**Locais Afetados**:

- `src/js/utils.js:82` - `setInterval` em inputs sem cleanup em alguns casos
- `src/js/ui/cesta.js` - Listeners adicionados a cada renderização de item
- `src/js/ui/carrossel.js` - Listeners em `document` nunca removidos
- `src/js/ui/produto.js` - Múltiplos listeners sem remoção ao editar item

**Impacto**:

- Alto: Memory leaks em sessões longas
- Performance degradada com muitos listeners acumulados

**Solução Implementada**:

1. ✅ **`cesta.js` otimizado**:

   - Usa `delegate()` de `performance-utils.js` para event delegation
   - Mantém array de cleanup functions que são chamadas antes de re-renderizar
   - Listeners removidos adequadamente antes de adicionar novos
   - Event delegation aplicada em botões de quantidade, remover e editar

2. ✅ **`produto.js` otimizado**:

   - Refatorado `attachIngredienteHandlers()` para usar event delegation
   - Usa `Map` para armazenar cleanups separados por container
   - Event delegation aplicada em botões de mais/menos de ingredientes
   - Cleanup automático antes de re-anexar handlers ao re-renderizar

3. ✅ **`carrossel.js` otimizado**:

   - Cleanup adequado de event listeners no `beforeunload`
   - Função `cleanupDragEvents()` para remover listeners globais
   - Listeners de drag usam namespaces jQuery para cleanup fácil

4. ✅ **`utils.js` otimizado**:
   - Substituído `setInterval` por `MutationObserver` (ver seção 1.7)
   - Cleanup automático quando elementos são removidos do DOM

**Ganho Esperado**: Eliminação de memory leaks e 30-50% menos overhead de eventos

---

### 1.4. Queries DOM Repetidas sem Cache ✅ **CONCLUÍDO**

**Problema Identificado**:

- `querySelector` / `getElementById` chamados múltiplas vezes
- Seletores complexos re-executados em loops
- Sem cache de referências DOM

**Locais Afetados**:

- `src/js/ui/home.js` - Múltiplas queries para mesmos elementos
- `src/js/ui/cesta.js` - Elementos buscados em cada função
- `src/js/ui/produto.js` - Re-queries em funções de atualização

**Impacto**:

- Médio: Overhead desnecessário de queries DOM

**Solução Implementada**:

1. ✅ Módulo `dom-cache.js` implementado com:

   - Classe `DOMCache` com cache automático de elementos
   - `MutationObserver` para invalidar cache quando elementos são removidos
   - Helpers `$q()`, `$qa()`, `$id()` para uso conveniente
   - Validação automática de elementos (verifica se ainda existem no DOM)

2. ✅ Aplicado em todos os arquivos mencionados:
   - `home.js` - Já usava `$q` e `$qa` do `dom-cache.js`
   - `cesta.js` - Substituído `getElementById` por `$id()` na função `initElements()`
   - `produto.js` - Substituído `getElementById` e `querySelector` por `$id()` e `$q()` na inicialização do objeto `el`

**Ganho Esperado**: 20-40% de redução em tempo de execução de funções que manipulam DOM

---

### 1.5. Carregamento de Scripts e Recursos Não Otimizado ✅ **CONCLUÍDO**

**Problema Identificado**:

- Todos os scripts carregados em `index.html` mesmo em páginas que não os usam
- jQuery carregado globalmente mesmo quando não necessário
- FontAwesome carregado via CDN (dependência externa)
- Sem lazy loading de módulos JavaScript
- Imagens sem lazy loading

**Locais Afetados**:

- `index.html` - 7 scripts + jQuery + FontAwesome carregados sempre
- Imagens do carrossel carregadas todas de uma vez
- Módulos admin carregados mesmo em páginas públicas

**Impacto**:

- Alto: Tempo de carregamento inicial aumentado
- Banda consumida desnecessariamente

**Solução Implementada**:

1. ✅ **Módulo `lazy-loader.js` implementado**:

   - Mapa `PAGE_SCRIPTS` definindo scripts necessários para cada página
   - Função `detectCurrentPage()` para identificar página atual
   - Função `loadScript()` para carregamento dinâmico via tag `<script>`
   - Função `loadAdminModules()` para módulos administrativos
   - Função `initializeLazyLoading()` que carrega scripts baseado na página
   - Função `loadScriptOnDemand()` para carregamento sob demanda

2. ✅ **Integração no `index.html`**:

   - Scripts essenciais carregados diretamente (utils.js, image-loader.js, imports.js, header.js, alerts.js)
   - Scripts específicos da página carregados via `initializeLazyLoading()`
   - Auto-inicialização configurada no módulo lazy-loader

3. ✅ **Lazy loading de imagens**:
   - Implementado em módulo separado `image-loader.js` (ver seção 1.10)

**Nota**: jQuery e FontAwesome continuam sendo carregados globalmente pois são necessários para funcionalidades básicas (modais, ícones) em várias páginas. Esta é uma dependência do projeto atual que pode ser otimizada no futuro.

**Ganho Esperado**: 40-60% de redução no tempo de carregamento inicial

---

### 1.6. Renderização Ineficiente de Listas Grandes ✅ **CONCLUÍDO**

**Problema Identificado**:

- Renderização completa de listas mesmo quando apenas alguns itens mudam
- Sem virtualização para listas muito grandes
- Re-renderização desnecessária ao atualizar estado

**Locais Afetados**:

- `src/js/ui/admin/produtos-gerenciamento.js` - Lista de produtos
- `src/js/ui/admin/usuarios-gerenciamento.js` - Lista de usuários
- `src/js/ui/home.js` - Lista de produtos por categoria

**Impacto**:

- Alto: Performance degradada com 100+ itens
- Lag perceptível ao scroll ou atualizar

**Solução Implementada**:

1. ✅ **Módulo `virtual-scroll.js` já implementado** (desde seção 1.2):

   - Função `renderListInChunks()` para renderização incremental em chunks
   - Função `createVirtualScroller()` para virtual scrolling avançado
   - Função `createIncrementalRenderer()` com IntersectionObserver

2. ✅ **Integração em `home.js`**:

   - Já usa `renderListInChunks()` para renderização de produtos por categoria
   - Renderização incremental em chunks de 10 itens com `requestAnimationFrame`

3. ✅ **Integração em `produtos-gerenciamento.js`**:

   - `renderProdutoCards()` refatorado para usar renderização incremental
   - Listas grandes (>50 itens) usam `renderListInChunks()` com chunks de 20 itens
   - Listas menores usam renderização direta (mais simples)
   - Atualização de custos estimados após renderização completa

4. ✅ **Integração em `usuarios-gerenciamento.js`**:
   - `renderUsuarioCards()` refatorado para usar renderização incremental
   - Listas grandes (>50 itens) usam `renderListInChunks()` com chunks de 20 itens
   - Listas menores usam renderização direta

**Nota**: A renderização incremental é aplicada apenas para listas grandes (>50 itens) para evitar overhead desnecessário em listas pequenas. Listas menores continuam usando renderização direta que é mais simples e rápida.

**Ganho Esperado**: 80-95% de redução em tempo de renderização para listas grandes (>50 itens)

---

### 1.7. Uso de setInterval para Polling de Valor ✅ **CONCLUÍDO**

**Problema Identificado**:

- `setInterval` rodando a cada 250ms em `utils.js` para verificar mudanças de valor
- Polling desnecessário quando MutationObserver seria mais eficiente

**Locais Afetados**:

- `src/js/utils.js:82` - Interval em todos os inputs

**Impacto**:

- Médio: CPU usage constante mesmo sem mudanças

**Solução Implementada**:

1. ✅ Substituído `setInterval` por `MutationObserver` em `utils.js`:
   - Observer configurado para detectar mudanças no atributo `value`
   - Observa apenas mudanças de atributo (não childList ou subtree)
   - Fallback silencioso se `MutationObserver` não estiver disponível
   - Cleanup automático quando elemento é removido do DOM
2. ✅ Eventos nativos (`input`, `change`, `focus`, `blur`) continuam sendo usados para mudanças manuais
3. ✅ Observer armazenado no elemento para possível cleanup posterior

**Ganho Esperado**: 90%+ de redução em CPU usage para gerenciamento de inputs

---

### 1.8. Carrossel com setInterval Sem Otimização ✅ **CONCLUÍDO**

**Problema Identificado**:

- `setInterval` rodando mesmo quando carrossel não está visível
- Sem pause quando página está em background tab
- Event listeners globais em `document` para drag (performance)

**Locais Afetados**:

- `src/js/ui/carrossel.js`

**Impacto**:

- Médio: Recursos desperdiçados quando não visível

**Solução Implementada**:

1. ✅ **Page Visibility API**:

   - Event listener `visibilitychange` para detectar quando a página está em background
   - Pausa automaticamente o temporizador quando `document.hidden === true`
   - Retoma automaticamente quando a página volta a ficar visível

2. ✅ **Intersection Observer**:

   - Observer configurado com threshold de 0.1 (10% visível)
   - Pausa o carrossel quando sai do viewport
   - Retoma quando volta a ficar visível
   - Fallback para assumir visibilidade se `IntersectionObserver` não estiver disponível

3. ✅ **requestAnimationFrame**:

   - Função `aplicarTransform()` usa `requestAnimationFrame` para animações suaves
   - Cancela animações anteriores antes de criar novas
   - Cleanup adequado no `beforeunload`

4. ✅ **Event Listeners Otimizados**:
   - Event listeners de arrastar usam namespaces jQuery (`.carrossel`) para cleanup fácil
   - Função `cleanupDragEvents()` para remover listeners globais
   - Cleanup completo no `beforeunload`

**Ganho Esperado**: Redução de 50-70% em CPU quando carrossel não está visível

---

### 1.9. Falta de Debounce/Throttle em Eventos Frequentes ✅ **CONCLUÍDO**

**Problema Identificado**:

- Eventos de input sem debounce
- Scroll events sem throttle
- Resize events sem throttle

**Locais Afetados**:

- Vários módulos com inputs de busca/filtro
- Funções de scroll infinito

**Impacto**:

- Médio: Execuções desnecessárias de handlers

**Solução Implementada**:

1. ✅ Utilitários `debounce` e `throttle` implementados em `performance-utils.js`
2. ✅ Aplicado debounce em inputs de busca:
   - `insumos-gerenciamento.js` - Busca de ingredientes
   - `usuarios-gerenciamento.js` - Busca de funcionários
   - `produtos-gerenciamento.js` - Busca de produtos
   - `order-management.js` - Busca de pedidos
   - `configuracoes-gerenciamento.js` - Validação de inputs
   - `esqueceu-senha.js` - Validação de email
3. ✅ Scroll events já otimizados com `requestAnimationFrame` em `virtual-scroll.js`

**Ganho Esperado**: 60-80% de redução em execuções desnecessárias

---

### 1.10. Imagens Sem Otimização e Lazy Loading ✅ **CONCLUÍDO**

**Problema Identificado**:

- Todas as imagens do carrossel carregadas imediatamente
- Sem `loading="lazy"` em imagens abaixo do fold
- Sem srcset para diferentes resoluções
- Sem WebP com fallback

**Locais Afetados**:

- `index.html` - Carrossel com 6 imagens
- `home.js` - Imagens de produtos
- `produto.js` - Imagem principal do produto

**Impacto**:

- Alto: Tempo de carregamento inicial
- Banda consumida desnecessariamente

**Solução Implementada**:

1. ✅ Módulo `image-loader.js` implementado com:
   - `initLazyLoadingImages()` usando `IntersectionObserver` para controle fino
   - `addNativeLazyLoading()` para adicionar `loading="lazy"` nativo
   - `initAutoLazyLoading()` que combina ambas as abordagens
2. ✅ Carrossel otimizado no `index.html`:
   - Primeira imagem carrega imediatamente (above the fold)
   - Demais imagens usam `data-src` e `loading="lazy"`
3. ✅ Auto-inicialização configurada no `image-loader.js`
4. ✅ Imagens de produtos em `produtos-gerenciamento.js` já usam `loading="lazy"`

**Ganho Esperado**: 30-50% de redução no tempo de carregamento inicial

---

## 2. Problemas de Segurança Relacionados a Performance

### 2.1. Falta de Sanitização de HTML (XSS) ✅ **CONCLUÍDO**

**Problema Identificado**:

- Múltiplos usos de `innerHTML` com dados da API
- Sanitização inconsistente (alguns lugares têm, outros não)
- Implementações locais de sanitização (não centralizadas)
- Risco de XSS

**Locais Afetados**:

- Vários módulos admin (`insumos-gerenciamento.js`, `produtos-gerenciamento.js`, `usuarios-gerenciamento.js`, `order-management.js`, `configuracoes-gerenciamento.js`, `produto-extras-manager.js`)
- `home.js` ao renderizar produtos
- `cesta.js` ao renderizar itens

**Solução Implementada**:

1. ✅ **Módulo `html-sanitizer.js` centralizado** (já implementado anteriormente):

   - Função `escapeHTML()` para escapar caracteres HTML perigosos
   - Função `escapeAttribute()` para sanitizar atributos HTML
   - Função `sanitizeURL()` para validar e sanitizar URLs
   - Função `createSafeElement()` para criar elementos DOM de forma segura
   - Suporte a DOMPurify se disponível (fallback automático)

2. ✅ **Migração de módulos admin para usar o módulo centralizado**:

   - `insumos-gerenciamento.js`: Importado `escapeHTML` e aplicado em `createInsumoCard()`
   - `produtos-gerenciamento.js`: Substituído método local `escapeHtml()` por `escapeHTML` do módulo centralizado (12 ocorrências)
   - `usuarios-gerenciamento.js`: Substituído método local `sanitizeHTML()` por `escapeHTML` do módulo centralizado
   - `order-management.js`: Função local `escapeHTML()` agora delega para o módulo centralizado (23 ocorrências)
   - `configuracoes-gerenciamento.js`: Método local `escapeHTML()` removido (não estava sendo usado)
   - `produto-extras-manager.js`: Substituído função local `escapeHtml()` por `escapeHTML` do módulo centralizado

3. ✅ **Integração em outros módulos** (já implementado anteriormente):
   - `home.js`: Usa `escapeHTML` e `escapeAttribute` ao renderizar produtos
   - `cesta.js`: Usa `escapeHTML` ao renderizar itens
   - `produto.js`: Usa `escapeHTML`, `escapeAttribute`, `sanitizeURL`
   - `clube-royal.js`: Usa `escapeHTML`, `escapeAttribute`, `sanitizeURL`
   - `pagamento.js`: Usa `escapeHTML`, `escapeAttribute`, `sanitizeURL`
   - `order-history.js`: Usa `escapeHTML`, `escapeAttribute`, `sanitizeURL`

**Nota**: Todos os módulos admin agora usam o módulo centralizado `html-sanitizer.js`, garantindo consistência na sanitização e prevenção de XSS. Os métodos locais foram removidos ou marcados como deprecated para evitar confusão.

**Ganho Esperado**: Eliminação de vulnerabilidades XSS e sanitização consistente em toda a aplicação

---

### 2.2. Validação de Input Incompleta ✅ **CONCLUÍDO**

**Problema Identificado**:

- Validações duplicadas em múltiplos arquivos
- Implementações inconsistentes (algumas validações são mais robustas que outras)
- Validações locais que não são reutilizáveis
- Falta de validação centralizada para CPF, CNPJ, CEP, etc.
- Mensagens de erro inconsistentes

**Locais Afetados**:

- `src/js/ui/log-cadas.js` - Validações locais de email, telefone, data de nascimento, senha
- `src/js/ui/pagamento.js` - Validação local de CPF
- `src/js/ui/admin/usuarios-gerenciamento.js` - Validações locais de email, telefone, data de nascimento
- `src/js/ui/admin/configuracoes-gerenciamento.js` - Validações básicas locais
- `src/js/ui/admin/insumos-gerenciamento.js` - Validações básicas locais

**Impacto**:

- Médio: Inconsistência na validação de dados
- Risco de aceitar dados inválidos em alguns formulários
- Manutenção difícil (precisa atualizar validações em múltiplos lugares)

**Solução Implementada**:

1. ✅ **Módulo `validators.js` centralizado**:

   - Função `validateEmail()` - Validação robusta de email (RFC 5322 simplificada)
   - Função `validatePhone()` - Validação de telefone brasileiro (10-11 dígitos, DDD válido)
   - Função `validateCPF()` - Algoritmo oficial da Receita Federal com validação de dígitos verificadores
   - Função `validateCNPJ()` - Algoritmo oficial da Receita Federal com validação de dígitos verificadores
   - Função `validateCEP()` - Validação de CEP brasileiro (8 dígitos)
   - Função `validateBirthDate()` - Validação de data de nascimento (18+ anos, não no futuro, idade máxima configurável)
   - Função `validatePassword()` - Validação de senha forte (mínimo 8 caracteres, maiúscula, número, especial - configurável)
   - Função `validateRequired()` - Validação de campos obrigatórios
   - Função `validateNumber()` - Validação de números (mínimo/máximo)
   - Função `validateLength()` - Validação de comprimento de texto (mínimo/máximo)
   - Função `applyFieldValidation()` - Aplica validação em campo de formulário com feedback visual automático
   - Função `clearFieldValidation()` - Limpa validação visual de um campo

2. ✅ **Integração em `log-cadas.js`**:

   - Substituído validações locais de email, telefone, data de nascimento e senha
   - Wrappers mantidos para compatibilidade com código existente (`validarEmail`, `validarTelefone`, `validarDataNascimento`)
   - Uso de `applyFieldValidation()` para feedback visual automático
   - Validação de senha forte integrada com visualização de requisitos

3. ✅ **Integração em `pagamento.js`**:

   - Substituído validação local de CPF por `validateCPF()` do módulo centralizado
   - Função local `validarCPF()` removida
   - Mensagens de erro consistentes e informativas

4. 📝 **Integração pendente** (pode ser feita no futuro):

   - `usuarios-gerenciamento.js` - Migrar validações locais para usar `validators.js`
   - `configuracoes-gerenciamento.js` - Usar validadores centralizados para CNPJ, telefone, email
   - `insumos-gerenciamento.js` - Migrar validações numéricas para usar `validateNumber()`

**Nota**: Os módulos admin ainda têm algumas validações locais que podem ser migradas para o módulo centralizado no futuro. As integrações principais (`log-cadas.js` e `pagamento.js`) foram concluídas, garantindo consistência nas validações de formulários públicos.

**Ganho Esperado**:

- Consistência na validação de dados em toda a aplicação
- Manutenção simplificada (validações em um único lugar)
- Mensagens de erro consistentes e informativas
- Redução de bugs por validações inconsistentes

---

### 2.3. Falta de Tratamento de Erros de Rede ✅ **CONCLUÍDO**

**Problema Identificado**:

- Requisições sem timeout configurável
- Falta de retry automático para erros temporários
- Mensagens de erro de rede pouco informativas
- Sem classificação adequada de tipos de erro
- Falta de feedback visual para requisições em retry

**Locais Afetados**:

- `src/js/api/api.js` - Função `apiRequest` sem timeout e retry
- `src/js/ui/alerts.js` - Tratamento básico de erros sem classificação
- Todas as chamadas de API que podem falhar em condições de rede instável

**Impacto**:

- Médio: Requisições podem travar indefinidamente
- Falta de resiliência em condições de rede instável
- Experiência do usuário ruim em casos de timeout ou falhas temporárias

**Solução Implementada**:

1. ✅ **Módulo `network-error-handler.js` centralizado**:

   - Função `fetchWithTimeout()` - Adiciona timeout configurável às requisições
   - Função `fetchWithRetry()` - Implementa retry automático com backoff exponencial
   - Função `robustFetch()` - Combina timeout e retry em uma única função
   - Função `classifyNetworkError()` - Classifica erros de rede em tipos específicos:
     - `timeout` - Requisição excedeu o tempo limite
     - `connection` - Não foi possível conectar ao servidor
     - `cors` - Erro de configuração CORS
     - `unauthorized` - Sessão expirada (401)
     - `forbidden` - Acesso negado (403)
     - `not_found` - Serviço não encontrado (404)
     - `rate_limit` - Muitas requisições (429)
     - `server_error` - Erro do servidor (5xx)
     - `validation_error` - Erro de validação (422)
     - `network` - Erro de rede genérico
   - Função `getUserFriendlyErrorMessage()` - Retorna mensagens amigáveis baseadas na classificação
   - Configurações padrão:
     - Timeout: 30 segundos
     - Max retries: 3 tentativas
     - Backoff exponencial: delay inicial 1s, máximo 10s
     - Status codes retentáveis: 408, 429, 500, 502, 503, 504

2. ✅ **Integração em `apiRequest()`**:

   - Uso de `robustFetch()` para todas as requisições
   - Parâmetros opcionais `timeout` e `maxRetries` adicionados
   - Parâmetro `skipRetry` para desabilitar retry em casos específicos (ex: login)
   - Classificação automática de erros com informações adicionais:
     - `errorType` - Tipo de erro classificado
     - `userMessage` - Mensagem amigável para o usuário
     - `isRetryable` - Indica se o erro pode ser retentado
   - Log de retries apenas em modo desenvolvimento

3. ✅ **Melhorias em `toastFromApiError()`**:

   - Uso de `userMessage` do erro classificado quando disponível
   - Títulos específicos baseados no tipo de erro
   - Fallback para tratamento antigo (compatibilidade)
   - Mensagens mais informativas e específicas para cada tipo de erro

**Nota**: O sistema de retry é inteligente e não tenta retentar erros que não são retentáveis (como 401, 403, 404, CORS, etc.). O backoff exponencial garante que requisições não sobrecarreguem o servidor em caso de problemas temporários.

**Ganho Esperado**:

- Maior resiliência em condições de rede instável
- Redução de falhas por timeout ou erros temporários do servidor
- Mensagens de erro mais informativas e amigáveis ao usuário
- Melhor experiência do usuário com retry automático transparente

---

## 3. Problemas de Arquitetura

### 3.1. Falta de Code Splitting ✅ **CONCLUÍDO**

**Problema Identificado**:

- Todo o código JavaScript carregado mesmo em páginas simples
- Módulos admin carregados em páginas públicas

**Solução Implementada**:

1. ✅ **Sistema de Code Splitting Avançado** (`code-splitter.js`):

   - Dynamic imports baseado em features (auth, cart, products, admin, etc.)
   - Carregamento sob demanda de módulos administrativos
   - Verificação de autenticação e permissões antes de carregar módulos
   - Cache de módulos carregados para evitar recarregamento
   - Prevenção de carregamentos paralelos do mesmo módulo

2. ✅ **Mapeamento de Features**:

   - Features públicas: `auth`, `cart`, `products`, `payment`, `user`
   - Features administrativas: `admin`, `admin_dashboard`, `admin_products`, `admin_orders`, `admin_users`, `admin_ingredients`, `admin_settings`
   - Cada feature tem seus módulos e dependências definidos
   - Módulos base sempre carregados (utils, api, alerts, header)

3. ✅ **Funções Principais**:

   - `loadFeature(featureName, options)`: Carrega uma feature completa com dependências
   - `loadPageModules()`: Carrega módulos baseado na página atual
   - `loadAdminFeature(adminFeature)`: Carrega módulos admin sob demanda
   - `isModuleLoaded(modulePath)`: Verifica se módulo já foi carregado

**Uso**:

```javascript
// Carregar feature completa
import { loadFeature } from "./js/utils/code-splitter.js";
await loadFeature("admin_products"); // Carrega apenas se for admin

// Carregar módulos da página atual
import { loadPageModules } from "./js/utils/code-splitter.js";
await loadPageModules();
```

**Ganho Esperado**:

- 40-60% de redução no tamanho inicial do bundle JavaScript
- 30-50% de redução no tempo de carregamento inicial
- Módulos admin não carregados em páginas públicas

---

### 3.2. Estado Global Não Gerenciado ✅ **CONCLUÍDO**

**Problema Identificado**:

- Estado espalhado em múltiplos módulos
- Cache duplicado em diferentes lugares
- Sincronização de estado complexa

**Solução Implementada**:

1. ✅ **State Manager Centralizado** (`state-manager.js`):

   - Classe `StateManager` para gerenciamento centralizado de estado
   - Sistema de subscriptions para mudanças de estado
   - Event Bus integrado para comunicação entre módulos
   - Operações batch (`setMultiple`, `getMultiple`)
   - Snapshots e restauração de estado
   - Selectors para acessar partes do estado

2. ✅ **Event Bus**:

   - Classe `EventBus` para comunicação desacoplada entre módulos
   - Sistema de eventos padronizados (`STATE_EVENTS`)
   - Listeners com cleanup automático
   - Prevenção de memory leaks

3. ✅ **Chaves de Estado Padronizadas** (`STATE_KEYS`):

   - Autenticação: `USER`, `TOKEN`, `IS_AUTHENTICATED`
   - Carrinho: `CART`, `CART_ITEMS`, `CART_TOTAL`
   - Produtos: `PRODUCTS`, `PRODUCTS_BY_CATEGORY`, `CURRENT_PRODUCT`
   - Categorias: `CATEGORIES`, `ACTIVE_CATEGORY`
   - Pedidos: `CURRENT_ORDER`, `ORDER_HISTORY`
   - Configurações: `SETTINGS`, `STORE_HOURS`
   - UI State: `LOADING`, `ERROR`, `MODAL_OPEN`

4. ✅ **Integração com Módulos**:

   - Integrado em `cesta.js` para sincronização do estado do carrinho
   - Eventos emitidos: `CART_UPDATED`, `CART_ITEM_ADDED`, `CART_ITEM_REMOVED`, `CART_ITEM_UPDATED`, `CART_CLEARED`
   - Sincronização automática ao calcular totais, adicionar, remover ou atualizar itens

**Uso**:

```javascript
import {
  stateManager,
  STATE_KEYS,
  STATE_EVENTS,
} from "./js/utils/state-manager.js";

// Obter estado
const cartItems = stateManager.get(STATE_KEYS.CART_ITEMS);

// Definir estado
stateManager.set(STATE_KEYS.CART_ITEMS, items);

// Subscribir para mudanças
const unsubscribe = stateManager.subscribe(
  STATE_KEYS.CART_ITEMS,
  (newValue, oldValue) => {
    console.log("Carrinho atualizado:", newValue);
  }
);

// Usar Event Bus
stateManager.getEventBus().on(STATE_EVENTS.CART_UPDATED, (data) => {
  console.log("Carrinho atualizado via evento:", data);
});

// Limpar subscription
unsubscribe();
```

**Ganho Esperado**:

- Eliminação de cache duplicado
- Sincronização automática de estado entre módulos
- Redução de bugs por estado inconsistente
- Melhor rastreabilidade de mudanças de estado

---

## 4. Problemas de CSS

### 4.1. CSS Não Otimizado ✅ **CONCLUÍDO**

**Problema Identificado**:

- Múltiplos arquivos CSS carregados
- Sem minificação
- Possível CSS não utilizado
- CSS não-crítico bloqueando renderização

**Solução Implementada**:

1. ✅ **Otimização de carregamento de CSS**:

   - Preload de CSS crítico (header.css, global.css) no `index.html`
   - Carregamento assíncrono de CSS não-crítico (cesta.css, modais.css, mensagens.css)
   - Fallback para navegadores sem suporte a `onload` em `<link>`
   - CSS crítico carrega primeiro para renderização acima da dobra

2. ✅ **Utilitário de minificação e combinação**:

   - Módulo `css-optimizer.js` com funções para minificar e combinar CSS
   - Script `css-build-helper.js` (Node.js) para processamento em lote:
     - `minify`: Minifica um arquivo CSS
     - `combine`: Combina múltiplos arquivos CSS
     - `optimize-all`: Minifica todos os arquivos CSS e cria versões `.min.css`
     - `base`: Combina arquivos base (header.css, global.css, footer.css)

3. 📝 **Documentação**:
   - Instruções de uso do `css-build-helper.js` incluídas no script

**Uso do css-build-helper.js**:

```bash
# Minificar um arquivo
node css-build-helper.js minify src/assets/styles/global.css

# Minificar todos os arquivos
node css-build-helper.js optimize-all

# Combinar arquivos base
node css-build-helper.js base src/assets/styles/base.min.css
```

**Ganho Esperado**:

- 20-40% de redução no tempo de renderização inicial (FCP)
- 30-50% de redução no tamanho dos arquivos CSS após minificação

---

## 5. Estratégia de Implementação Prioritária

### Prioridade 1 (Implementar Imediatamente)

1. **Cache Manager Compartilhado** (Seção 1.1)

   - Reduz requisições HTTP redundantes
   - Impacto alto, complexidade média

2. **Renderização Incremental de Listas** (Seção 1.2)

   - Melhora performance de renderização
   - Impacto alto, complexidade média

3. **Event Delegation e Cleanup** (Seção 1.3)

   - Elimina memory leaks
   - Impacto alto, complexidade baixa

4. **Lazy Loading de Scripts** (Seção 1.5)
   - Reduz tempo de carregamento inicial
   - Impacto alto, complexidade média

### Prioridade 2 (Implementar em 1-2 semanas)

5. **Cache de Referências DOM** (Seção 1.4)
6. **Virtual Scrolling para Listas Grandes** (Seção 1.6)
7. **Remover Polling com MutationObserver** (Seção 1.7)
8. **Otimização do Carrossel** (Seção 1.8)
9. **Debounce/Throttle Utilities** (Seção 1.9)
10. **Lazy Loading de Imagens** (Seção 1.10)

### Prioridade 3 (Implementar em 1 mês)

11. **Sanitização Automática de HTML** (Seção 2.1) ✅
12. **Validação de Input Incompleta** (Seção 2.2) ✅
13. **Code Splitting Avançado** (Seção 3.1) ✅
14. **State Manager Centralizado** (Seção 3.2) ✅
15. **Otimização de CSS** (Seção 4.1) ✅

---

## 6. Métricas de Sucesso

### Antes das Otimizações (Baseline)

- Tempo de carregamento inicial: ~3-5s
- Requisições HTTP na home: ~15-20
- Tempo de renderização de lista de 100 itens: ~500ms
- Memory usage após 10 minutos: ~150MB

### Meta Após Otimizações

- Tempo de carregamento inicial: <2s (40%+ melhoria)
- Requisições HTTP na home: <8 (60%+ redução)
- Tempo de renderização de lista de 100 itens: <100ms (80%+ melhoria)
- Memory usage após 10 minutos: <80MB (50%+ redução)

---

## 7. Conclusão

O projeto Web apresenta várias oportunidades de otimização de performance, principalmente relacionadas a:

1. **Cache inadequado** - Múltiplas requisições desnecessárias
2. **Manipulação de DOM ineficiente** - Re-renderizações completas
3. **Memory leaks** - Event listeners não removidos
4. **Carregamento não otimizado** - Scripts e imagens carregados desnecessariamente

As soluções propostas utilizam apenas APIs nativas do browser ou bibliotecas já presentes no projeto, garantindo que não há novas dependências externas.

A implementação priorizada das otimizações de Prioridade 1 deve resultar em melhorias significativas na experiência do usuário e na performance geral da aplicação.

---

## Apêndice: Exemplos de Código Otimizado

### Exemplo 1: Cache Manager

```javascript
// src/js/utils/cache-manager.js
class CacheManager {
  constructor() {
    this.memoryCache = new Map();
    this.defaultTTL = 5 * 60 * 1000; // 5 minutos
  }

  get(key) {
    const entry = this.memoryCache.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expires) {
      this.memoryCache.delete(key);
      return null;
    }

    return entry.value;
  }

  set(key, value, ttl = this.defaultTTL) {
    this.memoryCache.set(key, {
      value,
      expires: Date.now() + ttl,
    });
  }

  invalidate(key) {
    this.memoryCache.delete(key);
  }

  clear() {
    this.memoryCache.clear();
  }
}

export const cacheManager = new CacheManager();
```

### Exemplo 2: Renderização Incremental

```javascript
// src/js/utils/dom-renderer.js
export function renderList(
  container,
  items,
  templateFn,
  keyFn = (item, index) => index
) {
  const fragment = document.createDocumentFragment();
  const existingKeys = new Set(
    Array.from(container.children).map((el) => el.dataset.key)
  );
  const newKeys = new Set(items.map(keyFn));

  // Remove itens que não existem mais
  Array.from(container.children).forEach((el) => {
    if (!newKeys.has(el.dataset.key)) {
      el.remove();
    }
  });

  // Atualiza ou adiciona itens
  items.forEach((item, index) => {
    const key = String(keyFn(item, index));
    let element = container.querySelector(`[data-key="${key}"]`);

    if (!element) {
      element = document.createElement("div");
      element.dataset.key = key;
      container.appendChild(element);
    }

    const newHTML = templateFn(item, index);
    if (element.innerHTML !== newHTML) {
      element.innerHTML = newHTML;
    }
  });
}
```

### Exemplo 3: Event Delegation

```javascript
// Antes: Múltiplos listeners
items.forEach((item) => {
  item.querySelector(".btn-remove").addEventListener("click", handler);
});

// Depois: Event delegation
container.addEventListener("click", (e) => {
  if (e.target.matches(".btn-remove")) {
    const item = e.target.closest("[data-item-id]");
    const itemId = item.dataset.itemId;
    handler(itemId);
  }
});
```
