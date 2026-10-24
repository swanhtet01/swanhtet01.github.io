#!/usr/bin/env node
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { createServer } from 'node:http'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { delimiter, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { Cdp, findBrowser, launchBrowser } from './verify_app_entry_rendered.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(resolve(root, 'showroom/package.json'))
const { build } = require('esbuild')
const scratch = await mkdtemp(join(tmpdir(), 'supermega-cash-tender-browser-'))
const userDataDir = join(scratch, 'browser')
const dist = join(scratch, 'dist')
await mkdir(dist, { recursive: true })

const actionSource = `
  const action=(id,confirmation)=>({id,domain:'commerce',kind:'order_settle',summary:'Complete 2,500 MMK counter sale',before:'Sale awaiting reviewed cash handoff',after:'Cash sale completed and stock updated',apply:()=>{},presentation:'counter',reasonSuggestion:'Counter cash sale',evidenceReferenceSuggestion:'SYNTHETIC-CASH-390',cashTender:{amountDueMmk:2500},...(confirmation?{confirmation}: {})});
  function Harness(){
    const [pending,setPending]=React.useState(()=>action('ACT-CASH-390'));
    async function confirm(details){
      window.__cashQa.calls++; window.__cashQa.commands.push({id:pending.id,...details});
      if(window.__cashQa.calls===1){
        window.__cashQa.saleEffects++; window.__cashQa.stockEffects++;
        setPending(action(pending.id,{id:pending.id,domain:'commerce',kind:'order_settle',summary:pending.summary,before:pending.before,after:pending.after,capturedAt:'2026-10-24T00:00:00.000Z',actorKind:'human',...details}));
        throw new Error('Synthetic ambiguous completion');
      }
      setPending(action('ACT-CASH-NEXT'));
    }
    return <AccountableActionGate key={pending.id} action={pending} authenticatedActor={{id:'operator-1',label:'Synthetic cashier'}} onCancel={()=>{}} onConfirm={confirm}/>;
  }
  window.__cashQa={calls:0,saleEffects:0,stockEffects:0,commands:[]};
  createRoot(document.getElementById('root')).render(<Harness/>);
`

await build({
  stdin: {
    resolveDir: resolve(root, 'showroom'),
    loader: 'tsx',
    contents: `import React from 'react';import{createRoot}from'react-dom/client';import{AccountableActionGate}from'./src/core/CoreApp';import'./src/core/core-app.css';${actionSource}`,
  },
  plugins: [{
    name: 'fixture-export-accountable-action-gate',
    setup(builder) {
      builder.onLoad({ filter: /CoreApp\.tsx$/ }, async (args) => ({
        loader: 'tsx',
        contents: (await readFile(args.path, 'utf8')).replace('function AccountableActionGate({', 'export function AccountableActionGate({'),
      }))
    },
  }],
  bundle: true,
  define: { 'import.meta.env': '{}' },
  format: 'esm',
  jsx: 'automatic',
  logLevel: 'silent',
  nodePaths: (process.env.NODE_PATH ?? '').split(delimiter).filter(Boolean),
  outfile: join(dist, 'fixture.js'),
})
await writeFile(join(dist, 'fixture.css'), await readFile(resolve(root, 'showroom/src/core/core-app.css')))
await writeFile(join(dist, 'index.html'), '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="fixture.css"><div id="root"></div><script type="module" src="fixture.js"></script>')

const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }
const server = createServer(async (request, response) => {
  const name = new URL(request.url ?? '/', 'http://127.0.0.1').pathname === '/' ? 'index.html' : new URL(request.url ?? '/', 'http://127.0.0.1').pathname.slice(1)
  if (!['index.html', 'fixture.js', 'fixture.css'].includes(name)) return response.writeHead(404).end()
  response.writeHead(200, { 'content-type': mime[name.slice(name.lastIndexOf('.'))], 'cache-control': 'no-store' })
  response.end(await readFile(join(dist, name)))
})

function evaluate(cdp, sessionId, expression) {
  return cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId).then(({ result, exceptionDetails }) => {
    if (exceptionDetails) throw new Error(exceptionDetails.text || 'browser_evaluation_failed')
    return result.value
  })
}

function sha256(payload) {
  return `sha256:${createHash('sha256').update(payload).digest('hex')}`
}

let browser
let cdp
try {
  await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen))
  const origin = `http://127.0.0.1:${server.address().port}`
  const started = await launchBrowser(findBrowser(), userDataDir)
  browser = started.browser
  cdp = await Cdp.connect(started.wsUrl)
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' })
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true })
  await cdp.send('Page.enable', {}, sessionId)
  await cdp.send('Runtime.enable', {}, sessionId)
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }, sessionId)
  await cdp.send('Page.navigate', { url: origin }, sessionId)
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (await evaluate(cdp, sessionId, `Boolean(document.querySelector('#counter-cash-given'))`)) break
    await new Promise((done) => setTimeout(done, 50))
  }

  const input = (value) => evaluate(cdp, sessionId, `(()=>{const n=document.querySelector('#counter-cash-given');const s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;s.call(n,${JSON.stringify(value)});n.dispatchEvent(new Event('input',{bubbles:true}));n.focus();return n.value})()`)
  const enter = async () => {
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }, sessionId)
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }, sessionId)
    await new Promise((done) => setTimeout(done, 50))
  }
  const state = () => evaluate(cdp, sessionId, `(()=>{const i=document.querySelector('#counter-cash-given');const f=document.querySelector('#counter-cash-feedback');const d=document.querySelector('dialog.accountable-action-gate');const b=document.querySelector('button[type=submit]');const dr=d?.getBoundingClientRect();const br=b?.getBoundingClientRect();return{value:i?.value,readOnly:i?.readOnly,active:document.activeElement?.id,role:f?.getAttribute('role'),live:f?.getAttribute('aria-live'),feedback:f?.textContent,button:b?.textContent,calls:window.__cashQa.calls,saleEffects:window.__cashQa.saleEffects,stockEffects:window.__cashQa.stockEffects,commands:window.__cashQa.commands,bodyWidth:document.body.scrollWidth,viewport:innerWidth,dialog:{scrollWidth:d?.scrollWidth,clientWidth:d?.clientWidth,scrollHeight:d?.scrollHeight,clientHeight:d?.clientHeight,top:dr?.top,bottom:dr?.bottom,buttonTop:br?.top,buttonBottom:br?.bottom}}})()`)

  await input('bad')
  await enter()
  const invalid = await state()
  assert.deepEqual({ calls: invalid.calls, active: invalid.active, role: invalid.role, live: invalid.live }, { calls: 0, active: 'counter-cash-given', role: 'status', live: 'polite' })
  assert.match(invalid.feedback, /whole-MMK amount/)
  assert.match(invalid.feedback, /ငွေပမာဏ/)
  await evaluate(cdp, sessionId, `document.querySelector('#action-confirm-title').focus()`)
  assert.deepEqual(await state().then((value) => ({ role: value.role, live: value.live })), { role: 'alert', live: 'assertive' })
  await input('2499')
  await enter()
  const short = await state()
  assert.deepEqual({ calls: short.calls, active: short.active, role: short.role, live: short.live }, { calls: 0, active: 'counter-cash-given', role: 'status', live: 'polite' })
  assert.match(short.feedback, /1 MMK short/)
  assert.match(short.feedback, /ကျသင့်ငွေထက် နည်း/)

  await input('3000')
  const fit = Buffer.from((await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true }, sessionId)).data, 'base64')
  const before = await state()
  assert.equal(before.bodyWidth, before.viewport)
  assert.equal(before.dialog.scrollWidth, before.dialog.clientWidth)
  assert.ok(before.dialog.buttonTop >= before.dialog.top && before.dialog.buttonBottom <= before.dialog.bottom, 'completion remains reachable after the bounded dialog scroll')
  await evaluate(cdp, sessionId, `document.querySelector('button[type=submit]').click()`)
  for (let attempt = 0; attempt < 100 && (await state()).calls < 1; attempt += 1) await new Promise((done) => setTimeout(done, 20))
  const ambiguous = await state()
  assert.equal(ambiguous.readOnly, true)
  assert.equal(ambiguous.value, '3000')
  assert.equal(ambiguous.button?.includes('Retry same confirmation'), true)
  assert.equal(ambiguous.calls, 1)
  assert.equal(ambiguous.saleEffects, 1)
  assert.equal(ambiguous.stockEffects, 1)
  await evaluate(cdp, sessionId, `document.querySelector('button[type=submit]').click()`)
  for (let attempt = 0; attempt < 100 && (await state()).calls < 2; attempt += 1) await new Promise((done) => setTimeout(done, 20))
  const next = await state()
  assert.equal(next.calls, 2)
  assert.equal(next.saleEffects, 1)
  assert.equal(next.stockEffects, 1)
  assert.equal(next.value, '')
  assert.equal(next.readOnly, false)
  assert.equal(next.commands[0].id, next.commands[1].id)
  assert.deepEqual(next.commands[0], next.commands[1])

  const evidenceDir = process.env.SHOP_CASH_TENDER_EVIDENCE_DIR
  const evidence = {
    contract: 'supermega.shop.cash-tender-browser.v1',
    source: process.env.SHOP_CASH_TENDER_SOURCE || 'working-tree',
    viewport: { width: 390, height: 844 },
    checks: { invalidEnterFocusedAndPolite: true, blurAssertive: true, shortEnterNoMutation: true, bilingualTenderCopy: true, ambiguousRetryFrozen: true, sameCommand: true, oneSaleEffect: true, oneStockEffect: true, nextActionBlank: true, noHorizontalOverflow: true, completionVisibleWithoutClipping: true },
    screenshots: [
      { file: 'shop-cash-tender-mobile-390x844-fit.png', bytes: fit.byteLength, digest: sha256(fit) },
    ],
  }
  if (evidenceDir) {
    await mkdir(resolve(evidenceDir), { recursive: true })
    await writeFile(resolve(evidenceDir, evidence.screenshots[0].file), fit, { flag: 'wx' })
    await writeFile(resolve(evidenceDir, 'shop-cash-tender-browser.json'), `${JSON.stringify(evidence, null, 2)}\n`, { flag: 'wx' })
  }
  console.log(JSON.stringify({ ok: true, ...evidence }))
} finally {
  if (cdp) await cdp.send('Browser.close', {}, '', 5_000).catch(() => {})
  else if (browser) browser.kill()
  server.closeAllConnections()
  await new Promise((resolveClose) => server.close(resolveClose))
  await rm(scratch, { recursive: true, force: true })
}
