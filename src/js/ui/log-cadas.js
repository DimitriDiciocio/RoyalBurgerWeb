$(document).ready(function() {

    // --- Funcionalidade 1: Ativar/Desativar Botão "Entrar/Cadastrar" de forma genérica ---
    function configurarAtivacaoBotao($form) {
        const $inputsObrigatorios = $form.find('input[required], select[required], textarea[required]');
        const $botaoAcao = $form.find('button.botao');

        function verificarTodosInputsPreenchidos() {
            let todosPreenchidos = true;
            $inputsObrigatorios.each(function() {
                if ($(this).val().trim() === '') {
                    todosPreenchidos = false;
                    return false; // Sai do loop .each()
                }
            });

            if (todosPreenchidos) {
                $botaoAcao.removeClass('inativo');
            } else {
                $botaoAcao.addClass('inativo');
            }
        }

        // Adiciona o evento 'input' a todos os campos obrigatórios
        $inputsObrigatorios.on('input change', verificarTodosInputsPreenchidos);

        // Chama a função uma vez ao carregar a página para definir o estado inicial do botão
        verificarTodosInputsPreenchidos();
    }

    // Aplica a funcionalidade a todos os formulários com a classe 'quadro-log-cad'
    // (Útil se você tiver mais de um formulário desse tipo na mesma página, embora incomum para login/cadastro)
    $('.quadro-log-cad').each(function() {
        configurarAtivacaoBotao($(this));
    });


    const $form = $('.quadro-log-cad');
    const $senhaInput = $('#senha');
    const $iconeOlho = $form.find('.fa-solid.fa-eye-slash'); // O ícone do olho

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