// Utilitários de requisição para a API
// Centraliza base URL, headers, token e tratamento de erros
import { robustFetch, classifyNetworkError } from "../utils/network-error-handler.js";

const STORAGE_KEYS = {
  token: "rb.token",
  user: "rb.user",
};

// Ajuste se necessário. Mantém flexível para backends montados em outras portas.
export const API_BASE_URL = (() => {
  return "http://127.0.0.1:5000";
})();

export function getStoredToken() {
  return localStorage.getItem(STORAGE_KEYS.token) || "";
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

export async function apiRequest(
  path,
  {
    method = "GET",
    body,
    headers = {},
    skipAuth = false,
    timeout = 30000, // 30 segundos padrão
    maxRetries = 3, // 3 tentativas padrão
    skipRetry = false, // Para desabilitar retry em casos específicos (ex: login)
  } = {}
) {
  const url = path.startsWith("http") ? path : `${API_BASE_URL}${path}`;

  const baseHeaders = {
    ...headers,
  };

  // Só define Content-Type se não for FormData
  if (!(body instanceof FormData)) {
    baseHeaders["Content-Type"] = "application/json";
  }

  if (!skipAuth) {
    const token = getStoredToken();
    if (token) baseHeaders["Authorization"] = `Bearer ${token}`;
  }

  const fetchOptions = {
    method,
    headers: baseHeaders,
    body: body
      ? body instanceof FormData
        ? body
        : typeof body === "string"
        ? body
        : JSON.stringify(body)
      : undefined,
    credentials: "include",
    mode: "cors", // Força modo CORS
  };

  try {
    // Usar robustFetch se retry não estiver desabilitado
    const response = skipRetry
      ? await fetch(url, fetchOptions)
      : await robustFetch(url, fetchOptions, {
          timeout,
          maxRetries,
          // Não fazer retry para erros 401 (token expirado) ou 403 (acesso negado)
          onRetry: (attempt, delay, error) => {
            // Log apenas em desenvolvimento
            const isDev =
              typeof process !== "undefined" &&
              process.env?.NODE_ENV === "development";
            if (isDev) {
              console.log(
                `Tentativa ${attempt} de requisição para ${path} após ${delay}ms`
              );
            }
          },
        });

    let data;
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    if (!response.ok) {
      // Tratamento específico para diferentes tipos de erro
      let errorMessage;

      if (response.status === 0 || response.status >= 500) {
        // Servidor não está respondendo ou erro interno
        errorMessage =
          (data && (data.error || data.message)) ||
          "Servidor temporariamente indisponível. Verifique sua conexão e tente novamente.";
      } else if (response.status === 404) {
        // Verificar se é erro de login (credenciais inválidas) ou endpoint não encontrado
        const isLoginEndpoint =
          path.includes("/login") || path.includes("/users/login");
        const isCartEndpoint = path.includes("/cart");
        
        if (isLoginEndpoint && data?.error) {
          // É um erro de login - usar a mensagem do backend
          errorMessage = data.error;
        } else if (isCartEndpoint) {
          // REVISÃO: Erro 404 em endpoints de carrinho - pode ser API não rodando ou endpoint não registrado
          errorMessage =
            (data && (data.error || data.message)) ||
            "Endpoint do carrinho não encontrado. Verifique se a API está rodando e se o endpoint está registrado.";
          
          // Log detalhado em desenvolvimento para debug
          const isDev =
            typeof process !== "undefined" &&
            process.env?.NODE_ENV === "development";
          if (isDev) {
            console.error('[API] Erro 404 em endpoint de carrinho:', {
              path,
              url,
              method: fetchOptions.method,
              data
            });
          }
        } else {
          // Endpoint não encontrado
          errorMessage =
            "Serviço não encontrado. Verifique se o servidor está rodando.";
        }
      } else if (response.status === 401) {
        // Não autorizado - provavelmente token expirado ou credenciais inválidas
        errorMessage =
          data?.error ||
          data?.message ||
          "Sessão expirada. Faça login novamente.";
        // Limpar token expirado automaticamente apenas se não for erro de login
        const isLoginEndpoint =
          path.includes("/login") || path.includes("/users/login");
        if (!isLoginEndpoint) {
          clearStoredToken();
          clearStoredUser();
        }
      } else if (response.status === 403) {
        // Proibido - pode ser conta inativa, email não verificado, ou outros problemas
        const isLoginEndpoint =
          path.includes("/login") || path.includes("/users/login");
        if (isLoginEndpoint && data?.error) {
          // Para login, usar a mensagem específica do backend
          errorMessage = data.error;
        } else {
          // Para outros endpoints, mensagem genérica
          errorMessage = data?.error || data?.message || "Acesso negado.";
        }
      } else if (response.status === 308) {
        // Redirecionamento permanente - problema de CORS
        errorMessage =
          "Erro de configuração do servidor. Verifique se o CORS está configurado corretamente.";
      } else if (response.status === 422) {
        // Unprocessable Entity - usado para erros de validação de estoque, ingredientes indisponíveis, etc.
        // A mensagem do backend já vem formatada com detalhes (ex: unidades, quantidades)
        errorMessage =
          (data && (data.error || data.message)) ||
          "Erro de validação. Verifique os dados enviados.";
      } else {
        // Outros erros
        errorMessage =
          (data && (data.error || data.msg || data.message)) ||
          `Erro ${response.status}`;
      }

      const error = new Error(errorMessage);
      error.status = response.status;
      error.payload = data;
      throw error;
    }

    return data;
  } catch (fetchError) {
    const classification = classifyNetworkError(fetchError);

    // Se não tem status, definir como 0 (erro de rede)
    if (!fetchError.status && fetchError.status !== 0) {
      fetchError.status = 0;
    }

    // Adicionar informações de classificação ao erro
    fetchError.errorType = classification.type;
    fetchError.userMessage = classification.userMessage;
    fetchError.isRetryable = classification.retryable;

    // Erro de rede ou conexão (não tratado acima)
    if (
      fetchError.name === "TypeError" &&
      fetchError.message.includes("fetch")
    ) {
      // Verificar se é erro de CORS
      if (
        fetchError.message.includes("CORS") ||
        fetchError.message.includes("blocked")
      ) {
        const corsError = new Error(classification.userMessage);
        corsError.status = 0;
        corsError.isCorsError = true;
        corsError.errorType = classification.type;
        corsError.userMessage = classification.userMessage;
        throw corsError;
      }

      const connectionError = new Error(classification.userMessage);
      connectionError.status = 0;
      connectionError.isConnectionError = true;
      connectionError.errorType = classification.type;
      connectionError.userMessage = classification.userMessage;
      throw connectionError;
    }

    // Re-throw outros erros (com classificação adicionada)
    throw fetchError;
  }
}

export function logoutLocal() {
  clearStoredToken();
  clearStoredUser();
}
