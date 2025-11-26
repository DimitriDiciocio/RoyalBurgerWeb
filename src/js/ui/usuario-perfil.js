import { logout, fetchMe, toggle2FA, confirm2FAEnable, get2FAStatus } from "../api/auth.js";
import { deleteMyCustomer, updateMyCustomer, addAddress, listAddresses, updateAddress, deleteAddress, changePassword, changePasswordWithLogout, getNotificationPreferences, updateNotificationPreferences } from "../api/user.js";
import { getStoredUser, logoutLocal } from "../api/api.js";
import { showConfirm, toastFromApiError, toastFromApiSuccess, setFlashMessage, showToast } from "./alerts.js";
import { getLoyaltyBalance } from "../api/loyalty.js";

// ALTERAÇÃO: Função para sanitizar strings para uso seguro em innerHTML
function escapeHTML(str) {
    if (typeof str !== 'string') return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

$(document).ready(function () {
    // ====== Guarda de rota: qualquer usuário logado pode acessar esta página ======
    try {
        const u = getStoredUser();
        const token = localStorage.getItem('rb.token') || localStorage.getItem('authToken');
        
        // Verifica se há usuário e token (usuário logado)
        if (!u || !token) {
            setFlashMessage({
                type: 'error',
                title: 'Acesso Restrito',
                message: 'Você precisa estar logado para acessar esta página.'
            });
            // Redireciona para a página inicial relativa a partir de src/pages/
            window.location.href = '../../index.html';
            return;
        }
    } catch (_e) {
        // Em qualquer falha, proteger a rota
        setFlashMessage({ 
            type: 'error', 
            title: 'Acesso Restrito', 
            message: 'Faça login para continuar.' 
        });
        window.location.href = '../../index.html';
        return;
    }

    // ====== Endereços: integração com IBGE (UF e municípios) e ViaCEP (CEP) ======
    const ufSelect = document.getElementById('estado-edit');
    const citySelect = document.getElementById('cidade-edit');
    const cepInput = document.getElementById('cep-edit');
    const ruaInput = document.getElementById('rua-edit');
    const bairroInput = document.getElementById('bairro-edit');

    // Campos da modal "Adicionar endereço"
    const ufAdd = document.getElementById('estado-add');
    const cityAdd = document.getElementById('cidade-add');
    const cepAdd = document.getElementById('cep-add');
    const ruaAdd = document.getElementById('rua-add');
    const bairroAdd = document.getElementById('bairro-add');

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
                populaUF(ufSelect);
                populaUF(ufAdd);
            }
        } catch (e) {
            if (ufSelect) ufSelect.innerHTML = '<option value="" disabled selected>UF</option>';
            if (ufAdd) ufAdd.innerHTML = '<option value="" disabled selected>UF</option>';
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

    fetchUFs().then(() => {
        if (ufSelect && citySelect) {
            ufSelect.addEventListener('change', () => {
                const uf = ufSelect.value;
                fetchCitiesByUF(uf, citySelect);
            });
        }
        if (ufAdd && cityAdd) {
            ufAdd.addEventListener('change', () => {
                const uf = ufAdd.value;
                fetchCitiesByUF(uf, cityAdd);
            });
        }
    });

    function aplicarMascaraCep(el) {
        let v = (el.value || '').replace(/\D/g, '');
        if (v.length > 8) v = v.slice(0, 8);
        if (v.length > 5) v = v.replace(/(\d{5})(\d{1,3})/, '$1-$2');
        el.value = v;
    }

    let lastCepChecked = null;
    let lastCepResult = null; // 'success' | 'error' | null

    if (cepInput) {
        cepInput.addEventListener('input', async function () {
            // máscara simples
            aplicarMascaraCep(this);

            const cleaned = (this.value || '').replace(/\D/g, '');
            if (cleaned.length !== 8) return;

            if (lastCepChecked === cleaned && lastCepResult === 'success') return;

            const data = await lookupCEP(this.value);
            if (data) {
                if (ruaInput && data.logradouro) ruaInput.value = data.logradouro;
                if (bairroInput && data.bairro) bairroInput.value = data.bairro;
                if (ufSelect && data.uf) {
                    ufSelect.value = data.uf;
                    await fetchCitiesByUF(data.uf, citySelect);
                    if (citySelect && data.localidade) citySelect.value = data.localidade;
                }
                showToast && showToast('Endereço encontrado pelo CEP.', { type: 'success', title: 'CEP' });
                lastCepChecked = cleaned;
                lastCepResult = 'success';
            } else {
                if (lastCepChecked !== cleaned || lastCepResult !== 'error') {
                    showToast && showToast('CEP não encontrado. Verifique e tente novamente.', { type: 'error', title: 'CEP' });
                }
                lastCepChecked = cleaned;
                lastCepResult = 'error';
            }
        });
    }

    let lastCepAddChecked = null;
    let lastCepAddResult = null; // 'success' | 'error' | null

    if (cepAdd) {
        cepAdd.addEventListener('input', async function () {
            aplicarMascaraCep(this);
            const cleaned = (this.value || '').replace(/\D/g, '');
            if (cleaned.length !== 8) return;

            if (lastCepAddChecked === cleaned && lastCepAddResult === 'success') return;

            const data = await lookupCEP(this.value);
            if (data) {
                if (ruaAdd && data.logradouro) ruaAdd.value = data.logradouro;
                if (bairroAdd && data.bairro) bairroAdd.value = data.bairro;
                if (ufAdd && data.uf) {
                    ufAdd.value = data.uf;
                    await fetchCitiesByUF(data.uf, cityAdd);
                    if (cityAdd && data.localidade) cityAdd.value = data.localidade;
                }
                showToast && showToast('Endereço encontrado pelo CEP.', { type: 'success', title: 'CEP' });
                lastCepAddChecked = cleaned;
                lastCepAddResult = 'success';
            } else {
                if (lastCepAddChecked !== cleaned || lastCepAddResult !== 'error') {
                    showToast && showToast('CEP não encontrado. Verifique e tente novamente.', { type: 'error', title: 'CEP' });
                }
                lastCepAddChecked = cleaned;
                lastCepAddResult = 'error';
            }
        });
    }

    // ====== Estado atual do usuário / helpers ======
    let currentUser = null;
    let currentUserId = null;
    let editingAddressId = null;

    function obterIniciais(nome) {
        const parts = String(nome || '').trim().split(/\s+/).filter(Boolean);
        if (parts.length === 0) return '';
        if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }

    function formatarDataBR(isoDate) {
        if (!isoDate) return '';
        try {
            // ALTERAÇÃO: Tratar data como string local para evitar problemas de timezone
            // Extrai apenas a parte da data (YYYY-MM-DD) ignorando hora/timezone
            const dateStr = String(isoDate).split('T')[0];
            const [yyyy, mm, dd] = dateStr.split('-');
            
            // Valida se tem os 3 componentes (ano, mês, dia)
            if (yyyy && mm && dd && yyyy.length === 4 && mm.length === 2 && dd.length === 2) {
                return `${dd}/${mm}/${yyyy}`;
            }
            
            // Fallback: tentar com Date se o formato não for YYYY-MM-DD
            const d = new Date(isoDate);
            if (!Number.isNaN(d.getTime())) {
                const day = String(d.getDate()).padStart(2, '0');
                const month = String(d.getMonth() + 1).padStart(2, '0');
                const year = d.getFullYear();
                return `${day}/${month}/${year}`;
            }
            
            return '';
        } catch (_e) { return ''; }
    }

    function formatarCPF(cpf) {
        const dig = String(cpf || '').replace(/\D/g, '').slice(0, 11);
        if (dig.length !== 11) return String(cpf || '');
        return dig.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    }

    function formatarTelefone(tel) {
        const d = String(tel || '').replace(/\D/g, '').slice(0, 11);
        if (d.length === 10) return d.replace(/(\d{2})(\d{4})(\d{4})/, '($1)$2-$3');
        if (d.length === 11) return d.replace(/(\d{2})(\d{5})(\d{4})/, '($1)$2-$3');
        return String(tel || '');
    }

    function setInfo(labelText, value) {
        const infos = Array.from(document.querySelectorAll('#dados-user .info'));
        const alvo = infos.find(i => (i.querySelector('.label')?.textContent || '').trim() === labelText);
        if (alvo) {
            const cont = alvo.querySelector('.cont');
            if (cont) cont.textContent = value || 'Informação não adicionada';
        }
    }

    async function resolveUserId() {
        if (currentUserId) return currentUserId;
        const u = getStoredUser();
        const candidate = u && (u.id || u.user_id || u.customer_id || u.pk);
        if (candidate) { currentUserId = candidate; return candidate; }
        try {
            const me = await fetchMe();
            const id = me && (me.id || me.user_id || me.customer_id || me.pk);
            currentUserId = id || null;
            return currentUserId;
        } catch (_e) { return null; }
    }

    // ALTERAÇÃO: Função para verificar se o usuário é cliente
    function isCliente(user) {
        if (!user) return false;
        // Verifica diferentes campos possíveis para o tipo/role do usuário
        const userType = (user.role || user.profile || user.type || user.user_type || 'customer').toLowerCase();
        // Retorna true apenas se for cliente/customer
        return userType === 'cliente' || userType === 'customer';
    }

    // ALTERAÇÃO: Função para ajustar navegação baseada no tipo de usuário
    function ajustarNavegacaoPorTipoUsuario(user) {
        const isUserCliente = isCliente(user);
        
        if (!isUserCliente) {
            // Para usuários não-clientes, ocultar itens específicos de cliente
            const navegaDivs = document.querySelectorAll('.navega > div, .navega > a');
            
            navegaDivs.forEach(item => {
                const texto = item.textContent.trim().toLowerCase();
                // Oculta: Ver pedidos, Endereços, Ver pontos
                if (texto.includes('ver pedidos') || 
                    texto.includes('endereços') || 
                    texto.includes('ver pontos')) {
                    item.style.display = 'none';
                }
            });
            
            // Ocultar seção de endereços completamente
            const enderecosSection = document.getElementById('enderecos');
            if (enderecosSection) {
                enderecosSection.style.display = 'none';
            }
            
            // Ocultar quadro de pontos Royal
            const quadroPontos = document.querySelector('.quadro-pontos-royal');
            if (quadroPontos) {
                quadroPontos.style.display = 'none';
            }
        }
    }

    function renderPerfil(user) {
        try {
            const fullName = user.full_name || user.name || user.nome || '';
            const email = user.email || '';
            const phone = user.phone || user.telefone || '';
            const cpf = user.cpf || '';
            const dob = user.date_of_birth || user.birth_date || user.nascimento || '';

            const perfilEl = document.querySelector('.quadro-navegacao .perfil');
            const nomeEl = document.querySelector('.quadro-navegacao .nome');
            if (perfilEl) perfilEl.textContent = obterIniciais(fullName || email || '');
            if (nomeEl) nomeEl.textContent = fullName || email || 'Minha conta';

            setInfo('Nome Completo', fullName);
            setInfo('CPF', formatarCPF(cpf));
            setInfo('Data de nascimento', formatarDataBR(dob));
            setInfo('E-mail', email);
            setInfo('Telefone', formatarTelefone(phone));
            
            // ALTERAÇÃO: Ajustar navegação baseado no tipo de usuário
            ajustarNavegacaoPorTipoUsuario(user);
        } catch (_e) { }
    }

    // ALTERAÇÃO: Função para calcular dias restantes até expiração dos pontos
    function calcularDiasRestantes(dataExpiracao) {
        if (!dataExpiracao) return null;
        try {
            const dataExp = new Date(dataExpiracao);
            if (isNaN(dataExp.getTime())) return null;
            
            const hoje = new Date();
            hoje.setHours(0, 0, 0, 0);
            dataExp.setHours(0, 0, 0, 0);
            
            const diffTime = dataExp - hoje;
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            
            return diffDays > 0 ? diffDays : 0;
        } catch (_e) {
            return null;
        }
    }

    // ALTERAÇÃO: Função para carregar e exibir pontos no quadro
    async function carregarPontosRoyal() {
        try {
            const userId = await resolveUserId();
            if (!userId) {
                // Se não tiver userId, exibir 0 pontos
                atualizarExibicaoPontos(0, null);
                return;
            }

            const balanceData = await getLoyaltyBalance(userId);
            
            if (!balanceData || typeof balanceData !== "object") {
                atualizarExibicaoPontos(0, null);
                return;
            }

            const pontos = Number(balanceData?.current_balance) || 0;
            const dataExpiracao = balanceData?.expiration_date || null;
            const diasRestantes = calcularDiasRestantes(dataExpiracao);

            atualizarExibicaoPontos(pontos, diasRestantes);
        } catch (err) {
            // Em caso de erro, exibir 0 pontos
            atualizarExibicaoPontos(0, null);
            // Não exibir erro para o usuário, apenas logar em desenvolvimento
            if (typeof window !== 'undefined' && window.DEBUG_MODE) {
                console.error('Erro ao carregar pontos:', err);
            }
        }
    }

    // ALTERAÇÃO: Função para atualizar a exibição dos pontos no quadro
    function atualizarExibicaoPontos(pontos, diasRestantes) {
        const pontosEl = document.querySelector('.quadro-pontos-royal .pontos p');
        const diasEl = document.querySelector('.quadro-pontos-royal .txt2 span');
        
        // Atualizar valor dos pontos
        if (pontosEl) {
            pontosEl.textContent = Math.max(0, Math.floor(pontos));
        }
        
        // Atualizar dias restantes
        if (diasEl) {
            if (diasRestantes !== null && diasRestantes > 0) {
                diasEl.textContent = diasRestantes;
                // Mostrar a mensagem de expiração
                const txt2El = document.querySelector('.quadro-pontos-royal .txt2');
                if (txt2El) {
                    txt2El.style.display = 'block';
                }
            } else {
                // Se não houver data de expiração ou já expirou, ocultar ou mostrar mensagem alternativa
                const txt2El = document.querySelector('.quadro-pontos-royal .txt2');
                if (txt2El) {
                    if (diasRestantes === 0) {
                        diasEl.textContent = '0';
                        txt2El.textContent = 'Seus pontos expiraram. Faça uma compra para renová-los!';
                    } else {
                        txt2El.textContent = 'Seus pontos não expiram enquanto você continuar comprando!';
                    }
                }
            }
        }
    }

    async function carregarPerfil() {
        try {
            const me = await fetchMe();
            currentUser = me || null;
            currentUserId = (me && (me.id || me.user_id || me.customer_id || me.pk)) || currentUserId;
            renderPerfil(me || {});
            
            // ALTERAÇÃO: Carregar endereços apenas se for cliente
            if (isCliente(me)) {
                await carregarEnderecos();
                // ALTERAÇÃO: Carregar pontos do Clube Royal apenas se for cliente
                await carregarPontosRoyal();
            }
            
            // ALTERAÇÃO: Processar hash da URL após carregar perfil e endereços
            setTimeout(() => {
                processarHashURL();
            }, 300);
            
            // sucesso
            // noop
        } catch (err) {
            toastFromApiError && toastFromApiError(err, 'Falha ao carregar seu perfil.');
            // ALTERAÇÃO: Tentar processar hash mesmo em caso de erro
            setTimeout(() => {
                processarHashURL();
            }, 300);
        }
    }

    // ====== Gerenciamento de 2FA ======
    let isProcessing2FA = false; // Flag para evitar múltiplas solicitações
    
    async function carregarStatus2FA() {
        try {
            const status = await get2FAStatus();
            
            // Encontrar o toggle específico da "Verificação em duas etapas"
            const infoChecaElements = document.querySelectorAll('#config .info-checa');
            let toggleElement = null;
            
            infoChecaElements.forEach(element => {
                const titulo = element.querySelector('.titulo');
                if (titulo && titulo.textContent.includes('Verificação em duas etapas')) {
                    toggleElement = element.querySelector('input[type="checkbox"]');
                }
            });
            
            if (toggleElement) {
                // Verificar se o status tem a propriedade esperada
                const isEnabled = status.two_factor_enabled || status.enabled || false;
                toggleElement.checked = isEnabled;
                
                // Atualizar visual do toggle
                const bolinha = toggleElement.nextElementSibling;
                if (bolinha) {
                    if (isEnabled) {
                        bolinha.style.backgroundColor = 'var(--color-primary)';
                        bolinha.querySelector('::before') && (bolinha.querySelector('::before').style.transform = 'translateX(22px)');
                    } else {
                        bolinha.style.backgroundColor = '#ccc';
                        bolinha.querySelector('::before') && (bolinha.querySelector('::before').style.transform = 'translateX(0)');
                    }
                }
            }
        } catch (error) {
            // ALTERAÇÃO: Log condicional apenas em modo debug
            if (typeof window !== 'undefined' && window.DEBUG_MODE) {
                console.error('Erro ao carregar status do 2FA:', error);
            }
            // Em caso de erro, definir como desabilitado
            const infoChecaElements = document.querySelectorAll('#config .info-checa');
            infoChecaElements.forEach(element => {
                const titulo = element.querySelector('.titulo');
                if (titulo && titulo.textContent.includes('Verificação em duas etapas')) {
                    const toggleElement = element.querySelector('input[type="checkbox"]');
                    if (toggleElement) {
                        toggleElement.checked = false;
                    }
                }
            });
        }
    }

    // Configurar toggle 2FA
    function configurarToggle2FA() {
        // Encontrar o toggle específico da "Verificação em duas etapas"
        const infoChecaElements = document.querySelectorAll('#config .info-checa');
        let toggleElement = null;
        
        // Procurar pelo elemento que contém "Verificação em duas etapas"
        infoChecaElements.forEach(element => {
            const titulo = element.querySelector('.titulo');
            if (titulo && titulo.textContent.includes('Verificação em duas etapas')) {
                toggleElement = element.querySelector('input[type="checkbox"]');
            }
        });
        
        if (toggleElement) {
            // Remover listeners existentes para evitar duplicação
            const newToggle = toggleElement.cloneNode(true);
            toggleElement.parentNode.replaceChild(newToggle, toggleElement);
            toggleElement = newToggle;
            
            // Adicionar listener no input
            toggleElement.addEventListener('change', async function() {
                // Evitar múltiplas solicitações simultâneas
                if (isProcessing2FA) {
                    // ALTERAÇÃO: Log condicional apenas em modo debug
                    if (typeof window !== 'undefined' && window.DEBUG_MODE) {
                        console.log('Já está processando uma solicitação 2FA, ignorando...');
                    }
                    return;
                }
                
                const isEnabled = this.checked;
                
                try {
                    if (isEnabled) {
                        isProcessing2FA = true;
                        
                        // Habilitar 2FA - Passo 1: Solicitar código
                        const result = await toggle2FA(true);
                        
                        if (result.requires_confirmation) {
                            showToast('Código de verificação enviado para seu email.', { 
                                type: 'info', 
                                title: 'Confirmação necessária' 
                            });
                            
                            // Abrir modal de confirmação
                            abrirModal('confirmar-2fa');
                            
                            // Limpar campo de código e focar
                            setTimeout(() => {
                                const codigoInput = document.getElementById('codigo-confirmacao-2fa');
                                if (codigoInput) {
                                    codigoInput.value = '';
                                    codigoInput.focus();
                                }
                            }, 100);
                        } else {
                            // Se não precisar de confirmação, atualizar status
                            await carregarStatus2FA();
                            isProcessing2FA = false;
                        }
                    } else {
                        // Desabilitar 2FA
                        const confirmed = await showConfirm({
                            title: 'Desabilitar 2FA',
                            message: 'Tem certeza que deseja desabilitar a verificação em duas etapas? Isso reduzirá a segurança da sua conta.',
                            confirmText: 'Desabilitar',
                            cancelText: 'Cancelar'
                        });
                        
                        if (confirmed) {
                            const result = await toggle2FA(false);
                            showToast('Verificação em duas etapas desabilitada.', { type: 'success' });
                            
                            // Atualizar status após desabilitar
                            await carregarStatus2FA();
                        } else {
                            // Reverter o toggle se cancelado
                            this.checked = true;
                        }
                    }
                } catch (error) {
                    // ALTERAÇÃO: Log condicional apenas em modo debug
                    if (typeof window !== 'undefined' && window.DEBUG_MODE) {
                        console.error('Erro ao alterar 2FA:', error);
                    }
                    toastFromApiError(error);
                    // Reverter o toggle em caso de erro
                    this.checked = !isEnabled;
                    isProcessing2FA = false;
                }
            });
            
            // Adicionar listener também no label para garantir que o clique seja capturado
            const label = toggleElement.closest('label');
            if (label) {
                label.addEventListener('click', function(e) {
                    // Pequeno delay para permitir que o checkbox seja atualizado
                    setTimeout(() => {
                        const checkbox = this.querySelector('input[type="checkbox"]');
                        if (checkbox) {
                            // Disparar evento change se necessário
                            checkbox.dispatchEvent(new Event('change'));
                        }
                    }, 10);
                });
            }
        }
    }

    // Configurar confirmação de 2FA
    function configurarConfirmacao2FA() {
        const btnConfirmar2FA = document.getElementById('btn-confirmar-2fa');
        const codigoInput = document.getElementById('codigo-confirmacao-2fa');
        const modal2FA = document.getElementById('confirmar-2fa');
        
        if (btnConfirmar2FA && codigoInput) {
            // Máscara para aceitar apenas números e limitar a 6 dígitos
            codigoInput.addEventListener('input', function() {
                let value = this.value.replace(/\D/g, '');
                if (value.length > 6) {
                    value = value.substring(0, 6);
                }
                this.value = value;
                
                // Ativar/desativar botão baseado no tamanho do código
                if (value.length === 6) {
                    btnConfirmar2FA.disabled = false;
                } else {
                    btnConfirmar2FA.disabled = true;
                }
            });

            btnConfirmar2FA.addEventListener('click', async function() {
                const codigo = codigoInput.value.trim();
                
                if (!codigo || codigo.length !== 6) {
                    showToast('Por favor, digite o código de 6 dígitos.', { type: 'error' });
                    return;
                }
                
                try {
                    this.disabled = true;
                    this.textContent = 'Confirmando...';
                    
                    const result = await confirm2FAEnable(codigo);
                    
                    if (result && result.message) {
                        showToast(result.message, { type: 'success' });
                    } else {
                        showToast('Verificação em duas etapas ativada com sucesso!', { type: 'success' });
                    }
                    
                    fecharModal('confirmar-2fa');
                    
                    // Atualizar status do toggle
                    await carregarStatus2FA();
                    
                    // Resetar flag de processamento
                    isProcessing2FA = false;
                    
                } catch (error) {
                    // ALTERAÇÃO: Log condicional apenas em modo debug
                    if (typeof window !== 'undefined' && window.DEBUG_MODE) {
                        console.error('Erro ao confirmar 2FA:', error);
                    }
                    toastFromApiError(error);
                    this.disabled = false;
                    this.textContent = 'Confirmar e Ativar';
                    // Resetar flag de processamento em caso de erro
                    isProcessing2FA = false;
                }
            });
        }

        // Configurar fechamento do modal e reversão do toggle
        if (modal2FA) {
            const overlay = modal2FA.querySelector('.div-overlay');
            const closeBtn = modal2FA.querySelector('.fa-xmark');
            
            const fecharModal2FA = () => {
                modal2FA.style.display = 'none';
                // Reverter o toggle para desabilitado (usuário cancelou a ativação)
                const infoChecaElements = document.querySelectorAll('#config .info-checa');
                infoChecaElements.forEach(element => {
                    const titulo = element.querySelector('.titulo');
                    if (titulo && titulo.textContent.includes('Verificação em duas etapas')) {
                        const toggleElement = element.querySelector('input[type="checkbox"]');
                        if (toggleElement) {
                            toggleElement.checked = false;
                        }
                    }
                });
                // Limpar o campo de código
                if (codigoInput) {
                    codigoInput.value = '';
                }
                // Resetar flag de processamento
                isProcessing2FA = false;
            };
            
            if (overlay) {
                overlay.addEventListener('click', fecharModal2FA);
            }
            
            if (closeBtn) {
                closeBtn.addEventListener('click', fecharModal2FA);
            }
        }
    }

    function criarCardEndereco(end) {
        const div = document.createElement('div');
        div.className = 'quadro-endereco';
        div.dataset.addressId = end.id || end.address_id;
        
        // ALTERAÇÃO: Sanitizar dados do endereço antes de inserir no innerHTML
        const street = escapeHTML(end.street || '');
        const number = escapeHTML(end.number || '');
        const neighborhood = escapeHTML(end.neighborhood || '');
        const city = escapeHTML(end.city || '');
        const state = escapeHTML(end.state || '');
        
        const tituloTexto = street + (number ? ', ' + number : '');
        const descricaoTexto = neighborhood + 
            (neighborhood && (city || state) ? ' - ' : '') + 
            city + 
            (city && state ? ' - ' : '') + 
            state;
        
        div.innerHTML = `
            <div style="display: flex; align-items: center; gap: 20px">
                <i class="fa-solid fa-location-dot"></i>
                <div>
                    <p class="titulo">${tituloTexto}</p>
                    <p class="descricao">${descricaoTexto}</p>
                </div>
            </div>
            <div style="display: flex; align-items: center; gap: 15px">
                <p class="edita" data-action="edit-address">Editar endereço</p>
                <i class="fa-solid fa-trash" data-action="delete-address" style="cursor: pointer; color: var(--color-secondary, #FF0000); font-size: 18px;" title="Excluir endereço"></i>
            </div>
        `;
        return div;
    }

    async function carregarEnderecos() {
        try {
            const userId = await resolveUserId();
            if (!userId) return;
            const lista = await listAddresses(userId);
            const container = document.getElementById('enderecos');
            if (!container) return;
            const addDiv = container.querySelector('.adiciona-ende');
            // Remove cards existentes (exceto adiciona-ende)
            Array.from(container.querySelectorAll('.quadro-endereco')).forEach(el => el.remove());
            if (Array.isArray(lista)) {
                lista.filter(a => a && (a.is_active === undefined || a.is_active === null || !!a.is_active))
                    .forEach(a => {
                        const card = criarCardEndereco(a);
                        container.insertBefore(card, addDiv || null);
                    });
            }
        } catch (err) {
            // silencioso na UI; pode logar/toast se desejado
        }
    }

    // ====== Máscaras de input ======
    // ALTERAÇÃO: Aplicar máscara de CPF em tempo real
    function aplicarMascaraCPF(input) {
        let valor = input.value.replace(/\D/g, '');
        if (valor.length > 11) valor = valor.slice(0, 11);
        if (valor.length <= 11) {
            valor = valor.replace(/(\d{3})(\d)/, '$1.$2');
            valor = valor.replace(/(\d{3})(\d)/, '$1.$2');
            valor = valor.replace(/(\d{3})(\d{1,2})$/, '$1-$2');
        }
        input.value = valor;
    }

    // ALTERAÇÃO: Aplicar máscara de telefone em tempo real
    function aplicarMascaraTelefone(input) {
        let valor = input.value.replace(/\D/g, '');
        if (valor.length > 11) valor = valor.slice(0, 11);
        if (valor.length <= 10) {
            valor = valor.replace(/(\d{2})(\d)/, '($1)$2');
            valor = valor.replace(/(\d{4})(\d)/, '$1-$2');
        } else {
            valor = valor.replace(/(\d{2})(\d)/, '($1)$2');
            valor = valor.replace(/(\d{5})(\d)/, '$1-$2');
        }
        input.value = valor;
    }

    // ALTERAÇÃO: Configurar máscaras nos inputs quando a página carregar
    // Nota: Este código já está dentro de $(document).ready, então não precisa de outro
    const cpfInput = document.getElementById('cpf');
    if (cpfInput) {
        cpfInput.addEventListener('input', function() {
            aplicarMascaraCPF(this);
        });
    }

    const telefoneInput = document.getElementById('telefone');
    if (telefoneInput) {
        telefoneInput.addEventListener('input', function() {
            aplicarMascaraTelefone(this);
        });
    }

    // ====== Preenchimento dos modais ao abrir ======
    const btnEditPerfil = document.querySelector("#dados-user .quadro-info .tema .edita");
    const btnEditContato = document.querySelectorAll("#dados-user .quadro-info .tema .edita")[1];

    if (btnEditPerfil) {
        btnEditPerfil.addEventListener('click', () => {
            const nomeInput = document.getElementById('nome');
            const cpfInput = document.getElementById('cpf');
            const nascInput = document.getElementById('nascimento');
            if (!currentUser) return;
            const fullName = currentUser.full_name || currentUser.name || '';
            const cpf = currentUser.cpf || '';
            const dob = currentUser.date_of_birth || currentUser.birth_date || '';
            if (nomeInput) nomeInput.value = fullName || '';
            // ALTERAÇÃO: Aplicar formatação ao preencher CPF
            if (cpfInput) {
                const cpfLimpo = String(cpf || '').replace(/\D/g, '');
                cpfInput.value = cpfLimpo;
                aplicarMascaraCPF(cpfInput);
            }
            if (nascInput) {
                const d = currentUser.date_of_birth || '';
                // manter em formato YYYY-MM-DD se possível
                if (d && /^\d{4}-\d{2}-\d{2}/.test(String(d))) {
                    nascInput.value = String(d).slice(0, 10);
                } else {
                    nascInput.value = '';
                }
            }
        });
    }

    if (btnEditContato) {
        btnEditContato.addEventListener('click', () => {
            const emailInput = document.getElementById('email');
            const telInput = document.getElementById('telefone');
            if (!currentUser) return;
            if (emailInput) emailInput.value = currentUser.email || '';
            // ALTERAÇÃO: Aplicar formatação ao preencher telefone
            if (telInput) {
                const telLimpo = String(currentUser.phone || currentUser.telefone || '').replace(/\D/g, '');
                telInput.value = telLimpo;
                aplicarMascaraTelefone(telInput);
            }
        });
    }

    // ====== Salvar edições dos modais ======
    // ALTERAÇÃO: Função para converter data de YYYY-MM-DD (formato do input date) para DD-MM-YYYY (formato esperado pela API)
    function converterDataISOparaBR(isoDate) {
        if (!isoDate) return null;
        try {
            // Se já está no formato DD-MM-YYYY, retorna como está
            if (/^\d{2}-\d{2}-\d{4}$/.test(isoDate)) {
                return isoDate;
            }
            // Converte de YYYY-MM-DD para DD-MM-YYYY
            const [yyyy, mm, dd] = String(isoDate).split('T')[0].split('-');
            if (yyyy && mm && dd && yyyy.length === 4 && mm.length === 2 && dd.length === 2) {
                return `${dd}-${mm}-${yyyy}`;
            }
            return null;
        } catch (_e) {
            return null;
        }
    }

    // ALTERAÇÃO: Função para validar CPF no frontend
    function validarCPF(cpf) {
        const cpfLimpo = String(cpf || '').replace(/\D/g, '');
        if (cpfLimpo.length === 0) return { valido: true, mensagem: '' }; // CPF é opcional
        if (cpfLimpo.length !== 11) {
            return { valido: false, mensagem: 'CPF deve conter 11 dígitos. Verifique se digitou corretamente.' };
        }
        // Validação básica de CPF (todos os dígitos iguais)
        if (/^(\d)\1{10}$/.test(cpfLimpo)) {
            return { valido: false, mensagem: 'CPF inválido. Não é permitido usar números repetidos (ex: 111.111.111-11).' };
        }
        return { valido: true, mensagem: '' };
    }

    // ALTERAÇÃO: Função para validar nome completo
    function validarNomeCompleto(nome) {
        if (!nome || nome.trim().length === 0) {
            return { valido: false, mensagem: 'O nome completo é obrigatório. Por favor, preencha este campo.' };
        }
        if (nome.trim().length < 3) {
            return { valido: false, mensagem: 'O nome completo deve ter pelo menos 3 caracteres.' };
        }
        if (nome.trim().length > 100) {
            return { valido: false, mensagem: 'O nome completo deve ter no máximo 100 caracteres.' };
        }
        // Verifica se tem pelo menos um espaço (nome completo)
        const partes = nome.trim().split(/\s+/).filter(p => p.length > 0);
        if (partes.length < 2) {
            return { valido: false, mensagem: 'Por favor, informe seu nome completo (nome e sobrenome).' };
        }
        return { valido: true, mensagem: '' };
    }

    // ALTERAÇÃO: Função para validar data de nascimento
    function validarDataNascimento(dataISO) {
        if (!dataISO || dataISO.trim() === '') {
            return { valido: false, mensagem: 'A data de nascimento é obrigatória. Por favor, selecione uma data.' };
        }
        const data = new Date(dataISO);
        if (isNaN(data.getTime())) {
            return { valido: false, mensagem: 'Data de nascimento inválida. Por favor, selecione uma data válida.' };
        }
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        if (data > hoje) {
            return { valido: false, mensagem: 'A data de nascimento não pode ser uma data futura.' };
        }
        // Verifica se a pessoa tem pelo menos 18 anos
        const idade = hoje.getFullYear() - data.getFullYear();
        const mesAniversario = hoje.getMonth() - data.getMonth();
        const diaAniversario = hoje.getDate() - data.getDate();
        const idadeReal = mesAniversario < 0 || (mesAniversario === 0 && diaAniversario < 0) ? idade - 1 : idade;
        if (idadeReal < 18) {
            return { valido: false, mensagem: 'Você deve ter pelo menos 18 anos para usar este serviço.' };
        }
        return { valido: true, mensagem: '' };
    }

    async function salvarPerfilBasico() {
        const userId = await resolveUserId();
        if (!userId) return;
        const nome = document.getElementById('nome')?.value?.trim();
        const cpf = document.getElementById('cpf')?.value;
        const nasc = document.getElementById('nascimento')?.value; // YYYY-MM-DD do input type="date"
        const payload = {};
        
        // ALTERAÇÃO: Validações específicas antes de enviar
        const erros = [];
        
        // Validação do nome
        if (nome && nome.length > 0) {
            const validacaoNome = validarNomeCompleto(nome);
            if (!validacaoNome.valido) {
                erros.push(validacaoNome.mensagem);
            } else {
                payload.full_name = nome;
            }
        }
        
        // Validação do CPF
        if (cpf !== undefined && cpf !== null && cpf !== '') {
            const cpfLimpo = String(cpf).replace(/\D/g, '');
            if (cpfLimpo.length > 0) {
                const validacaoCPF = validarCPF(cpf);
                if (!validacaoCPF.valido) {
                    erros.push(validacaoCPF.mensagem);
                } else {
                    payload.cpf = cpfLimpo;
                }
            }
        }
        
        // Validação da data de nascimento
        if (nasc && nasc.trim() !== '') {
            const validacaoData = validarDataNascimento(nasc);
            if (!validacaoData.valido) {
                erros.push(validacaoData.mensagem);
            } else {
                const dataConvertida = converterDataISOparaBR(nasc);
                if (dataConvertida) {
                    payload.date_of_birth = dataConvertida;
                } else {
                    erros.push('Erro ao processar a data de nascimento. Por favor, tente novamente.');
                }
            }
        }
        
        // ALTERAÇÃO: Exibir erros de validação se houver
        if (erros.length > 0) {
            const mensagemErro = erros.length === 1 
                ? erros[0] 
                : 'Por favor, corrija os seguintes erros:\n\n• ' + erros.join('\n• ');
            showToast && showToast(mensagemErro, { type: 'error', title: 'Erro de Validação' });
            return;
        }
        
        // ALTERAÇÃO: Valida se há pelo menos um campo para atualizar
        if (Object.keys(payload).length === 0) {
            showToast && showToast('Por favor, preencha pelo menos um campo para atualizar seus dados.', { 
                type: 'error', 
                title: 'Nenhum Campo Preenchido' 
            });
            return;
        }
        
        try {
            const resp = await updateMyCustomer(userId, payload);
            toastFromApiSuccess && toastFromApiSuccess(resp, 'Dados atualizados com sucesso!');
            fecharModal && fecharModal('editar-info-user');
            await carregarPerfil();
        } catch (err) {
            // ALTERAÇÃO: Tratamento específico de erros da API
            tratarErroAtualizacaoPerfil(err);
        }
    }

    // ALTERAÇÃO: Função para tratar erros específicos da atualização de perfil
    function tratarErroAtualizacaoPerfil(err) {
        const mensagemErro = err?.payload?.error || err?.message || '';
        const mensagemLower = mensagemErro.toLowerCase();
        
        // Erros específicos do backend
        if (mensagemLower.includes('cpf') && mensagemLower.includes('inválido')) {
            showToast && showToast('O CPF informado é inválido. Verifique se digitou corretamente (11 dígitos).', { 
                type: 'error', 
                title: 'CPF Inválido' 
            });
        } else if (mensagemLower.includes('data') && (mensagemLower.includes('inválida') || mensagemLower.includes('formato'))) {
            showToast && showToast('A data de nascimento informada é inválida. Por favor, selecione uma data válida.', { 
                type: 'error', 
                title: 'Data Inválida' 
            });
        } else if (mensagemLower.includes('nome') || mensagemLower.includes('full_name')) {
            showToast && showToast('O nome informado é inválido. Por favor, verifique se preencheu corretamente.', { 
                type: 'error', 
                title: 'Nome Inválido' 
            });
        } else if (mensagemLower.includes('nenhum campo válido') || mensagemLower.includes('no_valid_fields')) {
            showToast && showToast('Nenhum campo válido foi preenchido. Por favor, preencha pelo menos um campo para atualizar.', { 
                type: 'error', 
                title: 'Nenhum Campo Válido' 
            });
        } else {
            // Usar o tratamento padrão de erro da API
            toastFromApiError && toastFromApiError(err, 'Não foi possível atualizar seus dados. Verifique as informações e tente novamente.');
        }
    }

    // ALTERAÇÃO: Função para validar telefone
    function validarTelefone(telefone) {
        if (!telefone || telefone.trim() === '') {
            return { valido: false, mensagem: 'O telefone é obrigatório. Por favor, preencha este campo.' };
        }
        const telLimpo = String(telefone).replace(/\D/g, '');
        if (telLimpo.length < 10) {
            return { valido: false, mensagem: 'O telefone deve conter pelo menos 10 dígitos (DDD + número).' };
        }
        if (telLimpo.length > 11) {
            return { valido: false, mensagem: 'O telefone deve conter no máximo 11 dígitos (DDD + número com 9º dígito).' };
        }
        // Validação básica: não pode ser todos zeros
        if (/^0+$/.test(telLimpo)) {
            return { valido: false, mensagem: 'O telefone informado é inválido. Verifique se digitou corretamente.' };
        }
        return { valido: true, mensagem: '' };
    }

    async function salvarContato() {
        const userId = await resolveUserId();
        if (!userId) return;
        const email = document.getElementById('email')?.value?.trim();
        const tel = document.getElementById('telefone')?.value;
        const payload = {};
        
        // ALTERAÇÃO: Email não pode ser alterado diretamente (requer verificação)
        // A API retorna erro se tentar alterar email sem ser admin
        // Por enquanto, não enviamos email no payload para evitar erro
        // TODO: REVISAR implementar fluxo de verificação de email se necessário
        
        // ALTERAÇÃO: Validação do telefone
        const erros = [];
        if (tel !== undefined && tel !== null && tel !== '') {
            const validacaoTel = validarTelefone(tel);
            if (!validacaoTel.valido) {
                erros.push(validacaoTel.mensagem);
            } else {
                const telLimpo = String(tel).replace(/\D/g, '');
                payload.phone = telLimpo;
            }
        } else {
            erros.push('O telefone é obrigatório. Por favor, preencha este campo.');
        }
        
        // ALTERAÇÃO: Exibir erros de validação se houver
        if (erros.length > 0) {
            const mensagemErro = erros.length === 1 
                ? erros[0] 
                : 'Por favor, corrija os seguintes erros:\n\n• ' + erros.join('\n• ');
            showToast && showToast(mensagemErro, { type: 'error', title: 'Erro de Validação' });
            return;
        }
        
        // ALTERAÇÃO: Valida se há pelo menos um campo para atualizar
        if (Object.keys(payload).length === 0) {
            showToast && showToast('Por favor, preencha o telefone para atualizar seus dados de contato.', { 
                type: 'error', 
                title: 'Campo Obrigatório' 
            });
            return;
        }
        
        try {
            const resp = await updateMyCustomer(userId, payload);
            toastFromApiSuccess && toastFromApiSuccess(resp, 'Contato atualizado com sucesso!');
            fecharModal && fecharModal('editar-info-contato');
            await carregarPerfil();
        } catch (err) {
            // ALTERAÇÃO: Tratamento específico de erros da API
            tratarErroAtualizacaoContato(err);
        }
    }

    // ALTERAÇÃO: Função para tratar erros específicos da atualização de contato
    function tratarErroAtualizacaoContato(err) {
        const mensagemErro = err?.payload?.error || err?.message || '';
        const mensagemLower = mensagemErro.toLowerCase();
        
        // Erros específicos do backend
        if (mensagemLower.includes('telefone') && mensagemLower.includes('inválido')) {
            showToast && showToast('O telefone informado é inválido. Verifique se digitou corretamente (DDD + número).', { 
                type: 'error', 
                title: 'Telefone Inválido' 
            });
        } else if (mensagemLower.includes('phone') && mensagemLower.includes('invalid')) {
            showToast && showToast('O formato do telefone está incorreto. Use o formato (DDD) Número, por exemplo: (11) 98765-4321.', { 
                type: 'error', 
                title: 'Formato de Telefone Inválido' 
            });
        } else if (mensagemLower.includes('email') && (mensagemLower.includes('verificação') || mensagemLower.includes('verification'))) {
            showToast && showToast('Para alterar o e-mail, é necessário verificar o novo endereço. Esta funcionalidade estará disponível em breve.', { 
                type: 'error', 
                title: 'Alteração de E-mail' 
            });
        } else {
            // Usar o tratamento padrão de erro da API
            toastFromApiError && toastFromApiError(err, 'Não foi possível atualizar seus dados de contato. Verifique as informações e tente novamente.');
        }
    }

    const btnSalvarPerfil = document.querySelector('#editar-info-user .footer button');
    if (btnSalvarPerfil) btnSalvarPerfil.addEventListener('click', salvarPerfilBasico);

    const btnSalvarContato = document.querySelector('#editar-info-contato .footer button');
    if (btnSalvarContato) btnSalvarContato.addEventListener('click', salvarContato);

    // ====== Adicionar/Editar Endereço ======
    function normalizarOpcional(v) {
        if (v === undefined) return undefined;
        const s = String(v || '').trim();
        return s === '' ? null : s;
    }

    function configurarCheckboxesEnderecoPorModal(modalId) {
        const modal = document.getElementById(modalId);
        if (!modal) return;
        const checas = modal.querySelectorAll('.div-checa');
        const checaSemNumero = checas[0]?.querySelector('input[type="checkbox"]');
        const checaSemComplemento = checas[1]?.querySelector('input[type="checkbox"]');
        const numeroInput = modal.querySelector('input[id$="numero-add"], input[id$="numero-edit"]');
        const complementoInput = modal.querySelector('input[id$="complemento-add"], input[id$="complemento-edit"]');
        if (checaSemNumero && numeroInput) {
            checaSemNumero.addEventListener('change', () => {
                if (checaSemNumero.checked) {
                    numeroInput.value = '';
                    numeroInput.disabled = true;
                } else {
                    numeroInput.disabled = false;
                }
            });
        }
        if (checaSemComplemento && complementoInput) {
            checaSemComplemento.addEventListener('change', () => {
                if (checaSemComplemento.checked) {
                    complementoInput.value = '';
                }
            });
        }
        return { checaSemNumero, checaSemComplemento };
    }

    const controlesAdd = configurarCheckboxesEnderecoPorModal('adicionar-endereco') || {};
    const controlesEdit = configurarCheckboxesEnderecoPorModal('editar-endereco') || {};

    // ALTERAÇÃO: Função para normalizar e comparar endereços
    function normalizarEnderecoParaComparacao(endereco) {
        return {
            zip_code: String(endereco.zip_code || '').replace(/\D/g, '').toLowerCase().trim(),
            state: String(endereco.state || '').toLowerCase().trim(),
            city: String(endereco.city || '').toLowerCase().trim(),
            street: String(endereco.street || '').toLowerCase().trim(),
            neighborhood: String(endereco.neighborhood || '').toLowerCase().trim(),
            number: String(endereco.number || '').toLowerCase().trim(),
            complement: String(endereco.complement || '').toLowerCase().trim() || null
        };
    }

    // ALTERAÇÃO: Função para verificar se um endereço já existe
    function enderecoJaExiste(novoEndereco, enderecosExistentes) {
        const novoNormalizado = normalizarEnderecoParaComparacao(novoEndereco);
        
        return enderecosExistentes.some(end => {
            // Ignora endereços inativos
            if (end.is_active === false) return false;
            
            const existenteNormalizado = normalizarEnderecoParaComparacao(end);
            
            // Compara todos os campos principais
            return (
                novoNormalizado.zip_code === existenteNormalizado.zip_code &&
                novoNormalizado.state === existenteNormalizado.state &&
                novoNormalizado.city === existenteNormalizado.city &&
                novoNormalizado.street === existenteNormalizado.street &&
                novoNormalizado.neighborhood === existenteNormalizado.neighborhood &&
                novoNormalizado.number === existenteNormalizado.number &&
                novoNormalizado.complement === existenteNormalizado.complement
            );
        });
    }

    async function salvarEnderecoAdicionar() {
        const userId = await resolveUserId();
        if (!userId) return;
        const zip = document.getElementById('cep-add')?.value;
        const uf = document.getElementById('estado-add')?.value;
        const cidade = document.getElementById('cidade-add')?.value;
        const rua = document.getElementById('rua-add')?.value;
        const bairro = document.getElementById('bairro-add')?.value;
        const numero = document.getElementById('numero-add')?.value;
        const complemento = document.getElementById('complemento-add')?.value;
        const semNumeroMarcado = controlesAdd.checaSemNumero && controlesAdd.checaSemNumero.checked;
        const semComplementoMarcado = controlesAdd.checaSemComplemento && controlesAdd.checaSemComplemento.checked;
        
        // ALTERAÇÃO: Normalizar valores antes de criar payload
        const zipNormalizado = normalizarOpcional(zip && String(zip).replace(/\D/g, ''));
        const numeroNormalizado = semNumeroMarcado ? 'S/N' : normalizarOpcional(numero);
        const complementoNormalizado = semComplementoMarcado ? null : normalizarOpcional(complemento);
        
        const payload = {
            zip_code: zipNormalizado,
            state: uf,
            city: cidade,
            street: rua,
            neighborhood: bairro,
            number: numeroNormalizado,
            complement: complementoNormalizado
        };

        // ALTERAÇÃO: Verificar se o endereço já existe antes de adicionar
        try {
            const enderecosExistentes = await listAddresses(userId);
            if (enderecoJaExiste(payload, enderecosExistentes || [])) {
                const enderecoFormatado = `${rua || ''}${numeroNormalizado ? ', ' + numeroNormalizado : ''}${bairro ? ' - ' + bairro : ''}${cidade ? ', ' + cidade : ''}${uf ? ' - ' + uf : ''}`;
                showToast && showToast(
                    `Este endereço já está cadastrado: ${enderecoFormatado}. Por favor, verifique os dados ou edite o endereço existente.`,
                    { type: 'error', title: 'Endereço Duplicado' }
                );
                return;
            }
        } catch (err) {
            // Se não conseguir carregar endereços, continua tentando adicionar
            // O backend também pode validar duplicatas
            // ALTERAÇÃO: Log condicional apenas em modo debug
            if (typeof window !== 'undefined' && window.DEBUG_MODE) {
                console.warn('Não foi possível verificar endereços existentes:', err);
            }
        }

        try {
            const resp = await addAddress(userId, payload);
            toastFromApiSuccess && toastFromApiSuccess(resp, 'Endereço adicionado com sucesso!');
            fecharModal && fecharModal('adicionar-endereco');
            await carregarEnderecos();
        } catch (err) {
            // ALTERAÇÃO: Tratamento específico para erro de endereço duplicado
            const mensagemErro = err?.payload?.error || err?.message || '';
            const mensagemLower = mensagemErro.toLowerCase();
            
            if (mensagemLower.includes('duplicado') || mensagemLower.includes('já existe') || mensagemLower.includes('already exists')) {
                showToast && showToast(
                    'Este endereço já está cadastrado. Por favor, verifique os dados ou edite o endereço existente.',
                    { type: 'error', title: 'Endereço Duplicado' }
                );
            } else {
                toastFromApiError && toastFromApiError(err, 'Falha ao adicionar endereço. Verifique os dados e tente novamente.');
            }
        }
    }

    async function salvarEnderecoEditar() {
        if (!editingAddressId) return;
        const userId = await resolveUserId();
        if (!userId) return;
        const zip = document.getElementById('cep-edit')?.value;
        const ufv = document.getElementById('estado-edit')?.value;
        const cidadev = document.getElementById('cidade-edit')?.value;
        const rua = document.getElementById('rua-edit')?.value;
        const bairro = document.getElementById('bairro-edit')?.value;
        const numero = document.getElementById('numero-edit')?.value;
        const complemento = document.getElementById('complemento-edit')?.value;
        const semNumeroMarcado = controlesEdit.checaSemNumero && controlesEdit.checaSemNumero.checked;
        const semComplementoMarcado = controlesEdit.checaSemComplemento && controlesEdit.checaSemComplemento.checked;
        
        // ALTERAÇÃO: Normalizar valores antes de criar payload
        const zipNormalizado = normalizarOpcional(zip && String(zip).replace(/\D/g, ''));
        const numeroNormalizado = semNumeroMarcado ? 'S/N' : normalizarOpcional(numero);
        const complementoNormalizado = semComplementoMarcado ? null : normalizarOpcional(complemento);
        
        const payload = {
            zip_code: zipNormalizado,
            state: ufv,
            city: cidadev,
            street: rua,
            neighborhood: bairro,
            number: numeroNormalizado,
            complement: complementoNormalizado
        };

        // ALTERAÇÃO: Verificar se o endereço editado já existe em outro endereço (exceto o atual)
        try {
            const enderecosExistentes = await listAddresses(userId);
            // Filtra o endereço atual da lista para não comparar com ele mesmo
            const outrosEnderecos = (enderecosExistentes || []).filter(end => {
                const endId = end.id || end.address_id;
                return Number(endId) !== Number(editingAddressId);
            });
            
            if (enderecoJaExiste(payload, outrosEnderecos)) {
                const enderecoFormatado = `${rua || ''}${numeroNormalizado ? ', ' + numeroNormalizado : ''}${bairro ? ' - ' + bairro : ''}${cidadev ? ', ' + cidadev : ''}${ufv ? ' - ' + ufv : ''}`;
                showToast && showToast(
                    `Este endereço já está cadastrado em outro registro: ${enderecoFormatado}. Por favor, verifique os dados.`,
                    { type: 'error', title: 'Endereço Duplicado' }
                );
                return;
            }
        } catch (err) {
            // Se não conseguir carregar endereços, continua tentando atualizar
            // O backend também pode validar duplicatas
            // ALTERAÇÃO: Log condicional apenas em modo debug
            if (typeof window !== 'undefined' && window.DEBUG_MODE) {
                console.warn('Não foi possível verificar endereços existentes:', err);
            }
        }

        try {
            const resp = await updateAddress(editingAddressId, payload);
            toastFromApiSuccess && toastFromApiSuccess(resp, 'Endereço atualizado com sucesso!');
            fecharModal && fecharModal('editar-endereco');
            await carregarEnderecos();
        } catch (err) {
            // ALTERAÇÃO: Tratamento específico para erro de endereço duplicado
            const mensagemErro = err?.payload?.error || err?.message || '';
            const mensagemLower = mensagemErro.toLowerCase();
            
            if (mensagemLower.includes('duplicado') || mensagemLower.includes('já existe') || mensagemLower.includes('already exists')) {
                showToast && showToast(
                    'Este endereço já está cadastrado em outro registro. Por favor, verifique os dados.',
                    { type: 'error', title: 'Endereço Duplicado' }
                );
            } else {
                toastFromApiError && toastFromApiError(err, 'Falha ao atualizar endereço. Verifique os dados e tente novamente.');
            }
        }
    }

    const btnConfirmaAdd = document.querySelector('#adicionar-endereco .footer button');
    if (btnConfirmaAdd) btnConfirmaAdd.addEventListener('click', salvarEnderecoAdicionar);

    const btnConfirmaEdit = document.querySelector('#editar-endereco .footer button');
    if (btnConfirmaEdit) btnConfirmaEdit.addEventListener('click', salvarEnderecoEditar);

    // ALTERAÇÃO: Função para excluir endereço
    async function excluirEndereco(addressId) {
        try {
            const userId = await resolveUserId();
            if (!userId) {
                toastFromApiError && toastFromApiError({ message: 'Usuário não identificado.' }, 'Não foi possível identificar o usuário. Faça login novamente.');
                return;
            }
            const resp = await deleteAddress(userId, addressId);
            toastFromApiSuccess && toastFromApiSuccess(resp, 'Endereço excluído com sucesso!');
            await carregarEnderecos();
        } catch (err) {
            toastFromApiError && toastFromApiError(err, 'Não foi possível excluir o endereço. Tente novamente.');
        }
    }

    // Abrir modal de editar endereço a partir do card
    document.addEventListener('click', async (e) => {
        // ALTERAÇÃO: Tratar clique no botão de editar endereço
        const elEdit = e.target.closest('[data-action="edit-address"]');
        if (elEdit) {
            const card = elEdit.closest('.quadro-endereco');
            const addrId = card && (card.dataset.addressId ? Number(card.dataset.addressId) : null);
            if (!addrId) return;
            editingAddressId = addrId;
            try {
                // Encontrar dados no DOM já carregado
                const userId = await resolveUserId();
                const lista = await listAddresses(userId);
                const a = (lista || []).find(x => Number(x.id || x.address_id) === addrId);
                if (!a) return abrirModal && abrirModal('editar-endereco');
                // Preenche os campos
                const cepEl = document.getElementById('cep-edit');
                const ufEl = document.getElementById('estado-edit');
                const cidadeEl = document.getElementById('cidade-edit');
                const ruaEl = document.getElementById('rua-edit');
                const bairroEl = document.getElementById('bairro-edit');
                const numeroEl = document.getElementById('numero-edit');
                const complEl = document.getElementById('complemento-edit');
                if (cepEl) cepEl.value = a.zip_code ? String(a.zip_code).replace(/\D/g, '').replace(/(\d{5})(\d{1,3})/, '$1-$2') : '';
                if (ruaEl) ruaEl.value = a.street || '';
                if (bairroEl) bairroEl.value = a.neighborhood || '';
                if (numeroEl) numeroEl.value = a.number || '';
                if (complEl) complEl.value = a.complement || '';
                if (ufEl) {
                    ufEl.value = a.state || '';
                    await fetchCitiesByUF(a.state || '', cidadeEl);
                    if (cidadeEl) cidadeEl.value = a.city || '';
                }
                abrirModal && abrirModal('editar-endereco');
            } catch (_e) {
                abrirModal && abrirModal('editar-endereco');
            }
            return;
        }

        // ALTERAÇÃO: Tratar clique no botão de excluir endereço
        const elDelete = e.target.closest('[data-action="delete-address"]');
        if (elDelete) {
            e.preventDefault();
            e.stopPropagation();
            const card = elDelete.closest('.quadro-endereco');
            const addrId = card && (card.dataset.addressId ? Number(card.dataset.addressId) : null);
            if (!addrId) return;

            // Obter informações do endereço para exibir na confirmação
            let enderecoInfo = 'este endereço';
            try {
                const userId = await resolveUserId();
                const lista = await listAddresses(userId);
                const end = (lista || []).find(x => Number(x.id || x.address_id) === addrId);
                if (end) {
                    const rua = end.street || '';
                    const numero = end.number || '';
                    const bairro = end.neighborhood || '';
                    enderecoInfo = `${rua}${numero ? ', ' + numero : ''}${bairro ? ' - ' + bairro : ''}`;
                }
            } catch (_e) {
                // Se não conseguir obter informações, usa a mensagem padrão
            }

            // Confirmar exclusão
            const confirmed = await showConfirm({
                title: 'Excluir Endereço',
                message: `Tem certeza que deseja excluir o endereço "${enderecoInfo}"? Esta ação não pode ser desfeita.`,
                confirmText: 'Excluir',
                cancelText: 'Cancelar',
                type: 'delete'
            });

            if (confirmed) {
                await excluirEndereco(addrId);
            }
            return;
        }
    });

    // ====== Gerenciamento de Preferências de Notificação ======
    // ALTERAÇÃO: Função para carregar preferências de notificação
    async function carregarPreferenciasNotificacao() {
        try {
            const userId = await resolveUserId();
            if (!userId) return;

            const preferences = await getNotificationPreferences(userId);
            if (preferences) {
                atualizarCheckboxesNotificacao(preferences);
            } else {
                // Se não houver preferências, usar valores padrão (true)
                atualizarCheckboxesNotificacao({
                    notify_order_updates: true,
                    notify_promotions: true
                });
            }
        } catch (err) {
            // Em caso de erro, usar valores padrão
            atualizarCheckboxesNotificacao({
                notify_order_updates: true,
                notify_promotions: true
            });
            // ALTERAÇÃO: Log condicional apenas em modo debug
            if (typeof window !== 'undefined' && window.DEBUG_MODE) {
                console.error('Erro ao carregar preferências de notificação:', err);
            }
        }
    }

    // ALTERAÇÃO: Função auxiliar para converter valor do banco para boolean
    function converterParaBoolean(value) {
        // Se for boolean, retornar direto
        if (typeof value === 'boolean') {
            return value;
        }
        // Se for string, verificar se é 'true' ou 'false'
        if (typeof value === 'string') {
            return value.toLowerCase() === 'true' || value === '1';
        }
        // Se for número, verificar se é 1 (true) ou 0 (false)
        if (typeof value === 'number') {
            return value === 1;
        }
        // Se for null ou undefined, retornar true (padrão)
        if (value === null || value === undefined) {
            return true;
        }
        // Para qualquer outro valor, retornar true (padrão)
        return true;
    }

    // ALTERAÇÃO: Função para atualizar os checkboxes com as preferências
    function atualizarCheckboxesNotificacao(preferences) {
        // ALTERAÇÃO: Usar IDs específicos dos checkboxes em vez de seletores genéricos
        const checkboxPedidos = document.getElementById('notify-order-updates');
        const checkboxPromocoes = document.getElementById('notify-promotions');

        if (checkboxPedidos) {
            // ALTERAÇÃO: Converter explicitamente para boolean usando função auxiliar
            const value = converterParaBoolean(preferences.notify_order_updates);
            checkboxPedidos.checked = value;
            atualizarVisualToggle(checkboxPedidos);
        }

        if (checkboxPromocoes) {
            // ALTERAÇÃO: Converter explicitamente para boolean usando função auxiliar
            const value = converterParaBoolean(preferences.notify_promotions);
            checkboxPromocoes.checked = value;
            atualizarVisualToggle(checkboxPromocoes);
        }
    }

    // ALTERAÇÃO: Função para atualizar o visual do toggle
    function atualizarVisualToggle(checkbox) {
        const bolinha = checkbox.nextElementSibling;
        if (bolinha && bolinha.classList.contains('bolinha')) {
            if (checkbox.checked) {
                bolinha.style.backgroundColor = 'var(--color-primary)';
            } else {
                bolinha.style.backgroundColor = '#ccc';
            }
        }
    }

    // ALTERAÇÃO: Função para salvar preferências de notificação
    async function salvarPreferenciasNotificacao(notifyOrderUpdates, notifyPromotions) {
        try {
            const userId = await resolveUserId();
            if (!userId) {
                showToast && showToast('Não foi possível identificar o usuário.', { type: 'error', title: 'Erro' });
                return;
            }

            const preferences = {
                notify_order_updates: notifyOrderUpdates,
                notify_promotions: notifyPromotions
            };

            await updateNotificationPreferences(userId, preferences);
            // Não exibir toast de sucesso para não poluir a interface, já que é uma ação em tempo real
        } catch (err) {
            toastFromApiError && toastFromApiError(err, 'Não foi possível salvar as preferências de notificação.');
            // Reverter o checkbox em caso de erro
            await carregarPreferenciasNotificacao();
        }
    }

    // ALTERAÇÃO: Configurar eventos nos checkboxes de notificação
    function configurarCheckboxesNotificacao() {
        // ALTERAÇÃO: Usar IDs específicos dos checkboxes em vez de seletores genéricos
        const checkboxPedidos = document.getElementById('notify-order-updates');
        const checkboxPromocoes = document.getElementById('notify-promotions');
        
        // Checkbox de comunicações de pedidos
        if (checkboxPedidos) {
            // Remover listener anterior se existir (usando cloneNode para remover todos os event listeners)
            const newCheckboxPedidos = checkboxPedidos.cloneNode(true);
            checkboxPedidos.parentNode.replaceChild(newCheckboxPedidos, checkboxPedidos);
            
            newCheckboxPedidos.addEventListener('change', async function() {
                atualizarVisualToggle(this);
                const checkboxPromocoes = document.getElementById('notify-promotions');
                await salvarPreferenciasNotificacao(
                    this.checked,
                    checkboxPromocoes ? checkboxPromocoes.checked : true
                );
            });
        }

        // Checkbox de comunicações de promoções
        if (checkboxPromocoes) {
            // Remover listener anterior se existir (usando cloneNode para remover todos os event listeners)
            const newCheckboxPromocoes = checkboxPromocoes.cloneNode(true);
            checkboxPromocoes.parentNode.replaceChild(newCheckboxPromocoes, checkboxPromocoes);
            
            newCheckboxPromocoes.addEventListener('change', async function() {
                atualizarVisualToggle(this);
                const checkboxPedidos = document.getElementById('notify-order-updates');
                await salvarPreferenciasNotificacao(
                    checkboxPedidos ? checkboxPedidos.checked : true,
                    this.checked
                );
            });
        }
    }

    // Carrega perfil e endereços na entrada
    carregarPerfil();

    // Configurar funcionalidades de 2FA
    configurarToggle2FA();
    configurarConfirmacao2FA();
    
    // ALTERAÇÃO: Carregar e configurar preferências de notificação
    setTimeout(async () => {
        await carregarPreferenciasNotificacao();
        configurarCheckboxesNotificacao();
    }, 500);
    
    // Carregar status 2FA após um pequeno delay para garantir que o DOM esteja pronto
    setTimeout(async () => {
        await carregarStatus2FA();
    }, 500);

    // ALTERAÇÃO: Recarregar preferências de notificação quando a seção de configurações for exibida
    $(document).on('click', '.navega div:contains("Configurações")', async function() {
        setTimeout(async () => {
            await carregarPreferenciasNotificacao();
            await carregarStatus2FA();
        }, 100);
    });

    // Função de teste para debug (remover em produção)
    window.testarToggle2FA = function() {
        // ALTERAÇÃO: Log condicional apenas em modo debug (função de teste)
        if (typeof window !== 'undefined' && window.DEBUG_MODE) {
            console.log('=== TESTE TOGGLE 2FA ===');
            console.log('Flag isProcessing2FA:', isProcessing2FA);
        }
        
        // Encontrar o toggle específico da "Verificação em duas etapas"
        const infoChecaElements = document.querySelectorAll('#config .info-checa');
        let toggle = null;
        
        infoChecaElements.forEach(element => {
            const titulo = element.querySelector('.titulo');
            if (titulo && titulo.textContent.includes('Verificação em duas etapas')) {
                toggle = element.querySelector('input[type="checkbox"]');
            }
        });
        
        if (typeof window !== 'undefined' && window.DEBUG_MODE) {
            console.log('Toggle 2FA encontrado:', toggle);
        }
        
        if (toggle) {
            // ALTERAÇÃO: Log condicional apenas em modo debug
            if (typeof window !== 'undefined' && window.DEBUG_MODE) {
                console.log('Toggle checked:', toggle.checked);
                console.log('Toggle disabled:', toggle.disabled);
                console.log('Testando clique manual...');
            }
            toggle.checked = !toggle.checked;
            toggle.dispatchEvent(new Event('change'));
        } else {
            if (typeof window !== 'undefined' && window.DEBUG_MODE) {
                console.log('Toggle 2FA não encontrado! Verificando todos os toggles...');
            }
            
            // Listar todos os toggles disponíveis
            const allToggles = document.querySelectorAll('#config input[type="checkbox"]');
            allToggles.forEach((toggle, index) => {
                const parent = toggle.closest('.info-checa');
                const titulo = parent ? parent.querySelector('.titulo') : null;
                if (typeof window !== 'undefined' && window.DEBUG_MODE) {
                    console.log(`Toggle ${index + 1}:`, toggle, 'Título:', titulo ? titulo.textContent : 'N/A');
                }
            });
        }
    };

    // Função para resetar flag de processamento (para debug)
    window.resetarFlag2FA = function() {
        isProcessing2FA = false;
        // ALTERAÇÃO: Log condicional apenas em modo debug
        if (typeof window !== 'undefined' && window.DEBUG_MODE) {
            console.log('Flag isProcessing2FA resetada para false');
        }
    };

    // ====== FUNCIONALIDADES DA MODAL DE ALTERAR SENHA ======
    
    // Função para validar força da senha (igual ao cadastro)
    function validarSenhaForte(senha) {
        const requisitos = {
            maiuscula: /[A-Z]/.test(senha),
            numero: /\d/.test(senha),
            especial: /[!@#$%^&*(),.?":{}|<>]/.test(senha),
            tamanho: senha.length >= 8
        };

        // Atualizar visual dos requisitos
        const reqMaiuscula = document.getElementById('req-maiuscula-alt');
        const reqNumero = document.getElementById('req-numero-alt');
        const reqEspecial = document.getElementById('req-especial-alt');
        const reqTamanho = document.getElementById('req-tamanho-alt');

        if (reqMaiuscula) reqMaiuscula.classList.toggle('valid', requisitos.maiuscula);
        if (reqNumero) reqNumero.classList.toggle('valid', requisitos.numero);
        if (reqEspecial) reqEspecial.classList.toggle('valid', requisitos.especial);
        if (reqTamanho) reqTamanho.classList.toggle('valid', requisitos.tamanho);

        return Object.values(requisitos).every(req => req);
    }

    // Função para configurar toggle de visibilidade da senha
    function configurarToggleSenha(input, mostrar, ocultar) {
        mostrar.addEventListener('click', function () {
            input.type = 'text';
            mostrar.style.display = 'none';
            ocultar.style.display = 'flex';
        });

        ocultar.addEventListener('click', function () {
            input.type = 'password';
            mostrar.style.display = 'flex';
            ocultar.style.display = 'none';
        });
    }

    // Configurar toggles de senha para a modal de alterar senha
    function configurarTogglesSenha() {
        // Senha atual
        const senhaAtualInput = document.getElementById('senha-atual');
        const mostrarSenhaAtual = document.getElementById('mostrarSenhaAtual');
        const ocultarSenhaAtual = document.getElementById('ocultarSenhaAtual');

        if (senhaAtualInput && mostrarSenhaAtual && ocultarSenhaAtual) {
            configurarToggleSenha(senhaAtualInput, mostrarSenhaAtual, ocultarSenhaAtual);
        }

        // Nova senha
        const novaSenhaInput = document.getElementById('nova-senha');
        const mostrarNovaSenha = document.getElementById('mostrarNovaSenha');
        const ocultarNovaSenha = document.getElementById('ocultarNovaSenha');

        if (novaSenhaInput && mostrarNovaSenha && ocultarNovaSenha) {
            configurarToggleSenha(novaSenhaInput, mostrarNovaSenha, ocultarNovaSenha);
        }

        // Confirmar senha
        const confirmaSenhaInput = document.getElementById('confirma-senha-alter');
        const mostrarConfirmaSenha = document.getElementById('mostrarConfirmaSenhaAlt');
        const ocultarConfirmaSenha = document.getElementById('ocultarConfirmaSenhaAlt');

        if (confirmaSenhaInput && mostrarConfirmaSenha && ocultarConfirmaSenha) {
            configurarToggleSenha(confirmaSenhaInput, mostrarConfirmaSenha, ocultarConfirmaSenha);
        }
    }

    // Função para revalidar botão de alterar senha
    function revalidarBotaoAlterarSenha() {
        const btnAlterarSenha = document.getElementById('btn-confirmar-alterar-senha');
        if (!btnAlterarSenha) return;

        const senhaAtual = document.getElementById('senha-atual')?.value?.trim() || '';
        const novaSenha = document.getElementById('nova-senha')?.value?.trim() || '';
        const confirmaSenha = document.getElementById('confirma-senha-alter')?.value?.trim() || '';

        const senhaAtualPreenchida = senhaAtual !== '';
        const novaSenhaValida = novaSenha !== '' && validarSenhaForte(novaSenha);
        const senhasCoincidem = novaSenha === confirmaSenha && confirmaSenha !== '';
        const senhasDiferentes = senhaAtual !== novaSenha;

        const todosValidos = senhaAtualPreenchida && novaSenhaValida && senhasCoincidem && senhasDiferentes;

        if (todosValidos) {
            btnAlterarSenha.classList.remove('inativo');
            btnAlterarSenha.disabled = false;
        } else {
            btnAlterarSenha.classList.add('inativo');
            btnAlterarSenha.disabled = true;
        }
    }

    // Configurar validações em tempo real
    function configurarValidacoesSenha() {
        const senhaAtualInput = document.getElementById('senha-atual');
        const novaSenhaInput = document.getElementById('nova-senha');
        const confirmaSenhaInput = document.getElementById('confirma-senha-alter');

        // Validação da nova senha em tempo real
        if (novaSenhaInput) {
            novaSenhaInput.addEventListener('input', function () {
                const senha = this.value;
                validarSenhaForte(senha);
                revalidarBotaoAlterarSenha();
            });

            novaSenhaInput.addEventListener('blur', function () {
                const senha = this.value;
                const senhaAtual = document.getElementById('senha-atual')?.value || '';
                
                if (senha && senha === senhaAtual) {
                    showToast('A nova senha deve ser diferente da senha atual.', { type: 'error' });
                    this.classList.add('error');
                    this.classList.remove('valid');
                } else if (senha && validarSenhaForte(senha)) {
                    this.classList.remove('error');
                    this.classList.add('valid');
                }
                
                revalidarBotaoAlterarSenha();
            });
        }

        // Validação da confirmação de senha
        if (confirmaSenhaInput) {
            confirmaSenhaInput.addEventListener('blur', function () {
                const novaSenha = document.getElementById('nova-senha')?.value || '';
                const confirmaSenha = this.value;

                if (confirmaSenha && novaSenha !== confirmaSenha) {
                    this.classList.add('error');
                    this.classList.remove('valid');
                    showToast('As senhas não coincidem.', { type: 'error' });
                } else if (confirmaSenha && novaSenha === confirmaSenha) {
                    this.classList.remove('error');
                    this.classList.add('valid');
                } else {
                    this.classList.remove('error', 'valid');
                }

                revalidarBotaoAlterarSenha();
            });
        }

        // Validação da senha atual
        if (senhaAtualInput) {
            senhaAtualInput.addEventListener('input', revalidarBotaoAlterarSenha);
        }
    }

    // Função para mostrar erro abaixo do input (padrão do cadastro)
    function mostrarErroInput(inputId, mensagem) {
        const input = document.getElementById(inputId);
        if (!input) return;
        
        const divInput = input.closest('.div-input');
        if (!divInput) return;
        
        const mensagemErro = divInput.querySelector('.mensagem-erro');
        
        // Adicionar classe de erro
        input.classList.add('error');
        input.classList.remove('valid');
        
        if (!mensagemErro) {
            const erro = document.createElement('div');
            erro.className = 'mensagem-erro';
            erro.textContent = mensagem;
            divInput.appendChild(erro);
        } else {
            mensagemErro.textContent = mensagem;
        }
    }

    // Função para limpar erro do input (padrão do cadastro)
    function limparErroInput(inputId) {
        const input = document.getElementById(inputId);
        if (!input) return;
        
        const divInput = input.closest('.div-input');
        if (!divInput) return;
        
        const mensagemErro = divInput.querySelector('.mensagem-erro');
        
        // Remover classe de erro
        input.classList.remove('error');
        
        if (mensagemErro) {
            mensagemErro.remove();
        }
    }

    // Função para limpar todos os erros da modal de alterar senha
    function limparTodosErrosSenha() {
        limparErroInput('senha-atual');
        limparErroInput('nova-senha');
        limparErroInput('confirma-senha-alter');
    }

    // Função para alterar senha
    async function alterarSenha() {
        const senhaAtual = document.getElementById('senha-atual')?.value?.trim() || '';
        const novaSenha = document.getElementById('nova-senha')?.value?.trim() || '';
        const confirmaSenha = document.getElementById('confirma-senha-alter')?.value?.trim() || '';

        // Limpar erros anteriores
        limparTodosErrosSenha();

        // Validações finais
        if (!senhaAtual) {
            mostrarErroInput('senha-atual', 'Por favor, digite sua senha atual.');
            return;
        }

        if (!novaSenha) {
            mostrarErroInput('nova-senha', 'Por favor, digite a nova senha.');
            return;
        }

        if (!validarSenhaForte(novaSenha)) {
            mostrarErroInput('nova-senha', 'A nova senha não atende aos requisitos de segurança.');
            return;
        }

        if (novaSenha !== confirmaSenha) {
            mostrarErroInput('confirma-senha-alter', 'As senhas não coincidem.');
            return;
        }

        if (senhaAtual === novaSenha) {
            mostrarErroInput('nova-senha', 'A nova senha deve ser diferente da senha atual.');
            return;
        }

        const btnAlterarSenha = document.getElementById('btn-confirmar-alterar-senha');
        
        try {
            // Desabilitar botão e mostrar loading
            btnAlterarSenha.disabled = true;
            btnAlterarSenha.textContent = 'Alterando...';

            // Chamar API - sempre revoga todos os tokens por segurança
            const result = await changePasswordWithLogout(senhaAtual, novaSenha);
            
            showToast('Senha alterada com sucesso! Você foi desconectado por segurança.', { type: 'success' });
            
            // Fechar modal
            fecharModal('alterar-senha');
            
            // Fazer logout local e redirecionar para login
            setTimeout(() => {
                logoutLocal();
                window.location.href = '../../index.html';
            }, 2000);
            
        } catch (error) {
            // ALTERAÇÃO: Log condicional apenas em modo debug
            if (typeof window !== 'undefined' && window.DEBUG_MODE) {
                console.error('Erro ao alterar senha:', error);
            }
            
            // Tratar erros específicos da API
            const errorMessage = error?.payload?.error || error?.message || 'Falha ao alterar senha.';
            
            if (errorMessage.toLowerCase().includes('senha atual') || 
                errorMessage.toLowerCase().includes('senha incorreta') ||
                errorMessage.toLowerCase().includes('credenciais')) {
                mostrarErroInput('senha-atual', errorMessage);
            } else if (errorMessage.toLowerCase().includes('nova senha') ||
                       errorMessage.toLowerCase().includes('senha fraca') ||
                       errorMessage.toLowerCase().includes('requisitos')) {
                mostrarErroInput('nova-senha', errorMessage);
            } else {
                // Erro geral - mostrar no campo de senha atual
                mostrarErroInput('senha-atual', errorMessage);
            }
        } finally {
            // Reabilitar botão
            btnAlterarSenha.disabled = false;
            btnAlterarSenha.textContent = 'Alterar Senha';
        }
    }

    // Configurar botão de alterar senha
    function configurarBotaoAlterarSenha() {
        const btnAlterarSenha = document.getElementById('btn-confirmar-alterar-senha');
        if (btnAlterarSenha) {
            btnAlterarSenha.addEventListener('click', alterarSenha);
        }
    }

    // Configurar validação e limpeza de erros
    function configurarValidacaoInputs() {
        const inputs = [
            { id: 'senha-atual', validacao: validarSenhaAtual },
            { id: 'nova-senha', validacao: validarNovaSenha },
            { id: 'confirma-senha-alter', validacao: validarConfirmacaoSenha }
        ];
        
        inputs.forEach(({ id, validacao }) => {
            const input = document.getElementById(id);
            if (input) {
                // Limpar erro ao digitar
                input.addEventListener('input', () => {
                    limparErroInput(id);
                });
                
                // Validar ao sair do campo (blur)
                input.addEventListener('blur', () => {
                    validacao(input);
                });
            }
        });
    }

    // Função para validar senha atual
    function validarSenhaAtual(input) {
        const senha = input.value.trim();
        if (senha && senha.length < 6) {
            mostrarErroInput('senha-atual', 'A senha deve ter pelo menos 6 caracteres.');
            return false;
        }
        return true;
    }

    // Função para validar nova senha
    function validarNovaSenha(input) {
        const senha = input.value.trim();
        if (senha && !validarSenhaForte(senha)) {
            mostrarErroInput('nova-senha', 'A nova senha não atende aos requisitos de segurança.');
            return false;
        }
        return true;
    }

    // Função para validar confirmação de senha
    function validarConfirmacaoSenha(input) {
        const confirmaSenha = input.value.trim();
        const novaSenha = document.getElementById('nova-senha')?.value?.trim() || '';
        
        if (confirmaSenha && novaSenha && confirmaSenha !== novaSenha) {
            mostrarErroInput('confirma-senha-alter', 'As senhas não coincidem.');
            return false;
        }
        return true;
    }

    // Inicializar funcionalidades da modal de alterar senha
    function inicializarModalAlterarSenha() {
        configurarTogglesSenha();
        configurarValidacoesSenha();
        configurarBotaoAlterarSenha();
        configurarValidacaoInputs();
        
        // Revalidar botão inicialmente
        revalidarBotaoAlterarSenha();
    }

    // Chamar inicialização quando a modal for aberta
    $(document).on('click', '.edita:contains("Alterar senha")', function() {
        setTimeout(() => {
            inicializarModalAlterarSenha();
        }, 100);
    });


    // ALTERAÇÃO: Função para processar hash da URL e abrir modais/seções apropriadas
    function processarHashURL() {
        const hash = window.location.hash;
        
        if (hash === '#editar-endereco' || hash === '#enderecos') {
            // Verificar se é cliente antes de mostrar endereços
            const u = currentUser || getStoredUser();
            const isUserCliente = isCliente(u);
            
            if (!isUserCliente) {
                // Se não for cliente, não fazer nada
                return;
            }
            
            // Mostrar seção de endereços
            $("#dados-user, #config").hide();
            $("#enderecos").show();
            
            // Atualizar navegação
            $(".navega div").removeClass("select");
            $(".navega div:contains('Endereços')").addClass("select");
            
            // Se o hash for #editar-endereco, abrir modal apropriada
            if (hash === '#editar-endereco') {
                // Aguardar um pouco para garantir que a página carregou completamente
                setTimeout(async () => {
                    try {
                        const userId = await resolveUserId();
                        if (!userId) {
                            // Se não conseguir identificar usuário, abrir modal de adicionar
                            abrirModal && abrirModal('adicionar-endereco');
                            return;
                        }
                        
                        const lista = await listAddresses(userId);
                        
                        // Se não houver endereços, abrir modal de adicionar
                        if (!lista || lista.length === 0) {
                            abrirModal && abrirModal('adicionar-endereco');
                        } else {
                            // ALTERAÇÃO: Se houver endereços, abrir modal de editar com o primeiro endereço pré-preenchido
                            const primeiroEndereco = lista[0];
                            if (primeiroEndereco) {
                                editingAddressId = Number(primeiroEndereco.id || primeiroEndereco.address_id);
                                
                                // Preencher campos da modal de editar
                                const cepEl = document.getElementById('cep-edit');
                                const ufEl = document.getElementById('estado-edit');
                                const cidadeEl = document.getElementById('cidade-edit');
                                const ruaEl = document.getElementById('rua-edit');
                                const bairroEl = document.getElementById('bairro-edit');
                                const numeroEl = document.getElementById('numero-edit');
                                const complEl = document.getElementById('complemento-edit');
                                
                                if (cepEl) cepEl.value = primeiroEndereco.zip_code ? String(primeiroEndereco.zip_code).replace(/\D/g, '').replace(/(\d{5})(\d{1,3})/, '$1-$2') : '';
                                if (ruaEl) ruaEl.value = primeiroEndereco.street || '';
                                if (bairroEl) bairroEl.value = primeiroEndereco.neighborhood || '';
                                if (numeroEl) numeroEl.value = primeiroEndereco.number || '';
                                if (complEl) complEl.value = primeiroEndereco.complement || '';
                                
                                if (ufEl && primeiroEndereco.state) {
                                    ufEl.value = primeiroEndereco.state;
                                    await fetchCitiesByUF(primeiroEndereco.state, cidadeEl);
                                    if (cidadeEl && primeiroEndereco.city) {
                                        cidadeEl.value = primeiroEndereco.city;
                                    }
                                }
                                
                                abrirModal && abrirModal('editar-endereco');
                            } else {
                                abrirModal && abrirModal('adicionar-endereco');
                            }
                        }
                    } catch (err) {
                        // Em caso de erro, abrir modal de adicionar
                        abrirModal && abrirModal('adicionar-endereco');
                    }
                }, 500);
            }
        }
    }

    // mostra "dados da conta" ao entrar
    $("#dados-user").show();
    $("#enderecos, #config").hide();

    // já marca "Dados da conta" como selecionado
    $(".navega div:contains('Dados da conta')").addClass("select");
    
    // ALTERAÇÃO: Ouvir mudanças no hash da URL
    window.addEventListener('hashchange', () => {
        processarHashURL();
    });

    // clique nos botões
    $(".navega div").click(function () {
        // ALTERAÇÃO: Verificar se o item não está oculto (pode ser oculto para não-clientes)
        if ($(this).css('display') === 'none') {
            return; // Não fazer nada se o item estiver oculto
        }

        let texto = $(this).find("p").text().trim();

        // remove a classe de todos e adiciona só no clicado
        $(".navega div").removeClass("select");
        $(this).addClass("select");

        // esconde tudo
        $("#dados-user, #enderecos, #config").hide();

        // ALTERAÇÃO: Verificar tipo de usuário antes de exibir seções
        const u = currentUser || getStoredUser();
        const isUserCliente = isCliente(u);

        // verifica qual botão foi clicado
        if (texto === "Dados da conta") {
            $("#dados-user").show();
        }
        else if (texto === "Endereços" && isUserCliente) {
            // ALTERAÇÃO: Só exibir endereços se for cliente
            $("#enderecos").show();
        }
        else if (texto === "Configurações") {
            $("#config").show();
        }
    });

    // Logout
    const logoutBtn = document.querySelector('.logout button');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            const confirmed = await showConfirm({
                title: 'Sair da conta',
                message: 'Deseja realmente sair da sua conta?',
                confirmText: 'Sair',
                cancelText: 'Cancelar',
                type: 'warning'
            });
            if (!confirmed) return;
            try {
                await logout();
                toastFromApiSuccess({ msg: 'Logout realizado com sucesso.' });
            } catch (err) {
                // Mesmo se a API não tiver logout de servidor, garantimos o local
                logoutLocal();
                toastFromApiError(err, 'Você foi desconectado.');
            } finally {
                setTimeout(() => {
                    window.location.href = '../../index.html';
                }, 1200);
            }
        });
    }


    // Excluir conta (inativação)
    const deleteLink = document.querySelector('.logout p');
    if (deleteLink) {
        deleteLink.style.cursor = 'pointer';
        deleteLink.addEventListener('click', async () => {
            const confirmed = await showConfirm({
                title: 'Excluir conta',
                message: 'Tem certeza? Sua conta será inativada e você será desconectado.',
                confirmText: 'Excluir',
                cancelText: 'Cancelar',
                type: 'delete'
            });
            if (!confirmed) return;

            // Resolve ID do usuário logado
            async function resolveUserId() {
                const u = getStoredUser();
                const candidate = u && (u.id || u.user_id || u.customer_id || u.pk);
                if (candidate) return candidate;
                try {
                    const me = await fetchMe();
                    return me && (me.id || me.user_id || me.customer_id || me.pk);
                } catch (_e) {
                    return null;
                }
            }

            try {
                const userId = await resolveUserId();
                if (!userId) throw new Error('Não foi possível identificar o usuário.');
                const resp = await deleteMyCustomer(userId);
                toastFromApiSuccess(resp, 'Conta excluída com sucesso.');
            } catch (err) {
                toastFromApiError(err, 'Falha ao excluir sua conta.');
                return;
            }

            // Após exclusão, garantir logout local e redirecionar
            try { await logout(); } catch (_e) { logoutLocal(); }
            setTimeout(() => {
                window.location.href = '../../index.html';
            }, 1200);
        });
    }
});