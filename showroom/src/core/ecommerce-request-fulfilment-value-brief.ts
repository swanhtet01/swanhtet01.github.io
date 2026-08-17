import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceRequestFulfilmentValueBrief = {
  totalRequests: number
  pickupCount: number
  deliveryCount: number
  pickupRate: number
  deliveryRate: number
  totalValueMmk: number
  minValueMmk: number | null
  maxValueMmk: number | null
  averageValueMmk: number
}

export function projectEcommerceRequestFulfilmentValueBrief(
  buying: EcommerceBuyingState,
): EcommerceRequestFulfilmentValueBrief {
  const total = buying.requests.length
  if (total === 0)
    return {
      totalRequests: 0, pickupCount: 0, deliveryCount: 0, pickupRate: 0, deliveryRate: 0,
      totalValueMmk: 0, minValueMmk: null, maxValueMmk: null, averageValueMmk: 0,
    }
  let pickupCount = 0; let deliveryCount = 0
  let totalValueMmk = 0
  let minValueMmk: number | null = null; let maxValueMmk: number | null = null
  for (const req of buying.requests) {
    if (req.fulfilment === 'pickup') pickupCount++
    else deliveryCount++
    totalValueMmk += req.totalMmk
    if (minValueMmk === null || req.totalMmk < minValueMmk) minValueMmk = req.totalMmk
    if (maxValueMmk === null || req.totalMmk > maxValueMmk) maxValueMmk = req.totalMmk
  }
  return {
    totalRequests: total,
    pickupCount,
    deliveryCount,
    pickupRate: Math.round((pickupCount / total) * 100),
    deliveryRate: Math.round((deliveryCount / total) * 100),
    totalValueMmk,
    minValueMmk,
    maxValueMmk,
    averageValueMmk: Math.round(totalValueMmk / total),
  }
}
