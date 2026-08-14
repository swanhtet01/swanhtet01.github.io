import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceRequestPaymentAdapterFulfilmentBrief = {
  totalRequests: number
  payOnPickupPickupCount: number
  payOnPickupDeliveryCount: number
  cashOnDeliveryPickupCount: number
  cashOnDeliveryDeliveryCount: number
  kbzpayManualPickupCount: number
  kbzpayManualDeliveryCount: number
}

export function projectEcommerceRequestPaymentAdapterFulfilmentBrief(
  buying: EcommerceBuyingState,
): EcommerceRequestPaymentAdapterFulfilmentBrief {
  const total = buying.requests.length
  if (total === 0) {
    return {
      totalRequests: 0,
      payOnPickupPickupCount: 0,
      payOnPickupDeliveryCount: 0,
      cashOnDeliveryPickupCount: 0,
      cashOnDeliveryDeliveryCount: 0,
      kbzpayManualPickupCount: 0,
      kbzpayManualDeliveryCount: 0,
    }
  }

  let payOnPickupPickupCount = 0
  let payOnPickupDeliveryCount = 0
  let cashOnDeliveryPickupCount = 0
  let cashOnDeliveryDeliveryCount = 0
  let kbzpayManualPickupCount = 0
  let kbzpayManualDeliveryCount = 0

  for (const req of buying.requests) {
    const adapter = req.quote.payment.adapter
    const isPickup = req.fulfilment === 'pickup'
    if (adapter === 'pay_on_pickup') {
      if (isPickup) payOnPickupPickupCount++
      else payOnPickupDeliveryCount++
    } else if (adapter === 'cash_on_delivery') {
      if (isPickup) cashOnDeliveryPickupCount++
      else cashOnDeliveryDeliveryCount++
    } else {
      if (isPickup) kbzpayManualPickupCount++
      else kbzpayManualDeliveryCount++
    }
  }

  return {
    totalRequests: total,
    payOnPickupPickupCount,
    payOnPickupDeliveryCount,
    cashOnDeliveryPickupCount,
    cashOnDeliveryDeliveryCount,
    kbzpayManualPickupCount,
    kbzpayManualDeliveryCount,
  }
}
