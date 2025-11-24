/**
 * Modal de Detalhes de CMV-PEDIDO
 * Exibe informações detalhadas do custo de mercadoria vendida de um pedido
 * ALTERAÇÃO: Baseado no padrão da modal de compra-detalhes
 */

import { getOrderDetails } from '../api/orders.js';
import { getUserById } from '../api/user.js';
import { getProductById, getProductIngredients } from '../api/products.js';
import { getIngredientById } from '../api/ingredients.js';
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
 * Calcula o custo por porção base de um insumo (conversão de unidades)
 * ALTERAÇÃO: Versão frontend da função do backend
 * @param {number} price - Preço do insumo na unidade de compra
 * @param {string} stockUnit - Unidade de compra (kg, g, L, ml)
 * @param {number} basePortionQuantity - Quantidade da porção base
 * @param {string} basePortionUnit - Unidade da porção base (g, ml)
 * @returns {number} Custo por porção base
 */
function calculateCostPerBasePortion(price, stockUnit, basePortionQuantity, basePortionUnit) {
    if (!price || price <= 0 || !basePortionQuantity || basePortionQuantity <= 0) {
        return 0;
    }

    const stockUnitLower = (stockUnit || 'un').toLowerCase().trim();
    const basePortionUnitLower = (basePortionUnit || 'un').toLowerCase().trim();

    // Se unidades são iguais, não precisa conversão
    if (stockUnitLower === basePortionUnitLower || stockUnitLower === 'un' || basePortionUnitLower === 'un') {
        return price * basePortionQuantity;
    }

    // Fatores de conversão
    const conversionFactors = {
        'kg': { 'g': 1000, 'mg': 1000000 },
        'g': { 'kg': 0.001, 'mg': 1000 },
        'l': { 'ml': 1000, 'cl': 100, 'dl': 10 },
        'litro': { 'ml': 1000, 'cl': 100, 'dl': 10 },
        'ml': { 'l': 0.001, 'cl': 0.1, 'litro': 0.001 }
    };

    // Calcular fator de conversão
    let conversionFactor = 1;
    if (conversionFactors[stockUnitLower] && conversionFactors[stockUnitLower][basePortionUnitLower]) {
        conversionFactor = conversionFactors[stockUnitLower][basePortionUnitLower];
    } else if (conversionFactors[basePortionUnitLower] && conversionFactors[basePortionUnitLower][stockUnitLower]) {
        conversionFactor = 1 / conversionFactors[basePortionUnitLower][stockUnitLower];
    }

    // Preço por unidade base = preço / fator_conversao
    const pricePerBaseUnit = price / conversionFactor;
    
    // Custo por porção base = preço por unidade base × quantidade da porção
    return pricePerBaseUnit * basePortionQuantity;
}

/**
 * Calcula o CMV de um item do pedido
 * @param {Object} item - Item do pedido
 * @returns {Promise<Object>} Item com custos calculados
 */
async function calculateItemCMV(item) {
    try {
        // Buscar dados do produto para obter cost_price
        const productId = item.product_id || item.product?.id;
        let productCostPrice = 0;
        
        if (productId) {
            try {
                const productResponse = await getProductById(productId);
                if (productResponse && productResponse.cost_price) {
                    productCostPrice = parseFloat(productResponse.cost_price) || 0;
                }
            } catch (error) {
                // Ignorar erro silenciosamente
            }
        }

        // Custo do produto = cost_price × quantity
        const quantity = item.quantity || 1;
        let itemCMV = productCostPrice * quantity;

        // Calcular custo dos extras
        const extras = item.extras || [];
        for (const extra of extras) {
            if (extra.ingredient_id) {
                try {
                    const ingredient = await getIngredientById(extra.ingredient_id);
                    if (ingredient && ingredient.price) {
                        const extraPrice = parseFloat(ingredient.price) || 0;
                        const stockUnit = ingredient.stock_unit || 'un';
                        const basePortionQuantity = parseFloat(ingredient.base_portion_quantity || 1) || 1;
                        const basePortionUnit = ingredient.base_portion_unit || 'un';
                        const extraQuantity = extra.quantity || 1;
                        
                        // Calcular custo por porção base
                        const costPerBasePortion = calculateCostPerBasePortion(
                            extraPrice,
                            stockUnit,
                            basePortionQuantity,
                            basePortionUnit
                        );
                        
                        // Custo do extra = custo por porção × quantidade de extras
                        itemCMV += costPerBasePortion * extraQuantity;
                    }
                } catch (error) {
                    // Ignorar erro silenciosamente
                }
            }
        }

        // Calcular custo das modificações de base
        const baseModifications = item.base_modifications || [];
        for (const mod of baseModifications) {
            if (mod.ingredient_id && mod.delta && mod.delta > 0) {
                try {
                    const ingredient = await getIngredientById(mod.ingredient_id);
                    if (ingredient && ingredient.price) {
                        const modPrice = parseFloat(ingredient.price) || 0;
                        const stockUnit = ingredient.stock_unit || 'un';
                        const basePortionQuantity = parseFloat(ingredient.base_portion_quantity || 1) || 1;
                        const basePortionUnit = ingredient.base_portion_unit || 'un';
                        const delta = mod.delta || 0;
                        
                        // Calcular custo por porção base
                        const costPerBasePortion = calculateCostPerBasePortion(
                            modPrice,
                            stockUnit,
                            basePortionQuantity,
                            basePortionUnit
                        );
                        
                        // Custo da modificação = custo por porção × delta
                        itemCMV += costPerBasePortion * delta;
                    }
                } catch (error) {
                    // Ignorar erro silenciosamente
                }
            }
        }

        return {
            ...item,
            unit_cost: productCostPrice,
            total_cost: itemCMV
        };
    } catch (error) {
        return {
            ...item,
            unit_cost: 0,
            total_cost: 0
        };
    }
}

/**
 * Exibe modal com detalhes do CMV do pedido
 * @param {number} orderId - ID do pedido
 */
export async function showCmvPedidoModal(orderId) {
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
        
        // ALTERAÇÃO: Usar customer_name retornado pela API (já vem do JOIN com USERS)
        const customerName = escapeHTML(order.customer_name || order.user?.full_name || 'Cliente não informado');
        
        const orderDate = order.created_at || order.date || '';
        const orderType = formatOrderType(order.order_type);
        const orderStatus = formatOrderStatus(order.status);
        const paymentMethod = formatPaymentMethod(order.payment_method || '-');
        const totalAmount = parseFloat(order.total_amount || order.total || 0);
        
        // ALTERAÇÃO: Usar items com CMV já calculado pelo backend
        const itemsWithCMV = order.items || [];

        // ALTERAÇÃO: Buscar ingredientes base de cada produto para exibir todos os insumos
        const itemsWithBaseIngredients = await Promise.all(
            itemsWithCMV.map(async (item) => {
                const productId = item.product_id || item.product?.id;
                let baseIngredients = [];
                
                if (productId) {
                    try {
                        const productIngredientsResponse = await getProductIngredients(productId, item.quantity || 1);
                        const ingredientsList = Array.isArray(productIngredientsResponse) 
                            ? productIngredientsResponse 
                            : (productIngredientsResponse?.items || []);
                        
                        // ALTERAÇÃO: Filtrar apenas ingredientes base (portions > 0)
                        baseIngredients = ingredientsList
                            .filter(ing => {
                                const portions = parseFloat(ing.portions || 0);
                                return portions > 0;
                            })
                            .map(ing => {
                                // ALTERAÇÃO: Calcular custo unitário do insumo base usando estrutura correta da API
                                const ingredientPrice = parseFloat(ing.price || 0);
                                const stockUnit = ing.stock_unit || 'un';
                                const basePortionQuantity = parseFloat(ing.base_portion_quantity || 1) || 1;
                                const basePortionUnit = ing.base_portion_unit || 'un';
                                const portions = parseFloat(ing.portions || 0);
                                
                                // ALTERAÇÃO: Calcular custo por porção base
                                const costPerBasePortion = calculateCostPerBasePortion(
                                    ingredientPrice,
                                    stockUnit,
                                    basePortionQuantity,
                                    basePortionUnit
                                );
                                
                                // ALTERAÇÃO: Quantidade total = portions × quantity do item
                                const totalQuantity = portions * (item.quantity || 1);
                                const totalCost = costPerBasePortion * totalQuantity;
                                
                                return {
                                    ingredient_id: ing.ingredient_id || ing.id,
                                    name: ing.name || 'Ingrediente',
                                    portions: portions,
                                    quantity: totalQuantity,
                                    unit_cost: costPerBasePortion,
                                    total_cost: totalCost
                                };
                            });
                    } catch (error) {
                        // ALTERAÇÃO: Ignorar erro silenciosamente - ingredientes base não são críticos para exibição
                    }
                }
                
                return {
                    ...item,
                    base_ingredients: baseIngredients
                };
            })
        );

        // Criar ou obter modal seguindo padrão do sistema
        let modal = document.getElementById('modal-cmv-pedido');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'modal-cmv-pedido';
            modal.className = 'modal';
            document.body.appendChild(modal);
        }

        // ALTERAÇÃO: Estrutura HTML seguindo padrão do sistema com melhorias de acessibilidade
        modal.innerHTML = `
            <div class="div-overlay" data-close-modal="modal-cmv-pedido" role="button" tabindex="0" aria-label="Fechar modal"></div>
            <div class="modal-content-cmv-pedido" role="dialog" aria-labelledby="modal-cmv-title" aria-modal="true">
                <div class="header-modal">
                    <h2 id="modal-cmv-title">CMV - Pedido #${orderIdDisplay}</h2>
                    <button type="button" class="fechar-modal" data-close-modal="modal-cmv-pedido" aria-label="Fechar modal" tabindex="0">
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
                                <div class="invoice-detail-item">
                                    <span class="label">Valor Total do Pedido:</span>
                                    <span class="value highlight">R$ ${formatCurrency(totalAmount)}</span>
                                </div>
                            </div>
                        </div>

                        ${itemsWithBaseIngredients.length > 0 ? `
                        <div class="invoice-detail-section">
                            <h3>Itens do Pedido (Custo de Produção)</h3>
                            <div class="invoice-items-list">
                                <table class="invoice-items-table">
                                    <thead>
                                        <tr>
                                            <th style="text-align: left; width: 40%;">Produto / Insumos</th>
                                            <th style="text-align: right; width: 20%;">Valor Unitário</th>
                                            <th style="text-align: center; width: 15%;">Quantidade</th>
                                            <th style="text-align: right; width: 25%;">Valor Total</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${itemsWithBaseIngredients.map((item, itemIdx) => {
                                            const productName = escapeHTML(item.product?.name || item.product_name || 'Produto');
                                            const quantity = item.quantity || 1;
                                            // ALTERAÇÃO: Usar unit_cost e total_cost calculados pelo backend
                                            const unitCost = parseFloat(item.unit_cost || item.cost_price || 0);
                                            const totalCost = parseFloat(item.total_cost || (unitCost * quantity) || 0);
                                            
                                            // ALTERAÇÃO: Organizar insumos base, extras e modificações para exibição
                                            const baseIngredients = item.base_ingredients || [];
                                            const extras = item.extras || [];
                                            const baseMods = item.base_modifications || [];
                                            
                                            // ALTERAÇÃO: Cada linha deve ter todas as 4 colunas (sem rowspan)
                                            return `
                                            <tr>
                                                <td class="product-insumos-cell">
                                                    <div class="product-name-cell">
                                                        <strong>${productName}</strong>
                                                    </div>
                                                </td>
                                                <td class="unit-cost-cell" style="text-align: right;">
                                                    R$ ${formatCurrency(unitCost)}
                                                </td>
                                                <td class="quantity-cell" style="text-align: center;">
                                                    ${quantity}
                                                </td>
                                                <td class="total-cost-cell" style="text-align: right; font-weight: 600;">
                                                    R$ ${formatCurrency(totalCost)}
                                                </td>
                                            </tr>
                                            ${baseIngredients.map((baseIng, idx) => {
                                                const baseIngUnitCost = parseFloat(baseIng.unit_cost || 0);
                                                const baseIngQuantity = baseIng.quantity || 0;
                                                const baseIngTotalCost = parseFloat(baseIng.total_cost || (baseIngUnitCost * baseIngQuantity) || 0);
                                                return `
                                            <tr>
                                                <td class="insumo-details-cell">
                                                    <div class="insumo-item insumo-base">
                                                        <span class="insumo-name">${escapeHTML(baseIng.name || 'Insumo')}</span>
                                                    </div>
                                                </td>
                                                <td class="insumo-unit-cost-cell" style="text-align: right;">
                                                    R$ ${formatCurrency(baseIngUnitCost)}
                                                </td>
                                                <td class="insumo-quantity-cell" style="text-align: center;">
                                                    ${baseIngQuantity}
                                                </td>
                                                <td class="insumo-total-cost-cell" style="text-align: right; font-weight: 600;">
                                                    R$ ${formatCurrency(baseIngTotalCost)}
                                                </td>
                                            </tr>
                                                `;
                                            }).join('')}
                                            ${extras.map((extra, idx) => {
                                                const extraUnitCost = parseFloat(extra.unit_cost || 0);
                                                const extraQuantity = extra.quantity || 1;
                                                const extraTotalCost = extraUnitCost * extraQuantity;
                                                return `
                                            <tr>
                                                <td class="insumo-details-cell">
                                                    <div class="insumo-item insumo-extra">
                                                        <span class="insumo-label">Extra ${idx + 1}:</span>
                                                        <span class="insumo-name">${escapeHTML(extra.name || 'Extra')}</span>
                                                    </div>
                                                </td>
                                                <td class="insumo-unit-cost-cell" style="text-align: right;">
                                                    R$ ${formatCurrency(extraUnitCost)}
                                                </td>
                                                <td class="insumo-quantity-cell" style="text-align: center;">
                                                    ${extraQuantity}
                                                </td>
                                                <td class="insumo-total-cost-cell" style="text-align: right; font-weight: 600;">
                                                    R$ ${formatCurrency(extraTotalCost)}
                                                </td>
                                            </tr>
                                                `;
                                            }).join('')}
                                            ${baseMods.map((mod, idx) => {
                                                const modUnitCost = parseFloat(mod.unit_cost || 0);
                                                const modDelta = mod.delta || 0;
                                                const modTotalCost = modUnitCost * Math.abs(modDelta);
                                                const deltaSign = modDelta > 0 ? '+' : modDelta < 0 ? '-' : '';
                                                return `
                                            <tr>
                                                <td class="insumo-details-cell">
                                                    <div class="insumo-item insumo-modification">
                                                        <span class="insumo-label">Modificação ${idx + 1}:</span>
                                                        <span class="insumo-name">${escapeHTML(mod.name || 'Modificação')}</span>
                                                    </div>
                                                </td>
                                                <td class="insumo-unit-cost-cell" style="text-align: right;">
                                                    R$ ${formatCurrency(modUnitCost)}
                                                </td>
                                                <td class="insumo-quantity-cell" style="text-align: center;">
                                                    ${deltaSign}${Math.abs(modDelta)}
                                                </td>
                                                <td class="insumo-total-cost-cell" style="text-align: right; font-weight: 600;">
                                                    R$ ${formatCurrency(modTotalCost)}
                                                </td>
                                            </tr>
                                                `;
                                            }).join('')}
                                            `;
                                        }).join('')}
                                    </tbody>
                                    <tfoot>
                                        <tr>
                                            <td colspan="3" style="text-align: right; font-weight: bold; padding: 16px;">Total CMV:</td>
                                            <td style="text-align: right; font-weight: bold; padding: 16px; font-size: 16px;">R$ ${formatCurrency(itemsWithBaseIngredients.reduce((sum, item) => {
                                                return sum + (parseFloat(item.total_cost || 0));
                                            }, 0))}</td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        </div>
                        ` : ''}
                    </div>
                </div>
                <div class="footer-modal">
                    <button type="button" class="btn-cancelar" data-close-modal="modal-cmv-pedido" aria-label="Fechar modal de detalhes do CMV do pedido">Fechar</button>
                </div>
            </div>
        `;

        // ALTERAÇÃO: Configurar event listeners do modal antes de abrir
        const handleCloseModal = () => {
            fecharModal('modal-cmv-pedido');
        };
        
        // ALTERAÇÃO: Adicionar listeners para todos os elementos de fechar (clique e teclado)
        const closeButtons = modal.querySelectorAll('[data-close-modal="modal-cmv-pedido"]');
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
        const modalContent = modal.querySelector('.modal-content-cmv-pedido');
        if (modalContent) {
            modalContent.setAttribute('tabindex', '-1');
        }

        // Garantir que o modal está no DOM antes de abrir
        if (!document.body.contains(modal)) {
            document.body.appendChild(modal);
        }

        // ALTERAÇÃO: Usar sistema de modais.js para abrir modal
        setTimeout(() => {
            abrirModal('modal-cmv-pedido');
            // ALTERAÇÃO: Focar no conteúdo do modal para acessibilidade
            if (modalContent) {
                modalContent.focus();
            }
        }, 10);
    } catch (error) {
        showToast('Erro ao carregar detalhes do CMV do pedido', { type: 'error' });
    }
}

