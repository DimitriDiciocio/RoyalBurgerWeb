// src/js/ui/header.js

// Função para verificar se o usuário está logado
function isUserLoggedIn() {
  // Verifica se existe um token de autenticação no localStorage
  const token = localStorage.getItem('authToken');
  return token !== null && token !== undefined;
}

// Função para verificar se é página de login
function isLoginPage() {
  return window.location.pathname.includes('login.html');
}

// Função para verificar se é página de cadastro
function isCadastroPage() {
  return window.location.pathname.includes('cadastro.html');
}

// Função para configurar o header baseado no estado
function configureHeader() {
  const header = document.querySelector('header');
  const navMenu = document.getElementById('nav-menu');
  const loginHeader = document.getElementById('login-header');
  const userHeader = document.getElementById('user-header');
  const logo = document.querySelector('.logo');
  const navLoggedOnlyLinks = document.querySelectorAll('.nav-logged-only');
  
  if (!header) return;

  const isLoggedIn = isUserLoggedIn();
  const isLogin = isLoginPage();
  const isCadastro = isCadastroPage();

  // Reset classes
  header.classList.remove('header-login', 'header-logged-out', 'header-logged-in');
  
  if (isLogin || isCadastro) {
    // Página de login/cadastro: apenas logo centralizada
    header.classList.add('header-login');
    if (navMenu) navMenu.style.display = 'none';
    if (loginHeader) loginHeader.style.display = 'none';
    if (userHeader) userHeader.style.display = 'none';
  } else if (isLoggedIn) {
    // Usuário logado: mostrar todos os itens de navegação
    header.classList.add('header-logged-in');
    if (navMenu) navMenu.style.display = 'flex';
    if (loginHeader) loginHeader.style.display = 'none';
    if (userHeader) userHeader.style.display = 'flex';
    
    // Mostrar links que só aparecem quando logado
    navLoggedOnlyLinks.forEach(link => {
      link.style.display = 'block';
    });
  } else {
    // Usuário não logado: esconder links de Clube Royal e Pedidos
    header.classList.add('header-logged-out');
    if (navMenu) navMenu.style.display = 'flex';
    if (loginHeader) loginHeader.style.display = 'flex';
    if (userHeader) userHeader.style.display = 'none';
    
    // Esconder links que só aparecem quando logado
    navLoggedOnlyLinks.forEach(link => {
      link.style.display = 'none';
    });
  }
}

// Função para corrigir caminhos baseado na página atual
function fixPaths() {
  const currentPath = window.location.pathname;
  const isInPagesFolder = currentPath.includes('/pages/') || currentPath.includes('pages/');
  const isInSrcFolder = currentPath.includes('/src/') || currentPath.includes('src/');
  
  // Ajustar caminhos baseado na localização atual
  const logo = document.querySelector('.logo');
  const navLinks = document.querySelectorAll('.nav-menu a');
  const loginLinks = document.querySelectorAll('#login-header a');
  
  if (logo) {
    let logoPath;
    
    // Lógica corrigida: priorizar a detecção mais específica
    if (isInPagesFolder && isInSrcFolder) {
      // Página está em src/pages/ - precisa subir 2 níveis para chegar em src/
      logoPath = '../../src/assets/svg/logo.svg';
    } else if (isInPagesFolder) {
      // Página está em pages/ (não em src/) - subir 2 níveis
      logoPath = '../../assets/svg/logo.svg';
    } else if (isInSrcFolder) {
      // Página está em src/ (mas não em pages/) - subir 1 nível
      logoPath = '../assets/svg/logo.svg';
    } else {
      // Página está na raiz
      logoPath = 'src/assets/svg/logo.svg';
    }
    
    // Sempre definir o caminho correto baseado na localização atual
    logo.src = logoPath;
    logo.alt = 'Royal Burguer Logo';
    
    logo.onerror = function() {
      // Tentar caminhos alternativos
      const alternativePaths = [
        '../assets/svg/logo.svg',
        '../../assets/svg/logo.svg',
        'src/assets/svg/logo.svg',
        './src/assets/svg/logo.svg',
        './assets/svg/logo.svg'
      ];
      
      let pathIndex = 0;
      const tryNextPath = () => {
        if (pathIndex < alternativePaths.length) {
          logo.src = alternativePaths[pathIndex];
          pathIndex++;
        }
      };
      
      logo.onerror = tryNextPath;
    };
  }
  
  // Ajustar links de navegação
  navLinks.forEach((link, index) => {
    const href = link.getAttribute('href');
    if (href && !href.startsWith('#') && !href.startsWith('http')) {
      let newHref = href;
      
      if (isInPagesFolder) {
        if (href.includes('index.html')) {
          newHref = '../../index.html';
        } else if (href.includes('clube-royal.html')) {
          newHref = 'clube-royal.html';
        } else if (href.includes('pedidos.html')) {
          newHref = 'pedidos.html';
        }
      } else if (isInSrcFolder) {
        if (href.includes('index.html')) {
          newHref = '../index.html';
        } else if (href.includes('clube-royal.html')) {
          newHref = 'pages/clube-royal.html';
        } else if (href.includes('pedidos.html')) {
          newHref = 'pages/pedidos.html';
        }
      } else {
        if (href.includes('index.html')) {
          newHref = 'index.html';
        } else if (href.includes('clube-royal.html')) {
          newHref = 'src/pages/clube-royal.html';
        } else if (href.includes('pedidos.html')) {
          newHref = 'src/pages/pedidos.html';
        }
      }
      
      if (newHref !== href) {
        link.href = newHref;
      }
    }
  });
  
  // Ajustar links de login/cadastro
  loginLinks.forEach((link, index) => {
    const href = link.getAttribute('href');
    if (href && !href.startsWith('#') && !href.startsWith('http')) {
      let newHref = href;
      
      if (isInPagesFolder) {
        if (href.includes('login.html')) {
          newHref = 'login.html';
        } else if (href.includes('cadastro.html')) {
          newHref = 'cadastro.html';
        }
      } else if (isInSrcFolder) {
        if (href.includes('login.html')) {
          newHref = 'pages/login.html';
        } else if (href.includes('cadastro.html')) {
          newHref = 'pages/cadastro.html';
        }
      } else {
        if (href.includes('login.html')) {
          newHref = 'src/pages/login.html';
        } else if (href.includes('cadastro.html')) {
          newHref = 'src/pages/cadastro.html';
        }
      }
      
      if (newHref !== href) {
        link.href = newHref;
      }
    }
  });
}

// Função para obter o caminho correto do header baseado na página atual
function getHeaderPath() {
  const currentPath = window.location.pathname;
  const isInPagesFolder = currentPath.includes('/pages/');
  const isInSrcFolder = currentPath.includes('/src/');
  
  if (isInPagesFolder) {
    return '../components/layout/header.html';
  } else if (isInSrcFolder) {
    return 'components/layout/header.html';
  } else {
    return 'src/components/layout/header.html';
  }
}

// Função para tentar carregar o header com diferentes caminhos
async function tryLoadHeader() {
  const possiblePaths = [
    'src/components/layout/header.html',
    '../components/layout/header.html',
    'components/layout/header.html',
    './src/components/layout/header.html',
    './components/layout/header.html'
  ];
  
  for (const path of possiblePaths) {
    try {
      const response = await fetch(path);
      if (response.ok) {
        return { success: true, data: await response.text(), path: path };
      }
    } catch (error) {
      continue;
    }
  }
  
  return { success: false, data: null, path: null };
}

async function loadHeader() {
  try {
    // Primeiro tenta com o caminho calculado
    const headerPath = getHeaderPath();
    let response = await fetch(headerPath);
    
    if (!response.ok) {
      // Se falhar, tenta outros caminhos
      const result = await tryLoadHeader();
      if (result.success) {
        document.getElementById("header-container").innerHTML = result.data;
      } else {
        throw new Error('Não foi possível carregar o header de nenhum caminho');
      }
    } else {
      const data = await response.text();
      document.getElementById("header-container").innerHTML = data;
    }
    
    // Corrigir caminhos baseado na página atual
    setTimeout(() => {
      fixPaths();
      configureHeader();
    }, 100);
  } catch (error) {
    console.error('Erro ao carregar o header:', error);
    // Fallback: inserir header básico em caso de erro
    document.getElementById("header-container").innerHTML = `
      <header>
        <div class="navegacao">
          <img src="src/assets/svg/logo.svg" alt="logo" class="logo">
          <nav class="nav-menu" id="nav-menu">
            <a href="index.html">Início</a>
            <a href="src/pages/login.html">Login</a>
            <a href="src/pages/cadastro.html">Cadastro</a>
          </nav>
        </div>
      </header>
    `;
  }
}

// Função para atualizar o header quando o estado de login mudar
function updateHeaderState() {
  configureHeader();
}

// Executa quando a página carregar
document.addEventListener("DOMContentLoaded", loadHeader);

// Escuta mudanças no localStorage para atualizar o header
window.addEventListener('storage', function(e) {
  if (e.key === 'authToken') {
    updateHeaderState();
  }
});

// Exporta a função para ser usada por outros scripts
window.updateHeaderState = updateHeaderState;
