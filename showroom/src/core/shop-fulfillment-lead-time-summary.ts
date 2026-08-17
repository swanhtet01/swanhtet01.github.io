import type { CommerceState } from './commerce-workspace.ts'

export type FulfillmentLeadTimeDistribution = {
  sameDay: number
  oneToThreeDays: number
  fourToSevenDays: number
  overOneWeek: number
}

export type ShopFulfillmentLeadTimeSummary = {
  completedWithTiming: number
  distribution: FulfillmentLeadTimeDistribution
  averageLeadTimeHours: number | null
  medianLeadTimeHours: number | null
  fastestLeadTimeHours: number | null
  slowestLeadTimeHours: number | null
}

export function projectShopFulfillmentLeadTimeSummary(
  commerce: CommerceState,
  date?: string,
): ShopFulfillmentLeadTimeSummary {
  const filter = date ? (ts: string) => ts.startsWith(date) : () => true

  const distribution: FulfillmentLeadTimeDistribution = { sameDay: 0, oneToThreeDays: 0, fourToSevenDays: 0, overOneWeek: 0 }
  const hours: number[] = []

  for (const order of commerce.orders) {
    if (order.status !== 'completed') continue
    if (!order.completion) continue
    if (!filter(order.createdAt)) continue
    const leadTimeHours = Math.floor(
      (Date.parse(order.completion.capturedAt) - Date.parse(order.createdAt)) / (1000 * 3600),
    )
    hours.push(leadTimeHours)
    if (leadTimeHours < 24) {
      distribution.sameDay++
    } else if (leadTimeHours < 72) {
      distribution.oneToThreeDays++
    } else if (leadTimeHours < 168) {
      distribution.fourToSevenDays++
    } else {
      distribution.overOneWeek++
    }
  }

  if (hours.length === 0) {
    return { completedWithTiming: 0, distribution, averageLeadTimeHours: null, medianLeadTimeHours: null, fastestLeadTimeHours: null, slowestLeadTimeHours: null }
  }

  hours.sort((a, b) => a - b)
  const mid = Math.floor(hours.length / 2)
  const medianLeadTimeHours =
    hours.length % 2 === 1
      ? hours[mid]
      : Math.round((hours[mid - 1] + hours[mid]) / 2)

  return {
    completedWithTiming: hours.length,
    distribution,
    averageLeadTimeHours: Math.round(hours.reduce((s, v) => s + v, 0) / hours.length),
    medianLeadTimeHours,
    fastestLeadTimeHours: hours[0],
    slowestLeadTimeHours: hours[hours.length - 1],
  }
}
