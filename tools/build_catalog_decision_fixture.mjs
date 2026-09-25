import {createRequire} from 'node:module'
import {resolve} from 'node:path'
import {mkdirSync,writeFileSync} from 'node:fs'
const require=createRequire(resolve('showroom/package.json'))
const result=await require('esbuild').build({stdin:{resolveDir:resolve('showroom'),loader:'tsx',contents:`
import React from 'react';import {createRoot} from 'react-dom/client';
import {MemoryRouter,Routes,Route} from 'react-router';
import Review from './src/products/ecommerce/EcommerceCustomerReview';
import './src/core/core-app.css';
createRoot(document.getElementById('root')).render(<><aside>Synthetic local review · no customer data or publishing</aside><MemoryRouter initialEntries={['/review/11111111-1111-4111-8111-111111111111']}><Routes><Route path="/review/:reviewId" element={<Review/>}/></Routes></MemoryRouter></>);
`},plugins:[{name:'synthetic-review-transport',setup(build){build.onResolve({filter:/core\/managed-trial$/},()=>({path:'transport',namespace:'synthetic'}));build.onLoad({filter:/.*/,namespace:'synthetic'},()=>({loader:'ts',resolveDir:resolve('showroom/src/products/ecommerce'),contents:`
import {storefrontPreviewDigest,STOREFRONT_PREVIEW_SCHEMA} from './storefront-model.ts';
import {COMMERCE_WORKSPACE_SCHEMA} from '../../core/commerce-workspace.ts';
const identity={userId:'synthetic-reviewer',workspaceId:'synthetic-company',email:''};
const preview={schema:STOREFRONT_PREVIEW_SCHEMA,mode:'browser-local-preview',sourceCatalogSchema:COMMERCE_WORKSPACE_SCHEMA,storeName:'ဆိုင် · Tea shop',summary:'Catalog prepared for your review.',currency:'MMK',items:[{sku:'A',name:'မြန်မာလက်ဖက်ရည်',variant:'500 g',unitPriceMmk:12500,availability:'available'},{sku:'B',name:'Green tea',variant:null,unitPriceMmk:500,availability:'sold_out'}]};
const reviewId='11111111-1111-4111-8111-111111111111',expiresAt='2099-01-01T00:00:00Z';
const storeKey='synthetic-catalog-decisions';
export const currentManagedIdentity=async()=>identity;
export const sameManagedIdentity=(a,b)=>a.userId===b.userId&&a.workspaceId===b.workspaceId;
export const loadManagedEcommerceReview=async()=>({reviewId,contentRevision:1,previewDigest:await storefrontPreviewDigest(preview),preview,expiresAt,status:'prepared_preview',publicationAuthorized:false,deploymentAuthorized:false});
export const loadManagedEcommerceDecisions=async()=>({reviewId,sourceVersion:1,contentRevision:1,previewDigest:await storefrontPreviewDigest(preview),decisions:JSON.parse(sessionStorage.getItem(storeKey)||'[]'),nextAfter:null,publicationAuthorized:false,deploymentAuthorized:false});
export const sendManagedEcommerceDecision=async p=>{sessionStorage.setItem(storeKey,JSON.stringify([{commandId:p.commandId,kind:p.decision?'acceptance':'feedback',note:p.note??null,createdAt:new Date().toISOString()}]));return {persisted:true}};
`}))}}],bundle:true,write:false,outdir:'in-memory',format:'esm',jsx:'automatic',define:{'import.meta.env':'{}'}})
const css=result.outputFiles.find(f=>f.path.endsWith('.css')).text
const js=result.outputFiles.find(f=>f.path.endsWith('.js')).text
const out=resolve('showroom/dist/__qa-catalog-decisions');mkdirSync(out,{recursive:true})
writeFileSync(resolve(out,'index.html'),`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="connect-src 'none'; img-src 'none'; form-action 'none'"><title>Synthetic catalog decision review</title><style>${css}</style><style>body{margin:0}aside{padding:12px;font:14px system-ui;background:#eee;color:#222}</style><div id="root"></div><script type="module">${js.replaceAll('</script','<\\/script')}</script>`)
console.log('Built synthetic /__qa-catalog-decisions/; real component with local-only transport.')
