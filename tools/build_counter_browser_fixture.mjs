import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
const { build } = createRequire(resolve('showroom/package.json'))('esbuild')
const out = resolve('showroom/dist/__qa-counter')
mkdirSync(out, { recursive: true })
await build({ stdin: { resolveDir: resolve('showroom'), loader: 'tsx', contents: `
import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
import {ShopCounter} from './src/core/CoreApp';
const memory=()=>{const m=new Map();return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k),key:i=>[...m.keys()][i]??null,get length(){return m.size}}};
Object.defineProperty(window,'localStorage',{value:memory()});Object.defineProperty(window,'sessionStorage',{value:memory()});
function Fixture(){const [review,setReview]=useState(null);const [result,setResult]=useState('');return <>
<p>Synthetic Counter. Callback check only; no sale is recorded.</p>
<ShopCounter businessTemplate={null} industryPack={null} canCompleteInOneReview={false} disabled={false} initialCustomer="" initialQuery="" items={[{sku:'QA-TEA',name:'Synthetic tea',price:5000,onHand:10,reorderAt:2}]} localDemoStatus={null} lowStockCount={0} loyaltyPoints={null} onReview={value=>{setReview(value);setResult('')}} openOrderCount={0} paymentQrScope="synthetic" persistLocalDraft={false} productImageScope="synthetic" recordedOrderIds={[]} sampleCatalogActive={false}/>
{review ? <section aria-label="Synthetic review"><pre>{JSON.stringify({lines:review.lines,payment:review.payment,outcome:review.outcome})}</pre><button onClick={async()=>{setResult(await review.beforeCommit('ORD-SYNTHETIC')?'Review still current':'Review changed; rejected')}}>Check reviewed basket</button><button onClick={()=>{review.onCommitted('ORD-SYNTHETIC');setResult('Synthetic callback completed')}}>Simulate acknowledged callback</button></section>:null}<p role="status">{result}</p></>}
createRoot(document.getElementById('root')).render(<Fixture/>);
` }, plugins: [{ name: 'fixture-only-counter-export', setup(b) {
  b.onLoad({ filter: /CoreApp\.tsx$/ }, args => ({ loader: 'tsx', contents: readFileSync(args.path,'utf8').replace('function ShopCounter({','export function ShopCounter({') }))
} }], jsx:'automatic', bundle:true, format:'esm', define:{'import.meta.env':'{}'}, outfile:resolve(out,'fixture.js') })
writeFileSync(resolve(out,'index.html'), '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="connect-src \'none\'; form-action \'none\'"><title>Synthetic Counter</title><link rel="stylesheet" href="fixture.css"><div id="root"></div><script type="module" src="fixture.js"></script>')
console.log('Actual Counter fixture: /__qa-counter/. Remove three generated assets after review.')
