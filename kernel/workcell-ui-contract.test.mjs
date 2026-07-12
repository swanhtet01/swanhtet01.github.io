import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import assert from 'node:assert/strict'

test('console exposes the configured workcell activation flow with mobile-safe controls', async () => {
  const html = await readFile(new URL('./public/index.html', import.meta.url), 'utf8')
  assert.match(html, /data-view="workcells"/)
  assert.match(html, /id="view-workcells"/)
  assert.match(html, /api\('GET','\/api\/workcells'\)/)
  assert.match(html, /api\('POST','\/api\/workcells',\{slug,deliver\}\)/)
  assert.match(html, /w\.configured\?'configured':'needs setup'/)
  assert.doesNotMatch(html, /w\.ready\?'ready'/)
  assert.match(html, /\.workcell \.wc-actions button\{min-height:44px\}/)
  assert.match(html, /\.brand\{grid-column:1\/-1;white-space:nowrap\}/)
})

test('console builds a canonical client activation plan without collecting credentials', async () => {
  const html = await readFile(new URL('./public/index.html', import.meta.url), 'utf8')
  assert.match(html, /id="activationOpen"/)
  assert.match(html, /id="activationForm"/)
  assert.match(html, /api\('POST','\/api\/workcell-plan',\{scope:\$\('#activationScope'\)\.value\.trim\(\),manifest\}\)/)
  assert.match(html, /id="activationDownloadManifest"/)
  assert.match(html, /activationPlan\.requiredSecretInputs/)
  assert.match(html, /\.activation-fields input,\.activation-fields select\{min-height:44px\}/)
  assert.match(html, /@media\(max-width:520px\)/)
  const panel = html.match(/<div class="activation" id="activationPanel"[\s\S]*?<div id="workcellGrid"/)?.[0] || ''
  assert.ok(panel)
  assert.doesNotMatch(panel, /type="password"|name="[^"]*(?:secret|token|key)/i)
})

test('Vercel serves the guarded workcell function before the generic API route', async () => {
  const config = JSON.parse(await readFile(new URL('./vercel.json', import.meta.url), 'utf8'))
  assert.equal(config.functions['api/workcells.mjs'].maxDuration, 45)
  assert.equal(config.functions['api/workcell-plan.mjs'].maxDuration, 10)
  const planRoute = config.routes.findIndex((route) => route.src === '/api/workcell-plan')
  const workcellRoute = config.routes.findIndex((route) => route.src === '/api/workcells')
  const catchAll = config.routes.findIndex((route) => route.src === '/api/(.*)')
  assert.ok(planRoute >= 0 && planRoute < catchAll)
  assert.ok(workcellRoute >= 0 && workcellRoute < catchAll)
  assert.deepEqual(config.crons, [{ path: '/api/brief', schedule: '30 1 * * *' }])
})
