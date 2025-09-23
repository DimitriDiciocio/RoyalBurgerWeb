// src/js/ui/alerts.js

const DEFAULT_AUTO_CLOSE_MS = 4000;

const ICONS_BY_TYPE = {
    success: '<i class="fa-solid fa-circle-check"></i>',
    error: '<i class="fa-solid fa-circle-xmark"></i>',
    warning: '<i class="fa-solid fa-triangle-exclamation"></i>',
    info: '<i class="fa-solid fa-circle-info"></i>'
};

function ensureToastContainer() {
    let container = document.querySelector('.rb-toasts-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'rb-toasts-container';
        document.body.appendChild(container);
    }
    return container;
}

export function showToast(message, { type = 'info', title, autoClose = DEFAULT_AUTO_CLOSE_MS, actions = [] } = {}) {
    const container = ensureToastContainer();

    const toast = document.createElement('div');
    toast.className = `rb-toast ${type}`;

    const iconHtml = ICONS_BY_TYPE[type] || ICONS_BY_TYPE.info;
    const titleHtml = title ? `<div class="rb-toast-title">${title}</div>` : '';
    const actionsHtml = Array.isArray(actions) && actions.length
        ? `<div class="rb-toast-actions">${actions.map(a => `<button class="rb-toast-action" data-action-id="${a.id || ''}">${a.label}</button>`).join('')}</div>`
        : '';

    toast.innerHTML = `
        <div class="rb-toast-icon">${iconHtml}</div>
        <div class="rb-toast-content">
            ${titleHtml}
            <div class="rb-toast-message">${message}</div>
            ${actionsHtml}
        </div>
        <button class="rb-toast-close" aria-label="Fechar">&times;</button>
    `;

    const close = () => {
        toast.classList.add('closing');
        toast.addEventListener('animationend', () => toast.remove(), { once: true });
    };

    toast.querySelector('.rb-toast-close').addEventListener('click', close);

    if (Array.isArray(actions)) {
        toast.querySelectorAll('.rb-toast-action').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-action-id');
                const action = actions.find(a => (a.id || '') === id);
                if (action && typeof action.onClick === 'function') {
                    action.onClick(close);
                }
            });
        });
    }

    container.appendChild(toast);

    if (autoClose && Number.isFinite(autoClose)) {
        setTimeout(close, autoClose);
    }

    return { close };
}

export function showConfirm({ title = 'Confirmação', message = 'Deseja continuar?', confirmText = 'Confirmar', cancelText = 'Cancelar', type = 'warning' } = {}) {
    return new Promise(resolve => {
        let overlay = document.querySelector('.rb-confirm-overlay');
        if (overlay) overlay.remove();
        overlay = document.createElement('div');
        overlay.className = 'rb-confirm-overlay';

        const modal = document.createElement('div');
        modal.className = `rb-confirm ${type}`;
        modal.innerHTML = `
            <div class="rb-confirm-header">
                <div class="rb-confirm-icon">${ICONS_BY_TYPE[type] || ICONS_BY_TYPE.info}</div>
                <div class="rb-confirm-title">${title}</div>
                <button class="rb-confirm-close" aria-label="Fechar">&times;</button>
            </div>
            <div class="rb-confirm-message">${message}</div>
            <div class="rb-confirm-actions">
                <button class="rb-btn rb-btn-cancel">${cancelText}</button>
                <button class="rb-btn rb-btn-confirm ${type}">${confirmText}</button>
            </div>
        `;

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        const cleanup = () => overlay.remove();
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                cleanup();
                resolve(false);
            }
        });
        modal.querySelector('.rb-confirm-close').addEventListener('click', () => { cleanup(); resolve(false); });
        modal.querySelector('.rb-btn-cancel').addEventListener('click', () => { cleanup(); resolve(false); });
        modal.querySelector('.rb-btn-confirm').addEventListener('click', () => { cleanup(); resolve(true); });
    });
}

export function toastFromApiError(err, fallback = 'Ocorreu um erro.') {
    const msg = (err && (err.payload?.error || err.payload?.message || err.message)) || fallback;
    return showToast(msg, { type: 'error', title: 'Erro' });
}

export function toastFromApiSuccess(resp, fallback = 'Operação realizada com sucesso.') {
    const msg = (resp && (resp.message || resp.msg)) || fallback;
    return showToast(msg, { type: 'success', title: 'Sucesso' });
}


