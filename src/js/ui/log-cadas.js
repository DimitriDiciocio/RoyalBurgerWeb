$(document).ready(function() {
    const $form = $('.quadro-log-cad');
    const $emailInput = $('#email');
    const $senhaInput = $('#senha');
    const $botaoEntrar = $form.find('button.botao'); // Seleciona o botão dentro do formulário
    const $iconeOlho = $form.find('.fa-solid.fa-eye-slash'); // O ícone do olho

    // --- 1. Ativar/Desativar Botão "Entrar" ---

    // Função para verificar se todos os inputs obrigatórios estão preenchidos
    function verificarInputsPreenchidos() {
        const emailPreenchido = $emailInput.val().trim() !== '';
        const senhaPreenchida = $senhaInput.val().trim() !== '';

        if (emailPreenchido && senhaPreenchida) {
            $botaoEntrar.removeClass('inativo');
        } else {
            $botaoEntrar.addClass('inativo');
        }
    }

    // Adiciona o evento 'input' para verificar o preenchimento em tempo real
    $emailInput.on('input', verificarInputsPreenchidos);
    $senhaInput.on('input', verificarInputsPreenchidos);

    // Chama a função uma vez ao carregar a página para definir o estado inicial do botão
    verificarInputsPreenchidos();

    // --- 2. Alternar Visibilidade da Senha ---

    $iconeOlho.on('click', function() {
        // Verifica o tipo atual do input de senha
        const tipoAtual = $senhaInput.attr('type');

        if (tipoAtual === 'password') {
            // Se for 'password', muda para 'text' (visível)
            $senhaInput.attr('type', 'text');
            // Altera o ícone de olho fechado para olho aberto
            $(this).removeClass('fa-eye-slash').addClass('fa-eye');
        } else {
            // Se for 'text', muda para 'password' (escondida)
            $senhaInput.attr('type', 'password');
            // Altera o ícone de olho aberto para olho fechado
            $(this).removeClass('fa-eye').addClass('fa-eye-slash');
        }
    });
});