/**
 * API de Carrinho
 * Gerencia operações do carrinho híbrido (usuário logado e convidado)
 * 
 * SISTEMA DE CONVERSÃO DE UNIDADES:
 * O backend Python faz conversão automática de unidades ao validar e descontar estoque.
 * 
 * IMPORTANTE - MULTIPLICAÇÃO POR QUANTIDADE DO PRODUTO:
 * Os extras e base_modifications são MULTIPLICADOS pela quantidade do produto/item.
 * 
 * - Extras: quantity representa número de PORÇÕES por item (não kg/g direto)
 *   Backend calcula: quantity_extra × BASE_PORTION_QUANTITY × item_quantity (convertido para STOCK_UNIT)
 *   Exemplo: 5 porções × 30g × 1 item = 150g → 0.15kg
 *   Exemplo: 5 porções × 30g × 3 itens = 450g → 0.45kg (multiplicado!)
 * 
 * - Base Modifications: delta representa mudança em PORÇÕES por item
 *   Backend calcula: delta × BASE_PORTION_QUANTITY × item_quantity (convertido para STOCK_UNIT)
 *   Apenas deltas positivos consomem estoque
 *   Exemplo: delta=2 × 30g × 3 itens = 180g → 0.18kg (multiplicado!)
 * 
 * As mensagens de erro do backend já incluem valores convertidos corretamente.
 */

import { apiRequest, getStoredToken } from './api.js';

// Chave para armazenar dados do carrinho no localStorage
const CART_STORAGE_KEY = 'royal_burger_cart';

// Constantes para validação
const VALIDATION_LIMITS = {
    MAX_QUANTITY: 99,
    MAX_NOTES_LENGTH: 500,
    MAX_EXTRAS_COUNT: 10
};

/**
 * Verifica se o usuário está logado
 * @returns {boolean} True se estiver logado
 */
function isAuthenticated() {
    const token = getStoredToken();
    return !!token;
}

/**
 * Valida se um ID de produto é válido
 * @param {any} productId - ID a ser validado
 * @returns {boolean} True se válido
 */
function isValidProductId(productId) {
    return productId !== null && productId !== undefined && 
           Number.isInteger(Number(productId)) && Number(productId) > 0;
}

/**
 * Valida se uma quantidade é válida
 * @param {any} quantity - Quantidade a ser validada
 * @returns {boolean} True se válida
 */
function isValidQuantity(quantity) {
    const numQuantity = Number(quantity);
    return Number.isInteger(numQuantity) && numQuantity > 0 && numQuantity <= VALIDATION_LIMITS.MAX_QUANTITY;
}

/**
 * Valida se os extras são válidos
 * @param {any} extras - Extras a serem validados
 * @returns {boolean} True se válidos
 */
function isValidExtras(extras) {
    return Array.isArray(extras) && extras.length <= VALIDATION_LIMITS.MAX_EXTRAS_COUNT;
}

/**
 * Valida se as observações são válidas
 * @param {any} notes - Observações a serem validadas
 * @returns {boolean} True se válidas
 */
function isValidNotes(notes) {
    return typeof notes === 'string' && notes.length <= VALIDATION_LIMITS.MAX_NOTES_LENGTH;
}

/**
 * Obtém cart_id do localStorage
 * @returns {string|null} ID do carrinho ou null
 */
function getCartIdFromStorage() {
    try {
        const cartData = localStorage.getItem(CART_STORAGE_KEY);
        if (!cartData) return null;
        
        const parsed = JSON.parse(cartData);
        const cartId = parsed?.cartId;
        
        // Validar e normalizar cart ID
        if (cartId == null) return null; // Captura null e undefined
        
        const cartIdStr = String(cartId).trim();
        
        // Validar se é uma string válida (não vazia e não literal 'undefined'/'null')
        if (!cartIdStr || cartIdStr === 'undefined' || cartIdStr === 'null') {
            return null;
        }
        
        return cartIdStr;
    } catch (error) {
        console.error('Erro ao parsear dados do carrinho:', error.message);
        return null;
    }
}

/**
 * Salva cart_id no localStorage
 * @param {string} cartId - ID do carrinho
 * @param {Array} items - Itens do carrinho
 */
function saveCartToStorage(cartId, items = []) {
    try {
        // Validar cart ID
        if (cartId == null) {
            throw new Error('Cart ID inválido (vazio)');
        }
        
        // Normalizar para string
        const cartIdStr = String(cartId).trim();
        
        if (!cartIdStr || cartIdStr === 'undefined' || cartIdStr === 'null') {
            throw new Error('Cart ID inválido');
        }
        
        if (!Array.isArray(items)) {
            throw new Error('Items deve ser um array');
        }
        
        const dataToSave = {
            cartId: cartIdStr,
            items,
            timestamp: Date.now()
        };
        
        localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(dataToSave));
    } catch (error) {
        console.error('Erro ao salvar carrinho no localStorage:', error.message);
    }
}

/**
 * Limpa dados do carrinho do localStorage
 */
function clearCartFromStorage() {
    localStorage.removeItem(CART_STORAGE_KEY);
}

/**
 * Adiciona item ao carrinho (usuário logado ou convidado)
 * @param {number} productId - ID do produto
 * @param {number} quantity - Quantidade
 * @param {Array} extras - Extras do produto
 * @param {string} notes - Observações
 * @returns {Promise<Object>} Resultado da operação
 */
export async function addToCart(productId, quantity = 1, extras = [], notes = '', base_modifications = []) {
    try {
        // Validar parâmetros de entrada
        if (!isValidProductId(productId)) {
            throw new Error('ID do produto inválido');
        }
        
        if (!isValidQuantity(quantity)) {
            throw new Error(`Quantidade deve ser entre 1 e ${VALIDATION_LIMITS.MAX_QUANTITY}`);
        }
        
        if (!isValidExtras(extras)) {
            throw new Error(`Extras deve ser um array com máximo ${VALIDATION_LIMITS.MAX_EXTRAS_COUNT} itens`);
        }
        
        if (!isValidNotes(notes)) {
            throw new Error(`Observações devem ter no máximo ${VALIDATION_LIMITS.MAX_NOTES_LENGTH} caracteres`);
        }
        
        const isAuth = isAuthenticated();
        const cartId = getCartIdFromStorage();

        // Normalizar extras para garantir formato aceito pelo backend
        // 
        // SISTEMA DE CONVERSÃO DE UNIDADES:
        // O backend Python faz a conversão automática de unidades ao calcular consumo de estoque.
        // 
        // IMPORTANTE - Formato dos dados e MULTIPLICAÇÃO:
        // - quantity (extras) representa o número de PORÇÕES por item (não quantidade direta em kg/g)
        // - Backend calcula: consumo = quantity_extra * BASE_PORTION_QUANTITY * item_quantity (convertido para STOCK_UNIT)
        // 
        // EXTRAS SÃO MULTIPLICADOS PELA QUANTIDADE DO PRODUTO:
        // - Se você adiciona 1 produto com 5 extras de presunto (30g cada)
        // - E depois aumenta a quantidade do produto para 3
        // - O consumo total será: 5 extras × 30g × 3 produtos = 450g = 0.45kg
        // 
        // Exemplo de conversão (1 produto):
        // - Frontend envia: quantity_extra=5 (5 porções extras), quantity_item=1
        // - Backend busca: BASE_PORTION_QUANTITY=30, BASE_PORTION_UNIT='g', STOCK_UNIT='kg'
        // - Backend calcula: 5 × 30g × 1 item = 150g
        // - Backend converte: 150g / 1000 = 0.15kg
        // - Backend valida: 0.15kg vs estoque disponível em kg
        // 
        // Exemplo de conversão (3 produtos):
        // - Frontend envia: quantity_extra=5, quantity_item=3
        // - Backend calcula: 5 × 30g × 3 itens = 450g
        // - Backend converte: 450g / 1000 = 0.45kg
        // - Backend valida: 0.45kg vs estoque disponível em kg
        // 
        // Formato esperado: [{ ingredient_id: int, quantity: int >= 1 }]
        // quantity = número de porções extras POR ITEM do produto
        const normalizedExtras = Array.isArray(extras)
            ? extras
                .map((e) => {
                    const id = parseInt(e?.ingredient_id ?? e?.id, 10);
                    const qty = parseInt(e?.quantity, 10);
                    return {
                        ingredient_id: Number.isInteger(id) && id > 0 ? id : null,
                        quantity: Number.isInteger(qty) && qty > 0 ? Math.min(qty, VALIDATION_LIMITS.MAX_QUANTITY) : null
                    };
                })
                .filter((e) => e.ingredient_id !== null && e.quantity !== null)
            : [];

        // Normalizar base_modifications para garantir formato aceito pelo backend
        // 
        // SISTEMA DE CONVERSÃO DE UNIDADES:
        // O backend Python faz a conversão automática de unidades ao calcular consumo de estoque.
        // 
        // IMPORTANTE - Formato dos dados e MULTIPLICAÇÃO:
        // - delta representa mudança em PORÇÕES por item (não quantidade direta em kg/g)
        // - Backend calcula: consumo = delta * BASE_PORTION_QUANTITY * item_quantity (convertido para STOCK_UNIT)
        // - Apenas deltas positivos consomem estoque (deltas negativos reduzem ingrediente)
        // 
        // BASE_MODIFICATIONS SÃO MULTIPLICADOS PELA QUANTIDADE DO PRODUTO:
        // - Se você adiciona 1 produto com delta=2 (adiciona 2 porções de ingrediente)
        // - E depois aumenta a quantidade do produto para 3
        // - O consumo total será: 2 porções × BASE_PORTION_QUANTITY × 3 produtos
        // 
        // Formato esperado: [{ ingredient_id: int, delta: int != 0 }]
        // delta > 0 = adiciona ingrediente (consome estoque) - multiplicado por quantidade do produto
        // delta < 0 = remove ingrediente (não consome estoque)
        const normalizedBaseMods = Array.isArray(base_modifications)
            ? base_modifications
                .map((bm) => {
                    const id = parseInt(bm?.ingredient_id, 10);
                    const delta = parseInt(bm?.delta, 10);
                    return {
                        ingredient_id: Number.isInteger(id) && id > 0 ? id : null,
                        delta: Number.isInteger(delta) && delta !== 0 ? delta : null
                    };
                })
                .filter((bm) => bm.ingredient_id !== null && bm.delta !== null)
            : [];

        const payload = {
            product_id: Number(productId),
            quantity: Number(quantity),
            extras: normalizedExtras,
            notes: String(notes || '').slice(0, VALIDATION_LIMITS.MAX_NOTES_LENGTH)
        };

        // Adicionar base_modifications apenas se não estiver vazio
        if (normalizedBaseMods.length > 0) {
            payload.base_modifications = normalizedBaseMods;
        }

        // Se não logado, inclui cart_id no payload (se existir)
        if (!isAuth && cartId) {
            payload.guest_cart_id = cartId;
        }

        // DEBUG: Log do payload para diagnóstico de conversão de unidades
        if (normalizedExtras.length > 0 || normalizedBaseMods.length > 0) {
            console.debug('[CART] Adicionando item ao carrinho com conversão de unidades:', {
                productId,
                quantity,
                extras: normalizedExtras,
                base_modifications: normalizedBaseMods,
                nota: 'Backend calcula consumo: quantity × BASE_PORTION_QUANTITY × item_quantity (convertido para STOCK_UNIT)'
            });
        }

        const data = await apiRequest('/api/cart/items', {
            method: 'POST',
            body: payload,
            skipAuth: !isAuth
        });

        // Salva cart_id no localStorage se não logado
        if (!isAuth && data.cart_id) {
            saveCartToStorage(data.cart_id, data.cart?.items || []);
        }
        
        return {
            success: true,
            data: data,
            cartId: data.cart_id,
            isAuthenticated: data.is_authenticated
        };
    } catch (error) {
        // Extrair mensagem de erro do backend
        let errorMessage = error.message || 'Erro ao adicionar item ao carrinho';
        
        // Se o erro tem payload (vindo do apiRequest), tentar extrair mensagem mais detalhada
        if (error.payload) {
            if (error.payload.error) {
                errorMessage = error.payload.error;
            } else if (error.payload.message) {
                errorMessage = error.payload.message;
            }
        }
        
        // Log do erro para debug
        console.error('[CART] Erro ao adicionar ao carrinho:', {
            message: errorMessage,
            status: error.status,
            payload: error.payload
        });
        
        // Mensagens de erro de estoque do backend já incluem informações detalhadas
        // sobre conversão de unidades (ex: "Necessário: 0.150 kg, Disponível: 2.000 kg")
        // Apenas logamos para debug, mas retornamos a mensagem original do backend
        
        return {
            success: false,
            error: errorMessage
        };
    }
}


/**
 * Busca carrinho atual (usuário logado ou convidado)
 * @returns {Promise<Object>} Dados do carrinho
 */
export async function getCart() {
    try {
        const isAuth = isAuthenticated();
        
        if (isAuth) {
            // Busca carrinho do usuário logado
            const data = await apiRequest('/api/cart/me', { method: 'GET' });
            return {
                success: true,
                data: data,
                isAuthenticated: true
            };
        } else {
            // Busca carrinho de convidado
            const cartId = getCartIdFromStorage();
            
            // Se é um ID de fallback antigo, limpar e retornar carrinho vazio
            if (cartId && typeof cartId === 'string' && cartId.startsWith('fallback_')) {
                clearCartFromStorage();
                return {
                    success: true,
                    data: { cart: { items: [] }, summary: { is_empty: true } },
                    isAuthenticated: false
                };
            }
            
            if (cartId) {
                const data = await apiRequest(`/api/cart/guest/${cartId}`, { 
                    method: 'GET',
                    skipAuth: true
                });
                return {
                    success: true,
                    data: data,
                    isAuthenticated: false
                };
            }
        }
        
        return {
            success: true,
            data: { cart: { items: [] }, summary: { is_empty: true } },
            isAuthenticated: isAuth
        };
    } catch (error) {
        // TODO: Implementar logging estruturado em produção
        console.error('Erro ao buscar carrinho:', error.message);
        return {
            success: false,
            error: error.message
        };
    }
}


/**
 * Atualiza item do carrinho
 * 
 * IMPORTANTE - VALIDAÇÃO DE ESTOQUE AO ATUALIZAR QUANTIDADE:
 * Quando você atualiza a quantidade de um produto que já está na cesta com extras,
 * o backend valida se há estoque suficiente considerando a NOVA quantidade total.
 * 
 * Exemplo:
 * - Item na cesta: 1 produto com 5 extras de presunto (30g cada)
 * - Consumo atual: 5 × 30g × 1 = 150g = 0.15kg
 * - Você atualiza quantidade para 3 produtos
 * - Backend valida: 5 × 30g × 3 = 450g = 0.45kg
 * - Se não houver 0.45kg disponível, retorna erro de estoque insuficiente
 * 
 * @param {number} itemId - ID do item
 * @param {Object} updates - Dados para atualização
 * @param {number} [updates.quantity] - Nova quantidade do produto (valida estoque com extras multiplicados)
 * @param {Array} [updates.extras] - Novos extras (valida estoque)
 * @param {string} [updates.notes] - Novas observações
 * @param {Array} [updates.base_modifications] - Novas modificações da receita base
 * @returns {Promise<Object>} Resultado da operação
 */
export async function updateCartItem(itemId, updates) {
    try {
        // Validar ID do item
        if (!isValidProductId(itemId)) {
            throw new Error('ID do item inválido');
        }
        
        // Validar updates se contiver quantidade
        if (updates.quantity !== undefined && !isValidQuantity(updates.quantity)) {
            throw new Error(`Quantidade deve ser entre 1 e ${VALIDATION_LIMITS.MAX_QUANTITY}`);
        }
        
        // Validar notes se fornecidas
        if (updates.notes !== undefined && !isValidNotes(updates.notes)) {
            throw new Error(`Observações devem ter no máximo ${VALIDATION_LIMITS.MAX_NOTES_LENGTH} caracteres`);
        }
        
        const isAuth = isAuthenticated();
        const cartId = getCartIdFromStorage();
        
        // Normalizar extras e base_modifications se fornecidos (mesmo formato de addToCart)
        const payload = { ...updates };
        
        // Normalizar extras se fornecidos
        if (updates.extras !== undefined) {
            const normalizedExtras = Array.isArray(updates.extras)
                ? updates.extras
                    .map((e) => {
                        const id = parseInt(e?.ingredient_id ?? e?.id, 10);
                        const qty = parseInt(e?.quantity, 10);
                        return {
                            ingredient_id: Number.isInteger(id) && id > 0 ? id : null,
                            quantity: Number.isInteger(qty) && qty > 0 ? Math.min(qty, VALIDATION_LIMITS.MAX_QUANTITY) : null
                        };
                    })
                    .filter((e) => e.ingredient_id !== null && e.quantity !== null)
                : [];
            payload.extras = normalizedExtras;
        }
        
        // Normalizar base_modifications se fornecidos
        if (updates.base_modifications !== undefined) {
            const normalizedBaseMods = Array.isArray(updates.base_modifications)
                ? updates.base_modifications
                    .map((bm) => {
                        const id = parseInt(bm?.ingredient_id, 10);
                        const delta = parseInt(bm?.delta, 10);
                        return {
                            ingredient_id: Number.isInteger(id) && id > 0 ? id : null,
                            delta: Number.isInteger(delta) && delta !== 0 ? delta : null
                        };
                    })
                    .filter((bm) => bm.ingredient_id !== null && bm.delta !== null)
                : [];
            payload.base_modifications = normalizedBaseMods;
        }
        
        if (!isAuth && cartId) {
            payload.guest_cart_id = cartId;
        }

        // DEBUG: Log do payload para diagnóstico de conversão de unidades
        if (payload.quantity !== undefined || (payload.extras && payload.extras.length > 0) || (payload.base_modifications && payload.base_modifications.length > 0)) {
            console.debug('[CART] Atualizando item do carrinho:', {
                itemId,
                updates: {
                    quantity: payload.quantity,
                    extras: payload.extras,
                    base_modifications: payload.base_modifications
                },
                nota: payload.quantity !== undefined 
                    ? 'Backend valida estoque: extras existentes × BASE_PORTION_QUANTITY × nova_quantity (convertido para STOCK_UNIT)'
                    : 'Backend calcula consumo: quantity × BASE_PORTION_QUANTITY × item_quantity (convertido para STOCK_UNIT)'
            });
        }

        const data = await apiRequest(`/api/cart/items/${itemId}`, {
            method: 'PUT',
            body: payload,
            skipAuth: !isAuth
        });

        // Atualiza localStorage se não logado
        if (!isAuth) {
            saveCartToStorage(data.cart_id, data.cart?.items || []);
        }
        
        return {
            success: true,
            data: data
        };
    } catch (error) {
        // Extrair mensagem de erro do backend
        let errorMessage = error.message || 'Erro ao atualizar item do carrinho';
        
        // Se o erro tem payload (vindo do apiRequest), tentar extrair mensagem mais detalhada
        if (error.payload) {
            if (error.payload.error) {
                errorMessage = error.payload.error;
            } else if (error.payload.message) {
                errorMessage = error.payload.message;
            }
        }
        
        // Log do erro para debug
        console.error('[CART] Erro ao atualizar item:', {
            itemId,
            message: errorMessage,
            status: error.status,
            payload: error.payload
        });
        
        return {
            success: false,
            error: errorMessage
        };
    }
}


/**
 * Remove item do carrinho
 * @param {number} itemId - ID do item
 * @returns {Promise<Object>} Resultado da operação
 */
export async function removeCartItem(itemId) {
    try {
        // Validar ID do item
        if (!isValidProductId(itemId)) {
            throw new Error('ID do item inválido');
        }
        
        const isAuth = isAuthenticated();
        const cartId = getCartIdFromStorage();
        
        const payload = {};
        if (!isAuth && cartId) {
            payload.guest_cart_id = cartId;
        }

        const data = await apiRequest(`/api/cart/items/${itemId}`, {
            method: 'DELETE',
            body: payload,
            skipAuth: !isAuth
        });

        // Atualiza localStorage se não logado
        if (!isAuth) {
            saveCartToStorage(data.cart_id, data.cart?.items || []);
        }
        
        return {
            success: true,
            data: data
        };
    } catch (error) {
        // TODO: Implementar logging estruturado em produção
        console.error('Erro ao remover item:', error.message);
        return {
            success: false,
            error: error.message
        };
    }
}


/**
 * Reivindica carrinho de convidado (após login)
 * @returns {Promise<Object>} Resultado da operação
 */
export async function claimGuestCart() {
    try {
        const cartId = getCartIdFromStorage();
        if (!cartId) {
            return { success: true, message: 'Nenhum carrinho para reivindicar' };
        }

        const data = await apiRequest('/api/cart/claim', {
            method: 'POST',
            body: {
                guest_cart_id: cartId
            }
        });

        // Limpa localStorage após sucesso
        clearCartFromStorage();
        return {
            success: true,
            data: data,
            message: data.message
        };
    } catch (error) {
        // TODO: Implementar logging estruturado em produção
        console.error('Erro ao reivindicar carrinho:', error.message);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Sincroniza localStorage com carrinho do usuário
 * @returns {Promise<Object>} Resultado da operação
 */
export async function syncCart() {
    try {
        const cartData = localStorage.getItem(CART_STORAGE_KEY);
        if (!cartData) {
            return { success: true, message: 'Nenhum item para sincronizar' };
        }

        const { items } = JSON.parse(cartData);
        if (!items || items.length === 0) {
            return { success: true, message: 'Nenhum item para sincronizar' };
        }

        const data = await apiRequest('/api/cart/sync', {
            method: 'POST',
            body: { items }
        });

        // Limpa localStorage após sincronização
        clearCartFromStorage();
        return {
            success: true,
            data: data,
            message: data.message
        };
    } catch (error) {
        // TODO: Implementar logging estruturado em produção
        console.error('Erro ao sincronizar carrinho:', error.message);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Limpa carrinho (usuário logado ou convidado)
 * @returns {Promise<Object>} Resultado da operação
 */
export async function clearCart() {
    try {
        const isAuth = isAuthenticated();
        const cartId = getCartIdFromStorage();

        if (isAuth) {
            // Usuário autenticado: usar rota /me/clear
            const data = await apiRequest('/api/cart/me/clear', {
                method: 'DELETE'
            });

            return {
                success: true,
                message: data.message
            };
        } else {
            // Convidado: limpar localStorage e itens do carrinho via API
            if (cartId) {
                // Buscar todos os itens do carrinho
                const cartData = await getCart();
                const items = cartData?.data?.items || cartData?.data?.cart?.items || [];
                
                // Remover cada item individualmente
                for (const item of items) {
                    await removeCartItem(item.id);
                }
            }
            
            // Limpar localStorage
            clearCartFromStorage();

            return {
                success: true,
                message: 'Carrinho limpo com sucesso'
            };
        }
    } catch (error) {
        // TODO: Implementar logging estruturado em produção
        console.error('Erro ao limpar carrinho:', error.message);
        return {
            success: false,
            error: error.message
        };
    }
}

// Limpar dados antigos do fallback na inicialização
function clearOldFallbackData() {
    try {
        // Limpar cart_id de fallback
        const cartId = localStorage.getItem('royal_burger_cart_id');
        if (cartId && cartId.startsWith('fallback_')) {
            localStorage.removeItem('royal_burger_cart_id');
        }
        
        // Limpar cesta antiga do localStorage
        const oldCart = localStorage.getItem('royal_cesta');
        if (oldCart) {
            localStorage.removeItem('royal_cesta');
        }
        
        // Limpar backup antigo
        const backup = localStorage.getItem('royal_cesta_backup');
        if (backup) {
            localStorage.removeItem('royal_cesta_backup');
        }
    } catch (error) {
        console.error('Erro ao limpar dados antigos:', error);
    }
}

// Executar limpeza na inicialização
clearOldFallbackData();

// Exportar funções auxiliares para compatibilidade
export { isAuthenticated, getCartIdFromStorage, saveCartToStorage, clearCartFromStorage };
