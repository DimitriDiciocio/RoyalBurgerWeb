// Sistema de verificação de conectividade com a API
import { checkConnectivity, API_BASE_URL } from '../api/api.js';
import { showToast } from './alerts.js';

class ConnectivityChecker {
    constructor() {
        this.isOnline = navigator.onLine;
        this.apiAvailable = null;
        this.checkInterval = null;
        this.retryCount = 0;
        this.maxRetries = 3;
        
        this.init();
    }

    init() {
        // Verificar conectividade inicial
        this.checkApiConnectivity();
        
        // Escutar mudanças de conectividade
        window.addEventListener('online', () => {
            this.isOnline = true;
            this.checkApiConnectivity();
        });
        
        window.addEventListener('offline', () => {
            this.isOnline = false;
            this.showOfflineMessage();
        });
        
        // Verificar periodicamente (a cada 30 segundos)
        this.checkInterval = setInterval(() => {
            if (this.isOnline) {
                this.checkApiConnectivity();
            }
        }, 30000);
    }

    async checkApiConnectivity() {
        if (!this.isOnline) {
            this.apiAvailable = false;
            return false;
        }

        try {
            const isConnected = await checkConnectivity();
            this.apiAvailable = isConnected;
            
            if (isConnected && this.retryCount > 0) {
                // API voltou a funcionar
                this.showReconnectedMessage();
                this.retryCount = 0;
            }
            
            return isConnected;
        } catch (error) {
            this.apiAvailable = false;
            this.retryCount++;
            
            if (this.retryCount === 1) {
                // Primeira falha - mostrar aviso
                this.showApiUnavailableMessage();
            }
            
            return false;
        }
    }

    showOfflineMessage() {
        showToast('Você está offline. Verifique sua conexão com a internet.', {
            type: 'warning',
            title: 'Sem Conexão',
            autoClose: 5000
        });
    }

    showApiUnavailableMessage() {
        showToast(
            `Não foi possível conectar ao servidor (${API_BASE_URL}). Verifique se a API está rodando.`,
            {
                type: 'error',
                title: 'Servidor Indisponível',
                autoClose: 8000
            }
        );
    }

    showReconnectedMessage() {
        showToast('Conexão com o servidor restaurada!', {
            type: 'success',
            title: 'Conectado',
            autoClose: 3000
        });
    }

    // Método para verificar se pode fazer requisições
    async canMakeRequests() {
        if (!this.isOnline) {
            throw new Error('Você está offline. Verifique sua conexão com a internet.');
        }
        
        if (this.apiAvailable === false) {
            throw new Error('Servidor indisponível. Verifique se a API está rodando.');
        }
        
        // Se não sabemos o status, verificar agora
        if (this.apiAvailable === null) {
            const isConnected = await this.checkApiConnectivity();
            if (!isConnected) {
                throw new Error('Servidor indisponível. Verifique se a API está rodando.');
            }
        }
        
        return true;
    }

    // Método para limpar recursos
    destroy() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
    }
}

// Instância global do verificador de conectividade
let connectivityChecker = null;

export function initConnectivityChecker() {
    if (!connectivityChecker) {
        connectivityChecker = new ConnectivityChecker();
    }
    return connectivityChecker;
}

export function getConnectivityChecker() {
    return connectivityChecker;
}

// Inicializar automaticamente quando o módulo for carregado
if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', initConnectivityChecker);
}
