# Guia de Desenvolvimento - RoyalBurger Web

Este documento fornece orientações sobre como continuar desenvolvendo o projeto RoyalBurger Web utilizando as otimizações implementadas e como resolver problemas comuns.

---

## Índice

1. [Estrutura de Módulos e Utilitários](#estrutura-de-módulos-e-utilitários)
2. [Cache Manager](#cache-manager)
3. [State Manager e Event Bus](#state-manager-e-event-bus)
4. [Renderização de Listas](#renderização-de-listas)
5. [Event Delegation](#event-delegation)
6. [Sanitização de HTML](#sanitização-de-html)
7. [Validação de Inputs](#validação-de-inputs)
8. [Tratamento de Erros de Rede](#tratamento-de-erros-de-rede)
9. [Code Splitting](#code-splitting)
10. [Problemas Comuns e Soluções](#problemas-comuns-e-soluções)

---

## Estrutura de Módulos e Utilitários

### Módulos Disponíveis

Todos os módulos de otimização estão em `src/js/utils/`:

- `cache-manager.js` - Gerenciamento de cache compartilhado
- `state-manager.js` - Gerenciamento de estado global e event bus
- `dom-renderer.js` - Renderização incremental de listas
- `dom-cache.js` - Cache de referências DOM
- `performance-utils.js` - Debounce, throttle, event delegation
- `virtual-scroll.js` - Renderização virtual e incremental
- `html-sanitizer.js` - Sanitização de HTML para prevenir XSS
- `validators.js` - Validação centralizada de inputs
- `network-error-handler.js` - Tratamento de erros de rede
- `code-splitter.js` - Code splitting e carregamento dinâmico
- `image-loader.js` - Lazy loading de imagens
- `lazy-loader.js` - Lazy loading de scripts

---

## Cache Manager

### Quando Usar

Use o `cacheManager` para armazenar dados de API que:

- São carregados frequentemente
- Não mudam constantemente
- São utilizados em múltiplos módulos

### Exemplo de Uso

```javascript
import { cacheManager } from "../utils/cache-manager.js";

// Definir chaves de cache (no topo do arquivo)
const CACHE_KEYS = {
  products: "products_all",
  product: (id) => `product_${id}`,
  categories: "categories_all",
};

const CACHE_TTL = 5 * 60 * 1000; // 5 minutos

// Carregar dados com cache
async function loadProducts() {
  // Verificar cache primeiro
  const cached = cacheManager.get(CACHE_KEYS.products);
  if (cached) {
    return cached;
  }

  // Carregar da API
  const response = await fetch("/api/products");
  const products = await response.json();

  // Armazenar no cache
  cacheManager.set(CACHE_KEYS.products, products, CACHE_TTL);

  return products;
}

// Invalidar cache quando necessário
function updateProduct(productId, newData) {
  // Atualizar produto
  await updateProductAPI(productId, newData);

  // Invalidar caches relacionados
  cacheManager.invalidate(CACHE_KEYS.products);
  cacheManager.invalidate(CACHE_KEYS.product(productId));
}
```

### Boas Práticas

- ✅ **SEMPRE** defina TTL apropriado para cada tipo de dado
- ✅ **SEMPRE** invalide cache quando dados são atualizados
- ✅ Use chaves descritivas e consistentes
- ❌ **NÃO** cache dados sensíveis (tokens, senhas)
- ❌ **NÃO** use cache para dados que mudam constantemente

---

## State Manager e Event Bus

### Quando Usar

Use o `stateManager` para:

- Estado compartilhado entre múltiplos módulos
- Sincronização de estado (ex: carrinho, usuário logado)
- Comunicação desacoplada entre módulos

### Exemplo de Uso

```javascript
import {
  stateManager,
  STATE_KEYS,
  STATE_EVENTS,
} from "../utils/state-manager.js";

// Definir estado
stateManager.set(STATE_KEYS.CART_ITEMS, cartItems);
stateManager.set(STATE_KEYS.CART_TOTAL, total);

// Obter estado
const cartItems = stateManager.get(STATE_KEYS.CART_ITEMS);

// Subscribir para mudanças
const unsubscribe = stateManager.subscribe(
  STATE_KEYS.CART_ITEMS,
  (newValue, oldValue) => {
    console.log("Carrinho atualizado:", newValue);
    updateUI(newValue);
  }
);

// Usar Event Bus para comunicação
const eventBus = stateManager.getEventBus();

// Emitir evento
eventBus.emit(STATE_EVENTS.CART_UPDATED, {
  items: cartItems,
  total: total,
});

// Escutar evento
eventBus.on(STATE_EVENTS.CART_UPDATED, (data) => {
  console.log("Carrinho atualizado via evento:", data);
  updateCartBadge(data.items.length);
});

// Limpar subscription quando não precisar mais
unsubscribe();
```

### Chaves de Estado Padronizadas

Use as chaves definidas em `STATE_KEYS`:

- `CART_ITEMS`, `CART_TOTAL` - Carrinho
- `USER`, `TOKEN`, `IS_AUTHENTICATED` - Autenticação
- `PRODUCTS`, `CATEGORIES` - Produtos e categorias
- `LOADING`, `ERROR` - Estado da UI

### Eventos Padronizados

Use os eventos definidos em `STATE_EVENTS`:

- `CART_UPDATED`, `CART_ITEM_ADDED`, `CART_ITEM_REMOVED`
- `USER_LOGGED_IN`, `USER_LOGGED_OUT`
- `PRODUCTS_LOADED`, `PRODUCTS_UPDATED`

### Boas Práticas

- ✅ **SEMPRE** limpe subscriptions quando não precisar mais
- ✅ Use eventos padronizados quando possível
- ✅ Mantenha estado mínimo (não duplique dados)
- ❌ **NÃO** armazene referências DOM no estado
- ❌ **NÃO** use estado para dados temporários locais

---

## Renderização de Listas

### Quando Usar

Use renderização incremental para:

- Listas com mais de 50 itens
- Listas que são atualizadas frequentemente
- Listas que causam lag na UI

### Exemplo de Uso

```javascript
import { renderList } from "../utils/dom-renderer.js";
import { renderListInChunks } from "../utils/virtual-scroll.js";

// Listas pequenas (< 50 itens) - renderização direta
function renderSmallList(items) {
  const container = document.getElementById("items-list");

  renderList(
    container,
    items,
    (item, index) => `<div>${item.name}</div>`,
    (item, index) => item.id // Chave única
  );
}

// Listas grandes (> 50 itens) - renderização incremental
async function renderLargeList(items) {
  const container = document.getElementById("items-list");

  await renderListInChunks(
    container,
    items,
    (item, index) => `<div>${item.name}</div>`,
    {
      chunkSize: 20, // Renderizar 20 itens por vez
      keyFn: (item, index) => item.id,
    }
  );
}
```

### Boas Práticas

- ✅ **SEMPRE** forneça uma função de chave única
- ✅ Use `renderList` para listas pequenas
- ✅ Use `renderListInChunks` para listas grandes
- ❌ **NÃO** renderize listas grandes de uma vez
- ❌ **NÃO** esqueça de fornecer chave única

---

## Event Delegation

### Quando Usar

Use event delegation para:

- Elementos dinâmicos (adicionados/removidos frequentemente)
- Múltiplos elementos com o mesmo handler
- Prevenir memory leaks

### Exemplo de Uso

```javascript
import { delegate } from "../utils/performance-utils.js";

// Event delegation para elementos dinâmicos
let cleanupDelegates = [];

function setupEventDelegation() {
  const container = document.getElementById("items-container");

  // Limpar delegations anteriores
  cleanupDelegates.forEach((cleanup) => cleanup());
  cleanupDelegates = [];

  // Delegation para botões de remover
  const cleanupRemove = delegate(
    container,
    "click",
    ".btn-remove",
    (e, target) => {
      const itemId = target.dataset.itemId;
      removeItem(itemId);
    }
  );
  cleanupDelegates.push(cleanupRemove);

  // Delegation para botões de editar
  const cleanupEdit = delegate(container, "click", ".btn-edit", (e, target) => {
    const itemId = target.dataset.itemId;
    editItem(itemId);
  });
  cleanupDelegates.push(cleanupEdit);
}

// Limpar quando necessário
function cleanup() {
  cleanupDelegates.forEach((cleanup) => cleanup());
  cleanupDelegates = [];
}
```

### Boas Práticas

- ✅ **SEMPRE** limpe delegations quando não precisar mais
- ✅ Use event delegation para elementos dinâmicos
- ✅ Armazene funções de cleanup para limpeza posterior
- ❌ **NÃO** adicione listeners diretamente em elementos dinâmicos
- ❌ **NÃO** esqueça de limpar delegations

---

## Sanitização de HTML

### Quando Usar

**SEMPRE** sanitize dados antes de inserir no DOM:

- Dados de API
- Inputs do usuário
- Conteúdo dinâmico

### Exemplo de Uso

```javascript
import {
  escapeHTML,
  escapeAttribute,
  sanitizeURL,
  createSafeElement,
} from "../utils/html-sanitizer.js";

// Escapar HTML em texto
function renderProductName(name) {
  return `<h2>${escapeHTML(name)}</h2>`;
}

// Escapar atributos HTML
function renderProductImage(imageUrl, alt) {
  const safeUrl = sanitizeURL(imageUrl);
  const safeAlt = escapeAttribute(alt);
  return `<img src="${safeUrl}" alt="${safeAlt}">`;
}

// Criar elemento seguro
function createProductCard(product) {
  const card = createSafeElement("div", {
    class: "product-card",
    "data-id": product.id.toString(),
  });

  card.innerHTML = `
    <h3>${escapeHTML(product.name)}</h3>
    <p>${escapeHTML(product.description)}</p>
  `;

  return card;
}
```

### Boas Práticas

- ✅ **SEMPRE** sanitize dados antes de inserir no DOM
- ✅ Use `escapeHTML` para texto
- ✅ Use `escapeAttribute` para atributos
- ✅ Use `sanitizeURL` para URLs
- ❌ **NUNCA** use `innerHTML` com dados não sanitizados
- ❌ **NUNCA** confie em dados da API sem sanitizar

---

## Validação de Inputs

### Quando Usar

Use os validators centralizados para:

- Formulários de cadastro/login
- Inputs de dados sensíveis (CPF, CNPJ, email)
- Validação consistente em toda a aplicação

### Exemplo de Uso

```javascript
import {
  validateEmail,
  validatePhone,
  validateCPF,
  validateCNPJ,
  validatePassword,
  validateBirthDate,
  applyFieldValidation,
  clearFieldValidation,
} from "../utils/validators.js";

// Validar campo individual
function validateEmailField(emailInput) {
  const email = emailInput.value.trim();
  const isValid = validateEmail(email);

  applyFieldValidation(emailInput, isValid, {
    errorMessage: "Email inválido",
  });

  return isValid;
}

// Validar formulário completo
function validateForm() {
  const emailInput = document.getElementById("email");
  const phoneInput = document.getElementById("phone");
  const cpfInput = document.getElementById("cpf");

  const isEmailValid = validateEmailField(emailInput);
  const isPhoneValid = validatePhone(phoneInput.value);
  const isCPFValid = validateCPF(cpfInput.value);

  if (!isEmailValid) {
    applyFieldValidation(emailInput, false, {
      errorMessage: "Email inválido",
    });
  }

  if (!isPhoneValid) {
    applyFieldValidation(phoneInput, false, {
      errorMessage: "Telefone inválido",
    });
  }

  if (!isCPFValid) {
    applyFieldValidation(cpfInput, false, {
      errorMessage: "CPF inválido",
    });
  }

  return isEmailValid && isPhoneValid && isCPFValid;
}

// Limpar validação
function clearValidation() {
  clearFieldValidation(document.getElementById("email"));
  clearFieldValidation(document.getElementById("phone"));
  clearFieldValidation(document.getElementById("cpf"));
}
```

### Boas Práticas

- ✅ **SEMPRE** valide no cliente E no servidor
- ✅ Use validators centralizados para consistência
- ✅ Forneça feedback visual ao usuário
- ✅ Limpe validação quando necessário
- ❌ **NÃO** confie apenas em validação do cliente
- ❌ **NÃO** crie validators locais duplicados

---

## Tratamento de Erros de Rede

### Quando Usar

O tratamento de erros de rede é automático em `apiRequest()`, mas você pode customizar:

```javascript
import { apiRequest } from "../api/api.js";

// Requisição com timeout customizado
const response = await apiRequest("/api/products", {
  method: "GET",
  timeout: 60000, // 60 segundos
  maxRetries: 5,
});

// Requisição sem retry (ex: login)
const loginResponse = await apiRequest("/api/login", {
  method: "POST",
  body: { email, password },
  skipRetry: true, // Não tentar novamente em caso de erro
});
```

### Tratamento de Erros

```javascript
try {
  const response = await apiRequest("/api/products");
  // Usar response
} catch (error) {
  // Erro já está classificado
  if (error.errorType === "timeout") {
    showError("A requisição demorou muito. Tente novamente.");
  } else if (error.errorType === "unauthorized") {
    // Redirecionar para login
    window.location.href = "/login";
  } else {
    // Usar mensagem amigável do erro
    showError(error.userMessage || "Erro desconhecido");
  }
}
```

### Boas Práticas

- ✅ **SEMPRE** trate erros de requisições
- ✅ Use `userMessage` para mensagens ao usuário
- ✅ Verifique `errorType` para ações específicas
- ✅ Use `skipRetry` para operações que não devem ser retentadas
- ❌ **NÃO** ignore erros de rede
- ❌ **NÃO** mostre mensagens técnicas ao usuário

---

## Code Splitting

### Quando Usar

O code splitting é automático baseado na página. Para carregar módulos sob demanda:

```javascript
import { loadFeature, loadAdminFeature } from "../utils/code-splitter.js";

// Carregar feature completa
await loadFeature("products");

// Carregar feature admin (verifica permissões automaticamente)
await loadAdminFeature("admin_products");

// Verificar se módulo já foi carregado
import { isModuleLoaded } from "../utils/code-splitter.js";
if (!isModuleLoaded("ui/admin/produtos-gerenciamento.js")) {
  await loadAdminFeature("admin_products");
}
```

### Adicionar Nova Feature

Edite `code-splitter.js`:

```javascript
const FEATURE_MODULES = {
  // ... features existentes

  minha_feature: {
    modules: ["ui/minha-feature.js"],
    public: true, // ou false se requer autenticação
    requires: ["products"], // features que devem ser carregadas antes
  },
};
```

### Boas Práticas

- ✅ Use code splitting para módulos grandes
- ✅ Carregue módulos admin apenas quando necessário
- ✅ Defina dependências corretamente
- ❌ **NÃO** carregue módulos admin em páginas públicas
- ❌ **NÃO** esqueça de definir dependências

---

## Problemas Comuns e Soluções

### 1. Cache não está sendo invalidado

**Sintomas:**

- Dados antigos aparecendo após atualização
- Mudanças não refletem na UI

**Solução:**

```javascript
// Certifique-se de invalidar cache após atualizações
cacheManager.invalidate(CACHE_KEYS.products);
cacheManager.invalidate(CACHE_KEYS.product(productId));

// Ou limpar todo o cache se necessário
cacheManager.clear();
```

### 2. Memory Leaks com Event Listeners

**Sintomas:**

- Performance degrada ao longo do tempo
- Múltiplos eventos sendo disparados

**Solução:**

```javascript
// Use event delegation e limpe quando necessário
let cleanupDelegates = [];

function setupListeners() {
  // Limpar anteriores
  cleanupDelegates.forEach((cleanup) => cleanup());
  cleanupDelegates = [];

  // Adicionar novos
  const cleanup = delegate(container, "click", ".btn", handler);
  cleanupDelegates.push(cleanup);
}

// Limpar quando não precisar mais
function cleanup() {
  cleanupDelegates.forEach((cleanup) => cleanup());
  cleanupDelegates = [];
}
```

### 3. Estado não sincronizado entre módulos

**Sintomas:**

- Mudanças em um módulo não refletem em outros
- Dados inconsistentes

**Solução:**

```javascript
// Use stateManager para estado compartilhado
stateManager.set(STATE_KEYS.CART_ITEMS, items);

// Emitir evento para notificar outros módulos
stateManager.getEventBus().emit(STATE_EVENTS.CART_UPDATED, { items });

// Em outros módulos, escutar eventos
stateManager.getEventBus().on(STATE_EVENTS.CART_UPDATED, (data) => {
  updateUI(data.items);
});
```

### 4. Renderização lenta de listas grandes

**Sintomas:**

- UI trava ao renderizar muitas listas
- Scroll lag

**Solução:**

```javascript
// Use renderização incremental para listas grandes
import { renderListInChunks } from "../utils/virtual-scroll.js";

await renderListInChunks(container, items, renderItem, {
  chunkSize: 20, // Ajuste conforme necessário
  keyFn: (item) => item.id,
});
```

### 5. XSS Vulnerabilities

**Sintomas:**

- Scripts executando no DOM
- Conteúdo HTML sendo interpretado

**Solução:**

```javascript
// SEMPRE sanitize dados antes de inserir no DOM
import { escapeHTML, escapeAttribute } from "../utils/html-sanitizer.js";

// ❌ ERRADO
element.innerHTML = userInput;

// ✅ CORRETO
element.innerHTML = escapeHTML(userInput);

// Para atributos
element.setAttribute("data-name", escapeAttribute(userInput));
```

### 6. Validação inconsistente

**Sintomas:**

- Validações diferentes em diferentes formulários
- Mensagens de erro inconsistentes

**Solução:**

```javascript
// Use validators centralizados
import {
  validateEmail,
  validatePhone,
  applyFieldValidation,
} from "../utils/validators.js";

// Não crie validators locais
const isValid = validateEmail(emailInput.value);
applyFieldValidation(emailInput, isValid, {
  errorMessage: "Email inválido",
});
```

### 7. Requisições travando ou timeout

**Sintomas:**

- Requisições não completam
- UI trava aguardando resposta

**Solução:**

```javascript
// O apiRequest já tem timeout e retry automático
// Mas você pode customizar:

const response = await apiRequest("/api/data", {
  timeout: 60000, // 60 segundos
  maxRetries: 3,
});

// Trate erros adequadamente
try {
  const response = await apiRequest("/api/data");
} catch (error) {
  if (error.errorType === "timeout") {
    // Ação específica para timeout
  }
}
```

### 8. Módulos não carregando

**Sintomas:**

- Features não funcionam
- Erros de módulo não encontrado

**Solução:**

```javascript
// Verifique se o módulo está no mapeamento de features
// Em code-splitter.js:

const FEATURE_MODULES = {
  minha_feature: {
    modules: ["ui/minha-feature.js"],
    public: true,
  },
};

// Verifique se o caminho está correto
// Para páginas em /pages/, use caminhos relativos: "../js/ui/..."
// Para páginas na raiz, use: "./js/ui/..."
```

### 9. Cache de DOM desatualizado

**Sintomas:**

- Elementos não encontrados
- Referências a elementos removidos

**Solução:**

```javascript
// O dom-cache.js já invalida automaticamente com MutationObserver
// Mas você pode limpar manualmente:

import { domCache } from "../utils/dom-cache.js";

// Limpar cache específico
domCache.clear();

// Ou usar diretamente sem cache se necessário
const element = document.getElementById("my-element");
```

### 10. Debounce/Throttle não funcionando

**Sintomas:**

- Muitas execuções de funções
- Performance degradada em eventos frequentes

**Solução:**

```javascript
import { debounce, throttle } from "../utils/performance-utils.js";

// Debounce para inputs (espera parar de digitar)
const debouncedSearch = debounce((query) => {
  performSearch(query);
}, 300);

input.addEventListener("input", (e) => {
  debouncedSearch(e.target.value);
});

// Throttle para scroll (executa no máximo a cada X ms)
const throttledScroll = throttle(() => {
  updateScrollPosition();
}, 100);

window.addEventListener("scroll", throttledScroll);
```

---

## Checklist de Boas Práticas

Ao desenvolver um novo módulo ou funcionalidade:

- [ ] **Cache**: Dados de API estão sendo cacheados quando apropriado?
- [ ] **Estado**: Estado compartilhado está usando stateManager?
- [ ] **Eventos**: Event delegation está sendo usado para elementos dinâmicos?
- [ ] **Sanitização**: Todos os dados estão sendo sanitizados antes de inserir no DOM?
- [ ] **Validação**: Validações estão usando módulo centralizado?
- [ ] **Erros**: Erros de rede estão sendo tratados adequadamente?
- [ ] **Renderização**: Listas grandes estão usando renderização incremental?
- [ ] **Limpeza**: Event listeners e subscriptions estão sendo limpos?
- [ ] **Performance**: Debounce/throttle estão sendo usados em eventos frequentes?
- [ ] **Code Splitting**: Módulos grandes estão sendo carregados sob demanda?

---

## Recursos Adicionais

- **Documentação de Performance**: `ANALISE_PERFORMANCE_OTIMIZACAO.md`
- **Módulos Utilitários**: `src/js/utils/`
- **Exemplos de Uso**: Ver arquivos existentes como `cesta.js`, `home.js`, `produto.js`

---

## Suporte

Se encontrar problemas não cobertos neste guia:

1. Verifique os exemplos em arquivos existentes
2. Consulte a documentação de cada módulo
3. Verifique o console do navegador para erros
4. Revise o código de módulos similares

---
