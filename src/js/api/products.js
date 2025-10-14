/**
 * API de Produtos
 * Gerencia operações CRUD para produtos e relacionamento com ingredientes
 */

import { apiRequest } from './api.js';

/**
 * Lista todos os produtos com filtros opcionais
 * @param {Object} options - Opções de filtro e paginação
 * @param {string} options.name - Filtro por nome
 * @param {number} options.category_id - Filtro por categoria
 * @param {number} options.page - Página
 * @param {number} options.page_size - Itens por página
 * @param {boolean} options.include_inactive - Incluir produtos inativos
 * @returns {Promise<Object>} Lista de produtos com paginação
 */
export const getProducts = async (options = {}) => {
    const params = new URLSearchParams();
    
    if (options.name) params.append('name', options.name);
    if (options.category_id) params.append('category_id', options.category_id);
    if (options.page) params.append('page', options.page);
    if (options.page_size) params.append('page_size', options.page_size);
    if (options.include_inactive !== undefined) params.append('include_inactive', options.include_inactive);
    
    const queryString = params.toString();
    const url = `/api/products/${queryString ? `?${queryString}` : ''}`;
    
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
 * Busca um produto por ID
 * @param {number} productId - ID do produto
 * @returns {Promise<Object>} Dados do produto
 */
export const getProductById = async (productId) => {
    return await apiRequest(`/api/products/${productId}`, {
        method: 'GET'
    });
};

/**
 * Cria um novo produto
 * @param {Object} productData - Dados do produto
 * @param {string} productData.name - Nome do produto
 * @param {string} productData.description - Descrição
 * @param {number} productData.price - Preço de venda
 * @param {number} productData.cost_price - Preço de custo
 * @param {number} productData.preparation_time_minutes - Tempo de preparo
 * @param {number} productData.category_id - ID da categoria
 * @param {File} productData.image - Arquivo de imagem (opcional)
 * @returns {Promise<Object>} Produto criado
 */
export const createProduct = async (productData) => {
    
    // Se há imagem, usa FormData, senão JSON
    if (productData.image) {
        const formData = new FormData();
        
        // Adiciona campos de texto
        if (productData.name) formData.append('name', productData.name);
        if (productData.description) formData.append('description', productData.description);
        if (productData.price) formData.append('price', productData.price);
        if (productData.cost_price !== undefined) formData.append('cost_price', productData.cost_price);
        if (productData.preparation_time_minutes) formData.append('preparation_time_minutes', productData.preparation_time_minutes);
        if (productData.category_id) formData.append('category_id', productData.category_id);
        
        // Adiciona imagem (o backend gerará o image_url automaticamente)
        if (productData.image) {
            formData.append('image', productData.image);
        }
        
        
        return await apiRequest('/api/products/', {
            method: 'POST',
            body: formData,
            headers: {} // Remove Content-Type para FormData
        });
    } else {
        
        return await apiRequest('/api/products/', {
            method: 'POST',
            body: JSON.stringify(productData)
        });
    }
};

/**
 * Atualiza um produto existente
 * @param {number} productId - ID do produto
 * @param {Object} updateData - Dados para atualização
 * @param {File} updateData.image - Nova imagem (opcional)
 * @returns {Promise<Object>} Resultado da atualização
 */
export const updateProduct = async (productId, updateData) => {
    
    // Sempre usa FormData para atualizações
    const formData = new FormData();
    
    // Adiciona campos de texto
    Object.keys(updateData).forEach(key => {
        if (key !== 'image' && updateData[key] !== undefined) {
            formData.append(key, updateData[key]);
        }
    });
    
    // Adiciona imagem se existir
    if (updateData.image) {
        formData.append('image', updateData.image);
    }
    
    
    return await apiRequest(`/api/products/${productId}`, {
        method: 'PUT',
        body: formData,
        headers: {} // Remove Content-Type para FormData
    });
};

/**
 * Inativa um produto (soft delete)
 * @param {number} productId - ID do produto
 * @returns {Promise<Object>} Resultado da inativação
 */
export const deleteProduct = async (productId) => {
    return await apiRequest(`/api/products/${productId}`, {
        method: 'DELETE'
    });
};

/**
 * Reativa um produto
 * @param {number} productId - ID do produto
 * @returns {Promise<Object>} Resultado da reativação
 */
export const reactivateProduct = async (productId) => {
    return await apiRequest(`/api/products/${productId}/reactivate`, {
        method: 'POST'
    });
};

/**
 * Obtém ingredientes de um produto
 * @param {number} productId - ID do produto
 * @returns {Promise<Object>} Lista de ingredientes com custo estimado
 */
export const getProductIngredients = async (productId) => {
    return await apiRequest(`/api/products/${productId}/ingredients`, {
        method: 'GET'
    });
};

/**
 * Adiciona um ingrediente a um produto
 * @param {number} productId - ID do produto
 * @param {number} ingredientId - ID do ingrediente
 * @param {number} quantity - Quantidade
 * @param {string} unit - Unidade (opcional)
 * @returns {Promise<Object>} Resultado da associação
 */
export const addIngredientToProduct = async (productId, ingredientId, quantity, unit = null) => {
    return await apiRequest(`/api/products/${productId}/ingredients`, {
        method: 'POST',
        body: JSON.stringify({
            ingredient_id: ingredientId,
            quantity: quantity,
            unit: unit
        })
    });
};

/**
 * Atualiza a quantidade/unidade de um ingrediente em um produto
 * @param {number} productId - ID do produto
 * @param {number} ingredientId - ID do ingrediente
 * @param {number} quantity - Nova quantidade
 * @param {string} unit - Nova unidade
 * @returns {Promise<Object>} Resultado da atualização
 */
export const updateProductIngredient = async (productId, ingredientId, quantity, unit) => {
    return await apiRequest(`/api/products/${productId}/ingredients/${ingredientId}`, {
        method: 'PUT',
        body: JSON.stringify({
            quantity: quantity,
            unit: unit
        })
    });
};

/**
 * Remove um ingrediente de um produto
 * @param {number} productId - ID do produto
 * @param {number} ingredientId - ID do ingrediente
 * @returns {Promise<Object>} Resultado da remoção
 */
export const removeIngredientFromProduct = async (productId, ingredientId) => {
    return await apiRequest(`/api/products/${productId}/ingredients/${ingredientId}`, {
        method: 'DELETE'
    });
};

/**
 * Busca produtos
 * @param {Object} options - Opções de busca
 * @param {string} options.name - Nome para busca
 * @param {number} options.category_id - ID da categoria
 * @param {number} options.page - Página
 * @param {number} options.page_size - Itens por página
 * @param {boolean} options.include_inactive - Incluir produtos inativos
 * @returns {Promise<Object>} Resultado da busca
 */
export const searchProducts = async (options = {}) => {
    const params = new URLSearchParams();
    
    if (options.name) params.append('name', options.name);
    if (options.category_id) params.append('category_id', options.category_id);
    if (options.page) params.append('page', options.page);
    if (options.page_size) params.append('page_size', options.page_size);
    if (options.include_inactive !== undefined) params.append('include_inactive', options.include_inactive);
    
    const queryString = params.toString();
    const url = `/api/products/search${queryString ? `?${queryString}` : ''}`;
    
    return await apiRequest(url, {
        method: 'GET'
    });
};

/**
 * Obtém URL da imagem de um produto
 * @param {number} productId - ID do produto
 * @returns {string} URL da imagem
 */
export const getProductImageUrl = (productId) => {
    return `/api/products/image/${productId}`;
};

/**
 * Obtém resumo do cardápio
 * @returns {Promise<Object>} Métricas do cardápio
 */
export const getMenuSummary = async () => {
    // Como não há endpoint específico, vamos calcular localmente
    const products = await getProducts({ page_size: 1000 });
    
    let totalItems = products.items.length;
    let totalPrice = 0;
    let totalCost = 0;
    let totalPrepTime = 0;
    let itemsWithPrice = 0;
    let itemsWithCost = 0;
    let itemsWithPrepTime = 0;
    
    products.items.forEach(product => {
        if (product.price && parseFloat(product.price) > 0) {
            totalPrice += parseFloat(product.price);
            itemsWithPrice++;
        }
        
        if (product.cost_price && parseFloat(product.cost_price) > 0) {
            totalCost += parseFloat(product.cost_price);
            itemsWithCost++;
        }
        
        if (product.preparation_time_minutes && product.preparation_time_minutes > 0) {
            totalPrepTime += product.preparation_time_minutes;
            itemsWithPrepTime++;
        }
    });
    
    const averagePrice = itemsWithPrice > 0 ? totalPrice / itemsWithPrice : 0;
    const averageMargin = itemsWithPrice > 0 && itemsWithCost > 0 ? 
        ((totalPrice - totalCost) / totalPrice) * 100 : 0;
    const averagePrepTime = itemsWithPrepTime > 0 ? totalPrepTime / itemsWithPrepTime : 0;
    
    const summary = {
        total_items: totalItems,
        average_price: Math.round(averagePrice * 100) / 100,
        average_margin: Math.round(averageMargin * 100) / 100,
        average_preparation_time: Math.round(averagePrepTime * 10) / 10
    };
    
    return summary;
};

/**
 * Atualiza a imagem de um produto
 * @param {number} productId - ID do produto
 * @param {File} imageFile - Arquivo de imagem (opcional)
 * @param {boolean} removeImage - Se deve remover a imagem atual (opcional)
 * @returns {Promise<Object>} Resposta da API
 */
export const updateProductImage = async (productId, imageFile = null, removeImage = false) => {
    try {
        // Se deve remover a imagem
        if (removeImage) {
            const formData = new FormData();
            formData.append('remove_image', 'true');
            
            return await apiRequest(`/api/products/${productId}/image`, {
                method: 'PUT',
                body: formData
            });
        }
        
        // Se deve substituir a imagem
        if (imageFile) {
            const formData = new FormData();
            formData.append('image', imageFile);
            
            return await apiRequest(`/api/products/${productId}/image`, {
                method: 'PUT',
                body: formData
            });
        }
        
        throw new Error('Deve fornecer um arquivo de imagem ou marcar removeImage=true');
        
    } catch (error) {
        console.error('Erro ao atualizar imagem do produto:', error);
        throw error;
    }
};

/**
 * Atualiza um produto com possibilidade de alterar imagem
 * @param {number} productId - ID do produto
 * @param {Object} productData - Dados do produto
 * @param {File} imageFile - Arquivo de imagem (opcional)
 * @param {boolean} removeImage - Se deve remover a imagem atual (opcional)
 * @returns {Promise<Object>} Resposta da API
 */
export const updateProductWithImage = async (productId, productData, imageFile = null, removeImage = false) => {
    try {
        const formData = new FormData();
        
        // Adiciona dados do produto
        Object.keys(productData).forEach(key => {
            if (productData[key] !== null && productData[key] !== undefined) {
                formData.append(key, productData[key]);
            }
        });
        
        // Adiciona imagem se fornecida
        if (imageFile) {
            formData.append('image', imageFile);
        }
        
        // Adiciona flag para remover imagem se necessário
        if (removeImage) {
            formData.append('remove_image', 'true');
        }
        
        return await apiRequest(`/api/products/${productId}`, {
            method: 'PUT',
            body: formData
        });
        
    } catch (error) {
        console.error('Erro ao atualizar produto com imagem:', error);
        throw error;
    }
};