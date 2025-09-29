// Função universal para abrir modais
function abrirModal(modalId) {
    // Adiciona display: flex antes de fadeIn para permitir centralização
    $('#' + modalId).css('display', 'flex').hide().fadeIn();
}
// Função universal para fechar modais
function fecharModal(modalId) {
    $('#' + modalId).fadeOut();
}
$(document).ready(function() {
    // Fechar a modal ao clicar fora dela
    $(document).on('click', '.modal', function(event) {
        // Certifica-se de que o clique foi no fundo da modal (o overlay), não no conteúdo
        if ($(event.target).is(this)) { // `is(this)` verifica se o target é o próprio elemento .modal
            var modalId = $(this).attr('id');
            fecharModal(modalId);
        }
    });
    // Fechar a modal ao pressionar a tecla ESC
    $(document).on('keydown', function(event) {
        if (event.key === "Escape") {
            $('.modal:visible').each(function() {
                var modalId = $(this).attr('id');
                fecharModal(modalId);
            });
        }
    });
});