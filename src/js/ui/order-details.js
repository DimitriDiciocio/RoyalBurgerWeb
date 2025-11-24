/**
 * Detalhes do Pedido
 * Interface para visualizar detalhes completos de um pedido específico
 */

import { getOrderDetails, cancelOrder, formatOrderStatus, getStatusColor } from '../api/orders.js';
import { getProductById, searchProducts } from '../api/products.js';
import { getAddresses, getDefaultAddress } from '../api/address.js';
import { getIngredients } from '../api/ingredients.js';
import { API_BASE_URL } from '../api/api.js';

// Importar helper de configurações
// Importação estática garante que o módulo esteja disponível quando necessário
import * as settingsHelper from '../utils/settings-helper.js';

// Importar sistema de alertas customizado
import { showError, showSuccess } from './alerts.js';

// Constantes
const VISIBILITY_DELAY_MS = 500; // Delay para exibição de alerta antes de redirecionamento

// Verificar se está em modo de desenvolvimento (browser-safe)
const isDevelopment = () => {
    try {
        const host = window.location.hostname || '';
        const isFile = window.location.protocol === 'file:'; // permite logs quando abrindo arquivo local
        return isFile || host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host.includes('.local');
    } catch {
        return false;
    }
};

(function initOrderDetails() {
    if (!window.location.pathname.toLowerCase().includes('info-pedido')) {
        // logs disabled
    }

    const state = {
        order: null,
        orderId: null,
        loading: false,
        error: null,
        ingredientsCache: null // Cache para preços dos ingredientes
    };

    // Refs DOM
    let el = {};

    // Inicializar elementos DOM
    function initElements() {
        el = {
            // Navegação
            btnVoltar: document.querySelector('.voltar'),

            // Status e progresso
            orderStatusMessage: document.getElementById('order-status-message'),
            stepPending: document.getElementById('step-pending'),
            stepPreparing: document.getElementById('step-preparing'),
            stepDelivered: document.getElementById('step-delivered'),

            // Informações do pedido
            orderAddress: document.getElementById('order-address'),
            orderNeighborhood: document.getElementById('order-neighborhood'),
            paymentMethod: document.getElementById('payment-method'),
            paymentPixIcon: document.getElementById('payment-pix-icon'),
            paymentCardIcon: document.getElementById('payment-card-icon'),
            paymentMoneyIcon: document.getElementById('payment-money-icon'),
            changeAmount: document.getElementById('change-amount'),

            // Itens e resumo
            orderItems: document.getElementById('order-items'),
            subtotalValue: document.getElementById('subtotal-value'),
            deliveryFeeValue: document.getElementById('delivery-fee-value'),
            discountRow: document.getElementById('discount-row'),
            discountValue: document.getElementById('discount-value'),
            totalValue: document.getElementById('total-value'),
            pointsEarned: document.getElementById('points-earned'),

            // Ações
            orderActions: document.getElementById('order-actions'),
            btnCancelOrder: document.getElementById('btn-cancel-order'),
            btnReorder: document.getElementById('btn-reorder'),
            btnConfirmCancel: document.getElementById('btn-confirm-cancel')
        };
    }

    // Logger desativado
    function debugLog(..._args) {}

    // Handler global para erro de imagem usado pelo onerror dos <img>
    if (typeof window !== 'undefined' && !window._rbImgErr) {
        window._rbImgErr = function(_imgEl) { /* logs disabled */ };
    }

    // Helper: caminho da imagem placeholder compatível com páginas em /src/pages/
    function getPlaceholderImagePath() {
        try {
            const p = window.location.pathname || '';
            const inPages = p.includes('/src/pages/') || p.includes('src/pages');
            return inPages ? '../assets/img/1.png' : 'src/assets/img/1.png';
        } catch (_) {
            return 'src/assets/img/1.png';
        }
    }

    // ALTERAÇÃO: Função para limpar o cache de ingredientes
    function clearIngredientsCache() {
        state.ingredientsCache = null;
    }

    // Carregar ingredientes e criar mapa de preços
    // ALTERAÇÃO: Adicionado parâmetro forceReload para forçar recarregamento do cache
    async function loadIngredientsCache(forceReload = false) {
        if (state.ingredientsCache && !forceReload) {
            return state.ingredientsCache;
        }

        try {
            const response = await getIngredients({ page_size: 1000 });
            // Validar resposta antes de processar
            if (response && Array.isArray(response.items) && response.items.length > 0) {
                // Criar mapa de ID -> preço adicional (normalizar IDs como string)
                state.ingredientsCache = {};
                response.items.forEach(ingredient => {
                    if (ingredient && ingredient.id != null) {
                        // Normalizar ID para string para garantir busca consistente
                        const id = String(ingredient.id);
                        state.ingredientsCache[id] = {
                            additional_price: parseFloat(ingredient.additional_price) || 0,
                            price: parseFloat(ingredient.price) || 0,
                            name: ingredient.name || ''
                        };
                    }
                });
                
                // ALTERAÇÃO: Log para debug - mostrar cache carregado
                console.log('📦 [DEBUG] Cache de ingredientes carregado:', {
                    total_ingredientes: Object.keys(state.ingredientsCache).length,
                    primeiros_5: Object.entries(state.ingredientsCache).slice(0, 5).map(([id, data]) => ({
                        id,
                        nome: data.name,
                        additional_price: data.additional_price,
                        price: data.price
                    }))
                });
                
                return state.ingredientsCache;
            }
            // Resposta vazia ou inválida - inicializar cache vazio
            state.ingredientsCache = {};
        } catch (error) {
            // Log apenas em desenvolvimento - não expor detalhes em produção
            if (isDevelopment()) {
                console.error('Erro ao carregar ingredientes:', error);
            }
            state.ingredientsCache = {};
        }
        return state.ingredientsCache || {};
    }

    // Buscar preço adicional de um ingrediente pelo ID
    // Valida tipo e existência antes de buscar no cache
    function agetIngredientPrice(ingredientId) {
        if (!state.ingredientsCache || !ingredientId) {
            return null; // ALTERAÇÃO: Retornar null em vez de 0 para diferenciar "não encontrado" de "preço zero"
        }
        // Normalizar ID para string (algumas APIs retornam number, outras string)
        const normalizedId = String(ingredientId);
        const ingredient = state.ingredientsCache[normalizedId];
        if (!ingredient) {
            return null; // ALTERAÇÃO: Retornar null se ingrediente não está no cache
        }
        // ALTERAÇÃO: Retornar additional_price do cache (pode ser 0 para ingredientes gratuitos)
        const additionalPrice = ingredient.additional_price;
        console.log(`📦 [DEBUG] Cache consultado para ID ${ingredientId}:`, {
            encontrado: !!ingredient,
            additional_price: additionalPrice,
            price: ingredient.price,
            nome: ingredient.name
        });
        return additionalPrice !== undefined && additionalPrice !== null ? additionalPrice : null;
    }

    /**
     * Buscar preço de ingrediente a partir de múltiplas fontes
     * Extrai lógica duplicada para evitar repetição de código
     * @param {Object} ingredientData - Dados do ingrediente (extra ou base_modification)
     * @param {string|number} ingredientId - ID do ingrediente
     * @returns {number} Preço encontrado ou 0
     */
    function findIngredientPrice(ingredientData, ingredientId) {
        // ALTERAÇÃO: Log detalhado para debug - mostrar TODOS os campos disponíveis
        console.log(`💰 [DEBUG] Buscando preço para ingrediente ID ${ingredientId}:`, {
            additional_price: ingredientData.additional_price,
            additionalPrice: ingredientData.additionalPrice,
            ingredient_price: ingredientData.ingredient_price,
            ingredientPrice: ingredientData.ingredientPrice,
            price: ingredientData.price,
            unit_price: ingredientData.unit_price,
            todos_os_campos_disponiveis: Object.keys(ingredientData),
            objeto_completo: ingredientData
        });

        // ALTERAÇÃO: SEMPRE priorizar additional_price do objeto, mesmo que seja 0 (pode ser ingrediente gratuito)
        if (ingredientData.additional_price !== undefined && ingredientData.additional_price !== null) {
            const additionalPrice = parseFloat(ingredientData.additional_price);
            if (!isNaN(additionalPrice)) {
                console.log(`✅ [DEBUG] Preço encontrado no objeto: ${additionalPrice} (campo: additional_price)`);
                return additionalPrice >= 0 ? additionalPrice : 0; // Aceita 0 (ingrediente gratuito)
            }
        }

        // ALTERAÇÃO: Se não tem additional_price no objeto, SEMPRE buscar no cache primeiro (cache tem additional_price correto)
        if (ingredientId) {
            const cachedPrice = getIngredientPrice(ingredientId);
            if (cachedPrice !== null && cachedPrice !== undefined) {
                const cachedPriceNum = parseFloat(cachedPrice);
                if (!isNaN(cachedPriceNum)) {
                    console.log(`✅ [DEBUG] Preço encontrado no cache: ${cachedPriceNum} (ID: ${ingredientId}, campo: additional_price do cache)`);
                    return cachedPriceNum >= 0 ? cachedPriceNum : 0; // Aceita 0 (ingrediente gratuito)
                }
            } else {
                console.log(`⚠️ [DEBUG] Ingrediente ID ${ingredientId} não encontrado no cache`);
            }
        }

        // ALTERAÇÃO: Se não encontrou additional_price, tentar outros campos como fallback
        // Mas NUNCA usar price se additional_price existir (mesmo que seja 0)
        const fallbackCandidates = [
            ingredientData.additionalPrice, // camelCase
            ingredientData.ingredient_price,
            ingredientData.ingredientPrice, // camelCase
            ingredientData.ingredient_unit_price,
            ingredientData.ingredientUnitPrice, // camelCase
            ingredientData.unit_price,
            ingredientData.unitPrice, // camelCase
            ingredientData.preco,
            ingredientData.valor
        ];

        for (const candidate of fallbackCandidates) {
            if (candidate !== undefined && candidate !== null) {
                const priceNum = parseFloat(candidate);
                if (!isNaN(priceNum) && priceNum > 0) {
                    console.log(`✅ [DEBUG] Preço encontrado (fallback): ${priceNum} (campo: ${Object.keys(ingredientData).find(key => ingredientData[key] === candidate)})`);
                    return priceNum;
                }
            }
        }

        // Último recurso: usar price apenas se NENHUM outro campo foi encontrado
        if (ingredientData.price !== undefined && ingredientData.price !== null) {
            const priceNum = parseFloat(ingredientData.price);
            if (!isNaN(priceNum) && priceNum > 0) {
                console.log(`⚠️ [DEBUG] Usando price como último recurso: ${priceNum} (ATENÇÃO: deveria usar additional_price!)`);
                return priceNum;
            }
        }

        console.log(`⚠️ [DEBUG] Nenhum preço válido encontrado para ingrediente ID ${ingredientId}`);
        return 0;
    }

    // Handler global para erro de imagem (log + placeholder)
    function handleImageError(imgEl) {
        try {
            debugLog('Falha ao carregar imagem do item', { src: imgEl?.src });
        } catch (_) {}
        if (imgEl && imgEl.outerHTML) {
            imgEl.outerHTML = "<div class='imagem-placeholder'><i class='fa-solid fa-image'></i><p>Sem imagem</p></div>";
        }
    }
    // Disponibilizar no escopo global para uso no atributo onerror do <img>
    // REVISAR: Considerar usar addEventListener ao invés de atributo onerror inline
    if (typeof window !== 'undefined') {
        window._rbImgErr = handleImageError;
    }

    // Obter ID do pedido da URL
    function getOrderIdFromUrl() {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('id');
    }

    // Carregar detalhes do pedido
    async function loadOrderDetails(orderId) {
        state.loading = true;
        state.error = null;

        try {
            const result = await getOrderDetails(orderId);
            
            if (result.success) {
                state.order = result.data;
                
                // ALTERAÇÃO: Log detalhado dos dados recebidos da API
                console.log('📥 [DEBUG] Dados recebidos da API (getOrderDetails):', {
                    order_id: state.order?.id,
                    total_items: state.order?.items?.length,
                    primeiro_item: state.order?.items?.[0] ? {
                        product_id: state.order.items[0].product_id,
                        product_name: state.order.items[0].product_name,
                        extras: state.order.items[0].extras,
                        base_modifications: state.order.items[0].base_modifications,
                        primeiro_extra: state.order.items[0].extras?.[0],
                        primeira_modificacao: state.order.items[0].base_modifications?.[0]
                    } : null
                });
                
                // Log detalhado das modificações do primeiro item
                if (state.order?.items?.[0]?.base_modifications) {
                    console.log('📋 [DEBUG] Estrutura completa das modificações do primeiro item:', 
                        state.order.items[0].base_modifications.map((bm, idx) => ({
                            indice: idx,
                            id: bm.id,
                            ingredient_id: bm.ingredient_id,
                            ingredient_name: bm.ingredient_name,
                            delta: bm.delta,
                            todos_os_campos: Object.keys(bm),
                            valores: {
                                additional_price: bm.additional_price,
                                ingredient_price: bm.ingredient_price,
                                price: bm.price,
                                unit_price: bm.unit_price
                            },
                            objeto_completo: bm
                        }))
                    );
                }
                
                // Enriquecer itens com dados do produto (imagem) quando necessário
                try {
                    if (Array.isArray(state.order?.items) && state.order.items.length > 0) {
                        state.order.items = await enrichItemsWithProductData(state.order.items);
                    }
                } catch (e) {
                    debugLog('Falha ao enriquecer itens com dados do produto', e?.message);
                }
                // Enriquecer endereço quando ausente no retorno do pedido
                try {
                    state.order = await enrichOrderAddressIfMissing(state.order);
                } catch (e) {
                    // silencioso
                }
                renderOrderDetails();
            } else {
                state.error = result.error;
                showError('Erro ao carregar pedido: ' + result.error);
            }
        } catch (error) {
            state.error = error.message;
            showError('Erro ao carregar pedido: ' + error.message);
        } finally {
            state.loading = false;
        }
    }

    // Enriquecer itens com imagem do produto quando faltarem caminhos de imagem no item
    async function enrichItemsWithProductData(items) {
        const enriched = await Promise.allSettled(items.map(async (item) => {
            try {
                const candidates = [
                    item?.product?.image_url,
                    item?.product?.image,
                    item?.product_image_url,
                    item?.image_url,
                    item?.image,
                    item?.product?.imagePath,
                    item?.product?.image_path
                ];

                const hasImage = candidates.some(Boolean);
                if (hasImage) {
                    return item;
                }

                const productId = item?.product_id || item?.product?.id;

                if (!productId) {
                    const name = item?.product_name || item?.product?.name;
                    if (!name) {
                        return item;
                    }

                    // Helper: normalizar nome para comparações robustas (remove acentos, espaços extras e caixa)
                    const normalizeName = (s) => String(s || '')
                        .normalize('NFD')
                        .replace(/\p{Diacritic}/gu, '')
                        .toLowerCase()
                        .replace(/\s+/g, ' ')
                        .trim();

                    const targetNameNorm = normalizeName(name);

                    // ESTRATÉGIA 1: Buscar por nome (inclui inativos)
                    let resp = await searchProducts({ name, include_inactive: true, page_size: 50 });
                    let list = Array.isArray(resp?.items) ? resp.items : [];

                    // ESTRATÉGIA 2: Se não encontrou, buscar TODOS os produtos
                    if (list.length === 0) {
                        const allProductsResp = await searchProducts({ page_size: 1000, include_inactive: true });
                        list = Array.isArray(allProductsResp?.items) ? allProductsResp.items : [];
                    }

                    // Match exato (normalizado)
                    let match = list.find(p => normalizeName(p?.name) === targetNameNorm);

                    // Se não encontrou match exato, buscar por similaridade
                    if (!match) {
                        match = list.find(p => {
                            const pNameNorm = normalizeName(p?.name);
                            return pNameNorm.includes(targetNameNorm) || targetNameNorm.includes(pNameNorm);
                        });
                    }

                    if (match) {
                        return {
                            ...item,
                            product_id: match.id,
                            product: item.product || match,
                            product_image_url: match.image_url || item.product_image_url,
                            product_image_hash: match.image_hash || item.product_image_hash
                        };
                    }

                    return item;
                }

                const product = await getProductById(productId);

                if (product && (product.image_url || product.image)) {
                    return {
                        ...item,
                        product: item.product || product,
                        product_image_url: product.image_url || item.product_image_url,
                        product_image_hash: product.image_hash || item.product_image_hash
                    };
                }

                return item;
            } catch (_err) {
                return item;
            }
        }));

        // Performance: Evitar O(n²) - usar índices diretamente
        return enriched.map((result, index) => 
            result.status === 'fulfilled' ? result.value : items[index]
        );
    }

    // Tentar resolver endereço do pedido quando API não retornar linhas de endereço
    async function enrichOrderAddressIfMissing(order) {
        const isPickupOrder = order?.order_type === 'pickup' || order?.delivery_type === 'pickup';
        if (isPickupOrder) return order;

        const hasAnyAddress = Boolean(order?.address || order?.delivery_address || order?.address_data);
        if (hasAnyAddress) return order;

        const addressId = order?.address_id || order?.delivery_address_id || order?.customer_address_id;
        let chosenAddress = null;

        try {
            const list = await getAddresses();
            if (Array.isArray(list) && list.length > 0) {
                if (addressId) {
                    chosenAddress = list.find(a => String(a.id) === String(addressId)) || null;
                }
                // Fallback: usar endereço padrão
                if (!chosenAddress) {
                    chosenAddress = list.find(a => a.is_default) || list[0] || null;
                }
            } else {
                // Segundo fallback: tentar pegar default direto
                chosenAddress = await getDefaultAddress();
            }
        } catch (_) {}

        if (chosenAddress) {
            const mainParts = [];
            if (chosenAddress.street) mainParts.push(chosenAddress.street);
            if (chosenAddress.number) mainParts.push(chosenAddress.number);
            if (chosenAddress.complement) mainParts.push(chosenAddress.complement);
            const mainLine = (mainParts.join(', ') || chosenAddress.delivery_address || chosenAddress.address || 'Endereço não informado').trim();

            const addrData = {
                street: chosenAddress.street,
                number: chosenAddress.number,
                complement: chosenAddress.complement,
                neighborhood: chosenAddress.neighborhood || chosenAddress.district,
                city: chosenAddress.city,
                state: chosenAddress.state,
                zip_code: chosenAddress.zip_code,
                delivery_address: mainLine
            };
            return {
                ...order,
                address: mainLine,
                address_data: addrData,
                delivery_address: mainLine
            };
        }

        return order;
    }

    // Renderizar detalhes do pedido
    function renderOrderDetails() {
        if (!state.order) return;

        const order = state.order;
        
        // Atualizar status e progresso
        updateOrderStatus(order.status);
        
        // Atualizar informações do pedido
        updateOrderInfo(order);
        
        // Renderizar itens
        renderOrderItems(order.items || []);
        
        // Renderizar observações do pedido
        renderOrderNotes(order);
        
        // Atualizar resumo financeiro
        updateOrderSummary(order);
        
        // Mostrar/esconder ações
        updateOrderActions(order.status);
        
        // Se o pedido foi concluído, recarregar pontos do header para atualizar saldo
        // Os pontos foram creditados quando o status mudou para 'completed'
        if (order.status === 'completed' || order.status === 'delivered') {
            // Recarregar pontos no header (se a função estiver disponível)
            if (typeof window.updateHeaderState === 'function') {
                // O header tem sua própria lógica de carregamento de pontos
                // Apenas forçar atualização do estado
                window.updateHeaderState();
            }
        }
    }

    // Atualizar status e progresso
    function updateOrderStatus(status) {
        // ALTERAÇÃO: Adicionado 'in_progress' como fallback para 'ready' (quando constraint não permite 'ready')
        const statusMessages = {
            'pending': 'Seu pedido está sendo processado!',
            'preparing': 'Seu pedido está sendo preparado!',
            'ready': 'Seu pedido está pronto!',
            'in_progress': 'Seu pedido está pronto!', // ALTERAÇÃO: Fallback do backend quando 'ready' não está na constraint
            'on_the_way': 'Seu pedido está em rota de entrega!',
            'delivered': 'Seu pedido foi entregue!',
            'paid': 'Seu pedido foi pago!',
            'completed': 'Seu pedido foi concluído!',
            'cancelled': 'Seu pedido foi cancelado.'
        };

        if (el.orderStatusMessage) {
            el.orderStatusMessage.textContent = statusMessages[status] || 'Status desconhecido';
        }

        // Atualizar etapas do progresso
        updateProgressSteps(status);
    }

    // Atualizar etapas do progresso
    function updateProgressSteps(status) {
        // ALTERAÇÃO: Adicionado 'in_progress' como fallback para 'ready'
        const steps = {
            'pending': { pending: true, preparing: false, delivered: false },
            'preparing': { pending: true, preparing: true, delivered: false },
            'ready': { pending: true, preparing: true, delivered: false },
            'in_progress': { pending: true, preparing: true, delivered: false }, // ALTERAÇÃO: Fallback do backend quando 'ready' não está na constraint
            'on_the_way': { pending: true, preparing: true, delivered: false },
            'delivered': { pending: true, preparing: true, delivered: true },
            'paid': { pending: true, preparing: true, delivered: true },
            'completed': { pending: true, preparing: true, delivered: true },
            'cancelled': { pending: false, preparing: false, delivered: false }
        };

        const stepConfig = steps[status] || steps['pending'];

        if (el.stepPending) {
            el.stepPending.classList.toggle('completo', stepConfig.pending);
        }
        if (el.stepPreparing) {
            el.stepPreparing.classList.toggle('completo', stepConfig.preparing);
        }
        if (el.stepDelivered) {
            el.stepDelivered.classList.toggle('completo', stepConfig.delivered);
        }
    }

    // Extrair endereço do pedido de forma robusta (diferentes formatos da API)
    function extractOrderAddressInfo(order) {
        const addr = order?.address_data || {};
        const lines = {
            street: addr.street || order?.street || order?.delivery_street || null,
            number: addr.number || order?.number || order?.delivery_number || null,
            complement: addr.complement || order?.complement || order?.delivery_complement || null,
            neighborhood: addr.neighborhood || order?.neighborhood || order?.delivery_neighborhood || null,
            city: addr.city || order?.city || order?.delivery_city || null,
            state: addr.state || order?.state || order?.delivery_state || null,
            full: addr.delivery_address || order?.delivery_address || order?.address || null
        };

        // Linha principal
        let mainLine = '';
        if (lines.full) {
            mainLine = lines.full;
        } else {
            const parts = [];
            if (lines.street) parts.push(lines.street);
            if (lines.number) parts.push(lines.number);
            if (lines.complement) parts.push(lines.complement);
            mainLine = parts.join(', ');
        }
        if (!mainLine || mainLine.trim() === '') mainLine = 'Endereço não informado';

        // Linha secundária (bairro - cidade[/UF])
        const subParts = [];
        if (lines.neighborhood) subParts.push(lines.neighborhood);
        if (lines.city) subParts.push(lines.city + (lines.state ? '/' + lines.state : ''));
        let subLine = subParts.length > 0 ? subParts.join(' - ') : 'Localização não informada';

        return { mainLine, subLine };
    }

    // Atualizar informações do pedido
    function updateOrderInfo(order) {
        // Verificar se é pickup
        const isPickup = order.order_type === 'pickup' || order.delivery_type === 'pickup';
        
        // Formatar endereço
        if (isPickup) {
            if (el.orderAddress) {
                el.orderAddress.textContent = 'Retirada no balcão';
            }
            if (el.orderNeighborhood) {
                el.orderNeighborhood.textContent = 'Balcão - Retirada na loja';
            }
        } else {
            const { mainLine, subLine } = extractOrderAddressInfo(order);
            if (el.orderAddress) {
                el.orderAddress.textContent = mainLine;
            }
            if (el.orderNeighborhood) {
                el.orderNeighborhood.textContent = subLine;
            }
        }

        // Método de pagamento (normalizado + ícone)
        // ALTERAÇÃO: Normalizar método de pagamento para diferenciar crédito e débito
        const normalizePaymentMethod = (raw) => {
            const m = String(raw || '').toLowerCase();
            if (!m) return 'pix';
            if (m.includes('pix')) return 'pix';
            // Diferenciar crédito e débito
            if (m === 'credit' || m.includes('credito')) return 'credit';
            if (m === 'debit' || m.includes('debito')) return 'debit';
            // Fallback para outros formatos antigos
            if (m.includes('card') || m.includes('cart') || m.includes('credit') || m.includes('debit')) return 'credit'; // Default para crédito
            if (m.includes('din') || m.includes('cash') || m.includes('money')) return 'money';
            return 'pix';
        };

        const methodKey = normalizePaymentMethod(order.payment_method);
        const paymentConfig = {
            pix:    { text: 'PIX',              elKey: 'paymentPixIcon'   },
            credit: { text: 'Cartão de Crédito', elKey: 'paymentCardIcon'  },
            debit:  { text: 'Cartão de Débito',  elKey: 'paymentCardIcon'  },
            money:  { text: 'Dinheiro',         elKey: 'paymentMoneyIcon' }
        };
        const payment = paymentConfig[methodKey] || paymentConfig.pix;

        if (el.paymentMethod) {
            el.paymentMethod.textContent = payment.text;
        }

        // Mostrar ícone correto
        if (el.paymentPixIcon) el.paymentPixIcon.style.display = 'none';
        if (el.paymentCardIcon) el.paymentCardIcon.style.display = 'none';
        if (el.paymentMoneyIcon) el.paymentMoneyIcon.style.display = 'none';

        const iconElement = el[payment.elKey];
        if (iconElement) {
            iconElement.style.display = 'flex';
        }

        // Exibir troco se o método de pagamento for dinheiro e houver valor de troco
        if (el.changeAmount) {
            if (methodKey === 'money') {
                // Buscar valor do troco retornado pela API (já calculado pelo backend)
                // A API retorna change_for_amount que é calculado como: amount_paid - total_amount
                let changeValue = order.change_for_amount ?? null;
                
                // Fallback: calcular troco se tiver amount_paid e total_amount
                if (changeValue === null && order.amount_paid && order.total_amount) {
                    const amountPaid = parseFloat(order.amount_paid);
                    const totalAmount = parseFloat(order.total_amount);
                    if (!isNaN(amountPaid) && !isNaN(totalAmount) && amountPaid > totalAmount) {
                        changeValue = amountPaid - totalAmount;
                    }
                }
                
                if (changeValue !== null && changeValue !== undefined) {
                    const changeNum = parseFloat(changeValue);
                    if (!isNaN(changeNum) && changeNum > 0) {
                        // Formatar valor do troco em R$
                        const formatBRL = (v) => new Intl.NumberFormat('pt-BR', { 
                            style: 'currency', 
                            currency: 'BRL' 
                        }).format(v || 0);
                        el.changeAmount.textContent = `Troco: ${formatBRL(changeNum)}`;
                        el.changeAmount.style.display = 'block';
                    } else {
                        el.changeAmount.style.display = 'none';
                    }
                } else {
                    el.changeAmount.style.display = 'none';
                }
            } else {
                // Ocultar troco se não for dinheiro
                el.changeAmount.style.display = 'none';
            }
        }

        debugLog('Pagamento', { raw: order.payment_method, normalized: methodKey, shownIcon: payment.elKey });
    }

    /**
     * Renderizar HTML dos extras do item
     * Extraído para melhorar legibilidade
     * @param {Array} extras - Array de extras
     * @returns {string} HTML dos extras
     */
    function renderItemExtras(extras) {
        if (!extras || extras.length === 0) {
            return '';
        }

        // ALTERAÇÃO: Log para debug - mostrar dados dos extras
        console.log('🔍 [DEBUG] Extras do item:', extras);
        extras.forEach((extra, index) => {
            console.log(`  Extra ${index + 1}:`, {
                id: extra.id || extra.ingredient_id,
                nome: extra.ingredient_name || extra.name || extra.nome,
                quantity: extra.quantity || extra.qty || extra.quantidade,
                additional_price: extra.additional_price,
                ingredient_price: extra.ingredient_price,
                price: extra.price,
                unit_price: extra.unit_price,
                objeto_completo: extra
            });
        });

        const extrasItems = extras.map(extra => {
            const nome = extra.ingredient_name || extra.name || extra.title || extra.nome || 'Ingrediente';
            const quantidade = parseInt(extra.quantity ?? extra.qty ?? extra.quantidade ?? 0, 10) || 0;
            const ingredientId = extra.ingredient_id || extra.id;
            
            // Buscar preço usando função centralizada
            const preco = findIngredientPrice(extra, ingredientId);
            
            // Formatar preço se houver
            const precoFormatado = preco > 0 ? ` <span class="extra-price">+R$ ${preco.toFixed(2).replace('.', ',')}</span>` : '';
            
            return `<li><span class="extra-quantity-badge">${quantidade}</span> <span class="extra-name">${escapeHTML(nome)}</span>${precoFormatado}</li>`;
        }).join('');

        return `
            <div class="item-extras-separator"></div>
            <div class="item-extras-list">
                <strong>Extras:</strong>
                <ul>
                    ${extrasItems}
                </ul>
            </div>
        `;
    }

    /**
     * Renderizar HTML das modificações da receita base
     * Extraído para melhorar legibilidade
     * @param {Array} baseMods - Array de modificações base
     * @returns {string} HTML das modificações
     */
    function renderItemBaseModifications(baseMods) {
        if (!baseMods || baseMods.length === 0) {
            return '';
        }

        // ALTERAÇÃO: Log para debug - mostrar dados das modificações
        console.log('🔍 [DEBUG] Modificações base do item:', baseMods);
        baseMods.forEach((bm, index) => {
            console.log(`  Modificação ${index + 1}:`, {
                id: bm.id || bm.ingredient_id,
                nome: bm.ingredient_name || bm.name || bm.nome,
                delta: bm.delta,
                additional_price: bm.additional_price,
                ingredient_price: bm.ingredient_price,
                price: bm.price,
                unit_price: bm.unit_price,
                objeto_completo: bm
            });
        });

        const baseModsItems = baseMods.map(bm => {
            const nome = bm.ingredient_name || bm.name || bm.nome || 'Ingrediente';
            const delta = parseInt(bm.delta ?? 0, 10) || 0;
            const ingredientId = bm.ingredient_id || bm.id;
            
            // Buscar preço usando função centralizada
            const precoUnitario = findIngredientPrice(bm, ingredientId);
            
            const isPositive = delta > 0;
            const icon = isPositive ? 'plus' : 'minus';
            const colorClass = isPositive ? 'mod-add' : 'mod-remove';
            const deltaValue = Math.abs(delta);
            
            // ALTERAÇÃO: Multiplicar preço unitário pela quantidade (delta) para exibir o preço total correto
            // Formatar preço se houver (apenas para adições, remoções não têm custo)
            const precoTotal = precoUnitario * deltaValue;
            const precoFormatado = (precoTotal > 0 && isPositive) ? ` <span class="base-mod-price">+R$ ${precoTotal.toFixed(2).replace('.', ',')}</span>` : '';
            
            return `
                <li>
                    <span class="base-mod-icon ${colorClass}">
                        <i class="fa-solid fa-circle-${icon}"></i>
                    </span>
                    <span class="base-mod-quantity">${deltaValue}</span>
                    <span class="base-mod-name">${escapeHTML(nome)}</span>${precoFormatado}
                </li>
            `;
        }).join('');

        return `
            <div class="item-extras-separator"></div>
            <div class="item-base-mods-list">
                <strong>Modificações:</strong>
                <ul>
                    ${baseModsItems}
                </ul>
            </div>
        `;
    }

    // Renderizar itens do pedido
    function renderOrderItems(items) {
        if (!el.orderItems) return;

        if (items.length === 0) {
            el.orderItems.innerHTML = '<p>Nenhum item encontrado</p>';
            return;
        }

        const itemsHtml = items.map((item, idx) => {
            
            const extras = item.extras || item.additional_items || [];
            const baseMods = item.base_modifications || [];
            
            // Renderizar extras e modificações usando funções auxiliares
            let extrasHtml = renderItemExtras(extras);
            extrasHtml += renderItemBaseModifications(baseMods);

            // Construir URL da imagem a partir de múltiplas possibilidades ou usar placeholder
            const imagePathCandidates = [
                item?.product?.image_url,
                item?.product?.image,
                item?.product_image_url,
                item?.image_url,
                item?.image,
                item?.product?.imagePath,
                item?.product?.image_path
            ];
            const imageHashCandidates = [
                item?.product?.image_hash,
                item?.product_image_hash,
                item?.image_hash,
                item?.product?.imageHash
            ];
            
            let selectedImagePath = imagePathCandidates.find(Boolean);
            const selectedImageHash = imageHashCandidates.find(Boolean);
            
            // Fallback adicional: se não houver caminho de imagem, tentar pelo productId
            if (!selectedImagePath) {
                const prodId = item?.product_id || item?.product?.id || null;
                if (prodId) {
                    const fallbackFiles = [`${prodId}.jpeg`, `${prodId}.jpg`];
                    selectedImagePath = fallbackFiles.find(Boolean);
                    debugLog('Usando fallback por productId para imagem', { prodId, selectedImagePath });
                }
            }

            let imageHtml = '';
            if (selectedImagePath) {
                const builtUrl = buildImageUrl(selectedImagePath, selectedImageHash);
                
                debugLog('Imagem do item', {
                    productName: item?.product_name || item?.product?.name,
                    candidates: imagePathCandidates,
                    selected: selectedImagePath,
                    hash: selectedImageHash,
                    builtUrl
                });
                if (builtUrl) {
                    const altText = escapeHTML(item.product_name || item.product?.name || 'Produto');
                    // SECURITY: URL é validada por buildImageUrl, mas escapeHTML no alt previne XSS
                    imageHtml = `<img src="${escapeHTML(builtUrl)}" alt="${altText}" loading="lazy" onerror="window._rbImgErr && window._rbImgErr(this)">`;
                } else {
                    debugLog('buildImageUrl retornou vazio, usando placeholder');
                    imageHtml = `<img src="${getPlaceholderImagePath()}" alt="Produto" loading="lazy">`;
                }
            } else {
                debugLog('Nenhum caminho de imagem válido encontrado para o item', {
                    productName: item?.product_name || item?.product?.name,
                    candidates: imagePathCandidates
                });
                imageHtml = `<img src="${getPlaceholderImagePath()}" alt="Produto" loading="lazy">`;
            }

            // Calcular preço total do item com fallback seguro
            const unitPrice = parseFloat(item.unit_price) || 0;
            const quantity = parseInt(item.quantity, 10) || 1;
            const itemSubtotal = parseFloat(item.item_subtotal) || parseFloat(item.subtotal) || 0;
            const itemTotal = itemSubtotal > 0 ? itemSubtotal : (unitPrice * quantity);

            return `
                <div class="item">
                    <div class="item-header">
                        <div class="item-image">
                            ${imageHtml}
                        </div>
                        <div class="item-header-info">
                            <p class="nome">${escapeHTML(item.product_name || item.product?.name || 'Produto')}</p>
                            <p class="descricao">${escapeHTML(item.product_description || item.product?.description || '')}</p>
                        </div>
                    </div>
                    ${extrasHtml}
                    <div class="item-footer">
                        <p class="item-preco">R$ ${itemTotal.toFixed(2).replace('.', ',')}</p>
                        <p class="item-quantidade">Qtd: ${item.quantity || 1}</p>
                    </div>
                </div>
            `;
        }).join('');

        el.orderItems.innerHTML = itemsHtml;
    }

    // Renderizar observações do pedido (notas gerais, não por item)
    function renderOrderNotes(order) {
        if (!order) return;
        
        const orderNotes = order.notes || order.observacao;
        
        // Criar ou atualizar elemento de observações do pedido
        let notesContainer = document.getElementById('order-notes-container');
        
        if (!orderNotes || String(orderNotes).trim() === '') {
            // Remover se não houver notas
            if (notesContainer) {
                notesContainer.remove();
            }
            return;
        }

        // Criar container se não existir
        if (!notesContainer) {
            notesContainer = document.createElement('div');
            notesContainer.id = 'order-notes-container';
            notesContainer.className = 'order-notes-section';
            
            // Inserir após os itens do pedido
            if (el.orderItems && el.orderItems.parentElement) {
                // Inserir após orderItems
                el.orderItems.parentElement.insertBefore(notesContainer, el.orderItems.nextSibling);
            } else if (el.orderItems) {
                // Fallback: adicionar como próximo elemento
                el.orderItems.after(notesContainer);
            }
        }

        notesContainer.innerHTML = `
            <div class="item-observacao order-level-notes">
                <strong>Observação do Pedido:</strong> ${escapeHTML(String(orderNotes).trim())}
            </div>
        `;
    }

    // Função auxiliar para escapar HTML
    function escapeHTML(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // Função auxiliar para construir URL da imagem
    function buildImageUrl(imagePath, imageHash = null) {
        // Alinhado com cesta.js: quando não houver caminho, usar placeholder local (respeitando /src/pages)
        if (!imagePath) return getPlaceholderImagePath();
        
        // Validar que imagePath é string antes de processar
        let pathStr = String(imagePath).trim();
        
        // SECURITY: Validar que não contém caracteres perigosos
        if (/[<>"']/.test(pathStr)) {
            // logs disabled
            return getPlaceholderImagePath();
        }
        
        // Normalizar barras e remover duplicadas
        pathStr = pathStr.replace(/\\/g, '/').replace(/\/+/g, '/');
        
        // Se já é uma URL completa, usar diretamente (após validação)
        if (pathStr.startsWith('http://') || pathStr.startsWith('https://')) {
            debugLog('URL de imagem já completa, usando diretamente', pathStr);
            return pathStr;
        }
        
        // CORREÇÃO: Usar API_BASE_URL do api.js para garantir funcionamento em qualquer servidor
        const baseUrl = API_BASE_URL;
        const cacheParam = imageHash || new Date().getTime();
        
        // Aceitar caminhos sem barra inicial: "uploads/products/ID.jpeg"
        if (pathStr.startsWith('uploads/products/')) {
            const fixed = '/uploads/products/' + pathStr.substring('uploads/products/'.length);
            const url = `${baseUrl}${fixed.replace('/uploads/', '/api/uploads/')}?v=${cacheParam}`;
            debugLog('Imagem via uploads/products sem barra inicial', { imagePath: pathStr, url });
            return url;
        }
        
        // Caminho antigo com barra
        if (pathStr.startsWith('/uploads/products/')) {
            const url = `${baseUrl}${pathStr.replace('/uploads/', '/api/uploads/')}?v=${cacheParam}`;
            debugLog('Imagem via /uploads/products (ajustada p/ /api/uploads/)', { imagePath: pathStr, url });
            return url;
        }
        
        // Caminho já com prefixo /api/uploads/products
        if (pathStr.startsWith('/api/uploads/products/')) {
            const url = `${baseUrl}${pathStr}?v=${cacheParam}`;
            debugLog('Imagem via /api/uploads/products', { imagePath: pathStr, url });
            return url;
        }
        
        // Nome de arquivo simples (ex: 123.jpeg ou tudo.jpeg)
        if (/\.(jpg|jpeg|png|gif|webp)$/i.test(pathStr)) {
            const filename = pathStr.split('/').pop();
            const url = `${baseUrl}/api/uploads/products/${filename}?v=${cacheParam}`;
            debugLog('Imagem via nome de arquivo', { imagePath: pathStr, url });
            return url;
        }
        
        // Fallback: tratar como caminho relativo para produtos
        const fallbackUrl = `${baseUrl}/api/uploads/products/${pathStr}?v=${cacheParam}`;
        debugLog('Imagem via fallback relativo', { imagePath: pathStr, fallbackUrl });
        return fallbackUrl;
    }

    // Atualizar resumo financeiro
    async function updateOrderSummary(order) {
        // Priorizar valores vindos da API se disponíveis
        const subtotal = order.subtotal !== undefined ? order.subtotal : 
                         (order.items ? order.items.reduce((sum, item) => {
                             const itemPrice = parseFloat(item.unit_price) || 0;
                             const itemQty = parseInt(item.quantity, 10) || 1;
                             return sum + (itemPrice * itemQty);
                         }, 0) : 0);
            
        // Usar taxa de entrega da API se disponível, senão da configuração, senão 0
        let deliveryFee = 0;
        
        // Verificar se a API já retornou a taxa de entrega
        if (order.delivery_fee !== undefined && order.delivery_fee !== null) {
            deliveryFee = parseFloat(order.delivery_fee) || 0;
        } else if (order.fees !== undefined && order.fees !== null) {
            deliveryFee = parseFloat(order.fees) || 0;
        } else if (settingsHelper && typeof settingsHelper.getDeliveryFee === 'function') {
            try {
                deliveryFee = await settingsHelper.getDeliveryFee();
            } catch (error) {
                // Log apenas em desenvolvimento
                if (isDevelopment()) {
                    console.warn('Usando taxa de entrega padrão:', error.message);
                }
            }
        }
        
        // Verificar se é pickup - não deve cobrar taxa de entrega
        const isPickup = order.order_type === 'pickup' || order.delivery_type === 'pickup';
        if (isPickup) {
            deliveryFee = 0;
        }
        
        // Usar desconto da API se disponível
        const discount = order.discount !== undefined ? order.discount : 0;
        
        // Usar total da API se disponível (já calculado corretamente)
        const total = order.total_amount !== undefined ? order.total_amount : 
                      (subtotal + deliveryFee - discount);
        
        // Calcular pontos ganhos usando configuração dinâmica
        // IMPORTANTE: Pontos são calculados sobre SUBTOTAL (produtos), NÃO sobre total (com entrega)
        // Conforme padrão de programas de fidelidade: pontos não incluem taxas de entrega
        // O backend calcula pontos considerando desconto proporcional ao subtotal
        let pointsEarned = 0;
        
        // Verificar se o pedido já foi concluído (pontos já foram creditados)
        const isCompleted = order.status === 'completed' || order.status === 'delivered';
        
        // Calcular base para pontos: subtotal (produtos apenas, sem taxa de entrega)
        // Se houver desconto, considerar apenas o desconto proporcional ao subtotal
        let basePontos = subtotal;
        if (discount > 0 && total > 0) {
            // Calcular desconto proporcional ao subtotal
            // desconto_no_subtotal = desconto * (subtotal / total_antes_desconto)
            const orderType = order.order_type || 'delivery';
            const isPickup = orderType === 'pickup';
            const deliveryFeeForCalc = isPickup ? 0 : deliveryFee;
            const totalAntesDesconto = subtotal + deliveryFeeForCalc;
            
            if (totalAntesDesconto > 0) {
                const descontoProporcionalSubtotal = discount * (subtotal / totalAntesDesconto);
                basePontos = Math.max(0, subtotal - descontoProporcionalSubtotal);
            }
        }
        
        if (settingsHelper && typeof settingsHelper.calculatePointsEarned === 'function') {
            try {
                pointsEarned = await settingsHelper.calculatePointsEarned(basePontos);
            } catch (error) {
                // Fallback: 10 pontos por real (R$ 0,10 = 1 ponto)
                pointsEarned = Math.floor(basePontos * 10);
            }
        } else {
            // Fallback: 10 pontos por real (R$ 0,10 = 1 ponto)
            pointsEarned = Math.floor(basePontos * 10);
        }
        
        // Mostrar indicação visual se os pontos já foram creditados
        if (el.pointsEarned) {
            el.pointsEarned.textContent = pointsEarned;
            // Adicionar tooltip ou classe para indicar se já foram creditados
            if (isCompleted && el.pointsEarned.parentElement) {
                el.pointsEarned.parentElement.title = 'Pontos já creditados na sua conta';
            }
        }

        if (el.subtotalValue) {
            el.subtotalValue.textContent = `R$ ${subtotal.toFixed(2).replace('.', ',')}`;
        }
        if (el.deliveryFeeValue) {
            el.deliveryFeeValue.textContent = `R$ ${deliveryFee.toFixed(2).replace('.', ',')}`;
        }
        if (el.totalValue) {
            el.totalValue.textContent = `R$ ${total.toFixed(2).replace('.', ',')}`;
        }

        // Mostrar/esconder linha de desconto
        if (el.discountRow) {
            el.discountRow.style.display = discount > 0 ? 'block' : 'none';
        }
        if (el.discountValue) {
            el.discountValue.textContent = `R$ ${discount.toFixed(2).replace('.', ',')}`;
        }
    }

    // Atualizar ações do pedido
    function updateOrderActions(status) {
        if (!el.orderActions) return;

        const canCancel = status === 'pending';
        const canReorder = ['completed', 'delivered', 'paid'].includes(status);

        if (canCancel || canReorder) {
            el.orderActions.style.display = 'block';
            
            if (el.btnCancelOrder) {
                el.btnCancelOrder.style.display = canCancel ? 'block' : 'none';
            }
            if (el.btnReorder) {
                el.btnReorder.style.display = canReorder ? 'block' : 'none';
            }
        } else {
            el.orderActions.style.display = 'none';
        }
    }

    // Cancelar pedido
    async function cancelOrderAction() {
        if (!state.order?.id) return;

        try {
            const result = await cancelOrder(state.order.id);
            if (result.success) {
                showSuccess('Pedido cancelado com sucesso!');
                closeModal('modal-cancel-confirmation');
                // Recarregar detalhes do pedido
                await loadOrderDetails(state.order.id);
            } else {
                showError('Erro ao cancelar pedido: ' + result.error);
            }
        } catch (error) {
            showError('Erro ao cancelar pedido: ' + error.message);
        }
    }

    // Fazer pedido similar
    function reorderAction() {
        if (!state.order?.items) return;

        // Salvar itens do pedido atual no localStorage para reordenação
        const reorderItems = state.order.items.map(item => ({
            product_id: item.product_id,
            quantity: item.quantity,
            extras: item.extras || []
        }));

        localStorage.setItem('royal_reorder_items', JSON.stringify(reorderItems));
        
        // Redirecionar para página de produtos ou carrinho
        window.location.href = 'index.html';
    }

    // Anexar eventos
    function attachEvents() {
        // Botão voltar - redireciona para histórico de pedidos
        if (el.btnVoltar) {
            el.btnVoltar.addEventListener('click', () => {
                window.location.href = 'hist-pedidos.html';
            });
        }

        // Botão cancelar pedido
        if (el.btnCancelOrder) {
            el.btnCancelOrder.addEventListener('click', () => {
                openModal('modal-cancel-confirmation');
            });
        }

        // Botão confirmar cancelamento
        if (el.btnConfirmCancel) {
            el.btnConfirmCancel.addEventListener('click', cancelOrderAction);
        }

        // Botão fazer pedido similar
        if (el.btnReorder) {
            el.btnReorder.addEventListener('click', reorderAction);
        }
    }

    // Utilitários de modal
    function openModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.style.display = 'flex';
            modal.classList.add('show');
        }
    }

    function closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.style.display = 'none';
            modal.classList.remove('show');
        }
    }

    // Verificar se usuário está logado
    function checkUserLogin() {
        const user = window.getStoredUser ? window.getStoredUser() : null;
        if (!user) {
            showError('Você precisa estar logado para ver detalhes do pedido.');
            // Pequeno delay para permitir exibição do alerta antes do redirecionamento
            setTimeout(() => {
                window.location.href = 'login.html';
            }, VISIBILITY_DELAY_MS);
            return false;
        }
        return true;
    }

    // Inicializar
    async function init() {
        debugLog('DOMContentLoaded -> init() chamado');
        const logged = checkUserLogin();
        if (!logged) {
            debugLog('Usuário não logado, abortando init');
            return;
        }

        const orderId = getOrderIdFromUrl();
        if (!orderId) {
            showError('ID do pedido não encontrado na URL.');
            try { debugLog('Redirecionando para histórico de pedidos'); } catch(_) {}
            window.location.href = 'hist-pedidos.html';
            return;
        }

        state.orderId = orderId;
        initElements();
        attachEvents();
        
        // Carregar cache de ingredientes antes de carregar o pedido
        await loadIngredientsCache();
        
        await loadOrderDetails(orderId);
    }

    // ALTERAÇÃO: Expor função para limpar cache no escopo global (útil para debug/reset)
    if (typeof window !== 'undefined') {
        window.clearIngredientsCache = clearIngredientsCache;
        window.reloadIngredientsCache = async () => {
            clearIngredientsCache();
            await loadIngredientsCache(true);
            // Recarregar pedido para atualizar preços
            if (state.orderId) {
                await loadOrderDetails(state.orderId);
            }
        };
    }

    // Inicializar quando DOM estiver pronto (ou imediatamente se já estiver pronto)
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            init();
        });
    } else {
        init();
    }
})();
