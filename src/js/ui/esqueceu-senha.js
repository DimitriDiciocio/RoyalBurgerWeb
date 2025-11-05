// Gerenciamento da página de esqueceu senha
import { inicializarGerenciamentoInputs } from "../utils.js";
import { showToast, toastFromApiError } from "./alerts.js";
import { requestPasswordReset } from "../api/user.js";
// OTIMIZAÇÃO 1.9: Debounce para eventos de input frequentes
import { debounce } from "../utils/performance-utils.js";

document.addEventListener("DOMContentLoaded", function () {
  // Inicializar gerenciamento de inputs
  inicializarGerenciamentoInputs();

  const emailInput = document.getElementById("email");
  const btnEnviar = document.getElementById("btn-enviar");
  const form = document.getElementById("form-esqueceu-senha");

  // Função para validar email
  function validarEmail(email) {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(email);
  }

  // Função para atualizar estado do botão
  function atualizarBotao() {
    const email = emailInput.value.trim();
    const valido = validarEmail(email);

    if (valido) {
      btnEnviar.disabled = false;
    } else {
      btnEnviar.disabled = true;
    }
  }

  // OTIMIZAÇÃO 1.9: Usar debounce na validação para não executar a cada keystroke
  const debouncedAtualizarBotao = debounce(atualizarBotao, 200);

  // Validar em tempo real (com debounce para reduzir execuções desnecessárias)
  emailInput.addEventListener("input", () => {
    debouncedAtualizarBotao();
  });

  // Handler do formulário
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = emailInput.value.trim();

    if (!validarEmail(email)) {
      showToast("Por favor, insira um e-mail válido.", { type: "error" });
      return;
    }

    // Desabilitar botão durante processamento
    btnEnviar.disabled = true;
    const textoOriginal = btnEnviar.textContent;
    btnEnviar.textContent = "Enviando...";

    try {
      const resp = await requestPasswordReset(email);

      // Mostrar mensagem de sucesso
      showToast(
        resp.msg ||
          "Código de recuperação enviado! Verifique sua caixa de entrada e spam.",
        {
          type: "success",
          title: "Código Enviado",
          autoClose: 5000,
        }
      );

      // Limpar campo
      emailInput.value = "";

      // Redirecionar para verificação de código após 2 segundos
      setTimeout(() => {
        window.location.href = `verificar-email.html?email=${encodeURIComponent(
          email
        )}&type=password-reset`;
      }, 2000);
    } catch (err) {
      // Tratar erros específicos
      const errorData = err?.payload || {};
      const errorCode = errorData.error_code;
      const errorMsg =
        errorData.error ||
        err?.message ||
        "Erro ao enviar código de recuperação";
      const suggestion = errorData.suggestion;

      let toastMessage = errorMsg;
      if (suggestion) {
        toastMessage += ` ${suggestion}`;
      }

      showToast(toastMessage, {
        type: "error",
        title: "Erro ao Enviar Código",
        autoClose: 7000,
      });

      // Reabilitar botão
      btnEnviar.disabled = false;
      btnEnviar.textContent = textoOriginal;
      atualizarBotao();
    }
  });

  // Estado inicial do botão
  atualizarBotao();
});
