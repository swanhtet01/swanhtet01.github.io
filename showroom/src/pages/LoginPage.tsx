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
        eyebrow={isClientTenant ? tenant.brandName : 'Internal HQ'}
        title={isClientTenant ? 'Open the Plant A workspace.' : 'Open the internal workspace.'}
        description={
          isClientTenant
            ? 'Use this for the shared Plant A operating workspace.'
            : 'Use this for founder review, team queues, data linkage, and agent control.'
        }
      />

      {shellOnly ? (
        <section className="grid gap-6 lg:grid-cols-[0.76fr_1.24fr]">
          <aside className="sm-terminal p-6">
            <p className="sm-kicker text-[var(--sm-accent)]">This host</p>
            <div className="mt-4 grid gap-3">
              <div className="sm-chip text-white">Public company site</div>
              <div className="sm-chip text-white">System examples</div>
              <div className="sm-chip text-white">Contact intake</div>
            </div>
          </aside>
          <section className="sm-surface p-6">
            <p className="text-sm leading-relaxed text-[var(--sm-muted)]">
              This host is the public site only. The private workspace is not deployed on this domain.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link className="sm-button-primary" to="/find-companies">
                {isClientTenant ? 'Open receiving log' : 'Open public examples'}
              </Link>
              <Link className="sm-button-secondary" to="/contact">
                Contact
              </Link>
            </div>
          </section>
        </section>
      ) : handoffToApp ? (
        <section className="grid gap-6 lg:grid-cols-[0.76fr_1.24fr]">
          <aside className="sm-terminal p-6">
            <p className="sm-kicker text-[var(--sm-accent)]">Workspace includes</p>
            <div className="mt-4 grid gap-3">
              <div className="sm-chip text-white">Founder daily review</div>
              <div className="sm-chip text-white">Team queues and workflows</div>
              <div className="sm-chip text-white">Data linkage and agent ops</div>
            </div>
          </aside>
          <section className="sm-surface p-6">
            <p className="text-sm leading-relaxed text-[var(--sm-muted)]">
              The private workspace lives on the app host. Open it directly.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <a className="sm-button-primary" href={appHref('/login/')}>
                {isClientTenant ? 'Open Plant A workspace' : 'Open internal HQ'}
              </a>
              <a className="sm-button-accent" href={appHref('/signup/')}>
                {isClientTenant ? 'Create Plant A workspace' : 'Create workspace'}
              </a>
              {googleAuthEnabled ? (
                <a className="sm-button-secondary" href={googleLoginHref}>
                  Continue with Google
                </a>
                ) : null}
              <Link className="sm-button-secondary" to={isClientTenant ? '/receiving' : '/find-companies'}>
                {isClientTenant ? 'Open receiving log' : 'Back to public site'}
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
          <p className="sm-kicker text-[var(--sm-accent)]">Workspace includes</p>
          <div className="mt-4 grid gap-3">
            <div className="sm-chip text-white">Founder daily review</div>
            <div className="sm-chip text-white">Team queues and workflows</div>
            <div className="sm-chip text-white">Data linkage and exports</div>
            <div className="sm-chip text-white">Agent loops and schedules</div>
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
              Email or username
              <input className="sm-input" onChange={(event) => setUsername(event.target.value)} value={username} />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-[var(--sm-muted)]">
              Password
              <input className="sm-input" onChange={(event) => setPassword(event.target.value)} type="password" value={password} />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-[var(--sm-muted)]">
              Workspace slug
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

          <div className="mt-4 text-sm text-[var(--sm-muted)]">
            Use the workspace slug only if you have more than one workspace. Otherwise leave it blank and the default workspace will open.
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <button className="sm-button-primary" disabled={loading || submitting} type="submit">
              {submitting ? 'Opening...' : isClientTenant ? 'Open Plant A workspace' : 'Open internal HQ'}
            </button>
            <Link className="sm-button-accent" to="/signup">
              {isClientTenant ? 'Create Plant A workspace' : 'Create workspace'}
            </Link>
            <Link className="sm-button-secondary" to={isClientTenant ? '/receiving' : '/find-companies'}>
              {isClientTenant ? 'Open receiving log' : 'Back to public site'}
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
