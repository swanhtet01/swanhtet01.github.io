import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { mkdirSync, writeFileSync } from 'node:fs'
const require = createRequire(resolve('showroom/package.json'))
const { build } = require('esbuild')
// Reuse the explicitly release-blocked fixture directory.
const failWrites = process.argv.includes('--fail-writes')
const out = resolve('showroom/dist/__qa-spa')
mkdirSync(out, { recursive: true })
await build({ stdin: { resolveDir: resolve('showroom'), loader: 'tsx', contents: `
import React, {useState,useCallback} from 'react'; import {createRoot} from 'react-dom/client';
import {EcommerceBuyingWorkspace} from './src/products/ecommerce/EcommerceBuyingWorkspace';
import {createSeedCommerce} from './src/core/commerce-workspace';
import {buildStorefrontPreview,storefrontPreviewDigest} from './src/products/ecommerce/storefront-model';
import './src/core/core-app.css'; import './src/products/ecommerce/ecommerce-product.css';
const memory=()=>{const m=new Map();return {getItem:k=>m.get(k)??null,setItem:(k,v)=>{if(${failWrites}) throw new Error('Synthetic storage rejection');m.set(k,String(v))},removeItem:k=>m.delete(k),clear:()=>m.clear(),key:i=>[...m.keys()][i]??null,get length(){return m.size}}};
Object.defineProperty(window,'localStorage',{value:memory()});
Object.defineProperty(window,'sessionStorage',{value:memory()});
const NativeDate=Date;let clockOffset=0;window.Date=class extends NativeDate{constructor(...args){if(args.length)super(...args);else super(NativeDate.now()+clockOffset)}static now(){return NativeDate.now()+clockOffset}};
const commerce=createSeedCommerce();
const preview=buildStorefrontPreview(commerce.items,{storeName:'Synthetic checkout',summary:'Memory-only sample',selectedSkus:[commerce.items[0].sku]});
const digest=await storefrontPreviewDigest(preview);
const noop=()=>{}; let rememberedCart=[{sku:commerce.items[0].sku,quantity:1}]; const recoverCart=()=>rememberedCart;
function Fixture(){const [cart,setCart]=useState(rememberedCart);const [mount,setMount]=useState(0);const changeCart=useCallback(next=>{rememberedCart=next;setCart(next)},[]);return <><p role="status">Synthetic checkout · memory only · reload resets · no managed connection</p><button onClick={()=>setMount(v=>v+1)}>Remount checkout</button><button onClick={()=>{clockOffset+=3600000;setMount(v=>v+1)}}>Advance one hour and remount</button><EcommerceBuyingWorkspace key={mount} cart={cart} commerceState={commerce} currentCatalog={commerce.items} disabled={false} onCartChange={changeCart} recoverSessionCart={recoverCart} onContinueInShop={noop} onDraft={noop} onOpenCancellation={noop} onOpenCorrection={noop} onOpenAmendment={noop} onOpenReschedule={noop} onOpenReturns={noop} onOpenSupport={noop} onRequestStateChange={noop} preview={preview} scope="synthetic-checkout" sourcePreviewDigest={digest} sourceStorefront={null}/></>}
createRoot(document.getElementById('root')!).render(<Fixture/>);
` }, jsx:'automatic', bundle:true, format:'esm', target:'es2022', outfile:resolve(out,'fixture.js'), plugins:[{name:'no-telemetry',setup(b){b.onResolve({filter:/\/(behavior-trail|metrics-collector)$/},()=>({path:'telemetry',namespace:'qa'}));b.onLoad({filter:/.*/,namespace:'qa'},()=>({contents:'export const recordBehaviorSignal=()=>{}; export const emitMetric=()=>{};',loader:'js'}))}}] })
writeFileSync(resolve(out,'index.html'),`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="connect-src 'none'; form-action 'none'"><title>Synthetic checkout QA</title><link rel="stylesheet" href="fixture.css"><div id="root"></div><script type="module" src="fixture.js"></script>`)
console.log('Memory-only checkout fixture at /__qa-spa/; release verifier blocks these assets.')
