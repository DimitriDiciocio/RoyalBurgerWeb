// src/js/ui/alerts.js

const DEFAULT_AUTO_CLOSE_MS = 4000;

// ====== MODELOS (HTML) ======
function ensureMessageModels() {
    let errorBar = document.querySelector('.modelo-erro-modal');
    let alertModal = document.querySelector('.modelo-alert-modal');

    if (!errorBar) {
        errorBar = document.createElement('div');
        errorBar.className = 'modelo-erro-modal';
        errorBar.style.display = 'none';
        errorBar.innerHTML = `
            <i class="fa-solid fa-x"></i>
            <div>
                <p class="errao">Erro</p>
                <p class="motivo">Ocorreu um erro.</p>
            </div>
        `;
        document.body.appendChild(errorBar);
    }

    if (!alertModal) {
        alertModal = document.createElement('div');
        alertModal.className = 'modelo-alert-modal';
        alertModal.style.display = 'none';
        alertModal.innerHTML = `
            <div class="modal-o"></div>
            <div class="modelo-msg-body">
                <div class="icon-msg">
                    <img alt="logo-royal-burguer">
                    <div class="icon-msg-delete" style="display:none">
                        <i class="fa-solid fa-trash"></i>
                        <div class="icon-msg-delete-text"><p></p></div>
                    </div>
                    <div class="icon-msg-sucess" style="display:none">
                        <i class="fa-solid fa-check"></i>
                        <div class="icon-msg-sucess-text"><p></p></div>
                    </div>
                    <div class="icon-msg-aviso" style="display:none">
                        <i class="fa-solid fa-exclamation-triangle"></i>
                        <div class="icon-msg-aviso-text"><p></p></div>
                    </div>
                    <div class="icon-msg-info" style="display:none">
                        <i class="fa-solid fa-info-circle"></i>
                        <div class="icon-msg-info-text"><p></p></div>
                    </div>
                </div>
                <div class="bnt">
                    <button class="cancelar">Cancelar</button>
                    <button class="confirmar">Confirmar</button>
                </div>
            </div>
        `;
        document.body.appendChild(alertModal);
    }

    // Ajusta o src da logo dinamicamente
    try {
        const logoImg = alertModal.querySelector('.icon-msg img');
        if (logoImg) {
            const computeLogo = (typeof window !== 'undefined' && typeof window.getLogoSvgPath === 'function')
                ? window.getLogoSvgPath
                : (() => {
                    const currentPath = window.location.pathname;
                    const isInPagesFolder = currentPath.includes('/pages/') || currentPath.includes('pages/');
                    const isInSrcFolder = currentPath.includes('/src/') || currentPath.includes('src/');
                    if (isInPagesFolder && isInSrcFolder) return '../../src/assets/svg/logo.svg';
                    if (isInPagesFolder) return '../../assets/svg/logo.svg';
                    if (isInSrcFolder) return '../assets/svg/logo.svg';
                    return 'src/assets/svg/logo.svg';
                });
            logoImg.src = computeLogo();
            // fallback em caso de erro
            const alternatives = [
                '../assets/svg/logo.svg',
                '../../assets/svg/logo.svg',
                'src/assets/svg/logo.svg',
                './src/assets/svg/logo.svg',
                './assets/svg/logo.svg'
            ];
            let idx = 0;
            logoImg.onerror = () => {
                if (idx < alternatives.length) {
                    logoImg.src = alternatives[idx++];
                }
            };
        }
    } catch (_e) { }

    return { errorBar, alertModal };
}

// ====== API: Mostrar faixa de erro ======
export function showErrorBar(title = 'Erro', message = 'Ocorreu um erro.', { autoClose = DEFAULT_AUTO_CLOSE_MS } = {}) {
    const { errorBar } = ensureMessageModels();
    const titleEl = errorBar.querySelector('.errao');
    const msgEl = errorBar.querySelector('.motivo');
    if (titleEl) titleEl.textContent = title;
    if (msgEl) msgEl.textContent = message;
    errorBar.style.display = 'flex';
    if (autoClose && Number.isFinite(autoClose)) {
        setTimeout(() => { errorBar.style.display = 'none'; }, autoClose);
    }
    return { close: () => errorBar && (errorBar.style.display = 'none') };
}

// ====== API: Modal de ação (não erro) ======
export function showActionModal({ type = 'info', message = '', confirmText = 'Confirmar', cancelText = 'Cancelar' } = {}) {
    const { alertModal } = ensureMessageModels();

    // Esconde todos ícones/legendas
    alertModal.querySelectorAll('.icon-msg-delete, .icon-msg-sucess, .icon-msg-aviso, .icon-msg-info').forEach(el => el.style.display = 'none');
    let blockSelector = '.icon-msg-info';
    if (type === 'success') blockSelector = '.icon-msg-sucess';
    else if (type === 'warning') blockSelector = '.icon-msg-aviso';
    else if (type === 'delete' || type === 'error-delete') blockSelector = '.icon-msg-delete';
    const block = alertModal.querySelector(blockSelector);
    if (block) {
        const p = block.querySelector('p');
        if (p) p.textContent = message || '';
        block.style.display = '';
    }

    // Botões
    const btnCancel = alertModal.querySelector('.cancelar');
    const btnConfirm = alertModal.querySelector('.confirmar');
    if (btnCancel) btnCancel.textContent = cancelText || 'Cancelar';
    if (btnConfirm) btnConfirm.textContent = confirmText || 'Confirmar';

    // Estilização por variante via classe
    alertModal.classList.remove('delete', 'success', 'warning', 'info');
    alertModal.classList.add(type === 'delete' ? 'delete' : type);

    // Regras de visibilidade: em success e info, esconder o cancelar
    if (btnCancel) {
        if (type === 'success' || type === 'info') {
            btnCancel.style.display = 'none';
        } else {
            btnCancel.style.display = '';
        }
    }

    alertModal.style.display = 'block';

    return new Promise(resolve => {
        const close = (result) => {
            alertModal.style.display = 'none';
            resolve(result);
        };
        const overlay = alertModal.querySelector('.modal-o');
        const onOverlay = (e) => { if (e.target === overlay) { cleanup(); close(false); } };
        const onCancel = () => { cleanup(); close(false); };
        const onConfirm = () => { cleanup(); close(true); };

        function cleanup() {
            if (overlay) overlay.removeEventListener('click', onOverlay);
            if (btnCancel) btnCancel.removeEventListener('click', onCancel);
            if (btnConfirm) btnConfirm.removeEventListener('click', onConfirm);
        }

        if (overlay) overlay.addEventListener('click', onOverlay);
        if (btnCancel) btnCancel.addEventListener('click', onCancel);
        if (btnConfirm) btnConfirm.addEventListener('click', onConfirm);
    });
}

// ====== Compat: manter API antiga, mas delegar para os novos modais ======
function ensureToastContainer() {
    let container = document.querySelector('.rb-toasts-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'rb-toasts-container';
        document.body.appendChild(container);
    }
    return container;
}

export function showToast(message, { type = 'info', title, autoClose = DEFAULT_AUTO_CLOSE_MS, noButtons = false } = {}) {
    if (type === 'error') {
        return showErrorBar(title || 'Erro', message, { autoClose });
    }
    
    // Se noButtons for true, usa apenas a barra de erro estilizada
    if (noButtons) {
        return showErrorBar(title || 'Aviso', message, { autoClose });
    }
    
    // Para compatibilidade, mensagens não-erro vão para o modal de ação,
    // com botão único Confirmar.
    showActionModal({ type, message, confirmText: 'Confirmar', cancelText: 'Fechar' });
    return { close: () => { } };
}

export function showConfirm({ title = 'Confirmação', message = 'Deseja continuar?', confirmText = 'Confirmar', cancelText = 'Cancelar', type = 'warning' } = {}) {
    // Usa o modal de ação padronizado
    return showActionModal({ type: type === 'error' ? 'warning' : type, message, confirmText, cancelText });
}

export function toastFromApiError(err, fallback = 'Ocorreu um erro.') {
    let title = 'Erro';
    let msg = (err && (err.payload?.error || err.payload?.message || err.message)) || fallback;
    
    // Tratamento específico para erros de conexão
    if (err?.isConnectionError || err?.status === 0) {
        title = 'Problema de Conexão';
        msg = 'Não foi possível conectar ao servidor. Verifique se a API está rodando e sua conexão com a internet.';
    } else if (err?.status >= 500) {
        title = 'Servidor Indisponível';
        msg = 'O servidor está temporariamente indisponível. Tente novamente em alguns minutos.';
    } else if (err?.status === 404) {
        title = 'Serviço Não Encontrado';
        msg = 'O serviço solicitado não foi encontrado. Verifique se o servidor está rodando corretamente.';
    }
    
    return showErrorBar(title, msg);
}

export function toastFromApiSuccess(resp, fallback = 'Operação realizada com sucesso.') {
    const msg = (resp && (resp.message || resp.msg)) || fallback;
    return showActionModal({ type: 'success', message: msg, confirmText: 'OK', cancelText: 'Fechar' });
}


// ====== Flash message entre páginas ======
const FLASH_STORAGE_KEY = 'rb.flash';

export function setFlashMessage({ message = '', type = 'info', title = '' } = {}) {
    try {
        localStorage.setItem(FLASH_STORAGE_KEY, JSON.stringify({ message, type, title }));
    } catch (_e) { }
}

export function tryShowFlashFromStorage() {
    let raw = null;
    try { raw = localStorage.getItem(FLASH_STORAGE_KEY); } catch (_e) { raw = null; }
    if (!raw) return;
    try { localStorage.removeItem(FLASH_STORAGE_KEY); } catch (_e) { }
    try {
        const data = JSON.parse(raw);
        const { message = '', type = 'info', title = '' } = data || {};
        if (!message) return;
        if (type === 'error') {
            showErrorBar(title || 'Erro', message);
        } else {
            showActionModal({ type, message, confirmText: 'OK', cancelText: 'Fechar' });
        }
    } catch (_e) { }
}

if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', tryShowFlashFromStorage);
}

