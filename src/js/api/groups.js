/**
 * API de Grupos de Insumos Extras
 * Gerencia operações CRUD para grupos de adicionais
 */

import { apiRequest } from './api.js';

/**
 * Lista todos os grupos
 * @param {Object} options - Opções de filtro
 * @param {boolean} options.active_only - Se true, retorna apenas grupos ativos
 * @returns {Promise<Array>} Lista de grupos
 */
export const getGroups = async (options = {}) => {
    const params = new URLSearchParams();
    
    if (options.active_only !== undefined) {
        params.append('active_only', options.active_only);
    }
    
    const queryString = params.toString();
    const url = `/api/groups/${queryString ? `?${queryString}` : ''}`;
    
    return await apiRequest(url, {
        method: 'GET'
    });
};

/**
 * Busca um grupo por ID (inclui ingredientes vinculados)
 * @param {number} groupId - ID do grupo
 * @returns {Promise<Object>} Dados do grupo com ingredientes
 */
export const getGroupById = async (groupId) => {
    return await apiRequest(`/api/groups/${groupId}`, {
        method: 'GET'
    });
};

/**
 * Cria um novo grupo
 * @param {Object} groupData - Dados do grupo
 * @param {string} groupData.name - Nome do grupo
 * @param {boolean} groupData.is_active - Status ativo/inativo (opcional, padrão: true)
 * @returns {Promise<Object>} Grupo criado
 */
export const createGroup = async (groupData) => {
    // Validação básica
    if (!groupData || typeof groupData !== 'object') {
        throw new Error('Dados do grupo são obrigatórios');
    }
    
    if (!groupData.name || typeof groupData.name !== 'string' || groupData.name.trim().length === 0) {
        throw new Error('Nome do grupo é obrigatório');
    }
    
    // Sanitizar dados
    const sanitizedData = {
        name: groupData.name.trim(),
        is_active: groupData.is_active !== undefined ? groupData.is_active : true
    };
    
    return await apiRequest('/api/groups/', {
        method: 'POST',
        body: JSON.stringify(sanitizedData)
    });
};

/**
 * Atualiza um grupo existente
 * @param {number} groupId - ID do grupo
 * @param {Object} updateData - Dados para atualização
 * @param {string} [updateData.name] - Nome do grupo
 * @param {boolean} [updateData.is_active] - Status ativo/inativo
 * @returns {Promise<Object>} Resultado da atualização
 */
export const updateGroup = async (groupId, updateData) => {
    if (!updateData || typeof updateData !== 'object') {
        throw new Error('Dados para atualização são obrigatórios');
    }
    
    // Sanitizar dados
    const sanitizedData = {};
    if (updateData.name !== undefined) {
        sanitizedData.name = updateData.name.trim();
    }
    if (updateData.is_active !== undefined) {
        sanitizedData.is_active = updateData.is_active;
    }
    
    if (Object.keys(sanitizedData).length === 0) {
        throw new Error('Nenhum campo válido para atualização');
    }
    
    return await apiRequest(`/api/groups/${groupId}`, {
        method: 'PUT',
        body: JSON.stringify(sanitizedData)
    });
};

/**
 * Exclui um grupo
 * @param {number} groupId - ID do grupo
 * @returns {Promise<Object>} Resultado da exclusão
 */
export const deleteGroup = async (groupId) => {
    return await apiRequest(`/api/groups/${groupId}`, {
        method: 'DELETE'
    });
};

/**
 * Adiciona um ingrediente ao grupo
 * @param {number} groupId - ID do grupo
 * @param {number} ingredientId - ID do ingrediente
 * @returns {Promise<Object>} Resultado da operação
 */
export const addIngredientToGroup = async (groupId, ingredientId) => {
    if (!ingredientId || isNaN(ingredientId)) {
        throw new Error('ID do ingrediente é obrigatório');
    }
    
    return await apiRequest(`/api/groups/${groupId}/ingredients`, {
        method: 'POST',
        body: JSON.stringify({ ingredient_id: parseInt(ingredientId) })
    });
};

/**
 * Remove um ingrediente do grupo
 * @param {number} groupId - ID do grupo
 * @param {number} ingredientId - ID do ingrediente
 * @returns {Promise<Object>} Resultado da operação
 */
export const removeIngredientFromGroup = async (groupId, ingredientId) => {
    return await apiRequest(`/api/groups/${groupId}/ingredients/${ingredientId}`, {
        method: 'DELETE'
    });
};

/**
 * Adiciona múltiplos ingredientes ao grupo
 * @param {number} groupId - ID do grupo
 * @param {Array<number>} ingredientIds - Array de IDs de ingredientes
 * @returns {Promise<Array>} Array de resultados
 */
export const addMultipleIngredientsToGroup = async (groupId, ingredientIds) => {
    const promises = ingredientIds.map(ingredientId => 
        addIngredientToGroup(groupId, ingredientId)
    );
    
    return await Promise.allSettled(promises);
};

/**
 * Verifica se um nome de grupo já existe
 * @param {string} name - Nome do grupo a verificar
 * @param {number} [excludeId] - ID do grupo a excluir da verificação (para edição)
 * @returns {Promise<boolean>} true se já existe, false caso contrário
 */
export const checkGroupNameExists = async (name, excludeId = null) => {
    try {
        const groups = await getGroups({ active_only: false });
        const normalizedName = name.trim().toLowerCase();
        
        return groups.some(group => {
            const isNameMatch = group.name.toLowerCase() === normalizedName;
            const isDifferentId = excludeId ? group.id !== excludeId : true;
            return isNameMatch && isDifferentId;
        });
    } catch (error) {
        console.error('Erro ao verificar nome do grupo:', error);
        return false;
    }
};

