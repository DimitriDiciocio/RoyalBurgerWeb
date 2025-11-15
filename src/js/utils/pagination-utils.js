/**
 * Utilitários para normalização e tratamento de paginação
 * ALTERAÇÃO: Criado para garantir compatibilidade com diferentes formatos de resposta da API
 */

/**
 * Normaliza o formato de paginação de diferentes APIs
 * Suporta múltiplos formatos de resposta:
 * - { items: [...], pagination: { total_pages, total, page, ... } }
 * - { users: [...], pagination: { total_pages, total, page, ... } }
 * - { data: { items: [...], pagination: {...} } }
 * - Array direto (formato legado)
 * 
 * @param {Object|Array} response - Resposta da API
 * @param {string} itemsKey - Chave esperada para os itens (padrão: 'items')
 * @returns {Object} Objeto normalizado com { items, pagination }
 */
export function normalizePaginationResponse(response, itemsKey = 'items') {
  if (!response) {
    return {
      items: [],
      pagination: {
        total_pages: 1,
        total: 0,
        page: 1,
        page_size: 20,
        has_next: false,
        has_prev: false
      }
    };
  }

  // Caso 1: Formato com data wrapper { success: true, data: { items: [...], pagination: {...} } }
  if (response.success && response.data) {
    return normalizePaginationResponse(response.data, itemsKey);
  }

  // Caso 2: Formato direto com paginação { items: [...], pagination: {...} }
  if (response.items && Array.isArray(response.items)) {
    return {
      items: response.items,
      pagination: normalizePaginationObject(response.pagination, response.items.length)
    };
  }

  // Caso 3: Formato com 'users' ao invés de 'items' { users: [...], pagination: {...} }
  if (response.users && Array.isArray(response.users)) {
    return {
      items: response.users,
      pagination: normalizePaginationObject(response.pagination, response.users.length)
    };
  }

  // Caso 4: Array direto (formato legado sem paginação)
  if (Array.isArray(response)) {
    return {
      items: response,
      pagination: {
        total_pages: 1,
        total: response.length,
        page: 1,
        page_size: response.length,
        has_next: false,
        has_prev: false
      }
    };
  }

  // Caso 5: Objeto com chave customizada
  if (response[itemsKey] && Array.isArray(response[itemsKey])) {
    return {
      items: response[itemsKey],
      pagination: normalizePaginationObject(response.pagination, response[itemsKey].length)
    };
  }

  // Caso padrão: resposta inesperada
  // ALTERAÇÃO: Log condicional apenas em modo debug
  if (typeof window !== 'undefined' && window.DEBUG_MODE) {
    console.warn('[pagination-utils] Formato de resposta inesperado:', response);
  }
  return {
    items: [],
    pagination: {
      total_pages: 1,
      total: 0,
      page: 1,
      page_size: 20,
      has_next: false,
      has_prev: false
    }
  };
}

/**
 * Normaliza objeto de paginação para formato padrão
 * @param {Object} pagination - Objeto de paginação da API (pode estar em diferentes formatos)
 * @param {number} itemsCount - Número de itens retornados (usado como fallback)
 * @returns {Object} Objeto de paginação normalizado
 */
export function normalizePaginationObject(pagination, itemsCount = 0) {
  if (!pagination) {
    // Se não houver paginação, assumir que todos os itens foram retornados
    return {
      total_pages: itemsCount > 0 ? 1 : 0,
      total: itemsCount,
      page: 1,
      page_size: itemsCount || 20,
      has_next: false,
      has_prev: false
    };
  }

  // Normalizar diferentes nomes de propriedades
  return {
    total_pages: pagination.total_pages || pagination.pages || pagination.totalPages || 1,
    total: pagination.total || pagination.count || pagination.totalItems || itemsCount,
    page: pagination.page || pagination.current_page || pagination.currentPage || 1,
    page_size: pagination.page_size || pagination.per_page || pagination.pageSize || pagination.limit || 20,
    has_next: pagination.has_next !== undefined ? pagination.has_next : (pagination.next !== null && pagination.next !== undefined),
    has_prev: pagination.has_prev !== undefined ? pagination.has_prev : (pagination.prev !== null && pagination.prev !== undefined)
  };
}

/**
 * Extrai itens de uma resposta normalizada
 * @param {Object} normalizedResponse - Resposta normalizada por normalizePaginationResponse
 * @returns {Array} Array de itens
 */
export function getItemsFromResponse(normalizedResponse) {
  return normalizedResponse.items || [];
}

/**
 * Extrai informações de paginação de uma resposta normalizada
 * @param {Object} normalizedResponse - Resposta normalizada por normalizePaginationResponse
 * @returns {Object} Objeto de paginação normalizado
 */
export function getPaginationFromResponse(normalizedResponse) {
  return normalizedResponse.pagination || normalizePaginationObject(null, 0);
}

/**
 * Valida se uma resposta tem estrutura de paginação válida
 * @param {Object} response - Resposta da API
 * @returns {boolean} true se a resposta parece ter paginação
 */
export function hasPaginationStructure(response) {
  if (!response || typeof response !== 'object') return false;
  
  return !!(
    (response.pagination && typeof response.pagination === 'object') ||
    (response.items && Array.isArray(response.items)) ||
    (response.users && Array.isArray(response.users)) ||
    (response.data && response.data.pagination)
  );
}
