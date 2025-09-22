$(document).ready(function(){

    // mostra "dados da conta" ao entrar
    $("#dados-user").show();
    $("#enderecos, #config").hide();

    // já marca "Dados da conta" como selecionado
    $(".navega div:contains('Dados da conta')").addClass("select");

    // clique nos botões
    $(".navega div").click(function(){

        let texto = $(this).find("p").text().trim();

        // remove a classe de todos e adiciona só no clicado
        $(".navega div").removeClass("select");
        $(this).addClass("select");

        // esconde tudo
        $("#dados-user, #enderecos, #config").hide();

        // verifica qual botão foi clicado
        if(texto === "Dados da conta"){
            $("#dados-user").show();
        }
        else if(texto === "Endereços"){
            $("#enderecos").show();
        }
        else if(texto === "Configurações"){
            $("#config").show();
        }
    });
});