import { build } from '../showroom/node_modules/esbuild/lib/main.js'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
const output = process.argv[2]
if (!output) throw Error('Explicit local fixture output required')
const root = resolve(import.meta.dirname, '..')
const result = await build({ stdin: { resolveDir: resolve(root, 'showroom'), loader: 'tsx', contents: `
import React from 'react'; import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router';
import Review from './src/products/ecommerce/EcommerceCustomerReview';
createRoot(document.getElementById('root')!).render(<MemoryRouter initialEntries={['/ecommerce/review/11111111-1111-4111-8111-111111111111']}><Routes><Route path="ecommerce/review/:reviewId" element={<Review/>}/></Routes></MemoryRouter>);
` }, bundle:true, write:false, format:'iife', jsx:'automatic', minify:true,
 define:{'process.env.NODE_ENV':'"production"'}, plugins:[{ name:'synthetic-review-only', setup(b) {
 b.onResolve({filter:/core\/managed-trial$/},()=>({path:'fixture-auth',namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},()=>({loader:'ts',resolveDir:resolve(root,'showroom'),contents:`
import { storefrontPreviewDigest, STOREFRONT_PREVIEW_SCHEMA } from './src/products/ecommerce/storefront-model';
import { COMMERCE_WORKSPACE_SCHEMA } from './src/core/commerce-workspace';
const identity={userId:'synthetic-customer',workspaceId:'synthetic-workspace'};
const mode=new URLSearchParams(location.search).get('mode');
export const currentManagedIdentity=async()=>mode==='signed-out'?null:identity;
export const sameManagedIdentity=(a,b)=>a.userId===b.userId&&a.workspaceId===b.workspaceId;
export async function loadManagedEcommerceReview(id){
 if(mode==='denied') throw Error('Synthetic denial');
 const preview={schema:STOREFRONT_PREVIEW_SCHEMA,mode:'browser-local-preview',sourceCatalogSchema:COMMERCE_WORKSPACE_SCHEMA,storeName:'ဆိုင် · Sample shop',summary:'A prepared catalog for your review.',currency:'MMK',items:[{sku:'A',name:'Tea',variant:'Large',unitPriceMmk:12500,availability:'available'},{sku:'B',name:'Coffee',variant:null,unitPriceMmk:500,availability:'sold_out'}]};
 return {reviewId:id,contentRevision:1,preview,previewDigest:await storefrontPreviewDigest(preview),expiresAt:new Date(Date.now()+3600000).toISOString(),status:'prepared_preview',publicationAuthorized:false,deploymentAuthorized:false};}
` }));
 b.onLoad({filter:/\.css$/},()=>({contents:'',loader:'js'}));
 }}] });
const css=await readFile(resolve(root,'showroom/src/products/ecommerce/prepared-catalog.css'),'utf8');
await writeFile(output,`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'none'"><title>Synthetic catalog review QA</title><style>:root{--core-ink:#172b24;--core-muted:#56665d;--core-line:#dce5df;--core-panel:#fff}body{margin:0;font-family:system-ui;background:#f5f7f5}aside{padding:8px;font-size:12px;background:#eee}#root{width:320px;max-width:100%;margin:auto}${css}</style><aside>Synthetic local fixture · no account or network access</aside><div id="root"></div><script>${result.outputFiles[0].text.replaceAll('</script','<\\/script')}</script>`,'utf8');
console.log(JSON.stringify({ok:true,classification:'synthetic_browser_fixture',output}));
