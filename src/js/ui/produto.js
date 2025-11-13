// src/js/ui/produto.js

import {
  getProductById,
  getProductIngredients,
  getProductImageUrl,
} from "../api/products.js";
import { getIngredients } from "../api/ingredients.js";
import { addToCart, updateCartItem, getCart } from "../api/cart.js";
import { showToast } from "./alerts.js";
import { API_BASE_URL } from "../api/api.js";
import { cacheManager } from "../utils/cache-manager.js";
import { delegate } from "../utils/performance-utils.js";
import { $id, $q } from "../utils/dom-cache.js";
import {
  escapeHTML,
  escapeAttribute,
  sanitizeURL,
} from "../utils/html-sanitizer.js";

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
    basePrice: 0,
    quantity: 1,
    extrasById: new Map(),
    ingredientes: [],
    ingredientesPorcaoBase: [],
    ingredientesExtras: [],
    editIndex: null,
    isEditing: false,
    cartItemId: null,
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
        // TODO: Implementar logging estruturado em produção
        console.warn("URL de imagem inválida:", sanitizedPath);
      }
      return "../assets/img/tudo.jpeg";
    }

    // CORREÇÃO: Usar API_BASE_URL do api.js para garantir funcionamento em qualquer servidor
    // Isso evita erros quando o código é colocado em outros servidores
    const baseUrl = API_BASE_URL;

    const cacheParam = imageHash || new Date().getTime();

    if (sanitizedPath.startsWith("/api/uploads/products/")) {
      return `${baseUrl}${sanitizedPath}?v=${cacheParam}`;
    }

    if (sanitizedPath.startsWith("/uploads/products/")) {
      return `${baseUrl}${sanitizedPath.replace(
        "/uploads/",
        "/api/uploads/"
      )}?v=${cacheParam}`;
    }

    if (sanitizedPath.match(/^\d+\.(jpg|jpeg|png|gif|webp)$/i)) {
      return `${baseUrl}/api/uploads/products/${sanitizedPath}?v=${cacheParam}`;
    }

    return `${baseUrl}/api/uploads/products/${sanitizedPath}?v=${cacheParam}`;
  }

  function getIdFromUrl() {
    try {
      const params = new URLSearchParams(window.location.search);
      const id = params.get("id");
      return validateIngredientId(id);
    } catch (error) {
      // TODO: Implementar logging estruturado em produção
      console.warn("Erro ao obter ID da URL:", error.message);
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
      // TODO: Implementar logging estruturado em produção
      console.warn("Erro ao obter editIndex da URL:", error.message);
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
    const price = parseFloat(state.product.price) || 0;
    state.basePrice = price;

    if (el.nome) el.nome.textContent = name;
    if (el.descricao) el.descricao.textContent = desc;
    if (el.precoApartir) el.precoApartir.textContent = formatBRL(price);

    const imagePath =
      state.product.image_url || getProductImageUrl(state.product.id);
    const imageUrl = buildImageUrl(imagePath, state.product.image_hash);
    if (el.img) {
      el.img.src = imageUrl;
      el.img.alt = name;
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

  function attachQuantityHandlers() {
    if (el.qtdMenos) {
      el.qtdMenos.addEventListener("click", async () => {
        if (state.quantity > 1) {
          state.quantity -= 1;
          updateTotals();
          toggleQtdMinusState();
          // IMPORTANTE: Recarregar produto da API quando quantity muda para atualizar max_quantity
          if (state.productId) {
            try {
              const produtoData = await getProductById(state.productId, state.quantity);
              const produto = produtoData?.product || produtoData;
              if (produto && produto.ingredients) {
                await loadIngredientes(state.productId, produto.ingredients);
              }
            } catch (err) {
              console.warn('Erro ao recarregar produto:', err);
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
        state.quantity += 1;
        updateTotals();
        toggleQtdMinusState();
        // IMPORTANTE: Recarregar produto da API quando quantity muda para atualizar max_quantity
        if (state.productId) {
          try {
            const produtoData = await getProductById(state.productId, state.quantity);
            const produto = produtoData?.product || produtoData;
            if (produto && produto.ingredients) {
              await loadIngredientes(state.productId, produto.ingredients);
            }
          } catch (err) {
            console.warn('Erro ao recarregar produto:', err);
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
      el.qtdMenos.classList.add("dessativo");
    } else {
      el.qtdMenos.classList.remove("dessativo");
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

    const ajustaveis = ingredientes.filter((ing) => {
      const basePortions = parseFloat(ing.portions || 1) || 1;
      const minQuantity = Number.isFinite(parseFloat(ing.min_quantity))
        ? parseFloat(ing.min_quantity)
        : basePortions;
      const maxQuantity = Number.isFinite(parseFloat(ing.max_quantity))
        ? parseFloat(ing.max_quantity)
        : basePortions + 999;
      return minQuantity !== maxQuantity;
    });

    if (ajustaveis.length === 0) {
      el.listaExtrasContainer.innerHTML =
        '<p class="sem-ingredientes">Nenhum ingrediente disponível</p>';
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
        // Não precisa recalcular, apenas usar o valor diretamente
        const maxQuantity = Number.isFinite(parseFloat(ing.max_quantity))
          ? parseFloat(ing.max_quantity)
          : basePortions + 999;

        const extra = state.extrasById.get(ingId);
        const extraQty = extra?.quantity || 0;
        const effectiveQty = basePortions + extraQty;

        // CORREÇÃO: Usar diretamente max_quantity da API (já considera estoque e regras)
        // A API já calcula o menor entre a regra e o estoque disponível
        let canIncrement = effectiveQty < maxQuantity;

        const showMinus = effectiveQty > minQuantity;
        const showPlus = canIncrement;
        // CORREÇÃO: Adicionar classe CSS quando limite é atingido (max_quantity já considera estoque)
        const stockLimitedClass = !showPlus ? ' stock-limited' : '';

        return `
            <div class="item${stockLimitedClass}" 
                 data-ingrediente-id="${ingId}" 
                 data-preco="${ingPrice}" 
                 data-porcoes="${basePortions}"
                 data-min-qty="${minQuantity}"
                 data-max-qty="${maxQuantity}"
                 ${!showPlus ? 'title="Limite atingido"' : ''}>
              <div class="item-adicional-container">
                <p class="nome-adicional">${ingName}</p>
                <p class="preco-adicional">${toBRL(ingPrice)}</p>
              </div>
              <div class="quantidade">
                ${showMinus ? '<i class="fa-solid fa-minus"></i>' : ""}
                <p class="qtd-extra">${String(effectiveQty).padStart(
                  2,
                  "0"
                )}</p>
                ${showPlus ? '<i class="fa-solid fa-plus"></i>' : '<i class="fa-solid fa-plus dessativo" title="Limite atingido"></i>'}
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
        const maxQuantity = Number.isFinite(parseFloat(ing.max_quantity))
          ? parseFloat(ing.max_quantity)
          : 999;

        const extra = state.extrasById.get(ingId);
        const extraQty = extra?.quantity || 0;
        const effectiveQty = basePortions + extraQty;

        // AJUSTE: Validar estoque disponível considerando current_stock e porções base
        // CORREÇÃO: Usar diretamente max_quantity da API (já considera estoque e regras)
        // A API já calcula o menor entre a regra e o estoque disponível
        let canIncrement = effectiveQty < maxQuantity;

        const showMinus = effectiveQty > minQuantity;
        const showPlus = canIncrement;
        // CORREÇÃO: Adicionar classe CSS quando limite é atingido (max_quantity já considera estoque)
        const stockLimitedClass = !showPlus ? ' stock-limited' : '';

        return `
            <div class="item${stockLimitedClass}" 
                 data-ingrediente-id="${ingId}" 
                 data-preco="${ingPrice}" 
                 data-porcoes="${basePortions}"
                 data-min-qty="${minQuantity}"
                 data-max-qty="${maxQuantity}"
                 ${!showPlus ? 'title="Limite atingido"' : ''}>
              <div class="item-adicional-container">
                <p class="nome-adicional">${ingName}</p>
                <p class="preco-adicional">${toBRL(ingPrice)}</p>
              </div>
              <div class="quantidade">
                ${showMinus ? '<i class="fa-solid fa-minus"></i>' : ""}
                <p class="qtd-extra">${String(effectiveQty).padStart(
                  2,
                  "0"
                )}</p>
                ${showPlus ? '<i class="fa-solid fa-plus"></i>' : '<i class="fa-solid fa-plus dessativo" title="Limite atingido"></i>'}
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
    function handleIngredientButtonClick(e, isMinus) {
      const button = e.target.closest(".fa-minus, .fa-plus");
      if (!button) return;

      if (button.classList.contains("dessativo")) {
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
      const maxQuantity = parseFloat(itemEl.getAttribute("data-max-qty"));

      const qtdEl = itemEl.querySelector(".qtd-extra");
      const nomeEl = itemEl.querySelector(".nome-adicional");

      // CORREÇÃO: max_quantity já vem calculado da API considerando estoque e regras
      // Não precisa buscar informações adicionais de estoque, apenas usar max_quantity

      // Garantir que o extra existe no state
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
      }

      const extra = state.extrasById.get(id);
      const effectiveQty = basePortions + extra.quantity;

      // CORREÇÃO: Validação simplificada usando apenas max_quantity da API
      if (isMinus && effectiveQty > minQuantity) {
        extra.quantity -= 1;
        const newEffective = basePortions + extra.quantity;
        if (qtdEl) qtdEl.textContent = String(newEffective).padStart(2, "0");
        updateTotals();

        if (basePortions > 0) {
          renderMonteSeuJeitoList();
        } else {
          renderExtrasModal();
        }
        if (basePortions === 0) updateExtrasBadge();
      } else if (!isMinus) {
        // CORREÇÃO: Validar apenas usando max_quantity (já considera estoque e regras)
        const wouldBeEffectiveQty = effectiveQty + 1;
        
        // Se atingiu o limite, não fazer nada (botão já está desabilitado)
        if (wouldBeEffectiveQty > maxQuantity) {
          return;
        }

        extra.quantity += 1;
        const newEffective = basePortions + extra.quantity;
        if (qtdEl) qtdEl.textContent = String(newEffective).padStart(2, "0");
        updateTotals();

        if (basePortions > 0) {
          renderMonteSeuJeitoList();
        } else {
          renderExtrasModal();
        }
        if (basePortions === 0) updateExtrasBadge();
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
      const minQuantity = parseFloat(itemEl.getAttribute("data-min-qty"));
      const maxQuantity = parseFloat(itemEl.getAttribute("data-max-qty"));

      const minus = itemEl.querySelector(".fa-minus");
      const plus = itemEl.querySelector(".fa-plus");

      // AJUSTE: Buscar informações de estoque do ingrediente
      const ingredient = state.ingredientes.find(
        (ing) => (ing.ingredient_id || ing.id) === id
      );
      const maxAvailable = ingredient?.max_available ?? null;
      const limitedByStock = ingredient?.limited_by === 'stock' || ingredient?.limited_by === 'both';

      // Garantir que o extra existe
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
      }

      const extra = state.extrasById.get(id);
      const effectiveQty = basePortions + extra.quantity;

      // CORREÇÃO: Usar diretamente max_quantity da API (já considera estoque e regras)
      // A API já calcula o menor entre a regra e o estoque disponível
      let canIncrement = effectiveQty < maxQuantity;

      // Atualizar estados dos botões
      if (minus && !(effectiveQty > minQuantity)) {
        minus.remove();
      }
      if (plus && !canIncrement) {
        plus.classList.add("dessativo");
        plus.setAttribute("title", "Limite atingido");
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
        // Desabilitar botão durante operação
        el.btnAdicionarCesta.disabled = true;
        el.btnAdicionarCesta.textContent = state.isEditing
          ? "Atualizando..."
          : "Adicionando...";

        // Preparar dados para a API
        const productId = state.product.id;
        const quantity = Math.max(1, parseInt(state.quantity, 10) || 1);

        // EXTRAS: ingredientes fora da receita base (basePortions === 0) com quantity > 0
        const extras = Array.from(state.extrasById.values())
          .filter((extra) => (extra?.basePortions ?? 0) === 0)
          .filter(
            (extra) => Number.isFinite(extra.quantity) && extra.quantity > 0
          )
          .map((extra) => {
            const id = parseInt(extra.id, 10);
            const qty = parseInt(extra.quantity, 10);
            return {
              ingredient_id: Number.isInteger(id) && id > 0 ? id : null,
              quantity:
                Number.isInteger(qty) && qty > 0 ? Math.min(qty, 999) : null,
            };
          })
          .filter((e) => e.ingredient_id !== null && e.quantity !== null)
          .slice(0, 10); // respeitar limite máximo de extras

        // BASE_MODIFICATIONS: ingredientes da receita base (basePortions > 0) com delta != 0
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

        if (result.success) {
          // Mostrar mensagem de sucesso
          if (typeof showToast === "function") {
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
          } else {
            // Fallback: usar showToast diretamente (já importado)
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
          }

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
          throw new Error(result.error || "Erro ao adicionar item à cesta");
        }
      } catch (err) {
        // Log apenas em desenvolvimento para evitar exposição de erros em produção
        const isDev =
          typeof process !== "undefined" &&
          process.env?.NODE_ENV === "development";
        if (isDev) {
          console.error("Erro ao adicionar à cesta:", err.message);
        }

        const friendly = getFriendlyAddToCartError(err?.message);
        // Usar showToast diretamente (já importado)
        showToast(friendly, {
          type: "error",
          title: "Não foi possível adicionar",
          autoClose: 5000,
        });
        // Em caso de estoque insuficiente, opcionalmente abrir a modal de extras
        if (err?.message && err.message.includes("Estoque insuficiente")) {
          openExtrasModal();
        }
      } finally {
        // Reabilitar botão
        el.btnAdicionarCesta.disabled = false;
        el.btnAdicionarCesta.textContent = state.isEditing
          ? "Atualizar na cesta"
          : "Adicionar à cesta";
      }
    });
  }

  async function loadIngredientes(productId, ingredientsFromProduct = null) {
    try {
      let productIngredients = [];
      
      // Se ingredientes foram passados (vindo de getProductById), usar eles
      if (ingredientsFromProduct && Array.isArray(ingredientsFromProduct) && ingredientsFromProduct.length > 0) {
        productIngredients = ingredientsFromProduct;
      } else {
        // IMPORTANTE: Sempre buscar da API, não usar cache
        // Isso garante que max_quantity está sempre atualizado com o estoque
        const resp = await getProductIngredients(productId);
        productIngredients = Array.isArray(resp) ? resp : resp?.items || [];
      }

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
        };
      });

      state.ingredientes = enrichedIngredients;

      state.ingredientesPorcaoBase = enrichedIngredients.filter((ing) => {
        const portions = parseFloat(ing.portions || 0);
        return portions > 0;
      });

      state.ingredientesExtras = enrichedIngredients.filter((ing) => {
        const portions = parseFloat(ing.portions || 0);
        return portions === 0;
      });
    } catch (err) {
      // TODO: Implementar logging estruturado em produção
      if (window.location.hostname === "localhost") {
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
      
      // Carregar ingredientes em paralelo
      await loadIngredientes(state.productId);

      // IMPORTANTE: Se produto já tem ingredientes (vindo de getProductById), usar eles
      // pois já têm max_quantity calculado corretamente
      if (produto && produto.ingredients && Array.isArray(produto.ingredients) && produto.ingredients.length > 0) {
        // Atualizar ingredientes com os dados da API
        await loadIngredientes(state.productId, produto.ingredients);
      }

      state.product = produto;
      updateTitle();
      renderProdutoInfo();

      // CORREÇÃO: Se está editando, carregar dados do item da cesta DEPOIS de carregar ingredientes
      // Isso garante que todos os ingredientes estão disponíveis antes de carregar os extras do item
      if (state.isEditing) {
        if (state.cartItemId) {
          await loadItemFromApiByCartId(state.cartItemId);
        } else {
          loadItemFromCart();
        }
      } else {
        // Se não está editando, apenas renderizar
        renderMonteSeuJeitoList();
        updateExtrasBadge();
      }
    } catch (err) {
      // TODO: Implementar logging estruturado em produção
      if (window.location.hostname === "localhost") {
        console.error("Erro ao carregar produto:", err.message);
      }
      // TODO: Implementar feedback visual de erro para o usuário
    }
  }

  function loadItemFromCart() {
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
      }
    } catch (err) {
      // TODO: Implementar logging estruturado em produção
      console.error("Erro ao carregar item da cesta:", err.message);
    }
  }

  async function loadItemFromApiByCartId(cartItemId) {
    try {
      const cartResp = await getCart();
      const items = cartResp?.data?.items || cartResp?.data?.cart?.items || [];
      const found = items.find((it) => it?.id === cartItemId);
      if (!found) return;

      // quantidade
      state.quantity = Math.max(1, parseInt(found.quantity, 10) || 1);

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
        console.warn('Erro ao buscar todos os ingredientes:', err);
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
        const qty = parseInt(extra.quantity, 10) || 0;
        
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
          quantity: qty,
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
      // Isso garante que max_quantity está atualizado com o estoque atual
      await loadIngredientes(state.productId);

      // Atualizar a UI da quantidade do produto
      if (el.qtdTexto) {
        el.qtdTexto.textContent = String(state.quantity).padStart(2, "0");
      }

      // Atualizar estado dos botões de quantidade
      toggleQtdMinusState();

      // Atualizar totais e renderizar listas
      updateTotals();
      renderMonteSeuJeitoList();
      renderExtrasModal();
      updateExtrasBadge();
    } catch (err) {
      // TODO: Implementar logging estruturado em produção
      console.error("Erro ao carregar item do carrinho:", err);
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
