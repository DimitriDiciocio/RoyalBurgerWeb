// Utilitário para obter jQuery (se presente)
function getJQ() {
  return window.jQuery || window.$ || null;
}

// Abre modal por id ou elemento
function abrirModal(target) {
  const jq = getJQ();
  const el = typeof target === 'string' ? document.getElementById(target) : target;
  if (!el) return;

  // Com jQuery: anima com opacity, preservando display:flex
  if (jq) {
    const $el = jq(el);
    $el.stop(true, true).css({ display: 'flex', opacity: 0 }).animate({ opacity: 1 }, 200);
    return;
  }

  // Sem jQuery: só exibe
  el.style.display = 'flex';
  el.style.opacity = '1';
}

// Fecha modal por id ou elemento
function fecharModal(target) {
  const jq = getJQ();
  const el = typeof target === 'string' ? document.getElementById(target) : target;
  if (!el) return;

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

  if (jq) {
    const $el = jq(el);
    $el.stop(true, true).animate({ opacity: 0 }, 160, function () {
      $el.css('display', 'none');
    });
    return;
  }

  el.style.opacity = '0';
  el.style.display = 'none';
}

// Expor globalmente para uso em onClick inline
window.abrirModal = abrirModal;
window.fecharModal = fecharModal;

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

// Clique no overlay fecha (quando clica no contêiner .modal e não no conteúdo interno)
document.addEventListener('click', function (e) {
  const modal = e.target.classList && e.target.classList.contains('modal') ? e.target : null;
  if (modal && e.target === modal) {
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