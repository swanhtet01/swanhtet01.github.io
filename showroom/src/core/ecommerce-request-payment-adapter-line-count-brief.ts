import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceRequestPaymentAdapterLineCountBrief = {
  totalRequests: number
  cashOnDeliverySingleCount: number
  cashOnDeliveryMultiCount: number
  kbzpaySingleCount: number
  kbzpayMultiCount: number
  payOnPickupSingleCount: number
  payOnPickupMultiCount: number
}

export function projectEcommerceRequestPaymentAdapterLineCountBrief(
  buying: EcommerceBuyingState,
): EcommerceRequestPaymentAdapterLineCountBrief {
  const total = buying.requests.length
  if (total === 0) {
    return {
      totalRequests: 0,
      cashOnDeliverySingleCount: 0,
      cashOnDeliveryMultiCount: 0,
      kbzpaySingleCount: 0,
      kbzpayMultiCount: 0,
      payOnPickupSingleCount: 0,
      payOnPickupMultiCount: 0,
    }
  }

  let cashOnDeliverySingleCount = 0
  let cashOnDeliveryMultiCount = 0
  let kbzpaySingleCount = 0
  let kbzpayMultiCount = 0
  let payOnPickupSingleCount = 0
  let payOnPickupMultiCount = 0

  for (const request of buying.requests) {
    const adapter = request.quote.payment.adapter
    const isSingle = request.lines.length === 1
    if (adapter === 'cash_on_delivery') {
      if (isSingle) cashOnDeliverySingleCount++
      else cashOnDeliveryMultiCount++
    } else if (adapter === 'kbzpay_manual') {
      if (isSingle) kbzpaySingleCount++
      else kbzpayMultiCount++
    } else {
      if (isSingle) payOnPickupSingleCount++
      else payOnPickupMultiCount++
    }
  }

  return {
    totalRequests: total,
    cashOnDeliverySingleCount,
    cashOnDeliveryMultiCount,
    kbzpaySingleCount,
    kbzpayMultiCount,
    payOnPickupSingleCount,
    payOnPickupMultiCount,
  }
}
