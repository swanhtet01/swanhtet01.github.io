import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
const require = createRequire(new URL('../showroom/package.json', import.meta.url))
const ts = require('typescript')
const source = readFileSync(new URL('../showroom/src/core/ManagedLoginPage.tsx', import.meta.url), 'utf8')
const ast = ts.createSourceFile('login.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
function handler(name, context, parsedSource = ast) {
  let found
  function visit(node) { if (ts.isFunctionDeclaration(node) && node.name?.text === name) found = node; ts.forEachChild(node, visit) }
  visit(parsedSource)
  assert.ok(found, name)
  const js = ts.transpileModule(found.getText(parsedSource), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
  return vm.runInNewContext(`${js}; ${name}`, context)
}
const event = { preventDefault() {} }
function fixture() {
  const passwords = [], busyStates = []
  const noop = () => {}
  return { passwords, busyStates, context: {
    managedReady: true, busy: false, accountRequestPending: { current: false }, directory: null, reviewReturnPath: null,
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

test('unassigned Website reviewers never enter company activation; normal signup still does', async () => {
  for (const reviewing of [true, false]) {
    const { context } = fixture(); const activation = [], notices = []
    Object.assign(context, { reviewReturnPath: reviewing ? '/website/review/synthetic' : null,
      setActivating: value => activation.push(value), setNotice: value => notices.push(value),
      signInAndDiscoverManagedWorkspaces: async () => ({ workspaces: [], email: context.email }) })
    await handler('submit', context)(event)
    assert.deepEqual(activation, [!reviewing])
    assert.match(notices.at(-1), reviewing ? /Creating a company will not unlock it/ : /claim code from your free trial/)
    if (reviewing) assert.ok(!notices.at(-1).includes(context.email))
  }
})

test('review context blocks activation, registration and account-mode creation handlers', async () => {
  const { context, busyStates } = fixture()
  Object.assign(context, { reviewReturnPath: '/website/review/synthetic', signupPolicy: {},
    createSelfServeWorkspace: () => assert.fail('review cannot create a workspace'),
    createManagedAccount: () => assert.fail('review cannot self-enroll'),
    setCreatingAccount: () => assert.fail('review cannot open registration') })
  await handler('activate', context)(event)
  await handler('requestAccount', context)(event)
  handler('chooseAccountMode', context)(true)
  assert.deepEqual(busyStates, [])
})

test('existing unassigned session follows the same reviewer recovery boundary on mount', async () => {
  let effect
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect'
      && node.arguments[0]?.getText(ast).includes('discoverManagedWorkspacesForCurrentSession')) effect = node.arguments[0]
    ts.forEachChild(node, visit)
  }
  visit(ast); assert.ok(effect)
  const js = ts.transpileModule(`const mount = ${effect.getText(ast)};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
  for (const reviewing of [true, false]) {
    const { context } = fixture(), activation = [], notices = []
    Object.assign(context, { reviewReturnPath: reviewing ? '/website/review/synthetic' : null,
      currentManagedIdentity: async () => null,
      discoverManagedWorkspacesForCurrentSession: async () => ({ workspaces: [], email: context.email }),
      setActivating: value => activation.push(value), setNotice: value => notices.push(value) })
    const cleanup = vm.runInNewContext(`${js}; mount`, context)()
    await new Promise(resolve => setImmediate(resolve))
    assert.deepEqual(activation, [!reviewing])
    assert.match(notices.at(-1), reviewing ? /will not unlock it/ : /claim code/)
    cleanup()
  }
})

const accountSource = readFileSync(new URL('../showroom/src/core/ManagedAccountPage.tsx', import.meta.url), 'utf8')
const accountAst = ts.createSourceFile('account.tsx', accountSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
for (const [name, provider] of [['requestRecovery', 'requestManagedPasswordRecovery'], ['savePassword', 'completeManagedAccountPassword'], ['chooseWorkspace', 'openWorkspace']]) {
  test(`${name} prevents rapid duplicate requests and releases its lock after failure`, async () => {
    const { context } = fixture()
    Object.assign(context, { sent: false, setup: { purpose: 'recovery' }, directory: { workspaces: [] },
      confirmation: context.password, setSent() {}, setConfirmation() {} })
    let reject, calls = 0
    context[provider] = () => { calls++; return new Promise((_, fail) => { reject = fail }) }
    const run = handler(name, context, accountAst)
    const first = run(event)
    await run(event)
    assert.equal(calls, 1)
    reject(new Error('Synthetic failure'))
    await first
    assert.equal(context.accountRequestPending.current, false)
    const retry = run(event)
    assert.equal(calls, 2)
    reject(new Error('Synthetic failure'))
    await retry
  })
  test(`${name} cannot overlap another request or use unavailable managed auth`, async () => {
    const { context, busyStates } = fixture()
    Object.assign(context, { sent: false, setup: { purpose: 'recovery' }, directory: {}, confirmation: context.password })
    context.accountRequestPending.current = true
    await handler(name, context, accountAst)(event)
    context.accountRequestPending.current = false
    context.managedReady = false
    await handler(name, context, accountAst)(event)
    assert.deepEqual(busyStates, [])
  })
}

test('recovery success remains enumeration-safe and does not claim delivery', async () => {
  const { context } = fixture()
  const notices = []
  Object.assign(context, { sent: false, setNotice: value => notices.push(value),
    setSent: value => { context.sent = value }, requestManagedPasswordRecovery: async () => {} })
  const run = handler('requestRecovery', context, accountAst)
  await run(event)
  assert.equal(context.sent, true)
  assert.equal(context.accountRequestPending.current, false)
  assert.match(notices.at(-1), /If this address is eligible/)
  assert.match(notices.at(-1), /cannot confirm email delivery/)
  context.requestManagedPasswordRecovery = () => { assert.fail('already requested') }
  await run(event)
})

test('password save keeps the lock until the assigned company finishes opening', async () => {
  const { context, passwords } = fixture()
  Object.assign(context, { sent: false, setup: { purpose: 'recovery' }, confirmation: context.password,
    setConfirmation() {}, completeManagedAccountPassword: async () => ({ workspaces: [{ workspaceId: 'one' }] }) })
  let finishOpen, signalOpen
  const opened = new Promise(resolve => { signalOpen = resolve })
  context.openWorkspace = () => new Promise(resolve => { finishOpen = resolve; signalOpen() })
  const run = handler('savePassword', context, accountAst)
  const pending = run(event)
  await opened
  assert.equal(context.accountRequestPending.current, true)
  assert.equal(passwords.at(-1), '')
  await handler('requestRecovery', context, accountAst)(event)
  finishOpen()
  await pending
  assert.equal(context.accountRequestPending.current, false)
})

test('confirmed signup and mismatched passwords cannot invoke password update', async () => {
  const { context, busyStates } = fixture()
  Object.assign(context, { setup: { purpose: 'signup' }, confirmation: context.password,
    completeManagedAccountPassword: () => assert.fail('password update not permitted') })
  await handler('savePassword', context, accountAst)(event)
  context.setup = { purpose: 'recovery' }
  context.confirmation = 'different'
  await handler('savePassword', context, accountAst)(event)
  assert.deepEqual(busyStates, [])
  assert.equal(context.accountRequestPending.current, false)
})
