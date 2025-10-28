/**
 * API de Dashboard
 * Gerencia métricas e dados do painel administrativo
 */

import { apiRequest } from './api.js';

/**
 * Busca métricas do dashboard
 * @returns {Promise<Object>} Métricas do dashboard
 */
export async function getDashboardMetrics() {
    try {
        const data = await apiRequest('/api/dashboard/metrics', {
            method: 'GET'
        });

        return {
            success: true,
            data: data
        };
    } catch (error) {
        console.error('Erro ao buscar métricas:', error.message);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Formata valor monetário
 * @param {number} value - Valor a ser formatado
 * @returns {string} Valor formatado
 */
export function formatCurrency(value) {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(value || 0);
}

/**
 * Formata número com separadores
 * @param {number} value - Número a ser formatado
 * @returns {string} Número formatado
 */
export function formatNumber(value) {
    return new Intl.NumberFormat('pt-BR').format(value || 0);
}

/**
 * Formata tempo em minutos para formato legível
 * @param {number} minutes - Tempo em minutos
 * @returns {string} Tempo formatado
 */
export function formatTime(minutes) {
    if (!minutes || minutes === 0) return '0 min';
    
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    
    if (hours > 0) {
        return `${hours}h ${mins}min`;
    }
    
    return `${mins} min`;
}

/**
 * Calcula porcentagem
 * @param {number} value - Valor atual
 * @param {number} total - Valor total
 * @returns {number} Porcentagem
 */
export function calculatePercentage(value, total) {
    if (!total || total === 0) return 0;
    return Math.round((value / total) * 100);
}
