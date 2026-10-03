import type { CommerceOrder, CommerceState } from './commerce-workspace'

const yangonDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Yangon' })
const yangonHour = new Intl.DateTimeFormat('en-US', {
  hour: '2-digit',
  hourCycle: 'h23',
  timeZone: 'Asia/Yangon',
})

export type ShopTodaySalesPulsePoint = {
  hour: number
  label: string
  count: number
  grossMmk: number
}

export type ShopTodaySalesPulse = {
  today: { count: number; grossMmk: number }
  previous: { count: number; grossMmk: number }
  deltaBasisPoints: number | null
  points: ShopTodaySalesPulsePoint[]
}

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

function retainedCompletedSales(commerce: Pick<CommerceState, 'orders' | 'movements'>) {
  const movementSampleIds = new Set(commerce.movements
    .filter((movement) => movement.orderId && (isSampleMarker(movement.actionId) || isSampleMarker(movement.evidenceReference)))
    .map((movement) => movement.orderId as string))

  return commerce.orders.filter((order) => {
    const completedAt = order.completion?.capturedAt
    return order.status === 'completed'
      && order.paymentStatus === 'reconciled'
      && Boolean(completedAt)
      && Number.isFinite(Date.parse(completedAt as string))
      && !isSampleOrder(order, movementSampleIds)
      && Number.isSafeInteger(order.total)
      && order.total >= 0
  })
}

export function projectShopTodayCompletedSales(commerce: Pick<CommerceState, 'orders' | 'movements'>, now: number) {
  const today = yangonDate.format(new Date(now))

  let count = 0
  let grossMmk = 0
  for (const order of retainedCompletedSales(commerce)) {
    const completedAt = order.completion?.capturedAt as string
    if (yangonDate.format(new Date(completedAt)) !== today) continue
    count += 1
    grossMmk += order.total
  }
  return { count, grossMmk }
}

export function projectShopTodaySalesPulse(
  commerce: Pick<CommerceState, 'orders' | 'movements'>,
  now: number,
): ShopTodaySalesPulse {
  const todayKey = yangonDate.format(new Date(now))
  const previousKey = yangonDate.format(new Date(now - 86_400_000))
  const points = Array.from({ length: 8 }, (_, index): ShopTodaySalesPulsePoint => {
    const hour = index * 3
    return { hour, label: `${String(hour).padStart(2, '0')}:00`, count: 0, grossMmk: 0 }
  })
  const today = { count: 0, grossMmk: 0 }
  const previous = { count: 0, grossMmk: 0 }

  for (const order of retainedCompletedSales(commerce)) {
    const completedAt = order.completion?.capturedAt as string
    const completion = new Date(completedAt)
    const businessDate = yangonDate.format(completion)
    if (businessDate === previousKey) {
      previous.count += 1
      previous.grossMmk += order.total
      continue
    }
    if (businessDate !== todayKey) continue
    today.count += 1
    today.grossMmk += order.total
    const hour = Number(yangonHour.format(completion))
    const point = points[Math.min(points.length - 1, Math.max(0, Math.floor(hour / 3)))]
    point.count += 1
    point.grossMmk += order.total
  }

  return {
    today,
    previous,
    deltaBasisPoints: previous.grossMmk > 0
      ? Math.round(((today.grossMmk - previous.grossMmk) * 10_000) / previous.grossMmk)
      : null,
    points,
  }
}
