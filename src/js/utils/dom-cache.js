// src/js/utils/dom-cache.js
// Cache de Referências DOM - Seção 1.4 da análise de performance

/**
 * Gerenciador de cache de elementos DOM
 * Evita re-queries desnecessárias melhorando performance
 */
export class DOMCache {
  constructor() {
    this.cache = new Map();
    this.observer = null;
    this.setupObserver();
  }

  /**
   * Obtém elemento do DOM com cache
   * @param {string} selector - Seletor CSS
   * @param {HTMLElement|Document} context - Contexto para busca (padrão: document)
   * @param {boolean} forceRefresh - Força re-query ignorando cache
   * @returns {HTMLElement|null} Elemento ou null se não encontrado
   */
  get(selector, context = document, forceRefresh = false) {
    const cacheKey = this._getCacheKey(selector, context);

    // Retornar do cache se existir e não forçar refresh
    if (!forceRefresh && this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      // Verificar se elemento ainda existe no DOM
      if (this._isElementValid(cached.element)) {
        return cached.element;
      } else {
        // Elemento foi removido, limpar cache
        this.cache.delete(cacheKey);
      }
    }

    // Buscar elemento
    const element =
      context === document
        ? document.querySelector(selector)
        : context.querySelector(selector);

    // Armazenar no cache
    if (element) {
      this.cache.set(cacheKey, {
        element,
        selector,
        context,
        timestamp: Date.now(),
      });
    }

    return element;
  }

  /**
   * Obtém múltiplos elementos com cache
   * @param {string} selector - Seletor CSS
   * @param {HTMLElement|Document} context - Contexto para busca
   * @param {boolean} forceRefresh - Força re-query
   * @returns {NodeList} NodeList de elementos
   */
  getAll(selector, context = document, forceRefresh = false) {
    const cacheKey = this._getCacheKey(selector, context, true); // true = multiple

    if (!forceRefresh && this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      // Verificar se ainda é válido (verificar primeiro elemento)
      if (
        cached.elements.length === 0 ||
        this._isElementValid(cached.elements[0])
      ) {
        return cached.elements;
      } else {
        this.cache.delete(cacheKey);
      }
    }

    // Buscar elementos
    const elements =
      context === document
        ? document.querySelectorAll(selector)
        : context.querySelectorAll(selector);

    // Armazenar no cache (converter NodeList para Array para facilitar)
    const elementsArray = Array.from(elements);
    this.cache.set(cacheKey, {
      elements: elementsArray,
      selector,
      context,
      timestamp: Date.now(),
      isMultiple: true,
    });

    return elementsArray;
  }

  /**
   * Obtém elemento por ID (método de conveniência)
   * @param {string} id - ID do elemento
   * @param {boolean} forceRefresh - Força re-query
   * @returns {HTMLElement|null}
   */
  getById(id, forceRefresh = false) {
    return this.get(`#${id}`, document, forceRefresh);
  }

  /**
   * Limpa cache para um seletor específico
   * @param {string} selector - Seletor a limpar (opcional, limpa tudo se não fornecido)
   * @param {HTMLElement|Document} context - Contexto específico (opcional)
   */
  clear(selector = null, context = null) {
    if (!selector) {
      // Limpar todo o cache
      this.cache.clear();
      return;
    }

    // Limpar entradas específicas
    const keysToDelete = [];
    for (const [key, value] of this.cache.entries()) {
      if (
        value.selector === selector &&
        (!context || value.context === context)
      ) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach((key) => this.cache.delete(key));
  }

  /**
   * Limpa cache de elementos removidos do DOM
   */
  cleanup() {
    const keysToDelete = [];
    for (const [key, value] of this.cache.entries()) {
      if (value.isMultiple) {
        // Verificar se lista está vazia ou primeiro elemento é inválido
        if (
          value.elements.length === 0 ||
          !this._isElementValid(value.elements[0])
        ) {
          keysToDelete.push(key);
        }
      } else {
        // Verificar se elemento único é inválido
        if (!this._isElementValid(value.element)) {
          keysToDelete.push(key);
        }
      }
    }

    keysToDelete.forEach((key) => this.cache.delete(key));
  }

  /**
   * Configura MutationObserver para invalidar cache automaticamente
   * @private
   */
  setupObserver() {
    if (!("MutationObserver" in window)) {
      return; // Fallback silencioso se não disponível
    }

    // Observer apenas para mudanças estruturais que podem invalidar cache
    this.observer = new MutationObserver(() => {
      // Limpar cache periodicamente quando houver mudanças
      // (em vez de limpar imediatamente, fazemos cleanup periódico)
      if (!this._cleanupTimeout) {
        this._cleanupTimeout = setTimeout(() => {
          this.cleanup();
          this._cleanupTimeout = null;
        }, 1000); // Debounce cleanup por 1 segundo
      }
    });

    // Observar mudanças no body
    if (document.body) {
      this.observer.observe(document.body, {
        childList: true,
        subtree: true,
      });
    } else {
      // Aguardar body estar disponível
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => {
          if (document.body) {
            this.observer.observe(document.body, {
              childList: true,
              subtree: true,
            });
          }
        });
      }
    }
  }

  /**
   * Verifica se elemento ainda é válido (existe no DOM)
   * @param {HTMLElement} element - Elemento a verificar
   * @returns {boolean}
   * @private
   */
  _isElementValid(element) {
    if (!element) return false;
    // Verificar se elemento ainda está conectado ao DOM
    return document.body.contains(element);
  }

  /**
   * Gera chave única para cache
   * @param {string} selector - Seletor CSS
   * @param {HTMLElement|Document} context - Contexto
   * @param {boolean} isMultiple - Se é query múltipla
   * @returns {string}
   * @private
   */
  _getCacheKey(selector, context, isMultiple = false) {
    const contextKey =
      context === document
        ? "document"
        : context.id || context.tagName || "context";
    return `${selector}::${contextKey}::${isMultiple ? "all" : "single"}`;
  }

  /**
   * Retorna estatísticas do cache (útil para debugging)
   * @returns {Object} Estatísticas
   */
  getStats() {
    let validEntries = 0;
    let invalidEntries = 0;

    for (const value of this.cache.values()) {
      if (value.isMultiple) {
        if (
          value.elements.length > 0 &&
          this._isElementValid(value.elements[0])
        ) {
          validEntries++;
        } else {
          invalidEntries++;
        }
      } else {
        if (this._isElementValid(value.element)) {
          validEntries++;
        } else {
          invalidEntries++;
        }
      }
    }

    return {
      totalEntries: this.cache.size,
      validEntries,
      invalidEntries,
    };
  }

  /**
   * Destrói o cache e limpa observers
   */
  destroy() {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    if (this._cleanupTimeout) {
      clearTimeout(this._cleanupTimeout);
      this._cleanupTimeout = null;
    }
    this.cache.clear();
  }
}

// Exportar instância singleton
export const domCache = new DOMCache();

// Helper functions para uso direto (conveniência)
/**
 * Obtém elemento com cache
 * @param {string} selector - Seletor CSS
 * @param {HTMLElement|Document} context - Contexto
 * @returns {HTMLElement|null}
 */
export function $q(selector, context = document) {
  return domCache.get(selector, context);
}

/**
 * Obtém múltiplos elementos com cache
 * @param {string} selector - Seletor CSS
 * @param {HTMLElement|Document} context - Contexto
 * @returns {Array<HTMLElement>}
 */
export function $qa(selector, context = document) {
  return domCache.getAll(selector, context);
}

/**
 * Obtém elemento por ID com cache
 * @param {string} id - ID do elemento
 * @returns {HTMLElement|null}
 */
export function $id(id) {
  return domCache.getById(id);
}
