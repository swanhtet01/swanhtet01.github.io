import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceRequestPaymentAdapterBrief = {
  totalRequests: number
  payOnPickupCount: number
  cashOnDeliveryCount: number
  kbzpayManualCount: number
  payOnPickupRate: number
  cashOnDeliveryRate: number
  kbzpayManualRate: number
}

export function projectEcommerceRequestPaymentAdapterBrief(
  buying: EcommerceBuyingState,
): EcommerceRequestPaymentAdapterBrief {
  let payOnPickupCount = 0
  let cashOnDeliveryCount = 0
  let kbzpayManualCount = 0

  for (const req of buying.requests) {
    const adapter = req.quote.payment.adapter
    if (adapter === 'pay_on_pickup') payOnPickupCount++
    else if (adapter === 'cash_on_delivery') cashOnDeliveryCount++
    else kbzpayManualCount++
  }

  const totalRequests = payOnPickupCount + cashOnDeliveryCount + kbzpayManualCount

  return {
    totalRequests,
    payOnPickupCount,
    cashOnDeliveryCount,
    kbzpayManualCount,
    payOnPickupRate: totalRequests > 0 ? Math.round((payOnPickupCount / totalRequests) * 100) : 0,
    cashOnDeliveryRate:
      totalRequests > 0 ? Math.round((cashOnDeliveryCount / totalRequests) * 100) : 0,
    kbzpayManualRate:
      totalRequests > 0 ? Math.round((kbzpayManualCount / totalRequests) * 100) : 0,
  }
}
