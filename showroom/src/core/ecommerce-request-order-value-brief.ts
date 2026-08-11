import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceRequestOrderValueBrief = {
  totalRequests: number
  totalValueMmk: number
  minValueMmk: number | null
  maxValueMmk: number | null
  averageValueMmk: number
}

export function projectEcommerceRequestOrderValueBrief(
  buying: EcommerceBuyingState,
): EcommerceRequestOrderValueBrief {
  let totalValueMmk = 0
  let minValueMmk: number | null = null
  let maxValueMmk: number | null = null

  for (const req of buying.requests) {
    const v = req.totalMmk
    totalValueMmk += v
    if (minValueMmk === null || v < minValueMmk) minValueMmk = v
    if (maxValueMmk === null || v > maxValueMmk) maxValueMmk = v
  }

  const totalRequests = buying.requests.length

  return {
    totalRequests,
    totalValueMmk,
    minValueMmk,
    maxValueMmk,
    averageValueMmk: totalRequests > 0 ? Math.round(totalValueMmk / totalRequests) : 0,
  }
}
