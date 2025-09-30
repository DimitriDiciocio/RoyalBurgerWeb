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

export async function resetPassword(token, new_password) {
    return apiRequest('/api/users/reset-password', {
        method: 'POST',
        body: { token, new_password },
        skipAuth: true
    });
}