import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { createInitialWorkspace, readinessChecks } from '../showroom/src/products/website/website-model.ts'

// Render the actual Site checks JSX, not a hand-written duplicate. This tests
// its branches and escaping; it is not full-app, browser, or hosted acceptance.
const require = createRequire(new URL('../showroom/package.json', import.meta.url))
const ts = require('typescript')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const source = readFileSync(new URL('../showroom/src/products/website/WebsiteProduct.tsx', import.meta.url), 'utf8')
const start = source.indexOf('<details className="website-today-checks">')
const end = source.indexOf('</details>', start)
assert.ok(start >= 0 && end > start, 'source Site checks panel must exist')
const panel = source.slice(start, end + '</details>'.length)
const compiled = ts.transpileModule(`export function Panel({ websiteTodayMetrics, hasUnsavedChanges, failingContentChecks, showAssistedWebsitePreview }) { return (${panel}) }`, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
}).outputText
const module = { exports: {} }
runInNewContext(compiled, { exports: module.exports, require: (name) => {
  assert.equal(name, 'react/jsx-runtime', 'panel must not acquire transport or other dependencies')
  return require(name)
} })
const render = (overrides = {}) => renderToStaticMarkup(React.createElement(module.exports.Panel, {
  websiteTodayMetrics: [['Pages', '2/3 ready'], ['Readiness', '2 to fix']],
  hasUnsavedChanges: false, failingContentChecks: [], showAssistedWebsitePreview: false, ...overrides,
}))
const failingWorkspace = createInitialWorkspace()
failingWorkspace.pages[0].stage = 'draft'
const failures = readinessChecks(failingWorkspace).filter((check) => !check.id.startsWith('evidence-') && !check.passed)

test('saved failures render actual check details in an initially collapsed disclosure', () => {
  assert.ok(failures.length > 0)
  const html = render({ failingContentChecks: failures })
  assert.match(html, /<details class="website-today-checks">/)
  assert.doesNotMatch(html, /<details[^>]*\bopen\b/)
  assert.match(html, /Needs attention/)
  for (const check of failures) assert.ok(html.includes(check.detail))
  assert.equal((html.match(/<li>/g) ?? []).length, failures.length)
  assert.doesNotMatch(html, /<button|<a\b|<input|<form|have labels and ready destinations/)
})

test('draft guidance suppresses saved failures, even in assisted mode', () => {
  for (const assisted of [false, true]) {
    const html = render({ hasUnsavedChanges: true, failingContentChecks: failures, showAssistedWebsitePreview: assisted })
    assert.match(html, /Save or discard your draft/)
    assert.match(html, /These checks do not approve or publish it/)
    assert.doesNotMatch(html, /Needs attention|<li>|Request Website setup above/)
  }
})

test('assisted help appears only for saved failures; clear states do not invent work', () => {
  for (const assisted of [false, true]) {
    const clear = render({ showAssistedWebsitePreview: assisted })
    assert.doesNotMatch(clear, /Needs attention|Request Website setup above|Save or discard/)
    const failed = render({ failingContentChecks: failures, showAssistedWebsitePreview: assisted })
    assert.equal(failed.includes('You do not need to fix these yourself.'), assisted)
    assert.equal(failed.includes('Nothing is published automatically.'), assisted)
  }
})

test('check labels and details remain inert escaped text, including Myanmar and hostile markup', () => {
  const html = render({ failingContentChecks: [{ id: 'fixture', label: '<img src=x onerror=alert(1)>', detail: 'ဆိုင် <script>alert(1)</script> & review' }] })
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/)
  assert.match(html, /ဆိုင် &lt;script&gt;alert\(1\)&lt;\/script&gt; &amp; review/)
  assert.doesNotMatch(html, /<script|<img|<iframe|<a\b|<button/)
})
