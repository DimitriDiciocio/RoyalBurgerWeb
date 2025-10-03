import { logout, fetchMe } from "../api/auth.js";
import { deleteMyCustomer, updateMyCustomer, addAddress, listAddresses, updateAddress, deleteAddress } from "../api/user.js";
import { getStoredUser, logoutLocal } from "../api/api.js";
import { showConfirm, toastFromApiError, toastFromApiSuccess, setFlashMessage, showToast } from "./alerts.js";

$(document).ready(function () {
    // ====== Guarda de rota: somente clientes podem acessar esta página ======
    try {
        const u = getStoredUser();
        const role = u && (u.role || u.user_role || u.type);
        const isCustomer = String(role || '').toLowerCase() === 'customer';
        if (!isCustomer) {
            setFlashMessage({
                type: 'error',
                title: 'Acesso Restrito',
                message: 'Você precisa estar logado como cliente para acessar esta página.'
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
            message: 'Faça login como cliente para continuar.' 
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