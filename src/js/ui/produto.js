/**
 * Script para carregar dados dinâmicos da página de produto
 */

import { getProductById } from '../../api/products.js';

/**
 * Constrói URL correta para imagem do produto com cache inteligente
 */
function buildImageUrl(imagePath, imageHash = null) {
    if (!imagePath) return '../assets/img/tudo.jpeg';
    
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
 * Carrega os dados do produto baseado no ID da URL
 */
async function loadProductDetails() {
    try {
        // Obtém o ID do produto da URL
        const urlParams = new URLSearchParams(window.location.search);
        const productId = urlParams.get('id');
        
        if (!productId) {
            console.error('ID do produto não encontrado na URL');
            return;
        }
        
        // Busca os dados do produto
        const product = await getProductById(productId);
        
        if (!product) {
            console.error('Produto não encontrado');
            return;
        }
        
        // Atualiza os elementos da página
        updateProductElements(product);
        
    } catch (error) {
        console.error('Erro ao carregar detalhes do produto:', error);
    }
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
 * Atualiza os elementos da página com os dados do produto
 */
function updateProductElements(product) {
    // Atualiza a imagem do produto
    const productImage = document.querySelector('.esquerda img');
    if (productImage && product.image_url) {
        updateImageIfChanged(productImage, product.image_url, product.image_hash);
    }
    
    // Atualiza o nome do produto
    const productName = document.getElementById('nome-produto');
    if (productName) {
        productName.textContent = product.name || 'Nome do produto';
    }
    
    // Atualiza a descrição do produto
    const productDescription = document.getElementById('descricao-produto');
    if (productDescription) {
        productDescription.textContent = product.description || 'Descrição do produto não disponível.';
    }
    
    // Atualiza o preço
    if (product.price) {
        const price = parseFloat(product.price);
        const formattedPrice = `R$ ${price.toFixed(2).replace('.', ',')}`;
        
        // Atualiza o preço na área de adicionar
        const priceSpan = document.querySelector('.area-adicionar .valor span');
        if (priceSpan) {
            priceSpan.textContent = formattedPrice;
        }
        
        // Atualiza o preço no quadro
        const priceValue = document.querySelector('.quadro #valor');
        if (priceValue) {
            priceValue.textContent = formattedPrice;
        }
    }
    
    // Atualiza o título da página
    document.title = `${product.name || 'Produto'} - Royal Burguer`;
}

/**
 * Inicializa o script quando a página carrega
 */
document.addEventListener('DOMContentLoaded', loadProductDetails);
