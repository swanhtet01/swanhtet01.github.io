import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'

import { readBehaviorTrail, recordBehaviorSignal, type BehaviorTrailEntry } from './behavior-trail'

type ProductHomeReadinessProps = {
  activationCoverage: number
  hostedReady: boolean
  nextHostedAction: string
  progress: number
  ready: boolean
}

export function ProductHomeReadiness({ activationCoverage, hostedReady, nextHostedAction, progress, ready }: ProductHomeReadinessProps) {
  const [behaviorTrail, setBehaviorTrail] = useState<BehaviorTrailEntry[]>([])
  useEffect(() => {
    setBehaviorTrail(readBehaviorTrail(window.localStorage))
  }, [])
  const behaviorProducts = useMemo(() => new Set(behaviorTrail.map((entry) => entry.product).filter((product) => product !== 'unknown')).size, [behaviorTrail])
  const behaviorChoices = useMemo(() => behaviorTrail.filter((entry) => entry.event === 'agent_job_chosen').length, [behaviorTrail])
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
  const operatingTrackRows = [
    ['Shop', 'AI inventory operator', 'Imports products, flags reorder risk, drafts purchase/order reviews, and keeps payments tied to accountable receipts.'],
    ['Plant', 'AI MES coordinator', 'Turns demand, shifts, quality issues, maintenance, WCM checks, and ISO evidence into prioritized work packets.'],
    ['Website', 'AI site builder', 'Converts business facts, proof, offers, and owner approval into a publish-ready website package without changing DNS.'],
    ['Ecommerce', 'AI order desk', 'Builds a catalog, reviews incoming orders, matches Shop stock, and prepares delivery/payment handoff for approval.'],
  ] as const
  const businessTrackRows = [
    ['Retail or distributor', 'Shop + Ecommerce', 'Start with product CSV, stock counts, online order CSV, and payment review proof.'],
    ['Factory or workshop', 'Plant + Shop', 'Start with job CSV, material list, quality holds, maintenance evidence, and stock issue proof.'],
    ['Service or local brand', 'Website + Ecommerce', 'Start with business facts, offer proof, photos, catalog rows, and channel order samples.'],
    ['Multi-branch operator', 'All products', 'Start with one branch pack, role list, import samples, approval receipts, and shared evidence export.'],
  ] as const
  const trackRunbookRows = [
    ['Free proof', 'Local enterprise max', 'Upload or paste sample data, run the AI queue, export evidence, and prove value without managed writes.'],
    ['Premium unlock', 'Managed AI context', 'Activate tenant roles, audit, branch data, approved learning, hosted scheduler, and write gates after review.'],
    ['First sale motion', 'Prepared template demo', 'Create a client-specific starter workspace before outreach so the buyer sees their own products, jobs, site, or orders.'],
    ['Operator promise', 'Minimal controls', 'The owner chooses a track and approves packets; AI handles cleanup, ranking, drafts, checks, and handoff preparation.'],
  ] as const
  const trackActionRows = [
    ['Retail launch pack', '/settings/?product=shop', '/ecommerce/'],
    ['Factory launch pack', '/settings/?product=plant', '/plant/?tab=production'],
    ['Brand launch pack', '/settings/?product=website', '/website/'],
    ['Branch launch pack', '/settings/#controls', '/shop/?tab=inventory'],
  ] as const
  function recordLaunchPackChoice(label: string, action: 'prepare data' | 'open workspace') {
    recordBehaviorSignal(window.localStorage, {
      event: 'agent_job_chosen',
      product: 'unknown',
      route: window.location.pathname + window.location.search + window.location.hash,
      detail: `${label}: ${action}`,
    })
  }
  const learningCockpitRows = [
    ['Behavior memory', behaviorTrail.length ? `${behaviorTrail.length} local signals` : 'No signals yet', behaviorTrail.length ? 'Owner navigation and agent queue choices are ready for evidence export.' : 'Open products and choose agent jobs to create local memory.'],
    ['Queue choices', behaviorChoices ? `${behaviorChoices} chosen` : 'No choices yet', behaviorChoices ? 'Premium can rank repeated owner preferences after managed import.' : 'The system waits for explicit owner choices before ranking work.'],
    ['Product coverage', behaviorProducts ? `${behaviorProducts}/4 products` : 'Start anywhere', behaviorProducts ? 'Behavior memory is split by Shop, Plant, Website, and Ecommerce.' : 'Use any product track to begin the learning trail.'],
    ['Learning boundary', 'No model training', 'Free keeps behavior local. Premium uses exported, approved context only after managed activation.'],
  ] as const
  const agentCommandQueueRows = [
    [ready ? 'Export evidence' : 'Finish setup', ready ? 'Ready for support review' : `${progress}% ready`, ready ? 'Package setup, imports, behavior, decisions, and activation proof before premium starts.' : 'Finish baseline, owner, source, and acceptance evidence first.'],
    [behaviorChoices ? 'Repeat owner choice' : 'Choose an agent job', behaviorChoices ? `${behaviorChoices} chosen` : 'Needs signal', behaviorChoices ? 'Rank the next safe workflow from what the owner already selected.' : 'Open a product and choose one recommended job to teach the local queue.'],
    [hostedReady ? 'Activate managed lane' : 'Clear managed gate', hostedReady ? 'Controls ready' : `${activationCoverage}% gated`, hostedReady ? 'Use tenant roles, audit, and approval before any real write.' : nextHostedAction],
    ['Operate products', behaviorProducts ? `${behaviorProducts}/4 touched` : 'Pick one product', 'Shop, Plant, Website, and Ecommerce stay separate apps but share one evidence and approval system.'],
  ] as const

  return (
    <>
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
      <section className="product-home-readiness product-home-business-tracks" aria-label="Business starter tracks">
        <div className="product-home-readiness-head">
          <div>
            <span className="core-eyebrow">Business starter tracks</span>
            <h2>Pick the business type. SuperMega picks the modules.</h2>
            <p>Clients should not learn every enterprise feature on day one. Each track starts with the smallest useful workflow, then premium unlocks managed data, approvals, branch scale, and AI context after evidence review.</p>
          </div>
          <Link className="core-button" to="/settings/">Choose track</Link>
        </div>
        <div className="product-home-readiness-grid">
          {businessTrackRows.map(([label, value, detail]) => (
            <span key={label}>
              <small>{label}</small>
              <strong>{value}</strong>
              <em>{detail}</em>
            </span>
          ))}
        </div>
        <div className="product-home-readiness-grid product-home-track-runbook">
          {trackRunbookRows.map(([label, value, detail]) => (
            <span key={label}>
              <small>{label}</small>
              <strong>{value}</strong>
              <em>{detail}</em>
            </span>
          ))}
        </div>
        <div className="product-home-track-actions" aria-label="Track launch pack actions">
          {trackActionRows.map(([label, setupPath, workPath]) => (
            <span key={label}>
              <strong>{label}</strong>
              <Link onClick={() => recordLaunchPackChoice(label, 'prepare data')} to={setupPath}>Prepare data</Link>
              <Link onClick={() => recordLaunchPackChoice(label, 'open workspace')} to={workPath}>Open workspace</Link>
            </span>
          ))}
        </div>
      </section>
      <section className="product-home-readiness product-home-operating-tracks" aria-label="AI operating tracks">
        <div className="product-home-readiness-head">
          <div>
            <span className="core-eyebrow">AI operating tracks</span>
            <h2>Separate products, one simple operating model.</h2>
            <p>Each app gives the owner a narrow command surface while AI prepares the repetitive work behind it. Free mode proves the workflow locally; premium adds managed data, roles, audit, and approved learning.</p>
          </div>
          <Link className="core-button" to="/settings/">Set up products</Link>
        </div>
        <div className="product-home-readiness-grid">
          {operatingTrackRows.map(([label, value, detail]) => (
            <span key={label}>
              <small>{label}</small>
              <strong>{value}</strong>
              <em>{detail}</em>
            </span>
          ))}
        </div>
      </section>
      <section className="product-home-readiness" aria-label="AI learning cockpit">
        <div className="product-home-readiness-head">
          <div>
            <span className="core-eyebrow">AI learning cockpit</span>
            <h2>Learn from use, not guesswork.</h2>
            <p>SuperMega records lightweight local behavior so premium can later rank next actions from approved evidence. No customer message, payment, stock move, production write, publish action, or model training runs here.</p>
          </div>
          <Link className="core-button" to="/settings/#controls">Export context</Link>
        </div>
        <div className="product-home-readiness-grid">
          {learningCockpitRows.map(([label, value, detail]) => (
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
