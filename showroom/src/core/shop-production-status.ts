import type { CommerceState } from './commerce-workspace.ts'
import type { ProductionState } from './production-workspace.ts'

export type LinkedProductionJob = {
  jobId: string
  product: string
  line: string
  target: number
  output: number
  scrap: number
  progress: number
  status: 'active' | 'on-hold' | 'completed' | 'closed-short'
  dueAt?: string
  owner?: string
}

export type ShopOrderProductionStatus = {
  orderId: string
  customer: string
  item: string
  quantity: number
  createdAt: string
  linkedJobs: LinkedProductionJob[]
}

export type JobFulfillmentReconciliation = {
  jobId: string
  product: string
  closedAt: string | undefined
  output: number
  received: number
  receiptCount: number
  gap: number
  reconciled: boolean
}

export function projectShopOrderProductionStatus(
  commerce: CommerceState,
  production: ProductionState,
): ShopOrderProductionStatus[] {
  const jobsByOrderId = new Map<string, typeof production.jobs>()
  for (const job of production.jobs) {
    for (const orderId of job.shopDemandSource?.snapshot.sourceOrderIds ?? []) {
      const bucket = jobsByOrderId.get(orderId) ?? []
      bucket.push(job)
      jobsByOrderId.set(orderId, bucket)
    }
  }
  return commerce.orders
    .filter((order) => jobsByOrderId.has(order.id))
    .map((order) => ({
      orderId: order.id,
      customer: order.customer,
      item: order.item,
      quantity: order.quantity,
      createdAt: order.createdAt,
      linkedJobs: (jobsByOrderId.get(order.id) ?? []).map((job) => {
        const scrap = job.scrap ?? 0
        const accounted = job.output + scrap
        const progress = Math.min(100, Math.round((accounted / job.target) * 100))
        const status: LinkedProductionJob['status'] = job.closure
          ? (accounted >= job.target ? 'completed' : 'closed-short')
          : job.qualityHold ? 'on-hold'
          : 'active'
        return { jobId: job.id, product: job.product, line: job.line, target: job.target, output: job.output, scrap, progress, status, dueAt: job.dueAt, owner: job.owner }
      }),
    }))
}

export function projectJobFulfillmentReconciliation(
  production: ProductionState,
  commerce: CommerceState,
): JobFulfillmentReconciliation[] {
  return production.jobs
    .filter((job) => Boolean(job.closure))
    .map((job) => {
      const receipts = commerce.movements.filter((m) => m.kind === 'production_receipt' && m.productionJobId === job.id)
      const received = receipts.reduce((sum, m) => sum + m.quantityDelta, 0)
      const gap = job.output - received
      return { jobId: job.id, product: job.product, closedAt: job.closure?.closedAt, output: job.output, received, receiptCount: receipts.length, gap, reconciled: gap === 0 }
    })
}
