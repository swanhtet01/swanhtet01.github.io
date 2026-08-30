import assert from 'node:assert/strict'
import test from 'node:test'

import {
  OPERATING_ACTION_BOARD_CONTRACT,
  OPERATING_ACTION_BOARD_MODE,
  buildOperatingActionFromFinding,
  buildOperatingActionBoardSummary,
  validateOperatingActionBoard,
} from './operating-action-board.mjs'

const digest = (char) => `sha256:${char.repeat(64)}`

function action(overrides = {}) {
  return {
    id: 'release-main-protection',
    openedAt: '2026-08-25T00:00:00.000Z',
    productIds: ['shop', 'plant', 'website', 'ecommerce'],
    sourceFinding: {
      sourceType: 'release_gate',
      label: 'GitHub main protection not verified',
      evidenceRef: 'supermega.github-main-protection-snapshot.v62.generated-20260825.json',
      evidenceDigest: digest('a'),
    },
    recommendation: 'Protect GitHub main before branch push, pull request, release, or pilot activation.',
    severity: 'critical',
    businessImpact: {
      kind: 'release_risk',
      estimateLabel: 'Unprotected main can invalidate owner-gated release authority.',
      measured: false,
    },
    owner: {
      role: 'Founder plus Engineering',
      namedPrivate: false,
    },
    dueDate: '2026-08-25',
    status: 'owner-gated',
    authority: {
      ownerApprovalRequired: true,
      externalWriteAllowed: false,
    },
    acceptance: {
      evidenceRequired: ['Verified main protection snapshot with required checks present'],
      tests: ['npm run hq:verify'],
    },
    closure: {
      closedAt: null,
      closureNote: null,
      measuredResult: null,
    },
    ...overrides,
  }
}

function board(overrides = {}) {
  const actions = overrides.actions || [
    action(),
    action({
      id: 'shop-owner-pilot-baseline',
      productIds: ['shop'],
      sourceFinding: {
        sourceType: 'pilot_observation',
        label: 'Shop pilot requires observed baseline before acceptance evidence',
        evidenceRef: 'docs/pilot-kit/baseline-measurement.md',
        evidenceDigest: digest('b'),
      },
      recommendation: 'Capture the owner-observed Shop baseline before day one of the five-day pilot.',
      severity: 'high',
      businessImpact: {
        kind: 'pilot_readiness',
        estimateLabel: 'Prevents sample data from being mistaken for commercial proof.',
        measured: false,
      },
      owner: { role: 'Founder plus Product', namedPrivate: false },
      dueDate: '2026-08-26',
      status: 'owner-gated',
    }),
    action({
      id: 'plant-data-trust-source-map',
      productIds: ['plant'],
      sourceFinding: {
        sourceType: 'audit_document',
        label: 'Plant source variability can distort OEE and quality interpretation',
        evidenceRef: 'supermega.audit-to-product-workorder.v1.generated-20260825.md',
        evidenceDigest: digest('c'),
      },
      recommendation: 'Lock source mapping rules before treating Plant recommendations as operating evidence.',
      severity: 'high',
      businessImpact: {
        kind: 'trust',
        estimateLabel: 'Improves confidence in quality and OEE action selection.',
        measured: false,
      },
      owner: { role: 'Engineering plus Product', namedPrivate: false },
      dueDate: '2026-08-30',
      status: 'proposed',
      authority: { ownerApprovalRequired: false, externalWriteAllowed: false },
    }),
  ]
  const weeklyReport = overrides.weeklyReport || buildOperatingActionBoardSummary(actions)
  return {
    contract: OPERATING_ACTION_BOARD_CONTRACT,
    generatedAt: '2026-08-25T00:00:00.000Z',
    mode: OPERATING_ACTION_BOARD_MODE,
    products: ['shop', 'plant', 'website', 'ecommerce'],
    controls: {
      externalWritesPerformed: false,
      gitRemoteWritesPerformed: false,
      githubWritesPerformed: false,
      vercelDeploymentsPerformed: false,
      supabaseMutationsPerformed: false,
      credentialValuesInspected: false,
      customerContactPerformed: false,
      paymentOrStockActionPerformed: false,
      managedActivationPerformed: false,
      privateIdentityExposed: false,
    },
    weeklyReport,
    actions,
    ...overrides,
  }
}

test('validates the shared operating action loop for Shop and Plant readiness', () => {
  const validated = validateOperatingActionBoard(board())
  assert.equal(validated.contract, OPERATING_ACTION_BOARD_CONTRACT)
  assert.equal(validated.mode, OPERATING_ACTION_BOARD_MODE)
  assert.equal(validated.weeklyReport.totalActions, 3)
  assert.equal(validated.weeklyReport.openActionCount, 3)
  assert.equal(validated.weeklyReport.ownerGatedCount, 2)
  assert.equal(validated.weeklyReport.criticalOpenCount, 1)
  assert.match(validated.digest, /^sha256:[a-f0-9]{64}$/)
})

test('builds one owned operating action from an audit finding', () => {
  const ownedInput = {
    id: 'shop-plant-owned-action-loop',
    openedAt: '2026-08-25T00:00:00.000Z',
    productIds: ['shop', 'plant'],
    sourceFinding: {
      sourceType: 'audit_document',
      label: 'Audits show analytics value but weak execution discipline',
      evidenceRef: 'supermega.audit-to-product-workorder.v1.generated-20260825.md',
      evidenceDigest: digest('d'),
    },
    recommendation: 'Make recommendations become owned actions with due dates, acceptance evidence, and measured results.',
    severity: 'high',
    businessImpact: {
      kind: 'trust',
      estimateLabel: 'Converts dashboards into accountable operating behavior.',
      measured: false,
    },
    ownerRole: 'Engineering plus Product',
    dueDate: '2026-08-27',
    ownerApprovalRequired: false,
    acceptance: {
      evidenceRequired: ['Action model validates source finding, owner, due date, acceptance, and closure result'],
      tests: ['npm run operating:action-board:self-test'],
    },
  }
  const owned = buildOperatingActionFromFinding(ownedInput)

  assert.equal(owned.id, 'shop-plant-owned-action-loop')
  assert.deepEqual(owned.productIds, ['shop', 'plant'])
  assert.equal(owned.status, 'open')
  assert.equal(owned.owner.role, 'Engineering plus Product')
  assert.equal(owned.owner.namedPrivate, false)
  assert.equal(owned.authority.externalWriteAllowed, false)
  assert.equal(owned.closure.closedAt, null)

  const gated = buildOperatingActionFromFinding({
    ...ownedInput,
    ownerApprovalRequired: true,
  })
  assert.equal(gated.status, 'owner-gated')
  assert.equal(gated.authority.ownerApprovalRequired, true)

  assert.throws(() => buildOperatingActionFromFinding({
    ...ownedInput,
    ownerRole: '',
  }), /operating_action_owner_role_invalid/)
  assert.throws(() => buildOperatingActionFromFinding({
    ...ownedInput,
    sourceFinding: { ...ownedInput.sourceFinding, evidenceRef: '' },
  }), /operating_action_source_ref_invalid/)
  assert.throws(() => buildOperatingActionFromFinding({
    ...ownedInput,
    authority: { externalWriteAllowed: true },
  }), /operating_action_finding_input_invalid/)
})

test('fails closed when an action lacks source evidence, owner, due date, or exact weekly summary', () => {
  assert.throws(() => validateOperatingActionBoard(board({
    actions: [action({ sourceFinding: { ...action().sourceFinding, evidenceRef: '' } })],
    weeklyReport: { ...buildOperatingActionBoardSummary([action()]) },
  })), /operating_action_source_ref_invalid/)
  assert.throws(() => validateOperatingActionBoard(board({
    actions: [action({ owner: { role: '', namedPrivate: false } })],
    weeklyReport: { ...buildOperatingActionBoardSummary([action()]) },
  })), /operating_action_owner_role_invalid/)
  assert.throws(() => validateOperatingActionBoard(board({
    actions: [action({ dueDate: 'soon' })],
    weeklyReport: { ...buildOperatingActionBoardSummary([action()]) },
  })), /operating_action_due_date_invalid/)
  assert.throws(() => validateOperatingActionBoard(board({
    weeklyReport: { ...buildOperatingActionBoardSummary(board().actions), openActionCount: 0 },
  })), /operating_action_board_weekly_report_stale/)
})

test('requires exact UTC calendar dates while preserving leap days and year boundaries', () => {
  const withDueDate = (dueDate) => {
    const candidate = action({ dueDate })
    return board({
      actions: [candidate],
      weeklyReport: buildOperatingActionBoardSummary([candidate]),
    })
  }
  for (const impossible of [
    '2026-02-29',
    '2026-02-30',
    '2026-02-31',
    '2026-04-31',
    '2026-00-10',
    '2026-13-01',
    '2026-01-00',
    '2026-01-32',
  ]) {
    assert.throws(() => validateOperatingActionBoard(withDueDate(impossible)), /operating_action_due_date_invalid/, impossible)
  }
  for (const valid of ['2024-02-29', '2026-12-31', '2027-01-01']) {
    assert.equal(validateOperatingActionBoard(withDueDate(valid)).actions[0].dueDate, valid)
  }
})

test('rejects private identity, external effects, fifth-product AI, and credential-shaped text', () => {
  assert.throws(() => validateOperatingActionBoard(board({
    actions: [action({ owner: { role: 'Named customer owner', namedPrivate: true } })],
    weeklyReport: buildOperatingActionBoardSummary([action({ owner: { role: 'Named customer owner', namedPrivate: true } })]),
  })), /operating_action_private_owner_identity_invalid/)
  assert.throws(() => validateOperatingActionBoard(board({
    controls: { ...board().controls, supabaseMutationsPerformed: true },
  })), /operating_action_board_controls_invalid/)
  assert.throws(() => validateOperatingActionBoard(board({
    products: ['shop', 'plant', 'website', 'ecommerce', 'ai'],
  })), /operating_action_board_product_set_invalid/)
  assert.throws(() => validateOperatingActionBoard(board({
    actions: [action({ recommendation: 'Use ghp_123456789012345678901234567890123456' })],
    weeklyReport: buildOperatingActionBoardSummary([action({ recommendation: 'Use ghp_123456789012345678901234567890123456' })]),
  })), /operating_action_board_secret_shape/)
})

test('requires closed actions to include measured result and derives cycle time', () => {
  const closed = action({
    id: 'closed-shop-action',
    openedAt: '2026-08-25T00:00:00.000Z',
    productIds: ['shop'],
    status: 'closed',
    severity: 'medium',
    businessImpact: {
      kind: 'time',
      estimateLabel: 'Reduced close review time.',
      measured: true,
    },
    authority: { ownerApprovalRequired: false, externalWriteAllowed: false },
    closure: {
      closedAt: '2026-08-27T12:00:00.000Z',
      closureNote: 'Accepted after operator review.',
      measuredResult: 'Median close review time improved in the measured sample.',
    },
  })
  const validated = validateOperatingActionBoard(board({
    actions: [closed],
    weeklyReport: buildOperatingActionBoardSummary([closed]),
  }))
  assert.equal(validated.weeklyReport.closedActionCount, 1)
  assert.equal(validated.weeklyReport.measuredResultCount, 1)
  assert.equal(validated.weeklyReport.closedCycleTimeDaysMedian, 2.5)
  assert.throws(() => validateOperatingActionBoard(board({
    actions: [action({ status: 'closed' })],
    weeklyReport: {
      totalActions: 1,
      openActionCount: 0,
      closedActionCount: 1,
      ownerGatedCount: 0,
      criticalOpenCount: 0,
      measuredResultCount: 0,
      closedCycleTimeDaysMedian: null,
    },
  })), /operating_action_closed_at_invalid/)
})
