// src/js/ui/header.js
// Gerenciamento completo do header - pontos, endereço e autenticação

// Importar APIs
import { getLoyaltyBalance } from '../api/loyalty.js';
import { getDefaultAddress, getAddresses, setDefaultAddress } from '../api/address.js';

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
function isUserLoggedIn() {
  try {
    // Verifica tokens possíveis (compatibilidade): rb.token e authToken
    const token = localStorage.getItem(RB_STORAGE_KEYS.token) || localStorage.getItem('authToken');
    
    // Validar formato básico do token (JWT tem 3 partes separadas por ponto)
    if (!token || typeof token !== 'string') return false;
    
    // Verificar se não é apenas espaços ou caracteres inválidos
    if (token.trim() === '') return false;
    
    // Validação básica de JWT (3 partes separadas por ponto)
    const tokenParts = token.split('.');
    if (tokenParts.length !== 3) return false;
    
    // Verificar se cada parte não está vazia
    return tokenParts.every(part => part.length > 0);
  } catch (error) {
    // Log apenas em desenvolvimento
    if (process.env.NODE_ENV === 'development') {
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
    // Log apenas em desenvolvimento
    if (process.env.NODE_ENV === 'development') {
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
    console.log('Carregando pontos do usuário ID:', usuario.id);
    
    // Buscar pontos na API
    const balance = await getLoyaltyBalance(usuario.id);
    
    if (balance && typeof balance.balance === 'number') {
      pontosAtuais = balance.balance;
      console.log('Pontos carregados:', pontosAtuais);
      atualizarExibicaoPontos();
    } else {
      console.log('Nenhum ponto encontrado');
      pontosAtuais = 0;
      atualizarExibicaoPontos();
    }
  } catch (error) {
    console.error('Erro ao carregar pontos:', error.message);
    ocultarPontos();
  }
}

/**
 * Atualizar exibição dos pontos
 */
function atualizarExibicaoPontos() {
  const pontosElement = document.querySelector('.pontos-royal p');
  if (!pontosElement) return;

  if (pontosAtuais > 0) {
    pontosElement.textContent = `${pontosAtuais} pts`;
    pontosElement.parentElement.style.display = 'flex';
    pontosElement.parentElement.style.visibility = 'visible';
    pontosElement.parentElement.style.opacity = '1';
  } else {
    ocultarPontos();
  }
}

/**
 * Ocultar exibição dos pontos
 */
function ocultarPontos() {
  const pontosElement = document.querySelector('.pontos-royal p');
  if (pontosElement && pontosElement.parentElement) {
    pontosElement.parentElement.style.display = 'none';
  }
}

/**
 * Tentar inicializar pontos
 */
function tentarInitPontos() {
  tentativasPontos++;
  
  const pontosElement = document.querySelector('.pontos-royal p');
  if (!pontosElement) {
    if (tentativasPontos < VALIDATION_LIMITS.MAX_RETRY_ATTEMPTS) {
      setTimeout(tentarInitPontos, VALIDATION_LIMITS.RETRY_DELAY);
    }
    return;
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
    
    console.log('Carregando endereço padrão do usuário ID:', usuario.id);
    
    // Buscar endereço padrão
    const endereco = await getDefaultAddress();
    
    if (endereco) {
      console.log('Endereço encontrado:', endereco);
      exibirEndereco(endereco);
    } else {
      console.log('Nenhum endereço padrão encontrado');
      exibirSemEndereco();
    }
  } catch (error) {
    console.error('Erro ao carregar endereço:', error.message);
    exibirSemEndereco();
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
  
  // Adicionar evento de clique para cadastrar endereço
  const enderecoContainer = enderecoElement.parentElement;
  if (enderecoContainer) {
    enderecoContainer.style.cursor = 'pointer';
    enderecoContainer.onclick = () => {
      window.location.href = '../pages/usuario-perfil.html#enderecos';
    };
  }
}

/**
 * Mostrar modal para alterar endereço principal
 */
async function mostrarModalAlterarEndereco(currentAddressId) {
  try {
    console.log('Carregando endereços para alteração...');
    
    // Buscar todos os endereços do usuário
    const enderecos = await getAddresses();
    
    if (enderecos.length <= 1) {
      alert('Você não tem endereços adicionais para alternar.');
      return;
    }
    
    // Criar modal dinamicamente
    const modalHtml = `
      <div id="modal-alterar-endereco" class="modal" style="display: block;">
        <div class="div-overlay" onclick="fecharModalEndereco()"></div>
        <div class="modal-content-metricas">
          <div class="header-modal">
            <i class="fa-solid fa-xmark fechar-modal" onclick="fecharModalEndereco()"></i>
            <h2>Alterar Endereço Principal</h2>
          </div>
          
          <div class="conteudo-modal">
            <p>Selecione um endereço para definir como principal:</p>
            <div id="lista-enderecos-alteracao">
              ${enderecos.map(endereco => `
                <div class="endereco-item" data-address-id="${endereco.id}" style="padding: 10px; border: 1px solid #ddd; margin-bottom: 10px; border-radius: 5px; cursor: pointer; ${endereco.id === currentAddressId ? 'background-color: #f0f0f0;' : ''}">
                  <strong>${endereco.street}, ${endereco.number || 'S/N'}</strong>
                  ${endereco.complement ? `<br><small>${endereco.complement}</small>` : ''}
                  <br>
                  <small>${endereco.neighborhood} - ${endereco.city}/${endereco.state}</small>
                  <br>
                  <small>CEP: ${formatarCEP(endereco.zip_code)}</small>
                  ${endereco.id === currentAddressId ? '<br><span style="color: green; font-weight: bold;">✓ Endereço Atual</span>' : ''}
                </div>
              `).join('')}
            </div>
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
    
    // Adicionar eventos de clique nos itens
    document.querySelectorAll('#lista-enderecos-alteracao .endereco-item').forEach(item => {
      item.addEventListener('click', async () => {
        const addressId = item.getAttribute('data-address-id');
        if (addressId && addressId !== String(currentAddressId)) {
          await alterarEnderecoPrincipal(addressId);
        }
      });
    });
    
  } catch (error) {
    console.error('Erro ao mostrar modal de alteração de endereço:', error.message);
    alert('Erro ao carregar endereços. Tente novamente.');
  }
}

/**
 * Alterar endereço principal
 */
async function alterarEnderecoPrincipal(addressId) {
  try {
    console.log('Alterando endereço principal para ID:', addressId);
    
    await setDefaultAddress(Number(addressId));
    
    console.log('Endereço principal alterado com sucesso');
    
    // Fechar modal
    fecharModalEndereco();
    
    // Recarregar endereço no header
    await carregarEndereco();
    
    // Mostrar mensagem de sucesso
    if (typeof showToast === 'function') {
      showToast('Endereço principal alterado com sucesso!', 'success');
    } else {
      alert('Endereço principal alterado com sucesso!');
    }
    
  } catch (error) {
    console.error('Erro ao alterar endereço principal:', error.message);
    alert('Erro ao alterar endereço principal. Tente novamente.');
  }
}

/**
 * Fechar modal de endereço
 */
function fecharModalEndereco() {
  const modal = document.getElementById('modal-alterar-endereco');
  if (modal) {
    modal.remove();
  }
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
