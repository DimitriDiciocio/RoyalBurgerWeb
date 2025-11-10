/**
 * Histórico de Pedidos
 * Interface para clientes visualizarem seus pedidos
 */

import {
  getMyOrders,
  getOrderDetails,
  formatOrderStatus,
} from "../api/orders.js";
import { showError } from "./alerts.js";

// Importar helper de configurações
import * as settingsHelper from "../utils/settings-helper.js";
import { escapeHTML } from "../utils/html-sanitizer.js";

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
      itemsPerPage: 5,
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
   * Calcula tempo estimado de entrega baseado nos prazos do sistema
   * Conforme o guia completo: considera todos os prazos para delivery ou pickup
   * @param {string} orderType - Tipo do pedido ('delivery' ou 'pickup'). Padrão: 'delivery'
   * @returns {Object} Objeto com minTime e maxTime em minutos
   */
  function calculateEstimatedDeliveryTime(orderType = "delivery") {
    // Validar orderType
    const validOrderType =
      orderType === "pickup" || orderType === "delivery"
        ? orderType
        : "delivery";

    if (!estimatedTimesCache) {
      // Fallback se não carregou os tempos
      // Delivery: 5+20+5+15 = 45, Pickup: 5+20+5+0 = 30
      const fallbackTotal = validOrderType === "delivery" ? 45 : 30;
      return {
        minTime: fallbackTotal,
        maxTime: fallbackTotal + 15,
      };
    }

    // Extrair prazos do cache (com fallbacks seguros)
    const initiation = Number(estimatedTimesCache.initiation_minutes) || 5;
    const preparation = Number(estimatedTimesCache.preparation_minutes) || 20;
    const dispatch = Number(estimatedTimesCache.dispatch_minutes) || 5;
    const delivery =
      validOrderType === "delivery"
        ? Number(estimatedTimesCache.delivery_minutes) || 15
        : 0;

    // Validar que os valores são números positivos
    const safeInitiation = Math.max(0, initiation);
    const safePreparation = Math.max(0, preparation);
    const safeDispatch = Math.max(0, dispatch);
    const safeDelivery = Math.max(0, delivery);

    // Calcular tempo total conforme fluxo do pedido
    // Para pedido novo (pending): inclui todos os prazos
    // Delivery: iniciação + preparo + envio + entrega
    // Pickup: iniciação + preparo + envio (sem entrega)
    const totalMinutes =
      safeInitiation + safePreparation + safeDispatch + safeDelivery;

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
      const result = await getMyOrders();

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
   * @returns {void}
   */
  function renderOrders() {
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

    const ordersHtml = ordersToShow
      .map((order) => {
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

        // Calcular tempo estimado baseado nos prazos do sistema
        // Validar orderType para evitar valores inválidos
        const orderType =
          order.order_type === "pickup" || order.order_type === "delivery"
            ? order.order_type
            : "delivery";
        const timeEstimate = calculateEstimatedDeliveryTime(orderType);
        const tempoTexto = `${timeEstimate.minTime} - ${timeEstimate.maxTime} min`;

        // Renderizar itens (usar valores já calculados da API)
        const itemsHtml =
          items.length > 0
            ? items
                .map((item) => {
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
                      badges.push(
                        `<span class="modification-badge extra"><i class="fa-solid fa-plus"></i> ${extras.length} extra(s)</span>`
                      );
                    }

                    const addCount = baseMods.filter(
                      (bm) => parseInt(bm.delta || 0, 10) > 0
                    ).length;
                    const removeCount = baseMods.filter(
                      (bm) => parseInt(bm.delta || 0, 10) < 0
                    ).length;

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
                        <div class="order-item-modifications">
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
                        </div>
                    `;
                  }

                  return `
                    <div class="order-item">
                        <div class="item-info">
                            <span class="item-qtd">${itemQuantity}</span>
                            <span class="item-name">${itemName}</span>
                        </div>
                        <span class="item-price">R$ ${formatCurrency(
                          itemTotal
                        )}</span>
                        ${modificationsHtml}
                    </div>
                `;
                })
                .filter((html) => html !== "")
                .join("")
            : `
                <div class="order-item">
                    <div class="item-info">
                        <span class="item-name">Carregando itens...</span>
                    </div>
                    <span class="item-price">-</span>
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
                                <span class="status-badge status-${statusCssClass}">${statusText}</span>
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
                        <div class="order-total">
                            <span class="total-label">Total</span>
                            <span class="total-value">R$ ${totalFormatted}</span>
                        </div>
                        <button class="order-action-btn btn-view-details" data-order-id="${safeOrderId}">Ver mais</button>
                    </div>
                </div>`;
      })
      .filter((html) => html !== "")
      .join(""); // Filtrar entradas vazias

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

  // Inicializar
  async function init() {
    if (!checkUserLogin()) return;

    initElements();

    // Carregar prazos de entrega estimados das configurações públicas
    await loadEstimatedTimes();

    attachEvents();
    await loadOrders();
  }

  // Inicializar quando DOM estiver pronto
  document.addEventListener("DOMContentLoaded", init);
})();
