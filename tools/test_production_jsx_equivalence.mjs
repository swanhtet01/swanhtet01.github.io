import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import test from 'node:test'

const require = createRequire(new URL('../showroom/package.json', import.meta.url))
const { transformSync } = require('esbuild')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const config = readFileSync(new URL('../showroom/vite.config.ts', import.meta.url), 'utf8')
const injection = "import { createElement as __supermegaCreateElement, Fragment as __supermegaFragment } from 'react'"
function compile(expression, classic, scope = {}) {
  const code = transformSync(`${classic ? injection : ''}\nconst result = (${expression})`, {
    loader: 'tsx', target: 'es2022', format: 'cjs', jsx: classic ? 'transform' : 'automatic',
    ...(classic ? { jsxFactory: '__supermegaCreateElement', jsxFragment: '__supermegaFragment' } : {}),
  }).code
  return runInNewContext(`${code}; result`, { require, ...scope })
}

test('production transform is explicit and development keeps automatic JSX', () => {
  assert.ok(config.includes("react({ jsxRuntime: command === 'build' ? 'classic' : 'automatic' })"))
  assert.ok(config.includes("esbuild: command === 'build' ? {"))
  assert.ok(config.includes('productionElement as __supermegaCreateElement, productionFragment as __supermegaFragment'))
  assert.ok(config.includes("resolve(projectRoot, 'src/production-jsx.ts')"))
  assert.ok(config.includes("jsxFactory: '__supermegaCreateElement'"))
  assert.ok(config.includes("jsxFragment: '__supermegaFragment'"))
  function scan(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = `${directory}/${entry.name}`
      if (entry.isDirectory()) scan(path)
      else if (/\.[jt]sx?$/.test(path)) assert.doesNotMatch(readFileSync(path, 'utf8'), /\b__supermega(?:CreateElement|Fragment)\b/, `Reserved JSX alias collision: ${path}`)
    }
  }
  scan(new URL('../showroom/src', import.meta.url).pathname.replace(/^\/([A-Z]:)/i, '$1'))
})

test('production adapter exports exact React identities without a wrapper', () => {
  const source = readFileSync(new URL('../showroom/src/production-jsx.ts', import.meta.url), 'utf8')
  const code = transformSync(source, { loader: 'ts', target: 'es2022', format: 'cjs' }).code
  const module = { exports: {} }
  runInNewContext(code, { require, module, exports: module.exports })
  assert.equal(module.exports.productionElement, React.createElement)
  assert.equal(module.exports.productionFragment, React.Fragment)
})

const fixtures = [
  '<><h1>မြန်မာ &amp; Shop</h1><p>{text}</p></>',
  '<label>Quantity<input type="number" min="0" step="0.01" value="12.50" disabled={disabled} onChange={onChange}/></label>',
  '<select value="b" onChange={onChange}><option value="a">One</option><option value="b">Two</option></select>',
  '<ul>{items.map(item => <li key={item.id}>{item.name}</li>)}</ul>',
  '<button {...spread} title="last" type="button" onClick={onClick}>Continue</button>',
  '<section>{false}{null}{0}{undefined}<span aria-hidden="true">Status</span></section>',
  '<div children="fallback">Explicit child</div>',
  '<div {...{children:"spread child",title:"metadata"}}/>',
]
test('automatic and compact transforms render identical HTML in enabled/disabled states', () => {
  for (const disabled of [false, true]) for (const fixture of fixtures) {
    const scope = { disabled, text: '<script>plain text only</script>', onChange() {}, onClick() {},
      items: [{ id: 'a', name: 'မြန်မာ' }, { id: 'b', name: 'Second' }], spread: { title: 'first', 'aria-label': 'Continue setup' } }
    assert.equal(renderToStaticMarkup(compile(fixture, true, scope)), renderToStaticMarkup(compile(fixture, false, scope)))
  }
})

test('keys, refs, callback identity and spread precedence are retained', () => {
  const ref = React.createRef(), onClick = () => {}, onChange = () => {}
  for (const expression of ['<input key="exact" ref={ref} value="" onChange={onChange}/>', '<button {...spread} key="explicit" ref={ref} onClick={onClick}>Go</button>', '<button key="before" {...spread} onClick={onClick}/>']) {
    const scope = { ref, onClick, onChange, spread: { key: 'spread', title: 'Title' } }
    const a = compile(expression, false, scope), b = compile(expression, true, scope)
    assert.equal(b.type, a.type); assert.equal(b.key, a.key)
    assert.deepEqual(Object.keys(b.props).sort(), Object.keys(a.props).sort())
    for (const key of Object.keys(a.props)) assert.equal(b.props[key], a.props[key], key)
  }
})
