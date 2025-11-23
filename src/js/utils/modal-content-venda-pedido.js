/**
 * Modal de Detalhes de VENDA-PEDIDO
 * Exibe informações detalhadas da receita de um pedido
 * ALTERAÇÃO: Baseado no padrão da modal de compra-detalhes
 */

import { getOrderDetails } from '../api/orders.js';
import { getFinancialMovements } from '../api/financial-movements.js';
import { escapeHTML } from './html-sanitizer.js';
import { abrirModal, fecharModal } from '../ui/modais.js';
import { showToast } from '../ui/alerts.js';

/**
 * Formata valor monetário
 * @param {number} value - Valor a formatar
 * @returns {string} Valor formatado
 */
function formatCurrency(value) {
    return new Intl.NumberFormat('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(value || 0);
}

/**
 * Formata data
 * @param {string} dateString - Data a formatar
 * @returns {string} Data formatada
 */
function formatDate(dateString) {
    if (!dateString) return '-';
    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return dateString;
        return date.toLocaleDateString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch (error) {
        return dateString;
    }
}

/**
 * Formata método de pagamento para exibição
 * @param {string} method - Método de pagamento
 * @returns {string} Método formatado em português
 */
function formatPaymentMethod(method) {
    if (!method || method === '-') return '-';
    const m = String(method).toLowerCase();
    if (m === 'credit' || m.includes('credito')) return 'Cartão de Crédito';
    if (m === 'debit' || m.includes('debito')) return 'Cartão de Débito';
    if (m === 'pix') return 'PIX';
    if (m === 'money' || m.includes('dinheiro') || m.includes('cash')) return 'Dinheiro';
    if (m === 'bank_transfer' || m.includes('transfer')) return 'Transferência Bancária';
    if (m.includes('credit card')) return 'Cartão de Crédito';
    if (m.includes('debit card')) return 'Cartão de Débito';
    return method;
}

/**
 * Formata tipo de pedido
 * @param {string} orderType - Tipo do pedido
 * @returns {string} Tipo formatado
 */
function formatOrderType(orderType) {
    if (!orderType) return '-';
    const type = String(orderType).toLowerCase();
    if (type === 'delivery') return 'Delivery';
    if (type === 'pickup') return 'Retirada no Balcão';
    if (type === 'dine_in' || type === 'dine-in') return 'Mesa';
    return orderType;
}

/**
 * Formata status do pedido
 * @param {string} status - Status do pedido
 * @returns {string} Status formatado
 */
function formatOrderStatus(status) {
    if (!status) return '-';
    const statusMap = {
        'pending': 'Pendente',
        'preparing': 'Preparando',
        'ready': 'Pronto',
        'in_progress': 'Em Progresso',
        'on_the_way': 'Saiu para Entrega',
        'delivered': 'Entregue',
        'paid': 'Pago',
        'completed': 'Concluído',
        'cancelled': 'Cancelado'
    };
    return statusMap[status.toLowerCase()] || status;
}

/**
 * Exibe modal com detalhes da venda do pedido
 * @param {number} orderId - ID do pedido
 */
export async function showVendaPedidoModal(orderId) {
    if (!orderId) {
        showToast('ID do pedido não fornecido', { type: 'error' });
        return;
    }

    try {
        // Buscar detalhes do pedido
        const orderResponse = await getOrderDetails(orderId);
        if (!orderResponse.success || !orderResponse.data) {
            showToast('Erro ao carregar detalhes do pedido', { type: 'error' });
            return;
        }

        const order = orderResponse.data;
        const orderIdDisplay = escapeHTML(order.id || order.order_id || orderId);
        const confirmationCode = escapeHTML(order.confirmation_code || 'N/A');
        const customerName = escapeHTML(order.customer_name || order.user?.full_name || 'Cliente não informado');
        const orderDate = order.created_at || order.date || '';
        const orderType = formatOrderType(order.order_type);
        const orderStatus = formatOrderStatus(order.status);
        const paymentMethod = formatPaymentMethod(order.payment_method || '-');
        const totalAmount = parseFloat(order.total_amount || order.total || 0);
        const subtotal = parseFloat(order.subtotal || order.sub_total || totalAmount);
        const discounts = parseFloat(order.discounts || order.discount || 0);
        const deliveryFee = parseFloat(order.delivery_fee || order.deliveryFee || 0);
        const items = order.items || [];

        // ALTERAÇÃO: Buscar informações financeiras do pedido
        let financialInfo = null;
        try {
            const financialResponse = await getFinancialMovements({
                related_entity_type: "order",
                related_entity_id: orderId
            });
            
            const movements = Array.isArray(financialResponse) ? financialResponse : (financialResponse?.items || []);
            
            if (movements && movements.length > 0) {
                const revenue = movements.find((m) => m.type === "REVENUE");
                const cmv = movements.find((m) => m.type === "CMV");
                const fee = movements.find(
                    (m) => m.type === "EXPENSE" && m.subcategory === "Taxas de Pagamento"
                );
                
                const revenueValue = parseFloat(revenue?.value || revenue?.amount || 0);
                const cmvValue = parseFloat(cmv?.value || cmv?.amount || 0);
                const feeValue = parseFloat(fee?.value || fee?.amount || 0);
                const grossProfit = revenueValue - cmvValue;
                const netProfit = grossProfit - feeValue;
                
                financialInfo = {
                    revenue: revenueValue,
                    cmv: cmvValue,
                    fee: feeValue,
                    grossProfit: grossProfit,
                    netProfit: netProfit
                };
            }
        } catch (error) {
            // Ignorar erro silenciosamente - informações financeiras são opcionais
        }

        // Criar ou obter modal seguindo padrão do sistema
        let modal = document.getElementById('modal-venda-pedido');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'modal-venda-pedido';
            modal.className = 'modal';
            document.body.appendChild(modal);
        }

        // ALTERAÇÃO: Estrutura HTML seguindo padrão do sistema com melhorias de acessibilidade
        modal.innerHTML = `
            <div class="div-overlay" data-close-modal="modal-venda-pedido" role="button" tabindex="0" aria-label="Fechar modal"></div>
            <div class="modal-content-venda-pedido" role="dialog" aria-labelledby="modal-venda-title" aria-modal="true">
                <div class="header-modal">
                    <h2 id="modal-venda-title">Venda - Pedido #${orderIdDisplay}</h2>
                    <button type="button" class="fechar-modal" data-close-modal="modal-venda-pedido" aria-label="Fechar modal" tabindex="0">
                        <i class="fa-solid fa-xmark" aria-hidden="true"></i>
                    </button>
                </div>
                <div class="conteudo-modal">
                    <div class="invoice-details">
                        <div class="invoice-detail-section">
                            <h3>Informações do Pedido</h3>
                            <div class="invoice-detail-grid">
                                <div class="invoice-detail-item">
                                    <span class="label">Código de Confirmação:</span>
                                    <span class="value">${confirmationCode}</span>
                                </div>
                                <div class="invoice-detail-item">
                                    <span class="label">Cliente:</span>
                                    <span class="value">${customerName}</span>
                                </div>
                                <div class="invoice-detail-item">
                                    <span class="label">Data do Pedido:</span>
                                    <span class="value">${formatDate(orderDate)}</span>
                                </div>
                                <div class="invoice-detail-item">
                                    <span class="label">Tipo:</span>
                                    <span class="value">${escapeHTML(orderType)}</span>
                                </div>
                                <div class="invoice-detail-item">
                                    <span class="label">Status:</span>
                                    <span class="value">${escapeHTML(orderStatus)}</span>
                                </div>
                                <div class="invoice-detail-item">
                                    <span class="label">Método de Pagamento:</span>
                                    <span class="value">${escapeHTML(paymentMethod)}</span>
                                </div>
                                ${deliveryFee > 0 ? `
                                <div class="invoice-detail-item">
                                    <span class="label">Taxa de Entrega:</span>
                                    <span class="value">R$ ${formatCurrency(deliveryFee)}</span>
                                </div>
                                ` : ''}
                                ${discounts > 0 ? `
                                <div class="invoice-detail-item">
                                    <span class="label">Descontos:</span>
                                    <span class="value">- R$ ${formatCurrency(discounts)}</span>
                                </div>
                                ` : ''}
                                <div class="invoice-detail-item">
                                    <span class="label">Subtotal:</span>
                                    <span class="value">R$ ${formatCurrency(subtotal)}</span>
                                </div>
                                <div class="invoice-detail-item">
                                    <span class="label">Valor Total:</span>
                                    <span class="value highlight">R$ ${formatCurrency(totalAmount)}</span>
                                </div>
                            </div>
                        </div>
                        ${financialInfo ? `
                        <div class="invoice-detail-section">
                            <h3>Informações Financeiras</h3>
                            <div class="invoice-detail-grid">
                                <div class="invoice-detail-item">
                                    <span class="label">Receita:</span>
                                    <span class="value revenue">R$ ${formatCurrency(financialInfo.revenue)}</span>
                                </div>
                                <div class="invoice-detail-item">
                                    <span class="label">CMV:</span>
                                    <span class="value cmv">R$ ${formatCurrency(financialInfo.cmv)}</span>
                                </div>
                                <div class="invoice-detail-item">
                                    <span class="label">Taxa:</span>
                                    <span class="value expense">R$ ${formatCurrency(financialInfo.fee)}</span>
                                </div>
                                <div class="invoice-detail-item">
                                    <span class="label">Lucro Bruto:</span>
                                    <span class="value ${financialInfo.grossProfit >= 0 ? "positive" : "negative"}">
                                        R$ ${formatCurrency(financialInfo.grossProfit)}
                                    </span>
                                </div>
                                <div class="invoice-detail-item">
                                    <span class="label">Lucro Líquido:</span>
                                    <span class="value ${financialInfo.netProfit >= 0 ? "positive highlight" : "negative"}">
                                        R$ ${formatCurrency(financialInfo.netProfit)}
                                    </span>
                                </div>
                            </div>
                        </div>
                        ` : ''}
                        ${items.length > 0 ? `
                        <div class="invoice-detail-section">
                            <h3>Itens do Pedido</h3>
                            <div class="invoice-items-list">
                                <table class="invoice-items-table">
                                    <thead>
                                        <tr>
                                            <th>Produto</th>
                                            <th>Quantidade</th>
                                            <th>Preço Unitário</th>
                                            <th>Subtotal</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${items.map(item => {
                                            const productName = escapeHTML(item.product?.name || item.product_name || 'Produto');
                                            const quantity = item.quantity || 1;
                                            const unitPrice = parseFloat(item.unit_price || item.price || 0);
                                            const itemSubtotal = parseFloat(item.item_subtotal || item.subtotal || (unitPrice * quantity) || 0);
                                            
                                            return `
                                            <tr>
                                                <td>${productName}</td>
                                                <td>${quantity}</td>
                                                <td>R$ ${formatCurrency(unitPrice)}</td>
                                                <td>R$ ${formatCurrency(itemSubtotal)}</td>
                                            </tr>
                                            `;
                                        }).join('')}
                                    </tbody>
                                    <tfoot>
                                        <tr>
                                            <td colspan="3" style="text-align: right; font-weight: bold;">Subtotal:</td>
                                            <td style="font-weight: bold;">R$ ${formatCurrency(subtotal)}</td>
                                        </tr>
                                        ${deliveryFee > 0 ? `
                                        <tr>
                                            <td colspan="3" style="text-align: right; font-weight: bold;">Taxa de Entrega:</td>
                                            <td style="font-weight: bold;">R$ ${formatCurrency(deliveryFee)}</td>
                                        </tr>
                                        ` : ''}
                                        ${discounts > 0 ? `
                                        <tr>
                                            <td colspan="3" style="text-align: right; font-weight: bold;">Descontos:</td>
                                            <td style="font-weight: bold;">- R$ ${formatCurrency(discounts)}</td>
                                        </tr>
                                        ` : ''}
                                        <tr>
                                            <td colspan="3" style="text-align: right; font-weight: bold;">Total:</td>
                                            <td style="font-weight: bold; font-size: 1.1em;">R$ ${formatCurrency(totalAmount)}</td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        </div>
                        ` : ''}
                    </div>
                </div>
                <div class="footer-modal">
                    <button type="button" class="btn-cancelar" data-close-modal="modal-venda-pedido" aria-label="Fechar modal de detalhes da venda do pedido">Fechar</button>
                </div>
            </div>
        `;

        // ALTERAÇÃO: Configurar event listeners do modal antes de abrir
        const handleCloseModal = () => {
            fecharModal('modal-venda-pedido');
        };
        
        // ALTERAÇÃO: Adicionar listeners para todos os elementos de fechar (clique e teclado)
        const closeButtons = modal.querySelectorAll('[data-close-modal="modal-venda-pedido"]');
        closeButtons.forEach(btn => {
            btn.addEventListener('click', handleCloseModal);
            // ALTERAÇÃO: Suporte a teclado (Enter/Space) para acessibilidade
            btn.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleCloseModal();
                }
            });
        });
        
        // ALTERAÇÃO: Adicionar suporte a teclado (Escape) para acessibilidade
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                handleCloseModal();
            }
        };
        modal.addEventListener('keydown', handleKeyDown);
        
        // ALTERAÇÃO: Focar no modal ao abrir para acessibilidade
        const modalContent = modal.querySelector('.modal-content-venda-pedido');
        if (modalContent) {
            modalContent.setAttribute('tabindex', '-1');
        }

        // Garantir que o modal está no DOM antes de abrir
        if (!document.body.contains(modal)) {
            document.body.appendChild(modal);
        }

        // ALTERAÇÃO: Usar sistema de modais.js para abrir modal
        setTimeout(() => {
            abrirModal('modal-venda-pedido');
            // ALTERAÇÃO: Focar no conteúdo do modal para acessibilidade
            if (modalContent) {
                modalContent.focus();
            }
        }, 10);
    } catch (error) {
        showToast('Erro ao carregar detalhes da venda do pedido', { type: 'error' });
    }
}

