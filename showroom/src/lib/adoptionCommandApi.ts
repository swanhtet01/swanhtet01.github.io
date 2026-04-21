import {
  YANGON_TYRE_ADOPTION_DIALECTIC,
  YANGON_TYRE_INSIGHT_CADENCES,
  YANGON_TYRE_ROLE_PLAYBOOKS,
  type YangonTyreInsightCadence,
  type YangonTyreRolePlaybook,
} from './yangonTyreAdoptionModel'
import { checkWorkspaceHealth, workspaceFetch } from './workspaceApi'
import { buildYangonTyreWritebackLanes, YANGON_TYRE_ROLE_STORIES } from './yangonTyreDataFabricModel'

export type AdoptionCommandSource = 'seed' | 'live'

export type AdoptionRuntimeStatus = 'Healthy' | 'Warning' | 'Degraded' | 'Needs wiring' | 'Mapped'

export type AdoptionCommandSummary = {
  overallScore: number
  rolePackCount: number
  healthyRoleCount: number
  warningRoleCount: number
  degradedRoleCount: number
  liveSurfaceCount: number
  staleSurfaceCount: number
  agentCoverageScore: number
}

export type AdoptionRolePack = YangonTyreRolePlaybook & {
  linkedStories: string[]
  agentPods: string[]
  status: AdoptionRuntimeStatus
  liveCount: number
  staleCount: number
  completenessScore: number
  adoptionScore: number
  lastActivityAt: string | null
  blockers: string[]
  nextEscalation: string
}

export type AdoptionSurfaceHealth = ReturnType<typeof buildYangonTyreWritebackLanes>[number] & {
  status: AdoptionRuntimeStatus
  liveCount: number
  staleCount: number
  completenessScore: number
  lastActivityAt: string | null
  managerRule: string
  automation: string
}

export type AdoptionRitual = YangonTyreInsightCadence & {
  route: string
  status: AdoptionRuntimeStatus
  lastSignalAt: string | null
  freshness: string
  backlog: string
}

export type AdoptionLoop = {
  id: string
  name: string
  cadence: string
  owner: string
  mission: string
  focus: string
  status: AdoptionRuntimeStatus
  lastRunAt: string | null
}

export type AdoptionCommandDataset = {
  source: AdoptionCommandSource
  updatedAt: string | null
  summary: AdoptionCommandSummary
  rolePacks: AdoptionRolePack[]
  surfaceHealth: AdoptionSurfaceHealth[]
  rituals: AdoptionRitual[]
  agentLoops: AdoptionLoop[]
  bigPicture: {
    thesis: string
    currentTruth: string[]
    nextBuilds: string[]
  }
}

export type AdoptionCommandPayload = {
  status?: string
  updated_at?: string
  summary?: {
    overall_score?: number
    role_pack_count?: number
    healthy_role_count?: number
    warning_role_count?: number
    degraded_role_count?: number
    live_surface_count?: number
    stale_surface_count?: number
    agent_coverage_score?: number
  }
  role_packs?: Array<{
    id?: string
    status?: AdoptionRuntimeStatus
    live_count?: number
    stale_count?: number
    completeness_score?: number
    adoption_score?: number
    last_activity_at?: string
    blockers?: string[]
    next_escalation?: string
  }>
  surface_health?: Array<{
    id?: string
    status?: AdoptionRuntimeStatus
    live_count?: number
    stale_count?: number
    completeness_score?: number
    last_activity_at?: string
    manager_rule?: string
    automation?: string
  }>
  rituals?: Array<{
    id?: string
    route?: string
    status?: AdoptionRuntimeStatus
    last_signal_at?: string
    freshness?: string
    backlog?: string
  }>
  agent_loops?: Array<{
    id?: string
    status?: AdoptionRuntimeStatus
    last_run_at?: string
    owner?: string
    mission?: string
    focus?: string
  }>
  big_picture?: {
    thesis?: string
    current_truth?: string[]
    next_builds?: string[]
  }
}

const ROLE_STORY_MAP: Record<string, string[]> = {
  receiving: ['Supplier recovery story', 'Plant shift and engineering story'],
  plant: ['Plant shift and engineering story', 'CEO daily brief'],
  quality: ['Quality technical story', 'CEO daily brief'],
  maintenance: ['Plant shift and engineering story', 'Quality technical story'],
  procurement: ['Supplier recovery story', 'Finance approval story'],
  sales: ['Sales and demand story', 'CEO daily brief'],
  director: ['CEO daily brief', 'Admin data-quality story'],
  admin: ['Admin data-quality story', 'CEO daily brief'],
}

const ROLE_AGENT_POD_MAP: Record<string, string[]> = {
  receiving: ['Intake Router Pod', 'Supplier Recovery Pod'],
  plant: ['Operations and Reliability Pod', 'Manufacturing Genealogy Pod'],
  quality: ['Quality Watch Pod', 'Data Science Pod'],
  maintenance: ['Operations and Reliability Pod', 'Manufacturing Genealogy Pod'],
  procurement: ['Supplier Recovery Pod', 'Intake Router Pod'],
  sales: ['Commercial Memory Pod', 'Data Science Pod'],
  director: ['CEO Brief Pod', 'Data Science Pod'],
  admin: ['Intake Router Pod', 'Workforce Command', 'Data Science Pod'],
}

const RITUAL_ROUTE_MAP: Record<string, string> = {
  'shift-review': '/app/operations',
  'daily-brief': '/app/director',
  'quality-board': '/app/dqms',
  'supplier-review': '/app/approvals',
  'monthly-intelligence': '/app/insights',
}

const LOOP_SEED: AdoptionLoop[] = [
  {
    id: 'ops_watch',
    name: 'Ops Watch',
    cadence: '15 minutes',
    owner: 'Tenant admin',
    mission: 'Watch stale queues, review drift, and runtime pressure before adoption decays.',
    focus: 'Runtime health and workstream drift',
    status: 'Mapped',
    lastRunAt: null,
  },
  {
    id: 'task_triage',
    name: 'Task Triage',
    cadence: 'Hourly',
    owner: 'Plant manager',
    mission: 'Promote stale items and owner gaps into visible follow-through work.',
    focus: 'Owner clarity and queue discipline',
    status: 'Mapped',
    lastRunAt: null,
  },
  {
    id: 'founder_brief',
    name: 'Founder Brief',
    cadence: 'Daily',
    owner: 'CEO / director',
    mission: 'Publish a daily management view from the same data the team is updating.',
    focus: 'Leadership review and cross-functional priority reset',
    status: 'Mapped',
    lastRunAt: null,
  },
  {
    id: 'revenue_scout',
    name: 'Revenue Scout',
    cadence: 'Hourly',
    owner: 'Sales lead',
    mission: 'Keep dealer follow-up, pipeline growth, and demand changes visible without manual chase.',
    focus: 'Commercial freshness and account movement',
    status: 'Mapped',
    lastRunAt: null,
  },
]

function buildSeedRolePacks() {
  const storyNames = new Set(YANGON_TYRE_ROLE_STORIES.map((story) => story.name))

  return YANGON_TYRE_ROLE_PLAYBOOKS.map((playbook, index) => {
    const linkedStories = (ROLE_STORY_MAP[playbook.id] ?? []).filter((story) => storyNames.has(story))
    return {
      ...playbook,
      linkedStories,
      agentPods: ROLE_AGENT_POD_MAP[playbook.id] ?? [],
      status: 'Mapped' as const,
      liveCount: 0,
      staleCount: 0,
      completenessScore: Math.max(60, 82 - index * 3),
      adoptionScore: Math.max(58, 78 - index * 3),
      lastActivityAt: null,
      blockers: ['Waiting for live workspace data to score actual usage, freshness, and completeness.'],
      nextEscalation: playbook.managerCadence,
    }
  })
}

function buildSeedSurfaceHealth() {
  return buildYangonTyreWritebackLanes().map((lane) => ({
    ...lane,
    status: 'Mapped' as const,
    liveCount: 0,
    staleCount: 0,
    completenessScore: 0,
    lastActivityAt: null,
    managerRule: lane.qualityRules[0] ?? 'Manager review required.',
    automation: lane.downstreamStories.length
      ? `Feeds ${lane.downstreamStories.join(' and ')}.`
      : 'Feeds downstream role review once writeback is live.',
  }))
}

function buildSeedRituals() {
  return YANGON_TYRE_INSIGHT_CADENCES.map((ritual) => ({
    ...ritual,
    route: RITUAL_ROUTE_MAP[ritual.id] ?? '/app/meta',
    status: 'Mapped' as const,
    lastSignalAt: null,
    freshness: 'Blueprint rhythm',
    backlog: `Outputs: ${ritual.outputs.join(' / ')}`,
  }))
}

export function getSeedAdoptionCommandDataset(): AdoptionCommandDataset {
  const rolePacks = buildSeedRolePacks()
  const surfaceHealth = buildSeedSurfaceHealth()
  const rituals = buildSeedRituals()
  const agentLoops = LOOP_SEED
  return {
    source: 'seed',
    updatedAt: null,
    summary: {
      overallScore: 68,
      rolePackCount: rolePacks.length,
      healthyRoleCount: 0,
      warningRoleCount: rolePacks.length,
      degradedRoleCount: 0,
      liveSurfaceCount: 0,
      staleSurfaceCount: 0,
      agentCoverageScore: 72,
    },
    rolePacks,
    surfaceHealth,
    rituals,
    agentLoops,
    bigPicture: {
      thesis: YANGON_TYRE_ADOPTION_DIALECTIC.synthesis,
      currentTruth: [
        `${rolePacks.length} role packs define how staff, managers, and leadership should work inside the portal.`,
        `${surfaceHealth.length} writeback lanes map data entry directly into downstream stories and feature marts.`,
        `${rituals.length} recurring reviews connect source capture to management decision-making.`,
      ],
      nextBuilds: [
        'Score role usage and completeness from live workspace rows instead of seeded rollout assumptions.',
        'Turn at-risk roles and stale writeback lanes into auto-created review tasks.',
        'Use agent loops to refresh briefs and reinforce manager review discipline continuously.',
      ],
    },
  }
}

function mergeById<T extends { id: string }, U extends { id?: string }>(
  seedRows: T[],
  liveRows: U[] | undefined,
  merge: (seed: T, live: U | undefined) => T,
) {
  const liveMap = new Map((liveRows ?? []).map((row) => [String(row.id ?? '').trim(), row]))
  return seedRows.map((seed) => merge(seed, liveMap.get(seed.id)))
}

export function normalizeAdoptionCommandDataset(
  payload?: AdoptionCommandPayload | null,
  source: AdoptionCommandSource = 'live',
): AdoptionCommandDataset {
  const fallback = getSeedAdoptionCommandDataset()

  const rolePacks = mergeById(fallback.rolePacks, payload?.role_packs, (seed, live) => ({
    ...seed,
    status: live?.status ?? seed.status,
    liveCount: live?.live_count ?? seed.liveCount,
    staleCount: live?.stale_count ?? seed.staleCount,
    completenessScore: live?.completeness_score ?? seed.completenessScore,
    adoptionScore: live?.adoption_score ?? seed.adoptionScore,
    lastActivityAt: live?.last_activity_at ?? seed.lastActivityAt,
    blockers: live?.blockers?.length ? live.blockers : seed.blockers,
    nextEscalation: live?.next_escalation ?? seed.nextEscalation,
  }))

  const surfaceHealth = mergeById(fallback.surfaceHealth, payload?.surface_health, (seed, live) => ({
    ...seed,
    status: live?.status ?? seed.status,
    liveCount: live?.live_count ?? seed.liveCount,
    staleCount: live?.stale_count ?? seed.staleCount,
    completenessScore: live?.completeness_score ?? seed.completenessScore,
    lastActivityAt: live?.last_activity_at ?? seed.lastActivityAt,
    managerRule: live?.manager_rule ?? seed.managerRule,
    automation: live?.automation ?? seed.automation,
  }))

  const rituals = mergeById(fallback.rituals, payload?.rituals, (seed, live) => ({
    ...seed,
    route: live?.route ?? seed.route,
    status: live?.status ?? seed.status,
    lastSignalAt: live?.last_signal_at ?? seed.lastSignalAt,
    freshness: live?.freshness ?? seed.freshness,
    backlog: live?.backlog ?? seed.backlog,
  }))

  const agentLoops = mergeById(fallback.agentLoops, payload?.agent_loops, (seed, live) => ({
    ...seed,
    status: live?.status ?? seed.status,
    lastRunAt: live?.last_run_at ?? seed.lastRunAt,
    owner: live?.owner ?? seed.owner,
    mission: live?.mission ?? seed.mission,
    focus: live?.focus ?? seed.focus,
  }))

  return {
    source,
    updatedAt: payload?.updated_at ?? fallback.updatedAt,
    summary: {
      overallScore: payload?.summary?.overall_score ?? fallback.summary.overallScore,
      rolePackCount: payload?.summary?.role_pack_count ?? rolePacks.length,
      healthyRoleCount: payload?.summary?.healthy_role_count ?? rolePacks.filter((item) => item.status === 'Healthy').length,
      warningRoleCount: payload?.summary?.warning_role_count ?? rolePacks.filter((item) => item.status === 'Warning').length,
      degradedRoleCount: payload?.summary?.degraded_role_count ?? rolePacks.filter((item) => item.status === 'Degraded').length,
      liveSurfaceCount: payload?.summary?.live_surface_count ?? surfaceHealth.filter((item) => item.liveCount > 0).length,
      staleSurfaceCount: payload?.summary?.stale_surface_count ?? surfaceHealth.filter((item) => item.staleCount > 0).length,
      agentCoverageScore: payload?.summary?.agent_coverage_score ?? fallback.summary.agentCoverageScore,
    },
    rolePacks,
    surfaceHealth,
    rituals,
    agentLoops,
    bigPicture: {
      thesis: payload?.big_picture?.thesis ?? fallback.bigPicture.thesis,
      currentTruth: payload?.big_picture?.current_truth ?? fallback.bigPicture.currentTruth,
      nextBuilds: payload?.big_picture?.next_builds ?? fallback.bigPicture.nextBuilds,
    },
  }
}

export async function loadAdoptionCommandDataset(): Promise<AdoptionCommandDataset> {
  const fallback = getSeedAdoptionCommandDataset()
  const health = await checkWorkspaceHealth()

  if (!health.ready) {
    return fallback
  }

  try {
    const payload = await workspaceFetch<AdoptionCommandPayload>('/api/adoption-command')
    return normalizeAdoptionCommandDataset(payload, 'live')
  } catch {
    return fallback
  }
}
