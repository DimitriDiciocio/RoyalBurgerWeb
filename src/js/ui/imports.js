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

  // Caminho correto da logo (SVG) baseado na página atual
  function getLogoSvgPath() {
    const currentPath = window.location.pathname;
    const isInPagesFolder = currentPath.includes('/pages/') || currentPath.includes('pages/');
    const isInSrcFolder = currentPath.includes('/src/') || currentPath.includes('src/');

    if (isInPagesFolder && isInSrcFolder) {
      return '../../src/assets/svg/logo.svg';
    } else if (isInPagesFolder) {
      return '../../assets/svg/logo.svg';
    } else if (isInSrcFolder) {
      return '../assets/svg/logo.svg';
    } else {
      return 'src/assets/svg/logo.svg';
    }
  }
  
  // Executa quando a página carregar
  document.addEventListener("DOMContentLoaded", () => {
    loadFooter();
    // dispara o carregamento do header também
    if (typeof window.loadHeader === 'function') {
      window.loadHeader();
    } else {
      // fallback leve: tenta novamente um pouco depois
      setTimeout(() => { if (typeof window.loadHeader === 'function') window.loadHeader(); }, 100);
    }
  });

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
    const navLoggedOnlyLinks = document.querySelectorAll('.nav-logged-only');
    const conta = document.querySelector('.conta');
    const hamburgerBtn = document.querySelector('.hamburger-btn');
    const navModalAuth = document.querySelector('#nav-modal .nav-modal-auth');
  
    if (!header) return;
  
    const isLoggedIn = typeof window.isUserLoggedIn === 'function' ? window.isUserLoggedIn() : false;
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
      if (hamburgerBtn) hamburgerBtn.style.display = 'none';
      if (navModalAuth) navModalAuth.style.display = '';
    } else if (isLoggedIn) {
      // Usuário logado: mostrar todos os itens de navegação
      header.classList.add('header-logged-in');
      if (navMenu) navMenu.style.display = 'flex';
      if (loginHeader) loginHeader.style.display = 'none';
      if (userHeader) userHeader.style.display = 'flex';
      if (hamburgerBtn) hamburgerBtn.style.display = '';
      if (navModalAuth) navModalAuth.style.display = 'none';
  
      // Mostrar links que só aparecem quando logado
      navLoggedOnlyLinks.forEach(link => {
        link.style.display = 'block';
      });
  
      // Atualiza ícone com iniciais do usuário
      const user = typeof window.getStoredUser === 'function' ? window.getStoredUser() : null;
      if (conta) {
        const tamanho = 36;
        const gerar = (typeof window.gerarIconeUsuario === 'function') ? window.gerarIconeUsuario : () => '';
        conta.innerHTML = gerar(user || '', tamanho);
        // Torna o ícone da conta clicável para ir aos dados da conta
        try {
          conta.style.cursor = 'pointer';
          conta.setAttribute('title', 'Dados da conta');
          conta.onclick = () => {
            const path = getDadosContaPath();
            const isAlreadyOnDados = /usuario-perfil\.html(\?.*)?(#.*)?$/.test(window.location.pathname);
            if (!isAlreadyOnDados) {
              window.location.href = path;
            }
          };
        } catch (_e) { }
      }
    } else {
      // Usuário não logado: esconder links de Clube Royal e Pedidos
      header.classList.add('header-logged-out');
      if (navMenu) navMenu.style.display = 'flex';
      if (loginHeader) loginHeader.style.display = 'flex';
      if (userHeader) userHeader.style.display = 'none';
      if (hamburgerBtn) hamburgerBtn.style.display = 'none';
      if (navModalAuth) navModalAuth.style.display = '';
  
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
  
      logo.onerror = function () {
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
  
  // Retorna o caminho correto para a página de dados da conta, baseado na página atual
  function getDadosContaPath() {
    const currentPath = window.location.pathname;
    const isInPagesFolder = currentPath.includes('/pages/') || currentPath.includes('pages/');
    const isInSrcFolder = currentPath.includes('/src/') || currentPath.includes('src/');
  
    if (isInPagesFolder) {
      return 'usuario-perfil.html';
    } else if (isInSrcFolder) {
      return 'pages/usuario-perfil.html';
    } else {
      return 'src/pages/usuario-perfil.html';
    }
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
        // Inicializa comportamento do modal hamburguer
        try {
          const headerEl = document.querySelector('header');
          const btn = headerEl?.querySelector('.hamburger-btn');
          const modal = document.getElementById('nav-modal');
          const overlay = modal?.querySelector('.nav-modal-overlay');
          const closeBtn = modal?.querySelector('.nav-modal-close');
          const logoModal = modal?.querySelector('.logo-modal');
          if (logoModal && typeof window.getLogoSvgPath === 'function') {
            logoModal.src = window.getLogoSvgPath();
          }

          const openModal = () => {
            if (!modal) return;
            modal.classList.add('open');
            if (btn) btn.setAttribute('aria-expanded', 'true');
            document.body.style.overflow = 'hidden';
          };
          const closeModal = () => {
            if (!modal) return;
            modal.classList.remove('open');
            if (btn) btn.setAttribute('aria-expanded', 'false');
            document.body.style.overflow = '';
          };

          btn && (btn.onclick = openModal);
          overlay && (overlay.onclick = closeModal);
          closeBtn && (closeBtn.onclick = closeModal);
          document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') closeModal();
          });
        } catch (_e) { }
        // Hidrata usuário se necessário (para gerar iniciais corretamente)
        if (typeof window.isUserLoggedIn === 'function' && window.isUserLoggedIn()) {
          if (typeof window.hydrateUserFromMe === 'function') {
            window.hydrateUserFromMe();
          }
        }
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

  // Expor funções do header/footer para outros módulos
  window.configureHeader = configureHeader;
  window.getDadosContaPath = getDadosContaPath;
  window.loadHeader = loadHeader;
  window.getLogoSvgPath = getLogoSvgPath;