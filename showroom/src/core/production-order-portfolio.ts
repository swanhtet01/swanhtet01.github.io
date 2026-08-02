import {
  projectPlantOrder,
  validatePlantOrderState,
  type PlantOrderState,
} from './plant-order-foundation.ts'

export const PRODUCTION_ORDER_PORTFOLIO_CONTRACT = 'supermega.production.order_portfolio.v1' as const
export const PRODUCTION_ORDER_PORTFOLIO_MAX = 20

export type ProductionOrderPortfolioEntry = {
  jobId: string
  execution: PlantOrderState
}

export type ProductionOrderPortfolio = {
  contract: typeof PRODUCTION_ORDER_PORTFOLIO_CONTRACT
  entries: ProductionOrderPortfolioEntry[]
}

type ProductionOrderContainer = {
  orderExecution?: PlantOrderState
  orderPortfolio?: ProductionOrderPortfolio
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function exactFields(value: Record<string, unknown>, fields: string[], label: string) {
  const actual = Object.keys(value).sort()
  const expected = [...fields].sort()
  if (actual.length !== expected.length || actual.some((field, index) => field !== expected[index])) {
    throw new Error(`${label} fields are invalid.`)
  }
}

function canonicalJobId(value: unknown, label: string) {
  if (typeof value !== 'string') throw new Error(`${label} is invalid.`)
  const jobId = value.trim()
  if (!jobId || jobId.length > 80 || !/^[A-Z0-9][A-Z0-9._/-]{0,79}$/.test(jobId)) throw new Error(`${label} is invalid.`)
  return jobId
}

export function validateProductionOrderPortfolio(value: unknown): ProductionOrderPortfolio {
  if (!record(value)) throw new Error('Production order portfolio is invalid.')
  exactFields(value, ['contract', 'entries'], 'Production order portfolio')
  if (value.contract !== PRODUCTION_ORDER_PORTFOLIO_CONTRACT) throw new Error('Production order portfolio contract is invalid.')
  if (!Array.isArray(value.entries) || !value.entries.length || value.entries.length > PRODUCTION_ORDER_PORTFOLIO_MAX) {
    throw new Error(`Production order portfolio must retain 1 to ${PRODUCTION_ORDER_PORTFOLIO_MAX} reviewed orders.`)
  }
  const jobIds = new Set<string>()
  const planIds = new Set<string>()
  let previousJobId = ''
  const entries = value.entries.map((candidate, index): ProductionOrderPortfolioEntry => {
    if (!record(candidate)) throw new Error(`Production order portfolio entry ${index + 1} is invalid.`)
    exactFields(candidate, ['jobId', 'execution'], `Production order portfolio entry ${index + 1}`)
    const jobId = canonicalJobId(candidate.jobId, `Production order portfolio entry ${index + 1} job ID`)
    if (jobIds.has(jobId)) throw new Error(`Production order portfolio repeats job ${jobId}.`)
    if (previousJobId && jobId <= previousJobId) throw new Error('Production order portfolio entries must be sorted by job ID.')
    const execution = validatePlantOrderState(candidate.execution)
    const plan = projectPlantOrder(execution).plan
    if (!plan || plan.job.jobId !== jobId) throw new Error(`Production order portfolio entry ${jobId} must retain its reviewed job plan.`)
    if (planIds.has(plan.planId)) throw new Error(`Production order portfolio repeats plan ${plan.planId}.`)
    jobIds.add(jobId)
    planIds.add(plan.planId)
    previousJobId = jobId
    return { jobId, execution }
  })
  return { contract: PRODUCTION_ORDER_PORTFOLIO_CONTRACT, entries }
}

export function productionOrderPortfolioEntries(value: ProductionOrderContainer): ProductionOrderPortfolioEntry[] {
  if (value.orderPortfolio !== undefined) return validateProductionOrderPortfolio(value.orderPortfolio).entries
  if (value.orderExecution === undefined) return []
  const execution = validatePlantOrderState(value.orderExecution)
  const plan = projectPlantOrder(execution).plan
  return plan ? [{ jobId: plan.job.jobId, execution }] : []
}

export function productionOrderExecutionForJob(value: ProductionOrderContainer, jobId: string) {
  return productionOrderPortfolioEntries(value).find((entry) => entry.jobId === jobId)?.execution ?? null
}

export function upsertProductionOrderExecution<T extends ProductionOrderContainer>(value: T, executionValue: PlantOrderState): T {
  const execution = validatePlantOrderState(executionValue)
  const plan = projectPlantOrder(execution).plan
  if (!plan) throw new Error('A Production order portfolio entry requires one reviewed plan.')
  const retained = productionOrderPortfolioEntries(value).filter((entry) => entry.jobId !== plan.job.jobId)
  const entries = [...retained, { jobId: plan.job.jobId, execution }]
    .sort((left, right) => left.jobId < right.jobId ? -1 : left.jobId > right.jobId ? 1 : 0)
  const orderPortfolio = validateProductionOrderPortfolio({ contract: PRODUCTION_ORDER_PORTFOLIO_CONTRACT, entries })
  const next = { ...value, orderPortfolio } as T & { orderExecution?: PlantOrderState }
  delete next.orderExecution
  return next
}
