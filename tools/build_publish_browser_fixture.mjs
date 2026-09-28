import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { mkdirSync, writeFileSync } from 'node:fs'
const require = createRequire(resolve('showroom/package.json'))
const { build } = require('esbuild')
const out = resolve('showroom/dist/__qa-spa')
mkdirSync(out, { recursive: true })
await build({ stdin: { resolveDir: resolve('showroom'), loader: 'tsx', contents: `
import React from 'react'; import {createRoot} from 'react-dom/client';
import {PublishWorkspace} from './src/products/website/PublishWorkspace';
import * as model from './src/products/website/website-model';
import './src/core/core-app.css'; import './src/products/website/website-product.css';
const memory=()=>{const m=new Map();return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k),clear:()=>m.clear(),key:i=>[...m.keys()][i]??null,get length(){return m.size}}};
Object.defineProperty(window,'localStorage',{value:memory()});
Object.defineProperty(window,'sessionStorage',{value:memory()});
let workspace=model.createInitialWorkspace();
workspace={...workspace,siteName:'Synthetic publishing QA',pages:workspace.pages.map(p=>({...p,stage:'ready'}))};
for(const kind of ['content','links','responsive']) workspace=model.recordWebsiteEvidence(workspace,{actionId:'qa-'+kind,capturedAt:'2026-09-24T10:00:00.000Z',kind,finding:'Synthetic fixture evidence only',reference:'Isolated rendering fixture',verifiedBy:'Synthetic reviewer'});
workspace=model.approveWebsiteRevision(workspace,{actionId:'qa-approval',capturedAt:'2026-09-24T10:01:00.000Z',reviewer:'Synthetic reviewer',note:'Fixture only, not customer acceptance'});
workspace=model.recordWebsiteSnapshot(workspace,{actionId:'qa-snapshot',capturedAt:'2026-09-24T10:02:00.000Z'});
const deny=async()=>false; const noop=()=>{};
// Keep every rendered anchor inside the fixture, including new-tab actions.
new MutationObserver(()=>{for(const a of document.querySelectorAll('a[href]')){if(a.getAttribute('href')!=='#fixture-no-send'){a.setAttribute('href','#fixture-no-send');a.removeAttribute('target')}}}).observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['href']});
createRoot(document.getElementById('root')!).render(<main className="core-main"><p role="status">Synthetic publishing QA · memory only · no delivery or publishing</p><PublishWorkspace approvalIsCurrent={true} checks={model.readinessChecks(workspace)} fingerprint={model.workspaceFingerprint(workspace)} managedActorId="" currentPublishId="qa-snapshot" publishIsCurrent={true} workspace={workspace} onAddEvidence={deny} onApprove={deny} onDownloadPublish={noop} onRecordPublish={async()=>{}}/></main>);
` }, jsx:'automatic', bundle:true, format:'esm', target:'es2022', outfile:resolve(out,'fixture.js') })
writeFileSync(resolve(out,'index.html'),`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="connect-src 'none'; form-action 'none'"><title>Synthetic publishing QA</title><link rel="stylesheet" href="fixture.css"><div id="root"></div><script type="module" src="fixture.js"></script>`)
console.log('Memory-only publishing fixture at /__qa-spa/; remove generated assets after review.')
