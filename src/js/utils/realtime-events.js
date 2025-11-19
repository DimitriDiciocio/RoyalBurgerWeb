/**
 * Cliente de Eventos em Tempo Real via SSE (Server-Sent Events)
 * ALTERAÇÃO: Implementado para atualizações automáticas no frontend
 */
import { API_BASE_URL } from '../api/api.js';
import { showToast } from '../ui/alerts.js';

class RealtimeEventsClient {
    constructor() {
        this.eventSource = null;
        this.listeners = new Map();
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 3000; // 3 segundos
        this.isConnected = false;
        this.reconnectTimer = null;
    }

    /**
     * Conecta ao stream de eventos SSE
     * ALTERAÇÃO: Implementado com reconexão automática
     */
    connect() {
        if (this.eventSource && this.eventSource.readyState !== EventSource.CLOSED) {
            return; // Já está conectado
        }

        try {
            // ALTERAÇÃO: Obter token JWT do localStorage
            const token = localStorage.getItem('token');
            if (!token) {
                // ALTERAÇÃO: Removido console.warn - usar apenas em desenvolvimento
                const isDev = typeof process !== "undefined" && process.env?.NODE_ENV === "development";
                if (isDev) {
                    // eslint-disable-next-line no-console
                    console.warn('Token não encontrado. SSE não será conectado.');
                }
                return;
            }

            // ALTERAÇÃO: Criar EventSource com autenticação via query param
            // (SSE não suporta headers customizados)
            const url = `${API_BASE_URL}/api/events/stream?token=${encodeURIComponent(token)}`;
            this.eventSource = new EventSource(url);

            this.eventSource.onopen = () => {
                this.isConnected = true;
                this.reconnectAttempts = 0;
                // ALTERAÇÃO: Log apenas em desenvolvimento - removido console.log em produção
                const isDev = typeof process !== "undefined" && process.env?.NODE_ENV === "development";
                if (isDev) {
                    // eslint-disable-next-line no-console
                    console.log('Conectado ao stream de eventos em tempo real');
                }
                
                // ALTERAÇÃO: Notificar listeners de conexão
                this._notifyListeners('connected', { connected: true });
            };

            this.eventSource.onerror = (error) => {
                // ALTERAÇÃO: Log apenas em desenvolvimento - removido console.error em produção
                const isDev = typeof process !== "undefined" && process.env?.NODE_ENV === "development";
                if (isDev) {
                    // eslint-disable-next-line no-console
                    console.error('Erro no stream de eventos:', error);
                }
                this.isConnected = false;
                this._handleReconnect();
            };

            // ALTERAÇÃO: Escutar eventos do servidor
            this.eventSource.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    this._handleEvent(data);
                } catch (e) {
                    // ALTERAÇÃO: Log apenas em desenvolvimento - removido console.error em produção
                    const isDev = typeof process !== "undefined" && process.env?.NODE_ENV === "development";
                    if (isDev) {
                        // eslint-disable-next-line no-console
                        console.error('Erro ao processar evento:', e);
                    }
                }
            };

            // ALTERAÇÃO: Escutar eventos específicos por tipo
            this._setupEventListeners();

        } catch (error) {
            // ALTERAÇÃO: Log apenas em desenvolvimento - removido console.error em produção
            const isDev = typeof process !== "undefined" && process.env?.NODE_ENV === "development";
            if (isDev) {
                // eslint-disable-next-line no-console
                console.error('Erro ao conectar ao stream de eventos:', error);
            }
            this._handleReconnect();
        }
    }

    /**
     * Configura listeners para eventos específicos
     * ALTERAÇÃO: Escuta eventos por tipo usando addEventListener
     */
    _setupEventListeners() {
        // Eventos de compras
        this.eventSource.addEventListener('purchase.created', (event) => {
            const data = JSON.parse(event.data);
            this._handleEvent({ type: 'purchase.created', data: data.data });
        });

        this.eventSource.addEventListener('purchase.updated', (event) => {
            const data = JSON.parse(event.data);
            this._handleEvent({ type: 'purchase.updated', data: data.data });
        });

        // Eventos de movimentações financeiras
        this.eventSource.addEventListener('financial_movement.created', (event) => {
            const data = JSON.parse(event.data);
            this._handleEvent({ type: 'financial_movement.created', data: data.data });
        });

        this.eventSource.addEventListener('financial_movement.payment_status_updated', (event) => {
            const data = JSON.parse(event.data);
            this._handleEvent({ type: 'financial_movement.payment_status_updated', data: data.data });
        });
    }

    /**
     * Processa evento recebido
     * ALTERAÇÃO: Distribui evento para listeners registrados
     */
    _handleEvent(event) {
        const { type, data } = event;
        
        // ALTERAÇÃO: Notificar listeners específicos do tipo
        if (this.listeners.has(type)) {
            this.listeners.get(type).forEach(callback => {
                try {
                    callback(data);
                } catch (e) {
                    // ALTERAÇÃO: Log apenas em desenvolvimento - removido console.error em produção
                    const isDev = typeof process !== "undefined" && process.env?.NODE_ENV === "development";
                    if (isDev) {
                        // eslint-disable-next-line no-console
                        console.error(`Erro ao executar listener para ${type}:`, e);
                    }
                }
            });
        }

        // ALTERAÇÃO: Notificar listeners genéricos (ex: 'purchase.*')
        for (const [pattern, callbacks] of this.listeners.entries()) {
            if (pattern.endsWith('*') && type.startsWith(pattern.slice(0, -1))) {
                callbacks.forEach(callback => {
                    try {
                        callback(data);
                    } catch (e) {
                        // ALTERAÇÃO: Log apenas em desenvolvimento - removido console.error em produção
                        const isDev = typeof process !== "undefined" && process.env?.NODE_ENV === "development";
                        if (isDev) {
                            // eslint-disable-next-line no-console
                            console.error(`Erro ao executar listener genérico para ${pattern}:`, e);
                        }
                    }
                });
            }
        }
    }

    /**
     * Registra listener para um tipo de evento
     * ALTERAÇÃO: Suporta padrões (ex: 'purchase.*')
     */
    on(eventType, callback) {
        if (!this.listeners.has(eventType)) {
            this.listeners.set(eventType, []);
        }
        this.listeners.get(eventType).push(callback);
    }

    /**
     * Remove listener
     */
    off(eventType, callback) {
        if (this.listeners.has(eventType)) {
            const callbacks = this.listeners.get(eventType);
            const index = callbacks.indexOf(callback);
            if (index > -1) {
                callbacks.splice(index, 1);
            }
        }
    }

    /**
     * Notifica listeners internos
     */
    _notifyListeners(eventType, data) {
        if (this.listeners.has(eventType)) {
            this.listeners.get(eventType).forEach(callback => {
                try {
                    callback(data);
                } catch (e) {
                    // ALTERAÇÃO: Log apenas em desenvolvimento - removido console.error em produção
                    const isDev = typeof process !== "undefined" && process.env?.NODE_ENV === "development";
                    if (isDev) {
                        // eslint-disable-next-line no-console
                        console.error(`Erro ao notificar listener:`, e);
                    }
                }
            });
        }
    }

    /**
     * Trata reconexão automática
     * ALTERAÇÃO: Implementado backoff exponencial
     */
    _handleReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            // ALTERAÇÃO: Log apenas em desenvolvimento - removido console.error em produção
            const isDev = typeof process !== "undefined" && process.env?.NODE_ENV === "development";
            if (isDev) {
                // eslint-disable-next-line no-console
                console.error('Máximo de tentativas de reconexão atingido');
            }
            showToast('Conexão com eventos em tempo real perdida. Recarregue a página.', {
                type: 'warning',
                title: 'Conexão Perdida'
            });
            return;
        }

        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
        }

        this.reconnectAttempts++;
        const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1); // Backoff exponencial

        // ALTERAÇÃO: Log apenas em desenvolvimento - removido console.log em produção
        const isDev = typeof process !== "undefined" && process.env?.NODE_ENV === "development";
        if (isDev) {
            // eslint-disable-next-line no-console
            console.log(`Tentando reconectar em ${delay}ms (tentativa ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
        }

        this.reconnectTimer = setTimeout(() => {
            this.disconnect();
            this.connect();
        }, delay);
    }

    /**
     * Desconecta do stream
     */
    disconnect() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        if (this.eventSource) {
            this.eventSource.close();
            this.eventSource = null;
        }

        this.isConnected = false;
    }
}

// ALTERAÇÃO: Instância global do cliente de eventos
let realtimeClient = null;

/**
 * Obtém ou cria instância do cliente de eventos
 * ALTERAÇÃO: Singleton para garantir uma única conexão
 */
export function getRealtimeClient() {
    if (!realtimeClient) {
        realtimeClient = new RealtimeEventsClient();
    }
    return realtimeClient;
}

/**
 * Inicializa cliente de eventos em tempo real
 * ALTERAÇÃO: Deve ser chamado após login
 */
export function initRealtimeEvents() {
    const client = getRealtimeClient();
    if (!client.isConnected) {
        client.connect();
    }
}

/**
 * Desconecta cliente de eventos
 * ALTERAÇÃO: Deve ser chamado no logout
 */
export function disconnectRealtimeEvents() {
    if (realtimeClient) {
        realtimeClient.disconnect();
    }
}

