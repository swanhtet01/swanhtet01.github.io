import { useEffect, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

import { LiveProductPreview } from '../components/LiveProductPreview'
import { PageIntro } from '../components/PageIntro'
import { appHref, getWorkspaceSession, loginWorkspace, needsLiveAppHandoff, publicShellOnly, workspaceAppBase } from '../lib/workspaceApi'
import { getTenantBrandLabel, getTenantConfig, getTenantLabel } from '../lib/tenantConfig'
import { YANGON_TYRE_CONNECTOR_CHANNELS, YANGON_TYRE_IDENTITY_LANES } from '../lib/yangonTyrePortalModel'

const defaultUseCases = ['Saved workspace and queues', 'Approvals and exceptions', 'Director and agent views'] as const
const clientUseCases = ['Role-based enterprise login', 'Sales, plant, DQMS, maintenance, and CEO homes', 'Connector-scoped data and AI review'] as const

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const tenant = getTenantConfig()
  const isClientTenant = tenant.key !== 'default'
  const next = new URLSearchParams(location.search).get('next') || (isClientTenant ? '/app/portal' : '/app/actions')
  const tenantLabel = getTenantLabel(tenant) || tenant.defaultCompany || 'workspace'

  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [username, setUsername] = useState('owner')
  const [password, setPassword] = useState('')
  const [workspaceSlug, setWorkspaceSlug] = useState(tenant.defaultWorkspaceSlug ?? '')
  const [error, setError] = useState('')
  const [authRequired, setAuthRequired] = useState(true)
  const [usesDefaultCredentials, setUsesDefaultCredentials] = useState(false)
  const [workspaceOptions, setWorkspaceOptions] = useState<Array<{ slug?: string; name?: string; role?: string }>>([])
  const handoffToApp = needsLiveAppHandoff()
  const shellOnly = publicShellOnly()
  const useCases = isClientTenant ? clientUseCases : defaultUseCases

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

  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow={isClientTenant ? getTenantBrandLabel(tenant) : tenant.brandName}
        title={isClientTenant ? `Open the ${tenantLabel} enterprise portal.` : 'Open the workspace.'}
        description={
          isClientTenant
            ? `Use this for role-based access to sales, operations, manufacturing, DQMS, maintenance, approvals, and director review inside ${tenantLabel}.`
            : 'Use this only for the saved team workspace, approvals, and live operations.'
        }
      />

      {shellOnly ? (
        <section className="grid gap-6 lg:grid-cols-[0.76fr_1.24fr]">
          <aside className="sm-terminal p-6">
            <p className="sm-kicker text-[var(--sm-accent)]">What is live here</p>
            <div className="mt-4 grid gap-3">
              {useCases.map((item) => (
                <div className="sm-chip text-white" key={item}>
                  {item}
                </div>
              ))}
            </div>
          </aside>
          <section className="sm-surface p-6">
            <p className="text-sm leading-relaxed text-[var(--sm-muted)]">
              {isClientTenant
                ? 'This host shows the Yangon Tyre portal shell, but the saved enterprise workspace app is not deployed on this domain yet.'
                : 'This host is the public site only. The saved workspace app is not deployed on this domain yet.'}
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link className="sm-button-primary" to={isClientTenant ? '/receiving-log' : '/find-companies'}>
                {isClientTenant ? 'Open receiving queue' : 'Open Find Clients'}
              </Link>
              <Link className="sm-button-secondary" to="/contact">
                Start rollout
              </Link>
            </div>
          </section>
        </section>
      ) : handoffToApp ? (
        <section className="grid gap-6 lg:grid-cols-[0.76fr_1.24fr]">
          <aside className="sm-terminal p-6">
            <p className="sm-kicker text-[var(--sm-accent)]">Use this for</p>
            <div className="mt-4 grid gap-3">
              {useCases.map((item) => (
                <div className="sm-chip text-white" key={item}>
                  {item}
                </div>
              ))}
            </div>
          </aside>
          <section className="sm-surface p-6">
            <p className="text-sm leading-relaxed text-[var(--sm-muted)]">
              {isClientTenant
                ? 'The Yangon Tyre enterprise workspace is on the live app host. Use that login to enter the tenant with role-based homes and connector-scoped data.'
                : 'The saved workspace app is on the live app host, not this static site.'}
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <a className="sm-button-primary" href={appHref('/login/')}>
                {isClientTenant ? 'Open enterprise portal' : 'Open workspace'}
              </a>
              <a className="sm-button-accent" href={appHref('/signup/')}>
                Create workspace
              </a>
              <Link className="sm-button-secondary" to={isClientTenant ? '/receiving-log' : '/find-companies'}>
                {isClientTenant ? 'Open receiving queue' : 'Open Find Clients'}
              </Link>
            </div>
            <div className="mt-4 sm-chip text-[var(--sm-muted)]">Live app host: {workspaceAppBase}</div>
          </section>
        </section>
      ) : (
        <section className="grid gap-6 lg:grid-cols-[0.7fr_1.3fr]">
          <aside className="sm-terminal p-6">
            <p className="sm-kicker text-[var(--sm-accent)]">Use this for</p>
            <div className="mt-4 grid gap-3">
              {useCases.map((item) => (
                <div className="sm-chip text-white" key={item}>
                  {item}
                </div>
              ))}
            </div>
          </aside>
          <form className="sm-surface p-6" onSubmit={handleSubmit}>
            {isClientTenant ? (
              <div className="mb-5 flex flex-wrap gap-3 text-sm text-[var(--sm-muted)]">
                <span className="sm-status-pill">Enterprise login</span>
                <span className="sm-status-pill">Role landing</span>
                <span className="sm-status-pill">Connector scope</span>
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
                {submitting ? 'Opening...' : isClientTenant ? 'Open enterprise portal' : 'Open workspace'}
              </button>
              <Link className="sm-button-accent" to="/signup">
                Create workspace
              </Link>
              <Link className="sm-button-secondary" to={isClientTenant ? '/receiving-log' : '/find-companies'}>
                {isClientTenant ? 'Open receiving queue' : 'Open Find Clients'}
              </Link>
            </div>

            {!authRequired ? <div className="mt-4 sm-chip text-[var(--sm-muted)]">Local sign-in bypass is enabled on this host, so the app should open directly.</div> : null}
            {usesDefaultCredentials ? (
              <div className="mt-4 sm-chip text-[var(--sm-muted)]">
                This host is still using temporary credentials. Replace them before sharing the workspace more widely.
              </div>
            ) : null}
            {workspaceOptions.length ? (
              <div className="mt-4 sm-chip text-[var(--sm-muted)]">
                Available workspaces: {workspaceOptions.map((item) => `${item.name || item.slug} (${item.role || 'member'})`).join(' / ')}
              </div>
            ) : null}
            {isClientTenant ? (
              <div className="mt-4 sm-chip text-[var(--sm-muted)]">
                Default tenant: {tenant.defaultWorkspaceSlug || 'ytf-plant-a'}. Use the workspace field only if you need to switch to another Yangon Tyre
                workspace slug.
              </div>
            ) : null}
            {error ? <div className="mt-4 sm-chip text-white">{error}</div> : null}
          </form>
        </section>
      )}

      {isClientTenant ? (
        <section className="grid gap-6 xl:grid-cols-[1.02fr_0.98fr]">
          <article className="sm-surface-deep p-6">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="sm-kicker text-[var(--sm-accent)]">Portal map</p>
                <h2 className="mt-3 text-2xl font-bold text-white lg:text-3xl">The login opens a real operating portal, not a blank shell.</h2>
              </div>
              <span className="sm-status-pill">Yangon Tyre tenant</span>
            </div>
            <div className="mt-6">
              <LiveProductPreview compact variant="ytf-portal" />
            </div>
          </article>

          <article className="sm-surface p-6">
            <p className="sm-kicker text-[var(--sm-accent-alt)]">What login unlocks</p>
            <h2 className="mt-3 text-2xl font-bold text-white lg:text-3xl">Right user, right home, right source lanes.</h2>
            <div className="mt-6 grid gap-3">
              {YANGON_TYRE_IDENTITY_LANES.map((lane) => (
                <article className="sm-chip text-white" key={lane.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{lane.role}</p>
                      <p className="mt-2 text-sm text-[var(--sm-muted)]">{lane.mandate}</p>
                    </div>
                    <Link className="sm-link" to={lane.route}>
                      {lane.home}
                    </Link>
                  </div>
                </article>
              ))}
            </div>

            <div className="mt-6">
              <p className="sm-kicker text-[var(--sm-accent)]">Connected inputs</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {YANGON_TYRE_CONNECTOR_CHANNELS.map((connector) => (
                  <span className="sm-status-pill" key={connector.id}>
                    {connector.name}
                  </span>
                ))}
              </div>
            </div>
          </article>
        </section>
      ) : null}
    </div>
  )
}
