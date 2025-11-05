// src/js/utils/virtual-scroll.js
// Virtual Scrolling e Renderização Incremental - Seção 1.6 da análise de performance

/**
 * Renderiza uma lista grande de forma incremental usando chunks
 * Evita bloquear a UI ao renderizar muitos itens de uma vez
 * @param {HTMLElement} container - Container onde os itens serão renderizados
 * @param {Array} items - Array de itens a serem renderizados
 * @param {Function} templateFn - Função que retorna HTML string para um item: (item, index) => string
 * @param {Object} options - Opções de configuração
 * @param {number} options.chunkSize - Quantidade de itens por chunk (padrão: 20)
 * @param {number} options.delay - Delay entre chunks em ms (padrão: 0)
 * @param {Function} options.onProgress - Callback de progresso: (rendered, total) => void
 * @returns {Promise<void>}
 */
export function renderListInChunks(container, items, templateFn, options = {}) {
  return new Promise((resolve) => {
    if (!container) {
      console.warn("renderListInChunks: container é null ou undefined");
      resolve();
      return;
    }

    if (!Array.isArray(items) || items.length === 0) {
      container.innerHTML = "";
      resolve();
      return;
    }

    const { chunkSize = 20, delay = 0, onProgress = null } = options;

    let currentIndex = 0;
    const fragment = document.createDocumentFragment();
    const tempDiv = document.createElement("div");

    function renderChunk() {
      const endIndex = Math.min(currentIndex + chunkSize, items.length);

      // Renderizar chunk atual
      for (let i = currentIndex; i < endIndex; i++) {
        const html = templateFn(items[i], i);
        tempDiv.innerHTML = html;
        while (tempDiv.firstChild) {
          fragment.appendChild(tempDiv.firstChild.cloneNode(true));
        }
      }

      // Se completou todos os itens, adicionar ao DOM de uma vez
      if (endIndex >= items.length) {
        container.innerHTML = "";
        container.appendChild(fragment);
        if (onProgress) {
          onProgress(items.length, items.length);
        }
        resolve();
        return;
      }

      // Atualizar progresso
      currentIndex = endIndex;
      if (onProgress) {
        onProgress(currentIndex, items.length);
      }

      // Continuar com próximo chunk
      if (delay > 0) {
        setTimeout(renderChunk, delay);
      } else {
        // Usar requestAnimationFrame para não bloquear a UI
        requestAnimationFrame(renderChunk);
      }
    }

    // Iniciar renderização
    renderChunk();
  });
}

/**
 * Virtual Scrolling - Renderiza apenas itens visíveis + buffer
 * Útil para listas muito grandes (>100 itens)
 * @param {HTMLElement} container - Container scrollável
 * @param {HTMLElement} itemsContainer - Container dos itens
 * @param {Array} items - Array completo de itens
 * @param {Function} templateFn - Função que retorna HTML string para um item
 * @param {Object} options - Opções de configuração
 * @param {number} options.itemHeight - Altura estimada de cada item em pixels (padrão: 100)
 * @param {number} options.bufferSize - Quantidade de itens extras a renderizar fora da viewport (padrão: 5)
 * @param {Function} options.getItemHeight - Função para obter altura real de um item: (index) => number
 * @returns {Object} Objeto com método cleanup()
 */
export function createVirtualScroller(
  container,
  itemsContainer,
  items,
  templateFn,
  options = {}
) {
  if (!container || !itemsContainer || !items || items.length === 0) {
    return { cleanup: () => {} };
  }

  const { itemHeight = 100, bufferSize = 5, getItemHeight = null } = options;

  let scrollTop = 0;
  let containerHeight = container.clientHeight;
  let visibleRange = { start: 0, end: 0 };
  let renderedItems = new Set();

  // Calcular altura total do container
  const totalHeight = getItemHeight
    ? items.reduce((sum, _, idx) => sum + getItemHeight(idx), 0)
    : items.length * itemHeight;

  // Criar spacer para altura total
  const topSpacer = document.createElement("div");
  topSpacer.style.height = "0px";
  topSpacer.style.transition = "height 0.1s";
  itemsContainer.insertBefore(topSpacer, itemsContainer.firstChild);

  const bottomSpacer = document.createElement("div");
  bottomSpacer.style.height = `${Math.max(0, totalHeight)}px`;
  itemsContainer.appendChild(bottomSpacer);

  function calculateVisibleRange() {
    const start = Math.max(0, Math.floor(scrollTop / itemHeight) - bufferSize);
    const end = Math.min(
      items.length - 1,
      Math.ceil((scrollTop + containerHeight) / itemHeight) + bufferSize
    );

    return { start, end };
  }

  function renderVisibleItems() {
    const newRange = calculateVisibleRange();

    // Verificar se precisa atualizar
    if (
      newRange.start === visibleRange.start &&
      newRange.end === visibleRange.end
    ) {
      return;
    }

    visibleRange = newRange;

    // Remover itens fora da range visível
    const itemsToRemove = [];
    renderedItems.forEach((index) => {
      if (index < newRange.start || index > newRange.end) {
        itemsToRemove.push(index);
        const element = itemsContainer.querySelector(
          `[data-virtual-index="${index}"]`
        );
        if (element) {
          element.remove();
        }
      }
    });
    itemsToRemove.forEach((idx) => renderedItems.delete(idx));

    // Renderizar novos itens visíveis
    const fragment = document.createDocumentFragment();
    const tempDiv = document.createElement("div");

    for (let i = newRange.start; i <= newRange.end; i++) {
      if (!renderedItems.has(i)) {
        const html = templateFn(items[i], i);
        tempDiv.innerHTML = html;
        const element = tempDiv.firstChild;
        if (element) {
          element.setAttribute("data-virtual-index", i);
          const actualHeight = getItemHeight ? getItemHeight(i) : itemHeight;
          element.style.position = "absolute";
          element.style.top = `${i * itemHeight}px`;
          element.style.width = "100%";
          fragment.appendChild(element);
          renderedItems.add(i);
        }
      }
    }

    // Atualizar spacers
    const topSpacerHeight = newRange.start * itemHeight;
    topSpacer.style.height = `${topSpacerHeight}px`;

    const bottomStart = newRange.end + 1;
    const bottomSpacerHeight = Math.max(
      0,
      (items.length - bottomStart) * itemHeight
    );
    bottomSpacer.style.height = `${bottomSpacerHeight}px`;

    if (fragment.children.length > 0) {
      itemsContainer.insertBefore(fragment, bottomSpacer);
    }
  }

  function handleScroll() {
    scrollTop = container.scrollTop;
    containerHeight = container.clientHeight;
    renderVisibleItems();
  }

  // Throttle scroll handler
  let scrollTimeout = null;
  const throttledScroll = () => {
    if (scrollTimeout) {
      cancelAnimationFrame(scrollTimeout);
    }
    scrollTimeout = requestAnimationFrame(() => {
      handleScroll();
      scrollTimeout = null;
    });
  };

  // Inicializar
  container.addEventListener("scroll", throttledScroll, { passive: true });

  // Renderizar itens iniciais
  scrollTop = container.scrollTop;
  containerHeight = container.clientHeight;
  renderVisibleItems();

  // Cleanup function
  return {
    cleanup: () => {
      container.removeEventListener("scroll", throttledScroll);
      if (scrollTimeout) {
        cancelAnimationFrame(scrollTimeout);
      }
      renderedItems.clear();
    },
    update: (newItems) => {
      items = newItems;
      renderedItems.clear();
      itemsContainer.innerHTML = "";
      itemsContainer.appendChild(topSpacer);
      itemsContainer.appendChild(bottomSpacer);
      renderVisibleItems();
    },
  };
}

/**
 * Renderização incremental simples com Intersection Observer
 * Renderiza itens conforme vão entrando no viewport
 * @param {HTMLElement} container - Container onde os itens serão renderizados
 * @param {Array} items - Array de itens
 * @param {Function} templateFn - Função que retorna HTML string
 * @param {Object} options - Opções
 * @param {number} options.initialCount - Quantidade inicial de itens a renderizar (padrão: 20)
 * @param {number} options.loadMoreCount - Quantidade de itens a carregar por vez (padrão: 10)
 * @param {HTMLElement} options.sentinel - Elemento sentinela para detectar scroll (criado automaticamente se não fornecido)
 * @returns {Object} Objeto com método cleanup() e loadMore()
 */
export function createIncrementalRenderer(
  container,
  items,
  templateFn,
  options = {}
) {
  if (!container || !items || items.length === 0) {
    return { cleanup: () => {}, loadMore: () => {} };
  }

  const { initialCount = 20, loadMoreCount = 10, sentinel = null } = options;

  let renderedCount = Math.min(initialCount, items.length);
  let observer = null;
  let sentinelElement = sentinel;

  function renderItems(count) {
    if (count >= items.length) {
      // Renderizar todos os itens restantes
      const fragment = document.createDocumentFragment();
      const tempDiv = document.createElement("div");

      for (let i = renderedCount; i < items.length; i++) {
        const html = templateFn(items[i], i);
        tempDiv.innerHTML = html;
        while (tempDiv.firstChild) {
          fragment.appendChild(tempDiv.firstChild.cloneNode(true));
        }
      }

      container.appendChild(fragment);

      // Remover sentinela se existir
      if (sentinelElement && sentinelElement.parentNode) {
        sentinelElement.remove();
      }

      renderedCount = items.length;
      return;
    }

    // Renderizar próximo chunk
    const fragment = document.createDocumentFragment();
    const tempDiv = document.createElement("div");

    for (let i = renderedCount; i < count; i++) {
      const html = templateFn(items[i], i);
      tempDiv.innerHTML = html;
      while (tempDiv.firstChild) {
        fragment.appendChild(tempDiv.firstChild.cloneNode(true));
      }
    }

    container.appendChild(fragment);

    // Adicionar/atualizar sentinela
    if (!sentinelElement) {
      sentinelElement = document.createElement("div");
      sentinelElement.style.height = "1px";
      sentinelElement.style.width = "100%";
    }

    if (!sentinelElement.parentNode) {
      container.appendChild(sentinelElement);
    }

    renderedCount = count;
  }

  // Renderizar itens iniciais
  renderItems(renderedCount);

  // Configurar Intersection Observer se há mais itens
  if (renderedCount < items.length && "IntersectionObserver" in window) {
    observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const nextCount = Math.min(
              renderedCount + loadMoreCount,
              items.length
            );
            renderItems(nextCount);

            // Se renderizou todos, desconectar observer
            if (nextCount >= items.length) {
              observer.disconnect();
              observer = null;
            }
          }
        });
      },
      {
        root: null, // viewport
        rootMargin: "100px", // Carregar 100px antes de entrar no viewport
        threshold: 0.1,
      }
    );

    observer.observe(sentinelElement);
  }

  return {
    cleanup: () => {
      if (observer) {
        observer.disconnect();
        observer = null;
      }
      if (sentinelElement && sentinelElement.parentNode) {
        sentinelElement.remove();
      }
    },
    loadMore: () => {
      if (renderedCount < items.length) {
        const nextCount = Math.min(renderedCount + loadMoreCount, items.length);
        renderItems(nextCount);
      }
    },
  };
}
