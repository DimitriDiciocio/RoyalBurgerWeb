/**
 * Gerenciador de Cache
 * Gerencia cache de dados com TTL (Time To Live)
 */

class CacheManager {
    constructor() {
        this.cache = new Map();
        this.defaultTTL = 5 * 60 * 1000; // 5 minutos em milissegundos
    }

    /**
     * Armazena um valor no cache
     * @param {string} key - Chave do cache
     * @param {*} value - Valor a ser armazenado
     * @param {number} ttl - Tempo de vida em milissegundos (padrão: 5 minutos)
     */
    set(key, value, ttl = null) {
        const expirationTime = Date.now() + (ttl || this.defaultTTL);
        this.cache.set(key, {
            value,
            expirationTime
        });
    }

    /**
     * Obtém um valor do cache
     * @param {string} key - Chave do cache
     * @returns {*|null} Valor armazenado ou null se expirado/não encontrado
     */
    get(key) {
        const item = this.cache.get(key);
        
        if (!item) {
            return null;
        }

        // Verificar se expirou
        if (Date.now() > item.expirationTime) {
            this.cache.delete(key);
            return null;
        }

        return item.value;
    }

    /**
     * Verifica se uma chave existe e não expirou
     * @param {string} key - Chave do cache
     * @returns {boolean} True se existe e não expirou
     */
    has(key) {
        const item = this.cache.get(key);
        
        if (!item) {
            return false;
        }

        // Verificar se expirou
        if (Date.now() > item.expirationTime) {
            this.cache.delete(key);
            return false;
        }

        return true;
    }

    /**
     * Remove uma chave do cache
     * @param {string} key - Chave a ser removida
     */
    delete(key) {
        this.cache.delete(key);
    }

    /**
     * Limpa todo o cache
     */
    clear() {
        this.cache.clear();
    }

    /**
     * Remove itens expirados do cache
     */
    cleanup() {
        const now = Date.now();
        for (const [key, item] of this.cache.entries()) {
            if (now > item.expirationTime) {
                this.cache.delete(key);
            }
        }
    }

    /**
     * Obtém estatísticas do cache
     * @returns {Object} Estatísticas do cache
     */
    getStats() {
        this.cleanup(); // Limpar expirados antes de contar
        return {
            size: this.cache.size,
            keys: Array.from(this.cache.keys())
        };
    }
}

// Exportar instância singleton
export const cacheManager = new CacheManager();

// Limpar cache expirado a cada 1 minuto
setInterval(() => {
    cacheManager.cleanup();
}, 60 * 1000);
