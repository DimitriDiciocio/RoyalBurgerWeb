/**
 * API de Endereços
 * Gerencia operações CRUD para endereços do usuário
 */

import { apiRequest, getStoredUser } from './api.js';

// Endpoints base para endereços
const ADDRESS_BASE = '/api/customers';

// Constantes para validação
const VALIDATION_LIMITS = {
    STREET_MAX_LENGTH: 200,
    NEIGHBORHOOD_MAX_LENGTH: 100,
    CITY_MAX_LENGTH: 100,
    NUMBER_MAX_LENGTH: 20,
    COMPLEMENT_MAX_LENGTH: 100,
    ZIP_CODE_LENGTH: 8
};

// UFs válidas do Brasil
const VALID_STATES = new Set([
    'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA',
    'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN',
    'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
]);

/**
 * Obtém o ID do usuário logado
 * @returns {number|null} ID do usuário ou null se não logado
 */
function getUserId() {
    const user = getStoredUser();
    return user?.id || null;
}

/**
 * Valida se um ID de endereço é válido
 * @param {any} addressId - ID a ser validado
 * @returns {boolean} True se válido
 */
function isValidAddressId(addressId) {
    if (addressId === null || addressId === undefined) return false;
    const numId = Number(addressId);
    return Number.isInteger(numId) && numId > 0;
}

/**
 * Valida formato de CEP brasileiro
 * @param {string} zipCode - CEP a ser validado
 * @returns {boolean} True se válido
 */
function isValidZipCode(zipCode) {
    if (!zipCode || typeof zipCode !== 'string') return false;
    const cleanZip = zipCode.replace(/\D/g, '');
    return cleanZip.length === VALIDATION_LIMITS.ZIP_CODE_LENGTH;
}

/**
 * Sanitiza texto para evitar XSS e limitar tamanho
 * @param {string} text - Texto a ser sanitizado
 * @param {number} maxLength - Tamanho máximo
 * @returns {string} Texto sanitizado
 */
function sanitizeText(text, maxLength = 255) {
    if (!text || typeof text !== 'string') return '';
    
    return text
        .trim()
        // Remove caracteres perigosos para XSS
        .replace(/[<>'"&]/g, '')
        // Remove caracteres de controle
        .replace(/[\x00-\x1F\x7F]/g, '')
        .substring(0, maxLength);
}

/**
 * Valida e sanitiza dados do endereço
 * @param {Object} addressData - Dados do endereço
 * @returns {Object} Dados sanitizados
 * @throws {Error} Se dados inválidos
 */
function validateAndSanitizeAddressData(addressData) {
    if (!addressData || typeof addressData !== 'object') {
        throw new Error('Dados do endereço inválidos');
    }

    // Campos obrigatórios
    const requiredFields = ['street', 'neighborhood', 'city', 'state', 'zip_code'];
    const missingFields = requiredFields.filter(field => {
        const value = addressData[field];
        return !value || (typeof value === 'string' && value.trim() === '');
    });
    
    if (missingFields.length > 0) {
        throw new Error(`Campos obrigatórios ausentes: ${missingFields.join(', ')}`);
    }

    // Sanitizar e validar cada campo
    const sanitized = {};
    
    // CEP: validar formato brasileiro
    const zipCode = String(addressData.zip_code).replace(/\D/g, '');
    if (!isValidZipCode(zipCode)) {
        throw new Error('CEP deve ter 8 dígitos');
    }
    sanitized.zip_code = zipCode;

    // Estado: validar UF brasileira
    const state = String(addressData.state).trim().toUpperCase();
    if (!VALID_STATES.has(state)) {
        throw new Error('Estado deve ser uma UF válida do Brasil');
    }
    sanitized.state = state;

    // Campos de texto: sanitizar e limitar tamanho
    sanitized.street = sanitizeText(addressData.street, VALIDATION_LIMITS.STREET_MAX_LENGTH);
    sanitized.neighborhood = sanitizeText(addressData.neighborhood, VALIDATION_LIMITS.NEIGHBORHOOD_MAX_LENGTH);
    sanitized.city = sanitizeText(addressData.city, VALIDATION_LIMITS.CITY_MAX_LENGTH);

    // Campos opcionais
    sanitized.number = addressData.number ? sanitizeText(addressData.number, VALIDATION_LIMITS.NUMBER_MAX_LENGTH) : null;
    sanitized.complement = addressData.complement ? sanitizeText(addressData.complement, VALIDATION_LIMITS.COMPLEMENT_MAX_LENGTH) : null;
    sanitized.is_default = Boolean(addressData.is_default);

    return sanitized;
}

/**
 * Busca endereço padrão do usuário
 * @returns {Promise<Object|null>} Endereço padrão ou null
 */
export async function getDefaultAddress() {
    try {
        const userId = getUserId();
        if (!userId) return null;

        const addresses = await apiRequest(`${ADDRESS_BASE}/${userId}/addresses`);
        
        // Buscar endereço padrão
        const defaultAddress = addresses.find(addr => addr.is_default);
        return defaultAddress || null;
    } catch (error) {
        // TODO: Implementar logging estruturado em produção
        console.error('Erro ao buscar endereço padrão:', error.message);
        return null;
    }
}

/**
 * Busca todos os endereços do usuário
 * @returns {Promise<Array>} Lista de endereços
 */
export async function getAddresses() {
    try {
        const userId = getUserId();
        if (!userId) return [];

        return await apiRequest(`${ADDRESS_BASE}/${userId}/addresses`);
    } catch (error) {
        // TODO: Implementar logging estruturado em produção
        console.error('Erro ao buscar endereços:', error.message);
        return [];
    }
}

/**
 * Cria novo endereço
 * @param {Object} addressData - Dados do endereço
 * @returns {Promise<Object>} Endereço criado
 */
export async function createAddress(addressData) {
    const userId = getUserId();
    if (!userId) throw new Error('Usuário não autenticado');

    // Validar e sanitizar dados de entrada
    const validatedData = validateAndSanitizeAddressData(addressData);
    
    return await apiRequest(`${ADDRESS_BASE}/${userId}/addresses`, {
        method: 'POST',
        body: validatedData
    });
}

/**
 * Atualiza endereço existente
 * @param {number} addressId - ID do endereço
 * @param {Object} addressData - Dados do endereço
 * @returns {Promise<Object>} Endereço atualizado
 */
export async function updateAddress(addressId, addressData) {
    const userId = getUserId();
    if (!userId) throw new Error('Usuário não autenticado');

    // Validar ID do endereço
    if (!isValidAddressId(addressId)) {
        throw new Error('ID do endereço inválido');
    }

    // Validar e sanitizar dados de entrada
    const validatedData = validateAndSanitizeAddressData(addressData);
    
    return await apiRequest(`${ADDRESS_BASE}/${userId}/addresses/${addressId}`, {
        method: 'PUT',
        body: validatedData
    });
}

/**
 * Exclui endereço
 * @param {number} addressId - ID do endereço
 * @returns {Promise<Object>} Resultado da exclusão
 */
export async function deleteAddress(addressId) {
    const userId = getUserId();
    if (!userId) throw new Error('Usuário não autenticado');

    // Validar ID do endereço
    if (!isValidAddressId(addressId)) {
        throw new Error('ID do endereço inválido');
    }

    return await apiRequest(`${ADDRESS_BASE}/${userId}/addresses/${addressId}`, {
        method: 'DELETE'
    });
}

/**
 * Define endereço como padrão
 * @param {number} addressId - ID do endereço
 * @returns {Promise<Object>} Resultado da operação
 */
export async function setDefaultAddress(addressId) {
    const userId = getUserId();
    if (!userId) throw new Error('Usuário não autenticado');

    // Validar ID do endereço
    if (!isValidAddressId(addressId)) {
        throw new Error('ID do endereço inválido');
    }

    return await apiRequest(`${ADDRESS_BASE}/${userId}/addresses/${addressId}/set-default`, {
        method: 'PUT'
    });
}
