/**
 * Gerenciador de Ingredientes para o Painel Administrativo
 * Gerencia a interface e funcionalidades relacionadas aos ingredientes
 */

import { 
    getIngredients, 
    createIngredient, 
    updateIngredient, 
    deleteIngredient, 
    updateIngredientAvailability,
    addIngredientQuantity,
    getStockSummary 
} from '../api/ingredients.js';
import { getCategories } from '../api/categories.js';
import { showAlert, showSuccess, showError } from './alerts.js';

class IngredientsManager {
    constructor() {
        this.currentIngredients = [];
        this.currentPage = 1;
        this.pageSize = 10;
        this.currentFilters = {
            name: '',
            status: ''
        };
        this.editingIngredientId = null;
        
        this.init();
    }

    async init() {
        await this.loadIngredients();
        await this.loadStockSummary();
        this.setupEventListeners();
        this.setupModalEvents();
    }

    setupEventListeners() {
        // Filtros
        const searchInput = document.getElementById('busca-ingrediente');
        const statusFilter = document.getElementById('status-estoque');
        
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.currentFilters.name = e.target.value;
                this.debounceSearch();
            });
        }

        if (statusFilter) {
            statusFilter.addEventListener('change', (e) => {
                this.currentFilters.status = e.target.value;
                this.loadIngredients();
            });
        }

        // Botões de ação
        const addButton = document.querySelector('.adicionar-2');
        if (addButton) {
            addButton.addEventListener('click', () => this.openAddModal());
        }

        // Mapear status para valores da API
        this.statusMapping = {
            'em-estoque': 'in_stock',
            'estoque-baixo': 'low_stock',
            'sem-estoque': 'out_of_stock',
            'disponivel': 'available',
            'indisponivel': 'unavailable',
            'sobre-estoque': 'overstock'
        };
    }

    setupModalEvents() {
        const modal = document.getElementById('modal-ingrediente');
        const closeButtons = modal?.querySelectorAll('.fechar-modal, .btn-cancelar');
        const saveButton = document.getElementById('salvar-ingrediente');

        closeButtons?.forEach(btn => {
            btn.addEventListener('click', () => this.closeModal());
        });

        if (saveButton) {
            saveButton.addEventListener('click', () => this.saveIngredient());
        }

        // Fechar modal clicando no overlay
        const overlay = modal?.querySelector('.div-overlay');
        if (overlay) {
            overlay.addEventListener('click', () => this.closeModal());
        }
    }

    debounceSearch() {
        clearTimeout(this.searchTimeout);
        this.searchTimeout = setTimeout(() => {
            this.loadIngredients();
        }, 500);
    }

    async loadIngredients() {
        try {
            const filters = {
                page: this.currentPage,
                page_size: this.pageSize
            };

            if (this.currentFilters.name) {
                filters.name = this.currentFilters.name;
            }

            if (this.currentFilters.status) {
                filters.status = this.statusMapping[this.currentFilters.status] || this.currentFilters.status;
            }

            const response = await getIngredients(filters);
            this.currentIngredients = response.items || [];
            this.renderIngredients();
        } catch (error) {
            console.error('Erro ao carregar ingredientes:', error);
            showError('Erro ao carregar ingredientes: ' + error.message);
        }
    }

    async loadStockSummary() {
        try {
            const summary = await getStockSummary();
            this.updateStockMetrics(summary);
        } catch (error) {
            console.error('Erro ao carregar resumo do estoque:', error);
        }
    }

    updateStockMetrics(summary) {
        // Atualizar métricas nos cards
        const totalValueElement = document.querySelector('.relata .quadro:nth-child(1) .valor .grande');
        const outOfStockElement = document.querySelector('.relata .quadro:nth-child(2) .valor .grande');
        const lowStockElement = document.querySelector('.relata .quadro:nth-child(3) .valor .grande');
        const inStockElement = document.querySelector('.relata .quadro:nth-child(4) .valor .grande');

        if (totalValueElement) {
            totalValueElement.textContent = `R$ ${summary.total_stock_value?.toFixed(2) || '0,00'}`;
        }
        if (outOfStockElement) {
            outOfStockElement.textContent = summary.out_of_stock_count || 0;
        }
        if (lowStockElement) {
            lowStockElement.textContent = summary.low_stock_count || 0;
        }
        if (inStockElement) {
            inStockElement.textContent = summary.in_stock_count || 0;
        }
    }

    renderIngredients() {
        const container = document.querySelector('.ingredientes');
        if (!container) return;

        if (this.currentIngredients.length === 0) {
            container.innerHTML = `
                <div class="no-ingredients">
                    <i class="fa-solid fa-box-open"></i>
                    <p>Nenhum ingrediente encontrado</p>
                </div>
            `;
            return;
        }

        container.innerHTML = this.currentIngredients.map(ingredient => 
            this.createIngredientCard(ingredient)
        ).join('');
    }

    createIngredientCard(ingredient) {
        const statusClass = this.getStatusClass(ingredient);
        const statusText = this.getStatusText(ingredient);
        const statusIcon = this.getStatusIcon(ingredient);

        return `
            <div class="card-ingrediente" data-id="${ingredient.id}">
                <div class="info-ingrediente">
                    <div class="cabecalho-ingrediente">
                        <h3>${ingredient.name}</h3>
                        <div class="controles-ingrediente">
                            <label class="toggle">
                                <input type="checkbox" ${ingredient.is_available ? 'checked' : ''} 
                                       onchange="ingredientsManager.toggleAvailability(${ingredient.id}, this.checked)">
                                <span class="slider"></span>
                            </label>
                            <i class="fa-solid fa-pen-to-square editar" onclick="ingredientsManager.openEditModal(${ingredient.id})"></i>
                        </div>
                    </div>

                    <div class="detalhes-ingrediente">
                        <div class="detalhe">
                            <span class="label">Categoria:</span>
                            <span class="valor">${ingredient.category || 'Não informada'}</span>
                        </div>
                        <div class="detalhe">
                            <span class="label">Fornecedor:</span>
                            <span class="valor">${ingredient.supplier || 'Não informado'}</span>
                        </div>
                        <div class="detalhe">
                            <span class="label">Custo:</span>
                            <span class="valor">R$ ${parseFloat(ingredient.price || 0).toFixed(2)}</span>
                        </div>
                        <div class="detalhe">
                            <span class="label">Unidade:</span>
                            <span class="valor">${ingredient.stock_unit || 'un'}</span>
                        </div>
                    </div>

                    <div class="estoque-info">
                        <div class="estoque-atual">
                            <span class="label">Estoque Atual:</span>
                            <span class="valor">${parseFloat(ingredient.current_stock || 0).toFixed(1)} ${ingredient.stock_unit || 'un'}</span>
                        </div>
                        <div class="estoque-limites">
                            <span class="minimo">Mín: ${parseFloat(ingredient.min_stock_threshold || 0).toFixed(1)}</span>
                            <span class="maximo">Máx: ${parseFloat(ingredient.max_stock || 0).toFixed(1)}</span>
                        </div>
                    </div>

                    <div class="status-ingrediente">
                        <div class="status ${statusClass}">
                            <i class="${statusIcon}"></i>
                            ${statusText}
                        </div>
                    </div>

                    <div class="acoes-ingrediente">
                        <button class="btn-adicionar-estoque" onclick="ingredientsManager.openAddQuantityModal(${ingredient.id})">
                            <i class="fa-solid fa-plus"></i>
                            Adicionar Estoque
                        </button>
                        <button class="btn-excluir" onclick="ingredientsManager.deleteIngredient(${ingredient.id})">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    getStatusClass(ingredient) {
        const stock = parseFloat(ingredient.current_stock || 0);
        const minThreshold = parseFloat(ingredient.min_stock_threshold || 0);
        const maxStock = parseFloat(ingredient.max_stock || 0);

        if (!ingredient.is_available) return 'indisponivel';
        if (stock === 0) return 'sem-estoque';
        if (stock <= minThreshold) return 'estoque-baixo';
        if (maxStock > 0 && stock > maxStock) return 'sobre-estoque';
        return 'em-estoque';
    }

    getStatusText(ingredient) {
        const statusClass = this.getStatusClass(ingredient);
        const statusTexts = {
            'indisponivel': 'Indisponível',
            'sem-estoque': 'Sem Estoque',
            'estoque-baixo': 'Estoque Baixo',
            'sobre-estoque': 'Sobre Estoque',
            'em-estoque': 'Em Estoque'
        };
        return statusTexts[statusClass] || 'Desconhecido';
    }

    getStatusIcon(ingredient) {
        const statusClass = this.getStatusClass(ingredient);
        const statusIcons = {
            'indisponivel': 'fa-solid fa-eye-slash',
            'sem-estoque': 'fa-solid fa-ban',
            'estoque-baixo': 'fa-solid fa-triangle-exclamation',
            'sobre-estoque': 'fa-solid fa-arrow-up',
            'em-estoque': 'fa-solid fa-check'
        };
        return statusIcons[statusClass] || 'fa-solid fa-question';
    }

    openAddModal() {
        this.editingIngredientId = null;
        this.resetModal();
        document.getElementById('titulo-modal-ingrediente').textContent = 'Adicionar novo ingrediente';
        document.getElementById('salvar-ingrediente').innerHTML = '<i class="fa-solid fa-plus"></i> Adicionar';
        document.getElementById('modal-ingrediente').style.display = 'block';
    }

    openEditModal(ingredientId) {
        const ingredient = this.currentIngredients.find(ing => ing.id === ingredientId);
        if (!ingredient) return;

        this.editingIngredientId = ingredientId;
        this.populateModal(ingredient);
        document.getElementById('titulo-modal-ingrediente').textContent = 'Editar ingrediente';
        document.getElementById('salvar-ingrediente').innerHTML = '<i class="fa-solid fa-save"></i> Salvar';
        document.getElementById('modal-ingrediente').style.display = 'block';
    }

    populateModal(ingredient) {
        document.getElementById('nome-ingrediente').value = ingredient.name || '';
        document.getElementById('categoria-ingrediente').value = ingredient.category || '';
        document.getElementById('fornecedor-ingrediente').value = ingredient.supplier || '';
        document.getElementById('custo-ingrediente').value = parseFloat(ingredient.price || 0).toFixed(2);
        document.getElementById('unidade-ingrediente').value = ingredient.stock_unit || '';
        document.getElementById('estoque-minimo-ingrediente').value = parseFloat(ingredient.min_stock_threshold || 0).toString();
        document.getElementById('estoque-maximo-ingrediente').value = parseFloat(ingredient.max_stock || 0).toString();
    }

    resetModal() {
        document.getElementById('nome-ingrediente').value = '';
        document.getElementById('categoria-ingrediente').value = '';
        document.getElementById('fornecedor-ingrediente').value = '';
        document.getElementById('custo-ingrediente').value = '';
        document.getElementById('unidade-ingrediente').value = '';
        document.getElementById('estoque-minimo-ingrediente').value = '';
        document.getElementById('estoque-maximo-ingrediente').value = '';
    }

    async saveIngredient() {
        try {
            const formData = this.getFormData();
            
            if (this.editingIngredientId) {
                await updateIngredient(this.editingIngredientId, formData);
                showSuccess('Ingrediente atualizado com sucesso!');
            } else {
                await createIngredient(formData);
                showSuccess('Ingrediente criado com sucesso!');
            }

            this.closeModal();
            await this.loadIngredients();
            await this.loadStockSummary();
        } catch (error) {
            console.error('Erro ao salvar ingrediente:', error);
            showError('Erro ao salvar ingrediente: ' + error.message);
        }
    }

    getFormData() {
        return {
            name: document.getElementById('nome-ingrediente').value.trim(),
            category: document.getElementById('categoria-ingrediente').value.trim(),
            supplier: document.getElementById('fornecedor-ingrediente').value.trim(),
            price: parseFloat(document.getElementById('custo-ingrediente').value) || 0,
            stock_unit: document.getElementById('unidade-ingrediente').value,
            min_stock_threshold: parseFloat(document.getElementById('estoque-minimo-ingrediente').value) || 0,
            max_stock: parseFloat(document.getElementById('estoque-maximo-ingrediente').value) || 0,
            current_stock: 0 // Novo ingrediente começa com estoque zero
        };
    }

    async toggleAvailability(ingredientId, isAvailable) {
        try {
            await updateIngredientAvailability(ingredientId, isAvailable);
            showSuccess(`Ingrediente ${isAvailable ? 'ativado' : 'desativado'} com sucesso!`);
            await this.loadIngredients();
        } catch (error) {
            console.error('Erro ao alterar disponibilidade:', error);
            showError('Erro ao alterar disponibilidade: ' + error.message);
        }
    }

    openAddQuantityModal(ingredientId) {
        const ingredient = this.currentIngredients.find(ing => ing.id === ingredientId);
        if (!ingredient) return;

        const quantity = prompt(
            `Adicionar quantidade ao estoque de "${ingredient.name}"\n\n` +
            `Estoque atual: ${parseFloat(ingredient.current_stock || 0).toFixed(1)} ${ingredient.stock_unit || 'un'}\n\n` +
            `Digite a quantidade a ser adicionada:`
        );

        if (quantity !== null && quantity.trim() !== '') {
            const quantityValue = parseFloat(quantity);
            if (!isNaN(quantityValue) && quantityValue > 0) {
                this.addQuantity(ingredientId, quantityValue);
            } else {
                showError('Por favor, digite uma quantidade válida maior que zero.');
            }
        }
    }

    async addQuantity(ingredientId, quantity) {
        try {
            await addIngredientQuantity(ingredientId, quantity);
            showSuccess(`Quantidade adicionada com sucesso!`);
            await this.loadIngredients();
            await this.loadStockSummary();
        } catch (error) {
            console.error('Erro ao adicionar quantidade:', error);
            showError('Erro ao adicionar quantidade: ' + error.message);
        }
    }

    async deleteIngredient(ingredientId) {
        const ingredient = this.currentIngredients.find(ing => ing.id === ingredientId);
        if (!ingredient) return;

        const confirmed = confirm(
            `Tem certeza que deseja excluir o ingrediente "${ingredient.name}"?\n\n` +
            `Esta ação não pode ser desfeita.`
        );

        if (confirmed) {
            try {
                await deleteIngredient(ingredientId);
                showSuccess('Ingrediente excluído com sucesso!');
                await this.loadIngredients();
                await this.loadStockSummary();
            } catch (error) {
                console.error('Erro ao excluir ingrediente:', error);
                showError('Erro ao excluir ingrediente: ' + error.message);
            }
        }
    }

    closeModal() {
        document.getElementById('modal-ingrediente').style.display = 'none';
        this.resetModal();
        this.editingIngredientId = null;
    }
}

// Inicializar o gerenciador quando o DOM estiver carregado
let ingredientsManager;

// Função para inicializar o gerenciador
function initializeIngredientsManager() {
    if (!ingredientsManager) {
        ingredientsManager = new IngredientsManager();
        window.ingredientsManager = ingredientsManager;
        console.log('IngredientsManager inicializado');
    }
}

// Inicializar quando o DOM estiver carregado
document.addEventListener('DOMContentLoaded', () => {
    // Verificar se estamos na seção de estoque
    const estoqueSection = document.getElementById('secao-estoque');
    if (estoqueSection) {
        // Observar mudanças na visibilidade da seção
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
                    const isVisible = estoqueSection.style.display !== 'none';
                    if (isVisible && !ingredientsManager) {
                        initializeIngredientsManager();
                    }
                }
            });
        });
        
        observer.observe(estoqueSection, { attributes: true, attributeFilter: ['style'] });
        
        // Inicializar se a seção já estiver visível
        if (estoqueSection.style.display !== 'none') {
            initializeIngredientsManager();
        }
    }
});

// Exportar para uso global
window.ingredientsManager = ingredientsManager;
window.initializeIngredientsManager = initializeIngredientsManager;
