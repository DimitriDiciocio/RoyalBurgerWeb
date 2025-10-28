/**
 * Detalhes do Pedido
 * Interface para visualizar detalhes completos de um pedido específico
 */

import { getOrderDetails, cancelOrder, formatOrderStatus, getStatusColor } from '../api/orders.js';

(function initOrderDetails() {
    if (!window.location.pathname.includes('info-pedido.html')) return;

    const state = {
        order: null,
        orderId: null,
        loading: false,
        error: null
    };

    // Refs DOM
    let el = {};

    // Inicializar elementos DOM
    function initElements() {
        el = {
            // Status e progresso
            orderStatusMessage: document.getElementById('order-status-message'),
            stepPending: document.getElementById('step-pending'),
            stepPreparing: document.getElementById('step-preparing'),
            stepDelivered: document.getElementById('step-delivered'),

            // Informações do pedido
            orderAddress: document.getElementById('order-address'),
            orderNeighborhood: document.getElementById('order-neighborhood'),
            paymentMethod: document.getElementById('payment-method'),
            paymentPixIcon: document.getElementById('payment-pix-icon'),
            paymentCardIcon: document.getElementById('payment-card-icon'),
            paymentMoneyIcon: document.getElementById('payment-money-icon'),

            // Itens e resumo
            orderItems: document.getElementById('order-items'),
            subtotalValue: document.getElementById('subtotal-value'),
            deliveryFeeValue: document.getElementById('delivery-fee-value'),
            discountRow: document.getElementById('discount-row'),
            discountValue: document.getElementById('discount-value'),
            totalValue: document.getElementById('total-value'),
            pointsEarned: document.getElementById('points-earned'),

            // Ações
            orderActions: document.getElementById('order-actions'),
            btnCancelOrder: document.getElementById('btn-cancel-order'),
            btnReorder: document.getElementById('btn-reorder'),
            btnConfirmCancel: document.getElementById('btn-confirm-cancel')
        };
    }

    // Obter ID do pedido da URL
    function getOrderIdFromUrl() {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('id');
    }

    // Carregar detalhes do pedido
    async function loadOrderDetails(orderId) {
        state.loading = true;
        state.error = null;

        try {
            const result = await getOrderDetails(orderId);
            if (result.success) {
                state.order = result.data;
                renderOrderDetails();
            } else {
                state.error = result.error;
                showError('Erro ao carregar pedido: ' + result.error);
            }
        } catch (error) {
            state.error = error.message;
            showError('Erro ao carregar pedido: ' + error.message);
        } finally {
            state.loading = false;
        }
    }

    // Renderizar detalhes do pedido
    function renderOrderDetails() {
        if (!state.order) return;

        const order = state.order;
        
        // Atualizar status e progresso
        updateOrderStatus(order.status);
        
        // Atualizar informações do pedido
        updateOrderInfo(order);
        
        // Renderizar itens
        renderOrderItems(order.items || []);
        
        // Atualizar resumo financeiro
        updateOrderSummary(order);
        
        // Mostrar/esconder ações
        updateOrderActions(order.status);
    }

    // Atualizar status e progresso
    function updateOrderStatus(status) {
        const statusMessages = {
            'pending': 'Seu pedido está sendo processado!',
            'preparing': 'Seu pedido está sendo preparado!',
            'ready': 'Seu pedido está pronto!',
            'on_the_way': 'Seu pedido está em rota de entrega!',
            'delivered': 'Seu pedido foi entregue!',
            'paid': 'Seu pedido foi pago!',
            'completed': 'Seu pedido foi concluído!',
            'cancelled': 'Seu pedido foi cancelado.'
        };

        if (el.orderStatusMessage) {
            el.orderStatusMessage.textContent = statusMessages[status] || 'Status desconhecido';
        }

        // Atualizar etapas do progresso
        updateProgressSteps(status);
    }

    // Atualizar etapas do progresso
    function updateProgressSteps(status) {
        const steps = {
            'pending': { pending: true, preparing: false, delivered: false },
            'preparing': { pending: true, preparing: true, delivered: false },
            'ready': { pending: true, preparing: true, delivered: false },
            'on_the_way': { pending: true, preparing: true, delivered: false },
            'delivered': { pending: true, preparing: true, delivered: true },
            'paid': { pending: true, preparing: true, delivered: true },
            'completed': { pending: true, preparing: true, delivered: true },
            'cancelled': { pending: false, preparing: false, delivered: false }
        };

        const stepConfig = steps[status] || steps['pending'];

        if (el.stepPending) {
            el.stepPending.classList.toggle('completo', stepConfig.pending);
        }
        if (el.stepPreparing) {
            el.stepPreparing.classList.toggle('completo', stepConfig.preparing);
        }
        if (el.stepDelivered) {
            el.stepDelivered.classList.toggle('completo', stepConfig.delivered);
        }
    }

    // Atualizar informações do pedido
    function updateOrderInfo(order) {
        // Endereço (simulado - seria necessário buscar dados do endereço)
        if (el.orderAddress) {
            el.orderAddress.textContent = order.address || 'Endereço não informado';
        }
        if (el.orderNeighborhood) {
            el.orderNeighborhood.textContent = 'Bairro - Cidade';
        }

        // Método de pagamento
        const paymentMethods = {
            'pix': { text: 'PIX', icon: 'payment-pix-icon' },
            'cartao': { text: 'Cartão', icon: 'payment-card-icon' },
            'dinheiro': { text: 'Dinheiro', icon: 'payment-money-icon' }
        };

        const payment = paymentMethods[order.payment_method] || paymentMethods['pix'];

        if (el.paymentMethod) {
            el.paymentMethod.textContent = payment.text;
        }

        // Mostrar ícone correto
        if (el.paymentPixIcon) el.paymentPixIcon.style.display = 'none';
        if (el.paymentCardIcon) el.paymentCardIcon.style.display = 'none';
        if (el.paymentMoneyIcon) el.paymentMoneyIcon.style.display = 'none';

        const iconElement = el[payment.icon];
        if (iconElement) {
            iconElement.style.display = 'flex';
        }
    }

    // Renderizar itens do pedido
    function renderOrderItems(items) {
        if (!el.orderItems) return;

        if (items.length === 0) {
            el.orderItems.innerHTML = '<p>Nenhum item encontrado</p>';
            return;
        }

        const itemsHtml = items.map(item => {
            let extrasHtml = '';
            if (item.extras && item.extras.length > 0) {
                extrasHtml = `
                    <p class="adicional">+ ${item.extras.length} adicional(is)</p>
                `;
            }

            return `
                <div class="quadro-produto">
                    <img src="../assets/img/tudo.jpeg" alt="${item.product_name}">
                    <div>
                        <p class="nome">${item.product_name}</p>
                        <p class="descricao">${item.product_description || ''}</p>
                        ${extrasHtml}
                    </div>
                    <p class="preco">R$ ${(item.unit_price * item.quantity).toFixed(2).replace('.', ',')}</p>
                </div>
            `;
        }).join('');

        el.orderItems.innerHTML = itemsHtml;
    }

    // Atualizar resumo financeiro
    function updateOrderSummary(order) {
        const subtotal = order.items ? order.items.reduce((sum, item) => sum + (item.unit_price * item.quantity), 0) : 0;
        const deliveryFee = 5.00; // Taxa fixa
        const discount = 0; // Desconto por pontos (seria calculado)
        const total = subtotal + deliveryFee - discount;
        const pointsEarned = Math.floor(total * 10); // 10 pontos por real

        if (el.subtotalValue) {
            el.subtotalValue.textContent = `R$ ${subtotal.toFixed(2).replace('.', ',')}`;
        }
        if (el.deliveryFeeValue) {
            el.deliveryFeeValue.textContent = `R$ ${deliveryFee.toFixed(2).replace('.', ',')}`;
        }
        if (el.totalValue) {
            el.totalValue.textContent = `R$ ${total.toFixed(2).replace('.', ',')}`;
        }
        if (el.pointsEarned) {
            el.pointsEarned.textContent = pointsEarned;
        }

        // Mostrar/esconder linha de desconto
        if (el.discountRow) {
            el.discountRow.style.display = discount > 0 ? 'block' : 'none';
        }
        if (el.discountValue) {
            el.discountValue.textContent = `R$ ${discount.toFixed(2).replace('.', ',')}`;
        }
    }

    // Atualizar ações do pedido
    function updateOrderActions(status) {
        if (!el.orderActions) return;

        const canCancel = status === 'pending';
        const canReorder = ['completed', 'delivered', 'paid'].includes(status);

        if (canCancel || canReorder) {
            el.orderActions.style.display = 'block';
            
            if (el.btnCancelOrder) {
                el.btnCancelOrder.style.display = canCancel ? 'block' : 'none';
            }
            if (el.btnReorder) {
                el.btnReorder.style.display = canReorder ? 'block' : 'none';
            }
        } else {
            el.orderActions.style.display = 'none';
        }
    }

    // Cancelar pedido
    async function cancelOrderAction() {
        if (!state.order?.id) return;

        try {
            const result = await cancelOrder(state.order.id);
            if (result.success) {
                showSuccess('Pedido cancelado com sucesso!');
                closeModal('modal-cancel-confirmation');
                // Recarregar detalhes do pedido
                await loadOrderDetails(state.order.id);
            } else {
                showError('Erro ao cancelar pedido: ' + result.error);
            }
        } catch (error) {
            showError('Erro ao cancelar pedido: ' + error.message);
        }
    }

    // Fazer pedido similar
    function reorderAction() {
        if (!state.order?.items) return;

        // Salvar itens do pedido atual no localStorage para reordenação
        const reorderItems = state.order.items.map(item => ({
            product_id: item.product_id,
            quantity: item.quantity,
            extras: item.extras || []
        }));

        localStorage.setItem('royal_reorder_items', JSON.stringify(reorderItems));
        
        // Redirecionar para página de produtos ou carrinho
        window.location.href = 'index.html';
    }

    // Anexar eventos
    function attachEvents() {
        // Botão cancelar pedido
        if (el.btnCancelOrder) {
            el.btnCancelOrder.addEventListener('click', () => {
                openModal('modal-cancel-confirmation');
            });
        }

        // Botão confirmar cancelamento
        if (el.btnConfirmCancel) {
            el.btnConfirmCancel.addEventListener('click', cancelOrderAction);
        }

        // Botão fazer pedido similar
        if (el.btnReorder) {
            el.btnReorder.addEventListener('click', reorderAction);
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
            alert('Você precisa estar logado para ver detalhes do pedido.');
            window.location.href = 'login.html';
            return false;
        }
        return true;
    }

    // Inicializar
    async function init() {
        if (!checkUserLogin()) return;

        const orderId = getOrderIdFromUrl();
        if (!orderId) {
            showError('ID do pedido não encontrado na URL.');
            window.location.href = 'hist-pedidos.html';
            return;
        }

        state.orderId = orderId;
        initElements();
        attachEvents();
        await loadOrderDetails(orderId);
    }

    // Inicializar quando DOM estiver pronto
    document.addEventListener('DOMContentLoaded', init);
})();
