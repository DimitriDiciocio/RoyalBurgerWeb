// Gerenciamento da verificação de email
import { showToast, toastFromApiError, toastFromApiSuccess } from './alerts.js';
import { verifyEmailCode, resendVerificationCode, requestEmailVerification } from '../api/user.js';

document.addEventListener('DOMContentLoaded', async function () {
    // Obter email da query string
    const urlParams = new URLSearchParams(window.location.search);
    const email = urlParams.get('email');

    const emailDisplay = document.getElementById('email-display');
    const codeInputs = document.querySelectorAll('.code-input');
    const btnVerificar = document.getElementById('btn-verificar');
    const btnReenviar = document.getElementById('reenviar-codigo');
    const form = document.getElementById('form-verificar-email');

    // Se não houver email, redireciona para cadastro
    if (!email) {
        showToast('Email não fornecido. Faça o cadastro primeiro.', { type: 'error' });
        setTimeout(() => {
            window.location.href = 'cadastro.html';
        }, 1500);
        return;
    }

    // Exibir email
    emailDisplay.textContent = email;

    // Verificar se deve solicitar código automaticamente
    // Se vier de um login negado, não solicitar novamente (parâmetro noRequest)
    const noRequest = urlParams.get('noRequest');
    
    if (!noRequest) {
        // Solicitar código de verificação automaticamente ao carregar
        try {
            await requestEmailVerification(email);
            showToast('Código de verificação enviado por email!', { type: 'success', autoClose: 3000 });
        } catch (err) {
            // Se der erro mas for porque já tem código pendente, não mostrar erro
            const errorMsg = err?.payload?.error || err?.message || '';
            if (!errorMsg.toLowerCase().includes('já existe') && 
                !errorMsg.toLowerCase().includes('pendente')) {
                toastFromApiError(err);
            }
        }
    } else {
        // Usuário foi redirecionado do login, informar que pode usar código existente
        showToast('Use o código que já foi enviado ou solicite um novo.', { 
            type: 'info', 
            autoClose: 3000 
        });
    }

    // Função para obter código completo
    function getFullCode() {
        return Array.from(codeInputs).map(input => input.value).join('');
    }

    // Função para validar código completo
    function isCodeComplete() {
        return getFullCode().length === 6 && /^\d{6}$/.test(getFullCode());
    }

    // Função para atualizar estado do botão
    function atualizarBotao() {
        if (isCodeComplete()) {
            btnVerificar.disabled = false;
        } else {
            btnVerificar.disabled = true;
        }
    }

    // Função para limpar todos os campos
    function limparCampos() {
        codeInputs.forEach(input => {
            input.value = '';
            input.classList.remove('filled', 'error');
        });
        codeInputs[0].focus();
        atualizarBotao();
    }

    // Configurar navegação entre campos
    codeInputs.forEach((input, index) => {
        // Evento de input (quando digita)
        input.addEventListener('input', function (e) {
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
                if (index < codeInputs.length - 1) {
                    codeInputs[index + 1].focus();
                }
            } else {
                e.target.classList.remove('filled');
            }

            atualizarBotao();
        });

        // Evento de tecla (para backspace e navegação)
        input.addEventListener('keydown', function (e) {
            // Backspace
            if (e.key === 'Backspace') {
                if (!input.value && index > 0) {
                    codeInputs[index - 1].focus();
                    codeInputs[index - 1].value = '';
                    codeInputs[index - 1].classList.remove('filled');
                } else {
                    input.value = '';
                    input.classList.remove('filled');
                }
                atualizarBotao();
            }
            // Seta esquerda
            else if (e.key === 'ArrowLeft' && index > 0) {
                codeInputs[index - 1].focus();
            }
            // Seta direita
            else if (e.key === 'ArrowRight' && index < codeInputs.length - 1) {
                codeInputs[index + 1].focus();
            }
        });

        // Evento de paste (colar código completo)
        input.addEventListener('paste', function (e) {
            e.preventDefault();
            const pasteData = e.clipboardData.getData('text').trim();
            
            if (/^\d{6}$/.test(pasteData)) {
                pasteData.split('').forEach((char, i) => {
                    if (codeInputs[i]) {
                        codeInputs[i].value = char;
                        codeInputs[i].classList.add('filled');
                    }
                });
                codeInputs[5].focus();
                atualizarBotao();
            }
        });

        // Selecionar texto ao focar
        input.addEventListener('focus', function () {
            this.select();
        });
    });

    // Handler do formulário
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const codigo = getFullCode();

        if (!isCodeComplete()) {
            showToast('Por favor, insira o código completo de 6 dígitos.', { type: 'error' });
            return;
        }

        // Desabilitar botão durante processamento
        btnVerificar.disabled = true;
        const textoOriginal = btnVerificar.textContent;
        btnVerificar.textContent = 'Verificando...';

        try {
            const resp = await verifyEmailCode(email, codigo);
            toastFromApiSuccess(resp, 'Email verificado com sucesso!');
            
            // Adicionar classe de sucesso aos campos
            codeInputs.forEach(input => input.classList.remove('error'));
            
            // Redirecionar para login após sucesso
            setTimeout(() => {
                window.location.href = 'login.html';
            }, 1500);
        } catch (err) {
            toastFromApiError(err);
            
            // Adicionar classe de erro aos campos
            codeInputs.forEach(input => input.classList.add('error'));
            setTimeout(() => {
                codeInputs.forEach(input => input.classList.remove('error'));
            }, 500);
            
            // Limpar campos
            limparCampos();
            
            // Reabilitar botão
            btnVerificar.disabled = false;
            btnVerificar.textContent = textoOriginal;
        }
    });

    // Handler para reenviar código
    btnReenviar.addEventListener('click', async (e) => {
        e.preventDefault();

        // Desabilitar botão temporariamente
        btnReenviar.disabled = true;
        const textoOriginal = btnReenviar.textContent;
        btnReenviar.textContent = 'Reenviando...';

        try {
            const resp = await resendVerificationCode(email);
            toastFromApiSuccess(resp, 'Novo código enviado com sucesso!');
            
            // Limpar campos
            limparCampos();
            
            // Reabilitar botão após 30 segundos
            let countdown = 30;
            btnReenviar.textContent = `Aguarde ${countdown}s`;
            
            const interval = setInterval(() => {
                countdown--;
                btnReenviar.textContent = `Aguarde ${countdown}s`;
                
                if (countdown <= 0) {
                    clearInterval(interval);
                    btnReenviar.disabled = false;
                    btnReenviar.textContent = textoOriginal;
                }
            }, 1000);
        } catch (err) {
            toastFromApiError(err);
            // Reabilitar botão imediatamente em caso de erro
            btnReenviar.disabled = false;
            btnReenviar.textContent = textoOriginal;
        }
    });

    // Focar no primeiro campo
    codeInputs[0].focus();
    
    // Estado inicial do botão
    atualizarBotao();
});
