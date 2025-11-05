// src/js/utils/lazy-loader.js
// Lazy Loading de Scripts - Seção 1.5 da análise de performance

/**
 * Mapa de páginas e seus scripts necessários
 * Define quais scripts devem ser carregados para cada página
 */
const PAGE_SCRIPTS = {
  // Página inicial (home)
  index: {
    required: [
      "utils.js",
      "imports.js",
      "header.js",
      "alerts.js",
      "modais.js",
      "cesta.js",
      "home.js",
    ],
    optional: ["carrossel.js"],
  },
  // Página de produto
  produto: {
    required: [
      "utils.js",
      "imports.js",
      "header.js",
      "alerts.js",
      "modais.js",
      "cesta.js",
    ],
    optional: [],
  },
  // Páginas de autenticação
  login: {
    required: ["utils.js", "imports.js", "header.js", "alerts.js"],
    optional: [],
  },
  cadastro: {
    required: ["utils.js", "imports.js", "header.js", "alerts.js"],
    optional: [],
  },
  "esqueceu-senha": {
    required: ["utils.js", "imports.js", "header.js", "alerts.js"],
    optional: [],
  },
  "verificar-email": {
    required: ["utils.js", "imports.js", "header.js", "alerts.js"],
    optional: [],
  },
  "redefinir-senha": {
    required: ["utils.js", "imports.js", "header.js", "alerts.js"],
    optional: [],
  },
  // Páginas do usuário
  "usuario-perfil": {
    required: ["utils.js", "imports.js", "header.js", "alerts.js", "modais.js"],
    optional: [],
  },
  "hist-pedidos": {
    required: ["utils.js", "imports.js", "header.js", "alerts.js", "modais.js"],
    optional: [],
  },
  "info-pedido": {
    required: ["utils.js", "imports.js", "header.js", "alerts.js", "modais.js"],
    optional: [],
  },
  "clube-royal": {
    required: ["utils.js", "imports.js", "header.js", "alerts.js", "modais.js"],
    optional: [],
  },
  pagamento: {
    required: [
      "utils.js",
      "imports.js",
      "header.js",
      "alerts.js",
      "modais.js",
      "cesta.js",
    ],
    optional: [],
  },
  // Página administrativa
  "painel-adm": {
    required: ["utils.js", "imports.js", "header.js", "alerts.js", "modais.js"],
    optional: [],
    // Scripts admin serão carregados dinamicamente quando necessário
    adminModules: ["admin/painel-adm.js"],
  },
};

/**
 * Detecta a página atual baseado no pathname
 * @returns {string} Nome da página (ex: 'index', 'produto', 'login')
 */
function detectCurrentPage() {
  const path = window.location.pathname.toLowerCase();
  const filename = path.split("/").pop().replace(".html", "") || "index";

  // Mapeamento especial para casos onde o nome do arquivo não corresponde exatamente
  const pageMap = {
    "": "index",
    index: "index",
  };

  return pageMap[filename] || filename;
}

/**
 * Obtém o caminho baseado na localização da página
 * @returns {string} Caminho base para scripts (ex: 'src/js/ui/' ou '../js/ui/')
 */
function getScriptBasePath() {
  const path = window.location.pathname;
  const isInPagesFolder = path.includes("/pages/") || path.includes("pages/");

  if (isInPagesFolder) {
    return "../js/ui/";
  }
  return "src/js/ui/";
}

/**
 * Carrega um script dinamicamente usando tag <script>
 * @param {string} scriptName - Nome do script (ex: 'home.js')
 * @returns {Promise<void>}
 */
async function loadScript(scriptName) {
  try {
    const basePath = getScriptBasePath();
    const scriptPath = `${basePath}${scriptName}`;

    // Carregar usando tag script (compatível com módulos ES6 e scripts tradicionais)
    await loadScriptTag(scriptPath);
  } catch (error) {
    console.error(`Erro ao carregar script ${scriptName}:`, error);
    throw error;
  }
}

/**
 * Carrega um script usando tag <script> (fallback)
 * @param {string} src - Caminho do script
 * @returns {Promise<void>}
 */
function loadScriptTag(src) {
  return new Promise((resolve, reject) => {
    // Verificar se já foi carregado
    const existingScript = document.querySelector(`script[src="${src}"]`);
    if (existingScript) {
      resolve();
      return;
    }

    const script = document.createElement("script");
    script.type = "module";
    script.defer = true;
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () =>
      reject(new Error(`Falha ao carregar script: ${src}`));
    document.head.appendChild(script);
  });
}

/**
 * Carrega módulos administrativos dinamicamente
 * @param {Array<string>} moduleNames - Array com nomes dos módulos admin
 * @returns {Promise<void>}
 */
async function loadAdminModules(moduleNames) {
  const basePath = getScriptBasePath().replace("ui/", "ui/");

  for (const moduleName of moduleNames) {
    try {
      const modulePath = `${basePath}${moduleName}`.replace(".js", "");
      await import(
        modulePath.replace("src/js/", "../").replace("../js/", "../")
      );
    } catch (error) {
      console.warn(`Módulo admin ${moduleName} não pôde ser carregado:`, error);
    }
  }
}

/**
 * Inicializa o lazy loading de scripts baseado na página atual
 * @returns {Promise<void>}
 */
export async function initializeLazyLoading() {
  const currentPage = detectCurrentPage();
  const pageConfig = PAGE_SCRIPTS[currentPage];

  if (!pageConfig) {
    console.warn(
      `Configuração não encontrada para página: ${currentPage}. Carregando scripts padrão.`
    );
    // Fallback: carregar scripts essenciais
    await loadScript("utils.js");
    await loadScript("imports.js");
    await loadScript("header.js");
    await loadScript("alerts.js");
    return;
  }

  // Carregar scripts obrigatórios
  const requiredPromises = pageConfig.required.map((script) =>
    loadScript(script)
  );
  await Promise.all(requiredPromises);

  // Carregar scripts opcionais em background (não bloqueia)
  if (pageConfig.optional && pageConfig.optional.length > 0) {
    pageConfig.optional.forEach((script) => {
      loadScript(script).catch((err) =>
        console.warn(`Script opcional ${script} não pôde ser carregado:`, err)
      );
    });
  }

  // Carregar módulos admin se necessário
  if (pageConfig.adminModules && pageConfig.adminModules.length > 0) {
    // Aguardar um pouco para garantir que a página está pronta
    setTimeout(() => {
      loadAdminModules(pageConfig.adminModules).catch((err) =>
        console.warn("Erro ao carregar módulos admin:", err)
      );
    }, 100);
  }
}

/**
 * Carrega um script sob demanda (útil para ações do usuário)
 * @param {string} scriptPath - Caminho relativo do script (ex: 'ui/modais.js')
 * @returns {Promise<void>}
 */
export async function loadScriptOnDemand(scriptPath) {
  try {
    // Normalizar caminho
    const normalizedPath = scriptPath
      .replace(/^\.\//, "")
      .replace(/^src\/js\//, "../");
    if (!normalizedPath.endsWith(".js")) {
      await import(normalizedPath);
    } else {
      await import(normalizedPath.replace(".js", ""));
    }
  } catch (error) {
    console.error(`Erro ao carregar script sob demanda ${scriptPath}:`, error);
    throw error;
  }
}

// Auto-inicializar quando o módulo for carregado (se não for importado dinamicamente)
if (typeof window !== "undefined" && document.readyState !== "loading") {
  // Apenas auto-inicializar se estivermos na página inicial e não houver scripts já carregados
  const scriptsLoaded = document.querySelectorAll(
    'script[type="module"][src*="js/ui"]'
  ).length;
  if (scriptsLoaded === 0) {
    initializeLazyLoading().catch((err) =>
      console.error("Erro ao inicializar lazy loading:", err)
    );
  }
}
