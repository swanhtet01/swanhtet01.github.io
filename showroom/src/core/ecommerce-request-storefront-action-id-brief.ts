import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'
export type EcommerceRequestStorefrontActionIdBrief = {
  totalRequests: number; trackedCount: number; uniqueActionIds: number; topActionId: string | null; topActionIdCount: number
}
export function projectEcommerceRequestStorefrontActionIdBrief(buying: EcommerceBuyingState) {
  const total = buying.requests.length
  if (total === 0) return { totalRequests: 0, trackedCount: 0, uniqueActionIds: 0, topActionId: null, topActionIdCount: 0 }
  const counts = new Map<string, number>()
  for (const request of buying.requests) {
    if (request.sourceStorefrontActionId !== null) {
      counts.set(request.sourceStorefrontActionId, (counts.get(request.sourceStorefrontActionId) ?? 0) + 1)
    }
  }
  let topActionId: string | null = null; let topActionIdCount = 0
  for (const [key, count] of counts) { if (count > topActionIdCount) { topActionIdCount = count; topActionId = key } }
  return { totalRequests: total, trackedCount: counts.size > 0 ? [...counts.values()].reduce((s, v) => s + v, 0) : 0, uniqueActionIds: counts.size, topActionId, topActionIdCount }
}
