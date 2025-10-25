// src/js/ui/clube-royal.js
// Gerenciamento da página do Clube Royal

import { getLoyaltyBalance, getLoyaltyHistory } from '../api/loyalty.js';

// Constantes para validação e limites
const VALIDATION_LIMITS = {
    MAX_POINTS: 999999,
    MIN_POINTS: 0,
    MAX_HISTORY_ITEMS: 1000,
    MAX_DESCRIPTION_LENGTH: 500
};

(function initClubeRoyalPage() {
    if (!window.location.pathname.includes('clube-royal.html')) return;

    const state = {
        pontosAtuais: 0,
        pontosExpiram: null,
        historico: [],
        usuario: null,
        loading: false,
        error: null
    };

    // Refs DOM
    const el = {
        secaoExplicacao: document.getElementById('secao-explicacao'),
        secaoHistorico: document.getElementById('secao-historico'),
        btnAlternar: document.getElementById('btn-alternar'),
        pontosAtuais: document.getElementById('pontos-atual'),
        diasExpiram: document.getElementById('dias-expiram'),
        vencimentoDias: document.getElementById('vencimento-dias'),
        historicoContainer: document.getElementById('historico-container')
    };

    // Utils - com cache para performance
    const formatBRL = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
    
    // Cache para formatação de datas
    const dateFormatter = new Intl.DateTimeFormat('pt-BR', { 
        day: '2-digit', 
        month: '2-digit', 
        year: 'numeric' 
    });
    const formatDate = (date) => {
        try {
            return dateFormatter.format(new Date(date));
        } catch (error) {
            console.warn('Erro ao formatar data:', error);
            return 'Data inválida';
        }
    };

    /**
     * Sanitiza texto para evitar XSS
     * @param {any} text - Texto a ser sanitizado
     * @returns {string} Texto sanitizado
     */
    function escapeHTML(text) {
        if (typeof text !== 'string') return String(text || '');
        
        // Usar DOMPurify se disponível, senão usar método básico
        if (typeof DOMPurify !== 'undefined') {
            return DOMPurify.sanitize(text);
        }
        
        // Método básico de sanitização
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#x27;')
            .replace(/\//g, '&#x2F;');
    }

    /**
     * Valida se um ID de usuário é válido
     * @param {any} userId - ID a ser validado
     * @returns {boolean} True se válido
     */
    function isValidUserId(userId) {
        return userId !== null && userId !== undefined && 
               Number.isInteger(Number(userId)) && Number(userId) > 0;
    }

    /**
     * Valida se uma quantidade de pontos é válida
     * @param {any} points - Pontos a serem validados
     * @returns {boolean} True se válidos
     */
    function isValidPoints(points) {
        const numPoints = Number(points);
        return Number.isInteger(numPoints) && 
               numPoints >= VALIDATION_LIMITS.MIN_POINTS && 
               numPoints <= VALIDATION_LIMITS.MAX_POINTS;
    }

    /**
     * Valida se uma data é válida
     * @param {any} date - Data a ser validada
     * @returns {boolean} True se válida
     */
    function isValidDate(date) {
        return date instanceof Date && !isNaN(date.getTime());
    }

    // Debounce para evitar múltiplas chamadas
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    // Carregar dados do usuário
    function carregarUsuario() {
        try {
            if (typeof window.getStoredUser === 'function') {
                const usuario = window.getStoredUser();
                
                // Validar dados do usuário
                if (usuario && isValidUserId(usuario.id)) {
                    state.usuario = usuario;
                } else {
                    throw new Error('Dados do usuário inválidos');
                }
            } else {
                throw new Error('Função getStoredUser não disponível');
            }
        } catch (err) {
            // TODO: Implementar logging estruturado em produção
            console.error('Erro ao carregar usuário:', err.message);
            state.usuario = null;
        }
    }

    // Carregar pontos do usuário via API
    async function carregarPontos() {
        if (!state.usuario || !isValidUserId(state.usuario.id)) {
            // TODO: Implementar logging estruturado em produção
            console.error('Usuário não encontrado ou inválido');
            return;
        }

        state.loading = true;
        state.error = null;

        try {
            const balanceData = await getLoyaltyBalance(state.usuario.id);
            
            // Validar dados recebidos
            if (!balanceData || typeof balanceData !== 'object') {
                throw new Error('Dados de saldo inválidos');
            }
            
            const pontos = Number(balanceData?.current_balance) || 0;
            const dataExpiracao = balanceData?.expiration_date;
            
            // Validar pontos
            if (!isValidPoints(pontos)) {
                throw new Error('Quantidade de pontos inválida');
            }
            
            state.pontosAtuais = Math.max(0, pontos);
            state.pontosExpiram = dataExpiracao ? new Date(dataExpiracao) : null;
            
            // Validar data de expiração
            if (state.pontosExpiram && !isValidDate(state.pontosExpiram)) {
                state.pontosExpiram = null;
            }
            
            // Calcular dias restantes de forma mais eficiente
            const diasRestantes = calcularDiasRestantes(state.pontosExpiram);
            
            // Atualizar DOM de forma otimizada
            atualizarExibicaoPontos(diasRestantes);

        } catch (error) {
            // TODO: Implementar logging estruturado em produção
            console.error('Erro ao carregar pontos:', error.message);
            state.error = error.message;
            
            // Fallback para dados simulados em caso de erro
            state.pontosAtuais = 0;
            state.pontosExpiram = null;
            atualizarExibicaoPontos(0);
        } finally {
            state.loading = false;
        }
    }

    // Calcular dias restantes de forma otimizada
    function calcularDiasRestantes(dataExpiracao) {
        if (!dataExpiracao || !isValidDate(dataExpiracao)) return 0;
        
        try {
            const hoje = new Date();
            const diffTime = dataExpiracao - hoje;
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            return Math.max(0, diffDays);
        } catch (error) {
            // TODO: Implementar logging estruturado em produção
            console.warn('Erro ao calcular dias restantes:', error.message);
            return 0;
        }
    }

    // Atualizar exibição dos pontos de forma otimizada
    function atualizarExibicaoPontos(diasRestantes) {
        if (el.pontosAtuais) {
            el.pontosAtuais.textContent = state.pontosAtuais;
        }
        
        if (el.diasExpiram) {
            el.diasExpiram.textContent = diasRestantes;
        }
        
        if (el.vencimentoDias) {
            el.vencimentoDias.textContent = diasRestantes;
        }
    }

    // Carregar histórico de pontos via API
    async function carregarHistorico() {
        if (!state.usuario || !isValidUserId(state.usuario.id)) {
            // TODO: Implementar logging estruturado em produção
            console.error('Usuário não encontrado ou inválido');
            return;
        }

        try {
            const historyData = await getLoyaltyHistory(state.usuario.id);
            
            // Validar dados recebidos
            if (!Array.isArray(historyData)) {
                throw new Error('Dados de histórico inválidos');
            }
            
            // Limitar número de itens para performance
            const limitedHistory = historyData.slice(0, VALIDATION_LIMITS.MAX_HISTORY_ITEMS);
            
            // Transformar dados da API para o formato esperado
            state.historico = limitedHistory.map(item => {
                // Validar item do histórico
                if (!item || typeof item !== 'object') {
                    return null;
                }
                
                const isGanho = Number(item.points) > 0;
                const isBoasVindas = item.reason && item.reason.toLowerCase().includes('boas-vindas');
                const isOrderRelated = item.order_id && item.order_id !== null;
                
                // Validar pontos
                const pontos = Number(item.points) || 0;
                if (!isValidPoints(Math.abs(pontos))) {
                    return null;
                }
                
                // Para pontos de boas-vindas, não mostrar valor de gasto
                // Para transações relacionadas a pedidos, converter pontos para reais
                const valor = isBoasVindas ? 0 : (isOrderRelated ? Math.abs(pontos) / 10 : 0);
                
                // Melhorar descrições para serem mais amigáveis
                let descricao = item.reason || '';
                if (descricao.length > VALIDATION_LIMITS.MAX_DESCRIPTION_LENGTH) {
                    descricao = descricao.substring(0, VALIDATION_LIMITS.MAX_DESCRIPTION_LENGTH) + '...';
                }
                
                if (isBoasVindas) {
                    descricao = 'Bem-vindo ao Clube Royal! Você ganhou pontos de boas-vindas';
                } else if (isGanho && isOrderRelated) {
                    descricao = `Você fez uma compra e ganhou ${Math.abs(pontos)} pontos`;
                } else if (!isGanho) {
                    descricao = `Você usou pontos para obter desconto no seu pedido`;
                } else {
                    descricao = descricao || 'Pontos adicionados à sua conta';
                }
                
                // Validar datas
                const data = item.date ? new Date(item.date) : new Date();
                const validoAte = item.expiration_date ? new Date(item.expiration_date) : null;
                
                if (!isValidDate(data)) {
                    return null;
                }
                
                if (validoAte && !isValidDate(validoAte)) {
                    return null;
                }
                
                return {
                    id: item.id || Math.random(),
                    tipo: isGanho ? 'ganho' : 'uso',
                    descricao: descricao,
                    valor: valor,
                    pontos: pontos,
                    data: data,
                    validoAte: validoAte,
                    orderId: item.order_id,
                    isBoasVindas: isBoasVindas
                };
            }).filter(item => item !== null); // Remover itens inválidos

        } catch (error) {
            // TODO: Implementar logging estruturado em produção
            console.error('Erro ao carregar histórico:', error.message);
            state.error = error.message;
            
            // Fallback para dados simulados em caso de erro
            state.historico = [
                {
                    id: 1,
                    tipo: 'ganho',
                    descricao: 'Bem-vindo ao Clube Royal! Você ganhou pontos de boas-vindas',
                    valor: 0,
                    pontos: 100,
                    data: new Date(),
                    validoAte: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
                    isBoasVindas: true
                }
            ];
        }
    }

    // Renderizar histórico com otimizações
    function renderHistorico() {
        if (!el.historicoContainer) return;

        // Usar DocumentFragment para melhor performance
        const fragment = document.createDocumentFragment();
        
        state.historico.forEach(item => {
            const itemElement = criarElementoHistorico(item);
            fragment.appendChild(itemElement);
        });

        // Limpar container e adicionar fragmento
        el.historicoContainer.innerHTML = '';
        el.historicoContainer.appendChild(fragment);
    }

    // Criar elemento do histórico de forma otimizada
    function criarElementoHistorico(item) {
        const tipoIcon = item.tipo === 'ganho' ? 'fa-crown' : 'fa-minus-circle';
        const tipoCor = item.tipo === 'ganho' ? 'var(--color-primary)' : '#ff6b6b';
        const pontosTexto = item.pontos > 0 ? `+${item.pontos} pontos` : `${item.pontos} pontos`;
        
        // Texto melhorado baseado no tipo de transação
        let valorTexto = '';
        if (item.isBoasVindas) {
            valorTexto = 'Presente de boas-vindas';
        } else if (item.tipo === 'ganho' && item.valor > 0) {
            valorTexto = `Compra de ${formatBRL(item.valor)}`;
        } else if (item.tipo === 'uso') {
            valorTexto = `Desconto de ${formatBRL(item.valor)}`;
        } else {
            valorTexto = 'Pontos ganhos';
        }
        
        const div = document.createElement('div');
        div.className = 'quandro';
        div.innerHTML = `
            <div class="faixa">
                <i class="fa-solid ${tipoIcon}"></i>
            </div>
            <div class="texto">
                <p class="informa">
                    ${escapeHTML(item.descricao)}
                </p>
                <div class="descricao">
                    <p class="escuro">${escapeHTML(valorTexto)}</p>
                    <p class="escuro" style="color: ${tipoCor};">${escapeHTML(pontosTexto)}</p>
                    ${item.validoAte ? `<p class="claro">Válido até ${formatDate(item.validoAte)}</p>` : ''}
                </div>
            </div>
        `;
        
        return div;
    }

    // Estado da visualização
    let mostrandoHistorico = false;

    // Mostrar histórico
    function mostrarHistorico() {
        if (el.secaoExplicacao) {
            el.secaoExplicacao.style.display = 'none';
        }
        if (el.secaoHistorico) {
            el.secaoHistorico.style.display = 'flex';
        }
        if (el.btnAlternar) {
            el.btnAlternar.textContent = 'Ver Explicação';
        }
        mostrandoHistorico = true;
    }

    // Mostrar explicação
    function mostrarExplicacao() {
        if (el.secaoExplicacao) {
            el.secaoExplicacao.style.display = 'flex';
        }
        if (el.secaoHistorico) {
            el.secaoHistorico.style.display = 'none';
        }
        if (el.btnAlternar) {
            el.btnAlternar.textContent = 'Histórico de pontos';
        }
        mostrandoHistorico = false;
    }

    // Alternar entre seções
    function alternarSecao() {
        if (mostrandoHistorico) {
            mostrarExplicacao();
        } else {
            mostrarHistorico();
        }
    }

    // Anexar eventos
    function attachEvents() {
        // Botão alternar
        if (el.btnAlternar) {
            el.btnAlternar.addEventListener('click', alternarSecao);
        }

        // Botão voltar
        const btnVoltar = document.querySelector('.voltar');
        if (btnVoltar) {
            btnVoltar.addEventListener('click', () => {
                if (mostrandoHistorico) {
                    mostrarExplicacao();
                } else {
                    window.history.back();
                }
            });
        }
    }

    // Inicializar
    async function init() {
        carregarUsuario();
        await carregarPontos();
        await carregarHistorico();
        renderHistorico();
        attachEvents();
    }

    // Verificar se usuário está logado
    if (typeof window.isUserLoggedIn === 'function' && !window.isUserLoggedIn()) {
        // TODO: Implementar sistema de notificações mais robusto
        alert('Você precisa estar logado para acessar esta página.');
        window.location.href = 'login.html';
        return;
    }

    // Inicializar página
    document.addEventListener('DOMContentLoaded', init);
})();
