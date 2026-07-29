import { useMemo, useState } from 'react'
import { Link } from 'react-router'

import { readBehaviorTrail, recordBehaviorSignal, type BehaviorProductId, type BehaviorTrailEntry } from './behavior-trail'

type ProductHomeReadinessProps = {
  activationCoverage: number
  hostedReady: boolean
  nextHostedAction: string
  progress: number
  ready: boolean
}

export function ProductHomeReadiness({ activationCoverage, hostedReady, nextHostedAction, progress, ready }: ProductHomeReadinessProps) {
  const [behaviorTrail] = useState<BehaviorTrailEntry[]>(() => readBehaviorTrail(window.localStorage))
  const behaviorProducts = useMemo(() => new Set(behaviorTrail.map((entry) => entry.product).filter((product) => product !== 'unknown')).size, [behaviorTrail])
  const behaviorChoices = useMemo(() => behaviorTrail.filter((entry) => entry.event === 'agent_job_chosen').length, [behaviorTrail])
  const trackActionRows = [
    ['Shop', 'commerce', '/settings/?product=shop', '/shop/?tab=inventory', 'Prepare catalog', 'Open Shop'],
    ['Plant', 'production', '/settings/?product=plant', '/plant/?tab=production', 'Prepare jobs', 'Open Plant'],
    ['Website', 'website', '/settings/?product=website', '/website/', 'Prepare brand brief', 'Open Website'],
    ['Ecommerce', 'ecommerce', '/settings/?product=ecommerce', '/ecommerce/', 'Prepare orders', 'Open Ecommerce'],
  ] as const
  function recordLaunchPackChoice(
    product: Exclude<BehaviorProductId, 'unknown'>,
    label: string,
    action: 'prepare data' | 'open workspace',
  ) {
    recordBehaviorSignal(window.localStorage, {
      event: 'agent_job_chosen',
      product,
      route: window.location.pathname + window.location.search + window.location.hash,
      detail: `${label}: ${action}`,
    })
  }
  const agentCommandQueueRows = [
    [ready ? 'Export evidence' : 'Finish setup', ready ? 'Ready for support review' : `${progress}% ready`, ready ? 'Package setup, imports, behavior, decisions, and activation proof before premium starts.' : 'Finish baseline, owner, source, and acceptance evidence first.'],
    [behaviorChoices ? 'Repeat owner choice' : 'Choose an agent job', behaviorChoices ? `${behaviorChoices} chosen` : 'Needs signal', behaviorChoices ? 'Rank the next safe workflow from what the owner already selected.' : 'Open a product and choose one recommended job to teach the local queue.'],
    [hostedReady ? 'Activate managed lane' : 'Clear managed gate', hostedReady ? 'Controls ready' : `${activationCoverage}% gated`, hostedReady ? 'Use tenant roles, audit, and approval before any real write.' : nextHostedAction],
    ['Operate products', behaviorProducts ? `${behaviorProducts}/4 touched` : 'Pick one product', 'Shop, Plant, Website, and Ecommerce stay separate apps but share one evidence and approval system.'],
  ] as const

  return (
    <>
      <section className="product-home-readiness product-home-business-tracks" aria-label="Product starter paths">
        <div className="product-home-readiness-head">
          <div>
            <span className="core-eyebrow">Starter paths</span>
            <h2>Start one product in 2 clicks.</h2>
            <p>Choose a local template, then open the working app. AI prepares the setup and keeps business changes behind owner approval.</p>
          </div>
          <Link className="core-button" to="/settings/">Open setup hub</Link>
        </div>
        <div className="product-home-track-actions" aria-label="Product starter actions">
          {trackActionRows.map(([label, product, setupPath, workPath, setupAction, openAction]) => (
            <span key={label}>
              <strong>{label}</strong>
              <Link onClick={() => recordLaunchPackChoice(product, label, 'prepare data')} to={setupPath}>{setupAction}</Link>
              <Link onClick={() => recordLaunchPackChoice(product, label, 'open workspace')} to={workPath}>{openAction}</Link>
            </span>
          ))}
        </div>
      </section>
      <section className="product-home-readiness product-home-command-queue" aria-label="AI command queue">
        <div className="product-home-readiness-head">
          <div>
            <span className="core-eyebrow">AI command queue</span>
            <h2>One queue tells the owner what to do next.</h2>
            <p>SuperMega ranks setup, import, product work, managed activation, and learning handoff into safe next actions. It prepares the work; it does not send, publish, charge, move stock, write production, or train models from this queue.</p>
          </div>
          <Link className="core-button primary" to={ready ? '/settings/#controls' : '/settings/'}>{ready ? 'Export evidence' : 'Finish setup'}</Link>
        </div>
        <div className="product-home-readiness-grid">
          {agentCommandQueueRows.map(([label, value, detail]) => (
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
