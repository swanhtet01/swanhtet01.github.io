import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import {
  appHref,
  needsLiveAppHandoff,
  publicShellOnly,
  savePublicWorkspaceProfile,
  saveWorkspaceOnboardingDraft,
  workspaceAppBase,
  workspaceFetch,
} from '../lib/workspaceApi'
import { getTenantBrandLabel, getTenantConfig, getTenantLabel } from '../lib/tenantConfig'

type SignupPayload = {
  name: string
  email: string
  company: string
  password: string
  packageName: string
  team: string
  systems: string
  goal: string
  workspace_slug: string
}

const packageOptions = [
  'Revenue System Package',
  'Operations Control Package',
  'Industrial Quality Package',
  'Portal Network Package',
  'Find Clients',
  'Company List',
  'Receiving Control',
] as const

const teamOptions = ['Sales', 'Operations', 'Procurement', 'Quality', 'Maintenance', 'Leadership', 'Admin'] as const

export function SignupPage() {
  const navigate = useNavigate()
  const tenant = getTenantConfig()
  const isClientTenant = tenant.key !== 'default'
  const tenantLabel = getTenantLabel(tenant) || tenant.defaultCompany || 'workspace'
  const [form, setForm] = useState<SignupPayload>({
    name: '',
    email: '',
    company: tenant.defaultCompany ?? '',
    password: '',
    packageName: isClientTenant ? 'Portal Network Package' : 'Revenue System Package',
    team: isClientTenant ? 'Operations' : 'Sales',
    systems: '',
    goal: '',
    workspace_slug: tenant.defaultWorkspaceSlug ?? '',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const handoffToApp = needsLiveAppHandoff()
  const shellOnly = publicShellOnly()

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
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          company: form.company,
          password: form.password,
          package_name: form.packageName,
          first_team: form.team,
          current_systems: form.systems
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean),
          goal: form.goal,
          workspace_slug: form.workspace_slug,
        }),
      })
      savePublicWorkspaceProfile({ name: form.name, email: form.email, company: form.company })
      saveWorkspaceOnboardingDraft({
        company: form.company,
        packageName: form.packageName,
        team: form.team,
        systems: form.systems
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean),
        goal: form.goal,
        workspaceSlug: form.workspace_slug,
      })
      if (payload.generated_password) {
        setMessage(`Workspace created. Generated password: ${payload.generated_password}`)
      }
      if (payload.authenticated) {
        navigate('/app/onboarding?welcome=1', { replace: true })
        return
      }
      setError('Signup did not finish.')
    } catch {
      setError('Could not create the workspace on this host.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow={isClientTenant ? getTenantBrandLabel(tenant) : tenant.brandName}
        title={isClientTenant ? `Create the ${tenantLabel} workspace.` : 'Create the workspace.'}
        description={
          isClientTenant
            ? `Create the shared ${tenantLabel} workspace and bring managers, operators, and reviewers into the same system.`
            : 'Create one workspace and go straight into the saved app.'
        }
      />

      {shellOnly ? (
        <section className="grid gap-6 lg:grid-cols-[0.76fr_1.24fr]">
          <aside className="sm-terminal p-6">
            <p className="sm-kicker text-[var(--sm-accent)]">What you can do now</p>
            <div className="mt-5 grid gap-3">
              {['See live products', 'Review enterprise setup', 'Start rollout'].map((item) => (
                <div className="sm-chip text-white" key={item}>
                  {item}
                </div>
              ))}
            </div>
          </aside>
          <section className="sm-surface p-6">
            <p className="text-sm leading-relaxed text-[var(--sm-muted)]">Workspace signup is not live on this host yet. Use the public site now or book the rollout.</p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link className="sm-button-primary" to={isClientTenant ? '/receiving-log' : '/find-companies'}>
                {isClientTenant ? 'Open receiving queue' : 'Open Find Clients'}
              </Link>
              <Link className="sm-button-secondary" to="/contact">
                Request rollout
              </Link>
            </div>
          </section>
        </section>
      ) : handoffToApp ? (
        <section className="grid gap-6 lg:grid-cols-[0.76fr_1.24fr]">
          <aside className="sm-terminal p-6">
            <p className="sm-kicker text-[var(--sm-accent)]">What you get</p>
            <div className="mt-5 grid gap-3">
              {['Queues and approvals', 'Director review', 'Agent operations', 'History and audit'].map((item) => (
                <div className="sm-chip text-white" key={item}>
                  {item}
                </div>
              ))}
            </div>
          </aside>
          <section className="sm-surface p-6">
            <p className="text-sm leading-relaxed text-[var(--sm-muted)]">Workspace signup is on the live app host, not this static site.</p>
            <div className="mt-5 flex flex-wrap gap-3">
              <a className="sm-button-primary" href={appHref('/signup/')}>
                Create workspace
              </a>
              <a className="sm-button-secondary" href={appHref('/login/')}>
                Open workspace
              </a>
            </div>
            <div className="mt-4 sm-chip text-[var(--sm-muted)]">Live app host: {workspaceAppBase}</div>
          </section>
        </section>
      ) : (
        <section className="grid gap-6 lg:grid-cols-[0.82fr_1.18fr]">
          <aside className="sm-terminal p-6">
            <p className="sm-kicker text-[var(--sm-accent)]">What you get</p>
            <div className="mt-5 grid gap-3">
              {['Workspace onboarding', 'Queues and approvals', 'Connector setup', 'History and audit'].map((item) => (
                <div className="sm-chip text-white" key={item}>
                  {item}
                </div>
              ))}
            </div>
            <p className="mt-6 text-sm text-[var(--sm-muted)]">Keep the first rollout simple. One team and one workflow is enough.</p>
          </aside>

          <form className="sm-surface p-6" onSubmit={handleSubmit}>
            <div className="grid gap-4">
              <label className="grid gap-2 text-sm font-semibold text-[var(--sm-muted)]">
                Name
                <input className="sm-input" onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} required value={form.name} />
              </label>
              <label className="grid gap-2 text-sm font-semibold text-[var(--sm-muted)]">
                Work email
                <input className="sm-input" onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))} required type="email" value={form.email} />
              </label>
              <label className="grid gap-2 text-sm font-semibold text-[var(--sm-muted)]">
                Company
                <input className="sm-input" onChange={(event) => setForm((prev) => ({ ...prev, company: event.target.value }))} required value={form.company} />
              </label>
              <label className="grid gap-2 text-sm font-semibold text-[var(--sm-muted)]">
                Password
                <input
                  className="sm-input"
                  onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
                  placeholder="Choose a strong password"
                  required
                  type="password"
                  value={form.password}
                />
              </label>
              <label className="grid gap-2 text-sm font-semibold text-[var(--sm-muted)]">
                First package
                <select className="sm-input" onChange={(event) => setForm((prev) => ({ ...prev, packageName: event.target.value }))} value={form.packageName}>
                  {packageOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-2 text-sm font-semibold text-[var(--sm-muted)]">
                First team
                <select className="sm-input" onChange={(event) => setForm((prev) => ({ ...prev, team: event.target.value }))} value={form.team}>
                  {teamOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-2 text-sm font-semibold text-[var(--sm-muted)]">
                Current systems
                <input
                  className="sm-input"
                  onChange={(event) => setForm((prev) => ({ ...prev, systems: event.target.value }))}
                  placeholder="Gmail, Google Drive, ERP export, CSV"
                  value={form.systems}
                />
              </label>
              <label className="grid gap-2 text-sm font-semibold text-[var(--sm-muted)]">
                First workflow
                <textarea
                  className="sm-input min-h-28"
                  onChange={(event) => setForm((prev) => ({ ...prev, goal: event.target.value }))}
                  placeholder={isClientTenant ? 'For example: receiving, supplier follow-up, or quality incidents.' : 'For example: lead follow-up, approvals, receiving, or director updates.'}
                  value={form.goal}
                />
              </label>
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <button className="sm-button-primary" disabled={busy} type="submit">
                {busy ? 'Creating...' : 'Create workspace'}
              </button>
              <Link className="sm-button-secondary" to="/contact">
                Request rollout
              </Link>
              <Link className="sm-button-secondary" to="/login">
                Open workspace
              </Link>
            </div>

            {message ? <div className="mt-4 sm-chip text-white">{message}</div> : null}
            {error ? <div className="mt-4 sm-chip text-white">{error}</div> : null}
          </form>
        </section>
      )}
    </div>
  )
}
