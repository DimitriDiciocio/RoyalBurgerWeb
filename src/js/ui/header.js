// src/js/ui/header.js
// Gerenciamento completo do header - pontos, endereço e autenticação

// Importar APIs
import { getLoyaltyBalance } from '../api/loyalty.js';
import { getDefaultAddress, getAddresses, setDefaultAddress } from '../api/address.js';

// Importar sistema de alertas customizado
import { showError, showSuccess } from './alerts.js';

// ALTERAÇÃO: Importar escapeHTML para sanitização segura
import { escapeHTML } from '../utils/html-sanitizer.js';

// ALTERAÇÃO: Importar sistema de modais
import { abrirModal, fecharModal } from './modais.js';

// Chaves usadas na aplicação
const RB_STORAGE_KEYS = {
  token: 'rb.token',
  user: 'rb.user'
};

// Constantes para validação e limites
const VALIDATION_LIMITS = {
  MAX_NAME_LENGTH: 100,
  MAX_STRING_LENGTH: 1000,
  MAX_RETRY_ATTEMPTS: 10,
  RETRY_DELAY: 500
};

// Função para verificar se o usuário está logado
// NOTA DE SEGURANÇA: Esta validação é apenas estrutural (formato JWT).
// A validação de assinatura e expiração é feita no backend.
// Não confie apenas nesta validação para decisões de segurança críticas.
function isUserLoggedIn() {
  try {
    // Verifica tokens possíveis (compatibilidade): rb.token e authToken
    const token = localStorage.getItem(RB_STORAGE_KEYS.token) || localStorage.getItem('authToken');
    
    // Validar formato básico do token (JWT tem 3 partes separadas por ponto)
    if (!token || typeof token !== 'string') return false;
    
    // Verificar se não é apenas espaços ou caracteres inválidos
    if (token.trim() === '') return false;
    
    // Validação básica de JWT (3 partes: header.payload.signature)
    const tokenParts = token.split('.');
    if (tokenParts.length !== 3) return false;
    
    // Verificar se cada parte não está vazia
    return tokenParts.every(part => part.length > 0);
  } catch (error) {
    // ALTERAÇÃO: Log apenas em modo debug
    if (typeof window !== 'undefined' && window.DEBUG_MODE) {
      console.warn('Erro ao verificar login:', error);
    }
    return false;
  }
}

// Expor para outros módulos
window.isUserLoggedIn = isUserLoggedIn;

function getStoredUser() {
  try {
    const raw = localStorage.getItem(RB_STORAGE_KEYS.user);
    if (!raw || typeof raw !== 'string') return null;
    
    const user = JSON.parse(raw);
    
    // Validar estrutura básica do usuário
    if (!user || typeof user !== 'object') return null;
    
    // Sanitizar dados sensíveis antes de retornar
    return sanitizeUserData(user);
  } catch (error) {
    // ALTERAÇÃO: Log apenas em modo debug
    if (typeof window !== 'undefined' && window.DEBUG_MODE) {
      console.warn('Erro ao obter usuário:', error);
    }
    return null;
  }
}

// Sanitizar dados do usuário para evitar vazamento de informações sensíveis
function sanitizeUserData(user) {
  if (!user || typeof user !== 'object') return null;
  
  // Lista de campos sensíveis que não devem ser expostos
  const sensitiveFields = ['password', 'password_hash', 'salt', 'secret', 'private_key'];
  
  const sanitized = { ...user };
  
  // Remover campos sensíveis
  sensitiveFields.forEach(field => {
    if (field in sanitized) {
      delete sanitized[field];
    }
  });
  
  // Sanitizar strings para evitar XSS
  Object.keys(sanitized).forEach(key => {
    if (typeof sanitized[key] === 'string') {
      sanitized[key] = sanitizeString(sanitized[key]);
    }
  });
  
  return sanitized;
}

/**
 * Sanitiza strings para evitar XSS
 * @param {any} str - String a ser sanitizada
 * @param {number} maxLength - Tamanho máximo
 * @returns {string} String sanitizada
 */
function sanitizeString(str, maxLength = VALIDATION_LIMITS.MAX_STRING_LENGTH) {
  if (typeof str !== 'string') return String(str || '');
  
  return str
    .replace(/[<>'"&]/g, '') // Remover caracteres perigosos
    .replace(/[\x00-\x1F\x7F]/g, '') // Remover caracteres de controle
    .substring(0, maxLength); // Limitar tamanho
}

// Expor para outros módulos
window.getStoredUser = getStoredUser;

// Função para obter o perfil do usuário
function getUserProfile() {
  const user = getStoredUser();
  if (!user) return null;
  
  // Verifica diferentes campos possíveis para o perfil
  return user.profile || user.role || user.type || user.user_type || 'customer';
}

// Função para verificar se o usuário tem um perfil específico
function hasProfile(profile) {
  const userProfile = getUserProfile();
  if (!userProfile) return false;
  
  // Normalizar o perfil para lowercase
  const normalizedProfile = userProfile.toLowerCase();
  const normalizedTarget = profile.toLowerCase();
  
  return normalizedProfile === normalizedTarget;
}

// Função para verificar se o usuário tem permissão para um perfil (considerando herança)
function hasPermissionFor(profile) {
  const userProfile = getUserProfile();
  if (!userProfile) return false;
  
  const normalizedProfile = userProfile.toLowerCase();
  const normalizedTarget = profile.toLowerCase();
  
  // Admin tem acesso a tudo
  if (normalizedProfile === 'admin') return true;
  
  // Manager tem acesso a attendant e customer
  if (normalizedProfile === 'manager') {
    return ['attendant', 'customer'].includes(normalizedTarget);
  }
  
  // Attendant (entregador) tem acesso apenas a suas próprias funcionalidades
  if (normalizedProfile === 'attendant') {
    return normalizedTarget === 'attendant';
  }
  
  // Customer só tem acesso a customer
  if (normalizedProfile === 'customer') {
    return normalizedTarget === 'customer';
  }
  
  return false;
}

// Expor funções para outros módulos
window.getUserProfile = getUserProfile;
window.hasProfile = hasProfile;
window.hasPermissionFor = hasPermissionFor;

// Função de debug para testar perfis (apenas em desenvolvimento)
window.debugProfile = function(profile) {
  if (process.env.NODE_ENV !== 'development') return;
  
  const user = { profile: profile, name: 'Test User' };
  localStorage.setItem(RB_STORAGE_KEYS.user, JSON.stringify(user));
  if (typeof window.configureHeader === 'function') {
    window.configureHeader();
  }
};

function getStoredToken() {
  return localStorage.getItem(RB_STORAGE_KEYS.token) || localStorage.getItem('authToken') || '';
}

async function hydrateUserFromMe() {
  const hasUser = !!getStoredUser();
  const token = getStoredToken();
  if (hasUser || !token) return;

  // Importar API_BASE_URL dinamicamente para evitar dependência circular
  try {
    const { API_BASE_URL } = await import('../api/api.js');
    const possiblePaths = ['/api/users/profile', '/api/users/me', '/src/auth/me'];
    
    for (const path of possiblePaths) {
      try {
        const fullUrl = path.startsWith('http') ? path : `${API_BASE_URL}${path}`;
        const response = await fetch(fullUrl, {
          method: 'GET',
          headers: { 
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          credentials: 'include'
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
  } catch (_e) {
    // Se não conseguir importar API_BASE_URL, não faz nada
    // TODO: Implementar logging estruturado em produção
  }
}

// Expor para outros módulos
window.hydrateUserFromMe = hydrateUserFromMe;

// Gera um ícone circular com base nas iniciais (nome e sobrenome)
function gerarIconeUsuario(dadosUsuario, tamanho = 40) {
  try {
    // Validar tamanho
    const size = Math.max(20, Math.min(200, Number(tamanho) || 40));
    
    // Aceita string (nome) ou objeto com full_name/name/email
    let nomeBase = '';
    if (typeof dadosUsuario === 'string') {
      nomeBase = sanitizeString(dadosUsuario);
    } else if (dadosUsuario && typeof dadosUsuario === 'object') {
      nomeBase = sanitizeString(dadosUsuario.full_name || dadosUsuario.name || '');
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
    
    // Sanitizar iniciais para evitar XSS
    iniciais = iniciais.replace(/[^A-Z]/g, '?');
    
    const cor = '#B8B8B8';
    const fontSize = Math.floor(size / 2);
    
    return `
        <div style="
            width: ${size}px;
            height: ${size}px;
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
  } catch (error) {
    // Fallback em caso de erro
    // TODO: Implementar logging estruturado em produção
    return `
        <div style="
            width: 40px;
            height: 40px;
            background: #B8B8B8;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
            font-size: 20px;
            color: #fff;
            user-select: none;
        ">
            ?
        </div>
    `;
  }
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

// ============================================================================
// SISTEMA DE PONTOS NO HEADER
// ============================================================================

let pontosAtuais = 0;
let tentativasPontos = 0;

/**
 * Carregar pontos do usuário
 */
async function carregarPontos() {
  // Verificar se usuário está logado
  const usuario = getStoredUser();
  if (!usuario || !usuario.id) {
    ocultarPontos();
    return;
  }

  try {
    // Buscar pontos na API
    const balance = await getLoyaltyBalance(usuario.id);
    
    // A API retorna current_balance, não balance
    if (balance && typeof balance.current_balance === 'number') {
      pontosAtuais = balance.current_balance;
      atualizarExibicaoPontos();
    } else {
      pontosAtuais = 0;
      atualizarExibicaoPontos();
    }
  } catch (error) {
    // ALTERAÇÃO: Log apenas em modo debug
    if (typeof window !== 'undefined' && window.DEBUG_MODE) {
      console.error('Erro ao carregar pontos:', error.message);
    }
    // Mesmo com erro, mostrar 0 pontos em vez de ocultar
    pontosAtuais = 0;
    atualizarExibicaoPontos();
  }
}

/**
 * Atualizar exibição dos pontos
 */
function atualizarExibicaoPontos() {
  const pontosCountElement = document.querySelector('#pontos-count');
  const pontosContainer = document.querySelector('.pontos-royal');
  
  if (!pontosCountElement) return;
  
  // Atualizar o valor dos pontos
  pontosCountElement.textContent = pontosAtuais;
  
  // Garantir que o container está visível
  if (pontosContainer) {
    pontosContainer.style.display = 'flex';
    pontosContainer.style.visibility = 'visible';
    pontosContainer.style.opacity = '1';
  }
}

/**
 * Ocultar exibição dos pontos
 */
function ocultarPontos() {
  const pontosContainer = document.querySelector('.pontos-royal');
  if (pontosContainer) {
    pontosContainer.style.display = 'none';
  }
}

/**
 * Tentar inicializar pontos
 */
function tentarInitPontos() {
  tentativasPontos++;
  
  const pontosCountElement = document.querySelector('#pontos-count');
  const pontosContainer = document.querySelector('.pontos-royal');
  
  if (!pontosCountElement) {
    if (tentativasPontos < VALIDATION_LIMITS.MAX_RETRY_ATTEMPTS) {
      setTimeout(tentarInitPontos, VALIDATION_LIMITS.RETRY_DELAY);
    }
    return;
  }
  
  // Garantir que o container está visível
  if (pontosContainer) {
    pontosContainer.style.display = 'flex';
  }
  
  carregarPontos();
}

/**
 * Inicializar pontos
 */
function initPontos() {
  const userHeader = document.querySelector('#user-header');
  if (userHeader && userHeader.style.display !== 'none') {
    tentarInitPontos();
    
    // ALTERAÇÃO: Adicionar evento de clique para ir para o Clube Royal
    const pontosElement = document.querySelector('.pontos-royal');
    if (pontosElement) {
      // Remover listener anterior se existir (usando cloneNode para remover todos os event listeners)
      const newPontosElement = pontosElement.cloneNode(true);
      pontosElement.parentNode.replaceChild(newPontosElement, pontosElement);
      
      newPontosElement.addEventListener('click', () => {
        // Obter caminho correto baseado na página atual
        const getClubeRoyalPath = window.getClubeRoyalPath || (() => {
          // Fallback se a função não estiver disponível
          const currentPath = window.location.pathname;
          const isInPagesFolder = currentPath.includes("/pages/") || currentPath.includes("pages/");
          const isInSrcFolder = currentPath.includes("/src/") || currentPath.includes("src/");
          
          if (isInPagesFolder) {
            return "clube-royal.html";
          } else if (isInSrcFolder) {
            return "pages/clube-royal.html";
          } else {
            return "src/pages/clube-royal.html";
          }
        });
        
        const path = getClubeRoyalPath();
        const isAlreadyOnClube = /clube-royal\.html(\?.*)?(#.*)?$/.test(window.location.pathname);
        if (!isAlreadyOnClube) {
          window.location.href = path;
        }
      });
      newPontosElement.style.cursor = 'pointer';
    }
  } else {
    setTimeout(initPontos, 1000);
  }
}

// ============================================================================
// SISTEMA DE ENDEREÇO NO HEADER
// ============================================================================

let tentativasEndereco = 0;

/**
 * Carregar endereço do usuário
 */
async function carregarEndereco() {
  try {
    // Verificar se usuário está logado
    const usuario = getStoredUser();
    if (!usuario || !usuario.id) {
      ocultarEndereco();
      return;
    }
    
    // Buscar endereço padrão
    const endereco = await getDefaultAddress();
    
    if (endereco) {
      exibirEndereco(endereco);
    } else {
      exibirSemEndereco();
    }
  } catch (error) {
    // ALTERAÇÃO: Log apenas em modo debug
    if (typeof window !== 'undefined' && window.DEBUG_MODE) {
      console.error('Erro ao carregar endereço:', error.message);
    }
    exibirSemEndereco();
  }
}

/**
 * ALTERAÇÃO: Função auxiliar para obter caminho correto da página de perfil
 */
function getUsuarioPerfilPath() {
  const currentPath = window.location.pathname;
  const isInPagesFolder = currentPath.includes('/pages/') || currentPath.includes('pages/');
  const isInSrcFolder = currentPath.includes('/src/') || currentPath.includes('src/');
  
  // ALTERAÇÃO: Sempre usar #editar-endereco para abrir a modal de editar/adicionar endereço
  if (isInPagesFolder) {
    return 'usuario-perfil.html#editar-endereco';
  } else if (isInSrcFolder) {
    return 'pages/usuario-perfil.html#editar-endereco';
  } else {
    return 'src/pages/usuario-perfil.html#editar-endereco';
  }
}

/**
 * Exibir endereço formatado
 */
function exibirEndereco(endereco) {
  const enderecoElement = document.querySelector('.endereco p');
  if (!enderecoElement) return;
  
  // Formatar endereço
  let enderecoFormatado = endereco.street;
  if (endereco.number) {
    enderecoFormatado += ', ' + endereco.number;
  }
  if (endereco.complement) {
    enderecoFormatado += ', ' + endereco.complement;
  }
  enderecoFormatado += ' - ' + endereco.neighborhood;
  
  enderecoElement.textContent = enderecoFormatado;
  enderecoElement.parentElement.style.display = 'flex';
  enderecoElement.parentElement.style.visibility = 'visible';
  enderecoElement.parentElement.style.opacity = '1';
  
  // Adicionar tooltip com endereço completo
  const enderecoCompleto = `${endereco.street}${endereco.number ? ', ' + endereco.number : ''}${endereco.complement ? ', ' + endereco.complement : ''}\n${endereco.neighborhood} - ${endereco.city}/${endereco.state}\nCEP: ${formatarCEP(endereco.zip_code)}`;
  enderecoElement.parentElement.title = enderecoCompleto;
  
  // Resetar estilos
  enderecoElement.style.color = '';
  enderecoElement.style.fontStyle = '';
  
  // Adicionar evento de clique para alterar endereço principal
  const enderecoContainer = enderecoElement.parentElement;
  if (enderecoContainer) {
    enderecoContainer.setAttribute('data-address-id', endereco.id);
    enderecoContainer.style.cursor = 'pointer';
    enderecoContainer.onclick = async () => {
      await mostrarModalAlterarEndereco(endereco.id);
    };
  }
}

/**
 * Exibir "sem endereço"
 */
function exibirSemEndereco() {
  const enderecoElement = document.querySelector('.endereco p');
  if (!enderecoElement) return;
  
  enderecoElement.textContent = 'Nenhum endereço cadastrado';
  enderecoElement.parentElement.style.display = 'flex';
  enderecoElement.parentElement.style.visibility = 'visible';
  enderecoElement.parentElement.style.opacity = '1';
  enderecoElement.parentElement.title = 'Clique para cadastrar um endereço';
  
  // Adicionar estilo para indicar que não há endereço
  enderecoElement.style.color = '#999';
  enderecoElement.style.fontStyle = 'italic';
  
  // ALTERAÇÃO: Adicionar evento de clique para cadastrar endereço com caminho correto
  const enderecoContainer = enderecoElement.parentElement;
  if (enderecoContainer) {
    enderecoContainer.style.cursor = 'pointer';
    enderecoContainer.onclick = () => {
      window.location.href = getUsuarioPerfilPath();
    };
  }
}

/**
 * Mostrar modal para alterar endereço principal
 */
async function mostrarModalAlterarEndereco(currentAddressId) {
  try {
    // Buscar todos os endereços do usuário
    const enderecos = await getAddresses();
    
    // ALTERAÇÃO: Remover validação que impedia mostrar modal com apenas 1 endereço
    // Agora sempre mostra a modal, mesmo com apenas 1 endereço, permitindo adicionar novos
    
    // Função auxiliar para sanitizar dados do endereço
    function sanitizeAddressData(address) {
      return {
        street: sanitizeString(address.street || ''),
        number: sanitizeString(address.number || 'S/N'),
        complement: address.complement ? sanitizeString(address.complement) : '',
        neighborhood: sanitizeString(address.neighborhood || ''),
        city: sanitizeString(address.city || ''),
        state: sanitizeString(address.state || ''),
        zip_code: sanitizeString(formatarCEP(address.zip_code || ''))
      };
    }
    
    // ALTERAÇÃO: Criar lista de endereços seguindo o mesmo padrão da modal de pagamento
    let enderecosSanitizados = '';
    
    // Se há endereços cadastrados, renderizar lista
    if (enderecos && enderecos.length > 0) {
      enderecosSanitizados = enderecos.map(endereco => {
        const sanitized = sanitizeAddressData(endereco);
        const addressId = Number(endereco.id) || 0;
        const isCurrent = addressId === Number(currentAddressId);
        
        // ALTERAÇÃO: Usar escapeHTML para sanitização segura dos dados
        const street = escapeHTML(sanitized.street);
        const number = escapeHTML(sanitized.number);
        const neighborhood = escapeHTML(sanitized.neighborhood);
        const city = escapeHTML(sanitized.city);
        const state = escapeHTML(sanitized.state);
        
        return `
          <div class="endereco-item ${isCurrent ? 'selecionado' : ''}" 
               data-address-id="${addressId}"
               data-action="select-address">
            <div class="endereco-info">
              <i class="fa-solid fa-location-dot"></i>
              <div class="endereco-info-content">
                <p class="titulo">${street}, ${number}</p>
                <p class="descricao">${neighborhood} - ${city}/${state}</p>
              </div>
            </div>
            <div class="endereco-actions">
              ${isCurrent ? '<div class="endereco-check"><i class="fa-solid fa-check"></i></div>' : ''}
            </div>
          </div>
        `;
      }).join('');
    }
    
    // ALTERAÇÃO: Adicionar botão para adicionar novo endereço (sempre visível)
    const botaoAdicionarEndereco = `
      <div class="endereco-item" data-endereco-id="novo" data-action="add-address">
        <div class="endereco-info">
          <i class="fa-solid fa-plus"></i>
          <div class="endereco-info-content">
            <p class="titulo">${enderecos && enderecos.length > 0 ? 'Adicionar novo endereço' : 'Adicionar primeiro endereço'}</p>
            <p class="descricao">Cadastrar um novo endereço de entrega</p>
          </div>
        </div>
      </div>
    `;
    
    // ALTERAÇÃO: Estrutura da modal seguindo o padrão da modal de pagamento
    const modalHtml = `
      <div id="modal-alterar-endereco" class="modal" style="display: none;" data-reset-on-close="true">
        <div class="div-overlay"></div>
        <div class="modal-contet">
          <div class="header">
            <i class="fa-solid fa-xmark" data-close-modal="modal-alterar-endereco"></i>
            <p class="titulo">Selecionar endereço</p>
            <p class="descricao">Escolha um endereço para definir como principal ou adicione um novo</p>
          </div>
          
          <div class="main">
            <div id="lista-enderecos-alteracao" class="lista-enderecos-modal">
              ${enderecosSanitizados}
              ${botaoAdicionarEndereco}
            </div>
          </div>
          
          <div class="footer">
            <button data-close-modal="modal-alterar-endereco">Cancelar</button>
          </div>
        </div>
      </div>
    `;
    
    // Remover modal anterior se existir
    const existingModal = document.getElementById('modal-alterar-endereco');
    if (existingModal) {
      existingModal.remove();
    }
    
    // Adicionar modal ao DOM
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    
    // ALTERAÇÃO: Abrir modal usando o sistema padrão
    abrirModal('modal-alterar-endereco');
    
    // ALTERAÇÃO: Adicionar evento de clique para seleção de endereço
    document.getElementById('modal-alterar-endereco')?.addEventListener('click', async (e) => {
      // Verificar se clicou no botão de adicionar endereço
      const addAddressItem = e.target.closest('.endereco-item[data-action="add-address"]');
      if (addAddressItem) {
        fecharModal('modal-alterar-endereco');
        window.location.href = getUsuarioPerfilPath();
        return;
      }
      
      // Verificar se clicou em um endereço existente
      const addressItem = e.target.closest('.endereco-item[data-action="select-address"]');
      if (addressItem) {
        const addressId = parseInt(String(addressItem.dataset.addressId || ''), 10);
        if (!isNaN(addressId) && addressId > 0 && addressId !== Number(currentAddressId)) {
          await alterarEnderecoPrincipal(addressId);
        }
      }
    });
    
  } catch (error) {
    // ALTERAÇÃO: Log apenas em modo debug - erro já é exibido ao usuário
    if (typeof window !== 'undefined' && window.DEBUG_MODE) {
      console.error('Erro ao mostrar modal de alteração de endereço:', error.message);
    }
    showError('Erro ao carregar endereços. Tente novamente.');
  }
}

/**
 * Alterar endereço principal
 */
async function alterarEnderecoPrincipal(addressId) {
  try {
    await setDefaultAddress(Number(addressId));
    
    // Fechar modal
    fecharModalEndereco();
    
    // Recarregar endereço no header
    await carregarEndereco();
    
    // Mostrar mensagem de sucesso
    showSuccess('Endereço principal alterado com sucesso!');
    
  } catch (error) {
    // ALTERAÇÃO: Log apenas em modo debug - erro já é exibido ao usuário
    if (typeof window !== 'undefined' && window.DEBUG_MODE) {
      console.error('Erro ao alterar endereço principal:', error.message);
    }
    showError('Erro ao alterar endereço principal. Tente novamente.');
  }
}

/**
 * ALTERAÇÃO: Fechar modal de endereço usando o sistema padrão
 */
function fecharModalEndereco() {
  fecharModal('modal-alterar-endereco');
}

// Expor função globalmente
window.fecharModalEndereco = fecharModalEndereco;

/**
 * Ocultar endereço
 */
function ocultarEndereco() {
  const enderecoElement = document.querySelector('.endereco p');
  if (!enderecoElement) return;
  
  enderecoElement.parentElement.style.display = 'none';
}

/**
 * Formatar CEP
 */
function formatarCEP(cep) {
  if (!cep) return '';
  return cep.replace(/(\d{5})(\d{3})/, '$1-$2');
}

/**
 * Tentar inicializar endereço
 */
function tentarInitEndereco() {
  tentativasEndereco++;
  
  const enderecoElement = document.querySelector('.endereco p');
  if (!enderecoElement) {
    if (tentativasEndereco < VALIDATION_LIMITS.MAX_RETRY_ATTEMPTS) {
      setTimeout(tentarInitEndereco, VALIDATION_LIMITS.RETRY_DELAY);
    }
    return;
  }
  
  carregarEndereco();
}

/**
 * Inicializar endereço
 */
function initEndereco() {
  const userHeader = document.querySelector('#user-header');
  if (userHeader && userHeader.style.display !== 'none') {
    tentarInitEndereco();
  } else {
    setTimeout(initEndereco, 1000);
  }
}

// ============================================================================
// INICIALIZAÇÃO E FUNÇÕES GLOBAIS
// ============================================================================

/**
 * Inicializar sistemas do header
 */
function initHeaderSystems() {
  initPontos();
  initEndereco();
}

/**
 * Atualizar pontos manualmente
 */
window.atualizarPontosHeader = function(pontos) {
  pontosAtuais = pontos || 100;
  atualizarExibicaoPontos();
};

/**
 * Carregar pontos automaticamente
 */
window.carregarPontosHeader = function() {
  initPontos();
};

/**
 * Atualizar endereço manualmente
 */
window.atualizarEnderecoHeader = function() {
  carregarEndereco();
};

/**
 * Carregar endereço automaticamente
 */
window.carregarEnderecoHeader = function() {
  initEndereco();
};

// Inicializar quando o DOM estiver pronto
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initHeaderSystems);
} else {
  initHeaderSystems();
}
