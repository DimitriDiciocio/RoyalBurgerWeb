/**
 * Histórico de Pedidos
 * Interface para clientes visualizarem seus pedidos
 */

import {
  getMyOrders,
  getOrderDetails,
  formatOrderStatus,
} from "../api/orders.js";
import { getPromotionByProductId } from "../api/promotions.js";
import { showError } from "./alerts.js";

// Importar helper de configurações
import * as settingsHelper from "../utils/settings-helper.js";
import { escapeHTML } from "../utils/html-sanitizer.js";
import { calculatePriceWithPromotion, formatPrice, isPromotionActive } from "../utils/price-utils.js";
import { socketService } from "../api/socket-client.js";

(function initOrderHistory() {
  // Verificar se estamos na página de histórico de pedidos
  if (!window.location.pathname.includes("hist-pedidos.html")) return;

  // Cache para prazos de entrega (evita múltiplas chamadas à API)
  let estimatedTimesCache = null;

  const state = {
    orders: [],
    filteredOrders: [],
    filters: {
      status: "",
    },
    pagination: {
      currentPage: 1,
      itemsPerPage: 50, // ALTERAÇÃO: Aumentado de 5 para 50 pedidos por página
      totalItems: 0,
    },
    loading: false,
    error: null,
  };

  // Refs DOM
  let el = {};

  // Inicializar elementos DOM
  function initElements() {
    el = {
      // Navegação
      btnVoltar: document.querySelector(".btn-voltar"),

      // Filtros
      filterStatus: document.getElementById("filter-status"),
      btnRefresh: document.getElementById("btn-refresh"),

      // Lista de pedidos
      ordersContainer: document.getElementById("orders-container"),
      pagination: document.getElementById("pagination"),
    };
  }

  // ============================================================================
  // Funções utilitárias para formatação (apenas exibição)
  // ============================================================================

  // Formatar data para exibição
  function formatDate(dateString) {
    if (!dateString) return "Data não disponível";

    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return dateString;

      return date.toLocaleDateString("pt-BR", {
        weekday: "short",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch (e) {
      return dateString;
    }
  }

  // Formatar valor monetário
  function formatCurrency(value) {
    const numValue = parseFloat(value || 0);
    return numValue.toFixed(2).replace(".", ",");
  }

  // Formatar telefone para exibição
  function formatarTelefone(telefone) {
    if (
      !telefone ||
      telefone === "(00)0000-000" ||
      telefone === "Não informado"
    ) {
      return telefone || "(00)0000-000";
    }

    // Format address with pickup fallback
    function formatOrderAddress(order) {
      const isPickup =
        order?.order_type === "pickup" || order?.delivery_type === "pickup";
      if (isPickup) {
        return "Retirada no balcão";
      }

      const addrData = order?.address_data || {};
      const fullLine =
        addrData.delivery_address || order?.delivery_address || order?.address;
      if (fullLine && fullLine.trim() !== "") {
        return fullLine;
      }

      const parts = [];
      const street = addrData.street || order?.street || order?.delivery_street;
      const number = addrData.number || order?.number || order?.delivery_number;
      const complement =
        addrData.complement || order?.complement || order?.delivery_complement;
      if (street) parts.push(street);
      if (number) parts.push(number);
      if (complement) parts.push(complement);
      if (parts.length > 0) {
        return parts.join(", ");
      }

      return "Endereço não informado";
    }

    if (typeof telefone !== "string" && typeof telefone !== "number") {
      return String(telefone);
    }

    const telefoneLimpo = String(telefone).replace(/\D/g, "");

    if (telefoneLimpo.length === 11) {
      return telefoneLimpo.replace(/(\d{2})(\d{5})(\d{4})/, "($1)$2-$3");
    } else if (telefoneLimpo.length === 10) {
      return telefoneLimpo.replace(/(\d{2})(\d{4})(\d{4})/, "($1)$2-$3");
    }

    return telefone;
  }

  // ============================================================================
  // Funções de carregamento e exibição de pedidos
  // ============================================================================

  /**
   * Valores padrão para prazos de entrega (fallback)
   * @constant
   */
  const DEFAULT_ESTIMATED_TIMES = {
    initiation_minutes: 5,
    preparation_minutes: 20,
    dispatch_minutes: 5,
    delivery_minutes: 15,
  };

  /**
   * Carrega prazos de entrega estimados das configurações públicas
   * @returns {Promise<void>}
   */
  async function loadEstimatedTimes() {
    try {
      if (
        settingsHelper &&
        typeof settingsHelper.getEstimatedDeliveryTimes === "function"
      ) {
        estimatedTimesCache = await settingsHelper.getEstimatedDeliveryTimes();
      }

      // Se não conseguiu carregar, usar valores padrão
      if (!estimatedTimesCache) {
        estimatedTimesCache = { ...DEFAULT_ESTIMATED_TIMES };
      }
    } catch (error) {
      // Fallback para valores padrão em caso de erro
      // Log apenas em desenvolvimento para evitar exposição de erros
      estimatedTimesCache = { ...DEFAULT_ESTIMATED_TIMES };
    }
  }

  /**
   * Calcula tempo estimado de entrega baseado nos prazos do sistema + soma dos tempos de preparo dos produtos
   * Fórmula: Iniciação + (Soma dos Tempos de Preparo dos Produtos × Quantidade) + Envio + Entrega
   * @param {string} orderType - Tipo do pedido ('delivery' ou 'pickup'). Padrão: 'delivery'
   * @param {Array} orderItems - Array de itens do pedido com informações do produto
   * @returns {Object} Objeto com minTime e maxTime em minutos
   */
  function calculateEstimatedDeliveryTime(orderType = "delivery", orderItems = []) {
    // Validar orderType
    const validOrderType =
      orderType === "pickup" || orderType === "delivery"
        ? orderType
        : "delivery";

    // ALTERAÇÃO: Validação mais robusta para prevenir cálculos incorretos
    // Calcular tempo total de preparo somando todos os produtos (considerando quantidade)
    let totalProductPrepTime = 0;
    if (Array.isArray(orderItems) && orderItems.length > 0) {
      orderItems.forEach((item) => {
        // Validar e converter valores numéricos de forma segura
        const prepTime = Math.max(0, parseFloat(item.product?.preparation_time_minutes || 
                        item.preparation_time_minutes || 0) || 0);
        const quantity = Math.max(1, parseInt(item.quantity || 1, 10) || 1);
        // Validar que não há overflow antes de somar
        const itemPrepTime = prepTime * quantity;
        if (isFinite(itemPrepTime) && itemPrepTime >= 0) {
          totalProductPrepTime += itemPrepTime;
        }
      });
    }
    // Garantir que o tempo total é um número válido
    totalProductPrepTime = Math.max(0, isFinite(totalProductPrepTime) ? totalProductPrepTime : 0);

    if (!estimatedTimesCache) {
      // Fallback se não carregou os tempos
      const systemPrep = 20; // Fallback padrão (usado apenas se não houver produtos)
      const preparation = totalProductPrepTime > 0 ? totalProductPrepTime : systemPrep;
      const delivery = validOrderType === "delivery" ? 15 : 0;
      const total = 5 + preparation + 5 + delivery;
      return {
        minTime: total,
        maxTime: total + 15,
      };
    }

    // Extrair prazos do cache (com fallbacks seguros)
    const initiation = Number(estimatedTimesCache.initiation_minutes) || 5;
    const systemPreparation = Number(estimatedTimesCache.preparation_minutes) || 20;
    const dispatch = Number(estimatedTimesCache.dispatch_minutes) || 5;
    const delivery =
      validOrderType === "delivery"
        ? Number(estimatedTimesCache.delivery_minutes) || 15
        : 0;

    // Validar que os valores são números positivos
    const safeInitiation = Math.max(0, initiation);
    const safeDispatch = Math.max(0, dispatch);
    const safeDelivery = Math.max(0, delivery);

    // Usar a soma dos tempos de preparo dos produtos, ou o padrão do sistema se não houver produtos
    const preparation = totalProductPrepTime > 0 ? totalProductPrepTime : systemPreparation;

    // Calcular tempo total: Iniciação + (Soma dos Tempos de Preparo) + Envio + Entrega
    const totalMinutes =
      safeInitiation + preparation + safeDispatch + safeDelivery;

    // Tempo mínimo = soma dos prazos
    const minTime = Math.max(0, totalMinutes);

    // Tempo máximo = soma dos prazos + 15 minutos (margem de segurança)
    const maxTime = Math.max(minTime, totalMinutes + 15);

    return { minTime, maxTime };
  }

  /**
   * Máximo de requisições simultâneas para evitar sobrecarga da API
   * @constant
   */
  const MAX_CONCURRENT_REQUESTS = 10;

  /**
   * Carregar pedidos do usuário (apenas exibição)
   * @returns {Promise<void>}
   */
  async function loadOrders() {
    // Prevenir múltiplas chamadas simultâneas
    if (state.loading) return;

    state.loading = true;
    state.error = null;

    try {
      // ALTERAÇÃO: Passar parâmetros de paginação explicitamente (50 pedidos por página)
      const result = await getMyOrders(state.pagination.currentPage, state.pagination.itemsPerPage);

      if (result.success) {
        // Suporta formatos: lista direta (legacy) ou objeto com items (paginação)
        const ordersList = Array.isArray(result.data)
          ? result.data
          : (result.data?.items || result.data?.orders || []);

        // Buscar detalhes completos de cada pedido para exibir itens
        // Limitar concorrência para evitar sobrecarga da API
        const ordersWithDetails = await Promise.allSettled(
          (Array.isArray(ordersList) ? ordersList : []).map(async (order, index) => {
            const orderId = order.order_id || order.id;

            // Validar orderId antes de fazer requisição
            if (
              !orderId ||
              (typeof orderId !== "number" && typeof orderId !== "string")
            ) {
              return order;
            }

            // Rate limiting: aguardar se exceder limite de concorrência
            if (index >= MAX_CONCURRENT_REQUESTS) {
              await new Promise((resolve) =>
                setTimeout(
                  resolve,
                  100 * Math.floor(index / MAX_CONCURRENT_REQUESTS)
                )
              );
            }

            try {
              const detailsResult = await getOrderDetails(orderId);

              if (detailsResult.success && detailsResult.data) {
                return {
                  ...order,
                  ...detailsResult.data,
                  order_id: orderId,
                };
              }
              return order;
            } catch (err) {
              // Log apenas em desenvolvimento
              const isDev =
                typeof process !== "undefined" &&
                process.env?.NODE_ENV === "development";
              if (isDev) {
                console.warn(
                  `Erro ao carregar detalhes do pedido ${orderId}:`,
                  err?.message
                );
              }
              return order;
            }
          })
        ).then((results) =>
          results
            .map((result) =>
              result.status === "fulfilled" ? result.value : null
            )
            .filter((order) => order !== null)
        );

        state.orders = ordersWithDetails;
        applyFilters();
      } else {
        state.error = result.error || "Erro desconhecido";
        showError("Erro ao carregar pedidos: " + state.error);
      }
    } catch (error) {
      state.error = error.message || "Erro desconhecido";
      showError("Erro ao carregar pedidos: " + state.error);
    } finally {
      state.loading = false;
    }
  }

  // Aplicar filtros (apenas por status)
  function applyFilters() {
    let filtered = [...state.orders];

    // Filtro por status
    if (state.filters.status) {
      filtered = filtered.filter(
        (order) => order.status === state.filters.status
      );
    }

    state.filteredOrders = filtered;
    updatePagination();
    renderOrders();
  }

  // Atualizar paginação
  function updatePagination() {
    state.pagination.totalItems = state.filteredOrders.length;
    state.pagination.currentPage = 1;
    renderPagination();
  }

  // Renderizar paginação
  function renderPagination() {
    if (!el.pagination) return;

    const totalPages = Math.ceil(
      state.pagination.totalItems / state.pagination.itemsPerPage
    );

    if (totalPages <= 1) {
      el.pagination.innerHTML = "";
      return;
    }

    let html = '<div class="pagination-controls">';

    // Botão anterior
    if (state.pagination.currentPage > 1) {
      html += `<button class="pagination-btn" data-page="${
        state.pagination.currentPage - 1
      }">
                <i class="fa-solid fa-chevron-left"></i>
            </button>`;
    }

    // Páginas
    const startPage = Math.max(1, state.pagination.currentPage - 2);
    const endPage = Math.min(totalPages, state.pagination.currentPage + 2);

    for (let i = startPage; i <= endPage; i++) {
      const isActive = i === state.pagination.currentPage ? "active" : "";
      html += `<button class="pagination-btn ${isActive}" data-page="${i}">${i}</button>`;
    }

    // Botão próximo
    if (state.pagination.currentPage < totalPages) {
      html += `<button class="pagination-btn" data-page="${
        state.pagination.currentPage + 1
      }">
                <i class="fa-solid fa-chevron-right"></i>
            </button>`;
    }

    html += "</div>";
    el.pagination.innerHTML = html;
  }

  /**
   * Obtém classe CSS baseada no status do pedido (padronizada com painel admin)
   * @param {string} status - Status do pedido
   * @returns {string} Classe CSS correspondente
   */
  function getStatusCssClass(status) {
    const statusMap = {
      pending: "novo",
      preparing: "preparo",
      ready: "pronto",
      on_the_way: "entrega",
      delivered: "concluido",
      paid: "concluido",
      completed: "concluido",
      cancelled: "cancelado",
    };
    return statusMap[status] || "novo";
  }

  /**
   * Renderizar lista de pedidos (apenas exibição)
   * @returns {Promise<void>}
   */
  async function renderOrders() {
    if (!el.ordersContainer) return;

    const startIndex =
      (state.pagination.currentPage - 1) * state.pagination.itemsPerPage;
    const endIndex = startIndex + state.pagination.itemsPerPage;
    const ordersToShow = state.filteredOrders.slice(startIndex, endIndex);

    if (ordersToShow.length === 0) {
      el.ordersContainer.innerHTML = `
                <div class="empty-state" style="text-align: center; padding: 40px; color: #666;">
                    <i class="fa-solid fa-clipboard-list" style="font-size: 48px; margin-bottom: 16px; opacity: 0.5;"></i>
                    <h3>Nenhum pedido encontrado</h3>
                    <p>Você ainda não fez nenhum pedido ou não há pedidos que correspondam aos filtros selecionados.</p>
                    <a href="../../index.html" style="display: inline-block; margin-top: 20px; padding: 12px 24px; background: #101010; color: white; text-decoration: none; border-radius: 8px;">Fazer primeiro pedido</a>
                </div>
            `;
      return;
    }

    // Buscar dados do usuário para exibir
    const usuario = window.getStoredUser ? window.getStoredUser() : null;
    const nomeUsuario = usuario?.full_name || usuario?.name || "Nome Completo";
    const telefoneBruto = usuario?.phone || usuario?.telefone || "(00)0000-000";
    const telefoneUsuario = formatarTelefone(telefoneBruto);

    const ordersHtml = await Promise.all(
      ordersToShow.map(async (order) => {
        // Validar orderId antes de processar
        const orderId = order.order_id || order.id;
        if (!orderId) {
          // Log apenas em desenvolvimento
          const isDev =
            typeof process !== "undefined" &&
            process.env?.NODE_ENV === "development";
          if (isDev) {
            console.warn("Pedido sem ID válido:", order);
          }
          return ""; // Retornar vazio para pedidos inválidos
        }

        // Validar e converter orderId para número para uso seguro em atributos
        const orderIdNum = parseInt(String(orderId), 10);
        if (isNaN(orderIdNum) || orderIdNum <= 0) {
          const isDev =
            typeof process !== "undefined" &&
            process.env?.NODE_ENV === "development";
          if (isDev) {
            console.warn("Pedido com ID inválido:", orderId);
          }
          return "";
        }

        const confirmationCode = escapeHTML(order.confirmation_code || "N/A");

        // Status formatado
        let statusText = formatOrderStatus(order.status);
        if (order.status === "pending") {
          statusText = "Recebido";
        }
        statusText = escapeHTML(statusText);

        const createdAt = formatDate(order.created_at);
        // Endereço com fallback para pickup e address_data (inline para evitar dependência externa)
        const isPickup =
          order.order_type === "pickup" || order.delivery_type === "pickup";
        let addressStr;
        if (isPickup) {
          addressStr = "Retirada no balcão";
        } else {
          const ad = order.address_data || {};
          // Verificar se address_data é um objeto com propriedades ou se é um objeto vazio
          let full =
            ad.delivery_address || order.delivery_address || order.address;

          // Se full é um objeto, construir string a partir das propriedades
          if (full && typeof full === "object" && !Array.isArray(full)) {
            const parts = [];
            if (full.street) parts.push(full.street);
            if (full.number) parts.push(full.number);
            if (full.complement) parts.push(full.complement);
            full = parts.length > 0 ? parts.join(", ") : null;
          }

          // Verificar se full é uma string válida e não é "[object Object]"
          if (
            full &&
            typeof full === "string" &&
            full.trim() !== "" &&
            full !== "[object Object]"
          ) {
            addressStr = full;
          } else {
            // Construir endereço a partir das propriedades individuais
            const parts = [];
            const street = ad.street || order.street || order.delivery_street;
            const number = ad.number || order.number || order.delivery_number;
            const complement =
              ad.complement || order.complement || order.delivery_complement;
            const neighborhood =
              ad.neighborhood ||
              order.neighborhood ||
              order.delivery_neighborhood;
            const city = ad.city || order.city || order.delivery_city;

            if (street) parts.push(street);
            if (number) parts.push(number);
            if (complement) parts.push(complement);

            addressStr =
              parts.length > 0 ? parts.join(", ") : "Endereço não informado";

            // Adicionar bairro e cidade se disponíveis
            if (neighborhood || city) {
              const locationParts = [];
              if (neighborhood) locationParts.push(neighborhood);
              if (city) locationParts.push(city);
              if (locationParts.length > 0) {
                addressStr += " - " + locationParts.join(" - ");
              }
            }
          }
        }
        const address = escapeHTML(addressStr);
        const total = order.total_amount || order.total || 0;
        const totalFormatted = formatCurrency(total);
        const items = Array.isArray(order.items) ? order.items : [];

        // Classe CSS do status
        const statusCssClass = getStatusCssClass(order.status);

        // Calcular tempo estimado baseado nos prazos do sistema + maior tempo de preparo dos produtos
        // Validar orderType para evitar valores inválidos
        const orderType =
          order.order_type === "pickup" || order.order_type === "delivery"
            ? order.order_type
            : "delivery";
        // Passar itens do pedido para calcular usando maior tempo de preparo dos produtos
        const timeEstimate = calculateEstimatedDeliveryTime(orderType, items);
        const tempoTexto = `${timeEstimate.minTime} - ${timeEstimate.maxTime} min`;

        // ALTERAÇÃO: Buscar promoções para todos os itens em paralelo
        const itemsWithPromotions = await Promise.all(
          items.map(async (item) => {
            let promotion = null;
            try {
              const productId = item.product_id || item.product?.id;
              if (productId) {
                // Buscar promoção que estava ativa na data do pedido
                const promo = await getPromotionByProductId(productId, false);
                if (promo) {
                  // Verificar se a promoção estava ativa na data do pedido
                  const orderDate = new Date(order.created_at);
                  const promoStart = new Date(promo.starts_at);
                  const promoEnd = new Date(promo.expires_at);
                  if (orderDate >= promoStart && orderDate <= promoEnd) {
                    promotion = promo;
                  }
                }
              }
            } catch (error) {
              // Se não houver promoção, continuar sem ela
              promotion = null;
            }
            return { item, promotion };
          })
        );

        // ALTERAÇÃO: Calcular total de descontos aplicados
        let totalDescontos = 0;
        itemsWithPromotions.forEach(({ item, promotion }) => {
          if (promotion) {
            const productId = item.product_id || item.product?.id;
            const originalPrice = parseFloat(item.unit_price || item.product?.price || 0);
            const priceInfo = calculatePriceWithPromotion(originalPrice, promotion);
            
            if (priceInfo.hasPromotion) {
              const itemQuantity = parseInt(item.quantity || 1, 10);
              
              // Calcular total de extras
              const extras = item.extras || item.additional_items || [];
              const extrasTotal = extras.reduce((sum, extra) => {
                return sum + (parseFloat(extra.ingredient_price || extra.price || 0) * parseFloat(extra.quantity || 0));
              }, 0);
              
              // ALTERAÇÃO: Priorizar additional_price sobre price para modificações de produtos
              // Calcular total de base_modifications
              const baseMods = item.base_modifications || [];
              const baseModsTotal = baseMods.reduce((sum, mod) => {
                return sum + (parseFloat(mod.additional_price || mod.ingredient_price || mod.price || 0) * Math.abs(parseInt(mod.delta || 0, 10) || 0));
              }, 0);
              
              // Preço total original (sem desconto)
              const precoTotalOriginal = (originalPrice * itemQuantity) + extrasTotal + baseModsTotal;
              
              // Preço total com desconto (já calculado pela API)
              const precoTotalComDesconto = parseFloat(
                item.item_subtotal || item.subtotal || precoTotalOriginal
              );
              
              // Desconto aplicado
              const descontoItem = Math.max(0, precoTotalOriginal - precoTotalComDesconto);
              totalDescontos += descontoItem;
            }
          }
        });

        // Renderizar itens (usar valores já calculados da API)
        const itemsHtml =
          itemsWithPromotions.length > 0
            ? itemsWithPromotions
                .map(({ item, promotion }) => {
                  // Validar item antes de processar
                  if (!item || typeof item !== "object") {
                    return "";
                  }

                  const itemName = escapeHTML(
                    item.product_name || item.product?.name || "Produto"
                  );
                  const itemQuantity = parseInt(item.quantity || 1, 10);

                  // Validar quantidade
                  if (isNaN(itemQuantity) || itemQuantity <= 0) {
                    return "";
                  }

                  // Usar subtotal do item (já calculado pela API)
                  const itemTotal =
                    item.item_subtotal ||
                    item.subtotal ||
                    parseFloat(item.unit_price || 0) * itemQuantity;
                  
                  // ALTERAÇÃO: Calcular preço original para exibição quando houver promoção
                  let precoOriginalHtml = "";
                  if (promotion) {
                    const originalPrice = parseFloat(item.unit_price || item.product?.price || 0);
                    const priceInfo = calculatePriceWithPromotion(originalPrice, promotion);
                    
                    if (priceInfo.hasPromotion) {
                      // Calcular total de extras
                      const extras = item.extras || item.additional_items || [];
                      const extrasTotal = extras.reduce((sum, extra) => {
                        return sum + (parseFloat(extra.ingredient_price || extra.price || 0) * parseFloat(extra.quantity || 0));
                      }, 0);
                      
                      // ALTERAÇÃO: Priorizar additional_price sobre price para modificações de produtos
                      // Calcular total de base_modifications
                      const baseMods = item.base_modifications || [];
                      const baseModsTotal = baseMods.reduce((sum, mod) => {
                        return sum + (parseFloat(mod.additional_price || mod.ingredient_price || mod.price || 0) * Math.abs(parseInt(mod.delta || 0, 10) || 0));
                      }, 0);
                      
                      // Preço total original (sem desconto)
                      const precoTotalOriginal = (originalPrice * itemQuantity) + extrasTotal + baseModsTotal;
                      
                      precoOriginalHtml = `<span class="item-price-original" style="text-decoration: line-through; color: #999; font-size: 0.9em; margin-right: 8px;">R$ ${formatCurrency(precoTotalOriginal)}</span>`;
                    }
                  }

                  // Preparar HTML para extras e modificações (versão compacta)
                  const extras = item.extras || item.additional_items || [];
                  const baseMods = item.base_modifications || [];
                  const notes = item.notes || item.observacao || "";
                  const hasModifications =
                    extras.length > 0 || baseMods.length > 0;
                  const hasNotes = notes && String(notes).trim() !== "";

                  let modificationsHtml = "";
                  if (hasModifications || hasNotes) {
                    const badges = [];

                    if (extras.length > 0) {
                      // ALTERAÇÃO: Escape de números para prevenir XSS (mesmo que seja número, garante segurança)
                      const extrasCount = parseInt(extras.length, 10) || 0;
                      badges.push(
                        `<span class="modification-badge extra"><i class="fa-solid fa-plus"></i> ${extrasCount} extra(s)</span>`
                      );
                    }

                    // ALTERAÇÃO: Validação mais robusta de delta para prevenir erros
                    const addCount = baseMods.filter((bm) => {
                      const delta = parseInt(bm?.delta || 0, 10);
                      return !isNaN(delta) && delta > 0;
                    }).length;
                    const removeCount = baseMods.filter((bm) => {
                      const delta = parseInt(bm?.delta || 0, 10);
                      return !isNaN(delta) && delta < 0;
                    }).length;

                    if (addCount > 0) {
                      badges.push(
                        `<span class="modification-badge mod-add"><i class="fa-solid fa-circle-plus"></i> +${addCount}</span>`
                      );
                    }
                    if (removeCount > 0) {
                      badges.push(
                        `<span class="modification-badge mod-remove"><i class="fa-solid fa-circle-minus"></i> -${removeCount}</span>`
                      );
                    }

                    modificationsHtml = `
                            ${
                              badges.length > 0
                                ? `<div class="order-item-modifications-compact">${badges.join(
                                    ""
                                  )}</div>`
                                : ""
                            }
                            ${
                              hasNotes
                                ? `<div class="order-item-notes-compact"><strong>Obs:</strong> ${escapeHTML(
                                    String(notes).trim()
                                  )}</div>`
                                : ""
                            }
                    `;
                  }

                  // ALTERAÇÃO: Validar itemTotal antes de formatar para prevenir NaN ou Infinity
                  const safeItemTotal = isFinite(itemTotal) && itemTotal >= 0 ? itemTotal : 0;
                  
                  return `
                    <div class="order-item">
                        <div class="item-info">
                            <div>
                                <span class="item-qtd">${itemQuantity}</span>
                                <span class="item-name">${itemName}</span>
                            </div>
                            <div class="item-price-container" style="display: flex; align-items: center; gap: 0.5rem;">
                                ${precoOriginalHtml}
                                <span class="item-price">R$ ${formatCurrency(safeItemTotal)}</span>
                            </div>
                        </div>
                        ${modificationsHtml ? `<div class="order-item-modifications">${modificationsHtml}</div>` : ''}
                    </div>
                `;
                })
                .filter((html) => html !== "")
                .join("")
            : `
                <div class="order-item">
                    <div class="item-info">
                        <div>
                            <span class="item-name">Carregando itens...</span>
                        </div>
                        <span class="item-price">-</span>
                    </div>
                </div>
            `;

        // Escapar orderId para uso seguro em atributos HTML
        const safeOrderId = escapeHTML(String(orderIdNum));

        // Determinar cor do tempo estimado baseado no status
        let timeColorClass = "time-green";
        const timeParts = tempoTexto.split(" - ");
        if (timeParts.length === 2) {
          const minTime = parseInt(timeParts[0], 10);
          const maxTime = parseInt(timeParts[1].replace(" min", ""), 10);
          // Aplicar lógica simples de cor (verde para status novos, amarelo/vermelho conforme necessário)
          if (order.status === "pending" || order.status === "preparing") {
            timeColorClass =
              minTime > maxTime * 0.8 ? "time-yellow" : "time-green";
            if (minTime > maxTime) timeColorClass = "time-red";
          } else {
            timeColorClass = "time-green";
          }
        }

        return `<div class="order-card" data-order-id="${safeOrderId}">
                    <div class="order-header">
                        <div class="order-id-status">
                            <div class="order-id">
                                <span class="id-text">${confirmationCode}</span>
                                <span class="status-badge status-${statusCssClass}" id="status-text-${safeOrderId}">${statusText}</span>
                            </div>
                            <div class="order-time-estimate ${timeColorClass}">
                                <i class="fa-solid fa-clock"></i>
                                <span class="time-display">
                                    <span class="time-text">${tempoTexto}</span>
                                </span>
                            </div>
                        </div>
                        <div class="order-date">${createdAt}</div>
                    </div>
                    
                    <div class="order-customer">
                        <div class="customer-name">${escapeHTML(
                          nomeUsuario
                        )}</div>
                        <div class="customer-info">
                            <div class="info-item">
                                <i class="fa-solid fa-phone"></i>
                                <span>${escapeHTML(telefoneUsuario)}</span>
                            </div>
                            <div class="info-item ${
                              isPickup ? "order-pickup" : ""
                            }">
                                <i class="fa-solid ${
                                  isPickup ? "fa-store" : "fa-location-dot"
                                }"></i>
                                <span>${address}</span>
                                ${
                                  isPickup
                                    ? '<span class="pickup-badge">Retirada</span>'
                                    : ""
                                }
                            </div>
                        </div>
                    </div>

                    <div class="order-items">
                        ${itemsHtml}
                    </div>

                    <div class="order-footer">
                        <div class="order-summary">
                            ${totalDescontos > 0 ? `
                                <div class="order-discount" style="font-size: 0.9em; color: #666; margin-bottom: 4px;">
                                    <span>Descontos: </span>
                                    <span style="color: #28a745; font-weight: 600;">-R$ ${formatCurrency(totalDescontos)}</span>
                                </div>
                            ` : ''}
                            <div class="order-total">
                                <span class="total-label">Total</span>
                                <span class="total-value">R$ ${totalFormatted}</span>
                            </div>
                        </div>
                        <button class="order-action-btn btn-view-details" data-order-id="${safeOrderId}">Ver mais</button>
                    </div>
                </div>`;
      })
    ).then(results => results.filter((html) => html !== "").join("")); // Filtrar entradas vazias

    el.ordersContainer.innerHTML = ordersHtml;
  }

  /**
   * Redirecionar para página de detalhes (apenas navegação)
   * @param {number} orderId - ID do pedido
   * @returns {void}
   */
  function loadOrderDetails(orderId) {
    // Validar orderId antes de redirecionar
    const orderIdNum = parseInt(String(orderId), 10);
    if (isNaN(orderIdNum) || orderIdNum <= 0) {
      showError("ID do pedido inválido");
      return;
    }

    // Escapar orderId na URL para prevenir XSS
    const safeOrderId = encodeURIComponent(String(orderIdNum));
    window.location.href = `info-pedido.html?id=${safeOrderId}`;
  }

  // ============================================================================
  // Eventos (apenas interação com exibição)
  // ============================================================================

  // Anexar eventos
  function attachEvents() {
    // Botão voltar - redireciona para página inicial
    if (el.btnVoltar) {
      el.btnVoltar.addEventListener("click", () => {
        window.location.href = "../../index.html";
      });
    }

    // Filtro de status
    if (el.filterStatus) {
      el.filterStatus.addEventListener("change", (e) => {
        state.filters.status = e.target.value;
        applyFilters();
      });
    }

    // Botão refresh
    if (el.btnRefresh) {
      el.btnRefresh.addEventListener("click", async () => {
        await loadOrders();
      });
    }

    // Paginação
    if (el.pagination) {
      el.pagination.addEventListener("click", (e) => {
        const btn = e.target.closest(".pagination-btn");
        if (btn && btn.dataset.page) {
          const pageNum = parseInt(String(btn.dataset.page), 10);
          if (!isNaN(pageNum) && pageNum > 0) {
            state.pagination.currentPage = pageNum;
            renderOrders();
          }
        }
      });
    }

    // Botão "Ver mais" - redireciona para detalhes
    if (el.ordersContainer) {
      el.ordersContainer.addEventListener("click", (e) => {
        const btn = e.target.closest("button");
        if (!btn) return;

        const orderId = btn.dataset.orderId;
        if (!orderId) return;

        const orderIdNum = parseInt(String(orderId), 10);
        if (isNaN(orderIdNum) || orderIdNum <= 0) {
          showError("ID do pedido inválido");
          return;
        }

        if (btn.classList.contains("btn-view-details")) {
          loadOrderDetails(orderIdNum);
        }
      });
    }
  }

  /**
   * Verificar se usuário está logado
   * @returns {boolean} true se logado, false caso contrário
   */
  function checkUserLogin() {
    const user = window.getStoredUser ? window.getStoredUser() : null;
    if (!user) {
      // Usar sistema customizado de alertas em vez de alert() nativo
      showError("Você precisa estar logado para ver seu histórico de pedidos.");
      // Pequeno delay para permitir exibição do alerta antes do redirecionamento
      setTimeout(() => {
        window.location.href = "login.html";
      }, 500);
      return false;
    }
    return true;
  }

  // Armazenar referências dos callbacks para poder removê-los depois
  let socketCallbacks = {
    orderCreated: null,
    orderStatusChanged: null
  };

  /**
   * Configura listeners de eventos WebSocket para atualização em tempo real
   * ALTERAÇÃO: Melhorado para garantir que os listeners sejam configurados corretamente
   */
  function setupSocketListeners() {
    // ALTERAÇÃO: Garantir que o socket está conectado
    // Se não estiver, tentar conectar
    if (!socketService.getConnected()) {
      socketService.connect();
    }

    // ALTERAÇÃO: Remover listeners antigos se existirem (evita duplicatas)
    if (socketCallbacks.orderCreated) {
      socketService.off('order.created', socketCallbacks.orderCreated);
    }
    if (socketCallbacks.orderStatusChanged) {
      socketService.off('order.status_changed', socketCallbacks.orderStatusChanged);
    }

    // 1. Listener para novo pedido criado (quando o cliente faz um pedido)
    socketCallbacks.orderCreated = (orderData) => {
      
      const orderId = orderData.order_id;
      
      // Verifica se o pedido já existe na lista (evita duplicatas)
      const existingIndex = state.orders.findIndex((o) => 
        o.id === orderId || o.order_id === orderId
      );
      
      if (existingIndex !== -1) {
        // Se já existe, apenas atualiza e re-renderiza
        applyFilters();
        renderOrders();
        return;
      }
      
      // Buscar detalhes completos do pedido via API
      getOrderDetails(orderId)
        .then((response) => {
          const fullOrder = response?.success ? response.data : response;
          
          if (fullOrder) {
            // Garantir que o ID está correto
            if (!fullOrder.id) {
              fullOrder.id = orderId;
            }
            if (!fullOrder.order_id) {
              fullOrder.order_id = orderId;
            }
            
            // Adiciona o novo pedido ao início da lista
            state.orders.unshift(fullOrder);
            
            // Aplica filtros
            applyFilters();
            
            // Renderiza a lista atualizada
            renderOrders();
            
            // Adiciona animação de destaque
            setTimeout(() => {
              const newCard = document.querySelector(`[data-order-id="${orderId}"]`);
              if (newCard) {
                newCard.classList.add('highlight-new-order');
                setTimeout(() => {
                  newCard.classList.remove('highlight-new-order');
                }, 3000);
              }
            }, 100);
          }
        })
        .catch((error) => {
          // Em caso de erro, recarrega a lista completa
          loadOrders();
        });
    };
    
    // Registrar o listener
    socketService.on('order.created', socketCallbacks.orderCreated);

    // 2. Listener para mudança de status do pedido (apenas para pedidos do usuário atual)
    socketCallbacks.orderStatusChanged = (data) => {
      // ALTERAÇÃO: A API envia: { order_id, new_status, old_status, user_id }
      const orderId = data.order_id;
      const newStatus = data.new_status;
      
      // ALTERAÇÃO: Garantir que orderId seja processado no mesmo formato usado na renderização
      // Na renderização: orderIdNum = parseInt(String(orderId), 10) e safeOrderId = escapeHTML(String(orderIdNum))
      // Mas para IDs de elementos HTML, não precisamos escapeHTML, apenas garantir que seja string válida
      const orderIdNum = parseInt(String(orderId || ''), 10);
      if (isNaN(orderIdNum) || orderIdNum <= 0) {
        return;
      }
      // Usar o mesmo formato da renderização (escapeHTML é usado apenas para segurança, mas IDs são numéricos)
      const safeOrderId = String(orderIdNum);
      
      // Buscar o elemento de status diretamente no DOM (atualização sem recarregar lista)
      const statusElement = document.getElementById(`status-text-${safeOrderId}`);
      const containerElement = document.querySelector(`[data-order-id="${safeOrderId}"]`);
      
      // Atualizar elemento de status se existir
      if (statusElement) {
        // Traduzir o status usando formatOrderStatus (mesma função usada na renderização)
        let statusText = formatOrderStatus(newStatus);
        
        // ALTERAÇÃO: Aplicar mesma lógica da renderização (pending -> "Recebido")
        if (newStatus === "pending") {
          statusText = "Recebido";
        }
        
        // Atualizar texto do status
        statusElement.textContent = statusText;
        
        // Atualizar classe CSS do badge (remover todas as classes de status e adicionar a nova)
        const statusClasses = ['status-pending', 'status-preparing', 'status-ready', 'status-in_progress', 
                              'status-on_the_way', 'status-delivered', 'status-completed', 'status-cancelled', 'status-paid'];
        statusElement.classList.remove(...statusClasses);
        statusElement.classList.add(`status-${newStatus}`);
        statusElement.classList.add('status-badge'); // Garantir que a classe base está presente
      }
      
      // Atualizar classes do container/card se existir
      if (containerElement) {
        // Remove classes antigas de status
        containerElement.classList.remove('status-pending', 'status-preparing', 'status-ready', 
                                         'status-in_progress', 'status-on_the_way', 'status-delivered', 
                                         'status-completed', 'status-cancelled', 'status-paid');
        // Adiciona nova classe de status
        containerElement.classList.add(`status-${newStatus}`);
        
        // Adicionar animação de destaque
        containerElement.classList.add('order-status-changed');
        containerElement.style.animation = 'pulse 0.5s ease-in-out';
        
        setTimeout(() => {
          containerElement.classList.remove('order-status-changed');
          containerElement.style.animation = '';
        }, 2000);
      }
      
      // ALTERAÇÃO: Atualizar o estado interno também (sem recarregar a lista)
      const orderIndex = state.orders.findIndex(
        (order) => (order.id === orderId || order.order_id === orderId)
      );
      
      if (orderIndex !== -1) {
        // Atualiza o status do pedido no estado
        state.orders[orderIndex].status = newStatus;
        
        // Garantir que o pedido tenha os IDs corretos
        if (!state.orders[orderIndex].id) {
          state.orders[orderIndex].id = orderId;
        }
        if (!state.orders[orderIndex].order_id) {
          state.orders[orderIndex].order_id = orderId;
        }
        
        // ALTERAÇÃO: Aplicar filtros locais apenas se necessário (sem recarregar da API)
        // Se houver filtro ativo, verificar se o pedido ainda deve aparecer
        if (state.filters.status) {
          const shouldShow = state.filters.status === newStatus;
          const isInFiltered = state.filteredOrders.some(
            (order) => (order.id === orderId || order.order_id === orderId)
          );
          
          // Se o pedido não deve mais aparecer com o novo status, remover dos filtrados
          if (!shouldShow && isInFiltered) {
            state.filteredOrders = state.filteredOrders.filter(
              (order) => !(order.id === orderId || order.order_id === orderId)
            );
            // Remover o card do DOM se não deve mais aparecer
            if (containerElement) {
              containerElement.style.transition = 'opacity 0.3s ease-out';
              containerElement.style.opacity = '0';
              setTimeout(() => {
                containerElement.remove();
              }, 300);
            }
          } 
          // Se o pedido deve aparecer mas não está nos filtrados, adicionar
          else if (shouldShow && !isInFiltered) {
            state.filteredOrders.push(state.orders[orderIndex]);
            // Re-renderizar apenas este pedido (ou recarregar se necessário)
            renderOrders();
          }
        }
      } else {
        // Se o pedido não estiver na lista, pode ser um novo pedido ou um que não foi carregado
        // Tenta buscar o pedido e adicionar à lista
        getOrderDetails(orderId)
          .then((response) => {
            const fullOrder = response?.success ? response.data : response;
            if (fullOrder) {
              // Adiciona o pedido à lista (mesmo que seja concluído)
              state.orders.unshift(fullOrder);
              
              // Aplica filtros
              applyFilters();
              
              // Renderiza a lista atualizada
              renderOrders();
              
              // Adiciona animação
              setTimeout(() => {
                // ALTERAÇÃO: Processar orderId no mesmo formato usado na renderização
                const orderIdNum = parseInt(String(orderId || ''), 10);
                if (!isNaN(orderIdNum) && orderIdNum > 0) {
                  const safeOrderId = String(orderIdNum);
                  const newCard = document.querySelector(`[data-order-id="${safeOrderId}"]`);
                  if (newCard) {
                    newCard.classList.add('order-status-changed');
                    newCard.style.animation = 'pulse 0.5s ease-in-out';
                    setTimeout(() => {
                      newCard.classList.remove('order-status-changed');
                      newCard.style.animation = '';
                    }, 2000);
                  }
                }
              }, 100);
            } else {
              // Se não conseguir buscar, recarrega a lista completa
              loadOrders();
            }
          })
          .catch((error) => {
            // Em caso de erro, recarrega a lista completa
            loadOrders();
          });
      }
    };
    
    // Registrar o listener
    socketService.on('order.status_changed', socketCallbacks.orderStatusChanged);

    // ALTERAÇÃO: Reconfigurar listeners se o socket reconectar
    window.addEventListener('socket:reconnected', () => {
      setupSocketListeners();
    });

    // ALTERAÇÃO: Reconfigurar listeners quando o socket conectar
    window.addEventListener('socket:connected', () => {
      setupSocketListeners();
    });
  }

  // Inicializar
  async function init() {
    if (!checkUserLogin()) return;

    initElements();

    // Carregar prazos de entrega estimados das configurações públicas
    await loadEstimatedTimes();

    attachEvents();
    await loadOrders();
    
    // ALTERAÇÃO: Configurar listeners WebSocket após carregar pedidos
    // Garantir que o socket está conectado antes de configurar
    if (socketService.getConnected()) {
      setupSocketListeners();
    } else {
      // Se não estiver conectado, tentar conectar e configurar depois
      socketService.connect();
      
      // Aguardar conexão ou configurar imediatamente se já estiver conectado
      const checkConnection = setInterval(() => {
        if (socketService.getConnected()) {
          clearInterval(checkConnection);
          setupSocketListeners();
        }
      }, 100);
      
      // Timeout de segurança (5 segundos)
      setTimeout(() => {
        clearInterval(checkConnection);
        // Tentar configurar mesmo assim (o socket pode estar configurando)
        setupSocketListeners();
      }, 5000);
    }
  }

  // Inicializar quando DOM estiver pronto
  document.addEventListener("DOMContentLoaded", init);
})();
