// Synthetic visual/interaction QA only. No real identity, database or release proof.
import { createServer } from 'node:http'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
if (args.length !== 2 || args[0] !== '--expected-head' || !/^[0-9a-f]{40}$/.test(args[1])) throw Error('exact_expected_head_required')
const git = (...argv) => execFileSync('git', argv, { cwd: root, encoding: 'utf8', windowsHide: true }).trim()
const head = git('rev-parse', 'HEAD')
if (head !== args[1] || git('status', '--porcelain')) throw Error('clean_exact_source_required')
const require = createRequire(resolve(root, 'showroom/package.json'))
const { build } = require('esbuild')
const result = await build({
  absWorkingDir: root, bundle: true, write: false, platform: 'browser', format: 'esm', jsx: 'automatic',
  outdir: 'fixture-memory', logLevel: 'error', define: { 'process.env.NODE_ENV': '"development"' },
  stdin: { resolveDir: resolve(root, 'showroom/src'), loader: 'tsx', contents: `
    import React, {useState} from 'react'; import {createRoot} from 'react-dom/client';
    import {MemoryRouter, Routes, Route} from 'react-router';
    import WebsiteCustomerReview from './products/website/WebsiteCustomerReview';
    import {WebsiteReviewInbox} from './products/website/WebsiteReviewInbox';
    import './core/core-app.css';
    const id='11111111-1111-4111-8111-111111111111';
    const page=(id,label,headline,body)=>({id,slug:'/'+id+'/',navigation:{label,visible:true},
      hero:{eyebrow:'Prepared business website',headline,summary:body,ctaLabel:'Ask about a booking',ctaHref:'/contact/'},
      sections:[{id:'details',eyebrow:'What to expect',title:'Clear details before you book',body:'Choose a service, confirm the details with our team, then visit at the agreed time.'}],
      seo:{title:label+' · Example Studio',description:body}});
    const preview={siteName:'Example Studio',pages:[
      page('home','Home','A calmer place for your next appointment','A prepared Website for a local service business. Clear services, opening information and a simple contact step.'),
      page('services','Services','Find the right service for your visit','ဝန်ဆောင်မှုနှင့် အသေးစိတ်အချက်အလက်များကို ကြိုတင်မေးမြန်းနိုင်ပါသည်။'),
      page('contact','Contact','Talk to the team before visiting','Ask about availability and the right service. This synthetic preview contains no real contact details.')
    ]};
    const canonical=x=>Array.isArray(x)?'['+x.map(canonical).join(',')+']':x&&typeof x==='object'?'{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canonical(x[k])).join(',')+'}':JSON.stringify(x);
    const digest='sha256:'+Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical(preview)))),x=>x.toString(16).padStart(2,'0')).join('');
    const stamp=new Date().toISOString(), expiry=new Date(Date.now()+86400000).toISOString();
    const f=window.__reviewFixture={identity:{userId:'fixture-user',workspaceId:'fixture-company'},
      review:{reviewId:id,contentRevision:7,previewDigest:digest,preview,expiresAt:expiry,status:'prepared_preview',publicationAuthorized:false},
      preparedAt:stamp,reviewStatus:'active',acceptance:null,changes:[],receipts:new Map(),loseNext:false,
      counts:{reads:0,syntheticWrites:0,blockedRequests:0,errors:0}};
    const report=()=>{ const overflow=document.documentElement.scrollWidth>innerWidth;
      document.getElementById('fixture-counts').textContent='Viewport '+innerWidth+'×'+innerHeight+' · overflow: '+overflow+' · '+Object.entries(f.counts).map(([k,v])=>k+': '+v).join(' · '); };
    f.report=report; window.addEventListener('resize',report);
    new ResizeObserver(report).observe(document.documentElement);
    window.addEventListener('error',()=>{f.counts.errors++;report()});
    window.addEventListener('unhandledrejection',()=>{f.counts.errors++;report()});
    window.fetch=async()=>{f.counts.blockedRequests++;report();throw Error('fixture_network_denied')};
    // Rewrite all anchor destinations so keyboard/new-tab activation stays local.
    new MutationObserver(()=>{for(const a of document.querySelectorAll('#root a[href]')){
      if(a.getAttribute('href')!=='/fixture-link'){a.setAttribute('href','/fixture-link');a.removeAttribute('target')}
    }}).observe(document.getElementById('root'),{subtree:true,childList:true,attributes:true,attributeFilter:['href']});
    function App(){const [mode,setMode]=useState('customer'),[generation,setGeneration]=useState(0);
      return <><nav className='qa-controls' aria-label='Synthetic QA controls'>
        <button onClick={()=>setMode('customer')}>Customer QA</button><button onClick={()=>setMode('staff')}>Staff QA</button>
        <button onClick={()=>setGeneration(n=>n+1)}>Reopen component</button>
        <button onClick={()=>{f.loseNext=true}}>Lose next save response</button>
        <button onClick={()=>{f.reviewStatus='revoked';setGeneration(n=>n+1)}}>Withdraw synthetic review</button>
      </nav>{mode==='customer'?<MemoryRouter key={generation} initialEntries={['/website/review/'+id]}><Routes>
        <Route path='/website/review/:reviewId' element={<WebsiteCustomerReview/>}/></Routes></MemoryRouter>
      :<main className='website-product qa-staff' key={generation}><WebsiteReviewInbox workspaceId='fixture-company' actorId='fixture-user'/></main>}</>}
    createRoot(document.getElementById('root')).render(<App/>); report();
  ` },
  plugins: [{ name: 'synthetic-review-transport', setup(builder) {
    builder.onResolve({ filter: /managed-trial$/ }, () => ({ path: 'fixture', namespace: 'synthetic' }))
    builder.onLoad({ filter: /.*/, namespace: 'synthetic' }, () => ({ contents: `
      const state=()=>window.__reviewFixture;
      const read=()=>{const f=state();f.counts.reads++;f.report();return f};
      const copy=x=>structuredClone(x);
      const active=()=>{const f=read();if(f.reviewStatus!=='active')throw Error('review_unavailable');return f};
      export const currentManagedIdentity=async()=>copy(state().identity);
      export const sameManagedIdentity=(a,b)=>a.userId===b.userId&&a.workspaceId===b.workspaceId;
      export const loadManagedWebsiteReview=async()=>copy(active().review);
      export const loadManagedWebsiteAcceptance=async()=>{const f=active();return {reviewId:f.review.reviewId,contentRevision:7,
        previewDigest:f.review.previewDigest,expiresAt:f.review.expiresAt,status:f.acceptance?'accepted_for_operator_release_review':f.changes.length?'changes_requested':'pending_review',
        acceptedAt:f.acceptance?.acceptedAt??null,publicationAuthorized:false,deploymentAuthorized:false}};
      function save(payload,kind){const f=active();if(payload.reviewId!==f.review.reviewId||payload.previewDigest!==f.review.previewDigest)throw Error('wrong_revision');
        if(f.receipts.has(payload.commandId))return {...copy(f.receipts.get(payload.commandId)),replayed:true};
        if(f.acceptance||(kind==='accept'&&f.changes.length))throw Error('decision_conflict');
        const time=new Date().toISOString();let result;
        if(kind==='accept'){f.acceptance={contentRevision:7,sourceVersion:2,previewDigest:f.review.previewDigest,acceptedAt:time,
          status:'accepted_for_operator_release_review',publicationAuthorized:false,deploymentAuthorized:false};
          result={commandId:payload.commandId,reviewId:payload.reviewId,contentRevision:7,previewDigest:payload.previewDigest,
            acceptedAt:time,status:f.acceptance.status,persisted:true,replayed:false,publicationAuthorized:false,deploymentAuthorized:false};
        }else{f.changes.unshift({commandId:payload.commandId,note:payload.note,createdAt:time});
          result={commandId:payload.commandId,reviewId:payload.reviewId,createdAt:time,status:'changes_requested',persisted:true,replayed:false,publicationAuthorized:false};}
        f.receipts.set(payload.commandId,copy(result));f.counts.syntheticWrites++;f.report();
        if(f.loseNext){f.loseNext=false;throw Error('synthetic_response_lost')}return copy(result);
      }
      export const sendManagedWebsiteReviewChanges=async payload=>save(payload,'changes');
      export const sendManagedWebsiteAcceptance=async payload=>save(payload,'accept');
      export const loadManagedWebsitePreparation=async()=>{const f=read();return {
        status:'saved_source_preview',sourceVersion:2,contentRevision:7,preview:copy(f.review.preview),
        previewDigest:f.review.previewDigest,readAt:new Date().toISOString(),reviewCreated:false,
        publicationAuthorized:false,deploymentAuthorized:false}};
      export const loadManagedWebsiteReviewStaffPage=async(_identity,reviewId)=>{const f=read();return reviewId?{
        reviewId,contentRevision:7,sourceVersion:2,previewDigest:f.review.previewDigest,reviewStatus:f.reviewStatus,
        requests:copy(f.changes),acceptance:copy(f.acceptance),nextAfter:null,publicationAuthorized:false
      }:{reviews:[{reviewId:f.review.reviewId,contentRevision:7,sourceVersion:2,preparedAt:f.preparedAt,expiresAt:f.review.expiresAt,
        status:f.reviewStatus,hasChangeRequests:f.changes.length>0,hasCustomerAcceptance:!!f.acceptance}],
        nextAfter:null,order:'review_id_ascending',publicationAuthorized:false}};
    ` }))
  } }],
})
const assets = new Map(result.outputFiles.map(file => ['/' + file.path.split(/[\\/]/).at(-1), file.contents]))
assets.set('/fixture.css', Buffer.from('body{margin:0;background:#f7f9f7;font:16px/1.5 system-ui;color:#18372a}.qa-banner,.qa-controls,#fixture-counts{display:flex;flex-wrap:wrap;gap:.5rem;padding:.75rem;overflow-wrap:anywhere}.qa-banner{background:#fff0bc}.qa-controls button{min-height:44px;padding:.5rem .75rem}#fixture-counts{font-size:12px}.qa-staff{padding:1rem;min-height:100dvh}.qa-staff ul{padding-left:1.25rem}'))
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SuperMega synthetic Website review QA</title><link rel="stylesheet" href="/stdin.css"><link rel="stylesheet" href="/fixture.css"><body><aside class="qa-banner">LOCAL SYNTHETIC QA — no real identity, database, customer or publishing. Source ${head.slice(0, 8)}. Reopen tests component state; browser refresh resets fixture data.</aside><output id="fixture-counts"></output><div id="root"></div><script type="module" src="/stdin.js"></script></body></html>`
const server = createServer((request, response) => {
  if (request.headers.host !== '127.0.0.1:4194' || request.method !== 'GET') { response.writeHead(403); response.end(); return }
  response.setHeader('cache-control', 'no-store')
  response.setHeader('content-security-policy', "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'none'; img-src 'none'; font-src 'none'; form-action 'none'; frame-ancestors 'none'; base-uri 'none'")
  response.setHeader('referrer-policy', 'no-referrer'); response.setHeader('x-content-type-options', 'nosniff')
  if (request.url === '/') { response.setHeader('content-type', 'text/html; charset=utf-8'); response.end(html); return }
  if (request.url === '/fixture-link') { response.setHeader('content-type', 'text/html; charset=utf-8'); response.end('<h1>Fixture link boundary</h1><p>No external page was opened.</p>'); return }
  const asset = assets.get(request.url)
  if (!asset) { response.writeHead(404); response.end(); return }
  response.setHeader('content-type', request.url.endsWith('.css') ? 'text/css' : 'text/javascript'); response.end(asset)
})
server.listen(4194, '127.0.0.1', () => console.log(JSON.stringify({ mode: 'synthetic_only', head, url: 'http://127.0.0.1:4194/', externalRequestsAllowed: false })))
