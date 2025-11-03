/**
 * Home.js - Gerenciamento da exibição de produtos na página inicial
 * Carrega produtos e categorias da API e exibe dinamicamente na home
 */

// Importar helper de configurações públicas
// Importação estática garante que o módulo esteja disponível quando necessário
import * as settingsHelper from '../utils/settings-helper.js';
import { API_BASE_URL } from '../api/api.js';

// Cache para produtos e categorias com TTL
let productsCache = null;
let categoriesCache = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos
let cacheTimestamp = 0;

// Cache para configurações de entrega
let deliveryFeeCache = 'R$ 5,00'; // Valor padrão (fallback)

// Cache para prazos de entrega (evita múltiplas chamadas à API)
let estimatedTimesCache = null;

// Constantes para validação e limites
const VALIDATION_LIMITS = {
  MAX_PRODUCTS: 1000,
  MAX_CATEGORIES: 100,
  MAX_NAME_LENGTH: 200,
  MAX_DESCRIPTION_LENGTH: 500
};

/**
 * Limpa o cache de produtos (útil quando produtos são atualizados)
 */
function clearProductsCache() {
    productsCache = null;
    categoriesCache = null;
    cacheTimestamp = 0;
}

/**
 * Verifica se o cache ainda é válido
 */
function isCacheValid() {
    return productsCache && categoriesCache && (Date.now() - cacheTimestamp) < CACHE_TTL;
}

/**
 * Carrega todos os produtos da API
 */
async function loadProducts() {
    try {
        // Verificar cache válido
        if (isCacheValid()) {
            return productsCache;
        }
        
        const response = await getProducts({ 
            page_size: VALIDATION_LIMITS.MAX_PRODUCTS, 
            include_inactive: false 
        });
        
        // Filtrar apenas produtos ativos (dupla verificação)
        const allProducts = response?.items || [];
        const activeProducts = allProducts.filter(product => {
            // Verificar se o produto está ativo (is_active deve ser true ou undefined/null)
            const isActive = product.is_active !== false && product.is_active !== 0 && product.is_active !== 'false';
            return isActive;
        });
        
        // Atualizar cache com timestamp
        productsCache = activeProducts;
        cacheTimestamp = Date.now();
        
        return productsCache;
    } catch (error) {
        // TODO: Implementar logging estruturado em produção
        console.error('Erro ao carregar produtos:', error.message);
        
        // Retornar cache anterior se disponível, senão array vazio
        return productsCache || [];
    }
}

/**
 * Carrega todas as categorias da API
 */
async function loadCategories() {
    try {
        // Verificar cache válido
        if (isCacheValid()) {
            return categoriesCache;
        }
        
        const response = await getCategories({ page_size: VALIDATION_LIMITS.MAX_CATEGORIES });
        const categories = response?.items || [];
        
        // Atualizar cache com timestamp
        categoriesCache = categories;
        cacheTimestamp = Date.now();
        
        return categoriesCache;
    } catch (error) {
        // TODO: Implementar logging estruturado em produção
        console.error('Erro ao carregar categorias:', error.message);
        
        // Retornar cache anterior se disponível, senão array vazio
        return categoriesCache || [];
    }
}

/**
 * Carrega taxa de entrega das configurações públicas
 */
async function loadDeliveryFee() {
    try {
        // Tentar carregar do helper se disponível
        if (settingsHelper && typeof settingsHelper.formatDeliveryFee === 'function') {
            const formatted = await settingsHelper.formatDeliveryFee();
            deliveryFeeCache = formatted;
        }
    } catch (error) {
        // Manter fallback padrão
        console.warn('Usando taxa de entrega padrão:', error.message);
    }
}

/**
 * Carrega prazos de entrega estimados das configurações públicas
 */
async function loadEstimatedTimes() {
    try {
        if (settingsHelper && typeof settingsHelper.getEstimatedDeliveryTimes === 'function') {
            estimatedTimesCache = await settingsHelper.getEstimatedDeliveryTimes();
        }
        
        // Se não conseguiu carregar, usar valores padrão
        if (!estimatedTimesCache) {
            estimatedTimesCache = {
                initiation_minutes: 5,
                preparation_minutes: 20,
                dispatch_minutes: 5,
                delivery_minutes: 15
            };
        }
    } catch (error) {
        // Fallback para valores padrão
        estimatedTimesCache = {
            initiation_minutes: 5,
            preparation_minutes: 20,
            dispatch_minutes: 5,
            delivery_minutes: 15
        };
    }
}

/**
 * Calcula tempo estimado de entrega baseado nos prazos do sistema
 * Conforme o guia completo: considera todos os prazos para delivery (padrão na home)
 * @param {string} orderType - Tipo do pedido ('delivery' ou 'pickup'). Padrão: 'delivery'
 * @returns {Object} Objeto com minTime e maxTime em minutos
 */
function calculateEstimatedDeliveryTime(orderType = 'delivery') {
    if (!estimatedTimesCache) {
        // Fallback se não carregou os tempos
        const fallbackTotal = orderType === 'delivery' ? 45 : 30; // Delivery: 5+20+5+15, Pickup: 5+20+5+0
        return {
            minTime: fallbackTotal,
            maxTime: fallbackTotal + 15
        };
    }
    
    // Extrair prazos do cache (com fallbacks)
    const initiation = estimatedTimesCache.initiation_minutes || 5;
    const preparation = estimatedTimesCache.preparation_minutes || 20;
    const dispatch = estimatedTimesCache.dispatch_minutes || 5;
    const delivery = orderType === 'delivery' ? (estimatedTimesCache.delivery_minutes || 15) : 0;
    
    // Calcular tempo total conforme fluxo do pedido
    // Para pedido novo (pending): inclui todos os prazos
    // Delivery: iniciação + preparo + envio + entrega
    // Pickup: iniciação + preparo + envio (sem entrega)
    const totalMinutes = initiation + preparation + dispatch + delivery;
    
    // Tempo mínimo = soma dos prazos
    const minTime = totalMinutes;
    
    // Tempo máximo = soma dos prazos + 15 minutos (margem de segurança)
    const maxTime = totalMinutes + 15;
    
    return { minTime, maxTime };
}


// Cache local para evitar recarregamento desnecessário de imagens
const imageCache = new Map();

/**
 * Constrói URL correta para imagem do produto com cache inteligente
 */
function buildImageUrl(imagePath, imageHash = null) {
    if (!imagePath) return 'src/assets/img/tudo.jpeg';
    
    // Se já é uma URL completa, usar diretamente
    if (imagePath.startsWith('http')) {
        return imagePath;
    }
    
    // CORREÇÃO: Usar API_BASE_URL do api.js para garantir funcionamento em qualquer servidor
    // Isso evita erros quando o código é colocado em outros servidores
    const baseUrl = API_BASE_URL;
    
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

/**
 * Verifica se a imagem mudou e atualiza apenas se necessário
 */
function updateImageIfChanged(imgElement, newImagePath, newImageHash) {
    if (!imgElement || !newImagePath) return;
    
    const currentSrc = imgElement.src;
    const newSrc = buildImageUrl(newImagePath, newImageHash);
    
    // Se a URL mudou, atualiza a imagem
    if (currentSrc !== newSrc) {
        // Verifica se a imagem já está carregada para evitar piscar
        const tempImg = new Image();
        tempImg.onload = () => {
            imgElement.src = newSrc;
            imgElement.alt = imgElement.alt || 'Produto';
        };
        tempImg.src = newSrc;
    }
}

/**
 * Cria o HTML de um produto (mantendo formatação original)
 */
function createProductHTML(product) {
    // Validar dados do produto
    if (!product || !product.id) {
        return '';
    }
    
    const imageUrl = buildImageUrl(product.image_url, product.image_hash);
    const price = product.price ? `R$ ${parseFloat(product.price).toFixed(2).replace('.', ',')}` : 'R$ 0,00';
    
    // Calcular tempo estimado baseado nos prazos do sistema
    // Para cards de produtos na home, usamos 'delivery' como padrão (cenário mais completo)
    // Fórmula: Pending (iniciação + preparo + envio + entrega) = tempo mínimo
    //          Tempo máximo = tempo mínimo + 15 minutos (margem de segurança)
    // Delivery: iniciação(5) + preparo(20) + envio(5) + entrega(15) = 45 min mínimo
    const timeEstimate = calculateEstimatedDeliveryTime('delivery');
    const deliveryTime = `${timeEstimate.minTime} - ${timeEstimate.maxTime} min`;
    
    // Usar taxa de entrega dinâmica (cacheada ao carregar página)
    const deliveryFee = deliveryFeeCache;
    
    // Sanitizar dados para evitar XSS
    const safeName = escapeHTML((product.name || 'Produto').substring(0, VALIDATION_LIMITS.MAX_NAME_LENGTH));
    const safeDescription = escapeHTML((product.description || 'Descrição rápida...').substring(0, VALIDATION_LIMITS.MAX_DESCRIPTION_LENGTH));
    const safeId = String(product.id).replace(/[^0-9]/g, '');
    
    return `
        <a href="src/pages/produto.html?id=${safeId}">
            <div id="ficha-produto">
                <img src="${imageUrl}" alt="${safeName}" id="foto">
                <div class="informa">
                    <div>
                        <p id="nome">${safeName}</p>
                        <p id="descricao">${safeDescription}</p>
                    </div>
                    <div>
                        <p id="preco">${price}</p>
                        <p id="tempo">${deliveryTime} • ${deliveryFee}</p>
                    </div>
                </div>
            </div>
        </a>
    `;
}

/**
 * Sanitiza texto para evitar XSS
 * @param {any} text - Texto a ser sanitizado
 * @returns {string} Texto sanitizado
 */
function escapeHTML(text) {
    if (typeof text !== 'string') return String(text || '');
    
    // Usar DOMPurify se disponível, senão usar método básico
    if (typeof DOMPurify !== 'undefined') {
        return DOMPurify.sanitize(text);
    }
    
    // Método básico de sanitização
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;')
        .replace(/\//g, '&#x2F;');
}


/**
 * Atualiza imagens de produtos existentes de forma inteligente
 */
function updateExistingProductImages(products) {
    // Busca todas as imagens de produtos na página
    const productImages = document.querySelectorAll('#ficha-produto img');
    
    productImages.forEach(img => {
        const productId = img.closest('a')?.href?.match(/id=(\d+)/)?.[1];
        if (productId) {
            const product = products.find(p => p.id == productId);
            if (product) {
                updateImageIfChanged(img, product.image_url, product.image_hash);
            }
        }
    });
}

/**
 * Atualiza as seções de produtos na home (versão simplificada)
 */
async function updateProductSections() {
    try {
        const [products, categories] = await Promise.all([
            loadProducts(),
            loadCategories()
        ]);
        
        // Atualizar seção "Os mais pedidos" com produtos reais
        updateMostOrderedSection(products);
        
        // Atualizar seções de categorias com produtos organizados por categoria
        updateCategorySectionsWithProducts(products, categories);
        
        // Atualizar menu de categorias com categorias reais
        updateCategoryMenu(categories);
        
        // Atualizar imagens existentes de forma inteligente
        updateExistingProductImages(products);
        
    } catch (error) {
        // TODO: Implementar logging estruturado em produção
        console.error('Erro ao atualizar seções de produtos:', error.message);
    }
}

/**
 * Atualiza as seções de categorias com produtos organizados por categoria
 */
function updateCategorySectionsWithProducts(products, categories) {
    const rolagemInfinita = document.querySelector('.rolagem-infinita');
    
    if (!rolagemInfinita) return;
    
    // Limpar conteúdo existente
    rolagemInfinita.innerHTML = '';
    
    // Agrupar produtos por categoria
    const groupedProducts = groupProductsByCategory(products, categories);
    
    // Criar seções para cada categoria que tem produtos
    let categoryIndex = 0;
    categories.forEach(category => {
        const categoryProducts = groupedProducts[category.id] || [];
        
        if (categoryProducts.length > 0) {
            const sectionId = `secao-cat-${categoryIndex + 1}`;
            
            // Criar produtos em pares (duplas) como antes
            let productsHTML = '';
            for (let i = 0; i < categoryProducts.length; i += 2) {
                productsHTML += '<div class="dupla">';
                
                // Primeiro produto do par
                if (categoryProducts[i]) {
                    productsHTML += createProductHTML(categoryProducts[i]);
                }
                
                // Segundo produto do par
                if (categoryProducts[i + 1]) {
                    productsHTML += createProductHTML(categoryProducts[i + 1]);
                }
                
                productsHTML += '</div>';
            }
            
            rolagemInfinita.innerHTML += `
                <div id="${sectionId}" style="display: ${categoryIndex === 0 ? 'block' : 'none'}">
                    ${productsHTML}
                </div>
            `;
            
            categoryIndex++;
        }
    });
}

/**
 * Agrupa produtos por categoria
 */
function groupProductsByCategory(products, categories) {
    const grouped = {};
    
    // Inicializar grupos com categorias existentes
    categories.forEach(category => {
        grouped[category.id] = [];
    });
    
    // Agrupar produtos por categoria
    products.forEach(product => {
        if (grouped[product.category_id]) {
            grouped[product.category_id].push(product);
        }
    });
    
    return grouped;
}

/**
 * Atualiza a seção "Os mais pedidos" (mantendo formatação original)
 */
function updateMostOrderedSection(products) {
    const containers = document.querySelectorAll('.mostruario-horizontal .container .rolagem');
    
    // Atualizar todos os containers com os mesmos produtos (como estava antes)
    containers.forEach(container => {
        if (products.length > 0) {
            container.innerHTML = products.slice(0, 6).map(product => createProductHTML(product)).join('');
        }
    });
}


/**
 * Atualiza o menu de categorias com apenas as categorias que existem
 */
function updateCategoryMenu(categories) {
    const categoryMenu = document.querySelector('.categoias');
    
    if (!categoryMenu) return;
    
    // Manter o ícone de menu
    const menuIcon = categoryMenu.querySelector('i');
    let menuHTML = menuIcon ? menuIcon.outerHTML : '';
    
    // Adicionar apenas as categorias que existem na API
    if (categories && categories.length > 0) {
        categories.forEach((category, index) => {
            const categoryId = `categoria${index + 1}`;
            const isSelected = index === 0 ? 'selecionado' : '';
            menuHTML += `<p class="${isSelected}" id="${categoryId}">${category.name}</p>`;
        });
    } else {
        // Fallback: se não houver categorias, mostrar as originais
        const originalCategories = [
            'Mais vendidos',
            'Classicos', 
            'Combos Royal',
            'Vegetarianos',
            'Veganos',
            'Porções',
            'Complementos',
            'Bebidas',
            'Sobremesas'
        ];
        
        originalCategories.forEach((categoryName, index) => {
            const categoryId = `categoria${index + 1}`;
            const isSelected = index === 0 ? 'selecionado' : '';
            menuHTML += `<p class="${isSelected}" id="${categoryId}">${categoryName}</p>`;
        });
    }
    
    categoryMenu.innerHTML = menuHTML;
    
    // Adicionar event listeners para troca de categoria
    addCategoryListeners();
}

/**
 * Adiciona event listeners para troca de categorias
 */
function addCategoryListeners() {
    const categoryItems = document.querySelectorAll('.categoias p[id^="categoria"]');
    const sections = document.querySelectorAll('.rolagem-infinita > div[id^="secao-cat-"]');
    
    categoryItems.forEach((item, index) => {
        item.addEventListener('click', () => {
            // Remover classe selecionado de todos
            categoryItems.forEach(cat => cat.classList.remove('selecionado'));
            
            // Adicionar classe selecionado ao item clicado
            item.classList.add('selecionado');
            
            // Mostrar seção correspondente
            sections.forEach((section, sectionIndex) => {
                if (sectionIndex === index) {
                    section.style.display = 'block';
                } else {
                    section.style.display = 'none';
                }
            });
        });
    });
}

/**
 * Força a atualização da home (limpa cache e recarrega)
 */
async function refreshHome() {
    try {
        clearProductsCache();
        await updateProductSections();
    } catch (error) {
        // TODO: Implementar logging estruturado em produção
        console.error('Erro ao atualizar home:', error.message);
    }
}

/**
 * Inicializa a funcionalidade da home
 */
async function initHome() {
    try {
        // Aguardar carregamento dos módulos de API
        if (typeof getProducts !== 'function' || typeof getCategories !== 'function') {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        // Carregar taxa de entrega das configurações públicas
        await loadDeliveryFee();
        
        // Carregar prazos de entrega estimados das configurações públicas
        await loadEstimatedTimes();
        
        // Atualizar seções de produtos
        await updateProductSections();
        
        // Carregar pontos no header
        if (typeof window.carregarPontosHeader === 'function') {
            window.carregarPontosHeader();
        }
        
    } catch (error) {
        // TODO: Implementar logging estruturado em produção
        console.error('Erro ao inicializar home:', error.message);
    }
}

// Inicializar quando a página carregar
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initHome);
} else {
    initHome();
}

// Expor funções para uso global
window.initHome = initHome;
window.updateProductSections = updateProductSections;
window.clearProductsCache = clearProductsCache;
window.refreshHome = refreshHome;
