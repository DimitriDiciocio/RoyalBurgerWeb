/**
 * Gerenciador de Grupos de Insumos Extras
 * Sistema de gerenciamento de grupos de adicionais para produtos
 */

import { showToast, showActionModal } from '../alerts.js';
import { getIngredients } from '../../api/ingredients.js';
import { 
    getGroups, 
    getGroupById, 
    createGroup, 
    updateGroup, 
    deleteGroup,
    addIngredientToGroup,
    removeIngredientFromGroup,
    addMultipleIngredientsToGroup
} from '../../api/groups.js';
import { abrirModal, fecharModal } from '../modais.js';
import { gerenciarInputsEspecificos } from '../../utils.js';

export class GruposInsumosManager {
    constructor() {
        this.grupos = [];
        this.grupoAtual = null;
        this.insumosDisponiveis = [];
        this.insumosSelecionados = new Set();
        this.editandoGrupo = null;
        this.isInitialized = false; // Flag para evitar duplicação
    }

    /**
     * Inicializa o gerenciador
     */
    async init() {
        // Evitar inicialização múltipla
        if (this.isInitialized) {
            console.log('GruposInsumosManager já inicializado');
            return;
        }

        try {
            await this.setupEventListeners();
            await this.carregarDados();
            this.isInitialized = true;
        } catch (error) {
            console.error('Erro ao inicializar gerenciador de grupos de insumos:', error);
            showToast('Erro ao carregar dados', { type: 'error' });
        }
    }

    /**
     * Configura event listeners
     */
    async setupEventListeners() {
        // Botão principal para abrir modal
        const btnGruposAdicionais = document.getElementById('btn-grupos-adicionais');
        if (btnGruposAdicionais) {
            btnGruposAdicionais.addEventListener('click', () => this.abrirModalGrupos());
        }

        // ALTERAÇÃO: Removido listener manual de cancelar - modais.js já gerencia via data-close-modal
        // Modal Grupos - Botões principais
        document.getElementById('salvar-grupos-insumos')?.addEventListener('click', () => this.salvarAlteracoes());
        document.getElementById('btn-adicionar-grupo-insumo')?.addEventListener('click', () => this.abrirFormularioGrupo());

        // Modal Insumos do Grupo
        document.getElementById('voltar-grupos-insumos')?.addEventListener('click', () => this.voltarParaGrupos());
        // ALTERAÇÃO: Removido listener manual de cancelar - modais.js já gerencia via data-close-modal
        document.getElementById('salvar-insumos-grupo')?.addEventListener('click', () => this.salvarInsumosGrupo());
        document.getElementById('btn-adicionar-insumo-grupo')?.addEventListener('click', () => this.abrirModalSelecaoInsumos());

        // ALTERAÇÃO: Removido listener manual de cancelar - modais.js já gerencia via data-close-modal
        // Modal Formulário Grupo
        document.getElementById('salvar-grupo-insumo-form')?.addEventListener('click', () => this.salvarGrupo());

        // ALTERAÇÃO: Removido listener manual de cancelar - modais.js já gerencia via data-close-modal
        // Modal Seleção de Insumos
        document.getElementById('adicionar-insumos-selecionados')?.addEventListener('click', () => this.confirmarSelecaoInsumos());
        
        // Busca de insumos
        const buscaInsumo = document.getElementById('busca-insumo-modal');
        if (buscaInsumo) {
            buscaInsumo.addEventListener('input', (e) => this.filtrarInsumos(e.target.value));
        }

        // Fechar modais ao clicar no overlay
        this.setupOverlayListeners();
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
     * Carrega dados iniciais
     */
    async carregarDados() {
        try {
            // Carregar grupos da API (incluindo inativos para o painel admin)
            await this.carregarGrupos();
            
            // Carregar insumos disponíveis da API
            await this.carregarInsumosDisponiveis();

        } catch (error) {
            console.error('Erro ao carregar dados:', error);
            throw error;
        }
    }

    /**
     * Carrega grupos da API
     */
    async carregarGrupos() {
        try {
            const grupos = await getGroups({ active_only: false });
            this.grupos = grupos || [];
        } catch (error) {
            console.error('Erro ao carregar grupos:', error);
            showToast('Erro ao carregar grupos', { type: 'error' });
            this.grupos = [];
        }
    }

    /**
     * Carrega insumos disponíveis da API
     */
    async carregarInsumosDisponiveis() {
        try {
            const response = await getIngredients({ page_size: 1000 });
            if (response && response.items) {
                this.insumosDisponiveis = response.items;
            }
        } catch (error) {
            console.error('Erro ao carregar insumos:', error);
            showToast('Erro ao carregar insumos disponíveis', { type: 'error' });
        }
    }

    /**
     * Abre modal principal de grupos
     * ALTERAÇÃO: Usar sistema centralizado de modais.js e utils.js
     */
    abrirModalGrupos() {
        this.renderizarGrupos();
        
        // ALTERAÇÃO: Usar sistema centralizado de modais
        abrirModal('modal-grupos-insumos');
        
        // ALTERAÇÃO: Gerenciar inputs da modal usando utils.js
        const modal = document.getElementById('modal-grupos-insumos');
        if (modal) {
            const inputs = modal.querySelectorAll('input, select, textarea');
            if (inputs.length > 0) {
                gerenciarInputsEspecificos(inputs);
            }
        }
    }

    /**
     * Fecha modal de grupos
     * ALTERAÇÃO: Simplificado para usar apenas o sistema centralizado de modais.js
     * O sistema modais.js já gerencia o fechamento e reset dos campos (via data-reset-on-close)
     */
    fecharModalGrupos() {
        // ALTERAÇÃO: Usar sistema centralizado de modais
        fecharModal('modal-grupos-insumos');
    }

    /**
     * Renderiza lista de grupos
     */
    renderizarGrupos() {
        const lista = document.getElementById('lista-grupos-insumos');
        if (!lista) return;

        if (this.grupos.length === 0) {
            lista.innerHTML = '<p style="text-align: center; color: #888; padding: 20px;">Nenhum grupo cadastrado</p>';
            return;
        }

        // innerHTML substitui todo o conteúdo, removendo event listeners antigos automaticamente
        lista.innerHTML = this.grupos.map(grupo => `
            <div class="grupo-insumo-item" data-grupo-id="${grupo.id}">
                <p class="nome-grupo-insumo">${grupo.name}</p>
                <div class="info-grupo-insumo">
                    <div class="acoes-grupo-insumo">
                        <button class="btn-acao btn-insumos" data-acao="insumos" data-grupo-id="${grupo.id}" title="Gerenciar insumos">
                            Acessar insumos
                            <i class="fa-solid fa-list"></i>
                        </button>
                        <button class="btn-acao btn-editar" data-acao="editar" data-grupo-id="${grupo.id}" title="Editar grupo">
                            <i class="fa-solid fa-edit"></i>
                        </button>
                        <button class="btn-acao btn-excluir" data-acao="excluir" data-grupo-id="${grupo.id}" title="Excluir grupo">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                </div>
            </div>
        `).join('');

        // Adicionar event listeners aos novos botões
        lista.querySelectorAll('[data-acao]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const acao = btn.dataset.acao;
                const grupoId = parseInt(btn.dataset.grupoId);
                this.executarAcaoGrupo(acao, grupoId);
            });
        });
    }

    /**
     * Executa ação em um grupo
     */
    executarAcaoGrupo(acao, grupoId) {
        const grupo = this.grupos.find(g => g.id === grupoId);
        if (!grupo) return;

        switch (acao) {
            case 'insumos':
                this.abrirModalInsumosGrupo(grupo);
                break;
            case 'editar':
                this.editarGrupo(grupo);
                break;
            case 'excluir':
                this.excluirGrupo(grupoId);
                break;
        }
    }

    /**
     * Abre formulário para adicionar/editar grupo
     * ALTERAÇÃO: Usar sistema centralizado de modais.js e utils.js
     */
    abrirFormularioGrupo(grupo = null) {
        this.editandoGrupo = grupo;
        const modal = document.getElementById('modal-grupo-insumo-form');
        const titulo = document.getElementById('titulo-grupo-insumo-form');
        const input = document.getElementById('nome-grupo-insumo-input');

        if (grupo) {
            titulo.textContent = 'Editar Grupo';
            input.value = grupo.name;
        } else {
            titulo.textContent = 'Adicionar Grupo';
            input.value = '';
        }

        // ALTERAÇÃO: Usar sistema centralizado de modais
        abrirModal('modal-grupo-insumo-form');
        
        // ALTERAÇÃO: Gerenciar inputs da modal usando utils.js
        if (modal) {
            const inputs = modal.querySelectorAll('input, select, textarea');
            if (inputs.length > 0) {
                gerenciarInputsEspecificos(inputs);
            }
        }
        
        input?.focus();
    }

    /**
     * Fecha formulário de grupo
     * ALTERAÇÃO: Simplificado para usar apenas o sistema centralizado de modais.js
     * O sistema modais.js já gerencia o fechamento e reset dos campos (via data-reset-on-close)
     */
    fecharFormularioGrupo() {
        // Limpar estado antes de fechar
        this.editandoGrupo = null;
        
        // ALTERAÇÃO: Usar sistema centralizado de modais
        fecharModal('modal-grupo-insumo-form');
    }

    /**
     * Salva grupo (novo ou editado)
     */
    async salvarGrupo() {
        const input = document.getElementById('nome-grupo-insumo-input');
        const nome = input?.value.trim();

        if (!nome) {
            showToast('Digite um nome para o grupo', { type: 'error' });
            input?.focus();
            return;
        }

        try {
            if (this.editandoGrupo) {
                // Editar grupo existente
                await updateGroup(this.editandoGrupo.id, { name: nome });
                showToast('Grupo atualizado com sucesso!', { type: 'success' });
            } else {
                // Adicionar novo grupo
                await createGroup({ name: nome, is_active: true });
                showToast('Grupo adicionado com sucesso!', { type: 'success' });
            }

            this.fecharFormularioGrupo();
            // Recarregar grupos da API
            await this.carregarGrupos();
            this.renderizarGrupos();
        } catch (error) {
            console.error('Erro ao salvar grupo:', error);
            const mensagem = error.message || 'Erro ao salvar grupo';
            showToast(mensagem, { type: 'error' });
        }
    }

    /**
     * Edita um grupo
     */
    editarGrupo(grupo) {
        this.abrirFormularioGrupo(grupo);
    }

    /**
     * Exclui um grupo
     */
    async excluirGrupo(grupoId) {
        // Usar sistema de modal de confirmação customizado
        const confirmacao = await showActionModal({
            type: 'delete',
            message: 'Tem certeza que deseja excluir este grupo? Todos os ingredientes vinculados também serão removidos.',
            confirmText: 'Excluir',
            cancelText: 'Cancelar'
        });
        
        if (!confirmacao) {
            return;
        }

        try {
            await deleteGroup(grupoId);
            showToast('Grupo excluído com sucesso!', { type: 'success' });
            
            // Recarregar grupos da API
            await this.carregarGrupos();
            this.renderizarGrupos();
        } catch (error) {
            console.error('Erro ao excluir grupo:', error);
            const mensagem = error.message || 'Erro ao excluir grupo';
            showToast(mensagem, { type: 'error' });
        }
    }

    /**
     * Abre modal de insumos do grupo
     */
    async abrirModalInsumosGrupo(grupo) {
        try {
            // Buscar dados atualizados do grupo com ingredientes da API
            const grupoCompleto = await getGroupById(grupo.id);
            this.grupoAtual = grupoCompleto;
            
            const modal = document.getElementById('modal-insumos-grupo');
            const titulo = document.getElementById('titulo-insumos-grupo');

            if (titulo) {
                titulo.textContent = `Insumos - ${grupoCompleto.name}`;
            }

            this.renderizarInsumosGrupo();

            if (modal) {
                // Fechar modal de grupos
                this.fecharModalGrupos();
                // ALTERAÇÃO: Usar sistema centralizado de modais
                abrirModal('modal-insumos-grupo');
                
                // ALTERAÇÃO: Gerenciar inputs da modal usando utils.js
                const inputs = modal.querySelectorAll('input, select, textarea');
                if (inputs.length > 0) {
                    gerenciarInputsEspecificos(inputs);
                }
            }
        } catch (error) {
            console.error('Erro ao abrir modal de insumos:', error);
            showToast('Erro ao carregar insumos do grupo', { type: 'error' });
        }
    }

    /**
     * Fecha modal de insumos do grupo
     * ALTERAÇÃO: Simplificado para usar apenas o sistema centralizado de modais.js
     * O sistema modais.js já gerencia o fechamento e reset dos campos (via data-reset-on-close)
     */
    fecharModalInsumosGrupo() {
        // Limpar estado antes de fechar
        this.grupoAtual = null;
        
        // ALTERAÇÃO: Usar sistema centralizado de modais
        fecharModal('modal-insumos-grupo');
    }

    /**
     * Volta para o modal de grupos
     */
    voltarParaGrupos() {
        this.fecharModalInsumosGrupo();
        this.abrirModalGrupos();
    }

    /**
     * Renderiza insumos do grupo
     */
    renderizarInsumosGrupo() {
        const lista = document.getElementById('lista-insumos-grupo');
        if (!lista || !this.grupoAtual) return;

        const ingredients = this.grupoAtual.ingredients || [];
        
        if (ingredients.length === 0) {
            lista.innerHTML = '<p style="text-align: center; color: #888; padding: 20px;">Nenhum insumo vinculado</p>';
            return;
        }

        lista.innerHTML = ingredients.map(insumo => {
            const statusClass = insumo.is_available ? 'ativo' : 'inativo';
            const statusTexto = insumo.is_available ? 'Ativo' : 'Inativo';

            return `
                <div class="insumo-grupo-item" data-insumo-id="${insumo.id}">
                    <div class="info-insumo">
                        <p class="nome-insumo">${insumo.name}</p>
                        <p class="status-insumo ${statusClass}">${statusTexto}</p>
                    </div>
                    <div class="acoes-insumo">
                        <button class="btn-remover" data-insumo-id="${insumo.id}" title="Remover insumo">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        // Adicionar event listeners aos botões de remover
        lista.querySelectorAll('.btn-remover').forEach(btn => {
            btn.addEventListener('click', () => {
                const insumoId = parseInt(btn.dataset.insumoId);
                this.removerInsumoDoGrupo(insumoId);
            });
        });
    }

    /**
     * Remove insumo do grupo
     */
    async removerInsumoDoGrupo(insumoId) {
        if (!this.grupoAtual) return;

        // Usar sistema de modal de confirmação customizado
        const confirmacao = await showActionModal({
            type: 'delete',
            message: 'Tem certeza que deseja remover este insumo do grupo?',
            confirmText: 'Remover',
            cancelText: 'Cancelar'
        });
        
        if (!confirmacao) {
            return;
        }

        try {
            await removeIngredientFromGroup(this.grupoAtual.id, insumoId);
            showToast('Insumo removido do grupo com sucesso!', { type: 'success' });
            
            // Recarregar dados do grupo
            const grupoAtualizado = await getGroupById(this.grupoAtual.id);
            this.grupoAtual = grupoAtualizado;
            this.renderizarInsumosGrupo();
        } catch (error) {
            console.error('Erro ao remover insumo:', error);
            const mensagem = error.message || 'Erro ao remover insumo do grupo';
            showToast(mensagem, { type: 'error' });
        }
    }

    /**
     * Salva insumos do grupo
     */
    salvarInsumosGrupo() {
        showToast('Alterações salvas com sucesso!', { type: 'success' });
        this.fecharModalInsumosGrupo();
        this.abrirModalGrupos();
    }

    /**
     * Abre modal de seleção de insumos
     * ALTERAÇÃO: Usar sistema centralizado de modais.js e utils.js
     */
    abrirModalSelecaoInsumos() {
        this.insumosSelecionados.clear();
        this.renderizarInsumosDisponiveis();
        
        // ALTERAÇÃO: Usar sistema centralizado de modais
        abrirModal('modal-selecao-insumos');
        
        // ALTERAÇÃO: Gerenciar inputs da modal usando utils.js
        const modal = document.getElementById('modal-selecao-insumos');
        if (modal) {
            const inputs = modal.querySelectorAll('input, select, textarea');
            if (inputs.length > 0) {
                gerenciarInputsEspecificos(inputs);
            }
        }
    }

    /**
     * Fecha modal de seleção de insumos
     * ALTERAÇÃO: Simplificado para usar apenas o sistema centralizado de modais.js
     * O sistema modais.js já gerencia o fechamento e reset dos campos (via data-reset-on-close)
     */
    fecharModalSelecaoInsumos() {
        // Limpar seleções antes de fechar
        this.insumosSelecionados.clear();
        
        // ALTERAÇÃO: Usar sistema centralizado de modais
        fecharModal('modal-selecao-insumos');
    }

    /**
     * Renderiza insumos disponíveis para seleção
     */
    renderizarInsumosDisponiveis(filtro = '') {
        const lista = document.getElementById('lista-insumos-selecao');
        if (!lista) return;

        // Filtrar insumos que já não estão no grupo
        const insumosJaVinculados = this.grupoAtual?.ingredients || [];
        const idsJaVinculados = insumosJaVinculados.map(i => i.id);
        
        const insumosParaMostrar = this.insumosDisponiveis.filter(insumo => {
            const naoVinculado = !idsJaVinculados.includes(insumo.id);
            const matchFiltro = !filtro || insumo.name.toLowerCase().includes(filtro.toLowerCase());
            return naoVinculado && matchFiltro;
        });

        if (insumosParaMostrar.length === 0) {
            lista.innerHTML = '<p style="text-align: center; color: #888; padding: 20px;">Nenhum insumo disponível</p>';
            return;
        }

        lista.innerHTML = insumosParaMostrar.map(insumo => {
            const statusClass = insumo.is_available ? 'ativo' : 'inativo';
            const statusTexto = insumo.is_available ? 'Ativo' : 'Inativo';
            const checked = this.insumosSelecionados.has(insumo.id) ? 'checked' : '';

            return `
                <div class="insumo-selecao-item ${checked ? 'selecionado' : ''}" data-insumo-id="${insumo.id}">
                    <input 
                        type="checkbox" 
                        class="checkbox-insumo" 
                        data-insumo-id="${insumo.id}"
                        ${checked}
                    >
                    <div class="info-insumo-selecao">
                        <p class="nome-insumo">${insumo.name}</p>
                        <p class="status-insumo ${statusClass}">${statusTexto}</p>
                    </div>
                </div>
            `;
        }).join('');

        // Adicionar event listeners
        lista.querySelectorAll('.insumo-selecao-item').forEach(item => {
            const checkbox = item.querySelector('.checkbox-insumo');
            const insumoId = parseInt(item.dataset.insumoId);

            item.addEventListener('click', (e) => {
                if (e.target !== checkbox) {
                    checkbox.checked = !checkbox.checked;
                }
                this.toggleSelecaoInsumo(insumoId, checkbox.checked, item);
            });

            checkbox.addEventListener('change', (e) => {
                this.toggleSelecaoInsumo(insumoId, e.target.checked, item);
            });
        });
    }

    /**
     * Toggle seleção de insumo
     */
    toggleSelecaoInsumo(insumoId, selecionado, itemElement) {
        if (selecionado) {
            this.insumosSelecionados.add(insumoId);
            itemElement.classList.add('selecionado');
        } else {
            this.insumosSelecionados.delete(insumoId);
            itemElement.classList.remove('selecionado');
        }
    }

    /**
     * Filtra insumos na busca
     */
    filtrarInsumos(termo) {
        this.renderizarInsumosDisponiveis(termo);
    }

    /**
     * Confirma seleção de insumos
     */
    async confirmarSelecaoInsumos() {
        if (this.insumosSelecionados.size === 0) {
            showToast('Selecione pelo menos um insumo', { type: 'error' });
            return;
        }

        if (!this.grupoAtual) return;

        try {
            // Adicionar insumos selecionados ao grupo via API
            const idsArray = Array.from(this.insumosSelecionados);
            const results = await addMultipleIngredientsToGroup(this.grupoAtual.id, idsArray);
            
            // Contar sucessos e falhas
            const sucessos = results.filter(r => r.status === 'fulfilled').length;
            const falhas = results.filter(r => r.status === 'rejected').length;
            
            if (sucessos > 0) {
                showToast(`${sucessos} insumo(s) adicionado(s) ao grupo com sucesso!`, { type: 'success' });
            }
            
            if (falhas > 0) {
                showToast(`${falhas} insumo(s) não puderam ser adicionados`, { type: 'warning' });
            }
            
            this.fecharModalSelecaoInsumos();
            
            // Recarregar dados do grupo
            const grupoAtualizado = await getGroupById(this.grupoAtual.id);
            this.grupoAtual = grupoAtualizado;
            this.renderizarInsumosGrupo();
        } catch (error) {
            console.error('Erro ao adicionar insumos:', error);
            const mensagem = error.message || 'Erro ao adicionar insumos ao grupo';
            showToast(mensagem, { type: 'error' });
        }
    }

    /**
     * Salva todas as alterações e fecha modal
     */
    salvarAlteracoes() {
        // Todas as alterações já são salvas automaticamente via API
        // Este método apenas fecha o modal
        showToast('Alterações salvas com sucesso!', { type: 'success' });
        this.fecharModalGrupos();
    }
}

// Exportar instância para uso global
export default GruposInsumosManager;

