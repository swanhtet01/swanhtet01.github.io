import { downloadBlob } from './download-file'
import type { CommerceOrder, CommerceOrderAcknowledgement } from './commerce-workspace'
import { formatMoney, formatCommerceCalculation, orderAcknowledgementFileText, type OrderAcknowledgementDownload } from './shop-order-presentation'


export function OrderCalculationNote({ order }: { order: CommerceOrder }) {
  if (!order.calculation) return <small data-order-calculation-note="true" data-order-calculation-status="legacy">Recorded total {formatMoney(order.total)} · Tax status not recorded</small>
  return <small data-order-calculation-note="true" data-order-calculation-status={'taxCode' in order.calculation ? 'configured' : 'not-configured'}>{formatCommerceCalculation(order.calculation)}</small>
}

// The two receipt controls an order carries, in one place. The active order list and the
// archive below it rendered a byte-identical copy of this pair each; they are the two controls
// that must agree about what a receipt IS, so keeping two copies in step was a standing
// invitation to drift. A fragment, so the rendered DOM is exactly what it was.
export function OrderReceiptActions({ acknowledgement, onViewReceipt }: {
  acknowledgement: OrderAcknowledgementDownload | undefined
  onViewReceipt: (artifact: CommerceOrderAcknowledgement) => void
}) {
  if (!acknowledgement) return null
  return <>
    <button className="text-link" data-order-receipt="view" onClick={() => onViewReceipt(acknowledgement.artifact)} type="button">View order record</button>
    <button className="text-link subtle" data-order-acknowledgement="local-download" onClick={() => downloadBlob(acknowledgement.filename, new Blob([orderAcknowledgementFileText(acknowledgement.artifact)], { type: 'text/plain;charset=utf-8' }))} type="button">Download acknowledgement</button>
  </>
}
