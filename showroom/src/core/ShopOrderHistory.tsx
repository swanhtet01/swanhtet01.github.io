import { OrderCalculationNote, OrderReceiptActions } from './OrderReceiptActions'
import { useState, type FormEvent } from 'react'
import { commerceCorrectionCalculation, commerceSupportWorkloadExport, commerceSupportQueue, commerceSupportSlaSummary, commerceOrderAdjustedTotal, commerceSupportCaseUrgency, commerceSupportServiceState, commerceSupportCheckpointState, type CommerceSupportServiceEventKind, type CommerceOrderAcknowledgement, type CommerceOrder, type CommerceReturnDisposition, type CommerceSupportPriority, type CommerceSupportResolutionOutcome, type CommerceCorrectionKind, type CommerceCorrectionReasonCode } from './commerce-workspace'
import { formatTime } from './team-work'
import { shopLoyaltyDisplayPoints } from './shop-loyalty'
import { type OrderAcknowledgementLookup, type CommerceCorrectionDraft, type CommerceReturnDraft, type CommerceSupportOpenDraft, type CommerceSupportReopenDraft, type CommerceSupportServiceDraft, type CommerceSupportResolutionDraft, useMinuteClock, commerceOrderReturnLines, commerceOrderDisplayReference, fulfilmentLabel, formatMoney, localDateTimeInputValue } from './shop-order-presentation'

const coreUi = { q: 'core-button primary compact', d: 'datetime-local' } as const

const commerceSupportServiceActionLabels: Record<CommerceSupportServiceEventKind, string> = {
  reassigned: 'Reassign case',
  escalated: 'Escalate case',
  acknowledged: 'Acknowledge case',
  first_response_ready: 'First response ready',
}


export function ClosedOrderHistory({
  acknowledgementDownloads,
  canCorrect,
  canReturn,
  correctionCalculation,
  correctionDraft,
  disabled,
  onCancelCorrection,
  onCancelReturn,
  loyaltyPoints,
  onChangeCorrection,
  onChangeReturn,
  onOpenCorrection,
  onOpenRedemption,
  onOpenReturn,
  onReviewCorrection,
  onReviewReturn,
  onReviewSupportOpen,
  onReviewSupportReopen,
  onReviewSupportService,
  onReviewSupportResolution,
  onOpenSupportService,
  onOpenSupportResolution,
  onOpenSupportReopen,
  onCancelSupportOpen,
  onCancelSupportReopen,
  onCancelSupportResolution,
  onCancelSupportService,
  onChangeSupportOpen,
  onChangeSupportReopen,
  onChangeSupportService,
  onChangeSupportResolution,
  onCorrectionEditor,
  onCorrectionTrigger,
  onReturnEditor,
  onReturnTrigger,
  onViewReceipt,
  orders,
  returnDraft,
  returnLocationPreview,
  supportDraft,
  supportReopenDraft,
  supportServiceDraft,
  supportResolutionDraft,
  supportWorkloadDownload,
}: {
  acknowledgementDownloads: OrderAcknowledgementLookup
  canCorrect: (orderId: string) => boolean
  canReturn: (orderId: string) => boolean
  correctionCalculation: ReturnType<typeof commerceCorrectionCalculation>
  correctionDraft: CommerceCorrectionDraft | null
  disabled: boolean
  onCancelCorrection: () => void
  onCancelReturn: () => void
  loyaltyPoints: ReadonlyMap<string, number> | null
  onChangeCorrection: (patch: Partial<CommerceCorrectionDraft>) => void
  onChangeReturn: (patch: Partial<CommerceReturnDraft>) => void
  onOpenCorrection: (orderId: string) => void
  onOpenRedemption: (orderId: string) => void
  onOpenReturn: (orderId: string) => void
  onReviewCorrection: (event: FormEvent) => void
  onReviewReturn: (event: FormEvent) => void
  onReviewSupportOpen: (event: FormEvent) => void
  onReviewSupportReopen: (event: FormEvent) => void
  onReviewSupportService: (event: FormEvent) => void
  onReviewSupportResolution: (event: FormEvent) => void
  onOpenSupportService: (orderId: string, caseId: string, kind: CommerceSupportServiceEventKind) => void
  onOpenSupportResolution: (orderId: string, caseId: string) => void
  onOpenSupportReopen: (orderId: string, caseId: string) => void
  onCancelSupportOpen: () => void
  onCancelSupportReopen: () => void
  onCancelSupportResolution: () => void
  onCancelSupportService: () => void
  onChangeSupportOpen: (patch: Partial<Omit<CommerceSupportOpenDraft, 'intent'>>) => void
  onChangeSupportReopen: (patch: Partial<CommerceSupportReopenDraft>) => void
  onChangeSupportService: (patch: Partial<CommerceSupportServiceDraft>) => void
  onChangeSupportResolution: (patch: Partial<CommerceSupportResolutionDraft>) => void
  onCorrectionEditor: (node: HTMLFormElement | null) => void
  onCorrectionTrigger: (orderId: string, node: HTMLButtonElement | null) => void
  onReturnEditor: (node: HTMLFormElement | null) => void
  onReturnTrigger: (orderId: string, node: HTMLButtonElement | null) => void
  onViewReceipt: (ack: CommerceOrderAcknowledgement) => void
  orders: CommerceOrder[]
  returnDraft: CommerceReturnDraft | null
  returnLocationPreview: string
  supportDraft: CommerceSupportOpenDraft | null
  supportReopenDraft: CommerceSupportReopenDraft | null
  supportServiceDraft: CommerceSupportServiceDraft | null
  supportResolutionDraft: CommerceSupportResolutionDraft | null
  supportWorkloadDownload: {
    filename: string
    href: string
    artifact: ReturnType<typeof commerceSupportWorkloadExport>
  } | null
}) {
  // Requested editors can first mount after this lazy module resolves. Autofocus on the
  // edited field preserves keyboard entry even if the parent animation frame has passed.
  const [page, setPage] = useState(0)
  const supportClock = useMinuteClock()
  const pageSize = 8
  if (!orders.length) return null
  const pageCount = Math.ceil(orders.length / pageSize)
  const returnOrderIndex = returnDraft ? orders.findIndex((order) => order.id === returnDraft.orderId) : -1
  const correctionOrderIndex = correctionDraft ? orders.findIndex((order) => order.id === correctionDraft.orderId) : -1
  const supportOrderId = supportDraft?.intent.orderId ?? supportReopenDraft?.orderId ?? supportServiceDraft?.orderId ?? supportResolutionDraft?.orderId
  const supportOrderIndex = supportOrderId ? orders.findIndex((order) => order.id === supportOrderId) : -1
  const focusedOrderIndex = returnOrderIndex >= 0 ? returnOrderIndex : correctionOrderIndex >= 0 ? correctionOrderIndex : supportOrderIndex
  const currentPage = focusedOrderIndex >= 0 ? Math.floor(focusedOrderIndex / pageSize) : Math.min(page, pageCount - 1)
  const visibleOrders = orders.slice(currentPage * pageSize, (currentPage + 1) * pageSize)
  const supportWorkQueue = commerceSupportQueue(orders, supportClock)
  const supportSla = commerceSupportSlaSummary(orders, supportClock)
  return <details className="order-archive" id="shop-order-history" open={Boolean(returnDraft || correctionDraft || supportDraft || supportReopenDraft || supportServiceDraft || supportResolutionDraft) || undefined}>
    <summary><span>Completed and cancelled orders</span><small>{supportWorkQueue.length ? `${supportSla.openCases} help open · ${supportSla.overdueCases} overdue · ` : ''}{orders.length} {orders.length === 1 ? 'record' : 'records'}</small></summary>
    {supportWorkloadDownload ? <section aria-label="Support workload export" className="order-return-records" data-support-workload="privacy-minimal">
      <div><strong>Support workload record</strong><small>{supportWorkloadDownload.artifact.summary.totalCases} cases · {supportWorkloadDownload.artifact.summary.reopenedCases} repeat contacts · {supportWorkloadDownload.artifact.summary.responseTargetMisses} target misses</small></div>
      <div><small>Case and order references, aging, ownership, lifecycle, and service counts only. Customer names, contact details, descriptions, notes, and evidence text are excluded.</small><a className="text-link" download={supportWorkloadDownload.filename} href={supportWorkloadDownload.href}>Download workload CSV</a></div>
    </section> : null}
    {supportWorkQueue.length ? <section aria-label="Open support queue" className="order-return-records" data-support-queue="ordered">
      <div><strong>Support queue · next work first</strong><small>Overdue, priority, due time, request time</small></div>
      <div data-support-sla="bounded"><strong>Service level</strong><small>{supportSla.awaitingAcknowledgement} awaiting acknowledgement · {supportSla.awaitingFirstResponse} awaiting first response · {supportSla.firstResponseReady} response ready · {supportSla.responseTargetMisses} target missed</small></div>
      {supportWorkQueue.slice(0, 6).map((row) => <div data-support-urgency={row.urgency} key={`queue-${row.supportCase.caseId}`}>
        <strong>{row.urgency === 'overdue' ? 'OVERDUE · ' : ''}{row.customer} · {row.supportCase.category.replaceAll('_', ' ')}</strong>
        <small>{row.service ? `${row.service.priority} · ${row.service.owner} · due ${formatTime(row.service.dueAt)}` : 'Legacy untriaged case'} · {row.supportCase.caseId}</small>
        {row.service ? <button className="text-link" disabled={disabled || Boolean(supportDraft || supportReopenDraft || supportServiceDraft || supportResolutionDraft || returnDraft || correctionDraft)} onClick={() => row.checkpoints.acknowledged
          ? row.checkpoints.firstResponseReady
            ? onOpenSupportResolution(row.orderId, row.supportCase.caseId)
            : onOpenSupportService(row.orderId, row.supportCase.caseId, 'first_response_ready')
          : onOpenSupportService(row.orderId, row.supportCase.caseId, 'acknowledged')} type="button">{row.checkpoints.acknowledged ? row.checkpoints.firstResponseReady ? 'Resolve case' : 'Response ready' : 'Acknowledge'}</button> : null}
      </div>)}
      {supportWorkQueue.length > 6 ? <small>{supportWorkQueue.length - 6} more open cases remain in the order archive.</small> : null}
    </section> : null}
    <div className="order-archive-list">{visibleOrders.map((order) => {
      const lines = commerceOrderReturnLines(order).map((line) => {
        const returned = (order.returns ?? [])
          .filter((record) => record.sku === line.sku)
          .reduce((sum, record) => sum + record.quantity, 0)
        return { ...line, returned, remaining: line.quantity - returned }
      })
      const availableLines = lines.filter((line) => line.remaining > 0)
      const draftedLine = returnDraft?.orderId === order.id
        ? availableLines.find((line) => line.sku === returnDraft.sku)
        : undefined
      const activeReturnDraft = draftedLine && returnDraft?.orderId === order.id ? returnDraft : null
      const editing = activeReturnDraft !== null
      const activeCorrectionDraft = correctionDraft?.orderId === order.id ? correctionDraft : null
      const correcting = activeCorrectionDraft !== null
      const activeSupportDraft = supportDraft?.intent.orderId === order.id ? supportDraft : null
      const activeSupportReopen = supportReopenDraft?.orderId === order.id ? supportReopenDraft : null
      const activeSupportService = supportServiceDraft?.orderId === order.id ? supportServiceDraft : null
      const activeSupportResolution = supportResolutionDraft?.orderId === order.id ? supportResolutionDraft : null
      const selectedLine = draftedLine ?? availableLines[0]
      const returnable = canReturn(order.id)
      const correctable = canCorrect(order.id)
      // S3 PR2: the redemption affordance appears only while points are on
      // (loyaltyPoints is null otherwise) for a named customer with a positive
      // balance, on an order corrections can still reach.
      const redeeming = Boolean(activeCorrectionDraft?.loyalty)
      const loyaltyBalance = shopLoyaltyDisplayPoints(loyaltyPoints?.get(order.customer.trim()) ?? 0)
      const redeemable = correctable && order.customer.trim() !== 'Guest' && loyaltyBalance > 0
      const adjustedTotal = commerceOrderAdjustedTotal(order) ?? order.total
      const acknowledgement = acknowledgementDownloads.get(order.id)
      return <article className={editing || correcting ? 'is-returning' : undefined} key={order.id}>
      <div className="order-archive-main">
        <strong>{order.customer} · {order.lines
          ? order.lines.length === 1
            ? `${order.lines[0].name} × ${order.quantity}`
            : `${order.lines.length} items · ${order.quantity} units`
          : `${order.item} × ${order.quantity}`}</strong>
        {order.lines ? <small>{order.lines.map((line) => `${line.name} × ${line.quantity} @ ${line.unitPriceMmk.toLocaleString()} MMK`).join(' · ')}</small> : null}
        <OrderCalculationNote order={order} />
        <small>{commerceOrderDisplayReference(order.id)} · {order.owner ? `owner ${order.owner}` : 'owner not recorded'} · {order.status} · payment {order.paymentStatus}{order.refundStatus !== 'none' ? ` · refund ${order.refundStatus}` : ''}{order.fulfilment ? ` · ${fulfilmentLabel(order.fulfilment)}` : ''}{order.fulfilmentReference ? ` · ${order.fulfilmentReference}` : ''} · {order.promisedAt ? `promised ${formatTime(order.promisedAt)}` : 'promise not recorded'} · created {formatTime(order.createdAt)}</small>
        {order.refundStatus === 'settled' && order.refundSettledAt && order.refundSettledBy && order.refundEvidenceReference ? <small role="note">{order.refundSettledBy} · {formatTime(order.refundSettledAt)} · evidence {order.refundEvidenceReference}</small> : null}
        {order.status === 'completed' && order.completion ? <small role="note">Completed by {order.completion.actor} · {formatTime(order.completion.capturedAt)} · evidence {order.completion.evidenceReference}</small> : null}
        {order.status === 'completed' && !order.completion ? <small role="note">Return unavailable: this older order has no attributable completion proof.</small> : null}
        {order.status === 'completed' && order.completion && availableLines.length > 0 && !returnable ? <small role="note">Return unavailable: the sold quantity cannot be matched to an attributable stock reservation.</small> : null}
      </div>
      <div className="order-archive-actions">
        <b>{formatMoney(adjustedTotal)}</b>
        {adjustedTotal !== order.total ? <small>original {formatMoney(order.total)}</small> : null}
        <OrderReceiptActions acknowledgement={acknowledgement} onViewReceipt={onViewReceipt} />
        {order.status === 'completed' && (returnable || editing) ? <button
          aria-expanded={editing}
          className="text-link"
          disabled={disabled || correcting}
          onClick={() => editing ? onCancelReturn() : onOpenReturn(order.id)}
          ref={(node) => { onReturnTrigger(order.id, node) }}
          type="button"
        >{editing ? 'Close return' : 'Record return'}</button> : null}
        {order.status === 'completed' && ((correctable && !redeeming) || (correcting && !redeeming)) ? <button
          aria-expanded={correcting && !redeeming}
          className="text-link"
          disabled={disabled || editing}
          onClick={() => correcting ? onCancelCorrection() : onOpenCorrection(order.id)}
          ref={(node) => { onCorrectionTrigger(order.id, node) }}
          type="button"
        >{correcting && !redeeming ? 'Close correction' : 'Correct invoice'}</button> : null}
        {order.status === 'completed' && (redeemable || redeeming) ? <button
          aria-expanded={redeeming}
          className="text-link"
          disabled={disabled || editing || (correcting && !redeeming)}
          onClick={() => redeeming ? onCancelCorrection() : onOpenRedemption(order.id)}
          ref={redeeming ? (node) => { onCorrectionTrigger(order.id, node) } : undefined}
          type="button"
        >{redeeming ? 'Close redemption' : `Redeem points · ${loyaltyBalance.toLocaleString()}`}</button> : null}
      </div>
      {order.returns?.length ? <div className="order-return-records" role="list">
        {order.returns.map((record) => <div key={record.actionId} role="listitem">
          <strong>{record.quantity} {record.sku} returned · {record.disposition === 'restock' ? 'restocked' : 'not restocked'}</strong>
          <small>{record.actor} · {formatTime(record.createdAt)} · evidence {record.evidenceReference}</small>
        </div>)}
      </div> : null}
      {order.supportCases?.length ? <div className="order-return-records" role="list">
        {order.supportCases.map((supportCase) => {
          const urgency = commerceSupportCaseUrgency(supportCase, supportClock)
          const service = commerceSupportServiceState(supportCase)
          const checkpoints = commerceSupportCheckpointState(supportCase)
          const serviceEvents = [...(supportCase.followUpServiceEvents ?? []), ...(supportCase.serviceEvents ?? [])]
          const finalResolution = supportCase.followUpResolution ?? supportCase.resolution
          return <div data-support-urgency={urgency} key={supportCase.caseId} role="listitem">
            <strong>{urgency === 'overdue' ? 'OVERDUE · ' : ''}{supportCase.status === 'resolved' ? 'Resolved help case' : 'Open help case'} · {supportCase.category.replaceAll('_', ' ')}</strong>
            <small>{supportCase.caseId} · requested {formatTime(supportCase.customerRequestedAt)} · opened by {supportCase.opening.actor}</small>
            {service
              ? <small>{service.priority} priority · owner {service.owner} · {urgency === 'overdue' ? 'overdue since' : 'due'} {formatTime(service.dueAt)}</small>
              : <small>Legacy case · priority, owner, and due time were not recorded</small>}
            <small>{supportCase.customerDescription}</small>
            {supportCase.reopen ? <small>Follow-up opened by {supportCase.reopen.proof.actor} · {formatTime(supportCase.reopen.proof.capturedAt)} · linked to resolution {supportCase.reopen.sourceResolutionActionId} · {supportCase.reopen.note}</small> : null}
            {supportCase.reopen && supportCase.resolution ? <small>Original resolution retained · {supportCase.resolution.outcome.replaceAll('_', ' ')} · {supportCase.resolution.note}</small> : null}
            {checkpoints.acknowledged ? <small>Acknowledged by {checkpoints.acknowledged.proof.actor} · {formatTime(checkpoints.acknowledged.proof.capturedAt)}{checkpoints.firstResponseReady ? ` · first response ready ${formatTime(checkpoints.firstResponseReady.proof.capturedAt)}` : ' · first response pending'}</small> : service ? <small>Acknowledgement pending</small> : null}
            {serviceEvents.length ? <details className="compact-disclosure"><summary><span>Service history</span><small>{serviceEvents.length} {serviceEvents.length === 1 ? 'event' : 'events'}</small></summary><div className="boundary-list">{serviceEvents.map((serviceEvent) => <div key={serviceEvent.proof.actionId}><strong>{serviceEvent.kind.replaceAll('_', ' ')} · {serviceEvent.priority} · {serviceEvent.owner}</strong><small>{formatTime(serviceEvent.proof.capturedAt)} · due {formatTime(serviceEvent.dueAt)} · {serviceEvent.note}</small></div>)}</div></details> : null}
            {supportCase.status === 'resolved' && finalResolution ? <><small>{finalResolution.outcome.replaceAll('_', ' ')} · {finalResolution.note} · {finalResolution.proof.actor}</small>{!supportCase.reopen ? <button className="text-link" disabled={disabled || Boolean(activeSupportReopen || activeSupportService || activeSupportResolution)} onClick={() => onOpenSupportReopen(order.id, supportCase.caseId)} type="button">Reopen case</button> : null}</> : service ? <div className="form-actions">{!checkpoints.acknowledged ? <button className="text-link" disabled={disabled || Boolean(activeSupportReopen || activeSupportService || activeSupportResolution)} onClick={() => onOpenSupportService(order.id, supportCase.caseId, 'acknowledged')} type="button">Acknowledge</button> : !checkpoints.firstResponseReady ? <button className="text-link" disabled={disabled || Boolean(activeSupportReopen || activeSupportService || activeSupportResolution)} onClick={() => onOpenSupportService(order.id, supportCase.caseId, 'first_response_ready')} type="button">Response ready</button> : <button className="text-link" disabled={disabled || Boolean(activeSupportReopen || activeSupportService || activeSupportResolution)} onClick={() => onOpenSupportResolution(order.id, supportCase.caseId)} type="button">Resolve case</button>}<button className="text-link" disabled={disabled || Boolean(activeSupportReopen || activeSupportService || activeSupportResolution)} onClick={() => onOpenSupportService(order.id, supportCase.caseId, 'reassigned')} type="button">Reassign</button><button className="text-link" disabled={disabled || Boolean(activeSupportReopen || activeSupportService || activeSupportResolution)} onClick={() => onOpenSupportService(order.id, supportCase.caseId, 'escalated')} type="button">Escalate</button></div> : <button className="text-link" disabled={disabled || Boolean(activeSupportResolution)} onClick={() => onOpenSupportResolution(order.id, supportCase.caseId)} type="button">Resolve legacy case</button>}
            <small>No external message or refund performed</small>
          </div>
        })}
      </div> : null}
      {order.corrections?.length ? <div className="order-return-records" role="list">
        {order.corrections.map((record) => <div key={record.documentId} role="listitem">
          <strong>{record.kind} note · {formatMoney(record.calculation.totalMmk)} · balance {formatMoney(record.balanceAfterMmk)}</strong>
          <small>{record.reasonCode.replaceAll('_', ' ')} · {record.actor} · {formatTime(record.createdAt)} · evidence {record.evidenceReference}</small>
          <small>Review required · no external posting performed</small>
        </div>)}
      </div> : null}
      {activeReturnDraft && selectedLine ? <form aria-label={`Return items from ${order.id}`} className="order-return-editor" onSubmit={onReviewReturn} ref={onReturnEditor}>
        <div className="order-return-copy"><span className="core-eyebrow">Return</span><strong>{order.id}</strong><small>{activeReturnDraft.sourceIntent ? `Prepared from customer request ${activeReturnDraft.sourceIntent.id}. Confirm what Shop actually received.` : 'Record received goods only.'} Payment and order totals do not change.</small></div>
        <label>Item<select disabled={disabled || availableLines.length === 1} onChange={(event) => onChangeReturn({ sku: event.target.value, quantity: '1' })} value={selectedLine.sku}>{availableLines.map((line) => <option key={line.sku} value={line.sku}>{line.name} · {line.remaining} left</option>)}</select></label>
        <label>Quantity<input autoFocus disabled={disabled} id="order-return-quantity" max={selectedLine.remaining} min="1" onChange={(event) => onChangeReturn({ quantity: event.target.value })} required step="1" type="number" value={activeReturnDraft.quantity} /></label>
        <label>Stock result<select disabled={disabled} onChange={(event) => onChangeReturn({ disposition: event.target.value as CommerceReturnDisposition })} value={activeReturnDraft.disposition}><option value="restock">Sellable · add to stock</option><option value="not_restocked">Not sellable · stock unchanged</option></select></label>
        {activeReturnDraft.disposition === 'restock' && returnLocationPreview ? <small role="note">Restock to {returnLocationPreview}</small> : null}
        <div className="form-actions"><button className={coreUi.q} disabled={disabled} type="submit">Review return</button><button className="core-button compact" disabled={disabled} onClick={onCancelReturn} type="button">Cancel</button></div>
      </form> : null}
      {activeSupportDraft ? <form aria-label={`Open support case for ${order.id}`} className="order-return-editor" onSubmit={onReviewSupportOpen}>
        <div className="order-return-copy"><span className="core-eyebrow">Customer help</span><strong>{activeSupportDraft.intent.category.replaceAll('_', ' ')}</strong><small>{activeSupportDraft.intent.description}</small><small>Assign service responsibility before opening. This does not send a message or start a refund.</small></div>
        <div className="form-row"><label>Priority<select disabled={disabled} onChange={(event) => onChangeSupportOpen({ priority: event.target.value as CommerceSupportPriority })} value={activeSupportDraft.priority}><option value="urgent">Urgent</option><option value="high">High</option><option value="normal">Normal</option><option value="low">Low</option></select></label><label>Owner<input disabled={disabled} maxLength={120} onChange={(event) => onChangeSupportOpen({ owner: event.target.value })} required value={activeSupportDraft.owner} /></label></div>
        <label>Due time<input disabled={disabled} min={localDateTimeInputValue(new Date())} onChange={(event) => onChangeSupportOpen({ dueAt: event.target.value })} required type={coreUi.d} value={activeSupportDraft.dueAt} /></label>
        <div className="form-actions"><button className={coreUi.q} disabled={disabled} id="shop-support-open-review" type="submit">Review case opening</button><button className="core-button compact" disabled={disabled} onClick={onCancelSupportOpen} type="button">Cancel</button></div>
      </form> : null}
      {activeSupportReopen ? <form aria-label={`Reopen support case ${activeSupportReopen.caseId}`} className="order-return-editor" onSubmit={onReviewSupportReopen}>
        <div className="order-return-copy"><span className="core-eyebrow">Follow-up</span><strong>{activeSupportReopen.caseId}</strong><small>Retain resolution {activeSupportReopen.sourceResolutionActionId} and start one linked service cycle. This does not send a message or start a refund.</small></div>
        <div className="form-row"><label>Priority<select disabled={disabled} onChange={(event) => onChangeSupportReopen({ priority: event.target.value as CommerceSupportPriority })} value={activeSupportReopen.priority}><option value="urgent">Urgent</option><option value="high">High</option><option value="normal">Normal</option><option value="low">Low</option></select></label><label>Owner<input disabled={disabled} id={`support-reopen-${activeSupportReopen.caseId}`} maxLength={120} onChange={(event) => onChangeSupportReopen({ owner: event.target.value })} required value={activeSupportReopen.owner} /></label></div>
        <label>Due time<input disabled={disabled} min={localDateTimeInputValue(new Date())} onChange={(event) => onChangeSupportReopen({ dueAt: event.target.value })} required type={coreUi.d} value={activeSupportReopen.dueAt} /></label>
        <label>Follow-up reason<textarea disabled={disabled} maxLength={300} onChange={(event) => onChangeSupportReopen({ note: event.target.value })} required rows={2} value={activeSupportReopen.note} /></label>
        <div className="form-actions"><button className={coreUi.q} disabled={disabled} type="submit">Review follow-up</button><button className="core-button compact" disabled={disabled} onClick={onCancelSupportReopen} type="button">Cancel</button></div>
      </form> : null}
      {activeSupportService ? <form aria-label={`${commerceSupportServiceActionLabels[activeSupportService.kind]} ${activeSupportService.caseId}`} className="order-return-editor" onSubmit={onReviewSupportService}>
        <div className="order-return-copy"><span className="core-eyebrow">{commerceSupportServiceActionLabels[activeSupportService.kind]}</span><strong>{activeSupportService.caseId}</strong><small>{activeSupportService.kind === 'reassigned' ? 'Change only the accountable owner. Priority and due time stay immutable.' : activeSupportService.kind === 'escalated' ? 'Keep the owner and raise priority or bring a future due time forward.' : activeSupportService.kind === 'acknowledged' ? 'Record that the accountable owner accepted this case internally.' : 'Record that a first response is ready for independent delivery.'} No message, refund, or payment action runs.</small></div>
        {activeSupportService.kind === 'reassigned' ? <label>New owner<input disabled={disabled} id={`support-service-${activeSupportService.caseId}`} maxLength={120} onChange={(event) => onChangeSupportService({ owner: event.target.value })} required value={activeSupportService.owner} /></label> : activeSupportService.kind === 'escalated' ? <><div className="form-row"><label>Owner<input disabled value={activeSupportService.owner} /></label><label>Priority<select disabled={disabled} id={`support-service-${activeSupportService.caseId}`} onChange={(event) => onChangeSupportService({ priority: event.target.value as CommerceSupportPriority })} value={activeSupportService.priority}><option value="urgent">Urgent</option><option value="high">High</option><option value="normal">Normal</option><option value="low">Low</option></select></label></div><label>Earlier due time<input disabled={disabled} min={localDateTimeInputValue(new Date())} onChange={(event) => onChangeSupportService({ dueAt: event.target.value })} required type={coreUi.d} value={activeSupportService.dueAt} /></label></> : <small role="note">{activeSupportService.priority} priority · owner {activeSupportService.owner} · target {formatTime(new Date(activeSupportService.dueAt).toISOString())}</small>}
        <label>{activeSupportService.kind === 'first_response_ready' ? 'Response preparation note' : activeSupportService.kind === 'acknowledged' ? 'Acknowledgement note' : 'Reason'}<textarea disabled={disabled} id={activeSupportService.kind === 'acknowledged' || activeSupportService.kind === 'first_response_ready' ? `support-service-${activeSupportService.caseId}` : undefined} maxLength={300} onChange={(event) => onChangeSupportService({ note: event.target.value })} required rows={2} value={activeSupportService.note} /></label>
        <div className="form-actions"><button className={coreUi.q} disabled={disabled} type="submit">Review {activeSupportService.kind === 'acknowledged' ? 'acknowledgement' : activeSupportService.kind === 'first_response_ready' ? 'response readiness' : 'service change'}</button><button className="core-button compact" disabled={disabled} onClick={onCancelSupportService} type="button">Cancel</button></div>
      </form> : null}
      {activeSupportResolution ? <form aria-label={`Resolve support case ${activeSupportResolution.caseId}`} className="order-return-editor" onSubmit={onReviewSupportResolution}>
        <div className="order-return-copy"><span className="core-eyebrow">Resolve help case</span><strong>{activeSupportResolution.caseId}</strong><small>Record the reviewed outcome only. External communication and financial action remain separate.</small></div>
        <label>Outcome<select disabled={disabled} onChange={(event) => onChangeSupportResolution({ outcome: event.target.value as CommerceSupportResolutionOutcome })} value={activeSupportResolution.outcome}><option value="information_provided">Information provided</option><option value="replacement_review_required">Replacement review required</option><option value="refund_review_required">Refund review required</option><option value="no_action">No action</option></select></label>
        <label>Resolution note<textarea disabled={disabled} id={`support-resolution-${activeSupportResolution.caseId}`} maxLength={300} onChange={(event) => onChangeSupportResolution({ note: event.target.value })} required rows={2} value={activeSupportResolution.note} /></label>
        <div className="form-actions"><button className={coreUi.q} disabled={disabled} type="submit">Review resolution</button><button className="core-button compact" disabled={disabled} onClick={onCancelSupportResolution} type="button">Cancel</button></div>
      </form> : null}
      {activeCorrectionDraft ? <form aria-label={activeCorrectionDraft.loyalty ? `Redeem points on ${order.id}` : `Correct invoice ${order.id}`} className="order-return-editor" onSubmit={onReviewCorrection} ref={onCorrectionEditor}>
        <div className="order-return-copy"><span className="core-eyebrow">{activeCorrectionDraft.loyalty ? 'Redeem points' : 'Correction note'}</span><strong>{order.id}</strong><small>{activeCorrectionDraft.loyalty ? `${activeCorrectionDraft.loyalty.customer} holds ${loyaltyBalance.toLocaleString()} points. Points are redeemed as a credit note on this order — 1 point = 1 MMK.` : activeCorrectionDraft.sourceIntent ? `Prepared from customer request ${activeCorrectionDraft.sourceIntent.id}. Recheck the calculation; request details stay locked.` : 'The original invoice stays unchanged.'} This records review evidence; it does not post externally.</small></div>
        {activeCorrectionDraft.loyalty
          ? <small role="note">Credit note · reason “other” — locked for points redemption</small>
          : <>
            <label>Type<select disabled={disabled || Boolean(activeCorrectionDraft.sourceIntent)} onChange={(event) => onChangeCorrection({ kind: event.target.value as CommerceCorrectionKind })} value={activeCorrectionDraft.kind}><option value="credit">Credit · reduce balance</option><option value="debit">Debit · increase balance</option></select></label>
            <label>Reason<select disabled={disabled || Boolean(activeCorrectionDraft.sourceIntent)} onChange={(event) => onChangeCorrection({ reasonCode: event.target.value as CommerceCorrectionReasonCode })} value={activeCorrectionDraft.reasonCode}><option value="pricing_error">Pricing error</option><option value="service_recovery">Service recovery</option><option value="fee_adjustment">Fee adjustment</option><option value="other">Other</option></select></label>
          </>}
        <label>{activeCorrectionDraft.loyalty ? 'Points to redeem' : 'Amount before tax'}<input autoFocus disabled={disabled || Boolean(activeCorrectionDraft.sourceIntent)} id="order-correction-amount" inputMode="numeric" max={activeCorrectionDraft.loyalty ? loyaltyBalance : undefined} min="1" onChange={(event) => onChangeCorrection({ listedAmountMmk: event.target.value })} required step="1" type="number" value={activeCorrectionDraft.listedAmountMmk} /></label>
        {correctionCalculation ? <small role="note">Tax {formatMoney(correctionCalculation.taxMmk)} · note total {formatMoney(correctionCalculation.totalMmk)} · same tax snapshot as the original invoice</small> : null}
        <div className="form-actions"><button className={coreUi.q} disabled={disabled || !correctionCalculation} type="submit">{activeCorrectionDraft.loyalty ? 'Review redemption' : 'Review correction'}</button><button className="core-button compact" disabled={disabled} onClick={onCancelCorrection} type="button">Cancel</button></div>
      </form> : null}
    </article>})}</div>
    {pageCount > 1 ? <nav aria-label="Closed order pages" className="order-archive-pagination">
      <button className="text-link" disabled={currentPage === 0} onClick={() => setPage((current) => Math.max(0, current - 1))} type="button">Previous</button>
      <span>Page {currentPage + 1} of {pageCount}</span>
      <button className="text-link" disabled={currentPage === pageCount - 1} onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))} type="button">Next</button>
    </nav> : null}
  </details>
}
