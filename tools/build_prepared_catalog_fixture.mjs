import {createRequire} from 'node:module'
import {resolve} from 'node:path'
import {mkdirSync,writeFileSync} from 'node:fs'
const require=createRequire(resolve('showroom/package.json'))
const result=await require('esbuild').build({stdin:{resolveDir:resolve('showroom'),loader:'tsx',contents:`
import React from 'react';import {createRoot} from 'react-dom/client';
import {PreparedCatalog} from './src/products/ecommerce/PreparedCatalog';
import {STOREFRONT_PREVIEW_SCHEMA} from './src/products/ecommerce/storefront-model';
import {COMMERCE_WORKSPACE_SCHEMA} from './src/core/commerce-workspace';
import './src/core/core-app.css';
const preview={schema:STOREFRONT_PREVIEW_SCHEMA,mode:'browser-local-preview',sourceCatalogSchema:COMMERCE_WORKSPACE_SCHEMA,storeName:'ဆိုင် · Prepared catalog',summary:'Synthetic preview for layout review.',currency:'MMK',items:[{sku:'A',name:'မြန်မာလက်ဖက်ရည်',variant:'Large · 500 g',unitPriceMmk:12500,availability:'available'},{sku:'B',name:'LongProductNameWithoutSpacesForNarrowScreenReview',variant:null,unitPriceMmk:500,availability:'sold_out'}]};
createRoot(document.getElementById('root')).render(<main><h1>Prepared catalog layout check</h1><div className="qa-row">{[320,960].map(width=><section key={width} style={{width,maxWidth:'100%'}}><h2>{width}px container</h2><PreparedCatalog preview={preview}/></section>)}</div></main>);
`},bundle:true,write:false,outdir:'in-memory',format:'esm',jsx:'automatic',define:{'import.meta.env':'{}'}})
const css=result.outputFiles.find(f=>f.path.endsWith('.css')).text
const js=result.outputFiles.find(f=>f.path.endsWith('.js')).text
const out=resolve('showroom/dist/__qa-catalog');mkdirSync(out,{recursive:true})
writeFileSync(resolve(out,'index.html'),`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="connect-src 'none'; img-src 'none'; form-action 'none'"><title>Synthetic prepared catalog</title><style>${css}</style><style>body{margin:0}.qa-row{display:flex;flex-wrap:wrap;gap:24px}main>h1{font-size:18px}h2{font-size:20px}</style><div id="root"></div><script type="module">${js.replaceAll('</script','<\\/script')}</script>`)
console.log('Built single-file /__qa-catalog/ with synthetic content only.')
