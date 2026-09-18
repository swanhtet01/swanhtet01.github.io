import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import test from 'node:test'
import * as starter from '../showroom/src/products/website/website-starter.ts'
import * as trade from '../showroom/src/products/website/website-trade-brief.ts'

// Exercise actual component handlers with deterministic hook state. This is not
// a browser/layout test or evidence of customer usability.
const require = createRequire(new URL('../showroom/package.json', import.meta.url))
const ts = require('typescript')
const source = readFileSync(new URL('../showroom/src/products/website/WebsiteStarterSetup.tsx', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText

function harness() {
  const state = [], created = []
  let cursor = 0, tree
  const exports = {}
  runInNewContext(compiled, { exports, requestAnimationFrame: callback => callback(), require(name) {
    if (name === 'react') return {
      useState(initial) { const index = cursor++; if (!(index in state)) state[index] = typeof initial === 'function' ? initial() : initial; return [state[index], value => { state[index] = typeof value === 'function' ? value(state[index]) : value }] },
      useRef() { return { current: null } },
    }
    if (name === 'react/jsx-runtime') return require(name)
    if (name === './website-starter') return starter
    if (name === './website-trade-brief') return trade
    throw new Error('Unexpected component dependency: ' + name)
  } })
  function render() { cursor = 0; tree = exports.WebsiteStarterSetup({ onCreate: value => created.push(value), onViewSample() {} }); return tree }
  function nodes(node = tree) {
    if (Array.isArray(node)) return node.flatMap(item => nodes(item))
    if (!node || typeof node !== 'object' || !node.props) return []
    return [node, ...nodes(node.props.children ?? null)]
  }
  const find = predicate => { const found = nodes().find(predicate); assert.ok(found, 'expected rendered control'); return found }
  function click(text) { find(node => node.type === 'button' && [node.props.children].flat().join('') === text).props.onClick(); render() }
  function edit(index, name, details) {
    let fieldset = nodes().filter(node => node.type === 'fieldset')[index]
    nodes(fieldset).find(node => node.type === 'input').props.onChange({ target: { value: name } }); render()
    fieldset = nodes().filter(node => node.type === 'fieldset')[index]
    nodes(fieldset).find(node => node.type === 'textarea').props.onChange({ target: { value: details } }); render()
  }
  function submit() { find(node => node.type === 'form').props.onSubmit({ preventDefault() {} }); render() }
  render()
  return { nodes, find, click, edit, submit, created, render }
}

test('offerings are optional and ordinary name/details edits reach the brief', () => {
  const ui = harness()
  assert.equal(ui.find(node => node.type === 'details').props.open, undefined)
  ui.click('Add featured entry')
  ui.edit(0, 'လက်ဖက်ရည်', '2,000 MMK\nHot or iced')
  ui.submit()
  assert.equal(ui.created.length, 1)
  assert.equal(ui.created[0].offerings, 'လက်ဖက်ရည် | 2,000 MMK Hot or iced')
})

test('incomplete and delimiter-bearing names block creation and reveal the error', () => {
  const ui = harness()
  ui.click('Add featured entry'); ui.submit()
  assert.equal(ui.created.length, 0)
  assert.equal(ui.find(node => node.type === 'details').props.open, true)
  ui.edit(0, 'Bad | name', 'Details'); ui.submit()
  assert.equal(ui.created.length, 0)
  ui.edit(0, 'Valid name', 'Details'); ui.submit()
  assert.equal(ui.created.length, 1)
})

test('trade changes retain reviewed offering details and the fourth entry disables add', () => {
  const ui = harness()
  for (let index = 0; index < 4; index++) { ui.click('Add featured entry'); ui.edit(index, 'Entry ' + index, 'Details ' + index) }
  assert.equal(ui.find(node => node.type === 'button' && node.props.children === 'Add featured entry').props.disabled, true)
  ui.find(node => node.type === 'select').props.onChange({ target: { value: 'restaurant' } }); ui.render(); ui.submit()
  assert.equal(ui.created.length, 1)
  assert.equal(ui.created[0].offerings, [0, 1, 2, 3].map(index => `Entry ${index} | Details ${index}`).join('\n'))
})

test('removing a middle entry preserves remaining content and removing all remains optional', () => {
  const ui = harness()
  for (let index = 0; index < 3; index++) { ui.click('Add featured entry'); ui.edit(index, 'Entry ' + index, 'Details ' + index) }
  ui.click('Remove entry 2'); ui.submit()
  assert.equal(ui.created[0].offerings, 'Entry 0 | Details 0\nEntry 2 | Details 2')
  ui.click('Remove entry 1'); ui.click('Remove entry 1'); ui.submit()
  assert.equal(ui.created[1].offerings, '')
})
