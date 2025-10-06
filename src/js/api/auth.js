import { apiRequest, setStoredToken, setStoredUser, logoutLocal } from './api.js';

// Endpoints de autenticação
// Ajuste os caminhos conforme seu backend Flask
const AUTH_ROUTES = {
    login: '/api/users/login',
    logout: '/api/users/logout',
    me: '/api/users/profile'
};

export async function loginWithEmailAndPassword({ email, password }) {
    const data = await apiRequest(AUTH_ROUTES.login, {
        method: 'POST',
        body: { email, password },
        skipAuth: true
    });

    // Convencionalmente, espera { access_token, user }
    if (data && (data.access_token || data.token)) {
        const token = data.access_token || data.token;
        setStoredToken(token);
    }
    if (data && data.user) {
        setStoredUser(data.user);
    } else {
        // Backend atual retorna apenas access_token; buscar perfil do usuário
        try {
            const me = await fetchMe();
            if (me) setStoredUser(me);
        } catch (_e) { }
    }
    return data;
}

export async function fetchMe() {
    return apiRequest(AUTH_ROUTES.me, { method: 'GET' });
}

export async function logout() {
    try {
        await apiRequest(AUTH_ROUTES.logout, { method: 'POST' });
    } catch (_e) {
        // Se a API não tiver logout de servidor, ainda removemos localmente
    }
    logoutLocal();
}

// Funções para 2FA (Two-Factor Authentication)
export async function verify2FACode(userId, code) {
    const data = await apiRequest('/api/users/verify-2fa', {
        method: 'POST',
        body: { user_id: userId, code },
        skipAuth: true
    });

    // Se a verificação foi bem-sucedida, armazenar token e dados do usuário
    if (data && (data.access_token || data.token)) {
        const token = data.access_token || data.token;
        setStoredToken(token);
    }
    if (data && data.user) {
        setStoredUser(data.user);
    }
    
    return data;
}

export async function toggle2FA(enable) {
    return apiRequest('/api/users/toggle-2fa', {
        method: 'POST',
        body: { enable }
    });
}

export async function confirm2FAEnable(code) {
    return apiRequest('/api/users/enable-2fa-confirm', {
        method: 'POST',
        body: { code }
    });
}

export async function get2FAStatus() {
    return apiRequest('/api/users/2fa-status', { method: 'GET' });
}