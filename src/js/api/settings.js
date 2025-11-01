/**
 * API de Configurações
 * Gerencia operações relacionadas às configurações do sistema
 */

import { apiRequest } from './api.js';

// Cache local para configurações públicas (TTL de 5 minutos)
const PUBLIC_SETTINGS_CACHE = {
    data: null,
    timestamp: null,
    ttl: 5 * 60 * 1000 // 5 minutos em milissegundos
};

/**
 * Verifica se o cache está válido
 * @returns {boolean} True se o cache ainda é válido
 */
function isCacheValid() {
    if (!PUBLIC_SETTINGS_CACHE.data || !PUBLIC_SETTINGS_CACHE.timestamp) {
        return false;
    }
    const elapsed = Date.now() - PUBLIC_SETTINGS_CACHE.timestamp;
    return elapsed < PUBLIC_SETTINGS_CACHE.ttl;
}

/**
 * Invalida o cache de configurações públicas
 */
function invalidatePublicCache() {
    PUBLIC_SETTINGS_CACHE.data = null;
    PUBLIC_SETTINGS_CACHE.timestamp = null;
}

/**
 * Busca configurações públicas (sem autenticação)
 * @returns {Promise<Object>} Resultado da operação com as configurações públicas
 */
export async function getPublicSettings(useCache = true) {
    try {
        // Verifica cache antes de fazer requisição
        if (useCache && isCacheValid()) {
            return {
                success: true,
                data: PUBLIC_SETTINGS_CACHE.data,
                fromCache: true
            };
        }

        const data = await apiRequest('/api/settings/public', {
            method: 'GET',
            skipAuth: true // Endpoint público não requer autenticação
        });

        // Atualiza cache
        PUBLIC_SETTINGS_CACHE.data = data;
        PUBLIC_SETTINGS_CACHE.timestamp = Date.now();

        return {
            success: true,
            data: data,
            fromCache: false
        };
    } catch (error) {
        // Log apenas em desenvolvimento para evitar exposição de erros em produção
        const isDev = typeof process !== 'undefined' && process.env?.NODE_ENV === 'development';
        if (isDev) {
            console.error('Erro ao buscar configurações públicas:', error.message);
        }
        
        // Se falhou, tenta retornar cache antigo como fallback
        if (PUBLIC_SETTINGS_CACHE.data) {
            if (isDev) {
                console.warn('Usando cache antigo devido a erro na API');
            }
            return {
                success: true,
                data: PUBLIC_SETTINGS_CACHE.data,
                fromCache: true,
                warning: 'Dados podem estar desatualizados'
            };
        }
        
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Busca todas as configurações atuais (admin)
 * @returns {Promise<Object>} Resultado da operação com as configurações
 */
export async function getAllSettings() {
    try {
        const data = await apiRequest('/api/settings/', {
            method: 'GET'
        });

        // Backend retorna diretamente o objeto de configurações ou {settings: {...}}
        // Aceita ambos os formatos para compatibilidade
        const settings = data.settings || data || {};

        return {
            success: true,
            data: settings
        };
    } catch (error) {
        // Log apenas em desenvolvimento
        const isDev = typeof process !== 'undefined' && process.env?.NODE_ENV === 'development';
        if (isDev) {
            console.error('Erro ao buscar configurações:', error.message);
        }
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Atualiza configurações (atualiza registro existente ou cria se não existir)
 * @param {Object} settingsData - Dados das configurações a serem atualizadas (campos parciais são permitidos)
 * @param {number} [settingsData.meta_receita_mensal] - Meta de receita mensal
 * @param {number} [settingsData.meta_pedidos_mensais] - Meta de pedidos mensais
 * @param {number} [settingsData.prazo_iniciacao] - Prazo de iniciação
 * @param {number} [settingsData.prazo_preparo] - Prazo de preparo
 * @param {number} [settingsData.prazo_envio] - Prazo de envio
 * @param {number} [settingsData.prazo_entrega] - Prazo de entrega
 * @param {number} [settingsData.taxa_entrega] - Taxa de entrega
 * @param {number} [settingsData.taxa_conversao_ganho_clube] - Taxa de conversão de ganho do clube
 * @param {number} [settingsData.taxa_conversao_resgate_clube] - Taxa de conversão de resgate do clube
 * @param {number} [settingsData.taxa_expiracao_pontos_clube] - Taxa de expiração de pontos
 * @param {string} [settingsData.nome_fantasia] - Nome fantasia
 * @param {string} [settingsData.razao_social] - Razão social
 * @param {string} [settingsData.cnpj] - CNPJ
 * @param {string} [settingsData.endereco] - Endereço
 * @param {string} [settingsData.telefone] - Telefone
 * @param {string} [settingsData.email] - E-mail
 * @returns {Promise<Object>} Resultado da operação
 */
export async function updateSettings(settingsData) {
    try {
        if (!settingsData || typeof settingsData !== 'object') {
            throw new Error('Dados das configurações são obrigatórios');
        }

        const data = await apiRequest('/api/settings/', {
            method: 'POST',
            body: settingsData
        });

        // Backend retorna True/False (booleano) ou {success: true}
        // Aceita ambos os formatos para compatibilidade
        const success = typeof data === 'boolean' ? data : (data.success !== false);

        // Invalida cache de configurações públicas após atualização
        // O backend tem cache de 5 minutos, mas garantimos que frontend também atualize
        invalidatePublicCache();

        return {
            success: success,
            data: data
        };
    } catch (error) {
        // Log apenas em desenvolvimento
        const isDev = typeof process !== 'undefined' && process.env?.NODE_ENV === 'development';
        if (isDev) {
            console.error('Erro ao atualizar configurações:', error.message);
        }
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Busca o histórico de configurações
 * @returns {Promise<Object>} Resultado da operação com o histórico
 */
export async function getSettingsHistory() {
    try {
        const data = await apiRequest('/api/settings/history', {
            method: 'GET'
        });

        // Backend retorna lista diretamente ou {history: [...]}
        // Aceita ambos os formatos para compatibilidade
        const history = Array.isArray(data) ? data : (data.history || []);

        return {
            success: true,
            data: history
        };
    } catch (error) {
        // Log apenas em desenvolvimento
        const isDev = typeof process !== 'undefined' && process.env?.NODE_ENV === 'development';
        if (isDev) {
            console.error('Erro ao buscar histórico de configurações:', error.message);
        }
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Faz rollback para uma versão anterior das configurações
 * @param {number} historyId - ID da versão do histórico para restaurar
 * @returns {Promise<Object>} Resultado da operação
 */
export async function rollbackSetting(historyId) {
    try {
        if (!historyId || !Number.isInteger(Number(historyId))) {
            throw new Error('ID do histórico inválido');
        }

        const data = await apiRequest('/api/settings/rollback', {
            method: 'POST',
            body: {
                history_id: Number(historyId)
            }
        });

        // Backend retorna True/False (booleano) ou {success: true}
        // Aceita ambos os formatos para compatibilidade
        const success = typeof data === 'boolean' ? data : (data.success !== false);

        // Invalida cache de configurações públicas após rollback
        invalidatePublicCache();

        return {
            success: success,
            data: data
        };
    } catch (error) {
        // Log apenas em desenvolvimento
        const isDev = typeof process !== 'undefined' && process.env?.NODE_ENV === 'development';
        if (isDev) {
            console.error('Erro ao fazer rollback das configurações:', error.message);
        }
        return {
            success: false,
            error: error.message
        };
    }
}

