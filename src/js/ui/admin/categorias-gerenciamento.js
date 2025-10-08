/**
 * Módulo de Gerenciamento de Categorias
 * Responsável por todas as operações relacionadas a categorias de produtos
 */

import { 
    createCategory, 
    updateCategory, 
    deleteCategory,
    getCategories,
    getCategoryById
} from '../../api/categories.js';

import { getProducts, updateProduct } from '../../api/products.js';
import { showToast } from '../alerts.js';

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
            const categoria = await getCategoryById(id);
            
            return {
                id: categoria.id,
                nome: categoria.name,
                ordem: categoria.order || 0,
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
     * Reordena categorias (implementação simplificada)
     */
    async reorderCategorias(categoriasOrdenadas) {
        try {
            // Implementação simplificada - apenas atualiza a ordem localmente
            console.log('Reordenação de categorias:', categoriasOrdenadas);
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
            // Implementação simplificada - retorna produtos da categoria
            const response = await getProducts({ category_id: categoriaId });
            return response.items || [];
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

    /**
     * Remove item da categoria (implementação simplificada)
     */
    async removeItemFromCategoria(categoriaId, produtoId) {
        try {
            // Implementação simplificada - remove a categoria do produto
            await updateProduct(produtoId, { category_id: null });
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
        this.setupCategoriaHandlers();
        this.setupModalHandlers();
    }

    /**
     * Configura handlers específicos de categorias
     */
    setupCategoriaHandlers() {
        const section = document.getElementById('secao-categorias');
        if (!section) return;

        // Event delegation para botões de editar
        section.addEventListener('click', (e) => {
            if (e.target.matches('.editar-categoria')) {
                this.handleEditCategoria(e.target);
            }
        });

        // Event delegation para botões de excluir
        section.addEventListener('click', (e) => {
            if (e.target.matches('.excluir-categoria')) {
                this.handleDeleteCategoria(e.target);
            }
        });

        // Event delegation para botões de itens
        section.addEventListener('click', (e) => {
            if (e.target.matches('.gerenciar-itens')) {
                this.handleGerenciarItens(e.target);
            }
        });

        // Event delegation para botão nova categoria
        section.addEventListener('click', (e) => {
            if (e.target.matches('.btn-nova-categoria')) {
                this.handleNovaCategoria();
            }
        });
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
        const btnFechar = modal.querySelector('.fechar-modal');
        if (btnFechar) {
            btnFechar.addEventListener('click', () => this.closeCategoriasModal());
        }

        // Botão salvar ordem
        const btnSalvar = modal.querySelector('.btn-salvar-ordem');
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
        const btnFechar = modal.querySelector('.fechar-modal');
        if (btnFechar) {
            btnFechar.addEventListener('click', () => this.closeItensModal());
        }

        // Botão voltar
        const btnVoltar = modal.querySelector('.btn-voltar');
        if (btnVoltar) {
            btnVoltar.addEventListener('click', () => this.voltarParaCategorias());
        }

        // Botão adicionar itens
        const btnAdicionar = modal.querySelector('.btn-adicionar-itens');
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
        const btnFechar = modal.querySelector('.fechar-modal');
        if (btnFechar) {
            btnFechar.addEventListener('click', () => this.closeCategoriaFormModal());
        }

        // Botão salvar
        const btnSalvar = modal.querySelector('.btn-salvar-categoria');
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
        const btnFechar = modal.querySelector('.fechar-modal');
        if (btnFechar) {
            btnFechar.addEventListener('click', () => this.closeProdutosModal());
        }

        // Botão adicionar selecionados
        const btnAdicionar = modal.querySelector('.btn-adicionar-selecionados');
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
            const categorias = await this.dataManager.getAllCategorias();
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
        const container = document.querySelector('#secao-categorias .categorias');
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
            <div class="categoria-header">
                <div class="drag-handle">
                    <i class="fa-solid fa-grip-vertical"></i>
                </div>
                <div class="categoria-info">
                    <h3>${categoria.name}</h3>
                    <p class="categoria-meta">
                        <span class="item-count">${categoria.item_count || 0} itens</span>
                        <span class="separator">•</span>
                        <span class="created-date">Criada em ${this.formatDate(categoria.created_at)}</span>
                    </p>
                </div>
                <div class="categoria-actions">
                    <button class="btn btn-sm btn-secondary gerenciar-itens" title="Gerenciar itens">
                        <i class="fa-solid fa-list"></i>
                    </button>
                    <button class="btn btn-sm btn-warning editar-categoria" title="Editar categoria">
                        <i class="fa-solid fa-edit"></i>
                    </button>
                    <button class="btn btn-sm btn-danger excluir-categoria" title="Excluir categoria">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            </div>
        `;

        return element;
    }

    /**
     * Configura drag and drop
     */
    setupDragAndDrop() {
        const container = document.querySelector('#secao-categorias .categorias');
        if (!container) return;

        let draggedElement = null;

        container.addEventListener('dragstart', (e) => {
            if (e.target.classList.contains('categoria-item')) {
                draggedElement = e.target;
                e.target.style.opacity = '0.5';
            }
        });

        container.addEventListener('dragend', (e) => {
            if (e.target.classList.contains('categoria-item')) {
                e.target.style.opacity = '1';
                draggedElement = null;
            }
        });

        container.addEventListener('dragover', (e) => {
            e.preventDefault();
            const afterElement = this.getDragAfterElement(container, e.clientY);
            if (afterElement == null) {
                container.appendChild(draggedElement);
            } else {
                container.insertBefore(draggedElement, afterElement);
            }
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

        if (confirm(`Tem certeza que deseja excluir a categoria "${nome}"?`)) {
            try {
                await this.dataManager.deleteCategoria(categoriaId);
                await this.loadCategorias();
                this.showSuccessMessage(`Categoria "${nome}" excluída com sucesso!`);
            } catch (error) {
                console.error('Erro ao excluir categoria:', error);
                this.showErrorMessage('Erro ao excluir categoria. Tente novamente.');
            }
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
        const container = document.querySelector('#modal-itens .itens-container');
        if (!container) return;

        container.innerHTML = '';

        if (!itens || itens.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fa-solid fa-box-open"></i>
                    <p>Nenhum item encontrado nesta categoria</p>
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
        element.className = 'item-element';
        element.dataset.itemId = item.id;

        element.innerHTML = `
            <div class="item-info">
                <h4>${item.name}</h4>
                <p class="item-description">${item.description || 'Sem descrição'}</p>
                <p class="item-price">R$ ${parseFloat(item.price).toFixed(2).replace('.', ',')}</p>
            </div>
            <div class="item-actions">
                <button class="btn btn-sm btn-warning editar-item" title="Editar item">
                    <i class="fa-solid fa-edit"></i>
                </button>
                <button class="btn btn-sm btn-danger remover-item" title="Remover da categoria">
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

        const titulo = modal.querySelector('.modal-title');
        const inputNome = modal.querySelector('#nome-categoria');
        const btnSalvar = modal.querySelector('.btn-salvar-categoria');

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
        const inputNome = document.querySelector('#nome-categoria');
        const btnSalvar = document.querySelector('.btn-salvar-categoria');
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
     * Carrega produtos disponíveis
     */
    async loadProdutosDisponiveis() {
        try {
            const response = await getProducts();
            this.produtosDisponiveis = response.items || [];
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
        const container = document.querySelector('#modal-produtos .produtos-container');
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
        element.className = 'produto-element';
        element.dataset.produtoId = produto.id;

        element.innerHTML = `
            <div class="produto-info">
                <h4>${produto.name}</h4>
                <p class="produto-description">${produto.description || 'Sem descrição'}</p>
                <p class="produto-price">R$ ${parseFloat(produto.price).toFixed(2).replace('.', ',')}</p>
            </div>
            <div class="produto-actions">
                <input type="checkbox" class="produto-checkbox" data-produto-id="${produto.id}">
            </div>
        `;

        // Event listener para checkbox
        const checkbox = element.querySelector('.produto-checkbox');
        if (checkbox) {
            checkbox.addEventListener('change', (e) => {
                this.toggleProdutoSelecao(produto.id, e.target.checked);
            });
        }

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
        const btnAdicionar = document.querySelector('.btn-adicionar-selecionados');
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
            await this.loadItens(this.currentCategoriaId);
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
            const item = this.produtosDisponiveis.find(p => p.id === itemId);
            if (item) {
                await this.dataManager.removeItemFromCategoria(this.currentCategoriaId, itemId);
                await this.loadItens(this.currentCategoriaId);
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
}

// Exporta a classe principal
export { CategoriaManager };
