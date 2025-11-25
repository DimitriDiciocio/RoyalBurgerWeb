// Gerenciamento da verificação de email usando sistema genérico
import { createEmailVerification } from './code-verification.js';
import { verifyEmailCode, resendVerificationCode, requestEmailVerification, verifyPasswordChangeCode, requestPasswordChangeCode, requestPasswordReset, verifyResetCode } from '../api/user.js';
import { verify2FACode } from '../api/auth.js';
import { showToast } from './alerts.js';
import { claimGuestCart, getCartIdFromStorage } from '../api/cart.js';

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
                try {
                    // Primeiro verifica se o código é válido
                    const resp = await verifyResetCode(email, code);
                    // Se chegou até aqui, o código é válido - redirecionar para página de nova senha
                    showToast(resp.msg || 'Código válido! Redirecionando...', { 
                        type: 'success',
                        autoClose: 2000
                    });
                    setTimeout(() => {
                        window.location.href = `redefinir-senha.html?type=reset&email=${encodeURIComponent(email)}&reset_code=${code}`;
                    }, 1500);
                    return true;
                } catch (err) {
                    // Tratar erros específicos
                    const errorData = err?.payload || {};
                    const errorCode = errorData.error_code;
                    const errorMsg = errorData.error || err?.message || 'Código inválido ou expirado';
                    const suggestion = errorData.suggestion;
                    
                    let toastMessage = errorMsg;
                    if (suggestion) {
                        toastMessage += ` ${suggestion}`;
                    }
                    
                    showToast(toastMessage, { 
                        type: 'error',
                        title: 'Erro na Verificação',
                        autoClose: 5000
                    });
                    return false;
                }
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
                    
                    // Reivindicar carrinho de convidado se existir
                    const guestCartId = getCartIdFromStorage();
                    if (guestCartId) {
                        try {
                            const claimResult = await claimGuestCart();
                            
                            if (claimResult.success) {
                                showToast('Seu carrinho foi restaurado!', { 
                                    type: 'info', 
                                    title: 'Carrinho Restaurado',
                                    autoClose: 2000 
                                });
                            } else {
                                // ALTERAÇÃO: Tratar erros de estoque insuficiente durante recuperação
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
    } else if (type === 'email-change') {
        // Configuração para alteração de email
        config = {
            title: 'Verificar Novo Email',
            description: 'Enviamos um código de 6 dígitos para o seu novo email.',
            showChangeEmailLink: false,
            autoRequest: false, // Não solicitar automaticamente pois já foi solicitado
            onVerify: async (email, code) => {
                // Importar a função de verificação de alteração de email
                const { verifyEmailChange } = await import('../api/user.js');
                return await verifyEmailChange(email, code);
            },
            onResend: async (email) => {
                // Para alteração de email, não há reenvio direto
                showToast('Para reenviar o código, solicite a alteração novamente.', { type: 'info' });
                return false;
            },
            onRequest: async (email) => {
                // Não aplicável para alteração de email
                return false;
            },
            onSuccess: async (result) => {
                showToast('Email alterado com sucesso!', { type: 'success' });
                // Redirecionar para login após sucesso
                setTimeout(() => {
                    window.location.href = 'login.html';
                }, 1500);
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
            changeEmailText: 'Deseja alterar seu e-mail?',
            changeEmailLink: 'Alterar aqui',
            changeEmailUrl: 'javascript:void(0)', // Previne redirecionamento
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

    // ====== Funcionalidade da Modal de Alterar Email ======
    // Forçar exibição do link de alterar email para verificação normal
    if (type !== 'email-change' && type !== 'password-change' && type !== 'password-reset' && type !== '2fa') {
        const changeEmailElement = document.querySelector('.change-email-text');
        if (changeEmailElement) {
            changeEmailElement.style.display = 'block';
            // Garantir que o link tenha o ID correto
            const link = changeEmailElement.querySelector('.change-email-link');
            if (link) {
                link.id = 'btn-alterar-email';
                link.href = 'javascript:void(0)';
            }
        }
    }
    const btnAlterarEmail = document.getElementById('btn-alterar-email');
    const inputNovoEmail = document.getElementById('novo-email');
    const btnConfirmarAlterar = document.getElementById('confirmar-alterar-email');

    // Função para validar email
    function validarEmail(email) {
        const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
        return emailRegex.test(email);
    }

    // Aguardar um pouco para garantir que o link seja configurado
    setTimeout(() => {
        const btnAlterarEmail = document.getElementById('btn-alterar-email');
        
        // Só adicionar event listener se o elemento existir
        if (btnAlterarEmail) {
            // Abrir modal usando função global
            btnAlterarEmail.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                
                // Verificar se a função existe antes de usar
                if (typeof window.abrirModal === 'function') {
                    window.abrirModal('modal-alterar-email');
                    setTimeout(() => inputNovoEmail.focus(), 100);
                } else {
                    // Fallback: mostrar modal manualmente
                    const modal = document.getElementById('modal-alterar-email');
                    if (modal) {
                        modal.style.display = 'flex';
                        setTimeout(() => inputNovoEmail.focus(), 100);
                    }
                }
                return false;
            });
        }
    }, 100);

    // Validação do email em tempo real
    if (inputNovoEmail) {
        inputNovoEmail.addEventListener('input', function() {
            const email = this.value.trim();
            
            if (email && !validarEmail(email)) {
                this.classList.add('invalid');
                this.classList.remove('valid');
            } else if (email && validarEmail(email)) {
                this.classList.remove('invalid');
                this.classList.add('valid');
            } else {
                this.classList.remove('invalid', 'valid');
            }
        });
    }

    // Submissão do formulário
    if (btnConfirmarAlterar) {
        btnConfirmarAlterar.addEventListener('click', async function() {
        const novoEmail = inputNovoEmail.value.trim();
        
        if (!novoEmail) {
            showToast('Por favor, digite o novo email.', { type: 'error' });
            inputNovoEmail.focus();
            return;
        }
        
        if (!validarEmail(novoEmail)) {
            showToast('Por favor, digite um email válido.', { type: 'error' });
            inputNovoEmail.focus();
            return;
        }
        
        // Obter email atual do localStorage
        const { getStoredUser } = await import('../api/api.js');
        const userData = getStoredUser();
        const currentEmail = userData ? userData.email : email;
        
        // Verificar se o novo email é diferente do atual
        if (novoEmail === currentEmail) {
            showToast('O novo email deve ser diferente do atual.', { type: 'error' });
            inputNovoEmail.focus();
            return;
        }
        
        // Desabilitar botão e mostrar loading
        btnConfirmarAlterar.disabled = true;
        btnConfirmarAlterar.textContent = 'Alterando...';
        
        try {
            // Para verificação de email, vamos simplesmente redirecionar com o novo email
            // em vez de tentar alterar no banco (que ainda não existe)
            
            // Atualizar localStorage com o novo email se houver dados do usuário
            if (userData) {
                const updatedUserData = { ...userData, email: novoEmail };
                localStorage.setItem('rb.user', JSON.stringify(updatedUserData));
            }
            
            showToast('Redirecionando para verificação do novo email...', { 
                type: 'success',
                title: 'Email atualizado'
            });
            
            // Fechar modal usando função global
            window.fecharModal('modal-alterar-email');
            
            // Redirecionar para verificação com o novo email
            setTimeout(() => {
                window.location.href = `verificar-email.html?email=${encodeURIComponent(novoEmail)}&type=email`;
            }, 1500);
        } catch (error) {
            console.error('Erro ao alterar email:', error);
            showToast('Erro ao alterar email. Tente novamente.', { type: 'error' });
        } finally {
            // Reabilitar botão
            btnConfirmarAlterar.disabled = false;
            btnConfirmarAlterar.textContent = 'Alterar Email';
        }
        });
    }
});
