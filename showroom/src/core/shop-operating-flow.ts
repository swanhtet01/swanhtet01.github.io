export type ShopOperatingFlowInput = {
  incomingOnline: number
  incomingWebsite: number
  confirmed: number
  preparing: number
  ready: number
  paymentPending: number
  refundDue: number
  closeReady: number
  overdue: number
}

export type ShopOperatingStageId = 'intake' | 'accepted' | 'fulfilment' | 'money' | 'close'
export type ShopOperatingActionId = 'review_intake' | 'protect_promise' | 'move_orders' | 'reconcile_money' | 'close_day' | 'new_order'

export type ShopOperatingStage = {
  id: ShopOperatingStageId
  label: string
  count: number
  detail: string
  target: '#shop-order-queue' | '#shop-order-history' | '#shop-close-controls'
}

export type ShopOperatingFlow = {
  stages: ShopOperatingStage[]
  next: {
    id: ShopOperatingActionId
    title: string
    detail: string
    action: string
    target: ShopOperatingStage['target']
    orderMode?: 'manual' | 'online'
  }
}

function count(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 100_000) throw new Error(`${label} must be a safe non-negative count.`)
  return value
}

function records(value: number, singular: string, plural = `${singular}s`) {
  return `${value} ${value === 1 ? singular : plural}`
}

export function buildShopOperatingFlow(input: ShopOperatingFlowInput): ShopOperatingFlow {
  const incomingOnline = count(input.incomingOnline, 'Incoming online requests')
  const incomingWebsite = count(input.incomingWebsite, 'Incoming Website requests')
  const confirmed = count(input.confirmed, 'Confirmed orders')
  const preparing = count(input.preparing, 'Preparing orders')
  const ready = count(input.ready, 'Ready orders')
  const paymentPending = count(input.paymentPending, 'Pending payments')
  const refundDue = count(input.refundDue, 'Due refunds')
  const closeReady = count(input.closeReady, 'Close-ready orders')
  const overdue = count(input.overdue, 'Overdue orders')
  const incoming = incomingOnline + incomingWebsite
  const inFulfilment = preparing + ready
  const moneyExceptions = paymentPending + refundDue

  const stages: ShopOperatingStage[] = [
    { id: 'intake', label: 'Intake', count: incoming, detail: `${records(incomingOnline, 'online request')} · ${records(incomingWebsite, 'Website request')}`, target: '#shop-order-queue' },
    { id: 'accepted', label: 'Accepted', count: confirmed, detail: records(confirmed, 'order'), target: '#shop-order-queue' },
    { id: 'fulfilment', label: 'Fulfil', count: inFulfilment, detail: `${records(preparing, 'preparing')} · ${records(ready, 'ready')}`, target: '#shop-order-queue' },
    { id: 'money', label: 'Money', count: moneyExceptions, detail: `${records(paymentPending, 'payment')} · ${records(refundDue, 'refund')}`, target: refundDue ? '#shop-order-history' : '#shop-order-queue' },
    { id: 'close', label: 'Close', count: closeReady, detail: records(closeReady, 'order'), target: '#shop-close-controls' },
  ]

  if (incoming) return { stages, next: { id: 'review_intake', title: `Review ${records(incoming, 'incoming request')}`, detail: 'Confirm customer, items, promise, fulfilment, and payment before Shop creates an order.', action: 'Open inbox', target: '#shop-order-queue', orderMode: 'online' } }
  if (overdue) return { stages, next: { id: 'protect_promise', title: `Protect ${records(overdue, 'late promise')}`, detail: 'Move the oldest promised order forward or record the exception with its owner.', action: 'Open order queue', target: '#shop-order-queue' } }
  if (refundDue) return { stages, next: { id: 'reconcile_money', title: `Record ${records(refundDue, 'settled refund')}`, detail: 'Confirm external refund evidence without sending money from SuperMega.', action: 'Open returns', target: '#shop-order-history' } }
  if (ready || preparing || confirmed) return { stages, next: { id: 'move_orders', title: `Move ${records(confirmed + inFulfilment, 'order')} forward`, detail: 'Use the next accountable transition shown on each order.', action: 'Open order queue', target: '#shop-order-queue' } }
  if (paymentPending) return { stages, next: { id: 'reconcile_money', title: `Reconcile ${records(paymentPending, 'payment')}`, detail: 'Record evidence for payments completed outside SuperMega.', action: 'Open payment review', target: '#shop-order-queue' } }
  if (closeReady) return { stages, next: { id: 'close_day', title: `Close ${records(closeReady, 'ready order')}`, detail: 'Review totals and exceptions, then save the accountable daily close.', action: 'Review close', target: '#shop-close-controls' } }
  return { stages, next: { id: 'new_order', title: 'Ready for the next customer', detail: 'Start a recoverable order or open an incoming request when demand arrives.', action: 'New order', target: '#shop-order-queue', orderMode: 'manual' } }
}
