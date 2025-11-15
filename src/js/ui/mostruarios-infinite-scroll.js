/**
 * Mostruários - Rolagem infinita para mostruários horizontal e vertical
 * Adiciona funcionalidade de rolagem infinita e arrastar aos produtos existentes
 */

/**
 * Inicializa todos os mostruários
 * Adiciona rolagem infinita e funcionalidade de arrastar aos produtos existentes
 */
export function initMostruariosInfiniteScroll() {
  // ALTERAÇÃO: Aguardar um pouco para garantir que home.js já carregou produtos
  const initWithDelay = () => {
    setTimeout(() => {
      addInfiniteScrollToExisting();
    }, 500); // Aguardar 500ms para home.js carregar produtos
  };
  
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initWithDelay);
  } else {
    initWithDelay();
  }
}

/**
 * Adiciona rolagem infinita aos produtos já carregados pelo home.js
 */
function addInfiniteScrollToExisting() {
  // Adicionar rolagem infinita horizontal aos containers existentes
  const containers = document.querySelectorAll(".mostruario-horizontal .container");
  containers.forEach((container) => {
    const rolagem = container.querySelector(".rolagem");
    if (!rolagem || rolagem.children.length === 0) return;
    
    // Adicionar funcionalidade de arrastar
    addDragToScroll(rolagem);
    
    // Adicionar rolagem infinita (clonando produtos existentes)
    addInfiniteScrollHorizontal(rolagem);
  });
  
  // Adicionar rolagem infinita vertical
  const rolagemInfinita = document.querySelector(".mostruario-vertical .rolagem-infinita");
  if (rolagemInfinita && rolagemInfinita.children.length > 0) {
    addInfiniteScrollVertical(rolagemInfinita);
  }
}

/**
 * Adiciona funcionalidade de arrastar para scroll
 */
function addDragToScroll(rolagem) {
  let estaArrastando = false;
  let posicaoInicialX = 0;
  let scrollInicial = 0;

  function iniciarArrasto(evento) {
    const link = evento.target.closest("a");
    if (link) return;
    
    estaArrastando = true;
    posicaoInicialX = evento.pageX || evento.originalEvent?.touches?.[0]?.pageX || 0;
    scrollInicial = rolagem.scrollLeft;
    rolagem.style.cursor = "grabbing";
    rolagem.style.userSelect = "none";
    evento.preventDefault();
  }

  function duranteArrasto(evento) {
    if (!estaArrastando) return;
    const posicaoAtualX = evento.pageX || evento.originalEvent?.touches?.[0]?.pageX || 0;
    const deltaX = posicaoInicialX - posicaoAtualX;
    rolagem.scrollLeft = scrollInicial + deltaX;
    evento.preventDefault();
  }

  function finalizarArrasto() {
    estaArrastando = false;
    rolagem.style.cursor = "grab";
    rolagem.style.userSelect = "";
  }

  rolagem.addEventListener("mousedown", iniciarArrasto);
  document.addEventListener("mousemove", duranteArrasto);
  document.addEventListener("mouseup", finalizarArrasto);
  rolagem.addEventListener("touchstart", iniciarArrasto, { passive: false });
  document.addEventListener("touchmove", duranteArrasto, { passive: false });
  document.addEventListener("touchend", finalizarArrasto);
}

/**
 * Adiciona rolagem infinita horizontal clonando produtos existentes
 */
function addInfiniteScrollHorizontal(rolagem) {
  let isScrolling = false;
  let scrollTimeout = null;
  const itemWidth = 275; // Largura do produto + gap (250px + 25px)

  function checkInfiniteScroll() {
    if (isScrolling) return;
    
    if (scrollTimeout) clearTimeout(scrollTimeout);
    
    scrollTimeout = setTimeout(() => {
      const scrollLeft = rolagem.scrollLeft;
      const scrollWidth = rolagem.scrollWidth;
      const clientWidth = rolagem.clientWidth;

      // Se chegou perto do final, clonar primeiros produtos e adicionar no final
      if (scrollLeft + clientWidth >= scrollWidth - itemWidth * 3) {
        isScrolling = true;
        const currentScroll = rolagem.scrollLeft;
        // Clonar os primeiros produtos e adicionar no final
        const firstProducts = Array.from(rolagem.children).slice(0, 5);
        firstProducts.forEach(product => {
          const clone = product.cloneNode(true);
          rolagem.appendChild(clone);
        });
        
        requestAnimationFrame(() => {
          rolagem.scrollLeft = currentScroll;
          isScrolling = false;
        });
      }

      // Se chegou perto do início, clonar últimos produtos e adicionar no início
      if (scrollLeft <= itemWidth * 3) {
        isScrolling = true;
        const currentScroll = rolagem.scrollLeft;
        // Clonar os últimos produtos e adicionar no início
        const lastProducts = Array.from(rolagem.children).slice(-5);
        const oldScrollWidth = rolagem.scrollWidth;
        lastProducts.reverse().forEach(product => {
          const clone = product.cloneNode(true);
          rolagem.insertBefore(clone, rolagem.firstChild);
        });
        
        requestAnimationFrame(() => {
          const newScrollWidth = rolagem.scrollWidth;
          rolagem.scrollLeft = currentScroll + (newScrollWidth - oldScrollWidth);
          isScrolling = false;
        });
      }
    }, 100);
  }

  rolagem.addEventListener("scroll", checkInfiniteScroll, { passive: true });
}

/**
 * Adiciona rolagem infinita vertical clonando produtos existentes
 */
function addInfiniteScrollVertical(rolagemInfinita) {
  let isScrolling = false;
  let scrollTimeout = null;
  const itemHeight = 190; // Altura aproximada de uma dupla + padding

  function checkInfiniteScroll() {
    if (isScrolling) return;

    if (scrollTimeout) clearTimeout(scrollTimeout);
    
    scrollTimeout = setTimeout(() => {
      const scrollTop = rolagemInfinita.scrollTop;
      const scrollHeight = rolagemInfinita.scrollHeight;
      const clientHeight = rolagemInfinita.clientHeight;

      // Se chegou perto do final, clonar primeiras duplas e adicionar no final
      if (scrollTop + clientHeight >= scrollHeight - itemHeight * 4) {
        isScrolling = true;
        const currentScroll = rolagemInfinita.scrollTop;
        // Clonar as primeiras duplas e adicionar no final
        const firstDuplas = Array.from(rolagemInfinita.children).slice(0, 5);
        firstDuplas.forEach(dupla => {
          const clone = dupla.cloneNode(true);
          rolagemInfinita.appendChild(clone);
        });
        
        requestAnimationFrame(() => {
          rolagemInfinita.scrollTop = currentScroll;
          isScrolling = false;
        });
      }

      // Se chegou perto do início, clonar últimas duplas e adicionar no início
      if (scrollTop <= itemHeight * 4) {
        isScrolling = true;
        const currentScroll = rolagemInfinita.scrollTop;
        // Clonar as últimas duplas e adicionar no início
        const lastDuplas = Array.from(rolagemInfinita.children).slice(-5);
        const oldScrollHeight = rolagemInfinita.scrollHeight;
        lastDuplas.reverse().forEach(dupla => {
          const clone = dupla.cloneNode(true);
          rolagemInfinita.insertBefore(clone, rolagemInfinita.firstChild);
        });
        
        requestAnimationFrame(() => {
          const newScrollHeight = rolagemInfinita.scrollHeight;
          rolagemInfinita.scrollTop = currentScroll + (newScrollHeight - oldScrollHeight);
          isScrolling = false;
        });
      }
    }, 100);
  }

  rolagemInfinita.addEventListener("scroll", checkInfiniteScroll, { passive: true });
}

// ALTERAÇÃO: Auto-inicializar se o arquivo for carregado diretamente
if (typeof window !== "undefined") {
  initMostruariosInfiniteScroll();
}

