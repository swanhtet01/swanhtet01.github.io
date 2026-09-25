import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sendOutreachOnce, readOutreachState, reconcileOutreachStatus } from './console/outreach-send.mjs'

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


test('actual outreach UI retains recovery guidance and retries only the original recipient',async()=>{
  const {readFile}=await import('node:fs/promises');const {runInNewContext}=await import('node:vm')
  const html=(await readFile(new URL('./public/index.html',import.meta.url),'utf8')).replace(/\r\n/g,'\n')
  const start=html.indexOf("  box.querySelectorAll('[data-emailsend]').forEach(b=>b.onclick=async()=>{")
  const body=html.slice(start,html.indexOf('\n}\n\nfunction openProposal',start)).split('b.onclick=async()=>{')[1].trim().replace(/\}\)$/, '')
  for(const reason of ['outreach_send_unconfirmed','outreach_receipt_unconfirmed','outreach_payload_conflict','outreach_sent_status_unconfirmed']){
    const status={textContent:''};const b={disabled:false,dataset:{emailsend:'deal-1'},closest:()=>({querySelector:()=>status})}
    let prompts=0;const requests=[]
    const context={b,prompt:()=>{prompts++;return 'qa@example.invalid'},toast:()=>{},loadOutreach:()=>{},api:async(method,path,data)=>{requests.push(data);return {ok:false,reason}}}
    await runInNewContext('(async()=>{'+body+'})()',context)
    assert.ok(status.textContent.length>30)
    assert.ok(!status.textContent.includes('outreach_'))
    if(reason==='outreach_sent_status_unconfirmed'){
      assert.equal(b.disabled,false);assert.equal(b.textContent,'Retry saving status')
      await runInNewContext('(async()=>{'+body+'})()',context)
      assert.equal(prompts,1);assert.equal(requests[1].to,'qa@example.invalid')
    }else{
      assert.equal(b.disabled,true);assert.equal(b.textContent,'Needs review')
      await runInNewContext('(async()=>{'+body+'})()',context)
      assert.equal(requests.length,1)
    }
  }
})


test('read-only outreach projection survives reopening without exposing payload or receipt',async()=>{
  const f=fixture()
  assert.equal(await readOutreachState('deal-1',f.store),'none')
  await f.run({send:async()=>{throw Error('unknown')}})
  assert.equal(await readOutreachState('deal-1',f.store),'unconfirmed')
  assert.equal(f.sends,0)
  const accepted=fixture();accepted.failStatus=true;await accepted.run()
  assert.equal(await readOutreachState('deal-1',accepted.store),'accepted')
  assert.equal(accepted.sends,1)
  for(const response of [{durable:false},{durable:true,claim:{id:'wrong',kind:'outreach_send_claim'}}, {durable:true,claim:{...accepted.claims.values().next().value,ref:'accepted:corrupt'}}]){
    assert.equal(await readOutreachState('deal-1',{getActivityClaim:async()=>response}),'unavailable')
  }
  assert.equal(await readOutreachState('deal-1',{getActivityClaim:async()=>{throw Error('unavailable')}}),'unavailable')
})


test('actual reopened outreach list offers send only for verified absent claims',async()=>{
  const {readFile}=await import('node:fs/promises');const {runInNewContext}=await import('node:vm')
  const html=(await readFile(new URL('./public/index.html',import.meta.url),'utf8')).replace(/\r\n/g,'\n')
  const render=html.slice(html.indexOf('async function loadOutreach('),html.indexOf('function openProposal(d){'))
  const rows=[];const box={innerHTML:'',appendChild:x=>rows.push(x),querySelectorAll:()=>[]}
  await runInNewContext(render+';loadOutreach()',{
    $:()=>box,esc:String,document:{createElement:()=>({})},
    api:async()=>({ok:true,deals:['none','unconfirmed','accepted','unavailable',undefined,'not_loaded'].map((state,i)=>({id:'d'+i,status:'approved',packet:{},outreach_send_state:state}))}),
  })
  assert.match(rows[0].innerHTML,/data-emailsend/)
  for(const row of rows.slice(1))assert.doesNotMatch(row.innerHTML,/data-emailsend/)
  assert.match(rows[1].innerHTML,/Send outcome is unconfirmed/)
  assert.match(rows[2].innerHTML,/needs reconciliation/)
  assert.match(rows[2].innerHTML,/data-reconcilesend/)
  assert.doesNotMatch(rows[1].innerHTML,/data-reconcilesend/)
  assert.match(rows[3].innerHTML,/could not be verified/)
  assert.match(rows[5].innerHTML,/has not been checked/)
  assert.match(rows[5].innerHTML,/data-checksend/)
})


test('focused deal status read reaches older rows with exactly one claim lookup',async()=>{
  const {readFile}=await import('node:fs/promises');const {runInNewContext}=await import('node:vm')
  const source=await readFile(new URL('./console/api.mjs',import.meta.url),'utf8')
  const start=source.indexOf("      if (method === 'GET' && !seg[1]) {",source.indexOf('// ---- DEALS'))
  const route=source.slice(start,source.indexOf("      if (method === 'POST' && !seg[1])",start))
  const rows=Array.from({length:75},(_,i)=>({id:'deal-'+i}))
  const reads=[]
  const context={method:'GET',seg:['deals'],query:{send_status_id:'deal-74'},store:{listDeals:async()=>rows},
    readOutreachState:async id=>{reads.push(id);return 'none'},ok:x=>x,bad:(status,reason)=>({status,reason})}
  const result=await runInNewContext('(async()=>{'+route+'})()',context)
  assert.deepEqual(reads,['deal-74']);assert.equal(result.deals[74].outreach_send_state,'none')
  assert.equal(result.deals[0].outreach_send_state,'not_loaded')
  context.query={send_status_id:'bad&query'}
  assert.equal((await runInNewContext('(async()=>{'+route+'})()',context)).status,400)
  assert.equal(reads.length,1)
})


test('reopened accepted receipt repairs status without any dispatch capability',async()=>{
  const f=fixture();f.failStatus=true
  await f.run();assert.equal(f.sends,1)
  assert.equal((await reconcileOutreachStatus('deal-1',f.store)).reason,'outreach_sent_status_unconfirmed')
  f.failStatus=false
  const result=await reconcileOutreachStatus('deal-1',f.store)
  assert.equal(result.ok,true);assert.equal(result.deal.status,'sent');assert.equal(f.sends,1)
  assert.equal((await reconcileOutreachStatus('deal-1',f.store)).ok,true)
  const uncertain=fixture();await uncertain.run({send:async()=>{throw Error('unknown')}})
  let writes=0;uncertain.store.updateDeal=async()=>{writes++;return {id:'deal-1',status:'sent'}}
  assert.equal((await reconcileOutreachStatus('deal-1',uncertain.store)).reason,'outreach_receipt_not_accepted')
  assert.equal((await reconcileOutreachStatus('missing',uncertain.store)).reason,'outreach_receipt_not_accepted')
  assert.equal(writes,0)
})


test('actual reconciliation route requires eligible deal and never resolves a connector',async()=>{
  const {readFile}=await import('node:fs/promises');const {runInNewContext}=await import('node:vm')
  const source=await readFile(new URL('./console/api.mjs',import.meta.url),'utf8')
  const start=source.indexOf("      if (method === 'POST' && seg[1] && !seg[2] && query.action === 'reconcile-send')")
  const route=source.slice(start,source.indexOf('// POST /api/deals/:id?action=send',start))
  let calls=0;let status='draft'
  const context={method:'POST',seg:['deals','deal-1'],query:{action:'reconcile-send'},store:{listDeals:async()=>[{id:'deal-1',status}]},
    reconcileOutreachStatus:async id=>{assert.equal(id,'deal-1');calls++;return {ok:true,reconciled:true}},
    connectors:{get:()=>{throw Error('no connector allowed')}},ok:x=>x,bad:(status,reason)=>({status,reason})}
  assert.equal((await runInNewContext('(async()=>{'+route+'})()',context)).status,409)
  assert.equal(calls,0);status='approved'
  assert.equal((await runInNewContext('(async()=>{'+route+'})()',context)).reconciled,true)
  assert.equal(calls,1)
})


test('generic deal status PATCH cannot bypass receipt-backed sent state',async()=>{
  const {readFile}=await import('node:fs/promises');const {runInNewContext}=await import('node:vm')
  const source=await readFile(new URL('./console/api.mjs',import.meta.url),'utf8')
  const start=source.indexOf("      if (method === 'PATCH' && seg[1] && !seg[2]) {",source.indexOf('// ---- DEALS'))
  const route=source.slice(start,source.indexOf('// Repair only an already accepted receipt',start))
  let writes=0
  const context={method:'PATCH',seg:['deals','deal-1'],body:{status:'sent'},DEAL_STATUSES:['draft','approved'],
    store:{updateDeal:async(id,patch)=>{writes++;return {id,...patch}}},log:()=>{},bad:(status,reason)=>({status,reason}),ok:x=>x}
  assert.equal((await runInNewContext('(async()=>{'+route+'})()',context)).reason,'sent_status_requires_receipt')
  assert.equal(writes,0)
  context.body={status:'approved'}
  assert.equal((await runInNewContext('(async()=>{'+route+'})()',context)).ok,true)
  assert.equal(writes,1)
  const html=(await readFile(new URL('./public/index.html',import.meta.url),'utf8')).replace(/\r\n/g,'\n')
  assert.doesNotMatch(html,/data-sent|>Mark sent</)
})
