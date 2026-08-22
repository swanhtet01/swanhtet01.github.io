import { type FormEvent, useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useOutletContext } from 'react-router'

import { PageHeading, type RuntimeHealth } from './CoreShell'
import { managedAccountPath, managedAccountRequestUrl, managedPortalEntryPath } from './account-routes'
import {
  beginManagedAccountSetup,
  completeManagedAccountPassword,
  completeManagedWorkspaceSignIn,
  loadManagedBootstrap,
  managedTrialAuthConfigured,
  requestManagedPasswordRecovery,
  type ManagedAccountSetup,
  type ManagedWorkspaceSignIn,
} from './managed-trial'

function ManagedUnavailable({ productIntent }: { productIntent: string | null }) {
  return <section className="managed-login-panel" aria-label="Company account unavailable">
    <div><span className="core-eyebrow">Company account</span><h2>Company account access is not active in this release.</h2><p>Use the complete local demo now, or request a company account.</p></div>
    <div className="managed-login-actions"><Link className="core-button primary" to="/">Try free demo</Link><a className="core-button" href={managedAccountRequestUrl(productIntent)}>Request company account</a></div>
  </section>
}

export function ManagedAccountPage() {
  const runtime = useOutletContext<RuntimeHealth>()
  const location = useLocation()
  const navigate = useNavigate()
  const productIntent = new URLSearchParams(location.search).get('product')
  const portalEntryPath = managedPortalEntryPath(productIntent)
  const recoveryRequest = location.pathname === '/account/recovery' || location.pathname === '/account/recovery/'
  const managedReady = runtime.authReady && managedTrialAuthConfigured()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [setup, setSetup] = useState<ManagedAccountSetup | null>(null)
  const [directory, setDirectory] = useState<ManagedWorkspaceSignIn | null>(null)
  const [workspaceId, setWorkspaceId] = useState('')
  const [notice, setNotice] = useState(() => recoveryRequest ? '' : 'Checking your secure account link...')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (recoveryRequest || !managedReady) return
    let active = true
    beginManagedAccountSetup()
      .then((result) => {
        if (!active) return
        setSetup(result)
        setNotice('Secure link confirmed. Set a new password to continue.')
      })
      .catch(() => {
        if (!active) return
        setNotice('This account link is invalid or expired. Request a new link.')
      })
    return () => { active = false }
  }, [managedReady, recoveryRequest])

  async function openWorkspace(signIn: ManagedWorkspaceSignIn, selectedWorkspaceId: string) {
    const identity = await completeManagedWorkspaceSignIn(signIn, selectedWorkspaceId)
    await loadManagedBootstrap(identity)
    navigate(portalEntryPath)
  }

  async function requestRecovery(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setNotice('Sending a secure recovery link...')
    try {
      await requestManagedPasswordRecovery(email)
      setEmail('')
      setSent(true)
      setNotice('If this email belongs to a managed account, a recovery link is on its way.')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'A recovery link could not be sent. Try again.')
    } finally {
      setBusy(false)
    }
  }

  async function savePassword(event: FormEvent) {
    event.preventDefault()
    if (password !== confirmation) {
      setNotice('The passwords do not match.')
      return
    }
    setBusy(true)
    setNotice('Securing your managed account...')
    try {
      const signIn = await completeManagedAccountPassword(password)
      setPassword('')
      setConfirmation('')
      if (signIn.workspaces.length === 1) {
        await openWorkspace(signIn, signIn.workspaces[0].workspaceId)
        return
      }
      if (signIn.workspaces.length === 0) {
        // Signed in with no company yet: the login page opens the claim-code
        // activation panel for exactly this state.
        navigate('/login')
        return
      }
      setDirectory(signIn)
      setWorkspaceId(signIn.workspaces[0].workspaceId)
      setNotice(`Password saved. Choose one of ${signIn.workspaces.length} companies assigned to ${signIn.email}.`)
    } catch (error) {
      setPassword('')
      setConfirmation('')
      setNotice(error instanceof Error ? error.message : 'The password could not be saved.')
    } finally {
      setBusy(false)
    }
  }

  async function chooseWorkspace(event: FormEvent) {
    event.preventDefault()
    if (!directory) return
    setBusy(true)
    setNotice('Opening your company...')
    try {
      await openWorkspace(directory, workspaceId)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The company could not be opened.')
      setBusy(false)
    }
  }

  if (recoveryRequest) {
    return <div className="workspace-screen managed-login-screen">
      <PageHeading eyebrow="Company account" title="Recover your account." copy="Enter your work email. We will send one secure password link." />
      {!managedReady ? <ManagedUnavailable productIntent={productIntent} /> : sent ? <section className="managed-login-panel" aria-label="Recovery link requested">
        <div><span className="core-eyebrow">Check your inbox</span><h2>Recovery requested.</h2><p>{notice}</p></div>
        <div className="managed-login-actions"><Link className="core-button primary" to={managedAccountPath('/login', productIntent)}>Back to sign in</Link><button className="core-button account-link-button" onClick={() => { setSent(false); setNotice('') }} type="button">Try another email</button></div>
      </section> : <form className="managed-login-panel core-form" onSubmit={(event) => void requestRecovery(event)}>
        <div><span className="core-eyebrow">Password recovery</span><h2>Send a secure link.</h2><p>For privacy, the result is the same whether or not the address has an account.</p></div>
        <label>Work email<input autoComplete="email" maxLength={160} onChange={(event) => setEmail(event.target.value)} required type="email" value={email} /></label>
        <button className="core-button primary" disabled={busy} type="submit">{busy ? 'Sending...' : 'Send recovery link'}</button>
        <Link className="account-inline-link" to={managedAccountPath('/login', productIntent)}>Back to sign in</Link>
        {notice ? <p className="form-notice" role="status">{notice}</p> : null}
      </form>}
    </div>
  }

  return <div className="workspace-screen managed-login-screen">
    <PageHeading eyebrow="Company account" title="Secure your account." copy="Accept your invitation or recovery link, then set one strong password." />
    {!managedReady ? <ManagedUnavailable productIntent={productIntent} /> : directory ? <form className="managed-login-panel core-form" onSubmit={(event) => void chooseWorkspace(event)}>
      <div><span className="core-eyebrow">Account ready</span><h2>Choose your company.</h2><p>Only active companies assigned to this named account are shown.</p></div>
      <label>Company<select onChange={(event) => setWorkspaceId(event.target.value)} required value={workspaceId}>{directory.workspaces.map((workspace) => <option key={workspace.workspaceId} value={workspace.workspaceId}>{workspace.label} - {workspace.access}</option>)}</select></label>
      <button className="core-button primary" disabled={busy} type="submit">{busy ? 'Opening...' : 'Open company'}</button>
      {notice ? <p className="form-notice" role="status">{notice}</p> : null}
    </form> : setup ? <form className="managed-login-panel core-form" onSubmit={(event) => void savePassword(event)}>
      <div><span className="core-eyebrow">Secure link confirmed</span><h2>Set your password.</h2><p>{setup.email}. Use at least 12 characters. This link can be used only for account setup.</p></div>
      <label>New password<input autoComplete="new-password" maxLength={128} minLength={12} onChange={(event) => setPassword(event.target.value)} required type="password" value={password} /></label>
      <label>Confirm password<input autoComplete="new-password" maxLength={128} minLength={12} onChange={(event) => setConfirmation(event.target.value)} required type="password" value={confirmation} /></label>
      <button className="core-button primary" disabled={busy} type="submit">{busy ? 'Securing...' : 'Save password and continue'}</button>
      {notice ? <p className="form-notice" role="status">{notice}</p> : null}
    </form> : <section className="managed-login-panel" aria-label="Checking managed account link">
      <div><span className="core-eyebrow">Secure link</span><h2>{notice.startsWith('This account link') ? 'Link unavailable.' : 'Checking your link.'}</h2><p>{notice || 'Checking your secure account link...'}</p></div>
      {notice.startsWith('This account link') ? <div className="managed-login-actions"><Link className="core-button primary" to={managedAccountPath('/account/recovery', productIntent)}>Request a new link</Link><Link className="core-button" to={managedAccountPath('/login', productIntent)}>Back to sign in</Link></div> : null}
    </section>}
  </div>
}
