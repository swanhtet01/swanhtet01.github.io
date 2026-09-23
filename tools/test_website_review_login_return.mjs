import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import * as routes from '../showroom/src/core/account-routes.ts'
import { customerWebsiteReviewLoginPath, managedLoginReviewPath } from '../showroom/src/core/account-routes.ts'

const id = '11111111-1111-4111-8111-111111111111'
test('review login round-trip retains only the canonical review ID', () => {
  const link = customerWebsiteReviewLoginPath(id)
  assert.equal(link, `/login?product=website&review=${id}`)
  assert.equal(managedLoginReviewPath(link.slice(link.indexOf('?'))), `/website/review/${id}`)
  assert.equal(managedLoginReviewPath(`?review=${id}&workspace=other&returnTo=https://example.invalid`), `/website/review/${id}`)
})
test('malformed, ambiguous and external destinations never become return paths', () => {
  for (const value of ['', 'https://example.invalid', '//example.invalid', '../settings', `${id}/`, `${id}?a=b`,
    `${id}#private`, `${id}\n`, `${id}\r`, ` ${id}`, id.toUpperCase().replace('11111111', 'AAAAAAAA'), '%2fsettings', '\\example.invalid']) {
    assert.equal(customerWebsiteReviewLoginPath(value), '/login?product=website', value)
    assert.equal(managedLoginReviewPath(`?review=${encodeURIComponent(value)}`), null, value)
  }
  assert.equal(managedLoginReviewPath(`?review=${id}&review=${id}`), null)
  assert.equal(managedLoginReviewPath('?returnTo=/website/review/' + id), null)
  assert.equal(managedLoginReviewPath(''), null)
})
test('login retains existing membership/bootstrap checks before navigation', () => {
  const source = readFileSync(new URL('../showroom/src/core/ManagedLoginPage.tsx', import.meta.url), 'utf8')
  const fn = source.slice(source.indexOf('async function openWorkspace('), source.indexOf('async function submit('))
  const membership = fn.indexOf('await completeManagedWorkspaceSignIn(signIn, selectedWorkspaceId)')
  const bootstrap = fn.indexOf('await loadManagedBootstrap(identity)')
  const navigation = fn.indexOf('navigate(portalEntryPath)')
  assert.ok(membership >= 0 && membership < bootstrap && bootstrap < navigation)
  assert.ok(source.includes('reviewReturnPath ?? managedPortalEntryPath(productIntent)'))
  const review = readFileSync(new URL('../showroom/src/products/website/WebsiteCustomerReview.tsx', import.meta.url), 'utf8')
  assert.ok(review.includes('<Link to={customerWebsiteReviewLoginPath(reviewId)}>Sign in</Link>'))
  assert.ok(!review.includes('target="_blank"'))
})

test('rendered review login offers no sample, trial activation or self-registration detour', () => {
  const require = createRequire(new URL('../showroom/package.json', import.meta.url))
  const ts = require('typescript')
  const source = readFileSync(new URL('../showroom/src/core/ManagedLoginPage.tsx', import.meta.url), 'utf8')
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText
  const elements = tree => Array.isArray(tree) ? tree.flatMap(elements) : tree && typeof tree === 'object' ? [tree, ...elements(tree.props?.children)] : []
  const text = tree => Array.isArray(tree) ? tree.map(text).join('') : tree && typeof tree === 'object' ? text(tree.props?.children) : typeof tree === 'string' ? tree : ''
  for (const ready of [true, false]) for (const reviewing of [true, false]) {
    const exports = {}
    const jsx = (type, props) => ({ type, props })
    const dependencies = {
      react: { useState: init => [typeof init === 'function' ? init() : init, () => {}], useRef: init => ({ current: init }), useEffect() {} },
      'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'fragment' },
      'react-router': { Link: 'a', useNavigate: () => () => {},
        useLocation: () => ({ search: reviewing ? `?product=website&review=${id}` : '?product=shop' }),
        useOutletContext: () => ({ status: ready ? 'enterprise' : 'checking', signupPolicy: { termsVersion: 'test' } }) },
      './CoreShell': { PageHeading: 'heading' }, './i18n-actions': { bi: value => value },
      './account-routes': routes, './managed-trial': { managedTrialAuthConfigured: () => true },
      './signup-trial': { readTrialSignup: () => null, trialSignupProductChoice: () => ({ slug: 'shop' }) },
    }
    runInNewContext(compiled, { exports, URLSearchParams, require: name => { assert.ok(name in dependencies, name); return dependencies[name] }, window: { localStorage: {} } })
    const tree = exports.ManagedLoginPage(), nodes = elements(tree), content = text(tree)
    if (reviewing) {
      assert.equal(nodes.find(node => node.type === 'heading').props.title, 'Open your prepared review.')
      assert.equal(nodes.some(node => node.type === 'a' && /^\/signup|choose=1/.test(node.props.to ?? '')), false)
      assert.equal(nodes.some(node => node.type === 'button' && ['Create an account', 'Activate my company'].includes(text(node))), false)
      assert.match(content, ready ? /existing setup conversation/ : /Review sign-in is unavailable/)
      if (ready) assert.equal(nodes.find(node => text(node) === 'Forgot password?').props.to, `/account/recovery?product=website&review=${id}`)
    } else assert.match(content, ready ? /Create an account/ : /Try a sample/)
  }
})
