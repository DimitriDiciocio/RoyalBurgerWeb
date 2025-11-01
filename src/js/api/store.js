/**
 * API de Horários de Funcionamento
 * Gerencia operações relacionadas aos horários da loja
 */

import { apiRequest } from './api.js';

/**
 * Busca os horários de funcionamento da loja
 * @returns {Promise<Object>} Horários de funcionamento
 */
export async function getStoreHours() {
    try {
        const data = await apiRequest('/api/store/hours', {
            method: 'GET',
            skipAuth: true // Endpoint público
        });

        return {
            success: true,
            data: data.hours || []
        };
    } catch (error) {
        console.error('Erro ao buscar horários de funcionamento:', error.message);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Verifica se a loja está aberta no momento
 * @returns {Promise<Object>} Status da loja
 */
export async function isStoreOpen() {
    try {
        const data = await apiRequest('/api/store/is-open', {
            method: 'GET',
            skipAuth: true // Endpoint público
        });

        return {
            success: true,
            isOpen: data.is_open || false,
            message: data.message || ''
        };
    } catch (error) {
        console.error('Erro ao verificar status da loja:', error.message);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Atualiza os horários de um dia específico
 * @param {number} dayOfWeek - Dia da semana (0=Domingo, 1=Segunda, ..., 6=Sábado)
 * @param {string} [openingTime] - Horário de abertura (HH:MM)
 * @param {string} [closingTime] - Horário de fechamento (HH:MM)
 * @param {boolean} [isOpen] - Se a loja está aberta neste dia
 * @returns {Promise<Object>} Resultado da operação
 */
export async function updateStoreHours(dayOfWeek, openingTime = null, closingTime = null, isOpen = null) {
    try {
        if (typeof dayOfWeek !== 'number' || dayOfWeek < 0 || dayOfWeek > 6) {
            throw new Error('day_of_week deve ser um número entre 0 e 6 (0=Domingo, 6=Sábado)');
        }

        const body = {
            day_of_week: dayOfWeek
        };

        if (openingTime !== null) body.opening_time = openingTime;
        if (closingTime !== null) body.closing_time = closingTime;
        if (isOpen !== null) body.is_open = isOpen;

        const data = await apiRequest('/api/store/hours', {
            method: 'PUT',
            body: body
        });

        return {
            success: true,
            message: data.message
        };
    } catch (error) {
        console.error('Erro ao atualizar horários:', error.message);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Atualiza múltiplos dias de uma vez
 * @param {Array} hoursData - Lista de horários para atualizar
 * @returns {Promise<Object>} Resultado da operação
 */
export async function bulkUpdateStoreHours(hoursData) {
    try {
        if (!Array.isArray(hoursData) || hoursData.length === 0) {
            throw new Error('hours deve ser uma lista não vazia');
        }

        const data = await apiRequest('/api/store/hours/bulk', {
            method: 'PUT',
            body: {
                hours: hoursData
            }
        });

        return {
            success: true,
            message: data.message,
            successCount: data.success_count || 0,
            failedCount: data.failed_count || 0,
            errors: data.errors || []
        };
    } catch (error) {
        console.error('Erro ao atualizar horários em massa:', error.message);
        return {
            success: false,
            error: error.message
        };
    }
}

