// Importar a função utilitária
import { gerenciarEstadoInputs, inicializarGerenciamentoInputs } from '../utils.js';
import { loginWithEmailAndPassword } from '../api/auth.js';
import { registerCustomer } from '../api/user.js';

// Aguardar o DOM estar pronto
document.addEventListener('DOMContentLoaded', function() {
    // --- Inicializar gerenciamento de inputs ---
    inicializarGerenciamentoInputs();

    // --- Funcionalidade 1: Ativar/Desativar Botão "Entrar/Cadastrar" de forma genérica ---
    function configurarAtivacaoBotao(form) {
        const inputsObrigatorios = form.querySelectorAll('input[required], select[required], textarea[required]');
        const botaoAcao = form.querySelector('button.btn-acao');

        function verificarTodosInputsPreenchidos() {
            let todosPreenchidos = true;
            
            // Verificar se todos os campos obrigatórios estão preenchidos
            inputsObrigatorios.forEach(input => {
                if (input.value.trim() === '') {
                    todosPreenchidos = false;
                }
            });

            // Verificação adicional para cadastro - senhas devem coincidir
            const senha = document.getElementById('senha');
            const confirmaSenha = document.getElementById('confirma-senha');
            if (senha && confirmaSenha) {
                if (senha.value !== confirmaSenha.value || senha.value.trim() === '' || confirmaSenha.value.trim() === '') {
                    todosPreenchidos = false;
                }
            }

            // Atualizar estado do botão
            if (todosPreenchidos) {
                botaoAcao.classList.remove('inativo');
                botaoAcao.disabled = false;
            } else {
                botaoAcao.classList.add('inativo');
                botaoAcao.disabled = true;
            }
        }

        // Adiciona o evento 'input' a todos os campos obrigatórios
        inputsObrigatorios.forEach(input => {
            input.addEventListener('input', verificarTodosInputsPreenchidos);
            input.addEventListener('change', verificarTodosInputsPreenchidos);
        });

        // Chama a função uma vez ao carregar a página para definir o estado inicial do botão
        verificarTodosInputsPreenchidos();
    }

    // Aplica a funcionalidade a todos os formulários com a classe 'form-login'
    document.querySelectorAll('.form-login').forEach(form => {
        configurarAtivacaoBotao(form);
    });

    // --- 2. Alternar Visibilidade da Senha ---
    function configurarToggleSenha(input, mostrar, ocultar) {
        mostrar.addEventListener('click', function() {
            input.type = 'text';
            mostrar.style.display = 'none';
            ocultar.style.display = 'flex';
        });

        ocultar.addEventListener('click', function() {
            input.type = 'password';
            mostrar.style.display = 'flex';
            ocultar.style.display = 'none';
        });
    }

    // Configurar toggle para senha principal
    const senhaInput = document.getElementById('senha');
    const mostrarSenha = document.getElementById('mostrarSenha');
    const ocultarSenha = document.getElementById('ocultarSenha');
    
    if (senhaInput && mostrarSenha && ocultarSenha) {
        configurarToggleSenha(senhaInput, mostrarSenha, ocultarSenha);
    }

    // Configurar toggle para confirmar senha
    const confirmaSenhaInput = document.getElementById('confirma-senha');
    const mostrarConfirmaSenha = document.getElementById('mostrarConfirmaSenha');
    const ocultarConfirmaSenha = document.getElementById('ocultarConfirmaSenha');
    
    if (confirmaSenhaInput && mostrarConfirmaSenha && ocultarConfirmaSenha) {
        configurarToggleSenha(confirmaSenhaInput, mostrarConfirmaSenha, ocultarConfirmaSenha);
    }

    // --- 3. Validação Visual da Senha Forte ---
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

    // Função para revalidar botões quando senhas mudarem
    function revalidarBotoes() {
        document.querySelectorAll('.form-login').forEach(form => {
            const botaoAcao = form.querySelector('button.btn-acao');
            if (botaoAcao) {
                const inputsObrigatorios = form.querySelectorAll('input[required], select[required], textarea[required]');
                let todosPreenchidos = true;
                
                inputsObrigatorios.forEach(input => {
                    if (input.value.trim() === '') {
                        todosPreenchidos = false;
                    }
                });

                // Verificação adicional para cadastro - senhas devem coincidir
                const senha = document.getElementById('senha');
                const confirmaSenha = document.getElementById('confirma-senha');
                if (senha && confirmaSenha) {
                    if (senha.value !== confirmaSenha.value || senha.value.trim() === '' || confirmaSenha.value.trim() === '') {
                        todosPreenchidos = false;
                    }
                }

                if (todosPreenchidos) {
                    botaoAcao.classList.remove('inativo');
                    botaoAcao.disabled = false;
                } else {
                    botaoAcao.classList.add('inativo');
                    botaoAcao.disabled = true;
                }
            }
        });
    }

    // Aplicar validação quando a senha for digitada
    if (senhaInput) {
        senhaInput.addEventListener('input', function() {
            const senha = this.value;
            validarSenhaForte(senha);
            
            // Verificar se as senhas coincidem
            const confirmaSenha = document.getElementById('confirma-senha');
            if (confirmaSenha) {
                const confirmaSenhaValue = confirmaSenha.value;
                if (confirmaSenhaValue && senha !== confirmaSenhaValue) {
                    confirmaSenha.style.borderColor = '#dc3545';
                } else {
                    confirmaSenha.style.borderColor = '#e0e1e4';
                }
            }
            
            // Revalidar botões
            revalidarBotoes();
        });
    }

    // Verificar coincidência de senhas
    if (confirmaSenhaInput) {
        confirmaSenhaInput.addEventListener('input', function() {
            const senha = document.getElementById('senha')?.value || '';
            const confirmaSenha = this.value;
            
            if (confirmaSenha && senha !== confirmaSenha) {
                this.style.borderColor = '#dc3545';
            } else {
                this.style.borderColor = '#e0e1e4';
            }
            
            // Revalidar botões
            revalidarBotoes();
        });
    }

    // --- 4. Máscara para telefone ---
    const telefoneInput = document.getElementById('telefone');
    if (telefoneInput) {
        telefoneInput.addEventListener('input', function() {
            let value = this.value.replace(/\D/g, '');
            if (value.length >= 11) {
                value = value.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
            } else if (value.length >= 7) {
                value = value.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3');
            } else if (value.length >= 3) {
                value = value.replace(/(\d{2})(\d{0,5})/, '($1) $2');
            }
            this.value = value;
        });
    }

    // --- 5. Animações dos labels são gerenciadas pela função utilitária ---
    
    // --- 6. Integração com API: Login e Cadastro ---
    function normalizarTelefone(valor) {
        return (valor || '').replace(/\D/g, '');
    }

    function exibirMensagem(msg, tipo = 'erro') {
        // Tenta usar um container padronizado, senão alerta
        let container = document.querySelector('.mensagens-container');
        if (!container) {
            alert(msg);
            return;
        }
        const div = document.createElement('div');
        div.className = `mensagem ${tipo}`;
        div.textContent = msg;
        container.appendChild(div);
        setTimeout(() => div.remove(), 5000);
    }

    const form = document.querySelector('form.form-login');
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            const nome = document.getElementById('nome')?.value?.trim();
            const email = document.getElementById('email')?.value?.trim();
            const senha = document.getElementById('senha')?.value || '';
            const confirma = document.getElementById('confirma-senha')?.value || '';
            const nascimento = document.getElementById('nascimento')?.value?.trim();
            const telefone = normalizarTelefone(document.getElementById('telefone')?.value || '');

            const isCadastro = Boolean(nome || nascimento || telefone || document.getElementById('confirma-senha'));

            try {
                if (isCadastro) {
                    // Cadastro
                    const payload = {
                        full_name: nome,
                        email,
                        password: senha,
                        password_confirmation: confirma,
                        date_of_birth: nascimento,
                        phone: telefone
                    };
                    const resp = await registerCustomer(payload);
                    exibirMensagem(resp?.message || 'Conta criada com sucesso!', 'sucesso');
                    // Redireciona para login
                    setTimeout(() => {
                        window.location.href = 'login.html';
                    }, 800);
                } else {
                    // Login
                    if (!email || !senha) return;
                    const resp = await loginWithEmailAndPassword({ email, password: senha });
                    const userResp = resp?.user || null;
                    const nomeUsuario = userResp?.full_name || userResp?.name || '';
                    exibirMensagem(`Bem-vindo${nomeUsuario ? ', ' + nomeUsuario : ''}!`, 'sucesso');
                    // Atualiza header imediatamente com dados do usuário (fallback para e-mail quando não vier user)
                    try {
                        const fallbackUser = userResp || { email };
                        window.applyLoggedHeader && window.applyLoggedHeader(fallbackUser);
                    } catch (_e) {}
                    setTimeout(() => {
                        window.location.href = '../../index.html';
                    }, 600);
                }
            } catch (err) {
                const msg = err?.payload?.error || err?.message || 'Ocorreu um erro.';
                exibirMensagem(msg, 'erro');
            }
        });
    }
});