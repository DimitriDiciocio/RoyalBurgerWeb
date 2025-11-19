/**
 * Módulo de Tratamento de Erros de Rede
 *
 * Fornece utilitários para tratamento robusto de erros de rede,
 * incluindo retry automático, timeout e detecção melhorada de erros.
 */

/**
 * Configurações padrão para retry
 */
const DEFAULT_RETRY_CONFIG = {
  maxRetries: 3,
  initialDelay: 1000, // 1 segundo
  maxDelay: 10000, // 10 segundos
  backoffMultiplier: 2,
  retryableStatuses: [408, 429, 500, 502, 503, 504], // Status codes que podem ser retentados
};

/**
 * Configurações padrão para timeout
 */
const DEFAULT_TIMEOUT_CONFIG = {
  timeout: 30000, // 30 segundos
};

/**
 * Calcula o delay para retry usando backoff exponencial
 * @param {number} attempt - Número da tentativa (0-based)
 * @param {Object} config - Configuração de retry
 * @returns {number} Delay em milissegundos
 */
function calculateRetryDelay(attempt, config = DEFAULT_RETRY_CONFIG) {
  const delay =
    config.initialDelay * Math.pow(config.backoffMultiplier, attempt);
  return Math.min(delay, config.maxDelay);
}

/**
 * Verifica se um erro é retentável
 * @param {Error} error - Erro a ser verificado
 * @param {Object} config - Configuração de retry
 * @returns {boolean} True se o erro pode ser retentado
 */
function isRetryableError(error, config = DEFAULT_RETRY_CONFIG) {
  // Erros de conexão (status 0) são sempre retentáveis
  if (error?.status === 0 || error?.isConnectionError) {
    return true;
  }

  // Erros de timeout são retentáveis
  if (error?.name === "TimeoutError" || error?.message?.includes("timeout")) {
    return true;
  }

  // Verificar status codes retentáveis
  if (error?.status && config.retryableStatuses.includes(error.status)) {
    return true;
  }

  // Erros de CORS não são retentáveis (problema de configuração)
  if (error?.isCorsError) {
    return false;
  }

  // Erros 4xx (exceto os retentáveis) não são retentáveis
  if (error?.status && error.status >= 400 && error.status < 500) {
    return false;
  }

  // Outros erros de rede são retentáveis
  if (
    error?.name === "TypeError" &&
    (error?.message?.includes("fetch") || error?.message?.includes("network"))
  ) {
    return true;
  }

  return false;
}

/**
 * Cria um fetch com timeout
 * @param {string} url - URL da requisição
 * @param {RequestInit} options - Opções do fetch
 * @param {number} timeoutMs - Timeout em milissegundos
 * @returns {Promise<Response>} Promise que resolve com a resposta ou rejeita com timeout
 */
function fetchWithTimeout(
  url,
  options = {},
  timeoutMs = DEFAULT_TIMEOUT_CONFIG.timeout
) {
  return new Promise((resolve, reject) => {
    // Criar AbortController para timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
      const timeoutError = new Error(
        `Request timeout após ${timeoutMs / 1000}s`
      );
      timeoutError.name = "TimeoutError";
      timeoutError.status = 0;
      timeoutError.isTimeoutError = true;
      reject(timeoutError);
    }, timeoutMs);

    // Adicionar signal ao fetch
    const fetchOptions = {
      ...options,
      signal: controller.signal,
    };

    fetch(url, fetchOptions)
      .then((response) => {
        clearTimeout(timeoutId);
        resolve(response);
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        // Se foi abortado por timeout, já foi tratado acima
        if (error.name === "AbortError") {
          return;
        }
        reject(error);
      });
  });
}

/**
 * Executa uma requisição com retry automático
 * @param {Function} requestFn - Função que retorna uma Promise da requisição
 * @param {Object} options - Opções de retry
 * @param {number} options.maxRetries - Número máximo de tentativas
 * @param {number} options.initialDelay - Delay inicial em ms
 * @param {number} options.maxDelay - Delay máximo em ms
 * @param {number} options.backoffMultiplier - Multiplicador de backoff
 * @param {number[]} options.retryableStatuses - Status codes retentáveis
 * @param {Function} options.onRetry - Callback chamado antes de cada retry
 * @returns {Promise<any>} Promise que resolve com o resultado da requisição
 */
export async function fetchWithRetry(requestFn, options = {}) {
  const config = { ...DEFAULT_RETRY_CONFIG, ...options };
  let lastError = null;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      const result = await requestFn();
      return result;
    } catch (error) {
      lastError = error;

      // Verificar se é retentável
      if (!isRetryableError(error, config)) {
        throw error;
      }

      // Se é a última tentativa, não fazer retry
      if (attempt >= config.maxRetries) {
        break;
      }

      // Calcular delay para próximo retry
      const delay = calculateRetryDelay(attempt, config);

      // Chamar callback de retry se disponível
      if (config.onRetry) {
        config.onRetry(attempt + 1, delay, error);
      }

      // Aguardar antes de tentar novamente
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  // Se chegou aqui, todas as tentativas falharam
  throw lastError;
}

/**
 * Cria um fetch com timeout e retry
 * @param {string} url - URL da requisição
 * @param {RequestInit} options - Opções do fetch
 * @param {Object} config - Configuração de timeout e retry
 * @param {number} config.timeout - Timeout em milissegundos
 * @param {number} config.maxRetries - Número máximo de tentativas
 * @param {Function} config.onRetry - Callback chamado antes de cada retry
 * @returns {Promise<Response>} Promise que resolve com a resposta
 */
export async function robustFetch(url, options = {}, config = {}) {
  const timeout = config.timeout || DEFAULT_TIMEOUT_CONFIG.timeout;
  const retryConfig = {
    maxRetries: config.maxRetries ?? DEFAULT_RETRY_CONFIG.maxRetries,
    onRetry: config.onRetry,
  };

  return fetchWithRetry(
    () => fetchWithTimeout(url, options, timeout),
    retryConfig
  );
}

/**
 * Classifica o tipo de erro de rede
 * @param {Error} error - Erro a ser classificado
 * @returns {Object} Objeto com informações sobre o tipo de erro
 */
export function classifyNetworkError(error) {
  const classification = {
    type: "unknown",
    userMessage: "Ocorreu um erro inesperado",
    retryable: false,
    technical: error?.message || "Erro desconhecido",
  };

  // Erro de timeout
  if (error?.isTimeoutError || error?.name === "TimeoutError") {
    classification.type = "timeout";
    classification.userMessage =
      "A requisição demorou muito para responder. Verifique sua conexão e tente novamente.";
    classification.retryable = true;
    return classification;
  }

  // Erro de conexão (status 0)
  if (error?.status === 0 || error?.isConnectionError) {
    classification.type = "connection";
    classification.userMessage =
      "Não foi possível conectar ao servidor. Verifique se a API está rodando e sua conexão com a internet.";
    classification.retryable = true;
    return classification;
  }

  // Erro de CORS
  if (error?.isCorsError) {
    classification.type = "cors";
    classification.userMessage =
      "Erro de configuração do servidor. Entre em contato com o suporte.";
    classification.retryable = false;
    classification.technical =
      "Erro de CORS: O servidor não permite requisições do frontend.";
    return classification;
  }

  // Erro 401 - Não autorizado
  if (error?.status === 401) {
    classification.type = "unauthorized";
    classification.userMessage = "Sessão expirada. Faça login novamente.";
    classification.retryable = false;
    return classification;
  }

  // Erro 403 - Proibido
  if (error?.status === 403) {
    classification.type = "forbidden";
    classification.userMessage =
      "Acesso negado. Você não tem permissão para esta operação.";
    classification.retryable = false;
    return classification;
  }

  // Erro 404 - Não encontrado
  if (error?.status === 404) {
    classification.type = "not_found";
    // ALTERAÇÃO: Mensagem mais específica para DELETE de movimentações financeiras
    if (error?.payload?.error) {
      classification.userMessage = error.payload.error;
    } else if (error?.message && error.message.includes("Movimentação")) {
      classification.userMessage = error.message;
    } else {
      classification.userMessage =
        "O serviço solicitado não foi encontrado. Verifique se o servidor está rodando corretamente.";
    }
    classification.retryable = false;
    return classification;
  }

  // Erro 429 - Muitas requisições
  if (error?.status === 429) {
    classification.type = "rate_limit";
    classification.userMessage =
      "Muitas requisições. Aguarde alguns instantes e tente novamente.";
    classification.retryable = true;
    return classification;
  }

  // Erro 5xx - Erro do servidor
  if (error?.status && error.status >= 500) {
    classification.type = "server_error";
    classification.userMessage =
      "O servidor está temporariamente indisponível. Tente novamente em alguns minutos.";
    classification.retryable = true;
    return classification;
  }

  // ALTERAÇÃO: Erro 400 - Bad Request (validação, entidade relacionada, etc.)
  if (error?.status === 400) {
    classification.type = "validation_error";
    classification.userMessage =
      error?.message ||
      error?.payload?.error ||
      error?.payload?.message ||
      "Erro na requisição. Verifique os dados enviados.";
    classification.retryable = false;
    return classification;
  }

  // Erro 422 - Erro de validação
  if (error?.status === 422) {
    classification.type = "validation_error";
    classification.userMessage =
      error?.message ||
      error?.payload?.error ||
      error?.payload?.message ||
      "Erro de validação. Verifique os dados enviados.";
    classification.retryable = false;
    return classification;
  }

  // Erro de rede genérico
  if (
    error?.name === "TypeError" &&
    (error?.message?.includes("fetch") || error?.message?.includes("network"))
  ) {
    classification.type = "network";
    classification.userMessage =
      "Erro de conexão. Verifique sua conexão com a internet.";
    classification.retryable = true;
    return classification;
  }

  return classification;
}

/**
 * Cria mensagem de erro amigável para o usuário
 * @param {Error} error - Erro original
 * @returns {string} Mensagem amigável
 */
export function getUserFriendlyErrorMessage(error) {
  const classification = classifyNetworkError(error);
  return classification.userMessage;
}
