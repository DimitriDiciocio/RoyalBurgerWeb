/**
 * Home.js - Gerenciamento da exibição de produtos na página inicial
 * Carrega produtos e categorias da API e exibe dinamicamente na home
 */

// OTIMIZAÇÃO 1.1: Usar cache manager compartilhado
import { cacheManager } from "../utils/cache-manager.js";
import { getProducts } from "../api/products.js";
import { getCategories } from "../api/categories.js";
// OTIMIZAÇÃO 1.3: Event delegation
import { delegate } from "../utils/performance-utils.js";
// OTIMIZAÇÃO 1.4: Cache de referências DOM
import { $q, $qa } from "../utils/dom-cache.js";
// OTIMIZAÇÃO 1.6: Renderização incremental para listas grandes
import {
  renderListInChunks,
  createIncrementalRenderer,
} from "../utils/virtual-scroll.js";
// OTIMIZAÇÃO 2.1: Sanitização automática de HTML para prevenir XSS
import { escapeHTML, escapeAttribute } from "../utils/html-sanitizer.js";

const CACHE_TTL = 5 * 60 * 1000; // 5 minutos
const CACHE_KEYS = {
  products: "products_all",
  categories: "categories_all",
};

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
 */
async function loadProducts() {
  try {
    // OTIMIZAÇÃO 1.1: Verificar cache primeiro
    const cached = cacheManager.get(CACHE_KEYS.products);
    if (cached) {
      return cached;
    }

    const response = await getProducts({
      page_size: VALIDATION_LIMITS.MAX_PRODUCTS,
      include_inactive: false,
    });

    // Filtrar apenas produtos ativos (dupla verificação)
    const allProducts = response?.items || [];
    const activeProducts = allProducts.filter((product) => {
      // Verificar se o produto está ativo (is_active deve ser true ou undefined/null)
      const isActive =
        product.is_active !== false &&
        product.is_active !== 0 &&
        product.is_active !== "false";
      return isActive;
    });

    // OTIMIZAÇÃO 1.1: Armazenar no cache compartilhado
    cacheManager.set(CACHE_KEYS.products, activeProducts, CACHE_TTL);

    return activeProducts;
  } catch (error) {
    // TODO: Implementar logging estruturado em produção
    console.error("Erro ao carregar produtos:", error.message);

    // Retornar cache anterior se disponível, senão array vazio
    const cached = cacheManager.get(CACHE_KEYS.products);
    return cached || [];
  }
}

/**
 * Carrega todas as categorias da API
 */
async function loadCategories() {
  try {
    // OTIMIZAÇÃO 1.1: Verificar cache primeiro
    const cached = cacheManager.get(CACHE_KEYS.categories);
    if (cached) {
      return cached;
    }

    const response = await getCategories({
      page_size: VALIDATION_LIMITS.MAX_CATEGORIES,
    });
    const categories = response?.items || [];

    // OTIMIZAÇÃO 1.1: Armazenar no cache compartilhado
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

  // URL base dinâmica baseada na origem atual
  const currentOrigin = window.location.origin;
  let baseUrl;

  // Se estamos em localhost, usar localhost:5000
  if (
    currentOrigin.includes("localhost") ||
    currentOrigin.includes("127.0.0.1")
  ) {
    baseUrl = "http://localhost:5000";
  } else {
    // Para outros ambientes, usar a mesma origem mas porta 5000
    const hostname = window.location.hostname;
    baseUrl = `http://${hostname}:5000`;
  }

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
 * Cria o HTML de um produto (mantendo formatação original)
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
  const prepTime = product.preparation_time_minutes
    ? `${product.preparation_time_minutes} - ${
        product.preparation_time_minutes + 10
      } min`
    : "40 - 50 min";
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
                        <p id="tempo">${prepTime} • ${deliveryFee}</p>
                    </div>
                </div>
            </div>
        </a>
    `;
}

// OTIMIZAÇÃO 2.1: escapeHTML agora importado de html-sanitizer.js (função removida - usando import)

/**
 * Atualiza imagens de produtos existentes de forma inteligente
 */
function updateExistingProductImages(products) {
  // Busca todas as imagens de produtos na página
  // OTIMIZAÇÃO 1.4: Usar cache DOM ao invés de query direta
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
 * Atualiza as seções de produtos na home (versão simplificada)
 */
async function updateProductSections() {
  try {
    const [products, categories] = await Promise.all([
      loadProducts(),
      loadCategories(),
    ]);

    // Atualizar seção "Os mais pedidos" com produtos reais
    updateMostOrderedSection(products);

    // OTIMIZAÇÃO 1.6: Aguardar renderização incremental das seções de categorias
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

// OTIMIZAÇÃO 1.6: Armazenar renderizadores incrementais por seção
let incrementalRenderers = new Map();

/**
 * Atualiza as seções de categorias com produtos organizados por categoria
 */
async function updateCategorySectionsWithProducts(products, categories) {
  // OTIMIZAÇÃO 1.4: Usar cache DOM
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

      // OTIMIZAÇÃO 1.6: Usar renderização incremental para listas grandes (>50 itens)
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
  // OTIMIZAÇÃO 1.4: Usar cache DOM
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
  // OTIMIZAÇÃO 1.4: Usar cache DOM
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

// OTIMIZAÇÃO 1.3: Cleanup handlers para event delegation
let categoryListenerCleanup = null;

/**
 * Adiciona event listeners para troca de categorias usando event delegation
 */
function addCategoryListeners() {
  // OTIMIZAÇÃO 1.4: Usar cache DOM
  const categoryMenu = $q(".categoias");
  if (!categoryMenu) return;

  // Limpar listener anterior se existir
  if (categoryListenerCleanup) {
    categoryListenerCleanup();
  }

  // OTIMIZAÇÃO 1.3: Usar event delegation ao invés de adicionar listener em cada item
  categoryListenerCleanup = delegate(
    categoryMenu,
    "click",
    'p[id^="categoria"]',
    (e, target) => {
      // OTIMIZAÇÃO 1.4: Usar cache DOM
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
