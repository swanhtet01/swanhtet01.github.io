import { useEffect, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import {
  appHref,
  getWorkspaceSession,
  googleAuthHref,
  needsLiveAppHandoff,
  publicShellOnly,
  workspaceAppBase,
  workspaceFetch,
} from '../lib/workspaceApi'
import { getTenantConfig } from '../lib/tenantConfig'

type SignupPayload = {
  name: string
  email: string
  company: string
  password: string
  goal: string
  workspace_slug: string
}

export function SignupPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const tenant = getTenantConfig()
  const isClientTenant = tenant.key !== 'default'
  const searchParams = new URLSearchParams(location.search)
  const [form, setForm] = useState<SignupPayload>({
    name: '',
    email: '',
    company: tenant.defaultCompany ?? '',
    password: '',
    goal: '',
    workspace_slug: tenant.defaultWorkspaceSlug ?? '',
  })
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [googleAuthEnabled, setGoogleAuthEnabled] = useState(false)
  const handoffToApp = needsLiveAppHandoff()
  const shellOnly = publicShellOnly()
  const googleError = searchParams.get('google_error') || ''

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const session = await getWorkspaceSession()
        if (!cancelled) {
          setGoogleAuthEnabled(Boolean(session.google_auth?.enabled))
        }
      } catch {
        if (!cancelled) {
          setGoogleAuthEnabled(false)
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
  }, [])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const payload = await workspaceFetch<{
        authenticated?: boolean
        generated_password?: string
      }>('/api/auth/signup', {
        method: 'POST',
        body: JSON.stringify(form),
      })
      if (payload.generated_password) {
        setMessage(`Workspace created. Generated password: ${payload.generated_password}`)
      }
      if (payload.authenticated) {
        navigate('/app', { replace: true })
        return
      }
      setError('Signup did not finish.')
    } catch {
      setError('Could not create the workspace on this host.')
    } finally {
      setBusy(false)
    }
  }

  const googleSignupHref = googleAuthHref('signup', {
    next: '/app/hq',
    workspaceSlug: form.workspace_slug,
    company: form.company,
    name: form.name,
    email: form.email,
  })
  const googleErrorMessage = googleError ? 'Google sign-in could not finish. Start again from this page.' : ''

  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow={isClientTenant ? tenant.brandName : 'Internal HQ'}
        title={isClientTenant ? 'Create the Plant A workspace.' : 'Create the internal workspace.'}
        description={
          isClientTenant
            ? 'Create the shared Plant A workspace and bring managers into the same operating surface.'
            : 'Create one founder-and-team workspace for queues, data linkage, and automation control.'
        }
      />

      {shellOnly ? (
        <section className="grid gap-6 lg:grid-cols-[0.76fr_1.24fr]">
          <aside className="sm-terminal p-6">
            <p className="sm-kicker text-[var(--sm-accent)]">This host</p>
            <div className="mt-5 grid gap-3">
              {['Public company site', 'System examples', 'Contact intake'].map((item) => (
                <div className="sm-chip text-white" key={item}>
                  {item}
                </div>
              ))}
            </div>
          </aside>
          <section className="sm-surface p-6">
            <p className="text-sm leading-relaxed text-[var(--sm-muted)]">
              Workspace signup is not live on this host. Use the public site now or contact us to start the first rollout.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link className="sm-button-primary" to="/find-companies">
                {isClientTenant ? 'Open receiving log' : 'Open public site'}
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
            <div className="mt-5 grid gap-3">
              {['Founder daily review', 'Team queues and workflows', 'Data linkage', 'Agent ops'].map((item) => (
                <div className="sm-chip text-white" key={item}>
                  {item}
                </div>
              ))}
            </div>
          </aside>
          <section className="sm-surface p-6">
            <p className="text-sm leading-relaxed text-[var(--sm-muted)]">
              Workspace signup runs on the live app host, not this public site.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <a className="sm-button-primary" href={appHref('/signup/')}>
                {isClientTenant ? 'Create Plant A workspace' : 'Create workspace'}
              </a>
              <a className="sm-button-secondary" href={appHref('/login/')}>
                {isClientTenant ? 'Open Plant A workspace' : 'Open internal HQ'}
              </a>
              {googleAuthEnabled ? (
                <a className="sm-button-secondary" href={googleSignupHref}>
                  Continue with Google
                </a>
              ) : null}
            </div>
            <div className="mt-4 sm-chip text-[var(--sm-muted)]">
              Live app host: {workspaceAppBase}
            </div>
          </section>
        </section>
      ) : (

      <section className="grid gap-6 lg:grid-cols-[0.82fr_1.18fr]">
        <aside className="sm-terminal p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Workspace includes</p>
          <div className="mt-5 grid gap-3">
            {['Founder daily review', 'Team queues and workflows', 'Data linkage and exports', 'Agent ops'].map((item) => (
              <div className="sm-chip text-white" key={item}>
                {item}
              </div>
            ))}
          </div>
          <p className="mt-6 text-sm text-[var(--sm-muted)]">Keep the first rollout simple. One team and one working queue is enough.</p>
        </aside>

        <form className="sm-surface p-6" onSubmit={handleSubmit}>
          {googleAuthEnabled ? (
            <div className="mb-5 flex flex-wrap gap-3">
              <a className="sm-button-secondary" href={googleSignupHref}>
                Continue with Google
              </a>
              <span className="self-center text-xs text-[var(--sm-muted)]">
                {loading ? 'Checking Google sign-in...' : 'Create the workspace after Google verifies your email.'}
              </span>
            </div>
          ) : null}

          <div className="grid gap-4">
            <label className="grid gap-2 text-sm font-semibold text-[var(--sm-muted)]">
              Founder or admin name
              <input className="sm-input" onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} required value={form.name} />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-[var(--sm-muted)]">
              Work email
              <input className="sm-input" onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))} required type="email" value={form.email} />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-[var(--sm-muted)]">
              Company or workspace name
              <input className="sm-input" onChange={(event) => setForm((prev) => ({ ...prev, company: event.target.value }))} required value={form.company} />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-[var(--sm-muted)]">
              Password
              <input
                className="sm-input"
                onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
                placeholder="Leave blank to auto-generate"
                type="password"
                value={form.password}
              />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-[var(--sm-muted)]">
              First team or workflow
              <textarea
                className="sm-input min-h-28"
                onChange={(event) => setForm((prev) => ({ ...prev, goal: event.target.value }))}
                placeholder={isClientTenant ? 'For example: receiving, GRN variance, or shift blockers.' : 'For example: sales follow-up, approvals, receiving, or founder review.'}
                value={form.goal}
              />
            </label>
          </div>

          <div className="mt-4 text-sm text-[var(--sm-muted)]">
            Start with the first team that needs a shared queue. More modules can be added after the workspace is live.
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <button className="sm-button-primary" disabled={busy} type="submit">
              {busy ? 'Creating...' : isClientTenant ? 'Create Plant A workspace' : 'Create workspace'}
            </button>
            <Link className="sm-button-secondary" to="/login">
              {isClientTenant ? 'Open Plant A workspace' : 'Open internal HQ'}
            </Link>
          </div>

          {message ? <div className="mt-4 sm-chip text-white">{message}</div> : null}
          {googleErrorMessage ? <div className="mt-4 sm-chip text-white">{googleErrorMessage}</div> : null}
          {error ? <div className="mt-4 sm-chip text-white">{error}</div> : null}
        </form>
      </section>
      )}
    </div>
  )
}
