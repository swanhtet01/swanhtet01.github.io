import { useState } from 'react'
import { Link } from 'react-router'

import { emitOutcomeTelemetry, type OutcomeTelemetryStage } from '../analytics/outcome-telemetry'
import { recordBehaviorSignal } from './behavior-trail'
import {
  acceptPilotOutcome,
  startPilotOutcome,
  type PilotOutcomeMetric,
  type PilotOutcomeReport,
  type PilotOutcomeReview,
  type PilotOutcomeSetup,
} from './pilot-outcome'

const productPaths = {
  commerce: '/shop/?tab=inventory',
  production: '/plant/?tab=production',
  website: '/website/',
  ecommerce: '/ecommerce/',
} as const

const productLabels = {
  commerce: 'Shop',
  production: 'Plant',
  website: 'Website',
  ecommerce: 'Ecommerce',
} as const

function changeCopy(report: PilotOutcomeReport) {
  if (report.outcomeStatus === 'target_met') return 'Clear'
  if (report.change === 0) return 'No change'
  return `${report.change > 0 ? '+' : ''}${report.change} ${unitCopy(report.current.unit, Math.abs(report.change))}`
}

function unitCopy(unit: string, value: number) {
  if (value !== 1) return unit
  if (unit === 'exceptions') return 'exception'
  if (unit === 'blockers') return 'blocker'
  if (unit === 'gaps') return 'gap'
  return unit
}

function metricCopy(metric: PilotOutcomeMetric) {
  return `${metric.value} ${unitCopy(metric.unit, metric.value)}`
}

function statusCopy(report: PilotOutcomeReport) {
  if (report.review) return 'Owner accepted'
  if (report.outcomeStatus === 'target_met') return 'Target met'
  if (report.outcomeStatus === 'improved') return 'Improved'
  if (report.outcomeStatus === 'regressed') return 'Needs recovery'
  if (report.outcomeStatus === 'unchanged') return 'Unchanged'
  return 'Collecting'
}

export function PilotOutcomePanel({
  setup,
  metric,
  report,
  onChanged,
  onAccepted,
}: {
  setup: PilotOutcomeSetup
  metric: PilotOutcomeMetric | null
  report: PilotOutcomeReport | null
  onChanged: () => void
  onAccepted?: (report: PilotOutcomeReport, review: PilotOutcomeReview) => void
}) {
  const [notice, setNotice] = useState('')
  const label = productLabels[setup.product]
  const downloadHref = report?.review
    ? `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(report, null, 2))}`
    : ''

  function recordChoice(detail: string) {
    recordBehaviorSignal(window.localStorage, {
      event: 'agent_job_chosen',
      product: setup.product,
      route: window.location.pathname + window.location.search + window.location.hash,
      detail,
    })
  }

  function start() {
    if (!metric) return
    try {
      const checkpoint = startPilotOutcome(window.localStorage, setup, metric)
      emitOutcomeTelemetry({
        pilotProduct: setup.product,
        stage: 'workflow_started',
        evidenceDigest: checkpoint.checkpointDigest,
      })
      recordChoice(`Start ${label} outcome proof`)
      setNotice('Starting checkpoint saved from validated aggregate data. Run one real workflow, then return here.')
      onChanged()
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The starting checkpoint could not be saved.')
    }
  }

  function accept() {
    if (!report) return
    try {
      const review = acceptPilotOutcome(window.localStorage, report, setup.owner)
      onAccepted?.(report, review)
      // This explicit owner action is the first point where all four claims are true at once:
      // the source revision completed, the improved/clear report was accepted, its accountable
      // decision closed, and the named owner reviewed the exact result. Never infer them on render.
      const acceptedStages: readonly OutcomeTelemetryStage[] = [
        'workflow_completed',
        'proof_accepted',
        ...(onAccepted ? ['action_closed' as const] : []),
        'result_reviewed',
      ]
      for (const stage of acceptedStages) {
        emitOutcomeTelemetry({ pilotProduct: setup.product, stage, evidenceDigest: review.reportDigest })
      }
      recordChoice(`Accept ${label} pilot outcome`)
      setNotice('Named-owner acceptance and its exact decision proof were saved. New product evidence will reopen the proof.')
      onChanged()
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The pilot outcome could not be accepted.')
    }
  }

  return (
    <section aria-label="Free pilot outcome proof" className="pilot-outcome-proof" id="pilot-outcome-proof">
      <div className="pilot-outcome-head">
        <div>
          <span className="core-eyebrow">Free outcome proof</span>
          <h2>Prove one result from real {label} data.</h2>
          <p>SuperMega compares aggregate product evidence before and after one workflow. It does not infer success from setup text.</p>
        </div>
        <span className={`status-pill ${report?.review ? 'approved' : report && ['target_met', 'improved'].includes(report.outcomeStatus) ? 'bounded' : ''}`}>{report ? statusCopy(report) : metric ? 'Ready to start' : 'Needs data'}</span>
      </div>
      {report ? <div className="pilot-outcome-rows">
        <span><small>Starting point</small><strong>{metricCopy(report.baseline)}</strong><em>{report.baseline.detail}</em></span>
        <span><small>Current result</small><strong>{metricCopy(report.current)}</strong><em>{report.current.detail}</em></span>
        <span><small>Measured change</small><strong>{changeCopy(report)}</strong><em>Lower is better for this bounded control metric.</em></span>
        <span><small>Owner proof</small><strong>{report.review ? `Accepted by ${report.review.reviewedBy}` : 'Not accepted yet'}</strong><em>{report.review ? 'Bound to this exact report digest.' : report.recommendation}</em></span>
      </div> : <div className="pilot-outcome-empty">
        <span><small>Current metric</small><strong>{metric ? metricCopy(metric) : `${label} source needed`}</strong><em>{metric?.detail ?? `Load a validated ${label} sample or import before starting.`}</em></span>
        <p>{metric ? 'Save this aggregate starting point, complete one consequential workflow, and return for automatic comparison.' : 'SuperMega will not create outcome proof from missing or invalid records.'}</p>
      </div>}
      <div className="pilot-outcome-actions">
        <Link className="core-button" to={productPaths[setup.product]}>Open {label}</Link>
        {!report ? <button className="core-button primary" disabled={!metric} onClick={start} type="button">Start proof run</button> : null}
        {report && !report.review && ['target_met', 'improved'].includes(report.outcomeStatus) ? <button className="core-button primary" onClick={accept} type="button">Accept measured result</button> : null}
        {report?.review ? <a className="core-button primary" download={`supermega-${setup.product}-pilot-outcome.json`} href={downloadHref}>Download accepted proof</a> : null}
        {report ? <button className="text-link" onClick={start} type="button">Restart baseline</button> : null}
      </div>
      <p className="pilot-outcome-boundary">Aggregate counts only. No raw records, customer send, payment, stock move, production command, domain publish, managed write, or model training runs here.</p>
      {notice ? <p className="form-notice" role="status">{notice}</p> : null}
    </section>
  )
}
