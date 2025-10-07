/**
 * API de Ingredientes (Insumos)
 * Gerencia operações CRUD para ingredientes/insumos
 */

import { apiRequest } from './api.js';

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
 * Busca um ingrediente por ID
 * @param {number} ingredientId - ID do ingrediente
 * @returns {Promise<Object>} Dados do ingrediente
 */
export const getIngredientById = async (ingredientId) => {
    // Como o endpoint GET /api/ingredients/{id} não está implementado,
    // vamos buscar todos os ingredientes e filtrar pela ID
    const response = await getIngredients({ page_size: 1000 });
    const ingredient = response.items.find(ing => ing.id === ingredientId);
    
    if (!ingredient) {
        throw new Error(`Ingrediente com ID ${ingredientId} não encontrado`);
    }
    
    return ingredient;
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
    return await apiRequest(`/api/ingredients/${ingredientId}/stock`, {
        method: 'POST',
        body: JSON.stringify({ change: changeAmount })
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
    
    // Como não há endpoint específico, vamos calcular localmente
    // ou implementar um endpoint no backend
    const ingredients = await getIngredients({ page_size: 1000 });
    
    let totalValue = 0;
    let outOfStock = 0;
    let lowStock = 0;
    let inStock = 0;
    let totalItems = 0;
    
    if (ingredients.items && ingredients.items.length > 0) {
        ingredients.items.forEach(ingredient => {
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
};

/**
 * Obtém ingredientes com estoque baixo
 * @returns {Promise<Array>} Lista de ingredientes com estoque baixo
 */
export const getLowStockIngredients = async () => {
    const response = await getIngredients({ status: 'low_stock', page_size: 1000 });
    return response.items;
};

/**
 * Obtém ingredientes sem estoque
 * @returns {Promise<Array>} Lista de ingredientes sem estoque
 */
export const getOutOfStockIngredients = async () => {
    const response = await getIngredients({ status: 'out_of_stock', page_size: 1000 });
    return response.items;
};

/**
 * Obtém ingredientes em estoque adequado
 * @returns {Promise<Array>} Lista de ingredientes em estoque
 */
export const getInStockIngredients = async () => {
    const response = await getIngredients({ status: 'in_stock', page_size: 1000 });
    return response.items;
};
