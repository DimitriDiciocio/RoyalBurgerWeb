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
        ingredientes: []
    };

    // DOM refs (existentes na página)
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
        obsInput: document.querySelector('.observacao input'),
        obsLimite: document.querySelector('.observacao .limite')
    };

    // Utils
    const formatBRL = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

/**
 * Constrói URL correta para imagem do produto com cache inteligente
 */
function buildImageUrl(imagePath, imageHash = null) {
    if (!imagePath) return '../assets/img/tudo.jpeg';
    
    // Se já é uma URL completa, usar diretamente
    if (imagePath.startsWith('http')) {
        return imagePath;
    }
    
    // URL base dinâmica baseada na origem atual
    const currentOrigin = window.location.origin;
    let baseUrl;
    
    // Se estamos em localhost, usar localhost:5000
    if (currentOrigin.includes('localhost') || currentOrigin.includes('127.0.0.1')) {
        baseUrl = 'http://localhost:5000';
    } else {
        // Para outros ambientes, usar a mesma origem mas porta 5000
        const hostname = window.location.hostname;
        baseUrl = `http://${hostname}:5000`;
    }
    
    // Usa hash da imagem se disponível, senão usa timestamp
    const cacheParam = imageHash || new Date().getTime();
    
    // Se é um caminho do backend (/api/uploads/products/ID.jpeg)
    if (imagePath.startsWith('/api/uploads/products/')) {
        return `${baseUrl}${imagePath}?v=${cacheParam}`;
    }
    
    // Se é um caminho antigo (/uploads/products/ID.jpeg)
    if (imagePath.startsWith('/uploads/products/')) {
        return `${baseUrl}${imagePath.replace('/uploads/', '/api/uploads/')}?v=${cacheParam}`;
    }
    
    // Se é apenas o nome do arquivo (ID.jpeg, ID.jpg, etc.)
    if (imagePath.match(/^\d+\.(jpg|jpeg|png|gif|webp)$/i)) {
        return `${baseUrl}/api/uploads/products/${imagePath}?v=${cacheParam}`;
    }
    
    // Fallback: assumir que é um caminho relativo
    return `${baseUrl}/api/uploads/products/${imagePath}?v=${cacheParam}`;
}

    function getIdFromUrl() {
        const params = new URLSearchParams(window.location.search);
        const id = params.get('id');
        return id && !isNaN(id) ? parseInt(id) : null;
    }

    function updateTitle() {
        if (state.product?.name) {
            document.title = `${state.product.name} - Royal Burguer`;
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

        // imagem
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
            // Buscar o elemento do ingrediente para obter as porções
            const itemEl = el.listaExtrasContainer.querySelector(`[data-ingrediente-id="${extra.id}"]`);
            const portions = parseFloat(itemEl?.getAttribute('data-porcoes') || 1);
            // Calcular preço considerando as porções
            return sum + (extra.price * extra.quantity * portions);
        }, 0);
        const unitTotal = state.basePrice + extrasTotal;
        const total = unitTotal * state.quantity;
        if (el.precoQuadro) el.precoQuadro.textContent = formatBRL(total);
        if (el.qtdTexto) el.qtdTexto.textContent = String(state.quantity).padStart(2, '0');
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
        // aplica classe 'dessativo' no ícone de menos quando quantidade = 1
        if (!el.qtdMenos) return;
        if (state.quantity <= 1) {
            el.qtdMenos.classList.add('dessativo');
        } else {
            el.qtdMenos.classList.remove('dessativo');
        }
    }

    function renderExtrasList() {
        if (!el.listaExtrasContainer) return;

        const ingredientes = state.ingredientes;
        if (!ingredientes || ingredientes.length === 0) {
            el.listaExtrasContainer.innerHTML = '<p class="sem-ingredientes">Nenhum ingrediente disponível</p>';
            return;
        }

        const toBRL = (v) => `+ ${formatBRL(parseFloat(v) || 0)}`;

        el.listaExtrasContainer.innerHTML = ingredientes.map((ing) => {
            const ingId = ing.ingredient_id || ing.id;
            const ingName = ing.name || ing.ingredient_name || 'Ingrediente';
            // Usar preço adicional em vez do preço unitário
            const ingPrice = parseFloat(ing.additional_price || ing.price || 0) || 0;
            const portions = parseFloat(ing.portions || 1) || 1;
            const currentQty = state.extrasById.get(ingId)?.quantity || 0;
            
            // Debug: verificar os dados recebidos
            console.log('Ingrediente:', ingName, 'Preço adicional:', ing.additional_price, 'Preço unitário:', ing.price, 'Preço final:', ingPrice);
            return `
            <div class="item" data-ingrediente-id="${ingId}" data-preco="${ingPrice}" data-porcoes="${portions}">
              <div class="item-adicional-container">
                <p class="nome-adicional">${ingName}</p>
                <p class="preco-adicional">${toBRL(ingPrice)}</p>
              </div>
              <div class="quantidade">
                <i class="fa-solid fa-minus ${currentQty <= 0 ? 'dessativo' : ''}"></i>
                <p class="qtd-extra"> ${portions} porção${portions > 1 ? 'ões' : ''}</p>
                <i class="fa-solid fa-plus"></i>
              </div>
            </div>`;
        }).join('');

        // Eventos +/− por ingrediente
        el.listaExtrasContainer.querySelectorAll('.item').forEach((itemEl) => {
            const id = parseInt(itemEl.getAttribute('data-ingrediente-id'));
            const price = parseFloat(itemEl.getAttribute('data-preco')) || 0;
            const minus = itemEl.querySelector('.fa-minus');
            const plus = itemEl.querySelector('.fa-plus');
            const qtdEl = itemEl.querySelector('.qtd-extra');

            const ensureExtra = () => {
                if (!state.extrasById.has(id)) {
                    state.extrasById.set(id, { id, name: (itemEl.querySelector('.nome-adicional')?.textContent || 'Ingrediente'), price, quantity: 0 });
                }
                return state.extrasById.get(id);
            };

            minus.addEventListener('click', () => {
                const ex = ensureExtra();
                if (ex.quantity > 0) {
                    ex.quantity -= 1;
                    qtdEl.textContent = String(ex.quantity).padStart(2, '0');
                    if (ex.quantity === 0) minus.classList.add('dessativo');
                    updateTotals();
                }
            });

            plus.addEventListener('click', () => {
                const ex = ensureExtra();
                ex.quantity += 1;
                qtdEl.textContent = String(ex.quantity).padStart(2, '0');
                minus.classList.remove('dessativo');
                updateTotals();
            });
        });
    }

    function attachExtrasButton() {
        if (!el.btnExtras) return;
        el.btnExtras.addEventListener('click', () => {
            document.querySelector('.monte .rolagem')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
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
            // Integração de carrinho não existente no projeto atual.
            // Exibir apenas um feedback simples.
            try {
                // eslint-disable-next-line no-alert
                alert('Item adicionado à cesta (simulação). Integração com carrinho pendente.');
            } catch (_) {}
        });
    }

    async function loadIngredientes(productId) {
        try {
            // Buscar ingredientes do produto
            const resp = await getProductIngredients(productId);
            const productIngredients = Array.isArray(resp) ? resp : (resp?.items || []);
            
            // Buscar dados completos de todos os ingredientes
            const allIngredientsResp = await getIngredients({ page_size: 1000 });
            const allIngredients = Array.isArray(allIngredientsResp) ? allIngredientsResp : (allIngredientsResp?.items || []);
            
            // Combinar dados: ingredientes do produto + dados completos
            const enrichedIngredients = productIngredients.map(productIng => {
                const fullIngredient = allIngredients.find(ing => ing.id === productIng.ingredient_id || ing.id === productIng.id);
                return {
                    ...productIng,
                    ...fullIngredient, // Dados completos do ingrediente
                    ingredient_id: productIng.ingredient_id || productIng.id,
                    id: productIng.ingredient_id || productIng.id
                };
            });
            
            // Debug: verificar estrutura dos dados
            console.log('Ingredientes do produto:', productIngredients);
            console.log('Todos os ingredientes:', allIngredients);
            console.log('Ingredientes enriquecidos:', enrichedIngredients);
            if (enrichedIngredients.length > 0) {
                console.log('Primeiro ingrediente enriquecido:', enrichedIngredients[0]);
                console.log('Campos disponíveis:', Object.keys(enrichedIngredients[0]));
            }
            
            state.ingredientes = enrichedIngredients;
        } catch (e) {
            console.error('Erro ao carregar ingredientes:', e);
            state.ingredientes = [];
        }
    }

    async function loadProduto() {
        state.productId = getIdFromUrl();
        if (!state.productId) return;
        try {
            const [produto] = await Promise.all([
                getProductById(state.productId),
                // carregamento de ingredientes em paralelo (não depende do produto)
                loadIngredientes(state.productId)
            ]);
            state.product = produto;
            updateTitle();
            renderProdutoInfo();
            renderExtrasList();
        } catch (e) {
            // eslint-disable-next-line no-console
            console.error('Erro ao carregar produto:', e);
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

