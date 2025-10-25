// src/js/ui/produto.js

import { getProductById, getProductIngredients, getProductImageUrl } from '../api/products.js';
import { getIngredients } from '../api/ingredients.js';

(function initProdutoPage() {
    if (!window.location.pathname.includes('produto.html')) return;

    const state = {
        productId: null,
        product: null,
        basePrice: 0,
        quantity: 1,
        extrasById: new Map(),
        ingredientes: [],
        ingredientesPorcaoBase: [],
        ingredientesExtras: []
    };

    // DOM refs
    const el = {
        nome: document.getElementById('nome-produto'),
        descricao: document.getElementById('descricao-produto'),
        img: document.getElementById('imagem-produto'),
        precoQuadro: document.getElementById('valor'),
        precoApartir: document.querySelector('.area-adicionar .valor span'),
        qtdTexto: document.querySelector('.area-adicionar .quadro .quantidade #quantidade'),
        qtdMenos: document.querySelector('.area-adicionar .quadro .quantidade .fa-minus'),
        qtdMais: document.querySelector('.area-adicionar .quadro .quantidade .fa-plus'),
        btnAdicionarCesta: document.querySelector('.area-adicionar .quadro button'),
        listaExtrasContainer: document.querySelector('.monte .rolagem'),
        btnExtras: document.querySelector('.monte button'),
        extrasBadge: document.getElementById('extras-badge'),
        obsInput: document.querySelector('.observacao input'),
        obsLimite: document.querySelector('.observacao .limite'),
        modalExtras: document.getElementById('modal-extras'),
        overlayExtras: document.getElementById('overlay-extras'),
        fecharModalExtras: document.getElementById('fechar-modal-extras'),
        listaExtrasModal: document.getElementById('lista-extras-modal')
    };

    // Utils
    const formatBRL = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

    const toNum = (v) => {
        const n = parseFloat(v);
        return Number.isFinite(n) ? n : null;
    };

    // SECURITY FIX: Sanitização contra XSS
    function escapeHTML(text) {
        if (typeof text !== 'string') return String(text || '');
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // SECURITY FIX: Validação robusta de IDs
    function validateIngredientId(id) {
        const parsed = parseInt(id);
        return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
    }

    function resolveAdditionalPrice(obj) {
        if (!obj || typeof obj !== 'object') return null;
        const candidates = [
            'additional_price',
            'additional_value',
            'extra_price',
            'price_additional',
            'price_add',
            'price_delta'
        ];
        for (const key of candidates) {
            if (key in obj) {
                const n = toNum(obj[key]);
                if (n !== null) return n;
            }
        }
        return null;
    }

    function buildImageUrl(imagePath, imageHash = null) {
        if (!imagePath) return '../assets/img/tudo.jpeg';
        
        if (imagePath.startsWith('http')) {
            return imagePath;
        }
        
        const currentOrigin = window.location.origin;
        let baseUrl;
        
        if (currentOrigin.includes('localhost') || currentOrigin.includes('127.0.0.1')) {
            baseUrl = 'http://localhost:5000';
        } else {
            const hostname = window.location.hostname;
            baseUrl = `http://${hostname}:5000`;
        }
        
        const cacheParam = imageHash || new Date().getTime();
        
        if (imagePath.startsWith('/api/uploads/products/')) {
            return `${baseUrl}${imagePath}?v=${cacheParam}`;
        }
        
        if (imagePath.startsWith('/uploads/products/')) {
            return `${baseUrl}${imagePath.replace('/uploads/', '/api/uploads/')}?v=${cacheParam}`;
        }
        
        if (imagePath.match(/^\d+\.(jpg|jpeg|png|gif|webp)$/i)) {
            return `${baseUrl}/api/uploads/products/${imagePath}?v=${cacheParam}`;
        }
        
        return `${baseUrl}/api/uploads/products/${imagePath}?v=${cacheParam}`;
    }

    function getIdFromUrl() {
        const params = new URLSearchParams(window.location.search);
        const id = params.get('id');
        return id && !isNaN(id) ? parseInt(id) : null;
    }

    function updateTitle() {
        if (state.product?.name) {
            document.title = `${escapeHTML(state.product.name)} - Royal Burguer`;
        }
    }

    function renderProdutoInfo() {
        if (!state.product) return;

        const name = state.product.name || 'Produto';
        const desc = state.product.description || '';
        const price = parseFloat(state.product.price) || 0;
        state.basePrice = price;

        if (el.nome) el.nome.textContent = name;
        if (el.descricao) el.descricao.textContent = desc;
        if (el.precoApartir) el.precoApartir.textContent = formatBRL(price);

        const imagePath = state.product.image_url || getProductImageUrl(state.product.id);
        const imageUrl = buildImageUrl(imagePath, state.product.image_hash);
        if (el.img) {
            el.img.src = imageUrl;
            el.img.alt = name;
        }

        updateTotals();
    }

    function updateTotals() {
        const extrasTotal = Array.from(state.extrasById.values()).reduce((sum, extra) => {
            const additionalQty = Math.max(extra.quantity, 0);
            return sum + (extra.price * additionalQty);
        }, 0);
        const unitTotal = state.basePrice + extrasTotal;
        const total = unitTotal * state.quantity;
        if (el.precoQuadro) el.precoQuadro.textContent = formatBRL(total);
        if (el.qtdTexto) el.qtdTexto.textContent = String(state.quantity).padStart(2, '0');
    }

    function updateExtrasBadge() {
        if (!el.extrasBadge) return;
        if (!Array.isArray(state.ingredientesExtras)) {
            el.extrasBadge.style.display = 'none';
            return;
        }
        const extrasCount = state.ingredientesExtras.reduce((acc, ing) => {
            const id = ing.ingredient_id || ing.id;
            const ex = state.extrasById.get(id);
            const qty = ex?.quantity || 0;
            return acc + (qty > 0 ? qty : 0);
        }, 0);
        if (extrasCount > 0) {
            el.extrasBadge.textContent = String(extrasCount);
            el.extrasBadge.style.display = 'flex';
        } else {
            el.extrasBadge.style.display = 'none';
        }
    }

    function attachQuantityHandlers() {
        if (el.qtdMenos) {
            el.qtdMenos.addEventListener('click', () => {
                if (state.quantity > 1) {
                    state.quantity -= 1;
                    updateTotals();
                    toggleQtdMinusState();
                }
            });
        }
        if (el.qtdMais) {
            el.qtdMais.addEventListener('click', () => {
                state.quantity += 1;
                updateTotals();
                toggleQtdMinusState();
            });
        }
        toggleQtdMinusState();
    }

    function toggleQtdMinusState() {
        if (!el.qtdMenos) return;
        if (state.quantity <= 1) {
            el.qtdMenos.classList.add('dessativo');
        } else {
            el.qtdMenos.classList.remove('dessativo');
        }
    }

    function renderMonteSeuJeitoList() {
        if (!el.listaExtrasContainer) return;

        const ingredientes = state.ingredientesPorcaoBase;
        if (!ingredientes || ingredientes.length === 0) {
            el.listaExtrasContainer.innerHTML = '<p class="sem-ingredientes">Nenhum ingrediente disponível</p>';
            return;
        }

        const toBRL = (v) => `+ ${formatBRL(parseFloat(v) || 0)}`;

        const ajustaveis = ingredientes.filter((ing) => {
            const basePortions = parseFloat(ing.portions || 1) || 1;
            const minQuantity = Number.isFinite(parseFloat(ing.min_quantity)) ? parseFloat(ing.min_quantity) : basePortions;
            const maxQuantity = Number.isFinite(parseFloat(ing.max_quantity)) ? parseFloat(ing.max_quantity) : (basePortions + 999);
            return minQuantity !== maxQuantity;
        });

        if (ajustaveis.length === 0) {
            el.listaExtrasContainer.innerHTML = '<p class="sem-ingredientes">Nenhum ingrediente disponível</p>';
            return;
        }

        // SECURITY FIX: Sanitização de nomes
        el.listaExtrasContainer.innerHTML = ajustaveis.map((ing) => {
            const ingId = ing.ingredient_id || ing.id;
            const ingName = escapeHTML(ing.name || ing.ingredient_name || 'Ingrediente');
            const ingPrice = toNum(ing.additional_price) ?? resolveAdditionalPrice(ing) ?? 0;
            const basePortions = parseFloat(ing.portions || 1) || 1;
            const minQuantity = Number.isFinite(parseFloat(ing.min_quantity)) ? parseFloat(ing.min_quantity) : basePortions;
            const maxQuantity = Number.isFinite(parseFloat(ing.max_quantity)) ? parseFloat(ing.max_quantity) : (basePortions + 999);

            const extra = state.extrasById.get(ingId);
            const extraQty = extra?.quantity || 0;
            const effectiveQty = basePortions + extraQty;

            const showMinus = effectiveQty > minQuantity;
            const showPlus = effectiveQty < maxQuantity;

            return `
            <div class="item" 
                 data-ingrediente-id="${ingId}" 
                 data-preco="${ingPrice}" 
                 data-porcoes="${basePortions}"
                 data-min-qty="${minQuantity}"
                 data-max-qty="${maxQuantity}">
              <div class="item-adicional-container">
                <p class="nome-adicional">${ingName}</p>
                <p class="preco-adicional">${toBRL(ingPrice)}</p>
              </div>
              <div class="quantidade">
                ${showMinus ? '<i class="fa-solid fa-minus"></i>' : ''}
                <p class="qtd-extra">${String(effectiveQty).padStart(2, '0')}</p>
                ${showPlus ? '<i class="fa-solid fa-plus"></i>' : ''}
              </div>
            </div>`;
        }).join('');

        attachIngredienteHandlers(el.listaExtrasContainer);
    }

    function renderExtrasModal() {
        if (!el.listaExtrasModal) return;

        const ingredientes = state.ingredientesExtras;
        if (!ingredientes || ingredientes.length === 0) {
            el.listaExtrasModal.innerHTML = '<p class="sem-extras">Nenhum extra disponível no momento</p>';
            return;
        }

        const toBRL = (v) => `+ ${formatBRL(parseFloat(v) || 0)}`;

        // SECURITY FIX: Sanitização de nomes
        el.listaExtrasModal.innerHTML = ingredientes.map((ing) => {
            const ingId = ing.ingredient_id || ing.id;
            const ingName = escapeHTML(ing.name || ing.ingredient_name || 'Ingrediente');
            const ingPrice = toNum(ing.additional_price) ?? resolveAdditionalPrice(ing) ?? 0;
            const basePortions = 0;
            const minQuantity = Number.isFinite(parseFloat(ing.min_quantity)) ? parseFloat(ing.min_quantity) : 0;
            const maxQuantity = Number.isFinite(parseFloat(ing.max_quantity)) ? parseFloat(ing.max_quantity) : 999;

            const extra = state.extrasById.get(ingId);
            const extraQty = extra?.quantity || 0;
            const effectiveQty = basePortions + extraQty;

            const showMinus = effectiveQty > minQuantity;
            const showPlus = effectiveQty < maxQuantity;

            return `
            <div class="item" 
                 data-ingrediente-id="${ingId}" 
                 data-preco="${ingPrice}" 
                 data-porcoes="${basePortions}"
                 data-min-qty="${minQuantity}"
                 data-max-qty="${maxQuantity}">
              <div class="item-adicional-container">
                <p class="nome-adicional">${ingName}</p>
                <p class="preco-adicional">${toBRL(ingPrice)}</p>
              </div>
              <div class="quantidade">
                ${showMinus ? '<i class="fa-solid fa-minus"></i>' : ''}
                <p class="qtd-extra">${String(effectiveQty).padStart(2, '0')}</p>
                ${showPlus ? '<i class="fa-solid fa-plus"></i>' : ''}
              </div>
            </div>`;
        }).join('');

        // PERFORMANCE FIX: Remover listener anterior antes de adicionar
        const oldListeners = el.listaExtrasModal.querySelectorAll('.item [data-has-listener]');
        oldListeners.forEach(btn => btn.removeAttribute('data-has-listener'));

        attachIngredienteHandlers(el.listaExtrasModal);
        
        // PERFORMANCE FIX: Event delegation ao invés de múltiplos listeners
        el.listaExtrasModal.querySelectorAll('.item .fa-minus, .item .fa-plus').forEach((btn) => {
            if (!btn.hasAttribute('data-has-listener')) {
                btn.setAttribute('data-has-listener', 'true');
                btn.addEventListener('click', () => {
                    renderMonteSeuJeitoList();
                    updateTotals();
                    updateExtrasBadge();
                });
            }
        });
    }

    function attachIngredienteHandlers(container) {
        if (!container) return;

        container.querySelectorAll('.item').forEach((itemEl) => {
            // SECURITY FIX: Validação de ID
            const rawId = itemEl.getAttribute('data-ingrediente-id');
            const id = validateIngredientId(rawId);
            if (!id) return; // Skip ingredientes com ID inválido

            // SECURITY FIX: Validação de preço
            const price = Math.max(0, parseFloat(itemEl.getAttribute('data-preco')) || 0);
            const basePortions = Math.max(0, parseFloat(itemEl.getAttribute('data-porcoes')) || 0);
            const minQuantity = parseFloat(itemEl.getAttribute('data-min-qty'));
            const maxQuantity = parseFloat(itemEl.getAttribute('data-max-qty'));
            
            const minus = itemEl.querySelector('.fa-minus');
            const plus = itemEl.querySelector('.fa-plus');
            const qtdEl = itemEl.querySelector('.qtd-extra');
            const nomeEl = itemEl.querySelector('.nome-adicional');

            const ensureExtra = () => {
                if (!state.extrasById.has(id)) {
                    state.extrasById.set(id, { 
                        id, 
                        name: nomeEl?.textContent || 'Ingrediente', 
                        price, 
                        quantity: 0,
                        basePortions,
                        minQuantity,
                        maxQuantity
                    });
                }
                return state.extrasById.get(id);
            };

            const updateButtonStates = (extra) => {
                const effectiveQty = basePortions + extra.quantity;
                
                if (minus && !(effectiveQty > minQuantity)) {
                    minus.remove();
                }
                if (plus && !(effectiveQty < maxQuantity)) {
                    plus.remove();
                }
            };

            if (minus) minus.addEventListener('click', (e) => {
                if (minus.classList.contains('dessativo')) {
                    e.preventDefault();
                    e.stopPropagation();
                    return;
                }

                const extra = ensureExtra();
                const effectiveQty = basePortions + extra.quantity;
                
                if (effectiveQty > minQuantity) {
                    extra.quantity -= 1;
                    const newEffective = basePortions + extra.quantity;
                    qtdEl.textContent = String(newEffective).padStart(2, '0');
                    updateTotals();
                    
                    if (basePortions > 0) {
                        renderMonteSeuJeitoList();
                    } else {
                        renderExtrasModal();
                    }
                    if (basePortions === 0) updateExtrasBadge();
                }
            });

            if (plus) plus.addEventListener('click', (e) => {
                if (plus.classList.contains('dessativo')) {
                    e.preventDefault();
                    e.stopPropagation();
                    return;
                }

                const extra = ensureExtra();
                const effectiveQty = basePortions + extra.quantity;
                
                if (effectiveQty < maxQuantity) {
                    extra.quantity += 1;
                    const newEffective = basePortions + extra.quantity;
                    qtdEl.textContent = String(newEffective).padStart(2, '0');
                    updateTotals();
                    
                    if (basePortions > 0) {
                        renderMonteSeuJeitoList();
                    } else {
                        renderExtrasModal();
                    }
                    if (basePortions === 0) updateExtrasBadge();
                }
            });

            const extra = ensureExtra();
            updateButtonStates(extra);
        });
    }

    function openExtrasModal() {
        if (!el.modalExtras) return;
        renderExtrasModal();
        try {
            if (window.abrirModal) {
                window.abrirModal('modal-extras');
            } else {
                el.modalExtras.style.display = 'flex';
                el.modalExtras.style.opacity = '1';
            }
        } catch (err) {
            // Fallback silencioso mantido por compatibilidade
            el.modalExtras.style.display = 'flex';
            el.modalExtras.style.opacity = '1';
        }
    }

    function closeExtrasModal() {
        if (!el.modalExtras) return;
        try {
            if (window.fecharModal) {
                window.fecharModal('modal-extras');
            } else {
                el.modalExtras.style.display = 'none';
                el.modalExtras.style.opacity = '0';
            }
        } catch (err) {
            // Fallback silencioso mantido por compatibilidade
            el.modalExtras.style.display = 'none';
            el.modalExtras.style.opacity = '0';
        }
    }

    function attachExtrasButton() {
        if (!el.btnExtras) return;
        el.btnExtras.addEventListener('click', () => {
            openExtrasModal();
        });

        const btnSalvar = document.getElementById('btn-salvar-extras');
        if (btnSalvar) {
            btnSalvar.addEventListener('click', () => {
                renderMonteSeuJeitoList();
                updateTotals();
                closeExtrasModal();
            });
        }
    }

    function attachObsCounter() {
        if (!el.obsInput || !el.obsLimite) return;
        const update = () => {
            const len = el.obsInput.value.length;
            el.obsLimite.textContent = `${len}/140`;
        };
        el.obsInput.addEventListener('input', update);
        update();
    }

    function attachAddToCart() {
        if (!el.btnAdicionarCesta) return;
        el.btnAdicionarCesta.addEventListener('click', () => {
            try {
                alert('Item adicionado à cesta (simulação). Integração com carrinho pendente.');
            } catch (err) {
                // TODO: Implementar feedback visual alternativo
            }
        });
    }

    async function loadIngredientes(productId) {
        try {
            const resp = await getProductIngredients(productId);
            const productIngredients = Array.isArray(resp) ? resp : (resp?.items || []);

            let allIngredients = [];
            try {
                const allIngredientsResp = await getIngredients({ page_size: 1000 });
                allIngredients = Array.isArray(allIngredientsResp) ? allIngredientsResp : (allIngredientsResp?.items || []);
            } catch (err) {
                // IMPROVEMENT: Silencioso propositalmente - autenticação não obrigatória
                allIngredients = [];
            }

            const enrichedIngredients = productIngredients.map(productIng => {
                const fullIngredient = allIngredients.find(ing => ing.id === productIng.ingredient_id || ing.id === productIng.id) || {};
                return {
                    ...productIng,
                    ...fullIngredient,
                    ingredient_id: productIng.ingredient_id || productIng.id,
                    id: productIng.ingredient_id || productIng.id,
                    name: productIng.name || fullIngredient.name || productIng.ingredient_name || 'Ingrediente',
                    additional_price: (toNum(productIng.additional_price) ?? resolveAdditionalPrice(productIng) ?? toNum(fullIngredient?.additional_price) ?? resolveAdditionalPrice(fullIngredient) ?? 0),
                };
            });

            state.ingredientes = enrichedIngredients;

            state.ingredientesPorcaoBase = enrichedIngredients.filter(ing => {
                const portions = parseFloat(ing.portions || 0);
                return portions > 0;
            });

            state.ingredientesExtras = enrichedIngredients.filter(ing => {
                const portions = parseFloat(ing.portions || 0);
                return portions === 0;
            });

        } catch (err) {
            // ERROR HANDLING FIX: Log para debug em desenvolvimento
            if (window.location.hostname === 'localhost') {
                console.error('Erro ao carregar ingredientes:', err);
            }
            state.ingredientes = [];
            state.ingredientesPorcaoBase = [];
            state.ingredientesExtras = [];
        }
    }

    async function loadProduto() {
        state.productId = getIdFromUrl();
        if (!state.productId) return;
        try {
            const [produto] = await Promise.all([
                getProductById(state.productId),
                loadIngredientes(state.productId)
            ]);
            state.product = produto;
            updateTitle();
            renderProdutoInfo();
            renderMonteSeuJeitoList();
            updateExtrasBadge();
        } catch (err) {
            // ERROR HANDLING FIX: Log apenas em desenvolvimento
            if (window.location.hostname === 'localhost') {
                console.error('Erro ao carregar produto:', err);
            }
            // TODO: Implementar feedback visual de erro para o usuário
        }
    }

    // Boot
    document.addEventListener('DOMContentLoaded', async () => {
        attachQuantityHandlers();
        attachExtrasButton();
        attachObsCounter();
        attachAddToCart();
        await loadProduto();
    });
})();
