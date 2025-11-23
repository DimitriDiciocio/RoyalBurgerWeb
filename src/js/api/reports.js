/**
 * API de Relatórios
 * Funções para interagir com endpoints de relatórios
 */

import { apiRequest } from './api.js';

/**
 * Busca lista de relatórios disponíveis
 * @returns {Promise<Object>} Lista de relatórios disponíveis
 */
export async function getAvailableReports() {
    try {
        const data = await apiRequest('/api/pdf_reports/available', {
            method: 'GET'
        });

        return {
            success: true,
            data: data.available_reports || [],
            total: data.total || 0
        };
    } catch (error) {
        // ALTERAÇÃO: Log condicional apenas em modo debug
        if (typeof window !== 'undefined' && window.DEBUG_MODE) {
            const isDev = typeof process !== "undefined" && process.env?.NODE_ENV === "development";
            if (isDev) {
                // eslint-disable-next-line no-console
                console.error('[API] Erro ao buscar relatórios disponíveis:', error);
            }
        }
        return {
            success: false,
            error: error.message,
            data: []
        };
    }
}

/**
 * Gera relatório financeiro detalhado (JSON)
 * @param {string} startDate - Data de início (formato DD-MM-YYYY)
 * @param {string} endDate - Data de fim (formato DD-MM-YYYY)
 * @returns {Promise<Object>} Relatório financeiro detalhado
 */
export async function getDetailedFinancialReport(startDate, endDate) {
    try {
        const data = await apiRequest(
            `/api/reports/financial/detailed?start_date=${startDate}&end_date=${endDate}`,
            {
                method: 'GET'
            }
        );

        return {
            success: true,
            data: data
        };
    } catch (error) {
        // ALTERAÇÃO: Log condicional apenas em modo debug
        if (typeof window !== 'undefined' && window.DEBUG_MODE) {
            const isDev = typeof process !== "undefined" && process.env?.NODE_ENV === "development";
            if (isDev) {
                // eslint-disable-next-line no-console
                console.error('[API] Erro ao buscar relatório financeiro:', error);
            }
        }
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Converte data de formato ISO (YYYY-MM-DD) para brasileiro (DD-MM-YYYY)
 * @param {string} dateISO - Data em formato ISO
 * @returns {string|null} Data em formato brasileiro ou null
 */
function convertDateToBR(dateISO) {
    if (!dateISO) return null;
    
    // Se já está no formato DD-MM-YYYY, retornar como está
    const partsBR = dateISO.split('-');
    if (partsBR.length === 3 && partsBR[0].length === 2 && partsBR[2].length === 4) {
        // Validar se é realmente DD-MM-YYYY
        const day = parseInt(partsBR[0], 10);
        const month = parseInt(partsBR[1], 10);
        if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
            return dateISO;
        }
    }
    
    // Se está no formato YYYY-MM-DD (ISO), converter
    const parts = dateISO.split('-');
    if (parts.length === 3 && parts[0].length === 4) {
        const [year, month, day] = parts;
        return `${day}-${month}-${year}`;
    }
    
    return dateISO;
}

/**
 * Gera relatório em PDF
 * @param {string} reportType - Tipo de relatório (ex: 'sales_detailed', 'financial_complete')
 * @param {Object} filters - Filtros do relatório
 * @returns {Promise<Object>} Resultado com blob do PDF ou erro
 */
export async function generatePDFReport(reportType, filters = {}) {
    try {
        // Mapear tipo de relatório para endpoint e método HTTP
        const endpointMap = {
            'sales_detailed': { endpoint: '/api/pdf_reports/sales/detailed', method: 'POST' },
            'orders_performance': { endpoint: '/api/pdf_reports/orders/performance', method: 'POST' },
            'products_analysis': { endpoint: '/api/pdf_reports/products/analysis', method: 'POST' },
            'financial_complete': { endpoint: '/api/pdf_reports/financial/complete', method: 'POST' },
            'cmv': { endpoint: '/api/pdf_reports/financial/cmv', method: 'POST' },
            'taxes': { endpoint: '/api/pdf_reports/financial/taxes', method: 'POST' },
            'stock_complete': { endpoint: '/api/pdf_reports/stock/complete', method: 'POST' },
            'purchases': { endpoint: '/api/pdf_reports/purchases', method: 'POST' },
            'customers_analysis': { endpoint: '/api/pdf_reports/customers/analysis', method: 'POST' },
            'loyalty': { endpoint: '/api/pdf_reports/loyalty', method: 'POST' },
            'tables': { endpoint: '/api/pdf_reports/tables', method: 'POST' },
            'executive_dashboard': { endpoint: '/api/pdf_reports/executive/dashboard', method: 'POST' },
            'reconciliation': { endpoint: '/api/pdf_reports/financial/reconciliation', method: 'POST' },
            'orders': { endpoint: '/api/pdf_reports/orders', method: 'GET' },
            'ingredients': { endpoint: '/api/pdf_reports/ingredients', method: 'GET' },
            'products': { endpoint: '/api/pdf_reports/products', method: 'GET' },
            'users': { endpoint: '/api/pdf_reports/users', method: 'GET' }
        };

        const endpointConfig = endpointMap[reportType];
        if (!endpointConfig) {
            throw new Error(`Tipo de relatório inválido: ${reportType}`);
        }

        const { endpoint, method } = endpointConfig;

        // Converter datas para formato brasileiro (DD-MM-YYYY) se necessário
        const processedFilters = { ...filters };
        if (processedFilters.start_date) {
            processedFilters.start_date = convertDateToBR(processedFilters.start_date);
        }
        if (processedFilters.end_date) {
            processedFilters.end_date = convertDateToBR(processedFilters.end_date);
        }

        // ALTERAÇÃO: Construir URL e opções de requisição baseado no método HTTP
        const baseURL = endpoint.startsWith('http') ? endpoint : `http://127.0.0.1:5000${endpoint}`;
        const token = localStorage.getItem('rb.token') || localStorage.getItem('token') || '';
        
        let requestUrl = baseURL;
        let requestOptions = {
            method: method,
            headers: {
                'Authorization': `Bearer ${token}`
            }
        };

        if (method === 'GET') {
            // Para GET, converter filtros em query string
            const queryParams = new URLSearchParams();
            Object.keys(processedFilters).forEach(key => {
                if (processedFilters[key] !== null && processedFilters[key] !== undefined && processedFilters[key] !== '') {
                    queryParams.append(key, processedFilters[key]);
                }
            });
            
            if (queryParams.toString()) {
                requestUrl += `?${queryParams.toString()}`;
            }
        } else {
            // Para POST, enviar filtros no body JSON
            requestOptions.headers['Content-Type'] = 'application/json';
            requestOptions.body = JSON.stringify(processedFilters);
        }

        // ALTERAÇÃO: Usar fetch direto para blob
        const response = await fetch(requestUrl, requestOptions);

        if (!response.ok) {
            // ALTERAÇÃO: Tentar obter mensagem de erro do backend
            let errorMessage = response.statusText;
            try {
                const errorData = await response.json();
                errorMessage = errorData.error || errorData.message || errorMessage;
            } catch (e) {
                // Se não conseguir parsear JSON, usar statusText
            }
            
            // ALTERAÇÃO: Mensagens mais amigáveis para erros comuns
            if (response.status === 405) {
                throw new Error(`Método HTTP não permitido. O endpoint ${reportType} pode não estar configurado corretamente.`);
            } else if (response.status === 500) {
                // ALTERAÇÃO: Mensagem específica para erro de backend (tables)
                if (reportType === 'tables') {
                    throw new Error('Erro interno ao gerar relatório de mesas. Este relatório pode ter problemas no servidor. Por favor, tente novamente mais tarde ou entre em contato com o suporte.');
                }
                throw new Error(`Erro interno do servidor ao gerar relatório: ${errorMessage}`);
            } else if (response.status === 400) {
                throw new Error(`Dados inválidos: ${errorMessage}`);
            } else {
                throw new Error(`Erro ao gerar PDF (${response.status}): ${errorMessage}`);
            }
        }

        const blob = await response.blob();
        return {
            success: true,
            blob: blob,
            filename: `relatorio_${reportType}_${Date.now()}.pdf`
        };
    } catch (error) {
        // ALTERAÇÃO: Log condicional apenas em modo debug
        if (typeof window !== 'undefined' && window.DEBUG_MODE) {
            const isDev = typeof process !== "undefined" && process.env?.NODE_ENV === "development";
            if (isDev) {
                // eslint-disable-next-line no-console
                console.error('[API] Erro ao gerar PDF:', error);
            }
        }
        return {
            success: false,
            error: error.message
        };
    }
}

