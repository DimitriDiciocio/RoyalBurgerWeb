// src/js/utils.js

/**
 * Função para gerenciar o estado dos inputs e selects
 * Controla a animação dos labels e cores baseado no foco e valor
 */
export function gerenciarEstadoInputs() {
  // Selecionar todos os inputs e selects dentro de formulários
  const inputs = document.querySelectorAll("input, select, textarea");

  inputs.forEach((input) => {
    // ALTERAÇÃO: Função corrigida para verificar corretamente valores e placeholders
    function temValorOuPlaceholder() {
      // Para SELECT: verificar se tem valor válido (não vazio)
      if (input.tagName === "SELECT") {
        return input.value !== "" && input.value !== null && input.value !== undefined;
      }
      
      const valor = (input.value || "").trim();
      
      // ALTERAÇÃO: Não considerar placeholder com apenas espaço como placeholder válido
      const temPlaceholder = input.placeholder && 
                            input.placeholder.trim() !== "" && 
                            input.placeholder.trim() !== " ";
      
      // ALTERAÇÃO: Para inputs de data, verificar se tem valor de fato
      const tipoComPlaceholder = [
        "date",
        "time",
        "datetime-local",
        "month",
        "week",
      ].includes(input.type);
      
      // Para tipos com placeholder nativo, verificar se tem valor real
      if (tipoComPlaceholder) {
        return valor !== "" && valor !== null;
      }

      return valor !== "" || temPlaceholder;
    }

    // Função para atualizar o estado do label
    function atualizarEstadoLabel() {
      const label = input.closest(".div-input")?.querySelector("label");
      if (!label) return;

      const temValor = temValorOuPlaceholder();
      const estaFocado = document.activeElement === input;

      // ALTERAÇÃO: SELECT sempre deve ter label no estado ativo
      // ALTERAÇÃO: Inputs de data também devem sempre ter label no estado ativo
      const tiposData = ["date", "time", "datetime-local", "month", "week"];
      const ehInputData = tiposData.includes(input.type);
      
      if (input.tagName === "SELECT" || ehInputData) {
        label.classList.add("active");
      } else {
        // Adicionar/remover classe 'active' baseado no valor para outros inputs
        if (temValor) {
          label.classList.add("active");
        } else {
          label.classList.remove("active");
        }
      }

      // Adicionar/remover classe 'focused' baseado no foco
      if (estaFocado) {
        label.classList.add("focused");
      } else {
        label.classList.remove("focused");
      }
    }

    // Eventos para inputs de texto, email, tel, etc.
    if (
      ["text", "email", "tel", "password", "search", "url"].includes(input.type)
    ) {
      input.addEventListener("input", atualizarEstadoLabel);
      input.addEventListener("focus", atualizarEstadoLabel);
      input.addEventListener("blur", atualizarEstadoLabel);
    }

    // Eventos para selects
    if (input.tagName === "SELECT") {
      input.addEventListener("change", atualizarEstadoLabel);
      input.addEventListener("focus", atualizarEstadoLabel);
      input.addEventListener("blur", atualizarEstadoLabel);
    }

    // Eventos para textareas
    if (input.tagName === "TEXTAREA") {
      input.addEventListener("input", atualizarEstadoLabel);
      input.addEventListener("focus", atualizarEstadoLabel);
      input.addEventListener("blur", atualizarEstadoLabel);
    }

    // Eventos para inputs com placeholder nativo (date, time, etc.)
    if (
      ["date", "time", "datetime-local", "month", "week", "number"].includes(
        input.type
      )
    ) {
      input.addEventListener("change", atualizarEstadoLabel);
      input.addEventListener("focus", atualizarEstadoLabel);
      input.addEventListener("blur", atualizarEstadoLabel);
      input.addEventListener("input", atualizarEstadoLabel);
    }

    // Verificar estado inicial
    atualizarEstadoLabel();

    try {
      // Usar eventos nativos do input para mudanças de valor (mais eficiente)
      // O MutationObserver será usado apenas como fallback para mudanças programáticas
      let ultimoValor = input.value;

      // Observer para mudanças no atributo 'value' (mudanças programáticas)
      const observer = new MutationObserver(() => {
        if (!document.body.contains(input)) {
          observer.disconnect();
          return;
        }
        if (input.value !== ultimoValor) {
          ultimoValor = input.value;
          atualizarEstadoLabel();
        }
      });

      // Observar apenas mudanças no atributo value
      observer.observe(input, {
        attributes: true,
        attributeFilter: ["value"],
        childList: false,
        subtree: false,
      });

      // Armazenar observer no elemento para cleanup posterior se necessário
      input._valueObserver = observer;
      
      // TODO: REVISAR - Cleanup de MutationObserver
      // Os observers criados não são desconectados automaticamente quando
      // os inputs são removidos do DOM. Considerar implementar cleanup
      // quando elementos são removidos (usar MutationObserver no container pai
      // ou WeakMap para rastrear observers).
    } catch (_e) {
      // Fallback silencioso se MutationObserver não estiver disponível
    }
  });
}

/**
 * Função para inicializar o gerenciamento de inputs em uma página específica
 * @param {string} seletor - Seletor CSS para o container dos inputs (opcional)
 */
export function inicializarGerenciamentoInputs(seletor = null) {
  // Aguardar o DOM estar pronto
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      if (seletor) {
        const container = document.querySelector(seletor);
        if (container) {
          gerenciarEstadoInputs();
        }
      } else {
        gerenciarEstadoInputs();
      }
    });
  } else {
    if (seletor) {
      const container = document.querySelector(seletor);
      if (container) {
        gerenciarEstadoInputs();
      }
    } else {
      gerenciarEstadoInputs();
    }
  }
}

/**
 * Função para reaplicar o gerenciamento após mudanças dinâmicas no DOM
 * Útil quando novos inputs são adicionados via JavaScript
 */
export function reaplicarGerenciamentoInputs() {
  gerenciarEstadoInputs();
}

/**
 * Função para gerenciar inputs específicos
 * @param {NodeList|Array} inputs - Lista de inputs para gerenciar
 */
export function gerenciarInputsEspecificos(inputs) {
  if (!inputs || inputs.length === 0) return;

  inputs.forEach((input) => {
    // ALTERAÇÃO: Lógica corrigida para verificar corretamente valores e placeholders
    function temValorOuPlaceholder() {
      // Para SELECT: verificar se tem valor válido (não vazio)
      if (input.tagName === "SELECT") {
        return input.value !== "" && input.value !== null && input.value !== undefined;
      }
      
      const valor = (input.value || "").trim();
      
      // ALTERAÇÃO: Não considerar placeholder com apenas espaço como placeholder válido
      const temPlaceholder = input.placeholder && 
                            input.placeholder.trim() !== "" && 
                            input.placeholder.trim() !== " ";
      
      // ALTERAÇÃO: Para inputs de data, verificar se tem valor de fato
      const tipoComPlaceholder = [
        "date",
        "time",
        "datetime-local",
        "month",
        "week",
      ].includes(input.type);
      
      // Para tipos com placeholder nativo, verificar se tem valor real
      if (tipoComPlaceholder) {
        return valor !== "" && valor !== null;
      }

      return valor !== "" || temPlaceholder;
    }

    function atualizarEstadoLabel() {
      const label = input.closest(".div-input")?.querySelector("label");
      if (!label) return;

      const temValor = temValorOuPlaceholder();
      const estaFocado = document.activeElement === input;

      // ALTERAÇÃO: SELECT sempre deve ter label no estado ativo
      // ALTERAÇÃO: Inputs de data também devem sempre ter label no estado ativo
      const tiposData = ["date", "time", "datetime-local", "month", "week"];
      const ehInputData = tiposData.includes(input.type);
      
      if (input.tagName === "SELECT" || ehInputData) {
        label.classList.add("active");
      } else {
        // Adicionar/remover classe 'active' baseado no valor para outros inputs
        if (temValor) {
          label.classList.add("active");
        } else {
          label.classList.remove("active");
        }
      }

      if (estaFocado) {
        label.classList.add("focused");
      } else {
        label.classList.remove("focused");
      }
    }

    // Adicionar eventos baseado no tipo
    if (
      ["text", "email", "tel", "password", "search", "url"].includes(input.type)
    ) {
      input.addEventListener("input", atualizarEstadoLabel);
      input.addEventListener("focus", atualizarEstadoLabel);
      input.addEventListener("blur", atualizarEstadoLabel);
    }

    if (input.tagName === "SELECT") {
      input.addEventListener("change", atualizarEstadoLabel);
      input.addEventListener("focus", atualizarEstadoLabel);
      input.addEventListener("blur", atualizarEstadoLabel);
    }

    if (input.tagName === "TEXTAREA") {
      input.addEventListener("input", atualizarEstadoLabel);
      input.addEventListener("focus", atualizarEstadoLabel);
      input.addEventListener("blur", atualizarEstadoLabel);
    }

    if (
      ["date", "time", "datetime-local", "month", "week", "number"].includes(
        input.type
      )
    ) {
      input.addEventListener("change", atualizarEstadoLabel);
      input.addEventListener("focus", atualizarEstadoLabel);
      input.addEventListener("blur", atualizarEstadoLabel);
      input.addEventListener("input", atualizarEstadoLabel);
    }

    atualizarEstadoLabel();
  });
}

// Auto-inicializar quando o módulo for carregado
if (typeof window !== "undefined") {
  inicializarGerenciamentoInputs();
}
