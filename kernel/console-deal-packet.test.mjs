import { test } from 'node:test'
import assert from 'node:assert/strict'

const ENV_KEYS = [
  'SUPERMEGA_OPS_KEY',
  'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_KEY',
  'POSTGRES_URL_NON_POOLING', 'POSTGRES_URL', 'DATABASE_URL_UNPOOLED', 'POSTGRES_PRISMA_URL',
  'SUPERMEGA_DATABASE_URL', 'DATABASE_URL',
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

const CONFORMING_KEY = 'console-deal-packet-key-0123456789'

const samplePacket = {
  headline: 'Inventory follow-up for a Yangon shop',
  fit_score: 120,
  fit_reason: 'The work is operational and close to revenue.',
  segment: 'retail',
  pain: 'Orders and supplier follow-up are scattered across chat and notebooks.',
  modules: [
    { name: 'Order desk', why: 'Capture every request once.', script: '<script>ignored()</script>' },
    { name: 'Supplier follow-up', why: 'Keep delayed items visible.' },
    { name: '', why: '' },
  ],
  operator: 'Drafts the next owner action only.',
  phases: ['Capture', 'Review', 'Operate', 'Ignore fourth'],
  first_proof: 'A reviewed order queue within one week.',
  pricing: {
    build_fee_mmk: '3,000,000 MMK',
    pro_mrr_mmk: '300,000 MMK',
    rationale: 'Small fixed pilot before a managed plan.',
    unsafe: 'ignored',
  },
  objections: [
    { objection: 'Will this replace staff?', answer: 'No, it drafts work for owner review.', extra: 'ignored' },
  ],
  outreach_en: 'Draft only. Owner reviews before sending.',
  next_action: 'Review the draft with the owner.',
  raw_html: '<img src=x onerror=alert(1)>',
}

test('deal packet normalizer whitelists fields, bounds scores, and rejects empty packets', async () => {
  const { normalizeDealPacket } = await import(`./console/deal.mjs?normalizer=${Date.now()}-${Math.random()}`)

  const normalized = normalizeDealPacket(samplePacket)
  assert.equal(normalized.ok, true)
  assert.equal(normalized.packet.fit_score, 100)
  assert.equal(normalized.packet.modules.length, 2)
  assert.deepEqual(Object.keys(normalized.packet.modules[0]).sort(), ['name', 'why'])
  assert.deepEqual(Object.keys(normalized.packet.pricing).sort(), ['build_fee_mmk', 'pro_mrr_mmk', 'rationale'])
  assert.ok(!Object.hasOwn(normalized.packet, 'raw_html'))
  assert.equal(normalized.packet.phases.length, 3)

  assert.deepEqual(normalizeDealPacket(null), { ok: false, reason: 'invalid_packet' })
  assert.deepEqual(normalizeDealPacket([]), { ok: false, reason: 'invalid_packet' })
  assert.deepEqual(normalizeDealPacket({ modules: [{ name: 'Only module' }] }), { ok: false, reason: 'empty_packet' })
})

test('POST /api/deals persists only the normalized packet shape', async () => {
  const saved = captureEnvironment()
  try {
    for (const name of ENV_KEYS) delete process.env[name]
    process.env.SUPERMEGA_OPS_KEY = CONFORMING_KEY

    const { handle } = await import(`./console/api.mjs?deal-packet=${Date.now()}-${Math.random()}`)
    const response = await handle({
      method: 'POST',
      path: '/api/deals',
      headers: { 'x-ops-key': CONFORMING_KEY },
      body: { lead_id: 'lead-1', packet: samplePacket },
    })

    assert.equal(response.status, 200)
    assert.equal(response.json.ok, true)
    assert.equal(response.json.deal.status, 'draft')
    assert.equal(response.json.deal.packet.fit_score, 100)
    assert.ok(!Object.hasOwn(response.json.deal.packet, 'raw_html'))
    assert.deepEqual(Object.keys(response.json.deal.packet.modules[0]).sort(), ['name', 'why'])
    assert.deepEqual(Object.keys(response.json.deal.packet.pricing).sort(), ['build_fee_mmk', 'pro_mrr_mmk', 'rationale'])

    const rejected = await handle({
      method: 'POST',
      path: '/api/deals',
      headers: { 'x-ops-key': CONFORMING_KEY },
      body: { packet: { modules: [{ name: 'No lead context' }] } },
    })
    assert.equal(rejected.status, 400)
    assert.equal(rejected.json.reason, 'empty_packet')
  } finally {
    restoreEnvironment(saved)
  }
})


test('actual deal UI discards stale generation and save handlers after enquiry switch', async () => {
  const { readFile } = await import('node:fs/promises')
  const { runInNewContext } = await import('node:vm')
  const html = await readFile(new URL('./public/index.html', import.meta.url), 'utf8')
  const run = html.slice(html.indexOf("$('#d-run').onclick=async()=>{"), html.indexOf('const WORKCELL_MISSING='))
  const select = html.split("box.querySelectorAll('[data-deal]').forEach(b=>b.onclick=()=>{")[1].split('})')[0]
  const nodes = new Map()
  const $ = (id) => { if (!nodes.has(id)) nodes.set(id, {value:'',innerHTML:'',textContent:'',disabled:false}); return nodes.get(id) }
  const calls = [], pending = []
  const context = { $, esc: String, toast:()=>{}, openConsoleView:()=>{}, b:{dataset:{deal:'a'}},
    r:{leads:[{id:'a',company:'Alpha',message:'Website brief'}, {id:'b',company:'Beta',message:'Ecommerce brief'}]},
    api: (method,path,body) => { calls.push({method,path,body}); return new Promise((resolve,reject)=>pending.push({resolve,reject})) },
  }
  runInNewContext('let dealLead=null,lastPacket=null,dealGeneration=0;'+run, context)
  const choose = (id) => { context.b.dataset.deal=id; runInNewContext('(()=>{'+select+'})()',context) }
  choose('a')
  const first = $('#d-run').onclick()
  choose('b')
  assert.equal($('#d-workflow').value,'Ecommerce brief')
  assert.equal($('#dealOut').innerHTML,'')
  pending.shift().resolve({ok:true,packet:{headline:'Old Alpha draft'}})
  await first
  assert.equal($('#dealOut').innerHTML,'', 'late Alpha result must not appear for Beta')
  const second = $('#d-run').onclick()
  const betaPacket={headline:'Beta draft'}
  pending.shift().resolve({ok:true,packet:betaPacket})
  await second
  const staleSave=$('#d-save').onclick
  choose('a')
  const before=calls.length
  await staleSave()
  assert.equal(calls.length,before,'detached save cannot attach Beta packet to Alpha')
  const third=$('#d-run').onclick()
  const alphaPacket={headline:'Current Alpha draft'}
  pending.shift().resolve({ok:true,packet:alphaPacket})
  await third
  const save=$('#d-save').onclick()
  assert.equal(calls.at(-1).body.lead_id,'a')
  assert.equal(calls.at(-1).body.packet,alphaPacket)
  choose('b')
  pending.shift().resolve({ok:true})
  await save
  assert.equal($('#dealOut').innerHTML,'')
  assert.notEqual($('#d-save').textContent,'Saved ✓','late save does not confirm in new enquiry')
  const failed=$('#d-run').onclick()
  pending.shift().reject(new Error('synthetic transport failure'))
  await failed
  assert.equal($('#d-run').disabled,false)
  assert.match($('#dealOut').innerHTML,/Could not generate/)
})
