import { type FormEvent, useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useOutletContext } from 'react-router'

import { PageHeading, type RuntimeHealth } from './CoreShell'
import { managedAccountPath, managedAccountRequestUrl } from './account-routes'
import {
  completeManagedWorkspaceSignIn,
  currentManagedIdentity,
  loadManagedBootstrap,
  managedTrialAuthConfigured,
  signInAndDiscoverManagedWorkspaces,
  type ManagedIdentity,
  type ManagedWorkspaceSignIn,
} from './managed-trial'

export function ManagedLoginPage() {
  const runtime = useOutletContext<RuntimeHealth>()
  const location = useLocation()
  const navigate = useNavigate()
  const productIntent = new URLSearchParams(location.search).get('product')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [workspaceId, setWorkspaceId] = useState('')
  const [directory, setDirectory] = useState<ManagedWorkspaceSignIn | null>(null)
  const [existingIdentity, setExistingIdentity] = useState<ManagedIdentity | null>(null)
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const managedReady = runtime.status === 'enterprise' && managedTrialAuthConfigured()

  useEffect(() => {
    if (!managedReady) return
    currentManagedIdentity().then(setExistingIdentity).catch(() => setExistingIdentity(null))
  }, [managedReady])

  async function openWorkspace(signIn: ManagedWorkspaceSignIn, selectedWorkspaceId: string) {
    const identity = await completeManagedWorkspaceSignIn(signIn, selectedWorkspaceId)
    await loadManagedBootstrap(identity)
    setExistingIdentity(identity)
    navigate('/settings/#controls')
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
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
      setDirectory(signIn)
      setWorkspaceId(signIn.workspaces[0].workspaceId)
      setNotice(`Choose one of ${signIn.workspaces.length} companies assigned to ${signIn.email}.`)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Managed sign-in failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="workspace-screen managed-login-screen">
      <PageHeading eyebrow="Company account" title="Open your company." copy="Sign in once. SuperMega finds the companies assigned to you." />
      {existingIdentity ? <section className="managed-login-panel" aria-label="Current managed account">
        <div><span className="core-eyebrow">Connected</span><h2>{existingIdentity.email}</h2><p>Your company account is ready.</p></div>
        <Link className="core-button primary" to="/settings/#controls">Open company</Link>
      </section> : managedReady ? <form className="managed-login-panel core-form" onSubmit={(event) => void submit(event)}>
        <div><span className="core-eyebrow">Premium access</span><h2>{directory ? 'Choose your company.' : 'Use your work account.'}</h2><p>{directory ? 'Only active companies assigned to this account are shown.' : 'No workspace code or technical setup is required.'}</p></div>
        {directory ? <label>Company<select onChange={(event) => setWorkspaceId(event.target.value)} required value={workspaceId}>{directory.workspaces.map((workspace) => <option key={workspace.workspaceId} value={workspace.workspaceId}>{workspace.label} - {workspace.access}</option>)}</select></label> : <>
          <label>Email<input autoComplete="username" maxLength={160} onChange={(event) => setEmail(event.target.value)} required type="email" value={email} /></label>
          <label>Password<input autoComplete="current-password" minLength={8} onChange={(event) => setPassword(event.target.value)} required type="password" value={password} /></label>
          <Link className="account-inline-link" to={managedAccountPath('/account/recovery', productIntent)}>Forgot password?</Link>
        </>}
        <button className="core-button primary" disabled={busy} type="submit">{busy ? 'Checking...' : directory ? 'Open company' : 'Find my company'}</button>
        {notice ? <p className="form-notice" role="status">{notice}</p> : null}
      </form> : <section className="managed-login-panel" aria-label="Company account unavailable">
        <div><span className="core-eyebrow">Company account</span><h2>Company account access is not active in this release.</h2><p>Use the complete local demo now, or request a company account.</p></div>
        <div className="managed-login-actions"><Link className="core-button primary" to="/">Try free demo</Link><a className="core-button" href={managedAccountRequestUrl(productIntent)}>Request company account</a></div>
      </section>}
    </div>
  )
}
