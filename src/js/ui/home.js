/**
 * Home.js - Gerenciamento da exibição de produtos na página inicial
 * Carrega produtos e categorias da API e exibe dinamicamente na home
 */

import { cacheManager } from "../utils/cache-manager.js";
import { getProducts, simulateProductCapacity } from "../api/products.js";
import { getCategories } from "../api/categories.js";
import { getPromotions, getPromotionByProductId } from "../api/promotions.js";
import { apiRequest } from "../api/api.js";
import { API_BASE_URL } from "../api/api.js";
import { delegate } from "../utils/performance-utils.js";
import { $q, $qa } from "../utils/dom-cache.js";
import {
  renderListInChunks,
  createIncrementalRenderer,
} from "../utils/virtual-scroll.js";
import { escapeHTML, escapeAttribute } from "../utils/html-sanitizer.js";
import { getEstimatedDeliveryTimes } from "../utils/settings-helper.js";
import { calculatePriceWithPromotion, formatPrice, isPromotionActive } from "../utils/price-utils.js";

// NOVO: TTL reduzido para refletir mudanças de estoque mais rapidamente
// Cache curto (60 segundos) para garantir que produtos indisponíveis sejam atualizados rapidamente
const CACHE_TTL = 60 * 1000; // 60 segundos (reduzido de 5 minutos)

// ALTERAÇÃO: Período em dias para considerar produtos como novidades (padrão: 30 dias)
// Produtos criados nos últimos N dias serão exibidos na seção de novidades
const RECENTLY_ADDED_DAYS = 30;

const CACHE_KEYS = {
  products: "products_all",
  categories: "categories_all",
  estimatedTimes: "estimated_times",
  mostOrdered: "products_most_ordered",
  recentlyAdded: "products_recently_added",
  promotions: "promotions_active",
};

// Cache para prazos de entrega
let estimatedTimesCache = null;

// Constantes para validação e limites
const VALIDATION_LIMITS = {
  MAX_PRODUCTS: 1000,
  MAX_CATEGORIES: 100,
  MAX_NAME_LENGTH: 200,
  MAX_DESCRIPTION_LENGTH: 500,
};

/**
 * Limpa o cache de produtos (útil quando produtos são atualizados)
 * ALTERAÇÃO: Invalida também cache de seções horizontais
 */
function clearProductsCache() {
  cacheManager.invalidate(CACHE_KEYS.products);
  cacheManager.invalidate(CACHE_KEYS.categories);
  cacheManager.invalidate(CACHE_KEYS.mostOrdered);
  // ALTERAÇÃO: Invalidar cache de novidades usando chave específica por período
  cacheManager.invalidate(`${CACHE_KEYS.recentlyAdded}_${RECENTLY_ADDED_DAYS}`);
  cacheManager.invalidate(CACHE_KEYS.promotions);
}

/**
 * Carrega todos os produtos da API
 * NOVO: Filtra produtos com estoque suficiente (capacidade >= 1)
 */
async function loadProducts() {
  try {
    const cached = cacheManager.get(CACHE_KEYS.products);
    if (cached) {
      return cached;
    }

    const response = await getProducts({
      page_size: VALIDATION_LIMITS.MAX_PRODUCTS,
      include_inactive: false,
      filter_unavailable: true,
    });

    const allProducts = response?.items || [];
    
    // CORREÇÃO: Backend já filtra produtos indisponíveis com filter_unavailable=true
    // Simplificar: apenas verificar se o produto está ativo
    // A validação de estoque acontece no momento de adicionar/atualizar na cesta
    const availableProducts = allProducts.filter((product) => {
      // Verificar se o produto está ativo
      const isActive =
        product.is_active !== false &&
        product.is_active !== 0 &&
        product.is_active !== "false";
      
      return isActive;
    });

    cacheManager.set(CACHE_KEYS.products, availableProducts, CACHE_TTL);

    return availableProducts;
  } catch (error) {
    // ALTERAÇÃO: Logging condicional apenas em modo debug
    if (typeof window !== 'undefined' && window.DEBUG_MODE) {
      console.error('[HOME] Erro ao carregar produtos:', error.message);
    }
    const cached = cacheManager.get(CACHE_KEYS.products);
    return cached || [];
  }
}

/**
 * Carrega todas as categorias da API
 */
async function loadCategories() {
  try {
    const cached = cacheManager.get(CACHE_KEYS.categories);
    if (cached) {
      return cached;
    }

    const response = await getCategories({
      page_size: VALIDATION_LIMITS.MAX_CATEGORIES,
    });
    const categories = response?.items || [];

    cacheManager.set(CACHE_KEYS.categories, categories, CACHE_TTL);

    return categories;
  } catch (error) {
    // ALTERAÇÃO: Logging condicional apenas em modo debug
    if (typeof window !== 'undefined' && window.DEBUG_MODE) {
      console.error("Erro ao carregar categorias:", error.message);
    }

    // Retornar cache anterior se disponível, senão array vazio
    const cached = cacheManager.get(CACHE_KEYS.categories);
    return cached || [];
  }
}

// Cache local para evitar recarregamento desnecessário de imagens
const imageCache = new Map();

/**
 * Constrói URL correta para imagem do produto com cache inteligente
 */
function buildImageUrl(imagePath, imageHash = null) {
  if (!imagePath) return "src/assets/img/tudo.jpeg";

  // Se já é uma URL completa, usar diretamente
  if (imagePath.startsWith("http")) {
    return imagePath;
  }

  // REVISÃO: Usar API_BASE_URL do api.js para garantir funcionamento em qualquer servidor
  // Isso evita erros quando o código é colocado em outros servidores
  const baseUrl = API_BASE_URL;

  // Usa hash da imagem se disponível, senão usa timestamp
  const cacheParam = imageHash || new Date().getTime();

  // Se é um caminho do backend (/api/uploads/products/ID.jpeg)
  if (imagePath.startsWith("/api/uploads/products/")) {
    return `${baseUrl}${imagePath}?v=${cacheParam}`;
  }

  // Se é um caminho antigo (/uploads/products/ID.jpeg)
  if (imagePath.startsWith("/uploads/products/")) {
    return `${baseUrl}${imagePath.replace(
      "/uploads/",
      "/api/uploads/"
    )}?v=${cacheParam}`;
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
      imgElement.alt = imgElement.alt || "Produto";
    };
    tempImg.src = newSrc;
  }
}

/**
 * Calcula tempo estimado de entrega usando prazos do sistema + tempo de preparo do produto
 * Versão síncrona que usa cache de prazos
 */
function calculateProductDeliveryTime(productPreparationTime = 0) {
  // Usar cache de prazos se disponível
  if (!estimatedTimesCache) {
    // Fallback se não carregou os tempos
    const systemPrep = 20; // Fallback padrão
    const prep = productPreparationTime > 0 ? productPreparationTime : systemPrep;
    const total = 5 + prep + 5 + 15; // Iniciação + Preparo + Envio + Entrega
    return {
      minTime: total,
      maxTime: total + 15,
    };
  }

  // Extrair prazos do cache (com fallbacks)
  const initiation = estimatedTimesCache.initiation_minutes || 5;
  const systemPreparation = estimatedTimesCache.preparation_minutes || 20;
  const dispatch = estimatedTimesCache.dispatch_minutes || 5;
  const delivery = estimatedTimesCache.delivery_minutes || 15;

  // Usar tempo de preparo do produto se fornecido, senão usar o padrão do sistema
  const preparation = productPreparationTime > 0 ? productPreparationTime : systemPreparation;

  // Calcular tempo total: Iniciação + Preparo do Produto + Envio + Entrega
  const totalMinutes = initiation + preparation + dispatch + delivery;

  return {
    minTime: totalMinutes,
    maxTime: totalMinutes + 15,
  };
}

/**
 * Cria o HTML de um produto (mantendo formatação original)
 * NOVO: Adiciona badges de estoque limitado/baixo e suporte a promoções
 * @param {Object} product - Dados do produto
 * @param {Object} promotion - Dados da promoção (opcional)
 * @param {boolean} isHorizontal - Se true, badge de estoque fica sobre a imagem (mostruário horizontal), senão fica dentro da div.informa (mostruário vertical)
 */
function createProductHTML(product, promotion = null, isHorizontal = false) {
  // Validar dados do produto
  if (!product || !product.id) {
    return "";
  }

  const imageUrl = buildImageUrl(product.image_url, product.image_hash);
  
  // ALTERAÇÃO: Suporte a promoções - calcular preço com desconto usando função utilitária
  const productPrice = product.price ? parseFloat(product.price) : 0;
  const priceInfo = calculatePriceWithPromotion(productPrice, promotion);
  
  let priceDisplay = formatPrice(priceInfo.finalPrice);
  let originalPriceDisplay = "";
  let discountBadge = "";
  
  if (priceInfo.hasPromotion) {
    originalPriceDisplay = `<span class="original-price">${formatPrice(priceInfo.originalPrice)}</span>`;
    discountBadge = `<span class="discount-badge">-${priceInfo.discountPercentage.toFixed(0)}%</span>`;
  }
  
  // Calcular tempo usando prazos do sistema + tempo de preparo do produto
  const productPrepTime = product.preparation_time_minutes || 0;
  const timeEstimate = calculateProductDeliveryTime(productPrepTime);
  const prepTime = `${timeEstimate.minTime} - ${timeEstimate.maxTime} min`;
  
  const deliveryFee = "R$ 5,00";

  // Sanitizar dados para evitar XSS
  const safeName = escapeHTML(
    (product.name || "Produto").substring(0, VALIDATION_LIMITS.MAX_NAME_LENGTH)
  );
  const safeDescription = escapeHTML(
    (product.description || "Descrição rápida...").substring(
      0,
      VALIDATION_LIMITS.MAX_DESCRIPTION_LENGTH
    )
  );
  const safeId = String(product.id).replace(/[^0-9]/g, "");

  // NOVO: Adicionar badge de estoque limitado/baixo
  // ALTERAÇÃO: Sanitização de availabilityStatus para prevenir XSS
  // ALTERAÇÃO: Badge de estoque posicionado conforme o tipo de mostruário
  let stockBadge = '';
  let availabilityStatus = String(product.availability_status || '').toLowerCase();
  
  // ALTERAÇÃO: Se availability_status não estiver definido, tentar calcular baseado em max_quantity
  // ou outros indicadores de estoque limitado
  if (!availabilityStatus || (availabilityStatus !== 'limited' && availabilityStatus !== 'low_stock')) {
    // Se o produto tem max_quantity definido e é baixo, considerar como limited
    if (product.max_quantity !== undefined && product.max_quantity !== null) {
      const maxQty = parseInt(product.max_quantity, 10);
      if (maxQty > 0 && maxQty <= 5) {
        availabilityStatus = 'limited';
      } else if (maxQty > 5 && maxQty <= 15) {
        availabilityStatus = 'low_stock';
      }
    }
  }
  
  if (availabilityStatus === 'limited') {
    stockBadge = '<span class="stock-badge limited">Últimas unidades</span>';
  } else if (availabilityStatus === 'low_stock') {
    stockBadge = '<span class="stock-badge low">Estoque baixo</span>';
  }

  // ALTERAÇÃO: No mostruário horizontal, badge de estoque fica sobre a imagem (lado direito)
  // No mostruário vertical, badge de estoque fica dentro da div.informa
  let imageContainer;
  let stockBadgeInInfo = '';
  
  if (isHorizontal) {
    // Mostruário horizontal: badge de estoque sobre a imagem (lado direito)
    const hasAnyBadge = stockBadge || discountBadge;
    imageContainer = hasAnyBadge
      ? `<div class="product-image-container">
          <img src="${imageUrl}" alt="${safeName}" id="foto">
          ${discountBadge}
          ${stockBadge}
        </div>`
      : `<img src="${imageUrl}" alt="${safeName}" id="foto">`;
  } else {
    // Mostruário vertical: badge de estoque dentro da div.informa
    imageContainer = discountBadge
      ? `<div class="product-image-container">
          <img src="${imageUrl}" alt="${safeName}" id="foto">
          ${discountBadge}
        </div>`
      : `<img src="${imageUrl}" alt="${safeName}" id="foto">`;
    stockBadgeInInfo = stockBadge;
  }

  // ALTERAÇÃO: Adicionar aria-label para acessibilidade
  const ariaLabel = `Ver detalhes do produto ${safeName}`;
  
  return `
        <a href="src/pages/produto.html?id=${safeId}" aria-label="${escapeAttribute(ariaLabel)}">
            <div id="ficha-produto">
                ${imageContainer}
                <div class="informa">
                    <div>
                        ${stockBadgeInInfo}
                        <p id="nome">${safeName}</p>
                        <p id="descricao">${safeDescription}</p>
                    </div>
                    <div>
                        <p id="preco">${originalPriceDisplay}${priceDisplay}</p>
                        <p id="tempo">${prepTime} • ${deliveryFee}</p>
                    </div>
                </div>
            </div>
        </a>
    `;
}


/**
 * Atualiza imagens de produtos existentes de forma inteligente
 */
function updateExistingProductImages(products) {
  // Busca todas as imagens de produtos na página
  const productImages = $qa("#ficha-produto img");

  productImages.forEach((img) => {
    const productId = img.closest("a")?.href?.match(/id=(\d+)/)?.[1];
    if (productId) {
      const product = products.find((p) => p.id == productId);
      if (product) {
        updateImageIfChanged(img, product.image_url, product.image_hash);
      }
    }
  });
}

/**
 * Carrega prazos de entrega estimados das configurações públicas
 */
async function loadEstimatedTimes() {
  try {
    estimatedTimesCache = await getEstimatedDeliveryTimes();
    
    // Se não conseguiu carregar, usar valores padrão
    if (!estimatedTimesCache) {
      estimatedTimesCache = {
        initiation_minutes: 5,
        preparation_minutes: 20,
        dispatch_minutes: 5,
        delivery_minutes: 15,
      };
    }
  } catch (error) {
    // Fallback para valores padrão
    estimatedTimesCache = {
      initiation_minutes: 5,
      preparation_minutes: 20,
      dispatch_minutes: 5,
      delivery_minutes: 15,
    };
  }
}

/**
 * Valida se um produto tem estoque disponível e retorna dados de capacidade
 * ALTERAÇÃO: Verifica capacidade/estoque antes de exibir no mostruário e retorna dados completos
 * @param {Object} product - Dados do produto
 * @returns {Promise<Object|null>} { isValid: boolean, capacityData: Object } ou null em caso de erro
 */
async function validateProductStockWithCapacity(product) {
  if (!product || !product.id) {
    return { isValid: false, capacityData: null };
  }

  try {
    // Verificar capacidade do produto (quantidade 1, sem extras)
    const capacityData = await simulateProductCapacity(product.id, [], 1, []);
    
    // Produto está disponível se is_available é true e max_quantity >= 1
    const isValid = capacityData?.is_available === true && (capacityData?.max_quantity ?? 0) >= 1;
    
    return { isValid, capacityData };
  } catch (error) {
    // ALTERAÇÃO: Em caso de erro, considerar produto indisponível para segurança
    // Logging condicional apenas em modo debug
    if (typeof window !== 'undefined' && window.DEBUG_MODE) {
      console.error(`[HOME] Erro ao validar estoque do produto ${product.id}:`, error);
    }
    return { isValid: false, capacityData: null };
  }
}

/**
 * Filtra produtos que têm estoque disponível e adiciona availability_status
 * ALTERAÇÃO: Valida estoque de múltiplos produtos em paralelo e adiciona status de disponibilidade
 * @param {Array} products - Lista de produtos para validar
 * @returns {Promise<Array>} Lista de produtos com estoque disponível e availability_status
 */
async function filterProductsWithStock(products) {
  if (!products || products.length === 0) {
    return [];
  }

  // Validar estoque de todos os produtos em paralelo
  const stockValidations = await Promise.allSettled(
    products.map(product => validateProductStockWithCapacity(product))
  );

  // Filtrar apenas produtos com estoque disponível e adicionar availability_status
  const availableProducts = [];
  for (let i = 0; i < products.length; i++) {
    const validation = stockValidations[i];
    if (validation.status === 'fulfilled' && validation.value.isValid) {
      const product = { ...products[i] };
      const capacityData = validation.value.capacityData;
      
      // ALTERAÇÃO: Adicionar availability_status e max_quantity do capacityData ao produto
      if (capacityData) {
        if (capacityData.availability_status) {
          product.availability_status = capacityData.availability_status;
        }
        // Adicionar max_quantity para cálculo de badge se availability_status não estiver presente
        if (capacityData.max_quantity !== undefined && capacityData.max_quantity !== null) {
          product.max_quantity = capacityData.max_quantity;
        }
      }
      availableProducts.push(product);
    }
  }

  return availableProducts;
}

/**
 * Carrega produtos mais pedidos da API
 * ALTERAÇÃO: Melhor tratamento de erros conforme roteiro
 */
async function loadMostOrderedProducts() {
  try {
    const cached = cacheManager.get(CACHE_KEYS.mostOrdered);
    if (cached) {
      return cached;
    }

    const response = await apiRequest('/api/products/most-ordered?page_size=10', {
      method: 'GET'
    });

    const products = response?.items || [];
    cacheManager.set(CACHE_KEYS.mostOrdered, products, CACHE_TTL);
    return products;
  } catch (error) {
    // ALTERAÇÃO: Logging condicional apenas em modo debug
    if (typeof window !== 'undefined' && window.DEBUG_MODE) {
      console.error('[HOME] Erro ao carregar mais pedidos:', error);
    }
    // Retornar array vazio para não quebrar a UI
    const cached = cacheManager.get(CACHE_KEYS.mostOrdered);
    return cached || [];
  }
}

/**
 * Carrega produtos recentemente adicionados (novidades) da API
 * ALTERAÇÃO: Melhor tratamento de erros conforme roteiro
 * ALTERAÇÃO: Usa validação de tempo baseada em CREATED_AT (produtos criados nos últimos N dias)
 */
async function loadRecentlyAddedProducts() {
  try {
    // ALTERAÇÃO: Cache específico por período para evitar produtos expirados do cache
    // Incluir days no cache key para invalidar quando período mudar
    const cacheKey = `${CACHE_KEYS.recentlyAdded}_${RECENTLY_ADDED_DAYS}`;
    const cached = cacheManager.get(cacheKey);
    if (cached) {
      return cached;
    }

    // ALTERAÇÃO: Passa parâmetro days para API filtrar produtos criados no período
    // API agora retorna apenas produtos criados nos últimos N dias (padrão: 30 dias)
    const response = await apiRequest(
      `/api/products/recently-added?page_size=10&days=${RECENTLY_ADDED_DAYS}`,
      {
        method: 'GET'
      }
    );

    const products = response?.items || [];
    // ALTERAÇÃO: Usar cache key específico por período
    cacheManager.set(cacheKey, products, CACHE_TTL);
    return products;
  } catch (error) {
    // ALTERAÇÃO: Logging condicional apenas em modo debug
    if (typeof window !== 'undefined' && window.DEBUG_MODE) {
      console.error('[HOME] Erro ao carregar novidades:', error);
    }
    // Retornar array vazio para não quebrar a UI
    const cacheKey = `${CACHE_KEYS.recentlyAdded}_${RECENTLY_ADDED_DAYS}`;
    const cached = cacheManager.get(cacheKey);
    return cached || [];
  }
}

/**
 * Carrega promoções ativas da API
 * ALTERAÇÃO: Melhor tratamento de erros conforme roteiro
 */
async function loadActivePromotions() {
  try {
    const cached = cacheManager.get(CACHE_KEYS.promotions);
    if (cached) {
      return cached;
    }

    const response = await getPromotions({ include_expired: false });
    const promotions = response?.items || [];
    
    cacheManager.set(CACHE_KEYS.promotions, promotions, CACHE_TTL);
    return promotions;
  } catch (error) {
    // ALTERAÇÃO: Logging condicional apenas em modo debug
    if (typeof window !== 'undefined' && window.DEBUG_MODE) {
      console.error('[HOME] Erro ao carregar promoções:', error);
    }
    // Retornar array vazio para não quebrar a UI
    const cached = cacheManager.get(CACHE_KEYS.promotions);
    return cached || [];
  }
}

/**
 * Atualiza as seções de produtos na home (versão simplificada)
 * ALTERAÇÃO: Usar Promise.allSettled para não quebrar se uma seção falhar
 */
async function updateProductSections() {
  try {
    // Carregar prazos de entrega antes de renderizar produtos
    await loadEstimatedTimes();
    
    // ALTERAÇÃO: Usar Promise.allSettled para não quebrar se uma seção falhar
    // Isso garante que falha em uma seção não impede carregamento das outras
    const results = await Promise.allSettled([
      loadProducts(),
      loadCategories(),
      loadMostOrderedProducts(),
      loadRecentlyAddedProducts(),
      loadActivePromotions(),
    ]);
    
    // Extrair valores ou usar array vazio em caso de falha
    const products = results[0].status === 'fulfilled' ? results[0].value : [];
    const categories = results[1].status === 'fulfilled' ? results[1].value : [];
    const mostOrdered = results[2].status === 'fulfilled' ? results[2].value : [];
    const recentlyAdded = results[3].status === 'fulfilled' ? results[3].value : [];
    const promotions = results[4].status === 'fulfilled' ? results[4].value : [];

    // Atualizar seções horizontais
    // ALTERAÇÃO: Aguardar validação de estoque antes de renderizar
    await Promise.allSettled([
      updateMostOrderedSection(mostOrdered),
      updatePromotionsSection(promotions),
      updateRecentlyAddedSection(recentlyAdded)
    ]);

    // ALTERAÇÃO: Atualizar seções e obter apenas categorias com produtos
    const categoriesWithProducts = await updateCategorySectionsWithProducts(products, categories);

    // ALTERAÇÃO: Atualizar menu de categorias apenas com categorias que têm produtos
    updateCategoryMenu(categoriesWithProducts || []);

    // Atualizar imagens existentes de forma inteligente
    updateExistingProductImages(products);
  } catch (error) {
    // ALTERAÇÃO: Logging condicional apenas em modo debug
    if (typeof window !== 'undefined' && window.DEBUG_MODE) {
      console.error("Erro ao atualizar seções de produtos:", error.message);
    }
  }
}

let incrementalRenderers = new Map();

/**
 * Atualiza as seções de categorias com produtos organizados por categoria
 * ALTERAÇÃO: Retorna apenas as categorias que têm produtos vinculados
 * @returns {Array} Lista de categorias que têm produtos
 */
async function updateCategorySectionsWithProducts(products, categories) {
  const rolagemInfinita = $q(".rolagem-infinita");

  if (!rolagemInfinita) return [];

  // Limpar renderizadores anteriores
  incrementalRenderers.forEach((renderer) => {
    if (renderer && renderer.cleanup) {
      renderer.cleanup();
    }
  });
  incrementalRenderers.clear();

  // Limpar conteúdo existente
  rolagemInfinita.innerHTML = "";

  // ALTERAÇÃO: Buscar promoções para todos os produtos em paralelo
  const productsWithPromotions = await Promise.all(
    products.map(async (product) => {
      let promotion = null;
      try {
        const promo = await getPromotionByProductId(product.id, false);
        if (promo && isPromotionActive(promo)) {
          promotion = promo;
        }
      } catch (error) {
        // Se não houver promoção, continuar sem ela
        promotion = null;
      }
      return { product, promotion };
    })
  );

  // Agrupar produtos por categoria (mantendo promoções)
  const groupedProducts = groupProductsByCategoryWithPromotions(productsWithPromotions, categories);

  // ALTERAÇÃO: Coletar apenas categorias que têm produtos
  const categoriesWithProducts = [];

  // Criar seções para cada categoria que tem produtos
  let categoryIndex = 0;
  categories.forEach((category) => {
    const categoryProducts = groupedProducts[category.id] || [];

    if (categoryProducts.length > 0) {
      // ALTERAÇÃO: Adicionar categoria à lista de categorias com produtos
      categoriesWithProducts.push(category);
      const sectionId = `secao-cat-${categoryIndex + 1}`;

      // Criar container da seção
      const sectionDiv = document.createElement("div");
      sectionDiv.id = sectionId;
      sectionDiv.style.display = categoryIndex === 0 ? "block" : "none";
      rolagemInfinita.appendChild(sectionDiv);

      // Renderizar em chunks para não bloquear a UI
      const totalPairs = Math.ceil(categoryProducts.length / 2);
      const ITEM_THRESHOLD = 50; // Threshold para usar renderização incremental

      if (categoryProducts.length > ITEM_THRESHOLD) {
        // Renderização incremental para listas grandes
        const pairs = [];
        for (let i = 0; i < categoryProducts.length; i += 2) {
          pairs.push({
            first: categoryProducts[i],
            second: categoryProducts[i + 1],
          });
        }

        // Template para renderizar uma "dupla"
        const pairTemplate = (pair, index) => {
          let html = '<div class="dupla">';
          if (pair.first) {
            // ALTERAÇÃO: Passar promoção se disponível
            const promotion1 = pair.first._promotion || null;
            html += createProductHTML(pair.first, promotion1);
          }
          if (pair.second) {
            // ALTERAÇÃO: Passar promoção se disponível
            const promotion2 = pair.second._promotion || null;
            html += createProductHTML(pair.second, promotion2);
          }
          html += "</div>";
          return html;
        };

        // Renderizar em chunks
        renderListInChunks(sectionDiv, pairs, pairTemplate, {
          chunkSize: 10, // 10 pares por chunk = 20 produtos
          delay: 0, // Usar requestAnimationFrame
        });
      } else {
        // Renderização direta para listas pequenas (melhor performance para poucos itens)
        let productsHTML = "";
        for (let i = 0; i < categoryProducts.length; i += 2) {
          productsHTML += '<div class="dupla">';

          // Primeiro produto do par
          if (categoryProducts[i]) {
            // ALTERAÇÃO: Passar promoção se disponível
            const promotion1 = categoryProducts[i]._promotion || null;
            productsHTML += createProductHTML(categoryProducts[i], promotion1);
          }

          // Segundo produto do par
          if (categoryProducts[i + 1]) {
            // ALTERAÇÃO: Passar promoção se disponível
            const promotion2 = categoryProducts[i + 1]._promotion || null;
            productsHTML += createProductHTML(categoryProducts[i + 1], promotion2);
          }

          productsHTML += "</div>";
        }
        sectionDiv.innerHTML = productsHTML;
      }

      categoryIndex++;
    }
  });

  // ALTERAÇÃO: Retornar apenas categorias que têm produtos
  return categoriesWithProducts;
}

/**
 * Agrupa produtos por categoria
 */
function groupProductsByCategory(products, categories) {
  const grouped = {};

  // Inicializar grupos com categorias existentes
  categories.forEach((category) => {
    grouped[category.id] = [];
  });

  // Agrupar produtos por categoria
  products.forEach((product) => {
    if (grouped[product.category_id]) {
      grouped[product.category_id].push(product);
    }
  });

  return grouped;
}

/**
 * Agrupa produtos com promoções por categoria
 * ALTERAÇÃO: Versão que mantém promoções associadas aos produtos
 */
function groupProductsByCategoryWithPromotions(productsWithPromotions, categories) {
  const grouped = {};

  // Inicializar grupos com categorias existentes
  categories.forEach((category) => {
    grouped[category.id] = [];
  });

  // Agrupar produtos por categoria (mantendo promoções)
  productsWithPromotions.forEach(({ product, promotion }) => {
    if (grouped[product.category_id]) {
      // Criar objeto produto com promoção associada
      const productWithPromo = { ...product, _promotion: promotion };
      grouped[product.category_id].push(productWithPromo);
    }
  });

  return grouped;
}

/**
 * Atualiza a seção "Os mais pedidos"
 * ALTERAÇÃO: Só exibe se houver produtos retornando e com estoque disponível
 */
async function updateMostOrderedSection(products) {
  const containers = $qa(".mostruario-horizontal .container");
  const targetContainer = containers[0]; // Primeiro container é "Os mais pedidos"
  
  if (!targetContainer) return;
  
  const rolagem = targetContainer.querySelector(".rolagem");
  if (!rolagem) return;
  
  // ALTERAÇÃO: Ocultar container inteiro se não houver produtos
  if (!products || products.length === 0) {
    targetContainer.style.display = "none";
    return;
  }
  
  // ALTERAÇÃO: Filtrar produtos com estoque disponível antes de exibir
  const productsWithStock = await filterProductsWithStock(products.slice(0, 10));
  
  // ALTERAÇÃO: Ocultar container se não houver produtos com estoque
  if (!productsWithStock || productsWithStock.length === 0) {
    targetContainer.style.display = "none";
    return;
  }
  
  // ALTERAÇÃO: Buscar promoções para produtos mais pedidos
  const productsWithPromotions = await Promise.all(
    productsWithStock.map(async (product) => {
      let promotion = null;
      try {
        const promo = await getPromotionByProductId(product.id, false);
        if (promo && isPromotionActive(promo)) {
          promotion = promo;
        }
      } catch (error) {
        promotion = null;
      }
      return { product, promotion };
    })
  );

  // Exibir container e renderizar produtos
  // ALTERAÇÃO: Passar isHorizontal=true para badge de estoque aparecer sobre a imagem
  targetContainer.style.display = "block";
  rolagem.innerHTML = productsWithPromotions
    .map(({ product, promotion }) => createProductHTML(product, promotion, true))
    .join("");
}

/**
 * Atualiza a seção "Promoções especiais"
 * ALTERAÇÃO: Exibe produtos com promoção e calcula desconto, validando estoque disponível
 */
async function updatePromotionsSection(promotions) {
  const containers = $qa(".mostruario-horizontal .container");
  const targetContainer = containers[1]; // Segundo container é "Promoções especiais"
  
  if (!targetContainer) return;
  
  const rolagem = targetContainer.querySelector(".rolagem");
  const subtitulo = targetContainer.querySelector("#subtitulo-promocoes");
  if (!rolagem) return;
  
  // ALTERAÇÃO: Ocultar container inteiro se não houver promoções
  if (!promotions || promotions.length === 0) {
    targetContainer.style.display = "none";
    return;
  }
  
  // Exibir container
  targetContainer.style.display = "block";
  
  // ALTERAÇÃO: Preparar produtos com dados de promoção
  // ALTERAÇÃO: Filtrar promoções expiradas antes de exibir
  const now = new Date();
  const productsWithPromotion = promotions
    .filter(promo => {
      // Verificar se o produto está ativo
      if (!promo.product || !promo.product.is_active) {
        return false;
      }
      // ALTERAÇÃO: Verificar se a promoção não está expirada
      if (promo.expires_at) {
        const expiresAt = new Date(promo.expires_at);
        if (expiresAt <= now) {
          return false; // Promoção expirada, não exibir
        }
      }
      return true;
    })
    .slice(0, 10)
    .map(promo => {
      // Combinar dados do produto com dados da promoção
      const product = {
        ...promo.product,
        id: promo.product_id,
        price: promo.product.price,
        image_url: promo.product.image_url,
      };
      return { product, promotion: promo };
    });
  
  // ALTERAÇÃO: Ocultar container se não houver promoções válidas após filtrar expiradas
  if (productsWithPromotion.length === 0) {
    targetContainer.style.display = "none";
    if (subtitulo) subtitulo.style.display = "none";
    return;
  }
  
  // ALTERAÇÃO: Filtrar produtos com estoque disponível e adicionar availability_status
  const productsToDisplay = productsWithPromotion.map(({ product }) => product);
  const productsWithStock = await filterProductsWithStock(productsToDisplay);
  
  // ALTERAÇÃO: Combinar produtos validados com estoque com suas promoções
  // e preservar availability_status e max_quantity dos produtos validados
  const availableProductsWithPromotion = productsWithPromotion
    .map(({ product, promotion }) => {
      // Encontrar o produto validado com dados de capacidade
      const validatedProduct = productsWithStock.find(p => p.id === product.id);
      if (validatedProduct) {
        // Usar o produto validado que tem availability_status e max_quantity
        return { product: validatedProduct, promotion };
      }
      return null;
    })
    .filter(item => item !== null);
  
  // ALTERAÇÃO: Ocultar container se não houver produtos com estoque após validação
  if (availableProductsWithPromotion.length === 0) {
    targetContainer.style.display = "none";
    if (subtitulo) subtitulo.style.display = "none";
    return;
  }
  
  // Renderizar produtos com promoção
  // ALTERAÇÃO: Passar isHorizontal=true para badge de estoque aparecer sobre a imagem
  rolagem.innerHTML = availableProductsWithPromotion
    .map(({ product, promotion }) => createProductHTML(product, promotion, true))
    .join("");
  
  // ALTERAÇÃO: Atualizar contador de expiração se houver promoções
  // ALTERAÇÃO: Usar a promoção com maior tempo de validade para o cronômetro
  if (availableProductsWithPromotion.length > 0 && subtitulo) {
    // Encontrar a promoção com maior tempo de validade (maior expires_at)
    const promotionWithLongestValidity = availableProductsWithPromotion
      .filter(({ promotion }) => promotion && promotion.expires_at)
      .reduce((longest, current) => {
        if (!longest) return current;
        const longestExpiry = new Date(longest.promotion.expires_at);
        const currentExpiry = new Date(current.promotion.expires_at);
        return currentExpiry > longestExpiry ? current : longest;
      }, null);
    
    if (promotionWithLongestValidity && promotionWithLongestValidity.promotion.expires_at) {
      updatePromotionCountdown(subtitulo, promotionWithLongestValidity.promotion.expires_at);
      subtitulo.style.display = "block";
    } else {
      subtitulo.style.display = "none";
    }
  } else if (subtitulo) {
    subtitulo.style.display = "none";
  }
}

/**
 * Atualiza a seção "Novidades"
 * ALTERAÇÃO: Só exibe se houver produtos retornando e com estoque disponível
 */
async function updateRecentlyAddedSection(products) {
  const containers = $qa(".mostruario-horizontal .container");
  const targetContainer = containers[2]; // Terceiro container é "Novidades"
  
  if (!targetContainer) return;
  
  const rolagem = targetContainer.querySelector(".rolagem");
  if (!rolagem) return;
  
  // ALTERAÇÃO: Ocultar container inteiro se não houver produtos
  if (!products || products.length === 0) {
    targetContainer.style.display = "none";
    return;
  }
  
  // ALTERAÇÃO: Filtrar produtos com estoque disponível antes de exibir
  const productsWithStock = await filterProductsWithStock(products.slice(0, 10));
  
  // ALTERAÇÃO: Ocultar container se não houver produtos com estoque
  if (!productsWithStock || productsWithStock.length === 0) {
    targetContainer.style.display = "none";
    return;
  }
  
  // ALTERAÇÃO: Buscar promoções para produtos recentemente adicionados
  const productsWithPromotions = await Promise.all(
    productsWithStock.map(async (product) => {
      let promotion = null;
      try {
        const promo = await getPromotionByProductId(product.id, false);
        if (promo && isPromotionActive(promo)) {
          promotion = promo;
        }
      } catch (error) {
        promotion = null;
      }
      return { product, promotion };
    })
  );

  // Exibir container e renderizar produtos
  // ALTERAÇÃO: Passar isHorizontal=true para badge de estoque aparecer sobre a imagem
  targetContainer.style.display = "block";
  rolagem.innerHTML = productsWithPromotions
    .map(({ product, promotion }) => createProductHTML(product, promotion, true))
    .join("");
}

// ALTERAÇÃO: Armazenar intervalos ativos para cleanup adequado (prevenir memory leak)
const activeCountdownIntervals = new Map();

/**
 * Atualiza contador de expiração da promoção
 * ALTERAÇÃO: Limpa intervalos anteriores para prevenir memory leak
 */
function updatePromotionCountdown(element, expiresAt) {
  const spans = element.querySelectorAll("span");
  if (spans.length !== 3) return;
  
  // ALTERAÇÃO: Limpar intervalo anterior se existir para este elemento
  if (activeCountdownIntervals.has(element)) {
    clearInterval(activeCountdownIntervals.get(element));
  }
  
  const updateCountdown = () => {
    const now = new Date();
    const expiry = new Date(expiresAt);
    const diff = expiry - now;
    
    if (diff <= 0) {
      spans[0].textContent = "00";
      spans[1].textContent = "00";
      spans[2].textContent = "00";
      // ALTERAÇÃO: Limpar intervalo quando expirar
      if (activeCountdownIntervals.has(element)) {
        clearInterval(activeCountdownIntervals.get(element));
        activeCountdownIntervals.delete(element);
      }
      return;
    }
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);
    
    spans[0].textContent = String(hours).padStart(2, "0");
    spans[1].textContent = String(minutes).padStart(2, "0");
    spans[2].textContent = String(seconds).padStart(2, "0");
  };
  
  updateCountdown();
  // Atualizar a cada segundo
  const intervalId = setInterval(updateCountdown, 1000);
  // ALTERAÇÃO: Armazenar intervalo para cleanup
  activeCountdownIntervals.set(element, intervalId);
  
  // Limpar intervalo quando a promoção expirar
  const expiry = new Date(expiresAt);
  const now = new Date();
  const timeout = expiry - now;
  if (timeout > 0) {
    setTimeout(() => {
      if (activeCountdownIntervals.has(element)) {
        clearInterval(activeCountdownIntervals.get(element));
        activeCountdownIntervals.delete(element);
      }
    }, timeout);
  }
}

/**
 * Atualiza o menu de categorias com apenas as categorias que existem
 */
function updateCategoryMenu(categories) {
  const categoryMenu = $q(".categoias");

  if (!categoryMenu) return;

  // Manter o ícone de menu
  const menuIcon = categoryMenu.querySelector("i");
  let menuHTML = menuIcon ? menuIcon.outerHTML : "";

  // Adicionar apenas as categorias que existem na API
  if (categories && categories.length > 0) {
    categories.forEach((category, index) => {
      const categoryId = `categoria${index + 1}`;
      const isSelected = index === 0 ? "selecionado" : "";
      menuHTML += `<p class="${isSelected}" id="${categoryId}">${category.name}</p>`;
    });
  } else {
    // Fallback: se não houver categorias, mostrar as originais
    const originalCategories = [
      "Mais vendidos",
      "Classicos",
      "Combos Royal",
      "Vegetarianos",
      "Veganos",
      "Porções",
      "Complementos",
      "Bebidas",
      "Sobremesas",
    ];

    originalCategories.forEach((categoryName, index) => {
      const categoryId = `categoria${index + 1}`;
      const isSelected = index === 0 ? "selecionado" : "";
      // ALTERAÇÃO: Sanitizar nome da categoria para prevenir XSS
      const safeCategoryName = escapeHTML(categoryName);
      menuHTML += `<p class="${isSelected}" id="${categoryId}">${safeCategoryName}</p>`;
    });
  }

  categoryMenu.innerHTML = menuHTML;

  // Adicionar event listeners para troca de categoria
  addCategoryListeners();
}

let categoryListenerCleanup = null;

/**
 * Adiciona event listeners para troca de categorias usando event delegation
 */
function addCategoryListeners() {
  const categoryMenu = $q(".categoias");
  if (!categoryMenu) return;

  // Limpar listener anterior se existir
  if (categoryListenerCleanup) {
    categoryListenerCleanup();
  }

  categoryListenerCleanup = delegate(
    categoryMenu,
    "click",
    'p[id^="categoria"]',
    (e, target) => {
      const categoryItems = $qa('.categoias p[id^="categoria"]');
      const sections = $qa('.rolagem-infinita > div[id^="secao-cat-"]');

      // Encontrar índice do item clicado
      const index = Array.from(categoryItems).indexOf(target);
      if (index === -1) return;

      // Remover classe selecionado de todos
      categoryItems.forEach((cat) => cat.classList.remove("selecionado"));

      // Adicionar classe selecionado ao item clicado
      target.classList.add("selecionado");

      // Mostrar seção correspondente
      sections.forEach((section, sectionIndex) => {
        if (sectionIndex === index) {
          section.style.display = "block";
        } else {
          section.style.display = "none";
        }
      });
    }
  );
}

/**
 * Força a atualização da home (limpa cache e recarrega)
 */
async function refreshHome() {
  try {
    clearProductsCache();
    await updateProductSections();
  } catch (error) {
    // ALTERAÇÃO: Logging condicional apenas em modo debug
    if (typeof window !== 'undefined' && window.DEBUG_MODE) {
      console.error("Erro ao atualizar home:", error.message);
    }
  }
}

/**
 * Inicializa a funcionalidade da home
 */
async function initHome() {
  try {
    // Aguardar carregamento dos módulos de API
    if (
      typeof getProducts !== "function" ||
      typeof getCategories !== "function"
    ) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    // Atualizar seções de produtos
    await updateProductSections();

    // Carregar pontos no header
    if (typeof window.carregarPontosHeader === "function") {
      window.carregarPontosHeader();
    }
  } catch (error) {
    // ALTERAÇÃO: Logging condicional apenas em modo debug
    if (typeof window !== 'undefined' && window.DEBUG_MODE) {
      console.error("Erro ao inicializar home:", error.message);
    }
  }
}

// Inicializar quando a página carregar
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initHome);
} else {
  initHome();
}

// Expor funções para uso global
window.initHome = initHome;
window.updateProductSections = updateProductSections;
window.clearProductsCache = clearProductsCache;
window.refreshHome = refreshHome;
