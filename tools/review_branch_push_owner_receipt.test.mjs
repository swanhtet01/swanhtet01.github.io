import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  REVIEW_BRANCH_PUSH_OWNER_RECEIPT_CONTRACT,
  REVIEW_BRANCH_PUSH_OWNER_RECEIPT_TTL_MS,
  buildReviewBranchPushOwnerReceipt,
  confirmReviewBranchPushOwnerClick,
  consumeReviewBranchPushOwnerReceipt,
  readReviewBranchPushOwnerReceipt,
  renderReviewBranchPushOwnerConfirmation,
  requestReviewBranchPushOwnerReceipt,
  reviewBranchPushOwnerReceiptDigest,
  validateReviewBranchPushOwnerReceipt,
} from './review_branch_push_owner_receipt.mjs'

const commit = 'a'.repeat(40)
const remoteCommit = 'b'.repeat(40)
const branch = 'codex/release-stack-integration-rehearsal-20260825'
const confirmedAt = new Date('2026-08-28T03:00:00.000Z')
const nonce = 'c'.repeat(64)
const executionChallenge = 'f'.repeat(64)

function context(overrides = {}) {
  const gate = {
    branch,
    commit,
    remoteCommit,
    pushKind: 'fast_forward_branch_push',
    approvalTemplate: `I approve one normal fast-forward-only push of ${commit} to origin/${branch} for review only. I do not approve merge, workflow dispatch, deployment, domain, environment, database, credential, payment, message, customer contact, stock, or production changes.`,
    ...(overrides.gate || {}),
  }
  const handoffReceipt = {
    path: 'C:\\private\\release-handoff.json',
    digest: `sha256:${'1'.repeat(64)}`,
    packet: {
      digest: `sha256:${'2'.repeat(64)}`,
      repository: 'swanhtet01/swanhtet01.github.io',
      remote: { origin: 'https://github.com/swanhtet01/swanhtet01.github.io.git' },
      ...(overrides.packet || {}),
    },
    ...(overrides.handoffReceipt || {}),
  }
  return { gate, handoffReceipt }
}

function receipt(overrides = {}) {
  const values = context(overrides)
  return {
    ...values,
    executionChallenge,
    packet: buildReviewBranchPushOwnerReceipt({
      ...values,
      executionChallenge,
      confirmedAt,
      nonce,
    }),
  }
}

test('builds a short-lived receipt bound to the exact review-only push', () => {
  const built = receipt()
  assert.equal(built.packet.contract, REVIEW_BRANCH_PUSH_OWNER_RECEIPT_CONTRACT)
  assert.equal(
    validateReviewBranchPushOwnerReceipt(built.packet, {
      gate: built.gate,
      handoffReceipt: built.handoffReceipt,
      executionChallenge: built.executionChallenge,
      now: confirmedAt,
    }),
    built.packet,
  )
  assert.equal(built.packet.action.commit, commit)
  assert.equal(built.packet.action.remoteCommitBefore, remoteCommit)
  assert.equal(built.packet.action.forcePushAllowed, false)
  assert.equal(built.packet.authority.mergeApproved, false)
  assert.equal(built.packet.authority.deploymentApproved, false)
  assert.equal(built.packet.controls.externalWritePerformed, false)
  assert.equal(built.packet.controls.reusable, false)
  assert.equal(
    Date.parse(built.packet.confirmation.expiresAt) - Date.parse(built.packet.confirmation.confirmedAt),
    REVIEW_BRANCH_PUSH_OWNER_RECEIPT_TTL_MS,
  )
})

test('confirmation copy is explicit and defaults to decline', () => {
  const { gate, handoffReceipt } = context()
  const message = renderReviewBranchPushOwnerConfirmation({ gate, handoffReceipt })
  assert.match(message, new RegExp(commit))
  assert.match(message, /fast-forward-only/)
  assert.match(message, /cannot merge, force-push, delete/)
  assert.match(message, /No is the default/)

  let invocation
  const approved = confirmReviewBranchPushOwnerClick(message, {
    platform: 'win32',
    spawn: (command, args, options) => {
      invocation = { command, args, options }
      return { status: 0, stdout: 'APPROVED\r\n', stderr: '' }
    },
  })
  assert.equal(approved, true)
  assert.equal(invocation.command, 'powershell.exe')
  assert.ok(invocation.args.includes('-Sta'))
  assert.match(invocation.options.env.SUPERMEGA_OWNER_GATE_MESSAGE, new RegExp(commit))
  assert.equal(invocation.options.windowsHide, false)
  assert.equal(invocation.options.timeout, 55_000)
  assert.equal(invocation.options.env.GITHUB_TOKEN, undefined)
  assert.equal(invocation.options.env.GH_TOKEN, undefined)
  assert.equal(invocation.options.env.SUPABASE_ACCESS_TOKEN, undefined)
})

test('rejects tampering, rebinding, expiry, and receipts from the future', () => {
  const built = receipt()
  assert.throws(
    () => validateReviewBranchPushOwnerReceipt(
      { ...built.packet, action: { ...built.packet.action, commit: 'd'.repeat(40) } },
      { gate: built.gate, handoffReceipt: built.handoffReceipt, executionChallenge, now: confirmedAt },
    ),
    /review_branch_push_owner_receipt_digest_invalid/,
  )
  assert.throws(
    () => validateReviewBranchPushOwnerReceipt(built.packet, {
      gate: { ...built.gate, commit: 'd'.repeat(40) },
      handoffReceipt: built.handoffReceipt,
      executionChallenge,
      now: confirmedAt,
    }),
    /review_branch_push_owner_receipt_context_invalid|review_branch_push_owner_receipt_action_mismatch/,
  )
  assert.throws(
    () => validateReviewBranchPushOwnerReceipt(built.packet, {
      gate: built.gate,
      handoffReceipt: built.handoffReceipt,
      executionChallenge,
      now: new Date(confirmedAt.getTime() + REVIEW_BRANCH_PUSH_OWNER_RECEIPT_TTL_MS),
    }),
    /review_branch_push_owner_receipt_expired_or_not_current/,
  )
  assert.throws(
    () => validateReviewBranchPushOwnerReceipt(built.packet, {
      gate: built.gate,
      handoffReceipt: built.handoffReceipt,
      executionChallenge,
      now: new Date(confirmedAt.getTime() - 1),
    }),
    /review_branch_push_owner_receipt_expired_or_not_current/,
  )
  assert.throws(
    () => validateReviewBranchPushOwnerReceipt(built.packet, {
      gate: built.gate,
      handoffReceipt: built.handoffReceipt,
      executionChallenge: 'e'.repeat(64),
      now: confirmedAt,
    }),
    /review_branch_push_owner_receipt_execution_seal_invalid/,
  )
  assert.throws(
    () => validateReviewBranchPushOwnerReceipt(built.packet, {
      gate: built.gate,
      handoffReceipt: built.handoffReceipt,
      now: confirmedAt,
    }),
    /review_branch_push_owner_receipt_execution_challenge_required/,
  )
  const { digest: _digest, executionSeal: originalSeal, ...body } = built.packet
  const { managedActivationApproved, ...authorityMissingManagedActivation } = body.authority
  const unsignedAuthoritySwap = {
    ...body,
    authority: {
      ...authorityMissingManagedActivation,
      madeUpApproval: false,
    },
  }
  const sealedAuthoritySwap = {
    ...unsignedAuthoritySwap,
    executionSeal: originalSeal,
  }
  const authoritySwap = {
    ...sealedAuthoritySwap,
    digest: reviewBranchPushOwnerReceiptDigest(JSON.stringify(sealedAuthoritySwap)),
  }
  assert.throws(
    () => validateReviewBranchPushOwnerReceipt(authoritySwap, {
      gate: built.gate,
      handoffReceipt: built.handoffReceipt,
      executionChallenge,
      now: confirmedAt,
    }),
    /review_branch_push_owner_receipt_execution_seal_invalid/,
  )
})

test('request writes nothing after decline and writes one verified file after click', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'supermega-owner-receipt-'))
  const declinedPath = join(directory, 'declined.json')
  const approvedPath = join(directory, 'approved.json')
  const { gate, handoffReceipt } = context()
  try {
    await assert.rejects(
      requestReviewBranchPushOwnerReceipt({
        gate,
        handoffReceipt,
        executionChallenge,
        output: declinedPath,
        confirmer: async () => false,
        now: () => confirmedAt,
        nonce: () => nonce,
      }),
      /review_branch_push_owner_receipt_declined/,
    )
    await assert.rejects(readFile(declinedPath), /ENOENT/)

    const created = await requestReviewBranchPushOwnerReceipt({
      gate,
      handoffReceipt,
      executionChallenge,
      output: approvedPath,
      confirmer: async (message) => message.includes(commit),
      now: () => confirmedAt,
      nonce: () => nonce,
    })
    assert.equal(created.packet.contract, REVIEW_BRANCH_PUSH_OWNER_RECEIPT_CONTRACT)
    assert.equal(created.fileDigest, reviewBranchPushOwnerReceiptDigest(created.payload))
    assert.equal(
      validateReviewBranchPushOwnerReceipt(created.packet, {
        gate,
        handoffReceipt,
        executionChallenge,
        now: confirmedAt,
      }),
      created.packet,
    )
    await assert.rejects(
      requestReviewBranchPushOwnerReceipt({
        gate,
        handoffReceipt,
        executionChallenge,
        output: approvedPath,
        confirmer: async () => true,
        now: () => confirmedAt,
        nonce: () => 'e'.repeat(64),
      }),
      /EEXIST/,
    )
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('consumption leaves a verified tombstone and blocks replay', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'supermega-owner-receipt-consume-'))
  const output = join(directory, 'approval.json')
  const { gate, handoffReceipt } = context()
  try {
    const created = await requestReviewBranchPushOwnerReceipt({
      gate,
      handoffReceipt,
      executionChallenge,
      output,
      confirmer: async () => true,
      now: () => confirmedAt,
      nonce: () => nonce,
    })
    const consumed = await consumeReviewBranchPushOwnerReceipt(created)
    assert.equal(consumed.ok, true)
    assert.equal(consumed.packetDigest, created.packet.digest)
    assert.equal(await readFile(consumed.consumedPath, 'utf8'), created.payload)
    await assert.rejects(readFile(output), /ENOENT/)

    await writeFileForReplay(output, created.payload)
    await assert.rejects(
      readReviewBranchPushOwnerReceipt(output),
      /review_branch_push_owner_receipt_already_consumed/,
    )
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

async function writeFileForReplay(path, payload) {
  const { writeFile } = await import('node:fs/promises')
  await writeFile(path, payload, { encoding: 'utf8', flag: 'wx' })
}
