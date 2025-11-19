/**
 * Utility para gerenciar entidades relacionadas a movimentações financeiras
 * ALTERAÇÃO: Reduz duplicação entre contas-pagar.js e dashboard-financeiro.js
 */

import { getPurchaseInvoiceById } from '../api/purchases.js';
import { showToast } from '../ui/alerts.js';
import { showPurchaseInvoiceModal } from './purchase-modal-utils.js';

/**
 * Verifica se o tipo de entidade é uma compra
 * @param {string} entityType - Tipo da entidade
 * @returns {boolean} True se for uma compra
 */
function isPurchaseType(entityType) {
    if (!entityType) return false;
    
    const normalizedType = entityType.toLowerCase().trim();
    return normalizedType === 'purchase' || 
           normalizedType === 'compra' || 
           normalizedType === 'invoice' ||
           normalizedType === 'purchase_invoice' ||
           normalizedType === 'purchaseinvoice' ||
           normalizedType === 'purchase_invoices' ||
           normalizedType.startsWith('purchase_') ||
           (normalizedType.includes('purchase') && normalizedType.includes('invoice'));
}

/**
 * Abre modal de compra quando entidade relacionada for uma compra
 * ALTERAÇÃO: Utility compartilhada para reduzir duplicação
 * @param {string} entityType - Tipo da entidade relacionada
 * @param {number|string} entityId - ID da entidade relacionada
 * @returns {Promise<boolean>} True se o modal foi aberto com sucesso
 */
export async function openRelatedEntityModal(entityType, entityId) {
    if (!entityType || !entityId) {
        showToast('Dados da entidade relacionada não encontrados', 'error');
        return false;
    }
    
    if (isPurchaseType(entityType)) {
        try {
            const invoiceId = parseInt(entityId);
            if (isNaN(invoiceId)) {
                showToast('ID da compra inválido', 'error');
                return false;
            }
            
            const invoice = await getPurchaseInvoiceById(invoiceId);
            if (invoice) {
                await showPurchaseInvoiceModal(invoice);
                return true;
            } else {
                showToast('Compra não encontrada', 'error');
                return false;
            }
        } catch (error) {
            // ALTERAÇÃO: Removido console.error - erro já é exibido ao usuário via toast
            showToast('Erro ao carregar detalhes da compra', 'error');
            return false;
        }
    } else {
        // TODO: REVISAR Implementar navegação para outros tipos de entidades relacionadas
        showToast(`Navegação para ${entityType} ainda não implementada`, 'info');
        return false;
    }
}

/**
 * Atualiza lista de compras se necessário
 * ALTERAÇÃO: Utility compartilhada para atualizar compras após mudanças
 * @param {string} relatedEntityType - Tipo da entidade relacionada
 * @param {number} relatedEntityId - ID da entidade relacionada
 */
export async function refreshPurchasesIfNeeded(relatedEntityType, relatedEntityId) {
    if (!relatedEntityType || !relatedEntityId) return;
    
    const normalizedType = (relatedEntityType || '').toLowerCase();
    const purchaseTypes = ['purchase_invoice', 'purchaseinvoice', 'purchase', 'compra', 'invoice'];
    
    if (purchaseTypes.includes(normalizedType)) {
        // Acessar ComprasManager através do adminPanel global
        if (window.adminPanel && window.adminPanel.managers && window.adminPanel.managers.comprasManager) {
            await window.adminPanel.managers.comprasManager.loadInvoices();
        }
    }
}

/**
 * ALTERAÇÃO: Abre modal de edição baseada no tipo de entidade relacionada
 * @param {number} movementId - ID da movimentação financeira
 * @returns {Promise<boolean>} True se o modal foi aberto com sucesso
 */
export async function openEditModalForMovement(movementId) {
    if (!movementId) {
        showToast('ID da movimentação não fornecido', { type: 'error' });
        return false;
    }

    try {
        // Importar dinamicamente para evitar dependência circular
        const { getFinancialMovementById } = await import('../api/financial-movements.js');
        const movement = await getFinancialMovementById(movementId);

        if (!movement) {
            showToast('Movimentação não encontrada', { type: 'error' });
            return false;
        }

        const relatedEntityType = movement.related_entity_type || '';
        const relatedEntityId = movement.related_entity_id;

        // Se tem entidade relacionada e é uma compra, abrir modal de edição de compra
        if (relatedEntityType && relatedEntityId && isPurchaseType(relatedEntityType)) {
            const invoiceId = parseInt(relatedEntityId);
            if (isNaN(invoiceId)) {
                showToast('ID da compra inválido', { type: 'error' });
                return false;
            }

            // ALTERAÇÃO: Tentar inicializar comprasManager se não existir
            if (!window.adminPanel || !window.adminPanel.managers) {
                showToast('Painel administrativo não disponível', { type: 'error' });
                return false;
            }

            // Se comprasManager não existe, tentar inicializá-lo
            if (!window.adminPanel.managers.comprasManager) {
                try {
                    const { ComprasManager } = await import('../ui/admin/compras-manager.js');
                    window.adminPanel.managers.comprasManager = new ComprasManager('compras-container');
                    await window.adminPanel.managers.comprasManager.init();
                } catch (error) {
                    showToast('Erro ao inicializar gerenciador de compras', { type: 'error' });
                    return false;
                }
            }

            // Abrir modal de edição de compra
            await window.adminPanel.managers.comprasManager.editInvoice(invoiceId);
            return true;
        } else {
            // ALTERAÇÃO: Se não tem entidade relacionada, abrir modal de edição de movimentação
            if (!window.adminPanel || !window.adminPanel.managers) {
                showToast('Painel administrativo não disponível', { type: 'error' });
                return false;
            }

            // Se movimentacaoForm não existe, tentar inicializá-lo
            if (!window.adminPanel.managers.movimentacaoForm) {
                try {
                    const { MovimentacaoForm } = await import('../ui/admin/movimentacao-form.js');
                    let modal = document.getElementById('modal-movimentacao');
                    if (!modal) {
                        modal = document.createElement('div');
                        modal.id = 'modal-movimentacao';
                        modal.className = 'modal';
                        modal.setAttribute('data-reset-on-close', 'true');
                        modal.style.display = 'none';
                        document.body.appendChild(modal);
                    }
                    window.adminPanel.managers.movimentacaoForm = new MovimentacaoForm('modal-movimentacao');
                    await window.adminPanel.managers.movimentacaoForm.init();
                } catch (error) {
                    showToast('Erro ao inicializar formulário de movimentação', { type: 'error' });
                    return false;
                }
            }

            // ALTERAÇÃO: Verificar se modal já está aberta para evitar piscar
            const modal = document.getElementById('modal-movimentacao');
            if (modal) {
                const computedStyle = window.getComputedStyle(modal);
                const isVisible = computedStyle.display !== 'none' && 
                                 computedStyle.opacity !== '0' && 
                                 computedStyle.visibility !== 'hidden';
                if (isVisible) {
                    // Modal já está aberta, apenas focar nela
                    const firstInput = modal.querySelector('input, select, textarea');
                    if (firstInput) firstInput.focus();
                    return true;
                }
            }

            await window.adminPanel.managers.movimentacaoForm.openEdit(movementId, async () => {
                // Recarregar dados após edição
                if (window.adminPanel && window.adminPanel.managers) {
                    // Recarregar movimentações se houver um manager de movimentações
                    if (window.adminPanel.managers.movimentacoesList) {
                        await window.adminPanel.managers.movimentacoesList.loadMovements();
                    }
                    // Recarregar dashboard se estiver aberto
                    if (window.adminPanel.managers.dashboardFinanceiro) {
                        await window.adminPanel.managers.dashboardFinanceiro.loadRecentMovements();
                    }
                    // Recarregar contas a pagar se estiver aberto
                    if (window.adminPanel.managers.contasPagar) {
                        await window.adminPanel.managers.contasPagar.loadPendingPayments();
                    }
                }
            });
            return true;
        }
    } catch (error) {
        showToast('Erro ao abrir modal de edição', { type: 'error' });
        return false;
    }
}

