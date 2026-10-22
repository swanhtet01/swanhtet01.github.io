import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const isolatedOutputId = process.env.SUPERMEGA_PUBLIC_OUTPUT_ID || ''
if (isolatedOutputId && !/^[a-z0-9][a-z0-9-]{0,63}$/.test(isolatedOutputId)) throw new Error('public_output_id_invalid')
const outputDir = isolatedOutputId
  ? resolve(root, '.tmp', `supermega-public-output-${isolatedOutputId}`)
  : resolve(root, '.vercel/output')
const staticDir = resolve(outputDir, 'static')
// Offline transport only. Readiness API responses are synthetic, not provider evidence.
const preload = `
import fs from 'node:fs';
const outputDir=${JSON.stringify(outputDir)};
const manifest=JSON.parse(fs.readFileSync('site-manifest.json'));
const config=JSON.parse(fs.readFileSync(outputDir+'/config.json'));
const release=JSON.parse(fs.readFileSync(outputDir+'/static/__release.json'));
const mode=process.env.TEST_PUBLIC_MUTATION;
if(mode?.startsWith('retired-guard-after-filesystem:')) {
 const path=mode.slice('retired-guard-after-filesystem:'.length);
 const filesystemIndex=config.routes.findIndex(r=>r.handle==='filesystem');
 const guardIndex=config.routes.findIndex((r,index)=>index<filesystemIndex&&typeof r.src==='string'&&r.continue!==true&&new RegExp(r.src).test(path));
 if(guardIndex>=0) {
  const [guard]=config.routes.splice(guardIndex,1);
  const nextFilesystemIndex=config.routes.findIndex(r=>r.handle==='filesystem');
  config.routes.splice(nextFilesystemIndex+1,0,guard);
 }
}
const filesystemIndex=()=>config.routes.findIndex(r=>r.handle==='filesystem');
const firstPageRoute=path=>{
 const boundary=filesystemIndex();
 const index=config.routes.findIndex((r,i)=>i<boundary&&typeof r.src==='string'&&r.continue!==true&&new RegExp(r.src).test(path));
 return index<0?undefined:config.routes[index];
};
globalThis.fetch=async (input,options={})=>{
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
 const retiredProductId=manifest.productVisibility.retainedOnlyProductIds.find(id=>new RegExp('^/'+id+'(?:/|$)').test(u.pathname));
 if(retiredProductId) {
  const page=manifest.pages.find(p=>p.productId===retiredProductId);
  const route=firstPageRoute(u.pathname);
  if(mode==='retired-page-served'||mode==='retired-page-served:'+u.pathname) return new Response(fs.readFileSync(outputDir+'/static/'+page.file,'utf8'),{status:200,headers});
  // Vercel's filesystem handler serves a matching static page unless an earlier
  // terminal route stops it. Model that precedence so a guard after filesystem
  // cannot make an internal static page appear safely hidden.
  if(route?.status===404&&route.dest==='/404.html') return new Response(fs.readFileSync(outputDir+'/static/404.html','utf8'),{status:404,headers});
  return new Response(fs.readFileSync(outputDir+'/static/'+page.file,'utf8'),{status:200,headers});
 }
 const redirect=config.routes.find(r=>r.status===308 && new RegExp(r.src).test(u.pathname));
 if(redirect) {
  const location=mode==='old-redirect'&&u.pathname==='/products/factory/'?'/#plant':mode==='wrong-root-redirect'&&u.pathname==='/'?'/contact/':redirect.headers.Location;
  if(options.redirect==='follow') return fetch(new URL(location,u),options);
  return new Response(null,{status:308,headers:{location}});
 }
 if(u.pathname.startsWith('/images/')) {
  if(mode==='image-missing') return new Response('missing',{status:404});
  if(mode==='image-html') return new Response('<html>fallback</html>',{headers:{'content-type':'text/html'}});
  if(mode==='image-corrupt') return new Response('broken',{headers:{'content-type':'image/png'}});
  const path=mode==='image-stale'?'/images/native-shop/shop_stock_820_en.png':u.pathname;
  return new Response(fs.readFileSync(outputDir+'/static'+path),{headers:{'content-type':'image/png'}});
 }
 if(u.pathname.endsWith('.png')) return new Response(fs.readFileSync(outputDir+'/static'+u.pathname),{headers:{'content-type':'image/png'}});
 const page=manifest.pages.find(p=>p.route===u.pathname);
 if(!page) throw Error('offline_fixture_unknown_route');
 let html=fs.readFileSync(outputDir+'/static/'+page.file,'utf8');
 if(mode==='pilot-pitch'&&u.pathname==='/contact/') html+='<p>Request managed company intelligence.</p>';
 if(mode==='missing-source'&&u.pathname==='/contact/') html=html.replaceAll('source.value=location.href','REMOVED');
 if(mode==='missing-company-intro'&&u.pathname==='/contact/') html=html.replace(manifest.company.statement,'REMOVED');
  if(mode==='extra-public-login'&&u.pathname==='/shop/') html+='<a href="https://app.supermega.dev/login?product=shop">Login</a>';
 if(mode==='missing-assisted') html=html.replaceAll('>Contact</a>','>REMOVED</a>');
 return new Response(html,{headers});
};
`

before(() => {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', timeout: 10000 })
  assert.equal(result.status, 0, result.stderr)
  const release = JSON.parse(readFileSync(resolve(staticDir, '__release.json'), 'utf8'))
  assert.equal(release.commit, result.stdout.trim(), 'Run public:build for the current candidate before public verification; tests never replace deployment artifacts.')
})

function run(mutation = '') {
  const release = JSON.parse(readFileSync(resolve(staticDir, '__release.json'), 'utf8'))
  const result = spawnSync(process.execPath, ['--import', `data:text/javascript;base64,${Buffer.from(preload).toString('base64')}`, 'tools/verify_public_release_live.mjs'], {
    cwd: root, encoding: 'utf8', timeout: 15000,
    env: { SystemRoot: process.env.SystemRoot, PATH: process.env.PATH, SUPERMEGA_PUBLIC_OUTPUT_ID: isolatedOutputId, PUBLIC_VERIFY_ATTEMPTS: '1', EXPECTED_RELEASE_COMMIT: release.commit, TEST_PUBLIC_MUTATION: mutation },
  })
  return { ...result, output: result.stdout + result.stderr }
}

test('current generated Shop-only pages pass exact-release checks through offline transport', () => {
  const result = run()
  assert.equal(result.status, 0, result.output)
  assert.equal(JSON.parse(result.stdout).verificationScope, 'exact_release')
})

for (const [mutation, failure] of [
  ['privacy-header', 'page_security_header_wrong'], ['usb-policy', 'page_security_header_wrong'],
  ['wrong-root-redirect', 'root_redirect_destination_wrong'], ['missing-company-intro', 'contact_company_intro_missing'],
  ['extra-public-login', 'page_shop_sign_in_drift'], ['missing-assisted', 'page_contact_route_missing'],
  ['wrong-commit', 'release_commit_wrong'], ['contact-down', 'contact_not_accepting'],
  ['old-redirect', 'redirect_destination_wrong'],
  ['pilot-pitch', 'retired_managed_pilot_pitch_present'], ['missing-source', 'contact_trial_proof_contract_missing'],
  ['image-missing', 'interface_image_http_error'], ['image-html', 'interface_image_content_type_wrong'],
  ['image-corrupt', 'interface_image_invalid'], ['image-stale', 'interface_image_release_mismatch'],
]) test('rejects ' + mutation, () => {
  const result = run(mutation)
  assert.equal(result.status, 1, result.output)
  assert.ok(result.output.includes(failure), result.output)
})

for (const productId of JSON.parse(readFileSync(resolve(root, 'site-manifest.json'), 'utf8')).productVisibility.retainedOnlyProductIds) {
  for (const route of [`/${productId}`, `/${productId}/`, `/${productId}/index.html`, `/${productId}/settings/nested`]) {
    test(`rejects a served retained page at ${route}`, () => {
      const result = run(`retired-page-served:${route}`)
      assert.equal(result.status, 1, result.output)
      assert.ok(result.output.includes('retired_product_route_not_found'), result.output)
    })
    test(`rejects a retained route guard placed after Vercel filesystem handling at ${route}`, () => {
      const result = run(`retired-guard-after-filesystem:${route}`)
      assert.equal(result.status, 1, result.output)
      assert.ok(result.output.includes('retired_product_route_not_found'), result.output)
    })
  }
}
