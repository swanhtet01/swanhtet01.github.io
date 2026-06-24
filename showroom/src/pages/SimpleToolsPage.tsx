import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import { canAccessPortalRoute } from '../lib/portalRouteAccess'
import {
  MANAGER_SIMPLE_BRIDGE_TOOLS,
  MANAGER_SIMPLE_COORDINATION_RULES,
  MANAGER_SIMPLE_FORM_BLUEPRINTS,
  MANAGER_SIMPLE_ISO_LOOPS,
  MANAGER_SIMPLE_WORKSPACES,
} from '../lib/managerSimpleToolsModel'
import { getTenantBrandLabel, getTenantConfig } from '../lib/tenantConfig'
import { getWorkspaceSession, sessionHasCapability } from '../lib/workspaceApi'

type SessionState = Awaited<ReturnType<typeof getWorkspaceSession>>['session']

const ALLOWED_CAPABILITIES = [
  'actions.view',
  'receiving.view',
  'approvals.view',
  'documents.view',
  'sales.view',
  'operations.view',
  'dqms.view',
  'maintenance.view',
  'director.view',
  'tenant_admin.view',
  'platform_admin.view',
] as const

function canOpenSimpleTools(session: SessionState | null | undefined) {
  return ALLOWED_CAPABILITIES.some((capability) => sessionHasCapability(session, capability))
}

export function SimpleToolsPage() {
  const tenant = getTenantConfig()
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState<SessionState | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const payload = await getWorkspaceSession()
        if (!cancelled) {
          setSession(payload.session ?? null)
          setError(null)
        }
      } catch (nextError) {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : 'Simple tools could not be loaded.')
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

  const visibleWorkspaces = useMemo(
    () => MANAGER_SIMPLE_WORKSPACES.filter((item) => canAccessPortalRoute(item.route, session)),
    [session],
  )
  const visibleBridges = useMemo(
    () => MANAGER_SIMPLE_BRIDGE_TOOLS.filter((item) => canAccessPortalRoute(item.route, session) || item.route === '/app/simple-tools'),
    [session],
  )
  const visibleFormBlueprints = useMemo(
    () => MANAGER_SIMPLE_FORM_BLUEPRINTS.filter((item) => canAccessPortalRoute(item.route, session)),
    [session],
  )
  const visibleIsoLoops = useMemo(
    () => MANAGER_SIMPLE_ISO_LOOPS.filter((item) => canAccessPortalRoute(item.route, session)),
    [session],
  )

  if (loading) {
    return <section className="sm-surface p-6 text-sm text-[var(--sm-muted)]">Opening simple tools...</section>
  }

  if (!canOpenSimpleTools(session)) {
    return (
      <div className="space-y-6">
        <PageIntro
          eyebrow={`${getTenantBrandLabel(tenant)} / Simple tools`}
          title="Simple tools are role-based."
          description="This page is for manager, plant, quality, maintenance, receiving, sales, and tenant-control roles."
        />
        <section className="sm-calm-surface p-6">
          <p className="text-sm text-[var(--sm-muted)]">
            Sign in with a manager or plant-control role to open the simple rollout stack.
          </p>
          <div className="mt-4">
            <Link className="sm-button-primary" to="/login?next=/app/simple-tools">
              Open login
            </Link>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="space-y-8 pb-10">
      <PageIntro
        eyebrow={`${getTenantBrandLabel(tenant)} / Simple tools`}
        title="Simple tools."
        description="Two workspaces, a small set of forms, and hidden ISO behind the work. Use this page to keep the rollout easy enough for any manager to follow."
      />

      <section className="sm-calm-surface flex flex-col gap-4 p-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <p className="sm-kicker text-[var(--sm-accent)]">Rollout rule</p>
          <h2 className="text-3xl font-bold text-white">Keep the first system small enough to use every day.</h2>
          <p className="max-w-3xl text-sm leading-relaxed text-[var(--sm-muted)]">
            Start with Manager Workspace for most people. Use Plant Manager only for plant-wide review. Use AppSheet only as a bridge when devices or training are still weak.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link className="sm-button-primary" to="/app/manager-system">
            Open manager workspace
          </Link>
          <Link className="sm-button-secondary" to="/app/daily-entry">
            Open daily entry
          </Link>
          <Link className="sm-button-secondary" to="/app/plant-manager">
            Open plant manager
          </Link>
        </div>
      </section>

      {error ? <section className="sm-calm-surface p-4 text-sm text-amber-300">{error}</section> : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {MANAGER_SIMPLE_COORDINATION_RULES.map((item, index) => (
          <article className="sm-manager-stat" key={item}>
            <p className="sm-kicker text-[var(--sm-accent)]">Rule {index + 1}</p>
            <p className="mt-3 text-lg font-semibold text-white">{item}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.96fr_1.04fr]">
        <article className="sm-calm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Main workspaces</p>
          <h2 className="mt-2 text-3xl font-bold text-white">Start with only two homes.</h2>
          <div className="mt-6 grid gap-3">
            {visibleWorkspaces.map((workspace) => (
              <Link className="sm-manager-row" key={workspace.id} to={workspace.route}>
                <div>
                  <p className="font-semibold text-white">{workspace.title}</p>
                  <p className="mt-2 text-sm text-white/84">{workspace.purpose}</p>
                  <p className="mt-2 text-sm text-[var(--sm-muted)]">Who uses it: {workspace.users}</p>
                  <p className="mt-2 text-sm text-[var(--sm-muted)]">{workspace.rule}</p>
                </div>
                <span className="sm-link">Open</span>
              </Link>
            ))}
          </div>
        </article>

        <article className="sm-calm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Bridge stack</p>
          <h2 className="mt-2 text-3xl font-bold text-white">Portal first. AppSheet second. Google Forms last.</h2>
          <div className="mt-6 grid gap-3">
            {visibleBridges.map((item) => (
              <article className="sm-manager-method" key={item.id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-white">{item.title}</p>
                    <p className="mt-2 text-sm text-[var(--sm-muted)]">{item.whenToUse}</p>
                  </div>
                  <span className="sm-status-pill">{item.recommendation}</span>
                </div>
                <p className="mt-4 text-sm text-white/84">{item.whyItWorks}</p>
                <div className="mt-4">
                  <Link className="sm-link" to={item.route}>
                    Open route
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="sm-calm-surface p-6">
        <p className="sm-kicker text-[var(--sm-accent)]">Manager entry forms</p>
        <h2 className="mt-2 text-3xl font-bold text-white">If you build an AppSheet bridge, copy these forms.</h2>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[var(--sm-muted)]">
          Keep the fields short. Every AppSheet or Google Form should feed the same review logic: one record, one owner, one due window, one evidence link.
        </p>
        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          {visibleFormBlueprints.map((blueprint) => (
            <article className="sm-proof-card" key={blueprint.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-2xl font-bold text-white">{blueprint.title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{blueprint.goal}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="sm-status-pill">{blueprint.ownerDesk}</span>
                  <span className="sm-status-pill">{blueprint.appsheetTable}</span>
                </div>
              </div>
              <div className="mt-5 grid gap-2">
                {blueprint.keyFields.map((field) => (
                  <div className="sm-manager-rule" key={field}>
                    <span className="sm-led text-[var(--sm-accent)]" />
                    <p className="text-sm text-white/84">{field}</p>
                  </div>
                ))}
              </div>
              <div className="mt-5">
                <Link className="sm-link" to={blueprint.route}>
                  Open owning route
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.02fr_0.98fr]">
        <article className="sm-calm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Invisible ISO</p>
          <h2 className="mt-2 text-3xl font-bold text-white">Managers should not need to say “ISO” every time.</h2>
          <div className="mt-6 grid gap-3">
            {visibleIsoLoops.map((loop) => (
              <Link className="sm-manager-row" key={loop.id} to={loop.route}>
                <div>
                  <p className="font-semibold text-white">{loop.title}</p>
                  <p className="mt-2 text-sm text-white/84">{loop.managerMove}</p>
                  <p className="mt-2 text-sm text-[var(--sm-muted)]">Hidden standard: {loop.hiddenStandard}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {loop.records.map((record) => (
                      <span className="sm-status-pill" key={record}>
                        {record}
                      </span>
                    ))}
                  </div>
                </div>
                <span className="sm-link">Open</span>
              </Link>
            ))}
          </div>
        </article>

        <article className="sm-calm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">What to teach first</p>
          <h2 className="mt-2 text-3xl font-bold text-white">Teach this in order.</h2>
          <div className="mt-6 grid gap-3">
            {[
              'How to sign in and open Manager Workspace.',
              'How to save one Daily Entry record with the right owner.',
              'How to paste a messy update into Action Board.',
              'How to hand document changes and audit findings into the same loop.',
              'How to escalate into Plant Manager only when the issue becomes cross-functional.',
            ].map((item, index) => (
              <div className="sm-manager-rule" key={item}>
                <span className="sm-manager-rule-index">{index + 1}</span>
                <p className="text-sm text-white/90">{item}</p>
              </div>
            ))}
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link className="sm-button-secondary" to="/app/manager-sops">
              Open manager SOPs
            </Link>
            <Link className="sm-button-secondary" to="/app/invisible-iso">
              Open Invisible ISO
            </Link>
          </div>
        </article>
      </section>
    </div>
  )
}
