/**
 * Painel Administrativo - Sistema Royal Burger
 * Arquivo principal com funções comuns e gerenciamento de seções
 */

// Importações dos módulos específicos
import { UsuarioManager } from './usuarios-gerenciamento.js';
import { ProdutoManager } from './produtos-gerenciamento.js';
import { InsumoManager } from './insumos-gerenciamento.js';
import { CategoriaManager } from './categorias-gerenciamento.js';
import { showToast } from '../alerts.js';

/**
 * Configurações do painel administrativo
 */
const ADMIN_CONFIG = {
    sections: {
        dashboard: 'secao-dashboard',
        pedidos: 'secao-pedidos',
        venda: 'secao-venda',
        cardapio: 'secao-cardapio',
        estoque: 'secao-estoque',
        relatorios: 'secao-relatorios',
        financeiro: 'secao-financeiro',
        funcionarios: 'secao-funcionarios',
        configuracoes: 'secao-configuracoes'
    },
    navigation: {
        dashboard: 'nav-dashboard',
        pedidos: 'nav-pedidos',
        venda: 'nav-venda',
        cardapio: 'nav-cardapio',
        estoque: 'nav-estoque',
        relatorios: 'nav-relatorios',
        financeiro: 'nav-financeiro',
        funcionarios: 'nav-funcionarios',
        configuracoes: 'nav-configuracoes'
    },
    storage: {
        activeSection: 'activePanelSection',
        userPreferences: 'userPreferences'
    }
};

/**
 * Gerenciador principal do painel administrativo
 */
class AdminPanelManager {
    constructor() {
        this.currentSection = null;
        this.managers = {
            usuarios: null,
            produtos: null,
            insumos: null,
            categorias: null
        };
        this.isInitialized = false;
    }

    /**
     * Inicializa o painel administrativo
     */
    async init() {
        try {

            
            // Verificar permissões de administrador
            if (!(await this.verifyAdminPermissions())) {
                this.handleAuthError('Sessão expirada. Faça login novamente.');
                return;
            }

            // Configurar navegação
            this.setupNavigation();
            
            // Carregar seção ativa
            await this.loadActiveSection();
            
            // Configurar event listeners globais
            this.setupGlobalEventListeners();
            
            // Inicializar módulos específicos
            await this.initializeModules();
            
            this.isInitialized = true;
            
        } catch (error) {
            console.error('Erro ao inicializar painel administrativo:', error);
            this.showErrorMessage('Erro ao inicializar painel administrativo');
        }
    }

    /**
     * Verifica permissões de administrador
     */
    async verifyAdminPermissions() {
        try {
            // Primeiro verificar se o token é válido
            const isTokenValid = await this.verifyTokenValidity();
            if (!isTokenValid) {
                return false;
            }

            // Verificar diferentes chaves possíveis no localStorage
            const userData = localStorage.getItem('rb.user') || 
                           localStorage.getItem('userData') || 
                           localStorage.getItem('user');
            
            if (!userData) {
                return false;
            }

            const user = JSON.parse(userData);
            
            const normalizedRole = this.normalizeUserRole(user);
            
            const hasPermission = normalizedRole === 'admin' || normalizedRole === 'gerente';
            
            return hasPermission;
        } catch (error) {
            console.error('Erro ao verificar permissões:', error);
            return false;
        }
    }

    /**
     * Normaliza role do usuário
     */
    normalizeUserRole(user) {
        if (!user) return 'cliente';
        
        // Verificar diferentes campos possíveis para o role
        const role = (user.role || user.profile || user.type || user.user_type || 'cliente').toLowerCase();
        
        const roleMapping = {
            'admin': 'admin',
            'administrador': 'admin',
            'gerente': 'gerente',
            'manager': 'gerente',
            'garçom': 'garcom',
            'waiter': 'garcom',
            'cozinheiro': 'cozinheiro',
            'chef': 'cozinheiro',
            'caixa': 'caixa',
            'cashier': 'caixa',
            'customer': 'cliente',
            'cliente': 'cliente'
        };
        
        const normalizedRole = roleMapping[role] || 'cliente';
        
        return normalizedRole;
    }

    /**
     * Trata erro de autenticação
     */
    handleAuthError(message) {
        console.error('Erro de autenticação:', message);
        
        // Verificar se é erro de token expirado ou permissões
        const isTokenExpired = message.includes('Sessão expirada') || message.includes('token expirado');
        const errorMessage = isTokenExpired ? 
            'Sua sessão expirou. Faça login novamente para continuar.' : 
            'Acesso negado. Permissões de administrador necessárias.';
            
        this.showErrorMessage(errorMessage);
        
        // Redirecionar para login após 3 segundos
        setTimeout(() => {
            // Usar o caminho correto baseado na localização atual
            const currentPath = window.location.pathname;
            const isInPagesFolder = currentPath.includes('/pages/');
            
            if (isInPagesFolder) {
                window.location.href = 'login.html';
            } else {
                window.location.href = 'src/pages/login.html';
            }
        }, 3000);
    }

    /**
     * Configura navegação do painel
     */
    setupNavigation() {
        const navItems = document.querySelectorAll('.navegacao__item');
        
        navItems.forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const sectionId = this.getSectionIdFromNav(item.id);
                if (sectionId) {
                    this.showSection(sectionId);
                } else {
                    console.error('❌ Nenhuma seção mapeada para:', item.id);
                }
            });
        });
    }

    /**
     * Obtém ID da seção a partir do ID da navegação
     */
    getSectionIdFromNav(navId) {
        const mapping = {
            'nav-dashboard': 'dashboard',
            'nav-pedidos': 'pedidos',
            'nav-venda': 'venda',
            'nav-cardapio': 'cardapio',
            'nav-estoque': 'estoque',
            'nav-relatorios': 'relatorios',
            'nav-financeiro': 'financeiro',
            'nav-funcionarios': 'funcionarios',
            'nav-configuracoes': 'configuracoes'
        };
        
        return mapping[navId] || null;
    }

    /**
     * Exibe uma seção específica
     */
    async showSection(sectionId) {
        try {
            // Validar seção
            if (!this.isValidSection(sectionId)) {
                console.error('❌ Seção inválida:', sectionId);
                return;
            }

            // Esconder todas as seções
            this.hideAllSections();
            
            // Mostrar seção alvo
            this.showTargetSection(sectionId);
            
            // Atualizar navegação
            this.updateNavigation(sectionId);
            
            // Salvar seção ativa
            this.saveActiveSection(sectionId);
            
            // Inicializar seção se necessário
            await this.initializeSection(sectionId);
            
            this.currentSection = sectionId;
            
        } catch (error) {
            console.error('❌ Erro ao mostrar seção:', error);
            this.handleSectionError(sectionId, error);
        }
    }

    /**
     * Valida seção
     */
    isValidSection(sectionId) {
        const sectionElementId = `secao-${sectionId}`;
        const isValid = Object.values(ADMIN_CONFIG.sections).includes(sectionElementId);
        return isValid;
    }

    /**
     * Esconde todas as seções
     */
    hideAllSections() {
        Object.values(ADMIN_CONFIG.sections).forEach(sectionId => {
            const section = document.getElementById(sectionId);
            if (section) {
                section.style.display = 'none';
            } else {
                console.warn('⚠️ Seção não encontrada:', sectionId);
            }
        });
    }

    /**
     * Mostra seção alvo
     */
    showTargetSection(sectionId) {
        const targetSectionId = `secao-${sectionId}`;
        const targetSection = document.getElementById(targetSectionId);
        if (targetSection) {
            targetSection.style.display = 'block';
        } else {
            console.error('❌ Seção não encontrada:', targetSectionId);
        }
    }

    /**
     * Atualiza navegação
     */
    updateNavigation(sectionId) {
        // Remover classe ativa de todos os itens
        document.querySelectorAll('.navegacao__item').forEach(item => {
            item.classList.remove('active');
        });
        
        // Adicionar classe ativa ao item correspondente
        const navItem = document.getElementById(`nav-${sectionId}`);
        if (navItem) {
            navItem.classList.add('active');
        }
    }

    /**
     * Salva seção ativa
     */
    saveActiveSection(sectionId) {
        try {
            localStorage.setItem(ADMIN_CONFIG.storage.activeSection, sectionId);
        } catch (error) {
            console.warn('Erro ao salvar seção ativa:', error);
        }
    }

    /**
     * Carrega seção ativa
     */
    async loadActiveSection() {
        try {
            const savedSection = localStorage.getItem(ADMIN_CONFIG.storage.activeSection);
            const defaultSection = 'dashboard';
            const sectionToLoad = savedSection || defaultSection;
            
            await this.showSection(sectionToLoad);
        } catch (error) {
            console.error('Erro ao carregar seção ativa:', error);
            await this.showSection('dashboard');
        }
    }

    /**
     * Inicializa seção específica
     */
    async initializeSection(sectionId) {
        try {
            switch (sectionId) {
                case 'funcionarios':
                    await this.initializeUsuariosSection();
                    break;
                case 'cardapio':
                    await this.initializeCardapioSection();
                    break;
                case 'estoque':
                    await this.initializeEstoqueSection();
                    break;
                case 'dashboard':
                    await this.initializeDashboardSection();
                    break;
                default:
                    // Seção não requer inicialização específica
                    break;
            }
        } catch (error) {
            console.error(`❌ Erro ao inicializar seção ${sectionId}:`, error);
            this.handleSectionError(sectionId, error);
        }
    }

    /**
     * Inicializa seção de usuários
     */
    async initializeUsuariosSection() {
        if (!this.managers.usuarios) {
            this.managers.usuarios = new UsuarioManager();
        }
        await this.managers.usuarios.init();
    }

    /**
     * Inicializa seção de cardápio
     */
    async initializeCardapioSection() {
        if (!this.managers.produtos) {
            this.managers.produtos = new ProdutoManager();
        }
        await this.managers.produtos.init();
    }

    /**
     * Inicializa seção de estoque
     */
    async initializeEstoqueSection() {
        if (!this.managers.insumos) {
            this.managers.insumos = new InsumoManager();
        }
        await this.managers.insumos.init();
    }


    /**
     * Inicializa seção de dashboard
     */
    async initializeDashboardSection() {
        try {
            await this.loadDashboardData();
        } catch (error) {
            console.error('Erro ao carregar dados do dashboard:', error);
        }
    }

    /**
     * Carrega dados do dashboard
     */
    async loadDashboardData() {
        try {
            // Implementar carregamento de dados do dashboard
            
            // Exemplo de métricas que podem ser carregadas
            const metrics = {
                totalPedidos: 0,
                totalVendas: 0,
                totalUsuarios: 0,
                totalProdutos: 0
            };
            
            this.updateDashboardMetrics(metrics);
        } catch (error) {
            console.error('Erro ao carregar dados do dashboard:', error);
        }
    }

    /**
     * Atualiza métricas do dashboard
     */
    updateDashboardMetrics(metrics) {
        // Implementar atualização das métricas no dashboard
    }

    /**
     * Inicializa módulos específicos
     */
    async initializeModules() {
        try {
            // Inicializar módulos conforme necessário
        } catch (error) {
            console.error('Erro ao inicializar módulos:', error);
        }
    }

    /**
     * Configura event listeners globais
     */
    setupGlobalEventListeners() {
        // Event listener para mudanças de visibilidade da página
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible' && this.isInitialized) {
                this.handlePageVisible();
            }
        });

        // Event listener para erros globais
        window.addEventListener('error', (event) => {
            console.error('Erro global capturado:', event.error);
            this.showErrorMessage('Ocorreu um erro inesperado. Tente recarregar a página.');
        });

        // Event listener para erros de promise não tratados
        window.addEventListener('unhandledrejection', (event) => {
            console.error('Promise rejeitada não tratada:', event.reason);
            this.showErrorMessage('Ocorreu um erro inesperado. Tente novamente.');
        });

        // Event listener para botão de categorias
        document.addEventListener('click', async (e) => {
            if (e.target.matches('#btn-categorias')) {
                e.preventDefault();
                await this.openCategoriasModal();
            }
        });
    }

    /**
     * Abre modal de categorias
     */
    async openCategoriasModal() {
        try {
            // Inicializar gerenciador de categorias se não existir
            if (!this.managers.categorias) {
                this.managers.categorias = new CategoriaManager();
            }
            await this.managers.categorias.init();
            
            // Abrir modal de categorias
            await this.managers.categorias.openCategoriasModalPublic();
        } catch (error) {
            console.error('Erro ao abrir modal de categorias:', error);
            this.showErrorMessage('Erro ao abrir modal de categorias');
        }
    }

    /**
     * Trata quando a página fica visível
     */
    handlePageVisible() {
        try {
            // Atualizar dados da seção atual se necessário
            if (this.currentSection) {
                this.refreshCurrentSection();
            }
        } catch (error) {
            console.error('Erro ao atualizar seção visível:', error);
        }
    }

    /**
     * Atualiza seção atual
     */
    async refreshCurrentSection() {
        try {
            if (this.currentSection) {
                await this.initializeSection(this.currentSection);
            }
        } catch (error) {
            console.error('Erro ao atualizar seção atual:', error);
        }
    }

    /**
     * Trata erro de seção
     */
    handleSectionError(sectionId, error) {
        console.error(`Erro na seção ${sectionId}:`, error);
        this.showErrorMessage(`Erro ao carregar seção ${sectionId}. Tente novamente.`);
        
        // Fallback para dashboard em caso de erro
        if (sectionId !== 'dashboard') {
            setTimeout(() => {
                this.showSection('dashboard');
            }, 2000);
        }
    }

    /**
     * Exibe mensagem de sucesso
     */
    showSuccessMessage(message) {
        showToast(message, { type: 'success', title: 'Sucesso' });
    }

    /**
     * Exibe mensagem de erro
     */
    showErrorMessage(message) {
        showToast(message, { type: 'error', title: 'Erro' });
    }

    /**
     * Exibe mensagem de informação
     */
    showInfoMessage(message) {
        showToast(message, { type: 'info', title: 'Informação' });
    }

    /**
     * Exibe mensagem de aviso
     */
    showWarningMessage(message) {
        showToast(message, { type: 'warning', title: 'Aviso' });
    }

    /**
     * Obtém instância do gerenciador de uma seção
     */
    getManager(sectionId) {
        const managerMap = {
            'funcionarios': this.managers.usuarios,
            'usuarios': this.managers.usuarios,
            'cardapio': this.managers.produtos,
            'estoque': this.managers.insumos
        };
        
        return managerMap[sectionId] || null;
    }

    /**
     * Limpa cache de todos os módulos
     */
    clearAllCaches() {
        try {
            Object.values(this.managers).forEach(manager => {
                if (manager && manager.dataManager && manager.dataManager.clearCache) {
                    manager.dataManager.clearCache();
                }
            });
        } catch (error) {
            console.error('Erro ao limpar cache:', error);
        }
    }

    /**
     * Recarrega dados de todos os módulos
     */
    async reloadAllData() {
        try {
            this.clearAllCaches();
            await this.refreshCurrentSection();
            this.showSuccessMessage('Dados recarregados com sucesso!');
        } catch (error) {
            console.error('Erro ao recarregar dados:', error);
            this.showErrorMessage('Erro ao recarregar dados. Tente novamente.');
        }
    }
}

/**
 * Sistema de eventos para comunicação entre componentes
 */
class EventSystem {
    constructor() {
        this.events = new Map();
    }

    /**
     * Registra um listener para um evento
     */
    on(eventName, callback) {
        if (!this.events.has(eventName)) {
            this.events.set(eventName, []);
        }
        this.events.get(eventName).push(callback);
    }

    /**
     * Remove um listener de um evento
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
     * Emite um evento
     */
    emit(eventName, data) {
        if (this.events.has(eventName)) {
            this.events.get(eventName).forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`Erro ao executar callback do evento ${eventName}:`, error);
                }
            });
        }
    }
}

/**
 * Sistema de validação
 */
class ValidationSystem {
    /**
     * Valida elemento do DOM
     */
    static validateElement(selector, context = '') {
        const element = document.querySelector(selector);
        if (!element) {
            throw new Error(`Elemento não encontrado: ${selector} ${context}`);
        }
        return element;
    }

    /**
     * Valida campo obrigatório
     */
    static validateRequired(value, fieldName) {
        if (!value || value.toString().trim() === '') {
            throw new Error(`${fieldName} é obrigatório`);
        }
        return true;
    }

    /**
     * Valida email
     */
    static validateEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            throw new Error('Email inválido');
        }
        return true;
    }

    /**
     * Valida ID de seção
     */
    static validateSectionId(sectionId) {
        const validSections = Object.keys(ADMIN_CONFIG.sections);
        if (!validSections.includes(sectionId)) {
            throw new Error(`ID de seção inválido: ${sectionId}`);
        }
        return true;
    }
}

// Instância global do painel administrativo
let adminPanel = null;

/**
 * Inicializa o painel administrativo
 */
function initializeAdminPanel() {
    try {
        if (adminPanel) {
            console.warn('Painel administrativo já inicializado');
            return;
        }

        adminPanel = new AdminPanelManager();
        adminPanel.init();
        
        // Tornar disponível globalmente para debugging
        window.adminPanel = adminPanel;
        
    } catch (error) {
        console.error('Erro ao inicializar painel administrativo:', error);
        showToast('Erro ao inicializar painel administrativo', { type: 'error', title: 'Erro' });
    }
}

/**
 * Configura event listeners globais
 */
function setupGlobalEventListeners() {
    // Event listener para inicialização quando o DOM estiver pronto
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeAdminPanel);
    } else {
        initializeAdminPanel();
    }

    // Event listener para logout
    const logoutButton = document.getElementById('logout-btn');
    if (logoutButton) {
        logoutButton.addEventListener('click', (e) => {
            e.preventDefault();
            handleLogout();
        });
    }

    // Event listener para recarregar dados
    const reloadButton = document.getElementById('reload-data-btn');
    if (reloadButton) {
        reloadButton.addEventListener('click', (e) => {
            e.preventDefault();
            if (adminPanel) {
                adminPanel.reloadAllData();
            }
        });
    }
}

/**
 * Trata logout
 */
function handleLogout() {
    try {
        // Limpar dados do usuário
        localStorage.removeItem('userData');
        localStorage.removeItem('token');
        localStorage.removeItem(ADMIN_CONFIG.storage.activeSection);
        
        // Redirecionar para login
        window.location.href = '/login.html';
    } catch (error) {
        console.error('Erro ao fazer logout:', error);
        showToast('Erro ao fazer logout', { type: 'error', title: 'Erro' });
    }
}

// Instância global do sistema de eventos
const eventSystem = new EventSystem();

// Exportar para uso em outros módulos
export { 
    AdminPanelManager, 
    EventSystem, 
    ValidationSystem, 
    ADMIN_CONFIG,
    eventSystem 
};

// Inicializar quando o script for carregado
setupGlobalEventListeners();