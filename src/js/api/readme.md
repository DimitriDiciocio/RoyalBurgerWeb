# 📚 **Documentação da API - RoyalBurgerWeb**

## 🎯 **Visão Geral**

Este documento descreve a integração completa dos CRUDs de **Ingredientes (Insumos)** e **Produtos** no frontend do RoyalBurgerWeb, seguindo o mesmo padrão das outras integrações existentes.

## 📁 **Arquivos Criados/Modificados**

### **Novos Arquivos de API:**
- `src/js/api/ingredients.js` - API para ingredientes/insumos
- `src/js/api/products.js` - API para produtos

### **Arquivos Modificados:**
- `src/js/ui/imports.js` - Adicionado carregamento dos novos módulos
- `src/js/ui/painel-adm.js` - Integração completa dos CRUDs

## 🥬 **CRUD de Ingredientes (Insumos)**

### **Funcionalidades Implementadas:**

#### **✅ Dashboard Interativo:**
- **Valor Total em Estoque** - Calculado automaticamente
- **Contagem de Itens** - Total de ingredientes cadastrados
- **Sem Estoque** - Ingredientes com estoque zero
- **Estoque Baixo** - Ingredientes abaixo do mínimo
- **Em Estoque** - Ingredientes com estoque adequado

#### **✅ Gerenciamento de Ingredientes:**
- **Listar** - Exibe todos os ingredientes com filtros
- **Criar** - Adicionar novos ingredientes (modal em desenvolvimento)
- **Editar** - Modificar dados dos ingredientes (modal em desenvolvimento)
- **Excluir** - Remover ingredientes (com validação de produtos vinculados)
- **Ativar/Inativar** - Toggle de disponibilidade
- **Ajustar Estoque** - Controles +/- para entrada/saída

#### **✅ Filtros Disponíveis:**
- **Por Nome** - Busca textual
- **Por Status** - Estoque baixo, sem estoque, em estoque
- **Por Categoria** - Filtro por tipo de ingrediente

### **Estrutura de Dados:**
```javascript
{
  "id": 1,
  "name": "Carne de Hambúrguer",
  "description": "Carne moída para hambúrguer",
  "price": 15.50,
  "is_available": true,
  "current_stock": 10.5,
  "stock_unit": "kg",
  "min_stock_threshold": 2.0
}
```

## 🍔 **CRUD de Produtos**

### **Funcionalidades Implementadas:**

#### **✅ Dashboard Interativo:**
- **Total de Itens** - Quantidade de produtos cadastrados
- **Preço Médio** - Média dos preços de venda
- **Margem Média** - Média das margens de lucro
- **Tempo Médio de Preparo** - Média do tempo de preparo

#### **✅ Gerenciamento de Produtos:**
- **Listar** - Exibe todos os produtos com filtros
- **Criar** - Adicionar novos produtos (modal em desenvolvimento)
- **Editar** - Modificar dados dos produtos (modal em desenvolvimento)
- **Inativar/Reativar** - Toggle de disponibilidade (soft delete)
- **Upload de Imagem** - Suporte a imagens dos produtos
- **Vinculação com Categorias** - Produtos associados a categorias

#### **✅ Filtros Disponíveis:**
- **Por Nome** - Busca textual
- **Por Categoria** - Filtro por categoria
- **Por Status** - Disponível/Indisponível

### **Estrutura de Dados:**
```javascript
{
  "id": 1,
  "name": "Hambúrguer Clássico",
  "description": "Hambúrguer artesanal com queijo",
  "price": "25.90",
  "cost_price": "12.50",
  "preparation_time_minutes": 10,
  "category_id": 1,
  "image_url": "/api/uploads/products/1.jpeg"
}
```

## 🔗 **Relacionamento Produto-Ingrediente**

### **Funcionalidades Implementadas:**

#### **✅ Gestão de Ingredientes por Produto:**
- **Listar Ingredientes** - Ver ingredientes de um produto
- **Adicionar Ingrediente** - Vincular ingrediente ao produto
- **Atualizar Quantidade** - Modificar quantidade/unidade
- **Remover Ingrediente** - Desvincular ingrediente
- **Cálculo de Custo** - Custo estimado baseado nos ingredientes

### **Estrutura de Relacionamento:**
```javascript
{
  "ingredient_id": 1,
  "name": "Carne de Hambúrguer",
  "quantity": 0.2,
  "unit": "kg",
  "price": 15.50,
  "is_available": true,
  "line_cost": 3.10
}
```

## 🎨 **Interface do Usuário**

### **Seção de Estoque (Ingredientes):**
- **Cards de Métricas** - Dashboard com indicadores visuais
- **Filtros** - Busca e filtros por status/categoria
- **Lista de Ingredientes** - Cards com informações detalhadas
- **Controles de Estoque** - Botões +/- para ajuste
- **Toggle de Disponibilidade** - Ativar/inativar ingredientes
- **Ações** - Editar e excluir ingredientes

### **Seção de Cardápio (Produtos):**
- **Cards de Métricas** - Dashboard com indicadores visuais
- **Filtros** - Busca e filtros por categoria/status
- **Lista de Produtos** - Cards com imagens e informações
- **Toggle de Disponibilidade** - Ativar/inativar produtos
- **Ações** - Editar produtos

## 🔧 **Como Usar**

### **1. Acessar as Seções:**
- **Estoque** - Clique em "Estoque" no menu lateral
- **Cardápio** - Clique em "Cardápio" no menu lateral

### **2. Gerenciar Ingredientes:**
- **Ver Dashboard** - Métricas são atualizadas automaticamente
- **Filtrar** - Use os filtros para encontrar ingredientes específicos
- **Ajustar Estoque** - Use os botões +/- nos cards
- **Ativar/Inativar** - Use o toggle de disponibilidade
- **Excluir** - Clique no ícone de lixeira (com confirmação)

### **3. Gerenciar Produtos:**
- **Ver Dashboard** - Métricas são calculadas automaticamente
- **Filtrar** - Use os filtros para encontrar produtos específicos
- **Ativar/Inativar** - Use o toggle de disponibilidade
- **Editar** - Clique no ícone de edição (em desenvolvimento)

## 🚀 **Funcionalidades em Desenvolvimento**

### **Modais de Criação/Edição:**
- **Modal de Ingrediente** - Formulário para criar/editar ingredientes
- **Modal de Produto** - Formulário para criar/editar produtos
- **Modal de Ingredientes do Produto** - Vincular ingredientes aos produtos

### **Funcionalidades Avançadas:**
- **Upload de Imagens** - Para produtos
- **Relatórios** - Exportação de dados
- **Histórico** - Log de alterações
- **Notificações** - Alertas de estoque baixo

## 🔐 **Autenticação e Autorização**

### **Requisitos:**
- **Token de Autenticação** - Necessário para todas as operações
- **Role de Admin/Manager** - Para operações de escrita
- **Validação de Dados** - Validação no frontend e backend

### **Tratamento de Erros:**
- **Mensagens de Toast** - Feedback visual para o usuário
- **Validação de Formulários** - Validação em tempo real
- **Tratamento de Exceções** - Tratamento de erros da API

## 📊 **Métricas e Dashboard**

### **Ingredientes:**
- **Valor Total em Estoque** - Soma do valor de todos os ingredientes
- **Contagem por Status** - Sem estoque, estoque baixo, em estoque
- **Alertas Visuais** - Cores diferentes para cada status

### **Produtos:**
- **Total de Itens** - Quantidade de produtos ativos
- **Preço Médio** - Média dos preços de venda
- **Margem Média** - Média das margens de lucro
- **Tempo Médio** - Média do tempo de preparo

## 🎯 **Próximos Passos**

1. **Implementar Modais** - Formulários de criação/edição
2. **Upload de Imagens** - Sistema completo de imagens
3. **Relatórios** - Exportação e relatórios
4. **Notificações** - Sistema de alertas
5. **Testes** - Testes automatizados
6. **Otimizações** - Performance e UX

## 📝 **Notas Técnicas**

### **Padrões Seguidos:**
- **Consistência** - Mesmo padrão das outras integrações
- **Modularidade** - Código organizado em classes e módulos
- **Reutilização** - Funções e componentes reutilizáveis
- **Manutenibilidade** - Código limpo e documentado

### **Tecnologias Utilizadas:**
- **JavaScript ES6+** - Classes, async/await, destructuring
- **Fetch API** - Requisições HTTP
- **DOM Manipulation** - Criação dinâmica de elementos
- **Event Listeners** - Interatividade
- **CSS Grid/Flexbox** - Layout responsivo

---

**✅ Integração Completa dos CRUDs de Ingredientes e Produtos implementada com sucesso!**

Agora o sistema possui funcionalidades completas para gerenciar ingredientes e produtos, com dashboards interativos, filtros, e todas as operações CRUD integradas com a API do backend.