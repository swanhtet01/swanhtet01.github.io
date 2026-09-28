import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import test from 'node:test'
import * as contract from '../showroom/src/products/ecommerce/operator-review-contract.ts'
const require=createRequire(new URL('../showroom/package.json',import.meta.url))
const ts=require('typescript')
const source=readFileSync(new URL('../showroom/src/products/ecommerce/CatalogReviewPreparation.tsx',import.meta.url),'utf8')
const compiled=ts.transpileModule(source,{compilerOptions:{module:1,jsx:4,target:9}}).outputText
const id='11111111-1111-4111-8111-111111111111'
const prepared={sourceVersion:1,contentRevision:0,previewDigest:'sha256:'+'a'.repeat(64),readAt:new Date(Date.now()-1000).toISOString(),preview:{}}
function harness() {
 const h={slots:[],cursor:0,effects:[],listeners:new Map(),storage:new Map(),writes:[],withdrawals:[],who:{workspaceId:'workspace',userId:'owner'},denied:false,fail:false}
 const storage={getItem:key=>{if(h.denied)throw Error('denied');return h.storage.get(key)??null},setItem:(key,value)=>{if(h.denied)throw Error('denied');h.storage.set(key,value)},removeItem:key=>{if(h.removeDenied?.(key))throw Error('remove denied');h.storage.delete(key)}}
 const exports={}
 vm.runInNewContext(compiled,{exports,crypto:{randomUUID:()=>id},window:{sessionStorage:storage,addEventListener:(n,f)=>h.listeners.set(n,f),removeEventListener:n=>h.listeners.delete(n)},require:name=>{
  if(name==='react')return {useState:initial=>{const i=h.cursor++;if(!(i in h.slots))h.slots[i]=typeof initial==='function'?initial():initial;return[h.slots[i],v=>{h.slots[i]=typeof v==='function'?v(h.slots[i]):v}]},useRef:initial=>{const i=h.cursor++;return h.slots[i]??(h.slots[i]={current:initial})},useEffect:fn=>h.effects.push(fn)}
  if(name==='react/jsx-runtime')return {jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props}),Fragment:'fragment'}
  if(name==='./PreparedCatalog')return {PreparedCatalog:'catalog'}
  if(name==='./operator-review-contract')return {...contract,verifyCatalogPreparation:async()=>prepared,verifyCatalogRecipients:value=>value}
  if(name==='../../core/managed-trial')return {
   currentManagedIdentity:async()=>h.who,sameManagedIdentity:(a,b)=>a.workspaceId===b.workspaceId&&a.userId===b.userId,
   loadManagedEcommercePreparation:async()=>{h.sourceReads=(h.sourceReads??0)+1;if(h.readFail)throw Error('unavailable');return {}},loadManagedEcommerceRecipients:async()=>{h.recipientReads=(h.recipientReads??0)+1;if(h.readFail)throw Error('unavailable');return {recipients:[{grantId:id,label:'Customer'}],nextAfter:null}},
   loadManagedEcommerceReviews:async (who,after)=>{
    h.directoryReads=(h.directoryReads??0)+1
    if(h.directoryWait)await h.directoryWait
    return {reviews:[{reviewId:id,sourceVersion:1,contentRevision:0,previewDigest:prepared.previewDigest,
      preparedAt:prepared.readAt,expiresAt:new Date(Date.now()+86400000).toISOString(),status:'active'}],
      nextAfter:null,readAt:new Date().toISOString(),publicationAuthorized:false,deploymentAuthorized:false,...h.directoryPatch}
   },
   loadManagedEcommerceOperatorDecisions:async (reviewId,who,after)=>{
    h.responseReads=(h.responseReads??0)+1;h.responseCursor=after
    if(h.responseWait)await h.responseWait;if(h.responseFail)throw Error('unavailable')
    const envelope=[...h.storage.values()].map(JSON.parse).find(v=>v.command)
    const command=envelope?.command??{expectedVersion:1,contentRevision:0,previewDigest:prepared.previewDigest,readAt:prepared.readAt}
    return {reviewId,sourceVersion:command.expectedVersion,contentRevision:command.contentRevision,previewDigest:command.previewDigest,
      status:'active',readAt:new Date().toISOString(),decisions:[{commandId:id,kind:'feedback',note:'စျေးနှုန်း ပြင်ပါ',createdAt:command.readAt}],
      nextAfter:null,publicationAuthorized:false,deploymentAuthorized:false,...h.responsePatch}
   },
   resolveExpiredManagedEcommerceReview:async (reviewId,expiresAt)=>{
    h.resolutions=(h.resolutions??0)+1;h.resolutionPayload={reviewId,expiresAt}
    if(h.resolveWait)await h.resolveWait;if(h.resolveFail)throw Error('unconfirmed')
    return {reviewId,expiresAt,readAt:expiresAt,status:'absent_expired',publicationAuthorized:false,deploymentAuthorized:false,...h.resolvePatch}
   },
   reconcileManagedEcommerceReview:async reviewId=>{
    h.checks=(h.checks??0)+1;if(h.checkWait)await h.checkWait;if(h.checkFail)throw Error('unconfirmed')
    const values=[...h.storage.values()].map(JSON.parse),command=values.find(v=>v.reviewId)??values.find(v=>v.command)?.command
    return {reviewId,sourceVersion:command.expectedVersion,contentRevision:command.contentRevision,previewDigest:command.previewDigest,
     preparedAt:command.readAt,expiresAt:command.expiresAt,readAt:h.checkStatus==='expired'?command.expiresAt:new Date().toISOString(),
     status:h.checkStatus??'active',publicationAuthorized:false,deploymentAuthorized:false}
   },
   withdrawManagedEcommerceReview:async reviewId=>{h.withdrawals.push(reviewId);if(h.withdrawWait)await h.withdrawWait;if(h.withdrawFail)throw Error('uncertain');return {reviewId,status:'revoked',persisted:true,replayed:false,publicationAuthorized:false,deploymentAuthorized:false}},
   prepareManagedEcommerceReview:async payload=>{h.writes.push(payload);if(h.wait)await h.wait;if(h.fail)throw Error('uncertain');return {reviewId:payload.reviewId,sourceVersion:payload.expectedVersion,contentRevision:0,previewDigest:prepared.previewDigest,preparedAt:new Date().toISOString(),expiresAt:payload.expiresAt,status:'prepared_preview',persisted:true,replayed:h.writes.length>1,publicationAuthorized:false,deploymentAuthorized:false}}
  }
  throw Error(name)
 }})
 h.render=()=>{h.cursor=0;h.effects=[];return exports.CatalogReviewPreparation({workspaceId:'workspace',actorId:'owner'})}
 const nodes=t=>Array.isArray(t)?t.flatMap(nodes):t&&typeof t==='object'?[t,...nodes(t.props?.children)]:[]
 h.click=label=>{const button=nodes(h.render()).find(n=>n.type==='button'&&(Array.isArray(n.props.children)?n.props.children.join(''):n.props.children)===label);assert.ok(button,label);button.props.onClick()}
 h.render();h.cleanup=h.effects[0]();return h
}
const flush=async()=>{for(let i=0;i<25;i++)await Promise.resolve()}
test('rapid repeated prepare sends once and verified success retains a recoverable receipt',async()=>{
 const h=harness();h.click('Open saved catalog');await flush()
 let release;h.wait=new Promise(resolve=>{release=resolve})
 h.click('Prepare review');h.click('Prepare review');await flush()
 assert.equal(h.writes.length,1);assert.equal(h.storage.size,1)
 release();await flush();assert.equal(h.storage.size,2);assert.ok(h.slots[4])
})
test('uncertain save retries exact request and storage denial cannot write',async()=>{
 const h=harness();h.click('Open saved catalog');await flush();h.fail=true
 h.click('Prepare review');await flush();assert.equal(h.storage.size,1)
 h.fail=false;h.click('Retry same request');await flush()
 assert.deepEqual(h.writes[1],h.writes[0]);assert.equal(h.storage.size,2)
 const denied=harness();denied.click('Open saved catalog');await flush();denied.denied=true
 denied.click('Prepare review');await flush();assert.equal(denied.writes.length,0)
})
test('focus during save suppresses stale confirmation but retains retry metadata',async()=>{
 const h=harness();h.click('Open saved catalog');await flush()
 let release;h.wait=new Promise(resolve=>{release=resolve});h.click('Prepare review');await flush()
 h.listeners.get('focus')();release();await flush()
 assert.equal(h.slots[0],null);assert.equal(h.slots[4],null);assert.equal(h.storage.size,1)
})
test('changed account clears loaded data and prevents preparation',async()=>{
 const h=harness();h.click('Open saved catalog');await flush();h.who={workspaceId:'other',userId:'other'}
 h.click('Prepare review');await flush();assert.equal(h.writes.length,0);assert.equal(h.slots[0],null)
})

test('confirmed review reopens without another preparation and withdrawal retries safely',async()=>{
 const h=harness();h.click('Open saved catalog');await flush();h.click('Prepare review');await flush()
 const reviewId=h.slots[4].reviewId;h.listeners.get('focus')();h.click('Open saved catalog');await flush()
 assert.equal(h.slots[4].reviewId,reviewId);assert.equal(h.writes.length,1)
 h.withdrawFail=true;h.click('Withdraw review');await flush();assert.equal(h.storage.size,2);assert.ok(h.slots[4])
 h.withdrawFail=false;let release;h.withdrawWait=new Promise(resolve=>{release=resolve})
 h.click('Withdraw review');h.click('Withdraw review');await flush();assert.equal(h.withdrawals.length,2)
 release();await flush();assert.equal(h.storage.size,0);assert.equal(h.slots[4],null)
})

test('partial withdrawal cleanup remains recoverable after reopening',async()=>{
 for(const receiptFailure of [false,true]) {
  const h=harness();h.click('Open saved catalog');await flush();h.click('Prepare review');await flush()
  h.removeDenied=key=>key.endsWith(':receipt')===receiptFailure
  h.click('Withdraw review');await flush();assert.ok(h.storage.size>0)
  h.listeners.get('focus')();h.click('Open saved catalog');await flush();assert.ok(h.slots[4])
  h.removeDenied=null;h.click('Withdraw review');await flush()
  assert.equal(h.storage.size,0);assert.equal(h.writes.length,1)
 }
})


test('retained request can reopen and retry without catalog or recipient reads',async()=>{
 const h=harness();h.click('Open saved catalog');await flush();h.fail=true
 h.click('Prepare review');await flush();const request=h.writes[0]
 h.listeners.get('focus')();h.readFail=true;h.click('Open saved catalog');await flush()
 assert.equal(h.slots[0],null);assert.equal(h.slots[1],null);assert.ok(h.slots[3])
 assert.equal(h.sourceReads,1);assert.equal(h.recipientReads,1)
 h.fail=false;h.click('Retry same request');await flush()
 assert.deepEqual(h.writes[1],request);assert.ok(h.slots[4]);assert.equal(h.storage.size,2)
})


test('status check recovers active uncertain review without another prepare',async()=>{
 const h=harness();h.click('Open saved catalog');await flush();h.fail=true;h.click('Prepare review');await flush()
 h.click('Check review status');h.click('Check review status');await flush()
 assert.equal(h.checks,1);assert.equal(h.writes.length,1);assert.ok(h.slots[4]);assert.equal(h.storage.size,2)
})
test('only verified inactive reviews clear retained state',async()=>{
 for(const status of ['stale','revoked','expired','missing']){
  const h=harness();h.click('Open saved catalog');await flush();h.fail=true;h.click('Prepare review');await flush()
  h.checkStatus=status;h.click('Check review status');await flush()
  assert.equal(h.storage.size,status==='missing'?1:0);assert.equal(h.writes.length,1)
 }
 const h=harness();h.click('Open saved catalog');await flush();h.fail=true;h.click('Prepare review');await flush()
 h.checkFail=true;h.click('Check review status');await flush();assert.equal(h.storage.size,1)
})
test('focus and account changes during reconciliation preserve retry metadata',async()=>{
 for(const change of ['focus','account']){
  const h=harness();h.click('Open saved catalog');await flush();h.fail=true;h.click('Prepare review');await flush()
  let release;h.checkWait=new Promise(resolve=>{release=resolve});h.checkStatus='revoked';h.click('Check review status');await flush()
  if(change==='focus')h.listeners.get('focus')();else h.who={workspaceId:'other',userId:'other'}
  release();await flush();assert.equal(h.storage.size,1);assert.equal(h.slots[4],null)
 }
})
test('inactive receipt cleanup can reopen after either removal fails',async()=>{
 for(const receiptFailure of [false,true]){
  const h=harness();h.click('Open saved catalog');await flush();h.click('Prepare review');await flush()
  h.checkStatus='stale';h.removeDenied=key=>key.endsWith(':receipt')===receiptFailure;h.click('Check review status');await flush()
  assert.ok(h.storage.size>0);h.listeners.get('focus')();h.click('Open saved catalog');await flush();assert.ok(h.slots[4])
  h.removeDenied=null;h.click('Check review status');await flush();assert.equal(h.storage.size,0);assert.equal(h.writes.length,1)
 }
})


test('expired absence clears only after exact server proof and prevents duplicate calls',async()=>{
 const h=harness();h.click('Open saved catalog');await flush();h.fail=true;h.click('Prepare review');await flush()
 h.click('Resolve expired request');h.click('Resolve expired request');await flush()
 assert.equal(h.resolutions,1);assert.deepEqual(h.resolutionPayload,{reviewId:h.writes[0].reviewId,expiresAt:h.writes[0].expiresAt})
 assert.equal(h.storage.size,0);assert.equal(h.slots[3],null);assert.equal(h.writes.length,1)
})
test('expired recovery retains requests on failed proof, storage denial or identity change',async()=>{
 for(const failure of ['network','wrong-review','early','storage','focus','account','changed-command']){
  const h=harness();h.click('Open saved catalog');await flush();h.fail=true;h.click('Prepare review');await flush()
  if(failure==='network')h.resolveFail=true
  if(failure==='wrong-review')h.resolvePatch={reviewId:'22222222-2222-4222-8222-222222222222'}
  if(failure==='early')h.resolvePatch={readAt:prepared.readAt}
  if(failure==='storage')h.removeDenied=()=>true
  let release;h.resolveWait=new Promise(resolve=>{release=resolve});h.click('Resolve expired request');await flush()
  if(failure==='focus')h.listeners.get('focus')()
  if(failure==='account')h.who={workspaceId:'other',userId:'other'}
  if(failure==='changed-command'){
   const [key,raw]=[...h.storage][0];h.storage.set(key,JSON.stringify({...JSON.parse(raw),expectedVersion:2}))
  }
  release();await flush();assert.equal(h.storage.size,1,failure);assert.equal(h.writes.length,1)
 }
})


test('operator shows verified feedback or acceptance without preparing again',async()=>{
 for(const kind of ['feedback','acceptance']){
  const h=harness();h.click('Open saved catalog');await flush();h.click('Prepare review');await flush()
  if(kind==='acceptance')h.responsePatch={decisions:[{commandId:id,kind,note:null,createdAt:prepared.readAt}]}
  h.click('Check response');h.click('Check response');await flush()
  const output=JSON.stringify(h.render());assert.match(output,kind==='feedback'?/စျေးနှုန်း ပြင်ပါ/:/Catalog accepted/)
  assert.equal(h.responseReads,1);assert.equal(h.writes.length,1)
  h.listeners.get('focus')();assert.doesNotMatch(JSON.stringify(h.render()),/စျေးနှုန်း ပြင်ပါ|Catalog accepted/)
 }
})

test('late or invalid operator responses never restore private notes',async()=>{
 for(const change of ['focus','storage','account','unmount','invalid','failed']){
  const h=harness();h.click('Open saved catalog');await flush();h.click('Prepare review');await flush()
  let release;h.responseWait=new Promise(resolve=>{release=resolve});h.click('Check response');await flush()
  if(change==='account')h.who={workspaceId:'other',userId:'other'}
  else if(change==='unmount')h.cleanup()
  else if(change==='invalid')h.responsePatch={sourceVersion:999}
  else if(change==='failed')h.responseFail=true
  else h.listeners.get(change)()
  release();await flush();assert.doesNotMatch(JSON.stringify(h.render()),/စျေးနှုန်း ပြင်ပါ|Catalog accepted/)
  assert.equal(h.writes.length,1)
 }
})

test('operator response pages replace previous notes and label inactive history',async()=>{
 const h=harness();h.click('Open saved catalog');await flush();h.click('Prepare review');await flush()
 const commandId=n=>`22222222-2222-4222-8222-${String(n).padStart(12,'0')}`
 h.responsePatch={status:'stale',decisions:Array.from({length:50},(_,i)=>({commandId:commandId(i+1),kind:'feedback',note:'Earlier note '+i,createdAt:prepared.readAt})),nextAfter:commandId(50)}
 h.click('Check response');await flush();assert.match(JSON.stringify(h.render()),/earlier responses/)
 h.responsePatch={status:'stale',decisions:[{commandId:commandId(51),kind:'feedback',note:'Last note',createdAt:prepared.readAt}],nextAfter:null}
 h.click('More responses');await flush();assert.equal(h.responseCursor,commandId(50))
 assert.match(JSON.stringify(h.render()),/Last note/);assert.doesNotMatch(JSON.stringify(h.render()),/Earlier note/)
 assert.equal(h.writes.length,1)
})


test('saved directory restores read-only responses with empty tab storage',async()=>{
 const h=harness();assert.equal(h.storage.size,0)
 h.click('Saved reviews');await flush()
 h.click(new Date(prepared.readAt).toLocaleString()+' · active');await flush()
 assert.match(JSON.stringify(h.render()),/စျေးနှုန်း ပြင်ပါ/)
 assert.equal(h.storage.size,0);assert.equal(h.writes.length,0);assert.equal(h.withdrawals.length,0)
 assert.doesNotMatch(JSON.stringify(h.render()),/Withdraw review|Retry same request|Prepare review/)
 h.listeners.get('focus')();assert.doesNotMatch(JSON.stringify(h.render()),/စျေးနှုန်း ပြင်ပါ/)
})

test('directory rejects invalid payload and late identity changes without replacing pending command',async()=>{
 for(const change of ['invalid','account','focus']){
  const h=harness();h.click('Open saved catalog');await flush();h.fail=true;h.click('Prepare review');await flush()
  const before=JSON.stringify([...h.storage]);let release;h.directoryWait=new Promise(resolve=>{release=resolve})
  h.click('Saved reviews');await flush()
  if(change==='invalid')h.directoryPatch={publicationAuthorized:true}
  else if(change==='account')h.who={workspaceId:'other',userId:'other'}
  else h.listeners.get('focus')()
  release();await flush();assert.equal(JSON.stringify([...h.storage]),before);assert.equal(h.writes.length,1)
  assert.doesNotMatch(JSON.stringify(h.render()),/ · active/)
 }
})

test('directory contract rejects unordered, oversized or malformed saved assignments',()=>{
 const item={reviewId:id,sourceVersion:1,contentRevision:0,previewDigest:prepared.previewDigest,preparedAt:prepared.readAt,
  expiresAt:new Date(Date.now()+86400000).toISOString(),status:'active'}
 const page={reviews:[item],nextAfter:null,readAt:new Date().toISOString(),publicationAuthorized:false,deploymentAuthorized:false}
 for(const patch of [{nextAfter:id},{reviews:[item,item]},{reviews:[{...item,sourceVersion:0}]},{reviews:[{...item,status:'published'}]},
  {reviews:[{...item,recipient:'private'}]},{reviews:[{...item,expiresAt:prepared.readAt}]},{readAt:'bad'},{deploymentAuthorized:true}])assert.throws(()=>contract.verifyCatalogReviewDirectory({...page,...patch}))
 assert.throws(()=>contract.verifyCatalogReviewDirectory(page,id))
})


test('replacement preparation requires verified stale receipt and reloads current source',async()=>{
 const h=harness();h.click('Open saved catalog');await flush();h.click('Prepare review');await flush()
 const retained=JSON.stringify([...h.storage]);assert.equal(h.sourceReads,1)
 h.click('Open saved catalog');await flush()
 assert.equal(h.sourceReads,1,'retained receipt cannot silently start another review')
 h.checkFail=true;h.click('Check review status');await flush()
 assert.equal(JSON.stringify([...h.storage]),retained)
 assert.equal(h.writes.length,1)
 h.checkFail=false;h.checkStatus='stale';h.click('Check review status');await flush()
 assert.equal(h.storage.size,0)
 assert.doesNotMatch(JSON.stringify(h.render()),/Open private review|Withdraw review/)
 h.click('Open saved catalog');await flush()
 assert.equal(h.sourceReads,2,'replacement reads the current catalog instead of reusing old source')
 assert.equal(h.recipientReads,2)
 assert.match(JSON.stringify(h.render()),/Prepare review/)
 assert.equal(h.writes.length,1,'opening replacement never submits it automatically')
 assert.equal(h.withdrawals.length,0,'stale cleanup does not revoke or delete server history')
})
