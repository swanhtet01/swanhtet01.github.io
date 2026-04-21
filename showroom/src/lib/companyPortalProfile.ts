import type { TenantConfig } from './tenantConfig'
import type { TenantRoleExperience } from './tenantRoleExperience'

type SessionLike = {
  workspace_name?: string
  role?: string
}

export type PortalKnowledgePack = {
  title: string
  detail: string
  bullets: string[]
}

export type PortalToolCard = {
  title: string
  detail: string
  to: string
  kind: 'core' | 'support' | 'meta'
}

export type CompanyPortalProfile = {
  companyName: string
  industryLabel: string
  operatingModelLabel: string
  workspacePromise: string
  companySummary: string
  operatorRule: string
  todayPrompt: string
  metaTools: PortalToolCard[]
  coreApps: PortalToolCard[]
  supportApps: PortalToolCard[]
  knowledgePacks: PortalKnowledgePack[]
}

function uniqueTools(rows: PortalToolCard[]) {
  const seen = new Set<string>()
  return rows.filter((row) => {
    if (seen.has(row.to)) {
      return false
    }
    seen.add(row.to)
    return true
  })
}

function buildDefaultProfile(
  tenant: TenantConfig,
  experience: TenantRoleExperience,
  session: SessionLike | null | undefined,
): CompanyPortalProfile {
  const companyName = String(session?.workspace_name || tenant.defaultCompany || tenant.brandName).trim() || tenant.brandName
  const coreApps = uniqueTools(
    experience.sections.slice(0, 5).map((section) => ({
      title: section.title,
      detail: section.detail,
      to: section.route,
      kind: 'core' as const,
    })),
  )
  const supportApps = uniqueTools([
    { title: 'My Queue', detail: 'See the next owned action without opening the whole platform.', to: '/app/actions', kind: 'support' as const },
    { title: 'Documents', detail: 'Keep files, notes, and evidence on the same operating record.', to: '/app/documents', kind: 'support' as const },
    { title: 'Knowledge', detail: 'Store playbooks, SOPs, prompts, and shared operating memory.', to: '/app/knowledge', kind: 'support' as const },
    ...tenant.toolCards.slice(0, 2).map((card) => ({
      title: card.title,
      detail: card.detail,
      to: card.to,
      kind: 'support' as const,
    })),
  ])
  const metaTools = uniqueTools([
    { title: 'Portal Manager', detail: 'Adjust roles, modules, and the company operating shell.', to: '/app/platform-admin', kind: 'meta' as const },
    { title: 'Connector Control', detail: 'Link Gmail, Drive, ERP, web, and other company sources.', to: '/app/connectors', kind: 'meta' as const },
    { title: 'Workforce Manager', detail: 'Assign work, run review cycles, and keep AI support lanes active.', to: '/app/workforce', kind: 'meta' as const },
    { title: 'Cloud and Runtime', detail: 'Keep deploy, runtime, queues, and agent posture stable.', to: '/app/cloud', kind: 'meta' as const },
  ])

  return {
    companyName,
    industryLabel: tenant.siteMode === 'client' ? 'Industry workspace' : 'Cross-functional enterprise workspace',
    operatingModelLabel: 'AI-native company portal',
    workspacePromise: `A custom workspace for ${companyName} where each employee sees the right desk, the right context, and the right next action.`,
    companySummary:
      'This portal should feel like one operating system for the company, not a bundle of separate SaaS tabs. Each desk carries the company memory, role rules, and source data it actually needs.',
    operatorRule: 'Every action should live on one company record with an owner, a next step, and the evidence beside it.',
    todayPrompt: `Start from ${experience.sections[0]?.title || 'the main desk'}, then expand only when the first queue is clean.`,
    coreApps,
    supportApps,
    metaTools,
    knowledgePacks: [
      {
        title: 'Company memory',
        detail: 'The portal should retain how this company works so people do not restart from scratch every day.',
        bullets: [
          'Role home, queue rules, and escalation path stay visible.',
          'Key accounts, projects, suppliers, and incidents keep their history.',
          'Prompts, SOPs, and reusable decisions sit next to the work.',
        ],
      },
      {
        title: 'Domain context',
        detail: 'The workspace should be customized for the company and industry, not remain generic platform copy.',
        bullets: [
          'Industry language appears in desk labels, knowledge, and forms.',
          'Modules reflect the actual workflow sequence for the company.',
          'Connected data is mapped to the teams that consume it.',
        ],
      },
      {
        title: 'Expansion logic',
        detail: 'The system grows only after the current lane is useful and trusted.',
        bullets: [
          'Start with one working desk.',
          'Add support apps only when they reduce side-channel work.',
          'Add meta tools after the company team is using the portal daily.',
        ],
      },
    ],
  }
}

function buildYangonTyreProfile(
  tenant: TenantConfig,
  experience: TenantRoleExperience,
  session: SessionLike | null | undefined,
): CompanyPortalProfile {
  const companyName = String(session?.workspace_name || tenant.tenantName || tenant.defaultCompany || 'Yangon Tyre').trim() || 'Yangon Tyre'
  const coreApps = uniqueTools([
    { title: 'Operations Desk', detail: 'Run plant blockers, shift handoff, and shared actions.', to: '/app/operations', kind: 'core' as const },
    { title: 'Receiving Desk', detail: 'Track GRN gaps, inbound holds, and supplier evidence.', to: '/app/receiving', kind: 'core' as const },
    { title: 'DQMS Desk', detail: 'Handle incidents, CAPA, release, and quality recurrence.', to: '/app/dqms', kind: 'core' as const },
    { title: 'Maintenance Desk', detail: 'Watch downtime, PM work, repeat failures, and spare blockers.', to: '/app/maintenance', kind: 'core' as const },
    { title: 'Director Desk', detail: 'Review plant risk, approvals, and cross-team decisions.', to: '/app/director', kind: 'core' as const },
    ...experience.sections.slice(0, 2).map((section) => ({
      title: section.title,
      detail: section.detail,
      to: section.route,
      kind: 'core' as const,
    })),
  ])
  const supportApps = uniqueTools([
    { title: 'Approvals', detail: 'Clear supplier, finance, and release decisions before they block work.', to: '/app/approvals', kind: 'support' as const },
    { title: 'Documents', detail: 'Keep COA, GRN, invoice, and evidence linked to the same case.', to: '/app/documents', kind: 'support' as const },
    { title: 'Data Fabric', detail: 'See how Drive, ERP, mail, and portal writeback feed the same tenant memory.', to: '/app/data-fabric', kind: 'support' as const },
    { title: 'My Queue', detail: 'Keep owned actions visible without bouncing between desks.', to: '/app/actions', kind: 'support' as const },
  ])
  const metaTools = uniqueTools([
    { title: 'Adoption Command', detail: 'Score whether the plant is actually using the portal as the operating system.', to: '/app/adoption-command', kind: 'meta' as const },
    { title: 'Workforce Manager', detail: 'Assign tasks, review routines, and AI support lanes for each plant role.', to: '/app/workforce', kind: 'meta' as const },
    { title: 'Connector Control', detail: 'Control Gmail, Drive, ERP exports, and shopfloor feeds.', to: '/app/connectors', kind: 'meta' as const },
    { title: 'Platform Admin', detail: 'Manage modules, roles, rollout posture, and tenant controls.', to: '/app/platform-admin', kind: 'meta' as const },
  ])

  return {
    companyName,
    industryLabel: 'Tyre manufacturing',
    operatingModelLabel: 'Manufacturing command portal',
    workspacePromise: `A role-based operating portal for ${companyName} where plant, quality, maintenance, commercial, and management teams share the same records.`,
    companySummary:
      'Yangon Tyre needs one calmer system for plant execution: receiving, production, quality, maintenance, and director review should stay connected instead of splitting into chats, sheets, and disconnected tools.',
    operatorRule: 'Capture the issue where it happens, keep the evidence attached, and review the next move inside the portal.',
    todayPrompt: `Open ${experience.sections[0]?.title || 'the main desk'} and keep the day grounded in the live plant queue.`,
    coreApps,
    supportApps,
    metaTools,
    knowledgePacks: [
      {
        title: 'Plant operating context',
        detail: 'The portal should speak the factory language and keep the plant sequence clear.',
        bullets: [
          'Receiving, curing, quality, maintenance, and release are part of one operating chain.',
          'B+R, downtime, GRN, CAPA, and release decisions should stay visible at the desk level.',
          'Every desk should show what the next team in the flow needs.',
        ],
      },
      {
        title: 'Role-specific memory',
        detail: 'Each employee should see the context that belongs to their actual work.',
        bullets: [
          'Receiving sees supplier evidence, GRN pressure, and next release step.',
          'Quality sees incidents, CAPA, root cause, and repeat defect history.',
          'Management sees cross-team blockers, decisions, and operating drift.',
        ],
      },
      {
        title: 'Expansion logic',
        detail: 'Grow from plant usefulness, not from feature count.',
        bullets: [
          'Keep the first plant desks stable and trusted.',
          'Add AI support to routine reviews and evidence capture next.',
          'Expand deeper analytics only after writeback and role usage are working.',
        ],
      },
    ],
  }
}

export function resolveCompanyPortalProfile(
  tenant: TenantConfig,
  experience: TenantRoleExperience,
  session: SessionLike | null | undefined,
): CompanyPortalProfile {
  if (tenant.key === 'ytf-plant-a') {
    return buildYangonTyreProfile(tenant, experience, session)
  }
  return buildDefaultProfile(tenant, experience, session)
}
