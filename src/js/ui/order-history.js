/**
 * Histórico de Pedidos
 * Interface para clientes visualizarem seus pedidos
 */

import { getMyOrders, getOrderDetails, cancelOrder, formatOrderStatus, getStatusColor } from '../api/orders.js';

(function initOrderHistory() {
    if (!window.location.pathname.includes('hist-pedidos.html')) return;

    const state = {
        orders: [],
        filteredOrders: [],
        currentOrder: null,
        filters: {
            status: ''
        },
        pagination: {
            currentPage: 1,
            itemsPerPage: 5,
            totalItems: 0
        },
        loading: false,
        error: null
    };

    // Refs DOM
    let el = {};

    // Inicializar elementos DOM
    function initElements() {
        el = {
            // Filtros
            filterStatus: document.getElementById('filter-status'),
            btnRefresh: document.getElementById('btn-refresh'),

            // Lista de pedidos
            ordersContainer: document.getElementById('orders-container'),
            pagination: document.getElementById('pagination'),

            // Modal
            modalOrderDetails: document.getElementById('modal-order-details'),
            orderDetailsContent: document.getElementById('order-details-content'),
            btnCancelOrder: document.getElementById('btn-cancel-order')
        };
    }

    // Carregar pedidos do usuário
    async function loadOrders() {
        state.loading = true;
        state.error = null;

        try {
            console.log('Carregando pedidos...');
            const result = await getMyOrders();
            console.log('Resultado da API:', result);
            
            if (result.success) {
                state.orders = result.data || [];
                console.log('Pedidos carregados:', state.orders);
                applyFilters();
            } else {
                state.error = result.error;
                showError('Erro ao carregar pedidos: ' + result.error);
            }
        } catch (error) {
            console.error('Erro ao carregar pedidos:', error);
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
        if (!el.ordersContainer) return;

        const startIndex = (state.pagination.currentPage - 1) * state.pagination.itemsPerPage;
        const endIndex = startIndex + state.pagination.itemsPerPage;
        const ordersToShow = state.filteredOrders.slice(startIndex, endIndex);

        if (ordersToShow.length === 0) {
            el.ordersContainer.innerHTML = `
                <div class="empty-state">
                    <i class="fa-solid fa-clipboard-list"></i>
                    <h3>Nenhum pedido encontrado</h3>
                    <p>Você ainda não fez nenhum pedido ou não há pedidos que correspondam aos filtros selecionados.</p>
                    <a href="index.html" class="btn-primary">Fazer primeiro pedido</a>
                </div>
            `;
            return;
        }

        const ordersHtml = ordersToShow.map(order => {
            const statusClass = getStatusColor(order.status);
            const statusText = formatOrderStatus(order.status);
            const createdAt = new Date(order.created_at).toLocaleString('pt-BR');
            const canCancel = order.status === 'pending';
            
            // Debug: log dos dados do pedido
            console.log('Order data:', {
                id: order.order_id,
                total_amount: order.total_amount,
                total: order.total,
                status: order.status,
                created_at: order.created_at
            });

            return `
                <div class="quadro-pedido" data-order-id="${order.order_id}">
                    <div class="header">
                        <div class="div1">
                            <div class="principal">
                                <p class="n-pedido">#${order.order_id}</p>
                                <p class="status-pedido ${statusClass}">${statusText}</p>
                            </div>
                            <div class="prazo">
                                <i class="fa-solid fa-clock"></i>
                                <p>40 - 50min</p>
                            </div>
                        </div>
                        <p class="tempo-pedido">${createdAt}</p>
                    </div>

                    <div class="main">
                        <div class="div-1">
                            <div class="div-2">
                                <p>Pedido</p>
                                <div class="fone">
                                    <i class="fa-solid fa-receipt"></i>
                                    <p>Código: ${order.confirmation_code || 'N/A'}</p>
                                </div>
                            </div>
                            <div class="endereco">
                                <i class="fa-solid fa-location-dot"></i>
                                <p>${order.address || 'Endereço não informado'}</p>
                            </div>
                        </div>

                        <div class="pedidos">
                            <div class="pedido">
                                <div>
                                    <p class="qtd">1</p>
                                    <p class="nome">Pedido completo</p>
                                </div>
                                <p class="preco">Ver detalhes</p>
                            </div>
                        </div>
                    </div>

                    <div class="footer">
                        <button class="btn-view-details" data-order-id="${order.order_id}">Ver mais</button>
                        <div>
                            <p>Total</p>
                            <p>R$ ${(order.total_amount || order.total || 0).toFixed(2).replace('.', ',')}</p>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        el.ordersContainer.innerHTML = ordersHtml;
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
        const canCancel = order.status === 'pending';

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
                            <span>R$ ${(item.unit_price * item.quantity).toFixed(2).replace('.', ',')}</span>
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
                            <span>R$ ${(order.total_amount || 0).toFixed(2).replace('.', ',')}</span>
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

        // Mostrar/esconder botão de cancelar
        if (el.btnCancelOrder) {
            el.btnCancelOrder.style.display = canCancel ? 'block' : 'none';
        }
    }

    // Cancelar pedido
    async function cancelOrderAction(orderId) {
        if (!confirm('Tem certeza que deseja cancelar este pedido?')) {
            return;
        }

        try {
            const result = await cancelOrder(orderId);
            if (result.success) {
                showSuccess('Pedido cancelado com sucesso!');
                closeModal('modal-order-details');
                await loadOrders(); // Recarregar lista
            } else {
                showError('Erro ao cancelar pedido: ' + result.error);
            }
        } catch (error) {
            showError('Erro ao cancelar pedido: ' + error.message);
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

        // Botão refresh
        if (el.btnRefresh) {
            el.btnRefresh.addEventListener('click', async () => {
                await loadOrders();
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
        if (el.ordersContainer) {
            el.ordersContainer.addEventListener('click', (e) => {
                const btn = e.target.closest('button');
                if (!btn) return;

                const orderId = btn.dataset.orderId;
                if (!orderId) return;

                if (btn.classList.contains('btn-view-details')) {
                    loadOrderDetails(orderId);
                }
            });
        }

        // Botão cancelar pedido
        if (el.btnCancelOrder) {
            el.btnCancelOrder.addEventListener('click', () => {
                if (state.currentOrder?.id) {
                    cancelOrderAction(state.currentOrder.id);
                }
            });
        }
    }

    // Utilitários de modal
    function openModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.style.display = 'flex';
            modal.classList.add('show');
        }
    }

    function closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.style.display = 'none';
            modal.classList.remove('show');
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

    // Verificar se usuário está logado
    function checkUserLogin() {
        const user = window.getStoredUser ? window.getStoredUser() : null;
        if (!user) {
            alert('Você precisa estar logado para ver seu histórico de pedidos.');
            window.location.href = 'login.html';
            return false;
        }
        return true;
    }

    // Inicializar
    async function init() {
        if (!checkUserLogin()) return;

        initElements();
        attachEvents();
        await loadOrders();
    }

    // Inicializar quando DOM estiver pronto
    document.addEventListener('DOMContentLoaded', init);
})();
