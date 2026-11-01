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

const probeImage = 'supermega-observer-probe.exe'
function traceEvent({ task, opcode, pid, image = probeImage, key = 'key-1',
  time = '2026-11-01T00:00:00.0000000Z' }) {
  const data = [
    `<Data Name="ProcessID">${pid}</Data>`,
    `<Data Name="ImageName">${image}</Data>`,
    key === null ? '' : `<Data Name="ProcessKey">${key}</Data>`,
  ].join('')
  return `<Event><System><Task Name="${task}"/><Opcode Name="${opcode}"/>`
    + `<TimeCreated SystemTime="${time}"/></System><EventData>${data}</EventData></Event>`
}

// Independent fixture oracle for the source-level correlation contract. The Windows
// implementation uses XmlDocument/SelectNodes rather than this test-only tokenizer.
function fixtureCorrelates(xml) {
  const records = [...xml.matchAll(/<Event>([\s\S]*?)<\/Event>/g)].map(([, body]) => {
    const field = (pattern) => body.match(pattern)?.[1] ?? null
    return {
      task: field(/<Task Name="([^"]+)"\/>/),
      opcode: field(/<Opcode Name="([^"]+)"\/>/),
      pid: field(/<Data Name="ProcessID">(\d+)<\/Data>/),
      image: field(/<Data Name="ImageName">([^<]+)<\/Data>/),
      key: field(/<Data Name="ProcessKey">([^<]+)<\/Data>/),
      time: field(/<TimeCreated SystemTime="([^"]+)"\/>/),
    }
  }).filter((record) => record.image === probeImage)
  if (records.some((record) => !record.pid || !record.time)) return false
  const starts = records.filter((record) => record.task === 'Process'
    && ['Start', 'DCStart'].includes(record.opcode))
  const images = records.filter((record) => ['Image', 'ImageLoad', 'Loader'].includes(record.task)
    && ['Load', 'Start', 'DCStart'].includes(record.opcode))
  if (starts.length !== 1 || images.length !== 1) return false
  const [start] = starts; const [image] = images
  return start.pid === image.pid && Date.parse(image.time) >= Date.parse(start.time)
    && (!start.key || !image.key || start.key === image.key)
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
    'Read-ProbeTraceCorrelation',
    "SelectNodes(\"//*[local-name()='Event']\")",
    'observer_probe_trace_correlation_ambiguous',
    'observer_probe_trace_correlation_mismatch',
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
  assert.doesNotMatch(source, /Process\.\{0,4096\}/)
  assert.doesNotMatch(source, /Image\.\{0,4096\}/)
})

test('structured trace fixture accepts one correlated process and image record', () => {
  const xml = `<Events>${traceEvent({ task: 'Process', opcode: 'Start', pid: 41 })}`
    + `${traceEvent({ task: 'ImageLoad', opcode: 'Load', pid: 41,
      time: '2026-11-01T00:00:00.1000000Z' })}</Events>`
  assert.equal(fixtureCorrelates(xml), true)
})

test('structured trace fixture rejects process-only evidence', () => {
  assert.equal(fixtureCorrelates(`<Events>${traceEvent({
    task: 'Process', opcode: 'Start', pid: 41,
  })}</Events>`), false)
})

test('structured trace fixture rejects image-only evidence', () => {
  assert.equal(fixtureCorrelates(`<Events>${traceEvent({
    task: 'Image', opcode: 'Load', pid: 41,
  })}</Events>`), false)
})

test('structured trace fixture rejects unrelated process and image records', () => {
  const xml = `<Events>${traceEvent({ task: 'Process', opcode: 'Start', pid: 41 })}`
    + `${traceEvent({ task: 'Image', opcode: 'Load', pid: 99,
      image: 'unrelated.exe', time: '2026-11-01T00:00:00.1000000Z' })}</Events>`
  assert.equal(fixtureCorrelates(xml), false)
})

test('structured trace fixture rejects PID reuse and ambiguous starts', () => {
  const xml = `<Events>${traceEvent({ task: 'Process', opcode: 'Start', pid: 41 })}`
    + `${traceEvent({ task: 'Process', opcode: 'Start', pid: 41,
      key: 'key-2', time: '2026-11-01T00:00:00.0500000Z' })}`
    + `${traceEvent({ task: 'Image', opcode: 'Load', pid: 41,
      key: 'key-2', time: '2026-11-01T00:00:00.1000000Z' })}</Events>`
  assert.equal(fixtureCorrelates(xml), false)
})

test('structured trace fixture rejects missing correlation identity fields', () => {
  const validStart = traceEvent({ task: 'Process', opcode: 'Start', pid: 41 })
  const missingPid = traceEvent({ task: 'Image', opcode: 'Load', pid: 41,
    time: '2026-11-01T00:00:00.1000000Z' })
    .replace('<Data Name="ProcessID">41</Data>', '')
  assert.equal(fixtureCorrelates(`<Events>${validStart}${missingPid}</Events>`), false)
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
