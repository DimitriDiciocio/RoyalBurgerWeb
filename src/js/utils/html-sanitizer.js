// src/js/utils/html-sanitizer.js
// Sanitização Automática de HTML - Seção 2.1 da análise de performance (Segurança XSS)

/**
 * Sanitiza texto para evitar XSS
 * Escapa caracteres HTML perigosos
 * @param {any} text - Texto a ser sanitizado
 * @returns {string} Texto sanitizado e seguro
 */
export function escapeHTML(text) {
  if (text === null || text === undefined) {
    return "";
  }

  if (typeof text !== "string") {
    text = String(text);
  }

  // Usar DOMPurify se disponível (mais robusto)
  if (typeof window !== "undefined" && window.DOMPurify) {
    return window.DOMPurify.sanitize(text, { ALLOWED_TAGS: [] });
  }

  // Método nativo usando DOM (mais seguro que regex)
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Sanitiza atributos HTML para evitar XSS em atributos
 * @param {any} value - Valor do atributo
 * @returns {string} Valor sanitizado
 */
export function escapeAttribute(value) {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value !== "string") {
    value = String(value);
  }

  // Escapar caracteres perigosos em atributos
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Sanitiza URL para evitar javascript: e data: URLs maliciosas
 * @param {any} url - URL a ser sanitizada
 * @param {string} fallback - URL fallback se inválida (padrão: '')
 * @returns {string} URL sanitizada
 */
export function sanitizeURL(url, fallback = "") {
  if (!url || typeof url !== "string") {
    return fallback;
  }

  const trimmed = url.trim().toLowerCase();

  // Bloquear protocolos perigosos
  const dangerousProtocols = [
    "javascript:",
    "data:",
    "vbscript:",
    "file:",
    "about:",
  ];

  for (const protocol of dangerousProtocols) {
    if (trimmed.startsWith(protocol)) {
      return fallback;
    }
  }

  // Permitir apenas http, https, mailto, tel, ou URLs relativas
  if (
    !trimmed.startsWith("http://") &&
    !trimmed.startsWith("https://") &&
    !trimmed.startsWith("mailto:") &&
    !trimmed.startsWith("tel:") &&
    !trimmed.startsWith("/") &&
    !trimmed.startsWith("#") &&
    !trimmed.startsWith("?") &&
    !trimmed.startsWith(".")
  ) {
    // Se não começa com protocolo seguro, assumir relativo
    return url; // Retornar original se for caminho relativo
  }

  return url;
}

/**
 * Cria HTML seguro usando template com placeholders
 * Sanitiza automaticamente todos os valores interpolados
 * @param {string} template - Template HTML com placeholders ${var}
 * @param {Object} data - Objeto com dados a serem interpolados
 * @returns {string} HTML sanitizado
 *
 * @example
 * const html = safeHTML(`
 *   <div class="product">
 *     <h2>${'name'}</h2>
 *     <p>${'description'}</p>
 *     <a href="${'url'}">Link</a>
 *   </div>
 * `, {
 *   name: 'Produto',
 *   description: 'Descrição <script>alert("xss")</script>',
 *   url: 'produto.html?id=123'
 * });
 */
export function safeHTML(template, data = {}) {
  if (typeof template !== "string") {
    console.warn("safeHTML: template deve ser uma string");
    return "";
  }

  // Substituir placeholders ${key} com valores sanitizados
  let result = template;

  // Extrair todos os placeholders do template
  const placeholderRegex = /\$\{(\w+)\}/g;
  const matches = [...template.matchAll(placeholderRegex)];

  for (const match of matches) {
    const fullMatch = match[0]; // ${key}
    const key = match[1]; // key
    const value = data[key];

    if (value !== undefined && value !== null) {
      // Determinar se deve escapar como HTML ou atributo baseado no contexto
      const beforeMatch = result.substring(0, result.indexOf(fullMatch));
      const lastTag = beforeMatch.match(/<[^>]*$/);

      // Se está dentro de um atributo, usar escapeAttribute
      if (lastTag && lastTag[0].includes('="')) {
        const sanitized = escapeAttribute(String(value));
        result = result.replace(fullMatch, sanitized);
      } else {
        // Caso contrário, escapar como HTML
        const sanitized = escapeHTML(String(value));
        result = result.replace(fullMatch, sanitized);
      }
    } else {
      // Remover placeholder se valor não existir
      result = result.replace(fullMatch, "");
    }
  }

  return result;
}

/**
 * Define innerHTML de forma segura, sanitizando o conteúdo
 * @param {HTMLElement} element - Elemento onde definir innerHTML
 * @param {string} html - HTML a ser inserido
 * @param {boolean} sanitize - Se deve sanitizar (padrão: true)
 * @returns {void}
 */
export function setSafeHTML(element, html, sanitize = true) {
  if (!element || !(element instanceof HTMLElement)) {
    console.warn("setSafeHTML: element deve ser um HTMLElement");
    return;
  }

  if (typeof html !== "string") {
    html = String(html || "");
  }

  if (sanitize) {
    // Usar DOMPurify se disponível para sanitização completa
    if (typeof window !== "undefined" && window.DOMPurify) {
      element.innerHTML = window.DOMPurify.sanitize(html, {
        ALLOWED_TAGS: [
          "p",
          "br",
          "strong",
          "em",
          "u",
          "h1",
          "h2",
          "h3",
          "h4",
          "h5",
          "h6",
          "ul",
          "ol",
          "li",
          "a",
          "img",
          "div",
          "span",
          "table",
          "tr",
          "td",
          "th",
          "thead",
          "tbody",
        ],
        ALLOWED_ATTR: [
          "href",
          "src",
          "alt",
          "title",
          "class",
          "id",
          "data-*",
          "style",
        ],
        ALLOW_DATA_ATTR: true,
      });
      return;
    }

    // Fallback: escape completo (remove todas as tags HTML)
    element.textContent = html;
    return;
  }

  // Se sanitize = false, usar innerHTML normalmente (USE COM CUIDADO!)
  element.innerHTML = html;
}

/**
 * Cria elemento DOM de forma segura a partir de HTML string
 * @param {string} htmlString - HTML string
 * @param {boolean} sanitize - Se deve sanitizar (padrão: true)
 * @returns {HTMLElement|null} Elemento criado ou null
 */
export function createSafeElement(htmlString, sanitize = true) {
  if (typeof htmlString !== "string") {
    return null;
  }

  const tempDiv = document.createElement("div");

  if (sanitize) {
    // Usar DOMPurify se disponível
    if (typeof window !== "undefined" && window.DOMPurify) {
      tempDiv.innerHTML = window.DOMPurify.sanitize(htmlString);
    } else {
      // Fallback: apenas textContent
      tempDiv.textContent = htmlString;
    }
  } else {
    tempDiv.innerHTML = htmlString;
  }

  return tempDiv.firstElementChild;
}

/**
 * Valida se uma string é HTML seguro (não contém scripts ou eventos)
 * @param {string} html - HTML a ser validado
 * @returns {boolean} True se seguro
 */
export function isSafeHTML(html) {
  if (typeof html !== "string") {
    return false;
  }

  // Verificar por scripts e eventos perigosos
  const dangerousPatterns = [
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    /javascript:/gi,
    /on\w+\s*=\s*["'][^"']*["']/gi,
    /<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi,
    /<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi,
    /<embed\b[^<]*(?:(?!<\/embed>)<[^<]*)*<\/embed>/gi,
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(html)) {
      return false;
    }
  }

  return true;
}

/**
 * Helper para criar atributos HTML de forma segura
 * @param {Object} attrs - Objeto com atributos { name: value }
 * @returns {string} String de atributos HTML sanitizados
 *
 * @example
 * const attrs = createSafeAttributes({
 *   href: 'produto.html?id=123',
 *   class: 'product-link',
 *   'data-id': '123'
 * });
 * // Retorna: 'href="produto.html?id=123" class="product-link" data-id="123"'
 */
export function createSafeAttributes(attrs) {
  if (!attrs || typeof attrs !== "object") {
    return "";
  }

  const parts = [];

  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined) {
      continue;
    }

    const sanitizedKey = escapeAttribute(key);
    const sanitizedValue = escapeAttribute(String(value));

    parts.push(`${sanitizedKey}="${sanitizedValue}"`);
  }

  return parts.join(" ");
}
