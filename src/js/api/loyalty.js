/**
 * API de Fidelidade
 * Gerencia operações do sistema de pontos Royal
 */

import { apiRequest } from './api.js';

// Constantes para validação
const LOYALTY_CONSTANTS = {
    POINTS_TO_REAIS_RATE: 100, // 100 pontos = 1 real
    MAX_POINTS_PER_ORDER: 10000, // Máximo de pontos por pedido
    MIN_POINTS: 0,
    MAX_POINTS: 999999
};

/**
 * Valida se um ID de usuário é válido
 * @param {any} userId - ID a ser validado
 * @returns {boolean} True se válido
 */
function isValidUserId(userId) {
    return userId !== null && userId !== undefined && 
           Number.isInteger(Number(userId)) && Number(userId) > 0;
}

/**
 * Valida se uma quantidade de pontos é válida
 * @param {any} points - Pontos a serem validados
 * @returns {boolean} True se válidos
 */
function isValidPoints(points) {
    const numPoints = Number(points);
    return Number.isInteger(numPoints) && 
           numPoints >= LOYALTY_CONSTANTS.MIN_POINTS && 
           numPoints <= LOYALTY_CONSTANTS.MAX_POINTS;
}

/**
 * Busca saldo de pontos do usuário
 * @param {number} userId - ID do usuário
 * @returns {Promise<Object>} Dados do saldo
 */
export async function getLoyaltyBalance(userId) {
    if (!isValidUserId(userId)) {
        throw new Error('ID do usuário inválido');
    }
    
    return await apiRequest(`/api/loyalty/balance/${userId}`, {
        method: 'GET'
    });
}

/**
 * Busca histórico de pontos do usuário
 * @param {number} userId - ID do usuário
 * @returns {Promise<Array>} Histórico de transações
 */
export async function getLoyaltyHistory(userId) {
    if (!isValidUserId(userId)) {
        throw new Error('ID do usuário inválido');
    }
    
    return await apiRequest(`/api/loyalty/history/${userId}`, {
        method: 'GET'
    });
}

/**
 * Adiciona pontos manualmente (admin/manager)
 * @param {Object} data - Dados dos pontos
 * @param {number} data.user_id - ID do usuário
 * @param {number} data.points - Quantidade de pontos
 * @param {string} data.reason - Motivo da adição
 * @param {number} [data.order_id] - ID do pedido (opcional)
 * @returns {Promise<Object>} Resultado da operação
 */
export async function addPointsManually(data) {
    if (!data || typeof data !== 'object') {
        throw new Error('Dados inválidos');
    }
    
    if (!isValidUserId(data.user_id)) {
        throw new Error('ID do usuário inválido');
    }
    
    if (!isValidPoints(data.points)) {
        throw new Error(`Pontos devem ser entre ${LOYALTY_CONSTANTS.MIN_POINTS} e ${LOYALTY_CONSTANTS.MAX_POINTS}`);
    }
    
    if (!data.reason || typeof data.reason !== 'string' || data.reason.trim().length === 0) {
        throw new Error('Motivo é obrigatório');
    }
    
    return await apiRequest('/api/loyalty/add-points', {
        method: 'POST',
        body: data
    });
}

/**
 * Gasta pontos manualmente (admin/manager)
 * @param {Object} data - Dados dos pontos
 * @param {number} data.user_id - ID do usuário
 * @param {number} data.points - Quantidade de pontos
 * @param {string} data.reason - Motivo do gasto
 * @param {number} [data.order_id] - ID do pedido (opcional)
 * @returns {Promise<Object>} Resultado da operação
 */
export async function spendPointsManually(data) {
    if (!data || typeof data !== 'object') {
        throw new Error('Dados inválidos');
    }
    
    if (!isValidUserId(data.user_id)) {
        throw new Error('ID do usuário inválido');
    }
    
    if (!isValidPoints(data.points)) {
        throw new Error(`Pontos devem ser entre ${LOYALTY_CONSTANTS.MIN_POINTS} e ${LOYALTY_CONSTANTS.MAX_POINTS}`);
    }
    
    if (!data.reason || typeof data.reason !== 'string' || data.reason.trim().length === 0) {
        throw new Error('Motivo é obrigatório');
    }
    
    return await apiRequest('/api/loyalty/spend-points', {
        method: 'POST',
        body: data
    });
}

/**
 * Executa processo de expiração de pontos (admin/manager)
 * @returns {Promise<Object>} Resultado da operação
 */
export async function expireInactiveAccounts() {
    return await apiRequest('/api/loyalty/expire-accounts', {
        method: 'POST'
    });
}

/**
 * Busca estatísticas do sistema de fidelidade (admin/manager)
 * @returns {Promise<Object>} Estatísticas do sistema
 */
export async function getLoyaltyStats() {
    return await apiRequest('/api/loyalty/stats', {
        method: 'GET'
    });
}

/**
 * Calcula desconto baseado em pontos
 * @param {number} points - Quantidade de pontos
 * @returns {number} Valor do desconto em reais
 */
export function calculateDiscountFromPoints(points) {
    if (!isValidPoints(points)) {
        throw new Error(`Pontos devem ser entre ${LOYALTY_CONSTANTS.MIN_POINTS} e ${LOYALTY_CONSTANTS.MAX_POINTS}`);
    }
    
    // Usar arredondamento para evitar problemas de precisão
    return Math.round((points / LOYALTY_CONSTANTS.POINTS_TO_REAIS_RATE) * 100) / 100;
}

/**
 * Calcula pontos necessários para um desconto
 * @param {number} discountValue - Valor do desconto em reais
 * @returns {number} Quantidade de pontos necessários
 */
export function calculatePointsForDiscount(discountValue) {
    if (typeof discountValue !== 'number' || discountValue < 0) {
        throw new Error('Valor do desconto deve ser um número positivo');
    }
    
    return Math.floor(discountValue * LOYALTY_CONSTANTS.POINTS_TO_REAIS_RATE);
}

/**
 * Valida se o usuário pode resgatar pontos
 * @param {number} userBalance - Saldo atual do usuário
 * @param {number} pointsToRedeem - Pontos para resgatar
 * @param {number} orderTotal - Valor total do pedido
 * @returns {Object} Resultado da validação
 */
export function validatePointsRedemption(userBalance, pointsToRedeem, orderTotal) {
    // Validar parâmetros de entrada
    if (typeof userBalance !== 'number' || userBalance < 0) {
        throw new Error('Saldo do usuário deve ser um número não negativo');
    }
    
    if (typeof orderTotal !== 'number' || orderTotal <= 0) {
        throw new Error('Valor total do pedido deve ser um número positivo');
    }
    
    if (!isValidPoints(pointsToRedeem)) {
        throw new Error(`Pontos para resgatar devem ser entre ${LOYALTY_CONSTANTS.MIN_POINTS} e ${LOYALTY_CONSTANTS.MAX_POINTS}`);
    }
    
    const maxPointsForOrder = Math.floor(orderTotal * LOYALTY_CONSTANTS.POINTS_TO_REAIS_RATE);
    const maxPointsToRedeem = Math.min(userBalance, maxPointsForOrder);
    
    if (pointsToRedeem > userBalance) {
        return {
            valid: false,
            error: 'Saldo de pontos insuficiente',
            maxPoints: userBalance
        };
    }
    
    if (pointsToRedeem > maxPointsForOrder) {
        return {
            valid: false,
            error: `Máximo de pontos para este pedido: ${maxPointsForOrder}`,
            maxPoints: maxPointsForOrder
        };
    }
    
    return {
        valid: true,
        maxPoints: maxPointsToRedeem,
        discount: calculateDiscountFromPoints(pointsToRedeem)
    };
}
