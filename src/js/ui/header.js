// src/js/ui/header.js

// Chaves usadas na aplicação
const RB_STORAGE_KEYS = {
  token: 'rb.token',
  user: 'rb.user'
};

// Função para verificar se o usuário está logado
function isUserLoggedIn() {
  // Verifica tokens possíveis (compatibilidade): rb.token e authToken
  const token = localStorage.getItem(RB_STORAGE_KEYS.token) || localStorage.getItem('authToken');
  return token !== null && token !== undefined && token !== '';
}

// Expor para outros módulos
window.isUserLoggedIn = isUserLoggedIn;

function getStoredUser() {
  const raw = localStorage.getItem(RB_STORAGE_KEYS.user);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (_e) {
    return null;
  }
}

// Expor para outros módulos
window.getStoredUser = getStoredUser;

function getStoredToken() {
  return localStorage.getItem(RB_STORAGE_KEYS.token) || localStorage.getItem('authToken') || '';
}

async function hydrateUserFromMe() {
  const hasUser = !!getStoredUser();
  const token = getStoredToken();
  if (hasUser || !token) return;

  const possiblePaths = ['/api/users/profile', '/api/users/me', '/src/auth/me'];
  for (const path of possiblePaths) {
    try {
      const response = await fetch(path, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        const user = data?.user || data || null;
        if (user) {
          try { localStorage.setItem(RB_STORAGE_KEYS.user, JSON.stringify(user)); } catch (_e) { }
          if (typeof window.configureHeader === 'function') {
            window.configureHeader();
          }
          return;
        }
      }
    } catch (_e) {
      // continua tentando próximo path
    }
  }
}

// Expor para outros módulos
window.hydrateUserFromMe = hydrateUserFromMe;

// Gera um ícone circular com base nas iniciais (nome e sobrenome)
function gerarIconeUsuario(dadosUsuario, tamanho = 40) {
  // Aceita string (nome) ou objeto com full_name/name/email
  let nomeBase = '';
  if (typeof dadosUsuario === 'string') {
    nomeBase = dadosUsuario;
  } else if (dadosUsuario && typeof dadosUsuario === 'object') {
    nomeBase = dadosUsuario.full_name || dadosUsuario.name || '';
  }

  const nome = (nomeBase || '').trim().replace(/\s+/g, ' ');
  let iniciais = '';
  if (nome.length === 0) {
    iniciais = '?';
  } else {
    const partes = nome.split(' ').filter(Boolean);
    if (partes.length >= 2) {
      const primeira = (partes[0][0] || '').toUpperCase();
      const segunda = (partes[1][0] || '').toUpperCase();
      iniciais = `${primeira}${segunda}`;
    } else {
      // Apenas primeiro nome: usa somente a primeira letra
      iniciais = (partes[0][0] || '?').toUpperCase();
    }
  }
  const cor = '#B8B8B8';
  const fontSize = Math.floor(tamanho / 2);
  return `
        <div style="
            width: ${tamanho}px;
            height: ${tamanho}px;
            background: ${cor};
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
            font-size: ${fontSize}px;
            color: #fff;
            user-select: none;
        ">
            ${iniciais}
        </div>
    `;
}

// Disponibiliza para outros scripts
window.gerarIconeUsuario = gerarIconeUsuario;

// Função para atualizar o header quando o estado de login mudar
function updateHeaderState() {
  if (typeof window.configureHeader === 'function') {
    window.configureHeader();
  }
}

// Load do header será disparado por imports.js

// Escuta mudanças no localStorage para atualizar o header
window.addEventListener('storage', function (e) {
  if (e.key === 'authToken' || e.key === RB_STORAGE_KEYS.token || e.key === RB_STORAGE_KEYS.user) {
    updateHeaderState();
  }
});

// Exporta a função para ser usada por outros scripts
window.updateHeaderState = updateHeaderState;

// Função pública para ser chamada após login
window.applyLoggedHeader = function (user) {
  if (user && typeof user === 'object') {
    try {
      localStorage.setItem(RB_STORAGE_KEYS.user, JSON.stringify(user));
    } catch (_e) { }
  }
  updateHeaderState();
};
