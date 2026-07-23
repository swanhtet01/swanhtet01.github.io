import { type FormEvent, type ReactNode, useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate, useOutletContext, useSearchParams } from 'react-router-dom'

import siteManifest from '../../../site-manifest.json'
import './core-app.css'
import { WebsiteCommerceIntake } from '../products/WebsiteCommerceIntake'
import type { WebsiteOrderRecord } from '../products/product-handoff'
import {
  createManagedApproval,
  currentManagedIdentity,
  currentManagedWorkspace,
  decideManagedApproval,
  loadManagedBootstrap,
  ManagedTrialError,
  managedTrialAuthConfigured,
  saveManagedCommerceCommand,
  signInManagedTrial,
  signOutManagedTrial,
  type ManagedApprovalRecord,
  type ManagedCommerceEvent,
  type ManagedIdentity,
  type ManagedStateRecord,
} from './managed-trial'
import { LEGACY_TEAM_WORK_KEYS, TEAM_WORK_KEY, formatTime, teamDefinitions, useTeamWorkspace } from './team-work'
import {
  COMMERCE_KEY,
  LEGACY_COMMERCE_KEYS,
  advanceCommerceOrder,
  cancelCommerceOrder,
  commerceOrderHasReleasableReservation,
  commerceWebsiteIntakes,
  convertCommerceWebsiteIntake,
  createEmptyCommerce,
  loadCommerceWorkspace,
  mutateCommerceWorkspace,
  receiveCommerceStock,
  reconcileCommercePayment,
  registerCommerceItem,
  reserveCommerceOrder,
  validateCommerceState,
  type CommerceActionProof,
  type CommerceItem,
  type CommerceOrder,
  type CommerceOrderStatus,
  type CommerceState,
  type CommerceStockMovement,
  type CommerceWebsiteOrderInput,
} from './commerce-workspace'
import {
  LEGACY_PRODUCTION_KEYS,
  PRODUCTION_KEY,
  advanceProductionMachineState,
  loadProductionWorkspace,
  mutateProductionWorkspace,
  openProductionIssue,
  productionMachineTransitions,
  recordProductionOutput,
  resolveProductionIssue,
  type ProductionActionProof,
  type ProductionEvent,
  type ProductionIssue,
  type ProductionJob,
  type ProductionMachineState,
  type ProductionState,
} from './production-workspace'

type DecisionClaim = {
  id: string
  claimType: 'fact' | 'analysis'
  statement: string
  sourceReference: string
  capturedAt: string
  status: 'observed' | 'verified'
  uncertainty: 'low' | 'medium' | 'high'
  visibility: 'private' | 'public'
  digest?: string
}

type DecisionPacket = {
  contract: 'decision_packet.v1'
  subject: { kind: string; id: string; version: 1 }
  decision: string
  claims: DecisionClaim[]
  baseline: string
  target: string
  result: string
  acceptance: string
  artifactReference: string
}

type ManagedDecisionPacket = {
  contract: 'decision_packet.v1'
  subject: { kind: string; id: string; version: 1 }
  decision: string
  claims: Array<{
    id: string
    claim_type: DecisionClaim['claimType']
    statement: string
    source_reference: string
    captured_at: string
    status: DecisionClaim['status']
    uncertainty: DecisionClaim['uncertainty']
    visibility: DecisionClaim['visibility']
    digest?: string
  }>
  baseline: string
  target: string
  result: string
  acceptance: string
  artifact_reference: string
}

type Approval = {
  id: string
  commandId?: string
  createdAt: string
  title: string
  requestedBy: string
  requestedActorKind: 'human' | 'service' | 'agent' | 'unknown'
  packet: DecisionPacket
  packetFingerprint: string
  status: 'pending' | 'approved' | 'declined' | 'superseded'
  decidedAt?: string
  decidedBy?: string
  decidedActorKind?: 'human' | 'service' | 'agent' | 'unknown'
  decisionNote?: string
  managed?: boolean
}

type ActionDomain = 'commerce' | 'production'

type ActionKind =
  | 'order_create'
  | 'order_status'
  | 'order_cancel'
  | 'payment_reconcile'
  | 'catalog_item_create'
  | 'inventory_receipt'
  | 'daily_close'
  | 'production_output'
  | 'issue_create'
  | 'issue_resolution'
  | 'machine_state'

type AccountableAction = {
  id: string
  commandId: string
  capturedAt: string
  domain: ActionDomain
  kind: ActionKind
  subjectId: string
  summary: string
  actorKind: 'human'
  actor: string
  reason: string
  evidenceReference: string
  before: string
  after: string
}

type PendingAccountableAction = Omit<AccountableAction, 'capturedAt' | 'actorKind' | 'actor' | 'reason' | 'evidenceReference'> & {
  apply: (record: AccountableAction) => void | Promise<void>
  confirmation?: AccountableAction
}

type ActionDetails = Pick<AccountableAction, 'actor' | 'reason' | 'evidenceReference'>

type ProductId = 'commerce' | 'production'

type WorkflowTemplate = {
  id: string
  name: string
  outcome: string
  workflow: string[]
  entryPoints: string[]
  metric: string
}

type ProductContract = {
  id: ProductId
  templates: WorkflowTemplate[]
}

type SetupState = {
  product: ProductId
  template: string
  workspace: string
  owner: string
  entryPoint: string
  currentRecord: string
  baseline: string
  targetOutcome: string
  authorityBoundary: string
  acceptanceEvidence: string
  savedAt?: string
}

type RuntimeStatus = 'checking' | 'enterprise' | 'demo'

type RuntimeHealth = {
  status: RuntimeStatus
  serviceStatus: string
  operatingMode: string
  enterpriseDbReady: boolean
  securityReady: boolean
  writesReady: boolean
  coverageScore: number
  requirements: string[]
}

type CommerceTab = 'today' | 'orders' | 'inventory'
type ProductionTab = 'today' | 'production' | 'control'

const APPROVAL_KEY = 'supermega.approvals.v3'
const SETUP_KEY = 'supermega.setup.v3'
const ACTION_KEY = 'supermega.accountable.actions.v1'
const LEGACY_APPROVAL_KEYS = ['supermega.approvals.v2']
const LEGACY_SETUP_KEYS = ['supermega.setup.v2']

function requireProductContract(id: ProductId): ProductContract {
  const product = siteManifest.products.find((candidate) => candidate.id === id)
  if (!product) throw new Error(`Missing ${id} product contract.`)
  return { id, templates: product.templates }
}

const productContracts: Record<ProductId, ProductContract> = {
  commerce: requireProductContract('commerce'),
  production: requireProductContract('production'),
}

function templatesFor(product: ProductId) {
  return productContracts[product].templates
}

function templateFor(product: ProductId, name: string) {
  const templates = templatesFor(product)
  const fallback = templates[0]
  if (!fallback) throw new Error(`Missing ${product} workflow templates.`)
  return templates.find((template) => template.name === name) ?? fallback
}

const seedCommerceTemplate = templateFor('commerce', '')

const seedSetup: SetupState = {
  product: 'commerce',
  template: seedCommerceTemplate.name,
  workspace: '',
  owner: '',
  entryPoint: seedCommerceTemplate.entryPoints[0] ?? '',
  currentRecord: '',
  baseline: '',
  targetOutcome: '',
  authorityBoundary: '',
  acceptanceEvidence: '',
}

const pilotRequiredFields = ['workspace', 'owner', 'entryPoint', 'currentRecord', 'baseline', 'targetOutcome', 'authorityBoundary', 'acceptanceEvidence'] as const

function normalizeSetup(value: SetupState) {
  const source = (value && typeof value === 'object' ? value : seedSetup) as Omit<Partial<SetupState>, 'product'> & { product?: string }
  const product: ProductId = source.product === 'production' || source.product === 'plant' ? 'production' : 'commerce'
  const template = templateFor(product, String(source.template || ''))
  const sourceEntryPoint = String(source.entryPoint || '')
  const normalized: SetupState = {
    ...seedSetup,
    ...source,
    product,
    template: template.name,
    entryPoint: template.entryPoints.includes(sourceEntryPoint) ? sourceEntryPoint : template.entryPoints[0] ?? '',
  }
  return JSON.stringify(normalized) === JSON.stringify(value) ? value : normalized
}

function pilotProgress(setup: SetupState) {
  const complete = pilotRequiredFields.filter((field) => setup[field].trim()).length
  return Math.round((complete / pilotRequiredFields.length) * 100)
}

function pilotReady(setup: SetupState) {
  return pilotProgress(setup) === 100 && Boolean(setup.savedAt)
}

const checkingRuntime: RuntimeHealth = {
  status: 'checking',
  serviceStatus: 'checking',
  operatingMode: 'checking',
  enterpriseDbReady: false,
  securityReady: false,
  writesReady: false,
  coverageScore: 0,
  requirements: [],
}

const navigation = [
  { to: '/', label: 'Home', end: true },
  { to: '/work/', label: 'Work', end: false },
  { to: '/operations/', label: 'Products', end: false },
] as const

const commerceTabs: Array<{ id: CommerceTab; label: string }> = [
  { id: 'today', label: 'Today' },
  { id: 'orders', label: 'Orders' },
  { id: 'inventory', label: 'Inventory' },
]

const productionTabs: Array<{ id: ProductionTab; label: string }> = [
  { id: 'today', label: 'Today' },
  { id: 'production', label: 'Production' },
  { id: 'control', label: 'Issues & equipment' },
]

const productionMachineActionLabels: Record<ProductionMachineState, string> = {
  running: 'Flag attention',
  attention: 'Stop machine',
  stopped: 'Return to service',
}

function uid(prefix: string) {
  const cryptoId = globalThis.crypto?.randomUUID?.().slice(0, 8)
  return `${prefix}-${cryptoId ?? Date.now().toString(36)}`.toUpperCase()
}

function commandUuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const value = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`
}

function stableFingerprint(value: unknown) {
  const input = JSON.stringify(value)
  let hash = 2166136261
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `fnv1a:${(hash >>> 0).toString(16).padStart(8, '0')}`
}

function decisionPacketFingerprint(packet: DecisionPacket) {
  return stableFingerprint({
    contract: packet.contract,
    subject: { kind: packet.subject.kind, version: packet.subject.version },
    decision: packet.decision,
    claims: packet.claims.map(({ claimType, statement, sourceReference, status, uncertainty, visibility, digest }) => ({ claimType, statement, sourceReference, status, uncertainty, visibility, digest })),
    baseline: packet.baseline,
    target: packet.target,
    result: packet.result,
    acceptance: packet.acceptance,
    artifactReference: packet.artifactReference,
  })
}

function toManagedDecisionPacket(packet: DecisionPacket): ManagedDecisionPacket {
  return {
    contract: packet.contract,
    subject: packet.subject,
    decision: packet.decision,
    claims: packet.claims.map((claim) => ({
      id: claim.id,
      claim_type: claim.claimType,
      statement: claim.statement,
      source_reference: claim.sourceReference,
      captured_at: claim.capturedAt,
      status: claim.status,
      uncertainty: claim.uncertainty,
      visibility: claim.visibility,
      ...(claim.digest ? { digest: claim.digest } : {}),
    })),
    baseline: packet.baseline,
    target: packet.target,
    result: packet.result,
    acceptance: packet.acceptance,
    artifact_reference: packet.artifactReference,
  }
}

function toManagedApprovalRequest(approval: Approval) {
  if (approval.status !== 'pending' || !approval.commandId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(approval.commandId)) return null
  return {
    command_id: approval.commandId,
    title: approval.title,
    proposal: toManagedDecisionPacket(approval.packet),
    evidence_refs: [...new Set(approval.packet.claims.map((claim) => claim.sourceReference))],
  }
}

function fromManagedApproval(record: ManagedApprovalRecord): Approval {
  const managedPacket = record.proposal as unknown as ManagedDecisionPacket
  if (
    managedPacket.contract !== 'decision_packet.v1'
    || !managedPacket.subject
    || !Array.isArray(managedPacket.claims)
  ) {
    throw new Error('managed_approval_contract_invalid')
  }
  const packet: DecisionPacket = {
    contract: 'decision_packet.v1',
    subject: managedPacket.subject,
    decision: managedPacket.decision,
    claims: managedPacket.claims.map((claim) => ({
      id: claim.id,
      claimType: claim.claim_type,
      statement: claim.statement,
      sourceReference: claim.source_reference,
      capturedAt: claim.captured_at,
      status: claim.status,
      uncertainty: claim.uncertainty,
      visibility: claim.visibility,
      digest: claim.digest,
    })),
    baseline: managedPacket.baseline,
    target: managedPacket.target,
    result: managedPacket.result,
    acceptance: managedPacket.acceptance,
    artifactReference: managedPacket.artifact_reference,
  }
  return {
    id: record.approval_id,
    commandId: record.command_id,
    createdAt: record.requested_at,
    title: record.title,
    requestedBy: record.requested_by,
    requestedActorKind: record.requested_actor_kind,
    packet,
    packetFingerprint: decisionPacketFingerprint(packet),
    status: record.status,
    decidedAt: record.decided_at || undefined,
    decidedBy: record.decided_by || undefined,
    decidedActorKind: record.decided_actor_kind === 'human' || record.decided_actor_kind === 'service' || record.decided_actor_kind === 'agent' ? record.decided_actor_kind : undefined,
    decisionNote: record.decision_note || undefined,
    managed: true,
  }
}

function mergeManagedApprovals(current: Approval[], records: ManagedApprovalRecord[]) {
  const managed = records.map(fromManagedApproval)
  const managedIds = new Set(managed.map((approval) => approval.id))
  return [...managed, ...current.filter((approval) => !approval.managed && !managedIds.has(approval.id))]
}

function normalizeApprovals(value: Approval[]) {
  if (!Array.isArray(value)) return []

  const approvals = value.map((approval) => {
    const candidate = approval as unknown as Record<string, unknown>
    const packetCandidate = candidate.packet && typeof candidate.packet === 'object' ? candidate.packet as Record<string, unknown> : {}
    const subjectCandidate = packetCandidate.subject && typeof packetCandidate.subject === 'object' ? packetCandidate.subject as Record<string, unknown> : {}
    const createdAt = typeof candidate.createdAt === 'string' ? candidate.createdAt : new Date().toISOString()
    const approvalId = String(candidate.id || 'APR-LEGACY')
    const title = String(candidate.title || 'Review the proposed company action.')
    const legacyEvidence = Array.isArray(candidate.evidence) ? candidate.evidence : []
    const legacyContext = Array.isArray(packetCandidate.context) ? packetCandidate.context.map(String) : []
    const claimCandidates = Array.isArray(packetCandidate.claims) ? packetCandidate.claims : []
    const claims: DecisionClaim[] = (claimCandidates.length ? claimCandidates : legacyContext.length ? legacyContext : legacyEvidence.length ? legacyEvidence : [title]).slice(0, 20).map((item, index) => {
      const claim = item && typeof item === 'object' ? item as Record<string, unknown> : {}
      const legacySource = legacyEvidence[index]
      const legacySourceRecord = legacySource && typeof legacySource === 'object' ? legacySource as Record<string, unknown> : {}
      const legacyLabel = typeof legacySource === 'string' ? legacySource : String(legacySourceRecord.label || '')
      const statement = typeof item === 'string' ? item : String(claim.statement || legacyLabel || `Decision evidence ${index + 1}`)
      const sourceReference = String(claim.sourceReference || legacySourceRecord.reference || `local://legacy-approval/${approvalId}/${index + 1}`)
      const digest = String(claim.digest || '').trim()
      const isVerified = (claim.status === 'verified' || legacySourceRecord.status === 'verified') && /^sha256:[0-9a-f]{64}$/.test(digest)
      return {
        id: String(claim.id || `${approvalId}-CLM-${index + 1}`),
        claimType: claim.claimType === 'analysis' ? 'analysis' as const : 'fact' as const,
        statement,
        sourceReference,
        capturedAt: String(claim.capturedAt || legacySourceRecord.capturedAt || createdAt),
        status: isVerified ? 'verified' as const : 'observed' as const,
        uncertainty: claim.uncertainty === 'high' ? 'high' as const : claim.uncertainty === 'medium' ? 'medium' as const : 'low' as const,
        visibility: claim.visibility === 'public' ? 'public' as const : 'private' as const,
        digest: digest || undefined,
      }
    })
    const packet: DecisionPacket = {
      contract: 'decision_packet.v1',
      subject: {
        kind: String(subjectCandidate.kind || 'company_brief'),
        id: String(subjectCandidate.id || approvalId),
        version: 1,
      },
      decision: String(packetCandidate.decision || title),
      claims,
      baseline: String(packetCandidate.baseline || 'Not recorded'),
      target: String(packetCandidate.target || 'Not recorded'),
      result: String(packetCandidate.result || 'No measured result recorded.'),
      acceptance: String(packetCandidate.acceptance || 'Not recorded'),
      artifactReference: String(packetCandidate.artifactReference || 'local://exports/supermega-trial-evidence'),
    }
    const requestedActorKind: Approval['requestedActorKind'] = candidate.requestedActorKind === 'human' || candidate.requestedActorKind === 'service' || candidate.requestedActorKind === 'agent' ? candidate.requestedActorKind : 'unknown'
    const decidedActorKind: Approval['decidedActorKind'] = candidate.decidedActorKind === 'human' || candidate.decidedActorKind === 'service' || candidate.decidedActorKind === 'agent' ? candidate.decidedActorKind : 'unknown'
    const decidedBy = typeof candidate.decidedBy === 'string' ? candidate.decidedBy.trim() : ''
    const decisionNote = typeof candidate.decisionNote === 'string' ? candidate.decisionNote.trim() : ''
    const isAttributedHumanDecision = decidedActorKind === 'human' && Boolean(decidedBy) && Boolean(decisionNote)
    const requestedStatus = candidate.status === 'approved' || candidate.status === 'declined' || candidate.status === 'superseded' ? candidate.status : 'pending'
    const status: Approval['status'] = requestedStatus === 'approved' || requestedStatus === 'declined'
      ? isAttributedHumanDecision ? requestedStatus : 'pending'
      : requestedStatus

    return {
      id: approvalId,
      commandId: typeof candidate.commandId === 'string' ? candidate.commandId : undefined,
      createdAt,
      title,
      requestedBy: String(candidate.requestedBy || 'Local workspace operator'),
      requestedActorKind,
      packet,
      packetFingerprint: typeof candidate.packetFingerprint === 'string' ? candidate.packetFingerprint : decisionPacketFingerprint(packet),
      status,
      decidedAt: typeof candidate.decidedAt === 'string' ? candidate.decidedAt : undefined,
      decidedBy: decidedBy || undefined,
      decidedActorKind,
      decisionNote: decisionNote || undefined,
      managed: candidate.managed === true,
    }
  })

  return JSON.stringify(approvals) === JSON.stringify(value) ? value : approvals
}

function localApprovalsOnly(approvals: Approval[]) {
  return approvals.some((approval) => approval.managed) ? approvals.filter((approval) => !approval.managed) : approvals
}

function normalizeActions(value: AccountableAction[]) {
  if (!Array.isArray(value)) return []
  return value.filter((action) => action && typeof action.id === 'string' && action.actorKind === 'human').slice(0, 200)
}

function confirmAccountableAction(action: PendingAccountableAction, details: ActionDetails): AccountableAction {
  if (action.confirmation) return action.confirmation
  return {
    id: action.id,
    commandId: action.commandId,
    capturedAt: new Date().toISOString(),
    domain: action.domain,
    kind: action.kind,
    subjectId: action.subjectId,
    summary: action.summary,
    actorKind: 'human',
    actor: details.actor,
    reason: details.reason,
    evidenceReference: details.evidenceReference,
    before: action.before,
    after: action.after,
  }
}

function commerceActionProof(action: AccountableAction): CommerceActionProof {
  return {
    actionId: action.id,
    capturedAt: action.capturedAt,
    actor: action.actor,
    reason: action.reason,
    evidenceReference: action.evidenceReference,
  }
}

function productionActionProof(action: AccountableAction): ProductionActionProof {
  return {
    actionId: action.id,
    capturedAt: action.capturedAt,
    actor: action.actor,
    reason: action.reason,
    evidenceReference: action.evidenceReference,
  }
}

function useStoredState<T>(key: string, seed: T, normalize?: (value: T) => T, legacyKeys: string[] = [], persist?: (value: T) => T) {
  const [state, setState] = useState<T>(() => {
    for (const storageKey of [key, ...legacyKeys]) {
      try {
        const stored = window.localStorage.getItem(storageKey)
        if (!stored) continue
        const value = JSON.parse(stored) as T
        return normalize ? normalize(value) : value
      } catch {
        // Continue to a valid legacy record before falling back to the seed.
      }
    }
    return seed
  })
  const normalizedState = normalize ? normalize(state) : state

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(persist ? persist(normalizedState) : normalizedState))
    } catch {
      // The workspace remains usable in memory when browser storage is unavailable.
    }
  }, [key, normalizedState, persist])

  return [normalizedState, setState] as const
}

type CommerceWorkspaceMode = 'local' | 'managed-loading' | 'managed-ready' | 'managed-unprovisioned' | 'managed-error'

type CommerceWorkspaceView = {
  state: CommerceState
  mode: CommerceWorkspaceMode
  workspaceId: string
  version: number | null
  error: string
}

function managedCommerceView(record: ManagedStateRecord, workspaceId: string): CommerceWorkspaceView {
  if (record.surface !== 'commerce' || !Number.isSafeInteger(record.version) || record.version < 0) throw new Error('Managed Commerce returned an invalid state envelope.')
  if (record.version === 0) {
    if (Object.keys(record.state).length) throw new Error('Managed Commerce has state without a valid revision.')
    return { state: createEmptyCommerce(), mode: 'managed-unprovisioned', workspaceId, version: 0, error: 'This managed workspace has no Commerce catalog yet.' }
  }
  return { state: validateCommerceState(record.state), mode: 'managed-ready', workspaceId, version: record.version, error: '' }
}

function useCommerceWorkspace(managedIdentity: ManagedIdentity | null = null) {
  const [localSnapshot, setLocalSnapshot] = useState<CommerceWorkspaceView>(() => {
    const local = loadCommerceWorkspace()
    return { state: local.state, mode: 'local', workspaceId: '', version: null, error: local.error }
  })
  const [managedSnapshot, setManagedSnapshot] = useState<CommerceWorkspaceView>(() => ({
    state: createEmptyCommerce(), mode: 'managed-loading', workspaceId: '', version: null, error: '',
  }))
  const snapshotRef = useRef(localSnapshot)
  const identityRef = useRef(managedIdentity)

  useEffect(() => {
    identityRef.current = managedIdentity
    snapshotRef.current = managedIdentity ? managedSnapshot : localSnapshot
  }, [localSnapshot, managedIdentity, managedSnapshot])

  useEffect(() => {
    if (!managedIdentity) return undefined

    let active = true
    loadManagedBootstrap()
      .then((bootstrap) => {
        if (!active || identityRef.current?.workspaceId !== managedIdentity.workspaceId) return
        const next = managedCommerceView(bootstrap.states.commerce, managedIdentity.workspaceId)
        snapshotRef.current = next
        setManagedSnapshot(next)
      })
      .catch((error) => {
        if (!active || identityRef.current?.workspaceId !== managedIdentity.workspaceId) return
        const next = { state: createEmptyCommerce(), mode: 'managed-error' as const, workspaceId: managedIdentity.workspaceId, version: null, error: error instanceof Error ? error.message : 'Managed Commerce could not be loaded.' }
        snapshotRef.current = next
        setManagedSnapshot(next)
      })
    return () => { active = false }
  }, [managedIdentity])

  async function mutate(
    eventType: ManagedCommerceEvent,
    commandId: string,
    evidence: CommerceActionProof,
    transition: (state: CommerceState) => CommerceState | null,
  ) {
    if (!managedIdentity) {
      if (eventType === 'commerce.workspace.initialized') throw new Error('Browser demo Commerce is already initialized.')
      const result = await mutateCommerceWorkspace(transition)
      if (!result.ok) {
        const rejected = { ...snapshotRef.current, error: result.error }
        snapshotRef.current = rejected
        setLocalSnapshot(rejected)
        throw new Error(result.error)
      }
      const accepted = { state: result.state, mode: 'local' as const, workspaceId: '', version: null, error: '' }
      snapshotRef.current = accepted
      setLocalSnapshot(accepted)
      return
    }

    const workspaceId = managedIdentity.workspaceId
    const current = snapshotRef.current
    const initializing = eventType === 'commerce.workspace.initialized'
    const modeReady = initializing ? current.mode === 'managed-unprovisioned' && current.version === 0 : current.mode === 'managed-ready' && current.version !== null
    if (!modeReady || current.workspaceId !== workspaceId || current.version === null) {
      throw new Error(current.error || 'Managed Commerce is not ready for writes.')
    }
    const next = transition(current.state)
    if (!next) throw new Error('The Commerce state changed or this lifecycle step is no longer valid. Nothing was written.')
    if (next === current.state) return
    const candidate = validateCommerceState(next)

    try {
      const result = await saveManagedCommerceCommand({
        commandId,
        evidence,
        eventType,
        expectedVersion: current.version,
        state: candidate as unknown as Record<string, unknown>,
      })
      if (identityRef.current?.workspaceId !== workspaceId) throw new Error('The managed workspace changed before the write was confirmed.')
      if (result.surface !== 'commerce' || result.event_type !== eventType || result.version !== current.version + 1) {
        throw new Error('Managed Commerce returned an invalid command result.')
      }
      const accepted = validateCommerceState(result.state)
      let nextSnapshot: CommerceWorkspaceView = { state: accepted, mode: 'managed-ready', workspaceId, version: result.version, error: '' }
      if (result.idempotent_replay) {
        const bootstrap = await loadManagedBootstrap()
        if (identityRef.current?.workspaceId !== workspaceId) throw new Error('The managed workspace changed before the replay could be reconciled.')
        const refreshed = managedCommerceView(bootstrap.states.commerce, workspaceId)
        if (refreshed.mode !== 'managed-ready' || refreshed.version === null || refreshed.version < result.version) {
          throw new Error('Managed Commerce could not reconcile the committed command with current state.')
        }
        nextSnapshot = { ...refreshed, error: '' }
      }
      snapshotRef.current = nextSnapshot
      setManagedSnapshot(nextSnapshot)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The managed Commerce write was not confirmed.'
      if (error instanceof ManagedTrialError && error.code === 'trial_version_conflict') {
        try {
          const bootstrap = await loadManagedBootstrap()
          if (identityRef.current?.workspaceId !== workspaceId) throw new Error('The managed workspace changed before Commerce could refresh.')
          const refreshed = managedCommerceView(bootstrap.states.commerce, workspaceId)
          const conflict = { ...refreshed, error: 'Commerce changed in another session. The latest revision is loaded; review and confirm the action again.' }
          snapshotRef.current = conflict
          setManagedSnapshot(conflict)
        } catch (refreshError) {
          const refreshMessage = refreshError instanceof Error ? refreshError.message : 'Commerce changed and the latest revision could not be loaded.'
          const rejected = { ...snapshotRef.current, error: refreshMessage }
          snapshotRef.current = rejected
          setManagedSnapshot(rejected)
          throw refreshError
        }
        throw new Error('Commerce changed in another session. The latest revision is loaded; review and confirm the action again.')
      }
      if (identityRef.current?.workspaceId === workspaceId) {
        const rejected = { ...snapshotRef.current, error: message }
        snapshotRef.current = rejected
        setManagedSnapshot(rejected)
      }
      throw error
    }
  }

  const visible = managedIdentity ? managedSnapshot : localSnapshot
  return [visible.state, mutate, visible.error, visible.mode, visible.version, visible.workspaceId] as const
}

function useProductionWorkspace() {
  const [snapshot, setSnapshot] = useState(() => loadProductionWorkspace())

  useEffect(() => {
    function refreshFromStorage(event: StorageEvent) {
      if (event.key === PRODUCTION_KEY) setSnapshot(loadProductionWorkspace())
    }
    window.addEventListener('storage', refreshFromStorage)
    return () => window.removeEventListener('storage', refreshFromStorage)
  }, [])

  async function mutate(transition: (state: ProductionState) => ProductionState | null) {
    const result = await mutateProductionWorkspace(transition)
    if (!result.ok) {
      const refreshed = loadProductionWorkspace()
      setSnapshot((current) => ({
        state: refreshed.error ? current.state : refreshed.state,
        source: refreshed.error ? current.source : refreshed.source,
        error: result.error,
      }))
      throw new Error(result.error)
    }
    setSnapshot({ state: result.state, source: 'current', error: '' })
  }

  return [snapshot.state, mutate, snapshot.error] as const
}

function useApprovalWorkspace() {
  return useStoredState<Approval[]>(APPROVAL_KEY, [], normalizeApprovals, LEGACY_APPROVAL_KEYS, localApprovalsOnly)
}

function useSetupWorkspace() {
  return useStoredState<SetupState>(SETUP_KEY, seedSetup, normalizeSetup, LEGACY_SETUP_KEYS)
}

function useManagedIdentity(enabled: boolean) {
  const [identity, setIdentity] = useState<ManagedIdentity | null>(null)

  useEffect(() => {
    if (!enabled) return undefined
    let active = true
    currentManagedIdentity()
      .then((current) => {
        if (active) setIdentity(current)
      })
      .catch(() => {
        if (active) setIdentity(null)
      })
    return () => { active = false }
  }, [enabled])

  return [enabled ? identity : null, setIdentity] as const
}

function formatMoney(value: number) {
  return `${new Intl.NumberFormat('en-US').format(value)} MMK`
}

function AccountableActionGate({ action, authenticatedActor, onCancel, onConfirm }: {
  action: PendingAccountableAction | null
  authenticatedActor?: { id: string; label: string }
  onCancel: () => void
  onConfirm: (details: ActionDetails) => void | Promise<void>
}) {
  const [actor, setActor] = useState('')
  const [reason, setReason] = useState('')
  const [evidenceReference, setEvidenceReference] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const headingRef = useRef<HTMLHeadingElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!action) return undefined
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    headingRef.current?.focus()
    return () => {
      if (previousFocusRef.current?.isConnected) previousFocusRef.current.focus()
    }
  }, [action])

  if (!action) return null

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!action) return
    const responsibleActor = action.confirmation?.actor ?? authenticatedActor?.id ?? actor.trim()
    const confirmedReason = action.confirmation?.reason ?? reason.trim()
    const confirmedEvidence = action.confirmation?.evidenceReference ?? evidenceReference.trim()
    if (!responsibleActor || !confirmedReason || !confirmedEvidence) return
    setBusy(true)
    setError('')
    try {
      await onConfirm({ actor: responsibleActor, reason: confirmedReason, evidenceReference: confirmedEvidence })
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : 'The change was not applied.')
      setBusy(false)
    }
  }

  return <section className="core-panel accountable-action-gate" aria-label="Human action confirmation">
    <div className="action-change"><span className="core-eyebrow">Human confirmation</span><h2 ref={headingRef} tabIndex={-1}>{action.summary}</h2><p><strong>{action.before}</strong><span>→</span><strong>{action.after}</strong></p></div>
    <form className="core-form action-confirm-form" onSubmit={(event) => void submit(event)}>
      {authenticatedActor
        ? <label>Authenticated operator<input readOnly value={authenticatedActor.label} /></label>
        : <label>Responsible operator<input maxLength={80} readOnly={Boolean(action.confirmation)} required value={action.confirmation?.actor ?? actor} onChange={(event) => setActor(event.target.value)} placeholder="Name or accountable role" /></label>}
      <label>Reason<input maxLength={180} readOnly={Boolean(action.confirmation)} required value={action.confirmation?.reason ?? reason} onChange={(event) => setReason(event.target.value)} placeholder="Why this change is correct now" /></label>
      <label>Evidence source or reference<input maxLength={180} readOnly={Boolean(action.confirmation)} required value={action.confirmation?.evidenceReference ?? evidenceReference} onChange={(event) => setEvidenceReference(event.target.value)} placeholder="Message ID, receipt, count sheet, or observation" /></label>
      <div className="form-actions"><button className="text-link" disabled={busy || Boolean(action.confirmation)} onClick={onCancel} type="button">Cancel</button><button className="core-button primary compact" disabled={busy} type="submit">{busy ? 'Applying…' : action.confirmation ? 'Retry same confirmation' : 'Confirm and record'}</button></div>
      {error || action.confirmation ? <p className="form-notice" role="status">{error || 'This command proof is frozen. Any retry reuses the same command and evidence; reload can reconcile managed state.'}</p> : null}
    </form>
  </section>
}

function ActionHistory({ actions, domain }: { actions: AccountableAction[]; domain: ActionDomain }) {
  const domainActions = actions.filter((action) => action.domain === domain)
  return <details className="core-panel action-history">
    <summary><span>Action history</span><strong>{domainActions.length} accountable records</strong></summary>
    {domainActions.length ? <div className="action-history-list">{domainActions.slice(0, 6).map((action) => <article key={action.id}><div><strong>{action.summary}</strong><small>{action.id} · {action.actor} · {formatTime(action.capturedAt)}</small></div><p>{action.before} → {action.after}</p><small>{action.reason} · Evidence: {action.evidenceReference}</small></article>)}</div> : <p className="panel-copy">No accountable action has been confirmed in this local workspace.</p>}
  </details>
}

function Brand() {
  return (
    <Link className="core-brand" to="/" aria-label="SuperMega app home">
      <span className="core-brand-mark" aria-hidden="true">&gt;_</span>
      <span className="core-brand-name">SUPERMEGA</span>
    </Link>
  )
}

function useRuntimeHealth() {
  const [runtime, setRuntime] = useState<RuntimeHealth>(checkingRuntime)

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/health', { headers: { accept: 'application/json' }, signal: controller.signal })
      .then(async (response) => {
        const type = response.headers.get('content-type') ?? ''
        if (!response.ok || !type.includes('application/json')) throw new Error('health_unavailable')
        const body = (await response.json()) as {
          status?: string
          operating_mode?: string
          enterprise_db_ready?: boolean
          security_ready?: boolean
          coverage_score?: number
          trial_backend?: { write_enabled?: boolean }
          enterprise_activation?: { requirements?: string[] }
        }
        const requirements = Array.isArray(body.enterprise_activation?.requirements) ? body.enterprise_activation.requirements : []
        const writesReady = body.trial_backend?.write_enabled === true
        const enterpriseReady = body.status === 'ready'
          && body.operating_mode === 'managed_trial'
          && body.enterprise_db_ready === true
          && body.security_ready === true
          && writesReady
          && requirements.length === 0
        setRuntime({
          status: enterpriseReady ? 'enterprise' : 'demo',
          serviceStatus: body.status ?? 'unknown',
          operatingMode: body.operating_mode ?? 'unknown',
          enterpriseDbReady: body.enterprise_db_ready === true,
          securityReady: body.security_ready === true,
          writesReady,
          coverageScore: Number.isFinite(body.coverage_score) ? Number(body.coverage_score) : 0,
          requirements,
        })
      })
      .catch(() => {
        if (!controller.signal.aborted) setRuntime({ ...checkingRuntime, status: 'demo', serviceStatus: 'unavailable', operatingMode: 'isolated_demo', requirements: ['Restore the application health endpoint before activating a managed workspace.'] })
      })
    return () => controller.abort()
  }, [])

  return runtime
}

function RuntimeBadge({ status }: { status: RuntimeStatus }) {
  return <span className={`runtime-badge ${status}`}><i />{status === 'checking' ? 'Checking' : status === 'enterprise' ? 'Managed' : 'Local trial'}</span>
}

export function CoreLayout() {
  const location = useLocation()
  const runtime = useRuntimeHealth()
  const routeName = location.pathname.startsWith('/settings/')
    ? 'Settings'
    : navigation.find((item) => item.to !== '/' && location.pathname.startsWith(item.to))?.label ?? 'Home'

  useEffect(() => {
    document.title = `${routeName} | SuperMega`
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [location.pathname, location.search, routeName])

  return (
    <div className="core-shell">
      <a className="core-skip" href="#workspace-main">Skip to workspace</a>
      <aside className="core-sidebar">
        <Brand />
        <nav className="core-nav" aria-label="Application">
          {navigation.map((item) => <NavLink className={({ isActive }) => isActive ? 'active' : ''} end={item.end} key={item.to} to={item.to}>{item.label}</NavLink>)}
        </nav>
        <div className="sidebar-foot"><RuntimeBadge status={runtime.status} /><NavLink to="/settings/">Settings</NavLink></div>
      </aside>
      <div className="core-stage">
        <header className="core-topbar"><div className="mobile-brand"><Brand /></div><div className="topbar-title"><strong>{routeName}</strong><span>SuperMega HQ</span></div><div className="topbar-meta"><NavLink to="/settings/">Settings</NavLink><RuntimeBadge status={runtime.status} /></div></header>
        <nav className="mobile-nav" aria-label="Mobile application">{navigation.map((item) => <NavLink className={({ isActive }) => isActive ? 'active' : ''} end={item.end} key={item.to} to={item.to}>{item.label}</NavLink>)}</nav>
        <main id="workspace-main" className="core-main"><Outlet context={runtime} /></main>
      </div>
    </div>
  )
}

export function PageHeading({ eyebrow, title, copy, actions }: { eyebrow: string; title: string; copy: string; actions?: ReactNode }) {
  return <header className="page-heading"><div><span className="core-eyebrow">{eyebrow}</span><h1>{title}</h1><p>{copy}</p></div>{actions ? <div className="heading-actions">{actions}</div> : null}</header>
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty-state"><span>&gt;_</span><p>{children}</p></div>
}

function ApprovalReviewDialog({ approval, onClose, onDecision }: { approval: Approval; onClose: () => void; onDecision: (status: 'approved' | 'declined', reviewer: string, note: string) => Promise<void> | void }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const reviewerInputRef = useRef<HTMLInputElement>(null)
  const [reviewer, setReviewer] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const dialog = dialogRef.current
    const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    if (dialog && !dialog.open) dialog.showModal()
    reviewerInputRef.current?.focus()
    return () => {
      if (dialog?.open) dialog.close()
      returnFocus?.focus()
    }
  }, [])

  async function decide(status: 'approved' | 'declined') {
    if (!reviewer.trim() || !note.trim()) {
      setError('Name the human reviewer and record the reason for this decision.')
      return
    }
    setBusy(true)
    setError('')
    try {
      await onDecision(status, reviewer.trim(), note.trim())
    } catch (decisionError) {
      setError(decisionError instanceof Error ? decisionError.message : 'The decision was not recorded. Try again.')
      setBusy(false)
    }
  }

  return (
    <dialog aria-labelledby="decision-dialog-title" className="decision-dialog" onCancel={(event) => { event.preventDefault(); onClose() }} ref={dialogRef}>
      <div className="panel-head"><div><span className="core-eyebrow">Human decision</span><h2 id="decision-dialog-title">{approval.title}</h2></div><button aria-label="Close decision review" className="text-link" onClick={onClose} type="button">Close</button></div>
      <div className="decision-packet-meta"><span><small>Contract</small><strong>{approval.packet.contract}</strong></span><span><small>Subject</small><strong>{approval.packet.subject.kind} · v{approval.packet.subject.version}</strong></span><span><small>Requested by</small><strong>{approval.requestedBy} · {approval.requestedActorKind}</strong></span><span><small>Captured</small><strong>{formatTime(approval.createdAt)}</strong></span></div>
      <div className="decision-packet-copy"><span>Decision requested</span><p>{approval.packet.decision}</p><small>{approval.packet.artifactReference}</small></div>
      <div className="decision-outcomes"><span><small>Baseline</small><strong>{approval.packet.baseline}</strong></span><span><small>Target</small><strong>{approval.packet.target}</strong></span><span><small>Current result</small><strong>{approval.packet.result}</strong></span><span><small>Acceptance</small><strong>{approval.packet.acceptance}</strong></span></div>
      <div className="decision-evidence"><span>Claims and provenance</span>{approval.packet.claims.map((claim) => <article key={claim.id}><div><strong>{claim.statement}</strong><small>{claim.claimType} · {claim.sourceReference} · {claim.uncertainty} uncertainty · {claim.visibility} · {formatTime(claim.capturedAt)}{claim.digest ? ` · ${claim.digest}` : ''}</small></div><span className={`status-pill ${claim.status === 'verified' ? 'approved' : 'pending'}`}>{claim.status}</span></article>)}</div>
      <div className="decision-fields"><label>Human reviewer<input autoFocus maxLength={80} onChange={(event) => setReviewer(event.target.value)} placeholder="Name or accountable role" ref={reviewerInputRef} required value={reviewer} /></label><label>Decision note<textarea maxLength={240} onChange={(event) => setNote(event.target.value)} placeholder="Why this is approved or declined, and any boundary." required value={note} /></label></div>
      <p className="form-notice" role="status">{error || 'Agents and services may prepare this packet; only a named human can make the terminal decision.'}</p>
      <div className="form-actions"><button className="core-button danger" disabled={busy} onClick={() => void decide('declined')} type="button">Decline and record</button><button className="core-button primary" disabled={busy} onClick={() => void decide('approved')} type="button">{busy ? 'Recording…' : 'Approve and record'}</button></div>
    </dialog>
  )
}

export function OverviewPage() {
  const runtime = useOutletContext<RuntimeHealth>()
  const [managedIdentity] = useManagedIdentity(runtime.status === 'enterprise')
  const [commerce] = useCommerceWorkspace(managedIdentity)
  const [production] = useProductionWorkspace()
  const [approvals, setApprovals] = useApprovalWorkspace()
  const [setup] = useSetupWorkspace()
  const [workspace] = useTeamWorkspace()
  const [brief, setBrief] = useState<string[]>([])
  const [selectedApprovalId, setSelectedApprovalId] = useState('')
  const [briefNotice, setBriefNotice] = useState('')
  const [briefBusy, setBriefBusy] = useState(false)
  const openWork = workspace.items.filter((item) => item.status !== 'done')
  const activeWork = workspace.items.filter((item) => ['in_progress', 'review'].includes(item.status))
  const blockedWork = workspace.items.filter((item) => item.status === 'blocked')
  const visibleWork = workspace.items.filter((item) => ['in_progress', 'review', 'blocked'].includes(item.status))
  const homeWork = visibleWork.slice(0, 3)
  const pendingApprovals = approvals.filter((item) => item.status === 'pending')
  const lowStock = commerce.items.filter((item) => item.onHand <= item.reorderAt)
  const openProductionIssues = production.issues.filter((issue) => issue.status === 'open')
  const openOrders = commerce.orders.filter((order) => order.status !== 'completed' && order.status !== 'cancelled')
  const agentHandoffs = workspace.agents.filter((agent) => ['waiting_review', 'blocked'].includes(agent.state) && !blockedWork.some((item) => item.id === agent.assignedWorkItemId))
  const releaseComplete = workspace.release.checks.filter((check) => check.complete).length
  const releasePercent = Math.round((releaseComplete / workspace.release.checks.length) * 100)
  const isPilotReady = pilotReady(setup)
  const operatingExceptions = lowStock.length + openProductionIssues.length
  const ownerAttention = blockedWork.length + pendingApprovals.length + agentHandoffs.length + operatingExceptions + (isPilotReady ? 0 : 1)
  const selectedApproval = pendingApprovals.find((approval) => approval.id === selectedApprovalId)

  useEffect(() => {
    if (!managedIdentity) return undefined
    let active = true
    loadManagedBootstrap()
      .then((bootstrap) => {
        if (!active) return
        setApprovals((current) => mergeManagedApprovals(current, bootstrap.approvals))
        setBriefNotice(`Connected to ${managedIdentity.workspaceId}; approval records are managed.`)
      })
      .catch((error) => {
        if (active) setBriefNotice(error instanceof Error ? error.message : 'Managed approvals could not be loaded.')
      })
    return () => { active = false }
  }, [managedIdentity, setApprovals])

  function prepareCompanyBrief() {
    setBrief([
      `${openWork.length} company work items remain open; ${activeWork.length} are in delivery or review across ${workspace.agents.length} delegated role records.`,
      `${openOrders.length} Commerce orders, ${lowStock.length} stock exceptions, and ${openProductionIssues.length} Production issues need operating attention.`,
      `${workspace.release.name} is ${releasePercent}% ready from ${workspace.release.checks.length} explicit checks.`,
      isPilotReady ? `${setup.workspace} pilot starts from ${setup.entryPoint}; baseline: ${setup.baseline}; target: ${setup.targetOutcome}.` : `Pilot definition is ${pilotProgress(setup)}% complete and still needs a baseline, target, authority boundary, and acceptance evidence.`,
    ])
  }

  async function requestBriefApproval() {
    const createdAt = new Date().toISOString()
    const approvalId = uid('APR')
    const claimSources = ['local://teams/work-register', 'local://operations', 'local://teams/product/release-checks', 'local://settings/pilot-definition']
    const claims: DecisionClaim[] = brief.map((statement, index) => ({
      id: `${approvalId}-CLM-${index + 1}`,
      claimType: index === brief.length - 1 ? 'analysis' : 'fact',
      statement,
      sourceReference: claimSources[index] ?? 'local://workspace',
      capturedAt: createdAt,
      status: 'observed',
      uncertainty: index === brief.length - 1 ? 'medium' : 'low',
      visibility: 'private',
    }))
    const packet: DecisionPacket = {
      contract: 'decision_packet.v1',
      subject: { kind: 'company_brief', id: approvalId, version: 1 },
      decision: 'Confirm this operating brief and authorize named owners to proceed inside the recorded human authority boundary.',
      claims,
      baseline: setup.baseline.trim() || 'Not recorded',
      target: setup.targetOutcome.trim() || 'Not recorded',
      result: isPilotReady ? 'Pilot definition ready; no measured operating result is claimed yet.' : 'Pilot definition incomplete; no operating result is claimed.',
      acceptance: setup.acceptanceEvidence.trim() || 'Not recorded',
      artifactReference: 'local://exports/supermega-trial-evidence',
    }
    const packetFingerprint = decisionPacketFingerprint(packet)
    const existing = pendingApprovals.find((approval) => approval.title === 'Review the current company brief and owner decisions' && approval.packetFingerprint === packetFingerprint)
    if (existing) {
      setSelectedApprovalId(existing.id)
      return
    }
    const approval: Approval = {
      id: approvalId,
      commandId: commandUuid(),
      createdAt,
      title: 'Review the current company brief and owner decisions',
      requestedBy: setup.owner.trim() || 'Local workspace operator',
      requestedActorKind: 'human',
      packet,
      packetFingerprint,
      status: 'pending',
    }
    if (!managedIdentity) {
      setApprovals((current) => [approval, ...current.map((candidate) => candidate.status === 'pending' && candidate.title === approval.title ? { ...candidate, status: 'superseded' as const } : candidate)])
      setSelectedApprovalId(approval.id)
      setBriefNotice('Saved in this browser. Sign in from Settings to create a managed approval record.')
      return
    }

    const request = toManagedApprovalRequest(approval)
    if (!request) {
      setBriefNotice('The approval packet is incomplete and was not sent.')
      return
    }
    setBriefBusy(true)
    setBriefNotice('Recording the approval request…')
    try {
      const managedApproval = fromManagedApproval(await createManagedApproval(request))
      setApprovals((current) => [managedApproval, ...current.filter((candidate) => candidate.id !== managedApproval.id).map((candidate) => candidate.status === 'pending' && candidate.title === managedApproval.title ? { ...candidate, status: 'superseded' as const } : candidate)])
      setSelectedApprovalId(managedApproval.id)
      setBriefNotice(`Approval recorded in ${managedIdentity.workspaceId}.`)
    } catch (error) {
      setBriefNotice(error instanceof Error ? error.message : 'The approval was not recorded. No local fallback was claimed.')
    } finally {
      setBriefBusy(false)
    }
  }

  async function setApprovalStatus(id: string, status: 'approved' | 'declined', reviewer: string, note: string) {
    const approval = approvals.find((candidate) => candidate.id === id)
    if (!approval) throw new Error('The approval record is no longer available.')
    if (approval.managed) {
      const updated = fromManagedApproval(await decideManagedApproval(id, {
        command_id: commandUuid(),
        decision: status,
        note,
      }))
      setApprovals((current) => current.map((candidate) => candidate.id === id ? updated : candidate))
      setBriefNotice(`Decision recorded in ${managedIdentity?.workspaceId ?? 'the managed workspace'}.`)
    } else {
      setApprovals((current) => current.map((candidate) => candidate.id === id ? { ...candidate, status, decidedAt: new Date().toISOString(), decidedBy: reviewer, decidedActorKind: 'human', decisionNote: note } : candidate))
    }
    setSelectedApprovalId('')
  }

  return (
    <div className="workspace-screen command-screen">
      <PageHeading
        actions={ownerAttention
          ? <a className="core-button primary" href="#owner-priorities">Review {ownerAttention} {ownerAttention === 1 ? 'priority' : 'priorities'}</a>
          : <Link className="core-button primary" to="/operations/commerce/?tab=today">Open Commerce</Link>}
        copy="Open a product to do the work, or review the few items that need your decision."
        eyebrow="Home"
        title="Run what matters today."
      />
      <nav aria-label="Products" className="product-launcher">
        <Link to="/operations/commerce/?tab=today">
          <span><strong>Commerce</strong><small>Orders, stock and payments</small></span>
          <b>{openOrders.length ? `${openOrders.length} open` : 'Ready'}</b>
        </Link>
        <Link to="/operations/production/?tab=today">
          <span><strong>Production</strong><small>Jobs, output and equipment</small></span>
          <b>{openProductionIssues.length ? `${openProductionIssues.length} issue` : 'Ready'}</b>
        </Link>
        <Link to="/products/website/">
          <span><strong>Website</strong><small>Pages and order handoff</small></span>
          <b>Open</b>
        </Link>
      </nav>
      <div className="command-grid">
        <section className="core-panel command-queue-panel">
          <div className="panel-head"><div><span className="core-eyebrow">Active work</span><h2>{visibleWork.length} items in motion</h2></div><Link className="text-link" to="/work/?team=product&view=work">View all work</Link></div>
          <div className="record-list">{homeWork.map((item) => { const team = teamDefinitions.find((definition) => definition.id === item.team); return <Link className="record-row" key={item.id} to={`/work/?team=${item.team}&view=work&item=${item.id}`}><span className={`record-status ${item.status}`} /><span><strong>{item.title}</strong><small>{team?.label ?? item.team} / {item.owner} / {item.evidence.length} evidence</small></span><span><b>{item.priority}</b><small>{item.status.replace('_', ' ')}</small></span></Link> })}</div>
        </section>
        <section className="core-panel attention-panel" id="owner-priorities">
          <div className="panel-head"><div><span className="core-eyebrow">Needs you</span><h2>{ownerAttention} {ownerAttention === 1 ? 'priority' : 'priorities'}</h2></div></div>
          <div className="attention-list">
            {!isPilotReady ? <Link to="/settings/"><span>Pilot</span><strong>Define the measurable workflow</strong><small>{pilotProgress(setup)}% complete · baseline and acceptance required</small></Link> : null}
            {blockedWork.map((item) => <Link key={item.id} to={`/work/?team=${item.team}&view=work&item=${item.id}`}><span>Work</span><strong>{item.title}</strong><small>{item.owner}</small></Link>)}
            {agentHandoffs.map((agent) => <Link key={agent.id} to={`/work/?team=${agent.team}&view=agents&agent=${agent.id}`}><span>Agent</span><strong>{agent.name} {agent.state === 'waiting_review' ? 'needs review' : 'is blocked'}</strong><small>{agent.humanOwner} / {agent.assignedWorkItemId ?? 'unassigned'}</small></Link>)}
            {pendingApprovals.map((approval) => <button className="attention-action" key={approval.id} onClick={() => setSelectedApprovalId(approval.id)} type="button"><span>{approval.managed ? 'Managed approval' : 'Approval'}</span><strong>{approval.title}</strong><small>{approval.packet.claims.length} claims · {formatTime(approval.createdAt)}</small><b>Review</b></button>)}
            {lowStock.map((item) => <Link key={item.sku} to="/operations/commerce/?tab=inventory"><span>Stock</span><strong>{item.name}</strong><small>{item.onHand} on hand · reorder at {item.reorderAt}</small></Link>)}
            {openProductionIssues.map((issue) => <Link key={issue.id} to="/operations/production/?tab=control"><span>{issue.kind}</span><strong>{issue.summary}</strong><small>{issue.area}</small></Link>)}
            {!ownerAttention ? <Empty>No owner decision needs attention.</Empty> : null}
          </div>
        </section>
        <section className="core-panel release-brief-panel">
          <div className="release-line"><div><span className="core-eyebrow">Product release</span><h2>{workspace.release.name}</h2></div><strong>{releasePercent}%</strong></div>
          <div className="progress-track"><i style={{ width: `${releasePercent}%` }} /></div>
          <Link className="release-review-link" to="/work/?team=product&view=review">Review release checks</Link>
          <details className="company-brief-disclosure"><summary>Company brief</summary><button className="text-link" onClick={prepareCompanyBrief} type="button">Prepare brief</button>{brief.length ? <div className="brief-output compact">{brief.map((line) => <p key={line}>{line}</p>)}<button className="core-button compact" disabled={briefBusy} onClick={() => void requestBriefApproval()} type="button">{briefBusy ? 'Recording…' : 'Request owner review'}</button></div> : <p className="panel-copy">Prepared locally from visible work and operating records.</p>}{briefNotice ? <p className="form-notice" role="status">{briefNotice}</p> : null}</details>
        </section>
      </div>
      {selectedApproval ? <ApprovalReviewDialog approval={selectedApproval} onClose={() => setSelectedApprovalId('')} onDecision={(status, reviewer, note) => setApprovalStatus(selectedApproval.id, status, reviewer, note)} /> : null}
    </div>
  )
}

export function OperationsPage() {
  const runtime = useOutletContext<RuntimeHealth>()
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [setup] = useSetupWorkspace()
  const [managedIdentity] = useManagedIdentity(runtime.status === 'enterprise')
  const routeModule = location.pathname.split('/').filter(Boolean)[1]
  const requestedView = searchParams.get('view')
  const view: ProductId = routeModule === 'production' || requestedView === 'production' || requestedView === 'plant' ? 'production' : 'commerce'
  const commerceTab = commerceTabs.some((tab) => tab.id === searchParams.get('tab')) ? searchParams.get('tab') as CommerceTab : 'today'
  const productionTab = productionTabs.some((tab) => tab.id === searchParams.get('tab')) ? searchParams.get('tab') as ProductionTab : 'today'
  const activeTab = view === 'commerce' ? commerceTab : productionTab
  const activeTemplate = templateFor(view, setup.product === view ? setup.template : '')
  const configuredProfile = setup.product === view && Boolean(setup.savedAt)
  const profileLabel = configuredProfile && setup.workspace.trim() ? setup.workspace : 'Template profile'
  const profileMeasure = configuredProfile && setup.targetOutcome.trim() ? setup.targetOutcome : activeTemplate.metric
  const operationsCopy = view === 'commerce'
    ? 'Orders from the channels customers use, then stock, fulfilment, payment, and close.'
    : 'Plan, output, equipment, quality, maintenance, and shift exceptions in one operating record.'

  useEffect(() => {
    const canonicalPath = `/operations/${view}/`
    if (location.pathname !== canonicalPath || requestedView) navigate(`${canonicalPath}?tab=${activeTab}`, { replace: true })
  }, [activeTab, location.pathname, navigate, requestedView, view])

  function setMode(nextView: ProductId) {
    navigate(`/operations/${nextView}/?tab=today`)
  }

  function setTab(tab: CommerceTab | ProductionTab) {
    navigate(`/operations/${view}/?tab=${tab}`, { replace: true })
  }

  const tabs = view === 'commerce' ? commerceTabs : productionTabs

  return (
    <div className="workspace-screen operations-screen">
      <PageHeading eyebrow="Products" title={view === 'commerce' ? 'Commerce' : 'Production'} copy={`${operationsCopy} Measure: ${profileMeasure}.`} actions={<div className="operations-profile"><span>{profileLabel}</span><strong>{activeTemplate.name}</strong><Link className="text-link" to="/settings/">Configure</Link></div>} />
      <div className="workspace-toolbar operations-toolbar">
        <div className="segmented-control" role="group" aria-label="Operating workspace"><button aria-pressed={view === 'commerce'} onClick={() => setMode('commerce')} type="button">Commerce</button><button aria-pressed={view === 'production'} onClick={() => setMode('production')} type="button">Production</button></div>
        <div className="operations-toolbar-actions"><nav className="view-tabs" aria-label="Module views">{tabs.map((tab) => <button aria-current={activeTab === tab.id ? 'page' : undefined} key={tab.id} onClick={() => setTab(tab.id)} type="button">{tab.label}</button>)}</nav></div>
      </div>
      <div className="workspace-view">{view === 'commerce' ? <CommercePage managedIdentity={managedIdentity} tab={commerceTab} /> : <ProductionPage tab={productionTab} />}</div>
    </div>
  )
}

function CommercePage({ managedIdentity, tab }: { managedIdentity: ManagedIdentity | null; tab: CommerceTab }) {
  const [commerce, mutateCommerce, commerceStorageError, workspaceMode, managedVersion, managedWorkspaceId] = useCommerceWorkspace(managedIdentity)
  const [actions, setActions] = useStoredState<AccountableAction[]>(ACTION_KEY, [], normalizeActions)
  const [pendingAction, setPendingAction] = useState<PendingAccountableAction | null>(null)
  const [sku, setSku] = useState(commerce.items[0]?.sku ?? '')
  const [quantity, setQuantity] = useState(1)
  const [customer, setCustomer] = useState('')
  const [channel, setChannel] = useState('Messenger')
  const [payment, setPayment] = useState('KBZPay')
  const [notice, setNotice] = useState('')
  const [catalogDraft, setCatalogDraft] = useState({ sku: '', name: '', onHand: '', reorderAt: '', price: '', reason: '', evidenceReference: '' })
  const [itemDraft, setItemDraft] = useState({ sku: '', name: '', onHand: '', reorderAt: '', price: '' })
  const [catalogBusy, setCatalogBusy] = useState(false)
  const [catalogError, setCatalogError] = useState('')
  const selectedSku = commerce.items.some((item) => item.sku === sku) ? sku : commerce.items[0]?.sku ?? ''
  const selected = commerce.items.find((item) => item.sku === selectedSku)
  const orderValue = commerce.orders.filter((order) => order.status !== 'cancelled').reduce((total, order) => total + order.total, 0)
  const closableOrders = commerce.orders.filter((order) => order.status === 'completed' && order.paymentStatus === 'reconciled')
  const reconciledValue = closableOrders.reduce((total, order) => total + order.total, 0)
  const lowStock = commerce.items.filter((item) => item.onHand <= item.reorderAt)
  const openOrders = commerce.orders.filter((order) => order.status !== 'completed' && order.status !== 'cancelled')
  const paymentReview = commerce.orders.filter((order) => order.refundStatus === 'due' || (order.status !== 'cancelled' && order.paymentStatus === 'pending'))
  const importedWebsiteOrderIds = commerce.orders.flatMap((order) => order.sourceRecordId ? [order.sourceRecordId] : [])
  const websiteIntakes = commerceWebsiteIntakes(commerce)

  async function initializeManagedCatalog(event: FormEvent) {
    event.preventDefault()
    if (!managedIdentity) return
    const skuValue = catalogDraft.sku.trim().toUpperCase()
    const name = catalogDraft.name.trim()
    const onHand = Number(catalogDraft.onHand)
    const reorderAt = Number(catalogDraft.reorderAt)
    const price = Number(catalogDraft.price)
    const reason = catalogDraft.reason.trim()
    const evidenceReference = catalogDraft.evidenceReference.trim()
    if (!skuValue || !name || !reason || !evidenceReference || ![onHand, reorderAt, price].every(Number.isSafeInteger) || onHand < 0 || reorderAt < 0 || price < 1) {
      setCatalogError('Enter a valid item, whole-number stock boundaries, price, reason, and evidence reference.')
      return
    }
    const proof: CommerceActionProof = {
      actionId: uid('ACT'),
      capturedAt: new Date().toISOString(),
      actor: managedIdentity.userId,
      reason,
      evidenceReference,
    }
    setCatalogBusy(true)
    setCatalogError('')
    try {
      await mutateCommerce('commerce.workspace.initialized', commandUuid(), proof, (current) => current.items.length || current.orders.length || current.movements.length || current.closes.length || commerceWebsiteIntakes(current).length ? null : validateCommerceState({
        ...current,
        items: [{ sku: skuValue, name, onHand, reorderAt, price }],
      }))
      setNotice(`Managed catalog initialized with ${skuValue}.`)
    } catch (error) {
      setCatalogError(error instanceof Error ? error.message : 'The managed catalog was not initialized.')
    } finally {
      setCatalogBusy(false)
    }
  }

  const effectiveMode = managedIdentity && (workspaceMode === 'local' || managedWorkspaceId !== managedIdentity.workspaceId) ? 'managed-loading' : workspaceMode
  if (managedIdentity && effectiveMode !== 'managed-ready') {
    const unprovisioned = effectiveMode === 'managed-unprovisioned'
    if (unprovisioned) return <section className="core-panel managed-commerce-boundary">
      <div className="panel-head"><div><span className="core-eyebrow">Managed Commerce setup</span><h2>Create the real catalog</h2></div><span className="status-pill pending">Not provisioned</span></div>
      <p className="panel-copy">Start with the first real inventory item. No browser demo orders, customers, or stock records are copied into this workspace.</p>
      <form className="core-form compact-form" onSubmit={(formEvent) => void initializeManagedCatalog(formEvent)}>
        <div className="form-row"><label>SKU<input maxLength={80} onChange={(inputEvent) => setCatalogDraft((current) => ({ ...current, sku: inputEvent.target.value }))} placeholder="SKU-001" required value={catalogDraft.sku} /></label><label>Item name<input maxLength={180} onChange={(inputEvent) => setCatalogDraft((current) => ({ ...current, name: inputEvent.target.value }))} placeholder="Real item name" required value={catalogDraft.name} /></label></div>
        <div className="form-row"><label>Opening stock<input min="0" onChange={(inputEvent) => setCatalogDraft((current) => ({ ...current, onHand: inputEvent.target.value }))} required step="1" type="number" value={catalogDraft.onHand} /></label><label>Reorder at<input min="0" onChange={(inputEvent) => setCatalogDraft((current) => ({ ...current, reorderAt: inputEvent.target.value }))} required step="1" type="number" value={catalogDraft.reorderAt} /></label></div>
        <label>Price (MMK)<input min="1" onChange={(inputEvent) => setCatalogDraft((current) => ({ ...current, price: inputEvent.target.value }))} required step="1" type="number" value={catalogDraft.price} /></label>
        <label>Opening balance reason<input maxLength={180} onChange={(inputEvent) => setCatalogDraft((current) => ({ ...current, reason: inputEvent.target.value }))} placeholder="How the opening count was verified" required value={catalogDraft.reason} /></label>
        <label>Evidence reference<input maxLength={180} onChange={(inputEvent) => setCatalogDraft((current) => ({ ...current, evidenceReference: inputEvent.target.value }))} placeholder="Count sheet, stocktake, or source record" required value={catalogDraft.evidenceReference} /></label>
        <div className="form-actions"><Link className="text-link" to="/settings/">Workspace settings</Link><button className="core-button primary" disabled={catalogBusy} type="submit">{catalogBusy ? 'Creating…' : 'Create managed catalog'}</button></div>
        <p className="form-notice" role="status">{catalogError || commerceStorageError || `Authenticated as ${managedIdentity.email}. The tenant API records this initialization.`}</p>
      </form>
    </section>
    return <section className="core-panel managed-commerce-boundary">
      <div className="panel-head"><div><span className="core-eyebrow">Managed Commerce</span><h2>{effectiveMode === 'managed-error' ? 'Managed workspace unavailable' : 'Loading authenticated workspace'}</h2></div><span className="status-pill bounded">{effectiveMode === 'managed-error' ? 'Blocked' : 'Checking'}</span></div>
      <p className="panel-copy">{commerceStorageError || 'Commerce remains read-only until the authenticated tenant state is confirmed.'}</p>
      <div className="form-actions"><Link className="core-button" to="/settings/">Open workspace settings</Link></div>
    </section>
  }

  const sourceNotice = <p className="form-notice commerce-source-notice" role="status">{managedIdentity ? `Managed workspace ${managedIdentity.workspaceId} · revision ${managedVersion ?? 0} · writes are confirmed by the tenant API.` : 'Browser demo · data stays on this device and is not a managed business record.'}</p>

  function queueAction(action: Omit<PendingAccountableAction, 'id' | 'commandId' | 'domain'>): boolean {
    if (pendingAction) {
      setNotice(`Finish or cancel ${pendingAction.id} before reviewing another change.`)
      return false
    }
    setPendingAction({ ...action, id: uid('ACT'), commandId: commandUuid(), domain: 'commerce' })
    setNotice('Review the change, accountable operator, and evidence before it is applied.')
    return true
  }

  function queueCatalogItem(event: FormEvent) {
    event.preventDefault()
    const itemSku = itemDraft.sku.trim().toUpperCase()
    const name = itemDraft.name.trim()
    const onHand = Number(itemDraft.onHand)
    const reorderAt = Number(itemDraft.reorderAt)
    const price = Number(itemDraft.price)
    if (!itemSku || !name
      || !Number.isSafeInteger(onHand) || onHand < 0
      || !Number.isSafeInteger(reorderAt) || reorderAt < 0
      || !Number.isSafeInteger(price) || price < 1) {
      setNotice('Enter a SKU, item name, non-negative opening and reorder quantities, and a whole-MMK price.')
      return
    }
    if (commerce.items.some((item) => item.sku === itemSku)) {
      setNotice(`${itemSku} already exists. No catalog item was queued.`)
      return
    }
    const item: CommerceItem = { sku: itemSku, name, onHand, reorderAt, price }
    queueAction({
      kind: 'catalog_item_create',
      subjectId: item.sku,
      summary: `Add ${item.sku} to the catalog`,
      before: 'No catalog item',
      after: `${item.name} · ${item.onHand.toLocaleString()} opening units`,
      apply: async (action) => {
        const proof = commerceActionProof(action)
        await mutateCommerce('commerce.item.created', action.commandId, proof, (current) => registerCommerceItem(current, item, proof))
        setItemDraft({ sku: '', name: '', onHand: '', reorderAt: '', price: '' })
        setSku(item.sku)
      },
    })
  }

  async function confirmAction(details: ActionDetails) {
    if (!pendingAction) return
    const record = confirmAccountableAction(
      pendingAction,
      managedIdentity ? { ...details, actor: managedIdentity.userId } : details,
    )
    if (!pendingAction.confirmation) {
      setPendingAction((current) => current?.id === pendingAction.id
        ? { ...current, confirmation: record }
        : current)
    }
    await pendingAction.apply(record)
    if (!managedIdentity) setActions((current) => [record, ...current])
    setNotice(managedIdentity ? `${record.id} confirmed by the managed Commerce API.` : `${record.id} applied and added to the action history.`)
    setPendingAction(null)
  }

  function recordOrder(event: FormEvent) {
    event.preventDefault()
    if (!selected || quantity < 1 || selected.onHand < quantity) {
      setNotice('Quantity is not available. Review stock before confirming the order.')
      return
    }
    const order: CommerceOrder = { id: uid('ORD'), createdAt: new Date().toISOString(), customer: customer.trim() || 'Guest', channel, item: selected.name, itemSku: selected.sku, quantity, payment, paymentStatus: 'pending', refundStatus: 'none', total: selected.price * quantity, status: 'confirmed' }
    const itemSku = selected.sku
    const beforeStock = selected.onHand
    queueAction({
      kind: 'order_create',
      subjectId: order.id,
      summary: `Confirm ${order.id} from ${channel}`,
      before: `${itemSku} · ${beforeStock} on hand`,
      after: `${order.status} · ${beforeStock - quantity} on hand`,
      apply: async (action) => {
        await mutateCommerce('commerce.order.created', action.commandId, commerceActionProof(action), (current) => reserveCommerceOrder(current, order, commerceActionProof(action)))
        setQuantity(1)
        setCustomer('')
      },
    })
  }

  function queueWebsiteOrder(record: WebsiteOrderRecord) {
    if (commerce.orders.some((order) => order.id === record.id || order.sourceRecordId === record.id)) {
      setNotice(`${record.id} is already in the Commerce order queue.`)
      return
    }
    if (pendingAction?.kind === 'order_create' && pendingAction.subjectId === record.id) {
      setNotice(`${record.id} is already waiting for accountable confirmation.`)
      return
    }

    const line = record.lines.length === 1 ? record.lines[0] : null
    const matchingItems = line ? commerce.items.filter((item) => item.sku === line.sku) : []
    const item = matchingItems.length === 1 ? matchingItems[0] : null
    if (!line || !item || line.quantity < 1 || item.onHand < line.quantity || item.price !== line.unitPriceMmk || record.totalMmk !== line.quantity * line.unitPriceMmk) {
      setNotice('Website order confirmation failed closed. Recheck the item, immutable price, quantity, and available stock.')
      return
    }

    const paymentLabel = record.paymentMethod === 'cash_on_delivery' ? 'Cash on delivery' : record.paymentMethod === 'manual_qr' ? 'Manual QR review' : 'Manual bank transfer'
    const fulfilmentLabel = record.fulfilmentMethod === 'pickup' ? 'Customer pickup' : 'Local delivery'
    const order: CommerceOrder = {
      id: record.id,
      createdAt: record.createdAt,
      customer: record.customerReference,
      channel: 'Website',
      item: line.itemName,
      itemSku: line.sku,
      quantity: line.quantity,
      payment: paymentLabel,
      paymentStatus: 'pending',
      refundStatus: 'none',
      fulfilment: fulfilmentLabel,
      sourceRecordId: record.id,
      evidenceReference: record.completion.evidenceReference,
      total: record.totalMmk,
      status: 'confirmed',
    }
    const beforeStock = item.onHand
    queueAction({
      kind: 'order_create',
      subjectId: record.id,
      summary: `Confirm ${record.id} from Website`,
      before: `ready for confirmation · ${item.sku} · ${beforeStock} on hand`,
      after: `confirmed · ${fulfilmentLabel} · ${beforeStock - line.quantity} on hand`,
      apply: (action) => mutateCommerce('commerce.order.created', action.commandId, commerceActionProof(action), (current) => reserveCommerceOrder(current, order, commerceActionProof(action))),
    })
  }

  function queueManagedWebsiteIntake(intakeId: string, input: CommerceWebsiteOrderInput): boolean {
    const intake = websiteIntakes.find((candidate) => candidate.id === intakeId && candidate.status === 'pending_confirmation')
    const item = intake ? commerce.items.find((candidate) => candidate.sku === intake.sku) : null
    if (!intake || !item || item.onHand < intake.quantity || item.price !== intake.unitPrice) {
      setNotice('Managed Website intake failed closed. Recheck the retained intake, catalog price, and available stock.')
      return false
    }
    const orderId = `ORD-WEB-${intake.id.slice(5)}`
    if (pendingAction?.kind === 'order_create' && pendingAction.subjectId === orderId) {
      setNotice(`${orderId} is already waiting for authenticated confirmation.`)
      return true
    }
    const fulfilment = input.fulfilmentMethod === 'pickup' ? 'Customer pickup' : 'Local delivery'
    return queueAction({
      kind: 'order_create',
      subjectId: orderId,
      summary: `Confirm ${orderId} from Website`,
      before: `${intake.id} waiting · ${item.onHand} on hand`,
      after: `${fulfilment} · ${item.onHand - intake.quantity} on hand`,
      apply: (action) => mutateCommerce(
        'commerce.website_intake.converted',
        action.commandId,
        commerceActionProof(action),
        (current) => convertCommerceWebsiteIntake(current, intake.id, input, commerceActionProof(action)),
      ),
    })
  }

  function advanceOrder(orderId: string) {
    const order = commerce.orders.find((candidate) => candidate.id === orderId)
    if (!order || order.status === 'completed' || order.status === 'cancelled') return
    if (order.status === 'ready' && order.paymentStatus !== 'reconciled') {
      setNotice(`Reconcile ${order.id} payment before completion.`)
      return
    }
    const next: Record<'confirmed' | 'preparing' | 'ready', CommerceOrderStatus> = { confirmed: 'preparing', preparing: 'ready', ready: 'completed' }
    const nextStatus = next[order.status]
    queueAction({ kind: 'order_status', subjectId: orderId, summary: `Advance ${orderId} fulfilment`, before: order.status, after: nextStatus, apply: (action) => mutateCommerce('commerce.order.advanced', action.commandId, commerceActionProof(action), (current) => advanceCommerceOrder(current, orderId, order.status)) })
  }

  function reconcilePayment(orderId: string) {
    const order = commerce.orders.find((candidate) => candidate.id === orderId)
    if (!order || order.status === 'cancelled') return
    if (order.paymentStatus === 'reconciled') {
      setNotice(`${order.id} payment is already reconciled.`)
      return
    }
    queueAction({ kind: 'payment_reconcile', subjectId: orderId, summary: `Reconcile ${order.id} payment`, before: `${order.payment} · ${order.paymentStatus}`, after: `${order.payment} · reconciled`, apply: (action) => mutateCommerce('commerce.payment.reconciled', action.commandId, commerceActionProof(action), (current) => reconcileCommercePayment(current, orderId, commerceActionProof(action))) })
  }

  function cancelOrder(orderId: string) {
    const order = commerce.orders.find((candidate) => candidate.id === orderId)
    if (!order || order.status === 'completed' || order.status === 'cancelled') return
    if (!commerceOrderHasReleasableReservation(commerce, orderId)) return setNotice(`${order.id} has no unmatched, attributable reservation. Cancellation failed closed without changing stock.`)
    if (!order.itemSku) return
    const item = commerce.items.find((candidate) => candidate.sku === order.itemSku)
    if (!item) {
      setNotice(`${order.id} inventory reference is unavailable, so cancellation failed closed.`)
      return
    }
    const paymentAfter = order.paymentStatus === 'reconciled' ? 'reconciled · refund due' : 'pending'
    queueAction({ kind: 'order_cancel', subjectId: orderId, summary: `Cancel ${order.id} and release stock`, before: `${order.status} · ${item.onHand} on hand · ${order.paymentStatus}`, after: `cancelled · ${item.onHand + order.quantity} on hand · ${paymentAfter}`, apply: (action) => mutateCommerce('commerce.order.cancelled', action.commandId, commerceActionProof(action), (current) => cancelCommerceOrder(current, orderId, commerceActionProof(action))) })
  }

  function restock(itemSku: string) {
    const item = commerce.items.find((candidate) => candidate.sku === itemSku)
    if (!item) return
    queueAction({ kind: 'inventory_receipt', subjectId: itemSku, summary: `Receive 10 units of ${item.name}`, before: `${item.onHand} on hand`, after: `${item.onHand + 10} on hand`, apply: (action) => mutateCommerce('commerce.stock.received', action.commandId, commerceActionProof(action), (current) => receiveCommerceStock(current, itemSku, 10, commerceActionProof(action))) })
  }

  function closeDay() {
    const close = { id: uid('CLOSE'), createdAt: new Date().toISOString(), total: reconciledValue, orders: closableOrders.length }
    queueAction({ kind: 'daily_close', subjectId: close.id, summary: `Save ${close.id} daily close`, before: `${commerce.closes.length} snapshots`, after: `${commerce.closes.length + 1} snapshots · ${formatMoney(close.total)}`, apply: (action) => mutateCommerce('commerce.close.saved', action.commandId, commerceActionProof(action), (current) => current.closes.some((candidate) => candidate.id === close.id) ? current : { ...current, closes: [close, ...current.closes] }) })
  }

  const actionControls = <><AccountableActionGate authenticatedActor={managedIdentity ? { id: managedIdentity.userId, label: managedIdentity.email } : undefined} key={pendingAction?.id ?? 'commerce-idle'} action={pendingAction} onCancel={() => setPendingAction(null)} onConfirm={confirmAction} />{managedIdentity ? null : <ActionHistory actions={actions} domain="commerce" />}</>

  if (tab === 'orders') return <div className="operation-module">{sourceNotice}<WebsiteCommerceIntake catalog={commerce.items} importedSourceIds={importedWebsiteOrderIds} key={`${managedIdentity ? 'managed' : 'local'}:${websiteIntakes.find((intake) => intake.status === 'pending_confirmation')?.id ?? 'none'}`} managedIntakes={websiteIntakes} mode={managedIdentity ? 'managed' : 'local'} onQueueManagedIntake={queueManagedWebsiteIntake} onQueueReadyOrder={queueWebsiteOrder} /><div className="split-workspace order-view">
    <section className="core-panel order-form-panel">
      <div className="panel-head"><div><span className="core-eyebrow">Channel order</span><h2>Enter an order</h2></div><span className="status-pill ready">Stock checked</span></div>
      <form className="core-form compact-form" onSubmit={recordOrder}>
        <div className="form-row">
          <label>Customer<input maxLength={80} value={customer} onChange={(event) => setCustomer(event.target.value)} placeholder="Name or reference" /></label>
          <label>Channel<select value={channel} onChange={(event) => setChannel(event.target.value)}><option>Messenger</option><option>Viber</option><option>Phone</option><option>Website</option><option>Walk-in</option></select></label>
        </div>
        <label>Item<select value={selectedSku} onChange={(event) => setSku(event.target.value)}>{commerce.items.map((item) => <option key={item.sku} value={item.sku}>{item.name} · {item.onHand} available</option>)}</select></label>
        <div className="form-row">
          <label>Quantity<input min="1" max={selected?.onHand ?? 1} type="number" value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} /></label>
          <label>Payment<select value={payment} onChange={(event) => setPayment(event.target.value)}><option>KBZPay</option><option>WavePay</option><option>Cash on delivery</option><option>Cash</option><option>Card</option></select></label>
        </div>
        <div className="order-total"><span>Order total</span><strong>{formatMoney((selected?.price ?? 0) * Math.max(quantity, 0))}</strong></div>
        <button className="core-button primary" type="submit">Review order</button>
        <p className="form-notice" aria-live="polite">{notice || commerceStorageError || 'A responsible operator confirms the change before stock moves. No customer message is sent.'}</p>
      </form>
    </section>
    <section className="core-panel order-queue-panel"><div className="panel-head"><div><span className="core-eyebrow">Fulfilment</span><h2>{openOrders.length} open orders</h2></div><span className="panel-note">{paymentReview.length} payment review</span></div><OrderList canCancel={(orderId) => commerceOrderHasReleasableReservation(commerce, orderId)} onAdvance={advanceOrder} onCancel={cancelOrder} onReconcilePayment={reconcilePayment} orders={commerce.orders} /></section>
  </div>{actionControls}</div>

  if (tab === 'inventory') return <div className="operation-module">
    {sourceNotice}
    <section className="core-panel inventory-panel">
      <div className="panel-head"><div><span className="core-eyebrow">Stock control</span><h2>Inventory and reorder boundaries</h2></div><span className="panel-note">{lowStock.length} at boundary</span></div>
      <div className="data-table" role="table" aria-label="Commerce inventory"><div className="data-row table-head" role="row"><span>Item</span><span>On hand</span><span>Reorder</span><span>Price</span><span>Action</span></div>{commerce.items.map((item) => <div className="data-row" role="row" key={item.sku}><span><strong>{item.name}</strong><small>{item.sku}</small></span><span className={item.onHand <= item.reorderAt ? 'warning-text' : ''}>{item.onHand}</span><span>{item.reorderAt}</span><span>{formatMoney(item.price)}</span><span><button className="text-link" type="button" onClick={() => restock(item.sku)}>Receive +10</button></span></div>)}</div>
      <details className="compact-disclosure catalog-disclosure">
        <summary>Add catalog item</summary>
        <form className="core-form compact-form catalog-create-form" onSubmit={queueCatalogItem}>
          <div className="form-row"><label>SKU<input maxLength={80} onChange={(event) => setItemDraft((current) => ({ ...current, sku: event.target.value }))} placeholder="SKU-002" required value={itemDraft.sku} /></label><label>Item name<input maxLength={180} onChange={(event) => setItemDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Real item name" required value={itemDraft.name} /></label></div>
          <div className="form-row"><label>Opening stock<input min="0" onChange={(event) => setItemDraft((current) => ({ ...current, onHand: event.target.value }))} required step="1" type="number" value={itemDraft.onHand} /></label><label>Reorder at<input min="0" onChange={(event) => setItemDraft((current) => ({ ...current, reorderAt: event.target.value }))} required step="1" type="number" value={itemDraft.reorderAt} /></label></div>
          <label>Price (MMK)<input min="1" onChange={(event) => setItemDraft((current) => ({ ...current, price: event.target.value }))} required step="1" type="number" value={itemDraft.price} /></label>
          <div className="form-actions"><button className="core-button primary compact" disabled={Boolean(pendingAction)} type="submit">Review catalog item</button></div>
          <p className="panel-copy">The opening balance may be zero. A named operator, reason, and evidence are required before the SKU is recorded.</p>
        </form>
      </details>
      <p className="form-notice" aria-live="polite">{notice || commerceStorageError || 'Catalog openings and receipts require attributable confirmation and append one stock movement.'}</p>
    </section>
    <StockMovementHistory movements={commerce.movements} />
    {actionControls}
  </div>

  return <div className="operation-module">{sourceNotice}<div className="module-today"><section className="summary-strip"><span><small>Order value</small><strong>{formatMoney(orderValue)}</strong></span><span><small>Open orders</small><strong>{openOrders.length}</strong></span><span><small>Payment review</small><strong>{paymentReview.length}</strong></span><span><small>Low stock</small><strong>{lowStock.length}</strong></span></section><div className="split-workspace ops-today-grid"><section className="core-panel"><div className="panel-head"><div><span className="core-eyebrow">Order flow</span><h2>Latest channel orders</h2></div><Link className="text-link" to="/operations/commerce/?tab=orders">Open orders</Link></div><OrderList canCancel={(orderId) => commerceOrderHasReleasableReservation(commerce, orderId)} onAdvance={advanceOrder} onCancel={cancelOrder} onReconcilePayment={reconcilePayment} orders={commerce.orders.slice(0, 5)} /></section><section className="core-panel"><div className="panel-head"><div><span className="core-eyebrow">Daily control</span><h2>Exceptions and close</h2></div><span className="panel-note">{commerce.closes.length} snapshots</span></div><div className="exception-summary"><span><strong>{paymentReview.length}</strong><small>payment review</small></span><span><strong>{lowStock.length}</strong><small>reorder boundaries</small></span></div><div className="boundary-list">{lowStock.map((item) => <Link key={item.sku} to="/operations/commerce/?tab=inventory"><strong>{item.name}</strong><small>{item.onHand} on hand</small></Link>)}</div><button className="core-button" onClick={closeDay} type="button">Save daily close</button><p className="form-notice" aria-live="polite">{notice || commerceStorageError || `${closableOrders.length} completed, reconciled orders · ${formatMoney(reconciledValue)} ready to close.`}</p></section></div></div>{actionControls}</div>
}

function OrderList({
  orders,
  canCancel,
  onAdvance,
  onCancel,
  onReconcilePayment,
}: {
  orders: CommerceOrder[]
  canCancel: (id: string) => boolean
  onAdvance: (id: string) => void
  onCancel: (id: string) => void
  onReconcilePayment: (id: string) => void
}) {
  if (!orders.length) return <Empty>No orders recorded.</Empty>
  const nextAction: Record<'confirmed' | 'preparing' | 'ready', string> = { confirmed: 'Start preparing', preparing: 'Mark ready', ready: 'Complete' }
  return <div className="order-list">{orders.map((order) => {
    const active = order.status === 'confirmed' || order.status === 'preparing' || order.status === 'ready'
    const needsPayment = order.paymentStatus === 'pending'
    const reconcileIsPrimary = needsPayment && (order.status === 'ready' || order.status === 'completed')
    const canAdvance = active && !reconcileIsPrimary
    return <article key={order.id}>
      <div>
        <div className="order-statuses">
          <span className={`status-pill ${order.status === 'completed' ? 'approved' : order.status === 'cancelled' ? 'pending' : 'bounded'}`}>{order.status}</span>
          <span className={`status-pill ${order.paymentStatus === 'reconciled' ? 'approved' : 'pending'}`}>payment {order.paymentStatus}</span>
          {order.refundStatus === 'due' ? <span className="status-pill pending">refund due</span> : null}
        </div>
        <strong>{order.customer} · {order.item} × {order.quantity}</strong>
        <small>{order.id} · {order.channel} · {order.payment}{order.fulfilment ? ` · ${order.fulfilment}` : ''} · {formatTime(order.createdAt)}</small>
      </div>
      <div className="order-row-actions">
        <b>{formatMoney(order.total)}</b>
        {reconcileIsPrimary ? <button className="text-link" onClick={() => onReconcilePayment(order.id)} type="button">Reconcile payment</button> : null}
        {canAdvance ? <button className="text-link" onClick={() => onAdvance(order.id)} type="button">{nextAction[order.status as 'confirmed' | 'preparing' | 'ready']}</button> : null}
        {active && canCancel(order.id) ? <button className="text-link subtle" onClick={() => onCancel(order.id)} type="button">Cancel</button> : null}
      </div>
    </article>
  })}</div>
}

function StockMovementHistory({ movements }: { movements: CommerceStockMovement[] }) {
  return <details className="core-panel action-history stock-movement-history">
    <summary><span>Stock movements</span><strong>{movements.length} attributable entries</strong></summary>
    {movements.length ? <div className="action-history-list">{movements.map((movement) => <article key={movement.id}>
      <div>
        <strong>{movement.kind} · {movement.sku} · {movement.quantityDelta > 0 ? '+' : ''}{movement.quantityDelta}</strong>
        <small>{movement.orderId ? `${movement.orderId} · ` : ''}{movement.actionId} · {movement.actor}</small>
        <p>{movement.reason} · Evidence: {movement.evidenceReference}</p>
      </div>
      <small>{formatTime(movement.createdAt)}</small>
    </article>)}</div> : <Empty>No attributable stock movements yet.</Empty>}
  </details>
}

const productionEventLabels: Record<ProductionEvent['kind'], string> = {
  output_recorded: 'Output recorded',
  issue_opened: 'Issue opened',
  issue_resolved: 'Issue resolved',
  machine_state_changed: 'Machine state changed',
}

function ProductionEventHistory({ events }: { events: ProductionEvent[] }) {
  const [showAll, setShowAll] = useState(false)
  const visibleEvents = showAll ? events : events.slice(0, 8)
  return <details className="core-panel action-history production-event-history">
    <summary><span>Production record</span><strong>{events.length} attributed events</strong></summary>
    {visibleEvents.length ? <div className="action-history-list">{visibleEvents.map((event) => <article key={event.id}>
      <div>
        <strong>{productionEventLabels[event.kind]} - {event.summary}</strong>
        <small>{event.subjectId} - {event.actionId} - {event.actor}</small>
        <p>{event.reason} - Evidence: {event.evidenceReference}</p>
      </div>
      <small>{formatTime(event.createdAt)}</small>
    </article>)}</div> : <Empty>No attributed Production event has been recorded yet.</Empty>}
    {events.length > 8 ? <button className="text-link" type="button" onClick={() => setShowAll((current) => !current)}>{showAll ? 'Show latest 8' : `Show all ${events.length}`}</button> : null}
  </details>
}

function ProductionPage({ tab }: { tab: ProductionTab }) {
  const [production, mutateProduction, productionStorageError] = useProductionWorkspace()
  const [, setActions] = useStoredState<AccountableAction[]>(ACTION_KEY, [], normalizeActions)
  const [pendingAction, setPendingAction] = useState<PendingAccountableAction | null>(null)
  const [jobId, setJobId] = useState(production.jobs[0]?.id ?? '')
  const [quantity, setQuantity] = useState(25)
  const [area, setArea] = useState('Line 01')
  const [kind, setKind] = useState<ProductionIssue['kind']>('quality')
  const [summary, setSummary] = useState('')
  const [notice, setNotice] = useState('')
  const output = production.jobs.reduce((total, job) => total + job.output, 0)
  const target = production.jobs.reduce((total, job) => total + job.target, 0)
  const openIssues = production.issues.filter((issue) => issue.status === 'open')
  const selectedJob = production.jobs.find((job) => job.id === jobId)
  const selectedRemaining = selectedJob ? selectedJob.target - selectedJob.output : 0
  const completion = target > 0 ? Math.round((output / target) * 100) : 0

  function queueAction(action: Omit<PendingAccountableAction, 'id' | 'commandId' | 'domain'>) {
    if (pendingAction) {
      setNotice(`Finish or cancel ${pendingAction.id} before reviewing another change.`)
      return
    }
    setPendingAction({ ...action, id: uid('ACT'), commandId: commandUuid(), domain: 'production' })
    setNotice('Review the change, accountable operator, and evidence before it is applied.')
  }

  async function confirmAction(details: ActionDetails) {
    if (!pendingAction) return
    const action = pendingAction
    const record = confirmAccountableAction(action, details)
    if (!action.confirmation) {
      setPendingAction((current) => current?.id === action.id
        ? { ...current, confirmation: record }
        : current)
    }
    await action.apply(record)
    setActions((current) => [record, ...current])
    setNotice(`${record.id} persisted with attributed Production evidence.`)
    setPendingAction(null)
  }

  function recordOutput(event: FormEvent) {
    event.preventDefault()
    if (!Number.isSafeInteger(quantity) || quantity < 1) return setNotice('Enter a whole-unit quantity of at least 1.')
    if (!selectedJob) return setNotice('Choose an active job before recording output.')
    if (selectedRemaining < 1) return setNotice(`${selectedJob.id} is already at target.`)
    if (quantity > selectedRemaining) return setNotice(`Only ${selectedRemaining} units remain for ${selectedJob.id}. No output was recorded.`)
    const recordedJobId = selectedJob.id
    const recordedQuantity = quantity
    queueAction({
      kind: 'production_output',
      subjectId: recordedJobId,
      summary: `Record ${recordedQuantity} good units for ${recordedJobId}`,
      before: `${selectedJob.output} / ${selectedJob.target}`,
      after: `${selectedJob.output + recordedQuantity} / ${selectedJob.target}`,
      apply: async (record) => {
        await mutateProduction((current) => recordProductionOutput(current, recordedJobId, recordedQuantity, productionActionProof(record)))
      },
    })
  }

  function createIssue(event: FormEvent) {
    event.preventDefault()
    if (!summary.trim()) return
    const issue: ProductionIssue = { id: uid('ISS'), createdAt: new Date().toISOString(), area, kind, summary: summary.trim(), status: 'open' }
    queueAction({
      kind: 'issue_create',
      subjectId: issue.id,
      summary: `Open ${issue.kind} issue for ${issue.area}`,
      before: 'No issue record',
      after: `${issue.id} - open`,
      apply: async (record) => {
        await mutateProduction((current) => openProductionIssue(current, issue, productionActionProof(record)))
        setSummary('')
      },
    })
  }

  function resolveIssue(issueId: string) {
    const issue = production.issues.find((candidate) => candidate.id === issueId)
    if (!issue || issue.status === 'resolved') return
    queueAction({
      kind: 'issue_resolution',
      subjectId: issueId,
      summary: `Resolve ${issueId}`,
      before: issue.status,
      after: 'resolved with operator evidence',
      apply: async (record) => {
        await mutateProduction((current) => resolveProductionIssue(current, issueId, productionActionProof(record)))
      },
    })
  }

  function cycleMachine(machineId: string) {
    const machine = production.machines.find((candidate) => candidate.id === machineId)
    if (!machine) return
    const expectedState = machine.state
    const nextState = productionMachineTransitions[expectedState]
    queueAction({
      kind: 'machine_state',
      subjectId: machineId,
      summary: `${productionMachineActionLabels[expectedState]} for ${machine.name}`,
      before: expectedState,
      after: nextState,
      apply: async (record) => {
        await mutateProduction((current) => advanceProductionMachineState(current, machineId, expectedState, productionActionProof(record)))
      },
    })
  }

  const actionControls = <>
    <p className="form-notice" aria-live="polite">{productionStorageError || notice}</p>
    <AccountableActionGate key={pendingAction?.id ?? 'production-idle'} action={pendingAction} onCancel={() => { setPendingAction(null); setNotice('Change cancelled. Production data was not modified.') }} onConfirm={confirmAction} />
    <ProductionEventHistory events={production.events} />
  </>

  if (tab === 'production') return <div className="operation-module">
    <div className="split-workspace production-view">
      <section className="core-panel job-panel">
        <div className="panel-head"><div><span className="core-eyebrow">Production plan</span><h2>Active jobs</h2></div><span className="panel-note">Target is a hard limit</span></div>
        <JobList jobs={production.jobs} />
      </section>
      <section className="core-panel output-panel">
        <span className="core-eyebrow">Good output</span><h2>Confirm production</h2>
        <form className="core-form compact-form" onSubmit={recordOutput}>
          <label>Job<select value={jobId} onChange={(event) => setJobId(event.target.value)}>{production.jobs.map((job) => <option key={job.id} value={job.id}>{job.id}</option>)}</select></label>
          <label>Quantity<input min="1" step="1" type="number" value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} /></label>
          <button className="core-button primary" disabled={!selectedJob || selectedRemaining < 1} type="submit">Record output</button>
          <p className="panel-copy">{selectedJob ? `${selectedRemaining.toLocaleString()} units remain for ${selectedJob.id}.` : 'Choose an active job.'} Every change requires an operator, reason, and evidence.</p>
        </form>
      </section>
    </div>
    {actionControls}
  </div>

  if (tab === 'control') return <div className="operation-module">
    <div className="control-workspace">
      <div className="split-workspace">
        <section className="core-panel">
          <div className="panel-head"><div><span className="core-eyebrow">Equipment</span><h2>Machine state</h2></div></div>
          <div className="machine-list">{production.machines.map((machine) => <button aria-label={`${productionMachineActionLabels[machine.state]} for ${machine.name}; current state ${machine.state}`} key={machine.id} type="button" onClick={() => cycleMachine(machine.id)}><span className={`machine-dot ${machine.state}`} /><span><strong>{machine.name}</strong><small>{machine.id} - Current: {machine.state}</small></span><b>{productionMachineActionLabels[machine.state]}</b></button>)}</div>
          <p className="panel-copy">Local operating record only. No telemetry or machine control is connected.</p>
        </section>
        <section className="core-panel">
          <span className="core-eyebrow">Exception</span><h2>Open an issue</h2>
          <form className="core-form compact-form" onSubmit={createIssue}>
            <div className="form-row"><label>Type<select value={kind} onChange={(event) => setKind(event.target.value as ProductionIssue['kind'])}><option value="quality">Quality</option><option value="maintenance">Maintenance</option><option value="materials">Materials</option><option value="operations">Operations</option></select></label><label>Area<select value={area} onChange={(event) => setArea(event.target.value)}><option>Line 01</option><option>Line 02</option><option>Line 03</option><option>Materials</option><option>Quality</option></select></label></div>
            <label>Observation<textarea maxLength={240} required value={summary} onChange={(event) => setSummary(event.target.value)} placeholder="Describe what happened, not the assumption." /></label>
            <button className="core-button primary" type="submit">Open issue</button>
          </form>
        </section>
      </div>
      <section className="core-panel issue-register"><div className="panel-head"><div><span className="core-eyebrow">Shift review</span><h2>Issue register</h2></div><span className="panel-note">{openIssues.length} open</span></div><IssueList issues={production.issues} onResolve={resolveIssue} /></section>
    </div>
    {actionControls}
  </div>

  return <div className="operation-module">
    <div className="module-today">
      <section className="summary-strip"><span><small>Output</small><strong>{output.toLocaleString()}</strong></span><span><small>Target</small><strong>{target.toLocaleString()}</strong></span><span><small>Completion</small><strong>{completion}%</strong></span><span><small>Open issues</small><strong>{openIssues.length}</strong></span><span><small>Machines running</small><strong>{production.machines.filter((item) => item.state === 'running').length}/{production.machines.length}</strong></span></section>
      <div className="split-workspace ops-today-grid">
        <section className="core-panel"><div className="panel-head"><div><span className="core-eyebrow">Plan vs actual</span><h2>Active production</h2></div><Link className="text-link" to="/operations/production/?tab=production">Record output</Link></div><JobList jobs={production.jobs} /></section>
        <section className="core-panel"><div className="panel-head"><div><span className="core-eyebrow">Exceptions</span><h2>Quality and equipment</h2></div><Link className="text-link" to="/operations/production/?tab=control">Open controls</Link></div><IssueList issues={openIssues} onResolve={resolveIssue} /></section>
      </div>
    </div>
    {actionControls}
  </div>
}

function JobList({ jobs }: { jobs: ProductionJob[] }) {
  return <div className="job-list">{jobs.map((job) => { const progress = Math.min(100, Math.round((job.output / job.target) * 100)); return <article key={job.id}><div><span>{job.id} · {job.line}</span><strong>{job.product}</strong></div><div className="job-progress"><span><i style={{ width: `${progress}%` }} /></span><small>{job.output.toLocaleString()} / {job.target.toLocaleString()} · {progress}%</small></div></article> })}</div>
}

function IssueList({ issues, onResolve }: { issues: ProductionIssue[]; onResolve: (id: string) => void }) {
  if (!issues.length) return <Empty>No production issue is open.</Empty>
  return <div className="issue-list">{issues.map((issue) => <article key={issue.id}>
    <span className={`issue-mark ${issue.status}`}>{issue.status === 'open' ? '!' : '✓'}</span>
    <div>
      <strong>{issue.summary}</strong>
      <small>{issue.id} · {issue.kind} · {issue.area} · {formatTime(issue.createdAt)}</small>
      {issue.status === 'resolved' ? <small>{issue.resolution ? `Resolved by ${issue.resolution.resolvedBy} · Evidence: ${issue.resolution.evidenceReference}` : 'Legacy resolution · no attributed proof was available'}</small> : null}
    </div>
    {issue.status === 'open' ? <button className="text-link" onClick={() => onResolve(issue.id)} type="button">Resolve</button> : <b>Resolved</b>}
  </article>)}</div>
}

export function SettingsPage() {
  const runtime = useOutletContext<RuntimeHealth>()
  const [setup, setSetup] = useSetupWorkspace()
  const [commerce] = useCommerceWorkspace()
  const [production] = useProductionWorkspace()
  const [approvals, setApprovals] = useApprovalWorkspace()
  const [actions] = useStoredState<AccountableAction[]>(ACTION_KEY, [], normalizeActions)
  const [teamWorkspace] = useTeamWorkspace()
  const [notice, setNotice] = useState('')
  const [resetArmed, setResetArmed] = useState(false)
  const [managedIdentity, setManagedIdentity] = useManagedIdentity(runtime.status === 'enterprise')
  const [managedEmail, setManagedEmail] = useState('')
  const [managedPassword, setManagedPassword] = useState('')
  const [managedWorkspace, setManagedWorkspace] = useState(currentManagedWorkspace())
  const [managedNotice, setManagedNotice] = useState('')
  const [managedBusy, setManagedBusy] = useState(false)
  const completion = pilotProgress(setup)
  const isPilotReady = pilotReady(setup)
  const selectedTemplate = templateFor(setup.product, setup.template)
  const evidenceDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Yangon' }).format(new Date())
  const evidenceFilename = `supermega-trial-evidence-${evidenceDate}.json`
  const managedApprovalRequests = approvals.map(toManagedApprovalRequest).filter((request): request is NonNullable<typeof request> => Boolean(request))
  const evidenceHref = `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify({ contract: 'supermega_trial_evidence', version: 9, exportedAt: new Date().toISOString(), environment: 'isolated_demo', pilotReady: isPilotReady, setup, workflowProfile: selectedTemplate, commerce, production, accountableActions: actions, approvals, managedApprovalRequests, teams: teamWorkspace }, null, 2))}`

  function updateSetup(patch: Partial<SetupState>) {
    setSetup((current) => ({ ...current, ...patch, savedAt: undefined }))
  }

  function changeProduct(product: SetupState['product']) {
    const template = templateFor(product, '')
    setSetup({ ...seedSetup, product, template: template.name, entryPoint: template.entryPoints[0] ?? '' })
    setNotice(`Started a new ${product} pilot draft. Workflow-specific fields were cleared.`)
  }

  function changeTemplate(name: string) {
    const template = templateFor(setup.product, name)
    updateSetup({ template: template.name, entryPoint: template.entryPoints.includes(setup.entryPoint) ? setup.entryPoint : template.entryPoints[0] ?? '' })
  }

  function save(event: FormEvent) {
    event.preventDefault()
    setSetup((current) => ({ ...current, savedAt: new Date().toISOString() }))
    setNotice('Pilot definition saved in this browser. No source, account, or external action was connected.')
  }

  function resetDemoWorkspace() {
    ;[COMMERCE_KEY, PRODUCTION_KEY, APPROVAL_KEY, SETUP_KEY, ACTION_KEY, TEAM_WORK_KEY, ...LEGACY_TEAM_WORK_KEYS, ...LEGACY_COMMERCE_KEYS, ...LEGACY_PRODUCTION_KEYS, ...LEGACY_APPROVAL_KEYS, ...LEGACY_SETUP_KEYS].forEach((key) => window.localStorage.removeItem(key))
    window.location.assign('/')
  }

  async function connectManagedWorkspace(event: FormEvent) {
    event.preventDefault()
    setManagedBusy(true)
    setManagedNotice('Signing in and checking workspace membership…')
    try {
      const identity = await signInManagedTrial(managedEmail, managedPassword, managedWorkspace)
      setManagedIdentity(identity)
      setManagedPassword('')
      try {
        const bootstrap = await loadManagedBootstrap()
        setApprovals((current) => mergeManagedApprovals(current, bootstrap.approvals))
        setManagedNotice(`Connected to ${identity.workspaceId}. Managed approvals are ready.`)
      } catch (workspaceError) {
        setManagedNotice(workspaceError instanceof Error ? workspaceError.message : 'Signed in, but this workspace is not ready.')
      }
    } catch (error) {
      setManagedNotice(error instanceof Error ? error.message : 'Managed sign-in failed.')
    } finally {
      setManagedBusy(false)
    }
  }

  async function disconnectManagedWorkspace() {
    setManagedBusy(true)
    await signOutManagedTrial()
    setManagedIdentity(null)
    setApprovals((current) => current.filter((approval) => !approval.managed))
    setManagedNotice('Managed account disconnected from this browser.')
    setManagedBusy(false)
  }

  return (
    <div className="workspace-screen settings-screen">
      <PageHeading eyebrow="Settings" title="Pilot and system boundary" copy="Define one measurable workflow, export its evidence, and see exactly what still blocks managed activation." />
      <div className="settings-grid">
        <form className="core-panel setup-form" onSubmit={save}>
          <div className="panel-head"><div><span className="core-eyebrow">Pilot definition</span><h2>Start with one real workflow.</h2></div><span className={`status-pill ${isPilotReady ? 'approved' : 'bounded'}`}>{isPilotReady ? 'ready' : `${completion}%`}</span></div>
          <div className="pilot-progress"><div className="progress-track"><i style={{ width: `${completion}%` }} /></div><small>Channel or entry point · current record · baseline · target · authority · evidence</small></div>
          <div className="segmented-control wide"><button aria-pressed={setup.product === 'commerce'} type="button" onClick={() => changeProduct('commerce')}>Commerce</button><button aria-pressed={setup.product === 'production'} type="button" onClick={() => changeProduct('production')}>Production</button></div>
          <div className="form-row"><label>Starting template<select value={setup.template} onChange={(event) => changeTemplate(event.target.value)}>{templatesFor(setup.product).map((template) => <option key={template.id} value={template.name}>{template.name}</option>)}</select></label><label>Entry point<select value={setup.entryPoint} onChange={(event) => updateSetup({ entryPoint: event.target.value })}>{selectedTemplate.entryPoints.map((entryPoint) => <option key={entryPoint}>{entryPoint}</option>)}</select></label></div>
          <div className="template-contract"><span>Workflow</span><strong>{selectedTemplate.workflow.join(' → ')}</strong><small>Measure · {selectedTemplate.metric}</small></div>
          <div className="form-row"><label>Workspace name<input maxLength={80} required value={setup.workspace} onChange={(event) => updateSetup({ workspace: event.target.value })} placeholder={setup.product === 'commerce' ? 'Example: Social sales team' : 'Example: Main production site'} /></label><label>Responsible owner<input maxLength={80} required value={setup.owner} onChange={(event) => updateSetup({ owner: event.target.value })} placeholder="Name or role" /></label></div>
          <label>Current record<input maxLength={180} required value={setup.currentRecord} onChange={(event) => updateSetup({ currentRecord: event.target.value })} placeholder="What is used today: chat, paper, spreadsheet, system, or machine log?" /></label>
          <div className="form-row pilot-text-row"><label>Baseline<textarea maxLength={240} required value={setup.baseline} onChange={(event) => updateSetup({ baseline: event.target.value })} placeholder="Current time, error rate, backlog, or output." /></label><label>Target outcome<textarea maxLength={240} required value={setup.targetOutcome} onChange={(event) => updateSetup({ targetOutcome: event.target.value })} placeholder={`Set a target for ${selectedTemplate.metric.toLowerCase()}.`} /></label></div>
          <div className="form-row pilot-text-row"><label>Human authority boundary<textarea maxLength={240} required value={setup.authorityBoundary} onChange={(event) => updateSetup({ authorityBoundary: event.target.value })} placeholder="Which sends, payments, approvals, or production changes require an owner?" /></label><label>Acceptance evidence<textarea maxLength={240} required value={setup.acceptanceEvidence} onChange={(event) => updateSetup({ acceptanceEvidence: event.target.value })} placeholder="What record or result proves the pilot works?" /></label></div>
          <button className="core-button primary" type="submit">Save pilot definition</button>
          <p className="form-notice" aria-live="polite">{notice || (setup.savedAt ? `Last saved ${formatTime(setup.savedAt)}` : 'The draft stays in this browser until exported or managed mode is activated.')}</p>
        </form>
        <section className="core-panel system-boundary-panel" id="controls">
          <div className="panel-head"><div><span className="core-eyebrow">System boundary</span><h2>{runtime.status === 'enterprise' ? 'Managed mode ready' : 'Managed mode locked'}</h2></div><RuntimeBadge status={runtime.status} /></div>
          {runtime.status === 'enterprise' && managedTrialAuthConfigured() ? managedIdentity ? <div className="template-contract"><span>Managed account</span><strong>{managedIdentity.email}</strong><small>{managedIdentity.workspaceId} · membership and capabilities are checked by the API</small><button className="text-link" disabled={managedBusy} onClick={() => void disconnectManagedWorkspace()} type="button">Disconnect</button></div> : <form className="core-form compact-form" onSubmit={(event) => void connectManagedWorkspace(event)}><span className="core-eyebrow">Managed workspace</span><div className="form-row"><label>Email<input autoComplete="username" maxLength={160} onChange={(event) => setManagedEmail(event.target.value)} required type="email" value={managedEmail} /></label><label>Password<input autoComplete="current-password" minLength={8} onChange={(event) => setManagedPassword(event.target.value)} required type="password" value={managedPassword} /></label></div><label>Workspace ID<input maxLength={128} onChange={(event) => setManagedWorkspace(event.target.value)} placeholder="Your provisioned workspace" required value={managedWorkspace} /></label><button className="core-button primary" disabled={managedBusy} type="submit">{managedBusy ? 'Checking…' : 'Connect workspace'}</button></form> : null}
          {managedNotice ? <p className="form-notice" role="status">{managedNotice}</p> : null}
          <div className="readiness-list"><span><small>Pilot definition</small><strong>{isPilotReady ? 'Ready' : `${completion}% complete`}</strong></span><span><small>Runtime</small><strong>{runtime.serviceStatus}</strong></span><span><small>Operating mode</small><strong>{runtime.operatingMode.replace('_', ' ')}</strong></span><span><small>Managed data</small><strong>{runtime.enterpriseDbReady ? 'Ready' : 'Not connected'}</strong></span><span><small>Security</small><strong>{runtime.securityReady ? 'Ready' : 'Not ready'}</strong></span><span><small>Write path</small><strong>{runtime.writesReady ? 'Enabled' : 'Locked'}</strong></span><span><small>Source coverage</small><strong>{runtime.coverageScore}%</strong></span><span><small>External action</small><strong>Owner controlled</strong></span></div>
          {runtime.status !== 'enterprise' ? <ul className="requirement-list">{(runtime.requirements.length ? runtime.requirements : ['Configure managed tenant persistence.', 'Verify production identity and source coverage.']).map((requirement) => <li key={requirement}>{requirement}</li>)}</ul> : null}
          <p className="authority-note">External sends, payments, publishing, access changes, and production writes remain owner-approved and auditable.</p>
        </section>
      </div>
      <section className="core-panel trial-control-panel"><div><span className="core-eyebrow">Local evidence</span><h2>Export or reset deliberately.</h2><p>Export the pilot definition and full browser workspace for review. Reset only after the evidence is no longer needed.</p></div><div className="trial-actions"><a className="core-button" download={evidenceFilename} href={evidenceHref}>Export evidence</a>{resetArmed ? <><button className="text-link" onClick={() => setResetArmed(false)} type="button">Cancel</button><button className="core-button danger" onClick={resetDemoWorkspace} type="button">Confirm reset</button></> : <button className="text-link danger-text" onClick={() => setResetArmed(true)} type="button">Reset local trial</button>}</div></section>
    </div>
  )
}
