import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceRequestLineCountBrief = {
  totalRequests: number
  totalLines: number
  averageLinesPerRequest: number
  minLinesPerRequest: number | null
  maxLinesPerRequest: number | null
  singleLineCount: number
  singleLineRate: number
  multiLineCount: number
  multiLineRate: number
}

export function projectEcommerceRequestLineCountBrief(
  buying: EcommerceBuyingState,
): EcommerceRequestLineCountBrief {
  let totalLines = 0
  let singleLineCount = 0
  let multiLineCount = 0
  let minLinesPerRequest: number | null = null
  let maxLinesPerRequest: number | null = null

  for (const req of buying.requests) {
    const count = req.lines.length
    totalLines += count
    if (minLinesPerRequest === null || count < minLinesPerRequest) minLinesPerRequest = count
    if (maxLinesPerRequest === null || count > maxLinesPerRequest) maxLinesPerRequest = count
    if (count === 1) singleLineCount++
    else multiLineCount++
  }

  const totalRequests = buying.requests.length

  return {
    totalRequests,
    totalLines,
    averageLinesPerRequest: totalRequests > 0 ? Math.round(totalLines / totalRequests) : 0,
    minLinesPerRequest,
    maxLinesPerRequest,
    singleLineCount,
    singleLineRate: totalRequests > 0 ? Math.round((singleLineCount / totalRequests) * 100) : 0,
    multiLineCount,
    multiLineRate: totalRequests > 0 ? Math.round((multiLineCount / totalRequests) * 100) : 0,
  }
}
