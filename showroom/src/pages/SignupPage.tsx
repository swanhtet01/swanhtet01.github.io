import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import {
  CLIENT_BUILD_MODULES,
  CLIENT_INDUSTRY_KITS,
  buildClientBuildPlan,
  createDefaultClientBuildSpec,
  type ClientBuildSpec,
  type ClientIndustryKitId,
} from '../lib/clientBuildPlanner'
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
  workspace_slug: string
}

type SetupPreset = {
  id: string
  label: string
  summary: string
  packageName: string
  team: string
}

const platformSetupPresets: readonly SetupPreset[] = [
  {
    id: 'sales',
    label: 'Sales first',
    summary: 'Start with pipeline, account follow-up, and leadership review.',
    packageName: 'Revenue System Package',
    team: 'Sales',
  },
  {
    id: 'operations',
    label: 'Operations first',
    summary: 'Start with approvals, receiving issues, and daily exceptions.',
    packageName: 'Operations Control Package',
    team: 'Operations',
  },
  {
    id: 'quality',
    label: 'Quality first',
    summary: 'Start with DQMS, incidents, containment, and manager review.',
    packageName: 'Industrial Quality Package',
    team: 'Quality',
  },
] as const

const clientSetupPresets: readonly SetupPreset[] = [
  {
    id: 'manager',
    label: 'Plant manager',
    summary: 'Start with one manager home and one daily review loop.',
    packageName: 'Portal Network Package',
    team: 'Operations',
  },
  {
    id: 'operations',
    label: 'Factory Operations App',
    summary: 'Start with receiving, shift blockers, and owned actions.',
    packageName: 'Operations Control Package',
    team: 'Operations',
  },
  {
    id: 'quality',
    label: 'Quality desk',
    summary: 'Start with incidents, containment, and closeout.',
    packageName: 'Industrial Quality Package',
    team: 'Quality',
  },
] as const

function firstPreset(isClientTenant: boolean) {
  return (isClientTenant ? clientSetupPresets : platformSetupPresets)[0]
}

export function SignupPage() {
  const navigate = useNavigate()
  const tenant = getTenantConfig()
  const isClientTenant = tenant.key !== 'default'
  const tenantLabel = getTenantLabel(tenant) || tenant.defaultCompany || 'workspace'
  const setupPresets = isClientTenant ? clientSetupPresets : platformSetupPresets
  const initialPreset = firstPreset(isClientTenant)
  const [selectedPresetId, setSelectedPresetId] = useState(initialPreset.id)
  const [form, setForm] = useState<SignupPayload>({
    name: '',
    email: '',
    company: tenant.defaultCompany ?? '',
    password: '',
    workspace_slug: tenant.defaultWorkspaceSlug ?? '',
  })
  const [buildSpec, setBuildSpec] = useState<ClientBuildSpec>(() => ({
    ...createDefaultClientBuildSpec(tenant.defaultCompany ?? ''),
    industryKit: isClientTenant ? 'industrial' : 'custom',
  }))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const handoffToApp = needsLiveAppHandoff()
  const shellOnly = publicShellOnly()
  const selectedPreset = setupPresets.find((item) => item.id === selectedPresetId) ?? initialPreset
  const buildPlan = useMemo(() => buildClientBuildPlan({ ...buildSpec, company: form.company }), [buildSpec, form.company])
  const buildModuleOptions = CLIENT_BUILD_MODULES.filter((module) => module.kit === 'shared' || module.kit === buildSpec.industryKit)
  const liveSetupHref = appHref('/setup/', '/contact')

  useEffect(() => {
    if (!handoffToApp || typeof window === 'undefined') {
      return
    }

    const redirectTimer = window.setTimeout(() => {
      window.location.replace(liveSetupHref)
    }, 120)

    return () => {
      window.clearTimeout(redirectTimer)
    }
  }, [handoffToApp, liveSetupHref])

  function applyPreset(preset: SetupPreset) {
    setSelectedPresetId(preset.id)
  }

  function updateBuildSpec(patch: Partial<ClientBuildSpec>) {
    setBuildSpec((prev) => ({ ...prev, ...patch }))
  }

  function toggleBuildModule(moduleId: string) {
    setBuildSpec((prev) => ({
      ...prev,
      selectedModuleIds: prev.selectedModuleIds.includes(moduleId)
        ? prev.selectedModuleIds.filter((id) => id !== moduleId)
        : [...prev.selectedModuleIds, moduleId],
    }))
  }

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
          package_name: buildPlan.packageName || selectedPreset.packageName,
          first_team: buildPlan.firstTeam || selectedPreset.team,
          current_systems: buildPlan.currentSystems,
          goal: buildPlan.goal,
          workspace_slug: form.workspace_slug,
        }),
      })
      savePublicWorkspaceProfile({ name: form.name, email: form.email, company: form.company })
      saveWorkspaceOnboardingDraft({
        company: form.company,
        packageName: buildPlan.packageName || selectedPreset.packageName,
        team: buildPlan.firstTeam || selectedPreset.team,
        systems: buildPlan.currentSystems,
        goal: buildPlan.goal,
        workspaceSlug: form.workspace_slug,
      })
      if (payload.generated_password) {
        setMessage(`Workspace created. Temporary password: ${payload.generated_password}`)
      }
      if (payload.authenticated) {
        navigate('/app/onboarding?welcome=1', { replace: true })
        return
      }
      setError('Workspace setup did not finish.')
    } catch {
      setError('Could not create the workspace on this host.')
    } finally {
      setBusy(false)
    }
  }

  if (shellOnly) {
    return (
      <div className="space-y-8">
        <PageIntro
          eyebrow={isClientTenant ? getTenantBrandLabel(tenant) : tenant.brandName}
          title={isClientTenant ? `Set up ${tenantLabel} on the live workspace host.` : 'Set up the workspace on the live host.'}
          description="This host is the public shell. Setup, saved users, and writeback live on the workspace app host."
        />

        <section className="mx-auto grid max-w-4xl gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <aside className="sm-proof-card">
            <p className="sm-kicker text-[var(--sm-accent)]">What setup should do</p>
            <div className="mt-5 grid gap-3">
              {['Pick one first team.', 'Turn on only the first useful desk.', 'Invite the first managers before expanding.'].map((item, index) => (
                <div className="sm-manager-rule" key={item}>
                  <span className="sm-manager-rule-index">{index + 1}</span>
                  <p className="text-sm text-white/92">{item}</p>
                </div>
              ))}
            </div>
          </aside>

          <section className="sm-proof-card">
            <p className="sm-kicker text-[var(--sm-accent-alt)]">Next step</p>
            <h2 className="mt-2 text-3xl font-bold text-white">Use the public site to review products. Use the live app for setup.</h2>
            <p className="mt-4 text-sm leading-relaxed text-[var(--sm-muted)]">
              If you need a real workspace, open the live host. If you are still evaluating the system, stay on the public product pages.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link className="sm-button-primary" to="/products">
                See products
              </Link>
              <Link className="sm-button-secondary" to="/contact">
                Request rollout
              </Link>
            </div>
          </section>
        </section>
      </div>
    )
  }

  if (handoffToApp) {
    return (
      <div className="space-y-6">
        <PageIntro
          eyebrow={isClientTenant ? getTenantBrandLabel(tenant) : tenant.brandName}
          title={isClientTenant ? `Opening setup for ${tenantLabel}.` : 'Opening the live setup flow.'}
          description="Redirecting you to the real app host so setup happens in one place."
        />

        <section className="mx-auto max-w-2xl sm-proof-card">
          <p className="sm-kicker text-[var(--sm-accent)]">Redirecting now</p>
          <h2 className="mt-2 text-3xl font-bold text-white">One setup path.</h2>
          <p className="mt-4 text-sm leading-relaxed text-[var(--sm-muted)]">
            If the redirect does not fire automatically, open the live setup flow directly. The live app host is <strong className="text-white">{workspaceAppBase}</strong>.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <a className="sm-button-primary" href={liveSetupHref}>
              Continue
            </a>
            <Link className="sm-button-secondary" to="/products">
              Stay on public site
            </Link>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow={isClientTenant ? getTenantBrandLabel(tenant) : tenant.brandName}
        title={isClientTenant ? `Set up ${tenantLabel}.` : 'Set up one working workspace.'}
        description={isClientTenant ? `Start with one role home and one first desk for ${tenantLabel}.` : 'Create one workspace for the first team.'}
      />

      <section className="mx-auto max-w-3xl">
        <form className="sm-calm-surface p-6" onSubmit={handleSubmit}>
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Workspace setup</p>
          <h2 className="mt-2 text-3xl font-bold text-white">Create one working workspace.</h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)]">Pick the first lane. Keep the first release narrow.</p>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
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
              <input
                className="sm-input"
                onChange={(event) => {
                  setForm((prev) => ({ ...prev, company: event.target.value }))
                  updateBuildSpec({ company: event.target.value })
                }}
                required
                value={form.company}
              />
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
              Starting lane
              <select
                className="sm-input"
                onChange={(event) => {
                  const preset = setupPresets.find((item) => item.id === event.target.value) ?? initialPreset
                  applyPreset(preset)
                }}
                value={selectedPresetId}
              >
                {setupPresets.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid gap-2 text-sm font-semibold text-[var(--sm-muted)]">
              First team
              <div className="sm-chip text-white">{buildPlan.firstTeam || selectedPreset.team}</div>
            </div>
            <label className="grid gap-2 text-sm font-semibold text-[var(--sm-muted)] md:col-span-2">
              Workspace slug
              <input
                className="sm-input"
                onChange={(event) => setForm((prev) => ({ ...prev, workspace_slug: event.target.value }))}
                placeholder="Optional custom slug"
                value={form.workspace_slug}
              />
            </label>
          </div>

          <div className="mt-6 rounded-[1.5rem] border border-white/12 bg-white/[0.04] p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="sm-kicker text-[var(--sm-accent)]">Client build brief</p>
                <h3 className="mt-2 text-2xl font-bold text-white">What should this portal become?</h3>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)]">
                  This creates the first build brief, not just an empty account. Keep it narrow enough to ship.
                </p>
              </div>
              <span className="sm-chip text-white">{buildPlan.packageName}</span>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <label className="grid gap-2 text-sm font-semibold text-[var(--sm-muted)]">
                Portal type
                <select
                  className="sm-input"
                  onChange={(event) =>
                    updateBuildSpec({
                      industryKit: event.target.value as ClientIndustryKitId,
                      selectedModuleIds: [],
                    })
                  }
                  value={buildSpec.industryKit}
                >
                  {CLIENT_INDUSTRY_KITS.map((kit) => (
                    <option key={kit.id} value={kit.id}>
                      {kit.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-2 text-sm font-semibold text-[var(--sm-muted)]">
                First roles
                <input
                  className="sm-input"
                  onChange={(event) => updateBuildSpec({ roles: event.target.value })}
                  placeholder="Owner, operations, sales, manager"
                  value={buildSpec.roles}
                />
              </label>
              <label className="grid gap-2 text-sm font-semibold text-[var(--sm-muted)] md:col-span-2">
                Existing systems
                <input
                  className="sm-input"
                  onChange={(event) => updateBuildSpec({ currentSystems: event.target.value })}
                  placeholder="Gmail, Drive, Sheets, POS, ERP, WhatsApp, PDFs"
                  value={buildSpec.currentSystems}
                />
              </label>
              <label className="grid gap-2 text-sm font-semibold text-[var(--sm-muted)] md:col-span-2">
                Source files and inputs
                <textarea
                  className="sm-input min-h-20"
                  onChange={(event) => updateBuildSpec({ sourceInputs: event.target.value })}
                  placeholder="Menu images, QC sheets, sales exports, supplier emails, invoices, daily reports"
                  value={buildSpec.sourceInputs}
                />
              </label>
              <label className="grid gap-2 text-sm font-semibold text-[var(--sm-muted)] md:col-span-2">
                Workflow to replace first
                <textarea
                  className="sm-input min-h-24"
                  onChange={(event) => updateBuildSpec({ workflowPain: event.target.value })}
                  placeholder="Example: every morning the manager checks three sheets and WhatsApp to find open supplier issues, then sends an owner summary."
                  value={buildSpec.workflowPain}
                />
              </label>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {buildModuleOptions.map((module) => (
                <label className="rounded-[1rem] border border-white/12 bg-black/10 p-3 text-sm leading-relaxed text-[var(--sm-muted)]" key={module.id}>
                  <span className="flex items-start gap-3">
                    <input checked={buildSpec.selectedModuleIds.includes(module.id)} className="mt-1" onChange={() => toggleBuildModule(module.id)} type="checkbox" />
                    <span>
                      <strong className="block text-white">{module.name}</strong>
                      <span className="block text-xs">{module.sellAs} | {module.kpi}</span>
                    </span>
                  </span>
                </label>
              ))}
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-3">
              {buildPlan.recommendedModules.slice(0, 3).map((module) => (
                <div className="sm-manager-rule" key={module.id}>
                  <span className="sm-manager-rule-index">{module.department.slice(0, 2).toUpperCase()}</span>
                  <p className="text-sm text-white/90">{module.name}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <button className="sm-button-primary" disabled={busy} type="submit">
              {busy ? 'Creating...' : 'Create workspace'}
            </button>
            <Link className="sm-button-secondary" to="/login">
              Use existing workspace
            </Link>
          </div>

          {message ? <div className="mt-4 sm-chip text-white">{message}</div> : null}
          {error ? <div className="mt-4 sm-chip text-white">{error}</div> : null}
        </form>
      </section>
    </div>
  )
}
