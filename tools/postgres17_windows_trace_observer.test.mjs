import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { mkdtemp, open, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  validateObserverProbe,
  verifyEvidenceDirectory,
} from './postgres17_windows_evidence_contract.mjs'
import {
  correlateTraceXml,
  eventTraceHeaderPrefixShape,
  eventTraceHeaderShape,
  lossCounterLineShapes,
  lossSummaryStatus,
} from './postgres17_windows_trace_parser.mjs'
import { implementationPaths } from '../kernel/database-rehearsal-evidence.mjs'

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
      parent: tool('cmd.exe'),
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
    parentChildCorrelationObserved: true,
    exitStatusObserved: true,
    fullImagePathObserved: true,
    moduleEventObserved: true,
    completeOrderingObserved: true,
    probeExitCode: 0,
    drainComplete: true,
    temporaryDataRemoved: true,
    postgresDownloaded: false,
    postgresExecuted: false,
    databaseStarted: false,
    secretValuesExposed: false,
  }
}

const parentImage = 'C:\\Windows\\System32\\cmd.exe'
const probeImage = 'C:\\Temp\\supermega-observer-probe.exe'
const moduleImage = 'C:\\Windows\\System32\\kernel32.dll'
function traceEvent({ task, opcode, pid, image = probeImage, key = 'key-child',
  parentPid = null, parentKey = null, exitStatus = null,
  time = '2026-11-01T00:00:00.0000000Z' }) {
  const data = [
    `<Data Name="ProcessID">${pid}</Data>`,
    `<Data Name="ImageName">${image}</Data>`,
    key === null ? '' : `<Data Name="ProcessKey">${key}</Data>`,
    parentPid === null ? '' : `<Data Name="ParentProcessID">${parentPid}</Data>`,
    parentKey === null ? '' : `<Data Name="ParentProcessKey">${parentKey}</Data>`,
    exitStatus === null ? '' : `<Data Name="ExitStatus">${exitStatus}</Data>`,
  ].join('')
  return `<Event><System><Task Name="${task}"/><Opcode Name="${opcode}"/>`
    + `<TimeCreated SystemTime="${time}"/></System><EventData>${data}</EventData></Event>`
}

function validTrace() {
  return `<Events>${traceEvent({ task: 'Process', opcode: 'Start', pid: 40,
    image: parentImage, key: 'key-parent' })}`
    + `${traceEvent({ task: 'ImageLoad', opcode: 'Load', pid: 40,
      image: parentImage, key: 'key-parent', time: '2026-11-01T00:00:00.050Z' })}`
    + `${traceEvent({ task: 'Process', opcode: 'Start', pid: 41, parentPid: 40,
      parentKey: 'key-parent', time: '2026-11-01T00:00:00.100Z' })}`
    + `${traceEvent({ task: 'ImageLoad', opcode: 'Load', pid: 41,
      time: '2026-11-01T00:00:00.100Z' })}`
    + `${traceEvent({ task: 'ImageLoad', opcode: 'Load', pid: 41, image: moduleImage,
      time: '2026-11-01T00:00:00.150Z' })}`
    + `${traceEvent({ task: 'Process', opcode: 'End', pid: 41,
      exitStatus: '0', time: '2026-11-01T00:00:00.200Z' })}`
    + `${traceEvent({ task: 'Process', opcode: 'End', pid: 40, image: parentImage,
      key: 'key-parent', exitStatus: '0', time: '2026-11-01T00:00:00.250Z' })}</Events>`
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

test('separate PR observer is label-gated, exact-head, non-authoritative and inventoried', async () => {
  const path = '.github/workflows/postgres17-pr-observer-probe.yml'
  const workflow = await readFile(new URL(`../${path}`, import.meta.url), 'utf8')
  assert.ok(implementationPaths.includes(path))
  assert.match(workflow, /^on:\n  pull_request:\n    types: \[labeled\]$/m)
  assert.doesNotMatch(workflow, /^  (push|schedule|workflow_dispatch):/m)
  assert.match(workflow, /^permissions:\n  contents: read$/m)
  for (const guard of [
    "github.event.pull_request.number == 752",
    "github.event.label.name == 'pg17-observer-probe'",
    "github.event.pull_request.state == 'open'",
    'github.event.pull_request.draft == true',
    'github.event.pull_request.head.repo.full_name == github.repository',
    'github.event.pull_request.base.repo.full_name == github.repository',
    "github.event.pull_request.head.ref == 'codex/postgres17-provenance-integration-20261031'",
    "github.event.pull_request.base.ref == 'codex/shop-main-integration-20261022'",
  ]) assert.ok(workflow.includes(guard), guard)
  assert.match(workflow, /EXACT_SHA: \$\{\{ github\.event\.pull_request\.head\.sha \}\}/)
  const jobEnv = workflow.match(/^    env:\n(?:(?:      [^\n]*)\n)*/m)?.[0] ?? ''
  assert.doesNotMatch(jobEnv, /runner\.temp/)
  for (const name of [
    'Run non-authoritative observer probe only',
    'Verify sanitized observer evidence',
  ]) {
    const step = workflow.split(`      - name: ${name}\n`)[1]?.split('\n      - name: ')[0]
    assert.ok(step, name)
    assert.match(step, /^        env:\n          EVIDENCE_OUTPUT: \$\{\{ runner\.temp \}\}\\supermega-sanitized-evidence$/m)
  }
  assert.match(workflow, /ref: \$\{\{ github\.event\.pull_request\.head\.sha \}\}/)
  assert.match(workflow, /persist-credentials: false/)
  assert.match(workflow, /observer_pr_checkout_sha_mismatch/)
  assert.match(workflow, /observer_pr_checkout_not_clean/)
  assert.match(workflow, /postgres17_windows_trace_observer\.ps1/)
  assert.match(workflow, /-Mode Probe/)
  assert.match(workflow, /postgres17_windows_evidence_contract\.mjs \$env:EVIDENCE_OUTPUT observer-probe \$env:EXACT_SHA/)
  assert.match(workflow, /path: \$\{\{ runner\.temp \}\}\\supermega-sanitized-evidence\\postgres17-observer-probe\.json/)
  assert.match(workflow, /if-no-files-found: error/)
  assert.match(workflow, /retention-days: 7/)
  assert.doesNotMatch(workflow, /(?:secrets\.|id-token:|setup-node|evidence_bootstrap|postgres17-rehearsal|postgres17-stage1|postgres17-stage2|ExecutionPolicy)/i)
  for (const uses of workflow.matchAll(/^\s*uses:\s*([^\s]+)$/gm)) {
    assert.match(uses[1], /@[0-9a-f]{40}$/)
  }
})

test('PR observer parses the exact checkout before running WPR', async () => {
  const workflow = await readFile(new URL(
    '../.github/workflows/postgres17-pr-observer-probe.yml', import.meta.url), 'utf8')
  const clean = workflow.indexOf('      - name: Verify clean exact source\n')
  const parse = workflow.indexOf('      - name: Validate checked-out observer PowerShell syntax\n')
  const execute = workflow.indexOf('      - name: Run non-authoritative observer probe only\n')
  assert.ok(clean >= 0 && clean < parse && parse < execute)
  const step = workflow.slice(parse, execute)
  assert.match(step, /^        shell: powershell$/m)
  assert.match(step, /Join-Path -Path \$env:REPOSITORY_ROOT -ChildPath 'tools\/postgres17_windows_trace_observer\.ps1' -ErrorAction Stop/)
  assert.match(step, /\[System\.Management\.Automation\.Language\.Parser\]::ParseFile\(\$source, \[ref\]\$tokens, \[ref\]\$parseErrors\)/)
  assert.match(step, /\$null -eq \$ast -or \$null -eq \$parseErrors -or \$parseErrors\.Count -ne 0/)
  assert.match(step, /catch \{\n            throw 'observer_pr_script_parse_invalid'\n          \}/)
  assert.doesNotMatch(step, /(?:Write-(?:Host|Output|Error)|ConvertTo-Json|Format-List|Start-Process|&\s*\$source|ExecutionPolicy)/i)
})

test('observer inspector obeys host script policy and retains refusal and cleanup', async () => {
  const source = await readFile(new URL('./postgres17_windows_trace_observer.ps1', import.meta.url), 'utf8')
  assert.ok(source.includes("& 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe' `"))
  assert.match(source, /-NoLogo -NoProfile -NonInteractive -File \$Inspector/)
  assert.doesNotMatch(source, /-ExecutionPolicy\b/i)
  assert.ok(source.includes("if ($LASTEXITCODE -ne 0) { Fail 'observer_probe_tool_signature_invalid' }"))
  assert.ok(source.includes('Remove-Item Env:\\SUPERMEGA_AUTHENTICODE_TARGET -ErrorAction SilentlyContinue'))
})

test('observer source restricts hardlink and Catalog rules to four pinned System32 tools', async () => {
  const source = await readFile(new URL('./postgres17_windows_trace_observer.ps1', import.meta.url), 'utf8')
  const guard = source.split('function Assert-PinnedSystemTool(')[1]
    ?.split('function Inspect-SignedTool(')[0]
  const signature = source.split('function Inspect-SignedTool(')[1]
    ?.split('function Try-ReadLossCounter(')[0]
  assert.ok(guard)
  assert.ok(signature)
  const paths = [...guard.matchAll(/'C:\\Windows\\System32\\([^']+)'/g)].map((match) => match[1])
  assert.deepEqual(paths, ['wpr.exe', 'tracerpt.exe', 'cmd.exe', 'where.exe'])
  for (const refusal of [
    '-not [System.IO.File]::Exists($Path)',
    '$item.FullName -ine $Path',
    '$item.PSIsContainer',
    '$item.Length -lt 1',
    '($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0',
    "$item.LinkType -cne 'HardLink'",
  ]) assert.ok(guard.includes(refusal), refusal)
  for (const check of [
    "Assert-PinnedSystemTool $Path 'observer_probe_tool_signature_invalid'",
    "observation.contract -cne 'supermega.windows-authenticode-observation.v1'",
    "observation.signatureStatus -cne 'Valid'",
    "observation.signatureType -cnotin @('Authenticode', 'Catalog')",
    "@($observation.ekuOids) -notcontains '1.3.6.1.5.5.7.3.3'",
    '$observation.signerSubject -notmatch $organizationPattern',
    '$observation.artifactFileName -ine $item.Name',
    '[int64]$observation.artifactBytes -ne [int64]$item.Length',
    '$observation.artifactSha256 -ne (Get-Sha256 $Path)',
  ]) assert.ok(signature.includes(check), check)
  for (const [variable, code] of [
    ['$wpr', 'observer_probe_wpr_missing'],
    ['$tracerpt', 'observer_probe_tracerpt_missing'],
    ['$probeParentExecutable', 'observer_probe_parent_executable_missing'],
    ['$probeExecutable', 'observer_probe_executable_missing'],
  ]) assert.ok(source.includes(`Assert-PinnedSystemTool ${variable} '${code}'`))
  assert.ok(source.includes("Assert-RegularFile $git 'observer_probe_git_missing'"))
  assert.ok(source.includes("Assert-RegularFile $inspector 'observer_probe_inspector_missing'"))
  assert.ok(source.includes("Assert-RegularFile $parserPath 'observer_probe_parser_missing'"))
})

test('observer PowerShell conditions continue before a new line', async () => {
  const source = await readFile(new URL('./postgres17_windows_trace_observer.ps1', import.meta.url), 'utf8')
  assert.equal(source.match(/\r?\n[\t ]+-(?:or|and)\b/g)?.length ?? 0, 0)
})

test('observer uses the fixed checkout Git location without PATH or fallback discovery', async () => {
  const source = await readFile(new URL('./postgres17_windows_trace_observer.ps1', import.meta.url), 'utf8')
  const assignments = [...source.matchAll(/^[\t ]*\$git[\t ]*=[\t ]*(.+)$/gm)].map((match) => match[1])
  assert.deepEqual(assignments, [String.raw`'C:\Program Files\Git\bin\git.exe'`])
  assert.match(source, /Assert-RegularFile \$git 'observer_probe_git_missing'/)
  assert.ok(source.indexOf("Assert-RegularFile $git 'observer_probe_git_missing'")
    < source.indexOf('$head = (& $git -C $root rev-parse HEAD)'))
  assert.doesNotMatch(source, /C:\\Program Files\\Git\\cmd\\git\.exe/i)
  assert.doesNotMatch(source, /(?:Get-Command|where(?:\.exe)?)\s+git(?:\.exe)?\b|\$env:PATH\b/i)
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

test('loss summary diagnostic uses fixed shapes, never counter values', () => {
  const zero = 'Events Lost: 0\r\nBuffers Lost: 0\r\n'
  const nonzero = 'Events Lost: 8\r\nBuffers Lost: 3\r\n'
  assert.equal(lossCounterLineShapes(zero),
    'v2;candidateLines=2;patterns=BLFCD:1,ELFCD:1')
  assert.equal(lossCounterLineShapes(nonzero), lossCounterLineShapes(zero))
  assert.equal(lossCounterLineShapes('Lost Events = 7\nLost Buffers = 2'),
    'v2;candidateLines=2;patterns=BLRQD:1,ELRQD:1')
  assert.equal(lossCounterLineShapes('Trace summary\nNo counters here'),
    'v2;candidateLines=0;patterns=none')
  assert.equal(lossCounterLineShapes('Events Lost: ???\n'),
    'v2;candidateLines=1;patterns=ELFCN:1')
  assert.equal(lossCounterLineShapes(`Events Lost: ${'x'.repeat(513)}`),
    'v2;candidateLines=1;patterns=UUUUN:1')
  assert.equal(lossCounterLineShapes(`${Array(10).fill('Event 123').join('\n')}\nBuffers Lost: 0`),
    'v2;candidateLines=9plus;patterns=BLFCD:1,EUUSD:9plus')
  assert.equal(lossCounterLineShapes('EventsLost: 0\nEvents Lost: 9\nBuffersLost: 0'),
    lossCounterLineShapes('EventsLost: 9\nEvents Lost: 0\nBuffersLost: 9'))
  assert.throws(() => lossCounterLineShapes('x'.repeat(65537)),
    /observer_probe_loss_summary_unsafe/)
  assert.throws(() => lossCounterLineShapes('Events Lost: 0\0secret'),
    /observer_probe_loss_summary_unsafe/)
})

test('loss proof refuses competing labels even beside supported zero counters', () => {
  const zero = 'Events Lost: 0\nBuffersLost=0\n'
  assert.equal(lossSummaryStatus(zero), 'zero')
  assert.equal(lossSummaryStatus('<EventsLost>0</EventsLost>\n<BuffersLost>0</BuffersLost>'), 'zero')
  assert.equal(lossSummaryStatus('Events Lost: 1\nBuffersLost=0'), 'nonzero')
  for (const summary of [
    'Events Lost: 0\nLost Events: 5\nBuffersLost=0',
    'Events Lost: 0\nLost 5 Events\nBuffersLost=0',
    'Events Lost: 0\nBuffersLost=0\nLost\nEvents: 5',
    'Events Lost: 0\nEvents Dropped: 5\nBuffersLost=0',
    'Events Lost: 0\nEvents 5 dropped\nBuffersLost=0',
    'Events Lost: 0\nEvents Lost: 9\nBuffersLost=0',
    'Events Lost: 0\nEventsLost=0\nBuffersLost=0',
    '<EventsLost>0</EventsLost>\n<EventsLost>9</EventsLost>\n<BuffersLost>0</BuffersLost>',
    'Events Lost: 0\nBuffers Lost: 0\nLost Buffers: 4',
    'Events Lost: 0\nBuffersLost=0\n<BuffersLoss>4</BuffersLoss>',
    'Events Lost: 0\nBuffersLost=0\n<EventsLost Value="4"/>',
    'Events Lost: 0\nBuffersLost=0\nEvents Lost: ???',
    'Events Lost: 0\nBuffers Lost: ???',
    'Events Lost: 0\nBuffersLost=0\nLoss summary is unknown',
  ]) assert.equal(lossSummaryStatus(summary), 'unavailable', summary)
  assert.equal(lossSummaryStatus('no loss counters here'), 'unavailable')
})

const headerGuid = '{68fdd900-4a3e-11d1-84f4-0000f80464e3}'
const headerEvent = (guid = headerGuid, task = 'EventTrace_Header', end =
  '<Data Name="EndTime">2026-11-20T00:00:00Z</Data>') =>
  `<Event><System><Provider Guid="${guid}"/><Task Name="${task}"/></System>`
  + `<EventData><Data Name="EventsLost">0</Data><Data Name="BuffersLost">0</Data>`
  + `${end}</EventData></Event>`
const headerTrace = (event = headerEvent()) => `<Events>${event}</Events>`

test('bounded first-event prefix reports shape but never loss proof', () => {
  const exact = 'prefixEvent=complete;prefixTyped=1;prefixTypeSite=task;prefixGuid=1;'
    + 'prefixJoint=1;prefixProvider=match;prefixEnd=iso;prefixFields=both'
  assert.equal(eventTraceHeaderPrefixShape(headerTrace()), exact)
  assert.equal(eventTraceHeaderPrefixShape(headerTrace(headerEvent().replace(
    '<Data Name="EventsLost">0</Data>', '<Data Name="EventsLost">9</Data>'))), exact)
  assert.match(eventTraceHeaderPrefixShape('<Events>'), /^prefixEvent=not_in_prefix;/)
  assert.match(eventTraceHeaderPrefixShape('<Events><Event><System>'), /^prefixEvent=truncated;/)
  assert.match(eventTraceHeaderPrefixShape('<!DOCTYPE Events>' + headerTrace()),
    /^prefixEvent=unsafe;/)
  assert.equal(lossSummaryStatus('Events Lost: 0\nBuffers reported: 0'), 'unavailable')
})

test('XML header diagnostic requires one explicit type and matching GUID in the same event', () => {
  const expected = 'headerTyped=1;typeSite=task;headerGuid=1;headerJoint=1;provider=match;end=iso;fields=both'
  assert.equal(eventTraceHeaderShape(headerTrace()), expected)
  assert.equal(eventTraceHeaderShape(headerTrace(headerEvent().replace(
    '<Data Name="EventsLost">0</Data>', '<Data Name="EventsLost">77</Data>'))), expected)
  assert.equal(eventTraceHeaderShape(headerTrace(headerEvent('{00000000-0000-0000-0000-000000000000}'))),
    'headerTyped=1;typeSite=task;headerGuid=0;headerJoint=0;provider=other;end=unbound;fields=unbound')
  assert.equal(eventTraceHeaderShape(headerTrace(headerEvent().replace(
    `<Provider Guid="${headerGuid}"/>`, '<Provider/>'))),
    'headerTyped=1;typeSite=task;headerGuid=0;headerJoint=0;provider=missing;end=unbound;fields=unbound')
  assert.equal(eventTraceHeaderShape(headerTrace(headerEvent().replace(
    `<Provider Guid="${headerGuid}"/>`,
    `<Provider Guid="${headerGuid}"/><Provider Guid="{00000000-0000-0000-0000-000000000000}"/>`))),
    'headerTyped=1;typeSite=task;headerGuid=1;headerJoint=0;provider=ambiguous;end=unbound;fields=unbound')
  assert.equal(eventTraceHeaderShape(headerTrace(headerEvent(headerGuid, 'Process'))),
    'headerTyped=0;typeSite=unbound;headerGuid=1;headerJoint=0;provider=unbound;end=iso;fields=both')
  assert.equal(eventTraceHeaderShape(headerTrace(headerEvent().replace(
    '<Task Name="EventTrace_Header"/>', '<EventID>0</EventID>'))),
    'headerTyped=0;typeSite=unbound;headerGuid=1;headerJoint=0;provider=unbound;end=iso;fields=both')
  assert.equal(eventTraceHeaderShape(headerTrace(headerEvent()
    .replace('<Event>', '<Event Type="EventTrace_Header">')
    .replace('<Task Name="EventTrace_Header"/>', '<Task/>'))),
    'headerTyped=1;typeSite=type;headerGuid=1;headerJoint=1;provider=match;end=iso;fields=both')
  assert.equal(eventTraceHeaderShape(headerTrace(headerEvent().replace(
    '<Task Name="EventTrace_Header"/>', '<Type>EventTrace_Header</Type>'))),
    'headerTyped=1;typeSite=type;headerGuid=1;headerJoint=1;provider=match;end=iso;fields=both')
  assert.equal(eventTraceHeaderShape(headerTrace(headerEvent().replace(
    '<Task Name="EventTrace_Header"/>', '<Task Name="EventTrace_Header" Value="Process"/>'))),
    'headerTyped=2plus;typeSite=ambiguous;headerGuid=1;headerJoint=0;provider=unbound;end=iso;fields=both')
  assert.equal(eventTraceHeaderShape(headerTrace(headerEvent()
    .replace('<Task Name="EventTrace_Header"/>', '<Task/>')
    .replace('</EventData>', '<Data Name="EventTrace_Header">opaque</Data></EventData>'))),
    'headerTyped=1;typeSite=other;headerGuid=1;headerJoint=1;provider=match;end=iso;fields=both')
  assert.equal(eventTraceHeaderShape(headerTrace(headerEvent()
    .replace('<Task Name="EventTrace_Header"/>',
      '<Task Name="EventTrace_Header"/><Task Name="EventTrace_Header"/>'))),
  'headerTyped=2plus;typeSite=ambiguous;headerGuid=1;headerJoint=0;provider=unbound;end=iso;fields=both')
  assert.equal(eventTraceHeaderShape(headerTrace(headerEvent()
    .replace('<Task Name="EventTrace_Header"/>',
      '<Task Name="EventTrace_Header">Process</Task>'))),
  'headerTyped=2plus;typeSite=ambiguous;headerGuid=1;headerJoint=0;provider=unbound;end=iso;fields=both')
  assert.equal(eventTraceHeaderShape(headerTrace(headerEvent() + headerEvent())),
    'headerTyped=2plus;typeSite=ambiguous;headerGuid=2plus;headerJoint=2plus;provider=unbound;end=unbound;fields=unbound')
  assert.equal(eventTraceHeaderShape(headerTrace(headerEvent(headerGuid, 'Process')
    + headerEvent('{00000000-0000-0000-0000-000000000000}'))),
  'headerTyped=1;typeSite=task;headerGuid=1;headerJoint=0;provider=other;end=iso;fields=both')
})

test('XML header diagnostic classifies EndTime and counter field shape without values', () => {
  assert.equal(eventTraceHeaderShape(headerTrace(headerEvent(headerGuid,
    'EventTrace_Header', ''))),
  'headerTyped=1;typeSite=task;headerGuid=1;headerJoint=1;provider=match;end=missing;fields=both')
  assert.equal(eventTraceHeaderShape(headerTrace(headerEvent(headerGuid,
    'EventTrace_Header', '<Data Name="EndTime">0</Data>'))),
  'headerTyped=1;typeSite=task;headerGuid=1;headerJoint=1;provider=match;end=zero;fields=both')
  assert.equal(eventTraceHeaderShape(headerTrace(headerEvent(headerGuid,
    'EventTrace_Header', '<Data Name="EndTime">123456</Data>'))),
  'headerTyped=1;typeSite=task;headerGuid=1;headerJoint=1;provider=match;end=decimal;fields=both')
  assert.equal(eventTraceHeaderShape(headerTrace(headerEvent(headerGuid,
    'EventTrace_Header', '<Data Name="EndTime">nonsense</Data>'))),
  'headerTyped=1;typeSite=task;headerGuid=1;headerJoint=1;provider=match;end=other;fields=both')
  assert.equal(eventTraceHeaderShape(headerTrace(headerEvent(headerGuid,
    'EventTrace_Header', '<Data Name="EndTime">1</Data><Data Name="EndTime">2</Data>'))),
  'headerTyped=1;typeSite=task;headerGuid=1;headerJoint=1;provider=match;end=ambiguous;fields=both')
  assert.equal(eventTraceHeaderShape(headerTrace(headerEvent(headerGuid,
    'EventTrace_Header', '<Data Name="EndTime" Value="1">2</Data>'))),
  'headerTyped=1;typeSite=task;headerGuid=1;headerJoint=1;provider=match;end=ambiguous;fields=both')
  assert.equal(eventTraceHeaderShape(headerTrace(headerEvent().replace(
    '<Data Name="BuffersLost">0</Data>', ''))),
  'headerTyped=1;typeSite=task;headerGuid=1;headerJoint=1;provider=match;end=iso;fields=events')
  assert.equal(eventTraceHeaderShape(headerTrace(headerEvent().replace(
    '<Data Name="BuffersLost">0</Data>', '<Data Name="BuffersLost">0</Data><Data Name="BuffersLost">0</Data>'))),
  'headerTyped=1;typeSite=task;headerGuid=1;headerJoint=1;provider=match;end=iso;fields=ambiguous')
  assert.equal(eventTraceHeaderShape(headerTrace(
    `<Event><System><Provider Guid="${headerGuid}"/><Task Name="EventTrace_Header"/></System>`
    + `<Payload>${headerEvent('{00000000-0000-0000-0000-000000000000}', 'Process')}</Payload></Event>`)),
  'headerTyped=1;typeSite=task;headerGuid=1;headerJoint=1;provider=match;end=missing;fields=none')
  assert.throws(() => eventTraceHeaderShape('<!DOCTYPE Events><Events/>'), /xml_unsafe/)
  assert.throws(() => eventTraceHeaderShape('<Events>'), /xml_invalid/)
})

const unboundPrefix = (state) => `prefixEvent=${state};prefixTyped=invalid;prefixTypeSite=unbound;`
  + 'prefixGuid=invalid;prefixJoint=invalid;prefixProvider=unbound;prefixEnd=unbound;prefixFields=unbound;'
const unboundHeader = 'headerTyped=invalid;typeSite=unbound;headerGuid=invalid;'
  + 'headerJoint=invalid;provider=unbound;end=unbound;fields=unbound'

test('loss and header diagnostic CLI emits fixed shapes, no source text or secret-like input', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'supermega-loss-shape-'))
  try {
    const summaryPath = join(directory, 'summary.txt')
    const xmlPath = join(directory, 'trace.xml')
    await writeFile(summaryPath,
      'Events Lost: 0 C:\\Users\\Private\\secret-file password=do-not-print\n'
      + 'Buffers Lost: 0\n')
    await writeFile(xmlPath, headerTrace(headerEvent()
      .replace('</EventData>', '<Data Name="Private">sensitive-merchant-data</Data></EventData>')))
    const result = spawnSync(process.execPath, [
      fileURLToPath(new URL('./postgres17_windows_trace_parser.mjs', import.meta.url)),
      '--loss-header-shape', summaryPath, xmlPath,
    ], { encoding: 'utf8' })
    assert.equal(result.status, 0)
    assert.equal(result.stderr, '')
    assert.equal(result.stdout.trim(),
      'v4;summaryInput=bounded;candidateLines=2;patterns=BLFCD:1,ELFCD:1;xmlInput=bounded;xmlSizeBand=within64;'
      + unboundPrefix('not_needed')
      + 'headerTyped=1;typeSite=task;headerGuid=1;headerJoint=1;provider=match;end=iso;fields=both')
    assert.doesNotMatch(result.stdout, /Private|secret|password|Users|merchant|[A-Z]:\\/i)
    await writeFile(xmlPath, '<Events>')
    const malformed = spawnSync(process.execPath, [
      fileURLToPath(new URL('./postgres17_windows_trace_parser.mjs', import.meta.url)),
      '--loss-header-shape', summaryPath, xmlPath,
    ], { encoding: 'utf8' })
    assert.equal(malformed.status, 0)
    assert.equal(malformed.stderr, '')
    assert.equal(malformed.stdout.trim(),
      'v4;summaryInput=bounded;candidateLines=2;patterns=BLFCD:1,ELFCD:1;xmlInput=bounded;xmlSizeBand=within64;'
      + unboundPrefix('not_needed') + unboundHeader)

    await rm(xmlPath)
    const missingXml = spawnSync(process.execPath, [
      fileURLToPath(new URL('./postgres17_windows_trace_parser.mjs', import.meta.url)),
      '--loss-header-shape', summaryPath, xmlPath,
    ], { encoding: 'utf8' })
    assert.equal(missingXml.status, 0)
    assert.equal(missingXml.stderr, '')
    assert.equal(missingXml.stdout.trim(),
      'v4;summaryInput=bounded;candidateLines=2;patterns=BLFCD:1,ELFCD:1;xmlInput=missing;xmlSizeBand=unbound;'
      + unboundPrefix('not_needed') + unboundHeader)

    const oversized = await open(xmlPath, 'w')
    try { await oversized.truncate(64 * 1024 * 1024 + 1) }
    finally { await oversized.close() }
    const oversizedXml = spawnSync(process.execPath, [
      fileURLToPath(new URL('./postgres17_windows_trace_parser.mjs', import.meta.url)),
      '--loss-header-shape', summaryPath, xmlPath,
    ], { encoding: 'utf8' })
    assert.equal(oversizedXml.status, 0)
    assert.equal(oversizedXml.stderr, '')
    assert.equal(oversizedXml.stdout.trim(),
      'v4;summaryInput=bounded;candidateLines=2;patterns=BLFCD:1,ELFCD:1;xmlInput=oversize;xmlSizeBand=over64to128;'
      + unboundPrefix('unsafe') + unboundHeader)
    assert.doesNotMatch(oversizedXml.stdout, /Private|secret|password|Users|merchant|[A-Z]:\\/i)

    const firstEvent = headerTrace(headerEvent().replace('</EventData>',
      '<Data Name="Private">sensitive-merchant-data</Data></EventData>'))
    const largeXml = await open(xmlPath, 'r+')
    try { await largeXml.write(Buffer.from(firstEvent), 0, Buffer.byteLength(firstEvent), 0) }
    finally { await largeXml.close() }
    const prefixShape = spawnSync(process.execPath, [
      fileURLToPath(new URL('./postgres17_windows_trace_parser.mjs', import.meta.url)),
      '--loss-header-shape', summaryPath, xmlPath,
    ], { encoding: 'utf8' })
    assert.equal(prefixShape.status, 0)
    assert.equal(prefixShape.stderr, '')
    assert.equal(prefixShape.stdout.trim(),
      'v4;summaryInput=bounded;candidateLines=2;patterns=BLFCD:1,ELFCD:1;xmlInput=oversize;xmlSizeBand=over64to128;'
      + 'prefixEvent=complete;prefixTyped=1;prefixTypeSite=task;prefixGuid=1;'
      + 'prefixJoint=1;prefixProvider=match;prefixEnd=iso;prefixFields=both;'
      + unboundHeader)
    assert.doesNotMatch(prefixShape.stdout, /Private|secret|password|Users|merchant|[A-Z]:\\|sensitive/i)

    const truncatedXml = await open(xmlPath, 'r+')
    try {
      const incomplete = Buffer.from('<Events><Event><System>')
      await truncatedXml.truncate(0)
      await truncatedXml.write(incomplete, 0, incomplete.length, 0)
      await truncatedXml.truncate(64 * 1024 * 1024 + 1)
    }
    finally { await truncatedXml.close() }
    const truncatedPrefix = spawnSync(process.execPath, [
      fileURLToPath(new URL('./postgres17_windows_trace_parser.mjs', import.meta.url)),
      '--loss-header-shape', summaryPath, xmlPath,
    ], { encoding: 'utf8' })
    assert.match(truncatedPrefix.stdout, /;prefixEvent=truncated;/)
    assert.doesNotMatch(truncatedPrefix.stdout, /sensitive|Private|merchant/i)

    await rm(summaryPath)
    const missingSummary = spawnSync(process.execPath, [
      fileURLToPath(new URL('./postgres17_windows_trace_parser.mjs', import.meta.url)),
      '--loss-header-shape', summaryPath, xmlPath,
    ], { encoding: 'utf8' })
    assert.equal(missingSummary.status, 0)
    assert.equal(missingSummary.stderr, '')
    assert.equal(missingSummary.stdout.trim(),
      'v4;summaryInput=missing;candidateLines=unbound;patterns=unbound;xmlInput=oversize;xmlSizeBand=over64to128;'
      + unboundPrefix('truncated') + unboundHeader)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('loss proof CLI returns only fixed statuses and refuses an unsupported competing label', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'supermega-loss-proof-'))
  try {
    const summaryPath = join(directory, 'summary.txt')
    const parser = fileURLToPath(new URL('./postgres17_windows_trace_parser.mjs', import.meta.url))
    for (const [source, expected] of [
      ['Events Lost: 0\nBuffers Lost: 0', 'zero'],
      ['Events Lost: 5\nBuffers Lost: 0', 'nonzero'],
      ['Events Lost: 0\nLost Events: 5\nBuffers Lost: 0', 'unavailable'],
      ['Events Lost: 0\nBuffers Lost: 0\nC:\\Users\\Private\\secret-file', 'zero'],
    ]) {
      await writeFile(summaryPath, source)
      const result = spawnSync(process.execPath, [parser, '--loss-summary-proof', summaryPath],
        { encoding: 'utf8' })
      assert.equal(result.status, 0)
      assert.equal(result.stderr, '')
      assert.equal(result.stdout, `${expected}\n`)
      assert.doesNotMatch(result.stdout, /Private|secret|Users|[A-Z]:\\/i)
    }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('missing loss counters remain fail closed after bounded shape diagnostic', async () => {
  const source = await readFile(new URL('./postgres17_windows_trace_observer.ps1', import.meta.url), 'utf8')
  const missing = source.indexOf("if ($lossProofStatus -ceq 'unavailable' -or $eventsLost -eq $null -or $buffersLost -eq $null) {")
  const proof = source.indexOf('$node $parserPath --loss-summary-proof $summaryPath')
  const diagnostic = source.indexOf('$node $parserPath --loss-header-shape $summaryPath $traceXmlPath', missing)
  const refusal = source.indexOf("Fail 'observer_probe_loss_counter_unavailable'", diagnostic)
  const zeroCheck = source.indexOf("Fail 'observer_probe_trace_loss_detected'", refusal)
  const correlation = source.indexOf('$node $parserPath $traceXmlPath', zeroCheck)
  assert.ok(proof >= 0 && missing > proof && diagnostic > missing && refusal > diagnostic
    && zeroCheck > refusal && correlation > zeroCheck)
  assert.match(source, /\$shapeLines\.Count -eq 1/)
  assert.match(source, /\$shapeLines\[0\] -cmatch '\^v4;summaryInput=/)
  assert.match(source, /Write-Warning \('observer_probe_loss_header_shape:' \+ \$shapeLines\[0\]\) -WarningAction Continue/)
  assert.match(source, /observer_probe_loss_header_shape_unavailable:parser_failed/)
  assert.match(source, /observer_probe_loss_header_shape_unavailable:format_invalid/)
  assert.match(source, /catch \{\s*Write-Warning 'observer_probe_loss_header_shape_unavailable:invocation_failed' -WarningAction Continue\s*\}/)
  assert.doesNotMatch(source, /Write-(?:Warning|Host|Output)\s+\$summaryText/)
  assert.doesNotMatch(source, /Write-(?:Warning|Host|Output)\s+\$traceXmlPath/)
  assert.match(source, /\$lossProofStatus -ceq 'unavailable' -or \$eventsLost -eq \$null/)
  assert.match(source, /\$lossProofStatus -cne 'zero' -or \$eventsLost -ne 0/)
})

test('PowerShell diagnostic gate accepts fixed input states and refuses extra text', async () => {
  const source = await readFile(new URL('./postgres17_windows_trace_observer.ps1', import.meta.url), 'utf8')
  const pattern = /\$shapeLines\[0\] -cmatch '([^']+)'/.exec(source)?.[1]
  assert.ok(pattern)
  const gate = new RegExp(pattern)
  const header = 'headerTyped=invalid;typeSite=unbound;headerGuid=invalid;headerJoint=invalid;provider=unbound;end=unbound;fields=unbound'
  assert.match(`v4;summaryInput=bounded;candidateLines=2;patterns=BLFCD:1,ELFCD:1;xmlInput=oversize;xmlSizeBand=over64to128;${unboundPrefix('not_in_prefix')}${header}`, gate)
  assert.match(`v4;summaryInput=missing;candidateLines=unbound;patterns=unbound;xmlInput=missing;xmlSizeBand=unbound;${unboundPrefix('not_needed')}${header}`, gate)
  assert.doesNotMatch(`v4;summaryInput=bounded;candidateLines=2;patterns=BLFCD:1;xmlInput=C:\\Users\\Private;xmlSizeBand=unbound;${unboundPrefix('not_needed')}${header}`, gate)
  assert.doesNotMatch(`v4;summaryInput=bounded;candidateLines=2;patterns=BLFCD:1;xmlInput=oversize;xmlSizeBand=over64to128;${unboundPrefix('not_in_prefix')}${header};raw=private`, gate)
})

test('loss proof rejects duplicate exact or alias counters before zero check', async () => {
  const source = await readFile(new URL('./postgres17_windows_trace_observer.ps1', import.meta.url), 'utf8')
  const reader = source.split('function Try-ReadLossCounter(')[1]
    ?.split('function Assert-SanitizedEvidence(')[0]
  assert.ok(reader)
  assert.match(reader, /\[Regex\]::Matches\(\$Text,/)
  assert.match(reader, /\(\$lineMatches\.Count \+ \$xmlMatches\.Count\) -ne 1/)
  assert.doesNotMatch(reader, /\[Regex\]::Match\(\$Text,/)
  assert.match(source, /Try-ReadLossCounter \$summaryText 'Events'/)
  assert.match(source, /Try-ReadLossCounter \$summaryText 'Buffers'/)
  assert.doesNotMatch(source, /Try-ReadLossCounter \$summaryText 'Events Lost'/)
})

test('probe uses fixed signed Windows tools, explicit loss checks, and no PostgreSQL path', async () => {
  const source = await readFile(new URL('./postgres17_windows_trace_observer.ps1', import.meta.url), 'utf8')
  for (const token of [
    'C:\\Windows\\System32\\wpr.exe',
    'C:\\Windows\\System32\\tracerpt.exe',
    'C:\\Windows\\System32\\cmd.exe',
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
    'parentChildCorrelationObserved',
    'exitStatusObserved',
    'fullImagePathObserved',
    'moduleEventObserved',
    'completeOrderingObserved',
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
  const pinnedProbePathCheck = source.indexOf(
    "probeExecutablePath -ne 'C:\\Windows\\System32\\where.exe'",
  )
  const basenamePattern = source.indexOf(
    '$probePattern = [System.IO.Path]::GetFileName($probeExecutable)',
  )
  assert.ok(pinnedProbePathCheck >= 0 && basenamePattern > pinnedProbePathCheck)
  assert.ok(source.includes(
    '$probeWorkingDirectory = [System.IO.Path]::GetDirectoryName($probeExecutable)',
  ))
  assert.ok(source.includes(
    String.raw`$probeCommand = ('""{0}" /Q "{1}""' -f $copiedProbePath, $probePattern)`,
  ))
  assert.ok(source.includes(
    '    -WorkingDirectory $probeWorkingDirectory `\n',
  ))
})

test('production parser accepts one stable start, image, and end lifetime', () => {
  assert.deepEqual(correlateTraceXml(validTrace(), parentImage, probeImage), {
    contract: 'supermega.windows-process-image-correlation.v2',
    processEventObserved: true,
    imageEventObserved: true,
    processEndObserved: true,
    stableProcessKeyObserved: true,
    parentChildCorrelationObserved: true,
    exitStatusObserved: true,
    fullImagePathObserved: true,
    moduleEventObserved: true,
    completeOrderingObserved: true,
  })
})

test('PowerShell bridge reads the exact production parser property names', async () => {
  const source = await readFile(new URL('./postgres17_windows_trace_observer.ps1', import.meta.url),
    'utf8')
  assert.match(source, /\$processObserved = \$correlation\.processEventObserved/)
  assert.match(source, /\$imageObserved = \$correlation\.imageEventObserved/)
  assert.doesNotMatch(source, /\$correlation\.(?:ProcessObserved|ImageObserved)/)
  const parsed = correlateTraceXml(validTrace(), parentImage, probeImage)
  assert.equal(parsed.processEventObserved, true)
  assert.equal(parsed.imageEventObserved, true)
})

test('production parser rejects process-only and image-only evidence', () => {
  assert.throws(() => correlateTraceXml(`<Events>${traceEvent({
    task: 'Process', opcode: 'Start', pid: 41,
  })}</Events>`, parentImage, probeImage), /correlation_ambiguous/)
  assert.throws(() => correlateTraceXml(`<Events>${traceEvent({
    task: 'Image', opcode: 'Load', pid: 41,
  })}</Events>`, parentImage, probeImage), /correlation_ambiguous/)
})

test('production parser rejects unrelated process and image records', () => {
  const xml = `<Events>${traceEvent({ task: 'Process', opcode: 'Start', pid: 41 })}`
    + `${traceEvent({ task: 'Image', opcode: 'Load', pid: 99,
      image: 'unrelated.exe', time: '2026-11-01T00:00:00.100Z' })}</Events>`
  assert.throws(() => correlateTraceXml(xml, parentImage, probeImage), /correlation_ambiguous/)
})

test('production parser ignores unrelated recognized events without process keys', () => {
  const background = traceEvent({
    task: 'ImageLoad', opcode: 'Load', pid: 99, key: null,
    image: 'C:\\Windows\\System32\\background.dll',
    time: '2026-11-01T00:00:00.125Z',
  })
  const noisyTrace = validTrace().replace('<Events>', `<Events>${background}`)
  assert.equal(correlateTraceXml(noisyTrace, parentImage, probeImage)
    .parentChildCorrelationObserved, true)
})

test('production parser rejects PID reuse and duplicate starts', () => {
  const xml = `<Events>${traceEvent({ task: 'Process', opcode: 'Start', pid: 41 })}`
    + `${traceEvent({ task: 'Process', opcode: 'Start', pid: 41,
      key: 'key-2', time: '2026-11-01T00:00:00.050Z' })}`
    + `${traceEvent({ task: 'Image', opcode: 'Load', pid: 41,
      key: 'key-2', time: '2026-11-01T00:00:00.100Z' })}`
    + `${traceEvent({ task: 'Process', opcode: 'End', pid: 41,
      key: 'key-2', time: '2026-11-01T00:00:00.200Z' })}</Events>`
  assert.throws(() => correlateTraceXml(xml, parentImage, probeImage), /correlation_ambiguous/)
})

test('production parser rejects missing stable key and missing end', () => {
  const missingKey = validTrace().replace('<Data Name="ProcessKey">key-child</Data>', '')
  assert.throws(() => correlateTraceXml(missingKey, parentImage, probeImage), /process_key_missing/)
  const missingEnd = validTrace().replace(
    traceEvent({ task: 'Process', opcode: 'End', pid: 41,
      exitStatus: '0', time: '2026-11-01T00:00:00.200Z' }), '')
  assert.throws(() => correlateTraceXml(missingEnd, parentImage, probeImage), /correlation_ambiguous/)
})

test('production parser rejects wrong key and end before image', () => {
  const wrongKey = validTrace().replace(
    traceEvent({ task: 'Process', opcode: 'End', pid: 41,
      exitStatus: '0', time: '2026-11-01T00:00:00.200Z' }),
    traceEvent({ task: 'Process', opcode: 'End', pid: 41, key: 'key-other',
      exitStatus: '0', time: '2026-11-01T00:00:00.200Z' }))
  assert.throws(() => correlateTraceXml(wrongKey, parentImage, probeImage), /correlation_mismatch/)
  const earlyEnd = validTrace().replace('2026-11-01T00:00:00.200Z',
    '2026-11-01T00:00:00.050Z')
  assert.throws(() => correlateTraceXml(earlyEnd, parentImage, probeImage), /correlation_mismatch/)
})

test('production parser rejects incomplete tree, exit, path, and module capability', () => {
  const wrongParent = validTrace().replace(
    '<Data Name="ParentProcessKey">key-parent</Data>',
    '<Data Name="ParentProcessKey">key-other</Data>')
  assert.throws(() => correlateTraceXml(wrongParent, parentImage, probeImage),
    /correlation_mismatch/)
  const missingExit = validTrace().replace('<Data Name="ExitStatus">0</Data>', '')
  assert.throws(() => correlateTraceXml(missingExit, parentImage, probeImage),
    /correlation_mismatch/)
  const missingModule = validTrace().replace(traceEvent({
    task: 'ImageLoad', opcode: 'Load', pid: 41, image: moduleImage,
    time: '2026-11-01T00:00:00.150Z',
  }), '')
  assert.throws(() => correlateTraceXml(missingModule, parentImage, probeImage),
    /module_event_missing/)
  const unkeyedModule = validTrace().replace(
    '<Data Name="ImageName">C:\\Windows\\System32\\kernel32.dll</Data>'
      + '<Data Name="ProcessKey">key-child</Data>',
    '<Data Name="ImageName">C:\\Windows\\System32\\kernel32.dll</Data>')
  assert.throws(() => correlateTraceXml(unkeyedModule, parentImage, probeImage),
    /process_key_missing/)
  const leafOnly = validTrace().replaceAll(probeImage, 'supermega-observer-probe.exe')
  assert.throws(() => correlateTraceXml(leafOnly, parentImage, probeImage),
    /correlation_ambiguous/)
})

test('production parser accepts padded zero exit statuses and rejects nonzero', () => {
  const padded = validTrace()
    .replace('<Data Name="ExitStatus">0</Data>', '<Data Name="ExitStatus">000</Data>')
    .replace('<Data Name="ExitStatus">0</Data>', '<Data Name="ExitStatus">0x000</Data>')
  assert.equal(correlateTraceXml(padded, parentImage, probeImage).exitStatusObserved, true)
  const nonzero = validTrace().replace(
    '<Data Name="ExitStatus">0</Data>', '<Data Name="ExitStatus">1</Data>')
  assert.throws(() => correlateTraceXml(nonzero, parentImage, probeImage),
    /exit_status_nonzero/)
})

test('production parser rejects unknown task or opcode for the probe image', () => {
  for (const changed of [
    validTrace().replace('<Task Name="ImageLoad"/>', '<Task Name="Process"/>'),
    validTrace().replace('<Opcode Name="Load"/>', '<Opcode Name="Unknown"/>'),
  ]) assert.throws(() => correlateTraceXml(changed, parentImage, probeImage), /task_opcode_unknown/)
})

test('production parser rejects DTDs and entities', () => {
  assert.throws(() => correlateTraceXml(
    '<!DOCTYPE Events [<!ENTITY x "probe">]><Events></Events>', parentImage, probeImage), /xml_unsafe/)
  assert.throws(() => correlateTraceXml(
    validTrace().replace(probeImage, '&probe;'), parentImage, probeImage), /xml_unsafe/)
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
    (value) => { value.parentChildCorrelationObserved = false },
    (value) => { value.exitStatusObserved = false },
    (value) => { value.fullImagePathObserved = false },
    (value) => { value.moduleEventObserved = false },
    (value) => { value.completeOrderingObserved = false },
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
