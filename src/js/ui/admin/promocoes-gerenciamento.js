/**
 * Módulo de Gerenciamento de Promoções
 * Responsável por todas as operações relacionadas a promoções de produtos
 */

import {
    getPromotions,
    getPromotionById,
    getPromotionByProductId,
    createPromotion,
    updatePromotion,
    deletePromotion
} from '../../api/promotions.js';

import { getProducts } from '../../api/products.js';
import { showToast, showConfirm, toastFromApiError, toastFromApiSuccess, showActionModal } from '../alerts.js';
import { abrirModal, fecharModal } from '../modais.js';
import { escapeHTML } from '../../utils/html-sanitizer.js';
import { debounce } from '../../utils/performance-utils.js';

/**
 * Gerenciador de dados de promoções
 */
class PromocaoDataManager {
    constructor() {
        this.cache = {
            data: null,
            lastFetch: null
        };
        this.cacheTimeout = 2 * 60 * 1000; // 2 minutos
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
     * Busca todas as promoções
     */
    async getAllPromocoes(includeExpired = true) {
        try {
            if (this.isCacheValid() && !includeExpired) {
                return this.cache.data;
            }

            const response = await getPromotions({ include_expired: includeExpired });
            this.cache.data = response;
            this.cache.lastFetch = Date.now();
            
            return response;
        } catch (error) {
            // ALTERAÇÃO: Log condicional apenas em modo debug
            if (window.DEBUG_MODE) {
                console.error('Erro ao buscar promoções:', error);
            }
            throw error;
        }
    }

    /**
     * Busca promoção por ID
     */
    async getPromocaoById(id) {
        try {
            return await getPromotionById(id);
        } catch (error) {
            // ALTERAÇÃO: Log condicional apenas em modo debug
            if (window.DEBUG_MODE) {
                console.error('Erro ao buscar promoção:', error);
            }
            throw error;
        }
    }

    /**
     * Busca promoção por ID do produto
     * @param {number} productId - ID do produto
     * @param {boolean} includeExpired - Se true, inclui promoções expiradas
     */
    async getPromocaoByProductId(productId, includeExpired = false) {
        try {
            return await getPromotionByProductId(productId, includeExpired);
        } catch (error) {
            // Se não encontrou (404), retorna null
            if (error.status === 404) {
                return null;
            }
            // ALTERAÇÃO: Log condicional apenas em modo debug
            if (window.DEBUG_MODE) {
                console.error('Erro ao buscar promoção por produto:', error);
            }
            throw error;
        }
    }

    /**
     * Adiciona nova promoção
     */
    async addPromocao(promocaoData) {
        try {
            await createPromotion(promocaoData);
            this.clearCache();
        } catch (error) {
            // ALTERAÇÃO: Não logar erro 409 aqui, será tratado no savePromocao
            // Apenas logar outros erros se DEBUG_MODE estiver ativo
            if (error.status !== 409 && window.DEBUG_MODE) {
                console.error('Erro ao adicionar promoção:', error);
            }
            throw error;
        }
    }

    /**
     * Atualiza promoção
     */
    async updatePromocao(id, promocaoData) {
        try {
            await updatePromotion(id, promocaoData);
            this.clearCache();
        } catch (error) {
            // ALTERAÇÃO: Log condicional apenas em modo debug
            if (window.DEBUG_MODE) {
                console.error('Erro ao atualizar promoção:', error);
            }
            throw error;
        }
    }

    /**
     * Remove promoção
     */
    async deletePromocao(id) {
        try {
            await deletePromotion(id);
            this.clearCache();
        } catch (error) {
            // ALTERAÇÃO: Log condicional apenas em modo debug
            if (window.DEBUG_MODE) {
                console.error('Erro ao remover promoção:', error);
            }
            throw error;
        }
    }
}

/**
 * Gerenciador de interface de promoções
 */
class PromocaoManager {
    constructor() {
        this.dataManager = new PromocaoDataManager();
        this.currentPromocaoId = null;
        this.produtos = [];
        this.promocoes = [];
        this.eventListeners = [];
        this.filtroStatus = 'todas';
        this.termoBusca = '';
    }

    /**
     * Inicializa o módulo
     */
    async init() {
        try {
            await this.loadProdutos();
            await this.loadPromocoes();
            this.setupEventListeners();
            this.updateMetrics();
        } catch (error) {
            // ALTERAÇÃO: Log condicional apenas em modo debug
            if (window.DEBUG_MODE) {
                console.error('Erro ao inicializar módulo de promoções:', error);
            }
            this.showErrorMessage('Erro ao carregar dados das promoções');
        }
    }

    /**
     * Carrega produtos disponíveis
     */
    async loadProdutos() {
        try {
            const response = await getProducts({ page_size: 1000, include_inactive: false });
            this.produtos = response.items || [];
        } catch (error) {
            // ALTERAÇÃO: Log condicional apenas em modo debug
            if (window.DEBUG_MODE) {
                console.error('Erro ao carregar produtos:', error);
            }
            this.produtos = [];
        }
    }

    /**
     * Carrega promoções
     */
    async loadPromocoes() {
        try {
            const response = await this.dataManager.getAllPromocoes(true);
            this.promocoes = response.items || response || [];
            this.renderPromocoes();
        } catch (error) {
            // ALTERAÇÃO: Log condicional apenas em modo debug
            if (window.DEBUG_MODE) {
                console.error('Erro ao carregar promoções:', error);
            }
            this.promocoes = [];
            this.renderPromocoes();
        }
    }

    /**
     * Configura event listeners
     */
    setupEventListeners() {
        this.removeEventListeners();
        
        // Botão nova promoção
        const btnNovaPromocao = document.getElementById('btn-nova-promocao');
        if (btnNovaPromocao) {
            const handler = () => this.handleNovaPromocao();
            btnNovaPromocao.addEventListener('click', handler);
            this.eventListeners.push({ element: btnNovaPromocao, event: 'click', handler });
        }

        // Busca
        const buscaInput = document.getElementById('busca-promocao');
        if (buscaInput) {
            const handler = debounce((e) => {
                this.termoBusca = e.target.value.toLowerCase();
                this.renderPromocoes();
            }, 300);
            buscaInput.addEventListener('input', handler);
            this.eventListeners.push({ element: buscaInput, event: 'input', handler });
        }

        // Filtro de status
        const filtroStatus = document.getElementById('filtro-status-promocao');
        if (filtroStatus) {
            const handler = (e) => {
                this.filtroStatus = e.target.value;
                this.renderPromocoes();
            };
            filtroStatus.addEventListener('change', handler);
            this.eventListeners.push({ element: filtroStatus, event: 'change', handler });
        }

        // Modal handlers
        this.setupModalHandlers();
    }

    /**
     * Remove event listeners existentes
     */
    removeEventListeners() {
        if (this.eventListeners) {
            this.eventListeners.forEach(({ element, event, handler }) => {
                element.removeEventListener(event, handler);
            });
            this.eventListeners = [];
        }
    }

    /**
     * Configura handlers dos modais
     */
    setupModalHandlers() {
        const modal = document.getElementById('modal-promocao');
        if (!modal) return;

        // Botão cancelar
        const btnCancelar = document.getElementById('cancelar-promocao');
        if (btnCancelar) {
            const handler = () => this.closeModal();
            btnCancelar.addEventListener('click', handler);
            this.eventListeners.push({ element: btnCancelar, event: 'click', handler });
        }

        // Botão salvar
        const btnSalvar = document.getElementById('salvar-promocao');
        if (btnSalvar) {
            const handler = () => this.savePromocao();
            btnSalvar.addEventListener('click', handler);
            this.eventListeners.push({ element: btnSalvar, event: 'click', handler });
        }

        // Tipo de desconto
        const radioTipoDesconto = document.querySelectorAll('input[name="tipo-desconto"]');
        radioTipoDesconto.forEach(radio => {
            const handler = (e) => this.handleTipoDescontoChange(e.target.value);
            radio.addEventListener('change', handler);
            this.eventListeners.push({ element: radio, event: 'change', handler });
        });

        // Produto selecionado
        const selectProduto = document.getElementById('produto-promocao');
        if (selectProduto) {
            const handler = () => this.handleProdutoChange();
            selectProduto.addEventListener('change', handler);
            this.eventListeners.push({ element: selectProduto, event: 'change', handler });
        }

        // Campos de desconto
        const descontoPercentual = document.getElementById('desconto-percentual');
        const descontoValor = document.getElementById('desconto-valor');
        
        if (descontoPercentual) {
            const handlerInput = (e) => {
                this.formatPercentualInput(e.target);
                this.calculatePrecoFinal();
            };
            const handlerBlur = (e) => {
                this.validatePercentualInput(e.target);
            };
            descontoPercentual.addEventListener('input', handlerInput);
            descontoPercentual.addEventListener('blur', handlerBlur);
            this.eventListeners.push({ element: descontoPercentual, event: 'input', handler: handlerInput });
            this.eventListeners.push({ element: descontoPercentual, event: 'blur', handler: handlerBlur });
        }

        if (descontoValor) {
            const handlerInput = (e) => {
                this.formatCurrencyInput(e.target);
                this.calculatePrecoFinal();
            };
            const handlerBlur = (e) => {
                this.validateCurrencyInput(e.target);
            };
            descontoValor.addEventListener('input', handlerInput);
            descontoValor.addEventListener('blur', handlerBlur);
            this.eventListeners.push({ element: descontoValor, event: 'input', handler: handlerInput });
            this.eventListeners.push({ element: descontoValor, event: 'blur', handler: handlerBlur });
        }

        // Validação de data de expiração
        const dataExpiracao = document.getElementById('data-expiracao-promocao');
        if (dataExpiracao) {
            const handlerChange = (e) => {
                this.validateDataExpiracao(e.target);
            };
            const handlerBlur = (e) => {
                this.validateDataExpiracao(e.target);
            };
            dataExpiracao.addEventListener('change', handlerChange);
            dataExpiracao.addEventListener('blur', handlerBlur);
            this.eventListeners.push({ element: dataExpiracao, event: 'change', handler: handlerChange });
            this.eventListeners.push({ element: dataExpiracao, event: 'blur', handler: handlerBlur });
        }

        // Event delegation para botões de ação
        const promocoesList = document.getElementById('promocoes-list');
        if (promocoesList) {
            const handler = (e) => {
                if (e.target.closest('.btn-editar-promocao')) {
                    const promocaoId = parseInt(e.target.closest('.promocao-card').dataset.promocaoId);
                    this.handleEditarPromocao(promocaoId);
                } else if (e.target.closest('.btn-excluir-promocao')) {
                    const promocaoId = parseInt(e.target.closest('.promocao-card').dataset.promocaoId);
                    this.handleExcluirPromocao(promocaoId);
                }
            };
            promocoesList.addEventListener('click', handler);
            this.eventListeners.push({ element: promocoesList, event: 'click', handler });
        }
    }

    /**
     * Renderiza lista de promoções
     */
    renderPromocoes() {
        const container = document.getElementById('promocoes-list');
        if (!container) return;

        let promocoesFiltradas = [...this.promocoes];

        // Filtro por status
        if (this.filtroStatus === 'ativas') {
            promocoesFiltradas = promocoesFiltradas.filter(p => {
                const expiresAt = new Date(p.expires_at);
                return expiresAt > new Date();
            });
        } else if (this.filtroStatus === 'expiradas') {
            promocoesFiltradas = promocoesFiltradas.filter(p => {
                // ALTERAÇÃO: Comparar datas corretamente (backend retorna UTC)
                const expiresAt = new Date(p.expires_at);
                const now = new Date();
                return expiresAt <= now;
            });
        }

        // Filtro por busca
        if (this.termoBusca) {
            promocoesFiltradas = promocoesFiltradas.filter(p => {
                const produtoNome = (p.product?.name || '').toLowerCase();
                const promocaoId = p.id.toString();
                return produtoNome.includes(this.termoBusca) || promocaoId.includes(this.termoBusca);
            });
        }

        if (promocoesFiltradas.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; padding: 40px; color: #666;">
                    <i class="fa-solid fa-tags" style="font-size: 48px; margin-bottom: 16px; opacity: 0.3;"></i>
                    <p style="font-size: 16px;">Nenhuma promoção encontrada</p>
                </div>
            `;
            return;
        }

        container.innerHTML = promocoesFiltradas.map(promocao => this.createPromocaoCard(promocao)).join('');
    }

    /**
     * Cria card de promoção
     */
    createPromocaoCard(promocao) {
        const produto = promocao.product || {};
        const precoOriginal = parseFloat(produto.price || 0);
        let precoFinal = precoOriginal;
        let descontoTexto = '';

        if (promocao.discount_percentage) {
            precoFinal = precoOriginal * (1 - promocao.discount_percentage / 100);
            descontoTexto = `${promocao.discount_percentage}% OFF`;
        } else if (promocao.discount_value) {
            precoFinal = precoOriginal - parseFloat(promocao.discount_value);
            // ALTERAÇÃO: Prevenir divisão por zero ao calcular percentual
            const percentual = precoOriginal > 0 
                ? ((parseFloat(promocao.discount_value) / precoOriginal) * 100).toFixed(1)
                : '0.0';
            descontoTexto = `R$ ${parseFloat(promocao.discount_value).toFixed(2).replace('.', ',')} OFF (${percentual}%)`;
        }

        precoFinal = Math.max(0, precoFinal);

        const expiresAt = new Date(promocao.expires_at);
        const isExpired = expiresAt <= new Date();
        const statusClass = isExpired ? 'expirada' : 'ativa';
        const statusTexto = isExpired ? 'Expirada' : 'Ativa';

        const dataExpiracao = expiresAt.toLocaleString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

        return `
            <div class="promocao-card" data-promocao-id="${promocao.id}">
                <div class="promocao-header">
                    <div class="promocao-info">
                        <h3>${escapeHTML(produto.name || 'Produto sem nome')}</h3>
                        <span class="status-badge ${statusClass}">${statusTexto}</span>
                    </div>
                    <div class="promocao-actions">
                        <button class="btn-editar-promocao" title="Editar promoção">
                            <i class="fa-solid fa-edit"></i>
                        </button>
                        <button class="btn-excluir-promocao" title="Excluir promoção">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                </div>
                <div class="promocao-body">
                    <div class="promocao-precos">
                        <div class="preco-original">
                            <span class="label">Preço Original:</span>
                            <span class="valor">R$ ${precoOriginal.toFixed(2).replace('.', ',')}</span>
                        </div>
                        <div class="preco-final">
                            <span class="label">Preço com Desconto:</span>
                            <span class="valor">R$ ${precoFinal.toFixed(2).replace('.', ',')}</span>
                        </div>
                        <div class="desconto-badge">
                            <i class="fa-solid fa-tag"></i>
                            ${descontoTexto}
                        </div>
                    </div>
                    <div class="promocao-detalhes">
                        <div class="detalhe-item">
                            <i class="fa-solid fa-calendar"></i>
                            <span>Expira em: ${dataExpiracao}</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Atualiza métricas
     */
    updateMetrics() {
        const now = new Date();
        // ALTERAÇÃO: Otimizado para usar um único loop em vez de dois filtros separados
        const ativas = [];
        const expiradas = [];
        
        this.promocoes.forEach(p => {
            const expiresAt = new Date(p.expires_at);
            if (expiresAt > now) {
                ativas.push(p);
            } else {
                expiradas.push(p);
            }
        });

        // ALTERAÇÃO: Calcular desconto médio das promoções ativas
        let descontoMedio = 0;
        if (ativas.length > 0) {
            const descontos = ativas.map(p => {
                if (p.discount_percentage) {
                    return parseFloat(p.discount_percentage);
                } else if (p.discount_value && p.product && p.product.price) {
                    const preco = parseFloat(p.product.price);
                    // ALTERAÇÃO: Prevenir divisão por zero
                    if (preco > 0) {
                        const valorDesconto = parseFloat(p.discount_value);
                        return (valorDesconto / preco) * 100;
                    }
                }
                return 0;
            }).filter(d => d > 0);
            
            if (descontos.length > 0) {
                const soma = descontos.reduce((acc, d) => acc + d, 0);
                descontoMedio = soma / descontos.length;
            }
        }

        const metricAtivas = document.getElementById('metric-promocoes-ativas');
        const metricExpiradas = document.getElementById('metric-promocoes-expiradas');
        const metricTotal = document.getElementById('metric-total-promocoes');
        const metricDescontoMedio = document.getElementById('metric-desconto-medio');

        if (metricAtivas) metricAtivas.textContent = ativas.length;
        if (metricExpiradas) metricExpiradas.textContent = expiradas.length;
        if (metricTotal) metricTotal.textContent = this.promocoes.length;
        if (metricDescontoMedio) {
            metricDescontoMedio.textContent = descontoMedio > 0 
                ? `${descontoMedio.toFixed(1)}%` 
                : '0%';
        }
    }

    /**
     * Abre modal para nova promoção
     */
    handleNovaPromocao() {
        this.currentPromocaoId = null;
        this.openModal();
    }

    /**
     * Abre modal para editar promoção
     */
    async handleEditarPromocao(promocaoId) {
        try {
            const promocao = await this.dataManager.getPromocaoById(promocaoId);
            this.currentPromocaoId = promocaoId;
            this.openModal(promocao);
        } catch (error) {
            // ALTERAÇÃO: Log condicional apenas em modo debug
            if (window.DEBUG_MODE) {
                console.error('Erro ao carregar promoção:', error);
            }
            toastFromApiError(error, 'Erro ao carregar dados da promoção');
        }
    }

    /**
     * Exclui promoção
     */
    async handleExcluirPromocao(promocaoId) {
        const promocao = this.promocoes.find(p => p.id === promocaoId);
        if (!promocao) return;

        const produtoNome = promocao.product?.name || 'Produto';
        const confirmed = await showConfirm(
            'Excluir Promoção',
            `Tem certeza que deseja excluir a promoção do produto "${produtoNome}"?`,
            'Excluir',
            'Cancelar'
        );

        if (!confirmed) return;

        try {
            const response = await this.dataManager.deletePromocao(promocaoId);
            toastFromApiSuccess(response, 'Promoção excluída com sucesso');
            await this.loadPromocoes();
            this.updateMetrics();
        } catch (error) {
            // ALTERAÇÃO: Log condicional apenas em modo debug
            if (window.DEBUG_MODE) {
                console.error('Erro ao excluir promoção:', error);
            }
            toastFromApiError(error, 'Erro ao excluir promoção');
        }
    }

    /**
     * Abre modal
     */
    openModal(promocao = null) {
        const modal = document.getElementById('modal-promocao');
        if (!modal) return;

        const titulo = document.getElementById('titulo-modal-promocao');
        const textoBotao = document.getElementById('texto-botao-promocao');
        const selectProduto = document.getElementById('produto-promocao');
        const descontoPercentual = document.getElementById('desconto-percentual');
        const descontoValor = document.getElementById('desconto-valor');
        const dataExpiracao = document.getElementById('data-expiracao-promocao');

        // Limpar formulário e classes de validação
        if (selectProduto) selectProduto.value = '';
        if (descontoPercentual) {
            descontoPercentual.value = '';
            descontoPercentual.classList.remove('error', 'success');
        }
        if (descontoValor) {
            descontoValor.value = '';
            descontoValor.classList.remove('error', 'success');
        }
        if (dataExpiracao) {
            // Definir data mínima como agora
            const now = new Date();
            now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
            dataExpiracao.min = now.toISOString().slice(0, 16);
            dataExpiracao.value = '';
            dataExpiracao.classList.remove('error', 'success');
        }

        // Preencher produtos
        if (selectProduto) {
            selectProduto.innerHTML = '<option value="">Selecione um produto</option>' +
                this.produtos.map(p => 
                    `<option value="${p.id}" data-preco="${p.price}">${escapeHTML(p.name)}</option>`
                ).join('');
        }

        // Preencher dados se for edição
        if (promocao) {
            if (titulo) titulo.textContent = 'Editar Promoção';
            if (textoBotao) textoBotao.textContent = 'Salvar';
            if (selectProduto) selectProduto.value = promocao.product_id;
            if (dataExpiracao) {
                // ALTERAÇÃO: Backend retorna como está (sem timezone), exibir diretamente
                // O input datetime-local espera formato "YYYY-MM-DDTHH:mm" (hora local, sem timezone)
                const expiresAt = promocao.expires_at;
                // Se for string ISO, extrair apenas a parte de data/hora
                if (typeof expiresAt === 'string') {
                    // Remover timezone e milissegundos se presentes
                    const dateTimeStr = expiresAt.split('.')[0].split('+')[0].split('Z')[0];
                    // Formato esperado: YYYY-MM-DDTHH:mm ou YYYY-MM-DDTHH:mm:ss
                    dataExpiracao.value = dateTimeStr.slice(0, 16); // Pega apenas YYYY-MM-DDTHH:mm
                } else {
                    // Se for Date object, formatar
                    const date = new Date(expiresAt);
                    const year = date.getFullYear();
                    const month = String(date.getMonth() + 1).padStart(2, '0');
                    const day = String(date.getDate()).padStart(2, '0');
                    const hours = String(date.getHours()).padStart(2, '0');
                    const minutes = String(date.getMinutes()).padStart(2, '0');
                    dataExpiracao.value = `${year}-${month}-${day}T${hours}:${minutes}`;
                }
            }

            if (promocao.discount_percentage) {
                const radioPercentual = document.querySelector('input[name="tipo-desconto"][value="percentual"]');
                if (radioPercentual) radioPercentual.checked = true;
                this.handleTipoDescontoChange('percentual');
                if (descontoPercentual) {
                    descontoPercentual.value = parseFloat(promocao.discount_percentage).toFixed(2).replace('.', ',');
                    this.validatePercentualInput(descontoPercentual);
                }
            } else if (promocao.discount_value) {
                const radioValor = document.querySelector('input[name="tipo-desconto"][value="valor"]');
                if (radioValor) radioValor.checked = true;
                this.handleTipoDescontoChange('valor');
                if (descontoValor) {
                    const valorFormatado = parseFloat(promocao.discount_value).toLocaleString('pt-BR', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                    });
                    descontoValor.value = valorFormatado;
                    this.validateCurrencyInput(descontoValor);
                }
            }
            
            // Validar data ao carregar
            if (dataExpiracao && dataExpiracao.value) {
                this.validateDataExpiracao(dataExpiracao);
            }

            this.handleProdutoChange();
            this.calculatePrecoFinal();
        } else {
            if (titulo) titulo.textContent = 'Adicionar Promoção';
            if (textoBotao) textoBotao.textContent = 'Adicionar';
            const radioPercentual = document.querySelector('input[name="tipo-desconto"][value="percentual"]');
            if (radioPercentual) radioPercentual.checked = true;
            
            // Garantir que o campo percentual está visível inicialmente
            const divPercentual = document.getElementById('div-desconto-percentual');
            const divValor = document.getElementById('div-desconto-valor');
            if (divPercentual) {
                divPercentual.style.display = 'flex';
                divPercentual.style.visibility = 'visible';
                divPercentual.style.opacity = '1';
            }
            if (divValor) {
                divValor.style.display = 'none';
                divValor.style.visibility = 'hidden';
                divValor.style.opacity = '0';
            }
            
            this.handleTipoDescontoChange('percentual');
        }

        abrirModal('modal-promocao');
    }

    /**
     * Fecha modal
     */
    closeModal() {
        fecharModal('modal-promocao');
        this.currentPromocaoId = null;
    }

    /**
     * Manipula mudança de tipo de desconto
     */
    handleTipoDescontoChange(tipo) {
        const divPercentual = document.getElementById('div-desconto-percentual');
        const divValor = document.getElementById('div-desconto-valor');

        if (tipo === 'percentual') {
            if (divPercentual) {
                divPercentual.style.display = 'flex';
                divPercentual.style.visibility = 'visible';
                divPercentual.style.opacity = '1';
            }
            if (divValor) {
                divValor.style.display = 'none';
                divValor.style.visibility = 'hidden';
                divValor.style.opacity = '0';
            }
        } else {
            if (divPercentual) {
                divPercentual.style.display = 'none';
                divPercentual.style.visibility = 'hidden';
                divPercentual.style.opacity = '0';
            }
            if (divValor) {
                divValor.style.display = 'flex';
                divValor.style.visibility = 'visible';
                divValor.style.opacity = '1';
            }
        }

        this.calculatePrecoFinal();
    }

    /**
     * Manipula mudança de produto
     */
    handleProdutoChange() {
        const selectProduto = document.getElementById('produto-promocao');
        if (!selectProduto) return;

        const selectedOption = selectProduto.options[selectProduto.selectedIndex];
        if (selectedOption && selectedOption.value) {
            const infoPromocao = document.getElementById('info-promocao');
            if (infoPromocao) infoPromocao.style.display = 'block';
            this.calculatePrecoFinal();
        } else {
            const infoPromocao = document.getElementById('info-promocao');
            if (infoPromocao) infoPromocao.style.display = 'none';
        }
    }

    /**
     * Calcula preço final
     */
    calculatePrecoFinal() {
        const selectProduto = document.getElementById('produto-promocao');
        const tipoDesconto = document.querySelector('input[name="tipo-desconto"]:checked')?.value;
        const descontoPercentual = document.getElementById('desconto-percentual');
        const descontoValor = document.getElementById('desconto-valor');
        const precoOriginalEl = document.getElementById('preco-original-promocao');
        const precoFinalEl = document.getElementById('preco-com-desconto-promocao');

        if (!selectProduto || !selectProduto.value) return;

        const selectedOption = selectProduto.options[selectProduto.selectedIndex];
        const precoOriginal = parseFloat(selectedOption.dataset.preco || 0);

        if (precoOriginalEl) {
            precoOriginalEl.textContent = `R$ ${precoOriginal.toFixed(2).replace('.', ',')}`;
        }

        let precoFinal = precoOriginal;

        if (tipoDesconto === 'percentual' && descontoPercentual && descontoPercentual.value) {
            const percentual = parseFloat(descontoPercentual.value);
            precoFinal = precoOriginal * (1 - percentual / 100);
        } else if (tipoDesconto === 'valor' && descontoValor && descontoValor.value) {
            const valorDesconto = parseFloat(descontoValor.value.replace(',', '.'));
            precoFinal = precoOriginal - valorDesconto;
        }

        precoFinal = Math.max(0, precoFinal);

        if (precoFinalEl) {
            precoFinalEl.textContent = `R$ ${precoFinal.toFixed(2).replace('.', ',')}`;
        }
    }

    /**
     * Salva promoção
     */
    async savePromocao() {
        const selectProduto = document.getElementById('produto-promocao');
        const tipoDesconto = document.querySelector('input[name="tipo-desconto"]:checked')?.value;
        const descontoPercentual = document.getElementById('desconto-percentual');
        const descontoValor = document.getElementById('desconto-valor');
        const dataExpiracao = document.getElementById('data-expiracao-promocao');

        // Validações
        if (!selectProduto || !selectProduto.value) {
            showToast('Selecione um produto', 'error');
            return;
        }

        if (!dataExpiracao || !dataExpiracao.value) {
            showToast('Informe a data de expiração', 'error');
            return;
        }

        let discount_percentage = null;
        let discount_value = null;

        if (tipoDesconto === 'percentual') {
            if (!descontoPercentual || !descontoPercentual.value) {
                showToast('Informe o percentual de desconto', 'error');
                descontoPercentual?.focus();
                return;
            }
            const percentual = parseFloat(descontoPercentual.value.replace(',', '.'));
            if (isNaN(percentual)) {
                showToast('Percentual de desconto inválido', 'error');
                descontoPercentual?.focus();
                return;
            }
            if (percentual < 0 || percentual > 100) {
                showToast('Percentual deve estar entre 0 e 100', 'error');
                descontoPercentual?.focus();
                return;
            }
            discount_percentage = percentual;
        } else {
            if (!descontoValor || !descontoValor.value) {
                showToast('Informe o valor do desconto', 'error');
                descontoValor?.focus();
                return;
            }
            const valor = parseFloat(descontoValor.value.replace(/[^\d,]/g, '').replace(',', '.'));
            if (isNaN(valor)) {
                showToast('Valor de desconto inválido', 'error');
                descontoValor?.focus();
                return;
            }
            if (valor <= 0) {
                showToast('Valor do desconto deve ser maior que zero', 'error');
                descontoValor?.focus();
                return;
            }
            discount_value = valor;
        }

        // ALTERAÇÃO: Validação consolidada - validateDataExpiracao já faz todas as verificações necessárias
        if (!this.validateDataExpiracao(dataExpiracao)) {
            dataExpiracao?.focus();
            return;
        }

        // ALTERAÇÃO: datetime-local retorna hora local, enviar como está (sem conversão de timezone)
        // O input datetime-local retorna formato "YYYY-MM-DDTHH:mm" (sem timezone, hora local)
        // Enviar diretamente adicionando segundos e Z para indicar que é a hora exata desejada
        const localDateTime = dataExpiracao.value; // Ex: "2025-11-15T13:00"
        // Adicionar segundos e indicar UTC (mas sem converter, mantendo o horário exato)
        const expiresAtISO = `${localDateTime}:00Z`;

        // ALTERAÇÃO: Validação de product_id para prevenir valores inválidos
        const productId = parseInt(selectProduto.value, 10);
        if (isNaN(productId) || productId <= 0) {
            showToast('Produto inválido', 'error');
            selectProduto?.focus();
            return;
        }

        // ALTERAÇÃO: Backend requer conversion_method ('reais' ou 'porcento')
        const promocaoData = {
            product_id: productId,
            expires_at: expiresAtISO
        };

        if (discount_percentage !== null) {
            promocaoData.discount_percentage = discount_percentage;
            promocaoData.conversion_method = 'porcento';
        } else {
            promocaoData.discount_value = discount_value;
            promocaoData.conversion_method = 'reais';
        }

        try {
            let response;
            if (this.currentPromocaoId) {
                response = await this.dataManager.updatePromocao(this.currentPromocaoId, promocaoData);
                toastFromApiSuccess(response, 'Promoção atualizada com sucesso');
            } else {
                try {
                    response = await this.dataManager.addPromocao(promocaoData);
                    toastFromApiSuccess(response, 'Promoção criada com sucesso');
                } catch (error) {
                    // ALTERAÇÃO: Se já existe promoção para este produto (erro 409), buscar e atualizar
                    if (error.status === 409 || (error.message && error.message.includes('Já existe uma promoção'))) {
                        // Buscar promoção existente pelo product_id (incluindo expiradas)
                        const promocaoExistente = await this.dataManager.getPromocaoByProductId(productId, true);
                        if (promocaoExistente && promocaoExistente.id) {
                            // Atualizar promoção existente
                            response = await this.dataManager.updatePromocao(promocaoExistente.id, promocaoData);
                            // ALTERAÇÃO: Mensagem mais clara indicando que foi atualizada automaticamente
                            toastFromApiSuccess(response, 'Promoção atualizada automaticamente (produto já possuía promoção)');
                        } else {
                            throw error; // Se não encontrou, lança o erro original
                        }
                    } else {
                        throw error; // Outros erros, lança normalmente
                    }
                }
            }

            this.closeModal();
            await this.loadPromocoes();
            this.updateMetrics();
        } catch (error) {
            // ALTERAÇÃO: Removido console.error para produção, mantendo apenas tratamento de erro via toast
            if (window.DEBUG_MODE) {
                console.error('Erro ao salvar promoção:', error);
            }
            toastFromApiError(error, 'Erro ao salvar promoção');
        }
    }

    /**
     * Mostra mensagem de erro
     */
    showErrorMessage(message) {
        showToast(message, 'error');
    }

    /**
     * Formata input de moeda (R$)
     */
    formatCurrencyInput(input) {
        let value = input.value.replace(/\D/g, '');
        if (value) {
            const valorEmReais = parseInt(value) / 100;
            value = valorEmReais.toLocaleString('pt-BR', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            });
        } else {
            value = '';
        }
        input.value = value;
    }

    /**
     * Valida input de moeda
     */
    validateCurrencyInput(input) {
        const value = input.value.replace(/[^\d,]/g, '').replace(',', '.');
        const numValue = parseFloat(value);
        
        if (input.value && (isNaN(numValue) || numValue <= 0)) {
            input.classList.add('error');
            input.classList.remove('success');
            return false;
        } else if (input.value) {
            input.classList.remove('error');
            input.classList.add('success');
            return true;
        } else {
            input.classList.remove('error', 'success');
            return false;
        }
    }

    /**
     * Formata input de percentual (%)
     */
    formatPercentualInput(input) {
        let value = input.value.replace(/[^\d,]/g, '');
        
        // Permite apenas números e vírgula
        if (value.includes(',')) {
            const parts = value.split(',');
            if (parts.length > 2) {
                // Múltiplas vírgulas, manter apenas a primeira
                value = parts[0] + ',' + parts.slice(1).join('');
            }
            // Limitar a 2 casas decimais após a vírgula
            if (parts[1] && parts[1].length > 2) {
                value = parts[0] + ',' + parts[1].substring(0, 2);
            }
        }
        
        // Limitar valor máximo a 100
        const numValue = parseFloat(value.replace(',', '.'));
        if (!isNaN(numValue) && numValue > 100) {
            value = '100,00';
        }
        
        input.value = value;
    }

    /**
     * Valida input de percentual
     */
    validatePercentualInput(input) {
        const value = input.value.replace(',', '.');
        const numValue = parseFloat(value);
        
        if (input.value && (isNaN(numValue) || numValue < 0 || numValue > 100)) {
            input.classList.add('error');
            input.classList.remove('success');
            if (numValue > 100) {
                input.value = '100,00';
                input.classList.remove('error');
                input.classList.add('success');
                return true;
            }
            return false;
        } else if (input.value) {
            input.classList.remove('error');
            input.classList.add('success');
            return true;
        } else {
            input.classList.remove('error', 'success');
            return false;
        }
    }

    /**
     * Valida data de expiração
     */
    validateDataExpiracao(input) {
        if (!input.value) {
            input.classList.remove('error', 'success');
            return false;
        }

        // ALTERAÇÃO: Parse correto da data local do input datetime-local
        const localDateTime = input.value; // Ex: "2025-11-15T14:30"
        const [datePart, timePart] = localDateTime.split('T');
        const [year, month, day] = datePart.split('-').map(Number);
        const [hours, minutes] = timePart.split(':').map(Number);
        // Criar Date object como hora local
        const selectedDate = new Date(year, month - 1, day, hours, minutes);
        const now = new Date();
        
        // Verificar se a data é válida
        if (isNaN(selectedDate.getTime())) {
            input.classList.add('error');
            input.classList.remove('success');
            showToast('Data de expiração inválida', 'error');
            return false;
        }

        // Verificar se a data não é no passado
        if (selectedDate <= now) {
            input.classList.add('error');
            input.classList.remove('success');
            showToast('Data de expiração deve ser no futuro', 'error');
            return false;
        }

        // Verificar se a data não é muito distante (opcional - 10 anos)
        const maxDate = new Date();
        maxDate.setFullYear(maxDate.getFullYear() + 10);
        if (selectedDate > maxDate) {
            input.classList.add('error');
            input.classList.remove('success');
            showToast('Data de expiração não pode ser mais de 10 anos no futuro', 'error');
            return false;
        }

        input.classList.remove('error');
        input.classList.add('success');
        return true;
    }
}

// Instância global do gerenciador
let promocaoManager = null;

/**
 * Inicializa o módulo quando a seção de promoções é exibida
 */
export async function initPromocoesManager() {
    if (!promocaoManager) {
        promocaoManager = new PromocaoManager();
    }
    await promocaoManager.init();
}

// Inicializa automaticamente se a seção estiver visível
document.addEventListener('DOMContentLoaded', () => {
    const secaoPromocoes = document.getElementById('secao-promocoes');
    if (secaoPromocoes && secaoPromocoes.style.display !== 'none') {
        initPromocoesManager();
    }
});

