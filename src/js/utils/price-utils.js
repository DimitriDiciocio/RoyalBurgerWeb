/**
 * Utilitários para cálculo de preços com promoções
 * Garante consistência na aplicação de descontos em todos os lugares
 */

/**
 * Calcula o preço final de um produto considerando promoção
 * @param {number} originalPrice - Preço original do produto
 * @param {Object|null} promotion - Dados da promoção (opcional)
 * @returns {Object} Objeto com preço final, percentual de desconto e informações para exibição
 */
export function calculatePriceWithPromotion(originalPrice, promotion = null) {
  const price = parseFloat(originalPrice) || 0;
  
  // Se não há promoção, retornar preço original
  if (!promotion || (!promotion.discount_value && !promotion.discount_percentage)) {
    return {
      originalPrice: price,
      finalPrice: price,
      discountValue: 0,
      discountPercentage: 0,
      hasPromotion: false,
    };
  }
  
  let finalPrice = price;
  let discountValue = 0;
  let discountPercentage = 0;
  
  // ALTERAÇÃO: Calcular desconto por valor fixo ou percentual
  if (promotion.discount_value && parseFloat(promotion.discount_value) > 0) {
    // Desconto por valor fixo
    discountValue = parseFloat(promotion.discount_value);
    finalPrice = price - discountValue;
    // Calcular percentual equivalente para exibição
    discountPercentage = price > 0 ? (discountValue / price) * 100 : 0;
  } else if (promotion.discount_percentage && parseFloat(promotion.discount_percentage) > 0) {
    // Desconto por percentual
    discountPercentage = parseFloat(promotion.discount_percentage);
    discountValue = price * (discountPercentage / 100);
    finalPrice = price - discountValue;
  }
  
  // Garantir que o preço final não seja negativo
  finalPrice = Math.max(0, finalPrice);
  
  return {
    originalPrice: price,
    finalPrice: finalPrice,
    discountValue: discountValue,
    discountPercentage: discountPercentage,
    hasPromotion: true,
  };
}

/**
 * Formata preço para exibição em reais
 * @param {number} price - Preço a ser formatado
 * @returns {string} Preço formatado (ex: "R$ 10,50")
 */
export function formatPrice(price) {
  const numPrice = parseFloat(price) || 0;
  return `R$ ${numPrice.toFixed(2).replace(".", ",")}`;
}

/**
 * Verifica se uma promoção está ativa (não expirada)
 * @param {Object} promotion - Dados da promoção
 * @returns {boolean} True se a promoção está ativa
 */
export function isPromotionActive(promotion) {
  if (!promotion || !promotion.expires_at) {
    return false;
  }
  
  const now = new Date();
  const expiresAt = new Date(promotion.expires_at);
  
  return expiresAt > now;
}


