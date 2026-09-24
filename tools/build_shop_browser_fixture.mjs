import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
const { build } = createRequire(resolve('showroom/package.json'))('esbuild')
const out = resolve('showroom/dist/__qa-shop')
mkdirSync(out,{recursive:true})
await build({stdin:{resolveDir:resolve('showroom'),loader:'tsx',contents:`
import React from 'react';import {createRoot} from 'react-dom/client';import {MemoryRouter} from 'react-router';
import {CommercePage} from './src/core/CoreApp';import {createSeedCommerce,COMMERCE_KEY} from './src/core/commerce-workspace';
import './src/core/core-app.css';
let fail=false;let rejectedWrites=0;const values=new Map();
const memory=(map)=>({getItem:k=>map.get(k)??null,setItem:(k,v)=>{if(fail&&k===COMMERCE_KEY){rejectedWrites++;throw new DOMException('Synthetic quota','QuotaExceededError')};map.set(k,String(v))},removeItem:k=>map.delete(k),key:i=>[...map.keys()][i]??null,get length(){return map.size}});
Object.defineProperty(window,'localStorage',{value:memory(values)});Object.defineProperty(window,'sessionStorage',{value:memory(new Map())});
localStorage.setItem(COMMERCE_KEY,JSON.stringify(createSeedCommerce()));
const baseline=localStorage.getItem(COMMERCE_KEY);
const nativeIDB=window.indexedDB;const prefix='supermega-qa-'+crypto.randomUUID()+'-';const names=new Set();const connections=new Set();
Object.defineProperty(window,'indexedDB',{value:{open(name,version){const isolated=prefix+name;names.add(isolated);const request=version===undefined?nativeIDB.open(isolated):nativeIDB.open(isolated,version);request.addEventListener('success',()=>connections.add(request.result));return request},deleteDatabase(name){return nativeIDB.deleteDatabase(prefix+name)},cmp:nativeIDB.cmp.bind(nativeIDB)}});
Object.defineProperty(navigator,'storage',{value:{persist:async()=>false,persisted:async()=>false,estimate:async()=>({usage:0,quota:100000000})}});
window.fetch=async()=>{throw Error('Fixture network denied')};
const root=createRoot(document.getElementById('root'));
async function cleanup(){root.unmount();for(const db of connections)db.close();await Promise.all([...names].map(name=>new Promise((resolve,reject)=>{const r=nativeIDB.deleteDatabase(name);r.onsuccess=resolve;r.onerror=reject;r.onblocked=()=>reject(Error('Synthetic cleanup blocked'))})));document.body.textContent='Synthetic databases removed';}
function inspect(){const state=JSON.parse(localStorage.getItem(COMMERCE_KEY));document.getElementById('evidence').textContent=JSON.stringify({rejectedWrites,unchanged:localStorage.getItem(COMMERCE_KEY)===baseline,completed:state.orders.filter(o=>o.status==='completed').map(o=>({id:o.id,paymentStatus:o.paymentStatus})),stock:state.items[0].onHand});}
document.addEventListener('keydown',event=>{if(event.key==='F8'){event.preventDefault();fail=false;inspect()}if(event.key==='F9'){event.preventDefault();inspect()}});
root.render(<><p>Isolated real Shop page. Synthetic records only; network blocked. F8 enables synthetic writes; F9 inspects records, including while a dialog is open.</p><button onClick={()=>{fail=true;document.getElementById('evidence').textContent='Synthetic Commerce writes blocked'}}>Block synthetic writes</button><button onClick={()=>{fail=false;document.getElementById('evidence').textContent='Synthetic Commerce writes enabled'}}>Enable synthetic writes</button><button onClick={inspect}>Inspect synthetic records</button><button onClick={()=>void cleanup()}>Clean synthetic databases</button><output id="evidence"/><MemoryRouter initialEntries={['/shop/?tab=counter']}><CommercePage confirmedLocalShop={true} managedIdentity={null} tab="counter" shopCounterClientId="" shopCounterCustomer="" shopCounterSearch="" requestedRequestId={null} requestedShopTemplate={null} requestedSource={null} ecommerceCancellationNavigationIntent={null} ecommerceCorrectionNavigationIntent={null} ecommerceNavigationDraft={null} ecommerceOrderAmendmentNavigationIntent={null} ecommerceOrderRescheduleNavigationIntent={null} ecommerceReturnNavigationIntent={null} ecommerceSupportNavigationIntent={null}/></MemoryRouter></>);
`},plugins:[{name:'fixture-only-commerce-export',setup(b){b.onLoad({filter:/CoreApp\.tsx$/},a=>({loader:'tsx',contents:readFileSync(a.path,'utf8').replace('function CommercePage({','export function CommercePage({')}))}}],jsx:'automatic',bundle:true,format:'esm',define:{'import.meta.env':'{}'},outfile:resolve(out,'fixture.js')})
writeFileSync(resolve(out,'index.html'),'<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="connect-src \'none\'; form-action \'none\'"><title>Isolated Shop acceptance</title><link rel="stylesheet" href="fixture.css"><div id="root"></div><script type="module" src="fixture.js"></script>')
console.log('Built /__qa-shop/. Use Clean synthetic databases before leaving; remove three assets after review.')
