import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { mkdirSync, writeFileSync } from 'node:fs'

const { build } = createRequire(resolve('showroom/package.json'))('esbuild')
const out = resolve('.tmp/qa-managed-shop-import')
mkdirSync(out, { recursive: true })
const source = [
  "import React from 'react';",
  "import { createRoot } from 'react-dom/client';",
  "import { MemoryRouter } from 'react-router';",
  "import { ClientDataOnboarding } from './src/core/ClientDataOnboarding';",
  "import './src/core/core-app.css';",
  "const identity={workspaceId:'11111111-1111-4111-8111-111111111111',userId:'22222222-2222-4222-8222-222222222222'};",
  "const calls=[];",
  "window.fetch=async(input)=>{calls.push(String(input));throw new Error('Network blocked in synthetic fixture')};",
  "const memory=()=>{const values=new Map();return {getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k),clear:()=>values.clear(),key:i=>[...values.keys()][i]??null,get length(){return values.size}}};",
  "Object.defineProperty(window,'localStorage',{value:memory()});Object.defineProperty(window,'sessionStorage',{value:memory()});",
  "const root=createRoot(document.getElementById('root'));",
  "function loadCsv(){const input=document.querySelector('#client-import-commerce');if(!input)throw Error('Shop CSV input missing');const csv=['sku,item_name,opening_stock,reorder_at,price_mmk,color','QA-TEA-001,Myanmar milk tea,5,2,2500,Black'].join(String.fromCharCode(10));const file=new File([csv],'synthetic-shop.csv',{type:'text/csv'});const transfer=new DataTransfer();transfer.items.add(file);input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));setTimeout(()=>{document.getElementById('evidence').textContent='Synthetic CSV loaded. Fetch attempts: '+calls.length+'. No import submitted.'},250)}",
  "root.render(<MemoryRouter><><p>Managed Shop onboarding preview · synthetic café and CSV · network blocked · no import is submitted.</p><button onClick={loadCsv} type='button'>Load synthetic CSV</button><button onClick={()=>window.location.reload()} type='button'>Reset preview</button><output id='evidence'/><ClientDataOnboarding initiallyOpen managedIdentity={identity} owner='Synthetic QA Owner' product='commerce' productName='Shop' productSlug='shop' workflowTemplateId='retail-wholesale' workspace='Synthetic QA Cafe'/></></MemoryRouter>);",
].join('\n')

await build({
  stdin: { resolveDir: resolve('showroom'), loader: 'tsx', contents: source },
  jsx: 'automatic',
  bundle: true,
  format: 'esm',
  target: 'es2022',
  define: { 'import.meta.env': '{}' },
  outfile: resolve(out, 'fixture.js'),
})
writeFileSync(
  resolve(out, 'index.html'),
  '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src \'self\' data: blob:; connect-src \'none\'; form-action \'none\'"><title>Isolated Shop onboarding preview</title><link rel="stylesheet" href="fixture.css"><div id="root"></div><script type="module" src="fixture.js"></script>',
)
console.log('Built '+out+'. It contains synthetic data only and blocks network requests.')
