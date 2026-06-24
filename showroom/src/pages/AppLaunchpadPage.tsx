import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import { getTenantBrandLabel, getTenantConfig } from '../lib/tenantConfig'
import { resolveTenantRoleExperience } from '../lib/tenantRoleExperience'
import { getCapabilityProfileForRole, getWorkspaceSession, sessionHasCapability, type WorkspaceCapability } from '../lib/workspaceApi'

type SessionPayload = Awaited<ReturnType<typeof getWorkspaceSession>>

type LaunchpadLink = {
  label: string
  to: string
  detail: string
  requires?: WorkspaceCapability[]
}

function hasAccess(session: SessionPayload['session'] | null | undefined, link: LaunchpadLink) {
  return !link.requires?.length || link.requires.some((capability) => sessionHasCapability(session, capability))
}

export function AppLaunchpadPage() {
  const tenant = getTenantConfig()
  const [loading, setLoading] = useState(true)
  const [sessionPayload, setSessionPayload] = useState<SessionPayload | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const nextSession = await getWorkspaceSession()
        if (!cancelled) {
          setSessionPayload(nextSession)
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

  const session = sessionPayload?.session ?? null
  const capabilityProfile = useMemo(() => getCapabilityProfileForRole(session?.role), [session?.role])
  const experience = useMemo(() => resolveTenantRoleExperience(tenant.key, session?.role), [session?.role, tenant.key])

  const links = useMemo(() => {
    const rows: LaunchpadLink[] = [
      {
        label: 'Open manager home',
        to: tenant.siteMode === 'client' ? '/app/portal' : experience.defaultHome,
        detail: 'Start with the simplest role-aware home before opening deeper control surfaces.',
      },
      {
        label: 'Open queue',
        to: '/app/actions',
        detail: 'Use the owned queue when the next concrete task matters more than the whole map.',
        requires: ['actions.view'],
      },
      {
        label: 'Open plant manager',
        to: '/app/plant-manager',
        detail: 'Use the plant-manager interface for daily review loops, industrial methods, and shift control.',
        requires: ['operations.view', 'dqms.view', 'maintenance.view', 'director.view', 'approvals.view', 'tenant_admin.view', 'platform_admin.view'],
      },
      {
        label: 'Open operations',
        to: '/app/operations',
        detail: 'Run plant blockers, cross-team actions, and day-of-execution issues.',
        requires: ['operations.view'],
      },
      {
        label: 'Open director',
        to: '/app/director',
        detail: 'Review risk, approvals, and company-level intervention points.',
        requires: ['director.view'],
      },
      {
        label: 'Open adoption',
        to: '/app/adoption-command',
        detail: 'See whether the team is using the system correctly and where training or UI changes are needed.',
        requires: ['actions.view'],
      },
      {
        label: 'Open workforce',
        to: '/app/workforce',
        detail: 'Review manager routines, assignments, and AI coworker coverage.',
        requires: ['actions.view'],
      },
      {
        label: 'Open service desk',
        to: '/app/service-desk',
        detail: 'Run the spa or service-retail front desk, daily checkout, and simple cash close in one view.',
        requires: ['sales.view', 'operations.view', 'director.view', 'tenant_admin.view', 'platform_admin.view'],
      },
      {
        label: 'Open data fabric',
        to: '/app/data-fabric',
        detail: 'Inspect source freshness, lineage, learning coverage, and role-specific stories.',
        requires: ['director.view', 'operations.view', 'sales.view', 'receiving.view', 'approvals.view', 'dqms.view', 'maintenance.view'],
      },
      {
        label: 'Open pilot log',
        to: '/app/pilot',
        detail: 'Record usability friction, bugs, and training issues while staff are using the system.',
        requires: ['actions.view'],
      },
      {
        label: 'Open cloud ops',
        to: '/app/cloud',
        detail: 'Use only when you are managing runtime, deployment, or agent execution posture.',
        requires: ['agent_ops.view', 'architect.view', 'director.view', 'tenant_admin.view', 'platform_admin.view'],
      },
      {
        label: 'Open workbench',
        to: '/app/workbench',
        detail: 'Use the control desk when strategy, architecture, and release sequencing need to stay aligned.',
        requires: ['agent_ops.view', 'architect.view', 'director.view', 'tenant_admin.view', 'platform_admin.view'],
      },
    ]

    return rows.filter((item) => hasAccess(session, item))
  }, [experience.defaultHome, session, tenant.siteMode])

  const primaryLinks = links.slice(0, 4)
  const supportingLinks = links.slice(4, 10)

  if (loading) {
    return <section className="sm-surface p-6 text-sm text-[var(--sm-muted)]">Opening the launchpad...</section>
  }

  return (
    <div className="space-y-8 pb-10">
      <PageIntro
        eyebrow={`${getTenantBrandLabel(tenant)} / Start`}
        title="Open the right desk quickly."
        description="Use this page as the simple route map: start with the role home, then open only the next surface that helps you operate or improve."
      />

      <section className="grid gap-4 md:grid-cols-3">
        <article className="sm-manager-stat">
          <p className="sm-kicker text-[var(--sm-accent)]">Role</p>
          <p className="mt-3 text-2xl font-bold text-white">{capabilityProfile.label}</p>
          <p className="mt-2 text-sm text-[var(--sm-muted)]">{capabilityProfile.summary}</p>
        </article>
        <article className="sm-manager-stat">
          <p className="sm-kicker text-[var(--sm-accent)]">Role home</p>
          <p className="mt-3 text-2xl font-bold text-white">{experience.title}</p>
          <p className="mt-2 text-sm text-[var(--sm-muted)]">{experience.mission}</p>
        </article>
        <article className="sm-manager-stat">
          <p className="sm-kicker text-[var(--sm-accent)]">Visible now</p>
          <p className="mt-3 text-2xl font-bold text-white">{links.length}</p>
          <p className="mt-2 text-sm text-[var(--sm-muted)]">Only the routes your current role should actually use are shown here.</p>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <article className="sm-calm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Start Here</p>
          <h2 className="mt-2 text-3xl font-bold text-white">Daily operating routes</h2>
          <div className="mt-6 grid gap-3">
            {primaryLinks.map((item) => (
              <Link className="sm-manager-action is-primary" key={item.to} to={item.to}>
                <div>
                  <p className="font-semibold text-white">{item.label}</p>
                  <p className="mt-2 text-sm text-[var(--sm-muted)]">{item.detail}</p>
                </div>
                <span className="sm-link">Open</span>
              </Link>
            ))}
          </div>
        </article>

        <article className="sm-calm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Support</p>
          <h2 className="mt-2 text-3xl font-bold text-white">Review, improve, and control</h2>
          <div className="mt-6 grid gap-3">
            {supportingLinks.map((item) => (
              <Link className="sm-manager-row" key={item.to} to={item.to}>
                <div>
                  <p className="font-semibold text-white">{item.label}</p>
                  <p className="mt-2 text-sm text-[var(--sm-muted)]">{item.detail}</p>
                </div>
                <span className="sm-link">Open</span>
              </Link>
            ))}
          </div>
        </article>
      </section>
    </div>
  )
}
