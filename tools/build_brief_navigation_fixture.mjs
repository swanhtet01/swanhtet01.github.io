import { createRequire } from 'node:module'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
const { build } = createRequire(resolve('showroom/package.json'))('esbuild')
const out = resolve('showroom/dist/__qa-brief')
mkdirSync(out, { recursive: true })
await build({
  stdin: { resolveDir: resolve('showroom'), loader: 'tsx', contents: `
    import React from 'react'; import {createRoot} from 'react-dom/client';
    import {BusinessBrief} from './src/products/AssistedDeliveryScope';
    const params=new URLSearchParams(location.search);
    const product=params.get('product')==='ecommerce'?'ecommerce':'website';
    createRoot(document.getElementById('root')).render(<>
      <p>Synthetic navigation check. No request is sent.</p>
      {params.has('review') ? <><h1>Local brief review</h1><p>Use browser Back to return.</p><pre>{new URLSearchParams(location.hash.slice(1)).get('goal')}</pre></>
        : <BusinessBrief product={product} onOpenWorkspace={()=>{}}/>}
    </>);
  ` },
  plugins: [{ name: 'isolate-brief-navigation', setup(b) {
    b.onLoad({ filter: /AssistedDeliveryScope\.tsx$/ }, args => ({ loader: 'tsx', contents:
      readFileSync(args.path, 'utf8').replace('https://supermega.dev/contact/?', '/__qa-brief/?review=1&') }));
    b.onLoad({ filter: /business-brief-draft\.ts$/ }, args => ({ loader: 'ts', contents:
      readFileSync(args.path, 'utf8').replace('supermega.business-brief.', 'supermega.qa-navigation-brief.') }));
  } }],
  jsx: 'automatic', bundle: true, format: 'esm', outfile: resolve(out, 'fixture.js'),
})
writeFileSync(resolve(out, 'index.html'), '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="connect-src \'none\'; form-action \'none\'"><title>Synthetic brief navigation</title><link rel="stylesheet" href="fixture.css"><div id="root"></div><script type="module" src="fixture.js"></script>')
console.log('Local navigation fixture: /__qa-brief/; uses separate synthetic session keys. Remove three generated assets after review.')
