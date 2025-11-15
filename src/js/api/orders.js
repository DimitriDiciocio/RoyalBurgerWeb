/**
 * API de Pedidos
 * Gerencia operações relacionadas a pedidos
 */

import { apiRequest } from './api.js';

/**
 * Valida se um ID de pedido é válido
 * @param {any} orderId - ID a ser validado
 * @returns {boolean} True se válido
 */
function isValidOrderId(orderId) {
    return orderId !== null && orderId !== undefined && 
           Number.isInteger(Number(orderId)) && Number(orderId) > 0;
}

/**
 * Valida se um status é válido
 * @param {any} status - Status a ser validado
 * @returns {boolean} True se válido
 */
function isValidStatus(status) {
    const validStatuses = ['pending', 'preparing', 'ready', 'in_progress', 'on_the_way', 'delivered', 'paid', 'completed', 'cancelled'];
    return typeof status === 'string' && validStatuses.includes(status);
}

/**
 * Cria um novo pedido
 * @param {Object} orderData - Dados do pedido
 * @param {number} orderData.address_id - ID do endereço
 * @param {Array} orderData.items - Itens do pedido
 * @param {string} orderData.payment_method - Método de pagamento
 * @param {string} [orderData.notes] - Observações
 * @param {number} [orderData.amount_paid] - Valor pago (obrigatório para pagamento em dinheiro, API calcula troco automaticamente)
 * @param {string} [orderData.cpf_on_invoice] - CPF na nota
 * @param {number} [orderData.points_to_redeem] - Pontos para resgatar
 * @param {boolean} [orderData.use_cart] - Usar carrinho
 * @param {Array} [orderData.promotions] - Informações de promoções para aplicar descontos
 * @param {Object} [orderData.promotions[].product_id] - ID do produto com promoção
 * @param {number} [orderData.promotions[].promotion_id] - ID da promoção
 * @param {number} [orderData.promotions[].discount_percentage] - Desconto percentual (se aplicável)
 * @param {number} [orderData.promotions[].discount_value] - Desconto em valor fixo (se aplicável)
 * @returns {Promise<Object>} Resultado da operação
 * 
 * IMPORTANTE - APLICAÇÃO DE DESCONTOS:
 * Quando orderData.promotions é fornecido, o backend DEVE:
 * 1. Para cada item do carrinho, verificar se há promoção correspondente em orderData.promotions
 * 2. Aplicar o desconto ao calcular item_subtotal de cada item
 * 3. Salvar o item_subtotal COM desconto aplicado no banco de dados
 * 4. Calcular subtotal, total e discounts do pedido considerando os descontos aplicados
 * 
 * Exemplo de cálculo:
 * - Produto: R$ 20,00, quantidade: 2, promoção: 10% de desconto
 * - item_subtotal original: R$ 40,00
 * - item_subtotal com desconto: R$ 36,00 (40 - 10% = 36)
 * - O valor R$ 36,00 deve ser salvo no banco como item_subtotal
 */
export async function createOrder(orderData) {
    try {
        if (!orderData || typeof orderData !== 'object') {
            throw new Error('Dados do pedido são obrigatórios');
        }

        // Validar e tratar address_id conforme order_type
        if (orderData.order_type === 'pickup') {
            // Para pickup, remover address_id completamente (backend não espera este campo)
            delete orderData.address_id;
        } else {
            // Para delivery, address_id é obrigatório
            if (!isValidOrderId(orderData.address_id)) {
                throw new Error('ID do endereço inválido');
            }
        }

        if (!orderData.payment_method || typeof orderData.payment_method !== 'string') {
            throw new Error('Método de pagamento é obrigatório');
        }

        if (!orderData.use_cart && (!orderData.items || !Array.isArray(orderData.items) || orderData.items.length === 0)) {
            throw new Error('Itens do pedido são obrigatórios quando não usar carrinho');
        }

        // IMPORTANTE: Quando use_cart=true, o backend buscará os itens diretamente do carrinho do usuário
        // O backend Python processa automaticamente a conversão de unidades (g → kg, mL → L, etc.)
        // através do sistema _convert_unit() e _calculate_consumption_in_stock_unit()
        // Os itens do carrinho devem estar no formato:
        //   - product_id: int
        //   - quantity: int >= 1
        //   - extras: [{ ingredient_id: int, quantity: int >= 1 }]
        //   - base_modifications: [{ ingredient_id: int, delta: int != 0 }]
        // A validação de estoque e conversão de unidades é feita automaticamente pelo backend

        // Limpar campos undefined e normalizar tipos antes de enviar
        const cleanedOrderData = {};
        for (const key in orderData) {
            if (orderData[key] !== undefined) {
                // Para pickup, garantir que address_id não esteja presente (já removido acima, mas dupla verificação)
                if (orderData.order_type === 'pickup' && key === 'address_id') {
                    continue;
                }
                
                // Normalizar amount_paid para número (evitar envio como string)
                if (key === 'amount_paid' && orderData[key] !== null) {
                    cleanedOrderData[key] = parseFloat(orderData[key]);
                    // Validar conversão
                    if (isNaN(cleanedOrderData[key])) {
                        throw new Error('Valor pago inválido');
                    }
                } else {
                    cleanedOrderData[key] = orderData[key];
                }
            }
        }

        const data = await apiRequest('/api/orders/', {
            method: 'POST',
            body: cleanedOrderData
        });

        return {
            success: true,
            data: data
        };
    } catch (error) {
        // Extrair mensagem de erro mais específica se disponível
        let errorMessage = error.message || 'Erro interno do servidor';
        
        // Tentar extrair mensagem do payload do erro (vindo do apiRequest)
        if (error.payload && error.payload.error) {
            errorMessage = error.payload.error;
        } else if (error.error) {
            errorMessage = error.error;
        } else if (typeof error === 'object' && error.data && error.data.error) {
            errorMessage = error.data.error;
        }
        
        // Detectar erro de migração do banco e ajustar mensagem
        if (error.status === 500) {
            const errorMsgLower = errorMessage.toLowerCase();
            const isMigrationError = errorMsgLower.includes('change_for_amount') || 
                errorMsgLower.includes('column') || 
                errorMsgLower.includes('migração') ||
                errorMsgLower.includes('alter table');
            
            if (isMigrationError) {
                errorMessage = 'Erro no banco de dados: Coluna CHANGE_FOR_AMOUNT não existe. Execute a migração SQL no banco de dados.';
            }
        }
        
        // Detectar erros de estoque (status 422) - a mensagem do backend já vem formatada
        if (error.status === 422) {
            // Manter mensagem original do backend que inclui unidades e valores
            // Exemplo: "Estoque insuficiente para Pão. Disponível: 17.000 kg, Necessário: 56.000 kg"
            // Não modificar a mensagem, apenas garantir que seja exibida
        }
        
        return {
            success: false,
            error: errorMessage
        };
    }
}

/**
 * Calcula o total do pedido sem criar
 * @param {Array} items - Itens do pedido
 * @param {number} [points_to_redeem] - Pontos para resgatar
 * @param {string} [order_type] - Tipo do pedido ('delivery' ou 'pickup')
 * @returns {Promise<Object>} Cálculo do total
 */
export async function calculateOrderTotal(items, points_to_redeem = 0, order_type = 'delivery') {
    try {
        if (!items || !Array.isArray(items) || items.length === 0) {
            throw new Error('Itens são obrigatórios');
        }

        const requestBody = {
            items: items,
            points_to_redeem: points_to_redeem
        };

        // Incluir order_type se especificado
        if (order_type) {
            requestBody.order_type = order_type;
        }

        const data = await apiRequest('/api/orders/calculate-total', {
            method: 'POST',
            body: requestBody
        });

        return {
            success: true,
            data: data
        };
    } catch (error) {
        // ALTERAÇÃO: Logging condicional apenas em modo debug
        if (typeof window !== 'undefined' && window.DEBUG_MODE) {
          console.error('Erro ao calcular total:', error.message);
        }
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Busca pedidos do usuário logado
 * @returns {Promise<Object>} Lista de pedidos
 */
export async function getMyOrders() {
    try {
        const data = await apiRequest('/api/orders/', { method: 'GET' });

        return {
            success: true,
            data: data
        };
    } catch (error) {
        // ALTERAÇÃO: Logging condicional apenas em modo debug
        if (typeof window !== 'undefined' && window.DEBUG_MODE) {
          console.error('Erro ao buscar pedidos:', error.message);
        }
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Busca todos os pedidos (admin/manager)
 * @returns {Promise<Object>} Lista de todos os pedidos
 */
export async function getAllOrders() {
    try {
        const data = await apiRequest('/api/orders/all', {
            method: 'GET'
        });

        return {
            success: true,
            data: data
        };
    } catch (error) {
        // ALTERAÇÃO: Logging condicional apenas em modo debug
        if (typeof window !== 'undefined' && window.DEBUG_MODE) {
          console.error('Erro ao buscar todos os pedidos:', error.message);
        }
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Busca pedidos do dia (admin/manager)
 * @returns {Promise<Object>} Lista de pedidos do dia
 */
export async function getTodayOrders() {
    try {
        const data = await apiRequest('/api/orders/today', {
            method: 'GET'
        });

        return {
            success: true,
            data: data
        };
    } catch (error) {
        // ALTERAÇÃO: Logging condicional apenas em modo debug
        if (typeof window !== 'undefined' && window.DEBUG_MODE) {
          console.error('Erro ao buscar pedidos do dia:', error.message);
        }
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Atualiza status do pedido (admin/manager/attendant)
 * @param {number} orderId - ID do pedido
 * @param {string} status - Novo status
 * @returns {Promise<Object>} Resultado da operação
 */
export async function updateOrderStatus(orderId, status) {
    try {
        if (!isValidOrderId(orderId)) {
            throw new Error('ID do pedido inválido');
        }

        if (!isValidStatus(status)) {
            throw new Error('Status inválido');
        }

        const data = await apiRequest(`/api/orders/${orderId}/status`, {
            method: 'PATCH',
            body: { status: status }
        });

        return {
            success: true,
            data: data
        };
    } catch (error) {
        // ALTERAÇÃO: Logging condicional apenas em modo debug
        if (typeof window !== 'undefined' && window.DEBUG_MODE) {
          console.error('Erro ao atualizar status:', error.message);
        }
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Busca detalhes de um pedido
 * @param {number} orderId - ID do pedido
 * @returns {Promise<Object>} Detalhes do pedido
 */
export async function getOrderDetails(orderId) {
    try {
        if (!isValidOrderId(orderId)) {
            throw new Error('ID do pedido inválido');
        }

        const data = await apiRequest(`/api/orders/${orderId}`, {
            method: 'GET'
        });

        return {
            success: true,
            data: data
        };
    } catch (error) {
        // ALTERAÇÃO: Logging condicional apenas em modo debug
        if (typeof window !== 'undefined' && window.DEBUG_MODE) {
          console.error('Erro ao buscar detalhes do pedido:', error.message);
        }
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Cancela um pedido (customer)
 * @param {number} orderId - ID do pedido
 * @returns {Promise<Object>} Resultado da operação
 */
export async function cancelOrder(orderId) {
    try {
        if (!isValidOrderId(orderId)) {
            throw new Error('ID do pedido inválido');
        }

        const data = await apiRequest(`/api/orders/${orderId}/cancel`, {
            method: 'POST'
        });

        return {
            success: true,
            data: data
        };
    } catch (error) {
        // ALTERAÇÃO: Logging condicional apenas em modo debug
        if (typeof window !== 'undefined' && window.DEBUG_MODE) {
          console.error('Erro ao cancelar pedido:', error.message);
        }
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Formata status para exibição
 * @param {string} status - Status do pedido
 * @returns {string} Status formatado
 */
export function formatOrderStatus(status) {
    const statusMap = {
        'pending': 'Pendente',
        'preparing': 'Preparando',
        'ready': 'Pronto',
        'in_progress': 'Pronto', // Fallback do backend quando 'ready' não está na constraint
        'on_the_way': 'Saiu para entrega',
        'delivered': 'Entregue',
        'paid': 'Pago',
        'completed': 'Concluído',
        'cancelled': 'Cancelado'
    };

    return statusMap[status] || status;
}

/**
 * Retorna cor do status para exibição
 * @param {string} status - Status do pedido
 * @returns {string} Classe CSS da cor
 */
export function getStatusColor(status) {
    const colorMap = {
        'pending': 'status-pending',
        'preparing': 'status-preparing',
        'ready': 'status-ready',
        'on_the_way': 'status-on-the-way',
        'delivered': 'status-delivered',
        'paid': 'status-paid',
        'completed': 'status-completed',
        'cancelled': 'status-cancelled'
    };

    return colorMap[status] || 'status-default';
}
