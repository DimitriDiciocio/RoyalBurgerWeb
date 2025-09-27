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