import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { mkdirSync, writeFileSync } from 'node:fs'
const { build } = createRequire(resolve('showroom/package.json'))('esbuild')
const out = resolve('showroom/dist/__qa-spa')
mkdirSync(out, {recursive:true})
await build({stdin:{resolveDir:resolve('showroom'),loader:'tsx',contents:`
import React from 'react'; import {createRoot} from 'react-dom/client';
import {MemoryRouter,Routes,Route} from 'react-router';
import {CoreLayout} from './src/core/CoreShell';
const memory=()=>{const m=new Map();return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k),clear:()=>m.clear(),key:i=>[...m.keys()][i]??null,get length(){return m.size}}};
Object.defineProperty(window,'localStorage',{value:memory()});Object.defineProperty(window,'sessionStorage',{value:memory()});
window.fetch=async(url)=>{if(url==='/api/health')return new Response(JSON.stringify({status:'demo'}),{headers:{'content-type':'application/json'}});throw Error('Fixture network denied')};
function signal(key){const e=new Event('storage');Object.defineProperties(e,{key:{value:key},storageArea:{value:window.localStorage},oldValue:{get(){throw Error('Credential read forbidden')}},newValue:{get(){throw Error('Credential read forbidden')}}});window.dispatchEvent(e)}
new MutationObserver(()=>{for(const a of document.querySelectorAll('a[href]')){if(a.getAttribute('href')!=='#fixture'){a.setAttribute('href','#fixture');a.removeAttribute('target')}}}).observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['href']});
createRoot(document.getElementById('root')).render(<><p>Synthetic shell · memory only · no account connection</p><button onClick={()=>signal('unrelated-draft')}>Unrelated storage change</button><button onClick={()=>signal('supermega.auth.session.v1')}>Session change</button><MemoryRouter><Routes><Route element={<CoreLayout/>}><Route index element={<p>Synthetic private workspace content</p>}/></Route></Routes></MemoryRouter></>);
`},jsx:'automatic',bundle:true,format:'esm',target:'es2022',define:{'import.meta.env':'{}'},outfile:resolve(out,'fixture.js')})
writeFileSync(resolve(out,'index.html'),`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="connect-src 'none'; form-action 'none'"><title>Synthetic session QA</title><link rel="stylesheet" href="fixture.css"><div id="root"></div><script type="module" src="fixture.js"></script>`)
console.log('Synthetic actual-shell fixture at /__qa-spa/; remove generated assets after review.')
