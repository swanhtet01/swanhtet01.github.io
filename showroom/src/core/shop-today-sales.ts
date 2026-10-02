import type { CommerceOrder, CommerceState } from './commerce-workspace'

const yangonDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Yangon' })

function isSampleMarker(value: string | undefined) {
  const marker = String(value ?? '').toUpperCase()
  return marker.startsWith('ACT-DEMO-') || marker.startsWith('SETUP-') || marker.startsWith('SEED-')
}

function isSampleOrder(order: CommerceOrder, movementSampleIds: ReadonlySet<string>) {
  return order.id.startsWith('SETUP-SAMPLE-')
    || movementSampleIds.has(order.id)
    || isSampleMarker(order.sourceRecordId)
    || isSampleMarker(order.evidenceReference)
    || isSampleMarker(order.completion?.actionId)
    || isSampleMarker(order.completion?.evidenceReference)
    || isSampleMarker(order.paymentReconciliationActionId)
    || isSampleMarker(order.paymentEvidenceReference)
}

export function projectShopTodayCompletedSales(commerce: Pick<CommerceState, 'orders' | 'movements'>, now: number) {
  const today = yangonDate.format(new Date(now))
  const movementSampleIds = new Set(commerce.movements
    .filter((movement) => movement.orderId && (isSampleMarker(movement.actionId) || isSampleMarker(movement.evidenceReference)))
    .map((movement) => movement.orderId as string))

  let count = 0
  let grossMmk = 0
  for (const order of commerce.orders) {
    const completedAt = order.completion?.capturedAt
    if (order.status !== 'completed' || order.paymentStatus !== 'reconciled'
      || !completedAt || !Number.isFinite(Date.parse(completedAt))
      || yangonDate.format(new Date(completedAt)) !== today
      || isSampleOrder(order, movementSampleIds)
      || !Number.isSafeInteger(order.total) || order.total < 0) continue
    count += 1
    grossMmk += order.total
  }
  return { count, grossMmk }
}
