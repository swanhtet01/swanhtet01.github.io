// Real product components with synthetic records and memory-only storage. Never publish this fixture.
import { createRequire } from 'node:module'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const fromProject = (path) => resolve(projectRoot, path)
const { build } = createRequire(fromProject('showroom/package.json'))('esbuild')
const out = fromProject('.tmp/qa-workspaces')
const galleryMode = process.argv.includes('--gallery')
// The existing QA photos are synthetic sample media, never customer products.
const galleryPhotoFiles = ['sites-studio-sample.jpg', 'sites-studio-materials.jpg', 'sites-studio-entrance.jpg']
const galleryPhotoBytes = galleryMode ? Object.fromEntries(galleryPhotoFiles.map(file =>
  [file, readFileSync(fromProject(`tools/qa-assets/${file}`)).toString('base64')])) : {}
mkdirSync(out, {recursive:true})
await build({stdin:{resolveDir:fromProject('showroom'),loader:'tsx',contents:`
import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
import {MemoryRouter,Routes,Route,Link,useLocation} from 'react-router';
import {WebsiteProduct} from './src/products/website/WebsiteProduct';
import {EcommerceProduct} from './src/products/ecommerce/EcommerceProduct';
import {putProductImage,productImageScopeForWorkspace} from './src/core/product-image-store';
import {createInitialWorkspace,WEBSITE_STORAGE_KEY} from './src/products/website/website-model';
import {applyWebsiteStarterBrief} from './src/products/website/website-starter';
import {captureWebsiteLead,emptyWebsiteLeadLedger,WEBSITE_LEAD_LEDGER_KEY} from './src/products/website/website-leads';
import {createEmptyCommerce,createSeedCommerce,validateCommerceState,configureCommercePaymentPolicy,COMMERCE_KEY} from './src/core/commerce-workspace';
import './src/core/core-app.css';
const values=new Map();const memory=map=>({getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,String(v)),removeItem:k=>map.delete(k),key:i=>[...map.keys()][i]??null,get length(){return map.size}});
Object.defineProperty(window,'localStorage',{value:memory(values)});Object.defineProperty(window,'sessionStorage',{value:memory(new Map())});
window.fetch=async()=>{throw Error('Synthetic fixture network denied')};
const galleryMode=${JSON.stringify(galleryMode)};
const samplePhotoBytes=${JSON.stringify(galleryPhotoBytes)};
const names=galleryMode?['Paper swatch kit','Blank notebook set','Studio print consultation']
  :['Everyday Tee','Canvas Bag','Desk Notebook','Water Bottle','Daily Planner','Ceramic Mug'];
const commerceBase=validateCommerceState({...createEmptyCommerce(),items:createSeedCommerce().items.slice(0,names.length).map((item,i)=>({...item,sku:'QA-'+i,name:names[i],price:(i+1)*8500}))});
const commerce=galleryMode?configureCommercePaymentPolicy(commerceBase,{
  adapter:'pay_on_pickup',allowedFulfilments:['pickup'],maximumOrderMmk:1000000,
  instructions:'Collect at pickup and reconcile in the synthetic Shop fixture.',status:'active',
  effectiveFrom:'2026-10-09T00:00:00.000Z',effectiveUntil:null
},{actionId:'ACT-GALLERY-QA-PAYMENT-001',capturedAt:'2026-10-09T00:00:00.000Z',
  actor:'Synthetic operator',reason:'Local real-component gallery capture only.',evidenceReference:'GALLERY-QA-001'})
  :commerceBase;
if(!commerce)throw Error('Synthetic gallery payment policy invalid');
localStorage.setItem(COMMERCE_KEY,JSON.stringify(commerce));
const site=applyWebsiteStarterBrief(createInitialWorkspace(),{templateId:'lead-generation',businessName:'Example Studio',offer:'Design and printing for local businesses',audience:'',proof:'',contactHref:''},'2026-10-09T00:00:00.000Z');
if(galleryMode){
  const home=site.pages.find(page=>page.id===site.selectedPageId);
  if(!home||home.sections.length<2)throw Error('Synthetic Sites home page invalid');
  const image=(file,alt)=>({src:'https://gallery-fixture.example/media/'+file,alt,decorative:false});
  home.hero.image=image('sites-studio-sample.jpg','Paper and swatches on a sample studio worktable');
  home.sections[0].image=image('sites-studio-materials.jpg','Blank notebooks and paper on a sample studio shelf');
  home.sections[1].image=image('sites-studio-entrance.jpg','Sample studio entrance with plants');
  const photoFiles=['sites-studio-sample.jpg','sites-studio-materials.jpg','sites-studio-entrance.jpg'];
  for(let i=0;i<photoFiles.length;i++){
    const bytes=Uint8Array.from(atob(samplePhotoBytes[photoFiles[i]]),letter=>letter.charCodeAt(0));
    await putProductImage(productImageScopeForWorkspace(null),commerce.items[i].sku,new Blob([bytes],{type:'image/jpeg'}));
  }
}
localStorage.setItem(WEBSITE_STORAGE_KEY,JSON.stringify(site));
let ledger=emptyWebsiteLeadLedger();
for(let i=0;i<12;i++)ledger=captureWebsiteLead(ledger,{siteName:site.siteName,sourcePage:'/',name:i===11?'မေသီ':i===10?'Ko Min':'Example customer '+(i+1),contact:'example'+i+'@example.test',request:i===11?'ဆိုင်အတွက် ဆိုင်းဘုတ် ဒီဇိုင်းအကြောင်း မေးမြန်းချင်ပါတယ်။':i===10?'We need a new menu for our café. Could you share the options for design and printing?':'Please share the options for our business.',consentRecorded:true},{id:'qa-inquiry-'+i,now:new Date(Date.UTC(2026,9,9,9,i)).toISOString()});
localStorage.setItem(WEBSITE_LEAD_LEDGER_KEY,JSON.stringify(ledger));
function RouteMarker(){const route=useLocation();window.__qaGalleryRoute=route.pathname+route.search;return null}
function App(){const [version,setVersion]=useState(0);return <>
<aside className="qa-notice">LOCAL SYNTHETIC QA · actual Sites and Commerce components · in-memory records and sample photos · no sign-in, provider calls, publishing or customer acceptance</aside>
<MemoryRouter key={version} initialEntries={['/website/?view=inquiries']}><RouteMarker/><div className="qa-shell"><nav className="qa-nav"><strong>SUPERMEGA</strong><Link to="/website/?view=content">Pages</Link><Link to="/website/?view=inquiries">Inquiries</Link><Link to="/ecommerce/?view=setup">Store editor</Link><Link to="/ecommerce/?view=preview">Customer view</Link><button onClick={()=>setVersion(n=>n+1)}>Reopen saved QA data</button></nav><main className="qa-content"><Routes><Route path="/website/" element={<WebsiteProduct/>}/><Route path="/ecommerce/" element={<EcommerceProduct/>}/></Routes></main></div></MemoryRouter></>}
createRoot(document.getElementById('root')).render(<App/>);
`},bundle:true,jsx:'automatic',format:'esm',external:['/fonts/noto-sans-myanmar.woff2'],define:{'import.meta.env':'{}','process.env.NODE_ENV':'"development"'},outfile:resolve(out,'fixture.js')});
writeFileSync(resolve(out,'qa.css'),`body{margin:0;font:15px/1.5 system-ui;overflow:auto}.qa-notice{background:#fff4d7;color:#503f14;font:12px/1.5 system-ui;padding:8px 20px}.qa-shell{display:grid;grid-template-columns:200px minmax(0,1fr);min-height:calc(100dvh - 34px)}.qa-nav{display:flex;flex-direction:column;gap:12px;padding:30px 20px;background:white;border-right:1px solid #e5e7ef}.qa-nav strong{letter-spacing:.08em;font-size:13px;margin-bottom:30px}.qa-nav a,.qa-nav button{padding:12px;border-radius:8px;text-decoration:none;color:#555575;background:transparent;border:0;text-align:left;font:inherit}.qa-nav button{margin-top:auto;font-size:12px}.qa-content{min-width:0;padding:28px}.qa-content .website-product{height:auto;background:none}.qa-content .website-shell{height:auto;display:block}.qa-content .website-main{display:flex;flex-direction:column;padding:0;gap:20px}.qa-content .website-heading{min-height:84px}.qa-content .website-workspace-grid{height:auto}.qa-content .website-editor-panel{height:auto}.qa-content .ecommerce-product{height:auto}@media(max-width:800px){.qa-shell{grid-template-columns:1fr}.qa-nav{flex-direction:row;flex-wrap:wrap;padding:8px;border-bottom:1px solid #e5e7ef}.qa-nav strong,.qa-nav button{display:none}.qa-content{padding:16px}.qa-nav a{padding:8px;font-size:13px}}`);
writeFileSync(resolve(out,'index.html'),`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'self'; connect-src 'none'; img-src 'self' blob: https:; form-action 'none'; base-uri 'none'; style-src 'self' 'unsafe-inline'"><title>SuperMega synthetic workspace QA</title><link rel="stylesheet" href="fixture.css"><link rel="stylesheet" href="qa.css"><div id="root"></div><script type="module" src="fixture.js"></script></html>`);
console.log(out)
