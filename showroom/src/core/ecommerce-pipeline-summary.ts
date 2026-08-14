import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceFulfilmentMetrics = {
  count: number
  valueMmk: number
}

export type EcommercePipelineSummary = {
  totalRequests: number
  totalRequestValueMmk: number
  averageRequestValueMmk: number
  byFulfilment: Record<string, EcommerceFulfilmentMetrics>
  pendingReturnIntents: number
  pendingCancellationIntents: number
}

export function projectEcommercePipelineSummary(
  buying: EcommerceBuyingState,
  date?: string,
): EcommercePipelineSummary {
  const filter = date ? (ts: string) => ts.startsWith(date) : () => true

  let totalRequestValueMmk = 0
  const byFulfilment: Record<string, EcommerceFulfilmentMetrics> = {}

  const filteredRequests = buying.requests.filter((r) => filter(r.createdAt))
  for (const req of filteredRequests) {
    totalRequestValueMmk += req.totalMmk
    const entry = byFulfilment[req.fulfilment] ?? { count: 0, valueMmk: 0 }
    entry.count += 1
    entry.valueMmk += req.totalMmk
    byFulfilment[req.fulfilment] = entry
  }

  const totalRequests = filteredRequests.length
  const pendingReturnIntents = buying.returnIntents.filter((r) => filter(r.createdAt)).length
  const pendingCancellationIntents = buying.cancellationIntents.filter((c) => filter(c.createdAt)).length

  return {
    totalRequests,
    totalRequestValueMmk,
    averageRequestValueMmk: totalRequests > 0 ? Math.round(totalRequestValueMmk / totalRequests) : 0,
    byFulfilment,
    pendingReturnIntents,
    pendingCancellationIntents,
  }
}
