/**
 * Helper para configurações públicas do sistema
 * Centraliza acesso a configurações com cache e fallbacks
 * 
 * NOTE: Cache de TTL de 5 minutos é gerenciado por ../api/settings.js
 */

import { getPublicSettings } from '../api/settings.js';

/**
 * Carrega configurações públicas do sistema
 * @param {boolean} forceRefresh - Se true, força reload ignorando cache
 * @returns {Promise<Object>} Configurações públicas
 */
export async function loadPublicSettings(forceRefresh = false) {
    try {
        const result = await getPublicSettings(!forceRefresh); // useCache = !forceRefresh
        
        if (result.success && result.data) {
            return result.data;
        }

        // Se falhou, retorna valores padrão
        return getDefaultSettings();
    } catch (error) {
        // Log apenas em desenvolvimento para evitar exposição em produção
        if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'development') {
            console.error('Erro ao carregar configurações públicas:', error);
        }
        return getDefaultSettings();
    }
}

/**
 * Retorna valores padrão caso a API falhe
 * 
 * IMPORTANTE: Estes são apenas fallbacks. Os dados REAIS vêm da API via `/api/settings/public`.
 * Estes valores só são usados se a API estiver indisponível ou retornar erro.
 * 
 * @returns {Object} Configurações padrão (fallback apenas)
 */
function getDefaultSettings() {
    return {
        delivery_fee: 0,
        estimated_delivery_time: {
            initiation_minutes: 5,
            preparation_minutes: 20,
            dispatch_minutes: 5,
            delivery_minutes: 15
        },
        company_info: {
            nome_fantasia: 'Royal Burger',
            razao_social: '',
            cnpj: '',
            endereco: '',
            telefone: '',
            email: ''
        },
        loyalty_rates: {
            gain_rate: 0.10, // R$ 0,10 = 1 ponto (10 pontos por real)
            redemption_rate: 0.01,
            expiration_days: 60
        }
    };
}

/**
 * Invalida o cache de configurações públicas
 * Útil após atualizações no admin
 * 
 * NOTE: O cache real está em ../api/settings.js e é invalidado automaticamente
 * após updateSettings() e rollbackSetting()
 */
export function invalidateSettingsCache() {
    // Função mantida para compatibilidade, mas o cache real está em settings.js
    // e é automaticamente invalidado após atualizações no admin
}

/**
 * Obtém a taxa de entrega atual
 * @returns {Promise<number>} Taxa de entrega em reais
 */
export async function getDeliveryFee() {
    const settings = await loadPublicSettings();
    return settings.delivery_fee || 0;
}

/**
 * Obtém os prazos de entrega estimados
 * @returns {Promise<Object>} Prazos em minutos
 */
export async function getEstimatedDeliveryTimes() {
    const settings = await loadPublicSettings();
    return settings.estimated_delivery_time;
}

/**
 * Obtém informações da empresa
 * @returns {Promise<Object>} Informações da empresa
 */
export async function getCompanyInfo() {
    const settings = await loadPublicSettings();
    return settings.company_info;
}

/**
 * Calcula o tempo estimado total de entrega baseado no status
 * @param {string} status - Status do pedido
 * @param {string} orderType - Tipo do pedido ('delivery' ou 'pickup')
 * @returns {Promise<number>} Tempo total estimado em minutos
 */
export async function calculateEstimatedTime(status, orderType = 'delivery') {
    const times = await getEstimatedDeliveryTimes();
    
    let totalMinutes = 0;
    
    // Pending: inclui tudo
    if (status === 'pending') {
        totalMinutes = 
            (times.initiation_minutes || 5) +
            (times.preparation_minutes || 20) +
            (times.dispatch_minutes || 5) +
            (times.delivery_minutes || 15);
    }
    // Preparing/confirmed: exclui iniciacao
    else if (status === 'preparing' || status === 'confirmed') {
        totalMinutes = 
            (times.preparation_minutes || 20) +
            (times.dispatch_minutes || 5) +
            (times.delivery_minutes || 15);
    }
    // Ready: apenas envio e entrega
    else if (status === 'ready') {
        totalMinutes = 
            (times.dispatch_minutes || 5) +
            (times.delivery_minutes || 15);
    }
    // On the way: apenas entrega
    else if (status === 'on_the_way' || status === 'out_for_delivery') {
        totalMinutes = times.delivery_minutes || 15;
    }
    // Completed/Delivered: tempo zero
    else if (status === 'completed' || status === 'delivered') {
        totalMinutes = 0;
    }
    
    // Para pickup, remover tempo de entrega
    if (orderType === 'pickup' && status !== 'completed' && status !== 'delivered') {
        totalMinutes -= (times.delivery_minutes || 15);
    }
    
    return Math.max(0, totalMinutes);
}

/**
 * Calcula o tempo estimado de entrega considerando o tempo de preparo específico do produto
 * Fórmula: Iniciação + Preparo do Produto + Envio + Entrega
 * @param {number} productPreparationTime - Tempo de preparo do produto em minutos (0 = usa padrão do sistema)
 * @param {string} orderType - Tipo do pedido ('delivery' ou 'pickup'). Padrão: 'delivery'
 * @returns {Promise<Object>} Objeto com minTime e maxTime em minutos
 */
export async function calculateEstimatedDeliveryTimeWithProduct(productPreparationTime = 0, orderType = 'delivery') {
    const times = await getEstimatedDeliveryTimes();
    
    // Extrair prazos do sistema (com fallbacks)
    const initiation = times.initiation_minutes || 5;
    const systemPreparation = times.preparation_minutes || 20; // Fallback se produto não tiver tempo
    const dispatch = times.dispatch_minutes || 5;
    const delivery = orderType === 'delivery' ? (times.delivery_minutes || 15) : 0;
    
    // Usar tempo de preparo do produto se fornecido, senão usar o padrão do sistema
    const preparation = productPreparationTime > 0 ? productPreparationTime : systemPreparation;
    
    // Calcular tempo total: Iniciação + Preparo do Produto + Envio + Entrega
    const totalMinutes = initiation + preparation + dispatch + delivery;
    
    // Tempo mínimo = soma dos prazos
    const minTime = totalMinutes;
    
    // Tempo máximo = soma dos prazos + 15 minutos (margem de segurança)
    const maxTime = totalMinutes + 15;
    
    return { minTime, maxTime };
}

/**
 * Calcula o tempo estimado de entrega considerando o maior tempo de preparo entre múltiplos produtos
 * Fórmula: Iniciação + Maior Preparo dos Produtos + Envio + Entrega
 * @param {Array<Object>} products - Array de produtos com preparation_time_minutes
 * @param {string} orderType - Tipo do pedido ('delivery' ou 'pickup'). Padrão: 'delivery'
 * @returns {Promise<Object>} Objeto com minTime e maxTime em minutos
 */
export async function calculateEstimatedDeliveryTimeWithProducts(products = [], orderType = 'delivery') {
    const times = await getEstimatedDeliveryTimes();
    
    // Extrair prazos do sistema (com fallbacks)
    const initiation = times.initiation_minutes || 5;
    const systemPreparation = times.preparation_minutes || 20; // Fallback padrão
    const dispatch = times.dispatch_minutes || 5;
    const delivery = orderType === 'delivery' ? (times.delivery_minutes || 15) : 0;
    
    // Encontrar o maior tempo de preparo entre os produtos
    let maxProductPreparation = 0;
    if (Array.isArray(products) && products.length > 0) {
        products.forEach(product => {
            const prepTime = product.preparation_time_minutes || product.preparationTime || 0;
            if (prepTime > maxProductPreparation) {
                maxProductPreparation = prepTime;
            }
        });
    }
    
    // Usar o maior tempo de preparo dos produtos, ou o padrão do sistema se não houver produtos
    const preparation = maxProductPreparation > 0 ? maxProductPreparation : systemPreparation;
    
    // Calcular tempo total: Iniciação + Maior Preparo + Envio + Entrega
    const totalMinutes = initiation + preparation + dispatch + delivery;
    
    // Tempo mínimo = soma dos prazos
    const minTime = totalMinutes;
    
    // Tempo máximo = soma dos prazos + 15 minutos (margem de segurança)
    const maxTime = totalMinutes + 15;
    
    return { minTime, maxTime };
}

/**
 * Calcula pontos que o cliente vai ganhar em uma compra
 * @param {number} orderTotal - Total do pedido em reais
 * @returns {Promise<number>} Pontos a serem ganhos
 */
export async function calculatePointsEarned(orderTotal) {
    // IMPORTANTE: Dados vêm da API via loadPublicSettings()
    // Não usa valores fixos - apenas fallbacks se API falhar
    const settings = await loadPublicSettings();
    const gainRate = settings.loyalty_rates?.gain_rate;
    
    // Validação: gainRate deve ser um número positivo
    if (!gainRate || isNaN(gainRate) || gainRate <= 0) {
        // Log apenas em desenvolvimento para identificar problemas de configuração
        if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'development') {
            console.warn('gain_rate inválido da API:', gainRate, 'Usando fallback 0.10');
        }
        // Fallback apenas se a API não retornar um valor válido
        const fallbackRate = 0.10; // R$ 0,10 = 1 ponto
        return Math.floor(orderTotal / fallbackRate);
    }
    
    // Alerta em desenvolvimento se detectar valor suspeito (0.01 quando deveria ser 0.10)
    // Isso ajuda a identificar quando a configuração no banco está incorreta
    if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'development') {
        if (gainRate === 0.01) {
            console.warn(
                '⚠️ ATENÇÃO: gain_rate = 0.01 detectado da API. ' +
                'Isso resulta em 10x mais pontos do que o esperado (ex: 1900 em vez de 190). ' +
                'Verifique se a configuração no painel admin está como R$ 0,10 (não R$ 0,01).'
            );
        }
    }
    
    // gainRate é quanto o cliente precisa gastar para ganhar 1 ponto
    // Exemplo: 0.10 = R$ 0,10 = 1 ponto (ou seja, 10 pontos por real gasto)
    // Cálculo: R$ 19,00 / R$ 0,10 = 190 pontos
    // NOTA: Se a API retornar 0.01, resultará em 1900 pontos - verifique a configuração no painel admin
    return Math.floor(orderTotal / gainRate);
}

/**
 * Calcula desconto em reais baseado em pontos (com taxa configurável)
 * @param {number} pointsToRedeem - Pontos a resgatar
 * @returns {Promise<number>} Desconto em reais
 */
export async function calculateDiscountFromPointsConfigurable(pointsToRedeem) {
    const settings = await loadPublicSettings();
    const redemptionRate = settings.loyalty_rates?.redemption_rate || 0.01;
    
    // redemptionRate é o valor de 1 ponto (ex: 0.01 = 1 ponto = R$ 0,01)
    return pointsToRedeem * redemptionRate;
}

/**
 * Obtém configurações de fidelidade (taxas e expiração)
 * @returns {Promise<Object>} Configurações de fidelidade
 */
export async function getLoyaltySettings() {
    // Busca configurações da API (não usa valores fixos)
    const settings = await loadPublicSettings();
    
    // Retorna valores da API se disponíveis, senão fallback
    return settings.loyalty_rates || {
        gain_rate: 0.10, // R$ 0,10 = 1 ponto (fallback apenas se API não retornar)
        redemption_rate: 0.01,
        expiration_days: 60
    };
}

/**
 * Formata taxa de entrega para exibição
 * @returns {Promise<string>} Taxa formatada
 */
export async function formatDeliveryFee() {
    const fee = await getDeliveryFee();
    return fee.toLocaleString('pt-BR', { 
        style: 'currency', 
        currency: 'BRL',
        minimumFractionDigits: 2
    });
}

/**
 * Precarrega configurações ao iniciar o app
 * Chamar em páginas públicas (home, produto, cesta, etc)
 * 
 * NOTE: Esta função inicia o carregamento mas não aguarda conclusão.
 * Para garantir que as configurações estejam disponíveis, use loadPublicSettings() com await.
 */
export function preloadSettings() {
    // Fazer fire-and-forget para precarregar configurações
    loadPublicSettings().catch(() => {
        // Silenciosamente ignora erros no precarregamento
        // Os fallbacks serão usados se necessário
    });
}

