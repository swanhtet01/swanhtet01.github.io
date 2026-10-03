import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import type { CommerceState } from './commerce-workspace'
import type { ShopBatchProfitControlProjection } from './shop-batch-profit-control'
import {
  createShopBatchFirstUseWorkspaceCapability,
  revokeShopBatchFirstUseWorkspaceCapability,
  shopBatchFirstUseWorkspaceCapabilityIsCurrent,
  type ShopBatchFirstUseWorkspaceCapability,
} from './shop-batch-first-use-workspace-capability'
import type { ShopBatchFirstUseProjectionResult } from './shop-batch-profit-control-first-use'
import { SHOP_BATCH_PROFIT_CONTROL_CONTRACT, SHOP_BATCH_PROFIT_CONTROL_RND_CONTRACT_SHA256, projectNoBatchProfitControl, type ShopBatchProfitControlNoBatchProjection } from './shop-batch-profit-control-view'
import { formatShopCostCoverage, formatShopMarginRate, projectShopCostCoverageAndMarginAtRisk } from './shop-cost-coverage-and-margin-at-risk'
import { formatShopProfitControlMetric } from './shop-profit-control'
import type { ShopProfitControlBoard } from './shop-profit-control'

export type ShopTodayMetric = {
  label: string
  value: string
  detail: string
  tone?: 'attention' | 'ready'
}

export type ShopTodayModule = {
  detail: string
  label: string
  status: string
  to: string
  tone?: 'attention' | 'ready'
}

type ShopTodayProps = {
  batchProfitControl?: ShopBatchProfitControlView
  catalogReady: boolean
  metrics: ShopTodayMetric[]
  modules: ShopTodayModule[]
  nextAction: string
  nextActionLabel: string
  nextDetail: string
  nextOwnerGate: string
  nextTo: string
  nextTrack: 'Review' | 'Orders' | 'Inventory' | 'Counter'
  commerce: CommerceState
  localBatchFirstUseAllowed: boolean
  profitControl: ShopProfitControlBoard
}

export type ShopBatchProfitControlView = ShopBatchProfitControlProjection | ShopBatchProfitControlNoBatchProjection

type ShopBatchFirstUseModuleState =
  | { status: 'idle' }
  | { status: 'loading' }
  | {
    status: 'ready'
    Component: typeof import('./shop-batch-profit-control-first-use')['ShopBatchProfitControlFirstUse']
    workspaceCapability: ShopBatchFirstUseWorkspaceCapability
  }
  | { status: 'error' }

const capabilityGroups = [
  ['Sell', 'Visual counter, multi-item sales, payment choice, tax snapshot'],
  ['Orders', 'Omnichannel intake, promise, allocation, fulfilment, returns'],
  ['Stock', 'Locations, lots, available-to-promise, counts, transfers'],
  ['Supply', 'Reorder, purchase orders, receiving, discrepancy, suppliers'],
  ['Customers', 'Credit policy, receivables, service schedule, support'],
  ['Control', 'Daily close, settlement review, accounting export, audit'],
] as const

const formatMmk = (value: number) => `${value.toLocaleString('en-US')} MMK`

const batchStateLabels: Record<ShopBatchProfitControlView['state'], string> = {
  no_batch: 'No batch selected',
  collecting_batch_evidence: 'Collecting evidence',
  review_adjustments: 'Review adjustments',
  batch_margin_at_risk: 'Margin at risk',
  batch_controlled: 'Controlled',
}

const batchReasonLabels: Record<string, string> = {
  no_batch: 'No batch is selected.',
  batch_not_closed: 'The batch is not closed.',
  batch_voided: 'The batch is voided.',
  completed_sale_value_zero: 'No completed sold value is retained.',
  synthetic_or_sample_evidence_excluded: 'Synthetic or sample evidence is excluded from operating proof.',
  retained_sale_evidence_incomplete: 'Completed-sale or payment evidence is incomplete.',
}

function batchClassificationLabel(classification: ShopBatchProfitControlView['truthBoundary']['classification']) {
  if (classification === 'synthetic_local_fixture_never_evidence') return 'Synthetic calculation only — never evidence'
  if (classification === 'retained_non_sample_local_operating_evidence_not_pilot_customer_or_commercial_proof') return 'Retained local operating evidence — not pilot, customer, or commercial proof'
  return 'No batch evidence selected'
}

function selectShopBatchProfitControlView(
  supplied: ShopBatchProfitControlView,
  localBatchFirstUseAllowed: boolean,
  localResult: ShopBatchFirstUseProjectionResult | null,
  currentWorkspaceCapability: ShopBatchFirstUseWorkspaceCapability | null,
): ShopBatchProfitControlView {
  return localBatchFirstUseAllowed
    && supplied.state === 'no_batch'
    && localResult
    && shopBatchFirstUseWorkspaceCapabilityIsCurrent(localResult.workspaceCapability, currentWorkspaceCapability)
    ? localResult.projection
    : supplied
}

function batchPriorityLabel(priority: ShopBatchProfitControlProjection['priorities'][number]) {
  if (priority.itemState === 'zero_sale_produced') return 'Critical cost estimate with no sold value'
  if (priority.itemState === 'critical_negative_margin') return 'Negative contribution estimate'
  return 'Below contribution-estimate floor'
}

export function ShopBatchProfitControlPanel({
  batchProfitControl = projectNoBatchProfitControl(),
  panelAriaLabel = 'Shop Batch Profit Control',
  panelId = 'shop-batch-profit-control',
}: {
  batchProfitControl?: ShopBatchProfitControlView
  panelAriaLabel?: string
  panelId?: string
}) {
  const batchProjectionBound = batchProfitControl.contract === SHOP_BATCH_PROFIT_CONTROL_CONTRACT
    && batchProfitControl.contractSourceSha256 === SHOP_BATCH_PROFIT_CONTROL_RND_CONTRACT_SHA256
    && Object.values(batchProfitControl.authority).every((value) => value === false)

  return <section aria-label={panelAriaLabel} className="shop-margin-control shop-batch-profit-control" id={panelId}>
    <header>
      <div>
        <span className="core-eyebrow">Batch Profit Control</span>
        <h3>Review batch evidence before the next production or delivery decision</h3>
        <p>{batchProjectionBound ? <>
          {batchProfitControl.truthBoundary.costLabel}. {batchClassificationLabel(batchProfitControl.truthBoundary.classification)}. {batchProfitControl.truthBoundary.boundary}
        </> : 'Accepted Batch Profit Control binding did not verify. No evidence, estimate, priority, or authority is inferred.'}</p>
      </div>
      <b data-state={batchProjectionBound ? batchProfitControl.state === 'batch_controlled' ? 'controlled' : batchProfitControl.state : 'blocked'}>{batchProjectionBound ? batchStateLabels[batchProfitControl.state] : 'Blocked'}</b>
    </header>
    {!batchProjectionBound ? <p className="shop-margin-gaps" role="alert"><strong>Batch projection blocked.</strong> The accepted contract binding or no-write authority boundary did not match.</p> : batchProfitControl.state === 'no_batch' ? <p className="shop-margin-gaps" role="status">
      <strong>Decision estimates withheld.</strong> No source-owned batch is selected, so contribution, break-even, margin-at-risk estimates, and priorities remain unavailable.
    </p> : <>
      <div aria-label="Batch evidence status" className="shop-batch-evidence">
        <article data-state={batchProfitControl.evidenceStatus.canonicalDigestsComplete && batchProfitControl.evidenceStatus.immutableRevisionLineageComplete ? 'complete' : 'blocked'}>
          <span>Canonical revision lineage</span><b>{batchProfitControl.evidenceStatus.canonicalDigestsComplete && batchProfitControl.evidenceStatus.immutableRevisionLineageComplete ? 'Complete' : 'Blocked'}</b>
        </article>
        <article data-state={batchProfitControl.evidenceStatus.batchSaleAllocationComplete && batchProfitControl.evidenceStatus.crossBatchReuseAbsent ? 'complete' : 'blocked'}>
          <span>Whole-line batch allocation</span><b>{batchProfitControl.evidenceStatus.batchSaleAllocationComplete && batchProfitControl.evidenceStatus.crossBatchReuseAbsent ? 'Complete' : 'Blocked'}</b>
        </article>
        <article data-state={batchProfitControl.evidenceStatus.productionQuantityCostCoverageComplete && batchProfitControl.evidenceStatus.costEstimateBasisUnambiguous ? 'complete' : 'blocked'}>
          <span>Production-cost estimate coverage</span><b>{batchProfitControl.evidenceStatus.productionQuantityCostCoverageComplete && batchProfitControl.evidenceStatus.costEstimateBasisUnambiguous ? 'Complete' : 'Blocked'}</b>
        </article>
        <article data-state={batchProfitControl.evidenceStatus.retainedSalesEvidenceComplete ? 'complete' : 'blocked'}>
          <span>Retained completed sales</span><b>{batchProfitControl.evidenceStatus.retainedSalesEvidenceComplete ? 'Complete' : 'Excluded or incomplete'}</b>
        </article>
        <article data-state={batchProfitControl.evidenceStatus.overheadReviewComplete ? 'complete' : 'blocked'}>
          <span>Packaging and delivery review</span><b>{batchProfitControl.evidenceStatus.overheadReviewComplete ? 'Complete' : 'Blocked'}</b>
        </article>
        <article data-state={batchProfitControl.evidenceStatus.adjustmentLinkageComplete && batchProfitControl.evidenceStatus.reconciliationComplete ? 'complete' : 'blocked'}>
          <span>Adjustments and unit reconciliation</span><b>{batchProfitControl.evidenceStatus.adjustmentLinkageComplete && batchProfitControl.evidenceStatus.reconciliationComplete ? 'Complete' : 'Blocked'}</b>
        </article>
      </div>
      <p className="shop-batch-identity">
        <strong>{batchProfitControl.batchIdentity.batchId}</strong> · revision {batchProfitControl.batchIdentity.revision} · {batchProfitControl.batchIdentity.businessDate} · {batchClassificationLabel(batchProfitControl.batchIdentity.classification)}
      </p>
      {batchProfitControl.evidenceStatus.withheldReasonCodes.length ? <p className="shop-margin-gaps" role="status">
        <strong>Operating decision status: {batchProfitControl.evidenceStatus.profitStatus === 'withheld' ? 'withheld' : 'estimate available'}.</strong> {batchProfitControl.evidenceStatus.withheldReasonCodes.map((reason) => batchReasonLabels[reason] ?? reason.replaceAll('_', ' ')).join(' ')}
      </p> : null}
      <div className="shop-margin-summary">
        <article>
          <small>Completed sold value</small>
          <strong>{formatMmk(batchProfitControl.totals.totalCompletedSaleValueMmk)}</strong>
          <span>{batchProfitControl.totals.completedSaleUnits} completed units from {batchProfitControl.totals.producedUnits} produced</span>
        </article>
        <article>
          <small>Total batch cost estimate</small>
          <strong>{formatMmk(batchProfitControl.totals.totalBatchCostEstimateMmk)}</strong>
          <span>{formatMmk(batchProfitControl.totals.totalReviewedProductionCostEstimateMmk)} production · {formatMmk(batchProfitControl.totals.totalBatchOverheadMmk)} reviewed overhead</span>
        </article>
        <article>
          <small>Batch contribution estimate</small>
          <strong>{batchProfitControl.estimatePreview ? formatMmk(batchProfitControl.estimatePreview.batchContributionEstimateMmk) : 'Withheld'}</strong>
          <span>{batchProfitControl.estimatePreview ? formatShopMarginRate(batchProfitControl.estimatePreview.aggregateContributionEstimateBasisPoints) : 'No decision metric until all evidence gates pass'}</span>
        </article>
      </div>
      <div className="shop-margin-summary">
        <article>
          <small>Estimated break-even sold value</small>
          <strong>{batchProfitControl.estimatePreview ? formatMmk(batchProfitControl.estimatePreview.estimatedBreakEvenSoldValueMmk) : 'Withheld'}</strong>
          <span>{batchProfitControl.estimatePreview ? `${batchProfitControl.estimatePreview.breakEvenEquivalentCompletedUnits} equivalent completed units` : 'Unknown is never replaced with zero'}</span>
        </article>
        <article>
          <small>Estimated margin at risk</small>
          <strong>{batchProfitControl.estimatePreview ? formatMmk(batchProfitControl.estimatePreview.estimatedMarginAtRiskMmk) : 'Withheld'}</strong>
          <span>{batchProfitControl.estimatePreview ? `${formatMmk(batchProfitControl.estimatePreview.remainingToEstimatedBreakEvenMmk)} remains to estimated break-even` : 'No ranking while decision evidence is incomplete'}</span>
        </article>
        <article>
          <small>Batch disposition</small>
          <strong>{batchProfitControl.totals.leftoverUnits + batchProfitControl.totals.wastedUnits + batchProfitControl.totals.remakeUnits}</strong>
          <span>{batchProfitControl.totals.leftoverUnits} leftover · {batchProfitControl.totals.wastedUnits} wasted · {batchProfitControl.totals.remakeUnits} remake</span>
        </article>
      </div>
      {batchProfitControl.priorities.length ? <div aria-label="Batch margin-risk priorities" className="shop-batch-priorities">
        {batchProfitControl.priorities.map((priority, index) => <article data-tone={priority.severity} key={priority.sku}>
          <header><span>Priority {index + 1} · {batchPriorityLabel(priority)}</span><b>{formatMmk(priority.marginRiskEstimateMmk)} at risk</b></header>
          <strong>{priority.sku}</strong>
          <small>{formatMmk(priority.contributionEstimateMmk)} contribution estimate · {priority.contributionEstimateBasisPoints === null ? 'Rate unavailable — no sold value' : formatShopMarginRate(priority.contributionEstimateBasisPoints)}</small>
          <small>{formatMmk(priority.operationalCostRiskEstimateMmk)} leftover/waste cost estimate · {priority.ownerRole} · {priority.dueLabel}</small>
          <p><strong>Next:</strong> {priority.actionLabel}. <strong>Closed when:</strong> {priority.closureCondition}</p>
        </article>)}
      </div> : batchProfitControl.estimatePreview ? <p className="shop-margin-controlled">No item is below the configured contribution-estimate floor in this validated batch projection.</p> : null}
    </>}
    <p className="panel-note">Read-only local projection. It never counts as baseline, pilot, customer, or commercial proof and performs no payment, stock, supplier, accounting, customer, hosted, provider, model, or production action.</p>
  </section>
}

export function ShopToday({ batchProfitControl = projectNoBatchProfitControl(), catalogReady, commerce, localBatchFirstUseAllowed, metrics, modules, nextAction, nextActionLabel, nextDetail, nextOwnerGate, nextTo, nextTrack, profitControl }: ShopTodayProps) {
  const marginControl = useMemo(() => projectShopCostCoverageAndMarginAtRisk(commerce), [commerce])
  const [batchFirstUse, setBatchFirstUse] = useState<ShopBatchFirstUseModuleState>({ status: 'idle' })
  const [localBatchProjection, setLocalBatchProjection] = useState<ShopBatchFirstUseProjectionResult | null>(null)
  const batchFirstUseAttempt = useRef(0)
  const currentWorkspaceCapability = batchFirstUse.status === 'ready' ? batchFirstUse.workspaceCapability : null
  const readCurrentWorkspaceCapability = useCallback(() => (
    localBatchFirstUseAllowed
      && shopBatchFirstUseWorkspaceCapabilityIsCurrent(currentWorkspaceCapability, currentWorkspaceCapability)
      ? currentWorkspaceCapability
      : null
  ), [currentWorkspaceCapability, localBatchFirstUseAllowed])
  useLayoutEffect(() => () => {
    batchFirstUseAttempt.current += 1
  }, [])
  useLayoutEffect(() => {
    if (batchFirstUse.status !== 'ready') return undefined
    if (!localBatchFirstUseAllowed) revokeShopBatchFirstUseWorkspaceCapability(batchFirstUse.workspaceCapability)
    return () => { revokeShopBatchFirstUseWorkspaceCapability(batchFirstUse.workspaceCapability) }
  }, [batchFirstUse, localBatchFirstUseAllowed])
  const acceptLocalBatchProjection = useCallback((result: ShopBatchFirstUseProjectionResult | null) => {
    if (result && (!localBatchFirstUseAllowed
      || !shopBatchFirstUseWorkspaceCapabilityIsCurrent(result.workspaceCapability, currentWorkspaceCapability))) return
    setLocalBatchProjection(result)
  }, [currentWorkspaceCapability, localBatchFirstUseAllowed])

  const openBatchFirstUse = async () => {
    if (!localBatchFirstUseAllowed) return
    const attempt = ++batchFirstUseAttempt.current
    if (batchFirstUse.status === 'ready') revokeShopBatchFirstUseWorkspaceCapability(batchFirstUse.workspaceCapability)
    setLocalBatchProjection(null)
    setBatchFirstUse({ status: 'loading' })
    try {
      const { ShopBatchProfitControlFirstUse } = await import('./shop-batch-profit-control-first-use')
      if (attempt === batchFirstUseAttempt.current && localBatchFirstUseAllowed) {
        const workspaceCapability = createShopBatchFirstUseWorkspaceCapability()
        setBatchFirstUse({
          status: 'ready',
          Component: ShopBatchProfitControlFirstUse,
          workspaceCapability,
        })
      }
    } catch {
      if (attempt === batchFirstUseAttempt.current) setBatchFirstUse({ status: 'error' })
    }
  }

  const activeBatchProfitControl = selectShopBatchProfitControlView(
    batchProfitControl,
    localBatchFirstUseAllowed,
    localBatchProjection,
    currentWorkspaceCapability,
  )
  const visiblePriorities = profitControl.priorities.slice(0, 2)
  const remainingPriorityCount = profitControl.hiddenPriorityCount + Math.max(0, profitControl.priorities.length - visiblePriorities.length)
  const queueModules = modules.filter((module) => module.label === 'Orders & fulfilment' || module.label === 'Inventory & purchasing')

  return <div className="shop-today">
    <section aria-labelledby="shop-today-title" className="shop-today-overview">
      <header className="shop-today-heading">
        <div>
          <span className="core-eyebrow">Shop workspace</span>
          <h2 id="shop-today-title">Today</h2>
          <p>See sales, orders and risks from the current Shop record.</p>
        </div>
        {catalogReady ? <Link className="core-button primary" to="/shop/?tab=counter">New sale</Link> : null}
      </header>
      <div className="shop-today-metrics" aria-label="Shop summary">
        {metrics.map((metric, index) => <article data-index={index} data-tone={metric.tone ?? 'ready'} key={metric.label}>
          <small>{metric.label}</small>
          <strong>{metric.value}</strong>
          <span>{metric.detail}</span>
        </article>)}
      </div>
    </section>

    <section aria-label="Shop decision desk" className="shop-decision-desk" data-track={nextTrack.toLowerCase()}>
      <article className="shop-decision-primary">
        <header><span className="core-eyebrow">Recommended next</span><b>{nextTrack}</b></header>
        <h3>{nextAction}</h3>
        <div className="shop-decision-guidance">
          <div><span>Why now</span><p>{nextDetail}</p></div>
          <div><span>Owner check</span><p>{nextOwnerGate}</p></div>
        </div>
        <div className="shop-today-actions">
          <Link className="core-button primary shop-decision-action" to={nextTo}>{nextActionLabel}</Link>
          {catalogReady && nextTo !== '/shop/?tab=counter' ? <Link className="core-button" to="/shop/?tab=counter">New sale</Link> : null}
        </div>
      </article>

      <aside aria-label="Shop attention" className="shop-decision-rail" data-state={profitControl.state}>
        <header><span><strong>Attention</strong><small>Evidence from current records</small></span><b>{profitControl.criticalPriorityCount ? `${profitControl.criticalPriorityCount} critical` : profitControl.openPriorityCount ? `${profitControl.openPriorityCount} open` : 'Clear'}</b></header>
        {visiblePriorities.length ? <div className="shop-decision-priorities">
          {visiblePriorities.map((priority) => <Link data-priority-id={priority.id} data-tone={priority.severity === 'critical' || priority.severity === 'attention' ? 'attention' : 'ready'} key={priority.id} to={priority.target}>
            <span><strong>{priority.title}</strong><small>{priority.impact}</small></span>
            <b>{formatShopProfitControlMetric(priority.metric)}</b>
            <small>{priority.ownerRole} · {priority.dueLabel}</small>
            <small><strong>Next:</strong> {priority.actionLabel}</small>
            <small><strong>Done when:</strong> {priority.closureCondition}</small>
          </Link>)}
        </div> : <p className="shop-today-clear-state"><strong>No urgent work</strong><span>Current Shop records do not show an open priority.</span></p>}
        {remainingPriorityCount ? <p className="shop-decision-more">{remainingPriorityCount} more lower-priority {remainingPriorityCount === 1 ? 'signal is' : 'signals are'} available in Advanced controls.</p> : null}
      </aside>
    </section>

    <nav aria-label="Shop work queues" className="shop-today-queues">
      {queueModules.map((module) => <Link data-tone={module.tone ?? 'ready'} key={module.label} to={module.to}>
        <span><strong>{module.label}</strong><small>{module.detail}</small></span><b>{module.status}</b>
      </Link>)}
    </nav>

    <details aria-label="Advanced Shop controls" className="shop-today-workspaces shop-today-advanced">
      <summary><span><strong>Advanced controls</strong><small>Profit, operations and safeguarded evidence</small></span><b>{marginControl.costCoverage.state === 'complete' ? 'Costs reviewed' : 'Review available'}</b></summary>
      <div className="shop-today-advanced-stack">
    <section aria-label="Shop cost coverage and margin at risk" className="shop-margin-control" id="shop-cost-coverage">
      <header>
        <div>
          <span className="core-eyebrow">Daily profit control</span>
          <h3>Cost coverage before margin</h3>
          <p>Retained non-sample completed sales and reviewed retained Shop cost evidence count. This is local operating evidence, not pilot, customer, or commercial proof.</p>
        </div>
        <b data-state={marginControl.state}>{marginControl.costCoverage.state === 'complete' ? 'Cost-complete' : marginControl.costCoverage.state === 'no_retained_sales' ? 'Awaiting retained sale' : 'Evidence incomplete'}</b>
      </header>
      <div className="shop-margin-summary">
        <article>
          <small>Sold-value cost coverage</small>
          <strong>{formatShopCostCoverage(marginControl.costCoverage.coverageBasisPoints)}</strong>
          <span>{formatMmk(marginControl.costCoverage.coveredSoldValueMmk)} of {formatMmk(marginControl.costCoverage.soldValueMmk)}</span>
          <span>Single reviewed unit cost per SKU, allocated by receipt order; conflicts withhold margin.</span>
        </article>
        <article>
          <small>Retained non-sample sales</small>
          <strong>{marginControl.activity.retainedNonSampleCompletedSales}</strong>
          <span>{marginControl.activity.openOrders} open · {marginControl.activity.cancelledOrders} cancelled · {marginControl.activity.sampleOrders} sample excluded</span>
        </article>
        <article>
          <small>Aggregate gross profit</small>
          <strong>{marginControl.profit.grossProfitMmk === null ? 'Withheld' : formatMmk(marginControl.profit.grossProfitMmk)}</strong>
          <span>{marginControl.profit.marginBasisPoints === null ? marginControl.profit.reason : `${formatShopMarginRate(marginControl.profit.marginBasisPoints)} of completed sold value`}</span>
        </article>
      </div>
      {marginControl.costCoverage.state === 'incomplete' ? <p className="shop-margin-gaps" role="status">
        Evidence gaps: {marginControl.costCoverage.gaps.missingLineCount} missing · {marginControl.costCoverage.gaps.staleLineCount} stale · {marginControl.costCoverage.gaps.unlinkedLineCount} unlinked · {marginControl.costCoverage.gaps.unreviewedLineCount} unreviewed · {marginControl.costCoverage.gaps.partialLineCount} partial · {marginControl.costCoverage.gaps.costMethodLineCount} cost-method review
      </p> : null}
      {marginControl.activity.adjustmentBlockedSales ? <p className="shop-margin-gaps" role="status">{marginControl.activity.adjustmentBlockedSales} completed {marginControl.activity.adjustmentBlockedSales === 1 ? 'sale has' : 'sales have'} return, correction, or refund evidence awaiting exact line-value review.</p> : null}
      {marginControl.priorities.length ? <div aria-label="Margin at risk priorities" className="shop-margin-priorities">
        {marginControl.priorities.map((priority) => <Link data-tone={priority.severity} key={priority.id} to={priority.target}>
          <div>
            <span>{priority.marginBasisPoints === null ? 'Critical cost with no sold value' : priority.severity === 'critical' ? 'Negative margin' : 'Below margin floor'}</span>
            <strong>{priority.itemName}</strong>
            <small>{priority.ownerRole} · {priority.dueLabel}</small>
          </div>
          <div>
            <b>{formatMmk(priority.exposureMmk)} at risk</b>
            <small>{priority.marginBasisPoints === null ? 'Margin rate unavailable — no sold value' : `${formatShopMarginRate(priority.marginBasisPoints)} margin`}</small>
          </div>
          <p><strong>Next:</strong> {priority.actionLabel}. <strong>Closed when:</strong> {priority.closureCondition}</p>
        </Link>)}
      </div> : marginControl.profit.status === 'available' ? <p className="shop-margin-controlled">No negative or below-floor margin exposure appears in the complete retained evidence.</p> : null}
      <p className="panel-note">No payment, stock, supplier, accounting, customer, or hosted write runs from this panel.</p>
    </section>

    {localBatchFirstUseAllowed ? <section aria-label="Open local Batch Profit Control workflow" className="shop-margin-control shop-batch-first-use-launcher">
      <header>
        <div>
          <span className="core-eyebrow">Real local Batch review</span>
          <h3>Create one Batch estimate from current retained Shop sales</h3>
          <p>Open an explicit local workflow to select eligible completed-sale lines, review production-cost estimates and disposition, and save a versioned immutable Batch receipt. Existing Batch records and the current Shop workspace are never overwritten.</p>
          <button className="core-button" disabled={batchFirstUse.status === 'loading'} onClick={() => { void openBatchFirstUse() }} type="button">
            {batchFirstUse.status === 'loading' ? 'Opening local Batch review…' : batchFirstUse.status === 'ready' ? 'Reload local Batch workflow' : 'Open local Batch review'}
          </button>
        </div>
        <b>Owner-reviewed local estimate</b>
      </header>
      {batchFirstUse.status === 'error' ? <p className="shop-margin-gaps" role="alert">Local Batch workflow failed to load. No estimate was shown or saved and the Shop workspace stayed unchanged.</p> : null}
      {batchFirstUse.status === 'ready'
        && shopBatchFirstUseWorkspaceCapabilityIsCurrent(batchFirstUse.workspaceCapability, currentWorkspaceCapability)
        ? <batchFirstUse.Component commerce={commerce} onProjection={acceptLocalBatchProjection} readCurrentWorkspaceCapability={readCurrentWorkspaceCapability} workspaceCapability={batchFirstUse.workspaceCapability} />
        : null}
      <p className="panel-note">Not pilot, customer, commercial, or accounting proof. No payment, stock, supplier, customer, hosted, provider, model, or production write is authorized.</p>
    </section> : null}

    <ShopBatchProfitControlPanel batchProfitControl={activeBatchProfitControl} />

    <section aria-labelledby="shop-operations-title" className="shop-today-advanced-section">
      <header><span><strong id="shop-operations-title">Operations</strong><small>Customers, finance, channels and purchasing</small></span><b>{modules.length} areas</b></header>
      <div className="shop-today-module-grid">
        {modules.map((module) => <Link data-tone={module.tone ?? 'ready'} key={module.label} to={module.to}>
          <span><strong>{module.label}</strong><small>{module.detail}</small></span>
          <b>{module.status}</b>
        </Link>)}
      </div>
    </section>

    <section aria-labelledby="shop-coverage-title" className="shop-today-coverage">
      <header><span><strong id="shop-coverage-title">System coverage</strong><small>Capabilities working behind this view</small></span><b>6 areas</b></header>
      <div>{capabilityGroups.map(([label, detail]) => <article key={label}><strong>{label}</strong><small>{detail}</small></article>)}</div>
      <p>SuperMega keeps consequential changes behind named human review. External payment, customer messaging, delivery, filing, and accounting posting require separately verified connections.</p>
    </section>
      </div>
    </details>
  </div>
}
