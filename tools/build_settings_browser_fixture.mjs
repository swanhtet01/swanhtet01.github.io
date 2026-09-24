import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { mkdirSync, writeFileSync } from 'node:fs'
const { build } = createRequire(resolve('showroom/package.json'))('esbuild')
const out = resolve('showroom/dist/__qa-settings')
mkdirSync(out, { recursive: true })
await build({ stdin: { resolveDir: resolve('showroom'), loader: 'tsx', contents: `
import React from 'react';import {createRoot} from 'react-dom/client';
import {MemoryRouter,Routes,Route,Outlet} from 'react-router';
import {SettingsPage} from './src/core/SettingsPage';
import {buildClientDemoBlueprint,buildClientDemoKit,clientDemoPreset,prepareClientDemoInBrowser} from './src/core/client-onboarding';
import './src/core/core-app.css';
const memory=()=>{const values=new Map();return {getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k),clear:()=>values.clear(),key:i=>[...values.keys()][i]??null,get length(){return values.size}}};
Object.defineProperty(window,'localStorage',{value:memory()});Object.defineProperty(window,'sessionStorage',{value:memory()});
const nativeIDB=window.indexedDB;const prefix='supermega-qa-'+crypto.randomUUID()+'-';const names=new Set();const connections=new Set();
Object.defineProperty(window,'indexedDB',{value:{open(name,version){const isolated=prefix+name;names.add(isolated);const request=version===undefined?nativeIDB.open(isolated):nativeIDB.open(isolated,version);request.addEventListener('success',()=>connections.add(request.result));return request},deleteDatabase(name){return nativeIDB.deleteDatabase(prefix+name)},cmp:nativeIDB.cmp.bind(nativeIDB)}});
Object.defineProperty(navigator,'storage',{value:{persist:async()=>false,persisted:async()=>false,estimate:async()=>({usage:0,quota:100000000})}});
window.fetch=async()=>{throw Error('Fixture network denied')};
const root=createRoot(document.getElementById('root'));
async function cleanup(){root.unmount();for(const db of connections)db.close();await Promise.all([...names].map(name=>new Promise((resolve,reject)=>{const r=nativeIDB.deleteDatabase(name);r.onsuccess=resolve;r.onerror=reject;r.onblocked=()=>reject(Error('Synthetic cleanup blocked'))})));document.body.textContent='Synthetic databases removed';}

const cleanupButton=document.createElement('button');cleanupButton.textContent='Clean synthetic databases';cleanupButton.onclick=()=>void cleanup();document.body.prepend(cleanupButton);
let releaseRead;
function report(text){document.getElementById('evidence').textContent=text}
async function load(label,kind,delayed=false){
  try{
    const preset=clientDemoPreset('service-business');
    const blueprint=buildClientDemoBlueprint({workspace:'Synthetic '+label,owner:'Synthetic reviewer',presetId:preset.id,selections:preset.selections.filter(p=>p.product==='website')});
    const kit=buildClientDemoKit(blueprint,new Date().toISOString());
    const artifact=kind==='package'?await prepareClientDemoInBrowser(kit,[]):kit;
    const input=[...document.querySelectorAll('label')].find(node=>node.textContent.trim()===(kind==='package'?'Load private package':'Load setup kit'))?.querySelector('input');
    if(!input)throw Error('Open the existing-package controls first');
    const file=new File([JSON.stringify(artifact)],'synthetic.json',{type:'application/json'});
    if(delayed){const text=file.text.bind(file);Object.defineProperty(file,'text',{value:async()=>{await new Promise(resolve=>{releaseRead=resolve});return text()}})}
    const transfer=new DataTransfer();transfer.items.add(file);input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));
    report(delayed?'Synthetic file read is held':kind==='package'?artifact.review.confirmation:'Synthetic setup kit selected');
  }catch(error){report(error.message)}
}
root.render(<><p>Isolated actual Settings. Synthetic memory and databases only. Network blocked.</p>
<button onClick={()=>void load('A','package')}>Load synthetic package A</button>
<button onClick={()=>void load('B','package')}>Load synthetic package B</button>
<button onClick={()=>void load('B','kit')}>Load synthetic setup B</button>
<button onClick={()=>void load('B','package',true)}>Hold package B read</button>
<button onClick={()=>{releaseRead?.();releaseRead=null;report('Synthetic file read released')}}>Release file read</button>
<output id="evidence"/>
<MemoryRouter initialEntries={['/settings/']}><Routes><Route element={<Outlet context={{status:'demo',serviceStatus:'demo',operatingMode:'isolated_demo',enterpriseDbReady:false,authReady:false,auditReady:false,writesReady:false,coverageScore:0,requirements:[],activationSteps:[],evidencePlan:[],activationManifest:null,importProvisioning:null}}/>}><Route path="settings/" element={<SettingsPage/>}/></Route></Routes></MemoryRouter></>);
` }, jsx:'automatic',bundle:true,format:'esm',target:'es2022',define:{'import.meta.env':'{}'},outfile:resolve(out,'fixture.js') })
writeFileSync(resolve(out,'index.html'),`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="connect-src 'none'; form-action 'none'"><title>Isolated Settings acceptance</title><link rel="stylesheet" href="fixture.css"><div id="root"></div><script type="module" src="fixture.js"></script>`)
console.log('Built /__qa-settings/. Clean synthetic databases before leaving; remove three assets after review.')
