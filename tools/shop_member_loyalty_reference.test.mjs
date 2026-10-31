import assert from 'node:assert/strict'
import { createHash, createHmac } from 'node:crypto'
import test from 'node:test'

import {
  SHOP_LOYALTY_EVENT_CONTRACT,
  SHOP_LOYALTY_MAX_EVENT_POINTS,
  appendShopLoyaltyEvent,
  buildShopMemberCard,
  projectShopLoyaltyLedger,
  verifyShopMemberCard,
} from './shop_member_loyalty_reference.mjs'

const key = Buffer.alloc(32, 7)
const workspaceRef = createHash('sha256').update('workspace-synthetic-a').digest('hex')
const otherWorkspaceRef = createHash('sha256').update('workspace-synthetic-b').digest('hex')
const memberId = `mem_${'1'.repeat(32)}`
const activeMember = { workspaceRef, memberId, cardRevision: 3, displayCode: '00001234', status: 'active' }
const cardInput = {
  workspaceRef,
  memberId,
  cardRevision: 3,
  displayCode: '00001234',
  issuedAt: '2026-10-24T00:00:00.000Z',
  expiresAt: '2027-10-24T00:00:00.000Z',
}

test('member card is deterministic, non-PII, leading-zero safe, and workspace bound', () => {
  const card = buildShopMemberCard(cardInput, key)
  assert.equal(card, buildShopMemberCard(cardInput, key))
  const decoded = JSON.parse(Buffer.from(card.split('.')[1], 'base64url').toString('utf8'))
  assert.deepEqual(Object.keys(decoded).sort(), [
    'cardRevision', 'contract', 'displayCode', 'expiresAt',
    'issuedAt', 'memberId', 'workspaceRef',
  ])
  assert.doesNotMatch(JSON.stringify(decoded), /name|phone|email/)
  const verified = verifyShopMemberCard(card, {
    expectedWorkspaceRef: workspaceRef,
    activeMember,
    verificationKey: key,
    now: '2026-10-24T00:00:01.000Z',
  })
  assert.equal(verified.displayCode, '00001234')
  assert.throws(() => verifyShopMemberCard(card, {
    expectedWorkspaceRef: otherWorkspaceRef,
    activeMember,
    verificationKey: key,
    now: '2026-10-24T00:00:01.000Z',
  }), /member_card_workspace_mismatch/)
})

test('member card rejects tamper, wrong key, stale revision, inactive member, and expiry', () => {
  const card = buildShopMemberCard(cardInput, key)
  const [prefix, payload, signature] = card.split('.')
  const tampered = `${prefix}.${payload.slice(0, -1)}A.${signature}`
  for (const [token, options, code] of [
    [tampered, { activeMember, verificationKey: key, now: '2026-10-24T00:00:01.000Z' }, 'member_card_signature_invalid'],
    [card, { activeMember, verificationKey: Buffer.alloc(32, 8), now: '2026-10-24T00:00:01.000Z' }, 'member_card_signature_invalid'],
    [card, { activeMember: { ...activeMember, cardRevision: 4 }, verificationKey: key, now: '2026-10-24T00:00:01.000Z' }, 'member_card_revision_stale'],
    [card, { activeMember: { ...activeMember, status: 'revoked' }, verificationKey: key, now: '2026-10-24T00:00:01.000Z' }, 'member_card_member_inactive'],
    [card, { activeMember: { ...activeMember, workspaceRef: otherWorkspaceRef }, verificationKey: key, now: '2026-10-24T00:00:01.000Z' }, 'member_card_member_workspace_mismatch'],
    [card, { activeMember, verificationKey: key, now: '2026-10-23T23:59:59.999Z' }, 'member_card_not_yet_valid'],
    [card, { activeMember, verificationKey: key, now: '2027-10-24T00:00:00.000Z' }, 'member_card_expired'],
  ]) assert.throws(() => verifyShopMemberCard(token, { expectedWorkspaceRef: workspaceRef, ...options }), new RegExp(code))
})

test('member card rejects a signed wrong contract and non-canonical encoding', () => {
  const wrongContractPayload = Buffer.from(JSON.stringify({
    contract: 'supermega.shop.member-card.v0',
    ...cardInput,
  }), 'utf8')
  const signature = createHmac('sha256', key).update(wrongContractPayload).digest('base64url')
  const wrongContract = `SM1.${wrongContractPayload.toString('base64url')}.${signature}`
  assert.throws(() => verifyShopMemberCard(wrongContract, {
    expectedWorkspaceRef: workspaceRef,
    activeMember,
    verificationKey: key,
    now: '2026-10-24T00:00:01.000Z',
  }), /member_card_contract_invalid/)

  const card = buildShopMemberCard(cardInput, key)
  const [prefix, payload, canonicalSignature] = card.split('.')
  assert.throws(() => verifyShopMemberCard(`${prefix}.${payload}=.${canonicalSignature}`, {
    expectedWorkspaceRef: workspaceRef,
    activeMember,
    verificationKey: key,
    now: '2026-10-24T00:00:01.000Z',
  }), /member_card_token_invalid/)

  const extraFieldPayload = Buffer.from(JSON.stringify({
    contract: 'supermega.shop.member-card.v1',
    ...cardInput,
    customerName: 'Synthetic Person',
  }), 'utf8')
  const extraFieldSignature = createHmac('sha256', key).update(extraFieldPayload).digest('base64url')
  assert.throws(() => verifyShopMemberCard(
    `SM1.${extraFieldPayload.toString('base64url')}.${extraFieldSignature}`,
    {
      expectedWorkspaceRef: workspaceRef,
      activeMember,
      verificationKey: key,
      now: '2026-10-24T00:00:01.000Z',
    },
  ), /member_card_payload_shape_invalid/)
})

function event(sequence, kind, points, extra = {}) {
  return {
    contract: SHOP_LOYALTY_EVENT_CONTRACT,
    workspaceRef,
    memberId,
    sequence,
    operationId: `loyalty:${kind}:${sequence}`,
    kind,
    points,
    createdAt: `2026-10-24T00:00:0${sequence}.000Z`,
    saleOperationId: null,
    reversalOperationId: null,
    sourceEarnOperationId: null,
    ...extra,
  }
}

test('ledger earns, redeems, and claws back a full-sale earning exactly once', () => {
  const events = [
    event(1, 'earn', 100, { saleOperationId: 'sale:operation:0001' }),
    event(2, 'redeem', 40, { saleOperationId: 'sale:operation:0002' }),
    event(3, 'clawback', 100, {
      reversalOperationId: 'reversal:operation:0001',
      sourceEarnOperationId: 'loyalty:earn:1',
    }),
  ]
  const projection = projectShopLoyaltyLedger({ workspaceRef, memberId, mode: 'single_writer_offline', events })
  assert.equal(projection.balance, -40)
  assert.equal(projection.redemptionAllowed, false)
  assert.deepEqual(JSON.parse(JSON.stringify(projection.events)), projection.events)
})

test('ledger rejects replay, double earn, double clawback, overspend, foreign scope, and gaps', () => {
  const earn = event(1, 'earn', 100, { saleOperationId: 'sale:operation:0001' })
  for (const [events, code] of [
    [[earn, { ...earn, sequence: 2 }], 'loyalty_operation_reused'],
    [[earn, event(2, 'earn', 20, { saleOperationId: 'sale:operation:0001' })], 'loyalty_sale_earned_twice'],
    [[earn, event(2, 'redeem', 101, { saleOperationId: 'sale:operation:0002' })], 'loyalty_redemption_exceeds_balance'],
    [[{ ...earn, workspaceRef: otherWorkspaceRef }], 'loyalty_workspace_mismatch'],
    [[{ ...earn, sequence: 2 }], 'loyalty_sequence_gap'],
    [[earn,
      event(2, 'clawback', 100, { reversalOperationId: 'reversal:operation:0001', sourceEarnOperationId: 'loyalty:earn:1' }),
      event(3, 'clawback', 100, { reversalOperationId: 'reversal:operation:0002', sourceEarnOperationId: 'loyalty:earn:1' })], 'loyalty_clawback_reused'],
  ]) assert.throws(() => projectShopLoyaltyLedger({ workspaceRef, memberId, mode: 'single_writer_offline', events }), new RegExp(code))
})

test('multi-writer redemption remains fail closed until coordination exists', () => {
  const events = [
    event(1, 'earn', 100, { saleOperationId: 'sale:operation:0001' }),
    event(2, 'redeem', 20, { saleOperationId: 'sale:operation:0002' }),
  ]
  assert.throws(() => projectShopLoyaltyLedger({
    workspaceRef,
    memberId,
    mode: 'coordinated_online',
    events,
  }), /loyalty_redemption_coordination_required/)
})

test('ledger preserves append order and round-trips its non-secret JSON projection', () => {
  const events = [
    event(1, 'earn', 25, { saleOperationId: 'sale:operation:0001' }),
    event(2, 'redeem', 5, { saleOperationId: 'sale:operation:0002' }),
  ]
  const projection = projectShopLoyaltyLedger({ workspaceRef, memberId, mode: 'single_writer_offline', events })
  const restored = JSON.parse(JSON.stringify(projection))
  assert.deepEqual(projectShopLoyaltyLedger({
    workspaceRef: restored.workspaceRef,
    memberId: restored.memberId,
    mode: restored.mode,
    events: restored.events,
  }), projection)
  assert.throws(() => projectShopLoyaltyLedger({
    workspaceRef,
    memberId,
    mode: 'single_writer_offline',
    events: [...events].reverse(),
  }), /loyalty_sequence_gap/)
  assert.doesNotMatch(JSON.stringify(projection), /customerName|phone|email|signingKey/)
  assert.throws(() => projectShopLoyaltyLedger({
    workspaceRef: otherWorkspaceRef,
    memberId: restored.memberId,
    mode: restored.mode,
    events: restored.events,
  }), /loyalty_workspace_mismatch/)
})

test('ledger rejects reused reversals, backdated appends, and unsafe arithmetic', () => {
  const firstEarn = event(1, 'earn', 10, { saleOperationId: 'sale:operation:0001' })
  const secondEarn = event(2, 'earn', 10, { saleOperationId: 'sale:operation:0002' })
  const firstClawback = event(3, 'clawback', 10, {
    reversalOperationId: 'reversal:shared:0001',
    sourceEarnOperationId: 'loyalty:earn:1',
  })
  const secondClawback = event(4, 'clawback', 10, {
    reversalOperationId: 'reversal:shared:0001',
    sourceEarnOperationId: 'loyalty:earn:2',
  })
  assert.throws(() => projectShopLoyaltyLedger({
    workspaceRef, memberId, mode: 'single_writer_offline',
    events: [firstEarn, secondEarn, firstClawback, secondClawback],
  }), /loyalty_reversal_reused/)
  assert.throws(() => projectShopLoyaltyLedger({
    workspaceRef, memberId, mode: 'single_writer_offline',
    events: [firstEarn, { ...secondEarn, createdAt: '2026-10-23T23:59:59.000Z' }],
  }), /loyalty_event_backdated/)
  assert.throws(() => projectShopLoyaltyLedger({
    workspaceRef, memberId, mode: 'single_writer_offline',
    events: [event(1, 'earn', SHOP_LOYALTY_MAX_EVENT_POINTS + 1, { saleOperationId: 'sale:operation:0001' })],
  }), /loyalty_points_limit_exceeded/)
})

test('append boundary returns exact retries and rejects changed operation reuse', () => {
  const earn = event(1, 'earn', 10, { saleOperationId: 'sale:operation:0001' })
  const first = appendShopLoyaltyEvent({
    workspaceRef, memberId, mode: 'single_writer_offline', events: [], event: earn,
  })
  assert.equal(first.appended, true)
  const retry = appendShopLoyaltyEvent({
    workspaceRef, memberId, mode: 'single_writer_offline', events: first.events, event: earn,
  })
  assert.equal(retry.appended, false)
  assert.deepEqual(retry.events, first.events)
  assert.throws(() => appendShopLoyaltyEvent({
    workspaceRef,
    memberId,
    mode: 'single_writer_offline',
    events: first.events,
    event: { ...earn, points: 11 },
  }), /loyalty_operation_conflict/)
})

test('event shape rejects every non-null or missing unused reference', () => {
  const baseEarn = event(1, 'earn', 10, { saleOperationId: 'sale:operation:0001' })
  const baseRedeem = event(1, 'redeem', 10, { saleOperationId: 'sale:operation:0001' })
  const baseClawback = event(1, 'clawback', 10, {
    reversalOperationId: 'reversal:operation:0001',
    sourceEarnOperationId: 'loyalty:earn:1',
  })
  for (const [candidate, code] of [
    [{ ...baseEarn, reversalOperationId: false }, 'loyalty_earn_shape_invalid'],
    [{ ...baseEarn, sourceEarnOperationId: 0 }, 'loyalty_earn_shape_invalid'],
    [{ ...baseRedeem, reversalOperationId: '' }, 'loyalty_redeem_shape_invalid'],
    [{ ...baseClawback, saleOperationId: false }, 'loyalty_clawback_shape_invalid'],
    [{ ...baseEarn, reversalOperationId: undefined }, 'loyalty_earn_shape_invalid'],
  ]) assert.throws(() => projectShopLoyaltyLedger({
    workspaceRef,
    memberId,
    mode: 'single_writer_offline',
    events: [candidate],
  }), new RegExp(code))
})
