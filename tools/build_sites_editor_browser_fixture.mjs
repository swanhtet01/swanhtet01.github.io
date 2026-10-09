// Component-level QA only. Real editor/model, synthetic in-memory records, no provider access.
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const out = resolve(root, '.tmp/qa-sites-editor')
const { build } = createRequire(resolve(root, 'showroom/package.json'))('esbuild')
mkdirSync(out, { recursive: true })
await build({
  stdin: { resolveDir: resolve(root, 'showroom'), loader: 'tsx', contents: `
import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
import {ContentWorkspace} from './src/products/website/ContentWorkspace';
import {SitePreview} from './src/products/website/SitePreview';
import {createInitialWorkspace,createWebsiteEditSession,updateWebsiteEditSession,commitWebsiteEditSession,restoreWorkspace} from './src/products/website/website-model';
import {applyWebsiteStarterBrief} from './src/products/website/website-starter';
import './src/core/core-app.css';import './src/products/website/website-product.css';
window.fetch=async()=>{throw Error('Synthetic fixture network denied')};
let saved=JSON.stringify(applyWebsiteStarterBrief(createInitialWorkspace(),{
  templateId:'lead-generation',businessName:'Example Studio',offer:'Local design services',
  audience:'',proof:'',contactHref:''
},'2026-10-09T00:00:00.000Z'));
function App(){
  const [base,setBase]=useState(()=>restoreWorkspace(JSON.parse(saved))!);
  const [session,setSession]=useState(()=>createWebsiteEditSession(base));
  const [selected,setSelected]=useState(base.pages[0].id);
  const [generation,setGeneration]=useState(0);
  const [notice,setNotice]=useState('Synthetic editor opened. No provider or real customer data.');
  const page=session.workspace.pages.find(p=>p.id===selected)!;
  function update(updater){const result=updateWebsiteEditSession(session,current=>({
    ...current,pages:current.pages.map(candidate=>candidate.id===selected?updater(candidate):candidate)
  }));if(!result.ok){setNotice(result.error);return}setSession(result.session)}
  function reopen(){const current=restoreWorkspace(JSON.parse(saved))!;setBase(current);
    setSession(createWebsiteEditSession(current));setGeneration(n=>n+1);setNotice('Synthetic saved content reopened.');}
  function save(){const next=commitWebsiteEditSession(base,session);saved=JSON.stringify(next);
    const current=restoreWorkspace(JSON.parse(saved));if(!current)throw Error('Synthetic save failed model validation');
    setBase(current);setSession(createWebsiteEditSession(current));setNotice('Synthetic saved content validated.');}
  return <main className='website-product qa-sites'>
    <aside className='qa-banner'>LOCAL SYNTHETIC QA · real Sites editor and model · in-memory save/reopen · no authentication, managed database, publishing or customer acceptance.</aside>
    <nav className='qa-controls' aria-label='Synthetic editor controls'>
      {session.workspace.pages.map(p=><button aria-current={selected===p.id?'page':undefined} key={p.id} onClick={()=>setSelected(p.id)}>{p.internalName}</button>)}
      <button onClick={save}>Save synthetic draft</button>
      <button onClick={()=>{setSession(createWebsiteEditSession(base));setGeneration(n=>n+1);setNotice('Synthetic unsaved changes discarded.')}}>Discard synthetic draft</button>
      <button onClick={reopen}>Reopen synthetic saved content</button>
    </nav>
    <output role='status'>{notice}</output>
    <div className='qa-editor'>
      <ContentWorkspace key={selected+':'+generation} page={page} canDuplicate={false} deleteArmed={false}
        onDuplicate={()=>{}} onRequestDelete={()=>{}} onUpdatePage={update}/>
      <SitePreview device='desktop' page={page} pages={session.workspace.pages} siteName={session.workspace.siteName} onSelectPage={setSelected}/>
    </div>
  </main>
}
createRoot(document.getElementById('root')).render(<App/>);
` },
  bundle: true, jsx: 'automatic', format: 'esm',
  define: { 'import.meta.env': '{}', 'process.env.NODE_ENV': '"development"' },
  outfile: resolve(out, 'fixture.js'),
})
writeFileSync(resolve(out, 'qa.css'), `
body{margin:0;font:16px/1.5 system-ui}.qa-sites{height:auto;min-height:100dvh;padding:1rem}
.qa-banner{padding:.75rem;background:#fff4d7;color:#4c3b18;font-size:.875rem}
.qa-controls{display:flex;flex-wrap:wrap;gap:.5rem;margin-block:.75rem}
.qa-controls button{min-height:44px;padding:.5rem .75rem;border:1px solid #cdd2e2;border-radius:.5rem;background:white}
.qa-controls [aria-current=page]{background:#efedff;color:#4b3bdb}.qa-sites>output{display:block;margin-block:.75rem}
.qa-editor{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(0,1fr);gap:1rem;align-items:start}
.qa-editor>.website-editor-panel{height:auto}.qa-editor .website-editor-scroll{overflow:visible;padding:1rem}
@media(max-width:900px){.qa-editor{grid-template-columns:minmax(0,1fr)}.qa-sites{padding:.75rem}}
`)
writeFileSync(resolve(out, 'index.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'self'; connect-src 'none'; img-src 'none'; form-action 'none'; base-uri 'none'; style-src 'self' 'unsafe-inline'"><title>Synthetic Sites editor QA</title><link rel="stylesheet" href="fixture.css"><link rel="stylesheet" href="qa.css"><div id="root"></div><script type="module" src="fixture.js"></script></html>`)
console.log(JSON.stringify({ output: out, evidence: 'component-synthetic-only', providers: false, externalRequests: false }))
