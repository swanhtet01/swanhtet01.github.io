import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'

const workflow = await readFile(new URL(
  '../.github/workflows/postgres17-pr-wpr-inventory.yml', import.meta.url), 'utf8')
const observerBytes = await readFile(new URL(
  '../.github/workflows/postgres17-pr-observer-probe.yml', import.meta.url))
const observer = observerBytes.toString('utf8')
const scriptBytes = await readFile(new URL('./postgres17_wpr_capability_inventory.ps1', import.meta.url))
const script = scriptBytes.toString('utf8')
const attributes = await readFile(new URL('../.gitattributes', import.meta.url), 'utf8')
const policy = JSON.parse(await readFile(new URL(
  '../hq/research/postgres17-windows-bootstrap-policy.json', import.meta.url), 'utf8'))

const expectedGuardLines = [
  "github.event_name == 'pull_request' &&",
  "github.event.action == 'labeled' &&",
  'github.run_attempt == 1 &&',
  "github.repository == 'swanhtet01/swanhtet01.github.io' &&",
  "github.actor_id == '98728123' &&",
  'github.event.sender.id == 98728123 &&',
  'github.event.pull_request.number == 752 &&',
  "github.event.label.name == 'pg17-wpr-inventory' &&",
  "github.event.pull_request.state == 'open' &&",
  'github.event.pull_request.draft == true &&',
  'github.event.pull_request.head.repo.full_name == github.repository &&',
  'github.event.pull_request.base.repo.full_name == github.repository &&',
  "github.event.pull_request.head.ref == 'codex/postgres17-provenance-integration-20261031' &&",
  "github.event.pull_request.base.ref == 'codex/shop-main-integration-20261022'",
]

const accepted = Object.freeze({
  eventName: 'pull_request', action: 'labeled', attempt: 1,
  repository: 'swanhtet01/swanhtet01.github.io', actorId: '98728123',
  senderId: 98728123, number: 752, label: 'pg17-wpr-inventory',
  state: 'open', draft: true,
  headRepo: 'swanhtet01/swanhtet01.github.io',
  baseRepo: 'swanhtet01/swanhtet01.github.io',
  headRef: 'codex/postgres17-provenance-integration-20261031',
  baseRef: 'codex/shop-main-integration-20261022',
})

// The source guard is checked byte-for-byte below. This fixed model exercises
// the accepted/refused event matrix without running any GitHub workflow.
const inventoryAdmitted = (event) =>
  event.eventName === 'pull_request' && event.action === 'labeled' &&
  event.attempt === 1 && event.repository === accepted.repository &&
  event.actorId === accepted.actorId && event.senderId === accepted.senderId &&
  event.number === 752 && event.label === accepted.label &&
  event.state === 'open' && event.draft === true &&
  event.headRepo === event.repository && event.baseRepo === event.repository &&
  event.headRef === accepted.headRef && event.baseRef === accepted.baseRef

const observerAdmitted = (event) =>
  event.eventName === 'pull_request' && event.action === 'labeled' &&
  event.number === 752 && event.label === 'pg17-observer-probe' &&
  event.state === 'open' && event.draft === true &&
  event.headRepo === event.repository && event.baseRepo === event.repository &&
  event.headRef === accepted.headRef && event.baseRef === accepted.baseRef

test('inventory job accepts only the exact owner-scoped first-attempt label event', () => {
  assert.match(workflow, /^on:\n  pull_request:\n    types: \[labeled\]\n\npermissions:/m)
  assert.match(workflow, /^permissions:\n  contents: read$/m)
  assert.deepEqual([...workflow.matchAll(/^([a-z][a-z-]*):/gm)]
    .map((match) => match[1]), ['name', 'on', 'permissions', 'concurrency', 'jobs'])
  assert.deepEqual([...workflow.split(/^jobs:\n/m)[1].matchAll(/^  ([a-z][a-z-]*):\n/gm)]
    .map((match) => match[1]), ['inventory-only'])
  const guard = workflow.match(/^    if: >-\n((?:      .*\n)+)    runs-on:/m)
  assert.ok(guard)
  assert.deepEqual(guard[1].trimEnd().split('\n').map((line) => line.trim()), expectedGuardLines)
  assert.equal(inventoryAdmitted(accepted), true)
  assert.equal(observerAdmitted(accepted), false)

  const refused = [
    { label: 'pg17-observer-probe' }, { label: 'pg17-wpr-inventory ' },
    { label: 'unknown' }, { eventName: 'push' }, { action: 'synchronize' },
    { attempt: 2 }, { repository: 'other/repository' },
    { actorId: 'other' }, { senderId: 0 }, { number: 753 },
    { state: 'closed' }, { draft: false }, { headRepo: 'other/repository' },
    { baseRepo: 'other/repository' }, { headRef: 'other' }, { baseRef: 'main' },
  ]
  for (const change of refused) {
    const event = { ...accepted, ...change }
    assert.equal(inventoryAdmitted(event), false, JSON.stringify(change))
    // Refusing an inventory event must never fall through to the old observer.
    if (event.label !== 'pg17-observer-probe') {
      assert.equal(observerAdmitted(event), false, JSON.stringify(change))
    }
  }
  assert.equal(observerAdmitted({ ...accepted, label: 'pg17-observer-probe' }), true)
})

test('inventory workflow has only bounded metadata steps and no observer route', () => {
  assert.deepEqual([...workflow.matchAll(/^      - name: (.+)$/gm)]
    .map((match) => match[1]), [
    'Validate exact PR head',
    'Checkout exact PR head without persisted credentials',
    'Verify clean exact source',
    'Verify pinned inventory script bytes',
    'Collect pinned WPR metadata only',
    'Upload bounded inventory only',
  ])
  assert.deepEqual([...workflow.matchAll(/^        uses: (.+)$/gm)]
    .map((match) => match[1].split(' #')[0]), [
    'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1',
    'actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9',
  ])
  assert.match(workflow, /ref: \$\{\{ github\.event\.pull_request\.head\.sha \}\}/)
  assert.match(workflow, /persist-credentials: false/)
  assert.match(workflow, /if: \$\{\{ success\(\) && steps\.inventory\.outcome == 'success' \}\}/)
  assert.match(workflow, /path: \$\{\{ runner\.temp \}\}\\supermega-wpr-inventory\\wpr-capability\.json/)
  assert.doesNotMatch(workflow, /postgres17_windows_trace_observer|postgres17_windows_evidence_contract|supermega-sanitized-evidence|postgres17-observer-probe\.json|tracerpt/i)
  assert.equal((workflow.match(/postgres17_wpr_capability_inventory\.ps1 -ExactSha/g) ?? []).length, 1)
  assert.equal((workflow.match(/actions\/upload-artifact@/g) ?? []).length, 1)
})

test('metadata reader is pinned, bounded, and has no WPR execution', () => {
  const digest = createHash('sha256').update(scriptBytes).digest('hex')
  const attributeLine = 'tools/postgres17_wpr_capability_inventory.ps1 text eol=lf\n'
  assert.ok([attributeLine, attributeLine.replace('\n', '\r\n')].includes(attributes))
  assert.equal(scriptBytes.length, 6286)
  assert.equal(scriptBytes.includes(13), false)
  assert.equal(digest, '35450e9f8006147b90e08fefc137215356bdd9df1d4116a4205f6caca5058d62')
  assert.ok(workflow.includes(digest))
  const crlfBytes = Buffer.from(script.replaceAll('\n', '\r\n'), 'utf8')
  assert.equal(crlfBytes.length, 6455)
  assert.equal(createHash('sha256').update(crlfBytes).digest('hex'),
    '1d89eb64ed8c80191760be196518bb04e3d4c5f9d7c0dec4ed611897ce048142')
  const alteredBytes = Buffer.from(scriptBytes)
  alteredBytes[0] ^= 1
  const pinned = (bytes) => createHash('sha256').update(bytes).digest('hex') === digest
  assert.equal(pinned(scriptBytes), true)
  assert.equal(pinned(crlfBytes), false)
  assert.equal(pinned(alteredBytes), false)
  assert.match(workflow,
    /Write-Output \('inventory_script_observed bytes=\{0\} sha256=\{1\}' -f \[int64\]\$item\.Length, \$digest\)/)
  assert.match(workflow, /throw 'inventory_script_digest_mismatch'/)
  assert.ok(script.includes(`$wprPath = '${policy.closureObserver.capabilityProbe.wprPath}'`))
  assert.match(script, /\$maxHashBytes = 134217728/)
  assert.match(script, /if \(\$json\.Length -gt 8192\)/)
  for (const refusal of ['absent', 'nonregular', 'zero_length', 'oversize', 'changed', 'inspection_error']) {
    assert.ok(script.includes(`'${refusal}'`), refusal)
  }
  for (const flag of ['authoritative = $false', 'observerRan = $false',
    'canCapture = $false', 'canRehearse = $false']) assert.ok(script.includes(flag))
  assert.doesNotMatch(script, /(?:Start-Process|Invoke-WebRequest|Get-ChildItem|Get-Command|&\s*\$wprPath|&\s*\$tracerpt|ExecutionPolicy)/i)
})

test('existing observer source is byte-identical and has a disjoint label', () => {
  const prefix = Buffer.from(`blob ${observerBytes.length}\0`, 'utf8')
  assert.equal(createHash('sha1').update(prefix).update(observerBytes).digest('hex'),
    'a1542958d894b6ba512b906cda2c6ead109d4c58')
  assert.match(observer, /github\.event\.label\.name == 'pg17-observer-probe'/)
  assert.doesNotMatch(observer, /pg17-wpr-inventory/)
})
