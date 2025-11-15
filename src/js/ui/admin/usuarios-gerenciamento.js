/**
 * Módulo de Gerenciamento de Usuários
 * Responsável por todas as operações relacionadas a funcionários/usuários
 */

import {
  createUser,
  updateUser,
  getUsers,
  getUserById,
  updateUserStatus,
} from "../../api/user.js";

import { showToast } from "../alerts.js";

import { debounce } from "../../utils/performance-utils.js";
import { renderListInChunks } from "../../utils/virtual-scroll.js";
import { escapeHTML } from "../../utils/html-sanitizer.js";
import { normalizePaginationResponse, getItemsFromResponse, getPaginationFromResponse } from "../../utils/pagination-utils.js";
import { showLoadingOverlay, hideLoadingOverlay } from "../../utils/loading-indicator.js";
import {
  validateEmail,
  validatePhone,
  validateBirthDate,
  validatePassword,
  applyFieldValidation,
} from "../../utils/validators.js";

// Constantes de configuração
const CACHE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutos
const DAYS_PER_MONTH = 30;
const DAYS_PER_YEAR = 365;
const MAX_INICIAIS_LENGTH = 2;

/**
 * Gerenciador de dados de usuários
 */
class UsuarioDataManager {
  constructor() {
    this.cache = {
      data: null,
      lastFetch: null,
    };
    this.cacheTimeout = CACHE_TIMEOUT_MS;
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
   * Busca todos os usuários
   * ALTERAÇÃO: Agora retorna resposta completa com paginação ao invés de apenas array de usuários
   */
  async getAllUsuarios(options = {}) {
    try {
      // ALTERAÇÃO: Não usar cache quando há filtros/paginação ativos
      if (this.isCacheValid() && !options.forceRefresh && !options.page && !options.search && !options.role && options.status === undefined) {
        return this.cache.data;
      }

      const response = await getUsers(options);

      // ALTERAÇÃO: Retornar resposta completa com paginação
      // A API pode retornar {users: [...], pagination: {...}} ou formato legado
      let result;
      if (response && (response.users || response.items)) {
        // Formato com paginação
        result = {
          users: response.users || response.items || [],
          pagination: response.pagination || null
        };
      } else if (Array.isArray(response)) {
        // Formato legado: array direto
        result = {
          users: response,
          pagination: null
        };
      } else {
        // ALTERAÇÃO: Log condicional apenas em modo debug
        if (typeof window !== 'undefined' && window.DEBUG_MODE) {
          console.warn("Formato de resposta inesperado da API:", response);
        }
        result = {
          users: [],
          pagination: null
        };
      }

      // ALTERAÇÃO: Só cachear se não houver filtros/paginação
      if (!options.page && !options.search && !options.role && options.status === undefined) {
        this.cache.data = result;
        this.cache.lastFetch = Date.now();
      }

      return result;
    } catch (error) {
      // ALTERAÇÃO: Log condicional apenas em modo debug
      if (typeof window !== 'undefined' && window.DEBUG_MODE) {
        console.error("Erro ao buscar usuários:", error);
      }
      throw error;
    }
  }

  /**
   * Busca usuário por ID
   */
  async getUsuarioById(id) {
    try {
      if (!id) {
        throw new Error("ID do usuário é obrigatório");
      }

      const usuario = await getUserById(id);

      if (!usuario) {
        throw new Error(`Usuário com ID ${id} não encontrado`);
      }

      if (!usuario.full_name || !usuario.email) {
        throw new Error("Dados do usuário estão incompletos");
      }

      const usuarioMapeado = {
        id: usuario.id,
        nome: usuario.full_name,
        email: usuario.email,
        cargo: this.mapRoleToCargo(usuario.role),
        telefone: usuario.phone || "",
        cpf: usuario.cpf || "",
        ativo: usuario.is_active !== undefined ? usuario.is_active : true,
        dataCriacao:
          usuario.created_at || new Date().toISOString().split("T")[0],
        ultimaAtualizacao:
          usuario.updated_at || new Date().toISOString().split("T")[0],
        full_name: usuario.full_name,
        role: usuario.role,
        phone: usuario.phone,
        date_of_birth: usuario.date_of_birth,
        nascimento: usuario.date_of_birth,
        senha: "", // Sempre vazio para edição
        confirmarSenha: "", // Sempre vazio para edição
      };

      return usuarioMapeado;
    } catch (error) {
      // ALTERAÇÃO: Log condicional apenas em modo debug
      if (typeof window !== 'undefined' && window.DEBUG_MODE) {
        console.error(`Erro ao buscar usuário (ID: ${id}):`, error.message);
      }
      throw new Error(`Falha ao carregar dados do usuário: ${error.message}`);
    }
  }

  /**
   * Adiciona novo usuário
   */
  async addUsuario(usuarioData) {
    try {
      const fullName = usuarioData.full_name || usuarioData.nome;
      const email = usuarioData.email;
      const password = usuarioData.password || usuarioData.senha;
      const role = usuarioData.role || usuarioData.cargo;

      if (!fullName || !email || !password) {
        throw new Error("Nome, email e senha são obrigatórios");
      }

      // Se role já está em inglês (admin, manager, etc.), usa direto. Senão, mapeia.
      const mappedRole = [
        "admin",
        "manager",
        "attendant",
        "delivery",
        "customer",
      ].includes(role)
        ? role
        : this.mapCargoToRole(role);

      // Converter data de YYYY-MM-DD para DD-MM-YYYY se necessário
      let dateOfBirth =
        usuarioData.date_of_birth || usuarioData.dataNascimento || null;
      if (dateOfBirth && dateOfBirth.includes("-")) {
        const parts = dateOfBirth.split("-");
        if (parts.length === 3 && parts[0].length === 4) {
          // Formato YYYY-MM-DD -> DD-MM-YYYY
          dateOfBirth = `${parts[2]}-${parts[1]}-${parts[0]}`;
        }
      }

      const apiData = {
        full_name: fullName,
        email: email,
        password: password,
        role: mappedRole,
        phone: usuarioData.phone || usuarioData.telefone || "",
        date_of_birth: dateOfBirth,
      };

      await createUser(apiData);
      this.clearCache();
    } catch (error) {
      // ALTERAÇÃO: Log condicional apenas em modo debug
      if (typeof window !== 'undefined' && window.DEBUG_MODE) {
        console.error("Erro ao adicionar usuário:", error);
      }
      throw error;
    }
  }

  /**
   * Atualiza usuário
   */
  async updateUsuario(id, usuarioData) {
    try {
      const role = usuarioData.role || usuarioData.cargo;

      // Se role já está em inglês (admin, manager, etc.), usa direto. Senão, mapeia.
      const mappedRole = [
        "admin",
        "manager",
        "attendant",
        "delivery",
        "customer",
      ].includes(role)
        ? role
        : this.mapCargoToRole(role);

      // Converter data de YYYY-MM-DD para DD-MM-YYYY se necessário
      let dateOfBirth =
        usuarioData.date_of_birth || usuarioData.dataNascimento || null;
      if (dateOfBirth && dateOfBirth.includes("-")) {
        const parts = dateOfBirth.split("-");
        if (parts.length === 3 && parts[0].length === 4) {
          // Formato YYYY-MM-DD -> DD-MM-YYYY
          dateOfBirth = `${parts[2]}-${parts[1]}-${parts[0]}`;
        }
      }

      const apiData = {
        full_name: usuarioData.full_name || usuarioData.nome,
        email: usuarioData.email,
        role: mappedRole,
        phone: usuarioData.phone || usuarioData.telefone || "",
        date_of_birth: dateOfBirth,
      };

      // Incluir senha apenas se fornecida
      const password = usuarioData.password || usuarioData.senha;
      if (password && password.trim()) {
        apiData.password = password;
      }

      await updateUser(id, apiData);
      this.clearCache();
    } catch (error) {
      // ALTERAÇÃO: Log condicional apenas em modo debug
      if (typeof window !== 'undefined' && window.DEBUG_MODE) {
        console.error("Erro ao atualizar usuário:", error);
      }
      throw error;
    }
  }

  /**
   * Alterna status do usuário
   */
  async toggleUsuarioStatus(id, novoStatus) {
    try {
      await updateUserStatus(id, novoStatus);
      this.clearCache();
    } catch (error) {
      // ALTERAÇÃO: Log condicional apenas em modo debug
      if (typeof window !== 'undefined' && window.DEBUG_MODE) {
        console.error("Erro ao alterar status do usuário:", error);
      }
      throw error;
    }
  }

  /**
   * Mapeia cargo para role
   */
  mapCargoToRole(cargo) {
    const mapping = {
      admin: "admin",
      gerente: "manager",
      atendente: "attendant",
      entregador: "delivery",
      cliente: "customer",
    };
    return mapping[cargo] || "attendant";
  }

  /**
   * Mapeia role da API para cargo do formulário HTML
   */
  mapRoleToCargo(role) {
    const mapping = {
      admin: "admin",
      manager: "gerente",
      attendant: "atendente",
      delivery: "entregador",
      customer: "cliente",
    };
    return mapping[role] || "atendente";
  }
}

/**
 * Gerenciador de interface de usuários
 */
class UsuarioManager {
  constructor() {
    this.dataManager = new UsuarioDataManager();
    this.currentEditingId = null;
    this.usuariosSelecionados = new Set();
    this.isSubmitting = false;
    this.domCache = new Map();
    this.lastOperation = 0;
    this.minOperationInterval = 1000; // 1 segundo entre operações
    // ALTERAÇÃO: Estado de paginação adicionado
    this.currentPage = 1;
    this.pageSize = 20;
    this.totalPages = 1;
    this.totalItems = 0;
    this.currentSearchTerm = "";
    this.currentCargoFilter = "";
    this.currentStatusFilter = "";
    this.isLoading = false;
  }

  /**
   * Cache de elementos DOM para performance
   * @param {string} selector - Seletor CSS
   * @returns {Element|null} Elemento em cache ou null
   */
  getCachedElement(selector) {
    if (!this.domCache.has(selector)) {
      const element = document.querySelector(selector);
      this.domCache.set(selector, element);
    }
    return this.domCache.get(selector);
  }

  /**
   * Limpa cache DOM
   */
  clearDomCache() {
    this.domCache.clear();
  }

  /**
   * Verifica se operação pode ser executada (rate limiting)
   * @param {string} operation - Nome da operação
   * @returns {boolean} True se pode executar
   */
  canExecuteOperation(operation = "default") {
    const now = Date.now();
    const timeSinceLastOp = now - this.lastOperation;

    if (timeSinceLastOp < this.minOperationInterval) {
      // ALTERAÇÃO: Log condicional apenas em modo debug
      if (typeof window !== 'undefined' && window.DEBUG_MODE) {
        console.warn(
          `Rate limit: ${operation} bloqueada. Aguarde ${Math.ceil(
            (this.minOperationInterval - timeSinceLastOp) / 1000
          )}s`
        );
      }
      return false;
    }

    this.lastOperation = now;
    return true;
  }

  /**
   * Sanitiza string para prevenir XSS
   * @deprecated Use escapeHTML de html-sanitizer.js ao invés disso
   * @param {string} str - String a ser sanitizada
   * @returns {string} String segura para innerHTML
   */
  sanitizeHTML(str) {
    // Delegar para o módulo centralizado
    return escapeHTML(str);
  }

  /**
   * Inicializa o módulo
   */
  async init() {
    try {
      await this.loadUsuarios();
      this.setupEventListeners();
    } catch (error) {
      // ALTERAÇÃO: Log condicional apenas em modo debug
      if (typeof window !== 'undefined' && window.DEBUG_MODE) {
        console.error("Erro ao inicializar módulo de usuários:", error);
      }
      this.showErrorMessage("Erro ao carregar dados dos usuários");
    }
  }

  /**
   * Configura event listeners
   */
  setupEventListeners() {
    this.setupUsuarioHandlers();
    this.setupFilterHandlers();
    this.setupSearchHandlers();
  }

  /**
   * Configura handlers específicos de usuários
   */
  setupUsuarioHandlers() {
    const section = document.getElementById("secao-funcionarios");

    if (!section) {
      // ALTERAÇÃO: Log condicional apenas em modo debug
      if (typeof window !== 'undefined' && window.DEBUG_MODE) {
        console.error("Seção de funcionários não encontrada!");
      }
      return;
    }

    // Event delegation para botões de editar
    section.addEventListener("click", (e) => {
      const editButton = e.target.closest(".editar");
      if (editButton) {
        e.preventDefault();
        e.stopPropagation();
        this.handleEditClick(editButton);
      }
    });

    // Event delegation para toggles
    section.addEventListener("change", (e) => {
      if (e.target.matches('.toggle input[type="checkbox"]')) {
        this.handleToggleChange(e.target);
      }
    });

    // Event delegation para métricas
    section.addEventListener("click", (e) => {
      if (e.target.matches(".metricas-link")) {
        this.handleMetricsClick(e.target);
      }
    });

    // Botão "Novo usuário"
    const btnNovoUsuario = section.querySelector(".adicionar");

    if (btnNovoUsuario) {
      btnNovoUsuario.addEventListener("click", () => {
        this.openUsuarioModal();
      });
    }

    // Modal de métricas - botão fechar
    this.setupMetricasModalListeners();
  }

  /**
   * Configura listeners da modal de métricas
   */
  setupMetricasModalListeners() {
    const modal = document.getElementById("modal-metricas");
    if (!modal) return;

    // Botão X do header
    const btnFecharHeader = modal.querySelector(".fechar-modal");
    if (btnFecharHeader) {
      btnFecharHeader.addEventListener("click", () => {
        this.closeMetricasModal();
      });
    }

    // Botão Fechar do footer
    const btnFecharFooter = document.getElementById("fechar-metricas");
    if (btnFecharFooter) {
      btnFecharFooter.addEventListener("click", () => {
        this.closeMetricasModal();
      });
    }

    // Clicar no overlay
    const overlay = modal.querySelector(".div-overlay");
    if (overlay) {
      overlay.addEventListener("click", () => {
        this.closeMetricasModal();
      });
    }
  }

  /**
   * Configura handlers de filtros
   * ALTERAÇÃO: Agora recarrega da API ao invés de filtrar localmente
   */
  setupFilterHandlers() {
    const cargoFilter = document.getElementById("cargo-filtro");
    const statusFilter = document.getElementById("status-funcionario");

    if (cargoFilter) {
      cargoFilter.addEventListener("change", async (e) => {
        this.currentCargoFilter = cargoFilter.value || "";
        this.currentPage = 1; // Resetar para primeira página ao filtrar
        await this.loadUsuarios(); // Recarregar da API
      });
    }

    if (statusFilter) {
      statusFilter.addEventListener("change", async (e) => {
        this.currentStatusFilter = statusFilter.value || "";
        this.currentPage = 1; // Resetar para primeira página ao filtrar
        await this.loadUsuarios(); // Recarregar da API
      });
    }
  }

  /**
   * Configura handlers de busca
   * ALTERAÇÃO: Agora recarrega da API ao invés de filtrar localmente
   */
  setupSearchHandlers() {
    const searchInput = document.getElementById("busca-funcionario");
    if (searchInput) {
      const debouncedSearch = debounce(async () => {
        this.currentSearchTerm = searchInput.value.trim();
        this.currentPage = 1; // Resetar para primeira página ao buscar
        await this.loadUsuarios(); // Recarregar da API
      }, 500);

      searchInput.addEventListener("input", (e) => {
        debouncedSearch();
      });
    }
  }

  /**
   * Carrega usuários
   * ALTERAÇÃO: Agora usa paginação e filtros na API ao invés de filtragem local
   */
  async loadUsuarios() {
    if (this.isLoading) return; // Evitar múltiplas requisições simultâneas
    
    try {
      this.isLoading = true;
      
      // ALTERAÇÃO: Mostrar indicador de carregamento
      showLoadingOverlay('#secao-funcionarios .funcionarios', 'usuarios-loading', 'Carregando usuários...');
      
      // ALTERAÇÃO: Preparar opções de paginação e filtros para enviar à API
      const options = {
        page: this.currentPage,
        limit: this.pageSize, // API usa 'limit' ao invés de 'page_size'
      };

      // Adicionar busca se houver termo de busca
      if (this.currentSearchTerm) {
        options.search = this.currentSearchTerm;
      }

      // Adicionar filtro de cargo se houver
      if (this.currentCargoFilter && this.currentCargoFilter !== "") {
        // Mapear cargo do frontend para role da API
        const cargoMap = {
          'atendente': 'attendant',
          'gerente': 'manager',
          'entregador': 'delivery',
          'admin': 'admin',
          'cliente': 'customer'
        };
        const role = cargoMap[this.currentCargoFilter] || this.currentCargoFilter;
        if (role) {
          options.role = role;
        }
      }

      // Adicionar filtro de status se houver
      if (this.currentStatusFilter && this.currentStatusFilter !== "") {
        options.status = this.currentStatusFilter === "ativo";
      }

      const response = await this.dataManager.getAllUsuarios(options);
      
      // ALTERAÇÃO: Usar normalizador de paginação para garantir compatibilidade
      // O dataManager retorna { users: [...], pagination: {...} } ou formato legado
      const normalizedResponse = normalizePaginationResponse(response, 'users');
      let usuarios = getItemsFromResponse(normalizedResponse);
      const paginationInfo = getPaginationFromResponse(normalizedResponse);
      
      // ALTERAÇÃO: Atualizar informações de paginação usando dados normalizados
      this.totalPages = paginationInfo.total_pages || 1;
      this.totalItems = paginationInfo.total || 0;

      await this.renderUsuarioCards(usuarios);
      this.renderPagination(); // ALTERAÇÃO: Renderizar paginação
      this.updateVisibleUsersCount(); // ALTERAÇÃO: Atualizar contador com totalItems
      // Não precisa mais aplicar filtros locais - tudo é filtrado pela API
    } catch (error) {
      // ALTERAÇÃO: Log condicional apenas em modo debug
      if (typeof window !== 'undefined' && window.DEBUG_MODE) {
        console.error("Erro ao carregar usuários:", error);
      }
      this.showErrorMessage("Erro ao carregar usuários");
    } finally {
      this.isLoading = false;
      // ALTERAÇÃO: Esconder indicador de carregamento
      hideLoadingOverlay('usuarios-loading');
    }
  }

  /**
   * Renderiza cards de usuários
   */
  async renderUsuarioCards(usuarios) {
    const container = document.querySelector(
      "#secao-funcionarios .funcionarios"
    );
    if (!container) return;

    container.innerHTML = "";

    if (!usuarios || usuarios.length === 0) {
      container.innerHTML = `
                <div style="text-align: center; padding: 48px; color: #666;">
                    <i class="fa-solid fa-users" style="font-size: 48px; margin-bottom: 16px; opacity: 0.3;" aria-hidden="true"></i>
                    <p style="font-size: 16px;">Nenhum usuário encontrado</p>
                </div>
            `;
      return;
    }

    const THRESHOLD_FOR_INCREMENTAL = 50;
    if (usuarios.length > THRESHOLD_FOR_INCREMENTAL) {
      // Renderização incremental em chunks
      await renderListInChunks(
        container,
        usuarios,
        (usuario) => {
          const card = this.createUsuarioCard(usuario);
          return card.outerHTML;
        },
        {
          chunkSize: 20,
          delay: 0,
          onProgress: (rendered, total) => {
            // Callback de progresso opcional (pode mostrar loading indicator)
          },
        }
      );
    } else {
      // Para listas menores, usar renderização direta (mais simples)
      usuarios.forEach((usuario) => {
        const card = this.createUsuarioCard(usuario);
        container.appendChild(card);
      });
    }
  }

  /**
   * Cria card de usuário
   */
  createUsuarioCard(usuario) {
    const card = document.createElement("div");
    card.className = "card-funcionario";
    card.dataset.funcionarioId = usuario.id;

    // Validação e sanitização dos dados (XSS Protection)
    const nome = escapeHTML(
      usuario.nome || usuario.full_name || "Nome não informado"
    );
    const email = escapeHTML(usuario.email || "Email não informado");
    const telefone = escapeHTML(usuario.telefone || usuario.phone || "");
    const cpf = escapeHTML(usuario.cpf || "");
    // Usar o role da API (em inglês) diretamente
    const roleAPI = usuario.role || usuario.cargo || "attendant";
    const ativo =
      usuario.ativo !== undefined
        ? usuario.ativo
        : usuario.is_active !== undefined
        ? usuario.is_active
        : true;

    const statusClass = ativo ? "ativo" : "inativo";
    const statusText = ativo ? "Ativo" : "Inativo";
    const cargoText = escapeHTML(this.getCargoText(roleAPI));
    const cargoClass = this.getCargoClass(roleAPI);

    card.innerHTML = `
            <div class="header-card">
                <div class="info-principal">
                    <h3 class="nome-funcionario">${nome}</h3>
                    <div class="email">
                        <i class="fa-solid fa-envelope"></i>
                        <span>${email}</span>
                    </div>
                    <span class="cargo ${cargoClass}">${cargoText}</span>
                </div>
                
                <div class="controles-header">
                    <button class="btn-editar editar" title="Editar usuário">
                        <i class="fa-solid fa-edit"></i>
                    </button>
                    
                    <div class="toggle-container">
                        <div class="toggle ${ativo ? "active" : ""}">
                            <input type="checkbox" ${ativo ? "checked" : ""}>
                            <span class="toggle-slider"></span>
                        </div>
                        <div class="status-text ${ativo ? "" : "inactive"}">
                            <i class="fa-solid ${
                              ativo ? "fa-eye" : "fa-eye-slash"
                            }"></i>
                            <span>${ativo ? "Ativo" : "Inativo"}</span>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="footer-card">
                <a href="#" class="link-metricas metricas-link">
                    Exibir métricas
                </a>
            </div>
        `;

    return card;
  }

  /**
   * Trata clique no botão de editar
   */
  async handleEditClick(button) {
    const card = button.closest(".card-funcionario");

    if (!card) {
      // ALTERAÇÃO: Log condicional apenas em modo debug
      if (typeof window !== 'undefined' && window.DEBUG_MODE) {
        console.error("Card não encontrado!");
      }
      return;
    }

    const usuarioId = parseInt(card.dataset.funcionarioId);

    try {
      const usuario = await this.dataManager.getUsuarioById(usuarioId);

      if (usuario) {
        this.currentEditingId = usuarioId;
        this.openUsuarioModal(usuario);
      } else {
        // ALTERAÇÃO: Log condicional apenas em modo debug
        if (typeof window !== 'undefined' && window.DEBUG_MODE) {
          console.error("Usuário não encontrado!");
        }
      }
    } catch (error) {
      // ALTERAÇÃO: Log condicional apenas em modo debug
      if (typeof window !== 'undefined' && window.DEBUG_MODE) {
        console.error("Erro ao buscar usuário para edição:", error);
      }
      this.showErrorMessage("Erro ao carregar dados do usuário");
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

    const card = toggle.closest(".card-funcionario");
    const usuarioId = parseInt(card.dataset.funcionarioId);
    const novoStatus = toggle.checked;

    try {
      await this.dataManager.toggleUsuarioStatus(usuarioId, novoStatus);

      // ✅ CORREÇÃO: Usar os elementos que realmente existem no HTML
      const statusTextElement = card.querySelector(".status-text span");
      const statusIcon = card.querySelector(".status-text i");
      const toggleContainer = card.querySelector(".toggle");

      if (novoStatus) {
        // Ativar usuário
        if (statusTextElement) statusTextElement.textContent = "Ativo";
        if (statusIcon) statusIcon.className = "fa-solid fa-eye";
        if (statusTextElement)
          statusTextElement.parentElement.classList.remove("inactive");
        if (toggleContainer) toggleContainer.classList.add("active");
      } else {
        // Desativar usuário
        if (statusTextElement) statusTextElement.textContent = "Inativo";
        if (statusIcon) statusIcon.className = "fa-solid fa-eye-slash";
        if (statusTextElement)
          statusTextElement.parentElement.classList.add("inactive");
        if (toggleContainer) toggleContainer.classList.remove("active");
      }

      this.showSuccessMessage(
        `Usuário ${novoStatus ? "ativado" : "desativado"} com sucesso!`
      );
    } catch (error) {
      // ALTERAÇÃO: Log condicional apenas em modo debug
      if (typeof window !== 'undefined' && window.DEBUG_MODE) {
        console.error("Erro ao alterar status do usuário:", error);
      }
      this.showErrorMessage("Erro ao alterar status do usuário");

      // Reverter toggle
      toggle.checked = !novoStatus;
    }
  }

  /**
   * Trata clique em métricas
   */
  async handleMetricsClick(link) {
    const card = link.closest(".card-funcionario");
    const usuarioId = parseInt(card.dataset.funcionarioId);

    try {
      const usuario = await this.dataManager.getUsuarioById(usuarioId);
      this.openMetricasModal(usuario);
    } catch (error) {
      // ALTERAÇÃO: Log condicional apenas em modo debug
      if (typeof window !== 'undefined' && window.DEBUG_MODE) {
        console.error("Erro ao abrir métricas:", error);
      }
      this.showErrorMessage("Erro ao carregar métricas do usuário");
    }
  }

  /**
   * Aplica todos os filtros simultaneamente
   * ALTERAÇÃO: Agora apenas reseta a página e recarrega da API (filtros são feitos no backend)
   */
  applyAllFilters() {
    // ALTERAÇÃO: Resetar para primeira página ao aplicar filtros
    this.currentPage = 1;
    // Recarregar usuários da API com os novos filtros
    this.loadUsuarios();
  }

  /**
   * Verifica se o card corresponde ao filtro de busca
   */
  checkSearchFilter(card, searchTerm) {
    if (!searchTerm) return true;

    const nome = card.querySelector("h3")?.textContent?.toLowerCase() || "";
    const email =
      card.querySelector(".email span")?.textContent?.toLowerCase() || "";

    return nome.includes(searchTerm) || email.includes(searchTerm);
  }

  /**
   * Verifica se o card corresponde ao filtro de cargo
   */
  checkCargoFilter(card, cargo) {
    if (!cargo || cargo === "todos") return true;

    const cardCargo =
      card.querySelector(".cargo")?.textContent?.toLowerCase() || "";
    return cardCargo.includes(cargo.toLowerCase());
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
   * Atualiza contador de usuários visíveis
   * ALTERAÇÃO: Agora usa totalItems da paginação ao invés de contar cards visíveis
   */
  updateVisibleUsersCount() {
    const count = this.totalItems;
    const counterElement = document.getElementById(
      "contador-usuarios-visiveis"
    );
    if (counterElement) {
      counterElement.textContent = `${count} usuário${count !== 1 ? "s" : ""}`;
    }
    
    // Atualizar contador de funcionários também
    const countElement = document.querySelector("#contador-funcionarios");
    if (countElement) {
      countElement.textContent = `${count} funcionário${count !== 1 ? "s" : ""}`;
    }
  }

  /**
   * Abre modal de usuário
   */
  openUsuarioModal(usuarioData = null) {
    const modal = document.getElementById("modal-funcionario");
    const titulo = document.getElementById("titulo-modal-funcionario");
    const btnSalvar = document.getElementById("salvar-funcionario");

    if (!modal) {
      // ALTERAÇÃO: Log condicional apenas em modo debug
      if (typeof window !== 'undefined' && window.DEBUG_MODE) {
        console.error("Modal não encontrada!");
      }
      return;
    }

    if (usuarioData) {
      if (titulo) titulo.textContent = "Editar usuário";
      if (btnSalvar)
        btnSalvar.innerHTML = '<i class="fa-solid fa-save"></i> Salvar';
      this.populateUsuarioForm(usuarioData);
    } else {
      if (titulo) titulo.textContent = "Adicionar novo usuário";
      if (btnSalvar)
        btnSalvar.innerHTML = '<i class="fa-solid fa-plus"></i> Adicionar';
      this.clearUsuarioForm();
    }

    // Usar o sistema universal de modais se disponível
    if (window.abrirModal) {
      window.abrirModal("modal-funcionario");
    } else {
      modal.style.display = "flex";
      document.body.style.overflow = "hidden";
    }

    this.setupUsuarioModalListeners(usuarioData);
  }

  /**
   * Fecha modal de usuário
   */
  closeUsuarioModal() {
    const modal = document.getElementById("modal-funcionario");
    if (modal) {
      // Usar o sistema universal de modais
      if (window.fecharModal) {
        window.fecharModal("modal-funcionario");
      } else {
        modal.style.display = "none";
        document.body.style.overflow = "auto";
      }
    }
    this.currentEditingId = null;
  }

  /**
   * Popula formulário de usuário
   */
  populateUsuarioForm(usuarioData) {
    // Mapear dados da API para os campos do formulário
    const nome = usuarioData.nome || usuarioData.full_name || "";
    const email = usuarioData.email || "";
    const telefone = usuarioData.telefone || usuarioData.phone || "";
    const cargo = usuarioData.cargo || usuarioData.role || "";
    const dataNascimento =
      usuarioData.date_of_birth || usuarioData.nascimento || "";

    // Preencher campos básicos
    const nomeField = document.getElementById("nome-funcionario");
    const emailField = document.getElementById("email-funcionario");
    const telefoneField = document.getElementById("telefone-funcionario");
    const cargoField = document.getElementById("cargo-funcionario");
    const nascimentoField = document.getElementById("nascimento-funcionario");

    if (nomeField) nomeField.value = nome;
    if (emailField) emailField.value = email;
    if (telefoneField) telefoneField.value = telefone;
    if (cargoField) cargoField.value = cargo;

    // Data de nascimento - garantir que está no formato correto
    if (nascimentoField && dataNascimento) {
      // Se a data está no formato DD-MM-YYYY, converter para YYYY-MM-DD
      let dataFormatada = dataNascimento;
      if (
        dataNascimento.includes("-") &&
        dataNascimento.split("-")[0].length === 2
      ) {
        const partes = dataNascimento.split("-");
        dataFormatada = `${partes[2]}-${partes[1]}-${partes[0]}`;
      }
      nascimentoField.value = dataFormatada;
    }

    // Campos de senha - ocultar para edição
    const camposSenha = document.getElementById("campos-senha");
    if (camposSenha) {
      camposSenha.style.display = "none";
    }

    const senhaField = document.getElementById("senha-funcionario");
    const confirmarSenhaField = document.getElementById(
      "confirmar-senha-funcionario"
    );

    if (senhaField) {
      senhaField.value = "";
      senhaField.placeholder = "Deixe em branco para manter a senha atual";
    }

    if (confirmarSenhaField) {
      confirmarSenhaField.value = "";
    }

    // Limpar erros de validação
    this.clearAllFieldErrors();
  }

  /**
   * Limpa formulário de usuário
   */
  clearUsuarioForm() {
    document.getElementById("nome-funcionario").value = "";
    document.getElementById("email-funcionario").value = "";
    document.getElementById("cargo-funcionario").value = "";
    document.getElementById("telefone-funcionario").value = "";
    document.getElementById("nascimento-funcionario").value = "";

    // Mostrar campos de senha para novo usuário
    const camposSenha = document.getElementById("campos-senha");
    if (camposSenha) {
      camposSenha.style.display = "block";
    }

    const senhaField = document.getElementById("senha-funcionario");
    if (senhaField) {
      senhaField.value = "";
      senhaField.placeholder = "Digite a senha";
    }

    const confirmarSenhaField = document.getElementById(
      "confirmar-senha-funcionario"
    );
    if (confirmarSenhaField) {
      confirmarSenhaField.value = "";
    }

    // Limpar erros de validação
    this.clearAllFieldErrors();
  }

  /**
   * Limpa todos os erros de validação do formulário
   */
  clearAllFieldErrors() {
    const fields = [
      "nome-funcionario",
      "email-funcionario",
      "telefone-funcionario",
      "cargo-funcionario",
      "nascimento-funcionario",
      "senha-funcionario",
      "confirmar-senha-funcionario",
    ];

    fields.forEach((fieldId) => {
      const field = document.getElementById(fieldId);
      if (field) {
        this.clearFieldError(field);
      }
    });
  }

  /**
   * Configura listeners do modal
   */
  setupUsuarioModalListeners(usuarioData = null) {
    // Remover listeners antigos clonando e substituindo os elementos
    const btnFechar = document.querySelector(
      "#modal-funcionario .fechar-modal"
    );
    const btnCancelar = document.getElementById("cancelar-funcionario");
    const btnSalvar = document.getElementById("salvar-funcionario");
    const overlay = document.querySelector("#modal-funcionario .div-overlay");

    // Clonar e substituir botão salvar para remover todos os listeners antigos
    if (btnSalvar) {
      const newBtnSalvar = btnSalvar.cloneNode(true);
      btnSalvar.parentNode.replaceChild(newBtnSalvar, btnSalvar);

      newBtnSalvar.addEventListener("click", () => {
        if (usuarioData) {
          this.handleEditUsuario();
        } else {
          this.handleAddUsuario();
        }
      });
    }

    // Botões de fechar (usar once: true para garantir execução única)
    if (btnFechar) {
      btnFechar.replaceWith(btnFechar.cloneNode(true));
      const newBtnFechar = document.querySelector(
        "#modal-funcionario .fechar-modal"
      );
      newBtnFechar.addEventListener("click", () => this.closeUsuarioModal());
    }

    if (btnCancelar) {
      btnCancelar.replaceWith(btnCancelar.cloneNode(true));
      const newBtnCancelar = document.getElementById("cancelar-funcionario");
      newBtnCancelar.addEventListener("click", () => this.closeUsuarioModal());
    }

    if (overlay) {
      overlay.replaceWith(overlay.cloneNode(true));
      const newOverlay = document.querySelector(
        "#modal-funcionario .div-overlay"
      );
      newOverlay.addEventListener("click", () => this.closeUsuarioModal());
    }

    // Formatação de campos
    this.setupFieldFormatting();
  }

  /**
   * Configura formatação de campos
   */
  setupFieldFormatting() {
    const telefoneField = document.getElementById("telefone-funcionario");
    const emailField = document.getElementById("email-funcionario");
    const senhaField = document.getElementById("senha-funcionario");
    const confirmarSenhaField = document.getElementById(
      "confirmar-senha-funcionario"
    );
    const nascimentoField = document.getElementById("nascimento-funcionario");

    // Formatação e validação de telefone
    if (telefoneField) {
      telefoneField.addEventListener("input", (e) => {
        this.formatPhoneInput(e.target);
      });

      telefoneField.addEventListener("blur", (e) => {
        this.validatePhoneField(e.target);
      });
    }

    // Validação de email
    if (emailField) {
      emailField.addEventListener("blur", (e) => {
        this.validateEmailField(e.target);
      });
    }

    // Validação de data de nascimento
    if (nascimentoField) {
      nascimentoField.addEventListener("blur", (e) => {
        this.validateBirthDateField(e.target);
      });
    }

    // Validação de senha forte em tempo real
    if (senhaField) {
      senhaField.addEventListener("input", (e) => {
        this.validatePasswordStrength(e.target.value);
      });

      senhaField.addEventListener("blur", (e) => {
        this.validatePasswordField(e.target);
      });
    }

    // Validação de confirmação de senha
    if (confirmarSenhaField) {
      confirmarSenhaField.addEventListener("blur", (e) => {
        this.validateConfirmPasswordField(e.target);
      });
    }

    // Toggle de visualização de senha
    this.setupPasswordToggle();
  }

  /**
   * Configura toggle de mostrar/ocultar senha
   */
  setupPasswordToggle() {
    // Toggle para senha principal
    const mostrarSenha = document.getElementById("mostrar-senha-funcionario");
    const ocultarSenha = document.getElementById("ocultar-senha-funcionario");
    const senhaField = document.getElementById("senha-funcionario");

    if (mostrarSenha && ocultarSenha && senhaField) {
      // Remover listeners antigos clonando
      const newMostrar = mostrarSenha.cloneNode(true);
      const newOcultar = ocultarSenha.cloneNode(true);
      mostrarSenha.replaceWith(newMostrar);
      ocultarSenha.replaceWith(newOcultar);

      newMostrar.addEventListener("click", () => {
        senhaField.type = "text";
        newMostrar.style.display = "none";
        newOcultar.style.display = "inline";
      });

      newOcultar.addEventListener("click", () => {
        senhaField.type = "password";
        newOcultar.style.display = "none";
        newMostrar.style.display = "inline";
      });
    }

    // Toggle para confirmar senha
    const mostrarConfirma = document.getElementById(
      "mostrar-confirma-senha-funcionario"
    );
    const ocultarConfirma = document.getElementById(
      "ocultar-confirma-senha-funcionario"
    );
    const confirmaField = document.getElementById(
      "confirmar-senha-funcionario"
    );

    if (mostrarConfirma && ocultarConfirma && confirmaField) {
      // Remover listeners antigos clonando
      const newMostrarConfirma = mostrarConfirma.cloneNode(true);
      const newOcultarConfirma = ocultarConfirma.cloneNode(true);
      mostrarConfirma.replaceWith(newMostrarConfirma);
      ocultarConfirma.replaceWith(newOcultarConfirma);

      newMostrarConfirma.addEventListener("click", () => {
        confirmaField.type = "text";
        newMostrarConfirma.style.display = "none";
        newOcultarConfirma.style.display = "inline";
      });

      newOcultarConfirma.addEventListener("click", () => {
        confirmaField.type = "password";
        newOcultarConfirma.style.display = "none";
        newMostrarConfirma.style.display = "inline";
      });
    }
  }

  /**
   * Formata input de telefone
   */
  formatPhoneInput(input) {
    let value = input.value.replace(/\D/g, "");

    // Limitar a 11 dígitos
    if (value.length > 11) {
      value = value.substring(0, 11);
    }

    // Formatar baseado no tamanho
    if (value.length >= 11) {
      value = value.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
    } else if (value.length >= 7) {
      value = value.replace(/(\d{2})(\d{4})(\d{0,4})/, "($1) $2-$3");
    } else if (value.length >= 3) {
      value = value.replace(/(\d{2})(\d{0,5})/, "($1) $2");
    }

    input.value = value;
  }

  /**
   * Valida telefone
   */
  isValidPhone(telefone) {
    return validatePhone(telefone);
  }

  /**
   * Valida campo de telefone com feedback visual
   */
  validatePhoneField(input) {
    if (input.value.trim() === "") {
      this.clearFieldError(input);
      return true;
    }

    return applyFieldValidation(input, (value) => validatePhone(value));
  }

  /**
   * Valida email com validação robusta
   */
  isValidEmailRobust(email) {
    return validateEmail(email);
  }

  /**
   * Valida campo de email com feedback visual
   */
  validateEmailField(input) {
    if (input.value.trim() === "") {
      this.clearFieldError(input);
      return false;
    }

    return applyFieldValidation(input, (value) => validateEmail(value));
  }

  /**
   * Valida data de nascimento
   */
  isValidBirthDate(data) {
    return validateBirthDate(data);
  }

  /**
   * Valida campo de data de nascimento com feedback visual
   */
  validateBirthDateField(input) {
    if (input.value.trim() === "") {
      this.clearFieldError(input);
      return false;
    }

    return applyFieldValidation(input, (value) => validateBirthDate(value));
  }

  /**
   * Valida força da senha em tempo real
   */
  validatePasswordStrength(senha) {
    const validacao = validatePassword(senha);
    const requisitos = {
      maiuscula: validacao.requirements?.uppercase || false,
      numero: validacao.requirements?.number || false,
      especial: validacao.requirements?.special || false,
      tamanho: validacao.requirements?.length || false,
    };

    // Atualizar visual dos requisitos
    const reqMaiuscula = document.getElementById("req-maiuscula-funcionario");
    const reqNumero = document.getElementById("req-numero-funcionario");
    const reqEspecial = document.getElementById("req-especial-funcionario");
    const reqTamanho = document.getElementById("req-tamanho-funcionario");

    if (reqMaiuscula)
      reqMaiuscula.classList.toggle("valid", requisitos.maiuscula);
    if (reqNumero) reqNumero.classList.toggle("valid", requisitos.numero);
    if (reqEspecial) reqEspecial.classList.toggle("valid", requisitos.especial);
    if (reqTamanho) reqTamanho.classList.toggle("valid", requisitos.tamanho);

    return validacao.valid;
  }

  /**
   * Valida campo de senha
   */
  validatePasswordField(input) {
    if (!this.currentEditingId && input.value.trim() === "") {
      this.showFieldError(input, "Senha é obrigatória para novos usuários");
      return false;
    }

    if (input.value.trim() !== "") {
      if (!this.validatePasswordStrength(input.value)) {
        this.showFieldError(input, "A senha não atende aos requisitos mínimos");
        return false;
      }
    }

    this.clearFieldError(input);
    input.classList.add("valid");
    return true;
  }

  /**
   * Valida campo de confirmação de senha
   */
  validateConfirmPasswordField(input) {
    const senhaField = document.getElementById("senha-funcionario");
    const senha = senhaField ? senhaField.value : "";
    const confirmarSenha = input.value;

    if (senha && confirmarSenha !== senha) {
      this.showFieldError(input, "As senhas não coincidem");
      input.classList.add("error");
      input.classList.remove("valid");
      return false;
    }

    if (confirmarSenha && confirmarSenha === senha) {
      this.clearFieldError(input);
      input.classList.remove("error");
      input.classList.add("valid");
      return true;
    }

    return true;
  }

  /**
   * Mostra erro em um campo
   */
  showFieldError(input, message) {
    input.classList.add("error");
    input.classList.remove("valid");

    const divInput = input.closest(".div-input");
    if (!divInput) return;

    let mensagemErro = divInput.querySelector(".mensagem-erro");
    if (!mensagemErro) {
      mensagemErro = document.createElement("div");
      mensagemErro.className = "mensagem-erro";
      divInput.appendChild(mensagemErro);
    }
    mensagemErro.textContent = message;
  }

  /**
   * Limpa erro de um campo
   */
  clearFieldError(input) {
    input.classList.remove("error", "valid");

    const divInput = input.closest(".div-input");
    if (!divInput) return;

    const mensagemErro = divInput.querySelector(".mensagem-erro");
    if (mensagemErro) {
      mensagemErro.remove();
    }
  }

  /**
   * Trata adição de usuário
   */
  async handleAddUsuario() {
    // Prevenir cliques múltiplos
    // Verificação atômica para evitar race conditions
    if (this.isSubmitting) {
      // ALTERAÇÃO: Log condicional apenas em modo debug
      if (typeof window !== 'undefined' && window.DEBUG_MODE) {
        console.warn("Operação já em andamento, ignorando requisição duplicada");
      }
      return;
    }

    if (!this.validateUsuarioForm()) {
      return;
    }

    const usuarioData = this.getUsuarioFormData();

    try {
      // Flag atômica - deve ser a primeira operação
      this.isSubmitting = true;
      const btnSalvar = document.getElementById("salvar-funcionario");
      if (btnSalvar) {
        btnSalvar.disabled = true;
        btnSalvar.innerHTML =
          '<i class="fa-solid fa-spinner fa-spin"></i> Salvando...';
      }

      await this.dataManager.addUsuario(usuarioData);
      await this.loadUsuarios();
      this.closeUsuarioModal();
      this.showSuccessMessage("Usuário adicionado com sucesso!");
    } catch (error) {
      // ALTERAÇÃO: Log condicional apenas em modo debug
      if (typeof window !== 'undefined' && window.DEBUG_MODE) {
        console.error("Erro ao adicionar usuário:", error);
      }
      this.showErrorMessage("Erro ao adicionar usuário. Tente novamente.");
    } finally {
      this.isSubmitting = false;
      const btnSalvar = document.getElementById("salvar-funcionario");
      if (btnSalvar) {
        btnSalvar.disabled = false;
        btnSalvar.innerHTML = '<i class="fa-solid fa-plus"></i> Adicionar';
      }
    }
  }

  /**
   * Trata edição de usuário
   */
  async handleEditUsuario() {
    // Prevenir cliques múltiplos
    if (this.isSubmitting) {
      return;
    }

    if (!this.validateUsuarioForm()) {
      return;
    }

    const usuarioData = this.getUsuarioFormData();
    const usuarioId = this.currentEditingId;

    if (!usuarioId) {
      // ALTERAÇÃO: Log condicional apenas em modo debug
      if (typeof window !== 'undefined' && window.DEBUG_MODE) {
        console.error("ID do usuário não encontrado");
      }
      return;
    }

    try {
      this.isSubmitting = true;
      const btnSalvar = document.getElementById("salvar-funcionario");
      if (btnSalvar) {
        btnSalvar.disabled = true;
        btnSalvar.innerHTML =
          '<i class="fa-solid fa-spinner fa-spin"></i> Salvando...';
      }

      await this.dataManager.updateUsuario(usuarioId, usuarioData);
      await this.loadUsuarios();
      this.closeUsuarioModal();
      this.showSuccessMessage("Usuário atualizado com sucesso!");
    } catch (error) {
      // ALTERAÇÃO: Log condicional apenas em modo debug
      if (typeof window !== 'undefined' && window.DEBUG_MODE) {
        console.error("Erro ao atualizar usuário:", error);
      }
      this.showErrorMessage("Erro ao atualizar usuário. Tente novamente.");
    } finally {
      this.isSubmitting = false;
      const btnSalvar = document.getElementById("salvar-funcionario");
      if (btnSalvar) {
        btnSalvar.disabled = false;
        btnSalvar.innerHTML = '<i class="fa-solid fa-save"></i> Salvar';
      }
    }
  }

  /**
   * Valida formulário de usuário
   */
  validateUsuarioForm() {
    const nomeField = document.getElementById("nome-funcionario");
    const emailField = document.getElementById("email-funcionario");
    const cargoField = document.getElementById("cargo-funcionario");
    const dataNascimentoField = document.getElementById(
      "nascimento-funcionario"
    );
    const senhaField = document.getElementById("senha-funcionario");
    const confirmarSenhaField = document.getElementById(
      "confirmar-senha-funcionario"
    );

    const nome = nomeField ? nomeField.value.trim() : "";
    const email = emailField ? emailField.value.trim() : "";
    const cargo = cargoField ? cargoField.value : "";
    const dataNascimento = dataNascimentoField ? dataNascimentoField.value : "";
    const senha = senhaField ? senhaField.value : "";
    const confirmarSenha = confirmarSenhaField ? confirmarSenhaField.value : "";

    if (!nome) {
      this.showErrorMessage("Nome é obrigatório");
      return false;
    }

    if (!email) {
      this.showErrorMessage("Email é obrigatório");
      return false;
    }

    const emailValidation = validateEmail(email);
    if (!emailValidation.valid) {
      this.showErrorMessage(emailValidation.message || "Email inválido");
      return false;
    }

    if (!dataNascimento) {
      this.showErrorMessage("Data de nascimento é obrigatória");
      return false;
    }

    if (!cargo) {
      this.showErrorMessage("Cargo é obrigatório");
      return false;
    }

    // Validação de senha para novos usuários
    if (!this.currentEditingId) {
      if (!senha) {
        this.showErrorMessage("Senha é obrigatória para novos usuários");
        return false;
      }

      if (senha !== confirmarSenha) {
        this.showErrorMessage("As senhas não coincidem");
        return false;
      }

      if (senha.length < 8) {
        this.showErrorMessage("A senha deve ter pelo menos 8 caracteres");
        return false;
      }
    }

    // Validação de senha para edição (se preenchida)
    if (this.currentEditingId && senha) {
      if (senha !== confirmarSenha) {
        this.showErrorMessage("As senhas não coincidem");
        return false;
      }

      if (senha.length < 8) {
        this.showErrorMessage("A senha deve ter pelo menos 8 caracteres");
        return false;
      }
    }

    return true;
  }

  /**
   * Valida email (simples)
   * @deprecated Use validateEmail de validators.js diretamente
   */
  isValidEmail(email) {
    const validation = validateEmail(email);
    return validation.valid;
  }

  /**
   * Obtém dados do formulário
   */
  getUsuarioFormData() {
    const nomeField = document.getElementById("nome-funcionario");
    const emailField = document.getElementById("email-funcionario");
    const cargoField = document.getElementById("cargo-funcionario");
    const telefoneField = document.getElementById("telefone-funcionario");
    const nascimentoField = document.getElementById("nascimento-funcionario");
    const senhaField = document.getElementById("senha-funcionario");

    const formData = {
      full_name: nomeField ? nomeField.value.trim() : "",
      email: emailField ? emailField.value.trim() : "",
      role: cargoField ? cargoField.value : "",
      phone: telefoneField ? telefoneField.value.trim() : "",
      date_of_birth: nascimentoField ? nascimentoField.value : "",
      is_active: true,
    };

    // Adicionar senha apenas se for um novo usuário ou se foi preenchida
    const senha = senhaField ? senhaField.value : "";
    if (senha && senha.trim()) {
      formData.password = senha;
    }

    return formData;
  }

  /**
   * Abre modal de métricas
   */
  openMetricasModal(usuario) {
    const modal = document.getElementById("modal-metricas");
    if (!modal) {
      // ALTERAÇÃO: Log condicional apenas em modo debug
      if (typeof window !== 'undefined' && window.DEBUG_MODE) {
        console.error("Modal de métricas não encontrada!");
      }
      return;
    }

    // Popula dados do usuário
    this.populateUsuarioMetricas(usuario);

    // Usar sistema universal de modais se disponível
    if (window.abrirModal) {
      window.abrirModal("modal-metricas");
    } else {
      modal.style.display = "flex";
      document.body.style.overflow = "hidden";
    }
  }

  /**
   * Fecha modal de métricas
   */
  closeMetricasModal() {
    const modal = document.getElementById("modal-metricas");
    if (modal) {
      if (window.fecharModal) {
        window.fecharModal("modal-metricas");
      } else {
        modal.style.display = "none";
        document.body.style.overflow = "auto";
      }
    }
  }

  /**
   * Popula dados do usuário na modal de métricas
   */
  populateUsuarioMetricas(usuario) {
    // Validação e sanitização dos dados (XSS Protection)
    const nome = escapeHTML(
      usuario.nome || usuario.full_name || "Nome não informado"
    );
    const email = escapeHTML(usuario.email || "Email não informado");
    const telefone = usuario.telefone || usuario.phone || "Não informado";
    const cpf = usuario.cpf || "Não informado";
    const roleAPI = usuario.role || usuario.cargo || "attendant";
    const dataNascimento = usuario.date_of_birth || usuario.nascimento || null;
    const dataCriacao = usuario.created_at || usuario.dataCriacao || null;

    // 1. Iniciais do avatar
    const iniciaisElement = document.getElementById("iniciais-funcionario");
    if (iniciaisElement) {
      iniciaisElement.textContent = this.generateIniciais(nome);
    }

    // 2. Nome
    const nomeElement = document.getElementById("nome-funcionario-metricas");
    if (nomeElement) {
      nomeElement.textContent = nome;
    }

    // 3. Cargo
    const cargoElement = document.getElementById("cargo-funcionario-metricas");
    if (cargoElement) {
      const cargoText = this.getCargoText(roleAPI);
      const cargoClass = this.getCargoClass(roleAPI);
      cargoElement.textContent = cargoText;
      // Remover classes antigas de cargo
      cargoElement.className = "cargo-tag " + cargoClass;
    }

    // 4. Email
    const emailElement = document.getElementById("email-funcionario-metricas");
    if (emailElement) {
      emailElement.textContent = email;
    }

    // 5. Tempo em atividade
    const tempoAtividadeElement = document.getElementById("tempo-atividade");
    if (tempoAtividadeElement && dataCriacao) {
      const tempoAtividade = this.calcularTempoAtividade(dataCriacao);
      tempoAtividadeElement.textContent = tempoAtividade;
    } else if (tempoAtividadeElement) {
      tempoAtividadeElement.textContent = "Não informado";
    }

    // 6. CPF
    const cpfElement = document.getElementById("cpf-funcionario");
    if (cpfElement) {
      cpfElement.textContent = this.formatarCPF(cpf);
    }

    // 7. Data de nascimento
    const nascimentoElement = document.getElementById("nascimento-funcionario");
    if (nascimentoElement) {
      nascimentoElement.textContent = this.formatarDataBR(dataNascimento);
    }

    // 8. Telefone
    const telefoneElement = document.getElementById("telefone-funcionario");
    if (telefoneElement) {
      telefoneElement.textContent = this.formatarTelefone(telefone);
    }

    // 9. Ocultar métricas de performance por enquanto
    const metricasPerformance = document.querySelector(".metricas-performance");
    if (metricasPerformance) {
      metricasPerformance.style.display = "none";
    }
  }

  /**
   * Calcula tempo de atividade desde a criação da conta
   */
  calcularTempoAtividade(dataCriacao) {
    try {
      if (!dataCriacao) {
        return "Não informado";
      }

      const dataInicio = new Date(dataCriacao);

      if (isNaN(dataInicio.getTime())) {
        return "Não informado";
      }

      const hoje = new Date();
      const diffTime = Math.abs(hoje - dataInicio);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays === 0) {
        return "Hoje";
      } else if (diffDays === 1) {
        return "1 dia";
      } else if (diffDays < DAYS_PER_MONTH) {
        return `${diffDays} dias`;
      } else if (diffDays < DAYS_PER_YEAR) {
        const meses = Math.floor(diffDays / DAYS_PER_MONTH);
        return meses === 1 ? "1 mês" : `${meses} meses`;
      } else {
        const anos = Math.floor(diffDays / DAYS_PER_YEAR);
        const mesesRestantes = Math.floor(
          (diffDays % DAYS_PER_YEAR) / DAYS_PER_MONTH
        );
        if (mesesRestantes === 0) {
          return anos === 1 ? "1 ano" : `${anos} anos`;
        }
        return `${anos} ${anos === 1 ? "ano" : "anos"} e ${mesesRestantes} ${
          mesesRestantes === 1 ? "mês" : "meses"
        }`;
      }
    } catch (error) {
      // ALTERAÇÃO: Log condicional apenas em modo debug
      if (typeof window !== 'undefined' && window.DEBUG_MODE) {
        console.error("Erro ao calcular tempo de atividade:", error);
      }
      return "Não informado";
    }
  }

  /**
   * Formata CPF para exibição
   */
  formatarCPF(cpf) {
    if (!cpf || cpf === "Não informado") {
      return "Não informado";
    }

    const cpfLimpo = String(cpf).replace(/\D/g, "");
    if (cpfLimpo.length === 11) {
      return cpfLimpo.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
    }
    return cpf;
  }

  /**
   * Formata data para formato brasileiro (DD/MM/YYYY)
   */
  formatarDataBR(data) {
    if (!data) {
      return "Não informado";
    }

    try {
      // Se já está no formato DD/MM/YYYY
      if (String(data).includes("/")) {
        return data;
      }

      // ALTERAÇÃO: Tratar data como string local para evitar problemas de timezone
      // Extrai apenas a parte da data (YYYY-MM-DD) ignorando hora/timezone
      const dateStr = String(data).split('T')[0];
      const [ano, mes, dia] = dateStr.split('-');
      
      // Valida se tem os 3 componentes (ano, mês, dia) no formato YYYY-MM-DD
      if (ano && mes && dia && ano.length === 4 && mes.length === 2 && dia.length === 2) {
        return `${dia}/${mes}/${ano}`;
      }

      // Fallback: tentar com Date se o formato não for YYYY-MM-DD
      const dataObj = new Date(data);
      if (isNaN(dataObj.getTime())) {
        return "Data inválida";
      }

      const diaFormatado = String(dataObj.getDate()).padStart(2, "0");
      const mesFormatado = String(dataObj.getMonth() + 1).padStart(2, "0");
      const anoFormatado = dataObj.getFullYear();

      return `${diaFormatado}/${mesFormatado}/${anoFormatado}`;
    } catch (error) {
      // ALTERAÇÃO: Log condicional apenas em modo debug
      if (typeof window !== 'undefined' && window.DEBUG_MODE) {
        console.error("Erro ao formatar data:", error);
      }
      return "Não informado";
    }
  }

  /**
   * Formata telefone para exibição
   */
  formatarTelefone(telefone) {
    if (!telefone || telefone === "Não informado") {
      return "Não informado";
    }

    if (typeof telefone !== "string" && typeof telefone !== "number") {
      return "Não informado";
    }

    const telefoneLimpo = String(telefone).replace(/\D/g, "");

    if (telefoneLimpo.length === 11) {
      return telefoneLimpo.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
    } else if (telefoneLimpo.length === 10) {
      return telefoneLimpo.replace(/(\d{2})(\d{4})(\d{4})/, "($1) $2-$3");
    }

    return telefone;
  }

  /**
   * Gera iniciais do nome
   */
  generateIniciais(nome) {
    if (!nome || typeof nome !== "string") {
      return "U?";
    }

    return nome
      .split(" ")
      .filter((word) => word.length > 0)
      .map((word) => word.charAt(0))
      .join("")
      .toUpperCase()
      .substring(0, MAX_INICIAIS_LENGTH);
  }

  /**
   * Obtém texto do cargo
   */
  getCargoText(cargo) {
    const mapping = {
      admin: "Administrador",
      manager: "Gerente",
      attendant: "Atendente",
      delivery: "Entregador",
      customer: "Cliente",
    };
    return mapping[cargo] || "Atendente";
  }

  /**
   * Obtém classe CSS do cargo
   */
  getCargoClass(cargo) {
    const mapping = {
      admin: "admin",
      manager: "gerente",
      attendant: "atendente",
      delivery: "entregador",
      customer: "cliente",
    };
    return mapping[cargo] || "atendente";
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
   * Renderiza controles de paginação
   * ALTERAÇÃO: Função adicionada para paginação similar à seção de estoque
   */
  renderPagination() {
    const container = document.querySelector("#secao-funcionarios .funcionarios");
    if (!container) return;

    // Remover paginação existente
    const existingPagination = container.parentElement.querySelector(".pagination");
    if (existingPagination) {
      existingPagination.remove();
    }

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
            Mostrando <strong>${startItem}-${endItem}</strong> de <strong>${this.totalItems}</strong> usuários
          </span>
          ${this.totalPages > 1 ? `<span class="pagination-page-info">Página ${this.currentPage} de ${this.totalPages}</span>` : ''}
        </div>
        ${this.totalPages > 1 ? `
        <div class="pagination-controls">
          <button class="pagination-btn pagination-btn-nav" ${this.currentPage === 1 ? 'disabled' : ''} data-page="prev" title="Página anterior" aria-label="Página anterior">
            <i class="fa-solid fa-chevron-left"></i>
            <span>Anterior</span>
          </button>
          <div class="pagination-pages">
            ${this.generatePageNumbers()}
          </div>
          <button class="pagination-btn pagination-btn-nav" ${this.currentPage === this.totalPages ? 'disabled' : ''} data-page="next" title="Próxima página" aria-label="Próxima página">
            <span>Próxima</span>
            <i class="fa-solid fa-chevron-right"></i>
          </button>
        </div>
        ` : ''}
      </div>
    `;

    const handlePaginationClick = async (e) => {
      const target = e.target.closest('.pagination-btn, .page-number');
      if (!target || target.disabled) return;

      e.preventDefault();
      e.stopPropagation();

      if (target.classList.contains('pagination-btn')) {
        const action = target.getAttribute('data-page');
        if (action === "prev" && this.currentPage > 1) {
          this.currentPage = Math.max(1, this.currentPage - 1);
        } else if (action === "next" && this.currentPage < this.totalPages) {
          this.currentPage = Math.min(this.totalPages, this.currentPage + 1);
        }
      } else if (target.classList.contains('page-number')) {
        const page = parseInt(target.getAttribute('data-page'), 10);
        if (isNaN(page) || page === this.currentPage || page < 1 || page > this.totalPages) {
          return;
        }
        this.currentPage = page;
      }

      // Recarregar usuários e rolar para o topo
      await this.loadUsuarios();
      this.scrollToTop();
    };

    // Usar event delegation no elemento de paginação
    pagination.addEventListener('click', handlePaginationClick);

    container.parentElement.appendChild(pagination);
    this.updateVisibleUsersCount();
  }

  /**
   * Gera números de página para paginação
   * ALTERAÇÃO: Função adicionada para paginação
   */
  generatePageNumbers() {
    const pages = [];
    const maxVisible = 5;
    let startPage = Math.max(1, this.currentPage - Math.floor(maxVisible / 2));
    let endPage = Math.min(this.totalPages, startPage + maxVisible - 1);

    if (endPage - startPage < maxVisible - 1) {
      startPage = Math.max(1, endPage - maxVisible + 1);
    }

    if (startPage > 1) {
      // ALTERAÇÃO: Adicionar aria-label para acessibilidade
      pages.push(`<button class="page-number" data-page="1" title="Primeira página" aria-label="Ir para primeira página">1</button>`);
      if (startPage > 2) {
        pages.push(`<span class="page-ellipsis" title="Mais páginas" aria-label="Mais páginas">...</span>`);
      }
    }

    for (let i = startPage; i <= endPage; i++) {
      const isActive = i === this.currentPage ? 'active' : '';
      // ALTERAÇÃO: Adicionar aria-label para acessibilidade
      const ariaLabel = i === this.currentPage ? `Página atual, página ${i}` : `Ir para página ${i}`;
      pages.push(`<button class="page-number ${isActive}" data-page="${i}" title="Página ${i}" aria-label="${ariaLabel}">${i}</button>`);
    }

    if (endPage < this.totalPages) {
      if (endPage < this.totalPages - 1) {
        pages.push(`<span class="page-ellipsis" title="Mais páginas" aria-label="Mais páginas">...</span>`);
      }
      // ALTERAÇÃO: Adicionar aria-label para acessibilidade
      pages.push(`<button class="page-number" data-page="${this.totalPages}" title="Última página" aria-label="Ir para última página">${this.totalPages}</button>`);
    }

    return pages;
  }

  /**
   * Rola suavemente para o topo da seção
   * ALTERAÇÃO: Função adicionada para paginação
   */
  scrollToTop() {
    const section = document.querySelector("#secao-funcionarios");
    if (section) {
      section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }
}

// Exporta a classe principal
export { UsuarioManager };
