// src/js/utils/cache-manager.js
// Cache Manager Compartilhado - Seção 1.1 da análise de performance

/**
 * Gerenciador de cache compartilhado para reduzir requisições HTTP redundantes
 * Suporta cache em memória e sessionStorage para persistência entre páginas
 */
class CacheManager {
  constructor() {
    this.memoryCache = new Map();
    this.defaultTTL = 5 * 60 * 1000; // 5 minutos padrão
    this.storagePrefix = "rb_cache_";

    // Limpar cache expirado do sessionStorage ao iniciar
    this._cleanExpiredStorage();
  }

  /**
   * Obtém valor do cache
   * @param {string} key - Chave do cache
   * @returns {any|null} Valor em cache ou null se não encontrado/expirado
   */
  get(key) {
    // Tentar memória primeiro (mais rápido)
    const memoryEntry = this.memoryCache.get(key);
    if (memoryEntry) {
      if (Date.now() > memoryEntry.expires) {
        this.memoryCache.delete(key);
        this._removeFromStorage(key);
        return null;
      }
      return memoryEntry.value;
    }

    // Tentar sessionStorage
    try {
      const storageKey = this.storagePrefix + key;
      const stored = sessionStorage.getItem(storageKey);
      if (stored) {
        const entry = JSON.parse(stored);
        if (Date.now() > entry.expires) {
          sessionStorage.removeItem(storageKey);
          return null;
        }
        // Restaurar para memória para acesso mais rápido
        this.memoryCache.set(key, entry);
        return entry.value;
      }
    } catch (e) {
      // sessionStorage pode estar indisponível ou cheio
      console.warn("Erro ao acessar sessionStorage:", e);
    }

    return null;
  }

  /**
   * Define valor no cache
   * @param {string} key - Chave do cache
   * @param {any} value - Valor a ser armazenado
   * @param {number} ttl - Time to live em milissegundos (opcional, usa default se não fornecido)
   */
  set(key, value, ttl = this.defaultTTL) {
    const entry = {
      value,
      expires: Date.now() + ttl,
      createdAt: Date.now(),
    };

    // Armazenar em memória
    this.memoryCache.set(key, entry);

    // Armazenar em sessionStorage (com tratamento de erro)
    try {
      const storageKey = this.storagePrefix + key;
      sessionStorage.setItem(storageKey, JSON.stringify(entry));
    } catch (e) {
      // sessionStorage pode estar cheio, apenas logar aviso
      console.warn(
        "Erro ao salvar no sessionStorage (cache continuará funcionando em memória):",
        e
      );
    }
  }

  /**
   * Invalida uma chave específica do cache
   * @param {string} key - Chave a ser invalidada
   */
  invalidate(key) {
    this.memoryCache.delete(key);
    this._removeFromStorage(key);
  }

  /**
   * Invalida múltiplas chaves de uma vez (útil para invalidar por padrão)
   * @param {string|RegExp} pattern - Padrão de chaves a invalidar (string exata ou RegExp)
   */
  invalidatePattern(pattern) {
    const regex = pattern instanceof RegExp ? pattern : new RegExp(pattern);

    // Invalidar em memória
    for (const key of this.memoryCache.keys()) {
      if (regex.test(key)) {
        this.memoryCache.delete(key);
      }
    }

    // Invalidar em sessionStorage
    try {
      const keysToRemove = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const storageKey = sessionStorage.key(i);
        if (storageKey && storageKey.startsWith(this.storagePrefix)) {
          const cacheKey = storageKey.replace(this.storagePrefix, "");
          if (regex.test(cacheKey)) {
            keysToRemove.push(storageKey);
          }
        }
      }
      keysToRemove.forEach((key) => sessionStorage.removeItem(key));
    } catch (e) {
      console.warn("Erro ao invalidar padrão no sessionStorage:", e);
    }
  }

  /**
   * Limpa todo o cache
   */
  clear() {
    this.memoryCache.clear();

    // Limpar sessionStorage
    try {
      const keysToRemove = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const storageKey = sessionStorage.key(i);
        if (storageKey && storageKey.startsWith(this.storagePrefix)) {
          keysToRemove.push(storageKey);
        }
      }
      keysToRemove.forEach((key) => sessionStorage.removeItem(key));
    } catch (e) {
      console.warn("Erro ao limpar sessionStorage:", e);
    }
  }

  /**
   * Remove uma chave do sessionStorage
   * @private
   */
  _removeFromStorage(key) {
    try {
      const storageKey = this.storagePrefix + key;
      sessionStorage.removeItem(storageKey);
    } catch (e) {
      // Ignorar erros silenciosamente
    }
  }

  /**
   * Limpa entradas expiradas do sessionStorage
   * @private
   */
  _cleanExpiredStorage() {
    try {
      const now = Date.now();
      const keysToRemove = [];

      for (let i = 0; i < sessionStorage.length; i++) {
        const storageKey = sessionStorage.key(i);
        if (storageKey && storageKey.startsWith(this.storagePrefix)) {
          try {
            const stored = sessionStorage.getItem(storageKey);
            if (stored) {
              const entry = JSON.parse(stored);
              if (now > entry.expires) {
                keysToRemove.push(storageKey);
              }
            }
          } catch (e) {
            // Se não conseguir parsear, remover (corrompido)
            keysToRemove.push(storageKey);
          }
        }
      }

      keysToRemove.forEach((key) => sessionStorage.removeItem(key));
    } catch (e) {
      // Ignorar erros silenciosamente
    }
  }

  /**
   * Retorna estatísticas do cache (útil para debugging)
   * @returns {Object} Estatísticas do cache
   */
  getStats() {
    const memorySize = this.memoryCache.size;
    let storageSize = 0;

    try {
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key && key.startsWith(this.storagePrefix)) {
          storageSize++;
        }
      }
    } catch (e) {
      // Ignorar erro
    }

    return {
      memoryEntries: memorySize,
      storageEntries: storageSize,
      totalEntries: memorySize, // Pode haver overlap, mas dá uma ideia
    };
  }
}

// Exportar instância singleton
export const cacheManager = new CacheManager();

// Exportar classe também para testes ou casos especiais
export { CacheManager };
