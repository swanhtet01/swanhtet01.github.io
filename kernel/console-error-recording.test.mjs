import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import {
  OPERATING_ACTION_BOARD_CONTRACT,
  OPERATING_ACTION_BOARD_MODE,
  buildOperatingActionBoardSummary,
  validateOperatingActionBoard,
} from './operating-action-board.mjs'

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

function operatingBoardWithDueDate(dueDate) {
  const action = {
    id: 'strict-date-regression',
    openedAt: '2026-08-25T00:00:00.000Z',
    productIds: ['shop'],
    sourceFinding: {
      sourceType: 'release_gate',
      label: 'Strict calendar date regression',
      evidenceRef: 'kernel/operating-action-board.mjs',
      evidenceDigest: `sha256:${'a'.repeat(64)}`,
    },
    recommendation: 'Reject impossible calendar dates before an owner action is accepted.',
    severity: 'high',
    businessImpact: { kind: 'release_risk', estimateLabel: 'Prevents normalized impossible due dates.', measured: false },
    owner: { role: 'Founder plus Engineering', namedPrivate: false },
    dueDate,
    status: 'owner-gated',
    authority: { ownerApprovalRequired: true, externalWriteAllowed: false },
    acceptance: { evidenceRequired: ['Exact UTC calendar date'], tests: ['focused date regression'] },
    closure: { closedAt: null, closureNote: null, measuredResult: null },
  }
  return {
    contract: OPERATING_ACTION_BOARD_CONTRACT,
    generatedAt: '2026-08-25T00:00:00.000Z',
    mode: OPERATING_ACTION_BOARD_MODE,
    products: ['shop', 'plant', 'website', 'ecommerce'],
    controls: {
      externalWritesPerformed: false,
      gitRemoteWritesPerformed: false,
      githubWritesPerformed: false,
      vercelDeploymentsPerformed: false,
      supabaseMutationsPerformed: false,
      credentialValuesInspected: false,
      customerContactPerformed: false,
      paymentOrStockActionPerformed: false,
      managedActivationPerformed: false,
      privateIdentityExposed: false,
    },
    weeklyReport: buildOperatingActionBoardSummary([action]),
    actions: [action],
  }
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
  let originalMarkLeadWon
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
    originalMarkLeadWon = store.markLeadWon
    let rejectWonOnce = true
    store.markLeadWon = async (...args) => {
      if (args[0] === leadId && rejectWonOnce) {
        rejectWonOnce = false
        throw new Error('simulated_won_stage_failure')
      }
      return originalMarkLeadWon(...args)
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
    assert.equal(retried.json.replayed, false, 'the one durable won transition owns conversion completion')
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
    if (store && originalMarkLeadWon) store.markLeadWon = originalMarkLeadWon
    restoreEnvironment(saved)
  }
})

test('concurrent lead conversion writers resolve to one deterministic client and project', async () => {
  const saved = captureEnvironment()
  let store
  let originalGetProject
  let originalCreateProject
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
    originalCreateProject = store.createProject
    let createAttempts = 0
    store.createProject = async (...args) => {
      createAttempts += 1
      return originalCreateProject(...args)
    }
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

    const request = (offer) => handle({
      method: 'POST', path: `/api/leads/${leadId}`, query: { action: 'convert' }, headers, body: { offer },
    })
    const [first, second] = await Promise.all([request('dashboard'), request('ai-agent')])
    assert.equal(first.status, 200)
    assert.equal(second.status, 200)
    assert.equal(first.json.client.id, clientId)
    assert.equal(second.json.client.id, clientId)
    assert.equal(first.json.project.id, projectId)
    assert.equal(second.json.project.id, projectId)
    assert.equal(first.json.project.offer, second.json.project.offer, 'conflict read-back must return one persisted project body')
    assert.equal((await store.getProject(projectId)).offer, first.json.project.offer)
    assert.equal(createAttempts, 2, 'both stale writers must exercise insert conflict and read-back')
    assert.deepEqual([first.json.replayed, second.json.replayed].sort(), [false, true], 'only one writer may own conversion completion')
    assert.equal((await store.listClients()).filter((client) => client.id === clientId).length, 1)
    assert.equal((await store.listProjects()).filter((project) => project.lead_id === leadId).length, 1)
    const wins = (await store.listActivity(100)).filter((entry) => entry.kind === 'won' && entry.ref === projectId)
    assert.equal(wins.length, 1, 'the atomic won transition must emit one success activity')
  } finally {
    if (store && originalGetProject) store.getProject = originalGetProject
    if (store && originalCreateProject) store.createProject = originalCreateProject
    restoreEnvironment(saved)
  }
})

test('lead conversion recovers client-only state and rejects mismatched project lineage', async () => {
  const saved = captureEnvironment()
  try {
    for (const name of ENV_KEYS) delete process.env[name]
    process.env.SUPERMEGA_OPS_KEY = CONFORMING_KEY
    const { handle } = await import(`./console/api.mjs?convert-lineage=${Date.now()}-${Math.random()}`)
    const store = (await import('./store.mjs')).default
    assert.equal(store.mode, 'memory', 'this test must not touch a real database')

    const partialLeadId = `lead-convert-client-only-${Date.now()}`
    const partialClientId = conversionRecordId('client', partialLeadId)
    const headers = { 'x-ops-key': CONFORMING_KEY }
    await store.insertLead({ id: partialLeadId, name: 'Partial Owner', company: 'Partial Shop', stage: 'qualified' })
    await store.createClient({ id: partialClientId, name: 'Partial conversion client' })
    const recovered = await handle({
      method: 'POST', path: `/api/leads/${partialLeadId}`, query: { action: 'convert' }, headers, body: {},
    })
    assert.equal(recovered.status, 200)
    assert.equal(recovered.json.client.id, partialClientId)
    assert.equal(recovered.json.project.client_id, partialClientId)

    const leadId = `lead-convert-lineage-${Date.now()}`
    const deterministicClientId = conversionRecordId('client', leadId)
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

test('operating actions require exact UTC calendar dates while preserving leap days and year boundaries', () => {
  for (const impossible of [
    '2026-02-29',
    '2026-02-30',
    '2026-02-31',
    '2026-04-31',
    '2026-00-10',
    '2026-13-01',
    '2026-01-00',
    '2026-01-32',
  ]) {
    assert.throws(() => validateOperatingActionBoard(operatingBoardWithDueDate(impossible)), /operating_action_due_date_invalid/, impossible)
  }
  for (const valid of ['2024-02-29', '2026-12-31', '2027-01-01']) {
    assert.equal(validateOperatingActionBoard(operatingBoardWithDueDate(valid)).actions[0].dueDate, valid)
  }
})

test('console error handling contract records safe metadata and never request bodies', async () => {
  const source = await readFile(resolve(import.meta.dirname, 'console/api.mjs'), 'utf8')
  const storeSource = await readFile(resolve(import.meta.dirname, 'store.mjs'), 'utf8')
  assert.match(source, /import \{ captureError \} from '\.\.\/alert\.mjs'/)
  assert.match(source, /const recordConsoleError = \(context, detail, meta = \{\}\) => captureError/)
  assert.match(source, /store\.markLeadWon\(seg\[1\]\)\.catch\(async \(error\) =>/)
  assert.match(source, /lead_won_stage_update_failed/)
  assert.match(source, /matchingProjects\.length > 1/)
  assert.match(source, /lead_conversion_ambiguous/)
  assert.match(source, /leadConversionRecordId\('client', lead\.id\)/)
  assert.match(source, /leadConversionRecordId\('project', lead\.id\)/)
  assert.match(source, /store\.createProject\(\{ id: projectId,/)
  assert.match(storeSource, /const row = \{ id: String\(p\.id \|\| randomUUID\(\)\), client_id:/)
  assert.match(storeSource, /if \(mem\.client\.has\(row\.id\)\) throw new Error\('console_client_id_conflict'\)/)
  assert.match(storeSource, /if \(mem\.project\.has\(row\.id\)\) throw new Error\('console_project_id_conflict'\)/)
  assert.match(storeSource, /export async function markLeadWon\(id\)/)
  assert.match(source, /replayed: true/)
  assert.match(source, /await recordConsoleError\('console\.api_unhandled_error', err, \{ method, path: safePath\(path\) \}\)/)
  assert.doesNotMatch(source, /console\.api_unhandled_error[\s\S]{0,160}body/)
  assert.match(source, /console\.activity_log_failed/)
  assert.match(source, /console\.deal_graduation_failed/)
  assert.match(source, /console\.project_shipped_graduation_failed/)
})
