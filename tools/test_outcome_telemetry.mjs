import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export * from './outcome-telemetry.ts'`,
    resolveDir: 'showroom/src/analytics',
    sourcefile: 'showroom/src/analytics/outcome-telemetry-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const bundleUrl = `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
const digest = (value) => `sha256:${value.toString(16).padStart(64, '0')}`

class TestCustomEvent {
  constructor(type, init = {}) {
    this.type = type
    this.detail = init.detail
  }
}
globalThis.CustomEvent = TestCustomEvent

function memoryStorage({ reject = false } = {}) {
  const values = new Map()
  return {
    getItem(key) {
      if (reject) throw new Error('storage disabled')
      return values.get(key) ?? null
    },
    setItem(key, value) {
      if (reject) throw new Error('storage disabled')
      values.set(key, String(value))
    },
  }
}

function browser(hostname, { storage = memoryStorage(), va } = {}) {
  const dispatched = []
  const target = {
    location: { hostname },
    sessionStorage: storage,
    dispatchEvent(event) {
      dispatched.push(event)
      return true
    },
  }
  if (va) target.va = va
  globalThis.window = target
  return { target, dispatched }
}

async function loadModule(label) {
  return import(`${bundleUrl}#${label}`)
}

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

// Closed input: no arbitrary product, stage, identity, route, amount, or free-text field can enter.
{
  const telemetry = await loadModule('validation')
  const valid = { pilotProduct: 'commerce', stage: 'workflow_started', evidenceDigest: digest(1) }
  check(telemetry.validOutcomeTelemetryTransition(valid), 'the exact closed transition is accepted')
  for (const invalid of [
    { ...valid, pilotProduct: 'crm' },
    { ...valid, stage: 'customer_contacted' },
    { ...valid, evidenceDigest: 'not-a-digest' },
    { ...valid, customerName: 'Private Person' },
    { ...valid, url: 'https://app.supermega.dev/shop/?customer=private' },
    { ...valid, amount: 100000 },
  ]) {
    check(!telemetry.validOutcomeTelemetryTransition(invalid), 'unknown or private-shaped input is rejected')
  }
}

// Local and preview execution keeps the authoritative local metric but creates no Vercel queue.
for (const [label, hostname] of [['localhost', 'localhost'], ['preview', 'candidate-123.vercel.app']]) {
  const telemetry = await loadModule(label)
  const { target, dispatched } = browser(hostname)
  const result = telemetry.emitOutcomeTelemetry({ pilotProduct: 'commerce', stage: 'workflow_started', evidenceDigest: digest(label.length + 10) })
  check(result.reason === 'non_production' && result.localDispatched && !result.outboundQueued, `${label} remains local only`)
  check(dispatched.length === 1 && dispatched[0].type === 'supermega:metric', `${label} dispatches one local metric`)
  check(dispatched[0].detail.product === 'shop' && dispatched[0].detail.action === 'outcome.workflow_started', `${label} local metric is coarse and allowlisted`)
  check(!('vaq' in target), `${label} creates no provider queue`)
}

// Production queues one exact event with two primitive, bounded properties and no evidence key.
{
  const telemetry = await loadModule('production')
  const { target, dispatched } = browser('app.supermega.dev')
  const transition = { pilotProduct: 'commerce', stage: 'proof_accepted', evidenceDigest: digest(30) }
  const first = telemetry.emitOutcomeTelemetry(transition)
  check(first.reason === 'queued' && first.localDispatched && first.outboundQueued, 'production queues the optional event after the local event')
  check(dispatched.length === 1, 'production dispatches one local metric')
  check(target.vaq.length === 1, 'production creates one provider queue entry')
  const [command, envelope] = target.vaq[0]
  check(command === 'event' && envelope.name === telemetry.OUTCOME_TELEMETRY_EVENT_NAME, 'event command and name are exact')
  check(Object.keys(envelope.data).sort().join(',') === 'product,stage', 'provider data has exactly two keys')
  check(Object.values(envelope.data).every((value) => ['string', 'number', 'boolean'].includes(typeof value) && String(value).length <= 255), 'provider values are primitive and bounded')
  check(envelope.data.product === 'shop' && envelope.data.stage === 'proof_accepted', 'provider values are low-cardinality allowlist members')
  check(!JSON.stringify(envelope).includes(transition.evidenceDigest), 'the local dedupe digest never enters the provider envelope')

  const duplicate = telemetry.emitOutcomeTelemetry(transition)
  check(duplicate.reason === 'duplicate' && !duplicate.localDispatched && !duplicate.outboundQueued, 'the same receipt and stage cannot emit twice')
  check(dispatched.length === 1 && target.vaq.length === 1, 'duplicate calls add neither a render metric nor provider event')
}

// A missing provider script uses the documented queue; a broken provider function never breaks the product.
{
  const telemetry = await loadModule('provider-failure')
  const { dispatched } = browser('app.supermega.dev', { va: () => { throw new Error('unsupported custom events') } })
  const result = telemetry.emitOutcomeTelemetry({ pilotProduct: 'commerce', stage: 'action_closed', evidenceDigest: digest(40) })
  check(result.reason === 'unavailable' && result.localDispatched && !result.outboundQueued, 'provider failure is swallowed after local dispatch')
  check(dispatched.length === 1, 'provider failure cannot erase the local metric')
}

// Storage rejection falls back to in-memory dedupe, and the outbound lane is hard-capped.
{
  const telemetry = await loadModule('bounds')
  const { target, dispatched } = browser('app.supermega.dev', { storage: memoryStorage({ reject: true }) })
  const transition = { pilotProduct: 'commerce', stage: 'result_reviewed', evidenceDigest: digest(50) }
  check(telemetry.emitOutcomeTelemetry(transition).outboundQueued, 'blocked session storage does not prevent the first optional event')
  check(telemetry.emitOutcomeTelemetry(transition).reason === 'duplicate', 'in-memory dedupe survives blocked session storage')

  for (let index = 0; index < telemetry.OUTCOME_TELEMETRY_MAX_PER_SESSION + 5; index += 1) {
    telemetry.emitOutcomeTelemetry({ pilotProduct: 'production', stage: 'workflow_completed', evidenceDigest: digest(100 + index) })
  }
  check(target.vaq.length === telemetry.OUTCOME_TELEMETRY_MAX_PER_SESSION, 'provider queue never exceeds the per-session cap')
  check(dispatched.length === telemetry.OUTCOME_TELEMETRY_MAX_PER_SESSION + 6, 'local evidence remains independent after the outbound cap')
}

// Wiring is confined to committed transitions, never a render/effect path, and the old research
// prohibition is explicitly superseded rather than silently contradicted.
{
  const [panel, onboarding, design] = await Promise.all([
    readFile('showroom/src/core/PilotOutcomePanel.tsx', 'utf8'),
    readFile('showroom/src/core/ProductOnboardingPage.tsx', 'utf8'),
    readFile('hq/research/analytics-design-2026-08.md', 'utf8'),
  ])
  check(panel.includes('evidenceDigest: checkpoint.checkpointDigest'), 'manual workflow start binds the committed checkpoint digest')
  check(panel.includes("'workflow_completed'") && panel.includes("'proof_accepted'") && panel.includes("'action_closed'") && panel.includes("'result_reviewed'"), 'owner acceptance emits the exact closed outcome stages')
  check(onboarding.includes('evidenceDigest: checkpoint.checkpointDigest'), 'guided workflow start binds the committed checkpoint digest')
  check(!panel.includes('useEffect(() => emitOutcomeTelemetry')
    && !onboarding.includes('useEffect(() => emitOutcomeTelemetry')
    && onboarding.indexOf('emitOutcomeTelemetry({') > onboarding.indexOf('const checkpoint = startPilotOutcome'), 'telemetry is wired after a committed transition, not from a render effect')
  check(design.includes('implementation boundary supersedes only that prohibition'), 'the local-only research boundary is explicitly superseded')
  check(design.includes('External visibility remains `not_observed`'), 'provider queueing is not claimed as external proof')
}

console.log(`outcome telemetry: ${checks} checks passed`)
