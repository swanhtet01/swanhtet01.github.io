import { type Dispatch, type SetStateAction, useCallback, useEffect, useRef, useState } from 'react'

import {
  COMMERCE_KEY,
  commerceWorkspaceCanWrite,
  createEmptyCommerce,
  loadCommerceWorkspace,
  mutateCommerceWorkspace,
  validateCommerceState,
  type CommerceActionProof,
  type CommerceState,
} from './commerce-workspace'
import {
  abandonLocalCommerceSyncIntent,
  acknowledgeLocalCommerceSyncIntent,
  checkingCommerceSyncStatus,
  managedCommerceSyncStatus,
  readLocalCommerceSyncIntents,
  recoverLocalCommerceSyncOutbox,
  stageLocalCommerceSyncIntent,
  type CommerceSyncIntent,
  type CommerceSyncStatus,
} from './commerce-sync-outbox'
import { requestStorageDurability } from './storage-durability'
import {
  currentManagedIdentity,
  loadManagedBootstrap,
  managedBootstrapHasCapability,
  ManagedTrialError,
  requireManagedSurfaceState,
  saveManagedCommerceCommand,
  saveManagedProductionCommand,
  sameManagedIdentity,
  type ManagedApprovalRecord,
  type ManagedCommerceEvent,
  type ManagedIdentity,
  type ManagedProductionEvent,
  type ManagedStateRecord,
} from './managed-trial'
import {
  ACTION_KEY,
  APPROVAL_KEY,
  LEGACY_APPROVAL_KEYS,
  LEGACY_SETUP_KEYS,
  normalizeSetup,
  seedSetup,
  SETUP_KEY,
  SETUP_SYNC_EVENT,
  type SetupState,
} from './product-setup'
import {
  PRODUCTION_KEY,
  createEmptyProduction,
  loadProductionWorkspace,
  mutateProductionWorkspace,
  productionWorkspaceCanWrite,
  validateProductionState,
  type ProductionActionProof,
  type ProductionState,
} from './production-workspace'

export type DecisionClaim = {
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

export type DecisionPacket = {
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

export type Approval = {
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

export type ActionDomain = 'commerce' | 'production'

export type ActionKind =
  | 'order_create'
  | 'order_status'
  | 'order_cancel'
  | 'order_cancellation_review'
  | 'order_return'
  | 'order_support_open'
  | 'order_support_reopen'
  | 'order_support_service'
  | 'order_support_resolve'
  | 'order_correction'
  | 'payment_reconcile'
  | 'order_settle'
  | 'collection_contact'
  | 'refund_settle'
  | 'catalog_item_create'
  | 'catalog_item_update'
  | 'inventory_receipt'
  | 'inventory_count'
  | 'purchase_order_create'
  | 'purchase_budget_approve'
  | 'supplier_sourcing_approve'
  | 'purchase_requisition_approve'
  | 'purchase_order_receive'
  | 'purchase_order_cancel'
  | 'supplier_return_authorize'
  | 'supplier_credit_record'
  | 'daily_close'
  | 'tax_configuration'
  | 'account_mapping'
  | 'customer_credit_policy'
  | 'promotion_policy'
  | 'shipping_policy'
  | 'payment_policy'
  | 'production_job'
  | 'production_job_schedule'
  | 'production_job_close'
  | 'production_output'
  | 'production_scrap'
  | 'production_material'
  | 'issue_create'
  | 'issue_resolution'
  | 'quality_hold'
  | 'quality_release'
  | 'machine_state'
  | 'downtime_start'
  | 'downtime_end'
  | 'maintenance_start'
  | 'maintenance_complete'
  | 'production_shift_close'

export type AccountableAction = {
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

export type PendingAccountableAction = Omit<AccountableAction, 'capturedAt' | 'actorKind' | 'actor' | 'reason' | 'evidenceReference'> & {
  apply: (record: AccountableAction) => void | Promise<void>
  actorSuggestion?: string
  confirmation?: AccountableAction
  evidenceReferenceLocked?: boolean
  evidenceReferenceSuggestion?: string
  presentation?: 'default' | 'counter'
  reasonSuggestion?: string
}

export type ActionDetails = Pick<AccountableAction, 'actor' | 'reason' | 'evidenceReference'>

export class ShopReviewRequiredError extends Error {}
export class PlantReviewRequiredError extends Error {}

function stableFingerprint(value: unknown) {
  const input = JSON.stringify(value)
  let hash = 2166136261
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `fnv1a:${(hash >>> 0).toString(16).padStart(8, '0')}`
}

export function decisionPacketFingerprint(packet: DecisionPacket) {
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

export function toManagedApprovalRequest(approval: Approval) {
  if (approval.status !== 'pending' || !approval.commandId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(approval.commandId)) return null
  return {
    command_id: approval.commandId,
    title: approval.title,
    proposal: toManagedDecisionPacket(approval.packet),
    evidence_refs: [...new Set(approval.packet.claims.map((claim) => claim.sourceReference))],
  }
}

export function fromManagedApproval(record: ManagedApprovalRecord): Approval {
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

export function mergeManagedApprovals(current: Approval[], records: ManagedApprovalRecord[]) {
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

export function normalizeActions(value: AccountableAction[]) {
  if (!Array.isArray(value)) return []
  return value.filter((action) => action && typeof action.id === 'string' && action.actorKind === 'human').slice(0, 200)
}

export function confirmAccountableAction(action: PendingAccountableAction, details: ActionDetails): AccountableAction {
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

export function commerceActionProof(action: AccountableAction): CommerceActionProof {
  return {
    actionId: action.id,
    capturedAt: action.capturedAt,
    actor: action.actor,
    reason: action.reason,
    evidenceReference: action.evidenceReference,
  }
}

export function productionActionProof(action: AccountableAction): ProductionActionProof {
  return {
    actionId: action.id,
    capturedAt: action.capturedAt,
    actor: action.actor,
    reason: action.reason,
    evidenceReference: action.evidenceReference,
  }
}

export function useStoredState<T>(key: string, seed: T, normalize?: (value: T) => T, legacyKeys: string[] = [], persist?: (value: T) => T) {
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

  useEffect(() => {
    function refreshFromStorage(event: StorageEvent) {
      if (event.key !== key) return
      try {
        const stored = window.localStorage.getItem(key)
        if (!stored) return
        const value = JSON.parse(stored) as T
        setState(normalize ? normalize(value) : value)
      } catch {
        // Ignore a malformed payload written by another tab.
      }
    }
    window.addEventListener('storage', refreshFromStorage)
    return () => window.removeEventListener('storage', refreshFromStorage)
  }, [key, normalize])

  return [normalizedState, setState] as const
}

type CommerceWorkspaceMode = 'local' | 'managed-loading' | 'managed-ready' | 'managed-unprovisioned' | 'managed-error'

type CommerceWorkspaceView = {
  state: CommerceState
  mode: CommerceWorkspaceMode
  workspaceId: string
  version: number | null
  error: string
  writeReady: boolean
}

function managedCommerceView(record: ManagedStateRecord, workspaceId: string, writeReady: boolean): CommerceWorkspaceView {
  if (record.surface !== 'commerce' || !Number.isSafeInteger(record.version) || record.version < 0) throw new Error('Managed Shop returned an invalid state envelope.')
  if (record.version === 0) {
    if (Object.keys(record.state).length) throw new Error('Managed Shop has state without a valid revision.')
    return { state: createEmptyCommerce(), mode: 'managed-unprovisioned', workspaceId, version: 0, error: 'This company account has no Shop catalog yet.', writeReady }
  }
  return { state: validateCommerceState(record.state), mode: 'managed-ready', workspaceId, version: record.version, error: '', writeReady }
}

export type CommerceStuckRecovery = {
  // The unsent changes still sitting in the outbox, each carrying the evidence the
  // operator confirmed at the time. Empty until a stuck status asks for them.
  intents: readonly CommerceSyncIntent[]
  loading: boolean
  // Why the stuck changes could not be listed. When this is set the UI must NOT offer a
  // discard: nothing may be thrown away that the operator was not shown first.
  loadError: string
  // commandId currently being discarded, so its own control can show progress.
  discarding: string
  discardError: string
}

const idleStuckRecovery: CommerceStuckRecovery = {
  intents: [], loading: false, loadError: '', discarding: '', discardError: '',
}

export function useCommerceWorkspace(managedIdentity: ManagedIdentity | null = null) {
  const [localSnapshot, setLocalSnapshot] = useState<CommerceWorkspaceView>(() => {
    const local = loadCommerceWorkspace()
    return { state: local.state, mode: 'local', workspaceId: '', version: null, error: local.error, writeReady: !local.error && commerceWorkspaceCanWrite() }
  })
  const [managedSnapshot, setManagedSnapshot] = useState<CommerceWorkspaceView>(() => ({
    state: createEmptyCommerce(), mode: 'managed-loading', workspaceId: '', version: null, error: '', writeReady: false,
  }))
  const snapshotRef = useRef(localSnapshot)
  const identityRef = useRef(managedIdentity)
  const [syncStatus, setSyncStatus] = useState<CommerceSyncStatus>(() => managedIdentity ? managedCommerceSyncStatus : checkingCommerceSyncStatus)
  const syncStatusRef = useRef(syncStatus)

  const updateSyncStatus = useCallback((next: CommerceSyncStatus) => {
    syncStatusRef.current = next
    setSyncStatus(next)
  }, [])

  // Stuck-till recovery. When a sync intent is staged but the process dies before the
  // workspace write commits, recovery reports 'conflict' (the saved change no longer
  // matches the workspace) or 'unavailable' (the outbox itself could not be reached).
  // Both leave canWrite false, which freezes every till control with no way out but a
  // reload that finds the same stuck record again.
  const [stuckRecovery, setStuckRecovery] = useState<CommerceStuckRecovery>(idleStuckRecovery)
  // Bumped after a discard so the list is re-read from the outbox rather than assumed.
  // Without this, discarding one of two stuck records leaves the status on 'conflict',
  // the effect's deps unchanged, and the discarded record still on screen.
  const [stuckRefresh, setStuckRefresh] = useState(0)

  useEffect(() => {
    identityRef.current = managedIdentity
    snapshotRef.current = managedIdentity ? managedSnapshot : localSnapshot
  }, [localSnapshot, managedIdentity, managedSnapshot])

  // Shop first-open is the moment durable storage starts to matter, and it matters for a
  // company account exactly as much as for a signed-out one. UNCONDITIONAL ON PURPOSE:
  // signing in moves the workspace ledger server-side, but several Shop stores stay
  // device-local under a `managed:<workspaceId>` scope with no server copy at all --
  // product photos and payment-QR blobs (product-image-store.ts / payment-qr-store.ts,
  // both explicitly outside company backups), the unfinished order draft
  // (commerce-order-draft.ts) and loyalty settings (shop-loyalty.ts). Browser eviction
  // takes those permanently whoever is signed in, so every Shop gets to ask.
  //
  // Deliberately its own effect rather than a line inside the managed/local branch below.
  // Reached from that branch it fired for company accounts anyway -- managedIdentity is
  // null until /api/health answers and useManagedIdentity is enabled, so the local arm
  // always ran first and the module memo made that first call the only one of the session
  // -- which left the code doing the right thing for a reason that read as a bug.
  //
  // Fired here rather than in main.tsx so the marketing site never asks, and deliberately
  // not awaited -- the answer only drives a warning banner, so it must not delay recovery,
  // the first write, or first paint. Memoised inside the module, so the several surfaces
  // that mount this hook still produce exactly one request per page session.
  useEffect(() => {
    void requestStorageDurability()
  }, [])

  useEffect(() => {
    if (managedIdentity) {
      let active = true
      const statusTimer = window.setTimeout(() => {
        if (active) updateSyncStatus(managedCommerceSyncStatus)
      }, 0)
      return () => {
        active = false
        window.clearTimeout(statusTimer)
      }
    }
    let active = true
    recoverLocalCommerceSyncOutbox()
      .then((status) => {
        if (!active || identityRef.current) return
        const local = loadCommerceWorkspace()
        const next = { state: local.state, mode: 'local' as const, workspaceId: '', version: null, error: local.error, writeReady: !local.error && commerceWorkspaceCanWrite() }
        snapshotRef.current = next
        setLocalSnapshot(next)
        updateSyncStatus(status)
      })
      .catch((error) => {
        if (!active || identityRef.current) return
        updateSyncStatus({
          status: 'unavailable',
          pendingCount: 0,
          recoveredCount: 0,
          replayedCount: 0,
          conflictCount: 0,
          message: error instanceof Error ? error.message : 'Shop recovery could not be checked.',
        })
      })
    return () => { active = false }
  }, [managedIdentity, updateSyncStatus])

  useEffect(() => {
    if (managedIdentity) return undefined
    function refreshFromStorage(event: StorageEvent) {
      if (event.key !== COMMERCE_KEY) return
      const local = loadCommerceWorkspace()
      const next = { state: local.state, mode: 'local' as const, workspaceId: '', version: null, error: local.error, writeReady: !local.error && commerceWorkspaceCanWrite() }
      snapshotRef.current = next
      setLocalSnapshot(next)
    }
    window.addEventListener('storage', refreshFromStorage)
    return () => window.removeEventListener('storage', refreshFromStorage)
  }, [managedIdentity])

  // Load the stuck change's evidence as soon as the till freezes, so the recovery
  // control can show what it would discard before the operator commits to discarding it.
  const stuck = !managedIdentity && (syncStatus.status === 'conflict' || syncStatus.status === 'unavailable')
  useEffect(() => {
    if (!stuck) {
      setStuckRecovery((current) => current === idleStuckRecovery ? current : idleStuckRecovery)
      return undefined
    }
    let active = true
    setStuckRecovery((current) => ({ ...current, loading: true, loadError: '' }))
    readLocalCommerceSyncIntents()
      .then((intents) => {
        if (active) setStuckRecovery((current) => ({ ...current, intents, loading: false, loadError: '' }))
      })
      .catch((error: unknown) => {
        if (!active) return
        setStuckRecovery((current) => ({
          ...current,
          intents: [],
          loading: false,
          loadError: error instanceof Error ? error.message : 'The unsent Shop change could not be read on this device.',
        }))
      })
    return () => { active = false }
  }, [stuck, stuckRefresh])

  // Discard exactly one unsent change, named by commandId.
  //
  // This closes the outbox record and writes an 'abandoned' receipt. It does NOT touch
  // the committed workspace: the change being discarded is by definition one that never
  // reached COMMERCE_KEY, so no confirmed sale, payment or stock movement can be lost
  // through this path. Recovery is then re-run so a till that is now clean unfreezes
  // without a reload, and so a second stuck record is surfaced rather than assumed gone.
  const discardStuckChange = useCallback(async (commandId: string) => {
    setStuckRecovery((current) => ({ ...current, discarding: commandId, discardError: '' }))
    try {
      await abandonLocalCommerceSyncIntent(commandId)
    } catch (error) {
      setStuckRecovery((current) => ({
        ...current,
        discarding: '',
        discardError: error instanceof Error ? error.message : 'The unsent Shop change could not be discarded.',
      }))
      return
    }
    try {
      const status = await recoverLocalCommerceSyncOutbox()
      if (identityRef.current) return
      const local = loadCommerceWorkspace()
      const next = { state: local.state, mode: 'local' as const, workspaceId: '', version: null, error: local.error, writeReady: !local.error && commerceWorkspaceCanWrite() }
      snapshotRef.current = next
      setLocalSnapshot(next)
      updateSyncStatus(status)
      setStuckRecovery((current) => ({ ...current, discarding: '', discardError: '' }))
      setStuckRefresh((count) => count + 1)
    } catch (error) {
      // The record is already discarded; only the re-check failed. Report that honestly
      // rather than implying the discard did not happen.
      setStuckRecovery((current) => ({
        ...current,
        discarding: '',
        discardError: error instanceof Error ? error.message : 'Shop recovery could not be re-checked. Reload Shop.',
      }))
    }
  }, [updateSyncStatus])

  useEffect(() => {
    if (!managedIdentity) return undefined

    let active = true
    loadManagedBootstrap(managedIdentity)
      .then((bootstrap) => {
        if (!active || !identityRef.current || !sameManagedIdentity(identityRef.current, managedIdentity)) return
        const record = requireManagedSurfaceState(bootstrap, 'commerce', 'Shop')
        const next = managedCommerceView(record, managedIdentity.workspaceId, managedBootstrapHasCapability(bootstrap, managedIdentity, 'commerce.write'))
        snapshotRef.current = next
        setManagedSnapshot(next)
      })
      .catch((error) => {
        if (!active || !identityRef.current || !sameManagedIdentity(identityRef.current, managedIdentity)) return
        const next = { state: createEmptyCommerce(), mode: 'managed-error' as const, workspaceId: managedIdentity.workspaceId, version: null, error: error instanceof Error ? error.message : 'Managed Shop could not be loaded.', writeReady: false }
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
      if (eventType === 'commerce.workspace.initialized') throw new Error('Browser demo Shop is already initialized.')
      const current = snapshotRef.current
      if (current.mode !== 'local' || current.error || !current.writeReady) throw new Error(current.error || 'Browser demo Shop is not ready for writes.')
      if (syncStatusRef.current.status !== 'ready') throw new Error(syncStatusRef.current.message || 'Shop recovery is not ready for another change.')
      const next = transition(current.state)
      if (!next) throw new Error('The Shop state changed or this lifecycle step is no longer valid. Nothing was written.')
      if (next === current.state) return
      const candidate = validateCommerceState(next)
      const baseRaw = JSON.stringify(validateCommerceState(current.state))
      let staged: Awaited<ReturnType<typeof stageLocalCommerceSyncIntent>>
      try {
        staged = await stageLocalCommerceSyncIntent({
          commandId,
          eventType,
          evidence,
          baseState: current.state,
          candidateState: candidate,
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Shop recovery could not stage this change.'
        updateSyncStatus({ status: 'unavailable', pendingCount: 0, recoveredCount: 0, replayedCount: 0, conflictCount: 0, message })
        throw error
      }
      if (staged.status === 'acknowledged_replay') {
        const latest = loadCommerceWorkspace()
        if (latest.error || JSON.stringify(latest.state) !== staged.intent.candidateRaw) {
          const message = 'This reviewed Shop command was already acknowledged against a different current workspace. Nothing was written.'
          updateSyncStatus({ status: 'conflict', pendingCount: 0, recoveredCount: 0, replayedCount: 0, conflictCount: 1, message })
          throw new ShopReviewRequiredError(message)
        }
        const accepted = { state: latest.state, mode: 'local' as const, workspaceId: '', version: null, error: '', writeReady: commerceWorkspaceCanWrite() }
        snapshotRef.current = accepted
        setLocalSnapshot(accepted)
        updateSyncStatus({ status: 'ready', pendingCount: 0, recoveredCount: 0, replayedCount: 0, conflictCount: 0, message: '' })
        return
      }
      updateSyncStatus({ status: 'pending', pendingCount: 1, recoveredCount: 0, replayedCount: 0, conflictCount: 0, message: 'The reviewed Shop change is saved for crash recovery.' })
      const result = await mutateCommerceWorkspace((latest) => JSON.stringify(validateCommerceState(latest)) === baseRaw ? candidate : null)
      if (!result.ok) {
        if (result.error === 'The Commerce state changed or the requested transition is not valid. Nothing was written.') {
          try {
            await abandonLocalCommerceSyncIntent(commandId)
            updateSyncStatus({ status: 'ready', pendingCount: 0, recoveredCount: 0, replayedCount: 0, conflictCount: 0, message: '' })
          } catch (syncError) {
            updateSyncStatus({ status: 'pending', pendingCount: 1, recoveredCount: 0, replayedCount: 0, conflictCount: 0, message: syncError instanceof Error ? syncError.message : 'The stale Shop recovery record could not be closed.' })
          }
          const latest = loadCommerceWorkspace()
          const refreshed = { state: latest.state, mode: 'local' as const, workspaceId: '', version: null, error: latest.error, writeReady: !latest.error && commerceWorkspaceCanWrite() }
          snapshotRef.current = refreshed
          setLocalSnapshot(refreshed)
          throw new ShopReviewRequiredError(latest.error
            ? `Shop changed before this action was applied. Nothing was written; reload to recover the current record. ${latest.error}`
            : 'Shop changed before this action was applied. Nothing was written; the latest record is loaded for fresh review.')
        }
        updateSyncStatus({ status: 'pending', pendingCount: 1, recoveredCount: 0, replayedCount: 0, conflictCount: 0, message: 'The reviewed Shop change is retained for recovery because the workspace write was not confirmed.' })
        const rejected = { ...snapshotRef.current, error: result.error }
        snapshotRef.current = rejected
        setLocalSnapshot(rejected)
        throw new Error(result.error)
      }
      const accepted = { state: result.state, mode: 'local' as const, workspaceId: '', version: null, error: '', writeReady: true }
      snapshotRef.current = accepted
      setLocalSnapshot(accepted)
      try {
        await acknowledgeLocalCommerceSyncIntent(commandId)
        updateSyncStatus({ status: 'ready', pendingCount: 0, recoveredCount: 0, replayedCount: 0, conflictCount: 0, message: '' })
      } catch {
        updateSyncStatus({
          status: 'pending',
          pendingCount: 1,
          recoveredCount: 0,
          replayedCount: 0,
          conflictCount: 0,
          message: 'The Shop change was saved, but its recovery receipt was interrupted. Reload to reconcile it safely.',
        })
      }
      return
    }

    const workspaceId = managedIdentity.workspaceId
    const current = snapshotRef.current
    const initializing = eventType === 'commerce.workspace.initialized'
    const modeReady = current.writeReady && (initializing ? current.mode === 'managed-unprovisioned' && current.version === 0 : current.mode === 'managed-ready' && current.version !== null)
    if (!modeReady || current.workspaceId !== workspaceId || current.version === null) {
      throw new Error(current.error || 'Managed Shop is not ready for writes.')
    }
    const next = transition(current.state)
    if (!next) throw new Error('The Shop state changed or this lifecycle step is no longer valid. Nothing was written.')
    if (next === current.state) return
    const candidate = validateCommerceState(next)

    try {
      const result = await saveManagedCommerceCommand({
        commandId,
        evidence,
        eventType,
        expectedVersion: current.version,
        identity: managedIdentity,
        state: candidate as unknown as Record<string, unknown>,
      })
      if (!identityRef.current || !sameManagedIdentity(identityRef.current, managedIdentity)) throw new Error('The company account changed before the write was confirmed.')
      if (result.surface !== 'commerce' || result.event_type !== eventType || result.version !== current.version + 1) {
        throw new Error('Managed Shop returned an invalid command result.')
      }
      const accepted = validateCommerceState(result.state)
      let nextSnapshot: CommerceWorkspaceView = { state: accepted, mode: 'managed-ready', workspaceId, version: result.version, error: '', writeReady: current.writeReady }
      if (result.idempotent_replay) {
        const bootstrap = await loadManagedBootstrap(managedIdentity)
        if (!identityRef.current || !sameManagedIdentity(identityRef.current, managedIdentity)) throw new Error('The company account changed before the replay could be reconciled.')
        const refreshed = managedCommerceView(
          requireManagedSurfaceState(bootstrap, 'commerce', 'Shop'),
          workspaceId,
          managedBootstrapHasCapability(bootstrap, managedIdentity, 'commerce.write'),
        )
        if (refreshed.mode !== 'managed-ready' || refreshed.version === null || refreshed.version < result.version) {
          throw new Error('Managed Shop could not reconcile the committed command with current state.')
        }
        nextSnapshot = { ...refreshed, error: '' }
      }
      snapshotRef.current = nextSnapshot
      setManagedSnapshot(nextSnapshot)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The managed Shop write was not confirmed.'
      if (error instanceof ManagedTrialError && error.code === 'trial_version_conflict') {
        try {
          const bootstrap = await loadManagedBootstrap(managedIdentity)
          if (!identityRef.current || !sameManagedIdentity(identityRef.current, managedIdentity)) throw new Error('The company account changed before Shop could refresh.', { cause: error })
          const refreshed = managedCommerceView(
            requireManagedSurfaceState(bootstrap, 'commerce', 'Shop'),
            workspaceId,
            managedBootstrapHasCapability(bootstrap, managedIdentity, 'commerce.write'),
          )
          const conflict = { ...refreshed, error: '' }
          snapshotRef.current = conflict
          setManagedSnapshot(conflict)
        } catch (refreshError) {
          const refreshMessage = refreshError instanceof Error ? refreshError.message : 'Shop changed and the latest revision could not be loaded.'
          const rejected = { ...snapshotRef.current, error: refreshMessage }
          snapshotRef.current = rejected
          setManagedSnapshot(rejected)
          throw refreshError
        }
        throw new ShopReviewRequiredError('Shop changed in another session. The latest revision is loaded; review and confirm the action again.')
      }
      if (identityRef.current && sameManagedIdentity(identityRef.current, managedIdentity)) {
        const rejected = { ...snapshotRef.current, error: message }
        snapshotRef.current = rejected
        setManagedSnapshot(rejected)
      }
      throw error
    }
  }

  const visible = managedIdentity ? managedSnapshot : localSnapshot
  const canWrite = managedIdentity
    ? visible.mode === 'managed-ready' && visible.version !== null && !visible.error && visible.writeReady
    : visible.mode === 'local' && !visible.error && visible.writeReady && syncStatus.status === 'ready'
  return [visible.state, mutate, visible.error, visible.mode, visible.version, visible.workspaceId, canWrite, syncStatus, stuckRecovery, discardStuckChange] as const
}

type ProductionWorkspaceMode = 'local' | 'managed-loading' | 'managed-ready' | 'managed-unprovisioned' | 'managed-error'

type ProductionWorkspaceView = {
  state: ProductionState
  mode: ProductionWorkspaceMode
  workspaceId: string
  version: number | null
  error: string
  writeReady: boolean
}

function managedProductionView(record: ManagedStateRecord, workspaceId: string, writeReady: boolean): ProductionWorkspaceView {
  if (record.surface !== 'production' || !Number.isSafeInteger(record.version) || record.version < 0) throw new Error('Managed Plant returned an invalid state envelope.')
  if (record.version === 0) {
    if (Object.keys(record.state).length) throw new Error('Managed Plant has state without a valid revision.')
    return { state: createEmptyProduction(), mode: 'managed-unprovisioned', workspaceId, version: 0, error: 'This company account has no Plant plan yet.', writeReady }
  }
  return { state: validateProductionState(record.state), mode: 'managed-ready', workspaceId, version: record.version, error: '', writeReady }
}

export function useProductionWorkspace(managedIdentity: ManagedIdentity | null = null) {
  const [localSnapshot, setLocalSnapshot] = useState<ProductionWorkspaceView>(() => {
    const local = loadProductionWorkspace()
    return { state: local.state, mode: 'local', workspaceId: '', version: null, error: local.error, writeReady: !local.error && productionWorkspaceCanWrite() }
  })
  const [managedSnapshot, setManagedSnapshot] = useState<ProductionWorkspaceView>(() => ({
    state: createEmptyProduction(), mode: 'managed-loading', workspaceId: '', version: null, error: '', writeReady: false,
  }))
  const snapshotRef = useRef(localSnapshot)
  const identityRef = useRef(managedIdentity)

  useEffect(() => {
    identityRef.current = managedIdentity
    snapshotRef.current = managedIdentity ? managedSnapshot : localSnapshot
  }, [localSnapshot, managedIdentity, managedSnapshot])

  useEffect(() => {
    if (managedIdentity) return undefined
    function refreshFromStorage(event: StorageEvent) {
      if (event.key !== PRODUCTION_KEY) return
      const local = loadProductionWorkspace()
      const next = { state: local.state, mode: 'local' as const, workspaceId: '', version: null, error: local.error, writeReady: !local.error && productionWorkspaceCanWrite() }
      snapshotRef.current = next
      setLocalSnapshot(next)
    }
    window.addEventListener('storage', refreshFromStorage)
    return () => window.removeEventListener('storage', refreshFromStorage)
  }, [managedIdentity])

  useEffect(() => {
    if (!managedIdentity) return undefined

    let active = true
    loadManagedBootstrap(managedIdentity)
      .then((bootstrap) => {
        if (!active || !identityRef.current || !sameManagedIdentity(identityRef.current, managedIdentity)) return
        const record = requireManagedSurfaceState(bootstrap, 'production', 'Plant')
        const next = managedProductionView(record, managedIdentity.workspaceId, managedBootstrapHasCapability(bootstrap, managedIdentity, 'production.write'))
        snapshotRef.current = next
        setManagedSnapshot(next)
      })
      .catch((error) => {
        if (!active || !identityRef.current || !sameManagedIdentity(identityRef.current, managedIdentity)) return
        const next = { state: createEmptyProduction(), mode: 'managed-error' as const, workspaceId: managedIdentity.workspaceId, version: null, error: error instanceof Error ? error.message : 'Managed Plant could not be loaded.', writeReady: false }
        snapshotRef.current = next
        setManagedSnapshot(next)
      })
    return () => { active = false }
  }, [managedIdentity])

  async function mutate(
    eventType: ManagedProductionEvent,
    commandId: string,
    evidence: ProductionActionProof,
    transition: (state: ProductionState) => ProductionState | null,
  ) {
    if (!managedIdentity) {
      if (eventType === 'production.workspace.initialized') throw new Error('Browser demo Plant is already initialized.')
      const result = await mutateProductionWorkspace(
        transition,
        undefined,
        undefined,
        eventType === 'production.order_execution.recorded' ? 'order-execution' : 'operating-event',
      )
      if (!result.ok) {
        if (result.error === 'The Production state changed or the requested transition is not valid. Nothing was written.') {
          const latest = loadProductionWorkspace()
          const current = {
            state: latest.state,
            mode: 'local' as const,
            workspaceId: '',
            version: null,
            error: latest.error,
            writeReady: !latest.error && productionWorkspaceCanWrite(),
          }
          snapshotRef.current = current
          setLocalSnapshot(current)
          throw new PlantReviewRequiredError(latest.error
            ? `Plant changed before this action was applied. Nothing was written; reload to recover the current record. ${latest.error}`
            : 'Plant changed before this action was applied. Nothing was written; the latest record is loaded for fresh review.')
        }
        const refreshed = loadProductionWorkspace()
        const rejected = {
          state: refreshed.error ? snapshotRef.current.state : refreshed.state,
          mode: 'local' as const,
          workspaceId: '',
          version: null,
          error: result.error,
          writeReady: false,
        }
        snapshotRef.current = rejected
        setLocalSnapshot(rejected)
        throw new Error(result.error)
      }
      const accepted = { state: result.state, mode: 'local' as const, workspaceId: '', version: null, error: '', writeReady: true }
      snapshotRef.current = accepted
      setLocalSnapshot(accepted)
      return
    }

    const workspaceId = managedIdentity.workspaceId
    const current = snapshotRef.current
    const initializing = eventType === 'production.workspace.initialized'
    const modeReady = current.writeReady && (initializing ? current.mode === 'managed-unprovisioned' && current.version === 0 : current.mode === 'managed-ready' && current.version !== null)
    if (!modeReady || current.workspaceId !== workspaceId || current.version === null) {
      throw new Error(current.error || 'Managed Plant is not ready for writes.')
    }
    const next = transition(current.state)
    if (!next) throw new PlantReviewRequiredError('The Plant record changed or this lifecycle step is no longer valid. Nothing was written; review the current record again.')
    if (next === current.state) return
    const candidate = validateProductionState(next)

    try {
      const result = await saveManagedProductionCommand({
        commandId,
        evidence,
        eventType,
        expectedVersion: current.version,
        identity: managedIdentity,
        state: candidate as unknown as Record<string, unknown>,
      })
      if (!identityRef.current || !sameManagedIdentity(identityRef.current, managedIdentity)) throw new Error('The company account changed before the write was confirmed.')
      if (result.surface !== 'production' || result.event_type !== eventType || result.version !== current.version + 1) {
        throw new Error('Managed Plant returned an invalid command result.')
      }
      const accepted = validateProductionState(result.state)
      let nextSnapshot: ProductionWorkspaceView = { state: accepted, mode: 'managed-ready', workspaceId, version: result.version, error: '', writeReady: current.writeReady }
      if (result.idempotent_replay) {
        const bootstrap = await loadManagedBootstrap(managedIdentity)
        if (!identityRef.current || !sameManagedIdentity(identityRef.current, managedIdentity)) throw new Error('The company account changed before the replay could be reconciled.')
        const refreshed = managedProductionView(
          requireManagedSurfaceState(bootstrap, 'production', 'Plant'),
          workspaceId,
          managedBootstrapHasCapability(bootstrap, managedIdentity, 'production.write'),
        )
        if (refreshed.mode !== 'managed-ready' || refreshed.version === null || refreshed.version < result.version) {
          throw new Error('Managed Plant could not reconcile the committed command with current state.')
        }
        nextSnapshot = { ...refreshed, error: '' }
      }
      snapshotRef.current = nextSnapshot
      setManagedSnapshot(nextSnapshot)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The managed Plant write was not confirmed.'
      if (error instanceof ManagedTrialError && error.code === 'trial_version_conflict') {
        try {
          const bootstrap = await loadManagedBootstrap(managedIdentity)
          if (!identityRef.current || !sameManagedIdentity(identityRef.current, managedIdentity)) throw new Error('The company account changed before Plant could refresh.', { cause: error })
          const refreshed = managedProductionView(
            requireManagedSurfaceState(bootstrap, 'production', 'Plant'),
            workspaceId,
            managedBootstrapHasCapability(bootstrap, managedIdentity, 'production.write'),
          )
          const conflict = { ...refreshed, error: '' }
          snapshotRef.current = conflict
          setManagedSnapshot(conflict)
        } catch (refreshError) {
          const refreshMessage = refreshError instanceof Error ? refreshError.message : 'Plant changed and the latest revision could not be loaded.'
          const rejected = { ...snapshotRef.current, error: refreshMessage }
          snapshotRef.current = rejected
          setManagedSnapshot(rejected)
          throw refreshError
        }
        throw new PlantReviewRequiredError('Plant changed in another session. The latest revision is loaded; review and confirm the action again.')
      }
      if (identityRef.current && sameManagedIdentity(identityRef.current, managedIdentity)) {
        const rejected = { ...snapshotRef.current, error: message }
        snapshotRef.current = rejected
        setManagedSnapshot(rejected)
      }
      throw error
    }
  }

  const visible = managedIdentity ? managedSnapshot : localSnapshot
  const canWrite = managedIdentity
    ? visible.mode === 'managed-ready' && visible.version !== null && !visible.error && visible.writeReady
    : visible.mode === 'local' && !visible.error && visible.writeReady
  return [visible.state, mutate, visible.error, visible.mode, visible.version, visible.workspaceId, canWrite] as const
}

export function useApprovalWorkspace() {
  return useStoredState<Approval[]>(APPROVAL_KEY, [], normalizeApprovals, LEGACY_APPROVAL_KEYS, localApprovalsOnly)
}

export function useAccountableActions() {
  return useStoredState<AccountableAction[]>(ACTION_KEY, [], normalizeActions)
}

export function useSetupWorkspace() {
  const [setup, setSetup] = useStoredState<SetupState>(SETUP_KEY, seedSetup, normalizeSetup, LEGACY_SETUP_KEYS)
  const setupRef = useRef(setup)

  useEffect(() => {
    setupRef.current = setup
  }, [setup])

  useEffect(() => {
    function synchronizeSetup(event: Event) {
      const next = (event as CustomEvent<SetupState>).detail
      if (!next) return
      const normalized = normalizeSetup(next)
      setupRef.current = normalized
      setSetup(normalized)
    }
    window.addEventListener(SETUP_SYNC_EVENT, synchronizeSetup)
    return () => window.removeEventListener(SETUP_SYNC_EVENT, synchronizeSetup)
  }, [setSetup])

  const updateSetup = useCallback<Dispatch<SetStateAction<SetupState>>>((next) => {
    const normalized = normalizeSetup(typeof next === 'function' ? next(setupRef.current) : next)
    setupRef.current = normalized
    setSetup(normalized)
    window.dispatchEvent(new CustomEvent<SetupState>(SETUP_SYNC_EVENT, { detail: normalized }))
  }, [setSetup])

  return [setup, updateSetup] as const
}

// The two halves of "is this definitely a signed-out shop", pulled out as pure functions
// so the question can be ENUMERATED in a suite rather than asserted by eye. Both are used
// by the code below and by CoreApp; neither is test-only scaffolding.
//
// The distinction they exist for is the af705d42 bug: runtime.status starts at 'checking',
// which leaves useManagedIdentity disabled, which makes managedIdentity null -- so on first
// mount a signed-IN operator is indistinguishable from a local shop to any check of the
// shape `if (!managedIdentity)`. Anything that fires on being signed OUT has to wait for
// both answers.

// Whether the identity probe has answered for the CURRENT `enabled`. When the hook is
// disabled there is nothing to wait for, so it is trivially settled -- the caller is
// responsible for also checking that health itself has answered.
export function managedIdentitySettled(enabled: boolean, probed: boolean): boolean {
  return enabled ? probed : true
}

// The full gate. All three must hold: health answered at all, the identity probe settled
// behind it, and no managed identity came back.
export function localShopConfirmed(runtimeStatus: string, settled: boolean, managedIdentity: unknown): boolean {
  return runtimeStatus !== 'checking' && settled && !managedIdentity
}

// Third tuple element is `settled`: whether the identity question has actually been
// ANSWERED, as opposed to merely not answered yet. A null identity on its own is
// ambiguous -- it means "signed out" only once `settled` is true, and "nobody has asked"
// before that -- and every caller that branches on being signed OUT needs the difference.
// Callers that only branch on being signed IN can keep ignoring it.
export function useManagedIdentity(enabled: boolean) {
  const [identity, setIdentity] = useState<ManagedIdentity | null>(null)
  const [probed, setProbed] = useState(false)

  useEffect(() => {
    if (!enabled) return undefined
    let active = true
    currentManagedIdentity()
      .then((current) => {
        if (active) { setIdentity(current); setProbed(true) }
      })
      .catch(() => {
        if (active) { setIdentity(null); setProbed(true) }
      })
    return () => { active = false }
  }, [enabled])

  // Derived during render rather than stored by the effect, deliberately. If the effect
  // set it, the render that first flips `enabled` false->true would still carry the
  // previous `settled: true`, and useEffect runs AFTER paint -- so a signed-in session
  // would paint one frame looking signed out. Deriving it from `enabled` makes it false on
  // the very same render that enabled it, which closes that frame.
  //
  // `enabled` here is `runtime.status === 'enterprise'`, which settles once and does not
  // oscillate; if it ever did, a second true would report settled from the first probe.
  const settled = managedIdentitySettled(enabled, probed)
  return [enabled ? identity : null, setIdentity, settled] as const
}
