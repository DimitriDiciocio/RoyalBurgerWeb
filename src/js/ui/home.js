/**
 * Home.js - Gerenciamento da exibição de produtos na página inicial
 * Carrega produtos e categorias da API e exibe dinamicamente na home
 */

// Cache para produtos e categorias
let productsCache = null;
let categoriesCache = null;

/**
 * Limpa o cache de produtos (útil quando produtos são atualizados)
 */
function clearProductsCache() {
    productsCache = null;
    console.log('Cache de produtos limpo');
}

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
        
        // Filtrar apenas produtos ativos (dupla verificação)
        const allProducts = response.items || [];
        const activeProducts = allProducts.filter(product => {
            // Verificar se o produto está ativo (is_active deve ser true ou undefined/null)
            const isActive = product.is_active !== false && product.is_active !== 0 && product.is_active !== 'false';
            return isActive;
        });
        
        console.log(`Produtos carregados: ${allProducts.length} total, ${activeProducts.length} ativos`);
        
        productsCache = activeProducts;
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


// Cache local para evitar recarregamento desnecessário de imagens
const imageCache = new Map();

/**
 * Constrói URL correta para imagem do produto com cache inteligente
 */
function buildImageUrl(imagePath, imageHash = null) {
    if (!imagePath) return 'src/assets/img/tudo.jpeg';
    
    // Se já é uma URL completa, usar diretamente
    if (imagePath.startsWith('http')) {
        return imagePath;
    }
    
    // URL base dinâmica baseada na origem atual
    const currentOrigin = window.location.origin;
    let baseUrl;
    
    // Se estamos em localhost, usar localhost:5000
    if (currentOrigin.includes('localhost') || currentOrigin.includes('127.0.0.1')) {
        baseUrl = 'http://localhost:5000';
    } else {
        // Para outros ambientes, usar a mesma origem mas porta 5000
        const hostname = window.location.hostname;
        baseUrl = `http://${hostname}:5000`;
    }
    
    // Usa hash da imagem se disponível, senão usa timestamp
    const cacheParam = imageHash || new Date().getTime();
    
    // Se é um caminho do backend (/api/uploads/products/ID.jpeg)
    if (imagePath.startsWith('/api/uploads/products/')) {
        return `${baseUrl}${imagePath}?v=${cacheParam}`;
    }
    
    // Se é um caminho antigo (/uploads/products/ID.jpeg)
    if (imagePath.startsWith('/uploads/products/')) {
        return `${baseUrl}${imagePath.replace('/uploads/', '/api/uploads/')}?v=${cacheParam}`;
    }
    
    // Se é apenas o nome do arquivo (ID.jpeg, ID.jpg, etc.)
    if (imagePath.match(/^\d+\.(jpg|jpeg|png|gif|webp)$/i)) {
        return `${baseUrl}/api/uploads/products/${imagePath}?v=${cacheParam}`;
    }
    
    // Fallback: assumir que é um caminho relativo
    return `${baseUrl}/api/uploads/products/${imagePath}?v=${cacheParam}`;
}

/**
 * Verifica se a imagem mudou e atualiza apenas se necessário
 */
function updateImageIfChanged(imgElement, newImagePath, newImageHash) {
    if (!imgElement || !newImagePath) return;
    
    const currentSrc = imgElement.src;
    const newSrc = buildImageUrl(newImagePath, newImageHash);
    
    // Se a URL mudou, atualiza a imagem
    if (currentSrc !== newSrc) {
        // Verifica se a imagem já está carregada para evitar piscar
        const tempImg = new Image();
        tempImg.onload = () => {
            imgElement.src = newSrc;
            imgElement.alt = imgElement.alt || 'Produto';
        };
        tempImg.src = newSrc;
    }
}

/**
 * Cria o HTML de um produto (mantendo formatação original)
 */
function createProductHTML(product) {
    const imageUrl = buildImageUrl(product.image_url, product.image_hash);
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
 * Atualiza imagens de produtos existentes de forma inteligente
 */
function updateExistingProductImages(products) {
    // Busca todas as imagens de produtos na página
    const productImages = document.querySelectorAll('#ficha-produto img');
    
    productImages.forEach(img => {
        const productId = img.closest('a')?.href?.match(/id=(\d+)/)?.[1];
        if (productId) {
            const product = products.find(p => p.id == productId);
            if (product) {
                updateImageIfChanged(img, product.image_url, product.image_hash);
            }
        }
    });
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
        
        // Atualizar imagens existentes de forma inteligente
        updateExistingProductImages(products);
        
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
 * Força a atualização da home (limpa cache e recarrega)
 */
async function refreshHome() {
    try {
        console.log('🔄 Atualizando home...');
        clearProductsCache();
        await updateProductSections();
        console.log('✅ Home atualizada com sucesso');
    } catch (error) {
        console.error('❌ Erro ao atualizar home:', error);
    }
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
window.clearProductsCache = clearProductsCache;
window.refreshHome = refreshHome;
