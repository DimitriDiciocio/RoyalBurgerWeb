// Utilitários de requisição para a API
// Centraliza base URL, headers, token e tratamento de erros

const STORAGE_KEYS = {
    token: 'rb.token',
    user: 'rb.user'
};

// Ajuste se necessário. Mantém flexível para backends montados em outras portas.
export const API_BASE_URL = (() => {
    try {
        // 1) Permite override via window.API_BASE_URL ou meta tag <meta name="api-base-url" content="...">
        if (typeof window !== 'undefined') {
            if (window.API_BASE_URL && typeof window.API_BASE_URL === 'string') {
                return window.API_BASE_URL;
            }
            const meta = document.querySelector('meta[name="api-base-url"]');
            if (meta && meta.content) return meta.content;

            // 2) Se estiver rodando o Live Server (porta 5500), aponta para Flask (5000)
            const { origin } = window.location;
            if (/:(5500)(\/|$)/.test(origin)) {
                return origin.replace(':5500', ':5000');
            }

            // 3) Caso contrário, usa a própria origem
            return origin || 'http://127.0.0.1:5000';
        }
    } catch (_e) { }
    // Fallback
    return 'http://127.0.0.1:5000';
})();

export function getStoredToken() {
    return localStorage.getItem(STORAGE_KEYS.token) || '';
}

export function setStoredToken(token) {
    if (token) {
        localStorage.setItem(STORAGE_KEYS.token, token);
    }
}

export function clearStoredToken() {
    localStorage.removeItem(STORAGE_KEYS.token);
}

export function getStoredUser() {
    const raw = localStorage.getItem(STORAGE_KEYS.user);
    if (!raw) return null;
    try {
        return JSON.parse(raw);
    } catch (_e) {
        return null;
    }
}

export function setStoredUser(user) {
    if (user) {
        localStorage.setItem(STORAGE_KEYS.user, JSON.stringify(user));
    }
}

export function clearStoredUser() {
    localStorage.removeItem(STORAGE_KEYS.user);
}

export async function apiRequest(path, { method = 'GET', body, headers = {}, skipAuth = false } = {}) {
    const url = path.startsWith('http') ? path : `${API_BASE_URL}${path}`;

    const baseHeaders = {
        'Content-Type': 'application/json',
        ...headers
    };

    if (!skipAuth) {
        const token = getStoredToken();
        if (token) baseHeaders['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(url, {
        method,
        headers: baseHeaders,
        body: body ? JSON.stringify(body) : undefined,
        credentials: 'include'
    });

    let data;
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
        data = await response.json();
    } else {
        data = await response.text();
    }

    if (!response.ok) {
        const errorMessage = (data && (data.error || data.msg || data.message)) || `Erro ${response.status}`;
        const error = new Error(errorMessage);
        error.status = response.status;
        error.payload = data;
        throw error;
    }

    return data;
}

export function logoutLocal() {
    clearStoredToken();
    clearStoredUser();
}

