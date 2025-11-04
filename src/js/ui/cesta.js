// src/js/ui/cesta.js
// Gerenciamento da Modal da Cesta

import { showConfirm, showError, showToast } from './alerts.js';
import { getCart, updateCartItem, removeCartItem, clearCart, claimGuestCart } from '../api/cart.js';
import { getIngredients } from '../api/ingredients.js';
import { API_BASE_URL } from '../api/api.js';

// Importar helper de configurações
// Importação estática garante que o módulo esteja disponível quando necessário
import * as settingsHelper from '../utils/settings-helper.js';

// Constantes para validação e limites
const VALIDATION_LIMITS = {
    MAX_ITEMS: 50,
    MAX_QUANTITY_PER_ITEM: 99,
    MAX_NOTES_LENGTH: 500,
    MAX_EXTRAS_PER_ITEM: 10
};

const state = {
    itens: [],
    taxaEntrega: 5.00, // Fallback padrão (será carregado dinamicamente)
    descontos: 0.00,
    subtotal: 0,
    total: 0,
    ingredientsCache: null // Cache para preços dos ingredientes
};

// Refs DOM
const el = {
    modal: null,
    cestaVazia: null,
    itemsContainer: null,
    resumoContainer: null,
    listaItens: null,
    subtotal: null,
    taxaEntrega: null,
    descontos: null,
    total: null,
    footerTotal: null,
    pontos: null,
    btnLimpar: null,
    btnContinuar: null,
    headerCesta: null,
    headerPreco: null,
    headerItens: null,
    btnCestaFlutuante: null,
    cestaBadgeCount: null,
    cestaValorFlutuante: null
};

// Utils
const formatBRL = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

// Carregar ingredientes e criar mapa de preços
async function loadIngredientsCache() {
    if (state.ingredientsCache) {
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
            return state.ingredientsCache;
        }
        // Resposta vazia ou inválida - inicializar cache vazio
        state.ingredientsCache = {};
    } catch (error) {
        // Log apenas em desenvolvimento - não expor detalhes em produção
        const isDev = typeof process !== 'undefined' && process.env?.NODE_ENV === 'development';
        if (isDev) {
            console.error('Erro ao carregar ingredientes:', error);
        }
        state.ingredientsCache = {};
    }
    return state.ingredientsCache || {};
}

// Buscar preço adicional de um ingrediente pelo ID
// Valida tipo e existência antes de buscar no cache
function getIngredientPrice(ingredientId) {
    if (!state.ingredientsCache || !ingredientId) {
        return 0;
    }
    // Normalizar ID para string (algumas APIs retornam number, outras string)
    const normalizedId = String(ingredientId);
    const ingredient = state.ingredientsCache[normalizedId];
    // Retornar additional_price (preço quando adicionado como extra)
    return ingredient ? (ingredient.additional_price || 0) : 0;
}

/**
 * Sanitiza texto para evitar XSS
 * @param {any} text - Texto a ser sanitizado
 * @returns {string} Texto sanitizado
 */
function escapeHTML(text) {
    if (typeof text !== 'string') return String(text || '');
    
    // Usar DOMPurify se disponível para sanitização robusta
    if (typeof DOMPurify !== 'undefined') {
        return DOMPurify.sanitize(text, { ALLOWED_TAGS: [] });
    }
    
    // Fallback: usar DOM nativo (mais seguro que regex)
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Valida se um item é válido
 * @param {Object} item - Item a ser validado
 * @returns {boolean} True se válido
 */
function isValidItem(item) {
    return item && 
           typeof item === 'object' && 
           typeof item.product_id === 'number' && 
           typeof item.product?.name === 'string' && 
           typeof item.quantity === 'number' &&
           item.quantity > 0 && 
           item.quantity <= VALIDATION_LIMITS.MAX_QUANTITY_PER_ITEM;
}

/**
 * Valida se os dados do carrinho são válidos
 * @param {Array} itens - Itens a serem validados
 * @returns {boolean} True se válidos
 */
function isValidCartData(itens) {
    return Array.isArray(itens) && 
           itens.length <= VALIDATION_LIMITS.MAX_ITEMS &&
           itens.every(isValidItem);
}

/**
 * Constrói URL da imagem de forma segura
 * @param {string} imagePath - Caminho da imagem
 * @param {string} imageHash - Hash para cache busting
 * @returns {string} URL da imagem
 */
function buildImageUrl(imagePath, imageHash = null) {
    if (!imagePath || typeof imagePath !== 'string') {
        // Usar imagem padrão que existe no projeto
        return 'src/assets/img/1.png';
    }
    
    // Se já é uma URL completa, retornar como está
    if (imagePath.startsWith('http')) {
        return imagePath;
    }
    
    // CORREÇÃO: Usar API_BASE_URL do api.js para garantir funcionamento em qualquer servidor
    // Isso evita erros quando o código é colocado em outros servidores
    const baseUrl = API_BASE_URL;
    
    const cacheParam = imageHash || new Date().getTime();
    
    // Sanitizar caminho da imagem
    const sanitizedPath = imagePath.replace(/[^a-zA-Z0-9._/-]/g, '');
    
    if (sanitizedPath.startsWith('/api/uploads/products/')) {
        return `${baseUrl}${sanitizedPath}?v=${cacheParam}`;
    }
    
    if (sanitizedPath.startsWith('/uploads/products/')) {
        return `${baseUrl}${sanitizedPath.replace('/uploads/', '/api/uploads/')}?v=${cacheParam}`;
    }
    
    if (sanitizedPath.match(/^\d+\.(jpg|jpeg|png|gif|webp)$/i)) {
        return `${baseUrl}/api/uploads/products/${sanitizedPath}?v=${cacheParam}`;
    }
    
    return `${baseUrl}/api/uploads/products/${sanitizedPath}?v=${cacheParam}`;
}

// Carregar cesta da API
async function carregarCesta() {
    try {
        const result = await getCart();
        
        if (result.success) {
            // Converter dados da API para formato local
            // CORREÇÃO: API retorna diferentes estruturas para usuário logado vs convidado
            // Usuário logado: result.data.items
            // Convidado: result.data.cart.items
            let apiItems = [];
            
            if (result.data.items) {
                // Usuário autenticado
                apiItems = result.data.items;
            } else if (result.data.cart?.items) {
                // Convidado: cart tem items dentro
                apiItems = result.data.cart.items;
            } else if (result.data.cart && Array.isArray(result.data.cart)) {
                // Convidado: cart é o array direto
                apiItems = result.data.cart;
            } else {
                apiItems = [];
            }
            
            // Validar dados antes de processar
            if (!isValidCartData(apiItems)) {
                throw new Error('Dados do carrinho inválidos');
            }
            
            state.itens = apiItems.map(item => {
                const produto = item.product || {};
                
                // Mapear EXTRAS (ingredientes adicionais fora da receita)
                const rawExtras = item.extras || item.additional_items || item.additional_ingredients || item.ingredients_extras || [];
                const extrasMapeados = (Array.isArray(rawExtras) ? rawExtras : []).map(extra => {
                    const id = extra.ingredient_id ?? extra.id;
                    const nome = extra.ingredient_name ?? extra.name ?? extra.title ?? 'Ingrediente';
                    
                    // Buscar preço do cache de ingredientes primeiro
                    let preco = 0;
                    if (id) {
                        preco = getIngredientPrice(id);
                    }
                    // Se não encontrou no cache, tentar nos dados do extra
                    if (preco === 0) {
                        preco = parseFloat(extra.ingredient_price ?? extra.price ?? extra.additional_price ?? 0) || 0;
                    }
                    
                    const quantidade = parseInt(extra.quantity ?? extra.qty ?? 0, 10) || 0;
                    return { id, nome, preco, quantidade };
                });

                // Mapear BASE_MODIFICATIONS (modificações da receita base)
                const rawBaseMods = item.base_modifications || [];
                const baseModsMapeados = (Array.isArray(rawBaseMods) ? rawBaseMods : []).map(bm => {
                    const id = bm.ingredient_id ?? bm.id;
                    const nome = bm.ingredient_name ?? bm.name ?? 'Ingrediente';
                    const delta = parseInt(bm.delta ?? 0, 10) || 0;
                    
                    // Buscar preço do cache de ingredientes
                    let preco = 0;
                    if (id) {
                        preco = getIngredientPrice(id);
                    }
                    
                    return { id, nome, delta, preco };
                });

                const quantidade = parseInt(String(item.quantity || 1), 10);
                const precoBaseNum = parseFloat(produto.price) || 0;
                const extrasTotal = parseFloat(item.extras_total ?? 0) || 0;
                const baseModsTotal = parseFloat(item.base_mods_total ?? 0) || 0;

                const itemSubtotal = item.item_subtotal ?? item.subtotal ?? null;
                const precoUnitario = (itemSubtotal && quantidade > 0)
                    ? (parseFloat(itemSubtotal) / quantidade)
                    : (precoBaseNum + extrasTotal + baseModsTotal);
                const precoTotal = itemSubtotal ? parseFloat(itemSubtotal) : (precoUnitario * quantidade);

                return {
                    id: item.product_id,
                    nome: produto.name,
                    descricao: produto.description,
                    imagem: produto.image_url,
                    imageHash: produto.image_hash,
                    precoBase: precoBaseNum,
                    quantidade: quantidade,
                    extras: extrasMapeados,
                    base_modifications: baseModsMapeados,
                    observacao: item.notes || '',
                    precoUnitario: precoUnitario,
                    precoTotal: precoTotal,
                    cartItemId: item.id,
                    timestamp: Date.now()
                };
            });
        } else {
            // Log apenas em desenvolvimento
            const isDev = typeof process !== 'undefined' && process.env?.NODE_ENV === 'development';
            if (isDev) {
                console.error('Erro ao carregar cesta:', result.error);
            }
            state.itens = [];
        }
    } catch (err) {
        // Log apenas em desenvolvimento
        const isDev = typeof process !== 'undefined' && process.env?.NODE_ENV === 'development';
        if (isDev) {
            console.error('Exceção ao carregar cesta:', err.message, err.stack);
        }
        state.itens = [];
    }
    
    // Renderizar cesta após carregar dados
    renderCesta();
}

// Verificar se há backup da cesta para restaurar após login (FALLBACK ONLY)
// 
// NOTA IMPORTANTE: A reivindicação principal do carrinho é feita no login
// (log-cadas.js e verificar-email.js via claimGuestCart).
// Esta função serve apenas como fallback para limpar dados órfãos caso
// algo dê errado no fluxo principal.
// 
// FLUXO NORMAL:
// 1. Usuário faz pedido sem login → cart_id salvo em localStorage
// 2. Usuário faz login → claimGuestCart() vincula cart ao user_id
// 3. Esta função apenas limpa o backup local
async function verificarBackupCesta() {
    try {
        const backupStr = localStorage.getItem('royal_cesta_backup');
        if (!backupStr) return false;
        
        // Validar dados do backup
        let backupItens;
        try {
            backupItens = JSON.parse(backupStr);
        } catch (parseErr) {
            // Dados corrompidos, limpar
            localStorage.removeItem('royal_cesta_backup');
            return false;
        }
        
        if (!isValidCartData(backupItens)) {
            // Dados inválidos, limpar
            localStorage.removeItem('royal_cesta_backup');
            return false;
        }
        
        // Se há itens no backup, limpar (já deve ter sido reivindicado no login)
        if (backupItens.length > 0) {
            localStorage.removeItem('royal_cesta_backup');
            
            // Recarregar cesta da API para garantir sincronização
            await carregarCesta();
            return true;
        }
    } catch (err) {
        // Em caso de erro, limpar backup para evitar loops
        localStorage.removeItem('royal_cesta_backup');
    }
    return false;
}

// Salvar cesta no localStorage
function salvarCesta() {
    try {
        // Validar dados antes de salvar
        if (!isValidCartData(state.itens)) {
            throw new Error('Dados da cesta inválidos para salvar');
        }
        
        localStorage.setItem('royal_cesta', JSON.stringify(state.itens));
    } catch (err) {
        // Log apenas em desenvolvimento - erro de localStorage geralmente não é crítico
        const isDev = typeof process !== 'undefined' && process.env?.NODE_ENV === 'development';
        if (isDev) {
            console.error('Erro ao salvar cesta:', err.message);
        }
    }
}

// Calcular totais
function calcularTotais() {
    state.subtotal = state.itens.reduce((sum, item) => {
        return sum + (item.precoTotal || 0);
    }, 0);
    
    // Taxa de entrega só é aplicada se houver itens na cesta
    // NOTA: A modal da cesta sempre mostra a taxa de entrega porque é exibida ANTES
    // da seleção do endereço. A verificação de "retirada no local" (pickup) que zera
    // a taxa de entrega é feita na página de pagamento após selecionar o endereço.
    const taxaEntrega = state.itens.length > 0 ? state.taxaEntrega : 0;
    
    state.total = state.subtotal + taxaEntrega - state.descontos;
}

// Calcular pontos Royal usando configuração dinâmica
// IMPORTANTE: Pontos são calculados sobre o SUBTOTAL (produtos), NÃO sobre o total (com entrega)
// Conforme padrão de programas de fidelidade: pontos não incluem taxas de entrega
async function calcularPontos() {
    let pontos = 0;
    
    // Calcular base para pontos: subtotal (produtos apenas, sem taxa de entrega)
    // Se houver desconto, considerar apenas o desconto proporcional ao subtotal
    let basePontos = state.subtotal;
    if (state.descontos > 0 && state.total > 0) {
        // Se houver desconto aplicado, calcular desconto proporcional ao subtotal
        // desconto_no_subtotal = desconto * (subtotal / total_antes_desconto)
        const totalAntesDesconto = state.subtotal + state.taxaEntrega;
        if (totalAntesDesconto > 0) {
            const descontoProporcionalSubtotal = state.descontos * (state.subtotal / totalAntesDesconto);
            basePontos = Math.max(0, state.subtotal - descontoProporcionalSubtotal);
        }
    }
    
    // Tentar calcular usando helper de configurações
    if (settingsHelper && typeof settingsHelper.calculatePointsEarned === 'function') {
        try {
            pontos = await settingsHelper.calculatePointsEarned(basePontos);
        } catch (error) {
            console.warn('Usando cálculo padrão de pontos:', error.message);
            // Fallback: 10 pontos por real (R$ 0,10 = 1 ponto)
            pontos = Math.floor(basePontos * 10);
        }
    } else {
        // Fallback: 10 pontos por real (R$ 0,10 = 1 ponto)
        pontos = Math.floor(basePontos * 10);
    }
    
    return pontos;
}

// Renderizar item individual
function renderItem(item, index) {
    const imageUrl = buildImageUrl(item.imagem, item.imageHash);
    
    // Renderizar lista de EXTRAS (ingredientes adicionais)
    let extrasHtml = '';
    if (item.extras && item.extras.length > 0) {
        const extrasItems = item.extras.map(extra => {
            // Buscar preço do cache ou usar o preço já mapeado
            let preco = extra.preco || 0;
            if (preco === 0 && extra.id) {
                preco = getIngredientPrice(extra.id);
            }
            
            // Formatar preço se houver
            const precoFormatado = preco > 0 ? ` <span class="extra-price">+R$ ${preco.toFixed(2).replace('.', ',')}</span>` : '';
            return `<li><span class="extra-quantity-badge">${extra.quantidade}</span> <span class="extra-name">${escapeHTML(extra.nome)}</span>${precoFormatado}</li>`;
        }).join('');
        extrasHtml = `
            <div class="item-extras-separator"></div>
            <div class="item-extras-list">
                <strong>Extras:</strong>
                <ul>
                    ${extrasItems}
                </ul>
            </div>
        `;
    }

    // Renderizar lista de BASE_MODIFICATIONS (modificações da receita base)
    let baseModsHtml = '';
    if (item.base_modifications && item.base_modifications.length > 0) {
        const baseModsItems = item.base_modifications.map(bm => {
            const isPositive = bm.delta > 0;
            const icon = isPositive ? '+' : '-';
            const colorClass = isPositive ? 'mod-add' : 'mod-remove';
            const deltaValue = Math.abs(bm.delta);
            
            // Formatar preço se houver (apenas para adições, remoções não têm custo)
            const precoFormatado = (bm.preco > 0 && isPositive) ? ` <span class="base-mod-price">+R$ ${bm.preco.toFixed(2).replace('.', ',')}</span>` : '';
            
            return `
                <li>
                    <span class="base-mod-icon ${colorClass}">
                        <i class="fa-solid fa-circle-${isPositive ? 'plus' : 'minus'}"></i>
                    </span>
                    <span class="base-mod-quantity">${deltaValue}</span>
                    <span class="base-mod-name">${escapeHTML(bm.nome)}</span>${precoFormatado}
                </li>
            `;
        }).join('');
        baseModsHtml = `
            <div class="item-extras-separator"></div>
            <div class="item-base-mods-list">
                <strong>Modificações:</strong>
                <ul>
                    ${baseModsItems}
                </ul>
            </div>
        `;
    }

    // Mostrar observação se houver
    const obsHtml = item.observacao ? `
        <div class="item-extras-separator"></div>
        <div class="item-observacao">
            <strong>Obs:</strong> ${escapeHTML(item.observacao)}
        </div>
    ` : '';

    return `
        <div class="item-cesta-modal" data-index="${index}">
            <div class="item-header">
                <div class="item-image">
                    <img src="${imageUrl}" alt="${escapeHTML(item.nome)}">
                </div>
                <div class="item-header-info">
                    <h4 class="item-nome">${escapeHTML(item.nome)}</h4>
                    <p class="item-descricao">${escapeHTML(item.descricao || '')}</p>
                </div>
                <button class="btn-editar-item" data-index="${index}" title="Editar">
                    <i class="fa-solid fa-pen"></i>
                </button>
            </div>
            ${extrasHtml}
            ${baseModsHtml}
            ${obsHtml}
            <div class="item-extras-separator"></div>
            <div class="item-footer">
                <p class="item-preco">${formatBRL(item.precoTotal)}</p>
                <div class="item-footer-controls">
                    ${item.quantidade === 1 ? `
                        <button class="btn-remover-item" data-index="${index}" title="Remover">
                            <i class="fa-solid fa-trash-can"></i>
                        </button>
                        <span class="quantidade-valor">${String(item.quantidade).padStart(2, '0')}</span>
                        <button class="btn-qtd-mais-modal" data-index="${index}">
                            <i class="fa-solid fa-plus"></i>
                        </button>
                    ` : `
                        <div class="quantidade-controls">
                            <button class="btn-qtd-menos-modal" data-index="${index}">
                                <i class="fa-solid fa-minus"></i>
                            </button>
                            <span class="quantidade-valor">${String(item.quantidade).padStart(2, '0')}</span>
                            <button class="btn-qtd-mais-modal" data-index="${index}">
                                <i class="fa-solid fa-plus"></i>
                            </button>
                        </div>
                    `}
                </div>
            </div>
        </div>
    `;
}

// Renderizar cesta completa
async function renderCesta() {
    if (!el.listaItens) return;

    calcularTotais();

    // Verificar se está vazia
    if (state.itens.length === 0) {
        if (el.cestaVazia) el.cestaVazia.style.display = 'flex';
        if (el.itemsContainer) el.itemsContainer.style.display = 'none';
        if (el.resumoContainer) el.resumoContainer.style.display = 'none';
        if (el.btnLimpar) el.btnLimpar.style.display = 'none';
        
        // Atualizar footer-total mesmo quando vazio
        if (el.footerTotal) el.footerTotal.textContent = formatBRL(state.total);
        
        atualizarHeaderCesta();
        atualizarBotaoFlutuante();
        atualizarPontosHeader();
        return;
    }

    // Mostrar conteúdo
    if (el.cestaVazia) el.cestaVazia.style.display = 'none';
    if (el.itemsContainer) el.itemsContainer.style.display = 'block';
    if (el.resumoContainer) el.resumoContainer.style.display = 'block';
    if (el.btnLimpar) el.btnLimpar.style.display = 'block';

    // Renderizar itens
    el.listaItens.innerHTML = state.itens.map((item, index) => renderItem(item, index)).join('');

    // Atualizar valores
    if (el.subtotal) el.subtotal.textContent = formatBRL(state.subtotal);
    if (el.taxaEntrega) el.taxaEntrega.textContent = formatBRL(state.taxaEntrega);
    if (el.descontos) el.descontos.textContent = formatBRL(state.descontos);
    if (el.total) el.total.textContent = formatBRL(state.total);
    if (el.footerTotal) el.footerTotal.textContent = formatBRL(state.total);
    
    // Calcular pontos (agora é async)
    const pontos = await calcularPontos();
    if (el.pontos) el.pontos.textContent = pontos;

    atualizarHeaderCesta();
    atualizarBotaoFlutuante();
    atualizarPontosHeader();
    attachItemHandlers();
}

// Atualizar header da cesta (ícone no topo)
function atualizarHeaderCesta() {
    if (!el.headerCesta) return;

    const totalItens = state.itens.reduce((sum, item) => sum + item.quantidade, 0);
    
    if (el.headerPreco) el.headerPreco.textContent = formatBRL(state.subtotal);
    if (el.headerItens) el.headerItens.textContent = `/ ${totalItens} ${totalItens === 1 ? 'item' : 'itens'}`;
}

// Atualizar botão flutuante da cesta
function atualizarBotaoFlutuante() {
    if (!el.btnCestaFlutuante) return;

    const totalItens = state.itens.reduce((sum, item) => sum + item.quantidade, 0);

    // Mostrar ou ocultar botão baseado em se há itens
    if (totalItens > 0) {
        el.btnCestaFlutuante.style.display = 'flex';
        if (el.cestaBadgeCount) el.cestaBadgeCount.textContent = totalItens;
        if (el.cestaValorFlutuante) el.cestaValorFlutuante.textContent = formatBRL(state.subtotal);
    } else {
        el.btnCestaFlutuante.style.display = 'none';
    }
}

// Atualizar pontos no header
function atualizarPontosHeader() {
    if (window.headerPontos && typeof window.headerPontos.carregarPontos === 'function') {
        window.headerPontos.carregarPontos();
    }
}

/**
 * Formata mensagem de erro de atualização de item para exibição
 * @param {string} rawMessage - Mensagem de erro do backend
 * @returns {string} Mensagem formatada para exibição
 */
function getFriendlyUpdateError(rawMessage) {
    const msg = (rawMessage || '').toString().trim();
    if (!msg) return 'Não foi possível atualizar a quantidade. Tente novamente.';
    
    // Mensagens de estoque insuficiente já vêm formatadas do backend com detalhes
    if (msg.includes('Estoque insuficiente')) {
        return msg; // Exibir mensagem completa do backend (ex: "Estoque insuficiente para extra 'Presunto'. Necessário: 0.450 kg, Disponível: 2.000 kg")
    }
    
    // Erros conhecidos
    if (msg.includes('da receita base')) {
        return 'Você tentou modificar um ingrediente da receita base. Ajuste apenas os extras.';
    }
    if (msg.toLowerCase().includes('unauthorized') || msg.includes('Sessão expirada')) {
        return 'Sua sessão expirou. Faça login e tente novamente.';
    }
    if (msg.includes('Serviço não encontrado')) {
        return 'Serviço indisponível. Verifique se o servidor está em execução.';
    }
    if (msg.includes('INVALID_QUANTITY')) {
        return 'Quantidade inválida. Verifique os limites permitidos.';
    }
    if (msg.includes('EXTRA_OUT_OF_RANGE')) {
        return msg; // Exibir mensagem do backend que já inclui os limites
    }
    
    // Fallback: exibir a mensagem do backend se não for genérica
    if (!/^erro\s?\d+/i.test(msg) && msg.length > 0) {
        return msg;
    }
    
    return 'Não foi possível atualizar a quantidade. Tente novamente.';
}

// Alterar quantidade de um item
async function alterarQuantidade(index, delta) {
    if (index < 0 || index >= state.itens.length) return;

    const item = state.itens[index];
    const novaQtd = item.quantidade + delta;

    // Validar nova quantidade
    if (novaQtd < 1) {
        await removerItem(index);
        return;
    }
    
    if (novaQtd > VALIDATION_LIMITS.MAX_QUANTITY_PER_ITEM) {
        showToast(`Quantidade máxima permitida: ${VALIDATION_LIMITS.MAX_QUANTITY_PER_ITEM}`, {
            type: 'warning',
            title: 'Quantidade Inválida',
            autoClose: 3000
        });
        return;
    }

    try {
        const result = await updateCartItem(item.cartItemId, { quantity: novaQtd });
        if (result.success) {
            // Recarregar cesta da API para garantir sincronização
            await carregarCesta();
        } else {
            // Extrair mensagem de erro do resultado
            const errorMessage = result.error || 'Erro ao atualizar quantidade';
            const friendlyMessage = getFriendlyUpdateError(errorMessage);
            
            showToast(friendlyMessage, {
                type: 'error',
                title: 'Erro ao atualizar quantidade',
                autoClose: 5000 // Aumentar tempo para mensagens detalhadas de estoque
            });
        }
    } catch (err) {
        // Log do erro para debug
        console.error('[CESTA] Erro ao alterar quantidade:', err);
        
        // Extrair mensagem de erro
        const errorMessage = err?.message || err?.error || 'Erro desconhecido';
        const friendlyMessage = getFriendlyUpdateError(errorMessage);
        
        showToast(friendlyMessage, {
            type: 'error',
            title: 'Erro ao atualizar quantidade',
            autoClose: 5000
        });
    }
}

// Remover item da cesta
async function removerItem(index) {
    if (index < 0 || index >= state.itens.length) return;

    const item = state.itens[index];
    
    try {
        const result = await removeCartItem(item.cartItemId);
        if (result.success) {
            // Recarregar cesta da API para garantir sincronização
            await carregarCesta();
        } else {
            showToast('Erro ao remover item. Tente novamente.', {
                type: 'error',
                title: 'Erro',
                autoClose: 3000
            });
        }
    } catch (err) {
        // Log apenas em desenvolvimento - erro já é exibido ao usuário
        const isDev = typeof process !== 'undefined' && process.env?.NODE_ENV === 'development';
        if (isDev) {
            console.error('Erro ao remover item:', err.message);
        }
        showToast('Erro ao remover item. Tente novamente.', {
            type: 'error',
            title: 'Erro',
            autoClose: 3000
        });
    }
}

// Limpar toda a cesta
async function limparCesta() {
    if (state.itens.length === 0) return;

    const confirmar = await showConfirm({
        title: 'Limpar Cesta',
        message: 'Deseja limpar toda a cesta?',
        confirmText: 'Sim, limpar',
        cancelText: 'Cancelar',
        type: 'warning'
    });

    if (!confirmar) return;

    try {
        const result = await clearCart();
        if (result.success) {
            // Recarregar cesta da API para garantir sincronização
            await carregarCesta();
            showToast('Cesta limpa com sucesso!', {
                type: 'success',
                title: 'Cesta Limpa',
                autoClose: 2000
            });
        } else {
            showToast('Erro ao limpar cesta. Tente novamente.', {
                type: 'error',
                title: 'Erro',
                autoClose: 3000
            });
        }
    } catch (err) {
        // Log apenas em desenvolvimento - erro já é exibido ao usuário
        const isDev = typeof process !== 'undefined' && process.env?.NODE_ENV === 'development';
        if (isDev) {
            console.error('Erro ao limpar cesta:', err.message);
        }
        showToast('Erro ao limpar cesta. Tente novamente.', {
            type: 'error',
            title: 'Erro',
            autoClose: 3000
        });
    }
}

// Editar item (volta para página do produto)
function editarItem(index) {
    if (index < 0 || index >= state.itens.length) return;

    const item = state.itens[index];
    // Redirecionar para página do produto com índice de edição
    const cartItemId = item.cartItemId || item.id;
    window.location.href = `src/pages/produto.html?id=${item.id}&editIndex=${index}&cartItemId=${cartItemId}`;
}

// Anexar eventos aos itens
function attachItemHandlers() {
    // Botões de quantidade
    document.querySelectorAll('.btn-qtd-menos-modal').forEach(btn => {
        btn.addEventListener('click', () => {
            const index = parseInt(btn.getAttribute('data-index'));
            alterarQuantidade(index, -1);
        });
    });

    document.querySelectorAll('.btn-qtd-mais-modal').forEach(btn => {
        btn.addEventListener('click', () => {
            const index = parseInt(btn.getAttribute('data-index'));
            alterarQuantidade(index, 1);
        });
    });

    // Botões de remover
    document.querySelectorAll('.btn-remover-item').forEach(btn => {
        btn.addEventListener('click', () => {
            const index = parseInt(btn.getAttribute('data-index'));
            removerItem(index);
        });
    });

    // Botões de editar
    document.querySelectorAll('.btn-editar-item').forEach(btn => {
        btn.addEventListener('click', () => {
            const index = parseInt(btn.getAttribute('data-index'));
            editarItem(index);
        });
    });
}

// Inicializar elementos DOM
function initElements() {
    el.modal = document.getElementById('modal-cesta');
    el.cestaVazia = document.getElementById('cesta-vazia-modal');
    el.itemsContainer = document.getElementById('cesta-items-container');
    el.resumoContainer = document.getElementById('cesta-resumo-container');
    el.listaItens = document.getElementById('lista-itens-modal');
    el.subtotal = document.getElementById('modal-subtotal');
    el.taxaEntrega = document.getElementById('modal-taxa-entrega');
    el.descontos = document.getElementById('modal-descontos');
    el.total = document.getElementById('modal-total');
    el.footerTotal = document.getElementById('modal-footer-total');
    el.pontos = document.getElementById('modal-pontos');
    el.btnLimpar = document.getElementById('btn-limpar-cesta');
    el.btnContinuar = document.getElementById('btn-continuar-modal');
    el.headerCesta = document.getElementById('cesta');
    el.headerPreco = document.getElementById('preco');
    el.headerItens = document.getElementById('itens');
    el.btnCestaFlutuante = document.getElementById('btn-cesta-flutuante');
    el.cestaBadgeCount = document.getElementById('cesta-badge-count');
    el.cestaValorFlutuante = document.getElementById('cesta-valor-flutuante');
    
}

// Anexar eventos globais
function attachGlobalHandlers() {
    // Botão limpar
    if (el.btnLimpar) {
        el.btnLimpar.addEventListener('click', limparCesta);
    }

    // Botão continuar (ir para página de pagamento)
    if (el.btnContinuar) {
        el.btnContinuar.addEventListener('click', () => {
            if (state.itens.length === 0) {
                showError('Sua cesta está vazia!');
                return;
            }
            
            // Verificar se o usuário está logado
            if (typeof window.isUserLoggedIn === 'function' && window.isUserLoggedIn()) {
                // Usuário logado, pode prosseguir para pagamento
                window.location.href = 'src/pages/pagamento.html';
            } else {
                // Usuário não logado, redirecionar para login
                showConfirm({
                    title: 'Login Necessário',
                    message: 'Para finalizar seu pedido, você precisa estar logado. Deseja fazer login agora?',
                    confirmText: 'Sim, fazer login',
                    cancelText: 'Cancelar',
                    type: 'warning'
                }).then((confirmLogin) => {
                    if (confirmLogin) {
                        // Salvar a cesta atual para restaurar após login
                        localStorage.setItem('royal_cesta_backup', JSON.stringify(state.itens));
                        // Redirecionar para login
                        window.location.href = 'src/pages/login.html';
                    }
                });
            }
        });
    }

    // Clique no ícone da cesta no header abre a modal
    if (el.headerCesta) {
        el.headerCesta.addEventListener('click', () => {
            carregarCesta();
            renderCesta();
            if (window.abrirModal) {
                window.abrirModal('modal-cesta');
            }
        });
    }

    // Clique no botão flutuante da cesta
    if (el.btnCestaFlutuante) {
        el.btnCestaFlutuante.addEventListener('click', () => {
            carregarCesta();
            renderCesta();
            if (window.abrirModal) {
                window.abrirModal('modal-cesta');
            }
        });
    }

    // Atualizar cesta quando modal é aberta
    if (el.modal) {
        // Observer para detectar quando a modal é exibida
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.attributeName === 'style') {
                    const display = window.getComputedStyle(el.modal).display;
                    if (display !== 'none') {
                        // Renderizar com dados já carregados
                        // (o carregamento é feito nos handlers de click)
                        renderCesta();
                    }
                }
            });
        });

        observer.observe(el.modal, { attributes: true });
    }
}

// Função exposta globalmente para atualizar a cesta após adicionar item
window.atualizarCesta = async function() {
    await carregarCesta();
    renderCesta();
};

// Inicializar
document.addEventListener('DOMContentLoaded', async () => {
    initElements();
    
    // Carregar taxa de entrega das configurações públicas
    if (settingsHelper && typeof settingsHelper.getDeliveryFee === 'function') {
        try {
            state.taxaEntrega = await settingsHelper.getDeliveryFee();
        } catch (error) {
            console.warn('Usando taxa de entrega padrão:', error.message);
        }
    }
    
    // Carregar cache de ingredientes
    await loadIngredientsCache();
    
    await carregarCesta();
    
    // Verificar se há backup da cesta para restaurar após login
    const backupRestaurado = await verificarBackupCesta();
    
    attachGlobalHandlers();

    // Verificar se deve abrir a modal automaticamente (após adicionar produto)
    const abrirModal = localStorage.getItem('royal_abrir_modal_cesta');
    
    if (abrirModal === 'true') {
        // Remover flag
        localStorage.removeItem('royal_abrir_modal_cesta');
        
        // Mostrar mensagem de sucesso
        showToast('Item adicionado à cesta com sucesso!', {
            type: 'success',
            title: 'Item Adicionado',
            autoClose: 3000
        });
        
        // Recarregar cesta antes de abrir a modal para pegar item recém-adicionado
        setTimeout(async () => {
            await carregarCesta();
            if (window.abrirModal && el.modal) {
                window.abrirModal('modal-cesta');
            }
        }, 300);
    } else if (backupRestaurado) {
        // Se restaurou backup, abrir modal da cesta automaticamente
        setTimeout(() => {
            if (window.abrirModal && el.modal) {
                window.abrirModal('modal-cesta');
            }
        }, 500);
    }
});

// Exportar funções para uso em outros módulos
export { carregarCesta, renderCesta, atualizarHeaderCesta, atualizarBotaoFlutuante };
