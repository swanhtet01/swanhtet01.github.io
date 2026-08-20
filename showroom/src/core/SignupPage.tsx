import { type FormEvent, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate, useOutletContext } from 'react-router'

import { PageHeading, type RuntimeHealth } from './CoreShell'
import { bi } from './i18n-actions'
import { shopBusinessTemplates } from '../products/shop/business-templates'
import { shopIndustryPacks } from './shop-service-scheduling'
import { managedTrialAuthConfigured } from './managed-trial'
import { TRIAL_TERMS } from './trial-terms'
import {
  provisionLocalShopBusinessTemplateSample,
  provisionLocalShopIndustryPack,
  provisionLocalShopWorkingSample,
} from './product-onboarding-runtime'
import { rememberProductSetup, seedSetupForProduct } from './product-setup'
import {
  createTrialSignupRecord,
  readTrialSignup,
  signupBusinessChoices,
  trialSignupClaimFile,
  trialSignupContactUrl,
  trialSignupDoors,
  writeTrialSignup,
  type TrialSignupRecord,
} from './signup-trial'
import { useSetupWorkspace } from './workspace-runtime'

/**
 * The front door. Everything decidable lives in signup-trial.ts, which a guard can reach; this
 * file is the shell that wires it to the browser. Shop is the only product a trial starts in
 * because it is the one with a trade picker and a working till -- the other three are reachable
 * from the product picker once the owner is inside.
 */
export function SignupPage() {
  const runtime = useOutletContext<RuntimeHealth>()
  const location = useLocation()
  const navigate = useNavigate()
  const [, setSetup] = useSetupWorkspace()

  const requestedTrade = new URLSearchParams(location.search).get('template')
  const [existing, setExisting] = useState<TrialSignupRecord | null>(() => readTrialSignup(window.localStorage))
  const [businessName, setBusinessName] = useState('')
  const [ownerName, setOwnerName] = useState('')

  // A spa, gym or school has no TRADE template -- those three are industry packs only. Offering
  // trades alone made every service business unreachable from signup: the owner of a spa had to
  // pick "Standard starter catalog" and silently received a retail shop. Both kinds are listed,
  // tagged so the submit handler knows which provisioning path to take.
  const choices = useMemo(() => signupBusinessChoices(shopBusinessTemplates, shopIndustryPacks), [])
  const tradeChoices = choices.filter((choice) => choice.kind === 'trade')
  const servicePackChoices = choices.filter((choice) => choice.kind === 'pack')
  const [choiceId, setChoiceId] = useState(() => (
    shopBusinessTemplates.some((template) => template.id === requestedTrade) ? `trade:${requestedTrade}`
      : shopIndustryPacks.some((pack) => pack.id === requestedTrade) ? `pack:${requestedTrade}`
        : ''
  ))
  const [email, setEmail] = useState('')
  const [emailConsent, setEmailConsent] = useState(false)
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [noticeTone, setNoticeTone] = useState<'quiet' | 'error'>('quiet')
  const [carriedOver, setCarriedOver] = useState(false)

  const managedReady = runtime.status === 'enterprise' && managedTrialAuthConfigured()
  const doors = useMemo(() => trialSignupDoors({ managedReady }), [managedReady])
  const managedDoor = doors.find((door) => door.id === 'managed')

  async function startTrial(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setNoticeTone('quiet')
    setNotice('Preparing your workspace...')
    try {
      const trade = choiceId.startsWith('trade:')
        ? shopBusinessTemplates.find((template) => template.id === choiceId.slice(6)) ?? null
        : null
      const chosenPack = choiceId.startsWith('pack:')
        ? shopIndustryPacks.find((pack) => pack.id === choiceId.slice(5)) ?? null
        : null

      // Read the pack ACTUALLY IN FORCE off the return value. provisionLocalShopIndustryPack keeps
      // an existing schedule when an appointment already exists, so the pack it returns is not
      // always the pack that was asked for -- and every downstream field has to follow the real one.
      const schedule = provisionLocalShopIndustryPack(trade?.industryPackId ?? chosenPack?.id ?? 'retail')
      const industryPackId = schedule.industryPackId
      const pack = shopIndustryPacks.find((candidate) => candidate.id === industryPackId) ?? null

      // Both provisioners RETURN what they did. 'preserved' means the catalog was NOT installed
      // because this device already carries real Shop data -- an order, a close, something worth
      // keeping. Discarding this value is how a signup lands someone in a Shop full of a previous
      // business's stock while claiming it set up theirs.
      const disposition = trade
        ? await provisionLocalShopBusinessTemplateSample(trade.id)
        : await provisionLocalShopWorkingSample(industryPackId, pack?.workflowTemplateId ?? 'retail-wholesale')

      const record = createTrialSignupRecord({
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        businessName,
        ownerName,
        product: 'commerce',
        shopBusinessTemplateId: trade?.id ?? null,
        shopIndustryPackId: industryPackId,
        email,
        emailConsent,
        termsAccepted,
      })

      // Written BEFORE navigating, and confirmed by read-back. If storage refuses, the owner stays
      // on this page with the real reason rather than landing in a product with no trial recorded.
      const saved = writeTrialSignup(window.localStorage, record)

      const seeded = seedSetupForProduct('commerce', trade?.workflowTemplateId ?? pack?.workflowTemplateId ?? 'retail-wholesale')
      const next = {
        ...seeded,
        workspace: saved.businessName,
        owner: saved.ownerName,
        startedAt: saved.createdAt,
        savedAt: undefined,
      }
      setSetup(next)
      rememberProductSetup(window.localStorage, next)

      setExisting(saved)
      // Nothing was overwritten, so do not pretend otherwise by dropping the owner into a Shop
      // stocked by someone else. Say what happened and let them choose.
      if (disposition === 'preserved') {
        setCarriedOver(true)
        return
      }
      navigate('/shop/')
    } catch (error) {
      setNoticeTone('error')
      setNotice(error instanceof Error ? error.message : 'The trial could not be started.')
    } finally {
      setBusy(false)
    }
  }

  function downloadClaim(record: TrialSignupRecord) {
    const url = URL.createObjectURL(new Blob([trialSignupClaimFile(record)], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `supermega-trial-${record.claimCode}.json`
    document.body.append(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  const managedPanel = (record: TrialSignupRecord) => (
    <section className="managed-login-panel" aria-label="Company account">
      <div>
        <span className="core-eyebrow">When you outgrow this device</span>
        <h2>{managedDoor?.label}</h2>
        <p>{managedDoor?.detail}</p>
        <p>Your claim code is <strong>{record.claimCode}</strong>. Keep it -- it links this trial to your company account.</p>
      </div>
      <div className="managed-login-actions">
        {managedDoor?.action === 'sign-in'
          ? <Link className="core-button primary" to="/login?product=shop">Sign in to your company</Link>
          : <a className="core-button primary" href={trialSignupContactUrl(record)}>Request activation</a>}
        <button className="core-button" onClick={() => downloadClaim(record)} type="button">{bi('Save my claim file')}</button>
      </div>
    </section>
  )

  if (existing) {
    return (
      <div className="workspace-screen managed-login-screen">
        <PageHeading eyebrow="Your trial" title="Your trial is running." copy="It lives on this device. Pick up where you left off." />
        <section className="managed-login-panel" aria-label="Current trial">
          <div>
            <span className="core-eyebrow">Started</span>
            <h2>{existing.businessName}</h2>
            {carriedOver
              ? <p>This device already had Shop data, so <strong>nothing was overwritten</strong>. Your existing catalog and records were kept exactly as they were. To load the starter catalog for your trade instead, reset this device first.</p>
              : <p>Your Shop workspace is ready with a full starter catalog.</p>}
          </div>
          <div className="managed-login-actions">
            <Link className="core-button primary" to="/shop/">{bi('Open my Shop')}</Link>
            <Link className="core-button" to="/settings/#controls">{carriedOver ? 'Reset this device' : 'Company controls'}</Link>
          </div>
        </section>
        {managedPanel(existing)}
      </div>
    )
  }

  return (
    <div className="workspace-screen managed-login-screen">
      <PageHeading eyebrow="Free trial" title="Start selling today." copy="One form. Your workspace opens with a real starter catalog for your trade." />
      <form aria-busy={busy} className="managed-login-panel core-form" onSubmit={(event) => void startTrial(event)}>
        <div>
          <span className="core-eyebrow">No card, no waiting</span>
          <h2>Tell us about your business.</h2>
          <p>Everything stays on this device until you ask us for a company account.</p>
        </div>
        {/* Design phase 2 item 11: startTrial's failures are storage/provisioning errors, not a
            bad value in any one field, so there is no single input to mark aria-invalid. The
            honest fix is a programmatic link from the form's first field to the notice, so a
            screen reader user tabbing back after a failed submit hears that something changed,
            rather than a paragraph with no relationship to any control. */}
        <label>Business name<input aria-describedby={noticeTone === 'error' ? 'signup-notice' : undefined} autoComplete="organization" maxLength={120} onChange={(event) => setBusinessName(event.target.value)} required value={businessName} /></label>
        <label>What kind of business?<select onChange={(event) => setChoiceId(event.target.value)} value={choiceId}>
          <option value="">Standard starter catalog</option>
          <optgroup label="Shops and trades">
            {tradeChoices.map((choice) => <option key={choice.id} value={choice.id}>{choice.label}</option>)}
          </optgroup>
          <optgroup label="Service businesses">
            {servicePackChoices.map((choice) => <option key={choice.id} value={choice.id}>{choice.label}</option>)}
          </optgroup>
        </select></label>
        <label>Your name (optional)<input autoComplete="name" maxLength={120} onChange={(event) => setOwnerName(event.target.value)} value={ownerName} /></label>
        <label>Email (optional)<input autoComplete="email" maxLength={160} onChange={(event) => setEmail(event.target.value)} type="email" value={email} /></label>
        <label className="signup-consent">
          <input checked={emailConsent} onChange={(event) => setEmailConsent(event.target.checked)} type="checkbox" />
          <span>Keep my email on this device so SuperMega can contact me about a company account.</span>
        </label>
        <label className="signup-consent">
          <input checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)} type="checkbox" />
          <span>I accept the SuperMega trial terms below, recorded on this device with my trial record.</span>
        </label>
        <details className="signup-consent-terms">
          <summary>Read the trial terms ({TRIAL_TERMS.length} plain-language points)</summary>
          <ol>
            {TRIAL_TERMS.map((term) => <li key={term.title}><strong>{term.title}.</strong> {term.body}</li>)}
          </ol>
        </details>
        <button className="core-button primary" disabled={busy} type="submit">{busy ? 'Preparing your workspace...' : 'Start my free trial'}</button>
        <p className="form-notice" data-tone={noticeTone} id="signup-notice" role="status">{notice}</p>
      </form>
      <section className="managed-login-panel" aria-label="Company account">
        <div>
          <span className="core-eyebrow">Already set up?</span>
          <h2>{managedDoor?.label}</h2>
          <p>{managedDoor?.detail}</p>
        </div>
        <div className="managed-login-actions">
          <Link className="core-button" to="/login?product=shop">{bi('Company sign in')}</Link>
        </div>
      </section>
    </div>
  )
}
