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

test('command metrics stay count based and locked data is not shown as zero', async () => {
  const html = await readConsole()
  const overview = html.match(/function renderOverview\(s=\{\},locked=false\)\{[\s\S]*?\n\}/)?.[0] || ''

  assert.ok(overview)
  assert.match(overview, /const number=\(value\)=>locked\?'--'/)
  assert.match(overview, /\['Active projects',number\(active\)/)
  assert.match(overview, /\['Deposits',number\(s\.deposits&&s\.deposits\.count\)/)
  assert.match(html, /renderOverview\(\{\},true\)/)
  assert.match(html, /id="overviewStatus">owner key required<\/span>/)
  assert.doesNotMatch(overview, /pipelineUsd|mrrUsd|deposits\.usd|usd\(/)
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
