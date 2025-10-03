// Gerenciamento da página de redefinir senha
import { inicializarGerenciamentoInputs } from '../utils.js';
import { showToast, toastFromApiError, toastFromApiSuccess } from './alerts.js';
import { resetPassword, changePasswordWithCode } from '../api/user.js';

document.addEventListener('DOMContentLoaded', function () {
    // Inicializar gerenciamento de inputs
    inicializarGerenciamentoInputs();

    // Obter parâmetros da query string
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    const type = urlParams.get('type'); // 'reset' ou 'password-change'
    const email = urlParams.get('email');
    const reset_code = urlParams.get('reset_code');

    const senhaInput = document.getElementById('senha');
    const confirmaSenhaInput = document.getElementById('confirma-senha');
    const btnRedefinir = document.getElementById('btn-redefinir');
    const form = document.getElementById('form-redefinir-senha');

    // Verificar se é alteração de senha por código
    if (type === 'password-change') {
        // Obter dados do sessionStorage
        const passwordChangeEmail = sessionStorage.getItem('passwordChangeEmail');
        const passwordChangeCode = sessionStorage.getItem('passwordChangeCode');
        
        if (!passwordChangeEmail || !passwordChangeCode) {
            showToast('Sessão expirada. Solicite um novo código de alteração.', { type: 'error' });
            setTimeout(() => {
                window.location.href = 'login.html';
            }, 2000);
            return;
        }
        
        // Atualizar título e descrição
        const titleElement = document.getElementById('verification-title');
        const descElement = document.getElementById('verification-description');
        if (titleElement) titleElement.textContent = 'Nova Senha';
        if (descElement) descElement.textContent = 'Digite sua nova senha abaixo.';
        
        // Atualizar texto do botão
        if (btnRedefinir) btnRedefinir.textContent = 'Alterar Senha';
    } else {
        // Verificação de parâmetros para reset de senha
        if (!email || !reset_code) {
            showToast('Parâmetros inválidos ou expirados. Solicite um novo código de recuperação.', { type: 'error' });
            setTimeout(() => {
                window.location.href = 'esqueceu-senha.html';
            }, 2000);
            return;
        }
    }

    // Toggle visibilidade da senha
    function configurarToggleSenha(input, mostrar, ocultar) {
        mostrar.addEventListener('click', function () {
            input.type = 'text';
            mostrar.style.display = 'none';
            ocultar.style.display = 'flex';
        });

        ocultar.addEventListener('click', function () {
            input.type = 'password';
            mostrar.style.display = 'flex';
            ocultar.style.display = 'none';
        });
    }

    const mostrarSenha = document.getElementById('mostrarSenha');
    const ocultarSenha = document.getElementById('ocultarSenha');
    if (senhaInput && mostrarSenha && ocultarSenha) {
        configurarToggleSenha(senhaInput, mostrarSenha, ocultarSenha);
    }

    const mostrarConfirmaSenha = document.getElementById('mostrarConfirmaSenha');
    const ocultarConfirmaSenha = document.getElementById('ocultarConfirmaSenha');
    if (confirmaSenhaInput && mostrarConfirmaSenha && ocultarConfirmaSenha) {
        configurarToggleSenha(confirmaSenhaInput, mostrarConfirmaSenha, ocultarConfirmaSenha);
    }

    // Validação de senha forte
    function validarSenhaForte(senha) {
        const requisitos = {
            maiuscula: /[A-Z]/.test(senha),
            numero: /\d/.test(senha),
            especial: /[!@#$%^&*(),.?":{}|<>]/.test(senha),
            tamanho: senha.length >= 8
        };

        // Atualizar visual dos requisitos
        const reqMaiuscula = document.getElementById('req-maiuscula');
        const reqNumero = document.getElementById('req-numero');
        const reqEspecial = document.getElementById('req-especial');
        const reqTamanho = document.getElementById('req-tamanho');

        if (reqMaiuscula) reqMaiuscula.classList.toggle('valid', requisitos.maiuscula);
        if (reqNumero) reqNumero.classList.toggle('valid', requisitos.numero);
        if (reqEspecial) reqEspecial.classList.toggle('valid', requisitos.especial);
        if (reqTamanho) reqTamanho.classList.toggle('valid', requisitos.tamanho);

        return Object.values(requisitos).every(req => req);
    }

    // Função para atualizar estado do botão
    function atualizarBotao() {
        const senha = senhaInput.value;
        const confirmaSenha = confirmaSenhaInput.value;
        const senhaValida = validarSenhaForte(senha);
        const senhasIguais = senha === confirmaSenha && senha.length > 0;
        
        if (senhaValida && senhasIguais) {
            btnRedefinir.disabled = false;
        } else {
            btnRedefinir.disabled = true;
        }
    }

    // Validar senha ao digitar
    senhaInput.addEventListener('input', function () {
        const senha = this.value;
        validarSenhaForte(senha);

        // Verificar se as senhas coincidem
        const confirmaSenha = confirmaSenhaInput.value;
        if (confirmaSenha && senha !== confirmaSenha) {
            confirmaSenhaInput.style.borderColor = '#dc3545';
        } else {
            confirmaSenhaInput.style.borderColor = '#e0e1e4';
        }

        atualizarBotao();
    });

    // Verificar coincidência de senhas
    confirmaSenhaInput.addEventListener('input', function () {
        const senha = senhaInput.value;
        const confirmaSenha = this.value;

        if (confirmaSenha && senha !== confirmaSenha) {
            this.style.borderColor = '#dc3545';
        } else {
            this.style.borderColor = '#e0e1e4';
        }

        atualizarBotao();
    });

    // Handler do formulário
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const senha = senhaInput.value;
        const confirmaSenha = confirmaSenhaInput.value;

        if (!validarSenhaForte(senha)) {
            showToast('A senha não atende aos requisitos mínimos de segurança.', { type: 'error' });
            return;
        }

        if (senha !== confirmaSenha) {
            showToast('As senhas não coincidem.', { type: 'error' });
            return;
        }

        // Desabilitar botão durante processamento
        btnRedefinir.disabled = true;
        const textoOriginal = btnRedefinir.textContent;
        btnRedefinir.textContent = 'Redefinindo...';

        try {
            let resp;
            
            if (type === 'password-change') {
                // Alteração de senha por código
                const passwordChangeEmail = sessionStorage.getItem('passwordChangeEmail');
                const passwordChangeCode = sessionStorage.getItem('passwordChangeCode');
                
                resp = await changePasswordWithCode(passwordChangeEmail, passwordChangeCode, senha);
                
                // Limpar dados temporários
                sessionStorage.removeItem('passwordChangeEmail');
                sessionStorage.removeItem('passwordChangeCode');
                
                toastFromApiSuccess(resp, 'Senha alterada com sucesso! Redirecionando para o login...');
            } else {
                // Reset de senha por código
                resp = await resetPassword(email, reset_code, senha);
                toastFromApiSuccess(resp, 'Senha redefinida com sucesso! Redirecionando para o login...');
            }
            
            // Redirecionar para login após sucesso
            setTimeout(() => {
                window.location.href = 'login.html';
            }, 2000);
        } catch (err) {
            toastFromApiError(err);
            
            // Reabilitar botão
            btnRedefinir.disabled = false;
            btnRedefinir.textContent = textoOriginal;
            atualizarBotao();
        }
    });

    // Estado inicial do botão
    atualizarBotao();
});
