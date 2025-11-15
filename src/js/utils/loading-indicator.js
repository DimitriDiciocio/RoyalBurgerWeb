/**
 * Utilitário para exibir indicadores de carregamento
 * ALTERAÇÃO: Criado para padronizar indicadores de loading em todas as seções
 */

/**
 * Cria um overlay de carregamento
 * @param {string} containerSelector - Seletor do container onde adicionar o overlay
 * @param {string} loadingId - ID único para o elemento de loading (para poder remover depois)
 * @param {string} message - Mensagem a ser exibida (padrão: "Carregando...")
 * @returns {HTMLElement|null} Elemento de loading criado ou null
 */
export function showLoadingOverlay(containerSelector, loadingId, message = 'Carregando...') {
  const container = typeof containerSelector === 'string' 
    ? document.querySelector(containerSelector)
    : containerSelector;
  
  if (!container) {
    // ALTERAÇÃO: Log condicional apenas em modo debug
    if (typeof window !== 'undefined' && window.DEBUG_MODE) {
      console.warn(`[loading-indicator] Container não encontrado: ${containerSelector}`);
    }
    return null;
  }

  // Remover loading anterior se existir
  const existingLoading = document.getElementById(loadingId);
  if (existingLoading) {
    existingLoading.remove();
  }

  // Criar overlay
  const loadingOverlay = document.createElement('div');
  loadingOverlay.className = 'loading-overlay';
  loadingOverlay.id = loadingId;
  // ALTERAÇÃO: Usar textContent ao invés de innerHTML para prevenir XSS
  // Mensagem já é sanitizada (string literal do parâmetro)
  const spinner = document.createElement('div');
  spinner.className = 'loading-spinner';
  const icon = document.createElement('i');
  icon.className = 'fa-solid fa-spinner fa-spin';
  const messageEl = document.createElement('p');
  messageEl.textContent = message || 'Carregando...';
  spinner.appendChild(icon);
  spinner.appendChild(messageEl);
  loadingOverlay.appendChild(spinner);

  // Adicionar ao container (usar position relative se não tiver)
  const containerStyle = window.getComputedStyle(container);
  if (containerStyle.position === 'static') {
    container.style.position = 'relative';
  }

  container.appendChild(loadingOverlay);
  return loadingOverlay;
}

/**
 * Remove um overlay de carregamento
 * @param {string} loadingId - ID do elemento de loading a ser removido
 */
export function hideLoadingOverlay(loadingId) {
  const loadingOverlay = document.getElementById(loadingId);
  if (loadingOverlay) {
    loadingOverlay.remove();
  }
}

/**
 * Cria um indicador de carregamento inline (sem overlay)
 * @param {HTMLElement} container - Container onde adicionar o indicador
 * @param {string} loadingId - ID único para o elemento
 * @param {string} message - Mensagem a ser exibida
 * @returns {HTMLElement|null} Elemento criado ou null
 */
export function showLoadingInline(container, loadingId, message = 'Carregando...') {
  if (!container) {
    // ALTERAÇÃO: Log condicional apenas em modo debug
    if (typeof window !== 'undefined' && window.DEBUG_MODE) {
      console.warn('[loading-indicator] Container não fornecido para loading inline');
    }
    return null;
  }

  // Remover loading anterior
  const existingLoading = document.getElementById(loadingId);
  if (existingLoading) {
    existingLoading.remove();
  }

  // ALTERAÇÃO: Criar elementos manualmente ao invés de innerHTML para prevenir XSS
  const loadingElement = document.createElement('div');
  loadingElement.className = 'loading-inline';
  loadingElement.id = loadingId;
  const icon = document.createElement('i');
  icon.className = 'fa-solid fa-spinner fa-spin';
  const span = document.createElement('span');
  span.textContent = message || 'Carregando...';
  loadingElement.appendChild(icon);
  loadingElement.appendChild(span);

  container.appendChild(loadingElement);
  return loadingElement;
}

/**
 * Remove indicador inline
 * @param {string} loadingId - ID do elemento a ser removido
 */
export function hideLoadingInline(loadingId) {
  const loadingElement = document.getElementById(loadingId);
  if (loadingElement) {
    loadingElement.remove();
  }
}

/**
 * Mostra loading em um botão (substitui conteúdo temporariamente)
 * @param {HTMLElement|string} button - Botão ou seletor do botão
 * @param {string} originalContent - Conteúdo original a ser restaurado depois
 * @returns {string} Conteúdo original salvo
 */
export function showButtonLoading(button, originalContent = null) {
  const btnElement = typeof button === 'string' ? document.querySelector(button) : button;
  if (!btnElement) return null;

  const savedContent = originalContent !== null ? originalContent : btnElement.innerHTML;
  // ALTERAÇÃO: Usar createElement ao invés de innerHTML para prevenir XSS
  // Limpar conteúdo anterior
  btnElement.innerHTML = '';
  // Criar ícone de spinner
  const icon = document.createElement('i');
  icon.className = 'fa-solid fa-spinner fa-spin';
  // Criar span com texto
  const textSpan = document.createElement('span');
  textSpan.textContent = 'Carregando...';
  // Adicionar elementos ao botão
  btnElement.appendChild(icon);
  btnElement.appendChild(document.createTextNode(' ')); // Espaço entre ícone e texto
  btnElement.appendChild(textSpan);
  btnElement.disabled = true;
  
  // Salvar conteúdo original em data attribute
  btnElement.dataset.originalContent = savedContent;
  
  return savedContent;
}

/**
 * Restaura conteúdo original de um botão
 * @param {HTMLElement|string} button - Botão ou seletor do botão
 */
export function hideButtonLoading(button) {
  const btnElement = typeof button === 'string' ? document.querySelector(button) : button;
  if (!btnElement) return;

  const originalContent = btnElement.dataset.originalContent;
  if (originalContent) {
    // ALTERAÇÃO: Restaurar conteúdo original (pode conter HTML seguro do botão original)
    // Como o conteúdo foi salvo antes de modificar, é seguro restaurar
    btnElement.innerHTML = originalContent;
  } else {
    // Se não houver conteúdo salvo, apenas limpar e habilitar
    btnElement.innerHTML = '';
  }
  btnElement.disabled = false;
  delete btnElement.dataset.originalContent;
}

/**
 * Adiciona classe de loading ao container (para estilização via CSS)
 * @param {HTMLElement|string} container - Container
 * @param {string} loadingClass - Classe CSS a ser adicionada (padrão: 'is-loading')
 */
export function addLoadingClass(container, loadingClass = 'is-loading') {
  const element = typeof container === 'string' ? document.querySelector(container) : container;
  if (element) {
    element.classList.add(loadingClass);
  }
}

/**
 * Remove classe de loading do container
 * @param {HTMLElement|string} container - Container
 * @param {string} loadingClass - Classe CSS a ser removida (padrão: 'is-loading')
 */
export function removeLoadingClass(container, loadingClass = 'is-loading') {
  const element = typeof container === 'string' ? document.querySelector(container) : container;
  if (element) {
    element.classList.remove(loadingClass);
  }
}
