/**
 * Arquivo de teste para verificar a integração dos CRUDs de categorias e produtos
 * Este arquivo pode ser executado no console do navegador para testar as funcionalidades
 */

// Função para testar a integração completa
async function testarIntegracaoCategorias() {
    console.log('🧪 Iniciando testes de integração...');
    
    try {
        // Teste 1: Listar categorias
        console.log('📋 Teste 1: Listando categorias...');
        const categorias = await getCategories();
        console.log('✅ Categorias carregadas:', categorias);
        
        // Teste 2: Criar categoria de teste
        console.log('➕ Teste 2: Criando categoria de teste...');
        const novaCategoria = await createCategory({ name: 'Categoria Teste' });
        console.log('✅ Categoria criada:', novaCategoria);
        
        // Teste 3: Buscar categoria por ID
        console.log('🔍 Teste 3: Buscando categoria por ID...');
        const categoriaEncontrada = await getCategoryById(novaCategoria.id);
        console.log('✅ Categoria encontrada:', categoriaEncontrada);
        
        // Teste 4: Atualizar categoria
        console.log('✏️ Teste 4: Atualizando categoria...');
        const categoriaAtualizada = await updateCategory(novaCategoria.id, { name: 'Categoria Teste Atualizada' });
        console.log('✅ Categoria atualizada:', categoriaAtualizada);
        
        // Teste 5: Listar produtos
        console.log('📦 Teste 5: Listando produtos...');
        const produtos = await getProducts();
        console.log('✅ Produtos carregados:', produtos);
        
        // Teste 6: Criar produto de teste
        console.log('🍔 Teste 6: Criando produto de teste...');
        const novoProduto = await createProduct({
            name: 'Produto Teste',
            description: 'Descrição do produto teste',
            price: 15.90,
            cost_price: 8.50,
            preparation_time_minutes: 10,
            category_id: novaCategoria.id
        });
        console.log('✅ Produto criado:', novoProduto);
        
        // Teste 7: Buscar produtos da categoria
        console.log('🔍 Teste 7: Buscando produtos da categoria...');
        const produtosCategoria = await getProducts({ category_id: novaCategoria.id });
        console.log('✅ Produtos da categoria:', produtosCategoria);
        
        // Teste 8: Atualizar produto
        console.log('✏️ Teste 8: Atualizando produto...');
        const produtoAtualizado = await updateProduct(novoProduto.id, { 
            name: 'Produto Teste Atualizado',
            price: 18.90 
        });
        console.log('✅ Produto atualizado:', produtoAtualizado);
        
        // Teste 9: Excluir produto
        console.log('🗑️ Teste 9: Excluindo produto...');
        await deleteProduct(novoProduto.id);
        console.log('✅ Produto excluído');
        
        // Teste 10: Excluir categoria
        console.log('🗑️ Teste 10: Excluindo categoria...');
        await deleteCategory(novaCategoria.id);
        console.log('✅ Categoria excluída');
        
        console.log('🎉 Todos os testes passaram com sucesso!');
        
    } catch (error) {
        console.error('❌ Erro durante os testes:', error);
        console.error('Detalhes do erro:', error.message);
    }
}

// Função para testar o gerenciador de categorias do painel
async function testarGerenciadorCategorias() {
    console.log('🧪 Testando gerenciador de categorias do painel...');
    
    try {
        // Verificar se o gerenciador existe
        if (typeof window.categoriaManager === 'undefined') {
            console.log('⚠️ Gerenciador de categorias não encontrado. Inicializando...');
            window.categoriaManager = new CategoriaManager();
            window.categoriaManager.init();
        }
        
        // Teste 1: Carregar categorias
        console.log('📋 Teste 1: Carregando categorias...');
        const categorias = await window.categoriaManager.categoriaDataManager.getAllCategorias();
        console.log('✅ Categorias carregadas:', categorias);
        
        // Teste 2: Abrir modal de categorias
        console.log('🪟 Teste 2: Abrindo modal de categorias...');
        await window.categoriaManager.openCategoriasModal();
        console.log('✅ Modal de categorias aberto');
        
        // Aguardar um pouco para visualizar
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Fechar modal
        window.categoriaManager.closeCategoriasModal();
        console.log('✅ Modal fechado');
        
        console.log('🎉 Testes do gerenciador concluídos!');
        
    } catch (error) {
        console.error('❌ Erro durante os testes do gerenciador:', error);
    }
}

// Função para verificar se as APIs estão funcionando
async function verificarAPIs() {
    console.log('🔍 Verificando se as APIs estão funcionando...');
    
    try {
        // Verificar se as funções estão disponíveis
        const funcoes = [
            'getCategories', 'createCategory', 'getCategoryById', 'updateCategory', 'deleteCategory',
            'getProducts', 'getProductById', 'createProduct', 'updateProduct', 'deleteProduct'
        ];
        
        for (const funcao of funcoes) {
            if (typeof window[funcao] === 'undefined') {
                console.error(`❌ Função ${funcao} não encontrada`);
                return false;
            }
        }
        
        console.log('✅ Todas as funções da API estão disponíveis');
        
        // Testar conexão com o backend
        console.log('🌐 Testando conexão com o backend...');
        const categorias = await getCategories({ page_size: 1 });
        console.log('✅ Conexão com backend funcionando');
        
        return true;
        
    } catch (error) {
        console.error('❌ Erro ao verificar APIs:', error);
        return false;
    }
}

// Função principal para executar todos os testes
async function executarTodosOsTestes() {
    console.log('🚀 Iniciando todos os testes de integração...');
    
    // Verificar APIs primeiro
    const apisOk = await verificarAPIs();
    if (!apisOk) {
        console.error('❌ APIs não estão funcionando. Abortando testes.');
        return;
    }
    
    // Executar testes de integração
    await testarIntegracaoCategorias();
    
    // Executar testes do gerenciador
    await testarGerenciadorCategorias();
    
    console.log('🏁 Todos os testes concluídos!');
}

// Exportar funções para uso no console
window.testarIntegracaoCategorias = testarIntegracaoCategorias;
window.testarGerenciadorCategorias = testarGerenciadorCategorias;
window.verificarAPIs = verificarAPIs;
window.executarTodosOsTestes = executarTodosOsTestes;

console.log('📚 Funções de teste carregadas!');
console.log('💡 Use executarTodosOsTestes() para executar todos os testes');
console.log('💡 Use verificarAPIs() para verificar se as APIs estão funcionando');
console.log('💡 Use testarIntegracaoCategorias() para testar as operações CRUD');
console.log('💡 Use testarGerenciadorCategorias() para testar o gerenciador do painel');
