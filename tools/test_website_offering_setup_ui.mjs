import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import test from 'node:test'
import * as starter from '../showroom/src/products/website/website-starter.ts'
import * as trade from '../showroom/src/products/website/website-trade-brief.ts'
import './test_website_shell_flow.mjs'

// Exercise the real starter handlers with deterministic hook state. Browser and
// hosted acceptance are separate checks.
const require = createRequire(new URL('../showroom/package.json', import.meta.url))
const ts = require('typescript')
const source = readFileSync(new URL('../showroom/src/products/website/WebsiteStarterSetup.tsx', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText

function harness({ fillBusiness = true, initialTradeId = null, initialBusinessName = null } = {}) {
  const state = [], created = []
  let cursor = 0, tree
  const exports = {}
  runInNewContext(compiled, { exports, Error, requestAnimationFrame: callback => callback(), require(name) {
    if (name === 'react') return {
      useState(initial) { const index = cursor++; if (!(index in state)) state[index] = typeof initial === 'function' ? initial() : initial; return [state[index], value => { state[index] = typeof value === 'function' ? value(state[index]) : value }] },
      useRef(initial) { const index = cursor++; if (!(index in state)) state[index] = { current: initial }; return state[index] },
    }
    if (name === 'react/jsx-runtime') return require(name)
    if (name === './website-starter') return starter
    if (name === './website-trade-brief') return trade
    throw new Error('Unexpected component dependency: ' + name)
  } })
  function render() { cursor = 0; tree = exports.WebsiteStarterSetup({ initialTradeId, initialBusinessName, onCreate: value => created.push(value) }); return tree }
  function nodes(node = tree) {
    if (Array.isArray(node)) return node.flatMap(item => nodes(item))
    if (!node || typeof node !== 'object' || !node.props) return []
    return [node, ...nodes(node.props.children ?? null)]
  }
  const find = predicate => { const found = nodes().find(predicate); assert.ok(found, 'expected rendered control'); return found }
  function setField(maxLength, value) {
    find(node => ['input', 'textarea'].includes(node.type) && node.props.maxLength === maxLength).props.onChange({ target: { value } })
    render()
  }
  function chooseTemplate(label) {
    find(node => node.type === 'button' && node.props['aria-label']?.startsWith(`${label}.`)).props.onClick()
    render()
  }
  function submit() { find(node => node.type === 'form').props.onSubmit({ preventDefault() {} }); render() }
  render()
  if (fillBusiness) {
    setField(50, 'Test Cafe')
    setField(140, 'Coffee and pastries for nearby customers')
  }
  return { nodes, find, setField, chooseTemplate, submit, created }
}

test('two essential fields block an empty site and identify the errors', () => {
  const ui = harness({ fillBusiness: false })
  ui.submit()
  assert.equal(ui.created.length, 0)
  assert.equal(ui.nodes().filter(node => node.props['aria-invalid'] === true).length, 2)
})

test('a completed short brief creates a draft without requiring optional contact', () => {
  const ui = harness()
  ui.submit()
  assert.equal(ui.created.length, 1)
  assert.equal(ui.created[0].businessName, 'Test Cafe')
  assert.equal(ui.created[0].offer, 'Coffee and pastries for nearby customers')
  assert.equal(ui.created[0].contactHref, '')
})

test('saved Shop context selects its template and business name without a dropdown', () => {
  const businessType = trade.websiteTradeBriefOptions()[0].id
  const ui = harness({ fillBusiness: false, initialTradeId: businessType, initialBusinessName: 'Connected Cafe' })
  assert.equal(ui.nodes().some(node => node.type === 'select'), false)
  ui.submit()
  assert.equal(ui.created.length, 1)
  const brief = ui.created[0]
  const expected = trade.websiteTradeBrief({ tradeId: businessType, businessName: brief.businessName, contactHref: brief.contactHref })
  assert.equal(brief.templateId, expected.templateId)
  assert.equal(brief.businessName, 'Connected Cafe')
})

test('three direct starting points are selectable without a setup dropdown', () => {
  const ui = harness()
  assert.equal(ui.nodes().filter(node => node.props['aria-pressed'] === true).length, 1)
  ui.chooseTemplate('Show products')
  ui.submit()
  assert.equal(ui.created.length, 1)
  assert.equal(ui.created[0].templateId, 'catalog-showcase')
})

test('an invalid optional contact is rejected before creating a site', () => {
  const ui = harness()
  ui.setField(160, 'javascript:alert(1)')
  ui.submit()
  assert.equal(ui.created.length, 0)
  assert.ok(ui.nodes().some(node => node.props['aria-invalid'] === true))
  ui.setField(160, 'https://example.com/contact')
  ui.submit()
  assert.equal(ui.created.length, 1)
})

test('starter stays local and avoids file-import and legacy offerings controls', () => {
  const ui = harness()
  assert.equal(ui.nodes().some(node => node.type === 'input' && node.props.type === 'file'), false)
  assert.equal(ui.nodes().some(node => node.type === 'details' || node.type === 'select'), false)
  assert.equal(ui.nodes().filter(node => node.type === 'button' && node.props.type === 'submit').length, 1)
  assert.doesNotMatch(source, /fetch\(|XMLHttpRequest|localStorage|sessionStorage/)
})
