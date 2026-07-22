import { type FormEvent, useEffect, useReducer, useRef, useState } from 'react'

import { ApprovalGate } from './ApprovalGate'
import { CommerceWorkspaces } from './CommerceWorkspaces'
import {
  acceptWebsiteEcommerceHandoff,
  createWebsiteOrderDraft,
  readWebsiteEcommerceHandoff,
  type WebsiteEcommerceHandoffContext,
} from '../product-handoff'
import {
  type ApprovalDetails,
  type AuditEvent,
  type CommerceView,
  type ProposedAction,
  commerceReducer,
  commerceViewDefinitions,
  createDemoWorkspace,
  createFulfillmentProposal,
  createPaymentProposal,
  createStockReceiptProposal,
  formatYangonTime,
} from './ecommerce-model'
import './ecommerce-orders.css'

const viewCopy: Record<CommerceView, { eyebrow: string; title: string; copy: string }> = {
  orders: {
    eyebrow: 'Operational queue',
    title: 'Ecommerce & Orders',
    copy: 'Confirm incoming records, then hand off stock, payment, and fulfilment with accountable approvals.',
  },
  catalog: {
    eyebrow: 'Product control',
    title: 'Catalog & stock',
    copy: 'Keep sellable products, prices, available stock, and reorder boundaries in one compact record.',
  },
  fulfillment: {
    eyebrow: 'Order handoffs',
    title: 'Fulfilment',
    copy: 'Move each order through recorded stages without silently contacting a customer or delivery service.',
  },
  payments: {
    eyebrow: 'Manual control',
    title: 'Payment status',
    copy: 'Track cash, QR, and transfer evidence without claiming a live gateway or bank reconciliation.',
  },
}

const guidedSteps = [
  {
    title: 'Open one real-looking record',
    copy: 'Start with ORD-MM-2407, a Messenger order with QR evidence waiting for manual review.',
    action: 'Open sample order',
  },
  {
    title: 'Propose a reconciliation',
    copy: 'The status cannot change directly. Queue the payment review and inspect its before/after effect.',
    action: 'Review QR evidence',
  },
  {
    title: 'Keep a human accountable',
    copy: 'Add an operator, reason, and evidence reference, then explicitly approve the local change.',
    action: 'Reopen approval',
  },
  {
    title: 'Trace what changed',
    copy: 'Open the audit history to see the actor, evidence, reason, and exact state transition.',
    action: 'Open audit history',
  },
] as const

function ProductBrand() {
  return <a className="eco-brand" aria-label="Back to SuperMega operations" href="/operations/"><span aria-hidden="true">&gt;_</span><strong>SUPERMEGA</strong></a>
}

function GuidedDemo({
  hasPendingApproval,
  step,
  onAdvance,
  onClose,
  onRestart,
}: {
  hasPendingApproval: boolean
  step: number
  onAdvance: () => void
  onClose: () => void
  onRestart: () => void
}) {
  const complete = step >= guidedSteps.length
  const current = guidedSteps[Math.min(step, guidedSteps.length - 1)]

  return (
    <section className="eco-guide" aria-label="Guided demo" aria-live="polite">
      <header>
        <div><span>Guided demo</span><strong>{complete ? 'Complete' : `${step + 1} / ${guidedSteps.length}`}</strong></div>
        <button aria-label="Close guided demo" className="eco-icon-button" onClick={onClose} type="button">×</button>
      </header>
      <div className="eco-guide-progress" aria-hidden="true"><i style={{ width: `${complete ? 100 : ((step + 1) / guidedSteps.length) * 100}%` }} /></div>
      {complete ? (
        <div className="eco-guide-body">
          <span className="eco-eyebrow">Scenario complete</span>
          <h2>The local change is attributable.</h2>
          <p>You reviewed an order, passed a human gate, and created an audit record without contacting an external service.</p>
          <div><button className="eco-button eco-button-quiet" onClick={onRestart} type="button">Restart scenario</button><button className="eco-button eco-button-primary" onClick={onClose} type="button">Finish demo</button></div>
        </div>
      ) : (
        <div className="eco-guide-body">
          <span className="eco-eyebrow">Step {step + 1}</span>
          <h2>{current.title}</h2>
          <p>{current.copy}</p>
          {step !== 2 || !hasPendingApproval ? <button className="eco-button eco-button-primary" onClick={onAdvance} type="button">{current.action}</button> : <small>Complete the approval dialog to continue.</small>}
        </div>
      )}
    </section>
  )
}

function AuditDrawer({ events, onClose }: { events: AuditEvent[]; onClose: () => void }) {
  const titleId = 'eco-audit-title'
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    closeRef.current?.focus()

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }

    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  return (
    <div className="eco-drawer-backdrop">
      <aside aria-labelledby={titleId} aria-modal="true" className="eco-audit-drawer" role="dialog">
        <header className="eco-drawer-head">
          <div><span className="eco-eyebrow">Accountable record</span><h2 id={titleId}>Audit history</h2><p>{events.length} local records · newest first</p></div>
          <button aria-label="Close audit history" className="eco-icon-button" onClick={onClose} ref={closeRef} type="button">×</button>
        </header>
        <div className="eco-audit-list">
          {events.map((event) => (
            <article key={event.id}>
              <header><span>{event.id}</span><b data-kind={event.actorKind}>{event.actorKind === 'human' ? 'Human' : 'Demo fixture'}</b></header>
              <h3>{event.summary}</h3>
              <div className="eco-audit-change"><span>{event.before}</span><i>→</i><strong>{event.after}</strong></div>
              <dl>
                <div><dt>Actor</dt><dd>{event.actor}</dd></div>
                <div><dt>Time</dt><dd>{formatYangonTime(event.createdAt)} MMT</dd></div>
                <div><dt>Reason</dt><dd>{event.reason}</dd></div>
                <div><dt>Evidence</dt><dd>{event.evidenceReference}</dd></div>
              </dl>
            </article>
          ))}
        </div>
        <p className="eco-drawer-boundary">History is held in component memory for this standalone prototype and resets on reload. It is not a production audit store.</p>
      </aside>
    </div>
  )
}

function WebsiteIntakeApproval({
  context,
  onApprove,
  onCancel,
}: {
  context: WebsiteEcommerceHandoffContext
  onApprove: (operatorId: string) => void
  onCancel: () => void
}) {
  const [operatorId, setOperatorId] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const operatorRef = useRef<HTMLInputElement>(null)
  const canApprove = /^OP-[A-Z0-9][A-Z0-9_-]{2,31}$/.test(operatorId) && confirmed

  useEffect(() => {
    operatorRef.current?.focus()
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [onCancel])

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (canApprove) onApprove(operatorId)
  }

  return (
    <div className="eco-modal-backdrop">
      <section aria-labelledby="eco-handoff-approval-title" aria-modal="true" className="eco-approval-dialog" role="dialog">
        <header className="eco-dialog-head">
          <div><span className="eco-eyebrow">Human approval required</span><h2 id="eco-handoff-approval-title">Accept Website intake · {context.handoff.id}</h2></div>
          <button aria-label="Cancel Website intake approval" className="eco-icon-button" onClick={onCancel} type="button">×</button>
        </header>
        <div className="eco-change-preview" aria-label="Proposed handoff change">
          <span><small>Before</small><strong>Pending acceptance</strong></span>
          <i aria-hidden="true">→</i>
          <span><small>After approval</small><strong>Accepted local intake</strong></span>
        </div>
        <p className="eco-boundary-note">Acceptance stores a non-PII intake record and one audit event in this browser. It does not create an order, contact a customer, reserve stock, collect payment, or write to Commerce.</p>
        <form className="eco-approval-form" onSubmit={submit}>
          <label>
            Responsible operator ID
            <input
              autoComplete="off"
              maxLength={35}
              onChange={(event) => setOperatorId(event.target.value.toUpperCase())}
              pattern="OP-[A-Z0-9][A-Z0-9_-]{2,31}"
              placeholder="OP-OWNER"
              ref={operatorRef}
              required
              value={operatorId}
            />
          </label>
          <div className="eco-handoff-evidence">
            <span>Evidence reference</span>
            <code>{context.handoff.source.localPublishId}</code>
            <small>The Website revision marker identifies local state; it is not a cryptographic signature.</small>
          </div>
          <label className="eco-handoff-confirmation">
            <input checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} type="checkbox" />
            <span>I reviewed this exact local Website intake and accept the recorded SKU and quantity.</span>
          </label>
          <div className="eco-dialog-actions">
            <span />
            <button className="eco-button eco-button-quiet" onClick={onCancel} type="button">Cancel</button>
            <button className="eco-button eco-button-primary" disabled={!canApprove} type="submit">Accept local intake</button>
          </div>
        </form>
      </section>
    </div>
  )
}

export function EcommerceOrdersProduct() {
  const [workspace, dispatch] = useReducer(commerceReducer, 0, () => createDemoWorkspace())
  const [activeView, setActiveView] = useState<CommerceView>('orders')
  const [selectedOrderId, setSelectedOrderId] = useState('ORD-MM-2407')
  const [pendingAction, setPendingAction] = useState<ProposedAction | null>(null)
  const [auditOpen, setAuditOpen] = useState(false)
  const [guideOpen, setGuideOpen] = useState(false)
  const [guideStep, setGuideStep] = useState(0)
  const [websiteHandoff, setWebsiteHandoff] = useState(() => readWebsiteEcommerceHandoff())
  const [handoffApprovalOpen, setHandoffApprovalOpen] = useState(false)
  const [announcement, setAnnouncement] = useState(() => {
    if (!websiteHandoff) return 'Scenario records loaded locally. No integrations are connected.'
    if (websiteHandoff.handoff.state !== 'accepted') return 'Approved Website fixture is ready for human intake review. No order has been created.'
    return websiteHandoff.draft
      ? `${websiteHandoff.draft.id} is a local order draft with customer, fulfilment, and payment fields still missing. No order was confirmed.`
      : `${websiteHandoff.handoff.id} is an accepted local intake; no order draft has been created yet.`
  })
  const activeCopy = viewCopy[activeView]
  const handoffAudit: AuditEvent[] = (websiteHandoff?.audit ?? []).map((event) => ({
    ...event,
    summary: 'Accepted Website-to-Ecommerce handoff',
  }))
  const combinedAudit = [...handoffAudit, ...workspace.audit]
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))

  useEffect(() => {
    document.title = 'Ecommerce & Orders | SuperMega'
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [])

  const openOrders = workspace.orders.filter((order) => order.fulfillmentStatus !== 'delivered').length
  const paymentReview = workspace.orders.filter((order) => ['evidence_needed', 'evidence_submitted', 'exception'].includes(order.paymentStatus)).length
  const readyToDispatch = workspace.orders.filter((order) => order.fulfillmentStatus === 'ready_for_dispatch').length
  const stockBoundaries = workspace.catalog.filter((item) => item.onHand <= item.reorderAt).length

  function changeView(view: CommerceView) {
    setActiveView(view)
    setAnnouncement(`${viewCopy[view].title} view opened.`)
  }

  function openOrder(orderId: string) {
    setSelectedOrderId(orderId)
    setActiveView('orders')
    setAnnouncement(`${orderId} opened in the order workspace.`)
  }

  function requestFulfillment(orderId: string) {
    const order = workspace.orders.find((candidate) => candidate.id === orderId)
    const proposal = order ? createFulfillmentProposal(order) : null
    if (!proposal) {
      setAnnouncement('No fulfilment change is available. Resolve any payment hold or review the completed record.')
      return
    }
    setPendingAction(proposal)
    setAnnouncement(`${proposal.id} is waiting for human approval.`)
  }

  function requestPayment(orderId: string) {
    const order = workspace.orders.find((candidate) => candidate.id === orderId)
    const proposal = order ? createPaymentProposal(order) : null
    if (!proposal) {
      setAnnouncement('No payment change is available for this order at its current recorded state.')
      return
    }
    setPendingAction(proposal)
    setAnnouncement(`${proposal.id} is waiting for human approval.`)
    if (guideOpen && guideStep === 1 && orderId === 'ORD-MM-2407') setGuideStep(2)
  }

  function requestStockReceipt(sku: string) {
    const item = workspace.catalog.find((candidate) => candidate.sku === sku)
    if (!item) return
    const proposal = createStockReceiptProposal(item)
    setPendingAction(proposal)
    setAnnouncement(`${proposal.id} is waiting for human approval.`)
  }

  function requestWebsiteIntake() {
    const current = readWebsiteEcommerceHandoff()
    if (!current) {
      setAnnouncement('No valid Website handoff is available in this browser.')
      return
    }
    const matchingItems = workspace.catalog.filter((candidate) => candidate.sku === current.handoff.intake.sku && candidate.active)
    if (matchingItems.length !== 1) {
      setAnnouncement('The Website fixture does not match exactly one active local catalog item, so intake failed closed.')
      return
    }
    const [item] = matchingItems
    setWebsiteHandoff(current)
    if (current.handoff.state === 'accepted') {
      if (current.draft) {
        setAnnouncement(`${current.draft.id} already exists for ${current.handoff.id}; idempotency prevented a duplicate draft.`)
        return
      }
      const drafted = createWebsiteOrderDraft(current.handoff.id, {
        sku: item.sku,
        itemName: item.name,
        variant: item.variant,
        active: item.active,
        unitPriceMmk: item.priceMmk,
      })
      if (!drafted?.draft) {
        setAnnouncement('Draft creation failed closed. The accepted Website source or active catalog price could not be verified; nothing changed.')
        return
      }
      setWebsiteHandoff(drafted)
      setAnnouncement(`${drafted.draft.id} created once from ${current.handoff.id}. The saved MMK price is immutable; no order was confirmed, stock reserved, payment started, or message sent.`)
      return
    }
    setHandoffApprovalOpen(true)
    setAnnouncement(`${current.handoff.id} is waiting for attributable human approval.`)
  }

  function approveWebsiteIntake(operatorId: string) {
    if (!websiteHandoff || websiteHandoff.handoff.state !== 'pending_acceptance') return
    const matchingItems = workspace.catalog.filter((candidate) => candidate.sku === websiteHandoff.handoff.intake.sku && candidate.active)
    if (matchingItems.length !== 1) {
      setHandoffApprovalOpen(false)
      setAnnouncement('Website intake acceptance failed closed because exactly one active catalog match is required.')
      return
    }
    const accepted = acceptWebsiteEcommerceHandoff(websiteHandoff.handoff.id, operatorId)
    if (!accepted || accepted.handoff.state !== 'accepted') {
      setHandoffApprovalOpen(false)
      setAnnouncement('Website intake acceptance failed closed; no intake or audit record was created.')
      return
    }
    setWebsiteHandoff(accepted)
    setHandoffApprovalOpen(false)
    setAnnouncement(`${accepted.handoff.id} accepted locally by ${accepted.handoff.acceptance.operatorId}; create the idempotent local draft when ready.`)
  }

  function approveAction(details: ApprovalDetails) {
    if (!pendingAction) return
    const approvedAction = pendingAction
    dispatch({
      type: 'apply_approved_action',
      proposal: approvedAction,
      approval: details,
      appliedAt: new Date().toISOString(),
    })
    setPendingAction(null)
    setAnnouncement(`${approvedAction.id} applied locally and added to audit history.`)
    if (guideOpen && guideStep === 2 && approvedAction.subjectId === 'ORD-MM-2407') setGuideStep(3)
  }

  function advanceGuide() {
    if (guideStep === 0) {
      openOrder('ORD-MM-2407')
      setGuideStep(1)
      return
    }
    if (guideStep === 1 || guideStep === 2) {
      requestPayment('ORD-MM-2407')
      return
    }
    if (guideStep === 3) {
      setAuditOpen(true)
      setGuideStep(4)
    }
  }

  function restartDemo() {
    dispatch({ type: 'reset_demo', workspace: createDemoWorkspace() })
    setActiveView('orders')
    setSelectedOrderId('ORD-MM-2407')
    setPendingAction(null)
    setAuditOpen(false)
    setGuideStep(0)
    setAnnouncement('Guided scenario restarted with fresh local records.')
  }

  return (
    <div className="eco-product">
      <a className="eco-skip-link" href="#eco-workspace-main">Skip to workspace</a>
      <aside className="eco-sidebar">
        <ProductBrand />
        <div className="eco-product-label"><span>Product</span><strong>Ecommerce & Orders</strong><small>Standalone first prototype</small></div>
        <nav className="eco-primary-nav" aria-label="Ecommerce product">
          {commerceViewDefinitions.map((view) => (
            <button aria-current={activeView === view.id ? 'page' : undefined} key={view.id} onClick={() => changeView(view.id)} type="button"><span>{view.index}</span>{view.label}</button>
          ))}
        </nav>
        <div className="eco-sidebar-foot">
          <span className="eco-mode-badge"><i />Isolated demo</span>
          <p>Browser-memory scenario records. Customer sends, checkout, payments, delivery, and production writes are not connected.</p>
          <button className="eco-text-button" onClick={() => setGuideOpen(true)} type="button">Start guided demo →</button>
        </div>
      </aside>

      <div className="eco-stage">
        <header className="eco-topbar">
          <div className="eco-mobile-brand"><ProductBrand /></div>
          <div className="eco-topbar-title"><span>&gt;_</span><strong>Ecommerce operations</strong></div>
          <div className="eco-topbar-actions">
            <span className="eco-topbar-meta">MMK · MMT UTC+06:30</span>
            <button className="eco-button eco-button-quiet" onClick={() => setGuideOpen(true)} type="button">Guided demo</button>
            <button className="eco-button eco-button-quiet" onClick={() => setAuditOpen(true)} type="button">Audit · {combinedAudit.length}</button>
            <span className="eco-mode-badge"><i />Local only</span>
          </div>
        </header>

        <nav className="eco-mobile-nav" aria-label="Ecommerce product views">
          {commerceViewDefinitions.map((view) => <button aria-current={activeView === view.id ? 'page' : undefined} key={view.id} onClick={() => changeView(view.id)} type="button">{view.label}</button>)}
        </nav>

        <main className="eco-main" id="eco-workspace-main">
          <header className="eco-page-heading">
            <div><span className="eco-eyebrow">{activeCopy.eyebrow}</span><h1>{activeCopy.title}</h1><p>{activeCopy.copy}</p></div>
            <div className="eco-scenario-label"><span>Scenario data</span><strong>Yangon local order desk</strong><small>No live sources</small></div>
          </header>

          <section className="eco-summary-strip" aria-label="Current scenario summary">
            <span><small>Open orders</small><strong>{openOrders}</strong></span>
            <span><small>Payment review</small><strong>{paymentReview}</strong></span>
            <span><small>Ready to dispatch</small><strong>{readyToDispatch}</strong></span>
            <span><small>Stock boundaries</small><strong>{stockBoundaries}</strong></span>
          </section>

          <p className="eco-announcement" aria-live="polite"><span>&gt;_</span>{announcement}</p>

          <div className="eco-workspace-view">
            <CommerceWorkspaces
              catalog={workspace.catalog}
              onOpenOrder={openOrder}
              onReceiveStock={requestStockReceipt}
              onRequestFulfillment={requestFulfillment}
              onRequestPayment={requestPayment}
              onRequestWebsiteIntake={requestWebsiteIntake}
              onSelectOrder={setSelectedOrderId}
              orders={workspace.orders}
              selectedOrderId={selectedOrderId}
              view={activeView}
              websiteHandoff={websiteHandoff}
              websiteDraftCreated={Boolean(websiteHandoff?.draft)}
            />
          </div>
        </main>
      </div>

      {guideOpen ? <GuidedDemo hasPendingApproval={Boolean(pendingAction)} onAdvance={advanceGuide} onClose={() => setGuideOpen(false)} onRestart={restartDemo} step={guideStep} /> : null}
      {auditOpen ? <AuditDrawer events={combinedAudit} onClose={() => setAuditOpen(false)} /> : null}
      {pendingAction ? <ApprovalGate action={pendingAction} guidedDemo={guideOpen} onApprove={approveAction} onCancel={() => setPendingAction(null)} /> : null}
      {handoffApprovalOpen && websiteHandoff ? <WebsiteIntakeApproval context={websiteHandoff} onApprove={approveWebsiteIntake} onCancel={() => setHandoffApprovalOpen(false)} /> : null}
    </div>
  )
}
