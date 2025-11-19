/**
 * Utility para exibir modal de compra
 * ALTERAÇÃO: Extraído de compras-manager.js para reutilização
 */

import { getIngredientById } from '../api/ingredients.js';
import { escapeHTML } from './html-sanitizer.js';
import { cacheManager } from './cache-manager.js';
import { abrirModal, fecharModal } from '../ui/modais.js';

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
            year: 'numeric'
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
 * Traduz status de pagamento
 * @param {string} status - Status em inglês
 * @returns {string} Status em português
 */
function translateStatus(status) {
    const translations = {
        'Pending': 'Pendente',
        'Paid': 'Pago'
    };
    return translations[status] || status;
}

/**
 * Normaliza unidade de medida
 * @param {string} unit - Unidade
 * @returns {string} Unidade normalizada
 */
function normalizeUnit(unit) {
    if (!unit) return 'un';
    const u = unit.toLowerCase().trim();
    if (u === 'kilogram' || u === 'kilograma') return 'kg';
    if (u === 'gram' || u === 'grama') return 'g';
    if (u === 'liter' || u === 'litro') return 'l';
    if (u === 'milliliter' || u === 'mililitro') return 'ml';
    if (u === 'unit' || u === 'unidade') return 'un';
    return u;
}

/**
 * Formata quantidade com base na unidade de medida do ingrediente
 * 
 * ALTERAÇÃO CRÍTICA: O banco armazena na mesma unidade do ingrediente
 * Se o ingrediente tem stock_unit = 'kg', o banco armazena em kg, não em gramas
 * Portanto, NÃO deve converter dividindo por 1000 quando a unidade já é kg ou L
 * 
 * @param {number} quantity - Quantidade armazenada no banco (na mesma unidade do ingrediente)
 * @param {string} stockUnit - Unidade de estoque do ingrediente (kg, g, L, ml, un)
 * @returns {string} Quantidade formatada com unidade
 */
function formatQuantity(quantity, stockUnit) {
    if (!quantity || quantity === 0) return '0';
    
    const normalizedUnit = normalizeUnit(stockUnit);
    let displayQuantity = quantity;
    let displayUnit = normalizedUnit;

    // ALTERAÇÃO CRÍTICA: Não converter quando unidade já é kg ou L
    // O banco armazena na mesma unidade do ingrediente
    // Se stock_unit = 'kg', quantity já está em kg (não precisa dividir por 1000)
    
    // Apenas usar a quantidade como está - banco armazena na mesma unidade do ingrediente
    displayQuantity = quantity;
    displayUnit = normalizedUnit;

    // Formatar quantidade com decimais apropriados
    let formattedQuantity;
    if (displayUnit === 'kg' || displayUnit === 'L') {
        // ALTERAÇÃO: Para kg e L, exibir com até 3 casas decimais se necessário
        formattedQuantity = displayQuantity % 1 === 0 
            ? displayQuantity.toFixed(0) 
            : parseFloat(displayQuantity.toFixed(3)).toString();
    } else if (displayUnit === 'g' || displayUnit === 'ml') {
        // ALTERAÇÃO: Para g e ml, exibir com até 1 casa decimal se necessário
        formattedQuantity = displayQuantity % 1 === 0 
            ? displayQuantity.toFixed(0) 
            : parseFloat(displayQuantity.toFixed(1)).toString();
    } else {
        // ALTERAÇÃO: Para unidades (un), exibir sem decimais ou com até 3 casas se necessário
        formattedQuantity = displayQuantity % 1 === 0 
            ? displayQuantity.toFixed(0) 
            : parseFloat(displayQuantity.toFixed(3)).toString();
    }

    return `${formattedQuantity} ${displayUnit.toUpperCase()}`;
}

/**
 * Converte preço unitário da unidade base para unidade de exibição
 * @param {number} baseUnitPrice - Preço unitário na unidade base
 * @param {string} stockUnit - Unidade de estoque do ingrediente
 * @returns {number} Preço unitário na unidade de exibição
 */
function formatUnitPrice(baseUnitPrice, stockUnit) {
    if (!baseUnitPrice || baseUnitPrice === 0) return 0;
    
    const normalizedUnit = normalizeUnit(stockUnit);
    
    if (normalizedUnit === 'kg') {
        return baseUnitPrice * 1000;
    } else if (normalizedUnit === 'l') {
        return baseUnitPrice * 1000;
    }
    
    return baseUnitPrice;
}

/**
 * Carrega dados completos dos ingredientes com cache
 * ALTERAÇÃO: Usa cache para reduzir requisições
 * @param {Array} items - Itens da nota fiscal
 * @returns {Promise<Array>} Itens com dados completos dos ingredientes
 */
async function loadItemsWithIngredientData(items) {
    return Promise.all((items || []).map(async (item) => {
        const ingredientId = item.ingredient_id || item.ingredient?.id;
        let ingredientData = item.ingredient || { name: item.ingredient_name || item.name || 'Item' };

        if (ingredientId) {
            try {
                // ALTERAÇÃO: Usar cache para reduzir requisições
                const cacheKey = `ingredient:${ingredientId}`;
                let fullIngredient = cacheManager.get(cacheKey);
                
                if (!fullIngredient) {
                    fullIngredient = await getIngredientById(ingredientId);
                    // ALTERAÇÃO: Cache por 10 minutos
                    cacheManager.set(cacheKey, fullIngredient, 10 * 60 * 1000);
                }

                if (fullIngredient) {
                    ingredientData = {
                        id: fullIngredient.id,
                        name: fullIngredient.name || ingredientData.name || item.ingredient_name || item.name || 'Item',
                        stock_unit: fullIngredient.stock_unit || ingredientData.stock_unit || 'un'
                    };
                } else {
                    if (!ingredientData.stock_unit) {
                        ingredientData.stock_unit = 'un';
                    }
                }
            } catch (error) {
                if (!ingredientData.stock_unit) {
                    ingredientData.stock_unit = 'un';
                }
            }
        } else {
            if (!ingredientData.stock_unit) {
                ingredientData.stock_unit = 'un';
            }
        }

        return {
            ...item,
            ingredient_data: ingredientData
        };
    }));
}

/**
 * Exibe modal com detalhes da nota fiscal
 * ALTERAÇÃO: Utility compartilhada extraída de compras-manager.js
 * @param {Object} invoice - Dados da nota fiscal
 */
export async function showPurchaseInvoiceModal(invoice) {
    // Criar ou obter modal seguindo padrão do sistema
    let modal = document.getElementById('modal-compra-detalhes');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modal-compra-detalhes';
        modal.className = 'modal';
        document.body.appendChild(modal);
    }

    const invoiceNumber = escapeHTML(invoice.invoice_number || 'N/A');
    const supplierName = escapeHTML(invoice.supplier_name || 'Fornecedor não informado');
    const totalAmount = parseFloat(invoice.total_amount || invoice.total || 0);
    const purchaseDate = invoice.purchase_date || invoice.date || invoice.created_at;
    const paymentMethod = formatPaymentMethod(invoice.payment_method || '-');
    // ALTERAÇÃO: Validar paymentStatus para uso como classe CSS (prevenir CSS injection)
    const rawPaymentStatus = (invoice.payment_status || 'Pending').toLowerCase();
    const paymentStatus = (rawPaymentStatus === 'pending' || rawPaymentStatus === 'paid') 
        ? rawPaymentStatus 
        : 'pending';
    const statusLabel = translateStatus(invoice.payment_status || 'Pending');
    const notes = invoice.notes || invoice.observations || '';
    const items = invoice.items || [];

    // ALTERAÇÃO: Carregar dados completos dos ingredientes com cache
    const itemsWithIngredientData = await loadItemsWithIngredientData(items);

    // ALTERAÇÃO: Estrutura HTML seguindo padrão do sistema com melhorias de acessibilidade
    modal.innerHTML = `
        <div class="div-overlay" data-close-modal="modal-compra-detalhes" role="button" tabindex="0" aria-label="Fechar modal"></div>
        <div class="modal-content-compra-detalhes" role="dialog" aria-labelledby="modal-compra-title" aria-modal="true">
            <div class="header-modal">
                <h2 id="modal-compra-title">Detalhes da Nota Fiscal ${invoiceNumber}</h2>
                <button type="button" class="fechar-modal" data-close-modal="modal-compra-detalhes" aria-label="Fechar modal" tabindex="0">
                    <i class="fa-solid fa-xmark" aria-hidden="true"></i>
                </button>
            </div>
            <div class="conteudo-modal">
                <div class="invoice-details">
                    <div class="invoice-detail-section">
                        <h3>Informações Gerais</h3>
                        <div class="invoice-detail-grid">
                            <div class="invoice-detail-item">
                                <span class="label">Fornecedor:</span>
                                <span class="value">${supplierName}</span>
                            </div>
                            <div class="invoice-detail-item">
                                <span class="label">Data de Compra:</span>
                                <span class="value">${formatDate(purchaseDate)}</span>
                            </div>
                            <div class="invoice-detail-item">
                                <span class="label">Valor Total:</span>
                                <span class="value highlight">R$ ${formatCurrency(totalAmount)}</span>
                            </div>
                            <div class="invoice-detail-item">
                                <span class="label">Método de Pagamento:</span>
                                <span class="value">${escapeHTML(paymentMethod)}</span>
                            </div>
                            <div class="invoice-detail-item">
                                <span class="label">Status:</span>
                                <span class="financial-badge status-${paymentStatus}">${escapeHTML(statusLabel)}</span>
                            </div>
                            ${notes ? `
                            <div class="invoice-detail-item" style="grid-column: 1 / -1;">
                                <span class="label">Observações:</span>
                                <span class="value">${escapeHTML(notes)}</span>
                            </div>
                            ` : ''}
                        </div>
                    </div>

                    ${itemsWithIngredientData.length > 0 ? `
                    <div class="invoice-detail-section">
                        <h3>Itens da Nota Fiscal</h3>
                        <div class="invoice-items-list">
                            <table class="invoice-items-table">
                                <thead>
                                    <tr>
                                        <th>Item</th>
                                        <th>Quantidade</th>
                                        <th>Valor Unitário</th>
                                        <th>Total</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${itemsWithIngredientData.map(item => {
                                        const quantity = item.quantity || 1;
                                        const stockUnit = item.ingredient_data?.stock_unit || 'un';
                                        const formattedQuantity = formatQuantity(quantity, stockUnit);
                                        
                                        const unitPriceFromAPI = item.unit_price || item.price || 0;
                                        const totalPrice = item.total_price || (unitPriceFromAPI * quantity);
                                        
                                        const normalizedUnit = normalizeUnit(stockUnit);
                                        let displayUnitPrice;
                                        const isOldData = (normalizedUnit === 'kg' || normalizedUnit === 'l') && 
                                                         unitPriceFromAPI < 0.1;
                                        if (isOldData) {
                                            displayUnitPrice = formatUnitPrice(unitPriceFromAPI, stockUnit);
                                        } else {
                                            displayUnitPrice = unitPriceFromAPI;
                                        }
                                        
                                        const itemName = item.ingredient_name || 
                                                       item.ingredient_data?.name || 
                                                       item.name || 
                                                       item.product_name || 
                                                       'Item';
                                        
                                        return `
                                        <tr>
                                            <td>${escapeHTML(itemName)}</td>
                                            <td>${escapeHTML(formattedQuantity)}</td>
                                            <td>R$ ${formatCurrency(displayUnitPrice)}</td>
                                            <td>R$ ${formatCurrency(totalPrice)}</td>
                                        </tr>
                                    `;
                                    }).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                    ` : ''}
                </div>
            </div>
            <div class="footer-modal">
                <button type="button" class="btn-cancelar" data-close-modal="modal-compra-detalhes" aria-label="Fechar modal de detalhes da nota fiscal">Fechar</button>
            </div>
        </div>
    `;

    // ALTERAÇÃO: Configurar event listeners do modal antes de abrir
    // ALTERAÇÃO: Usar função nomeada para permitir remoção se necessário
    const handleCloseModal = () => {
        fecharModal('modal-compra-detalhes');
    };
    
    // ALTERAÇÃO: Adicionar listeners para todos os elementos de fechar (clique e teclado)
    const closeButtons = modal.querySelectorAll('[data-close-modal="modal-compra-detalhes"]');
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
    const modalContent = modal.querySelector('.modal-content-compra-detalhes');
    if (modalContent) {
        modalContent.setAttribute('tabindex', '-1');
    }

    // Garantir que o modal está no DOM antes de abrir
    if (!document.body.contains(modal)) {
        document.body.appendChild(modal);
    }

    // ALTERAÇÃO: Usar sistema de modais.js para abrir modal
    setTimeout(() => {
        abrirModal('modal-compra-detalhes');
        // ALTERAÇÃO: Focar no conteúdo do modal para acessibilidade
        if (modalContent) {
            modalContent.focus();
        }
    }, 10);
}

