import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
const { build } = createRequire(resolve('showroom/package.json'))('esbuild')
const makeOrderSource = "function makeOrder(commerce,review,id){ const at=new Date().toISOString();const lines=review.lines.map(l=>{const i=commerce.items.find(i=>i.sku===l.sku);return {sku:i.sku,name:i.name,...(i.variant?{variant:i.variant}:{}),quantity:l.quantity,unitPriceMmk:i.price}});\n const order={id,createdAt:at,customer:review.customer||'Synthetic guest',owner:'Synthetic operator',channel:'Counter',item:commerceOrderItemSummary(lines),itemSku:lines.length===1?lines[0].sku:undefined,quantity:lines.reduce((n,l)=>n+l.quantity,0),payment:review.payment,paymentStatus:'pending',refundStatus:'none',fulfilment:'pickup',fulfilmentReference:'Synthetic counter',promisedAt:new Date(Date.parse(at)+1800000).toISOString(),total:lines.reduce((n,l)=>n+l.quantity*l.unitPriceMmk,0),status:'confirmed',lines};\n const proof={actionId:'ACT-SYNTHETIC',capturedAt:at,actor:'Synthetic operator',reason:'Isolated browser acceptance',evidenceReference:'SYNTHETIC'};\n return {order,proof};\n}"
const preflight = await build({stdin:{resolveDir:resolve('showroom'),loader:'ts',contents:`
import {createSeedCommerce,reserveCommerceOrder,mutateCommerceWorkspace,commerceOrderItemSummary} from './src/core/commerce-workspace';
${makeOrderSource}
export {createSeedCommerce,reserveCommerceOrder,mutateCommerceWorkspace,makeOrder};
`},bundle:true,platform:'node',format:'esm',write:false,logLevel:'error'})
const model=await import('data:text/javascript;base64,'+Buffer.from(preflight.outputFiles[0].contents).toString('base64'))
const baseline=model.createSeedCommerce();const product=baseline.items.find(i=>i.onHand>3)
const {order,proof}=model.makeOrder(baseline,{lines:[{sku:product.sku,quantity:1}],payment:'Cash',customer:''},'ORD-SYNTHETIC')
assert.ok(model.reserveCommerceOrder(baseline,order,proof),'fixture order must pass the actual reducer')
let bytes=JSON.stringify(baseline);const original=bytes;let blocked=true;let attempts=0
const storage={getItem:()=>bytes,setItem:(_key,value)=>{attempts++;if(blocked)throw Error('Synthetic quota');bytes=value}}
const locks={request:async(_name,_options,callback)=>callback()}
const transition=state=>model.reserveCommerceOrder(state,order,proof)
assert.equal((await model.mutateCommerceWorkspace(transition,storage,locks)).ok,false)
assert.equal(attempts,1,'failure must reach storage');assert.equal(bytes,original)
blocked=false
assert.equal((await model.mutateCommerceWorkspace(transition,storage,locks)).ok,true)
assert.equal(JSON.parse(bytes).orders.filter(o=>o.id===order.id).length,1)
console.log('Fixture preflight PASS: valid order, rejected write preserves bytes, retry retains one order')
const out = resolve('showroom/dist/__qa-counter')
mkdirSync(out, { recursive: true })
await build({ stdin: { resolveDir: resolve('showroom'), loader: 'tsx', contents: `
import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {MemoryRouter} from 'react-router';
import {ShopCounter} from './src/core/CoreApp';
import {createSeedCommerce,reserveCommerceOrder,mutateCommerceWorkspace,commerceOrderItemSummary} from './src/core/commerce-workspace';
const memory=()=>{const m=new Map();return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k),key:i=>[...m.keys()][i]??null,get length(){return m.size}}};
Object.defineProperty(window,'localStorage',{value:memory()});Object.defineProperty(window,'sessionStorage',{value:memory()});
const seed=createSeedCommerce();const key='supermega.commerce.workspace.v2';localStorage.setItem(key,JSON.stringify(seed));let failWrites=true;
const store={getItem:k=>localStorage.getItem(k),setItem:(k,v)=>{if(failWrites)throw Error('Synthetic quota');localStorage.setItem(k,v)},removeItem:k=>localStorage.removeItem(k)};
${makeOrderSource}
function Fixture(){const [review,setReview]=useState(null);const [result,setResult]=useState('');const [commerce,setCommerce]=useState(seed);
async function persist(){
 const id='ORD-SYNTHETIC'; if(!await review.beforeCommit(id)){setResult('Review changed; rejected');return}
 const {order,proof}=makeOrder(commerce,review,id);
 const saved=await mutateCommerceWorkspace(state=>reserveCommerceOrder(state,order,proof),store,navigator.locks);
 if(!saved.ok){setResult('Write rejected; basket retained: '+saved.error);return}
 const retained=JSON.parse(localStorage.getItem(key));if(!retained.orders.some(o=>o.id===id)){setResult('Readback failed');return}
 setCommerce(saved.state);review.onCommitted(id);setReview(null);setResult('Order retained; count '+retained.orders.filter(o=>o.id===id).length);
}
return <>
<p>Synthetic Counter. Orders are saved in memory only; no payment or hosted write.</p>
<ShopCounter businessTemplate={null} industryPack={null} canCompleteInOneReview={false} disabled={false} initialCustomer="" initialQuery="" items={commerce.items.filter(i=>i.onHand>3).slice(0,1)} localDemoStatus={null} lowStockCount={0} loyaltyPoints={null} onReview={value=>{setReview(value);setResult('')}} openOrderCount={0} paymentQrScope="synthetic" persistLocalDraft={false} productImageScope="synthetic" recordedOrderIds={[]} sampleCatalogActive={false}/>
{review ? <section aria-label="Synthetic review"><pre>{JSON.stringify({lines:review.lines,payment:review.payment,outcome:review.outcome})}</pre><button onClick={async()=>{setResult(await review.beforeCommit('ORD-SYNTHETIC')?'Review still current':'Review changed; rejected')}}>Check reviewed basket</button><button onClick={persist}>Save synthetic order</button><button onClick={()=>{failWrites=false;setResult('Synthetic writes enabled')}}>Enable synthetic writes</button></section>:null}<p role="status">{result}</p></>}
createRoot(document.getElementById('root')).render(<MemoryRouter><Fixture/></MemoryRouter>);
` }, plugins: [{ name: 'fixture-only-counter-export', setup(b) {
  b.onLoad({ filter: /CoreApp\.tsx$/ }, args => ({ loader: 'tsx', contents: readFileSync(args.path,'utf8').replace('function ShopCounter({','export function ShopCounter({') }))
} }], jsx:'automatic', bundle:true, format:'esm', define:{'import.meta.env':'{}'}, outfile:resolve(out,'fixture.js') })
writeFileSync(resolve(out,'index.html'), '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="connect-src \'none\'; form-action \'none\'"><title>Synthetic Counter</title><link rel="stylesheet" href="fixture.css"><div id="root"></div><script type="module" src="fixture.js"></script>')
console.log('Actual Counter fixture: /__qa-counter/. Remove three generated assets after review.')
