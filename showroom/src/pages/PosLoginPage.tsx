import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import {
  authenticatePosAccount,
  clearPosLocalState,
  getPosDemoAccounts,
  isPosAuthHost,
  loadPosSession,
  logoutPosAccount,
  restorePosSessionFromApi,
} from '../lib/posAuth'

function sanitizeNextRoute(value: string | null) {
  const route = String(value || '').trim()
  if (!route) {
    return '/pos/role'
  }
  if (!route.startsWith('/pos/') || route.startsWith('//') || route.includes('\\')) {
    return '/pos/role'
  }
  return route
}

export function PosLoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search])
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [resetMessage, setResetMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const nextRoute = sanitizeNextRoute(searchParams.get('next'))
  const demoAccounts = getPosDemoAccounts()
  const demoAccount = demoAccounts.find((account) => account.username === 'spaowner')
    || demoAccounts.find((account) => !account.username.includes('@'))
    || demoAccounts[0]
  const additionalDemoAccounts = demoAccounts
    .filter((account) =>
      account.username !== demoAccount?.username
      && !account.username.includes('@'),
    )
    .slice(0, 5)

  useEffect(() => {
    let active = true
    const localSession = loadPosSession()
    if (localSession) {
      navigate(localSession.activeRole ? '/pos/workspace' : '/pos/role', { replace: true })
      return () => {
        active = false
      }
    }
    restorePosSessionFromApi().then((restoredSession) => {
      if (!active || !restoredSession) {
        return
      }
      navigate(restoredSession.activeRole ? '/pos/workspace' : '/pos/role', { replace: true })
    }).catch(() => undefined)
    return () => {
      active = false
    }
  }, [navigate])

  function fillDemoCredentials(nextUsername: string, nextPassword: string) {
    setUsername(nextUsername)
    setPassword(nextPassword)
    setError('')
    setResetMessage('')
  }

  async function handleResetLocalDemoState() {
    if (typeof window !== 'undefined') {
      const confirmed = window.confirm('Reset local POS demo cache and start with clean demo data?')
      if (!confirmed) {
        return
      }
    }
    await logoutPosAccount()
    clearPosLocalState()
    setUsername('')
    setPassword('')
    setError('')
    setResetMessage('Local POS demo cache reset. Sign in again with demo credentials.')
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    setResetMessage('')
    try {
      const session = await authenticatePosAccount(username, password)
      if (!session) {
        setError('Sign-in failed. Use one of the active credentials shown below.')
        return
      }
      navigate(nextRoute, { replace: true })
    } catch (error) {
      const message = error instanceof Error ? error.message.trim() : ''
      setError(message || 'Sign-in failed. Try again in a moment.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="sm-clean-login sm-pos-auth-screen">
      <section className="sm-clean-login-card sm-pos-auth-card">
        <div className="sm-clean-login-copy">
          <p className="sm-kicker text-[var(--sm-accent)]">POS.SUPERMEGA.DEV</p>
          <h1>Open POS workspace.</h1>
          <p>
            Simple username login for client pilots. Sign in, pick the assigned location and role, then run the store from one focused screen.
          </p>
          <div className="sm-pos-login-steps" aria-label="POS login flow">
            <span>1. Sign in</span>
            <span>2. Choose role</span>
            <span>3. Open POS</span>
          </div>
          <div className="sm-pos-launch-boundary" aria-label="POS launch mode">
            <span>Pilot-ready boundary</span>
            <strong>Manual cash, wallet/bank proof, invoice, and normal browser print/PDF are live. Production history/SLA waits for the strict database gate.</strong>
          </div>
          {demoAccount ? (
            <div className="sm-pos-demo-credentials">
              <div>
                <p>Demo access</p>
                <strong>{demoAccount.companyName}</strong>
                <small>Username: {demoAccount.username}</small>
              </div>
              <div className="sm-pos-demo-actions">
                <button className="sm-button-secondary" onClick={() => fillDemoCredentials(demoAccount.username, demoAccount.password)} type="button">
                  Use demo credentials
                </button>
                <button className="sm-button-secondary" onClick={() => void handleResetLocalDemoState()} type="button">
                  Reset demo
                </button>
              </div>
            </div>
          ) : null}
          {additionalDemoAccounts.length ? (
            <details className="sm-pos-demo-accounts">
              <summary>More simple demo logins</summary>
              <div className="sm-pos-demo-account-grid">
                {additionalDemoAccounts.map((account) => (
                  <button
                    className="sm-pos-demo-account"
                    key={account.username}
                    onClick={() => fillDemoCredentials(account.username, account.password)}
                    type="button"
                  >
                    <strong>{account.companyName}</strong>
                    <span>{account.username}</span>
                    <small>{account.displayName}</small>
                  </button>
                ))}
              </div>
            </details>
          ) : null}
          <p className="sm-clean-login-gate">
            Client users only see POS, Setup, and Help. Internal Sales Admin remains hidden from normal client accounts.
          </p>
          {!isPosAuthHost() ? (
            <p className="sm-clean-login-gate">
              This page is optimized for <strong>pos.supermega.dev</strong>. It can still run locally for development.
            </p>
          ) : null}
        </div>

        <form className="sm-clean-login-form sm-pos-auth-form" onSubmit={handleSubmit}>
          {demoAccount ? (
            <p className="sm-pos-auth-form-hint">
              Tap demo credentials or enter an assigned client username.
            </p>
          ) : null}
          <div className="sm-pos-form-topline">
            <span>Client sign in</span>
            <strong>Simple username</strong>
          </div>
          <label>
            <span>Username</span>
            <input
              autoComplete="username"
              className="sm-input"
              onChange={(event) => setUsername(event.target.value)}
              placeholder="Username"
              required
              value={username}
            />
          </label>
          <label>
            <span>Password</span>
            <input
              autoComplete="current-password"
              className="sm-input"
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Password"
              required
              type="password"
              value={password}
            />
          </label>
          <p className="sm-pos-form-note">No email domain required for pilot users.</p>
          {error ? <div className="sm-clean-login-error">{error}</div> : null}
          {resetMessage ? <p className="sm-pos-role-capability">{resetMessage}</p> : null}
          <button className="sm-button-primary" disabled={submitting} type="submit">
            {submitting ? 'Opening...' : 'Sign in to POS'}
          </button>
        </form>
      </section>
    </div>
  )
}
