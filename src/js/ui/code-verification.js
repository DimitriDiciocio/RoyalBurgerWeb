// Sistema genérico de verificação de código
import { showToast, toastFromApiError, toastFromApiSuccess } from './alerts.js';

export class CodeVerification {
    constructor(config) {
        this.config = {
            title: 'Verificar Código',
            description: 'Digite o código de 6 dígitos enviado para seu email.',
            emailDisplay: true,
            showResendButton: true,
            showChangeEmailLink: false,
            changeEmailText: 'Deseja alterar seu e-mail?',
            changeEmailLink: 'Alterar aqui',
            changeEmailUrl: 'cadastro.html',
            onSuccess: null,
            onError: null,
            onResend: null,
            autoRequest: true,
            ...config
        };
        
        this.codeInputs = [];
        this.btnVerificar = null;
        this.btnReenviar = null;
        this.form = null;
        this.emailDisplay = null;
        this.email = null;
    }

    init() {
        this.setupElements();
        this.setupEventListeners();
        this.updateUI();
        
        if (this.config.autoRequest && this.email) {
            this.requestCode();
        }
        
        // Focar no primeiro campo
        if (this.codeInputs[0]) {
            this.codeInputs[0].focus();
        }
        
        this.updateButtonState();
    }

    setupElements() {
        // Obter elementos do DOM
        this.codeInputs = Array.from(document.querySelectorAll('.code-input'));
        this.btnVerificar = document.getElementById('btn-verificar');
        this.btnReenviar = document.getElementById('reenviar-codigo');
        this.form = document.getElementById('form-verificar-email');
        this.emailDisplay = document.getElementById('email-display');
        
        // Obter email da query string
        const urlParams = new URLSearchParams(window.location.search);
        this.email = urlParams.get('email');
        
        // Verificar se deve solicitar código automaticamente
        const noRequest = urlParams.get('noRequest');
        if (noRequest) {
            this.config.autoRequest = false;
        }
    }

    updateUI() {
        // Atualizar título
        const titleElement = document.querySelector('.verification-title');
        if (titleElement) {
            titleElement.textContent = this.config.title;
        }

        // Atualizar descrição
        const descElement = document.querySelector('.verification-description');
        if (descElement) {
            descElement.textContent = this.config.description;
        }

        // Atualizar exibição do email
        if (this.emailDisplay && this.email && this.config.emailDisplay) {
            this.emailDisplay.textContent = this.email;
            this.emailDisplay.style.display = 'block';
        } else if (this.emailDisplay) {
            this.emailDisplay.style.display = 'none';
        }

        // Atualizar botão de reenviar
        if (this.btnReenviar) {
            this.btnReenviar.style.display = this.config.showResendButton ? 'block' : 'none';
        }

        // Atualizar link de alterar email
        const changeEmailElement = document.querySelector('.change-email-text');
        if (changeEmailElement) {
            if (this.config.showChangeEmailLink) {
                changeEmailElement.innerHTML = `
                    ${this.config.changeEmailText} 
                    <a href="${this.config.changeEmailUrl}" class="change-email-link">${this.config.changeEmailLink}</a>
                `;
                changeEmailElement.style.display = 'block';
            } else {
                changeEmailElement.style.display = 'none';
            }
        }
    }

    setupEventListeners() {
        if (!this.form) return;

        // Configurar navegação entre campos de código
        this.codeInputs.forEach((input, index) => {
            this.setupCodeInput(input, index);
        });

        // Handler do formulário
        this.form.addEventListener('submit', (e) => this.handleSubmit(e));

        // Handler para reenviar código
        if (this.btnReenviar) {
            this.btnReenviar.addEventListener('click', (e) => this.handleResend(e));
        }
    }

    setupCodeInput(input, index) {
        // Evento de input (quando digita)
        input.addEventListener('input', (e) => {
            const value = e.target.value;

            // Permitir apenas números
            if (value && !/^\d$/.test(value)) {
                e.target.value = '';
                return;
            }

            // Se digitou um número
            if (value) {
                e.target.classList.add('filled');
                // Mover para o próximo campo
                if (index < this.codeInputs.length - 1) {
                    this.codeInputs[index + 1].focus();
                }
            } else {
                e.target.classList.remove('filled');
            }

            this.updateButtonState();
        });

        // Evento de tecla (para backspace e navegação)
        input.addEventListener('keydown', (e) => {
            // Backspace
            if (e.key === 'Backspace') {
                if (!input.value && index > 0) {
                    this.codeInputs[index - 1].focus();
                    this.codeInputs[index - 1].value = '';
                    this.codeInputs[index - 1].classList.remove('filled');
                } else {
                    input.value = '';
                    input.classList.remove('filled');
                }
                this.updateButtonState();
            }
            // Seta esquerda
            else if (e.key === 'ArrowLeft' && index > 0) {
                this.codeInputs[index - 1].focus();
            }
            // Seta direita
            else if (e.key === 'ArrowRight' && index < this.codeInputs.length - 1) {
                this.codeInputs[index + 1].focus();
            }
        });

        // Evento de paste (colar código completo)
        input.addEventListener('paste', (e) => {
            e.preventDefault();
            const pasteData = e.clipboardData.getData('text').trim();
            
            if (/^\d{6}$/.test(pasteData)) {
                pasteData.split('').forEach((char, i) => {
                    if (this.codeInputs[i]) {
                        this.codeInputs[i].value = char;
                        this.codeInputs[i].classList.add('filled');
                    }
                });
                this.codeInputs[5].focus();
                this.updateButtonState();
            }
        });

        // Selecionar texto ao focar
        input.addEventListener('focus', function () {
            this.select();
        });
    }

    getFullCode() {
        return this.codeInputs.map(input => input.value).join('');
    }

    isCodeComplete() {
        const code = this.getFullCode();
        return code.length === 6 && /^\d{6}$/.test(code);
    }

    updateButtonState() {
        if (this.btnVerificar) {
            this.btnVerificar.disabled = !this.isCodeComplete();
        }
    }

    clearFields() {
        this.codeInputs.forEach(input => {
            input.value = '';
            input.classList.remove('filled', 'error');
        });
        if (this.codeInputs[0]) {
            this.codeInputs[0].focus();
        }
        this.updateButtonState();
    }

    async handleSubmit(e) {
        e.preventDefault();

        const codigo = this.getFullCode();

        if (!this.isCodeComplete()) {
            showToast('Por favor, insira o código completo de 6 dígitos.', { type: 'error' });
            return;
        }

        // Desabilitar botão durante processamento
        if (this.btnVerificar) {
            this.btnVerificar.disabled = true;
            const textoOriginal = this.btnVerificar.textContent;
            this.btnVerificar.textContent = 'Verificando...';
        }

        try {
            // Chamar callback de verificação
            const result = await this.config.onVerify(this.email, codigo);
            
            // Adicionar classe de sucesso aos campos
            this.codeInputs.forEach(input => input.classList.remove('error'));
            
            // Chamar callback de sucesso
            if (this.config.onSuccess) {
                await this.config.onSuccess(result);
            } else {
                toastFromApiSuccess(result, 'Código verificado com sucesso!');
            }
            
        } catch (err) {
            // Chamar callback de erro
            if (this.config.onError) {
                await this.config.onError(err);
            } else {
                toastFromApiError(err);
            }
            
            // Adicionar classe de erro aos campos
            this.codeInputs.forEach(input => input.classList.add('error'));
            setTimeout(() => {
                this.codeInputs.forEach(input => input.classList.remove('error'));
            }, 500);
            
            // Limpar campos
            this.clearFields();
        } finally {
            // Reabilitar botão
            if (this.btnVerificar) {
                this.btnVerificar.disabled = false;
                this.btnVerificar.textContent = 'Verificar';
            }
        }
    }

    async handleResend(e) {
        e.preventDefault();

        // Desabilitar botão temporariamente
        if (this.btnReenviar) {
            this.btnReenviar.disabled = true;
            const textoOriginal = this.btnReenviar.textContent;
            this.btnReenviar.textContent = 'Reenviando...';
        }

        try {
            // Chamar callback de reenvio
            const result = await this.config.onResend(this.email);
            
            // Limpar campos
            this.clearFields();
            
            // Reabilitar botão após 30 segundos
            if (this.btnReenviar) {
                let countdown = 30;
                this.btnReenviar.textContent = `Aguarde ${countdown}s`;
                
                const interval = setInterval(() => {
                    countdown--;
                    this.btnReenviar.textContent = `Aguarde ${countdown}s`;
                    
                    if (countdown <= 0) {
                        clearInterval(interval);
                        this.btnReenviar.disabled = false;
                        this.btnReenviar.textContent = 'Reenviar Código';
                    }
                }, 1000);
            }
            
        } catch (err) {
            toastFromApiError(err);
            // Reabilitar botão imediatamente em caso de erro
            if (this.btnReenviar) {
                this.btnReenviar.disabled = false;
                this.btnReenviar.textContent = 'Reenviar Código';
            }
        }
    }

    async requestCode() {
        if (!this.config.onRequest || !this.email) return;

        try {
            await this.config.onRequest(this.email);
            showToast('Código de verificação enviado por email!', { type: 'success', autoClose: 3000 });
        } catch (err) {
            // Se der erro mas for porque já tem código pendente, não mostrar erro
            const errorMsg = err?.payload?.error || err?.message || '';
            if (!errorMsg.toLowerCase().includes('já existe') && 
                !errorMsg.toLowerCase().includes('pendente')) {
                toastFromApiError(err);
            }
        }
    }
}

// Função helper para criar instância de verificação de email
export function createEmailVerification(config = {}) {
    const defaultConfig = {
        title: 'Verifique seu E-mail',
        description: 'Enviamos um código de 6 dígitos para o seu email cadastrado.',
        showChangeEmailLink: true,
        changeEmailText: 'Deseja alterar seu e-mail?',
        changeEmailLink: 'Alterar aqui',
        changeEmailUrl: 'cadastro.html',
        ...config
    };

    return new CodeVerification(defaultConfig);
}

// Função helper para criar instância de verificação de alteração de senha
export function createPasswordChangeVerification(config = {}) {
    const defaultConfig = {
        title: 'Verificar Código de Alteração',
        description: 'Enviamos um código de 6 dígitos para confirmar a alteração da sua senha.',
        showChangeEmailLink: false,
        ...config
    };

    return new CodeVerification(defaultConfig);
}
