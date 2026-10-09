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
const css = readFileSync(new URL('../showroom/src/products/website/website-product.css', import.meta.url), 'utf8')
const start = source.indexOf('<details className="website-today-checks">')
const end = source.indexOf('</details>', start)
assert.ok(start >= 0 && end > start, 'source Site checks panel must exist')
const panel = source.slice(start, end + '</details>'.length)
const compiled = ts.transpileModule(`export function Panel({ readinessSummary, hasUnsavedChanges, failingContentChecks, showAssistedWebsitePreview }) { return (${panel}) }`, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
}).outputText
const module = { exports: {} }
runInNewContext(compiled, { exports: module.exports, require: (name) => {
  assert.equal(name, 'react/jsx-runtime', 'panel must not acquire transport or other dependencies')
  return require(name)
} })
const render = (overrides = {}) => renderToStaticMarkup(React.createElement(module.exports.Panel, {
  readinessSummary: '2 to fix',
  hasUnsavedChanges: false, failingContentChecks: [], showAssistedWebsitePreview: false, ...overrides,
}))
const workflowStart = source.indexOf('<ol aria-label="Website workflow"')
const workflowEnd = source.indexOf('</ol>', workflowStart)
assert.ok(workflowStart >= 0 && workflowEnd > workflowStart, 'source Website workflow must exist')
const workflow = source.slice(workflowStart, workflowEnd + '</ol>'.length)
const compiledWorkflow = ts.transpileModule(`export function Workflow({ websiteWorkflowSteps }) { return (${workflow}) }`, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
}).outputText
const workflowModule = { exports: {} }
runInNewContext(compiledWorkflow, { exports: workflowModule.exports, require: (name) => {
  assert.equal(name, 'react/jsx-runtime', 'workflow must not acquire transport or other dependencies')
  return require(name)
} })
const renderWorkflow = (websiteWorkflowSteps) => renderToStaticMarkup(React.createElement(workflowModule.exports.Workflow, { websiteWorkflowSteps }))
const failingWorkspace = createInitialWorkspace()
failingWorkspace.pages[0].stage = 'draft'
const failures = readinessChecks(failingWorkspace).filter((check) => !check.id.startsWith('evidence-') && !check.passed)

test('local file readiness waits for actual page checks and keeps one visible primary action', () => {
  const expression = source.match(/const localPreviewReady = ([^\n]+)/)?.[1]
  assert.ok(expression)
  const ready = { storageMode: 'browser-local', starterAvailable: false, hasUnsavedChanges: false, contentChecksPass: true }
  assert.equal(runInNewContext(expression, ready), true)
  for (const blocked of [
    { contentChecksPass: false },
    { hasUnsavedChanges: true },
    { starterAvailable: true },
    { storageMode: 'managed' },
  ]) assert.equal(runInNewContext(expression, { ...ready, ...blocked }), false)
  assert.match(source, /content:\s*{\s*title: 'Edit page'/)
  assert.doesNotMatch(source, /website-heading-publish-action/)
  assert.ok(source.includes("localPreviewReady ? 'Ready to download' : 'After review'"))
  assert.ok(source.includes('need attention before the website file is ready.'))
  assert.match(css, /\.website-status-disclosure \{ order: 2; \}/)
  assert.match(css, /\.website-action-bar \{\s*order: 3;/)
  assert.match(css, /\.website-workspace-grid\.view-publish \{ order: 4; \}/)
})

test('manual inquiry capture is independent of website publishing readiness', () => {
  assert.ok(source.includes('For a request received by phone or in person.'))
  assert.ok(source.includes('disabled={portalViewOnly} type="submit">{portalViewOnly ? \'View only\' : \'Add to inbox\'}'))
  assert.doesNotMatch(source, /readyBuyerCtaPages/)
  assert.doesNotMatch(source, /Add a ready page with a contact action before capturing inquiries/)
})

test('brief-to-file workflow exposes one current owned step without adding actions', () => {
  const html = renderWorkflow([
    { id: 'brief', label: 'Business brief', detail: 'Complete', state: 'complete' },
    { id: 'pages', label: 'Pages', detail: '2/3 ready', state: 'current' },
    { id: 'review', label: 'Review', detail: 'After pages', state: 'waiting' },
    { id: 'file', label: 'Website file', detail: 'After review', state: 'waiting' },
  ])
  assert.match(html, /<ol aria-label="Website workflow" class="website-workflow-rail">/)
  assert.equal((html.match(/aria-current="step"/g) ?? []).length, 1)
  assert.match(html, /data-state="complete"/)
  assert.match(html, /data-state="current"/)
  assert.match(html, /data-state="waiting"/)
  assert.doesNotMatch(html, /<button|<a\b|<input|<form/)
  assert.ok(source.includes('Next owner: ${websiteTodayOwner}'))
  assert.match(css, /\.website-workflow-rail \{[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/)
})

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

test('checks show actionable failures without redundant setup or publishing copy', () => {
  for (const assisted of [false, true]) {
    const clear = render({ showAssistedWebsitePreview: assisted })
    assert.doesNotMatch(clear, /Needs attention|Request Website setup above|Save or discard/)
    const failed = render({ failingContentChecks: failures, showAssistedWebsitePreview: assisted })
    assert.equal(failed.includes('Need help with these checks? Request Website setup.'), false)
    assert.equal(failed.includes('Nothing is published automatically.'), false)
  }
})

test('check labels and details remain inert escaped text, including Myanmar and hostile markup', () => {
  const html = render({ failingContentChecks: [{ id: 'fixture', label: '<img src=x onerror=alert(1)>', detail: 'ဆိုင် <script>alert(1)</script> & review' }] })
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/)
  assert.match(html, /ဆိုင် &lt;script&gt;alert\(1\)&lt;\/script&gt; &amp; review/)
  assert.doesNotMatch(html, /<script|<img|<iframe|<a\b|<button/)
})
