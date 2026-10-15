process.on('uncaughtException', error => { console.error(error.message); process.exitCode=1 });
// Shared-content parity fixture. Actual renderers; local synthetic data only.
import {createRequire} from 'node:module'
import {createHash} from 'node:crypto'
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
const root=fileURLToPath(new URL('..',import.meta.url)),out=resolve(root,'.tmp/qa-workspaces/parity')
const {build}=createRequire(resolve(root,'showroom/package.json'))('esbuild')
mkdirSync(out,{recursive:true})
const bundle=await build({stdin:{contents:"export * from './website-model';export * from './website-export';export * from './website-presentation'",resolveDir:resolve(root,'showroom/src/products/website'),loader:'ts'},bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'})
const api=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].contents).toString('base64'))
const photo=readFileSync(resolve(root,'.tmp/sites-private-editor-review-20261010/synthetic-photo.webp')),asset=createHash('sha256').update(photo).digest('hex')+'.webp'
writeFileSync(resolve(out,'photo.webp'),photo)
const state=api.createInitialWorkspace();state.siteName='Corner Café · QA'
const home=state.pages.find(p=>p.slug==='/'),contact=state.pages.find(p=>p.slug==='/contact')
home.stage=contact.stage='ready';home.navigation.label='Home';contact.navigation.label='Contact'
home.hero={...home.hero,eyebrow:'A little time for yourself',headline:'Good mornings start here.',summary:'Fresh fruit, a warm welcome and a place to pause.',ctaLabel:'Plan your visit',ctaHref:'/contact',image:{assetId:asset,alt:'Fresh grapefruit, ready for breakfast',decorative:false}}
home.sections=[{id:'parity-fresh',eyebrow:'Fresh every day',title:'Simple things, done well.',body:'Seasonal ingredients. Thoughtful service. Room for good conversation.',image:{assetId:asset,alt:'Fresh grapefruit',decorative:false}}]
home.seo={title:'Corner Café · Synthetic QA',description:'Local renderer parity only.'}
contact.hero={...contact.hero,eyebrow:'Come say hello',headline:'Make a little room in your day.',summary:'Send a question or tell us when you would like to visit.',ctaLabel:'',ctaHref:''}
contact.sections=[{id:'parity-visit',eyebrow:'Plan your visit',title:'Come say hello.',body:'This is synthetic content for a local visual check.'}];contact.seo={title:'Contact · Synthetic QA',description:'Local form layout only.'}
state.pages=[home,contact];state.selectedPageId=home.id
const artifact=api.createWebsitePreviewArtifact(state)
writeFileSync(resolve(out,'artifact.json'),JSON.stringify(artifact))
writeFileSync(resolve(out,'state.json'),JSON.stringify(state))
writeFileSync(resolve(out,'export.html'),api.buildWebsiteHtml(artifact,new Map([[asset,'data:image/webp;base64,'+photo.toString('base64')]])))
await build({stdin:{resolveDir:resolve(root,'showroom'),loader:'tsx',contents:`
import React,{useState}from'react';import{createRoot}from'react-dom/client';import'./src/products/website/website-product.css';
import{SitePreview}from'./src/products/website/SitePreview';import{WebsiteMediaContext}from'./src/products/website/WebsiteMediaContext';
const state=${JSON.stringify(state)};
const client={scopeKey:'synthetic-parity',load:async()=>{const response=await fetch('./photo.webp');return response.blob()},assertCurrent:async()=>{}};
function App(){const[id,setId]=useState(state.selectedPageId);return <WebsiteMediaContext.Provider value={{client,onEditingChange:()=>{}}}><SitePreview device="desktop" page={state.pages.find(p=>p.id===id)} pages={state.pages} siteName={state.siteName} onSelectPage={setId}/></WebsiteMediaContext.Provider>}
createRoot(document.getElementById('root')).render(<App/>);
`},jsx:'automatic',bundle:true,format:'esm',outfile:resolve(out,'preview.js'),logLevel:'silent'})
writeFileSync(resolve(out,'preview.html'),`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Actual editor · local parity QA</title><link rel="stylesheet" href="preview.css"><style>body{margin:0}#root{width:100%}.website-preview-panel,.website-preview-stage,.website-preview-frame{height:auto;min-height:0;max-height:none;padding:0;margin:0;border:0;border-radius:0;overflow:visible;box-shadow:none;display:block}</style><div id="root"></div><script type="module" src="preview.js"></script></html>`)
console.log(JSON.stringify({ok:true,artifact:resolve(out,'artifact.json'),presentationDigest:api.WEBSITE_PRESENTATION_DIGEST,synthetic:true}))
