import { Link } from 'react-router'

type ProductHomeReadinessProps = {
  activationCoverage: number
  hostedReady: boolean
  nextHostedAction: string
  progress: number
  ready: boolean
}

export function ProductHomeReadiness({ activationCoverage, hostedReady, nextHostedAction, progress, ready }: ProductHomeReadinessProps) {
  const launchReadinessRows = [
    ['Local setup', ready ? 'Ready' : `${progress}%`, ready ? 'Evidence can be exported for review.' : 'Finish baseline, owner, source, and acceptance proof.'],
    ['Import package', ready ? 'Use Activation handoff' : 'Prepare after setup', ready ? 'Upload CSV, clean rows, then export or validate one package.' : 'Import is safest after the workspace has one named owner.'],
    ['AI learning', ready ? 'Evidence gated' : 'Locked', ready ? 'Premium can learn only from approved data and behavior memory.' : 'No persistent learning until evidence and managed activation are approved.'],
    ['Hosted activation', hostedReady ? 'Ready' : `${activationCoverage}%`, hostedReady ? 'Managed writes can run under tenant controls.' : nextHostedAction],
  ] as const
  const enterpriseAutopilotRows = [
    ['Run', 'Draft work automatically', 'Orders, imports, jobs, pages, and follow-ups become reviewed tasks instead of blank forms.'],
    ['Learn', 'Use approved context', 'CSV data, workspace behavior, decisions, roles, and evidence are packaged before premium learning.'],
    ['Guard', 'Approval before impact', 'Customer contact, payment, stock, publish, and production changes stay behind the owner gate.'],
    ['Scale', 'One control model', 'Shop, Plant, Website, and Ecommerce share the same setup, evidence, audit, and handoff pattern.'],
  ] as const

  return (
    <>
      <section className="product-home-agent-contract" aria-label="Enterprise autopilot contract">
        <div className="product-home-readiness-head">
          <div>
            <span className="core-eyebrow">Enterprise autopilot</span>
            <h2>Minimal control, accountable execution.</h2>
            <p>The AI handles repetitive setup and operating work, but every consequential action is tied to evidence, role, approval, and audit before it can affect the business.</p>
          </div>
          <Link className="core-button" to="/settings/#controls">Review controls</Link>
        </div>
        <div className="product-home-readiness-grid">
          {enterpriseAutopilotRows.map(([label, value, detail]) => (
            <span key={label}>
              <small>{label}</small>
              <strong>{value}</strong>
              <em>{detail}</em>
            </span>
          ))}
        </div>
      </section>
      <section className="product-home-readiness" aria-label="Launch readiness">
        <div className="product-home-readiness-head">
          <div>
            <span className="core-eyebrow">Launch readiness</span>
            <h2>Free proves value. Premium activates controls.</h2>
            <p>Every product starts local and exportable. Managed data, roles, audit, AI context, and writes stay locked until activation proof passes.</p>
          </div>
          <Link className="core-button" to="/settings/#controls">Open activation</Link>
        </div>
        <div className="product-home-readiness-grid">
          {launchReadinessRows.map(([label, value, detail]) => (
            <span key={label}>
              <small>{label}</small>
              <strong>{value}</strong>
              <em>{detail}</em>
            </span>
          ))}
        </div>
      </section>
    </>
  )
}
