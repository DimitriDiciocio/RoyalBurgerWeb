/**
 * API de Promoções
 * Gerencia operações para promoções de produtos
 */

import { apiRequest } from './api.js';

/**
 * Lista todas as promoções ativas
 * @param {Object} options - Opções de filtro e paginação
 * @param {boolean} options.include_expired - Incluir promoções expiradas (padrão: false)
 * @param {number} options.page - Página atual (padrão: 1)
 * @param {number} options.page_size - Itens por página (padrão: 20)
 * @param {string} options.search - Termo de busca (nome do produto, ID da promoção)
 * @param {string} options.status - Filtro por status (ativas, expiradas, todas)
 * @returns {Promise<Object>} Lista de promoções com detalhes dos produtos e paginação
 */
export const getPromotions = async (options = {}) => {
    const params = new URLSearchParams();
    
    if (options.include_expired !== undefined) {
        params.append('include_expired', options.include_expired.toString());
    }
    if (options.page) params.append('page', options.page);
    if (options.page_size) params.append('page_size', options.page_size);
    if (options.search) params.append('search', options.search);
    if (options.status) params.append('status', options.status);
    
    const queryString = params.toString();
    const url = `/api/promotions${queryString ? `?${queryString}` : ''}`;
    
    try {
        const response = await apiRequest(url, {
            method: 'GET'
        });
        return response;
    } catch (error) {
        throw error;
    }
};

/**
 * Busca uma promoção por ID
 * @param {number} promotionId - ID da promoção
 * @returns {Promise<Object>} Dados da promoção
 */
export const getPromotionById = async (promotionId) => {
    if (!promotionId || isNaN(promotionId) || promotionId <= 0) {
        throw new Error('ID da promoção é obrigatório e deve ser um número positivo');
    }
    
    return await apiRequest(`/api/promotions/${promotionId}`, {
        method: 'GET'
    });
};

/**
 * Busca promoção de um produto específico
 * @param {number} productId - ID do produto
 * @param {boolean} includeExpired - Se true, inclui promoções expiradas (padrão: false)
 * @returns {Promise<Object>} Dados da promoção ou null se não houver
 */
export const getPromotionByProductId = async (productId, includeExpired = false) => {
    if (!productId || isNaN(productId) || productId <= 0) {
        throw new Error('ID do produto é obrigatório e deve ser um número positivo');
    }
    
    try {
        const url = `/api/promotions/product/${productId}${includeExpired ? '?include_expired=true' : ''}`;
        return await apiRequest(url, {
            method: 'GET'
        });
    } catch (error) {
        // Se retornar 404, não há promoção para este produto
        if (error.status === 404) {
            return null;
        }
        throw error;
    }
};

/**
 * Cria uma nova promoção
 * @param {Object} promotionData - Dados da promoção
 * @param {number} promotionData.product_id - ID do produto
 * @param {number} [promotionData.discount_percentage] - Percentual de desconto (0-100)
 * @param {number} [promotionData.discount_value] - Valor fixo de desconto
 * @param {string} promotionData.expires_at - Data de expiração (ISO 8601)
 * @returns {Promise<Object>} Dados da promoção criada
 */
export const createPromotion = async (promotionData) => {
    if (!promotionData.product_id || isNaN(promotionData.product_id) || promotionData.product_id <= 0) {
        throw new Error('ID do produto é obrigatório e deve ser um número positivo');
    }
    
    if (!promotionData.expires_at) {
        throw new Error('Data de expiração é obrigatória');
    }
    
    if (!promotionData.discount_percentage && !promotionData.discount_value) {
        throw new Error('É necessário informar desconto percentual ou valor fixo');
    }
    
    if (promotionData.discount_percentage && promotionData.discount_value) {
        throw new Error('Informe apenas desconto percentual ou valor fixo, não ambos');
    }
    
    return await apiRequest('/api/promotions', {
        method: 'POST',
        body: JSON.stringify(promotionData)
    });
};

/**
 * Atualiza uma promoção existente
 * @param {number} promotionId - ID da promoção
 * @param {Object} promotionData - Dados da promoção para atualizar
 * @param {number} [promotionData.product_id] - ID do produto
 * @param {number} [promotionData.discount_percentage] - Percentual de desconto (0-100)
 * @param {number} [promotionData.discount_value] - Valor fixo de desconto
 * @param {string} [promotionData.expires_at] - Data de expiração (ISO 8601)
 * @returns {Promise<Object>} Dados da promoção atualizada
 */
export const updatePromotion = async (promotionId, promotionData) => {
    if (!promotionId || isNaN(promotionId) || promotionId <= 0) {
        throw new Error('ID da promoção é obrigatório e deve ser um número positivo');
    }
    
    if (promotionData.discount_percentage && promotionData.discount_value) {
        throw new Error('Informe apenas desconto percentual ou valor fixo, não ambos');
    }
    
    return await apiRequest(`/api/promotions/${promotionId}`, {
        method: 'PUT',
        body: JSON.stringify(promotionData)
    });
};

/**
 * Remove uma promoção
 * @param {number} promotionId - ID da promoção
 * @returns {Promise<void>}
 */
export const deletePromotion = async (promotionId) => {
    if (!promotionId || isNaN(promotionId) || promotionId <= 0) {
        throw new Error('ID da promoção é obrigatório e deve ser um número positivo');
    }
    
    return await apiRequest(`/api/promotions/${promotionId}`, {
        method: 'DELETE'
    });
};

