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
import { setFlashMessage } from './alerts.js';

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
            { id: 'secao-estoque', handler: null },
            { id: 'secao-relatorios', handler: null },
            { id: 'secao-finaceiro', handler: null },
            { id: 'secao-funcionarios', handler: null },
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
                
                handler();
                
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
        console.log(`Status do produto "${productName}" alterado para: ${toggle.checked ? 'Disponível' : 'Indisponível'}`);
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
            console.log('Produto salvo:', formData);
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
        // Usar alert por enquanto, pode ser substituído por um sistema de notificações mais elegante
        alert(`❌ Erro de validação:\n\n${message}`);
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
 * Inicializa o painel administrativo
 */
function initializeAdminPanel() {
    console.log('Inicializando Painel Administrativo...');
    
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
        
        console.log('Painel Administrativo inicializado com sucesso!');
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
        console.log(`Seção ${data.sectionId} inicializada com sucesso`);
    });
    
    // Listener para erros de seção
    eventSystem.on('section:initError', (data) => {
        console.error(`Erro ao inicializar seção ${data.sectionId}:`, data.error);
    });
    
    // Listener para mudanças de dados (exemplo para futuras integrações)
    eventSystem.on('data:changed', (data) => {
        console.log('Dados alterados:', data);
        // Aqui você pode implementar lógica para salvar automaticamente
        // ou atualizar outras partes da interface
    });
}

// Inicializar quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', initializeAdminPanel);