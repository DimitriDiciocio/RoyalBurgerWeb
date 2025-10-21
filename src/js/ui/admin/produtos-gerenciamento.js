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
    getProductIngredients,
    updateProductImage,
    updateProductWithImage,
    canDeleteProduct,
    permanentDeleteProduct
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
     * Busca produtos inativos
     */
    async getInactiveProducts() {
        try {
            // Buscar produtos inativos da API
            const response = await getProducts({ 
                page_size: 1000, 
                include_inactive: true,
                active_only: false 
            });
            return response;
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
                is_active: produtoData.ativo !== undefined ? produtoData.ativo : true
            };

            // Verifica se há alteração na imagem
            const imageFile = produtoData.imageFile || null;
            const removeImage = produtoData.removeImage || false;

            // Se há alteração na imagem, usa a nova função
            if (imageFile || removeImage) {
                await updateProductWithImage(id, apiData, imageFile, removeImage);
            } else {
                // Se não há alteração na imagem, usa a função normal
                await updateProduct(id, apiData);
            }

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
     * Atualiza apenas a imagem de um produto
     */
    async updateProdutoImagem(id, imageFile = null, removeImage = false) {
        try {
            const response = await updateProductImage(id, imageFile, removeImage);
            this.clearCache();
            return response;
        } catch (error) {
            console.error('Erro ao atualizar imagem do produto:', error);
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
     * Verifica se um produto pode ser excluído permanentemente
     */
    async canDeleteProduct(productId) {
        try {
            const response = await canDeleteProduct(productId);
            return response;
        } catch (error) {
            console.error('Erro ao verificar se produto pode ser excluído:', error);
            throw error;
        }
    }

    /**
     * Exclui um produto permanentemente
     */
    async permanentDeleteProduct(productId) {
        try {
            const response = await permanentDeleteProduct(productId);
            this.clearCache();
            return response;
        } catch (error) {
            console.error('Erro ao excluir produto permanentemente:', error);
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
    async addIngredienteAoProduto(productId, ingredientId, portions) {
        try {
            // Validar dados antes de enviar
            if (!productId || !ingredientId || !portions) {
                throw new Error('Dados inválidos para adicionar ingrediente');
            }
            
            // Converter para os tipos corretos
            const productIdNum = this.safeParseInt(productId);
            const ingredientIdNum = this.safeParseInt(ingredientId);
            const portionsNum = this.safeParseFloat(portions);
            
            await addIngredientToProduct(productIdNum, ingredientIdNum, portionsNum);
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
        this.modalOpening = false; // Flag para evitar abertura múltipla do modal
        this.newImageFile = null; // Arquivo de nova imagem
        this.imageToRemove = false; // Flag para remover imagem
        this.isUpdating = false; // Flag para evitar atualizações simultâneas
        this.modalClickHandler = null; // Handler para delegação de eventos no modal
        this.imageCache = new Map(); // Cache para imagens
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
            
            // Expor função global para atualização de produtos
            window.refreshAllProducts = () => this.refreshAllProducts();
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
            if (e.target.matches('.editar, .fa-edit')) {
                this.handleEditClick(e.target);
            }
        });

        // Event delegation para botões de exclusão permanente
        section.addEventListener('click', (e) => {
            if (e.target.matches('.excluir, .fa-trash')) {
                this.handlePermanentDeleteClick(e.target);
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
            const ingredientesRaw = response.items || response || [];
            
            // Mapear dados para garantir campos corretos
            this.ingredientesDisponiveis = ingredientesRaw.map(ingrediente => ({
                id: ingrediente.id,
                name: ingrediente.name,
                price: ingrediente.price,
                base_portion_quantity: ingrediente.base_portion_quantity || 1,
                base_portion_unit: ingrediente.base_portion_unit || 'un',
                stock_unit: ingrediente.stock_unit || 'un',
                is_available: ingrediente.is_available !== undefined ? ingrediente.is_available : true
            }));
            
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
            // Atualiza custo estimado real baseado nos ingredientes
            this.refreshProductEstimatedCost(produto.id, card);
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
     * Constrói URL correta para imagem do produto com cache inteligente
     */
    buildImageUrl(imagePath, imageHash = null) {
        if (!imagePath) return null;
        
        // Se já é uma URL completa, usar diretamente
        if (imagePath.startsWith('http')) {
            return imagePath;
        }
        
        // URL base dinâmica baseada na origem atual
        const currentOrigin = window.location.origin;
        let baseUrl;
        
        // Se estamos em localhost, usar localhost:5000
        if (currentOrigin.includes('localhost') || currentOrigin.includes('127.0.0.1')) {
            baseUrl = 'http://localhost:5000';
        } else {
            // Para outros ambientes, usar a mesma origem mas porta 5000
            const hostname = window.location.hostname;
            baseUrl = `http://${hostname}:5000`;
        }
        
        // Usa hash da imagem se disponível, senão usa timestamp
        const cacheParam = imageHash || new Date().getTime();
        
        // Se é um caminho do backend (/api/uploads/products/ID.jpeg)
        if (imagePath.startsWith('/api/uploads/products/')) {
            return `${baseUrl}${imagePath}?v=${cacheParam}`;
        }
        
        // Se é um caminho antigo (/uploads/products/ID.jpeg)
        if (imagePath.startsWith('/uploads/products/')) {
            return `${baseUrl}${imagePath.replace('/uploads/', '/api/uploads/')}?v=${cacheParam}`;
        }
        
        // Se é apenas o nome do arquivo (ID.jpeg, ID.jpg, etc.)
        if (imagePath.match(/^\d+\.(jpg|jpeg|png|gif|webp)$/i)) {
            return `${baseUrl}/api/uploads/products/${imagePath}?v=${cacheParam}`;
        }
        
        // Fallback: assumir que é um caminho relativo
        return `${baseUrl}/api/uploads/products/${imagePath}?v=${cacheParam}`;
    }

    /**
     * Verifica se a imagem mudou e atualiza apenas se necessário
     */
    updateImageIfChanged(imgElement, newImagePath, newImageHash) {
        if (!imgElement || !newImagePath) return;
        
        const currentSrc = imgElement.src;
        const newSrc = this.buildImageUrl(newImagePath, newImageHash);
        
        // Se a URL mudou, atualiza a imagem
        if (currentSrc !== newSrc) {
            // Verifica se a imagem já está carregada para evitar piscar
            const tempImg = new Image();
            tempImg.onload = () => {
                imgElement.src = newSrc;
                imgElement.alt = imgElement.alt || 'Produto';
            };
            tempImg.src = newSrc;
        }
    }

    /**
     * Cria elemento de imagem com fallback
     */
    createImageElement(produto) {
        const imageUrl = this.buildImageUrl(produto.imagem, produto.image_hash);
        
        if (imageUrl) {
            // Usar createElement para evitar XSS
            const img = document.createElement('img');
            img.src = this.escapeHtml(imageUrl);
            img.alt = this.escapeHtml(produto.nome || 'Produto');
            img.className = 'produto-imagem';
            img.loading = 'lazy'; // CORREÇÃO: Lazy loading para melhor performance
            
            // CORREÇÃO: Melhor tratamento de erro com timeout
            let errorTimeout;
            img.onload = () => {
                if (errorTimeout) clearTimeout(errorTimeout);
            };
            
            img.onerror = () => {
                if (errorTimeout) clearTimeout(errorTimeout);
                const placeholder = document.createElement('div');
                placeholder.className = 'imagem-placeholder';
                placeholder.innerHTML = '<i class="fa-solid fa-image"></i><p>Imagem não encontrada</p>';
                img.parentNode?.replaceChild(placeholder, img);
            };
            
            // Timeout para detectar imagens que não carregam
            errorTimeout = setTimeout(() => {
                if (!img.complete || img.naturalHeight === 0) {
                    const placeholder = document.createElement('div');
                    placeholder.className = 'imagem-placeholder';
                    placeholder.innerHTML = '<i class="fa-solid fa-image"></i><p>Carregando...</p>';
                    img.parentNode?.replaceChild(placeholder, img);
                }
            }, 5000); // 5 segundos de timeout
            
            return img.outerHTML;
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
        
        // custo inicial 0; será atualizado via refreshProductEstimatedCost() com dados do backend
        const custoEstimado = 0;
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
                        <i class="fa-solid fa-pen-to-square editar" title="Editar produto"></i>
                        <!-- <i class="fa-solid fa-trash excluir" title="Excluir permanentemente"></i> -->
                    </div>
                </div>
                
                <p class="descricao-produto">${this.escapeHtml(descricaoLimitada)}</p>

                <div class="categoria-status">
                    <div class="categoria">${this.escapeHtml(categoriaNome)}</div>
                    <div class="status ${produto.ativo ? 'disponivel' : 'indisponivel'}">
                        <i class="fa-solid fa-${produto.ativo ? 'eye' : 'eye-slash'}"></i>
                        <span class="status-text">${produto.ativo ? 'Disponível' : 'Indisponível'}</span>
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
     * Utilitário para escapar HTML de forma segura
     */
    escapeHtml(text) {
        if (typeof text !== 'string') return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Utilitário para sanitizar HTML de forma segura
     */
    sanitizeHtml(html) {
        if (typeof html !== 'string') return '';
        // Remove tags potencialmente perigosas
        return html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
                  .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
                  .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '');
    }

    /**
     * Utilitário para truncar texto
     */
    truncateText(text, maxLength) {
        if (!text || text.length <= maxLength) return text;
        return text.substring(0, maxLength) + '...';
    }

    /**
     * Utilitário para formatar moeda de forma segura
     */
    formatCurrency(value) {
        const numValue = this.dataManager.safeParseFloat(value);
        return numValue.toFixed(2).replace('.', ',');
    }

    /**
     * Utilitário para logs seguros (remove dados sensíveis)
     */
    safeLog(message, data = null) {
        if (process.env.NODE_ENV === 'development') {
            if (data) {
                console.log(message, data);
            } else {
                console.log(message);
            }
        }
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
     * Trata clique no botão de exclusão permanente
     */
    async handlePermanentDeleteClick(button) {
        const card = button.closest('.card-produto');
        const produtoId = parseInt(card.dataset.produtoId);
        const produtoNome = card.querySelector('h3').textContent;

        try {
            // Primeiro verificar se pode excluir
            const canDelete = await this.dataManager.canDeleteProduct(produtoId);
            
            if (!canDelete.can_delete) {
                // Mostrar modal de informações sobre por que não pode excluir
                this.showCannotDeleteModal(produtoNome, canDelete.reasons, canDelete.details);
                return;
            }

            // Mostrar modal de confirmação
            const confirmed = await this.showDeleteConfirmationModal(produtoNome, canDelete.details);
            
            if (confirmed) {
                // Executar exclusão permanente
                await this.executePermanentDelete(produtoId, produtoNome);
            }
        } catch (error) {
            console.error('Erro ao processar exclusão permanente:', error);
            this.showErrorMessage('Erro ao processar exclusão permanente');
        }
    }

    /**
     * Mostra modal informando por que o produto não pode ser excluído
     */
    showCannotDeleteModal(produtoNome, reasons, details) {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>⚠️ Não é possível excluir</h3>
                    <button class="close-modal">&times;</button>
                </div>
                <div class="modal-body">
                    <p><strong>${produtoNome}</strong> não pode ser excluído permanentemente pelos seguintes motivos:</p>
                    <ul class="reasons-list">
                        ${reasons.map(reason => `<li>${reason}</li>`).join('')}
                    </ul>
                    <div class="details-info">
                        <h4>Detalhes:</h4>
                        <p>• Pedidos ativos: ${details.active_orders}</p>
                        <p>• Itens no carrinho: ${details.cart_items}</p>
                        <p>• Ingredientes relacionados: ${details.ingredients_count}</p>
                    </div>
                    <div class="actions-info">
                        <h4>Para excluir este produto:</h4>
                        <p>1. Finalize ou cancele todos os pedidos ativos</p>
                        <p>2. Remova o produto de todos os carrinhos</p>
                        <p>3. Tente novamente a exclusão</p>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary close-modal">Entendi</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        document.body.style.overflow = 'hidden';

        // Event listeners para fechar modal
        modal.querySelectorAll('.close-modal').forEach(btn => {
            btn.addEventListener('click', () => {
                document.body.removeChild(modal);
                document.body.style.overflow = 'auto';
            });
        });

        // Fechar ao clicar no overlay
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                document.body.removeChild(modal);
                document.body.style.overflow = 'auto';
            }
        });
    }

    /**
     * Mostra modal de confirmação para exclusão permanente
     */
    async showDeleteConfirmationModal(produtoNome, details) {
        return new Promise((resolve) => {
            const modal = document.createElement('div');
            modal.className = 'modal-overlay';
            modal.innerHTML = `
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>🗑️ Exclusão Permanente</h3>
                        <button class="close-modal">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="warning-box">
                            <i class="fa-solid fa-exclamation-triangle"></i>
                            <p><strong>ATENÇÃO:</strong> Esta operação é irreversível!</p>
                        </div>
                        <p>Você está prestes a excluir permanentemente o produto:</p>
                        <p class="product-name"><strong>${produtoNome}</strong></p>
                        <div class="deletion-details">
                            <h4>Serão removidos:</h4>
                            <p>• Ingredientes relacionados: ${details.ingredients_count}</p>
                            <p>• Histórico de pedidos</p>
                            <p>• Itens de carrinho</p>
                            <p>• Imagem do produto</p>
                        </div>
                        <div class="confirmation-text">
                            <label>
                                <input type="checkbox" id="confirm-deletion" required>
                                Eu entendo que esta ação é irreversível e desejo continuar
                            </label>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary cancel-delete">Cancelar</button>
                        <button class="btn btn-danger confirm-delete" disabled>Excluir Permanentemente</button>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);
            document.body.style.overflow = 'hidden';

            const confirmCheckbox = modal.querySelector('#confirm-deletion');
            const confirmBtn = modal.querySelector('.confirm-delete');
            const cancelBtn = modal.querySelector('.cancel-delete');
            const closeBtns = modal.querySelectorAll('.close-modal');

            // Habilitar botão de confirmação apenas quando checkbox estiver marcado
            confirmCheckbox.addEventListener('change', () => {
                confirmBtn.disabled = !confirmCheckbox.checked;
            });

            // Event listeners
            confirmBtn.addEventListener('click', () => {
                document.body.removeChild(modal);
                document.body.style.overflow = 'auto';
                resolve(true);
            });

            cancelBtn.addEventListener('click', () => {
                document.body.removeChild(modal);
                document.body.style.overflow = 'auto';
                resolve(false);
            });

            closeBtns.forEach(btn => {
                btn.addEventListener('click', () => {
                    document.body.removeChild(modal);
                    document.body.style.overflow = 'auto';
                    resolve(false);
                });
            });

            // Fechar ao clicar no overlay
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    document.body.removeChild(modal);
                    document.body.style.overflow = 'auto';
                    resolve(false);
                }
            });
        });
    }

    /**
     * Executa a exclusão permanente do produto
     */
    async executePermanentDelete(produtoId, produtoNome) {
        try {
            // Mostrar loading
            const loadingToast = showToast('Excluindo produto permanentemente...', { 
                type: 'info', 
                duration: 0 
            });

            const result = await this.dataManager.permanentDeleteProduct(produtoId);
            
            // Remover loading
            if (loadingToast && loadingToast.remove) {
                loadingToast.remove();
            }

            // Remover card da interface
            const card = document.querySelector(`[data-produto-id="${produtoId}"]`);
            if (card) {
                card.remove();
            }

            // Mostrar sucesso
            showToast(`Produto "${produtoNome}" excluído permanentemente!`, { 
                type: 'success',
                title: 'Exclusão Concluída'
            });

            // Atualizar contadores se necessário
            this.updateVisibleProductsCount();

        } catch (error) {
            console.error('Erro ao executar exclusão permanente:', error);
            
            let errorMessage = 'Erro ao excluir produto permanentemente';
            
            if (error.status === 404) {
                errorMessage = 'Produto não encontrado';
            } else if (error.status === 409) {
                errorMessage = 'Produto não pode ser excluído devido a dependências ativas';
            } else if (error.status === 403) {
                errorMessage = 'Você não tem permissão para excluir produtos permanentemente';
            }

            this.showErrorMessage(errorMessage);
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
            // Atualiza imediatamente o status visual do card (ícone/label/toggle)
            this.updateProdutoStatus(card, { ativo: novoStatus });
            
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
        // Evitar abertura múltipla do modal
        if (this.modalOpening) {
            return;
        }
        
        this.modalOpening = true;
        
        try {
            const titulo = document.getElementById('titulo-modal');
            const btnSalvar = document.getElementById('salvar-produto');

            // Inicializar variáveis de imagem
            this.newImageFile = null;
            this.imageToRemove = false;

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
        } finally {
            // Reset da flag após um pequeno delay
            setTimeout(() => {
                this.modalOpening = false;
            }, 100);
        }
    }

    /**
     * Fecha modal de produto
     */
    closeProdutoModal() {
        // Usar sistema centralizado de modais
        fecharModal('modal-produto');
        this.currentEditingId = null;
        
        // Reset das variáveis de imagem
        this.newImageFile = null;
        this.imageToRemove = false;
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
        // Remover listeners existentes para evitar duplicação
        this.removeModalListeners();

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

        // Listener para select de ingredientes - atualizar info da porção base
        const selectIngrediente = document.getElementById('ingrediente-select');
        if (selectIngrediente) {
            selectIngrediente.addEventListener('change', (e) => {
                this.updateIngredientePorcaoInfo(e.target);
            });
        }

        // Atualizar custo estimado inicial
        this.updateEstimatedCost();

        // Event delegation para botões de remover ingrediente
        const modal = document.getElementById('modal-produto');
        if (modal) {
            // Remover handler anterior se existir para evitar duplicação
            if (this.modalClickHandler) {
                modal.removeEventListener('click', this.modalClickHandler);
            }
            // Criar e registrar novo handler
            this.modalClickHandler = (e) => {
                const removeBtn = e.target.closest('.btn-remover-ingrediente');
                if (removeBtn) {
                    this.removeIngredientFromRecipe(removeBtn);
                }
            };
            modal.addEventListener('click', this.modalClickHandler);
        }
    }

    /**
     * Atualiza informações da porção base do ingrediente selecionado
     */
    updateIngredientePorcaoInfo(selectElement) {
        const infoPorcaoField = document.getElementById('info-porcao-ingrediente');
        const infoPorcaoSpan = document.getElementById('info-porcao-ingrediente-span');
        
        if (!infoPorcaoField && !infoPorcaoSpan) return;

        const selectedOption = selectElement.options[selectElement.selectedIndex];
        if (selectedOption && selectedOption.value) {
            const quantidade = selectedOption.dataset.porcaoQuantidade || '1';
            const unidade = selectedOption.dataset.porcaoUnidade || 'un';
            const porcaoTexto = `${quantidade} ${unidade}`;
            
            // Atualizar o campo de input se existir
            if (infoPorcaoField) {
                infoPorcaoField.value = porcaoTexto;
            }
            
            // Atualizar o span se existir
            if (infoPorcaoSpan) {
                infoPorcaoSpan.textContent = porcaoTexto;
            }
        } else {
            // Limpar os campos
            if (infoPorcaoField) {
                infoPorcaoField.value = '';
            }
            if (infoPorcaoSpan) {
                infoPorcaoSpan.textContent = '100g'; // Valor padrão
            }
        }
    }

    /**
     * Remove listeners do modal para evitar duplicação
     */
    removeModalListeners() {
        // Remover listeners específicos se necessário
        const btnCancelar = document.getElementById('cancelar-produto');
        const btnSalvar = document.getElementById('salvar-produto');
        const btnAdicionarIngrediente = document.getElementById('btn-adicionar-ingrediente');
        const modal = document.getElementById('modal-produto');
        
        if (btnCancelar) {
            btnCancelar.replaceWith(btnCancelar.cloneNode(true));
        }
        if (btnSalvar) {
            btnSalvar.replaceWith(btnSalvar.cloneNode(true));
        }
        if (btnAdicionarIngrediente) {
            btnAdicionarIngrediente.replaceWith(btnAdicionarIngrediente.cloneNode(true));
        }
        // Remover delegação de eventos do modal se existir
        if (modal && this.modalClickHandler) {
            modal.removeEventListener('click', this.modalClickHandler);
            this.modalClickHandler = null;
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

        // Clique na imagem existente para trocar
        previewImagem.addEventListener('click', (e) => {
            // Evitar clique no botão de remover
            if (!e.target.closest('#remover-imagem')) {
                fileInput.click();
            }
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
        btnRemoverImagem.addEventListener('click', (e) => {
            e.stopPropagation(); // Evitar que o clique se propague para o preview
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

        // Armazenar arquivo para envio
        this.newImageFile = file;
        this.imageToRemove = false; // Reset flag de remoção

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
            
            // Manter cursor pointer para permitir troca
            previewImagem.style.cursor = 'pointer';
            previewImagem.title = 'Clique para trocar a imagem';
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
            previewImagem.style.cursor = '';
            previewImagem.title = '';
            imagemPreview.src = '';
            
            // Reset das variáveis de imagem
            this.newImageFile = null;
            this.imageToRemove = true;
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
                    // API pode retornar 'portions' (modelo novo) ou 'quantity' (legado)
                    const porcoes = this.dataManager.safeParseFloat(
                        ingrediente.portions !== undefined ? ingrediente.portions : ingrediente.quantity
                    );

                    if (porcoes > 0) {
                        this.addIngredientToList(ingredienteCompleto, porcoes, 'porções', true /* persisted */);
                    }
                }
            }
            
            // Atualizar custo estimado
            this.updateEstimatedCost();
            
        } catch (error) {
            console.error('Erro ao carregar ingredientes existentes:', error);
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
                
                // Adicionar cursor pointer para indicar que é clicável
                previewImagem.style.cursor = 'pointer';
                previewImagem.title = 'Clique para trocar a imagem';
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
            
            // Recarregar a lista para incluir o novo card imediatamente
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

        // Adicionar dados de imagem se houver alteração
        if (this.newImageFile) {
            produtoData.imageFile = this.newImageFile;
        }
        if (this.imageToRemove) {
            produtoData.removeImage = true;
        }

        try {
            await this.saveProductWithIngredients(produtoData);
            
            // Atualizar todas as imagens e informações dos produtos
            await this.updateAllProdutosInUI();
            
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
     * Atualiza todas as imagens e informações dos produtos na interface
     */
    async updateAllProdutosInUI() {
        try {
            // Prevenir múltiplas execuções simultâneas
            if (this.isUpdating) {
                return;
            }
            this.isUpdating = true;
            
            // Buscar todos os produtos atualizados
            const response = await this.dataManager.getAllProdutos({ 
                page_size: 1000, 
                include_inactive: true 
            });
            
            const produtosRaw = response.items || [];
            const produtos = produtosRaw.map(produto => this.mapProdutoFromAPI(produto));
            
            // Criar mapa para lookup O(1) em vez de O(n)
            const produtosMap = new Map(produtos.map(p => [p.id, p]));
            
            // Atualizar cada card existente de forma otimizada
            const cards = document.querySelectorAll('.card-produto');
            const updatePromises = Array.from(cards).map(card => {
                const produtoId = parseInt(card.dataset.produtoId);
                const produtoAtualizado = produtosMap.get(produtoId);
                
                if (produtoAtualizado) {
                    return this.updateSingleProdutoCard(card, produtoAtualizado);
                }
                return Promise.resolve();
            });
            
            await Promise.all(updatePromises);
            
        } catch (error) {
            console.error('Erro ao atualizar produtos globalmente:', error);
            // Fallback: recarregar todos os produtos
            await this.loadProdutos();
        } finally {
            this.isUpdating = false;
        }
    }

    /**
     * Atualiza um card específico de produto
     */
    updateSingleProdutoCard(card, produtoAtualizado) {
        try {
            // Atualizar imagem com cache busting otimizado
            const imagemContainer = card.querySelector('.imagem-produto');
            if (imagemContainer) {
                // Só aplicar cache busting se a imagem mudou
                const currentImg = imagemContainer.querySelector('img');
                const currentSrc = currentImg?.src;
                const newSrc = this.buildImageUrl(produtoAtualizado.imagem);
                
                if (currentSrc !== newSrc) {
                    const produtoComCacheBust = {
                        ...produtoAtualizado,
                        imagem: produtoAtualizado.imagem ? `${produtoAtualizado.imagem}?t=${Date.now()}` : produtoAtualizado.imagem
                    };
                    imagemContainer.innerHTML = this.createImageElement(produtoComCacheBust);
                }
            }
            
            // Atualizar informações do produto
            this.updateProdutoInfo(card, produtoAtualizado);
            
            // Efeito visual de atualização
            this.showImageUpdateEffect(card);

            // Atualizar custo estimado real baseado nos ingredientes
            this.refreshProductEstimatedCost(produtoAtualizado.id, card);
        } catch (error) {
            console.error('Erro ao atualizar card do produto:', error);
        }
    }

    /**
     * Busca o custo estimado pelo backend (somando porções dos ingredientes)
     * e atualiza o card (custo e margem) sem depender do cost_price salvo.
     */
    async refreshProductEstimatedCost(productId, cardEl = null) {
        try {
            const card = cardEl || document.querySelector(`[data-produto-id="${productId}"]`);
            if (!card) return;

            const response = await this.dataManager.getIngredientesProduto(productId);
            let estimatedCost = response && (response.estimated_cost ?? response.total_cost);
            // Salvaguarda: alguns backends retornam valor em centavos (inteiro sem decimais).
            // Se parecer centavos (inteiro grande), dividir por 100.
            if (typeof estimatedCost === 'number') {
                const hasDecimal = Math.abs(estimatedCost % 1) > 0;
                if (!hasDecimal && Math.abs(estimatedCost) >= 1000) {
                    estimatedCost = estimatedCost / 1000; // centavos -> reais
                }
            } else if (typeof estimatedCost === 'string') {
                estimatedCost = this.dataManager.safeParseFloat(estimatedCost.replace('R$', '').replace(/\./g, '').replace(',', '.'));
            } else {
                estimatedCost = 0;
            }

            // Atualiza custo
            const custoElement = card.querySelector('.custo-estimado');
            if (custoElement) {
                custoElement.textContent = `R$ ${this.formatCurrency(estimatedCost)}`;
            }

            // Atualiza margem usando o preço de venda do card
            const precoElement = card.querySelector('.preco');
            const margemElement = card.querySelector('.margem');
            if (precoElement && margemElement) {
                const precoTexto = precoElement.textContent
                    .replace('R$', '')
                    .replace(/\./g, '')
                    .replace(',', '.');
                const precoVenda = this.dataManager.safeParseFloat(precoTexto);
                const margem = this.calcularMargemLucro(precoVenda, estimatedCost);
                margemElement.textContent = `${margem.toFixed(1)}%`;
                margemElement.className = `valor margem ${this.getMarginClass(margem)}`;
            }
        } catch (error) {
            // Silencioso: se falhar, mantém valores atuais do card
        }
    }

    /**
     * Atualiza as informações de um produto no card de forma otimizada
     */
    updateProdutoInfo(card, produto) {
        try {
            // Validação de entrada
            if (!card || !produto) {
                return;
            }

            // Atualizar nome
            const nomeElement = card.querySelector('h3');
            if (nomeElement && produto.nome) {
                nomeElement.textContent = this.escapeHtml(produto.nome);
            }
            
            // Atualizar descrição
            const descricaoElement = card.querySelector('.descricao-produto');
            if (descricaoElement) {
                const descricaoLimitada = this.truncateText(produto.descricao || 'Sem descrição', 50);
                descricaoElement.textContent = this.escapeHtml(descricaoLimitada);
            }
            
            // Atualizar preço
            const precoElement = card.querySelector('.preco');
            if (precoElement) {
                const precoVenda = this.dataManager.safeParseFloat(produto.preco);
                precoElement.textContent = `R$ ${this.formatCurrency(precoVenda)}`;
            }
            
            // Atualizar categoria
            const categoriaElement = card.querySelector('.categoria');
            if (categoriaElement) {
                const categoriaNome = this.getCategoriaNome(produto.categoriaId);
                categoriaElement.textContent = this.escapeHtml(categoriaNome);
            }
            
            // Atualizar status de forma segura
            this.updateProdutoStatus(card, produto);
            
            // Atualizar custo e margem se existirem
            this.updateProdutoCostAndMargin(card, produto);
            
        } catch (error) {
            console.error('Erro ao atualizar informações do produto:', error);
            // Não quebrar o fluxo, apenas logar o erro
        }
    }

    /**
     * Atualiza o status do produto de forma segura
     */
    updateProdutoStatus(card, produto) {
        const statusElement = card.querySelector('.status');
        const toggleCheckbox = card.querySelector('.toggle input');
        
        if (statusElement && toggleCheckbox) {
            const statusClass = produto.ativo ? 'disponivel' : 'indisponivel';
            const statusText = produto.ativo ? 'Disponível' : 'Indisponível';
            const iconClass = produto.ativo ? 'fa-eye' : 'fa-eye-slash';
            
            statusElement.className = `status ${statusClass}`;
            const iconEl = statusElement.querySelector('i');
            const textEl = statusElement.querySelector('.status-text');
            if (iconEl) {
                iconEl.className = `fa-solid fa-${iconClass}`;
            } else {
                statusElement.insertAdjacentHTML('afterbegin', `<i class="fa-solid fa-${iconClass}"></i>`);
            }
            if (textEl) {
                textEl.textContent = this.escapeHtml(statusText);
            } else {
                statusElement.insertAdjacentHTML('beforeend', ` <span class="status-text">${this.escapeHtml(statusText)}</span>`);
            }
            toggleCheckbox.checked = Boolean(produto.ativo);
        }
    }

    /**
     * Atualiza custo e margem do produto
     */
    updateProdutoCostAndMargin(card, produto) {
        const custoElement = card.querySelector('.custo');
        const margemElement = card.querySelector('.margem');
        
        if (custoElement) {
            const custoEstimado = this.dataManager.safeParseFloat(produto.precoCusto);
            custoElement.textContent = `R$ ${this.formatCurrency(custoEstimado)}`;
        }
        
        if (margemElement) {
            const custoEstimado = this.dataManager.safeParseFloat(produto.precoCusto);
            const precoVenda = this.dataManager.safeParseFloat(produto.preco);
            const margemLucro = this.calcularMargemLucro(precoVenda, custoEstimado);
            margemElement.textContent = `${margemLucro.toFixed(1)}%`;
        }
    }

    /**
     * Atualiza a imagem do produto na interface sem recarregar a página
     */
    async updateProdutoImageInUI(produtoId) {
        try {
            // Encontrar o card do produto na interface
            const card = document.querySelector(`[data-produto-id="${produtoId}"]`);
            
            if (card) {
                // Mostrar indicador de carregamento
                this.showImageLoadingIndicator(card);
            }
            
            // Buscar dados atualizados do produto
            const produtoAtualizado = await this.dataManager.getProdutoById(produtoId);
            
            if (produtoAtualizado) {
                // Mapear dados da API para o formato do frontend
                const produtoMapeado = this.mapProdutoFromAPI(produtoAtualizado);
                
                if (card) {
                    // Atualizar apenas a imagem do card
                    const imagemContainer = card.querySelector('.imagem-produto');
                    if (imagemContainer) {
                        // Adicionar cache busting para forçar reload da imagem
                        const produtoComCacheBust = {
                            ...produtoMapeado,
                            imagem: produtoMapeado.imagem ? `${produtoMapeado.imagem}?t=${Date.now()}` : produtoMapeado.imagem
                        };
                        
                        imagemContainer.innerHTML = this.createImageElement(produtoComCacheBust);
                    }
                    
                    // Adicionar efeito visual de atualização
                    this.showImageUpdateEffect(card);
                }
            }
        } catch (error) {
            console.error('Erro ao atualizar imagem do produto na interface:', error);
            // Se falhar, recarregar todos os produtos como fallback
            await this.loadProdutos();
        }
    }

    /**
     * Mostra indicador de carregamento na imagem
     */
    showImageLoadingIndicator(card) {
        const imagemContainer = card.querySelector('.imagem-produto');
        if (imagemContainer) {
            imagemContainer.innerHTML = `
                <div class="imagem-loading">
                    <i class="fa-solid fa-spinner fa-spin"></i>
                    <p>Atualizando imagem...</p>
                </div>
            `;
        }
    }

    /**
     * Mostra efeito visual de atualização da imagem
     */
    showImageUpdateEffect(card) {
        card.style.transition = 'opacity 0.3s ease';
        card.style.opacity = '0.7';
        
        setTimeout(() => {
            card.style.opacity = '1';
        }, 300);
    }

    /**
     * Função global para atualizar todos os produtos
     * Pode ser chamada de qualquer lugar da aplicação
     */
    async refreshAllProducts() {
        try {
            await this.updateAllProdutosInUI();
        } catch (error) {
            console.error('Erro na atualização global de produtos:', error);
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
        const quantidadePorcoesInput = document.getElementById('quantidade-porcoes-ingrediente');
        const infoPorcaoField = document.getElementById('info-porcao-ingrediente');

        if (!ingredienteSelect || !quantidadePorcoesInput || !infoPorcaoField) {
            this.showErrorMessage('Erro: Campos de ingrediente não encontrados');
            return;
        }

        const ingredienteId = ingredienteSelect.value;
        const quantidadePorcoes = this.dataManager.safeParseFloat(quantidadePorcoesInput.value);

        if (!ingredienteId) {
            this.showErrorMessage('Selecione um ingrediente');
            return;
        }

        if (!quantidadePorcoesInput.value || quantidadePorcoes <= 0) {
            this.showErrorMessage('Digite um número de porções válido');
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

        // Adicionar à lista de ingredientes (usando porções)
        this.addIngredientToList(ingrediente, quantidadePorcoes, 'porções');

        // Limpar formulário
        ingredienteSelect.value = '';
        quantidadePorcoesInput.value = '';
        infoPorcaoField.value = '';

        // Atualizar custo estimado
        this.updateEstimatedCost();
    }

    /**
     * Converte o preço unitário do ingrediente para a unidade da receita
     * Adicionada validação robusta e tratamento de casos extremos
     */
    convertPriceToRecipeUnit(precoUnitario, ingredienteUnidade, receitaUnidade) {
        // Validação de parâmetros de entrada
        if (!precoUnitario || precoUnitario <= 0 || isNaN(precoUnitario)) {
            return 0;
        }
        
        if (!ingredienteUnidade || !receitaUnidade) {
            return precoUnitario;
        }

        // Se as unidades são iguais, não precisa converter
        if (ingredienteUnidade.toLowerCase() === receitaUnidade.toLowerCase()) {
            return precoUnitario;
        }

        // Conversões de kg para g
        if (ingredienteUnidade.toLowerCase() === 'kg' && receitaUnidade.toLowerCase() === 'g') {
            return precoUnitario / 1000; // R$ 10/kg = R$ 0,01/g
        }

        // Conversões de g para kg
        if (ingredienteUnidade.toLowerCase() === 'g' && receitaUnidade.toLowerCase() === 'kg') {
            return precoUnitario * 1000; // R$ 0,01/g = R$ 10/kg
        }

        // Conversões de L para ml
        if (ingredienteUnidade.toLowerCase() === 'l' && receitaUnidade.toLowerCase() === 'ml') {
            return precoUnitario / 1000; // R$ 8/L = R$ 0,008/ml
        }

        // Conversões de ml para L
        if (ingredienteUnidade.toLowerCase() === 'ml' && receitaUnidade.toLowerCase() === 'l') {
            return precoUnitario * 1000; // R$ 0,008/ml = R$ 8/L
        }

        // Se não conseguir converter, retorna o preço original
        return precoUnitario;
    }

    /**
     * Adiciona ingrediente à lista visual
     */
    addIngredientToList(ingrediente, quantidadePorcoes, unidade, persisted = false) {
        // Validação robusta de parâmetros
        if (!ingrediente || !ingrediente.id) {
            return;
        }
        
        if (!quantidadePorcoes || quantidadePorcoes <= 0 || isNaN(quantidadePorcoes)) {
            return;
        }

        const container = document.querySelector('.ingredientes-receita');
        if (!container) {
            return;
        }

        // Verificar se ingrediente já existe na lista
        const existingItem = container.querySelector(`[data-ingrediente-id="${ingrediente.id}"]`);
        if (existingItem) {
            return;
        }

        const ingredienteElement = document.createElement('div');
        ingredienteElement.className = 'ingrediente-item';
        ingredienteElement.dataset.ingredienteId = ingrediente.id;
        ingredienteElement.dataset.persisted = persisted ? 'true' : 'false';

        // Calcular custo baseado em porções
        const precoUnitario = this.dataManager.safeParseFloat(ingrediente.price);
        const quantidadePorcaoBase = this.dataManager.safeParseFloat(ingrediente.base_portion_quantity) || 1;
        const unidadePorcaoBase = ingrediente.base_portion_unit || 'un';
        const stockUnit = ingrediente.stock_unit || 'un';
        
        // Usar função de conversão centralizada
        const precoPorUnidadeBase = this.convertPriceToRecipeUnit(precoUnitario, stockUnit, unidadePorcaoBase);
        
        // Custo por porção = preço por unidade base * quantidade da porção base
        const custoPorPorcao = precoPorUnidadeBase * quantidadePorcaoBase;
        // Custo total = custo por porção * número de porções
        const custoTotal = custoPorPorcao * quantidadePorcoes;
        
        // Validar resultado do cálculo
        if (isNaN(custoTotal) || !isFinite(custoTotal)) {
            return;
        }
        

        ingredienteElement.innerHTML = `
            <div class="ingrediente-info">
                <div class="ingrediente-info-content">
                <span class="nome">${this.escapeHtml(ingrediente.name)}</span>
                <span class="quantidade">${quantidadePorcoes} porções (${quantidadePorcaoBase} ${unidadePorcaoBase} cada)</span>
                
                </div> 
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
    async removeIngredientFromRecipe(button) {
        const ingredienteElement = button.closest('.ingrediente-item');
        if (!ingredienteElement) return;

        const ingredienteId = ingredienteElement.dataset.ingredienteId;
        const isPersisted = ingredienteElement.dataset.persisted === 'true';

        // Se estamos editando um produto existente, remover também no backend
        if (this.currentEditingId && ingredienteId && isPersisted) {
            try {
                // Evitar cliques repetidos
                button.disabled = true;
                await this.dataManager.removeIngredienteDoProduto(this.currentEditingId, ingredienteId);

                // Remover da UI e atualizar custo
                ingredienteElement.remove();
                this.updateEstimatedCost();
                this.showSuccessMessage('Ingrediente removido do produto');
            } catch (error) {
                console.error('Erro ao remover ingrediente do produto:', error);
                this.showErrorMessage('Falha ao remover ingrediente');
            } finally {
                button.disabled = false;
            }
        } else {
            // Caso seja um produto novo (ainda não salvo), apenas remove da UI
            ingredienteElement.remove();
            this.updateEstimatedCost();
        }
    }

    /**
     * Atualiza custo estimado da receita de forma otimizada
     */
    updateEstimatedCost() {
        // Cache do elemento para evitar querySelector repetido
        if (!this.custoElement) {
            this.custoElement = document.getElementById('custo-estimado');
        }
        
        const ingredientes = document.querySelectorAll('.ingrediente-item');
        let custoTotal = 0;

        // Usar for...of para melhor performance que forEach
        for (const ingrediente of ingredientes) {
            const custoElement = ingrediente.querySelector('.custo');
            if (custoElement) {
                const custoText = custoElement.textContent;
                const custo = this.dataManager.safeParseFloat(custoText.replace('R$', '').replace(',', '.'));
                custoTotal += custo;
            }
        }

        // Atualizar exibição do custo estimado
        if (this.custoElement) {
            this.custoElement.textContent = `R$ ${this.formatCurrency(custoTotal)}`;
        }
    }

    /**
     * Carrega ingredientes no select
     */
    loadIngredientesInSelect() {
        const select = document.getElementById('ingrediente-select');
        if (!select) {
            return;
        }

        select.innerHTML = '<option value="">Selecione um ingrediente</option>';
        
        this.ingredientesDisponiveis.forEach(ingrediente => {
            const option = document.createElement('option');
            option.value = ingrediente.id;
            option.textContent = `${ingrediente.name} (${ingrediente.base_portion_quantity || 1} ${ingrediente.base_portion_unit || 'un'})`;
            option.dataset.porcaoQuantidade = ingrediente.base_portion_quantity || 1;
            option.dataset.porcaoUnidade = ingrediente.base_portion_unit || 'un';
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
                
                // Extrair número de porções do texto (ex: "2 porções (100g cada)")
                const match = quantidadeText.match(/(\d+(?:\.\d+)?)\s+porções/);
                const quantidadePorcoes = match ? this.dataManager.safeParseFloat(match[1]) : 0;

                // Validar dados antes de enviar
                if (!ingredienteId || !quantidadePorcoes) {
                    continue; // Pular este ingrediente e continuar com os outros
                }
                
                await this.dataManager.addIngredienteAoProduto(produtoId, ingredienteId, quantidadePorcoes);
            }

            return produtoId;
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

// Expor função global para atualização de produtos
window.refreshAllProducts = null; // Será definida quando a instância for criada
