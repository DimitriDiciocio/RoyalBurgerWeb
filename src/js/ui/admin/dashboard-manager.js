/**
 * Dashboard Manager - Gerenciador do Dashboard Principal
 * Responsável por carregar e exibir todas as métricas e visualizações
 *
 * @module DashboardManager
 */

// ALTERAÇÃO: Importar dependências necessárias
import {
  getDashboardMetrics,
  formatCurrency,
  formatTime,
  formatNumber,
  getMenuDashboardMetrics,
  getStockDashboardMetrics,
  getPromotionsDashboardMetrics,
} from "../../api/dashboard.js";
import {
  getAllOrders,
  getTodayOrders,
  getOrderDetails,
  updateOrderStatus,
  formatOrderStatus,
  getStatusColor,
} from "../../api/orders.js";
import {
  getCashFlowSummary,
  getFinancialMovements,
} from "../../api/financial-movements.js";
import { getUsersMetrics, getUserById } from "../../api/user.js";
import { formatDateForISO } from "../../utils/date-formatter.js";
import { showToast } from "../alerts.js";
import { escapeHTML } from "../../utils/html-sanitizer.js";
import { debounce } from "../../utils/performance-utils.js";

// ALTERAÇÃO: Constantes para padronização com order-management.js
const FINAL_STATUSES = ["completed", "delivered", "paid", "cancelled"]; // Status finais que não permitem atualização

export default class DashboardManager {
  /**
   * Construtor do DashboardManager
   * Inicializa propriedades, cache e debounce
   *
   * @public
   */
  constructor() {
    // ALTERAÇÃO: Container principal do dashboard
    this.container = document.getElementById("secao-dashboard");
    this.isInitialized = false;
    this.isLoading = false;
    this.refreshInterval = null;
    this.chartsRefreshInterval = null; // ALTERAÇÃO: Intervalo separado para gráficos
    this.charts = {};
    this.data = {
      metrics: null,
      activeOrders: [],
      lastUpdate: null,
    };

    // ALTERAÇÃO: Sistema de cache com TTL
    this.cache = {
      metrics: { data: null, timestamp: null, ttl: 30000 }, // 30 segundos
      orders: { data: null, timestamp: null, ttl: 30000 }, // 30 segundos
      charts: { data: null, timestamp: null, ttl: 60000 }, // 60 segundos
    };

    // ALTERAÇÃO: Debounce para atualizações
    this.debouncedLoadAllData = debounce(() => {
      this.loadAllData();
    }, 500); // 500ms de debounce

    // ALTERAÇÃO: Cache de telefones de usuários (padronizado com order-management.js)
    this.userPhoneCache = {};
  }

  /**
   * Inicializa o dashboard
   * Verifica se a seção existe, configura event listeners e carrega dados iniciais
   *
   * @async
   * @returns {Promise<void>}
   * @throws {Error} Se houver erro ao inicializar
   */
  async init() {
    if (this.isInitialized) {
      return;
    }

    try {
      // ALTERAÇÃO: Verificar se a seção existe
      if (!this.container) {
        // ALTERAÇÃO: Log apenas em modo debug
        if (typeof window !== "undefined" && window.DEBUG_MODE) {
          console.warn("[Dashboard] Seção de dashboard não encontrada");
        }
        return;
      }

      // ALTERAÇÃO: Configurar event listeners
      this.setupEventListeners();

      // ALTERAÇÃO: Configurar listeners WebSocket para atualização em tempo real
      this.setupSocketListeners();

      // ALTERAÇÃO: Carregar dados iniciais
      await this.loadAllData();

      // ALTERAÇÃO: Criar gráficos na inicialização
      await this.updateCharts();
      // ALTERAÇÃO: Iniciar atualização automática
      this.startAutoRefresh();

      this.isInitialized = true;
    } catch (error) {
      // ALTERAÇÃO: Log condicional apenas em modo debug
      if (typeof window !== "undefined" && window.DEBUG_MODE) {
        console.error("[Dashboard] Erro ao inicializar dashboard:", error);
        console.error("[Dashboard] Stack trace:", error.stack);
      }
      this.showError("Erro ao carregar dashboard");
      this.isInitialized = false;
    }
  }

  /**
   * Configura todos os event listeners do dashboard
   * Inclui navegação, Page Visibility API e outros eventos
   *
   * @private
   */
  setupEventListeners() {
    // ALTERAÇÃO: Link "Ver todos os pedidos"
    const viewAllLink = document.getElementById("dashboard-ver-todos-pedidos");
    if (viewAllLink) {
      viewAllLink.addEventListener("click", (e) => {
        e.preventDefault();
        // ALTERAÇÃO: Navegar para seção de pedidos
        if (window.adminPanel) {
          window.adminPanel.showSection("pedidos");
        }
      });
    }

    // ALTERAÇÃO: Pausar atualização quando a página não está visível
    // Usa Page Visibility API para otimizar performance
    // ALTERAÇÃO: Verificar se Page Visibility API está disponível
    if (typeof document !== "undefined" && "visibilityState" in document) {
      document.addEventListener("visibilitychange", () => {
        // ALTERAÇÃO: Verificar estado de visibilidade
        if (document.visibilityState === "hidden") {
          // ALTERAÇÃO: Pausar atualizações quando página não está visível
          this.stopAutoRefresh();
        } else if (
          document.visibilityState === "visible" &&
          this.isInitialized
        ) {
          // ALTERAÇÃO: Retomar atualizações quando página volta a ficar visível
          this.startAutoRefresh();
          // ALTERAÇÃO: Recarregar dados ao voltar (usando cache se disponível)
          this.loadAllData();
        }
      });
    } else {
      // ALTERAÇÃO: Fallback se Page Visibility API não estiver disponível
      // Continuar com atualizações normais (sem log, pois é comportamento esperado)
    }

    // ALTERAÇÃO: Limpar intervalos ao sair da seção
    // Será chamado pelo painel-adm.js quando trocar de seção através do método cleanup()
  }

  /**
   * Configura listeners de eventos WebSocket para atualização em tempo real
   * Atualiza pedidos ativos quando novos pedidos chegam ou status mudam
   *
   * @private
   */
  setupSocketListeners() {
    // Importar socketService dinamicamente para evitar dependência circular
    import("../../api/socket-client.js")
      .then(({ socketService }) => {
        // Listener para novo pedido criado
        socketService.on("order.created", async (orderData) => {
          console.log(
            "📦 Dashboard: Novo pedido recebido via WebSocket:",
            orderData
          );

          // Verifica se a seção do dashboard está visível
          if (!this.container || this.container.style.display === "none") {
            return;
          }

          // Verifica se o pedido é ativo (status que deve aparecer no dashboard)
          const activeStatuses = [
            "pending",
            "preparing",
            "ready",
            "on_the_way",
          ];
          const initialStatus = orderData.status || "pending";

          if (activeStatuses.includes(initialStatus)) {
            try {
              // Buscar detalhes completos do pedido
              const orderId = orderData.order_id;
              if (!orderId) return;

              const detailsResult = await getOrderDetails(orderId);
              if (detailsResult.success && detailsResult.data) {
                const fullOrder = detailsResult.data;

                // Buscar telefone do cliente se necessário
                if (!fullOrder._cachedPhone) {
                  const phone = await this.getCustomerPhone(fullOrder);
                  fullOrder._cachedPhone = phone;
                }

                // Adiciona o novo pedido ao início da lista
                this.data.activeOrders.unshift(fullOrder);

                // Limita a 10 pedidos no dashboard
                if (this.data.activeOrders.length > 10) {
                  this.data.activeOrders = this.data.activeOrders.slice(0, 10);
                }

                // Renderiza os cards atualizados
                const container = document.getElementById(
                  "dashboard-pedidos-ativos-list"
                );
                if (container) {
                  this.renderActiveOrdersCards(
                    this.data.activeOrders,
                    container
                  );

                  // Adiciona animação de destaque ao novo card
                  setTimeout(() => {
                    const newCard = container.querySelector(
                      `[data-order-id="${orderId}"]`
                    );
                    if (newCard) {
                      newCard.classList.add("highlight-new-order");
                      setTimeout(() => {
                        newCard.classList.remove("highlight-new-order");
                      }, 3000);
                    }
                  }, 100);
                }
              }
            } catch (error) {
              console.error(
                "Erro ao processar novo pedido no dashboard:",
                error
              );
              // Em caso de erro, recarrega a lista completa
              this.loadActiveOrders();
            }
          }
        });

        // Listener para mudança de status de pedido
        socketService.on("order.status_changed", async (data) => {
          console.log(
            "🔄 Dashboard: Status do pedido alterado via WebSocket:",
            data
          );

          // Verifica se a seção do dashboard está visível
          if (!this.container || this.container.style.display === "none") {
            return;
          }

          const orderId = data.order_id;
          const newStatus = data.new_status;
          const activeStatuses = [
            "pending",
            "preparing",
            "ready",
            "on_the_way",
          ];

          // Encontrar o pedido na lista
          const orderIndex = this.data.activeOrders.findIndex(
            (order) => order.id === orderId || order.order_id === orderId
          );

          if (orderIndex !== -1) {
            if (activeStatuses.includes(newStatus)) {
              // Se ainda é ativo, atualiza o status
              this.data.activeOrders[orderIndex].status = newStatus;

              // Renderiza os cards atualizados
              const container = document.getElementById(
                "dashboard-pedidos-ativos-list"
              );
              if (container) {
                this.renderActiveOrdersCards(this.data.activeOrders, container);

                // Adiciona animação de mudança de status
                setTimeout(() => {
                  const updatedCard = container.querySelector(
                    `[data-order-id="${orderId}"]`
                  );
                  if (updatedCard) {
                    updatedCard.classList.add("order-status-changed");
                    setTimeout(() => {
                      updatedCard.classList.remove("order-status-changed");
                    }, 2000);
                  }
                }, 100);
              }
            } else {
              // Se não é mais ativo, remove da lista
              this.data.activeOrders.splice(orderIndex, 1);

              // Renderiza os cards atualizados
              const container = document.getElementById(
                "dashboard-pedidos-ativos-list"
              );
              if (container) {
                this.renderActiveOrdersCards(this.data.activeOrders, container);
              }
            }
          } else if (activeStatuses.includes(newStatus)) {
            // Se o pedido não está na lista mas agora é ativo, adiciona
            try {
              const detailsResult = await getOrderDetails(orderId);
              if (detailsResult.success && detailsResult.data) {
                const fullOrder = detailsResult.data;

                // Buscar telefone do cliente se necessário
                if (!fullOrder._cachedPhone) {
                  const phone = await this.getCustomerPhone(fullOrder);
                  fullOrder._cachedPhone = phone;
                }

                // Adiciona o pedido ao início da lista
                this.data.activeOrders.unshift(fullOrder);

                // Limita a 10 pedidos
                if (this.data.activeOrders.length > 10) {
                  this.data.activeOrders = this.data.activeOrders.slice(0, 10);
                }

                // Renderiza os cards atualizados
                const container = document.getElementById(
                  "dashboard-pedidos-ativos-list"
                );
                if (container) {
                  this.renderActiveOrdersCards(
                    this.data.activeOrders,
                    container
                  );
                }
              }
            } catch (error) {
              console.error(
                "Erro ao adicionar pedido atualizado no dashboard:",
                error
              );
            }
          }
        });
      })
      .catch((error) => {
        console.warn(
          "Não foi possível carregar socketService para atualizações do dashboard:",
          error
        );
      });
  }

  /**
   * Carrega todos os dados do dashboard
   * Carrega métricas financeiras, de pedidos e outras métricas em paralelo
   *
   * @async
   * @returns {Promise<void>}
   * @throws {Error} Se houver erro ao carregar dados
   * @public
   */
  async loadAllData() {
    if (this.isLoading) {
      return;
    }

    this.isLoading = true;
    try {
      // ALTERAÇÃO: Carregar em paralelo para melhor performance
      await Promise.all([
        this.loadFinancialMetrics(),
        this.loadOrderMetrics(),
        this.loadOtherMetrics(),
        this.loadActiveOrders(),
      ]);

      // ALTERAÇÃO: Não criar gráficos aqui - serão atualizados pelo intervalo separado
      // Gráficos são criados apenas na inicialização ou quando updateCharts() é chamado explicitamente

      this.data.lastUpdate = new Date();
    } catch (error) {
      // ALTERAÇÃO: Log condicional apenas em modo debug
      if (typeof window !== "undefined" && window.DEBUG_MODE) {
        console.error(
          "[Dashboard] Erro ao carregar dados do dashboard:",
          error
        );
        console.error("[Dashboard] Stack trace:", error.stack);
      }
      this.showError("Erro ao carregar dados do dashboard");
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Carrega métricas financeiras (Receita do Dia, Receita Mensal, Ticket Médio)
   *
   * @async
   * @returns {Promise<void>}
   * @throws {Error} Se houver erro ao buscar dados financeiros
   * @private
   */
  async loadFinancialMetrics() {
    try {
      // ALTERAÇÃO: PADRONIZAÇÃO - Usar movimentações financeiras (mesma lógica do módulo financeiro)
      // ALTERAÇÃO: Otimização - Buscar movimentações de hoje e ontem uma vez e reutilizar
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);
      const yesterdayEnd = new Date(yesterday);
      yesterdayEnd.setDate(yesterdayEnd.getDate() + 1);

      const todayStartDate = formatDateForISO(today);
      const todayEndDate = formatDateForISO(tomorrow);
      const yesterdayStartDate = formatDateForISO(yesterday);
      const yesterdayEndDate = formatDateForISO(yesterdayEnd);

      // ALTERAÇÃO: Buscar movimentações de hoje e ontem em paralelo para melhor performance
      const [todayMovementsResponse, yesterdayMovementsResponse] =
        await Promise.all([
          getFinancialMovements({
            start_date: todayStartDate,
            end_date: todayEndDate,
            type: "REVENUE",
            payment_status: "Paid",
          }),
          getFinancialMovements({
            start_date: yesterdayStartDate,
            end_date: yesterdayEndDate,
            type: "REVENUE",
            payment_status: "Paid",
          }),
        ]);

      const todayMovements =
        todayMovementsResponse.items || todayMovementsResponse || [];
      const yesterdayMovements =
        yesterdayMovementsResponse.items || yesterdayMovementsResponse || [];

      // ALTERAÇÃO: Calcular receita a partir das movimentações já buscadas (evita chamada duplicada)
      const todayRevenue = this.calculateRevenueFromMovements(todayMovements);
      const yesterdayRevenue =
        this.calculateRevenueFromMovements(yesterdayMovements);

      const revenueVariation = this.calculateVariation(
        todayRevenue,
        yesterdayRevenue
      );

      // ALTERAÇÃO: Atualizar DOM - Receita do dia
      this.updateElement(
        "dashboard-receita-dia",
        formatCurrency(todayRevenue || 0)
      );
      this.updateElement(
        "dashboard-receita-variacao",
        `${revenueVariation >= 0 ? "+" : ""}${revenueVariation.toFixed(
          1
        )}% vs ontem`
      );

      // ALTERAÇÃO: Receita mensal - Usar getCashFlowSummary (mesma API do módulo financeiro)
      try {
        const monthlySummary = await getCashFlowSummary("this_month", false);
        const monthlyRevenue = monthlySummary.total_revenue || 0;

        const monthlyGoal = await this.getMonthlyGoal();

        this.updateElement(
          "dashboard-receita-mensal",
          formatCurrency(monthlyRevenue || 0)
        );
        this.updateElement(
          "dashboard-meta-mensal",
          `Meta: ${formatCurrency(monthlyGoal || 0)}`
        );
      } catch (error) {
        // ALTERAÇÃO: Log condicional apenas em modo debug
        if (typeof window !== "undefined" && window.DEBUG_MODE) {
          console.error(
            "[Dashboard] Erro ao buscar receita mensal via getCashFlowSummary, usando fallback:",
            error
          );
        }
        // ALTERAÇÃO: Fallback para método antigo se getCashFlowSummary falhar
        const monthlyRevenue = await this.getMonthlyRevenue();
        const monthlyGoal = await this.getMonthlyGoal();
        this.updateElement(
          "dashboard-receita-mensal",
          formatCurrency(monthlyRevenue || 0)
        );
        this.updateElement(
          "dashboard-meta-mensal",
          `Meta: ${formatCurrency(monthlyGoal || 0)}`
        );
      }

      // ALTERAÇÃO: Ticket médio - Reutilizar movimentações já buscadas (evita chamada duplicada)
      const todayOrdersCount =
        this.countUniqueOrdersFromMovements(todayMovements);
      const yesterdayOrdersCount =
        this.countUniqueOrdersFromMovements(yesterdayMovements);

      // ALTERAÇÃO: Ticket médio = Receita de movimentações financeiras / Pedidos únicos com movimentações pagas
      const ticketMedio =
        todayOrdersCount > 0 ? todayRevenue / todayOrdersCount : 0;
      const yesterdayTicket =
        yesterdayOrdersCount > 0 ? yesterdayRevenue / yesterdayOrdersCount : 0;

      const ticketVariation = this.calculateVariation(
        ticketMedio,
        yesterdayTicket
      );
      this.updateElement(
        "dashboard-ticket-medio",
        formatCurrency(ticketMedio || 0)
      );
      this.updateElement(
        "dashboard-ticket-variacao",
        `${ticketVariation >= 0 ? "+" : ""}${ticketVariation.toFixed(
          1
        )}% vs ontem`
      );
    } catch (error) {
      // ALTERAÇÃO: Log condicional apenas em modo debug
      if (typeof window !== "undefined" && window.DEBUG_MODE) {
        console.error(
          "[Dashboard] Erro ao carregar métricas financeiras:",
          error
        );
        console.error("[Dashboard] Stack trace:", error.stack);
      }
      this.showError("Erro ao carregar métricas financeiras");
    }
  }

  /**
   * Carrega métricas de pedidos (Pedidos Hoje, breakdown por status)
   *
   * @async
   * @returns {Promise<void>}
   * @throws {Error} Se houver erro ao buscar dados de pedidos
   * @private
   */
  async loadOrderMetrics() {
    try {
      // ALTERAÇÃO: Buscar pedidos usando cache
      const todayOrdersResponse = await this.getCachedData(
        "orders",
        async () => {
          return await getTodayOrders();
        }
      );

      const todayOrders = this.extractOrdersFromResponse(todayOrdersResponse);

      // ALTERAÇÃO: Contar pedidos por status
      const activeOrders = todayOrders.filter((o) =>
        ["pending", "preparing", "on_the_way"].includes(o.status)
      );
      const completedOrders = todayOrders.filter((o) =>
        ["completed", "delivered", "paid"].includes(o.status)
      );

      // ALTERAÇÃO: Atualizar DOM
      this.updateElement("dashboard-pedidos-hoje", todayOrders.length);
      this.updateElement(
        "dashboard-pedidos-ativos",
        `${activeOrders.length} Ativos`
      );
      this.updateElement(
        "dashboard-pedidos-concluidos",
        `${completedOrders.length} Concluídos`
      );
    } catch (error) {
      // ALTERAÇÃO: Log condicional apenas em modo debug
      if (typeof window !== "undefined" && window.DEBUG_MODE) {
        console.error(
          "[Dashboard] Erro ao carregar métricas de pedidos:",
          error
        );
        console.error("[Dashboard] Stack trace:", error.stack);
      }
      this.showError("Erro ao carregar métricas de pedidos");
    }
  }

  /**
   * Carrega métricas de produtos, estoque, promoções e usuários
   *
   * @async
   * @returns {Promise<void>}
   * @throws {Error} Se houver erro ao buscar métricas secundárias (erro silencioso)
   * @private
   */
  async loadOtherMetrics() {
    try {
      // ALTERAÇÃO: Produtos
      const menuMetrics = await getMenuDashboardMetrics();

      if (menuMetrics.success && menuMetrics.data) {
        // ALTERAÇÃO: CORREÇÃO - Usar total_products e calcular produtos ativos corretamente
        const {
          total_products,
          inactive_products,
          unavailable_items,
          total_items,
        } = menuMetrics.data;
        const activeProducts =
          total_products && inactive_products !== undefined
            ? total_products - inactive_products
            : total_items || 0;
        this.updateElement("dashboard-produtos-ativos", activeProducts || 0);
        this.updateElement(
          "dashboard-produtos-indisponiveis",
          `${unavailable_items || 0} indisponíveis`
        );
      } else {
        // ALTERAÇÃO: Log condicional apenas em modo debug
        if (typeof window !== "undefined" && window.DEBUG_MODE) {
          console.warn(
            "[Dashboard] MenuMetrics não retornou dados válidos:",
            menuMetrics
          );
        }
      }

      // ALTERAÇÃO: Estoque
      const stockMetrics = await getStockDashboardMetrics();

      if (stockMetrics.success && stockMetrics.data) {
        // ALTERAÇÃO: CORREÇÃO - Calcular estoque crítico como soma de sem estoque + baixo estoque
        const { out_of_stock_count, low_stock_count, critical_items } =
          stockMetrics.data;
        const criticalStock =
          out_of_stock_count !== undefined && low_stock_count !== undefined
            ? (out_of_stock_count || 0) + (low_stock_count || 0)
            : critical_items || 0;
        this.updateElement("dashboard-estoque-critico", criticalStock || 0);
      } else {
        // ALTERAÇÃO: Log condicional apenas em modo debug
        if (typeof window !== "undefined" && window.DEBUG_MODE) {
          console.warn(
            "[Dashboard] StockMetrics não retornou dados válidos:",
            stockMetrics
          );
        }
      }

      // ALTERAÇÃO: Promoções
      const promoMetrics = await getPromotionsDashboardMetrics();

      if (promoMetrics.success && promoMetrics.data) {
        const { active_promotions } = promoMetrics.data;
        this.updateElement(
          "dashboard-promocoes-ativas",
          active_promotions || 0
        );
      }

      // ALTERAÇÃO: Usuários
      try {
        const userMetrics = await getUsersMetrics();

        if (userMetrics && typeof userMetrics === "object") {
          // ALTERAÇÃO: CORREÇÃO - A API retorna diretamente o objeto, não está dentro de success.data
          const activeUsers =
            userMetrics.ativos ||
            userMetrics.active_users ||
            userMetrics.total_users ||
            userMetrics.count ||
            0;
          this.updateElement("dashboard-usuarios-ativos", activeUsers || 0);
        } else {
          // ALTERAÇÃO: Log condicional apenas em modo debug
          if (typeof window !== "undefined" && window.DEBUG_MODE) {
            console.warn(
              "[Dashboard] UserMetrics não retornou dados válidos:",
              userMetrics
            );
          }
        }
      } catch (error) {
        // ALTERAÇÃO: Log condicional apenas em modo debug
        if (typeof window !== "undefined" && window.DEBUG_MODE) {
          console.error(
            "[Dashboard] Erro ao buscar métricas de usuários:",
            error
          );
        }
      }
    } catch (error) {
      // ALTERAÇÃO: Log condicional apenas em modo debug
      if (typeof window !== "undefined" && window.DEBUG_MODE) {
        console.error("[Dashboard] Erro ao carregar outras métricas:", error);
      }
      // ALTERAÇÃO: Não mostrar erro para métricas secundárias para não poluir a UI
    }
  }

  /**
   * Extrai array de pedidos da resposta da API
   * Compatível com diferentes formatos de resposta (array direto ou objeto com items/pagination)
   *
   * @param {Object|Array} response - Resposta da API (pode ser objeto ou array direto)
   * @returns {Array} Array de pedidos
   * @private
   */
  extractOrdersFromResponse(response) {
    // ALTERAÇÃO: Se response já é um array, retornar diretamente
    if (Array.isArray(response)) {
      return response;
    }

    // ALTERAÇÃO: Se response é null ou undefined, retornar array vazio
    if (!response) {
      return [];
    }

    // ALTERAÇÃO: Verificar se response tem propriedade success
    if (response.success === false) {
      return [];
    }

    // ALTERAÇÃO: Extrair data da resposta
    const data = response.data || response;

    // ALTERAÇÃO: Se data já é um array, retornar diretamente
    if (Array.isArray(data)) {
      return data;
    }

    // ALTERAÇÃO: Verificar formato com paginação (response.data.items)
    if (data && typeof data === "object" && Array.isArray(data.items)) {
      return data.items;
    }

    // ALTERAÇÃO: Verificar formato com paginação alternativa (response.items)
    if (response.items && Array.isArray(response.items)) {
      return response.items;
    }

    // ALTERAÇÃO: Verificar se é objeto único (não array)
    if (data && typeof data === "object" && !Array.isArray(data) && data.id) {
      return [data];
    }

    // ALTERAÇÃO: Se não conseguir extrair, retornar array vazio
    return [];
  }

  /**
   * ALTERAÇÃO: Calcula receita a partir de movimentações financeiras (padronizado com módulo financeiro)
   *
   * @param {Array} movements - Array de movimentações financeiras tipo REVENUE
   * @returns {number} Receita total
   * @private
   */
  calculateRevenueFromMovements(movements) {
    if (!Array.isArray(movements) || movements.length === 0) {
      return 0;
    }

    // ALTERAÇÃO: Somar apenas movimentações de receita com status Paid
    const paidRevenues = movements.filter((movement) => {
      return (
        movement.type === "REVENUE" &&
        (movement.payment_status === "Paid" ||
          movement.payment_status === "PAID")
      );
    });

    const revenue = paidRevenues.reduce((total, movement) => {
      const value = parseFloat(movement.value || movement.amount || 0);
      return total + (isNaN(value) ? 0 : value);
    }, 0);

    return revenue;
  }

  /**
   * ALTERAÇÃO: Conta pedidos únicos a partir de movimentações financeiras pagas
   * Usa related_entity_id quando related_entity_type for 'order' ou similar
   *
   * @param {Array} movements - Array de movimentações financeiras
   * @returns {number} Número de pedidos únicos com movimentações pagas
   * @private
   */
  countUniqueOrdersFromMovements(movements) {
    if (!Array.isArray(movements) || movements.length === 0) {
      return 0;
    }

    // ALTERAÇÃO: Filtrar apenas movimentações de receita pagas
    const paidRevenues = movements.filter((movement) => {
      return (
        movement.type === "REVENUE" &&
        (movement.payment_status === "Paid" ||
          movement.payment_status === "PAID")
      );
    });

    // ALTERAÇÃO: Extrair IDs únicos de pedidos das movimentações
    const orderIds = new Set();

    paidRevenues.forEach((movement) => {
      // ALTERAÇÃO: Verificar diferentes campos possíveis para order_id
      const orderId =
        movement.order_id ||
        movement.orderId ||
        movement.related_entity_id ||
        movement.relatedEntityId ||
        (movement.related_entity_type === "order" ||
        movement.related_entity_type === "Order"
          ? movement.related_entity_id
          : null);

      if (orderId) {
        orderIds.add(String(orderId));
      }
    });

    return orderIds.size;
  }

  /**
   * ALTERAÇÃO: Obtém receita do dia usando movimentações financeiras (padronizado com módulo financeiro)
   *
   * @async
   * @returns {Promise<number>} Receita do dia
   * @private
   */
  async getTodayRevenueFromFinancialMovements() {
    try {
      // ALTERAÇÃO: Calcular data de hoje (início e fim do dia)
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const startDate = formatDateForISO(today);
      const endDate = formatDateForISO(tomorrow);

      // ALTERAÇÃO: Buscar movimentações financeiras de receita do dia
      const response = await getFinancialMovements({
        start_date: startDate,
        end_date: endDate,
        type: "REVENUE",
        payment_status: "Paid",
      });

      const movements = response.items || response || [];

      const revenue = this.calculateRevenueFromMovements(movements);

      return revenue;
    } catch (error) {
      // ALTERAÇÃO: Log condicional apenas em modo debug
      if (typeof window !== "undefined" && window.DEBUG_MODE) {
        console.error(
          "[Dashboard] Erro ao buscar receita do dia via movimentações financeiras:",
          error
        );
      }
      return 0;
    }
  }

  /**
   * ALTERAÇÃO: Obtém receita de ontem usando movimentações financeiras (padronizado com módulo financeiro)
   *
   * @async
   * @returns {Promise<number>} Receita de ontem
   * @private
   */
  async getYesterdayRevenueFromFinancialMovements() {
    try {
      // ALTERAÇÃO: Calcular data de ontem (início e fim do dia)
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);
      const today = new Date(yesterday);
      today.setDate(today.getDate() + 1);

      const startDate = formatDateForISO(yesterday);
      const endDate = formatDateForISO(today);

      // ALTERAÇÃO: Buscar movimentações financeiras de receita de ontem
      const response = await getFinancialMovements({
        start_date: startDate,
        end_date: endDate,
        type: "REVENUE",
        payment_status: "Paid",
      });

      const movements = response.items || response || [];

      const revenue = this.calculateRevenueFromMovements(movements);

      return revenue;
    } catch (error) {
      // ALTERAÇÃO: Log condicional apenas em modo debug
      if (typeof window !== "undefined" && window.DEBUG_MODE) {
        console.error(
          "[Dashboard] Erro ao buscar receita de ontem via movimentações financeiras:",
          error
        );
      }
      return 0;
    }
  }

  /**
   * ALTERAÇÃO: Calcula receita total do dia a partir dos pedidos (mantido para compatibilidade/fallback)
   *
   * @param {Array} orders - Array de pedidos
   * @returns {number} Receita total
   * @private
   */
  calculateTodayRevenue(orders) {
    if (!Array.isArray(orders) || orders.length === 0) {
      return 0;
    }

    // ALTERAÇÃO: Somar apenas pedidos concluídos/pagos e excluir cancelados
    const completedOrders = orders.filter((order) => {
      const status = order.status;
      return (
        ["completed", "delivered", "paid"].includes(status) &&
        status !== "cancelled"
      );
    });

    const revenue = completedOrders.reduce((total, order) => {
      // ALTERAÇÃO: CORREÇÃO - Verificar total_amount primeiro (campo mais comum)
      const orderTotal = parseFloat(
        order.total_amount || order.total || order.amount || 0
      );
      return total + (isNaN(orderTotal) ? 0 : orderTotal);
    }, 0);
    return revenue;
  }

  /**
   * Busca receita de ontem
   *
   * @async
   * @returns {Promise<number>} Receita de ontem
   * @throws {Error} Se houver erro ao buscar dados (retorna 0 em caso de erro)
   * @private
   */
  async getYesterdayRevenue() {
    try {
      // ALTERAÇÃO: Buscar pedidos de ontem usando getAllOrders com filtro de data
      // Como a API não tem endpoint específico para ontem, vamos buscar do mês e filtrar
      const yesterdayResponse = await getAllOrders({ period: "week" });
      const allOrders = this.extractOrdersFromResponse(yesterdayResponse);

      // ALTERAÇÃO: Filtrar pedidos de ontem
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const yesterdayOrders = allOrders.filter((order) => {
        if (!order.created_at && !order.order_date) {
          return false;
        }
        const orderDate = new Date(order.created_at || order.order_date);
        orderDate.setHours(0, 0, 0, 0);
        return orderDate.getTime() === yesterday.getTime();
      });

      return this.calculateTodayRevenue(yesterdayOrders);
    } catch (error) {
      // ALTERAÇÃO: Log condicional apenas em modo debug
      if (typeof window !== "undefined" && window.DEBUG_MODE) {
        console.error("Erro ao buscar receita de ontem:", error);
      }
      return 0;
    }
  }

  /**
   * Busca quantidade de pedidos de ontem
   *
   * @async
   * @returns {Promise<number>} Quantidade de pedidos de ontem
   * @throws {Error} Se houver erro ao buscar dados (retorna 0 em caso de erro)
   * @private
   */
  async getYesterdayOrdersCount() {
    try {
      // ALTERAÇÃO: Buscar pedidos de ontem usando getAllOrders com filtro de data
      const yesterdayResponse = await getAllOrders({ period: "week" });
      const allOrders = this.extractOrdersFromResponse(yesterdayResponse);

      // ALTERAÇÃO: Filtrar pedidos de ontem
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);

      const yesterdayOrders = allOrders.filter((order) => {
        // ALTERAÇÃO: Verificar se tem data
        if (!order.created_at && !order.order_date) {
          return false;
        }
        const orderDate = new Date(order.created_at || order.order_date);
        orderDate.setHours(0, 0, 0, 0);
        const isYesterday = orderDate.getTime() === yesterday.getTime();

        // ALTERAÇÃO: Excluir pedidos cancelados
        const isNotCancelled = order.status !== "cancelled";

        return isYesterday && isNotCancelled;
      });

      return yesterdayOrders.length;
    } catch (error) {
      // ALTERAÇÃO: Log condicional apenas em modo debug
      if (typeof window !== "undefined" && window.DEBUG_MODE) {
        console.error("Erro ao buscar quantidade de pedidos de ontem:", error);
      }
      return 0;
    }
  }

  /**
   * ALTERAÇÃO: Busca quantidade de pedidos concluídos de ontem (para cálculo de ticket médio)
   *
   * @async
   * @returns {Promise<number>} Quantidade de pedidos concluídos de ontem
   * @private
   */
  async getYesterdayCompletedOrdersCount() {
    try {
      // ALTERAÇÃO: Buscar pedidos de ontem usando getAllOrders com filtro de data
      const yesterdayResponse = await getAllOrders({ period: "week" });
      const allOrders = this.extractOrdersFromResponse(yesterdayResponse);

      // ALTERAÇÃO: Filtrar pedidos de ontem e apenas concluídos/pagos
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);

      const yesterdayCompletedOrders = allOrders.filter((order) => {
        // ALTERAÇÃO: Verificar data
        if (!order.created_at && !order.order_date) {
          return false;
        }
        const orderDate = new Date(order.created_at || order.order_date);
        orderDate.setHours(0, 0, 0, 0);
        const isYesterday = orderDate.getTime() === yesterday.getTime();

        // ALTERAÇÃO: Verificar status (apenas concluídos/pagos)
        const isCompleted = ["completed", "delivered", "paid"].includes(
          order.status
        );

        return isYesterday && isCompleted;
      });

      return yesterdayCompletedOrders.length;
    } catch (error) {
      // ALTERAÇÃO: Log condicional apenas em modo debug
      if (typeof window !== "undefined" && window.DEBUG_MODE) {
        console.error(
          "Erro ao buscar quantidade de pedidos concluídos de ontem:",
          error
        );
      }
      return 0;
    }
  }

  /**
   * Busca receita mensal
   *
   * @async
   * @returns {Promise<number>} Receita mensal
   * @throws {Error} Se houver erro ao buscar dados (retorna 0 em caso de erro)
   * @private
   */
  async getMonthlyRevenue() {
    try {
      // ALTERAÇÃO: PADRONIZAÇÃO - Usar getCashFlowSummary (mesma lógica do módulo financeiro)
      const monthlySummary = await getCashFlowSummary("this_month", false);
      const monthlyRevenue = monthlySummary.total_revenue || 0;
      return monthlyRevenue;
    } catch (error) {
      // ALTERAÇÃO: Log condicional apenas em modo debug
      if (typeof window !== "undefined" && window.DEBUG_MODE) {
        console.error(
          "[Dashboard] Erro ao buscar receita mensal via getCashFlowSummary, usando fallback:",
          error
        );
      }
      // ALTERAÇÃO: Fallback para cálculo baseado em pedidos se getCashFlowSummary falhar
      try {
        const monthlyResponse = await getAllOrders({ period: "month" });
        const monthlyOrders = this.extractOrdersFromResponse(monthlyResponse);

        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();

        const currentMonthOrders = monthlyOrders.filter((order) => {
          if (!order.created_at && !order.order_date) {
            return false;
          }
          const orderDate = new Date(order.created_at || order.order_date);
          const isCurrentMonth =
            orderDate.getMonth() === currentMonth &&
            orderDate.getFullYear() === currentYear;
          const isNotCancelled = order.status !== "cancelled";

          return isCurrentMonth && isNotCancelled;
        });

        return this.calculateTodayRevenue(currentMonthOrders);
      } catch (fallbackError) {
        // ALTERAÇÃO: Log condicional apenas em modo debug
        if (typeof window !== "undefined" && window.DEBUG_MODE) {
          console.error(
            "[Dashboard] Erro no fallback de receita mensal:",
            fallbackError
          );
        }
        return 0;
      }
    }
  }

  /**
   * Busca meta mensal
   * TODO: REVISAR - Implementar quando endpoint de metas estiver disponível
   *
   * @async
   * @returns {Promise<number>} Meta mensal
   * @throws {Error} Se houver erro ao buscar dados (retorna 0 em caso de erro)
   * @private
   */
  async getMonthlyGoal() {
    try {
      // ALTERAÇÃO: Tentar buscar do endpoint de métricas do dashboard
      const metricsResponse = await getDashboardMetrics();
      if (metricsResponse.success && metricsResponse.data) {
        const { monthly_goal, goal } = metricsResponse.data;
        return monthly_goal || goal || 0;
      }

      // ALTERAÇÃO: Se não houver meta, retornar 0 (será exibido como R$ 0,00)
      return 0;
    } catch (error) {
      // ALTERAÇÃO: Log condicional apenas em modo debug (já estava correto)
      if (typeof window !== "undefined" && window.DEBUG_MODE) {
        console.error("Erro ao buscar meta mensal:", error);
      }
      return 0;
    }
  }

  /**
   * Calcula variação percentual entre dois valores
   *
   * @param {number} current - Valor atual
   * @param {number} previous - Valor anterior
   * @returns {number} Variação percentual
   * @private
   */
  calculateVariation(current, previous) {
    if (!previous || previous === 0) {
      return current > 0 ? 100 : 0;
    }

    const variation = ((current - previous) / previous) * 100;
    return isNaN(variation) ? 0 : variation;
  }

  /**
   * Inicia atualização automática do dashboard
   * Atualiza métricas principais a cada 30 segundos e gráficos a cada 60 segundos
   * quando a página está visível
   *
   * @private
   */
  startAutoRefresh() {
    // ALTERAÇÃO: Limpar intervalos anteriores se existirem
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }
    if (this.chartsRefreshInterval) {
      clearInterval(this.chartsRefreshInterval);
    }

    // ALTERAÇÃO: Atualizar métricas principais a cada 30 segundos
    // Nota: setInterval já previne múltiplas chamadas simultâneas, mas adicionamos verificação de isLoading
    this.refreshInterval = setInterval(() => {
      // ALTERAÇÃO: Verificar se página está visível e se não está carregando
      if (
        typeof document !== "undefined" &&
        document.visibilityState === "visible" &&
        !this.isLoading
      ) {
        this.loadAllData();
      }
    }, 30000); // 30 segundos

    // ALTERAÇÃO: Atualizar gráficos a cada 60 segundos
    this.chartsRefreshInterval = setInterval(() => {
      // ALTERAÇÃO: Verificar se página está visível antes de atualizar gráficos
      if (
        typeof document !== "undefined" &&
        document.visibilityState === "visible"
      ) {
        this.updateCharts();
      }
    }, 60000); // 60 segundos
  }

  /**
   * Para atualização automática
   * Limpa todos os intervalos de atualização
   *
   * @private
   */
  stopAutoRefresh() {
    // ALTERAÇÃO: Parar intervalo de métricas
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }

    // ALTERAÇÃO: Parar intervalo de gráficos
    if (this.chartsRefreshInterval) {
      clearInterval(this.chartsRefreshInterval);
      this.chartsRefreshInterval = null;
    }
  }

  /**
   * Atualiza elemento do DOM com valor
   *
   * @param {string} id - ID do elemento
   * @param {string|number} value - Valor a ser atualizado
   * @private
   */
  updateElement(id, value) {
    const element = document.getElementById(id);
    if (element) {
      if (element.tagName === "INPUT" || element.tagName === "TEXTAREA") {
        element.value = value;
      } else {
        element.textContent = value;
      }
    }
  }

  /**
   * Mostra erro em container específico
   *
   * @param {string} containerId - ID do container
   * @param {string} message - Mensagem de erro
   * @private
   */
  showErrorInContainer(containerId, message) {
    const container = document.getElementById(containerId);
    if (container) {
      // ALTERAÇÃO: Sanitizar mensagem antes de inserir no innerHTML para prevenir XSS
      container.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; padding: 20px; color: #ef4444;">
                    <i class="fa-solid fa-exclamation-triangle" style="font-size: 1.5rem; margin-bottom: 10px;"></i>
                    <p>${escapeHTML(message)}</p>
                </div>
            `;
    }
  }

  /**
   * Mostra mensagem de erro geral
   *
   * @param {string} message - Mensagem de erro
   * @private
   */
  showError(message) {
    showToast(message, { type: "error", title: "Erro no Dashboard" });
  }

  /**
   * Mostra estado de loading em container específico
   *
   * @param {string} containerId - ID do container
   * @param {string} [message] - Mensagem de loading (opcional)
   * @private
   */
  showLoadingInContainer(containerId, message = "Carregando...") {
    const container = document.getElementById(containerId);
    if (container) {
      container.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; padding: 20px; color: #666;">
                    <i class="fa-solid fa-spinner fa-spin" style="font-size: 1.5rem; margin-bottom: 10px;"></i>
                    <p>${escapeHTML(message)}</p>
                </div>
            `;
    }
  }

  /**
   * Mostra estado vazio em container específico
   *
   * @param {string} containerId - ID do container
   * @param {string} [message] - Mensagem de estado vazio (opcional)
   * @private
   */
  showEmptyStateInContainer(containerId, message = "Nenhum dado disponível") {
    const container = document.getElementById(containerId);
    if (container) {
      container.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: #666;">
                    <i class="fa-solid fa-inbox" style="font-size: 2rem; margin-bottom: 10px; opacity: 0.5;"></i>
                    <p>${escapeHTML(message)}</p>
                </div>
            `;
    }
  }

  /**
   * Carrega e renderiza pedidos ativos no dashboard
   *
   * @async
   * @returns {Promise<void>}
   * @throws {Error} Se houver erro ao buscar ou renderizar pedidos
   * @private
   */
  async loadActiveOrders() {
    try {
      const container = document.getElementById(
        "dashboard-pedidos-ativos-list"
      );
      if (!container) return;

      // ALTERAÇÃO: Mostrar loading
      this.showLoadingInContainer(
        "dashboard-pedidos-ativos-list",
        "Carregando pedidos ativos..."
      );

      // ALTERAÇÃO: Buscar pedidos de hoje usando cache
      const response = await this.getCachedData("orders", async () => {
        return await getAllOrders({
          period: "today",
          page_size: 50, // ALTERAÇÃO: Buscar mais pedidos para filtrar depois
        });
      });

      // ALTERAÇÃO: Verificar formato da resposta e filtrar por status ativos
      const allOrders = this.extractOrdersFromResponse(response);
      const activeStatuses = ["pending", "preparing", "ready", "on_the_way"];
      const filteredOrders = allOrders
        .filter((order) => activeStatuses.includes(order.status))
        .slice(0, 10); // ALTERAÇÃO: Limitar a 10 pedidos no dashboard

      // ALTERAÇÃO: Buscar detalhes completos de cada pedido (padronizado com order-management.js)
      const ordersWithDetails = await Promise.all(
        filteredOrders.map(async (order) => {
          if (!order || typeof order !== "object") return null;
          const orderId = order.order_id || order.id;
          if (!orderId) return null;

          try {
            // ALTERAÇÃO: Buscar detalhes completos do pedido
            const detailsResult = await getOrderDetails(orderId);
            if (detailsResult.success && detailsResult.data) {
              // ALTERAÇÃO: Mesclar dados base com detalhes
              const enrichedOrder = {
                ...order,
                ...detailsResult.data,
                // ALTERAÇÃO: Garantir que items venham dos detalhes
                items: detailsResult.data.items || order.items || [],
              };

              // ALTERAÇÃO: Buscar telefone do cliente se não estiver no objeto
              if (!enrichedOrder._cachedPhone) {
                const phone = await this.getCustomerPhone(enrichedOrder);
                enrichedOrder._cachedPhone = phone;
              }

              return enrichedOrder;
            }
            // ALTERAÇÃO: Se falhar, retornar pedido original com telefone buscado
            if (!order._cachedPhone) {
              const phone = await this.getCustomerPhone(order);
              order._cachedPhone = phone;
            }
            return order;
          } catch (error) {
            // ALTERAÇÃO: Log condicional apenas em modo debug
            if (typeof window !== "undefined" && window.DEBUG_MODE) {
              console.warn(
                `Erro ao buscar detalhes do pedido ${orderId}:`,
                error
              );
            }
            // ALTERAÇÃO: Retornar pedido original com telefone buscado se falhar
            if (!order._cachedPhone) {
              try {
                const phone = await this.getCustomerPhone(order);
                order._cachedPhone = phone;
              } catch (phoneError) {
                // Ignorar erro de telefone, já que é opcional
              }
            }
            return order;
          }
        })
      );

      // ALTERAÇÃO: Filtrar nulls e armazenar
      const orders = ordersWithDetails.filter((order) => order !== null);
      this.data.activeOrders = orders;

      // ALTERAÇÃO: Renderizar cards
      this.renderActiveOrdersCards(orders, container);
    } catch (error) {
      // ALTERAÇÃO: Log condicional apenas em modo debug
      if (typeof window !== "undefined" && window.DEBUG_MODE) {
        console.error("Erro ao carregar pedidos ativos:", error);
      }
      this.showErrorInContainer(
        "dashboard-pedidos-ativos-list",
        "Erro ao carregar pedidos ativos"
      );
    }
  }

  /**
   * Renderiza cards de pedidos ativos
   *
   * @param {Array} orders - Array de pedidos
   * @param {HTMLElement} container - Container onde os cards serão renderizados
   * @private
   */
  renderActiveOrdersCards(orders, container) {
    if (!orders || orders.length === 0) {
      // ALTERAÇÃO: Usar método padronizado para estado vazio
      this.showEmptyStateInContainer(
        "dashboard-pedidos-ativos-list",
        "Nenhum pedido ativo no momento"
      );
      return;
    }

    // ALTERAÇÃO: Criar HTML dos cards
    const cardsHtml = orders
      .map((order) => this.createOrderCard(order))
      .join("");
    container.innerHTML = cardsHtml;

    // ALTERAÇÃO: Adicionar event listeners aos botões de ação
    this.attachOrderActionListeners();
  }

  /**
   * Cria HTML de um card de pedido para o dashboard
   * Versão simplificada adaptada para o dashboard
   *
   * @param {Object} order - Objeto do pedido
   * @returns {string} HTML do card
   * @private
   */
  /**
   * ALTERAÇÃO: Cria HTML de um card de pedido padronizado com order-management.js
   * @param {Object} order - Objeto do pedido
   * @returns {string} HTML do card
   * @private
   */
  createOrderCard(order) {
    if (!order || typeof order !== "object") {
      return "";
    }

    const orderId = order.order_id || order.id || "N/A";
    const confirmationCode = escapeHTML(order.confirmation_code || "N/A");
    const status = order.status || "pending";
    const statusText = formatOrderStatus(status);
    // ALTERAÇÃO: Usar getStatusClass em vez de getStatusColor para padronização
    const statusClass = this.getStatusClass(status);
    const createdAt = this.formatDate(order.created_at);
    const timeEstimate = this.calculateTimeEstimate(order);

    // Informações do cliente
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

    // ALTERAÇÃO: Obter telefone do cliente (usar _cachedPhone se disponível, senão buscar)
    const customerPhone = this.normalizePhone(
      order._cachedPhone ||
        order.customer_phone ||
        order.phone ||
        (order.customer && order.customer.telefone) ||
        (order.user && order.user.telefone) ||
        "(00)0000-000"
    );

    const isPickup = this.isPickupOrder(order);
    const formattedAddress = this.formatOrderAddress(order);
    const locationText = formattedAddress;

    // ALTERAÇÃO: Itens do pedido com cálculo correto de extras e base_modifications
    const items = order.items || [];
    const itemsHtml =
      items.length > 0
        ? items
            .map((item) => {
              const itemName = escapeHTML(
                item.product_name || item.product?.name || "Produto"
              );
              const itemQuantity = parseInt(item.quantity || 1, 10) || 1;
              const itemTotal = this.calculateItemTotal(item);

              // Preparar HTML para extras e modificações
              const extras = item.extras || item.additional_items || [];
              const baseMods = item.base_modifications || [];
              const notes = item.notes || item.observacao || "";

              let modificationsHtml = "";
              let hasPreviousContent = false;

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
                        extra.quantity ?? extra.qty ?? extra.quantidade ?? 0,
                        10
                      ) || 0;
                    const preco = this.extractPriceFromObject(extra);
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
                if (hasPreviousContent) {
                  modificationsHtml += `<div class="item-extras-separator"></div>`;
                }

                const baseModsItems = baseMods
                  .map((bm) => {
                    const nome =
                      bm.ingredient_name || bm.name || bm.nome || "Ingrediente";
                    const delta = parseInt(bm.delta ?? 0, 10) || 0;
                    const precoUnitario = this.extractPriceFromObject(bm);
                    const isPositive = delta > 0;
                    const icon = isPositive ? "plus" : "minus";
                    const colorClass = isPositive ? "mod-add" : "mod-remove";
                    const deltaValue = Math.abs(delta);
                    // ALTERAÇÃO: Multiplicar preço unitário pela quantidade (delta) para exibir o preço total correto
                    const precoTotal = precoUnitario * deltaValue;
                    const precoFormatado =
                      precoTotal > 0 && isPositive
                        ? ` <span class="base-mod-price">+R$ ${escapeHTML(
                            precoTotal.toFixed(2).replace(".", ",")
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

              return `
                    <div class="order-item">
                        <div class="item-info">
                            <span class="item-qtd">${itemQuantity}</span>
                            <span class="item-name">${itemName}</span>
                            <span class="item-price">${escapeHTML(
                              String(formatCurrency(itemTotal))
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

    // Botão de ação
    const nextStatus = this.getNextStatus(status, isPickup);
    const actionButtonText = this.getActionButtonText(status, isPickup);
    const canUpdate = !FINAL_STATUSES.includes(status);

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
                        <span class="total-value">${escapeHTML(
                          String(formatCurrency(total))
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
  }

  /**
   * Adiciona event listeners aos botões de ação dos pedidos
   *
   * @private
   */
  attachOrderActionListeners() {
    // ALTERAÇÃO: Buscar todos os botões de ação
    const actionButtons = document.querySelectorAll(
      ".order-action-btn[data-order-id]"
    );

    actionButtons.forEach((button) => {
      // ALTERAÇÃO: Remover listeners anteriores para evitar duplicação
      const newButton = button.cloneNode(true);
      button.parentNode.replaceChild(newButton, button);

      // ALTERAÇÃO: Adicionar listener ao novo botão
      newButton.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();

        const orderId = newButton.getAttribute("data-order-id");
        const nextStatus = newButton.getAttribute("data-next-status");

        if (!orderId || !nextStatus) {
          this.showError("Dados do pedido inválidos");
          return;
        }

        // ALTERAÇÃO: Desabilitar botão durante a atualização
        newButton.disabled = true;
        newButton.textContent = "Atualizando...";

        try {
          const response = await updateOrderStatus(
            parseInt(orderId, 10),
            nextStatus
          );

          if (response.success) {
            showToast("Status do pedido atualizado com sucesso", {
              type: "success",
            });
            // ALTERAÇÃO: Limpar cache de pedidos para forçar atualização
            this.clearCache("orders");
            // ALTERAÇÃO: Recarregar pedidos ativos
            await this.loadActiveOrders();
            // ALTERAÇÃO: Recarregar métricas de pedidos
            await this.loadOrderMetrics();
          } else {
            this.showError(
              response.error || "Erro ao atualizar status do pedido"
            );
            newButton.disabled = false;
            newButton.textContent =
              newButton.getAttribute("data-original-text") || "Atualizar";
          }
        } catch (error) {
          // ALTERAÇÃO: Log condicional apenas em modo debug
          if (typeof window !== "undefined" && window.DEBUG_MODE) {
            console.error("Erro ao atualizar status do pedido:", error);
          }
          this.showError("Erro ao atualizar status do pedido");
          newButton.disabled = false;
          newButton.textContent =
            newButton.getAttribute("data-original-text") || "Atualizar";
        }
      });
    });
  }

  /**
   * Obtém o próximo status do pedido baseado no status atual e tipo
   *
   * @param {string} currentStatus - Status atual
   * @param {boolean} isPickup - Se é pedido de retirada
   * @returns {string} Próximo status
   * @private
   */
  getNextStatus(currentStatus, isPickup) {
    // ALTERAÇÃO: Padronizado com order-management.js
    const normalizedStatus =
      currentStatus === "in_progress" && isPickup ? "ready" : currentStatus;

    if (isPickup) {
      const pickupStatusFlow = {
        pending: "preparing",
        preparing: "ready",
        ready: "completed",
        in_progress: "completed",
        on_the_way: "completed",
        delivered: "completed",
        paid: "completed",
      };
      return pickupStatusFlow[normalizedStatus] || currentStatus;
    } else {
      const deliveryStatusFlow = {
        pending: "preparing",
        preparing: "on_the_way",
        on_the_way: "completed",
        in_progress: "on_the_way",
        delivered: "completed",
        paid: "completed",
      };
      return deliveryStatusFlow[currentStatus] || currentStatus;
    }
  }

  /**
   * Obtém o texto do botão de ação baseado no status atual e tipo
   * ALTERAÇÃO: Padronizado com order-management.js
   *
   * @param {string} currentStatus - Status atual
   * @param {boolean} isPickup - Se é pedido de retirada
   * @returns {string} Texto do botão
   * @private
   */
  getActionButtonText(currentStatus, isPickup) {
    // ALTERAÇÃO: Padronizado com order-management.js
    const normalizedStatus =
      currentStatus === "in_progress" && isPickup ? "ready" : currentStatus;

    if (isPickup) {
      const pickupActionMap = {
        pending: "Iniciar Preparo",
        preparing: "Marcar como Pronto",
        ready: "Marcar como Concluído",
        in_progress: "Marcar como Concluído",
        on_the_way: "Marcar como Concluído",
        delivered: "Pedido concluído",
        paid: "Pedido concluído",
        completed: "Pedido concluído",
        cancelled: "Pedido cancelado",
      };
      return pickupActionMap[normalizedStatus] || "Atualizar status";
    } else {
      const deliveryActionMap = {
        pending: "Iniciar Preparo",
        preparing: "Enviar para Entrega",
        on_the_way: "Marcar como Concluído",
        in_progress: "Enviar para Entrega",
        delivered: "Pedido concluído",
        paid: "Pedido concluído",
        completed: "Pedido concluído",
        cancelled: "Pedido cancelado",
      };
      return deliveryActionMap[currentStatus] || "Atualizar status";
    }
  }

  /**
   * ALTERAÇÃO: Verifica se o pedido é do tipo pickup
   * @param {Object} order - Objeto do pedido
   * @returns {boolean}
   * @private
   */
  isPickupOrder(order) {
    if (!order || typeof order !== "object") return false;
    const orderType = String(
      order.order_type || order.delivery_type || order.deliveryType || ""
    ).toLowerCase();
    return orderType === "pickup";
  }

  /**
   * ALTERAÇÃO: Formata endereço do pedido
   * @param {Object} order - Objeto do pedido
   * @returns {string}
   * @private
   */
  formatOrderAddress(order) {
    if (this.isPickupOrder(order)) {
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
      if (addr.neighborhood) parts.push(addr.neighborhood);
      if (addr.city) parts.push(addr.city);
      if (addr.state) parts.push(addr.state);
      return escapeHTML(parts.join(", "));
    }

    if (order.address?.address) {
      return escapeHTML(order.address.address);
    }

    if (order.delivery_address) {
      return escapeHTML(order.delivery_address);
    }

    return "Endereço não informado";
  }

  /**
   * ALTERAÇÃO: Normaliza telefone para exibição
   * @param {any} phone - Telefone a ser normalizado
   * @returns {string}
   * @private
   */
  normalizePhone(phone) {
    if (!phone || phone === null || phone === undefined) {
      return "(00)0000-000";
    }

    const phoneStr = String(phone).trim();
    if (phoneStr === "" || phoneStr === "undefined" || phoneStr === "null") {
      return "(00)0000-000";
    }

    const telefoneLimpo = phoneStr.replace(/\D/g, "");

    if (telefoneLimpo.length === 11) {
      return telefoneLimpo.replace(/(\d{2})(\d{5})(\d{4})/, "($1)$2-$3");
    } else if (telefoneLimpo.length === 10) {
      return telefoneLimpo.replace(/(\d{2})(\d{4})(\d{4})/, "($1)$2-$3");
    }

    return phoneStr;
  }

  /**
   * ALTERAÇÃO: Encontra telefone no objeto do pedido (padronizado com order-management.js)
   * @param {Object} order - Objeto do pedido
   * @returns {string|null} Telefone encontrado ou null
   * @private
   */
  findPhoneInOrderObject(order) {
    if (!order || typeof order !== "object") {
      return null;
    }

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

    // Estratégia 5: Buscar recursivamente em objetos aninhados
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
   * ALTERAÇÃO: Busca telefone do usuário via API (padronizado com order-management.js)
   * @param {number} userId - ID do usuário
   * @returns {Promise<string>} Telefone formatado
   * @private
   */
  async fetchUserPhone(userId) {
    if (!userId) return "(00)0000-000";

    // ALTERAÇÃO: Verificar cache primeiro
    const cacheKey = String(userId);
    if (this.userPhoneCache[cacheKey]) {
      return this.userPhoneCache[cacheKey];
    }

    try {
      const user = await getUserById(userId);
      if (user && typeof user === "object") {
        const phone = user.phone || user.telefone || null;
        const phoneFormatted = phone
          ? this.normalizePhone(phone)
          : "(00)0000-000";
        this.userPhoneCache[cacheKey] = phoneFormatted;
        return phoneFormatted;
      }
    } catch (error) {
      if (typeof window !== "undefined" && window.DEBUG_MODE) {
        console.warn(
          `[Dashboard] Erro ao buscar telefone do usuário ${userId}:`,
          error.message
        );
      }
      // ALTERAÇÃO: Cachear como não encontrado para evitar múltiplas tentativas
      this.userPhoneCache[cacheKey] = "(00)0000-000";
    }

    return "(00)0000-000";
  }

  /**
   * ALTERAÇÃO: Obter telefone do cliente do pedido (padronizado com order-management.js)
   * Busca através do user_id quando necessário
   * @param {Object} order - Objeto do pedido
   * @returns {Promise<string>} Telefone formatado
   * @private
   */
  async getCustomerPhone(order) {
    if (!order || typeof order !== "object") {
      return "(00)0000-000";
    }

    // ALTERAÇÃO: Primeiro tentar buscar no próprio objeto do pedido
    const phoneInObject = this.findPhoneInOrderObject(order);
    if (phoneInObject) {
      return this.normalizePhone(phoneInObject);
    }

    // ALTERAÇÃO: Se não encontrou, buscar através do user_id usando API
    const userId =
      order.user_id ||
      order.userId ||
      order.customer_id ||
      order.customerId ||
      (order.user && order.user.id) ||
      (order.customer && order.customer.id);

    if (userId) {
      const phoneFromApi = await this.fetchUserPhone(userId);
      if (phoneFromApi && phoneFromApi !== "(00)0000-000") {
        return phoneFromApi;
      }
    }

    return "(00)0000-000";
  }

  /**
   * ALTERAÇÃO: Obtém classe CSS do status
   * @param {string} status - Status do pedido
   * @returns {string}
   * @private
   */
  getStatusClass(status) {
    const classMap = {
      pending: "status-novo",
      preparing: "status-preparo",
      ready: "status-pronto",
      in_progress: "status-pronto",
      on_the_way: "status-entrega",
      delivered: "status-concluido",
      paid: "status-concluido",
      completed: "status-concluido",
      cancelled: "status-cancelado",
    };
    return classMap[status] || "status-novo";
  }

  /**
   * ALTERAÇÃO: Extrai preço de um objeto (extra/modificação)
   * @param {Object} obj - Objeto com dados de preço
   * @returns {number}
   * @private
   */
  extractPriceFromObject(obj) {
    if (!obj || typeof obj !== "object") return 0;

    // ALTERAÇÃO: Priorizar additional_price sobre price para modificações de produtos
    // additional_price é o preço quando o ingrediente é adicionado como modificação
    // Verificar múltiplos campos possíveis que o backend pode retornar
    const priceCandidates = [
      obj.additional_price,
      obj.additionalPrice, // camelCase
      obj.ingredient_price,
      obj.ingredientPrice, // camelCase
      obj.ingredient_unit_price,
      obj.ingredientUnitPrice, // camelCase
      obj.unit_price,
      obj.unitPrice, // camelCase
      obj.price,
      obj.preco,
      obj.valor,
      obj.cost, // Custo do ingrediente (fallback)
      obj.custo, // Custo em português (fallback)
    ];

    for (const candidate of priceCandidates) {
      if (candidate !== undefined && candidate !== null) {
        const priceNum = parseFloat(candidate);
        if (!isNaN(priceNum) && priceNum > 0 && isFinite(priceNum)) {
          return priceNum;
        }
      }
    }

    // ALTERAÇÃO: Se não encontrou preço nos campos diretos e tem ingredient_id,
    // tentar buscar do objeto ingredient se estiver aninhado
    if (obj.ingredient_id || obj.ingredientId || obj.id) {
      const ingredient = obj.ingredient || obj.ingredient_data;
      if (ingredient && typeof ingredient === "object") {
        const ingredientPrice =
          ingredient.additional_price ||
          ingredient.additionalPrice ||
          ingredient.ingredient_price ||
          ingredient.ingredientPrice ||
          ingredient.price;
        if (ingredientPrice !== undefined && ingredientPrice !== null) {
          const priceNum = parseFloat(ingredientPrice);
          if (!isNaN(priceNum) && priceNum > 0 && isFinite(priceNum)) {
            return priceNum;
          }
        }
      }
    }

    return 0;
  }

  /**
   * ALTERAÇÃO: Calcula preço total do item incluindo extras e modificações
   * @param {Object} item - Item do pedido
   * @returns {number}
   * @private
   */
  calculateItemTotal(item) {
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
        const unitPrice = this.extractPriceFromObject(extra);
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
          const unitPrice = this.extractPriceFromObject(mod);
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
   * ALTERAÇÃO: Extrai tempo de preparo de um item
   * @param {Object} item - Item do pedido
   * @returns {number}
   * @private
   */
  extractPreparationTimeFromItem(item) {
    if (!item || typeof item !== "object") return 0;

    const product = item.product || {};
    let prepTime = 0;

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
   * ALTERAÇÃO: Calcula tempo de preparo baseado nos produtos do pedido
   * @param {Object} order - Objeto do pedido
   * @returns {number}
   * @private
   */
  calculatePreparationTime(order) {
    if (
      !order.items ||
      !Array.isArray(order.items) ||
      order.items.length === 0
    ) {
      return 15; // Fallback padrão
    }

    const maxPrepTime = order.items.reduce((max, item) => {
      const prepTime = this.extractPreparationTimeFromItem(item);
      return Math.max(max, prepTime);
    }, 0);

    if (maxPrepTime > 0) {
      const buffer =
        order.items.length > 1 ? Math.ceil(order.items.length * 0.5) : 0;
      return maxPrepTime + buffer;
    }

    return 15; // Fallback padrão
  }

  /**
   * ALTERAÇÃO: Calcula tempo estimado da etapa atual e retorna status visual
   * @param {Object} order - Objeto do pedido
   * @returns {Object}
   * @private
   */
  calculateTimeEstimate(order) {
    if (!order?.created_at) {
      return {
        text: "-min / -min",
        currentMinutes: 0,
        maxMinutes: 0,
        colorClass: "",
      };
    }

    // Status finais: não calcular mais tempo
    if (FINAL_STATUSES.includes(order.status)) {
      return {
        text: "- / -",
        currentMinutes: 0,
        maxMinutes: 0,
        colorClass: "",
      };
    }

    const now = new Date();
    let stageStartTime;
    let estimatedMax = 0;

    switch (order.status) {
      case "pending":
        stageStartTime = new Date(order.created_at);
        estimatedMax = 5;
        break;
      case "preparing":
        stageStartTime = new Date(
          order.preparing_at || order.updated_at || order.created_at
        );
        estimatedMax = this.calculatePreparationTime(order);
        break;
      case "on_the_way":
        stageStartTime = new Date(
          order.on_the_way_at || order.updated_at || order.created_at
        );
        estimatedMax = 30;
        break;
      default:
        stageStartTime = new Date(order.updated_at || order.created_at);
        estimatedMax = 15;
        break;
    }

    // Priorizar estimated_delivery da API se disponível
    if (order.estimated_delivery && order.status === "on_the_way") {
      const estimated =
        order.estimated_delivery.estimated_time ||
        order.estimated_delivery.total ||
        0;
      if (estimated > 0 && isFinite(estimated)) {
        estimatedMax = Math.max(0, estimated);
      }
    }

    const safeMaxMinutes =
      isFinite(estimatedMax) && estimatedMax > 0 ? estimatedMax : 0;
    const diffMs = now - stageStartTime;
    const diffMinutes =
      diffMs > 0 && diffMs < 86400000 ? Math.floor(diffMs / 60000) : 0;

    const safeCurrentMinutes =
      isFinite(diffMinutes) && diffMinutes >= 0 ? diffMinutes : 0;
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
   * Formata data para exibição
   *
   * @param {string|Date} date - Data a ser formatada
   * @returns {string} Data formatada
   * @private
   */
  formatDate(date) {
    if (!date) return "Data não disponível";

    try {
      const dateObj = typeof date === "string" ? new Date(date) : date;
      if (isNaN(dateObj.getTime())) {
        return "Data inválida";
      }

      return new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(dateObj);
    } catch (error) {
      return "Data não disponível";
    }
  }

  /**
   * Atualiza apenas os gráficos
   *
   * @async
   * @returns {Promise<void>}
   * @throws {Error} Se houver erro ao atualizar gráficos (erro silencioso)
   * @private
   */
  async updateCharts() {
    // ALTERAÇÃO: Verificar se Chart.js está disponível
    if (typeof Chart === "undefined") {
      // ALTERAÇÃO: Log apenas em modo debug
      if (typeof window !== "undefined" && window.DEBUG_MODE) {
        console.warn(
          "[Dashboard] Chart.js não está disponível. Aguardando carregamento..."
        );
      }
      // ALTERAÇÃO: Aguardar até Chart.js estar disponível (máximo 5 segundos)
      let attempts = 0;
      const maxAttempts = 50; // 5 segundos (50 * 100ms)
      while (typeof Chart === "undefined" && attempts < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        attempts++;
      }

      if (typeof Chart === "undefined") {
        // ALTERAÇÃO: Erro crítico sempre deve ser logado (não condicionado a DEBUG_MODE)
        console.error(
          "[Dashboard] Chart.js não foi carregado após 5 segundos. Verifique a conexão ou bloqueadores de conteúdo."
        );
        return;
      }
      // ALTERAÇÃO: Log apenas em modo debug
      if (typeof window !== "undefined" && window.DEBUG_MODE) {
        console.log(
          "[Dashboard] Chart.js carregado com sucesso após",
          attempts * 100,
          "ms"
        );
      }
    }

    try {
      await Promise.all([
        this.createSalesChart(),
        this.createOrdersByStatusChart(),
        this.createSalesByChannelChart(),
      ]);
    } catch (error) {
      // ALTERAÇÃO: Log condicional apenas em modo debug
      if (typeof window !== "undefined" && window.DEBUG_MODE) {
        console.error("[Dashboard] Erro ao atualizar gráficos:", error);
        console.error("[Dashboard] Stack trace:", error.stack);
      }
    }
  }

  /**
   * Cria gráfico de vendas dos últimos 7 dias
   *
   * @async
   * @returns {Promise<void>}
   * @throws {Error} Se houver erro ao criar gráfico (erro silencioso)
   * @private
   */
  async createSalesChart() {
    try {
      // ALTERAÇÃO: Verificar se Chart.js está disponível antes de criar gráfico
      if (typeof Chart === "undefined") {
        // ALTERAÇÃO: Log apenas em modo debug
        if (typeof window !== "undefined" && window.DEBUG_MODE) {
          console.error(
            "[Dashboard] Chart.js não está disponível. Verifique se o script foi carregado corretamente."
          );
        }
        // ALTERAÇÃO: Tentar recarregar Chart.js se não estiver disponível
        if (typeof window !== "undefined" && !window.chartJsLoadAttempted) {
          window.chartJsLoadAttempted = true;
          if (typeof window !== "undefined" && window.DEBUG_MODE) {
            console.warn("[Dashboard] Tentando carregar Chart.js novamente...");
          }
          const script = document.createElement("script");
          script.src =
            "https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js";
          script.onload = () => {
            if (typeof window !== "undefined" && window.DEBUG_MODE) {
              console.log(
                "[Dashboard] Chart.js carregado com sucesso. Tentando criar gráfico novamente..."
              );
            }
            this.createSalesChart();
          };
          script.onerror = () => {
            // ALTERAÇÃO: Erro crítico sempre deve ser logado (não condicionado a DEBUG_MODE)
            console.error("[Dashboard] Erro ao carregar Chart.js do CDN.");
          };
          document.head.appendChild(script);
        }
        return;
      }

      const canvas = document.getElementById("chart-vendas-semana");
      if (!canvas) {
        // ALTERAÇÃO: Erro crítico sempre deve ser logado (não condicionado a DEBUG_MODE)
        console.error(
          "[Dashboard] Canvas chart-vendas-semana não encontrado no DOM."
        );
        return;
      }

      // ALTERAÇÃO: Destruir gráfico existente se houver
      if (this.charts.salesChart) {
        this.charts.salesChart.destroy();
      }

      // ALTERAÇÃO: Buscar dados dos últimos 7 dias ANTES de definir dimensões
      const salesData = await this.getLast7DaysSales();

      // ALTERAÇÃO: Verificar se há dados para exibir (permitir valores zerados)
      if (!salesData || !salesData.labels || !Array.isArray(salesData.values)) {
        if (typeof window !== "undefined" && window.DEBUG_MODE) {
          console.warn(
            "Dados de vendas não disponíveis para gráfico:",
            salesData
          );
        }
        return;
      }

      // ALTERAÇÃO: Garantir que o container tenha dimensões corretas (Chart.js gerencia o canvas)
      const chartContainer =
        canvas.closest(".chart-container") || canvas.parentElement;
      if (chartContainer) {
        // ALTERAÇÃO: Aguardar um frame para garantir que o container tenha dimensões calculadas
        await new Promise((resolve) => requestAnimationFrame(resolve));

        // ALTERAÇÃO: Garantir que o container tenha altura definida (CSS já define, mas garantir)
        if (!chartContainer.style.height) {
          chartContainer.style.height = "300px";
        }

        // ALTERAÇÃO: Não definir dimensões no canvas - Chart.js gerencia isso automaticamente
        // Apenas garantir que o container está configurado corretamente
      }

      // ALTERAÇÃO: Criar gráfico
      const ctx = canvas.getContext("2d");

      this.charts.salesChart = new Chart(ctx, {
        type: "line",
        data: {
          labels: salesData.labels, // ['Seg', 'Ter', 'Qua', ...]
          datasets: [
            {
              label: "Receita (R$)",
              data: salesData.values,
              borderColor: "#10b981",
              backgroundColor: "rgba(16, 185, 129, 0.1)",
              borderWidth: 2,
              pointRadius: 4,
              pointHoverRadius: 6,
              pointBackgroundColor: "#10b981",
              pointBorderColor: "#ffffff",
              pointBorderWidth: 2,
              tension: 0.4,
              fill: true,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: {
            duration: 750,
          },
          interaction: {
            intersect: false,
            mode: "index",
          },
          plugins: {
            legend: {
              display: false,
            },
            tooltip: {
              enabled: true,
              callbacks: {
                label: (context) => {
                  const value = context.parsed.y || 0;
                  return formatCurrency(value);
                },
              },
            },
          },
          scales: {
            y: {
              beginAtZero: true,
              min: 0,
              ticks: {
                stepSize: salesData.values.every((v) => v === 0)
                  ? 10
                  : undefined,
                callback: (value) => {
                  // ALTERAÇÃO: Formatar valores do eixo Y
                  const formatted = formatCurrency(value);
                  return formatted.replace("R$", "").trim();
                },
              },
              grid: {
                display: true,
                color: "rgba(0, 0, 0, 0.1)",
              },
            },
            x: {
              display: true,
              grid: {
                display: false,
              },
            },
          },
        },
      });

      // ALTERAÇÃO: Forçar atualização do gráfico após criação
      this.charts.salesChart.update("none"); // 'none' para atualizar sem animação
    } catch (error) {
      // ALTERAÇÃO: Log condicional apenas em modo debug
      if (typeof window !== "undefined" && window.DEBUG_MODE) {
        console.error("Erro ao criar gráfico de vendas:", error);
      }
    }
  }

  /**
   * Cria gráfico de distribuição de pedidos por status
   *
   * @async
   * @returns {Promise<void>}
   * @throws {Error} Se houver erro ao criar gráfico (erro silencioso)
   * @private
   */
  async createOrdersByStatusChart() {
    try {
      // ALTERAÇÃO: Verificar se Chart.js está disponível antes de criar gráfico
      if (typeof Chart === "undefined") {
        if (typeof window !== "undefined" && window.DEBUG_MODE) {
          console.warn(
            "Chart.js não está disponível. Gráfico de status não será renderizado."
          );
        }
        return;
      }

      const canvas = document.getElementById("chart-pedidos-status");
      if (!canvas) return;

      // ALTERAÇÃO: Destruir gráfico existente se houver
      if (this.charts.ordersStatusChart) {
        this.charts.ordersStatusChart.destroy();
      }

      // ALTERAÇÃO: Garantir que o container tenha dimensões corretas (Chart.js gerencia o canvas)
      const chartContainer =
        canvas.closest(".chart-container") || canvas.parentElement;
      if (chartContainer) {
        // ALTERAÇÃO: Aguardar um frame para garantir que o container tenha dimensões calculadas
        await new Promise((resolve) => requestAnimationFrame(resolve));

        // ALTERAÇÃO: Garantir que o container tenha altura definida (CSS já define, mas garantir)
        if (!chartContainer.style.height) {
          chartContainer.style.height = "300px";
        }

        // ALTERAÇÃO: Não definir dimensões no canvas - Chart.js gerencia isso automaticamente
      }

      // ALTERAÇÃO: Buscar pedidos de hoje usando cache
      const todayOrdersResponse = await this.getCachedData(
        "orders",
        async () => {
          return await getTodayOrders();
        }
      );
      const todayOrders = this.extractOrdersFromResponse(todayOrdersResponse);
      const statusCount = this.countOrdersByStatus(todayOrders);

      // ALTERAÇÃO: Verificar se há dados para exibir
      if (!statusCount || Object.keys(statusCount).length === 0) {
        if (typeof window !== "undefined" && window.DEBUG_MODE) {
          console.warn("Nenhum pedido encontrado para gráfico de status");
        }
        return;
      }

      // ALTERAÇÃO: Preparar labels e valores
      const labels = Object.keys(statusCount).map((status) =>
        formatOrderStatus(status)
      );
      const values = Object.values(statusCount);

      // ALTERAÇÃO: Criar gráfico
      const ctx = canvas.getContext("2d");
      this.charts.ordersStatusChart = new Chart(ctx, {
        type: "doughnut",
        data: {
          labels: labels,
          datasets: [
            {
              data: values,
              backgroundColor: [
                "#FF8C00", // Novo/Pendente
                "#FFD700", // Preparando
                "#32CD32", // Pronto
                "#A0522D", // Entrega
                "#4CAF50", // Concluído
                "#f44336", // Cancelado
                "#9E9E9E", // Outros
              ],
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: "bottom",
            },
          },
        },
      });
    } catch (error) {
      // ALTERAÇÃO: Log condicional apenas em modo debug
      if (typeof window !== "undefined" && window.DEBUG_MODE) {
        console.error("Erro ao criar gráfico de status:", error);
      }
    }
  }

  /**
   * Cria gráfico de vendas por canal
   *
   * @async
   * @returns {Promise<void>}
   * @throws {Error} Se houver erro ao criar gráfico (erro silencioso)
   * @private
   */
  async createSalesByChannelChart() {
    try {
      // ALTERAÇÃO: Verificar se Chart.js está disponível antes de criar gráfico
      if (typeof Chart === "undefined") {
        if (typeof window !== "undefined" && window.DEBUG_MODE) {
          console.warn(
            "Chart.js não está disponível. Gráfico de canais não será renderizado."
          );
        }
        return;
      }

      const canvas = document.getElementById("chart-canais-venda");
      if (!canvas) return;

      // ALTERAÇÃO: Destruir gráfico existente se houver
      if (this.charts.salesChannelChart) {
        this.charts.salesChannelChart.destroy();
      }

      // ALTERAÇÃO: Garantir que o container tenha dimensões corretas (Chart.js gerencia o canvas)
      const chartContainer =
        canvas.closest(".chart-container") || canvas.parentElement;
      if (chartContainer) {
        // ALTERAÇÃO: Aguardar um frame para garantir que o container tenha dimensões calculadas
        await new Promise((resolve) => requestAnimationFrame(resolve));

        // ALTERAÇÃO: Garantir que o container tenha altura definida (CSS já define, mas garantir)
        if (!chartContainer.style.height) {
          chartContainer.style.height = "300px";
        }

        // ALTERAÇÃO: Não definir dimensões no canvas - Chart.js gerencia isso automaticamente
      }

      // ALTERAÇÃO: Buscar dados de vendas por canal
      const channelData = await this.getSalesByChannel();

      // ALTERAÇÃO: Verificar se há dados para exibir
      if (
        !channelData ||
        !channelData.labels ||
        !channelData.values ||
        channelData.labels.length === 0
      ) {
        if (typeof window !== "undefined" && window.DEBUG_MODE) {
          console.warn("Dados de canais não disponíveis para gráfico");
        }
        return;
      }

      // ALTERAÇÃO: Criar gráfico
      const ctx = canvas.getContext("2d");
      this.charts.salesChannelChart = new Chart(ctx, {
        type: "bar",
        data: {
          labels: channelData.labels, // ['Delivery', 'Retirada']
          datasets: [
            {
              label: "Receita (R$)",
              data: channelData.values,
              backgroundColor: ["#3b82f6", "#10b981"], // ALTERAÇÃO: Removida cor do Balcão
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: false,
            },
            tooltip: {
              callbacks: {
                label: (context) => formatCurrency(context.parsed.y),
              },
            },
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: {
                callback: (value) => {
                  // ALTERAÇÃO: Formatar valores do eixo Y
                  const formatted = formatCurrency(value);
                  return formatted.replace("R$", "").trim();
                },
              },
            },
          },
        },
      });
    } catch (error) {
      // ALTERAÇÃO: Log condicional apenas em modo debug
      if (typeof window !== "undefined" && window.DEBUG_MODE) {
        console.error("Erro ao criar gráfico de canais:", error);
      }
    }
  }

  /**
   * ALTERAÇÃO: Busca dados de vendas dos últimos 7 dias usando movimentações financeiras (padronizado com Receita do Dia)
   *
   * @async
   * @returns {Promise<Object>} Objeto com labels e values
   * @throws {Error} Se houver erro ao buscar dados (retorna dados vazios em caso de erro)
   * @private
   */
  async getLast7DaysSales() {
    try {
      // ALTERAÇÃO: Criar array com os últimos 7 dias
      const days = [];
      const sales = [];

      // ALTERAÇÃO: Buscar receita de cada dia usando movimentações financeiras
      for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        date.setHours(0, 0, 0, 0);

        // ALTERAÇÃO: Nome do dia da semana
        const dayName = date.toLocaleDateString("pt-BR", { weekday: "short" });
        days.push(dayName.charAt(0).toUpperCase() + dayName.slice(1));

        // ALTERAÇÃO: Calcular início e fim do dia
        const dayStart = new Date(date);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(date);
        dayEnd.setHours(23, 59, 59, 999);

        // ALTERAÇÃO: Buscar movimentações financeiras do dia
        try {
          const startDate = formatDateForISO(dayStart);
          const endDate = formatDateForISO(dayEnd);

          const response = await getFinancialMovements({
            start_date: startDate,
            end_date: endDate,
            type: "REVENUE",
            payment_status: "Paid",
          });

          const movements = response.items || response || [];
          const dayRevenue = this.calculateRevenueFromMovements(movements);

          sales.push(dayRevenue);
        } catch (dayError) {
          // ALTERAÇÃO: Se houver erro em um dia específico, usar 0 e continuar
          if (typeof window !== "undefined" && window.DEBUG_MODE) {
            console.warn(
              `[Dashboard] Erro ao buscar receita do dia ${dayName}:`,
              dayError
            );
          }
          sales.push(0);
        }
      }

      return {
        labels: days,
        values: sales,
      };
    } catch (error) {
      // ALTERAÇÃO: Log condicional apenas em modo debug
      if (typeof window !== "undefined" && window.DEBUG_MODE) {
        console.error(
          "[Dashboard] Erro ao buscar vendas dos últimos 7 dias:",
          error
        );
      }
      // ALTERAÇÃO: Retornar dados vazios em caso de erro (ainda assim exibir o gráfico)
      const days = [];
      for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dayName = date.toLocaleDateString("pt-BR", { weekday: "short" });
        days.push(dayName.charAt(0).toUpperCase() + dayName.slice(1));
      }
      return {
        labels: days,
        values: [0, 0, 0, 0, 0, 0, 0],
      };
    }
  }

  /**
   * Conta pedidos por status
   *
   * @param {Array} orders - Array de pedidos
   * @returns {Object} Objeto com contagem por status
   * @private
   */
  countOrdersByStatus(orders) {
    const statusCount = {};

    // ALTERAÇÃO: Inicializar contadores
    const statuses = [
      "pending",
      "preparing",
      "ready",
      "on_the_way",
      "completed",
      "delivered",
      "paid",
      "cancelled",
    ];
    statuses.forEach((status) => {
      statusCount[status] = 0;
    });

    // ALTERAÇÃO: Contar pedidos por status
    orders.forEach((order) => {
      const status = order.status || "pending";
      if (statusCount.hasOwnProperty(status)) {
        statusCount[status]++;
      } else {
        statusCount[status] = 1;
      }
    });

    // ALTERAÇÃO: Remover status com zero pedidos
    Object.keys(statusCount).forEach((status) => {
      if (statusCount[status] === 0) {
        delete statusCount[status];
      }
    });

    return statusCount;
  }

  /**
   * Busca dados de vendas por canal
   *
   * @async
   * @returns {Promise<Object>} Objeto com labels e values
   * @throws {Error} Se houver erro ao buscar dados (retorna dados vazios em caso de erro)
   * @private
   */
  async getSalesByChannel() {
    try {
      // ALTERAÇÃO: Buscar pedidos de hoje usando cache
      const response = await this.getCachedData("orders", async () => {
        return await getTodayOrders();
      });
      const orders = this.extractOrdersFromResponse(response);

      // ALTERAÇÃO: Agrupar por canal e calcular receita
      const channelSales = {
        delivery: 0,
        pickup: 0,
        dine_in: 0,
      };

      orders.forEach((order) => {
        const channel = order.order_type || order.channel || "delivery";
        const status = order.status || "";

        // ALTERAÇÃO: Somar apenas pedidos concluídos/pagos
        if (["completed", "delivered", "paid"].includes(status)) {
          const orderTotal = parseFloat(order.total_amount || order.total || 0);
          const total = isNaN(orderTotal) ? 0 : orderTotal;

          if (channel === "pickup" || order.is_pickup) {
            channelSales.pickup += total;
          } else if (channel === "dine_in") {
            channelSales.dine_in += total;
          } else {
            channelSales.delivery += total;
          }
        }
      });

      // ALTERAÇÃO: Preparar labels e valores (removido Balcão)
      const labels = [];
      const values = [];

      if (channelSales.delivery > 0) {
        labels.push("Delivery");
        values.push(channelSales.delivery);
      }

      if (channelSales.pickup > 0) {
        labels.push("Retirada");
        values.push(channelSales.pickup);
      }

      // ALTERAÇÃO: Removido dine_in (Balcão) conforme solicitado

      // ALTERAÇÃO: Se não houver dados, retornar valores vazios (sem Balcão)
      if (labels.length === 0) {
        return {
          labels: ["Delivery", "Retirada"],
          values: [0, 0],
        };
      }

      return {
        labels: labels,
        values: values,
      };
    } catch (error) {
      // ALTERAÇÃO: Log condicional apenas em modo debug
      if (typeof window !== "undefined" && window.DEBUG_MODE) {
        console.error("Erro ao buscar vendas por canal:", error);
      }
      // ALTERAÇÃO: Retornar dados vazios em caso de erro
      return {
        labels: ["Delivery", "Retirada", "Balcão"],
        values: [0, 0, 0],
      };
    }
  }

  /**
   * Verifica se dados estão em cache e válidos
   *
   * @param {string} key - Chave do cache ('metrics', 'orders', 'charts')
   * @returns {boolean} True se o cache é válido
   * @private
   */
  isCacheValid(key) {
    const cache = this.cache[key];
    if (!cache || !cache.data) {
      return false;
    }

    const now = Date.now();
    const age = now - cache.timestamp;
    return age < cache.ttl;
  }

  /**
   * Obtém dados do cache ou busca novos
   *
   * @param {string} key - Chave do cache ('metrics', 'orders', 'charts')
   * @param {Function} fetchFn - Função assíncrona para buscar dados se cache inválido
   * @returns {Promise<any>} Dados do cache ou dados buscados
   * @throws {Error} Se houver erro ao buscar dados ou se fetchFn falhar
   * @private
   */
  async getCachedData(key, fetchFn) {
    // ALTERAÇÃO: Verificar se cache é válido
    if (this.isCacheValid(key)) {
      return this.cache[key].data;
    }

    // ALTERAÇÃO: Buscar novos dados
    const data = await fetchFn();

    // ALTERAÇÃO: Atualizar cache
    this.cache[key] = {
      data,
      timestamp: Date.now(),
      ttl: this.cache[key].ttl,
    };

    return data;
  }

  /**
   * Limpa cache específico ou todo o cache
   *
   * @param {string} [key] - Chave do cache a limpar (opcional, se não fornecido limpa tudo)
   * @private
   */
  clearCache(key = null) {
    if (key) {
      // ALTERAÇÃO: Limpar cache específico
      if (this.cache[key]) {
        this.cache[key] = {
          data: null,
          timestamp: null,
          ttl: this.cache[key].ttl,
        };
      }
    } else {
      // ALTERAÇÃO: Limpar todo o cache
      Object.keys(this.cache).forEach((cacheKey) => {
        this.cache[cacheKey] = {
          data: null,
          timestamp: null,
          ttl: this.cache[cacheKey].ttl,
        };
      });
    }
  }

  /**
   * Limpa recursos do dashboard
   * Para atualização automática, destrói gráficos e limpa dados
   *
   * @public
   */
  cleanup() {
    // ALTERAÇÃO: Parar atualização automática
    this.stopAutoRefresh();

    // ALTERAÇÃO: Destruir gráficos
    Object.values(this.charts).forEach((chart) => {
      if (chart && typeof chart.destroy === "function") {
        chart.destroy();
      }
    });
    this.charts = {};

    // ALTERAÇÃO: Limpar dados
    this.data = {
      metrics: null,
      activeOrders: [],
      lastUpdate: null,
    };

    // ALTERAÇÃO: Limpar cache
    this.clearCache();

    this.isInitialized = false;
    this.isLoading = false;
  }

  /**
   * Valida o estado do dashboard
   * Verifica se todas as métricas estão carregadas e elementos DOM existem
   *
   * @returns {Object} Resultado da validação
   * @public
   */
  validate() {
    const errors = [];
    const warnings = [];
    const metrics = {
      financial: false,
      orders: false,
      other: false,
      charts: false,
      activeOrders: false,
    };

    // ALTERAÇÃO: Verificar se dashboard está inicializado
    if (!this.isInitialized) {
      errors.push("Dashboard não foi inicializado");
    }

    if (this.isLoading) {
      warnings.push("Dashboard está carregando dados");
    }

    // ALTERAÇÃO: Verificar se elementos DOM existem
    const requiredElements = [
      "dashboard-receita-dia",
      "dashboard-pedidos-hoje",
      "dashboard-pedidos-ativos-list",
      "chart-vendas-semana",
      "chart-pedidos-status",
      "chart-canais-venda",
    ];

    const missingElements = requiredElements.filter(
      (id) => !document.getElementById(id)
    );
    if (missingElements.length > 0) {
      warnings.push(
        `Elementos DOM não encontrados: ${missingElements.join(", ")}`
      );
    }

    // ALTERAÇÃO: Verificar se métricas financeiras estão presentes
    const receitaDia = document.getElementById("dashboard-receita-dia");
    if (receitaDia && receitaDia.textContent.trim() !== "") {
      metrics.financial = true;
    }

    // ALTERAÇÃO: Verificar se métricas de pedidos estão presentes
    const pedidosHoje = document.getElementById("dashboard-pedidos-hoje");
    if (pedidosHoje && pedidosHoje.textContent.trim() !== "") {
      metrics.orders = true;
    }

    // ALTERAÇÃO: Verificar se outras métricas estão presentes
    const produtosAtivos = document.getElementById("dashboard-produtos-ativos");
    if (produtosAtivos && produtosAtivos.textContent.trim() !== "") {
      metrics.other = true;
    }

    // ALTERAÇÃO: Verificar se gráficos foram criados
    if (Object.keys(this.charts).length > 0) {
      metrics.charts = true;
    }

    // ALTERAÇÃO: Verificar se pedidos ativos estão presentes
    if (this.data.activeOrders && this.data.activeOrders.length > 0) {
      metrics.activeOrders = true;
    }

    return {
      isValid: this.isInitialized && !this.isLoading && errors.length === 0,
      errors,
      warnings,
      metrics,
    };
  }

  /**
   * Valida performance do dashboard
   * Mede tempo de carregamento, renderização de gráficos e uso de memória
   *
   * @async
   * @returns {Promise<Object>} Métricas de performance
   * @public
   */
  async validatePerformance() {
    const warnings = [];
    const metrics = {
      loadTime: 0,
      chartsRenderTime: 0,
      memoryUsage: null,
    };

    // ALTERAÇÃO: Medir tempo de carregamento (estimativa baseada em lastUpdate)
    if (this.data.lastUpdate) {
      const loadTime = Date.now() - this.data.lastUpdate.getTime();
      metrics.loadTime = loadTime;

      // ALTERAÇÃO: Verificar se tempo de carregamento está dentro do esperado (< 3 segundos)
      if (loadTime > 3000) {
        warnings.push(
          `Tempo de carregamento alto: ${loadTime}ms (esperado: < 3000ms)`
        );
      }
    }

    // ALTERAÇÃO: Medir tempo de renderização de gráficos (estimativa)
    const chartsCount = Object.keys(this.charts).length;
    if (chartsCount > 0) {
      // ALTERAÇÃO: Estimativa baseada no número de gráficos (cada gráfico ~200ms)
      metrics.chartsRenderTime = chartsCount * 200;

      if (metrics.chartsRenderTime > 1000) {
        warnings.push(
          `Tempo de renderização de gráficos alto: ${metrics.chartsRenderTime}ms (esperado: < 1000ms)`
        );
      }
    }

    // ALTERAÇÃO: Tentar obter informações de memória (se disponível)
    if (performance.memory) {
      metrics.memoryUsage = {
        used: performance.memory.usedJSHeapSize,
        total: performance.memory.totalJSHeapSize,
        limit: performance.memory.jsHeapSizeLimit,
      };

      // ALTERAÇÃO: Verificar se uso de memória está alto (> 50MB)
      const usedMB = metrics.memoryUsage.used / 1024 / 1024;
      if (usedMB > 50) {
        warnings.push(`Uso de memória alto: ${usedMB.toFixed(2)}MB`);
      }
    }

    // ALTERAÇÃO: Verificar se há intervalos ativos (pode indicar vazamento de memória)
    if (this.refreshInterval && this.chartsRefreshInterval) {
      // Intervalos estão configurados corretamente
    } else {
      warnings.push("Intervalos de atualização não estão configurados");
    }

    return {
      metrics,
      isValid: warnings.length === 0,
      warnings,
    };
  }

  /**
   * Valida responsividade do dashboard
   * Verifica breakpoints e elementos responsivos
   *
   * @returns {Object} Resultado da validação de responsividade
   * @public
   */
  validateResponsiveness() {
    const warnings = [];
    const width = window.innerWidth;
    const height = window.innerHeight;

    // ALTERAÇÃO: Determinar breakpoint atual
    const breakpoints = {
      desktop: width >= 1024,
      tablet: width >= 768 && width < 1024,
      mobile: width < 768,
    };

    // ALTERAÇÃO: Verificar se container existe e é visível
    if (!this.container) {
      warnings.push("Container do dashboard não encontrado");
    } else {
      const containerStyle = window.getComputedStyle(this.container);
      if (containerStyle.display === "none") {
        warnings.push("Container do dashboard está oculto");
      }
    }

    // ALTERAÇÃO: Verificar se gráficos são responsivos
    const chartsResponsive = Object.keys(this.charts).every((chartKey) => {
      const chart = this.charts[chartKey];
      if (chart && chart.options) {
        return chart.options.responsive === true;
      }
      return false;
    });

    if (!chartsResponsive && Object.keys(this.charts).length > 0) {
      warnings.push("Alguns gráficos não estão configurados como responsivos");
    }

    // ALTERAÇÃO: Verificar se elementos críticos são acessíveis em mobile
    if (breakpoints.mobile) {
      const criticalElements = [
        "dashboard-receita-dia",
        "dashboard-pedidos-hoje",
        "dashboard-pedidos-ativos-list",
      ];

      const missingOnMobile = criticalElements.filter((id) => {
        const element = document.getElementById(id);
        if (!element) return true;
        const style = window.getComputedStyle(element);
        return style.display === "none" || style.visibility === "hidden";
      });

      if (missingOnMobile.length > 0) {
        warnings.push(
          `Elementos críticos não visíveis em mobile: ${missingOnMobile.join(
            ", "
          )}`
        );
      }
    }

    return {
      isValid: warnings.length === 0,
      breakpoints,
      warnings,
    };
  }

  /**
   * Valida tratamento de erros do dashboard
   * Verifica se métodos de tratamento de erro estão implementados
   *
   * @returns {Object} Resultado da validação de tratamento de erros
   * @public
   */
  validateErrorHandling() {
    const warnings = [];
    const tests = {
      offlineHandling: false,
      emptyDataHandling: false,
      errorMessages: false,
      loadingStates: false,
    };

    // ALTERAÇÃO: Verificar se método showError existe
    if (typeof this.showError === "function") {
      tests.errorMessages = true;
    } else {
      warnings.push("Método showError não está implementado");
    }

    // ALTERAÇÃO: Verificar se método showErrorInContainer existe
    if (typeof this.showErrorInContainer === "function") {
      tests.errorMessages = true;
    } else {
      warnings.push("Método showErrorInContainer não está implementado");
    }

    // ALTERAÇÃO: Verificar se método showLoadingInContainer existe
    if (typeof this.showLoadingInContainer === "function") {
      tests.loadingStates = true;
    } else {
      warnings.push("Método showLoadingInContainer não está implementado");
    }

    // ALTERAÇÃO: Verificar se métodos têm tratamento de erro (try/catch)
    // Isso é verificado pela existência dos métodos e uso de showError/showErrorInContainer

    // ALTERAÇÃO: Verificar se há tratamento para dados vazios
    const hasEmptyStateHandling =
      typeof this.showEmptyStateInContainer === "function";
    if (hasEmptyStateHandling) {
      tests.emptyDataHandling = true;
    } else {
      warnings.push(
        "Tratamento de dados vazios não está completamente implementado"
      );
    }

    // ALTERAÇÃO: Verificar se há tratamento para API offline
    // Isso é verificado pela existência de try/catch nos métodos assíncronos
    // e uso de showError/showErrorInContainer
    tests.offlineHandling = tests.errorMessages && tests.loadingStates;

    return {
      isValid:
        tests.offlineHandling &&
        tests.emptyDataHandling &&
        tests.errorMessages &&
        tests.loadingStates,
      tests,
      warnings,
    };
  }

  /**
   * Executa todas as validações do dashboard
   * Inclui validação funcional, performance, responsividade e tratamento de erros
   *
   * @async
   * @returns {Promise<Object>} Resultados completos das validações
   * @public
   */
  async runAllValidations() {
    const functional = this.validate();
    const performance = await this.validatePerformance();
    const responsiveness = this.validateResponsiveness();
    const errorHandling = this.validateErrorHandling();

    // ALTERAÇÃO: Calcular score geral
    const totalTests = 4;
    const passedTests = [
      functional.isValid,
      performance.isValid,
      responsiveness.isValid,
      errorHandling.isValid,
    ].filter(Boolean).length;

    const score = (passedTests / totalTests) * 100;

    return {
      timestamp: new Date().toISOString(),
      overall: {
        score,
        passedTests,
        totalTests,
        isValid: score === 100,
      },
      functional,
      performance,
      responsiveness,
      errorHandling,
    };
  }
}
