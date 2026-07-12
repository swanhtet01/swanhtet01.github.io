import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  applyProvisionPlan,
  buildProvisionPlan,
  requiredSecretGroups,
  resolveProvisionEnvironment,
  validateClientManifest,
  verifyClientDataSpine,
  verifyProvisionedClient,
} from './workcell-provision.mjs'

const MANIFEST = {
  version: 1,
  clientSlug: 'acme-trading',
  clientName: 'Acme Trading',
  workcells: ['owner-command'],
  timeZone: 'Asia/Yangon',
  currency: 'MMK',
  lookbackHours: 24,
  clickupListId: '123456789',
  deliveryUtc: '01:30',
  tokenCap: 150000,
}

const SECRET_ENV = {
  SUPERMEGA_NEW_CLIENT_OPS_KEY: 'new-client-ops-secret',
  SUPERMEGA_NEW_CLIENT_ANTHROPIC_API_KEY: 'anthropic-secret',
  SUPERMEGA_NEW_CLIENT_SUPABASE_URL: 'https://client-project.supabase.co',
  SUPERMEGA_NEW_CLIENT_SUPABASE_SERVICE_ROLE_KEY: 'supabase-secret',
  SUPERMEGA_NEW_CLIENT_TELEGRAM_BOT_TOKEN: 'telegram-secret',
  SUPERMEGA_NEW_CLIENT_TELEGRAM_ALERT_CHAT_ID: '123456',
  SUPERMEGA_NEW_CLIENT_PAYPAL_CLIENT_ID: 'paypal-client',
  SUPERMEGA_NEW_CLIENT_PAYPAL_CLIENT_SECRET: 'paypal-secret',
  SUPERMEGA_NEW_CLIENT_PIPEDRIVE_ACCESS_TOKEN: 'pipedrive-secret',
  SUPERMEGA_NEW_CLIENT_CLICKUP_ACCESS_TOKEN: 'clickup-secret',
}

test('client manifest normalizes one isolated owner-command project', () => {
  const manifest = validateClientManifest(MANIFEST)
  assert.equal(manifest.projectName, 'supermega-wc-acme-trading')
  assert.equal(manifest.clientId, 'workcell-acme-trading')
  assert.deepEqual(manifest.workcells, ['owner-command'])
  assert.equal(manifest.tokenCap, 150000)
  assert.equal(manifest.deliveryUtc, '01:30')
  assert.throws(() => validateClientManifest({ ...MANIFEST, clientSlug: '../escape' }), /manifest_invalid_client_slug/)
  assert.throws(() => validateClientManifest({ ...MANIFEST, timeZone: 'Mars/Olympus' }), /manifest_invalid_time_zone/)
  assert.throws(() => validateClientManifest({ ...MANIFEST, workcells: ['invented'] }), /manifest_unknown_workcell/)
  assert.throws(() => validateClientManifest({ ...MANIFEST, clickupListId: '../../secret' }), /manifest_clickup_list_id_required/)
  assert.throws(() => validateClientManifest({ ...MANIFEST, clientName: 'Acme\u001b[2J' }), /manifest_client_name_required/)
  assert.throws(() => validateClientManifest({ ...MANIFEST, clientId: '../shared' }), /manifest_invalid_client_id/)
})

test('required secrets derive from selected workcells and plan output never contains values', () => {
  const groups = requiredSecretGroups(MANIFEST).map((group) => group.target)
  assert.ok(groups.includes('PAYPAL_CLIENT_ID'))
  assert.ok(groups.includes('PIPEDRIVE_ACCESS_TOKEN|PIPEDRIVE_API_TOKEN'))
  assert.ok(groups.includes('CLICKUP_ACCESS_TOKEN|CLICKUP_API_TOKEN'))

  const plan = buildProvisionPlan(MANIFEST, {
    scope: 'test-team',
    env: SECRET_ENV,
    sourceDirectory: 'C:\\source\\kernel',
    randomBytes: () => Buffer.from('deterministic-cron-secret'),
  })
  assert.equal(plan.confirmation, 'PROVISION supermega-wc-acme-trading')
  assert.equal(plan.cron.expression, '30 1 * * *')
  assert.equal(plan.missingSecrets.length, 0)
  assert.equal(plan.missingSecretInputs.length, 0)
  assert.ok(plan.secretNames.includes('CRON_SECRET'))
  assert.ok(plan.requiredSecretInputs.includes('SUPERMEGA_NEW_CLIENT_SUPABASE_SERVICE_ROLE_KEY'))
  const serialized = JSON.stringify(plan)
  for (const secret of Object.values(SECRET_ENV)) assert.doesNotMatch(serialized, new RegExp(secret.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))

  const inherited = resolveProvisionEnvironment(MANIFEST, {
    SUPABASE_URL: 'https://shared.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'shared-service-role',
    PAYPAL_CLIENT_SECRET: 'shared-paypal',
    ANTHROPIC_API_KEY: 'shared-model',
  })
  assert.ok(inherited.missingSecretInputs.includes('SUPERMEGA_NEW_CLIENT_SUPABASE_URL'))
  assert.equal(inherited.secrets.has('SUPABASE_URL'), false)
  assert.equal(inherited.secrets.has('PAYPAL_CLIENT_SECRET'), false)
})

test('secret resolution uses aliases, generates cron auth, and rejects multiline values', () => {
  const env = {
    ...SECRET_ENV,
    SUPERMEGA_NEW_CLIENT_ANTHROPIC_API_KEY: '',
    SUPERMEGA_NEW_CLIENT_OPENROUTER_API_KEY: 'openrouter-secret',
    SUPERMEGA_NEW_CLIENT_TELEGRAM_ALERT_CHAT_ID: '',
    SUPERMEGA_NEW_CLIENT_TELEGRAM_CHAT_ID: 'fallback-chat',
    SUPERMEGA_NEW_CLIENT_PIPEDRIVE_ACCESS_TOKEN: '',
    SUPERMEGA_NEW_CLIENT_PIPEDRIVE_API_TOKEN: 'pipedrive-api-secret',
  }
  const result = resolveProvisionEnvironment(MANIFEST, env, {
    randomBytes: () => Buffer.from('generated-cron'),
  })
  assert.equal(result.missingSecrets.length, 0)
  assert.equal(result.secrets.get('SUPERMEGA_OPS_KEY'), 'new-client-ops-secret')
  assert.equal(result.secrets.get('OPENROUTER_API_KEY'), 'openrouter-secret')
  assert.equal(result.secrets.get('TELEGRAM_ALERT_CHAT_ID'), 'fallback-chat')
  assert.equal(result.secrets.get('PIPEDRIVE_API_TOKEN'), 'pipedrive-api-secret')
  assert.equal(result.secrets.get('CRON_SECRET'), Buffer.from('generated-cron').toString('base64url'))
  assert.throws(
    () => resolveProvisionEnvironment(MANIFEST, { ...SECRET_ENV, SUPERMEGA_NEW_CLIENT_PAYPAL_CLIENT_SECRET: 'bad\nvalue' }),
    /secret_contains_line_break:SUPERMEGA_NEW_CLIENT_PAYPAL_CLIENT_SECRET/,
  )
})

test('data-spine preflight proves table access and atomic claims without leaving its probe', async () => {
  const resolved = resolveProvisionEnvironment(MANIFEST, SECRET_ENV)
  const calls = []
  let writes = 0
  const result = await verifyClientDataSpine(resolved, {
    fetch: async (url, options) => {
      calls.push({ url, options })
      if (options?.method === 'POST') {
        writes += 1
        return { ok: true, async json() { return writes === 1 ? [{ id: 'probe' }] : [] } }
      }
      return { ok: true, async json() { return [] } }
    },
    randomBytes: () => Buffer.from('fixed-probe'),
  })
  assert.deepEqual(result.tables, ['supermega_console_activity', 'supermega_token_ledger', 'supermega_ai_cache', 'supermega_action_queue'])
  assert.equal(result.idempotentClaim, true)
  assert.equal(result.probeCleaned, true)
  assert.deepEqual(calls.map((call) => call.options?.method || 'GET'), ['GET', 'GET', 'GET', 'GET', 'POST', 'POST', 'DELETE'])
  assert.equal(calls.every((call) => call.options.headers.apikey === 'supabase-secret'), true)
  assert.equal(JSON.parse(calls[4].options.body).id, JSON.parse(calls[5].options.body).id)
  assert.doesNotMatch(JSON.stringify(result), /supabase-secret/)
  await assert.rejects(
    verifyClientDataSpine(resolved, { fetch: async () => ({ ok: false, status: 404 }) }),
    /client_data_spine_schema_missing:supermega_console_activity/,
  )

  const failedCalls = []
  await assert.rejects(
    verifyClientDataSpine(resolved, {
      fetch: async (url, options) => {
        failedCalls.push(options?.method || 'GET')
        if (options?.method === 'POST') return { ok: true, async json() { return [] } }
        return { ok: true, async json() { return [] } }
      },
    }),
    /client_data_spine_claim_insert_failed/,
  )
  assert.equal(failedCalls.at(-1), 'DELETE')
})

async function fixtureSource() {
  const source = await mkdtemp(join(tmpdir(), 'workcell-source-'))
  await mkdir(join(source, 'public'))
  await writeFile(join(source, 'public', 'index.html'), '<!doctype html><title>Workcell</title>')
  await writeFile(join(source, 'vercel.json'), JSON.stringify({ crons: [{ path: '/api/brief', schedule: '30 1 * * *' }], routes: [] }))
  return source
}

test('apply creates, links, configures, deploys, and verifies without secrets in command arguments', async () => {
  const source = await fixtureSource()
  const tempParent = await mkdtemp(join(tmpdir(), 'workcell-apply-parent-'))
  const calls = []
  let copiedConfig
  let applyCwd
  const run = async (args, options = {}) => {
    calls.push({ args: [...args], input: options.input, cwd: options.cwd })
    if (args.slice(0, 3).join(' ') === 'vercel project inspect') {
      return { code: 1, stdout: '', stderr: 'Error: There is no project for "supermega-wc-acme-trading"' }
    }
    if (args.slice(0, 2).join(' ') === 'vercel deploy') {
      applyCwd = options.cwd
      copiedConfig = JSON.parse(await readFile(join(options.cwd, 'vercel.json'), 'utf8'))
      return { code: 0, stdout: 'https://supermega-wc-acme-trading.vercel.app\n', stderr: '' }
    }
    return { code: 0, stdout: '{}', stderr: '' }
  }
  try {
    const result = await applyProvisionPlan(MANIFEST, {
      scope: 'test-team',
      env: SECRET_ENV,
      sourceDirectory: source,
      sourceClean: true,
      confirm: 'PROVISION supermega-wc-acme-trading',
      tempRoot: tempParent,
      randomBytes: () => Buffer.from('generated-cron'),
      run,
      verifyDataSpine: async () => ({ ok: true, idempotentClaim: true, probeCleaned: true }),
      verify: async (url, options) => ({ url, selected: options.workcells, connectors: 69 }),
    })
    assert.equal(result.ok, true)
    assert.equal(result.dataSpine.idempotentClaim, true)
    assert.equal(result.deploymentUrl, 'https://supermega-wc-acme-trading.vercel.app')
    assert.deepEqual(copiedConfig.crons, [{ path: '/api/brief', schedule: '30 1 * * *' }])
    assert.ok(calls.some((call) => call.args.slice(0, 4).join(' ') === 'vercel project add supermega-wc-acme-trading'))
    assert.ok(calls.some((call) => call.args.slice(0, 2).join(' ') === 'vercel link'))
    assert.ok(calls.some((call) => call.args.slice(0, 2).join(' ') === 'vercel deploy'))
    assert.equal(calls.some((call) => call.args.includes('--format')), false)
    const envCalls = calls.filter((call) => call.args.slice(0, 3).join(' ') === 'vercel env add')
    assert.equal(envCalls.length, result.variablesApplied.length + result.secretsApplied.length)
    const commandText = JSON.stringify(calls.map((call) => call.args))
    const resultText = JSON.stringify(result)
    for (const secret of [...Object.values(SECRET_ENV), Buffer.from('generated-cron').toString('base64url')]) {
      assert.doesNotMatch(commandText, new RegExp(secret.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
      assert.doesNotMatch(resultText, new RegExp(secret.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
      assert.ok(envCalls.some((call) => call.input === secret), `secret ${secret.slice(0, 4)}... must travel over stdin`)
    }
    await assert.rejects(stat(applyCwd), /ENOENT/)
  } finally {
    await rm(source, { recursive: true, force: true })
    await rm(tempParent, { recursive: true, force: true })
  }
})

test('apply refuses missing confirmation, missing secrets, dirty source, and existing projects', async () => {
  const source = await fixtureSource()
  try {
    await assert.rejects(
      applyProvisionPlan(MANIFEST, { scope: 'team', env: SECRET_ENV, sourceDirectory: source, sourceClean: true }),
      /confirmation_required:PROVISION supermega-wc-acme-trading/,
    )
    await assert.rejects(
      applyProvisionPlan(MANIFEST, { scope: 'team', env: {}, sourceDirectory: source, sourceClean: true, confirm: 'PROVISION supermega-wc-acme-trading' }),
      /missing_secrets:/,
    )
    await assert.rejects(
      applyProvisionPlan(MANIFEST, { scope: 'team', env: SECRET_ENV, sourceDirectory: source, sourceClean: false, confirm: 'PROVISION supermega-wc-acme-trading' }),
      /source_tree_not_clean/,
    )
    await assert.rejects(
      applyProvisionPlan(MANIFEST, {
        scope: 'team', env: SECRET_ENV, sourceDirectory: source, sourceClean: true,
        confirm: 'PROVISION supermega-wc-acme-trading',
        verifyDataSpine: async () => ({ ok: true }),
        run: async () => ({ code: 0, stdout: '{}', stderr: '' }),
      }),
      /project_already_exists/,
    )
  } finally {
    await rm(source, { recursive: true, force: true })
  }
})

test('failed data-spine proof stops before every Vercel command', async () => {
  const source = await fixtureSource()
  let commands = 0
  try {
    await assert.rejects(
      applyProvisionPlan(MANIFEST, {
        scope: 'team',
        env: SECRET_ENV,
        sourceDirectory: source,
        sourceClean: true,
        confirm: 'PROVISION supermega-wc-acme-trading',
        verifyDataSpine: async () => { throw new Error('client_data_spine_claim_not_idempotent') },
        run: async () => { commands += 1; return { code: 0, stdout: '', stderr: '' } },
      }),
      /client_data_spine_claim_not_idempotent/,
    )
    assert.equal(commands, 0)
  } finally {
    await rm(source, { recursive: true, force: true })
  }
})

test('project inspection auth or network failures never become create operations', async () => {
  const source = await fixtureSource()
  const calls = []
  try {
    await assert.rejects(
      applyProvisionPlan(MANIFEST, {
        scope: 'team',
        env: SECRET_ENV,
        sourceDirectory: source,
        sourceClean: true,
        confirm: 'PROVISION supermega-wc-acme-trading',
        verifyDataSpine: async () => ({ ok: true }),
        run: async (args) => {
          calls.push(args)
          return { code: 1, stdout: '', stderr: 'Error: Authentication required' }
        },
      }),
      /vercel_project_inspection_failed/,
    )
    assert.equal(calls.length, 1)
    assert.deepEqual(calls[0].slice(0, 3), ['vercel', 'project', 'inspect'])
  } finally {
    await rm(source, { recursive: true, force: true })
  }
})

test('client SQL bootstrap contains the exact durable workcell contract', async () => {
  const sql = await readFile(new URL('./supabase/workcell-client.sql', import.meta.url), 'utf8')
  for (const table of ['supermega_console_activity', 'supermega_token_ledger', 'supermega_ai_cache', 'supermega_action_queue']) {
    assert.match(sql, new RegExp(`create table if not exists public\\.${table}`))
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`))
    assert.match(sql, new RegExp(`revoke all on public\\.${table} from anon, authenticated`))
  }
  assert.match(sql, /create index if not exists supermega_action_queue_status_created_idx/)
  assert.match(sql, /primary key \(tenant_id, "window"\)/)
})

test('live verifier requires healthy status and every selected workcell', async () => {
  const responses = [
    { ok: true, service: 'supermega-kernel', connectors: { total: 69, registrationErrors: 0 } },
    { ok: true, workcells: [{ slug: 'owner-command', configured: true, missing: [] }] },
  ]
  const fetchCalls = []
  const fetch = async (url, options = {}) => {
    fetchCalls.push({ url, options })
    const body = responses.shift()
    return { ok: true, async json() { return body } }
  }
  const result = await verifyProvisionedClient('https://client.vercel.app', {
    fetch,
    opsKey: 'ops-secret',
    workcells: ['owner-command'],
  })
  assert.equal(result.connectors, 69)
  assert.equal(result.workcells[0].configured, true)
  assert.equal(fetchCalls[1].options.headers['x-ops-key'], 'ops-secret')
  assert.doesNotMatch(JSON.stringify(result), /ops-secret/)

  await assert.rejects(
    verifyProvisionedClient('https://client.vercel.app', {
      fetch: async (url) => ({
        ok: true,
        async json() {
          return url.endsWith('/api/status')
            ? { ok: true, service: 'supermega-kernel', connectors: {} }
            : { ok: true, workcells: [{ slug: 'owner-command', configured: false, missing: ['tool:crm_deals_read'] }] }
        },
      }),
      opsKey: 'ops-secret',
      workcells: ['owner-command'],
    }),
    /provision_workcell_not_configured:owner-command/,
  )
})
