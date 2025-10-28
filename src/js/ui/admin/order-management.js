/**
 * Gerenciamento de Pedidos - Painel Administrativo
 * Interface para administradores gerenciarem pedidos em tempo real
 */

import { getTodayOrders, getAllOrders, updateOrderStatus, getOrderDetails, formatOrderStatus, getStatusColor } from '../api/orders.js';
import { getDashboardMetrics, formatCurrency, formatTime } from '../api/dashboard.js';

(function initOrderManagement() {
    if (!window.location.pathname.includes('order-management.html')) return;

    const state = {
        orders: [],
        filteredOrders: [],
        currentOrder: null,
        metrics: {},
        filters: {
            status: '',
            period: 'today'
        },
        pagination: {
            currentPage: 1,
            itemsPerPage: 10,
            totalItems: 0
        },
        loading: false,
        error: null,
        autoRefresh: true,
        refreshInterval: null
    };

    // Refs DOM
    let el = {};

    // Inicializar elementos DOM
    function initElements() {
        el = {
            // Filtros
            filterStatus: document.getElementById('filter-status'),
            filterPeriod: document.getElementById('filter-period'),
            btnRefresh: document.getElementById('btn-refresh-orders'),
            btnToggleView: document.getElementById('btn-toggle-view'),

            // Métricas
            metricActiveOrders: document.getElementById('metric-active-orders'),
            metricCompletedOrders: document.getElementById('metric-completed-orders'),
            metricAvgTime: document.getElementById('metric-avg-time'),
            metricRevenue: document.getElementById('metric-revenue'),

            // Lista de pedidos
            ordersList: document.getElementById('orders-list'),
            pagination: document.getElementById('pagination'),

            // Modais
            modalOrderDetails: document.getElementById('modal-order-details'),
            modalUpdateStatus: document.getElementById('modal-update-status'),
            orderDetailsContent: document.getElementById('order-details-content'),
            newStatus: document.getElementById('new-status'),
            btnUpdateStatus: document.getElementById('btn-update-status'),
            btnConfirmStatus: document.getElementById('btn-confirm-status')
        };
    }

    // Carregar métricas do dashboard
    async function loadMetrics() {
        try {
            const result = await getDashboardMetrics();
            if (result.success) {
                state.metrics = result.data;
                updateMetricsDisplay();
            }
        } catch (error) {
            console.error('Erro ao carregar métricas:', error.message);
        }
    }

    // Atualizar exibição das métricas
    function updateMetricsDisplay() {
        if (el.metricActiveOrders) {
            el.metricActiveOrders.textContent = state.metrics.ongoing_orders || 0;
        }
        if (el.metricCompletedOrders) {
            el.metricCompletedOrders.textContent = state.metrics.completed_orders || 0;
        }
        if (el.metricAvgTime) {
            el.metricAvgTime.textContent = formatTime(state.metrics.average_preparation_time || 0);
        }
        if (el.metricRevenue) {
            el.metricRevenue.textContent = formatCurrency(state.metrics.revenue_today || 0);
        }
    }

    // Carregar pedidos
    async function loadOrders() {
        state.loading = true;
        state.error = null;

        try {
            let result;
            if (state.filters.period === 'today') {
                result = await getTodayOrders();
            } else {
                result = await getAllOrders();
            }

            if (result.success) {
                state.orders = result.data || [];
                applyFilters();
            } else {
                state.error = result.error;
                showError('Erro ao carregar pedidos: ' + result.error);
            }
        } catch (error) {
            state.error = error.message;
            showError('Erro ao carregar pedidos: ' + error.message);
        } finally {
            state.loading = false;
        }
    }

    // Aplicar filtros
    function applyFilters() {
        let filtered = [...state.orders];

        // Filtro por status
        if (state.filters.status) {
            filtered = filtered.filter(order => order.status === state.filters.status);
        }

        // Filtro por período (se não for "today")
        if (state.filters.period !== 'today') {
            const now = new Date();
            let startDate;

            switch (state.filters.period) {
                case 'week':
                    startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                    break;
                case 'month':
                    startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                    break;
                case 'all':
                default:
                    startDate = null;
                    break;
            }

            if (startDate) {
                filtered = filtered.filter(order => {
                    const orderDate = new Date(order.created_at);
                    return orderDate >= startDate;
                });
            }
        }

        state.filteredOrders = filtered;
        updatePagination();
        renderOrders();
    }

    // Atualizar paginação
    function updatePagination() {
        state.pagination.totalItems = state.filteredOrders.length;
        state.pagination.currentPage = 1; // Reset para primeira página
        renderPagination();
    }

    // Renderizar paginação
    function renderPagination() {
        if (!el.pagination) return;

        const totalPages = Math.ceil(state.pagination.totalItems / state.pagination.itemsPerPage);
        
        if (totalPages <= 1) {
            el.pagination.innerHTML = '';
            return;
        }

        let html = '<div class="pagination-controls">';
        
        // Botão anterior
        if (state.pagination.currentPage > 1) {
            html += `<button class="pagination-btn" data-page="${state.pagination.currentPage - 1}">
                <i class="fa-solid fa-chevron-left"></i>
            </button>`;
        }

        // Páginas
        const startPage = Math.max(1, state.pagination.currentPage - 2);
        const endPage = Math.min(totalPages, state.pagination.currentPage + 2);

        for (let i = startPage; i <= endPage; i++) {
            const isActive = i === state.pagination.currentPage ? 'active' : '';
            html += `<button class="pagination-btn ${isActive}" data-page="${i}">${i}</button>`;
        }

        // Botão próximo
        if (state.pagination.currentPage < totalPages) {
            html += `<button class="pagination-btn" data-page="${state.pagination.currentPage + 1}">
                <i class="fa-solid fa-chevron-right"></i>
            </button>`;
        }

        html += '</div>';
        el.pagination.innerHTML = html;
    }

    // Renderizar lista de pedidos
    function renderOrders() {
        if (!el.ordersList) return;

        const startIndex = (state.pagination.currentPage - 1) * state.pagination.itemsPerPage;
        const endIndex = startIndex + state.pagination.itemsPerPage;
        const ordersToShow = state.filteredOrders.slice(startIndex, endIndex);

        if (ordersToShow.length === 0) {
            el.ordersList.innerHTML = `
                <div class="empty-state">
                    <i class="fa-solid fa-clipboard-list"></i>
                    <h3>Nenhum pedido encontrado</h3>
                    <p>Não há pedidos que correspondam aos filtros selecionados.</p>
                </div>
            `;
            return;
        }

        const ordersHtml = ordersToShow.map(order => {
            const statusClass = getStatusColor(order.status);
            const statusText = formatOrderStatus(order.status);
            const createdAt = new Date(order.created_at).toLocaleString('pt-BR');

            return `
                <div class="order-card" data-order-id="${order.order_id}">
                    <div class="order-header">
                        <div class="order-info">
                            <h3>Pedido #${order.order_id}</h3>
                            <p class="order-customer">${order.customer_name || 'Cliente não informado'}</p>
                            <p class="order-time">${createdAt}</p>
                        </div>
                        <div class="order-status">
                            <span class="status-badge ${statusClass}">${statusText}</span>
                        </div>
                    </div>
                    
                    <div class="order-details">
                        <div class="order-address">
                            <i class="fa-solid fa-location-dot"></i>
                            <span>${order.address || 'Endereço não informado'}</span>
                        </div>
                        <div class="order-total">
                            <i class="fa-solid fa-dollar-sign"></i>
                            <span>${formatCurrency(order.total_amount || 0)}</span>
                        </div>
                    </div>

                    <div class="order-actions">
                        <button class="btn-secondary btn-view-details" data-order-id="${order.order_id}">
                            <i class="fa-solid fa-eye"></i>
                            Ver Detalhes
                        </button>
                        <button class="btn-primary btn-update-status" data-order-id="${order.order_id}">
                            <i class="fa-solid fa-edit"></i>
                            Atualizar Status
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        el.ordersList.innerHTML = ordersHtml;
    }

    // Carregar detalhes do pedido
    async function loadOrderDetails(orderId) {
        try {
            const result = await getOrderDetails(orderId);
            if (result.success) {
                state.currentOrder = result.data;
                renderOrderDetails();
                openModal('modal-order-details');
            } else {
                showError('Erro ao carregar detalhes: ' + result.error);
            }
        } catch (error) {
            showError('Erro ao carregar detalhes: ' + error.message);
        }
    }

    // Renderizar detalhes do pedido
    function renderOrderDetails() {
        if (!el.orderDetailsContent || !state.currentOrder) return;

        const order = state.currentOrder;
        const createdAt = new Date(order.created_at).toLocaleString('pt-BR');
        const statusClass = getStatusColor(order.status);
        const statusText = formatOrderStatus(order.status);

        let itemsHtml = '';
        if (order.items && order.items.length > 0) {
            itemsHtml = order.items.map(item => {
                let extrasHtml = '';
                if (item.extras && item.extras.length > 0) {
                    extrasHtml = `
                        <div class="item-extras">
                            <strong>Extras:</strong>
                            ${item.extras.map(extra => `${extra.name} (${extra.quantity}x)`).join(', ')}
                        </div>
                    `;
                }

                return `
                    <div class="order-item">
                        <div class="item-info">
                            <h4>${item.product_name}</h4>
                            <p class="item-description">${item.product_description || ''}</p>
                            ${extrasHtml}
                        </div>
                        <div class="item-quantity">
                            <span>Qtd: ${item.quantity}</span>
                        </div>
                        <div class="item-price">
                            <span>${formatCurrency(item.unit_price * item.quantity)}</span>
                        </div>
                    </div>
                `;
            }).join('');
        }

        el.orderDetailsContent.innerHTML = `
            <div class="order-details-header">
                <div class="order-info">
                    <h3>Pedido #${order.id}</h3>
                    <p class="order-time">Criado em: ${createdAt}</p>
                    <p class="order-code">Código: ${order.confirmation_code || 'N/A'}</p>
                </div>
                <div class="order-status">
                    <span class="status-badge ${statusClass}">${statusText}</span>
                </div>
            </div>

            <div class="order-details-content">
                <div class="details-section">
                    <h4>Informações do Pedido</h4>
                    <div class="info-grid">
                        <div class="info-item">
                            <label>Método de Pagamento:</label>
                            <span>${order.payment_method || 'N/A'}</span>
                        </div>
                        <div class="info-item">
                            <label>Total:</label>
                            <span>${formatCurrency(order.total_amount || 0)}</span>
                        </div>
                        <div class="info-item">
                            <label>Observações:</label>
                            <span>${order.notes || 'Nenhuma'}</span>
                        </div>
                    </div>
                </div>

                <div class="details-section">
                    <h4>Itens do Pedido</h4>
                    <div class="items-list">
                        ${itemsHtml || '<p>Nenhum item encontrado</p>'}
                    </div>
                </div>
            </div>
        `;
    }

    // Atualizar status do pedido
    async function updateOrderStatusAction(orderId, newStatus) {
        try {
            const result = await updateOrderStatus(orderId, newStatus);
            if (result.success) {
                showSuccess('Status atualizado com sucesso!');
                closeModal('modal-update-status');
                await loadOrders(); // Recarregar lista
                await loadMetrics(); // Recarregar métricas
            } else {
                showError('Erro ao atualizar status: ' + result.error);
            }
        } catch (error) {
            showError('Erro ao atualizar status: ' + error.message);
        }
    }

    // Configurar auto-refresh
    function setupAutoRefresh() {
        if (state.autoRefresh) {
            state.refreshInterval = setInterval(async () => {
                await loadOrders();
                await loadMetrics();
            }, 30000); // Atualizar a cada 30 segundos
        }
    }

    // Parar auto-refresh
    function stopAutoRefresh() {
        if (state.refreshInterval) {
            clearInterval(state.refreshInterval);
            state.refreshInterval = null;
        }
    }

    // Anexar eventos
    function attachEvents() {
        // Filtros
        if (el.filterStatus) {
            el.filterStatus.addEventListener('change', (e) => {
                state.filters.status = e.target.value;
                applyFilters();
            });
        }

        if (el.filterPeriod) {
            el.filterPeriod.addEventListener('change', (e) => {
                state.filters.period = e.target.value;
                loadOrders();
            });
        }

        // Botão refresh
        if (el.btnRefresh) {
            el.btnRefresh.addEventListener('click', async () => {
                await loadOrders();
                await loadMetrics();
            });
        }

        // Paginação
        if (el.pagination) {
            el.pagination.addEventListener('click', (e) => {
                const btn = e.target.closest('.pagination-btn');
                if (btn && btn.dataset.page) {
                    state.pagination.currentPage = parseInt(btn.dataset.page);
                    renderOrders();
                }
            });
        }

        // Lista de pedidos (delegation)
        if (el.ordersList) {
            el.ordersList.addEventListener('click', (e) => {
                const btn = e.target.closest('button');
                if (!btn) return;

                const orderId = btn.dataset.orderId;
                if (!orderId) return;

                if (btn.classList.contains('btn-view-details')) {
                    loadOrderDetails(orderId);
                } else if (btn.classList.contains('btn-update-status')) {
                    state.currentOrder = { id: orderId };
                    openModal('modal-update-status');
                }
            });
        }

        // Modal de atualização de status
        if (el.btnConfirmStatus) {
            el.btnConfirmStatus.addEventListener('click', () => {
                const newStatus = el.newStatus?.value;
                if (!newStatus) {
                    showError('Selecione um status');
                    return;
                }

                if (state.currentOrder?.id) {
                    updateOrderStatusAction(state.currentOrder.id, newStatus);
                }
            });
        }

        // Botão atualizar status na modal de detalhes
        if (el.btnUpdateStatus) {
            el.btnUpdateStatus.addEventListener('click', () => {
                if (state.currentOrder?.id) {
                    openModal('modal-update-status');
                }
            });
        }

        // Pausar auto-refresh quando modal estiver aberto
        document.addEventListener('modal-opened', stopAutoRefresh);
        document.addEventListener('modal-closed', setupAutoRefresh);
    }

    // Utilitários de modal
    function openModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.style.display = 'flex';
            modal.classList.add('show');
            document.dispatchEvent(new CustomEvent('modal-opened'));
        }
    }

    function closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.style.display = 'none';
            modal.classList.remove('show');
            document.dispatchEvent(new CustomEvent('modal-closed'));
        }
    }

    // Utilitários de notificação
    function showSuccess(message) {
        if (typeof window.showToast === 'function') {
            window.showToast(message, { type: 'success' });
        } else {
            alert(message);
        }
    }

    function showError(message) {
        if (typeof window.showToast === 'function') {
            window.showToast(message, { type: 'error' });
        } else {
            alert(message);
        }
    }

    // Verificar se usuário é admin
    function checkAdminAccess() {
        const user = window.getStoredUser ? window.getStoredUser() : null;
        if (!user || !user.roles || !user.roles.includes('admin')) {
            alert('Acesso negado. Apenas administradores podem acessar esta página.');
            window.location.href = 'painel-adm.html';
            return false;
        }
        return true;
    }

    // Inicializar
    async function init() {
        if (!checkAdminAccess()) return;

        initElements();
        attachEvents();
        
        await loadOrders();
        await loadMetrics();
        
        setupAutoRefresh();
    }

    // Limpar recursos ao sair da página
    window.addEventListener('beforeunload', () => {
        stopAutoRefresh();
    });

    // Inicializar quando DOM estiver pronto
    document.addEventListener('DOMContentLoaded', init);
})();
