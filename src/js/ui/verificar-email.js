// Gerenciamento da verificação de email usando sistema genérico
import { createEmailVerification } from './code-verification.js';
import { verifyEmailCode, resendVerificationCode, requestEmailVerification, verifyPasswordChangeCode, requestPasswordChangeCode, requestPasswordReset } from '../api/user.js';
import { verify2FACode } from '../api/auth.js';
import { showToast } from './alerts.js';

document.addEventListener('DOMContentLoaded', async function () {
    // Verificar se há email na query string
    const urlParams = new URLSearchParams(window.location.search);
    const email = urlParams.get('email');
    const type = urlParams.get('type'); // 'email', 'password-change', 'password-reset' ou '2fa'
    const userId = urlParams.get('user_id'); // Para 2FA

    // Se não houver email, redireciona para cadastro
    if (!email) {
        showToast('Email não fornecido. Faça o cadastro primeiro.', { type: 'error' });
        setTimeout(() => {
            window.location.href = 'cadastro.html';
        }, 1500);
        return;
    }

    // Configuração baseada no tipo de verificação
    let config = {};

    if (type === 'password-change') {
        // Configuração para alteração de senha
        config = {
            title: 'Alterar Senha',
            description: 'Enviamos um código de 6 dígitos para confirmar a alteração da sua senha.',
            showChangeEmailLink: false,
            onVerify: async (email, code) => {
                const result = await verifyPasswordChangeCode(email, code);
                
                // Se a verificação for bem-sucedida, redirecionar para página de nova senha
                if (result) {
                    // Armazenar email e código temporariamente para a próxima etapa
                    sessionStorage.setItem('passwordChangeEmail', email);
                    sessionStorage.setItem('passwordChangeCode', code);
                    
                    // Redirecionar para página de nova senha
                    window.location.href = `redefinir-senha.html?type=password-change&email=${encodeURIComponent(email)}`;
                }
                
                return result;
            },
            onResend: async (email) => {
                return await requestPasswordChangeCode(email);
            },
            onRequest: async (email) => {
                return await requestPasswordChangeCode(email);
            },
            onSuccess: async (result) => {
                // O redirecionamento já é feito no onVerify
            },
            onError: async (err) => {
                showToast('Código inválido. Tente novamente.', { type: 'error' });
            }
        };
    } else if (type === 'password-reset') {
        // Configuração para reset de senha
        config = {
            title: 'Recuperar Senha',
            description: 'Enviamos um código de 6 dígitos para recuperar sua senha.',
            showChangeEmailLink: false,
            autoRequest: false, // Não solicitar automaticamente pois já foi solicitado
            onVerify: async (email, code) => {
                // Para reset de senha, redirecionar diretamente para página de nova senha
                window.location.href = `redefinir-senha.html?type=reset&email=${encodeURIComponent(email)}&reset_code=${code}`;
                return true;
            },
            onResend: async (email) => {
                return await requestPasswordReset(email);
            },
            onRequest: async (email) => {
                return await requestPasswordReset(email);
            },
            onSuccess: async (result) => {
                // O redirecionamento já é feito no onVerify
            },
            onError: async (err) => {
                showToast('Código inválido. Tente novamente.', { type: 'error' });
            }
        };
    } else if (type === '2fa') {
        // Configuração para verificação 2FA
        config = {
            title: 'Verificação em Duas Etapas',
            description: 'Enviamos um código de 6 dígitos para confirmar seu login.',
            showChangeEmailLink: false,
            autoRequest: false, // Não solicitar automaticamente pois já foi solicitado no login
            onVerify: async (email, code) => {
                if (!userId) {
                    showToast('Erro: ID do usuário não encontrado.', { type: 'error' });
                    return false;
                }
                
                const result = await verify2FACode(userId, code);
                
                if (result && result.access_token) {
                    const userResp = result?.user || null;
                    const nomeUsuario = userResp?.full_name || userResp?.name || '';
                    
                    showToast(`Bem-vindo${nomeUsuario ? ', ' + nomeUsuario : ''}!`, { 
                        type: 'success', 
                        title: 'Login realizado com sucesso' 
                    });
                    
                    // Atualiza header imediatamente
                    try {
                        const fallbackUser = userResp || { email };
                        window.applyLoggedHeader && window.applyLoggedHeader(fallbackUser);
                    } catch (_e) { }
                    
                    // Redirecionar para página inicial
                    setTimeout(() => {
                        window.location.href = '../../index.html';
                    }, 1200);
                    
                    return true;
                }
                
                return false;
            },
            onResend: async (email) => {
                // Para 2FA, não há reenvio direto - o usuário precisa fazer login novamente
                showToast('Para reenviar o código, faça login novamente.', { type: 'info' });
                setTimeout(() => {
                    window.location.href = 'login.html';
                }, 2000);
                return false;
            },
            onRequest: async (email) => {
                // Não aplicável para 2FA
                return false;
            },
            onSuccess: async (result) => {
                // O redirecionamento já é feito no onVerify
            },
            onError: async (err) => {
                showToast('Código inválido ou expirado. Tente novamente.', { type: 'error' });
            }
        };
    } else {
        // Configuração padrão para verificação de email
        config = {
            title: 'Verifique seu E-mail',
            description: 'Enviamos um código de 6 dígitos para o seu email cadastrado.',
            showChangeEmailLink: true,
            onVerify: async (email, code) => {
                return await verifyEmailCode(email, code);
            },
            onResend: async (email) => {
                return await resendVerificationCode(email);
            },
            onRequest: async (email) => {
                return await requestEmailVerification(email);
            },
            onSuccess: async (result) => {
                showToast('Email verificado com sucesso!', { type: 'success' });
                // Redirecionar para login após sucesso
                setTimeout(() => {
                    window.location.href = 'login.html';
                }, 1500);
            },
            onError: async (err) => {
                showToast('Código inválido. Tente novamente.', { type: 'error' });
            }
        };
    }

    // Criar instância de verificação
    const verification = createEmailVerification(config);

    // Inicializar verificação
    verification.init();
});
