/**
 * Módulo Centralizado de Validação
 *
 * Este módulo fornece funções reutilizáveis para validação de dados de formulário,
 * garantindo consistência e segurança em toda a aplicação.
 */

/**
 * Valida formato de email
 * @param {string} email - Email a ser validado
 * @returns {{valid: boolean, message: string}} Resultado da validação
 */
export function validateEmail(email) {
  if (!email || typeof email !== "string" || email.trim() === "") {
    return { valid: false, message: "Email é obrigatório" };
  }

  // Regex robusta para validação de email (RFC 5322 simplificada)
  const emailRegex =
    /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

  if (!emailRegex.test(email)) {
    return { valid: false, message: "Formato de email inválido" };
  }

  // Verificar se não tem espaços
  if (email.includes(" ")) {
    return { valid: false, message: "Email não pode conter espaços" };
  }

  // Verificar se não tem caracteres consecutivos inválidos
  if (email.includes("..") || email.includes("@@")) {
    return { valid: false, message: "Email contém caracteres inválidos" };
  }

  // Verificar se termina com domínio válido
  const partes = email.split("@");
  if (partes.length !== 2) {
    return { valid: false, message: "Email deve ter um @" };
  }

  const dominio = partes[1];
  if (
    !dominio.includes(".") ||
    dominio.endsWith(".") ||
    dominio.startsWith(".")
  ) {
    return { valid: false, message: "Domínio do email inválido" };
  }

  // Limitar tamanho máximo (RFC 5321)
  if (email.length > 254) {
    return {
      valid: false,
      message: "Email muito longo (máximo 254 caracteres)",
    };
  }

  return { valid: true, message: "" };
}

/**
 * Valida telefone brasileiro (10 ou 11 dígitos)
 * @param {string} telefone - Telefone a ser validado
 * @returns {{valid: boolean, message: string}} Resultado da validação
 */
export function validatePhone(telefone) {
  if (!telefone || typeof telefone !== "string") {
    return { valid: false, message: "Telefone inválido" };
  }

  const telefoneLimpo = telefone.replace(/\D/g, "");

  // Verificar se tem pelo menos 10 dígitos (telefone fixo)
  if (telefoneLimpo.length < 10) {
    return {
      valid: false,
      message: "Telefone deve ter pelo menos 10 dígitos",
    };
  }

  // Verificar se tem mais de 11 dígitos
  if (telefoneLimpo.length > 11) {
    return {
      valid: false,
      message: "Telefone deve ter no máximo 11 dígitos",
    };
  }

  // Verificar se é um celular (11 dígitos) e se o terceiro dígito é 9
  if (telefoneLimpo.length === 11 && telefoneLimpo.charAt(2) !== "9") {
    return { valid: false, message: "Celular deve começar com 9 após o DDD" };
  }

  // Verificar DDD válido (11-99)
  const ddd = telefoneLimpo.substring(0, 2);
  const dddNum = parseInt(ddd);
  if (isNaN(dddNum) || dddNum < 11 || dddNum > 99) {
    return { valid: false, message: "DDD inválido" };
  }

  return { valid: true, message: "" };
}

/**
 * Valida CPF (algoritmo oficial da Receita Federal)
 * @param {string} cpf - CPF a ser validado
 * @returns {{valid: boolean, message: string}} Resultado da validação
 */
export function validateCPF(cpf) {
  if (!cpf || typeof cpf !== "string") {
    return { valid: false, message: "CPF inválido" };
  }

  // Remove caracteres não numéricos
  const cpfLimpo = cpf.replace(/[^\d]/g, "");

  // Verifica se tem 11 dígitos
  if (cpfLimpo.length !== 11) {
    return { valid: false, message: "CPF deve ter 11 dígitos" };
  }

  // Verifica se todos os dígitos são iguais (ex: 111.111.111-11)
  if (/^(\d)\1{10}$/.test(cpfLimpo)) {
    return { valid: false, message: "CPF inválido (todos os dígitos iguais)" };
  }

  // Validação do primeiro dígito verificador
  let soma = 0;
  for (let i = 0; i < 9; i++) {
    soma += parseInt(cpfLimpo.charAt(i)) * (10 - i);
  }
  let resto = 11 - (soma % 11);
  if (resto === 10 || resto === 11) resto = 0;
  if (resto !== parseInt(cpfLimpo.charAt(9))) {
    return { valid: false, message: "CPF inválido" };
  }

  // Validação do segundo dígito verificador
  soma = 0;
  for (let i = 0; i < 10; i++) {
    soma += parseInt(cpfLimpo.charAt(i)) * (11 - i);
  }
  resto = 11 - (soma % 11);
  if (resto === 10 || resto === 11) resto = 0;
  if (resto !== parseInt(cpfLimpo.charAt(10))) {
    return { valid: false, message: "CPF inválido" };
  }

  return { valid: true, message: "" };
}

/**
 * Valida CNPJ (algoritmo oficial da Receita Federal)
 * @param {string} cnpj - CNPJ a ser validado
 * @returns {{valid: boolean, message: string}} Resultado da validação
 */
export function validateCNPJ(cnpj) {
  if (!cnpj || typeof cnpj !== "string") {
    return { valid: false, message: "CNPJ inválido" };
  }

  // Remove caracteres não numéricos
  const cnpjLimpo = cnpj.replace(/[^\d]/g, "");

  // Verifica se tem 14 dígitos
  if (cnpjLimpo.length !== 14) {
    return { valid: false, message: "CNPJ deve ter 14 dígitos" };
  }

  // Verifica se todos os dígitos são iguais
  if (/^(\d)\1{13}$/.test(cnpjLimpo)) {
    return { valid: false, message: "CNPJ inválido (todos os dígitos iguais)" };
  }

  // Validação do primeiro dígito verificador
  let tamanho = cnpjLimpo.length - 2;
  let numeros = cnpjLimpo.substring(0, tamanho);
  const digitos = cnpjLimpo.substring(tamanho);
  let soma = 0;
  let pos = tamanho - 7;

  for (let i = tamanho; i >= 1; i--) {
    soma += parseInt(numeros.charAt(tamanho - i)) * pos--;
    if (pos < 2) pos = 9;
  }

  let resultado = soma % 11 < 2 ? 0 : 11 - (soma % 11);
  if (resultado !== parseInt(digitos.charAt(0))) {
    return { valid: false, message: "CNPJ inválido" };
  }

  // Validação do segundo dígito verificador
  tamanho = tamanho + 1;
  numeros = cnpjLimpo.substring(0, tamanho);
  soma = 0;
  pos = tamanho - 7;

  for (let i = tamanho; i >= 1; i--) {
    soma += parseInt(numeros.charAt(tamanho - i)) * pos--;
    if (pos < 2) pos = 9;
  }

  resultado = soma % 11 < 2 ? 0 : 11 - (soma % 11);
  if (resultado !== parseInt(digitos.charAt(1))) {
    return { valid: false, message: "CNPJ inválido" };
  }

  return { valid: true, message: "" };
}

/**
 * Valida CEP brasileiro (8 dígitos)
 * @param {string} cep - CEP a ser validado
 * @returns {{valid: boolean, message: string}} Resultado da validação
 */
export function validateCEP(cep) {
  if (!cep || typeof cep !== "string") {
    return { valid: false, message: "CEP inválido" };
  }

  const cepLimpo = cep.replace(/\D/g, "");

  if (cepLimpo.length !== 8) {
    return { valid: false, message: "CEP deve ter 8 dígitos" };
  }

  return { valid: true, message: "" };
}

/**
 * Valida data de nascimento (18+ anos, não no futuro)
 * @param {string} data - Data no formato YYYY-MM-DD
 * @param {Object} options - Opções de validação
 * @param {number} options.minAge - Idade mínima (padrão: 18)
 * @param {number} options.maxAge - Idade máxima (padrão: 120)
 * @returns {{valid: boolean, message: string}} Resultado da validação
 */
export function validateBirthDate(data, options = {}) {
  const { minAge = 18, maxAge = 120 } = options;

  if (!data || typeof data !== "string" || data.trim() === "") {
    return { valid: false, message: "Data de nascimento é obrigatória" };
  }

  const dataSelecionada = new Date(data);
  const hoje = new Date();
  const dataMinima = new Date("1850-01-01");

  // Verificar se a data é válida
  if (isNaN(dataSelecionada.getTime())) {
    return { valid: false, message: "Data inválida" };
  }

  // Verificar se a data não é no futuro
  if (dataSelecionada > hoje) {
    return {
      valid: false,
      message: "Data de nascimento não pode ser no futuro",
    };
  }

  // Verificar se a data não é muito antiga
  if (dataSelecionada < dataMinima) {
    return { valid: false, message: "Data de nascimento muito antiga" };
  }

  // Calcular idade real
  const idade = hoje.getFullYear() - dataSelecionada.getFullYear();
  const mesAtual = hoje.getMonth();
  const mesNascimento = dataSelecionada.getMonth();
  const diaAtual = hoje.getDate();
  const diaNascimento = dataSelecionada.getDate();

  let idadeReal = idade;
  if (
    mesNascimento > mesAtual ||
    (mesNascimento === mesAtual && diaNascimento > diaAtual)
  ) {
    idadeReal--;
  }

  if (idadeReal < minAge) {
    return {
      valid: false,
      message: `Você deve ter pelo menos ${minAge} anos`,
    };
  }

  if (idadeReal > maxAge) {
    return { valid: false, message: "Idade inválida" };
  }

  return { valid: true, message: "" };
}

/**
 * Valida força da senha
 * @param {string} senha - Senha a ser validada
 * @param {Object} options - Opções de validação
 * @param {number} options.minLength - Tamanho mínimo (padrão: 8)
 * @param {boolean} options.requireUppercase - Requer maiúscula (padrão: true)
 * @param {boolean} options.requireNumber - Requer número (padrão: true)
 * @param {boolean} options.requireSpecial - Requer caractere especial (padrão: true)
 * @returns {{valid: boolean, message: string, requirements: Object}} Resultado da validação
 */
export function validatePassword(senha, options = {}) {
  const {
    minLength = 8,
    requireUppercase = true,
    requireNumber = true,
    requireSpecial = true,
  } = options;

  if (!senha || typeof senha !== "string") {
    return {
      valid: false,
      message: "Senha é obrigatória",
      requirements: {},
    };
  }

  const requirements = {
    length: senha.length >= minLength,
    uppercase: !requireUppercase || /[A-Z]/.test(senha),
    number: !requireNumber || /\d/.test(senha),
    special: !requireSpecial || /[!@#$%^&*(),.?":{}|<>]/.test(senha),
  };

  const allValid = Object.values(requirements).every((req) => req);

  if (!allValid) {
    const missing = [];
    if (!requirements.length)
      missing.push(`pelo menos ${minLength} caracteres`);
    if (!requirements.uppercase) missing.push("uma letra maiúscula");
    if (!requirements.number) missing.push("um número");
    if (!requirements.special) missing.push("um caractere especial");

    return {
      valid: false,
      message: `A senha deve conter: ${missing.join(", ")}`,
      requirements,
    };
  }

  return { valid: true, message: "", requirements };
}

/**
 * Valida campo obrigatório
 * @param {any} value - Valor a ser validado
 * @param {string} fieldName - Nome do campo (para mensagem de erro)
 * @returns {{valid: boolean, message: string}} Resultado da validação
 */
export function validateRequired(value, fieldName = "Campo") {
  if (value === null || value === undefined) {
    return { valid: false, message: `${fieldName} é obrigatório` };
  }

  if (typeof value === "string" && value.trim() === "") {
    return { valid: false, message: `${fieldName} é obrigatório` };
  }

  return { valid: true, message: "" };
}

/**
 * Valida número (mínimo e máximo)
 * @param {any} value - Valor a ser validado
 * @param {Object} options - Opções de validação
 * @param {number} options.min - Valor mínimo
 * @param {number} options.max - Valor máximo
 * @param {string} options.fieldName - Nome do campo (para mensagem de erro)
 * @returns {{valid: boolean, message: string}} Resultado da validação
 */
export function validateNumber(value, options = {}) {
  const { min, max, fieldName = "Campo" } = options;

  if (value === null || value === undefined || value === "") {
    return { valid: false, message: `${fieldName} é obrigatório` };
  }

  const num = typeof value === "string" ? parseFloat(value) : Number(value);

  if (isNaN(num)) {
    return { valid: false, message: `${fieldName} deve ser um número válido` };
  }

  if (min !== undefined && num < min) {
    return {
      valid: false,
      message: `${fieldName} deve ser maior ou igual a ${min}`,
    };
  }

  if (max !== undefined && num > max) {
    return {
      valid: false,
      message: `${fieldName} deve ser menor ou igual a ${max}`,
    };
  }

  return { valid: true, message: "" };
}

/**
 * Valida comprimento de texto
 * @param {string} text - Texto a ser validado
 * @param {Object} options - Opções de validação
 * @param {number} options.minLength - Comprimento mínimo
 * @param {number} options.maxLength - Comprimento máximo
 * @param {string} options.fieldName - Nome do campo (para mensagem de erro)
 * @returns {{valid: boolean, message: string}} Resultado da validação
 */
export function validateLength(text, options = {}) {
  const { minLength, maxLength, fieldName = "Campo" } = options;

  if (text === null || text === undefined) {
    text = "";
  }

  const textStr = String(text);
  const length = textStr.trim().length;

  if (minLength !== undefined && length < minLength) {
    return {
      valid: false,
      message: `${fieldName} deve ter pelo menos ${minLength} caracteres`,
    };
  }

  if (maxLength !== undefined && length > maxLength) {
    return {
      valid: false,
      message: `${fieldName} deve ter no máximo ${maxLength} caracteres`,
    };
  }

  return { valid: true, message: "" };
}

/**
 * Aplica validação em um campo de formulário com feedback visual
 * @param {HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement} field - Campo a ser validado
 * @param {Function} validator - Função de validação que retorna {valid, message}
 * @param {boolean} clearOnValid - Se deve limpar mensagens de erro quando válido (padrão: true)
 * @returns {boolean} True se válido, false caso contrário
 */
export function applyFieldValidation(field, validator, clearOnValid = true) {
  if (!field) return false;

  const validation = validator(field.value);

  const divInput = field.closest(".div-input");
  let mensagemErro = divInput ? divInput.querySelector(".mensagem-erro") : null;

  if (!validation.valid) {
    field.classList.add("error");
    field.classList.remove("valid");

    if (divInput) {
      if (!mensagemErro) {
        mensagemErro = document.createElement("div");
        mensagemErro.className = "mensagem-erro";
        divInput.appendChild(mensagemErro);
      }
      mensagemErro.textContent = validation.message;
    }
  } else {
    if (clearOnValid) {
      field.classList.remove("error");
      field.classList.add("valid");

      if (mensagemErro) {
        mensagemErro.remove();
      }
    }
  }

  return validation.valid;
}

/**
 * Limpa validação visual de um campo
 * @param {HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement} field - Campo a ser limpo
 */
export function clearFieldValidation(field) {
  if (!field) return;

  field.classList.remove("error", "valid");

  const divInput = field.closest(".div-input");
  if (divInput) {
    const mensagemErro = divInput.querySelector(".mensagem-erro");
    if (mensagemErro) {
      mensagemErro.remove();
    }
  }
}
