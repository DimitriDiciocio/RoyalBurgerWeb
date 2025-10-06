/**
 * Painel Administrativo - Sistema Modular
 * 
 * Este arquivo implementa um sistema modular e escalável para o painel administrativo,
 * seguindo princípios de Clean Code e boas práticas de desenvolvimento.
 * 
 * @author Royal Burger Team
 * @version 1.0.0
 */

import { getStoredUser } from '../api/api.js';
import { setFlashMessage, showToast, showActionModal, showConfirm } from './alerts.js';

// ============================================================================
// CONSTANTES E CONFIGURAÇÕES
// ============================================================================

const CONFIG = {
    STORAGE_KEYS: {
        ACTIVE_SECTION: 'activePanelSection',
        USER_PREFERENCES: 'adminPanelPreferences'
    },
    SELECTORS: {
        NAVIGATION: '.navegacao__item',
        SECTIONS: 'section[id^="secao-"]',
        ACTIVE_NAV: '.navegacao__item--active'
    },
    DEFAULT_SECTION: 'secao-dashboard',
    ADMIN_ROLES: ['admin', 'administrator', 'manager', 'gerente']
};

// Configuração específica para seção de estoque
const ESTOQUE_CONFIG = {
    sectionId: 'secao-estoque',
    navId: 'nav-estoque',
    selectors: {
        searchInput: '#busca-ingrediente',
        categoryFilter: '#categoria-estoque',
        statusFilter: '#status-estoque',
        newItemButton: '#secao-estoque .adicionar',
        ingredientCards: '.card-ingrediente',
        editButtons: '.card-ingrediente .editar',
        toggleSwitches: '.card-ingrediente .toggle input',
        quantityButtons: '.card-ingrediente .btn-quantidade',
        metricCards: '.relata .quadro'
    }
};

// Sistema de dados mock para ingredientes
class IngredientDataManager {
    constructor() {
        this.ingredients = [
            {
                id: 1,
                nome: 'Carne Bovina',
                fornecedor: 'Fornecedor A',
                categoria: 'carnes',
                custo: 10.50,
                unidade: 'kg',
                min: 20,
                max: 100,
                atual: 75,
                ativo: true,
                ultimaAtualizacao: '2025-01-01'
            },
            {
                id: 2,
                nome: 'Alface',
                fornecedor: 'Fornecedor B',
                categoria: 'vegetais',
                custo: 2.30,
                unidade: 'kg',
                min: 5,
                max: 30,
                atual: 15,
                ativo: true,
                ultimaAtualizacao: '2025-01-01'
            },
            {
                id: 3,
                nome: 'Tomate',
                fornecedor: 'Fornecedor C',
                categoria: 'vegetais',
                custo: 3.20,
                unidade: 'kg',
                min: 10,
                max: 50,
                atual: 0,
                ativo: true,
                ultimaAtualizacao: '2025-01-01'
            }
        ];
    }

    getAllIngredients() {
        return this.ingredients;
    }

    getIngredientById(id) {
        return this.ingredients.find(ing => ing.id === id);
    }

    addIngredient(ingredientData) {
        const newId = Math.max(...this.ingredients.map(ing => ing.id)) + 1;
        const newIngredient = {
            id: newId,
            ...ingredientData,
            atual: 0,
            ativo: true,
            ultimaAtualizacao: new Date().toISOString().split('T')[0]
        };
        this.ingredients.push(newIngredient);
        return newIngredient;
    }

    updateIngredient(id, ingredientData) {
        const index = this.ingredients.findIndex(ing => ing.id === id);
        if (index !== -1) {
            this.ingredients[index] = {
                ...this.ingredients[index],
                ...ingredientData,
                ultimaAtualizacao: new Date().toISOString().split('T')[0]
            };
            return this.ingredients[index];
        }
        return null;
    }

    updateIngredientQuantity(id, newQuantity) {
        const ingredient = this.getIngredientById(id);
        if (ingredient) {
            ingredient.atual = Math.max(0, newQuantity);
            ingredient.ultimaAtualizacao = new Date().toISOString().split('T')[0];
            return ingredient;
        }
        return null;
    }

    toggleIngredientStatus(id) {
        const ingredient = this.getIngredientById(id);
        if (ingredient) {
            ingredient.ativo = !ingredient.ativo;
            return ingredient;
        }
        return null;
    }

    getMetrics() {
        const total = this.ingredients.reduce((sum, ing) => sum + (ing.atual * ing.custo), 0);
        const semEstoque = this.ingredients.filter(ing => ing.atual === 0).length;
        const estoqueBaixo = this.ingredients.filter(ing => ing.atual > 0 && ing.atual <= ing.min).length;
        const emEstoque = this.ingredients.filter(ing => ing.atual > ing.min).length;

        return {
            valorTotal: total,
            semEstoque,
            estoqueBaixo,
            emEstoque,
            totalItens: this.ingredients.length
        };
    }
}

// Instância global do gerenciador de dados
const ingredientDataManager = new IngredientDataManager();

// ============================================================================
// SISTEMA DE GERENCIAMENTO DE SEÇÕES
// ============================================================================

/**
 * Classe responsável pelo gerenciamento das seções do painel
 */
class SectionManager {
    constructor() {
        this.activeSection = null;
        this.sectionHandlers = new Map();
        this.init();
    }

    /**
     * Inicializa o gerenciador de seções
     */
    init() {
        this.registerDefaultSections();
        this.setupNavigation();
        this.loadActiveSection();
    }

    /**
     * Registra as seções padrão do sistema
     */
    registerDefaultSections() {
        const sections = [
            { id: 'secao-dashboard', handler: null },
            { id: 'secao-pedidos', handler: null },
            { id: 'secao-venda', handler: null },
            { id: 'secao-cardapio', handler: () => new CardapioManager() },
            { id: 'secao-estoque', handler: () => new EstoqueManager() },
            { id: 'secao-relatorios', handler: null },
            { id: 'secao-finaceiro', handler: null },
            { id: 'secao-funcionarios', handler: () => new FuncionarioManager() },
            { id: 'secao-configuracoes', handler: null }
        ];

        sections.forEach(section => {
            this.sectionHandlers.set(section.id, section.handler);
        });
    }

    /**
     * Configura os event listeners de navegação
     */
    setupNavigation() {
        const navigationItems = document.querySelectorAll(CONFIG.SELECTORS.NAVIGATION);

        navigationItems.forEach(item => {
            item.addEventListener('click', (event) => {
                event.preventDefault();
                const sectionId = this.getSectionIdFromNav(item.id);
                this.showSection(sectionId);
            });
        });
    }

    /**
     * Converte ID de navegação para ID de seção
     * @param {string} navId - ID do item de navegação
     * @returns {string} ID da seção correspondente
     */
    getSectionIdFromNav(navId) {
        return navId.replace('nav-', 'secao-');
    }

    /**
     * Exibe uma seção específica
     * @param {string} sectionId - ID da seção a ser exibida
     */
    showSection(sectionId) {
        try {
            this.hideAllSections();
            this.showTargetSection(sectionId);
            this.updateNavigation(sectionId);
            this.saveActiveSection(sectionId);
            this.initializeSectionHandler(sectionId);

            this.activeSection = sectionId;
            console.log(`Seção ativada: ${sectionId}`);
        } catch (error) {
            console.error(`Erro ao mostrar seção ${sectionId}:`, error);
            this.handleSectionError(sectionId, error);
        }
    }

    /**
     * Esconde todas as seções
     */
    hideAllSections() {
        const sections = document.querySelectorAll(CONFIG.SELECTORS.SECTIONS);
        sections.forEach(section => {
            section.style.display = 'none';
        });
    }

    /**
     * Exibe a seção alvo
     * @param {string} sectionId - ID da seção
     */
    showTargetSection(sectionId) {
        const targetSection = document.getElementById(sectionId);
        if (!targetSection) {
            throw new Error(`Seção ${sectionId} não encontrada`);
        }
        targetSection.style.display = 'flex';
    }

    /**
     * Atualiza a navegação para refletir a seção ativa
     * @param {string} sectionId - ID da seção ativa
     */
    updateNavigation(sectionId) {
        // Remove classe ativa de todos os itens
        const navItems = document.querySelectorAll(CONFIG.SELECTORS.NAVIGATION);
        navItems.forEach(item => item.classList.remove('navegacao__item--active'));

        // Adiciona classe ativa ao item correspondente
        const navId = sectionId.replace('secao-', 'nav-');
        const activeNavItem = document.getElementById(navId);
        if (activeNavItem) {
            activeNavItem.classList.add('navegacao__item--active');
        }
    }

    /**
     * Salva a seção ativa no localStorage
     * @param {string} sectionId - ID da seção ativa
     */
    saveActiveSection(sectionId) {
        localStorage.setItem(CONFIG.STORAGE_KEYS.ACTIVE_SECTION, sectionId);
    }

    /**
     * Inicializa o handler específico da seção
     * @param {string} sectionId - ID da seção
     */
    initializeSectionHandler(sectionId) {
        const handler = this.sectionHandlers.get(sectionId);
        if (handler && typeof handler === 'function') {
            try {
                // Emitir evento antes da inicialização
                eventSystem.emit('section:beforeInit', { sectionId });

                const manager = handler();
                if (manager && typeof manager.init === 'function') {
                    manager.init();
                }

                // Emitir evento após a inicialização
                eventSystem.emit('section:afterInit', { sectionId });
            } catch (error) {
                console.error(`Erro ao inicializar handler da seção ${sectionId}:`, error);
                eventSystem.emit('section:initError', { sectionId, error });
            }
        }
    }

    /**
     * Carrega a seção ativa do localStorage ou usa padrão
     */
    loadActiveSection() {
        let sectionToShow = CONFIG.DEFAULT_SECTION;

        try {
            const savedSection = localStorage.getItem(CONFIG.STORAGE_KEYS.ACTIVE_SECTION);

            if (savedSection && document.getElementById(savedSection)) {
                sectionToShow = savedSection;
            } else if (savedSection) {
                localStorage.removeItem(CONFIG.STORAGE_KEYS.ACTIVE_SECTION);
                console.warn(`Seção salva "${savedSection}" não encontrada. Usando padrão.`);
            } else {
                // Verifica se há seleção inicial no HTML
                const initialSelection = document.querySelector(CONFIG.SELECTORS.ACTIVE_NAV);
                if (initialSelection) {
                    sectionToShow = this.getSectionIdFromNav(initialSelection.id);
                }
            }
        } catch (error) {
            console.error('Erro ao carregar seção ativa:', error);
        }

        this.showSection(sectionToShow);
    }

    /**
     * Trata erros de seção
     * @param {string} sectionId - ID da seção com erro
     * @param {Error} error - Erro ocorrido
     */
    handleSectionError(sectionId, error) {
        setFlashMessage({
            type: 'error',
            title: 'Erro de Navegação',
            message: `Não foi possível carregar a seção ${sectionId}. Tentando carregar o dashboard.`
        });

        // Fallback para dashboard
        if (sectionId !== CONFIG.DEFAULT_SECTION) {
            this.showSection(CONFIG.DEFAULT_SECTION);
        }
    }

    /**
     * Registra uma nova seção no sistema
     * @param {string} sectionId - ID da seção
     * @param {Function} handler - Função de inicialização da seção
     */
    registerSection(sectionId, handler) {
        this.sectionHandlers.set(sectionId, handler);
    }
}

// ============================================================================
// SISTEMA DE AUTENTICAÇÃO E PERMISSÕES
// ============================================================================

/**
 * Classe responsável pela verificação de permissões
 */
class AuthManager {
    /**
     * Verifica se o usuário tem permissões de administrador
     * @returns {boolean} True se tem permissão
     */
    static verifyAdminPermissions() {
        try {
            const user = getStoredUser();

            if (!user) {
                this.handleAuthError('Você precisa estar logado para acessar esta página.');
                return false;
            }

            const userRole = this.normalizeUserRole(user);
            const hasPermission = CONFIG.ADMIN_ROLES.includes(userRole);

            if (!hasPermission) {
                this.handleAuthError('Apenas administradores e gerentes podem acessar esta página.');
                return false;
            }

            return true;
        } catch (error) {
            console.error('Erro ao verificar permissões:', error);
            this.handleAuthError('Não foi possível verificar suas permissões. Tente fazer login novamente.');
            return false;
        }
    }

    /**
     * Normaliza o role do usuário
     * @param {Object} user - Objeto do usuário
     * @returns {string} Role normalizado
     */
    static normalizeUserRole(user) {
        const role = user.role || user.user_role || user.type || user.user_type || user.profile;
        return String(role || '').toLowerCase();
    }

    /**
     * Trata erros de autenticação
     * @param {string} message - Mensagem de erro
     */
    static handleAuthError(message) {
        setFlashMessage({
            type: 'error',
            title: 'Acesso Restrito',
            message: message
        });
        window.location.href = '../../index.html';
    }
}

// ============================================================================
// GERENCIADOR DE CARDÁPIO
// ============================================================================

/**
 * Classe responsável pelo gerenciamento da seção de cardápio
 */
class CardapioManager {
    constructor() {
        this.selectors = {
            toggles: '.card-produto .toggle input',
            editButtons: '.card-produto .editar',
            searchInput: '#busca-produto',
            categoryFilter: '#categoria-filtro',
            statusFilter: '#status-filtro',
            newItemButton: '#secao-cardapio .adicionar',
            productCards: '.card-produto',
            statusElements: '.card-produto .status'
        };

        this.init();
    }

    /**
     * Inicializa o gerenciador de cardápio
     */
    init() {
        this.setupToggleHandlers();
        this.setupEditHandlers();
        this.setupSearchHandlers();
        this.setupFilterHandlers();
        this.setupNewItemHandler();
        this.setupStatusHandlers();
    }

    /**
     * Configura os handlers dos toggles de disponibilidade
     */
    setupToggleHandlers() {
        const toggles = document.querySelectorAll(this.selectors.toggles);

        toggles.forEach(toggle => {
            toggle.addEventListener('change', (event) => {
                this.handleToggleChange(event.target);
            });
        });
    }

    /**
     * Trata mudança no toggle de disponibilidade
     * @param {HTMLInputElement} toggle - Elemento toggle
     */
    handleToggleChange(toggle) {
        const card = toggle.closest('.card-produto');
        const statusElement = card.querySelector('.status');
        const productName = card.querySelector('h3').textContent;

        if (toggle.checked) {
            statusElement.innerHTML = '<i class="fa-solid fa-eye"></i> Disponível';
            statusElement.className = 'status disponivel';
        } else {
            statusElement.innerHTML = '<i class="fa-solid fa-eye-slash"></i> Indisponível';
            statusElement.className = 'status indisponivel';
        }

        // Emitir evento de mudança de dados
        eventSystem.emit('data:changed', {
            type: 'product_availability',
            productName: productName,
            available: toggle.checked
        });

        // TODO: Integrar com API para salvar status
        // Status do produto alterado
    }

    /**
     * Configura os handlers dos botões de editar
     */
    setupEditHandlers() {
        const editButtons = document.querySelectorAll(this.selectors.editButtons);

        editButtons.forEach(button => {
            button.addEventListener('click', (event) => {
                this.handleEditClick(event.target);
            });
        });
    }

    /**
     * Trata clique no botão de editar
     * @param {HTMLElement} button - Botão clicado
     */
    handleEditClick(button) {
        const card = button.closest('.card-produto');
        const productName = card.querySelector('h3').textContent;

        // Emitir evento de edição
        eventSystem.emit('product:edit', {
            productName: productName,
            card: card
        });

        // Abrir modal de edição com dados do produto
        const productData = this.extractProductData(card);
        this.openModal('edit', productData);
    }

    /**
     * Extrai dados do produto do card
     * @param {HTMLElement} card - Card do produto
     * @returns {Object} Dados do produto
     */
    extractProductData(card) {
        const nome = card.querySelector('h3').textContent;
        const descricao = card.querySelector('.descricao-produto').textContent;
        const categoria = card.querySelector('.categoria').textContent;
        const preco = card.querySelector('.valor.preco').textContent;
        const tempo = card.querySelector('.detalhe:nth-child(3) .valor').textContent;

        return {
            nome,
            descricao,
            categoria: categoria.toLowerCase(),
            preco,
            tempo: tempo.replace('min', '').trim()
        };
    }

    /**
     * Configura os handlers de busca
     */
    setupSearchHandlers() {
        const searchInput = document.querySelector(this.selectors.searchInput);

        if (searchInput) {
            searchInput.addEventListener('input', (event) => {
                this.handleSearch(event.target.value);
            });
        }
    }

    /**
     * Trata busca de produtos
     * @param {string} searchTerm - Termo de busca
     */
    handleSearch(searchTerm) {
        const cards = document.querySelectorAll(this.selectors.productCards);
        const normalizedTerm = searchTerm.toLowerCase();

        cards.forEach(card => {
            const productName = card.querySelector('h3').textContent.toLowerCase();
            const description = card.querySelector('.descricao-produto').textContent.toLowerCase();

            const matches = productName.includes(normalizedTerm) || description.includes(normalizedTerm);
            card.style.display = matches ? 'block' : 'none';
        });

        // Emitir evento de busca
        eventSystem.emit('search:performed', {
            term: searchTerm,
            results: Array.from(cards).filter(card => card.style.display !== 'none').length
        });
    }

    /**
     * Configura os handlers de filtros
     */
    setupFilterHandlers() {
        const categoryFilter = document.querySelector(this.selectors.categoryFilter);
        const statusFilter = document.querySelector(this.selectors.statusFilter);

        if (categoryFilter) {
            categoryFilter.addEventListener('change', (event) => {
                this.handleCategoryFilter(event.target.value);
            });
        }

        if (statusFilter) {
            statusFilter.addEventListener('change', (event) => {
                this.handleStatusFilter(event.target.value);
            });
        }
    }

    /**
     * Trata filtro por categoria
     * @param {string} category - Categoria selecionada
     */
    handleCategoryFilter(category) {
        const cards = document.querySelectorAll(this.selectors.productCards);

        cards.forEach(card => {
            const cardCategory = card.querySelector('.categoria').textContent.toLowerCase();
            const matches = !category || cardCategory === category;
            card.style.display = matches ? 'block' : 'none';
        });

        // Emitir evento de filtro
        eventSystem.emit('filter:applied', {
            type: 'category',
            value: category
        });
    }

    /**
     * Trata filtro por status
     * @param {string} status - Status selecionado
     */
    handleStatusFilter(status) {
        const cards = document.querySelectorAll(this.selectors.productCards);

        cards.forEach(card => {
            const statusElement = card.querySelector('.status');
            const isAvailable = statusElement.classList.contains('disponivel');

            let matches = true;
            if (status) {
                matches = (status === 'disponivel' && isAvailable) ||
                    (status === 'indisponivel' && !isAvailable);
            }

            card.style.display = matches ? 'block' : 'none';
        });

        // Emitir evento de filtro
        eventSystem.emit('filter:applied', {
            type: 'status',
            value: status
        });
    }

    /**
     * Configura o handler do botão "Novo Item"
     */
    setupNewItemHandler() {
        const newItemButton = document.querySelector(this.selectors.newItemButton);

        if (newItemButton) {
            newItemButton.addEventListener('click', () => {
                this.handleNewItem();
            });
        }
    }

    /**
     * Configura os handlers para sincronizar toggle com status visual
     */
    setupStatusHandlers() {
        const toggles = document.querySelectorAll(this.selectors.toggles);

        toggles.forEach(toggle => {
            // Sincronizar estado inicial
            this.syncToggleWithStatus(toggle);
        });
    }

    /**
     * Sincroniza o estado do toggle com o status visual
     * @param {HTMLInputElement} toggle - Elemento toggle
     */
    syncToggleWithStatus(toggle) {
        const card = toggle.closest('.card-produto');
        const statusElement = card.querySelector('.status');

        if (statusElement) {
            const isAvailable = statusElement.classList.contains('disponivel');
            toggle.checked = isAvailable;
        }
    }

    /**
     * Trata criação de novo item
     */
    handleNewItem() {
        this.openModal('add');
    }

    /**
     * Abre a modal de produto
     * @param {string} mode - 'add' ou 'edit'
     * @param {Object} productData - Dados do produto (para edição)
     */
    openModal(mode = 'add', productData = null) {
        const modal = document.getElementById('modal-produto');
        const titulo = document.getElementById('titulo-modal');
        const textoBotao = document.getElementById('texto-botao');

        if (mode === 'add') {
            titulo.textContent = 'Adicionar Produto';
            textoBotao.textContent = 'Adicionar item';
            this.clearModal();
        } else if (mode === 'edit' && productData) {
            titulo.textContent = 'Editar Produto';
            textoBotao.textContent = 'Salvar alterações';
            this.populateModal(productData);
        }

        modal.style.display = 'flex';
        this.setupModalHandlers();
    }

    /**
     * Fecha a modal
     */
    closeModal() {
        const modal = document.getElementById('modal-produto');
        modal.style.display = 'none';
    }

    /**
     * Limpa os campos da modal
     */
    clearModal() {
        // Limpar campos básicos
        const nomeInput = document.getElementById('nome-produto');
        const descricaoInput = document.getElementById('descricao-produto');
        const precoInput = document.getElementById('preco-produto');
        const categoriaSelect = document.getElementById('categoria-produto');
        const tempoInput = document.getElementById('tempo-produto');

        if (nomeInput) nomeInput.value = '';
        if (descricaoInput) descricaoInput.value = '';
        if (precoInput) precoInput.value = '';
        if (categoriaSelect) categoriaSelect.value = '';
        if (tempoInput) tempoInput.value = '';

        // Limpar ingredientes (manter apenas o primeiro)
        const container = document.querySelector('.ingredientes-container');
        if (container) {
            const items = container.querySelectorAll('.ingrediente-item');
            items.forEach((item, index) => {
                if (index > 0) {
                    item.remove();
                } else {
                    // Limpar campos do primeiro ingrediente
                    const select = item.querySelector('select');
                    const quantidadeInput = item.querySelector('input[name*="quantidade"]');
                    const unidadeInput = item.querySelector('input[name*="unidade"]');

                    if (select) select.value = '';
                    if (quantidadeInput) quantidadeInput.value = '';
                    if (unidadeInput) unidadeInput.value = '';
                }
            });
        }
    }

    /**
     * Preenche a modal com dados do produto
     * @param {Object} productData - Dados do produto
     */
    populateModal(productData) {
        const nomeInput = document.getElementById('nome-produto');
        const descricaoInput = document.getElementById('descricao-produto');
        const precoInput = document.getElementById('preco-produto');
        const categoriaSelect = document.getElementById('categoria-produto');
        const tempoInput = document.getElementById('tempo-produto');

        if (nomeInput) nomeInput.value = productData.nome || '';
        if (descricaoInput) descricaoInput.value = productData.descricao || '';
        if (precoInput) precoInput.value = productData.preco || '';
        if (categoriaSelect) categoriaSelect.value = productData.categoria || '';
        if (tempoInput) tempoInput.value = productData.tempo || '';

        // TODO: Implementar preenchimento de ingredientes
    }

    /**
     * Configura os handlers da modal
     */
    setupModalHandlers() {
        // Fechar modal
        document.getElementById('fechar-modal').onclick = () => this.closeModal();
        document.getElementById('cancelar-produto').onclick = () => this.closeModal();

        // Salvar produto
        document.getElementById('salvar-produto').onclick = () => this.saveProduct();

        // Adicionar ingrediente
        const addIngredientBtn = document.querySelector('.btn-adicionar-ingrediente');
        if (addIngredientBtn) {
            addIngredientBtn.onclick = () => this.addIngredient();
        }

        // Remover ingredientes
        document.querySelectorAll('.btn-remover-ingrediente').forEach(btn => {
            btn.onclick = (e) => this.removeIngredient(e.target.closest('.ingrediente-item'));
        });

        // Validações em tempo real
        this.setupRealTimeValidation();
    }

    /**
     * Configura validações em tempo real
     */
    setupRealTimeValidation() {
        // Validação do nome
        const nomeInput = document.getElementById('nome-produto');
        if (nomeInput) {
            nomeInput.addEventListener('input', (e) => {
                this.validateFieldRealTime(e.target, 'nome');
            });
        }

        // Validação da descrição
        const descricaoInput = document.getElementById('descricao-produto');
        if (descricaoInput) {
            descricaoInput.addEventListener('input', (e) => {
                this.validateFieldRealTime(e.target, 'descricao');
            });
        }

        // Validação do preço
        const precoInput = document.getElementById('preco-produto');
        if (precoInput) {
            precoInput.addEventListener('input', (e) => {
                this.formatPrecoInput(e.target);
                this.validateFieldRealTime(e.target, 'preco');
            });
        }

        // Validação do tempo
        const tempoInput = document.getElementById('tempo-produto');
        if (tempoInput) {
            tempoInput.addEventListener('input', (e) => {
                this.validateFieldRealTime(e.target, 'tempo');
            });
        }

        // Validação de ingredientes (será adicionada dinamicamente)
        this.setupIngredientValidation();
    }

    /**
     * Configura validação para ingredientes
     */
    setupIngredientValidation() {
        const container = document.querySelector('.ingredientes-container');
        if (container) {
            // Usar event delegation para ingredientes dinâmicos
            container.addEventListener('input', (e) => {
                if (e.target.name && e.target.name.includes('quantidade')) {
                    this.validateFieldRealTime(e.target, 'quantidade');
                } else if (e.target.name && e.target.name.includes('unidade')) {
                    this.validateFieldRealTime(e.target, 'unidade');
                }
            });
        }
    }

    /**
     * Valida campo em tempo real
     * @param {HTMLElement} input - Elemento input
     * @param {string} type - Tipo de validação
     */
    validateFieldRealTime(input, type) {
        const value = input.value;
        let isValid = true;
        let message = '';

        switch (type) {
            case 'nome':
                if (value.length > 0 && value.length < 2) {
                    isValid = false;
                    message = 'Mínimo 2 caracteres';
                } else if (value.length > 50) {
                    isValid = false;
                    message = 'Máximo 50 caracteres';
                }
                break;

            case 'descricao':
                if (value.length > 0 && value.length < 10) {
                    isValid = false;
                    message = 'Mínimo 10 caracteres';
                } else if (value.length > 200) {
                    isValid = false;
                    message = 'Máximo 200 caracteres';
                }
                break;

            case 'preco':
                if (value.length > 0) {
                    const precoLimpo = value.replace(/R\$\s?/g, '').replace(/,/g, '.').trim();
                    const precoNumero = parseFloat(precoLimpo);
                    if (isNaN(precoNumero) || precoNumero <= 0) {
                        isValid = false;
                        message = 'Valor inválido';
                    } else if (precoNumero > 999.99) {
                        isValid = false;
                        message = 'Máximo R$ 999,99';
                    }
                }
                break;

            case 'tempo':
                if (value.length > 0) {
                    const tempoNumero = parseInt(value);
                    if (isNaN(tempoNumero) || tempoNumero <= 0) {
                        isValid = false;
                        message = 'Valor inválido';
                    } else if (tempoNumero > 120) {
                        isValid = false;
                        message = 'Máximo 120 minutos';
                    }
                }
                break;

            case 'quantidade':
                if (value.length > 0) {
                    const quantidadeNumero = parseFloat(value);
                    if (isNaN(quantidadeNumero) || quantidadeNumero <= 0) {
                        isValid = false;
                        message = 'Valor inválido';
                    } else if (quantidadeNumero > 1000) {
                        isValid = false;
                        message = 'Máximo 1000';
                    }
                }
                break;

            case 'unidade':
                if (value.length > 0) {
                    if (value.length > 10) {
                        isValid = false;
                        message = 'Máximo 10 caracteres';
                    } else if (!/^[a-zA-ZÀ-ÿ]+$/.test(value)) {
                        isValid = false;
                        message = 'Apenas letras';
                    }
                }
                break;
        }

        this.showFieldValidation(input, isValid, message);
    }

    /**
     * Mostra validação do campo
     * @param {HTMLElement} input - Elemento input
     * @param {boolean} isValid - Se é válido
     * @param {string} message - Mensagem de erro
     */
    showFieldValidation(input, isValid, message) {
        // Remover validação anterior
        input.classList.remove('valid', 'invalid');

        // Remover mensagem anterior
        const existingMessage = input.parentNode.querySelector('.validation-message');
        if (existingMessage) {
            existingMessage.remove();
        }

        if (input.value.length > 0) {
            if (isValid) {
                input.classList.add('valid');
            } else {
                input.classList.add('invalid');

                // Adicionar mensagem de erro
                const errorDiv = document.createElement('div');
                errorDiv.className = 'validation-message';
                errorDiv.textContent = message;
                errorDiv.style.cssText = `
                    color: #f44336;
                    font-size: 0.75rem;
                    margin-top: 4px;
                    font-weight: 500;
                `;
                input.parentNode.appendChild(errorDiv);
            }
        }
    }

    /**
     * Formata input de preço
     * @param {HTMLElement} input - Elemento input
     */
    formatPrecoInput(input) {
        let value = input.value.replace(/\D/g, ''); // Remove tudo que não é dígito

        if (value.length > 0) {
            // Adiciona R$ e formata como moeda
            const formatted = (parseInt(value) / 100).toLocaleString('pt-BR', {
                style: 'currency',
                currency: 'BRL'
            });
            input.value = formatted;
        }
    }

    /**
     * Adiciona um novo ingrediente
     */
    addIngredient() {
        const container = document.querySelector('.ingredientes-container');
        const items = container.querySelectorAll('.ingrediente-item');
        const newIndex = items.length + 1;

        const newItem = document.createElement('div');
        newItem.className = 'ingrediente-item';
        newItem.innerHTML = `
            <div class="div-input">
                <label for="ingrediente-${newIndex}">Ingrediente</label>
                <select id="ingrediente-${newIndex}" name="ingrediente-${newIndex}">
                    <option value="">Selecione um ingrediente</option>
                    <option value="pao">Pão</option>
                    <option value="carne">Carne</option>
                    <option value="queijo">Queijo</option>
                    <option value="alface">Alface</option>
                    <option value="tomate">Tomate</option>
                </select>
            </div>
            
            <div class="sep-select ingredientes-quantidade">
                <div class="div-input">
                    <label for="quantidade-${newIndex}">Quantidade</label>
                    <input type="text" id="quantidade-${newIndex}" name="quantidade-${newIndex}" autocomplete="off">
                </div>

                <div class="div-input">
                    <label for="unidade-${newIndex}">Unidade</label>
                    <input type="text" id="unidade-${newIndex}" name="unidade-${newIndex}" autocomplete="off">
                    <!-- fatia, un... -->
                </div>
                <button type="button" class="btn-remover-ingrediente">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
        `;

        container.appendChild(newItem);

        // Adicionar handler para o botão de remover
        newItem.querySelector('.btn-remover-ingrediente').onclick = () => this.removeIngredient(newItem);
    }

    /**
     * Remove um ingrediente
     * @param {HTMLElement} item - Elemento do ingrediente
     */
    removeIngredient(item) {
        const container = document.querySelector('.ingredientes-container');
        const items = container.querySelectorAll('.ingrediente-item');

        // Não permitir remover se for o único ingrediente
        if (items.length > 1) {
            item.remove();
        }
    }

    /**
     * Salva o produto
     */
    saveProduct() {
        const formData = this.getFormData();

        if (this.validateForm(formData)) {
            // Emitir evento de salvamento
            eventSystem.emit('product:save', {
                data: formData,
                timestamp: new Date().toISOString()
            });

            this.closeModal();
            // Produto salvo com sucesso
        }
    }

    /**
     * Obtém os dados do formulário
     * @returns {Object} Dados do formulário
     */
    getFormData() {
        const ingredientes = [];
        document.querySelectorAll('.ingrediente-item').forEach((item, index) => {
            const select = item.querySelector('select');
            const quantidadeInput = item.querySelector('input[name*="quantidade"]');
            const unidadeInput = item.querySelector('input[name*="unidade"]');

            if (select && quantidadeInput && unidadeInput) {
                const ingrediente = select.value;
                const quantidade = quantidadeInput.value;
                const unidade = unidadeInput.value;

                if (ingrediente && quantidade && unidade) {
                    ingredientes.push({
                        ingrediente,
                        quantidade,
                        unidade
                    });
                }
            }
        });

        const nomeInput = document.getElementById('nome-produto');
        const descricaoInput = document.getElementById('descricao-produto');
        const precoInput = document.getElementById('preco-produto');
        const categoriaSelect = document.getElementById('categoria-produto');
        const tempoInput = document.getElementById('tempo-produto');

        return {
            nome: nomeInput ? nomeInput.value : '',
            descricao: descricaoInput ? descricaoInput.value : '',
            preco: precoInput ? precoInput.value : '',
            categoria: categoriaSelect ? categoriaSelect.value : '',
            tempo: tempoInput ? tempoInput.value : '',
            ingredientes: ingredientes
        };
    }

    /**
     * Valida o formulário
     * @param {Object} formData - Dados do formulário
     * @returns {boolean} True se válido
     */
    validateForm(formData) {
        // Validar nome
        if (!this.validateNome(formData.nome)) {
            return false;
        }

        // Validar descrição
        if (!this.validateDescricao(formData.descricao)) {
            return false;
        }

        // Validar preço
        if (!this.validatePreco(formData.preco)) {
            return false;
        }

        // Validar categoria
        if (!this.validateCategoria(formData.categoria)) {
            return false;
        }

        // Validar tempo
        if (!this.validateTempo(formData.tempo)) {
            return false;
        }

        // Validar ingredientes
        if (!this.validateIngredientes(formData.ingredientes)) {
            return false;
        }

        return true;
    }

    /**
     * Valida o nome do produto
     * @param {string} nome - Nome do produto
     * @returns {boolean} True se válido
     */
    validateNome(nome) {
        if (!nome || !nome.trim()) {
            this.showValidationError('Nome do produto é obrigatório');
            return false;
        }

        if (nome.trim().length < 2) {
            this.showValidationError('Nome deve ter pelo menos 2 caracteres');
            return false;
        }

        if (nome.trim().length > 50) {
            this.showValidationError('Nome deve ter no máximo 50 caracteres');
            return false;
        }

        // Verificar se contém apenas letras, números, espaços e caracteres especiais comuns
        const nomeRegex = /^[a-zA-ZÀ-ÿ0-9\s\-'&.()]+$/;
        if (!nomeRegex.test(nome.trim())) {
            this.showValidationError('Nome contém caracteres inválidos');
            return false;
        }

        return true;
    }

    /**
     * Valida a descrição do produto
     * @param {string} descricao - Descrição do produto
     * @returns {boolean} True se válido
     */
    validateDescricao(descricao) {
        if (!descricao || !descricao.trim()) {
            this.showValidationError('Descrição é obrigatória');
            return false;
        }

        if (descricao.trim().length < 10) {
            this.showValidationError('Descrição deve ter pelo menos 10 caracteres');
            return false;
        }

        if (descricao.trim().length > 200) {
            this.showValidationError('Descrição deve ter no máximo 200 caracteres');
            return false;
        }

        return true;
    }

    /**
     * Valida o preço do produto
     * @param {string} preco - Preço do produto
     * @returns {boolean} True se válido
     */
    validatePreco(preco) {
        if (!preco || !preco.trim()) {
            this.showValidationError('Preço é obrigatório');
            return false;
        }

        // Remover R$ e espaços para validação
        const precoLimpo = preco.replace(/R\$\s?/g, '').replace(/,/g, '.').trim();

        // Verificar se é um número válido
        const precoNumero = parseFloat(precoLimpo);
        if (isNaN(precoNumero)) {
            this.showValidationError('Preço deve ser um valor numérico válido');
            return false;
        }

        if (precoNumero <= 0) {
            this.showValidationError('Preço deve ser maior que zero');
            return false;
        }

        if (precoNumero > 999.99) {
            this.showValidationError('Preço deve ser menor que R$ 1.000,00');
            return false;
        }

        // Verificar formato (aceita R$ 0,00 ou 0.00)
        const precoRegex = /^(R\$\s?)?\d{1,3}([.,]\d{2})?$/;
        if (!precoRegex.test(preco.trim())) {
            this.showValidationError('Formato de preço inválido. Use: R$ 0,00 ou 0.00');
            return false;
        }

        return true;
    }

    /**
     * Valida a categoria do produto
     * @param {string} categoria - Categoria do produto
     * @returns {boolean} True se válido
     */
    validateCategoria(categoria) {
        if (!categoria || !categoria.trim()) {
            this.showValidationError('Categoria é obrigatória');
            return false;
        }

        const categoriasValidas = ['burguer', 'sanduiche', 'bebida', 'sobremesa'];
        if (!categoriasValidas.includes(categoria)) {
            this.showValidationError('Categoria selecionada é inválida');
            return false;
        }

        return true;
    }

    /**
     * Valida o tempo de preparo
     * @param {string} tempo - Tempo de preparo
     * @returns {boolean} True se válido
     */
    validateTempo(tempo) {
        if (!tempo || !tempo.trim()) {
            this.showValidationError('Tempo de preparo é obrigatório');
            return false;
        }

        const tempoNumero = parseInt(tempo);
        if (isNaN(tempoNumero)) {
            this.showValidationError('Tempo deve ser um número válido');
            return false;
        }

        if (tempoNumero <= 0) {
            this.showValidationError('Tempo deve ser maior que zero');
            return false;
        }

        if (tempoNumero > 120) {
            this.showValidationError('Tempo deve ser menor que 120 minutos');
            return false;
        }

        return true;
    }

    /**
     * Valida os ingredientes
     * @param {Array} ingredientes - Lista de ingredientes
     * @returns {boolean} True se válido
     */
    validateIngredientes(ingredientes) {
        if (!ingredientes || ingredientes.length === 0) {
            this.showValidationError('Pelo menos um ingrediente é obrigatório');
            return false;
        }

        if (ingredientes.length > 10) {
            this.showValidationError('Máximo de 10 ingredientes permitidos');
            return false;
        }

        const ingredientesUnicos = new Set();

        for (let i = 0; i < ingredientes.length; i++) {
            const ingrediente = ingredientes[i];

            // Validar ingrediente
            if (!ingrediente.ingrediente || !ingrediente.ingrediente.trim()) {
                this.showValidationError(`Ingrediente ${i + 1}: selecione um ingrediente válido`);
                return false;
            }

            // Verificar duplicatas
            if (ingredientesUnicos.has(ingrediente.ingrediente)) {
                this.showValidationError(`Ingrediente "${ingrediente.ingrediente}" está duplicado`);
                return false;
            }
            ingredientesUnicos.add(ingrediente.ingrediente);

            // Validar quantidade
            if (!ingrediente.quantidade || !ingrediente.quantidade.trim()) {
                this.showValidationError(`Ingrediente ${i + 1}: quantidade é obrigatória`);
                return false;
            }

            const quantidadeNumero = parseFloat(ingrediente.quantidade);
            if (isNaN(quantidadeNumero) || quantidadeNumero <= 0) {
                this.showValidationError(`Ingrediente ${i + 1}: quantidade deve ser um número maior que zero`);
                return false;
            }

            if (quantidadeNumero > 1000) {
                this.showValidationError(`Ingrediente ${i + 1}: quantidade deve ser menor que 1000`);
                return false;
            }

            // Validar unidade
            if (!ingrediente.unidade || !ingrediente.unidade.trim()) {
                this.showValidationError(`Ingrediente ${i + 1}: unidade é obrigatória`);
                return false;
            }

            if (ingrediente.unidade.trim().length < 1 || ingrediente.unidade.trim().length > 10) {
                this.showValidationError(`Ingrediente ${i + 1}: unidade deve ter entre 1 e 10 caracteres`);
                return false;
            }

            // Verificar se unidade contém apenas letras
            const unidadeRegex = /^[a-zA-ZÀ-ÿ]+$/;
            if (!unidadeRegex.test(ingrediente.unidade.trim())) {
                this.showValidationError(`Ingrediente ${i + 1}: unidade deve conter apenas letras`);
                return false;
            }
        }

        return true;
    }

    /**
     * Mostra erro de validação
     * @param {string} message - Mensagem de erro
     */
    showValidationError(message) {
        showToast(message, { type: 'error', title: 'Erro de validação' });
    }
}

// ============================================================================
// GERENCIADOR DE ESTOQUE
// ============================================================================

class EstoqueManager {
    constructor() {
        this.selectors = ESTOQUE_CONFIG.selectors;
        this.init();
    }

    /**
     * Inicializa o gerenciador de estoque
     */
    init() {
        this.setupEventListeners();
        this.setupSearchHandlers();
        this.setupFilterHandlers();
        this.setupIngredientHandlers();
        this.loadIngredients();
        this.updateMetrics();
    }

    /**
     * Configura os event listeners principais
     */
    setupEventListeners() {
        // Botão novo ingrediente
        const newItemButton = document.querySelector(this.selectors.newItemButton);
        if (newItemButton) {
            newItemButton.addEventListener('click', () => this.handleNewIngredient());
        }
    }

    /**
     * Configura os handlers de busca
     */
    setupSearchHandlers() {
        const searchInput = document.querySelector(this.selectors.searchInput);
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.handleSearch(e.target.value);
            });
        }
    }

    /**
     * Configura os handlers de filtros
     */
    setupFilterHandlers() {
        const categoryFilter = document.querySelector(this.selectors.categoryFilter);
        const statusFilter = document.querySelector(this.selectors.statusFilter);

        if (categoryFilter) {
            categoryFilter.addEventListener('change', (e) => {
                this.handleCategoryFilter(e.target.value);
            });
        }

        if (statusFilter) {
            statusFilter.addEventListener('change', (e) => {
                this.handleStatusFilter(e.target.value);
            });
        }
    }

    /**
     * Configura os handlers dos ingredientes usando event delegation
     */
    setupIngredientHandlers() {
        // Usar event delegation para elementos dinâmicos
        const section = document.getElementById('secao-estoque');
        if (!section) {
            console.error('Seção de estoque não encontrada');
            return;
        }

        // Event delegation para botões de editar
        section.addEventListener('click', (e) => {
            if (e.target.classList.contains('editar')) {
                this.handleEditClick(e.target);
            }
        });

        // Event delegation para toggle switches
        section.addEventListener('change', (e) => {
            if (e.target.matches('.toggle input[type="checkbox"]')) {
                this.handleToggleChange(e.target);
            }
        });

        // Event delegation para botões de quantidade
        section.addEventListener('click', (e) => {
            const button = e.target.closest('.btn-quantidade');
            if (button) {
                e.preventDefault();
                e.stopPropagation();
                this.handleQuantityChange(button);
            }
        });

    }

    /**
     * Trata busca de ingredientes
     * @param {string} searchTerm - Termo de busca
     */
    handleSearch(searchTerm) {
        const cards = document.querySelectorAll(this.selectors.ingredientCards);
        const term = searchTerm.toLowerCase().trim();

        cards.forEach(card => {
            const ingredientName = card.querySelector('h3').textContent.toLowerCase();
            const shouldShow = ingredientName.includes(term);

            card.style.display = shouldShow ? 'block' : 'none';
        });

        // Emitir evento de busca
        eventSystem.emit('ingredient:search', {
            searchTerm: term,
            resultsCount: Array.from(cards).filter(card => card.style.display !== 'none').length
        });
    }

    /**
     * Trata filtro por categoria
     * @param {string} category - Categoria selecionada
     */
    handleCategoryFilter(category) {
        const cards = document.querySelectorAll(this.selectors.ingredientCards);

        cards.forEach(card => {
            const cardCategory = card.querySelector('.categoria-fornecedor span').textContent.toLowerCase();
            const shouldShow = !category || cardCategory === category.toLowerCase();

            card.style.display = shouldShow ? 'block' : 'none';
        });

        // Emitir evento de filtro
        eventSystem.emit('ingredient:filter', {
            type: 'category',
            value: category
        });
    }

    /**
     * Trata filtro por status
     * @param {string} status - Status selecionado
     */
    handleStatusFilter(status) {
        const cards = document.querySelectorAll(this.selectors.ingredientCards);

        cards.forEach(card => {
            const statusTag = card.querySelector('.tag-status');
            const cardStatus = statusTag.className.includes('em-estoque') ? 'em-estoque' :
                statusTag.className.includes('estoque-baixo') ? 'estoque-baixo' :
                    statusTag.className.includes('sem-estoque') ? 'sem-estoque' : '';

            const shouldShow = !status || cardStatus === status;
            card.style.display = shouldShow ? 'block' : 'none';
        });

        // Emitir evento de filtro
        eventSystem.emit('ingredient:filter', {
            type: 'status',
            value: status
        });
    }

    /**
     * Trata clique no botão de editar
     * @param {HTMLElement} button - Botão clicado
     */
    handleEditClick(button) {
        const card = button.closest('.card-ingrediente');
        const ingredientId = parseInt(card.dataset.ingredientId);
        const ingredient = ingredientDataManager.getIngredientById(ingredientId);

        if (!ingredient) {
            console.error('Ingrediente não encontrado');
            return;
        }

        // Emitir evento de edição
        eventSystem.emit('ingredient:edit', {
            ingredientName: ingredient.nome,
            card: card
        });

        // Armazenar ID para edição
        this.currentEditingId = ingredientId;

        // Preparar dados para a modal
        const ingredientData = {
            nome: ingredient.nome,
            fornecedor: ingredient.fornecedor,
            categoria: ingredient.categoria,
            custo: `R$ ${ingredient.custo.toFixed(2).replace('.', ',')}`,
            unidade: ingredient.unidade,
            min: ingredient.min,
            max: ingredient.max
        };

        this.openIngredientModal(ingredientData);
    }

    /**
     * Trata mudança no toggle de ativo/inativo
     * @param {HTMLElement} toggle - Toggle clicado
     */
    handleToggleChange(toggle) {
        const card = toggle.closest('.card-ingrediente');
        const ingredientId = parseInt(card.dataset.ingredientId);
        const ingredient = ingredientDataManager.getIngredientById(ingredientId);

        if (!ingredient) {
            console.error('Ingrediente não encontrado');
            return;
        }

        // Atualizar status no sistema de dados
        const updatedIngredient = ingredientDataManager.toggleIngredientStatus(ingredientId);

        if (updatedIngredient) {
            // Atualizar interface
            const statusElement = card.querySelector('.status-ativo span');
            const iconElement = card.querySelector('.status-ativo i');

            if (toggle.checked) {
                statusElement.textContent = 'Ativo';
                statusElement.parentElement.style.color = '#4CAF50';
                iconElement.className = 'fa-solid fa-eye';
            } else {
                statusElement.textContent = 'Inativo';
                statusElement.parentElement.style.color = '#f44336';
                iconElement.className = 'fa-solid fa-eye-slash';
            }

            // Emitir evento de mudança de status
            eventSystem.emit('ingredient:statusChange', {
                ingredientName: ingredient.nome,
                isActive: toggle.checked,
                timestamp: new Date().toISOString()
            });

            // Status do ingrediente alterado
        }
    }

    /**
     * Trata mudança na quantidade
     * @param {HTMLElement} button - Botão clicado
     */
    handleQuantityChange(button) {
        // Prevenir múltiplos cliques
        if (button.disabled) return;

        const card = button.closest('.card-ingrediente');
        const ingredientId = parseInt(card.dataset.ingredientId);
        const ingredient = ingredientDataManager.getIngredientById(ingredientId);

        if (!ingredient) {
            console.error('Ingrediente não encontrado');
            return;
        }

        // Desabilitar botão temporariamente
        button.disabled = true;

        const isIncrease = button.dataset.action === 'increase';
        let newQuantity = Number(ingredient.atual);

        if (isIncrease) {
            newQuantity = newQuantity + 1;
            // Verificar se não excede o máximo
            if (newQuantity > Number(ingredient.max)) {
                newQuantity = Number(ingredient.max);
            }
        } else {
            newQuantity = newQuantity - 1;
            // Verificar se não fica negativo
            if (newQuantity < 0) {
                newQuantity = 0;
            }
        }

        // Atualizar quantidade no sistema de dados
        const updatedIngredient = ingredientDataManager.updateIngredientQuantity(ingredientId, newQuantity);

        if (updatedIngredient) {
            // Atualizar interface
            const quantityElement = card.querySelector('.quantidade');
            const progressElement = card.querySelector('.progresso');
            const progressPercentage = ingredient.max > 0 ? (newQuantity / ingredient.max) * 100 : 0;

            quantityElement.textContent = `${newQuantity}${ingredient.unidade}`;
            progressElement.style.width = `${progressPercentage}%`;

            // Atualizar status do card
            this.updateCardStatus(card, newQuantity, ingredient.min, ingredient.max);

            // Atualizar métricas
            this.updateMetrics();

            // Emitir evento de mudança de quantidade
            eventSystem.emit('ingredient:quantityChange', {
                ingredientName: ingredient.nome,
                newQuantity: newQuantity,
                timestamp: new Date().toISOString()
            });
        }

        // Reabilitar botão após um pequeno delay
        setTimeout(() => {
            button.disabled = false;
        }, 100);
    }

    /**
     * Atualiza o status visual do card baseado na quantidade
     * @param {HTMLElement} card - Card do ingrediente
     * @param {number} currentQuantity - Quantidade atual
     * @param {number} minQuantity - Quantidade mínima
     * @param {number} maxQuantity - Quantidade máxima
     */
    updateCardStatus(card, currentQuantity, minQuantity, maxQuantity) {
        const statusTag = card.querySelector('.tag-status');
        const statusSpan = statusTag.querySelector('span');

        // Remover classes de status anteriores
        statusTag.classList.remove('em-estoque', 'estoque-baixo', 'sem-estoque');
        card.classList.remove('sem-estoque', 'estoque-baixo', 'em-estoque');

        if (currentQuantity === 0) {
            statusTag.classList.add('sem-estoque');
            statusSpan.textContent = 'Sem estoque';
            card.classList.add('sem-estoque');
        } else if (currentQuantity <= minQuantity * 1.5) {
            statusTag.classList.add('estoque-baixo');
            statusSpan.textContent = 'Estoque baixo';
            card.classList.add('estoque-baixo');
        } else {
            statusTag.classList.add('em-estoque');
            statusSpan.textContent = 'Em estoque';
            card.classList.add('em-estoque');
        }
    }

    /**
     * Trata criação de novo ingrediente
     */
    handleNewIngredient() {
        // Emitir evento de criação
        eventSystem.emit('ingredient:create', {
            timestamp: new Date().toISOString()
        });

        this.openIngredientModal();
    }

    /**
     * Abre a modal de ingrediente
     * @param {Object} ingredientData - Dados do ingrediente para edição (opcional)
     */
    openIngredientModal(ingredientData = null) {
        const modal = document.getElementById('modal-ingrediente');
        const titulo = document.getElementById('titulo-modal-ingrediente');
        const btnSalvar = document.getElementById('salvar-ingrediente');

        if (!modal) {
            console.error('Modal de ingrediente não encontrada');
            return;
        }

        // Configurar título e botão baseado no modo
        if (ingredientData) {
            titulo.textContent = 'Editar ingrediente';
            btnSalvar.innerHTML = '<i class="fa-solid fa-save"></i> Salvar';
            this.populateIngredientModal(ingredientData);
        } else {
            titulo.textContent = 'Adicione um novo ingrediente';
            btnSalvar.innerHTML = '<i class="fa-solid fa-plus"></i> Adicionar';
            this.clearIngredientModal();
        }

        // Mostrar modal
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';

        // Configurar event listeners
        this.setupIngredientModalListeners(ingredientData);
    }

    /**
     * Fecha a modal de ingrediente
     */
    closeIngredientModal() {
        const modal = document.getElementById('modal-ingrediente');
        if (modal) {
            modal.style.display = 'none';
            document.body.style.overflow = 'auto';
        }

        // Limpar ID de edição
        this.currentEditingId = null;
    }

    /**
     * Limpa os campos da modal de ingrediente
     */
    clearIngredientModal() {
        const fields = [
            'nome-ingrediente',
            'fornecedor-ingrediente',
            'categoria-ingrediente',
            'custo-ingrediente',
            'unidade-ingrediente',
            'min-ingrediente',
            'max-ingrediente'
        ];

        fields.forEach(fieldId => {
            const field = document.getElementById(fieldId);
            if (field) {
                field.value = '';
                field.classList.remove('error', 'success');
            }
        });
    }

    /**
     * Preenche a modal com dados do ingrediente
     * @param {Object} ingredientData - Dados do ingrediente
     */
    populateIngredientModal(ingredientData) {
        const fields = {
            'nome-ingrediente': ingredientData.nome || '',
            'fornecedor-ingrediente': ingredientData.fornecedor || '',
            'categoria-ingrediente': ingredientData.categoria || '',
            'custo-ingrediente': ingredientData.custo || '',
            'unidade-ingrediente': ingredientData.unidade || '',
            'min-ingrediente': ingredientData.min || '',
            'max-ingrediente': ingredientData.max || ''
        };

        Object.entries(fields).forEach(([fieldId, value]) => {
            const field = document.getElementById(fieldId);
            if (field) {
                field.value = value;
                field.classList.remove('error', 'success');
            }
        });
    }

    /**
     * Configura os event listeners da modal de ingrediente
     * @param {Object} ingredientData - Dados do ingrediente para edição (opcional)
     */
    setupIngredientModalListeners(ingredientData = null) {
        // Remover listeners anteriores
        this.removeIngredientModalListeners();

        // Botão fechar
        const btnFechar = document.querySelector('#modal-ingrediente .fechar-modal');
        if (btnFechar) {
            btnFechar.addEventListener('click', () => this.closeIngredientModal());
        }

        // Botão cancelar
        const btnCancelar = document.getElementById('cancelar-ingrediente');
        if (btnCancelar) {
            btnCancelar.addEventListener('click', () => this.closeIngredientModal());
        }

        // Botão salvar/adicionar
        const btnSalvar = document.getElementById('salvar-ingrediente');
        if (btnSalvar) {
            btnSalvar.addEventListener('click', () => {
                if (ingredientData) {
                    this.handleEditIngredient();
                } else {
                    this.handleAddIngredient();
                }
            });
        }

        // Overlay para fechar modal
        const overlay = document.querySelector('#modal-ingrediente .div-overlay');
        if (overlay) {
            overlay.addEventListener('click', () => this.closeIngredientModal());
        }

        // Validação em tempo real
        this.setupIngredientValidation();

        // Formatação automática para campo de custo
        this.setupCurrencyFormatting();
    }

    /**
     * Remove os event listeners da modal de ingrediente
     */
    removeIngredientModalListeners() {
        // Remover listeners específicos para evitar vazamentos de memória
        const modal = document.getElementById('modal-ingrediente');
        if (!modal) return;

        const btnFechar = modal.querySelector('.fechar-modal');
        const btnCancelar = document.getElementById('cancelar-ingrediente');
        const btnSalvar = document.getElementById('salvar-ingrediente');
        const overlay = modal.querySelector('.div-overlay');

        // Remover listeners específicos
        if (btnFechar) {
            btnFechar.replaceWith(btnFechar.cloneNode(true));
        }
        if (btnCancelar) {
            btnCancelar.replaceWith(btnCancelar.cloneNode(true));
        }
        if (btnSalvar) {
            btnSalvar.replaceWith(btnSalvar.cloneNode(true));
        }
        if (overlay) {
            overlay.replaceWith(overlay.cloneNode(true));
        }
    }

    /**
     * Configura validação em tempo real para os campos
     */
    setupIngredientValidation() {
        const fields = [
            { id: 'nome-ingrediente', type: 'text', required: true, minLength: 2 },
            { id: 'fornecedor-ingrediente', type: 'text', required: true, minLength: 2 },
            { id: 'categoria-ingrediente', type: 'select', required: true },
            { id: 'custo-ingrediente', type: 'currency', required: true },
            { id: 'unidade-ingrediente', type: 'text', required: true, minLength: 1 },
            { id: 'min-ingrediente', type: 'number', required: true, min: 0 },
            { id: 'max-ingrediente', type: 'number', required: true, min: 0 }
        ];

        fields.forEach(fieldConfig => {
            const field = document.getElementById(fieldConfig.id);
            if (field) {
                field.addEventListener('input', () => this.validateIngredientField(field, fieldConfig));
                field.addEventListener('blur', () => this.validateIngredientField(field, fieldConfig));
            }
        });
    }

    /**
     * Valida um campo específico da modal de ingrediente
     * @param {HTMLElement} field - Campo a ser validado
     * @param {Object} config - Configuração de validação
     */
    validateIngredientField(field, config) {
        const value = field.value.trim();
        let isValid = true;
        let errorMessage = '';

        // Validação de campo obrigatório
        if (config.required && !value) {
            isValid = false;
            errorMessage = 'Este campo é obrigatório';
        }

        // Validação de tamanho mínimo
        if (isValid && config.minLength && value.length < config.minLength) {
            isValid = false;
            errorMessage = `Mínimo de ${config.minLength} caracteres`;
        }

        // Validação de valor mínimo
        if (isValid && config.min !== undefined && parseFloat(value) < config.min) {
            isValid = false;
            errorMessage = `Valor mínimo: ${config.min}`;
        }

        // Validação específica para moeda
        if (isValid && config.type === 'currency' && value) {
            const currencyRegex = /^R\$\s?\d{1,3}(\.\d{3})*(,\d{2})?$/;
            if (!currencyRegex.test(value)) {
                isValid = false;
                errorMessage = 'Formato inválido (ex: R$ 10,50)';
            }
        }

        // Validação específica para números
        if (isValid && config.type === 'number' && value) {
            const numValue = parseFloat(value);
            if (isNaN(numValue)) {
                isValid = false;
                errorMessage = 'Digite um número válido';
            }
        }

        // Aplicar classes de validação
        field.classList.remove('error', 'success');
        if (value) {
            field.classList.add(isValid ? 'success' : 'error');
        }

        return isValid;
    }

    /**
     * Valida todos os campos da modal de ingrediente
     * @returns {boolean} - True se todos os campos são válidos
     */
    validateAllIngredientFields() {
        const fields = [
            { id: 'nome-ingrediente', type: 'text', required: true, minLength: 2 },
            { id: 'fornecedor-ingrediente', type: 'text', required: true, minLength: 2 },
            { id: 'categoria-ingrediente', type: 'select', required: true },
            { id: 'custo-ingrediente', type: 'currency', required: true },
            { id: 'unidade-ingrediente', type: 'text', required: true, minLength: 1 },
            { id: 'min-ingrediente', type: 'number', required: true, min: 0 },
            { id: 'max-ingrediente', type: 'number', required: true, min: 0 }
        ];

        let allValid = true;
        fields.forEach(fieldConfig => {
            const field = document.getElementById(fieldConfig.id);
            if (field) {
                const isValid = this.validateIngredientField(field, fieldConfig);
                if (!isValid) allValid = false;
            }
        });

        return allValid;
    }

    /**
     * Trata adição de novo ingrediente
     */
    handleAddIngredient() {
        if (!this.validateAllIngredientFields()) {
            console.log('Formulário inválido');
            return;
        }

        const ingredientData = this.getIngredientFormData();

        // Converter custo de string para número
        const custoNumerico = parseFloat(ingredientData.custo.replace('R$', '').replace(',', '.').trim());

        const newIngredient = ingredientDataManager.addIngredient({
            nome: ingredientData.nome,
            fornecedor: ingredientData.fornecedor,
            categoria: ingredientData.categoria,
            custo: custoNumerico,
            unidade: ingredientData.unidade,
            min: ingredientData.min,
            max: ingredientData.max
        });

        // Ingrediente adicionado com sucesso

        // Recarregar a lista e métricas
        this.loadIngredients();
        this.updateMetrics();

        this.closeIngredientModal();
        this.showSuccessMessage('Ingrediente adicionado com sucesso!');
    }

    /**
     * Trata edição de ingrediente
     */
    handleEditIngredient() {
        if (!this.validateAllIngredientFields()) {
            console.log('Formulário inválido');
            return;
        }

        const ingredientData = this.getIngredientFormData();
        const ingredientId = this.currentEditingId;

        if (!ingredientId) {
            console.error('ID do ingrediente não encontrado');
            return;
        }

        // Converter custo de string para número
        const custoNumerico = parseFloat(ingredientData.custo.replace('R$', '').replace(',', '.').trim());

        const updatedIngredient = ingredientDataManager.updateIngredient(ingredientId, {
            nome: ingredientData.nome,
            fornecedor: ingredientData.fornecedor,
            categoria: ingredientData.categoria,
            custo: custoNumerico,
            unidade: ingredientData.unidade,
            min: ingredientData.min,
            max: ingredientData.max
        });

        if (updatedIngredient) {
            // Ingrediente atualizado com sucesso

            // Recarregar a lista e métricas
            this.loadIngredients();
            this.updateMetrics();

            this.closeIngredientModal();
            this.showSuccessMessage('Ingrediente atualizado com sucesso!');
        } else {
            console.error('Erro ao atualizar ingrediente');
            this.showErrorMessage('Erro ao atualizar ingrediente');
        }
    }

    /**
     * Obtém os dados do formulário de ingrediente
     * @returns {Object} - Dados do ingrediente
     */
    getIngredientFormData() {
        return {
            nome: document.getElementById('nome-ingrediente')?.value.trim() || '',
            fornecedor: document.getElementById('fornecedor-ingrediente')?.value.trim() || '',
            categoria: document.getElementById('categoria-ingrediente')?.value || '',
            custo: document.getElementById('custo-ingrediente')?.value.trim() || '',
            unidade: document.getElementById('unidade-ingrediente')?.value.trim() || '',
            min: parseFloat(document.getElementById('min-ingrediente')?.value) || 0,
            max: parseFloat(document.getElementById('max-ingrediente')?.value) || 0
        };
    }

    /**
     * Configura formatação automática para campo de moeda
     */
    setupCurrencyFormatting() {
        const custoField = document.getElementById('custo-ingrediente');
        if (custoField) {
            custoField.addEventListener('input', (e) => {
                let value = e.target.value.replace(/\D/g, '');
                if (value) {
                    // Converter centavos para reais
                    const valorEmReais = parseInt(value) / 100;
                    value = valorEmReais.toLocaleString('pt-BR', {
                        style: 'currency',
                        currency: 'BRL',
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                    });
                }
                e.target.value = value;
            });
        }
    }

    /**
     * Carrega e renderiza os ingredientes
     */
    loadIngredients() {
        const ingredients = ingredientDataManager.getAllIngredients();
        const container = document.querySelector('#secao-estoque .ingredientes');

        if (!container) return;

        container.innerHTML = '';

        ingredients.forEach(ingredient => {
            const card = this.createIngredientCard(ingredient);
            container.appendChild(card);
        });
    }

    /**
     * Cria um card de ingrediente
     * @param {Object} ingredient - Dados do ingrediente
     * @returns {HTMLElement} - Elemento do card
     */
    createIngredientCard(ingredient) {
        const card = document.createElement('div');
        card.className = `card-ingrediente ${this.getStatusClass(ingredient)}`;
        card.dataset.ingredientId = ingredient.id;

        const progressPercentage = ingredient.max > 0 ? (ingredient.atual / ingredient.max) * 100 : 0;
        const statusText = this.getStatusText(ingredient);

        card.innerHTML = `
            <div class="cabecalho-ingrediente">
                <div class="nome-ingrediente">
                    <h3>${ingredient.nome}</h3>
                    <div class="info-ingrediente">
                        <div class="categoria-fornecedor">
                            <i class="fa-solid fa-cubes-stacked"></i>
                            <span>${this.getCategoryName(ingredient.categoria)}</span>
                            <i class="fa-solid fa-store"></i>
                            <span>${ingredient.fornecedor}</span>
                        </div>
                        
                        <div class="tag-status ${this.getStatusClass(ingredient)}">
                            <span>${statusText}</span>
                        </div>
                    </div>
                </div>
                <div class="controles-ingrediente">
                    <i class="fa-solid fa-pen-to-square editar"></i>
                    <div class="toggle-container">
                        <label class="toggle">
                            <input type="checkbox" ${ingredient.ativo ? 'checked' : ''}>
                            <span class="slider"></span>
                        </label>
                        <div class="status-ativo">
                            <i class="fa-solid ${ingredient.ativo ? 'fa-eye' : 'fa-eye-slash'}"></i>
                            <span>${ingredient.ativo ? 'Ativo' : 'Inativo'}</span>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="controle-estoque">
                <div class="estoque-atual">
                    <span class="label">Estoque atual</span>
                    <span class="quantidade">${ingredient.atual}${ingredient.unidade}</span>
                </div>
                
                <div class="barra-progresso">
                    <div class="progresso" style="width: ${progressPercentage}%"></div>
                </div>
                
                <div class="limites">
                    <span>Min: ${ingredient.min}</span>
                    <span>Max: ${ingredient.max}</span>
                </div>
                
                <div class="botoes-quantidade">
                    <button class="btn-quantidade" type="button" data-action="decrease">
                        <i class="fa-solid fa-minus"></i>
                    </button>
                    <button class="btn-quantidade" type="button" data-action="increase">
                        <i class="fa-solid fa-plus"></i>
                    </button>
                </div>
            </div>

            <div class="info-adicional">
                <div class="custo">
                    <p>Custo:</p>
                    <p>R$ ${ingredient.custo.toFixed(2).replace('.', ',')} ${ingredient.unidade}</p>
                </div>
                <div class="ultima-atualizacao">
                    <p>Última atualização:</p>
                    <p>${this.formatDate(ingredient.ultimaAtualizacao)}</p>
                </div>
            </div>
        `;

        return card;
    }

    /**
     * Atualiza as métricas do dashboard
     */
    updateMetrics() {
        const metrics = ingredientDataManager.getMetrics();

        // Atualizar valor total
        const valorTotalElement = document.querySelector('#secao-estoque .relata .quadro:nth-child(1) .valor .grande');
        if (valorTotalElement) {
            valorTotalElement.textContent = `R$ ${metrics.valorTotal.toFixed(2).replace('.', ',')}`;
        }

        const totalItensElement = document.querySelector('#secao-estoque .relata .quadro:nth-child(1) .valor .descricao');
        if (totalItensElement) {
            totalItensElement.textContent = `${metrics.totalItens} Itens`;
        }

        // Atualizar sem estoque
        const semEstoqueElement = document.querySelector('#secao-estoque .relata .quadro:nth-child(2) .valor .grande');
        if (semEstoqueElement) {
            semEstoqueElement.textContent = metrics.semEstoque.toString();
        }

        // Atualizar estoque baixo
        const estoqueBaixoElement = document.querySelector('#secao-estoque .relata .quadro:nth-child(3) .valor .grande');
        if (estoqueBaixoElement) {
            estoqueBaixoElement.textContent = metrics.estoqueBaixo.toString();
        }

        // Atualizar em estoque
        const emEstoqueElement = document.querySelector('#secao-estoque .relata .quadro:nth-child(4) .valor .grande');
        if (emEstoqueElement) {
            emEstoqueElement.textContent = metrics.emEstoque.toString();
        }
    }

    /**
     * Obtém a classe de status do ingrediente
     * @param {Object} ingredient - Dados do ingrediente
     * @returns {string} - Classe CSS
     */
    getStatusClass(ingredient) {
        if (ingredient.atual === 0) return 'sem-estoque';
        if (ingredient.atual <= ingredient.min) return 'estoque-baixo';
        return 'em-estoque';
    }

    /**
     * Obtém o texto de status do ingrediente
     * @param {Object} ingredient - Dados do ingrediente
     * @returns {string} - Texto do status
     */
    getStatusText(ingredient) {
        if (ingredient.atual === 0) return 'Sem estoque';
        if (ingredient.atual <= ingredient.min) return 'Estoque baixo';
        return 'Em estoque';
    }

    /**
     * Obtém o nome da categoria
     * @param {string} category - Código da categoria
     * @returns {string} - Nome da categoria
     */
    getCategoryName(category) {
        const categories = {
            'carnes': 'Carnes',
            'vegetais': 'Vegetais',
            'laticinios': 'Laticínios',
            'temperos': 'Temperos',
            'frutas': 'Frutas',
            'legumes': 'Legumes',
            'frutos-do-mar': 'Frutos do mar',
            'bebidas': 'Bebidas',
            'doces': 'Doces',
            'outros': 'Outros'
        };
        return categories[category] || category;
    }

    /**
     * Formata data para exibição
     * @param {string} dateString - Data em formato ISO
     * @returns {string} - Data formatada
     */
    formatDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleDateString('pt-BR');
    }

    /**
     * Exibe mensagem de sucesso
     * @param {string} message - Mensagem a ser exibida
     */
    showSuccessMessage(message) {
        // Implementar sistema de notificações
        // Mensagem de sucesso
    }

    /**
     * Exibe mensagem de erro
     * @param {string} message - Mensagem a ser exibida
     */
    showErrorMessage(message) {
        // Implementar sistema de notificações
        // Mensagem de erro
    }
}

// ============================================================================
// SISTEMA DE EVENTOS (OBSERVER PATTERN)
// ============================================================================

/**
 * Sistema de eventos para comunicação entre componentes
 */
class EventSystem {
    constructor() {
        this.events = new Map();
    }

    /**
     * Registra um listener para um evento
     * @param {string} eventName - Nome do evento
     * @param {Function} callback - Função callback
     */
    on(eventName, callback) {
        if (!this.events.has(eventName)) {
            this.events.set(eventName, []);
        }
        this.events.get(eventName).push(callback);
    }

    /**
     * Remove um listener de um evento
     * @param {string} eventName - Nome do evento
     * @param {Function} callback - Função callback a ser removida
     */
    off(eventName, callback) {
        if (this.events.has(eventName)) {
            const callbacks = this.events.get(eventName);
            const index = callbacks.indexOf(callback);
            if (index > -1) {
                callbacks.splice(index, 1);
            }
        }
    }

    /**
     * Dispara um evento
     * @param {string} eventName - Nome do evento
     * @param {*} data - Dados a serem passados para os listeners
     */
    emit(eventName, data) {
        if (this.events.has(eventName)) {
            this.events.get(eventName).forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`Erro no listener do evento ${eventName}:`, error);
                }
            });
        }
    }
}

// Instância global do sistema de eventos
const eventSystem = new EventSystem();

// ============================================================================
// SISTEMA DE CONFIGURAÇÃO
// ============================================================================

/**
 * Sistema de configuração para seções
 */
class SectionConfig {
    constructor() {
        this.configs = new Map();
        this.initDefaultConfigs();
    }

    /**
     * Inicializa configurações padrão
     */
    initDefaultConfigs() {
        // Configuração para seção de cardápio
        this.configs.set('secao-cardapio', {
            title: 'Gerenciamento do Cardápio',
            description: 'Configure itens, preços e disponibilidade',
            hasNewButton: true,
            newButtonText: 'Novo Item',
            filters: {
                search: {
                    placeholder: 'Buscar por id, cliente ou itens',
                    enabled: true
                },
                category: {
                    enabled: true,
                    options: [
                        { value: '', text: 'Categorias' },
                        { value: 'burguer', text: 'Burguer' },
                        { value: 'sanduiche', text: 'Sanduíche' },
                        { value: 'bebida', text: 'Bebida' },
                        { value: 'sobremesa', text: 'Sobremesa' }
                    ]
                },
                status: {
                    enabled: true,
                    options: [
                        { value: '', text: 'Status' },
                        { value: 'disponivel', text: 'Disponível' },
                        { value: 'indisponivel', text: 'Indisponível' }
                    ]
                }
            },
            metrics: {
                enabled: true,
                items: [
                    { key: 'total', label: 'Total de Itens', icon: 'fa-crown', value: '10', subtitle: '2 indisponíveis' },
                    { key: 'avgPrice', label: 'Preço Médio', icon: 'fa-dollar-sign', value: '24,57', prefix: 'R$', subtitle: 'Ticket médio' },
                    { key: 'avgMargin', label: 'Margem Média', icon: 'fa-dollar-sign', value: '50', suffix: '%', subtitle: 'Lucro bruto' },
                    { key: 'avgTime', label: 'Tempo Médio de Preparo', icon: 'fa-clock', value: '12', suffix: 'min', subtitle: 'Preparo' }
                ]
            }
        });

        // Configuração para seção de funcionários
        this.configs.set('secao-funcionarios', {
            title: 'Gerenciamento de Funcionários',
            description: 'Gerencie seus funcionários em atividade e adicione contas',
            hasNewButton: true,
            newButtonText: 'Novo usuário',
            filters: {
                search: {
                    placeholder: 'Buscar funcionário',
                    enabled: true
                },
                role: {
                    enabled: true,
                    options: [
                        { value: '', text: 'Cargo' },
                        { value: 'gerente', text: 'Gerente' },
                        { value: 'funcionario', text: 'Funcionário' }
                    ]
                },
                status: {
                    enabled: true,
                    options: [
                        { value: '', text: 'Status' },
                        { value: 'ativo', text: 'Ativo' },
                        { value: 'inativo', text: 'Inativo' }
                    ]
                }
            }
        });
    }

    /**
     * Obtém configuração de uma seção
     * @param {string} sectionId - ID da seção
     * @returns {Object} Configuração da seção
     */
    getConfig(sectionId) {
        return this.configs.get(sectionId) || {};
    }

    /**
     * Adiciona configuração para uma seção
     * @param {string} sectionId - ID da seção
     * @param {Object} config - Configuração da seção
     */
    addConfig(sectionId, config) {
        this.configs.set(sectionId, config);
    }
}

// Instância global do sistema de configuração
const sectionConfig = new SectionConfig();

// ============================================================================
// SISTEMA DE VALIDAÇÃO
// ============================================================================

/**
 * Sistema de validação para formulários e dados
 */
class ValidationSystem {
    /**
     * Valida se um elemento existe no DOM
     * @param {string} selector - Seletor CSS
     * @param {string} context - Contexto da validação
     * @returns {boolean} True se válido
     */
    static validateElement(selector, context = '') {
        const element = document.querySelector(selector);
        if (!element) {
            console.warn(`Elemento não encontrado: ${selector} ${context}`);
            return false;
        }
        return true;
    }

    /**
     * Valida se um valor não está vazio
     * @param {*} value - Valor a ser validado
     * @param {string} fieldName - Nome do campo
     * @returns {boolean} True se válido
     */
    static validateRequired(value, fieldName) {
        if (!value || (typeof value === 'string' && value.trim() === '')) {
            console.warn(`Campo obrigatório vazio: ${fieldName}`);
            return false;
        }
        return true;
    }

    /**
     * Valida formato de email
     * @param {string} email - Email a ser validado
     * @returns {boolean} True se válido
     */
    static validateEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    /**
     * Valida se um ID de seção é válido
     * @param {string} sectionId - ID da seção
     * @returns {boolean} True se válido
     */
    static validateSectionId(sectionId) {
        return sectionId && sectionId.startsWith('secao-') && document.getElementById(sectionId);
    }
}

// ============================================================================
// INICIALIZAÇÃO DO SISTEMA
// ============================================================================

/**
 * Gerenciador de dados de funcionários (mock)
 */
class FuncionarioDataManager {
    constructor() {
        this.funcionarios = [
            {
                id: 1,
                nome: 'Ygor Brocha',
                email: 'ygor@royalburger.com',
                nascimento: '1990-05-15',
                telefone: '(11) 99999-9999',
                cargo: 'gerente',
                ativo: true,
                dataCriacao: '2024-01-15T10:30:00Z'
            },
            {
                id: 2,
                nome: 'Maria Silva',
                email: 'maria@royalburger.com',
                nascimento: '1995-08-22',
                telefone: '(11) 88888-8888',
                cargo: 'atendente',
                ativo: true,
                dataCriacao: '2024-02-10T14:20:00Z'
            },
            {
                id: 3,
                nome: 'João Santos',
                email: 'joao@royalburger.com',
                nascimento: '1992-12-03',
                telefone: '(11) 77777-7777',
                cargo: 'entregador',
                ativo: true,
                dataCriacao: '2024-02-15T09:15:00Z'
            },
            {
                id: 4,
                nome: 'Ana Costa',
                email: 'ana@royalburger.com',
                nascimento: '1988-03-18',
                telefone: '(11) 66666-6666',
                cargo: 'atendente',
                ativo: false,
                dataCriacao: '2024-01-20T16:45:00Z'
            },
            {
                id: 5,
                nome: 'Carlos Oliveira',
                email: 'carlos@royalburger.com',
                nascimento: '1993-07-25',
                telefone: '(11) 55555-5555',
                cargo: 'entregador',
                ativo: true,
                dataCriacao: '2024-03-01T11:30:00Z'
            },
            {
                id: 6,
                nome: 'Lucas Admin',
                email: 'lucas@royalburger.com',
                nascimento: '1985-11-10',
                telefone: '(11) 44444-4444',
                cargo: 'admin',
                ativo: true,
                dataCriacao: '2024-01-01T08:00:00Z'
            },
            // Usuários Clientes
            {
                id: 7,
                nome: 'Pedro Almeida',
                email: 'pedro.almeida@gmail.com',
                nascimento: '1998-04-12',
                telefone: '(11) 33333-3333',
                cargo: 'cliente',
                ativo: true,
                dataCriacao: '2024-03-15T14:20:00Z'
            },
            {
                id: 8,
                nome: 'Fernanda Lima',
                email: 'fernanda.lima@hotmail.com',
                nascimento: '1996-09-08',
                telefone: '(11) 22222-2222',
                cargo: 'cliente',
                ativo: true,
                dataCriacao: '2024-03-20T10:15:00Z'
            },
            {
                id: 9,
                nome: 'Roberto Souza',
                email: 'roberto.souza@yahoo.com',
                nascimento: '1987-12-25',
                telefone: '(11) 11111-1111',
                cargo: 'cliente',
                ativo: true,
                dataCriacao: '2024-02-28T16:30:00Z'
            },
            {
                id: 10,
                nome: 'Juliana Ferreira',
                email: 'juliana.ferreira@outlook.com',
                nascimento: '1994-06-14',
                telefone: '(11) 99999-0000',
                cargo: 'cliente',
                ativo: false,
                dataCriacao: '2024-01-10T12:45:00Z'
            },
            {
                id: 11,
                nome: 'Marcos Rodrigues',
                email: 'marcos.rodrigues@gmail.com',
                nascimento: '1991-11-03',
                telefone: '(11) 88888-0000',
                cargo: 'cliente',
                ativo: true,
                dataCriacao: '2024-03-05T09:20:00Z'
            },
            {
                id: 12,
                nome: 'Camila Santos',
                email: 'camila.santos@hotmail.com',
                nascimento: '1999-02-18',
                telefone: '(11) 77777-0000',
                cargo: 'cliente',
                ativo: true,
                dataCriacao: '2024-03-12T15:10:00Z'
            }
        ];
    }

    getAllFuncionarios() {
        return this.funcionarios;
    }

    getFuncionarioById(id) {
        return this.funcionarios.find(f => f.id === id);
    }

    addFuncionario(funcionarioData) {
        const newId = Math.max(...this.funcionarios.map(f => f.id)) + 1;
        const funcionario = {
            id: newId,
            ...funcionarioData,
            ativo: true,
            dataCriacao: new Date().toISOString()
        };
        this.funcionarios.push(funcionario);
        return funcionario;
    }

    updateFuncionario(id, funcionarioData) {
        const index = this.funcionarios.findIndex(f => f.id === id);
        if (index !== -1) {
            this.funcionarios[index] = { ...this.funcionarios[index], ...funcionarioData };
            return this.funcionarios[index];
        }
        return null;
    }

    toggleFuncionarioStatus(id) {
        const funcionario = this.getFuncionarioById(id);
        if (funcionario) {
            funcionario.ativo = !funcionario.ativo;
            return funcionario;
        }
        return null;
    }

    getMetrics() {
        const total = this.funcionarios.length;
        const ativos = this.funcionarios.filter(f => f.ativo).length;
        const inativos = total - ativos;

        const cargos = {
            atendente: this.funcionarios.filter(f => f.cargo === 'atendente').length,
            gerente: this.funcionarios.filter(f => f.cargo === 'gerente').length,
            entregador: this.funcionarios.filter(f => f.cargo === 'entregador').length,
            admin: this.funcionarios.filter(f => f.cargo === 'admin').length,
            cliente: this.funcionarios.filter(f => f.cargo === 'cliente').length
        };

        // Separar funcionários e clientes
        const funcionarios = this.funcionarios.filter(f => f.cargo !== 'cliente').length;
        const clientes = this.funcionarios.filter(f => f.cargo === 'cliente').length;

        return {
            total,
            ativos,
            inativos,
            cargos,
            funcionarios,
            clientes
        };
    }
}

/**
 * Gerenciador da seção de funcionários
 */
class FuncionarioManager {
    constructor() {
        this.currentEditingId = null;
        this.funcionarioDataManager = new FuncionarioDataManager();
    }

    init() {
        this.setupEventListeners();
        this.setupFilterHandlers();
        this.loadFuncionarios();
    }

    setupEventListeners() {
        const newFuncionarioButton = document.querySelector('#secao-funcionarios .adicionar');
        if (newFuncionarioButton) {
            newFuncionarioButton.addEventListener('click', () => this.handleNewFuncionario());
        }

        this.setupFuncionarioHandlers();
    }

    setupFuncionarioHandlers() {
        const section = document.getElementById('secao-funcionarios');
        if (!section) {
            console.error('Seção de funcionários não encontrada');
            return;
        }

        // Event delegation para botões de editar
        section.addEventListener('click', (e) => {
            const editButton = e.target.closest('.btn-editar');
            if (editButton) {
                e.preventDefault();
                e.stopPropagation();
                this.handleEditClick(editButton);
            }
        });

        // Event delegation para toggles
        section.addEventListener('change', (e) => {
            if (e.target.matches('.toggle input[type="checkbox"]')) {
                this.handleToggleChange(e.target);
            }
        });

        // Event delegation para clique no toggle (fallback)
        section.addEventListener('click', (e) => {
            const toggleContainer = e.target.closest('.toggle');
            if (toggleContainer) {
                const checkbox = toggleContainer.querySelector('input[type="checkbox"]');
                if (checkbox) {
                    checkbox.checked = !checkbox.checked;
                    this.handleToggleChange(checkbox);
                }
            }
        });

        // Event delegation para link de métricas
        section.addEventListener('click', (e) => {
            const metricsLink = e.target.closest('.link-metricas');
            if (metricsLink) {
                e.preventDefault();
                e.stopPropagation();
                this.handleMetricsClick(metricsLink);
            }
        });
    }

    setupFilterHandlers() {
        const section = document.getElementById('secao-funcionarios');
        if (!section) return;

        // Filtro de busca por nome
        const searchInput = section.querySelector('#busca-funcionario');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.handleSearch(e.target.value);
            });
        }

        // Filtro por cargo
        const cargoFilter = section.querySelector('#cargo-filtro');
        if (cargoFilter) {
            cargoFilter.addEventListener('change', (e) => {
                this.handleCargoFilter(e.target.value);
            });
        }

        // Filtro por status
        const statusFilter = section.querySelector('#status-funcionario');
        if (statusFilter) {
            statusFilter.addEventListener('change', (e) => {
                this.handleStatusFilter(e.target.value);
            });
        }
    }

    handleSearch(searchTerm) {
        const cards = document.querySelectorAll('#secao-funcionarios .card-funcionario');
        const term = searchTerm.toLowerCase().trim();

        cards.forEach(card => {
            const nomeElement = card.querySelector('.nome-funcionario');
            const emailElement = card.querySelector('.email p');

            if (nomeElement && emailElement) {
                const nome = nomeElement.textContent.toLowerCase();
                const email = emailElement.textContent.toLowerCase();

                const matches = nome.includes(term) || email.includes(term);
                card.style.display = matches ? 'block' : 'none';
            }
        });

        // Emitir evento de busca
        eventSystem.emit('funcionario:search', {
            term: searchTerm,
            timestamp: new Date().toISOString()
        });
    }

    handleCargoFilter(cargo) {
        const cards = document.querySelectorAll('#secao-funcionarios .card-funcionario');

        cards.forEach(card => {
            const cargoElement = card.querySelector('.cargo');
            if (cargoElement) {
                const cardCargo = cargoElement.className.split(' ').find(cls =>
                    ['atendente', 'gerente', 'entregador', 'admin', 'cliente'].includes(cls)
                );

                const shouldShow = !cargo || cardCargo === cargo;
                card.style.display = shouldShow ? 'block' : 'none';
            }
        });

        // Emitir evento de filtro
        eventSystem.emit('funcionario:filter', {
            type: 'cargo',
            value: cargo
        });
    }

    handleStatusFilter(status) {
        const cards = document.querySelectorAll('#secao-funcionarios .card-funcionario');

        cards.forEach(card => {
            const toggleElement = card.querySelector('.toggle');
            const statusText = card.querySelector('.status-text');

            if (toggleElement && statusText) {
                const isActive = toggleElement.classList.contains('active');
                const cardStatus = isActive ? 'ativo' : 'inativo';

                const shouldShow = !status || cardStatus === status;
                card.style.display = shouldShow ? 'block' : 'none';
            }
        });

        // Emitir evento de filtro
        eventSystem.emit('funcionario:filter', {
            type: 'status',
            value: status
        });
    }

    handleNewFuncionario() {
        this.openFuncionarioModal();
    }

    openFuncionarioModal(funcionarioData = null) {
        const modal = document.getElementById('modal-funcionario');
        const titulo = document.getElementById('titulo-modal-funcionario');
        const salvarBtn = document.getElementById('salvar-funcionario');
        const camposSenha = document.getElementById('campos-senha');

        if (!modal || !titulo || !salvarBtn) {
            console.error('Elementos da modal não encontrados');
            return;
        }

        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';

        if (funcionarioData) {
            titulo.textContent = 'Editar usuário';
            salvarBtn.innerHTML = '<i class="fa-solid fa-save"></i> Salvar';
            this.currentEditingId = funcionarioData.id;
            this.populateFuncionarioModal(funcionarioData);
            // Ocultar campos de senha na edição
            if (camposSenha) {
                camposSenha.style.display = 'none';
            }
        } else {
            titulo.textContent = 'Adicione um novo usuário';
            salvarBtn.innerHTML = '<i class="fa-solid fa-plus"></i> Adicionar';
            this.currentEditingId = null;
            this.clearFuncionarioModal();
            // Mostrar campos de senha para novo usuário
            if (camposSenha) {
                camposSenha.style.display = 'flex';
            }
        }

        this.setupFuncionarioModalListeners(funcionarioData);
    }

    closeFuncionarioModal() {
        const modal = document.getElementById('modal-funcionario');
        if (modal) {
            modal.style.display = 'none';
            document.body.style.overflow = '';
            this.currentEditingId = null;
        }
    }

    clearFuncionarioModal() {
        const fields = ['nome-funcionario', 'email-funcionario', 'nascimento-funcionario', 'telefone-funcionario', 'cargo-funcionario', 'senha-funcionario', 'confirmar-senha-funcionario'];
        fields.forEach(fieldId => {
            const field = document.getElementById(fieldId);
            if (field) {
                field.value = '';
                field.classList.remove('error', 'success');
            }
        });

        // Limpar validações de senha
        this.clearPasswordValidation();
    }

    populateFuncionarioModal(funcionarioData) {
        const fields = {
            'nome-funcionario': funcionarioData.nome,
            'email-funcionario': funcionarioData.email,
            'nascimento-funcionario': funcionarioData.nascimento || '',
            'telefone-funcionario': funcionarioData.telefone || '',
            'cargo-funcionario': funcionarioData.cargo
        };

        Object.entries(fields).forEach(([fieldId, value]) => {
            const field = document.getElementById(fieldId);
            if (field) {
                field.value = value;
                field.classList.remove('error', 'success');
            }
        });

        // Campos de senha ficam vazios na edição
        const senhaFields = ['senha-funcionario', 'confirmar-senha-funcionario'];
        senhaFields.forEach(fieldId => {
            const field = document.getElementById(fieldId);
            if (field) {
                field.value = '';
                field.classList.remove('error', 'success');
            }
        });

        // Limpar validações de senha
        this.clearPasswordValidation();
    }

    setupFuncionarioModalListeners(funcionarioData = null) {
        this.removeFuncionarioModalListeners();

        const closeBtn = document.querySelector('#modal-funcionario .fechar-modal');
        const cancelBtn = document.getElementById('cancelar-funcionario');
        const salvarBtn = document.getElementById('salvar-funcionario');
        const overlay = document.querySelector('#modal-funcionario .div-overlay');

        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.closeFuncionarioModal());
        }

        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => this.closeFuncionarioModal());
        }

        if (salvarBtn) {
            salvarBtn.addEventListener('click', () => {
                if (funcionarioData) {
                    this.handleEditFuncionario();
                } else {
                    this.handleAddFuncionario();
                }
            });
        }

        if (overlay) {
            overlay.addEventListener('click', () => this.closeFuncionarioModal());
        }

        this.setupFuncionarioValidation();
    }

    removeFuncionarioModalListeners() {
        const modal = document.getElementById('modal-funcionario');
        if (modal) {
            const newModal = modal.cloneNode(true);
            modal.parentNode.replaceChild(newModal, modal);
        }
    }

    setupFuncionarioValidation() {
        const fields = [
            { id: 'nome-funcionario', config: { required: true, minLength: 2 } },
            { id: 'email-funcionario', config: { required: true, type: 'email' } },
            { id: 'nascimento-funcionario', config: { required: true, type: 'date' } },
            { id: 'telefone-funcionario', config: { required: true, type: 'tel' } },
            { id: 'cargo-funcionario', config: { required: true } },
            { id: 'senha-funcionario', config: { required: false, minLength: 8, type: 'password' } },
            { id: 'confirmar-senha-funcionario', config: { required: false, matchField: 'senha-funcionario' } }
        ];

        fields.forEach(({ id, config }) => {
            const field = document.getElementById(id);
            if (field) {
                field.addEventListener('input', () => {
                    this.validateFuncionarioField(field, config);
                    if (id === 'senha-funcionario') {
                        this.validatePasswordRequirements();
                    }
                });
                field.addEventListener('blur', () => this.validateFuncionarioField(field, config));
            }
        });

        // Configurar toggle de senha
        this.setupPasswordToggle();
    }

    validateFuncionarioField(field, config) {
        const value = field.value.trim();
        let isValid = true;
        let errorMessage = '';

        // Validação obrigatória
        if (config.required && !value) {
            isValid = false;
            errorMessage = 'Este campo é obrigatório';
        }

        // Validação de tamanho mínimo
        if (isValid && config.minLength && value.length < config.minLength) {
            isValid = false;
            errorMessage = `Mínimo de ${config.minLength} caracteres`;
        }

        // Validação de email
        if (isValid && config.type === 'email' && value) {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(value)) {
                isValid = false;
                errorMessage = 'Email inválido';
            }
        }

        // Validação de telefone
        if (isValid && config.type === 'tel' && value) {
            const phoneRegex = /^\(\d{2}\)\s\d{4,5}-\d{4}$/;
            if (!phoneRegex.test(value)) {
                isValid = false;
                errorMessage = 'Telefone inválido (formato: (11) 99999-9999)';
            }
        }

        // Validação de data
        if (isValid && config.type === 'date' && value) {
            const date = new Date(value);
            const today = new Date();
            if (date >= today) {
                isValid = false;
                errorMessage = 'Data deve ser anterior a hoje';
            }
        }

        // Validação de senha
        if (isValid && config.type === 'password' && value) {
            if (!this.isValidPassword(value)) {
                isValid = false;
                errorMessage = 'Senha não atende aos requisitos';
            }
        }

        // Validação de confirmação de senha
        if (isValid && config.matchField && value) {
            const matchField = document.getElementById(config.matchField);
            if (matchField && matchField.value !== value) {
                isValid = false;
                errorMessage = 'As senhas não coincidem';
            }
        }

        // Aplicar classes de validação
        field.classList.remove('error', 'success');
        if (value) {
            field.classList.add(isValid ? 'success' : 'error');
        }

        return isValid;
    }

    validateAllFuncionarioFields() {
        const isEditing = this.currentEditingId !== null;

        const fields = [
            { id: 'nome-funcionario', config: { required: true, minLength: 2 } },
            { id: 'email-funcionario', config: { required: true, type: 'email' } },
            { id: 'nascimento-funcionario', config: { required: true, type: 'date' } },
            { id: 'telefone-funcionario', config: { required: true, type: 'tel' } },
            { id: 'cargo-funcionario', config: { required: true } },
            { id: 'senha-funcionario', config: { required: !isEditing, minLength: 8, type: 'password' } },
            { id: 'confirmar-senha-funcionario', config: { required: !isEditing, matchField: 'senha-funcionario' } }
        ];

        let allValid = true;
        fields.forEach(({ id, config }) => {
            const field = document.getElementById(id);
            if (field) {
                const isValid = this.validateFuncionarioField(field, config);
                if (!isValid) allValid = false;
            }
        });

        return allValid;
    }

    handleAddFuncionario() {
        if (!this.validateAllFuncionarioFields()) {
            this.showErrorMessage('Por favor, corrija os erros nos campos');
            return;
        }

        const formData = this.getFuncionarioFormData();
        const funcionario = this.funcionarioDataManager.addFuncionario(formData);

        this.loadFuncionarios();
        this.closeFuncionarioModal();
        this.showSuccessMessage('Funcionário adicionado com sucesso!');
    }

    handleEditFuncionario() {
        if (!this.validateAllFuncionarioFields()) {
            this.showErrorMessage('Por favor, corrija os erros nos campos');
            return;
        }

        const formData = this.getFuncionarioFormData();
        const funcionario = this.funcionarioDataManager.updateFuncionario(this.currentEditingId, formData);

        if (funcionario) {
            this.loadFuncionarios();
            this.closeFuncionarioModal();
            this.showSuccessMessage('Funcionário atualizado com sucesso!');
        } else {
            this.showErrorMessage('Erro ao atualizar funcionário');
        }
    }

    getFuncionarioFormData() {
        return {
            nome: document.getElementById('nome-funcionario')?.value || '',
            email: document.getElementById('email-funcionario')?.value || '',
            nascimento: document.getElementById('nascimento-funcionario')?.value || '',
            telefone: document.getElementById('telefone-funcionario')?.value || '',
            cargo: document.getElementById('cargo-funcionario')?.value || '',
            senha: document.getElementById('senha-funcionario')?.value || ''
        };
    }

    setupPasswordToggle() {
        // Toggle para senha principal
        const mostrarSenha = document.getElementById('mostrar-senha-funcionario');
        const ocultarSenha = document.getElementById('ocultar-senha-funcionario');
        const senhaInput = document.getElementById('senha-funcionario');

        if (mostrarSenha && ocultarSenha && senhaInput) {
            mostrarSenha.addEventListener('click', () => {
                senhaInput.type = 'text';
                mostrarSenha.style.display = 'none';
                ocultarSenha.style.display = 'block';
            });

            ocultarSenha.addEventListener('click', () => {
                senhaInput.type = 'password';
                ocultarSenha.style.display = 'none';
                mostrarSenha.style.display = 'block';
            });
        }

        // Toggle para confirmação de senha
        const mostrarConfirmaSenha = document.getElementById('mostrar-confirma-senha-funcionario');
        const ocultarConfirmaSenha = document.getElementById('ocultar-confirma-senha-funcionario');
        const confirmaSenhaInput = document.getElementById('confirmar-senha-funcionario');

        if (mostrarConfirmaSenha && ocultarConfirmaSenha && confirmaSenhaInput) {
            mostrarConfirmaSenha.addEventListener('click', () => {
                confirmaSenhaInput.type = 'text';
                mostrarConfirmaSenha.style.display = 'none';
                ocultarConfirmaSenha.style.display = 'block';
            });

            ocultarConfirmaSenha.addEventListener('click', () => {
                confirmaSenhaInput.type = 'password';
                ocultarConfirmaSenha.style.display = 'none';
                mostrarConfirmaSenha.style.display = 'block';
            });
        }
    }

    isValidPassword(password) {
        const hasUpperCase = /[A-Z]/.test(password);
        const hasNumber = /\d/.test(password);
        const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);
        const hasMinLength = password.length >= 8;

        return hasUpperCase && hasNumber && hasSpecialChar && hasMinLength;
    }

    validatePasswordRequirements() {
        const password = document.getElementById('senha-funcionario')?.value || '';

        const requirements = {
            'req-maiuscula-funcionario': /[A-Z]/.test(password),
            'req-numero-funcionario': /\d/.test(password),
            'req-especial-funcionario': /[!@#$%^&*(),.?":{}|<>]/.test(password),
            'req-tamanho-funcionario': password.length >= 8
        };

        Object.entries(requirements).forEach(([id, isValid]) => {
            const element = document.getElementById(id);
            if (element) {
                element.classList.remove('valid', 'invalid');
                element.classList.add(isValid ? 'valid' : 'invalid');
            }
        });
    }

    clearPasswordValidation() {
        const requirements = ['req-maiuscula-funcionario', 'req-numero-funcionario', 'req-especial-funcionario', 'req-tamanho-funcionario'];
        requirements.forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.classList.remove('valid', 'invalid');
            }
        });
    }

    loadFuncionarios() {
        const funcionarios = this.funcionarioDataManager.getAllFuncionarios();
        const container = document.querySelector('#secao-funcionarios .funcionarios');

        if (!container) {
            console.error('Container de funcionários não encontrado');
            return;
        }

        container.innerHTML = '';

        funcionarios.forEach(funcionario => {
            const card = this.createFuncionarioCard(funcionario);
            container.appendChild(card);
        });
    }

    createFuncionarioCard(funcionario) {
        const card = document.createElement('div');
        card.className = 'card-funcionario';
        card.dataset.funcionarioId = funcionario.id;

        const cargoClass = funcionario.cargo;
        const cargoText = this.getCargoText(funcionario.cargo);
        const statusClass = funcionario.ativo ? 'active' : '';
        const statusText = funcionario.ativo ? 'Ativo' : 'Inativo';
        const statusIcon = funcionario.ativo ? 'fa-eye' : 'fa-eye-slash';

        card.innerHTML = `
            <div class="header-card">
                <div class="info-principal">
                    <p class="nome-funcionario">${funcionario.nome}</p>
                    <div class="email">
                        <i class="fa-solid fa-envelope"></i>
                        <p>${funcionario.email}</p>
                    </div>
                    <span class="cargo ${cargoClass}">${cargoText}</span>
                </div>
                <div class="controles-header">
                    <button class="btn-editar ${funcionario.cargo === 'admin' ? 'disabled' : ''}" ${funcionario.cargo === 'admin' ? 'title="Não é possível editar administradores"' : ''}>
                        <i class="fa-solid fa-pen-to-square"></i>
                    </button>
                    <div class="toggle-container">
                        <div class="toggle ${statusClass} ${funcionario.cargo === 'admin' ? 'admin-protected' : ''}">
                            <div class="toggle-slider"></div>
                            <input type="checkbox" ${funcionario.ativo ? 'checked' : ''} style="display: none;" ${funcionario.cargo === 'admin' ? 'disabled' : ''}>
                        </div>
                        <div class="status-text ${funcionario.ativo ? '' : 'inactive'}">
                            <i class="fa-solid ${statusIcon}"></i>
                            <span>${statusText}</span>
                        </div>
                    </div>
                </div>
            </div>

            <div class="footer-card">
                <p class="link-metricas ${funcionario.cargo === 'admin' ? 'disabled' : ''}" ${funcionario.cargo === 'admin' ? 'title="Métricas de administradores não estão disponíveis"' : ''}>Exibir métricas</p>
            </div>
        `;

        return card;
    }

    getCargoText(cargo) {
        const cargos = {
            'atendente': 'Atendente',
            'gerente': 'Gerente',
            'entregador': 'Entregador',
            'admin': 'Administrador',
            'cliente': 'Cliente'
        };
        return cargos[cargo] || cargo;
    }

    handleEditClick(button) {
        const card = button.closest('.card-funcionario');
        const funcionarioId = parseInt(card.dataset.funcionarioId);
        const funcionario = this.funcionarioDataManager.getFuncionarioById(funcionarioId);

        if (funcionario) {
            // Verificar se é administrador
            if (funcionario.cargo === 'admin') {
                this.showErrorMessage('Não é possível editar administradores');
                return;
            }

            this.currentEditingId = funcionarioId;
            this.openFuncionarioModal(funcionario);
        }
    }

    handleToggleChange(toggle) {
        const card = toggle.closest('.card-funcionario');
        const funcionarioId = parseInt(card.dataset.funcionarioId);
        const funcionario = this.funcionarioDataManager.getFuncionarioById(funcionarioId);

        if (funcionario) {
            // Verificar se é administrador e se está tentando desativar
            if (funcionario.cargo === 'admin' && !funcionario.ativo) {
                this.showErrorMessage('Não é possível desativar administradores');
                // Reverter o toggle para ativo
                toggle.checked = true;
                return;
            }

            const updatedFuncionario = this.funcionarioDataManager.toggleFuncionarioStatus(funcionarioId);

            if (updatedFuncionario) {
                // Atualizar visual do toggle
                const toggleElement = card.querySelector('.toggle');
                const statusText = card.querySelector('.status-text');
                const statusIcon = card.querySelector('.status-text i');

                if (updatedFuncionario.ativo) {
                    toggleElement.classList.add('active');
                    statusText.classList.remove('inactive');
                    statusText.querySelector('span').textContent = 'Ativo';
                    statusIcon.className = 'fa-solid fa-eye';
                } else {
                    toggleElement.classList.remove('active');
                    statusText.classList.add('inactive');
                    statusText.querySelector('span').textContent = 'Inativo';
                    statusIcon.className = 'fa-solid fa-eye-slash';
                }
            }
        }
    }

    handleMetricsClick(link) {
        const card = link.closest('.card-funcionario');
        const funcionarioId = parseInt(card.dataset.funcionarioId);
        const funcionario = this.funcionarioDataManager.getFuncionarioById(funcionarioId);

        if (funcionario) {
            // Verificar se é administrador
            if (funcionario.cargo === 'admin') {
                this.showErrorMessage('Métricas de administradores não estão disponíveis');
                return;
            }

            this.openMetricasModal(funcionario);
        }
    }

    openMetricasModal(funcionario) {
        const modal = document.getElementById('modal-metricas');
        if (!modal) return;

        // Preencher dados do funcionário
        this.populateMetricasModal(funcionario);

        // Mostrar modal
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';

        // Configurar event listeners
        this.setupMetricasModalListeners();
    }

    populateMetricasModal(funcionario) {
        // Gerar iniciais do nome
        const iniciais = this.generateIniciais(funcionario.nome);
        document.getElementById('iniciais-funcionario').textContent = iniciais;

        // Dados básicos
        document.getElementById('nome-funcionario-metricas').textContent = funcionario.nome;
        document.getElementById('email-funcionario-metricas').textContent = funcionario.email;

        // Cargo
        const cargoElement = document.getElementById('cargo-funcionario-metricas');
        cargoElement.textContent = this.getCargoText(funcionario.cargo);
        cargoElement.className = `cargo-tag ${funcionario.cargo}`;

        // Tempo em atividade
        const tempoAtividade = this.calculateTempoAtividade(funcionario.dataCriacao);
        document.getElementById('tempo-atividade').textContent = tempoAtividade;

        // Dados pessoais
        document.getElementById('cpf-funcionario').textContent = this.generateCPF();
        document.getElementById('nascimento-funcionario').textContent = this.formatDate(funcionario.nascimento);
        document.getElementById('telefone-funcionario').textContent = funcionario.telefone;

        // Métricas baseadas no cargo
        this.populateMetricasByCargo(funcionario.cargo);
    }

    populateMetricasByCargo(cargo) {
        const metricas = this.getMetricasByCargo(cargo);

        // Métrica 1
        document.getElementById('metrica-1-titulo').textContent = metricas.metrica1.titulo;
        document.getElementById('metrica-1-subtitulo').textContent = metricas.metrica1.subtitulo;
        document.getElementById('metrica-1-valor').textContent = metricas.metrica1.valor;

        // Métrica 2
        document.getElementById('metrica-2-titulo').textContent = metricas.metrica2.titulo;
        document.getElementById('metrica-2-subtitulo').textContent = metricas.metrica2.subtitulo;
        document.getElementById('metrica-2-valor').textContent = metricas.metrica2.valor;

        // Métrica 3
        document.getElementById('metrica-3-titulo').textContent = metricas.metrica3.titulo;
        const metrica3Subtitulo = document.getElementById('metrica-3-subtitulo');
        if (metrica3Subtitulo) {
            if (metricas.metrica3.subtitulo) {
                metrica3Subtitulo.textContent = metricas.metrica3.subtitulo;
            } else {
                metrica3Subtitulo.textContent = '';
            }
        }
        document.getElementById('metrica-3-valor').textContent = metricas.metrica3.valor;
    }

    getMetricasByCargo(cargo) {
        const metricas = {
            atendente: {
                metrica1: { titulo: 'Pedidos atendidos', subtitulo: 'Por dia', valor: '45' },
                metrica2: { titulo: 'Tempo médio de atendimento', subtitulo: 'Por pedido', valor: '3.2 min' },
                metrica3: { titulo: 'Avaliação do cliente', subtitulo: null, valor: '4.8' }
            },
            gerente: {
                metrica1: { titulo: 'Produtividade da equipe', subtitulo: 'Pedidos concluídos', valor: '200' },
                metrica2: { titulo: 'Faturamento total', subtitulo: 'Período sob gestão', valor: 'R$ 15.420,00' },
                metrica3: { titulo: 'Avaliação da gestão', subtitulo: null, valor: '4.6' }
            },
            entregador: {
                metrica1: { titulo: 'Média de entregas realizadas', subtitulo: 'Por dia', valor: '12' },
                metrica2: { titulo: 'Tempo médio de entrega', subtitulo: 'Por entrega', valor: '25 min' },
                metrica3: { titulo: 'Avaliação do cliente', subtitulo: null, valor: '4.7' }
            },
            cliente: {
                metrica1: { titulo: 'Pedidos realizados', subtitulo: 'Total', valor: '28' },
                metrica2: { titulo: 'Valor total gasto', subtitulo: 'Histórico', valor: 'R$ 1.240,00' },
                metrica3: { titulo: 'Último pedido', subtitulo: null, valor: 'Há 3 dias' }
            }
        };

        return metricas[cargo] || metricas.atendente;
    }

    generateIniciais(nome) {
        return nome.split(' ')
            .map(n => n.charAt(0))
            .join('')
            .toUpperCase()
            .substring(0, 2);
    }

    calculateTempoAtividade(dataCriacao) {
        const hoje = new Date();
        const criacao = new Date(dataCriacao);
        const diffTime = Math.abs(hoje - criacao);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return `${diffDays} Dias`;
    }

    generateCPF() {
        // Gerar CPF fictício para demonstração
        const cpf = Math.floor(Math.random() * 900000000) + 100000000;
        return cpf.toString().replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    }

    formatDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleDateString('pt-BR');
    }

    setupMetricasModalListeners() {
        const modal = document.getElementById('modal-metricas');
        const fecharBtn = document.getElementById('fechar-metricas');
        const overlay = modal ? modal.querySelector('.div-overlay') : null;

        // Fechar modal
        const closeModal = () => {
            modal.style.display = 'none';
            document.body.style.overflow = '';
        };

        // Remover listeners anteriores para evitar duplicação
        if (fecharBtn) {
            fecharBtn.removeEventListener('click', closeModal);
            fecharBtn.addEventListener('click', closeModal);
        }

        if (overlay) {
            overlay.removeEventListener('click', closeModal);
            overlay.addEventListener('click', closeModal);
        }
    }

    showSuccessMessage(message) {
        showToast(message, { type: 'success', title: 'Sucesso' });
    }

    showErrorMessage(message) {
        showToast(message, { type: 'error', title: 'Erro' });
    }
}

// ============================================================================

/**
 * Inicializa o painel administrativo
 */
function initializeAdminPanel() {
    // Inicializando Painel Administrativo

    try {
        // Verificar permissões antes de inicializar
        if (!AuthManager.verifyAdminPermissions()) {
            return;
        }

        // Emitir evento de inicialização
        eventSystem.emit('adminPanel:initializing');

        // Inicializar gerenciador de seções
        window.adminPanel = new SectionManager();

        // Configurar listeners globais
        setupGlobalEventListeners();

        // Emitir evento de inicialização completa
        eventSystem.emit('adminPanel:initialized');

        // Painel Administrativo inicializado com sucesso
    } catch (error) {
        console.error('Erro ao inicializar painel administrativo:', error);
        eventSystem.emit('adminPanel:initError', { error });

        setFlashMessage({
            type: 'error',
            title: 'Erro de Inicialização',
            message: 'Não foi possível inicializar o painel administrativo. Recarregue a página.'
        });
    }
}

/**
 * Configura listeners globais do sistema
 */
function setupGlobalEventListeners() {
    // Listener para mudanças de seção
    eventSystem.on('section:afterInit', (data) => {
        // Seção inicializada com sucesso
    });

    // Listener para erros de seção
    eventSystem.on('section:initError', (data) => {
        console.error(`Erro ao inicializar seção ${data.sectionId}:`, data.error);
    });

    // Listener para mudanças de dados (exemplo para futuras integrações)
    eventSystem.on('data:changed', (data) => {
        // Dados alterados
        // Aqui você pode implementar lógica para salvar automaticamente
        // ou atualizar outras partes da interface
    });
}


// ============================================================================
// GERENCIADOR DE CATEGORIAS DO CARDÁPIO
// ============================================================================

/**
 * Gerenciador de dados de categorias (mock)
 */
class CategoriaDataManager {
    constructor() {
        this.categorias = [
            {
                id: 1, nome: 'Hambúrgueres', ordem: 1, itens: [
                    { id: 1, nome: 'Hambúrguer Clássico', valor: 'R$ 15,90' },
                    { id: 2, nome: 'Hambúrguer Especial', valor: 'R$ 18,90' },
                    { id: 3, nome: 'Hambúrguer Vegetariano', valor: 'R$ 16,90' }
                ]
            },
            {
                id: 2, nome: 'Bebidas', ordem: 2, itens: [
                    { id: 4, nome: 'Coca-Cola', valor: 'R$ 4,50' },
                    { id: 5, nome: 'Suco de Laranja', valor: 'R$ 6,00' },
                    { id: 6, nome: 'Água', valor: 'R$ 2,50' }
                ]
            },
            {
                id: 3, nome: 'Acompanhamentos', ordem: 3, itens: [
                    { id: 7, nome: 'Batata Frita', valor: 'R$ 8,90' },
                    { id: 8, nome: 'Onion Rings', valor: 'R$ 9,90' }
                ]
            }
        ];

        // Todos os produtos disponíveis para adicionar às categorias
        this.todosProdutos = [
            { id: 101, nome: 'Hambúrguer Clássico', valor: 'R$ 15,90', categoria: 'Hambúrgueres' },
            { id: 102, nome: 'Hambúrguer Especial', valor: 'R$ 18,90', categoria: 'Hambúrgueres' },
            { id: 103, nome: 'Hambúrguer Vegetariano', valor: 'R$ 16,90', categoria: 'Hambúrgueres' },
            { id: 104, nome: 'Hambúrguer Duplo', valor: 'R$ 22,90', categoria: 'Hambúrgueres' },
            { id: 105, nome: 'Hambúrguer Bacon', valor: 'R$ 19,90', categoria: 'Hambúrgueres' },
            { id: 106, nome: 'Coca-Cola', valor: 'R$ 4,50', categoria: 'Bebidas' },
            { id: 107, nome: 'Suco de Laranja', valor: 'R$ 6,00', categoria: 'Bebidas' },
            { id: 108, nome: 'Água', valor: 'R$ 2,50', categoria: 'Bebidas' },
            { id: 109, nome: 'Refrigerante Guaraná', valor: 'R$ 4,50', categoria: 'Bebidas' },
            { id: 110, nome: 'Cerveja', valor: 'R$ 8,90', categoria: 'Bebidas' },
            { id: 111, nome: 'Batata Frita', valor: 'R$ 8,90', categoria: 'Acompanhamentos' },
            { id: 112, nome: 'Onion Rings', valor: 'R$ 9,90', categoria: 'Acompanhamentos' },
            { id: 113, nome: 'Nuggets', valor: 'R$ 12,90', categoria: 'Acompanhamentos' },
            { id: 114, nome: 'Salada', valor: 'R$ 7,90', categoria: 'Acompanhamentos' }
        ];
    }

    getAllCategorias() {
        return this.categorias.sort((a, b) => a.ordem - b.ordem);
    }

    getCategoriaById(id) {
        return this.categorias.find(c => c.id === id);
    }

    addCategoria(nome) {
        const novaCategoria = {
            id: Date.now(),
            nome: nome,
            ordem: this.categorias.length + 1,
            itens: []
        };
        this.categorias.push(novaCategoria);
        return novaCategoria;
    }

    updateCategoria(id, nome) {
        const categoria = this.getCategoriaById(id);
        if (categoria) {
            categoria.nome = nome;
            return categoria;
        }
        return null;
    }

    deleteCategoria(id) {
        const index = this.categorias.findIndex(c => c.id === id);
        if (index > -1) {
            this.categorias.splice(index, 1);
            return true;
        }
        return false;
    }

    reorderCategorias(categoriasOrdenadas) {
        categoriasOrdenadas.forEach((categoria, index) => {
            const cat = this.getCategoriaById(categoria.id);
            if (cat) {
                cat.ordem = index + 1;
            }
        });
    }

    getItensByCategoria(categoriaId) {
        const categoria = this.getCategoriaById(categoriaId);
        return categoria ? categoria.itens : [];
    }

    addItemToCategoria(categoriaId, nomeItem, valor = 'R$ 0,00') {
        const categoria = this.getCategoriaById(categoriaId);
        if (categoria) {
            const novoItem = {
                id: Date.now(),
                nome: nomeItem,
                valor: valor
            };
            categoria.itens.push(novoItem);
            return novoItem;
        }
        return null;
    }

    updateItem(categoriaId, itemId, nomeItem) {
        const categoria = this.getCategoriaById(categoriaId);
        if (categoria) {
            const item = categoria.itens.find(i => i.id === itemId);
            if (item) {
                item.nome = nomeItem;
                return item;
            }
        }
        return null;
    }

    deleteItem(categoriaId, itemId) {
        const categoria = this.getCategoriaById(categoriaId);
        if (categoria) {
            const index = categoria.itens.findIndex(i => i.id === itemId);
            if (index > -1) {
                categoria.itens.splice(index, 1);
                return true;
            }
        }
        return false;
    }

    getAllProdutos() {
        return this.todosProdutos;
    }

    getProdutosDisponiveis(categoriaId) {
        const categoria = this.getCategoriaById(categoriaId);
        if (!categoria) return [];

        const itensIds = categoria.itens.map(item => item.id);
        return this.todosProdutos.filter(produto => !itensIds.includes(produto.id));
    }
}

/**
 * Gerenciador das modais de categorias e itens
 */
class CategoriaManager {
    constructor() {
        this.categoriaDataManager = new CategoriaDataManager();
        this.currentCategoriaId = null;
        this.draggedElement = null;
        this.editandoCategoria = null;
    }

    init() {
        this.setupEventListeners();
    }

    setupEventListeners() {
        // Botão para abrir modal de categorias usando ID específico
        const btnCategorias = document.getElementById('btn-categorias');

        if (btnCategorias) {
            btnCategorias.addEventListener('click', (e) => {
                e.preventDefault();
                this.openCategoriasModal();
            });
        }

        // Event listeners da modal de categorias
        this.setupCategoriasModalListeners();

        // Event listeners da modal de itens
        this.setupItensModalListeners();

        // Event listeners da modal de formulário de categoria
        this.setupCategoriaFormModalListeners();

        // Event listeners da modal de produtos
        this.setupProdutosModalListeners();
    }

    setupCategoriasModalListeners() {
        // Botões da modal de categorias
        document.getElementById('cancelar-categorias')?.addEventListener('click', () => this.closeCategoriasModal());
        document.getElementById('salvar-categorias')?.addEventListener('click', () => this.saveCategorias());
        document.getElementById('btn-adicionar-categoria')?.addEventListener('click', () => this.addCategoria());

        // Overlay para fechar modal
        const overlay = document.querySelector('#modal-categorias .div-overlay');
        if (overlay) {
            overlay.addEventListener('click', () => this.closeCategoriasModal());
        }
    }

    setupItensModalListeners() {
        // Botões da modal de itens
        document.getElementById('cancelar-itens')?.addEventListener('click', () => this.closeItensModal());
        document.getElementById('salvar-itens')?.addEventListener('click', () => this.saveItens());
        document.getElementById('btn-adicionar-item')?.addEventListener('click', () => this.addItem());
        document.getElementById('voltar-categorias')?.addEventListener('click', () => this.voltarParaCategorias());

        // Overlay para fechar modal
        const overlay = document.querySelector('#modal-itens .div-overlay');
        if (overlay) {
            overlay.addEventListener('click', () => this.closeItensModal());
        }
    }

    setupCategoriaFormModalListeners() {
        // Botões da modal de formulário de categoria
        document.getElementById('cancelar-categoria-form')?.addEventListener('click', () => this.closeCategoriaFormModal());
        document.getElementById('salvar-categoria-form')?.addEventListener('click', () => this.saveCategoriaForm());

        // Overlay para fechar modal
        const overlay = document.querySelector('#modal-categoria-form .div-overlay');
        if (overlay) {
            overlay.addEventListener('click', () => this.closeCategoriaFormModal());
        }
    }

    setupProdutosModalListeners() {
        // Botões da modal de produtos
        document.getElementById('cancelar-produtos')?.addEventListener('click', () => this.closeProdutosModal());
        document.getElementById('adicionar-produtos')?.addEventListener('click', () => this.adicionarProdutosSelecionados());

        // Busca de produtos
        document.getElementById('busca-produto-modal')?.addEventListener('input', (e) => this.filtrarProdutos(e.target.value));

        // Overlay para fechar modal
        const overlay = document.querySelector('#modal-produtos .div-overlay');
        if (overlay) {
            overlay.addEventListener('click', () => this.closeProdutosModal());
        }
    }

    openCategoriasModal() {
        const modal = document.getElementById('modal-categorias');

        if (!modal) {
            return;
        }

        this.loadCategorias();
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    }

    closeCategoriasModal() {
        const modal = document.getElementById('modal-categorias');
        if (modal) {
            modal.style.display = 'none';
            document.body.style.overflow = '';
        }
    }

    openItensModal(categoriaId) {
        const modal = document.getElementById('modal-itens');
        if (!modal) return;

        this.currentCategoriaId = categoriaId;
        const categoria = this.categoriaDataManager.getCategoriaById(categoriaId);

        if (categoria) {
            document.getElementById('titulo-itens-categoria').textContent = `Itens da Categoria: ${categoria.nome}`;
            this.loadItens(categoriaId);
            modal.style.display = 'flex';
            document.body.style.overflow = 'hidden';
        }
    }

    closeItensModal() {
        const modal = document.getElementById('modal-itens');
        if (modal) {
            modal.style.display = 'none';
            document.body.style.overflow = '';
        }
    }

    voltarParaCategorias() {
        this.closeItensModal();
        this.openCategoriasModal();
    }

    loadCategorias() {
        const categorias = this.categoriaDataManager.getAllCategorias();
        const container = document.getElementById('lista-categorias');

        if (!container) return;

        container.innerHTML = '';

        categorias.forEach(categoria => {
            const categoriaElement = this.createCategoriaElement(categoria);
            container.appendChild(categoriaElement);
        });

        this.setupDragAndDrop();
    }

    createCategoriaElement(categoria) {
        const div = document.createElement('div');
        div.className = 'categoria-item';
        div.draggable = true;
        div.dataset.categoriaId = categoria.id;

        div.innerHTML = `
            <div class="drag-handle">
                <i class="fa-solid fa-grip-vertical"></i>
            </div>
            <p class="nome-categoria">${categoria.nome}</p>
            <div class="acoes-categoria">
                <a href="#" class="btn-acessar" data-categoria-id="${categoria.id}">
                    Acessar categoria
                    <i class="fa-solid fa-external-link-alt"></i>
                </a>
                <button class="btn-editar" data-categoria-id="${categoria.id}">
                    <i class="fa-solid fa-pen-to-square"></i>
                </button>
                <button class="btn-excluir" data-categoria-id="${categoria.id}">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
        `;

        // Event listeners
        div.querySelector('.btn-acessar').addEventListener('click', (e) => {
            e.preventDefault();
            this.openItensModal(categoria.id);
        });

        div.querySelector('.btn-editar').addEventListener('click', () => {
            this.editCategoria(categoria.id);
        });

        div.querySelector('.btn-excluir').addEventListener('click', () => {
            this.deleteCategoria(categoria.id);
        });

        return div;
    }

    setupDragAndDrop() {
        const container = document.getElementById('lista-categorias');
        if (!container) return;

        // Drag events
        container.addEventListener('dragstart', (e) => {
            if (e.target.classList.contains('categoria-item')) {
                this.draggedElement = e.target;
                e.target.classList.add('dragging');
            }
        });

        container.addEventListener('dragend', (e) => {
            if (e.target.classList.contains('categoria-item')) {
                e.target.classList.remove('dragging');
                this.draggedElement = null;
            }
        });

        container.addEventListener('dragover', (e) => {
            e.preventDefault();
            const afterElement = this.getDragAfterElement(container, e.clientY);
            const dragging = container.querySelector('.dragging');

            if (afterElement == null) {
                container.appendChild(dragging);
            } else {
                container.insertBefore(dragging, afterElement);
            }
        });
    }

    getDragAfterElement(container, y) {
        const draggableElements = [...container.querySelectorAll('.categoria-item:not(.dragging)')];

        return draggableElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = y - box.top - box.height / 2;

            if (offset < 0 && offset > closest.offset) {
                return { offset: offset, element: child };
            } else {
                return closest;
            }
        }, { offset: Number.NEGATIVE_INFINITY }).element;
    }

    addCategoria() {
        this.editandoCategoria = null;
        this.openCategoriaFormModal();
    }

    editCategoria(categoriaId) {
        this.editandoCategoria = categoriaId;
        this.openCategoriaFormModal();
    }

    async deleteCategoria(categoriaId) {
        const categoria = this.categoriaDataManager.getCategoriaById(categoriaId);
        if (!categoria) return;

        const confirmado = await showConfirm({
            title: 'Confirmar Exclusão',
            message: `Tem certeza que deseja excluir a categoria "${categoria.nome}"?`,
            confirmText: 'Excluir',
            cancelText: 'Cancelar',
            type: 'delete'
        });

        if (confirmado) {
            const sucesso = this.categoriaDataManager.deleteCategoria(categoriaId);
            if (sucesso) {
                this.loadCategorias();
                this.showSuccessMessage(`Categoria "${categoria.nome}" excluída com sucesso!`);
            }
        }
    }

    saveCategorias() {
        // Salvar nova ordem das categorias
        const container = document.getElementById('lista-categorias');
        const categoriasOrdenadas = Array.from(container.querySelectorAll('.categoria-item')).map(el => ({
            id: parseInt(el.dataset.categoriaId)
        }));

        this.categoriaDataManager.reorderCategorias(categoriasOrdenadas);
        this.showSuccessMessage('Ordem das categorias salva com sucesso!');
        this.closeCategoriasModal();
    }

    loadItens(categoriaId) {
        const itens = this.categoriaDataManager.getItensByCategoria(categoriaId);
        const container = document.getElementById('lista-itens');

        if (!container) return;

        container.innerHTML = '';

        itens.forEach(item => {
            const itemElement = this.createItemElement(item);
            container.appendChild(itemElement);
        });
    }

    createItemElement(item) {
        const div = document.createElement('div');
        div.className = 'item-categoria';
        div.dataset.itemId = item.id;

        div.innerHTML = `
            <div class="info-item">
                <p class="nome-item">${item.nome}</p>
                <p class="valor-item">${item.valor || 'R$ 0,00'}</p>
            </div>
            <div class="acoes-item">
                <button class="btn-editar" data-item-id="${item.id}" title="Editar produto">
                    <i class="fa-solid fa-pen-to-square"></i>
                </button>
                <button class="btn-excluir" data-item-id="${item.id}" title="Remover da categoria">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
        `;

        // Event listeners
        div.querySelector('.btn-editar').addEventListener('click', () => {
            this.redirectToProdutos(item.id);
        });

        div.querySelector('.btn-excluir').addEventListener('click', () => {
            this.deleteItem(item.id);
        });

        return div;
    }

    addItem() {
        if (!this.currentCategoriaId) return;
        this.openProdutosModal();
    }

    redirectToProdutos(itemId) {
        // Fechar todas as modais abertas
        this.closeItensModal();
        this.closeCategoriasModal();
        this.closeProdutosModal();
        this.closeCategoriaFormModal();

        // Ir para seção de produtos
        const sectionManager = window.adminPanel;
        if (sectionManager) {
            sectionManager.showSection('secao-cardapio');
        }

        this.showSuccessMessage('Redirecionando para a seção de produtos...');
    }

    editItem(itemId) {
        if (!this.currentCategoriaId) return;

        const item = this.categoriaDataManager.getItensByCategoria(this.currentCategoriaId)
            .find(i => i.id === itemId);

        if (!item) return;

        const novoNome = prompt('Digite o novo nome do item:', item.nome);
        if (novoNome && novoNome.trim() && novoNome.trim() !== item.nome) {
            const itemAtualizado = this.categoriaDataManager.updateItem(this.currentCategoriaId, itemId, novoNome.trim());
            if (itemAtualizado) {
                this.loadItens(this.currentCategoriaId);
                this.showSuccessMessage(`Item atualizado para "${itemAtualizado.nome}"!`);
            }
        }
    }

    async deleteItem(itemId) {
        if (!this.currentCategoriaId) return;

        const item = this.categoriaDataManager.getItensByCategoria(this.currentCategoriaId)
            .find(i => i.id === itemId);

        if (!item) return;

        const confirmado = await showConfirm({
            title: 'Confirmar Exclusão',
            message: `Tem certeza que deseja excluir o item "${item.nome}"?`,
            confirmText: 'Excluir',
            cancelText: 'Cancelar',
            type: 'delete'
        });

        if (confirmado) {
            const sucesso = this.categoriaDataManager.deleteItem(this.currentCategoriaId, itemId);
            if (sucesso) {
                this.loadItens(this.currentCategoriaId);
                this.showSuccessMessage(`Item "${item.nome}" excluído com sucesso!`);
            }
        }
    }

    saveItens() {
        this.showSuccessMessage('Itens salvos com sucesso!');
        this.closeItensModal();
    }

    // Modal de seleção de produtos
    openProdutosModal() {
        const modal = document.getElementById('modal-produtos');

        if (!modal) {
            return;
        }

        this.produtosSelecionados = new Set();
        this.loadProdutosDisponiveis();
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    }

    closeProdutosModal() {
        const modal = document.getElementById('modal-produtos');
        const inputBusca = document.getElementById('busca-produto-modal');

        if (modal) {
            modal.style.display = 'none';
            document.body.style.overflow = '';
        }

        if (inputBusca) {
            inputBusca.value = '';
        }

        this.produtosSelecionados = new Set();
    }

    loadProdutosDisponiveis() {
        const produtosDisponiveis = this.categoriaDataManager.getProdutosDisponiveis(this.currentCategoriaId);
        const container = document.getElementById('lista-produtos');

        if (!container) return;

        container.innerHTML = '';

        if (produtosDisponiveis.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: #6b7280; padding: 20px;">Não há produtos disponíveis para adicionar a esta categoria.</p>';
            return;
        }

        produtosDisponiveis.forEach(produto => {
            const produtoElement = this.createProdutoElement(produto);
            container.appendChild(produtoElement);
        });
    }

    createProdutoElement(produto) {
        const div = document.createElement('div');
        div.className = 'produto-item';
        div.dataset.produtoId = produto.id;

        div.innerHTML = `
            <input type="checkbox" class="checkbox-produto" data-produto-id="${produto.id}">
            <div class="info-produto">
                <p class="nome-produto">${produto.nome}</p>
                <p class="valor-produto">${produto.valor}</p>
            </div>
        `;

        // Event listeners
        const checkbox = div.querySelector('.checkbox-produto');
        checkbox.addEventListener('change', (e) => {
            this.toggleProdutoSelecao(produto.id, e.target.checked);
        });

        // Clique no item também seleciona/deseleciona
        div.addEventListener('click', (e) => {
            if (e.target !== checkbox) {
                checkbox.checked = !checkbox.checked;
                this.toggleProdutoSelecao(produto.id, checkbox.checked);
            }
        });

        return div;
    }

    toggleProdutoSelecao(produtoId, selecionado) {
        const produtoElement = document.querySelector(`[data-produto-id="${produtoId}"]`);

        if (selecionado) {
            this.produtosSelecionados.add(produtoId);
            produtoElement.classList.add('selecionado');
        } else {
            this.produtosSelecionados.delete(produtoId);
            produtoElement.classList.remove('selecionado');
        }

        this.updateBotaoAdicionar();
    }

    updateBotaoAdicionar() {
        const btnAdicionar = document.getElementById('adicionar-produtos');
        if (btnAdicionar) {
            btnAdicionar.disabled = this.produtosSelecionados.size === 0;
        }
    }

    filtrarProdutos(termo) {
        const produtos = document.querySelectorAll('.produto-item');
        const termoLower = termo.toLowerCase();

        produtos.forEach(produto => {
            const nome = produto.querySelector('.nome-produto').textContent.toLowerCase();
            const valor = produto.querySelector('.valor-produto').textContent.toLowerCase();

            if (nome.includes(termoLower) || valor.includes(termoLower)) {
                produto.style.display = 'flex';
            } else {
                produto.style.display = 'none';
            }
        });
    }

    adicionarProdutosSelecionados() {
        if (this.produtosSelecionados.size === 0) {
            this.showSuccessMessage('Selecione pelo menos um produto para adicionar.');
            return;
        }

        const todosProdutos = this.categoriaDataManager.getAllProdutos();
        let adicionados = 0;

        this.produtosSelecionados.forEach(produtoId => {
            const produto = todosProdutos.find(p => p.id === produtoId);
            if (produto) {
                const novoItem = this.categoriaDataManager.addItemToCategoria(
                    this.currentCategoriaId,
                    produto.nome,
                    produto.valor
                );
                if (novoItem) {
                    adicionados++;
                }
            }
        });

        if (adicionados > 0) {
            this.loadItens(this.currentCategoriaId);
            this.showSuccessMessage(`${adicionados} produto(s) adicionado(s) com sucesso!`);
            this.closeProdutosModal();
        }
    }

    // Métodos da modal de formulário de categoria
    openCategoriaFormModal() {
        const modal = document.getElementById('modal-categoria-form');
        const titulo = document.getElementById('titulo-categoria-form');
        const input = document.getElementById('nome-categoria-input');

        if (this.editandoCategoria) {
            // Modo edição
            const categoria = this.categoriaDataManager.getCategoriaById(this.editandoCategoria);
            if (categoria) {
                titulo.textContent = 'Editar Categoria';
                input.value = categoria.nome;
            }
        } else {
            // Modo adição
            titulo.textContent = 'Adicionar Categoria';
            input.value = '';
        }

        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
        input.focus();
    }

    closeCategoriaFormModal() {
        const modal = document.getElementById('modal-categoria-form');
        const input = document.getElementById('nome-categoria-input');

        modal.style.display = 'none';
        document.body.style.overflow = '';
        input.value = '';
        input.classList.remove('error', 'success');
        this.editandoCategoria = null;
    }

    saveCategoriaForm() {
        const input = document.getElementById('nome-categoria-input');
        const nome = input.value.trim();

        // Validação
        if (!nome) {
            input.classList.add('error');
            input.classList.remove('success');
            return;
        }

        input.classList.add('success');
        input.classList.remove('error');

        if (this.editandoCategoria) {
            // Editar categoria existente
            const categoriaAtualizada = this.categoriaDataManager.updateCategoria(this.editandoCategoria, nome);
            if (categoriaAtualizada) {
                this.loadCategorias();
                this.showSuccessMessage(`Categoria atualizada para "${categoriaAtualizada.nome}"!`);
            }
        } else {
            // Adicionar nova categoria
            const novaCategoria = this.categoriaDataManager.addCategoria(nome);
            this.loadCategorias();
            this.showSuccessMessage(`Categoria "${novaCategoria.nome}" adicionada com sucesso!`);
        }

        this.closeCategoriaFormModal();
    }

    showSuccessMessage(message) {
        showToast(message, { type: 'success', title: 'Sucesso' });
    }
}

// Inicializar quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', () => {
    initializeAdminPanel();

    // Inicializar gerenciador de categorias
    const categoriaManager = new CategoriaManager();
    categoriaManager.init();
});