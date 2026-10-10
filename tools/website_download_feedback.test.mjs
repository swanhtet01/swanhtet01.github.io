import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runInNewContext } from 'node:vm'

const source = readFileSync(new URL('../showroom/src/products/website/WebsiteProduct.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const start = source.indexOf('  async function downloadWebsiteFile() {')
const end = source.indexOf('\n\n  const failingContentChecks', start)
assert.ok(start >= 0 && end > start)
const handler = source.slice(start, end)

async function run(failure) {
  let notice = '', clicks = 0
  const link = { click() { clicks++ }, remove() {} }
  const window = { setTimeout() {} }
  const exportController = { current: failure === 'busy' ? new AbortController() : null }
  Object.defineProperty(window, 'localStorage', { get() {
    if (failure === 'storage') throw new Error('storage blocked')
    return {}
  } })
  const context = {
    window, workspace: {}, mediaClient: {}, imageEditing: failure === 'image-editing', exportController,
    location: { pathname: '/website/', search: '' }, AbortController,
    requireSavedWorkspace: () => failure !== 'unsaved',
    createWebsitePreviewArtifact: value => value,
    createWebsiteMediaDownload: async () => {
      if (failure === 'export') throw new Error('invalid artifact')
      if (failure === 'cancelled') exportController.current.abort()
      return { content: 'synthetic', mimeType: 'text/html', filename: 'preview.html' }
    },
    URL: { createObjectURL: () => 'blob:synthetic', revokeObjectURL() {} },
    Blob: class {}, document: { createElement: () => link, body: { append() {} } },
    recordBehaviorSignal() { if (failure === 'behavior') throw new Error('optional behavior failed') },
    emitMetric() { if (failure === 'metric') throw new Error('optional metric failed') },
    setNotice: value => { notice = value },
  }
  await runInNewContext(handler + '\ndownloadWebsiteFile()', context)
  return { notice, clicks }
}

for (const failure of ['none', 'storage', 'behavior', 'metric']) {
  test(`Website download feedback survives ${failure}`, async () => {
    const result = await run(failure)
    assert.equal(result.clicks, 1)
    assert.match(result.notice, /preview.html downloaded/)
    assert.doesNotMatch(result.notice, /failed/)
  })
}
test('export failure does not request a download', async () => {
  const result = await run('export')
  assert.equal(result.clicks, 0)
  assert.match(result.notice, /failed closed/)
})
test('unsaved content still blocks download', async () => {
  assert.deepEqual(await run('unsaved'), { notice: '', clicks: 0 })
})

for (const failure of ['busy', 'image-editing']) {
  test(`${failure} does not start another download`, async () => {
    assert.deepEqual(await run(failure), { notice: '', clicks: 0 })
  })
}

test('cancelling media preparation prevents a stale download', async () => {
  const result = await run('cancelled')
  assert.equal(result.clicks, 0)
  assert.doesNotMatch(result.notice, /downloaded|failed/)
})
