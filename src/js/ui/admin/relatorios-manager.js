/**
 * Relatórios Manager - Gerenciador da Seção de Relatórios
 * Responsável por carregar, visualizar e exportar relatórios
 */

import { getAvailableReports, generatePDFReport, getDetailedFinancialReport } from '../../api/reports.js';
import { formatDateForAPI, formatDateForDisplay, formatDateForISO } from '../../utils/date-formatter.js';
import { showToast } from '../alerts.js';
import { abrirModal, fecharModal } from '../modais.js';
import { escapeHTML } from '../../utils/html-sanitizer.js';
import { formatCurrency } from '../../api/dashboard.js';
import { gerenciarInputsEspecificos } from '../../utils.js';

class RelatoriosManager {
    constructor() {
        this.container = document.getElementById('secao-relatorios');
        this.isInitialized = false;
        this.currentTab = 'vendas';
        this.currentPeriod = 'month';
        this.filters = {
            start_date: null,
            end_date: null
        };
        this.availableReports = [];
        this.currentReport = null;
        // ALTERAÇÃO: Cache de relatórios para melhorar performance
        this.reportCache = new Map();
        this.cacheTimeout = 5 * 60 * 1000; // 5 minutos
    }

    /**
     * Inicializa o manager de relatórios
     */
    async init() {
        if (this.isInitialized) return;
        
        try {
            if (!this.container) {
                // ALTERAÇÃO: Log condicional apenas em modo debug
                if (typeof window !== 'undefined' && window.DEBUG_MODE) {
                    console.warn('[Relatórios] Seção não encontrada');
                }
                return;
            }

            this.setupEventListeners();
            await this.loadAvailableReports();
            this.updatePeriodDates();
            
            this.isInitialized = true;
        } catch (error) {
            // ALTERAÇÃO: Log condicional apenas em modo debug
            if (typeof window !== 'undefined' && window.DEBUG_MODE) {
                console.error('[Relatórios] Erro ao inicializar:', error);
            }
            this.showError('Erro ao carregar seção de relatórios');
        }
    }

    /**
     * Configura event listeners
     */
    setupEventListeners() {
        // Filtro de período
        const periodoSelect = document.getElementById('filtro-periodo-relatorio');
        if (periodoSelect) {
            periodoSelect.addEventListener('change', (e) => {
                this.currentPeriod = e.target.value;
                this.handlePeriodChange();
            });
        }

        // Botão aplicar filtros
        const btnAplicar = document.getElementById('btn-aplicar-filtros-relatorio');
        if (btnAplicar) {
            btnAplicar.addEventListener('click', () => {
                this.applyFilters();
            });
        }

        // Tabs de categorias
        const tabButtons = document.querySelectorAll('.relatorios-tabs .tab-btn');
        tabButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tab = e.currentTarget.dataset.tab;
                this.switchTab(tab);
            });
        });

        // Botões de ação dos cards de relatório
        if (this.container) {
            this.container.addEventListener('click', (e) => {
                const card = e.target.closest('.relatorio-card');
                if (!card) return;

                const reportType = card.dataset.reportType;
                const action = e.target.closest('[data-action]')?.dataset.action;

                if (action === 'export') {
                    this.exportReport(reportType);
                }
            });
        }

        // Modal de relatório
        const btnFechar = document.getElementById('fechar-modal-relatorio');
        if (btnFechar) {
            btnFechar.addEventListener('click', () => {
                this.closeReportModal();
            });
        }

        const btnFecharFooter = document.getElementById('btn-fechar-relatorio');
        if (btnFecharFooter) {
            btnFecharFooter.addEventListener('click', () => {
                this.closeReportModal();
            });
        }

        const btnExportarModal = document.getElementById('btn-exportar-relatorio-modal');
        if (btnExportarModal) {
            btnExportarModal.addEventListener('click', () => {
                if (this.currentReport) {
                    this.exportReport(this.currentReport.type);
                }
            });
        }
    }

    /**
     * Atualiza datas baseado no período selecionado
     */
    updatePeriodDates() {
        const today = new Date();
        let startDate, endDate;

        switch (this.currentPeriod) {
            case 'today':
                startDate = new Date(today);
                endDate = new Date(today);
                break;
            case 'week':
                startDate = new Date(today);
                startDate.setDate(today.getDate() - 7);
                endDate = new Date(today);
                break;
            case 'month':
                startDate = new Date(today.getFullYear(), today.getMonth(), 1);
                endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
                break;
            case 'last_month':
                startDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
                endDate = new Date(today.getFullYear(), today.getMonth(), 0);
                break;
            case 'quarter':
                const quarter = Math.floor(today.getMonth() / 3);
                startDate = new Date(today.getFullYear(), quarter * 3, 1);
                endDate = new Date(today.getFullYear(), (quarter + 1) * 3, 0);
                break;
            case 'year':
                startDate = new Date(today.getFullYear(), 0, 1);
                endDate = new Date(today.getFullYear(), 11, 31);
                break;
            case 'custom':
                // Datas personalizadas serão preenchidas pelo usuário
                return;
            default:
                startDate = new Date(today.getFullYear(), today.getMonth(), 1);
                endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        }

        this.filters.start_date = formatDateForISO(startDate);
        this.filters.end_date = formatDateForISO(endDate);

        // Atualizar inputs de data se existirem
        const inputInicio = document.getElementById('data-inicio-relatorio');
        const inputFim = document.getElementById('data-fim-relatorio');
        if (inputInicio) inputInicio.value = this.filters.start_date;
        if (inputFim) inputFim.value = this.filters.end_date;
    }

    /**
     * Manipula mudança de período
     */
    handlePeriodChange() {
        const customDatesContainer = document.getElementById('custom-dates');
        const customDatesEndContainer = document.getElementById('custom-dates-end');

        if (this.currentPeriod === 'custom') {
            if (customDatesContainer) customDatesContainer.style.display = 'block';
            if (customDatesEndContainer) customDatesEndContainer.style.display = 'block';
        } else {
            if (customDatesContainer) customDatesContainer.style.display = 'none';
            if (customDatesEndContainer) customDatesEndContainer.style.display = 'none';
            this.updatePeriodDates();
        }
    }

    /**
     * Aplica filtros selecionados
     */
    applyFilters() {
        if (this.currentPeriod === 'custom') {
            const inputInicio = document.getElementById('data-inicio-relatorio');
            const inputFim = document.getElementById('data-fim-relatorio');
            
            if (!inputInicio?.value || !inputFim?.value) {
                showToast('Selecione as datas de início e fim', { type: 'error' });
                return;
            }

            this.filters.start_date = inputInicio.value;
            this.filters.end_date = inputFim.value;
        }

        // Validar que data início não é maior que data fim
        if (new Date(this.filters.start_date) > new Date(this.filters.end_date)) {
            showToast('Data de início não pode ser maior que data de fim', { type: 'error' });
            return;
        }

        showToast('Filtros aplicados', { type: 'success' });
        // Limpar cache quando filtros mudam
        this.reportCache.clear();
    }

    /**
     * Alterna entre tabs de categorias
     * @param {string} tab - Nome da tab (vendas, financeiro, operacional, etc.)
     */
    switchTab(tab) {
        // Remover active de todas as tabs
        document.querySelectorAll('.relatorios-tabs .tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelectorAll('.relatorio-tab-content').forEach(content => {
            content.classList.remove('active');
        });

        // Ativar tab selecionada
        const tabButton = document.querySelector(`[data-tab="${tab}"]`);
        const tabContent = document.getElementById(`tab-${tab}`);

        if (tabButton) tabButton.classList.add('active');
        if (tabContent) tabContent.classList.add('active');

        this.currentTab = tab;
    }

    /**
     * Carrega lista de relatórios disponíveis da API
     */
    async loadAvailableReports() {
        try {
            const response = await getAvailableReports();
            
            if (response.success) {
                this.availableReports = response.data;
                // Não renderizar cards novamente pois já estão no HTML
                // Se necessário, renderizar baseado nos disponíveis
                // this.renderReportCards();
            } else {
                showToast('Erro ao carregar relatórios disponíveis', { type: 'error' });
            }
        } catch (error) {
            // ALTERAÇÃO: Log condicional apenas em modo debug
            if (typeof window !== 'undefined' && window.DEBUG_MODE) {
                console.error('[Relatórios] Erro ao carregar relatórios:', error);
            }
            showToast('Erro ao carregar relatórios', { type: 'error' });
        }
    }

    /**
     * Visualiza relatório em modal
     * @param {string} reportType - Tipo de relatório
     */
    async viewReport(reportType) {
        try {
            // Abrir modal
            const modal = document.getElementById('modal-relatorio');
            if (modal) {
                abrirModal('modal-relatorio');
                
                // ALTERAÇÃO: Gerenciar inputs da modal usando utils.js
                const inputs = modal.querySelectorAll('input, select, textarea');
                if (inputs.length > 0) {
                    gerenciarInputsEspecificos(inputs);
                }
            }

            const modalBody = document.getElementById('modal-relatorio-body');
            const modalTitulo = document.getElementById('modal-relatorio-titulo');

            // Mostrar loading
            if (modalBody) {
                modalBody.innerHTML = `
                    <div class="loading-container">
                        <i class="fa-solid fa-spinner fa-spin"></i>
                        <p>Carregando relatório...</p>
                    </div>
                `;
            }

            // Buscar dados do relatório
            const report = this.availableReports.find(r => r.type === reportType);
            
            // ALTERAÇÃO: Se não encontrar no availableReports, usar nome do card
            const reportCard = document.querySelector(`[data-report-type="${reportType}"]`);
            const reportName = reportCard?.querySelector('h3')?.textContent || reportType;

            if (modalTitulo) {
                modalTitulo.textContent = reportName;
            }

            // Carregar dados baseado no tipo
            let reportData = null;

            if (reportType === 'financial_complete' || reportType === 'financial_detailed') {
                // Usar endpoint JSON para relatório financeiro
                const startDateBR = formatDateForAPI(this.filters.start_date);
                const endDateBR = formatDateForAPI(this.filters.end_date);
                
                const response = await getDetailedFinancialReport(startDateBR, endDateBR);
                if (response.success) {
                    reportData = response.data;
                }
            } else {
                // Para outros relatórios, informar que visualização está disponível apenas via PDF
                if (modalBody) {
                    modalBody.innerHTML = `
                        <div class="info-container">
                            <i class="fa-solid fa-info-circle"></i>
                            <p>Visualização disponível apenas para relatório financeiro.</p>
                            <p>Use o botão "Exportar PDF" para visualizar outros relatórios.</p>
                        </div>
                    `;
                }
                this.currentReport = { type: reportType, data: null };
                return;
            }

            // Renderizar relatório
            if (reportData) {
                this.renderReportData(reportData, reportType);
                this.currentReport = { type: reportType, data: reportData };
            } else {
                throw new Error('Erro ao carregar dados do relatório');
            }

        } catch (error) {
            // ALTERAÇÃO: Log condicional apenas em modo debug
            if (typeof window !== 'undefined' && window.DEBUG_MODE) {
                console.error('[Relatórios] Erro ao visualizar relatório:', error);
            }
            showToast('Erro ao carregar relatório', { type: 'error' });
            
            const modalBody = document.getElementById('modal-relatorio-body');
            if (modalBody) {
                modalBody.innerHTML = `
                    <div class="error-container">
                        <i class="fa-solid fa-exclamation-triangle"></i>
                        <p>Erro ao carregar relatório: ${escapeHTML(error.message)}</p>
                    </div>
                `;
            }
        }
    }

    /**
     * Renderiza dados do relatório no modal
     * @param {Object} data - Dados do relatório
     * @param {string} reportType - Tipo de relatório
     */
    renderReportData(data, reportType) {
        const modalBody = document.getElementById('modal-relatorio-body');
        if (!modalBody) return;

        // Renderizar baseado no tipo
        if (reportType === 'financial_complete' || reportType === 'financial_detailed') {
            this.renderFinancialReport(data);
        } else {
            modalBody.innerHTML = '<p>Visualização não disponível para este tipo de relatório</p>';
        }
    }

    /**
     * Renderiza relatório financeiro
     * @param {Object} data - Dados do relatório financeiro
     */
    renderFinancialReport(data) {
        const modalBody = document.getElementById('modal-relatorio-body');
        if (!modalBody) return;

        // Estrutura do relatório financeiro
        let html = `
            <div class="report-view">
                <div class="report-header">
                    <h3>Relatório Financeiro</h3>
                    <p class="report-period">
                        Período: ${escapeHTML(formatDateForDisplay(this.filters.start_date))} até ${escapeHTML(formatDateForDisplay(this.filters.end_date))}
                    </p>
                </div>

                <div class="report-summary">
                    <div class="summary-card">
                        <h4>Receita Total</h4>
                        <p class="summary-value positive">${escapeHTML(formatCurrency(data.total_revenue || 0))}</p>
                    </div>
                    <div class="summary-card">
                        <h4>Despesas Total</h4>
                        <p class="summary-value negative">${escapeHTML(formatCurrency(data.total_expenses || 0))}</p>
                    </div>
                    <div class="summary-card">
                        <h4>Lucro Líquido</h4>
                        <p class="summary-value ${(data.net_profit || 0) >= 0 ? 'positive' : 'negative'}">
                            ${escapeHTML(formatCurrency(data.net_profit || 0))}
                        </p>
                    </div>
                </div>

                ${data.charts ? this.renderChartsHTML(data.charts) : ''}
                ${data.details ? this.renderDetailsHTML(data.details) : ''}
            </div>
        `;

        modalBody.innerHTML = html;

        // Renderizar gráficos se Chart.js estiver disponível
        if (typeof Chart !== 'undefined' && data.charts) {
            this.renderReportCharts(data.charts);
        }
    }

    /**
     * Renderiza HTML de gráficos
     * @param {Object} charts - Dados dos gráficos
     * @returns {string} HTML dos gráficos
     */
    renderChartsHTML(charts) {
        // TODO: REVISAR - Implementar renderização de gráficos Chart.js
        return '<div class="report-charts"><p>Gráficos serão renderizados aqui</p></div>';
    }

    /**
     * Renderiza HTML de detalhes
     * @param {Object} details - Detalhes do relatório
     * @returns {string} HTML dos detalhes
     */
    renderDetailsHTML(details) {
        // TODO: REVISAR - Implementar renderização de detalhes
        return '<div class="report-details"><p>Detalhes do relatório</p></div>';
    }

    /**
     * Renderiza gráficos do relatório usando Chart.js
     * @param {Object} charts - Dados dos gráficos
     */
    renderReportCharts(charts) {
        // TODO: REVISAR - Implementar renderização de gráficos Chart.js
        // Exemplo: gráfico de receitas vs despesas, tendências, etc.
    }

    /**
     * Exporta relatório em PDF
     * @param {string} reportType - Tipo de relatório
     */
    async exportReport(reportType) {
        try {
            showToast('Gerando PDF...', { type: 'info' });

            // Verificar se está em cache
            const cacheKey = this.getCacheKey(reportType, this.filters);
            if (this.isCached(reportType, this.filters)) {
                const cached = this.reportCache.get(cacheKey);
                this.downloadPDF(cached.blob, cached.filename);
                showToast('PDF gerado com sucesso (cache)', { type: 'success' });
                return;
            }

            const response = await generatePDFReport(reportType, this.filters);

            if (response.success && response.blob) {
                // Salvar em cache
                this.reportCache.set(cacheKey, {
                    blob: response.blob,
                    filename: response.filename,
                    timestamp: Date.now()
                });

                this.downloadPDF(response.blob, response.filename);
                showToast('PDF gerado com sucesso', { type: 'success' });
            } else {
                throw new Error(response.error || 'Erro ao gerar PDF');
            }
        } catch (error) {
            // ALTERAÇÃO: Log condicional apenas em modo debug
            if (typeof window !== 'undefined' && window.DEBUG_MODE) {
                console.error('[Relatórios] Erro ao exportar relatório:', error);
            }
            showToast(`Erro ao exportar: ${error.message}`, { type: 'error' });
        }
    }

    /**
     * Faz download do PDF
     * @param {Blob} blob - Blob do PDF
     * @param {string} filename - Nome do arquivo
     */
    downloadPDF(blob, filename) {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename || `relatorio.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    }

    /**
     * Fecha modal de relatório
     */
    closeReportModal() {
        const modal = document.getElementById('modal-relatorio');
        if (modal) {
            fecharModal('modal-relatorio');
        }
        this.currentReport = null;
    }

    /**
     * Gera chave de cache baseada em tipo e filtros
     * @param {string} reportType - Tipo de relatório
     * @param {Object} filters - Filtros do relatório
     * @returns {string} Chave de cache
     */
    getCacheKey(reportType, filters) {
        return `${reportType}_${JSON.stringify(filters)}`;
    }

    /**
     * Verifica se relatório está em cache
     * @param {string} reportType - Tipo de relatório
     * @param {Object} filters - Filtros do relatório
     * @returns {boolean} True se está em cache e válido
     */
    isCached(reportType, filters) {
        const key = this.getCacheKey(reportType, filters);
        const cached = this.reportCache.get(key);
        
        if (!cached) return false;
        
        // Verificar se cache expirou
        if (Date.now() - cached.timestamp > this.cacheTimeout) {
            this.reportCache.delete(key);
            return false;
        }
        
        return true;
    }

    /**
     * Exibe mensagem de erro
     * @param {string} message - Mensagem de erro
     */
    showError(message) {
        showToast(message, { type: 'error' });
    }

    /**
     * Cleanup ao sair da seção
     */
    cleanup() {
        // Limpar event listeners se necessário
        this.currentReport = null;
    }
}

export default RelatoriosManager;

