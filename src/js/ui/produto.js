// src/js/ui/produto.js

import {
  getProductById,
  getProductIngredients,
  getProductImageUrl,
  simulateProductCapacity,
} from "../api/products.js";
import { getIngredients } from "../api/ingredients.js";
import { addToCart, updateCartItem, getCart } from "../api/cart.js";
import { getPromotionByProductId } from "../api/promotions.js";
import { showToast } from "./alerts.js";
import { API_BASE_URL, getStoredUser } from "../api/api.js";
import { cacheManager } from "../utils/cache-manager.js";
import { delegate, debounce } from "../utils/performance-utils.js";
import { $id, $q } from "../utils/dom-cache.js";
import {
  escapeHTML,
  escapeAttribute,
  sanitizeURL,
} from "../utils/html-sanitizer.js";
import { calculatePriceWithPromotion, formatPrice, isPromotionActive } from "../utils/price-utils.js";

// Constantes de cache
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos
const CACHE_KEYS = {
  product: (id) => `product_${id}`,
  productIngredients: (id) => `product_ingredients_${id}`,
  allIngredients: "ingredients_all",
};

// Constantes para validação e limites
const VALIDATION_LIMITS = {
  MAX_QUANTITY: 99,
  MAX_NOTES_LENGTH: 500,
  MAX_EXTRAS_COUNT: 10,
  MAX_INGREDIENT_NAME_LENGTH: 100,
  MAX_PRODUCT_NAME_LENGTH: 200,
  MAX_DESCRIPTION_LENGTH: 500,
};

(function initProdutoPage() {
  if (!window.location.pathname.includes("produto.html")) return;

  const state = {
    productId: null,
    product: null,
    promotion: null, // ALTERAÇÃO: Armazenar promoção ativa do produto
    basePrice: 0,
    quantity: 1,
    extrasById: new Map(),
    ingredientes: [],
    ingredientesPorcaoBase: [],
    ingredientesExtras: [],
    editIndex: null,
    isEditing: false,
    cartItemId: null,
    productMaxQuantity: 99, // Capacidade máxima do produto (atualizada por updateProductCapacity)
    isUpdatingCapacity: false, // Flag para indicar se está validando capacidade (loading state)
  };

  const cleanupDelegates = new Map();

  // DOM refs
  const el = {
    nome: $id("nome-produto"),
    descricao: $id("descricao-produto"),
    img: $id("imagem-produto"),
    precoQuadro: $id("valor"),
    precoApartir: $q(".area-adicionar .valor span"),
    qtdTexto: $q(".area-adicionar .quadro .quantidade #quantidade"),
    qtdMenos: $q(".area-adicionar .quadro .quantidade .fa-minus"),
    qtdMais: $q(".area-adicionar .quadro .quantidade .fa-plus"),
    btnAdicionarCesta: $q(".area-adicionar .quadro button"),
    listaExtrasContainer: $q(".monte .rolagem"),
    btnExtras: $q(".monte button"),
    extrasBadge: $id("extras-badge"),
    obsInput: $q(".observacao input"),
    obsLimite: $q(".observacao .limite"),
    modalExtras: $id("modal-extras"),
    overlayExtras: $id("overlay-extras"),
    fecharModalExtras: $id("fechar-modal-extras"),
    listaExtrasModal: $id("lista-extras-modal"),
  };

  // Utils
  const formatBRL = (v) =>
    new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(v || 0);

  const toNum = (v) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : null;
  };

  // Trata mensagens de erro vindas do backend de forma amigável
  function getFriendlyAddToCartError(rawMessage) {
    const msg = (rawMessage || "").toString();
    if (!msg)
      return "Não foi possível adicionar o item à cesta. Tente novamente.";
    // Erros conhecidos
    if (msg.includes("Estoque insuficiente")) return msg; // já vem explicativo do backend
    if (msg.includes("da receita base"))
      return "Você tentou adicionar um ingrediente da receita base como extra. Ajuste apenas os extras.";
    if (
      msg.toLowerCase().includes("unauthorized") ||
      msg.includes("Sessão expirada")
    )
      return "Sua sessão expirou. Faça login e tente novamente.";
    if (msg.includes("Serviço não encontrado"))
      return "Serviço indisponível. Verifique se o servidor está em execução.";
    // Fallback: exibir a mensagem do backend se não for genérica
    if (!/^erro\s?\d+/i.test(msg)) return msg;
    return "Não foi possível adicionar o item à cesta. Tente novamente.";
  }


  // SECURITY FIX: Validação robusta de IDs
  function validateIngredientId(id) {
    if (!id) return null;

    // Validar se é string ou número
    const idStr = String(id).trim();
    if (!/^\d+$/.test(idStr)) return null; // Apenas números

    const parsed = parseInt(idStr, 10);
    return Number.isInteger(parsed) && parsed > 0 && parsed <= 2147483647
      ? parsed
      : null;
  }

  // Validação de preços para evitar valores maliciosos
  function validatePrice(price) {
    if (price === null || price === undefined) return 0;
    const num = Number(price);
    return Number.isFinite(num) && num >= 0 && num <= 999999.99 ? num : 0;
  }

  function resolveAdditionalPrice(obj) {
    if (!obj || typeof obj !== "object") return null;
    const candidates = [
      "additional_price",
      "additional_value",
      "extra_price",
      "price_additional",
      "price_add",
      "price_delta",
    ];
    for (const key of candidates) {
      if (key in obj) {
        const n = toNum(obj[key]);
        if (n !== null) return validatePrice(n);
      }
    }
    return null;
  }

  function buildImageUrl(imagePath, imageHash = null) {
    if (!imagePath) return "../assets/img/tudo.jpeg";

    // Sanitizar caminho da imagem para evitar path traversal
    const sanitizedPath = imagePath
      .replace(/\.\./g, "")
      .replace(/[<>:"|?*]/g, "");

    if (sanitizedPath.startsWith("http")) {
      // Validar URL para evitar ataques
      try {
        const url = new URL(sanitizedPath);
        if (["http:", "https:"].includes(url.protocol)) {
          return sanitizedPath;
        }
      } catch (e) {
        // ALTERAÇÃO: Removido console.warn em produção
        // TODO: REVISAR - Implementar logging estruturado condicional (apenas em modo debug)
        if (typeof window !== 'undefined' && window.DEBUG_MODE) {
          console.warn("URL de imagem inválida:", sanitizedPath);
        }
      }
      return "../assets/img/tudo.jpeg";
    }

    // CORREÇÃO: Usar API_BASE_URL do api.js para garantir funcionamento em qualquer servidor
    // Isso evita erros quando o código é colocado em outros servidores
    const baseUrl = API_BASE_URL;

    // CORREÇÃO: Usar imageHash quando disponível, caso contrário não usar cache busting
    // para evitar múltiplas requisições desnecessárias da mesma imagem
    // O cache busting só é necessário quando a imagem realmente mudou (via imageHash)
    const cacheParam = imageHash || '';

    let finalPath = '';
    if (sanitizedPath.startsWith("/api/uploads/products/")) {
      finalPath = `${baseUrl}${sanitizedPath}`;
    } else if (sanitizedPath.startsWith("/uploads/products/")) {
      finalPath = `${baseUrl}${sanitizedPath.replace("/uploads/", "/api/uploads/")}`;
    } else if (sanitizedPath.match(/^\d+\.(jpg|jpeg|png|gif|webp)$/i)) {
      finalPath = `${baseUrl}/api/uploads/products/${sanitizedPath}`;
    } else {
      finalPath = `${baseUrl}/api/uploads/products/${sanitizedPath}`;
    }

    // Adicionar cache param apenas se houver imageHash (imagem foi atualizada)
    return cacheParam ? `${finalPath}?v=${cacheParam}` : finalPath;
  }

  function getIdFromUrl() {
    try {
      const params = new URLSearchParams(window.location.search);
      const id = params.get("id");
      return validateIngredientId(id);
    } catch (error) {
      // ALTERAÇÃO: Removido console.warn em produção
      // TODO: REVISAR - Implementar logging estruturado condicional (apenas em modo debug)
      if (typeof window !== 'undefined' && window.DEBUG_MODE) {
        console.warn("Erro ao obter ID da URL:", error.message);
      }
      return null;
    }
  }

  function getEditIndexFromUrl() {
    try {
      const params = new URLSearchParams(window.location.search);
      const editIndex = params.get("editIndex");
      if (!editIndex) return null;

      const index = parseInt(editIndex, 10);
      return Number.isInteger(index) && index >= 0 ? index : null;
    } catch (error) {
      // ALTERAÇÃO: Removido console.warn em produção
      // TODO: REVISAR - Implementar logging estruturado condicional (apenas em modo debug)
      if (typeof window !== 'undefined' && window.DEBUG_MODE) {
        console.warn("Erro ao obter editIndex da URL:", error.message);
      }
      return null;
    }
  }

  function getCartItemIdFromUrl() {
    try {
      const params = new URLSearchParams(window.location.search);
      const raw = params.get("cartItemId");
      if (!raw) return null;
      const id = parseInt(raw, 10);
      return Number.isInteger(id) && id > 0 ? id : null;
    } catch (_e) {
      return null;
    }
  }

  function updateTitle() {
    if (state.product?.name) {
      document.title = `${escapeHTML(state.product.name)} - Royal Burguer`;
    }
  }

  function renderProdutoInfo() {
    if (!state.product) return;

    const name = state.product.name || "Produto";
    const desc = state.product.description || "";
    const originalPrice = parseFloat(state.product.price) || 0;
    
    // ALTERAÇÃO: Calcular preço com promoção se houver
    const priceInfo = calculatePriceWithPromotion(originalPrice, state.promotion);
    state.basePrice = priceInfo.finalPrice; // Usar preço final (com desconto) como base
    
    if (el.nome) el.nome.textContent = name;
    if (el.descricao) el.descricao.textContent = desc;
    
    // ALTERAÇÃO: Exibir preço com desconto e preço original riscado se houver promoção
    if (el.precoApartir) {
      if (priceInfo.hasPromotion) {
        el.precoApartir.innerHTML = `<span class="original-price" style="text-decoration: line-through; color: #999; margin-right: 8px;">${formatBRL(priceInfo.originalPrice)}</span>${formatBRL(priceInfo.finalPrice)}`;
      } else {
        el.precoApartir.textContent = formatBRL(priceInfo.finalPrice);
      }
    }

    const imagePath =
      state.product.image_url || getProductImageUrl(state.product.id);
    const imageUrl = buildImageUrl(imagePath, state.product.image_hash);
    // CORREÇÃO: Evitar atualizar src se a URL não mudou para prevenir múltiplas requisições
    if (el.img) {
      if (el.img.src !== imageUrl) {
        el.img.src = imageUrl;
      }
      if (el.img.alt !== name) {
        el.img.alt = name;
      }
    }

    updateTotals();
  }

  function updateTotals() {
    // Calcular total de extras e modificações de base
    // EXTRAS (basePortions = 0): cobrar pela quantidade total
    // BASE_MODIFICATIONS (basePortions > 0): cobrar apenas pelo delta positivo
    const extrasTotal = Array.from(state.extrasById.values()).reduce(
      (sum, extra) => {
        if (extra.basePortions > 0) {
          // Modificação de receita base: cobrar apenas se delta > 0
          const delta = extra.quantity || 0;
          if (delta > 0) {
            return sum + extra.price * delta;
          }
          return sum;
        } else {
          // Extra adicional: cobrar pela quantidade total
          const qty = Math.max(extra.quantity, 0);
          return sum + extra.price * qty;
        }
      },
      0
    );

    const unitTotal = state.basePrice + extrasTotal;
    const total = unitTotal * state.quantity;

    if (el.precoQuadro) el.precoQuadro.textContent = formatBRL(total);
    if (el.qtdTexto)
      el.qtdTexto.textContent = String(state.quantity).padStart(2, "0");
  }

  function updateExtrasBadge() {
    if (!el.extrasBadge) return;
    if (!Array.isArray(state.ingredientesExtras)) {
      el.extrasBadge.style.display = "none";
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
      el.extrasBadge.style.display = "flex";
    } else {
      el.extrasBadge.style.display = "none";
    }
  }

  // =====================================================
  // 🔄 Integração de Validação de Estoque (Etapa 2)
  // =====================================================

  /**
   * Atualiza a capacidade do produto baseada no estoque
   * 
   * IMPORTANTE: REGRA DE CONSUMO PROPORCIONAL POR QUANTIDADE
   * Esta função calcula a capacidade máxima considerando que o consumo é multiplicado por quantity:
   * - Receita base: consumo_receita × quantity
   * - Extras: quantity_extra × BASE_PORTION_QUANTITY × quantity
   * - Base modifications: delta × BASE_PORTION_QUANTITY × quantity
   * 
   * O backend multiplica automaticamente todo o consumo pela quantidade do produto.
   * 
   * Exemplo:
   * - quantity = 2, receita usa 1 pão, extras têm 2 bacon (2 porções extras)
   * - Backend calcula: receita (1 pão × 2) + extras (2 porções × 30g × 2 unidades) = 2 pães + 120g bacon
   * 
   * @param {boolean} showMessage - Se true, exibe mensagem de limite quando houver restrição (padrão: false)
   * @param {boolean} immediate - Se true, executa imediatamente sem debounce (padrão: false)
   * @returns {Promise<Object|null>} Dados da capacidade ou null em caso de erro
   */
  async function updateProductCapacity(showMessage = false, immediate = false) {
    if (!state.productId) return null;

    // ALTERAÇÃO: Se já está atualizando e não é imediato, aguardar debounce
    if (state.isUpdatingCapacity && !immediate) {
      return null;
    }

    try {
      // ALTERAÇÃO: Ativar loading state
      state.isUpdatingCapacity = true;
      
      // ALTERAÇÃO: Mostrar indicador visual de loading (spinner sutil)
      if (el.qtdMais && !immediate) {
        // Criar ou atualizar indicador de loading
        let loadingIndicator = document.querySelector('.capacity-loading-indicator');
        if (!loadingIndicator) {
          loadingIndicator = document.createElement('div');
          loadingIndicator.className = 'capacity-loading-indicator';
          loadingIndicator.innerHTML = '<i class="fa-solid fa-spinner fa-spin" style="font-size: 0.75rem; color: #666;"></i>';
          loadingIndicator.style.cssText = 'position: absolute; top: 50%; right: 0.5rem; transform: translateY(-50%); pointer-events: none;';
          
          // Inserir próximo ao botão de quantidade
          const qtdContainer = el.qtdMais?.closest('.quantidade');
          if (qtdContainer) {
            qtdContainer.style.position = 'relative';
            qtdContainer.appendChild(loadingIndicator);
          }
        }
        loadingIndicator.style.display = 'block';
      }
      
      // Preparar extras para a API (apenas extras adicionais, não modificações de base)
      const extras = Array.from(state.extrasById.values())
        .filter((extra) => (extra?.basePortions ?? 0) === 0)
        .filter((extra) => Number.isFinite(extra.quantity) && extra.quantity > 0)
        .map((extra) => {
          // ALTERAÇÃO: Validação mais robusta de parseInt
          const ingId = parseInt(extra.id || extra.ingredient_id, 10);
          const qty = parseInt(extra.quantity, 10);
          // ALTERAÇÃO: Validar se parseInt retornou NaN
          if (isNaN(ingId) || ingId <= 0 || ingId > 2147483647) {
            // ALTERAÇÃO: Removido console.warn em produção
            // TODO: REVISAR - Implementar logging estruturado condicional (apenas em modo debug)
            if (typeof window !== 'undefined' && window.DEBUG_MODE) {
              console.warn(`Ingredient ID inválido ignorado: ${extra.id || extra.ingredient_id}`);
            }
            return null;
          }
          if (isNaN(qty) || qty <= 0 || qty > 999) {
            // ALTERAÇÃO: Removido console.warn em produção
            if (typeof window !== 'undefined' && window.DEBUG_MODE) {
              console.warn(`Quantity inválida ignorada: ${extra.quantity}`);
            }
            return null;
          }
          return {
            ingredient_id: ingId,
            quantity: qty,
          };
        })
        .filter((extra) => extra !== null); // ALTERAÇÃO: Remove entradas inválidas

      // CORREÇÃO: Preparar modificações da receita base (base_modifications)
      // O backend agora suporta base_modifications com deltas positivos e negativos
      // - Delta positivo (+2 queijo): adiciona à receita base
      // - Delta negativo (-1 queijo): remove da receita base (reduz consumo)
      const baseModifications = Array.from(state.extrasById.values())
        .filter((extra) => (extra?.basePortions ?? 0) > 0)
        .filter((extra) => Number.isFinite(extra.quantity) && extra.quantity !== 0)
        .map((extra) => {
          // ALTERAÇÃO: Validação mais robusta de parseInt
          const ingId = parseInt(extra.id || extra.ingredient_id, 10);
          const delta = parseInt(extra.quantity, 10); // Pode ser positivo ou negativo
          // ALTERAÇÃO: Validar se parseInt retornou NaN
          if (isNaN(ingId) || ingId <= 0 || ingId > 2147483647) {
            // ALTERAÇÃO: Removido console.warn em produção
            // TODO: REVISAR - Implementar logging estruturado condicional (apenas em modo debug)
            if (typeof window !== 'undefined' && window.DEBUG_MODE) {
              console.warn(`Ingredient ID inválido ignorado em base_modification: ${extra.id || extra.ingredient_id}`);
            }
            return null;
          }
          if (isNaN(delta) || delta === 0 || Math.abs(delta) > 999) {
            // ALTERAÇÃO: Removido console.warn em produção
            if (typeof window !== 'undefined' && window.DEBUG_MODE) {
              console.warn(`Delta inválido ignorado: ${extra.quantity}`);
            }
            return null;
          }
          return {
            ingredient_id: ingId,
            delta: delta,
          };
        })
        .filter((bm) => bm !== null); // ALTERAÇÃO: Remove entradas inválidas

      // Enviar extras e base_modifications separadamente para o backend
      // IMPORTANTE: REGRA DE CONSUMO PROPORCIONAL POR QUANTIDADE
      // O backend multiplica automaticamente o consumo por quantity:
      // - Receita base: consumo_receita × quantity
      // - Extras: quantity_extra × BASE_PORTION_QUANTITY × quantity (convertido para STOCK_UNIT)
      // - Base modifications: delta × BASE_PORTION_QUANTITY × quantity (convertido para STOCK_UNIT)
      // 
      // Exemplo: quantity = 2, extra com quantity_extra = 3 (3 porções extras):
      // - Backend: 3 porções × 30g × 2 unidades = 180g → 0.18kg total
      const capacityData = await simulateProductCapacity(
        state.productId,
        extras,
        state.quantity, // IMPORTANTE: Backend usa isso para multiplicar todo o consumo
        baseModifications
      );

      const maxQuantity = capacityData?.max_quantity ?? 99;

      // Armazenar capacidade máxima do produto no estado para usar na renderização
      state.productMaxQuantity = maxQuantity;


      // Atualizar limites na UI
      updateQuantityLimits(maxQuantity, capacityData);

      // CORREÇÃO: NÃO exibir mensagem quando a quantidade já está no limite
      // A mensagem deve aparecer apenas quando o usuário tenta aumentar a quantidade
      // Quando a quantidade já está no limite, apenas desabilitamos os botões de aumentar insumos
      // Isso permite que o usuário continue editando (diminuir insumos, ajustar notas, etc.)
      // sem ser incomodado por mensagens desnecessárias

      return capacityData;
    } catch (error) {
      // ALTERAÇÃO: Removido console.error em produção
      // TODO: REVISAR - Implementar logging estruturado condicional (apenas em modo debug)
      if (typeof window !== 'undefined' && window.DEBUG_MODE) {
        console.error("Erro ao atualizar capacidade:", error);
      }
      // Em caso de erro, não bloquear a interface
      return null;
    } finally {
      // ALTERAÇÃO: Desativar loading state
      state.isUpdatingCapacity = false;
    }
  }

  /**
   * Versão com debounce de updateProductCapacity para chamadas não críticas
   * ALTERAÇÃO: Evita muitas requisições simultâneas durante interações rápidas do usuário
   * Usar para: mudanças de quantidade, adição/remoção de extras
   * NÃO usar para: validação antes de adicionar ao carrinho (usar updateProductCapacity com immediate=true)
   * 
   * NOTA: O debounce é aplicado na chamada da função, não no retorno da Promise.
   * Isso significa que múltiplas chamadas rápidas resultarão em apenas uma execução após 500ms.
   */
  const debouncedUpdateProductCapacity = debounce(
    (showMessage = false) => {
      // Chamar sem await para não bloquear, o debounce já controla a execução
      updateProductCapacity(showMessage, false).catch(() => {
        // Erros já são tratados dentro de updateProductCapacity
      });
    },
    500 // Aguardar 500ms após última mudança antes de validar
  );

  /**
   * Atualiza os limites de quantidade na interface
   * @param {number} maxQuantity - Quantidade máxima permitida
   * @param {Object} capacityData - Dados completos da capacidade
   */
  function updateQuantityLimits(maxQuantity, capacityData) {
    try {
      // ALTERAÇÃO: Remover indicador de loading se estiver visível
      const loadingIndicator = document.querySelector('.capacity-loading-indicator');
      if (loadingIndicator) {
        loadingIndicator.remove();
      }

      // CORREÇÃO: Habilitar/desabilitar botão de aumentar quantidade
      // IMPORTANTE: Permitir aumentar quantidade mesmo quando está no limite para permitir alternar
      // A validação final será feita no momento de adicionar/atualizar no carrinho
      // Isso permite alternar entre quantidades durante a edição (ex: 2->1->2)
      if (el.qtdMais) {
        // CORREÇÃO: Se maxQuantity for 0 ou null, ainda permitir aumentar para permitir alternar
        // A validação será feita quando tentar adicionar ao carrinho
        // Isso permite que o usuário alterne entre quantidades mesmo quando o estoque está limitado
        if (maxQuantity > 0 && state.quantity >= maxQuantity) {
          el.qtdMais.disabled = true;
          el.qtdMais.classList.add("disabled");
          el.qtdMais.style.pointerEvents = "none";
          el.qtdMais.style.opacity = "0.5";
          el.qtdMais.setAttribute("title", "Limite de estoque atingido");
        } else {
          el.qtdMais.disabled = false;
          el.qtdMais.classList.remove("disabled");
          el.qtdMais.style.pointerEvents = "auto";
          el.qtdMais.style.opacity = "1";
          el.qtdMais.removeAttribute("title");
        }
      }

      // Atualizar input de quantidade com max
      if (el.qtdTexto) {
        el.qtdTexto.setAttribute("max", maxQuantity);
      }

      // CORREÇÃO: NÃO ajustar automaticamente a quantidade do produto quando está no limite
      // O usuário deve ter controle total sobre a quantidade, apenas bloqueamos o botão de aumentar
      // Quando a quantidade já está no limite ou acima, apenas desabilitamos o botão de aumentar quantidade
      // e os botões de aumentar insumos (que já são desabilitados individualmente baseado em max_quantity)
      // Isso permite que o usuário continue editando (diminuir insumos, ajustar notas) sem interferência
    } catch (err) {
      // ALTERAÇÃO: Removido console.warn em produção
      // TODO: REVISAR - Implementar logging estruturado condicional (apenas em modo debug)
      if (typeof window !== 'undefined' && window.DEBUG_MODE) {
        console.warn("Erro ao atualizar limites de quantidade:", err);
      }
    }
  }

  /**
   * Exibe mensagem de limite de estoque usando o sistema de alertas
   * Separa informações do produto das informações do insumo
   * @param {Object} limitingIngredient - Dados do ingrediente limitante
   * @param {number} maxQuantity - Quantidade máxima do produto
   */
  function showStockLimitMessage(limitingIngredient, maxQuantity) {
    if (!limitingIngredient) return;
    
    const ingredientName = limitingIngredient.name || "Ingrediente desconhecido";
    const availableStock = limitingIngredient.available ?? limitingIngredient.available_stock ?? 0;
    const stockUnit = limitingIngredient.unit || limitingIngredient.stock_unit || "un";
    
    // Formatar mensagem separando informações do produto e do insumo
    let productInfo = "";
    if (maxQuantity === 1) {
      productInfo = `Limite de ${maxQuantity} unidade do produto`;
    } else if (maxQuantity > 1) {
      productInfo = `Limite de ${maxQuantity} unidades do produto`;
    } else {
      productInfo = "Produto indisponível";
    }
    
    // Informações do insumo formatadas separadamente
    const ingredientInfo = `Insumo limitante: ${ingredientName}\nEstoque disponível: ${availableStock.toFixed(2)} ${stockUnit}`;
    
    // Mensagem formatada com informações claramente separadas
    const message = `${productInfo}\n\n${ingredientInfo}`;
    
    // Usar o sistema de alertas do projeto
    showToast(message, {
      type: "warning",
      title: "Limite de Estoque Atingido",
      autoClose: 6000,
      noButtons: true
    });
  }

  /**
   * Oculta mensagem de limite de estoque (não necessário com sistema de alertas)
   */
  function hideStockLimitMessage() {
    // Não é necessário fazer nada, pois o sistema de alertas gerencia o fechamento automaticamente
  }

  function attachQuantityHandlers() {
    if (el.qtdMenos) {
      el.qtdMenos.addEventListener("click", async () => {
        if (state.quantity > 1) {
          const oldQuantity = state.quantity;
          state.quantity -= 1;
          
          // ALTERAÇÃO: Removido console.log em produção
          // TODO: REVISAR - Implementar logging estruturado condicional (apenas em modo debug)
          
          updateTotals();
          toggleQtdMinusState();
          
          // Atualizar capacidade silenciosamente (não exibir mensagem ao diminuir)
          // ALTERAÇÃO: Usar debounce para evitar muitas requisições durante interações rápidas
          debouncedUpdateProductCapacity(false);
          
          // IMPORTANTE: Recarregar ingredientes da API quando quantity muda para atualizar max_quantity
          // CORREÇÃO: Sempre chamar loadIngredientes diretamente (não usar ingredients do produto)
          // loadIngredientes já busca da API com quantity atual e calcula max_quantity corretamente
          if (state.productId) {
            try {
              await loadIngredientes(state.productId);
            } catch (err) {
              // ALTERAÇÃO: Log condicional apenas em modo debug
              if (typeof window !== 'undefined' && window.DEBUG_MODE) {
                console.error('[QUANTITY DECREASE] Erro ao recarregar ingredientes:', err);
              }
            }
          }
          
          // AJUSTE: Re-renderizar listas para atualizar limites de estoque
          renderMonteSeuJeitoList();
          renderExtrasModal();
        }
      });
    }
    if (el.qtdMais) {
      el.qtdMais.addEventListener("click", async () => {
        // CORREÇÃO: Permitir aumentar quantidade para permitir alternar entre quantidades
        // A validação será feita quando tentar adicionar ao carrinho
        // Isso permite que o usuário alterne entre quantidades mesmo quando o estoque está limitado
        state.quantity += 1;
        updateTotals();
        toggleQtdMinusState();
        // Atualizar capacidade e exibir mensagem apenas se estiver no limite após o aumento
        // ALTERAÇÃO: Usar debounce para evitar muitas requisições durante interações rápidas
        debouncedUpdateProductCapacity(true);
        // IMPORTANTE: Recarregar ingredientes da API quando quantity muda para atualizar max_quantity
        // CORREÇÃO: Sempre chamar loadIngredientes diretamente (não usar ingredients do produto)
        // loadIngredientes já busca da API com quantity atual e calcula max_quantity corretamente
        if (state.productId) {
          try {
              await loadIngredientes(state.productId);
            } catch (err) {
              // ALTERAÇÃO: Removido console.warn em produção
              // TODO: REVISAR - Implementar logging estruturado condicional (apenas em modo debug)
              if (typeof window !== 'undefined' && window.DEBUG_MODE) {
                console.warn('Erro ao recarregar ingredientes:', err);
              }
            }
        }
        // AJUSTE: Re-renderizar listas para atualizar limites de estoque
        renderMonteSeuJeitoList();
        renderExtrasModal();
      });
    }
    toggleQtdMinusState();
  }

  function toggleQtdMinusState() {
    if (!el.qtdMenos) return;
    if (state.quantity <= 1) {
      el.qtdMenos.disabled = true;
      el.qtdMenos.classList.add("dessativo", "disabled");
      el.qtdMenos.style.pointerEvents = "none";
      el.qtdMenos.style.opacity = "0.5";
    } else {
      el.qtdMenos.disabled = false;
      el.qtdMenos.classList.remove("dessativo", "disabled");
      el.qtdMenos.style.pointerEvents = "auto";
      el.qtdMenos.style.opacity = "1";
    }
  }

  function renderMonteSeuJeitoList() {
    if (!el.listaExtrasContainer) return;

    const ingredientes = state.ingredientesPorcaoBase;
    if (!ingredientes || ingredientes.length === 0) {
      el.listaExtrasContainer.innerHTML =
        '<p class="sem-ingredientes">Nenhum ingrediente disponível</p>';
      return;
    }

    const toBRL = (v) => `+ ${formatBRL(parseFloat(v) || 0)}`;

    // CORREÇÃO: Exibir apenas ingredientes que podem ser ajustados (min !== max)
    // Se min === max, significa que não há flexibilidade para alterar porções
    // Esses ingredientes não devem aparecer na interface de edição
    // ALTERAÇÃO: Comparar valores originais da API ANTES de qualquer ajuste
    const ajustaveis = ingredientes.filter((ing) => {
      const basePortions = parseFloat(ing.portions || 1) || 1;
      
      // ALTERAÇÃO: Obter valores originais diretamente da API sem ajustes
      // IMPORTANTE: Comparar os valores brutos da API para determinar se há flexibilidade
      const minQuantityRaw = ing.min_quantity;
      const maxQuantityRaw = ing.max_quantity;
      
      // Converter para números para comparação
      // Se min_quantity não está definido, usar basePortions como padrão
      const minQuantityOriginal = (minQuantityRaw !== null && minQuantityRaw !== undefined && Number.isFinite(parseFloat(minQuantityRaw)))
        ? parseFloat(minQuantityRaw)
        : basePortions;
      
      // ALTERAÇÃO: Tratar max_quantity = 0 como caso especial
      // Se max_quantity é 0, significa que não há estoque disponível
      // Se min_quantity > 0 e max_quantity = 0, não há flexibilidade (não exibir)
      let maxQuantityOriginal;
      if (maxQuantityRaw === null || maxQuantityRaw === undefined) {
        // Se null/undefined, considerar como flexível (pode adicionar)
        maxQuantityOriginal = basePortions + 999;
      } else {
        const parsedMax = parseFloat(maxQuantityRaw);
        if (!Number.isFinite(parsedMax)) {
          // Se não é um número válido, considerar como flexível
          maxQuantityOriginal = basePortions + 999;
        } else if (parsedMax === 0) {
          // ALTERAÇÃO: max_quantity = 0 significa sem estoque disponível
          // Se min_quantity > 0, não há flexibilidade (não exibir)
          maxQuantityOriginal = 0;
        } else {
          maxQuantityOriginal = parsedMax;
        }
      }
      
      // ALTERAÇÃO: Comparação estrita - se min === max, não exibir
      // Usar comparação com tolerância para valores de ponto flutuante
      const tolerance = 0.001;
      const minValid = Number.isFinite(minQuantityOriginal);
      const maxValid = Number.isFinite(maxQuantityOriginal);
      
      // Se algum valor não é válido, não exibir (mais seguro)
      if (!minValid || !maxValid) {
        return false;
      }
      
      // ALTERAÇÃO: Casos especiais onde não deve exibir:
      // 1. Se min === max (dentro da tolerância)
      // 2. Se max = 0 e min > 0 (sem estoque e não pode reduzir)
      const areEqual = Math.abs(minQuantityOriginal - maxQuantityOriginal) <= tolerance;
      const isMaxZeroWithMinPositive = maxQuantityOriginal === 0 && minQuantityOriginal > 0;
      
      // ALTERAÇÃO: Retornar false se forem iguais OU se max=0 e min>0 (não exibir)
      // CORREÇÃO: Garantir que a comparação funcione corretamente mesmo com valores iguais
      if (areEqual || isMaxZeroWithMinPositive) {
        return false; // Não exibir se min === max ou se max=0 e min>0
      }
      return true; // Exibir se min !== max e não for caso especial
    });

    if (ajustaveis.length === 0) {
      el.listaExtrasContainer.innerHTML =
        '<p class="sem-ingredientes">Nenhum ingrediente disponível para ajuste</p>';
      return;
    }

    // SECURITY FIX: Sanitização de nomes
    el.listaExtrasContainer.innerHTML = ajustaveis
      .map((ing) => {
        const ingId = ing.ingredient_id || ing.id;
        const ingName = escapeHTML(
          ing.name || ing.ingredient_name || "Ingrediente"
        );
        const ingPrice =
          toNum(ing.additional_price) ?? resolveAdditionalPrice(ing) ?? 0;
        const basePortions = parseFloat(ing.portions || 1) || 1;
        const minQuantity = Number.isFinite(parseFloat(ing.min_quantity))
          ? parseFloat(ing.min_quantity)
          : basePortions;
        // CORREÇÃO: max_quantity já vem calculado da API considerando estoque e regras
        // IMPORTANTE: max_quantity pode ser null, 0, ou um número positivo
        // - null/undefined: usar valor alto para permitir adicionar (ainda não calculado)
        // - 0: não há estoque disponível, mas permite editar removendo (effectiveQty >= basePortions)
        // - número positivo: há estoque disponível
        let maxQuantity;
        if (ing.max_quantity === null || ing.max_quantity === undefined || !Number.isFinite(parseFloat(ing.max_quantity))) {
          // Se null ou undefined, usar valor alto para permitir adicionar extras
          maxQuantity = (basePortions * (state.quantity || 1)) + 999;
        } else {
          maxQuantity = parseFloat(ing.max_quantity);
          // Se max_quantity for 0, garantir pelo menos basePortions para permitir remoção
          // Isso permite editar removendo porções mesmo sem estoque para adicionar
          const minForEditing = basePortions * (state.quantity || 1);
          if (maxQuantity < minForEditing) {
            maxQuantity = minForEditing; // Mínimo para permitir edição removendo
          }
        }

        const extra = state.extrasById.get(ingId);
        const extraQty = extra?.quantity || 0;
        // CORREÇÃO: effectiveQty deve considerar quantity do produto
        // basePortions é por unidade, então precisa multiplicar por state.quantity
        const effectiveQty = (basePortions * (state.quantity || 1)) + extraQty;

        // CORREÇÃO: Usar diretamente max_quantity da API (já considera estoque e regras)
        // A API já calcula o menor entre a regra e o estoque disponível para cada ingrediente
        // Cada ingrediente é avaliado individualmente: se ainda tem estoque (effectiveQty < maxQuantity),
        // permite adicionar, mesmo que o produto já esteja no limite de estoque
        // Apenas ingredientes que não têm mais estoque são desabilitados
        let canIncrement = effectiveQty < maxQuantity;

        const showMinus = effectiveQty > minQuantity;
        const showPlus = canIncrement;

        // CORREÇÃO: Adicionar classe CSS quando limite é atingido (max_quantity já considera estoque)
        const stockLimitedClass = !showPlus ? ' stock-limited' : '';

        // ALTERAÇÃO: Escapar atributos data-* e title para prevenir XSS
        const titleAttr = !showPlus ? ` title="${escapeAttribute('Limite atingido')}"` : '';
        const titlePlusAttr = !showPlus ? ` title="${escapeAttribute('Limite de estoque atingido')}"` : '';
        const minusDisabledStyle = !showMinus ? 'style="opacity: 0.5; pointer-events: none; cursor: not-allowed;"' : 'style="cursor: pointer;"';
        const plusDisabledStyle = !showPlus ? 'style="opacity: 0.5; pointer-events: none; cursor: not-allowed;"' : 'style="cursor: pointer;"';
        
        return `
            <div class="item${stockLimitedClass}" 
                 data-ingrediente-id="${escapeAttribute(String(ingId))}" 
                 data-preco="${escapeAttribute(String(ingPrice))}" 
                 data-porcoes="${escapeAttribute(String(basePortions))}"
                 data-min-qty="${escapeAttribute(String(minQuantity))}"
                 data-max-qty="${escapeAttribute(String(maxQuantity))}"
                 ${titleAttr}>
              <div class="item-adicional-container">
                <p class="nome-adicional">${ingName}</p>
                <p class="preco-adicional">${toBRL(ingPrice)}</p>
              </div>
              <div class="quantidade">
                <i class="fa-solid fa-minus${!showMinus ? ' dessativo disabled' : ''}" ${minusDisabledStyle} aria-label="${!showMinus ? escapeAttribute('Não é possível diminuir') : escapeAttribute('Diminuir quantidade')}"></i>
                <p class="qtd-extra">${String(effectiveQty).padStart(2, "0")}</p>
                <i class="fa-solid fa-plus${!showPlus ? ' dessativo disabled' : ''}" ${plusDisabledStyle}${titlePlusAttr} aria-label="${!showPlus ? escapeAttribute('Limite de estoque atingido') : escapeAttribute('Aumentar quantidade')}"></i>
              </div>
            </div>`;
      })
      .join("");

    attachIngredienteHandlers(el.listaExtrasContainer);
  }

  function renderExtrasModal() {
    if (!el.listaExtrasModal) return;

    const ingredientes = state.ingredientesExtras;
    if (!ingredientes || ingredientes.length === 0) {
      el.listaExtrasModal.innerHTML =
        '<p class="sem-extras">Nenhum extra disponível no momento</p>';
      return;
    }

    const toBRL = (v) => `+ ${formatBRL(parseFloat(v) || 0)}`;

    // SECURITY FIX: Sanitização de nomes
    el.listaExtrasModal.innerHTML = ingredientes
      .map((ing) => {
        const ingId = ing.ingredient_id || ing.id;
        const ingName = escapeHTML(
          ing.name || ing.ingredient_name || "Ingrediente"
        );
        const ingPrice =
          toNum(ing.additional_price) ?? resolveAdditionalPrice(ing) ?? 0;
        const basePortions = 0;
        const minQuantity = Number.isFinite(parseFloat(ing.min_quantity))
          ? parseFloat(ing.min_quantity)
          : 0;
        // CORREÇÃO: max_quantity pode ser null, 0, ou um número positivo
        // Se null ou undefined, usar valor alto para permitir adicionar
        // Se 0, significa que não há estoque, mas permite editar removendo
        let maxQuantity;
        if (ing.max_quantity === null || ing.max_quantity === undefined || !Number.isFinite(parseFloat(ing.max_quantity))) {
          maxQuantity = 999; // Se null, permitir adicionar muitos extras
        } else {
          maxQuantity = parseFloat(ing.max_quantity);
          // Se max_quantity for 0, garantir pelo menos 0 para permitir remoção
          // Isso permite editar removendo porções mesmo sem estoque para adicionar
          if (maxQuantity < 0) {
            maxQuantity = 0; // Mínimo para permitir edição removendo
          }
        }

        const extra = state.extrasById.get(ingId);
        const extraQty = extra?.quantity || 0;
        // CORREÇÃO: effectiveQty deve considerar quantity do produto
        // basePortions é por unidade, então precisa multiplicar por state.quantity
        const effectiveQty = (basePortions * (state.quantity || 1)) + extraQty;

        // AJUSTE: Validar estoque disponível considerando current_stock e porções base
        // CORREÇÃO: Usar diretamente max_quantity da API (já considera estoque e regras)
        // A API já calcula o menor entre a regra e o estoque disponível para cada ingrediente
        // Cada ingrediente é avaliado individualmente: se ainda tem estoque (effectiveQty < maxQuantity),
        // permite adicionar, mesmo que o produto já esteja no limite de estoque
        // Apenas ingredientes que não têm mais estoque são desabilitados
        let canIncrement = effectiveQty < maxQuantity;

        const showMinus = effectiveQty > minQuantity;
        const showPlus = canIncrement;

        // CORREÇÃO: Adicionar classe CSS quando limite é atingido (max_quantity já considera estoque)
        const stockLimitedClass = !showPlus ? ' stock-limited' : '';

        // ALTERAÇÃO: Escapar atributos data-* e title para prevenir XSS
        const titleAttr = !showPlus ? ` title="${escapeAttribute('Limite atingido')}"` : '';
        const titlePlusAttr = !showPlus ? ` title="${escapeAttribute('Limite de estoque atingido')}"` : '';
        const minusDisabledStyle = !showMinus ? 'style="opacity: 0.5; pointer-events: none; cursor: not-allowed;"' : 'style="cursor: pointer;"';
        const plusDisabledStyle = !showPlus ? 'style="opacity: 0.5; pointer-events: none; cursor: not-allowed;"' : 'style="cursor: pointer;"';
        
        return `
            <div class="item${stockLimitedClass}" 
                 data-ingrediente-id="${escapeAttribute(String(ingId))}" 
                 data-preco="${escapeAttribute(String(ingPrice))}" 
                 data-porcoes="${escapeAttribute(String(basePortions))}"
                 data-min-qty="${escapeAttribute(String(minQuantity))}"
                 data-max-qty="${escapeAttribute(String(maxQuantity))}"
                 ${titleAttr}>
              <div class="item-adicional-container">
                <p class="nome-adicional">${ingName}</p>
                <p class="preco-adicional">${toBRL(ingPrice)}</p>
              </div>
              <div class="quantidade">
                <i class="fa-solid fa-minus${!showMinus ? ' dessativo disabled' : ''}" ${minusDisabledStyle} aria-label="${!showMinus ? escapeAttribute('Não é possível diminuir') : escapeAttribute('Diminuir quantidade')}"></i>
                <p class="qtd-extra">${String(effectiveQty).padStart(2, "0")}</p>
                <i class="fa-solid fa-plus${!showPlus ? ' dessativo disabled' : ''}" ${plusDisabledStyle}${titlePlusAttr} aria-label="${!showPlus ? escapeAttribute('Limite de estoque atingido') : escapeAttribute('Aumentar quantidade')}"></i>
              </div>
            </div>`;
      })
      .join("");

    attachIngredienteHandlers(el.listaExtrasModal);
  }

  function attachIngredienteHandlers(container) {
    if (!container) return;

    // Limpar cleanup anteriores deste container
    if (cleanupDelegates.has(container)) {
      cleanupDelegates.get(container).forEach((cleanup) => cleanup());
      cleanupDelegates.delete(container);
    }

    const containerCleanups = [];

    // Helper para processar clique em botão de ingrediente
    async function handleIngredientButtonClick(e, isMinus) {
      const button = e.target.closest(".fa-minus, .fa-plus");
      if (!button) return;

      // Bloquear clique se botão estiver desabilitado
      if (button.classList.contains("dessativo") || button.classList.contains("disabled")) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      const itemEl = button.closest(".item");
      if (!itemEl) return;

      // SECURITY FIX: Validação de ID
      const rawId = itemEl.getAttribute("data-ingrediente-id");
      const id = validateIngredientId(rawId);
      if (!id) return;

      // SECURITY FIX: Validação de preço
      const price = Math.max(
        0,
        parseFloat(itemEl.getAttribute("data-preco")) || 0
      );
      const basePortions = Math.max(
        0,
        parseFloat(itemEl.getAttribute("data-porcoes")) || 0
      );
      const minQuantity = parseFloat(itemEl.getAttribute("data-min-qty"));
      // CORREÇÃO: Buscar max_quantity atualizado de state.ingredientes (já considera quantity do produto)
      // O atributo data-max-qty pode estar desatualizado se a quantidade do produto mudou
      const ingredientFromState = state.ingredientes.find(
        (ing) => (ing.ingredient_id || ing.id) === id
      );
      const maxQuantity = ingredientFromState && Number.isFinite(parseFloat(ingredientFromState.max_quantity))
        ? parseFloat(ingredientFromState.max_quantity)
        : parseFloat(itemEl.getAttribute("data-max-qty")) || basePortions + 999;

      const qtdEl = itemEl.querySelector(".qtd-extra");
      const nomeEl = itemEl.querySelector(".nome-adicional");

      // CORREÇÃO: max_quantity já vem calculado da API considerando estoque, regras E quantidade do produto
      // IMPORTANTE: Usar max_quantity de state.ingredientes que está sempre atualizado

      // Garantir que o extra existe no state e atualizar maxQuantity se necessário
      if (!state.extrasById.has(id)) {
        state.extrasById.set(id, {
          id,
          name: nomeEl?.textContent || "Ingrediente",
          price,
          quantity: 0,
          basePortions,
          minQuantity,
          maxQuantity,
        });
      } else {
        // Atualizar maxQuantity do extra existente com o valor atualizado
        const existingExtra = state.extrasById.get(id);
        existingExtra.maxQuantity = maxQuantity;
        existingExtra.minQuantity = minQuantity;
      }

      const extra = state.extrasById.get(id);
      // CORREÇÃO CRÍTICA: effectiveQty deve considerar quantity do produto
      // basePortions é por unidade, então precisa multiplicar por state.quantity
      // Fórmula: effectiveQty = (basePortions × quantity) + extraQuantity
      const effectiveQty = (basePortions * (state.quantity || 1)) + extra.quantity;

      // ALTERAÇÃO: Removido console.log em produção
      // TODO: REVISAR - Implementar logging estruturado condicional (apenas em modo debug)

      // CORREÇÃO: Validação simplificada usando apenas max_quantity da API
      if (isMinus && effectiveQty > minQuantity) {
        extra.quantity -= 1;
        // CORREÇÃO: newEffective deve considerar quantity do produto
        const newEffective = (basePortions * (state.quantity || 1)) + extra.quantity;
        if (qtdEl) qtdEl.textContent = String(newEffective).padStart(2, "0");
        updateTotals();

        if (basePortions > 0) {
          renderMonteSeuJeitoList();
        } else {
          renderExtrasModal();
        }
        if (basePortions === 0) updateExtrasBadge();
        
        // Atualizar capacidade silenciosamente ao remover ingrediente (não exibir mensagem)
        // ALTERAÇÃO: Usar debounce para evitar muitas requisições durante interações rápidas
        debouncedUpdateProductCapacity(false);
      } else if (!isMinus) {
        // CORREÇÃO: Validar usando max_quantity atualizado de state.ingredientes
        // (já considera quantity do produto e consumo acumulado)
        // Cada ingrediente é validado individualmente baseado no seu próprio estoque disponível
        const wouldBeEffectiveQty = effectiveQty + 1;
        
        // IMPORTANTE: Buscar maxQuantity atualizado de state.ingredientes (já considera quantity do produto)
        // Sempre buscar o valor mais atualizado, pois pode ter mudado após alterar quantity
        const ingredientCurrent = state.ingredientes.find(
          (ing) => (ing.ingredient_id || ing.id) === id
        );
        const currentMaxQuantity = ingredientCurrent && Number.isFinite(parseFloat(ingredientCurrent.max_quantity))
          ? parseFloat(ingredientCurrent.max_quantity)
          : (extra.maxQuantity || maxQuantity);
        
        // ALTERAÇÃO: Removido console.log em produção
        // TODO: REVISAR - Implementar logging estruturado condicional (apenas em modo debug)
        
        // CORREÇÃO: Usar <= (menor ou igual) para permitir adicionar quando wouldBeEffectiveQty <= maxQuantity
        // Se wouldBeEffectiveQty <= maxQuantity, pode adicionar (ainda tem estoque disponível)
        // Se wouldBeEffectiveQty > maxQuantity, não pode adicionar (ultrapassou o limite)
        const canAdd = wouldBeEffectiveQty <= currentMaxQuantity;
        
        // Se ultrapassou o limite do ingrediente, exibir mensagem de estoque insuficiente
        if (!canAdd || wouldBeEffectiveQty > currentMaxQuantity) {
          // ALTERAÇÃO: Removido console.log em produção
          const ingredientName = extra.name || nomeEl?.textContent || "Ingrediente";
          showToast(
            `Estoque insuficiente de ${ingredientName}. Limite atingido.`,
            {
              type: "warning",
              title: "Estoque Insuficiente",
              autoClose: 4000,
              noButtons: true
            }
          );
          return;
        }

        extra.quantity += 1;
        // CORREÇÃO: newEffective deve considerar quantity do produto
        const newEffective = (basePortions * (state.quantity || 1)) + extra.quantity;
        if (qtdEl) qtdEl.textContent = String(newEffective).padStart(2, "0");
        updateTotals();

        if (basePortions > 0) {
          renderMonteSeuJeitoList();
        } else {
          renderExtrasModal();
        }
        if (basePortions === 0) updateExtrasBadge();
        
        // Atualizar capacidade silenciosamente após adicionar
        // ALTERAÇÃO: Usar debounce para evitar muitas requisições durante interações rápidas
        debouncedUpdateProductCapacity(false);
      }
    }

    const cleanupMinus = delegate(container, "click", ".fa-minus", (e) =>
      handleIngredientButtonClick(e, true)
    );
    containerCleanups.push(cleanupMinus);

    const cleanupPlus = delegate(container, "click", ".fa-plus", (e) =>
      handleIngredientButtonClick(e, false)
    );
    containerCleanups.push(cleanupPlus);

    // Armazenar cleanups deste container
    cleanupDelegates.set(container, containerCleanups);

    // Atualizar estados dos botões após renderização
    container.querySelectorAll(".item").forEach((itemEl) => {
      const rawId = itemEl.getAttribute("data-ingrediente-id");
      const id = validateIngredientId(rawId);
      if (!id) return;

      const basePortions = Math.max(
        0,
        parseFloat(itemEl.getAttribute("data-porcoes")) || 0
      );
      
      // CORREÇÃO: Buscar max_quantity e min_quantity atualizados de state.ingredientes
      // (já considera quantity do produto e consumo acumulado)
      // O atributo data-max-qty pode estar desatualizado se a quantidade do produto mudou
      const ingredient = state.ingredientes.find(
        (ing) => (ing.ingredient_id || ing.id) === id
      );
      
      const maxQuantityFromState = ingredient && Number.isFinite(parseFloat(ingredient.max_quantity))
        ? parseFloat(ingredient.max_quantity)
        : null;
      const maxQuantityFromAttr = parseFloat(itemEl.getAttribute("data-max-qty")) || basePortions + 999;
      const maxQuantity = maxQuantityFromState !== null ? maxQuantityFromState : maxQuantityFromAttr;
      
      const minQuantityFromState = ingredient && Number.isFinite(parseFloat(ingredient.min_quantity))
        ? parseFloat(ingredient.min_quantity)
        : null;
      const minQuantityFromAttr = parseFloat(itemEl.getAttribute("data-min-qty")) || basePortions;
      const minQuantity = minQuantityFromState !== null ? minQuantityFromState : minQuantityFromAttr;

      const minus = itemEl.querySelector(".fa-minus");
      const plus = itemEl.querySelector(".fa-plus");

      // AJUSTE: Buscar informações de estoque do ingrediente
      const maxAvailable = ingredient?.max_available ?? null;
      const limitedByStock = ingredient?.limited_by === 'stock' || ingredient?.limited_by === 'both';
      const currentStock = ingredient?.current_stock ?? ingredient?.available_stock ?? null;
      const basePortionQuantity = ingredient?.base_portion_quantity ?? parseFloat(itemEl.getAttribute("data-base-portion-qty")) ?? null;
      const stockUnit = ingredient?.stock_unit ?? itemEl.getAttribute("data-stock-unit") ?? 'un';

      // Garantir que o extra existe e atualizar maxQuantity/minQuantity se necessário
      if (!state.extrasById.has(id)) {
        const nomeEl = itemEl.querySelector(".nome-adicional");
        const price = Math.max(
          0,
          parseFloat(itemEl.getAttribute("data-preco")) || 0
        );
        state.extrasById.set(id, {
          id,
          name: nomeEl?.textContent || "Ingrediente",
          price,
          quantity: 0,
          basePortions,
          minQuantity,
          maxQuantity,
          maxAvailable: maxAvailable,
          limitedByStock: limitedByStock,
          currentStock: currentStock,
          basePortionQuantity: basePortionQuantity,
          stockUnit: stockUnit,
        });
      } else {
        // Atualizar maxQuantity e minQuantity do extra existente com valores atualizados
        const existingExtra = state.extrasById.get(id);
        const oldMaxQuantity = existingExtra.maxQuantity;
        existingExtra.maxQuantity = maxQuantity;
        existingExtra.minQuantity = minQuantity;
        
        // ALTERAÇÃO: Removido console.log em produção
        // TODO: REVISAR - Implementar logging estruturado condicional (apenas em modo debug)
        if (oldMaxQuantity !== maxQuantity) {
          // Log removido em produção
        }
      }

      const extra = state.extrasById.get(id);
      // CORREÇÃO CRÍTICA: effectiveQty deve considerar quantity do produto
      // basePortions é por unidade, então precisa multiplicar por state.quantity
      // Fórmula: effectiveQty = (basePortions × quantity) + extraQuantity
      const effectiveQty = (basePortions * (state.quantity || 1)) + extra.quantity;
      
      // ALTERAÇÃO: Removido console.log em produção
      // TODO: REVISAR - Implementar logging estruturado condicional (apenas em modo debug)

      // CORREÇÃO: Usar diretamente max_quantity da API (já considera estoque, regras E quantity do produto)
      // A API já calcula o menor entre a regra e o estoque disponível para cada ingrediente
      // Cada ingrediente é avaliado individualmente: se ainda tem estoque (effectiveQty < maxQuantity),
      // permite adicionar, mesmo que o produto já esteja no limite de estoque
      // Apenas ingredientes que não têm mais estoque são desabilitados
      let canIncrement = effectiveQty < maxQuantity;

      // CORREÇÃO: Habilitar/desabilitar botões em vez de removê-los
      if (minus) {
        if (effectiveQty > minQuantity) {
          minus.disabled = false;
          minus.classList.remove("disabled", "dessativo");
          minus.style.pointerEvents = "auto";
          minus.style.opacity = "1";
          minus.style.cursor = "pointer";
        } else {
          minus.disabled = true;
          minus.classList.add("disabled", "dessativo");
          minus.style.pointerEvents = "none";
          minus.style.opacity = "0.5";
          minus.style.cursor = "not-allowed";
        }
      }
      if (plus) {
        if (canIncrement) {
          plus.disabled = false;
          plus.classList.remove("disabled", "dessativo");
          plus.style.pointerEvents = "auto";
          plus.style.opacity = "1";
          plus.style.cursor = "pointer";
          plus.removeAttribute("title");
        } else {
          plus.disabled = true;
          plus.classList.add("disabled", "dessativo");
          plus.style.pointerEvents = "none";
          plus.style.opacity = "0.5";
          plus.style.cursor = "not-allowed";
          plus.setAttribute("title", "Limite de estoque atingido");
        }
      }
    });
  }

  function openExtrasModal() {
    if (!el.modalExtras) return;
    renderExtrasModal();
    try {
      if (window.abrirModal) {
        window.abrirModal("modal-extras");
      } else {
        el.modalExtras.style.display = "flex";
        el.modalExtras.style.opacity = "1";
      }
    } catch (err) {
      // Fallback silencioso mantido por compatibilidade
      el.modalExtras.style.display = "flex";
      el.modalExtras.style.opacity = "1";
    }
  }

  function closeExtrasModal() {
    if (!el.modalExtras) return;
    try {
      if (window.fecharModal) {
        window.fecharModal("modal-extras");
      } else {
        el.modalExtras.style.display = "none";
        el.modalExtras.style.opacity = "0";
      }
    } catch (err) {
      // Fallback silencioso mantido por compatibilidade
      el.modalExtras.style.display = "none";
      el.modalExtras.style.opacity = "0";
    }
  }

  function attachExtrasButton() {
    if (!el.btnExtras) return;
    el.btnExtras.addEventListener("click", () => {
      openExtrasModal();
    });

    const btnSalvar = $id("btn-salvar-extras");
    if (btnSalvar) {
      btnSalvar.addEventListener("click", () => {
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
    el.obsInput.addEventListener("input", update);
    update();
  }

  function attachAddToCart() {
    if (!el.btnAdicionarCesta) return;

    // Atualizar texto do botão se estiver editando
    if (state.isEditing) {
      el.btnAdicionarCesta.textContent = "Atualizar na cesta";
    }

    el.btnAdicionarCesta.addEventListener("click", async () => {
      try {
        // ALTERAÇÃO: Validar se o usuário pode adicionar itens ao carrinho antes de prosseguir
        const user = getStoredUser();
        const token = localStorage.getItem('rb.token') || localStorage.getItem('authToken');
        const isAuth = !!token;
        
        // Se estiver logado, verifica o role
        if (isAuth && user) {
          const userRole = (user.role || user.profile || user.type || user.user_type || 'customer').toLowerCase();
          const allowedRoles = ['cliente', 'customer', 'atendente', 'attendant'];
          const isAllowed = allowedRoles.includes(userRole);
          
          if (!isAllowed) {
            // Exibir mensagem de erro personalizada
            showToast(
              'Apenas clientes e atendentes podem adicionar itens à cesta.',
              {
                type: "error",
                title: "Permissão Negada",
                autoClose: 5000,
              }
            );
            return; // Impede a execução da função
          }
        }
        
        // Desabilitar botão durante operação
        el.btnAdicionarCesta.disabled = true;
        el.btnAdicionarCesta.textContent = state.isEditing
          ? "Atualizando..."
          : "Adicionando...";

        // CORREÇÃO: Validar capacidade tanto ao adicionar quanto ao editar
        // Ao editar, também precisa validar capacidade pois o usuário pode ter alterado quantidade/extras
        // O backend vai validar a atualização considerando o estoque disponível
        // ALTERAÇÃO: Usar immediate=true para validação crítica antes de adicionar ao carrinho
        const capacityData = await updateProductCapacity(false, true);

        if (capacityData && capacityData.max_quantity < state.quantity) {
          showToast(
            `Quantidade solicitada (${state.quantity}) excede o disponível (${capacityData.max_quantity}). Ajuste a quantidade ou remova alguns extras.`,
            {
              type: "error",
              title: "Estoque Insuficiente",
              autoClose: 5000,
            }
          );
          // Reabilitar botão
          el.btnAdicionarCesta.disabled = false;
          el.btnAdicionarCesta.textContent = state.isEditing ? "Atualizar na cesta" : "Adicionar à cesta";
          return;
        }

        if (capacityData && !capacityData.is_available) {
          showToast(
            capacityData.limiting_ingredient?.message ||
              "Produto temporariamente indisponível. Tente novamente mais tarde.",
            {
              type: "error",
              title: "Produto Indisponível",
              autoClose: 5000,
            }
          );
          // Reabilitar botão
          el.btnAdicionarCesta.disabled = false;
          el.btnAdicionarCesta.textContent = state.isEditing ? "Atualizar na cesta" : "Adicionar à cesta";
          return;
        }

        // Preparar dados para a API
        // IMPORTANTE: REGRA DE CONSUMO PROPORCIONAL POR QUANTIDADE
        // O backend multiplica automaticamente o consumo por quantidade:
        // - Receita base × quantity
        // - Extras × quantity (quantity do extra representa porções extras por unidade)
        // - Base modifications × quantity (delta representa mudança em porções por unidade)
        // 
        // Exemplo: Se quantity = 3 e há 2 extras de bacon (quantity=2 no extra):
        // - Backend calcula: 2 porções × 30g × 3 unidades = 180g total
        const productId = state.product.id;
        const quantity = Math.max(1, parseInt(state.quantity, 10) || 1);

        // EXTRAS: ingredientes fora da receita base (basePortions === 0) com quantity > 0
        // CORREÇÃO: quantity nos extras deve ser TOTAL (não por unidade do produto)
        // O frontend armazena quantity como "por unidade", mas o backend espera TOTAL
        // Então multiplicamos pela quantidade do produto para obter o total
        const extras = Array.from(state.extrasById.values())
          .filter((extra) => (extra?.basePortions ?? 0) === 0)
          .filter(
            (extra) => Number.isFinite(extra.quantity) && extra.quantity > 0
          )
          .map((extra) => {
            const id = parseInt(extra.id, 10);
            const qtyPorUnidade = parseInt(extra.quantity, 10);
            // CORREÇÃO: Multiplicar pela quantidade do produto para obter quantidade total
            // Exemplo: 5 extras por unidade × 5 produtos = 25 extras totais
            const qtyTotal = qtyPorUnidade * quantity;
            return {
              ingredient_id: Number.isInteger(id) && id > 0 ? id : null,
              quantity:
                Number.isInteger(qtyTotal) && qtyTotal > 0 ? Math.min(qtyTotal, 999) : null,
            };
          })
          .filter((e) => e.ingredient_id !== null && e.quantity !== null)
          .slice(0, 10); // respeitar limite máximo de extras

        // BASE_MODIFICATIONS: ingredientes da receita base (basePortions > 0) com delta != 0
        // IMPORTANTE: delta representa mudança em PORÇÕES por unidade do produto
        // O backend multiplica: delta × BASE_PORTION_QUANTITY × quantity_produto
        // Apenas deltas positivos consomem estoque (deltas negativos reduzem ingrediente)
        const base_modifications = Array.from(state.extrasById.values())
          .filter((extra) => (extra?.basePortions ?? 0) > 0)
          .filter(
            (extra) => Number.isFinite(extra.quantity) && extra.quantity !== 0
          )
          .map((extra) => {
            const id = parseInt(extra.id, 10);
            const delta = parseInt(extra.quantity, 10);
            return {
              ingredient_id: Number.isInteger(id) && id > 0 ? id : null,
              delta: Number.isInteger(delta) && delta !== 0 ? delta : null,
            };
          })
          .filter((bm) => bm.ingredient_id !== null && bm.delta !== null);

        const notes = el.obsInput?.value || "";

        let result;

        if (state.isEditing && state.cartItemId) {
          // Atualizar item existente na cesta por cart item id
          result = await updateCartItem(state.cartItemId, {
            quantity,
            extras,
            notes,
            base_modifications,
          });
        } else {
          // Adicionar novo item à cesta
          result = await addToCart(
            productId,
            quantity,
            extras,
            notes,
            base_modifications
          );
        }

        // ALTERAÇÃO: Removido console.log em produção
        // TODO: REVISAR - Implementar logging estruturado condicional (apenas em modo debug)
        
        if (result.success) {
          // Mostrar mensagem de sucesso
          showToast(
            state.isEditing
              ? "Item atualizado na cesta!"
              : "Item adicionado à cesta!",
            {
              type: "success",
              title: state.isEditing ? "Item Atualizado" : "Item Adicionado",
              autoClose: 3000,
            }
          );

          // Definir flag para abrir modal ao chegar no index
          localStorage.setItem("royal_abrir_modal_cesta", "true");

          // Redirecionar para index.html
          setTimeout(() => {
            // Verificar se estamos em uma página de produto
            const currentPath = window.location.pathname;
            if (currentPath.includes("produto.html")) {
              // Se estamos em src/pages/produto.html, voltar para index
              window.location.href = "../../index.html";
            } else {
              // Fallback para outros casos
              window.location.href = "/index.html";
            }
          }, 1000);
        } else {
          // Tratamento específico para erro de estoque
          if (result.errorType === 'INSUFFICIENT_STOCK') {
            // ALTERAÇÃO: Removido console.log em produção
            showToast(result.error || 'Estoque insuficiente', {
              type: "error",
              title: "Estoque Insuficiente",
              autoClose: 5000,
            });
            // Atualizar capacidade para refletir mudanças
            // ALTERAÇÃO: Usar immediate=true para validação crítica após erro de estoque
            await updateProductCapacity(false, true);
          } else {
            throw new Error(result.error || "Erro ao adicionar item à cesta");
          }
        }
      } catch (err) {
        // ALTERAÇÃO: Removido console.error em produção
        // TODO: REVISAR - Implementar logging estruturado condicional (apenas em modo debug)
        if (typeof window !== 'undefined' && window.DEBUG_MODE) {
          console.error("Erro ao adicionar à cesta:", err.message);
        }

        const friendly = getFriendlyAddToCartError(err?.message);
        // Usar showToast diretamente (já importado)
        showToast(friendly, {
          type: "error",
          title: "Não foi possível adicionar",
          autoClose: 5000,
        });
        // ALTERAÇÃO: Removida abertura automática da modal de extras em caso de estoque insuficiente
        // A modal de extras é para adicionar ingredientes, não para resolver falta de estoque
        // O usuário já recebeu uma mensagem de erro explicando o problema
      } finally {
        // Reabilitar botão
        el.btnAdicionarCesta.disabled = false;
        el.btnAdicionarCesta.textContent = state.isEditing
          ? "Atualizar na cesta"
          : "Adicionar à cesta";
      }
    });
  }

  async function loadIngredientes(productId, ingredientsFromProduct = null, forceReload = false) {
    try {
      let productIngredients = [];
      
      // CORREÇÃO: Sempre buscar da API /api/products/{id}/ingredients com quantity atual
      // para garantir que max_quantity está calculado corretamente para a quantity atual
      // IMPORTANTE: Não usar ingredientsFromProduct porque pode ter max_quantity desatualizado
      // A API /api/products/{id}/ingredients é específica para calcular max_quantity considerando quantity
      // REGRA: consumo_total = consumo_por_unidade × quantidade_total_do_produto
      const resp = await getProductIngredients(productId, state.quantity || 1);
      productIngredients = Array.isArray(resp) ? resp : resp?.items || [];
      
      // ALTERAÇÃO: Removido console.log em produção
      // TODO: REVISAR - Implementar logging estruturado condicional (apenas em modo debug)

      // Buscar todos os ingredientes disponíveis apenas para enriquecer dados (fallback)
      // A API já retorna todos os dados necessários, mas usamos como fallback caso algum campo esteja faltando
      let allIngredients = [];
      try {
        const allIngredientsResp = await getIngredients({ page_size: 1000 });
        allIngredients = Array.isArray(allIngredientsResp)
          ? allIngredientsResp
          : allIngredientsResp?.items || [];
        // Atualizar cache
        cacheManager.set(
          CACHE_KEYS.allIngredients,
          allIngredients,
          CACHE_TTL
        );
      } catch (err) {
        // IMPROVEMENT: Silencioso propositalmente - autenticação não obrigatória
        allIngredients = [];
      }

      // CORREÇÃO: Exibir apenas ingredientes vinculados ao produto na tabela PRODUCT_INGREDIENTS
      // A API já retorna apenas os ingredientes vinculados ao produto, então não precisamos adicionar outros
      const enrichedIngredients = productIngredients.map((productIng) => {
        const fullIngredient =
          allIngredients.find(
            (ing) =>
              ing.id === productIng.ingredient_id || ing.id === productIng.id
          ) || {};
        return {
          ...productIng,
          ...fullIngredient,
          ingredient_id: productIng.ingredient_id || productIng.id,
          id: productIng.ingredient_id || productIng.id,
          name:
            productIng.name ||
            fullIngredient.name ||
            productIng.ingredient_name ||
            "Ingrediente",
          additional_price:
            toNum(productIng.additional_price) ??
            resolveAdditionalPrice(productIng) ??
            toNum(fullIngredient?.additional_price) ??
            resolveAdditionalPrice(fullIngredient) ??
            0,
          // AJUSTE: Preservar informações de estoque para validação
          current_stock: productIng.current_stock ?? fullIngredient.current_stock ?? 0,
          max_available: productIng.max_available ?? null,
          limited_by: productIng.limited_by ?? 'rule',
          stock_info: productIng.stock_info ?? null,
          base_portion_quantity: productIng.base_portion_quantity ?? fullIngredient.base_portion_quantity ?? 1,
          stock_unit: productIng.stock_unit ?? fullIngredient.stock_unit ?? 'un',
          // IMPORTANTE: Preservar max_quantity e min_quantity calculados pela API (já consideram quantity do produto)
          // Estes valores são usados para habilitar/desabilitar botões de adicionar ingredientes
          // ALTERAÇÃO: Preservar valores originais da API para comparação correta no filtro
          max_quantity: productIng.max_quantity ?? fullIngredient.max_quantity ?? null,
          min_quantity: productIng.min_quantity ?? fullIngredient.min_quantity ?? null,
        };
      });

      state.ingredientes = enrichedIngredients;

      // ALTERAÇÃO: Removido console.log em produção
      // TODO: REVISAR - Implementar logging estruturado condicional (apenas em modo debug)

      state.ingredientesPorcaoBase = enrichedIngredients.filter((ing) => {
        const portions = parseFloat(ing.portions || 0);
        return portions > 0;
      });

      state.ingredientesExtras = enrichedIngredients.filter((ing) => {
        const portions = parseFloat(ing.portions || 0);
        return portions === 0;
      });
      
      // CORREÇÃO CRÍTICA: Atualizar maxQuantity em state.extrasById quando ingredientes são recarregados
      // Isso garante que quando quantity muda, os valores de maxQuantity são atualizados corretamente
      enrichedIngredients.forEach(ing => {
        const ingId = ing.ingredient_id || ing.id;
        if (state.extrasById.has(ingId)) {
          const extra = state.extrasById.get(ingId);
          // Atualizar maxQuantity e minQuantity com valores atualizados da API
          extra.maxQuantity = ing.max_quantity ?? extra.maxQuantity;
          extra.minQuantity = ing.min_quantity ?? extra.minQuantity;
          state.extrasById.set(ingId, extra);
        }
      });
      
      // ALTERAÇÃO: Removido console.log em produção
      // TODO: REVISAR - Implementar logging estruturado condicional (apenas em modo debug)
    } catch (err) {
      // ALTERAÇÃO: Log condicional apenas em modo debug
      if (typeof window !== 'undefined' && window.DEBUG_MODE) {
        console.error("Erro ao carregar ingredientes:", err.message);
      }
      state.ingredientes = [];
      state.ingredientesPorcaoBase = [];
      state.ingredientesExtras = [];
    }
  }

  async function loadProduto() {
    state.productId = getIdFromUrl();
    state.editIndex = getEditIndexFromUrl();
    state.cartItemId = getCartItemIdFromUrl();
    state.isEditing = state.editIndex !== null || state.cartItemId !== null;

    if (!state.productId) return;

    try {
      // IMPORTANTE: Sempre buscar da API usando o ID da URL, não usar cache
      // Passa quantity para calcular max_quantity corretamente baseado no estoque
      const produtoData = await getProductById(state.productId, state.quantity || 1);
      
      // Se a resposta vem com wrapper { product: {...} }, extrair o produto
      const produto = produtoData?.product || produtoData;
      
      // ALTERAÇÃO: Buscar promoção ativa para o produto
      // IMPORTANTE: 404 é esperado quando produto não tem promoção - não é um erro
      try {
        const promotion = await getPromotionByProductId(state.productId, false);
        // Verificar se a promoção está ativa (não expirada)
        if (promotion && isPromotionActive(promotion)) {
          state.promotion = promotion;
        } else {
          state.promotion = null;
        }
      } catch (error) {
        // ALTERAÇÃO: Se não houver promoção (404) ou outro erro, continuar sem promoção
        // 404 é esperado e já é tratado silenciosamente pela API (retorna null)
        // Apenas logar outros erros (não-404) em modo debug
        state.promotion = null;
        // ALTERAÇÃO: Log condicional apenas para erros não-404 e apenas em modo debug
        if (typeof window !== 'undefined' && window.DEBUG_MODE && error?.status !== 404) {
          console.warn("Erro ao buscar promoção do produto:", error);
        }
      }
      
      // IMPORTANTE: Se produto já tem ingredientes (vindo de getProductById), usar eles
      // pois já têm max_quantity calculado corretamente para a quantidade atual do produto
      // REGRA: consumo_total = consumo_por_unidade × quantity (já calculado pelo backend)
      if (produto && produto.ingredients && Array.isArray(produto.ingredients) && produto.ingredients.length > 0) {
        // Usar ingredientes que já vêm com max_quantity calculado para a quantidade correta
        await loadIngredientes(state.productId, produto.ingredients);
      } else {
        // Se não tem ingredientes no produto, buscar da API com quantity atual
        await loadIngredientes(state.productId);
      }

      state.product = produto;
      updateTitle();
      renderProdutoInfo();

      // CORREÇÃO: Se está editando, carregar dados do item da cesta DEPOIS de carregar ingredientes
      // Isso garante que todos os ingredientes estão disponíveis antes de carregar os extras do item
      if (state.isEditing) {
        try {
          if (state.cartItemId) {
            await loadItemFromApiByCartId(state.cartItemId);
          } else {
            await loadItemFromCart();
          }
        } catch (err) {
          // ALTERAÇÃO: Removido console.warn em produção
          // TODO: REVISAR - Implementar logging estruturado condicional (apenas em modo debug)
          if (typeof window !== 'undefined' && window.DEBUG_MODE) {
            console.warn("Erro ao carregar item da cesta:", err);
          }
          // Renderizar listas mesmo com erro para permitir edição básica
          renderMonteSeuJeitoList();
          updateExtrasBadge();
        }
      } else {
        // Se não está editando, apenas renderizar
        renderMonteSeuJeitoList();
        updateExtrasBadge();
      }
      
      // CORREÇÃO: Garantir que as listas sejam renderizadas mesmo se não estiver editando
      // Isso previne que a interface fique incompleta quando há estoque limitado
      if (state.isEditing && (!state.extrasById || state.extrasById.size === 0)) {
        renderMonteSeuJeitoList();
        renderExtrasModal();
        updateExtrasBadge();
      }

      // CORREÇÃO: Atualizar capacidade inicial do produto APÓS renderizar tudo
      // Isso garante que a interface está completamente carregada antes de aplicar limites
      // E evita problemas quando há estoque limitado (ex: max_quantity = 1)
      try {
        // ALTERAÇÃO: Usar debounce para atualização não crítica
        debouncedUpdateProductCapacity(false);
      } catch (err) {
        // ALTERAÇÃO: Removido console.warn em produção
        // TODO: REVISAR - Implementar logging estruturado condicional (apenas em modo debug)
        if (typeof window !== 'undefined' && window.DEBUG_MODE) {
          console.warn("Erro ao atualizar capacidade inicial:", err);
        }
        // Continuar normalmente para permitir edição mesmo com erro de capacidade
      }
    } catch (err) {
      // ALTERAÇÃO: Log condicional apenas em modo debug
      if (typeof window !== 'undefined' && window.DEBUG_MODE) {
        console.error("Erro ao carregar produto:", err.message);
      }
      // TODO: Implementar feedback visual de erro para o usuário
    }
  }

  async function loadItemFromCart() {
    try {
      const cestaStr = localStorage.getItem("royal_cesta");
      if (!cestaStr) return;

      const cesta = JSON.parse(cestaStr);
      if (state.editIndex >= 0 && state.editIndex < cesta.length) {
        const item = cesta[state.editIndex];

        // Carregar quantidade
        state.quantity = item.quantidade || 1;

        // Carregar observação
        if (el.obsInput) {
          el.obsInput.value = item.observacao || "";
        }

        // Carregar extras
        if (item.extras && item.extras.length > 0) {
          item.extras.forEach((extra) => {
            state.extrasById.set(extra.id, {
              id: extra.id,
              name: extra.nome,
              price: extra.preco,
              quantity: extra.quantidade,
              basePortions: 0,
              minQuantity: 0,
              maxQuantity: 999,
            });
          });
        }

        // Atualizar interface
        updateTotals();
        renderMonteSeuJeitoList();
        updateExtrasBadge();
        
        // NOVO: Atualizar capacidade após carregar item da cesta
        // ALTERAÇÃO: Usar debounce para atualização não crítica
        debouncedUpdateProductCapacity(false);
      }
    } catch (err) {
      // ALTERAÇÃO: Log condicional apenas em modo debug
      if (typeof window !== 'undefined' && window.DEBUG_MODE) {
        console.error("Erro ao carregar item da cesta:", err.message);
      }
    }
  }

  async function loadItemFromApiByCartId(cartItemId) {
    try {
      const cartResp = await getCart();
      const items = cartResp?.data?.items || cartResp?.data?.cart?.items || [];
      const found = items.find((it) => it?.id === cartItemId);
      if (!found) return;

      // CORREÇÃO: Carregar quantidade do item da cesta
      // Garantir que seja um número inteiro válido
      const itemQuantity = parseInt(found.quantity, 10);
      state.quantity = Number.isInteger(itemQuantity) && itemQuantity > 0 ? itemQuantity : 1;

      // observação
      if (el.obsInput) {
        el.obsInput.value = found.notes || "";
      }

      // CORREÇÃO: Buscar TODOS os ingredientes disponíveis para garantir informações completas
      let allIngredients = [];
      try {
        const allIngredientsResp = await getIngredients({ page_size: 1000 });
        allIngredients = Array.isArray(allIngredientsResp)
          ? allIngredientsResp
          : allIngredientsResp?.items || [];
      } catch (err) {
        // ALTERAÇÃO: Removido console.warn em produção
        // TODO: REVISAR - Implementar logging estruturado condicional (apenas em modo debug)
        if (typeof window !== 'undefined' && window.DEBUG_MODE) {
          console.warn('Erro ao buscar todos os ingredientes:', err);
        }
        allIngredients = [];
      }

      // Usar os ingredientes que já foram carregados em state.ingredientes
      const ingredientsMap = new Map();
      const ingredientPriceMap = new Map();

      (state.ingredientes || []).forEach((ing) => {
        const ingId = ing.ingredient_id || ing.id;
        ingredientsMap.set(ingId, parseFloat(ing.portions || 0));

        const price =
          toNum(ing.additional_price) ?? resolveAdditionalPrice(ing) ?? 0;
        ingredientPriceMap.set(ingId, price);
      });

      // CORREÇÃO: extras (ingredientes adicionais, basePortions = 0)
      // Buscar informações completas dos ingredientes que estão nos extras
      (found.extras || []).forEach((extra) => {
        const id = extra.ingredient_id || extra.id;
        const qtyTotal = parseInt(extra.quantity, 10) || 0;
        // CORREÇÃO: quantity do extra é TOTAL, converter para quantidade por unidade
        // O backend retorna quantity como total, mas o frontend armazena como "por unidade"
        const qtyPorUnidade = itemQuantity > 0 ? qtyTotal / itemQuantity : qtyTotal;
        
        // Buscar informações completas do ingrediente
        const fullIngredient = allIngredients.find(ing => ing.id === id) || {};
        const productIngredient = state.ingredientes.find(ing => (ing.ingredient_id || ing.id) === id);
        
        // Usar preço do extra, do ingrediente completo, ou do produto
        const price = toNum(extra.ingredient_price) 
          ?? toNum(fullIngredient.additional_price) 
          ?? toNum(fullIngredient.price)
          ?? toNum(productIngredient?.additional_price)
          ?? 0;
        
        // Usar nome do extra, do ingrediente completo, ou padrão
        const name = extra.ingredient_name 
          || fullIngredient.name 
          || productIngredient?.name
          || "Ingrediente";
        
        // Buscar max_quantity do produto ou usar padrão
        const maxQuantity = productIngredient?.max_quantity 
          ?? fullIngredient.max_quantity 
          ?? 999;
        
        state.extrasById.set(id, {
          id,
          name: name,
          price: validatePrice(price),
          quantity: qtyPorUnidade, // CORREÇÃO: Armazenar quantidade por unidade
          basePortions: 0,
          minQuantity: 0,
          maxQuantity: maxQuantity,
        });
      });

      // CORREÇÃO: base_modifications (modificações da receita base, basePortions > 0)
      // Buscar informações completas dos ingredientes que estão nas modificações
      (found.base_modifications || []).forEach((bm) => {
        const id = bm.ingredient_id || bm.id;
        const delta = parseInt(bm.delta, 10) || 0;
        
        // Buscar informações completas do ingrediente
        const fullIngredient = allIngredients.find(ing => ing.id === id) || {};
        const productIngredient = state.ingredientes.find(ing => (ing.ingredient_id || ing.id) === id);
        
        const basePortions = ingredientsMap.get(id) || parseFloat(fullIngredient.base_portion_quantity) || 1;
        
        // Usar preço do ingrediente completo ou do produto
        const price = ingredientPriceMap.get(id)
          ?? toNum(fullIngredient.additional_price)
          ?? toNum(fullIngredient.price)
          ?? 0;

        // Buscar minQuantity e maxQuantity do ingrediente original
        const minQuantity = productIngredient && Number.isFinite(parseFloat(productIngredient.min_quantity))
          ? parseFloat(productIngredient.min_quantity)
          : (fullIngredient.min_quantity ? parseFloat(fullIngredient.min_quantity) : basePortions);
        const maxQuantity = productIngredient && Number.isFinite(parseFloat(productIngredient.max_quantity))
          ? parseFloat(productIngredient.max_quantity)
          : (fullIngredient.max_quantity ? parseFloat(fullIngredient.max_quantity) : basePortions + 999);

        // Usar nome do ingrediente completo ou do produto
        const name = bm.ingredient_name 
          || fullIngredient.name 
          || productIngredient?.name
          || "Ingrediente";

        state.extrasById.set(id, {
          id,
          name: name,
          price: validatePrice(price),
          quantity: delta, // Mantém o delta para exibir corretamente na UI
          basePortions: basePortions,
          minQuantity: minQuantity,
          maxQuantity: maxQuantity,
        });
      });

      // Recarregar ingredientes após carregar dados do item para garantir que os dados estejam atualizados
      // IMPORTANTE: Passar quantity atual do produto para calcular max_quantity considerando consumo acumulado
      // REGRA: consumo_total = consumo_por_unidade × quantity
      // Isso garante que max_quantity está calculado corretamente para a quantidade atual do produto
      await loadIngredientes(state.productId);

      // CORREÇÃO: Atualizar a UI da quantidade do produto
      // Garantir que a quantidade carregada seja exibida corretamente
      if (el.qtdTexto) {
        el.qtdTexto.textContent = String(state.quantity).padStart(2, "0");
      }

      // Atualizar estado dos botões de quantidade
      toggleQtdMinusState();

      // Atualizar totais e renderizar listas ANTES de atualizar capacidade
      // Isso garante que a interface está renderizada antes de aplicar limites
      updateTotals();
      renderMonteSeuJeitoList();
      renderExtrasModal();
      updateExtrasBadge();
      
      // CORREÇÃO: Atualizar capacidade após carregar item do carrinho
      // Mas não impedir a edição se houver erro ou estoque limitado
      try {
        // ALTERAÇÃO: Usar debounce para atualização não crítica
        debouncedUpdateProductCapacity(false);
      } catch (err) {
        // ALTERAÇÃO: Removido console.warn em produção
        // TODO: REVISAR - Implementar logging estruturado condicional (apenas em modo debug)
        if (typeof window !== 'undefined' && window.DEBUG_MODE) {
          console.warn("Erro ao atualizar capacidade ao carregar item:", err);
        }
        // Continuar normalmente para permitir edição mesmo com erro de capacidade
      }
    } catch (err) {
      // ALTERAÇÃO: Log condicional apenas em modo debug
      if (typeof window !== 'undefined' && window.DEBUG_MODE) {
        console.error("Erro ao carregar item do carrinho:", err);
      }
    }
  }

  // Boot
  document.addEventListener("DOMContentLoaded", async () => {
    attachQuantityHandlers();
    attachExtrasButton();
    attachObsCounter();
    attachAddToCart();
    await loadProduto();
  });
})();
