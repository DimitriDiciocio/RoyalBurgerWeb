// src/js/utils/css-optimizer.js
// Otimização de CSS - Seção 4.1 da análise de performance

/**
 * Minifica CSS removendo comentários e espaços desnecessários
 * @param {string} css - CSS a ser minificado
 * @returns {string} CSS minificado
 */
export function minifyCSS(css) {
  if (!css) return "";

  return (
    css
      // Remove comentários CSS (/* ... */)
      .replace(/\/\*[\s\S]*?\*\//g, "")
      // Remove espaços em branco antes e depois de caracteres especiais
      .replace(/\s*([{}:;,>+~])\s*/g, "$1")
      // Remove espaços em branco extras
      .replace(/\s+/g, " ")
      // Remove espaços em branco no início e fim de linhas
      .replace(/^\s+|\s+$/gm, "")
      // Remove quebras de linha desnecessárias
      .replace(/\n/g, "")
      // Remove espaços antes de { e depois de }
      .replace(/\s*{\s*/g, "{")
      .replace(/\s*}\s*/g, "}")
      // Remove espaços antes de ; e :
      .replace(/\s*;\s*/g, ";")
      .replace(/\s*:\s*/g, ":")
      // Remove espaços antes e depois de vírgulas
      .replace(/\s*,\s*/g, ",")
      // Remove último ponto e vírgula antes de }
      .replace(/;}/g, "}")
      // Remove espaços extras
      .trim()
  );
}

/**
 * Combina múltiplos arquivos CSS em um único arquivo
 * @param {Array<string>} cssContents - Array de strings CSS
 * @param {Object} options - Opções de combinação
 * @returns {string} CSS combinado
 */
export function combineCSS(cssContents, options = {}) {
  const { minify = false, addSourceComments = true } = options;

  let combined = "";

  cssContents.forEach((content, index) => {
    if (addSourceComments && cssContents.length > 1) {
      combined += `\n/* Source ${index + 1} */\n`;
    }
    combined += content;
    if (index < cssContents.length - 1) {
      combined += "\n\n";
    }
  });

  return minify ? minifyCSS(combined) : combined;
}

/**
 * Carrega CSS de forma assíncrona
 * @param {string} href - URL do arquivo CSS
 * @param {string} media - Media query (padrão: 'all')
 * @returns {Promise<void>}
 */
export function loadCSSAsync(href, media = "all") {
  return new Promise((resolve, reject) => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.media = media;
    link.onload = () => resolve();
    link.onerror = () => reject(new Error(`Failed to load CSS: ${href}`));
    document.head.appendChild(link);
  });
}

/**
 * Pré-carrega CSS crítico
 * @param {string} href - URL do arquivo CSS
 */
export function preloadCriticalCSS(href) {
  const link = document.createElement("link");
  link.rel = "preload";
  link.as = "style";
  link.href = href;
  link.onload = function () {
    // Converte preload em stylesheet após carregar
    this.rel = "stylesheet";
  };
  document.head.appendChild(link);
}

/**
 * Otimiza carregamento de CSS para uma página
 * Carrega CSS crítico imediatamente e defer CSS não-crítico
 * @param {Array<string>} criticalCSS - Array de URLs de CSS crítico
 * @param {Array<string>} nonCriticalCSS - Array de URLs de CSS não-crítico
 */
export function optimizeCSSLoading(criticalCSS = [], nonCriticalCSS = []) {
  // CSS crítico já deve estar no HTML, apenas garantir preload se necessário
  criticalCSS.forEach((href) => {
    const existingLink = document.querySelector(`link[href="${href}"]`);
    if (!existingLink) {
      preloadCriticalCSS(href);
    }
  });

  // Carregar CSS não-crítico após DOM estar pronto
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      nonCriticalCSS.forEach((href) => loadCSSAsync(href).catch(console.error));
    });
  } else {
    nonCriticalCSS.forEach((href) => loadCSSAsync(href).catch(console.error));
  }
}

// Se executando em Node.js (para uso como script CLI)
if (typeof module !== "undefined" && module.exports) {
  const fs = require("fs");
  const path = require("path");

  /**
   * Minifica um arquivo CSS
   * @param {string} inputPath - Caminho do arquivo de entrada
   * @param {string} outputPath - Caminho do arquivo de saída (opcional)
   * @returns {string} CSS minificado
   */
  function minifyCSSFile(inputPath, outputPath = null) {
    const css = fs.readFileSync(inputPath, "utf8");
    const minified = minifyCSS(css);

    if (outputPath) {
      fs.writeFileSync(outputPath, minified, "utf8");
      console.log(`Minified: ${inputPath} -> ${outputPath}`);
    }

    return minified;
  }

  /**
   * Combina múltiplos arquivos CSS em um
   * @param {Array<string>} inputPaths - Array de caminhos de entrada
   * @param {string} outputPath - Caminho do arquivo de saída
   * @param {Object} options - Opções
   */
  function combineCSSFiles(inputPaths, outputPath, options = {}) {
    const cssContents = inputPaths.map((path) => fs.readFileSync(path, "utf8"));
    const combined = combineCSS(cssContents, options);
    fs.writeFileSync(outputPath, combined, "utf8");
    console.log(`Combined ${inputPaths.length} files -> ${outputPath}`);
  }

  module.exports = {
    minifyCSS,
    combineCSS,
    minifyCSSFile,
    combineCSSFiles,
  };
}
