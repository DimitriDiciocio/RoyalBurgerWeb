// painel-adm.js

console.log('Arquivo JavaScript (painel.js) carregado com sucesso - Usando Event Listeners e Persistência de Seção.');

// --- Chave para armazenar a seção ativa no localStorage ---
const ACTIVE_SECTION_STORAGE_KEY = 'activePanelSection';

// --- Função para mostrar/esconder seções ---
function mostrarSecao(idSecao) {
    // 1. Esconde todas as seções de conteúdo
    const todasSecoes = document.querySelectorAll('section[id^="secao-"]');
    todasSecoes.forEach(secao => {
        secao.style.display = 'none';
    });

    // 2. Mostra a seção desejada
    const secaoAtual = document.getElementById(idSecao);
    if (secaoAtual) {
        secaoAtual.style.display = 'flex'; // ou 'block', dependendo do seu CSS
    }

    // 3. Remove a classe 'select' de todos os itens de navegação
    const todosItensNavegacao = document.querySelectorAll('.navegacao div');
    todosItensNavegacao.forEach(item => {
        item.classList.remove('select');
    });

    // 4. Adiciona a classe 'select' ao item de navegação correspondente
    const idNavCorrespondente = 'nav-' + idSecao;
    const itemNavSelecionado = document.getElementById(idNavCorrespondente);
    if (itemNavSelecionado) {
        itemNavSelecionado.classList.add('select');
    }

    // 5. Salva o ID da seção ativa no localStorage (NOVA FUNCIONALIDADE)
    localStorage.setItem(ACTIVE_SECTION_STORAGE_KEY, idSecao);
}


// --- Lógica de inicialização e adição de Event Listeners ---
document.addEventListener('DOMContentLoaded', () => {
    // 1. Adicionar Event Listeners para cada item de navegação
    const itensNavegacao = document.querySelectorAll('.navegacao div');
    itensNavegacao.forEach(item => {
        item.addEventListener('click', () => {
            const idNav = item.id;
            const idSecao = idNav.replace('nav-', 'secao-');
            mostrarSecao(idSecao);
        });
    });

    // 2. Lógica para definir a seção inicial na carga da página (AGORA COM localStorage)
    let secaoParaMostrar = 'secao-dashboard'; // Padrão se nada for encontrado

    // Primeiro, verifica se há algo salvo no localStorage
    const ultimaSecaoAtiva = localStorage.getItem(ACTIVE_SECTION_STORAGE_KEY);
    if (ultimaSecaoAtiva) {
        // Verifica se a seção salva no localStorage realmente existe no HTML
        if (document.getElementById(ultimaSecaoAtiva)) {
            secaoParaMostrar = ultimaSecaoAtiva;
        } else {
            // Se a seção salva não existe mais, limpa o localStorage e usa o padrão
            localStorage.removeItem(ACTIVE_SECTION_STORAGE_KEY);
            console.warn(`Seção "${ultimaSecaoAtiva}" salva no localStorage não encontrada. Revertendo para o padrão.`);
        }
    } else {
        // Se não houver nada no localStorage, verifica se há uma seleção inicial no HTML
        const itemInicialSelecionadoHTML = document.querySelector('.navegacao div.select');
        if (itemInicialSelecionadoHTML) {
            const idNav = itemInicialSelecionadoHTML.id;
            secaoParaMostrar = idNav.replace('nav-', 'secao-');
        }
    }

    // Finalmente, mostra a seção determinada
    mostrarSecao(secaoParaMostrar);
});