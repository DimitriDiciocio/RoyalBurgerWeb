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
import { getPromotionByProductId } from "../api/promotions.js";
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
import { calculatePriceWithPromotion, formatPrice, isPromotionActive } from "../utils/price-utils.js";


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
    const result = await getCart();
    if (result.success) {
      // Converter dados da API para formato local
      const apiItems = result.data.cart?.items || result.data.items || [];

      // Validar formato básico vindo da API (lista)
      if (!Array.isArray(apiItems)) {
        throw new Error("Formato de dados do carrinho inválido");
      }

      // ALTERAÇÃO: Buscar promoções para todos os produtos em paralelo
      const itemsWithPromotions = await Promise.all(
        apiItems.map(async (item) => {
          let promotion = null;
          try {
            const promo = await getPromotionByProductId(item.product.id, false);
            if (promo && isPromotionActive(promo)) {
              promotion = promo;
            }
          } catch (error) {
            // Se não houver promoção, continuar sem ela
            promotion = null;
          }
          return { item, promotion };
        })
      );

      state.itens = itemsWithPromotions.map(({ item, promotion }) => {
        // ALTERAÇÃO: Sempre usar item_subtotal do backend quando disponível
        // O backend já calcula corretamente considerando quantidade do produto e extras
        // CORREÇÃO: Não calcular manualmente para evitar multiplicação incorreta
        const itemSubtotal = parseFloat(item.item_subtotal || 0);
        const itemQuantity = parseInt(item.quantity || 1, 10);

        // ALTERAÇÃO: Calcular preço base com promoção se houver
        const originalPrice = parseFloat(item.product?.price || 0);
        const priceInfo = calculatePriceWithPromotion(originalPrice, promotion);
        const precoBaseComPromocao = priceInfo.finalPrice;

        // ALTERAÇÃO: A API agora retorna item_subtotal COM desconto aplicado
        // Usar diretamente o valor da API sem recalcular ou aplicar desconto novamente
        let precoTotalCalculado = itemSubtotal;
        if (itemSubtotal <= 0 || !isFinite(itemSubtotal)) {
          // CORREÇÃO: Cálculo manual apenas como fallback (quando API não retornou valor válido)
          // Calcular total de extras
          const extrasTotal = (item.extras || []).reduce((sum, extra) => {
            const extraPrice = parseFloat(extra.ingredient_price || 0) || 0;
            const extraQty = parseInt(extra.quantity || 0, 10) || 0;
            if (isFinite(extraPrice) && isFinite(extraQty) && extraPrice >= 0 && extraQty >= 0) {
              const extraTotal = extraPrice * extraQty;
              return sum + extraTotal;
            }
            return sum;
          }, 0);
          
          const baseModsTotal = (item.base_modifications || []).reduce((sum, mod) => {
            if (!mod || typeof mod !== 'object') return sum;
            // ALTERAÇÃO: Priorizar additional_price sobre price para modificações de produtos
            const price = parseFloat(mod.additional_price || mod.ingredient_price || mod.price || 0) || 0;
            const delta = parseInt(mod.delta || 0, 10) || 0;
            if (isFinite(price) && isFinite(delta) && price >= 0) {
              const modTotal = price * Math.abs(delta);
              return sum + modTotal;
            }
            return sum;
          }, 0);
          
          // Usar preço com promoção como base (já calculado acima)
          const precoUnitario = precoBaseComPromocao + extrasTotal + baseModsTotal;
          precoTotalCalculado = precoUnitario * itemQuantity;
        }
        // ALTERAÇÃO: Não aplicar desconto novamente - a API já retorna item_subtotal com desconto aplicado

        // ALTERAÇÃO: Validação mais robusta para prevenir dados inválidos
        // Mapear BASE_MODIFICATIONS (modificações da receita base)
        const baseModsMapeados = (item.base_modifications || [])
          .map((bm) => {
            if (!bm || typeof bm !== 'object') return null;
            if (!bm.ingredient_id) return null;
            
            // Validar ID como número inteiro positivo
            const id = parseInt(bm.ingredient_id, 10);
            if (isNaN(id) || id <= 0 || !isFinite(id)) return null;

            // Sanitizar nome (garantir que é string)
            const nome = String(bm.ingredient_name || bm.name || "Ingrediente").trim();
            if (!nome) return null;

            // Validar delta como número inteiro (pode ser negativo)
            const deltaRaw = parseInt(bm.delta || 0, 10);
            const delta = isNaN(deltaRaw) || !isFinite(deltaRaw) ? 0 : deltaRaw;

            // ALTERAÇÃO: Priorizar additional_price sobre price para modificações de produtos
            // Validar preço como número positivo
            const precoRaw = parseFloat(bm.additional_price || bm.ingredient_price || bm.price || 0);
            const preco = isNaN(precoRaw) || !isFinite(precoRaw) || precoRaw < 0 ? 0 : precoRaw;

            return { id, nome, delta, preco };
          })
          .filter((bm) => bm !== null); // Remove base_modifications inválidos

        const precoUnitarioCalculado = precoTotalCalculado / itemQuantity;
        
        // CORREÇÃO: Mapear extras convertendo quantidade total para quantidade por unidade
        const extrasMapeados = (item.extras || []).map((extra) => {
          const quantidadeTotal = parseInt(extra.quantity || 0, 10) || 0;
          // CORREÇÃO: quantity do extra é TOTAL, calcular quantidade por unidade para exibição
          const quantidadePorUnidade = itemQuantity > 0 ? quantidadeTotal / itemQuantity : quantidadeTotal;
          return {
            id: extra.ingredient_id,
            nome: extra.ingredient_name,
            preco: extra.ingredient_price,
            quantidade: quantidadePorUnidade, // Exibir quantidade por unidade para o usuário
            quantidadeTotal: quantidadeTotal, // Manter total para referência
          };
        });

        return {
          id: item.product.id,
          nome: item.product.name,
          descricao: item.product.description,
          imagem: item.product.image_url,
          imageHash: item.product.image_hash,
          precoBase: item.product.price,
          precoBaseComPromocao: precoBaseComPromocao, // ALTERAÇÃO: Preço base com desconto aplicado
          promotion: promotion, // ALTERAÇÃO: Armazenar promoção para exibição
          quantidade: itemQuantity,
          extras: extrasMapeados,
          base_modifications: baseModsMapeados,
          observacao: item.notes || "",
          precoUnitario: precoUnitarioCalculado,
          precoTotal: precoTotalCalculado,
          cartItemId: item.id, // ID do item no carrinho da API
          timestamp: Date.now(),
        };
      });
      // Validar dados mapeados para UI
      if (!isValidCartData(state.itens)) {
        throw new Error("Dados do carrinho inválidos (mapeados)");
      }
    } else {
      // ALTERAÇÃO: Removido console.error em produção
      // TODO: REVISAR - Implementar logging estruturado condicional (apenas em modo debug)
      if (typeof window !== 'undefined' && window.DEBUG_MODE) {
        console.error("Erro ao carregar cesta:", result.error);
      }
      state.itens = [];
    }
  } catch (err) {
    // ALTERAÇÃO: Removido console.error em produção
    // TODO: REVISAR - Implementar logging estruturado condicional (apenas em modo debug)
    if (typeof window !== 'undefined' && window.DEBUG_MODE) {
      console.error("Erro ao carregar cesta:", err.message);
    }
    state.itens = [];
  }

  calcularTotais();
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
    // ALTERAÇÃO: Removido console.error em produção
    // TODO: REVISAR - Implementar logging estruturado condicional (apenas em modo debug)
    if (typeof window !== 'undefined' && window.DEBUG_MODE) {
      console.error("Erro ao restaurar backup da cesta:", err.message);
    }
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
    // ALTERAÇÃO: Removido console.error em produção
    // TODO: REVISAR - Implementar logging estruturado condicional (apenas em modo debug)
    if (typeof window !== 'undefined' && window.DEBUG_MODE) {
      console.error("Erro ao salvar cesta:", err.message);
    }
  }
}

// Calcular totais
function calcularTotais() {
  state.subtotal = state.itens.reduce((sum, item) => {
    const itemTotal = item.precoTotal || 0;
    return sum + itemTotal;
  }, 0);
  
  // ALTERAÇÃO: Calcular total de descontos aplicados por promoções (apenas informativo)
  // A API já retorna item_subtotal com desconto aplicado, então calculamos apenas para exibição
  state.descontos = state.itens.reduce((sum, item) => {
    // Se o item não tem promoção, desconto é 0
    if (!item.promotion || (!item.promotion.discount_percentage && !item.promotion.discount_value)) {
      return sum;
    }
    
    // Calcular preço total original (sem desconto) do item para comparação
    const precoBaseOriginal = parseFloat(item.precoBase || 0);
    const quantidade = item.quantidade || 1;
    
    // Calcular total de extras
    const extrasTotal = (item.extras || []).reduce((extrasSum, extra) => {
      const extraPrice = parseFloat(extra.preco || 0) || 0;
      const extraQty = parseFloat(extra.quantidade || 0) || 0;
      // Extra quantidade já é por unidade, multiplicar pela quantidade do produto
      return extrasSum + (extraPrice * extraQty * quantidade);
    }, 0);
    
    // Calcular total de base_modifications
    const baseModsTotal = (item.base_modifications || []).reduce((modsSum, mod) => {
      const modPrice = parseFloat(mod.preco || 0) || 0;
      const modDelta = Math.abs(parseInt(mod.delta || 0, 10) || 0);
      return modsSum + (modPrice * modDelta * quantidade);
    }, 0);
    
    // Preço total original (sem desconto)
    const precoTotalOriginal = (precoBaseOriginal * quantidade) + extrasTotal + baseModsTotal;
    
    // Preço total com desconto (vem da API em precoTotal)
    const precoTotalComDesconto = parseFloat(item.precoTotal || 0);
    
    // Desconto aplicado = diferença entre original e com desconto
    // Este valor é apenas informativo, não é subtraído do total
    const descontoItem = Math.max(0, precoTotalOriginal - precoTotalComDesconto);
    
    return sum + descontoItem;
  }, 0);
  
  // Se não há itens, total deve ser 0 (sem taxas)
  if (state.itens.length === 0) {
    state.total = 0;
    state.descontos = 0;
  } else {
    // CORREÇÃO: O subtotal já tem desconto aplicado, então não devemos subtrair o desconto novamente
    // O campo de descontos é apenas informativo (mostra quanto foi economizado)
    // Total = Subtotal (já com desconto) + Taxa de entrega
    state.total = state.subtotal + state.taxaEntrega;
  }

  stateManager.setMultiple({
    [STATE_KEYS.CART_ITEMS]: state.itens,
    [STATE_KEYS.CART_TOTAL]: state.total,
  });
}

// ALTERAÇÃO: Calcular pontos Royal apenas sobre o subtotal (produtos), sem taxa de entrega
// IMPORTANTE: Pontos são calculados sobre SUBTOTAL (produtos), NÃO sobre total (com entrega)
// Conforme padrão de programas de fidelidade: pontos não incluem taxas de entrega
function calcularPontos() {
  // O subtotal já tem descontos de promoções aplicados
  // Calcular base para pontos: subtotal (produtos apenas, sem taxa de entrega)
  let basePontos = state.subtotal;
  
  // Fallback: 10 pontos por real (R$ 0,10 = 1 ponto)
  return Math.floor(basePontos * 10);
}

// Renderizar item individual
function renderItem(item, index) {
  const imageUrl = buildImageUrl(item.imagem, item.imageHash);

  // Renderizar lista de extras (ingredientes adicionais fora da receita)
  // ALTERAÇÃO: Padronizar design com pagamento.js - adicionar label "Extras:" e exibir preço
  let extrasHtml = "";
  if (item.extras && item.extras.length > 0) {
    const extrasItems = item.extras
      .map((extra) => {
        // ALTERAÇÃO: Buscar e exibir preço do extra
        const preco = parseFloat(extra.preco || 0) || 0;
        // CORREÇÃO: quantidade já é por unidade (convertida no mapeamento)
        const quantidade = extra.quantidade || 0;
        // Calcular preço total do extra (preço unitário × quantidade por unidade)
        const precoTotalExtra = preco * quantidade;
        const precoFormatado = precoTotalExtra > 0
          ? ` <span class="extra-price">+R$ ${precoTotalExtra.toFixed(2).replace(".", ",")}</span>`
          : "";
        return `<li><span class="extra-quantity-badge">${
          Math.round(quantidade * 10) / 10 // Arredondar para 1 casa decimal
        }</span> <span class="extra-name">${escapeHTML(extra.nome)}</span>${precoFormatado}</li>`;
      })
      .join("");
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
  let baseModsHtml = "";
  if (item.base_modifications && item.base_modifications.length > 0) {
    const baseModsItems = item.base_modifications
      .map((bm) => {
        const isPositive = bm.delta > 0;
        const icon = isPositive ? "plus" : "minus";
        const colorClass = isPositive ? "mod-add" : "mod-remove";
        const deltaValue = Math.abs(bm.delta);

        // ALTERAÇÃO: Multiplicar preço unitário pela quantidade (delta) para exibir o preço total correto
        // Formatar preço se houver (apenas para adições, remoções não têm custo)
        const precoUnitario = parseFloat(bm.preco || 0) || 0;
        const precoTotal = precoUnitario * deltaValue;
        const precoFormatado =
          precoTotal > 0 && isPositive
            ? ` <span class="base-mod-price">+R$ ${precoTotal
                .toFixed(2)
                .replace(".", ",")}</span>`
            : "";

        return `
                    <li>
                        <span class="base-mod-icon ${colorClass}">
                            <i class="fa-solid fa-circle-${icon}"></i>
                        </span>
                        <span class="base-mod-quantity">${deltaValue}</span>
                        <span class="base-mod-name">${escapeHTML(bm.nome)}</span>${precoFormatado}
                    </li>
                `;
      })
      .join("");
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
            ${baseModsHtml}
            ${obsHtml}
            <div class="item-extras-separator"></div>
            <div class="item-footer">
                <div class="item-preco-container">
                    ${item.promotion ? (() => {
                      // Calcular preço original total para exibição
                      const precoBaseOriginal = parseFloat(item.precoBase || 0);
                      const quantidade = item.quantidade || 1;
                      const extrasTotal = (item.extras || []).reduce((sum, extra) => {
                        return sum + (parseFloat(extra.preco || 0) * parseFloat(extra.quantidade || 0) * quantidade);
                      }, 0);
                      const baseModsTotal = (item.base_modifications || []).reduce((sum, mod) => {
                        return sum + (parseFloat(mod.preco || 0) * Math.abs(parseInt(mod.delta || 0, 10) || 0) * quantidade);
                      }, 0);
                      const precoTotalOriginal = (precoBaseOriginal * quantidade) + extrasTotal + baseModsTotal;
                      return `<span class="item-preco-original" style="text-decoration: line-through; color: #999; font-size: 0.9em; margin-right: 8px;">${formatBRL(precoTotalOriginal)}</span>`;
                    })() : ''}
                    <p class="item-preco">${formatBRL(item.precoTotal)}</p>
                </div>
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

  // Verificar se está vazia
  if (state.itens.length === 0) {
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
      // ALTERAÇÃO: Recarregar cesta da API após atualizar quantidade
      // Isso garante que preços e totais estão corretos (backend calcula corretamente)
      // CORREÇÃO: Não calcular manualmente para evitar multiplicação incorreta
      await carregarCesta();
      // carregarCesta já chama calcularTotais() e renderCesta()
      stateManager.getEventBus().emit(STATE_EVENTS.CART_ITEM_UPDATED, {
        item: item,
        index: index,
      });
      return;
    } else {
      // Tratamento específico para erro de estoque
      if (result.errorType === 'INSUFFICIENT_STOCK') {
        showToast(result.error || 'Estoque insuficiente para a quantidade solicitada', {
          type: "error",
          title: "Estoque Insuficiente",
          autoClose: 5000,
        });
        // Recarregar carrinho para atualizar quantidades disponíveis
        await carregarCesta();
      } else {
        // Usar mensagem específica do backend quando disponível
        const errorMessage = result.error || "Erro ao atualizar quantidade. Tente novamente.";
        showToast(errorMessage, {
          type: "error",
          title: "Erro",
          autoClose: 5000,
        });
      }
    }
  } catch (err) {
    // ALTERAÇÃO: Removido console.error em produção
    // TODO: REVISAR - Implementar logging estruturado condicional (apenas em modo debug)
    if (typeof window !== 'undefined' && window.DEBUG_MODE) {
      console.error("Erro ao alterar quantidade:", err.message);
    }
    
    // Extrair mensagem de erro específica quando disponível
    const errorMessage = err?.message || err?.error || "Erro ao atualizar quantidade. Tente novamente.";
    showToast(errorMessage, {
      type: "error",
      title: "Erro",
      autoClose: 5000,
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
    // ALTERAÇÃO: Removido console.error em produção
    // TODO: REVISAR - Implementar logging estruturado condicional (apenas em modo debug)
    if (typeof window !== 'undefined' && window.DEBUG_MODE) {
      console.error("Erro ao remover item:", err.message);
    }
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
    // ALTERAÇÃO: Removido console.error em produção
    // TODO: REVISAR - Implementar logging estruturado condicional (apenas em modo debug)
    if (typeof window !== 'undefined' && window.DEBUG_MODE) {
      console.error("Erro ao limpar cesta:", err.message);
    }
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
  
  // CORREÇÃO: Usar cartItemId quando disponível (items vindos da API)
  // Caso contrário, usar editIndex (items do localStorage antigo)
  // item.id = ID do produto (product.id)
  // item.cartItemId = ID do item no carrinho (cart item id)
  const productId = item.id || item.product_id;
  let url = `src/pages/produto.html?id=${productId}`;
  
  // Se tem cartItemId, usar ele (items vindos da API)
  if (item.cartItemId) {
    url += `&cartItemId=${item.cartItemId}`;
  } else {
    // Fallback para localStorage antigo - usar editIndex
    url += `&editIndex=${index}`;
  }
  
  window.location.href = url;
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
  initElements();
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
      if (window.abrirModal && el.modal) {
        window.abrirModal("modal-cesta");
      }
    }, 300);
  } else if (backupRestaurado) {
    // Se restaurou backup, abrir modal da cesta automaticamente
    setTimeout(() => {
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
