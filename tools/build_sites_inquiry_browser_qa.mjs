// Actual React inbox + HTTP client; only provider session acquisition is synthetic.
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('..', import.meta.url))
const { build } = createRequire(resolve(root, 'showroom/package.json'))('esbuild')
const out = resolve(root, '.tmp/qa-workspaces/inquiry'); mkdirSync(out, { recursive: true })
await build({ stdin: { resolveDir: resolve(root, 'showroom'), loader: 'tsx', contents: `
import {createRoot} from 'react-dom/client';
import {HostedInquiryInbox} from './src/products/website/HostedInquiryInbox';
import {createPublishingClient} from './src/products/website/website-publishing-client';
import './src/core/core-app.css';import './src/products/website/website-product.css';import './src/products/website/hosted-website.css';
const identity=await fetch('/inquiry/identity.json',{cache:'no-store'}).then(r=>r.json());
const client=createPublishingClient(identity);
createRoot(document.getElementById('root')).render(<div className="qa-shell"><aside><strong>›_ SUPERMEGA</strong><nav><span>Website</span><span aria-current="page">Inquiries</span></nav><small>Corner Café<br/>Synthetic local workspace</small></aside><main className="website-product"><p className="qa-label">LOCAL QA · Actual UI + HTTP + PostgreSQL · Synthetic sign-in and customer data</p><HostedInquiryInbox client={client} actorId={identity.userId} canWrite/></main></div>);
` }, bundle: true, jsx: 'automatic', format: 'esm', outfile: resolve(out, 'app.js'), logLevel: 'silent',
plugins: [{ name: 'local-auth-fixture', setup(builder) {
  builder.onResolve({ filter: /core\/managed-trial$/ }, () => ({ path: 'synthetic-auth', namespace: 'qa' }))
  builder.onLoad({ filter: /.*/, namespace: 'qa' }, () => ({ contents: `export async function sessionForRequest(identity){return {workspaceId:identity.workspaceId,session:{access_token:'synthetic-local-inquiry-qa'}}}` }))
} }] })
writeFileSync(resolve(out,'index.html'),`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'self'; connect-src 'self'; form-action 'none'; base-uri 'none'; style-src 'self' 'unsafe-inline'"><title>Sites inquiries · local database QA</title><link rel="stylesheet" href="app.css"><style>*{box-sizing:border-box}body{margin:0;background:#fafbfe;color:#182030;font:16px/1.6 system-ui,'Myanmar Text',sans-serif}.qa-shell{display:grid;grid-template-columns:210px minmax(0,1fr);min-height:100vh}.qa-shell>aside{padding:32px 20px;background:white;border-right:1px solid #e7e9f1;display:flex;flex-direction:column;gap:48px}.qa-shell>aside strong{font-size:14px;letter-spacing:1px}.qa-shell>aside nav{display:grid;gap:12px}.qa-shell>aside nav span{padding:12px;color:#697386;border-radius:8px}.qa-shell>aside nav [aria-current]{background:#efecff;color:#5142c6}.qa-shell aside small{margin-top:auto;color:#778095}.qa-shell main{min-width:0;padding:36px}.qa-label{font-size:11px;color:#737b8f;margin:0 0 24px}@media(max-width:750px){.qa-shell{grid-template-columns:1fr}.qa-shell>aside{padding:18px;border-bottom:1px solid #e7e9f1;border-right:0;gap:16px}.qa-shell aside small{display:none}.qa-shell>aside nav{display:flex}.qa-shell main{padding:24px 16px}}</style><div id="root"></div><script type="module" src="app.js"></script></html>`)
console.log(JSON.stringify({ok:true,localOnly:true,output:out}))
