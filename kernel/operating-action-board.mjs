import { createHash } from 'node:crypto'

export const OPERATING_ACTION_BOARD_CONTRACT = 'supermega.operating-action-board.v1'
export const OPERATING_ACTION_BOARD_MODE = 'local_no_external_effects'

const PRODUCT_IDS = ['shop', 'plant', 'website', 'ecommerce']
const CONTROL_FIELDS = [
  'externalWritesPerformed',
  'gitRemoteWritesPerformed',
  'githubWritesPerformed',
  'vercelDeploymentsPerformed',
  'supabaseMutationsPerformed',
  'credentialValuesInspected',
  'customerContactPerformed',
  'paymentOrStockActionPerformed',
  'managedActivationPerformed',
  'privateIdentityExposed',
]
const ACTION_FIELDS = [
  'id',
  'openedAt',
  'productIds',
  'sourceFinding',
  'recommendation',
  'severity',
  'businessImpact',
  'owner',
  'dueDate',
  'status',
  'authority',
  'acceptance',
  'closure',
]
const STATUS_VALUES = new Set(['proposed', 'owner-gated', 'open', 'blocked', 'closed', 'rejected'])
const OPEN_STATUSES = new Set(['proposed', 'owner-gated', 'open', 'blocked'])
const SEVERITY_VALUES = new Set(['critical', 'high', 'medium', 'low'])
const SOURCE_TYPES = new Set([
  'audit_document',
  'release_gate',
  'pilot_observation',
  'runtime_metric',
  'owner_review',
  'regression_test',
  'architecture_record',
])
const IMPACT_KINDS = new Set(['release_risk', 'pilot_readiness', 'quality', 'time', 'revenue', 'trust', 'security'])
const ID_PATTERN = /^[a-z0-9][a-z0-9-]{2,79}$/
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/
const SECRET_PATTERNS = [
  /sk-[A-Za-z0-9_-]{20,}/,
  /sk-proj-[A-Za-z0-9_-]{20,}/,
  /ghp_[A-Za-z0-9]{20,}/,
  /github_pat_[A-Za-z0-9_]{20,}/,
  /sb_secret_[A-Za-z0-9_-]{20,}/,
  /postgres(?:ql)?:\/\/[^"\s]+/i,
  /https?:\/\/[^/\s:@]+:[^/\s@]+@/i,
  /-----BEGIN (?:RSA |OPENSSH |EC |DSA |PRIVATE )?PRIVATE KEY-----/,
]

function fail(code) {
  throw new Error(code)
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`
}

export function operatingActionBoardDigest(value) {
  return `sha256:${createHash('sha256').update(stableStringify(value)).digest('hex')}`
}

function assertExactFields(value, fields, code) {
  if (!isRecord(value)) fail(code)
  const actual = Object.keys(value).sort().join(',')
  const expected = [...fields].sort().join(',')
  if (actual !== expected) fail(code)
}

function assertNoSecretShape(value, code = 'operating_action_board_secret_shape') {
  const text = JSON.stringify(value || {})
  if (SECRET_PATTERNS.some((pattern) => pattern.test(text))) fail(code)
}

function assertLine(value, maxLength, code) {
  const normalized = String(value || '').trim()
  if (!normalized || normalized.length > maxLength || /[\r\n\u0000-\u001f\u007f]/.test(normalized)) fail(code)
  assertNoSecretShape(normalized, code)
  return normalized
}

function assertDate(value, code) {
  const normalized = String(value || '').trim()
  const parsed = new Date(`${normalized}T00:00:00.000Z`)
  if (!DATE_PATTERN.test(normalized)
    || Number.isNaN(parsed.getTime())
    || parsed.toISOString().slice(0, 10) !== normalized) fail(code)
  return normalized
}

function assertTimestamp(value, code) {
  const normalized = String(value || '').trim()
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(normalized)
    || Number.isNaN(Date.parse(normalized))) fail(code)
  return normalized
}

function assertDigest(value, code) {
  const normalized = String(value || '').trim().toLowerCase()
  if (!DIGEST_PATTERN.test(normalized)) fail(code)
  return normalized
}

function validateProducts(productIds) {
  if (!Array.isArray(productIds) || productIds.length < 1 || productIds.length > PRODUCT_IDS.length) {
    fail('operating_action_board_products_invalid')
  }
  const seen = new Set()
  for (const productId of productIds) {
    if (!PRODUCT_IDS.includes(productId) || seen.has(productId)) fail('operating_action_board_products_invalid')
    seen.add(productId)
  }
  return [...seen]
}

function validateStringArray(value, min, max, code) {
  if (!Array.isArray(value) || value.length < min || value.length > max) fail(code)
  return value.map((entry) => assertLine(entry, 160, code))
}

function daysBetween(start, end) {
  const startMs = Date.parse(start)
  const endMs = Date.parse(end)
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
    fail('operating_action_board_closure_time_invalid')
  }
  return Math.round(((endMs - startMs) / 86_400_000) * 1000) / 1000
}

function median(values) {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1
    ? sorted[mid]
    : Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 1000) / 1000
}

function validateSourceFinding(sourceFinding) {
  assertExactFields(sourceFinding, ['sourceType', 'label', 'evidenceRef', 'evidenceDigest'], 'operating_action_source_invalid')
  if (!SOURCE_TYPES.has(sourceFinding.sourceType)) fail('operating_action_source_type_invalid')
  return {
    sourceType: sourceFinding.sourceType,
    label: assertLine(sourceFinding.label, 160, 'operating_action_source_label_invalid'),
    evidenceRef: assertLine(sourceFinding.evidenceRef, 240, 'operating_action_source_ref_invalid'),
    evidenceDigest: assertDigest(sourceFinding.evidenceDigest, 'operating_action_source_digest_invalid'),
  }
}

function validateBusinessImpact(businessImpact) {
  assertExactFields(businessImpact, ['kind', 'estimateLabel', 'measured'], 'operating_action_impact_invalid')
  if (!IMPACT_KINDS.has(businessImpact.kind)) fail('operating_action_impact_kind_invalid')
  if (typeof businessImpact.measured !== 'boolean') fail('operating_action_impact_measured_invalid')
  return {
    kind: businessImpact.kind,
    estimateLabel: assertLine(businessImpact.estimateLabel, 180, 'operating_action_impact_label_invalid'),
    measured: businessImpact.measured,
  }
}

function validateOwner(owner) {
  assertExactFields(owner, ['role', 'namedPrivate'], 'operating_action_owner_invalid')
  const role = assertLine(owner.role, 80, 'operating_action_owner_role_invalid')
  if (owner.namedPrivate !== false) fail('operating_action_private_owner_identity_invalid')
  return { role, namedPrivate: false }
}

function validateAuthority(authority) {
  assertExactFields(authority, ['ownerApprovalRequired', 'externalWriteAllowed'], 'operating_action_authority_invalid')
  if (typeof authority.ownerApprovalRequired !== 'boolean') fail('operating_action_owner_approval_invalid')
  if (authority.externalWriteAllowed !== false) fail('operating_action_external_write_boundary_invalid')
  return {
    ownerApprovalRequired: authority.ownerApprovalRequired,
    externalWriteAllowed: false,
  }
}

function validateAcceptance(acceptance) {
  assertExactFields(acceptance, ['evidenceRequired', 'tests'], 'operating_action_acceptance_invalid')
  return {
    evidenceRequired: validateStringArray(acceptance.evidenceRequired, 1, 8, 'operating_action_acceptance_evidence_invalid'),
    tests: validateStringArray(acceptance.tests, 1, 8, 'operating_action_acceptance_tests_invalid'),
  }
}

function validateClosure(closure, status, openedAt, measured) {
  assertExactFields(closure, ['closedAt', 'closureNote', 'measuredResult'], 'operating_action_closure_invalid')
  if (status === 'closed') {
    const closedAt = assertTimestamp(closure.closedAt, 'operating_action_closed_at_invalid')
    return {
      closedAt,
      closureNote: assertLine(closure.closureNote, 240, 'operating_action_closure_note_invalid'),
      measuredResult: assertLine(closure.measuredResult, 240, 'operating_action_measured_result_invalid'),
      cycleTimeDays: daysBetween(openedAt, closedAt),
    }
  }
  if (closure.closedAt !== null || closure.closureNote !== null || closure.measuredResult !== null || measured !== false) {
    fail('operating_action_open_closure_invalid')
  }
  return { closedAt: null, closureNote: null, measuredResult: null, cycleTimeDays: null }
}

export function buildOperatingActionFromFinding(input) {
  assertExactFields(input, [
    'id',
    'openedAt',
    'productIds',
    'sourceFinding',
    'recommendation',
    'severity',
    'businessImpact',
    'ownerRole',
    'dueDate',
    'ownerApprovalRequired',
    'acceptance',
  ], 'operating_action_finding_input_invalid')
  if (typeof input.ownerApprovalRequired !== 'boolean') fail('operating_action_finding_owner_approval_invalid')

  return validateOperatingAction({
    id: input.id,
    openedAt: input.openedAt,
    productIds: input.productIds,
    sourceFinding: input.sourceFinding,
    recommendation: input.recommendation,
    severity: input.severity,
    businessImpact: input.businessImpact,
    owner: {
      role: input.ownerRole,
      namedPrivate: false,
    },
    dueDate: input.dueDate,
    status: input.ownerApprovalRequired ? 'owner-gated' : 'open',
    authority: {
      ownerApprovalRequired: input.ownerApprovalRequired,
      externalWriteAllowed: false,
    },
    acceptance: input.acceptance,
    closure: {
      closedAt: null,
      closureNote: null,
      measuredResult: null,
    },
  })
}

export function validateOperatingAction(action) {
  assertExactFields(action, ACTION_FIELDS, 'operating_action_fields_invalid')
  const id = assertLine(action.id, 80, 'operating_action_id_invalid')
  if (!ID_PATTERN.test(id)) fail('operating_action_id_invalid')
  const openedAt = assertTimestamp(action.openedAt, 'operating_action_opened_at_invalid')
  const productIds = validateProducts(action.productIds)
  const sourceFinding = validateSourceFinding(action.sourceFinding)
  const recommendation = assertLine(action.recommendation, 240, 'operating_action_recommendation_invalid')
  if (!SEVERITY_VALUES.has(action.severity)) fail('operating_action_severity_invalid')
  if (!STATUS_VALUES.has(action.status)) fail('operating_action_status_invalid')
  const businessImpact = validateBusinessImpact(action.businessImpact)
  const owner = validateOwner(action.owner)
  const dueDate = assertDate(action.dueDate, 'operating_action_due_date_invalid')
  const authority = validateAuthority(action.authority)
  const acceptance = validateAcceptance(action.acceptance)
  const closure = validateClosure(action.closure, action.status, openedAt, businessImpact.measured)

  if (action.severity === 'critical' && (!owner.role || !sourceFinding.evidenceRef)) {
    fail('operating_action_critical_unowned_or_unevidenced')
  }
  if (action.status === 'owner-gated' && authority.ownerApprovalRequired !== true) {
    fail('operating_action_owner_gate_invalid')
  }

  return {
    id,
    openedAt,
    productIds,
    sourceFinding,
    recommendation,
    severity: action.severity,
    businessImpact,
    owner,
    dueDate,
    status: action.status,
    authority,
    acceptance,
    closure: {
      closedAt: closure.closedAt,
      closureNote: closure.closureNote,
      measuredResult: closure.measuredResult,
    },
  }
}

export function buildOperatingActionBoardSummary(actions) {
  const closedCycleTimes = actions
    .filter((action) => action.status === 'closed')
    .map((action) => daysBetween(action.openedAt, action.closure.closedAt))
  return {
    totalActions: actions.length,
    openActionCount: actions.filter((action) => OPEN_STATUSES.has(action.status)).length,
    closedActionCount: actions.filter((action) => action.status === 'closed').length,
    ownerGatedCount: actions.filter((action) => action.status === 'owner-gated').length,
    criticalOpenCount: actions.filter((action) => action.severity === 'critical' && OPEN_STATUSES.has(action.status)).length,
    measuredResultCount: actions.filter((action) => action.status === 'closed' && action.businessImpact.measured === true).length,
    closedCycleTimeDaysMedian: median(closedCycleTimes),
  }
}

function validateControls(controls) {
  assertExactFields(controls, CONTROL_FIELDS, 'operating_action_board_controls_invalid')
  for (const field of CONTROL_FIELDS) {
    if (controls[field] !== false) fail('operating_action_board_controls_invalid')
  }
  return Object.fromEntries(CONTROL_FIELDS.map((field) => [field, false]))
}

function validateWeeklyReport(weeklyReport, actions) {
  assertExactFields(weeklyReport, [
    'totalActions',
    'openActionCount',
    'closedActionCount',
    'ownerGatedCount',
    'criticalOpenCount',
    'measuredResultCount',
    'closedCycleTimeDaysMedian',
  ], 'operating_action_board_weekly_report_invalid')
  const expected = buildOperatingActionBoardSummary(actions)
  if (stableStringify(weeklyReport) !== stableStringify(expected)) {
    fail('operating_action_board_weekly_report_stale')
  }
  return expected
}

export function validateOperatingActionBoard(board) {
  assertNoSecretShape(board)
  assertExactFields(board, ['contract', 'generatedAt', 'mode', 'products', 'controls', 'weeklyReport', 'actions'], 'operating_action_board_fields_invalid')
  if (board.contract !== OPERATING_ACTION_BOARD_CONTRACT) fail('operating_action_board_contract_invalid')
  if (board.mode !== OPERATING_ACTION_BOARD_MODE) fail('operating_action_board_mode_invalid')
  const generatedAt = assertTimestamp(board.generatedAt, 'operating_action_board_generated_at_invalid')
  if (!Array.isArray(board.products) || board.products.join(',') !== PRODUCT_IDS.join(',')) {
    fail('operating_action_board_product_set_invalid')
  }
  const controls = validateControls(board.controls)
  if (!Array.isArray(board.actions) || board.actions.length < 1 || board.actions.length > 40) {
    fail('operating_action_board_actions_invalid')
  }
  const actions = board.actions.map(validateOperatingAction)
  const actionIds = new Set()
  for (const action of actions) {
    if (actionIds.has(action.id)) fail('operating_action_board_duplicate_action')
    actionIds.add(action.id)
  }
  const weeklyReport = validateWeeklyReport(board.weeklyReport, actions)
  return {
    contract: OPERATING_ACTION_BOARD_CONTRACT,
    generatedAt,
    mode: OPERATING_ACTION_BOARD_MODE,
    products: [...PRODUCT_IDS],
    controls,
    weeklyReport,
    actions,
    digest: operatingActionBoardDigest({
      contract: OPERATING_ACTION_BOARD_CONTRACT,
      generatedAt,
      mode: OPERATING_ACTION_BOARD_MODE,
      products: [...PRODUCT_IDS],
      controls,
      weeklyReport,
      actions,
    }),
  }
}
