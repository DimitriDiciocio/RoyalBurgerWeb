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
import { abrirModal, fecharModal } from '../modais.js';

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
     * Busca todos os produtos incluindo inativos
     */
    async getAllProdutosIncludingInactive() {
        try {
            
            // Fazer duas chamadas: uma para ativos e outra para inativos
            const [ativosResponse, inativosResponse] = await Promise.all([
                getProducts({ page_size: 1000 }),
                this.getInactiveProducts()
            ]);


            const produtosAtivos = ativosResponse.items || [];
            const produtosInativos = inativosResponse.items || [];


            // Combinar os resultados
            const todosProdutos = [...produtosAtivos, ...produtosInativos];


            return {
                items: todosProdutos,
                pagination: {
                    total: todosProdutos.length,
                    page: 1,
                    page_size: todosProdutos.length,
                    total_pages: 1
                }
            };
        } catch (error) {
            console.error('Erro ao buscar todos os produtos:', error);
            throw error;
        }
    }

    /**
     * Busca produtos inativos (método temporário até a API suportar)
     */
    async getInactiveProducts() {
        try {
            // Por enquanto, vamos simular alguns produtos inativos para teste
            // Quando a API suportar, implementar aqui
            const produtosInativosSimulados = [
                {
                    id: 999,
                    name: "Produto Inativo 1",
                    description: "Este é um produto inativo para teste",
                    price: "15.50",
                    cost_price: "8.00",
                    preparation_time_minutes: 5,
                    category_id: null,
                    is_active: false,
                    image_url: null
                },
                {
                    id: 998,
                    name: "Produto Inativo 2", 
                    description: "Outro produto inativo para teste",
                    price: "22.90",
                    cost_price: "12.00",
                    preparation_time_minutes: 8,
                    category_id: null,
                    is_active: false,
                    image_url: null
                }
            ];
            
            return { items: produtosInativosSimulados };
        } catch (error) {
            console.error('Erro ao buscar produtos inativos:', error);
            return { items: [] };
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
                preco: this.safeParseFloat(produto.price),
                tempoPreparo: this.safeParseInt(produto.preparation_time_minutes),
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
                price: this.safeParseFloat(produtoData.preco),
                cost_price: this.safeParseFloat(produtoData.custoTotal),
                preparation_time_minutes: this.safeParseInt(produtoData.tempoPreparo),
                category_id: produtoData.categoriaId || null,
                is_active: produtoData.ativo !== undefined ? produtoData.ativo : true,
                image: produtoData.imagem
            };

            const response = await createProduct(apiData);
            this.clearCache();
            return response;
        } catch (error) {
            console.error('Erro ao adicionar produto:', error);
            
            // Tratamento específico para conflito de nome
            if (error.message && error.message.includes('Já existe um produto com este nome')) {
                throw new Error('Já existe um produto com este nome. Por favor, escolha um nome diferente.');
            }
            
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
                price: this.safeParseFloat(produtoData.preco),
                cost_price: this.safeParseFloat(produtoData.custoTotal),
                preparation_time_minutes: this.safeParseInt(produtoData.tempoPreparo),
                category_id: produtoData.categoriaId || null,
                is_active: produtoData.ativo !== undefined ? produtoData.ativo : true,
                image: produtoData.imagem
            };

            await updateProduct(id, apiData);
            this.clearCache();
        } catch (error) {
            console.error('Erro ao atualizar produto:', error);
            
            // Tratamento específico para conflito de nome
            if (error.message && error.message.includes('Já existe um produto com este nome')) {
                throw new Error('Já existe um produto com este nome. Por favor, escolha um nome diferente.');
            }
            
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
            // Validar dados antes de enviar
            if (!productId || !ingredientId || !quantity || !unit) {
                throw new Error('Dados inválidos para adicionar ingrediente');
            }
            
            // Converter para os tipos corretos
            const productIdNum = this.safeParseInt(productId);
            const ingredientIdNum = this.safeParseInt(ingredientId);
            const quantityNum = this.safeParseFloat(quantity);
            
            await addIngredientToProduct(productIdNum, ingredientIdNum, quantityNum, unit);
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

    /**
     * Busca categorias
     */
    async getCategorias() {
        try {
            const response = await getCategories();
            return response;
        } catch (error) {
            console.error('Erro ao buscar categorias:', error);
            throw error;
        }
    }

    /**
     * Busca ingredientes
     */
    async getIngredientes() {
        try {
            const response = await getIngredients();
            return response;
        } catch (error) {
            console.error('Erro ao buscar ingredientes:', error);
            throw error;
        }
    }

    /**
     * Utilitário para conversão segura de string para float
     */
    safeParseFloat(value, defaultValue = 0) {
        const parsed = parseFloat(value);
        return isNaN(parsed) ? defaultValue : parsed;
    }

    /**
     * Utilitário para conversão segura de string para int
     */
    safeParseInt(value, defaultValue = 0) {
        const parsed = parseInt(value);
        return isNaN(parsed) ? defaultValue : parsed;
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
        this.categoriaModalEventsSetup = false; // Flag para evitar duplicação de event listeners
    }

    /**
     * Inicializa o módulo
     */
    async init() {
        try {
            // Carregar categorias e ingredientes primeiro
            await this.loadCategorias();
            await this.loadIngredientesDisponiveis();
            
            // Depois carregar produtos
            await this.loadProdutos();
            
            // Atualizar dashboard
            await this.updateDashboard();
            
            // Configurar selects
            this.loadIngredientesInSelect();
            this.loadCategoriasInSelect();
            this.loadCategoriasInFilterSelect();
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
            if (e.target.matches('.adicionar') || e.target.closest('.adicionar')) {
                this.handleNewProduto();
            }
        });
    }

    /**
     * Configura handlers de filtros
     */
    setupFilterHandlers() {
        const categoriaFilter = document.getElementById('categoria-filtro');
        const statusFilter = document.getElementById('status-filtro');

        if (categoriaFilter) {
            categoriaFilter.addEventListener('change', (e) => {
                this.applyAllFilters();
            });
        }

        if (statusFilter) {
            statusFilter.addEventListener('change', (e) => {
                this.applyAllFilters();
            });
        }
    }

    /**
     * Configura handlers de busca
     */
    setupSearchHandlers() {
        const searchInput = document.getElementById('busca-produto');
        if (searchInput) {
            let searchTimeout;
            searchInput.addEventListener('input', (e) => {
                clearTimeout(searchTimeout);
                searchTimeout = setTimeout(() => {
                    this.applyAllFilters();
                }, 300); // Debounce de 300ms
            });
        }
    }

    /**
     * Carrega produtos
     */
    async loadProdutos() {
        try {
            // Carregar todos os produtos (ativos e inativos) da API
            const response = await this.dataManager.getAllProdutos({ 
                page_size: 1000, 
                include_inactive: true 
            });
            
            // A API retorna um objeto com 'items' contendo o array de produtos
            const produtosRaw = response.items || [];
            
            // Mapear dados da API para o formato esperado pelo frontend
            const produtos = produtosRaw.map(produto => this.mapProdutoFromAPI(produto));
            
            this.renderProdutoCards(produtos);
        } catch (error) {
            console.error('Erro ao carregar produtos:', error);
            this.showErrorMessage('Erro ao carregar produtos');
        }
    }

    /**
     * Mapeia dados do produto da API para o formato do frontend
     */
    mapProdutoFromAPI(produto) {
        return {
            id: produto.id,
            nome: produto.name,
            descricao: produto.description || '',
            preco: this.dataManager.safeParseFloat(produto.price),
            precoCusto: this.dataManager.safeParseFloat(produto.cost_price),
            tempoPreparo: this.dataManager.safeParseInt(produto.preparation_time_minutes),
            categoriaId: produto.category_id || null,
            imagem: produto.image_url || produto.image || '',
            ativo: produto.is_active !== undefined ? produto.is_active : true,
            dataCriacao: produto.created_at || new Date().toISOString().split('T')[0],
            ultimaAtualizacao: produto.updated_at || new Date().toISOString().split('T')[0]
        };
    }

    /**
     * Carrega ingredientes disponíveis
     */
    async loadIngredientesDisponiveis() {
        try {
            const response = await this.dataManager.getIngredientes();
            this.ingredientesDisponiveis = response.items || response || [];
        } catch (error) {
            console.error('Erro ao carregar ingredientes:', error);
            this.ingredientesDisponiveis = [];
        }
    }

    /**
     * Carrega categorias
     */
    async loadCategorias() {
        try {
            const response = await this.dataManager.getCategorias();
            this.categorias = response.items || response || [];
        } catch (error) {
            console.error('Erro ao carregar categorias:', error);
            this.categorias = [];
        }
    }

    /**
     * Renderiza cards de produtos
     */
    renderProdutoCards(produtos) {
        const container = document.querySelector('.produtos');
        if (!container) return;

        // Limpar container existente (exceto botões)
        const existingCards = container.querySelectorAll('.card-produto');
        existingCards.forEach(card => card.remove());

        // Adicionar novos cards
        produtos.forEach(produto => {
            const card = this.createProdutoCard(produto);
            container.appendChild(card);
        });
    }

    /**
     * Calcula a margem de lucro em porcentagem
     */
    calcularMargemLucro(precoVenda, custoEstimado) {
        if (!precoVenda || precoVenda <= 0) return 0;
        if (!custoEstimado || custoEstimado <= 0) return 100;
        
        const margem = ((precoVenda - custoEstimado) / precoVenda) * 100;
        return Math.max(0, margem); // Não permite margem negativa
    }

    /**
     * Constrói URL correta para imagem do produto
     */
    buildImageUrl(imagePath) {
        if (!imagePath) return null;
        
        // Se já é uma URL completa, usar diretamente
        if (imagePath.startsWith('http')) {
            return imagePath;
        }
        
        // Base URL do servidor Flask (porta 5000)
        const baseUrl = 'http://127.0.0.1:5000';
        
        // Se é um caminho do backend (/api/uploads/products/ID.jpeg)
        if (imagePath.startsWith('/api/uploads/products/')) {
            return `${baseUrl}${imagePath}`;
        }
        
        // Se é um caminho antigo (/uploads/products/ID.jpeg)
        if (imagePath.startsWith('/uploads/products/')) {
            return `${baseUrl}${imagePath.replace('/uploads/', '/api/uploads/')}`;
        }
        
        // Se é apenas o nome do arquivo (ID.jpeg)
        if (imagePath.match(/^\d+\.jpeg$/)) {
            return `${baseUrl}/api/uploads/products/${imagePath}`;
        }
        
        // Fallback: assumir que é um caminho relativo
        return `${baseUrl}/api/uploads/products/${imagePath}`;
    }

    /**
     * Cria elemento de imagem com fallback
     */
    createImageElement(produto) {
        const imageUrl = this.buildImageUrl(produto.imagem);
        
        if (imageUrl) {
            return `
                <img src="${this.escapeHtml(imageUrl)}" 
                     alt="${this.escapeHtml(produto.nome)}" 
                     onerror="this.parentNode.innerHTML='<div class=\\"imagem-placeholder\\"><i class=\\"fa-solid fa-image\\"></i><p>Imagem não encontrada</p></div>
            `;
        } else {
            return `
                <div class="imagem-placeholder">
                    <i class="fa-solid fa-image"></i>
                    <p>Sem imagem</p>
                </div>
            `;
        }
    }

    /**
     * Cria card de produto
     */
    createProdutoCard(produto) {
        const card = document.createElement('div');
        card.className = 'card-produto';
        card.dataset.produtoId = produto.id;
        card.dataset.categoriaId = produto.categoriaId || '';

        const statusClass = produto.ativo ? 'ativo' : 'inativo';
        const statusText = produto.ativo ? 'Ativo' : 'Inativo';
        const categoriaNome = this.getCategoriaNome(produto.categoriaId);
        
        // Calcular custo estimado e margem de lucro
        const custoEstimado = this.dataManager.safeParseFloat(produto.precoCusto);
        const precoVenda = this.dataManager.safeParseFloat(produto.preco);
        const margemLucro = this.calcularMargemLucro(precoVenda, custoEstimado);
        
        // Limitar descrição a 50 caracteres
        const descricaoLimitada = this.truncateText(produto.descricao || 'Sem descrição', 50);

        card.innerHTML = `
            <div class="imagem-produto">
                ${this.createImageElement(produto)}
            </div>

            <div class="info-produto">
                <div class="cabecalho-produto">
                    <h3>${this.escapeHtml(produto.nome)}</h3>
                    <div class="controles-produto">
                        <label class="toggle">
                            <input type="checkbox" ${produto.ativo ? 'checked' : ''}>
                            <span class="slider"></span>
                        </label>
                        <i class="fa-solid fa-pen-to-square editar"></i>
                    </div>
                </div>
                
                <p class="descricao-produto">${this.escapeHtml(descricaoLimitada)}</p>

                <div class="categoria-status">
                    <div class="categoria">${this.escapeHtml(categoriaNome)}</div>
                    <div class="status ${produto.ativo ? 'disponivel' : 'indisponivel'}">
                        <i class="fa-solid fa-${produto.ativo ? 'eye' : 'eye-slash'}"></i> 
                        ${produto.ativo ? 'Disponível' : 'Indisponível'}
                    </div>
                </div>

                <div class="detalhes-produto">
                    <div class="detalhe">
                        <span class="label">Preço:</span>
                        <span class="valor preco">R$ ${this.formatCurrency(precoVenda)}</span>
                    </div>
                    <div class="detalhe">
                        <span class="label">Preparo:</span>
                        <span class="valor">${produto.tempoPreparo || 0}min</span>
                    </div>
                    <div class="detalhe">
                        <span class="label">Custo Est.:</span>
                        <span class="valor custo-estimado">R$ ${this.formatCurrency(custoEstimado)}</span>
                    </div>
                    <div class="detalhe">
                        <span class="label">Margem:</span>
                        <span class="valor margem ${this.getMarginClass(margemLucro)}">${margemLucro.toFixed(1)}%</span>
                    </div>
                </div>
            </div>
        `;

        return card;
    }

    /**
     * Utilitário para escapar HTML
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Utilitário para truncar texto
     */
    truncateText(text, maxLength) {
        if (!text || text.length <= maxLength) return text;
        return text.substring(0, maxLength) + '...';
    }

    /**
     * Utilitário para formatar moeda
     */
    formatCurrency(value) {
        return (value || 0).toFixed(2).replace('.', ',');
    }

    /**
     * Utilitário para obter classe CSS da margem
     */
    getMarginClass(margem) {
        if (margem >= 50) return 'margem-alta';
        if (margem >= 30) return 'margem-media';
        return 'margem-baixa';
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
                await this.openProdutoModal(produto);
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
            
            // Atualizar visual - usando seletores corretos baseados na nova estrutura
            const statusElement = card.querySelector('.status');
            const statusIcon = card.querySelector('.status i');
            const statusText = statusElement ? statusElement.textContent.trim() : '';
            
            if (novoStatus) {
                statusElement.className = 'status disponivel';
                if (statusIcon) {
                    statusIcon.className = 'fa-solid fa-eye';
                }
                // Atualizar texto do status
                if (statusElement) {
                    statusElement.innerHTML = '<i class="fa-solid fa-eye"></i> Disponível';
                }
            } else {
                statusElement.className = 'status indisponivel';
                if (statusIcon) {
                    statusIcon.className = 'fa-solid fa-eye-slash';
                }
                // Atualizar texto do status
                if (statusElement) {
                    statusElement.innerHTML = '<i class="fa-solid fa-eye-slash"></i> Indisponível';
                }
            }

            this.showSuccessMessage(`Produto ${novoStatus ? 'ativado' : 'desativado'} com sucesso!`);
            await this.updateDashboard();
            
            // Atualizar a home se estiver disponível
            if (typeof window.refreshHome === 'function') {
                window.refreshHome();
            }
        } catch (error) {
            console.error('Erro ao alterar status do produto:', error);
            this.showErrorMessage('Erro ao alterar status do produto');
            
            // Reverter toggle
            toggle.checked = !novoStatus;
        }
    }

    /**
     * Aplica todos os filtros ativos de forma combinada
     */
    applyAllFilters() {
        const searchTerm = document.getElementById('busca-produto')?.value || '';
        const categoriaId = document.getElementById('categoria-filtro')?.value || '';
        const status = document.getElementById('status-filtro')?.value || 'todos';

        // Aplicar filtros combinados

        const cards = document.querySelectorAll('.card-produto');
        let visibleCount = 0;
        
        cards.forEach(card => {
            // Verificar filtro de busca
            const searchPass = this.checkSearchFilter(card, searchTerm);
            
            // Verificar filtro de categoria
            const categoryPass = this.checkCategoryFilter(card, categoriaId);
            
            // Verificar filtro de status
            const statusPass = this.checkStatusFilter(card, status);
            
            // Mostrar card apenas se passar em todos os filtros
            const shouldShow = searchPass && categoryPass && statusPass;
            card.style.display = shouldShow ? 'block' : 'none';
            
            if (shouldShow) visibleCount++;
        });

        // Atualizar contador de produtos visíveis
        this.updateVisibleProductsCount();
        
        // Filtros aplicados com sucesso
    }

    /**
     * Verifica se o card passa no filtro de busca
     */
    checkSearchFilter(card, searchTerm) {
        if (!searchTerm || searchTerm.trim() === '') {
            return true; // Sem filtro de busca
        }
        
        const term = searchTerm.toLowerCase().trim();
        const nome = card.querySelector('h3')?.textContent.toLowerCase() || '';
        const descricao = card.querySelector('.descricao-produto')?.textContent.toLowerCase() || '';
        
        return nome.includes(term) || descricao.includes(term);
    }

    /**
     * Verifica se o card passa no filtro de categoria
     */
    checkCategoryFilter(card, categoriaId) {
        if (!categoriaId || categoriaId === '') {
            return true; // Sem filtro de categoria
        }
        
        const cardCategoriaId = card.dataset.categoriaId;
        return cardCategoriaId === categoriaId;
    }

    /**
     * Verifica se o card passa no filtro de status
     */
    checkStatusFilter(card, status) {
        if (status === 'todos') {
            return true; // Sem filtro de status
        }
        
        const isActive = card.querySelector('.toggle input')?.checked || false;
        
        if (status === 'ativo') {
            return isActive;
        } else if (status === 'inativo') {
            return !isActive;
        }
        
        return true;
    }

    /**
     * Atualiza contador de produtos visíveis
     */
    updateVisibleProductsCount() {
        const visibleCards = document.querySelectorAll('.card-produto[style*="block"], .card-produto:not([style*="none"])');
        const totalCards = document.querySelectorAll('.card-produto');
        
        // Atualizar contador se existir elemento para isso
        const counterElement = document.querySelector('.produtos-count');
        if (counterElement) {
            counterElement.textContent = `${visibleCards.length} de ${totalCards.length} produtos`;
        }
        
        // Contador atualizado
    }

    /**
     * Abre modal de produto
     */
    async openProdutoModal(produtoData = null) {
        const titulo = document.getElementById('titulo-modal');
        const btnSalvar = document.getElementById('salvar-produto');

        // Carregar ingredientes e categorias nos selects
        this.loadIngredientesInSelect();
        this.loadCategoriasInSelect();

        if (produtoData) {
            titulo.textContent = 'Editar produto';
            btnSalvar.innerHTML = '<i class="fa-solid fa-save"></i> Salvar';
            await this.populateProdutoForm(produtoData);
        } else {
            titulo.textContent = 'Adicionar novo produto';
            btnSalvar.innerHTML = '<i class="fa-solid fa-plus"></i> Adicionar';
            this.clearProdutoForm();
        }

        // Usar sistema centralizado de modais
        abrirModal('modal-produto');
        this.setupProdutoModalListeners(produtoData);
    }

    /**
     * Fecha modal de produto
     */
    closeProdutoModal() {
        // Usar sistema centralizado de modais
        fecharModal('modal-produto');
        this.currentEditingId = null;
    }

    /**
     * Popula formulário de produto
     */
    async populateProdutoForm(produtoData) {
        document.getElementById('nome-produto').value = produtoData.nome || '';
        document.getElementById('descricao-produto').value = produtoData.descricao || '';
        document.getElementById('preco-produto').value = produtoData.preco ? `R$ ${produtoData.preco.toFixed(2).replace('.', ',')}` : '';
        document.getElementById('tempo-preparo-produto').value = produtoData.tempoPreparo || '';
        document.getElementById('categoria-produto').value = produtoData.categoriaId || '';
        
        // Carregar imagem existente se houver
        if (produtoData.imagem) {
            this.loadExistingImage(produtoData.imagem);
        } else {
            this.removeImage();
        }

        // Carregar ingredientes existentes do produto
        await this.loadExistingIngredients(produtoData.id);
    }

    /**
     * Limpa formulário de produto
     */
    clearProdutoForm() {
        document.getElementById('nome-produto').value = '';
        document.getElementById('descricao-produto').value = '';
        document.getElementById('preco-produto').value = '';
        document.getElementById('tempo-preparo-produto').value = '';
        document.getElementById('categoria-produto').value = '';
        
        // Limpar imagem
        this.removeImage();
        
        // Limpar lista de ingredientes
        const ingredientesContainer = document.querySelector('.ingredientes-receita');
        if (ingredientesContainer) {
            ingredientesContainer.innerHTML = '';
        }
        
        // Limpar custo estimado
        const custoElement = document.getElementById('custo-estimado');
        if (custoElement) {
            custoElement.textContent = 'R$ 0,00';
        }
    }

    /**
     * Configura listeners do modal
     */
    setupProdutoModalListeners(produtoData = null) {
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

        // Formatação de campos
        this.setupFieldFormatting();

        // Upload de imagem
        this.setupImageUpload();

        // Botão adicionar ingrediente
        const btnAdicionarIngrediente = document.getElementById('btn-adicionar-ingrediente');
        if (btnAdicionarIngrediente) {
            btnAdicionarIngrediente.addEventListener('click', () => {
                this.addIngredientToRecipe();
            });
        }

        // Event delegation para botões de remover ingrediente
        const modal = document.getElementById('modal-produto');
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target.matches('.btn-remover-ingrediente') || e.target.closest('.btn-remover-ingrediente')) {
                    this.removeIngredientFromRecipe(e.target);
                }
            });
        }
    }

    /**
     * Configura formatação de campos
     */
    setupFieldFormatting() {
        const precoField = document.getElementById('preco-produto');
        if (precoField) {
            precoField.addEventListener('input', (e) => {
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
     * Configura upload de imagem
     */
    setupImageUpload() {
        const fileInput = document.getElementById('imagem-produto');
        const areaUpload = document.getElementById('area-upload');
        const previewImagem = document.getElementById('preview-imagem');
        const imagemPreview = document.getElementById('imagem-preview');
        const btnRemoverImagem = document.getElementById('remover-imagem');

        if (!fileInput || !areaUpload || !previewImagem || !imagemPreview || !btnRemoverImagem) {
            return;
        }

        // Clique na área de upload
        areaUpload.addEventListener('click', () => {
            fileInput.click();
        });

        // Drag and drop
        areaUpload.addEventListener('dragover', (e) => {
            e.preventDefault();
            areaUpload.style.borderColor = 'var(--color-tertiary)';
            areaUpload.style.backgroundColor = '#f0f0f0';
        });

        areaUpload.addEventListener('dragleave', (e) => {
            e.preventDefault();
            areaUpload.style.borderColor = '#e0e1e4';
            areaUpload.style.backgroundColor = '#f9f9f9';
        });

        areaUpload.addEventListener('drop', (e) => {
            e.preventDefault();
            areaUpload.style.borderColor = '#e0e1e4';
            areaUpload.style.backgroundColor = '#f9f9f9';
            
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                this.handleImageUpload(files[0]);
            }
        });

        // Mudança no input de arquivo
        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                this.handleImageUpload(e.target.files[0]);
            }
        });

        // Botão remover imagem
        btnRemoverImagem.addEventListener('click', () => {
            this.removeImage();
        });
    }

    /**
     * Trata upload de imagem
     */
    handleImageUpload(file) {
        // Validar tipo de arquivo
        if (!file.type.startsWith('image/')) {
            this.showErrorMessage('Por favor, selecione apenas arquivos de imagem');
            return;
        }

        // Validar tamanho (máximo 5MB)
        if (file.size > 5 * 1024 * 1024) {
            this.showErrorMessage('A imagem deve ter no máximo 5MB');
            return;
        }

        // Criar URL para preview
        const reader = new FileReader();
        reader.onload = (e) => {
            this.showImagePreview(e.target.result);
        };
        reader.readAsDataURL(file);
    }

    /**
     * Mostra preview da imagem
     */
    showImagePreview(imageUrl) {
        const areaUpload = document.getElementById('area-upload');
        const previewImagem = document.getElementById('preview-imagem');
        const imagemPreview = document.getElementById('imagem-preview');

        if (areaUpload && previewImagem && imagemPreview) {
            areaUpload.style.display = 'none';
            previewImagem.style.display = 'block';
            imagemPreview.src = imageUrl;
            
            // Remover classe de imagem existente quando nova imagem for selecionada
            previewImagem.classList.remove('existing-image');
        }
    }

    /**
     * Remove imagem
     */
    removeImage() {
        const fileInput = document.getElementById('imagem-produto');
        const areaUpload = document.getElementById('area-upload');
        const previewImagem = document.getElementById('preview-imagem');
        const imagemPreview = document.getElementById('imagem-preview');

        if (fileInput && areaUpload && previewImagem && imagemPreview) {
            fileInput.value = '';
            areaUpload.style.display = 'flex';
            previewImagem.style.display = 'none';
            previewImagem.classList.remove('existing-image');
            imagemPreview.src = '';
        }
    }

    /**
     * Carrega ingredientes existentes do produto na modal
     */
    async loadExistingIngredients(productId) {
        try {
            
            // Buscar ingredientes do produto
            const response = await this.dataManager.getIngredientesProduto(productId);
            const ingredientes = response.items || [];
            
            
            // Limpar lista atual de ingredientes
            const ingredientesContainer = document.querySelector('.ingredientes-receita');
            if (ingredientesContainer) {
                ingredientesContainer.innerHTML = '';
            }
            
            // Adicionar cada ingrediente à lista
            for (const ingrediente of ingredientes) {
                // Buscar dados completos do ingrediente
                const ingredienteCompleto = this.ingredientesDisponiveis.find(ing => ing.id == ingrediente.ingredient_id);
                
                if (ingredienteCompleto) {
                    
                    this.addIngredientToList(ingredienteCompleto, ingrediente.quantity, ingrediente.unit);
                } else {
                    console.warn('Ingrediente não encontrado na lista disponível:', ingrediente.ingredient_id);
                }
            }
            
            // Atualizar custo estimado
            this.updateEstimatedCost();
            
        } catch (error) {
            console.error('Erro ao carregar ingredientes existentes:', error);
            // Não mostrar erro para o usuário, apenas log
        }
    }

    /**
     * Carrega imagem existente do produto
     */
    loadExistingImage(imageUrl) {
        const areaUpload = document.getElementById('area-upload');
        const previewImagem = document.getElementById('preview-imagem');
        const imagemPreview = document.getElementById('imagem-preview');

        if (areaUpload && previewImagem && imagemPreview) {
            // Construir URL completa da imagem
            const fullImageUrl = this.buildImageUrl(imageUrl);
            
            if (fullImageUrl) {
                // Mostrar preview da imagem existente
                areaUpload.style.display = 'none';
                previewImagem.style.display = 'block';
                imagemPreview.src = fullImageUrl;
                
                // Adicionar indicador de que é uma imagem existente
                previewImagem.classList.add('existing-image');
            } else {
                this.removeImage();
            }
        }
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
            await this.saveProductWithIngredients(produtoData);
            await this.loadProdutos();
            this.closeProdutoModal();
            this.showSuccessMessage('Produto adicionado com sucesso!');
            
            // Atualizar a home se estiver disponível
            if (typeof window.refreshHome === 'function') {
                window.refreshHome();
            }
        } catch (error) {
            console.error('Erro ao adicionar produto:', error);
            
            // Mensagem específica para conflito de nome
            if (error.message && error.message.includes('Já existe um produto com este nome')) {
                this.showErrorMessage('Já existe um produto com este nome. Por favor, escolha um nome diferente.');
            } else {
                this.showErrorMessage('Erro ao adicionar produto. Tente novamente.');
            }
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
            await this.saveProductWithIngredients(produtoData);
            await this.loadProdutos();
            this.closeProdutoModal();
            this.showSuccessMessage('Produto atualizado com sucesso!');
            
            // Atualizar a home se estiver disponível
            if (typeof window.refreshHome === 'function') {
                window.refreshHome();
            }
        } catch (error) {
            console.error('Erro ao atualizar produto:', error);
            
            // Mensagem específica para conflito de nome
            if (error.message && error.message.includes('Já existe um produto com este nome')) {
                this.showErrorMessage('Já existe um produto com este nome. Por favor, escolha um nome diferente.');
            } else {
                this.showErrorMessage('Erro ao atualizar produto. Tente novamente.');
            }
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
        const fileInput = document.getElementById('imagem-produto');

        // Calcular custo total dos ingredientes automaticamente
        const custoTotal = this.calcularCustoTotalIngredientes();

        const formData = {
            nome: document.getElementById('nome-produto').value.trim(),
            descricao: document.getElementById('descricao-produto').value.trim(),
            preco: this.dataManager.safeParseFloat(preco),
            tempoPreparo: this.dataManager.safeParseInt(document.getElementById('tempo-preparo-produto').value),
            categoriaId: document.getElementById('categoria-produto').value,
            ativo: true,
            imagem: fileInput.files.length > 0 ? fileInput.files[0] : null,
            custoTotal: custoTotal
        };

        return formData;
    }

    /**
     * Calcula o custo total dos ingredientes adicionados à receita
     */
    calcularCustoTotalIngredientes() {
        const ingredientes = document.querySelectorAll('.ingrediente-item');
        let custoTotal = 0;

        ingredientes.forEach((ingrediente) => {
            const custoText = ingrediente.querySelector('.custo').textContent;
            const custo = this.dataManager.safeParseFloat(custoText.replace('R$', '').replace(',', '.'));
            custoTotal += custo;
        });

        return custoTotal;
    }

    /**
     * Obtém nome da categoria
     */
    getCategoriaNome(categoriaId) {
        // Se categoriaId é null ou undefined, retornar "Sem categoria"
        if (!categoriaId || categoriaId === null || categoriaId === 'null') {
            return 'Sem categoria';
        }
        
        // Converter categoriaId para número se necessário
        const id = this.dataManager.safeParseInt(categoriaId);
        
        const categoria = this.categorias.find(cat => cat.id === id);
        
        return categoria ? categoria.name : 'Sem categoria';
    }

    /**
     * Calcula margem de lucro baseada no custo estimado dos ingredientes
     */
    calcularMargem(preco, custoEstimado) {
        if (!preco || preco <= 0) return '0.0';
        if (!custoEstimado || custoEstimado <= 0) return '100.0';
        
        const margem = ((preco - custoEstimado) / preco) * 100;
        return margem.toFixed(1);
    }

    /**
     * Atualiza custo estimado e margem no card do produto
     */
    updateProductCardCost(productId, custoEstimado) {
        const card = document.querySelector(`[data-produto-id="${productId}"]`);
        if (!card) return;

        const custoElement = card.querySelector('.custo-estimado');
        const margemElement = card.querySelector('.margem');
        const precoElement = card.querySelector('.preco');

        if (custoElement) {
            custoElement.textContent = `R$ ${custoEstimado.toFixed(2).replace('.', ',')}`;
        }

        if (margemElement && precoElement) {
            const preco = parseFloat(precoElement.textContent.replace('R$', '').replace(',', '.')) || 0;
            const margem = this.calcularMargem(preco, custoEstimado);
            margemElement.textContent = `${margem}%`;
        }
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

    /**
     * Adiciona ingrediente à receita do produto
     */
    addIngredientToRecipe() {
        const ingredienteSelect = document.getElementById('ingrediente-select');
        const quantidadeInput = document.getElementById('quantidade-ingrediente');
        const unidadeSelect = document.getElementById('unidade-ingrediente-produto');

        if (!ingredienteSelect || !quantidadeInput || !unidadeSelect) {
            this.showErrorMessage('Erro: Campos de ingrediente não encontrados');
            return;
        }

        const ingredienteId = ingredienteSelect.value;
        const quantidade = this.dataManager.safeParseFloat(quantidadeInput.value);
        const unidade = unidadeSelect.value;

        if (!ingredienteId) {
            this.showErrorMessage('Selecione um ingrediente');
            return;
        }

        if (!quantidadeInput.value || quantidade <= 0) {
            this.showErrorMessage('Digite uma quantidade válida');
            return;
        }

        if (!unidade) {
            this.showErrorMessage('Selecione uma unidade');
            return;
        }

        // Verificar se o ingrediente já foi adicionado
        const ingredienteJaAdicionado = document.querySelector(`[data-ingrediente-id="${ingredienteId}"]`);
        if (ingredienteJaAdicionado) {
            this.showErrorMessage('Este ingrediente já foi adicionado à receita');
            return;
        }

        // Buscar dados do ingrediente
        const ingrediente = this.ingredientesDisponiveis.find(ing => ing.id == ingredienteId);
        if (!ingrediente) {
            this.showErrorMessage('Ingrediente não encontrado');
            return;
        }

        // Adicionar à lista de ingredientes
        this.addIngredientToList(ingrediente, quantidade, unidade);

        // Limpar formulário
        ingredienteSelect.value = '';
        quantidadeInput.value = '';
        unidadeSelect.value = '';

        // Atualizar custo estimado
        this.updateEstimatedCost();
    }

    /**
     * Converte o preço unitário do ingrediente para a unidade da receita
     */
    convertPriceToRecipeUnit(precoUnitario, ingredienteUnidade, receitaUnidade) {
        // Se as unidades são iguais, não precisa converter
        if (ingredienteUnidade === receitaUnidade) {
            return precoUnitario;
        }

        // Conversões de kg para g
        if (ingredienteUnidade === 'kg' && receitaUnidade === 'g') {
            return precoUnitario / 1000; // R$ 10/kg = R$ 0,01/g
        }

        // Conversões de g para kg
        if (ingredienteUnidade === 'g' && receitaUnidade === 'kg') {
            return precoUnitario * 1000; // R$ 0,01/g = R$ 10/kg
        }

        // Conversões de L para ml
        if (ingredienteUnidade === 'L' && receitaUnidade === 'ml') {
            return precoUnitario / 1000; // R$ 8/L = R$ 0,008/ml
        }

        // Conversões de ml para L
        if (ingredienteUnidade === 'ml' && receitaUnidade === 'L') {
            return precoUnitario * 1000; // R$ 0,008/ml = R$ 8/L
        }

        // Se não conseguir converter, retorna o preço original
        return precoUnitario;
    }

    /**
     * Adiciona ingrediente à lista visual
     */
    addIngredientToList(ingrediente, quantidade, unidade) {
        const container = document.querySelector('.ingredientes-receita');
        if (!container) {
            console.error('Container .ingredientes-receita não encontrado');
            return;
        }

        const ingredienteElement = document.createElement('div');
        ingredienteElement.className = 'ingrediente-item';
        ingredienteElement.dataset.ingredienteId = ingrediente.id;

        // Converter preço unitário para a unidade da receita
        const precoOriginal = this.dataManager.safeParseFloat(ingrediente.price);
        const precoConvertido = this.convertPriceToRecipeUnit(precoOriginal, ingrediente.stock_unit || 'g', unidade);
        const custoTotal = precoConvertido * quantidade;

        ingredienteElement.innerHTML = `
            <div class="ingrediente-info">
                <span class="nome">${this.escapeHtml(ingrediente.name)}</span>
                <span class="quantidade">${quantidade} ${unidade}</span>
                <span class="custo">R$ ${this.formatCurrency(custoTotal)}</span>
            </div>
            <button type="button" class="btn-remover-ingrediente">
                <i class="fa-solid fa-trash"></i>
            </button>
        `;

        container.appendChild(ingredienteElement);
    }

    /**
     * Remove ingrediente da receita
     */
    removeIngredientFromRecipe(button) {
        const ingredienteElement = button.closest('.ingrediente-item');
        if (ingredienteElement) {
            ingredienteElement.remove();
            this.updateEstimatedCost();
        }
    }

    /**
     * Atualiza custo estimado da receita
     */
    updateEstimatedCost() {
        const ingredientes = document.querySelectorAll('.ingrediente-item');
        let custoTotal = 0;

        ingredientes.forEach(ingrediente => {
            const custoText = ingrediente.querySelector('.custo').textContent;
            const custo = this.dataManager.safeParseFloat(custoText.replace('R$', '').replace(',', '.'));
            custoTotal += custo;
        });

        // Atualizar exibição do custo (se houver elemento para isso)
        const custoElement = document.querySelector('.custo-receita .valor');
        if (custoElement) {
            custoElement.textContent = `R$ ${this.formatCurrency(custoTotal)}`;
        }
    }

    /**
     * Carrega ingredientes no select
     */
    loadIngredientesInSelect() {
        const select = document.getElementById('ingrediente-select');
        if (!select) {
            console.error('Select ingrediente-select não encontrado');
            return;
        }

        select.innerHTML = '<option value="">Selecione um ingrediente</option>';
        
        this.ingredientesDisponiveis.forEach(ingrediente => {
            const option = document.createElement('option');
            option.value = ingrediente.id;
            option.textContent = ingrediente.name;
            select.appendChild(option);
        });
    }

    /**
     * Carrega categorias no select
     */
    loadCategoriasInSelect() {
        const select = document.getElementById('categoria-produto');
        if (!select) return;

        select.innerHTML = '<option value="">Selecione uma categoria</option>';
        
        this.categorias.forEach(categoria => {
            const option = document.createElement('option');
            option.value = categoria.id;
            option.textContent = categoria.name;
            select.appendChild(option);
        });
    }

    /**
     * Carrega categorias no select de filtro
     */
    loadCategoriasInFilterSelect() {
        const select = document.getElementById('categoria-filtro');
        if (!select) return;

        select.innerHTML = '<option value="">Todas as categorias</option>';
        
        this.categorias.forEach(categoria => {
            const option = document.createElement('option');
            option.value = categoria.id;
            option.textContent = categoria.name;
            select.appendChild(option);
        });
    }

    /**
     * Salva produto com ingredientes
     */
    async saveProductWithIngredients(produtoData) {
        try {
            // Primeiro, salvar o produto
            let produtoId;
            if (this.currentEditingId) {
                await this.dataManager.updateProduto(this.currentEditingId, produtoData);
                produtoId = this.currentEditingId;
            } else {
                // Para novo produto, precisamos obter o ID retornado pela API
                const response = await this.dataManager.addProduto(produtoData);
                produtoId = response.id;
            }

            // Adicionar ingredientes da receita
            const ingredientes = document.querySelectorAll('.ingrediente-item');
            
            for (const ingrediente of ingredientes) {
                const ingredienteId = ingrediente.dataset.ingredienteId;
                const quantidadeText = ingrediente.querySelector('.quantidade').textContent;
                const [quantidadeStr, unidade] = quantidadeText.split(' ');
                const quantidade = this.dataManager.safeParseFloat(quantidadeStr);

                // Validar dados antes de enviar
                if (!ingredienteId || !quantidade || !unidade) {
                    console.error('Dados inválidos do ingrediente:', {
                        ingredienteId,
                        quantidade,
                        unidade
                    });
                    continue; // Pular este ingrediente e continuar com os outros
                }
                
                await this.dataManager.addIngredienteAoProduto(produtoId, ingredienteId, quantidade, unidade);
            }

            return true;
        } catch (error) {
            console.error('Erro ao salvar produto com ingredientes:', error);
            throw error;
        }
    }

    /**
     * Atualiza o dashboard com estatísticas dos produtos
     */
    async updateDashboard() {
        try {
            // Buscar todos os produtos
            const response = await this.dataManager.getAllProdutos({ 
                page_size: 1000, 
                include_inactive: true 
            });
            const produtos = response.items || [];

            // Calcular estatísticas
            const stats = this.calculateProductStats(produtos);

            // Atualizar os quadros do dashboard
            this.updateDashboardCards(stats);

        } catch (error) {
            console.error('Erro ao atualizar dashboard:', error);
        }
    }

    /**
     * Calcula estatísticas dos produtos
     */
    calculateProductStats(produtos) {
        const totalProdutos = produtos.length;
        const produtosAtivos = produtos.filter(p => p.is_active).length;
        const produtosInativos = totalProdutos - produtosAtivos;

        // Calcular preço médio
        const precos = produtos.filter(p => p.price && p.price > 0).map(p => this.dataManager.safeParseFloat(p.price));
        const precoMedio = precos.length > 0 ? precos.reduce((sum, preco) => sum + preco, 0) / precos.length : 0;

        // Calcular margem média
        const margens = produtos
            .filter(p => p.price && p.cost_price && p.price > 0)
            .map(p => {
                const preco = this.dataManager.safeParseFloat(p.price);
                const custo = this.dataManager.safeParseFloat(p.cost_price);
                return ((preco - custo) / preco) * 100;
            });
        const margemMedia = margens.length > 0 ? margens.reduce((sum, margem) => sum + margem, 0) / margens.length : 0;

        // Calcular tempo médio de preparo
        const tempos = produtos
            .filter(p => p.preparation_time_minutes && p.preparation_time_minutes > 0)
            .map(p => this.dataManager.safeParseInt(p.preparation_time_minutes));
        const tempoMedio = tempos.length > 0 ? tempos.reduce((sum, tempo) => sum + tempo, 0) / tempos.length : 0;

        return {
            totalProdutos,
            produtosAtivos,
            produtosInativos,
            precoMedio,
            margemMedia,
            tempoMedio
        };
    }

    /**
     * Atualiza os quadros do dashboard
     */
    updateDashboardCards(stats) {
        // Total de Itens
        const totalElement = document.querySelector('.relata .quadro:nth-child(1) .valor .grande');
        const indisponiveisElement = document.querySelector('.relata .quadro:nth-child(1) .valor .descricao');
        if (totalElement) totalElement.textContent = stats.totalProdutos;
        if (indisponiveisElement) indisponiveisElement.textContent = `${stats.produtosInativos} indisponíveis`;

        // Preço Médio
        const precoElement = document.querySelector('.relata .quadro:nth-child(2) .valor .grande');
        if (precoElement) precoElement.textContent = `R$ ${this.formatCurrency(stats.precoMedio)}`;

        // Margem Média
        const margemElement = document.querySelector('.relata .quadro:nth-child(3) .valor .grande');
        if (margemElement) margemElement.textContent = `${stats.margemMedia.toFixed(1)}%`;

        // Tempo Médio de Preparo
        const tempoElement = document.querySelector('.relata .quadro:nth-child(4) .valor .grande');
        if (tempoElement) tempoElement.textContent = `${Math.round(stats.tempoMedio)} min`;
    }
}

// Exporta a classe principal
export { ProdutoManager };
