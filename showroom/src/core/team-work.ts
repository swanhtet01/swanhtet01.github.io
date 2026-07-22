import { useEffect, useState } from 'react'

export type TeamId = 'product' | 'engineering' | 'growth' | 'finance'
export type WorkPriority = 'P0' | 'P1' | 'P2'
export type WorkStatus = 'backlog' | 'in_progress' | 'blocked' | 'review' | 'done'
export type ProductStage = 'discover' | 'define' | 'build' | 'release' | 'learn'
export type EvidenceKind = 'customer' | 'metric' | 'test' | 'release' | 'decision' | 'source'
export type EvidenceStatus = 'observed' | 'verified'

export type EvidenceRecord = {
  id: string
  createdAt: string
  kind: EvidenceKind
  finding: string
  reference: string
  status: EvidenceStatus
  verifiedAt?: string
}

export type TeamWorkItem = {
  id: string
  createdAt: string
  team: TeamId
  title: string
  owner: string
  priority: WorkPriority
  status: WorkStatus
  productStage?: ProductStage
  outcome: string
  evidence: EvidenceRecord[]
}

export type ProductDecision = {
  id: string
  createdAt: string
  title: string
  owner: string
  rationale: string
  status: 'proposed' | 'accepted'
  acceptedAt?: string
  acceptedBy?: string
  acceptedActorKind?: 'human'
  acceptanceNote?: string
  acceptanceEvidenceReference?: string
}

export type ProductRelease = {
  id: string
  name: string
  target: string
  checks: Array<{ id: string; label: string; complete: boolean }>
}

export type TeamWorkspaceState = {
  items: TeamWorkItem[]
  decisions: ProductDecision[]
  release: ProductRelease
}

export const TEAM_WORK_KEY = 'supermega.team.workspace.v2'

export const teamDefinitions = [
  { id: 'product', label: 'Product', purpose: 'Outcomes, backlog, acceptance, decisions, and release readiness.' },
  { id: 'engineering', label: 'Engineering', purpose: 'Delivery, verification, incidents, and release evidence.' },
  { id: 'growth', label: 'Growth', purpose: 'Positioning, onboarding, campaigns, and qualified follow-up.' },
  { id: 'finance', label: 'Finance / Risk', purpose: 'Spend, controls, exceptions, and approval evidence.' },
] as const satisfies ReadonlyArray<{ id: TeamId; label: string; purpose: string }>

export const productStages = [
  { id: 'discover', label: 'Discover', purpose: 'Customer signal and problem evidence.' },
  { id: 'define', label: 'Define', purpose: 'Outcome, owner, and acceptance boundary.' },
  { id: 'build', label: 'Build', purpose: 'Delivery with tests and implementation evidence.' },
  { id: 'release', label: 'Release', purpose: 'Explicit checks, owner, and release identity.' },
  { id: 'learn', label: 'Learn', purpose: 'Usage evidence and the next product decision.' },
] as const satisfies ReadonlyArray<{ id: ProductStage; label: string; purpose: string }>

export const evidenceKinds = [
  { id: 'customer', label: 'Customer signal' },
  { id: 'metric', label: 'Metric' },
  { id: 'test', label: 'Test result' },
  { id: 'release', label: 'Release' },
  { id: 'decision', label: 'Decision' },
  { id: 'source', label: 'Source' },
] as const satisfies ReadonlyArray<{ id: EvidenceKind; label: string }>

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60 * 1000).toISOString()

function seedEvidence(id: string, minutes: number, kind: EvidenceKind, finding: string, reference: string): EvidenceRecord {
  const timestamp = minutesAgo(minutes)
  return { id, createdAt: timestamp, kind, finding, reference, status: 'verified', verifiedAt: timestamp }
}

export const seedTeamWorkspace: TeamWorkspaceState = {
  items: [
    {
      id: 'PROD-101',
      createdAt: minutesAgo(74),
      team: 'product',
      title: 'Define managed-workspace acceptance contract',
      owner: 'Product lead',
      priority: 'P0',
      status: 'in_progress',
      productStage: 'define',
      outcome: 'Identity, persistence, recovery, and audit evidence are explicit before activation.',
      evidence: [
        seedEvidence('EVD-101', 73, 'release', 'The release contract preserves exact commit and context identity.', 'Live release contract'),
        seedEvidence('EVD-102', 72, 'decision', 'Consequential external actions remain owner controlled.', 'Authority boundary'),
      ],
    },
    {
      id: 'PROD-102',
      createdAt: minutesAgo(51),
      team: 'product',
      title: 'Validate the Product workspace with one real company workflow',
      owner: 'Product lead',
      priority: 'P1',
      status: 'backlog',
      productStage: 'discover',
      outcome: 'A user can move one outcome from intake to accepted evidence without leaving the system.',
      evidence: [],
    },
    {
      id: 'PROD-103',
      createdAt: minutesAgo(47),
      team: 'product',
      title: 'Ship the compact company workspace',
      owner: 'Product lead',
      priority: 'P0',
      status: 'review',
      productStage: 'release',
      outcome: 'Today, Product, Commerce, and Production remain usable without a long page or duplicate route.',
      evidence: [seedEvidence('EVD-103', 45, 'test', 'Desktop and mobile workspace layouts pass the responsive contract.', 'Responsive workspace contract')],
    },
    {
      id: 'PROD-104',
      createdAt: minutesAgo(19),
      team: 'product',
      title: 'Measure one complete customer workflow',
      owner: 'Product lead',
      priority: 'P1',
      status: 'backlog',
      productStage: 'learn',
      outcome: 'One pilot records time saved, exceptions resolved, and owner approval from intake through review.',
      evidence: [],
    },
    {
      id: 'ENG-201',
      createdAt: minutesAgo(43),
      team: 'engineering',
      title: 'Automate Team workspace release verification',
      owner: 'Engineering lead',
      priority: 'P0',
      status: 'review',
      outcome: 'Every production release proves routes, state transitions, responsive layout, and release identity.',
      evidence: [seedEvidence('EVD-201', 40, 'test', 'The canonical application build and release checks pass.', 'App build contract')],
    },
    {
      id: 'GROW-301',
      createdAt: minutesAgo(36),
      team: 'growth',
      title: 'Replace the feature tour with one qualification story',
      owner: 'Growth lead',
      priority: 'P1',
      status: 'in_progress',
      outcome: 'A prospect understands the product and reaches one clear next action.',
      evidence: [seedEvidence('EVD-301', 34, 'test', 'The public surface uses only the approved compact route set.', 'Public route audit')],
    },
    {
      id: 'FIN-401',
      createdAt: minutesAgo(28),
      team: 'finance',
      title: 'Set the managed-activation spend gate',
      owner: 'Finance owner',
      priority: 'P1',
      status: 'blocked',
      outcome: 'Infrastructure spend has a named owner, cap, review date, and supporting evidence.',
      evidence: [],
    },
  ],
  decisions: [
    {
      id: 'DEC-101',
      createdAt: minutesAgo(92),
      title: 'One product with configurable operating modules',
      owner: 'Product lead',
      rationale: 'Commerce, Production, and company teams share identity, work, evidence, and approval controls.',
      status: 'accepted',
      acceptedAt: minutesAgo(88),
      acceptedBy: 'Product lead',
      acceptedActorKind: 'human',
      acceptanceNote: 'Accepted after the compact route and shared-control review.',
      acceptanceEvidenceReference: 'repository://CURRENT.md#product-thesis',
    },
    {
      id: 'DEC-102',
      createdAt: minutesAgo(63),
      title: 'No external action without a responsible owner',
      owner: 'Workspace owner',
      rationale: 'Agents can prepare and escalate; sends, payments, publishing, and production writes stay gated.',
      status: 'accepted',
      acceptedAt: minutesAgo(58),
      acceptedBy: 'Workspace owner',
      acceptedActorKind: 'human',
      acceptanceNote: 'Accepted as the authority boundary for the local release candidate.',
      acceptanceEvidenceReference: 'repository://CURRENT.md#data-and-authority-boundary',
    },
  ],
  release: {
    id: 'REL-2026-07',
    name: 'Compact company workspace',
    target: 'Next verified release',
    checks: [
      { id: 'acceptance', label: 'Acceptance criteria defined', complete: true },
      { id: 'workflow', label: 'Product workflow exercised', complete: false },
      { id: 'contract', label: 'Build and release contracts pass', complete: false },
      { id: 'owner', label: 'Release owner named', complete: true },
    ],
  },
}

function normalizeEvidence(value: unknown, itemId: string, itemCreatedAt: string, index: number): EvidenceRecord | null {
  if (typeof value === 'string') {
    const reference = value.trim()
    if (!reference) return null
    return {
      id: `${itemId}-E${index + 1}`,
      createdAt: itemCreatedAt,
      kind: 'source',
      finding: reference,
      reference,
      status: 'observed',
    }
  }
  if (!value || typeof value !== 'object') return null

  const candidate = value as Partial<EvidenceRecord>
  const kind = evidenceKinds.some((entry) => entry.id === candidate.kind) ? candidate.kind as EvidenceKind : 'source'
  const status: EvidenceStatus = candidate.status === 'verified' ? 'verified' : 'observed'
  const finding = String(candidate.finding || '').trim()
  const reference = String(candidate.reference || '').trim()
  if (!finding && !reference) return null
  const createdAt = String(candidate.createdAt || itemCreatedAt)
  const verifiedAt = status === 'verified' ? String(candidate.verifiedAt || createdAt) : undefined

  return {
    id: String(candidate.id || `${itemId}-E${index + 1}`),
    createdAt,
    kind,
    finding: finding || reference,
    reference: reference || finding,
    status,
    verifiedAt,
  }
}

function normalizeWorkItem(item: TeamWorkItem): TeamWorkItem {
  const evidence = Array.isArray(item.evidence)
    ? item.evidence.map((entry, index) => normalizeEvidence(entry, item.id, item.createdAt, index)).filter((entry): entry is EvidenceRecord => Boolean(entry))
    : []
  return { ...item, evidence }
}

function normalizeDecision(decision: ProductDecision): ProductDecision {
  if (decision.status !== 'accepted') return decision
  const acceptedBy = String(decision.acceptedBy || '').trim()
  const acceptanceNote = String(decision.acceptanceNote || '').trim()
  const acceptanceEvidenceReference = String(decision.acceptanceEvidenceReference || '').trim()
  const isAttributedHumanAcceptance = decision.acceptedActorKind === 'human' && Boolean(acceptedBy) && Boolean(acceptanceNote) && Boolean(acceptanceEvidenceReference)
  if (!isAttributedHumanAcceptance) {
    return {
      ...decision,
      status: 'proposed',
      acceptedActorKind: undefined,
    }
  }
  return {
    ...decision,
    acceptedAt: String(decision.acceptedAt || decision.createdAt),
    acceptedBy,
    acceptanceNote,
    acceptanceEvidenceReference,
  }
}

function normalizeWorkspace(value: Partial<TeamWorkspaceState>): TeamWorkspaceState {
  return {
    items: Array.isArray(value.items) ? value.items.map(normalizeWorkItem) : seedTeamWorkspace.items,
    decisions: Array.isArray(value.decisions) ? value.decisions.map(normalizeDecision) : seedTeamWorkspace.decisions,
    release: value.release && Array.isArray(value.release.checks) ? value.release : seedTeamWorkspace.release,
  }
}

export function useTeamWorkspace() {
  const [state, setState] = useState<TeamWorkspaceState>(() => {
    try {
      const stored = window.localStorage.getItem(TEAM_WORK_KEY)
      return stored ? normalizeWorkspace(JSON.parse(stored) as Partial<TeamWorkspaceState>) : seedTeamWorkspace
    } catch {
      return seedTeamWorkspace
    }
  })

  useEffect(() => {
    try {
      window.localStorage.setItem(TEAM_WORK_KEY, JSON.stringify(state))
    } catch {
      // The workspace remains usable in memory when browser storage is unavailable.
    }
  }, [state])

  return [state, setState] as const
}

export function createTeamId(prefix: string) {
  const cryptoId = globalThis.crypto?.randomUUID?.().slice(0, 8)
  return `${prefix}-${cryptoId ?? Date.now().toString(36)}`.toUpperCase()
}

export function formatTime(value: string) {
  return new Intl.DateTimeFormat('en', { hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}
