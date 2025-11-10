import { apiRequest } from './api.js';

// Endpoints do CRUD de categorias
// Conforme o blueprint category_bp em Flask
const CATEGORY_BASE = '/api/categories/';

/**
 * Lista todas as categorias com paginação e filtros
 * @param {Object} options - Opções de paginação e filtros
 * @param {string} options.name - Filtro por nome (busca parcial)
 * @param {number} options.page - Página atual (padrão: 1)
 * @param {number} options.page_size - Itens por página (padrão: 10)
 */
export async function getCategories(options = {}) {
    const params = new URLSearchParams();
    
    if (options.name) params.append('name', options.name);
    if (options.page) params.append('page', options.page);
    if (options.page_size) params.append('page_size', options.page_size);
    
    const queryString = params.toString();
    // Remove a barra final quando há query string para evitar /api/categories/?param=value
    const baseUrl = queryString ? CATEGORY_BASE.slice(0, -1) : CATEGORY_BASE;
    const url = queryString ? `${baseUrl}?${queryString}` : baseUrl;
    
    const response = await apiRequest(url, { method: 'GET' });
    return response;
}

/**
 * Cria uma nova categoria
 * @param {Object} categoryData - Dados da categoria
 * @param {string} categoryData.name - Nome da categoria
 */
export async function createCategory(categoryData) {
    return apiRequest(CATEGORY_BASE, {
        method: 'POST',
        body: categoryData
    });
}

/**
 * Obtém uma categoria específica por ID
 * @param {number} categoryId - ID da categoria
 */
export async function getCategoryById(categoryId) {
    return apiRequest(`${CATEGORY_BASE}${categoryId}`, { method: 'GET' });
}

/**
 * Atualiza dados de uma categoria
 * @param {number} categoryId - ID da categoria
 * @param {Object} updateData - Dados para atualização
 * @param {string} updateData.name - Novo nome da categoria
 */
export async function updateCategory(categoryId, updateData) {
    return apiRequest(`${CATEGORY_BASE}${categoryId}`, {
        method: 'PUT',
        body: updateData
    });
}

/**
 * Exclui uma categoria
 * @param {number} categoryId - ID da categoria
 */
export async function deleteCategory(categoryId) {
    return apiRequest(`${CATEGORY_BASE}${categoryId}`, { method: 'DELETE' });
}

/**
 * Reordena categorias
 * @param {Array} categories - Lista de categorias com nova ordem
 * @param {number} categories[].id - ID da categoria
 * @param {number} categories[].display_order - Nova ordem de exibição
 */
export async function reorderCategories(categories) {
    return apiRequest(`${CATEGORY_BASE}reorder`, {
        method: 'POST',
        body: { categories }
    });
}
