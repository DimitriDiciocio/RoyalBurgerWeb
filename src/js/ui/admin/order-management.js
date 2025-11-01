/**
 * Gerenciamento de Pedidos - Painel Administrativo
 * Interface para administradores gerenciarem pedidos em tempo real
 */

// APIs exclusivas para gerenciamento administrativo (não histórico)
import { getAllOrders, getOrderDetails, updateOrderStatus, formatOrderStatus } from '../../api/orders.js';
import { getDashboardMetrics, formatCurrency, formatTime } from '../../api/dashboard.js';
import { showSuccess, showError, showConfirm } from '../alerts.js';

(function initOrderManagement() {
    // Verificar se estamos na página do painel administrativo e se a seção de pedidos existe
    // Esta seção é diferente do histórico de pedidos (hist-pedidos.html)
    const secaoPedidos = document.getElementById('secao-pedidos');
    if (!secaoPedidos) return;
    
    // Verificar se estamos no painel administrativo (não no histórico)
    if (!document.getElementById('nav-pedidos')) {
        // REVISAR: Remover console.warn em produção ou usar sistema de logging
        if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'development') {
            console.warn('order-management.js: Seção de pedidos do painel administrativo não encontrada');
        }
        return;
    }

    const state = {
        orders: [],
        filteredOrders: [],
        currentOrder: null,
        metrics: {},
        filters: {
            search: '',
            status: '',
            channel: '',
            period: 'today'
        },
        loading: false,
        error: null,
        autoRefresh: true,
        refreshInterval: null,
        visibilityCheckInterval: null // Adicionado para evitar vazamento de memória
    };

    // Refs DOM
    let el = {};

    // Inicializar elementos DOM
    function initElements() {
        el = {
            // Filtros
            searchInput: document.getElementById('busca-pedido'),
            filterStatus: document.getElementById('filtro-status-pedido'),
            filterChannel: document.getElementById('filtro-canais-pedido'),
            filterPeriod: document.getElementById('filtro-data-pedido'),

            // Métricas
            metricActiveOrders: document.getElementById('metric-active-orders'),
            metricNovos: document.getElementById('metric-novos'),
            metricEmPreparo: document.getElementById('metric-em-preparo'),
            metricProntosEntrega: document.getElementById('metric-prontos-entrega'),
            metricPronto: document.getElementById('metric-pronto'),
            metricEntrega: document.getElementById('metric-entrega'),
            metricConcluidos: document.getElementById('metric-concluidos'),
            metricCancelados: document.getElementById('metric-cancelados'),
            metricTempoMedio: document.getElementById('metric-tempo-medio'),
            metricAtrasos: document.getElementById('metric-atrasos'),

            // Lista de pedidos
            ordersList: document.getElementById('orders-list')
        };
    }

    // ============================================================================
    // Funções utilitárias exclusivas para gerenciamento administrativo
    // (NÃO compartilhadas com histórico de pedidos)
    // ============================================================================

    /**
     * Formatar data para exibição no painel administrativo
     * @param {string} dateString - String de data ISO
     * @returns {string} Data formatada ou fallback
     */
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

    /**
     * Sanitizar HTML para prevenir XSS
     * @param {any} text - Texto a ser sanitizado
     * @returns {string} HTML sanitizado
     */
    function escapeHTML(text) {
        if (text === null || text === undefined) return '';
        if (typeof text !== 'string') {
            // Converter para string de forma segura, evitando null/undefined
            try {
                return String(text);
            } catch (e) {
                return '';
            }
        }
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Formatar telefone para exibição
     * @param {string|number} phone - Telefone a ser formatado
     * @returns {string} Telefone formatado
     */
    function formatPhone(phone) {
        if (!phone || phone === '(00)0000-000' || phone === 'Não informado') {
            return phone || '(00)0000-000';
        }
        
        const phoneClean = String(phone).replace(/\D/g, '');
        
        if (phoneClean.length === 11) {
            return phoneClean.replace(/(\d{2})(\d{5})(\d{4})/, '($1)$2-$3');
        } else if (phoneClean.length === 10) {
            return phoneClean.replace(/(\d{2})(\d{4})(\d{4})/, '($1)$2-$3');
        }
        
        return phone;
    }

    /**
     * Calcular tempo estimado e retornar status visual (verde/amarelo/vermelho)
     * @param {Object} order - Objeto do pedido
     * @returns {Object} Objeto com tempo atual, máximo e classe de cor
     */
    function calculateTimeEstimate(order) {
        if (!order?.created_at) {
            return { text: '-min / -min', currentMinutes: 0, maxMinutes: 0, colorClass: '' };
        }
        
        // Não calcular tempo para pedidos pagos/completos
        if (order.status === 'paid' || order.status === 'completed') {
            return { text: '- / -', currentMinutes: 0, maxMinutes: 0, colorClass: '' };
        }
        
        const now = new Date();
        const created = new Date(order.created_at);
        // Corrigido: Usar Math.floor para evitar problemas de precisão
        const diffMinutes = Math.floor((now - created) / 60000);
        
        // Priorizar estimated_delivery da API se disponível
        if (order.estimated_delivery) {
            const estimated = order.estimated_delivery.estimated_time || order.estimated_delivery.total || 0;
            const estimatedMax = estimated;
            const estimatedMin = Math.floor(estimated * 0.8); // Alerta quando passar de 80% do tempo
            
            // Determinar cor baseado no tempo decorrido vs estimado
            let colorClass = 'time-green'; // Verde: dentro do prazo
            
            if (diffMinutes > estimatedMax) {
                colorClass = 'time-red'; // Vermelho: passou do prazo
            } else if (diffMinutes > estimatedMin) {
                colorClass = 'time-yellow'; // Amarelo: perto do prazo
            }
            
            return {
                text: `${diffMinutes}min / ${estimatedMax}min`,
                currentMinutes: diffMinutes,
                maxMinutes: estimatedMax,
                colorClass: colorClass
            };
        }
        
        // Fallback: calcular localmente se API não forneceu
        // Tempo máximo estimado baseado no status
        let estimatedMax = 0;
        let estimatedMin = 0;
        
        switch (order.status) {
            case 'pending':
                // Pedido novo: máximo 10 minutos
                estimatedMax = 10;
                estimatedMin = 5; // Alerta quando passar de 5 minutos
                break;
                
            case 'preparing':
                // Preparo: soma dos tempos de preparo dos produtos cadastrados no banco
                if (order.items && Array.isArray(order.items) && order.items.length > 0) {
                    estimatedMax = order.items.reduce((total, item) => {
                        const product = item.product || {};
                        
                        // Buscar tempo de preparo do produto
                        let prepTime = 0;
                        
                        // 1. Do produto diretamente
                        if (product.preparation_time_minutes !== undefined && product.preparation_time_minutes !== null) {
                            prepTime = parseInt(product.preparation_time_minutes, 10);
                        }
                        // 2. Do item (se vier do backend)
                        else if (item.preparation_time_minutes !== undefined && item.preparation_time_minutes !== null) {
                            prepTime = parseInt(item.preparation_time_minutes, 10);
                        }
                        // Se não tiver tempo cadastrado, permanece 0 (será tratado depois)
                        
                        const quantity = parseInt(item.quantity || 1, 10);
                        // Garantir que prepTime seja número válido
                        const validPrepTime = isNaN(prepTime) ? 0 : Math.max(0, prepTime);
                        return total + (validPrepTime * quantity);
                    }, 0);
                    
                    // Se não tiver tempo de preparo cadastrado em nenhum produto, usar padrão de 15 minutos
                    if (estimatedMax === 0) {
                        estimatedMax = 15;
                    }
                    
                    estimatedMin = Math.floor(estimatedMax * 0.7); // Alerta quando passar de 70% do tempo
                } else {
                    // Fallback se não tiver itens
                    estimatedMax = 15;
                    estimatedMin = 10;
                }
                break;
                
            case 'on_the_way':
                // Entrega: máximo 30 minutos
                estimatedMax = 30;
                estimatedMin = 20; // Alerta quando passar de 20 minutos
                break;
                
            default:
                estimatedMax = 50;
                estimatedMin = 35;
                break;
        }
        
        // Determinar cor baseado no tempo decorrido vs estimado
        let colorClass = 'time-green'; // Verde: dentro do prazo
        
        if (diffMinutes > estimatedMax) {
            colorClass = 'time-red'; // Vermelho: passou do prazo
        } else if (diffMinutes > estimatedMin) {
            colorClass = 'time-yellow'; // Amarelo: perto do prazo
        }
        
        return {
            text: `${diffMinutes}min / ${estimatedMax}min`,
            currentMinutes: diffMinutes,
            maxMinutes: estimatedMax,
            colorClass: colorClass
        };
    }

    /**
     * Obter texto do botão de ação baseado no status
     * @param {string} status - Status atual do pedido
     * @returns {string} Texto do botão
     */
    function getActionButtonText(status) {
        const actionMap = {
            'pending': 'Iniciar Preparo',
            'preparing': 'Enviar para Entrega',
            'on_the_way': 'Marcar como Concluído',
            'completed': 'Pedido concluído',
            'cancelled': 'Pedido cancelado'
        };
        return actionMap[status] || 'Atualizar status';
    }

    /**
     * Obter próximo status baseado no status atual (conforme fluxo da API)
     * @param {string} currentStatus - Status atual
     * @returns {string} Próximo status
     */
    function getNextStatus(currentStatus) {
        const statusFlow = {
            'pending': 'preparing',      // pending → preparing
            'preparing': 'on_the_way',   // preparing → on_the_way (sem 'ready')
            'on_the_way': 'completed',   // on_the_way → completed (sem 'delivered'/'paid')
            'delivered': 'completed',    // delivered → completed (se existir)
            'paid': 'completed'          // paid → completed (se existir)
        };
        return statusFlow[currentStatus] || currentStatus;
    }

    /**
     * Obter classe CSS do status
     * @param {string} status - Status do pedido
     * @returns {string} Classe CSS
     */
    function getStatusClass(status) {
        const classMap = {
            'pending': 'status-novo',
            'preparing': 'status-preparo',
            'ready': 'status-pronto',
            'on_the_way': 'status-entrega',
            'delivered': 'status-concluido',
            'paid': 'status-concluido',
            'completed': 'status-concluido',
            'cancelled': 'status-cancelado'
        };
        return classMap[status] || 'status-novo';
    }

    /**
     * Calcular métricas a partir dos pedidos e dados do dashboard
     * @param {Object|null} dashboardMetrics - Métricas do dashboard (opcional)
     * @returns {Object} Métricas calculadas
     */
    function calculateMetrics(dashboardMetrics = null) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const metrics = {
            novos: 0,
            emPreparo: 0,
            pronto: 0,
            entrega: 0,
            concluidos: 0,
            cancelados: 0,
            ativos: 0,
            prontosEntrega: 0,
            tempoMedio: 0,
            atrasos: 0
        };

        // Filtrar pedidos de hoje
        const todayOrders = state.orders.filter(order => {
            if (!order?.created_at) return false;
            try {
                const orderDate = new Date(order.created_at);
                if (isNaN(orderDate.getTime())) return false;
                orderDate.setHours(0, 0, 0, 0);
                return orderDate.getTime() === today.getTime();
            } catch (e) {
                return false;
            }
        });

        // Contar por status
        todayOrders.forEach(order => {
            switch (order.status) {
                case 'pending':
                    metrics.novos++;
                    metrics.ativos++;
                    break;
                case 'preparing':
                    metrics.emPreparo++;
                    metrics.ativos++;
                    
                    // Pedidos prontos: preparing há mais de 15 minutos
                    if (order.created_at) {
                        try {
                            const created = new Date(order.created_at);
                            const now = new Date();
                            const minutesSinceCreation = (now - created) / (1000 * 60);
                            if (minutesSinceCreation >= 15) {
                                metrics.pronto++;
                                metrics.prontosEntrega++;
                            }
                        } catch (e) {
                            // Ignorar erros de parsing de data
                        }
                    }
                    break;
                case 'on_the_way':
                    metrics.entrega++;
                    metrics.prontosEntrega++;
                    metrics.ativos++;
                    break;
                case 'completed':
                    metrics.concluidos++;
                    break;
                case 'cancelled':
                    metrics.cancelados++;
                    break;
            }
        });

        // Usar métricas do dashboard se disponíveis
        if (dashboardMetrics?.average_preparation_time) {
            metrics.tempoMedio = Math.round(dashboardMetrics.average_preparation_time);
        } else {
            // Calcular tempo médio de ciclo dos pedidos concluídos de hoje
            const completedOrders = todayOrders.filter(o => 
                o.status === 'completed' && o.created_at && o.updated_at
            );
            
            if (completedOrders.length > 0) {
                let totalMinutes = 0;
                let validCount = 0;
                
                completedOrders.forEach(order => {
                    try {
                        const created = new Date(order.created_at);
                        const updated = new Date(order.updated_at || order.created_at);
                        if (isNaN(created.getTime()) || isNaN(updated.getTime())) return;
                        
                        const diffMinutes = (updated - created) / (1000 * 60);
                        if (diffMinutes > 0 && isFinite(diffMinutes)) {
                            totalMinutes += diffMinutes;
                            validCount++;
                        }
                    } catch (e) {
                        // Ignorar erros de parsing
                    }
                });
                
                metrics.tempoMedio = validCount > 0 ? Math.round(totalMinutes / validCount) : 0;
            }
        }

        // Calcular atrasos (pedidos ativos há mais de 60 minutos)
        const delayedOrders = todayOrders.filter(order => {
            if (!['pending', 'preparing', 'on_the_way'].includes(order.status)) {
                return false;
            }
            if (!order.created_at) return false;
            
            try {
                const created = new Date(order.created_at);
                const now = new Date();
                if (isNaN(created.getTime())) return false;
                
                const minutesSinceCreation = (now - created) / (1000 * 60);
                return minutesSinceCreation > 60;
            } catch (e) {
                return false;
            }
        });
        metrics.atrasos = delayedOrders.length;

        return metrics;
    }

    /**
     * Atualizar exibição das métricas
     * @param {Object|null} dashboardMetrics - Métricas do dashboard (opcional)
     */
    function updateMetricsDisplay(dashboardMetrics = null) {
        const metrics = calculateMetrics(dashboardMetrics);

        if (el.metricActiveOrders) {
            el.metricActiveOrders.textContent = String(metrics.ativos).padStart(2, '0');
        }
        if (el.metricNovos) {
            el.metricNovos.textContent = `${metrics.novos} Novos`;
        }
        if (el.metricEmPreparo) {
            el.metricEmPreparo.textContent = `${metrics.emPreparo} Em preparo`;
        }
        if (el.metricProntosEntrega) {
            el.metricProntosEntrega.textContent = String(metrics.prontosEntrega).padStart(2, '0');
        }
        if (el.metricPronto) {
            el.metricPronto.textContent = `${metrics.pronto} Pronto`;
        }
        if (el.metricEntrega) {
            el.metricEntrega.textContent = `${metrics.entrega} Entrega`;
        }
        if (el.metricConcluidos) {
            el.metricConcluidos.textContent = String(metrics.concluidos).padStart(2, '0');
        }
        if (el.metricCancelados) {
            el.metricCancelados.textContent = `${metrics.cancelados} Cancelados`;
        }
        if (el.metricTempoMedio) {
            el.metricTempoMedio.textContent = formatTime(metrics.tempoMedio);
        }
        if (el.metricAtrasos) {
            el.metricAtrasos.textContent = `${metrics.atrasos} Atrasos hoje`;
        }
    }

    // ============================================================================
    // Funções de gerenciamento de pedidos (exclusivas do painel administrativo)
    // ============================================================================

    /**
     * Carregar pedidos para gerenciamento (todas as ordens, não apenas do usuário)
     * @returns {Promise<void>}
     */
    async function loadOrders() {
        // Prevenir múltiplas chamadas simultâneas
        if (state.loading) return;
        
        state.loading = true;
        state.error = null;

        try {
            // Buscar todos os pedidos
            const result = await getAllOrders();

            if (result.success) {
                let ordersList = result.data || [];
                
                // Otimização: Limitar número de requisições paralelas para evitar sobrecarga
                // REVISAR: Para produção, considerar implementar cache ou paginação
                const MAX_CONCURRENT_REQUESTS = 10;
                const ordersWithDetails = [];
                
                // Processar em lotes para evitar sobrecarga de requisições
                for (let i = 0; i < ordersList.length; i += MAX_CONCURRENT_REQUESTS) {
                    const batch = ordersList.slice(i, i + MAX_CONCURRENT_REQUESTS);
                    
                    const batchResults = await Promise.allSettled(
                        batch.map(async (order) => {
                            // Validar entrada antes de processar
                            if (!order || typeof order !== 'object') return null;
                            const orderId = order.order_id || order.id;
                            if (!orderId) return null;
                            
                            try {
                                const detailsResult = await getOrderDetails(orderId);
                                
                                if (detailsResult.success && detailsResult.data) {
                                    // Combinar dados básicos com detalhes completos
                                    return {
                                        ...order,
                                        ...detailsResult.data,
                                        order_id: orderId,
                                        id: orderId
                                    };
                                }
                                return order;
                            } catch (err) {
                                // REVISAR: Remover console.warn em produção ou usar sistema de logging
                                // Não expor detalhes do erro que possam conter dados sensíveis
                                if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'development') {
                                    console.warn(`Erro ao buscar detalhes do pedido ${orderId}:`, err.message);
                                }
                                return order; // Retornar ordem básica em caso de erro
                            }
                        })
                    );
                    
                    ordersWithDetails.push(
                        ...batchResults
                            .map(result => result.status === 'fulfilled' ? result.value : null)
                            .filter(order => order !== null)
                    );
                }
                
                state.orders = ordersWithDetails;
                
                // Buscar métricas do dashboard
                let dashboardMetrics = null;
                try {
                    const metricsResult = await getDashboardMetrics();
                    if (metricsResult.success) {
                        dashboardMetrics = metricsResult.data;
                    }
                } catch (err) {
                    // REVISAR: Remover console.warn em produção
                    if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'development') {
                        console.warn('Erro ao buscar métricas do dashboard:', err.message);
                    }
                }
                
                applyFilters();
                updateMetricsDisplay(dashboardMetrics);
            } else {
                state.error = result.error;
                showError('Erro ao carregar pedidos: ' + (result.error || 'Erro desconhecido'));
            }
        } catch (error) {
            state.error = error.message;
            showError('Erro ao carregar pedidos: ' + error.message);
        } finally {
            state.loading = false;
        }
    }

    /**
     * Aplicar filtros nos pedidos
     */
    function applyFilters() {
        let filtered = [...state.orders];

        // Filtro por busca (ID, cliente ou itens)
        if (state.filters.search) {
            const searchLower = state.filters.search.trim().toLowerCase();
            filtered = filtered.filter(order => {
                const orderId = String(order.order_id || order.id || '');
                const customerName = (order.customer_name || order.customer?.name || '').toLowerCase();
                // Otimização: Criar string de busca apenas uma vez
                const itemsText = (Array.isArray(order.items) ? order.items : [])
                    .map(item => {
                        if (!item || typeof item !== 'object') return '';
                        return (item.product_name || (item.product && typeof item.product === 'object' ? item.product.name : '') || '').toLowerCase();
                    })
                    .filter(text => text !== '') // Remover strings vazias
                    .join(' ');
                
                return orderId.includes(searchLower) || 
                       customerName.includes(searchLower) || 
                       itemsText.includes(searchLower);
            });
        }

        // Filtro por status
        if (state.filters.status) {
            filtered = filtered.filter(order => order.status === state.filters.status);
        }

        // Filtro por canal (order_type/delivery_type)
        if (state.filters.channel) {
            filtered = filtered.filter(order => {
                const orderType = order.order_type || order.delivery_type || order.deliveryType || 'delivery';
                return orderType === state.filters.channel;
            });
        }

        // Filtro por período
        if (state.filters.period && state.filters.period !== 'all') {
            const now = new Date();
            let startDate = null;

            switch (state.filters.period) {
                case 'today':
                    startDate = new Date(now);
                    startDate.setHours(0, 0, 0, 0);
                    break;
                case 'week':
                    startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                    startDate.setHours(0, 0, 0, 0);
                    break;
                case 'month':
                    startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                    startDate.setHours(0, 0, 0, 0);
                    break;
            }

            if (startDate) {
                filtered = filtered.filter(order => {
                    if (!order.created_at) return false;
                    try {
                        const orderDate = new Date(order.created_at);
                        if (isNaN(orderDate.getTime())) return false;
                        return orderDate >= startDate;
                    } catch (e) {
                        return false;
                    }
                });
            }
        }

        state.filteredOrders = filtered;
        renderOrders();
    }

    /**
     * Verificar se o pedido é retirada no balcão (pickup)
     * @param {Object} order - Objeto do pedido
     * @returns {boolean} True se for pickup
     */
    function isPickupOrder(order) {
        if (!order || typeof order !== 'object') return false;
        const orderType = String(order.order_type || order.delivery_type || order.deliveryType || '').toLowerCase();
        return orderType === 'pickup';
    }

    /**
     * Formatar endereço do pedido
     * @param {Object} order - Objeto do pedido
     * @returns {string} Endereço formatado
     */
    function formatOrderAddress(order) {
        // Se for pickup, retornar texto específico
        if (isPickupOrder(order)) {
            return 'Retirada no balcão';
        }
        
        if (order.address) {
            return escapeHTML(order.address);
        }
        
        if (order.address_data) {
            const addr = order.address_data;
            const parts = [];
            if (addr.street) parts.push(addr.street);
            if (addr.number) parts.push(addr.number);
            if (addr.complement) parts.push(addr.complement);
            
            if (parts.length > 0) {
                return escapeHTML(parts.join(', '));
            }
            
            if (addr.delivery_address) {
                return escapeHTML(addr.delivery_address);
            }
        }
        
        if (order.delivery_address) {
            return escapeHTML(order.delivery_address);
        }
        
        return 'Endereço não informado';
    }

    /**
     * Obter telefone do cliente do pedido
     * @param {Object} order - Objeto do pedido
     * @returns {string} Telefone formatado
     */
    function getCustomerPhone(order) {
        // Buscar telefone do pedido/cliente, não do usuário logado
        const phone = order.customer?.phone || order.user?.phone || order.phone;
        return formatPhone(phone || '(00)0000-000');
    }

    /**
     * Calcular preço total do item incluindo extras e modificações
     * @param {Object} item - Item do pedido
     * @returns {number} Preço total do item
     */
    function calculateItemTotal(item) {
        // Priorizar item_subtotal se disponível (já calculado pela API)
        if (item.item_subtotal !== undefined && item.item_subtotal !== null) {
            return parseFloat(item.item_subtotal) || 0;
        }
        
        if (item.subtotal !== undefined && item.subtotal !== null) {
            return parseFloat(item.subtotal) || 0;
        }
        
        // Calcular manualmente: unit_price do produto + extras + base_modifications
        const basePrice = parseFloat(item.unit_price || item.product?.price || 0) || 0;
        const quantity = parseInt(item.quantity || 1, 10) || 1;
        
        // Somar preços dos extras
        let extrasTotal = 0;
        if (Array.isArray(item.extras) && item.extras.length > 0) {
            extrasTotal = item.extras.reduce((sum, extra) => {
                const unitPrice = parseFloat(
                    extra.unit_price || 
                    extra.ingredient_unit_price || 
                    extra.ingredient_price || 
                    extra.price || 
                    extra.additional_price || 
                    0
                ) || 0;
                const qty = parseInt(extra.quantity || 1, 10) || 1;
                return sum + (unitPrice * qty);
            }, 0);
        }
        
        // Somar preços das base_modifications (apenas deltas positivos)
        let baseModsTotal = 0;
        if (Array.isArray(item.base_modifications) && item.base_modifications.length > 0) {
            baseModsTotal = item.base_modifications.reduce((sum, mod) => {
                const delta = parseInt(String(mod.delta || 0), 10) || 0;
                if (delta > 0) {
                    const unitPrice = parseFloat(
                        mod.unit_price || 
                        mod.ingredient_unit_price || 
                        mod.ingredient_price || 
                        mod.price || 
                        mod.additional_price || 
                        0
                    ) || 0;
                    return sum + (unitPrice * delta);
                }
                return sum;
            }, 0);
        }
        
        // Preço unitário total = preço base + extras + base_modifications
        const unitTotal = basePrice + extrasTotal + baseModsTotal;
        // Total = preço unitário total * quantidade
        return unitTotal * quantity;
    }

    /**
     * Renderizar lista de pedidos no painel administrativo
     * (Formato diferente do histórico - inclui ações de gerenciamento)
     */
    function renderOrders() {
        if (!el.ordersList) return;

        if (state.filteredOrders.length === 0) {
            el.ordersList.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">
                        <i class="fa-solid fa-clipboard-list"></i>
                    </div>
                    <h3>Nenhum pedido encontrado</h3>
                    <p>Não há pedidos que correspondam aos filtros selecionados.</p>
                </div>
            `;
            return;
        }

        const ordersHtml = state.filteredOrders.map(order => {
            // Validar order antes de processar
            if (!order || typeof order !== 'object') return '';
            
            const orderId = order.order_id || order.id || 'N/A';
            const confirmationCode = escapeHTML(order.confirmation_code || 'N/A');
            const statusClass = getStatusClass(order.status);
            const statusText = formatOrderStatus(order.status);
            const createdAt = formatDate(order.created_at);
            const timeEstimate = calculateTimeEstimate(order);
            
            // Informações do cliente (com validação)
            const customerName = escapeHTML(
                order.customer_name || 
                (order.user && typeof order.user === 'object' ? (order.user.full_name || order.user.name) : '') ||
                'Cliente não informado'
            );
            
            const customerPhone = getCustomerPhone(order);
            const isPickup = isPickupOrder(order);
            const formattedAddress = formatOrderAddress(order);
            const locationText = formattedAddress; // Já formata corretamente (pickup ou endereço)
            
            // Itens do pedido com cálculo correto de extras e base_modifications
            const items = order.items || [];
            const itemsHtml = items.length > 0 ? items.map(item => {
                const itemName = escapeHTML(item.product_name || item.product?.name || 'Produto');
                const itemQuantity = parseInt(item.quantity || 1, 10) || 1;
                const itemTotal = calculateItemTotal(item);
                
                return `
                    <div class="order-item">
                        <div class="item-info">
                            <span class="item-qtd">${itemQuantity}</span>
                            <span class="item-name">${itemName}</span>
                        </div>
                        <span class="item-price">R$ ${formatCurrency(itemTotal)}</span>
                    </div>
                `;
            }).join('') : '<div class="order-item"><span class="item-name">Nenhum item</span></div>';
            
            // Total do pedido
            const total = parseFloat(order.total_amount || order.total || 0) || 0;
            
            // Botão de ação
            const nextStatus = getNextStatus(order.status);
            const actionButtonText = getActionButtonText(order.status);
            const canUpdate = !['completed', 'cancelled'].includes(order.status);

            return `
                <div class="order-card" data-order-id="${escapeHTML(String(orderId))}">
                    <div class="order-header">
                        <div class="order-id-status">
                            <div class="order-id">
                                <span class="id-text">${confirmationCode}</span>
                            <span class="status-badge ${statusClass}">${statusText}</span>
                        </div>
                            <div class="order-time-estimate ${timeEstimate.colorClass}">
                                <i class="fa-solid fa-clock"></i>
                                <span class="time-display">
                                    <span class="time-current">${timeEstimate.currentMinutes}min</span>
                                    <span class="time-separator">/</span>
                                    <span class="time-max">${timeEstimate.maxMinutes}min</span>
                                </span>
                            </div>
                        </div>
                        <div class="order-date">${createdAt}</div>
                    </div>
                    
                    <div class="order-customer">
                        <div class="customer-name">${customerName}</div>
                        <div class="customer-info">
                            <div class="info-item">
                                <i class="fa-solid fa-phone"></i>
                                <span>${customerPhone}</span>
                            </div>
                            <div class="info-item ${isPickup ? 'order-pickup' : ''}">
                                <i class="fa-solid ${isPickup ? 'fa-store' : 'fa-location-dot'}"></i>
                                <span>${locationText}</span>
                                ${isPickup ? '<span class="pickup-badge">Retirada</span>' : ''}
                            </div>
                        </div>
                    </div>

                    <div class="order-items">
                        ${itemsHtml}
                    </div>

                    <div class="order-footer">
                        <div class="order-total">
                            <span class="total-label">Total</span>
                            <span class="total-value">R$ ${formatCurrency(total)}</span>
                        </div>
                        ${canUpdate ? `
                            <button class="order-action-btn" data-order-id="${escapeHTML(String(orderId))}" data-next-status="${escapeHTML(nextStatus)}">
                                ${escapeHTML(actionButtonText)}
                        </button>
                        ` : ''}
                    </div>
                </div>
            `;
        }).filter(html => html !== '').join(''); // Remover entradas vazias

        // Atualizar DOM
        el.ordersList.innerHTML = ordersHtml;
    }

    /**
     * Atualizar status do pedido (função exclusiva do gerenciamento administrativo)
     * @param {number|string} orderId - ID do pedido
     * @param {string} newStatus - Novo status
     * @returns {Promise<void>}
     */
    async function updateOrderStatusAction(orderId, newStatus) {
        // Validar entrada
        const parsedOrderId = parseInt(String(orderId), 10);
        if (isNaN(parsedOrderId) || parsedOrderId <= 0) {
            showError('ID do pedido inválido');
            return;
        }
        
        if (!newStatus || typeof newStatus !== 'string') {
            showError('Status inválido');
            return;
        }
        
        try {
            const result = await updateOrderStatus(parsedOrderId, newStatus);
            if (result.success) {
                showSuccess('Status atualizado com sucesso!');
                await loadOrders(); // Recarregar lista e métricas
            } else {
                showError('Erro ao atualizar status: ' + (result.error || 'Erro desconhecido'));
            }
        } catch (error) {
            showError('Erro ao atualizar status: ' + error.message);
        }
    }

    /**
     * Configurar auto-refresh
     */
    function setupAutoRefresh() {
        if (state.autoRefresh && !state.refreshInterval) {
            state.refreshInterval = setInterval(async () => {
                // Só atualizar se não estiver em processo de carregamento e seção estiver visível
                if (!state.loading && isSectionVisible()) {
                    await loadOrders();
                }
            }, 30000); // Atualizar a cada 30 segundos
        }
    }

    /**
     * Parar auto-refresh
     */
    function stopAutoRefresh() {
        if (state.refreshInterval) {
            clearInterval(state.refreshInterval);
            state.refreshInterval = null;
        }
    }

    /**
     * Limpar intervalo de verificação de visibilidade
     */
    function clearVisibilityCheck() {
        if (state.visibilityCheckInterval) {
            clearInterval(state.visibilityCheckInterval);
            state.visibilityCheckInterval = null;
        }
    }

    /**
     * Anexar eventos aos elementos DOM
     */
    function attachEvents() {
        // Busca com debounce
        if (el.searchInput) {
            let searchTimeout;
            el.searchInput.addEventListener('input', (e) => {
                clearTimeout(searchTimeout);
                searchTimeout = setTimeout(() => {
                    state.filters.search = e.target.value.trim();
                    applyFilters();
                }, 300);
            });
        }

        // Filtro de status
        if (el.filterStatus) {
            el.filterStatus.addEventListener('change', (e) => {
                state.filters.status = e.target.value;
                applyFilters();
            });
        }

        // Filtro de canais
        if (el.filterChannel) {
            el.filterChannel.addEventListener('change', (e) => {
                state.filters.channel = e.target.value;
                applyFilters();
            });
        }

        // Filtro de período
        if (el.filterPeriod) {
            el.filterPeriod.addEventListener('change', (e) => {
                state.filters.period = e.target.value;
                loadOrders();
            });
        }

        // Lista de pedidos (delegation para botões de ação)
        if (el.ordersList) {
            el.ordersList.addEventListener('click', async (e) => {
                const btn = e.target.closest('.order-action-btn');
                if (!btn) return;

                const orderId = btn.dataset.orderId;
                const nextStatus = btn.dataset.nextStatus;
                
                // Validar dados antes de processar
                if (!orderId || !nextStatus) return;

                // Confirmar ação - busca segura do pedido
                const order = state.filteredOrders.find(o => {
                    if (!o || typeof o !== 'object') return false;
                    const oId = o.order_id || o.id;
                    // Normalizar ambos os IDs para comparação segura
                    const normalizedOrderId = String(orderId || '').trim();
                    const normalizedOId = String(oId || '').trim();
                    return normalizedOId === normalizedOrderId && normalizedOrderId !== '';
                });
                
                if (order) {
                    const statusText = formatOrderStatus(nextStatus);
                    const orderCode = escapeHTML(order.confirmation_code || `#${orderId}`);
                    const confirmMessage = `Deseja realmente atualizar o status do pedido ${orderCode} para "${statusText}"?`;
                    
                    const confirmed = await showConfirm({
                        title: 'Confirmar Atualização de Status',
                        message: confirmMessage,
                        confirmText: 'Confirmar',
                        cancelText: 'Cancelar',
                        type: 'warning'
                    });
                    
                    if (confirmed) {
                        await updateOrderStatusAction(orderId, nextStatus);
                    }
                }
            });
        }

        // Observar mudanças na seção de pedidos para iniciar/parar auto-refresh
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
                    const isVisible = secaoPedidos.style.display !== 'none';
                    if (isVisible && !state.refreshInterval) {
                        setupAutoRefresh();
                    } else if (!isVisible && state.refreshInterval) {
                        stopAutoRefresh();
                    }
                }
            });
        });

        observer.observe(secaoPedidos, {
            attributes: true,
            attributeFilter: ['style']
        });
    }

    /**
     * Verificar se a seção está visível
     * @returns {boolean}
     */
    function isSectionVisible() {
        return secaoPedidos && secaoPedidos.style.display !== 'none';
    }

    /**
     * Inicializar quando a seção for exibida
     */
    async function init() {
        if (!isSectionVisible()) {
            // Aguardar a seção ser exibida com limite de tentativas para evitar vazamento
            let attempts = 0;
            const MAX_ATTEMPTS = 100; // 10 segundos máximo (100 * 100ms)
            
            state.visibilityCheckInterval = setInterval(() => {
                attempts++;
                
                if (isSectionVisible()) {
                    clearVisibilityCheck();
                    initializeSection();
                } else if (attempts >= MAX_ATTEMPTS) {
                    // Timeout: parar de tentar para evitar vazamento
                    clearVisibilityCheck();
                }
            }, 100);
            return;
        }

        initializeSection();
    }

    /**
     * Inicializar seção completa
     */
    async function initializeSection() {
        initElements();
        attachEvents();
        await loadOrders();
        
        if (isSectionVisible()) {
            setupAutoRefresh();
        }
    }

    /**
     * Limpar todos os recursos
     */
    function cleanup() {
        stopAutoRefresh();
        clearVisibilityCheck();
    }

    // Limpar recursos ao sair da página
    window.addEventListener('beforeunload', cleanup);
    
    // Limpar recursos quando a página fica oculta (evita requisições desnecessárias)
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            stopAutoRefresh();
        } else if (isSectionVisible()) {
        setupAutoRefresh();
    }
    });

    // Inicializar quando DOM estiver pronto
    if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
