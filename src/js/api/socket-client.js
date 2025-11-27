/**
 * Cliente WebSocket para comunicação em tempo real com a API
 * Singleton que gerencia a conexão Socket.IO
 */

import { getStoredToken } from './api.js';
import { API_BASE_URL } from './api.js';

class SocketClient {
    constructor() {
        this.socket = null;
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
    }

    /**
     * Conecta ao servidor WebSocket
     */
    connect() {
        // Evita múltiplas conexões
        if (this.socket && this.socket.connected) {
            console.log('🟢 WebSocket já está conectado');
            return;
        }

        const token = getStoredToken();
        
        if (!token) {
            console.warn('⚠️ Socket: Tentativa de conexão sem token.');
            return;
        }

        // Verifica se io está disponível (do CDN ou import)
        // ALTERAÇÃO: Verificar tanto window.io quanto io global
        const ioFunction = typeof window !== 'undefined' && window.io ? window.io : (typeof io !== 'undefined' ? io : null);
        
        if (!ioFunction) {
            console.error('❌ Socket.IO não está disponível. Certifique-se de que o CDN foi carregado.');
            console.error('💡 Dica: Adicione <script src="https://cdn.socket.io/4.7.2/socket.io.min.js"></script> antes dos scripts do módulo.');
            
            // ALTERAÇÃO: Tentar carregar dinamicamente se não estiver disponível
            if (typeof window !== 'undefined' && !window.io) {
                console.log('🔄 Tentando carregar Socket.IO dinamicamente...');
                const script = document.createElement('script');
                script.src = 'https://cdn.socket.io/4.7.2/socket.io.min.js';
                script.onload = () => {
                    console.log('✅ Socket.IO carregado dinamicamente. Tentando conectar novamente...');
                    setTimeout(() => this.connect(), 500); // Tentar conectar após carregar
                };
                script.onerror = () => {
                    console.error('❌ Erro ao carregar Socket.IO dinamicamente.');
                };
                document.head.appendChild(script);
            }
            return;
        }

        try {
            // Inicializa o socket
            // ALTERAÇÃO: Usar ioFunction que já foi verificado acima
            const ioToUse = typeof window !== 'undefined' && window.io ? window.io : io;
            this.socket = ioToUse(API_BASE_URL, {
                auth: {
                    token: token // O backend espera o token sem 'Bearer' prefix no auth
                },
                transports: ['websocket', 'polling'], // Fallback para polling se websocket falhar
                reconnection: true,
                reconnectionDelay: 1000,
                reconnectionDelayMax: 5000,
                reconnectionAttempts: this.maxReconnectAttempts,
                timeout: 20000
            });

            this.setupEventHandlers();
        } catch (error) {
            console.error('❌ Erro ao inicializar Socket.IO:', error);
        }
    }

    /**
     * Configura os handlers de eventos do socket
     */
    setupEventHandlers() {
        if (!this.socket) return;

        this.socket.on('connect', () => {
            console.log('🟢 WebSocket Conectado! ID:', this.socket.id);
            this.isConnected = true;
            this.reconnectAttempts = 0;
            
            // Emite evento customizado para notificar outros módulos
            window.dispatchEvent(new CustomEvent('socket:connected', { 
                detail: { socketId: this.socket.id } 
            }));
        });

        this.socket.on('disconnect', (reason) => {
            console.log('🔴 WebSocket Desconectado. Motivo:', reason);
            this.isConnected = false;
            
            // Emite evento customizado
            window.dispatchEvent(new CustomEvent('socket:disconnected', { 
                detail: { reason } 
            }));
        });

        this.socket.on('connect_error', (error) => {
            console.error('❌ Socket Erro de Conexão:', error);
            this.reconnectAttempts++;
            
            // Emite evento customizado
            window.dispatchEvent(new CustomEvent('socket:error', { 
                detail: { error, attempts: this.reconnectAttempts } 
            }));

            // Se exceder tentativas, tenta reconectar manualmente
            if (this.reconnectAttempts >= this.maxReconnectAttempts) {
                console.warn('⚠️ Máximo de tentativas de reconexão atingido. Desconectando...');
                this.disconnect();
            }
        });

        this.socket.on('system_connected', (data) => {
            console.log('✅ Sistema conectado:', data);
            // Emite evento customizado
            window.dispatchEvent(new CustomEvent('socket:system_connected', { 
                detail: data 
            }));
        });

        this.socket.on('reconnect', (attemptNumber) => {
            console.log('🔄 WebSocket Reconectado após', attemptNumber, 'tentativas');
            this.isConnected = true;
            this.reconnectAttempts = 0;
            
            window.dispatchEvent(new CustomEvent('socket:reconnected', { 
                detail: { attempts: attemptNumber } 
            }));
        });
    }

    /**
     * Desconecta do servidor WebSocket
     */
    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
            this.isConnected = false;
            console.log('🔌 WebSocket desconectado manualmente');
        }
    }

    /**
     * Método genérico para ouvir eventos
     * @param {string} eventName - Nome do evento
     * @param {Function} callback - Função callback
     */
    on(eventName, callback) {
        if (!this.socket) {
            console.warn('⚠️ Socket não inicializado. Chame connect() primeiro.');
            return;
        }
        this.socket.on(eventName, callback);
    }

    /**
     * Método para parar de ouvir um evento específico
     * @param {string} eventName - Nome do evento
     * @param {Function} callback - Função callback (opcional, se não fornecido remove todos)
     */
    off(eventName, callback) {
        if (this.socket) {
            if (callback) {
                this.socket.off(eventName, callback);
            } else {
                this.socket.off(eventName);
            }
        }
    }

    /**
     * Emite um evento para o servidor
     * @param {string} eventName - Nome do evento
     * @param {any} data - Dados a serem enviados
     */
    emit(eventName, data) {
        if (!this.socket || !this.isConnected) {
            console.warn('⚠️ Socket não está conectado. Não é possível emitir evento:', eventName);
            return;
        }
        this.socket.emit(eventName, data);
    }

    /**
     * Verifica se o socket está conectado
     * @returns {boolean}
     */
    getConnected() {
        return this.isConnected && this.socket && this.socket.connected;
    }
}

// Exporta uma instância única (Singleton)
export const socketService = new SocketClient();

