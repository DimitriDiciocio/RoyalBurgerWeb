// src/js/utils/dom-renderer.js
// Renderização Incremental de Listas - Seção 1.2 da análise de performance
// OTIMIZAÇÃO 2.1: Sanitização automática de HTML
import { createSafeElement } from "./html-sanitizer.js";

/**
 * Renderiza uma lista de forma incremental, atualizando apenas elementos que mudaram
 * @param {HTMLElement} container - Container onde os itens serão renderizados
 * @param {Array} items - Array de itens a serem renderizados
 * @param {Function} templateFn - Função que retorna HTML string para um item: (item, index) => string
 * @param {Function} keyFn - Função que retorna uma chave única para um item: (item, index) => string|number
 * @returns {void}
 */
export function renderList(
  container,
  items,
  templateFn,
  keyFn = (item, index) => index
) {
  if (!container) {
    console.warn("renderList: container é null ou undefined");
    return;
  }

  if (!Array.isArray(items)) {
    console.warn("renderList: items não é um array");
    return;
  }

  // Obter chaves existentes e novas
  const existingKeys = new Set(
    Array.from(container.children)
      .map((el) => el.dataset.key)
      .filter((key) => key !== undefined)
  );

  const newKeys = new Set(
    items.map((item, index) => String(keyFn(item, index)))
  );

  // Remover itens que não existem mais
  Array.from(container.children).forEach((el) => {
    const key = el.dataset.key;
    if (key !== undefined && !newKeys.has(key)) {
      el.remove();
    }
  });

  // Atualizar ou adicionar itens
  items.forEach((item, index) => {
    const key = String(keyFn(item, index));
    let element = container.querySelector(`[data-key="${CSS.escape(key)}"]`);

    if (!element) {
      // Criar novo elemento
      element = document.createElement("div");
      element.dataset.key = key;
      container.appendChild(element);
    }

    // Renderizar novo HTML
    const newHTML = templateFn(item, index);

    // Atualizar apenas se o HTML mudou (evita reflow desnecessário)
    if (element.innerHTML !== newHTML) {
      element.innerHTML = newHTML;
    }
  });
}

/**
 * Renderiza uma lista usando DocumentFragment para inserção batch (melhor performance)
 * Útil quando todos os itens são novos ou quando você quer substituir tudo
 * @param {HTMLElement} container - Container onde os itens serão renderizados
 * @param {Array} items - Array de itens a serem renderizados
 * @param {Function} templateFn - Função que retorna HTML string para um item
 * @returns {void}
 */
export function renderListBatch(container, items, templateFn) {
  if (!container) {
    console.warn("renderListBatch: container é null ou undefined");
    return;
  }

  if (!Array.isArray(items)) {
    console.warn("renderListBatch: items não é um array");
    return;
  }

  // Criar fragmento para inserção batch
  const fragment = document.createDocumentFragment();
  const tempDiv = document.createElement("div");

  items.forEach((item, index) => {
    tempDiv.innerHTML = templateFn(item, index);
    while (tempDiv.firstChild) {
      fragment.appendChild(tempDiv.firstChild);
    }
  });

  // Limpar container e inserir todos os itens de uma vez
  container.innerHTML = "";
  container.appendChild(fragment);
}

/**
 * Cria um elemento DOM a partir de HTML string de forma segura
 * OTIMIZAÇÃO 2.1: Usa sanitização automática
 * @param {string} htmlString - String HTML a ser convertida
 * @param {boolean} sanitize - Se deve sanitizar (padrão: true)
 * @returns {HTMLElement|null} Elemento criado ou null se inválido
 */
export function createElementFromHTML(htmlString, sanitize = true) {
  // OTIMIZAÇÃO 2.1: Usar sanitização automática
  if (sanitize) {
    return createSafeElement(htmlString, true);
  }

  // Fallback para compatibilidade (USE COM CUIDADO!)
  const tempDiv = document.createElement("div");
  tempDiv.innerHTML = htmlString.trim();
  return tempDiv.firstChild;
}

/**
 * Cria múltiplos elementos a partir de HTML string
 * OTIMIZAÇÃO 2.1: Usa sanitização automática
 * @param {string} htmlString - String HTML contendo múltiplos elementos
 * @param {boolean} sanitize - Se deve sanitizar (padrão: true)
 * @returns {Array<HTMLElement>} Array de elementos criados
 */
export function createElementsFromHTML(htmlString, sanitize = true) {
  if (typeof htmlString !== "string") {
    return [];
  }

  // OTIMIZAÇÃO 2.1: Usar sanitização automática
  if (sanitize && typeof window !== "undefined" && window.DOMPurify) {
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = window.DOMPurify.sanitize(htmlString);
    return Array.from(tempDiv.children);
  }

  // Fallback para compatibilidade (USE COM CUIDADO!)
  const tempDiv = document.createElement("div");
  tempDiv.innerHTML = htmlString.trim();
  return Array.from(tempDiv.children);
}
