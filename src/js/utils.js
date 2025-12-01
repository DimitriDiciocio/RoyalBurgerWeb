// src/js/utils.js

/**
 * Tipos de inputs que sempre devem ter label ativo
 */
const TIPOS_SEMPRE_ATIVOS = ["date", "time", "datetime-local", "month", "week"];

/**
 * Tipos de inputs de texto que usam evento 'input'
 */
const TIPOS_TEXTO = ["text", "email", "tel", "password", "search", "url"];

/**
 * Tipos de inputs que usam eventos 'change' e 'input'
 */
const TIPOS_ESPECIAIS = ["date", "time", "datetime-local", "month", "week", "number"];

/**
 * Verifica se um input tem valor ou placeholder válido
 * @param {HTMLElement} input - Elemento input/select/textarea
 * @returns {boolean}
 */
function temValorOuPlaceholder(input) {
  // SELECT: verificar se tem valor válido
  if (input.tagName === "SELECT") {
    return input.value !== "" && input.value != null;
  }

  const valor = (input.value || "").trim();
  const temPlaceholder = input.placeholder?.trim() && input.placeholder.trim() !== " ";

  // Inputs de data: verificar se tem valor real
  if (TIPOS_SEMPRE_ATIVOS.includes(input.type)) {
    return valor !== "" && valor != null;
  }

  return valor !== "" || !!temPlaceholder;
}

/**
 * Atualiza o estado visual do label associado ao input
 * @param {HTMLElement} input - Elemento input/select/textarea
 */
function atualizarEstadoLabel(input) {
  const label = input.closest(".div-input")?.querySelector("label");
  if (!label) return;

  const temValor = temValorOuPlaceholder(input);
  const estaFocado = document.activeElement === input;
  const ehSelect = input.tagName === "SELECT";
  const ehInputData = TIPOS_SEMPRE_ATIVOS.includes(input.type);

  // SELECT e inputs de data sempre ativos
  if (ehSelect || ehInputData) {
    label.classList.add("active");
  } else {
    label.classList.toggle("active", temValor);
  }

  label.classList.toggle("focused", estaFocado);
}

/**
 * Adiciona event listeners apropriados ao input
 * @param {HTMLElement} input - Elemento input/select/textarea
 */
function adicionarEventListeners(input) {
  const atualizar = () => atualizarEstadoLabel(input);

  // Eventos comuns para todos
  input.addEventListener("focus", atualizar);
  input.addEventListener("blur", atualizar);

  // Eventos específicos por tipo
  if (input.tagName === "SELECT") {
    input.addEventListener("change", atualizar);
  } else if (input.tagName === "TEXTAREA") {
    input.addEventListener("input", atualizar);
  } else if (TIPOS_TEXTO.includes(input.type)) {
    input.addEventListener("input", atualizar);
  } else if (TIPOS_ESPECIAIS.includes(input.type)) {
    input.addEventListener("change", atualizar);
    input.addEventListener("input", atualizar);
  }

  // Estado inicial
  atualizarEstadoLabel(input);
}

/**
 * Configura MutationObserver para detectar mudanças programáticas no valor
 * @param {HTMLElement} input - Elemento input/select/textarea
 */
function configurarObserver(input) {
  if (typeof MutationObserver === "undefined") return;

  let ultimoValor = input.value;

  const observer = new MutationObserver(() => {
    if (!document.body.contains(input)) {
      observer.disconnect();
      return;
    }
    if (input.value !== ultimoValor) {
      ultimoValor = input.value;
      atualizarEstadoLabel(input);
    }
  });

  observer.observe(input, {
    attributes: true,
    attributeFilter: ["value"],
  });

  // Armazenar para possível cleanup futuro
  input._valueObserver = observer;
}

/**
 * Gerenciar estado de um input específico
 * @param {HTMLElement} input - Elemento input/select/textarea
 */
function gerenciarInput(input) {
  // Evitar processar o mesmo input múltiplas vezes
  if (input._gerenciado) return;
  input._gerenciado = true;

  adicionarEventListeners(input);
  configurarObserver(input);
}

/**
 * Gerenciar estado de todos os inputs, selects e textareas
 * @param {string|null} seletor - Seletor CSS opcional para limitar o escopo
 */
export function gerenciarEstadoInputs(seletor = null) {
  const container = seletor ? document.querySelector(seletor) : document;
  if (!container) return;

  const inputs = container.querySelectorAll("input, select, textarea");
  inputs.forEach(gerenciarInput);
}

/**
 * Inicializar o gerenciamento de inputs
 * @param {string|null} seletor - Seletor CSS opcional para o container
 */
export function inicializarGerenciamentoInputs(seletor = null) {
  const inicializar = () => gerenciarEstadoInputs(seletor);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", inicializar);
  } else {
    inicializar();
  }
}

/**
 * Reaplicar o gerenciamento após mudanças dinâmicas no DOM
 * Útil quando novos inputs são adicionados via JavaScript
 * @param {string|null} seletor - Seletor CSS opcional para limitar o escopo
 */
export function reaplicarGerenciamentoInputs(seletor = null) {
  // Resetar flag para permitir reprocessamento
  const container = seletor ? document.querySelector(seletor) : document;
  if (!container) return;

  const inputs = container.querySelectorAll("input, select, textarea");
  inputs.forEach((input) => {
    input._gerenciado = false;
  });

  gerenciarEstadoInputs(seletor);
}

/**
 * Gerenciar inputs específicos passados como parâmetro
 * @param {NodeList|Array|HTMLElement} inputs - Lista de inputs ou input único
 */
export function gerenciarInputsEspecificos(inputs) {
  if (!inputs) return;

  const lista = Array.isArray(inputs) || inputs instanceof NodeList
    ? Array.from(inputs)
    : [inputs];

  lista.forEach(gerenciarInput);
}

// Auto-inicializar quando o módulo for carregado
if (typeof window !== "undefined") {
  inicializarGerenciamentoInputs();
}