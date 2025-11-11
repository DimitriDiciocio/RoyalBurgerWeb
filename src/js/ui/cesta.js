// src/js/ui/cesta.js
// Gerenciamento da Modal da Cesta

import { showConfirm, showToast } from "./alerts.js";
import {
  getCart,
  updateCartItem,
  removeCartItem,
  clearCart,
  claimGuestCart,
} from "../api/cart.js";
import { API_BASE_URL } from "../api/api.js";
import { delegate } from "../utils/performance-utils.js";
import { renderList } from "../utils/dom-renderer.js";
import { $id, $q } from "../utils/dom-cache.js";
import { escapeHTML } from "../utils/html-sanitizer.js";
import {
  stateManager,
  STATE_KEYS,
  STATE_EVENTS,
} from "../utils/state-manager.js";

// Debug helper
const CART_UI_DEBUG = true;
function cartLog(...args) {
  if (CART_UI_DEBUG) {
    try { console.debug("[CESTA]", ...args); } catch (_) {}
  }
}

// Constantes para validação e limites
const VALIDATION_LIMITS = {
  MAX_ITEMS: 50,
  MAX_QUANTITY_PER_ITEM: 99,
  MAX_NOTES_LENGTH: 500,
  MAX_EXTRAS_PER_ITEM: 10,
};

const state = {
  itens: [],
  taxaEntrega: 5.0,
  descontos: 0.0,
  subtotal: 0,
  total: 0,
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
  cestaValorFlutuante: null,
};

let cleanupDelegates = [];

// Utils
const formatBRL = (v) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    v || 0
  );

/**
 * Valida se um item é válido
 * @param {Object} item - Item a ser validado
 * @returns {boolean} True se válido
 */
function isValidItem(item) {
  return (
    item &&
    typeof item === "object" &&
    typeof item.id === "number" &&
    typeof item.nome === "string" &&
    typeof item.quantidade === "number" &&
    item.quantidade > 0 &&
    item.quantidade <= VALIDATION_LIMITS.MAX_QUANTITY_PER_ITEM
  );
}

/**
 * Valida se os dados do carrinho são válidos
 * @param {Array} itens - Itens a serem validados
 * @returns {boolean} True se válidos
 */
function isValidCartData(itens) {
  return (
    Array.isArray(itens) &&
    itens.length <= VALIDATION_LIMITS.MAX_ITEMS &&
    itens.every(isValidItem)
  );
}

/**
 * Constrói URL da imagem de forma segura
 * @param {string} imagePath - Caminho da imagem
 * @param {string} imageHash - Hash para cache busting
 * @returns {string} URL da imagem
 */
function buildImageUrl(imagePath, imageHash = null) {
  if (!imagePath || typeof imagePath !== "string") {
    // Usar imagem padrão que existe no projeto
    return "src/assets/img/1.png";
  }

  // Se já é uma URL completa, retornar como está
  if (imagePath.startsWith("http")) {
    return imagePath;
  }

  // REVISÃO: Usar API_BASE_URL do api.js para garantir funcionamento em qualquer servidor
  // Isso evita erros quando o código é colocado em outros servidores
  const baseUrl = API_BASE_URL;

  const cacheParam = imageHash || new Date().getTime();

  // Sanitizar caminho da imagem
  const sanitizedPath = imagePath.replace(/[^a-zA-Z0-9._/-]/g, "");

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

// Carregar cesta da API
async function carregarCesta() {
  try {
    cartLog("carregarCesta:start");
    const result = await getCart();
    cartLog("carregarCesta:getCart result", {
      success: result?.success,
      hasData: !!result?.data,
      dataKeys: result?.data ? Object.keys(result.data) : [],
      isAuthenticated: result?.isAuthenticated,
    });
    if (result.success) {
      // Converter dados da API para formato local
      const apiItems = result.data.cart?.items || result.data.items || [];
      cartLog("carregarCesta:apiItems length", apiItems?.length || 0);

      // Validar formato básico vindo da API (lista)
      if (!Array.isArray(apiItems)) {
        cartLog("carregarCesta:apiItems formato inválido", apiItems);
        throw new Error("Formato de dados do carrinho inválido");
      }

      state.itens = apiItems.map((item) => {
        // Calcular preço unitário e total, com fallback se item_subtotal for 0 ou inválido
        const itemSubtotal = parseFloat(item.item_subtotal || 0);
        const itemQuantity = parseInt(item.quantity || 1, 10);

        // Se item_subtotal for 0 ou inválido, calcular manualmente
        let precoTotalCalculado = itemSubtotal;
        if (itemSubtotal <= 0) {
          const precoBase = parseFloat(item.product?.price || 0);
          const extrasTotal = (item.extras || []).reduce((sum, extra) => {
            return sum + (parseFloat(extra.ingredient_price || 0) * parseInt(extra.quantity || 0, 10));
          }, 0);
          const baseModsTotal = (item.base_modifications || []).reduce((sum, mod) => {
            return sum + (parseFloat(mod.ingredient_price || mod.price || 0) * Math.abs(parseInt(mod.delta || 0, 10)));
          }, 0);
          precoTotalCalculado = (precoBase + extrasTotal + baseModsTotal) * itemQuantity;
        }

        return {
          id: item.product.id,
          nome: item.product.name,
          descricao: item.product.description,
          imagem: item.product.image_url,
          imageHash: item.product.image_hash,
          precoBase: item.product.price,
          quantidade: itemQuantity,
          extras: (item.extras || []).map((extra) => ({
            id: extra.ingredient_id,
            nome: extra.ingredient_name,
            preco: extra.ingredient_price,
            quantidade: extra.quantity,
          })),
          observacao: item.notes || "",
          precoUnitario: precoTotalCalculado / itemQuantity,
          precoTotal: precoTotalCalculado,
          cartItemId: item.id, // ID do item no carrinho da API
          timestamp: Date.now(),
        };
      });
      cartLog("carregarCesta:mapped items", state.itens.length);
      // Validar dados mapeados para UI
      if (!isValidCartData(state.itens)) {
        cartLog("carregarCesta:itens mapeados inválidos", state.itens);
        throw new Error("Dados do carrinho inválidos (mapeados)");
      }
    } else {
      // TODO: Implementar logging estruturado em produção
      console.error("Erro ao carregar cesta:", result.error);
      state.itens = [];
    }
  } catch (err) {
    // TODO: Implementar logging estruturado em produção
    console.error("Erro ao carregar cesta:", err.message);
    state.itens = [];
  }

  calcularTotais();
  cartLog("carregarCesta:totals", { subtotal: state.subtotal, total: state.total });
  stateManager.getEventBus().emit(STATE_EVENTS.CART_UPDATED, {
    items: state.itens,
    total: state.total,
  });

  // Renderizar cesta após carregar dados
  renderCesta();
}

// Verificar se há backup da cesta para restaurar após login
async function verificarBackupCesta() {
  try {
    const backupStr = localStorage.getItem("royal_cesta_backup");
    if (!backupStr) return false;

    const backupItens = JSON.parse(backupStr);

    // Validar dados do backup
    if (!isValidCartData(backupItens)) {
      localStorage.removeItem("royal_cesta_backup");
      return false;
    }

    if (backupItens.length > 0) {
      // Tentar reivindicar carrinho de convidado
      const result = await claimGuestCart();
      if (result.success) {
        // Recarregar cesta da API
        await carregarCesta();
        // Remover backup
        localStorage.removeItem("royal_cesta_backup");

        // Mostrar mensagem de sucesso
        showToast(
          "Sua cesta foi restaurada! Agora você pode finalizar seu pedido.",
          {
            type: "info",
            title: "Cesta Restaurada",
            autoClose: 4000,
          }
        );

        return true;
      } else {
        // Se falhou, restaurar do backup local
        state.itens = backupItens;
        localStorage.removeItem("royal_cesta_backup");

        showToast("Cesta restaurada do backup local.", {
          type: "info",
          title: "Cesta Restaurada",
          autoClose: 3000,
        });

        return true;
      }
    }
  } catch (err) {
    // TODO: Implementar logging estruturado em produção
    console.error("Erro ao restaurar backup da cesta:", err.message);
    // Limpar backup corrompido
    localStorage.removeItem("royal_cesta_backup");
  }
  return false;
}

// Salvar cesta no localStorage
function salvarCesta() {
  try {
    // Validar dados antes de salvar
    if (!isValidCartData(state.itens)) {
      throw new Error("Dados da cesta inválidos para salvar");
    }

    localStorage.setItem("royal_cesta", JSON.stringify(state.itens));
  } catch (err) {
    // TODO: Implementar logging estruturado em produção
    console.error("Erro ao salvar cesta:", err.message);
  }
}

// Calcular totais
function calcularTotais() {
  state.subtotal = state.itens.reduce((sum, item) => {
    return sum + (item.precoTotal || 0);
  }, 0);
  
  // Se não há itens, total deve ser 0 (sem taxas)
  if (state.itens.length === 0) {
    state.total = 0;
    state.descontos = 0;
  } else {
    state.total =
      state.subtotal + state.taxaEntrega  - state.descontos;
  }

  stateManager.setMultiple({
    [STATE_KEYS.CART_ITEMS]: state.itens,
    [STATE_KEYS.CART_TOTAL]: state.total,
  });
}

// Calcular pontos Royal (10 pontos a cada R$ 1,00 gasto)
function calcularPontos() {
  return Math.floor(state.total * 10);
}

// Renderizar item individual
function renderItem(item, index) {
  const imageUrl = buildImageUrl(item.imagem, item.imageHash);

  // Renderizar lista de extras/modificações
  let extrasHtml = "";
  if (item.extras && item.extras.length > 0) {
    const extrasItems = item.extras
      .map((extra) => {
        return `<li><span class="extra-quantity-badge">${
          extra.quantidade
        }</span> ${escapeHTML(extra.nome)}</li>`;
      })
      .join("");
    extrasHtml = `
            <div class="item-extras-separator"></div>
            <div class="item-extras-list">
                <ul>
                    ${extrasItems}
                </ul>
            </div>
        `;
  }

  // Mostrar observação se houver
  const obsHtml = item.observacao
    ? `
        <div class="item-extras-separator"></div>
        <div class="item-observacao">
            <strong>Obs:</strong> ${escapeHTML(item.observacao)}
        </div>
    `
    : "";

  return `
        <div class="item-cesta-modal" data-index="${index}" data-key="item-${
    item.cartItemId || item.id
  }-${index}">
            <div class="item-header">
                <div class="item-image">
                    <img src="${imageUrl}" alt="${escapeHTML(item.nome)}">
                </div>
                <div class="item-header-info">
                    <h4 class="item-nome">${escapeHTML(item.nome)}</h4>
                    <p class="item-descricao">${escapeHTML(
                      item.descricao || ""
                    )}</p>
                </div>
                <button class="btn-editar-item" data-index="${index}" title="Editar">
                    <i class="fa-solid fa-pen"></i>
                </button>
            </div>
            ${extrasHtml}
            ${obsHtml}
            <div class="item-extras-separator"></div>
            <div class="item-footer">
                <p class="item-preco">${formatBRL(item.precoTotal)}</p>
                <div class="item-footer-controls">
                    ${
                      item.quantidade === 1
                        ? `
                        <button class="btn-remover-item" data-index="${index}" title="Remover">
                            <i class="fa-solid fa-trash-can"></i>
                        </button>
                        <span class="quantidade-valor">${String(
                          item.quantidade
                        ).padStart(2, "0")}</span>
                        <button class="btn-qtd-mais-modal" data-index="${index}">
                            <i class="fa-solid fa-plus"></i>
                        </button>
                    `
                        : `
                        <div class="quantidade-controls">
                            <button class="btn-qtd-menos-modal" data-index="${index}">
                                <i class="fa-solid fa-minus"></i>
                            </button>
                            <span class="quantidade-valor">${String(
                              item.quantidade
                            ).padStart(2, "0")}</span>
                            <button class="btn-qtd-mais-modal" data-index="${index}">
                                <i class="fa-solid fa-plus"></i>
                            </button>
                        </div>
                    `
                    }
                </div>
            </div>
        </div>
    `;
}

// Renderizar cesta completa
function renderCesta() {
  if (!el.listaItens) return;

  calcularTotais();
  cartLog("renderCesta", { items: state.itens.length, subtotal: state.subtotal, total: state.total });

  // Verificar se está vazia
  if (state.itens.length === 0) {
    cartLog("renderCesta:empty");
    if (el.cestaVazia) el.cestaVazia.style.display = "flex";
    if (el.itemsContainer) el.itemsContainer.style.display = "none";
    if (el.resumoContainer) el.resumoContainer.style.display = "none";
    if (el.btnLimpar) el.btnLimpar.style.display = "none";
    
    // Zerar valores quando a cesta está vazia
    if (el.subtotal) el.subtotal.textContent = formatBRL(0);
    if (el.taxaEntrega) el.taxaEntrega.textContent = formatBRL(0);
    if (el.descontos) el.descontos.textContent = formatBRL(0);
    if (el.total) el.total.textContent = formatBRL(0);
    if (el.footerTotal) el.footerTotal.textContent = formatBRL(0);
    if (el.pontos) el.pontos.textContent = 0;
    
    atualizarHeaderCesta();
    atualizarBotaoFlutuante();
    atualizarPontosHeader();
    return;
  }

  // Mostrar conteúdo
  cartLog("renderCesta:show");
  if (el.cestaVazia) el.cestaVazia.style.display = "none";
  if (el.itemsContainer) el.itemsContainer.style.display = "block";
  if (el.resumoContainer) el.resumoContainer.style.display = "block";
  if (el.btnLimpar) el.btnLimpar.style.display = "block";

  renderList(
    el.listaItens,
    state.itens,
    (item, index) => renderItem(item, index),
    (item, index) => `item-${item.cartItemId || item.id}-${index}` // Chave única por item
  );

  // Atualizar valores
  if (el.subtotal) el.subtotal.textContent = formatBRL(state.subtotal);
  if (el.taxaEntrega) el.taxaEntrega.textContent = formatBRL(state.taxaEntrega);
  if (el.descontos) el.descontos.textContent = formatBRL(state.descontos);
  if (el.total) el.total.textContent = formatBRL(state.total);
  if (el.footerTotal) el.footerTotal.textContent = formatBRL(state.total);
  if (el.pontos) el.pontos.textContent = calcularPontos();

  atualizarHeaderCesta();
  atualizarBotaoFlutuante();
  atualizarPontosHeader();
}

// Atualizar header da cesta (ícone no topo)
function atualizarHeaderCesta() {
  if (!el.headerCesta) return;

  const totalItens = state.itens.reduce(
    (sum, item) => sum + item.quantidade,
    0
  );

  if (el.headerPreco) el.headerPreco.textContent = formatBRL(state.subtotal);
  if (el.headerItens)
    el.headerItens.textContent = `/ ${totalItens} ${
      totalItens === 1 ? "item" : "itens"
    }`;
}

// Atualizar botão flutuante da cesta
function atualizarBotaoFlutuante() {
  if (!el.btnCestaFlutuante) return;

  const totalItens = state.itens.reduce(
    (sum, item) => sum + item.quantidade,
    0
  );

  // Mostrar ou ocultar botão baseado em se há itens
  if (totalItens > 0) {
    el.btnCestaFlutuante.style.display = "flex";
    if (el.cestaBadgeCount) el.cestaBadgeCount.textContent = totalItens;
    if (el.cestaValorFlutuante)
      el.cestaValorFlutuante.textContent = formatBRL(state.subtotal);
  } else {
    el.btnCestaFlutuante.style.display = "none";
  }
}

// Atualizar pontos no header
function atualizarPontosHeader() {
  if (
    window.headerPontos &&
    typeof window.headerPontos.carregarPontos === "function"
  ) {
    window.headerPontos.carregarPontos();
  }
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
    showToast(
      `Quantidade máxima permitida: ${VALIDATION_LIMITS.MAX_QUANTITY_PER_ITEM}`,
      {
        type: "warning",
        title: "Quantidade Inválida",
        autoClose: 3000,
      }
    );
    return;
  }

  try {
    const result = await updateCartItem(item.cartItemId, { quantity: novaQtd });
    if (result.success) {
      item.quantidade = novaQtd;
      item.precoTotal = item.precoUnitario * item.quantidade;

      calcularTotais();
      stateManager.getEventBus().emit(STATE_EVENTS.CART_ITEM_UPDATED, {
        item: item,
        index: index,
      });

      renderCesta();
    } else {
      showToast("Erro ao atualizar quantidade. Tente novamente.", {
        type: "error",
        title: "Erro",
        autoClose: 3000,
      });
    }
  } catch (err) {
    // TODO: Implementar logging estruturado em produção
    console.error("Erro ao alterar quantidade:", err.message);
    showToast("Erro ao atualizar quantidade. Tente novamente.", {
      type: "error",
      title: "Erro",
      autoClose: 3000,
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
      state.itens.splice(index, 1);

      calcularTotais();
      stateManager.getEventBus().emit(STATE_EVENTS.CART_ITEM_REMOVED, {
        item: item,
        index: index,
      });

      renderCesta();
    } else {
      showToast("Erro ao remover item. Tente novamente.", {
        type: "error",
        title: "Erro",
        autoClose: 3000,
      });
    }
  } catch (err) {
    // TODO: Implementar logging estruturado em produção
    console.error("Erro ao remover item:", err.message);
    showToast("Erro ao remover item. Tente novamente.", {
      type: "error",
      title: "Erro",
      autoClose: 3000,
    });
  }
}

// Limpar toda a cesta
async function limparCesta() {
  if (state.itens.length === 0) return;

  const confirmar = await showConfirm({
    title: "Limpar Cesta",
    message: "Deseja limpar toda a cesta?",
    confirmText: "Sim, limpar",
    cancelText: "Cancelar",
    type: "warning",
  });

  if (!confirmar) return;

  try {
    const result = await clearCart();
    if (result.success) {
      state.itens = [];

      calcularTotais();
      stateManager.getEventBus().emit(STATE_EVENTS.CART_CLEARED);

      renderCesta();
      showToast("Cesta limpa com sucesso!", {
        type: "success",
        title: "Cesta Limpa",
        autoClose: 2000,
      });
    } else {
      showToast("Erro ao limpar cesta. Tente novamente.", {
        type: "error",
        title: "Erro",
        autoClose: 3000,
      });
    }
  } catch (err) {
    // TODO: Implementar logging estruturado em produção
    console.error("Erro ao limpar cesta:", err.message);
    showToast("Erro ao limpar cesta. Tente novamente.", {
      type: "error",
      title: "Erro",
      autoClose: 3000,
    });
  }
}

// Editar item (volta para página do produto)
function editarItem(index) {
  if (index < 0 || index >= state.itens.length) return;

  const item = state.itens[index];
  // Redirecionar para página do produto com índice de edição
  window.location.href = `src/pages/produto.html?id=${item.id}&editIndex=${index}`;
}

function setupEventDelegation() {
  if (!el.listaItens) return;

  // Limpar delegations anteriores
  cleanupDelegates.forEach((cleanup) => cleanup());
  cleanupDelegates = [];

  // Delegation para botões de quantidade (menos)
  const cleanupMenos = delegate(
    el.listaItens,
    "click",
    ".btn-qtd-menos-modal",
    (e, target) => {
      const index = parseInt(target.getAttribute("data-index"));
      if (!isNaN(index)) alterarQuantidade(index, -1);
    }
  );
  cleanupDelegates.push(cleanupMenos);

  // Delegation para botões de quantidade (mais)
  const cleanupMais = delegate(
    el.listaItens,
    "click",
    ".btn-qtd-mais-modal",
    (e, target) => {
      const index = parseInt(target.getAttribute("data-index"));
      if (!isNaN(index)) alterarQuantidade(index, 1);
    }
  );
  cleanupDelegates.push(cleanupMais);

  // Delegation para botões de remover
  const cleanupRemover = delegate(
    el.listaItens,
    "click",
    ".btn-remover-item",
    (e, target) => {
      const index = parseInt(target.getAttribute("data-index"));
      if (!isNaN(index)) removerItem(index);
    }
  );
  cleanupDelegates.push(cleanupRemover);

  // Delegation para botões de editar
  const cleanupEditar = delegate(
    el.listaItens,
    "click",
    ".btn-editar-item",
    (e, target) => {
      const index = parseInt(target.getAttribute("data-index"));
      if (!isNaN(index)) editarItem(index);
    }
  );
  cleanupDelegates.push(cleanupEditar);
}

function attachItemHandlers() {
  // Esta função não é mais necessária, mas mantida para não quebrar código que possa chamá-la
  // O event delegation é configurado uma vez em setupEventDelegation()
}

function initElements() {
  el.modal = $id("modal-cesta");
  el.cestaVazia = $id("cesta-vazia-modal");
  el.itemsContainer = $id("cesta-items-container");
  el.resumoContainer = $id("cesta-resumo-container");
  el.listaItens = $id("lista-itens-modal");
  el.subtotal = $id("modal-subtotal");
  el.taxaEntrega = $id("modal-taxa-entrega");
  el.descontos = $id("modal-descontos");
  el.total = $id("modal-total");
  el.footerTotal = $id("modal-footer-total");
  el.pontos = $id("modal-pontos");
  el.btnLimpar = $id("btn-limpar-cesta");
  el.btnContinuar = $id("btn-continuar-modal");
  el.headerCesta = $id("cesta");
  el.headerPreco = $id("preco");
  el.headerItens = $id("itens");
  el.btnCestaFlutuante = $id("btn-cesta-flutuante");
  el.cestaBadgeCount = $id("cesta-badge-count");
  el.cestaValorFlutuante = $id("cesta-valor-flutuante");

  setupEventDelegation();
}

// Anexar eventos globais
function attachGlobalHandlers() {
  // Botão limpar
  if (el.btnLimpar) {
    el.btnLimpar.addEventListener("click", limparCesta);
  }

  // Botão continuar (ir para página de pagamento)
  if (el.btnContinuar) {
    el.btnContinuar.addEventListener("click", () => {
      if (state.itens.length === 0) {
        alert("Sua cesta está vazia!");
        return;
      }

      // Verificar se o usuário está logado
      if (
        typeof window.isUserLoggedIn === "function" &&
        window.isUserLoggedIn()
      ) {
        // Usuário logado, pode prosseguir para pagamento
        window.location.href = "src/pages/pagamento.html";
      } else {
        // Usuário não logado, redirecionar para login
        showConfirm({
          title: "Login Necessário",
          message:
            "Para finalizar seu pedido, você precisa estar logado. Deseja fazer login agora?",
          confirmText: "Sim, fazer login",
          cancelText: "Cancelar",
          type: "warning",
        }).then((confirmLogin) => {
          if (confirmLogin) {
            // Salvar a cesta atual para restaurar após login
            localStorage.setItem(
              "royal_cesta_backup",
              JSON.stringify(state.itens)
            );
            // Redirecionar para login
            window.location.href = "src/pages/login.html";
          }
        });
      }
    });
  }

  // Clique no ícone da cesta no header abre a modal
  if (el.headerCesta) {
    el.headerCesta.addEventListener("click", () => {
      cartLog("header click: abrir modal cesta");
      carregarCesta();
      renderCesta();
      if (window.abrirModal) {
        window.abrirModal("modal-cesta");
      }
    });
  }

  // Clique no botão flutuante da cesta
  if (el.btnCestaFlutuante) {
    el.btnCestaFlutuante.addEventListener("click", () => {
      cartLog("btn flutuante: abrir modal cesta");
      carregarCesta();
      renderCesta();
      if (window.abrirModal) {
        window.abrirModal("modal-cesta");
      }
    });
  }

  // Atualizar cesta quando modal é aberta
  if (el.modal) {
    // Observer para detectar quando a modal é exibida
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === "style") {
          const display = window.getComputedStyle(el.modal).display;
          if (display !== "none") {
            // Apenas renderizar, não recarregar da API
            renderCesta();
          }
        }
      });
    });

    observer.observe(el.modal, { attributes: true });
  }
}

// Função exposta globalmente para atualizar a cesta após adicionar item
window.atualizarCesta = async function () {
  await carregarCesta();
  renderCesta();
};

async function bootstrapCesta() {
  cartLog("bootstrap:start");
  initElements();
  try {
    const stored = localStorage.getItem("royal_burger_cart");
    cartLog("localStorage:royal_burger_cart", stored ? JSON.parse(stored) : null);
  } catch (_) {
    cartLog("localStorage:royal_burger_cart parse error");
  }
  cartLog("localStorage:royal_abrir_modal_cesta", localStorage.getItem("royal_abrir_modal_cesta"));
  await carregarCesta();

  // Verificar se há backup da cesta para restaurar após login
  const backupRestaurado = await verificarBackupCesta();

  attachGlobalHandlers();

  // Verificar se deve abrir a modal automaticamente (após adicionar produto)
  const abrirModal = localStorage.getItem("royal_abrir_modal_cesta");
  if (abrirModal === "true") {
    // Remover flag
    localStorage.removeItem("royal_abrir_modal_cesta");

    // Mostrar mensagem de sucesso
    showToast("Item adicionado à cesta com sucesso!", {
      type: "success",
      title: "Item Adicionado",
      autoClose: 3000,
    });

    // Abrir modal após um pequeno delay para garantir que tudo está carregado
    setTimeout(() => {
      cartLog("abrir modal via flag");
      if (window.abrirModal && el.modal) {
        window.abrirModal("modal-cesta");
      }
    }, 300);
  } else if (backupRestaurado) {
    // Se restaurou backup, abrir modal da cesta automaticamente
    setTimeout(() => {
      cartLog("abrir modal via backupRestaurado");
      if (window.abrirModal && el.modal) {
        window.abrirModal("modal-cesta");
      }
    }, 500);
  }
}

// Inicializar mesmo quando carregado após DOMContentLoaded via lazy-loader
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootstrapCesta);
} else {
  // DOM já carregado
  bootstrapCesta();
}

// Exportar funções para uso em outros módulos
export {
  carregarCesta,
  renderCesta,
  atualizarHeaderCesta,
  atualizarBotaoFlutuante,
};
