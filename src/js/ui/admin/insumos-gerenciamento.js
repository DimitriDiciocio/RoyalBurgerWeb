/**
 * Módulo de Gerenciamento de Insumos
 * Responsável por todas as operações relacionadas a ingredientes/insumos
 */

import {
  createIngredient,
  updateIngredient,
  deleteIngredient,
  getIngredients,
  getIngredientById,
  updateIngredientAvailability,
  adjustIngredientStock,
  getStockSummary,
} from "../../api/ingredients.js";

import { showToast, showConfirm, toastFromApiError } from "../alerts.js";

import { debounce } from "../../utils/performance-utils.js";
import { escapeHTML } from "../../utils/html-sanitizer.js";
import { getStockDashboardMetrics } from "../../api/dashboard.js";

/**
 * Gerenciador de dados de insumos
 */
class InsumoDataManager {
  constructor() {
    this.cache = {
      data: null,
      lastFetch: null,
    };
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutos
  }

  /**
   * Verifica se o cache ainda é válido
   */
  isCacheValid() {
    return (
      this.cache.lastFetch &&
      Date.now() - this.cache.lastFetch < this.cacheTimeout
    );
  }

  /**
   * Limpa o cache
   */
  clearCache() {
    this.cache.data = null;
    this.cache.lastFetch = null;
  }

  /**
   * Busca todos os insumos
   */
  async getAllInsumos(options = {}) {
    try {
      // Com paginação, busca, filtros de categoria ou status, não usar cache (sempre buscar dados atualizados)
      // Cache só seria útil se não houvesse paginação/busca/filtros
      const hasPaginationOrFilters = options.page || options.name || options.status || options.category;
      
      if (!hasPaginationOrFilters && this.isCacheValid() && !options.forceRefresh) {
        return this.cache.data;
      }

      const response = await getIngredients(options);
      
      // Só atualizar cache se não houver paginação/busca/filtros
      if (!hasPaginationOrFilters) {
        this.cache.data = response;
        this.cache.lastFetch = Date.now();
      }

      return response;
    } catch (error) {
      // ALTERAÇÃO: Log condicional apenas em modo debug
      if (typeof window !== 'undefined' && window.DEBUG_MODE) {
        console.error("Erro ao buscar insumos:", error);
      }
      throw error;
    }
  }

  /**
   * Busca insumo por ID
   */
  async getInsumoById(id) {
    try {
      const insumo = await getIngredientById(id);

      return {
        id: insumo.id,
        nome: insumo.name,
        categoria: insumo.category || "outros",
        custo: parseFloat(insumo.price) || 0,
        preco_adicional: parseFloat(insumo.additional_price) || 0,
        unidade: insumo.stock_unit || "un",
        // CORREÇÃO: Usar parseFloat para preservar decimais do estoque (ex: 17.000 kg)
        min: parseFloat(insumo.min_stock_threshold) || 0,
        max: parseFloat(insumo.max_stock) || 100,
        atual: parseFloat(insumo.current_stock) || 0,
        ativo: insumo.is_available !== undefined ? insumo.is_available : true,
        fornecedor: insumo.supplier || "Não informado",
        quantidade_porcao: parseFloat(insumo.base_portion_quantity) || 1,
        unidade_porcao: insumo.base_portion_unit || "un",
        ultimaAtualizacao: null,
      };
    } catch (error) {
      // ALTERAÇÃO: Log condicional apenas em modo debug
      if (typeof window !== 'undefined' && window.DEBUG_MODE) {
        console.error("Erro ao buscar insumo:", error);
      }
      throw error;
    }
  }

  /**
   * Adiciona novo insumo
   */
  async addInsumo(insumoData) {
    try {
      const apiData = {
        name: insumoData.nome,
        price: parseFloat(insumoData.custo) || 0,
        additional_price: parseFloat(insumoData.preco_adicional) || 0,
        current_stock: parseFloat(insumoData.atual) || 0,
        stock_unit: insumoData.unidade || "un",
        min_stock_threshold: parseFloat(insumoData.min) || 0,
        max_stock: parseFloat(insumoData.max) || 100,
        supplier: insumoData.fornecedor || "",
        category: insumoData.categoria || "outros",
        base_portion_quantity: parseFloat(insumoData.quantidade_porcao) || 1,
        base_portion_unit: insumoData.unidade_porcao || "un",
      };

      const result = await createIngredient(apiData);

      // Validar se a resposta contém dados válidos
      if (!result || !result.id) {
        // ALTERAÇÃO: Log condicional apenas em modo debug
        if (typeof window !== 'undefined' && window.DEBUG_MODE) {
          console.error("Resposta inválida da API ao criar insumo:", result);
        }
        throw new Error("Resposta inválida da API ao criar insumo");
      }

      this.clearCache();
      return result;
    } catch (error) {
      // ALTERAÇÃO: Log condicional apenas em modo debug
      if (typeof window !== 'undefined' && window.DEBUG_MODE) {
        console.error("Erro ao adicionar insumo:", error);
      }
      throw error;
    }
  }

  /**
   * Atualiza insumo
   */
  async updateInsumo(id, insumoData) {
    try {
      const apiData = {
        name: insumoData.nome,
        price: parseFloat(insumoData.custo) || 0,
        additional_price: parseFloat(insumoData.preco_adicional) || 0,
        is_available: insumoData.ativo !== undefined ? insumoData.ativo : true,
        current_stock: parseFloat(insumoData.atual) || 0,
        stock_unit: insumoData.unidade || "un",
        min_stock_threshold: parseFloat(insumoData.min) || 0,
        max_stock: parseFloat(insumoData.max) || 100,
        supplier: insumoData.fornecedor || "",
        category: insumoData.categoria || "outros",
        base_portion_quantity: parseFloat(insumoData.quantidade_porcao) || 1,
        base_portion_unit: insumoData.unidade_porcao || "un",
      };

      await updateIngredient(id, apiData);
      this.clearCache();
    } catch (error) {
      // ALTERAÇÃO: Log condicional apenas em modo debug
      if (typeof window !== 'undefined' && window.DEBUG_MODE) {
        console.error("Erro ao atualizar insumo:", error);
      }
      throw error;
    }
  }

  /**
   * Alterna disponibilidade do insumo
   */
  async toggleInsumoAvailability(id, novoStatus) {
    try {
      // Usar o endpoint geral de update que já inclui is_available
      await updateIngredient(id, { is_available: novoStatus });
      this.clearCache();
    } catch (error) {
      // ALTERAÇÃO: Log condicional apenas em modo debug
      if (typeof window !== 'undefined' && window.DEBUG_MODE) {
        console.error("Erro ao alterar disponibilidade do insumo:", error);
      }
      throw error;
    }
  }

  /**
   * Ajusta estoque do insumo
   */
  async adjustInsumoStock(id, changeAmount) {
    try {
      await adjustIngredientStock(id, changeAmount);
      this.clearCache();
    } catch (error) {
      // ALTERAÇÃO: Log condicional apenas em modo debug
      if (typeof window !== 'undefined' && window.DEBUG_MODE) {
        console.error("Erro ao ajustar estoque do insumo:", error);
      }
      throw error;
    }
  }

  /**
   * Exclui um insumo
   */
  async deleteInsumo(id) {
    try {
      await deleteIngredient(id);
      this.clearCache();
    } catch (error) {
      // ALTERAÇÃO: Log condicional apenas em modo debug
      if (typeof window !== 'undefined' && window.DEBUG_MODE) {
        console.error("Erro ao excluir insumo:", error);
      }
      throw error;
    }
  }

  /**
   * Busca resumo do estoque
   */
  async getResumoEstoque() {
    try {
      const response = await getStockSummary();
      return response;
    } catch (error) {
      // ALTERAÇÃO: Log condicional apenas em modo debug
      if (typeof window !== 'undefined' && window.DEBUG_MODE) {
        console.error("Erro ao buscar resumo do estoque:", error);
      }
      throw error;
    }
  }
}

/**
 * Gerenciador de interface de insumos
 */
class InsumoManager {
  constructor() {
    this.dataManager = new InsumoDataManager();
    this.currentEditingId = null;
    this.continuousAdjustment = null;
    this.operationTimestamps = {};
    this.quantityChangeTimeout = null; // Para debounce
    this.mouseDownTimeout = null; // Para distinguir clique simples de segurado
    this.ingredientes = []; // Lista de ingredientes para validação
    this.isSubmitting = false; // Evita envios duplicados
    // Estado de paginação
    this.currentPage = 1;
    this.pageSize = 20; // Itens por página (fixo em 20)
    this.totalPages = 1;
    this.totalItems = 0;
    this.currentSearchTerm = ""; // Termo de busca atual
    this.currentCategoryFilter = ""; // Filtro de categoria atual
    this.currentStatusFilter = ""; // Filtro de status atual
    this.isLoading = false; // Estado de carregamento
  }

  /**
   * Cleanup para evitar vazamentos de memória
   */
  destroy() {
    this.stopContinuousAdjustment();
    if (this.mouseDownTimeout) {
      clearTimeout(this.mouseDownTimeout);
      this.mouseDownTimeout = null;
    }
  }

  /**
   * Verifica se pode executar uma operação (rate limiting)
   */
  canExecuteOperation(operationType) {
    const now = Date.now();
    const lastExecution = this.operationTimestamps[operationType];
    const minInterval = 2000; // 2 segundos entre operações do mesmo tipo

    if (lastExecution && now - lastExecution < minInterval) {
      return false;
    }

    this.operationTimestamps[operationType] = now;
    return true;
  }

  /**
   * Inicializa o módulo
   */
  async init() {
    try {
      await this.loadInsumos();
      await this.loadResumoEstoque();
      this.setupEventListeners();
    } catch (error) {
      // ALTERAÇÃO: Log condicional apenas em modo debug
      if (typeof window !== 'undefined' && window.DEBUG_MODE) {
        console.error("Erro ao inicializar módulo de insumos:", error);
      }
      this.showErrorMessage("Erro ao carregar dados dos insumos");
    }
  }

  /**
   * Configura event listeners
   */
  setupEventListeners() {
    this.setupInsumoHandlers();
    this.setupFilterHandlers();
    this.setupSearchHandlers();
  }

  /**
   * Configura handlers específicos de insumos
   */
  setupInsumoHandlers() {
    const section = document.getElementById("secao-estoque");
    if (!section) return;

    // Event delegation para botões de editar
    section.addEventListener("click", (e) => {
      if (e.target.matches(".editar, .fa-edit")) {
        this.handleEditClick(e.target);
      }
    });

    // Event delegation para botões de excluir
    section.addEventListener("click", (e) => {
      if (e.target.matches(".excluir, .fa-trash")) {
        this.handleDeleteClick(e.target);
      }
    });

    // Event delegation para toggles
    section.addEventListener("change", (e) => {
      if (e.target.matches('.toggle input[type="checkbox"]')) {
        this.handleToggleChange(e.target);
      }
    });

    // Event delegation para toggles (click como fallback)
    section.addEventListener("click", (e) => {
      // Se clicou no input checkbox
      if (e.target.matches('.toggle input[type="checkbox"]')) {
        this.handleToggleChange(e.target);
      }
      // Se clicou no toggle-slider ou no toggle-container
      else if (
        e.target.matches(".toggle-slider") ||
        e.target.matches(".toggle-container")
      ) {
        const toggleContainer = e.target.closest(".toggle-container");
        const input = toggleContainer?.querySelector('input[type="checkbox"]');
        if (input) {
          input.checked = !input.checked;
          this.handleToggleChange(input);
        }
      }
    });

    // Event delegation para botão de editar estoque
    section.addEventListener("click", (e) => {
      if (
        e.target.matches(".btn-editar-estoque, .fa-edit") ||
        e.target.closest(".btn-editar-estoque")
      ) {
        const button = e.target.matches(".btn-editar-estoque")
          ? e.target
          : e.target.closest(".btn-editar-estoque");
        this.handleEditEstoqueClick(button);
      }
    });

    // Event delegation para botão novo insumo
    section.addEventListener("click", (e) => {
      if (e.target.matches(".adicionar, p")) {
        this.handleNewInsumo();
      }
    });
  }

  /**
   * Configura handlers de filtros
   */
  setupFilterHandlers() {
    const categoriaFilter = document.getElementById("categoria-estoque");
    const statusFilter = document.getElementById("status-estoque");

    if (categoriaFilter) {
      categoriaFilter.addEventListener("change", async (e) => {
        this.currentCategoryFilter = categoriaFilter.value || "";
        this.currentPage = 1; // Resetar para primeira página ao filtrar
        await this.loadInsumos(); // Reload from API for category filter
      });
    }

    if (statusFilter) {
      statusFilter.addEventListener("change", async (e) => {
        this.currentStatusFilter = statusFilter.value || "";
        this.currentPage = 1; // Resetar para primeira página ao filtrar
        await this.loadInsumos();
      });
    }
  }

  /**
   * Configura handlers de busca
   */
  setupSearchHandlers() {
    const searchInput = document.getElementById("busca-ingrediente");
    if (searchInput) {
      const debouncedSearch = debounce(async () => {
        this.currentSearchTerm = searchInput.value.trim();
        this.currentPage = 1; // Resetar para primeira página ao buscar
        await this.loadInsumos();
      }, 500); // Aumentar debounce para evitar muitas requisições

      searchInput.addEventListener("input", (e) => {
        debouncedSearch();
      });
    }
  }

  /**
   * Carrega insumos com paginação e busca
   */
  async loadInsumos() {
    if (this.isLoading) return; // Evitar múltiplas requisições simultâneas
    
    try {
      this.isLoading = true;
      this.showLoadingState();
      
      // Preparar opções de busca e paginação
      const options = {
        page: this.currentPage,
        page_size: this.pageSize, // Usar pageSize do estado
      };

      // Adicionar busca se houver termo de busca
      if (this.currentSearchTerm) {
        options.name = this.currentSearchTerm;
      }

      // Adicionar filtro de categoria se houver
      if (this.currentCategoryFilter && this.currentCategoryFilter !== "") {
        options.category = this.currentCategoryFilter;
      }

      // Adicionar filtro de status se houver (mapear valores do frontend para API)
      if (this.currentStatusFilter && this.currentStatusFilter !== "todos") {
        const statusMap = {
          "em-estoque": "in_stock",
          "estoque-baixo": "low_stock",
          "sem-estoque": "out_of_stock",
        };
        if (statusMap[this.currentStatusFilter]) {
          options.status = statusMap[this.currentStatusFilter];
        }
      }

      const response = await this.dataManager.getAllInsumos(options);
      const insumos = response.items || [];

      // Atualizar informações de paginação (preservar currentPage que foi definido antes da chamada)
      if (response.pagination) {
        this.totalPages = response.pagination.total_pages || 1;
        this.totalItems = response.pagination.total || 0;
        // NÃO sobrescrever currentPage - manter o valor que foi definido antes da chamada
        // A API retorna a página que foi solicitada, então não precisamos atualizar
      }

      // Mapear dados para o formato esperado pelo createInsumoCard
      const insumosMapeados = insumos.map((insumo) => ({
        id: insumo.id,
        nome: insumo.name,
        categoria: insumo.category || "outros",
        custo: parseFloat(insumo.price) || 0,
        preco_adicional: parseFloat(insumo.additional_price) || 0,
        unidade: insumo.stock_unit || "un",
        // CORREÇÃO: Usar parseFloat para preservar decimais do estoque (ex: 17.000 kg)
        min: parseFloat(insumo.min_stock_threshold) || 0,
        max: parseFloat(insumo.max_stock) || 100,
        atual: parseFloat(insumo.current_stock) || 0,
        ativo: insumo.is_available !== undefined ? insumo.is_available : true,
        fornecedor: insumo.supplier || "Não informado",
        quantidade_porcao: parseFloat(insumo.base_portion_quantity) || 1,
        unidade_porcao: insumo.base_portion_unit || "un",
        ultimaAtualizacao: null,
      }));

      // Armazenar ingredientes para validação de nomes duplicados
      this.ingredientes = insumos.map((insumo) => ({
        id: insumo.id,
        name: insumo.name,
      }));

      this.renderInsumoCards(insumosMapeados);
      this.renderPagination();
      // Não precisa mais aplicar filtros locais - tudo é filtrado pela API
    } catch (error) {
      // ALTERAÇÃO: Log condicional apenas em modo debug
      if (typeof window !== 'undefined' && window.DEBUG_MODE) {
        console.error("Erro ao carregar insumos:", error);
      }
      this.showErrorMessage("Erro ao carregar insumos");
    } finally {
      this.isLoading = false;
      this.hideLoadingState();
    }
  }

  /**
   * Mostra estado de carregamento
   */
  showLoadingState() {
    const container = document.querySelector("#secao-estoque .ingredientes");
    if (!container) return;
    
    const loadingOverlay = document.createElement("div");
    loadingOverlay.className = "loading-overlay";
    loadingOverlay.id = "ingredientes-loading";
    // ALTERAÇÃO: Criar elementos manualmente para prevenir XSS
    const spinner = document.createElement('div');
    spinner.className = 'loading-spinner';
    const icon = document.createElement('i');
    icon.className = 'fa-solid fa-spinner fa-spin';
    const message = document.createElement('p');
    message.textContent = 'Carregando ingredientes...';
    spinner.appendChild(icon);
    spinner.appendChild(message);
    loadingOverlay.appendChild(spinner);
    container.appendChild(loadingOverlay);
  }

  /**
   * Esconde estado de carregamento
   */
  hideLoadingState() {
    const loadingOverlay = document.getElementById("ingredientes-loading");
    if (loadingOverlay) {
      loadingOverlay.remove();
    }
  }

  /**
   * Carrega ingredientes apenas para validação de nomes duplicados
   */
  async loadIngredientesForValidation() {
    try {
      const response = await this.dataManager.getAllInsumos({
        forceRefresh: true,
      });
      const insumos = response.items || [];

      // Armazenar apenas os dados necessários para validação
      this.ingredientes = insumos
        .map((insumo) => ({
          id: insumo.id,
          name: insumo.name || "",
        }))
        .filter((ing) => ing.name && ing.name.trim() !== ""); // Filtrar nomes vazios

      // Ingredientes carregados para validação
    } catch (error) {
      // ALTERAÇÃO: Log condicional apenas em modo debug
      if (typeof window !== 'undefined' && window.DEBUG_MODE) {
        console.error("Erro ao carregar ingredientes para validação:", error);
      }
      // Em caso de erro, usar lista vazia para não bloquear a operação
      this.ingredientes = [];
      throw error;
    }
  }

  /**
   * Verifica se um nome de ingrediente já existe usando endpoint específico
   */
  async checkNameExists(name) {
    try {
      // Importar função da API
      const { checkIngredientNameExists } = await import(
        "../../api/ingredients.js"
      );

      const response = await checkIngredientNameExists(name);
      return response.exists || false;
    } catch (error) {
      // ALTERAÇÃO: Log condicional apenas em modo debug
      if (typeof window !== 'undefined' && window.DEBUG_MODE) {
        console.warn("Erro ao verificar nome via API:", error);
      }
      return false; // Em caso de erro, permitir tentativa
    }
  }

  /**
   * Carrega resumo do estoque
   * ALTERAÇÃO: Agora usa API SQL em vez de calcular no frontend
   */
  async loadResumoEstoque() {
    try {
      // ALTERAÇÃO: Buscar métricas via API SQL em vez de calcular no frontend
      const response = await getStockDashboardMetrics();
      
      if (!response.success) {
        // ALTERAÇÃO: Log condicional apenas em modo debug
        if (typeof window !== 'undefined' && window.DEBUG_MODE) {
          console.error("Erro ao buscar métricas do dashboard de estoque:", response.error);
        }
        // Usar valores padrão em caso de erro
        this.updateResumoCards({
          total_stock_value: 0,
          total_items: 0,
          out_of_stock_count: 0,
          low_stock_count: 0,
          in_stock_count: 0
        });
        return;
      }
      
      const resumo = response.data;
      this.updateResumoCards(resumo);
    } catch (error) {
      // ALTERAÇÃO: Log condicional apenas em modo debug
      if (typeof window !== 'undefined' && window.DEBUG_MODE) {
        console.error("Erro ao carregar resumo do estoque:", error);
      }
      // Usar valores padrão em caso de erro
      this.updateResumoCards({
        total_stock_value: 0,
        total_items: 0,
        out_of_stock_count: 0,
        low_stock_count: 0,
        in_stock_count: 0
      });
    }
  }

  /**
   * Renderiza cards de insumos
   */
  renderInsumoCards(insumos) {
    const container = document.querySelector("#secao-estoque .ingredientes");
    if (!container) return;

    container.innerHTML = "";

    if (!insumos || insumos.length === 0) {
      container.innerHTML = `
                <div style="text-align: center; padding: 48px; color: #666;">
                    <i class="fa-solid fa-box-open" style="font-size: 48px; margin-bottom: 16px; opacity: 0.3;" aria-hidden="true"></i>
                    <p style="font-size: 16px;">Nenhum insumo encontrado</p>
                </div>
            `;
      return;
    }

    insumos.forEach((insumo) => {
      const card = this.createInsumoCard(insumo);
      container.appendChild(card);
    });
  }

  /**
   * Calcula progresso da barra de estoque
   */
  /**
   * Formata valor de estoque com até 3 casas decimais (remove zeros desnecessários)
   * Exemplos: 17.000 → "17.000", 17.5 → "17.5", 17.123 → "17.123", 17 → "17"
   * @param {number} value - Valor a ser formatado
   * @returns {string} Valor formatado
   */
  formatStockValue(value) {
    if (value === null || value === undefined || isNaN(value)) {
      return "0";
    }

    const numValue = parseFloat(value);

    // Formata com até 3 casas decimais
    let formatted = numValue.toFixed(3);

    // Remove zeros à direita desnecessários, mas mantém pelo menos 1 casa decimal se o valor tiver parte decimal
    // Exemplos: "17.000" → "17.000", "17.500" → "17.500", "17.123" → "17.123"
    // Mantém sempre 3 casas decimais para consistência com o formato do backend
    return formatted;
  }

  calculateProgress(insumo) {
    if (insumo.max <= 0) return 0;
    const progress = (insumo.atual / insumo.max) * 100;
    return Math.min(Math.max(progress, 0), 100);
  }

  /**
   * Cria card de insumo
   */
  createInsumoCard(insumo) {
    const card = document.createElement("div");
    const statusClass = this.getStatusClass(insumo);
    card.className = `card-ingrediente ${statusClass}`;
    card.dataset.ingredientId = insumo.id;

    const statusText = this.getStatusText(insumo);
    const categoriaNome = this.getCategoriaNome(insumo.categoria);

    card.innerHTML = `
            <div class="cabecalho-ingrediente">
                <div class="nome-ingrediente">
                    <h3>${escapeHTML(insumo.nome || "Nome não informado")}</h3>
                    <div class="info-ingrediente">
                        <div class="info-ingrediente-container">
                            <div class="categoria-fornecedor">
                                <i class="fa-solid fa-tag"></i>
                                <span>${escapeHTML(categoriaNome)}</span>
                </div>
                            <div class="categoria-fornecedor">
                                <i class="fa-solid fa-truck"></i>
                                <span>${escapeHTML(
                                  insumo.fornecedor || "Não informado"
                                )}</span>
                            </div>
                        </div>
                        <div class="tag-status ${statusClass}">
                            ${escapeHTML(statusText)}
                        </div>
                </div>
            </div>
            
                <div class="controles-ingrediente">
                    ${
                      insumo.ativo
                        ? `
                    <div class="editar" title="Editar insumo">
                        <i class="fa-solid fa-edit"></i>
                    </div>
                    `
                        : ""
                    }
                    <div class="excluir" title="Excluir insumo">
                        <i class="fa-solid fa-trash"></i>
                    </div>
                    <div class="toggle-container">
                        <div class="toggle ${insumo.ativo ? "active" : ""}">
                            <input type="checkbox" ${
                              insumo.ativo ? "checked" : ""
                            }>
                            <span class="toggle-slider"></span>
                        </div>
                        <div class="status-text ${
                          insumo.ativo ? "" : "inactive"
                        }">
                            <i class="fa-solid ${
                              insumo.ativo ? "fa-eye" : "fa-eye-slash"
                            }"></i>
                            <span>${insumo.ativo ? "Ativo" : "Inativo"}</span>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="controle-estoque">
                <div class="estoque-atual">
                    <div class="label">Estoque Atual</div>
                    <div class="quantidade">${this.formatStockValue(
                      insumo.atual || 0
                    )} ${insumo.unidade || "un"}</div>
                </div>
                
                <div class="barra-progresso">
                    <div class="progresso" style="width: ${this.calculateProgress(
                      insumo
                    )}%"></div>
                </div>
                
                <div class="limites">
                    <span>Min: ${this.formatStockValue(insumo.min || 0)}</span>
                    <span>Max: ${this.formatStockValue(
                      insumo.max || 100
                    )}</span>
                </div>
                
                ${
                  insumo.ativo
                    ? `
                <div class="botoes-quantidade">
                    <button class="btn-editar-estoque" title="Editar estoque">
                        <i class="fa-solid fa-edit"></i>
                        <span>Editar Estoque</span>
                    </button>
                </div>
                `
                    : ""
                }
                </div>
                
            <div class="info-adicional">
                <div class="info">
                    <div class="label">Custo Unit.</div>
                    <div class="valor">R$ ${(insumo.custo || 0)
                      .toFixed(2)
                      .replace(".", ",")}/${insumo.unidade || "un"}</div>
                </div>
                <div class="info">
                    <div class="label">Preço Adicional</div>
                    <div class="valor">R$ ${(insumo.preco_adicional || 0)
                      .toFixed(2)
                      .replace(".", ",")}</div>
                </div>
                <div class="porcao-base info">
                    <div class="label">Porção Base</div>
                    <div class="valor">${(
                      insumo.quantidade_porcao || 1
                    ).toFixed(1)} ${insumo.unidade_porcao || "un"}</div>
                </div>
            </div>
        `;

    // Atualizar estado dos botões de quantidade
    setTimeout(() => {
      this.updateQuantityButtonsState(card);
    }, 100);

    return card;
  }

  /**
   * Trata clique no botão de novo insumo
   */
  handleNewInsumo() {
    this.currentEditingId = null;
    this.openInsumoModal();
  }

  /**
   * Trata clique no botão de editar
   */
  async handleEditClick(button) {
    const card = button.closest(".card-ingrediente");
    const insumoId = parseInt(card.dataset.ingredientId);

    try {
      const insumo = await this.dataManager.getInsumoById(insumoId);
      if (insumo) {
        this.currentEditingId = insumoId;
        this.openInsumoModal(insumo);
      }
    } catch (error) {
      // ALTERAÇÃO: Log condicional apenas em modo debug
      if (typeof window !== 'undefined' && window.DEBUG_MODE) {
        console.error("Erro ao buscar insumo para edição:", error);
      }
      this.showErrorMessage("Erro ao carregar dados do insumo");
    }
  }

  /**
   * Trata clique no botão de editar estoque
   */
  async handleEditEstoqueClick(button) {
    const card = button.closest(".card-ingrediente");
    const insumoId = parseInt(card.dataset.ingredientId);

    try {
      const insumo = await this.dataManager.getInsumoById(insumoId);
      if (insumo) {
        this.openEditarEstoqueModal(insumo);
      }
    } catch (error) {
      // ALTERAÇÃO: Log condicional apenas em modo debug
      if (typeof window !== 'undefined' && window.DEBUG_MODE) {
        console.error("Erro ao buscar insumo para edição de estoque:", error);
      }
      this.showErrorMessage("Erro ao carregar dados do insumo");
    }
  }

  /**
   * Abre modal para editar estoque
   */
  openEditarEstoqueModal(insumo) {
    const modal = document.getElementById("modal-editar-estoque");
    if (!modal) return;

    // Preencher dados do insumo na modal
    const nomeInput = document.getElementById("nome-insumo-estoque");
    const valorInput = document.getElementById("valor-estoque");
    const unidadeDisplay = document.getElementById("unidade-estoque-display");

    if (nomeInput) nomeInput.value = insumo.nome || "";
    if (valorInput) valorInput.value = this.formatStockValue(insumo.atual || 0);
    if (unidadeDisplay) {
      const unidade = insumo.unidade || "un";
      unidadeDisplay.textContent = unidade;
    }

    // Armazenar ID do insumo na modal
    modal.dataset.ingredientId = insumo.id;

    // Configurar event listeners da modal
    this.setupEditarEstoqueModalListeners();

    // Mostrar modal usando função global se disponível
    if (window.abrirModal) {
      window.abrirModal("modal-editar-estoque");
    } else {
      modal.style.display = "flex";
    }
  }

  /**
   * Configura event listeners da modal de editar estoque
   */
  setupEditarEstoqueModalListeners() {
    const modal = document.getElementById("modal-editar-estoque");
    if (!modal) return;

    // Remover listeners anteriores para evitar duplicação
    const cancelarBtn = document.getElementById("cancelar-editar-estoque");
    const salvarBtn = document.getElementById("salvar-editar-estoque");
    const overlay = modal.querySelector(".div-overlay");

    // Criar novos handlers
    const cancelarHandler = () => this.closeEditarEstoqueModal();
    const salvarHandler = () => this.saveEditarEstoque();
    const overlayHandler = (e) => {
      if (e.target === overlay) {
        this.closeEditarEstoqueModal();
      }
    };

    // Remover listeners antigos se existirem
    if (cancelarBtn) {
      cancelarBtn.replaceWith(cancelarBtn.cloneNode(true));
      document
        .getElementById("cancelar-editar-estoque")
        .addEventListener("click", cancelarHandler);
    }
    if (salvarBtn) {
      salvarBtn.replaceWith(salvarBtn.cloneNode(true));
      document
        .getElementById("salvar-editar-estoque")
        .addEventListener("click", salvarHandler);
    }
    if (overlay) {
      overlay.replaceWith(overlay.cloneNode(true));
      modal
        .querySelector(".div-overlay")
        .addEventListener("click", overlayHandler);
    }

    // Fechar modal ao pressionar ESC
    const escHandler = (e) => {
      if (e.key === "Escape" && modal.style.display === "flex") {
        this.closeEditarEstoqueModal();
      }
    };
    document.addEventListener("keydown", escHandler);
    modal.dataset.escHandler = "true";
  }

  /**
   * Fecha modal de editar estoque
   */
  closeEditarEstoqueModal() {
    const modal = document.getElementById("modal-editar-estoque");
    if (!modal) return;

    // Fechar modal usando função global se disponível
    if (window.fecharModal) {
      window.fecharModal("modal-editar-estoque");
    } else {
      modal.style.display = "none";
    }

    // Limpar dados
    const nomeInput = document.getElementById("nome-insumo-estoque");
    const valorInput = document.getElementById("valor-estoque");
    const unidadeDisplay = document.getElementById("unidade-estoque-display");

    if (nomeInput) nomeInput.value = "";
    if (valorInput) valorInput.value = "";
    if (unidadeDisplay) unidadeDisplay.textContent = "";
    if (modal.dataset.ingredientId) delete modal.dataset.ingredientId;
  }

  /**
   * Salva novo valor de estoque
   */
  async saveEditarEstoque() {
    const modal = document.getElementById("modal-editar-estoque");
    if (!modal) return;

    const insumoId = parseInt(modal.dataset.ingredientId);
    const valorInput = document.getElementById("valor-estoque");

    if (!insumoId || !valorInput) {
      this.showErrorMessage("Erro ao obter dados do insumo");
      return;
    }

    const novoValor = parseFloat(valorInput.value);

    // Validação
    if (isNaN(novoValor) || novoValor < 0) {
      this.showErrorMessage(
        "Por favor, insira um valor válido maior ou igual a zero"
      );
      valorInput.focus();
      return;
    }

    // Desabilitar botão durante salvamento
    const salvarBtn = document.getElementById("salvar-editar-estoque");
    if (salvarBtn) {
      salvarBtn.disabled = true;
      salvarBtn.innerHTML =
        '<i class="fa-solid fa-spinner fa-spin"></i> Salvando...';
    }

    try {
      // Buscar dados atuais do insumo
      const insumoAtual = await this.dataManager.getInsumoById(insumoId);

      // Atualizar apenas o estoque
      await this.dataManager.updateInsumo(insumoId, {
        ...insumoAtual,
        atual: novoValor,
      });

      // Atualizar card visualmente
      const card = document.querySelector(
        `.card-ingrediente[data-ingredient-id="${insumoId}"]`
      );
      if (card) {
        this.updateQuantityDisplay(card, novoValor);
      }

      // Atualizar resumo
      await this.loadResumoEstoque();

      // Recarregar insumos para garantir sincronização (mantém página atual)
      await this.loadInsumos();

      this.showSuccessMessage("Estoque atualizado com sucesso!");
      this.closeEditarEstoqueModal();
    } catch (error) {
      // ALTERAÇÃO: Log condicional apenas em modo debug
      if (typeof window !== 'undefined' && window.DEBUG_MODE) {
        console.error("Erro ao salvar estoque:", error);
      }
      this.handleApiError(error, "atualizar estoque do insumo");
    } finally {
      // Reabilitar botão
      if (salvarBtn) {
        salvarBtn.disabled = false;
        salvarBtn.innerHTML = "Salvar";
      }
    }
  }

  /**
   * Trata mudança no toggle
   */
  async handleToggleChange(toggle) {
    // Rate limiting para operações de toggle
    if (!this.canExecuteOperation("toggle-status")) {
      return;
    }

    const card = toggle.closest(".card-ingrediente");
    const insumoId = parseInt(card.dataset.ingredientId);
    const novoStatus = toggle.checked;

    try {
      await this.dataManager.toggleInsumoAvailability(insumoId, novoStatus);

      // Atualização automática otimizada
      this.updateToggleInUI(card, novoStatus);
      await this.updateResumoAfterToggle(novoStatus);

      this.showSuccessMessage(
        `Insumo ${novoStatus ? "ativado" : "desativado"} com sucesso!`
      );
    } catch (error) {
      this.handleApiError(error, "alterar status do insumo");

      // Reverter toggle
      toggle.checked = !novoStatus;
    }
  }

  /**
   * Trata mudança na quantidade
   */
  async handleQuantityChange(target) {
    // Se clicou no ícone, encontrar o botão pai
    const button = target.matches(".btn-quantidade")
      ? target
      : target.closest(".btn-quantidade");
    if (!button) return;

    const card = button.closest(".card-ingrediente");
    const insumoId = parseInt(card.dataset.ingredientId);
    const changeAmount = parseInt(button.dataset.change);

    // Validar se o ajuste é válido
    if (!this.validateQuantityChange(card, changeAmount)) {
      return;
    }

    // Aplicar debounce para operações rápidas
    if (this.quantityChangeTimeout) {
      clearTimeout(this.quantityChangeTimeout);
    }

    this.quantityChangeTimeout = setTimeout(async () => {
      await this.executeQuantityChange(button, card, insumoId, changeAmount);
    }, 100); // Debounce de 100ms
  }

  /**
   * Executa a mudança de quantidade com otimizações
   */
  async executeQuantityChange(button, card, insumoId, changeAmount) {
    // Salvar ícone original
    const originalIcon = button.innerHTML;

    // Atualização otimista da UI (antes da API)
    const quantidadeElement = card.querySelector(".quantidade");
    const currentValue = parseFloat(
      quantidadeElement.textContent.split(" ")[0]
    );
    const newValue = Math.max(0, currentValue + changeAmount);

    // Atualizar visual imediatamente
    this.updateQuantityDisplay(card, newValue);
    this.updateQuantityButtonsState(card);

    // Mostrar ícone de loading
    button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
    button.disabled = true;

    try {
      await this.dataManager.adjustInsumoStock(insumoId, changeAmount);

      // Atualizar cache local
      this.updateLocalCache(insumoId, newValue);

      // Atualizar resumo local (sem recarregar tudo)
      await this.updateResumoLocal(changeAmount, insumoId);

      // Mostrar ícone de sucesso temporariamente
      button.innerHTML = '<i class="fa-solid fa-check"></i>';
      setTimeout(() => {
        button.innerHTML = originalIcon;
        button.disabled = false;
      }, 300);
    } catch (error) {
      this.handleApiError(error, "ajustar estoque do insumo");

      // Reverter mudança visual em caso de erro
      this.updateQuantityDisplay(card, currentValue);
      this.updateQuantityButtonsState(card);

      // Mostrar ícone de erro e restaurar
      button.innerHTML = '<i class="fa-solid fa-times"></i>';
      setTimeout(() => {
        button.innerHTML = originalIcon;
        button.disabled = false;
      }, 1000);
    }
  }

  /**
   * Atualiza display da quantidade no card
   */
  updateQuantityDisplay(card, newValue) {
    const quantidadeElement = card.querySelector(".quantidade");
    if (quantidadeElement) {
      const unidade = quantidadeElement.textContent.split(" ")[1] || "un";
      quantidadeElement.textContent = `${this.formatStockValue(
        newValue
      )} ${unidade}`;
    }

    // Atualizar barra de progresso
    const progressElement = card.querySelector(".progresso");
    if (progressElement) {
      const maxElement = card.querySelector(".limites span:last-child");
      const maxValue = maxElement
        ? parseFloat(maxElement.textContent.split(": ")[1])
        : 100;
      const progress = maxValue > 0 ? (newValue / maxValue) * 100 : 0;
      progressElement.style.width = `${Math.min(Math.max(progress, 0), 100)}%`;
    }

    // Atualizar cor da barra de progresso
    const maxElement = card.querySelector(".limites span:last-child");
    const maxValue = maxElement
      ? parseFloat(maxElement.textContent.split(": ")[1])
      : 100;
    this.updateProgressBarColor(card, newValue, maxValue);

    // CORREÇÃO: Atualizar status do card
    const minElement = card.querySelector(".limites span:first-child");
    const minValue = minElement
      ? parseFloat(minElement.textContent.split(": ")[1])
      : 0;

    // Criar objeto temporário para calcular status
    const tempInsumo = {
      atual: newValue,
      min: minValue,
      max: maxValue,
    };

    const newStatusClass = this.getStatusClass(tempInsumo);
    const newStatusText = this.getStatusText(tempInsumo);

    // Remover classes de status antigas
    card.classList.remove(
      "sem-estoque",
      "estoque-baixo",
      "em-estoque",
      "estoque-alto"
    );
    // Adicionar nova classe de status
    card.classList.add(newStatusClass);

    // Atualizar texto de status
    const statusElement = card.querySelector(".tag-status");
    if (statusElement) {
      statusElement.className = `tag-status ${newStatusClass}`;
      statusElement.textContent = newStatusText;
    }
  }

  /**
   * Atualiza cache local com novo valor
   * Adicionada validação de dados e tratamento de erro
   */
  updateLocalCache(insumoId, newValue) {
    try {
      //Validar parâmetros de entrada
      if (!insumoId || isNaN(newValue)) {
        // ALTERAÇÃO: Log condicional apenas em modo debug
        if (typeof window !== 'undefined' && window.DEBUG_MODE) {
          console.warn("Parâmetros inválidos para updateLocalCache:", {
            insumoId,
            newValue,
          });
        }
        return;
      }

      if (this.dataManager.cache.data && this.dataManager.cache.data.items) {
        const insumo = this.dataManager.cache.data.items.find(
          (item) => item.id === insumoId
        );
        if (insumo) {
          insumo.current_stock = newValue;
          // CORREÇÃO: Marcar cache como modificado para invalidar na próxima verificação
          this.dataManager.cache.lastFetch =
            Date.now() - this.dataManager.cacheTimeout;
        } else {
          // ALTERAÇÃO: Log condicional apenas em modo debug
          if (typeof window !== 'undefined' && window.DEBUG_MODE) {
            console.warn(`Insumo com ID ${insumoId} não encontrado no cache`);
          }
        }
      }
    } catch (error) {
      // ALTERAÇÃO: Log condicional apenas em modo debug
      if (typeof window !== 'undefined' && window.DEBUG_MODE) {
        console.error("Erro ao atualizar cache local:", error);
      }
    }
  }

  /**
   * Atualiza resumo local sem recarregar tudo
   */
  async updateResumoLocal(changeAmount, insumoId = null) {
    try {
      // Atualizar valor total do estoque localmente
      const totalValueElement = document.getElementById("valor-total-estoque");
      if (totalValueElement) {
        const currentValue = parseFloat(
          totalValueElement.textContent
            .replace("R$", "")
            .replace(",", ".")
            .trim()
        );
        // Buscar card específico do insumo alterado
        const insumoCard = insumoId
          ? document.querySelector(`[data-ingredient-id="${insumoId}"]`)
          : document.querySelector(`[data-ingredient-id]`);
        const custoElement = insumoCard?.querySelector(".valor");
        if (custoElement) {
          const custoUnitario = parseFloat(
            custoElement.textContent.replace("R$", "").replace(",", ".").trim()
          );
          const newTotalValue = currentValue + changeAmount * custoUnitario;
          totalValueElement.textContent = `R$ ${newTotalValue
            .toFixed(2)
            .replace(".", ",")}`;
        }
      }
    } catch (error) {
      // ALTERAÇÃO: Log condicional apenas em modo debug
      if (typeof window !== 'undefined' && window.DEBUG_MODE) {
        console.error("Erro ao atualizar resumo local:", error);
      }
      // Em caso de erro, recarregar dados completos
      await this.loadResumoEstoque();
    }
  }

  /**
   * Valida se a mudança de quantidade é válida
   *  Adicionada validação de NaN e verificação de limites máximos
   */
  validateQuantityChange(card, changeAmount) {
    const quantidadeElement = card.querySelector(".quantidade");
    if (!quantidadeElement) return false;

    const currentValue = parseFloat(
      quantidadeElement.textContent.split(" ")[0]
    );

    // Validar se currentValue é um número válido
    if (isNaN(currentValue)) {
      // ALTERAÇÃO: Log condicional apenas em modo debug
      if (typeof window !== 'undefined' && window.DEBUG_MODE) {
        console.error(
          "Valor de estoque inválido:",
          quantidadeElement.textContent
        );
      }
      return false;
    }

    const newValue = currentValue + changeAmount;

    // Não permitir estoque negativo
    if (newValue < 0) {
      this.showErrorMessage("Não é possível ter estoque negativo");
      return false;
    }

    // Validar limite máximo para evitar valores absurdos
    const maxElement = card.querySelector(".limites span:last-child");
    const maxValue = maxElement
      ? parseFloat(maxElement.textContent.split(": ")[1])
      : Infinity;

    if (!isNaN(maxValue) && newValue > maxValue * 2) {
      // Permitir até 2x o máximo para flexibilidade
      this.showErrorMessage("Valor muito alto para o estoque");
      return false;
    }

    return true;
  }

  /**
   * Mostra mensagem de erro
   */
  showErrorMessage(message) {
    showToast(message, {
      type: "error",
      title: "Validação de Estoque",
      duration: 3000,
    });
  }

  /**
   * Atualiza estado visual dos botões de quantidade
   */
  updateQuantityButtonsState(card) {
    const quantidadeElement = card.querySelector(".quantidade");
    if (!quantidadeElement) return;

    const currentValue = parseFloat(
      quantidadeElement.textContent.split(" ")[0]
    );
    const maxElement = card.querySelector(".limites span:last-child");
    const maxValue = maxElement
      ? parseFloat(maxElement.textContent.split(": ")[1])
      : Infinity;

    const minusButton = card.querySelector('.btn-quantidade[data-change="-1"]');
    const plusButton = card.querySelector('.btn-quantidade[data-change="1"]');

    // Desabilitar botão de diminuir se estoque for zero
    if (minusButton) {
      minusButton.disabled = currentValue <= 0;
      minusButton.style.opacity = currentValue <= 0 ? "0.5" : "1";
      minusButton.title =
        currentValue <= 0 ? "Estoque já está em zero" : "Diminuir estoque";
    }

    // Atualizar cor da barra de progresso baseada no status
    this.updateProgressBarColor(card, currentValue, maxValue);
  }

  /**
   * Atualiza cor da barra de progresso baseada no status do estoque
   */
  updateProgressBarColor(card, currentValue, maxValue) {
    const progressBar = card.querySelector(".progresso");
    if (!progressBar) return;

    const percentage = (currentValue / maxValue) * 100;

    // Remover classes de cor anteriores
    progressBar.classList.remove("low-stock", "out-of-stock", "normal-stock");

    if (currentValue <= 0) {
      progressBar.classList.add("out-of-stock");
    } else if (percentage <= 20) {
      progressBar.classList.add("low-stock");
    } else {
      progressBar.classList.add("normal-stock");
    }
  }

  /**
   * Inicia o ajuste contínuo de estoque
   */
  startContinuousAdjustment(target) {
    // Se clicou no ícone, encontrar o botão pai
    const button = target.matches(".btn-quantidade")
      ? target
      : target.closest(".btn-quantidade");
    if (!button) return;

    const card = button.closest(".card-ingrediente");
    const insumoId = parseInt(card.dataset.ingredientId);
    const changeAmount = parseInt(button.dataset.change);

    // Validar se o ajuste inicial é válido
    if (!this.validateQuantityChange(card, changeAmount)) {
      return;
    }

    // Salvar referências para parar o loop
    this.continuousAdjustment = {
      button,
      card,
      insumoId,
      changeAmount,
      intervalId: null,
      isRunning: false,
      delayTimeout: null,
      originalIcon: button.innerHTML,
      adjustmentCount: 0,
      lastAdjustmentTime: 0,
      pendingChanges: 0, // Contador de mudanças pendentes
      batchTimeout: null, // Timeout para processar em lote
    };

    // Marcar como running imediatamente
    this.continuousAdjustment.isRunning = true;

    // Mostrar ícone de loading durante o delay
    button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

    // Delay antes de iniciar o ajuste contínuo (800ms)
    this.continuousAdjustment.delayTimeout = setTimeout(() => {
      if (this.continuousAdjustment && this.continuousAdjustment.isRunning) {
        // Restaurar ícone original
        button.innerHTML = this.continuousAdjustment.originalIcon;

        // Configurar intervalo para ajustes contínuos com velocidade adaptativa
        this.continuousAdjustment.intervalId = setInterval(() => {
          if (
            this.continuousAdjustment &&
            this.continuousAdjustment.isRunning
          ) {
            this.performContinuousAdjustment(button);
          }
        }, 200); // Ajusta a cada 200ms para melhor responsividade
      }
    }, 800); // Delay aumentado para 800ms para distinguir clique simples de segurado
  }

  /**
   * Executa ajuste contínuo com validação otimizada
   */
  async performContinuousAdjustment(button) {
    // Verificar se o ajuste contínuo ainda está ativo
    if (!this.continuousAdjustment || !this.continuousAdjustment.isRunning) {
      return;
    }

    const card = this.continuousAdjustment.card;
    const changeAmount = this.continuousAdjustment.changeAmount;

    // Validar se ainda é possível ajustar
    if (!this.validateQuantityChange(card, changeAmount)) {
      this.stopContinuousAdjustment();
      return;
    }

    // Atualização otimista da UI
    const quantidadeElement = card.querySelector(".quantidade");
    const currentValue = parseFloat(
      quantidadeElement.textContent.split(" ")[0]
    );
    const newValue = Math.max(0, currentValue + changeAmount);

    // Atualizar visual imediatamente
    this.updateQuantityDisplay(card, newValue);
    this.updateQuantityButtonsState(card);

    // Incrementar contador de mudanças pendentes
    this.continuousAdjustment.pendingChanges += changeAmount;
    this.continuousAdjustment.adjustmentCount++;
    this.continuousAdjustment.lastAdjustmentTime = Date.now();

    // Atualizar visual do botão para mostrar atividade
    if (this.continuousAdjustment.adjustmentCount % 5 === 0) {
      button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
      setTimeout(() => {
        if (this.continuousAdjustment && this.continuousAdjustment.isRunning) {
          button.innerHTML = this.continuousAdjustment.originalIcon;
        }
      }, 100);
    }

    // Processar mudanças em lote (a cada 5 ajustes ou 1 segundo)
    this.scheduleBatchUpdate();
  }

  /**
   * Agenda atualização em lote
   */
  scheduleBatchUpdate() {
    // Verificar se o ajuste contínuo ainda está ativo
    if (!this.continuousAdjustment) {
      return;
    }

    if (this.continuousAdjustment.batchTimeout) {
      clearTimeout(this.continuousAdjustment.batchTimeout);
    }

    this.continuousAdjustment.batchTimeout = setTimeout(async () => {
      if (
        this.continuousAdjustment &&
        this.continuousAdjustment.pendingChanges !== 0
      ) {
        try {
          await this.dataManager.adjustInsumoStock(
            this.continuousAdjustment.insumoId,
            this.continuousAdjustment.pendingChanges
          );

          // Atualizar cache local
          const quantidadeElement =
            this.continuousAdjustment.card.querySelector(".quantidade");
          const currentValue = parseFloat(
            quantidadeElement.textContent.split(" ")[0]
          );
          this.updateLocalCache(
            this.continuousAdjustment.insumoId,
            currentValue
          );

          // Resetar contador
          this.continuousAdjustment.pendingChanges = 0;
        } catch (error) {
          // ALTERAÇÃO: Log condicional apenas em modo debug
          if (typeof window !== 'undefined' && window.DEBUG_MODE) {
            console.error("Erro no ajuste contínuo em lote:", error);
          }
          this.stopContinuousAdjustment();
        }
      }
    }, 1000); // Processar em lote a cada 1 segundo
  }

  /**
   * Para o ajuste contínuo de estoque
   */
  async stopContinuousAdjustment() {
    if (this.continuousAdjustment) {
      // Marcar como não running imediatamente
      this.continuousAdjustment.isRunning = false;

      // Limpar timeout de delay
      if (this.continuousAdjustment.delayTimeout) {
        clearTimeout(this.continuousAdjustment.delayTimeout);
      }

      // Limpar intervalo de ajuste contínuo
      if (this.continuousAdjustment.intervalId) {
        clearInterval(this.continuousAdjustment.intervalId);
      }

      // Processar mudanças pendentes antes de parar
      if (this.continuousAdjustment.pendingChanges !== 0) {
        try {
          await this.dataManager.adjustInsumoStock(
            this.continuousAdjustment.insumoId,
            this.continuousAdjustment.pendingChanges
          );

          // Atualizar cache local
          const quantidadeElement =
            this.continuousAdjustment.card.querySelector(".quantidade");
          const currentValue = parseFloat(
            quantidadeElement.textContent.split(" ")[0]
          );
          this.updateLocalCache(
            this.continuousAdjustment.insumoId,
            currentValue
          );
        } catch (error) {
          // ALTERAÇÃO: Log condicional apenas em modo debug
          if (typeof window !== 'undefined' && window.DEBUG_MODE) {
            console.error("Erro ao processar mudanças pendentes:", error);
          }
        }
      }

      // Limpar timeout de lote
      if (this.continuousAdjustment.batchTimeout) {
        clearTimeout(this.continuousAdjustment.batchTimeout);
      }

      // Mostrar feedback visual de conclusão
      if (this.continuousAdjustment.button) {
        const button = this.continuousAdjustment.button;
        const adjustmentCount = this.continuousAdjustment.adjustmentCount;
        const originalIcon = this.continuousAdjustment.originalIcon; // Salvar referência antes de limpar

        // Mostrar ícone de sucesso se houve ajustes
        if (adjustmentCount > 0) {
          button.innerHTML = '<i class="fa-solid fa-check"></i>';
          setTimeout(() => {
            button.innerHTML = originalIcon;
          }, 800);
        } else {
          // Restaurar ícone original imediatamente se não houve ajustes
          button.innerHTML = originalIcon;
        }
      }

      this.continuousAdjustment = null;

      // Atualizar resumo local (sem recarregar tudo)
      try {
        await this.loadResumoEstoque();
      } catch (error) {
        // ALTERAÇÃO: Log condicional apenas em modo debug
        if (typeof window !== 'undefined' && window.DEBUG_MODE) {
          console.error("Erro ao recarregar resumo após ajuste contínuo:", error);
        }
      }
    }
  }

  /**
   * Executa um único ajuste de estoque
   */
  async performSingleAdjustment(target) {
    // Se clicou no ícone, encontrar o botão pai
    const button = target.matches(".btn-quantidade")
      ? target
      : target.closest(".btn-quantidade");
    if (!button) return;

    const card = button.closest(".card-ingrediente");
    const insumoId = parseInt(card.dataset.ingredientId);
    const changeAmount = parseInt(button.dataset.change);

    try {
      // Fazer chamada à API
      await this.dataManager.adjustInsumoStock(insumoId, changeAmount);
    } catch (error) {
      // ALTERAÇÃO: Log condicional apenas em modo debug
      if (typeof window !== 'undefined' && window.DEBUG_MODE) {
        console.error("Erro ao ajustar estoque:", error);
      }
      this.stopContinuousAdjustment();

      // Reverter mudança visual em caso de erro (mantém página atual)
      await this.loadInsumos();
    }
  }

  /**
   * Atualiza status visual do card baseado na quantidade
   */
  updateCardStatus(card, currentQuantity) {
    const minQuantity = parseFloat(
      card
        .querySelector(".limites span:first-child")
        .textContent.split("Min: ")[1]
    );
    const maxQuantity = parseFloat(
      card
        .querySelector(".limites span:last-child")
        .textContent.split("Max: ")[1]
    );

    // Atualizar quantidade atual
    const quantidadeElement = card.querySelector(".quantidade");
    if (quantidadeElement) {
      const unidade = quantidadeElement.textContent.split(" ")[1];
      quantidadeElement.textContent = `${this.formatStockValue(
        currentQuantity
      )} ${unidade}`;
    }

    // Atualizar barra de progresso
    const progressElement = card.querySelector(".progresso");
    if (progressElement) {
      const progress =
        maxQuantity > 0 ? (currentQuantity / maxQuantity) * 100 : 0;
      progressElement.style.width = `${Math.min(Math.max(progress, 0), 100)}%`;
    }

    // Atualizar status do card
    let statusClass = "em-estoque";
    let statusText = "Em estoque";

    if (currentQuantity === 0) {
      statusClass = "sem-estoque";
      statusText = "Sem estoque";
    } else if (currentQuantity <= minQuantity) {
      statusClass = "estoque-baixo";
      statusText = "Estoque baixo";
    } else if (currentQuantity >= maxQuantity) {
      statusClass = "estoque-alto";
      statusText = "Estoque alto";
    }

    // Atualizar classes do card
    card.className = `card-ingrediente ${statusClass}`;

    // Atualizar tag de status
    const tagStatus = card.querySelector(".tag-status");
    if (tagStatus) {
      tagStatus.className = `tag-status ${statusClass}`;
      tagStatus.textContent = statusText;
    }
  }

  /**
   * Aplica todos os filtros simultaneamente
   */
  /**
   * Aplica filtros locais (categoria) - busca e status são feitos na API
   */
  applyLocalFilters() {
    const categoriaFilter = this.currentCategoryFilter || "";

    const cards = document.querySelectorAll(".card-ingrediente");

    cards.forEach((card) => {
      const shouldShow = this.checkCategoryFilter(card, categoriaFilter);
      card.style.display = shouldShow ? "block" : "none";
    });

    this.updateVisibleProductsCount();
  }

  /**
   * @deprecated - Mantido para compatibilidade, mas não é mais usado
   * Busca e status agora são feitos na API
   */
  applyAllFilters() {
    this.applyLocalFilters();
  }

  /**
   * Verifica se o card corresponde ao filtro de busca
   */
  checkSearchFilter(card, searchTerm) {
    if (!searchTerm) return true;

    const nome = card.querySelector("h3")?.textContent?.toLowerCase() || "";
    const categoria =
      card
        .querySelector(".categoria-fornecedor span")
        ?.textContent?.toLowerCase() || "";

    return nome.includes(searchTerm) || categoria.includes(searchTerm);
  }

  /**
   * Verifica se o card corresponde ao filtro de categoria
   */
  checkCategoryFilter(card, categoria) {
    if (!categoria || categoria === "todos") return true;

    const cardCategoria =
      card
        .querySelector(".categoria-fornecedor span")
        ?.textContent?.toLowerCase() || "";
    return cardCategoria.includes(categoria.toLowerCase());
  }

  /**
   * Verifica se o card corresponde ao filtro de status
   */
  checkStatusFilter(card, status) {
    if (status === "todos") return true;

    const isActive = card.querySelector(".toggle input")?.checked || false;

    if (status === "ativo") {
      return isActive;
    } else if (status === "inativo") {
      return !isActive;
    }

    return true;
  }

  /**
   * Atualiza contador de produtos visíveis
   */
  updateVisibleProductsCount() {
    const visibleCards = document.querySelectorAll(
      '.card-ingrediente[style*="block"], .card-ingrediente:not([style*="none"])'
    );
    const totalCards = document.querySelectorAll(".card-ingrediente");

    // Atualizar contador se existir elemento para isso
    const counterElement = document.getElementById(
      "contador-produtos-visiveis"
    );
    if (counterElement) {
      counterElement.textContent = `${visibleCards.length} de ${totalCards.length} insumos`;
    }
  }

  /**
   * Renderiza controles de paginação melhorados
   */
  renderPagination() {
    const container = document.querySelector("#secao-estoque .ingredientes");
    if (!container) return;

    // Remover paginação existente
    const existingPagination = container.parentElement.querySelector(".pagination");
    if (existingPagination) {
      existingPagination.remove();
    }

    // Calcular informações de exibição
    const startItem = this.totalItems === 0 ? 0 : (this.currentPage - 1) * this.pageSize + 1;
    const endItem = Math.min(this.currentPage * this.pageSize, this.totalItems);

    // Sempre renderizar paginação se houver itens (mesmo que seja apenas 1 página)
    if (this.totalItems === 0) {
      return;
    }

    // Criar elemento de paginação melhorado
    const pagination = document.createElement("div");
    pagination.className = "pagination";
    pagination.innerHTML = `
      <div class="pagination-wrapper">
        <div class="pagination-info">
          <span class="pagination-text">
            Mostrando <strong>${startItem}-${endItem}</strong> de <strong>${this.totalItems}</strong> ingredientes
          </span>
          ${this.totalPages > 1 ? `<span class="pagination-page-info">Página ${this.currentPage} de ${this.totalPages}</span>` : ''}
        </div>
        ${this.totalPages > 1 ? `
        <div class="pagination-controls">
          <button class="pagination-btn pagination-btn-nav" ${this.currentPage === 1 ? 'disabled' : ''} data-page="prev" title="Página anterior">
            <i class="fa-solid fa-chevron-left"></i>
            <span>Anterior</span>
          </button>
          <div class="pagination-pages">
            ${this.generatePageNumbers()}
          </div>
          <button class="pagination-btn pagination-btn-nav" ${this.currentPage === this.totalPages ? 'disabled' : ''} data-page="next" title="Próxima página">
            <span>Próxima</span>
            <i class="fa-solid fa-chevron-right"></i>
          </button>
        </div>
        ` : ''}
      </div>
    `;

    // Adicionar event listeners com scroll para topo
    // Usar event delegation para evitar problemas com listeners duplicados
    const handlePaginationClick = async (e) => {
      const target = e.target.closest('.pagination-btn, .page-number');
      if (!target) return;
      
      e.preventDefault();
      e.stopPropagation();
      
      if (this.isLoading) {
        return;
      }
      
      // Verificar se é botão de navegação
      if (target.classList.contains('pagination-btn')) {
        if (target.disabled) {
          return;
        }
        
        const action = target.dataset.page;
        
        if (action === "prev" && this.currentPage > 1) {
          this.currentPage = Math.max(1, this.currentPage - 1);
        } else if (action === "next" && this.currentPage < this.totalPages) {
          this.currentPage = Math.min(this.totalPages, this.currentPage + 1);
        } else {
          return;
        }
      } 
      // Verificar se é número de página
      else if (target.classList.contains('page-number')) {
        const page = parseInt(target.dataset.page);
        
        if (isNaN(page) || page === this.currentPage || page < 1 || page > this.totalPages) {
          return;
        }
        
        this.currentPage = page;
      } else {
        return;
      }
      
      await this.loadInsumos();
      this.scrollToTop();
    };
    
    // Usar event delegation no elemento de paginação
    pagination.addEventListener('click', handlePaginationClick);

    // Inserir após o container de ingredientes
    container.parentElement.appendChild(pagination);
  }

  /**
   * Faz scroll suave para o topo da seção
   */
  scrollToTop() {
    const section = document.getElementById("secao-estoque");
    if (section) {
      section.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  /**
   * Gera números de página para exibição melhorados
   */
  generatePageNumbers() {
    const pages = [];
    const maxVisible = 7; // Máximo de números de página visíveis
    
    if (this.totalPages <= maxVisible) {
      // Se houver poucas páginas, mostrar todas
      for (let i = 1; i <= this.totalPages; i++) {
        pages.push(
          `<button class="page-number ${i === this.currentPage ? 'active' : ''}" data-page="${i}">${i}</button>`
        );
      }
      return pages.join("");
    }

    // Lógica para muitas páginas
    let startPage = Math.max(1, this.currentPage - 2);
    let endPage = Math.min(this.totalPages, this.currentPage + 2);

    // Ajustar início se estiver no final
    if (endPage - startPage < 4) {
      if (this.currentPage <= 3) {
        startPage = 1;
        endPage = Math.min(5, this.totalPages);
      } else if (this.currentPage >= this.totalPages - 2) {
        startPage = Math.max(1, this.totalPages - 4);
        endPage = this.totalPages;
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
        `<button class="page-number ${i === this.currentPage ? 'active' : ''}" data-page="${i}" title="Página ${i}">${i}</button>`
      );
    }

    // Última página
    if (endPage < this.totalPages) {
      if (endPage < this.totalPages - 1) {
        pages.push(`<span class="page-ellipsis" title="Mais páginas">...</span>`);
      }
      pages.push(`<button class="page-number" data-page="${this.totalPages}" title="Última página">${this.totalPages}</button>`);
    }

    return pages.join("");
  }

  /**
   * Abre modal de insumo
   */
  openInsumoModal(insumoData = null) {
    const modal = document.getElementById("modal-ingrediente");
    if (!modal) return;

    const titulo = document.getElementById("titulo-modal-ingrediente");
    const btnSalvar = document.getElementById("salvar-ingrediente");

    if (insumoData) {
      titulo.textContent = "Editar insumo";
      btnSalvar.innerHTML = '<i class="fa-solid fa-save"></i> Salvar';
      this.populateInsumoForm(insumoData);
    } else {
      titulo.textContent = "Adicionar novo insumo";
      btnSalvar.innerHTML = '<i class="fa-solid fa-plus"></i> Adicionar';
      this.clearInsumoForm();
    }

    modal.style.display = "flex";
    document.body.style.overflow = "hidden";
    this.setupInsumoModalListeners(insumoData);
  }

  /**
   * Fecha modal de insumo
   */
  closeInsumoModal() {
    const modal = document.getElementById("modal-ingrediente");
    if (modal) {
      modal.style.display = "none";
      document.body.style.overflow = "auto";
    }
    this.currentEditingId = null;
  }

  /**
   * Popula formulário de insumo
   */
  populateInsumoForm(insumoData) {
    document.getElementById("nome-ingrediente").value = insumoData.nome || "";
    document.getElementById("fornecedor-ingrediente").value =
      insumoData.fornecedor || "";
    document.getElementById("categoria-ingrediente").value =
      insumoData.categoria || "";
    document.getElementById("custo-ingrediente").value = insumoData.custo
      ? `R$ ${insumoData.custo.toFixed(2).replace(".", ",")}`
      : "";
    document.getElementById("preco-adicional-ingrediente").value =
      insumoData.preco_adicional
        ? `R$ ${insumoData.preco_adicional.toFixed(2).replace(".", ",")}`
        : "";
    document.getElementById("unidade-ingrediente").value =
      insumoData.unidade || "";
    document.getElementById("quantidade-porcao-ingrediente").value =
      insumoData.quantidade_porcao || "";
    document.getElementById("unidade-porcao-ingrediente").value =
      insumoData.unidade_porcao || "";
    document.getElementById("estoque-minimo-ingrediente").value =
      insumoData.min || "";
    document.getElementById("estoque-maximo-ingrediente").value =
      insumoData.max || "";
  }

  /**
   * Limpa formulário de insumo
   */
  clearInsumoForm() {
    document.getElementById("nome-ingrediente").value = "";
    document.getElementById("fornecedor-ingrediente").value = "";
    document.getElementById("categoria-ingrediente").value = "";
    document.getElementById("custo-ingrediente").value = "";
    document.getElementById("preco-adicional-ingrediente").value = "";
    document.getElementById("unidade-ingrediente").value = "";
    document.getElementById("quantidade-porcao-ingrediente").value = "";
    document.getElementById("unidade-porcao-ingrediente").value = "";
    document.getElementById("estoque-minimo-ingrediente").value = "";
    document.getElementById("estoque-maximo-ingrediente").value = "";
  }

  /**
   * Configura listeners do modal
   */
  setupInsumoModalListeners(insumoData = null) {
    // Botão fechar
    const btnFechar = document.querySelector(
      "#modal-ingrediente .fechar-modal"
    );
    if (btnFechar) {
      btnFechar.addEventListener("click", () => this.closeInsumoModal());
    }

    // Botão cancelar
    const btnCancelar = document.getElementById("cancelar-ingrediente");
    if (btnCancelar) {
      btnCancelar.addEventListener("click", () => this.closeInsumoModal());
    }

    // Botão salvar (evitar múltiplos listeners acumulados entre aberturas do modal)
    const btnSalvar = document.getElementById("salvar-ingrediente");
    if (btnSalvar) {
      btnSalvar.onclick = () => {
        if (insumoData) {
          this.handleEditInsumo();
        } else {
          this.handleAddInsumo();
        }
      };
    }

    // Overlay
    const overlay = document.querySelector("#modal-ingrediente .div-overlay");
    if (overlay) {
      overlay.addEventListener("click", () => this.closeInsumoModal());
    }

    // Formatação de campos
    this.setupFieldFormatting();
  }

  /**
   * Configura formatação de campos
   */
  setupFieldFormatting() {
    const custoField = document.getElementById("custo-ingrediente");
    if (custoField) {
      custoField.addEventListener("input", (e) => {
        this.formatCurrencyInput(e.target);
      });
    }

    const precoAdicionalField = document.getElementById(
      "preco-adicional-ingrediente"
    );
    if (precoAdicionalField) {
      precoAdicionalField.addEventListener("input", (e) => {
        this.formatCurrencyInput(e.target);
      });
    }
  }

  /**
   * Formata input de moeda
   */
  formatCurrencyInput(input) {
    let value = input.value.replace(/\D/g, "");
    if (value) {
      const valorEmReais = parseInt(value) / 100;
      value = valorEmReais.toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    }
    input.value = value;
  }

  /**
   * Trata adição de insumo
   */
  async handleAddInsumo() {
    // Evitar envios simultâneos
    if (this.isSubmitting) {
      // ALTERAÇÃO: Log condicional apenas em modo debug
      if (typeof window !== 'undefined' && window.DEBUG_MODE) {
        console.warn("Envio já em andamento.");
      }
      return;
    }
    if (!(await this.validateInsumoForm())) {
      return;
    }

    const insumoData = this.getInsumoFormData();

    try {
      this.isSubmitting = true;
      const btnSalvar = document.getElementById("salvar-ingrediente");
      if (btnSalvar) {
        btnSalvar.disabled = true;
        btnSalvar.innerHTML =
          '<i class="fa-solid fa-spinner fa-spin"></i> Salvando...';
      }
      // Validação adicional antes de enviar para a API
      await this.loadIngredientesForValidation();
      const nomeNormalizado = insumoData.nome.toLowerCase().trim();
      const existingIngredient = this.ingredientes.find((ing) => {
        if (!ing.name) return false;
        const ingNormalizado = ing.name.toLowerCase().trim();
        return ingNormalizado === nomeNormalizado;
      });

      if (existingIngredient) {
        this.showErrorMessage(
          `Já existe um ingrediente com o nome "${existingIngredient.name}". Por favor, escolha um nome diferente.`
        );
        return;
      }

      // Validação adicional usando endpoint específico do backend
      const nameExists = await this.checkNameExists(insumoData.nome);
      if (nameExists) {
        this.showErrorMessage(
          `Já existe um ingrediente com o nome "${insumoData.nome}". Por favor, escolha um nome diferente.`
        );
        return;
      }

      // Criando insumo

      const newInsumo = await this.dataManager.addInsumo(insumoData);

      // Só executar atualizações da UI se a API retornou sucesso
      if (newInsumo && newInsumo.id) {
        // Com paginação, recarregar a lista para garantir sincronização
        this.currentPage = 1; // Voltar para primeira página para ver o novo item
        await this.loadInsumos();
        await this.updateResumoAfterAdd(insumoData);

        this.closeInsumoModal();
        this.showSuccessMessage("Insumo adicionado com sucesso!");
      } else {
        throw new Error("Resposta inválida da API ao criar insumo");
      }
    } catch (error) {
      // Em caso de erro, NÃO executar nenhuma atualização da UI
      // ALTERAÇÃO: Log condicional apenas em modo debug
      if (typeof window !== 'undefined' && window.DEBUG_MODE) {
        console.error("Erro ao adicionar insumo - não atualizando UI:", error);
      }

      // Se for erro 409 (conflito), não mostrar erro genérico, apenas a mensagem específica
      if (error.status === 409) {
        this.showErrorMessage(
          "Já existe um ingrediente com este nome. Por favor, escolha um nome diferente."
        );
      } else {
        this.handleApiError(error, "adicionar insumo");
      }
    } finally {
      this.isSubmitting = false;
      const btnSalvar = document.getElementById("salvar-ingrediente");
      if (btnSalvar) {
        btnSalvar.disabled = false;
        btnSalvar.innerHTML = this.currentEditingId
          ? '<i class="fa-solid fa-save"></i> Salvar'
          : '<i class="fa-solid fa-plus"></i> Adicionar';
      }
    }
  }

  /**
   * Trata edição de insumo
   */
  async handleEditInsumo() {
    if (!(await this.validateInsumoForm())) {
      return;
    }

    const insumoData = this.getInsumoFormData();
    const insumoId = this.currentEditingId;

    if (!insumoId) {
      // ALTERAÇÃO: Log condicional apenas em modo debug
      if (typeof window !== 'undefined' && window.DEBUG_MODE) {
        console.error("ID do insumo não encontrado");
      }
      return;
    }

    try {
      await this.dataManager.updateInsumo(insumoId, insumoData);

      // Com paginação, recarregar a lista para garantir sincronização
      // Manter página atual se o item ainda estiver visível
      await this.loadInsumos();
      await this.updateResumoAfterEdit(insumoData);

      this.closeInsumoModal();
      this.showSuccessMessage("Insumo atualizado com sucesso!");
    } catch (error) {
      this.handleApiError(error, "atualizar insumo");
    }
  }

  /**
   * Trata clique no botão de excluir
   */
  async handleDeleteClick(target) {
    const card = target.closest(".card-ingrediente");
    const insumoId = parseInt(card.dataset.ingredientId);
    const insumoNome = card.querySelector("h3").textContent;

    // Confirmar exclusão usando o sistema de alerts
    const confirmDelete = await showConfirm({
      title: "Confirmar Exclusão",
      message: `Tem certeza que deseja excluir o insumo "${insumoNome}"?\n\nEsta ação não pode ser desfeita.`,
      confirmText: "Excluir",
      cancelText: "Cancelar",
      type: "delete",
    });

    if (!confirmDelete) {
      return;
    }

    try {
      await this.deleteInsumo(insumoId);
      this.showSuccessMessage("Insumo excluído com sucesso!");
    } catch (error) {
      this.handleApiError(error, "excluir insumo");
    }
  }

  /**
   * Exclui um insumo
   */
  async deleteInsumo(insumoId) {
    try {
      // Verificar se o insumo existe antes de tentar excluir
      const card = document.querySelector(`[data-ingredient-id="${insumoId}"]`);
      if (!card) {
        throw new Error(
          "Insumo não encontrado na interface. Ele pode já ter sido removido."
        );
      }

      // Salvar dados do insumo antes de excluir para atualizar resumo
      const insumoData = this.extractInsumoDataFromCard(card);

      await this.dataManager.deleteInsumo(insumoId);

      // Com paginação, recarregar a lista para garantir sincronização
      // Se a página atual ficar vazia, voltar para página anterior
      const currentPageBeforeDelete = this.currentPage;
      await this.loadInsumos();
      
      // Se a página atual ficou vazia e não é a primeira, voltar uma página
      if (this.currentPage > 1 && this.totalItems > 0) {
        const itemsOnCurrentPage = Math.min(20, this.totalItems - (this.currentPage - 1) * 20);
        if (itemsOnCurrentPage === 0) {
          this.currentPage = Math.max(1, currentPageBeforeDelete - 1);
          await this.loadInsumos();
        }
      }
      
      await this.updateResumoAfterDelete(insumoData);
    } catch (error) {
      // ALTERAÇÃO: Log condicional apenas em modo debug
      if (typeof window !== 'undefined' && window.DEBUG_MODE) {
        console.error("Erro ao excluir insumo:", error);
      }

      // Se o erro for 404, remover o card da UI mesmo assim
      if (error.status === 404) {
        // ALTERAÇÃO: Log condicional apenas em modo debug
        if (typeof window !== 'undefined' && window.DEBUG_MODE) {
          console.warn(
            "Insumo não encontrado no servidor, removendo da interface..."
          );
        }
        this.removeInsumoFromUI(insumoId);
        return; // Não re-throw o erro para não mostrar mensagem de erro
      }

      throw error;
    }
  }

  /**
   * Valida formulário de insumo
   */
  async validateInsumoForm() {
    const nome = document.getElementById("nome-ingrediente").value.trim();
    const categoria = document.getElementById("categoria-ingrediente").value;
    const custo = document.getElementById("custo-ingrediente").value.trim();
    const unidade = document.getElementById("unidade-ingrediente").value.trim();
    const quantidadePorcao = document.getElementById(
      "quantidade-porcao-ingrediente"
    ).value;
    const unidadePorcao = document.getElementById(
      "unidade-porcao-ingrediente"
    ).value;
    const min = document.getElementById("estoque-minimo-ingrediente").value;
    const max = document.getElementById("estoque-maximo-ingrediente").value;

    if (!nome) {
      this.showErrorMessage("Nome é obrigatório");
      return false;
    }

    if (!categoria) {
      this.showErrorMessage("Categoria é obrigatória");
      return false;
    }

    if (!custo) {
      this.showErrorMessage("Custo é obrigatório");
      return false;
    }

    if (!unidade) {
      this.showErrorMessage("Unidade de estoque é obrigatória");
      return false;
    }

    if (!quantidadePorcao || parseFloat(quantidadePorcao) <= 0) {
      this.showErrorMessage(
        "Quantidade da porção base deve ser maior que zero"
      );
      return false;
    }

    if (!unidadePorcao) {
      this.showErrorMessage("Unidade da porção base é obrigatória");
      return false;
    }

    if (!min || parseInt(min) < 0) {
      this.showErrorMessage("Estoque mínimo deve ser maior ou igual a zero");
      return false;
    }

    if (!max || parseInt(max) < 0) {
      this.showErrorMessage("Estoque máximo deve ser maior ou igual a zero");
      return false;
    }

    if (parseInt(min) > parseInt(max)) {
      this.showErrorMessage(
        "Estoque mínimo não pode ser maior que o estoque máximo"
      );
      return false;
    }

    // Verificar se o nome já existe (apenas para novos ingredientes)
    if (!this.currentEditingId) {
      // Sempre tentar carregar ingredientes para validação
      try {
        await this.loadIngredientesForValidation();
      } catch (error) {
        // ALTERAÇÃO: Log condicional apenas em modo debug
        if (typeof window !== 'undefined' && window.DEBUG_MODE) {
          console.warn(
            "Não foi possível carregar ingredientes para validação:",
            error
          );
        }
        // Continuar sem validação frontend se não conseguir carregar
      }

      // Verificar duplicação se ingredientes estão disponíveis
      if (this.ingredientes && Array.isArray(this.ingredientes)) {
        const nomeNormalizado = nome.toLowerCase().trim();
        const existingIngredient = this.ingredientes.find((ing) => {
          if (!ing.name) return false;
          const ingNormalizado = ing.name.toLowerCase().trim();
          return ingNormalizado === nomeNormalizado;
        });

        if (existingIngredient) {
          this.showErrorMessage(
            `Já existe um ingrediente com o nome "${existingIngredient.name}". Por favor, escolha um nome diferente.`
          );
          return false;
        }
      }
    } else {
      // Para edição, verificar se o nome mudou e se já existe outro com o mesmo nome
      try {
        await this.loadIngredientesForValidation();

        if (this.ingredientes && Array.isArray(this.ingredientes)) {
          const existingIngredient = this.ingredientes.find(
            (ing) =>
              ing.id !== this.currentEditingId &&
              ing.name &&
              ing.name.toLowerCase().trim() === nome.toLowerCase().trim()
          );
          if (existingIngredient) {
            this.showErrorMessage(
              `Já existe outro ingrediente com o nome "${nome}". Por favor, escolha um nome diferente.`
            );
            return false;
          }
        }
      } catch (error) {
        // ALTERAÇÃO: Log condicional apenas em modo debug
        if (typeof window !== 'undefined' && window.DEBUG_MODE) {
          console.warn(
            "Não foi possível validar nome duplicado na edição:",
            error
          );
        }
      }
    }

    return true;
  }

  /**
   * Obtém dados do formulário
   */
  getInsumoFormData() {
    const custo = document
      .getElementById("custo-ingrediente")
      .value.replace("R$", "")
      .replace(",", ".")
      .trim();
    const precoAdicional = document
      .getElementById("preco-adicional-ingrediente")
      .value.replace("R$", "")
      .replace(",", ".")
      .trim();

    return {
      nome: document.getElementById("nome-ingrediente").value.trim(),
      fornecedor: document
        .getElementById("fornecedor-ingrediente")
        .value.trim(),
      categoria: document.getElementById("categoria-ingrediente").value,
      custo: parseFloat(custo) || 0,
      preco_adicional: parseFloat(precoAdicional) || 0,
      unidade: document.getElementById("unidade-ingrediente").value.trim(),
      quantidade_porcao:
        parseFloat(
          document.getElementById("quantidade-porcao-ingrediente").value
        ) || 1,
      unidade_porcao: document
        .getElementById("unidade-porcao-ingrediente")
        .value.trim(),
      min:
        parseInt(document.getElementById("estoque-minimo-ingrediente").value) ||
        0,
      max:
        parseInt(document.getElementById("estoque-maximo-ingrediente").value) ||
        0,
      atual: this.currentEditingId ? this.preserveCurrentStock() : 0, // Preservar estoque atual na edição
      ativo: true,
    };
  }

  /**
   * Preserva o estoque atual durante a edição
   */
  preserveCurrentStock() {
    // Buscar o estoque atual do insumo sendo editado
    const cards = document.querySelectorAll(".card-ingrediente");
    for (const card of cards) {
      const cardId = parseInt(card.dataset.ingredientId);
      if (cardId === this.currentEditingId) {
        const quantidadeElement = card.querySelector(".quantidade");
        if (quantidadeElement) {
          const currentValue = parseFloat(
            quantidadeElement.textContent.split(" ")[0]
          );
          return currentValue || 0;
        }
        break;
      }
    }
    return 0;
  }

  /**
   * Atualiza cards de resumo
   */
  updateResumoCards(resumo) {
    const totalValueElement = document.getElementById("valor-total-estoque");
    const totalItensDescricaoElement = document.getElementById(
      "total-itens-descricao"
    );
    const outOfStockElement = document.getElementById("sem-estoque-count");
    const lowStockElement = document.getElementById("estoque-baixo-count");
    const inStockElement = document.getElementById("em-estoque-count");

    if (totalValueElement) {
      totalValueElement.textContent = `R$ ${resumo.total_stock_value
        .toFixed(2)
        .replace(".", ",")}`;
    }

    if (totalItensDescricaoElement) {
      const totalItens = resumo.total_items || 0;
      totalItensDescricaoElement.textContent = `${totalItens} ${
        totalItens === 1 ? "Item" : "Itens"
      }`;
    }

    if (outOfStockElement) {
      outOfStockElement.textContent = resumo.out_of_stock_count;
    }

    if (lowStockElement) {
      lowStockElement.textContent = resumo.low_stock_count;
    }

    if (inStockElement) {
      inStockElement.textContent = resumo.in_stock_count;
    }
  }

  /**
   * Obtém classe de status
   */
  getStatusClass(insumo) {
    if (insumo.atual === 0) return "sem-estoque";
    if (insumo.atual <= insumo.min) return "estoque-baixo";
    if (insumo.atual >= insumo.max) return "estoque-alto";
    return "em-estoque";
  }

  /**
   * Obtém texto de status
   */
  getStatusText(insumo) {
    if (insumo.atual === 0) return "Sem estoque";
    if (insumo.atual <= insumo.min) return "Estoque baixo";
    if (insumo.atual >= insumo.max) return "Estoque alto";
    return "Em estoque";
  }

  /**
   * Obtém ícone de status
   */
  getStatusIcon(insumo) {
    if (!insumo.ativo) return "fa-solid fa-eye-slash";
    if (insumo.atual === 0) return "fa-solid fa-ban";
    if (insumo.atual <= insumo.min) return "fa-solid fa-triangle-exclamation";
    if (insumo.atual >= insumo.max) return "fa-solid fa-arrow-up";
    return "fa-solid fa-check";
  }

  /**
   * Obtém nome da categoria
   */
  getCategoriaNome(categoria) {
    const mapping = {
      carnes: "Carnes",
      aves: "Aves",
      peixes: "Peixes",
      "frutos-do-mar": "Frutos do Mar",
      embutidos: "Embutidos",
      vegetais: "Vegetais",
      legumes: "Legumes",
      frutas: "Frutas",
      verduras: "Verduras",
      laticinios: "Laticínios",
      queijos: "Queijos",
      ovos: "Ovos",
      graos: "Grãos",
      cereais: "Cereais",
      leguminosas: "Leguminosas",
      temperos: "Temperos",
      especiarias: "Especiarias",
      ervas: "Ervas",
      condimentos: "Condimentos",
      molhos: "Molhos",
      oleos: "Óleos",
      vinagres: "Vinagres",
      bebidas: "Bebidas",
      sucos: "Sucos",
      refrigerantes: "Refrigerantes",
      cervejas: "Cervejas",
      vinhos: "Vinhos",
      licores: "Licores",
      doces: "Doces",
      sobremesas: "Sobremesas",
      chocolates: "Chocolates",
      acucares: "Açúcares",
      mel: "Mel",
      geleias: "Geleias",
      farinhas: "Farinhas",
      massa: "Massas",
      paes: "Pães",
      bolos: "Bolos",
      biscoitos: "Biscoitos",
      conservas: "Conservas",
      enlatados: "Enlatados",
      congelados: "Congelados",
      desidratados: "Desidratados",
      suplementos: "Suplementos",
      vitaminas: "Vitaminas",
      minerais: "Minerais",
      aditivos: "Aditivos",
      conservantes: "Conservantes",
      corantes: "Corantes",
      aromatizantes: "Aromatizantes",
      estabilizantes: "Estabilizantes",
      embalagens: "Embalagens",
      utensilios: "Utensílios",
      equipamentos: "Equipamentos",
      limpeza: "Limpeza",
      higiene: "Higiene",
      seguranca: "Segurança",
      outros: "Outros",
    };
    return mapping[categoria] || "Outros";
  }

  /**
   * Exibe mensagem de sucesso
   */
  showSuccessMessage(message) {
    showToast(message, { type: "success", title: "Sucesso" });
  }

  /**
   * Exibe mensagem de erro
   */
  showErrorMessage(message) {
    showToast(message, { type: "error", title: "Erro" });
  }

  /**
   * Trata erros da API de forma inteligente
   */
  handleApiError(error, operation = "") {
    // ALTERAÇÃO: Log condicional apenas em modo debug
    if (typeof window !== 'undefined' && window.DEBUG_MODE) {
      console.error(`Erro na operação ${operation}:`, error);
    }

    // Se o erro já tem uma mensagem tratada pelo sistema de alerts
    if (error.status && error.payload) {
      toastFromApiError(error);
      return;
    }

    // Tratamento específico para diferentes tipos de erro
    let title = "Erro";
    let message = "Ocorreu um erro inesperado.";

    // Tratamento específico por status HTTP
    if (error.status === 409) {
      title = "Nome Duplicado";
      message =
        "Já existe um ingrediente com este nome. Por favor, escolha um nome diferente.";
    } else if (error.status === 404) {
      if (operation.includes("excluir") || operation.includes("delete")) {
        title = "Insumo Não Encontrado";
        message =
          "O insumo que você está tentando excluir não foi encontrado. Ele pode já ter sido removido.";
      } else {
        title = "Item Não Encontrado";
        message = "O insumo solicitado não foi encontrado.";
      }
    } else if (error.status === 400) {
      title = "Dados Inválidos";
      message = "Verifique os dados informados e tente novamente.";
    } else if (error.status === 401) {
      title = "Sessão Expirada";
      message = "Sua sessão expirou. Faça login novamente.";
    } else if (error.status === 403) {
      title = "Acesso Negado";
      message = "Você não tem permissão para realizar esta operação.";
    } else if (error.status === 500) {
      title = "Erro do Servidor";
      message =
        "Ocorreu um erro interno no servidor. Tente novamente em alguns instantes.";
    } else if (error.message) {
      // Tratamento específico para violação de chave única (Firebird)
      if (
        error.message.includes(
          "violation of PRIMARY or UNIQUE KEY constraint"
        ) ||
        error.message.includes("INTEG_44") ||
        error.message.includes("SQLCODE: -803")
      ) {
        title = "Nome Duplicado";
        message =
          "Já existe um ingrediente com este nome. Por favor, escolha um nome diferente.";
      } else if (
        error.message.includes("não encontrado") ||
        error.message.includes("not found")
      ) {
        title = "Item Não Encontrado";
        message = "O insumo solicitado não foi encontrado.";
      } else if (
        error.message.includes("já existe") ||
        error.message.includes("already exists")
      ) {
        title = "Item Duplicado";
        message = "Já existe um insumo com este nome.";
      } else if (
        error.message.includes("validação") ||
        error.message.includes("validation")
      ) {
        title = "Dados Inválidos";
        message = "Verifique os dados informados e tente novamente.";
      } else if (
        error.message.includes("permissão") ||
        error.message.includes("permission")
      ) {
        title = "Acesso Negado";
        message = "Você não tem permissão para realizar esta operação.";
      } else if (
        error.message.includes("conexão") ||
        error.message.includes("connection")
      ) {
        title = "Problema de Conexão";
        message =
          "Não foi possível conectar ao servidor. Verifique sua conexão.";
      } else {
        // Usar a mensagem do erro se for específica
        message = error.message;
      }
    }

    showToast(message, { type: "error", title });
  }

  // ========================================
  // FUNÇÕES DE ATUALIZAÇÃO AUTOMÁTICA OTIMIZADA
  // ========================================

  /**
   * Adiciona novo insumo à UI
   */
  async addInsumoToUI(insumoData) {
    const container = document.querySelector("#secao-estoque .ingredientes");
    if (!container) {
      // ALTERAÇÃO: Log condicional apenas em modo debug
      if (typeof window !== 'undefined' && window.DEBUG_MODE) {
        console.error("Container de ingredientes não encontrado");
      }
      return;
    }

    // Validar se os dados são válidos antes de criar o card
    if (!insumoData || !insumoData.id) {
      // ALTERAÇÃO: Log condicional apenas em modo debug
      if (typeof window !== 'undefined' && window.DEBUG_MODE) {
        console.error("Dados do insumo inválidos:", insumoData);
      }
      throw new Error("Dados do insumo inválidos para criar card");
    }

    // Verificar se já existe um card com este ID (evitar duplicatas)
    const existingCard = container.querySelector(
      `[data-ingredient-id="${insumoData.id}"]`
    );
    if (existingCard) {
      // ALTERAÇÃO: Log condicional apenas em modo debug
      if (typeof window !== 'undefined' && window.DEBUG_MODE) {
        console.warn(
          `Card para insumo ID ${insumoData.id} já existe, não criando duplicata`
        );
      }
      return;
    }

    // Usar o ID real retornado pela API e garantir que todos os campos necessários existam
    const insumoWithId = {
      id: insumoData.id || insumoData.ID,
      nome: insumoData.name || insumoData.nome || "Nome não informado",
      categoria: insumoData.category || insumoData.categoria || "outros",
      custo: parseFloat(insumoData.price || insumoData.custo) || 0,
      preco_adicional:
        parseFloat(insumoData.additional_price || insumoData.preco_adicional) ||
        0,
      unidade: insumoData.stock_unit || insumoData.unidade || "un",
      // CORREÇÃO: Usar parseFloat para preservar decimais do estoque (ex: 17.000 kg)
      min: parseFloat(insumoData.min_stock_threshold || insumoData.min) || 0,
      max: parseFloat(insumoData.max_stock || insumoData.max) || 100,
      atual: parseFloat(insumoData.current_stock || insumoData.atual) || 0,
      ativo:
        insumoData.is_available !== undefined ? insumoData.is_available : true,
      fornecedor:
        insumoData.supplier || insumoData.fornecedor || "Não informado",
      quantidade_porcao:
        parseFloat(
          insumoData.base_portion_quantity || insumoData.quantidade_porcao
        ) || 1,
      unidade_porcao:
        insumoData.base_portion_unit || insumoData.unidade_porcao || "un",
      ultimaAtualizacao: null,
    };

    // Criando card para insumo

    // Criar e adicionar card
    const card = this.createInsumoCard(insumoWithId);
    container.appendChild(card);

    // Remover estado vazio se existir
    const emptyState = container.querySelector(".empty-state");
    if (emptyState) {
      emptyState.remove();
    }
  }

  /**
   * Atualiza insumo existente na UI
   */
  async updateInsumoInUI(insumoId, insumoData) {
    const card = document.querySelector(`[data-ingredient-id="${insumoId}"]`);
    if (!card) return;

    // Atualizar dados do card
    const nomeElement = card.querySelector("h3");
    const categoriaElement = card.querySelector(".categoria-fornecedor span");
    const fornecedorElement = card.querySelectorAll(
      ".categoria-fornecedor span"
    )[1];
    const custoElement = card.querySelector(".valor");
    const precoAdicionalElement = card.querySelector(
      ".info-adicional .info:nth-child(2) .valor"
    ); // Preço adicional
    const porcaoBaseElement = card.querySelector(".porcao-base .valor");

    if (nomeElement)
      nomeElement.textContent = insumoData.nome || "Nome não informado";
    if (categoriaElement)
      categoriaElement.textContent = this.getCategoriaNome(
        insumoData.categoria
      );
    if (fornecedorElement)
      fornecedorElement.textContent = insumoData.fornecedor || "Não informado";
    if (custoElement)
      custoElement.textContent = `R$ ${(insumoData.custo || 0)
        .toFixed(2)
        .replace(".", ",")}/${insumoData.unidade || "un"}`;
    if (precoAdicionalElement)
      precoAdicionalElement.textContent = `R$ ${(
        insumoData.preco_adicional || 0
      )
        .toFixed(2)
        .replace(".", ",")}`;
    if (porcaoBaseElement)
      porcaoBaseElement.textContent = `${(
        insumoData.quantidade_porcao || 1
      ).toFixed(1)} ${insumoData.unidade_porcao || "un"}`;

    // Atualizar limites
    const limitesElements = card.querySelectorAll(".limites span");
    if (limitesElements[0])
      limitesElements[0].textContent = `Min: ${this.formatStockValue(
        insumoData.min || 0
      )}`;
    if (limitesElements[1])
      limitesElements[1].textContent = `Max: ${this.formatStockValue(
        insumoData.max || 100
      )}`;

    // CORREÇÃO: Atualizar status visual do card
    const newStatusClass = this.getStatusClass(insumoData);
    const newStatusText = this.getStatusText(insumoData);

    // Remover classes de status antigas
    card.classList.remove(
      "sem-estoque",
      "estoque-baixo",
      "em-estoque",
      "estoque-alto"
    );
    // Adicionar nova classe de status
    card.classList.add(newStatusClass);

    // Atualizar texto de status
    const statusElement = card.querySelector(".tag-status");
    if (statusElement) {
      statusElement.className = `tag-status ${newStatusClass}`;
      statusElement.textContent = newStatusText;
    }

    // CORREÇÃO: Atualizar barra de progresso
    const progressElement = card.querySelector(".progresso");
    if (progressElement) {
      const progress = this.calculateProgress(insumoData);
      progressElement.style.width = `${progress}%`;
    }

    // Atualizar estado dos botões
    this.updateQuantityButtonsState(card);
  }

  /**
   * Remove insumo da UI
   */
  removeInsumoFromUI(insumoId) {
    const card = document.querySelector(`[data-ingredient-id="${insumoId}"]`);
    if (card) {
      card.remove();
    }

    // Verificar se precisa mostrar estado vazio
    const container = document.querySelector("#secao-estoque .ingredientes");
    const remainingCards = container.querySelectorAll(".card-ingrediente");

    if (remainingCards.length === 0) {
      container.innerHTML = `
                <div style="text-align: center; padding: 48px; color: #666;">
                    <i class="fa-solid fa-box-open" style="font-size: 48px; margin-bottom: 16px; opacity: 0.3;" aria-hidden="true"></i>
                    <p style="font-size: 16px;">Nenhum insumo encontrado</p>
                </div>
            `;
    }
  }

  /**
   * Atualiza toggle na UI
   */
  updateToggleInUI(card, novoStatus) {
    const statusTextElement = card.querySelector(".status-text span");
    const statusIcon = card.querySelector(".status-text i");
    const toggleContainer = card.querySelector(".toggle");
    const editarDiv = card.querySelector(".editar");
    const botoesQuantidade = card.querySelector(".botoes-quantidade");

    if (novoStatus) {
      // Ativar insumo
      if (statusTextElement) statusTextElement.textContent = "Ativo";
      if (statusIcon) statusIcon.className = "fa-solid fa-eye";
      if (statusTextElement)
        statusTextElement.parentElement.classList.remove("inactive");
      if (toggleContainer) toggleContainer.classList.add("active");

      // Adicionar controles de edição e quantidade se não existirem
      if (!editarDiv) {
        const controlesDiv = card.querySelector(".controles-ingrediente");
        if (controlesDiv) {
          const editarHtml = `
                        <div class="editar" title="Editar insumo">
                            <i class="fa-solid fa-edit"></i>
                        </div>
                    `;
          controlesDiv.insertAdjacentHTML("afterbegin", editarHtml);
        }
      }

      if (!botoesQuantidade) {
        const controleEstoque = card.querySelector(".controle-estoque");
        if (controleEstoque) {
          const botoesHtml = `
                        <div class="botoes-quantidade">
                            <button class="btn-editar-estoque" title="Editar estoque">
                                <i class="fa-solid fa-edit"></i>
                                <span>Editar Estoque</span>
                            </button>
                        </div>
                    `;
          controleEstoque.insertAdjacentHTML("beforeend", botoesHtml);
        }
      }
    } else {
      // Desativar insumo
      if (statusTextElement) statusTextElement.textContent = "Inativo";
      if (statusIcon) statusIcon.className = "fa-solid fa-eye-slash";
      if (statusTextElement)
        statusTextElement.parentElement.classList.add("inactive");
      if (toggleContainer) toggleContainer.classList.remove("active");

      // Remover controles de edição e quantidade
      if (editarDiv) editarDiv.remove();
      if (botoesQuantidade) botoesQuantidade.remove();
    }

    // Atualizar estado dos botões
    this.updateQuantityButtonsState(card);
  }

  /**
   * Extrai dados do insumo do card
   */
  extractInsumoDataFromCard(card) {
    if (!card) return null;

    try {
      const nome = card.querySelector("h3")?.textContent?.trim() || "";
      const quantidadeElement = card.querySelector(".quantidade");
      const custoElement = card.querySelector(".valor");

      // Validação mais robusta dos dados extraídos
      let quantidade = 0;
      if (quantidadeElement) {
        const quantidadeText = quantidadeElement.textContent.split(" ")[0];
        const parsedQuantidade = parseFloat(quantidadeText);
        quantidade = isNaN(parsedQuantidade)
          ? 0
          : Math.max(0, parsedQuantidade);
      }

      let custo = 0;
      if (custoElement) {
        const custoText = custoElement.textContent
          .replace("R$", "")
          .replace(",", ".")
          .trim();
        const parsedCusto = parseFloat(custoText);
        custo = isNaN(parsedCusto) ? 0 : Math.max(0, parsedCusto);
      }

      // Sanitização mais robusta
      return {
        nome: nome.substring(0, 100).replace(/[<>]/g, ""), // Limitar tamanho e remover HTML
        quantidade: quantidade,
        custo: custo,
      };
    } catch (error) {
      // ALTERAÇÃO: Log condicional apenas em modo debug
      if (typeof window !== 'undefined' && window.DEBUG_MODE) {
        console.error("Erro ao extrair dados do card:", error);
      }
      return null;
    }
  }

  /**
   * Atualiza resumo após adicionar insumo
   */
  async updateResumoAfterAdd(insumoData) {
    try {
      // Atualizar contador de itens
      const totalItensElement = document.getElementById(
        "total-itens-descricao"
      );
      if (totalItensElement) {
        const currentCount =
          parseInt(totalItensElement.textContent.split(" ")[0]) || 0;
        const newCount = currentCount + 1;
        totalItensElement.textContent = `${newCount} ${
          newCount === 1 ? "Item" : "Itens"
        }`;
      }

      // Atualizar valor total (novo insumo começa com estoque 0, então não afeta valor)
      // Mas podemos atualizar o contador de itens em estoque
      const inStockElement = document.getElementById("em-estoque-count");
      if (inStockElement && insumoData.atual && insumoData.atual > 0) {
        const currentCount = parseInt(inStockElement.textContent) || 0;
        inStockElement.textContent = currentCount + 1;
      }
    } catch (error) {
      // ALTERAÇÃO: Log condicional apenas em modo debug
      if (typeof window !== 'undefined' && window.DEBUG_MODE) {
        console.error("Erro ao atualizar resumo após adicionar:", error);
      }
      // Fallback: recarregar resumo completo
      await this.loadResumoEstoque();
    }
  }

  /**
   * Atualiza resumo após editar insumo
   */
  async updateResumoAfterEdit(insumoData) {
    try {
      // Para edição, geralmente não precisamos atualizar contadores
      // Apenas o valor total se o custo mudou
      // Esta função pode ser expandida conforme necessário
    } catch (error) {
      // ALTERAÇÃO: Log condicional apenas em modo debug
      if (typeof window !== 'undefined' && window.DEBUG_MODE) {
        console.error("Erro ao atualizar resumo após editar:", error);
      }
      await this.loadResumoEstoque();
    }
  }

  /**
   * Atualiza resumo após excluir insumo
   */
  async updateResumoAfterDelete(insumoData) {
    try {
      if (!insumoData) return;

      // Atualizar contador de itens
      const totalItensElement = document.getElementById(
        "total-itens-descricao"
      );
      if (totalItensElement) {
        const currentCount =
          parseInt(totalItensElement.textContent.split(" ")[0]) || 0;
        const newCount = Math.max(0, currentCount - 1);
        totalItensElement.textContent = `${newCount} ${
          newCount === 1 ? "Item" : "Itens"
        }`;
      }

      // Atualizar valor total (remover valor do insumo excluído)
      const totalValueElement = document.getElementById("valor-total-estoque");
      if (
        totalValueElement &&
        insumoData.quantidade &&
        insumoData.custo &&
        typeof insumoData.quantidade === "number" &&
        typeof insumoData.custo === "number"
      ) {
        const currentValue = parseFloat(
          totalValueElement.textContent
            .replace("R$", "")
            .replace(",", ".")
            .trim()
        );
        const removedValue = insumoData.quantidade * insumoData.custo;
        const newValue = Math.max(0, currentValue - removedValue);
        totalValueElement.textContent = `R$ ${newValue
          .toFixed(2)
          .replace(".", ",")}`;
      }

      // Atualizar contadores de status
      const inStockElement = document.getElementById("em-estoque-count");
      const lowStockElement = document.getElementById("estoque-baixo-count");
      const outOfStockElement = document.getElementById("sem-estoque-count");

      if (insumoData.quantidade > 0) {
        if (inStockElement) {
          const currentCount = parseInt(inStockElement.textContent) || 0;
          inStockElement.textContent = Math.max(0, currentCount - 1);
        }
      } else {
        if (outOfStockElement) {
          const currentCount = parseInt(outOfStockElement.textContent) || 0;
          outOfStockElement.textContent = Math.max(0, currentCount - 1);
        }
      }
    } catch (error) {
      // ALTERAÇÃO: Log condicional apenas em modo debug
      if (typeof window !== 'undefined' && window.DEBUG_MODE) {
        console.error("Erro ao atualizar resumo após excluir:", error);
      }
      await this.loadResumoEstoque();
    }
  }

  /**
   * Atualiza resumo após toggle
   */
  async updateResumoAfterToggle(novoStatus) {
    try {
      // Para toggle, geralmente não precisamos atualizar contadores
      // Pois o insumo continua existindo, apenas muda o status
      // Esta função pode ser expandida conforme necessário
    } catch (error) {
      // ALTERAÇÃO: Log condicional apenas em modo debug
      if (typeof window !== 'undefined' && window.DEBUG_MODE) {
        console.error("Erro ao atualizar resumo após toggle:", error);
      }
      await this.loadResumoEstoque();
    }
  }
}

// Exporta a classe principal
export { InsumoManager };
