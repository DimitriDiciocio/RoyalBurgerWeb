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
 * @param {boolean} options.filter_unavailable - Filtrar produtos indisponíveis (padrão: false para admin, true para frontend)
 * @returns {Promise<Object>} Lista de produtos com paginação
 */
export const getProducts = async (options = {}) => {
    const params = new URLSearchParams();
    
    if (options.name) params.append('name', options.name);
    if (options.category_id) params.append('category_id', options.category_id);
    if (options.page) params.append('page', options.page);
    if (options.page_size) params.append('page_size', options.page_size);
    if (options.include_inactive !== undefined) params.append('include_inactive', options.include_inactive);
    // NOVO: Adiciona parâmetro filter_unavailable para filtrar produtos sem estoque
    if (options.filter_unavailable !== undefined) {
        params.append('filter_unavailable', options.filter_unavailable.toString());
    }
    
    const queryString = params.toString();
    const url = `/api/products${queryString ? `?${queryString}` : ''}`;
    
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
 * @param {number} quantity - Quantidade do produto (opcional, padrão: 1) - usado para calcular max_quantity dos extras
 * @returns {Promise<Object>} Dados do produto
 */
export const getProductById = async (productId, quantity = 1) => {
    const params = new URLSearchParams();
    if (quantity && quantity > 0) {
        params.append('quantity', quantity);
    }
    const queryString = params.toString();
    const url = `/api/products/${productId}${queryString ? `?${queryString}` : ''}`;
    return await apiRequest(url, {
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
        
        // Adiciona ingredientes se fornecidos (como JSON string)
        if (productData.ingredients && Array.isArray(productData.ingredients)) {
            formData.append('ingredients', JSON.stringify(productData.ingredients));
        }
        
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
        if (key !== 'image' && updateData[key] !== undefined && updateData[key] !== null) {
            // Para arrays/objects, converte para JSON string
            if (typeof updateData[key] === 'object' && !Array.isArray(updateData[key])) {
                formData.append(key, JSON.stringify(updateData[key]));
            } else if (Array.isArray(updateData[key])) {
                formData.append(key, JSON.stringify(updateData[key]));
            } else {
                formData.append(key, updateData[key]);
            }
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
 * @param {number} portions - Número de porções
 * @returns {Promise<Object>} Resultado da associação
 */
export const addIngredientToProduct = async (productId, ingredientId, portions) => {
    // Validação robusta dos parâmetros
    if (!productId || isNaN(productId) || productId <= 0) {
        throw new Error('ID do produto é obrigatório e deve ser um número positivo');
    }
    
    if (!ingredientId || isNaN(ingredientId) || ingredientId <= 0) {
        throw new Error('ID do ingrediente é obrigatório e deve ser um número positivo');
    }
    
    if (!portions || isNaN(portions) || portions <= 0) {
        throw new Error('Número de porções é obrigatório e deve ser um número positivo');
    }
    
    return await apiRequest(`/api/products/${productId}/ingredients`, {
        method: 'POST',
        body: JSON.stringify({
            ingredient_id: ingredientId,
            portions: portions
        })
    });
};

/**
 * Atualiza o número de porções de um ingrediente em um produto
 * @param {number} productId - ID do produto
 * @param {number} ingredientId - ID do ingrediente
 * @param {number} portions - Novo número de porções
 * @returns {Promise<Object>} Resultado da atualização
 */
export const updateProductIngredient = async (productId, ingredientId, portions) => {
    return await apiRequest(`/api/products/${productId}/ingredients/${ingredientId}`, {
        method: 'PUT',
        body: JSON.stringify({
            portions: portions
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
                // Para arrays/objects, converte para JSON string
                if (typeof productData[key] === 'object' && !Array.isArray(productData[key])) {
                    formData.append(key, JSON.stringify(productData[key]));
                } else if (Array.isArray(productData[key])) {
                    formData.append(key, JSON.stringify(productData[key]));
                } else {
                    formData.append(key, productData[key]);
                }
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

/**
 * Verifica se um produto pode ser excluído permanentemente
 * @param {number} productId - ID do produto
 * @returns {Promise<Object>} Resultado da verificação
 */
export const canDeleteProduct = async (productId) => {
    // Validação do parâmetro de entrada
    if (!productId || isNaN(productId) || productId <= 0) {
        throw new Error('ID do produto é obrigatório e deve ser um número positivo');
    }
    
    return await apiRequest(`/api/products/${productId}/can-delete`, {
        method: 'GET'
    });
};

/**
 * Exclui um produto permanentemente
 * @param {number} productId - ID do produto
 * @returns {Promise<Object>} Resultado da exclusão
 */
export const permanentDeleteProduct = async (productId) => {
    return await apiRequest(`/api/products/${productId}/permanent-delete`, {
        method: 'DELETE'
    });
};

/**
 * Simula capacidade máxima de um produto com extras e modificações da receita base
 * @param {number} productId - ID do produto
 * @param {Array} extras - Lista de extras [{ingredient_id: number, quantity: number}]
 * @param {number} quantity - Quantidade desejada (opcional, padrão: 1)
 * @param {Array} baseModifications - Modificações da receita base [{ingredient_id: number, delta: number}]
 *                                   delta positivo = adiciona à receita base
 *                                   delta negativo = remove da receita base
 * @returns {Promise<Object>} Dados de capacidade
 * 
 * Resposta esperada:
 * {
 *   "product_id": number,
 *   "max_quantity": number,
 *   "capacity": number,
 *   "availability_status": "available" | "limited" | "unavailable" | "low_stock",
 *   "is_available": boolean,
 *   "limiting_ingredient": {
 *     "name": string,
 *     "available": number,
 *     "unit": string,
 *     "message": string
 *   } | null,
 *   "message": string
 * }
 */
export const simulateProductCapacity = async (productId, extras = [], quantity = 1, baseModifications = []) => {
    try {
        // ALTERAÇÃO: Validação de parâmetros mais robusta
        if (!productId || isNaN(productId) || productId <= 0) {
            throw new Error('ID do produto é obrigatório e deve ser um número positivo');
        }
        // ALTERAÇÃO: Limite máximo para evitar valores absurdos
        if (productId > 2147483647) {
            throw new Error('ID do produto excede o limite máximo permitido');
        }
        
        // ALTERAÇÃO: Validação de quantity
        if (quantity !== undefined && quantity !== null) {
            const qtyNum = parseInt(quantity, 10);
            if (isNaN(qtyNum) || qtyNum <= 0) {
                throw new Error('quantity deve ser um número positivo');
            }
            // ALTERAÇÃO: Limite máximo para evitar valores absurdos
            if (qtyNum > 999) {
                throw new Error('quantity excede o limite máximo permitido (999)');
            }
            quantity = qtyNum;
        } else {
            quantity = 1; // Padrão
        }
        
        if (!Array.isArray(extras)) {
            throw new Error('extras deve ser uma lista');
        }
        
        // Validação de extras
        const validatedExtras = extras.map(extra => {
            if (!extra || typeof extra !== 'object') {
                throw new Error('Cada extra deve ser um objeto');
            }
            
            const ingId = parseInt(extra.ingredient_id, 10);
            const qty = parseInt(extra.quantity, 10) || 1;
            
            if (!ingId || isNaN(ingId) || ingId <= 0) {
                throw new Error('ingredient_id é obrigatório e deve ser um número positivo');
            }
            // ALTERAÇÃO: Limite máximo para evitar valores absurdos
            if (ingId > 2147483647) {
                throw new Error('ingredient_id excede o limite máximo permitido');
            }
            
            if (isNaN(qty) || qty <= 0) {
                throw new Error('quantity deve ser um número positivo');
            }
            // ALTERAÇÃO: Limite máximo para evitar valores absurdos
            if (qty > 999) {
                throw new Error('quantity do extra excede o limite máximo permitido (999)');
            }
            
            return {
                ingredient_id: ingId,
                quantity: qty
            };
        });
        
        // Validação de base_modifications (opcional)
        let validatedBaseModifications = [];
        if (baseModifications && Array.isArray(baseModifications) && baseModifications.length > 0) {
            validatedBaseModifications = baseModifications.map(bm => {
                if (!bm || typeof bm !== 'object') {
                    throw new Error('Cada base_modification deve ser um objeto');
                }
                
                const ingId = parseInt(bm.ingredient_id, 10);
                const delta = parseInt(bm.delta, 10);
                
                if (!ingId || isNaN(ingId) || ingId <= 0) {
                    throw new Error('ingredient_id é obrigatório e deve ser um número positivo');
                }
                // ALTERAÇÃO: Limite máximo para evitar valores absurdos
                if (ingId > 2147483647) {
                    throw new Error('ingredient_id excede o limite máximo permitido');
                }
                
                if (isNaN(delta) || delta === 0) {
                    throw new Error('delta deve ser um número diferente de zero');
                }
                // ALTERAÇÃO: Limite máximo para evitar valores absurdos (positivo ou negativo)
                if (Math.abs(delta) > 999) {
                    throw new Error('delta excede o limite máximo permitido (999)');
                }
                
                return {
                    ingredient_id: ingId,
                    delta: delta
                };
            });
        }
        
        const requestBody = {
            product_id: productId,
            extras: validatedExtras,
            quantity: quantity
        };
        
        // Adiciona base_modifications apenas se houver
        if (validatedBaseModifications.length > 0) {
            requestBody.base_modifications = validatedBaseModifications;
        }
        
        const response = await apiRequest('/api/products/simular_capacidade', {
            method: 'POST',
            body: JSON.stringify(requestBody)
        });
        
        return response;
    } catch (error) {
        console.error('Erro ao simular capacidade:', error);
        throw error;
    }
};

/**
 * Obtém capacidade de um produto
 * @param {number} productId - ID do produto
 * @param {Array} extras - Lista de extras (opcional) [{ingredient_id: number, quantity: number}]
 * @returns {Promise<Object>} Dados de capacidade
 * 
 * Resposta esperada:
 * {
 *   "capacity": number,
 *   "limiting_ingredient": object | null,
 *   "ingredients": array,
 *   "is_available": boolean,
 *   "message": string
 * }
 */
export const getProductCapacity = async (productId, extras = []) => {
    try {
        // Validação de parâmetros
        if (!productId || isNaN(productId) || productId <= 0) {
            throw new Error('ID do produto é obrigatório e deve ser um número positivo');
        }
        
        const params = new URLSearchParams();
        
        // Se houver extras, adiciona como parâmetro JSON
        if (extras && Array.isArray(extras) && extras.length > 0) {
            // Validação de extras
            const validatedExtras = extras.map(extra => {
                if (!extra || typeof extra !== 'object') {
                    throw new Error('Cada extra deve ser um objeto');
                }
                
                const ingId = parseInt(extra.ingredient_id, 10);
                const qty = parseInt(extra.quantity, 10) || 1;
                
                if (!ingId || isNaN(ingId) || ingId <= 0) {
                    throw new Error('ingredient_id é obrigatório e deve ser um número positivo');
                }
                
                if (isNaN(qty) || qty <= 0) {
                    throw new Error('quantity deve ser um número positivo');
                }
                
                return {
                    ingredient_id: ingId,
                    quantity: qty
                };
            });
            
            params.append('extras', JSON.stringify(validatedExtras));
        }
        
        const queryString = params.toString();
        const url = `/api/products/${productId}/capacity${queryString ? `?${queryString}` : ''}`;
        
        return await apiRequest(url, {
            method: 'GET'
        });
    } catch (error) {
        console.error('Erro ao obter capacidade:', error);
        throw error;
    }
};