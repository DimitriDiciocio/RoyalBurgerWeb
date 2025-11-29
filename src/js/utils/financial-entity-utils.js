/**
 * Utility para gerenciar entidades relacionadas a movimentações financeiras
 * ALTERAÇÃO: Reduz duplicação entre contas-pagar.js e dashboard-financeiro.js
 */

import { getPurchaseInvoiceById } from '../api/purchases.js';
import { getFinancialMovementById } from '../api/financial-movements.js';
import { showToast } from '../ui/alerts.js';
import { showPurchaseInvoiceModal } from './purchase-modal-utils.js';
import { showCmvPedidoModal } from './modal-content-cmv-pedido.js';
import { showVendaPedidoModal } from './modal-content-venda-pedido.js';

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
 * Verifica se o tipo de entidade é um pedido
 * @param {string} entityType - Tipo da entidade
 * @returns {boolean} True se for um pedido
 */
function isOrderType(entityType) {
    if (!entityType) return false;
    
    const normalizedType = entityType.toLowerCase().trim();
    return normalizedType === 'order' || 
           normalizedType === 'pedido' || 
           normalizedType === 'orders';
}

/**
 * Abre modal de compra quando entidade relacionada for uma compra
 * ALTERAÇÃO: Utility compartilhada para reduzir duplicação
 * ALTERAÇÃO: Suporte para pedidos (CMV e VENDA)
 * @param {string} entityType - Tipo da entidade relacionada
 * @param {number|string} entityId - ID da entidade relacionada
 * @param {string} [movementType] - Tipo da movimentação (opcional, usado para pedidos)
 * @returns {Promise<boolean>} True se o modal foi aberto com sucesso
 */
export async function openRelatedEntityModal(entityType, entityId, movementType = null) {
    if (!entityType || !entityId) {
        showToast('Dados da entidade relacionada não encontrados', { type: 'error' });
        return false;
    }
    
    if (isPurchaseType(entityType)) {
        try {
            const invoiceId = parseInt(entityId);
            if (isNaN(invoiceId)) {
                showToast('ID da compra inválido', { type: 'error' });
                return false;
            }
            
            const invoice = await getPurchaseInvoiceById(invoiceId);
            if (invoice) {
                await showPurchaseInvoiceModal(invoice);
                return true;
            } else {
                showToast('Compra não encontrada', { type: 'error' });
                return false;
            }
        } catch (error) {
            // ALTERAÇÃO: Removido console.error - erro já é exibido ao usuário via toast
            showToast('Erro ao carregar detalhes da compra', { type: 'error' });
            return false;
        }
    } else if (isOrderType(entityType)) {
        try {
            const orderId = parseInt(entityId);
            if (isNaN(orderId)) {
                showToast('ID do pedido inválido', { type: 'error' });
                return false;
            }
            
            // ALTERAÇÃO: Se movementType não foi fornecido, buscar da movimentação
            let finalMovementType = movementType;
            if (!finalMovementType) {
                // Tentar buscar o tipo da movimentação através do contexto
                // Se não conseguir, usar o tipo padrão baseado no entityType
                finalMovementType = 'revenue'; // Padrão para pedidos
            }
            
            // ALTERAÇÃO: Determinar qual modal abrir baseado no tipo da movimentação
            const normalizedMovementType = (finalMovementType || '').toLowerCase().trim();
            if (normalizedMovementType === 'cmv') {
                await showCmvPedidoModal(orderId);
                return true;
            } else if (normalizedMovementType === 'revenue' || normalizedMovementType === 'receita') {
                await showVendaPedidoModal(orderId);
                return true;
            } else {
                // ALTERAÇÃO: Se tipo não identificado, tentar inferir do contexto ou usar padrão
                showToast('Tipo de movimentação não identificado', { type: 'info' });
                return false;
            }
        } catch (error) {
            showToast('Erro ao carregar detalhes do pedido', { type: 'error' });
            return false;
        }
    } else {
        // ALTERAÇÃO: Se não há entidade relacionada ou tipo não reconhecido, abrir modal genérica de detalhes
        try {
            // Tentar buscar o ID da movimentação através do entityId (pode ser o ID da movimentação)
            const movementId = parseInt(entityId);
            if (!isNaN(movementId)) {
                const { showMovimentacaoDetalhesModal } = await import('./modal-content-movimentacao-detalhes.js');
                await showMovimentacaoDetalhesModal(movementId);
                return true;
            }
        } catch (error) {
            // Se falhar, mostrar mensagem informativa
            showToast(`Modal para ${entityType} ainda não implementada`, { type: 'info' });
        }
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
 * ALTERAÇÃO: Verifica se uma tab financeira está ativa
 * @param {string} tabId - ID da tab (dashboard, movimentacoes, contas-pagar, compras, recorrencias)
 * @returns {boolean} True se a tab estiver ativa
 */
function isFinancialTabActive(tabId) {
    const tabElement = document.querySelector(`.financeiro-tab[data-tab="${tabId}"]`);
    const contentElement = document.getElementById(`tab-${tabId}`);
    
    return tabElement?.classList.contains('active') && 
           contentElement?.classList.contains('active');
}

/**
 * ALTERAÇÃO: Atualiza todos os managers financeiros após operações CRUD
 * Garante que todas as seções sejam atualizadas sem necessidade de reload
 * Atualiza apenas as tabs que estão ativas ou forçadas via options
 * @param {Object} options - Opções de atualização
 * @param {boolean} options.updateMovements - Atualizar lista de movimentações (default: true)
 * @param {boolean} options.updateDashboard - Atualizar dashboard financeiro (default: true)
 * @param {boolean} options.updatePendingPayments - Atualizar contas a pagar (default: true)
 * @param {boolean} options.updatePurchases - Atualizar compras (default: false)
 * @param {boolean} options.updateRecurrences - Atualizar recorrências (default: false)
 * @param {boolean} options.forceUpdate - Forçar atualização mesmo se tab não estiver ativa (default: false)
 */
export async function refreshAllFinancialManagers(options = {}) {
    const {
        updateMovements = true,
        updateDashboard = true,
        updatePendingPayments = true,
        updatePurchases = false,
        updateRecurrences = false,
        forceUpdate = false
    } = options;

    if (!window.adminPanel || !window.adminPanel.managers) {
        return;
    }

    const managers = window.adminPanel.managers;
    const updatePromises = [];

    // ALTERAÇÃO: Verificar se a seção financeira está visível
    const financeiroSection = document.getElementById('secao-financeiro');
    const isFinanceiroVisible = financeiroSection && 
                                window.getComputedStyle(financeiroSection).display !== 'none';

    // Se a seção financeira não estiver visível e não for forçado, não atualizar
    if (!isFinanceiroVisible && !forceUpdate) {
        return;
    }

    // Atualizar lista de movimentações (se tab estiver ativa ou forçado)
    // ALTERAÇÃO: Verificar ambos os nomes possíveis do manager
    const movementsListManager = managers.movementsList || managers.movimentacoesList;
    if (updateMovements && movementsListManager && 
        (forceUpdate || isFinancialTabActive('movimentacoes'))) {
        updatePromises.push(movementsListManager.loadMovements());
    }

    // Atualizar dashboard financeiro (se tab estiver ativa ou forçado)
    if (updateDashboard && managers.dashboardFinanceiro && 
        (forceUpdate || isFinancialTabActive('dashboard'))) {
        updatePromises.push(managers.dashboardFinanceiro.loadData());
        updatePromises.push(managers.dashboardFinanceiro.loadRecentMovements());
    }

    // Atualizar contas a pagar (se tab estiver ativa ou forçado)
    // ALTERAÇÃO: Verificar ambos os nomes possíveis do manager
    const contasPagarManager = managers.contasPagar || managers.contasPagarManager;
    if (updatePendingPayments && contasPagarManager && 
        (forceUpdate || isFinancialTabActive('contas-pagar'))) {
        updatePromises.push(contasPagarManager.loadPendingPayments());
    }

    // Atualizar compras (se tab estiver ativa ou forçado)
    if (updatePurchases && managers.comprasManager && 
        (forceUpdate || isFinancialTabActive('compras'))) {
        updatePromises.push(managers.comprasManager.loadInvoices());
    }

    // Atualizar recorrências (se tab estiver ativa ou forçado)
    if (updateRecurrences && managers.recorrenciasManager && 
        (forceUpdate || isFinancialTabActive('recorrencias'))) {
        updatePromises.push(managers.recorrenciasManager.loadRules());
    }

    // Executar todas as atualizações em paralelo
    await Promise.allSettled(updatePromises);
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
                    const movementsListManager = window.adminPanel.managers.movementsList || window.adminPanel.managers.movimentacoesList;
                    if (movementsListManager) {
                        await movementsListManager.loadMovements();
                    }
                    // Recarregar dashboard se estiver aberto
                    if (window.adminPanel.managers.dashboardFinanceiro) {
                        await window.adminPanel.managers.dashboardFinanceiro.loadRecentMovements();
                    }
                    // Recarregar contas a pagar se estiver aberto
                    const contasPagarManager = window.adminPanel.managers.contasPagar || window.adminPanel.managers.contasPagarManager;
                    if (contasPagarManager) {
                        await contasPagarManager.loadPendingPayments();
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

