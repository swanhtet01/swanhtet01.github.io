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

test('Vercel serves the guarded workcell function before the generic API route', async () => {
  const config = JSON.parse(await readFile(new URL('./vercel.json', import.meta.url), 'utf8'))
  assert.equal(config.functions['api/workcells.mjs'].maxDuration, 45)
  const workcellRoute = config.routes.findIndex((route) => route.src === '/api/workcells')
  const catchAll = config.routes.findIndex((route) => route.src === '/api/(.*)')
  assert.ok(workcellRoute >= 0 && workcellRoute < catchAll)
  assert.deepEqual(config.crons, [{ path: '/api/brief', schedule: '30 1 * * *' }])
})
