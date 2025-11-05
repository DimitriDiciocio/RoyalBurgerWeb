#!/usr/bin/env node
// css-build-helper.js
// Script helper para combinar e minificar CSS para produção
// Uso: node css-build-helper.js [comando] [opções]
// Comandos: minify, combine, optimize

const fs = require("fs");
const path = require("path");

// Função de minificação de CSS
function minifyCSS(css) {
  if (!css) return "";

  return css
    .replace(/\/\*[\s\S]*?\*\//g, "") // Remove comentários
    .replace(/\s*([{}:;,>+~])\s*/g, "$1") // Remove espaços ao redor de caracteres especiais
    .replace(/\s+/g, " ") // Remove espaços extras
    .replace(/^\s+|\s+$/gm, "") // Remove espaços no início/fim de linhas
    .replace(/\n/g, "") // Remove quebras de linha
    .replace(/\s*{\s*/g, "{") // Remove espaços ao redor de {
    .replace(/\s*}\s*/g, "}") // Remove espaços ao redor de }
    .replace(/\s*;\s*/g, ";") // Remove espaços ao redor de ;
    .replace(/\s*:\s*/g, ":") // Remove espaços ao redor de :
    .replace(/\s*,\s*/g, ",") // Remove espaços ao redor de ,
    .replace(/;}/g, "}") // Remove último ; antes de }
    .trim();
}

// Função para combinar CSS
function combineCSS(cssContents, minify = false) {
  let combined = cssContents.join("\n\n");
  return minify ? minifyCSS(combined) : combined;
}

// Função para minificar um arquivo
function minifyFile(inputPath, outputPath) {
  try {
    const css = fs.readFileSync(inputPath, "utf8");
    const minified = minifyCSS(css);
    fs.writeFileSync(outputPath, minified, "utf8");
    const originalSize = fs.statSync(inputPath).size;
    const minifiedSize = fs.statSync(outputPath).size;
    const reduction = ((1 - minifiedSize / originalSize) * 100).toFixed(2);
    console.log(`✓ Minificado: ${path.basename(inputPath)}`);
    console.log(
      `  ${originalSize} bytes -> ${minifiedSize} bytes (${reduction}% redução)`
    );
    return { originalSize, minifiedSize, reduction };
  } catch (error) {
    console.error(`✗ Erro ao minificar ${inputPath}:`, error.message);
    return null;
  }
}

// Função para combinar arquivos base (comum a todas as páginas)
function combineBaseCSS(outputPath, minify = false) {
  const baseDir = path.join(__dirname, "src", "assets", "styles");
  const baseFiles = ["header.css", "global.css", "footer.css"];

  const cssContents = baseFiles.map((file) => {
    const filePath = path.join(baseDir, file);
    return `/* === ${file} === */\n${fs.readFileSync(filePath, "utf8")}`;
  });

  const combined = combineCSS(cssContents, minify);
  fs.writeFileSync(outputPath, combined, "utf8");

  console.log(
    `✓ Combinado ${baseFiles.length} arquivos base em: ${path.basename(
      outputPath
    )}`
  );
  return combined;
}

// Função para otimizar todos os arquivos CSS
function optimizeAllCSS() {
  const stylesDir = path.join(__dirname, "src", "assets", "styles");
  const outputDir = path.join(__dirname, "src", "assets", "styles", "minified");

  // Criar diretório de saída se não existir
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Ler todos os arquivos CSS
  const files = fs
    .readdirSync(stylesDir)
    .filter((file) => file.endsWith(".css"));

  console.log(`\n🔧 Otimizando ${files.length} arquivos CSS...\n`);

  let totalOriginal = 0;
  let totalMinified = 0;

  files.forEach((file) => {
    const inputPath = path.join(stylesDir, file);
    const outputPath = path.join(outputDir, file.replace(".css", ".min.css"));
    const result = minifyFile(inputPath, outputPath);
    if (result) {
      totalOriginal += result.originalSize;
      totalMinified += result.minifiedSize;
    }
  });

  // Combinar arquivos base
  const baseCombinedPath = path.join(outputDir, "base-combined.min.css");
  combineBaseCSS(baseCombinedPath, true);

  const totalReduction = ((1 - totalMinified / totalOriginal) * 100).toFixed(2);
  console.log(`\n📊 Resumo:`);
  console.log(
    `  Total original: ${totalOriginal} bytes (${(totalOriginal / 1024).toFixed(
      2
    )} KB)`
  );
  console.log(
    `  Total minificado: ${totalMinified} bytes (${(
      totalMinified / 1024
    ).toFixed(2)} KB)`
  );
  console.log(`  Redução total: ${totalReduction}%`);
  console.log(`\n✓ Arquivos minificados salvos em: ${outputDir}\n`);
}

// Processar argumentos da linha de comando
const command = process.argv[2];
const args = process.argv.slice(3);

switch (command) {
  case "minify":
    if (args.length < 1) {
      console.error(
        "Uso: node css-build-helper.js minify <arquivo.css> [arquivo-saida.css]"
      );
      process.exit(1);
    }
    const inputFile = args[0];
    const outputFile = args[1] || inputFile.replace(".css", ".min.css");
    minifyFile(inputFile, outputFile);
    break;

  case "combine":
    if (args.length < 2) {
      console.error(
        "Uso: node css-build-helper.js combine <arquivo1.css> <arquivo2.css> ... <arquivo-saida.css>"
      );
      process.exit(1);
    }
    const inputFiles = args.slice(0, -1);
    const outputFile2 = args[args.length - 1];
    const contents = inputFiles.map((file) => fs.readFileSync(file, "utf8"));
    const combined = combineCSS(contents, true);
    fs.writeFileSync(outputFile2, combined, "utf8");
    console.log(`✓ Combinado ${inputFiles.length} arquivos em: ${outputFile2}`);
    break;

  case "optimize":
  case "optimize-all":
    optimizeAllCSS();
    break;

  case "base":
    const baseOutput =
      args[0] ||
      path.join(
        __dirname,
        "src",
        "assets",
        "styles",
        "minified",
        "base-combined.min.css"
      );
    const minify = args[1] !== "false";
    combineBaseCSS(baseOutput, minify);
    break;

  default:
    console.log(`
🔧 CSS Build Helper - RoyalBurger Web

Comandos disponíveis:

  minify <arquivo.css> [saida.css]
    Minifica um arquivo CSS
    
  combine <arquivo1.css> <arquivo2.css> ... <saida.css>
    Combina múltiplos arquivos CSS em um
    
  optimize-all
    Minifica todos os arquivos CSS em src/assets/styles/
    e cria versões minificadas em src/assets/styles/minified/
    
  base [saida.css] [minify=true]
    Combina arquivos base (header.css, global.css, footer.css)

Exemplos:

  node css-build-helper.js minify src/assets/styles/global.css
  node css-build-helper.js optimize-all
  node css-build-helper.js base src/assets/styles/base.min.css true
`);
    break;
}
