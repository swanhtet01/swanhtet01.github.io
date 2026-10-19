import type { CommerceOrder, CommerceOrderPromiseUrgency } from './commerce-workspace'

export type ShopOrderAttentionLabel = {
  kind: 'payment' | 'refund' | 'promise'
  text: string
  tone: 'pending' | 'late'
}

export function shopOrderAttentionLabels(
  order: Pick<CommerceOrder, 'paymentStatus' | 'refundStatus' | 'fulfilment'>,
  promiseUrgency: CommerceOrderPromiseUrgency,
): ShopOrderAttentionLabel[] {
  const labels: ShopOrderAttentionLabel[] = []
  const handoff = order.fulfilment === 'delivery'
    ? 'Delivery'
    : order.fulfilment === 'pickup'
      ? 'Pickup'
      : 'Promise'

  if (order.paymentStatus === 'pending') labels.push({ kind: 'payment', text: 'Unpaid', tone: 'pending' })
  if (order.refundStatus === 'due') labels.push({ kind: 'refund', text: 'refund due', tone: 'pending' })

  if (promiseUrgency === 'late') labels.push({ kind: 'promise', text: `${handoff} late`, tone: 'late' })
  else if (promiseUrgency === 'due_soon') labels.push({ kind: 'promise', text: `${handoff} due soon`, tone: 'pending' })
  else if (promiseUrgency === 'unrecorded') labels.push({ kind: 'promise', text: 'promise not recorded', tone: 'pending' })

  return labels
}
