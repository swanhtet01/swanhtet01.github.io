import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'
export type EcommerceSupportIntentCategoryBrief = {
  totalIntents: number; uniqueCategories: number; topCategory: string | null; topCategoryCount: number
}
export function projectEcommerceSupportIntentCategoryBrief(buying: EcommerceBuyingState): EcommerceSupportIntentCategoryBrief {
  const total = buying.supportIntents.length
  if (total === 0) return { totalIntents: 0, uniqueCategories: 0, topCategory: null, topCategoryCount: 0 }
  const counts = new Map<string, number>()
  for (const intent of buying.supportIntents) {
    counts.set(intent.category, (counts.get(intent.category) ?? 0) + 1)
  }
  let topCategory: string | null = null; let topCategoryCount = 0
  for (const [key, count] of counts) { if (count > topCategoryCount) { topCategoryCount = count; topCategory = key } }
  return { totalIntents: total, uniqueCategories: counts.size, topCategory, topCategoryCount }
}
