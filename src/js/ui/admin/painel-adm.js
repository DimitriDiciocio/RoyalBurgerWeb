/**
 * Painel Administrativo - Sistema Royal Burger
 * Arquivo principal com funções comuns e gerenciamento de seções
 */

// Importações dos módulos específicos
import { UsuarioManager } from './usuarios-gerenciamento.js';
import { ProdutoManager } from './produtos-gerenciamento.js';
import { InsumoManager } from './insumos-gerenciamento.js';
import { CategoriaManager } from './categorias-gerenciamento.js';
import { GruposInsumosManager } from './grupos-insumos-gerenciamento.js';
import { initPromocoesManager } from './promocoes-gerenciamento.js';
import { FinancialDashboard } from './dashboard-financeiro.js';
import { MovementsList } from './movimentacoes-list.js';
import { ComprasManager } from './compras-manager.js';
import { RecorrenciasManager } from './recorrencias-manager.js';
import { ContasPagarManager } from './contas-pagar.js';
import { ConciliacaoBancariaManager } from './conciliacao-bancaria.js';
import { MovimentacaoForm } from './movimentacao-form.js';
// ALTERAÇÃO: Importar DashboardManager para gerenciar o dashboard principal
import DashboardManager from './dashboard-manager.js';
// ALTERAÇÃO: Importar RelatoriosManager para gerenciar seção de relatórios
import RelatoriosManager from './relatorios-manager.js';

import { showToast } from '../alerts.js';
import { fetchMe } from '../../api/auth.js';
import { reaplicarGerenciamentoInputs, gerenciarInputsEspecificos } from '../../utils.js';
import { socketService } from '../../api/socket-client.js';

/**
 * Configurações do painel administrativo
 */
const ADMIN_CONFIG = {
    sections: {
        dashboard: 'secao-dashboard',
        pedidos: 'secao-pedidos',
        cardapio: 'secao-cardapio',
        promocoes: 'secao-promocoes',
        estoque: 'secao-estoque',
        relatorios: 'secao-relatorios',
        financeiro: 'secao-financeiro',
        funcionarios: 'secao-funcionarios',
        configuracoes: 'secao-configuracoes'
    },
    navigation: {
        dashboard: 'nav-dashboard',
        pedidos: 'nav-pedidos',
        cardapio: 'nav-cardapio',
        promocoes: 'nav-promocoes',
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
        this.financialTabsSetup = false;
        this.managers = {
            usuarios: null,
            produtos: null,
            insumos: null,
            categorias: null,
            gruposInsumos: null,
            financialDashboard: null,
            movementsList: null,
            comprasManager: null,
            recorrenciasManager: null,
            contasPagarManager: null,
            conciliacaoBancariaManager: null,
            movimentacaoForm: null,
            // ALTERAÇÃO: Adicionar referência ao DashboardManager
            dashboard: null,
            // ALTERAÇÃO: Adicionar referência ao RelatoriosManager
            relatorios: null
        };
        this.isInitialized = false;
    }

    /**
     * Inicializa o painel administrativo
     */
    async init() {
        try {
            // Verificar permissões de administrador
            try {
                const hasPermission = await this.verifyAdminPermissions();
                if (!hasPermission) {
                    this.handleAuthError('Acesso negado. Permissões de administrador necessárias.');
                    return;
                }
            } catch (error) {
                if (error.message === 'TOKEN_EXPIRED') {
                    this.handleTokenExpired();
                    return;
                }
                this.handleAuthError('Erro ao verificar permissões. Tente fazer login novamente.');
                return;
            }

            // Conectar ao WebSocket para notificações em tempo real
            this.initializeSocket();
            
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
            // ALTERAÇÃO: Removido console.error - erro já é exibido ao usuário via showErrorMessage
            this.showErrorMessage('Erro ao inicializar painel administrativo');
        }
    }

    /**
     * Verifica permissões de administrador
     */
    async verifyAdminPermissions() {
        try {
            // Verificar se existe token
            const token = localStorage.getItem('rb.token') || localStorage.getItem('token');
            if (!token) {
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
            
            // Se não tem permissão baseada no localStorage, retornar false
            if (!hasPermission) {
                return false;
            }

            // Se tem permissão no localStorage, validar token com a API
            try {
                await fetchMe(); // Se der erro 401, será tratado pelo apiRequest
                return true;
            } catch (apiError) {
                // Se for erro 401 (token expirado), tratar como token expirado
                if (apiError.status === 401) {
                    throw new Error('TOKEN_EXPIRED');
                }
                // Para outros erros, assumir que não tem permissão
                return false;
            }
        } catch (error) {
            // ALTERAÇÃO: Removido console.error - erro será tratado silenciosamente ou re-thrown
            if (error.message === 'TOKEN_EXPIRED') {
                throw error; // Re-throw para ser tratado como token expirado
            }
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
     * Inicializa a conexão WebSocket para notificações em tempo real
     */
    initializeSocket() {
        try {
            // Conectar ao socket
            socketService.connect();

            // Ouvinte Global de Alertas (Estoque, Erros, Avisos)
            // ALTERAÇÃO: Removido alerta de estoque baixo - apenas atualiza a interface sem mostrar toast
            socketService.on('stock.alert', (data) => {
                // Exemplo: { ingredient_id: 5, name: 'Bacon', status: 'low' }
                // ALTERAÇÃO: Apenas atualiza a interface, não mostra toast na tela
                // A atualização visual da interface é feita pelo insumos-gerenciamento.js
            });

            socketService.on('order.created', (data) => {
                // Notificação visual rápida
                showToast(`🔔 Novo Pedido #${data.order_id} recebido!`, {
                    type: 'success',
                    autoClose: 5000
                });
                
                // Tocar som (opcional - se tiver arquivo de som)
                try {
                    const audio = new Audio('/assets/sounds/notification.mp3');
                    audio.volume = 0.5;
                    audio.play().catch(() => {
                        // Ignora erro se o arquivo não existir ou autoplay for bloqueado
                    });
                } catch(e) {
                    // Ignora erro silenciosamente
                }
                
                // Atualizar contador global no Header (se existir um badge de notificação)
                this.updateHeaderNotificationCount();
            });

            socketService.on('order.status_changed', (data) => {
                // Notificação quando status do pedido muda
                const statusMessages = {
                    'preparing': 'Em preparo',
                    'ready': 'Pronto',
                    'on_the_way': 'Saindo para entrega',
                    'delivered': 'Entregue',
                    'cancelled': 'Cancelado'
                };
                const statusText = statusMessages[data.new_status] || data.new_status;
                showToast(`📦 Pedido #${data.order_id} atualizado: ${statusText}`, {
                    type: 'info',
                    autoClose: 4000
                });
            });

            socketService.on('table.status_changed', (data) => {
                // Notificação quando status da mesa muda
                const statusMessages = {
                    'available': 'Disponível',
                    'occupied': 'Ocupada',
                    'cleaning': 'Em limpeza',
                    'reserved': 'Reservada'
                };
                const statusText = statusMessages[data.new_status] || data.new_status;
                showToast(`🪑 Mesa ${data.table_name || data.table_id} está ${statusText.toLowerCase()}`, {
                    type: 'info',
                    autoClose: 3000
                });
            });

            // Eventos de conexão/desconexão
            window.addEventListener('socket:connected', () => {
                // Socket conectado - sem necessidade de log em produção
            });

            window.addEventListener('socket:disconnected', (e) => {
                // ALTERAÇÃO: Removido console.warn - desconexão será tratada silenciosamente
            });

            window.addEventListener('socket:error', (e) => {
                // ALTERAÇÃO: Removido console.error - erro será tratado silenciosamente
            });

        } catch (error) {
            // ALTERAÇÃO: Removido console.error - erro não bloqueia inicialização do painel
            // Não bloqueia a inicialização do painel se o socket falhar
        }
    }

    /**
     * Atualiza contador de notificações no header
     */
    updateHeaderNotificationCount() {
        // Lógica para somar +1 no ícone de sino do header.html, se houver
        const notificationBadge = document.querySelector('.notification-badge, .header-notification-count');
        if (notificationBadge) {
            const currentCount = parseInt(notificationBadge.textContent) || 0;
            notificationBadge.textContent = currentCount + 1;
            notificationBadge.style.display = 'block';
        }
    }

    /**
     * Trata erro de autenticação
     */
    handleAuthError(message) {
        // ALTERAÇÃO: Removido console.error - erro já é exibido ao usuário via showErrorMessage
        this.showErrorMessage(message);
        
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
     * Trata erro de token expirado
     */
    handleTokenExpired() {
        // ALTERAÇÃO: Removido console.warn - token expirado será tratado silenciosamente
        
        // Limpar dados do usuário e token
        localStorage.removeItem('rb.token');
        localStorage.removeItem('rb.user');
        localStorage.removeItem('token');
        localStorage.removeItem('userData');
        localStorage.removeItem('user');
        
        // Mostrar mensagem específica de token expirado
        this.showErrorMessage('Sua sessão expirou. Faça login novamente para continuar.');
        
        // Redirecionar para login após 2 segundos
        setTimeout(() => {
            const currentPath = window.location.pathname;
            const isInPagesFolder = currentPath.includes('/pages/');
            
            if (isInPagesFolder) {
                window.location.href = 'login.html';
            } else {
                window.location.href = 'src/pages/login.html';
            }
        }, 2000);
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
                    // ALTERAÇÃO: Removido console.error - seção não mapeada será ignorada silenciosamente
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
            'nav-cardapio': 'cardapio',
            'nav-promocoes': 'promocoes',
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
                // ALTERAÇÃO: Log apenas em modo debug
                // ALTERAÇÃO: Removido console.error - seção inválida será tratada silenciosamente
                return;
            }

            // ALTERAÇÃO: Cleanup ao sair de seções para evitar vazamento de memória
            if (this.currentSection && this.currentSection !== sectionId) {
                // Cleanup do dashboard
                if (this.currentSection === 'dashboard' && this.managers.dashboard) {
                    this.managers.dashboard.cleanup();
                }
                // ALTERAÇÃO: Cleanup de promoções (para auto-refresh)
                if (this.currentSection === 'promocoes') {
                    const promocoesManager = window.promocaoManager;
                    if (promocoesManager && typeof promocoesManager.cleanup === 'function') {
                        promocoesManager.cleanup();
                    }
                }
                // ALTERAÇÃO: Cleanup de usuários (para auto-refresh)
                if (this.currentSection === 'funcionarios' && this.managers.usuarios) {
                    if (typeof this.managers.usuarios.cleanup === 'function') {
                        this.managers.usuarios.cleanup();
                    }
                }
                // ALTERAÇÃO: Cleanup de relatórios
                if (this.currentSection === 'relatorios' && this.managers.relatorios) {
                    if (typeof this.managers.relatorios.cleanup === 'function') {
                        this.managers.relatorios.cleanup();
                    }
                }
            }

            // Esconder todas as seções
            this.hideAllSections();
            
            // Mostrar seção alvo
            this.showTargetSection(sectionId);
            
            // Salvar seção ativa
            this.saveActiveSection(sectionId);
            
            // Inicializar seção se necessário
            await this.initializeSection(sectionId);
            
            this.currentSection = sectionId;
            
        } catch (error) {
            // ALTERAÇÃO: Removido console.error - erro será tratado por handleSectionError
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
                // ALTERAÇÃO: Removido console.warn - seção não encontrada será tratada silenciosamente
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
            // ALTERAÇÃO: Removido console.error - seção não encontrada será ignorada silenciosamente
        }
    }

    /**
     * Salva seção ativa
     */
    saveActiveSection(sectionId) {
        try {
            localStorage.setItem(ADMIN_CONFIG.storage.activeSection, sectionId);
        } catch (error) {
            // ALTERAÇÃO: Removido console.warn - erro ao salvar seção será tratado silenciosamente
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
            // ALTERAÇÃO: Removido console.error - erro será tratado silenciosamente, carregando dashboard padrão
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
                case 'promocoes':
                    await this.initializePromocoesSection();
                    break;
                case 'estoque':
                    await this.initializeEstoqueSection();
                    break;
                case 'dashboard':
                    await this.initializeDashboardSection();
                    break;
                case 'financeiro':
                    await this.initializeFinancialSection();
                    break;
                case 'relatorios':
                    await this.initializeRelatoriosSection();
                    break;
                case 'pedidos':
                    await this.initializePedidosSection();
                    break;
                default:
                    // Seção não requer inicialização específica
                    break;
            }
        } catch (error) {
            // ALTERAÇÃO: Removido console.error - erro será tratado por handleSectionError
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
     * Inicializa seção de promoções
     */
    async initializePromocoesSection() {
        await initPromocoesManager();
    }

    /**
     * Inicializa seção de pedidos
     * ALTERAÇÃO: Garante que os pedidos sejam carregados quando a seção for exibida
     */
    async initializePedidosSection() {
        try {
            const secaoPedidos = document.getElementById('secao-pedidos');
            if (!secaoPedidos) {
                // ALTERAÇÃO: Log apenas em modo debug
                if (typeof window !== 'undefined' && window.DEBUG_MODE) {
                    // ALTERAÇÃO: Removido console.warn - seção de pedidos não encontrada será tratada silenciosamente
                }
                return;
            }

            // ALTERAÇÃO: Aguardar um pequeno delay para garantir que o DOM está pronto
            // e que a seção está realmente visível
            await new Promise(resolve => setTimeout(resolve, 150));

            // ALTERAÇÃO: Disparar evento customizado para que order-management.js detecte
            // que a seção ficou visível e carregue os pedidos
            const visibilityEvent = new CustomEvent('section:pedidos:visible', {
                detail: { section: secaoPedidos, forceLoad: true }
            });
            window.dispatchEvent(visibilityEvent);

            // ALTERAÇÃO: Verificar se o container de pedidos está vazio após o evento
            // Se estiver vazio, pode ser que o order-management.js ainda não tenha processado
            // o evento. Aguardar um pouco mais e verificar novamente
            setTimeout(() => {
                const ordersList = document.getElementById('orders-list');
                if (ordersList) {
                    const hasContent = ordersList.children.length > 0 || 
                                     ordersList.innerHTML.trim() !== '';
                    
                    if (!hasContent) {
                        // ALTERAÇÃO: Se ainda estiver vazio, disparar evento novamente
                        window.dispatchEvent(visibilityEvent);
                    }
                }
            }, 500);
        } catch (error) {
            // ALTERAÇÃO: Removido console.error - erro já é exibido ao usuário via showErrorMessage
            this.showErrorMessage('Erro ao carregar seção de pedidos');
        }
    }

    /**
     * Inicializa seção financeira
     */
    async initializeFinancialSection() {
        try {
            // Inicializar dashboard financeiro
            if (!this.managers.financialDashboard) {
                this.managers.financialDashboard = new FinancialDashboard('dashboard-financeiro-container');
            }
            await this.managers.financialDashboard.init();

            // Configurar tabs
            this.setupFinancialTabs();

            // Configurar botão de nova movimentação
            const btnNovaMovimentacao = document.getElementById('btn-nova-movimentacao');
            if (btnNovaMovimentacao) {
                // ALTERAÇÃO: Remover listener anterior se existir para evitar duplicação
                const newBtn = btnNovaMovimentacao.cloneNode(true);
                btnNovaMovimentacao.parentNode.replaceChild(newBtn, btnNovaMovimentacao);

                // Inicializar formulário de movimentação se ainda não foi inicializado
                if (!this.managers.movimentacaoForm) {
                    // Verificar se o modal existe no HTML, senão criar dinamicamente
                    let modal = document.getElementById('modal-movimentacao');
                    if (!modal) {
                        modal = document.createElement('div');
                        modal.id = 'modal-movimentacao';
                        modal.className = 'modal';
                        // ALTERAÇÃO: Adicionar atributo para resetar campos ao fechar usando sistema de modais
                        modal.setAttribute('data-reset-on-close', 'true');
                        modal.style.display = 'none';
                        document.body.appendChild(modal);
                    }
                    this.managers.movimentacaoForm = new MovimentacaoForm('modal-movimentacao');
                    await this.managers.movimentacaoForm.init();
                }
                
                // Re-selecionar botão após clonagem
                const newBtnRef = document.getElementById('btn-nova-movimentacao');
                if (newBtnRef) {
                    newBtnRef.addEventListener('click', () => {
                        if (this.managers.movimentacaoForm) {
                            this.managers.movimentacaoForm.openNew(() => {
                                // Recarregar dashboard e lista após criar movimentação
                                if (this.managers.financialDashboard) {
                                    this.managers.financialDashboard.loadData();
                                }
                                if (this.managers.movementsList) {
                                    this.managers.movementsList.loadMovements();
                                }
                            });
                        }
                    });
                }
            }
        } catch (error) {
            // ALTERAÇÃO: Removido console.error - erro já é exibido ao usuário via showToast
            showToast('Erro ao carregar módulo financeiro', { 
                type: 'error',
                title: 'Erro'
            });
        }
    }

    /**
     * Configura tabs do módulo financeiro
     */
    setupFinancialTabs() {
        // ALTERAÇÃO: Evitar configuração duplicada de tabs
        if (this.financialTabsSetup) {
            return;
        }

        const tabs = document.querySelectorAll('.financeiro-tab');
        const contents = document.querySelectorAll('.financeiro-tab-content');

        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const targetTab = tab.dataset.tab;

                // Remover classe active de todas as tabs e contents
                tabs.forEach(t => t.classList.remove('active'));
                contents.forEach(c => c.classList.remove('active'));

                // ALTERAÇÃO: Gerenciar exibição dos cards de dashboard
                const financeiroCards = document.getElementById('financeiro-dashboard-cards');
                const conciliacaoCards = document.getElementById('conciliacao-dashboard-cards');

                // Ocultar todos os cards de dashboard
                if (financeiroCards) {
                    financeiroCards.style.display = 'none';
                }
                if (conciliacaoCards) {
                    conciliacaoCards.style.display = 'none';
                }

                // Adicionar classe active na tab e content selecionados
                tab.classList.add('active');
                const targetContent = document.getElementById(`tab-${targetTab}`);
                if (targetContent) {
                    targetContent.classList.add('active');
                }

                // Inicializar conteúdo da tab se necessário
                const initPromise = this.initializeFinancialTab(targetTab);
                
                // ALTERAÇÃO: Após inicializar a tab, verificar se há cards para exibir
                if (initPromise && typeof initPromise.then === 'function') {
                    initPromise.then(() => {
                        if (targetTab === 'conciliacao' && conciliacaoCards) {
                            // Verificar se os cards já foram renderizados (se o relatório já foi carregado)
                            setTimeout(() => {
                                if (conciliacaoCards.children.length > 0) {
                                    conciliacaoCards.style.display = 'flex';
                                }
                            }, 100);
                        } else if (targetTab === 'dashboard' && financeiroCards) {
                            // Verificar se os cards do dashboard financeiro já foram renderizados
                            setTimeout(() => {
                                if (financeiroCards.children.length > 0) {
                                    financeiroCards.style.display = 'flex';
                                }
                            }, 100);
                        }
                    });
                } else {
                    // Se não retornar Promise, verificar após um pequeno delay
                    setTimeout(() => {
                        if (targetTab === 'conciliacao' && conciliacaoCards && conciliacaoCards.children.length > 0) {
                            conciliacaoCards.style.display = 'flex';
                        } else if (targetTab === 'dashboard' && financeiroCards && financeiroCards.children.length > 0) {
                            financeiroCards.style.display = 'flex';
                        }
                    }, 200);
                }
            });
        });

        this.financialTabsSetup = true;
    }

    /**
     * Inicializa conteúdo de uma tab financeira específica
     * @param {string} tabId - ID da tab
     */
    async initializeFinancialTab(tabId) {
        switch (tabId) {
            case 'dashboard':
                // ALTERAÇÃO: Recarregar dados do dashboard quando a tab é aberta
                if (this.managers.dashboardFinanceiro) {
                    await this.managers.dashboardFinanceiro.loadData();
                    await this.managers.dashboardFinanceiro.loadRecentMovements();
                }
                break;
            case 'movimentacoes':
                // ALTERAÇÃO: Inicializar ou recarregar lista de movimentações
                if (!this.managers.movementsList) {
                    this.managers.movementsList = new MovementsList('movimentacoes-list-container');
                    await this.managers.movementsList.init();
                } else {
                    // Se já existe, recarregar dados
                    await this.managers.movementsList.loadMovements();
                }
                break;
            case 'contas-pagar':
                // ALTERAÇÃO: Inicializar ou recarregar gerenciador de contas a pagar
                if (!this.managers.contasPagarManager) {
                    this.managers.contasPagarManager = new ContasPagarManager('contas-pagar-container');
                    await this.managers.contasPagarManager.init();
                } else {
                    // Se já existe, recarregar dados
                    await this.managers.contasPagarManager.loadPendingPayments();
                }
                break;
            case 'compras':
                // ALTERAÇÃO: Inicializar ou recarregar gerenciador de compras
                if (!this.managers.comprasManager) {
                    this.managers.comprasManager = new ComprasManager('compras-container');
                    await this.managers.comprasManager.init();
                } else {
                    // Se já existe, recarregar dados
                    await this.managers.comprasManager.loadInvoices();
                }
                break;
            case 'recorrencias':
                // ALTERAÇÃO: Inicializar ou recarregar gerenciador de recorrências
                if (!this.managers.recorrenciasManager) {
                    this.managers.recorrenciasManager = new RecorrenciasManager('recorrencias-container');
                    await this.managers.recorrenciasManager.init();
                } else {
                    // Se já existe, recarregar dados
                    await this.managers.recorrenciasManager.loadRules();
                }
                break;
            case 'conciliacao':
                // ALTERAÇÃO: Inicializar ou recarregar gerenciador de conciliação bancária
                if (!this.managers.conciliacaoBancariaManager) {
                    this.managers.conciliacaoBancariaManager = new ConciliacaoBancariaManager('conciliacao-container');
                    await this.managers.conciliacaoBancariaManager.init();
                } else {
                    // Se já existe, recarregar dados se houver método disponível
                    if (typeof this.managers.conciliacaoBancariaManager.loadData === 'function') {
                        await this.managers.conciliacaoBancariaManager.loadData();
                    }
                }
                break;
        }
    }

    /**
     * Inicializa seção de dashboard
     * Fase 8: Integração completa com DashboardManager
     * 
     * @async
     * @returns {Promise<void>}
     */
    async initializeDashboardSection() {
        try {
            // ALTERAÇÃO: Inicializar DashboardManager se ainda não foi inicializado
            if (!this.managers.dashboard) {
                this.managers.dashboard = new DashboardManager();
            }
            
            // ALTERAÇÃO: Inicializar o dashboard (carrega dados e configura auto-refresh)
            await this.managers.dashboard.init();
        } catch (error) {
            // ALTERAÇÃO: Tratar erro de forma consistente
            // ALTERAÇÃO: Log apenas em modo debug
            if (typeof window !== 'undefined' && window.DEBUG_MODE) {
                // ALTERAÇÃO: Removido console.error - erro já é exibido ao usuário via showErrorMessage
            }
            this.showErrorMessage('Erro ao carregar dashboard');
        }
    }

    /**
     * Inicializa seção de relatórios
     * Fase 6: Integração completa com RelatoriosManager
     * 
     * @async
     * @returns {Promise<void>}
     */
    async initializeRelatoriosSection() {
        try {
            // ALTERAÇÃO: Inicializar RelatoriosManager se ainda não foi inicializado
            if (!this.managers.relatorios) {
                this.managers.relatorios = new RelatoriosManager();
            }
            
            // ALTERAÇÃO: Inicializar o manager de relatórios
            await this.managers.relatorios.init();
        } catch (error) {
            // ALTERAÇÃO: Tratar erro de forma consistente
            // ALTERAÇÃO: Removido console.error - erro já é exibido ao usuário via showErrorMessage
            this.showErrorMessage('Erro ao carregar seção de relatórios');
        }
    }

    /**
     * Carrega dados do dashboard
     * Fase 8: Delegar completamente para DashboardManager
     * 
     * @async
     * @returns {Promise<void>}
     */
    async loadDashboardData() {
        try {
            // ALTERAÇÃO: Verificar se DashboardManager está inicializado
            if (!this.managers.dashboard) {
                // ALTERAÇÃO: Inicializar se necessário
                await this.initializeDashboardSection();
                return;
            }
            
            // ALTERAÇÃO: Delegar carregamento para DashboardManager
            await this.managers.dashboard.loadAllData();
        } catch (error) {
            // ALTERAÇÃO: Tratar erro de forma consistente
            // ALTERAÇÃO: Log apenas em modo debug
            if (typeof window !== 'undefined' && window.DEBUG_MODE) {
                // ALTERAÇÃO: Removido console.error - erro já é exibido ao usuário via showErrorMessage
            }
            // ALTERAÇÃO: Não mostrar erro ao usuário (DashboardManager já trata erros internamente)
        }
    }

    /**
     * Atualiza métricas do dashboard
     * Fase 8: Método mantido para compatibilidade, mas DashboardManager atualiza o DOM diretamente
     * 
     * @param {Object} [metrics] - Métricas a serem atualizadas (opcional, não utilizado)
     * @deprecated Este método é mantido apenas para compatibilidade. 
     * DashboardManager atualiza o DOM diretamente através de loadAllData()
     */
    updateDashboardMetrics(metrics) {
        // ALTERAÇÃO: DashboardManager já atualiza o DOM diretamente
        // Este método pode ser removido no futuro se não for mais necessário
        // ALTERAÇÃO: Se DashboardManager tiver método updateMetrics, usar (para compatibilidade futura)
        if (this.managers.dashboard && typeof this.managers.dashboard.updateMetrics === 'function') {
            this.managers.dashboard.updateMetrics(metrics);
        } else if (this.managers.dashboard && typeof this.managers.dashboard.loadAllData === 'function') {
            // ALTERAÇÃO: Fallback: recarregar dados se método updateMetrics não existir
            this.managers.dashboard.loadAllData();
        }
    }

    /**
     * Inicializa módulos específicos
     */
    async initializeModules() {
        try {
            // Inicializar módulos conforme necessário
        } catch (error) {
            // ALTERAÇÃO: Removido console.error - erro será tratado silenciosamente
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
            // ALTERAÇÃO: Removido console.error - erro já é exibido ao usuário via showErrorMessage
            this.showErrorMessage('Ocorreu um erro inesperado. Tente recarregar a página.');
        });

        // Event listener para erros de promise não tratados
        window.addEventListener('unhandledrejection', (event) => {
            // ALTERAÇÃO: Removido console.error - erro já é exibido ao usuário via showErrorMessage
            this.showErrorMessage('Ocorreu um erro inesperado. Tente novamente.');
        });

        // Event listener para botão de categorias
        document.addEventListener('click', async (e) => {
            if (e.target.matches('#btn-categorias')) {
                e.preventDefault();
                await this.openCategoriasModal();
            }
            
            if (e.target.matches('#btn-grupos-adicionais')) {
                e.preventDefault();
                await this.openGruposInsumosModal();
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
            // ALTERAÇÃO: Removido console.error - erro já é exibido ao usuário via showErrorMessage
            this.showErrorMessage('Erro ao abrir modal de categorias');
        }
    }

    /**
     * Abre modal de grupos de insumos extras
     */
    async openGruposInsumosModal() {
        try {
            // Inicializar gerenciador de grupos de insumos se não existir
            if (!this.managers.gruposInsumos) {
                this.managers.gruposInsumos = new GruposInsumosManager();
            }
            await this.managers.gruposInsumos.init();
            
            // Abrir modal de grupos de insumos
            this.managers.gruposInsumos.abrirModalGrupos();
        } catch (error) {
            // ALTERAÇÃO: Removido console.error - erro já é exibido ao usuário via showErrorMessage
            this.showErrorMessage('Erro ao abrir modal de grupos de insumos');
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
            // ALTERAÇÃO: Removido console.error - erro será tratado silenciosamente
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
            // ALTERAÇÃO: Removido console.error - erro será tratado silenciosamente
        }
    }

    /**
     * Trata erro de seção
     */
    handleSectionError(sectionId, error) {
        // ALTERAÇÃO: Removido console.error - erro será tratado silenciosamente
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
            // ALTERAÇÃO: Removido console.error - erro será tratado silenciosamente
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
            // ALTERAÇÃO: Removido console.error - erro já é exibido ao usuário via showErrorMessage
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
                    // ALTERAÇÃO: Removido console.error - erro será tratado silenciosamente
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
            // ALTERAÇÃO: Removido console.warn - painel já inicializado será ignorado silenciosamente
            return;
        }

        adminPanel = new AdminPanelManager();
        adminPanel.init();
        
        // Tornar disponível globalmente para debugging
        window.adminPanel = adminPanel;
        
    } catch (error) {
        // ALTERAÇÃO: Removido console.error - erro já é exibido ao usuário via showToast
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
        // ALTERAÇÃO: Removido console.error - erro já é exibido ao usuário via showToast
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

/**
 * Gerenciador do Formulário de Produto Reestruturado
 */
class ProdutoFormManager {
    constructor() {
        this.currentPart = 1;
        this.totalParts = 2;
        this.selectedGroups = [];
        this.formData = {
            informacoes: {},
            receita: [],
            extras: []
        };
        this.init();
    }

    init() {
        this.bindEvents();
        this.updateNavigation();
    }

    bindEvents() {
        // Navegação entre partes
        const btnProximo = document.getElementById('btn-proximo');
        const btnAnterior = document.getElementById('btn-anterior');
        const btnSalvar = document.getElementById('salvar-produto');

        if (btnProximo) {
            btnProximo.addEventListener('click', () => this.nextPart());
        }

        if (btnAnterior) {
            btnAnterior.addEventListener('click', () => this.previousPart());
        }

        if (btnSalvar) {
            btnSalvar.addEventListener('click', () => this.saveProduct());
        }

        // Botão cancelar
        const btnCancelar = document.getElementById('cancelar-produto');
        if (btnCancelar) {
            btnCancelar.addEventListener('click', () => this.closeModal());
        }

        // Botão fechar (X) - usa o sistema de modais automaticamente via data-close-modal
        // Não precisa adicionar listener, pois já está configurado no modais.js

        // NOTA: Os botões de extras (btn-adicionar-grupo e btn-adicionar-insumo-extra)
        // são gerenciados pelo ProdutoExtrasManager no produtos-gerenciamento.js
    }


    nextPart() {
        if (this.validateCurrentPart()) {
            this.saveCurrentPartData();
            this.currentPart++;
            this.showPart(this.currentPart);
            this.updateNavigation();
        }
    }

    previousPart() {
        // ALTERAÇÃO: Salvar dados da parte atual antes de mudar
        this.saveCurrentPartData();
        this.currentPart--;
        this.showPart(this.currentPart);
        this.updateNavigation();
    }

    showPart(partNumber) {
        const parteInformacoes = document.getElementById('parte-informacoes');
        const parteReceita = document.getElementById('parte-receita');
        const modalContent = document.querySelector('.modal-content-produto');

        if (partNumber === 1) {
            parteInformacoes.style.display = 'block';
            parteInformacoes.setAttribute('aria-expanded', 'true');
            parteReceita.style.display = 'none';
            parteReceita.setAttribute('aria-expanded', 'false');
            
            // Mostrar imagem na primeira parte
            if (modalContent) {
                modalContent.classList.remove('hide-image');
            }
            
            // ALTERAÇÃO: Restaurar dados da parte 1 quando voltar para ela
            this.restorePart1Data();
        } else if (partNumber === 2) {
            parteInformacoes.style.display = 'none';
            parteInformacoes.setAttribute('aria-expanded', 'false');
            parteReceita.style.display = 'block';
            parteReceita.setAttribute('aria-expanded', 'true');
            
            // Esconder imagem na segunda parte
            if (modalContent) {
                modalContent.classList.add('hide-image');
            }
        }
    }

    updateNavigation() {
        const btnAnterior = document.getElementById('btn-anterior');
        const btnProximo = document.getElementById('btn-proximo');
        const btnSalvar = document.getElementById('salvar-produto');

        // Mostrar/ocultar botões conforme a parte atual
        if (this.currentPart === 1) {
            btnAnterior.style.display = 'none';
            btnProximo.style.display = 'flex';
            btnSalvar.style.display = 'none';
        } else if (this.currentPart === this.totalParts) {
            btnAnterior.style.display = 'flex';
            btnProximo.style.display = 'none';
            btnSalvar.style.display = 'flex';
        }
    }

    validateCurrentPart() {
        if (this.currentPart === 1) {
            return this.validateInformacoes();
        } else if (this.currentPart === 2) {
            return this.validateReceita();
        }
        return true;
    }

    validateInformacoes() {
        const requiredFields = [
            'nome-produto',
            'preco-produto',
            'categoria-produto'
        ];

        let isValid = true;

        requiredFields.forEach(fieldId => {
            const field = document.getElementById(fieldId);
            const divInput = field?.closest('.div-input');
            
            if (!field?.value.trim()) {
                divInput?.classList.add('error');
                isValid = false;
            } else {
                divInput?.classList.remove('error');
            }
        });

        if (!isValid) {
            showToast('Preencha todos os campos obrigatórios', { 
                type: 'error', 
                title: 'Campos obrigatórios' 
            });
        }

        return isValid;
    }

    validateReceita() {
        // Validação básica - pode ser expandida conforme necessário
        return true;
    }

    saveCurrentPartData() {
        if (this.currentPart === 1) {
            this.formData.informacoes = {
                nome: document.getElementById('nome-produto')?.value || '',
                descricao: document.getElementById('descricao-produto')?.value || '',
                preco: document.getElementById('preco-produto')?.value || '',
                categoria: document.getElementById('categoria-produto')?.value || '',
                tempoPreparo: document.getElementById('tempo-preparo-produto')?.value || ''
            };
        } else if (this.currentPart === 2) {
            this.formData.receita = this.getReceitaData();
            this.formData.extras = this.selectedGroups;
        }
    }

    /**
     * Restaura os dados da parte 1 nos campos do formulário
     * ALTERAÇÃO: Método adicionado para restaurar valores quando voltar para a parte 1
     */
    restorePart1Data() {
        if (this.formData.informacoes && Object.keys(this.formData.informacoes).length > 0) {
            const informacoes = this.formData.informacoes;
            
            const nomeField = document.getElementById('nome-produto');
            if (nomeField && informacoes.nome) {
                nomeField.value = informacoes.nome;
            }
            
            const descricaoField = document.getElementById('descricao-produto');
            if (descricaoField && informacoes.descricao) {
                descricaoField.value = informacoes.descricao;
            }
            
            const precoField = document.getElementById('preco-produto');
            if (precoField && informacoes.preco) {
                precoField.value = informacoes.preco;
            }
            
            // ALTERAÇÃO: Restaurar categoria - este era o problema principal
            const categoriaField = document.getElementById('categoria-produto');
            if (categoriaField && informacoes.categoria) {
                categoriaField.value = informacoes.categoria;
                // Disparar evento change para atualizar labels e validações
                categoriaField.dispatchEvent(new Event('change', { bubbles: true }));
            }
            
            const tempoPreparoField = document.getElementById('tempo-preparo-produto');
            if (tempoPreparoField && informacoes.tempoPreparo) {
                tempoPreparoField.value = informacoes.tempoPreparo;
            }
            
            // ALTERAÇÃO: Reaplicar gerenciamento de inputs para atualizar labels
            const parteInformacoes = document.getElementById('parte-informacoes');
            if (parteInformacoes) {
                const inputs = parteInformacoes.querySelectorAll('input, select, textarea');
                gerenciarInputsEspecificos(inputs);
            }
        }
    }

    getReceitaData() {
        // Implementar coleta de dados da receita
        return [];
    }


    saveProduct() {
        if (this.validateCurrentPart()) {
            this.saveCurrentPartData();
            
            // ALTERAÇÃO: Removido log desnecessário
            showToast('Produto salvo com sucesso!', { 
                type: 'success', 
                title: 'Sucesso' 
            });
            
            // Fechar modal e limpar formulário
            this.closeModal();
        }
    }

    closeModal() {
        // Usar sistema centralizado de modais
        if (typeof window.fecharModal === 'function') {
            window.fecharModal('modal-produto');
        } else {
            // ALTERAÇÃO: Removido console.error - função não encontrada será tratada silenciosamente
        }
        this.resetForm();
    }

    openModal() {
        // Usar sistema centralizado de modais
        if (typeof window.abrirModal === 'function') {
            window.abrirModal('modal-produto');
        } else {
            // ALTERAÇÃO: Removido console.error - função não encontrada será tratada silenciosamente
        }
    }

    resetForm() {
        this.currentPart = 1;
        this.selectedGroups = [];
        this.formData = {
            informacoes: {},
            receita: [],
            extras: []
        };
        
        // Limpar formulário
        document.querySelectorAll('input, select, textarea').forEach(field => {
            if (field.type !== 'button') {
                field.value = '';
            }
        });
        
        // Remover classes de erro
        document.querySelectorAll('.div-input.error').forEach(div => {
            div.classList.remove('error');
        });
        
        this.showPart(1);
        this.updateNavigation();
    }
}

// Inicializar quando o script for carregado
document.addEventListener('DOMContentLoaded', () => {
    setupGlobalEventListeners();
    
    // Inicializar gerenciador do formulário de produto
    if (document.getElementById('modal-produto')) {
        window.produtoFormManager = new ProdutoFormManager();
    }
});