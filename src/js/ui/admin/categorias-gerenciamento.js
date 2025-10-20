/**
 * Módulo de Gerenciamento de Categorias
 * Responsável por todas as operações relacionadas a categorias de produtos
 */

import { 
    createCategory, 
    updateCategory, 
    deleteCategory,
    getCategories,
    getCategoryById,
    reorderCategories
} from '../../api/categories.js';

import { getProducts, updateProduct, getProductById } from '../../api/products.js';
import { showToast, showConfirm } from '../alerts.js';

/**
 * Gerenciador de dados de categorias
 */
class CategoriaDataManager {
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
     * Busca todas as categorias
     */
    async getAllCategorias() {
        try {
            if (this.isCacheValid()) {
                return this.cache.data;
            }

            const response = await getCategories();
            this.cache.data = response;
            this.cache.lastFetch = Date.now();
            
            return response;
        } catch (error) {
            console.error('Erro ao buscar categorias:', error);
            throw error;
        }
    }

    /**
     * Busca categoria por ID
     */
    async getCategoriaById(id) {
        try {
            // Como não há endpoint específico, busca na lista de categorias
            const response = await getCategories();
            const categorias = response.items || [];
            const categoria = categorias.find(cat => cat.id === id);
            
            if (!categoria) {
                throw new Error('Categoria não encontrada');
            }
            
            return {
                id: categoria.id,
                nome: categoria.name,
                ordem: categoria.display_order || 0,
                ativo: categoria.is_active !== undefined ? categoria.is_active : true,
                dataCriacao: categoria.created_at || new Date().toISOString().split('T')[0],
                ultimaAtualizacao: categoria.updated_at || new Date().toISOString().split('T')[0]
            };
        } catch (error) {
            console.error('Erro ao buscar categoria:', error);
            throw error;
        }
    }

    /**
     * Adiciona nova categoria
     */
    async addCategoria(nome) {
        try {
            await createCategory({ name: nome });
            this.clearCache();
        } catch (error) {
            console.error('Erro ao adicionar categoria:', error);
            throw error;
        }
    }

    /**
     * Atualiza categoria
     */
    async updateCategoria(id, nome) {
        try {
            await updateCategory(id, { name: nome });
            this.clearCache();
        } catch (error) {
            console.error('Erro ao atualizar categoria:', error);
            throw error;
        }
    }

    /**
     * Remove categoria
     */
    async deleteCategoria(id) {
        try {
            await deleteCategory(id);
            this.clearCache();
        } catch (error) {
            console.error('Erro ao remover categoria:', error);
            throw error;
        }
    }

    /**
     * Reordena categorias
     */
    async reorderCategorias(categoriasOrdenadas) {
        try {
            const categories = categoriasOrdenadas.map(cat => ({
                id: cat.id,
                display_order: cat.order
            }));

            await reorderCategories(categories);
            this.clearCache();
        } catch (error) {
            console.error('Erro ao reordenar categorias:', error);
            throw error;
        }
    }

    /**
     * Busca itens de uma categoria (implementação simplificada)
     */
    async getItensByCategoria(categoriaId) {
        try {
            const response = await getProducts({ category_id: categoriaId, include_inactive: true, page_size: 1000 });
            const itens = response.items || [];
            return itens;
        } catch (error) {
            console.error('Erro ao buscar itens da categoria:', error);
            throw error;
        }
    }

    /**
     * Adiciona item à categoria (implementação simplificada)
     */
    async addItemToCategoria(categoriaId, produtoId) {
        try {
            // Implementação simplificada - atualiza o produto com a categoria
            await updateProduct(produtoId, { category_id: categoriaId });
            this.clearCache();
        } catch (error) {
            console.error('Erro ao adicionar item à categoria:', error);
            throw error;
        }
    }
    async removeItemFromCategoria(categoriaId, produtoId) {
        try {
            // Primeiro, obtém o produto atual para manter os outros campos
            const produto = await getProductById(produtoId);
            
            if (!produto) {
                throw new Error(`Produto com ID ${produtoId} não encontrado`);
            }
            
            // Cria um objeto de atualização que remove a categoria
            // Usamos -1 como valor especial para indicar remoção de categoria
            const updateData = {
                name: produto.name,
                description: produto.description,
                price: parseFloat(produto.price),
                cost_price: parseFloat(produto.cost_price || 0),
                preparation_time_minutes: produto.preparation_time_minutes || 0,
                category_id: -1 // Valor especial para indicar remoção
            };
            
            await updateProduct(produtoId, updateData);
            this.clearCache();
        } catch (error) {
            console.error('Erro ao remover item da categoria:', error);
            throw error;
        }
    }
}

/**
 * Gerenciador de interface de categorias
 */
class CategoriaManager {
    constructor() {
        this.dataManager = new CategoriaDataManager();
        this.currentCategoriaId = null;
        this.produtosSelecionados = new Set();
        this.produtosDisponiveis = [];
        this.eventListeners = [];
    }

    /**
     * Inicializa o módulo
     */
    async init() {
        try {
            await this.loadCategorias();
            this.setupEventListeners();
        } catch (error) {
            console.error('Erro ao inicializar módulo de categorias:', error);
            this.showErrorMessage('Erro ao carregar dados das categorias');
        }
    }

    /**
     * Configura event listeners
     */
    setupEventListeners() {
        // Remove listeners existentes para evitar duplicação
        this.removeEventListeners();
        
        this.setupCategoriaHandlers();
        this.setupModalHandlers();
    }

    /**
     * Remove event listeners existentes
     */
    removeEventListeners() {
        // Remove listeners específicos se existirem
        if (this.eventListeners) {
            this.eventListeners.forEach(({ element, event, handler }) => {
                element.removeEventListener(event, handler);
            });
            this.eventListeners = [];
        }
    }

    /**
     * Configura handlers específicos de categorias
     */
    setupCategoriaHandlers() {
        // Event delegation centralizado para todos os botões de categoria
        const handler = (e) => {
            if (e.target.matches('#btn-editar-categoria, .fa-edit')) {
                this.handleEditCategoria(e.target);
            } else if (e.target.matches('#btn-excluir-categoria, .fa-trash')) {
                this.handleDeleteCategoria(e.target);
            } else if (e.target.matches('#btn-acessar-itens, .fa-list')) {
                this.handleGerenciarItens(e.target);
            } else if (e.target.matches('#btn-adicionar-categoria')) {
                this.handleNovaCategoria();
            }
        };

        document.addEventListener('click', handler);
        this.eventListeners.push({ element: document, event: 'click', handler });
    }

    /**
     * Configura handlers dos modais
     */
    setupModalHandlers() {
        this.setupCategoriasModalListeners();
        this.setupItensModalListeners();
        this.setupCategoriaFormModalListeners();
        this.setupProdutosModalListeners();
    }

    /**
     * Configura listeners do modal de categorias
     */
    setupCategoriasModalListeners() {
        const modal = document.getElementById('modal-categorias');
        if (!modal) return;

        // Botão fechar
        const btnFechar = modal.querySelector('#cancelar-categorias');
        if (btnFechar) {
            btnFechar.addEventListener('click', () => this.closeCategoriasModal());
        }

        // Botão salvar ordem
        const btnSalvar = modal.querySelector('#salvar-categorias');
        if (btnSalvar) {
            btnSalvar.addEventListener('click', () => this.saveCategorias());
        }

        // Overlay
        const overlay = modal.querySelector('.div-overlay');
        if (overlay) {
            overlay.addEventListener('click', () => this.closeCategoriasModal());
        }
    }

    /**
     * Configura listeners do modal de itens
     */
    setupItensModalListeners() {
        const modal = document.getElementById('modal-itens');
        if (!modal) return;

        // Botão fechar
        const btnFechar = modal.querySelector('#cancelar-itens');
        if (btnFechar) {
            btnFechar.addEventListener('click', () => this.closeItensModal());
        }

        // Botão voltar
        const btnVoltar = modal.querySelector('#voltar-categorias');
        if (btnVoltar) {
            btnVoltar.addEventListener('click', () => this.voltarParaCategorias());
        }

        // Botão adicionar itens
        const btnAdicionar = modal.querySelector('#btn-adicionar-item');
        if (btnAdicionar) {
            btnAdicionar.addEventListener('click', () => this.openProdutosModal());
        }

        // Overlay
        const overlay = modal.querySelector('.div-overlay');
        if (overlay) {
            overlay.addEventListener('click', () => this.closeItensModal());
        }
    }

    /**
     * Configura listeners do modal de formulário de categoria
     */
    setupCategoriaFormModalListeners() {
        const modal = document.getElementById('modal-categoria-form');
        if (!modal) return;

        // Botão fechar
        const btnFechar = modal.querySelector('#cancelar-categoria-form');
        if (btnFechar) {
            btnFechar.addEventListener('click', () => this.closeCategoriaFormModal());
        }

        // Botão salvar
        const btnSalvar = modal.querySelector('#salvar-categoria-form');
        if (btnSalvar) {
            btnSalvar.addEventListener('click', () => this.saveCategoriaForm());
        }

        // Overlay
        const overlay = modal.querySelector('.div-overlay');
        if (overlay) {
            overlay.addEventListener('click', () => this.closeCategoriaFormModal());
        }
    }

    /**
     * Configura listeners do modal de produtos
     */
    setupProdutosModalListeners() {
        const modal = document.getElementById('modal-produtos');
        if (!modal) return;

        // Botão fechar
        const btnFechar = modal.querySelector('#cancelar-produtos');
        if (btnFechar) {
            btnFechar.addEventListener('click', () => this.closeProdutosModal());
        }

        // Botão adicionar selecionados
        const btnAdicionar = modal.querySelector('#adicionar-produtos');
        if (btnAdicionar) {
            btnAdicionar.addEventListener('click', () => this.adicionarProdutosSelecionados());
        }

        // Overlay
        const overlay = modal.querySelector('.div-overlay');
        if (overlay) {
            overlay.addEventListener('click', () => this.closeProdutosModal());
        }
    }

    /**
     * Carrega categorias
     */
    async loadCategorias() {
        try {
            const response = await this.dataManager.getAllCategorias();
            const categorias = response.items || [];
            this.renderCategoriaElements(categorias);
        } catch (error) {
            console.error('Erro ao carregar categorias:', error);
            this.showErrorMessage('Erro ao carregar categorias');
        }
    }

    /**
     * Renderiza elementos de categorias
     */
    renderCategoriaElements(categorias) {
        const container = document.querySelector('#lista-categorias');
        if (!container) return;

        container.innerHTML = '';

        if (!categorias || categorias.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fa-solid fa-tags"></i>
                    <p>Nenhuma categoria encontrada</p>
                </div>
            `;
            return;
        }

        categorias.forEach(categoria => {
            const element = this.createCategoriaElement(categoria);
            container.appendChild(element);
        });

        this.setupDragAndDrop();
    }

    /**
     * Cria elemento de categoria
     */
    createCategoriaElement(categoria) {
        const element = document.createElement('div');
        element.className = 'categoria-item';
        element.draggable = true;
        element.dataset.categoriaId = categoria.id;

        element.innerHTML = `
            <div class="info-categoria">
                        <div class="drag-handle">
                <i class="fa-solid fa-grip-vertical"></i>
            </div>
                <h3 class="nome-categoria">${categoria.name}</h3>
            </div>
            
            <div class="acoes-categoria">
                <button id="btn-acessar-itens" class="btn-acao btn-itens gerenciar-itens" title="Gerenciar itens"> Acessar itens
                    <i class="fa-solid fa-list"></i>
                </button>
                <button id="btn-editar-categoria" class="btn-acao btn-editar editar-categoria" title="Editar categoria">
                    <i class="fa-solid fa-edit"></i>
                </button>
                <button id="btn-excluir-categoria" class="btn-acao btn-excluir excluir-categoria" title="Excluir categoria">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
        `;

        return element;
    }

    /**
     * Configura drag and drop
     */
    setupDragAndDrop() {
        const container = document.querySelector('#lista-categorias');
        if (!container) return;

        let draggedElement = null;
        let draggedIndex = null;

        container.addEventListener('dragstart', (e) => {
            if (e.target.classList.contains('categoria-item')) {
                draggedElement = e.target;
                draggedIndex = Array.from(container.children).indexOf(e.target);
                e.target.classList.add('dragging');
                e.target.style.opacity = '0.5';
            }
        });

        container.addEventListener('dragend', (e) => {
            if (e.target.classList.contains('categoria-item')) {
                e.target.classList.remove('dragging');
                e.target.style.opacity = '1';
                
                // Verifica se a posição mudou
                const newIndex = Array.from(container.children).indexOf(e.target);
                if (draggedIndex !== newIndex) {
                    this.saveNewOrder();
                }
                
                draggedElement = null;
                draggedIndex = null;
            }
        });

        container.addEventListener('dragover', (e) => {
            e.preventDefault();
            container.classList.add('drag-over');
            const afterElement = this.getDragAfterElement(container, e.clientY);
            if (afterElement == null) {
                container.appendChild(draggedElement);
            } else {
                container.insertBefore(draggedElement, afterElement);
            }
        });

        container.addEventListener('dragleave', (e) => {
            if (!container.contains(e.relatedTarget)) {
                container.classList.remove('drag-over');
            }
        });

        container.addEventListener('drop', (e) => {
            e.preventDefault();
            container.classList.remove('drag-over');
        });
    }

    /**
     * Obtém elemento após o qual inserir o elemento arrastado
     */
    getDragAfterElement(container, y) {
        const draggableElements = [...container.querySelectorAll('.categoria-item:not(.dragging)')];
        
        return draggableElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = y - box.top - box.height / 2;
            
            if (offset < 0 && offset > closest.offset) {
                return { offset: offset, element: child };
            } else {
                return closest;
            }
        }, { offset: Number.NEGATIVE_INFINITY }).element;
    }

    /**
     * Salva a nova ordem das categorias
     */
    async saveNewOrder() {
        try {
            const container = document.querySelector('#lista-categorias');
            const categorias = Array.from(container.querySelectorAll('.categoria-item'));
            
            const categoriasOrdenadas = categorias.map((element, index) => ({
                id: parseInt(element.dataset.categoriaId),
                order: index + 1
            }));

            await this.dataManager.reorderCategorias(categoriasOrdenadas);
            this.showSuccessMessage('Ordem das categorias atualizada!');
        } catch (error) {
            console.error('Erro ao salvar ordem das categorias:', error);
            this.showErrorMessage('Erro ao salvar ordem das categorias. Tente novamente.');
        }
    }

    /**
     * Trata nova categoria
     */
    handleNovaCategoria() {
        this.openCategoriaFormModal();
    }

    /**
     * Trata edição de categoria
     */
    handleEditCategoria(button) {
        const element = button.closest('.categoria-item');
        const categoriaId = parseInt(element.dataset.categoriaId);
        const nome = element.querySelector('h3').textContent;
        
        this.openCategoriaFormModal(categoriaId, nome);
    }

    /**
     * Trata exclusão de categoria
     */
    async handleDeleteCategoria(button) {
        const element = button.closest('.categoria-item');
        const categoriaId = parseInt(element.dataset.categoriaId);
        const nome = element.querySelector('h3').textContent;

        try {
            const confirmed = await showConfirm({
                title: 'Confirmar Exclusão',
                message: `Tem certeza que deseja excluir a categoria "${nome}"? Esta ação não pode ser desfeita.`,
                confirmText: 'Excluir',
                cancelText: 'Cancelar',
                type: 'delete'
            });

            if (confirmed) {
                await this.dataManager.deleteCategoria(categoriaId);
                await this.loadCategorias();
                this.showSuccessMessage(`Categoria "${nome}" excluída com sucesso!`);
            }
        } catch (error) {
            console.error('Erro ao excluir categoria:', error);
            this.showErrorMessage('Erro ao excluir categoria. Tente novamente.');
        }
    }

    /**
     * Trata gerenciamento de itens
     */
    async handleGerenciarItens(button) {
        const element = button.closest('.categoria-item');
        const categoriaId = parseInt(element.dataset.categoriaId);
        
        this.currentCategoriaId = categoriaId;
        await this.openItensModal(categoriaId);
    }

    /**
     * Abre modal de categorias
     */
    async openCategoriasModal() {
        const modal = document.getElementById('modal-categorias');
        if (!modal) return;

        await this.loadCategorias();
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    }

    /**
     * Fecha modal de categorias
     */
    closeCategoriasModal() {
        const modal = document.getElementById('modal-categorias');
        if (modal) {
            modal.style.display = 'none';
            document.body.style.overflow = 'auto';
        }
    }

    /**
     * Abre modal de itens
     */
    async openItensModal(categoriaId) {
        const modal = document.getElementById('modal-itens');
        if (!modal) return;

        try {
            // Buscar dados da categoria para definir o título
            const categoria = await this.dataManager.getCategoriaById(categoriaId);
            const titulo = modal.querySelector('#titulo-itens-categoria');
            if (titulo) {
                titulo.textContent = `Itens da Categoria: ${categoria.nome}`;
            }

            await this.loadItens(categoriaId);
            modal.style.display = 'flex';
            document.body.style.overflow = 'hidden';
        } catch (error) {
            console.error('Erro ao abrir modal de itens:', error);
            this.showErrorMessage('Erro ao carregar itens da categoria');
        }
    }

    /**
     * Fecha modal de itens
     */
    closeItensModal() {
        const modal = document.getElementById('modal-itens');
        if (modal) {
            modal.style.display = 'none';
            document.body.style.overflow = 'auto';
        }
        this.currentCategoriaId = null;
    }

    /**
     * Volta para modal de categorias
     */
    voltarParaCategorias() {
        this.closeItensModal();
        this.openCategoriasModal();
    }

    /**
     * Carrega itens de uma categoria
     */
    async loadItens(categoriaId) {
        try {
            const itens = await this.dataManager.getItensByCategoria(categoriaId);
            this.renderItens(itens);
        } catch (error) {
            console.error('Erro ao carregar itens:', error);
            throw error;
        }
    }

    /**
     * Renderiza itens
     */
    renderItens(itens) {
        const container = document.querySelector('#lista-itens');
        if (!container) {
            console.error('Container #lista-itens não encontrado!');
            return;
        }

        container.innerHTML = '';

        if (!itens || itens.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fa-solid fa-box-open"></i>
                    <p>Esta categoria não possui produtos associados.</p>
                </div>
            `;
            return;
        }
        itens.forEach(item => {
            const element = this.createItemElement(item);
            container.appendChild(element);
        });
    }

    /**
     * Cria elemento de item
     */
    createItemElement(item) {
        const element = document.createElement('div');
        element.className = 'item-categoria';
        element.dataset.itemId = item.id;

        element.innerHTML = `
            <div class="info-item">
                <div class="item-header">
                    <p class="nome-item">${item.name}</p>
                    <span class="item-status">Ativo</span>
                </div>
                <p class="valor-item">R$ ${parseFloat(item.price).toFixed(2).replace('.', ',')}</p>
            </div>
            <div class="acoes-item">
                <button class="btn-excluir remover-item" title="Remover da categoria">
                    <i class="fa-solid fa-times"></i>
                </button>
            </div>
        `;

        // Event listeners para ações do item
        const btnEditar = element.querySelector('.editar-item');
        const btnRemover = element.querySelector('.remover-item');

        if (btnEditar) {
            btnEditar.addEventListener('click', () => this.editItem(item.id));
        }

        if (btnRemover) {
            btnRemover.addEventListener('click', () => this.deleteItem(item.id));
        }

        return element;
    }

    /**
     * Abre modal de formulário de categoria
     */
    openCategoriaFormModal(categoriaId = null, nome = '') {
        const modal = document.getElementById('modal-categoria-form');
        if (!modal) return;

        const titulo = modal.querySelector('#titulo-categoria-form');
        const inputNome = modal.querySelector('#nome-categoria-input');
        const btnSalvar = modal.querySelector('#salvar-categoria-form');

        if (categoriaId) {
            titulo.textContent = 'Editar categoria';
            inputNome.value = nome;
            btnSalvar.textContent = 'Salvar';
            btnSalvar.dataset.categoriaId = categoriaId;
        } else {
            titulo.textContent = 'Nova categoria';
            inputNome.value = '';
            btnSalvar.textContent = 'Criar';
            btnSalvar.dataset.categoriaId = '';
        }

        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    }

    /**
     * Fecha modal de formulário de categoria
     */
    closeCategoriaFormModal() {
        const modal = document.getElementById('modal-categoria-form');
        if (modal) {
            modal.style.display = 'none';
            document.body.style.overflow = 'auto';
        }
    }

    /**
     * Salva formulário de categoria
     */
    async saveCategoriaForm() {
        const inputNome = document.querySelector('#nome-categoria-input');
        const btnSalvar = document.querySelector('#salvar-categoria-form');
        const nome = inputNome.value.trim();
        const categoriaId = btnSalvar.dataset.categoriaId;

        if (!nome) {
            this.showErrorMessage('Nome da categoria é obrigatório');
            return;
        }

        try {
            if (categoriaId) {
                await this.dataManager.updateCategoria(categoriaId, nome);
                this.showSuccessMessage('Categoria atualizada com sucesso!');
            } else {
                await this.dataManager.addCategoria(nome);
                this.showSuccessMessage('Categoria criada com sucesso!');
            }

            await this.loadCategorias();
            this.closeCategoriaFormModal();
        } catch (error) {
            console.error('Erro ao salvar categoria:', error);
            this.showErrorMessage('Erro ao salvar categoria. Tente novamente.');
        }
    }

    /**
     * Salva ordem das categorias
     */
    async saveCategorias() {
        try {
            const categorias = Array.from(document.querySelectorAll('.categoria-item'));
            const categoriasOrdenadas = categorias.map((element, index) => ({
                id: parseInt(element.dataset.categoriaId),
                order: index + 1
            }));

            await this.dataManager.reorderCategorias(categoriasOrdenadas);
            this.showSuccessMessage('Ordem das categorias salva com sucesso!');
            this.closeCategoriasModal();
        } catch (error) {
            console.error('Erro ao salvar ordem das categorias:', error);
            this.showErrorMessage('Erro ao salvar ordem das categorias. Tente novamente.');
        }
    }

    /**
     * Abre modal de produtos
     */
    async openProdutosModal() {
        const modal = document.getElementById('modal-produtos');
        if (!modal) return;

        try {
            await this.loadProdutosDisponiveis();
            modal.style.display = 'flex';
            document.body.style.overflow = 'hidden';
        } catch (error) {
            console.error('Erro ao abrir modal de produtos:', error);
            this.showErrorMessage('Erro ao carregar produtos disponíveis');
        }
    }

    /**
     * Fecha modal de produtos
     */
    closeProdutosModal() {
        const modal = document.getElementById('modal-produtos');
        if (modal) {
            modal.style.display = 'none';
            document.body.style.overflow = 'auto';
        }
        this.produtosSelecionados.clear();
    }

    /**
     * Carrega produtos disponíveis (sem categoria ou de outras categorias)
     */
    async loadProdutosDisponiveis() {
        try {
            const response = await getProducts({ include_inactive: true, page_size: 1000 });
            // Filtrar produtos sem categoria OU que não sejam da categoria atual
            this.produtosDisponiveis = (response.items || []).filter(produto => 
                !produto.category_id || produto.category_id !== this.currentCategoriaId
            );
            this.renderProdutosDisponiveis();
        } catch (error) {
            console.error('Erro ao carregar produtos disponíveis:', error);
            throw error;
        }
    }

    /**
     * Renderiza produtos disponíveis
     */
    renderProdutosDisponiveis() {
        const container = document.querySelector('#lista-produtos');
        if (!container) return;

        container.innerHTML = '';

        if (!this.produtosDisponiveis || this.produtosDisponiveis.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fa-solid fa-box-open"></i>
                    <p>Nenhum produto disponível</p>
                </div>
            `;
            return;
        }

        this.produtosDisponiveis.forEach(produto => {
            const element = this.createProdutoElement(produto);
            container.appendChild(element);
        });
    }

    /**
     * Cria elemento de produto
     */
    createProdutoElement(produto) {
        const element = document.createElement('div');
        element.className = 'produto-item';
        element.dataset.produtoId = produto.id;

        element.innerHTML = `
            <input type="checkbox" class="checkbox-produto produto-checkbox" data-produto-id="${produto.id}" title="Selecionar produto">
            <div class="info-produto">
                <p class="nome-produto">${produto.name}</p>
                <p class="valor-produto">R$ ${parseFloat(produto.price).toFixed(2).replace('.', ',')}</p>
            </div>
        `;

        // Event listener para checkbox
        const checkbox = element.querySelector('.produto-checkbox');
        if (checkbox) {
            checkbox.addEventListener('change', (e) => {
                this.toggleProdutoSelecao(produto.id, e.target.checked);
                // Adiciona/remove classe de selecionado
                if (e.target.checked) {
                    element.classList.add('selecionado');
                } else {
                    element.classList.remove('selecionado');
                }
            });
        }

        // Event listener para clique no item (além do checkbox)
        element.addEventListener('click', (e) => {
            if (e.target !== checkbox) {
                checkbox.checked = !checkbox.checked;
                checkbox.dispatchEvent(new Event('change'));
            }
        });

        return element;
    }

    /**
     * Alterna seleção de produto
     */
    toggleProdutoSelecao(produtoId, selecionado) {
        if (selecionado) {
            this.produtosSelecionados.add(produtoId);
        } else {
            this.produtosSelecionados.delete(produtoId);
        }
        this.updateBotaoAdicionar();
    }

    /**
     * Atualiza botão de adicionar
     */
    updateBotaoAdicionar() {
        const btnAdicionar = document.querySelector('#adicionar-produtos');
        if (btnAdicionar) {
            const count = this.produtosSelecionados.size;
            btnAdicionar.textContent = count > 0 ? `Adicionar ${count} produto(s)` : 'Adicionar produtos';
            btnAdicionar.disabled = count === 0;
        }
    }

    /**
     * Adiciona produtos selecionados
     */
    async adicionarProdutosSelecionados() {
        if (this.produtosSelecionados.size === 0) {
            this.showErrorMessage('Selecione pelo menos um produto para adicionar.');
            return;
        }

        try {
            let adicionados = 0;
            for (const produtoId of this.produtosSelecionados) {
                await this.dataManager.addItemToCategoria(this.currentCategoriaId, produtoId);
                adicionados++;
            }

            this.showSuccessMessage(`${adicionados} produto(s) adicionado(s) com sucesso!`);
            this.closeProdutosModal();
            
            // Recarregar itens da categoria e produtos disponíveis
            await this.loadItens(this.currentCategoriaId);
            await this.loadProdutosDisponiveis();
        } catch (error) {
            console.error('Erro ao adicionar produtos à categoria:', error);
            this.showErrorMessage('Erro ao adicionar produtos à categoria. Tente novamente.');
        }
    }

    /**
     * Edita item
     */
    editItem(itemId) {
        if (!this.currentCategoriaId) return;
        // Redirecionar para a seção de produtos para editar
        this.redirectToProdutos(itemId);
    }

    /**
     * Redireciona para produtos
     */
    redirectToProdutos(itemId) {
        // Implementar redirecionamento para seção de produtos
        this.showSuccessMessage('Redirecionando para a seção de produtos...');
    }

    /**
     * Remove item da categoria
     */
    async deleteItem(itemId) {
        if (!this.currentCategoriaId) return;

        try {
            // Buscar o item na lista de itens da categoria
            const itens = await this.dataManager.getItensByCategoria(this.currentCategoriaId);
            const item = itens.find(p => p.id === itemId);
            
            if (item) {
                await this.dataManager.removeItemFromCategoria(this.currentCategoriaId, itemId);
                await this.loadItens(this.currentCategoriaId);
                await this.loadProdutosDisponiveis(); // Recarregar produtos disponíveis
                this.showSuccessMessage(`Item "${item.name}" removido da categoria com sucesso!`);
            }
        } catch (error) {
            console.error('Erro ao remover item da categoria:', error);
            this.showErrorMessage('Erro ao remover item da categoria. Tente novamente.');
        }
    }

    /**
     * Formata data
     */
    formatDate(dateString) {
        if (!dateString) return 'Data não disponível';
        const date = new Date(dateString);
        return date.toLocaleDateString('pt-BR');
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
     * Método público para abrir modal de categorias
     */
    async openCategoriasModalPublic() {
        await this.openCategoriasModal();
    }
}

// Exporta a classe principal
export { CategoriaManager };
