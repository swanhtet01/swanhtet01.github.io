import type { CommerceState } from './commerce-workspace.ts'
import type { ProductionState } from './production-workspace.ts'
import { projectShopOrderProductionStatus, projectJobFulfillmentReconciliation } from './shop-production-status.ts'

export type CrossProductOperatingSummary = {
  asOf: string
  ordersWithCoverage: number
  ordersWithoutCoverage: number
  ordersOnHold: number
  ordersAllCompleted: number
  closedJobsTotal: number
  closedJobsReconciled: number
  closedJobsWithGap: number
  totalReceiptGap: number
}

export function projectCrossProductOperatingSummary(
  commerce: CommerceState,
  production: ProductionState,
  asOf: string,
): CrossProductOperatingSummary {
  const orderStatuses = projectShopOrderProductionStatus(commerce, production)
  const reconciliations = projectJobFulfillmentReconciliation(production, commerce)

  const linkedOrderIds = new Set(orderStatuses.map((o) => o.orderId))
  const openOrderIds = new Set(commerce.orders.map((o) => o.id))

  const ordersWithCoverage = orderStatuses.length
  const ordersWithoutCoverage = [...openOrderIds].filter((id) => !linkedOrderIds.has(id)).length

  let ordersOnHold = 0
  let ordersAllCompleted = 0
  for (const order of orderStatuses) {
    const hasHold = order.linkedJobs.some((j) => j.status === 'on-hold')
    const allDone = order.linkedJobs.every((j) => j.status === 'completed' || j.status === 'closed-short')
    if (hasHold) ordersOnHold += 1
    if (allDone) ordersAllCompleted += 1
  }

  const closedJobsTotal = reconciliations.length
  const closedJobsReconciled = reconciliations.filter((r) => r.reconciled).length
  const closedJobsWithGap = reconciliations.filter((r) => !r.reconciled).length
  const totalReceiptGap = reconciliations.reduce((sum, r) => sum + r.gap, 0)

  return { asOf, ordersWithCoverage, ordersWithoutCoverage, ordersOnHold, ordersAllCompleted, closedJobsTotal, closedJobsReconciled, closedJobsWithGap, totalReceiptGap }
}
