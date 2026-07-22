import { type FormEvent, type ReactNode, useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate, useOutletContext, useSearchParams } from 'react-router-dom'

import siteManifest from '../../../site-manifest.json'
import './core-app.css'
import { TEAM_WORK_KEY, formatTime, teamDefinitions, useTeamWorkspace } from './team-work'

type CommerceItem = {
  sku: string
  name: string
  onHand: number
  reorderAt: number
  price: number
}

type CommerceOrderStatus = 'confirmed' | 'preparing' | 'ready' | 'completed'

type CommerceOrder = {
  id: string
  createdAt: string
  customer: string
  channel: string
  item: string
  quantity: number
  payment: string
  total: number
  status: CommerceOrderStatus
}

type CommerceState = {
  items: CommerceItem[]
  orders: CommerceOrder[]
  closes: Array<{ id: string; createdAt: string; total: number; orders: number }>
}

type ProductionJob = {
  id: string
  line: string
  product: string
  target: number
  output: number
}

type ProductionIssue = {
  id: string
  createdAt: string
  area: string
  kind: 'quality' | 'maintenance' | 'materials' | 'operations'
  summary: string
  status: 'open' | 'resolved'
}

type ProductionState = {
  jobs: ProductionJob[]
  issues: ProductionIssue[]
  machines: Array<{ id: string; name: string; state: 'running' | 'attention' | 'stopped' }>
}

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
}

type ActionDomain = 'commerce' | 'production'

type ActionKind =
  | 'order_create'
  | 'order_status'
  | 'inventory_receipt'
  | 'daily_close'
  | 'production_output'
  | 'issue_create'
  | 'issue_resolution'
  | 'machine_state'

type AccountableAction = {
  id: string
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
  apply: () => void
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

const COMMERCE_KEY = 'supermega.commerce.workspace.v1'
const PRODUCTION_KEY = 'supermega.production.workspace.v1'
const APPROVAL_KEY = 'supermega.approvals.v3'
const SETUP_KEY = 'supermega.setup.v3'
const ACTION_KEY = 'supermega.accountable.actions.v1'
const LEGACY_COMMERCE_KEYS = ['supermega.shop.workspace.v2']
const LEGACY_PRODUCTION_KEYS = ['supermega.plant.workspace.v2']
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

const seedCommerce: CommerceState = {
  items: [
    { sku: 'SM-1001', name: 'Daily essentials basket', onHand: 34, reorderAt: 10, price: 18500 },
    { sku: 'SM-1002', name: 'Cold drink pack', onHand: 8, reorderAt: 12, price: 6500 },
    { sku: 'SM-1003', name: 'Household refill', onHand: 21, reorderAt: 8, price: 12000 },
    { sku: 'SM-1004', name: 'Personal care set', onHand: 13, reorderAt: 6, price: 22500 },
  ],
  orders: [
    { id: 'ORD-1042', createdAt: new Date(Date.now() - 54 * 60 * 1000).toISOString(), customer: 'May', channel: 'Messenger', item: 'Daily essentials basket', quantity: 2, payment: 'KBZPay', total: 37000, status: 'preparing' },
    { id: 'ORD-1041', createdAt: new Date(Date.now() - 29 * 60 * 1000).toISOString(), customer: 'Ko Aung', channel: 'Phone', item: 'Household refill', quantity: 1, payment: 'Cash on delivery', total: 12000, status: 'ready' },
  ],
  closes: [],
}

const seedProduction: ProductionState = {
  jobs: [
    { id: 'JOB-201', line: 'Line 01', product: 'Batch Alpha', target: 1200, output: 860 },
    { id: 'JOB-202', line: 'Line 02', product: 'Batch Beta', target: 900, output: 745 },
    { id: 'JOB-203', line: 'Line 03', product: 'Batch Gamma', target: 650, output: 650 },
  ],
  issues: [
    { id: 'ISS-301', createdAt: new Date(Date.now() - 82 * 60 * 1000).toISOString(), area: 'Line 02', kind: 'quality', summary: 'Temperature drift requires supervisor review', status: 'open' },
  ],
  machines: [
    { id: 'MC-01', name: 'Mixer 01', state: 'running' },
    { id: 'MC-02', name: 'Press 02', state: 'attention' },
    { id: 'MC-03', name: 'Finishing 01', state: 'running' },
  ],
}

function normalizeCommerce(value: CommerceState) {
  const source = (value && typeof value === 'object' ? value : seedCommerce) as CommerceState & { sales?: Array<Record<string, unknown>> }
  const items = Array.isArray(source.items) ? source.items : seedCommerce.items
  const orders = Array.isArray(source.orders)
    ? source.orders
    : Array.isArray(source.sales)
      ? source.sales.map((sale, index): CommerceOrder => ({
          id: String(sale.id || `ORD-LEGACY-${index + 1}`),
          createdAt: String(sale.createdAt || '1970-01-01T00:00:00.000Z'),
          customer: 'Legacy customer unavailable',
          channel: 'Legacy local sale',
          item: String(sale.item || 'Legacy item'),
          quantity: Math.max(1, Number(sale.quantity) || 1),
          payment: String(sale.payment || 'Legacy payment'),
          total: Math.max(0, Number(sale.total) || 0),
          status: 'completed',
        }))
      : seedCommerce.orders
  const closes = Array.isArray(source.closes)
    ? source.closes.map((close, index) => ({
        id: String(close.id || `CLOSE-LEGACY-${index + 1}`),
        createdAt: String(close.createdAt || '1970-01-01T00:00:00.000Z'),
        total: Math.max(0, Number(close.total) || 0),
        orders: Math.max(0, Number((close as { orders?: number; transactions?: number }).orders ?? (close as { transactions?: number }).transactions) || 0),
      }))
    : []
  const normalized: CommerceState = { items, orders, closes }
  return JSON.stringify(normalized) === JSON.stringify(value) ? value : normalized
}

function normalizeProduction(value: ProductionState) {
  const source = value && typeof value === 'object' ? value : seedProduction
  const normalized: ProductionState = {
    jobs: Array.isArray(source.jobs) ? source.jobs : seedProduction.jobs,
    issues: Array.isArray(source.issues) ? source.issues.map((issue) => ({
      ...issue,
      kind: ['quality', 'maintenance', 'materials', 'operations'].includes(issue.kind) ? issue.kind : 'operations',
    })) : seedProduction.issues,
    machines: Array.isArray(source.machines) ? source.machines : seedProduction.machines,
  }
  return JSON.stringify(normalized) === JSON.stringify(value) ? value : normalized
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
  { to: '/', label: 'Today', index: '01', end: true },
  { to: '/work/', label: 'Teams', index: '02', end: false },
  { to: '/operations/', label: 'Operations', index: '03', end: false },
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

function uid(prefix: string) {
  const cryptoId = globalThis.crypto?.randomUUID?.().slice(0, 8)
  return `${prefix}-${cryptoId ?? Date.now().toString(36)}`.toUpperCase()
}

function commandUuid() {
  return globalThis.crypto?.randomUUID?.()
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
    }
  })

  return JSON.stringify(approvals) === JSON.stringify(value) ? value : approvals
}

function normalizeActions(value: AccountableAction[]) {
  if (!Array.isArray(value)) return []
  return value.filter((action) => action && typeof action.id === 'string' && action.actorKind === 'human').slice(0, 200)
}

function confirmAccountableAction(action: PendingAccountableAction, details: ActionDetails): AccountableAction {
  return {
    id: action.id,
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

function useStoredState<T>(key: string, seed: T, normalize?: (value: T) => T, legacyKeys: string[] = []) {
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
      window.localStorage.setItem(key, JSON.stringify(normalizedState))
    } catch {
      // The workspace remains usable in memory when browser storage is unavailable.
    }
  }, [key, normalizedState])

  return [normalizedState, setState] as const
}

function useCommerceWorkspace() {
  return useStoredState(COMMERCE_KEY, seedCommerce, normalizeCommerce, LEGACY_COMMERCE_KEYS)
}

function useProductionWorkspace() {
  return useStoredState(PRODUCTION_KEY, seedProduction, normalizeProduction, LEGACY_PRODUCTION_KEYS)
}

function useApprovalWorkspace() {
  return useStoredState<Approval[]>(APPROVAL_KEY, [], normalizeApprovals, LEGACY_APPROVAL_KEYS)
}

function useSetupWorkspace() {
  return useStoredState<SetupState>(SETUP_KEY, seedSetup, normalizeSetup, LEGACY_SETUP_KEYS)
}

function formatMoney(value: number) {
  return `${new Intl.NumberFormat('en-US').format(value)} MMK`
}

function AccountableActionGate({ action, onCancel, onConfirm }: {
  action: PendingAccountableAction | null
  onCancel: () => void
  onConfirm: (details: ActionDetails) => void
}) {
  const [actor, setActor] = useState('')
  const [reason, setReason] = useState('')
  const [evidenceReference, setEvidenceReference] = useState('')

  if (!action) return null

  function submit(event: FormEvent) {
    event.preventDefault()
    if (!actor.trim() || !reason.trim() || !evidenceReference.trim()) return
    onConfirm({ actor: actor.trim(), reason: reason.trim(), evidenceReference: evidenceReference.trim() })
  }

  return <section className="core-panel accountable-action-gate" aria-label="Human action confirmation">
    <div className="action-change"><span className="core-eyebrow">Human confirmation</span><h2>{action.summary}</h2><p><strong>{action.before}</strong><span>→</span><strong>{action.after}</strong></p></div>
    <form className="core-form action-confirm-form" onSubmit={submit}>
      <label>Responsible operator<input maxLength={80} required value={actor} onChange={(event) => setActor(event.target.value)} placeholder="Name or accountable role" /></label>
      <label>Reason<input maxLength={180} required value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Why this change is correct now" /></label>
      <label>Evidence source or reference<input maxLength={180} required value={evidenceReference} onChange={(event) => setEvidenceReference(event.target.value)} placeholder="Message ID, receipt, count sheet, or observation" /></label>
      <div className="form-actions"><button className="text-link" onClick={onCancel} type="button">Cancel</button><button className="core-button primary compact" type="submit">Confirm and record</button></div>
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

  useEffect(() => {
    const routeName = location.pathname.startsWith('/settings/')
      ? 'Settings'
      : navigation.find((item) => item.to !== '/' && location.pathname.startsWith(item.to))?.label ?? 'Today'
    document.title = `${routeName} | SuperMega`
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [location.pathname])

  return (
    <div className="core-shell">
      <a className="core-skip" href="#workspace-main">Skip to workspace</a>
      <aside className="core-sidebar">
        <Brand />
        <div className="workspace-label"><span>Company</span><strong>SuperMega HQ</strong></div>
        <nav className="core-nav" aria-label="Application">
          {navigation.map((item) => <NavLink className={({ isActive }) => isActive ? 'active' : ''} end={item.end} key={item.to} to={item.to}><span>{item.index}</span>{item.label}</NavLink>)}
        </nav>
        <div className="sidebar-foot"><RuntimeBadge status={runtime.status} /><p>Browser-local working records. Managed mode stays locked until identity, data, audit, and recovery pass.</p><NavLink to="/settings/">Settings</NavLink></div>
      </aside>
      <div className="core-stage">
        <header className="core-topbar"><div className="mobile-brand"><Brand /></div><div className="topbar-title"><span className="terminal-prompt">&gt;_</span><strong>Company operating system</strong></div><div className="topbar-meta"><span>MMK</span><span>UTC+06:30</span><NavLink to="/settings/">Settings</NavLink><RuntimeBadge status={runtime.status} /></div></header>
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

function ApprovalReviewDialog({ approval, onClose, onDecision }: { approval: Approval; onClose: () => void; onDecision: (status: 'approved' | 'declined', reviewer: string, note: string) => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const reviewerInputRef = useRef<HTMLInputElement>(null)
  const [reviewer, setReviewer] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')

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

  function decide(status: 'approved' | 'declined') {
    if (!reviewer.trim() || !note.trim()) {
      setError('Name the human reviewer and record the reason for this decision.')
      return
    }
    onDecision(status, reviewer.trim(), note.trim())
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
      <div className="form-actions"><button className="core-button danger" onClick={() => decide('declined')} type="button">Decline and record</button><button className="core-button primary" onClick={() => decide('approved')} type="button">Approve and record</button></div>
    </dialog>
  )
}

export function OverviewPage() {
  const [commerce] = useCommerceWorkspace()
  const [production] = useProductionWorkspace()
  const [approvals, setApprovals] = useApprovalWorkspace()
  const [setup] = useSetupWorkspace()
  const [workspace] = useTeamWorkspace()
  const [brief, setBrief] = useState<string[]>([])
  const [selectedApprovalId, setSelectedApprovalId] = useState('')
  const openWork = workspace.items.filter((item) => item.status !== 'done')
  const activeWork = workspace.items.filter((item) => ['in_progress', 'review'].includes(item.status))
  const blockedWork = workspace.items.filter((item) => item.status === 'blocked')
  const pendingApprovals = approvals.filter((item) => item.status === 'pending')
  const lowStock = commerce.items.filter((item) => item.onHand <= item.reorderAt)
  const openProductionIssues = production.issues.filter((issue) => issue.status === 'open')
  const openOrders = commerce.orders.filter((order) => order.status !== 'completed')
  const releaseComplete = workspace.release.checks.filter((check) => check.complete).length
  const releasePercent = Math.round((releaseComplete / workspace.release.checks.length) * 100)
  const isPilotReady = pilotReady(setup)
  const ownerAttention = blockedWork.length + pendingApprovals.length + (isPilotReady ? 0 : 1)
  const selectedApproval = pendingApprovals.find((approval) => approval.id === selectedApprovalId)

  function prepareCompanyBrief() {
    setBrief([
      `${openWork.length} company work items remain open; ${activeWork.length} are in delivery or review.`,
      `${openOrders.length} Commerce orders, ${lowStock.length} stock exceptions, and ${openProductionIssues.length} Production issues need operating attention.`,
      `${workspace.release.name} is ${releasePercent}% ready from ${workspace.release.checks.length} explicit checks.`,
      isPilotReady ? `${setup.workspace} pilot starts from ${setup.entryPoint}; baseline: ${setup.baseline}; target: ${setup.targetOutcome}.` : `Pilot definition is ${pilotProgress(setup)}% complete and still needs a baseline, target, authority boundary, and acceptance evidence.`,
    ])
  }

  function requestBriefApproval() {
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
    setApprovals((current) => [approval, ...current.map((candidate) => candidate.status === 'pending' && candidate.title === approval.title ? { ...candidate, status: 'superseded' as const } : candidate)])
    setSelectedApprovalId(approval.id)
  }

  function setApprovalStatus(id: string, status: 'approved' | 'declined', reviewer: string, note: string) {
    setApprovals((current) => current.map((approval) => approval.id === id ? { ...approval, status, decidedAt: new Date().toISOString(), decidedBy: reviewer, decidedActorKind: 'human', decisionNote: note } : approval))
    setSelectedApprovalId('')
  }

  return (
    <div className="workspace-screen command-screen">
      <PageHeading eyebrow="Today" title="The work that needs attention." copy="Company delivery, customer operations, production exceptions, and owner decisions in one bounded view." />
      <section className="summary-strip" aria-label="Workspace summary"><span><small>Open work</small><strong>{openWork.length}</strong></span><span><small>In delivery</small><strong>{activeWork.length}</strong></span><span><small>Open orders</small><strong>{openOrders.length}</strong></span><span><small>Exceptions</small><strong>{lowStock.length + openProductionIssues.length}</strong></span><span><small>Needs owner</small><strong>{ownerAttention}</strong></span></section>
      <div className="command-grid">
        <section className="core-panel command-queue-panel">
          <div className="panel-head"><div><span className="core-eyebrow">Company queue</span><h2>Work in motion</h2></div><Link className="text-link" to="/work/?team=product&view=board">Open Teams</Link></div>
          <div className="record-list">{openWork.map((item) => { const team = teamDefinitions.find((definition) => definition.id === item.team); return <Link className="record-row" key={item.id} to={`/work/?team=${item.team}&view=board`}><span className={`record-status ${item.status}`} /><span><strong>{item.title}</strong><small>{team?.label ?? item.team} · {item.owner} · {item.evidence.length} evidence</small></span><span><b>{item.priority}</b><small>{item.status.replace('_', ' ')}</small></span></Link> })}</div>
        </section>
        <section className="core-panel attention-panel">
          <div className="panel-head"><div><span className="core-eyebrow">Needs owner</span><h2>{ownerAttention + lowStock.length + openProductionIssues.length} exceptions</h2></div></div>
          <div className="attention-list">
            {!isPilotReady ? <Link to="/settings/"><span>Pilot</span><strong>Define the measurable workflow</strong><small>{pilotProgress(setup)}% complete · baseline and acceptance required</small></Link> : null}
            {blockedWork.map((item) => <Link key={item.id} to={`/work/?team=${item.team}&view=board`}><span>Work</span><strong>{item.title}</strong><small>{item.owner}</small></Link>)}
            {pendingApprovals.map((approval) => <button className="attention-action" key={approval.id} onClick={() => setSelectedApprovalId(approval.id)} type="button"><span>Approval</span><strong>{approval.title}</strong><small>{approval.packet.claims.length} claims · {formatTime(approval.createdAt)}</small><b>Review</b></button>)}
            {lowStock.map((item) => <Link key={item.sku} to="/operations/commerce/?tab=inventory"><span>Stock</span><strong>{item.name}</strong><small>{item.onHand} on hand · reorder at {item.reorderAt}</small></Link>)}
            {openProductionIssues.map((issue) => <Link key={issue.id} to="/operations/production/?tab=control"><span>{issue.kind}</span><strong>{issue.summary}</strong><small>{issue.area}</small></Link>)}
            {isPilotReady && !blockedWork.length && !pendingApprovals.length && !lowStock.length && !openProductionIssues.length ? <Empty>No operating exception needs attention.</Empty> : null}
          </div>
        </section>
        <section className="core-panel release-brief-panel">
          <div className="release-line"><div><span className="core-eyebrow">Product release</span><h2>{workspace.release.name}</h2></div><strong>{releasePercent}%</strong></div>
          <div className="progress-track"><i style={{ width: `${releasePercent}%` }} /></div>
          <div className="release-mini-checks">{workspace.release.checks.map((check) => <span className={check.complete ? 'complete' : ''} key={check.id}>{check.complete ? '✓' : '○'} {check.label}</span>)}</div>
          <div className="brief-divider"><span>Company brief</span><button className="text-link" onClick={prepareCompanyBrief} type="button">Prepare brief</button></div>
          {brief.length ? <div className="brief-output compact">{brief.map((line) => <p key={line}>{line}</p>)}<button className="core-button compact" onClick={requestBriefApproval} type="button">Request owner review</button></div> : <p className="panel-copy">Prepared locally from the visible work, release, Commerce, and Production records.</p>}
        </section>
      </div>
      {selectedApproval ? <ApprovalReviewDialog approval={selectedApproval} onClose={() => setSelectedApprovalId('')} onDecision={(status, reviewer, note) => setApprovalStatus(selectedApproval.id, status, reviewer, note)} /> : null}
    </div>
  )
}

export function OperationsPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [setup] = useSetupWorkspace()
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
      <PageHeading eyebrow="Operations" title={view === 'commerce' ? 'Commerce' : 'Production'} copy={`${operationsCopy} Measure: ${profileMeasure}.`} actions={<div className="operations-profile"><span>{profileLabel}</span><strong>{activeTemplate.name}</strong><small>{activeTemplate.workflow.join(' → ')}</small><Link className="text-link" to="/settings/">Configure</Link></div>} />
      <div className="workspace-toolbar"><div className="segmented-control" role="group" aria-label="Operations module"><button aria-pressed={view === 'commerce'} onClick={() => setMode('commerce')} type="button">Commerce</button><button aria-pressed={view === 'production'} onClick={() => setMode('production')} type="button">Production</button></div><div className="view-tabs" role="tablist" aria-label="Module views">{tabs.map((tab) => <button aria-selected={activeTab === tab.id} key={tab.id} onClick={() => setTab(tab.id)} role="tab" type="button">{tab.label}</button>)}</div></div>
      <div className="workspace-view">{view === 'commerce' ? <CommercePage tab={commerceTab} /> : <ProductionPage tab={productionTab} />}</div>
    </div>
  )
}

function CommercePage({ tab }: { tab: CommerceTab }) {
  const [commerce, setCommerce] = useCommerceWorkspace()
  const [actions, setActions] = useStoredState<AccountableAction[]>(ACTION_KEY, [], normalizeActions)
  const [pendingAction, setPendingAction] = useState<PendingAccountableAction | null>(null)
  const [sku, setSku] = useState(commerce.items[0]?.sku ?? '')
  const [quantity, setQuantity] = useState(1)
  const [customer, setCustomer] = useState('')
  const [channel, setChannel] = useState('Messenger')
  const [payment, setPayment] = useState('KBZPay')
  const [notice, setNotice] = useState('')
  const selected = commerce.items.find((item) => item.sku === sku) ?? commerce.items[0]
  const revenue = commerce.orders.reduce((total, order) => total + order.total, 0)
  const lowStock = commerce.items.filter((item) => item.onHand <= item.reorderAt)
  const openOrders = commerce.orders.filter((order) => order.status !== 'completed')

  function queueAction(action: Omit<PendingAccountableAction, 'id' | 'domain'>) {
    setPendingAction({ ...action, id: uid('ACT'), domain: 'commerce' })
    setNotice('Review the change, accountable operator, and evidence before it is applied.')
  }

  function confirmAction(details: ActionDetails) {
    if (!pendingAction) return
    pendingAction.apply()
    const record = confirmAccountableAction(pendingAction, details)
    setActions((current) => [record, ...current])
    setNotice(`${record.id} applied and added to the action history.`)
    setPendingAction(null)
  }

  function recordOrder(event: FormEvent) {
    event.preventDefault()
    if (!selected || quantity < 1 || selected.onHand < quantity) {
      setNotice('Quantity is not available. Review stock before confirming the order.')
      return
    }
    const order: CommerceOrder = { id: uid('ORD'), createdAt: new Date().toISOString(), customer: customer.trim() || 'Guest', channel, item: selected.name, quantity, payment, total: selected.price * quantity, status: 'confirmed' }
    const itemSku = selected.sku
    const beforeStock = selected.onHand
    queueAction({
      kind: 'order_create',
      subjectId: order.id,
      summary: `Confirm ${order.id} from ${channel}`,
      before: `${itemSku} · ${beforeStock} on hand`,
      after: `${order.status} · ${beforeStock - quantity} on hand`,
      apply: () => {
        setCommerce((current) => ({ ...current, items: current.items.map((item) => item.sku === itemSku ? { ...item, onHand: item.onHand - quantity } : item), orders: [order, ...current.orders] }))
        setQuantity(1)
        setCustomer('')
      },
    })
  }

  function advanceOrder(orderId: string) {
    const next: Record<CommerceOrderStatus, CommerceOrderStatus> = { confirmed: 'preparing', preparing: 'ready', ready: 'completed', completed: 'completed' }
    const order = commerce.orders.find((candidate) => candidate.id === orderId)
    if (!order || order.status === 'completed') return
    const nextStatus = next[order.status]
    queueAction({ kind: 'order_status', subjectId: orderId, summary: `Advance ${orderId} fulfilment`, before: order.status, after: nextStatus, apply: () => setCommerce((current) => ({ ...current, orders: current.orders.map((candidate) => candidate.id === orderId ? { ...candidate, status: next[candidate.status] } : candidate) })) })
  }

  function restock(itemSku: string) {
    const item = commerce.items.find((candidate) => candidate.sku === itemSku)
    if (!item) return
    queueAction({ kind: 'inventory_receipt', subjectId: itemSku, summary: `Receive 10 units of ${item.name}`, before: `${item.onHand} on hand`, after: `${item.onHand + 10} on hand`, apply: () => setCommerce((current) => ({ ...current, items: current.items.map((candidate) => candidate.sku === itemSku ? { ...candidate, onHand: candidate.onHand + 10 } : candidate) })) })
  }

  function closeDay() {
    const close = { id: uid('CLOSE'), createdAt: new Date().toISOString(), total: revenue, orders: commerce.orders.length }
    queueAction({ kind: 'daily_close', subjectId: close.id, summary: `Save ${close.id} daily close`, before: `${commerce.closes.length} snapshots`, after: `${commerce.closes.length + 1} snapshots · ${formatMoney(close.total)}`, apply: () => setCommerce((current) => ({ ...current, closes: [close, ...current.closes] })) })
  }

  const actionControls = <><AccountableActionGate key={pendingAction?.id ?? 'commerce-idle'} action={pendingAction} onCancel={() => setPendingAction(null)} onConfirm={confirmAction} /><ActionHistory actions={actions} domain="commerce" /></>

  if (tab === 'orders') return <div className="operation-module"><div className="split-workspace order-view">
    <section className="core-panel order-form-panel"><div className="panel-head"><div><span className="core-eyebrow">Channel to order</span><h2>Confirm an order</h2></div><span className="status-pill ready">Stock checked</span></div><form className="core-form compact-form" onSubmit={recordOrder}><div className="form-row"><label>Customer<input maxLength={80} value={customer} onChange={(event) => setCustomer(event.target.value)} placeholder="Name or reference" /></label><label>Channel<select value={channel} onChange={(event) => setChannel(event.target.value)}><option>Messenger</option><option>Viber</option><option>Phone</option><option>Website</option><option>Walk-in</option></select></label></div><label>Item<select value={sku} onChange={(event) => setSku(event.target.value)}>{commerce.items.map((item) => <option key={item.sku} value={item.sku}>{item.name} · {item.onHand} available</option>)}</select></label><div className="form-row"><label>Quantity<input min="1" max={selected?.onHand ?? 1} type="number" value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} /></label><label>Payment<select value={payment} onChange={(event) => setPayment(event.target.value)}><option>KBZPay</option><option>WavePay</option><option>Cash on delivery</option><option>Cash</option><option>Card</option></select></label></div><div className="order-total"><span>Order total</span><strong>{formatMoney((selected?.price ?? 0) * Math.max(quantity, 0))}</strong></div><button className="core-button primary" type="submit">Confirm order</button><p className="form-notice" aria-live="polite">{notice || 'The channel is recorded; no message is sent from this trial.'}</p></form></section>
    <section className="core-panel order-queue-panel"><div className="panel-head"><div><span className="core-eyebrow">Fulfilment</span><h2>{openOrders.length} open orders</h2></div></div><OrderList orders={commerce.orders} onAdvance={advanceOrder} /></section>
  </div>{actionControls}</div>

  if (tab === 'inventory') return <div className="operation-module"><section className="core-panel inventory-panel"><div className="panel-head"><div><span className="core-eyebrow">Stock control</span><h2>Inventory and reorder boundaries</h2></div><span className="panel-note">{lowStock.length} at boundary</span></div><div className="data-table" role="table" aria-label="Commerce inventory"><div className="data-row table-head" role="row"><span>Item</span><span>On hand</span><span>Reorder</span><span>Price</span><span>Action</span></div>{commerce.items.map((item) => <div className="data-row" role="row" key={item.sku}><span><strong>{item.name}</strong><small>{item.sku}</small></span><span className={item.onHand <= item.reorderAt ? 'warning-text' : ''}>{item.onHand}</span><span>{item.reorderAt}</span><span>{formatMoney(item.price)}</span><span><button className="text-link" type="button" onClick={() => restock(item.sku)}>Receive +10</button></span></div>)}</div><p className="form-notice" aria-live="polite">{notice || 'Receipts update only this browser workspace.'}</p></section>{actionControls}</div>

  return <div className="operation-module"><div className="module-today"><section className="summary-strip"><span><small>Order value</small><strong>{formatMoney(revenue)}</strong></span><span><small>Open orders</small><strong>{openOrders.length}</strong></span><span><small>Low stock</small><strong>{lowStock.length}</strong></span><span><small>Close snapshots</small><strong>{commerce.closes.length}</strong></span></section><div className="split-workspace ops-today-grid"><section className="core-panel"><div className="panel-head"><div><span className="core-eyebrow">Order flow</span><h2>Latest channel orders</h2></div><Link className="text-link" to="/operations/commerce/?tab=orders">Open orders</Link></div><OrderList orders={commerce.orders.slice(0, 5)} onAdvance={advanceOrder} /></section><section className="core-panel"><div className="panel-head"><div><span className="core-eyebrow">Daily control</span><h2>Exceptions and close</h2></div></div><div className="exception-summary"><span><strong>{lowStock.length}</strong><small>reorder boundaries</small></span><span><strong>{openOrders.length}</strong><small>orders not complete</small></span></div><div className="boundary-list">{lowStock.map((item) => <Link key={item.sku} to="/operations/commerce/?tab=inventory"><strong>{item.name}</strong><small>{item.onHand} on hand</small></Link>)}</div><button className="core-button" onClick={closeDay} type="button">Save daily close</button><p className="form-notice" aria-live="polite">{notice}</p></section></div></div>{actionControls}</div>
}

function OrderList({ orders, onAdvance }: { orders: CommerceOrder[]; onAdvance: (id: string) => void }) {
  if (!orders.length) return <Empty>No orders recorded.</Empty>
  return <div className="order-list">{orders.map((order) => <article key={order.id}><div><span className={`status-pill ${order.status === 'completed' ? 'approved' : 'bounded'}`}>{order.status}</span><strong>{order.customer} · {order.item} × {order.quantity}</strong><small>{order.id} · {order.channel} · {order.payment} · {formatTime(order.createdAt)}</small></div><div><b>{formatMoney(order.total)}</b>{order.status !== 'completed' ? <button className="text-link" onClick={() => onAdvance(order.id)} type="button">Advance</button> : null}</div></article>)}</div>
}

function ProductionPage({ tab }: { tab: ProductionTab }) {
  const [production, setProduction] = useProductionWorkspace()
  const [actions, setActions] = useStoredState<AccountableAction[]>(ACTION_KEY, [], normalizeActions)
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

  function queueAction(action: Omit<PendingAccountableAction, 'id' | 'domain'>) {
    setPendingAction({ ...action, id: uid('ACT'), domain: 'production' })
    setNotice('Review the change, accountable operator, and evidence before it is applied.')
  }

  function confirmAction(details: ActionDetails) {
    if (!pendingAction) return
    pendingAction.apply()
    const record = confirmAccountableAction(pendingAction, details)
    setActions((current) => [record, ...current])
    setNotice(`${record.id} applied and added to the action history.`)
    setPendingAction(null)
  }

  function recordOutput(event: FormEvent) {
    event.preventDefault()
    if (quantity < 1) return
    const selectedJob = production.jobs.find((job) => job.id === jobId)
    if (!selectedJob) return setNotice('Choose an active job before recording output.')
    const recordedQuantity = Math.min(quantity, Math.max(0, selectedJob.target - selectedJob.output))
    if (recordedQuantity < 1) return setNotice(`${jobId} is already at target.`)
    queueAction({ kind: 'production_output', subjectId: jobId, summary: `Record ${recordedQuantity} good units for ${jobId}`, before: `${selectedJob.output} / ${selectedJob.target}`, after: `${selectedJob.output + recordedQuantity} / ${selectedJob.target}`, apply: () => setProduction((current) => ({ ...current, jobs: current.jobs.map((job) => job.id === jobId ? { ...job, output: Math.min(job.target, job.output + recordedQuantity) } : job) })) })
  }

  function createIssue(event: FormEvent) {
    event.preventDefault()
    if (!summary.trim()) return
    const issue: ProductionIssue = { id: uid('ISS'), createdAt: new Date().toISOString(), area, kind, summary: summary.trim(), status: 'open' }
    queueAction({ kind: 'issue_create', subjectId: issue.id, summary: `Open ${issue.kind} issue for ${issue.area}`, before: 'No issue record', after: `${issue.id} · open`, apply: () => { setProduction((current) => ({ ...current, issues: [issue, ...current.issues] })); setSummary('') } })
  }

  function resolveIssue(issueId: string) {
    const issue = production.issues.find((candidate) => candidate.id === issueId)
    if (!issue || issue.status === 'resolved') return
    queueAction({ kind: 'issue_resolution', subjectId: issueId, summary: `Resolve ${issueId}`, before: issue.status, after: 'resolved', apply: () => setProduction((current) => ({ ...current, issues: current.issues.map((candidate) => candidate.id === issueId ? { ...candidate, status: 'resolved' } : candidate) })) })
  }

  function cycleMachine(machineId: string) {
    const next = { running: 'attention', attention: 'stopped', stopped: 'running' } as const
    const machine = production.machines.find((candidate) => candidate.id === machineId)
    if (!machine) return
    const nextState = next[machine.state]
    queueAction({ kind: 'machine_state', subjectId: machineId, summary: `Change ${machine.name} state`, before: machine.state, after: nextState, apply: () => setProduction((current) => ({ ...current, machines: current.machines.map((candidate) => candidate.id === machineId ? { ...candidate, state: next[candidate.state] } : candidate) })) })
  }

  const actionControls = <><AccountableActionGate key={pendingAction?.id ?? 'production-idle'} action={pendingAction} onCancel={() => setPendingAction(null)} onConfirm={confirmAction} /><ActionHistory actions={actions} domain="production" /></>

  if (tab === 'production') return <div className="operation-module"><div className="split-workspace production-view"><section className="core-panel job-panel"><div className="panel-head"><div><span className="core-eyebrow">Production plan</span><h2>Active jobs</h2></div><span className="panel-note">Output is capped at target</span></div><JobList jobs={production.jobs} /></section><section className="core-panel output-panel"><span className="core-eyebrow">Good output</span><h2>Confirm production</h2><form className="core-form compact-form" onSubmit={recordOutput}><label>Job<select value={jobId} onChange={(event) => setJobId(event.target.value)}>{production.jobs.map((job) => <option key={job.id}>{job.id}</option>)}</select></label><label>Quantity<input min="1" type="number" value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} /></label><button className="core-button primary" type="submit">Record output</button><p className="form-notice" aria-live="polite">{notice || 'A managed workspace accepts output only from an authorized operator or source.'}</p></form></section></div>{actionControls}</div>

  if (tab === 'control') return <div className="operation-module"><div className="control-workspace"><div className="split-workspace"><section className="core-panel"><div className="panel-head"><div><span className="core-eyebrow">Equipment</span><h2>Machine state</h2></div></div><div className="machine-list">{production.machines.map((machine) => <button key={machine.id} type="button" onClick={() => cycleMachine(machine.id)}><span className={`machine-dot ${machine.state}`} /><span><strong>{machine.name}</strong><small>{machine.id}</small></span><b>{machine.state}</b></button>)}</div><p className="panel-copy">Local state only; managed telemetry must be authorized and attributable.</p></section><section className="core-panel"><span className="core-eyebrow">Exception</span><h2>Open an issue</h2><form className="core-form compact-form" onSubmit={createIssue}><div className="form-row"><label>Type<select value={kind} onChange={(event) => setKind(event.target.value as ProductionIssue['kind'])}><option value="quality">Quality</option><option value="maintenance">Maintenance</option><option value="materials">Materials</option><option value="operations">Operations</option></select></label><label>Area<select value={area} onChange={(event) => setArea(event.target.value)}><option>Line 01</option><option>Line 02</option><option>Line 03</option><option>Materials</option><option>Quality</option></select></label></div><label>Observation<textarea maxLength={240} required value={summary} onChange={(event) => setSummary(event.target.value)} placeholder="Describe what happened, not the assumption." /></label><button className="core-button primary" type="submit">Open issue</button></form></section></div><section className="core-panel issue-register"><div className="panel-head"><div><span className="core-eyebrow">Shift review</span><h2>Issue register</h2></div><span className="panel-note">{openIssues.length} open</span></div><IssueList issues={production.issues} onResolve={resolveIssue} /></section></div>{actionControls}</div>

  return <div className="operation-module"><div className="module-today"><section className="summary-strip"><span><small>Output</small><strong>{output.toLocaleString()}</strong></span><span><small>Target</small><strong>{target.toLocaleString()}</strong></span><span><small>Completion</small><strong>{Math.round((output / target) * 100)}%</strong></span><span><small>Open issues</small><strong>{openIssues.length}</strong></span><span><small>Machines running</small><strong>{production.machines.filter((item) => item.state === 'running').length}/{production.machines.length}</strong></span></section><div className="split-workspace ops-today-grid"><section className="core-panel"><div className="panel-head"><div><span className="core-eyebrow">Plan vs actual</span><h2>Active production</h2></div><Link className="text-link" to="/operations/production/?tab=production">Record output</Link></div><JobList jobs={production.jobs} /></section><section className="core-panel"><div className="panel-head"><div><span className="core-eyebrow">Exceptions</span><h2>Quality and equipment</h2></div><Link className="text-link" to="/operations/production/?tab=control">Open controls</Link></div><IssueList issues={openIssues} onResolve={resolveIssue} /></section></div></div>{actionControls}</div>
}

function JobList({ jobs }: { jobs: ProductionJob[] }) {
  return <div className="job-list">{jobs.map((job) => { const progress = Math.min(100, Math.round((job.output / job.target) * 100)); return <article key={job.id}><div><span>{job.id} · {job.line}</span><strong>{job.product}</strong></div><div className="job-progress"><span><i style={{ width: `${progress}%` }} /></span><small>{job.output.toLocaleString()} / {job.target.toLocaleString()} · {progress}%</small></div></article> })}</div>
}

function IssueList({ issues, onResolve }: { issues: ProductionIssue[]; onResolve: (id: string) => void }) {
  if (!issues.length) return <Empty>No production issue is open.</Empty>
  return <div className="issue-list">{issues.map((issue) => <article key={issue.id}><span className={`issue-mark ${issue.status}`}>{issue.status === 'open' ? '!' : '✓'}</span><div><strong>{issue.summary}</strong><small>{issue.id} · {issue.kind} · {issue.area} · {formatTime(issue.createdAt)}</small></div>{issue.status === 'open' ? <button className="text-link" onClick={() => onResolve(issue.id)} type="button">Resolve</button> : <b>Resolved</b>}</article>)}</div>
}

export function SettingsPage() {
  const runtime = useOutletContext<RuntimeHealth>()
  const [setup, setSetup] = useSetupWorkspace()
  const [commerce] = useCommerceWorkspace()
  const [production] = useProductionWorkspace()
  const [approvals] = useApprovalWorkspace()
  const [actions] = useStoredState<AccountableAction[]>(ACTION_KEY, [], normalizeActions)
  const [teamWorkspace] = useTeamWorkspace()
  const [notice, setNotice] = useState('')
  const [resetArmed, setResetArmed] = useState(false)
  const completion = pilotProgress(setup)
  const isPilotReady = pilotReady(setup)
  const selectedTemplate = templateFor(setup.product, setup.template)
  const evidenceDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Yangon' }).format(new Date())
  const evidenceFilename = `supermega-trial-evidence-${evidenceDate}.json`
  const managedApprovalRequests = approvals.map(toManagedApprovalRequest).filter((request): request is NonNullable<typeof request> => Boolean(request))
  const evidenceHref = `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify({ contract: 'supermega_trial_evidence', version: 8, exportedAt: new Date().toISOString(), environment: 'isolated_demo', pilotReady: isPilotReady, setup, workflowProfile: selectedTemplate, commerce, production, accountableActions: actions, approvals, managedApprovalRequests, teams: teamWorkspace }, null, 2))}`

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
    ;[COMMERCE_KEY, PRODUCTION_KEY, APPROVAL_KEY, SETUP_KEY, ACTION_KEY, TEAM_WORK_KEY, ...LEGACY_COMMERCE_KEYS, ...LEGACY_PRODUCTION_KEYS, ...LEGACY_APPROVAL_KEYS, ...LEGACY_SETUP_KEYS].forEach((key) => window.localStorage.removeItem(key))
    window.location.assign('/')
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
          <div className="readiness-list"><span><small>Pilot definition</small><strong>{isPilotReady ? 'Ready' : `${completion}% complete`}</strong></span><span><small>Runtime</small><strong>{runtime.serviceStatus}</strong></span><span><small>Operating mode</small><strong>{runtime.operatingMode.replace('_', ' ')}</strong></span><span><small>Managed data</small><strong>{runtime.enterpriseDbReady ? 'Ready' : 'Not connected'}</strong></span><span><small>Security</small><strong>{runtime.securityReady ? 'Ready' : 'Not ready'}</strong></span><span><small>Write path</small><strong>{runtime.writesReady ? 'Enabled' : 'Locked'}</strong></span><span><small>Source coverage</small><strong>{runtime.coverageScore}%</strong></span><span><small>External action</small><strong>Owner controlled</strong></span></div>
          {runtime.status !== 'enterprise' ? <ul className="requirement-list">{(runtime.requirements.length ? runtime.requirements : ['Configure managed tenant persistence.', 'Verify production identity and source coverage.']).map((requirement) => <li key={requirement}>{requirement}</li>)}</ul> : null}
          <p className="authority-note">External sends, payments, publishing, access changes, and production writes remain owner-approved and auditable.</p>
        </section>
      </div>
      <section className="core-panel trial-control-panel"><div><span className="core-eyebrow">Local evidence</span><h2>Export or reset deliberately.</h2><p>Export the pilot definition and full browser workspace for review. Reset only after the evidence is no longer needed.</p></div><div className="trial-actions"><a className="core-button" download={evidenceFilename} href={evidenceHref}>Export evidence</a>{resetArmed ? <><button className="text-link" onClick={() => setResetArmed(false)} type="button">Cancel</button><button className="core-button danger" onClick={resetDemoWorkspace} type="button">Confirm reset</button></> : <button className="text-link danger-text" onClick={() => setResetArmed(true)} type="button">Reset local trial</button>}</div></section>
    </div>
  )
}
