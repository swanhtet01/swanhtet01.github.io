import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sendOutreachOnce } from './console/outreach-send.mjs'

const message = { to: 'qa@example.invalid', subject: 'Synthetic', html: '<p>Review only</p>', text: 'Review only' }
function fixture() {
  const claims = new Map()
  let sends = 0, failStatus = false
  const store = {
    async claimActivity(row) { if (claims.has(row.id)) return { fresh:false,durable:true }; claims.set(row.id,{...row}); return {fresh:true,durable:true} },
    async getActivityClaim(id) { return {claim:claims.get(id),durable:true} },
    async transitionActivityClaim(id, expected, next) { const row=claims.get(id); if(row.ref!==expected)return {updated:false,durable:true}; row.ref=next;return {updated:true,durable:true} },
    async updateDeal(id,patch) { if(failStatus)throw Error('synthetic_status_failure');return {id,...patch} },
  }
  const send=async()=>{sends++;return {ok:true,id:'email-1'}}
  const run=(overrides={})=>sendOutreachOnce({dealId:'deal-1',message,store,send,...overrides})
  return {store,claims,run,get sends(){return sends},set failStatus(value){failStatus=value}}
}

test('provider acceptance survives failed status save and retry repairs without resending',async()=>{
  const f=fixture();f.failStatus=true
  assert.equal((await f.run()).reason,'outreach_sent_status_unconfirmed')
  f.failStatus=false
  const result=await f.run()
  assert.equal(result.ok,true);assert.equal(result.replayed,true);assert.equal(result.email_id,'email-1');assert.equal(f.sends,1)
  assert.equal((await f.run({message:{...message,to:'other@example.invalid'}})).reason,'outreach_payload_conflict')
  assert.equal((await f.run({message:{...message,text:'Changed brief'}})).reason,'outreach_payload_conflict')
  assert.equal(f.sends,1)
})

test('concurrent requests reserve one dispatch',async()=>{
  const f=fixture();const results=await Promise.all([f.run(),f.run()])
  assert.equal(f.sends,1);assert.equal(results.filter(x=>x.ok).length,1)
  assert.equal(results.find(x=>!x.ok).reason,'outreach_send_unconfirmed')
})

test('missing durable claim or readback prevents provider invocation',async()=>{
  for(const mode of ['memory','throw','readback']) {
    const f=fixture()
    if(mode==='memory')f.store.claimActivity=async()=>({fresh:true,durable:false})
    if(mode==='throw')f.store.claimActivity=async()=>{throw Error('unavailable')}
    if(mode==='readback')f.store.getActivityClaim=async()=>({durable:true,claim:null})
    assert.equal((await f.run()).reason,'outreach_claim_unavailable');assert.equal(f.sends,0)
  }
})

test('ambiguous dispatch and failed receipt persistence retain claim and block retry',async()=>{
  for(const mode of ['timeout','rejected','missing-id','receipt']) {
    const f=fixture();let calls=0
    const send=async()=>{calls++;if(mode==='timeout')throw Error('timeout');return mode==='rejected'?{ok:false}:mode==='missing-id'?{ok:true}:{ok:true,id:'email-1'}}
    if(mode==='receipt')f.store.transitionActivityClaim=async()=>({durable:false,updated:false})
    assert.equal((await f.run({send})).ok,false)
    assert.equal((await f.run({send})).reason,'outreach_send_unconfirmed')
    assert.equal(calls,1);assert.equal(f.claims.size,1)
  }
})

test('null or mismatched sent-state results never report completion',async()=>{
  for(const result of [null,{id:'other',status:'sent'},{id:'deal-1',status:'approved'}]) {
    const f=fixture();f.store.updateDeal=async()=>result
    assert.equal((await f.run()).reason,'outreach_sent_status_unconfirmed')
    assert.equal((await f.run()).reason,'outreach_sent_status_unconfirmed');assert.equal(f.sends,1)
  }
})


test('actual send route uses durable guard across provider success and status failure',async()=>{
  const {readFile}=await import('node:fs/promises')
  const {runInNewContext}=await import('node:vm')
  const source=await readFile(new URL('./console/api.mjs',import.meta.url),'utf8')
  const start=source.indexOf("      if (method === 'POST' && seg[1] && !seg[2] && query.action === 'send')")
  const route=source.slice(start,source.indexOf('\n    // ---- STRIPE PAYMENT LINK',start)).trim().replace(/\n    \}$/, '')
  const f=fixture();let sends=0
  f.store.listDeals=async()=>[{id:'deal-1',status:'approved',packet:{headline:'Synthetic',outreach_en:'Review only'}}]
  const context={method:'POST',seg:['deals','deal-1'],query:{action:'send'},body:{to:message.to},store:f.store,sendOutreachOnce,
    connectors:{get:()=>({configured:()=>true,send:async()=>{sends++;return {ok:true,id:'email-1'}}})},
    escapeHtml:String,log:()=>{},ok:json=>({status:200,json}),bad:(status,reason)=>({status,json:{ok:false,reason}})}
  f.failStatus=true
  assert.equal((await runInNewContext('(async()=>{'+route+'})()',context)).json.reason,'outreach_sent_status_unconfirmed')
  f.failStatus=false
  const retry=await runInNewContext('(async()=>{'+route+'})()',context)
  assert.equal(retry.status,200);assert.equal(retry.json.replayed,true);assert.equal(sends,1)
})
