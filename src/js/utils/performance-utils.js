// src/js/utils/performance-utils.js
// Utilitários de Performance - Seções 1.3, 1.9 da análise de performance

/**
 * Debounce: executa função após um delay, cancelando execuções anteriores
 * @param {Function} func - Função a ser executada
 * @param {number} wait - Tempo de espera em milissegundos
 * @param {boolean} immediate - Se true, executa imediatamente na primeira chamada
 * @returns {Function} Função com debounce aplicado
 */
export function debounce(func, wait = 300, immediate = false) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      timeout = null;
      if (!immediate) func.apply(this, args);
    };
    const callNow = immediate && !timeout;
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
    if (callNow) func.apply(this, args);
  };
}

/**
 * Throttle: executa função no máximo uma vez por período
 * @param {Function} func - Função a ser executada
 * @param {number} limit - Limite de tempo em milissegundos
 * @returns {Function} Função com throttle aplicado
 */
export function throttle(func, limit = 300) {
  let inThrottle;
  return function executedFunction(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

/**
 * Event Delegation Helper
 * Cria um event listener no container que delega para elementos filhos
 * @param {HTMLElement} container - Container pai onde o listener será anexado
 * @param {string} eventType - Tipo de evento (ex: 'click', 'change')
 * @param {string} selector - Seletor CSS dos elementos alvo
 * @param {Function} handler - Função handler: (event, targetElement) => void
 * @returns {Function} Função de cleanup para remover o listener
 */
export function delegate(container, eventType, selector, handler) {
  if (!container || !selector || !handler) {
    // ALTERAÇÃO: Log apenas em desenvolvimento - removido console.warn em produção
    const isDev = typeof process !== "undefined" && process.env?.NODE_ENV === "development";
    if (isDev) {
      // eslint-disable-next-line no-console
      console.warn("delegate: parâmetros inválidos");
    }
    return () => {};
  }

  const eventHandler = (event) => {
    // Encontrar elemento que corresponde ao seletor
    let target = event.target;

    // Verificar se o próprio target corresponde
    if (target.matches && target.matches(selector)) {
      handler(event, target);
      return;
    }

    // Buscar ascendente até encontrar match ou chegar no container
    while (target && target !== container) {
      if (target.matches && target.matches(selector)) {
        handler(event, target);
        return;
      }
      target = target.parentElement;
    }
  };

  container.addEventListener(eventType, eventHandler);

  // Retornar função de cleanup
  return () => {
    container.removeEventListener(eventType, eventHandler);
  };
}

/**
 * Wrapper para MutationObserver que detecta mudanças em atributos de elementos
 * Útil para substituir setInterval em casos como verificação de mudanças de valor
 * @param {HTMLElement} element - Elemento a ser observado
 * @param {Function} callback - Callback quando mudança é detectada: (mutations) => void
 * @param {Object} options - Opções do MutationObserver
 * @returns {Function} Função de cleanup para desconectar o observer
 */
export function observeElement(element, callback, options = {}) {
  if (!element || !callback) {
    // ALTERAÇÃO: Log apenas em desenvolvimento - removido console.warn em produção
    const isDev = typeof process !== "undefined" && process.env?.NODE_ENV === "development";
    if (isDev) {
      // eslint-disable-next-line no-console
      console.warn("observeElement: parâmetros inválidos");
    }
    return () => {};
  }

  const defaultOptions = {
    attributes: true,
    attributeOldValue: true,
    childList: false,
    subtree: false,
    ...options,
  };

  const observer = new MutationObserver(callback);
  observer.observe(element, defaultOptions);

  // Retornar função de cleanup
  return () => {
    observer.disconnect();
  };
}

/**
 * Remove todos os event listeners de um elemento (útil para cleanup)
 * NOTA: Isso remove TODOS os listeners. Use com cuidado.
 * @param {HTMLElement} element - Elemento do qual remover listeners
 * @returns {void}
 */
export function removeAllListeners(element) {
  if (!element) return;

  // Criar clone do elemento (sem listeners) e substituir
  const newElement = element.cloneNode(true);
  element.parentNode?.replaceChild(newElement, element);
}

/**
 * Manager para rastrear e limpar event listeners facilmente
 */
export class EventListenerManager {
  constructor() {
    this.listeners = new Map(); // element -> [{ type, handler, cleanup }]
  }

  /**
   * Adiciona um listener e rastreia para cleanup posterior
   * @param {HTMLElement} element - Elemento
   * @param {string} eventType - Tipo de evento
   * @param {Function} handler - Handler
   * @param {Object} options - Opções (capture, once, passive, etc)
   */
  add(element, eventType, handler, options = {}) {
    if (!element) return;

    const key = this._getElementKey(element);
    if (!this.listeners.has(key)) {
      this.listeners.set(key, []);
    }

    element.addEventListener(eventType, handler, options);

    const cleanup = () => {
      element.removeEventListener(eventType, handler, options);
    };

    this.listeners.get(key).push({ eventType, handler, cleanup, options });
    return cleanup;
  }

  /**
   * Remove todos os listeners de um elemento
   * @param {HTMLElement} element - Elemento
   */
  removeAll(element) {
    const key = this._getElementKey(element);
    const listeners = this.listeners.get(key);

    if (listeners) {
      listeners.forEach(({ cleanup }) => cleanup());
      this.listeners.delete(key);
    }
  }

  /**
   * Remove todos os listeners gerenciados
   */
  removeAllListeners() {
    this.listeners.forEach((listeners) => {
      listeners.forEach(({ cleanup }) => cleanup());
    });
    this.listeners.clear();
  }

  /**
   * Gera uma chave única para um elemento
   * @private
   */
  _getElementKey(element) {
    // Usar WeakMap idealmente, mas para compatibilidade usar uma abordagem simples
    if (!element._eventManagerId) {
      element._eventManagerId = Math.random().toString(36).substr(2, 9);
    }
    return element._eventManagerId;
  }
}

// Exportar instância singleton
export const eventManager = new EventListenerManager();
