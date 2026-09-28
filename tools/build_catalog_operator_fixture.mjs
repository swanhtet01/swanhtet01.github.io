import {createRequire} from 'node:module'
import {resolve} from 'node:path'
import {mkdirSync,writeFileSync} from 'node:fs'
const require=createRequire(resolve('showroom/package.json'))
const result=await require('esbuild').build({stdin:{resolveDir:resolve('showroom'),loader:'tsx',contents:`
import React from 'react';import {createRoot} from 'react-dom/client';
import {CatalogReviewPreparation} from './src/products/ecommerce/CatalogReviewPreparation';
import './src/core/core-app.css';import './src/products/ecommerce/ecommerce-product.css';
createRoot(document.getElementById('root')).render(<><aside>Synthetic operator review · local data only · no publishing</aside><main style={{padding:24,maxWidth:720,margin:'auto'}}><h1>Catalog review</h1><CatalogReviewPreparation workspaceId="synthetic-company" actorId="synthetic-operator"/></main></>);
`},plugins:[{name:'synthetic-operator-transport',setup(build){build.onResolve({filter:/core\/managed-trial$/},()=>({path:'transport',namespace:'synthetic'}));build.onLoad({filter:/.*/,namespace:'synthetic'},()=>({loader:'ts',contents:`
const identity={userId:'synthetic-operator',workspaceId:'synthetic-company',email:''};
const reviewId='11111111-1111-4111-8111-111111111111';
const now=Date.now(),readAt=new Date(now-1000).toISOString(),expiresAt=new Date(now+86400000).toISOString();
const command={reviewId,recipientGrantId:reviewId,expectedVersion:1,contentRevision:1,previewDigest:'sha256:'+'a'.repeat(64),readAt,expiresAt};
const receipt={reviewId,sourceVersion:1,contentRevision:1,previewDigest:command.previewDigest,preparedAt:readAt,expiresAt,status:'prepared_preview',persisted:true,replayed:false,publicationAuthorized:false,deploymentAuthorized:false};
const key='supermega.ecommerce.pending-review.v1:'+JSON.stringify([identity.workspaceId,identity.userId]);
const recovery=new URLSearchParams(location.search).has('recovery');
if(recovery){sessionStorage.removeItem(key);sessionStorage.removeItem(key+':receipt')}
else sessionStorage.setItem(key+':receipt',JSON.stringify({command,receipt}));
export const currentManagedIdentity=async()=>identity;
export const sameManagedIdentity=(a,b)=>a.userId===b.userId&&a.workspaceId===b.workspaceId;
export const loadManagedEcommerceReviews=async()=>({reviews:[{reviewId,sourceVersion:1,contentRevision:1,previewDigest:command.previewDigest,preparedAt:readAt,expiresAt,status:'active'}],nextAfter:null,readAt:new Date().toISOString(),publicationAuthorized:false,deploymentAuthorized:false});
export const loadManagedEcommerceOperatorDecisions=async(id,who,after)=>{
 if(id!==reviewId||!sameManagedIdentity(who,identity))throw Error('fixture identity mismatch');
 const accepted=new URLSearchParams(location.search).get('scenario')==='acceptance';
 const commandId=n=>'22222222-2222-4222-8222-'+String(n).padStart(12,'0');
 const decisions=accepted?[{commandId:commandId(1),kind:'acceptance',note:null,createdAt:readAt}]:Array.from({length:after?1:50},(_,i)=>({commandId:commandId(after?51:i+1),kind:'feedback',note:after?'နောက်ဆုံး ပြင်ဆင်ချက် · Final change':'စျေးနှုန်း ပြင်ပါ · Change '+(i+1),createdAt:readAt}));
 return {reviewId,sourceVersion:1,contentRevision:1,previewDigest:command.previewDigest,status:accepted?'active':'stale',readAt:new Date().toISOString(),decisions,nextAfter:accepted||after?null:commandId(50),publicationAuthorized:false,deploymentAuthorized:false};
};
const unavailable=async()=>{throw Error('Read-only synthetic fixture')};
export const loadManagedEcommercePreparation=unavailable,loadManagedEcommerceRecipients=unavailable,prepareManagedEcommerceReview=unavailable,withdrawManagedEcommerceReview=unavailable,reconcileManagedEcommerceReview=unavailable,resolveExpiredManagedEcommerceReview=unavailable;
`}))}}],bundle:true,write:false,outdir:'in-memory',format:'esm',jsx:'automatic',define:{'import.meta.env':'{}'}})
const css=result.outputFiles.find(f=>f.path.endsWith('.css')).text
const js=result.outputFiles.find(f=>f.path.endsWith('.js')).text
const out=resolve('showroom/dist/__qa-catalog-operator');mkdirSync(out,{recursive:true})
writeFileSync(resolve(out,'index.html'),`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="connect-src 'none'; img-src 'none'; form-action 'none'"><title>Synthetic catalog operator review</title><style>${css}</style><style>body{margin:0;overflow:auto}aside{padding:12px;font:14px system-ui;background:#eee;color:#222}</style><div id="root"></div><script type="module">${js.replaceAll('</script','<\\/script')}</script>`)
console.log('Built synthetic /__qa-catalog-operator/; actual component, no network or publishing.')
