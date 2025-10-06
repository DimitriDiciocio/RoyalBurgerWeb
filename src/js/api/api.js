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

    try {
        const response = await fetch(url, {
            method,
            headers: baseHeaders,
            body: body ? JSON.stringify(body) : undefined,
            credentials: 'include',
            mode: 'cors' // Força modo CORS
        });

        let data;
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
            data = await response.json();
        } else {
            data = await response.text();
        }

        if (!response.ok) {
            
            // Tratamento específico para diferentes tipos de erro
            let errorMessage;
            
            if (response.status === 0 || response.status >= 500) {
                // Servidor não está respondendo ou erro interno
                errorMessage = 'Servidor temporariamente indisponível. Verifique sua conexão e tente novamente.';
            } else if (response.status === 404) {
                // Verificar se é erro de login (credenciais inválidas) ou endpoint não encontrado
                const isLoginEndpoint = path.includes('/login') || path.includes('/users/login');
                if (isLoginEndpoint && data?.error) {
                    // É um erro de login - usar a mensagem do backend
                    errorMessage = data.error;
                } else {
                    // Endpoint não encontrado
                    errorMessage = 'Serviço não encontrado. Verifique se o servidor está rodando.';
                }
            } else if (response.status === 401) {
                // Não autorizado - provavelmente token expirado ou credenciais inválidas
                errorMessage = data?.error || data?.message || 'Sessão expirada. Faça login novamente.';
                // Limpar token expirado automaticamente apenas se não for erro de login
                const isLoginEndpoint = path.includes('/login') || path.includes('/users/login');
                if (!isLoginEndpoint) {
                    clearStoredToken();
                    clearStoredUser();
                }
            } else if (response.status === 403) {
                // Proibido
                errorMessage = data?.error || data?.message || 'Acesso negado.';
            } else if (response.status === 308) {
                // Redirecionamento permanente - problema de CORS
                errorMessage = 'Erro de configuração do servidor. Verifique se o CORS está configurado corretamente.';
            } else {
                // Outros erros
                errorMessage = (data && (data.error || data.msg || data.message)) || `Erro ${response.status}`;
            }
            
            const error = new Error(errorMessage);
            error.status = response.status;
            error.payload = data;
            throw error;
        }

        return data;
    } catch (fetchError) {
        // Erro de rede ou conexão
        if (fetchError.name === 'TypeError' && fetchError.message.includes('fetch')) {
            // Verificar se é erro de CORS
            if (fetchError.message.includes('CORS') || fetchError.message.includes('blocked')) {
                const corsError = new Error('Erro de CORS: O servidor não permite requisições do frontend. Configure o CORS no backend Flask.');
                corsError.status = 0;
                corsError.isCorsError = true;
                throw corsError;
            }
            
            const connectionError = new Error('Não foi possível conectar ao servidor. Verifique se a API está rodando e sua conexão com a internet.');
            connectionError.status = 0;
            connectionError.isConnectionError = true;
            throw connectionError;
        }
        
        // Re-throw outros erros
        throw fetchError;
    }
}

export function logoutLocal() {
    clearStoredToken();
    clearStoredUser();
}
