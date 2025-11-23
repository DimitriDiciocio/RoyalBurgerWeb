/**
 * Modal de Detalhes de Movimentação Financeira
 * Exibe informações detalhadas de uma movimentação financeira standalone
 * ALTERAÇÃO: Baseado no padrão da modal de compra-detalhes
 */

import { getFinancialMovementById } from '../api/financial-movements.js';
import { escapeHTML } from './html-sanitizer.js';
import { abrirModal, fecharModal } from '../ui/modais.js';
import { showToast } from '../ui/alerts.js';

/**
 * Formata valor monetário
 * @param {number} value - Valor a formatar
 * @returns {string} Valor formatado
 */
function formatCurrency(value) {
    return new Intl.NumberFormat('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(value || 0);
}

/**
 * Formata data
 * @param {string} dateString - Data a formatar
 * @returns {string} Data formatada
 */
function formatDate(dateString) {
    if (!dateString) return '-';
    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return dateString;
        return date.toLocaleDateString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch (error) {
        return dateString;
    }
}

/**
 * Formata método de pagamento para exibição
 * @param {string} method - Método de pagamento
 * @returns {string} Método formatado em português
 */
function formatPaymentMethod(method) {
    if (!method || method === '-') return '-';
    const m = String(method).toLowerCase();
    if (m === 'credit' || m.includes('credito')) return 'Cartão de Crédito';
    if (m === 'debit' || m.includes('debito')) return 'Cartão de Débito';
    if (m === 'pix') return 'PIX';
    if (m === 'money' || m.includes('dinheiro') || m.includes('cash')) return 'Dinheiro';
    if (m === 'bank_transfer' || m.includes('transfer')) return 'Transferência Bancária';
    if (m.includes('credit card')) return 'Cartão de Crédito';
    if (m.includes('debit card')) return 'Cartão de Débito';
    return method;
}

/**
 * Traduz tipo de movimentação
 * @param {string} type - Tipo da movimentação
 * @returns {string} Tipo traduzido
 */
function translateType(type) {
    if (!type) return '-';
    const typeMap = {
        'revenue': 'Receita',
        'expense': 'Despesa',
        'cmv': 'CMV',
        'tax': 'Tributo'
    };
    return typeMap[type.toLowerCase()] || type;
}

/**
 * Traduz status de pagamento
 * @param {string} status - Status do pagamento
 * @returns {string} Status traduzido
 */
function translateStatus(status) {
    if (!status) return '-';
    const statusMap = {
        'pending': 'Pendente',
        'paid': 'Pago',
        'overdue': 'Vencido',
        'cancelled': 'Cancelado'
    };
    return statusMap[status.toLowerCase()] || status;
}

/**
 * Exibe modal com detalhes da movimentação financeira
 * @param {number} movementId - ID da movimentação
 */
export async function showMovimentacaoDetalhesModal(movementId) {
    if (!movementId) {
        showToast('ID da movimentação não fornecido', { type: 'error' });
        return;
    }

    try {
        // Buscar detalhes da movimentação
        const movement = await getFinancialMovementById(movementId);
        if (!movement) {
            showToast('Movimentação não encontrada', { type: 'error' });
            return;
        }

        const movementIdDisplay = escapeHTML(movement.id || movement.movement_id || movementId);
        const type = (movement.type || '').toLowerCase();
        const typeLabel = translateType(type);
        const value = parseFloat(movement.value || movement.amount || 0);
        const description = movement.description || movement.description_text || '';
        const category = movement.category || '';
        const subcategory = movement.subcategory || '';
        const movementDate = movement.movement_date || movement.date || '';
        const paymentMethod = formatPaymentMethod(movement.payment_method || '-');
        const paymentStatus = (movement.payment_status || 'pending').toLowerCase();
        const statusLabel = translateStatus(paymentStatus);
        const senderReceiver = movement.sender_receiver || movement.sender || movement.receiver || '';
        const notes = movement.notes || movement.notes_text || '';
        const createdBy = movement.created_by_name || movement.created_by || '';
        const createdAt = movement.created_at || '';

        // Criar ou obter modal seguindo padrão do sistema
        let modal = document.getElementById('modal-movimentacao-detalhes');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'modal-movimentacao-detalhes';
            modal.className = 'modal';
            document.body.appendChild(modal);
        }

        // ALTERAÇÃO: Estrutura HTML seguindo padrão do sistema com melhorias de acessibilidade
        modal.innerHTML = `
            <div class="div-overlay" data-close-modal="modal-movimentacao-detalhes" role="button" tabindex="0" aria-label="Fechar modal"></div>
            <div class="modal-content-movimentacao-detalhes" role="dialog" aria-labelledby="modal-movimentacao-title" aria-modal="true">
                <div class="header-modal">
                    <h2 id="modal-movimentacao-title">Detalhes da Movimentação #${movementIdDisplay}</h2>
                    <button type="button" class="fechar-modal" data-close-modal="modal-movimentacao-detalhes" aria-label="Fechar modal" tabindex="0">
                        <i class="fa-solid fa-xmark" aria-hidden="true"></i>
                    </button>
                </div>
                <div class="conteudo-modal">
                    <div class="invoice-details">
                        <div class="invoice-detail-section">
                            <h3>Informações Gerais</h3>
                            <div class="invoice-detail-grid">
                                <div class="invoice-detail-item">
                                    <span class="label">Tipo:</span>
                                    <span class="value">${escapeHTML(typeLabel)}</span>
                                </div>
                                <div class="invoice-detail-item">
                                    <span class="label">Valor:</span>
                                    <span class="value highlight ${type === 'revenue' ? 'revenue' : type === 'expense' || type === 'cmv' ? 'expense' : ''}">
                                        ${type === 'revenue' ? '+' : '-'} R$ ${formatCurrency(value)}
                                    </span>
                                </div>
                                <div class="invoice-detail-item">
                                    <span class="label">Data da Movimentação:</span>
                                    <span class="value">${formatDate(movementDate)}</span>
                                </div>
                                <div class="invoice-detail-item">
                                    <span class="label">Status:</span>
                                    <span class="value">${escapeHTML(statusLabel)}</span>
                                </div>
                                <div class="invoice-detail-item">
                                    <span class="label">Método de Pagamento:</span>
                                    <span class="value">${escapeHTML(paymentMethod)}</span>
                                </div>
                                ${category ? `
                                <div class="invoice-detail-item">
                                    <span class="label">Categoria:</span>
                                    <span class="value">${escapeHTML(category)}</span>
                                </div>
                                ` : ''}
                                ${subcategory ? `
                                <div class="invoice-detail-item">
                                    <span class="label">Subcategoria:</span>
                                    <span class="value">${escapeHTML(subcategory)}</span>
                                </div>
                                ` : ''}
                                ${senderReceiver ? `
                                <div class="invoice-detail-item">
                                    <span class="label">${type === 'expense' ? 'Destinatário' : 'Remetente'}:</span>
                                    <span class="value">${escapeHTML(senderReceiver)}</span>
                                </div>
                                ` : ''}
                                ${createdBy ? `
                                <div class="invoice-detail-item">
                                    <span class="label">Criado por:</span>
                                    <span class="value">${escapeHTML(createdBy)}</span>
                                </div>
                                ` : ''}
                                ${createdAt ? `
                                <div class="invoice-detail-item">
                                    <span class="label">Data de Criação:</span>
                                    <span class="value">${formatDate(createdAt)}</span>
                                </div>
                                ` : ''}
                            </div>
                        </div>

                        ${description ? `
                        <div class="invoice-detail-section">
                            <h3>Descrição</h3>
                            <div class="invoice-detail-item" style="grid-column: 1 / -1;">
                                <span class="value">${escapeHTML(description)}</span>
                            </div>
                        </div>
                        ` : ''}

                        ${notes ? `
                        <div class="invoice-detail-section">
                            <h3>Observações</h3>
                            <div class="invoice-detail-item" style="grid-column: 1 / -1;">
                                <span class="value">${escapeHTML(notes)}</span>
                            </div>
                        </div>
                        ` : ''}
                    </div>
                </div>
                <div class="footer-modal">
                    <button type="button" class="btn-cancelar" data-close-modal="modal-movimentacao-detalhes" aria-label="Fechar modal de detalhes da movimentação">Fechar</button>
                </div>
            </div>
        `;

        // ALTERAÇÃO: Configurar event listeners do modal antes de abrir
        const handleCloseModal = () => {
            fecharModal('modal-movimentacao-detalhes');
        };
        
        // ALTERAÇÃO: Adicionar listeners para todos os elementos de fechar (clique e teclado)
        const closeButtons = modal.querySelectorAll('[data-close-modal="modal-movimentacao-detalhes"]');
        closeButtons.forEach(btn => {
            btn.addEventListener('click', handleCloseModal);
            // ALTERAÇÃO: Suporte a teclado (Enter/Space) para acessibilidade
            btn.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleCloseModal();
                }
            });
        });
        
        // ALTERAÇÃO: Adicionar suporte a teclado (Escape) para acessibilidade
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                handleCloseModal();
            }
        };
        modal.addEventListener('keydown', handleKeyDown);
        
        // ALTERAÇÃO: Focar no modal ao abrir para acessibilidade
        const modalContent = modal.querySelector('.modal-content-movimentacao-detalhes');
        if (modalContent) {
            modalContent.setAttribute('tabindex', '-1');
        }

        // Garantir que o modal está no DOM antes de abrir
        if (!document.body.contains(modal)) {
            document.body.appendChild(modal);
        }

        // ALTERAÇÃO: Usar sistema de modais.js para abrir modal
        setTimeout(() => {
            abrirModal('modal-movimentacao-detalhes');
            // ALTERAÇÃO: Focar no conteúdo do modal para acessibilidade
            if (modalContent) {
                modalContent.focus();
            }
        }, 10);
    } catch (error) {
        showToast('Erro ao carregar detalhes da movimentação', { type: 'error' });
    }
}

