// src/js/ui/pagamento.js
// Gerenciamento da página de pagamento
//
// NOTA DE MANUTENÇÃO: Este arquivo está muito grande (1700+ linhas).
// TODO: Refatorar em módulos menores:
//   - payment-address.js (gestão de endereços)
//   - payment-cart.js (exibição de itens)
//   - payment-loyalty.js (gestão de pontos)
//   - payment-checkout.js (finalização de pedido)

import {
  getLoyaltyBalance,
  validatePointsRedemption,
  calculateDiscountFromPoints,
} from "../api/loyalty.js";
import {
  getDefaultAddress,
  getAddresses,
  createAddress,
  updateAddress,
} from "../api/address.js";
import { createOrder, calculateOrderTotal } from "../api/orders.js";
import { getCart, removeCartItem } from "../api/cart.js";
import { getPromotionByProductId } from "../api/promotions.js";
import { simulateProductCapacity } from "../api/products.js";
import { showError, showSuccess, showToast, showConfirm } from "./alerts.js";
import { getIngredients } from "../api/ingredients.js";
import { API_BASE_URL } from "../api/api.js";
import { validateCPF } from "../utils/validators.js";
import { calculatePriceWithPromotion, formatPrice, isPromotionActive } from "../utils/price-utils.js";

// Importar helper de configurações
// Importação estática garante que o módulo esteja disponível quando necessário
import * as settingsHelper from "../utils/settings-helper.js";
import { escapeHTML } from "../utils/html-sanitizer.js";

// Constantes para validação e limites
const VALIDATION_LIMITS = {
  MAX_QUANTITY: 99,
  MAX_NOTES_LENGTH: 500,
  MAX_EXTRAS_COUNT: 10,
  MAX_CPF_LENGTH: 14,
  MAX_RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 1000,
};

(function initPagamentoPage() {
  if (!window.location.pathname.includes("pagamento.html")) return;

  // Cache para prazos de entrega (evita múltiplas chamadas à API)
  let estimatedTimesCache = null;

  const state = {
    cesta: [],
    usuario: null,
    endereco: null,
    enderecos: [],
    enderecoSelecionado: null,
    formaPagamento: "pix",
    tipoCartao: null, // ALTERAÇÃO: Armazena tipo de cartão selecionado ('credito' ou 'debito')
    cpf: "",
    usarPontos: false,
    pontosDisponiveis: 0,
    pontosParaUsar: 0,
    subtotal: 0,
    taxaEntrega: 5.0, // Fallback padrão (será carregado dinamicamente)
    descontos: 0,
    total: 0,
    loading: false,
    error: null,
    // Novas variáveis para modais
    modoEdicao: false,
    enderecoEditando: null,
    valorTroco: null,
    pedidoConfirmado: false,
    ingredientsCache: null, // Cache para preços dos ingredientes
  };

  // Instância do serviço de endereços não é mais necessária, usamos as funções diretamente

  // Refs DOM
  let el = {};

  // Inicializar elementos DOM
  function initElements() {
    el = {
      // Endereço
      enderecoTitulo: document.querySelector("#endereco-rua"),
      enderecoDescricao: document.querySelector("#endereco-bairro"),
      enderecoSelecionado: document.querySelector("#endereco-selecionado"),
      btnSelecionarEndereco: document.querySelector("#btn-selecionar-endereco"),
      listaEnderecos: document.querySelector("#lista-enderecos"),

      // Modal pai - Lista de endereços
      modalEnderecos: document.querySelector("#modal-enderecos"),
      listaEnderecosModal: document.querySelector("#lista-enderecos-modal"),
      btnAdicionarEnderecoModal: document.querySelector(
        "#btn-adicionar-endereco-modal"
      ),

      // Modal filha - Formulário de endereço
      modalEnderecoForm: document.querySelector("#modal-endereco-form"),
      tituloEnderecoForm: document.querySelector("#titulo-endereco-form"),
      btnSalvarEnderecoForm: document.querySelector(
        "#btn-salvar-endereco-form"
      ),

      // Formas de pagamento
      formasPagamento: document.querySelectorAll(".quadro-forma"),

      // Modais
      modalTroco: document.querySelector("#modal-troco"),
      modalTipoCartao: document.querySelector("#modal-tipo-cartao"), // ALTERAÇÃO: Modal para tipo de cartão
      modalRevisao: document.querySelector("#modal-revisao"),
      valorTroco: document.querySelector("#valor"),
      btnConfirmarTroco: document.querySelector("#btn-confirmar-troco"),
      btnCartaoCredito: document.querySelector("#btn-cartao-credito"),
      btnCartaoDebito: document.querySelector("#btn-cartao-debito"),
      btnConfirmarPedido: document.querySelector("#btn-confirmar-pedido"),
      trocoInfo: document.querySelector("#troco-info"),
      cartaoTipoInfo: document.querySelector("#cartao-tipo-info"), // ALTERAÇÃO: Elemento para exibir tipo de cartão

      // CPF
      cpfInput: document.querySelector('input[name="cpf"]'),

      // Itens
      itensContainer: document.querySelector("#itens-container"),

      // Resumo
      subtotal: document.querySelector("#subtotal-valor"),
      taxaEntrega: document.querySelector("#taxa-entrega-valor"),
      descontos: document.querySelector("#descontos-valor"),
      total: document.querySelector("#total-valor"),
      pontosGanhos: document.querySelector("#pontos-ganhos"),
      pontosDisponiveis: document.querySelector(
        ".pontos-royal .esquerda div p:last-child span"
      ),
      usarPontosCheckbox: document.querySelector(
        '.pontos-royal input[type="checkbox"]'
      ),
      descontoPontos: document.querySelector("#desconto-pontos-valor"),

      // Botão
      btnFazerPedido: document.querySelector(".pagamento button"),
    };

    // Verificar elementos críticos
    const elementosCriticos = [
      "itensContainer",
      "enderecoTitulo",
      "enderecoDescricao",
      "subtotal",
      "taxaEntrega",
      "descontos",
      "total",
    ];

    elementosCriticos.forEach((nome) => {
      if (!el[nome]) {
        // Log apenas em desenvolvimento - elementos faltando indicam problema de HTML
        const isDev =
          typeof process !== "undefined" &&
          process.env?.NODE_ENV === "development";
        if (isDev) {
          console.error(`Elemento crítico não encontrado: ${nome}`);
        }
      }
    });
  }

  // Utils
  const formatBRL = (v) =>
    new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(v || 0);

  // Carregar ingredientes e criar mapa de preços
  async function loadIngredientsCache() {
    if (state.ingredientsCache) {
      return state.ingredientsCache;
    }

    try {
      const response = await getIngredients({ page_size: 1000 });
      // Validar resposta antes de processar
      if (
        response &&
        Array.isArray(response.items) &&
        response.items.length > 0
      ) {
        // Criar mapa de ID -> preço adicional (normalizar IDs como string)
        state.ingredientsCache = {};
        response.items.forEach((ingredient) => {
          if (ingredient && ingredient.id != null) {
            // Normalizar ID para string para garantir busca consistente
            const id = String(ingredient.id);
            // CORREÇÃO: Validar que preços são números válidos (evita NaN)
            const additionalPrice = parseFloat(ingredient.additional_price);
            const price = parseFloat(ingredient.price);
            state.ingredientsCache[id] = {
              additional_price:
                Number.isFinite(additionalPrice) && additionalPrice >= 0
                  ? additionalPrice
                  : 0,
              price: Number.isFinite(price) && price >= 0 ? price : 0,
              name: ingredient.name || "",
            };
          }
        });
        return state.ingredientsCache;
      }
      // Resposta vazia ou inválida - inicializar cache vazio
      state.ingredientsCache = {};
    } catch (error) {
      // Log apenas em desenvolvimento - não expor detalhes em produção
      const isDev =
        typeof process !== "undefined" &&
        process.env?.NODE_ENV === "development";
      if (isDev) {
        console.error("Erro ao carregar ingredientes:", error);
      }
      state.ingredientsCache = {};
    }
    return state.ingredientsCache || {};
  }

  // Helper: Verificar se é pedido de retirada (pickup)
  // Extraído para evitar duplicação e garantir consistência
  function isPickupOrder() {
    return (
      state.endereco &&
      (state.endereco.type === "pickup" ||
        state.endereco.order_type === "pickup" ||
        state.endereco.delivery_type === "pickup" ||
        state.enderecoSelecionado === "pickup")
    );
  }

  // Buscar preço adicional de um ingrediente pelo ID
  // Valida tipo e existência antes de buscar no cache
  function getIngredientPrice(ingredientId) {
    if (!state.ingredientsCache || !ingredientId) {
      return 0;
    }
    // Normalizar ID para string (algumas APIs retornam number, outras string)
    const normalizedId = String(ingredientId);
    const ingredient = state.ingredientsCache[normalizedId];
    // Retornar additional_price (preço quando adicionado como extra)
    return ingredient ? ingredient.additional_price || 0 : 0;
  }


  function buildImageUrl(imagePath, imageHash = null) {
    if (!imagePath) return null;

    // Se já é uma URL completa, usar diretamente
    if (imagePath.startsWith("http")) {
      return imagePath;
    }

    // CORREÇÃO: Usar API_BASE_URL do api.js para garantir funcionamento em qualquer servidor
    // Isso evita erros quando o código é colocado em outros servidores
    const baseUrl = API_BASE_URL;

    // Usa hash da imagem se disponível, senão usa timestamp
    const cacheParam = imageHash || new Date().getTime();

    // Se é um caminho do backend (/api/uploads/products/ID.jpeg)
    if (imagePath.startsWith("/api/uploads/products/")) {
      return `${baseUrl}${imagePath}?v=${cacheParam}`;
    }

    // Se é um caminho antigo (/uploads/products/ID.jpeg)
    if (imagePath.startsWith("/uploads/products/")) {
      return `${baseUrl}${imagePath.replace(
        "/uploads/",
        "/api/uploads/"
      )}?v=${cacheParam}`;
    }

    // Se é apenas o nome do arquivo (ID.jpeg, ID.jpg, etc.)
    if (imagePath.match(/^\d+\.(jpg|jpeg|png|gif|webp)$/i)) {
      return `${baseUrl}/api/uploads/products/${imagePath}?v=${cacheParam}`;
    }

    // Fallback: assumir que é um caminho relativo
    return `${baseUrl}/api/uploads/products/${imagePath}?v=${cacheParam}`;
  }

  // Valida se um ID é um inteiro positivo válido (alinhado com validações do backend)
  function validateId(id, fieldName = "ID") {
    if (id === null || id === undefined) return null;
    try {
      const parsed =
        typeof id === "string" ? parseInt(id.trim(), 10) : parseInt(id, 10);
      return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
    } catch {
      return null;
    }
  }

  // Valida quantidade (deve ser >= 1, alinhado com backend)
  function validateQuantity(quantity) {
    if (quantity === null || quantity === undefined) return 1;
    try {
      const parsed =
        typeof quantity === "string"
          ? parseInt(quantity.trim(), 10)
          : parseInt(quantity, 10);
      return Number.isInteger(parsed) && parsed >= 1 ? parsed : 1;
    } catch {
      return 1;
    }
  }

  // Carregar dados da cesta via API
  async function carregarCesta() {
    try {
      const cartResult = await getCart();

      if (cartResult.success && cartResult.data.items) {
        // ALTERAÇÃO: Buscar promoções para todos os produtos em paralelo
        const itemsWithPromotions = await Promise.all(
          cartResult.data.items.map(async (item) => {
            let promotion = null;
            try {
              const productId = item.product_id || item.product?.id;
              if (productId) {
                const promo = await getPromotionByProductId(productId, false);
                if (promo && isPromotionActive(promo)) {
                  promotion = promo;
                }
              }
            } catch (error) {
              // Se não houver promoção, continuar sem ela
              promotion = null;
            }
            return { item, promotion };
          })
        );

        // Converter formato da API para formato local
        // IMPORTANTE: Validar e normalizar dados para garantir compatibilidade com validações rigorosas do backend
        // CORREÇÃO: Combina filter e map em um único processamento para evitar duplicação de validação
        state.cesta = itemsWithPromotions
          .map(({ item, promotion }) => {
            // Validar product_id uma única vez (evita duplicação)
            const productId = validateId(item.product_id);
            if (!productId) {
              // Retornar null para item inválido (será filtrado depois)
              const isDev =
                typeof process !== "undefined" &&
                process.env?.NODE_ENV === "development";
              if (isDev) {
                console.warn(
                  "Item com product_id inválido removido da cesta:",
                  item.product_id
                );
              }
              return null;
            }

            // Mapear EXTRAS (ingredientes adicionais fora da receita)
            const rawExtras =
              item.extras ||
              item.additional_items ||
              item.additional_ingredients ||
              item.ingredients_extras ||
              [];
            const extrasMapeados = (Array.isArray(rawExtras) ? rawExtras : [])
              .map((extra) => {
                const id = validateId(
                  extra.ingredient_id ?? extra.id,
                  "ingredient_id"
                );
                // Filtrar extras com IDs inválidos (backend rejeita null/undefined)
                if (!id) return null;

                const nome =
                  extra.ingredient_name ??
                  extra.name ??
                  extra.title ??
                  "Ingrediente";

                // Buscar preço do cache de ingredientes primeiro
                let preco = getIngredientPrice(id);
                // Se não encontrou no cache, tentar nos dados do extra
                if (preco === 0) {
                  const extraPrice = parseFloat(
                    extra.ingredient_price ??
                      extra.price ??
                      extra.additional_price ??
                      0
                  );
                  preco =
                    Number.isFinite(extraPrice) && extraPrice >= 0
                      ? extraPrice
                      : 0;
                }

                // Validar quantidade (backend requer >= 1)
                const quantidade = validateQuantity(
                  extra.quantity ?? extra.qty
                );
                return { id, nome, preco, quantidade };
              })
              .filter((extra) => extra !== null); // Remove extras inválidos

            // Mapear BASE_MODIFICATIONS (modificações da receita base)
            const rawBaseMods = item.base_modifications || [];
            const baseModsMapeados = (
              Array.isArray(rawBaseMods) ? rawBaseMods : []
            )
              .map((bm) => {
                const id = validateId(
                  bm.ingredient_id ?? bm.id,
                  "ingredient_id"
                );
                // Filtrar base_modifications com IDs inválidos
                if (!id) return null;

                const nome = bm.ingredient_name ?? bm.name ?? "Ingrediente";
                const delta = parseInt(bm.delta ?? 0, 10) || 0;

                // Buscar preço do cache de ingredientes
                const preco = getIngredientPrice(id);

                return { id, nome, delta, preco };
              })
              .filter((bm) => bm !== null); // Remove base_modifications inválidos

            // Validar quantidade do item (backend requer >= 1)
            const quantidade = validateQuantity(item.quantity);

            // ALTERAÇÃO: Calcular preço base com promoção se houver
            const originalPrice = (() => {
              const priceRaw = parseFloat(item.product?.price);
              return Number.isFinite(priceRaw) && priceRaw >= 0 ? priceRaw : 0;
            })();
            const priceInfo = calculatePriceWithPromotion(originalPrice, promotion);
            const precoBaseComPromocao = priceInfo.finalPrice;

            // ALTERAÇÃO: Calcular preço total considerando promoção
            // Se o backend já calculou o subtotal, aplicar desconto da promoção se necessário
            let precoTotalCalculado = (() => {
              const subtotalRaw = parseFloat(item.item_subtotal);
              return Number.isFinite(subtotalRaw) && subtotalRaw >= 0 ? subtotalRaw : 0;
            })();

            // Se há promoção e o backend não aplicou, aplicar desconto
            if (promotion && priceInfo.hasPromotion && precoTotalCalculado > 0) {
              // Calcular total de extras e base_modifications
              const extrasTotal = extrasMapeados.reduce((sum, extra) => {
                return sum + (parseFloat(extra.preco || 0) * parseFloat(extra.quantidade || 0));
              }, 0);
              
              const baseModsTotal = baseModsMapeados.reduce((sum, mod) => {
                return sum + (parseFloat(mod.preco || 0) * Math.abs(parseInt(mod.delta || 0, 10) || 0));
              }, 0);

              // Preço total original (sem desconto)
              const precoTotalOriginal = (originalPrice * quantidade) + extrasTotal + baseModsTotal;
              
              // Aplicar desconto proporcionalmente
              const descontoPorUnidade = priceInfo.discountValue;
              const descontoTotal = descontoPorUnidade * quantidade;
              
              // Se o subtotal do backend parece não ter desconto aplicado, aplicar
              if (precoTotalCalculado >= precoTotalOriginal - 0.01) {
                precoTotalCalculado = Math.max(0, precoTotalCalculado - descontoTotal);
              }
            }

            return {
              id: productId, // ID do produto
              cartItemId: item.id || item.cart_item_id || null, // ID do item no carrinho (para remoção)
              nome: item.product?.name || "Produto",
              descricao: item.product?.description || "",
              // ALTERAÇÃO: Armazenar preço original e com promoção
              preco: originalPrice,
              precoBaseComPromocao: precoBaseComPromocao,
              promotion: promotion, // ALTERAÇÃO: Armazenar promoção para exibição
              precoTotal: precoTotalCalculado,
              quantidade: quantidade, // Já validado por validateQuantity (>= 1)
              extras: extrasMapeados,
              base_modifications: baseModsMapeados,
              observacao: item.notes || "",
              imagem: item.product?.image_url || "tudo.jpeg",
              imageHash: item.product?.image_hash,
              // Preservar tempo de preparo do produto
              preparation_time_minutes: item.product?.preparation_time_minutes || 0,
            };
          })
          .filter((item) => item !== null && item.quantidade >= 1); // Remove itens inválidos e garante quantidade válida

        // Atualizar totais da API
        // CORREÇÃO: Validar que valores são números válidos (evita NaN/Infinity de cálculos malformados)
        if (cartResult.data.summary) {
          const feesRaw = parseFloat(cartResult.data.summary.fees);
          // ALTERAÇÃO: Usar taxa de entrega do backend, mas recalcular subtotal e descontos
          // pois precisamos aplicar descontos de promoções
          state.taxaEntrega =
            Number.isFinite(feesRaw) && feesRaw >= 0 ? feesRaw : 5.0;
        }
        
        // ALTERAÇÃO: Recalcular totais após aplicar promoções
        // Isso garante que subtotal, descontos e total estão corretos
        calcularTotais();
        
        // Atualizar tempo estimado após carregar cesta (usa maior tempo de preparo dos produtos)
        atualizarExibicaoTempo();
      } else {
        state.cesta = [];
        // Atualizar tempo mesmo com cesta vazia (usa padrão do sistema)
        atualizarExibicaoTempo();
      }
    } catch (err) {
      // Log apenas em desenvolvimento
      const isDev =
        typeof process !== "undefined" &&
        process.env?.NODE_ENV === "development";
      if (isDev) {
        console.error("Erro ao carregar cesta:", err.message);
      }
      state.cesta = [];
      // Atualizar tempo mesmo em caso de erro (usa padrão do sistema)
      atualizarExibicaoTempo();
    }
  }

  // Carregar dados do usuário
  function carregarUsuario() {
    try {
      if (typeof window.getStoredUser === "function") {
        state.usuario = window.getStoredUser();
      }
    } catch (err) {
      // Log apenas em desenvolvimento
      const isDev =
        typeof process !== "undefined" &&
        process.env?.NODE_ENV === "development";
      if (isDev) {
        console.error("Erro ao carregar usuário:", err.message);
      }
      state.usuario = null;
    }
  }

  // Carregar endereços do usuário
  async function carregarEnderecos() {
    try {
      // Buscar TODOS os endereços do usuário
      const enderecos = await getAddresses();
      state.enderecos = enderecos || [];

      if (state.enderecos.length > 0) {
        // Procurar o endereço padrão na lista
        const enderecoPadrao = state.enderecos.find(
          (end) => end.is_default === true
        );

        if (enderecoPadrao) {
          // Se houver endereço padrão, selecionar ele
          state.enderecoSelecionado = enderecoPadrao;
          state.endereco = { ...enderecoPadrao, order_type: "delivery" }; // Adicionar order_type para delivery
        } else {
          // Se não houver padrão, selecionar o primeiro da lista
          state.enderecoSelecionado = state.enderecos[0];
          state.endereco = { ...state.enderecos[0], order_type: "delivery" }; // Adicionar order_type para delivery
        }
        // Atualizar resumo após carregar endereço padrão
        renderResumo();
      }
    } catch (error) {
      // Log apenas em desenvolvimento
      const isDev =
        typeof process !== "undefined" &&
        process.env?.NODE_ENV === "development";
      if (isDev) {
        console.error("Erro ao carregar endereços:", error.message);
      }
      state.enderecos = [];
    }
  }

  // Carregar pontos Royal do usuário via API
  async function carregarPontos() {
    if (!state.usuario || !state.usuario.id) {
      // Log apenas em desenvolvimento
      const isDev =
        typeof process !== "undefined" &&
        process.env?.NODE_ENV === "development";
      if (isDev) {
        console.error("Usuário não encontrado");
      }
      return;
    }

    state.loading = true;
    state.error = null;

    try {
      const balanceData = await getLoyaltyBalance(state.usuario.id);
      // CORREÇÃO: Validar que balance é número válido (evita NaN)
      const balanceRaw = parseFloat(balanceData?.current_balance);
      state.pontosDisponiveis =
        Number.isFinite(balanceRaw) && balanceRaw >= 0
          ? Math.floor(balanceRaw)
          : 0;
    } catch (error) {
      // Log apenas em desenvolvimento
      const isDev =
        typeof process !== "undefined" &&
        process.env?.NODE_ENV === "development";
      if (isDev) {
        console.error("Erro ao carregar pontos:", error.message);
      }
      state.error = error.message;
      state.pontosDisponiveis = 0;
    } finally {
      state.loading = false;
    }
  }

  // Calcular totais
  function calcularTotais() {
    // CORREÇÃO: Validar que precoTotal é número válido antes de somar (evita NaN)
    state.subtotal = state.cesta.reduce((sum, item) => {
      const itemTotal =
        typeof item.precoTotal === "number" && Number.isFinite(item.precoTotal)
          ? item.precoTotal
          : 0;
      return sum + itemTotal;
    }, 0);

    // ALTERAÇÃO: Calcular total de descontos aplicados por promoções
    // Para cada item, calcular: (preço original total) - (preço com desconto total) = desconto aplicado
    const descontosPromocoes = state.cesta.reduce((sum, item) => {
      // Se o item não tem promoção, desconto é 0
      if (!item.promotion || (!item.promotion.discount_percentage && !item.promotion.discount_value)) {
        return sum;
      }
      
      // Calcular preço total original (sem desconto) do item
      // Preço base original * quantidade + extras + base_modifications
      const precoBaseOriginal = parseFloat(item.preco || 0);
      const quantidade = item.quantidade || 1;
      
      // Calcular total de extras
      const extrasTotal = (item.extras || []).reduce((extrasSum, extra) => {
        const extraPrice = parseFloat(extra.preco || 0) || 0;
        const extraQty = parseFloat(extra.quantidade || 0) || 0;
        return extrasSum + (extraPrice * extraQty);
      }, 0);
      
      // Calcular total de base_modifications
      const baseModsTotal = (item.base_modifications || []).reduce((modsSum, mod) => {
        const modPrice = parseFloat(mod.preco || 0) || 0;
        const modDelta = Math.abs(parseInt(mod.delta || 0, 10) || 0);
        return modsSum + (modPrice * modDelta);
      }, 0);
      
      // Preço total original (sem desconto)
      const precoTotalOriginal = (precoBaseOriginal * quantidade) + extrasTotal + baseModsTotal;
      
      // Preço total com desconto (já calculado em precoTotal)
      const precoTotalComDesconto = parseFloat(item.precoTotal || 0);
      
      // Desconto aplicado = diferença entre original e com desconto
      const descontoItem = Math.max(0, precoTotalOriginal - precoTotalComDesconto);
      
      return sum + descontoItem;
    }, 0);

    // Total antes do desconto (subtotal + taxa de entrega, se delivery)
    // CORREÇÃO: Garantir que taxaEntrega é número válido antes de calcular
    const taxaEntregaValida =
      Number.isFinite(state.taxaEntrega) && state.taxaEntrega >= 0
        ? state.taxaEntrega
        : 0;
    const totalAntesDesconto =
      state.subtotal + (isPickupOrder() ? 0 : taxaEntregaValida);

    // Validar resgate de pontos se estiver usando
    // IMPORTANTE: O desconto pode ser aplicado sobre subtotal + entrega (se delivery)
    // conforme o backend: total_with_delivery = subtotal + delivery_fee
    if (state.usarPontos && state.pontosParaUsar > 0) {
      const validacao = validatePointsRedemption(
        state.pontosDisponiveis,
        state.pontosParaUsar,
        totalAntesDesconto // Usar total com entrega para validação
      );

      if (!validacao.valid) {
        // Log apenas em desenvolvimento
        const isDev =
          typeof process !== "undefined" &&
          process.env?.NODE_ENV === "development";
        if (isDev) {
          console.warn("Validação de pontos falhou:", validacao.error);
        }
        state.pontosParaUsar = validacao.maxPoints;
      }
    }

    // Calcular desconto por pontos
    //
    // REGRA: O desconto NÃO pode ser maior que o valor total do pedido (subtotal + entrega)
    // Isso evita que o pedido fique com valor negativo ou que o cliente receba dinheiro de volta
    //
    // Exemplo 1 - Desconto normal:
    //   Subtotal: R$ 50,00
    //   Taxa entrega: R$ 5,50
    //   Total antes desconto: R$ 55,50
    //   Pontos resgatados: 1000 pontos = R$ 10,00 de desconto
    //   Desconto aplicado: R$ 10,00 (menor que R$ 55,50)
    //   Total final: R$ 55,50 - R$ 10,00 = R$ 45,50 ✅
    //
    // Exemplo 2 - Desconto maior que o total (limitado):
    //   Subtotal: R$ 10,00
    //   Taxa entrega: R$ 5,50
    //   Total antes desconto: R$ 15,50
    //   Pontos resgatados: 5000 pontos = R$ 50,00 de desconto
    //   Desconto aplicado: R$ 15,50 (limitado ao total, não R$ 50,00)
    //   Total final: R$ 15,50 - R$ 15,50 = R$ 0,00 ✅
    //   (Cliente não recebe crédito de R$ 34,50 que sobraria)
    //
    const descontoPontos = state.usarPontos
      ? calculateDiscountFromPoints(state.pontosParaUsar)
      : 0;
    // CORREÇÃO: Validar que desconto é número válido antes de calcular
    const descontoPontosValido =
      Number.isFinite(descontoPontos) && descontoPontos >= 0
        ? descontoPontos
        : 0;
    
    // ALTERAÇÃO: Total de descontos = descontos de promoções + descontos de pontos
    // O desconto de pontos é limitado ao total antes do desconto
    const descontoPontosLimitado = Math.min(descontoPontosValido, totalAntesDesconto);
    state.descontos = descontosPromocoes + descontoPontosLimitado;

    // CORREÇÃO: O subtotal já tem desconto de promoções aplicado
    // Então o total = subtotal (com desconto de promoções) + taxa - desconto de pontos
    // Ou seja: total = subtotal + taxa - descontoPontosLimitado
    const totalCalculado = totalAntesDesconto - descontoPontosLimitado;
    state.total =
      Number.isFinite(totalCalculado) && totalCalculado >= 0
        ? totalCalculado
        : 0;

    // Atualizar exibição do troco se dinheiro estiver selecionado
    // Se o total ficou 0 devido aos pontos, limpar o troco
    if (state.formaPagamento === "dinheiro") {
      if (state.total <= 0 && state.usarPontos) {
        state.valorTroco = null;
      }
      atualizarExibicaoTroco();
    }
  }

  // Renderizar itens da cesta
  function renderItens() {
    if (!el.itensContainer) {
      // Log apenas em desenvolvimento - problema de estrutura HTML
      const isDev =
        typeof process !== "undefined" &&
        process.env?.NODE_ENV === "development";
      if (isDev) {
        console.error("Container de itens não encontrado");
      }
      return;
    }

    if (state.cesta.length === 0) {
      // ALTERAÇÃO: HTML estático seguro, mas usando textContent para consistência
      el.itensContainer.textContent = "";
      const p = document.createElement("p");
      p.textContent = "Nenhum item na cesta";
      el.itensContainer.appendChild(p);
      return;
    }

    const itensHtml = state.cesta
      .map((item) => {
        const imageUrl = buildImageUrl(item.imagem, item.imageHash);

        // Renderizar lista de EXTRAS (ingredientes adicionais)
        let extrasHtml = "";
        if (item.extras && item.extras.length > 0) {
          const extrasItems = item.extras
            .map((extra) => {
              // Buscar preço do cache ou usar o preço já mapeado
              // CORREÇÃO: Validar que preço é um número válido antes de usar
              let preco =
                typeof extra.preco === "number" &&
                Number.isFinite(extra.preco) &&
                extra.preco >= 0
                  ? extra.preco
                  : 0;
              if (preco === 0 && extra.id) {
                preco = getIngredientPrice(extra.id);
              }

              // Formatar preço se houver
              const precoFormatado =
                preco > 0
                  ? ` <span class="extra-price">+R$ ${preco
                      .toFixed(2)
                      .replace(".", ",")}</span>`
                  : "";
              return `<li><span class="extra-quantity-badge">${
                extra.quantidade
              }</span> <span class="extra-name">${escapeHTML(
                extra.nome
              )}</span>${precoFormatado}</li>`;
            })
            .join("");
          extrasHtml = `
                    <div class="item-extras-separator"></div>
                    <div class="item-extras-list">
                        <strong>Extras:</strong>
                        <ul>
                            ${extrasItems}
                        </ul>
                    </div>
                `;
        }

        // Renderizar lista de BASE_MODIFICATIONS (modificações da receita base)
        let baseModsHtml = "";
        if (item.base_modifications && item.base_modifications.length > 0) {
          const baseModsItems = item.base_modifications
            .map((bm) => {
              const isPositive = bm.delta > 0;
              const icon = isPositive ? "plus" : "minus";
              const colorClass = isPositive ? "mod-add" : "mod-remove";
              const deltaValue = Math.abs(bm.delta);

              // Formatar preço se houver (apenas para adições, remoções não têm custo)
              const precoFormatado =
                bm.preco > 0 && isPositive
                  ? ` <span class="base-mod-price">+R$ ${bm.preco
                      .toFixed(2)
                      .replace(".", ",")}</span>`
                  : "";

              return `
                        <li>
                            <span class="base-mod-icon ${colorClass}">
                                <i class="fa-solid fa-circle-${icon}"></i>
                            </span>
                            <span class="base-mod-quantity">${deltaValue}</span>
                            <span class="base-mod-name">${escapeHTML(
                              bm.nome
                            )}</span>${precoFormatado}
                        </li>
                    `;
            })
            .join("");
          baseModsHtml = `
                    <div class="item-extras-separator"></div>
                    <div class="item-base-mods-list">
                        <strong>Modificações:</strong>
                        <ul>
                            ${baseModsItems}
                        </ul>
                    </div>
                `;
        }

        // Mostrar observação se houver
        const obsHtml = item.observacao
          ? `
                <div class="item-extras-separator"></div>
                <div class="item-observacao">
                    <strong>Obs:</strong> ${escapeHTML(item.observacao)}
                </div>
            `
          : "";

        return `
                <div class="item">
                    <div class="item-header">
                        <div class="item-image">
                            <img src="${imageUrl}" alt="${escapeHTML(
          item.nome
        )}">
                        </div>
                        <div class="item-header-info">
                            <p class="nome">${escapeHTML(item.nome)}</p>
                            <p class="descricao">${escapeHTML(
                              item.descricao || ""
                            )}</p>
                        </div>
                    </div>
                    ${extrasHtml}
                    ${baseModsHtml}
                    ${obsHtml}
                    <div class="item-extras-separator"></div>
                    <div class="item-footer">
                        <div class="item-preco-container">
                            ${item.promotion ? 
                              (() => {
                                // Calcular preço total original (sem desconto)
                                const extrasTotal = (item.extras || []).reduce((sum, extra) => {
                                  return sum + (parseFloat(extra.preco || 0) * parseFloat(extra.quantidade || 0));
                                }, 0);
                                const baseModsTotal = (item.base_modifications || []).reduce((sum, mod) => {
                                  return sum + (parseFloat(mod.preco || 0) * Math.abs(parseInt(mod.delta || 0, 10) || 0));
                                }, 0);
                                const precoTotalOriginal = (item.preco * item.quantidade) + extrasTotal + baseModsTotal;
                                return `<span class="item-preco-original" style="text-decoration: line-through; color: #999; font-size: 0.9em; margin-right: 8px;">${formatBRL(precoTotalOriginal)}</span>`;
                              })()
                              : ''}
                            <p class="item-preco">${formatBRL(item.precoTotal)}</p>
                        </div>
                        <p class="item-quantidade">Qtd: ${item.quantidade}</p>
                    </div>
                </div>
            `;
      })
      .join("");

    // TODO: REVISAR - innerHTML com dados dinâmicos
    // O HTML já está sendo sanitizado com escapeHTML nos dados (nome, descricao, observacao),
    // mas considerar usar setSafeHTML para sanitização adicional e consistência.
    // Alternativa: usar createElementsFromHTML do dom-renderer.js com sanitização.
    el.itensContainer.innerHTML = itensHtml;
  }

  // Renderizar resumo de valores
  async function renderResumo() {
    calcularTotais();
    // Atualizar tempo estimado quando o resumo for renderizado (pode ter mudado produtos)
    atualizarExibicaoTempo();

    if (el.subtotal) el.subtotal.textContent = formatBRL(state.subtotal);
    if (el.taxaEntrega)
      el.taxaEntrega.textContent = formatBRL(
        isPickupOrder() ? 0 : state.taxaEntrega
      );
    if (el.descontos) el.descontos.textContent = formatBRL(state.descontos);
    if (el.total) el.total.textContent = formatBRL(state.total);

    // Pontos usando configuração dinâmica
    // IMPORTANTE: Pontos são calculados sobre o SUBTOTAL (produtos), NÃO sobre o total (com entrega)
    // Conforme padrão de programas de fidelidade: pontos não incluem taxas de entrega
    let pontosGanhos = 0;

    // Calcular base para pontos: subtotal (produtos apenas, sem taxa de entrega)
    // Se houver desconto, considerar apenas o desconto proporcional ao subtotal
    let basePontos = state.subtotal;
    if (state.descontos > 0) {
      // Se houver desconto aplicado, calcular desconto proporcional ao subtotal
      // desconto_no_subtotal = desconto * (subtotal / total_antes_desconto)
      const totalAntesDesconto =
        state.subtotal + (isPickupOrder() ? 0 : state.taxaEntrega);
      if (totalAntesDesconto > 0) {
        const descontoProporcionalSubtotal =
          state.descontos * (state.subtotal / totalAntesDesconto);
        basePontos = Math.max(0, state.subtotal - descontoProporcionalSubtotal);
      }
    }

    if (
      settingsHelper &&
      typeof settingsHelper.calculatePointsEarned === "function"
    ) {
      try {
        pontosGanhos = await settingsHelper.calculatePointsEarned(basePontos);
      } catch (error) {
        // Fallback: 10 pontos por real
        pontosGanhos = Math.floor(basePontos * 10);
      }
    } else {
      // Fallback: 10 pontos por real
      pontosGanhos = Math.floor(basePontos * 10);
    }

    if (el.pontosGanhos) el.pontosGanhos.textContent = pontosGanhos;
    if (el.pontosDisponiveis)
      el.pontosDisponiveis.textContent = state.pontosDisponiveis;

    // Desconto por pontos (sempre mostrar o valor máximo disponível)
    // IMPORTANTE: O desconto pode ser aplicado sobre subtotal + entrega (se delivery)
    if (el.descontoPontos) {
      const totalAntesDesconto =
        state.subtotal + (isPickupOrder() ? 0 : state.taxaEntrega);
      const descontoMaximo = Math.min(
        calculateDiscountFromPoints(state.pontosDisponiveis),
        totalAntesDesconto
      );
      el.descontoPontos.textContent = `-${formatBRL(descontoMaximo)}`;
    }
  }

  /**
   * Carrega prazos de entrega estimados das configurações públicas
   */
  async function loadEstimatedTimes() {
    try {
      if (
        settingsHelper &&
        typeof settingsHelper.getEstimatedDeliveryTimes === "function"
      ) {
        estimatedTimesCache = await settingsHelper.getEstimatedDeliveryTimes();
      }

      // Se não conseguiu carregar, usar valores padrão
      if (!estimatedTimesCache) {
        estimatedTimesCache = {
          initiation_minutes: 5,
          preparation_minutes: 20,
          dispatch_minutes: 5,
          delivery_minutes: 15,
        };
      }
    } catch (error) {
      // Fallback para valores padrão
      estimatedTimesCache = {
        initiation_minutes: 5,
        preparation_minutes: 20,
        dispatch_minutes: 5,
        delivery_minutes: 15,
      };
    }
  }

  /**
   * Calcula tempo estimado de entrega baseado nos prazos do sistema + soma dos tempos de preparo dos produtos
   * Fórmula: Iniciação + (Soma dos Tempos de Preparo dos Produtos × Quantidade) + Envio + Entrega
   * @param {string} orderType - Tipo do pedido ('delivery' ou 'pickup'). Padrão: 'delivery'
   * @returns {Object} Objeto com minTime e maxTime em minutos
   */
  function calculateEstimatedDeliveryTime(orderType = "delivery") {
    // Calcular tempo total de preparo somando todos os produtos (considerando quantidade)
    const totalProductPrepTime = getTotalProductPreparationTime();

    if (!estimatedTimesCache) {
      // Fallback se não carregou os tempos
      const systemPrep = 20; // Fallback padrão (usado apenas se não houver produtos)
      const preparation = totalProductPrepTime > 0 ? totalProductPrepTime : systemPrep;
      const delivery = orderType === "delivery" ? 15 : 0;
      const total = 5 + preparation + 5 + delivery;
      return {
        minTime: total,
        maxTime: total + 15,
      };
    }

    // Extrair prazos do sistema (com fallbacks)
    const initiation = estimatedTimesCache.initiation_minutes || 5;
    const systemPreparation = estimatedTimesCache.preparation_minutes || 20;
    const dispatch = estimatedTimesCache.dispatch_minutes || 5;
    const delivery =
      orderType === "delivery" ? estimatedTimesCache.delivery_minutes || 15 : 0;

    // Usar a soma dos tempos de preparo dos produtos, ou o padrão do sistema se não houver produtos
    const preparation = totalProductPrepTime > 0 ? totalProductPrepTime : systemPreparation;

    // Calcular tempo total: Iniciação + (Soma dos Tempos de Preparo) + Envio + Entrega
    const totalMinutes = initiation + preparation + dispatch + delivery;

    // Tempo mínimo = soma dos prazos
    const minTime = totalMinutes;

    // Tempo máximo = soma dos prazos + 15 minutos (margem de segurança)
    const maxTime = totalMinutes + 15;

    return { minTime, maxTime };
  }

  /**
   * Calcula o tempo total de preparo somando todos os tempos de preparo dos produtos
   * Considera a quantidade de cada produto (tempo × quantidade)
   * @returns {number} Tempo total de preparo em minutos, ou 0 se não houver produtos
   */
  function getTotalProductPreparationTime() {
    if (!state.cesta || !Array.isArray(state.cesta) || state.cesta.length === 0) {
      return 0;
    }

    // ALTERAÇÃO: Validação mais robusta para prevenir cálculos incorretos
    let totalPrepTime = 0;
    state.cesta.forEach((item) => {
      if (!item || typeof item !== 'object') return;
      
      // Validar e converter valores numéricos de forma segura
      const prepTime = Math.max(0, parseFloat(item.preparation_time_minutes || 0) || 0);
      const quantity = Math.max(1, parseInt(item.quantidade || 1, 10) || 1);
      
      // Validar que não há overflow antes de somar
      const itemPrepTime = prepTime * quantity;
      if (isFinite(itemPrepTime) && itemPrepTime >= 0) {
        totalPrepTime += itemPrepTime;
      }
    });
    
    // Garantir que o tempo total é um número válido e finito
    return Math.max(0, isFinite(totalPrepTime) ? totalPrepTime : 0);
  }

  /**
   * Atualiza a exibição do tempo estimado na página
   */
  function atualizarExibicaoTempo() {
    // Verificar se é pickup ou delivery
    // Se não houver endereço selecionado, usar 'delivery' como padrão
    const isPickup = isPickupOrder();

    const orderType = isPickup ? "pickup" : "delivery";
    const timeEstimate = calculateEstimatedDeliveryTime(orderType);
    const tempoTexto = `${timeEstimate.minTime} - ${timeEstimate.maxTime} min`;

    // Atualizar elemento de tempo na seção de endereço
    const tempoElement = document.querySelector(".endereco .informa .tempo");
    if (tempoElement) {
      tempoElement.textContent = tempoTexto;
    }

    // Atualizar tempo na modal de revisão
    // Buscar o elemento que contém "Hoje, 40 - 50 min" (segundo <p> dentro do primeiro div)
    const modalRevisao = document.querySelector(
      "#modal-revisao .conteudo-modal"
    );
    if (modalRevisao) {
      // Buscar o primeiro div que contém o ícone de moto e o texto de entrega
      const entregaDiv = modalRevisao.querySelector("div:first-child");
      if (entregaDiv) {
        const entregaTexts = entregaDiv.querySelectorAll("div p");
        // O segundo <p> geralmente contém o tempo
        if (entregaTexts.length >= 2) {
          const tempoParagraph = entregaTexts[1];
          if (tempoParagraph) {
            // Manter o formato "Hoje, X - Y min" se já tiver "Hoje"
            const currentText = tempoParagraph.textContent.trim();
            if (currentText.includes("Hoje")) {
              tempoParagraph.textContent = `Hoje, ${tempoTexto}`;
            } else {
              tempoParagraph.textContent = tempoTexto;
            }
          }
        }
      }
    }
  }

  // Renderizar endereço
  function renderEndereco() {
    // Verificar se é retirada no local (pickup)
    const isPickup = isPickupOrder();

    if (isPickup) {
      if (el.enderecoTitulo) {
        el.enderecoTitulo.textContent = "Retirar no Local";
      }
      if (el.enderecoDescricao) {
        el.enderecoDescricao.textContent = "Balcão - Retirada na loja";
      }
    } else if (state.endereco) {
      // Construir endereço completo baseado na estrutura da API
      let enderecoCompleto = "";
      let enderecoDescricao = "";

      // Mapear campos da API para a estrutura esperada
      const rua = state.endereco.street || state.endereco.rua;
      const numero = state.endereco.number || state.endereco.numero;
      const bairro =
        state.endereco.neighborhood ||
        state.endereco.district ||
        state.endereco.bairro;
      const cidade = state.endereco.city || state.endereco.cidade;
      const estado = state.endereco.state || state.endereco.estado;

      if (rua && numero) {
        enderecoCompleto = `${rua}, ${numero}`;
      } else if (rua) {
        enderecoCompleto = rua;
      } else {
        enderecoCompleto = "Endereço não informado";
      }

      if (bairro && cidade) {
        enderecoDescricao = `${bairro} - ${cidade}`;
      } else if (bairro) {
        enderecoDescricao = bairro;
      } else if (cidade) {
        enderecoDescricao = cidade;
      } else {
        enderecoDescricao = "Localização não informada";
      }

      if (el.enderecoTitulo) {
        el.enderecoTitulo.textContent = enderecoCompleto;
      }
      if (el.enderecoDescricao) {
        el.enderecoDescricao.textContent = enderecoDescricao;
      }
    } else {
      // Fallback quando não há endereço
      if (el.enderecoTitulo)
        el.enderecoTitulo.textContent = "Nenhum endereço selecionado";
      if (el.enderecoDescricao)
        el.enderecoDescricao.textContent = "Clique para selecionar um endereço";
    }

    // Atualizar tempo estimado após renderizar endereço
    atualizarExibicaoTempo();
  }

  // Renderizar lista de endereços
  function renderListaEnderecos() {
    if (!el.listaEnderecos) return;

    let html = "";

    // Se não há endereços cadastrados, mostrar mensagem e botão para adicionar
    if (state.enderecos.length === 0) {
      html += `
                <div class="endereco-item endereco-vazio">
                    <div class="endereco-info">
                        <i class="fa-solid fa-exclamation-triangle"></i>
                        <div>
                            <p class="titulo">Nenhum endereço cadastrado</p>
                            <p class="descricao">Cadastre um endereço para receber seu pedido</p>
                        </div>
                    </div>
                </div>
                <div class="endereco-item" data-endereco-id="novo">
                    <div class="endereco-info">
                        <i class="fa-solid fa-plus"></i>
                        <div>
                            <p class="titulo">Adicionar primeiro endereço</p>
                            <p class="descricao">Cadastrar um novo endereço de entrega</p>
                        </div>
                    </div>
                </div>
            `;
    } else {
      // Botão para adicionar novo endereço (quando já existem endereços)
      html += `
                <div class="endereco-item" data-endereco-id="novo">
                    <div class="endereco-info">
                        <i class="fa-solid fa-plus"></i>
                        <div>
                            <p class="titulo">Adicionar novo endereço</p>
                            <p class="descricao">Cadastrar um novo endereço de entrega</p>
                        </div>
                    </div>
                </div>
            `;

      // Listar endereços existentes
      state.enderecos.forEach((endereco) => {
        const isSelecionado =
          state.enderecoSelecionado &&
          state.enderecoSelecionado.id === endereco.id;

        // Mapear campos da API
        const rua = endereco.street || endereco.rua;
        const numero = endereco.number || endereco.numero;
        const bairro =
          endereco.neighborhood || endereco.district || endereco.bairro;
        const cidade = endereco.city || endereco.cidade;
        const estado = endereco.state || endereco.estado;

        // Sanitizar dados do endereço antes de inserir no HTML
        const enderecoCompleto = escapeHTML(
          rua && numero ? `${rua}, ${numero}` : rua || "Endereço não informado"
        );
        const enderecoDescricao = escapeHTML(
          bairro && cidade
            ? `${bairro} - ${cidade}`
            : bairro || cidade || "Localização não informada"
        );
        const enderecoId = Number(endereco.id) || 0;

        html += `
                    <div class="endereco-item ${
                      isSelecionado ? "selecionado" : ""
                    }" data-endereco-id="${enderecoId}">
                        <div class="endereco-info">
                            <i class="fa-solid fa-location-dot"></i>
                            <div class="endereco-info-content">
                                <p class="titulo">${enderecoCompleto}</p>
                                <p class="descricao">${enderecoDescricao}</p>
                            </div>
                        </div>
                        <div class="endereco-actions">
                            <button class="btn-editar" data-endereco-id="${enderecoId}" data-action="edit" title="Editar endereço">
                                <i class="fa-solid fa-edit"></i>
                            </button>
                        </div>
                    </div>
                `;
      });
    }

    el.listaEnderecos.innerHTML = html;
  }

  // Nova função para renderizar lista na modal pai
  function renderListaEnderecosModal() {
    if (!el.listaEnderecosModal) return;

    // Verificar se pickup está selecionado
    const isPickupSelected =
      state.enderecoSelecionado === "pickup" ||
      (state.endereco &&
        (state.endereco.type === "pickup" ||
          state.endereco.order_type === "pickup" ||
          state.endereco.delivery_type === "pickup"));

    // Opção de retirar no local (sempre visível)
    let html = `
            <div class="endereco-item endereco-pickup ${
              isPickupSelected ? "selecionado" : ""
            }" 
                 data-endereco-id="pickup" 
                 data-action="select-pickup">
                <div class="endereco-info">
                    <i class="fa-solid fa-store"></i>
                    <div class="endereco-info-content">
                        <p class="titulo">Retirar no Local</p>
                        <p class="descricao">Balcão - Retirada na loja</p>
                    </div>
                </div>
                ${
                  isPickupSelected
                    ? '<div class="endereco-check"><i class="fa-solid fa-car-side"></i></div>'
                    : ""
                }
            </div>
        `;

    // Renderizar endereços cadastrados
    if (state.enderecos.length === 0) {
      html += `
                <div class="endereco-vazio">
                    <i class="fa-solid fa-map-location-dot"></i>
                    <h3>Nenhum endereço cadastrado</h3>
                    <p>Adicione um endereço para receber seus pedidos</p>
                    <button class="btn-adicionar-primeiro" data-action="add-address">
                        Adicionar primeiro endereço
                    </button>
                </div>
            `;
    } else {
      html += state.enderecos
        .map((endereco) => {
          const isSelecionado =
            state.enderecoSelecionado &&
            state.enderecoSelecionado !== "pickup" &&
            state.enderecoSelecionado.id === endereco.id;
          const enderecoId = Number(endereco.id) || 0;
          // Sanitizar dados do endereço
          const street = escapeHTML(
            endereco.street || "Endereço não informado"
          );
          const number = escapeHTML(endereco.number || "S/N");
          const neighborhood = escapeHTML(
            endereco.neighborhood ||
              endereco.district ||
              endereco.bairro ||
              "Bairro não informado"
          );
          const city = escapeHTML(endereco.city || "Cidade não informada");

          return `
                <div class="endereco-item ${
                  isSelecionado ? "selecionado" : ""
                }" 
                     data-endereco-id="${enderecoId}"
                     data-action="select">
                    <div class="endereco-info">
                        <i class="fa-solid fa-location-dot"></i>
                        <div class="endereco-info-content">
                            <p class="titulo">${street}, ${number}</p>
                            <p class="descricao">${neighborhood} - ${city}</p>
                        </div>
                    </div>
                    <div class="endereco-actions">
                        ${
                          isSelecionado
                            ? '<div class="endereco-check"><i class="fa-solid fa-car-side"></i></div>'
                            : ""
                        }
                        <button class="btn-editar" data-endereco-id="${enderecoId}" data-action="edit" title="Editar endereço">
                            <i class="fa-solid fa-pen"></i>
                        </button>
                    </div>
                </div>
            `;
        })
        .join("");
    }

    el.listaEnderecosModal.innerHTML = html;
  }

  function selecionarEnderecoModal(enderecoId) {
    if (enderecoId === "pickup") {
      // Selecionar retirada no local
      state.enderecoSelecionado = "pickup";
      state.endereco = { type: "pickup", order_type: "pickup" }; // Usar order_type para compatibilidade com backend
      renderEndereco();
      renderListaEnderecosModal(); // Re-renderizar para mostrar seleção
      renderResumo(); // Atualizar resumo para zerar taxa de entrega
      fecharModalEnderecos();
    } else {
      // Selecionar endereço de entrega
      const endereco = state.enderecos.find((addr) => addr.id === enderecoId);
      if (endereco) {
        state.enderecoSelecionado = endereco;
        state.endereco = { ...endereco, order_type: "delivery" }; // Adicionar order_type para delivery
        renderEndereco();
        renderListaEnderecosModal(); // Re-renderizar para mostrar seleção
        renderResumo(); // Atualizar resumo para aplicar taxa de entrega
        fecharModalEnderecos();
      }
    }
  }

  // Funções para o formulário de endereço
  async function salvarEnderecoForm() {
    const dadosEndereco = coletarDadosFormulario();
    if (!dadosEndereco) return;

    try {
      if (state.modoEdicao && state.enderecoEditando) {
        // Modo edição
        const enderecoAtualizado = await updateAddress(
          state.enderecoEditando.id,
          dadosEndereco
        );
        const index = state.enderecos.findIndex(
          (addr) => addr.id === state.enderecoEditando.id
        );
        if (index !== -1) {
          state.enderecos[index] = enderecoAtualizado;
        }
      } else {
        // Modo adição
        const novoEndereco = await createAddress(dadosEndereco);
        state.enderecos.push(novoEndereco);

        // Se for o primeiro endereço, selecionar
        if (state.enderecos.length === 1) {
          state.enderecoSelecionado = novoEndereco;
          state.endereco = { ...novoEndereco, order_type: "delivery" }; // Adicionar order_type para delivery
          renderEndereco();
          renderResumo(); // Atualizar resumo para aplicar taxa de entrega
        }
      }

      renderListaEnderecosModal();
      fecharModalEnderecoForm();
    } catch (error) {
      // Log apenas em desenvolvimento - erro já é exibido ao usuário
      const isDev =
        typeof process !== "undefined" &&
        process.env?.NODE_ENV === "development";
      if (isDev) {
        console.error("Erro ao salvar endereço:", error.message);
      }
      showError("Erro ao salvar endereço. Tente novamente.");
    }
  }

  // Função auxiliar para normalizar valores opcionais (padrão de usuario-perfil.js)
  function normalizarOpcional(v) {
    if (v === undefined) return undefined;
    const s = String(v || "").trim();
    return s === "" ? null : s;
  }

  // Configurar comportamento dos checkboxes (padrão de usuario-perfil.js)
  // NOTA: Usa cloneNode para prevenir memory leaks de event listeners duplicados
  function configurarCheckboxesEndereco() {
    const checaSemNumero = document.getElementById("sem-numero-form");
    const checaSemComplemento = document.getElementById("sem-complemento-form");
    const numeroInput = document.getElementById("numero-form");
    const complementoInput = document.getElementById("complemento-form");

    if (checaSemNumero && numeroInput) {
      // Remover listeners anteriores através de cloneNode
      const novoCheckbox = checaSemNumero.cloneNode(true);
      checaSemNumero.parentNode.replaceChild(novoCheckbox, checaSemNumero);

      novoCheckbox.addEventListener("change", () => {
        if (novoCheckbox.checked) {
          numeroInput.value = "";
          numeroInput.disabled = true;
        } else {
          numeroInput.disabled = false;
        }
      });
    }

    if (checaSemComplemento && complementoInput) {
      // Remover listeners anteriores através de cloneNode
      const novoCheckbox = checaSemComplemento.cloneNode(true);
      checaSemComplemento.parentNode.replaceChild(
        novoCheckbox,
        checaSemComplemento
      );

      novoCheckbox.addEventListener("change", () => {
        if (novoCheckbox.checked) {
          complementoInput.value = "";
        }
      });
    }
  }

  function coletarDadosFormulario() {
    // Coletar valores dos campos
    const zip = document.getElementById("cep-form")?.value;
    const uf = document.getElementById("estado-form")?.value;
    const cidade = document.getElementById("cidade-form")?.value;
    const rua = document.getElementById("rua-form")?.value;
    const bairro = document.getElementById("bairro-form")?.value;
    const numero = document.getElementById("numero-form")?.value;
    const complemento = document.getElementById("complemento-form")?.value;

    // Verificar checkboxes
    const semNumeroMarcado =
      document.getElementById("sem-numero-form")?.checked || false;
    const semComplementoMarcado =
      document.getElementById("sem-complemento-form")?.checked || false;

    // Normalizar e validar CEP
    const cepLimpo = String(zip || "")
      .replace(/\D/g, "")
      .trim();
    if (!cepLimpo || cepLimpo.length !== 8) {
      showError("CEP é obrigatório e deve ter 8 dígitos.");
      return null;
    }

    // Validar campos obrigatórios
    const estadoTrim = String(uf || "").trim();
    if (!estadoTrim) {
      showError("Estado é obrigatório.");
      return null;
    }

    const cidadeTrim = String(cidade || "").trim();
    if (!cidadeTrim) {
      showError("Cidade é obrigatória.");
      return null;
    }

    const ruaTrim = String(rua || "").trim();
    if (!ruaTrim) {
      showError("Rua é obrigatória.");
      return null;
    }

    const bairroTrim = String(bairro || "").trim();
    if (!bairroTrim) {
      showError("Bairro é obrigatório.");
      return null;
    }

    const numeroTrim = String(numero || "").trim();
    if (!semNumeroMarcado && !numeroTrim) {
      showError("Número é obrigatório.");
      return null;
    }

    // Montar payload seguindo o padrão de usuario-perfil.js
    const payload = {
      zip_code: cepLimpo,
      state: estadoTrim,
      city: cidadeTrim,
      street: ruaTrim,
      neighborhood: bairroTrim,
      // Se marcado sem número, enviar 'S/N', senão o número preenchido
      number: semNumeroMarcado ? "S/N" : numeroTrim,
      // Se marcado sem complemento, enviar null, senão normalizar o valor
      complement: semComplementoMarcado
        ? null
        : normalizarOpcional(complemento),
      is_default: false,
    };

    return payload;
  }

  // Gerenciar endereços
  async function adicionarEndereco(dadosEndereco) {
    try {
      const novoEndereco = await createAddress(dadosEndereco);
      state.enderecos.push(novoEndereco);

      // Se for o primeiro endereço, selecionar
      if (state.enderecos.length === 1) {
        state.enderecoSelecionado = novoEndereco;
        state.endereco = novoEndereco;
        renderEndereco();
      }

      renderListaEnderecos();
      return novoEndereco;
    } catch (error) {
      // Log apenas em desenvolvimento
      const isDev =
        typeof process !== "undefined" &&
        process.env?.NODE_ENV === "development";
      if (isDev) {
        console.error("Erro ao adicionar endereço:", error.message);
      }
      throw error;
    }
  }

  async function editarEndereco(enderecoId, dadosEndereco) {
    try {
      const enderecoAtualizado = await updateAddress(enderecoId, dadosEndereco);

      // Atualizar na lista
      const index = state.enderecos.findIndex((addr) => addr.id === enderecoId);
      if (index !== -1) {
        state.enderecos[index] = enderecoAtualizado;
      }

      // Se for o endereço selecionado, atualizar
      if (
        state.enderecoSelecionado &&
        state.enderecoSelecionado.id === enderecoId
      ) {
        state.enderecoSelecionado = enderecoAtualizado;
        state.endereco = enderecoAtualizado;
        renderEndereco();
      }

      renderListaEnderecos();
      return enderecoAtualizado;
    } catch (error) {
      // Log apenas em desenvolvimento
      const isDev =
        typeof process !== "undefined" &&
        process.env?.NODE_ENV === "development";
      if (isDev) {
        console.error("Erro ao editar endereço:", error.message);
      }
      throw error;
    }
  }

  function selecionarEndereco(enderecoId) {
    // Verifica se é requisição para adicionar novo endereço
    if (enderecoId === "novo") {
      abrirModalAdicionarEndereco();
      return;
    }

    const endereco = state.enderecos.find((addr) => addr.id === enderecoId);
    if (endereco) {
      state.enderecoSelecionado = endereco;
      state.endereco = { ...endereco, order_type: "delivery" }; // Adicionar order_type para delivery
      renderEndereco();
      renderListaEnderecos();
      renderResumo(); // Atualizar resumo para aplicar taxa de entrega
      fecharListaEnderecos();
    }
  }

  // Modal pai - Lista de endereços
  function abrirModalEnderecos() {
    if (typeof window.abrirModal === "function") {
      window.abrirModal("modal-enderecos");
    } else {
      const modal = document.getElementById("modal-enderecos");
      if (modal) {
        modal.style.display = "flex";
        modal.classList.add("show");
      }
    }
    renderListaEnderecosModal();
  }

  function fecharModalEnderecos() {
    if (typeof window.fecharModal === "function") {
      window.fecharModal("modal-enderecos");
    } else {
      const modal = document.getElementById("modal-enderecos");
      if (modal) {
        modal.style.display = "none";
        modal.classList.remove("show");
      }
    }
  }

  // Modal filha - Formulário de endereço
  function abrirModalEnderecoForm(mode = "add", enderecoId = null) {
    if (typeof window.abrirModal === "function") {
      window.abrirModal("modal-endereco-form");
    } else {
      const modal = document.getElementById("modal-endereco-form");
      if (modal) {
        modal.style.display = "flex";
        modal.classList.add("show");
      }
    }

    configurarModalEnderecoForm(mode, enderecoId);
  }

  function fecharModalEnderecoForm() {
    if (typeof window.fecharModal === "function") {
      window.fecharModal("modal-endereco-form");
    } else {
      const modal = document.getElementById("modal-endereco-form");
      if (modal) {
        modal.style.display = "none";
        modal.classList.remove("show");
      }
    }
  }

  function configurarModalEnderecoForm(mode, enderecoId) {
    const titulo = el.tituloEnderecoForm;
    const btnSalvar = el.btnSalvarEnderecoForm;

    if (mode === "add") {
      state.modoEdicao = false;
      state.enderecoEditando = null;
      titulo.textContent = "Adicionar endereço";
      btnSalvar.textContent = "Salvar Endereço";
      limparFormularioEndereco();
    } else if (mode === "edit") {
      state.modoEdicao = true;
      state.enderecoEditando = state.enderecos.find(
        (addr) => addr.id === enderecoId
      );
      titulo.textContent = "Editar endereço";
      btnSalvar.textContent = "Atualizar Endereço";
      preencherFormularioEndereco(enderecoId);
    }

    // Configurar checkboxes após abrir a modal
    configurarCheckboxesEndereco();
  }

  function limparFormularioEndereco() {
    const campos = [
      "cep-form",
      "estado-form",
      "cidade-form",
      "rua-form",
      "bairro-form",
      "numero-form",
      "complemento-form",
    ];
    campos.forEach((id) => {
      const campo = document.getElementById(id);
      if (campo) {
        campo.value = "";
        campo.disabled = false; // Reabilitar campos
      }
    });

    const checkboxes = ["sem-numero-form", "sem-complemento-form"];
    checkboxes.forEach((id) => {
      const checkbox = document.getElementById(id);
      if (checkbox) checkbox.checked = false;
    });
  }

  function preencherFormularioEndereco(enderecoId) {
    const endereco = state.enderecos.find((addr) => addr.id === enderecoId);
    if (!endereco) return;

    // Aplicar máscara no CEP
    const cepValue = endereco.zip_code || "";
    const cepFormatted = cepValue
      .replace(/\D/g, "")
      .replace(/(\d{5})(\d{1,3})/, "$1-$2");
    document.getElementById("cep-form").value = cepFormatted;

    document.getElementById("estado-form").value = endereco.state || "";
    document.getElementById("cidade-form").value = endereco.city || "";
    document.getElementById("rua-form").value = endereco.street || "";
    document.getElementById("bairro-form").value =
      endereco.neighborhood || endereco.district || "";
    document.getElementById("numero-form").value = endereco.number || "";
    document.getElementById("complemento-form").value =
      endereco.complement || "";
  }

  // Funções legadas (mantidas para compatibilidade)
  function abrirListaEnderecos() {
    abrirModalEnderecos();
  }

  function fecharListaEnderecos() {
    fecharModalEnderecos();
  }

  function abrirModalAdicionarEndereco() {
    fecharListaEnderecos();
    // Usar o sistema de modais existente
    if (typeof window.abrirModal === "function") {
      window.abrirModal("adicionar-endereco-pagamento");
    } else {
      // Fallback se window.abrirModal não estiver disponível
      const modal = document.getElementById("adicionar-endereco-pagamento");
      if (modal) {
        modal.style.display = "flex";
        modal.style.opacity = "1";
      }
    }
  }

  function abrirModalEditarEndereco(enderecoId) {
    fecharListaEnderecos();
    const endereco = state.enderecos.find((addr) => addr.id === enderecoId);
    if (endereco) {
      // NOTA: Variável global usada para compatibilidade com sistema legado de modals
      // TODO: Refatorar para usar state.enderecoEditando ao remover sistema legado
      window.enderecoIdEmEdicao = enderecoId;
      preencherFormularioEdicao(endereco);

      // Usar o sistema de modais existente
      if (typeof window.abrirModal === "function") {
        window.abrirModal("editar-endereco-pagamento");
      } else {
        // Fallback se window.abrirModal não estiver disponível
        const modal = document.getElementById("editar-endereco-pagamento");
        if (modal) {
          modal.style.display = "flex";
          modal.style.opacity = "1";
        }
      }
    }
  }

  function preencherFormularioEdicao(endereco) {
    // Preencher campos do modal de edição
    const campos = {
      "cep-edit-pag": endereco.cep,
      "estado-edit-pag": endereco.estado,
      "cidade-edit-pag": endereco.cidade,
      "rua-edit-pag": endereco.rua,
      "bairro-edit-pag": endereco.bairro,
      "numero-edit-pag": endereco.numero,
      "complemento-edit-pag": endereco.complemento || "",
    };

    Object.entries(campos).forEach(([id, valor]) => {
      const elemento = document.getElementById(id);
      if (elemento) {
        if (elemento.type === "checkbox") {
          elemento.checked = valor;
        } else {
          elemento.value = valor;
        }
      }
    });
  }

  // Anexar eventos
  function attachEvents() {
    // Formas de pagamento
    if (el.formasPagamento) {
      el.formasPagamento.forEach((forma) => {
        forma.addEventListener("click", () => {
          // Remover seleção anterior
          el.formasPagamento.forEach((f) => f.classList.remove("selecionado"));
          // Adicionar seleção atual
          forma.classList.add("selecionado");

          // ALTERAÇÃO: Cartão abre modal para escolher tipo, mantém um só quadro
          const texto = forma.querySelector("p").textContent.toLowerCase();
          if (texto.includes("pix")) {
            state.formaPagamento = "pix";
            state.tipoCartao = null; // Limpar tipo de cartão se mudar de pagamento
            state.valorTroco = null; // Limpar troco se mudar de dinheiro
            atualizarExibicaoTroco(); // Atualizar exibição
            atualizarExibicaoTipoCartao(); // Atualizar exibição do tipo de cartão
          } else if (texto.includes("cartão") || texto.includes("cartao")) {
            // ALTERAÇÃO: Definir forma de pagamento como cartão antes de abrir modal
            state.formaPagamento = "cartao";
            state.valorTroco = null; // Limpar troco se mudar de dinheiro
            atualizarExibicaoTroco(); // Atualizar exibição
            atualizarExibicaoTipoCartao(); // Atualizar exibição do tipo de cartão
            // Abrir modal para escolher tipo de cartão
            abrirModalTipoCartao();
          } else if (texto.includes("dinheiro")) {
            state.formaPagamento = "dinheiro";
            state.tipoCartao = null; // Limpar tipo de cartão se mudar de pagamento
            atualizarExibicaoTipoCartao(); // Atualizar exibição do tipo de cartão
            // ALTERAÇÃO: Não abrir modal de troco se for pedido de balcão (pickup)
            const isPickup = isPickupOrder();
            if (isPickup) {
              // Para pedidos de balcão, não precisa de troco
              state.valorTroco = null;
              atualizarExibicaoTroco();
            } else {
              // Só abrir modal de troco se o total for maior que 0 e não for pickup
              // Se total = 0 e há desconto por pontos, não precisa de troco
              if (state.total > 0) {
                abrirModalTroco();
              } else {
                // Se total é 0, limpar troco e não abrir modal
                state.valorTroco = null;
                atualizarExibicaoTroco();
              }
            }
          }
        });
      });
    }

    // ALTERAÇÃO: Event listeners para botões de tipo de cartão
    if (el.btnCartaoCredito) {
      el.btnCartaoCredito.addEventListener("click", () => {
        selecionarTipoCartao("credito");
      });
    }

    if (el.btnCartaoDebito) {
      el.btnCartaoDebito.addEventListener("click", () => {
        selecionarTipoCartao("debito");
      });
    }

    // CPF
    if (el.cpfInput) {
      el.cpfInput.addEventListener("input", (e) => {
        state.cpf = e.target.value;
      });
    }

    // Usar pontos Royal
    if (el.usarPontosCheckbox) {
      el.usarPontosCheckbox.addEventListener("change", (e) => {
        state.usarPontos = e.target.checked;
        if (state.usarPontos) {
          // Usar todos os pontos disponíveis por padrão
          state.pontosParaUsar = state.pontosDisponiveis;
        } else {
          state.pontosParaUsar = 0;
        }
        calcularTotais();
        renderResumo();
      });
    }

    // Botão fazer pedido
    // Removido - usando implementação que abre modal de revisão

    // Eventos de endereços
    if (el.enderecoSelecionado) {
      el.enderecoSelecionado.addEventListener("click", (e) => {
        e.stopPropagation();
        abrirModalEnderecos();
      });
    }

    // Eventos da modal pai - Lista de endereços
    if (el.btnAdicionarEnderecoModal) {
      el.btnAdicionarEnderecoModal.addEventListener("click", () => {
        abrirModalEnderecoForm("add");
      });
    }

    // Eventos da modal filha - Formulário de endereço
    if (el.btnSalvarEnderecoForm) {
      el.btnSalvarEnderecoForm.addEventListener("click", () => {
        salvarEnderecoForm();
      });
    }

    // Event listener para o botão "Fazer pedido"
    const btnFazerPedido = document.querySelector(".pagamento button");
    if (btnFazerPedido) {
      btnFazerPedido.addEventListener("click", () => {
        // ALTERAÇÃO: Validar dados necessários antes de abrir modal de revisão
        validarDadosPagamentoAntesDeRevisar();
      });
    }

    if (el.btnSelecionarEndereco) {
      el.btnSelecionarEndereco.addEventListener("click", (e) => {
        e.stopPropagation();
        abrirListaEnderecos();
      });
    }

    // Fechar lista ao clicar fora
    document.addEventListener("click", (e) => {
      if (
        !el.enderecoSelecionado?.contains(e.target) &&
        !el.listaEnderecos?.contains(e.target)
      ) {
        fecharListaEnderecos();
      }
    });

    // Eventos da lista de endereços (delegation) - substitui onclick inline
    if (el.listaEnderecos) {
      el.listaEnderecos.addEventListener("click", (e) => {
        const enderecoItem = e.target.closest(".endereco-item");
        if (!enderecoItem) return;

        const enderecoId = enderecoItem.dataset.enderecoId;
        const action =
          e.target.closest("[data-action]")?.dataset.action ||
          enderecoItem.dataset.action;

        if (e.target.closest(".btn-editar") || action === "edit") {
          e.stopPropagation();
          const id = parseInt(
            String(enderecoId || enderecoItem.dataset.enderecoId),
            10
          );
          if (!isNaN(id) && id > 0) {
            abrirModalEditarEndereco(id);
          }
        } else if (action === "select") {
          selecionarEndereco(enderecoId);
        }
      });
    }

    // Eventos da modal de endereços (delegation)
    if (el.listaEnderecosModal) {
      el.listaEnderecosModal.addEventListener("click", (e) => {
        const target = e.target.closest("[data-action]");
        if (!target) return;

        const action = target.dataset.action;
        const enderecoId = target.dataset.enderecoId;

        if (action === "add-address") {
          e.stopPropagation();
          abrirModalEnderecoForm("add");
        } else if (action === "edit" && enderecoId) {
          e.stopPropagation();
          const id = parseInt(String(enderecoId), 10);
          if (!isNaN(id) && id > 0) {
            abrirModalEnderecoForm("edit", id);
          }
        } else if (action === "select" && enderecoId) {
          const id = parseInt(String(enderecoId), 10);
          if (!isNaN(id) && id > 0) {
            selecionarEnderecoModal(id);
          }
        } else if (action === "select-pickup") {
          selecionarEnderecoModal("pickup");
        }
      });
    }

    // Eventos dos modais de endereço
    const btnSalvarEndereco = document.getElementById(
      "btn-salvar-endereco-pagamento"
    );
    if (btnSalvarEndereco) {
      btnSalvarEndereco.addEventListener("click", () => {
        salvarNovoEndereco();
      });
    }

    const btnAtualizarEndereco = document.getElementById(
      "btn-atualizar-endereco-pagamento"
    );
    if (btnAtualizarEndereco) {
      btnAtualizarEndereco.addEventListener("click", () => {
        atualizarEndereco();
      });
    }
  }

  // Funções para gerenciar formulários de endereço
  async function salvarNovoEndereco() {
    try {
      const dadosEndereco = coletarDadosFormularioLegacy("add-pag");
      await adicionarEndereco(dadosEndereco);

      // Usar o sistema de modais existente
      if (typeof window.fecharModal === "function") {
        window.fecharModal("adicionar-endereco-pagamento");
      } else {
        // Fallback se window.fecharModal não estiver disponível
        const modal = document.getElementById("adicionar-endereco-pagamento");
        if (modal) {
          modal.style.display = "none";
          modal.style.opacity = "0";
        }
      }

      showSuccess("Endereço adicionado com sucesso!");
    } catch (error) {
      // Log apenas em desenvolvimento - erro já é exibido ao usuário
      const isDev =
        typeof process !== "undefined" &&
        process.env?.NODE_ENV === "development";
      if (isDev) {
        console.error("Erro ao salvar endereço:", error.message);
      }
      showError("Erro ao salvar endereço. Tente novamente.");
    }
  }

  async function atualizarEndereco() {
    try {
      const enderecoId = obterEnderecoIdEmEdicao();
      if (!enderecoId) {
        showError("Erro: ID do endereço não encontrado.");
        return;
      }

      const dadosEndereco = coletarDadosFormularioLegacy("edit-pag");
      await editarEndereco(enderecoId, dadosEndereco);

      // Usar o sistema de modais existente
      if (typeof window.fecharModal === "function") {
        window.fecharModal("editar-endereco-pagamento");
      } else {
        // Fallback se window.fecharModal não estiver disponível
        const modal = document.getElementById("editar-endereco-pagamento");
        if (modal) {
          modal.style.display = "none";
          modal.style.opacity = "0";
        }
      }

      showSuccess("Endereço atualizado com sucesso!");
    } catch (error) {
      // Log apenas em desenvolvimento - erro já é exibido ao usuário
      const isDev =
        typeof process !== "undefined" &&
        process.env?.NODE_ENV === "development";
      if (isDev) {
        console.error("Erro ao atualizar endereço:", error.message);
      }
      showError("Erro ao atualizar endereço. Tente novamente.");
    }
  }

  // FUNÇÃO LEGADA - NÃO UTILIZADA (mantida para compatibilidade futura)
  function coletarDadosFormularioLegacy(sufixo) {
    // Coletar valores dos campos (versão com sufixo)
    const zip = document.getElementById(`cep-${sufixo}`)?.value;
    const uf = document.getElementById(`estado-${sufixo}`)?.value;
    const cidade = document.getElementById(`cidade-${sufixo}`)?.value;
    const rua = document.getElementById(`rua-${sufixo}`)?.value;
    const bairro = document.getElementById(`bairro-${sufixo}`)?.value;
    const numero = document.getElementById(`numero-${sufixo}`)?.value;
    const complemento = document.getElementById(`complemento-${sufixo}`)?.value;

    // Normalizar e validar CEP
    const cepLimpo = String(zip || "")
      .replace(/\D/g, "")
      .trim();
    if (!cepLimpo || cepLimpo.length !== 8) {
      showError("CEP é obrigatório e deve ter 8 dígitos.");
      return null;
    }

    // Validar campos obrigatórios
    const estadoTrim = String(uf || "").trim();
    if (!estadoTrim) {
      showError("Estado é obrigatório.");
      return null;
    }

    const cidadeTrim = String(cidade || "").trim();
    if (!cidadeTrim) {
      showError("Cidade é obrigatória.");
      return null;
    }

    const ruaTrim = String(rua || "").trim();
    if (!ruaTrim) {
      showError("Rua é obrigatória.");
      return null;
    }

    const bairroTrim = String(bairro || "").trim();
    if (!bairroTrim) {
      showError("Bairro é obrigatório.");
      return null;
    }

    const numeroTrim = String(numero || "").trim();
    if (!numeroTrim) {
      showError("Número é obrigatório.");
      return null;
    }

    // Retornar no formato da API (em inglês)
    const payload = {
      zip_code: cepLimpo,
      state: estadoTrim,
      city: cidadeTrim,
      street: ruaTrim,
      neighborhood: bairroTrim,
      number: numeroTrim,
      complement: normalizarOpcional(complemento),
      is_default: false,
    };

    return payload;
  }

  function obterEnderecoIdEmEdicao() {
    // Esta função deve ser implementada para rastrear qual endereço está sendo editado
    // Por enquanto, vamos usar uma variável global temporária
    return window.enderecoIdEmEdicao;
  }

  // Fazer pedido
  function fazerPedido() {
    if (state.cesta.length === 0) {
      showError("Sua cesta está vazia!");
      return;
    }

    // Validar CPF se preenchido
    if (state.cpf) {
      const cpfValidation = validateCPF(state.cpf);
      if (!cpfValidation.valid) {
        showError(cpfValidation.message || "CPF inválido!");
        return;
      }
    }

    // Preparar dados do pedido
    const pedido = {
      itens: state.cesta,
      endereco: state.endereco,
      formaPagamento: state.formaPagamento,
      cpf: state.cpf,
      usarPontos: state.usarPontos,
      pontosUsados: state.usarPontos
        ? Math.min(state.pontosDisponiveis, Math.floor(state.subtotal * 100))
        : 0,
      subtotal: state.subtotal,
      taxaEntrega: state.taxaEntrega,
      descontos: state.descontos,
      total: state.total,
      data: new Date().toISOString(),
    };

    // DEPRECATED: Esta função não é mais utilizada - pedidos são criados via API
    // Mantida apenas para compatibilidade/comentada para evitar uso acidental
    // TODO: Remover em refatoração futura quando garantir que não há dependências
    showError(
      "Método obsoleto. Use criarPedidoAPI() para criar pedidos via API."
    );
    // ALTERAÇÃO: Removido console.warn em produção
    // TODO: REVISAR - Implementar logging estruturado condicional (apenas em modo debug)
    const isDev =
      typeof process !== "undefined" &&
      process.env?.NODE_ENV === "development";
    if (isDev) {
      console.warn(
        "salvarPedido() está obsoleta. Pedidos devem ser criados via API (criarPedidoAPI)."
      );
    }
  }


  // ====== Integração com IBGE (UF e municípios) e ViaCEP (CEP) ======
  let ufSelectForm = null;
  let citySelectForm = null;
  let cepInputForm = null;
  let ruaInputForm = null;
  let bairroInputForm = null;

  async function fetchUFs() {
    try {
      const resp = await fetch(
        "https://servicodados.ibge.gov.br/api/v1/localidades/estados?orderBy=nome"
      );
      const data = await resp.json();
      const populaUF = (selectEl) => {
        if (!selectEl) return;
        // ALTERAÇÃO: Usar createElement ao invés de innerHTML para opções estáticas
        selectEl.textContent = "";
        const defaultOpt = document.createElement("option");
        defaultOpt.value = "";
        defaultOpt.disabled = true;
        defaultOpt.selected = true;
        defaultOpt.textContent = "Selecione o estado";
        selectEl.appendChild(defaultOpt);
        data.forEach((uf) => {
          const opt = document.createElement("option");
          opt.value = uf.sigla;
          opt.textContent = `${uf.sigla} - ${escapeHTML(uf.nome)}`;
          opt.dataset.ufId = uf.id;
          selectEl.appendChild(opt);
        });
      };
      if (Array.isArray(data)) {
        populaUF(ufSelectForm);
      }
    } catch (e) {
      // ALTERAÇÃO: Usar createElement ao invés de innerHTML
      if (ufSelectForm) {
        ufSelectForm.textContent = "";
        const opt = document.createElement("option");
        opt.value = "";
        opt.disabled = true;
        opt.selected = true;
        opt.textContent = "UF";
        ufSelectForm.appendChild(opt);
      }
    }
  }

  async function fetchCitiesByUF(ufSigla, targetCitySelect) {
    if (!ufSigla || !targetCitySelect) return;
    try {
      // ALTERAÇÃO: Usar createElement ao invés de innerHTML
      targetCitySelect.textContent = "";
      const loadingOpt = document.createElement("option");
      loadingOpt.value = "";
      loadingOpt.disabled = true;
      loadingOpt.selected = true;
      loadingOpt.textContent = "Carregando...";
      targetCitySelect.appendChild(loadingOpt);
      
      const resp = await fetch(
        `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${ufSigla}/municipios`
      );
      const data = await resp.json();
      targetCitySelect.textContent = "";
      const defaultOpt = document.createElement("option");
      defaultOpt.value = "";
      defaultOpt.disabled = true;
      defaultOpt.selected = true;
      defaultOpt.textContent = "Selecione a cidade";
      targetCitySelect.appendChild(defaultOpt);
      
      if (Array.isArray(data)) {
        data.forEach((c) => {
          const opt = document.createElement("option");
          opt.value = escapeHTML(c.nome);
          opt.textContent = c.nome;
          targetCitySelect.appendChild(opt);
        });
      }
    } catch (e) {
      // ALTERAÇÃO: Usar createElement ao invés de innerHTML
      targetCitySelect.textContent = "";
      const errorOpt = document.createElement("option");
      errorOpt.value = "";
      errorOpt.disabled = true;
      errorOpt.selected = true;
      errorOpt.textContent = "Erro ao carregar";
      targetCitySelect.appendChild(errorOpt);
    }
  }

  async function lookupCEP(rawCep) {
    const cep = String(rawCep || "").replace(/\D/g, "");
    if (cep.length !== 8) return null;
    try {
      const resp = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const data = await resp.json();
      if (data && !data.erro) return data;
      return null;
    } catch (_e) {
      return null;
    }
  }

  function aplicarMascaraCep(el) {
    let v = (el.value || "").replace(/\D/g, "");
    if (v.length > 8) v = v.slice(0, 8);
    if (v.length > 5) v = v.replace(/(\d{5})(\d{1,3})/, "$1-$2");
    el.value = v;
  }

  let lastCepFormChecked = null;
  let lastCepFormResult = null; // 'success' | 'error' | null

  function configurarBuscaCEP() {
    ufSelectForm = document.getElementById("estado-form");
    citySelectForm = document.getElementById("cidade-form");
    cepInputForm = document.getElementById("cep-form");
    ruaInputForm = document.getElementById("rua-form");
    bairroInputForm = document.getElementById("bairro-form");

    if (ufSelectForm && citySelectForm) {
      ufSelectForm.addEventListener("change", () => {
        const uf = ufSelectForm.value;
        fetchCitiesByUF(uf, citySelectForm);
      });
    }

    if (cepInputForm) {
      cepInputForm.addEventListener("input", async function () {
        // máscara simples
        aplicarMascaraCep(this);

        const cleaned = (this.value || "").replace(/\D/g, "");
        if (cleaned.length !== 8) return;

        if (lastCepFormChecked === cleaned && lastCepFormResult === "success")
          return;

        const data = await lookupCEP(this.value);
        if (data) {
          if (ruaInputForm && data.logradouro)
            ruaInputForm.value = data.logradouro;
          if (bairroInputForm && data.bairro)
            bairroInputForm.value = data.bairro;
          if (ufSelectForm && data.uf) {
            ufSelectForm.value = data.uf;
            await fetchCitiesByUF(data.uf, citySelectForm);
            if (citySelectForm && data.localidade)
              citySelectForm.value = data.localidade;
          }
          // Mostrar toast de sucesso se disponível
          if (typeof showToast === "function") {
            showToast("Endereço encontrado pelo CEP.", {
              type: "success",
              title: "CEP",
            });
          }
          lastCepFormChecked = cleaned;
          lastCepFormResult = "success";
        } else {
          if (lastCepFormChecked !== cleaned || lastCepFormResult !== "error") {
            if (typeof showToast === "function") {
              showToast("CEP não encontrado. Verifique e tente novamente.", {
                type: "error",
                title: "CEP",
              });
            }
          }
          lastCepFormChecked = cleaned;
          lastCepFormResult = "error";
        }
      });
    }
  }

  // Inicializar
  async function init() {
    initElements();

    // Carregar taxa de entrega das configurações públicas
    if (settingsHelper && typeof settingsHelper.getDeliveryFee === "function") {
      try {
        state.taxaEntrega = await settingsHelper.getDeliveryFee();
      } catch (error) {
        // ALTERAÇÃO: Removido console.warn em produção
        // TODO: REVISAR - Implementar logging estruturado condicional (apenas em modo debug)
        const isDev =
          typeof process !== "undefined" &&
          process.env?.NODE_ENV === "development";
        if (isDev) {
          console.warn("Usando taxa de entrega padrão:", error.message);
        }
      }
    }

    // Carregar prazos de entrega estimados das configurações públicas
    await loadEstimatedTimes();

    // Atualizar tempo estimado inicial (mesmo sem endereço, mostra tempo para delivery)
    atualizarExibicaoTempo();

    // Carregar cache de ingredientes
    await loadIngredientsCache();

    await carregarCesta();
    carregarUsuario();
    await carregarEnderecos();
    await carregarPontos();

    renderItens();
    renderResumo();
    renderEndereco(); // Esta função também atualiza o tempo
    renderListaEnderecos();

    // Configurar busca de CEP
    configurarBuscaCEP();
    await fetchUFs();

    attachEvents();

    // Garantir que o valor de desconto seja exibido na inicialização
    // IMPORTANTE: O desconto pode ser aplicado sobre subtotal + entrega (se delivery)
    if (el.descontoPontos) {
      // Verificar se é pickup para calcular desconto máximo
      const isPickup =
        state.endereco &&
        (state.endereco.type === "pickup" ||
          state.endereco.order_type === "pickup" ||
          state.endereco.delivery_type === "pickup" ||
          state.enderecoSelecionado === "pickup");
      const totalAntesDesconto =
        state.subtotal + (isPickup ? 0 : state.taxaEntrega);
      const descontoMaximo = Math.min(
        calculateDiscountFromPoints(state.pontosDisponiveis),
        totalAntesDesconto
      );
      el.descontoPontos.textContent = `-${formatBRL(descontoMaximo)}`;
    }
  }

  // REMOVED: Função duplicada - usar implementação principal na linha 740

  // ====== MODAIS DE TROCO E REVISÃO ======

  function abrirModalTroco() {
    if (typeof window.abrirModal === "function") {
      window.abrirModal("modal-troco");
    } else {
      const modal = document.getElementById("modal-troco");
      if (modal) {
        modal.style.display = "flex";
        modal.classList.add("show");
      }
    }
  }

  function fecharModalTroco() {
    if (typeof window.fecharModal === "function") {
      window.fecharModal("modal-troco");
    } else {
      const modal = document.getElementById("modal-troco");
      if (modal) {
        modal.style.display = "none";
        modal.classList.remove("show");
      }
    }
  }

  // ALTERAÇÃO: Funções para modal de tipo de cartão
  function abrirModalTipoCartao() {
    if (typeof window.abrirModal === "function") {
      window.abrirModal("modal-tipo-cartao");
    } else {
      const modal = document.getElementById("modal-tipo-cartao");
      if (modal) {
        modal.style.display = "flex";
        modal.classList.add("show");
      }
    }
  }

  function fecharModalTipoCartao() {
    if (typeof window.fecharModal === "function") {
      window.fecharModal("modal-tipo-cartao");
    } else {
      const modal = document.getElementById("modal-tipo-cartao");
      if (modal) {
        modal.style.display = "none";
        modal.classList.remove("show");
      }
    }
  }

  function selecionarTipoCartao(tipo) {
    // tipo: 'credito' ou 'debito'
    state.formaPagamento = "cartao";
    state.tipoCartao = tipo;
    fecharModalTipoCartao();
    atualizarExibicaoTipoCartao();
    // ALTERAÇÃO: Abrir modal de revisão automaticamente após selecionar tipo de cartão
    // Pequeno delay para garantir que a modal de tipo de cartão foi fechada
    setTimeout(() => {
      abrirModalRevisao();
    }, 300);
  }

  function atualizarExibicaoTipoCartao() {
    if (!el.cartaoTipoInfo) return;

    if (state.formaPagamento === "cartao" && state.tipoCartao) {
      // Exibir tipo de cartão abaixo do título
      const tipoText = state.tipoCartao === "credito" ? "Crédito" : "Débito";
      el.cartaoTipoInfo.textContent = tipoText;
      el.cartaoTipoInfo.style.display = "block";
    } else {
      // Esconder se não for cartão ou se não tiver tipo selecionado
      el.cartaoTipoInfo.style.display = "none";
      el.cartaoTipoInfo.textContent = "";
    }
  }

  // ALTERAÇÃO: Função para validar dados de pagamento antes de abrir modal de revisão
  function validarDadosPagamentoAntesDeRevisar() {
    // Verificar se o pedido está completamente pago com pontos
    const isFullyPaidWithPoints =
      state.total <= 0 && state.usarPontos && state.pontosParaUsar > 0;

    // Se não há valor a pagar (pago com pontos), pular validações de pagamento
    if (isFullyPaidWithPoints) {
      abrirModalRevisao();
      return;
    }

    // Validar forma de pagamento
    if (!state.formaPagamento) {
      showError("Selecione uma forma de pagamento.");
      return;
    }

    // ALTERAÇÃO: Validar dados necessários para métodos de pagamento específicos
    // Se selecionou cartão mas não escolheu tipo (crédito/débito), abrir modal
    if (state.formaPagamento === "cartao" && !state.tipoCartao) {
      abrirModalTipoCartao();
      return;
    }

    // ALTERAÇÃO: Se selecionou dinheiro mas não informou valor do troco (e há valor a pagar), abrir modal
    // Mas apenas se NÃO for pedido de balcão (pickup)
    if (state.formaPagamento === "dinheiro") {
      const isPickup = isPickupOrder();
      // Para pedidos de balcão, não exigir troco
      if (isPickup) {
        state.valorTroco = null;
        atualizarExibicaoTroco();
      } else {
        // Verificar se há valor a pagar e se não foi informado o valor do troco
        const valorTotal = state.total;
        const temValorAPagar = Number.isFinite(valorTotal) && valorTotal > 0;
        
        if (temValorAPagar && (!state.valorTroco || !Number.isFinite(state.valorTroco) || state.valorTroco <= 0)) {
          abrirModalTroco();
          return;
        }
      }
    }

    // Se todas as validações passaram, abrir modal de revisão
    abrirModalRevisao();
  }

  function abrirModalRevisao() {
    // Atualizar exibição antes de abrir a modal
    atualizarExibicaoPagamento();
    atualizarExibicaoTroco();
    atualizarExibicaoTipoCartao(); // ALTERAÇÃO: Atualizar exibição do tipo de cartão

    if (typeof window.abrirModal === "function") {
      window.abrirModal("modal-revisao");
    } else {
      const modal = document.getElementById("modal-revisao");
      if (modal) {
        modal.style.display = "flex";
        modal.classList.add("show");
      }
    }
  }

  function fecharModalRevisao() {
    if (typeof window.fecharModal === "function") {
      window.fecharModal("modal-revisao");
    } else {
      const modal = document.getElementById("modal-revisao");
      if (modal) {
        modal.style.display = "none";
        modal.classList.remove("show");
      }
    }
  }

  function confirmarTroco() {
    // ALTERAÇÃO: Validação de segurança - não processar troco para pedidos de balcão
    const isPickup = isPickupOrder();
    if (isPickup) {
      state.valorTroco = null;
      fecharModalTroco();
      atualizarExibicaoTroco();
      atualizarExibicaoPagamento();
      return;
    }

    const valor = el.valorTroco?.value?.trim();
    // Validação robusta: usar Number.isFinite ao invés de isNaN
    const valorPago = parseFloat(valor);
    const valorTotal = state.total;
    const isFullyPaidWithPoints =
      Number.isFinite(valorTotal) &&
      valorTotal <= 0 &&
      state.usarPontos &&
      state.pontosParaUsar > 0;

    // Se o pedido está completamente pago com pontos, não precisa de troco
    if (isFullyPaidWithPoints) {
      state.valorTroco = null;
      fecharModalTroco();
      atualizarExibicaoTroco();
      atualizarExibicaoPagamento();
      return;
    }

    // Validação normal para pedidos com valor
    if (!valor || !Number.isFinite(valorPago) || valorPago <= 0) {
      showError("Digite um valor válido para o troco.");
      return;
    }

    // Validação: garantir que valorTotal também é um número válido
    if (!Number.isFinite(valorTotal) || valorPago < valorTotal) {
      const valorPagoFormatado = valorPago.toFixed(2).replace(".", ",");
      const totalFormatado = (valorTotal || 0).toFixed(2).replace(".", ",");
      showError(
        `O valor pago (R$ ${valorPagoFormatado}) deve ser maior ou igual ao total do pedido (R$ ${totalFormatado}).`
      );
      return;
    }

    state.valorTroco = valorPago;
    fecharModalTroco();

    // Atualizar exibição do troco no card
    atualizarExibicaoTroco();

    // Atualizar exibição do pagamento
    atualizarExibicaoPagamento();

    // ALTERAÇÃO: Abrir modal de revisão automaticamente após confirmar troco
    // Pequeno delay para garantir que a modal de troco foi fechada
    setTimeout(() => {
      abrirModalRevisao();
    }, 300);
  }

  function atualizarExibicaoTroco() {
    if (!el.trocoInfo) return;

    const isPickup = isPickupOrder();
    const isFullyPaidWithPoints =
      state.total <= 0 && state.usarPontos && state.pontosParaUsar > 0;

    // ALTERAÇÃO: Não mostrar troco para pedidos de balcão (pickup)
    if (isPickup) {
      el.trocoInfo.style.display = "none";
      return;
    }

    // Se está pago com pontos, não mostrar troco
    if (isFullyPaidWithPoints) {
      el.trocoInfo.style.display = "none";
      return;
    }

    if (state.formaPagamento === "dinheiro" && state.valorTroco) {
      const valorTotal = state.total;
      const troco = state.valorTroco - valorTotal;

      if (troco > 0) {
        el.trocoInfo.textContent = `Troco: R$ ${troco
          .toFixed(2)
          .replace(".", ",")}`;
        el.trocoInfo.style.display = "block";
      } else {
        el.trocoInfo.textContent = "Valor exato";
        el.trocoInfo.style.display = "block";
      }
    } else {
      el.trocoInfo.style.display = "none";
    }
  }

  // Helper: Reabilitar botão de confirmação (reduz duplicação de código)
  function reabilitarBotaoConfirmar() {
    if (el.btnConfirmarPedido) {
      el.btnConfirmarPedido.disabled = false;
      el.btnConfirmarPedido.textContent = "Confirmar pedido";
    }
  }

  /**
   * Revalida estoque antes de finalizar pedido
   * ALTERAÇÃO: Validação preventiva de estoque no frontend antes do checkout
   * @returns {Promise<Object>} Resultado da validação { valid: boolean, items?: Array }
   */
  async function validateStockBeforeCheckout() {
    try {
      // Usar state.cesta que já está carregada
      const items = state.cesta || [];
      
      if (items.length === 0) {
        return { valid: true };
      }
      
      // Validar estoque de cada item
      const validationPromises = items.map(async (item) => {
        try {
          // Preparar extras no formato esperado pela API
          const extras = (item.extras || []).map(extra => ({
            ingredient_id: extra.id || extra.ingredient_id,
            quantity: extra.quantidade || extra.quantity || 1
          })).filter(extra => extra.ingredient_id && extra.quantity > 0);
          
          // Preparar base_modifications no formato esperado pela API
          const baseModifications = (item.base_modifications || []).map(bm => ({
            ingredient_id: bm.id || bm.ingredient_id,
            delta: bm.delta || 0
          })).filter(bm => bm.ingredient_id && bm.delta !== 0);
          
          const capacityData = await simulateProductCapacity(
            item.id, // product_id
            extras,
            item.quantidade, // quantity
            baseModifications
          );
          
          if (!capacityData.is_available || capacityData.max_quantity < item.quantidade) {
            return {
              valid: false,
              cartItemId: item.cartItemId,
              product: item.nome || `Produto #${item.id}`,
              message: capacityData.limiting_ingredient?.message || 
                      'Estoque insuficiente',
              maxQuantity: capacityData.max_quantity || 0
            };
          }
          
          return { valid: true };
        } catch (error) {
          // ALTERAÇÃO: Removido console.error em produção
          // TODO: REVISAR - Implementar logging estruturado condicional (apenas em modo debug)
          const isDev =
            typeof process !== "undefined" &&
            process.env?.NODE_ENV === "development";
          if (isDev) {
            console.error('Erro ao validar estoque do item:', error);
          }
          // Em caso de erro, permitir (backend validará)
          return { valid: true };
        }
      });
      
      const results = await Promise.all(validationPromises);
      const invalidItems = results.filter(r => !r.valid);
      
      if (invalidItems.length > 0) {
        return {
          valid: false,
          items: invalidItems
        };
      }
      
      return { valid: true };
    } catch (error) {
      // ALTERAÇÃO: Removido console.error em produção
      // TODO: REVISAR - Implementar logging estruturado condicional (apenas em modo debug)
      const isDev =
        typeof process !== "undefined" &&
        process.env?.NODE_ENV === "development";
      if (isDev) {
        console.error('Erro ao validar estoque:', error);
      }
      // Em caso de erro, permitir (backend validará no checkout)
      return { valid: true };
    }
  }

  async function confirmarPedido() {
    try {
      // Usar função centralizada para verificar pickup
      const isPickupOrderCheck = isPickupOrder();

      // Validar endereço (aceita pickup ou endereço com id)
      if (!state.endereco || (!isPickupOrderCheck && !state.endereco.id)) {
        showError("Selecione um endereço de entrega ou retirada no local.");
        return;
      }

      // Validar cesta (pode estar vazia se já foi processada, mas verificamos se o carrinho tem itens)
      if (!state.cesta || state.cesta.length === 0) {
        showError("Sua cesta está vazia!");
        return;
      }

      // Validação preventiva: verificar se todos os itens têm IDs válidos antes de enviar
      // O backend agora valida rigorosamente e rejeita IDs inválidos
      const itensInvalidos = state.cesta.filter((item) => {
        const productId = validateId(item.id);
        if (!productId) return true;

        // Verificar se há extras ou base_modifications com IDs inválidos
        const extrasInvalidos = item.extras?.some(
          (extra) => !validateId(extra.id)
        );
        const baseModsInvalidos = item.base_modifications?.some(
          (bm) => !validateId(bm.id)
        );

        return extrasInvalidos || baseModsInvalidos;
      });

      if (itensInvalidos.length > 0) {
        showError(
          "Alguns itens da sua cesta contêm dados inválidos. Por favor, recarregue a página e tente novamente."
        );
        // Recarregar cesta para obter dados atualizados
        await carregarCesta();
        return;
      }

      // Validar CPF se preenchido
      if (state.cpf && state.cpf.trim() !== "") {
        const cpfValidation = validateCPF(state.cpf);
        if (!cpfValidation.valid) {
          showError(cpfValidation.message || "CPF inválido!");
          return;
        }
      }

      // ALTERAÇÃO: Revalidar estoque antes de finalizar pedido
      // Mostrar loading no botão durante validação
      if (el.btnConfirmarPedido) {
        el.btnConfirmarPedido.disabled = true;
        el.btnConfirmarPedido.textContent = "Validando estoque...";
      }

      const stockValidation = await validateStockBeforeCheckout();
      
      if (!stockValidation.valid) {
        const messages = stockValidation.items.map(item => 
          `${item.product}: ${item.message}`
        ).join('\n');
        
        // Reabilitar botão antes de mostrar confirmação
        reabilitarBotaoConfirmar();
        
        const confirmed = await showConfirm({
          title: 'Estoque Insuficiente',
          message: `Os seguintes itens não têm estoque suficiente:\n\n${messages}\n\nDeseja remover esses itens e continuar?`,
          confirmText: 'Remover e Continuar',
          cancelText: 'Cancelar',
          type: 'warning'
        });
        
        if (confirmed) {
          // Remover itens sem estoque do carrinho
          let removedCount = 0;
          for (const invalidItem of stockValidation.items) {
            if (invalidItem.cartItemId) {
              try {
                const removeResult = await removeCartItem(invalidItem.cartItemId);
                if (removeResult.success) {
                  removedCount++;
                }
              } catch (error) {
                // ALTERAÇÃO: Removido console.error em produção
                // TODO: REVISAR - Implementar logging estruturado condicional (apenas em modo debug)
                const isDev =
                  typeof process !== "undefined" &&
                  process.env?.NODE_ENV === "development";
                if (isDev) {
                  console.error('Erro ao remover item do carrinho:', error);
                }
              }
            }
          }
          
          if (removedCount > 0) {
            // Recarregar cesta e atualizar interface
            await carregarCesta();
            renderItens();
            calcularTotais();
            renderResumo();
            
            showToast(
              `${removedCount} ${removedCount === 1 ? 'item foi removido' : 'itens foram removidos'} da sua cesta.`,
              { type: 'info', autoClose: 3000 }
            );
            
            // Verificar se ainda há itens na cesta
            if (state.cesta.length === 0) {
              showError("Sua cesta está vazia após remover itens sem estoque.");
              return;
            }
            
            // Tentar novamente após remover itens
            // Usar setTimeout para dar tempo da UI atualizar
            setTimeout(() => {
              confirmarPedido();
            }, 500);
          } else {
            showError("Não foi possível remover os itens. Por favor, remova manualmente e tente novamente.");
          }
        }
        return;
      }

      // Reabilitar botão após validação bem-sucedida
      reabilitarBotaoConfirmar();

      // Verificar se o pedido está completamente pago com pontos
      const isFullyPaidWithPoints =
        state.total <= 0 && state.usarPontos && state.pontosParaUsar > 0;

      // ALTERAÇÃO: Validação de pagamento movida para antes de abrir modal de revisão
      // A validação agora acontece ao clicar em "Fazer pedido" na página principal
      // Esta validação aqui é apenas um fallback de segurança
      if (!isFullyPaidWithPoints && !state.formaPagamento) {
        showError("Selecione uma forma de pagamento.");
        return;
      }

      // Validar totais apenas se não estiver completamente pago com pontos
      // Se está pago com pontos (total = 0), permitir finalizar
      if (!isFullyPaidWithPoints && state.total <= 0) {
        showError("Valor total inválido. Verifique sua cesta.");
        return;
      }

      // Calcular pontos para resgate (garantir que está sincronizado)
      // IMPORTANTE: O desconto pode ser aplicado sobre subtotal + entrega (se delivery)
      // conforme o backend calcula: total_with_delivery = subtotal + delivery_fee
      let pontosParaResgate = 0;
      if (
        state.usarPontos &&
        state.pontosDisponiveis > 0 &&
        state.pontosParaUsar > 0
      ) {
        // Calcular total antes do desconto (subtotal + taxa de entrega, se delivery)
        const totalAntesDesconto =
          state.subtotal + (isPickupOrderCheck ? 0 : state.taxaEntrega);

        // Validar novamente antes de enviar usando total com entrega
        const validacao = validatePointsRedemption(
          state.pontosDisponiveis,
          state.pontosParaUsar,
          totalAntesDesconto // Usar total com entrega para validação
        );

        if (validacao.valid) {
          pontosParaResgate = state.pontosParaUsar;
        } else {
          // Se inválido, usar máximo permitido
          pontosParaResgate = validacao.maxPoints || 0;
          if (pontosParaResgate > 0) {
            state.pontosParaUsar = pontosParaResgate;
            calcularTotais();
            renderResumo();
          }
        }
      }

      // ALTERAÇÃO: Mapear método de pagamento diferenciando crédito e débito
      // Se o pedido está completamente pago com pontos, usar um método especial ou null
      let backendPaymentMethod = null;
      if (!isFullyPaidWithPoints) {
        if (state.formaPagamento === "cartao") {
          // Usar o tipo de cartão selecionado na modal
          if (state.tipoCartao === "credito") {
            backendPaymentMethod = "credit";
          } else if (state.tipoCartao === "debito") {
            backendPaymentMethod = "debit";
          } else {
            // Se cartão selecionado mas sem tipo, usar crédito como padrão ou pedir seleção
            showError("Por favor, selecione o tipo de cartão (crédito ou débito).");
            reabilitarBotaoConfirmar();
            return;
          }
        } else {
          const paymentMethodMap = {
            pix: "pix",
            dinheiro: "money",
          };
          backendPaymentMethod =
            paymentMethodMap[state.formaPagamento] || state.formaPagamento;
        }

        // Validar que o método de pagamento foi mapeado corretamente
        if (!backendPaymentMethod || backendPaymentMethod.trim() === "") {
          showError(
            "Método de pagamento inválido. Por favor, selecione novamente."
          );
          return;
        }
      } else {
        // Pedido pago integralmente com pontos - usar pix como fallback (ou o backend pode aceitar null)
        backendPaymentMethod = "pix"; // Valor padrão, mas o pagamento será via pontos
      }

      // Preparar dados do pedido para API
      // IMPORTANTE: Quando use_cart=true, NÃO enviamos items manualmente
      // O backend Python buscará os items diretamente do carrinho do usuário no banco de dados
      // e processará automaticamente:
      //   1. Validação de estoque com conversão de unidades (validate_stock_for_items)
      //   2. Cálculo de consumo convertido para unidade do estoque (_calculate_consumption_in_stock_unit)
      //   3. Dedução de estoque após criação do pedido (deduct_stock_for_order)
      //
      // O backend espera que os itens do carrinho estejam no formato:
      //   - product_id: int
      //   - quantity: int >= 1
      //   - extras: [{ ingredient_id: int, quantity: int >= 1 }]
      //   - base_modifications: [{ ingredient_id: int, delta: int != 0 }]
      //
      // A conversão de unidades (ex: 100g → 0.100kg) é feita automaticamente pelo backend
      // usando BASE_PORTION_QUANTITY, BASE_PORTION_UNIT e STOCK_UNIT dos ingredientes
      
      // ALTERAÇÃO: Preparar informações de promoções para o backend aplicar descontos
      // O backend deve usar essas informações para calcular os valores com desconto
      const promotionsData = state.cesta
        .filter(item => item.promotion && item.promotion.id)
        .map(item => ({
          product_id: item.id,
          promotion_id: item.promotion.id,
          discount_percentage: item.promotion.discount_percentage || null,
          discount_value: item.promotion.discount_value || null
        }));
      
      const orderData = {
        payment_method: backendPaymentMethod,
        notes:
          state.cesta
            .map((item) =>
              item.observacao ? `${item.nome}: ${item.observacao}` : ""
            )
            .filter((note) => note)
            .join("; ") || "",
        cpf_on_invoice:
          state.cpf && state.cpf.trim() !== "" ? state.cpf.trim() : null,
        points_to_redeem: pontosParaResgate,
        use_cart: true, // CRÍTICO: Indica ao backend para usar o carrinho atual (busca do banco de dados)
        order_type: isPickupOrderCheck ? "pickup" : "delivery", // Especificar tipo de pedido (pickup ou delivery)
        // ALTERAÇÃO: Enviar informações de promoções para o backend aplicar descontos
        // O backend deve usar essas informações para calcular item_subtotal com desconto aplicado
        promotions: promotionsData.length > 0 ? promotionsData : undefined
      };

      // Se for delivery, validar e incluir address_id
      if (!isPickupOrderCheck) {
        if (!state.endereco || !state.endereco.id) {
          showError(
            "Endereço inválido. Por favor, selecione um endereço válido."
          );
          reabilitarBotaoConfirmar();
          return;
        }

        // Usar validateId para consistência com outras validações
        const addressId = validateId(state.endereco.id, "address_id");
        if (!addressId) {
          showError(
            "Endereço inválido. Por favor, selecione um endereço válido."
          );
          reabilitarBotaoConfirmar();
          return;
        }

        orderData.address_id = addressId;
      }
      // Nota: Para pickup, address_id não será incluído. orders.js garante remoção completa.

      // ALTERAÇÃO: Se dinheiro, enviar amount_paid (API calcula troco automaticamente)
      // Mas apenas se NÃO for pedido de balcão (pickup)
      if (!isFullyPaidWithPoints && state.formaPagamento === "dinheiro") {
        const isPickup = isPickupOrder();
        
        // Para pedidos de balcão, não enviar amount_paid (não precisa de troco)
        if (isPickup) {
          // Não incluir amount_paid para pedidos de balcão
        } else {
          // Para entregas, validar e enviar amount_paid
          if (!state.valorTroco || state.valorTroco === null) {
            showError(
              "Para pagamento em dinheiro, é necessário informar o valor pago."
            );
            reabilitarBotaoConfirmar();
            return;
          }

          // Validar e converter amount_paid (usar parseFloat para valores decimais)
          const amountPaid = parseFloat(state.valorTroco);
          // Validação robusta: verificar NaN e valores inválidos
          if (!Number.isFinite(amountPaid) || amountPaid <= 0) {
            showError("O valor pago deve ser um número válido maior que zero.");
            reabilitarBotaoConfirmar();
            return;
          }

          // Validar que amount_paid >= total (backend também valida, mas melhor prevenir)
          // Usar Number.isFinite para garantir que ambos os valores são números válidos
          if (!Number.isFinite(state.total) || amountPaid < state.total) {
            const valorPagoFormatado = amountPaid.toFixed(2).replace(".", ",");
            const totalFormatado = (state.total || 0)
              .toFixed(2)
              .replace(".", ",");
            showError(
              `O valor pago (R$ ${valorPagoFormatado}) deve ser maior ou igual ao total do pedido (R$ ${totalFormatado}).`
            );
            reabilitarBotaoConfirmar();
            return;
          }

          orderData.amount_paid = amountPaid;
        }
      }

      // Desabilitar botão para evitar duplicação
      if (el.btnConfirmarPedido) {
        el.btnConfirmarPedido.disabled = true;
        el.btnConfirmarPedido.textContent = "Processando...";
      }

      // Criar pedido via API
      criarPedidoAPI(orderData);
    } catch (err) {
      // Log apenas em desenvolvimento
      const isDev =
        typeof process !== "undefined" &&
        process.env?.NODE_ENV === "development";
      if (isDev) {
        console.error("Erro ao confirmar pedido:", err.message);
      }
      showError("Erro ao processar pedido. Tente novamente.");

      // Reabilitar botão em caso de erro
      reabilitarBotaoConfirmar();
    }
  }

  async function criarPedidoAPI(orderData) {
    try {
      const result = await createOrder(orderData);

      if (result.success && result.data) {
        state.pedidoConfirmado = true;
        fecharModalRevisao();

        // Mostrar sucesso com informações do pedido
        const orderId = result.data.id || result.data.order_id;
        const confirmationCode = result.data.confirmation_code;

        // NOTA: Os pontos serão creditados automaticamente quando o pedido for concluído (status='completed')
        // O backend credita pontos em update_order_status quando o status muda para 'completed'

        // Calcular e informar pontos que serão ganhos (baseado no subtotal)
        // Importante: pontos são calculados sobre subtotal (sem taxa de entrega)
        let pontosPrevistos = 0;
        const baseParaPontos = state.subtotal; // Subtotal já considera desconto proporcional se houver

        try {
          // Usar settingsHelper importado estaticamente
          if (
            settingsHelper &&
            typeof settingsHelper.calculatePointsEarned === "function"
          ) {
            pontosPrevistos = await settingsHelper.calculatePointsEarned(
              baseParaPontos
            );
          } else {
            // Fallback: 10 pontos por real (R$ 0,10 = 1 ponto)
            pontosPrevistos = Math.floor(baseParaPontos * 10);
          }
        } catch (error) {
          // Fallback em caso de erro
          pontosPrevistos = Math.floor(baseParaPontos * 10);
        }

        // Log para debug (apenas em desenvolvimento)
        // Não incluir dados sensíveis como CPF, valores de pagamento completos
        const isDev =
          typeof process !== "undefined" &&
          process.env?.NODE_ENV === "development";
        if (isDev) {
          console.log("Pedido criado com sucesso:", {
            orderId,
            confirmationCode,
            pontosPrevistos,
            // Não logar valores financeiros completos em produção
            subtotal: state.subtotal,
            total: state.total,
            orderType: orderData.order_type,
            // CPF e dados de pagamento não são logados por segurança
          });
        }

        let mensagem = "Pedido confirmado com sucesso!";

        if (confirmationCode) {
          mensagem += ` Código: ${confirmationCode}`;
        }

        // Informar pontos que serão creditados quando o pedido for concluído
        if (pontosPrevistos > 0) {
          mensagem += ` Você ganhará ${pontosPrevistos} pontos Royal quando o pedido for concluído!`;
        }

        showSuccess(mensagem);

        // Recarregar pontos do usuário (pode ter pontos de outros pedidos)
        // Os pontos deste pedido serão creditados quando o status mudar para 'completed'
        try {
          await carregarPontos();
        } catch (error) {
          // Log apenas em desenvolvimento
          if (isDev) {
            console.warn(
              "Erro ao recarregar pontos após pedido:",
              error.message
            );
          }
        }

        // Limpar cesta local se houver (a API já limpa o carrinho)
        if (typeof window.atualizarCesta === "function") {
          await window.atualizarCesta();
        }

        // Redirecionar para página de histórico após breve delay
        setTimeout(() => {
          window.location.href = "hist-pedidos.html";
        }, 2000);
      } else {
        // Tratar erros específicos da API
        let errorMessage = result.error || "Erro ao criar pedido";

        // Verificar se é erro de migração do banco de dados
        const errorLower = errorMessage.toLowerCase();
        const isMigrationError =
          errorLower.includes("change_for_amount") ||
          errorLower.includes("migração") ||
          errorLower.includes("alter table") ||
          errorLower.includes("coluna") ||
          errorLower.includes("column") ||
          errorLower.includes("database_error");

        if (isMigrationError) {
          errorMessage =
            "⚠️ Erro no banco de dados: A coluna CHANGE_FOR_AMOUNT não existe.\n\nExecute a seguinte migração SQL no banco:\n\nALTER TABLE ORDERS ADD CHANGE_FOR_AMOUNT DECIMAL(10,2);";
        }
        // Mapear outros erros conhecidos para mensagens amigáveis
        else if (errorMessage.includes("STORE_CLOSED")) {
          errorMessage =
            "A loja está fechada no momento. Tente novamente durante o horário de funcionamento.";
        } else if (errorMessage.includes("EMPTY_CART")) {
          errorMessage =
            "Seu carrinho está vazio. Adicione itens antes de finalizar o pedido.";
        } else if (errorMessage.includes("INVALID_ADDRESS")) {
          errorMessage = "Endereço inválido. Selecione um endereço válido.";
        } else if (errorMessage.includes("INVALID_CPF")) {
          errorMessage = "CPF inválido. Verifique o CPF informado.";
        } else if (errorMessage.includes("INVALID_DISCOUNT")) {
          errorMessage =
            "Valor do desconto inválido. Verifique os pontos selecionados.";
        } else if (
          errorMessage.includes("INSUFFICIENT_STOCK") ||
          errorMessage.toLowerCase().includes("estoque insuficiente")
        ) {
          // Erro de estoque insuficiente - a mensagem do backend já vem formatada com unidades e valores
          // Exemplo: "Estoque insuficiente para Pão. Disponível: 17.000 kg, Necessário: 56.000 kg"
          // Manter a mensagem original do backend e adicionar instrução ao usuário
          errorMessage = `⚠️ ${errorMessage}\n\nPor favor, verifique sua cesta e remova itens que não estão mais disponíveis. Você pode atualizar a cesta e tentar novamente.`;
        } else if (
          errorMessage.includes("STOCK_VALIDATION_ERROR") ||
          errorMessage.toLowerCase().includes("erro na conversão de unidades")
        ) {
          // Erro de validação de estoque ou conversão de unidades
          // A mensagem do backend pode incluir detalhes sobre o problema de conversão
          if (errorMessage.toLowerCase().includes("conversão")) {
            // Manter mensagem original que inclui detalhes da conversão
            errorMessage = `⚠️ ${errorMessage}\n\nPor favor, entre em contato com o suporte se o problema persistir.`;
          } else if (
            errorMessage.toLowerCase().includes("product id") ||
            errorMessage.toLowerCase().includes("id de produto")
          ) {
            // Erro específico de ID inválido - recarregar cesta pode ajudar
            errorMessage = `⚠️ ${errorMessage}\n\nPor favor, recarregue sua cesta e tente novamente.`;
          } else {
            errorMessage =
              "Erro ao verificar estoque disponível. Tente novamente em alguns instantes.";
          }
        } else if (errorMessage.includes("VALIDATION_ERROR")) {
          // Manter mensagem original de validação do backend (remover prefixo se existir)
          errorMessage = errorMessage
            .replace(/^VALIDATION_ERROR:\s*/i, "")
            .replace(/^VALIDATION_ERROR$/i, errorMessage);
        }

        showError(errorMessage);

        // Reabilitar botão
        reabilitarBotaoConfirmar();
      }
    } catch (error) {
      // Log apenas em desenvolvimento - não expor detalhes sensíveis em produção
      const isDev =
        typeof process !== "undefined" &&
        process.env?.NODE_ENV === "development";
      if (isDev) {
        // Log apenas mensagem de erro, não objeto completo (pode conter dados sensíveis)
        console.error(
          "Erro ao criar pedido:",
          error?.message || "Erro desconhecido"
        );
      }

      showError("Erro ao processar pedido. Tente novamente.");

      // Reabilitar botão
      reabilitarBotaoConfirmar();
    }
  }

  function atualizarExibicaoPagamento() {
    // Atualizar endereço na modal de revisão
    const isPickup = isPickupOrder();
    const enderecoDiv = document.querySelector(
      "#modal-revisao .conteudo-modal > div:nth-child(2)"
    );
    if (enderecoDiv) {
      const enderecoIcon = enderecoDiv.querySelector("i");
      const enderecoTexts = enderecoDiv.querySelectorAll("div p");

      // Atualizar ícone - usar loja para pickup, location para entrega
      if (enderecoIcon) {
        if (isPickup) {
          enderecoIcon.className = "fa-solid fa-store";
        } else {
          enderecoIcon.className = "fa-solid fa-location-dot";
        }
      }

      // Atualizar textos do endereço
      if (enderecoTexts.length >= 2) {
        if (isPickup) {
          enderecoTexts[0].textContent = "Retirar no Local";
          enderecoTexts[1].textContent = "Balcão - Retirada na loja";
        } else {
          // Manter endereço normal ou atualizar se necessário
          const rua =
            state.endereco?.street ||
            state.endereco?.rua ||
            "Endereço não informado";
          const numero = state.endereco?.number || state.endereco?.numero || "";
          const bairro =
            state.endereco?.neighborhood ||
            state.endereco?.district ||
            state.endereco?.bairro ||
            "";
          const cidade = state.endereco?.city || state.endereco?.cidade || "";

          enderecoTexts[0].textContent = numero ? `${rua}, ${numero}` : rua;
          enderecoTexts[1].textContent = cidade
            ? `${bairro} - ${cidade}`
            : bairro || "Localização não informada";
        }
      }
    }

    // Atualizar tempo estimado na modal de revisão
    atualizarExibicaoTempo();

    // Atualizar ícones de pagamento na modal de revisão
    const pixIcon = document.querySelector("#modal-revisao .fa-pix");
    const cartaoIcon = document.querySelector("#modal-revisao .fa-credit-card");
    const dinheiroIcon = document.querySelector(
      "#modal-revisao .fa-money-bill"
    );

    // Encontrar os textos de pagamento
    const pagamentoDiv = document.querySelector(
      "#modal-revisao .conteudo-modal > div:last-child"
    );
    const pagamentoTexts = pagamentoDiv
      ? pagamentoDiv.querySelectorAll("p")
      : [];

    // Esconder todos os ícones
    [pixIcon, cartaoIcon, dinheiroIcon].forEach((icon) => {
      if (icon) icon.style.display = "none";
    });

    // Esconder todos os textos de pagamento
    pagamentoTexts.forEach((text) => {
      if (text) text.style.display = "none";
    });

    // ALTERAÇÃO: Lógica atualizada para usar state.formaPagamento === "cartao" e state.tipoCartao
    // Mostrar apenas o selecionado
    if (state.formaPagamento === "pix") {
      if (pixIcon) pixIcon.style.display = "flex";
      if (pagamentoTexts[0]) pagamentoTexts[0].style.display = "block"; // "Pagamento na entrega"
      // Esconder outros textos de pagamento
      const modalPixText = document.getElementById("modal-pagamento-pix");
      const modalCreditoText = document.getElementById("modal-pagamento-credito");
      const modalDebitoText = document.getElementById("modal-pagamento-debito");
      const modalDinheiroText = document.getElementById("modal-pagamento-dinheiro");
      if (modalPixText) modalPixText.style.display = "block";
      if (modalCreditoText) modalCreditoText.style.display = "none";
      if (modalDebitoText) modalDebitoText.style.display = "none";
      if (modalDinheiroText) modalDinheiroText.style.display = "none";
    } else if (state.formaPagamento === "cartao") {
      // Mostrar ícone de cartão
      if (cartaoIcon) cartaoIcon.style.display = "flex";
      if (pagamentoTexts[0]) pagamentoTexts[0].style.display = "block"; // "Pagamento na entrega"
      
      // Esconder outros textos
      const modalPixText = document.getElementById("modal-pagamento-pix");
      const modalCreditoText = document.getElementById("modal-pagamento-credito");
      const modalDebitoText = document.getElementById("modal-pagamento-debito");
      const modalDinheiroText = document.getElementById("modal-pagamento-dinheiro");
      
      if (modalPixText) modalPixText.style.display = "none";
      if (modalDinheiroText) modalDinheiroText.style.display = "none";
      
      // Mostrar texto baseado no tipo de cartão selecionado
      if (state.tipoCartao === "credito") {
        if (modalCreditoText) modalCreditoText.style.display = "block";
        if (modalDebitoText) modalDebitoText.style.display = "none";
      } else if (state.tipoCartao === "debito") {
        if (modalCreditoText) modalCreditoText.style.display = "none";
        if (modalDebitoText) modalDebitoText.style.display = "block";
      }
    } else if (state.formaPagamento === "dinheiro") {
      const isPickup = isPickupOrder();
      // Verificar se o pedido está completamente pago com pontos
      const isFullyPaidWithPoints =
        state.total <= 0 && state.usarPontos && state.pontosParaUsar > 0;

      // ALTERAÇÃO: Para pedidos de balcão, não mostrar informação de troco
      if (isPickup) {
        state.valorTroco = null;
      }

      // Forçar limpeza do troco se o pedido está pago com pontos
      if (isFullyPaidWithPoints && state.valorTroco !== null) {
        state.valorTroco = null;
      }

      if (dinheiroIcon) dinheiroIcon.style.display = "flex";
      if (pagamentoTexts[0]) pagamentoTexts[0].style.display = "block"; // "Pagamento na entrega"
      
      // Esconder outros textos de pagamento
      const modalPixText = document.getElementById("modal-pagamento-pix");
      const modalCreditoText = document.getElementById("modal-pagamento-credito");
      const modalDebitoText = document.getElementById("modal-pagamento-debito");
      const modalDinheiroText = document.getElementById("modal-pagamento-dinheiro");
      
      if (modalPixText) modalPixText.style.display = "none";
      if (modalCreditoText) modalCreditoText.style.display = "none";
      if (modalDebitoText) modalDebitoText.style.display = "none";

      // ALTERAÇÃO: Para pedidos de balcão, mostrar apenas "Dinheiro" sem informação de troco
      if (isPickup) {
        if (modalDinheiroText) {
          modalDinheiroText.textContent = "Dinheiro";
          modalDinheiroText.style.display = "block";
        }
      } else if (isFullyPaidWithPoints) {
        // Se está pago com pontos, mostrar apenas "Pago com pontos" ou "Dinheiro" sem troco
        if (modalDinheiroText) {
          modalDinheiroText.textContent = "Dinheiro - Pago com pontos";
          modalDinheiroText.style.display = "block";
        }
      } else if (state.valorTroco) {
        // Atualizar texto do dinheiro com troco se necessário (apenas para entregas)
        if (modalDinheiroText) {
          const troco = state.valorTroco - state.total;
          if (troco > 0) {
            modalDinheiroText.textContent = `Dinheiro - Troco: R$ ${troco
              .toFixed(2)
              .replace(".", ",")}`;
          } else {
            modalDinheiroText.textContent = "Dinheiro - Valor exato";
          }
          modalDinheiroText.style.display = "block";
        }
      } else {
        if (modalDinheiroText) {
          modalDinheiroText.textContent = "Dinheiro";
          modalDinheiroText.style.display = "block";
        }
      }
    }
  }

  // Expor funções globalmente para uso nos botões
  window.abrirModalEnderecos = abrirModalEnderecos;
  window.abrirModalEnderecoForm = abrirModalEnderecoForm;
  window.selecionarEnderecoModal = selecionarEnderecoModal;
  window.selecionarEndereco = selecionarEndereco;
  window.abrirModalTroco = abrirModalTroco;
  window.abrirModalRevisao = abrirModalRevisao;
  window.fecharModalRevisao = fecharModalRevisao;
  window.confirmarTroco = confirmarTroco;
  window.confirmarPedido = confirmarPedido;

  // Verificar se usuário está logado
  if (typeof window.isUserLoggedIn === "function" && !window.isUserLoggedIn()) {
    showError("Você precisa estar logado para acessar esta página.");
    window.location.href = "login.html";
    return;
  }

  // Inicializar página
  document.addEventListener("DOMContentLoaded", init);
})();
