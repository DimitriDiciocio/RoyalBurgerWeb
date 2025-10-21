import { apiRequest } from './api.js';

// Endpoints do CRUD de cliente
// Conforme o blueprint customer_bp em Flask
const CUSTOMER_BASE = '/api/customers';

export async function registerCustomer({ full_name, email, password, password_confirmation, date_of_birth, phone }) {
    return apiRequest(`${CUSTOMER_BASE}/`, {
        method: 'POST',
        body: { full_name, email, password, password_confirmation, date_of_birth, phone },
        skipAuth: true
    });
}

export async function getMyCustomer() {
    return apiRequest(`${CUSTOMER_BASE}/profile`, { method: 'GET' });
}

export async function updateMyCustomer(userId, payload) {
    return apiRequest(`${CUSTOMER_BASE}/${userId}`, { method: 'PUT', body: payload });
}

export async function deleteMyCustomer(userId) {
    return apiRequest(`${CUSTOMER_BASE}/${userId}`, { method: 'DELETE' });
}

export async function deleteAccountPermanent() {
    return apiRequest(`${CUSTOMER_BASE}/delete-account`, { method: 'DELETE' });
}

// Verifica a senha do cliente autenticado (etapa de confirmação)
export async function verifyMyPassword(password) {
    return apiRequest(`${CUSTOMER_BASE}/me/verify-password`, {
        method: 'POST',
        body: { password }
    });
}

// Endereços
export async function addAddress(userId, payload) {
    return apiRequest(`${CUSTOMER_BASE}/${userId}/addresses`, { method: 'POST', body: payload });
}

export async function listAddresses(userId) {
    return apiRequest(`${CUSTOMER_BASE}/${userId}/addresses`, { method: 'GET' });
}

export async function updateAddress(addressId, payload) {
    return apiRequest(`${CUSTOMER_BASE}/addresses/${addressId}`, { method: 'PUT', body: payload });
}

export async function deleteAddress(addressId) {
    return apiRequest(`${CUSTOMER_BASE}/addresses/${addressId}`, { method: 'DELETE' });
}

// ============================================================================
// GERENCIAMENTO DE USUÁRIOS (PAINEL ADMINISTRATIVO)
// ============================================================================

const USERS_BASE = '/api/users';

/**
 * Lista todos os usuários com paginação e filtros
 * @param {Object} options - Opções de paginação e filtros
 * @param {number} options.page - Página atual (padrão: 1)
 * @param {number} options.limit - Itens por página (padrão: 20)
 * @param {string} options.search - Termo de busca geral
 * @param {string} options.role - Filtro por cargo
 * @param {boolean} options.status - Filtro por status (ativo/inativo)
 * @param {string} options.sort_by - Campo para ordenação
 * @param {string} options.sort_order - Ordem (asc/desc)
 */
export async function getUsers(options = {}) {
    const params = new URLSearchParams();
    
    if (options.page) params.append('page', options.page);
    if (options.limit) params.append('limit', options.limit);
    if (options.search) params.append('search', options.search);
    if (options.role) params.append('role', options.role);
    if (options.status !== undefined) params.append('status', options.status);
    if (options.sort_by) params.append('sort_by', options.sort_by);
    if (options.sort_order) params.append('sort_order', options.sort_order);
    
    const queryString = params.toString();
    const url = queryString ? `${USERS_BASE}?${queryString}` : USERS_BASE;
    
    return apiRequest(url, { method: 'GET' });
}

/**
 * Cria um novo usuário
 * @param {Object} userData - Dados do usuário
 * @param {string} userData.full_name - Nome completo
 * @param {string} userData.email - Email
 * @param {string} userData.password - Senha
 * @param {string} userData.role - Cargo (admin, manager, attendant, delivery, customer)
 * @param {string} [userData.date_of_birth] - Data de nascimento (YYYY-MM-DD)
 * @param {string} [userData.phone] - Telefone
 * @param {string} [userData.cpf] - CPF
 */
export async function createUser(userData) {
    return apiRequest(USERS_BASE, {
        method: 'POST',
        body: userData
    });
}

/**
 * Obtém um usuário específico por ID
 * @param {number} userId - ID do usuário
 */
export async function getUserById(userId) {
    return apiRequest(`${USERS_BASE}/${userId}`, { method: 'GET' });
}

/**
 * Atualiza dados de um usuário
 * @param {number} userId - ID do usuário
 * @param {Object} updateData - Dados para atualização
 */
export async function updateUser(userId, updateData) {
    return apiRequest(`${USERS_BASE}/${userId}`, {
        method: 'PUT',
        body: updateData
    });
}

/**
 * Desativa um usuário (soft delete)
 * @param {number} userId - ID do usuário
 */
export async function deleteUser(userId) {
    return apiRequest(`${USERS_BASE}/${userId}`, { method: 'DELETE' });
}

/**
 * Ativa/desativa um usuário
 * @param {number} userId - ID do usuário
 * @param {boolean} isActive - Status ativo/inativo
 */
export async function updateUserStatus(userId, isActive) {
    return apiRequest(`${USERS_BASE}/${userId}/status`, {
        method: 'PATCH',
        body: { is_active: isActive }
    });
}

/**
 * Atualiza o cargo de um usuário
 * @param {number} userId - ID do usuário
 * @param {string} role - Novo cargo
 */
export async function updateUserRole(userId, role) {
    return apiRequest(`${USERS_BASE}/${userId}/role`, {
        method: 'PATCH',
        body: { role }
    });
}

/**
 * Obtém métricas gerais de usuários
 */
export async function getUsersMetrics() {
    return apiRequest(`${USERS_BASE}/metrics`, { method: 'GET' });
}

/**
 * Obtém métricas de um usuário específico
 * @param {number} userId - ID do usuário
 */
export async function getUserMetrics(userId) {
    return apiRequest(`${USERS_BASE}/${userId}/metrics`, { method: 'GET' });
}

/**
 * Obtém lista de cargos disponíveis
 */
export async function getAvailableRoles() {
    return apiRequest(`${USERS_BASE}/roles`, { method: 'GET' });
}

/**
 * Verifica se um email está disponível
 * @param {string} email - Email para verificar
 */
export async function checkEmailAvailability(email) {
    return apiRequest(`${USERS_BASE}/check-email?email=${encodeURIComponent(email)}`, { method: 'GET' });
}

/**
 * Cria um novo administrador
 * @param {Object} adminData - Dados do administrador
 */
export async function createAdmin(adminData) {
    return apiRequest(`${USERS_BASE}/admins`, {
        method: 'POST',
        body: adminData
    });
}

/**
 * Atualiza dados de um administrador
 * @param {number} userId - ID do administrador
 * @param {Object} updateData - Dados para atualização
 */
export async function updateAdmin(userId, updateData) {
    return apiRequest(`${USERS_BASE}/admins/${userId}`, {
        method: 'PUT',
        body: updateData
    });
}

// Verificação de Email
export async function requestEmailVerification(email) {
    return apiRequest('/api/users/request-email-verification', {
        method: 'POST',
        body: { email },
        skipAuth: true
    });
}

export async function verifyEmailCode(email, code) {
    return apiRequest('/api/users/verify-email', {
        method: 'POST',
        body: { email, code },
        skipAuth: true
    });
}

export async function resendVerificationCode(email) {
    return apiRequest('/api/users/resend-verification-code', {
        method: 'POST',
        body: { email },
        skipAuth: true
    });
}

// Recuperação de Senha
export async function requestPasswordReset(email) {
    return apiRequest('/api/users/request-password-reset', {
        method: 'POST',
        body: { email },
        skipAuth: true
    });
}

export async function verifyResetCode(email, reset_code) {
    return apiRequest('/api/users/verify-reset-code', {
        method: 'POST',
        body: { email, reset_code },
        skipAuth: true
    });
}

export async function resetPassword(email, reset_code, new_password) {
    return apiRequest('/api/users/reset-password', {
        method: 'POST',
        body: { email, reset_code, new_password },
        skipAuth: true
    });
}

// Alteração de senha por código (para login)
// Nota: Estes endpoints precisam ser implementados no backend
export async function requestPasswordChangeCode(email) {
    return apiRequest('/api/users/request-password-change-code', {
        method: 'POST',
        body: { email },
        skipAuth: true
    });
}

export async function verifyPasswordChangeCode(email, code) {
    return apiRequest('/api/users/verify-password-change-code', {
        method: 'POST',
        body: { email, code },
        skipAuth: true
    });
}

export async function changePasswordWithCode(email, code, new_password) {
    return apiRequest('/api/users/change-password-with-code', {
        method: 'POST',
        body: { email, code, new_password },
        skipAuth: true
    });
}

// Alteração de senha no perfil (requer autenticação)
export async function changePassword(current_password, new_password) {
    return apiRequest('/api/users/change-password', {
        method: 'PUT',
        body: { current_password, new_password }
    });
}


// Alteração de senha com revogação de todos os tokens
export async function changePasswordWithLogout(current_password, new_password) {
    return apiRequest('/api/users/change-password', {
        method: 'PUT',
        body: { current_password, new_password, revoke_all_tokens: true }
    });
}

// Alteração de email (requer verificação)
// export async function requestEmailChange(current_email, new_email) {
//     return apiRequest('/api/users/request-email-change', {
//         method: 'POST',
//         body: { current_email, new_email },
//         skipAuth: true // Não requer autenticação - é uma operação de verificação
//     });
// }

// export async function verifyEmailChange(new_email, code) {
//     return apiRequest('/api/users/verify-email-change', {
//         method: 'POST',
//         body: { new_email, code },
//         skipAuth: true
//     });