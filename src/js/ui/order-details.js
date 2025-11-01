/**
 * Detalhes do Pedido
 * Interface para visualizar detalhes completos de um pedido específico
 */

import { getOrderDetails, cancelOrder, formatOrderStatus, getStatusColor } from '../api/orders.js';

// Importar helper de configurações
// Importação estática garante que o módulo esteja disponível quando necessário
import * as settingsHelper from '../utils/settings-helper.js';

// Importar sistema de alertas customizado
import { showError, showSuccess } from './alerts.js';

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
        
        // Se o pedido foi concluído, recarregar pontos do header para atualizar saldo
        // Os pontos foram creditados quando o status mudou para 'completed'
        if (order.status === 'completed' || order.status === 'delivered') {
            // Recarregar pontos no header (se a função estiver disponível)
            if (typeof window.updateHeaderState === 'function') {
                // O header tem sua própria lógica de carregamento de pontos
                // Apenas forçar atualização do estado
                window.updateHeaderState();
            }
        }
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
    async function updateOrderSummary(order) {
        // Priorizar valores vindos da API se disponíveis
        const subtotal = order.subtotal !== undefined ? order.subtotal : 
                         (order.items ? order.items.reduce((sum, item) => sum + (item.unit_price * item.quantity), 0) : 0);
            
        // Usar taxa de entrega da configuração (fallback para 5.00 se API falhar)
        let deliveryFee = 5.00;
        if (settingsHelper && typeof settingsHelper.getDeliveryFee === 'function') {
            try {
                deliveryFee = await settingsHelper.getDeliveryFee();
            } catch (error) {
                console.warn('Usando taxa de entrega padrão:', error.message);
            }
        }
        
        // Usar desconto da API se disponível
        const discount = order.discount !== undefined ? order.discount : 0;
        
        // Usar total da API se disponível (já calculado corretamente)
        const total = order.total_amount !== undefined ? order.total_amount : 
                      (subtotal + deliveryFee - discount);
        
        // Calcular pontos ganhos usando configuração dinâmica
        // IMPORTANTE: Pontos são calculados sobre SUBTOTAL (produtos), NÃO sobre total (com entrega)
        // Conforme padrão de programas de fidelidade: pontos não incluem taxas de entrega
        // O backend calcula pontos considerando desconto proporcional ao subtotal
        let pointsEarned = 0;
        
        // Verificar se o pedido já foi concluído (pontos já foram creditados)
        const isCompleted = order.status === 'completed' || order.status === 'delivered';
        
        // Calcular base para pontos: subtotal (produtos apenas, sem taxa de entrega)
        // Se houver desconto, considerar apenas o desconto proporcional ao subtotal
        let basePontos = subtotal;
        if (discount > 0 && total > 0) {
            // Calcular desconto proporcional ao subtotal
            // desconto_no_subtotal = desconto * (subtotal / total_antes_desconto)
            const orderType = order.order_type || 'delivery';
            const isPickup = orderType === 'pickup';
            const deliveryFeeForCalc = isPickup ? 0 : deliveryFee;
            const totalAntesDesconto = subtotal + deliveryFeeForCalc;
            
            if (totalAntesDesconto > 0) {
                const descontoProporcionalSubtotal = discount * (subtotal / totalAntesDesconto);
                basePontos = Math.max(0, subtotal - descontoProporcionalSubtotal);
            }
        }
        
        if (settingsHelper && typeof settingsHelper.calculatePointsEarned === 'function') {
            try {
                pointsEarned = await settingsHelper.calculatePointsEarned(basePontos);
            } catch (error) {
                // Fallback: 10 pontos por real (R$ 0,10 = 1 ponto)
                pointsEarned = Math.floor(basePontos * 10);
            }
        } else {
            // Fallback: 10 pontos por real (R$ 0,10 = 1 ponto)
            pointsEarned = Math.floor(basePontos * 10);
        }
        
        // Mostrar indicação visual se os pontos já foram creditados
        if (el.pointsEarned) {
            el.pointsEarned.textContent = pointsEarned;
            // Adicionar tooltip ou classe para indicar se já foram creditados
            if (isCompleted && el.pointsEarned.parentElement) {
                el.pointsEarned.parentElement.title = 'Pontos já creditados na sua conta';
            }
        }

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

    // Verificar se usuário está logado
    function checkUserLogin() {
        const user = window.getStoredUser ? window.getStoredUser() : null;
        if (!user) {
            showError('Você precisa estar logado para ver detalhes do pedido.');
            // Pequeno delay para permitir exibição do alerta antes do redirecionamento
            setTimeout(() => {
                window.location.href = 'login.html';
            }, 500);
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
