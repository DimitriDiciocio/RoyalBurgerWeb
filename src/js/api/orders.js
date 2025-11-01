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
    const validStatuses = ['pending', 'preparing', 'ready', 'on_the_way', 'delivered', 'paid', 'completed', 'cancelled'];
    return typeof status === 'string' && validStatuses.includes(status);
}

/**
 * Cria um novo pedido
 * @param {Object} orderData - Dados do pedido
 * @param {number} orderData.address_id - ID do endereço
 * @param {Array} orderData.items - Itens do pedido
 * @param {string} orderData.payment_method - Método de pagamento
 * @param {string} [orderData.notes] - Observações
 * @param {number} [orderData.change_for_amount] - Troco para
 * @param {string} [orderData.cpf_on_invoice] - CPF na nota
 * @param {number} [orderData.points_to_redeem] - Pontos para resgatar
 * @param {boolean} [orderData.use_cart] - Usar carrinho
 * @returns {Promise<Object>} Resultado da operação
 */
export async function createOrder(orderData) {
    try {
        if (!orderData || typeof orderData !== 'object') {
            throw new Error('Dados do pedido são obrigatórios');
        }

        // Validar address_id: se order_type for 'pickup', não deve estar presente
        // Caso contrário, deve ser um ID válido
        if (orderData.order_type === 'pickup') {
            // Para pickup, remover address_id se estiver presente
            if (orderData.address_id !== undefined) {
                delete orderData.address_id;
            }
        } else {
            // Para delivery, address_id é obrigatório e deve ser válido
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

        const data = await apiRequest('/api/orders/', {
            method: 'POST',
            body: orderData
        });

        return {
            success: true,
            data: data
        };
    } catch (error) {
        console.error('Erro ao criar pedido:', error.message);
        return {
            success: false,
            error: error.message
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
        console.error('Erro ao calcular total:', error.message);
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
        const data = await apiRequest('/api/orders/', {
            method: 'GET'
        });

        return {
            success: true,
            data: data
        };
    } catch (error) {
        console.error('Erro ao buscar pedidos:', error.message);
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
        console.error('Erro ao buscar todos os pedidos:', error.message);
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
        console.error('Erro ao buscar pedidos do dia:', error.message);
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
        console.error('Erro ao atualizar status:', error.message);
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
        console.error('Erro ao buscar detalhes do pedido:', error.message);
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
        console.error('Erro ao cancelar pedido:', error.message);
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
