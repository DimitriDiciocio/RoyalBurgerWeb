/**
 * Gerenciador de Insumos Extras para Produtos
 * Gerencia adição de insumos extras individuais e por grupos
 */

import { showToast, showActionModal } from '../alerts.js';
import { getIngredients } from '../../api/ingredients.js';
import { getGroups, getGroupById } from '../../api/groups.js';
import { escapeHTML } from '../../utils/html-sanitizer.js';
import { abrirModal, fecharModal } from '../modais.js';
import { gerenciarInputsEspecificos } from '../../utils.js';

// Constantes de configuração
const CONFIG = {
    MAX_INGREDIENTS_PER_PAGE: 1000,
    DEFAULT_MIN_QUANTITY: 0,
    DEFAULT_MAX_QUANTITY: 1,
    GROUPS_DESCRIPTION_LIMIT: 3
};

// Utilitário para parsing seguro de inteiros
const safeParseInt = (value, defaultValue = 0) => {
    const parsed = parseInt(value, 10);
    return isNaN(parsed) || parsed < 0 ? defaultValue : parsed;
};

export class ProdutoExtrasManager {
    constructor() {
        this.insumosExtras = [];
        this.insumosDisponiveis = [];
        this.gruposDisponiveis = [];
        this.insumosSelecionados = new Set();
        this.gruposSelecionados = new Set();
        this.insumoEditandoConfig = null;
        this.ingredientesReceita = [];
        this.isLoading = false; // Prevenir race conditions
        
        // Referências de listeners para cleanup
        this.eventListeners = new Map();
    }

    /**
     * Inicializa o gerenciador
     */
    async init() {
        try {
            await this.carregarDados();
            this.setupEventListeners();
        } catch (error) {
            console.error('Erro ao inicializar gerenciador de extras:', error);
            showToast('Erro ao carregar dados', { type: 'error' });
        }
    }

    /**
     * Configura event listeners com cleanup apropriado
     */
    setupEventListeners() {
        // Botão adicionar insumos extras individuais
        this.addListener('btn-adicionar-insumo-extra', 'click', () => {
            this.abrirModalInsumosExtras();
        });

        // Botão adicionar grupos de insumos
        this.addListener('btn-adicionar-grupo', 'click', () => {
            this.abrirModalGruposExtras();
        });

        // ALTERAÇÃO: Removidos listeners manuais de cancelar - modais.js já gerencia via data-close-modal
        // Modal Insumos Extras
        this.addListener('adicionar-insumos-extras-produto', 'click', () => {
            this.confirmarSelecaoInsumos();
        });
        this.addListener('busca-insumo-extra-produto', 'input', (e) => {
            this.filtrarInsumosExtras(e.target.value);
        });

        // ALTERAÇÃO: Removidos listeners manuais de cancelar - modais.js já gerencia via data-close-modal
        // Modal Grupos Extras
        this.addListener('adicionar-grupos-extras-produto', 'click', () => {
            this.confirmarSelecaoGrupos();
        });

        // ALTERAÇÃO: Removido listener manual de cancelar - modais.js já gerencia via data-close-modal
        // Modal Configurar Extra
        this.addListener('salvar-config-extra', 'click', () => {
            this.salvarConfigExtra();
        });

        // Fechar modais ao clicar no overlay (com cleanup)
        this.setupOverlayListeners();
    }

    /**
     * Helper para adicionar listeners com rastreamento para cleanup
     */
    addListener(elementId, event, handler) {
        const element = document.getElementById(elementId);
        if (element) {
            element.addEventListener(event, handler);
            // Armazena para cleanup futuro
            if (!this.eventListeners.has(elementId)) {
                this.eventListeners.set(elementId, []);
            }
            this.eventListeners.get(elementId).push({ event, handler });
        }
    }

    /**
     * Remove todos os event listeners (cleanup)
     */
    cleanup() {
        this.eventListeners.forEach((listeners, elementId) => {
            const element = document.getElementById(elementId);
            if (element) {
                listeners.forEach(({ event, handler }) => {
                    element.removeEventListener(event, handler);
                });
            }
        });
        this.eventListeners.clear();
    }

    /**
     * Configura listeners para fechar ao clicar no overlay
     * ALTERAÇÃO: Removido completamente - todas as modais agora usam o sistema centralizado de modais.js
     * O sistema modais.js já gerencia fechamento via overlay automaticamente
     */
    setupOverlayListeners() {
        // ALTERAÇÃO: Método vazio - todas as modais agora usam modais.js
        // O sistema modais.js gerencia fechamento via overlay automaticamente
        // Mantido método vazio para compatibilidade, mas não faz nada
    }

    /**
     * Carrega dados iniciais com tratamento de erro apropriado
     * ALTERAÇÃO: Processar corretamente a resposta da API no formato { success, data: { items: [...] } }
     */
    async carregarDados() {
        if (this.isLoading) {
            console.warn('Carregamento já em andamento');
            return;
        }

        this.isLoading = true;
        try {
            // Carregar insumos disponíveis
            const responseInsumos = await getIngredients({ 
                page_size: CONFIG.MAX_INGREDIENTS_PER_PAGE 
            });
            
            // ALTERAÇÃO: Acessar response.data.items quando response.success === true
            if (responseInsumos && responseInsumos.success && responseInsumos.data && responseInsumos.data.items) {
                this.insumosDisponiveis = responseInsumos.data.items;
            } else if (responseInsumos && responseInsumos.items) {
                // Fallback para formato antigo
                this.insumosDisponiveis = responseInsumos.items;
            } else {
                this.insumosDisponiveis = [];
            }

            // Carregar grupos disponíveis
            this.gruposDisponiveis = await getGroups({ active_only: true });
        } catch (error) {
            console.error('Erro ao carregar dados:', error);
            throw error;
        } finally {
            this.isLoading = false;
        }
    }

    /**
     * Abre modal de seleção de insumos extras
     * ALTERAÇÃO: Usar sistema centralizado de modais.js e utils.js
     */
    async abrirModalInsumosExtras() {
        // Garantir que os dados foram carregados
        if (!this.insumosDisponiveis || this.insumosDisponiveis.length === 0) {
            try {
                await this.carregarDados();
            } catch (error) {
                console.error('Erro ao carregar dados:', error);
                showToast('Erro ao carregar insumos', { type: 'error' });
                return;
            }
        }
        
        this.insumosSelecionados.clear();
        this.renderizarInsumosExtrasModal();
        
        // ALTERAÇÃO: Usar sistema centralizado de modais
        abrirModal('modal-insumos-extras-produto');
        
        // ALTERAÇÃO: Gerenciar inputs da modal usando utils.js
        const modal = document.getElementById('modal-insumos-extras-produto');
        if (modal) {
            const inputs = modal.querySelectorAll('input, select, textarea');
            gerenciarInputsEspecificos(inputs);
        }
    }

    /**
     * Fecha modal de insumos extras com cleanup
     * ALTERAÇÃO: Simplificado para usar apenas o sistema centralizado de modais.js
     * O sistema modais.js já gerencia o fechamento e reset dos campos (via data-reset-on-close)
     */
    fecharModalInsumosExtras() {
        // Limpar seleções antes de fechar
        this.insumosSelecionados.clear();
        
        // ALTERAÇÃO: Usar sistema centralizado de modais
        fecharModal('modal-insumos-extras-produto');
    }

    /**
     * Renderiza lista de insumos extras no modal
     */
    renderizarInsumosExtrasModal(filtro = '') {
        const lista = document.getElementById('lista-insumos-extras-produto');
        if (!lista) return;

        // Filtrar insumos que já não estão adicionados como extras
        const idsJaAdicionados = this.insumosExtras.map(i => i.ingredient_id);
        
        const insumosParaMostrar = this.insumosDisponiveis.filter(insumo => {
            const naoAdicionado = !idsJaAdicionados.includes(insumo.id);
            const matchFiltro = !filtro || 
                insumo.name.toLowerCase().includes(filtro.toLowerCase());
            return naoAdicionado && matchFiltro;
        });

        if (insumosParaMostrar.length === 0) {
            lista.innerHTML = '<p style="text-align: center; color: #888; padding: 20px;">Nenhum insumo disponível</p>';
            return;
        }

        // Render com HTML sanitizado
        lista.innerHTML = insumosParaMostrar.map(insumo => {
            const statusClass = insumo.is_available ? 'ativo' : 'inativo';
            const statusTexto = insumo.is_available ? 'Ativo' : 'Inativo';
            const checked = this.insumosSelecionados.has(insumo.id) ? 'checked' : '';
            const precoTexto = insumo.additional_price > 0 
                ? `<span class="preco-adicional">+R$ ${insumo.additional_price.toFixed(2)}</span>`
                : '';
            
            // Sanitizar nome para prevenir XSS
            const nomeSeguro = escapeHTML(insumo.name);

            return `
                <div class="insumo-selecao-item ${checked ? 'selecionado' : ''}" 
                     data-insumo-id="${insumo.id}">
                    <input 
                        type="checkbox" 
                        class="checkbox-insumo" 
                        data-insumo-id="${insumo.id}"
                        ${checked}
                    >
                    <div class="info-insumo-selecao">
                        <p class="nome-insumo">${nomeSeguro} ${precoTexto}</p>
                        <p class="status-insumo ${statusClass}">${statusTexto}</p>
                    </div>
                </div>
            `;
        }).join('');

        // Event delegation ao invés de listeners individuais (melhor performance)
        this.attachInsumoSelectionHandlers(lista);
    }

    /**
     * Anexa handlers de seleção com event delegation (melhor performance)
     */
    attachInsumoSelectionHandlers(lista) {
        lista.addEventListener('click', (e) => {
            const item = e.target.closest('.insumo-selecao-item');
            if (!item) return;

            const checkbox = item.querySelector('.checkbox-insumo');
            const insumoId = safeParseInt(item.dataset.insumoId);
            
            if (e.target !== checkbox) {
                checkbox.checked = !checkbox.checked;
            }
            this.toggleSelecaoInsumo(insumoId, checkbox.checked, item);
        });
    }

    /**
     * Toggle seleção de insumo
     */
    toggleSelecaoInsumo(insumoId, selecionado, itemElement) {
        if (isNaN(insumoId)) {
            console.error('ID de insumo inválido:', insumoId);
            return;
        }

        if (selecionado) {
            this.insumosSelecionados.add(insumoId);
            itemElement.classList.add('selecionado');
        } else {
            this.insumosSelecionados.delete(insumoId);
            itemElement.classList.remove('selecionado');
        }
    }

    /**
     * Filtrar insumos no modal
     */
    filtrarInsumosExtras(termo) {
        this.renderizarInsumosExtrasModal(termo);
    }

    /**
     * Confirma seleção de insumos com validação
     */
    async confirmarSelecaoInsumos() {
        if (this.insumosSelecionados.size === 0) {
            showToast('Selecione pelo menos um insumo', { type: 'error' });
            return;
        }

        try {
            // Adicionar insumos selecionados à lista de extras
            this.insumosSelecionados.forEach(insumoId => {
                const insumo = this.insumosDisponiveis.find(i => i.id === insumoId);
                if (insumo) {
                    this.insumosExtras.push({
                        ingredient_id: insumo.id,
                        name: insumo.name,
                        portions: 0,
                        min_quantity: CONFIG.DEFAULT_MIN_QUANTITY,
                        max_quantity: CONFIG.DEFAULT_MAX_QUANTITY,
                        additional_price: insumo.additional_price || 0,
                        is_available: insumo.is_available
                    });
                }
            });

            showToast(
                `${this.insumosSelecionados.size} insumo(s) adicionado(s) como extra!`, 
                { type: 'success' }
            );
            this.fecharModalInsumosExtras();
            this.renderizarListaExtras();
        } catch (error) {
            console.error('Erro ao adicionar insumos:', error);
            showToast('Erro ao adicionar insumos', { type: 'error' });
        }
    }

    /**
     * Abre modal de seleção de grupos
     * ALTERAÇÃO: Usar sistema centralizado de modais.js e utils.js
     */
    async abrirModalGruposExtras() {
        // Garantir que os dados foram carregados
        if (!this.gruposDisponiveis || this.gruposDisponiveis.length === 0) {
            try {
                await this.carregarDados();
            } catch (error) {
                console.error('Erro ao carregar dados:', error);
                showToast('Erro ao carregar grupos', { type: 'error' });
                return;
            }
        }
        
        this.gruposSelecionados.clear();
        
        // ALTERAÇÃO: Usar sistema centralizado de modais
        abrirModal('modal-grupos-extras-produto');
        
        await this.renderizarGruposModal();
        
        // ALTERAÇÃO: Gerenciar inputs da modal usando utils.js
        const modal = document.getElementById('modal-grupos-extras-produto');
        if (modal) {
            const inputs = modal.querySelectorAll('input, select, textarea');
            gerenciarInputsEspecificos(inputs);
        }
    }

    /**
     * Fecha modal de grupos
     * ALTERAÇÃO: Simplificado para usar apenas o sistema centralizado de modais.js
     * O sistema modais.js já gerencia o fechamento e reset dos campos (via data-reset-on-close)
     */
    fecharModalGruposExtras() {
        // Limpar seleções antes de fechar
        this.gruposSelecionados.clear();
        
        // ALTERAÇÃO: Usar sistema centralizado de modais
        fecharModal('modal-grupos-extras-produto');
    }

    /**
     * Renderiza lista de grupos no modal
     * TODO: Otimizar para evitar N+1 queries - backend deveria retornar grupos com ingredientes
     */
    async renderizarGruposModal() {
        const lista = document.getElementById('lista-grupos-extras-produto');
        if (!lista) return;

        if (this.gruposDisponiveis.length === 0) {
            lista.innerHTML = '<p style="text-align: center; color: #888; padding: 20px;">Nenhum grupo disponível</p>';
            return;
        }

        // N+1 Query - idealmente o backend retornaria tudo junto
        const gruposComDetalhes = await Promise.all(
            this.gruposDisponiveis.map(async (grupo) => {
                try {
                    const detalhes = await getGroupById(grupo.id);
                    return { ...grupo, ingredients: detalhes.ingredients || [] };
                } catch (error) {
                    console.error(`Erro ao carregar grupo ${grupo.id}:`, error);
                    return { ...grupo, ingredients: [] };
                }
            })
        );

        lista.innerHTML = gruposComDetalhes.map(grupo => {
            const checked = this.gruposSelecionados.has(grupo.id) ? 'checked' : '';
            
            // Criar descrição com primeiros ingredientes
            let descricao = 'Nenhum ingrediente neste grupo';
            if (grupo.ingredients && grupo.ingredients.length > 0) {
                const nomes = grupo.ingredients
                    .slice(0, CONFIG.GROUPS_DESCRIPTION_LIMIT)
                    .map(ing => escapeHTML(ing.name)); // Sanitizar nomes
                descricao = nomes.join(', ');
                if (grupo.ingredients.length > CONFIG.GROUPS_DESCRIPTION_LIMIT) {
                    descricao += ` e mais ${grupo.ingredients.length - CONFIG.GROUPS_DESCRIPTION_LIMIT}...`;
                }
            }
            
            // Sanitizar nome do grupo
            const nomeGrupoSeguro = escapeHTML(grupo.name);

            return `
                <div class="grupo-selecao-item ${checked ? 'selecionado' : ''}" 
                     data-grupo-id="${grupo.id}">
                    <input 
                        type="checkbox" 
                        class="checkbox-grupo" 
                        data-grupo-id="${grupo.id}"
                        ${checked}
                    >
                    <div class="info-grupo-selecao">
                        <p class="nome-grupo">${nomeGrupoSeguro}</p>
                        <p class="descricao-grupo">${descricao}</p>
                    </div>
                </div>
            `;
        }).join('');

        // Event delegation
        this.attachGrupoSelectionHandlers(lista);
    }

    /**
     * Anexa handlers de seleção de grupos com event delegation
     */
    attachGrupoSelectionHandlers(lista) {
        lista.addEventListener('click', (e) => {
            const item = e.target.closest('.grupo-selecao-item');
            if (!item) return;

            const checkbox = item.querySelector('.checkbox-grupo');
            const grupoId = safeParseInt(item.dataset.grupoId);

            if (e.target !== checkbox) {
                checkbox.checked = !checkbox.checked;
            }
            this.toggleSelecaoGrupo(grupoId, checkbox.checked, item);
        });
    }

    /**
     * Toggle seleção de grupo
     */
    toggleSelecaoGrupo(grupoId, selecionado, itemElement) {
        if (isNaN(grupoId)) {
            console.error('ID de grupo inválido:', grupoId);
            return;
        }

        if (selecionado) {
            this.gruposSelecionados.add(grupoId);
            itemElement.classList.add('selecionado');
        } else {
            this.gruposSelecionados.delete(grupoId);
            itemElement.classList.remove('selecionado');
        }
    }

    /**
     * Confirma seleção de grupos com validação robusta
     */
    async confirmarSelecaoGrupos() {
        if (this.gruposSelecionados.size === 0) {
            showToast('Selecione pelo menos um grupo', { type: 'error' });
            return;
        }

        try {
            // Parsing seguro com fallback
            const minPadrao = safeParseInt(
                document.getElementById('grupo-min-padrao')?.value, 
                CONFIG.DEFAULT_MIN_QUANTITY
            );
            const maxPadrao = safeParseInt(
                document.getElementById('grupo-max-padrao')?.value, 
                CONFIG.DEFAULT_MAX_QUANTITY
            );

            // Validação de lógica de negócio
            if (maxPadrao < minPadrao) {
                showToast('Quantidade máxima não pode ser menor que a mínima', { type: 'error' });
                return;
            }

            let totalAdicionados = 0;

            // Buscar ingredientes de cada grupo e adicionar
            for (const grupoId of this.gruposSelecionados) {
                try {
                    const grupo = await getGroupById(grupoId);
                    
                    if (grupo && grupo.ingredients) {
                        for (const ingrediente of grupo.ingredients) {
                            // Verifica se já não foi adicionado
                            const jaAdicionado = this.insumosExtras.some(
                                e => e.ingredient_id === ingrediente.id
                            );

                            if (!jaAdicionado) {
                                this.insumosExtras.push({
                                    ingredient_id: ingrediente.id,
                                    name: ingrediente.name,
                                    portions: 0,
                                    min_quantity: minPadrao,
                                    max_quantity: maxPadrao,
                                    additional_price: ingrediente.additional_price || 0,
                                    is_available: ingrediente.is_available
                                });
                                totalAdicionados++;
                            }
                        }
                    }
                } catch (error) {
                    console.error(`Erro ao processar grupo ${grupoId}:`, error);
                    // Continua com os outros grupos
                }
            }

            if (totalAdicionados > 0) {
                showToast(
                    `${totalAdicionados} insumo(s) adicionado(s) dos grupos selecionados!`, 
                    { type: 'success' }
                );
            } else {
                showToast('Nenhum insumo novo foi adicionado', { type: 'info' });
            }
            
            this.fecharModalGruposExtras();
            this.renderizarListaExtras();
        } catch (error) {
            console.error('Erro ao adicionar grupos:', error);
            showToast('Erro ao adicionar grupos', { type: 'error' });
        }
    }

    /**
     * Renderiza lista de extras na interface principal
     * Inclui ingredientes da receita + extras adicionados
     */
    renderizarListaExtras() {
        const lista = document.getElementById('lista-extras-produto');
        if (!lista) {
            return;
        }

        // Combinar ingredientes da receita + extras (sem clonar arrays)
        const todosItens = this.ingredientesReceita.concat(this.insumosExtras);

        if (todosItens.length === 0) {
            lista.innerHTML = '<p class="empty-message">Nenhum insumo extra adicionado</p>';
            return;
        }

        // Criar Set uma vez para verificação O(1)
        const idsReceita = new Set(
            this.ingredientesReceita.map(r => r.ingredient_id)
        );

        lista.innerHTML = todosItens.map(item => {
            // ALTERAÇÃO: Garantir que min_quantity e max_quantity sejam números válidos
            const minQty = item.min_quantity !== null && item.min_quantity !== undefined 
                ? Number(item.min_quantity) 
                : 0;
            const maxQty = item.max_quantity !== null && item.max_quantity !== undefined 
                ? Number(item.max_quantity) 
                : 0;
            
            // ALTERAÇÃO: Log de debug para verificar valores antes de renderizar
            if (typeof window !== 'undefined' && window.DEBUG_MODE) {
                console.log(`[renderizarListaExtras] Item ${item.ingredient_id} (${item.name}):`, {
                    original_min: item.min_quantity,
                    original_max: item.max_quantity,
                    processed_min: minQty,
                    processed_max: maxQty,
                    type_min: typeof item.min_quantity,
                    type_max: typeof item.max_quantity
                });
            }
            
            const statusClass = item.is_available ? 'ativo' : 'inativo';
            const statusTexto = item.is_available ? 'Disponível' : 'Indisponível';
            const precoTexto = item.additional_price > 0 
                ? `<span class="badge-preco">+R$ ${item.additional_price.toFixed(2)}</span>`
                : '';
            
            // Verificação O(1) ao invés de O(n)
            const isDaReceita = idsReceita.has(item.ingredient_id);
            const badgeReceita = isDaReceita 
                ? '<span class="badge-receita" title="Ingrediente da receita base">Receita</span>' 
                : '';
            
            // Sanitizar nome
            const nomeSeguro = escapeHTML(item.name);

            return `
                <div class="extra-item" data-ingredient-id="${item.ingredient_id}">
                    <div class="extra-header">
                        <span class="extra-nome">${nomeSeguro}</span>
                        ${badgeReceita}
                        ${precoTexto}
                        <span class="badge-status ${statusClass}">${statusTexto}</span>
                    </div>
                    <div class="extra-body">
                        <div class="extra-config">
                            <span class="config-label">Regras:</span>
                            <span class="config-valor">Mín: ${minQty} | Máx: ${maxQty}</span>
                        </div>
                        <div class="extra-acoes">
                            <button class="btn-acao btn-config" 
                                    data-id="${item.ingredient_id}" 
                                    title="Configurar regras">
                                <i class="fa-solid fa-edit"></i>
                            </button>
                            ${!isDaReceita ? `
                            <button class="btn-acao btn-remover" 
                                    data-id="${item.ingredient_id}"
                                    title="Remover extra">
                                <i class="fa-solid fa-trash"></i>
                            </button>
                            ` : ''}
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        // Event delegation
        this.attachExtrasActionHandlers(lista);
    }

    /**
     * Anexa handlers de ações com event delegation (melhor performance)
     */
    attachExtrasActionHandlers(lista) {
        lista.addEventListener('click', (e) => {
            const btnConfig = e.target.closest('.btn-config');
            const btnRemover = e.target.closest('.btn-remover');

            if (btnConfig) {
                const ingredientId = safeParseInt(btnConfig.dataset.id);
                if (!isNaN(ingredientId)) {
                    this.abrirModalConfigExtra(ingredientId);
                }
            } else if (btnRemover) {
                const ingredientId = safeParseInt(btnRemover.dataset.id);
                if (!isNaN(ingredientId)) {
                    this.removerExtra(ingredientId);
                }
            }
        });
    }

    /**
     * Abre modal para configurar regras do extra
     * ALTERAÇÃO: Usar sistema centralizado de modais.js e utils.js
     */
    abrirModalConfigExtra(ingredientId) {
        // Procurar em ingredientes da receita ou extras
        let item = this.ingredientesReceita.find(
            e => e.ingredient_id === ingredientId
        );
        if (!item) {
            item = this.insumosExtras.find(
                e => e.ingredient_id === ingredientId
            );
        }
        
        if (!item) {
            console.error('Item não encontrado para configuração:', ingredientId);
            return;
        }

        this.insumoEditandoConfig = item;

        // Usar textContent ao invés de innerHTML (seguro contra XSS)
        const nomeElement = document.getElementById('nome-insumo-config-extra');
        if (nomeElement) {
            nomeElement.textContent = item.name;
        }

        const minInput = document.getElementById('extra-min-quantity');
        const maxInput = document.getElementById('extra-max-quantity');
        
        if (minInput) minInput.value = item.min_quantity;
        if (maxInput) maxInput.value = item.max_quantity;

        // ALTERAÇÃO: Usar sistema centralizado de modais
        abrirModal('modal-config-extra');
        
        // ALTERAÇÃO: Gerenciar inputs da modal usando utils.js
        const modal = document.getElementById('modal-config-extra');
        if (modal) {
            const inputs = modal.querySelectorAll('input, select, textarea');
            gerenciarInputsEspecificos(inputs);
        }
    }

    /**
     * Fecha modal de configuração
     * ALTERAÇÃO: Simplificado para usar apenas o sistema centralizado de modais.js
     * O sistema modais.js já gerencia o fechamento e reset dos campos (via data-reset-on-close)
     */
    fecharModalConfigExtra() {
        // Limpar estado antes de fechar
        this.insumoEditandoConfig = null;
        
        // ALTERAÇÃO: Usar sistema centralizado de modais
        fecharModal('modal-config-extra');
    }

    /**
     * Salva configuração do extra com validação robusta
     */
    salvarConfigExtra() {
        if (!this.insumoEditandoConfig) {
            console.error('Nenhum insumo sendo editado');
            return;
        }

        // Parsing seguro
        const minQuantity = safeParseInt(
            document.getElementById('extra-min-quantity')?.value,
            CONFIG.DEFAULT_MIN_QUANTITY
        );
        const maxQuantity = safeParseInt(
            document.getElementById('extra-max-quantity')?.value,
            CONFIG.DEFAULT_MAX_QUANTITY
        );

        // Validação de lógica de negócio
        if (maxQuantity < minQuantity) {
            showToast('Quantidade máxima não pode ser menor que a mínima', { type: 'error' });
            return;
        }

        // Atualizar valores
        this.insumoEditandoConfig.min_quantity = minQuantity;
        this.insumoEditandoConfig.max_quantity = maxQuantity;

        showToast('Configuração salva com sucesso!', { type: 'success' });
        this.fecharModalConfigExtra();
        this.renderizarListaExtras();
    }

    /**
     * Remove extra com confirmação
     */
    async removerExtra(ingredientId) {
        const confirmacao = await showActionModal({
            type: 'delete',
            message: 'Tem certeza que deseja remover este insumo extra?',
            confirmText: 'Remover',
            cancelText: 'Cancelar'
        });

        if (!confirmacao) return;

        const quantidadeAntes = this.insumosExtras.length;
        this.insumosExtras = this.insumosExtras.filter(
            e => e.ingredient_id !== ingredientId
        );
        
        if (this.insumosExtras.length < quantidadeAntes) {
            showToast('Insumo extra removido', { type: 'success' });
            this.renderizarListaExtras();
        } else {
            console.warn('Ingrediente não encontrado para remoção:', ingredientId);
        }
    }

    /**
     * Retorna lista de extras formatada para API
     * Retorna APENAS os extras verdadeiros (portions = 0)
     * Os ingredientes da receita base são salvos separadamente com portions > 0
     */
    getExtrasFormatadosParaAPI() {
        return this.insumosExtras.map(item => ({
            ingredient_id: item.ingredient_id,
            portions: 0,
            min_quantity: item.min_quantity || CONFIG.DEFAULT_MIN_QUANTITY,
            max_quantity: item.max_quantity || CONFIG.DEFAULT_MAX_QUANTITY
        }));
    }

    /**
     * Define ingredientes da receita base
     * Esses ingredientes aparecerão na lista de extras mas não podem ser removidos
     */
    setIngredientesReceita(receitaBase) {
        if (!receitaBase || !Array.isArray(receitaBase)) {
            this.ingredientesReceita = [];
            this.renderizarListaExtras();
            return;
        }

        // Converter ingredientes da receita para formato de extras
        this.ingredientesReceita = receitaBase.map(ing => {
            // Buscar dados completos do ingrediente
            const insumoCompleto = this.insumosDisponiveis.find(
                i => i.id === ing.ingredient_id
            );
            
            // ALTERAÇÃO: Preservar valores de min_quantity e max_quantity do banco de dados
            // Converter para número e usar valores padrão apenas se for null/undefined
            const minQuantity = ing.min_quantity !== null && ing.min_quantity !== undefined 
                ? safeParseInt(ing.min_quantity, 0) 
                : CONFIG.DEFAULT_MIN_QUANTITY;
            const maxQuantity = ing.max_quantity !== null && ing.max_quantity !== undefined 
                ? safeParseInt(ing.max_quantity, CONFIG.DEFAULT_MAX_QUANTITY) 
                : CONFIG.DEFAULT_MAX_QUANTITY;
            
            return {
                ingredient_id: ing.ingredient_id,
                name: ing.name || insumoCompleto?.name || 'Ingrediente',
                portions: 0,
                min_quantity: minQuantity,
                max_quantity: maxQuantity,
                additional_price: ing.additional_price ?? insumoCompleto?.additional_price ?? 0,
                is_available: ing.is_available ?? insumoCompleto?.is_available ?? true
            };
        });
        
        this.renderizarListaExtras();
    }

    /**
     * Define extras a partir de dados da API (para edição)
     */
    setExtrasFromAPI(ingredients) {
        if (!Array.isArray(ingredients)) {
            console.error('Ingredientes inválidos recebidos:', ingredients);
            this.insumosExtras = [];
            return;
        }

        // Filtrar apenas os extras (portions = 0)
        const filtrados = ingredients.filter(ing => {
            // ALTERAÇÃO: Verificar portions como número (pode vir como string ou número)
            const portions = Number(ing.portions) || 0;
            const isExtra = portions === 0;
            
            // ALTERAÇÃO: Log de debug para verificar filtro
            if (typeof window !== 'undefined' && window.DEBUG_MODE) {
                console.log(`[setExtrasFromAPI] Ingrediente ${ing.ingredient_id} (${ing.name}):`, {
                    portions: ing.portions,
                    portionsNumber: portions,
                    isExtra: isExtra,
                    min_quantity: ing.min_quantity,
                    max_quantity: ing.max_quantity
                });
            }
            
            return isExtra;
        });
        
        // ALTERAÇÃO: Log de debug para verificar dados recebidos
        if (typeof window !== 'undefined' && window.DEBUG_MODE) {
            console.log('[setExtrasFromAPI] Ingredientes recebidos:', ingredients);
            console.log('[setExtrasFromAPI] Extras filtrados (portions = 0):', filtrados);
        }
        
        this.insumosExtras = filtrados.map(ing => {
            const insumoCompleto = this.insumosDisponiveis.find(
                i => i.id === ing.ingredient_id
            );
            
            // ALTERAÇÃO: Preservar valores de min_quantity e max_quantity do banco de dados
            // Converter para número e usar valores padrão apenas se for null/undefined
            const minQuantity = ing.min_quantity !== null && ing.min_quantity !== undefined 
                ? safeParseInt(ing.min_quantity, 0) 
                : CONFIG.DEFAULT_MIN_QUANTITY;
            const maxQuantity = ing.max_quantity !== null && ing.max_quantity !== undefined 
                ? safeParseInt(ing.max_quantity, CONFIG.DEFAULT_MAX_QUANTITY) 
                : CONFIG.DEFAULT_MAX_QUANTITY;
            
            // ALTERAÇÃO: Log de debug para verificar valores processados
            if (typeof window !== 'undefined' && window.DEBUG_MODE) {
                console.log(`[setExtrasFromAPI] Ingrediente ${ing.ingredient_id} (${ing.name}):`, {
                    original_min: ing.min_quantity,
                    original_max: ing.max_quantity,
                    processed_min: minQuantity,
                    processed_max: maxQuantity
                });
            }
            
            return {
                ingredient_id: ing.ingredient_id,
                name: ing.name || insumoCompleto?.name || 'Ingrediente',
                portions: 0,
                min_quantity: minQuantity,
                max_quantity: maxQuantity,
                additional_price: ing.additional_price ?? insumoCompleto?.additional_price ?? 0,
                is_available: ing.is_available ?? insumoCompleto?.is_available ?? true
            };
        });
        
        // ALTERAÇÃO: Log de debug para verificar resultado final
        if (typeof window !== 'undefined' && window.DEBUG_MODE) {
            console.log('[setExtrasFromAPI] Extras processados:', this.insumosExtras);
        }
        
        this.renderizarListaExtras();
    }

    /**
     * Adiciona um ingrediente da receita à área de extras em tempo real
     */
    adicionarIngredienteReceita(ingredienteData) {
        if (!ingredienteData || !ingredienteData.ingredient_id) {
            console.error('Dados de ingrediente inválidos:', ingredienteData);
            return;
        }

        // Verificar se já existe
        const jaExiste = this.ingredientesReceita.some(
            item => item.ingredient_id === ingredienteData.ingredient_id
        );
        
        if (jaExiste) {
            return; // Não adicionar duplicado
        }
        
        // ALTERAÇÃO: Preservar valores de min_quantity e max_quantity corretamente
        const minQuantity = ingredienteData.min_quantity !== null && ingredienteData.min_quantity !== undefined 
            ? safeParseInt(ingredienteData.min_quantity, 0) 
            : CONFIG.DEFAULT_MIN_QUANTITY;
        const maxQuantity = ingredienteData.max_quantity !== null && ingredienteData.max_quantity !== undefined 
            ? safeParseInt(ingredienteData.max_quantity, CONFIG.DEFAULT_MAX_QUANTITY) 
            : CONFIG.DEFAULT_MAX_QUANTITY;
        
        // Adicionar aos ingredientes da receita
        this.ingredientesReceita.push({
            ingredient_id: ingredienteData.ingredient_id,
            name: ingredienteData.name || 'Ingrediente',
            portions: ingredienteData.portions || 0,
            min_quantity: minQuantity,
            max_quantity: maxQuantity,
            additional_price: ingredienteData.additional_price || 0,
            is_available: ingredienteData.is_available !== false
        });
        
        // Renderizar lista atualizada
        this.renderizarListaExtras();
    }
    
    /**
     * Remove um ingrediente da receita da área de extras em tempo real
     */
    removerIngredienteReceita(ingredientId) {
        if (isNaN(ingredientId)) {
            console.error('ID de ingrediente inválido:', ingredientId);
            return;
        }

        // Remover dos ingredientes da receita
        this.ingredientesReceita = this.ingredientesReceita.filter(
            item => item.ingredient_id !== ingredientId
        );
        
        // Renderizar lista atualizada
        this.renderizarListaExtras();
    }

    /**
     * Limpa todos os extras e ingredientes da receita
     */
    limparExtras() {
        this.insumosExtras = [];
        this.ingredientesReceita = [];
        this.renderizarListaExtras();
    }

    /**
     * Destroy method para cleanup completo (importante para SPA)
     */
    destroy() {
        this.cleanup();
        this.limparExtras();
        this.insumosDisponiveis = [];
        this.gruposDisponiveis = [];
    }
}

// Exportar classe
export default ProdutoExtrasManager;
