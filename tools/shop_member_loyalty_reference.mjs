import { createHmac, timingSafeEqual } from 'node:crypto'

export const SHOP_MEMBER_CARD_CONTRACT = 'supermega.shop.member-card.v1'
export const SHOP_LOYALTY_EVENT_CONTRACT = 'supermega.shop.loyalty-event.v1'
export const SHOP_LOYALTY_MAX_EVENT_COUNT = 100_000
export const SHOP_LOYALTY_MAX_EVENT_POINTS = 1_000_000_000

function fail(code) {
  throw new Error(code)
}

function text(value, pattern, code) {
  if (typeof value !== 'string' || !pattern.test(value)) fail(code)
  return value
}

function timestamp(value, code) {
  if (typeof value !== 'string' || new Date(value).toISOString() !== value) fail(code)
  return value
}

function positiveInteger(value, code) {
  if (!Number.isSafeInteger(value) || value < 1) fail(code)
  return value
}

function exactKeys(value, expected, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code)
  const actual = Object.keys(value).sort()
  if (actual.length !== expected.length
    || actual.some((key, index) => key !== expected[index])) fail(code)
}

function cardPayload(input) {
  exactKeys(input, [
    'cardRevision', 'contract', 'displayCode', 'expiresAt',
    'issuedAt', 'memberId', 'workspaceRef',
  ], 'member_card_payload_shape_invalid')
  const payload = {
    contract: input.contract,
    workspaceRef: text(input.workspaceRef, /^[a-f0-9]{64}$/, 'member_card_workspace_invalid'),
    memberId: text(input.memberId, /^mem_[a-f0-9]{32}$/, 'member_card_id_invalid'),
    cardRevision: positiveInteger(input.cardRevision, 'member_card_revision_invalid'),
    displayCode: text(input.displayCode, /^\d{6,20}$/, 'member_card_display_code_invalid'),
    issuedAt: timestamp(input.issuedAt, 'member_card_issued_at_invalid'),
    expiresAt: timestamp(input.expiresAt, 'member_card_expires_at_invalid'),
  }
  if (payload.contract !== SHOP_MEMBER_CARD_CONTRACT) fail('member_card_contract_invalid')
  if (payload.expiresAt <= payload.issuedAt) fail('member_card_expiry_invalid')
  return payload
}

function signatureFor(payloadBytes, key) {
  if (!(key instanceof Uint8Array) || key.byteLength < 32) fail('member_card_key_invalid')
  return createHmac('sha256', key).update(payloadBytes).digest()
}

export function buildShopMemberCard(input, signingKey) {
  const payload = cardPayload({ ...input, contract: SHOP_MEMBER_CARD_CONTRACT })
  const payloadBytes = Buffer.from(JSON.stringify(payload), 'utf8')
  const signature = signatureFor(payloadBytes, signingKey)
  return `SM1.${payloadBytes.toString('base64url')}.${signature.toString('base64url')}`
}

export function verifyShopMemberCard(token, {
  expectedWorkspaceRef,
  activeMember,
  verificationKey,
  now,
}) {
  if (typeof token !== 'string' || token.length > 1024) fail('member_card_token_invalid')
  const parts = token.split('.')
  if (parts.length !== 3 || parts[0] !== 'SM1') fail('member_card_token_invalid')
  let payloadBytes
  let suppliedSignature
  try {
    payloadBytes = Buffer.from(parts[1], 'base64url')
    suppliedSignature = Buffer.from(parts[2], 'base64url')
  } catch {
    fail('member_card_token_invalid')
  }
  if (payloadBytes.toString('base64url') !== parts[1]
    || suppliedSignature.toString('base64url') !== parts[2]) fail('member_card_token_invalid')
  const expectedSignature = signatureFor(payloadBytes, verificationKey)
  if (suppliedSignature.length !== expectedSignature.length
    || !timingSafeEqual(suppliedSignature, expectedSignature)) fail('member_card_signature_invalid')
  let decoded
  try {
    decoded = JSON.parse(payloadBytes.toString('utf8'))
  } catch {
    fail('member_card_payload_invalid')
  }
  const payload = cardPayload(decoded)
  if (!payloadBytes.equals(Buffer.from(JSON.stringify(payload), 'utf8'))) fail('member_card_payload_noncanonical')
  if (payload.workspaceRef !== expectedWorkspaceRef) fail('member_card_workspace_mismatch')
  if (!activeMember || activeMember.status !== 'active') fail('member_card_member_inactive')
  if (payload.memberId !== activeMember.memberId) fail('member_card_member_mismatch')
  if (activeMember.workspaceRef !== expectedWorkspaceRef) fail('member_card_member_workspace_mismatch')
  if (payload.cardRevision !== activeMember.cardRevision) fail('member_card_revision_stale')
  if (payload.displayCode !== activeMember.displayCode) fail('member_card_display_code_mismatch')
  const observedAt = timestamp(now, 'member_card_observed_at_invalid')
  if (observedAt < payload.issuedAt) fail('member_card_not_yet_valid')
  if (observedAt >= payload.expiresAt) fail('member_card_expired')
  return payload
}

function loyaltyEvent(event) {
  exactKeys(event, [
    'contract', 'createdAt', 'kind', 'memberId', 'operationId', 'points',
    'reversalOperationId', 'saleOperationId', 'sequence',
    'sourceEarnOperationId', 'workspaceRef',
  ], 'loyalty_event_shape_invalid')
  const value = {
    contract: event.contract,
    workspaceRef: text(event.workspaceRef, /^[a-f0-9]{64}$/, 'loyalty_workspace_invalid'),
    memberId: text(event.memberId, /^mem_[a-f0-9]{32}$/, 'loyalty_member_invalid'),
    sequence: positiveInteger(event.sequence, 'loyalty_sequence_invalid'),
    operationId: text(event.operationId, /^[a-z][a-z0-9:_-]{7,119}$/, 'loyalty_operation_invalid'),
    kind: text(event.kind, /^(?:earn|redeem|clawback)$/, 'loyalty_kind_invalid'),
    points: positiveInteger(event.points, 'loyalty_points_invalid'),
    createdAt: timestamp(event.createdAt, 'loyalty_created_at_invalid'),
    saleOperationId: event.saleOperationId,
    reversalOperationId: event.reversalOperationId,
    sourceEarnOperationId: event.sourceEarnOperationId,
  }
  if (value.points > SHOP_LOYALTY_MAX_EVENT_POINTS) fail('loyalty_points_limit_exceeded')
  if (value.contract !== SHOP_LOYALTY_EVENT_CONTRACT) fail('loyalty_contract_invalid')
  if (value.kind === 'earn') {
    text(value.saleOperationId, /^[a-z][a-z0-9:_-]{7,119}$/, 'loyalty_sale_operation_invalid')
    if (value.reversalOperationId !== null || value.sourceEarnOperationId !== null) fail('loyalty_earn_shape_invalid')
  } else if (value.kind === 'redeem') {
    text(value.saleOperationId, /^[a-z][a-z0-9:_-]{7,119}$/, 'loyalty_sale_operation_invalid')
    if (value.reversalOperationId !== null || value.sourceEarnOperationId !== null) fail('loyalty_redeem_shape_invalid')
  } else {
    text(value.reversalOperationId, /^[a-z][a-z0-9:_-]{7,119}$/, 'loyalty_reversal_operation_invalid')
    text(value.sourceEarnOperationId, /^[a-z][a-z0-9:_-]{7,119}$/, 'loyalty_source_earn_invalid')
    if (value.saleOperationId !== null) fail('loyalty_clawback_shape_invalid')
  }
  return value
}

export function projectShopLoyaltyLedger({ workspaceRef, memberId, mode, events }) {
  text(workspaceRef, /^[a-f0-9]{64}$/, 'loyalty_workspace_invalid')
  text(memberId, /^mem_[a-f0-9]{32}$/, 'loyalty_member_invalid')
  if (!['single_writer_offline', 'coordinated_online'].includes(mode)) fail('loyalty_mode_invalid')
  if (!Array.isArray(events)) fail('loyalty_events_invalid')
  if (events.length > SHOP_LOYALTY_MAX_EVENT_COUNT) fail('loyalty_event_count_exceeded')
  const normalized = events.map(loyaltyEvent)
  const operations = new Set()
  const earnedSales = new Set()
  const earns = new Map()
  const clawedBackEarns = new Set()
  const reversalOperations = new Set()
  let balance = 0
  let previousCreatedAt = null
  for (let index = 0; index < normalized.length; index += 1) {
    const event = normalized[index]
    if (event.sequence !== index + 1) fail('loyalty_sequence_gap')
    if (previousCreatedAt && event.createdAt < previousCreatedAt) fail('loyalty_event_backdated')
    previousCreatedAt = event.createdAt
    if (event.workspaceRef !== workspaceRef) fail('loyalty_workspace_mismatch')
    if (event.memberId !== memberId) fail('loyalty_member_mismatch')
    if (operations.has(event.operationId)) fail('loyalty_operation_reused')
    operations.add(event.operationId)
    if (event.kind === 'earn') {
      if (earnedSales.has(event.saleOperationId)) fail('loyalty_sale_earned_twice')
      earnedSales.add(event.saleOperationId)
      earns.set(event.operationId, event)
      balance += event.points
    } else if (event.kind === 'redeem') {
      if (mode !== 'single_writer_offline') fail('loyalty_redemption_coordination_required')
      if (event.points > Math.max(balance, 0)) fail('loyalty_redemption_exceeds_balance')
      balance -= event.points
    } else {
      const source = earns.get(event.sourceEarnOperationId)
      if (!source || source.points !== event.points) fail('loyalty_clawback_source_invalid')
      if (clawedBackEarns.has(source.operationId)) fail('loyalty_clawback_reused')
      if (reversalOperations.has(event.reversalOperationId)) fail('loyalty_reversal_reused')
      clawedBackEarns.add(source.operationId)
      reversalOperations.add(event.reversalOperationId)
      balance -= event.points
    }
    if (!Number.isSafeInteger(balance)) fail('loyalty_balance_unsafe')
  }
  return {
    contract: 'supermega.shop.loyalty-projection.v1',
    workspaceRef,
    memberId,
    mode,
    balance,
    redemptionAllowed: mode === 'single_writer_offline' && balance > 0,
    eventCount: normalized.length,
    events: normalized,
  }
}

export function appendShopLoyaltyEvent({ workspaceRef, memberId, mode, events, event }) {
  if (!Array.isArray(events)) fail('loyalty_events_invalid')
  const normalizedEvent = loyaltyEvent(event)
  const existing = events.find((candidate) => candidate?.operationId === normalizedEvent.operationId)
  if (existing) {
    const normalizedExisting = loyaltyEvent(existing)
    if (JSON.stringify(normalizedExisting) !== JSON.stringify(normalizedEvent)) fail('loyalty_operation_conflict')
    projectShopLoyaltyLedger({ workspaceRef, memberId, mode, events })
    return { appended: false, events: [...events], event: normalizedExisting }
  }
  const next = [...events, normalizedEvent]
  projectShopLoyaltyLedger({ workspaceRef, memberId, mode, events: next })
  return { appended: true, events: next, event: normalizedEvent }
}
