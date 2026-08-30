import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const ENV_KEYS = [
  'SUPERMEGA_OPS_KEY',
  'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_KEY',
  'POSTGRES_URL_NON_POOLING', 'POSTGRES_URL', 'DATABASE_URL_UNPOOLED', 'POSTGRES_PRISMA_URL',
  'SUPERMEGA_DATABASE_URL', 'DATABASE_URL',
  'TELEGRAM_BOT_TOKEN', 'TELEGRAM_ALERT_CHAT_ID', 'TELEGRAM_CHAT_ID',
]

const captureEnvironment = () => Object.fromEntries(ENV_KEYS.map((name) => [name, {
  present: Object.hasOwn(process.env, name),
  value: process.env[name],
}]))

function restoreEnvironment(saved) {
  for (const name of ENV_KEYS) {
    if (saved[name].present) process.env[name] = saved[name].value
    else delete process.env[name]
  }
}

const CONFORMING_KEY = 'console-error-recording-key-0123456789'

function conversionRecordId(kind, leadId) {
  const digest = createHash('sha256')
    .update(`supermega.lead-conversion-${kind}.v1:${leadId}`)
    .digest('hex')
  return `lead-${kind}-${digest.slice(0, 40)}`
}

test('lead conversion records the won stage before it logs a clean win', async () => {
  const saved = captureEnvironment()
  try {
    for (const name of ENV_KEYS) delete process.env[name]
    process.env.SUPERMEGA_OPS_KEY = CONFORMING_KEY
    const { handle } = await import(`./console/api.mjs?convert-integrity=${Date.now()}-${Math.random()}`)
    const store = (await import('./store.mjs')).default
    assert.equal(store.mode, 'memory', 'this test must not touch a real database')

    const leadId = `lead-convert-integrity-${Date.now()}`
    const headers = { 'x-ops-key': CONFORMING_KEY }
    const created = await handle({
      method: 'POST',
      path: '/api/leads',
      headers,
      body: {
        id: leadId,
        source: 'test',
        name: 'Owner',
        company: 'Pilot Shop',
        contact: 'owner@example.invalid',
        package: 'build',
        stage: 'qualified',
      },
    })
    assert.equal(created.status, 200)

    const converted = await handle({
      method: 'POST',
      path: `/api/leads/${leadId}`,
      query: { action: 'convert' },
      headers,
      body: {},
    })
    assert.equal(converted.status, 200)
    assert.equal(converted.json.lead.stage, 'won')

    const storedLead = await store.getLead(leadId)
    assert.equal(storedLead.stage, 'won')
    const activity = await store.listActivity(100)
    const wonEntry = activity.find((entry) => entry.kind === 'won' && entry.ref === converted.json.project.id)
    assert.ok(wonEntry, 'a clean win activity entry should exist only after the lead stage is durable')
  } finally {
    restoreEnvironment(saved)
  }
})

test('lead conversion retry reconciles its partial project without duplicate client or project records', async () => {
  const saved = captureEnvironment()
  let store
  let originalUpdateLead
  try {
    for (const name of ENV_KEYS) delete process.env[name]
    process.env.SUPERMEGA_OPS_KEY = CONFORMING_KEY
    const { handle } = await import(`./console/api.mjs?convert-retry=${Date.now()}-${Math.random()}`)
    store = (await import('./store.mjs')).default
    assert.equal(store.mode, 'memory', 'this test must not touch a real database')

    const leadId = `lead-convert-retry-${Date.now()}`
    const headers = { 'x-ops-key': CONFORMING_KEY }
    const created = await handle({
      method: 'POST',
      path: '/api/leads',
      headers,
      body: {
        id: leadId,
        source: 'test',
        name: 'Retry Owner',
        company: 'Retry Shop',
        contact: 'retry@example.invalid',
        package: 'build',
        stage: 'qualified',
      },
    })
    assert.equal(created.status, 200)

    const clientsBefore = (await store.listClients()).length
    const projectsBefore = (await store.listProjects()).length
    originalUpdateLead = store.updateLead
    let rejectWonOnce = true
    store.updateLead = async (...args) => {
      if (args[0] === leadId && args[1]?.stage === 'won' && rejectWonOnce) {
        rejectWonOnce = false
        throw new Error('simulated_won_stage_failure')
      }
      return originalUpdateLead(...args)
    }

    const first = await handle({
      method: 'POST', path: `/api/leads/${leadId}`, query: { action: 'convert' }, headers, body: {},
    })
    assert.equal(first.status, 500)
    assert.equal(first.json.reason, 'lead_won_stage_update_failed')
    const partialProjects = (await store.listProjects()).filter((project) => project.lead_id === leadId)
    assert.equal(partialProjects.length, 1)
    assert.equal((await store.listClients()).length, clientsBefore + 1)
    assert.equal((await store.listProjects()).length, projectsBefore + 1)

    const retried = await handle({
      method: 'POST', path: `/api/leads/${leadId}`, query: { action: 'convert' }, headers, body: {},
    })
    assert.equal(retried.status, 200)
    assert.equal(retried.json.replayed, true)
    assert.equal(retried.json.project.id, partialProjects[0].id)
    assert.equal(retried.json.client.id, partialProjects[0].client_id)
    assert.equal(retried.json.lead.stage, 'won')
    assert.equal((await store.listClients()).length, clientsBefore + 1, 'retry must not create another client')
    assert.equal((await store.listProjects()).length, projectsBefore + 1, 'retry must not create another project')

    const replay = await handle({
      method: 'POST', path: `/api/leads/${leadId}`, query: { action: 'convert' }, headers, body: {},
    })
    assert.equal(replay.status, 200)
    assert.equal(replay.json.replayed, true)
    assert.equal(replay.json.project.id, partialProjects[0].id)
    assert.equal((await store.listProjects()).filter((project) => project.lead_id === leadId).length, 1)

    const ambiguousLeadId = `lead-convert-ambiguous-${Date.now()}`
    await store.insertLead({ id: ambiguousLeadId, name: 'Ambiguous Owner', company: 'Ambiguous Shop', stage: 'qualified' })
    const firstClient = await store.createClient({ name: 'First conversion client' })
    const secondClient = await store.createClient({ name: 'Second conversion client' })
    await store.createProject({ client_id: firstClient.id, lead_id: ambiguousLeadId, offer: 'build' })
    await store.createProject({ client_id: secondClient.id, lead_id: ambiguousLeadId, offer: 'build' })
    const projectsBeforeBlockedReplay = (await store.listProjects()).length
    const blockedReplay = await handle({
      method: 'POST', path: `/api/leads/${ambiguousLeadId}`, query: { action: 'convert' }, headers, body: {},
    })
    assert.equal(blockedReplay.status, 409)
    assert.equal(blockedReplay.json.reason, 'lead_conversion_ambiguous')
    assert.equal((await store.listProjects()).length, projectsBeforeBlockedReplay, 'ambiguous history must fail before another project')
  } finally {
    if (store && originalUpdateLead) store.updateLead = originalUpdateLead
    restoreEnvironment(saved)
  }
})

test('concurrent lead conversion writers resolve to one deterministic client and project', async () => {
  const saved = captureEnvironment()
  let store
  let originalGetProject
  try {
    for (const name of ENV_KEYS) delete process.env[name]
    process.env.SUPERMEGA_OPS_KEY = CONFORMING_KEY
    const { handle } = await import(`./console/api.mjs?convert-concurrent=${Date.now()}-${Math.random()}`)
    store = (await import('./store.mjs')).default
    assert.equal(store.mode, 'memory', 'this test must not touch a real database')

    const leadId = `lead-convert-concurrent-${Date.now()}`
    const projectId = conversionRecordId('project', leadId)
    const clientId = conversionRecordId('client', leadId)
    const headers = { 'x-ops-key': CONFORMING_KEY }
    await store.insertLead({ id: leadId, name: 'Concurrent Owner', company: 'Concurrent Shop', stage: 'qualified' })

    originalGetProject = store.getProject
    let waiting = 0
    let release
    const bothReadMissing = new Promise((resolveBarrier) => { release = resolveBarrier })
    store.getProject = async (id) => {
      if (id !== projectId) return originalGetProject(id)
      waiting += 1
      if (waiting === 2) release()
      await bothReadMissing
      if (waiting <= 2) return null
      return originalGetProject(id)
    }

    const request = () => handle({
      method: 'POST', path: `/api/leads/${leadId}`, query: { action: 'convert' }, headers, body: {},
    })
    const [first, second] = await Promise.all([request(), request()])
    assert.equal(first.status, 200)
    assert.equal(second.status, 200)
    assert.equal(first.json.client.id, clientId)
    assert.equal(second.json.client.id, clientId)
    assert.equal(first.json.project.id, projectId)
    assert.equal(second.json.project.id, projectId)
    assert.equal((await store.listClients()).filter((client) => client.id === clientId).length, 1)
    assert.equal((await store.listProjects()).filter((project) => project.lead_id === leadId).length, 1)
  } finally {
    if (store && originalGetProject) store.getProject = originalGetProject
    restoreEnvironment(saved)
  }
})

test('lead conversion rejects a deterministic client paired with another client project', async () => {
  const saved = captureEnvironment()
  try {
    for (const name of ENV_KEYS) delete process.env[name]
    process.env.SUPERMEGA_OPS_KEY = CONFORMING_KEY
    const { handle } = await import(`./console/api.mjs?convert-lineage=${Date.now()}-${Math.random()}`)
    const store = (await import('./store.mjs')).default
    assert.equal(store.mode, 'memory', 'this test must not touch a real database')

    const leadId = `lead-convert-lineage-${Date.now()}`
    const deterministicClientId = conversionRecordId('client', leadId)
    const headers = { 'x-ops-key': CONFORMING_KEY }
    await store.insertLead({ id: leadId, name: 'Lineage Owner', company: 'Lineage Shop', stage: 'qualified' })
    await store.createClient({ id: deterministicClientId, name: 'Deterministic conversion client' })
    const otherClient = await store.createClient({ name: 'Other valid client' })
    const conflictingProject = await store.createProject({ client_id: otherClient.id, lead_id: leadId, offer: 'build' })
    const projectCount = (await store.listProjects()).length

    const blocked = await handle({
      method: 'POST', path: `/api/leads/${leadId}`, query: { action: 'convert' }, headers, body: {},
    })
    assert.equal(blocked.status, 409)
    assert.equal(blocked.json.reason, 'lead_conversion_ambiguous')
    assert.equal((await store.listProjects()).length, projectCount)
    assert.equal((await store.getLead(leadId)).stage, 'qualified')
    assert.equal((await store.getProject(conflictingProject.id)).client_id, otherClient.id)
  } finally {
    restoreEnvironment(saved)
  }
})

test('console error handling contract records safe metadata and never request bodies', async () => {
  const source = await readFile(resolve(import.meta.dirname, 'console/api.mjs'), 'utf8')
  const storeSource = await readFile(resolve(import.meta.dirname, 'store.mjs'), 'utf8')
  assert.match(source, /import \{ captureError \} from '\.\.\/alert\.mjs'/)
  assert.match(source, /const recordConsoleError = \(context, detail, meta = \{\}\) => captureError/)
  assert.match(source, /store\.updateLead\(seg\[1\], \{ stage: 'won' \}\)\.catch\(async \(error\) =>/)
  assert.match(source, /lead_won_stage_update_failed/)
  assert.match(source, /matchingProjects\.length > 1/)
  assert.match(source, /lead_conversion_ambiguous/)
  assert.match(source, /leadConversionRecordId\('client', lead\.id\)/)
  assert.match(source, /leadConversionRecordId\('project', lead\.id\)/)
  assert.match(source, /store\.createProject\(\{ id: projectId,/)
  assert.match(storeSource, /const row = \{ id: String\(p\.id \|\| randomUUID\(\)\), client_id:/)
  assert.match(source, /replayed: true/)
  assert.match(source, /await recordConsoleError\('console\.api_unhandled_error', err, \{ method, path: safePath\(path\) \}\)/)
  assert.doesNotMatch(source, /console\.api_unhandled_error[\s\S]{0,160}body/)
  assert.match(source, /console\.activity_log_failed/)
  assert.match(source, /console\.deal_graduation_failed/)
  assert.match(source, /console\.project_shipped_graduation_failed/)
})
