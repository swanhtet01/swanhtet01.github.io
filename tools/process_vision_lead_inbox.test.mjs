import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { processVisionLeadInbox } from './process_vision_lead_inbox.mjs'

function event(overrides = {}) {
  return {
    event: 'supermega.contact.created',
    record: {
      lead_id: 'LEAD-0123456789ABCDEF',
      name: 'Mya',
      email: 'mya@example.com',
      company: 'Example Works',
      workflow: 'vision',
      goal: 'Review an owned application screen before release',
      raw: {
        vision: {
          platform: 'windows', state_count: 6, weekly_runs: 10, minutes_per_run: 30, labor_hourly_usd: 8,
          screenshot_rights: true, human_fallback: true, observation_only: true,
        },
      },
      ...overrides,
    },
  }
}

test('processes Vision contact events offline and replays without overwriting', async () => {
  const root = await mkdtemp(join(tmpdir(), 'supermega-vision-inbox-'))
  const inbox = join(root, 'inbox')
  const outbox = join(root, 'outbox')
  try {
    await mkdir(inbox)
    await writeFile(join(inbox, 'lead.json'), JSON.stringify(event()))

    const first = await processVisionLeadInbox({ inbox, outbox })
    assert.equal(first.processed, 1)
    assert.deepEqual(first.effects, { external_requests: 0, messages_sent: 0, payments_accepted: 0, input_files_modified: 0 })
    const proposalPath = join(outbox, 'proposals', 'LEAD-0123456789ABCDEF.proposal.md')
    const replyPath = join(outbox, 'reply-drafts', 'LEAD-0123456789ABCDEF.reply.txt')
    const receiptPath = join(outbox, 'receipts', 'LEAD-0123456789ABCDEF.json')
    const proposal = await readFile(proposalPath, 'utf8')
    const receipt = JSON.parse(await readFile(receiptPath, 'utf8'))
    assert.match(proposal, /QUALIFIED FOR OWNER REVIEW/)
    assert.equal(receipt.price_usd, 1_500)
    assert.equal(receipt.qualified, true)
    assert.equal(receipt.contract, 'supermega.vision.lead_proposal_receipt.v2')
    assert.match(await readFile(replyPath, 'utf8'), /DRAFT — OWNER REVIEW REQUIRED — NOT SENT/)
    assert.match(await readFile(replyPath, 'utf8'), /fixed draft price of USD 1,500/)

    const replay = await processVisionLeadInbox({ inbox, outbox })
    assert.equal(replay.processed, 0)
    assert.equal(replay.replayed, 1)
    assert.equal(await readFile(proposalPath, 'utf8'), proposal)

    await writeFile(replyPath, 'tampered reply')
    const tampered = await processVisionLeadInbox({ inbox, outbox })
    assert.equal(tampered.rejected, 1)
    assert.equal(tampered.replayed, 0)
    assert.equal((await readdir(join(outbox, 'rejections'))).length, 1)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('fails closed on lead-id conflicts and records malformed inputs without touching originals', async () => {
  const root = await mkdtemp(join(tmpdir(), 'supermega-vision-inbox-failure-'))
  const inbox = join(root, 'inbox')
  const outbox = join(root, 'outbox')
  try {
    await mkdir(inbox)
    const original = JSON.stringify(event())
    await writeFile(join(inbox, 'a-original.json'), original)
    await processVisionLeadInbox({ inbox, outbox })
    await writeFile(join(inbox, 'b-conflict.json'), JSON.stringify(event({ goal: 'Different workflow under the same lead id' })))
    await writeFile(join(inbox, 'c-malformed.json'), '{not json')
    await writeFile(join(inbox, 'd-shop.json'), JSON.stringify(event({ workflow: 'commerce' })))

    const result = await processVisionLeadInbox({ inbox, outbox })
    assert.equal(result.replayed, 1)
    assert.equal(result.rejected, 2)
    assert.equal(result.ignored, 1)
    assert.equal((await readdir(join(outbox, 'rejections'))).length, 2)
    assert.equal(await readFile(join(inbox, 'a-original.json'), 'utf8'), original)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('creates a blocked proposal when commercial gates are not yet satisfied', async () => {
  const root = await mkdtemp(join(tmpdir(), 'supermega-vision-inbox-blocked-'))
  const inbox = join(root, 'inbox')
  const outbox = join(root, 'outbox')
  try {
    await mkdir(inbox)
    const blocked = event()
    blocked.record.raw.vision.screenshot_rights = false
    await writeFile(join(inbox, 'blocked.json'), JSON.stringify(blocked))
    const result = await processVisionLeadInbox({ inbox, outbox })
    assert.equal(result.processed, 1)
    const receipt = JSON.parse(await readFile(join(outbox, 'receipts', 'LEAD-0123456789ABCDEF.json'), 'utf8'))
    assert.equal(receipt.qualified, false)
    assert.deepEqual(receipt.blockers, ['written_screenshot_rights_required'])
    assert.match(await readFile(join(outbox, 'proposals', 'LEAD-0123456789ABCDEF.proposal.md'), 'utf8'), /NOT READY TO OFFER/)
    const reply = await readFile(join(outbox, 'reply-drafts', 'LEAD-0123456789ABCDEF.reply.txt'), 'utf8')
    assert.match(reply, /Can your company confirm it owns or is authorized/)
    assert.doesNotMatch(reply, /fixed draft price/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('Windows entry point initializes a local sales workspace and runs the inbox', async () => {
  if (process.platform !== 'win32') return
  const root = await mkdtemp(join(tmpdir(), 'supermega-vision-cmd-'))
  try {
    const inbox = join(root, 'inbox')
    await mkdir(inbox)
    await writeFile(join(inbox, 'lead.json'), JSON.stringify(event()))
    const result = spawnSync('cmd.exe', ['/d', '/c', '.\\vision-sales.cmd'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: { ...process.env, SUPERMEGA_VISION_SALES_ROOT: root },
    })
    assert.equal(result.status, 0, result.stderr)
    assert.match(result.stdout, /"processed":1/)
    assert.match(await readFile(join(root, 'outbox', 'proposals', 'LEAD-0123456789ABCDEF.proposal.md'), 'utf8'), /QUALIFIED FOR OWNER REVIEW/)
    assert.match(await readFile(join(root, 'outbox', 'reply-drafts', 'LEAD-0123456789ABCDEF.reply.txt'), 'utf8'), /NOT SENT/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
