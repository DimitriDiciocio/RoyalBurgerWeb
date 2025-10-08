/**
 * Módulo de Gerenciamento de Usuários
 * Responsável por todas as operações relacionadas a funcionários/usuários
 */

import { 
    createUser, 
    updateUser, 
    getUsers,
    getUserById,
    updateUserStatus
} from '../../api/user.js';

import { showToast } from '../alerts.js';

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
            lastFetch: null
        };
        this.cacheTimeout = CACHE_TIMEOUT_MS;
    }

    /**
     * Verifica se o cache ainda é válido
     */
    isCacheValid() {
        return this.cache.lastFetch && 
               (Date.now() - this.cache.lastFetch) < this.cacheTimeout;
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
     */
    async getAllUsuarios(options = {}) {
        try {
            if (this.isCacheValid() && !options.forceRefresh) {
                return this.cache.data;
            }

            const response = await getUsers(options);
            
            // A API retorna um objeto com paginação, extrair apenas os usuários
            let usuarios;
            if (response && response.users && Array.isArray(response.users)) {
                usuarios = response.users;
            } else if (Array.isArray(response)) {
                usuarios = response;
            } else {
                console.warn('Formato de resposta inesperado da API:', response);
                usuarios = [];
            }
            
            this.cache.data = usuarios;
            this.cache.lastFetch = Date.now();
            
            return usuarios;
        } catch (error) {
            console.error('Erro ao buscar usuários:', error);
            throw error;
        }
    }

    /**
     * Busca usuário por ID
     */
    async getUsuarioById(id) {
        try {
            if (!id) {
                throw new Error('ID do usuário é obrigatório');
            }

            const usuario = await getUserById(id);
            
            if (!usuario) {
                throw new Error(`Usuário com ID ${id} não encontrado`);
            }
            
            if (!usuario.full_name || !usuario.email) {
                throw new Error('Dados do usuário estão incompletos');
            }
            
            const usuarioMapeado = {
                id: usuario.id,
                nome: usuario.full_name,
                email: usuario.email,
                cargo: this.mapRoleToCargo(usuario.role),
                telefone: usuario.phone || '',
                cpf: usuario.cpf || '',
                ativo: usuario.is_active !== undefined ? usuario.is_active : true,
                dataCriacao: usuario.created_at || new Date().toISOString().split('T')[0],
                ultimaAtualizacao: usuario.updated_at || new Date().toISOString().split('T')[0],
                full_name: usuario.full_name,
                role: usuario.role,
                phone: usuario.phone,
                date_of_birth: usuario.date_of_birth,
                nascimento: usuario.date_of_birth,
                senha: '', // Sempre vazio para edição
                confirmarSenha: '' // Sempre vazio para edição
            };
            
            return usuarioMapeado;
        } catch (error) {
            console.error(`Erro ao buscar usuário (ID: ${id}):`, error.message);
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
                throw new Error('Nome, email e senha são obrigatórios');
            }

            // Se role já está em inglês (admin, manager, etc.), usa direto. Senão, mapeia.
            const mappedRole = ['admin', 'manager', 'attendant', 'delivery', 'customer'].includes(role) 
                ? role 
                : this.mapCargoToRole(role);

            // Converter data de YYYY-MM-DD para DD-MM-YYYY se necessário
            let dateOfBirth = usuarioData.date_of_birth || usuarioData.dataNascimento || null;
            if (dateOfBirth && dateOfBirth.includes('-')) {
                const parts = dateOfBirth.split('-');
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
                phone: usuarioData.phone || usuarioData.telefone || '',
                date_of_birth: dateOfBirth
            };

            await createUser(apiData);
            this.clearCache();
        } catch (error) {
            console.error('Erro ao adicionar usuário:', error);
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
            const mappedRole = ['admin', 'manager', 'attendant', 'delivery', 'customer'].includes(role) 
                ? role 
                : this.mapCargoToRole(role);
            
            // Converter data de YYYY-MM-DD para DD-MM-YYYY se necessário
            let dateOfBirth = usuarioData.date_of_birth || usuarioData.dataNascimento || null;
            if (dateOfBirth && dateOfBirth.includes('-')) {
                const parts = dateOfBirth.split('-');
                if (parts.length === 3 && parts[0].length === 4) {
                    // Formato YYYY-MM-DD -> DD-MM-YYYY
                    dateOfBirth = `${parts[2]}-${parts[1]}-${parts[0]}`;
                }
            }
            
            const apiData = {
                full_name: usuarioData.full_name || usuarioData.nome,
                email: usuarioData.email,
                role: mappedRole,
                phone: usuarioData.phone || usuarioData.telefone || '',
                date_of_birth: dateOfBirth
            };

            // Incluir senha apenas se fornecida
            const password = usuarioData.password || usuarioData.senha;
            if (password && password.trim()) {
                apiData.password = password;
            }

            await updateUser(id, apiData);
            this.clearCache();
        } catch (error) {
            console.error('Erro ao atualizar usuário:', error);
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
            console.error('Erro ao alterar status do usuário:', error);
            throw error;
        }
    }

    /**
     * Mapeia cargo para role
     */
    mapCargoToRole(cargo) {
        const mapping = {
            'admin': 'admin',
            'gerente': 'manager',
            'atendente': 'attendant',
            'entregador': 'delivery',
            'cliente': 'customer'
        };
        return mapping[cargo] || 'attendant';
    }

    /**
     * Mapeia role da API para cargo do formulário HTML
     */
    mapRoleToCargo(role) {
        const mapping = {
            'admin': 'admin',
            'manager': 'gerente',
            'attendant': 'atendente',
            'delivery': 'entregador',
            'customer': 'cliente'
        };
        return mapping[role] || 'atendente';
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
    canExecuteOperation(operation = 'default') {
        const now = Date.now();
        const timeSinceLastOp = now - this.lastOperation;
        
        if (timeSinceLastOp < this.minOperationInterval) {
            console.warn(`Rate limit: ${operation} bloqueada. Aguarde ${Math.ceil((this.minOperationInterval - timeSinceLastOp) / 1000)}s`);
            return false;
        }
        
        this.lastOperation = now;
        return true;
    }

    /**
     * Sanitiza string para prevenir XSS
     * @param {string} str - String a ser sanitizada
     * @returns {string} String segura para innerHTML
     */
    sanitizeHTML(str) {
        if (!str || typeof str !== 'string') {
            return '';
        }
        // Usar DOMPurify se disponível, senão fallback seguro
        if (typeof DOMPurify !== 'undefined') {
            return DOMPurify.sanitize(str, { ALLOWED_TAGS: [] });
        }
        // Fallback: escape completo de caracteres HTML
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#x27;')
            .replace(/\//g, '&#x2F;');
    }

    /**
     * Inicializa o módulo
     */
    async init() {
        try {
            await this.loadUsuarios();
            this.setupEventListeners();
        } catch (error) {
            console.error('Erro ao inicializar módulo de usuários:', error);
            this.showErrorMessage('Erro ao carregar dados dos usuários');
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
        const section = document.getElementById('secao-funcionarios');
        
        if (!section) {
            console.error('Seção de funcionários não encontrada!');
            return;
        }

        // Event delegation para botões de editar
        section.addEventListener('click', (e) => {
            const editButton = e.target.closest('.editar');
            if (editButton) {
                e.preventDefault();
                e.stopPropagation();
                this.handleEditClick(editButton);
            }
        });

        // Event delegation para toggles
        section.addEventListener('change', (e) => {
            if (e.target.matches('.toggle input[type="checkbox"]')) {
                this.handleToggleChange(e.target);
            }
        });

        // Event delegation para métricas
        section.addEventListener('click', (e) => {
            if (e.target.matches('.metricas-link')) {
                this.handleMetricsClick(e.target);
            }
        });

        // Botão "Novo usuário"
        const btnNovoUsuario = section.querySelector('.adicionar');
        
        if (btnNovoUsuario) {
            btnNovoUsuario.addEventListener('click', () => {
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
        const modal = document.getElementById('modal-metricas');
        if (!modal) return;
        
        // Botão X do header
        const btnFecharHeader = modal.querySelector('.fechar-modal');
        if (btnFecharHeader) {
            btnFecharHeader.addEventListener('click', () => {
                this.closeMetricasModal();
            });
        }
        
        // Botão Fechar do footer
        const btnFecharFooter = document.getElementById('fechar-metricas');
        if (btnFecharFooter) {
            btnFecharFooter.addEventListener('click', () => {
                this.closeMetricasModal();
            });
        }
        
        // Clicar no overlay
        const overlay = modal.querySelector('.div-overlay');
        if (overlay) {
            overlay.addEventListener('click', () => {
                this.closeMetricasModal();
            });
        }
    }

    /**
     * Configura handlers de filtros
     */
    setupFilterHandlers() {
        const cargoFilter = document.getElementById('cargo-funcionarios');
        const statusFilter = document.getElementById('status-usuarios');

        if (cargoFilter) {
            cargoFilter.addEventListener('change', (e) => {
                this.handleCargoFilter(e.target.value);
            });
        }

        if (statusFilter) {
            statusFilter.addEventListener('change', (e) => {
                this.handleStatusFilter(e.target.value);
            });
        }
    }

    /**
     * Configura handlers de busca
     */
    setupSearchHandlers() {
        const searchInput = document.getElementById('buscar-usuarios');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.handleSearch(e.target.value);
            });
        }
    }

    /**
     * Carrega usuários
     */
    async loadUsuarios() {
        try {
            const usuarios = await this.dataManager.getAllUsuarios();
            this.renderUsuarioCards(usuarios);
        } catch (error) {
            console.error('Erro ao carregar usuários:', error);
            this.showErrorMessage('Erro ao carregar usuários');
        }
    }

    /**
     * Renderiza cards de usuários
     */
    renderUsuarioCards(usuarios) {
        const container = document.querySelector('#secao-funcionarios .funcionarios');
        if (!container) return;

        container.innerHTML = '';

        if (!usuarios || usuarios.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fa-solid fa-users"></i>
                    <p>Nenhum usuário encontrado</p>
                </div>
            `;
            return;
        }

        usuarios.forEach(usuario => {
            const card = this.createUsuarioCard(usuario);
            container.appendChild(card);
        });
    }

    /**
     * Cria card de usuário
     */
    createUsuarioCard(usuario) {
        const card = document.createElement('div');
        card.className = 'card-funcionario';
        card.dataset.funcionarioId = usuario.id;

        // Validação e sanitização dos dados (XSS Protection)
        const nome = this.sanitizeHTML(usuario.nome || usuario.full_name || 'Nome não informado');
        const email = this.sanitizeHTML(usuario.email || 'Email não informado');
        const telefone = this.sanitizeHTML(usuario.telefone || usuario.phone || '');
        const cpf = this.sanitizeHTML(usuario.cpf || '');
        // Usar o role da API (em inglês) diretamente
        const roleAPI = usuario.role || usuario.cargo || 'attendant';
        const ativo = usuario.ativo !== undefined ? usuario.ativo : (usuario.is_active !== undefined ? usuario.is_active : true);

        const statusClass = ativo ? 'ativo' : 'inativo';
        const statusText = ativo ? 'Ativo' : 'Inativo';
        const cargoText = this.sanitizeHTML(this.getCargoText(roleAPI));
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
                        <div class="toggle ${ativo ? 'active' : ''}">
                            <input type="checkbox" ${ativo ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </div>
                        <div class="status-text ${ativo ? '' : 'inactive'}">
                            <i class="fa-solid ${ativo ? 'fa-eye' : 'fa-eye-slash'}"></i>
                            <span>${ativo ? 'Ativo' : 'Inativo'}</span>
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
        const card = button.closest('.card-funcionario');
        
        if (!card) {
            console.error('Card não encontrado!');
            return;
        }
        
        const usuarioId = parseInt(card.dataset.funcionarioId);

        try {
            const usuario = await this.dataManager.getUsuarioById(usuarioId);
            
            if (usuario) {
                this.currentEditingId = usuarioId;
                this.openUsuarioModal(usuario);
            } else {
                console.error('Usuário não encontrado!');
            }
        } catch (error) {
            console.error('Erro ao buscar usuário para edição:', error);
            this.showErrorMessage('Erro ao carregar dados do usuário');
        }
    }

    /**
     * Trata mudança no toggle
     */
    async handleToggleChange(toggle) {
        // Rate limiting para operações de toggle
        if (!this.canExecuteOperation('toggle-status')) {
            return;
        }

        const card = toggle.closest('.card-funcionario');
        const usuarioId = parseInt(card.dataset.funcionarioId);
        const novoStatus = toggle.checked;

        try {
            await this.dataManager.toggleUsuarioStatus(usuarioId, novoStatus);
            
            // ✅ CORREÇÃO: Usar os elementos que realmente existem no HTML
            const statusTextElement = card.querySelector('.status-text span');
            const statusIcon = card.querySelector('.status-text i');
            const toggleContainer = card.querySelector('.toggle');
            
            if (novoStatus) {
                // Ativar usuário
                if (statusTextElement) statusTextElement.textContent = 'Ativo';
                if (statusIcon) statusIcon.className = 'fa-solid fa-eye';
                if (statusTextElement) statusTextElement.parentElement.classList.remove('inactive');
                if (toggleContainer) toggleContainer.classList.add('active');
            } else {
                // Desativar usuário
                if (statusTextElement) statusTextElement.textContent = 'Inativo';
                if (statusIcon) statusIcon.className = 'fa-solid fa-eye-slash';
                if (statusTextElement) statusTextElement.parentElement.classList.add('inactive');
                if (toggleContainer) toggleContainer.classList.remove('active');
            }

            this.showSuccessMessage(`Usuário ${novoStatus ? 'ativado' : 'desativado'} com sucesso!`);
        } catch (error) {
            console.error('Erro ao alterar status do usuário:', error);
            this.showErrorMessage('Erro ao alterar status do usuário');
            
            // Reverter toggle
            toggle.checked = !novoStatus;
        }
    }

    /**
     * Trata clique em métricas
     */
    async handleMetricsClick(link) {
        const card = link.closest('.card-funcionario');
        const usuarioId = parseInt(card.dataset.funcionarioId);

        try {
            const usuario = await this.dataManager.getUsuarioById(usuarioId);
            this.openMetricasModal(usuario);
        } catch (error) {
            console.error('Erro ao abrir métricas:', error);
            this.showErrorMessage('Erro ao carregar métricas do usuário');
        }
    }

    /**
     * Trata filtro por cargo
     */
    handleCargoFilter(cargo) {
        const cards = document.querySelectorAll('.card-funcionario');
        cards.forEach(card => {
            const cardCargo = card.querySelector('.cargo').textContent.toLowerCase();
            const shouldShow = cargo === 'todos' || cardCargo.includes(cargo.toLowerCase());
            card.style.display = shouldShow ? 'block' : 'none';
        });
    }

    /**
     * Trata filtro por status
     */
    handleStatusFilter(status) {
        const cards = document.querySelectorAll('.card-funcionario');
        cards.forEach(card => {
            const isActive = card.querySelector('.toggle input').checked;
            const shouldShow = status === 'todos' || 
                             (status === 'ativo' && isActive) || 
                             (status === 'inativo' && !isActive);
            card.style.display = shouldShow ? 'block' : 'none';
        });
    }

    /**
     * Trata busca
     */
    handleSearch(searchTerm) {
        const cards = document.querySelectorAll('.card-funcionario');
        const term = searchTerm.toLowerCase();

        cards.forEach(card => {
            const nome = card.querySelector('h3').textContent.toLowerCase();
            const email = card.querySelector('.info-item span').textContent.toLowerCase();
            const shouldShow = nome.includes(term) || email.includes(term);
            card.style.display = shouldShow ? 'block' : 'none';
        });
    }

    /**
     * Abre modal de usuário
     */
    openUsuarioModal(usuarioData = null) {
        const modal = document.getElementById('modal-funcionario');
        const titulo = document.getElementById('titulo-modal-funcionario');
        const btnSalvar = document.getElementById('salvar-funcionario');
        
        if (!modal) {
            console.error('Modal não encontrada!');
            return;
        }

        if (usuarioData) {
            if (titulo) titulo.textContent = 'Editar usuário';
            if (btnSalvar) btnSalvar.innerHTML = '<i class="fa-solid fa-save"></i> Salvar';
            this.populateUsuarioForm(usuarioData);
        } else {
            if (titulo) titulo.textContent = 'Adicionar novo usuário';
            if (btnSalvar) btnSalvar.innerHTML = '<i class="fa-solid fa-plus"></i> Adicionar';
            this.clearUsuarioForm();
        }

        // Usar o sistema universal de modais se disponível
        if (window.abrirModal) {
            window.abrirModal('modal-funcionario');
        } else {
            modal.style.display = 'flex';
            document.body.style.overflow = 'hidden';
        }
        
        this.setupUsuarioModalListeners(usuarioData);
    }

    /**
     * Fecha modal de usuário
     */
    closeUsuarioModal() {
        const modal = document.getElementById('modal-funcionario');
        if (modal) {
            // Usar o sistema universal de modais
            if (window.fecharModal) {
                window.fecharModal('modal-funcionario');
            } else {
                modal.style.display = 'none';
                document.body.style.overflow = 'auto';
            }
        }
        this.currentEditingId = null;
    }

    /**
     * Popula formulário de usuário
     */
    populateUsuarioForm(usuarioData) {
        // Mapear dados da API para os campos do formulário
        const nome = usuarioData.nome || usuarioData.full_name || '';
        const email = usuarioData.email || '';
        const telefone = usuarioData.telefone || usuarioData.phone || '';
        const cargo = usuarioData.cargo || usuarioData.role || '';
        const dataNascimento = usuarioData.date_of_birth || usuarioData.nascimento || '';
        
        // Preencher campos básicos
        const nomeField = document.getElementById('nome-funcionario');
        const emailField = document.getElementById('email-funcionario');
        const telefoneField = document.getElementById('telefone-funcionario');
        const cargoField = document.getElementById('cargo-funcionario');
        const nascimentoField = document.getElementById('nascimento-funcionario');
        
        if (nomeField) nomeField.value = nome;
        if (emailField) emailField.value = email;
        if (telefoneField) telefoneField.value = telefone;
        if (cargoField) cargoField.value = cargo;
        
        // Data de nascimento - garantir que está no formato correto
        if (nascimentoField && dataNascimento) {
            // Se a data está no formato DD-MM-YYYY, converter para YYYY-MM-DD
            let dataFormatada = dataNascimento;
            if (dataNascimento.includes('-') && dataNascimento.split('-')[0].length === 2) {
                const partes = dataNascimento.split('-');
                dataFormatada = `${partes[2]}-${partes[1]}-${partes[0]}`;
            }
            nascimentoField.value = dataFormatada;
        }
        
        // Campos de senha - ocultar para edição
        const camposSenha = document.getElementById('campos-senha');
        if (camposSenha) {
            camposSenha.style.display = 'none';
        }
        
        const senhaField = document.getElementById('senha-funcionario');
        const confirmarSenhaField = document.getElementById('confirmar-senha-funcionario');
        
        if (senhaField) {
            senhaField.value = '';
            senhaField.placeholder = 'Deixe em branco para manter a senha atual';
        }
        
        if (confirmarSenhaField) {
            confirmarSenhaField.value = '';
        }
        
        // Limpar erros de validação
        this.clearAllFieldErrors();
    }

    /**
     * Limpa formulário de usuário
     */
    clearUsuarioForm() {
        document.getElementById('nome-funcionario').value = '';
        document.getElementById('email-funcionario').value = '';
        document.getElementById('cargo-funcionario').value = '';
        document.getElementById('telefone-funcionario').value = '';
        document.getElementById('nascimento-funcionario').value = '';
        
        // Mostrar campos de senha para novo usuário
        const camposSenha = document.getElementById('campos-senha');
        if (camposSenha) {
            camposSenha.style.display = 'block';
        }
        
        const senhaField = document.getElementById('senha-funcionario');
        if (senhaField) {
            senhaField.value = '';
            senhaField.placeholder = 'Digite a senha';
        }
        
        const confirmarSenhaField = document.getElementById('confirmar-senha-funcionario');
        if (confirmarSenhaField) {
            confirmarSenhaField.value = '';
        }
        
        // Limpar erros de validação
        this.clearAllFieldErrors();
    }
    
    /**
     * Limpa todos os erros de validação do formulário
     */
    clearAllFieldErrors() {
        const fields = [
            'nome-funcionario',
            'email-funcionario',
            'telefone-funcionario',
            'cargo-funcionario',
            'nascimento-funcionario',
            'senha-funcionario',
            'confirmar-senha-funcionario'
        ];
        
        fields.forEach(fieldId => {
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
        const btnFechar = document.querySelector('#modal-funcionario .fechar-modal');
        const btnCancelar = document.getElementById('cancelar-funcionario');
        const btnSalvar = document.getElementById('salvar-funcionario');
        const overlay = document.querySelector('#modal-funcionario .div-overlay');

        // Clonar e substituir botão salvar para remover todos os listeners antigos
        if (btnSalvar) {
            const newBtnSalvar = btnSalvar.cloneNode(true);
            btnSalvar.parentNode.replaceChild(newBtnSalvar, btnSalvar);
            
            newBtnSalvar.addEventListener('click', () => {
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
            const newBtnFechar = document.querySelector('#modal-funcionario .fechar-modal');
            newBtnFechar.addEventListener('click', () => this.closeUsuarioModal());
        }

        if (btnCancelar) {
            btnCancelar.replaceWith(btnCancelar.cloneNode(true));
            const newBtnCancelar = document.getElementById('cancelar-funcionario');
            newBtnCancelar.addEventListener('click', () => this.closeUsuarioModal());
        }

        if (overlay) {
            overlay.replaceWith(overlay.cloneNode(true));
            const newOverlay = document.querySelector('#modal-funcionario .div-overlay');
            newOverlay.addEventListener('click', () => this.closeUsuarioModal());
        }

        // Formatação de campos
        this.setupFieldFormatting();
    }

    /**
     * Configura formatação de campos
     */
    setupFieldFormatting() {
        const telefoneField = document.getElementById('telefone-funcionario');
        const emailField = document.getElementById('email-funcionario');
        const senhaField = document.getElementById('senha-funcionario');
        const confirmarSenhaField = document.getElementById('confirmar-senha-funcionario');
        const nascimentoField = document.getElementById('nascimento-funcionario');

        // Formatação e validação de telefone
        if (telefoneField) {
            telefoneField.addEventListener('input', (e) => {
                this.formatPhoneInput(e.target);
            });
            
            telefoneField.addEventListener('blur', (e) => {
                this.validatePhoneField(e.target);
            });
        }

        // Validação de email
        if (emailField) {
            emailField.addEventListener('blur', (e) => {
                this.validateEmailField(e.target);
            });
        }

        // Validação de data de nascimento
        if (nascimentoField) {
            nascimentoField.addEventListener('blur', (e) => {
                this.validateBirthDateField(e.target);
            });
        }

        // Validação de senha forte em tempo real
        if (senhaField) {
            senhaField.addEventListener('input', (e) => {
                this.validatePasswordStrength(e.target.value);
            });
            
            senhaField.addEventListener('blur', (e) => {
                this.validatePasswordField(e.target);
            });
        }

        // Validação de confirmação de senha
        if (confirmarSenhaField) {
            confirmarSenhaField.addEventListener('blur', (e) => {
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
        const mostrarSenha = document.getElementById('mostrar-senha-funcionario');
        const ocultarSenha = document.getElementById('ocultar-senha-funcionario');
        const senhaField = document.getElementById('senha-funcionario');

        if (mostrarSenha && ocultarSenha && senhaField) {
            // Remover listeners antigos clonando
            const newMostrar = mostrarSenha.cloneNode(true);
            const newOcultar = ocultarSenha.cloneNode(true);
            mostrarSenha.replaceWith(newMostrar);
            ocultarSenha.replaceWith(newOcultar);

            newMostrar.addEventListener('click', () => {
                senhaField.type = 'text';
                newMostrar.style.display = 'none';
                newOcultar.style.display = 'inline';
            });

            newOcultar.addEventListener('click', () => {
                senhaField.type = 'password';
                newOcultar.style.display = 'none';
                newMostrar.style.display = 'inline';
            });
        }

        // Toggle para confirmar senha
        const mostrarConfirma = document.getElementById('mostrar-confirma-senha-funcionario');
        const ocultarConfirma = document.getElementById('ocultar-confirma-senha-funcionario');
        const confirmaField = document.getElementById('confirmar-senha-funcionario');

        if (mostrarConfirma && ocultarConfirma && confirmaField) {
            // Remover listeners antigos clonando
            const newMostrarConfirma = mostrarConfirma.cloneNode(true);
            const newOcultarConfirma = ocultarConfirma.cloneNode(true);
            mostrarConfirma.replaceWith(newMostrarConfirma);
            ocultarConfirma.replaceWith(newOcultarConfirma);

            newMostrarConfirma.addEventListener('click', () => {
                confirmaField.type = 'text';
                newMostrarConfirma.style.display = 'none';
                newOcultarConfirma.style.display = 'inline';
            });

            newOcultarConfirma.addEventListener('click', () => {
                confirmaField.type = 'password';
                newOcultarConfirma.style.display = 'none';
                newMostrarConfirma.style.display = 'inline';
            });
        }
    }

    /**
     * Formata input de telefone
     */
    formatPhoneInput(input) {
        let value = input.value.replace(/\D/g, '');
        
        // Limitar a 11 dígitos
        if (value.length > 11) {
            value = value.substring(0, 11);
        }
        
        // Formatar baseado no tamanho
        if (value.length >= 11) {
            value = value.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
        } else if (value.length >= 7) {
            value = value.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3');
        } else if (value.length >= 3) {
            value = value.replace(/(\d{2})(\d{0,5})/, '($1) $2');
        }
        
        input.value = value;
    }

    /**
     * Valida telefone
     */
    isValidPhone(telefone) {
        if (!telefone || typeof telefone !== 'string') {
            return { valid: false, message: 'Telefone inválido' };
        }
        
        const telefoneLimpo = telefone.replace(/\D/g, '');
        
        if (telefoneLimpo.length < 10) {
            return { valid: false, message: 'Telefone deve ter pelo menos 10 dígitos' };
        }
        
        if (telefoneLimpo.length > 11) {
            return { valid: false, message: 'Telefone deve ter no máximo 11 dígitos' };
        }
        
        // Verificar se é um celular (11 dígitos) e se o nono dígito é 9
        if (telefoneLimpo.length === 11 && telefoneLimpo.charAt(2) !== '9') {
            return { valid: false, message: 'Celular deve começar com 9' };
        }
        
        // Verificar DDD válido (11-99)
        const ddd = telefoneLimpo.substring(0, 2);
        if (parseInt(ddd) < 11 || parseInt(ddd) > 99) {
            return { valid: false, message: 'DDD inválido' };
        }
        
        return { valid: true, message: '' };
    }

    /**
     * Valida campo de telefone com feedback visual
     */
    validatePhoneField(input) {
        if (input.value.trim() === '') {
            this.clearFieldError(input);
            return true;
        }

        const validation = this.isValidPhone(input.value);
        if (!validation.valid) {
            this.showFieldError(input, validation.message);
            return false;
        }
        
        this.clearFieldError(input);
        input.classList.add('valid');
        return true;
    }

    /**
     * Valida email com validação robusta
     */
    isValidEmailRobust(email) {
        if (!email || typeof email !== 'string' || email.trim() === '') {
            return { valid: false, message: 'Email é obrigatório' };
        }
        
        // Regex robusta para validação de email
        const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
        
        if (!emailRegex.test(email)) {
            return { valid: false, message: 'Formato de email inválido' };
        }
        
        if (email.includes(' ')) {
            return { valid: false, message: 'Email não pode conter espaços' };
        }
        
        if (email.includes('..') || email.includes('@@')) {
            return { valid: false, message: 'Email contém caracteres inválidos' };
        }
        
        const partes = email.split('@');
        if (partes.length !== 2) {
            return { valid: false, message: 'Email deve ter um @' };
        }
        
        const dominio = partes[1];
        if (!dominio.includes('.') || dominio.endsWith('.') || dominio.startsWith('.')) {
            return { valid: false, message: 'Domínio do email inválido' };
        }
        
        return { valid: true, message: '' };
    }

    /**
     * Valida campo de email com feedback visual
     */
    validateEmailField(input) {
        if (input.value.trim() === '') {
            this.clearFieldError(input);
            return false;
        }

        const validation = this.isValidEmailRobust(input.value);
        if (!validation.valid) {
            this.showFieldError(input, validation.message);
            return false;
        }
        
        this.clearFieldError(input);
        input.classList.add('valid');
        return true;
    }

    /**
     * Valida data de nascimento
     */
    isValidBirthDate(data) {
        if (!data || data.trim() === '') {
            return { valid: false, message: 'Data de nascimento é obrigatória' };
        }
        
        const dataSelecionada = new Date(data);
        const hoje = new Date();
        const dataMinima = new Date('1850-01-01');
        
        if (isNaN(dataSelecionada.getTime())) {
            return { valid: false, message: 'Data inválida' };
        }
        
        if (dataSelecionada > hoje) {
            return { valid: false, message: 'Data de nascimento não pode ser no futuro' };
        }
        
        if (dataSelecionada < dataMinima) {
            return { valid: false, message: 'Data de nascimento muito antiga' };
        }
        
        // Calcular idade real
        const idade = hoje.getFullYear() - dataSelecionada.getFullYear();
        const mesAtual = hoje.getMonth();
        const mesNascimento = dataSelecionada.getMonth();
        const diaAtual = hoje.getDate();
        const diaNascimento = dataSelecionada.getDate();
        
        let idadeReal = idade;
        if (mesNascimento > mesAtual || (mesNascimento === mesAtual && diaNascimento > diaAtual)) {
            idadeReal--;
        }
        
        if (idadeReal < 18) {
            return { valid: false, message: 'Você deve ter pelo menos 18 anos' };
        }
        
        if (idadeReal > 120) {
            return { valid: false, message: 'Idade inválida' };
        }
        
        return { valid: true, message: '' };
    }

    /**
     * Valida campo de data de nascimento com feedback visual
     */
    validateBirthDateField(input) {
        if (input.value.trim() === '') {
            this.clearFieldError(input);
            return false;
        }

        const validation = this.isValidBirthDate(input.value);
        if (!validation.valid) {
            this.showFieldError(input, validation.message);
            return false;
        }
        
        this.clearFieldError(input);
        input.classList.add('valid');
        return true;
    }

    /**
     * Valida força da senha em tempo real
     */
    validatePasswordStrength(senha) {
        const requisitos = {
            maiuscula: /[A-Z]/.test(senha),
            numero: /\d/.test(senha),
            especial: /[!@#$%^&*(),.?":{}|<>]/.test(senha),
            tamanho: senha.length >= 8
        };

        // Atualizar visual dos requisitos
        const reqMaiuscula = document.getElementById('req-maiuscula-funcionario');
        const reqNumero = document.getElementById('req-numero-funcionario');
        const reqEspecial = document.getElementById('req-especial-funcionario');
        const reqTamanho = document.getElementById('req-tamanho-funcionario');

        if (reqMaiuscula) reqMaiuscula.classList.toggle('valid', requisitos.maiuscula);
        if (reqNumero) reqNumero.classList.toggle('valid', requisitos.numero);
        if (reqEspecial) reqEspecial.classList.toggle('valid', requisitos.especial);
        if (reqTamanho) reqTamanho.classList.toggle('valid', requisitos.tamanho);

        return Object.values(requisitos).every(req => req);
    }

    /**
     * Valida campo de senha
     */
    validatePasswordField(input) {
        if (!this.currentEditingId && input.value.trim() === '') {
            this.showFieldError(input, 'Senha é obrigatória para novos usuários');
            return false;
        }

        if (input.value.trim() !== '') {
            if (!this.validatePasswordStrength(input.value)) {
                this.showFieldError(input, 'A senha não atende aos requisitos mínimos');
                return false;
            }
        }
        
        this.clearFieldError(input);
        input.classList.add('valid');
        return true;
    }

    /**
     * Valida campo de confirmação de senha
     */
    validateConfirmPasswordField(input) {
        const senhaField = document.getElementById('senha-funcionario');
        const senha = senhaField ? senhaField.value : '';
        const confirmarSenha = input.value;

        if (senha && confirmarSenha !== senha) {
            this.showFieldError(input, 'As senhas não coincidem');
            input.classList.add('error');
            input.classList.remove('valid');
            return false;
        }

        if (confirmarSenha && confirmarSenha === senha) {
            this.clearFieldError(input);
            input.classList.remove('error');
            input.classList.add('valid');
            return true;
        }

        return true;
    }

    /**
     * Mostra erro em um campo
     */
    showFieldError(input, message) {
        input.classList.add('error');
        input.classList.remove('valid');
        
        const divInput = input.closest('.div-input');
        if (!divInput) return;
        
        let mensagemErro = divInput.querySelector('.mensagem-erro');
        if (!mensagemErro) {
            mensagemErro = document.createElement('div');
            mensagemErro.className = 'mensagem-erro';
            divInput.appendChild(mensagemErro);
        }
        mensagemErro.textContent = message;
    }

    /**
     * Limpa erro de um campo
     */
    clearFieldError(input) {
        input.classList.remove('error', 'valid');
        
        const divInput = input.closest('.div-input');
        if (!divInput) return;
        
        const mensagemErro = divInput.querySelector('.mensagem-erro');
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
            console.warn('Operação já em andamento, ignorando requisição duplicada');
            return;
        }

        if (!this.validateUsuarioForm()) {
            return;
        }

        const usuarioData = this.getUsuarioFormData();

        try {
            // Flag atômica - deve ser a primeira operação
            this.isSubmitting = true;
            const btnSalvar = document.getElementById('salvar-funcionario');
            if (btnSalvar) {
                btnSalvar.disabled = true;
                btnSalvar.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Salvando...';
            }

            await this.dataManager.addUsuario(usuarioData);
            await this.loadUsuarios();
            this.closeUsuarioModal();
            this.showSuccessMessage('Usuário adicionado com sucesso!');
        } catch (error) {
            console.error('Erro ao adicionar usuário:', error);
            this.showErrorMessage('Erro ao adicionar usuário. Tente novamente.');
        } finally {
            this.isSubmitting = false;
            const btnSalvar = document.getElementById('salvar-funcionario');
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
            console.error('ID do usuário não encontrado');
            return;
        }

        try {
            this.isSubmitting = true;
            const btnSalvar = document.getElementById('salvar-funcionario');
            if (btnSalvar) {
                btnSalvar.disabled = true;
                btnSalvar.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Salvando...';
            }

            await this.dataManager.updateUsuario(usuarioId, usuarioData);
            await this.loadUsuarios();
            this.closeUsuarioModal();
            this.showSuccessMessage('Usuário atualizado com sucesso!');
        } catch (error) {
            console.error('Erro ao atualizar usuário:', error);
            this.showErrorMessage('Erro ao atualizar usuário. Tente novamente.');
        } finally {
            this.isSubmitting = false;
            const btnSalvar = document.getElementById('salvar-funcionario');
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
        const nomeField = document.getElementById('nome-funcionario');
        const emailField = document.getElementById('email-funcionario');
        const cargoField = document.getElementById('cargo-funcionario');
        const dataNascimentoField = document.getElementById('nascimento-funcionario');
        const senhaField = document.getElementById('senha-funcionario');
        const confirmarSenhaField = document.getElementById('confirmar-senha-funcionario');
        
        const nome = nomeField ? nomeField.value.trim() : '';
        const email = emailField ? emailField.value.trim() : '';
        const cargo = cargoField ? cargoField.value : '';
        const dataNascimento = dataNascimentoField ? dataNascimentoField.value : '';
        const senha = senhaField ? senhaField.value : '';
        const confirmarSenha = confirmarSenhaField ? confirmarSenhaField.value : '';

        if (!nome) {
            this.showErrorMessage('Nome é obrigatório');
            return false;
        }

        if (!email) {
            this.showErrorMessage('Email é obrigatório');
            return false;
        }

        if (!this.isValidEmail(email)) {
            this.showErrorMessage('Email inválido');
            return false;
        }

        if (!dataNascimento) {
            this.showErrorMessage('Data de nascimento é obrigatória');
            return false;
        }

        if (!cargo) {
            this.showErrorMessage('Cargo é obrigatório');
            return false;
        }

        // Validação de senha para novos usuários
        if (!this.currentEditingId) {
            if (!senha) {
                this.showErrorMessage('Senha é obrigatória para novos usuários');
                return false;
            }

            if (senha !== confirmarSenha) {
                this.showErrorMessage('As senhas não coincidem');
                return false;
            }

            if (senha.length < 8) {
                this.showErrorMessage('A senha deve ter pelo menos 8 caracteres');
                return false;
            }
        }

        // Validação de senha para edição (se preenchida)
        if (this.currentEditingId && senha) {
            if (senha !== confirmarSenha) {
                this.showErrorMessage('As senhas não coincidem');
                return false;
            }

            if (senha.length < 8) {
                this.showErrorMessage('A senha deve ter pelo menos 8 caracteres');
                return false;
            }
        }

        return true;
    }

    /**
     * Valida email
     */
    isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    /**
     * Obtém dados do formulário
     */
    getUsuarioFormData() {
        const nomeField = document.getElementById('nome-funcionario');
        const emailField = document.getElementById('email-funcionario');
        const cargoField = document.getElementById('cargo-funcionario');
        const telefoneField = document.getElementById('telefone-funcionario');
        const nascimentoField = document.getElementById('nascimento-funcionario');
        const senhaField = document.getElementById('senha-funcionario');
        
        const formData = {
            full_name: nomeField ? nomeField.value.trim() : '',
            email: emailField ? emailField.value.trim() : '',
            role: cargoField ? cargoField.value : '',
            phone: telefoneField ? telefoneField.value.trim() : '',
            date_of_birth: nascimentoField ? nascimentoField.value : '',
            is_active: true
        };

        // Adicionar senha apenas se for um novo usuário ou se foi preenchida
        const senha = senhaField ? senhaField.value : '';
        if (senha && senha.trim()) {
            formData.password = senha;
        }

        return formData;
    }

    /**
     * Abre modal de métricas
     */
    openMetricasModal(usuario) {
        const modal = document.getElementById('modal-metricas');
        if (!modal) {
            console.error('Modal de métricas não encontrada!');
            return;
        }

        // Popula dados do usuário
        this.populateUsuarioMetricas(usuario);

        // Usar sistema universal de modais se disponível
        if (window.abrirModal) {
            window.abrirModal('modal-metricas');
        } else {
            modal.style.display = 'flex';
            document.body.style.overflow = 'hidden';
        }
    }

    /**
     * Fecha modal de métricas
     */
    closeMetricasModal() {
        const modal = document.getElementById('modal-metricas');
        if (modal) {
            if (window.fecharModal) {
                window.fecharModal('modal-metricas');
            } else {
                modal.style.display = 'none';
                document.body.style.overflow = 'auto';
            }
        }
    }

    /**
     * Popula dados do usuário na modal de métricas
     */
    populateUsuarioMetricas(usuario) {
        // Validação e sanitização dos dados (XSS Protection)
        const nome = this.sanitizeHTML(usuario.nome || usuario.full_name || 'Nome não informado');
        const email = this.sanitizeHTML(usuario.email || 'Email não informado');
        const telefone = usuario.telefone || usuario.phone || 'Não informado';
        const cpf = usuario.cpf || 'Não informado';
        const roleAPI = usuario.role || usuario.cargo || 'attendant';
        const dataNascimento = usuario.date_of_birth || usuario.nascimento || null;
        const dataCriacao = usuario.created_at || usuario.dataCriacao || null;

        // 1. Iniciais do avatar
        const iniciaisElement = document.getElementById('iniciais-funcionario');
        if (iniciaisElement) {
            iniciaisElement.textContent = this.generateIniciais(nome);
        }

        // 2. Nome
        const nomeElement = document.getElementById('nome-funcionario-metricas');
        if (nomeElement) {
            nomeElement.textContent = nome;
        }

        // 3. Cargo
        const cargoElement = document.getElementById('cargo-funcionario-metricas');
        if (cargoElement) {
            const cargoText = this.getCargoText(roleAPI);
            const cargoClass = this.getCargoClass(roleAPI);
            cargoElement.textContent = cargoText;
            // Remover classes antigas de cargo
            cargoElement.className = 'cargo-tag ' + cargoClass;
        }

        // 4. Email
        const emailElement = document.getElementById('email-funcionario-metricas');
        if (emailElement) {
            emailElement.textContent = email;
        }

        // 5. Tempo em atividade
        const tempoAtividadeElement = document.getElementById('tempo-atividade');
        if (tempoAtividadeElement && dataCriacao) {
            const tempoAtividade = this.calcularTempoAtividade(dataCriacao);
            tempoAtividadeElement.textContent = tempoAtividade;
        } else if (tempoAtividadeElement) {
            tempoAtividadeElement.textContent = 'Não informado';
        }

        // 6. CPF
        const cpfElement = document.getElementById('cpf-funcionario');
        if (cpfElement) {
            cpfElement.textContent = this.formatarCPF(cpf);
        }

        // 7. Data de nascimento
        const nascimentoElement = document.getElementById('nascimento-funcionario');
        if (nascimentoElement) {
            nascimentoElement.textContent = this.formatarDataBR(dataNascimento);
        }

        // 8. Telefone
        const telefoneElement = document.getElementById('telefone-funcionario');
        if (telefoneElement) {
            telefoneElement.textContent = this.formatarTelefone(telefone);
        }

        // 9. Ocultar métricas de performance por enquanto
        const metricasPerformance = document.querySelector('.metricas-performance');
        if (metricasPerformance) {
            metricasPerformance.style.display = 'none';
        }
    }

    /**
     * Calcula tempo de atividade desde a criação da conta
     */
    calcularTempoAtividade(dataCriacao) {
        try {
            if (!dataCriacao) {
                return 'Não informado';
            }

            const dataInicio = new Date(dataCriacao);
            
            if (isNaN(dataInicio.getTime())) {
                return 'Não informado';
            }

            const hoje = new Date();
            const diffTime = Math.abs(hoje - dataInicio);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            
            if (diffDays === 0) {
                return 'Hoje';
            } else if (diffDays === 1) {
                return '1 dia';
            } else if (diffDays < DAYS_PER_MONTH) {
                return `${diffDays} dias`;
            } else if (diffDays < DAYS_PER_YEAR) {
                const meses = Math.floor(diffDays / DAYS_PER_MONTH);
                return meses === 1 ? '1 mês' : `${meses} meses`;
            } else {
                const anos = Math.floor(diffDays / DAYS_PER_YEAR);
                const mesesRestantes = Math.floor((diffDays % DAYS_PER_YEAR) / DAYS_PER_MONTH);
                if (mesesRestantes === 0) {
                    return anos === 1 ? '1 ano' : `${anos} anos`;
                }
                return `${anos} ${anos === 1 ? 'ano' : 'anos'} e ${mesesRestantes} ${mesesRestantes === 1 ? 'mês' : 'meses'}`;
            }
        } catch (error) {
            console.error('Erro ao calcular tempo de atividade:', error);
            return 'Não informado';
        }
    }

    /**
     * Formata CPF para exibição
     */
    formatarCPF(cpf) {
        if (!cpf || cpf === 'Não informado') {
            return 'Não informado';
        }
        
        const cpfLimpo = String(cpf).replace(/\D/g, '');
        if (cpfLimpo.length === 11) {
            return cpfLimpo.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
        }
        return cpf;
    }

    /**
     * Formata data para formato brasileiro (DD/MM/YYYY)
     */
    formatarDataBR(data) {
        if (!data) {
            return 'Não informado';
        }
        
        try {
            // Se já está no formato DD/MM/YYYY
            if (String(data).includes('/')) {
                return data;
            }
            
            // Se está no formato YYYY-MM-DD ou ISO
            const dataObj = new Date(data);
            if (isNaN(dataObj.getTime())) {
                return 'Data inválida';
            }
            
            const dia = String(dataObj.getDate()).padStart(2, '0');
            const mes = String(dataObj.getMonth() + 1).padStart(2, '0');
            const ano = dataObj.getFullYear();
            
            return `${dia}/${mes}/${ano}`;
        } catch (error) {
            console.error('Erro ao formatar data:', error);
            return 'Não informado';
        }
    }

    /**
     * Formata telefone para exibição
     */
    formatarTelefone(telefone) {
        if (!telefone || telefone === 'Não informado') {
            return 'Não informado';
        }
        
        if (typeof telefone !== 'string' && typeof telefone !== 'number') {
            return 'Não informado';
        }
        
        const telefoneLimpo = String(telefone).replace(/\D/g, '');
        
        if (telefoneLimpo.length === 11) {
            return telefoneLimpo.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
        } else if (telefoneLimpo.length === 10) {
            return telefoneLimpo.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
        }
        
        return telefone;
    }

    /**
     * Gera iniciais do nome
     */
    generateIniciais(nome) {
        if (!nome || typeof nome !== 'string') {
            return 'U?';
        }
        
        return nome.split(' ')
            .filter(word => word.length > 0)
            .map(word => word.charAt(0))
            .join('')
            .toUpperCase()
            .substring(0, MAX_INICIAIS_LENGTH);
    }

    /**
     * Obtém texto do cargo
     */
    getCargoText(cargo) {
        const mapping = {
            'admin': 'Administrador',
            'manager': 'Gerente',
            'attendant': 'Atendente',
            'delivery': 'Entregador',
            'customer': 'Cliente'
        };
        return mapping[cargo] || 'Atendente';
    }

    /**
     * Obtém classe CSS do cargo
     */
    getCargoClass(cargo) {
        const mapping = {
            'admin': 'admin',
            'manager': 'gerente',
            'attendant': 'atendente',
            'delivery': 'entregador',
            'customer': 'cliente'
        };
        return mapping[cargo] || 'atendente';
    }

    /**
     * Exibe mensagem de sucesso
     */
    showSuccessMessage(message) {
        showToast(message, { type: 'success', title: 'Sucesso' });
    }

    /**
     * Exibe mensagem de erro
     */
    showErrorMessage(message) {
        showToast(message, { type: 'error', title: 'Erro' });
    }
}

// Exporta a classe principal
export { UsuarioManager };
