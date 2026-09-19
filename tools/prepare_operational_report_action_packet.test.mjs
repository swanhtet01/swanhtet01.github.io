import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'

import {
  OPERATIONAL_REPORT_ACTION_PACKET_PREP_CONTRACT,
  buildOperationalReportActionPacket,
  renderOperationalReportActionPacketMarkdown,
  validateOperationalReportActionPacketFile,
} from './prepare_operational_report_action_packet.mjs'

const root = resolve(import.meta.dirname, '..')

async function withTemp(fn) {
  const path = await mkdtemp(join(tmpdir(), 'supermega-operational-action-packet-test-'))
  try {
    return await fn(path)
  } finally {
    await rm(path, { recursive: true, force: true })
  }
}

test('builds a local sample action packet with owner gates and no external authority', async () => {
  const packet = await buildOperationalReportActionPacket({
    observedAt: '2026-08-25T00:00:00.000Z',
    openedAt: '2026-08-25T02:00:00.000Z',
    dueDate: '2026-08-26',
    ownerRole: 'Founder plus Product',
  })
  assert.equal(packet.contract, 'supermega.operational_report_action_packet.v1')
  assert.match(packet.digest, /^sha256:[0-9a-f]{64}$/)
  assert.ok(packet.actions.length > 0)
  assert.equal(packet.controls.reviewOnly, true)
  assert.equal(packet.controls.externalWritesPerformed, false)
  assert.equal(packet.controls.managedWritesPerformed, false)
  assert.ok(packet.actions.every((action) => action.status === 'owner-gated'))
  assert.ok(packet.actions.every((action) => action.owner.namedPrivate === false))
  assert.ok(packet.actions.every((action) => action.authority.ownerApprovalRequired === true))
  assert.ok(packet.actions.every((action) => action.authority.externalWriteAllowed === false))
  assert.ok(packet.actions.every((action) => action.closure.closedAt === null))
  assert.ok(packet.actions.every((action) => action.productIds.every((productId) => ['shop', 'plant', 'website', 'ecommerce'].includes(productId))))
  assert.ok(packet.actions.every((action) => !action.productIds.includes('commerce') && !action.id.startsWith('operational-commerce-')))
  assert.doesNotMatch(JSON.stringify(packet), /May|Ko Aung|Daw Mya|ghp_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9_-]{20,}/)
})

test('rejects normalized impossible calendar dates and numeric overflows', async () => {
  for (const dueDate of ['2026-02-29', '2026-02-30', '2026-02-31', '2026-04-31']) {
    await assert.rejects(() => buildOperationalReportActionPacket({
      observedAt: '2026-08-25T00:00:00.000Z',
      openedAt: '2026-08-25T02:00:00.000Z',
      dueDate,
    }), /Operational report action due date is invalid/)
  }
  for (const dueDate of ['2026-00-10', '2026-13-01', '2026-01-00', '2026-01-32']) {
    await assert.rejects(() => buildOperationalReportActionPacket({
      observedAt: '2026-08-25T00:00:00.000Z',
      openedAt: '2026-08-25T02:00:00.000Z',
      dueDate,
    }), /operational_report_action_packet_due_date_invalid/)
  }
})

test('preserves valid leap days and calendar year boundaries', async () => {
  for (const dueDate of ['2024-02-29', '2026-01-01', '2026-12-31', '2027-01-01']) {
    const packet = await buildOperationalReportActionPacket({
      observedAt: '2026-08-25T00:00:00.000Z',
      openedAt: '2026-08-25T02:00:00.000Z',
      dueDate,
    })
    assert.equal(packet.dueDate, dueDate)
  }
})

test('filters critical actions without turning ready findings into work orders', async () => {
  const packet = await buildOperationalReportActionPacket({
    observedAt: '2026-08-25T00:00:00.000Z',
    openedAt: '2026-08-25T02:00:00.000Z',
    dueDate: '2026-08-26',
    view: { product: 'all', urgency: 'critical' },
  })
  assert.ok(packet.actions.every((action) => action.severity === 'critical'))
  assert.ok(packet.actions.every((action) => action.acceptance.evidenceRequired.length >= 2))
})

test('validates packet files and rejects tampered external-write authority', async () => {
  await withTemp(async (dir) => {
    const packet = await buildOperationalReportActionPacket({
      observedAt: '2026-08-25T00:00:00.000Z',
      openedAt: '2026-08-25T02:00:00.000Z',
      dueDate: '2026-08-26',
    })
    const okPath = join(dir, 'packet.json')
    await writeFile(okPath, `${JSON.stringify(packet, null, 2)}\n`, 'utf8')
    const receipt = await validateOperationalReportActionPacketFile(okPath)
    assert.equal(receipt.packet.digest, packet.digest)

    const tampered = structuredClone(packet)
    tampered.actions[0].authority.externalWriteAllowed = true
    const badPath = join(dir, 'tampered.json')
    await writeFile(badPath, `${JSON.stringify(tampered, null, 2)}\n`, 'utf8')
    await assert.rejects(() => validateOperationalReportActionPacketFile(badPath), /Operational report action authority is invalid/)
  })
})

test('renders public-safe markdown and rejects credential-shaped text', async () => {
  const packet = await buildOperationalReportActionPacket({
    observedAt: '2026-08-25T00:00:00.000Z',
    openedAt: '2026-08-25T02:00:00.000Z',
    dueDate: '2026-08-26',
  })
  const markdown = renderOperationalReportActionPacketMarkdown(packet)
  assert.match(markdown, /SuperMega Operational Report Action Packet/)
  assert.match(markdown, /No external writes are authorized/)
  assert.doesNotMatch(markdown, /May|Ko Aung|Daw Mya|operational-commerce-|:commerce:|github_pat_[A-Za-z0-9_]{20,}/)

  const secretPacket = structuredClone(packet)
  secretPacket.ownerRole = `sk-${'a'.repeat(30)}`
  assert.throws(() => renderOperationalReportActionPacketMarkdown(secretPacket), /operational_report_action_packet_secret_shape/)
})

test('CLI writes, verifies, and refuses stale overwrite by default', async () => {
  await withTemp(async (dir) => {
    const packetPath = join(dir, 'packet.json')
    const markdownPath = join(dir, 'packet.md')
    const result = spawnSync(process.execPath, [
      'tools/prepare_operational_report_action_packet.mjs',
      '--output', packetPath,
      '--markdown-output', markdownPath,
      '--observed-at', '2026-08-25T00:00:00.000Z',
      '--opened-at', '2026-08-25T02:00:00.000Z',
      '--due-date', '2026-08-26',
    ], { cwd: root, encoding: 'utf8', windowsHide: true })
    assert.equal(result.status, 0, result.stderr || result.stdout)
    const payload = JSON.parse(result.stdout)
    assert.equal(payload.contract, OPERATIONAL_REPORT_ACTION_PACKET_PREP_CONTRACT)
    assert.equal(payload.externalWritesPerformed, false)
    assert.match(payload.packetDigest, /^sha256:[0-9a-f]{64}$/)

    const verify = spawnSync(process.execPath, [
      'tools/prepare_operational_report_action_packet.mjs',
      '--verify', packetPath,
    ], { cwd: root, encoding: 'utf8', windowsHide: true })
    assert.equal(verify.status, 0, verify.stderr || verify.stdout)
    assert.equal(JSON.parse(verify.stdout).mode, 'verified')
    assert.match(await readFile(markdownPath, 'utf8'), /Private identity is not exposed/)

    const overwrite = spawnSync(process.execPath, [
      'tools/prepare_operational_report_action_packet.mjs',
      '--output', packetPath,
      '--observed-at', '2026-08-25T00:00:00.000Z',
    ], { cwd: root, encoding: 'utf8', windowsHide: true })
    assert.notEqual(overwrite.status, 0)
    assert.match(overwrite.stderr, /EEXIST/)
  })
})
