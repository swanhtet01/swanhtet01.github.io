import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
const require = createRequire(new URL('../showroom/package.json', import.meta.url))
const ts = require('typescript')
const source = readFileSync(new URL('../showroom/src/core/ManagedLoginPage.tsx', import.meta.url), 'utf8')
const ast = ts.createSourceFile('login.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
function handler(name, context) {
  let found
  function visit(node) { if (ts.isFunctionDeclaration(node) && node.name?.text === name) found = node; ts.forEachChild(node, visit) }
  visit(ast)
  assert.ok(found, name)
  const js = ts.transpileModule(found.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
  return vm.runInNewContext(`${js}; ${name}`, context)
}
const event = { preventDefault() {} }
function fixture() {
  const passwords = [], busyStates = []
  const noop = () => {}
  return { passwords, busyStates, context: {
    managedReady: true, busy: false, accountRequestPending: { current: false }, directory: null,
    email: 'synthetic@example.invalid', password: ['synthetic', 'test', 'input'].join('-'), workspaceId: '', existingIdentity: { workspaceId: 'one' },
    setBusy: value => busyStates.push(value), setPassword: value => passwords.push(value), setNoticeTone: noop, setNotice: noop,
    setActivating: noop, setDirectory: noop, setWorkspaceId: noop, setExistingIdentity: noop, setEmail: noop,
    setClaimCodeFieldError: noop, window: { localStorage: {} }, readTrialSignup: () => null,
    trialSignupProductChoice: () => ({ id: 'shop' }), productIntent: 'shop', claimCode: 'synthetic', businessName: 'Synthetic',
    openWorkspace: async () => {}, alternateManagedWorkspaceId: () => null,
  } }
}
test('actual sign-in handler ignores duplicate submit before rendered busy state changes', async () => {
  const { context, passwords } = fixture()
  let resolve, calls = 0
  context.signInAndDiscoverManagedWorkspaces = () => { calls++; return new Promise(done => { resolve = done }) }
  const submit = handler('submit', context)
  const first = submit(event)
  await submit(event)
  assert.equal(calls, 1)
  resolve({ workspaces: [], email: 'synthetic@example.invalid' })
  await first
  assert.equal(context.accountRequestPending.current, false)
  assert.equal(passwords.at(-1), '')
})
test('failed sign-in clears the password and permits a later deliberate attempt', async () => {
  const { context, passwords } = fixture()
  let calls = 0
  context.signInAndDiscoverManagedWorkspaces = async () => { calls++; throw new Error('Synthetic failure') }
  const submit = handler('submit', context)
  await submit(event); await submit(event)
  assert.equal(calls, 2)
  assert.equal(context.accountRequestPending.current, false)
  assert.deepEqual(passwords, ['', ''])
})
test('sign-in, activation, switching and sign-out cannot overlap an existing account request', async () => {
  const { context, busyStates } = fixture()
  context.accountRequestPending.current = true
  for (const name of ['submit', 'activate', 'chooseAnotherCompany', 'signOut']) await handler(name, context)(event)
  assert.deepEqual(busyStates, [])
})
test('activation retains the lock through company discovery and releases after failure', async () => {
  const { context } = fixture()
  let resolve, calls = 0
  context.createSelfServeWorkspace = () => { calls++; return new Promise(done => { resolve = done }) }
  context.discoverManagedWorkspacesForCurrentSession = async () => { throw new Error('Synthetic discovery failure') }
  const activate = handler('activate', context)
  const first = activate(event); await activate(event)
  assert.equal(calls, 1)
  resolve({ created: true, label: 'Synthetic', workspaceId: 'one' })
  await first
  assert.equal(context.accountRequestPending.current, false)
})
test('unavailable managed runtime never starts sign-in or activation', async () => {
  const { context, busyStates } = fixture()
  context.managedReady = false
  await handler('submit', context)(event); await handler('activate', context)(event)
  assert.deepEqual(busyStates, [])
})
