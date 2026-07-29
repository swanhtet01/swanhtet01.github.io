import { useEffect, useState } from 'react'
import { Link } from 'react-router'

import {
  COMMERCE_KEY,
  commerceReceivablesAging,
  commerceStorefrontRequests,
  createSeedCommerce,
  validateCommerceState,
} from './commerce-workspace'
import {
  PRODUCTION_KEY,
  createSeedProduction,
  validateProductionState,
} from './production-workspace'
import {
  LEGACY_WEBSITE_STORAGE_KEY,
  WEBSITE_STORAGE_KEY,
  loadWebsiteWorkspace,
  readinessChecks,
} from '../products/website/website-model'

type TodayTask = {
  product: 'Shop' | 'Plant' | 'Website' | 'Ecommerce'
  label: string
  detail: string
  count: number
  score: number
  to: string
}

function readJson(key: string) {
  try { return window.localStorage.getItem(key) } catch { return null }
}

function buildTodayTasks(): TodayTask[] {
  const commerceRaw = readJson(COMMERCE_KEY)
  const productionRaw = readJson(PRODUCTION_KEY)
  let commerce = createSeedCommerce()
  let production = createSeedProduction()
  try { if (commerceRaw) commerce = validateCommerceState(JSON.parse(commerceRaw)) } catch { /* Keep the non-persistent sample projection. */ }
  try { if (productionRaw) production = validateProductionState(JSON.parse(productionRaw)) } catch { /* Keep the non-persistent sample projection. */ }

  const now = Date.now()
  const activeOrders = commerce.orders.filter((order) => order.status !== 'completed' && order.status !== 'cancelled')
  const overdueReceivables = commerceReceivablesAging(commerce, now).overdueOrders
  const lowStock = commerce.items.filter((item) => item.onHand <= item.reorderAt).length
  const shopTask: TodayTask = overdueReceivables
    ? { product: 'Shop', label: `Follow up ${overdueReceivables} overdue balance${overdueReceivables === 1 ? '' : 's'}`, detail: 'Open payment follow-up with attributable evidence.', count: overdueReceivables, score: 90, to: '/shop/?tab=orders' }
    : activeOrders.length
      ? { product: 'Shop', label: `Move ${activeOrders.length} active order${activeOrders.length === 1 ? '' : 's'}`, detail: 'Prepare, fulfil, or close the next promised order.', count: activeOrders.length, score: 70, to: '/shop/?tab=orders' }
      : lowStock
        ? { product: 'Shop', label: `Replenish ${lowStock} low-stock item${lowStock === 1 ? '' : 's'}`, detail: 'Review supplier or Plant replenishment.', count: lowStock, score: 60, to: '/shop/?tab=inventory' }
        : { product: 'Shop', label: 'Start the next sale', detail: 'Counter, customer, stock, and payment are ready.', count: 0, score: 10, to: '/shop/?tab=counter' }

  const openIssues = production.issues.filter((issue) => issue.status === 'open')
  const urgentIssues = openIssues.filter((issue) => issue.severity === 'critical' || issue.severity === 'high')
  const heldJobs = production.jobs.filter((job) => job.qualityHold && !job.closure)
  const openJobs = production.jobs.filter((job) => !job.closure && job.output < job.target)
  const plantTask: TodayTask = urgentIssues.length
    ? { product: 'Plant', label: `Contain ${urgentIssues.length} urgent problem${urgentIssues.length === 1 ? '' : 's'}`, detail: 'Resolve the highest-severity exception before release.', count: urgentIssues.length, score: 100, to: '/plant/?tab=issues' }
    : heldJobs.length
      ? { product: 'Plant', label: `Review ${heldJobs.length} quality hold${heldJobs.length === 1 ? '' : 's'}`, detail: 'Inspect, rework, or retain the hold with evidence.', count: heldJobs.length, score: 85, to: '/plant/?tab=issues' }
      : openJobs.length
        ? { product: 'Plant', label: `Run ${openJobs.length} open job${openJobs.length === 1 ? '' : 's'}`, detail: 'Record good output, scrap, material, and shift evidence.', count: openJobs.length, score: 65, to: '/plant/?tab=production' }
        : { product: 'Plant', label: 'Plan the next job', detail: 'Capacity, materials, quality, and handoff are ready.', count: 0, score: 10, to: '/plant/?tab=production' }

  const waitingRequests = commerceStorefrontRequests(commerce).filter((request) => (
    !commerce.orders.some((order) => order.sourceRecordId === request.id)
  ))
  const ecommerceTask: TodayTask = waitingRequests.length
    ? { product: 'Ecommerce', label: `Review ${waitingRequests.length} customer request${waitingRequests.length === 1 ? '' : 's'}`, detail: 'Shop confirms stock, promise, payment, and fulfilment.', count: waitingRequests.length, score: 80, to: '/shop/?tab=orders&source=ecommerce' }
    : { product: 'Ecommerce', label: 'Open the customer storefront', detail: 'Test cart, quote, tracking, and safe reorder.', count: 0, score: 20, to: '/ecommerce/' }

  let websiteTask: TodayTask = { product: 'Website', label: 'Review the website', detail: 'Check the mobile preview and one clear customer action.', count: 0, score: 20, to: '/website/' }
  try {
    const loaded = loadWebsiteWorkspace(window.localStorage)
    if (!loaded.ok) {
      websiteTask = { product: 'Website', label: 'Repair saved website data', detail: 'The original local record remains untouched.', count: 1, score: 95, to: '/website/' }
    } else {
      const failedChecks = readinessChecks(loaded.workspace).filter((check) => !check.passed)
      websiteTask = failedChecks.length
        ? { product: 'Website', label: `Finish ${failedChecks.length} launch check${failedChecks.length === 1 ? '' : 's'}`, detail: 'Complete content and evidence before any release claim.', count: failedChecks.length, score: 55, to: '/website/' }
        : loaded.workspace.localPublishes.length
          ? { product: 'Website', label: 'Review the latest local release', detail: 'Confirm artifact, evidence, and rollback before hosting.', count: 0, score: 25, to: '/website/' }
          : { product: 'Website', label: 'Record the first local release', detail: 'Approve the exact artifact after readiness passes.', count: 0, score: 35, to: '/website/' }
    }
  } catch { /* Keep the safe Website review task. */ }

  return [shopTask, plantTask, websiteTask, ecommerceTask].sort((left, right) => right.score - left.score)
}

export function ProductHomeToday() {
  const [tasks, setTasks] = useState(buildTodayTasks)

  useEffect(() => {
    function refresh(event: StorageEvent) {
      if (event.key === null || [COMMERCE_KEY, PRODUCTION_KEY, WEBSITE_STORAGE_KEY, LEGACY_WEBSITE_STORAGE_KEY].includes(event.key)) {
        setTasks(buildTodayTasks())
      }
    }
    window.addEventListener('storage', refresh)
    return () => window.removeEventListener('storage', refresh)
  }, [])

  const next = tasks[0]
  return (
    <section className="product-home-today" aria-label="Today across SuperMega">
      <div className="product-home-today-head">
        <div><span className="core-eyebrow">Today</span><h2>{next.label}</h2><p>{next.detail} This queue is read-only; the product still owns every change.</p></div>
        <Link className="core-button primary" to={next.to}>Open {next.product}</Link>
      </div>
      <div className="product-home-today-grid">
        {tasks.map((task, index) => (
          <Link data-next={index === 0 ? 'true' : 'false'} key={task.product} to={task.to}>
            <span><small>{task.product}</small><strong>{task.label}</strong><em>{task.detail}</em></span>
            <b>{task.count || 'Open'}</b>
          </Link>
        ))}
      </div>
    </section>
  )
}
