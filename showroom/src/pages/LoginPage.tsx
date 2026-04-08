import { useEffect, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import {
  appHref,
  getWorkspaceSession,
  googleAuthHref,
  loginWorkspace,
  needsLiveAppHandoff,
  publicShellOnly,
  workspaceAppBase,
} from '../lib/workspaceApi'
import { getTenantConfig } from '../lib/tenantConfig'

const googleErrorLabels: Record<string, string> = {
  google_not_configured: 'Google sign-in is not configured on this host yet.',
  google_missing_code: 'Google sign-in did not return a valid code.',
  google_state_mismatch: 'Google sign-in state expired. Start again.',
  google_missing_token: 'Google sign-in did not return a token.',
  google_token_exchange_failed: 'Google sign-in could not be completed. Try again.',
  google_token_invalid: 'Google sign-in verification failed. Try again.',
  google_email_not_verified: 'Use a Google account with a verified email.',
  google_domain_not_allowed: 'This Google account domain is not allowed on this host.',
  google_account_not_provisioned: 'This Google account does not have workspace access yet.',
  google_session_failed: 'Google sign-in could not open the workspace session.',
  google_nonce_mismatch: 'Google sign-in verification failed. Start again.',
  google_denied: 'Google sign-in was cancelled.',
}

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const tenant = getTenantConfig()
  const searchParams = new URLSearchParams(location.search)
  const next = searchParams.get('next') || '/app/hq'
  const isClientTenant = tenant.key !== 'default'
  const googleError = searchParams.get('google_error') || ''

  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [username, setUsername] = useState('owner')
  const [password, setPassword] = useState('')
  const [workspaceSlug, setWorkspaceSlug] = useState(tenant.defaultWorkspaceSlug ?? '')
  const [error, setError] = useState('')
  const [authRequired, setAuthRequired] = useState(true)
  const [usesDefaultCredentials, setUsesDefaultCredentials] = useState(false)
  const [googleAuthEnabled, setGoogleAuthEnabled] = useState(false)
  const [workspaceOptions, setWorkspaceOptions] = useState<Array<{ slug?: string; name?: string; role?: string }>>([])
  const handoffToApp = needsLiveAppHandoff()
  const shellOnly = publicShellOnly()

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const session = await getWorkspaceSession()
        if (cancelled) {
          return
        }
        setAuthRequired(session.auth_required !== false)
        setUsesDefaultCredentials(Boolean(session.uses_default_credentials))
        setGoogleAuthEnabled(Boolean(session.google_auth?.enabled))
        setWorkspaceOptions(session.workspaces ?? [])
        if (!workspaceSlug && session.workspaces?.length === 1) {
          setWorkspaceSlug(session.workspaces[0].slug ?? '')
        }
        if (session.authenticated) {
          navigate(next, { replace: true })
          return
        }
      } catch {
        if (!cancelled) {
          setError('The app host is not responding yet. Login works only on the live app backend.')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [navigate, next, workspaceSlug])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      const payload = await loginWorkspace(username, password, workspaceSlug)
      if (payload.authenticated) {
        navigate(next, { replace: true })
        return
      }
      setError('Login failed.')
    } catch {
      setError('Login failed. Check the username and password or use the live app host.')
    } finally {
      setSubmitting(false)
    }
  }

  const googleLoginHref = googleAuthHref('login', {
    next,
    workspaceSlug,
    email: username.includes('@') ? username : '',
  })
  const googleErrorMessage = googleError ? googleErrorLabels[googleError] || 'Google sign-in could not be completed.' : ''

  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow={isClientTenant ? tenant.brandName : 'Client login'}
        title={isClientTenant ? 'Sign in to the Plant A desk.' : 'Sign in to the workspace.'}
        description={isClientTenant ? 'Use this for the shared Plant A receiving and task desk.' : 'Use this only for the saved app.'}
      />

      {shellOnly ? (
        <section className="grid gap-6 lg:grid-cols-[0.76fr_1.24fr]">
          <aside className="sm-terminal p-6">
            <p className="sm-kicker text-[var(--sm-accent)]">What is live</p>
            <div className="mt-4 grid gap-3">
              <div className="sm-chip text-white">Public Lead Finder</div>
              <div className="sm-chip text-white">Action OS overview</div>
              <div className="sm-chip text-white">Call booking</div>
            </div>
          </aside>
          <section className="sm-surface p-6">
            <p className="text-sm leading-relaxed text-[var(--sm-muted)]">
              This host is the public site only. The saved workspace app is not deployed on this domain yet.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link className="sm-button-primary" to="/find-companies">
                {isClientTenant ? 'Open receiving' : 'Open Find Companies'}
              </Link>
              <Link className="sm-button-secondary" to="/contact">
                Contact us
              </Link>
            </div>
          </section>
        </section>
      ) : handoffToApp ? (
        <section className="grid gap-6 lg:grid-cols-[0.76fr_1.24fr]">
          <aside className="sm-terminal p-6">
            <p className="sm-kicker text-[var(--sm-accent)]">Use this for</p>
            <div className="mt-4 grid gap-3">
              <div className="sm-chip text-white">Saved lead pipeline</div>
              <div className="sm-chip text-white">Action board and exceptions</div>
              <div className="sm-chip text-white">Director and manager views</div>
            </div>
          </aside>
          <section className="sm-surface p-6">
            <p className="text-sm leading-relaxed text-[var(--sm-muted)]">
              The saved app is not on this host. Open the live app directly.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <a className="sm-button-primary" href={appHref('/login/')}>
                {isClientTenant ? 'Open Plant A desk' : 'Open app'}
              </a>
              <a className="sm-button-accent" href={appHref('/signup/')}>
                {isClientTenant ? 'Start Plant A desk' : 'Start workspace'}
              </a>
              {googleAuthEnabled ? (
                <a className="sm-button-secondary" href={googleLoginHref}>
                  Continue with Google
                </a>
              ) : null}
              <Link className="sm-button-secondary" to={isClientTenant ? '/receiving' : '/find-companies'}>
                {isClientTenant ? 'Open receiving' : 'Open Find Companies'}
              </Link>
            </div>
            <div className="mt-4 sm-chip text-[var(--sm-muted)]">
              Live app host: {workspaceAppBase}
            </div>
          </section>
        </section>
      ) : (

      <section className="grid gap-6 lg:grid-cols-[0.7fr_1.3fr]">
        <aside className="sm-terminal p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Use this for</p>
          <div className="mt-4 grid gap-3">
            <div className="sm-chip text-white">Saved lead pipeline</div>
            <div className="sm-chip text-white">Action board and exceptions</div>
            <div className="sm-chip text-white">Director and manager views</div>
          </div>
        </aside>
        <form className="sm-surface p-6" onSubmit={handleSubmit}>
          {googleAuthEnabled ? (
            <div className="mb-5 flex flex-wrap gap-3">
              <a className="sm-button-secondary" href={googleLoginHref}>
                Continue with Google
              </a>
              <span className="self-center text-xs text-[var(--sm-muted)]">Phone-friendly sign-in for the live app.</span>
            </div>
          ) : null}

          <div className="grid gap-4">
            <label className="grid gap-2 text-sm font-semibold text-[var(--sm-muted)]">
              Username
              <input className="sm-input" onChange={(event) => setUsername(event.target.value)} value={username} />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-[var(--sm-muted)]">
              Password
              <input className="sm-input" onChange={(event) => setPassword(event.target.value)} type="password" value={password} />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-[var(--sm-muted)]">
              Workspace
              <input
                className="sm-input"
                onChange={(event) => setWorkspaceSlug(event.target.value)}
                placeholder={
                  workspaceOptions[0]?.slug
                    ? `Default: ${workspaceOptions[0].slug}`
                    : tenant.defaultWorkspaceSlug
                      ? `Default: ${tenant.defaultWorkspaceSlug}`
                      : 'Leave blank for default workspace'
                }
                value={workspaceSlug}
              />
            </label>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <button className="sm-button-primary" disabled={loading || submitting} type="submit">
              {submitting ? 'Opening...' : isClientTenant ? 'Open Plant A desk' : 'Open app'}
            </button>
            <Link className="sm-button-accent" to="/signup">
              {isClientTenant ? 'Start Plant A desk' : 'Start workspace'}
            </Link>
            <Link className="sm-button-secondary" to={isClientTenant ? '/receiving' : '/find-companies'}>
              {isClientTenant ? 'Open receiving' : 'Open Find Companies'}
            </Link>
          </div>

          {!authRequired ? <div className="mt-4 sm-chip text-[var(--sm-muted)]">Auth is off on this host, so the app should open directly.</div> : null}
          {usesDefaultCredentials ? (
            <div className="mt-4 sm-chip text-[var(--sm-muted)]">
              This host is still using the default demo credentials. Change `SUPERMEGA_APP_USERNAME` and `SUPERMEGA_APP_PASSWORD` before sharing it widely.
            </div>
          ) : null}
          {workspaceOptions.length ? (
            <div className="mt-4 sm-chip text-[var(--sm-muted)]">
              Available workspaces: {workspaceOptions.map((item) => `${item.name || item.slug} (${item.role || 'member'})`).join(' / ')}
            </div>
          ) : null}
          {googleErrorMessage ? <div className="mt-4 sm-chip text-white">{googleErrorMessage}</div> : null}
          {error ? <div className="mt-4 sm-chip text-white">{error}</div> : null}
        </form>
      </section>
      )}
    </div>
  )
}
