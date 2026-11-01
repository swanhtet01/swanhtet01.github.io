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
import { correlateTraceXml } from './postgres17_windows_trace_parser.mjs'

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
    processEndObserved: true,
    stableProcessKeyObserved: true,
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

function validTrace() {
  return `<Events>${traceEvent({ task: 'Process', opcode: 'Start', pid: 41 })}`
    + `${traceEvent({ task: 'ImageLoad', opcode: 'Load', pid: 41,
      time: '2026-11-01T00:00:00.100Z' })}`
    + `${traceEvent({ task: 'Process', opcode: 'End', pid: 41,
      time: '2026-11-01T00:00:00.200Z' })}</Events>`
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
  const [policyBytes, scriptBytes, profileBytes, parserBytes] = await Promise.all([
    readFile(new URL('hq/research/postgres17-windows-bootstrap-policy.json', root)),
    readFile(new URL('tools/postgres17_windows_trace_observer.ps1', root)),
    readFile(new URL('hq/research/postgres17-process-image.wprp', root)),
    readFile(new URL('tools/postgres17_windows_trace_parser.mjs', root)),
  ])
  const policy = JSON.parse(policyBytes)
  const probe = policy.closureObserver.capabilityProbe
  assert.equal(probe.status, 'source-only')
  assert.equal(probe.authoritative, false)
  assert.equal(probe.scriptSha256, sha256(scriptBytes))
  assert.equal(probe.profileSha256, sha256(profileBytes))
  assert.equal(probe.parserSha256, sha256(parserBytes))
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
    '$probePolicy.parserPath',
    'stableProcessKeyObserved',
    'processEndObserved',
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

test('production parser accepts one stable start, image, and end lifetime', () => {
  assert.deepEqual(correlateTraceXml(validTrace(), probeImage), {
    contract: 'supermega.windows-process-image-correlation.v1',
    processEventObserved: true,
    imageEventObserved: true,
    processEndObserved: true,
    stableProcessKeyObserved: true,
  })
})

test('production parser rejects process-only and image-only evidence', () => {
  assert.throws(() => correlateTraceXml(`<Events>${traceEvent({
    task: 'Process', opcode: 'Start', pid: 41,
  })}</Events>`, probeImage), /correlation_ambiguous/)
  assert.throws(() => correlateTraceXml(`<Events>${traceEvent({
    task: 'Image', opcode: 'Load', pid: 41,
  })}</Events>`, probeImage), /correlation_ambiguous/)
})

test('production parser rejects unrelated process and image records', () => {
  const xml = `<Events>${traceEvent({ task: 'Process', opcode: 'Start', pid: 41 })}`
    + `${traceEvent({ task: 'Image', opcode: 'Load', pid: 99,
      image: 'unrelated.exe', time: '2026-11-01T00:00:00.100Z' })}</Events>`
  assert.throws(() => correlateTraceXml(xml, probeImage), /correlation_ambiguous/)
})

test('production parser rejects PID reuse and duplicate starts', () => {
  const xml = `<Events>${traceEvent({ task: 'Process', opcode: 'Start', pid: 41 })}`
    + `${traceEvent({ task: 'Process', opcode: 'Start', pid: 41,
      key: 'key-2', time: '2026-11-01T00:00:00.050Z' })}`
    + `${traceEvent({ task: 'Image', opcode: 'Load', pid: 41,
      key: 'key-2', time: '2026-11-01T00:00:00.100Z' })}`
    + `${traceEvent({ task: 'Process', opcode: 'End', pid: 41,
      key: 'key-2', time: '2026-11-01T00:00:00.200Z' })}</Events>`
  assert.throws(() => correlateTraceXml(xml, probeImage), /correlation_ambiguous/)
})

test('production parser rejects missing stable key and missing end', () => {
  const missingKey = validTrace().replace('<Data Name="ProcessKey">key-1</Data>', '')
  assert.throws(() => correlateTraceXml(missingKey, probeImage), /process_key_missing/)
  const missingEnd = validTrace().replace(
    traceEvent({ task: 'Process', opcode: 'End', pid: 41,
      time: '2026-11-01T00:00:00.200Z' }), '')
  assert.throws(() => correlateTraceXml(missingEnd, probeImage), /correlation_ambiguous/)
})

test('production parser rejects wrong key and end before image', () => {
  const wrongKey = validTrace().replace(
    '<Data Name="ProcessKey">key-1</Data></EventData></Event></Events>',
    '<Data Name="ProcessKey">key-2</Data></EventData></Event></Events>')
  assert.throws(() => correlateTraceXml(wrongKey, probeImage), /correlation_mismatch/)
  const earlyEnd = validTrace().replace('2026-11-01T00:00:00.200Z',
    '2026-11-01T00:00:00.050Z')
  assert.throws(() => correlateTraceXml(earlyEnd, probeImage), /correlation_mismatch/)
})

test('production parser rejects unknown task or opcode for the probe image', () => {
  for (const changed of [
    validTrace().replace('<Task Name="ImageLoad"/>', '<Task Name="Process"/>'),
    validTrace().replace('<Opcode Name="Load"/>', '<Opcode Name="Unknown"/>'),
  ]) assert.throws(() => correlateTraceXml(changed, probeImage), /task_opcode_unknown/)
})

test('production parser rejects DTDs and entities', () => {
  assert.throws(() => correlateTraceXml(
    '<!DOCTYPE Events [<!ENTITY x "probe">]><Events></Events>', probeImage), /xml_unsafe/)
  assert.throws(() => correlateTraceXml(
    validTrace().replace(probeImage, '&probe;'), probeImage), /xml_unsafe/)
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
    (value) => { value.processEndObserved = false },
    (value) => { value.stableProcessKeyObserved = false },
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
