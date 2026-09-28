import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'
const source = await readFile(new URL('./verify_coordinated_release_live.mjs', import.meta.url), 'utf8')
const extract = (start, end) => source.slice(source.indexOf(start), source.indexOf(end))
const assertion = (condition, code) => { if (!condition) throw new Error(code) }

test('release origins accept HTTPS roots and reject credentials, paths, queries and fragments', () => {
  const code = extract('function releaseBaseUrl(', 'function releaseIdentity(')
  for (const input of ['https://app.supermega.dev', 'https://candidate.vercel.app/']) {
    assert.equal(vm.runInNewContext(`${code}; releaseBaseUrl(input)`, { URL, input, assert: assertion }), new URL(input).origin)
  }
  for (const input of ['http://app.supermega.dev', 'not a url', 'https://user:password@app.supermega.dev', 'https://app.supermega.dev/nested', 'https://app.supermega.dev/?token=private', 'https://app.supermega.dev/#private']) {
    assert.throws(() => vm.runInNewContext(`${code}; releaseBaseUrl(input)`, { URL, input, assert: assertion }), /invalid_release_origin/)
  }
})

test('public receipt transport fails redirects and uses its deadline', async () => {
  const code = extract('async function readPublicRelease(', 'async function readRelease(')
  let request
  const context = { URL, timeoutMs: 4321, assert: assertion,
    AbortSignal: { timeout: ms => ({ deadline: ms }) },
    fetch: async (url, options) => { request = { url: String(url), options }; throw Error('redirect rejected') },
  }
  await assert.rejects(vm.runInNewContext(`${code}; readPublicRelease('https://app.supermega.dev')`, context), /redirect rejected/)
  assert.equal(request.url, 'https://app.supermega.dev/__release.json')
  assert.equal(request.options.redirect, 'error')
  assert.equal(request.options.signal.deadline, 4321)
})

test('protected receipt transport bounds the CLI and retains project scope', () => {
  const code = extract('function readProtectedRelease(', 'async function readPublicRelease(')
  let call
  const context = { process: { platform: 'linux' }, timeoutMs: 4321, cliEnv: { VERCEL_TOKEN: 'test-only' },
    execFileSync: (executable, args, options) => { call = { executable, args, options }; return '{"service":"supermega-app"}' },
    describeCliFailure: () => 'bounded failure',
  }
  vm.runInNewContext(`${code}; readProtectedRelease('https://candidate.vercel.app', 'project-test')`, context)
  assert.equal(call.options.timeout, 4321)
  assert.equal(call.options.killSignal, 'SIGKILL')
  assert.equal(call.options.env.VERCEL_PROJECT_ID, 'project-test')
  assert.equal(call.args.includes('test-only'), false)
  assert.equal(call.args[call.args.indexOf('--deployment') + 1], 'https://candidate.vercel.app')
})
