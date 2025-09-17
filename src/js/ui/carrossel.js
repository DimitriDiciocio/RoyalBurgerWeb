$(document).ready(function() {
    const carrosselImagens = $('.carrossel .imagens');
    const imagens = $('.carrossel .imagens img');
    const carrosselIndicadores = $('.carrossel .indicadores');

    let indiceImagemAtual = 0;
    const totalImagens = imagens.length;
    let indicadores = [];
    const tempoDeEspera = 30000; // 30 segundos em milissegundos
    let temporizadorCarrossel;

    // Variáveis para a funcionalidade de arrastar
    let estaArrastando = false;
    let posicaoInicialX = 0;
    let transformInicial = 0;
    const limiarArrastar = 50; // Quantos pixels precisa mover para contar como arrasto

    // --- Funções de Ajuda ---

    // Função para atualizar o transform do carrossel
    function aplicarTransform(offset = 0) {
        carrosselImagens.css('transform', `translateX(${offset - indiceImagemAtual * 100}%)`);
    }

    // --- Funções do Carrossel (já existentes) ---

    function criarIndicadores() {
        for (let i = 0; i < totalImagens; i++) {
            const indicador = $('<div></div>')
                .addClass('indicador')
                .attr('data-indice', i);

            indicador.on('click', function() {
                indiceImagemAtual = parseInt($(this).attr('data-indice'));
                mostrarImagem();
                reiniciarTemporizador();
            });

            carrosselIndicadores.append(indicador);
            indicadores.push(indicador[0]);
        }
    }

    function atualizarIndicadores() {
        $(indicadores).each(function(idx, elemento) {
            if (idx === indiceImagemAtual) {
                $(elemento).addClass('ativo');
            } else {
                $(elemento).removeClass('ativo');
            }
        });
    }

    function mostrarImagem() {
        aplicarTransform(0); // Aplica o transform padrão para a imagem atual
        atualizarIndicadores();
    }

    function avancarCarrossel() {
        indiceImagemAtual = (indiceImagemAtual + 1) % totalImagens;
        mostrarImagem();
    }

    // --- Funções de Temporizador (já existentes) ---

    function iniciarTemporizador() {
        pararTemporizador();
        temporizadorCarrossel = setInterval(avancarCarrossel, tempoDeEspera);
    }

    function pararTemporizador() {
        clearInterval(temporizadorCarrossel);
    }

    function reiniciarTemporizador() {
        pararTemporizador();
        iniciarTemporizador();
    }

    // --- Funcionalidade de Arrastar (Nova) ---

    function iniciarArrasto(evento) {
        estaArrastando = true;
        // Pega a posição X inicial (mouse ou primeiro toque)
        posicaoInicialX = evento.pageX || evento.originalEvent.touches[0].pageX;

        // Pega o valor atual do 'transform' para calcular o deslocamento
        const transformAtual = carrosselImagens.css('transform');
        if (transformAtual && transformAtual !== 'none') {
            // Extrai o valor do translateX (ex: matrix(1, 0, 0, 1, -600, 0) -> -600)
            const matrix = transformAtual.match(/-?\d+/g);
            if (matrix && matrix.length >= 5) { // Ensure matrix has enough values
                // O valor translateX é o 5º elemento (índice 4) em uma matriz 2D
                // Precisamos converter de pixels para porcentagem relativa à largura do carrossel
                const larguraCarrossel = carrosselImagens.parent().width();
                transformInicial = (parseFloat(matrix[4]) / larguraCarrossel) * 100;
            } else {
                transformInicial = -indiceImagemAtual * 100; // Fallback se transform for inválido
            }
        } else {
            transformInicial = -indiceImagemAtual * 100;
        }

        // Previne o arrasto padrão da imagem
        evento.preventDefault();
        carrosselImagens.css('cursor', 'grabbing');
    }

    function duranteArrasto(evento) {
        if (!estaArrastando) return;

        // Pega a posição X atual
        const posicaoAtualX = evento.pageX || evento.originalEvent.touches[0].pageX;
        const deltaX = posicaoAtualX - posicaoInicialX; // Deslocamento em pixels

        // Calcula o deslocamento em porcentagem
        const larguraCarrossel = carrosselImagens.parent().width();
        const deslocamentoPercentual = (deltaX / larguraCarrossel) * 100;

        // Aplica o transform temporário enquanto arrasta
        carrosselImagens.css('transform', `translateX(${transformInicial + deslocamentoPercentual}%)`);
    }

    function finalizarArrasto(evento) {
        if (!estaArrastando) return;
        estaArrastando = false;
        carrosselImagens.css('cursor', 'grab');

        const posicaoFinalX = evento.pageX || (evento.originalEvent.changedTouches ? evento.originalEvent.changedTouches[0].pageX : posicaoInicialX);
        const deltaX = posicaoFinalX - posicaoInicialX;

        // Verifica se houve um arrasto significativo
        if (Math.abs(deltaX) > limiarArrastar) {
            if (deltaX > 0) { // Arrastou para a direita (ir para imagem anterior)
                indiceImagemAtual = (indiceImagemAtual - 1 + totalImagens) % totalImagens;
            } else { // Arrastou para a esquerda (ir para próxima imagem)
                indiceImagemAtual = (indiceImagemAtual + 1) % totalImagens;
            }
            reiniciarTemporizador(); // Reinicia o temporizador após o arrasto
        }

        mostrarImagem(); // Garante que o carrossel se ajuste à imagem correta
    }

    // --- Event Listeners para arrastar ---

    // Eventos de Mouse
    carrosselImagens.on('mousedown', iniciarArrasto);
    $(document).on('mousemove', duranteArrasto);
    $(document).on('mouseup', finalizarArrasto);

    // Eventos de Toque (para dispositivos móveis)
    carrosselImagens.on('touchstart', iniciarArrasto);
    $(document).on('touchmove', duranteArrasto);
    $(document).on('touchend', finalizarArrasto);

    // --- Inicialização ---
    criarIndicadores();
    mostrarImagem();
    iniciarTemporizador();
});