/**
 * Code Splitter - Sistema de Code Splitting Avançado
 *
 * Gerencia o carregamento dinâmico de módulos baseado em features/páginas,
 * evitando carregar código desnecessário.
 */

/**
 * Cache de módulos já carregados para evitar recarregamento
 */
const loadedModules = new Set();

/**
 * Módulos em carregamento para evitar carregamentos paralelos do mesmo módulo
 */
const loadingModules = new Map();

/**
 * Mapa de features para seus módulos
 */
const FEATURE_MODULES = {
  // Features públicas
  auth: {
    modules: [
      "ui/log-cadas.js",
      "ui/esqueceu-senha.js",
      "ui/redefinir-senha.js",
    ],
    public: true,
  },
  cart: {
    modules: ["ui/cesta.js"],
    public: true,
  },
  products: {
    modules: ["ui/home.js", "ui/produto.js"],
    public: true,
  },
  payment: {
    modules: ["ui/pagamento.js"],
    public: true,
    requires: ["cart"],
  },
  user: {
    modules: [
      "ui/usuario-perfil.js",
      "ui/order-history.js",
      "ui/clube-royal.js",
    ],
    public: false, // Requer autenticação
  },

  // Features administrativas (não carregar em páginas públicas)
  admin: {
    modules: [
      "ui/admin/painel-adm.js",
      "ui/admin/produtos-gerenciamento.js",
      "ui/admin/insumos-gerenciamento.js",
      "ui/admin/usuarios-gerenciamento.js",
      "ui/admin/order-management.js",
      "ui/admin/configuracoes-gerenciamento.js",
      "ui/admin/produto-extras-manager.js",
    ],
    public: false,
    admin: true,
  },
  admin_dashboard: {
    modules: ["ui/admin/painel-adm.js"],
    public: false,
    admin: true,
  },
  admin_products: {
    modules: [
      "ui/admin/produtos-gerenciamento.js",
      "ui/admin/produto-extras-manager.js",
    ],
    public: false,
    admin: true,
  },
  admin_orders: {
    modules: ["ui/admin/order-management.js"],
    public: false,
    admin: true,
  },
  admin_users: {
    modules: ["ui/admin/usuarios-gerenciamento.js"],
    public: false,
    admin: true,
  },
  admin_ingredients: {
    modules: ["ui/admin/insumos-gerenciamento.js"],
    public: false,
    admin: true,
  },
  admin_settings: {
    modules: ["ui/admin/configuracoes-gerenciamento.js"],
    public: false,
    admin: true,
  },
};

/**
 * Módulos base que sempre devem ser carregados
 */
const BASE_MODULES = ["utils.js", "api/api.js", "ui/alerts.js", "ui/header.js"];

/**
 * Carrega um módulo dinamicamente usando dynamic import
 * @param {string} modulePath - Caminho do módulo (ex: 'ui/home.js' ou '../ui/home.js')
 * @returns {Promise<void>}
 */
async function loadModule(modulePath) {
  // Normalizar caminho
  let normalizedPath = modulePath;

  // Se já foi carregado, retornar imediatamente
  if (loadedModules.has(normalizedPath)) {
    return;
  }

  // Se está em carregamento, aguardar
  if (loadingModules.has(normalizedPath)) {
    return loadingModules.get(normalizedPath);
  }

  // Criar promise de carregamento
  const loadPromise = (async () => {
    try {
      // Normalizar caminho para import
      let importPath = normalizedPath.replace(/\.js$/, "");

      // Se não começa com ./, adicionar ../ ou ./
      if (!importPath.startsWith(".") && !importPath.startsWith("/")) {
        // Determinar se estamos em uma página raiz ou em subpasta
        const isInPagesFolder =
          window.location.pathname.includes("/pages/") ||
          window.location.pathname.includes("pages/");
        importPath = isInPagesFolder
          ? `../js/${importPath}`
          : `./js/${importPath}`;
      }

      // Carregar módulo
      await import(importPath);

      // Marcar como carregado
      loadedModules.add(normalizedPath);
    } catch (error) {
      console.error(`Erro ao carregar módulo ${modulePath}:`, error);
      throw error;
    } finally {
      // Remover do mapa de carregamento
      loadingModules.delete(normalizedPath);
    }
  })();

  // Armazenar promise de carregamento
  loadingModules.set(normalizedPath, loadPromise);

  return loadPromise;
}

/**
 * Carrega múltiplos módulos em paralelo
 * @param {string[]} modulePaths - Array de caminhos de módulos
 * @returns {Promise<void[]>}
 */
async function loadModules(modulePaths) {
  const loadPromises = modulePaths.map((path) => loadModule(path));
  return Promise.all(loadPromises);
}

/**
 * Carrega uma feature completa com suas dependências
 * @param {string} featureName - Nome da feature
 * @param {Object} options - Opções
 * @param {boolean} options.checkAuth - Verificar autenticação antes de carregar (padrão: true)
 * @param {boolean} options.checkAdmin - Verificar se é admin antes de carregar (padrão: true)
 * @returns {Promise<void>}
 */
export async function loadFeature(featureName, options = {}) {
  const { checkAuth = true, checkAdmin = true } = options;

  const feature = FEATURE_MODULES[featureName];
  if (!feature) {
    console.warn(`Feature "${featureName}" não encontrada`);
    return;
  }

  // Verificar se é feature pública
  if (!feature.public && checkAuth) {
    // Verificar autenticação
    const token = localStorage.getItem("rb.token");
    if (!token) {
      console.warn(
        `Feature "${featureName}" requer autenticação. Usuário não autenticado.`
      );
      return;
    }
  }

  // Verificar se é feature admin
  if (feature.admin && checkAdmin) {
    // Verificar se é admin (pode ser verificado no header ou estado)
    const user = JSON.parse(localStorage.getItem("rb.user") || "null");
    if (!user || (user.role !== "admin" && user.role !== "manager")) {
      console.warn(
        `Feature "${featureName}" requer permissões de administrador.`
      );
      return;
    }
  }

  // Carregar dependências primeiro
  if (feature.requires) {
    for (const requiredFeature of feature.requires) {
      await loadFeature(requiredFeature, options);
    }
  }

  // Carregar módulos da feature
  await loadModules(feature.modules);
}

/**
 * Carrega módulos base necessários para todas as páginas
 * @returns {Promise<void>}
 */
export async function loadBaseModules() {
  const basePaths = BASE_MODULES.map((module) => {
    // Normalizar caminho baseado na localização da página
    const isInPagesFolder =
      window.location.pathname.includes("/pages/") ||
      window.location.pathname.includes("pages/");
    if (module.startsWith("ui/")) {
      return isInPagesFolder ? `../${module}` : `./${module}`;
    } else if (module.startsWith("api/")) {
      return isInPagesFolder ? `../js/${module}` : `./js/${module}`;
    } else {
      return isInPagesFolder ? `../js/${module}` : `./js/${module}`;
    }
  });

  await loadModules(basePaths);
}

/**
 * Carrega módulos baseado na página atual
 * @returns {Promise<void>}
 */
export async function loadPageModules() {
  const path = window.location.pathname.toLowerCase();
  const filename = path.split("/").pop().replace(".html", "") || "index";

  // Carregar módulos base primeiro
  await loadBaseModules();

  // Mapear página para features
  const pageToFeatures = {
    index: ["products"],
    produto: ["products", "cart"],
    "log-cadas": ["auth"],
    "esqueceu-senha": ["auth"],
    "redefinir-senha": ["auth"],
    "verificar-email": ["auth"],
    "usuario-perfil": ["user"],
    "hist-pedidos": ["user"],
    "info-pedido": ["user"],
    "clube-royal": ["user"],
    pagamento: ["payment"],
    "painel-adm": ["admin_dashboard"],
  };

  const features = pageToFeatures[filename] || [];

  // Carregar features da página
  for (const feature of features) {
    try {
      await loadFeature(feature);
    } catch (error) {
      console.warn(`Erro ao carregar feature "${feature}":`, error);
    }
  }
}

/**
 * Carrega módulos admin sob demanda
 * @param {string} adminFeature - Nome da feature admin (ex: 'admin_products')
 * @returns {Promise<void>}
 */
export async function loadAdminFeature(adminFeature) {
  // Verificar se começa com 'admin_'
  if (!adminFeature.startsWith("admin_")) {
    adminFeature = `admin_${adminFeature}`;
  }

  await loadFeature(adminFeature, { checkAuth: true, checkAdmin: true });
}

/**
 * Verifica se um módulo já foi carregado
 * @param {string} modulePath - Caminho do módulo
 * @returns {boolean} True se o módulo foi carregado
 */
export function isModuleLoaded(modulePath) {
  return loadedModules.has(modulePath);
}

/**
 * Limpa cache de módulos carregados (útil para testes)
 */
export function clearModuleCache() {
  loadedModules.clear();
  loadingModules.clear();
}

/**
 * Obtém lista de módulos carregados
 * @returns {string[]} Array de caminhos de módulos carregados
 */
export function getLoadedModules() {
  return Array.from(loadedModules);
}
