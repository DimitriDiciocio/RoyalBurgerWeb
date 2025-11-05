/**
 * State Manager Centralizado
 *
 * Gerencia estado global da aplicação e fornece um event bus
 * para comunicação entre módulos, evitando acoplamento direto.
 */

/**
 * Event Bus simples para comunicação entre módulos
 */
class EventBus {
  constructor() {
    this.listeners = new Map();
  }

  /**
   * Registra um listener para um evento
   * @param {string} event - Nome do evento
   * @param {Function} callback - Função callback
   * @returns {Function} Função de remoção do listener
   */
  on(event, callback) {
    if (typeof callback !== "function") {
      console.warn(
        `EventBus.on: callback deve ser uma função para evento "${event}"`
      );
      return () => {};
    }

    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }

    this.listeners.get(event).add(callback);

    // Retornar função para remover listener
    return () => {
      this.off(event, callback);
    };
  }

  /**
   * Remove um listener de um evento
   * @param {string} event - Nome do evento
   * @param {Function} callback - Função callback a ser removida
   */
  off(event, callback) {
    if (!this.listeners.has(event)) return;

    const eventListeners = this.listeners.get(event);
    eventListeners.delete(callback);

    // Limpar Set se estiver vazio
    if (eventListeners.size === 0) {
      this.listeners.delete(event);
    }
  }

  /**
   * Emite um evento para todos os listeners registrados
   * @param {string} event - Nome do evento
   * @param {any} data - Dados a serem passados para os listeners
   */
  emit(event, data = null) {
    if (!this.listeners.has(event)) return;

    const eventListeners = this.listeners.get(event);
    eventListeners.forEach((callback) => {
      try {
        callback(data);
      } catch (error) {
        console.error(`Erro ao executar listener do evento "${event}":`, error);
      }
    });
  }

  /**
   * Remove todos os listeners de um evento ou todos os eventos
   * @param {string} event - Nome do evento (opcional, se não fornecido limpa todos)
   */
  clear(event = null) {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }

  /**
   * Retorna o número de listeners para um evento
   * @param {string} event - Nome do evento
   * @returns {number} Número de listeners
   */
  listenerCount(event) {
    if (!this.listeners.has(event)) return 0;
    return this.listeners.get(event).size;
  }
}

/**
 * State Manager centralizado
 */
class StateManager {
  constructor() {
    this.state = new Map();
    this.subscribers = new Map(); // Map<key, Set<callback>>
    this.eventBus = new EventBus();
    this.lock = false; // Lock para prevenir atualizações concorrentes
  }

  /**
   * Obtém valor do estado
   * @param {string} key - Chave do estado
   * @returns {any} Valor do estado ou undefined
   */
  get(key) {
    return this.state.get(key);
  }

  /**
   * Define valor no estado e notifica subscribers
   * @param {string} key - Chave do estado
   * @param {any} value - Valor a ser armazenado
   * @param {Object} options - Opções adicionais
   * @param {boolean} options.silent - Se true, não notifica subscribers
   * @returns {any} Valor armazenado
   */
  set(key, value, options = {}) {
    const { silent = false } = options;
    const oldValue = this.state.get(key);

    // Evitar atualizações desnecessárias
    if (oldValue === value) {
      return value;
    }

    this.state.set(key, value);

    // Notificar subscribers se não for silencioso
    if (!silent) {
      this._notifySubscribers(key, value, oldValue);
    }

    return value;
  }

  /**
   * Remove uma chave do estado
   * @param {string} key - Chave a ser removida
   */
  delete(key) {
    const oldValue = this.state.get(key);
    this.state.delete(key);

    // Notificar subscribers
    this._notifySubscribers(key, undefined, oldValue);
  }

  /**
   * Verifica se uma chave existe no estado
   * @param {string} key - Chave a ser verificada
   * @returns {boolean} True se a chave existe
   */
  has(key) {
    return this.state.has(key);
  }

  /**
   * Limpa todo o estado
   */
  clear() {
    const keys = Array.from(this.state.keys());
    this.state.clear();
    this.subscribers.clear();

    // Notificar subscribers de todas as chaves removidas
    keys.forEach((key) => {
      this._notifySubscribers(key, undefined, undefined);
    });
  }

  /**
   * Retorna todas as chaves do estado
   * @returns {string[]} Array de chaves
   */
  keys() {
    return Array.from(this.state.keys());
  }

  /**
   * Retorna todos os valores do estado
   * @returns {any[]} Array de valores
   */
  values() {
    return Array.from(this.state.values());
  }

  /**
   * Retorna todas as entradas do estado como array de [key, value]
   * @returns {Array<[string, any]>} Array de entradas
   */
  entries() {
    return Array.from(this.state.entries());
  }

  /**
   * Obtém múltiplas chaves de uma vez
   * @param {string[]} keys - Array de chaves
   * @returns {Object} Objeto com chaves e valores
   */
  getMultiple(keys) {
    const result = {};
    keys.forEach((key) => {
      result[key] = this.state.get(key);
    });
    return result;
  }

  /**
   * Define múltiplas chaves de uma vez
   * @param {Object} updates - Objeto com chaves e valores
   * @param {Object} options - Opções adicionais
   */
  setMultiple(updates, options = {}) {
    const keys = Object.keys(updates);
    keys.forEach((key) => {
      this.set(key, updates[key], options);
    });
  }

  /**
   * Subscribes para mudanças em uma chave específica
   * @param {string} key - Chave a ser observada
   * @param {Function} callback - Função callback (newValue, oldValue, key)
   * @returns {Function} Função para remover subscription
   */
  subscribe(key, callback) {
    if (typeof callback !== "function") {
      console.warn(
        `StateManager.subscribe: callback deve ser uma função para chave "${key}"`
      );
      return () => {};
    }

    if (!this.subscribers.has(key)) {
      this.subscribers.set(key, new Set());
    }

    this.subscribers.get(key).add(callback);

    // Retornar função para remover subscription
    return () => {
      this.unsubscribe(key, callback);
    };
  }

  /**
   * Remove subscription de uma chave
   * @param {string} key - Chave
   * @param {Function} callback - Função callback a ser removida
   */
  unsubscribe(key, callback) {
    if (!this.subscribers.has(key)) return;

    const keySubscribers = this.subscribers.get(key);
    keySubscribers.delete(callback);

    // Limpar Set se estiver vazio
    if (keySubscribers.size === 0) {
      this.subscribers.delete(key);
    }
  }

  /**
   * Subscribes para mudanças em múltiplas chaves
   * @param {string[]} keys - Array de chaves
   * @param {Function} callback - Função callback (key, newValue, oldValue)
   * @returns {Function} Função para remover todas as subscriptions
   */
  subscribeMultiple(keys, callback) {
    const unsubscribers = keys.map((key) => this.subscribe(key, callback));
    return () => {
      unsubscribers.forEach((unsub) => unsub());
    };
  }

  /**
   * Notifica subscribers de uma mudança
   * @private
   */
  _notifySubscribers(key, newValue, oldValue) {
    if (!this.subscribers.has(key)) return;

    const keySubscribers = this.subscribers.get(key);
    keySubscribers.forEach((callback) => {
      try {
        callback(newValue, oldValue, key);
      } catch (error) {
        console.error(`Erro ao executar subscriber da chave "${key}":`, error);
      }
    });
  }

  /**
   * Obtém o event bus
   * @returns {EventBus} Instância do event bus
   */
  getEventBus() {
    return this.eventBus;
  }

  /**
   * Helper para criar um selector (função que retorna parte do estado)
   * @param {Function} selector - Função que recebe o estado e retorna um valor
   * @returns {Function} Função que retorna o valor selecionado
   */
  createSelector(selector) {
    return () => selector(this.state);
  }

  /**
   * Obtém snapshot do estado atual
   * @returns {Object} Cópia do estado como objeto
   */
  getSnapshot() {
    const snapshot = {};
    this.state.forEach((value, key) => {
      snapshot[key] = value;
    });
    return snapshot;
  }

  /**
   * Restaura estado de um snapshot
   * @param {Object} snapshot - Snapshot do estado
   * @param {Object} options - Opções adicionais
   */
  restoreSnapshot(snapshot, options = {}) {
    const { silent = false } = options;
    const keys = Object.keys(snapshot);

    keys.forEach((key) => {
      this.set(key, snapshot[key], { silent });
    });

    // Notificar todas as mudanças de uma vez se não for silencioso
    if (!silent) {
      keys.forEach((key) => {
        this._notifySubscribers(key, snapshot[key], this.state.get(key));
      });
    }
  }
}

// Instância singleton do State Manager
export const stateManager = new StateManager();

// Exportar EventBus para uso direto se necessário
export { EventBus };

// Eventos padrão do sistema
export const STATE_EVENTS = {
  // Eventos de autenticação
  USER_LOGGED_IN: "user:logged_in",
  USER_LOGGED_OUT: "user:logged_out",
  USER_UPDATED: "user:updated",

  // Eventos de carrinho
  CART_UPDATED: "cart:updated",
  CART_CLEARED: "cart:cleared",
  CART_ITEM_ADDED: "cart:item_added",
  CART_ITEM_REMOVED: "cart:item_removed",
  CART_ITEM_UPDATED: "cart:item_updated",

  // Eventos de produtos
  PRODUCTS_LOADED: "products:loaded",
  PRODUCTS_UPDATED: "products:updated",
  PRODUCT_UPDATED: "product:updated",

  // Eventos de categorias
  CATEGORIES_LOADED: "categories:loaded",
  CATEGORIES_UPDATED: "categories:updated",

  // Eventos de pedidos
  ORDER_CREATED: "order:created",
  ORDER_UPDATED: "order:updated",
  ORDER_STATUS_CHANGED: "order:status_changed",

  // Eventos de configurações
  SETTINGS_UPDATED: "settings:updated",

  // Eventos de cache
  CACHE_INVALIDATED: "cache:invalidated",
  CACHE_CLEARED: "cache:cleared",
};

// Chaves padrão do estado
export const STATE_KEYS = {
  // Autenticação
  USER: "user",
  TOKEN: "token",
  IS_AUTHENTICATED: "is_authenticated",

  // Carrinho
  CART: "cart",
  CART_ITEMS: "cart_items",
  CART_TOTAL: "cart_total",

  // Produtos
  PRODUCTS: "products",
  PRODUCTS_BY_CATEGORY: "products_by_category",
  CURRENT_PRODUCT: "current_product",

  // Categorias
  CATEGORIES: "categories",
  ACTIVE_CATEGORY: "active_category",

  // Pedidos
  CURRENT_ORDER: "current_order",
  ORDER_HISTORY: "order_history",

  // Configurações
  SETTINGS: "settings",
  STORE_HOURS: "store_hours",

  // UI State
  LOADING: "loading",
  ERROR: "error",
  MODAL_OPEN: "modal_open",
};
