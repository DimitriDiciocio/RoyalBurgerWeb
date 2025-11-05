// src/js/utils/image-loader.js
// Lazy Loading de Imagens - Seção 1.5 e 1.10 da análise de performance

/**
 * Configura lazy loading para imagens usando IntersectionObserver
 * @param {string} selector - Seletor CSS para imagens (padrão: 'img[data-src]')
 * @param {Object} options - Opções do IntersectionObserver
 */
export function initLazyLoadingImages(
  selector = "img[data-src]",
  options = {}
) {
  // Verificar se IntersectionObserver está disponível
  if (!("IntersectionObserver" in window)) {
    // Fallback: carregar todas as imagens de uma vez
    console.warn(
      "IntersectionObserver não disponível. Carregando todas as imagens."
    );
    const images = document.querySelectorAll(selector);
    images.forEach((img) => {
      if (img.dataset.src) {
        img.src = img.dataset.src;
        img.removeAttribute("data-src");
      }
    });
    return;
  }

  const defaultOptions = {
    root: null, // viewport
    rootMargin: "50px", // Começar a carregar 50px antes de entrar no viewport
    threshold: 0.01,
  };

  const observerOptions = { ...defaultOptions, ...options };

  const imageObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        const img = entry.target;

        // Adicionar classe de loading se necessário
        img.classList.add("lazy-loading");

        // Criar nova imagem para verificar se carrega corretamente
        const imageLoader = new Image();

        imageLoader.onload = () => {
          img.src = img.dataset.src;
          if (img.dataset.srcset) {
            img.srcset = img.dataset.srcset;
          }
          img.removeAttribute("data-src");
          img.removeAttribute("data-srcset");
          img.classList.remove("lazy-loading");
          img.classList.add("lazy-loaded");
          observer.unobserve(img);
        };

        imageLoader.onerror = () => {
          console.warn(`Erro ao carregar imagem: ${img.dataset.src}`);
          img.classList.remove("lazy-loading");
          img.classList.add("lazy-error");
          // Manter placeholder ou mostrar imagem de erro
          if (img.dataset.error) {
            img.src = img.dataset.error;
          }
          observer.unobserve(img);
        };

        // Iniciar carregamento
        imageLoader.src = img.dataset.src;
      }
    });
  }, observerOptions);

  // Observar todas as imagens com data-src
  const images = document.querySelectorAll(selector);
  images.forEach((img) => {
    // Adicionar placeholder se não houver
    if (!img.src && !img.getAttribute("src")) {
      // Usar data URI de um pixel transparente ou um placeholder
      img.src =
        'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"%3E%3C/svg%3E';
    }
    imageObserver.observe(img);
  });
}

/**
 * Adiciona lazy loading nativo do navegador usando atributo loading="lazy"
 * @param {string} selector - Seletor CSS para imagens (padrão: 'img')
 */
export function addNativeLazyLoading(selector = "img") {
  const images = document.querySelectorAll(selector);
  images.forEach((img) => {
    // Apenas adicionar se não tiver o atributo já e não for imagem crítica (above the fold)
    if (!img.hasAttribute("loading") && !img.closest(".carrossel")) {
      img.loading = "lazy";
    }
  });
}

/**
 * Inicializa lazy loading automático para todas as imagens
 */
export function initAutoLazyLoading() {
  // Usar IntersectionObserver para imagens com data-src (controle fino)
  initLazyLoadingImages("img[data-src]");

  // Usar loading="lazy" nativo para outras imagens (mais simples, menos controle)
  addNativeLazyLoading("img:not([data-src]):not([loading])");
}

// Auto-inicializar quando DOM estiver pronto
if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAutoLazyLoading);
  } else {
    initAutoLazyLoading();
  }
}
