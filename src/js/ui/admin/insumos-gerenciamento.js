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
    getStockSummary
} from '../../api/ingredients.js';

import { showToast } from '../alerts.js';

/**
 * Gerenciador de dados de insumos
 */
class InsumoDataManager {
    constructor() {
        this.cache = {
            data: null,
            lastFetch: null
        };
        this.cacheTimeout = 5 * 60 * 1000; // 5 minutos
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
     * Busca todos os insumos
     */
    async getAllInsumos(options = {}) {
        try {
            if (this.isCacheValid() && !options.forceRefresh) {
                return this.cache.data;
            }

            const response = await getIngredients(options);
            this.cache.data = response;
            this.cache.lastFetch = Date.now();
            
            return response;
        } catch (error) {
            console.error('Erro ao buscar insumos:', error);
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
                categoria: insumo.category || 'outros',
                custo: parseFloat(insumo.price) || 0,
                unidade: insumo.stock_unit || 'un',
                min: parseInt(insumo.min_stock_threshold) || 0,
                max: parseInt(insumo.max_stock_threshold) || 100,
                atual: parseInt(insumo.current_stock) || 0,
                ativo: insumo.is_available !== undefined ? insumo.is_available : true,
                fornecedor: insumo.supplier || 'Não informado',
                ultimaAtualizacao: insumo.updated_at || new Date().toISOString().split('T')[0]
            };
        } catch (error) {
            console.error('Erro ao buscar insumo:', error);
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
                current_stock: parseInt(insumoData.atual) || 0,
                stock_unit: insumoData.unidade || 'un',
                min_stock_threshold: parseInt(insumoData.min) || 0,
                max_stock_threshold: parseInt(insumoData.max) || 100,
                supplier: insumoData.fornecedor || '',
                category: insumoData.categoria || 'outros'
            };

            await createIngredient(apiData);
            this.clearCache();
        } catch (error) {
            console.error('Erro ao adicionar insumo:', error);
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
                is_available: insumoData.ativo !== undefined ? insumoData.ativo : true,
                current_stock: parseInt(insumoData.atual) || 0,
                stock_unit: insumoData.unidade || 'un',
                min_stock_threshold: parseInt(insumoData.min) || 0,
                max_stock_threshold: parseInt(insumoData.max) || 100,
                supplier: insumoData.fornecedor || '',
                category: insumoData.categoria || 'outros'
            };

            await updateIngredient(id, apiData);
            this.clearCache();
        } catch (error) {
            console.error('Erro ao atualizar insumo:', error);
            throw error;
        }
    }

    /**
     * Alterna disponibilidade do insumo
     */
    async toggleInsumoAvailability(id, novoStatus) {
        try {
            await updateIngredientAvailability(id, novoStatus);
            this.clearCache();
        } catch (error) {
            console.error('Erro ao alterar disponibilidade do insumo:', error);
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
            console.error('Erro ao ajustar estoque do insumo:', error);
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
            console.error('Erro ao buscar resumo do estoque:', error);
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
            console.error('Erro ao inicializar módulo de insumos:', error);
            this.showErrorMessage('Erro ao carregar dados dos insumos');
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
        const section = document.getElementById('secao-estoque');
        if (!section) return;

        // Event delegation para botões de editar
        section.addEventListener('click', (e) => {
            if (e.target.matches('.editar')) {
                this.handleEditClick(e.target);
            }
        });

        // Event delegation para toggles
        section.addEventListener('change', (e) => {
            if (e.target.matches('.toggle input[type="checkbox"]')) {
                this.handleToggleChange(e.target);
            }
        });

        // Event delegation para botões de quantidade
        section.addEventListener('click', (e) => {
            if (e.target.matches('.btn-quantidade')) {
                this.handleQuantityChange(e.target);
            }
        });

        // Event delegation para botão novo insumo
        section.addEventListener('click', (e) => {
            if (e.target.matches('.btn-novo-insumo')) {
                this.handleNewInsumo();
            }
        });
    }

    /**
     * Configura handlers de filtros
     */
    setupFilterHandlers() {
        const categoriaFilter = document.getElementById('categoria-estoque');
        const statusFilter = document.getElementById('status-estoque');

        if (categoriaFilter) {
            categoriaFilter.addEventListener('change', (e) => {
                this.handleCategoriaFilter(e.target.value);
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
        const searchInput = document.getElementById('buscar-estoque');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.handleSearch(e.target.value);
            });
        }
    }

    /**
     * Carrega insumos
     */
    async loadInsumos() {
        try {
            const insumos = await this.dataManager.getAllInsumos();
            this.renderInsumoCards(insumos);
        } catch (error) {
            console.error('Erro ao carregar insumos:', error);
            this.showErrorMessage('Erro ao carregar insumos');
        }
    }

    /**
     * Carrega resumo do estoque
     */
    async loadResumoEstoque() {
        try {
            const resumo = await this.dataManager.getResumoEstoque();
            this.updateResumoCards(resumo);
        } catch (error) {
            console.error('Erro ao carregar resumo do estoque:', error);
        }
    }

    /**
     * Renderiza cards de insumos
     */
    renderInsumoCards(insumos) {
        const container = document.querySelector('#secao-estoque .ingredientes');
        if (!container) return;

        container.innerHTML = '';

        if (!insumos || insumos.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fa-solid fa-box-open"></i>
                    <p>Nenhum insumo encontrado</p>
                </div>
            `;
            return;
        }

        insumos.forEach(insumo => {
            const card = this.createInsumoCard(insumo);
            container.appendChild(card);
        });
    }

    /**
     * Cria card de insumo
     */
    createInsumoCard(insumo) {
        const card = document.createElement('div');
        card.className = 'card-ingrediente';
        card.dataset.ingredientId = insumo.id;

        const statusClass = this.getStatusClass(insumo);
        const statusText = this.getStatusText(insumo);
        const categoriaNome = this.getCategoriaNome(insumo.categoria);

        card.innerHTML = `
            <div class="card-header">
                <div class="ingrediente-info">
                    <h3>${insumo.nome}</h3>
                    <p class="categoria">${categoriaNome}</p>
                </div>
                <div class="status ${statusClass}">
                    <span>${statusText}</span>
                </div>
            </div>
            
            <div class="card-body">
                <div class="info-item">
                    <i class="fa-solid fa-dollar-sign"></i>
                    <span>R$ ${insumo.custo.toFixed(2).replace('.', ',')}</span>
                </div>
                <div class="info-item">
                    <i class="fa-solid fa-weight-hanging"></i>
                    <span>${insumo.atual} ${insumo.unidade}</span>
                </div>
                <div class="info-item">
                    <i class="fa-solid fa-chart-line"></i>
                    <span>Min: ${insumo.min} | Max: ${insumo.max}</span>
                </div>
                <div class="info-item">
                    <i class="fa-solid fa-truck"></i>
                    <span>${insumo.fornecedor}</span>
                </div>
            </div>
            
            <div class="card-footer">
                <div class="quantidade-controls">
                    <button class="btn-quantidade btn-decrease" data-change="-1">
                        <i class="fa-solid fa-minus"></i>
                    </button>
                    <span class="quantidade-atual">${insumo.atual}</span>
                    <button class="btn-quantidade btn-increase" data-change="1">
                        <i class="fa-solid fa-plus"></i>
                    </button>
                </div>
                
                <div class="toggle">
                    <label class="switch">
                        <input type="checkbox" ${insumo.ativo ? 'checked' : ''}>
                        <span class="slider"></span>
                    </label>
                    <span class="toggle-label">${insumo.ativo ? 'Ativo' : 'Inativo'}</span>
                </div>
                
                <div class="actions">
                    <button class="btn btn-secondary editar" title="Editar insumo">
                        <i class="fa-solid fa-edit"></i>
                    </button>
                </div>
            </div>
        `;

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
        const card = button.closest('.card-ingrediente');
        const insumoId = parseInt(card.dataset.ingredientId);

        try {
            const insumo = await this.dataManager.getInsumoById(insumoId);
            if (insumo) {
                this.currentEditingId = insumoId;
                this.openInsumoModal(insumo);
            }
        } catch (error) {
            console.error('Erro ao buscar insumo para edição:', error);
            this.showErrorMessage('Erro ao carregar dados do insumo');
        }
    }

    /**
     * Trata mudança no toggle
     */
    async handleToggleChange(toggle) {
        const card = toggle.closest('.card-ingrediente');
        const insumoId = parseInt(card.dataset.ingredientId);
        const novoStatus = toggle.checked;

        try {
            await this.dataManager.toggleInsumoAvailability(insumoId, novoStatus);
            
            // Atualizar visual
            const statusElement = card.querySelector('.status');
            const statusText = card.querySelector('.status span');
            const toggleLabel = card.querySelector('.toggle-label');
            
            if (novoStatus) {
                statusElement.className = 'status ativo';
                statusText.textContent = 'Ativo';
                toggleLabel.textContent = 'Ativo';
            } else {
                statusElement.className = 'status inativo';
                statusText.textContent = 'Inativo';
                toggleLabel.textContent = 'Inativo';
            }

            this.showSuccessMessage(`Insumo ${novoStatus ? 'ativado' : 'desativado'} com sucesso!`);
        } catch (error) {
            console.error('Erro ao alterar status do insumo:', error);
            this.showErrorMessage('Erro ao alterar status do insumo');
            
            // Reverter toggle
            toggle.checked = !novoStatus;
        }
    }

    /**
     * Trata mudança na quantidade
     */
    async handleQuantityChange(button) {
        const card = button.closest('.card-ingrediente');
        const insumoId = parseInt(card.dataset.ingredientId);
        const changeAmount = parseInt(button.dataset.change);

        button.disabled = true;

        try {
            await this.dataManager.adjustInsumoStock(insumoId, changeAmount);
            
            // Atualizar visual
            const quantidadeAtual = card.querySelector('.quantidade-atual');
            const currentValue = parseInt(quantidadeAtual.textContent);
            const newValue = Math.max(0, currentValue + changeAmount);
            quantidadeAtual.textContent = newValue;

            // Atualizar status do card
            this.updateCardStatus(card, newValue);

            this.showSuccessMessage(`Estoque ajustado com sucesso!`);
        } catch (error) {
            console.error('Erro ao ajustar estoque:', error);
            this.showErrorMessage('Erro ao ajustar estoque do insumo');
        } finally {
            // Reabilitar botão após um pequeno delay
            setTimeout(() => {
                button.disabled = false;
            }, 100);
        }
    }

    /**
     * Atualiza status visual do card baseado na quantidade
     */
    updateCardStatus(card, currentQuantity) {
        const minQuantity = parseInt(card.querySelector('.info-item span').textContent.split('Min: ')[1].split(' |')[0]);
        const maxQuantity = parseInt(card.querySelector('.info-item span').textContent.split('Max: ')[1]);
        
        const statusElement = card.querySelector('.status');
        const statusText = card.querySelector('.status span');

        if (currentQuantity === 0) {
            statusElement.className = 'status sem-estoque';
            statusText.textContent = 'Sem estoque';
        } else if (currentQuantity <= minQuantity) {
            statusElement.className = 'status estoque-baixo';
            statusText.textContent = 'Estoque baixo';
        } else if (currentQuantity >= maxQuantity) {
            statusElement.className = 'status estoque-alto';
            statusText.textContent = 'Estoque alto';
        } else {
            statusElement.className = 'status ativo';
            statusText.textContent = 'Ativo';
        }
    }

    /**
     * Trata filtro por categoria
     */
    handleCategoriaFilter(categoria) {
        const cards = document.querySelectorAll('.card-ingrediente');
        cards.forEach(card => {
            const cardCategoria = card.querySelector('.categoria').textContent.toLowerCase();
            const shouldShow = categoria === 'todos' || cardCategoria.includes(categoria.toLowerCase());
            card.style.display = shouldShow ? 'block' : 'none';
        });
    }

    /**
     * Trata filtro por status
     */
    handleStatusFilter(status) {
        const cards = document.querySelectorAll('.card-ingrediente');
        cards.forEach(card => {
            const statusElement = card.querySelector('.status');
            const shouldShow = status === 'todos' || statusElement.classList.contains(status);
            card.style.display = shouldShow ? 'block' : 'none';
        });
    }

    /**
     * Trata busca
     */
    handleSearch(searchTerm) {
        const cards = document.querySelectorAll('.card-ingrediente');
        const term = searchTerm.toLowerCase();

        cards.forEach(card => {
            const nome = card.querySelector('h3').textContent.toLowerCase();
            const categoria = card.querySelector('.categoria').textContent.toLowerCase();
            const shouldShow = nome.includes(term) || categoria.includes(term);
            card.style.display = shouldShow ? 'block' : 'none';
        });
    }

    /**
     * Abre modal de insumo
     */
    openInsumoModal(insumoData = null) {
        const modal = document.getElementById('modal-ingrediente');
        if (!modal) return;

        const titulo = document.getElementById('titulo-modal-ingrediente');
        const btnSalvar = document.getElementById('salvar-ingrediente');

        if (insumoData) {
            titulo.textContent = 'Editar insumo';
            btnSalvar.innerHTML = '<i class="fa-solid fa-save"></i> Salvar';
            this.populateInsumoForm(insumoData);
        } else {
            titulo.textContent = 'Adicionar novo insumo';
            btnSalvar.innerHTML = '<i class="fa-solid fa-plus"></i> Adicionar';
            this.clearInsumoForm();
        }

        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
        this.setupInsumoModalListeners(insumoData);
    }

    /**
     * Fecha modal de insumo
     */
    closeInsumoModal() {
        const modal = document.getElementById('modal-ingrediente');
        if (modal) {
            modal.style.display = 'none';
            document.body.style.overflow = 'auto';
        }
        this.currentEditingId = null;
    }

    /**
     * Popula formulário de insumo
     */
    populateInsumoForm(insumoData) {
        document.getElementById('nome-ingrediente').value = insumoData.nome || '';
        document.getElementById('fornecedor-ingrediente').value = insumoData.fornecedor || '';
        document.getElementById('categoria-ingrediente').value = insumoData.categoria || '';
        document.getElementById('custo-ingrediente').value = insumoData.custo ? `R$ ${insumoData.custo.toFixed(2).replace('.', ',')}` : '';
        document.getElementById('unidade-ingrediente').value = insumoData.unidade || '';
        document.getElementById('estoque-minimo-ingrediente').value = insumoData.min || '';
        document.getElementById('estoque-maximo-ingrediente').value = insumoData.max || '';
    }

    /**
     * Limpa formulário de insumo
     */
    clearInsumoForm() {
        document.getElementById('nome-ingrediente').value = '';
        document.getElementById('fornecedor-ingrediente').value = '';
        document.getElementById('categoria-ingrediente').value = '';
        document.getElementById('custo-ingrediente').value = '';
        document.getElementById('unidade-ingrediente').value = '';
        document.getElementById('estoque-minimo-ingrediente').value = '';
        document.getElementById('estoque-maximo-ingrediente').value = '';
    }

    /**
     * Configura listeners do modal
     */
    setupInsumoModalListeners(insumoData = null) {
        // Botão fechar
        const btnFechar = document.querySelector('#modal-ingrediente .fechar-modal');
        if (btnFechar) {
            btnFechar.addEventListener('click', () => this.closeInsumoModal());
        }

        // Botão cancelar
        const btnCancelar = document.getElementById('cancelar-ingrediente');
        if (btnCancelar) {
            btnCancelar.addEventListener('click', () => this.closeInsumoModal());
        }

        // Botão salvar
        const btnSalvar = document.getElementById('salvar-ingrediente');
        if (btnSalvar) {
            btnSalvar.addEventListener('click', () => {
                if (insumoData) {
                    this.handleEditInsumo();
                } else {
                    this.handleAddInsumo();
                }
            });
        }

        // Overlay
        const overlay = document.querySelector('#modal-ingrediente .div-overlay');
        if (overlay) {
            overlay.addEventListener('click', () => this.closeInsumoModal());
        }

        // Formatação de campos
        this.setupFieldFormatting();
    }

    /**
     * Configura formatação de campos
     */
    setupFieldFormatting() {
        const custoField = document.getElementById('custo-ingrediente');
        if (custoField) {
            custoField.addEventListener('input', (e) => {
                this.formatCurrencyInput(e.target);
            });
        }
    }

    /**
     * Formata input de moeda
     */
    formatCurrencyInput(input) {
        let value = input.value.replace(/\D/g, '');
        if (value) {
            const valorEmReais = parseInt(value) / 100;
            value = valorEmReais.toLocaleString('pt-BR', {
                style: 'currency',
                currency: 'BRL',
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            });
        }
        input.value = value;
    }

    /**
     * Trata adição de insumo
     */
    async handleAddInsumo() {
        if (!this.validateInsumoForm()) {
            return;
        }

        const insumoData = this.getInsumoFormData();

        try {
            await this.dataManager.addInsumo(insumoData);
            await this.loadInsumos();
            await this.loadResumoEstoque();
            this.closeInsumoModal();
            this.showSuccessMessage('Insumo adicionado com sucesso!');
        } catch (error) {
            console.error('Erro ao adicionar insumo:', error);
            this.showErrorMessage('Erro ao adicionar insumo. Tente novamente.');
        }
    }

    /**
     * Trata edição de insumo
     */
    async handleEditInsumo() {
        if (!this.validateInsumoForm()) {
            return;
        }

        const insumoData = this.getInsumoFormData();
        const insumoId = this.currentEditingId;

        if (!insumoId) {
            console.error('ID do insumo não encontrado');
            return;
        }

        try {
            await this.dataManager.updateInsumo(insumoId, insumoData);
            await this.loadInsumos();
            await this.loadResumoEstoque();
            this.closeInsumoModal();
            this.showSuccessMessage('Insumo atualizado com sucesso!');
        } catch (error) {
            console.error('Erro ao atualizar insumo:', error);
            this.showErrorMessage('Erro ao atualizar insumo. Tente novamente.');
        }
    }

    /**
     * Valida formulário de insumo
     */
    validateInsumoForm() {
        const nome = document.getElementById('nome-ingrediente').value.trim();
        const categoria = document.getElementById('categoria-ingrediente').value;
        const custo = document.getElementById('custo-ingrediente').value.trim();
        const unidade = document.getElementById('unidade-ingrediente').value.trim();
        const min = document.getElementById('estoque-minimo-ingrediente').value;
        const max = document.getElementById('estoque-maximo-ingrediente').value;

        if (!nome) {
            this.showErrorMessage('Nome é obrigatório');
            return false;
        }

        if (!categoria) {
            this.showErrorMessage('Categoria é obrigatória');
            return false;
        }

        if (!custo) {
            this.showErrorMessage('Custo é obrigatório');
            return false;
        }

        if (!unidade) {
            this.showErrorMessage('Unidade é obrigatória');
            return false;
        }

        if (!min || parseInt(min) < 0) {
            this.showErrorMessage('Estoque mínimo deve ser maior ou igual a zero');
            return false;
        }

        if (!max || parseInt(max) < 0) {
            this.showErrorMessage('Estoque máximo deve ser maior ou igual a zero');
            return false;
        }

        if (parseInt(min) > parseInt(max)) {
            this.showErrorMessage('Estoque mínimo não pode ser maior que o estoque máximo');
            return false;
        }

        return true;
    }

    /**
     * Obtém dados do formulário
     */
    getInsumoFormData() {
        const custo = document.getElementById('custo-ingrediente').value.replace('R$', '').replace(',', '.').trim();

        return {
            nome: document.getElementById('nome-ingrediente').value.trim(),
            fornecedor: document.getElementById('fornecedor-ingrediente').value.trim(),
            categoria: document.getElementById('categoria-ingrediente').value,
            custo: parseFloat(custo) || 0,
            unidade: document.getElementById('unidade-ingrediente').value.trim(),
            min: parseInt(document.getElementById('estoque-minimo-ingrediente').value) || 0,
            max: parseInt(document.getElementById('estoque-maximo-ingrediente').value) || 0,
            atual: 0, // Novo insumo começa com estoque zero
            ativo: true
        };
    }

    /**
     * Atualiza cards de resumo
     */
    updateResumoCards(resumo) {
        const totalValueElement = document.getElementById('valor-total-estoque');
        const outOfStockElement = document.getElementById('sem-estoque-count');
        const lowStockElement = document.getElementById('estoque-baixo-count');
        const inStockElement = document.getElementById('em-estoque-count');

        if (totalValueElement) {
            totalValueElement.textContent = `R$ ${resumo.total_stock_value.toFixed(2).replace('.', ',')}`;
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
        if (insumo.atual === 0) return 'sem-estoque';
        if (insumo.atual <= insumo.min) return 'estoque-baixo';
        if (insumo.atual >= insumo.max) return 'estoque-alto';
        return 'ativo';
    }

    /**
     * Obtém texto de status
     */
    getStatusText(insumo) {
        if (insumo.atual === 0) return 'Sem estoque';
        if (insumo.atual <= insumo.min) return 'Estoque baixo';
        if (insumo.atual >= insumo.max) return 'Estoque alto';
        return 'Ativo';
    }

    /**
     * Obtém nome da categoria
     */
    getCategoriaNome(categoria) {
        const mapping = {
            'carnes': 'Carnes',
            'aves': 'Aves',
            'peixes': 'Peixes',
            'vegetais': 'Vegetais',
            'laticinios': 'Laticínios',
            'temperos': 'Temperos',
            'bebidas': 'Bebidas',
            'doces': 'Doces',
            'farinhas': 'Farinhas',
            'embalagens': 'Embalagens',
            'outros': 'Outros'
        };
        return mapping[categoria] || 'Outros';
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
export { InsumoManager };
