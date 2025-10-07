import { logout, fetchMe, toggle2FA, confirm2FAEnable, get2FAStatus } from "../api/auth.js";
import { deleteMyCustomer, updateMyCustomer, addAddress, listAddresses, updateAddress, deleteAddress, changePassword } from "../api/user.js";
import { getStoredUser, logoutLocal } from "../api/api.js";
import { showConfirm, toastFromApiError, toastFromApiSuccess, setFlashMessage, showToast } from "./alerts.js";

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
            // aceita 'YYYY-MM-DD' ou ISO completo
            const d = new Date(isoDate);
            if (Number.isNaN(d.getTime())) {
                const [yyyy, mm, dd] = String(isoDate).split('T')[0].split('-');
                if (yyyy && mm && dd) return `${dd}/${mm}/${yyyy}`;
                return '';
            }
            const dd = String(d.getDate()).padStart(2, '0');
            const mm = String(d.getMonth() + 1).padStart(2, '0');
            const yyyy = d.getFullYear();
            return `${dd}/${mm}/${yyyy}`;
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
        } catch (_e) { }
    }

    async function carregarPerfil() {
        try {
            const me = await fetchMe();
            currentUser = me || null;
            currentUserId = (me && (me.id || me.user_id || me.customer_id || me.pk)) || currentUserId;
            renderPerfil(me || {});
            await carregarEnderecos();
            // sucesso
            // noop
        } catch (err) {
            toastFromApiError && toastFromApiError(err, 'Falha ao carregar seu perfil.');
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
            console.error('Erro ao carregar status do 2FA:', error);
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
                    console.log('Já está processando uma solicitação 2FA, ignorando...');
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
                    console.error('Erro ao alterar 2FA:', error);
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
                    console.error('Erro ao confirmar 2FA:', error);
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
        div.innerHTML = `
            <div style="display: flex; align-items: center; gap: 20px">
                <i class="fa-solid fa-location-dot"></i>
                <div>
                    <p class="titulo">${(end.street || '') + (end.number ? ', ' + end.number : '')}</p>
                    <p class="descricao">${(end.neighborhood || '')}${end.neighborhood && (end.city || end.state) ? ' - ' : ''}${(end.city || '')}${end.city && end.state ? ' - ' : ''}${(end.state || '')}</p>
                </div>
            </div>
            <p class="edita" data-action="edit-address">Editar endereço</p>
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
            if (cpfInput) cpfInput.value = String(cpf || '').replace(/\D/g, '');
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
            if (telInput) telInput.value = String(currentUser.phone || currentUser.telefone || '');
        });
    }

    // ====== Salvar edições dos modais ======
    async function salvarPerfilBasico() {
        const userId = await resolveUserId();
        if (!userId) return;
        const nome = document.getElementById('nome')?.value?.trim();
        const cpf = document.getElementById('cpf')?.value;
        const nasc = document.getElementById('nascimento')?.value; // YYYY-MM-DD
        const payload = {};
        if (nome) payload.full_name = nome;
        if (cpf !== undefined) payload.cpf = String(cpf || '').replace(/\D/g, '') || null;
        if (nasc) payload.date_of_birth = nasc;
        try {
            const resp = await updateMyCustomer(userId, payload);
            toastFromApiSuccess && toastFromApiSuccess(resp, 'Dados atualizados.');
            fecharModal && fecharModal('editar-info-user');
            await carregarPerfil();
        } catch (err) {
            toastFromApiError && toastFromApiError(err, 'Falha ao atualizar seus dados.');
        }
    }

    async function salvarContato() {
        const userId = await resolveUserId();
        if (!userId) return;
        const email = document.getElementById('email')?.value?.trim();
        const tel = document.getElementById('telefone')?.value;
        const payload = {};
        if (email) payload.email = email;
        if (tel !== undefined) payload.phone = String(tel || '').replace(/\D/g, '') || null;
        try {
            const resp = await updateMyCustomer(userId, payload);
            toastFromApiSuccess && toastFromApiSuccess(resp, 'Contato atualizado.');
            fecharModal && fecharModal('editar-info-contato');
            await carregarPerfil();
        } catch (err) {
            toastFromApiError && toastFromApiError(err, 'Falha ao atualizar contato.');
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
        const payload = {
            zip_code: normalizarOpcional(zip && String(zip).replace(/\D/g, '')),
            state: uf,
            city: cidade,
            street: rua,
            neighborhood: bairro,
            // Backend exige 'number'. Se marcado sem número, enviar 'S/N'
            number: semNumeroMarcado ? 'S/N' : normalizarOpcional(numero),
            complement: semComplementoMarcado ? null : normalizarOpcional(complemento)
        };
        try {
            const resp = await addAddress(userId, payload);
            toastFromApiSuccess && toastFromApiSuccess(resp, 'Endereço adicionado.');
            fecharModal && fecharModal('adicionar-endereco');
            await carregarEnderecos();
        } catch (err) {
            toastFromApiError && toastFromApiError(err, 'Falha ao adicionar endereço.');
        }
    }

    async function salvarEnderecoEditar() {
        if (!editingAddressId) return;
        const zip = document.getElementById('cep-edit')?.value;
        const ufv = document.getElementById('estado-edit')?.value;
        const cidadev = document.getElementById('cidade-edit')?.value;
        const rua = document.getElementById('rua-edit')?.value;
        const bairro = document.getElementById('bairro-edit')?.value;
        const numero = document.getElementById('numero-edit')?.value;
        const complemento = document.getElementById('complemento-edit')?.value;
        const semNumeroMarcado = controlesEdit.checaSemNumero && controlesEdit.checaSemNumero.checked;
        const semComplementoMarcado = controlesEdit.checaSemComplemento && controlesEdit.checaSemComplemento.checked;
        const payload = {
            zip_code: normalizarOpcional(zip && String(zip).replace(/\D/g, '')),
            state: ufv,
            city: cidadev,
            street: rua,
            neighborhood: bairro,
            number: semNumeroMarcado ? 'S/N' : normalizarOpcional(numero),
            complement: semComplementoMarcado ? null : normalizarOpcional(complemento)
        };
        try {
            const resp = await updateAddress(editingAddressId, payload);
            toastFromApiSuccess && toastFromApiSuccess(resp, 'Endereço atualizado.');
            fecharModal && fecharModal('editar-endereco');
            await carregarEnderecos();
        } catch (err) {
            toastFromApiError && toastFromApiError(err, 'Falha ao atualizar endereço.');
        }
    }

    const btnConfirmaAdd = document.querySelector('#adicionar-endereco .footer button');
    if (btnConfirmaAdd) btnConfirmaAdd.addEventListener('click', salvarEnderecoAdicionar);

    const btnConfirmaEdit = document.querySelector('#editar-endereco .footer button');
    if (btnConfirmaEdit) btnConfirmaEdit.addEventListener('click', salvarEnderecoEditar);

    // Abrir modal de editar endereço a partir do card
    document.addEventListener('click', async (e) => {
        const el = e.target.closest('[data-action="edit-address"]');
        if (!el) return;
        const card = el.closest('.quadro-endereco');
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
    });

    // Carrega perfil e endereços na entrada
    carregarPerfil();

    // Configurar funcionalidades de 2FA
    configurarToggle2FA();
    configurarConfirmacao2FA();
    
    // Carregar status 2FA após um pequeno delay para garantir que o DOM esteja pronto
    setTimeout(async () => {
        await carregarStatus2FA();
    }, 500);

    // Recarregar status 2FA quando a seção de configurações for exibida
    $(document).on('click', '.navega div:contains("Configurações")', async function() {
        setTimeout(async () => {
            await carregarStatus2FA();
        }, 100);
    });

    // Função de teste para debug (remover em produção)
    window.testarToggle2FA = function() {
        console.log('=== TESTE TOGGLE 2FA ===');
        console.log('Flag isProcessing2FA:', isProcessing2FA);
        
        // Encontrar o toggle específico da "Verificação em duas etapas"
        const infoChecaElements = document.querySelectorAll('#config .info-checa');
        let toggle = null;
        
        infoChecaElements.forEach(element => {
            const titulo = element.querySelector('.titulo');
            if (titulo && titulo.textContent.includes('Verificação em duas etapas')) {
                toggle = element.querySelector('input[type="checkbox"]');
            }
        });
        
        console.log('Toggle 2FA encontrado:', toggle);
        
        if (toggle) {
            console.log('Toggle checked:', toggle.checked);
            console.log('Toggle disabled:', toggle.disabled);
            
            // Testar clique manual
            console.log('Testando clique manual...');
            toggle.checked = !toggle.checked;
            toggle.dispatchEvent(new Event('change'));
        } else {
            console.log('Toggle 2FA não encontrado! Verificando todos os toggles...');
            
            // Listar todos os toggles disponíveis
            const allToggles = document.querySelectorAll('#config input[type="checkbox"]');
            allToggles.forEach((toggle, index) => {
                const parent = toggle.closest('.info-checa');
                const titulo = parent ? parent.querySelector('.titulo') : null;
                console.log(`Toggle ${index + 1}:`, toggle, 'Título:', titulo ? titulo.textContent : 'N/A');
            });
        }
    };

    // Função para resetar flag de processamento (para debug)
    window.resetarFlag2FA = function() {
        isProcessing2FA = false;
        console.log('Flag isProcessing2FA resetada para false');
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

            // Chamar API
            const result = await changePassword(senhaAtual, novaSenha);
            
            showToast('Senha alterada com sucesso!', { type: 'success' });
            
            // Fechar modal
            fecharModal('alterar-senha');
            
        } catch (error) {
            console.error('Erro ao alterar senha:', error);
            
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


    // mostra "dados da conta" ao entrar
    $("#dados-user").show();
    $("#enderecos, #config").hide();

    // já marca "Dados da conta" como selecionado
    $(".navega div:contains('Dados da conta')").addClass("select");

    // clique nos botões
    $(".navega div").click(function () {

        let texto = $(this).find("p").text().trim();

        // remove a classe de todos e adiciona só no clicado
        $(".navega div").removeClass("select");
        $(this).addClass("select");

        // esconde tudo
        $("#dados-user, #enderecos, #config").hide();

        // verifica qual botão foi clicado
        if (texto === "Dados da conta") {
            $("#dados-user").show();
        }
        else if (texto === "Endereços") {
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