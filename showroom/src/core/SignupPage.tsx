import { type FormEvent, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate, useOutletContext } from 'react-router'

import { PageHeading, type RuntimeHealth } from './CoreShell'
import { managedAccountPath, managedAccountRequestUrl } from './account-routes'
import { bi } from './i18n-actions'
import { shopBusinessTemplates } from '../products/shop/business-templates'
import { shopIndustryPacks, type ShopIndustryPackId } from './shop-service-scheduling'
import { managedTrialAuthConfigured } from './managed-trial'
import { TRIAL_TERMS } from './trial-terms'
import {
  provisionLocalShopBusinessTemplateSample,
  provisionLocalShopIndustryPack,
  provisionLocalShopWorkingSample,
} from './product-onboarding-runtime'
import { rememberProductSetup, seedSetupForProduct } from './product-setup'
import {
  ACCOUNT_REQUEST_DETAIL,
  createTrialSignupRecord,
  readTrialSignup,
  signupBusinessChoices,
  TRIAL_SIGNUP_PRODUCT_CHOICES,
  trialSignupClaimFile,
  trialSignupContactUrl,
  trialSignupDoors,
  trialSignupProductChoice,
  writeTrialSignup,
  type TrialSignupProduct,
  type TrialSignupRecord,
} from './signup-trial'
import { useSetupWorkspace } from './workspace-runtime'

const entryClassName = 'workspace-screen managed-login-screen signup-entry-screen'

/**
 * The front door. Everything decidable lives in signup-trial.ts, which a guard can reach; this
 * file is the shell that wires it to the browser. The owner chooses one explicit starting product;
 * Shop keeps its fast starter-catalog path, while Plant, Website, and Ecommerce continue into
 * their own focused one-step setup with the business identity already carried forward.
 */
export function SignupPage() {
  const runtime = useOutletContext<RuntimeHealth>()
  const location = useLocation()
  const navigate = useNavigate()
  const [, setSetup] = useSetupWorkspace()

  const requestedTrade = new URLSearchParams(location.search).get('template')
  const requestedProduct = new URLSearchParams(location.search).get('product')
  const [existing, setExisting] = useState<TrialSignupRecord | null>(() => readTrialSignup(window.localStorage))
  const [selectedProduct, setSelectedProduct] = useState<TrialSignupProduct>(() => trialSignupProductChoice(requestedProduct).id)
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
  const selectedProductChoice = trialSignupProductChoice(selectedProduct)

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
      // Validate every typed field before any sample provisioning can change local records.
      const identity = createTrialSignupRecord({
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        businessName,
        ownerName,
        product: selectedProduct,
        email,
        emailConsent,
        termsAccepted,
      })
      const trade = selectedProduct === 'commerce' && choiceId.startsWith('trade:')
        ? shopBusinessTemplates.find((template) => template.id === choiceId.slice(6)) ?? null
        : null
      const chosenPack = selectedProduct === 'commerce' && choiceId.startsWith('pack:')
        ? shopIndustryPacks.find((pack) => pack.id === choiceId.slice(5)) ?? null
        : null
      let industryPackId: ShopIndustryPackId | null = null
      let shopTemplateId: string | null = null
      let shopWorkflowTemplateId = ''
      let disposition: 'installed' | 'current' | 'preserved' | null = null
      if (selectedProduct === 'commerce') {
        // Read the pack ACTUALLY IN FORCE off the return value. Existing appointments preserve
        // their pack, and the catalog sample must follow that authoritative result.
        const schedule = provisionLocalShopIndustryPack(trade?.industryPackId ?? chosenPack?.id ?? 'retail')
        industryPackId = schedule.industryPackId
        const pack = shopIndustryPacks.find((candidate) => candidate.id === industryPackId) ?? null
        shopTemplateId = trade?.id ?? null
        shopWorkflowTemplateId = trade?.workflowTemplateId ?? pack?.workflowTemplateId ?? 'retail-wholesale'
        disposition = trade
          ? await provisionLocalShopBusinessTemplateSample(trade.id)
          : await provisionLocalShopWorkingSample(industryPackId, shopWorkflowTemplateId)
      }

      const record: TrialSignupRecord = {
        ...identity,
        shopBusinessTemplateId: shopTemplateId,
        shopIndustryPackId: industryPackId,
      }

      // Written BEFORE navigating, and confirmed by read-back. If storage refuses, the owner stays
      // on this page with the real reason rather than landing in a product with no trial recorded.
      const saved = writeTrialSignup(window.localStorage, record)

      const seeded = seedSetupForProduct(selectedProduct, shopWorkflowTemplateId)
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
      navigate(selectedProduct === 'commerce' ? selectedProductChoice.workspacePath : selectedProductChoice.setupPath)
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
        <h2>{managedDoor?.label}</h2>
        <p>{managedDoor?.detail}</p>
        <p>Trial reference: <strong>{record.claimCode}</strong>. Not a password or proof of account access.</p>
      </div>
      <div className="managed-login-actions">
        {managedDoor?.action === 'sign-in'
          ? <Link className="core-button primary" to={`/login?product=${trialSignupProductChoice(record.product).slug}`}>Sign in to your company</Link>
          : <a className="core-button primary" href={trialSignupContactUrl(record)}>Request activation</a>}
        <button className="core-button" onClick={() => downloadClaim(record)} type="button">{bi('Save my claim file')}</button>
      </div>
    </section>
  )

  if (existing) {
    const existingProduct = trialSignupProductChoice(existing.product)
    return (
      <div className={entryClassName}>
        <PageHeading eyebrow="Your trial" title="Your local trial" copy="Continue on this device." />
        <section className="managed-login-panel" aria-label="Current trial">
          <div>
            <h2>{existing.businessName}</h2>
            {carriedOver
              ? <p>Existing Shop data: <strong>nothing was overwritten</strong>. Back up before using reset.</p>
              : <p>Your {existingProduct.label} trial is ready to continue.</p>}
          </div>
          <div className="managed-login-actions">
            <Link className="core-button primary" to={existingProduct.workspacePath}>Open my {existingProduct.label}</Link>
            <Link className="core-button" to="/settings/#controls">{carriedOver ? 'Reset this device' : 'Company controls'}</Link>
          </div>
        </section>
        {managedPanel(existing)}
      </div>
    )
  }

  return (
    <div className={entryClassName}>
      <PageHeading eyebrow="Get started" title={`Start with ${selectedProductChoice.label}.`} copy="Accounts or local samples." />
      <section className="managed-login-panel" aria-label="Company account">
        <div>
          <h2>Company account</h2>
          <p>{ACCOUNT_REQUEST_DETAIL}</p>
        </div>
        <div className="managed-login-actions">
          <a className="core-button" href={managedAccountRequestUrl(selectedProductChoice.slug)}>Request company account</a>
          {managedReady ? <Link className="core-button" to={managedAccountPath('/login', selectedProductChoice.slug)}>Existing account? Sign in</Link> : null}
        </div>
      </section>
      <form aria-busy={busy} className="managed-login-panel core-form" onSubmit={(event) => void startTrial(event)}>
        <div>
          <h2>Or try a local sample</h2>
          <p>{selectedProductChoice.outcome} No company account, team sync, or cloud backup.</p>
        </div>
        {/* Design phase 2 item 11: startTrial's failures are storage/provisioning errors, not a
            bad value in any one field, so there is no single input to mark aria-invalid. The
            honest fix is a programmatic link from the form's first field to the notice, so a
            screen reader user tabbing back after a failed submit hears that something changed,
            rather than a paragraph with no relationship to any control. */}
        <label>Business name<input aria-describedby={noticeTone === 'error' ? 'signup-notice' : undefined} autoComplete="organization" maxLength={120} onChange={(event) => setBusinessName(event.target.value)} required value={businessName} /></label>
        <label>Start with<select onChange={(event) => setSelectedProduct(event.target.value as TrialSignupProduct)} value={selectedProduct}>
          {TRIAL_SIGNUP_PRODUCT_CHOICES.map((choice) => <option key={choice.id} value={choice.id}>{choice.label}</option>)}
        </select></label>
        {selectedProduct === 'commerce' ? <label>What kind of business?<select onChange={(event) => setChoiceId(event.target.value)} value={choiceId}>
          <option value="">Standard starter catalog</option>
          <optgroup label="Shops and trades">
            {tradeChoices.map((choice) => <option key={choice.id} value={choice.id}>{choice.label}</option>)}
          </optgroup>
          <optgroup label="Service businesses">
            {servicePackChoices.map((choice) => <option key={choice.id} value={choice.id}>{choice.label}</option>)}
          </optgroup>
        </select></label> : null}
        <details className="signup-consent-terms" onInvalidCapture={(event) => { event.currentTarget.open = true }}>
          <summary>Optional name and email</summary>
          <label>Your name (optional)<input autoComplete="name" maxLength={120} onChange={(event) => setOwnerName(event.target.value)} value={ownerName} /></label>
          <label>Email (optional)<input autoComplete="email" maxLength={160} onChange={(event) => setEmail(event.target.value)} type="email" value={email} /></label>
          <label className="signup-consent">
            <input checked={emailConsent} onChange={(event) => setEmailConsent(event.target.checked)} type="checkbox" />
            <span>Keep my email locally. It is not sent to SuperMega.</span>
          </label>
        </details>
        <label className="signup-consent">
          <input checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)} type="checkbox" />
          <span>I accept the SuperMega trial terms. My choice stays on this device.</span>
        </label>
        <details className="signup-consent-terms">
          <summary>Read the trial terms ({TRIAL_TERMS.length} plain-language points)</summary>
          <ol>
            {TRIAL_TERMS.map((term) => <li key={term.title}><strong>{term.title}.</strong> {term.body}</li>)}
          </ol>
        </details>
        <button className="core-button primary" disabled={busy} type="submit">{busy ? 'Preparing your workspace...' : `Try ${selectedProductChoice.label} on this device`}</button>
        <p className="form-notice" data-tone={noticeTone} id="signup-notice" role="status">{notice}</p>
      </form>
    </div>
  )
}
