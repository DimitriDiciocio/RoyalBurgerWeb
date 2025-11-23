/**
 * Componente de Card de Movimentação Financeira
 * Cria e gerencia cards de movimentações financeiras
 */

/**
 * Cria um card de movimentação financeira
 * @param {Object} movement - Dados da movimentação
 * @param {Object} options - Opções de configuração
 * @returns {string} HTML do card
 */
export function createFinancialMovementCard(movement, options = {}) {
    const {
        onEdit = null,
        onDelete = null,
        onViewRelated = null,
        onMarkAsPaid = null
    } = options;

    // Normalizar dados da movimentação
    const id = movement.id || movement.movement_id;
    const type = (movement.type || '').toLowerCase();
    const paymentStatus = (movement.payment_status || 'pending').toLowerCase();
    const value = parseFloat(movement.value || movement.amount || 0);
    const description = movement.description || movement.description_text || '';
    const category = movement.category || '';
    const subcategory = movement.subcategory || '';
    const movementDate = movement.movement_date || movement.date || '';
    const paymentMethod = movement.payment_method || '';
    const senderReceiver = movement.sender_receiver || movement.sender || movement.receiver || '';
    const relatedEntityType = movement.related_entity_type || '';
    const relatedEntityId = movement.related_entity_id || '';

    // ALTERAÇÃO: Formatar método de pagamento para exibição
    const formatPaymentMethod = (method) => {
        if (!method) return '';
        const m = String(method).toLowerCase();
        if (m === 'credit' || m.includes('credito')) return 'Cartão de Crédito';
        if (m === 'debit' || m.includes('debito')) return 'Cartão de Débito';
        if (m === 'pix') return 'PIX';
        if (m === 'money' || m.includes('dinheiro') || m.includes('cash')) return 'Dinheiro';
        if (m === 'bank_transfer' || m.includes('transfer')) return 'Transferência Bancária';
        // Fallback para valores antigos
        if (m.includes('credit card')) return 'Cartão de Crédito';
        if (m.includes('debit card')) return 'Cartão de Débito';
        return method; // Retornar o valor original se não reconhecer
    };
    const formattedPaymentMethod = formatPaymentMethod(paymentMethod);

    // Formatar valor monetário
    const formattedValue = formatCurrency(value);
    const valueSign = type === 'revenue' ? '+' : '-';
    const valueSignClass = type === 'revenue' ? 'positive' : 'negative';

    // Formatar data
    const formattedDate = formatDate(movementDate);

    // Determinar classe do tipo
    const typeClass = `type-${type}`;
    const statusClass = `status-${paymentStatus}`;

    // Traduzir tipos e status
    const typeLabel = translateType(type);
    const statusLabel = translateStatus(paymentStatus);

    // Construir HTML do card
    const cardHTML = `
        <div class="financial-movement-card ${typeClass}" data-movement-id="${id}">
            <div class="financial-movement-card-header">
                <div class="financial-movement-card-type">
                    <span class="financial-badge ${typeClass}">${typeLabel}</span>
                    <span class="financial-badge ${statusClass}">${statusLabel}</span>
                    ${movement.reconciled ? '<span class="financial-badge reconciled">Reconciliada</span>' : ''}
                </div>
                <div class="financial-movement-card-actions">
                    ${onEdit ? `
                        <button class="financial-btn-icon" data-action="edit" data-movement-id="${id}" title="Editar" aria-label="Editar movimentação">
                            <i class="fa-solid fa-edit" aria-hidden="true"></i>
                        </button>
                    ` : ''}
                    ${onDelete ? `
                        <button class="financial-btn-icon danger" data-action="delete" data-movement-id="${id}" title="Excluir" aria-label="Excluir movimentação">
                            <i class="fa-solid fa-trash" aria-hidden="true"></i>
                        </button>
                    ` : ''}
                </div>
            </div>
            
            <div class="financial-movement-card-body">
                <div class="financial-movement-card-value">
                    <span class="value-sign ${valueSignClass}">${valueSign}</span>
                    <span class="value-amount">R$ ${formattedValue}</span>
                </div>
                
                ${description ? `
                    <div class="financial-movement-card-description">
                        <p class="description-text">${escapeHtml(description)}</p>
                        ${category ? `
                            <p class="description-meta">
                                <span>${escapeHtml(category)}</span>
                                ${subcategory ? ` • <span>${escapeHtml(subcategory)}</span>` : ''}
                            </p>
                        ` : ''}
                    </div>
                ` : ''}
                
                <div class="financial-movement-card-details">
                    ${formattedDate ? `
                        <div class="detail-item">
                            <i class="fa-solid fa-calendar" aria-hidden="true"></i>
                            <span>${formattedDate}</span>
                        </div>
                    ` : ''}
                    ${formattedPaymentMethod ? `
                        <div class="detail-item">
                            <i class="fa-solid fa-credit-card" aria-hidden="true"></i>
                            <span>${escapeHtml(formattedPaymentMethod)}</span>
                        </div>
                    ` : ''}
                    ${senderReceiver ? `
                        <div class="detail-item">
                            <i class="fa-solid fa-user" aria-hidden="true"></i>
                            <span>${escapeHtml(senderReceiver)}</span>
                        </div>
                    ` : ''}
                </div>
            </div>
            
            <div class="financial-movement-card-footer">
                ${paymentStatus !== 'paid' && onMarkAsPaid ? `
                    <button type="button" class="financial-btn financial-btn-pay" 
                            data-action="mark-paid" 
                            data-movement-id="${id}"
                            aria-label="Marcar movimentação como paga">
                        <i class="fa-solid fa-check-circle" aria-hidden="true"></i>
                        <span>Marcar como Pago</span>
                    </button>
                ` : ''}
                ${relatedEntityType && relatedEntityId ? `
                    <button type="button" class="related-link financial-btn financial-btn-secondary" 
                            data-entity-type="${escapeHtml(relatedEntityType)}" 
                            data-entity-id="${relatedEntityId}"
                            data-movement-type="${escapeHtml(type)}"
                            data-movement-id="${id}"
                            aria-label="Ver mais detalhes">
                        <i class="fa-solid fa-eye" aria-hidden="true"></i>
                        <span>Ver mais</span>
                    </button>
                ` : `
                    <button type="button" class="view-details-link financial-btn financial-btn-secondary" 
                            data-action="view-details"
                            data-movement-id="${id}"
                            aria-label="Ver mais detalhes">
                        <i class="fa-solid fa-eye" aria-hidden="true"></i>
                        <span>Ver mais</span>
                    </button>
                `}
            </div>
        </div>
    `;

    return cardHTML;
}

/**
 * Renderiza múltiplos cards em um container
 * @param {Array} movements - Array de movimentações
 * @param {HTMLElement|string} container - Container ou ID do container
 * @param {Object} options - Opções de configuração
 */
export function renderFinancialMovementCards(movements, container, options = {}) {
    const containerElement = typeof container === 'string' 
        ? document.getElementById(container) 
        : container;

    if (!containerElement) {
        // ALTERAÇÃO: Removido console.error - erro será tratado silenciosamente
        return;
    }

    if (!Array.isArray(movements) || movements.length === 0) {
        containerElement.innerHTML = `
            <div style="text-align: center; padding: 3rem; color: #6b7280;">
                <i class="fa-solid fa-inbox" style="font-size: 48px; margin-bottom: 16px; opacity: 0.3;" aria-hidden="true"></i>
                <p style="font-size: 16px;">Nenhuma movimentação encontrada</p>
            </div>
        `;
        return;
    }

    // Criar cards
    const cardsHTML = movements.map(movement => 
        createFinancialMovementCard(movement, options)
    ).join('');

    containerElement.innerHTML = cardsHTML;

    // Configurar event listeners se necessário
    if (options.onEdit || options.onDelete || options.onViewRelated || options.onMarkAsPaid) {
        setupCardEventListeners(containerElement, options);
    }
}

/**
 * Configura event listeners nos cards
 * @param {HTMLElement} container - Container dos cards
 * @param {Object} options - Opções com callbacks
 */
function setupCardEventListeners(container, options) {
    // ALTERAÇÃO: Remover listeners anteriores para evitar duplicação
    const existingHandler = container._financialCardClickHandler;
    if (existingHandler) {
        container.removeEventListener('click', existingHandler);
    }
    
    // ALTERAÇÃO: Flags para prevenir múltiplos cliques
    let isProcessing = false;
    
    // ALTERAÇÃO: Criar handler único e armazenar referência
    const clickHandler = async (e) => {
        const button = e.target.closest('[data-action]');
        if (!button) return;

        // ALTERAÇÃO: Prevenir múltiplos cliques simultâneos
        if (isProcessing) {
            e.preventDefault();
            e.stopPropagation();
            return;
        }

        const action = button.dataset.action;
        const movementId = parseInt(button.dataset.movementId);

        if (action === 'edit' && options.onEdit) {
            e.preventDefault();
            e.stopPropagation();
            isProcessing = true;
            try {
                await options.onEdit(movementId);
            } finally {
                // ALTERAÇÃO: Liberar após um pequeno delay para evitar cliques rápidos
                setTimeout(() => { isProcessing = false; }, 300);
            }
        } else if (action === 'delete' && options.onDelete) {
            e.preventDefault();
            e.stopPropagation();
            isProcessing = true;
            try {
                // ALTERAÇÃO: Aguardar callback terminar completamente antes de liberar
                await options.onDelete(movementId);
            } finally {
                // ALTERAÇÃO: Liberar apenas após callback terminar completamente (sem timeout fixo)
                isProcessing = false;
            }
        } else if (action === 'mark-paid' && options.onMarkAsPaid) {
            e.preventDefault();
            e.stopPropagation();
            isProcessing = true;
            try {
                await options.onMarkAsPaid(movementId);
            } finally {
                setTimeout(() => { isProcessing = false; }, 300);
            }
        } else if (action === 'view-details') {
            e.preventDefault();
            e.stopPropagation();
            isProcessing = true;
            try {
                // ALTERAÇÃO: Importar e abrir modal de detalhes da movimentação
                const { showMovimentacaoDetalhesModal } = await import('../../utils/modal-content-movimentacao-detalhes.js');
                await showMovimentacaoDetalhesModal(movementId);
            } catch (error) {
                // ALTERAÇÃO: Se houver erro, tentar usar callback se disponível
                if (options.onViewDetails) {
                    await options.onViewDetails(movementId);
                }
            } finally {
                setTimeout(() => { isProcessing = false; }, 300);
            }
        }
    };
    
    // ALTERAÇÃO: Armazenar referência do handler para possível remoção futura
    container._financialCardClickHandler = clickHandler;
    
    // Event delegation para botões de ação
    container.addEventListener('click', clickHandler);

    // ALTERAÇÃO: Event listener para botão de visualizar entidade relacionada
    if (options.onViewRelated) {
        // ALTERAÇÃO: Remover listener anterior se existir
        const existingRelatedHandler = container._financialCardRelatedHandler;
        if (existingRelatedHandler) {
            container.removeEventListener('click', existingRelatedHandler, true);
        }
        
        const relatedHandler = (e) => {
            // Verificar se o clique foi no botão relacionado ou em seus filhos
            const button = e.target.closest('.related-link');
            if (!button) return;

            e.preventDefault();
            e.stopPropagation();
            
            const entityType = button.getAttribute('data-entity-type');
            const entityId = button.getAttribute('data-entity-id');
            const movementType = button.getAttribute('data-movement-type');
            const movementId = button.getAttribute('data-movement-id');
            
            // Verificar se os dados estão presentes antes de chamar o callback
            if (entityType && entityId) {
                try {
                    // ALTERAÇÃO: Buscar movimento completo se necessário para passar tipo
                    const card = button.closest('.financial-movement-card');
                    let movement = null;
                    if (card && movementId) {
                        // ALTERAÇÃO: Tentar encontrar o movimento original nos dados renderizados
                        // Por enquanto, passar apenas o tipo que já está no atributo
                        movement = {
                            type: movementType,
                            id: movementId
                        };
                    }
                    // ALTERAÇÃO: Passar movimentoType como terceiro parâmetro
                    options.onViewRelated(entityType, entityId, movementType);
                } catch (error) {
                    // ALTERAÇÃO: Removido console.error - erro será tratado pelo callback ou silenciosamente
                }
            }
        };
        
        // ALTERAÇÃO: Armazenar referência do handler
        container._financialCardRelatedHandler = relatedHandler;
        
        container.addEventListener('click', relatedHandler, true); // Usar capture phase para garantir que o evento seja capturado
    }
}

/**
 * Formata valor monetário
 * @param {number} value - Valor a formatar
 * @returns {string} Valor formatado
 */
function formatCurrency(value) {
    return new Intl.NumberFormat('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(Math.abs(value || 0));
}

/**
 * Formata data
 * @param {string} dateString - Data a formatar
 * @returns {string} Data formatada
 */
function formatDate(dateString) {
    if (!dateString) return '';

    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return dateString;

        return date.toLocaleString('pt-BR', {
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
 * Traduz tipo de movimentação
 * @param {string} type - Tipo em inglês
 * @returns {string} Tipo em português
 */
function translateType(type) {
    const translations = {
        'revenue': 'Receita',
        'expense': 'Despesa',
        'cmv': 'CMV',
        'tax': 'Imposto'
    };
    return translations[type] || type.toUpperCase();
}

/**
 * Traduz status de pagamento
 * @param {string} status - Status em inglês
 * @returns {string} Status em português
 */
function translateStatus(status) {
    const translations = {
        'pending': 'Pendente',
        'paid': 'Pago',
        'reconciled': 'Reconciliada'
    };
    return translations[status] || status;
}

/**
 * Escapa HTML para prevenir XSS
 * @param {string} text - Texto a escapar
 * @returns {string} Texto escapado
 */
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}


