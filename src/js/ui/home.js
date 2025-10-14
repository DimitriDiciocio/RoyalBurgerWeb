/**
 * Home.js - Gerenciamento da exibição de produtos na página inicial
 * Carrega produtos e categorias da API e exibe dinamicamente na home
 */

// Cache para produtos e categorias
let productsCache = null;
let categoriesCache = null;

/**
 * Carrega todos os produtos da API
 */
async function loadProducts() {
    try {
        if (productsCache) {
            return productsCache;
        }
        
        const response = await getProducts({ 
            page_size: 1000, 
            include_inactive: false 
        });
        
        productsCache = response.items || [];
        return productsCache;
    } catch (error) {
        console.error('Erro ao carregar produtos:', error);
        return [];
    }
}

/**
 * Carrega todas as categorias da API
 */
async function loadCategories() {
    try {
        if (categoriesCache) {
            return categoriesCache;
        }
        
        const response = await getCategories({ page_size: 100 });
        categoriesCache = response.items || [];
        return categoriesCache;
    } catch (error) {
        console.error('Erro ao carregar categorias:', error);
        return [];
    }
}


/**
 * Constrói URL correta para imagem do produto (mesma lógica do painel admin)
 */
function buildImageUrl(imagePath) {
    if (!imagePath) return 'src/assets/img/tudo.jpeg';
    
    // Se já é uma URL completa, usar diretamente
    if (imagePath.startsWith('http')) {
        return imagePath;
    }
    
    // Base URL do servidor Flask (porta 5000)
    const baseUrl = 'http://127.0.0.1:5000';
    
    // Se é um caminho do backend (/api/uploads/products/ID.jpeg)
    if (imagePath.startsWith('/api/uploads/products/')) {
        return `${baseUrl}${imagePath}`;
    }
    
    // Se é um caminho antigo (/uploads/products/ID.jpeg)
    if (imagePath.startsWith('/uploads/products/')) {
        return `${baseUrl}${imagePath.replace('/uploads/', '/api/uploads/')}`;
    }
    
    // Se é apenas o nome do arquivo (ID.jpeg)
    if (imagePath.match(/^\d+\.jpeg$/)) {
        return `${baseUrl}/api/uploads/products/${imagePath}`;
    }
    
    // Fallback: assumir que é um caminho relativo
    return `${baseUrl}/api/uploads/products/${imagePath}`;
}

/**
 * Cria o HTML de um produto (mantendo formatação original)
 */
function createProductHTML(product) {
    const imageUrl = buildImageUrl(product.image_url);
    const price = product.price ? `R$ ${parseFloat(product.price).toFixed(2).replace('.', ',')}` : 'R$ 0,00';
    const prepTime = product.preparation_time_minutes ? `${product.preparation_time_minutes} - ${product.preparation_time_minutes + 10} min` : '40 - 50 min';
    const deliveryFee = 'R$ 5,00';
    
    return `
        <a href="src/pages/produto.html?id=${product.id}">
            <div id="ficha-produto">
                <img src="${imageUrl}" alt="${product.name}" id="foto">
                <div class="informa">
                    <div>
                        <p id="nome">${product.name}</p>
                        <p id="descricao">${product.description || 'Descrição rápida...'}</p>
                    </div>
                    <div>
                        <p id="preco">${price}</p>
                        <p id="tempo">${prepTime} • ${deliveryFee}</p>
                    </div>
                </div>
            </div>
        </a>
    `;
}


/**
 * Atualiza as seções de produtos na home (versão simplificada)
 */
async function updateProductSections() {
    try {
        const [products, categories] = await Promise.all([
            loadProducts(),
            loadCategories()
        ]);
        
        // Atualizar seção "Os mais pedidos" com produtos reais
        updateMostOrderedSection(products);
        
        // Atualizar seções de categorias com produtos organizados por categoria
        updateCategorySectionsWithProducts(products, categories);
        
        // Atualizar menu de categorias com categorias reais
        updateCategoryMenu(categories);
        
    } catch (error) {
        console.error('Erro ao atualizar seções de produtos:', error);
    }
}

/**
 * Atualiza as seções de categorias com produtos organizados por categoria
 */
function updateCategorySectionsWithProducts(products, categories) {
    const rolagemInfinita = document.querySelector('.rolagem-infinita');
    
    if (!rolagemInfinita) return;
    
    // Limpar conteúdo existente
    rolagemInfinita.innerHTML = '';
    
    // Agrupar produtos por categoria
    const groupedProducts = groupProductsByCategory(products, categories);
    
    // Criar seções para cada categoria que tem produtos
    let categoryIndex = 0;
    categories.forEach(category => {
        const categoryProducts = groupedProducts[category.id] || [];
        
        if (categoryProducts.length > 0) {
            const sectionId = `secao-cat-${categoryIndex + 1}`;
            
            // Criar produtos em pares (duplas) como antes
            let productsHTML = '';
            for (let i = 0; i < categoryProducts.length; i += 2) {
                productsHTML += '<div class="dupla">';
                
                // Primeiro produto do par
                if (categoryProducts[i]) {
                    productsHTML += createProductHTML(categoryProducts[i]);
                }
                
                // Segundo produto do par
                if (categoryProducts[i + 1]) {
                    productsHTML += createProductHTML(categoryProducts[i + 1]);
                }
                
                productsHTML += '</div>';
            }
            
            rolagemInfinita.innerHTML += `
                <div id="${sectionId}" style="display: ${categoryIndex === 0 ? 'block' : 'none'}">
                    ${productsHTML}
                </div>
            `;
            
            categoryIndex++;
        }
    });
}

/**
 * Agrupa produtos por categoria
 */
function groupProductsByCategory(products, categories) {
    const grouped = {};
    
    // Inicializar grupos com categorias existentes
    categories.forEach(category => {
        grouped[category.id] = [];
    });
    
    // Agrupar produtos por categoria
    products.forEach(product => {
        if (grouped[product.category_id]) {
            grouped[product.category_id].push(product);
        }
    });
    
    return grouped;
}

/**
 * Atualiza a seção "Os mais pedidos" (mantendo formatação original)
 */
function updateMostOrderedSection(products) {
    const containers = document.querySelectorAll('.mostruario-horizontal .container .rolagem');
    
    // Atualizar todos os containers com os mesmos produtos (como estava antes)
    containers.forEach(container => {
        if (products.length > 0) {
            container.innerHTML = products.slice(0, 6).map(product => createProductHTML(product)).join('');
        }
    });
}


/**
 * Atualiza o menu de categorias com apenas as categorias que existem
 */
function updateCategoryMenu(categories) {
    const categoryMenu = document.querySelector('.categoias');
    
    if (!categoryMenu) return;
    
    // Manter o ícone de menu
    const menuIcon = categoryMenu.querySelector('i');
    let menuHTML = menuIcon ? menuIcon.outerHTML : '';
    
    // Adicionar apenas as categorias que existem na API
    if (categories && categories.length > 0) {
        categories.forEach((category, index) => {
            const categoryId = `categoria${index + 1}`;
            const isSelected = index === 0 ? 'selecionado' : '';
            menuHTML += `<p class="${isSelected}" id="${categoryId}">${category.name}</p>`;
        });
    } else {
        // Fallback: se não houver categorias, mostrar as originais
        const originalCategories = [
            'Mais vendidos',
            'Classicos', 
            'Combos Royal',
            'Vegetarianos',
            'Veganos',
            'Porções',
            'Complementos',
            'Bebidas',
            'Sobremesas'
        ];
        
        originalCategories.forEach((categoryName, index) => {
            const categoryId = `categoria${index + 1}`;
            const isSelected = index === 0 ? 'selecionado' : '';
            menuHTML += `<p class="${isSelected}" id="${categoryId}">${categoryName}</p>`;
        });
    }
    
    categoryMenu.innerHTML = menuHTML;
    
    // Adicionar event listeners para troca de categoria
    addCategoryListeners();
}

/**
 * Adiciona event listeners para troca de categorias
 */
function addCategoryListeners() {
    const categoryItems = document.querySelectorAll('.categoias p[id^="categoria"]');
    const sections = document.querySelectorAll('.rolagem-infinita > div[id^="secao-cat-"]');
    
    categoryItems.forEach((item, index) => {
        item.addEventListener('click', () => {
            // Remover classe selecionado de todos
            categoryItems.forEach(cat => cat.classList.remove('selecionado'));
            
            // Adicionar classe selecionado ao item clicado
            item.classList.add('selecionado');
            
            // Mostrar seção correspondente
            sections.forEach((section, sectionIndex) => {
                if (sectionIndex === index) {
                    section.style.display = 'block';
                } else {
                    section.style.display = 'none';
                }
            });
        });
    });
}

/**
 * Inicializa a funcionalidade da home
 */
async function initHome() {
    try {
        // Aguardar carregamento dos módulos de API
        if (typeof getProducts !== 'function' || typeof getCategories !== 'function') {
            console.log('Aguardando carregamento dos módulos de API...');
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        // Atualizar seções de produtos
        await updateProductSections();
        
        console.log('✅ Home inicializada com sucesso');
    } catch (error) {
        console.error('❌ Erro ao inicializar home:', error);
    }
}

// Inicializar quando a página carregar
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initHome);
} else {
    initHome();
}

// Expor funções para uso global
window.initHome = initHome;
window.updateProductSections = updateProductSections;
