import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import test from 'node:test'

const require = createRequire(new URL('../showroom/package.json', import.meta.url))
const ts = require('typescript'), React = require('react'), { renderToStaticMarkup } = require('react-dom/server')
const path = 'showroom/src/core/CoreApp.tsx'
const old = execFileSync('git', ['show', `a507796802f927f85731c36c8d5a82106b037c09:${path}`], { encoding: 'utf8' })
const current = readFileSync(path, 'utf8')
const parse = s => ts.createSourceFile(path, s, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
function fragments(s, previous) {
  const ast = parse(s), rows = []
  function visit(n) {
    const text = n.getText(ast)
    if (previous ? ts.isJsxElement(n) && text.startsWith('<div className="panel-head"><div><span className="core-eyebrow">') && text.endsWith('type="button">Close</button></div>')
      : ts.isJsxSelfClosingElement(n) && n.tagName.getText(ast) === 'OperationsDialogHeader') rows.push({ start: n.getStart(ast), end: n.getEnd(), text })
    ts.forEachChild(n, visit)
  }
  visit(ast); return rows
}
const before = fragments(old, true), after = fragments(current, false)
const declaration = parse(current).statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'OperationsDialogHeader')
const helper = declaration.getText(parse(current))
function evaluate(expression, context) {
  const js = ts.transpileModule(`${helper}\nconst result = (${expression});`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, module: ts.ModuleKind.None },
  }).outputText
  return runInNewContext(`${js}; result`, { React, ...context })
}
function context(finding = false) {
  const calls = []
  return { calls, scope: { scheduleDraft: { jobId: 'JOB-1' }, observedMachine: { name: 'စက် <script>plain text</script>' },
    issueMaintenanceFindingSource: finding,
    ...Object.fromEntries(['closeJobSchedule', 'closeDowntimeDialog', 'closeMaintenanceDialog', 'closeMachineObservation',
      'closeIssueDialog', 'setMaintenanceCorrectiveDraft', 'setQualityCorrectiveDraft'].map(name => [name, (...args) => calls.push([name, args])])),
  } }
}
function resolveElement(element) { return typeof element.type === 'function' ? resolveElement(element.type(element.props)) : element }
function buttons(element) {
  if (!React.isValidElement(element)) return []
  const e = resolveElement(element)
  return [...(e.type === 'button' ? [e] : []), ...React.Children.toArray(e.props.children).flatMap(buttons)]
}
test('seven headers retain exact rendered names, dynamic titles, IDs and touch dimensions', () => {
  assert.equal(before.length, 7); assert.equal(after.length, 7)
  for (const finding of [false, true]) for (let i = 0; i < before.length; i++) {
    const a = context(finding), b = context(finding)
    assert.equal(renderToStaticMarkup(evaluate(after[i].text, b.scope)), renderToStaticMarkup(evaluate(before[i].text, a.scope)))
    assert.equal(a.calls.length + b.calls.length, 0)
  }
})
test('Close invokes only the original callback and never submits a form', () => {
  for (let i = 0; i < before.length; i++) {
    const a = context(), b = context(), oldButton = buttons(evaluate(before[i].text, a.scope))[0], newButton = buttons(evaluate(after[i].text, b.scope))[0]
    assert.equal(newButton.props.type, 'button')
    oldButton.props.onClick(); newButton.props.onClick()
    assert.deepEqual(b.calls, a.calls)
    assert.equal(b.calls.length, 1)
  }
})
test('all surrounding forms, cancel handlers, focus logic and permission guards are unchanged', () => {
  function strip(s, rows, extra = []) {
    for (const r of [...rows, ...extra].sort((a, b) => b.start - a.start)) s = s.slice(0, r.start) + (rows.includes(r) ? '__HEADER__' : '') + s.slice(r.end)
    return s.replace(/\r/g, '').replace(/\n\s*\n/g, '\n')
  }
  assert.equal(strip(current, after, [{ start: declaration.getStart(), end: declaration.getEnd() }]), strip(old, before))
})
