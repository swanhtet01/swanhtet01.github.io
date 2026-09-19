import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
// Offline transport only. Readiness API responses are synthetic, not provider evidence.
const preload = `
import fs from 'node:fs';
const manifest=JSON.parse(fs.readFileSync('site-manifest.json'));
const config=JSON.parse(fs.readFileSync('.vercel/output/config.json'));
const release=JSON.parse(fs.readFileSync('.vercel/output/static/__release.json'));
const mode=process.env.TEST_PUBLIC_MUTATION;
globalThis.fetch=async input=>{
 const u=new URL(input);
 if(!['supermega.dev','www.supermega.dev'].includes(u.hostname)) throw Error('offline_fixture_unexpected_host');
 const headers={...config.routes.find(r=>r.headers?.['content-security-policy']).headers};
 if(mode==='privacy-header') headers['referrer-policy']='strict-origin-when-cross-origin';
 if(mode==='usb-policy') headers['permissions-policy']='camera=(), microphone=(), geolocation=(), payment=()';
 const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{...headers,'content-type':'application/json','cache-control':'no-store'}});
 if(u.pathname==='/__release.json') return json({...release,...(mode==='wrong-commit'?{commit:'0'.repeat(40)}:{})});
 if(u.pathname==='/api/health') return json({ok:true,status:'ready',service:'supermega-public-site',brand_version:release.brandVersion,context_version:release.contextVersion,catalog_version:release.catalogVersion});
 if(u.pathname==='/api/contact-submissions/status') return json({status:mode==='contact-down'?'unavailable':'ready',accepting:true,controls:{idempotency:'required',edge_rate_limit:'required',trial_proof:'optional_client_provided'}});
 if(u.pathname.startsWith('/api/pipeline-control')) return json({status:'not_found'},404);
 const redirect=config.routes.find(r=>r.status===308 && new RegExp(r.src).test(u.pathname));
 if(redirect) return new Response(null,{status:308,headers:{location:mode==='old-redirect'&&u.pathname==='/products/factory/'?'/#plant':redirect.headers.Location}});
 if(u.pathname.endsWith('.png')) return new Response(fs.readFileSync('.vercel/output/static'+u.pathname),{headers:{'content-type':'image/png'}});
 const page=manifest.pages.find(p=>p.route===u.pathname);
 if(!page) throw Error('offline_fixture_unknown_route');
 let html=fs.readFileSync('.vercel/output/static/'+page.file,'utf8');
 if(mode==='missing-offer') html=html.replaceAll('Your business. Our setup work.','REMOVED');
 if(mode==='missing-action') html=html.replaceAll('Open Shop Profit Control','REMOVED');
 if(mode==='missing-guided') html=html.replaceAll('Choose Shop type or continue saved','REMOVED');
 if(mode==='missing-assisted') html=html.replaceAll('Request assisted setup','REMOVED');
 if(mode==='plant-marketing'&&u.pathname==='/') html+='<a href="/plant/">Plant</a>';
 if(mode==='plant-indexed'&&u.pathname==='/plant/') html=html.replace('noindex,follow','index,follow');
 return new Response(html,{headers});
};
`

before(() => {
  const result = spawnSync(process.execPath, ['tools/create_public_vercel_output.mjs'], { cwd: root, encoding: 'utf8', timeout: 30000 })
  assert.equal(result.status, 0, result.stderr)
})

function run(mutation = '') {
  const release = JSON.parse(readFileSync(resolve(root, '.vercel/output/static/__release.json'), 'utf8'))
  const result = spawnSync(process.execPath, ['--import', `data:text/javascript;base64,${Buffer.from(preload).toString('base64')}`, 'tools/verify_public_release_live.mjs'], {
    cwd: root, encoding: 'utf8', timeout: 15000,
    env: { SystemRoot: process.env.SystemRoot, PATH: process.env.PATH, PUBLIC_VERIFY_ATTEMPTS: '1', EXPECTED_RELEASE_COMMIT: release.commit, TEST_PUBLIC_MUTATION: mutation },
  })
  return { ...result, output: result.stdout + result.stderr }
}

test('current generated three-product pages pass exact-release checks through offline transport', () => {
  const result = run()
  assert.equal(result.status, 0, result.output)
  assert.equal(JSON.parse(result.stdout).verificationScope, 'exact_release')
})

for (const [mutation, failure] of [
  ['privacy-header', 'page_security_header_wrong'], ['usb-policy', 'page_security_header_wrong'],
  ['missing-offer', 'homepage_offer_contract_missing'], ['missing-action', 'homepage_shop_action_missing'],
  ['missing-guided', 'guided_product_label_wrong'], ['missing-assisted', 'page_contact_route_missing'],
  ['plant-marketing', 'retired_product_marketed'], ['plant-indexed', 'retired_product_boundary_missing'],
  ['wrong-commit', 'release_commit_wrong'], ['contact-down', 'contact_not_accepting'],
  ['old-redirect', 'redirect_destination_wrong'],
]) test('rejects ' + mutation, () => {
  const result = run(mutation)
  assert.equal(result.status, 1, result.output)
  assert.ok(result.output.includes(failure), result.output)
})
