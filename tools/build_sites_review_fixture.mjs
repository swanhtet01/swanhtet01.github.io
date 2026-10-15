// Actual review UI + model, in-memory persistence; local synthetic QA only.
import {createRequire} from 'node:module'
import {mkdirSync,writeFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
const root=fileURLToPath(new URL('..',import.meta.url)),out=resolve(root,'.tmp/qa-workspaces')
const {build}=createRequire(resolve(root,'showroom/package.json'))('esbuild')
mkdirSync(out,{recursive:true})
await build({stdin:{resolveDir:resolve(root,'showroom'),loader:'tsx',contents:`
import React,{useRef,useState}from'react';import{createRoot}from'react-dom/client';
import{PublishWorkspace}from'./src/products/website/PublishWorkspace';
import{requireReviewedSource}from'./src/products/website/website-review';
import{createInitialWorkspace,websiteSource,readinessChecks,getCurrentApproval,getCurrentPublish,applyWebsiteWorkspaceUpdate,recordWebsiteEvidence,approveWebsiteRevision,recordWebsiteSnapshot}from'./src/products/website/website-model';
import'./src/products/website/website-product.css';
window.fetch=async()=>{throw Error('Network disabled in QA')};
const base=createInitialWorkspace();base.siteName='Corner Café · QA';base.pages=base.pages.map(p=>({...p,stage:'ready'}));
function App(){const[state,setState]=useState(base),[fail,setFail]=useState(false),[write,setWrite]=useState(true),[notice,setNotice]=useState('');const current=useRef(state);
async function mutate(input,fn){if(fail)throw Error('Synthetic save failure');requireReviewedSource(current.current,input.source??input);const result=applyWebsiteWorkspaceUpdate(current.current,w=>fn(w));if(!result.ok)throw Error(result.error);current.current=result.workspace;setState(result.workspace);return true}
const stamp=()=>({actionId:crypto.randomUUID(),capturedAt:new Date().toISOString()}),source=websiteSource(state),publish=getCurrentPublish(state);
return <main><p className="qa-label">LOCAL QA · Actual Sites component · Synthetic content and in-memory saves</p><PublishWorkspace canWrite={write} approvalIsCurrent={!!getCurrentApproval(state)} checks={readinessChecks(state,source.digest)} fingerprint={source.digest} managedActorId="11111111-1111-4111-8111-111111111111" currentPublishId={publish?.id??''} publishIsCurrent={!!publish} workspace={state} onEdit={()=>setNotice('Editor navigation requested')} onDownloadPublish={()=>setNotice('Download requested')} onAddEvidence={i=>mutate(i,w=>recordWebsiteEvidence(w,{...i,...stamp()}))} onApprove={i=>mutate(i,w=>approveWebsiteRevision(w,{...i,...stamp()}))} onRecordPublish={i=>mutate(i,w=>recordWebsiteSnapshot(w,stamp()))}/>
<footer><strong>QA controls</strong><button onClick={()=>setFail(!fail)}>Save failure: {fail?'on':'off'}</button><button onClick={()=>{current.current=structuredClone(base);setState(current.current)}}>Reset fixture</button><button onClick={()=>setWrite(!write)}>View only: {write?'off':'on'}</button><button onClick={()=>{const next={...current.current,siteName:current.current.siteName+' edited',contentRevision:current.current.contentRevision+1};current.current=next;setState(next)}}>Change saved content</button><span>{notice}</span><span>{state.events.length} saved review steps</span></footer></main>}
createRoot(document.getElementById('root')).render(<App/>);
`},jsx:'automatic',bundle:true,format:'esm',outfile:resolve(out,'review.js'),logLevel:'silent'})
writeFileSync(resolve(out,'review.html'),`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sites review · local QA</title><link rel="stylesheet" href="review.css"><style>*{box-sizing:border-box}body{margin:0;background:#f5f6fa;font:15px/1.6 system-ui;color:#182030}main{max-width:1600px;margin:auto;padding:32px}.qa-label{font-size:12px;color:#697386;margin:0 0 20px}footer{display:flex;flex-wrap:wrap;gap:12px;margin-top:40px;padding:16px;background:#fff3d7;font-size:12px}footer button{padding:8px;border:1px solid #bbb;border-radius:6px;background:white;cursor:pointer}@media(max-width:600px){main{padding:16px}}</style><div id="root"></div><script type="module" src="review.js"></script></html>`)
console.log(resolve(out,'review.html'))
