#!/usr/bin/env node

import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import {
  OPERATING_ACTION_BOARD_CONTRACT,
  OPERATING_ACTION_BOARD_MODE,
  buildOperatingActionBoardSummary,
  validateOperatingActionBoard,
} from '../kernel/operating-action-board.mjs'

const root = resolve(import.meta.dirname, '..')
const DEFAULT_BOARD = resolve(root, 'hq', 'operating-action-board.json')

function parseArgs(argv) {
  const args = { file: DEFAULT_BOARD, selfTest: false }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--file') {
      args.file = resolve(argv[++index] || '')
    } else if (arg === '--self-test') {
      args.selfTest = true
    } else {
      throw new Error(`unknown_arg:${arg}`)
    }
  }
  return args
}

const digest = (char) => `sha256:${char.repeat(64)}`

function sampleAction(overrides = {}) {
  return {
    id: 'release-main-protection',
    openedAt: '2026-08-25T00:00:00.000Z',
    productIds: ['shop', 'plant', 'website', 'ecommerce'],
    sourceFinding: {
      sourceType: 'release_gate',
      label: 'GitHub main protection not verified',
      evidenceRef: 'tools/collect_github_main_protection_snapshot.mjs plus hq/readiness/github-main-protection-proposal.json',
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
      evidenceRequired: ['Fresh verified main protection snapshot with required checks present'],
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

function sampleBoard(overrides = {}) {
  const actions = overrides.actions || [sampleAction()]
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
    weeklyReport: buildOperatingActionBoardSummary(actions),
    actions,
    ...overrides,
  }
}

function runSelfTest() {
  validateOperatingActionBoard(sampleBoard())
  try {
    validateOperatingActionBoard(sampleBoard({
      controls: { ...sampleBoard().controls, githubWritesPerformed: true },
    }))
  } catch (error) {
    if (String(error?.message || '') !== 'operating_action_board_controls_invalid') throw error
    return {
      ok: true,
      contract: OPERATING_ACTION_BOARD_CONTRACT,
      mode: 'self-test',
      cases: 2,
    }
  }
  throw new Error('operating_action_board_self_test_failed')
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.selfTest) {
    console.log(JSON.stringify(runSelfTest()))
    return
  }
  const text = await readFile(args.file, 'utf8')
  const parsed = JSON.parse(text)
  const board = validateOperatingActionBoard(parsed)
  console.log(JSON.stringify({
    ok: true,
    contract: board.contract,
    path: args.file,
    digest: board.digest,
    actionCount: board.weeklyReport.totalActions,
    openActionCount: board.weeklyReport.openActionCount,
    ownerGatedCount: board.weeklyReport.ownerGatedCount,
    criticalOpenCount: board.weeklyReport.criticalOpenCount,
    controls: board.controls,
  }))
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    contract: OPERATING_ACTION_BOARD_CONTRACT,
    error: String(error?.message || error),
  }))
  process.exit(1)
})
