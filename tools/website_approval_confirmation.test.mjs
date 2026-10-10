import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import vm from 'node:vm'
const { build } = createRequire(new URL('../showroom/package.json', import.meta.url))('esbuild')
const bundled = await build({stdin:{contents:"export * from './website-review'; export * from './website-model'",resolveDir:fileURLToPath(new URL('../showroom/src/products/website',import.meta.url)),loader:'ts'},bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'})
const api = await import('data:text/javascript;base64,'+Buffer.from(bundled.outputFiles[0].contents).toString('base64'))
function ready() { const workspace=api.createInitialWorkspace(); workspace.pages=workspace.pages.map(page=>({...page,stage:'ready'})); return workspace }
const actor='11111111-1111-4111-8111-111111111111'
const source=readFileSync(new URL('../showroom/src/products/website/PublishWorkspace.tsx',import.meta.url),'utf8')
test('one explicit review produces five valid durable transitions and an exact retained artifact',async()=>{
 let state=ready(), history=[state], count=0
 const expected=api.websiteSource(state)
 function mutate(update){const next=api.applyWebsiteWorkspaceUpdate(state,update);assert.equal(next.ok,true,next.error);assert.equal(next.changed,true);state=next.workspace;history.push(state);return Promise.resolve(true)}
 await api.saveReviewedWebsite({source:expected,reviewer:actor,confirmed:true,callbacks:{
 onAddEvidence:input=>mutate(current=>{api.requireReviewedSource(current,input.source);return api.recordWebsiteEvidence(current,{...input,actionId:'review-'+(++count),capturedAt:'2026-10-10T10:00:00.000Z'})}),
 onApprove:input=>mutate(current=>{api.requireReviewedSource(current,input.source);return api.approveWebsiteRevision(current,{...input,actionId:'approval-'+(++count),capturedAt:'2026-10-10T10:00:01.000Z'})}),
 onRecordPublish:expected=>mutate(current=>{api.requireReviewedSource(current,expected);return api.recordWebsiteSnapshot(current,{actionId:'snapshot-'+(++count),capturedAt:'2026-10-10T10:00:02.000Z'})})
 }})
 assert.equal(count,5);assert.ok(api.getCurrentPublish(state));assert.equal(state.evidence.length,3)
 assert.equal(state.localPublishes[0].artifact.contentDigest,api.createWebsitePreviewArtifact(state).contentDigest)
 const out=new URL('../.tmp/sites-guided-review-20261010/',import.meta.url);mkdirSync(out,{recursive:true});writeFileSync(new URL('transitions.json',out),JSON.stringify(history))
})
test('failure at each stage stops later dispatch; no implicit approval on retry',async()=>{
 for(let fail=1;fail<=5;fail++){let count=0;const stage=async()=>++count!==fail
 await assert.rejects(api.saveReviewedWebsite({source:api.websiteSource(ready()),reviewer:actor,confirmed:true,callbacks:{onAddEvidence:stage,onApprove:stage,onRecordPublish:stage}}));assert.equal(count,fail)}
 let calls=0;const stage=async()=>{calls++;return true}
 await assert.rejects(api.saveReviewedWebsite({source:api.websiteSource(ready()),reviewer:actor,confirmed:false,callbacks:{onAddEvidence:stage,onApprove:stage,onRecordPublish:stage}}));assert.equal(calls,0)
})
test('source guard rejects changed content and same-content revision changes',()=>{
 const state=ready(),expected=api.websiteSource(state)
 assert.doesNotThrow(()=>api.requireReviewedSource(state,expected))
 assert.throws(()=>api.requireReviewedSource({...state,siteName:'Changed'},expected),/changed during review/)
 assert.throws(()=>api.requireReviewedSource({...state,contentRevision:state.contentRevision+1},expected),/changed during review/)
})
test('confirmation becomes stale after content, actor or recorded evidence changes',()=>{
 const expression=source.match(/const approvalKey = (.+)/)[1]
 const baseline={fingerprint:'web-11111111',workspace:{contentRevision:3,evidence:[]},actor}
 const key=value=>vm.runInNewContext(expression,value)
 for(const patch of [{fingerprint:'web-22222222'},{actor:'someone-else'},{workspace:{contentRevision:4,evidence:[]}},{workspace:{contentRevision:3,evidence:[{id:'changed'}]}}])assert.notEqual(key(baseline),key({...baseline,...patch}))
})
test('UI suppresses concurrent saves, unlocks after rejection and hides private errors',async()=>{
 const handler=source.slice(source.indexOf('  async function saveReview()'),source.indexOf('  return <section'))
 let reject,calls=0,issue='',submitting=false
 const context={canSave:true,saveInFlight:{current:false},setSubmitting:v=>submitting=v,setSaveIssue:v=>issue=v,fingerprint:'web-11111111',workspace:{contentRevision:1},actor,allConfirmed:true,props:{},saveReviewedWebsite:()=>{calls++;return new Promise((_,fail)=>reject=fail)}}
 const save=vm.runInNewContext(handler+'\nsaveReview',context),pending=save();await save();assert.equal(calls,1)
 reject(new Error('private backend detail'));await pending;assert.equal(submitting,false);assert.equal(context.saveInFlight.current,false);assert.match(issue,/could not confirm/);assert.doesNotMatch(issue,/private backend/)
})
