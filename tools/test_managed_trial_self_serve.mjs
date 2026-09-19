import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  ManagedTrialError,
  createSelfServeWorkspace,
  managedBootstrapHasCapability,
  managedProductsFromBootstrap,
  normalizeSelfServeClaimCode,
  requestSelfServeWorkspace,
} from '../showroom/src/core/managed-trial.ts'

const CLAIM_CODE = 'SM-ABCD-2345'
const WORKSPACE_ID = 'c7a3fa0e-7f81-5cf3-9c2e-8f6d1a2b3c4d'
const BUSINESS_NAME = 'Yangon Tyre and Service'
const managedTrialSource = readFileSync(new URL('../showroom/src/core/managed-trial.ts', import.meta.url), 'utf8')

test('managed browser auth excludes unused Supabase database, realtime, storage, and function clients', () => {
  assert.match(managedTrialSource, /import type \{ Session \} from '@supabase\/auth-js'/)
  assert.match(managedTrialSource, /InstanceType<\s*typeof import\('@supabase\/auth-js'\)\.AuthClient\s*>/)
  assert.match(managedTrialSource, /import\('@supabase\/auth-js'\)\.then\(\(\{ AuthClient \}\) => \(\{/)
  assert.match(managedTrialSource, /url: new URL\('auth\/v1'/)
  assert.match(managedTrialSource, /Authorization: `Bearer \$\{SUPABASE_PUBLISHABLE_KEY\}`/)
  assert.match(managedTrialSource, /apikey: SUPABASE_PUBLISHABLE_KEY/)
  assert.match(managedTrialSource, /detectSessionInUrl: false/)
  assert.match(managedTrialSource, /persistSession: true/)
  assert.match(managedTrialSource, /storageKey: 'supermega\.auth\.session\.v1'/)
  assert.doesNotMatch(managedTrialSource, /@supabase\/supabase-js/)
})

const session = {
  access_token: 'header.payload.signature',
  user: {
    id: '2f8d24d8-308c-4dc8-a352-7b61df756728',
    email: 'owner@example.com',
    is_anonymous: false,
  },
}

function replaceGlobal(name, value) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, name)
  Object.defineProperty(globalThis, name, { configurable: true, value })
  return () => {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor)
    else delete globalThis[name]
  }
}

function activationResponse(overrides = {}) {
  return {
    contract: 'supermega.self_serve_workspace_activation.v1',
    status: 'created',
    workspace: { workspace_id: WORKSPACE_ID, label: BUSINESS_NAME, access: 'owner', product: 'commerce' },
    claim: { claimCode: CLAIM_CODE, workspaceId: WORKSPACE_ID },
    created_at: '2026-08-16T00:00:00+00:00',
    idempotent_replay: false,
    external_writes_performed: true,
    secret_values_exposed: false,
    ...overrides,
  }
}

function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return { ok, status, json: async () => body }
}

function mockFetch(handler) {
  const calls = []
  const restore = replaceGlobal('fetch', async (url, init = {}) => {
    calls.push({ url, init })
    return handler(url, init)
  })
  return { calls, restore }
}

test('posts the normalized claim and business name to the workspaces endpoint', async () => {
  const { calls, restore } = mockFetch(() => jsonResponse(activationResponse()))
  try {
    const workspace = await requestSelfServeWorkspace(session, ' sm-abcd-2345 ', `  ${BUSINESS_NAME}  `)
    assert.equal(calls.length, 1)
    assert.equal(calls[0].url, '/api/trial/v1/workspaces')
    assert.equal(calls[0].init.method, 'POST')
    assert.equal(calls[0].init.headers.get('accept'), 'application/json')
    assert.equal(calls[0].init.headers.get('authorization'), `Bearer ${session.access_token}`)
    assert.equal(calls[0].init.headers.get('content-type'), 'application/json')
    assert.deepEqual(JSON.parse(calls[0].init.body), {
      claimCode: CLAIM_CODE,
      businessName: BUSINESS_NAME,
      product: 'commerce',
    })
    assert.deepEqual(workspace, {
      workspaceId: WORKSPACE_ID,
      label: BUSINESS_NAME,
      access: 'owner',
      claimCode: CLAIM_CODE,
      product: 'commerce',
      created: true,
    })
  } finally {
    restore()
  }
})

test('maps a replayed activation to created: false', async () => {
  const { restore } = mockFetch(() => jsonResponse(activationResponse({
    status: 'already_created',
    idempotent_replay: true,
    external_writes_performed: false,
  })))
  try {
    const workspace = await requestSelfServeWorkspace(session, CLAIM_CODE, BUSINESS_NAME)
    assert.equal(workspace.created, false)
    assert.equal(workspace.workspaceId, WORKSPACE_ID)
  } finally {
    restore()
  }
})

test('carries a non-Shop product into the durable activation request', async () => {
  const response = activationResponse({
    workspace: { workspace_id: WORKSPACE_ID, label: BUSINESS_NAME, access: 'owner', product: 'website' },
  })
  const { calls, restore } = mockFetch(() => jsonResponse(response))
  try {
    const workspace = await requestSelfServeWorkspace(session, CLAIM_CODE, BUSINESS_NAME, 'website')
    assert.equal(JSON.parse(calls[0].init.body).product, 'website')
    assert.equal(workspace.product, 'website')
  } finally {
    restore()
  }
})

test('rejects invalid claim codes and business names before any request', async () => {
  const { calls, restore } = mockFetch(() => {
    throw new Error('fetch must not be called')
  })
  try {
    for (const claim of ['SM-ABCO-2345', 'SM-ABCI-2345', 'SM-ABC-2345', 'bogus', '']) {
      await assert.rejects(
        requestSelfServeWorkspace(session, claim, BUSINESS_NAME),
        (error) => error instanceof ManagedTrialError && error.code === 'claim_code_invalid',
      )
    }
    await assert.rejects(
      requestSelfServeWorkspace(session, CLAIM_CODE, '   '),
      (error) => error instanceof ManagedTrialError && error.code === 'business_name_invalid',
    )
    await assert.rejects(
      requestSelfServeWorkspace(session, CLAIM_CODE, 'x'.repeat(121)),
      (error) => error instanceof ManagedTrialError && error.code === 'business_name_invalid',
    )
    assert.equal(calls.length, 0)
  } finally {
    restore()
  }
})

test('normalizeSelfServeClaimCode uppercases and trims the claim', () => {
  assert.equal(normalizeSelfServeClaimCode(' sm-wxyz-7890 '), 'SM-WXYZ-7890')
  assert.throws(
    () => normalizeSelfServeClaimCode('SM-ABCU-2345'),
    (error) => error instanceof ManagedTrialError && error.code === 'claim_code_invalid',
  )
})

test('surfaces the typed server error codes through ManagedTrialError', async () => {
  const failures = [
    [503, 'activation_window_closed'],
    [403, 'email_verification_required'],
    [409, 'claim_code_conflict'],
    [409, 'trial_idempotency_conflict'],
    [429, 'self_serve_rate_limited'],
    [401, 'trial_auth_required'],
  ]
  for (const [status, code] of failures) {
    const { restore } = mockFetch(() => jsonResponse({ detail: { code } }, { ok: false, status }))
    try {
      await assert.rejects(
        requestSelfServeWorkspace(session, CLAIM_CODE, BUSINESS_NAME),
        (error) => error instanceof ManagedTrialError
          && error.code === code
          && error.status === status,
      )
    } finally {
      restore()
    }
  }
})

test('rejects activation responses that break the contract', async () => {
  const invalidBodies = [
    activationResponse({ contract: 'supermega.other.v1' }),
    activationResponse({ status: 'pending' }),
    activationResponse({ status: 'already_created' }), // replay flag disagrees
    activationResponse({ secret_values_exposed: true }),
    activationResponse({ workspace: { workspace_id: WORKSPACE_ID, label: BUSINESS_NAME, access: 'viewer' } }),
    activationResponse({ claim: { claimCode: 'SM-WXYZ-7890', workspaceId: WORKSPACE_ID } }),
    activationResponse({ claim: { claimCode: CLAIM_CODE, workspaceId: 'another-workspace' } }),
    { detail: 'not the contract at all' },
  ]
  for (const body of invalidBodies) {
    const { restore } = mockFetch(() => jsonResponse(body))
    try {
      await assert.rejects(
        requestSelfServeWorkspace(session, CLAIM_CODE, BUSINESS_NAME),
        (error) => error instanceof ManagedTrialError && error.code === 'self_serve_workspace_invalid',
      )
    } finally {
      restore()
    }
  }
})

test('createSelfServeWorkspace fails closed when managed auth is not configured', async () => {
  const { calls, restore } = mockFetch(() => {
    throw new Error('fetch must not be called')
  })
  try {
    // Under node there is no Vite build environment, so the Supabase client is
    // unavailable and the convenience wrapper must refuse before any network.
    await assert.rejects(
      createSelfServeWorkspace(CLAIM_CODE, BUSINESS_NAME),
      (error) => error instanceof ManagedTrialError && error.code === 'auth_not_configured',
    )
    assert.equal(calls.length, 0)
  } finally {
    restore()
  }
})

test('managed product access requires explicit activation-derived entitlements for every product', () => {
  const identity = { workspaceId: WORKSPACE_ID, userId: session.user.id, email: session.user.email }
  const bootstrap = {
    identity: { workspace_id: WORKSPACE_ID, actor_id: session.user.id, actor_kind: 'human' },
    readiness: {},
    states: {
      company: { surface: 'company', version: 0, state: {}, updated_by: '', updated_at: '' },
      commerce: { surface: 'commerce', version: 0, state: {}, updated_by: '', updated_at: '' },
      website: { surface: 'website', version: 0, state: {}, updated_by: '', updated_at: '' },
      setup: { surface: 'setup', version: 0, state: {}, updated_by: '', updated_at: '' },
    },
    approvals: [],
  }
  assert.deepEqual(managedProductsFromBootstrap(bootstrap, identity), [])
  assert.deepEqual(
    managedProductsFromBootstrap({ ...bootstrap, readiness: { productEntitlements: ['commerce'] } }, identity),
    ['commerce'],
  )
  assert.deepEqual(
    managedProductsFromBootstrap({ ...bootstrap, readiness: { productEntitlements: ['ecommerce'] } }, identity),
    ['ecommerce'],
  )
  assert.deepEqual(
    managedProductsFromBootstrap({ ...bootstrap, readiness: { productEntitlements: ['production'] } }, identity),
    [],
  )
  assert.throws(
    () => managedProductsFromBootstrap({ ...bootstrap, readiness: { productEntitlements: ['ecommerce', 'commerce'] } }, identity),
    (error) => error instanceof ManagedTrialError && error.code === 'managed_bootstrap_invalid',
  )
  assert.deepEqual(managedProductsFromBootstrap({ ...bootstrap, states: { company: bootstrap.states.company, setup: bootstrap.states.setup } }, identity), [])
  assert.throws(
    () => managedProductsFromBootstrap({ ...bootstrap, identity: { ...bootstrap.identity, workspace_id: 'another-company' } }, identity),
    (error) => error instanceof ManagedTrialError && error.code === 'managed_identity_changed',
  )
})

test('managed staff writes require an explicit valid surface capability', () => {
  const identity = { workspaceId: WORKSPACE_ID, userId: session.user.id, email: session.user.email }
  const bootstrap = {
    identity: { workspace_id: WORKSPACE_ID, actor_id: session.user.id, actor_kind: 'human' },
    readiness: { capabilities: ['commerce.read', 'company.read'] },
    states: {},
    approvals: [],
  }
  assert.equal(managedBootstrapHasCapability(bootstrap, identity, 'commerce.write'), false)
  assert.equal(managedBootstrapHasCapability({
    ...bootstrap,
    readiness: { capabilities: ['commerce.read', 'commerce.write', 'company.read'] },
  }, identity, 'commerce.write'), true)
  assert.equal(managedBootstrapHasCapability({ ...bootstrap, readiness: {} }, identity, 'commerce.write'), false)
  for (const capabilities of [
    ['commerce.write', 'commerce.read'],
    ['commerce.read', 'commerce.read'],
    ['commerce.read', 'Admin.All'],
  ]) {
    assert.throws(
      () => managedBootstrapHasCapability({ ...bootstrap, readiness: { capabilities } }, identity, 'commerce.write'),
      (error) => error instanceof ManagedTrialError && error.code === 'managed_bootstrap_invalid',
    )
  }
})
