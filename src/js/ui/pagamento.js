// src/js/ui/pagamento.js
// Gerenciamento da página de pagamento

import { getLoyaltyBalance, validatePointsRedemption, calculateDiscountFromPoints } from '../api/loyalty.js';
import { AddressService } from '../api/address.js';

// Constantes para validação e limites
const VALIDATION_LIMITS = {
  MAX_QUANTITY: 99,
  MAX_NOTES_LENGTH: 500,
  MAX_EXTRAS_COUNT: 10,
  MAX_CPF_LENGTH: 14,
  MAX_RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 1000
};

(function initPagamentoPage() {
    if (!window.location.pathname.includes('pagamento.html')) return;

    const state = {
        cesta: [],
        usuario: null,
        endereco: null,
        enderecos: [],
        enderecoSelecionado: null,
        formaPagamento: 'pix',
        cpf: '',
        usarPontos: false,
        pontosDisponiveis: 0,
        pontosParaUsar: 0,
        subtotal: 0,
        taxaEntrega: 5.00,
        descontos: 0,
        total: 0,
        loading: false,
        error: null,
        // Novas variáveis para modais
        modoEdicao: false,
        enderecoEditando: null,
        valorTroco: null,
        pedidoConfirmado: false
    };

    // Instância do serviço de endereços
    const addressService = new AddressService();

    // Refs DOM
    let el = {};

    // Inicializar elementos DOM
    function initElements() {
        el = {
            // Endereço
            enderecoTitulo: document.querySelector('#endereco-rua'),
            enderecoDescricao: document.querySelector('#endereco-bairro'),
            enderecoSelecionado: document.querySelector('#endereco-selecionado'),
            btnSelecionarEndereco: document.querySelector('#btn-selecionar-endereco'),
            listaEnderecos: document.querySelector('#lista-enderecos'),
            
            // Modal pai - Lista de endereços
            modalEnderecos: document.querySelector('#modal-enderecos'),
            listaEnderecosModal: document.querySelector('#lista-enderecos-modal'),
            btnAdicionarEnderecoModal: document.querySelector('#btn-adicionar-endereco-modal'),
            
            // Modal filha - Formulário de endereço
            modalEnderecoForm: document.querySelector('#modal-endereco-form'),
            tituloEnderecoForm: document.querySelector('#titulo-endereco-form'),
            btnSalvarEnderecoForm: document.querySelector('#btn-salvar-endereco-form'),
            
            // Formas de pagamento
            formasPagamento: document.querySelectorAll('.quadro-forma'),
            
            // Modais
            modalTroco: document.querySelector('#modal-troco'),
            modalRevisao: document.querySelector('#modal-revisao'),
            valorTroco: document.querySelector('#valor'),
            btnConfirmarTroco: document.querySelector('#btn-confirmar-troco'),
            btnConfirmarPedido: document.querySelector('#btn-confirmar-pedido'),
            trocoInfo: document.querySelector('#troco-info'),
            
            // CPF
            cpfInput: document.querySelector('input[name="cpf"]'),
            
            // Itens
            itensContainer: document.querySelector('#itens-container'),
            
            // Resumo
            subtotal: document.querySelector('#subtotal-valor'),
            taxaEntrega: document.querySelector('#taxa-entrega-valor'),
            descontos: document.querySelector('#descontos-valor'),
            total: document.querySelector('#total-valor'),
            pontosGanhos: document.querySelector('#pontos-ganhos'),
            pontosDisponiveis: document.querySelector('.pontos-royal .esquerda div p:last-child span'),
            usarPontosCheckbox: document.querySelector('.pontos-royal input[type="checkbox"]'),
            descontoPontos: document.querySelector('#desconto-pontos-valor'),
            
            // Botão
            btnFazerPedido: document.querySelector('.pagamento button')
        };
        
    }

    // Utils
    const formatBRL = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

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

    function buildImageUrl(imagePath, imageHash = null) {
        if (!imagePath) return '../assets/img/tudo.jpeg';
        
        if (imagePath.startsWith('http')) {
            return imagePath;
        }
        
        const currentOrigin = window.location.origin;
        let baseUrl;
        
        if (currentOrigin.includes('localhost') || currentOrigin.includes('127.0.0.1')) {
            baseUrl = 'http://localhost:5000';
        } else {
            const hostname = window.location.hostname;
            baseUrl = `http://${hostname}:5000`;
        }
        
        const cacheParam = imageHash || new Date().getTime();
        
        if (imagePath.startsWith('/api/uploads/products/')) {
            return `${baseUrl}${imagePath}?v=${cacheParam}`;
        }
        
        if (imagePath.startsWith('/uploads/products/')) {
            return `${baseUrl}${imagePath.replace('/uploads/', '/api/uploads/')}?v=${cacheParam}`;
        }
        
        if (imagePath.match(/^\d+\.(jpg|jpeg|png|gif|webp)$/i)) {
            return `${baseUrl}/api/uploads/products/${imagePath}?v=${cacheParam}`;
        }
        
        return `${baseUrl}/api/uploads/products/${imagePath}?v=${cacheParam}`;
    }

    // Carregar dados da cesta
    function carregarCesta() {
        try {
            const cestaStr = localStorage.getItem('royal_cesta');
            if (cestaStr) {
                state.cesta = JSON.parse(cestaStr);
            } else {
                state.cesta = [];
            }
        } catch (err) {
            // TODO: Implementar logging estruturado em produção
            console.error('Erro ao carregar cesta:', err.message);
            state.cesta = [];
        }
    }

    // Carregar dados do usuário
    function carregarUsuario() {
        try {
            if (typeof window.getStoredUser === 'function') {
                state.usuario = window.getStoredUser();
            }
        } catch (err) {
            // TODO: Implementar logging estruturado em produção
            console.error('Erro ao carregar usuário:', err.message);
            state.usuario = null;
        }
    }

    // Carregar endereços do usuário
    async function carregarEnderecos() {
        try {
            const enderecos = await addressService.getAddresses();
            state.enderecos = enderecos || [];
            
            // Selecionar o primeiro endereço disponível
            if (state.enderecos.length > 0) {
                state.enderecoSelecionado = state.enderecos[0];
                state.endereco = state.enderecos[0];
            }
        } catch (error) {
            // TODO: Implementar logging estruturado em produção
            console.error('Erro ao carregar endereços:', error.message);
            state.enderecos = [];
        }
    }

    // Carregar endereço do usuário (compatibilidade)
    function carregarEndereco() {
        // Esta função é mantida para compatibilidade
        // O carregamento real é feito em carregarEnderecos()
    }

    // Carregar pontos Royal do usuário via API
    async function carregarPontos() {
        if (!state.usuario || !state.usuario.id) {
            // TODO: Implementar logging estruturado em produção
            console.error('Usuário não encontrado');
            return;
        }

        state.loading = true;
        state.error = null;

        try {
            const balanceData = await getLoyaltyBalance(state.usuario.id);
            state.pontosDisponiveis = balanceData.current_balance || 0;
        } catch (error) {
            // TODO: Implementar logging estruturado em produção
            console.error('Erro ao carregar pontos:', error.message);
            state.error = error.message;
            state.pontosDisponiveis = 0;
        } finally {
            state.loading = false;
        }
    }

    // Calcular totais
    function calcularTotais() {
        state.subtotal = state.cesta.reduce((sum, item) => sum + item.precoTotal, 0);
        
        // Validar resgate de pontos se estiver usando
        if (state.usarPontos && state.pontosParaUsar > 0) {
            const validacao = validatePointsRedemption(
                state.pontosDisponiveis, 
                state.pontosParaUsar, 
                state.subtotal
            );
            
            if (!validacao.valid) {
                // TODO: Implementar logging estruturado em produção
                console.warn('Validação de pontos falhou:', validacao.error);
                state.pontosParaUsar = validacao.maxPoints;
            }
        }
        
        // Calcular desconto por pontos (10 pontos = R$ 1,00)
        const descontoPontos = state.usarPontos ? calculateDiscountFromPoints(state.pontosParaUsar) : 0;
        state.descontos = Math.min(descontoPontos, state.subtotal);
        
        state.total = state.subtotal + state.taxaEntrega - state.descontos;
        
        // Atualizar exibição do troco se dinheiro estiver selecionado
        if (state.formaPagamento === 'dinheiro') {
            atualizarExibicaoTroco();
        }
    }

    // Renderizar itens da cesta
    function renderItens() {
        if (!el.itensContainer) return;

        const itensHtml = state.cesta.map(item => {
            const imageUrl = buildImageUrl(item.imagem, item.imageHash);
            
            // Renderizar lista de extras/modificações
            let extrasHtml = '';
            if (item.extras && item.extras.length > 0) {
                const extrasItems = item.extras.map(extra => {
                    return `<li><span class="extra-quantity-badge">${extra.quantidade}</span> ${escapeHTML(extra.nome)}</li>`;
                }).join('');
                extrasHtml = `
                    <div class="item-extras-separator"></div>
                    <div class="item-extras-list">
                        <ul>
                            ${extrasItems}
                        </ul>
                    </div>
                `;
            }

            // Mostrar observação se houver
            const obsHtml = item.observacao ? `
                <div class="item-extras-separator"></div>
                <div class="item-observacao">
                    <strong>Obs:</strong> ${escapeHTML(item.observacao)}
                </div>
            ` : '';

            return `
                <div class="item">
                    <div class="item-header">
                        <div class="item-image">
                            <img src="${imageUrl}" alt="${escapeHTML(item.nome)}">
                        </div>
                        <div class="item-header-info">
                            <p class="nome">${escapeHTML(item.nome)}</p>
                            <p class="descricao">${escapeHTML(item.descricao || '')}</p>
                        </div>
                    </div>
                    ${extrasHtml}
                    ${obsHtml}
                    <div class="item-extras-separator"></div>
                    <div class="item-footer">
                        <p class="item-preco">${formatBRL(item.precoTotal)}</p>
                        <p class="item-quantidade">Qtd: ${item.quantidade}</p>
                    </div>
                </div>
            `;
        }).join('');

        el.itensContainer.innerHTML = itensHtml;
    }

    // Renderizar resumo de valores
    function renderResumo() {
        calcularTotais();

        if (el.subtotal) el.subtotal.textContent = formatBRL(state.subtotal);
        if (el.taxaEntrega) el.taxaEntrega.textContent = formatBRL(state.taxaEntrega);
        if (el.descontos) el.descontos.textContent = formatBRL(state.descontos);
        if (el.total) el.total.textContent = formatBRL(state.total);
        
        // Pontos (10 pontos a cada R$ 1,00 gasto)
        const pontosGanhos = Math.floor(state.total * 10);
        if (el.pontosGanhos) el.pontosGanhos.textContent = pontosGanhos;
        if (el.pontosDisponiveis) el.pontosDisponiveis.textContent = state.pontosDisponiveis;
        
        // Desconto por pontos (sempre mostrar o valor máximo disponível)
        if (el.descontoPontos) {
            const descontoMaximo = Math.min(calculateDiscountFromPoints(state.pontosDisponiveis), state.subtotal);
            el.descontoPontos.textContent = `-${formatBRL(descontoMaximo)}`;
        }
    }

    // Renderizar endereço
    function renderEndereco() {
        if (state.endereco) {
            // Construir endereço completo baseado na estrutura da API
            let enderecoCompleto = '';
            let enderecoDescricao = '';
            
            // Mapear campos da API para a estrutura esperada
            const rua = state.endereco.street || state.endereco.rua;
            const numero = state.endereco.number || state.endereco.numero;
            const bairro = state.endereco.neighborhood || state.endereco.district || state.endereco.bairro;
            const cidade = state.endereco.city || state.endereco.cidade;
            const estado = state.endereco.state || state.endereco.estado;
            
            if (rua && numero) {
                enderecoCompleto = `${rua}, ${numero}`;
            } else if (rua) {
                enderecoCompleto = rua;
            } else {
                enderecoCompleto = 'Endereço não informado';
            }
            
            if (bairro && cidade) {
                enderecoDescricao = `${bairro} - ${cidade}`;
            } else if (bairro) {
                enderecoDescricao = bairro;
            } else if (cidade) {
                enderecoDescricao = cidade;
            } else {
                enderecoDescricao = 'Localização não informada';
            }
            
            if (el.enderecoTitulo) {
                el.enderecoTitulo.textContent = enderecoCompleto;
            }
            if (el.enderecoDescricao) {
                el.enderecoDescricao.textContent = enderecoDescricao;
            }
        } else {
            // Fallback quando não há endereço
            if (el.enderecoTitulo) el.enderecoTitulo.textContent = 'Nenhum endereço selecionado';
            if (el.enderecoDescricao) el.enderecoDescricao.textContent = 'Clique para selecionar um endereço';
        }
    }

    // Renderizar lista de endereços
    function renderListaEnderecos() {
        if (!el.listaEnderecos) return;

        let html = '';
        
        // Se não há endereços cadastrados, mostrar mensagem e botão para adicionar
        if (state.enderecos.length === 0) {
            html += `
                <div class="endereco-item endereco-vazio">
                    <div class="endereco-info">
                        <i class="fa-solid fa-exclamation-triangle"></i>
                        <div>
                            <p class="titulo">Nenhum endereço cadastrado</p>
                            <p class="descricao">Cadastre um endereço para receber seu pedido</p>
                        </div>
                    </div>
                </div>
                <div class="endereco-item" data-endereco-id="novo">
                    <div class="endereco-info">
                        <i class="fa-solid fa-plus"></i>
                        <div>
                            <p class="titulo">Adicionar primeiro endereço</p>
                            <p class="descricao">Cadastrar um novo endereço de entrega</p>
                        </div>
                    </div>
                </div>
            `;
        } else {
            // Botão para adicionar novo endereço (quando já existem endereços)
            html += `
                <div class="endereco-item" data-endereco-id="novo">
                    <div class="endereco-info">
                        <i class="fa-solid fa-plus"></i>
                        <div>
                            <p class="titulo">Adicionar novo endereço</p>
                            <p class="descricao">Cadastrar um novo endereço de entrega</p>
                        </div>
                    </div>
                </div>
            `;

            // Listar endereços existentes
            state.enderecos.forEach(endereco => {
                const isSelecionado = state.enderecoSelecionado && state.enderecoSelecionado.id === endereco.id;
                
                // Mapear campos da API
                const rua = endereco.street || endereco.rua;
                const numero = endereco.number || endereco.numero;
                const bairro = endereco.neighborhood || endereco.district || endereco.bairro;
                const cidade = endereco.city || endereco.cidade;
                const estado = endereco.state || endereco.estado;
                
                const enderecoCompleto = rua && numero ? `${rua}, ${numero}` : rua || 'Endereço não informado';
                const enderecoDescricao = bairro && cidade ? `${bairro} - ${cidade}` : bairro || cidade || 'Localização não informada';
                
                html += `
                    <div class="endereco-item ${isSelecionado ? 'selecionado' : ''}" data-endereco-id="${endereco.id}" onclick="selecionarEndereco(${endereco.id})">
                        <div class="endereco-info">
                            <i class="fa-solid fa-location-dot"></i>
                            <div class="endereco-info-content">
                                <p class="titulo">${enderecoCompleto}</p>
                                <p class="descricao">${enderecoDescricao}</p>
                            </div>
                        </div>
                        <div class="endereco-actions">
                            <button class="btn-editar" data-endereco-id="${endereco.id}" title="Editar endereço" onclick="event.stopPropagation(); abrirModalEnderecoForm('edit', ${endereco.id})">
                                <i class="fa-solid fa-edit"></i>
                            </button>
                        </div>
                    </div>
                `;
            });
        }

        el.listaEnderecos.innerHTML = html;
    }

    // Nova função para renderizar lista na modal pai
    function renderListaEnderecosModal() {
        if (!el.listaEnderecosModal) return;


        if (state.enderecos.length === 0) {
            el.listaEnderecosModal.innerHTML = `
                <div class="endereco-vazio">
                    <i class="fa-solid fa-map-location-dot"></i>
                    <h3>Nenhum endereço cadastrado</h3>
                    <p>Adicione um endereço para receber seus pedidos</p>
                    <button class="btn-adicionar-primeiro" onclick="abrirModalEnderecoForm('add')">
                        Adicionar primeiro endereço
                    </button>
                </div>
            `;
            return;
        }

        el.listaEnderecosModal.innerHTML = state.enderecos.map(endereco => {
            const isSelecionado = state.enderecoSelecionado && state.enderecoSelecionado.id === endereco.id;
            return `
            <div class="endereco-item ${isSelecionado ? 'selecionado' : ''}" 
                 data-endereco-id="${endereco.id}" 
                 onclick="selecionarEnderecoModal(${endereco.id})">
                <div class="endereco-info">
                    <i class="fa-solid fa-location-dot"></i>
                    <div class="endereco-info-content">
                        <p class="titulo">${endereco.street || 'Endereço não informado'}, ${endereco.number || 'S/N'}</p>
                        <p class="descricao">${endereco.neighborhood || endereco.district || endereco.bairro || 'Bairro não informado'} - ${endereco.city || 'Cidade não informada'}</p>
                    </div>
                </div>
                <div class="endereco-actions">
                    <button class="btn-editar" data-endereco-id="${endereco.id}" title="Editar endereço" onclick="event.stopPropagation(); abrirModalEnderecoForm('edit', ${endereco.id})">
                        <i class="fa-solid fa-pen"></i>
                    </button>
                </div>
            </div>
        `;
        }).join('');
    }

    function selecionarEnderecoModal(enderecoId) {
        const endereco = state.enderecos.find(addr => addr.id === enderecoId);
        if (endereco) {
            state.enderecoSelecionado = endereco;
            state.endereco = endereco;
            renderEndereco();
            renderListaEnderecosModal(); // Re-renderizar para mostrar seleção
            fecharModalEnderecos();
        }
    }


    // Funções para o formulário de endereço
    async function salvarEnderecoForm() {
        const dadosEndereco = coletarDadosFormulario();
        if (!dadosEndereco) return;

        try {
            if (state.modoEdicao && state.enderecoEditando) {
                // Modo edição
                await addressService.updateAddress(state.enderecoEditando.id, dadosEndereco);
                const index = state.enderecos.findIndex(addr => addr.id === state.enderecoEditando.id);
                if (index !== -1) {
                    state.enderecos[index] = { ...state.enderecos[index], ...dadosEndereco };
                }
            } else {
                // Modo adição
                const novoEndereco = await addressService.createAddress(dadosEndereco);
                state.enderecos.push(novoEndereco);
                
                // Se for o primeiro endereço, selecionar
                if (state.enderecos.length === 1) {
                    state.enderecoSelecionado = novoEndereco;
                    state.endereco = novoEndereco;
                    renderEndereco();
                }
            }
            
            renderListaEnderecosModal();
            fecharModalEnderecoForm();
        } catch (error) {
            // TODO: Implementar logging estruturado em produção
            console.error('Erro ao salvar endereço:', error.message);
            alert('Erro ao salvar endereço. Tente novamente.');
        }
    }


    function coletarDadosFormulario() {
        const cep = document.getElementById('cep-form').value?.trim();
        const estado = document.getElementById('estado-form').value?.trim();
        const cidade = document.getElementById('cidade-form').value?.trim();
        const rua = document.getElementById('rua-form').value?.trim();
        const bairro = document.getElementById('bairro-form').value?.trim();
        const numero = document.getElementById('numero-form').value?.trim();
        const complemento = document.getElementById('complemento-form').value?.trim();

        // Validações específicas
        if (!cep) {
            alert('CEP é obrigatório.');
            return null;
        }
        if (cep.replace(/\D/g, '').length !== 8) {
            alert('CEP deve ter 8 dígitos.');
            return null;
        }
        if (!estado) {
            alert('Estado é obrigatório.');
            return null;
        }
        if (!cidade) {
            alert('Cidade é obrigatória.');
            return null;
        }
        if (!rua) {
            alert('Rua é obrigatória.');
            return null;
        }
        if (!bairro) {
            alert('Bairro é obrigatório.');
            return null;
        }
        if (!numero) {
            alert('Número é obrigatório.');
            return null;
        }

        return {
            zip_code: cep.replace(/\D/g, ''),
            state: estado,
            city: cidade,
            street: rua,
            neighborhood: bairro,
            number: numero,
            complement: complemento || null,
            is_default: false
        };
    }

    // Gerenciar endereços
    async function adicionarEndereco(dadosEndereco) {
        try {
            const novoEndereco = await addressService.createAddress(dadosEndereco);
            state.enderecos.push(novoEndereco);
            
            // Se for o primeiro endereço, selecionar
            if (state.enderecos.length === 1) {
                state.enderecoSelecionado = novoEndereco;
                state.endereco = novoEndereco;
                renderEndereco();
            }
            
            renderListaEnderecos();
            return novoEndereco;
        } catch (error) {
            // TODO: Implementar logging estruturado em produção
            console.error('Erro ao adicionar endereço:', error.message);
            throw error;
        }
    }

    async function editarEndereco(enderecoId, dadosEndereco) {
        try {
            const enderecoAtualizado = await addressService.updateAddress(enderecoId, dadosEndereco);
            
            // Atualizar na lista
            const index = state.enderecos.findIndex(addr => addr.id === enderecoId);
            if (index !== -1) {
                state.enderecos[index] = enderecoAtualizado;
            }
            
            // Se for o endereço selecionado, atualizar
            if (state.enderecoSelecionado && state.enderecoSelecionado.id === enderecoId) {
                state.enderecoSelecionado = enderecoAtualizado;
                state.endereco = enderecoAtualizado;
                renderEndereco();
            }
            
            renderListaEnderecos();
            return enderecoAtualizado;
        } catch (error) {
            // TODO: Implementar logging estruturado em produção
            console.error('Erro ao editar endereço:', error.message);
            throw error;
        }
    }


    function selecionarEndereco(enderecoId) {
        if (enderecoId === 'novo') {
            abrirModalAdicionarEndereco();
            return;
        }
        
        const endereco = state.enderecos.find(addr => addr.id === enderecoId);
        if (endereco) {
            state.enderecoSelecionado = endereco;
            state.endereco = endereco;
            renderEndereco();
            renderListaEnderecos();
            fecharListaEnderecos();
        }
    }

    // Modal pai - Lista de endereços
    function abrirModalEnderecos() {
        if (typeof window.abrirModal === 'function') {
            window.abrirModal('modal-enderecos');
        } else {
            const modal = document.getElementById('modal-enderecos');
            if (modal) {
                modal.style.display = 'flex';
                modal.classList.add('show');
            }
        }
        renderListaEnderecosModal();
    }

    function fecharModalEnderecos() {
        if (typeof window.fecharModal === 'function') {
            window.fecharModal('modal-enderecos');
        } else {
            const modal = document.getElementById('modal-enderecos');
            if (modal) {
                modal.style.display = 'none';
                modal.classList.remove('show');
            }
        }
    }

    // Modal filha - Formulário de endereço
    function abrirModalEnderecoForm(mode = 'add', enderecoId = null) {
        if (typeof window.abrirModal === 'function') {
            window.abrirModal('modal-endereco-form');
        } else {
            const modal = document.getElementById('modal-endereco-form');
            if (modal) {
                modal.style.display = 'flex';
                modal.classList.add('show');
            }
        }
        
        configurarModalEnderecoForm(mode, enderecoId);
    }

    function fecharModalEnderecoForm() {
        if (typeof window.fecharModal === 'function') {
            window.fecharModal('modal-endereco-form');
        } else {
            const modal = document.getElementById('modal-endereco-form');
            if (modal) {
                modal.style.display = 'none';
                modal.classList.remove('show');
            }
        }
    }

    function configurarModalEnderecoForm(mode, enderecoId) {
        const titulo = el.tituloEnderecoForm;
        const btnSalvar = el.btnSalvarEnderecoForm;
        
        if (mode === 'add') {
            state.modoEdicao = false;
            state.enderecoEditando = null;
            titulo.textContent = 'Adicionar endereço';
            btnSalvar.textContent = 'Salvar Endereço';
            limparFormularioEndereco();
        } else if (mode === 'edit') {
            state.modoEdicao = true;
            state.enderecoEditando = state.enderecos.find(addr => addr.id === enderecoId);
            titulo.textContent = 'Editar endereço';
            btnSalvar.textContent = 'Atualizar Endereço';
            preencherFormularioEndereco(enderecoId);
        }
    }

    function limparFormularioEndereco() {
        const campos = ['cep-form', 'estado-form', 'cidade-form', 'rua-form', 'bairro-form', 'numero-form', 'complemento-form'];
        campos.forEach(id => {
            const campo = document.getElementById(id);
            if (campo) campo.value = '';
        });
        
        const checkboxes = ['sem-numero-form', 'sem-complemento-form'];
        checkboxes.forEach(id => {
            const checkbox = document.getElementById(id);
            if (checkbox) checkbox.checked = false;
        });
    }

    function preencherFormularioEndereco(enderecoId) {
        const endereco = state.enderecos.find(addr => addr.id === enderecoId);
        if (!endereco) return;

        // Aplicar máscara no CEP
        const cepValue = endereco.zip_code || '';
        const cepFormatted = cepValue.replace(/\D/g, '').replace(/(\d{5})(\d{1,3})/, '$1-$2');
        document.getElementById('cep-form').value = cepFormatted;
        
        document.getElementById('estado-form').value = endereco.state || '';
        document.getElementById('cidade-form').value = endereco.city || '';
        document.getElementById('rua-form').value = endereco.street || '';
        document.getElementById('bairro-form').value = endereco.neighborhood || endereco.district || '';
        document.getElementById('numero-form').value = endereco.number || '';
        document.getElementById('complemento-form').value = endereco.complement || '';
    }

    // Funções legadas (mantidas para compatibilidade)
    function abrirListaEnderecos() {
        abrirModalEnderecos();
    }

    function fecharListaEnderecos() {
        fecharModalEnderecos();
    }

    function abrirModalAdicionarEndereco() {
        fecharListaEnderecos();
        // Usar o sistema de modais existente
        if (typeof window.abrirModal === 'function') {
            window.abrirModal('adicionar-endereco-pagamento');
        } else {
            // Fallback se window.abrirModal não estiver disponível
            const modal = document.getElementById('adicionar-endereco-pagamento');
            if (modal) {
                modal.style.display = 'flex';
                modal.style.opacity = '1';
            }
        }
    }

    function abrirModalEditarEndereco(enderecoId) {
        fecharListaEnderecos();
        const endereco = state.enderecos.find(addr => addr.id === enderecoId);
        if (endereco) {
            // Armazenar ID do endereço em edição
            window.enderecoIdEmEdicao = enderecoId;
            preencherFormularioEdicao(endereco);
            
            // Usar o sistema de modais existente
            if (typeof window.abrirModal === 'function') {
                window.abrirModal('editar-endereco-pagamento');
            } else {
                // Fallback se window.abrirModal não estiver disponível
                const modal = document.getElementById('editar-endereco-pagamento');
                if (modal) {
                    modal.style.display = 'flex';
                    modal.style.opacity = '1';
                }
            }
        }
    }

    function preencherFormularioEdicao(endereco) {
        // Preencher campos do modal de edição
        const campos = {
            'cep-edit-pag': endereco.cep,
            'estado-edit-pag': endereco.estado,
            'cidade-edit-pag': endereco.cidade,
            'rua-edit-pag': endereco.rua,
            'bairro-edit-pag': endereco.bairro,
            'numero-edit-pag': endereco.numero,
            'complemento-edit-pag': endereco.complemento || '',
        };

        Object.entries(campos).forEach(([id, valor]) => {
            const elemento = document.getElementById(id);
            if (elemento) {
                if (elemento.type === 'checkbox') {
                    elemento.checked = valor;
                } else {
                    elemento.value = valor;
                }
            }
        });
    }

    // Anexar eventos
    function attachEvents() {
        // Formas de pagamento
        if (el.formasPagamento) {
            el.formasPagamento.forEach(forma => {
                forma.addEventListener('click', () => {
                    // Remover seleção anterior
                    el.formasPagamento.forEach(f => f.classList.remove('selecionado'));
                    // Adicionar seleção atual
                    forma.classList.add('selecionado');
                    
                    // Atualizar forma de pagamento
                    const texto = forma.querySelector('p').textContent.toLowerCase();
                    if (texto.includes('pix')) {
                        state.formaPagamento = 'pix';
                        state.valorTroco = null; // Limpar troco se mudar de dinheiro
                        atualizarExibicaoTroco(); // Atualizar exibição
                    } else if (texto.includes('cartão')) {
                        state.formaPagamento = 'cartao';
                        state.valorTroco = null; // Limpar troco se mudar de dinheiro
                        atualizarExibicaoTroco(); // Atualizar exibição
                    } else if (texto.includes('dinheiro')) {
                        state.formaPagamento = 'dinheiro';
                        // Abrir modal de troco quando selecionar dinheiro
                        abrirModalTroco();
                    }
                });
            });
        }

        // CPF
        if (el.cpfInput) {
            el.cpfInput.addEventListener('input', (e) => {
                state.cpf = e.target.value;
            });
        }

        // Usar pontos Royal
        if (el.usarPontosCheckbox) {
            el.usarPontosCheckbox.addEventListener('change', (e) => {
                state.usarPontos = e.target.checked;
                if (state.usarPontos) {
                    // Usar todos os pontos disponíveis por padrão
                    state.pontosParaUsar = state.pontosDisponiveis;
                } else {
                    state.pontosParaUsar = 0;
                }
                calcularTotais();
                renderResumo();
            });
        }

        // Botão fazer pedido
        // Removido - usando implementação que abre modal de revisão

        // Eventos de endereços
        if (el.enderecoSelecionado) {
            el.enderecoSelecionado.addEventListener('click', (e) => {
                e.stopPropagation();
                abrirModalEnderecos();
            });
        }

        // Eventos da modal pai - Lista de endereços
        if (el.btnAdicionarEnderecoModal) {
            el.btnAdicionarEnderecoModal.addEventListener('click', () => {
                abrirModalEnderecoForm('add');
            });
        }

        // Eventos da modal filha - Formulário de endereço
        if (el.btnSalvarEnderecoForm) {
            el.btnSalvarEnderecoForm.addEventListener('click', () => {
                salvarEnderecoForm();
            });
        }

        // Event listener para o botão "Fazer pedido"
        const btnFazerPedido = document.querySelector('.pagamento button');
        if (btnFazerPedido) {
            btnFazerPedido.addEventListener('click', () => {
                abrirModalRevisao();
            });
        }


        if (el.btnSelecionarEndereco) {
            el.btnSelecionarEndereco.addEventListener('click', (e) => {
                e.stopPropagation();
                abrirListaEnderecos();
            });
        }

        // Fechar lista ao clicar fora
        document.addEventListener('click', (e) => {
            if (!el.enderecoSelecionado?.contains(e.target) && !el.listaEnderecos?.contains(e.target)) {
                fecharListaEnderecos();
            }
        });

        // Eventos da lista de endereços (delegation)
        if (el.listaEnderecos) {
            el.listaEnderecos.addEventListener('click', (e) => {
                const enderecoItem = e.target.closest('.endereco-item');
                if (!enderecoItem) return;

                const enderecoId = enderecoItem.dataset.enderecoId;
                
                if (e.target.closest('.btn-editar')) {
                    e.stopPropagation();
                    abrirModalEditarEndereco(enderecoId);
                } else {
                    selecionarEndereco(enderecoId);
                }
            });
        }

        // Eventos dos modais de endereço
        const btnSalvarEndereco = document.getElementById('btn-salvar-endereco-pagamento');
        if (btnSalvarEndereco) {
            btnSalvarEndereco.addEventListener('click', () => {
                salvarNovoEndereco();
            });
        }

        const btnAtualizarEndereco = document.getElementById('btn-atualizar-endereco-pagamento');
        if (btnAtualizarEndereco) {
            btnAtualizarEndereco.addEventListener('click', () => {
                atualizarEndereco();
            });
        }

    }

    // Funções para gerenciar formulários de endereço
    async function salvarNovoEndereco() {
        try {
            const dadosEndereco = coletarDadosFormulario('add-pag');
            await adicionarEndereco(dadosEndereco);
            
            // Usar o sistema de modais existente
            if (typeof window.fecharModal === 'function') {
                window.fecharModal('adicionar-endereco-pagamento');
            } else {
                // Fallback se window.fecharModal não estiver disponível
                const modal = document.getElementById('adicionar-endereco-pagamento');
                if (modal) {
                    modal.style.display = 'none';
                    modal.style.opacity = '0';
                }
            }
            
            alert('Endereço adicionado com sucesso!');
        } catch (error) {
            // TODO: Implementar logging estruturado em produção
            console.error('Erro ao salvar endereço:', error.message);
            alert('Erro ao salvar endereço. Tente novamente.');
        }
    }

    async function atualizarEndereco() {
        try {
            const enderecoId = obterEnderecoIdEmEdicao();
            if (!enderecoId) {
                alert('Erro: ID do endereço não encontrado.');
                return;
            }

            const dadosEndereco = coletarDadosFormulario('edit-pag');
            await editarEndereco(enderecoId, dadosEndereco);
            
            // Usar o sistema de modais existente
            if (typeof window.fecharModal === 'function') {
                window.fecharModal('editar-endereco-pagamento');
            } else {
                // Fallback se window.fecharModal não estiver disponível
                const modal = document.getElementById('editar-endereco-pagamento');
                if (modal) {
                    modal.style.display = 'none';
                    modal.style.opacity = '0';
                }
            }
            
            alert('Endereço atualizado com sucesso!');
        } catch (error) {
            // TODO: Implementar logging estruturado em produção
            console.error('Erro ao atualizar endereço:', error.message);
            alert('Erro ao atualizar endereço. Tente novamente.');
        }
    }


    function coletarDadosFormulario(sufixo) {
        const dados = {
            cep: document.getElementById(`cep-${sufixo}`)?.value || '',
            estado: document.getElementById(`estado-${sufixo}`)?.value || '',
            cidade: document.getElementById(`cidade-${sufixo}`)?.value || '',
            rua: document.getElementById(`rua-${sufixo}`)?.value || '',
            bairro: document.getElementById(`bairro-${sufixo}`)?.value || '',
            numero: document.getElementById(`numero-${sufixo}`)?.value || '',
            complemento: document.getElementById(`complemento-${sufixo}`)?.value || null,
            is_default: false
        };

        // Normalizar campos vazios para null
        if (!dados.complemento) dados.complemento = null;
        
        return dados;
    }

    function obterEnderecoIdEmEdicao() {
        // Esta função deve ser implementada para rastrear qual endereço está sendo editado
        // Por enquanto, vamos usar uma variável global temporária
        return window.enderecoIdEmEdicao;
    }

    // Fazer pedido
    function fazerPedido() {
        if (state.cesta.length === 0) {
            alert('Sua cesta está vazia!');
            return;
        }

        // Validar CPF se preenchido
        if (state.cpf && !validarCPF(state.cpf)) {
            alert('CPF inválido!');
            return;
        }

        // Preparar dados do pedido
        const pedido = {
            itens: state.cesta,
            endereco: state.endereco,
            formaPagamento: state.formaPagamento,
            cpf: state.cpf,
            usarPontos: state.usarPontos,
            pontosUsados: state.usarPontos ? Math.min(state.pontosDisponiveis, Math.floor(state.subtotal * 100)) : 0,
            subtotal: state.subtotal,
            taxaEntrega: state.taxaEntrega,
            descontos: state.descontos,
            total: state.total,
            data: new Date().toISOString()
        };

        // Salvar pedido no localStorage (simulação)
        try {
            const pedidos = JSON.parse(localStorage.getItem('royal_pedidos') || '[]');
            pedidos.push(pedido);
            localStorage.setItem('royal_pedidos', JSON.stringify(pedidos));
            
            // Limpar cesta
            localStorage.removeItem('royal_cesta');
            
            // Mostrar sucesso
            alert('Pedido realizado com sucesso!');
            
            // Redirecionar para página de sucesso ou histórico
            window.location.href = 'hist-pedidos.html';
        } catch (err) {
            // TODO: Implementar logging estruturado em produção
            console.error('Erro ao salvar pedido:', err.message);
            alert('Erro ao processar pedido. Tente novamente.');
        }
    }

    // Validar CPF
    function validarCPF(cpf) {
        cpf = cpf.replace(/[^\d]/g, '');
        if (cpf.length !== 11) return false;
        
        // Verificar se todos os dígitos são iguais
        if (/^(\d)\1{10}$/.test(cpf)) return false;
        
        // Validar dígitos verificadores
        let soma = 0;
        for (let i = 0; i < 9; i++) {
            soma += parseInt(cpf.charAt(i)) * (10 - i);
        }
        let resto = 11 - (soma % 11);
        if (resto === 10 || resto === 11) resto = 0;
        if (resto !== parseInt(cpf.charAt(9))) return false;
        
        soma = 0;
        for (let i = 0; i < 10; i++) {
            soma += parseInt(cpf.charAt(i)) * (11 - i);
        }
        resto = 11 - (soma % 11);
        if (resto === 10 || resto === 11) resto = 0;
        if (resto !== parseInt(cpf.charAt(10))) return false;
        
        return true;
    }

    // ====== Integração com IBGE (UF e municípios) e ViaCEP (CEP) ======
    let ufSelectForm = null;
    let citySelectForm = null;
    let cepInputForm = null;
    let ruaInputForm = null;
    let bairroInputForm = null;

    async function fetchUFs() {
        try {
            const resp = await fetch('https://servicodados.ibge.gov.br/api/v1/localidades/estados?orderBy=nome');
            const data = await resp.json();
            const populaUF = (selectEl) => {
                if (!selectEl) return;
                selectEl.innerHTML = '<option value="" disabled selected>Selecione o estado</option>';
                data.forEach(uf => {
                    const opt = document.createElement('option');
                    opt.value = uf.sigla;
                    opt.textContent = `${uf.sigla} - ${uf.nome}`;
                    opt.dataset.ufId = uf.id;
                    selectEl.appendChild(opt);
                });
            };
            if (Array.isArray(data)) {
                populaUF(ufSelectForm);
            }
        } catch (e) {
            if (ufSelectForm) ufSelectForm.innerHTML = '<option value="" disabled selected>UF</option>';
        }
    }

    async function fetchCitiesByUF(ufSigla, targetCitySelect) {
        if (!ufSigla || !targetCitySelect) return;
        try {
            targetCitySelect.innerHTML = '<option value="" disabled selected>Carregando...</option>';
            const resp = await fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${ufSigla}/municipios`);
            const data = await resp.json();
            targetCitySelect.innerHTML = '<option value="" disabled selected>Selecione a cidade</option>';
            if (Array.isArray(data)) {
                data.forEach(c => {
                    const opt = document.createElement('option');
                    opt.value = c.nome;
                    opt.textContent = c.nome;
                    targetCitySelect.appendChild(opt);
                });
            }
        } catch (e) {
            targetCitySelect.innerHTML = '<option value="" disabled selected>Erro ao carregar</option>';
        }
    }

    async function lookupCEP(rawCep) {
        const cep = String(rawCep || '').replace(/\D/g, '');
        if (cep.length !== 8) return null;
        try {
            const resp = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
            const data = await resp.json();
            if (data && !data.erro) return data;
            return null;
        } catch (_e) { return null; }
    }

    function aplicarMascaraCep(el) {
        let v = (el.value || '').replace(/\D/g, '');
        if (v.length > 8) v = v.slice(0, 8);
        if (v.length > 5) v = v.replace(/(\d{5})(\d{1,3})/, '$1-$2');
        el.value = v;
    }

    let lastCepFormChecked = null;
    let lastCepFormResult = null; // 'success' | 'error' | null

    function configurarBuscaCEP() {
        ufSelectForm = document.getElementById('estado-form');
        citySelectForm = document.getElementById('cidade-form');
        cepInputForm = document.getElementById('cep-form');
        ruaInputForm = document.getElementById('rua-form');
        bairroInputForm = document.getElementById('bairro-form');

        if (ufSelectForm && citySelectForm) {
            ufSelectForm.addEventListener('change', () => {
                const uf = ufSelectForm.value;
                fetchCitiesByUF(uf, citySelectForm);
            });
        }

        if (cepInputForm) {
            cepInputForm.addEventListener('input', async function () {
                // máscara simples
                aplicarMascaraCep(this);

                const cleaned = (this.value || '').replace(/\D/g, '');
                if (cleaned.length !== 8) return;

                if (lastCepFormChecked === cleaned && lastCepFormResult === 'success') return;

                const data = await lookupCEP(this.value);
                if (data) {
                    if (ruaInputForm && data.logradouro) ruaInputForm.value = data.logradouro;
                    if (bairroInputForm && data.bairro) bairroInputForm.value = data.bairro;
                    if (ufSelectForm && data.uf) {
                        ufSelectForm.value = data.uf;
                        await fetchCitiesByUF(data.uf, citySelectForm);
                        if (citySelectForm && data.localidade) citySelectForm.value = data.localidade;
                    }
                    // Mostrar toast de sucesso se disponível
                    if (typeof showToast === 'function') {
                        showToast('Endereço encontrado pelo CEP.', { type: 'success', title: 'CEP' });
                    }
                    lastCepFormChecked = cleaned;
                    lastCepFormResult = 'success';
                } else {
                    if (lastCepFormChecked !== cleaned || lastCepFormResult !== 'error') {
                        if (typeof showToast === 'function') {
                            showToast('CEP não encontrado. Verifique e tente novamente.', { type: 'error', title: 'CEP' });
                        }
                    }
                    lastCepFormChecked = cleaned;
                    lastCepFormResult = 'error';
                }
            });
        }
    }

    // Inicializar
    async function init() {
        initElements();
        
        carregarCesta();
        carregarUsuario();
        await carregarEnderecos();
        await carregarPontos();
        
        renderItens();
        renderResumo();
        renderEndereco();
        renderListaEnderecos();
        
        // Configurar busca de CEP
        configurarBuscaCEP();
        await fetchUFs();
        
        attachEvents();
        
        // Garantir que o valor de desconto seja exibido na inicialização
        if (el.descontoPontos) {
            const descontoMaximo = Math.min(calculateDiscountFromPoints(state.pontosDisponiveis), state.subtotal);
            el.descontoPontos.textContent = `-${formatBRL(descontoMaximo)}`;
        }
    }

    // Função legada para seleção de endereço
    function selecionarEndereco(enderecoId) {
        const endereco = state.enderecos.find(addr => addr.id === enderecoId);
        if (endereco) {
            state.enderecoSelecionado = endereco;
            state.endereco = endereco;
            renderEndereco();
            renderListaEnderecos();
        }
    }

    // ====== MODAIS DE TROCO E REVISÃO ======
    
    function abrirModalTroco() {
        if (typeof window.abrirModal === 'function') {
            window.abrirModal('modal-troco');
        } else {
            const modal = document.getElementById('modal-troco');
            if (modal) {
                modal.style.display = 'flex';
                modal.classList.add('show');
            }
        }
    }

    function fecharModalTroco() {
        if (typeof window.fecharModal === 'function') {
            window.fecharModal('modal-troco');
        } else {
            const modal = document.getElementById('modal-troco');
            if (modal) {
                modal.style.display = 'none';
                modal.classList.remove('show');
            }
        }
    }

    function abrirModalRevisao() {
        // Atualizar exibição antes de abrir a modal
        atualizarExibicaoPagamento();
        atualizarExibicaoTroco();
        
        if (typeof window.abrirModal === 'function') {
            window.abrirModal('modal-revisao');
        } else {
            const modal = document.getElementById('modal-revisao');
            if (modal) {
                modal.style.display = 'flex';
                modal.classList.add('show');
            }
        }
    }

    function fecharModalRevisao() {
        if (typeof window.fecharModal === 'function') {
            window.fecharModal('modal-revisao');
        } else {
            const modal = document.getElementById('modal-revisao');
            if (modal) {
                modal.style.display = 'none';
                modal.classList.remove('show');
            }
        }
    }

    function confirmarTroco() {
        const valor = el.valorTroco?.value?.trim();
        if (!valor || isNaN(valor) || parseFloat(valor) <= 0) {
            alert('Digite um valor válido para o troco.');
            return;
        }

        const valorPago = parseFloat(valor);
        const valorTotal = state.total;
        
        if (valorPago < valorTotal) {
            alert(`O valor pago (R$ ${valorPago.toFixed(2).replace('.', ',')}) deve ser maior ou igual ao total do pedido (R$ ${valorTotal.toFixed(2).replace('.', ',')}).`);
            return;
        }

        state.valorTroco = valorPago;
        fecharModalTroco();
        
        // Atualizar exibição do troco no card
        atualizarExibicaoTroco();
        
        // Atualizar exibição do pagamento
        atualizarExibicaoPagamento();
    }

    function atualizarExibicaoTroco() {
        if (!el.trocoInfo) return;
        
        if (state.formaPagamento === 'dinheiro' && state.valorTroco) {
            const valorTotal = state.total;
            const troco = state.valorTroco - valorTotal;
            
            if (troco > 0) {
                el.trocoInfo.textContent = `Troco: R$ ${troco.toFixed(2).replace('.', ',')}`;
                el.trocoInfo.style.display = 'block';
            } else {
                el.trocoInfo.textContent = 'Valor exato';
                el.trocoInfo.style.display = 'block';
            }
        } else {
            el.trocoInfo.style.display = 'none';
        }
    }

    function confirmarPedido() {
        if (!state.endereco) {
            alert('Selecione um endereço de entrega.');
            return;
        }

        if (state.cesta.length === 0) {
            alert('Sua cesta está vazia!');
            return;
        }

        // Validar CPF se preenchido
        if (state.cpf && !validarCPF(state.cpf)) {
            alert('CPF inválido!');
            return;
        }

        // Preparar dados do pedido
        const pedido = {
            itens: state.cesta,
            endereco: state.endereco,
            formaPagamento: state.formaPagamento,
            cpf: state.cpf,
            usarPontos: state.usarPontos,
            pontosUsados: state.usarPontos ? Math.min(state.pontosDisponiveis, Math.floor(state.subtotal * 100)) : 0,
            subtotal: state.subtotal,
            taxaEntrega: state.taxaEntrega,
            descontos: state.descontos,
            total: state.total,
            valorTroco: state.valorTroco,
            data: new Date().toISOString(),
            status: 'confirmado'
        };

        // Salvar pedido no localStorage
        try {
            const pedidos = JSON.parse(localStorage.getItem('royal_pedidos') || '[]');
            pedidos.push(pedido);
            localStorage.setItem('royal_pedidos', JSON.stringify(pedidos));
            
            // Limpar cesta
            localStorage.removeItem('royal_cesta');
            localStorage.removeItem('royal_abrir_modal_cesta');
            
            state.pedidoConfirmado = true;
            fecharModalRevisao();
            
            // Mostrar sucesso
            alert('Pedido confirmado com sucesso! Em breve você receberá um SMS com os detalhes da entrega.');
            
            // Redirecionar para página de histórico
            window.location.href = 'hist-pedidos.html';
        } catch (err) {
            // TODO: Implementar logging estruturado em produção
            console.error('Erro ao salvar pedido:', err.message);
            alert('Erro ao processar pedido. Tente novamente.');
        }
    }

    function atualizarExibicaoPagamento() {
        // Atualizar ícones de pagamento na modal de revisão
        const pixIcon = document.querySelector('#modal-revisao .fa-pix');
        const cartaoIcon = document.querySelector('#modal-revisao .fa-credit-card');
        const dinheiroIcon = document.querySelector('#modal-revisao .fa-money-bill');
        
        // Encontrar os textos de pagamento
        const pagamentoDiv = document.querySelector('#modal-revisao .conteudo-modal > div:last-child');
        const pagamentoTexts = pagamentoDiv ? pagamentoDiv.querySelectorAll('p') : [];

        // Esconder todos os ícones
        [pixIcon, cartaoIcon, dinheiroIcon].forEach(icon => {
            if (icon) icon.style.display = 'none';
        });

        // Esconder todos os textos de pagamento
        pagamentoTexts.forEach(text => {
            if (text) text.style.display = 'none';
        });

        // Mostrar apenas o selecionado
        if (state.formaPagamento === 'pix') {
            if (pixIcon) pixIcon.style.display = 'flex';
            if (pagamentoTexts[0]) pagamentoTexts[0].style.display = 'block'; // "Pagamento na entrega"
            if (pagamentoTexts[1]) pagamentoTexts[1].style.display = 'block'; // "PIX"
        } else if (state.formaPagamento === 'cartao') {
            if (cartaoIcon) cartaoIcon.style.display = 'flex';
            if (pagamentoTexts[0]) pagamentoTexts[0].style.display = 'block'; // "Pagamento na entrega"
            if (pagamentoTexts[2]) pagamentoTexts[2].style.display = 'block'; // "Cartão"
        } else if (state.formaPagamento === 'dinheiro') {
            if (dinheiroIcon) dinheiroIcon.style.display = 'flex';
            if (pagamentoTexts[0]) pagamentoTexts[0].style.display = 'block'; // "Pagamento na entrega"
            
            // Atualizar texto do dinheiro com troco se necessário
            if (state.valorTroco) {
                if (pagamentoTexts[3]) {
                    const troco = state.valorTroco - state.total;
                    if (troco > 0) {
                        pagamentoTexts[3].textContent = `Dinheiro - Troco: R$ ${troco.toFixed(2).replace('.', ',')}`;
                    } else {
                        pagamentoTexts[3].textContent = 'Dinheiro - Valor exato';
                    }
                    pagamentoTexts[3].style.display = 'block';
                }
            } else {
                if (pagamentoTexts[3]) pagamentoTexts[3].style.display = 'block'; // "Dinheiro"
            }
        }
    }

    // Expor funções globalmente para uso nos botões
    window.abrirModalEnderecos = abrirModalEnderecos;
    window.abrirModalEnderecoForm = abrirModalEnderecoForm;
    window.selecionarEnderecoModal = selecionarEnderecoModal;
    window.selecionarEndereco = selecionarEndereco;
    window.abrirModalTroco = abrirModalTroco;
    window.abrirModalRevisao = abrirModalRevisao;
    window.fecharModalRevisao = fecharModalRevisao;
    window.confirmarTroco = confirmarTroco;
    window.confirmarPedido = confirmarPedido;

    // Verificar se usuário está logado
    if (typeof window.isUserLoggedIn === 'function' && !window.isUserLoggedIn()) {
        alert('Você precisa estar logado para acessar esta página.');
        window.location.href = 'login.html';
        return;
    }

    // Inicializar página
    document.addEventListener('DOMContentLoaded', init);
})();
