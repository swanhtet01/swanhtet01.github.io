import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runInNewContext } from 'node:vm'

const source = readFileSync(new URL('../showroom/src/products/website/WebsiteProduct.tsx', import.meta.url), 'utf8')
const start = source.indexOf('  function downloadTrialSite() {')
const end = source.indexOf('\n  const failingContentChecks', start)
assert.ok(start >= 0 && end > start)
const handler = source.slice(start, end)

function run(failure) {
  let notice = '', clicks = 0
  const link = { click() { clicks++ }, remove() {} }
  const window = { setTimeout() {} }
  Object.defineProperty(window, 'localStorage', { get() {
    if (failure === 'storage') throw new Error('storage blocked')
    return {}
  } })
  const context = {
    window, workspace: {}, location: { pathname: '/website/', search: '' },
    requireSavedWorkspace: () => failure !== 'unsaved',
    createWebsitePreviewArtifact: value => value,
    createWebsiteHtmlDownload: () => {
      if (failure === 'export') throw new Error('invalid artifact')
      return { content: 'synthetic', mimeType: 'text/html', filename: 'preview.html' }
    },
    URL: { createObjectURL: () => 'blob:synthetic', revokeObjectURL() {} },
    Blob: class {}, document: { createElement: () => link, body: { append() {} } },
    recordBehaviorSignal() { if (failure === 'behavior') throw new Error('optional behavior failed') },
    emitMetric() { if (failure === 'metric') throw new Error('optional metric failed') },
    setNotice: value => { notice = value },
  }
  runInNewContext(handler + '\ndownloadTrialSite()', context)
  return { notice, clicks }
}

for (const failure of ['none', 'storage', 'behavior', 'metric']) {
  test(`Website download feedback survives ${failure}`, () => {
    const result = run(failure)
    assert.equal(result.clicks, 1)
    assert.match(result.notice, /preview.html downloaded/)
    assert.doesNotMatch(result.notice, /failed/)
  })
}
test('export failure does not request a download', () => {
  const result = run('export')
  assert.equal(result.clicks, 0)
  assert.match(result.notice, /failed closed/)
})
test('unsaved content still blocks download', () => {
  assert.deepEqual(run('unsaved'), { notice: '', clicks: 0 })
})
