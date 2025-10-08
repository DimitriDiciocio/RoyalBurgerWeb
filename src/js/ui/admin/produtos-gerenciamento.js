/**
 * Módulo de Gerenciamento de Produtos
 * Responsável por todas as operações relacionadas a produtos do cardápio
 */

import { 
    createProduct, 
    updateProduct, 
    deleteProduct,
    getProducts,
    getProductById,
    reactivateProduct,
    addIngredientToProduct,
    removeIngredientFromProduct,
    getProductIngredients
} from '../../api/products.js';

import { getIngredients } from '../../api/ingredients.js';
import { getCategories } from '../../api/categories.js';
import { showToast } from '../alerts.js';

/**
 * Gerenciador de dados de produtos
 */
class ProdutoDataManager {
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
     * Busca todos os produtos
     */
    async getAllProdutos(options = {}) {
        try {
            if (this.isCacheValid() && !options.forceRefresh) {
                return this.cache.data;
            }

            const response = await getProducts(options);
            this.cache.data = response;
            this.cache.lastFetch = Date.now();
            
            return response;
        } catch (error) {
            console.error('Erro ao buscar produtos:', error);
            throw error;
        }
    }

    /**
     * Busca produto por ID
     */
    async getProdutoById(id) {
        try {
            const produto = await getProductById(id);
            
            return {
                id: produto.id,
                nome: produto.name,
                descricao: produto.description || '',
                preco: parseFloat(produto.price) || 0,
                precoCusto: parseFloat(produto.cost_price) || 0,
                tempoPreparo: parseInt(produto.preparation_time_minutes) || 0,
                categoriaId: produto.category_id || null,
                imagem: produto.image_url || '',
                ativo: produto.is_active !== undefined ? produto.is_active : true,
                dataCriacao: produto.created_at || new Date().toISOString().split('T')[0],
                ultimaAtualizacao: produto.updated_at || new Date().toISOString().split('T')[0]
            };
        } catch (error) {
            console.error('Erro ao buscar produto:', error);
            throw error;
        }
    }

    /**
     * Adiciona novo produto
     */
    async addProduto(produtoData) {
        try {
            const apiData = {
                name: produtoData.nome,
                description: produtoData.descricao,
                price: parseFloat(produtoData.preco) || 0,
                cost_price: parseFloat(produtoData.precoCusto) || 0,
                preparation_time_minutes: parseInt(produtoData.tempoPreparo) || 0,
                category_id: produtoData.categoriaId || null,
                image_url: produtoData.imagem || '',
                is_active: produtoData.ativo !== undefined ? produtoData.ativo : true
            };

            await createProduct(apiData);
            this.clearCache();
        } catch (error) {
            console.error('Erro ao adicionar produto:', error);
            throw error;
        }
    }

    /**
     * Atualiza produto
     */
    async updateProduto(id, produtoData) {
        try {
            const apiData = {
                name: produtoData.nome,
                description: produtoData.descricao,
                price: parseFloat(produtoData.preco) || 0,
                cost_price: parseFloat(produtoData.precoCusto) || 0,
                preparation_time_minutes: parseInt(produtoData.tempoPreparo) || 0,
                category_id: produtoData.categoriaId || null,
                image_url: produtoData.imagem || '',
                is_active: produtoData.ativo !== undefined ? produtoData.ativo : true
            };

            await updateProduct(id, apiData);
            this.clearCache();
        } catch (error) {
            console.error('Erro ao atualizar produto:', error);
            throw error;
        }
    }

    /**
     * Alterna status do produto
     */
    async toggleProdutoStatus(id, novoStatus) {
        try {
            if (novoStatus) {
                await reactivateProduct(id);
            } else {
                await deleteProduct(id); // Soft delete
            }
            this.clearCache();
        } catch (error) {
            console.error('Erro ao alterar status do produto:', error);
            throw error;
        }
    }

    /**
     * Busca ingredientes do produto
     */
    async getIngredientesProduto(productId) {
        try {
            const response = await getProductIngredients(productId);
            return response;
        } catch (error) {
            console.error('Erro ao buscar ingredientes do produto:', error);
            throw error;
        }
    }

    /**
     * Adiciona ingrediente ao produto
     */
    async addIngredienteAoProduto(productId, ingredientId, quantity, unit) {
        try {
            await addIngredientToProduct(productId, ingredientId, quantity, unit);
            this.clearCache();
        } catch (error) {
            console.error('Erro ao adicionar ingrediente ao produto:', error);
            throw error;
        }
    }

    /**
     * Remove ingrediente do produto
     */
    async removeIngredienteDoProduto(productId, ingredientId) {
        try {
            await removeIngredientFromProduct(productId, ingredientId);
            this.clearCache();
        } catch (error) {
            console.error('Erro ao remover ingrediente do produto:', error);
            throw error;
        }
    }
}

/**
 * Gerenciador de interface de produtos
 */
class ProdutoManager {
    constructor() {
        this.dataManager = new ProdutoDataManager();
        this.currentEditingId = null;
        this.ingredientesDisponiveis = [];
        this.categorias = [];
    }

    /**
     * Inicializa o módulo
     */
    async init() {
        try {
            await this.loadProdutos();
            await this.loadIngredientesDisponiveis();
            await this.loadCategorias();
            this.setupEventListeners();
        } catch (error) {
            console.error('Erro ao inicializar módulo de produtos:', error);
            this.showErrorMessage('Erro ao carregar dados dos produtos');
        }
    }

    /**
     * Configura event listeners
     */
    setupEventListeners() {
        this.setupProdutoHandlers();
        this.setupFilterHandlers();
        this.setupSearchHandlers();
    }

    /**
     * Configura handlers específicos de produtos
     */
    setupProdutoHandlers() {
        const section = document.getElementById('secao-cardapio');
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

        // Event delegation para botão novo produto
        section.addEventListener('click', (e) => {
            if (e.target.matches('.btn-novo-produto')) {
                this.handleNewProduto();
            }
        });
    }

    /**
     * Configura handlers de filtros
     */
    setupFilterHandlers() {
        const categoriaFilter = document.getElementById('categoria-produtos');
        const statusFilter = document.getElementById('status-produtos');

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
        const searchInput = document.getElementById('buscar-produtos');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.handleSearch(e.target.value);
            });
        }
    }

    /**
     * Carrega produtos
     */
    async loadProdutos() {
        try {
            const produtos = await this.dataManager.getAllProdutos();
            this.renderProdutoCards(produtos);
        } catch (error) {
            console.error('Erro ao carregar produtos:', error);
            this.showErrorMessage('Erro ao carregar produtos');
        }
    }

    /**
     * Carrega ingredientes disponíveis
     */
    async loadIngredientesDisponiveis() {
        try {
            const response = await getIngredients();
            this.ingredientesDisponiveis = response.items || [];
        } catch (error) {
            console.error('Erro ao carregar ingredientes:', error);
        }
    }

    /**
     * Carrega categorias
     */
    async loadCategorias() {
        try {
            const response = await getCategories();
            this.categorias = response.items || [];
        } catch (error) {
            console.error('Erro ao carregar categorias:', error);
        }
    }

    /**
     * Renderiza cards de produtos
     */
    renderProdutoCards(produtos) {
        const container = document.querySelector('#secao-cardapio .produtos');
        if (!container) return;

        container.innerHTML = '';

        if (!produtos || produtos.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fa-solid fa-utensils"></i>
                    <p>Nenhum produto encontrado</p>
                </div>
            `;
            return;
        }

        produtos.forEach(produto => {
            const card = this.createProdutoCard(produto);
            container.appendChild(card);
        });
    }

    /**
     * Cria card de produto
     */
    createProdutoCard(produto) {
        const card = document.createElement('div');
        card.className = 'card-produto';
        card.dataset.produtoId = produto.id;

        const statusClass = produto.ativo ? 'ativo' : 'inativo';
        const statusText = produto.ativo ? 'Ativo' : 'Inativo';
        const categoriaNome = this.getCategoriaNome(produto.categoriaId);

        card.innerHTML = `
            <div class="card-header">
                <div class="produto-imagem">
                    ${produto.imagem ? 
                        `<img src="${produto.imagem}" alt="${produto.nome}" onerror="this.style.display='none'">` :
                        `<div class="imagem-placeholder"><i class="fa-solid fa-utensils"></i></div>`
                    }
                </div>
                <div class="produto-info">
                    <h3>${produto.nome}</h3>
                    <p class="categoria">${categoriaNome}</p>
                    <p class="descricao">${produto.descricao || 'Sem descrição'}</p>
                </div>
                <div class="status ${statusClass}">
                    <span>${statusText}</span>
                </div>
            </div>
            
            <div class="card-body">
                <div class="info-item">
                    <i class="fa-solid fa-dollar-sign"></i>
                    <span>R$ ${produto.preco.toFixed(2).replace('.', ',')}</span>
                </div>
                <div class="info-item">
                    <i class="fa-solid fa-clock"></i>
                    <span>${produto.tempoPreparo} min</span>
                </div>
                <div class="info-item">
                    <i class="fa-solid fa-chart-line"></i>
                    <span>Custo: R$ ${produto.precoCusto.toFixed(2).replace('.', ',')}</span>
                </div>
            </div>
            
            <div class="card-footer">
                <div class="toggle">
                    <label class="switch">
                        <input type="checkbox" ${produto.ativo ? 'checked' : ''}>
                        <span class="slider"></span>
                    </label>
                    <span class="toggle-label">${produto.ativo ? 'Ativo' : 'Inativo'}</span>
                </div>
                
                <div class="actions">
                    <button class="btn btn-secondary editar" title="Editar produto">
                        <i class="fa-solid fa-edit"></i>
                    </button>
                    <button class="btn btn-info receita" title="Gerenciar receita">
                        <i class="fa-solid fa-list"></i>
                    </button>
                </div>
            </div>
        `;

        return card;
    }

    /**
     * Trata clique no botão de novo produto
     */
    handleNewProduto() {
        this.currentEditingId = null;
        this.openProdutoModal();
    }

    /**
     * Trata clique no botão de editar
     */
    async handleEditClick(button) {
        const card = button.closest('.card-produto');
        const produtoId = parseInt(card.dataset.produtoId);

        try {
            const produto = await this.dataManager.getProdutoById(produtoId);
            if (produto) {
                this.currentEditingId = produtoId;
                this.openProdutoModal(produto);
            }
        } catch (error) {
            console.error('Erro ao buscar produto para edição:', error);
            this.showErrorMessage('Erro ao carregar dados do produto');
        }
    }

    /**
     * Trata mudança no toggle
     */
    async handleToggleChange(toggle) {
        const card = toggle.closest('.card-produto');
        const produtoId = parseInt(card.dataset.produtoId);
        const novoStatus = toggle.checked;

        try {
            await this.dataManager.toggleProdutoStatus(produtoId, novoStatus);
            
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

            this.showSuccessMessage(`Produto ${novoStatus ? 'ativado' : 'desativado'} com sucesso!`);
        } catch (error) {
            console.error('Erro ao alterar status do produto:', error);
            this.showErrorMessage('Erro ao alterar status do produto');
            
            // Reverter toggle
            toggle.checked = !novoStatus;
        }
    }

    /**
     * Trata filtro por categoria
     */
    handleCategoriaFilter(categoriaId) {
        const cards = document.querySelectorAll('.card-produto');
        cards.forEach(card => {
            const cardCategoriaId = card.dataset.categoriaId;
            const shouldShow = categoriaId === 'todos' || cardCategoriaId === categoriaId;
            card.style.display = shouldShow ? 'block' : 'none';
        });
    }

    /**
     * Trata filtro por status
     */
    handleStatusFilter(status) {
        const cards = document.querySelectorAll('.card-produto');
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
        const cards = document.querySelectorAll('.card-produto');
        const term = searchTerm.toLowerCase();

        cards.forEach(card => {
            const nome = card.querySelector('h3').textContent.toLowerCase();
            const descricao = card.querySelector('.descricao').textContent.toLowerCase();
            const shouldShow = nome.includes(term) || descricao.includes(term);
            card.style.display = shouldShow ? 'block' : 'none';
        });
    }

    /**
     * Abre modal de produto
     */
    openProdutoModal(produtoData = null) {
        const modal = document.getElementById('modal-produto');
        if (!modal) return;

        const titulo = document.getElementById('titulo-modal-produto');
        const btnSalvar = document.getElementById('salvar-produto');

        if (produtoData) {
            titulo.textContent = 'Editar produto';
            btnSalvar.innerHTML = '<i class="fa-solid fa-save"></i> Salvar';
            this.populateProdutoForm(produtoData);
        } else {
            titulo.textContent = 'Adicionar novo produto';
            btnSalvar.innerHTML = '<i class="fa-solid fa-plus"></i> Adicionar';
            this.clearProdutoForm();
        }

        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
        this.setupProdutoModalListeners(produtoData);
    }

    /**
     * Fecha modal de produto
     */
    closeProdutoModal() {
        const modal = document.getElementById('modal-produto');
        if (modal) {
            modal.style.display = 'none';
            document.body.style.overflow = 'auto';
        }
        this.currentEditingId = null;
    }

    /**
     * Popula formulário de produto
     */
    populateProdutoForm(produtoData) {
        document.getElementById('nome-produto').value = produtoData.nome || '';
        document.getElementById('descricao-produto').value = produtoData.descricao || '';
        document.getElementById('preco-produto').value = produtoData.preco ? `R$ ${produtoData.preco.toFixed(2).replace('.', ',')}` : '';
        document.getElementById('preco-custo-produto').value = produtoData.precoCusto ? `R$ ${produtoData.precoCusto.toFixed(2).replace('.', ',')}` : '';
        document.getElementById('tempo-produto').value = produtoData.tempoPreparo || '';
        document.getElementById('categoria-produto').value = produtoData.categoriaId || '';
    }

    /**
     * Limpa formulário de produto
     */
    clearProdutoForm() {
        document.getElementById('nome-produto').value = '';
        document.getElementById('descricao-produto').value = '';
        document.getElementById('preco-produto').value = '';
        document.getElementById('preco-custo-produto').value = '';
        document.getElementById('tempo-produto').value = '';
        document.getElementById('categoria-produto').value = '';
    }

    /**
     * Configura listeners do modal
     */
    setupProdutoModalListeners(produtoData = null) {
        // Botão fechar
        const btnFechar = document.querySelector('#modal-produto .fechar-modal');
        if (btnFechar) {
            btnFechar.addEventListener('click', () => this.closeProdutoModal());
        }

        // Botão cancelar
        const btnCancelar = document.getElementById('cancelar-produto');
        if (btnCancelar) {
            btnCancelar.addEventListener('click', () => this.closeProdutoModal());
        }

        // Botão salvar
        const btnSalvar = document.getElementById('salvar-produto');
        if (btnSalvar) {
            btnSalvar.addEventListener('click', () => {
                if (produtoData) {
                    this.handleEditProduto();
                } else {
                    this.handleAddProduto();
                }
            });
        }

        // Overlay
        const overlay = document.querySelector('#modal-produto .div-overlay');
        if (overlay) {
            overlay.addEventListener('click', () => this.closeProdutoModal());
        }

        // Formatação de campos
        this.setupFieldFormatting();
    }

    /**
     * Configura formatação de campos
     */
    setupFieldFormatting() {
        const precoField = document.getElementById('preco-produto');
        const precoCustoField = document.getElementById('preco-custo-produto');

        if (precoField) {
            precoField.addEventListener('input', (e) => {
                this.formatCurrencyInput(e.target);
            });
        }

        if (precoCustoField) {
            precoCustoField.addEventListener('input', (e) => {
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
     * Trata adição de produto
     */
    async handleAddProduto() {
        if (!this.validateProdutoForm()) {
            return;
        }

        const produtoData = this.getProdutoFormData();

        try {
            await this.dataManager.addProduto(produtoData);
            await this.loadProdutos();
            this.closeProdutoModal();
            this.showSuccessMessage('Produto adicionado com sucesso!');
        } catch (error) {
            console.error('Erro ao adicionar produto:', error);
            this.showErrorMessage('Erro ao adicionar produto. Tente novamente.');
        }
    }

    /**
     * Trata edição de produto
     */
    async handleEditProduto() {
        if (!this.validateProdutoForm()) {
            return;
        }

        const produtoData = this.getProdutoFormData();
        const produtoId = this.currentEditingId;

        if (!produtoId) {
            console.error('ID do produto não encontrado');
            return;
        }

        try {
            await this.dataManager.updateProduto(produtoId, produtoData);
            await this.loadProdutos();
            this.closeProdutoModal();
            this.showSuccessMessage('Produto atualizado com sucesso!');
        } catch (error) {
            console.error('Erro ao atualizar produto:', error);
            this.showErrorMessage('Erro ao atualizar produto. Tente novamente.');
        }
    }

    /**
     * Valida formulário de produto
     */
    validateProdutoForm() {
        const nome = document.getElementById('nome-produto').value.trim();
        const preco = document.getElementById('preco-produto').value.trim();
        const categoria = document.getElementById('categoria-produto').value;

        if (!nome) {
            this.showErrorMessage('Nome é obrigatório');
            return false;
        }

        if (!preco) {
            this.showErrorMessage('Preço é obrigatório');
            return false;
        }

        if (!categoria) {
            this.showErrorMessage('Categoria é obrigatória');
            return false;
        }

        return true;
    }

    /**
     * Obtém dados do formulário
     */
    getProdutoFormData() {
        const preco = document.getElementById('preco-produto').value.replace('R$', '').replace(',', '.').trim();
        const precoCusto = document.getElementById('preco-custo-produto').value.replace('R$', '').replace(',', '.').trim();

        return {
            nome: document.getElementById('nome-produto').value.trim(),
            descricao: document.getElementById('descricao-produto').value.trim(),
            preco: parseFloat(preco) || 0,
            precoCusto: parseFloat(precoCusto) || 0,
            tempoPreparo: parseInt(document.getElementById('tempo-produto').value) || 0,
            categoriaId: document.getElementById('categoria-produto').value,
            ativo: true
        };
    }

    /**
     * Obtém nome da categoria
     */
    getCategoriaNome(categoriaId) {
        const categoria = this.categorias.find(cat => cat.id === categoriaId);
        return categoria ? categoria.name : 'Sem categoria';
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
export { ProdutoManager };
