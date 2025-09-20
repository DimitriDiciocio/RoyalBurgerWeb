// src/js/ui/footer.js

/**
 * Determina o caminho correto para o footer.html baseado na página atual
 */
function getFooterPath() {
  const currentPath = window.location.pathname;
  const isInPagesFolder = currentPath.includes('/pages/');
  const isInSrcFolder = currentPath.includes('/src/');

  if (isInPagesFolder) {
    return '../components/layout/footer.html';
  } else if (isInSrcFolder) {
    return 'components/layout/footer.html';
  } else {
    return 'src/components/layout/footer.html';
  }
}

/**
 * Tenta carregar o footer de múltiplos caminhos possíveis
 */
async function tryLoadFooter() {
  const possiblePaths = [
    '../components/layout/footer.html',
    'components/layout/footer.html', 
    'src/components/layout/footer.html'
  ];

  for (const path of possiblePaths) {
    try {
      const response = await fetch(path);
      if (response.ok) {
        const data = await response.text();
        return { success: true, data };
      }
    } catch (error) {
      console.warn(`Tentativa de carregar footer de ${path} falhou:`, error);
    }
  }
  
  return { success: false, data: null };
}

/**
 * Carrega o footer dinamicamente
 */
async function loadFooter() {
  try {
    const footerPath = getFooterPath();
    let response = await fetch(footerPath);

    if (!response.ok) {
      const result = await tryLoadFooter();
      if (result.success) {
        document.getElementById("footer-container").innerHTML = result.data;
      } else {
        throw new Error('Não foi possível carregar o footer de nenhum caminho');
      }
    } else {
      const data = await response.text();
      document.getElementById("footer-container").innerHTML = data;
    }
    
    // Corrigir caminhos após carregar o footer
    fixFooterPaths();
  } catch (error) {
    console.error('Erro ao carregar o footer:', error);
    // Fallback HTML básico
    document.getElementById("footer-container").innerHTML = `
      <footer>
        <div class="segunda">
          <p>© Copyright 2025 - Royal Burguer</p>
        </div>
      </footer>
    `;
  }
}

/**
 * Corrige os caminhos das imagens no footer baseado na página atual
 */
function fixFooterPaths() {
  const currentPath = window.location.pathname;
  const isInPagesFolder = currentPath.includes('/pages/') || currentPath.includes('pages/');
  const isInSrcFolder = currentPath.includes('/src/') || currentPath.includes('src/');

  const logoImg = document.querySelector('footer img');
  if (logoImg) {
    let logoPath;
    if (isInPagesFolder && isInSrcFolder) {
      logoPath = '../../src/assets/img/logo-texto.png';
    } else if (isInPagesFolder) {
      logoPath = '../../assets/img/logo-texto.png';
    } else if (isInSrcFolder) {
      logoPath = '../assets/img/logo-texto.png';
    } else {
      logoPath = 'src/assets/img/logo-texto.png';
    }
    logoImg.src = logoPath;
    logoImg.alt = 'Royal Burguer Logo';
  }
}

// Executa quando a página carregar
document.addEventListener("DOMContentLoaded", loadFooter);
