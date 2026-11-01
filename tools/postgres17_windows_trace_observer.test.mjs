import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  validateObserverProbe,
  verifyEvidenceDirectory,
} from './postgres17_windows_evidence_contract.mjs'

const sha256 = (value) => createHash('sha256').update(value).digest('hex')
const exactSha = 'b'.repeat(40)
const digest = 'a'.repeat(64)

function tool(fileName) {
  return {
    fileName,
    bytes: 100,
    sha256: digest,
    signatureStatus: 'Valid',
    signerCertificateSha256: 'c'.repeat(64),
  }
}

function probeFixture() {
  return {
    contract: 'supermega.windows-process-image-observer-probe.v1',
    authoritative: false,
    exactSha,
    captureMethod: 'windows-wpr-etw-process-image-probe-v1',
    runner: 'windows-2025',
    osBuild: '10.0.26100.1',
    profileSha256: digest,
    tools: {
      wpr: tool('wpr.exe'),
      tracerpt: tool('tracerpt.exe'),
      probe: tool('where.exe'),
    },
    traceStartedBeforeProbe: true,
    traceStopped: true,
    traceParsed: true,
    droppedEvents: 0,
    droppedBuffers: 0,
    processEventObserved: true,
    imageEventObserved: true,
    probeExitCode: 0,
    drainComplete: true,
    temporaryDataRemoved: true,
    postgresDownloaded: false,
    postgresExecuted: false,
    databaseStarted: false,
    secretValuesExposed: false,
  }
}

test('manual workflow exposes an exact-SHA observer probe without automatic triggers', async () => {
  const workflow = await readFile(new URL(
    '../.github/workflows/postgres17-windows-evidence.yml', import.meta.url), 'utf8')
  assert.match(workflow, /^on:\n  workflow_dispatch:/m)
  assert.doesNotMatch(workflow, /^  (push|pull_request|schedule):/m)
  assert.match(workflow, /- observer-probe/)
  assert.match(workflow, /postgres17_windows_trace_observer\.ps1/)
  assert.match(workflow, /-Mode Probe/)
  assert.match(workflow, /postgres17-observer-probe\.json/)
  assert.match(workflow, /retention-days: 7/)
  assert.doesNotMatch(workflow, /secrets\./)
})

test('observer probe policy binds exact source and remains non-authoritative', async () => {
  const root = new URL('../', import.meta.url)
  const [policyBytes, scriptBytes, profileBytes] = await Promise.all([
    readFile(new URL('hq/research/postgres17-windows-bootstrap-policy.json', root)),
    readFile(new URL('tools/postgres17_windows_trace_observer.ps1', root)),
    readFile(new URL('hq/research/postgres17-process-image.wprp', root)),
  ])
  const policy = JSON.parse(policyBytes)
  const probe = policy.closureObserver.capabilityProbe
  assert.equal(probe.status, 'source-only')
  assert.equal(probe.authoritative, false)
  assert.equal(probe.scriptSha256, sha256(scriptBytes))
  assert.equal(probe.profileSha256, sha256(profileBytes))
  assert.equal(policy.closureObserver.status, 'pending')
  assert.equal(policy.closureObserver.command, null)
  assert.equal(policy.approval.status, 'pending')
})

test('probe uses fixed signed Windows tools, explicit loss checks, and no PostgreSQL path', async () => {
  const source = await readFile(new URL('./postgres17_windows_trace_observer.ps1', import.meta.url), 'utf8')
  for (const token of [
    'C:\\Windows\\System32\\wpr.exe',
    'C:\\Windows\\System32\\tracerpt.exe',
    'C:\\Windows\\System32\\where.exe',
    'requiredSignerOrganization',
    "& $wpr -start",
    "& $wpr -stop",
    'EventsLost',
    'BuffersLost',
    'observer_probe_trace_loss_detected',
    'observer_probe_trace_coverage_incomplete',
    'postgresDownloaded = $false',
    'postgresExecuted = $false',
    'databaseStarted = $false',
    'authoritative = $false',
  ]) assert.ok(source.includes(token), token)
  for (const forbidden of [
    'GetByteArrayAsync',
    'Invoke-WebRequest',
    'Start-BitsTransfer',
    'postgresql-17.11-5-windows-x64.exe',
    'record_postgres17_rehearsal.mjs',
  ]) assert.equal(source.includes(forbidden), false, forbidden)
})

test('observer probe contract rejects incomplete, lossy, authoritative, or unsafe evidence', () => {
  assert.deepEqual(validateObserverProbe(probeFixture(), exactSha),
    { stage: 'observer-probe', exactSha, authoritative: false })
  for (const mutate of [
    (value) => { value.authoritative = true },
    (value) => { value.droppedEvents = 1 },
    (value) => { value.droppedBuffers = 1 },
    (value) => { value.processEventObserved = false },
    (value) => { value.imageEventObserved = false },
    (value) => { value.drainComplete = false },
    (value) => { value.temporaryDataRemoved = false },
    (value) => { value.postgresDownloaded = true },
    (value) => { value.postgresExecuted = true },
    (value) => { value.databaseStarted = true },
    (value) => { value.tools.wpr.fileName = 'substituted.exe' },
    (value) => { value.tools.tracerpt.signatureStatus = 'NotSigned' },
    (value) => { value.unexpected = true },
  ]) {
    const changed = structuredClone(probeFixture())
    mutate(changed)
    assert.throws(() => validateObserverProbe(changed, exactSha), /observer_probe_invalid/)
  }
})

test('evidence directory accepts only the one sanitized probe receipt', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'postgres17-observer-probe-'))
  try {
    await writeFile(join(directory, 'postgres17-observer-probe.json'),
      JSON.stringify(probeFixture()))
    assert.deepEqual(await verifyEvidenceDirectory(directory, 'observer-probe', exactSha),
      { stage: 'observer-probe', exactSha, authoritative: false })
    await writeFile(join(directory, 'unexpected.json'), '{}')
    await assert.rejects(verifyEvidenceDirectory(directory, 'observer-probe', exactSha),
      /evidence_file_set_invalid/)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
