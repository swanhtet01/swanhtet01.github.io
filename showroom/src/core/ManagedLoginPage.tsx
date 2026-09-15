import { type FormEvent, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useOutletContext } from 'react-router'

import { PageHeading, type RuntimeHealth } from './CoreShell'
import { bi } from './i18n-actions'
import {
  alternateManagedWorkspaceId,
  managedAccountPath,
  managedAccountRequestUrl,
  managedPortalEntryPath,
} from './account-routes'
import {
  completeManagedWorkspaceSignIn,
  createManagedAccount,
  createSelfServeWorkspace,
  currentManagedIdentity,
  discoverManagedWorkspacesForCurrentSession,
  loadManagedBootstrap,
  managedTrialAuthConfigured,
  resendManagedAccountConfirmation,
  signInAndDiscoverManagedWorkspaces,
  signOutManagedTrial,
  type ManagedIdentity,
  type ManagedWorkspaceSignIn,
} from './managed-trial'
import { readTrialSignup, trialSignupProductChoice } from './signup-trial'

export function ManagedLoginPage() {
  const runtime = useOutletContext<RuntimeHealth>()
  const location = useLocation()
  const navigate = useNavigate()
  const productIntent = new URLSearchParams(location.search).get('product')
  const portalEntryPath = managedPortalEntryPath(productIntent)
  const signupPath = productIntent ? `/signup?product=${trialSignupProductChoice(productIntent).slug}` : '/signup'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [workspaceId, setWorkspaceId] = useState('')
  const [directory, setDirectory] = useState<ManagedWorkspaceSignIn | null>(null)
  const [existingIdentity, setExistingIdentity] = useState<ManagedIdentity | null>(null)
  const [activating, setActivating] = useState(false)
  const [claimCode, setClaimCode] = useState(() => readTrialSignup(window.localStorage)?.claimCode ?? '')
  const [businessName, setBusinessName] = useState(() => readTrialSignup(window.localStorage)?.businessName ?? '')
  const [notice, setNotice] = useState('')
  const [noticeTone, setNoticeTone] = useState<'quiet' | 'error'>('quiet')
  // Design phase 2 item 11: the notice was a single paragraph disconnected from any
  // field, so a screen reader user got no signal about WHICH input the error concerns.
  // Only claim_code_conflict is attributable to a specific field (the code itself) --
  // activation_window_closed and generic failures are system state, not a bad value in
  // the box, so they stay as the shared notice only rather than falsely flagging it.
  const [claimCodeFieldError, setClaimCodeFieldError] = useState(false)
  const [busy, setBusy] = useState(false)
  const managedReady = runtime.status === 'enterprise' && managedTrialAuthConfigured()
  const signupPolicy = runtime.status !== 'checking' && managedTrialAuthConfigured() ? runtime.signupPolicy : null
  const [creatingAccount, setCreatingAccount] = useState(false)
  const [confirmation, setConfirmation] = useState('')
  const [acceptedTermsVersion, setAcceptedTermsVersion] = useState('')
  const [sentRequest, setSentRequest] = useState<{ email: string; termsVersion: string } | null>(null)
  const [cooldownUntil, setCooldownUntil] = useState(0)
  const [cooldownSeconds, setCooldownSeconds] = useState(0)
  const accountRequestPending = useRef(false)

  useEffect(() => {
    if (!cooldownUntil) return
    const update = () => {
      const remaining = Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000))
      setCooldownSeconds(remaining)
      if (!remaining) window.clearInterval(timer)
    }
    const timer = window.setInterval(update, 1000)
    update()
    return () => window.clearInterval(timer)
  }, [cooldownUntil])

  function chooseAccountMode(create: boolean) {
    if (busy || accountRequestPending.current) return
    setCreatingAccount(create)
    setPassword('')
    setConfirmation('')
    setAcceptedTermsVersion('')
    setSentRequest(null)
    setNotice('')
    setNoticeTone('quiet')
  }

  async function requestAccount(event?: FormEvent) {
    event?.preventDefault()
    if (!signupPolicy || busy || accountRequestPending.current || Date.now() < cooldownUntil) return
    const termsVersion = sentRequest?.termsVersion ?? acceptedTermsVersion
    if (termsVersion !== signupPolicy.termsVersion) {
      setNoticeTone('error')
      setNotice('Read and accept the current terms before requesting an account.')
      return
    }
    accountRequestPending.current = true
    setBusy(true)
    setNoticeTone('quiet')
    setNotice('Requesting a confirmation email...')
    try {
      if (sentRequest) await resendManagedAccountConfirmation(sentRequest.email, termsVersion)
      else {
        await createManagedAccount({ email, password, confirmation, termsAccepted: true }, termsVersion)
        setSentRequest({ email: email.trim().toLowerCase(), termsVersion })
      }
      setNotice('If this address can receive a confirmation, check your inbox and spam folder. Already registered? Sign in or reset your password.')
    } catch (error) {
      setNoticeTone('error')
      setNotice(error instanceof Error ? error.message : 'The account request could not be confirmed. Wait before trying again.')
    } finally {
      setPassword('')
      setConfirmation('')
      // UX backpressure only. This is not durable abuse protection or proof of email delivery.
      setCooldownUntil(Date.now() + 60_000)
      setCooldownSeconds(60)
      setBusy(false)
      accountRequestPending.current = false
    }
  }

  useEffect(() => {
    if (!managedReady) return
    let active = true
    currentManagedIdentity()
      .then(async (identity) => {
        if (!active) return
        setExistingIdentity(identity)
        if (identity) return
        // A session without any company (e.g. fresh account from an invite or
        // recovery link) lands here signed in: open the activation panel so the
        // claim code becomes a company instead of a dead end.
        try {
          const signIn = await discoverManagedWorkspacesForCurrentSession()
          if (!active || signIn.workspaces.length > 0) return
          setActivating(true)
          setNotice(`No company is assigned to ${signIn.email} yet. Activate yours with the claim code from your free trial.`)
        } catch {
          // No usable session: stay on the sign-in form.
        }
      })
      .catch(() => setExistingIdentity(null))
    return () => { active = false }
  }, [managedReady])

  async function openWorkspace(signIn: ManagedWorkspaceSignIn, selectedWorkspaceId: string) {
    const identity = await completeManagedWorkspaceSignIn(signIn, selectedWorkspaceId)
    await loadManagedBootstrap(identity)
    setExistingIdentity(identity)
    navigate(portalEntryPath)
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!managedReady || busy || accountRequestPending.current) return
    accountRequestPending.current = true
    setBusy(true)
    setNoticeTone('quiet')
    try {
      if (directory) {
        setNotice('Opening your company...')
        await openWorkspace(directory, workspaceId)
        return
      }
      setNotice('Finding companies assigned to this account...')
      const signIn = await signInAndDiscoverManagedWorkspaces(email, password)
      setPassword('')
      if (signIn.workspaces.length === 1) {
        await openWorkspace(signIn, signIn.workspaces[0].workspaceId)
        return
      }
      if (signIn.workspaces.length === 0) {
        // A verified account with no company yet is the self-serve moment, not
        // a dead end: offer activation with the claim code from the trial.
        setActivating(true)
        setNotice(`No company is assigned to ${signIn.email} yet. Activate yours with the claim code from your free trial.`)
        return
      }
      setDirectory(signIn)
      setWorkspaceId(signIn.workspaces[0].workspaceId)
      setNotice(`Choose one of ${signIn.workspaces.length} companies assigned to ${signIn.email}.`)
    } catch (error) {
      setNoticeTone('error')
      setNotice(error instanceof Error ? error.message : 'Managed sign-in failed.')
    } finally {
      setPassword('')
      accountRequestPending.current = false
      setBusy(false)
    }
  }

  async function activate(event: FormEvent) {
    event.preventDefault()
    if (!managedReady || busy || accountRequestPending.current) return
    accountRequestPending.current = true
    setBusy(true)
    setNoticeTone('quiet')
    setClaimCodeFieldError(false)
    setNotice('Creating your company from the claim...')
    try {
      const localTrial = readTrialSignup(window.localStorage)
      const selectedProduct = localTrial?.product ?? trialSignupProductChoice(productIntent).id
      const workspace = await createSelfServeWorkspace(claimCode, businessName, selectedProduct)
      setNotice(workspace.created
        ? `${workspace.label} is ready. Opening your company...`
        : `${workspace.label} was already activated with this claim. Opening it...`)
      const refreshed = await discoverManagedWorkspacesForCurrentSession()
      await openWorkspace(refreshed, workspace.workspaceId)
    } catch (error) {
      setNoticeTone('error')
      const code = error instanceof Error && 'code' in error ? String((error as { code?: unknown }).code ?? '') : ''
      if (code === 'activation_window_closed' || code === 'http_503') {
        setNotice('Self-serve activation is not open yet. Your claim code stays valid — send an activation request and a person finishes setup with you.')
      } else if (code === 'claim_code_conflict') {
        setClaimCodeFieldError(true)
        setNotice('This claim code is already linked to a different account. If that was you on another email, sign in with it; otherwise request help.')
      } else {
        setNotice(error instanceof Error ? error.message : 'The company could not be activated.')
      }
    } finally {
      accountRequestPending.current = false
      setBusy(false)
    }
  }

  async function chooseAnotherCompany() {
    if (!existingIdentity || busy || accountRequestPending.current) return
    accountRequestPending.current = true
    setBusy(true)
    setNoticeTone('quiet')
    setNotice('Finding your other companies...')
    try {
      const signIn = await discoverManagedWorkspacesForCurrentSession()
      const alternateWorkspaceId = alternateManagedWorkspaceId(signIn.workspaces, existingIdentity.workspaceId)
      if (!alternateWorkspaceId) {
        setNotice('This account has only one active company. You can open it or sign out.')
        return
      }
      setDirectory(signIn)
      setWorkspaceId(alternateWorkspaceId)
      setExistingIdentity(null)
      setNotice(`Choose another company assigned to ${signIn.email}.`)
    } catch (error) {
      setNoticeTone('error')
      setExistingIdentity(null)
      setNotice(error instanceof Error ? error.message : 'Your company list could not be loaded.')
    } finally {
      accountRequestPending.current = false
      setBusy(false)
    }
  }

  async function signOut() {
    if (busy || accountRequestPending.current) return
    accountRequestPending.current = true
    setBusy(true)
    setNoticeTone('quiet')
    try {
      await signOutManagedTrial()
      setExistingIdentity(null)
      setDirectory(null)
      setWorkspaceId('')
      setEmail('')
      setPassword('')
      setActivating(false)
      setNotice('Signed out on this device.')
    } catch (error) {
      setNoticeTone('error')
      setNotice(error instanceof Error ? error.message : 'Sign out could not be completed.')
    } finally {
      accountRequestPending.current = false
      setBusy(false)
    }
  }

  return (
    <div className={`workspace-screen managed-login-screen${creatingAccount ? ' signup-entry-screen' : ''}`}>
      <PageHeading eyebrow="Company account" title={creatingAccount ? 'Create your account.' : 'Open your company.'} copy={creatingAccount ? 'Confirm your email first. Company access is a separate step.' : 'Sign in once. SuperMega finds the companies assigned to you.'} />
      {existingIdentity ? <section className="managed-login-panel" aria-label="Current managed account">
        <div><span className="core-eyebrow">Connected</span><h2>{existingIdentity.email}</h2><p>Your company account is ready.</p></div>
        <div className="managed-login-actions">
          <Link className="core-button primary" to={portalEntryPath}>{bi('Open company')}</Link>
          <button className="core-button" disabled={busy} onClick={() => void chooseAnotherCompany()} type="button">{busy ? 'Checking...' : 'Switch company'}</button>
          <button className="account-inline-link account-link-button" disabled={busy} onClick={() => void signOut()} type="button">Sign out</button>
        </div>
        {notice ? <p className="form-notice" data-tone={noticeTone} role="status">{notice}</p> : null}
      </section> : creatingAccount ? <form aria-label="Create company account" aria-busy={busy} className="managed-login-panel core-form" onSubmit={(event) => void requestAccount(event)}>
        {!signupPolicy ? <p role="status">New account creation is not open. Sign in or request assisted setup.</p> : <>
          <h2>{sentRequest ? 'Check your email.' : 'Your work account'}</h2>
          {sentRequest ? null : <>
            <label>Email<input autoComplete="username" disabled={busy} maxLength={160} onChange={(event) => setEmail(event.target.value)} required type="email" value={email} /></label>
            <label>Password<input aria-describedby="signup-password-help" autoComplete="new-password" disabled={busy} minLength={12} maxLength={128} onChange={(event) => setPassword(event.target.value)} required type="password" value={password} /></label>
            <p id="signup-password-help">Use 12–128 characters. Do not reuse a payment-app PIN.</p>
            <label>Confirm password<input autoComplete="new-password" disabled={busy} minLength={12} maxLength={128} onChange={(event) => setConfirmation(event.target.value)} required type="password" value={confirmation} /></label>
            <label className="signup-consent"><input checked={acceptedTermsVersion === signupPolicy.termsVersion} disabled={busy} onChange={(event) => setAcceptedTermsVersion(event.target.checked ? signupPolicy.termsVersion : '')} required type="checkbox" /><span>I agree to the <a href={signupPolicy.termsUrl} target="_blank" rel="noopener noreferrer">account terms ({signupPolicy.termsVersion})</a>.</span></label>
          </>}
          <button className="core-button primary" disabled={busy || cooldownSeconds > 0 || (!sentRequest && acceptedTermsVersion !== signupPolicy.termsVersion)} type="submit">{busy ? 'Requesting...' : cooldownSeconds > 0 ? `Wait ${cooldownSeconds}s before another request` : sentRequest ? 'Resend confirmation' : 'Create account'}</button>
          <p>Creating an account does not activate a company, confirm payment or copy your local demo records.</p>
        </>}
        {notice ? <p className="form-notice" data-tone={noticeTone} id="managed-registration-notice" role="status">{notice}</p> : null}
        <button className="account-inline-link account-link-button" disabled={busy} onClick={() => chooseAccountMode(false)} type="button">Back to sign in</button>
        {sentRequest ? <button className="account-inline-link account-link-button" disabled={busy} onClick={() => chooseAccountMode(true)} type="button">Use another email</button> : null}
        <Link className="account-inline-link" to={managedAccountPath('/account/recovery', productIntent)}>Reset an existing password</Link>
      </form> : managedReady && activating ? <form aria-busy={busy} className="managed-login-panel core-form" onSubmit={(event) => void activate(event)}>
        <div><span className="core-eyebrow">Activate your company</span><h2>Claim your company.</h2><p>Use the claim code from your free trial. The company is created for this signed-in account and only this account owns it.</p></div>
        <label>Claim code<input aria-describedby={claimCodeFieldError ? 'managed-login-notice' : undefined} aria-invalid={claimCodeFieldError} autoComplete="off" maxLength={12} onChange={(event) => setClaimCode(event.target.value)} placeholder="SM-XXXX-XXXX" required value={claimCode} /></label>
        <label>Business name<input maxLength={120} onChange={(event) => setBusinessName(event.target.value)} placeholder="Your business name" required value={businessName} /></label>
        <button className="core-button primary" disabled={busy} type="submit">{busy ? 'Activating...' : 'Activate my company'}</button>
        <a className="account-inline-link" href={managedAccountRequestUrl(productIntent)}>Ask a person to finish setup instead</a>
        <button className="account-inline-link account-link-button" disabled={busy} onClick={() => { if (accountRequestPending.current) return; setActivating(false); setNotice(''); setNoticeTone('quiet'); setClaimCodeFieldError(false) }} type="button">{bi('Back to sign in')}</button>
        <p className="form-notice" data-tone={noticeTone} id="managed-login-notice" role="status">{notice}</p>
      </form> : managedReady ? <form aria-busy={busy} className="managed-login-panel core-form" onSubmit={(event) => void submit(event)}>
        <div><span className="core-eyebrow">Company account</span><h2>{directory ? 'Choose your company.' : 'Use your work account.'}</h2><p>{directory ? 'Only active companies assigned to this account are shown.' : 'No workspace code or technical setup is required.'}</p></div>
        {directory ? <label>Company<select onChange={(event) => setWorkspaceId(event.target.value)} required value={workspaceId}>{directory.workspaces.map((workspace) => <option key={workspace.workspaceId} value={workspace.workspaceId}>{workspace.label} - {workspace.access}</option>)}</select></label> : <>
          {/* Design phase 2 item 11: a failed sign-in only ever means "this email/password
              combination was rejected" -- there is no way to attribute it to just one of the
              two fields without leaking which one was wrong, so both point at the shared
              notice rather than leaving it disconnected from either input. */}
          <label>Email<input aria-describedby={noticeTone === 'error' ? 'managed-login-notice' : undefined} aria-invalid={noticeTone === 'error'} autoComplete="username" maxLength={160} onChange={(event) => setEmail(event.target.value)} required type="email" value={email} /></label>
          <label>Password<input aria-describedby={noticeTone === 'error' ? 'managed-login-notice' : undefined} aria-invalid={noticeTone === 'error'} autoComplete="current-password" onChange={(event) => setPassword(event.target.value)} required type="password" value={password} /></label>
          <Link className="account-inline-link" to={managedAccountPath('/account/recovery', productIntent)}>Forgot password?</Link>
          {signupPolicy ? <button className="account-inline-link account-link-button" onClick={() => chooseAccountMode(true)} type="button">Create an account</button> : <Link className="account-inline-link" to={signupPath}>No account yet? Try the local demo</Link>}
        </>}
        <button className="core-button primary" disabled={busy} type="submit">{busy ? 'Checking...' : directory ? bi('Open company') : bi('Find my company')}</button>
        <p className="form-notice" data-tone={noticeTone} id="managed-login-notice" role="status">{notice}</p>
      </form> : <section className="managed-login-panel" aria-label="Company account unavailable">
        <div><span className="core-eyebrow">Company account</span><h2>Company sign-in is not available here yet.</h2><p>Explore a sample without an account. Sample records stay on this device; they are not a shared company workspace.</p></div>
        <div className="managed-login-actions"><Link className="core-button primary" to="/?choose=1">Try a sample — no account</Link>{signupPolicy ? <button className="core-button" onClick={() => chooseAccountMode(true)} type="button">Create an account</button> : null}<a className="core-button" href={managedAccountRequestUrl(productIntent)}>Ask SuperMega to set me up</a></div>
      </section>}
    </div>
  )
}
