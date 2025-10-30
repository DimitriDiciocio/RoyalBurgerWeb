/**
 * Histórico de Pedidos
 * Interface para clientes visualizarem seus pedidos
 */

import { getMyOrders, getOrderDetails, cancelOrder, formatOrderStatus, getStatusColor } from '../api/orders.js';
import { getIngredients } from '../api/ingredients.js';
import { showError, showSuccess } from './alerts.js';

// Função de sanitização para prevenir XSS
function escapeHTML(text) {
    if (typeof text !== 'string') return String(text || '');
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

(function initOrderHistory() {
    if (!window.location.pathname.includes('hist-pedidos.html')) return;

    const state = {
        orders: [],
        filteredOrders: [],
        currentOrder: null,
        ingredientsCache: null, // Cache de ingredientes para buscar preços
        filters: {
            status: ''
        },
        pagination: {
            currentPage: 1,
            itemsPerPage: 5,
            totalItems: 0
        },
        loading: false,
        error: null
    };

    // Refs DOM
    let el = {};

    // Inicializar elementos DOM
    function initElements() {
        el = {
            // Filtros
            filterStatus: document.getElementById('filter-status'),
            btnRefresh: document.getElementById('btn-refresh'),

            // Lista de pedidos
            ordersContainer: document.getElementById('orders-container'),
            pagination: document.getElementById('pagination'),

            // Modal não é mais necessária - redireciona para info-pedido.html
        };
    }

    // Carregar cache de ingredientes para buscar preços
    async function loadIngredientsCache() {
        if (state.ingredientsCache) return state.ingredientsCache;
        
        try {
            const response = await getIngredients({ page_size: 1000 });
            const ingredients = response.items || [];
            state.ingredientsCache = {};
            
            // Criar um mapa ID -> ingrediente para busca rápida
            ingredients.forEach(ing => {
                state.ingredientsCache[ing.id] = {
                    price: parseFloat(ing.price) || 0,
                    additional_price: parseFloat(ing.additional_price) || 0
                };
            });
            
            // Log apenas em desenvolvimento
            if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'development') {
                console.log('Cache de ingredientes carregado:', Object.keys(state.ingredientsCache).length, 'ingredientes');
            }
            return state.ingredientsCache;
        } catch (err) {
            // Log apenas em desenvolvimento
            if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'development') {
                console.warn('Erro ao carregar ingredientes para cache:', err);
            }
            state.ingredientsCache = {};
            return state.ingredientsCache;
        }
    }

    // Carregar pedidos do usuário
    async function loadOrders() {
        state.loading = true;
        state.error = null;

        try {
            // Log apenas em desenvolvimento
            const isDev = typeof process !== 'undefined' && process.env?.NODE_ENV === 'development';
            
            if (isDev) {
                console.log('Carregando pedidos...');
            }
            
            // Carregar cache de ingredientes primeiro
            await loadIngredientsCache();
            
            const result = await getMyOrders();
            
            if (isDev) {
                console.log('Resultado da API:', result);
            }
            
            if (result.success) {
                const ordersList = result.data || [];
                
                if (isDev) {
                    console.log('Pedidos carregados:', ordersList);
                    console.log(`Buscando detalhes de ${ordersList.length} pedido(s)...`);
                }
                
                // Buscar detalhes completos de cada pedido para obter itens e totais
                // Usar Promise.allSettled para evitar falha completa se um pedido falhar
                const ordersWithDetails = await Promise.allSettled(
                    ordersList.map(async (order) => {
                        const orderId = order.order_id || order.id;
                        try {
                            const detailsResult = await getOrderDetails(orderId);
                            
                            if (detailsResult.success && detailsResult.data) {
                                // Combinar dados básicos com detalhes completos
                                return {
                                    ...order,
                                    ...detailsResult.data,
                                    order_id: orderId
                                };
                            }
                            return order;
                        } catch (err) {
                            if (isDev) {
                                console.error(`Erro ao buscar detalhes do pedido ${orderId}:`, err);
                            }
                            return order;
                        }
                    })
                ).then(results => 
                    results.map(result => result.status === 'fulfilled' ? result.value : null)
                           .filter(order => order !== null)
                );
                
                state.orders = ordersWithDetails;
                applyFilters();
            } else {
                state.error = result.error;
                showError('Erro ao carregar pedidos: ' + (result.error || 'Erro desconhecido'));
            }
        } catch (error) {
            // Log apenas em desenvolvimento - erro já é exibido ao usuário via showError
            const isDev = typeof process !== 'undefined' && process.env?.NODE_ENV === 'development';
            if (isDev) {
                console.error('Erro ao carregar pedidos:', error);
            }
            state.error = error.message;
            showError('Erro ao carregar pedidos: ' + error.message);
        } finally {
            state.loading = false;
        }
    }

    // Aplicar filtros
    function applyFilters() {
        let filtered = [...state.orders];

        // Filtro por status
        if (state.filters.status) {
            filtered = filtered.filter(order => order.status === state.filters.status);
        }

        state.filteredOrders = filtered;
        updatePagination();
        renderOrders();
    }

    // Atualizar paginação
    function updatePagination() {
        state.pagination.totalItems = state.filteredOrders.length;
        state.pagination.currentPage = 1; // Reset para primeira página
        renderPagination();
    }

    // Renderizar paginação
    function renderPagination() {
        if (!el.pagination) return;

        const totalPages = Math.ceil(state.pagination.totalItems / state.pagination.itemsPerPage);
        
        if (totalPages <= 1) {
            el.pagination.innerHTML = '';
            return;
        }

        let html = '<div class="pagination-controls">';
        
        // Botão anterior
        if (state.pagination.currentPage > 1) {
            html += `<button class="pagination-btn" data-page="${state.pagination.currentPage - 1}">
                <i class="fa-solid fa-chevron-left"></i>
            </button>`;
        }

        // Páginas
        const startPage = Math.max(1, state.pagination.currentPage - 2);
        const endPage = Math.min(totalPages, state.pagination.currentPage + 2);

        for (let i = startPage; i <= endPage; i++) {
            const isActive = i === state.pagination.currentPage ? 'active' : '';
            html += `<button class="pagination-btn ${isActive}" data-page="${i}">${i}</button>`;
        }

        // Botão próximo
        if (state.pagination.currentPage < totalPages) {
            html += `<button class="pagination-btn" data-page="${state.pagination.currentPage + 1}">
                <i class="fa-solid fa-chevron-right"></i>
            </button>`;
        }

        html += '</div>';
        el.pagination.innerHTML = html;
    }

    // Formatar data para exibição
    function formatDate(dateString) {
        if (!dateString) return 'Data não disponível';
        
        try {
            const date = new Date(dateString);
            if (isNaN(date.getTime())) return dateString;
            
            return date.toLocaleDateString('pt-BR', {
                weekday: 'short',
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch (e) {
            return dateString;
        }
    }

    // Formatar valor monetário
    function formatCurrency(value) {
        const numValue = parseFloat(value || 0);
        return numValue.toFixed(2).replace('.', ',');
    }

    // Formatar telefone para exibição
    function formatarTelefone(telefone) {
        if (!telefone || telefone === '(00)0000-000' || telefone === 'Não informado') {
            return telefone || '(00)0000-000';
        }
        
        if (typeof telefone !== 'string' && typeof telefone !== 'number') {
            return String(telefone);
        }
        
        const telefoneLimpo = String(telefone).replace(/\D/g, '');
        
        if (telefoneLimpo.length === 11) {
            // Celular: (XX) XXXXX-XXXX
            return telefoneLimpo.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
        } else if (telefoneLimpo.length === 10) {
            // Fixo: (XX) XXXX-XXXX
            return telefoneLimpo.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
        }
        
        // Se não tiver tamanho válido, retorna o original
        return telefone;
    }

    // Renderizar lista de pedidos
    function renderOrders() {
        if (!el.ordersContainer) return;

        const startIndex = (state.pagination.currentPage - 1) * state.pagination.itemsPerPage;
        const endIndex = startIndex + state.pagination.itemsPerPage;
        const ordersToShow = state.filteredOrders.slice(startIndex, endIndex);

        if (ordersToShow.length === 0) {
            el.ordersContainer.innerHTML = `
                <div class="empty-state" style="text-align: center; padding: 40px; color: #666;">
                    <i class="fa-solid fa-clipboard-list" style="font-size: 48px; margin-bottom: 16px; opacity: 0.5;"></i>
                    <h3>Nenhum pedido encontrado</h3>
                    <p>Você ainda não fez nenhum pedido ou não há pedidos que correspondam aos filtros selecionados.</p>
                    <a href="../../index.html" style="display: inline-block; margin-top: 20px; padding: 12px 24px; background: #ff6b35; color: white; text-decoration: none; border-radius: 8px;">Fazer primeiro pedido</a>
                </div>
            `;
            return;
        }

        // Buscar dados do usuário para exibir nome e telefone
        const usuario = window.getStoredUser ? window.getStoredUser() : null;
        const nomeUsuario = usuario?.full_name || usuario?.name || 'Nome Completo';
        const telefoneBruto = usuario?.phone || usuario?.telefone || '(00)0000-000';
        const telefoneUsuario = formatarTelefone(telefoneBruto);

        const ordersHtml = ordersToShow.map(order => {
            // Extrair ID do pedido (pode ser order_id ou id)
            const orderId = order.order_id || order.id;
            // Obter código de confirmação (sanitizado)
            const confirmationCode = escapeHTML(order.confirmation_code || 'N/A');
            // Mapear texto do status - usando "Recebido" em vez de "Pendente"
            let statusText = formatOrderStatus(order.status);
            if (order.status === 'pending') {
                statusText = 'Recebido';
            }
            // Sanitizar texto do status
            statusText = escapeHTML(statusText);
            const createdAt = formatDate(order.created_at);
            
            // Formatar endereço (sanitizado)
            const address = escapeHTML(order.address || 'Endereço não informado');
            
            // Formatar total
            const total = order.total_amount || order.total || 0;
            const totalFormatted = formatCurrency(total);
            
            // Obter itens do pedido
            const items = order.items || [];
            // Remover cálculo não utilizado para limpeza de código
            
            // Determinar classe CSS do status para o HTML
            let statusCssClass = '';
            switch(order.status) {
                case 'preparing':
                    statusCssClass = 'preparo';
                    break;
                case 'on_the_way':
                    statusCssClass = 'entrega';
                    break;
                case 'completed':
                case 'delivered':
                    statusCssClass = 'concluido';
                    break;
                case 'pending':
                    statusCssClass = 'recebido';
                    break;
                case 'cancelled':
                    statusCssClass = 'cancelado';
                    break;
                default:
                    statusCssClass = 'recebido';
                    break;
            }
            
            // Log removido de produção - dados sensíveis

            return `<div class="quadro-pedido" data-order-id="${escapeHTML(String(orderId))}">
                    <div class="header">
                        <div class="div1">
                            <div class="principal">
                                <p class="n-pedido">${confirmationCode}</p>
                                <p class="status-pedido ${statusCssClass}">${statusText}</p>
                            </div>
                            <div class="prazo">
                                <i class="fa-solid fa-clock"></i>
                                <p>35 - 50min</p>
                            </div>
                        </div>

                        <p class="tempo-pedido">${createdAt}</p>
                    </div>

                    <div class="main">
                        <div class="div-1">
                            <div class="div-2">
                                <p>${escapeHTML(nomeUsuario)}</p>

                                <div class="fone">
                                    <i class="fa-solid fa-phone"></i>
                                    <p>${escapeHTML(telefoneUsuario)}</p>
                                </div>
                            </div>

                            <div class="endereco">
                                <i class="fa-solid fa-location-dot"></i>
                                <p>${address}</p>
                            </div>
                        </div>

                        <div class="pedidos">
                            ${items.length > 0 ? items.map(item => {
                                // Sanitizar nome do produto
                                const itemName = escapeHTML(item.product_name || item.product?.name || 'Produto');
                                const itemQuantity = parseInt(item.quantity || 1, 10);
                                
                                // Calcular preço total incluindo extras e modificações
                                let itemTotal = 0;
                                
                                // Priorizar item_subtotal se disponível
                                if (item.item_subtotal !== undefined && item.item_subtotal !== null) {
                                    itemTotal = parseFloat(item.item_subtotal) || 0;
                                } else if (item.subtotal !== undefined && item.subtotal !== null) {
                                    itemTotal = parseFloat(item.subtotal) || 0;
                                } else {
                                    // Calcular manualmente: unit_price do produto + unit_price de cada extra
                                    const basePrice = parseFloat(item.unit_price || item.product?.price || 0);
                                    
                                    // Somar unit_price de cada EXTRA vinculado ao produto e pedido
                                    let extrasTotal = 0;
                                    if (Array.isArray(item.extras) && item.extras.length > 0) {
                                        extrasTotal = item.extras.reduce((sum, extra) => {
                                            // Usar unit_price do extra (valor unitário do ingrediente extra)
                                            const unitPrice = parseFloat(
                                                extra.unit_price || 
                                                extra.ingredient_unit_price || 
                                                extra.ingredient_price || 
                                                extra.price || 
                                                extra.additional_price || 
                                                0
                                            );
                                            return sum + unitPrice;
                                        }, 0);
                                    }
                                    
                                    // Somar unit_price de cada BASE_MODIFICATION vinculado ao produto e pedido
                                    // BASE_MODIFICATIONS: cobrar apenas pelo delta positivo (quantidade extra além da receita base)
                                    let baseModsTotal = 0;
                                    if (Array.isArray(item.base_modifications) && item.base_modifications.length > 0) {
                                        baseModsTotal = item.base_modifications.reduce((sum, mod) => {
                                            const delta = parseInt(String(mod.delta || 0), 10);
                                            if (delta > 0) {
                                                // Buscar preço do ingrediente pelo ingredient_id usando cache
                                                const ingredientId = mod.ingredient_id || mod.id;
                                                let unitPrice = 0;
                                                
                                                if (ingredientId && state.ingredientsCache) {
                                                    const ingredient = state.ingredientsCache[ingredientId];
                                                    if (ingredient) {
                                                        // Usar additional_price se disponível, senão usar price
                                                        unitPrice = ingredient.additional_price || ingredient.price || 0;
                                                    }
                                                }
                                                
                                                // Fallback: tentar campos diretos no mod se o cache não tiver o ingrediente
                                                if (unitPrice === 0) {
                                                    unitPrice = parseFloat(
                                                        mod.unit_price || 
                                                        mod.ingredient_unit_price || 
                                                        mod.ingredient_price || 
                                                        mod.price || 
                                                        0
                                                    );
                                                }
                                                
                                                // Multiplicar pelo delta (quantidade extra)
                                                return sum + (unitPrice * delta);
                                            }
                                            return sum;
                                        }, 0);
                                    }
                                    
                                    // Preço unitário total = unit_price do produto + unit_price de cada extra + unit_price * delta de cada modificação
                                    const unitTotal = basePrice + extrasTotal + baseModsTotal;
                                    
                                    // Total = preço unitário total * quantidade do item
                                    itemTotal = unitTotal * itemQuantity;
                                }
                                
                                return `
                                    <div class="pedido">
                                        <div>
                                            <p class="qtd">${itemQuantity}</p>
                                            <p class="nome">${itemName}</p>
                                        </div>

                                        <p class="preco">R$ ${formatCurrency(itemTotal)}</p>
                                    </div>
                                `;
                            }).join('') : `
                                <div class="pedido">
                                    <div>
                                        <p class="qtd">-</p>
                                        <p class="nome">Carregando itens...</p>
                                    </div>

                                    <p class="preco">-</p>
                                </div>
                            `}
                        </div>
                    </div>

                    <div class="footer">
                        <button class="btn-view-details" data-order-id="${orderId}">Ver mais</button>
                        <div>
                            <p>Total</p>
                            <p>R$ ${totalFormatted}</p>
                        </div>
                    </div>
            </div>`;
        }).join('');

        el.ordersContainer.innerHTML = ordersHtml;
    }

    // Carregar detalhes do pedido - Redireciona para página de detalhes
    function loadOrderDetails(orderId) {
        // Redirecionar para página de detalhes do pedido
        window.location.href = `info-pedido.html?id=${orderId}`;
    }

    // Nota: Detalhes do pedido são visualizados na página info-pedido.html
    // Esta função redireciona para lá ao invés de renderizar em modal

    // Anexar eventos
    function attachEvents() {
        // Filtros
        if (el.filterStatus) {
            el.filterStatus.addEventListener('change', (e) => {
                state.filters.status = e.target.value;
                applyFilters();
            });
        }

        // Botão refresh
        if (el.btnRefresh) {
            el.btnRefresh.addEventListener('click', async () => {
                await loadOrders();
            });
        }

        // Paginação
        if (el.pagination) {
            el.pagination.addEventListener('click', (e) => {
                const btn = e.target.closest('.pagination-btn');
                if (btn && btn.dataset.page) {
                    const pageNum = parseInt(String(btn.dataset.page), 10);
                    if (!isNaN(pageNum) && pageNum > 0) {
                        state.pagination.currentPage = pageNum;
                        renderOrders();
                    }
                }
            });
        }


        // Lista de pedidos (delegation)
        if (el.ordersContainer) {
            el.ordersContainer.addEventListener('click', (e) => {
                const btn = e.target.closest('button');
                if (!btn) return;

                const orderId = btn.dataset.orderId;
                if (!orderId) return;
                
                // Validar que orderId é um número válido
                const orderIdNum = parseInt(String(orderId), 10);
                if (isNaN(orderIdNum) || orderIdNum <= 0) {
                    showError('ID do pedido inválido');
                    return;
                }

                if (btn.classList.contains('btn-view-details')) {
                    loadOrderDetails(orderIdNum);
                }
            });
        }
    }

    // Utilitários de notificação (usando sistema global de alerts)
    // As funções showError e showSuccess são importadas de alerts.js

    // Verificar se usuário está logado
    function checkUserLogin() {
        const user = window.getStoredUser ? window.getStoredUser() : null;
        if (!user) {
            alert('Você precisa estar logado para ver seu histórico de pedidos.');
            window.location.href = 'login.html';
            return false;
        }
        return true;
    }

    // Inicializar
    async function init() {
        if (!checkUserLogin()) return;

        initElements();
        attachEvents();
        await loadOrders();
    }

    // Inicializar quando DOM estiver pronto
    document.addEventListener('DOMContentLoaded', init);
})();
