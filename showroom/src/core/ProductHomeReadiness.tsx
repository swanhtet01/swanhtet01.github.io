import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'

import { readBehaviorTrail, recordBehaviorSignal, summarizeBehaviorPreferences, type BehaviorProductId, type BehaviorTrailEntry } from './behavior-trail'
import {
  BUSINESS_COMMAND_PROMPTS,
  buildBusinessCommandAnswer,
  classifyBusinessQuestion,
  readLocalBusinessSnapshot,
  type BusinessCommandAnswer,
  type BusinessCommandIntent,
} from './business-command'

type ProductHomeReadinessProps = {
  activationCoverage: number
  hostedReady: boolean
  nextHostedAction: string
  progress: number
  ready: boolean
}

const productContinuations = {
  commerce: { label: 'Shop', path: '/shop/' },
  production: { label: 'Plant', path: '/plant/' },
  website: { label: 'Website', path: '/website/' },
  ecommerce: { label: 'Ecommerce', path: '/ecommerce/' },
} satisfies Record<Exclude<BehaviorProductId, 'unknown'>, { label: string; path: string }>

export function ProductHomeReadiness({ activationCoverage, hostedReady, nextHostedAction, progress, ready }: ProductHomeReadinessProps) {
  const commandInputRef = useRef<HTMLInputElement>(null)
  const [behaviorTrail] = useState<BehaviorTrailEntry[]>(() => readBehaviorTrail(window.localStorage))
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState<BusinessCommandAnswer>(() => buildBusinessCommandAnswer(readLocalBusinessSnapshot(window.localStorage), 'attention'))
  const behaviorProducts = useMemo(() => new Set(behaviorTrail.map((entry) => entry.product).filter((product) => product !== 'unknown')).size, [behaviorTrail])
  const behaviorPreference = useMemo(() => summarizeBehaviorPreferences(behaviorTrail), [behaviorTrail])
  const preferredContinuation = behaviorPreference.preferred ? productContinuations[behaviorPreference.preferred.product] : null
  const commandPath = ready && preferredContinuation ? preferredContinuation.path : ready ? '/settings/#controls' : '/settings/'
  const commandLabel = ready && preferredContinuation ? `Continue ${preferredContinuation.label}` : ready ? 'Export evidence' : 'Finish setup'
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
    [behaviorPreference.preferred ? 'Owner pattern' : 'Choose an agent job', behaviorPreference.preferred && preferredContinuation ? `${preferredContinuation.label} / ${behaviorPreference.preferred.chosenCount} chosen` : 'Needs signal', behaviorPreference.preferred ? behaviorPreference.preferred.detail : 'Open a product and choose one recommended job to teach the local queue.'],
    [hostedReady ? 'Activate managed lane' : 'Clear managed gate', hostedReady ? 'Controls ready' : `${activationCoverage}% gated`, hostedReady ? 'Use tenant roles, audit, and approval before any real write.' : nextHostedAction],
    ['Operate products', behaviorProducts ? `${behaviorProducts}/4 touched` : 'Pick one product', 'Shop, Plant, Website, and Ecommerce stay separate apps but share one evidence and approval system.'],
  ] as const

  useEffect(() => {
    if (window.location.hash !== '#command-center') return
    window.requestAnimationFrame(() => {
      document.getElementById('command-center')?.scrollIntoView({ block: 'start' })
      commandInputRef.current?.focus()
    })
  }, [])

  function runBusinessCommand(intent: BusinessCommandIntent) {
    setAnswer(buildBusinessCommandAnswer(readLocalBusinessSnapshot(window.localStorage), intent))
    recordBehaviorSignal(window.localStorage, {
      event: 'agent_job_chosen',
      product: intent === 'shop_inventory'
        ? 'commerce'
        : intent === 'plant_control'
          ? 'production'
          : intent === 'website_readiness'
            ? 'website'
            : intent === 'ecommerce_readiness'
              ? 'ecommerce'
              : 'unknown',
      route: window.location.pathname + window.location.search + window.location.hash,
      detail: `Ask SuperMega: ${intent}`,
    })
  }

  function submitBusinessQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    runBusinessCommand(classifyBusinessQuestion(question))
  }

  function chooseBusinessPrompt(intent: BusinessCommandIntent, prompt: string) {
    setQuestion(prompt)
    runBusinessCommand(intent)
  }

  function recordAnswerFollow() {
    recordBehaviorSignal(window.localStorage, {
      event: 'agent_job_chosen',
      product: answer.nextAction.product === 'shop'
        ? 'commerce'
        : answer.nextAction.product === 'plant'
          ? 'production'
          : answer.nextAction.product === 'settings'
            ? 'unknown'
            : answer.nextAction.product,
      route: window.location.pathname + window.location.search + window.location.hash,
      detail: `Follow SuperMega answer: ${answer.intent}`,
    })
  }

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
      <section className="product-home-readiness product-home-command-queue" id="command-center" aria-label="Ask SuperMega business command center">
        <div className="product-home-readiness-head">
          <div>
            <span className="core-eyebrow">Ask SuperMega</span>
            <h2>Ask what needs attention.</h2>
            <p>Free mode answers from validated local Shop, Plant, Website, and Ecommerce records. Premium can add approved managed history and cross-workflow context.</p>
          </div>
        </div>
        <form className="business-command-form" onSubmit={submitBusinessQuestion}>
          <label htmlFor="business-command-question">Business question</label>
          <div>
            <input
              aria-label="Ask a business question"
              id="business-command-question"
              maxLength={240}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="What needs attention today?"
              ref={commandInputRef}
              type="text"
              value={question}
            />
            <button className="core-button primary" type="submit">Ask</button>
          </div>
          <small>Raw questions stay in this field and are not written to behavior memory.</small>
        </form>
        <div className="business-command-prompts" aria-label="Suggested business questions">
          {BUSINESS_COMMAND_PROMPTS.map((prompt) => (
            <button key={prompt.intent} onClick={() => chooseBusinessPrompt(prompt.intent, prompt.question)} type="button">{prompt.label}</button>
          ))}
        </div>
        <div className="business-command-answer" aria-live="polite">
          <div className="business-command-answer-head">
            <div>
              <span>{answer.sourceCount}/4 validated product sources</span>
              <h3>{answer.title}</h3>
              <p>{answer.summary}</p>
            </div>
            <Link className="core-button primary" onClick={recordAnswerFollow} to={answer.nextAction.path}>{answer.nextAction.label}</Link>
          </div>
          <div className="business-command-facts">
            {answer.facts.map((fact) => (
              <span key={fact.label}>
                <small>{fact.label}</small>
                <strong>{fact.value}</strong>
                <em>{fact.detail}</em>
              </span>
            ))}
          </div>
          <p className="business-command-boundary">{answer.boundary}</p>
        </div>
        <details className="business-command-evidence">
          <summary><span>Why this answer</span><small>Setup, owner behavior, managed gates, and product coverage</small></summary>
          <div className="product-home-readiness-grid">
            {agentCommandQueueRows.map(([label, value, detail]) => (
              <span key={label}>
                <small>{label}</small>
                <strong>{value}</strong>
                <em>{detail}</em>
              </span>
            ))}
          </div>
          <Link className="text-link" to={commandPath}>{commandLabel}</Link>
        </details>
      </section>
    </>
  )
}
