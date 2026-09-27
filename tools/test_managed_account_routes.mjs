import { MANAGED_WORKSPACE_STORAGE_KEY } from '../showroom/src/core/managed-workspace-selection.ts'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import test from 'node:test'
import { execFileSync } from 'node:child_process'

// Keep rapid-tap and recovery regressions in the canonical account verification gate.
import './managed_login_request_guard.test.mjs'

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

test('browser fixture rewrites every external destination, including terms and assisted setup', () => {
  const result = JSON.parse(execFileSync(process.execPath, ['tools/serve_managed_signup_fixture.mjs', '--self-test'], { encoding: 'utf8', windowsHide: true }))
  assert.equal(result.ok, true)
  assert.equal(result.checks, 11)
  const source = readFileSync('tools/serve_managed_signup_fixture.mjs', 'utf8')
  assert.ok(source.includes('${fixtureHref.toString()}'), 'browser executes the same tested function')
  assert.ok(source.includes("link.setAttribute('href', safe); link.removeAttribute('target')"))
  assert.ok(source.includes("path === '/fixture/external-link'"))
})

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
    stdin: { contents: "export * from './managed-trial.ts'; export { ManagedAccountPage } from './ManagedAccountPage.tsx'; export { ManagedLoginPage } from './ManagedLoginPage.tsx'", resolveDir: 'showroom/src/core', loader: 'ts' },
    bundle: true, platform: 'node', format: 'esm', jsx: 'automatic',
    write: false, logLevel: 'error',
    define: { 'import.meta.env': JSON.stringify(configured ? {
      VITE_SUPABASE_URL: 'https://auth.example.invalid',
      VITE_SUPABASE_PUBLISHABLE_KEY: ['sb', 'publishable', 'synthetic-unit-test-only'].join('_'),
    } : {}) },
    plugins: [{ name: 'offline-auth', setup(builder) {
      const shells = {
        react: `export const useEffect = fn => globalThis.__accountHarness.effects.push(fn);
          export const useState = init => { const h = globalThis.__accountHarness; const i = h.cursor++;
            if (!(i in h.slots)) h.slots[i] = typeof init === 'function' ? init() : init;
            return [h.slots[i], value => { h.slots[i] = typeof value === 'function' ? value(h.slots[i]) : value }]; };
          export const useRef = init => useState(() => ({ current: init }))[0];
          export const createElement = (type, props, ...children) => ({ type, props: { ...props, children } });`,
        'react/jsx-runtime': 'export const jsx = (type, props) => ({ type, props }); export const jsxs = jsx; export const Fragment = "fragment";',
        'react-router': 'export const Link = "a"; export const useOutletContext = () => globalThis.__accountHarness.runtime; export const useLocation = () => globalThis.__accountHarness.routerLocation ?? ({ pathname: "/account/setup", search: window.location.search }); export const useNavigate = () => globalThis.__accountHarness.navigate ?? (() => { throw Error("unexpected navigation") });',
        './CoreShell': 'export const PageHeading = "header";',
      }
      builder.onResolve({ filter: /^(react|react\/jsx-runtime|react-router|\.\/CoreShell)$/ }, ({ path }) => ({ path, namespace: 'page-shell' }))
      builder.onLoad({ filter: /.*/, namespace: 'page-shell' }, ({ path }) => ({ contents: shells[path] }))
      builder.onResolve({ filter: /^@supabase\/auth-js$/ }, () => ({ path: 'auth-mock', namespace: 'offline' }))
      builder.onLoad({ filter: /.*/, namespace: 'offline' }, () => ({
        contents: 'export class AuthClient { constructor(options) { const h = globalThis.__accountHarness; if (options.persistSession === false) { h.signupOptions = options; return h.signupAuth } h.options = options; return h.auth } }',
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
  self_serve_signup_terms_version: 'v1', self_serve_signup_terms_url: 'https://supermega.dev/terms/v1/',
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
  for (const name of ['refreshSession', 'getSession', 'signInWithPassword', 'signUp', 'resend', 'signOut', 'getUser', 'exchangeCodeForSession', 'setSession', 'resetPasswordForEmail', 'updateUser']) {
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
  const signupAuth = {
    signUp: async (...args) => {
      calls.push(['signUp', ...args])
      const result = state.signUp ? await state.signUp(...args) : state.signupResult
      state.signupSession = result.data?.session ?? null
      return result
    },
    resend: async (...args) => { calls.push(['resend', ...args]); return state.resend ? state.resend(...args) : state.resendResult },
    signOut: async (...args) => {
      calls.push(['signup-signOut', ...args])
      if (state.signupSignOut) await state.signupSignOut(...args)
      state.signupSession = null
      return { error: null }
    },
    dispose: () => { calls.push(['signup-dispose']) },
  }
  const replacements = {
    __accountHarness: { auth, signupAuth, effects: [], cursor: 0, slots: [], runtime: { status: 'checking', authReady: false } },
    window: { location, history: { state: null, replaceState(_state, _title, path) {
      calls.push(['scrub', path]); location.search = ''; location.hash = ''
    } }, localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => { calls.push(['storage-write', key]); storage.set(key, value) },
      removeItem: (key) => { calls.push(['storage-remove', key]); storage.delete(key) },
    } },
    fetch: async (url, init = {}) => {
      calls.push(['fetch', url, init])
      assert.equal(init.method ?? 'GET', state.allowedPostPath === url ? 'POST' : 'GET', 'only an explicitly selected synthetic request may write')
      if (state.fetch) return state.fetch(url, init)
      if (url === '/api/health') return response(state.health)
      if (url === '/api/trial/v1/workspaces') return response(state.directory)
      throw new Error(`Forbidden network ${url}`)
    },
  }
  replacements.localStorage = replacements.window.localStorage
  const originals = new Map(Object.keys(replacements).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  for (const [key, value] of Object.entries(replacements)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value })
  try {
    const mod = await import(`${configured ? configuredBundle : unconfiguredBundle}#${++instance}`)
    state.page = replacements.__accountHarness
    await run(mod, state)
    assert.equal(storage.get('unrelated.demo'), 'preserved')
    assert.equal(calls.filter(([name]) => name === 'storage-write').length, 0)
    assert.equal(calls.filter(([name]) => name === 'updateUser').length, state.expectedPasswordUpdates ?? 0)
  } finally {
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else delete globalThis[key]
    }
  }
}
const rejectsCode = (promise, code) => assert.rejects(promise, (error) => error.code === code)

test('late discovery failure cannot sign out or erase a newer successful login', async () => {
  for (const oldMethod of ['discoverManagedWorkspacesForCurrentSession', 'signInAndDiscoverManagedWorkspaces']) {
    await withAuth(async (mod, state) => {
      state.session = { ...fixedSession }
      const newer = { ...fixedSession, access_token: 'synthetic-newer-session', user: { ...fixedUser, id: 'newer-user' } }
      let releaseOld
      let oldStarted
      const started = new Promise(resolve => { oldStarted = resolve })
      const delayed = new Promise(resolve => { releaseOld = resolve })
      state.signInWithPassword = async ({ email }) => {
        state.session = email === 'newer@example.invalid' ? newer : { ...fixedSession }
        return { data: { session: state.session, user: state.session.user }, error: null }
      }
      state.fetch = async (_url, init) => {
        if (init.headers.get('authorization') === `Bearer ${fixedSession.access_token}`) { oldStarted(); return delayed }
        return response(directoryBody())
      }
      const old = mod[oldMethod]('owner@example.invalid', 'synthetic-password')
      const rejected = assert.rejects(old)
      await started
      const result = await mod.signInAndDiscoverManagedWorkspaces('newer@example.invalid', 'synthetic-password')
      assert.equal(result.userId, newer.user.id)
      const retainedSelection = ['supermega.managed.workspace.v1', 'newer-company']
      state.storage.set(...retainedSelection)
      const before = [...state.storage]
      releaseOld(response({ detail: { code: 'trial_auth_required' } }, 403))
      await rejected
      assert.equal(state.session, newer)
      assert.deepEqual([...state.storage], before)
      assert.equal(state.calls.some(([name]) => name === 'signOut'), false)
    })
  }
})

test('discovery success from a replaced session is rejected without clearing the current session', async () => {
  await withAuth(async (mod, state) => {
    state.session = { ...fixedSession }
    const newer = { ...fixedSession, access_token: 'synthetic-replaced-session' }
    state.fetch = async () => { state.session = newer; return response(directoryBody()) }
    await rejectsCode(mod.discoverManagedWorkspacesForCurrentSession(), 'managed_identity_changed')
    assert.equal(state.session, newer)
    assert.equal(state.calls.some(([name]) => name === 'signOut'), false)
  })
})

test('discovery denial still rejects and cannot create workspace access', async () => {
  await withAuth(async (mod, state) => {
    state.session = { ...fixedSession }
    state.fetch = async () => response({ detail: { code: 'trial_auth_required' } }, 403)
    await assert.rejects(mod.discoverManagedWorkspacesForCurrentSession())
    assert.equal(state.calls.some(([name]) => name === 'storage-write'), false)
  })
})
function codeLink(state, purpose = 'signup') {
  state.location.search = `?mode=${purpose}&code=${'c'.repeat(20)}`
}

test('unconfigured/invalid input/insecure origin cannot call Auth or the network', async () => {
  await withAuth(async (mod, state) => {
    await rejectsCode(mod.createManagedAccount(signupInput, 'v1'), 'auth_not_configured')
    assert.equal(state.calls.length, 0)
  }, false)
  await withAuth(async (mod, state) => {
    for (const input of [{ ...signupInput, email: 'invalid' }, { ...signupInput, termsAccepted: false }, { ...signupInput, confirmation: '' }]) {
      await assert.rejects(mod.createManagedAccount(input, 'v1'))
    }
    state.location.origin = 'http://public.example.invalid'
    await rejectsCode(mod.resendManagedAccountConfirmation('owner@example.invalid', 'v1'), 'auth_redirect_insecure')
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
    await rejectsCode(mod.createManagedAccount(signupInput, 'v1'), 'signup_window_closed')
    await rejectsCode(mod.resendManagedAccountConfirmation('owner@example.invalid', 'v1'), 'signup_window_closed')
    assert.equal(state.calls.length, 2)
    for (const [, url, init] of state.calls) {
      assert.equal(url, '/api/health'); assert.equal(init.cache, 'no-store')
      assert.equal(init.credentials, 'omit'); assert.equal(init.redirect, 'error'); assert.ok(init.signal)
    }
  })
  for (const failed of [response(openHealth(), 503), response(openHealth(), 200, 'text/html')]) await withAuth(async (mod, state) => {
    state.fetch = async () => failed
    await rejectsCode(mod.createManagedAccount(signupInput, 'v1'), 'signup_window_closed')
    assert.equal(state.calls.length, 1)
  })
})

test('missing, changed and untrusted terms policies block signup and resend before Auth', async () => {
  await withAuth(async (mod, state) => {
    await rejectsCode(mod.createManagedAccount(signupInput), 'account_terms_required')
    await rejectsCode(mod.resendManagedAccountConfirmation('owner@example.invalid', 'v1\n'), 'account_terms_required')
    assert.equal(state.calls.length, 0)
  })
  for (const policy of [
    { self_serve_signup_terms_version: undefined },
    { self_serve_signup_terms_version: 'v0' },
    { self_serve_signup_terms_url: 'https://example.invalid/terms/v1/' },
    { self_serve_signup_terms_url: 'https://supermega.dev/terms/v1/?private=value' },
    { self_serve_signup_terms_url: 'https://supermega.dev/terms/v1/#fragment' },
    { self_serve_signup_terms_url: 'https://supermega.dev/terms/v2/' },
  ]) await withAuth(async (mod, state) => {
    Object.assign(state.health.authentication, policy)
    await rejectsCode(mod.createManagedAccount(signupInput, 'v1'), 'signup_window_closed')
    await rejectsCode(mod.resendManagedAccountConfirmation('owner@example.invalid', 'v1'), 'signup_window_closed')
    assert.equal(state.calls.some(([name]) => name !== 'fetch'), false)
  })
  await withAuth(async (mod, state) => {
    Object.assign(state.health.authentication, { self_serve_signup_terms_version: 'v2', self_serve_signup_terms_url: 'https://supermega.dev/terms/v2/' })
    await rejectsCode(mod.createManagedAccount(signupInput, 'v1'), 'account_terms_changed')
    await rejectsCode(mod.resendManagedAccountConfirmation('owner@example.invalid', 'v1'), 'account_terms_changed')
    assert.equal(state.calls.some(([name]) => name !== 'fetch'), false)
  })
})

test('signup sends normalized identity only; resend uses signup type; existing identity is indistinguishable', async () => {
  for (const error of [null, { code: 'user_already_exists' }, { code: 'email_exists' }, { code: 'user_not_found' }]) await withAuth(async (mod, state) => {
    state.signupResult.error = error
    state.resendResult.error = error
    const expected = { status: 'confirmation_requested' }
    assert.deepEqual(await mod.createManagedAccount(signupInput, 'v1'), expected)
    const signup = state.calls.find(([name]) => name === 'signUp')[1]
    assert.deepEqual(signup, { email: 'owner@example.invalid', password: signupInput.password,
      options: { emailRedirectTo: 'https://app.example.invalid/account/setup?mode=signup' } })
    assert.deepEqual(await mod.resendManagedAccountConfirmation(' OWNER@example.invalid ', 'v1'), expected)
    assert.deepEqual(state.calls.find(([name]) => name === 'resend')[1], {
      type: 'signup', email: 'owner@example.invalid', options: signup.options,
    })
    state.health.authentication.self_serve_signup_open = false
    await rejectsCode(mod.resendManagedAccountConfirmation('owner@example.invalid', 'v1'), 'signup_window_closed')
    assert.equal(state.calls.filter(([name]) => name === 'resend').length, 1)
  })
})

test('existing sessions and unexpected auto-confirmed signup never grant silent access', async () => {
  await withAuth(async (mod, state) => {
    state.session = fixedSession
    await rejectsCode(mod.createManagedAccount(signupInput, 'v1'), 'auth_existing_session')
    assert.equal(state.calls.some(([name]) => name === 'signUp' || name === 'signOut'), false)
    state.session = { ...fixedSession, user: { ...fixedUser, is_anonymous: true } }
    await rejectsCode(mod.resendManagedAccountConfirmation('owner@example.invalid', 'v1'), 'auth_existing_session')
  })
  await withAuth(async (mod, state) => {
    state.signupResult.data.session = fixedSession
    await rejectsCode(mod.createManagedAccount(signupInput, 'v1'), 'email_confirmation_required')
    assert.deepEqual(state.calls.find(([name]) => name === 'signup-signOut'), ['signup-signOut', { scope: 'local' }])
    assert.equal(state.session, null)
    assert.equal(state.signupSession, null)
    assert.equal(state.calls.some(([name, url]) => name === 'fetch' && url.includes('workspaces')), false)
  })
})

test('late auto-confirmed signup does not clear a newer account or company', async () => {
  await withAuth(async (mod, state) => {
    const newer = { ...fixedSession, access_token: 'synthetic-newer-token', user: { ...fixedUser, id: 'newer-user' } }
    state.signUp = async () => {
      state.session = newer
      state.storage.set('supermega.managed.workspace.v1', 'newer-company')
      return { data: { session: fixedSession }, error: null }
    }
    await rejectsCode(mod.createManagedAccount(signupInput, 'v1'), 'email_confirmation_required')
    assert.equal(state.calls.some(([name]) => name === 'signOut'), false)
    assert.equal(state.session, newer)
    assert.equal(state.storage.get('supermega.managed.workspace.v1'), 'newer-company')
  })
})

test('signup uses a disposable nonpersistent client for success, resend and cleanup races', async () => {
  for (const scenario of ['success', 'resend', 'cleanup-race', 'cleanup-error']) await withAuth(async (mod, state) => {
    const newer = { ...fixedSession, access_token: 'synthetic-newer-token' }
    if (scenario.startsWith('cleanup')) {
      state.signupResult.data.session = fixedSession
      state.signupSignOut = async () => {
        state.session = newer
        state.storage.set('supermega.managed.workspace.v1', 'newer-company')
        if (scenario === 'cleanup-error') throw new Error('private-provider-failure')
      }
      await rejectsCode(mod.createManagedAccount(signupInput, 'v1'), scenario === 'cleanup-error' ? 'account_request_failed' : 'email_confirmation_required')
      assert.equal(state.session, newer)
      assert.equal(state.storage.get('supermega.managed.workspace.v1'), 'newer-company')
    } else if (scenario === 'resend') await mod.resendManagedAccountConfirmation('owner@example.invalid', 'v1')
    else await mod.createManagedAccount(signupInput, 'v1')
    assert.equal(state.page.signupOptions.persistSession, false)
    assert.equal(state.page.signupOptions.autoRefreshToken, false)
    assert.equal(state.page.signupOptions.detectSessionInUrl, false)
    assert.notEqual(state.page.signupOptions.storageKey, state.page.options.storageKey)
    assert.equal(state.calls.filter(([name]) => name === 'signup-dispose').length, 1)
    assert.equal(state.calls.some(([name]) => name === 'signOut' || name === 'storage-remove'), false)
  })
})

test('network/provider failures are fixed-copy, retry-free and release submission backpressure', async () => {
  await withAuth(async (mod, state) => {
    const privateError = 'sensitive-provider-detail@example.invalid'
    state.fetch = async () => { throw new Error(privateError) }
    await assert.rejects(mod.createManagedAccount(signupInput, 'v1'), (error) => error.code === 'account_request_failed' && !error.message.includes(privateError))
    assert.equal(state.calls.length, 1)
    state.fetch = undefined
    state.signupResult.error = { code: 'over_email_send_rate_limit', message: privateError, status: 429 }
    await rejectsCode(mod.createManagedAccount(signupInput, 'v1'), 'account_request_failed')
    let finish
    state.signUp = () => new Promise((resolve) => { finish = resolve })
    const pending = mod.createManagedAccount(signupInput, 'v1')
    for (let i = 0; i < 20 && !finish; i++) await new Promise((resolve) => setImmediate(resolve))
    assert.ok(finish)
    await rejectsCode(mod.resendManagedAccountConfirmation('owner@example.invalid', 'v1'), 'account_request_pending')
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

test('Website review recovery retains only the canonical review ID and scrubs the callback', async () => {
  const review = '11111111-1111-4111-8111-111111111111'
  const query = `?product=website&review=${review}&returnTo=https://outside.invalid&workspace=other`
  const recovery = managedAccountPath('/account/recovery', 'shop', query)
  assert.equal(recovery, `/account/recovery?product=website&review=${review}`)
  assert.equal(managedAccountPath('/login', null, query), `/login?product=website&review=${review}`)
  await withAuth(async (mod, state) => {
    state.location.search = recovery.slice(recovery.indexOf('?'))
    await mod.requestManagedPasswordRecovery('owner@example.invalid')
    const redirect = state.calls.find(([name]) => name === 'resetPasswordForEmail')[2].redirectTo
    assert.equal(redirect, `https://app.example.invalid/account/setup?mode=recovery&review=${review}`)
    state.calls.length = 0
    state.location.search = new URL(redirect).search + `&code=${'c'.repeat(20)}`
    const result = await mod.beginManagedAccountSetup()
    assert.equal(result.purpose, 'recovery')
    assert.deepEqual(state.calls[0], ['scrub', '/account/setup'])
    assert.equal(state.location.search, '')
    assert.equal(state.calls.filter(([name]) => name === 'exchangeCodeForSession').length, 1)
    assert.equal(state.calls.some(([name]) => name === 'fetch'), false, 'review URL grants no membership or preview read')
  })
  const account = readFileSync(new URL('../showroom/src/core/ManagedAccountPage.tsx', import.meta.url), 'utf8')
  assert.ok(account.includes('managedLoginReviewPath(location.search) ?? managedPortalEntryPath(productIntent)'))
  const open = account.slice(account.indexOf('async function openWorkspace'), account.indexOf('async function requestRecovery'))
  assert.ok(open.indexOf('await completeManagedWorkspaceSignIn') < open.indexOf('await loadManagedBootstrap'))
  assert.ok(open.indexOf('await loadManagedBootstrap') < open.indexOf('navigate(portalEntryPath)'))
  assert.ok(managedLoginSource.includes("managedAccountPath('/account/recovery', productIntent, location.search)"))
})

test('Ecommerce recovery retains product and review without granting catalog access', async () => {
  const review = '11111111-1111-4111-8111-111111111111'
  const query = `?product=ecommerce&review=${review}&returnTo=https://outside.invalid&workspace=other`
  const recovery = managedAccountPath('/account/recovery', 'website', query)
  assert.equal(recovery, `/account/recovery?product=ecommerce&review=${review}`)
  await withAuth(async (mod, state) => {
    state.location.search = recovery.slice(recovery.indexOf('?'))
    await mod.requestManagedPasswordRecovery('owner@example.invalid')
    const redirect = state.calls.find(([name]) => name === 'resetPasswordForEmail')[2].redirectTo
    assert.equal(redirect, `https://app.example.invalid/account/setup?mode=recovery&review=${review}&product=ecommerce`)
    state.calls.length = 0
    state.location.search = new URL(redirect).search + `&code=${'c'.repeat(20)}`
    const result = await mod.beginManagedAccountSetup()
    assert.equal(result.purpose, 'recovery')
    assert.deepEqual(state.calls[0], ['scrub', '/account/setup'])
    assert.equal(state.location.search, '')
    assert.equal(state.calls.filter(([name]) => name === 'exchangeCodeForSession').length, 1)
    assert.equal(state.calls.some(([name]) => name === 'fetch'), false)
  })
})

test('Ecommerce callback product cannot bypass purpose, ID or duplicate checks', async () => {
  const review = '11111111-1111-4111-8111-111111111111'
  for (const query of [
    `mode=signup&product=ecommerce&review=${review}`,
    `mode=invite&product=ecommerce&review=${review}`,
    'mode=recovery&product=ecommerce',
    `mode=recovery&product=ecommerce&review=${review}%0A`,
    `mode=recovery&product=ecommerce&product=ecommerce&review=${review}`,
    `mode=recovery&product=ecommerce&product=website&review=${review}`,
    `mode=recovery&product=shop&review=${review}`,
    `mode=recovery&product=ecommerce&review=${review}&review=${review}`,
  ]) await withAuth(async (mod, state) => {
    state.location.search = `?${query}&code=${'c'.repeat(20)}`
    await rejectsCode(mod.beginManagedAccountSetup(), 'account_link_invalid')
    assert.deepEqual(state.calls, [['scrub', '/account/setup']])
  })
})

test('invalid or wrong-purpose review callbacks fail before provider access', async () => {
  const review = '11111111-1111-4111-8111-111111111111'
  for (const query of [
    `mode=signup&review=${review}`, `mode=invite&review=${review}`,
    `mode=recovery&review=${review}&review=${review}`, 'mode=recovery&review=',
    `mode=recovery&review=${review}%0A`, 'mode=recovery&review=https://outside.invalid',
  ]) await withAuth(async (mod, state) => {
    state.location.search = `?${query}&code=${'c'.repeat(20)}`
    await rejectsCode(mod.beginManagedAccountSetup(), 'account_link_invalid')
    assert.deepEqual(state.calls, [['scrub', '/account/setup']])
  })
  assert.equal(managedAccountPath('/account/recovery', 'website', `?review=${review}&review=${review}`), '/account/recovery?product=website')
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
  assert.ok(page.includes('A business workspace still needs to be connected to your account.'))
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
  const vite = readFileSync('showroom/vite.config.ts', 'utf8')
  assert.match(vite, /id.includes\('\/src\/core\/managed-trial.ts'\)\s*\|\| id.includes\('\/src\/core\/managed-portal-client.ts'\)/)
  // A source-only facade must preserve function identity and perform no I/O on import.
  const portal = await import('../showroom/src/core/managed-portal-client.ts')
  const managed = await import('../showroom/src/core/managed-trial.ts')
  assert.deepEqual(Object.keys(portal).sort(), [
    'currentManagedIdentity', 'discoverManagedWorkspacesForCurrentSession', 'loadManagedBootstrap', 'managedProductsFromBootstrap',
  ])
  for (const key of Object.keys(portal)) assert.equal(portal[key], managed[key])
})

function elements(tree) {
  if (Array.isArray(tree)) return tree.flatMap(elements)
  if (!tree || typeof tree !== 'object') return []
  return [tree, ...elements(tree.props?.children)]
}
function content(tree) {
  if (Array.isArray(tree)) return tree.map(content).join('')
  if (tree && typeof tree === 'object') return content(tree.props?.children)
  return typeof tree === 'string' || typeof tree === 'number' ? String(tree) : ''
}
function login(mod, state) { state.page.cursor = 0; state.page.effects = []; return mod.ManagedLoginPage() }
function button(tree, text) { return elements(tree).find((node) => node.type === 'button' && content(node) === text) }
function input(tree, label) {
  return elements(elements(tree).find((node) => node.type === 'label' && content(node).startsWith(label)))
    .find((node) => node.type === 'input')
}
function openedLogin(mod, state) {
  state.page.runtime = { status: 'demo', signupPolicy: { termsVersion: 'v1', termsUrl: 'https://supermega.dev/terms/v1/' } }
  button(login(mod, state), 'Create an account').props.onClick()
  return login(mod, state)
}
function fillSignup(mod, state) {
  let tree = openedLogin(mod, state)
  for (const [label, value] of [['Email', signupInput.email], ['Password', signupInput.password], ['Confirm password', signupInput.confirmation]]) {
    input(tree, label).props.onChange({ target: { value } }); tree = login(mod, state)
  }
  input(tree, 'I agree').props.onChange({ target: { checked: true } })
  return login(mod, state)
}
const finishRequest = async () => { for (let i = 0; i < 12; i++) await new Promise((resolve) => setImmediate(resolve)) }

test('actual recovery page retains router intent after URL scrubbing and password completion without membership', async () => {
  await withAuth(async (mod, state) => {
    const review = '11111111-1111-4111-8111-111111111111'
    codeLink(state, 'recovery')
    state.location.search += `&review=${review}`
    // Browser history.replaceState does not navigate React Router. Keep its
    // location snapshot separate from the raw URL that Auth must scrub.
    state.page.routerLocation = { pathname: '/account/setup', search: state.location.search }
    state.page.runtime = { status: 'ready', authReady: true }
    const destinations = []
    state.page.navigate = path => destinations.push(path)
    const render = () => { state.page.cursor = 0; state.page.effects = []; return mod.ManagedAccountPage() }
    render()
    const cleanup = state.page.effects[0]()
    await finishRequest()
    assert.equal(state.location.search + state.location.hash, '')
    assert.deepEqual(destinations, [])
    let tree = render()
    assert.match(content(tree), /Set your password/)
    input(tree, 'New password').props.onChange({ target: { value: signupInput.password } })
    tree = render()
    input(tree, 'Confirm password').props.onChange({ target: { value: signupInput.password } })
    tree = render()
    state.expectedPasswordUpdates = 1
    state.updateUser = async () => ({ data: { user: fixedUser }, error: null })
    elements(tree).find(node => node.type === 'form').props.onSubmit({ preventDefault() {} })
    await finishRequest()
    assert.deepEqual(destinations, [`/login?product=website&review=${review}`])
    assert.equal(state.calls.filter(([name]) => name === 'updateUser').length, 1)
    assert.equal(state.calls.some(([name, url]) => name === 'fetch' && url.includes('bootstrap')), false)
    tree = render()
    assert.equal(input(tree, 'New password').props.value, '')
    assert.equal(input(tree, 'Confirm password').props.value, '')
    cleanup()
  })
})

test('actual login form stays closed during startup, closed policy and unconfigured Auth', async () => {
  for (const configured of [true, false]) await withAuth(async (mod, state) => {
    for (const runtime of [{ status: 'checking' }, { status: 'demo', signupPolicy: null }]) {
      state.page.runtime = runtime
      assert.equal(button(login(mod, state), 'Create an account'), undefined)
      assert.equal(state.calls.length, 0)
    }
    if (!configured) {
      state.page.runtime = { status: 'demo', signupPolicy: { termsVersion: 'v1', termsUrl: 'https://supermega.dev/terms/v1/' } }
      assert.equal(button(login(mod, state), 'Create an account'), undefined)
    }
  }, configured)
})

test('actual form requires deliberate terms and preserves product intent on recovery', async () => {
  await withAuth(async (mod, state) => {
    state.location.search = '?product=plant'
    const tree = openedLogin(mod, state)
    assert.equal(input(tree, 'I agree').props.checked, false)
    assert.ok(elements(tree).some((node) => node.type === 'label' && node.props.className === 'signup-consent'))
    assert.equal(button(tree, 'Create account').props.disabled, true)
    assert.equal(input(tree, 'Password').props.autoComplete, 'new-password')
    assert.equal(input(tree, 'Password').props.minLength, 12)
    assert.equal(input(tree, 'Confirm password').props.maxLength, 128)
    assert.ok(elements(tree).some((node) => node.props?.href === 'https://supermega.dev/terms/v1/'))
    assert.ok(elements(tree).some((node) => node.props?.to === '/account/recovery?product=plant'))
    elements(tree).find((node) => node.type === 'form').props.onSubmit({ preventDefault() {} })
    await finishRequest()
    assert.equal(state.calls.length, 0)
    assert.match(content(login(mod, state)), /Read and accept/)
  })
})

test('actual form submits once, clears secrets, gives neutral confirmation and enforces cooldown', async () => {
  await withAuth(async (mod, state) => {
    const tree = fillSignup(mod, state)
    const submit = elements(tree).find((node) => node.type === 'form').props.onSubmit
    submit({ preventDefault() {} }); submit({ preventDefault() {} })
    await finishRequest()
    const sent = login(mod, state)
    assert.equal(state.calls.filter(([name]) => name === 'signUp').length, 1)
    assert.equal(input(sent, 'Password'), undefined)
    assert.equal(state.page.slots.includes(signupInput.password), false)
    assert.match(content(sent), /If this address can receive a confirmation/)
    assert.doesNotMatch(content(sent), /Email sent successfully|Company activated|Payment confirmed/)
    const cooldown = elements(sent).find((node) => node.type === 'button' && content(node).includes('Wait 60s'))
    assert.equal(cooldown.props.disabled, true)
    elements(sent).find((node) => node.type === 'form').props.onSubmit({ preventDefault() {} })
    await finishRequest()
    assert.equal(state.calls.some(([name]) => name === 'resend'), false)
    button(sent, 'Use another email').props.onClick()
    const next = login(mod, state)
    assert.equal(input(next, 'I agree').props.checked, false)
    assert.equal(input(next, 'Password').props.value, '')
    assert.ok(elements(next).some((node) => node.type === 'button' && content(node).includes('Wait 60s') && node.props.disabled))
  })
})

test('actual form fails closed when policy changes after display and does not auto-retry', async () => {
  for (const change of ['closed', 'terms']) await withAuth(async (mod, state) => {
    const tree = fillSignup(mod, state)
    if (change === 'closed') state.health.authentication.self_serve_signup_open = false
    else Object.assign(state.health.authentication, { self_serve_signup_terms_version: 'v2', self_serve_signup_terms_url: 'https://supermega.dev/terms/v2/' })
    elements(tree).find((node) => node.type === 'form').props.onSubmit({ preventDefault() {} })
    await finishRequest()
    assert.equal(state.calls.filter(([name]) => name === 'fetch').length, 1)
    assert.equal(state.calls.some(([name]) => name === 'signUp'), false)
    assert.equal(input(login(mod, state), 'Password').props.value, '')
    assert.match(content(login(mod, state)), change === 'closed' ? /signup is not open/ : /terms changed/)
  })
})

test('Ecommerce operator transport binds identity, no-store and exact endpoint payloads', async () => {
  await withAuth(async (mod, state) => {
    state.session = { ...fixedSession }
    state.storage.set(MANAGED_WORKSPACE_STORAGE_KEY, 'synthetic-company')
    const identity = await mod.currentManagedIdentity()
    assert.ok(identity)
    state.fetch = async () => response({ synthetic: true })
    const id = '11111111-1111-4111-8111-111111111111'
    const payload = { reviewId: id, recipientGrantId: id, expectedVersion: 1, expiresAt: '2099-01-01T00:00:00Z' }
    for (const [invoke, path, body] of [
      [() => mod.loadManagedEcommerceOperatorDecisions(id, identity), '/api/trial/v1/ecommerce-reviews/'+id+'/operator-decisions'],
      [() => mod.loadManagedEcommerceOperatorDecisions(id, identity, id), '/api/trial/v1/ecommerce-reviews/'+id+'/operator-decisions?after='+id],
      [() => mod.loadManagedEcommerceReviews(identity), '/api/trial/v1/ecommerce-reviews'],
      [() => mod.loadManagedEcommerceReviews(identity, id), '/api/trial/v1/ecommerce-reviews?after='+id],
      [() => mod.loadManagedEcommercePreparation(identity), '/api/trial/v1/ecommerce-review-preparation'],
      [() => mod.reconcileManagedEcommerceReview(id, identity), '/api/trial/v1/ecommerce-reviews/'+id+'/reconciliation'],
      [() => mod.resolveExpiredManagedEcommerceReview(id, payload.expiresAt, identity), '/api/trial/v1/ecommerce-reviews/'+id+'/resolve-expired', { expiresAt: payload.expiresAt }],
      [() => mod.loadManagedEcommerceRecipients(identity, id), '/api/trial/v1/ecommerce-review-recipients?after='+id],
      [() => mod.prepareManagedEcommerceReview(payload, identity), '/api/trial/v1/ecommerce-reviews', payload],
      [() => mod.withdrawManagedEcommerceReview(id, identity), '/api/trial/v1/ecommerce-reviews/'+id+'/withdraw', {}],
    ]) {
      state.calls.length = 0; state.allowedPostPath = body ? path : null
      assert.deepEqual(await invoke(), { synthetic: true })
      const calls = state.calls.filter(([name]) => name === 'fetch')
      assert.equal(calls.length, 1)
      assert.equal(calls[0][1], path)
      const init = calls[0][2]
      assert.equal(init.cache, 'no-store'); assert.equal(init.redirect, 'error'); assert.equal(init.credentials, 'omit')
      assert.equal(init.headers.get('x-supermega-workspace-id'), 'synthetic-company')
      if (body) assert.deepEqual(JSON.parse(init.body), body)
    }
    state.calls.length = 0
    state.storage.set(MANAGED_WORKSPACE_STORAGE_KEY, 'different-company')
    await assert.rejects(mod.loadManagedEcommercePreparation(identity))
    assert.equal(state.calls.some(([name]) => name === 'fetch'), false)
  })
})

test('Ecommerce invalid identifiers fail before provider or network access', async () => {
  await withAuth(async (mod, state) => {
    for (const bad of ['', '../other', '11111111-1111-4111-8111-111111111111\n']) {
      await assert.rejects(mod.loadManagedEcommerceOperatorDecisions(bad, {}))
      await assert.rejects(mod.loadManagedEcommerceOperatorDecisions('11111111-1111-4111-8111-111111111111', {}, bad))
      await assert.rejects(mod.loadManagedEcommerceReviews({}, bad))
      await assert.rejects(mod.loadManagedEcommerceRecipients({}, bad))
      await assert.rejects(mod.withdrawManagedEcommerceReview(bad, {}))
      await assert.rejects(mod.reconcileManagedEcommerceReview(bad, {}))
      await assert.rejects(mod.resolveExpiredManagedEcommerceReview(bad, '2026-09-25T00:00:00Z', {}))
      await assert.rejects(mod.resolveExpiredManagedEcommerceReview('11111111-1111-4111-8111-111111111111', bad, {}))
      await assert.rejects(mod.prepareManagedEcommerceReview({reviewId:bad,recipientGrantId:bad}, {}))
    }
    assert.deepEqual(state.calls, [])
  })
})


test('sign-in distinguishes unavailable service and rate limits without exposing provider details', async () => {
  for (const [status, name, expected] of [
    [0, 'AuthRetryableFetchError', /temporarily unavailable/],
    [503, 'AuthRetryableFetchError', /temporarily unavailable/],
    [500, 'AuthApiError', /temporarily unavailable/],
    [429, 'AuthApiError', /Wait a few minutes/],
    [400, 'AuthApiError', /Check the account and password/],
  ]) {
    await withAuth(async (mod, state) => {
      state.signInWithPassword = async () => ({ data: { user: null, session: null },
        error: { name, status, code: 'synthetic_auth_error', message: 'PRIVATE_PROVIDER_DETAIL' } })
      await assert.rejects(mod.signInAndDiscoverManagedWorkspaces('owner@example.invalid', 'synthetic-input'), error => {
        assert.match(error.message, expected)
        assert.ok(!error.message.includes('PRIVATE_PROVIDER_DETAIL'))
        assert.equal(error.status, status)
        assert.equal(error.code, 'synthetic_auth_error')
        return true
      })
      assert.equal(state.calls.filter(([name]) => name === 'signInWithPassword').length, 1)
      assert.equal(state.calls.filter(([name]) => name === 'fetch').length, 0, 'failed sign-in cannot discover company data')
    })
  }
})


test('customer review reads bound stalled requests and bodies without retrying or clearing identity', async () => {
  for (const method of ['loadManagedWebsiteReview', 'loadManagedWebsiteAcceptance', 'loadManagedEcommerceReview', 'loadManagedEcommerceDecisions', 'loadManagedEcommerceOperatorDecisions']) {
    for (const phase of ['request', 'body']) await withAuth(async (mod, state) => {
      state.session = { ...fixedSession }
      state.storage.set(MANAGED_WORKSPACE_STORAGE_KEY, 'synthetic-company')
      const identity = await mod.currentManagedIdentity()
      const controller = new AbortController()
      const timeout = AbortSignal.timeout
      AbortSignal.timeout = milliseconds => { assert.equal(milliseconds, 8000); return controller.signal }
      try {
        state.fetch = async (_url, init) => {
          assert.equal(init.signal, controller.signal)
          assert.equal(init.redirect, 'error')
          assert.equal(init.cache, 'no-store')
          const stalled = () => new Promise((_resolve, reject) => {
            init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true })
            queueMicrotask(() => controller.abort(new DOMException('Timed out', 'TimeoutError')))
          })
          return phase === 'request' ? stalled() : { ok: true, status: 200, json: stalled }
        }
        await assert.rejects(mod[method]('11111111-1111-4111-8111-111111111111', identity), { name: 'TimeoutError' })
        assert.equal(state.calls.filter(([name]) => name === 'fetch').length, 1)
        assert.equal(state.calls.some(([name]) => name === 'signOut'), false)
        assert.deepEqual(await mod.currentManagedIdentity(), identity)
      } finally { AbortSignal.timeout = timeout }
    })
  }
})

test('company discovery transport failures preserve the signed-in session and give safe retry advice', async () => {
  for (const phase of ['request', 'body']) {
    await withAuth(async (mod, state) => {
      state.session = { ...fixedSession }
      const currentSession = state.session
      state.fetch = async (_url, init) => {
        assert.equal(init.redirect, 'error')
        assert.ok(init.signal instanceof AbortSignal)
        const fail = () => { throw new Error('PRIVATE_TRANSPORT_DETAIL') }
        if (phase === 'request') fail()
        return { ok: true, json: async () => fail() }
      }
      await assert.rejects(mod.discoverManagedWorkspacesForCurrentSession(), error => {
        assert.equal(error.code, 'workspace_directory_unavailable')
        assert.match(error.message, /company list could not be loaded/)
        assert.ok(!error.message.includes('PRIVATE_TRANSPORT_DETAIL'))
        return true
      })
      assert.equal(state.session, currentSession)
      assert.equal(state.calls.some(([name]) => name === 'signOut'), false)
      assert.equal(state.calls.some(([name]) => name === 'storage-write'), false)
    })
  }
})


test('Ecommerce decision transport keeps exact commands and does not retry uncertain writes', async () => {
  for (const kind of ['acceptance', 'change-requests']) await withAuth(async (mod, state) => {
    state.session = { ...fixedSession }
    state.storage.set(MANAGED_WORKSPACE_STORAGE_KEY, 'synthetic-company')
    const identity = await mod.currentManagedIdentity()
    const id = '11111111-1111-4111-8111-111111111111'
    const payload = { reviewId: id, commandId: id, previewDigest: 'sha256:' + 'a'.repeat(64),
      ...(kind === 'acceptance' ? { decision: 'accept_preview_for_release_review' } : { note: 'Change the price' }) }
    state.fetch = async (url, init) => {
      assert.ok(String(url).endsWith(`/ecommerce-reviews/${id}/${kind}`))
      assert.deepEqual(JSON.parse(init.body), payload)
      assert.equal(init.method, 'POST')
      assert.equal(init.cache, 'no-store')
      assert.equal(init.redirect, 'error')
      assert.equal(init.credentials, 'omit')
      assert.ok(init.signal instanceof AbortSignal)
      throw new Error('uncertain transport')
    }
    await assert.rejects(mod.sendManagedEcommerceDecision(payload, identity))
    assert.equal(state.calls.filter(([name]) => name === 'fetch').length, 1)
    assert.deepEqual(await mod.currentManagedIdentity(), identity)
    await assert.rejects(mod.sendManagedEcommerceDecision({ ...payload, commandId: '../invalid' }, identity))
    assert.equal(state.calls.filter(([name]) => name === 'fetch').length, 1)
  })
})


test('operator response transport rejects identity changes before fetch, at headers and after body delivery', async () => {
  for (const phase of ['before', 'headers', 'body']) await withAuth(async (mod, state) => {
    state.session = { ...fixedSession }
    state.storage.set(MANAGED_WORKSPACE_STORAGE_KEY, 'synthetic-company')
    const identity = await mod.currentManagedIdentity()
    const change = () => state.storage.set(MANAGED_WORKSPACE_STORAGE_KEY, 'different-company')
    state.calls.length = 0
    state.fetch = async () => {
      if (phase === 'headers') change()
      return { ok: true, status: 200, json: async () => { if (phase === 'body') change(); return { privateNote: 'Synthetic private note' } } }
    }
    if (phase === 'before') change()
    await assert.rejects(mod.loadManagedEcommerceOperatorDecisions('11111111-1111-4111-8111-111111111111', identity),
      error => error.code === 'managed_identity_changed')
    assert.equal(state.calls.filter(([name]) => name === 'fetch').length, phase === 'before' ? 0 : 1)
    assert.equal(state.calls.some(([name]) => name === 'signOut'), false)
  })
})


test('saved review directory times out privately and rejects identity changes during body delivery',async()=>{
 for(const phase of ['timeout','identity'])await withAuth(async(mod,state)=>{
  state.session={...fixedSession};state.storage.set(MANAGED_WORKSPACE_STORAGE_KEY,'synthetic-company')
  const identity=await mod.currentManagedIdentity(),controller=new AbortController(),timeout=AbortSignal.timeout
  AbortSignal.timeout=ms=>{assert.equal(ms,8000);return controller.signal}
  try{
   state.fetch=async(_url,init)=>({ok:true,status:200,json:async()=>{
    if(phase==='identity'){state.storage.set(MANAGED_WORKSPACE_STORAGE_KEY,'other-company');return {reviews:[]}}
    return new Promise((_resolve,reject)=>{init.signal.addEventListener('abort',()=>reject(init.signal.reason),{once:true});queueMicrotask(()=>controller.abort(new DOMException('Timed out','TimeoutError')))})
   }})
   await assert.rejects(mod.loadManagedEcommerceReviews(identity),error=>phase==='identity'?error.code==='managed_identity_changed':error.name==='TimeoutError')
   assert.equal(state.calls.filter(([name])=>name==='fetch').length,1)
   assert.equal(state.calls.some(([name])=>name==='signOut'),false)
  }finally{AbortSignal.timeout=timeout}
 })
})


test('review 401 refresh retries exact requests only within the original identity', async () => {
  for (const write of [false, true]) for (const changed of [false, true]) await withAuth(async (mod, state) => {
    state.session = { ...fixedSession }
    state.storage.set(MANAGED_WORKSPACE_STORAGE_KEY, 'synthetic-company')
    const identity = await mod.currentManagedIdentity()
    const id = '11111111-1111-4111-8111-111111111111'
    const payload = { reviewId: id, commandId: id, previewDigest: 'sha256:' + 'a'.repeat(64), note: 'Exact retained request' }
    const path = '/api/trial/v1/ecommerce-reviews' + (write ? `/${id}/change-requests` : '')
    if (write) state.allowedPostPath = path
    state.refreshSession = async () => {
      state.session = { ...fixedSession, access_token: 'synthetic-refreshed-token',
        user: changed ? { ...fixedUser, id: 'different-user' } : fixedUser }
      return { data: { session: state.session }, error: null }
    }
    const attempts = []
    state.fetch = async (url, init) => {
      assert.equal(url, path)
      attempts.push(init)
      if (attempts.length === 1) return { ok: false, status: 401, json: async () => ({}) }
      return { ok: true, status: 200, json: async () => ({ retained: true }) }
    }
    const request = write ? mod.sendManagedEcommerceDecision(payload, identity) : mod.loadManagedEcommerceReviews(identity)
    if (changed) {
      await assert.rejects(request, error => error.code === 'managed_identity_changed')
      assert.equal(attempts.length, 1, 'changed user must never receive a retried command or private read')
    } else {
      assert.deepEqual(await request, { retained: true })
      assert.equal(attempts.length, 2)
      assert.equal(attempts[0].body, attempts[1].body)
      if (write) assert.deepEqual(JSON.parse(attempts[1].body), payload)
      assert.equal(attempts[1].headers.get('authorization'), 'Bearer synthetic-refreshed-token')
      assert.equal(attempts[1].headers.get('x-supermega-workspace-id'), 'synthetic-company')
      assert.equal(attempts[0].signal, attempts[1].signal, 'retry must not extend the original deadline')
    }
    assert.equal(state.calls.filter(([name]) => name === 'refreshSession').length, 1)
    assert.equal(state.calls.filter(([name]) => name === 'signOut').length, 0)
  })
})


test('terminal review authentication failures stop bounded retries without clearing local state', async () => {
  for (const failure of ['second401', 'refreshError', 'refreshThrows']) await withAuth(async (mod, state) => {
    state.session = { ...fixedSession }
    state.storage.set(MANAGED_WORKSPACE_STORAGE_KEY, 'synthetic-company')
    const identity = await mod.currentManagedIdentity()
    const id = '11111111-1111-4111-8111-111111111111'
    const payload = { reviewId: id, commandId: id, previewDigest: 'sha256:' + 'a'.repeat(64), note: 'Retain this decision' }
    const original = JSON.stringify(payload)
    state.allowedPostPath = `/api/trial/v1/ecommerce-reviews/${id}/change-requests`
    state.refreshSession = async () => {
      if (failure === 'refreshThrows') throw new Error('synthetic refresh unavailable')
      return failure === 'refreshError' ? { data: { session: null }, error: { message: 'refresh failed' } }
        : { data: { session: state.session }, error: null }
    }
    state.fetch = async (_url, init) => {
      assert.equal(init.body, original)
      return { ok: false, status: 401, json: async () => ({ detail: { code: 'auth_required', message: 'Sign in again.' } }) }
    }
    await assert.rejects(mod.sendManagedEcommerceDecision(payload, identity), error =>
      failure === 'refreshThrows' ? error.message === 'synthetic refresh unavailable' : error.code === 'auth_required' && error.status === 401)
    assert.equal(state.calls.filter(([name]) => name === 'fetch').length, failure === 'second401' ? 2 : 1)
    assert.equal(state.calls.filter(([name]) => name === 'refreshSession').length, 1)
    assert.equal(state.calls.some(([name]) => name === 'signOut' || name === 'storage-remove'), false)
    assert.equal(JSON.stringify(payload), original)
    assert.equal(state.storage.get(MANAGED_WORKSPACE_STORAGE_KEY), 'synthetic-company')
  })
})


test('stale workspace selection cannot overwrite a newer account selection', async () => {
  for (const kind of ['other-user', 'signed-out', 'anonymous', 'unlisted']) await withAuth(async (mod, state) => {
    state.storage.set(MANAGED_WORKSPACE_STORAGE_KEY, 'newer-company')
    state.session = kind === 'signed-out' ? null : { ...fixedSession,
      user: kind === 'other-user' ? { ...fixedUser, id: 'new-account' }
        : kind === 'anonymous' ? { ...fixedUser, is_anonymous: true } : fixedUser }
    const prior = { userId: fixedUser.id, email: fixedUser.email,
      workspaces: [{ workspaceId: 'old-company', label: 'Old company', access: 'owner' }] }
    await assert.rejects(mod.completeManagedWorkspaceSignIn(prior, kind === 'unlisted' ? 'not-assigned' : 'old-company'),
      error => error.code === (kind === 'unlisted' ? 'workspace_membership_missing' : 'managed_identity_changed'))
    assert.equal(state.storage.get(MANAGED_WORKSPACE_STORAGE_KEY), 'newer-company')
    assert.equal(state.calls.some(([name]) => ['fetch', 'storage-write', 'storage-remove', 'signOut'].includes(name)), false)
  })
})


test('installed SDK nonpersistent signup cleanup cannot touch workspace storage', async () => {
  const { AuthClient } = await import(pathToFileURL(requireShowroom.resolve('@supabase/auth-js')).href)
  let workspace = 'original-workspace-session'
  let requests = 0
  const token = `${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: fixedUser.id, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.synthetic`
  const client = new AuthClient({
    url: 'https://auth.example.invalid', persistSession: false, autoRefreshToken: false,
    detectSessionInUrl: false, storageKey: 'isolated-signup-sdk-test',
    storage: {
      getItem: () => { throw Error('persistent storage read') },
      setItem: () => { throw Error('persistent storage write') },
      removeItem: () => { throw Error('persistent storage removal') },
    },
    fetch: async (url, init) => {
      requests++
      if (String(url).endsWith('/signup')) return new Response(JSON.stringify({
        access_token: token, refresh_token: 'synthetic-refresh', token_type: 'bearer',
        expires_in: 3600, user: fixedUser,
      }), { status: 200, headers: { 'content-type': 'application/json' } })
      assert.equal(String(url), 'https://auth.example.invalid/logout?scope=local')
      assert.equal(new Headers(init.headers).get('authorization'), `Bearer ${token}`)
      workspace = 'newer-workspace-session'
      return new Response(null, { status: 204 })
    },
  })
  try {
    const result = await client.signUp({ email: fixedUser.email, password: signupInput.password })
    assert.equal(result.error, null)
    assert.equal(result.data.session.access_token, token)
    assert.equal((await client.signOut({ scope: 'local' })).error, null)
    assert.equal((await client.getSession()).data.session, null)
    assert.equal(workspace, 'newer-workspace-session')
    assert.equal(requests, 2)
  } finally { client.dispose() }
})


test('account setup has one business destination and no demo fallback', () => {
  const page = readFileSync(new URL('../showroom/src/core/ManagedAccountPage.tsx', import.meta.url), 'utf8')
  const unavailable = page.slice(page.indexOf('function ManagedUnavailable'), page.indexOf('export function ManagedAccountPage'))
  assert.doesNotMatch(unavailable, /demo|trial/i)
  assert.equal((unavailable.match(/href=\{managedAccountRequestUrl\(productIntent\)\}/g) || []).length, 1)
  assert.match(unavailable, /Set up your business/)
  for (const product of ['shop', 'website', 'ecommerce']) {
    const destination = new URL(managedAccountRequestUrl(product))
    assert.equal(destination.origin, 'https://supermega.dev')
    assert.equal(destination.pathname, '/contact/')
    assert.equal(destination.searchParams.get('product'), product)
    assert.equal(destination.searchParams.get('utm_medium'), 'business_setup')
  }
})
