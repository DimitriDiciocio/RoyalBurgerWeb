/**
 * Gerenciamento de Pedidos - Painel Administrativo
 * Interface para administradores gerenciarem pedidos em tempo real
 */

// APIs exclusivas para gerenciamento administrativo (não histórico)
import {
  getAllOrders,
  getOrderDetails,
  updateOrderStatus,
  formatOrderStatus,
} from "../../api/orders.js";
import {
  getDashboardMetrics,
  formatCurrency,
  formatTime,
} from "../../api/dashboard.js";
import { getUserById } from "../../api/user.js";
import { getFinancialMovements } from "../../api/financial-movements.js";
import { showSuccess, showError, showConfirm } from "../alerts.js";
import { debounce } from "../../utils/performance-utils.js";
import { escapeHTML as escapeHTMLCentralized } from "../../utils/html-sanitizer.js";
import { showLoadingOverlay, hideLoadingOverlay } from "../../utils/loading-indicator.js";

// Constantes
const MAX_CONCURRENT_REQUESTS = 10;
const MAX_PHONE_CACHE_SIZE = 100; // Limite do cache de telefones para evitar vazamento de memória
const AUTO_REFRESH_INTERVAL = 30000; // 30 segundos
const SEARCH_DEBOUNCE_MS = 300;
const VISIBILITY_CHECK_INTERVAL = 100;
const MAX_VISIBILITY_CHECK_ATTEMPTS = 100;
const ACTIVE_STATUSES = ["pending", "preparing", "on_the_way"]; // Status que contam como ativos para métricas de atraso
const FINAL_STATUSES = ["completed", "delivered", "paid", "cancelled"]; // Status finais que não permitem atualização

// Verificar se está em modo de desenvolvimento (browser-safe)
const isDevelopment = () => {
  // Verificação segura para ambiente de desenvolvimento
  try {
    return (
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1" ||
      window.location.hostname.includes(".local")
    );
  } catch {
    return false;
  }
};

(function initOrderManagement() {
  // Verificar se estamos na página do painel administrativo e se a seção de pedidos existe
  // Esta seção é diferente do histórico de pedidos (hist-pedidos.html)
  const secaoPedidos = document.getElementById("secao-pedidos");
  if (!secaoPedidos) return;

  // Verificar se estamos no painel administrativo (não no histórico)
  if (!document.getElementById("nav-pedidos")) {
    // ALTERAÇÃO: Log condicional apenas em modo debug
    if (typeof window !== 'undefined' && window.DEBUG_MODE) {
      console.warn(
        "order-management.js: Seção de pedidos do painel administrativo não encontrada"
      );
    }
    return;
  }

  const state = {
    orders: [],
    filteredOrders: [],
    currentOrder: null,
    metrics: {},
    filters: {
      search: "",
      status: "",
      channel: "",
      period: "today",
    },
    // ALTERAÇÃO: Estado de paginação adicionado
    pagination: {
      currentPage: 1,
      pageSize: 20,
      totalPages: 1,
      totalItems: 0,
    },
    loading: false,
    error: null,
    autoRefresh: true,
    refreshInterval: null,
    visibilityCheckInterval: null,
    visibilityObserver: null, // ALTERAÇÃO: MutationObserver para verificação de visibilidade
    userPhoneCache: {}, // Cache para telefones dos usuários (evita múltiplas requisições)
  };

  // Refs DOM
  let el = {};

  // Inicializar elementos DOM
  function initElements() {
    el = {
      // Filtros
      searchInput: document.getElementById("busca-pedido"),
      filterStatus: document.getElementById("filtro-status-pedido"),
      filterChannel: document.getElementById("filtro-canais-pedido"),
      filterPeriod: document.getElementById("filtro-data-pedido"),

      // Métricas
      metricActiveOrders: document.getElementById("metric-active-orders"),
      metricNovos: document.getElementById("metric-novos"),
      metricEmPreparo: document.getElementById("metric-em-preparo"),
      metricProntosEntrega: document.getElementById("metric-prontos-entrega"),
      metricPronto: document.getElementById("metric-pronto"),
      metricEntrega: document.getElementById("metric-entrega"),
      metricConcluidos: document.getElementById("metric-concluidos"),
      metricCancelados: document.getElementById("metric-cancelados"),
      metricTempoMedio: document.getElementById("metric-tempo-medio"),
      metricAtrasos: document.getElementById("metric-atrasos"),

      // Lista de pedidos
      ordersList: document.getElementById("orders-list"),
    };
  }

  // ============================================================================
  // Funções utilitárias exclusivas para gerenciamento administrativo
  // (NÃO compartilhadas com histórico de pedidos)
  // ============================================================================

  /**
   * Formatar data para exibição no painel administrativo
   * @param {string} dateString - String de data ISO
   * @returns {string} Data formatada ou fallback
   */
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

  /**
   * Sanitizar HTML para prevenir XSS
   * @deprecated Use escapeHTMLCentralized de html-sanitizer.js diretamente
   * @param {any} text - Texto a ser sanitizado
   * @returns {string} HTML sanitizado
   */
  function escapeHTML(text) {
    return escapeHTMLCentralized(text);
  }

  /**
   * Formatar telefone para exibição (baseado na implementação de order-history.js)
   * @param {string|number} telefone - Telefone a ser formatado
   * @returns {string} Telefone formatado
   */
  function formatarTelefone(telefone) {
    if (
      !telefone ||
      telefone === "(00)0000-000" ||
      telefone === "Não informado"
    ) {
      return telefone || "(00)0000-000";
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

  /**
   * Normalizar telefone para exibição (validação e formatação)
   * @param {any} phone - Telefone a ser normalizado
   * @returns {string} Telefone formatado ou padrão
   */
  function normalizePhone(phone) {
    if (!phone || phone === null || phone === undefined) {
      return "(00)0000-000";
    }

    const phoneStr = String(phone).trim();
    if (phoneStr === "" || phoneStr === "undefined" || phoneStr === "null") {
      return "(00)0000-000";
    }

    const formatted = formatarTelefone(phoneStr);
    return formatted && formatted.trim() !== "" ? formatted : "(00)0000-000";
  }

  /**
   * Limpar cache de telefones quando exceder limite
   * Evita vazamento de memória
   */
  function cleanupPhoneCache() {
    const cacheKeys = Object.keys(state.userPhoneCache);
    if (cacheKeys.length > MAX_PHONE_CACHE_SIZE) {
      // Remover 20% das entradas mais antigas (FIFO simples)
      const keysToRemove = cacheKeys.slice(
        0,
        Math.floor(cacheKeys.length * 0.2)
      );
      keysToRemove.forEach((key) => delete state.userPhoneCache[key]);
    }
  }

  /**
   * Extrair tempo de preparo de um item (função auxiliar para evitar duplicação)
   * @param {Object} item - Item do pedido
   * @returns {number} Tempo de preparo em minutos ou 0 se inválido
   */
  function extractPreparationTimeFromItem(item) {
    if (!item || typeof item !== "object") return 0;

    const product = item.product || {};
    let prepTime = 0;

    // Priorizar tempo do produto/item
    if (
      product.preparation_time_minutes !== undefined &&
      product.preparation_time_minutes !== null
    ) {
      prepTime = parseInt(product.preparation_time_minutes, 10);
    } else if (
      item.preparation_time_minutes !== undefined &&
      item.preparation_time_minutes !== null
    ) {
      prepTime = parseInt(item.preparation_time_minutes, 10);
    } else if (
      product.preparation_time !== undefined &&
      product.preparation_time !== null
    ) {
      prepTime = parseInt(product.preparation_time, 10);
    }

    return !isNaN(prepTime) && prepTime > 0 ? Math.max(0, prepTime) : 0;
  }

  /**
   * Calcular tempo de preparo baseado nos produtos do pedido
   * Usa o tempo de preparo de cada produto em vez de configurações fixas
   * @param {Object} order - Objeto do pedido
   * @returns {number} Tempo estimado de preparo em minutos
   */
  function calculatePreparationTime(order) {
    if (
      !order.items ||
      !Array.isArray(order.items) ||
      order.items.length === 0
    ) {
      return 15; // Fallback padrão
    }

    // Pegar o maior tempo de preparo entre os itens (preparo paralelo)
    const maxPrepTime = order.items.reduce((max, item) => {
      const prepTime = extractPreparationTimeFromItem(item);
      return Math.max(max, prepTime);
    }, 0);

    // Se encontrou tempo válido, usar o maior tempo + buffer
    if (maxPrepTime > 0) {
      // Adicionar um pequeno buffer para múltiplos itens
      const buffer =
        order.items.length > 1 ? Math.ceil(order.items.length * 0.5) : 0;
      return maxPrepTime + buffer;
    }

    return 15; // Fallback padrão
  }

  /**
   * Calcular tempo estimado da etapa atual e retornar status visual
   * Cada etapa tem seu próprio tempo, não soma o ciclo completo
   * @param {Object} order - Objeto do pedido
   * @returns {Object} Objeto com tempo atual, máximo e classe de cor
   */
  function calculateTimeEstimate(order) {
    if (!order?.created_at) {
      return {
        text: "-min / -min",
        currentMinutes: 0,
        maxMinutes: 0,
        colorClass: "",
      };
    }

    // Status finais: não calcular mais tempo (pedido concluído/cancelado)
    if (FINAL_STATUSES.includes(order.status)) {
      return {
        text: "- / -",
        currentMinutes: 0,
        maxMinutes: 0,
        colorClass: "",
      };
    }

    const now = new Date();

    // Determinar quando a etapa atual começou
    let stageStartTime;
    let estimatedMax = 0;

    switch (order.status) {
      case "pending":
        // Etapa: Iniciação/Processamento
        stageStartTime = new Date(order.created_at);
        estimatedMax = 5; // Tempo de processamento/iniciação
        break;

      case "preparing":
        // Etapa: Preparo (usar tempo dos produtos)
        // Tentar pegar timestamp quando mudou para preparing
        stageStartTime = new Date(
          order.preparing_at || order.updated_at || order.created_at
        );
        estimatedMax = calculatePreparationTime(order); // Tempo baseado nos produtos
        break;

      case "on_the_way":
        // Etapa: Entrega
        // Tentar pegar timestamp quando mudou para on_the_way
        stageStartTime = new Date(
          order.on_the_way_at || order.updated_at || order.created_at
        );
        estimatedMax = 30; // Tempo de entrega
        break;

      default:
        stageStartTime = new Date(order.updated_at || order.created_at);
        estimatedMax = 15;
        break;
    }

    // Priorizar estimated_delivery da API se disponível e for a etapa final
    if (order.estimated_delivery && order.status === "on_the_way") {
      const estimated =
        order.estimated_delivery.estimated_time ||
        order.estimated_delivery.total ||
        0;
      if (estimated > 0 && isFinite(estimated)) {
        estimatedMax = Math.max(0, estimated);
      }
    }

    // Validar estimatedMax antes de calcular diferença
    const safeMaxMinutes =
      isFinite(estimatedMax) && estimatedMax > 0 ? estimatedMax : 0;

    // Calcular tempo decorrido desde o início da etapa atual
    // Validar datas para evitar valores inválidos (negativos ou muito grandes)
    const diffMs = now - stageStartTime;
    const diffMinutes =
      diffMs > 0 && diffMs < 86400000 ? Math.floor(diffMs / 60000) : 0; // Máximo 24h

    // Validar valores numéricos antes de exibir
    const safeCurrentMinutes =
      isFinite(diffMinutes) && diffMinutes >= 0 ? diffMinutes : 0;

    // Calcular cor baseado no progresso da etapa atual
    const estimatedMin = Math.floor(safeMaxMinutes * 0.7);
    let colorClass = "time-green";

    if (safeCurrentMinutes > safeMaxMinutes) {
      colorClass = "time-red";
    } else if (safeCurrentMinutes > estimatedMin) {
      colorClass = "time-yellow";
    }

    return {
      text: `${safeCurrentMinutes}min / ${safeMaxMinutes}min`,
      currentMinutes: safeCurrentMinutes,
      maxMinutes: safeMaxMinutes,
      colorClass: colorClass,
    };
  }

  /**
   * Obter texto do botão de ação baseado no status e tipo de pedido
   * @param {string} status - Status atual do pedido
   * @param {boolean} isPickup - Se o pedido é para retirada no balcão
   * @returns {string} Texto do botão
   */
  function getActionButtonText(status, isPickup = false) {
    // Normalizar in_progress para ready quando for pickup
    const normalizedStatus =
      status === "in_progress" && isPickup ? "ready" : status;

    if (isPickup) {
      // Fluxo para pickup: preparing -> ready -> completed
      const pickupActionMap = {
        pending: "Iniciar Preparo",
        preparing: "Marcar como Pronto",
        ready: "Marcar como Concluído",
        in_progress: "Marcar como Concluído", // Fallback - trata como ready
        on_the_way: "Marcar como Concluído", // Compatibilidade
        delivered: "Pedido concluído", // Status final
        paid: "Pedido concluído", // Status final
        completed: "Pedido concluído",
        cancelled: "Pedido cancelado",
      };
      return pickupActionMap[normalizedStatus] || "Atualizar status";
    } else {
      // Fluxo para delivery: preparing -> on_the_way -> completed
      const deliveryActionMap = {
        pending: "Iniciar Preparo",
        preparing: "Enviar para Entrega",
        on_the_way: "Marcar como Concluído",
        in_progress: "Enviar para Entrega", // Para delivery, in_progress pode ser um estado intermediário
        delivered: "Pedido concluído", // Status final
        paid: "Pedido concluído", // Status final
        completed: "Pedido concluído",
        cancelled: "Pedido cancelado",
      };
      return deliveryActionMap[status] || "Atualizar status";
    }
  }

  /**
   * Obter próximo status baseado no status atual e tipo de pedido (conforme fluxo da API)
   * @param {string} currentStatus - Status atual
   * @param {boolean} isPickup - Se o pedido é para retirada no balcão
   * @returns {string} Próximo status
   */
  function getNextStatus(currentStatus, isPickup = false) {
    // Normalizar in_progress para ready quando for pickup
    const normalizedStatus =
      currentStatus === "in_progress" && isPickup ? "ready" : currentStatus;

    if (isPickup) {
      // Fluxo para pickup: preparing -> ready (pronto para retirada) -> completed
      const pickupStatusFlow = {
        pending: "preparing",
        preparing: "ready", // Para pickup: vai para "ready" em vez de "on_the_way"
        ready: "completed",
        in_progress: "completed", // Fallback - trata como ready, então próximo é completed
        on_the_way: "completed", // Compatibilidade (backend pode converter on_the_way -> ready)
        delivered: "completed",
        paid: "completed",
      };
      return pickupStatusFlow[normalizedStatus] || currentStatus;
    } else {
      // Fluxo para delivery: preparing -> on_the_way -> completed
      const deliveryStatusFlow = {
        pending: "preparing",
        preparing: "on_the_way",
        on_the_way: "completed",
        in_progress: "on_the_way", // Para delivery, in_progress -> on_the_way
        delivered: "completed",
        paid: "completed",
      };
      return deliveryStatusFlow[currentStatus] || currentStatus;
    }
  }

  /**
   * Obter classe CSS do status
   * @param {string} status - Status do pedido
   * @returns {string} Classe CSS
   */
  function getStatusClass(status) {
    const classMap = {
      pending: "status-novo",
      preparing: "status-preparo",
      ready: "status-pronto",
      in_progress: "status-pronto", // Fallback do backend - trata como "Pronto" para pickup
      on_the_way: "status-entrega",
      delivered: "status-concluido",
      paid: "status-concluido",
      completed: "status-concluido",
      cancelled: "status-cancelado",
    };
    return classMap[status] || "status-novo";
  }

  /**
   * Calcular métricas a partir dos pedidos e dados do dashboard
   * @param {Object|null} dashboardMetrics - Métricas do dashboard (opcional)
   * @returns {Object} Métricas calculadas
   */
  function calculateMetrics(dashboardMetrics = null) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const metrics = {
      novos: 0,
      emPreparo: 0,
      pronto: 0,
      entrega: 0,
      concluidos: 0,
      cancelados: 0,
      ativos: 0,
      prontosEntrega: 0,
      tempoMedio: 0,
      atrasos: 0,
    };

    // Filtrar pedidos de hoje
    const todayOrders = state.orders.filter((order) => {
      if (!order?.created_at) return false;
      try {
        const orderDate = new Date(order.created_at);
        if (isNaN(orderDate.getTime())) return false;
        orderDate.setHours(0, 0, 0, 0);
        return orderDate.getTime() === today.getTime();
      } catch (e) {
        return false;
      }
    });

    // Contar por status
    todayOrders.forEach((order) => {
      const status = order.status || "";
      const isPickup = isPickupOrder(order);

      switch (status) {
        case "pending":
          metrics.novos++;
          metrics.ativos++;
          break;
        case "preparing":
          metrics.emPreparo++;
          metrics.ativos++;
          break;
        case "ready":
        case "in_progress":
          // Para pickup: ready/in_progress significa pronto para retirada
          // Para delivery: pode ser um estado intermediário
          if (isPickup) {
            metrics.pronto++;
            metrics.prontosEntrega++;
          } else {
            // Para delivery, ready/in_progress pode ser considerado como preparando
            metrics.emPreparo++;
            metrics.ativos++;
          }
          break;
        case "on_the_way":
          metrics.entrega++;
          metrics.prontosEntrega++;
          metrics.ativos++;
          break;
        case "completed":
        case "delivered":
          // Pedidos concluídos (completed e delivered contam como concluídos)
          metrics.concluidos++;
          break;
        case "cancelled":
          metrics.cancelados++;
          break;
      }
    });

    // Calcular tempo médio de ciclo dos pedidos concluídos de hoje
    // Tempo de ciclo = tempo desde a criação até a conclusão do pedido
    const completedOrders = todayOrders.filter((o) => {
      const status = o.status || "";
      // Considerar pedidos concluídos: completed, delivered
      return (
        (status === "completed" || status === "delivered") &&
        o.created_at &&
        (o.updated_at || o.completed_at || o.delivered_at)
      );
    });

    if (completedOrders.length > 0) {
      let totalMinutes = 0;
      let validCount = 0;

      completedOrders.forEach((order) => {
        try {
          const created = new Date(order.created_at);
          if (isNaN(created.getTime())) return;

          // Priorizar datas específicas de conclusão, depois updated_at, depois created_at
          let completedDate = null;

          if (order.completed_at) {
            completedDate = new Date(order.completed_at);
          } else if (order.delivered_at) {
            completedDate = new Date(order.delivered_at);
          } else if (order.updated_at) {
            completedDate = new Date(order.updated_at);
          }

          if (!completedDate || isNaN(completedDate.getTime())) {
            // Se não há data de conclusão, usar created_at + tempo estimado como fallback
            return;
          }

          const diffMinutes = (completedDate - created) / (1000 * 60);

          // Validar: tempo de ciclo deve ser positivo e razoável (entre 1 minuto e 24 horas)
          if (diffMinutes > 0 && diffMinutes <= 1440 && isFinite(diffMinutes)) {
            totalMinutes += diffMinutes;
            validCount++;
          }
        } catch (e) {
          // Ignorar erros de parsing
          if (isDevelopment()) {
            // ALTERAÇÃO: Log condicional apenas em modo debug
            if (typeof window !== 'undefined' && window.DEBUG_MODE) {
              console.warn("Erro ao calcular tempo de ciclo do pedido:", e);
            }
          }
        }
      });

      // Calcular média apenas se houver pedidos válidos
      if (validCount > 0) {
        metrics.tempoMedio = Math.round(totalMinutes / validCount);
      } else {
        // Se não há métricas do dashboard e não há pedidos válidos, usar 0
        metrics.tempoMedio = 0;
      }
    } else {
      // Se não há pedidos concluídos hoje, usar métricas do dashboard se disponíveis
      if (dashboardMetrics?.average_preparation_time) {
        metrics.tempoMedio = Math.round(
          dashboardMetrics.average_preparation_time
        );
      } else if (dashboardMetrics?.average_cycle_time) {
        metrics.tempoMedio = Math.round(dashboardMetrics.average_cycle_time);
      } else {
        metrics.tempoMedio = 0;
      }
    }

    // Calcular atrasos (pedidos ativos há mais de 60 minutos)
    const delayedOrders = todayOrders.filter((order) => {
      if (!ACTIVE_STATUSES.includes(order.status)) {
        return false;
      }
      if (!order.created_at) return false;

      try {
        const created = new Date(order.created_at);
        const now = new Date();
        if (isNaN(created.getTime())) return false;

        const minutesSinceCreation = (now - created) / (1000 * 60);
        return minutesSinceCreation > 60;
      } catch (e) {
        return false;
      }
    });
    metrics.atrasos = delayedOrders.length;

    return metrics;
  }

  /**
   * Atualizar exibição das métricas
   * @param {Object|null} dashboardMetrics - Métricas do dashboard (opcional)
   */
  function updateMetricsDisplay(dashboardMetrics = null) {
    const metrics = calculateMetrics(dashboardMetrics);

    if (el.metricActiveOrders) {
      el.metricActiveOrders.textContent = String(metrics.ativos).padStart(
        2,
        "0"
      );
    }
    if (el.metricNovos) {
      el.metricNovos.textContent = `${metrics.novos} Novos`;
    }
    if (el.metricEmPreparo) {
      el.metricEmPreparo.textContent = `${metrics.emPreparo} Em preparo`;
    }
    if (el.metricProntosEntrega) {
      el.metricProntosEntrega.textContent = String(
        metrics.prontosEntrega
      ).padStart(2, "0");
    }
    if (el.metricPronto) {
      el.metricPronto.textContent = `${metrics.pronto} Pronto`;
    }
    if (el.metricEntrega) {
      el.metricEntrega.textContent = `${metrics.entrega} Entrega`;
    }
    if (el.metricConcluidos) {
      el.metricConcluidos.textContent = String(metrics.concluidos).padStart(
        2,
        "0"
      );
    }
    if (el.metricCancelados) {
      el.metricCancelados.textContent = `${metrics.cancelados} Cancelados`;
    }
    if (el.metricTempoMedio) {
      el.metricTempoMedio.textContent = formatTime(metrics.tempoMedio);
    }
    if (el.metricAtrasos) {
      el.metricAtrasos.textContent = `${metrics.atrasos} Atrasos hoje`;
    }
  }

  // ============================================================================
  // Funções de gerenciamento de pedidos (exclusivas do painel administrativo)
  // ============================================================================

  /**
   * Carregar pedidos para gerenciamento (todas as ordens, não apenas do usuário)
   * ALTERAÇÃO: Agora usa paginação e filtros na API ao invés de filtragem local
   * @returns {Promise<void>}
   */
  async function loadOrders() {
    // Prevenir múltiplas chamadas simultâneas
    if (state.loading) return;

    state.loading = true;
    state.error = null;

    // ALTERAÇÃO: Mostrar indicador de carregamento
    showLoadingOverlay('#secao-pedidos .pedidos-container', 'pedidos-loading', 'Carregando pedidos...');

    try {
      // ALTERAÇÃO: Preparar opções de paginação e filtros para enviar à API
      const options = {
        page: state.pagination.currentPage,
        page_size: state.pagination.pageSize,
      };

      // ALTERAÇÃO: Adicionar filtros se houver - garantir que valores vazios/null não sejam enviados
      if (state.filters.search && state.filters.search.trim() !== "") {
        options.search = state.filters.search.trim();
      }
      if (state.filters.status && state.filters.status !== "" && state.filters.status !== "todos") {
        options.status = state.filters.status;
      }
      if (state.filters.channel && state.filters.channel !== "" && state.filters.channel !== "todos") {
        options.channel = state.filters.channel;
      }
      if (state.filters.period && state.filters.period !== "" && state.filters.period !== "todos" && state.filters.period !== "all") {
        options.period = state.filters.period;
      }

      const result = await getAllOrders(options);

      if (result.success) {
        // ALTERAÇÃO: Usar normalizador de paginação para garantir compatibilidade
        const { normalizePaginationResponse, getItemsFromResponse, getPaginationFromResponse } = await import('../../utils/pagination-utils.js');
        const normalizedResponse = normalizePaginationResponse(result.data || result, 'items');
        const ordersList = getItemsFromResponse(normalizedResponse);
        const paginationInfo = getPaginationFromResponse(normalizedResponse);

        // ALTERAÇÃO: Atualizar informações de paginação usando dados normalizados
        state.pagination.totalPages = paginationInfo.total_pages || 1;
        state.pagination.totalItems = paginationInfo.total || 0;

        // ALTERAÇÃO: Garantir que os arrays sejam limpos se não houver resultados
        const ordersWithDetails = [];

        // ALTERAÇÃO: Se não houver pedidos na resposta da API, limpar arrays e renderizar estado vazio imediatamente
        if (!ordersList || ordersList.length === 0) {
          state.orders = [];
          state.filteredOrders = [];
          renderOrders();
          renderPagination();
          updateMetricsDisplay(null);
          return;
        }

        // Processar em lotes para evitar sobrecarga de requisições
        for (let i = 0; i < ordersList.length; i += MAX_CONCURRENT_REQUESTS) {
          const batch = ordersList.slice(i, i + MAX_CONCURRENT_REQUESTS);

          const batchResults = await Promise.allSettled(
            batch.map(async (order) => {
              if (!order || typeof order !== "object") return null;
              const orderId = order.order_id || order.id;
              if (!orderId) return null;

              try {
                const detailsResult = await getOrderDetails(orderId);

                if (detailsResult.success && detailsResult.data) {
                  const details = detailsResult.data;

                  const mergedOrder = {
                    ...order,
                    ...details,
                    order_id: orderId,
                    id: orderId,
                  };

                  // Priorizar customer/user dos detalhes completos
                  if (details.customer) {
                    mergedOrder.customer = details.customer;
                  } else if (order.customer) {
                    mergedOrder.customer = order.customer;
                  }

                  if (details.user) {
                    mergedOrder.user = details.user;
                  } else if (order.user) {
                    mergedOrder.user = order.user;
                  }

                  return mergedOrder;
                }
                return order;
              } catch (err) {
                // Log apenas em desenvolvimento, sem expor dados sensíveis
                if (isDevelopment()) {
                  // ALTERAÇÃO: Log condicional apenas em modo debug
                  if (typeof window !== 'undefined' && window.DEBUG_MODE) {
                    console.warn(
                      `Erro ao buscar detalhes do pedido ${orderId}:`,
                      err.message
                    );
                  }
                }
                return order;
              }
            })
          );

          ordersWithDetails.push(
            ...batchResults
              .map((result) =>
                result.status === "fulfilled" ? result.value : null
              )
              .filter((order) => order !== null)
          );
        }

        state.orders = ordersWithDetails;
        state.filteredOrders = ordersWithDetails; // ALTERAÇÃO: Usar diretamente, já filtrado pela API

        // Buscar métricas do dashboard
        let dashboardMetrics = null;
        try {
          const metricsResult = await getDashboardMetrics();
          if (metricsResult.success) {
            dashboardMetrics = metricsResult.data;
          }
        } catch (err) {
          // ALTERAÇÃO: Log condicional apenas em modo debug
          if (typeof window !== 'undefined' && window.DEBUG_MODE) {
            console.warn("Erro ao buscar métricas do dashboard:", err.message);
          }
        }

        // Enriquecer pedidos com telefones
        const enrichedOrders = await enrichOrdersWithPhones(state.orders);
        state.orders = enrichedOrders;
        state.filteredOrders = enrichedOrders;

        renderOrders();
        renderPagination(); // ALTERAÇÃO: Renderizar paginação
        updateMetricsDisplay(dashboardMetrics);
      } else {
        state.error = result.error;
        showError(
          "Erro ao carregar pedidos: " + (result.error || "Erro desconhecido")
        );
      }
    } catch (error) {
      // ALTERAÇÃO: Log condicional apenas em modo debug
      if (typeof window !== 'undefined' && window.DEBUG_MODE) {
        console.error("Erro ao carregar pedidos:", error);
      }
      state.error = error.message;
      showError("Erro ao carregar pedidos: " + error.message);
    } finally {
      state.loading = false;
      // ALTERAÇÃO: Esconder indicador de carregamento
      hideLoadingOverlay('pedidos-loading');
    }
  }

  /**
   * Enriquecer pedidos com telefones dos clientes (lógica de API)
   * Busca telefones através da API quando necessário, com controle de concorrência
   * @param {Array} orders - Array de pedidos para enriquecer
   * @returns {Promise<Array>} Array de pedidos enriquecidos com telefones
   */
  async function enrichOrdersWithPhones(orders) {
    if (!Array.isArray(orders) || orders.length === 0) {
      return orders;
    }

    // Processar em lotes para evitar sobrecarga da API
    const enrichedOrders = [];

    for (let i = 0; i < orders.length; i += MAX_CONCURRENT_REQUESTS) {
      const batch = orders.slice(i, i + MAX_CONCURRENT_REQUESTS);

      const batchResults = await Promise.allSettled(
        batch.map(async (order) => {
          if (!order || typeof order !== "object") return order;

          // Verificar se já tem telefone cacheado
          if (order._cachedPhone !== undefined) {
            return order;
          }

          // Buscar telefone
          const phone = await getCustomerPhone(order);
          return { ...order, _cachedPhone: phone };
        })
      );

      enrichedOrders.push(
        ...batchResults
          .map((result) =>
            result.status === "fulfilled" ? result.value : null
          )
          .filter((order) => order !== null)
      );

      // Limpar cache após processar cada batch (mais eficiente)
      cleanupPhoneCache();
    }

    return enrichedOrders;
  }

  /**
   * Aplicar filtros nos pedidos
   * ALTERAÇÃO: Agora apenas reseta a página e recarrega da API (filtros são feitos no backend)
   */
  function applyFilters() {
    // ALTERAÇÃO: Resetar para primeira página ao aplicar filtros
    state.pagination.currentPage = 1;
    // Recarregar pedidos da API com os novos filtros
    loadOrders();
  }

  /**
   * Verificar se o pedido é retirada no balcão (pickup)
   * @param {Object} order - Objeto do pedido
   * @returns {boolean} True se for pickup
   */
  function isPickupOrder(order) {
    if (!order || typeof order !== "object") return false;
    const orderType = String(
      order.order_type || order.delivery_type || order.deliveryType || ""
    ).toLowerCase();
    return orderType === "pickup";
  }

  /**
   * Formatar endereço do pedido
   * @param {Object} order - Objeto do pedido
   * @returns {string} Endereço formatado
   */
  function formatOrderAddress(order) {
    if (isPickupOrder(order)) {
      return "Retirada no balcão";
    }

    if (order.address) {
      return escapeHTML(order.address);
    }

    if (order.address_data) {
      const addr = order.address_data;
      const parts = [];
      if (addr.street) parts.push(addr.street);
      if (addr.number) parts.push(addr.number);
      if (addr.complement) parts.push(addr.complement);

      if (parts.length > 0) {
        return escapeHTML(parts.join(", "));
      }

      if (addr.delivery_address) {
        return escapeHTML(addr.delivery_address);
      }
    }

    if (order.delivery_address) {
      return escapeHTML(order.delivery_address);
    }

    return "Endereço não informado";
  }

  /**
   * Buscar telefone do usuário através da API usando user_id
   * @param {number} userId - ID do usuário
   * @returns {Promise<string>} Telefone formatado ou padrão
   */
  async function fetchUserPhone(userId) {
    if (!userId) return "(00)0000-000";

    // Verificar cache primeiro
    const cacheKey = String(userId);
    if (state.userPhoneCache[cacheKey]) {
      return state.userPhoneCache[cacheKey];
    }

    try {
      const user = await getUserById(userId);
      if (user && typeof user === "object") {
        const phone = user.phone || user.telefone || null;
        const phoneFormatted = phone ? formatarTelefone(phone) : "(00)0000-000";
        state.userPhoneCache[cacheKey] = phoneFormatted;
        return phoneFormatted;
      }
    } catch (error) {
      // ALTERAÇÃO: Log condicional apenas em modo debug
      if (typeof window !== 'undefined' && window.DEBUG_MODE) {
        console.warn(
          `Erro ao buscar telefone do usuário ${userId}:`,
          error.message
        );
      }
      // Cachear como não encontrado para evitar múltiplas tentativas
      state.userPhoneCache[cacheKey] = "(00)0000-000";
    }

    return "(00)0000-000";
  }

  /**
   * Buscar telefone em objetos customer/user diretamente
   * @param {Object} order - Objeto do pedido
   * @returns {string|null} Telefone encontrado ou null
   */
  function findPhoneInOrderObject(order) {
    // Estratégia 1: Buscar no objeto customer
    if (order.customer && typeof order.customer === "object") {
      const customer = order.customer;
      const phone =
        customer.phone ||
        customer.telefone ||
        customer.mobile_phone ||
        customer.mobile;
      if (phone) return phone;
    }

    // Estratégia 2: Buscar no objeto user
    if (order.user && typeof order.user === "object") {
      const user = order.user;
      const phone =
        user.phone || user.telefone || user.mobile_phone || user.mobile;
      if (phone) return phone;
    }

    // Estratégia 3: Buscar em campos diretos do pedido
    const directPhone =
      order.customer_phone ||
      order.customer_telefone ||
      order.user_phone ||
      order.user_telefone ||
      order.client_phone ||
      order.client_telefone ||
      order.phone ||
      order.telefone ||
      order.mobile_phone ||
      order.mobile;
    if (directPhone) return directPhone;

    // Estratégia 4: Buscar no address_data
    if (order.address_data && typeof order.address_data === "object") {
      const addrPhone =
        order.address_data.phone ||
        order.address_data.telefone ||
        order.address_data.customer_phone ||
        order.address_data.customer_telefone;
      if (addrPhone) return addrPhone;
    }

    // Estratégia 5: Buscar recursivamente em objetos aninhados (limitado a 2 níveis)
    if (order.customer && typeof order.customer === "object") {
      const contactPhone =
        order.customer.contact?.phone ||
        order.customer.contact?.telefone ||
        order.customer.details?.phone ||
        order.customer.details?.telefone;
      if (contactPhone) return contactPhone;
    }

    if (order.user && typeof order.user === "object") {
      const contactPhone =
        order.user.contact?.phone ||
        order.user.contact?.telefone ||
        order.user.details?.phone ||
        order.user.details?.telefone;
      if (contactPhone) return contactPhone;
    }

    return null;
  }

  /**
   * Obter telefone do cliente do pedido
   * Busca através do user_id quando necessário
   * @param {Object} order - Objeto do pedido
   * @returns {Promise<string>} Telefone formatado
   */
  async function getCustomerPhone(order) {
    if (!order || typeof order !== "object") {
      return "(00)0000-000";
    }

    // Primeiro tentar buscar no próprio objeto do pedido
    const phoneInObject = findPhoneInOrderObject(order);
    if (phoneInObject) {
      return formatarTelefone(phoneInObject);
    }

    // Se não encontrou, buscar através do user_id usando API
    const userId =
      order.user_id || order.userId || order.customer_id || order.customerId;
    if (userId) {
      const phoneFromApi = await fetchUserPhone(userId);
      if (phoneFromApi && phoneFromApi !== "(00)0000-000") {
        return phoneFromApi;
      }
    }

    return "(00)0000-000";
  }

  /**
   * Extrair preço de um objeto (extra ou modificação) - função auxiliar para evitar duplicação
   * @param {Object} obj - Objeto com campos de preço possíveis
   * @returns {number} Preço encontrado ou 0
   */
  function extractPriceFromObject(obj) {
    if (!obj || typeof obj !== "object") return 0;

    const priceCandidates = [
      obj.ingredient_price,
      obj.price,
      obj.additional_price,
      obj.unit_price,
      obj.ingredient_unit_price,
      obj.preco,
      obj.valor,
    ];

    for (const candidate of priceCandidates) {
      if (candidate !== undefined && candidate !== null) {
        const priceNum = parseFloat(candidate);
        if (!isNaN(priceNum) && priceNum > 0 && isFinite(priceNum)) {
          return priceNum;
        }
      }
    }

    return 0;
  }

  /**
   * Calcular preço total do item incluindo extras e modificações
   * @param {Object} item - Item do pedido
   * @returns {number} Preço total do item
   */
  function calculateItemTotal(item) {
    // Priorizar item_subtotal se disponível (já calculado pela API)
    if (item.item_subtotal !== undefined && item.item_subtotal !== null) {
      return parseFloat(item.item_subtotal) || 0;
    }

    if (item.subtotal !== undefined && item.subtotal !== null) {
      return parseFloat(item.subtotal) || 0;
    }

    // Calcular manualmente: unit_price do produto + extras + base_modifications
    const basePrice =
      parseFloat(item.unit_price || item.product?.price || 0) || 0;
    const quantity = parseInt(item.quantity || 1, 10) || 1;

    // Somar preços dos extras
    let extrasTotal = 0;
    if (Array.isArray(item.extras) && item.extras.length > 0) {
      extrasTotal = item.extras.reduce((sum, extra) => {
        const unitPrice = extractPriceFromObject(extra);
        const qty = parseInt(extra.quantity || 1, 10) || 1;
        return sum + unitPrice * qty;
      }, 0);
    }

    // Somar preços das base_modifications (apenas deltas positivos)
    let baseModsTotal = 0;
    if (
      Array.isArray(item.base_modifications) &&
      item.base_modifications.length > 0
    ) {
      baseModsTotal = item.base_modifications.reduce((sum, mod) => {
        const delta = parseInt(String(mod.delta || 0), 10) || 0;
        if (delta > 0) {
          const unitPrice = extractPriceFromObject(mod);
          return sum + unitPrice * delta;
        }
        return sum;
      }, 0);
    }

    // Preço unitário total = preço base + extras + base_modifications
    const unitTotal = basePrice + extrasTotal + baseModsTotal;
    // Total = preço unitário total * quantidade
    return unitTotal * quantity;
  }

  /**
   * Renderizar lista de pedidos no painel administrativo
   * Apenas renderização do DOM - não faz chamadas à API
   */
  function renderOrders() {
    if (!el.ordersList) return;

    // ALTERAÇÃO: Limpar o container primeiro para garantir que não fiquem itens antigos
    el.ordersList.innerHTML = "";

    // ALTERAÇÃO: Garantir que filteredOrders seja sempre um array válido e atualizado
    if (!state.filteredOrders || state.filteredOrders.length === 0) {
      el.ordersList.innerHTML = `
                <div style="text-align: center; padding: 48px; color: #666;">
                    <i class="fa-solid fa-clipboard-list" style="font-size: 48px; margin-bottom: 16px; opacity: 0.3;" aria-hidden="true"></i>
                    <p style="font-size: 16px;">Nenhum pedido encontrado</p>
                </div>
            `;
      return;
    }

    const ordersHtml = state.filteredOrders
      .map((order) => {
        if (!order || typeof order !== "object") return "";

        const orderId = order.order_id || order.id || "N/A";
        const confirmationCode = escapeHTML(order.confirmation_code || "N/A");
        const statusClass = getStatusClass(order.status);
        const statusText = formatOrderStatus(order.status);
        const createdAt = formatDate(order.created_at);
        const timeEstimate = calculateTimeEstimate(order);

        // Informações do cliente (com validação)
        const customerName = escapeHTML(
          order.customer_name ||
            (order.customer && typeof order.customer === "object"
              ? order.customer.full_name || order.customer.name
              : "") ||
            (order.user && typeof order.user === "object"
              ? order.user.full_name || order.user.name
              : "") ||
            "Cliente não informado"
        );

        // Obter telefone do cliente (já buscado anteriormente e cacheado em _cachedPhone)
        const customerPhone = normalizePhone(order._cachedPhone);

        const isPickup = isPickupOrder(order);
        const formattedAddress = formatOrderAddress(order);
        const locationText = formattedAddress;

        // Itens do pedido com cálculo correto de extras e base_modifications
        const items = order.items || [];
        const itemsHtml =
          items.length > 0
            ? items
                .map((item) => {
                  const itemName = escapeHTML(
                    item.product_name || item.product?.name || "Produto"
                  );
                  const itemQuantity = parseInt(item.quantity || 1, 10) || 1;
                  const itemTotal = calculateItemTotal(item);

                  // Preparar HTML para extras e modificações (versão completa com lista de itens)
                  const extras = item.extras || item.additional_items || [];
                  const baseMods = item.base_modifications || [];
                  const notes = item.notes || item.observacao || "";

                  let modificationsHtml = "";
                  let hasPreviousContent = false; // Rastrear se já há conteúdo antes para exibir separador

                  // Lista de EXTRAS (ingredientes adicionais)
                  if (extras && extras.length > 0) {
                    const extrasItems = extras
                      .map((extra) => {
                        const nome =
                          extra.ingredient_name ||
                          extra.name ||
                          extra.title ||
                          extra.nome ||
                          "Ingrediente";
                        const quantidade =
                          parseInt(
                            extra.quantity ??
                              extra.qty ??
                              extra.quantidade ??
                              0,
                            10
                          ) || 0;

                        // Buscar preço do extra usando função auxiliar
                        const preco = extractPriceFromObject(extra);

                        // Formatar preço se houver (escapar HTML para segurança)
                        const precoFormatado =
                          preco > 0
                            ? ` <span class="extra-price">+R$ ${escapeHTML(
                                preco.toFixed(2).replace(".", ",")
                              )}</span>`
                            : "";

                        return `<li><span class="extra-quantity-badge">${quantidade}</span> <span class="extra-name">${escapeHTML(
                          nome
                        )}</span>${precoFormatado}</li>`;
                      })
                      .join("");

                    // Extras é a primeira seção, não precisa de separador antes
                    modificationsHtml += `
                        <div class="item-extras-list">
                            <strong>Extras:</strong>
                            <ul>
                                ${extrasItems}
                            </ul>
                        </div>
                    `;
                    hasPreviousContent = true;
                  }

                  // Lista de MODIFICAÇÕES da receita base
                  if (baseMods && baseMods.length > 0) {
                    // Adicionar separador apenas se houver extras antes
                    if (hasPreviousContent) {
                      modificationsHtml += `<div class="item-extras-separator"></div>`;
                    }

                    const baseModsItems = baseMods
                      .map((bm) => {
                        const nome =
                          bm.ingredient_name ||
                          bm.name ||
                          bm.nome ||
                          "Ingrediente";
                        const delta = parseInt(bm.delta ?? 0, 10) || 0;

                        // Buscar preço da modificação usando função auxiliar
                        const preco = extractPriceFromObject(bm);

                        const isPositive = delta > 0;
                        const icon = isPositive ? "plus" : "minus";
                        const colorClass = isPositive
                          ? "mod-add"
                          : "mod-remove";
                        const deltaValue = Math.abs(delta);

                        // Formatar preço se houver (apenas para adições, remoções não têm custo)
                        // Escapar HTML para segurança
                        const precoFormatado =
                          preco > 0 && isPositive
                            ? ` <span class="base-mod-price">+R$ ${escapeHTML(
                                preco.toFixed(2).replace(".", ",")
                              )}</span>`
                            : "";

                        return `
                            <li>
                                <span class="base-mod-icon ${colorClass}">
                                    <i class="fa-solid fa-circle-${icon}"></i>
                                </span>
                                <span class="base-mod-quantity">${deltaValue}</span>
                                <span class="base-mod-name">${escapeHTML(
                                  nome
                                )}</span>${precoFormatado}
                            </li>
                        `;
                      })
                      .join("");

                    modificationsHtml += `
                        <div class="item-base-mods-list">
                            <strong>Modificações:</strong>
                            <ul>
                                ${baseModsItems}
                            </ul>
                        </div>
                    `;
                    hasPreviousContent = true;
                  }

                  // Observação se houver
                  if (notes && String(notes).trim() !== "") {
                    // Adicionar separador apenas se houver extras ou modificações antes
                    if (hasPreviousContent) {
                      modificationsHtml += `<div class="item-extras-separator"></div>`;
                    }

                    modificationsHtml += `
                        <div class="item-observacao">
                            <strong>Obs:</strong> ${escapeHTML(
                              String(notes).trim()
                            )}
                        </div>
                    `;
                  }

                  // Estrutura: produto na primeira linha, modificações abaixo
                  return `
                    <div class="order-item">
                        <div class="item-info">
                            <span class="item-qtd">${itemQuantity}</span>
                            <span class="item-name">${itemName}</span>
                            <span class="item-price">${escapeHTML(
                              String(
                                formatCurrency
                                  ? formatCurrency(itemTotal)
                                  : itemTotal.toFixed(2).replace(".", ",")
                              )
                            )}</span>
                        </div>
                        ${
                          modificationsHtml
                            ? `<div class="order-item-modifications">${modificationsHtml}</div>`
                            : ""
                        }
                    </div>
                `;
                })
                .join("")
            : '<div class="order-item"><span class="item-name">Nenhum item</span></div>';

        // Total do pedido
        const total = parseFloat(order.total_amount || order.total || 0) || 0;

        // Botão de ação (considera tipo de pedido - isPickup já declarado acima)
        const nextStatus = getNextStatus(order.status, isPickup);
        const actionButtonText = getActionButtonText(order.status, isPickup);
        // Status finais que não permitem atualização
        const canUpdate = !FINAL_STATUSES.includes(order.status);

        return `
                <div class="order-card" data-order-id="${escapeHTML(
                  String(orderId)
                )}">
                    <div class="order-header">
                        <div class="order-id-status">
                            <div class="order-id">
                                <span class="id-text">${confirmationCode}</span>
                            <span class="status-badge ${statusClass}">${statusText}</span>
                        </div>
                            <div class="order-time-estimate ${
                              timeEstimate.colorClass
                            }">
                                <i class="fa-solid fa-clock"></i>
                                <span class="time-display">
                                    <span class="time-current">${
                                      timeEstimate.currentMinutes
                                    }min</span>
                                    <span class="time-separator">/</span>
                                    <span class="time-max">${
                                      timeEstimate.maxMinutes
                                    }min</span>
                                </span>
                            </div>
                        </div>
                        <div class="order-date">${createdAt}</div>
                    </div>
                    
                    <div class="order-customer">
                        <div class="customer-name">${customerName}</div>
                        <div class="customer-info">
                            <div class="info-item">
                                <i class="fa-solid fa-phone"></i>
                                <span>${escapeHTML(customerPhone)}</span>
                            </div>
                            <div class="info-item ${
                              isPickup ? "order-pickup" : ""
                            }">
                                <i class="fa-solid ${
                                  isPickup ? "fa-store" : "fa-location-dot"
                                }"></i>
                                <span>${escapeHTML(locationText)}</span>
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

                    ${
                      order.notes || order.observacao
                        ? `
                        <div class="order-notes">
                            <div class="item-observacao">
                                <strong>Observação do Pedido:</strong> ${escapeHTML(
                                  String(order.notes || order.observacao).trim()
                                )}
                            </div>
                        </div>
                    `
                        : ""
                    }


                    <div class="order-footer">
                        <div class="order-total">
                            <span class="total-label">Total</span>
                            <span class="total-value"> ${escapeHTML(
                              String(
                                formatCurrency
                                  ? formatCurrency(total)
                                  : total.toFixed(2).replace(".", ",")
                              )
                            )}</span>
                        </div>
                        ${
                          canUpdate
                            ? `
                            <button class="order-action-btn" data-order-id="${escapeHTML(
                              String(orderId)
                            )}" data-next-status="${escapeHTML(nextStatus)}">
                                ${escapeHTML(actionButtonText)}
                        </button>
                        `
                            : ""
                        }
                    </div>
                </div>
            `;
      })
      .filter((html) => html !== "")
      .join("");

    // Atualizar DOM
    el.ordersList.innerHTML = ordersHtml;

    // Carregar informações financeiras para cada pedido
    state.filteredOrders.forEach((order) => {
      if (order && typeof order === "object") {
        const orderId = order.order_id || order.id;
        if (orderId) {
          // ALTERAÇÃO: Removido - informações financeiras agora são exibidas na modal
          // displayOrderFinancialInfo(orderId);
        }
      }
    });
  }

  /**
   * Exibe informações financeiras do pedido
   * @param {number|string} orderId - ID do pedido
   */
  async function displayOrderFinancialInfo(orderId) {
    try {
      // Buscar movimentações relacionadas ao pedido
      const response = await getFinancialMovements({
        related_entity_type: "order",
        related_entity_id: orderId,
      });

      // ALTERAÇÃO: A API retorna objeto com items, não array direto
      const movements = Array.isArray(response) ? response : (response?.items || []);
      
      if (!movements || movements.length === 0) {
        return;
      }

      // Agrupar por tipo
      const revenue = movements.find((m) => m.type === "REVENUE");
      const cmv = movements.find((m) => m.type === "CMV");
      const fee = movements.find(
        (m) => m.type === "EXPENSE" && m.subcategory === "Taxas de Pagamento"
      );

      // Calcular lucro
      const revenueValue = parseFloat(revenue?.value || revenue?.amount || 0);
      const cmvValue = parseFloat(cmv?.value || cmv?.amount || 0);
      const feeValue = parseFloat(fee?.value || fee?.amount || 0);
      const grossProfit = revenueValue - cmvValue;
      const netProfit = grossProfit - feeValue;

      // Renderizar card financeiro
      const financialCard = `
            <div class="order-financial-info">
                <h4>Informações Financeiras</h4>
                <div class="financial-info-grid">
                    <div class="financial-info-item">
                        <span class="label">Receita:</span>
                        <span class="value revenue">R$ ${formatCurrencyValue(revenueValue)}</span>
                    </div>
                    <div class="financial-info-item">
                        <span class="label">CMV:</span>
                        <span class="value cmv">R$ ${formatCurrencyValue(cmvValue)}</span>
                    </div>
                    <div class="financial-info-item">
                        <span class="label">Taxa:</span>
                        <span class="value expense">R$ ${formatCurrencyValue(feeValue)}</span>
                    </div>
                    <div class="financial-info-item">
                        <span class="label">Lucro Bruto:</span>
                        <span class="value ${grossProfit >= 0 ? "positive" : "negative"}">
                            R$ ${formatCurrencyValue(grossProfit)}
                        </span>
                    </div>
                    <div class="financial-info-item">
                        <span class="label">Lucro Líquido:</span>
                        <span class="value ${netProfit >= 0 ? "positive" : "negative"}">
                            R$ ${formatCurrencyValue(netProfit)}
                        </span>
                    </div>
                </div>
            </div>
        `;

      // Inserir no card do pedido
      const placeholder = document.querySelector(
        `.order-financial-info-placeholder[data-order-id="${orderId}"]`
      );
      if (placeholder) {
        placeholder.innerHTML = financialCard;
      }
    } catch (error) {
      console.error("Erro ao carregar informações financeiras:", error);
      // Não exibir erro para o usuário, apenas logar
    }
  }

  /**
   * Formata valor monetário
   * @param {number} value - Valor a formatar
   * @returns {string} Valor formatado
   */
  function formatCurrencyValue(value) {
    if (formatCurrency) {
      return formatCurrency(value);
    }
    return Math.abs(value || 0).toFixed(2).replace(".", ",");
  }

  /**
   * Atualizar status do pedido (função exclusiva do gerenciamento administrativo)
   * @param {number|string} orderId - ID do pedido
   * @param {string} newStatus - Novo status
   * @returns {Promise<void>}
   */
  async function updateOrderStatusAction(orderId, newStatus) {
    // Validar entrada
    const parsedOrderId = parseInt(String(orderId), 10);
    if (isNaN(parsedOrderId) || parsedOrderId <= 0) {
      showError("ID do pedido inválido");
      return;
    }

    if (!newStatus || typeof newStatus !== "string") {
      showError("Status inválido");
      return;
    }

    try {
      const result = await updateOrderStatus(parsedOrderId, newStatus);
      if (result.success) {
        showSuccess("Status atualizado com sucesso!");
        await loadOrders(); // Recarregar lista e métricas
      } else {
        showError(
          "Erro ao atualizar status: " + (result.error || "Erro desconhecido")
        );
      }
    } catch (error) {
      showError("Erro ao atualizar status: " + error.message);
    }
  }

  /**
   * Configurar auto-refresh
   */
  function setupAutoRefresh() {
    if (state.autoRefresh && !state.refreshInterval) {
      state.refreshInterval = setInterval(async () => {
        if (!state.loading && isSectionVisible()) {
          await loadOrders();
        }
      }, AUTO_REFRESH_INTERVAL);
    }
  }

  /**
   * Parar auto-refresh
   */
  function stopAutoRefresh() {
    if (state.refreshInterval) {
      clearInterval(state.refreshInterval);
      state.refreshInterval = null;
    }
  }

  /**
   * ALTERAÇÃO: Limpar intervalo de verificação de visibilidade e observer
   */
  function clearVisibilityCheck() {
    if (state.visibilityCheckInterval) {
      clearInterval(state.visibilityCheckInterval);
      state.visibilityCheckInterval = null;
    }
    // ALTERAÇÃO: Desconectar MutationObserver se existir
    if (state.visibilityObserver) {
      state.visibilityObserver.disconnect();
      state.visibilityObserver = null;
    }
  }

  /**
   * Renderiza controles de paginação
   * ALTERAÇÃO: Função adicionada para paginação similar à seção de estoque
   */
  function renderPagination() {
    if (!el.ordersList) return;

    // Remover paginação existente
    const existingPagination = el.ordersList.parentElement.querySelector(".pagination");
    if (existingPagination) {
      existingPagination.remove();
    }

    // Calcular informações de exibição
    const startItem = state.pagination.totalItems === 0 ? 0 : (state.pagination.currentPage - 1) * state.pagination.pageSize + 1;
    const endItem = Math.min(state.pagination.currentPage * state.pagination.pageSize, state.pagination.totalItems);

    // Sempre renderizar paginação se houver itens (mesmo que seja apenas 1 página)
    if (state.pagination.totalItems === 0) {
      return;
    }

    // Criar elemento de paginação melhorado
    const pagination = document.createElement("div");
    pagination.className = "pagination";
    pagination.innerHTML = `
      <div class="pagination-wrapper">
        <div class="pagination-info">
          <span class="pagination-text">
            Mostrando <strong>${startItem}-${endItem}</strong> de <strong>${state.pagination.totalItems}</strong> pedidos
          </span>
          ${state.pagination.totalPages > 1 ? `<span class="pagination-page-info">Página ${state.pagination.currentPage} de ${state.pagination.totalPages}</span>` : ''}
        </div>
        ${state.pagination.totalPages > 1 ? `
        <div class="pagination-controls">
          <button class="pagination-btn pagination-btn-nav" ${state.pagination.currentPage === 1 ? 'disabled' : ''} data-page="prev" title="Página anterior">
            <i class="fa-solid fa-chevron-left"></i>
            <span>Anterior</span>
          </button>
          <div class="pagination-pages">
            ${generatePageNumbers()}
          </div>
          <button class="pagination-btn pagination-btn-nav" ${state.pagination.currentPage === state.pagination.totalPages ? 'disabled' : ''} data-page="next" title="Próxima página">
            <span>Próxima</span>
            <i class="fa-solid fa-chevron-right"></i>
          </button>
        </div>
        ` : ''}
      </div>
    `;

    // Adicionar event listeners
    const handlePaginationClick = async (e) => {
      const target = e.target.closest('.pagination-btn, .page-number');
      if (!target) return;
      
      e.preventDefault();
      e.stopPropagation();
      
      if (state.loading) return;
      
      // Verificar se é botão de navegação
      if (target.classList.contains('pagination-btn')) {
        if (target.disabled) return;
        
        const action = target.dataset.page;
        
        if (action === "prev" && state.pagination.currentPage > 1) {
          state.pagination.currentPage = Math.max(1, state.pagination.currentPage - 1);
        } else if (action === "next" && state.pagination.currentPage < state.pagination.totalPages) {
          state.pagination.currentPage = Math.min(state.pagination.totalPages, state.pagination.currentPage + 1);
        } else {
          return;
        }
      } 
      // Verificar se é número de página
      else if (target.classList.contains('page-number')) {
        const page = parseInt(target.dataset.page);
        
        if (isNaN(page) || page === state.pagination.currentPage || page < 1 || page > state.pagination.totalPages) {
          return;
        }
        
        state.pagination.currentPage = page;
      } else {
        return;
      }
      
      await loadOrders();
      scrollToTop();
    };
    
    // Usar event delegation no elemento de paginação
    pagination.addEventListener('click', handlePaginationClick);

    // Inserir após o container de pedidos
    el.ordersList.parentElement.appendChild(pagination);
  }

  /**
   * Gera números de página para exibição
   * ALTERAÇÃO: Função adicionada para paginação
   */
  function generatePageNumbers() {
    const pages = [];
    const maxVisible = 7; // Máximo de números de página visíveis
    
    if (state.pagination.totalPages <= maxVisible) {
      // Se houver poucas páginas, mostrar todas
      for (let i = 1; i <= state.pagination.totalPages; i++) {
        pages.push(
          `<button class="page-number ${i === state.pagination.currentPage ? 'active' : ''}" data-page="${i}">${i}</button>`
        );
      }
      return pages.join("");
    }

    // Lógica para muitas páginas
    let startPage = Math.max(1, state.pagination.currentPage - 2);
    let endPage = Math.min(state.pagination.totalPages, state.pagination.currentPage + 2);

    // Ajustar início se estiver no final
    if (endPage - startPage < 4) {
      if (state.pagination.currentPage <= 3) {
        startPage = 1;
        endPage = Math.min(5, state.pagination.totalPages);
      } else if (state.pagination.currentPage >= state.pagination.totalPages - 2) {
        startPage = Math.max(1, state.pagination.totalPages - 4);
        endPage = state.pagination.totalPages;
      }
    }

    // Primeira página
    if (startPage > 1) {
      pages.push(`<button class="page-number" data-page="1" title="Primeira página">1</button>`);
      if (startPage > 2) {
        pages.push(`<span class="page-ellipsis" title="Mais páginas">...</span>`);
      }
    }

    // Páginas do meio
    for (let i = startPage; i <= endPage; i++) {
      pages.push(
        `<button class="page-number ${i === state.pagination.currentPage ? 'active' : ''}" data-page="${i}" title="Página ${i}">${i}</button>`
      );
    }

    // Última página
    if (endPage < state.pagination.totalPages) {
      if (endPage < state.pagination.totalPages - 1) {
        pages.push(`<span class="page-ellipsis" title="Mais páginas">...</span>`);
      }
      pages.push(`<button class="page-number" data-page="${state.pagination.totalPages}" title="Última página">${state.pagination.totalPages}</button>`);
    }

    return pages.join("");
  }

  /**
   * Faz scroll suave para o topo da seção
   * ALTERAÇÃO: Função adicionada para paginação
   */
  function scrollToTop() {
    const section = document.getElementById("secao-pedidos");
    if (section) {
      section.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  /**
   * Anexar eventos aos elementos DOM
   */
  function attachEvents() {
    if (el.searchInput) {
      const debouncedSearch = debounce((value) => {
        state.filters.search = value;
        applyFilters(); // ALTERAÇÃO: Agora recarrega da API
      }, SEARCH_DEBOUNCE_MS);

      el.searchInput.addEventListener("input", (e) => {
        debouncedSearch(e.target.value.trim());
      });
    }

    // ALTERAÇÃO: Filtro de status - tratar valores vazios ou "todos"
    if (el.filterStatus) {
      el.filterStatus.addEventListener("change", (e) => {
        const value = e.target.value;
        // ALTERAÇÃO: Se for vazio ou "todos", limpar o filtro
        state.filters.status = (value && value !== "" && value !== "todos") ? value : null;
        applyFilters(); // ALTERAÇÃO: Agora recarrega da API
      });
    }

    // ALTERAÇÃO: Filtro de canais - tratar valores vazios ou "todos"
    if (el.filterChannel) {
      el.filterChannel.addEventListener("change", (e) => {
        const value = e.target.value;
        // ALTERAÇÃO: Se for vazio ou "todos", limpar o filtro
        state.filters.channel = (value && value !== "" && value !== "todos") ? value : null;
        applyFilters(); // ALTERAÇÃO: Agora recarrega da API
      });
    }

    // ALTERAÇÃO: Filtro de período - tratar valores vazios ou "todos"
    if (el.filterPeriod) {
      el.filterPeriod.addEventListener("change", (e) => {
        const value = e.target.value;
        // ALTERAÇÃO: Se for vazio ou "todos" ou "all", limpar o filtro
        state.filters.period = (value && value !== "" && value !== "todos" && value !== "all") ? value : null;
        applyFilters(); // ALTERAÇÃO: Usa applyFilters para consistência
      });
    }

    // Lista de pedidos (delegation para botões de ação)
    if (el.ordersList) {
      el.ordersList.addEventListener("click", async (e) => {
        const btn = e.target.closest(".order-action-btn");
        if (!btn) return;

        const orderId = btn.dataset.orderId;
        const nextStatus = btn.dataset.nextStatus;

        // Validar dados antes de processar
        if (!orderId || !nextStatus) return;

        // Confirmar ação - busca segura do pedido
        const order = state.filteredOrders.find((o) => {
          if (!o || typeof o !== "object") return false;
          const oId = o.order_id || o.id;
          const normalizedOrderId = String(orderId || "").trim();
          const normalizedOId = String(oId || "").trim();
          return (
            normalizedOId === normalizedOrderId && normalizedOrderId !== ""
          );
        });

        if (order) {
          const statusText = formatOrderStatus(nextStatus);
          const orderCode = escapeHTML(
            order.confirmation_code || `#${orderId}`
          );
          const confirmMessage = `Deseja realmente atualizar o status do pedido ${orderCode} para "${statusText}"?`;

          const confirmed = await showConfirm({
            title: "Confirmar Atualização de Status",
            message: confirmMessage,
            confirmText: "Confirmar",
            cancelText: "Cancelar",
            type: "warning",
          });

          if (confirmed) {
            await updateOrderStatusAction(orderId, nextStatus);
          }
        }
      });
    }

    // Observar mudanças na seção de pedidos para iniciar/parar auto-refresh
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (
          mutation.type === "attributes" &&
          mutation.attributeName === "style"
        ) {
          const isVisible = secaoPedidos.style.display !== "none";
          if (isVisible && !state.refreshInterval) {
            setupAutoRefresh();
          } else if (!isVisible && state.refreshInterval) {
            stopAutoRefresh();
          }
        }
      });
    });

    observer.observe(secaoPedidos, {
      attributes: true,
      attributeFilter: ["style"],
    });
  }

  /**
   * Verificar se a seção está visível
   * @returns {boolean}
   */
  function isSectionVisible() {
    return secaoPedidos && secaoPedidos.style.display !== "none";
  }

  /**
   * ALTERAÇÃO: Inicializar quando a seção for exibida
   * Otimizado para usar MutationObserver em vez de setInterval
   */
  async function init() {
    if (!isSectionVisible()) {
      // ALTERAÇÃO: Usar MutationObserver para detectar mudanças na visibilidade da seção
      // Mais eficiente que setInterval
      const section = document.getElementById('secao-pedidos');
      if (!section) {
        return;
      }

      const observer = new MutationObserver((mutations) => {
        if (isSectionVisible()) {
          observer.disconnect();
          if (state.visibilityCheckInterval) {
            clearInterval(state.visibilityCheckInterval);
            state.visibilityCheckInterval = null;
          }
          initializeSection();
        }
      });

      // ALTERAÇÃO: Observar mudanças no atributo style
      observer.observe(section, {
        attributes: true,
        attributeFilter: ['style', 'class']
      });

      // ALTERAÇÃO: Timeout de fallback para evitar observação infinita
      let attempts = 0;
      state.visibilityCheckInterval = setInterval(() => {
        attempts++;
        if (isSectionVisible()) {
          observer.disconnect();
          clearVisibilityCheck();
          initializeSection();
        } else if (attempts >= MAX_VISIBILITY_CHECK_ATTEMPTS) {
          observer.disconnect();
          clearVisibilityCheck();
        }
      }, VISIBILITY_CHECK_INTERVAL);

      // ALTERAÇÃO: Armazenar observer para cleanup
      state.visibilityObserver = observer;
      return;
    }

    initializeSection();
  }

  /**
   * Inicializar seção completa
   */
  async function initializeSection() {
    initElements();
    attachEvents();
    await loadOrders();

    if (isSectionVisible()) {
      setupAutoRefresh();
    }
  }

  /**
   * Limpar todos os recursos
   */
  function cleanup() {
    stopAutoRefresh();
    clearVisibilityCheck();
  }

  // Limpar recursos ao sair da página
  window.addEventListener("beforeunload", cleanup);

  // Limpar recursos quando a página fica oculta (evita requisições desnecessárias)
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      stopAutoRefresh();
    } else if (isSectionVisible()) {
      setupAutoRefresh();
    }
  });

  // Inicializar quando DOM estiver pronto
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
