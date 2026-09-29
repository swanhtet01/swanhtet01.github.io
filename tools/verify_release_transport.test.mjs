import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'
const app = await readFile(new URL('./verify_app_release_live.mjs', import.meta.url), 'utf8')
const preview = await readFile(new URL('./verify_public_preview_live.mjs', import.meta.url), 'utf8')
const publicSource = await readFile(new URL('./verify_public_release_live.mjs', import.meta.url), 'utf8')
const extract = (s, start, end) => s.slice(s.indexOf(start), s.indexOf(end))
const appReleasePath = extract(app, 'export function releaseVerificationPath', 'export function verifyCurrentReleaseAssets').replace('export ', '')
const appGet = `${appReleasePath}\n${extract(app, 'async function get(', 'const pages = new Map()')}`

test('app fetch rejects redirects without following another release endpoint', async () => {
  let options
  await assert.rejects(vm.runInNewContext(`${appGet}; get('/__release.json', 1)`, {
    protectedPreview: false, baseUrl: 'https://app.supermega.dev', expectedCommit: '', AbortSignal,
    fetch: async (_, opts) => { options = opts; throw Error('redirect rejected') },
  }), /redirect rejected/)
  assert.equal(options.redirect, 'error')
  assert.equal(options.cache, 'no-store')
  assert.equal(options.headers['cache-control'], 'no-cache')
})

test('protected app and public page CLI reads have deadlines and preserve deployment arguments', async () => {
  for (const [code, invocation] of [[appGet, "get('/__release.json', 1)"], [extract(preview, 'function get(', 'for (const page of manifest.pages)'), "get('/__release.json')"]]) {
    let call
    const value = await vm.runInNewContext(`${code}; ${invocation}`, {
      protectedPreview: true, baseUrl: 'https://candidate.vercel.app', expectedCommit: '', process: {platform:'linux'}, cliEnv:{}, maxAttempts:1,
      execFileSync: (exe,args,options) => { call={exe,args,options};return 'receipt' },
    })
    assert.ok(value)
    assert.equal(call.options.timeout,15000)
    assert.equal(call.options.killSignal,'SIGKILL')
    assert.equal(call.args[call.args.indexOf('--deployment')+1],'https://candidate.vercel.app')
  }
})

test('all deployment inspection calls have the same timeout', () => {
  for (const [source, count] of [[app,2],[preview,3]]) {
    const calls=[...source.matchAll(/maxBuffer: 8 \* 1024 \* 1024, timeout: 15000, killSignal: 'SIGKILL'/g)]
    assert.equal(calls.length,count)
  }
})

test('public content fails redirects while explicit redirect probes remain manual', async () => {
  const code=extract(publicSource,'async function request(', 'async function readPage(')
  const seen=[]
  const context={url:path=>`https://supermega.dev${path}`, timeoutMs:15000, AbortSignal, fetch:async (_,options)=>{seen.push(options.redirect);return {status:200}}}
  await vm.runInNewContext(`${code}; request('/__release.json')`,context)
  await vm.runInNewContext("request('/legacy/', {redirect:'manual'})",context)
  assert.deepEqual(seen,['error','manual'])
})
