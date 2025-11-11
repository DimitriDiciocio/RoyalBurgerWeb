// Utilitário para obter jQuery (se presente)
function getJQ() {
  return window.jQuery || window.$ || null;
}

// Abre modal por id ou elemento
function abrirModal(target) {
  const jq = getJQ();
  const el = typeof target === 'string' ? document.getElementById(target) : target;
  if (!el) return;

  // Garantir que a modal está completamente visível e interativa
  el.style.pointerEvents = 'auto';
  el.style.display = 'flex';

  // Com jQuery: anima com opacity, preservando display:flex
  if (jq) {
    const $el = jq(el);
    $el.stop(true, true).css({ display: 'flex', opacity: 0, pointerEvents: 'auto' }).animate({ opacity: 1 }, 200);
    return;
  }

  // Sem jQuery: só exibe
  el.style.display = 'flex';
  el.style.opacity = '1';
  el.style.pointerEvents = 'auto';
}

// Fecha modal por id ou elemento
function fecharModal(target) {
  const jq = getJQ();
  const el = typeof target === 'string' ? document.getElementById(target) : target;
  if (!el) return;

  // Desabilitar interações imediatamente
  el.style.pointerEvents = 'none';

  // Resetar campos ao fechar quando marcado
  try {
    if (el.hasAttribute('data-reset-on-close')) {
      const inputs = el.querySelectorAll('input, select, textarea');
      inputs.forEach((inp) => {
        if (inp.tagName === 'SELECT') {
          inp.selectedIndex = 0;
          inp.dispatchEvent(new Event('change'));
        } else if (inp.type === 'checkbox' || inp.type === 'radio') {
          inp.checked = false;
          inp.dispatchEvent(new Event('change'));
        } else {
          inp.value = '';
          inp.dispatchEvent(new Event('input'));
          inp.dispatchEvent(new Event('change'));
        }
      });
    }
  } catch (_e) {}

  // Função para finalizar o fechamento
  const finalizeClose = () => {
    el.style.display = 'none';
    el.style.opacity = '0';
    el.style.pointerEvents = 'none';
    // Garantir que o body não tenha overflow hidden residual
    document.body.style.overflow = '';
  };

  if (jq) {
    const $el = jq(el);
    $el.stop(true, true).animate({ opacity: 0 }, 160, finalizeClose);
    return;
  }

  // Sem jQuery: fechar imediatamente
  finalizeClose();
}

// Expor globalmente para uso em onClick inline
window.abrirModal = abrirModal;
window.fecharModal = fecharModal;

// Exportar para uso em módulos
export { abrirModal, fecharModal };

// Delegação para abrir/fechar via atributos data-
document.addEventListener('click', function (e) {
  const openBtn = e.target.closest('[data-open-modal]');
  if (openBtn) {
    const id = openBtn.getAttribute('data-open-modal');
    if (id) abrirModal(id);
    return;
  }

  const closeBtn = e.target.closest('[data-close-modal]');
  if (closeBtn) {
    const id = closeBtn.getAttribute('data-close-modal');
    if (id) {
      fecharModal(id);
    } else {
      const modal = closeBtn.closest('.modal');
      if (modal) fecharModal(modal);
    }
    return;
  }
});

// Clique no overlay fecha (quando clica no contêiner .modal ou no div-overlay)
document.addEventListener('click', function (e) {
  // Verificar se clicou no overlay (.div-overlay)
  const overlay = e.target.classList && e.target.classList.contains('div-overlay') ? e.target : null;
  if (overlay) {
    const modal = overlay.closest('.modal');
    if (modal) {
      e.preventDefault();
      e.stopPropagation();
      const id = modal.getAttribute('id');
      fecharModal(id || modal);
      return;
    }
  }

  // Verificar se clicou diretamente no contêiner .modal (não no conteúdo)
  const modal = e.target.classList && e.target.classList.contains('modal') ? e.target : null;
  if (modal && e.target === modal) {
    e.preventDefault();
    e.stopPropagation();
    const id = modal.getAttribute('id');
    fecharModal(id || modal);
  }
});

// Tecla ESC fecha todas as modais visíveis
document.addEventListener('keydown', function (e) {
  if (e.key !== 'Escape') return;
  const jq = getJQ();
  if (jq) {
    jq('.modal:visible').each(function () {
      fecharModal(this);
    });
    return;
  }
  document.querySelectorAll('.modal').forEach(function (m) {
    if (m.style.display !== 'none') fecharModal(m);
  });
});