import type { PosBenchmarkItem } from './posBenchmarkBacklog'
import type { PosBusinessType, PosModuleId, PosSession, PosUserRole } from './posAuth'
import type { PosEnterpriseReadinessItem } from './posEnterpriseChecklist'
import type { PosReferenceRepo } from './posReferenceRepos'
import type { PosStaffMember } from './posStaffDirectory'

export type PosDeploymentEnvironment = 'pilot' | 'staging' | 'production'
export type PosDeploymentGateStatus = 'ready' | 'review' | 'blocked'

export type PosDeploymentGate = {
  id: string
  title: string
  owner: string
  status: PosDeploymentGateStatus
  detail: string
}

export type PosClientDeploymentPack = {
  generatedAt: string
  companyName: string
  workspaceSlug: string
  businessType: PosBusinessType
  environment: PosDeploymentEnvironment
  releaseOwner: string
  versionTag: string
  workspaceUrl: string
  locations: Array<{
    id: string
    label: string
    status: string
    timezone: string
    currency: string
  }>
  roles: PosUserRole[]
  modules: Array<{ id: PosModuleId; label: string }>
  staffSummary: {
    total: number
    active: number
    suspended: number
  }
  readinessSummary: {
    live: number
    build: number
    missing: number
  }
  benchmarkSummary: {
    live: number
    build: number
    missing: number
  }
  gates: PosDeploymentGate[]
  nextActions: string[]
  smoke: {
    local: string
    live: string
  }
  references: Array<{ name: string; source: string; url: string }>
}

export type BuildPosDeploymentPackInput = {
  session: PosSession
  businessType: PosBusinessType
  environment: PosDeploymentEnvironment
  releaseOwner: string
  versionTag: string
  workspaceUrl: string
  roles: PosUserRole[]
  moduleIds: PosModuleId[]
  moduleLabels: Partial<Record<PosModuleId, string>>
  staffDirectory: PosStaffMember[]
  canExportExcel: boolean
  canExportJson: boolean
  managerOverrideHint: string
  enterpriseChecklist: PosEnterpriseReadinessItem[]
  benchmarkBacklog: PosBenchmarkItem[]
  referenceRepos: PosReferenceRepo[]
}

function hasRole(roles: PosUserRole[], role: PosUserRole) {
  return roles.includes(role)
}

function staffSummary(staffDirectory: PosStaffMember[]) {
  const active = staffDirectory.filter((member) => member.status === 'active').length
  const suspended = staffDirectory.filter((member) => member.status === 'suspended').length
  return {
    total: staffDirectory.length,
    active,
    suspended,
  }
}

function readinessSummary(items: PosEnterpriseReadinessItem[]) {
  return items.reduce(
    (summary, item) => {
      summary[item.status] += 1
      return summary
    },
    { live: 0, build: 0, missing: 0 },
  )
}

function benchmarkSummary(items: PosBenchmarkItem[]) {
  return items.reduce(
    (summary, item) => {
      summary[item.status] += 1
      return summary
    },
    { live: 0, build: 0, missing: 0 },
  )
}

function buildDeploymentGates(input: BuildPosDeploymentPackInput) {
  const readiness = readinessSummary(input.enterpriseChecklist)
  const benchmark = benchmarkSummary(input.benchmarkBacklog)
  const staff = staffSummary(input.staffDirectory)
  const hasOwner = hasRole(input.roles, 'owner')
  const hasManager = hasRole(input.roles, 'manager')
  const hasOperatorRole = input.roles.some((role) => !['owner', 'manager', 'auditor'].includes(role))
  const exportsReady = input.canExportExcel && input.canExportJson
  const production = input.environment === 'production'

  const gates: PosDeploymentGate[] = [
    {
      id: 'identity-role-coverage',
      title: 'Identity and role coverage',
      owner: 'Platform admin',
      status: hasOwner && hasManager && hasOperatorRole ? 'ready' : production ? 'blocked' : 'review',
      detail: hasOwner && hasManager && hasOperatorRole
        ? 'Owner, manager, and operator role paths are configured.'
        : 'Missing owner/manager/operator role path for rollout.',
    },
    {
      id: 'evidence-export-readiness',
      title: 'Evidence export readiness',
      owner: 'Manager',
      status: exportsReady ? 'ready' : production ? 'blocked' : 'review',
      detail: exportsReady
        ? 'Excel + JSON exports are enabled for proof-pack handoff.'
        : 'Enable both Excel and JSON exports before production handoff.',
    },
    {
      id: 'staff-security-readiness',
      title: 'Staff security readiness',
      owner: 'Owner / operations lead',
      status: staff.active >= 2 ? 'ready' : production ? 'blocked' : 'review',
      detail: staff.active >= 2
        ? `Active staff profiles: ${staff.active}.`
        : `Only ${staff.active} active staff profile(s); add at least two before production.`,
    },
    {
      id: 'enterprise-control-readiness',
      title: 'Enterprise control readiness',
      owner: 'Owner',
      status: readiness.missing === 0 ? (readiness.build > 0 ? 'review' : 'ready') : production ? 'blocked' : 'review',
      detail: readiness.missing === 0
        ? `Checklist status live:${readiness.live} build:${readiness.build} missing:${readiness.missing}.`
        : `${readiness.missing} enterprise control(s) still missing.`,
    },
    {
      id: 'benchmark-gap-closure',
      title: 'Benchmark gap closure',
      owner: 'Product lead',
      status: benchmark.missing === 0 ? (benchmark.build > 0 ? 'review' : 'ready') : 'review',
      detail: benchmark.missing === 0
        ? `Benchmark status live:${benchmark.live} build:${benchmark.build} missing:${benchmark.missing}.`
        : `${benchmark.missing} benchmark capability gap(s) remain.`,
    },
    {
      id: 'manager-override-policy',
      title: 'Manager override policy',
      owner: 'Manager',
      status: input.managerOverrideHint ? 'ready' : production ? 'blocked' : 'review',
      detail: input.managerOverrideHint
        ? 'Override policy present for sensitive actions.'
        : 'Missing manager override PIN policy.',
    },
    {
      id: 'smoke-test-gate',
      title: 'Smoke and UAT gate',
      owner: 'QA lead',
      status: production && (readiness.missing > 0 || !exportsReady || staff.active < 2) ? 'blocked' : 'review',
      detail: 'Run local smoke, then live smoke on pos.supermega.dev before final release.',
    },
  ]

  return { gates, readiness, benchmark, staff }
}

function buildNextActions(input: BuildPosDeploymentPackInput) {
  const actions: string[] = []
  for (const item of input.enterpriseChecklist) {
    if (item.status === 'missing') {
      actions.push(`Close enterprise gap: ${item.control} (${item.owner}).`)
    }
  }
  for (const item of input.benchmarkBacklog) {
    if (item.status === 'missing') {
      actions.push(`Close benchmark gap: ${item.benchmark} (${item.source}).`)
    }
  }
  if (!input.canExportExcel || !input.canExportJson) {
    actions.push('Enable both Excel and JSON export permissions for deployment readiness.')
  }
  const activeStaff = input.staffDirectory.filter((member) => member.status === 'active').length
  if (activeStaff < 2) {
    actions.push('Add at least two active staff profiles with PINs for shared-terminal resilience.')
  }
  if (!input.managerOverrideHint) {
    actions.push('Configure manager override PIN policy before production handoff.')
  }
  if (!actions.length) {
    actions.push('Run live smoke on pos.supermega.dev and attach the proof pack to release notes.')
  }
  return actions
}

export function buildPosClientDeploymentPack(input: BuildPosDeploymentPackInput): PosClientDeploymentPack {
  const { gates, readiness, benchmark, staff } = buildDeploymentGates(input)
  return {
    generatedAt: new Date().toISOString(),
    companyName: input.session.companyName,
    workspaceSlug: input.session.workspaceSlug,
    businessType: input.businessType,
    environment: input.environment,
    releaseOwner: input.releaseOwner,
    versionTag: input.versionTag,
    workspaceUrl: input.workspaceUrl,
    locations: input.session.locations.map((location) => ({
      id: location.id,
      label: location.label,
      status: location.status,
      timezone: location.timezone,
      currency: location.currency,
    })),
    roles: input.roles,
    modules: input.moduleIds.map((moduleId) => ({
      id: moduleId,
      label: input.moduleLabels[moduleId] || moduleId,
    })),
    staffSummary: staff,
    readinessSummary: readiness,
    benchmarkSummary: benchmark,
    gates,
    nextActions: buildNextActions(input),
    smoke: {
      local: 'npm run smoke:pos-host:local',
      live: 'npm run smoke:pos-host',
    },
    references: input.referenceRepos.map((item) => ({
      name: item.name,
      source: item.source,
      url: item.url,
    })),
  }
}

export function buildPosDeploymentChecklistText(pack: PosClientDeploymentPack) {
  const lines = [
    `POS deployment checklist / ${pack.companyName}`,
    `Environment: ${pack.environment} / Version: ${pack.versionTag}`,
    `Release owner: ${pack.releaseOwner}`,
    `Workspace: ${pack.workspaceUrl}`,
    '',
    'Release gates:',
    ...pack.gates.map((gate) => `- [${gate.status.toUpperCase()}] ${gate.title} / ${gate.owner} / ${gate.detail}`),
    '',
    'Next actions:',
    ...pack.nextActions.map((action) => `- ${action}`),
    '',
    `Smoke local: ${pack.smoke.local}`,
    `Smoke live: ${pack.smoke.live}`,
  ]
  return lines.join('\n')
}
