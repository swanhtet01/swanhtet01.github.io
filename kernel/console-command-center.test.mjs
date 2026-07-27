import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const readConsole = () => readFile(new URL('./public/index.html', import.meta.url), 'utf8')

test('console presents one clear operator control room with secondary business tools', async () => {
  const html = await readConsole()
  const nav = html.match(/<nav[^>]*>[\s\S]*?<\/nav>/)?.[0] || ''

  assert.ok(nav)
  assert.match(html, /<title>SuperMega Operations<\/title>/)
  assert.match(html, /SuperMega <span>operations<\/span>/)
  assert.match(html, /id="ownerGate"/)
  assert.match(html, /id="ownerGateForm"/)
  assert.match(html, /Private control plane/)
  assert.match(html, /Shop and Plant users do not need this console\./)
  assert.match(html, /id="consoleShell" hidden/)
  assert.match(html, /<button data-view="overview" class="active">Command<\/button>/)
  assert.match(html, /<button data-view="company">Agent work<\/button>/)
  assert.match(html, /<button data-view="approvals">Review queue<\/button>/)
  assert.match(html, /<button data-view="workcells">Client operations<\/button>/)
  assert.match(html, /<button data-view="connectors">Data sources<\/button>/)
  assert.match(html, /<details class="nav-more" id="businessTools">/)
  assert.match(html, /<summary>Business tools<\/summary>/)
  assert.doesNotMatch(nav, />Overview<\/button>|>Company<\/button>|>Workcells<\/button>|>Approvals<\/button>|>Connectors<\/button>|>Ask<\/button>/)
})

test('command center connects the operating flow to real modules', async () => {
  const html = await readConsole()

  assert.match(html, /<h1>Command center<\/h1>/)
  assert.match(html, /from request to delegated agents, reviewed action, and proven delivery/)
  assert.match(html, /data-open-view="leads"><small>01 · Intake<\/small>/)
  assert.match(html, /data-open-view="company"><small>02 · Delegate<\/small>/)
  assert.match(html, /data-open-view="approvals"><small>03 · Review<\/small>/)
  assert.match(html, /data-open-view="pipeline"><small>04 · Deliver<\/small>/)
  assert.match(html, /const CONSOLE_VIEWS=\['overview','leads','pipeline','outreach','deal','operator','company','workcells','approvals','connectors'\]/)
  assert.match(html, /function openConsoleView\(view\)/)
  assert.match(html, /document\.querySelectorAll\('\[data-open-view\]'\)/)
  assert.doesNotMatch(html, /Roadmap, in progress/)
})

test('owner access hides the command center until the protected state accepts the key', async () => {
  const html = await readConsole()
  const overview = html.match(/function renderOverview\(s=\{\}\)\{[\s\S]*?\n\}/)?.[0] || ''

  assert.ok(overview)
  assert.match(overview, /const number=\(value\)=>Number\(value\|\|0\)\.toLocaleString\(\)/)
  assert.match(overview, /\['Active projects',number\(active\)/)
  assert.match(overview, /\['Deposits',number\(s\.deposits&&s\.deposits\.count\)/)
  assert.doesNotMatch(overview, /\blocked\b/)
  assert.match(html, /function setConsoleAccess\(unlocked,message=''\)/)
  assert.match(html, /\$\('#consoleShell'\)\.hidden=!unlocked/)
  assert.match(html, /async function validateOwnerAccess\(\)/)
  assert.match(html, /await fetch\('\/api\/state',\{credentials:'same-origin',headers:\{'x-ops-key':getOpsKey\(\)\}\}\)/)
  assert.match(html, /return \{ok:response\.ok,\.\.\.data,status:response\.status\}/)
  assert.match(html, /if\(state\.status===401\|\|state\.status===403\)/)
  assert.match(html, /The owner key was not accepted\./)
  assert.match(html, /Could not verify owner access\. Try again\./)
  assert.match(html, /if\(!consoleAccessGranted\|\|!CONSOLE_VIEWS\.includes\(view\)\)return/)
  assert.doesNotMatch(html, /function renderLockedOverview/)
  assert.doesNotMatch(overview, /pipelineUsd|mrrUsd|deposits\.usd|usd\(/)
})

test('existing AI badge reports the protected daily budget without another control', async () => {
  const html = await readConsole()
  const header = html.match(/<header>[\s\S]*?<\/header>/)?.[0] || ''
  const formatterSource = html.match(/function formatAiBudgetBadge\(r=\{\}\)\{[\s\S]*?\n\}/)?.[0] || ''
  assert.ok(formatterSource)
  const format = Function(`${formatterSource};return formatAiBudgetBadge`)()
  const budget = {
    contract: 'supermega.company-ai-budget-status.v1', available: true, readiness: 'durable', durableStoreReady: true,
    capUnits: 1000, reservedUnits: 600, attempts: 3, states: { inFlight: 1, consumed: 1, failed: 1 },
  }

  assert.equal((header.match(/id="aiBadge"/g) || []).length, 1)
  assert.doesNotMatch(header, /aiBudgetBadge|button[^>]+budget/i)
  assert.match(header, /id="aiBadge" role="status" aria-live="polite"/)
  assert.deepEqual(format({ aiConfigured: false, aiBudget: budget }), { text: 'ai: off', tone: 'off', label: 'AI provider is not configured.' })
  assert.deepEqual(format({ aiConfigured: true, aiBudget: budget }), {
    text: 'ai: 60% · 400 left', tone: 'on',
    label: 'AI is configured. 600 of 1,000 daily bulk-equivalent units reserved; 400 remaining across 3 attempts. 1 in flight, 1 consumed, 1 failed. Durable budget store ready.',
  })
  assert.equal(format({ aiConfigured: true, aiBudget: { ...budget, reservedUnits: 850 } }).tone, 'warn')
  assert.equal(format({ aiConfigured: true, aiBudget: { ...budget, reservedUnits: 1000 } }).text, 'ai: cap reached')
  assert.match(format({ aiConfigured: true, aiBudget: { ...budget, readiness: 'ephemeral', durableStoreReady: false } }).label, /Memory-only budget; hosted model calls remain blocked\./)
  assert.deepEqual(format({ aiConfigured: true, aiBudget: { available: false } }), {
    text: 'ai: blocked', tone: 'off', label: 'AI is configured, but daily budget telemetry is unavailable. Hosted model calls remain blocked.',
  })
  assert.match(html, /badge\.setAttribute\('aria-label',ai\.label\)/)
  assert.match(html, /header\{display:grid;grid-template-columns:minmax\(0,max-content\) minmax\(0,1fr\) max-content/)
  assert.match(html, /#modeBadge,#aiBadge\{min-width:0;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap\}/)
})

test('project board uses recorded MMK values and no stale inferred USD checkout', async () => {
  const html = await readConsole()

  assert.match(html, /price=Number\(p\.price_mmk\|\|0\)/)
  assert.match(html, /price\.toLocaleString\(\)\} MMK/)
  assert.match(html, /data-dep="\$\{p\.id\}">Record deposit<\/button>/)
  assert.doesNotMatch(html, /const PRICE=|data-stripepay|Stripe link|const usd=/)
})

test('command center remains touch safe and responsive', async () => {
  const html = await readConsole()

  assert.match(html, /\.nav-primary button,\.nav-more summary\{min-height:44px\}/)
  assert.match(html, /\.flow-step\{min-height:92px/)
  assert.match(html, /\.command-section-head button\{min-height:44px\}/)
  assert.match(html, /@media\(max-width:820px\)[\s\S]*?\.command-flow\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)\}/)
  assert.match(html, /\.nav-primary\{width:100%;max-width:100%;min-width:0;overflow-x:auto/)
  assert.match(html, /@media\(max-width:520px\)[\s\S]*?\.command-flow\{grid-template-columns:1fr\}/)
  assert.match(html, /\.nav-primary\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/)
  assert.match(html, /\.command-actions button\{width:100%\}/)
})
