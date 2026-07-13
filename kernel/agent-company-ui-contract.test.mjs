import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const readConsole = () => readFile(new URL('./public/index.html', import.meta.url), 'utf8')

test('console exposes one plan-first Agent Company workspace', async () => {
  const html = await readConsole()
  assert.match(html, /data-view="company"/)
  assert.match(html, /id="view-company"/)
  assert.match(html, /api\('GET','\/api\/agent-company'\)/)
  assert.match(html, /api\('POST','\/api\/agent-company',\{action:'plan',\.\.\.input\}\)/)
  assert.match(html, /api\('POST','\/api\/agent-company',\{action:'run',\.\.\.companyDraft\.input\}\)/)
  assert.match(html, /I reviewed this exact client, evidence, assignments, and budget/)
  assert.match(html, /id="companyRunButton" type="button" disabled/)
  assert.match(html, /if\(companyDraft\)invalidateCompanyPlan\('Inputs changed\. Plan the cycle again\.'\)/)
  assert.match(html, /Result unavailable\. Checking again is idempotent\./)
  assert.match(html, /if\(location\.hash==='\#company'\)/)
  assert.match(html, /companyRoster=\[\]\s+invalidateCompanyPlan\(\)\s+loadProtectedState\(\)/)
})

test('Agent Company UI accepts bounded evidence but no credential or action fields', async () => {
  const html = await readConsole()
  const panel = html.match(/<section id="view-company"[\s\S]*?<section id="view-workcells"/)?.[0] || ''
  assert.ok(panel)
  assert.match(panel, /id="companyRoleBudget" type="number" min="1" max="8"/)
  assert.match(html, /data-company-check type="checkbox"/)
  assert.match(html, /data-company-evidence maxlength="12000" disabled/)
  assert.match(html, /\.company-agent:not\(\.selected\) \.company-evidence\{display:none\}/)
  assert.doesNotMatch(panel, /type="password"|name="[^"]*(?:secret|token|key)|Apply|Execute|Send/i)
  assert.doesNotMatch(html, /setInterval\(loadCompanyAgents|eval\s*\(/)
})

test('Agent Company controls remain touch-safe and collapse to one column', async () => {
  const html = await readConsole()
  assert.match(html, /\.key\{max-width:180px;min-height:44px\}/)
  assert.match(html, /nav button\{min-height:44px/)
  assert.match(html, /\.company-agent-choice\{[^}]*min-height:44px/)
  assert.match(html, /\.company-confirm\{[^}]*min-height:44px/)
  assert.match(html, /\.company-actions button\{min-height:44px\}/)
  assert.match(html, /\.company-plan-actions button\{min-height:44px\}/)
  assert.match(html, /\.company-new-cycle\{min-height:44px\}/)
  assert.match(html, /\.company-agent\{grid-template-columns:1fr\}/)
  assert.match(html, /\.company-scope\{grid-template-columns:1fr\}/)
})

test('Agent Company API route is a dedicated function before the catch-all', async () => {
  const config = JSON.parse(await readFile(new URL('./vercel.json', import.meta.url), 'utf8'))
  assert.equal(config.functions['api/agent-company.mjs'].maxDuration, 60)
  const companyRoute = config.routes.findIndex((route) => route.src === '/api/agent-company')
  const catchAll = config.routes.findIndex((route) => route.src === '/api/(.*)')
  assert.ok(companyRoute >= 0 && companyRoute < catchAll)
})

test('console inline scripts parse after Agent Company wiring', async () => {
  const html = await readConsole()
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1])
  assert.ok(scripts.length)
  for (const source of scripts) assert.doesNotThrow(() => new Function(source))
})
