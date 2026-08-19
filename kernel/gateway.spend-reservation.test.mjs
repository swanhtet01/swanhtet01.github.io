import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

for (const key of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_KEY', 'POSTGRES_URL_NON_POOLING', 'POSTGRES_URL', 'DATABASE_URL_UNPOOLED', 'POSTGRES_PRISMA_URL', 'SUPERMEGA_DATABASE_URL', 'DATABASE_URL']) delete process.env[key]
delete process.env.NODE_ENV
delete process.env.VERCEL
process.env.SUPERMEGA_GATEWAY_PERSIST = '1'
process.env.SUPERMEGA_CLIENT_TOKEN_CAP = '150000'
process.env.SUPERMEGA_PLAN_CAP_PRO = '8000'
process.env.ANTHROPIC_API_KEY = 'sk-ant-test-not-real'
delete process.env.OPENROUTER_API_KEY

const gateway = await import('./gateway.mjs')
const store = (await import('./store.mjs')).default
assert.equal(store.mode, 'memory', 'tests must never touch an external database')

const realFetch = globalThis.fetch
const realRandom = Math.random
after(() => {
  globalThis.fetch = realFetch
  Math.random = realRandom
})

const WINDOW = `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, '0')}`
const expiry = () => new Date(Date.now() + 60_000).toISOString()
const okResponse = (usage = { input_tokens: 10, output_tokens: 5 }) => ({
  ok: true,
  status: 200,
  json: async () => ({ content: [{ type: 'text', text: 'ok' }], usage }),
  text: async () => '',
})
const errorResponse = (status) => ({ ok: false, status, json: async () => ({}), text: async () => `status-${status}` })
const ask = (tenant, content, extra = {}) => gateway.complete({ clientId: tenant, tier: 'bulk', system: 'test', messages: [{ role: 'user', content }], ...extra })
let seedCounter = 0
async function seedCommittedUsage(tenant, amount, cap) {
  const id = `spend-seed-${++seedCounter}`
  const dispatchToken = `spend-seed-token-${seedCounter}`
  await store.reserveTokenSpend(id, tenant, WINDOW, { reservedTokens: amount, capTokens: cap, expiresAt: expiry(), dispatchToken, context: { test_seed: seedCounter } })
  await store.markTokenSpendDispatched(id, dispatchToken)
  const settled = await store.settleTokenSpend(id, { inTokens: amount, outTokens: 0, calls: 0, dispatchToken })
  assert.equal(settled.settled, true)
}

test('memory store admits only reservations that fit under one tenant cap', async () => {
  const tenant = 'reservation-concurrency-store'
  const specs = Array.from({ length: 6 }, (_, index) => ({ id: `store-concurrent-${index}`, token: `dispatch-${index}` }))
  const attempts = await Promise.all(specs.map(({ id, token }) => store.reserveTokenSpend(
    id,
    tenant,
    WINDOW,
    { reservedTokens: 25, capTokens: 100, expiresAt: expiry(), dispatchToken: token, context: { test: true } },
  )))
  assert.equal(attempts.filter((row) => row.accepted).length, 4)
  assert.equal((await store.getTokenUsage(tenant, WINDOW)).spend_total, 100)
  await Promise.all(attempts.map((row, index) => row.accepted ? store.releaseTokenSpend(row.reservation_id, { dispatchToken: specs[index].token }) : null))
  assert.equal((await store.getTokenUsage(tenant, WINDOW)).reserved_tokens, 0)
  const mismatch = await store.reserveTokenSpend('store-cap-mismatch', tenant, WINDOW, { reservedTokens: 1, capTokens: 200, expiresAt: expiry(), dispatchToken: 'dispatch-mismatch' })
  assert.equal(mismatch.reason, 'cap_mismatch', 'the first server-owned monthly cap remains authoritative')
  assert.equal((await store.getTokenUsage(tenant, WINDOW)).cap_tokens, 100)
})

test('settlement and release are idempotent and settlement replaces the reservation with actual usage', async () => {
  const tenant = 'reservation-lifecycle-store'
  const id = 'store-lifecycle-1'
  const token = 'dispatch-lifecycle-1'
  assert.equal((await store.reserveTokenSpend(id, tenant, WINDOW, { reservedTokens: 100, capTokens: 500, expiresAt: expiry(), dispatchToken: token })).accepted, true)
  assert.equal((await store.settleTokenSpend(id, { inTokens: 1, outTokens: 1, calls: 1, dispatchToken: token })).reason, 'reservation_not_dispatched')
  assert.equal((await store.markTokenSpendDispatched(id, token)).changed, true)
  const first = await store.settleTokenSpend(id, { inTokens: 20, outTokens: 5, calls: 1, dispatchToken: token })
  const replay = await store.settleTokenSpend(id, { inTokens: 20, outTokens: 5, calls: 1, dispatchToken: token })
  assert.equal(first.settled, true)
  assert.equal(replay.reason, 'idempotent')
  assert.equal((await store.settleTokenSpend(id, { inTokens: 21, outTokens: 5, calls: 1, dispatchToken: token })).reason, 'settlement_conflict')
  const usage = await store.getTokenUsage(tenant, WINDOW)
  assert.equal(usage.committed_tokens, 25)
  assert.equal(usage.reserved_tokens, 0)
  assert.equal(usage.calls, 1)
  assert.equal((await store.releaseTokenSpend(id, { dispatchToken: token })).reason, 'reservation_settled')

  const releasedId = 'store-lifecycle-release'
  const releasedToken = 'dispatch-release'
  await store.reserveTokenSpend(releasedId, tenant, WINDOW, { reservedTokens: 50, capTokens: 500, expiresAt: expiry(), dispatchToken: releasedToken })
  assert.equal((await store.releaseTokenSpend(releasedId, { dispatchToken: releasedToken })).released, true)
  assert.equal((await store.releaseTokenSpend(releasedId, { dispatchToken: releasedToken })).reason, 'idempotent')
  assert.equal((await store.settleTokenSpend(releasedId, { inTokens: 1, outTokens: 1, calls: 1, dispatchToken: releasedToken })).reason, 'reservation_released')

  const undersizedId = 'store-lifecycle-undersized'
  const undersizedToken = 'dispatch-undersized'
  await store.reserveTokenSpend(undersizedId, tenant, WINDOW, { reservedTokens: 10, capTokens: 500, expiresAt: expiry(), dispatchToken: undersizedToken })
  await store.markTokenSpendDispatched(undersizedId, undersizedToken)
  const over = await store.settleTokenSpend(undersizedId, { inTokens: 11, outTokens: 0, calls: 1, dispatchToken: undersizedToken })
  assert.equal(over.reason, 'actual_exceeds_reservation')
  assert.equal((await store.getTokenUsage(tenant, WINDOW)).reserved_tokens, 10, 'an undersized reservation remains fail-closed')
  await store.markTokenSpendIndeterminate(undersizedId, undersizedToken)
  assert.equal((await store.releaseTokenSpend(undersizedId, { dispatchToken: undersizedToken, definitive: true })).reason, 'reservation_indeterminate')
  const releaseProof = 'a'.repeat(64)
  assert.equal((await store.reconcileTokenSpend(undersizedId, { action: 'release', actor: 'test-operator', evidenceHash: releaseProof })).reconciled, true)
  assert.equal((await store.reconcileTokenSpend(undersizedId, { action: 'release', actor: 'test-operator', evidenceHash: releaseProof })).reason, 'idempotent')
  assert.equal((await store.reconcileTokenSpend(undersizedId, { action: 'release', actor: 'test-operator', evidenceHash: 'b'.repeat(64) })).reason, 'reconciliation_conflict')

  const reconcileSettleId = 'store-lifecycle-reconcile-settle'
  const reconcileSettleToken = 'dispatch-reconcile-settle'
  await store.reserveTokenSpend(reconcileSettleId, tenant, WINDOW, { reservedTokens: 20, capTokens: 500, expiresAt: expiry(), dispatchToken: reconcileSettleToken })
  await store.markTokenSpendDispatched(reconcileSettleId, reconcileSettleToken)
  await store.markTokenSpendIndeterminate(reconcileSettleId, reconcileSettleToken)
  const reconciled = await store.reconcileTokenSpend(reconcileSettleId, { action: 'settle', inTokens: 7, outTokens: 3, calls: 1, actor: 'test-operator', evidenceHash: 'c'.repeat(64) })
  assert.equal(reconciled.reconciled, true)
  assert.equal(reconciled.status, 'settled')

  const staleId = 'store-lifecycle-stale'
  const staleToken = 'dispatch-stale'
  await store.reserveTokenSpend(staleId, tenant, WINDOW, { reservedTokens: 10, capTokens: 500, expiresAt: new Date(Date.now() + 20).toISOString(), dispatchToken: staleToken })
  await store.markTokenSpendDispatched(staleId, staleToken)
  await new Promise((resolve) => setTimeout(resolve, 30))
  assert.equal((await store.settleTokenSpend(staleId, { inTokens: 1, outTokens: 1, calls: 1, dispatchToken: staleToken })).settled, true, 'expiry prevents late dispatch, not authenticated settlement')

  const reclaimId = 'store-lifecycle-reclaim'
  const reclaimContext = { operation_hash: 'stable-operation' }
  await store.reserveTokenSpend(reclaimId, tenant, WINDOW, { reservedTokens: 10, capTokens: 500, expiresAt: new Date(Date.now() + 20).toISOString(), dispatchToken: 'dispatch-old', context: reclaimContext })
  await new Promise((resolve) => setTimeout(resolve, 30))
  assert.equal((await store.markTokenSpendDispatched(reclaimId, 'dispatch-old')).reason, 'reservation_stale')
  const reclaimed = await store.reserveTokenSpend(reclaimId, tenant, WINDOW, { reservedTokens: 10, capTokens: 500, expiresAt: expiry(), dispatchToken: 'dispatch-new', context: reclaimContext })
  assert.equal(reclaimed.reason, 'reservation_reclaimed')
  assert.equal((await store.markTokenSpendDispatched(reclaimId, 'dispatch-old')).reason, 'dispatch_token_mismatch')
  assert.equal((await store.markTokenSpendDispatched(reclaimId, 'dispatch-new')).changed, true)
  assert.equal((await store.releaseTokenSpend(reclaimId, { dispatchToken: 'dispatch-new', definitive: true })).released, true)
})

test('concurrent gateway calls cannot dispatch beyond the cap', async () => {
  const tenant = 'gateway-concurrent-pro'
  await store.createClient({ id: tenant, name: tenant, plan: 'pro' })
  let started
  const providerStarted = new Promise((resolve) => { started = resolve })
  let finish
  const providerFinish = new Promise((resolve) => { finish = resolve })
  let calls = 0
  globalThis.fetch = async () => {
    calls += 1
    started()
    await providerFinish
    return okResponse()
  }
  const first = ask(tenant, 'held-first-request')
  await providerStarted
  await assert.rejects(() => ask(tenant, 'blocked-second-request'), /gateway_client_cap_reached/)
  assert.equal(calls, 1, 'the rejected request never reaches a provider')
  finish()
  assert.equal((await first).text, 'ok')
  assert.equal((await store.getTokenUsage(tenant, WINDOW)).reserved_tokens, 0)
})

test('a stable operation id prevents duplicate provider dispatch', async () => {
  const tenant = 'gateway-operation-id'
  await store.createClient({ id: tenant, name: tenant, plan: 'pro' })
  let started
  const providerStarted = new Promise((resolve) => { started = resolve })
  let finish
  const providerFinish = new Promise((resolve) => { finish = resolve })
  let calls = 0
  globalThis.fetch = async () => {
    calls += 1
    started()
    await providerFinish
    return okResponse()
  }
  const first = ask(tenant, 'same-operation', { operationId: 'work-order-42' })
  await providerStarted
  await assert.rejects(() => ask(tenant, 'same-operation', { operationId: 'work-order-42' }), /gateway_spend_reconciliation_required/)
  assert.equal(calls, 1)
  finish()
  assert.equal((await first).text, 'ok')
})

test('definitive provider rejection releases capacity, while an ambiguous failure remains reserved', async () => {
  Math.random = () => 0
  const rejectedTenant = 'gateway-definite-rejection'
  await store.createClient({ id: rejectedTenant, name: rejectedTenant, plan: 'pro' })
  globalThis.fetch = async () => errorResponse(400)
  await assert.rejects(() => ask(rejectedTenant, 'definite-400'), /anthropic_400/)
  assert.equal((await store.getTokenUsage(rejectedTenant, WINDOW)).reserved_tokens, 0)

  const uncertainTenant = 'gateway-ambiguous-failure'
  await store.createClient({ id: uncertainTenant, name: uncertainTenant, plan: 'pro' })
  let calls = 0
  globalThis.fetch = async () => { calls += 1; return errorResponse(500) }
  await assert.rejects(() => ask(uncertainTenant, 'ambiguous-500'), /gateway_retry_blocked_by_reserved_spend/)
  const uncertain = await store.getTokenUsage(uncertainTenant, WINDOW)
  assert.equal(calls, 1, 'the retained first attempt prevents an unsafe retry')
  assert.ok(uncertain.reserved_tokens > 0)
  assert.equal(uncertain.committed_tokens, 0)
})

test('HTTP 408 and missing provider usage remain indeterminate', async () => {
  Math.random = () => 0
  const timeoutTenant = 'gateway-ambiguous-408'
  await store.createClient({ id: timeoutTenant, name: timeoutTenant, plan: 'pro' })
  let timeoutCalls = 0
  globalThis.fetch = async () => { timeoutCalls += 1; return errorResponse(408) }
  await assert.rejects(() => ask(timeoutTenant, 'ambiguous-408'), /gateway_retry_blocked_by_reserved_spend/)
  assert.equal(timeoutCalls, 1)
  assert.ok((await store.getTokenUsage(timeoutTenant, WINDOW)).reserved_tokens > 0)

  const usageTenant = 'gateway-openrouter-missing-usage'
  await store.createClient({ id: usageTenant, name: usageTenant, plan: 'pro' })
  process.env.SUPERMEGA_PLAN_CAP_PRO = '20000'
  process.env.OPENROUTER_API_KEY = 'openrouter-test-key'
  let anthropicCalls = 0
  let openrouterCalls = 0
  globalThis.fetch = async (url) => {
    if (String(url).includes('openrouter.ai')) {
      openrouterCalls += 1
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'ok' } }] }), text: async () => '' }
    }
    anthropicCalls += 1
    return errorResponse(401)
  }
  const pending = await ask(usageTenant, 'missing-usage')
  assert.equal(pending.provider, 'openrouter')
  assert.equal(pending.spend.status, 'reconciliation_required')
  assert.equal(anthropicCalls, 1)
  assert.equal(openrouterCalls, 1)
  assert.ok((await store.getTokenUsage(usageTenant, WINDOW)).reserved_tokens > 0)
  delete process.env.OPENROUTER_API_KEY
  process.env.SUPERMEGA_PLAN_CAP_PRO = '8000'
})

test('rate-limit retries use a fresh reservation and settle only successful usage', async () => {
  Math.random = () => 0
  const tenant = 'gateway-rate-limit-retry'
  await store.createClient({ id: tenant, name: tenant, plan: 'pro' })
  let calls = 0
  globalThis.fetch = async () => (++calls === 1 ? errorResponse(429) : okResponse({ input_tokens: 7, output_tokens: 3 }))
  const result = await ask(tenant, 'retry-after-429')
  assert.equal(result.text, 'ok')
  assert.equal(calls, 2)
  const usage = await store.getTokenUsage(tenant, WINDOW)
  assert.equal(usage.committed_tokens, 10)
  assert.equal(usage.reserved_tokens, 0)
  assert.equal(usage.calls, 1)
})

test('ambiguous retry and cross-provider failover each obtain an independent reservation', async () => {
  Math.random = () => 0
  process.env.SUPERMEGA_PLAN_CAP_PRO = '20000'
  const retryTenant = 'gateway-ambiguous-retry-success'
  await store.createClient({ id: retryTenant, name: retryTenant, plan: 'pro' })
  let retryCalls = 0
  globalThis.fetch = async () => (++retryCalls === 1 ? errorResponse(500) : okResponse({ input_tokens: 4, output_tokens: 2 }))
  assert.equal((await ask(retryTenant, 'ambiguous-then-success')).text, 'ok')
  const retryUsage = await store.getTokenUsage(retryTenant, WINDOW)
  assert.equal(retryCalls, 2)
  assert.equal(retryUsage.committed_tokens, 6)
  assert.ok(retryUsage.reserved_tokens > 0, 'the ambiguous first attempt remains conservatively reserved')

  process.env.OPENROUTER_API_KEY = 'sk-or-test-not-real'
  const failoverTenant = 'gateway-auth-failover-success'
  await store.createClient({ id: failoverTenant, name: failoverTenant, plan: 'pro' })
  const urls = []
  globalThis.fetch = async (url) => {
    urls.push(String(url))
    if (String(url).includes('anthropic.com')) return errorResponse(401)
    return {
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: 'fallback-ok' } }], usage: { prompt_tokens: 3, completion_tokens: 2 } }),
      text: async () => '',
    }
  }
  const failover = await ask(failoverTenant, 'auth-failover')
  assert.equal(failover.provider, 'openrouter')
  assert.equal(failover.text, 'fallback-ok')
  assert.equal(urls.length, 2)
  assert.equal((await store.getTokenUsage(failoverTenant, WINDOW)).reserved_tokens, 0)
  delete process.env.OPENROUTER_API_KEY
  process.env.SUPERMEGA_PLAN_CAP_PRO = '8000'
})

test('a fresh gateway instance reads the shared cache at the hard cap before reserving', async () => {
  const tenant = 'gateway-cache-at-cap'
  await store.createClient({ id: tenant, name: tenant, plan: 'pro' })
  let calls = 0
  globalThis.fetch = async () => { calls += 1; return okResponse() }
  await ask(tenant, 'cache-at-cap')
  const before = await store.getTokenUsage(tenant, WINDOW)
  await seedCommittedUsage(tenant, 8000 - before.committed_tokens, 8000)
  const freshGateway = await import(`./gateway.mjs?shared-cache=${Date.now()}`)
  const cappedBefore = await store.getTokenUsage(tenant, WINDOW)
  const cached = await freshGateway.complete({ clientId: tenant, tier: 'bulk', system: 'test', messages: [{ role: 'user', content: 'cache-at-cap' }] })
  assert.equal(cached.cached, true)
  assert.equal(calls, 1)
  assert.deepEqual(await store.getTokenUsage(tenant, WINDOW), cappedBefore)
  await assert.rejects(
    () => freshGateway.complete({ clientId: tenant, tier: 'bulk', system: 'test', messages: [{ role: 'user', content: 'cache-miss-at-cap' }], capTokens: 99_999_999 }),
    /gateway_client_cap_reached/,
  )
  assert.equal(calls, 1, 'a request cannot raise its cap or dispatch on a cache miss')
})

test('an oversized or unpersisted settlement returns the response once but retains its reservation', async () => {
  const tenant = 'gateway-settlement-fail-closed'
  await store.createClient({ id: tenant, name: tenant, plan: 'pro' })
  let calls = 0
  globalThis.fetch = async () => { calls += 1; return okResponse({ input_tokens: 10000, output_tokens: 0 }) }
  const first = await ask(tenant, 'oversized-actual')
  assert.equal(first.text, 'ok')
  assert.equal(first.spend.status, 'reconciliation_required')
  const usage = await store.getTokenUsage(tenant, WINDOW)
  assert.equal(usage.committed_tokens, 0)
  assert.ok(usage.reserved_tokens > 0)
  await assert.rejects(() => ask(tenant, 'oversized-actual'), /gateway_client_cap_reached/)
  assert.equal(calls, 1)
})

test('malformed limits fail before provider execution or ledger mutation', async () => {
  const tenant = 'gateway-malformed-limit'
  await store.createClient({ id: tenant, name: tenant, plan: 'pro' })
  let calls = 0
  globalThis.fetch = async () => { calls += 1; return okResponse() }
  await assert.rejects(() => ask(tenant, 'bad-max', { maxTokens: -1 }), /gateway_invalid_max_tokens/)
  await assert.rejects(() => store.reserveTokenSpend('bad-reservation', tenant, WINDOW, { reservedTokens: Number.NaN, capTokens: 100, expiresAt: expiry(), dispatchToken: 'dispatch-bad' }), /invalid_reserved_tokens/)
  assert.equal(calls, 0)
  assert.equal((await store.getTokenUsage(tenant, WINDOW)).spend_total, 0)
})

test('an omitted client id is charged to the capped platform tenant', async () => {
  let calls = 0
  globalThis.fetch = async () => { calls += 1; return okResponse({ input_tokens: 2, output_tokens: 1 }) }
  const result = await gateway.complete({ tier: 'bulk', system: 'platform', messages: [{ role: 'user', content: 'bounded internal call' }] })
  assert.equal(result.text, 'ok')
  assert.equal(calls, 1)
  const usage = await store.getTokenUsage('supermega-platform', WINDOW)
  assert.equal(usage.committed_tokens, 3)
  assert.equal(usage.cap_tokens, 150000)
})

test('explicit no-persistence mode still enforces an in-process reservation', async () => {
  const execFileAsync = promisify(execFile)
  const gatewayUrl = new URL('./gateway.mjs', import.meta.url).href
  const script = `
    process.env.SUPERMEGA_GATEWAY_PERSIST='0';
    process.env.ANTHROPIC_API_KEY='test';
    delete process.env.NODE_ENV;
    delete process.env.VERCEL;
    process.env.SUPERMEGA_CLIENT_TOKEN_CAP='8000';
    let calls=0, started, finish;
    const began=new Promise(resolve=>{started=resolve});
    const held=new Promise(resolve=>{finish=resolve});
    globalThis.fetch=async()=>{ calls+=1; started(); await held; return {ok:true,status:200,json:async()=>({content:[{type:'text',text:'ok'}],usage:{input_tokens:1,output_tokens:1}}),text:async()=>''}; };
    const {complete}=await import(${JSON.stringify(gatewayUrl)});
    const first=complete({clientId:'local-only',system:'x',messages:[{role:'user',content:'first'}],tier:'bulk'});
    await began;
    let blocked=false;
    try { await complete({clientId:'local-only',system:'x',messages:[{role:'user',content:'second'}],tier:'bulk'}); }
    catch(error){ blocked=error.message==='gateway_client_cap_reached'; }
    if(!blocked || calls!==1) throw new Error('local_cap_not_enforced');
    finish();
    if((await first).text!=='ok') throw new Error('unexpected_result');
  `
  await execFileAsync(process.execPath, ['--input-type=module', '-e', script], { windowsHide: true })
})

test('production refuses a model dispatch when only an in-process budget is available', async () => {
  const execFileAsync = promisify(execFile)
  const gatewayUrl = new URL('./gateway.mjs', import.meta.url).href
  const script = `
    process.env.SUPERMEGA_GATEWAY_PERSIST='0';
    process.env.NODE_ENV='production';
    process.env.ANTHROPIC_API_KEY='test';
    let calls=0;
    globalThis.fetch=async()=>{ calls+=1; throw new Error('provider_must_not_run') };
    const {complete}=await import(${JSON.stringify(gatewayUrl)});
    try {
      await complete({clientId:'production-no-store',system:'x',messages:[{role:'user',content:'y'}],tier:'bulk'});
      throw new Error('expected_rejection');
    } catch (error) {
      if(error.message!=='gateway_durable_spend_required' || calls!==0) throw error;
    }
  `
  await execFileAsync(process.execPath, ['--input-type=module', '-e', script], { windowsHide: true })
})

test('Supabase adapter uses one exact RPC per spend transition with no read-modify-write request', async () => {
  const execFileAsync = promisify(execFile)
  const storeUrl = new URL('./store.mjs', import.meta.url).href
  const script = `
    process.env.SUPABASE_URL='https://unit-test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY='server-only-test-key';
    const calls=[];
    globalThis.fetch=async(url, options={})=>{
      calls.push({url:String(url),method:options.method,body:JSON.parse(options.body||'null')});
      const path=String(url);
      if(path.endsWith('/supermega_get_token_usage')) return {ok:true,status:200,json:async()=>[{tenant_id:'tenant',window:'2026-07',in_tokens:0,out_tokens:0,calls:0,reserved_tokens:0}],text:async()=>''};
      if(path.endsWith('/supermega_reserve_token_spend')) return {ok:true,status:200,json:async()=>[{accepted:true,reservation_id:'reservation',durable:true}],text:async()=>''};
      if(path.endsWith('/supermega_mark_token_spend_dispatched')) return {ok:true,status:200,json:async()=>[{changed:true,reservation_id:'reservation'}],text:async()=>''};
      if(path.endsWith('/supermega_mark_token_spend_indeterminate')) return {ok:true,status:200,json:async()=>[{changed:true,reservation_id:'reservation'}],text:async()=>''};
      if(path.endsWith('/supermega_settle_token_spend')) return {ok:true,status:200,json:async()=>[{settled:true,reservation_id:'reservation'}],text:async()=>''};
      if(path.endsWith('/supermega_release_token_spend')) return {ok:true,status:200,json:async()=>[{released:true,reservation_id:'reservation'}],text:async()=>''};
      if(path.endsWith('/supermega_reconcile_token_spend')) return {ok:true,status:200,json:async()=>[{reconciled:true,reservation_id:'reservation'}],text:async()=>''};
      throw new Error('unexpected_path:'+path);
    };
    const store=(await import(${JSON.stringify(storeUrl)})).default;
    await store.getTokenUsage('tenant','2026-07');
    await store.reserveTokenSpend('reservation','tenant','2026-07',{reservedTokens:100,capTokens:1000,expiresAt:new Date(Date.now()+60000).toISOString(),dispatchToken:'dispatch-token',context:{operation_hash:'hash'}});
    await store.markTokenSpendDispatched('reservation','dispatch-token');
    await store.markTokenSpendIndeterminate('reservation','dispatch-token');
    await store.settleTokenSpend('reservation',{inTokens:1,outTokens:2,calls:1,dispatchToken:'dispatch-token'});
    await store.releaseTokenSpend('reservation',{dispatchToken:'dispatch-token'});
    await store.reconcileTokenSpend('reservation',{action:'release',actor:'operator',evidenceHash:'${'d'.repeat(64)}'});
    console.log(JSON.stringify({mode:store.mode,calls}));
  `
  const { stdout } = await execFileAsync(process.execPath, ['--input-type=module', '-e', script], { windowsHide: true })
  const report = JSON.parse(stdout.trim().split(/\r?\n/).at(-1))
  assert.equal(report.mode, 'supabase')
  assert.equal(report.calls.length, 7)
  assert.deepEqual(report.calls.map((call) => [call.method, new URL(call.url).pathname]), [
    ['POST', '/rest/v1/rpc/supermega_get_token_usage'],
    ['POST', '/rest/v1/rpc/supermega_reserve_token_spend'],
    ['POST', '/rest/v1/rpc/supermega_mark_token_spend_dispatched'],
    ['POST', '/rest/v1/rpc/supermega_mark_token_spend_indeterminate'],
    ['POST', '/rest/v1/rpc/supermega_settle_token_spend'],
    ['POST', '/rest/v1/rpc/supermega_release_token_spend'],
    ['POST', '/rest/v1/rpc/supermega_reconcile_token_spend'],
  ])
  assert.deepEqual(report.calls[1].body, {
    p_reservation_id: 'reservation',
    p_tenant_id: 'tenant',
    p_window: '2026-07',
    p_reserved_tokens: 100,
    p_cap_tokens: 1000,
    p_expires_at: report.calls[1].body.p_expires_at,
    p_dispatch_token: 'dispatch-token',
    p_context: { operation_hash: 'hash' },
  })
})

test('gateway retries idempotent settlement exactly three times and exposes durable reconciliation state', async () => {
  const execFileAsync = promisify(execFile)
  const gatewayUrl = new URL('./gateway.mjs', import.meta.url).href
  const script = `
    process.env.SUPABASE_URL='https://unit-test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY='server-only-test-key';
    process.env.ANTHROPIC_API_KEY='provider-test-key';
    process.env.SUPERMEGA_PLAN_CAP_PRO='50000';
    let settleAttempts=0, providerCalls=0, cacheWrites=0, indeterminateCalls=0, failAlways=false;
    const ok=(value)=>({ok:true,status:200,json:async()=>value,text:async()=>''});
    globalThis.fetch=async(url, options={})=>{
      const path=String(url);
      if(path.startsWith('https://api.anthropic.com/')) {
        providerCalls+=1;
        return ok({content:[{type:'text',text:'ok'}],usage:{input_tokens:2,output_tokens:1},model:'synthetic-model'});
      }
      if(path.includes('/supermega_console_clients?')) return ok([{id:'tenant',plan:'pro'}]);
      if(path.includes('/supermega_ai_cache?') && options.method==='GET') return ok([]);
      if(path.includes('/supermega_ai_cache?') && options.method==='POST') { cacheWrites+=1; return ok([]); }
      if(path.endsWith('/supermega_reserve_ai_budget')) return ok([{granted:true,used_units:1,cap_units:500000,reason:null}]);
      if(path.includes('/supermega_ai_budget_reservations?')) return ok([{reservation_id:'company-budget',status:'consumed'}]);
      if(path.endsWith('/supermega_get_token_usage')) return ok([{tenant_id:'tenant',window:'2026-07',cap_tokens:50000,in_tokens:0,out_tokens:0,calls:0,reserved_tokens:0}]);
      if(path.endsWith('/supermega_reserve_token_spend')) return ok([{accepted:true,reservation_id:'reservation',durable:true}]);
      if(path.endsWith('/supermega_mark_token_spend_dispatched')) return ok([{changed:true}]);
      if(path.endsWith('/supermega_mark_token_spend_indeterminate')) { indeterminateCalls+=1; return ok([{changed:true}]); }
      if(path.endsWith('/supermega_settle_token_spend')) {
        settleAttempts+=1;
        if(failAlways || settleAttempts < 3) return {ok:false,status:500,json:async()=>({}),text:async()=>'synthetic settlement response loss'};
        return ok([{settled:true,reason:'idempotent'}]);
      }
      throw new Error('unexpected_path:'+path);
    };
    const gateway=await import(${JSON.stringify(gatewayUrl)});
    const request=(clientId,operationId)=>gateway.complete({clientId,tier:'bulk',operationId,system:'test',messages:[{role:'user',content:operationId}]});
    const recovered=await request('tenant-recovered','settlement-recovered');
    failAlways=true;
    const pending=await request('tenant-pending','settlement-pending');
    console.log(JSON.stringify({settleAttempts,providerCalls,cacheWrites,indeterminateCalls,recovered,pending}));
  `
  const { stdout } = await execFileAsync(process.execPath, ['--input-type=module', '-e', script], { windowsHide: true })
  const report = JSON.parse(stdout.trim().split(/\r?\n/).at(-1))
  assert.equal(report.settleAttempts, 6)
  assert.equal(report.providerCalls, 2)
  assert.equal(report.cacheWrites, 1, 'only a durably settled response is cached')
  assert.equal(report.indeterminateCalls, 1)
  assert.equal(report.recovered.spend, undefined)
  assert.equal(report.pending.spend.status, 'reconciliation_required')
})

test('Supabase schemas and adapter pin atomic RPC and least-privilege contracts', async () => {
  const [workcell, consoleSql, storeSource] = await Promise.all([
    readFile(new URL('./supabase/workcell-client.sql', import.meta.url), 'utf8'),
    readFile(new URL('./supabase/console-tables.sql', import.meta.url), 'utf8'),
    readFile(new URL('./store.mjs', import.meta.url), 'utf8'),
  ])
  for (const sql of [workcell, consoleSql]) {
    assert.match(sql, /create table if not exists public\.supermega_spend_reservations/i)
    assert.match(sql, /create or replace function public\.supermega_reserve_token_spend/i)
    assert.match(sql, /create or replace function public\.supermega_mark_token_spend_dispatched/i)
    assert.match(sql, /create or replace function public\.supermega_mark_token_spend_indeterminate/i)
    assert.match(sql, /create or replace function public\.supermega_reconcile_token_spend/i)
    assert.match(sql, /legacy_active_reservations_require_reconciliation/i)
    assert.match(sql, /drop function if exists public\.supermega_add_token_usage/i)
    assert.doesNotMatch(sql, /create or replace function public\.supermega_add_token_usage/i)
    assert.doesNotMatch(sql, /grant execute on function public\.supermega_add_token_usage/i)
    assert.match(sql, /alter table public\.supermega_spend_reservations alter column dispatch_token set not null/i)
    assert.doesNotMatch(sql, /update public\.supermega_spend_reservations set status='reserved' where status='active'/i)
    assert.match(sql, /for update;/i)
    assert.match(sql, /security definer\s+set search_path = ''/i)
    assert.match(sql, /revoke all on public\.supermega_token_ledger from public, service_role/i)
    assert.match(sql, /revoke all on public\.supermega_spend_reservations from public, anon, authenticated, service_role/i)
    assert.match(sql, /grant execute on function public\.supermega_reserve_token_spend[\s\S]+to service_role/i)
  }
  const rpcBlock = (sql) => sql.slice(sql.indexOf('create or replace function public.supermega_get_token_usage'), sql.indexOf("notify pgrst, 'reload schema';")).replace('-- Reload PostgREST schema cache', '').trim()
  const reservationDdl = (sql) => sql
    .slice(sql.indexOf('create table if not exists public.supermega_spend_reservations'), sql.indexOf('create table if not exists public.supermega_ai_cache'))
    .replace(/create index if not exists supermega_spend_reservations_active_idx[\s\S]*?;\s*/i, '')
    .trim()
  assert.equal(reservationDdl(workcell), reservationDdl(consoleSql), 'central and workcell reservation DDL must remain byte-identical')
  assert.equal(rpcBlock(workcell), rpcBlock(consoleSql), 'central and workcell RPC definitions must remain byte-identical')
  assert.match(storeSource, /rpc\/supermega_reserve_token_spend/)
  assert.match(storeSource, /supermega_mark_token_spend_dispatched/)
  assert.match(storeSource, /supermega_mark_token_spend_indeterminate/)
  assert.match(storeSource, /rpc\/supermega_settle_token_spend/)
  assert.match(storeSource, /rpc\/supermega_release_token_spend/)
  assert.match(storeSource, /rpc\/supermega_reconcile_token_spend/)
  assert.doesNotMatch(storeSource, /rpc\/supermega_add_token_usage/)
  await assert.rejects(() => store.addTokenUsage('tenant', WINDOW, { inTokens: 1 }), /unreserved_token_usage_disabled/)
  assert.doesNotMatch(storeSource, /PostgREST has no native UPSERT-with-increment/)
})
