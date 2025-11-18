/**
 * API de Compras e Notas Fiscais
 */

import { apiRequest, API_BASE_URL } from './api.js';

const PURCHASES_API_BASE = `${API_BASE_URL}/api/purchases`;

/**
 * Cria uma nova nota fiscal de compra
 * @param {Object} invoiceData - Dados da nota fiscal
 * @returns {Promise<Object>}
 */
export async function createPurchaseInvoice(invoiceData) {
    return apiRequest(`${PURCHASES_API_BASE}/invoices`, {
        method: 'POST',
        body: invoiceData
    });
}

/**
 * Lista notas fiscais de compra com filtros
 * @param {Object} filters - Filtros de busca
 * @returns {Promise<Array>}
 */
export async function getPurchaseInvoices(filters = {}) {
    const params = new URLSearchParams();
    if (filters.start_date) params.append('start_date', filters.start_date);
    if (filters.end_date) params.append('end_date', filters.end_date);
    if (filters.supplier_name) params.append('supplier_name', filters.supplier_name);
    if (filters.payment_status) params.append('payment_status', filters.payment_status);
    
    const url = `${PURCHASES_API_BASE}/invoices${params.toString() ? '?' + params.toString() : ''}`;
    return apiRequest(url, { method: 'GET' });
}

/**
 * Obtém uma nota fiscal de compra por ID
 * @param {number} invoiceId - ID da nota fiscal
 * @returns {Promise<Object>}
 */
export async function getPurchaseInvoiceById(invoiceId) {
    return apiRequest(`${PURCHASES_API_BASE}/invoices/${invoiceId}`, { method: 'GET' });
}

/**
 * Atualiza uma nota fiscal de compra
 * ALTERAÇÃO: Nova função para UPDATE
 * @param {number} invoiceId - ID da nota fiscal
 * @param {Object} invoiceData - Dados atualizados da nota fiscal
 * @returns {Promise<Object>}
 */
export async function updatePurchaseInvoice(invoiceId, invoiceData) {
    return apiRequest(`${PURCHASES_API_BASE}/invoices/${invoiceId}`, {
        method: 'PUT',
        body: invoiceData
    });
}

/**
 * Exclui uma nota fiscal de compra
 * ALTERAÇÃO: Nova função para DELETE
 * @param {number} invoiceId - ID da nota fiscal
 * @returns {Promise<Object>}
 */
export async function deletePurchaseInvoice(invoiceId) {
    return apiRequest(`${PURCHASES_API_BASE}/invoices/${invoiceId}`, {
        method: 'DELETE'
    });
}

