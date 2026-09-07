import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import test from 'node:test'

import {
  alternateManagedWorkspaceId,
  managedAccountPath,
  managedAccountRequestUrl,
  managedPortalEntryPath,
} from '../showroom/src/core/account-routes.ts'

const productRoutes = new Map([
  ['shop', '/shop/'],
  ['commerce', '/shop/'],
  ['plant', '/plant/'],
  ['production', '/plant/'],
  ['website', '/website/'],
  ['ecommerce', '/ecommerce/'],
])

for (const [intent, expected] of productRoutes) {
  assert.equal(managedPortalEntryPath(intent), expected)
  assert.equal(managedPortalEntryPath(`  ${intent.toUpperCase()}  `), expected)
}

for (const intent of [null, '', 'guide', 'settings', 'https://example.com']) {
  assert.equal(managedPortalEntryPath(intent), '/?choose=1')
}

assert.equal(managedAccountPath('/login', 'commerce'), '/login?product=shop')
assert.equal(managedAccountPath('/account/recovery', 'production'), '/account/recovery?product=plant')
assert.match(managedAccountRequestUrl('website'), /product=website/)
assert.equal(alternateManagedWorkspaceId([
  { workspaceId: 'company-a' },
  { workspaceId: 'company-b' },
], 'company-a'), 'company-b')
assert.equal(alternateManagedWorkspaceId([{ workspaceId: 'company-a' }], 'company-a'), '')
assert.equal(alternateManagedWorkspaceId([], 'company-a'), '')

const managedLoginSource = readFileSync(new URL('../showroom/src/core/ManagedLoginPage.tsx', import.meta.url), 'utf8')
for (const required of [
  'alternateManagedWorkspaceId(signIn.workspaces, existingIdentity.workspaceId)',
  'setDirectory(signIn)',
  'await signOutManagedTrial()',
  'Switch company',
  'Sign out',
]) assert.match(managedLoginSource, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))

const coreShellSource = readFileSync(new URL('../showroom/src/core/CoreShell.tsx', import.meta.url), 'utf8')
for (const required of [
  'discoverManagedWorkspacesForCurrentSession()',
  'directory.workspaces.find((workspace) => workspace.workspaceId === selectedWorkspace)',
  "directory.userId !== identity.userId",
  'aria-label="Active company"',
  '{portalAccess.companyName}',
  '{portalAccess.accountEmail}',
  '{portalAccess.companyRole}',
  'Switch company',
]) assert.match(coreShellSource, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))

console.log(JSON.stringify({
  ok: true,
  contract: 'supermega.managed-account-routes.v1',
  checks: (productRoutes.size * 2) + 24,
  defaultEntry: managedPortalEntryPath(null),
}))

// Execute the actual Auth/callback functions, replacing only the provider module.
// No real keys, browser storage, provider or outbound network is available to this suite.
const requireShowroom = createRequire(new URL('../showroom/package.json', import.meta.url))
const { build } = await import(pathToFileURL(requireShowroom.resolve('esbuild')).href)
async function bundleAuth(configured = true) {
  const result = await build({
    stdin: { contents: "export * from './managed-trial.ts'; export { ManagedAccountPage } from './ManagedAccountPage.tsx'", resolveDir: 'showroom/src/core', loader: 'ts' },
    bundle: true, platform: 'node', format: 'esm', jsx: 'automatic',
    write: false, logLevel: 'error',
    define: { 'import.meta.env': JSON.stringify(configured ? {
      VITE_SUPABASE_URL: 'https://auth.example.invalid',
      VITE_SUPABASE_PUBLISHABLE_KEY: ['sb', 'publishable', 'synthetic-unit-test-only'].join('_'),
    } : {}) },
    plugins: [{ name: 'offline-auth', setup(builder) {
      const shells = {
        react: 'export const useEffect = fn => globalThis.__accountHarness.effects.push(fn); export const useState = init => [typeof init === "function" ? init() : init, () => {}];',
        'react/jsx-runtime': 'export const jsx = (type, props) => ({ type, props }); export const jsxs = jsx;',
        'react-router': 'export const Link = "a"; export const useOutletContext = () => globalThis.__accountHarness.runtime; export const useLocation = () => ({ pathname: "/account/setup", search: window.location.search }); export const useNavigate = () => () => { throw Error("unexpected navigation") };',
        './CoreShell': 'export const PageHeading = "header";',
      }
      builder.onResolve({ filter: /^(react|react\/jsx-runtime|react-router|\.\/CoreShell)$/ }, ({ path }) => ({ path, namespace: 'page-shell' }))
      builder.onLoad({ filter: /.*/, namespace: 'page-shell' }, ({ path }) => ({ contents: shells[path] }))
      builder.onResolve({ filter: /^@supabase\/auth-js$/ }, () => ({ path: 'auth-mock', namespace: 'offline' }))
      builder.onLoad({ filter: /.*/, namespace: 'offline' }, () => ({
        contents: 'export class AuthClient { constructor(options) { globalThis.__accountHarness.options = options; return globalThis.__accountHarness.auth } }',
      }))
    } }],
  })
  return `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString('base64')}`
}
const configuredBundle = await bundleAuth()
const unconfiguredBundle = await bundleAuth(false)
let instance = 0
const fixedUser = { id: 'account-test-user', email: 'owner@example.invalid', is_anonymous: false, email_confirmed_at: '2026-09-01T00:00:00Z' }
const fixedSession = { user: fixedUser, access_token: 'synthetic-access-only', refresh_token: 'synthetic-refresh-only' }
const signupInput = { email: ' OWNER@example.invalid ', password: 'local-test-password', confirmation: 'local-test-password', termsAccepted: true }
const openHealth = () => ({ status: 'ready', authentication: {
  self_serve_signup_open: true, supabase_user_tokens_ready: true,
  anonymous_users_allowed: false, client_asserted_roles_allowed: false,
} })
const directoryBody = (workspaces = []) => ({
  contract: 'supermega.managed_workspace_directory.v1', status: 'ready',
  external_writes_performed: false, secret_values_exposed: false, workspaces,
})
function response(body, status = 200, type = 'application/json') {
  return { ok: status === 200, status, headers: new Headers({ 'content-type': type }), json: async () => body }
}

async function withAuth(run, configured = true) {
  const calls = []
  const storage = new Map([['unrelated.demo', 'preserved']])
  const location = { origin: 'https://app.example.invalid', search: '', hash: '' }
  const state = {
    calls, storage, location, session: null, health: openHealth(), directory: directoryBody(),
    user: { ...fixedUser }, signupResult: { data: { user: null, session: null }, error: null },
    resendResult: { data: {}, error: null },
  }
  const auth = {}
  for (const name of ['getSession', 'signUp', 'resend', 'signOut', 'getUser', 'exchangeCodeForSession', 'setSession', 'resetPasswordForEmail', 'updateUser']) {
    auth[name] = async (...args) => {
      calls.push([name, ...args])
      if (state[name]) return state[name](...args)
      if (name === 'getSession') return { data: { session: state.session }, error: null }
      if (name === 'signUp') return state.signupResult
      if (name === 'resend') return state.resendResult
      if (name === 'signOut') { state.session = null; return { error: null } }
      if (name === 'getUser') return { data: { user: state.user }, error: null }
      if (name === 'exchangeCodeForSession' || name === 'setSession') {
        state.session = { ...fixedSession }
        return { data: { session: state.session }, error: null }
      }
      if (name === 'resetPasswordForEmail') return { error: null }
      throw new Error(`Unexpected provider mutation ${name}`)
    }
  }
  const replacements = {
    __accountHarness: { auth, effects: [], runtime: { status: 'checking', authReady: false } },
    window: { location, history: { state: null, replaceState(_state, _title, path) {
      calls.push(['scrub', path]); location.search = ''; location.hash = ''
    } }, localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => { calls.push(['storage-write', key]); storage.set(key, value) },
      removeItem: (key) => { calls.push(['storage-remove', key]); storage.delete(key) },
    } },
    fetch: async (url, init = {}) => {
      calls.push(['fetch', url, init])
      assert.equal(init.method ?? 'GET', 'GET', 'signup must never provision a workspace')
      if (state.fetch) return state.fetch(url, init)
      if (url === '/api/health') return response(state.health)
      if (url === '/api/trial/v1/workspaces') return response(state.directory)
      throw new Error(`Forbidden network ${url}`)
    },
  }
  const originals = new Map(Object.keys(replacements).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  for (const [key, value] of Object.entries(replacements)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value })
  try {
    const mod = await import(`${configured ? configuredBundle : unconfiguredBundle}#${++instance}`)
    state.page = replacements.__accountHarness
    await run(mod, state)
    assert.equal(storage.get('unrelated.demo'), 'preserved')
    assert.equal(calls.filter(([name]) => name === 'storage-write' || name === 'updateUser').length, 0)
  } finally {
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else delete globalThis[key]
    }
  }
}
const rejectsCode = (promise, code) => assert.rejects(promise, (error) => error.code === code)
function codeLink(state, purpose = 'signup') {
  state.location.search = `?mode=${purpose}&code=${'c'.repeat(20)}`
}

test('unconfigured/invalid input/insecure origin cannot call Auth or the network', async () => {
  await withAuth(async (mod, state) => {
    await rejectsCode(mod.createManagedAccount(signupInput), 'auth_not_configured')
    assert.equal(state.calls.length, 0)
  }, false)
  await withAuth(async (mod, state) => {
    for (const input of [{ ...signupInput, email: 'invalid' }, { ...signupInput, termsAccepted: false }, { ...signupInput, confirmation: '' }]) {
      await assert.rejects(mod.createManagedAccount(input))
    }
    state.location.origin = 'http://public.example.invalid'
    await rejectsCode(mod.resendManagedAccountConfirmation('owner@example.invalid'), 'auth_redirect_insecure')
    assert.equal(state.calls.length, 0)
  })
})

test('every signup and resend independently require exact fresh healthy default-closed flags', async () => {
  for (const change of [
    (h) => { delete h.authentication.self_serve_signup_open },
    (h) => { h.authentication.self_serve_signup_open = 'true' },
    (h) => { h.authentication.self_serve_signup_open = false },
    (h) => { h.authentication.supabase_user_tokens_ready = false },
    (h) => { h.authentication.anonymous_users_allowed = true },
    (h) => { h.authentication.client_asserted_roles_allowed = true },
    (h) => { h.status = 'error' },
  ]) await withAuth(async (mod, state) => {
    change(state.health)
    await rejectsCode(mod.createManagedAccount(signupInput), 'signup_window_closed')
    await rejectsCode(mod.resendManagedAccountConfirmation('owner@example.invalid'), 'signup_window_closed')
    assert.equal(state.calls.length, 2)
    for (const [, url, init] of state.calls) {
      assert.equal(url, '/api/health'); assert.equal(init.cache, 'no-store')
      assert.equal(init.credentials, 'omit'); assert.equal(init.redirect, 'error'); assert.ok(init.signal)
    }
  })
  for (const failed of [response(openHealth(), 503), response(openHealth(), 200, 'text/html')]) await withAuth(async (mod, state) => {
    state.fetch = async () => failed
    await rejectsCode(mod.createManagedAccount(signupInput), 'signup_window_closed')
    assert.equal(state.calls.length, 1)
  })
})

test('signup sends normalized identity only; resend uses signup type; existing identity is indistinguishable', async () => {
  for (const error of [null, { code: 'user_already_exists' }, { code: 'email_exists' }, { code: 'user_not_found' }]) await withAuth(async (mod, state) => {
    state.signupResult.error = error
    state.resendResult.error = error
    const expected = { status: 'confirmation_requested' }
    assert.deepEqual(await mod.createManagedAccount(signupInput), expected)
    const signup = state.calls.find(([name]) => name === 'signUp')[1]
    assert.deepEqual(signup, { email: 'owner@example.invalid', password: signupInput.password,
      options: { emailRedirectTo: 'https://app.example.invalid/account/setup?mode=signup' } })
    assert.deepEqual(await mod.resendManagedAccountConfirmation(' OWNER@example.invalid '), expected)
    assert.deepEqual(state.calls.find(([name]) => name === 'resend')[1], {
      type: 'signup', email: 'owner@example.invalid', options: signup.options,
    })
    state.health.authentication.self_serve_signup_open = false
    await rejectsCode(mod.resendManagedAccountConfirmation('owner@example.invalid'), 'signup_window_closed')
    assert.equal(state.calls.filter(([name]) => name === 'resend').length, 1)
  })
})

test('existing sessions and unexpected auto-confirmed signup never grant silent access', async () => {
  await withAuth(async (mod, state) => {
    state.session = fixedSession
    await rejectsCode(mod.createManagedAccount(signupInput), 'auth_existing_session')
    assert.equal(state.calls.some(([name]) => name === 'signUp' || name === 'signOut'), false)
    state.session = { ...fixedSession, user: { ...fixedUser, is_anonymous: true } }
    await rejectsCode(mod.resendManagedAccountConfirmation('owner@example.invalid'), 'auth_existing_session')
  })
  await withAuth(async (mod, state) => {
    state.signupResult.data.session = fixedSession
    await rejectsCode(mod.createManagedAccount(signupInput), 'email_confirmation_required')
    assert.deepEqual(state.calls.find(([name]) => name === 'signOut'), ['signOut', { scope: 'local' }])
    assert.equal(state.calls.some(([name, url]) => name === 'fetch' && url.includes('workspaces')), false)
  })
})

test('network/provider failures are fixed-copy, retry-free and release submission backpressure', async () => {
  await withAuth(async (mod, state) => {
    const privateError = 'sensitive-provider-detail@example.invalid'
    state.fetch = async () => { throw new Error(privateError) }
    await assert.rejects(mod.createManagedAccount(signupInput), (error) => error.code === 'account_request_failed' && !error.message.includes(privateError))
    assert.equal(state.calls.length, 1)
    state.fetch = undefined
    state.signupResult.error = { code: 'over_email_send_rate_limit', message: privateError, status: 429 }
    await rejectsCode(mod.createManagedAccount(signupInput), 'account_request_failed')
    let finish
    state.signUp = () => new Promise((resolve) => { finish = resolve })
    const pending = mod.createManagedAccount(signupInput)
    for (let i = 0; i < 20 && !finish; i++) await new Promise((resolve) => setImmediate(resolve))
    assert.ok(finish)
    await rejectsCode(mod.resendManagedAccountConfirmation('owner@example.invalid'), 'account_request_pending')
    finish({ data: { session: null }, error: null })
    assert.deepEqual(await pending, { status: 'confirmation_requested' })
  })
})

test('signup callback verifies the provider user then reads memberships without password/tenant writes', async () => {
  for (const count of [0, 1, 2]) await withAuth(async (mod, state) => {
    codeLink(state)
    state.directory = directoryBody(Array.from({ length: count }, (_, i) => ({
      workspace_id: `company-${i}`, label: `Company ${i}`, access: i ? 'operator' : 'owner',
    })))
    const first = mod.beginManagedAccountSetup()
    assert.equal(mod.beginManagedAccountSetup(), first, 'StrictMode must share one callback exchange')
    const result = await first
    assert.equal(result.purpose, 'signup'); assert.equal(result.email, fixedUser.email)
    assert.equal(result.directory.workspaces.length, count)
    assert.deepEqual(state.calls[0], ['scrub', '/account/setup'])
    assert.deepEqual(state.calls.find(([name]) => name === 'getUser'), ['getUser', fixedSession.access_token])
    const discovery = state.calls.find(([name]) => name === 'fetch')
    assert.equal(discovery[1], '/api/trial/v1/workspaces')
    assert.equal(discovery[2].headers.get('authorization'), `Bearer ${fixedSession.access_token}`)
    assert.equal(state.calls.filter(([name]) => name === 'exchangeCodeForSession').length, 1)
    assert.ok(state.calls.findIndex(([name]) => name === 'storage-remove') < state.calls.findIndex(([name]) => name === 'exchangeCodeForSession'))
    assert.equal(state.calls.some(([name]) => name === 'getSession'), false, 'a preexisting session never substitutes for a callback')
    await rejectsCode(mod.beginManagedAccountSetup(), 'account_link_invalid')
  })
})

test('implicit signup confirmation and existing invitation/recovery callback purposes remain distinct', async () => {
  for (const purpose of ['signup', 'invite', 'recovery']) await withAuth(async (mod, state) => {
    state.location.search = `?mode=${purpose}`
    state.location.hash = `#access_token=${'a'.repeat(20)}&refresh_token=${'r'.repeat(20)}&type=${purpose}&token_type=bearer&expires_in=3600`
    const result = await mod.beginManagedAccountSetup()
    assert.equal(result.purpose, purpose)
    assert.equal(state.calls.some(([name]) => name === 'getUser'), purpose === 'signup')
    assert.equal('directory' in result, purpose === 'signup')
  })
  await withAuth(async (mod, state) => {
    await mod.requestManagedPasswordRecovery('owner@example.invalid')
    assert.deepEqual(state.calls.find(([name]) => name === 'resetPasswordForEmail')[2], {
      redirectTo: 'https://app.example.invalid/account/setup?mode=recovery',
    })
  })
})

test('invalid callback grammar is scrubbed before any provider operation even without configuration', async () => {
  const code = 'c'.repeat(20)
  const cases = [
    [`?mode=bogus&code=${code}`, ''], [`?mode=signup&mode=recovery&code=${code}`, ''],
    [`?mode=signup&code=${code}`, '#type=recovery'], [`?mode=signup&code=${code}&next=/admin`, ''],
    [`?mode=signup&code=${code}`, `#access_token=${'a'.repeat(20)}&refresh_token=${'r'.repeat(20)}`],
    ['?mode=signup&error_description=private-provider-text', ''], ['?mode=signup&code=short', ''],
    ['?mode=signup', `#access_token=${'a'.repeat(20)}`], ['?mode=signup', '#type=signup&type=signup'],
    [`?code=${'c'.repeat(4100)}`, ''], ['', `#${'x'.repeat(40001)}`],
  ]
  for (const configured of [true, false]) for (const [query, fragment] of cases) await withAuth(async (mod, state) => {
    state.location.search = query; state.location.hash = fragment
    await rejectsCode(mod.beginManagedAccountSetup(), 'account_link_invalid')
    assert.deepEqual(state.calls, [['scrub', '/account/setup']])
    assert.equal(state.location.search + state.location.hash, '')
  }, configured)
  await withAuth(async (mod, state) => {
    codeLink(state)
    await rejectsCode(mod.beginManagedAccountSetup(), 'auth_not_configured')
    assert.deepEqual(state.calls.map(([name]) => name), ['scrub', 'storage-remove'])
  }, false)
})

test('unverified/anonymous/changed users cannot claim signup completion from local metadata', async () => {
  for (const change of [
    { email_confirmed_at: null, user_metadata: { email_verified: true } },
    { email_confirmed_at: 'invalid' }, { is_anonymous: true }, { id: 'other-user' },
    { email: '' }, { email: 'not-an-email' },
  ]) await withAuth(async (mod, state) => {
    codeLink(state); Object.assign(state.user, change)
    await rejectsCode(mod.beginManagedAccountSetup(), 'account_link_invalid')
    assert.equal(state.session, null)
    assert.equal(state.calls.some(([name]) => name === 'fetch'), false)
    assert.deepEqual(state.calls.find(([name]) => name === 'signOut'), ['signOut', { scope: 'local' }])
  })
  for (const broken of ['provider-error', 'discovery-denied', 'forged-directory']) await withAuth(async (mod, state) => {
    codeLink(state)
    if (broken === 'provider-error') state.getUser = async () => ({ data: { user: null }, error: { message: 'private' } })
    if (broken === 'discovery-denied') state.fetch = async () => response({ detail: { code: 'trial_auth_required' } }, 403)
    if (broken === 'forged-directory') state.directory.external_writes_performed = true
    await rejectsCode(mod.beginManagedAccountSetup(), 'account_link_invalid')
    assert.equal(state.session, null)
  })
})

test('signup page branch cannot expose password-reset UI or automatic workspace activation', () => {
  const page = readFileSync(new URL('../showroom/src/core/ManagedAccountPage.tsx', import.meta.url), 'utf8')
  assert.ok(page.includes("if (!setup || setup.purpose === 'signup') return"))
  assert.ok(page.includes('Email confirmed without company access'))
  assert.ok(page.includes('email confirmation does not activate company data or a paid plan'))
  assert.ok(page.indexOf("setup?.purpose === 'signup' ? <section") < page.indexOf(': setup ? <form'))
  assert.ok(page.includes('setDirectory(result.directory.workspaces.length ? result.directory : null)'))
  assert.doesNotMatch(page, /createSelfServeWorkspace|requestSelfServeWorkspace/)
})

test('actual page effect waits during startup but scrubs terminal-disabled callbacks without Auth', async () => {
  for (const configured of [true, false]) await withAuth(async (mod, state) => {
    codeLink(state)
    mod.ManagedAccountPage()
    state.page.effects.pop()()
    assert.equal(state.calls.length, 0, 'startup must not discard a valid callback before health settles')
    assert.ok(state.location.search.includes('code='))
    state.page.runtime = { status: 'demo', authReady: false }
    mod.ManagedAccountPage()
    state.page.effects.pop()()
    assert.deepEqual(state.calls, [['scrub', '/account/setup']])
    assert.equal(state.location.search + state.location.hash, '')
  }, configured)
})

test('portal lazy entry exposes exactly its four existing reads, never the whole Auth namespace', async () => {
  const source = readFileSync('showroom/src/core/managed-portal-client.ts', 'utf8')
  assert.equal(source.replace(/\/\/[^\n]*/g, '').replace(/\s+/g, ''),
    "export{currentManagedIdentity,discoverManagedWorkspacesForCurrentSession,loadManagedBootstrap,managedProductsFromBootstrap,}from'./managed-trial.ts'")
  assert.ok(coreShellSource.includes("void import('./managed-portal-client')"))
  assert.ok(!coreShellSource.includes("import('./managed-trial')"))
  // A source-only facade must preserve function identity and perform no I/O on import.
  const portal = await import('../showroom/src/core/managed-portal-client.ts')
  const managed = await import('../showroom/src/core/managed-trial.ts')
  assert.deepEqual(Object.keys(portal).sort(), [
    'currentManagedIdentity', 'discoverManagedWorkspacesForCurrentSession', 'loadManagedBootstrap', 'managedProductsFromBootstrap',
  ])
  for (const key of Object.keys(portal)) assert.equal(portal[key], managed[key])
})
