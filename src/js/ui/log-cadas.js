// Importar a função utilitária
import { inicializarGerenciamentoInputs } from "../utils.js";
import { showToast, toastFromApiError, toastFromApiSuccess } from "./alerts.js";
import { loginWithEmailAndPassword, verify2FACode } from "../api/auth.js";
import { registerCustomer } from "../api/user.js";
import { claimGuestCart, getCartIdFromStorage } from "../api/cart.js";
import {
  validateEmail as validateEmailCentralized,
  validatePhone as validatePhoneCentralized,
  validateBirthDate as validateBirthDateCentralized,
  validatePassword as validatePasswordCentralized,
  applyFieldValidation,
} from "../utils/validators.js";

// Função para redirecionar para verificação 2FA
function redirecionarPara2FA(userId, email) {
  // Redireciona para a página de verificação com parâmetros específicos para 2FA
  window.location.href = `verificar-email.html?email=${encodeURIComponent(
    email
  )}&type=2fa&user_id=${userId}`;
}

// Aguardar o DOM estar pronto
document.addEventListener("DOMContentLoaded", function () {
  // --- Inicializar gerenciamento de inputs ---
  inicializarGerenciamentoInputs();

  // --- Funcionalidade 1: Ativar/Desativar Botão "Entrar/Cadastrar" de forma genérica ---
  function configurarAtivacaoBotao(form) {
    const inputsObrigatorios = form.querySelectorAll(
      "input[required], select[required], textarea[required]"
    );
    const botaoAcao = form.querySelector("button.btn-acao");

    function verificarTodosInputsPreenchidos() {
      let todosPreenchidos = true;

      // Verificar se todos os campos obrigatórios estão preenchidos
      inputsObrigatorios.forEach((input) => {
        if (input.value.trim() === "") {
          todosPreenchidos = false;
        }
      });

      // Verificação adicional para cadastro - senhas devem coincidir
      const senha = document.getElementById("senha");
      const confirmaSenha = document.getElementById("confirma-senha");
      if (senha && confirmaSenha) {
        if (
          senha.value !== confirmaSenha.value ||
          senha.value.trim() === "" ||
          confirmaSenha.value.trim() === ""
        ) {
          todosPreenchidos = false;
        }
      }

      // Atualizar estado do botão
      if (todosPreenchidos) {
        botaoAcao.classList.remove("inativo");
        botaoAcao.disabled = false;
      } else {
        botaoAcao.classList.add("inativo");
        botaoAcao.disabled = true;
      }
    }

    // Adiciona o evento 'input' a todos os campos obrigatórios
    inputsObrigatorios.forEach((input) => {
      input.addEventListener("input", verificarTodosInputsPreenchidos);
      input.addEventListener("change", verificarTodosInputsPreenchidos);
    });

    // Chama a função uma vez ao carregar a página para definir o estado inicial do botão
    verificarTodosInputsPreenchidos();
  }

  // Aplica a funcionalidade a todos os formulários com a classe 'form-login'
  document.querySelectorAll(".form-login").forEach((form) => {
    configurarAtivacaoBotao(form);
  });

  // --- 2. Alternar Visibilidade da Senha ---
  function configurarToggleSenha(input, mostrar, ocultar) {
    mostrar.addEventListener("click", function () {
      input.type = "text";
      mostrar.style.display = "none";
      ocultar.style.display = "flex";
    });

    ocultar.addEventListener("click", function () {
      input.type = "password";
      mostrar.style.display = "flex";
      ocultar.style.display = "none";
    });
  }

  // Configurar toggle para senha principal
  const senhaInput = document.getElementById("senha");
  const mostrarSenha = document.getElementById("mostrarSenha");
  const ocultarSenha = document.getElementById("ocultarSenha");

  if (senhaInput && mostrarSenha && ocultarSenha) {
    configurarToggleSenha(senhaInput, mostrarSenha, ocultarSenha);
  }

  // Configurar toggle para confirmar senha
  const confirmaSenhaInput = document.getElementById("confirma-senha");
  const mostrarConfirmaSenha = document.getElementById("mostrarConfirmaSenha");
  const ocultarConfirmaSenha = document.getElementById("ocultarConfirmaSenha");

  if (confirmaSenhaInput && mostrarConfirmaSenha && ocultarConfirmaSenha) {
    configurarToggleSenha(
      confirmaSenhaInput,
      mostrarConfirmaSenha,
      ocultarConfirmaSenha
    );
  }

  // --- 3. Validação Visual da Senha Forte ---
  function validarSenhaForte(senha) {
    const validacao = validatePasswordCentralized(senha);
    const requisitos = {
      maiuscula: validacao.requirements?.uppercase || false,
      numero: validacao.requirements?.number || false,
      especial: validacao.requirements?.special || false,
      tamanho: validacao.requirements?.length || false,
    };

    // Atualizar visual dos requisitos
    const reqMaiuscula = document.getElementById("req-maiuscula");
    const reqNumero = document.getElementById("req-numero");
    const reqEspecial = document.getElementById("req-especial");
    const reqTamanho = document.getElementById("req-tamanho");

    if (reqMaiuscula)
      reqMaiuscula.classList.toggle("valid", requisitos.maiuscula);
    if (reqNumero) reqNumero.classList.toggle("valid", requisitos.numero);
    if (reqEspecial) reqEspecial.classList.toggle("valid", requisitos.especial);
    if (reqTamanho) reqTamanho.classList.toggle("valid", requisitos.tamanho);

    return validacao.valid;
  }

  // Função para revalidar botões quando senhas mudarem
  function revalidarBotoes() {
    document.querySelectorAll(".form-login").forEach((form) => {
      const botaoAcao = form.querySelector("button.btn-acao");
      if (botaoAcao) {
        const inputsObrigatorios = form.querySelectorAll(
          "input[required], select[required], textarea[required]"
        );
        let todosPreenchidos = true;
        let temErroValidacao = false;

        inputsObrigatorios.forEach((input) => {
          if (input.value.trim() === "") {
            todosPreenchidos = false;
          }

          // Verificar se há mensagens de erro visíveis
          const divInput = input.closest(".div-input");
          const mensagemErro = divInput?.querySelector(".mensagem-erro");
          if (mensagemErro) {
            temErroValidacao = true;
          }
        });

        // Verificação adicional para cadastro - senhas devem coincidir
        const senha = document.getElementById("senha");
        const confirmaSenha = document.getElementById("confirma-senha");
        if (senha && confirmaSenha) {
          if (
            senha.value !== confirmaSenha.value ||
            senha.value.trim() === "" ||
            confirmaSenha.value.trim() === ""
          ) {
            todosPreenchidos = false;
          }
        }

        // Verificar validações específicas
        const email = document.getElementById("email");
        const telefone = document.getElementById("telefone");
        const nascimento = document.getElementById("nascimento");

        if (email && email.value.trim() !== "") {
          const validacaoEmail = validateEmailCentralized(email.value);
          if (!validacaoEmail.valid) {
            temErroValidacao = true;
          }
        }

        if (telefone && telefone.value.trim() !== "") {
          const validacaoTelefone = validatePhoneCentralized(telefone.value);
          if (!validacaoTelefone.valid) {
            temErroValidacao = true;
          }
        }

        if (nascimento && nascimento.value.trim() !== "") {
          const validacaoNascimento = validateBirthDateCentralized(
            nascimento.value
          );
          if (!validacaoNascimento.valid) {
            temErroValidacao = true;
          }
        }

        if (todosPreenchidos && !temErroValidacao) {
          botaoAcao.classList.remove("inativo");
          botaoAcao.disabled = false;
        } else {
          botaoAcao.classList.add("inativo");
          botaoAcao.disabled = true;
        }
      }
    });
  }

  // Aplicar validação quando a senha for digitada (apenas visual dos requisitos)
  if (senhaInput) {
    senhaInput.addEventListener("input", function () {
      const senha = this.value;
      validarSenhaForte(senha);
    });

    // Validar senha ao perder o foco
    senhaInput.addEventListener("blur", function () {
      const senha = this.value;
      const confirmaSenha = document.getElementById("confirma-senha");

      if (confirmaSenha && confirmaSenha.value) {
        if (senha !== confirmaSenha.value) {
          confirmaSenha.classList.add("error");
          confirmaSenha.classList.remove("valid");
        } else {
          confirmaSenha.classList.remove("error");
          confirmaSenha.classList.add("valid");
        }
      }

      // Revalidar botões
      revalidarBotoes();
    });
  }

  // Verificar coincidência de senhas ao perder o foco
  if (confirmaSenhaInput) {
    confirmaSenhaInput.addEventListener("blur", function () {
      const senha = document.getElementById("senha")?.value || "";
      const confirmaSenha = this.value;

      if (confirmaSenha && senha !== confirmaSenha) {
        this.classList.add("error");
        this.classList.remove("valid");
      } else if (confirmaSenha && senha === confirmaSenha) {
        this.classList.remove("error");
        this.classList.add("valid");
      } else {
        this.classList.remove("error", "valid");
      }

      // Revalidar botões
      revalidarBotoes();
    });
  }

  // --- 4. Validação e Máscara para Telefone ---
  function validarTelefone(telefone) {
    const validacao = validatePhoneCentralized(telefone);
    return { valido: validacao.valid, mensagem: validacao.message };
  }

  function aplicarMascaraTelefone(value) {
    let valorLimpo = value.replace(/\D/g, "");

    // Limitar a 11 dígitos
    if (valorLimpo.length > 11) {
      valorLimpo = valorLimpo.substring(0, 11);
    }

    if (valorLimpo.length >= 11) {
      return valorLimpo.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
    } else if (valorLimpo.length >= 7) {
      return valorLimpo.replace(/(\d{2})(\d{4})(\d{0,4})/, "($1) $2-$3");
    } else if (valorLimpo.length >= 3) {
      return valorLimpo.replace(/(\d{2})(\d{0,5})/, "($1) $2");
    }
    return valorLimpo;
  }

  const telefoneInput = document.getElementById("telefone");
  if (telefoneInput) {
    // Aplicar máscara em tempo real
    telefoneInput.addEventListener("input", function () {
      const valorOriginal = this.value;
      const valorComMascara = aplicarMascaraTelefone(valorOriginal);
      this.value = valorComMascara;
    });

    // Validar apenas ao perder o foco
    telefoneInput.addEventListener("blur", function () {
      if (this.value.trim() !== "") {
        applyFieldValidation(this, (value) => validatePhoneCentralized(value));
        revalidarBotoes();
      }
    });
  }

  // --- 5. Validação de Email ---
  function validarEmail(email) {
    const validacao = validateEmailCentralized(email);
    return { valido: validacao.valid, mensagem: validacao.message };
  }

  const emailInput = document.getElementById("email");
  if (emailInput) {
    // Limitar caracteres em tempo real
    emailInput.addEventListener("input", function () {
      if (this.value.length > 254) {
        this.value = this.value.substring(0, 254);
      }
    });

    // Validar apenas ao perder o foco
    emailInput.addEventListener("blur", function () {
      if (this.value.trim() !== "") {
        applyFieldValidation(this, (value) => validateEmailCentralized(value));
        revalidarBotoes();
      }
    });
  }

  // --- 6. Validação de Data de Nascimento ---
  function validarDataNascimento(data) {
    const validacao = validateBirthDateCentralized(data);
    return { valido: validacao.valid, mensagem: validacao.message };
  }

  const nascimentoInput = document.getElementById("nascimento");
  if (nascimentoInput) {
    // Definir data máxima como hoje
    const hoje = new Date();
    const dataMaxima = hoje.toISOString().split("T")[0];
    nascimentoInput.setAttribute("max", dataMaxima);

    // Definir data mínima como 120 anos atrás
    const dataMinima = new Date();
    dataMinima.setFullYear(hoje.getFullYear() - 120);
    const dataMinimaString = dataMinima.toISOString().split("T")[0];
    nascimentoInput.setAttribute("min", dataMinimaString);

    // Validar apenas ao perder o foco
    nascimentoInput.addEventListener("blur", function () {
      if (this.value.trim() !== "") {
        applyFieldValidation(this, (value) =>
          validateBirthDateCentralized(value)
        );
        revalidarBotoes();
      }
    });
  }

  // --- 7. Animações dos labels são gerenciadas pela função utilitária ---

  // --- 6. Integração com API: Login e Cadastro ---
  function normalizarTelefone(valor) {
    return (valor || "").replace(/\D/g, "");
  }

  function exibirMensagem(msg, tipo = "erro") {
    const map = {
      erro: "error",
      sucesso: "success",
      aviso: "warning",
      info: "info",
    };
    const t = map[tipo] || "info";
    showToast(msg, { type: t });
  }

  const form = document.querySelector("form.form-login");
  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();

      const nome = document.getElementById("nome")?.value?.trim();
      const email = document.getElementById("email")?.value?.trim();
      const senha = document.getElementById("senha")?.value || "";
      const confirma = document.getElementById("confirma-senha")?.value || "";
      const nascimento = document.getElementById("nascimento")?.value?.trim();
      const nascimentoFormatado = nascimento
        ? nascimento.split("-").reverse().join("-")
        : "";
      const telefone = normalizarTelefone(
        document.getElementById("telefone")?.value || ""
      );

      const isCadastro = Boolean(
        nome ||
          nascimento ||
          telefone ||
          document.getElementById("confirma-senha")
      );

      try {
        if (isCadastro) {
          // Cadastro
          const payload = {
            full_name: nome,
            email,
            password: senha,
            password_confirmation: confirma,
            date_of_birth: nascimentoFormatado,
            phone: telefone,
          };
          const resp = await registerCustomer(payload);
          toastFromApiSuccess(
            resp,
            "Conta criada com sucesso! Redirecionando para verificação de email..."
          );
          // Redireciona para verificação de email
          setTimeout(() => {
            window.location.href = `verificar-email.html?email=${encodeURIComponent(
              email
            )}`;
          }, 1500);
        } else {
          // Login
          if (!email || !senha) return;

          try {
            const resp = await loginWithEmailAndPassword({
              email,
              password: senha,
            });

            // Verificar se 2FA é necessário
            if (resp && resp.requires_2fa) {
              showToast("Código de verificação enviado para seu email.", {
                type: "info",
                title: "Verificação em duas etapas",
                autoClose: 2000,
              });

              // Redirecionar para página de verificação 2FA
              setTimeout(() => {
                redirecionarPara2FA(resp.user_id, email);
              }, 2000);
              return;
            }

            // Login normal (sem 2FA)
            const userResp = resp?.user || null;
            const nomeUsuario = userResp?.full_name || userResp?.name || "";
            showToast(`Bem-vindo${nomeUsuario ? ", " + nomeUsuario : ""}!`, {
              type: "success",
              title: "Login",
            });

            // Atualiza header imediatamente com dados do usuário (fallback para e-mail quando não vier user)
            try {
              const fallbackUser = userResp || { email };
              window.applyLoggedHeader &&
                window.applyLoggedHeader(fallbackUser);
            } catch (_e) {}

            // Reivindicar carrinho de convidado se existir
            const guestCartId = getCartIdFromStorage();
            if (guestCartId) {
              try {
                const claimResult = await claimGuestCart();

                if (claimResult.success) {
                  showToast("Seu carrinho foi restaurado!", {
                    type: "info",
                    title: "Carrinho Restaurado",
                    autoClose: 2000,
                  });
                } else {
                  // ALTERAÇÃO: Tratar erros de estoque insuficiente durante recuperação
                  // Informar usuário sobre itens que não puderam ser restaurados
                  const errorMsg = claimResult.error || "Erro ao restaurar carrinho";
                  if (errorMsg.includes("Estoque insuficiente") || errorMsg.includes("INSUFFICIENT_STOCK")) {
                    showToast(
                      "Alguns itens do seu carrinho não puderam ser restaurados devido a estoque insuficiente. Verifique sua cesta.",
                      {
                        type: "warning",
                        title: "Carrinho Parcialmente Restaurado",
                        autoClose: 5000,
                      }
                    );
                  } else {
                    // Outros erros são tratados silenciosamente para não impactar UX
                    // TODO: REVISAR - Considerar logging estruturado para diagnóstico
                  }
                }
              } catch (claimErr) {
                // ALTERAÇÃO: Tratar erros de estoque durante recuperação
                const errorMsg = claimErr?.message || claimErr?.error || "";
                if (errorMsg.includes("Estoque insuficiente") || errorMsg.includes("INSUFFICIENT_STOCK")) {
                  showToast(
                    "Alguns itens do seu carrinho não puderam ser restaurados devido a estoque insuficiente. Verifique sua cesta.",
                    {
                      type: "warning",
                      title: "Carrinho Parcialmente Restaurado",
                      autoClose: 5000,
                    }
                  );
                }
                // Outros erros são tratados silenciosamente para não impactar UX
                // TODO: REVISAR - Considerar logging estruturado para diagnóstico
              }
            }

            setTimeout(() => {
              window.location.href = "../../index.html";
            }, 1200);
          } catch (loginErr) {
            // Verificar o tipo específico de erro
            const errorMsg =
              loginErr?.payload?.error || loginErr?.message || "";
            const errorMsgLower = errorMsg.toLowerCase();

            // Verificar se é erro de conta inativa/desativada
            if (
              errorMsgLower.includes("conta inativa") ||
              errorMsgLower.includes("conta desativada") ||
              errorMsgLower.includes("usuário inativo") ||
              errorMsgLower.includes("account inactive") ||
              errorMsgLower.includes("user inactive") ||
              errorMsgLower.includes("conta suspensa") ||
              errorMsgLower.includes("conta bloqueada")
            ) {
              showToast(
                "Sua conta está inativa. Entre em contato com o suporte para reativá-la.",
                {
                  type: "error",
                  title: "Conta Inativa",
                  autoClose: 5000,
                }
              );
            } else if (
              errorMsgLower.includes("email não verificado") ||
              errorMsgLower.includes("email não está verificado") ||
              errorMsgLower.includes("verifique seu email") ||
              errorMsgLower.includes("não verificado") ||
              (loginErr?.status === 403 &&
                !errorMsgLower.includes("inativa") &&
                !errorMsgLower.includes("desativada"))
            ) {
              showToast(
                "Seu email ainda não foi verificado. Redirecionando para verificação...",
                {
                  type: "warning",
                  title: "Verificação Pendente",
                  autoClose: 2000,
                  noButtons: true,
                }
              );

              setTimeout(() => {
                // Adiciona parâmetro noRequest para não solicitar novo código
                window.location.href = `verificar-email.html?email=${encodeURIComponent(
                  email
                )}&noRequest=true`;
              }, 2000);
            } else {
              throw loginErr;
            }
          }
        }
      } catch (err) {
        toastFromApiError(err);
      }
    });
  }

  // --- Handler para "Esqueceu a senha?" ---
  const forgotPasswordLink = document.getElementById("forgot-password");
  if (forgotPasswordLink) {
    forgotPasswordLink.addEventListener("click", function (e) {
      e.preventDefault();
      window.location.href = "esqueceu-senha.html";
    });
  }

  // --- Handler para "Alterar senha por código" ---
  const changePasswordCodeLink = document.getElementById(
    "change-password-code"
  );
  if (changePasswordCodeLink) {
    changePasswordCodeLink.addEventListener("click", function (e) {
      e.preventDefault();

      // Obter email do campo de login
      const emailInput = document.getElementById("email");
      const email = emailInput.value.trim();

      if (!email) {
        showToast("Por favor, digite seu email primeiro.", { type: "error" });
        emailInput.focus();
        return;
      }

      // Validar formato do email
      const emailValidation = validateEmailCentralized(email);
      if (!emailValidation.valid) {
        showToast(
          emailValidation.message || "Por favor, digite um email válido.",
          { type: "error" }
        );
        emailInput.focus();
        return;
      }

      // Redirecionar para página de verificação de código (alteração de senha)
      window.location.href = `verificar-email.html?email=${encodeURIComponent(
        email
      )}&type=password-change`;
    });
  }

  // Tornar função global para uso
  window.redirecionarPara2FA = redirecionarPara2FA;
});
