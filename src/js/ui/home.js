/**
 * Home.js - Gerenciamento da exibição de produtos na página inicial
 * Carrega produtos e categorias da API e exibe dinamicamente na home
 */

import { cacheManager } from "../utils/cache-manager.js";
import { getProducts } from "../api/products.js";
import { getCategories } from "../api/categories.js";
import { API_BASE_URL } from "../api/api.js";
import { delegate } from "../utils/performance-utils.js";
import { $q, $qa } from "../utils/dom-cache.js";
import {
  renderListInChunks,
  createIncrementalRenderer,
} from "../utils/virtual-scroll.js";
import { escapeHTML, escapeAttribute } from "../utils/html-sanitizer.js";
import { getEstimatedDeliveryTimes } from "../utils/settings-helper.js";

// NOVO: TTL reduzido para refletir mudanças de estoque mais rapidamente
// Cache curto (60 segundos) para garantir que produtos indisponíveis sejam atualizados rapidamente
const CACHE_TTL = 60 * 1000; // 60 segundos (reduzido de 5 minutos)
const CACHE_KEYS = {
  products: "products_all",
  categories: "categories_all",
  estimatedTimes: "estimated_times",
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
 */
function clearProductsCache() {
  cacheManager.invalidate(CACHE_KEYS.products);
  cacheManager.invalidate(CACHE_KEYS.categories);
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
    
    // Filtrar apenas produtos ativos E com capacidade >= 1
    const availableProducts = allProducts.filter((product) => {
      // Verificar se o produto está ativo
      const isActive =
        product.is_active !== false &&
        product.is_active !== 0 &&
        product.is_active !== "false";
      
      // Verificar capacidade (se disponível na resposta)
      // Backend já filtra com filter_unavailable=true, mas esta é uma verificação de segurança extra
      // ALTERAÇÃO: Lógica mais explícita - se capacidade não estiver definida, verifica outros indicadores
      const hasCapacity = (product.capacity !== undefined && product.capacity >= 1) ||
                         product.is_available === true ||
                         (product.availability_status !== undefined && 
                          product.availability_status !== 'unavailable');
      
      return isActive && hasCapacity;
    });

    cacheManager.set(CACHE_KEYS.products, availableProducts, CACHE_TTL);

    return availableProducts;
  } catch (error) {
    console.error('[HOME] Erro ao carregar produtos:', error.message);
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
    // TODO: Implementar logging estruturado em produção
    console.error("Erro ao carregar categorias:", error.message);

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
 * NOVO: Adiciona badges de estoque limitado/baixo
 */
function createProductHTML(product) {
  // Validar dados do produto
  if (!product || !product.id) {
    return "";
  }

  const imageUrl = buildImageUrl(product.image_url, product.image_hash);
  const price = product.price
    ? `R$ ${parseFloat(product.price).toFixed(2).replace(".", ",")}`
    : "R$ 0,00";
  
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
  let stockBadge = '';
  const availabilityStatus = String(product.availability_status || '').toLowerCase();
  if (availabilityStatus === 'limited') {
    stockBadge = '<span class="stock-badge limited">Últimas unidades</span>';
  } else if (availabilityStatus === 'low_stock') {
    stockBadge = '<span class="stock-badge low">Estoque baixo</span>';
  }

  // NOVO: Container para imagem e badge (permite posicionamento absoluto do badge)
  const imageContainer = stockBadge 
    ? `<div class="product-image-container">
        <img src="${imageUrl}" alt="${safeName}" id="foto">
        ${stockBadge}
      </div>`
    : `<img src="${imageUrl}" alt="${safeName}" id="foto">`;

  return `
        <a href="src/pages/produto.html?id=${safeId}">
            <div id="ficha-produto">
                ${imageContainer}
                <div class="informa">
                    <div>
                        <p id="nome">${safeName}</p>
                        <p id="descricao">${safeDescription}</p>
                    </div>
                    <div>
                        <p id="preco">${price}</p>
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
 * Atualiza as seções de produtos na home (versão simplificada)
 */
async function updateProductSections() {
  try {
    // Carregar prazos de entrega antes de renderizar produtos
    await loadEstimatedTimes();
    
    const [products, categories] = await Promise.all([
      loadProducts(),
      loadCategories(),
    ]);

    // Atualizar seção "Os mais pedidos" com produtos reais
    updateMostOrderedSection(products);

    await updateCategorySectionsWithProducts(products, categories);

    // Atualizar menu de categorias com categorias reais
    updateCategoryMenu(categories);

    // Atualizar imagens existentes de forma inteligente
    updateExistingProductImages(products);
  } catch (error) {
    // TODO: Implementar logging estruturado em produção
    console.error("Erro ao atualizar seções de produtos:", error.message);
  }
}

let incrementalRenderers = new Map();

/**
 * Atualiza as seções de categorias com produtos organizados por categoria
 */
async function updateCategorySectionsWithProducts(products, categories) {
  const rolagemInfinita = $q(".rolagem-infinita");

  if (!rolagemInfinita) return;

  // Limpar renderizadores anteriores
  incrementalRenderers.forEach((renderer) => {
    if (renderer && renderer.cleanup) {
      renderer.cleanup();
    }
  });
  incrementalRenderers.clear();

  // Limpar conteúdo existente
  rolagemInfinita.innerHTML = "";

  // Agrupar produtos por categoria
  const groupedProducts = groupProductsByCategory(products, categories);

  // Criar seções para cada categoria que tem produtos
  let categoryIndex = 0;
  categories.forEach((category) => {
    const categoryProducts = groupedProducts[category.id] || [];

    if (categoryProducts.length > 0) {
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
            html += createProductHTML(pair.first);
          }
          if (pair.second) {
            html += createProductHTML(pair.second);
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
            productsHTML += createProductHTML(categoryProducts[i]);
          }

          // Segundo produto do par
          if (categoryProducts[i + 1]) {
            productsHTML += createProductHTML(categoryProducts[i + 1]);
          }

          productsHTML += "</div>";
        }
        sectionDiv.innerHTML = productsHTML;
      }

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
 * Atualiza a seção "Os mais pedidos" (mantendo formatação original)
 */
function updateMostOrderedSection(products) {
  const containers = $qa(".mostruario-horizontal .container .rolagem");

  // Atualizar todos os containers com os mesmos produtos (como estava antes)
  containers.forEach((container) => {
    if (products.length > 0) {
      container.innerHTML = products
        .slice(0, 6)
        .map((product) => createProductHTML(product))
        .join("");
    }
  });
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
      menuHTML += `<p class="${isSelected}" id="${categoryId}">${categoryName}</p>`;
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
    // TODO: Implementar logging estruturado em produção
    console.error("Erro ao atualizar home:", error.message);
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
    // TODO: Implementar logging estruturado em produção
    console.error("Erro ao inicializar home:", error.message);
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
