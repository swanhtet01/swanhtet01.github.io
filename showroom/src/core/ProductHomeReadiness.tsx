import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import {
  acknowledgeManagedOwnerControlItem,
  currentManagedIdentity,
  loadManagedOwnerControlRun,
  loadManagedCompanyBrief,
  retainManagedCompanyBrief,
  type ManagedCompanyBrief,
  type ManagedIdentity,
  type ManagedOwnerControlRun,
} from './managed-trial'
import { operatingChangeCopy } from './operating-baseline'
import {
  acknowledgeLocalOwnerControlItem,
  buildLocalOwnerControlRun,
  readLocalOwnerControlAcknowledgements,
  type LocalOwnerControlRun,
  type OwnerControlItem,
} from './owner-control'

type ProductHomeReadinessProps = {
  activationCoverage: number
  hostedReady: boolean
  managedReadiness: ManagedTrialReadiness | null
  nextHostedAction: string
  progress: number
  ready: boolean
}

type ManagedTrialReadiness = {
  ready: boolean
  checks: Array<{
    id: string
    label: string
    ready: boolean
    action: string
  }>
  forbiddenUntilReady: string[]
  nextAction: string
  safeEnable: string[]
}

const productContinuations = {
  commerce: { label: 'Shop', path: '/shop/' },
  production: { label: 'Plant', path: '/plant/' },
  website: { label: 'Website', path: '/website/' },
  ecommerce: { label: 'Ecommerce', path: '/ecommerce/' },
} satisfies Record<Exclude<BehaviorProductId, 'unknown'>, { label: string; path: string }>

export function ProductHomeReadiness({ activationCoverage, hostedReady, managedReadiness, nextHostedAction, progress, ready }: ProductHomeReadinessProps) {
  const commandInputRef = useRef<HTMLInputElement>(null)
  const managedRequestRef = useRef(0)
  const ownerControlRequestRef = useRef(0)
  const [behaviorTrail] = useState<BehaviorTrailEntry[]>(() => readBehaviorTrail(window.localStorage))
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState<BusinessCommandAnswer | ManagedCompanyBrief>(() => buildBusinessCommandAnswer(readLocalBusinessSnapshot(window.localStorage), 'attention'))
  const [localOwnerControl, setLocalOwnerControl] = useState<LocalOwnerControlRun>(() => buildLocalOwnerControlRun(
    readLocalBusinessSnapshot(window.localStorage),
    readLocalOwnerControlAcknowledgements(window.localStorage),
  ))
  const [managedOwnerControl, setManagedOwnerControl] = useState<{ run: ManagedOwnerControlRun; identity: ManagedIdentity } | null>(null)
  const [ownerControlNotice, setOwnerControlNotice] = useState('')
  const [ownerControlPending, setOwnerControlPending] = useState(false)
  const [managedContext, setManagedContext] = useState<{ brief: ManagedCompanyBrief; identity: ManagedIdentity } | null>(null)
  const [managedNotice, setManagedNotice] = useState('')
  const [managedPending, setManagedPending] = useState(false)
  const behaviorProducts = useMemo(() => new Set(behaviorTrail.map((entry) => entry.product).filter((product) => product !== 'unknown')).size, [behaviorTrail])
  const behaviorPreference = useMemo(() => summarizeBehaviorPreferences(behaviorTrail), [behaviorTrail])
  const preferredContinuation = behaviorPreference.preferred ? productContinuations[behaviorPreference.preferred.product] : null
  const managedBriefRetained = managedContext?.brief.retention === 'persisted_managed_audit'
  const managedLearning = managedContext ? operatingChangeCopy(managedContext.brief.operatingChange) : null
  const ownerControl = managedOwnerControl?.run ?? localOwnerControl
  const ownerControlPrimary = ownerControl.items.find((item) => item.status === 'pending') ?? null
  const ownerControlMode = managedOwnerControl ? 'managed' : 'local'
  const commandPath = ready && preferredContinuation ? preferredContinuation.path : ready ? '/settings/#controls' : '#product-start-actions'
  const commandLabel = ready && preferredContinuation ? `Continue ${preferredContinuation.label}` : ready ? 'Export evidence' : 'Choose product'
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
  const supportEvidenceRows = [
    [ready ? 'Export setup' : 'Finish setup', ready ? 'Ready for support review' : `${progress}% ready`, ready ? 'Package setup, imports, decisions, and go-live proof before support starts.' : 'Finish baseline, owner, source, and acceptance evidence first.'],
    [behaviorPreference.preferred ? 'Recent product' : 'Choose next step', behaviorPreference.preferred && preferredContinuation ? `${preferredContinuation.label} / ${behaviorPreference.preferred.chosenCount} chosen` : 'Needs signal', behaviorPreference.preferred ? behaviorPreference.preferred.detail : 'Open a product and choose a next step so this page can continue from there.'],
    [hostedReady ? 'Prepare live account' : 'Finish live gate', hostedReady ? 'Controls ready' : `${activationCoverage}% gated`, hostedReady ? 'Use account roles, audit, and approval before any real write.' : nextHostedAction],
    ['Product coverage', behaviorProducts ? `${behaviorProducts}/4 touched` : 'Pick one product', 'Shop, Plant, Website, and Ecommerce stay separate apps but share one evidence and approval system.'],
  ] as const
  const managedBlockerCount = managedReadiness?.checks.filter((check) => !check.ready).length ?? 0
  const managedRestrictedCount = managedReadiness?.forbiddenUntilReady.length ?? 0
  const browserSampleEnabled = managedReadiness?.safeEnable.includes('browser_local_trial') ?? false
  const managedSafeMode = managedReadiness?.ready ? 'Company workspace' : browserSampleEnabled ? 'Browser-local sample' : 'Read-only preview'

  const refreshLocalOwnerControl = useCallback(() => {
    setLocalOwnerControl(buildLocalOwnerControlRun(
      readLocalBusinessSnapshot(window.localStorage),
      readLocalOwnerControlAcknowledgements(window.localStorage),
    ))
    setOwnerControlNotice('')
  }, [])

  const refreshManagedOwnerControl = useCallback(async (successNotice = '') => {
    const requestId = ownerControlRequestRef.current + 1
    ownerControlRequestRef.current = requestId
    const identity = await currentManagedIdentity()
    if (requestId !== ownerControlRequestRef.current) return
    if (!identity) {
      setManagedOwnerControl(null)
      setOwnerControlNotice('')
      setOwnerControlPending(false)
      return
    }
    setOwnerControlPending(true)
    try {
      const run = await loadManagedOwnerControlRun(identity)
      if (requestId !== ownerControlRequestRef.current) return
      setManagedOwnerControl({ run, identity })
      setOwnerControlNotice(successNotice || 'Company review refreshed from exact product records.')
    } catch {
      if (requestId !== ownerControlRequestRef.current) return
      setManagedOwnerControl(null)
      setOwnerControlNotice('Managed owner control is unavailable. The validated local run remains active.')
    } finally {
      if (requestId === ownerControlRequestRef.current) setOwnerControlPending(false)
    }
  }, [])

  useEffect(() => {
    if (window.location.hash !== '#command-center') return
    window.requestAnimationFrame(() => {
      document.getElementById('command-center')?.scrollIntoView({ block: 'start' })
      commandInputRef.current?.focus()
    })
  }, [])

  useEffect(() => {
    const initialRefreshFrame = window.requestAnimationFrame(() => void refreshManagedOwnerControl())
    const refreshOnFocus = () => {
      refreshLocalOwnerControl()
      void refreshManagedOwnerControl('Owner control refreshed from current managed evidence.')
    }
    const refreshOnStorage = () => refreshLocalOwnerControl()
    window.addEventListener('focus', refreshOnFocus)
    window.addEventListener('storage', refreshOnStorage)
    return () => {
      window.cancelAnimationFrame(initialRefreshFrame)
      window.removeEventListener('focus', refreshOnFocus)
      window.removeEventListener('storage', refreshOnStorage)
      ownerControlRequestRef.current += 1
    }
  }, [refreshLocalOwnerControl, refreshManagedOwnerControl])

  async function refreshManagedBrief(intent: BusinessCommandIntent) {
    const requestId = managedRequestRef.current + 1
    managedRequestRef.current = requestId
    const identity = await currentManagedIdentity()
    if (!identity || requestId !== managedRequestRef.current) return
    setManagedPending(true)
    setManagedNotice('Reading approved managed context...')
    try {
      const brief = await loadManagedCompanyBrief(intent, identity)
      if (requestId !== managedRequestRef.current) return
      setAnswer(brief)
      setManagedContext({ brief, identity })
      setManagedNotice(`Company summary / ${brief.sourceCount} validated product sources.`)
    } catch {
      if (requestId !== managedRequestRef.current) return
      setManagedContext(null)
      setManagedNotice('Managed context is unavailable. The validated local answer remains on screen.')
    } finally {
      if (requestId === managedRequestRef.current) setManagedPending(false)
    }
  }

  function runBusinessCommand(intent: BusinessCommandIntent) {
    setAnswer(buildBusinessCommandAnswer(readLocalBusinessSnapshot(window.localStorage), intent))
    setManagedContext(null)
    setManagedNotice('')
    void refreshManagedBrief(intent)
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

  function recordOwnerControlFollow(item: OwnerControlItem | ManagedOwnerControlRun['items'][number]) {
    recordBehaviorSignal(window.localStorage, {
      event: 'agent_job_chosen',
      product: item.product === 'shop'
        ? 'commerce'
        : item.product === 'plant'
          ? 'production'
          : item.product,
      route: window.location.pathname + window.location.search + window.location.hash,
      detail: `Follow Owner Control: ${item.intent}`,
    })
  }

  async function acknowledgeOwnerControl() {
    if (!ownerControlPrimary || ownerControlPending) return
    if (managedOwnerControl) {
      const requestId = ownerControlRequestRef.current + 1
      ownerControlRequestRef.current = requestId
      setOwnerControlPending(true)
      setOwnerControlNotice('Acknowledging this exact managed evidence...')
      try {
        const response = await acknowledgeManagedOwnerControlItem({
          run: managedOwnerControl.run,
          itemId: ownerControlPrimary.itemId,
          commandId: crypto.randomUUID(),
          identity: managedOwnerControl.identity,
        })
        if (requestId !== ownerControlRequestRef.current) return
        setManagedOwnerControl({ ...managedOwnerControl, run: response.run })
        setOwnerControlNotice(response.retention.idempotentReplay
          ? 'This exact evidence was already acknowledged.'
          : 'Owner acknowledgement retained. Changed source evidence will open a new run.')
      } catch {
        if (requestId !== ownerControlRequestRef.current) return
        setOwnerControlNotice('Nothing was acknowledged. Refreshing current managed evidence...')
        await refreshManagedOwnerControl('Managed evidence changed. SuperMega opened the current control run.')
      } finally {
        if (requestId === ownerControlRequestRef.current) setOwnerControlPending(false)
      }
      return
    }
    const currentAcknowledgements = readLocalOwnerControlAcknowledgements(window.localStorage)
    const currentRun = buildLocalOwnerControlRun(readLocalBusinessSnapshot(window.localStorage), currentAcknowledgements)
    if (currentRun.runKey !== localOwnerControl.runKey
      || currentRun.sourceFingerprint !== localOwnerControl.sourceFingerprint
      || !currentRun.items.some((item) => item.itemId === ownerControlPrimary.itemId && item.status === 'pending')) {
      setLocalOwnerControl(currentRun)
      setOwnerControlNotice('Business records changed. SuperMega opened a fresh control run before acknowledgement.')
      return
    }
    try {
      const acknowledgements = acknowledgeLocalOwnerControlItem(window.localStorage, currentRun, ownerControlPrimary as OwnerControlItem)
      setLocalOwnerControl(buildLocalOwnerControlRun(readLocalBusinessSnapshot(window.localStorage), acknowledgements))
      setOwnerControlNotice('Local acknowledgement kept for this exact source revision. Changed records will reopen the run.')
    } catch {
      setOwnerControlNotice('Nothing was acknowledged. Browser storage is unavailable or the source revision changed.')
    }
  }

  async function retainBrief() {
    if (!managedContext || managedPending) return
    const requestId = managedRequestRef.current
    setManagedPending(true)
    setManagedNotice('Keeping this aggregate learning checkpoint...')
    try {
      const retained = await retainManagedCompanyBrief({
        brief: managedContext.brief,
        commandId: crypto.randomUUID(),
        identity: managedContext.identity,
      })
      if (requestId !== managedRequestRef.current) return
      setAnswer(retained.brief)
      setManagedContext({ ...managedContext, brief: retained.brief })
      setManagedNotice(retained.retention.idempotentReplay ? 'This learning checkpoint was already retained.' : 'Learning checkpoint retained in the managed audit history.')
    } catch {
      if (requestId !== managedRequestRef.current) return
      setManagedNotice('The brief was not retained. Managed write readiness or company permission is required.')
    } finally {
      if (requestId === managedRequestRef.current) setManagedPending(false)
    }
  }

  return (
    <>
      <section className="product-home-readiness product-home-command-queue" id="command-center" aria-label="SuperMega support helper">
        <div className="product-home-readiness-head">
          <div>
            <span className="core-eyebrow">Support helper</span>
            <h2>Find the next customer-ready step.</h2>
            <p>Uses Shop, Plant, Website, and Ecommerce records. Company history is used only after approval.</p>
          </div>
        </div>
        <div className="owner-control-run" aria-label="Readiness review status" data-mode={ownerControlMode}>
          <div className="owner-control-run-head">
            <div>
              <span>{ownerControlMode === 'managed' ? 'Company review' : 'Local review'} · {ownerControl.sourceCount}/4 product sources</span>
              <h3>{ownerControl.title}</h3>
              <p>{ownerControl.summary}</p>
            </div>
            <strong>{ownerControl.pendingCount} open · {ownerControl.acknowledgedCount} acknowledged</strong>
          </div>
          {ownerControlPrimary ? <div className="owner-control-primary" data-priority={ownerControlPrimary.priority}>
            <div>
              <span>{ownerControlPrimary.priority} priority · {ownerControlPrimary.product}</span>
              <strong>{ownerControlPrimary.title}</strong>
              <small>{ownerControlPrimary.summary}</small>
            </div>
            <div className="form-actions">
              {ownerControl.sourceCount > 0 ? <button className="core-button" disabled={ownerControlPending} onClick={() => void acknowledgeOwnerControl()} type="button">Mark reviewed</button> : null}
              <Link className="core-button primary" onClick={() => recordOwnerControlFollow(ownerControlPrimary)} to={ownerControlPrimary.nextAction.path}>{ownerControlPrimary.nextAction.label}</Link>
            </div>
          </div> : <p className="owner-control-clear">No repeated check is required for unchanged evidence. A new validated source revision opens the next run automatically.</p>}
          {ownerControl.items.length > 1 ? <details className="owner-control-queue">
            <summary>Review queue <span>{ownerControl.items.length}</span></summary>
            <div>{ownerControl.items.map((item) => <span key={item.itemId}><strong>{item.product}</strong><small>{item.status} · {item.title}</small></span>)}</div>
          </details> : null}
          <p className="business-command-boundary">{ownerControl.sourceCount > 0 ? 'Acknowledgement confirms review only. It does not claim resolution or run any product or external action.' : 'Missing evidence cannot be acknowledged. Open a working sample or import records first.'}</p>
          {ownerControlNotice ? <p className="form-notice" role="status">{ownerControlNotice}</p> : null}
        </div>
        <form className="business-command-form" onSubmit={submitBusinessQuestion}>
          <label htmlFor="business-command-question">Ask about today</label>
          <div>
            <input
              aria-label="Ask about today"
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
          <small>Your question stays on this screen unless you choose a saved managed review.</small>
        </form>
        <div className="business-command-prompts" aria-label="Suggested business questions">
          {BUSINESS_COMMAND_PROMPTS.map((prompt) => (
            <button key={prompt.intent} onClick={() => chooseBusinessPrompt(prompt.intent, prompt.question)} type="button">{prompt.label}</button>
          ))}
        </div>
        <div className="business-command-answer" aria-live="polite">
          <div className="business-command-answer-head">
            <div>
              <span>{answer.sourceCount}/4 validated {managedContext ? 'managed' : 'local'} product sources</span>
              <h3>{answer.title}</h3>
              <p>{answer.summary}</p>
              {managedLearning ? <div className="business-command-learning"><span>Saved learning</span><strong>{managedLearning.label}</strong><small>{managedLearning.detail}</small></div> : null}
            </div>
            <div className="form-actions">
              {managedContext ? <button className="core-button" disabled={managedPending || managedBriefRetained} onClick={() => void retainBrief()} type="button">{managedBriefRetained ? 'Checkpoint retained' : 'Keep learning checkpoint'}</button> : null}
              <Link className="core-button primary" onClick={recordAnswerFollow} to={answer.nextAction.path}>{answer.nextAction.label}</Link>
            </div>
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
          {managedNotice ? <p className="form-notice" role="status">{managedNotice}</p> : null}
        </div>
        <details className="business-command-evidence">
          <summary><span>Why this step</span><small>Setup, recent choices, go-live gates, and product coverage</small></summary>
          <div className="product-home-readiness-grid">
            {supportEvidenceRows.map(([label, value, detail]) => (
              <span key={label}>
                <small>{label}</small>
                <strong>{value}</strong>
                <em>{detail}</em>
              </span>
            ))}
          </div>
          <Link className="text-link" to={commandPath}>{commandLabel}</Link>
        </details>
        {managedReadiness ? <details aria-label="Managed trial readiness" className="business-command-evidence">
          <summary><span>Company workspace status</span><small>{managedReadiness.ready ? 'Ready for activation review' : `${managedBlockerCount} checks left`}</small></summary>
          <div className="product-home-readiness-grid">
            <span>
              <small>Safe today</small>
              <strong>{managedSafeMode}</strong>
              <em>{managedReadiness.ready ? 'Company controls still need approval.' : 'Use the sample in this browser.'}</em>
            </span>
            <span>
              <small>Company access</small>
              <strong>{managedReadiness.ready ? 'Ready to review' : `${managedBlockerCount} checks left`}</strong>
              <em>{managedReadiness.ready ? 'Roles and audit controls can be reviewed.' : 'Accounts and company data stay locked.'}</em>
            </span>
            <span>
              <small>Protected actions</small>
              <strong>{managedRestrictedCount} held</strong>
              <em>Writes, payments, and messages stay off.</em>
            </span>
            <span>
              <small>Your evidence</small>
              <strong>{ownerControl.sourceCount}/4 products</strong>
              <em>Start with the product that matters most.</em>
            </span>
          </div>
          <details className="owner-control-queue">
            <summary>Review launch gates <span>{managedReadiness.checks.length}</span></summary>
            <div>{managedReadiness.checks.map((check) => <span key={check.id}><strong>{check.label}</strong><small>{check.ready ? 'Ready' : check.action}</small></span>)}</div>
          </details>
          <p className="business-command-boundary">Next managed step: {managedReadiness.nextAction} No managed customer action runs from this checklist.</p>
        </details> : null}
      </section>
      <section className="product-home-readiness product-home-business-tracks" aria-label="Product setup paths" id="product-start-actions">
        <div className="product-home-readiness-head">
          <div>
            <span className="core-eyebrow">Choose a product</span>
            <h2>Start one product.</h2>
            <p>Pick a template or open the working sample. Setup stays in review before business records change.</p>
          </div>
        </div>
        <div className="product-home-track-actions" aria-label="Product start actions">
          {trackActionRows.map(([label, product, setupPath, workPath, setupAction, openAction]) => (
            <span key={label}>
              <strong>{label}</strong>
              <Link onClick={() => recordLaunchPackChoice(product, label, 'prepare data')} to={setupPath}>{setupAction}</Link>
              <Link onClick={() => recordLaunchPackChoice(product, label, 'open workspace')} to={workPath}>{openAction}</Link>
            </span>
          ))}
        </div>
      </section>
    </>
  )
}
