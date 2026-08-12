import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceRequestPaymentAdapterPromotionBrief = {
  totalRequests: number
  cashOnDeliveryWithPromoCount: number
  cashOnDeliveryWithoutPromoCount: number
  kbzpayWithPromoCount: number
  kbzpayWithoutPromoCount: number
  payOnPickupWithPromoCount: number
  payOnPickupWithoutPromoCount: number
}

export function projectEcommerceRequestPaymentAdapterPromotionBrief(
  buying: EcommerceBuyingState,
): EcommerceRequestPaymentAdapterPromotionBrief {
  const total = buying.requests.length
  if (total === 0) {
    return {
      totalRequests: 0,
      cashOnDeliveryWithPromoCount: 0,
      cashOnDeliveryWithoutPromoCount: 0,
      kbzpayWithPromoCount: 0,
      kbzpayWithoutPromoCount: 0,
      payOnPickupWithPromoCount: 0,
      payOnPickupWithoutPromoCount: 0,
    }
  }

  let cashOnDeliveryWithPromoCount = 0
  let cashOnDeliveryWithoutPromoCount = 0
  let kbzpayWithPromoCount = 0
  let kbzpayWithoutPromoCount = 0
  let payOnPickupWithPromoCount = 0
  let payOnPickupWithoutPromoCount = 0

  for (const request of buying.requests) {
    const adapter = request.quote.payment.adapter
    const hasPromo = request.quote.promotion.code !== null
    if (adapter === 'cash_on_delivery') {
      if (hasPromo) cashOnDeliveryWithPromoCount++
      else cashOnDeliveryWithoutPromoCount++
    } else if (adapter === 'kbzpay_manual') {
      if (hasPromo) kbzpayWithPromoCount++
      else kbzpayWithoutPromoCount++
    } else {
      if (hasPromo) payOnPickupWithPromoCount++
      else payOnPickupWithoutPromoCount++
    }
  }

  return {
    totalRequests: total,
    cashOnDeliveryWithPromoCount,
    cashOnDeliveryWithoutPromoCount,
    kbzpayWithPromoCount,
    kbzpayWithoutPromoCount,
    payOnPickupWithPromoCount,
    payOnPickupWithoutPromoCount,
  }
}
