import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
const { build } = createRequire(resolve('showroom/package.json'))('esbuild')
const managed = process.argv.includes('--managed')
const out = resolve(managed ? '.tmp/qa-managed-shop' : '.tmp/qa-shop')
mkdirSync(out,{recursive:true})
await build({stdin:{resolveDir:resolve('showroom'),loader:'tsx',contents:`
import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {MemoryRouter} from 'react-router';
import {CommercePage} from './src/core/CoreApp';import {createSeedCommerce,COMMERCE_KEY} from './src/core/commerce-workspace';
import './src/core/core-app.css';
let fail=false;let rejectedWrites=0;let ledgerWrites=0;window.__qaFailAck=false;const values=new Map();
const memory=(map)=>({getItem:k=>map.get(k)??null,setItem:(k,v)=>{if(fail&&k===COMMERCE_KEY){rejectedWrites++;throw new DOMException('Synthetic quota','QuotaExceededError')};if(k===COMMERCE_KEY)ledgerWrites++;map.set(k,String(v))},removeItem:k=>map.delete(k),key:i=>[...map.keys()][i]??null,get length(){return map.size}});
Object.defineProperty(window,'localStorage',{value:memory(values)});Object.defineProperty(window,'sessionStorage',{value:memory(new Map())});
localStorage.setItem(COMMERCE_KEY,JSON.stringify(createSeedCommerce()));
const baseline=localStorage.getItem(COMMERCE_KEY);
const syntheticIdentity={workspaceId:'11111111-1111-4111-8111-111111111111',userId:'22222222-2222-4222-8222-222222222222'};
window.__qaManaged={state:createSeedCommerce(),version:1,writes:0,reads:0};

const nativeIDB=window.indexedDB;const prefix='supermega-qa-'+crypto.randomUUID()+'-';const names=new Set();const connections=new Set();
Object.defineProperty(window,'indexedDB',{value:{open(name,version){const isolated=prefix+name;names.add(isolated);const request=version===undefined?nativeIDB.open(isolated):nativeIDB.open(isolated,version);request.addEventListener('success',()=>connections.add(request.result));return request},deleteDatabase(name){return nativeIDB.deleteDatabase(prefix+name)},cmp:nativeIDB.cmp.bind(nativeIDB)}});
Object.defineProperty(navigator,'storage',{value:{persist:async()=>false,persisted:async()=>false,estimate:async()=>({usage:0,quota:100000000})}});
window.fetch=async()=>{throw Error('Fixture network denied')};
const root=createRoot(document.getElementById('root'));
async function cleanup(){root.unmount();for(const db of connections)db.close();await Promise.all([...names].map(name=>new Promise((resolve,reject)=>{const r=nativeIDB.deleteDatabase(name);r.onsuccess=resolve;r.onerror=reject;r.onblocked=()=>reject(Error('Synthetic cleanup blocked'))})));document.body.textContent='Synthetic databases removed';}
function inspect(){const state=${managed ? 'window.__qaManaged.state' : 'JSON.parse(localStorage.getItem(COMMERCE_KEY))'};document.getElementById('evidence').textContent=JSON.stringify({managedWrites:window.__qaManaged.writes,managedReads:window.__qaManaged.reads,orders:state.orders.map(o=>({id:o.id,customer:o.customer})),rejectedWrites,ledgerWrites,unchanged:localStorage.getItem(COMMERCE_KEY)===baseline,completed:state.orders.filter(o=>o.status==='completed').map(o=>({id:o.id,paymentStatus:o.paymentStatus})),stock:state.items[0].onHand});}
document.addEventListener('keydown',event=>{if(event.key==='F8'){event.preventDefault();fail=false;inspect()}if(event.key==='F9'){event.preventDefault();inspect()}});
function Shop(){const [tab,setTab]=useState('counter');return <><button onClick={()=>setTab('counter')}>Show Counter</button><button onClick={()=>setTab('orders')}>Show Orders</button><CommercePage confirmedLocalShop={${!managed}} managedIdentity={${managed ? 'syntheticIdentity' : 'null'}} tab={tab} shopCounterClientId="" shopCounterCustomer="" shopCounterSearch="" requestedRequestId={null} requestedShopTemplate={null} requestedSource={null} ecommerceCancellationNavigationIntent={null} ecommerceCorrectionNavigationIntent={null} ecommerceNavigationDraft={null} ecommerceOrderAmendmentNavigationIntent={null} ecommerceOrderRescheduleNavigationIntent={null} ecommerceReturnNavigationIntent={null} ecommerceSupportNavigationIntent={null}/></>}
let mountId=0;function renderFixture(){root.render(<><p>Isolated real Shop page. Synthetic records only; network blocked. F8 enables synthetic writes; F9 inspects records, including while a dialog is open.</p><button onClick={()=>{fail=true;document.getElementById('evidence').textContent='Synthetic Commerce writes blocked'}}>Block synthetic writes</button><button onClick={()=>{fail=false;document.getElementById('evidence').textContent='Synthetic Commerce writes enabled'}}>Enable synthetic writes</button><button onClick={()=>{window.__qaFailAck=true}}>Fail next acknowledgement</button><button onClick={renderFixture}>Reopen synthetic Shop</button><button onClick={inspect}>Inspect synthetic records</button><button onClick={()=>void cleanup()}>Clean synthetic databases</button><output id="evidence"/><MemoryRouter key={++mountId} initialEntries={['/shop/?tab=counter']}><Shop/></MemoryRouter></>);}
renderFixture();
`},plugins:[{name:'fixture-only-commerce-export',setup(b){
if(managed)b.onLoad({filter:/managed-trial\.ts$/},a=>({loader:'ts',contents:readFileSync(a.path,'utf8')
.replace('export async function loadManagedBootstrap(', 'async function originalLoadManagedBootstrap(')
.replace('export async function saveManagedCommerceCommand(', 'async function originalSaveManagedCommerceCommand(')+`
export async function loadManagedBootstrap(expectedIdentity) {
 const qa=(window as any).__qaManaged;qa.reads++;
 return {identity:{workspace_id:expectedIdentity.workspaceId,actor_id:expectedIdentity.userId,actor_kind:'human'},readiness:{capabilities:['commerce.write'],productEntitlements:['commerce']},states:{commerce:{surface:'commerce',version:qa.version,state:qa.state}},approvals:[]};
}
export async function saveManagedCommerceCommand(request) {
 const qa=(window as any).__qaManaged;
 if(request.expectedVersion!==qa.version)throw new Error('Synthetic revision conflict');
 qa.state=request.state;qa.version++;qa.writes++;
 if((window as any).__qaFailAck){(window as any).__qaFailAck=false;throw new Error('Synthetic response lost after commit')}
 return {command_id:request.commandId,event_type:request.eventType,surface:'commerce',version:qa.version,state:qa.state,idempotent_replay:false};
}
`}));
b.onLoad({filter:/commerce-sync-outbox\.ts$/},a=>({loader:'ts',contents:readFileSync(a.path,'utf8').replace("return settleIntent(commandId, 'local_applied', recovered)","if ((window as any).__qaFailAck) { (window as any).__qaFailAck=false; return Promise.reject(new Error('Synthetic acknowledgement failure')) }; return settleIntent(commandId, 'local_applied', recovered)")}));b.onLoad({filter:/CoreApp\.tsx$/},a=>({loader:'tsx',contents:readFileSync(a.path,'utf8').replace('function CommercePage({','export function CommercePage({')}))}}],jsx:'automatic',bundle:true,format:'esm',define:{'import.meta.env':'{}'},outfile:resolve(out,'fixture.js')})
writeFileSync(resolve(out,'index.html'),'<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="connect-src \'none\'; form-action \'none\'"><title>Isolated Shop acceptance</title><link rel="stylesheet" href="fixture.css"><div id="root"></div><script type="module" src="fixture.js"></script>')
console.log('Built '+out+'. Synthetic provider only; use Clean synthetic databases before leaving.')
