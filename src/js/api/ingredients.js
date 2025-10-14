/**
 * API de Ingredientes (Insumos)
 * Gerencia operações CRUD para ingredientes/insumos
 */

import { apiRequest } from './api.js';

// Constantes para evitar hardcoding
const MAX_PAGE_SIZE = 1000; // TODO: Implementar paginação adequada no backend

/**
 * Lista todos os ingredientes com filtros opcionais
 * @param {Object} options - Opções de filtro e paginação
 * @param {string} options.name - Filtro por nome
 * @param {string} options.status - Filtro por status (low_stock, out_of_stock, in_stock, unavailable, available, overstock)
 * @param {number} options.page - Página
 * @param {number} options.page_size - Itens por página
 * @returns {Promise<Object>} Lista de ingredientes com paginação
 */
export const getIngredients = async (options = {}) => {
    const params = new URLSearchParams();
    
    if (options.name) params.append('name', options.name);
    if (options.status) params.append('status', options.status);
    if (options.page) params.append('page', options.page);
    if (options.page_size) params.append('page_size', options.page_size);
    
    const queryString = params.toString();
    const url = `/api/ingredients${queryString ? `?${queryString}` : ''}`;
    
    return await apiRequest(url, {
        method: 'GET'
    });
};

/**
 * Busca um ingrediente por ID-
 * @param {number} ingredientId - ID do ingrediente
 * @returns {Promise<Object>} Dados do ingrediente
 */
export const getIngredientById = async (ingredientId) => {
    try {
        // Como o endpoint GET /api/ingredients/{id} não está implementado,
        // vamos buscar todos os ingredientes e filtrar pela ID
        const response = await getIngredients({ page_size: MAX_PAGE_SIZE }); // TODO: Implementar endpoint específico
        
        if (!response || !response.items) {
            throw new Error('Resposta inválida da API');
        }
        
        // Converter ingredientId para número para comparação
        const targetId = parseInt(ingredientId);
        const ingredient = response.items.find(ing => parseInt(ing.id) === targetId);
        
        if (!ingredient) {
            const error = new Error(`Ingrediente com ID ${ingredientId} não encontrado`);
            error.status = 404;
            throw error;
        }
        
        return ingredient;
    } catch (error) {
        throw error;
    }
};

/**
 * Cria um novo ingrediente
 * @param {Object} ingredientData - Dados do ingrediente
 * @param {string} ingredientData.name - Nome do ingrediente
 * @param {string} ingredientData.description - Descrição
 * @param {number} ingredientData.price - Preço por unidade
 * @param {number} ingredientData.current_stock - Estoque atual
 * @param {string} ingredientData.stock_unit - Unidade de estoque
 * @param {number} ingredientData.min_stock_threshold - Estoque mínimo
 * @param {number} ingredientData.max_stock - Estoque máximo
 * @param {string} ingredientData.supplier - Fornecedor do ingrediente
 * @returns {Promise<Object>} Ingrediente criado
 */
export const createIngredient = async (ingredientData) => {
    return await apiRequest('/api/ingredients', {
        method: 'POST',
        body: JSON.stringify(ingredientData)
    });
};

/**
 * Atualiza um ingrediente existente
 * @param {number} ingredientId - ID do ingrediente
 * @param {Object} updateData - Dados para atualização
 * @returns {Promise<Object>} Resultado da atualização
 */
export const updateIngredient = async (ingredientId, updateData) => {
    return await apiRequest(`/api/ingredients/${ingredientId}`, {
        method: 'PUT',
        body: JSON.stringify(updateData)
    });
};

/**
 * Exclui um ingrediente
 * @param {number} ingredientId - ID do ingrediente
 * @returns {Promise<Object>} Resultado da exclusão
 */
export const deleteIngredient = async (ingredientId) => {
    return await apiRequest(`/api/ingredients/${ingredientId}`, {
        method: 'DELETE'
    });
};

/**
 * Atualiza a disponibilidade de um ingrediente
 * @param {number} ingredientId - ID do ingrediente
 * @param {boolean} isAvailable - Status de disponibilidade
 * @returns {Promise<Object>} Resultado da atualização
 */
export const updateIngredientAvailability = async (ingredientId, isAvailable) => {
    return await apiRequest(`/api/ingredients/${ingredientId}/availability`, {
        method: 'PATCH',
        body: JSON.stringify({ is_available: isAvailable })
    });
};

/**
 * Ajusta o estoque de um ingrediente
 * @param {number} ingredientId - ID do ingrediente
 * @param {number} changeAmount - Quantidade de mudança (positiva ou negativa)
 * @returns {Promise<Object>} Resultado do ajuste
 */
export const adjustIngredientStock = async (ingredientId, changeAmount) => {
    // Garantir que changeAmount seja um número
    const numericChange = parseFloat(changeAmount);
    if (isNaN(numericChange)) {
        throw new Error('Valor de mudança inválido');
    }
    
    const payload = { change: numericChange };
    
    return await apiRequest(`/api/ingredients/${ingredientId}/stock`, {
        method: 'POST',
        body: JSON.stringify(payload)
    });
};

/**
 * Adiciona uma quantidade ao estoque atual do ingrediente
 * @param {number} ingredientId - ID do ingrediente
 * @param {number} quantity - Quantidade a ser adicionada ao estoque atual
 * @returns {Promise<Object>} Resultado da adição
 */
export const addIngredientQuantity = async (ingredientId, quantity) => {
    return await apiRequest(`/api/ingredients/${ingredientId}/add-quantity`, {
        method: 'POST',
        body: JSON.stringify({ quantity: quantity })
    });
};

/**
 * Obtém resumo do estoque
 * @returns {Promise<Object>} Resumo com métricas de estoque
 */
export const getStockSummary = async () => {
    try {
        // Usar cálculo local diretamente (endpoint não implementado no backend)
        const ingredients = await getIngredients({ page_size: MAX_PAGE_SIZE }); // TODO: Implementar endpoint de resumo
        
        let totalValue = 0;
        let outOfStock = 0;
        let lowStock = 0;
        let inStock = 0;
        let totalItems = 0;
        
        if (ingredients.items && ingredients.items.length > 0) {
            ingredients.items.forEach(ingredient => {
                // Considerar apenas insumos ativos (is_available = true)
                const isActive = ingredient.is_available !== undefined ? ingredient.is_available : true;
                
                if (!isActive) {
                    return; // Pular insumos inativos
                }
                
                const currentStock = parseFloat(ingredient.current_stock) || 0;
                const price = parseFloat(ingredient.price) || 0;
                const minThreshold = parseFloat(ingredient.min_stock_threshold) || 0;
                
                const value = currentStock * price;
                totalValue += value;
                totalItems++;
                
                if (currentStock === 0) {
                    outOfStock++;
                } else if (currentStock <= minThreshold) {
                    lowStock++;
                } else {
                    inStock++;
                }
            });
        }
        
        const summary = {
            total_stock_value: totalValue,
            total_items: totalItems,
            out_of_stock_count: outOfStock,
            low_stock_count: lowStock,
            in_stock_count: inStock
        };
        
        return summary;
    } catch (error) {
        console.error('Erro ao obter resumo do estoque:', error);
        // Retornar valores padrão em caso de erro
        return {
            total_stock_value: 0,
            total_items: 0,
            out_of_stock_count: 0,
            low_stock_count: 0,
            in_stock_count: 0
        };
    }
};

/**
 * Obtém ingredientes com estoque baixo (apenas ativos)
 * @returns {Promise<Array>} Lista de ingredientes com estoque baixo
 */
export const getLowStockIngredients = async () => {
    const response = await getIngredients({ page_size: MAX_PAGE_SIZE });
    if (!response.items) return [];
    
    // Filtrar apenas insumos ativos com estoque baixo
    return response.items.filter(ingredient => {
        const isActive = ingredient.is_available !== undefined ? ingredient.is_available : true;
        if (!isActive) return false;
        
        const currentStock = parseFloat(ingredient.current_stock) || 0;
        const minThreshold = parseFloat(ingredient.min_stock_threshold) || 0;
        
        return currentStock > 0 && currentStock <= minThreshold;
    });
};

/**
 * Obtém ingredientes sem estoque (apenas ativos)
 * @returns {Promise<Array>} Lista de ingredientes sem estoque
 */
export const getOutOfStockIngredients = async () => {
    const response = await getIngredients({ page_size: MAX_PAGE_SIZE });
    if (!response.items) return [];
    
    // Filtrar apenas insumos ativos sem estoque
    return response.items.filter(ingredient => {
        const isActive = ingredient.is_available !== undefined ? ingredient.is_available : true;
        if (!isActive) return false;
        
        const currentStock = parseFloat(ingredient.current_stock) || 0;
        return currentStock === 0;
    });
};

/**
 * Obtém ingredientes em estoque adequado (apenas ativos)
 * @returns {Promise<Array>} Lista de ingredientes em estoque
 */
export const getInStockIngredients = async () => {
    const response = await getIngredients({ page_size: MAX_PAGE_SIZE });
    if (!response.items) return [];
    
    // Filtrar apenas insumos ativos com estoque adequado
    return response.items.filter(ingredient => {
        const isActive = ingredient.is_available !== undefined ? ingredient.is_available : true;
        if (!isActive) return false;
        
        const currentStock = parseFloat(ingredient.current_stock) || 0;
        const minThreshold = parseFloat(ingredient.min_stock_threshold) || 0;
        
        return currentStock > minThreshold;
    });
};

/**
 * Verifica se um nome de ingrediente já existe
 * @param {string} name - Nome do ingrediente a verificar
 * @returns {Promise<Object>} Resultado da verificação
 */
export const checkIngredientNameExists = async (name) => {
    return await apiRequest('/api/ingredients/check-name', {
        method: 'POST',
        body: JSON.stringify({ name: name.trim() })
    });
};