// AI gateway — multi-provider failover chain selection. `node --test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'

const KEYS = ['ANTHROPIC_API_KEY', 'CLAUDE_API_KEY', 'OPENROUTER_API_KEY', 'SUPERMEGA_AI_PROVIDER_POLICY', 'SUPERMEGA_OLLAMA_ENABLED', 'SUPERMEGA_OLLAMA_MODEL', 'VERCEL']
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]))
const clearKeys = () => { for (const k of KEYS) delete process.env[k] }
const restore = () => { for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k] } }

const { providerChain, providerPolicy, complete } = await import('./gateway.mjs')

test('providerChain is additive — reflects which API keys are configured', () => {
  clearKeys()
  assert.deepEqual(providerChain().map((p) => p.name), [], 'no keys → no providers')
  process.env.ANTHROPIC_API_KEY = 'sk-ant-test'
  assert.deepEqual(providerChain().map((p) => p.name), ['anthropic'], 'anthropic only when only its key is set (no regression)')
  process.env.OPENROUTER_API_KEY = 'sk-or-test'
  assert.deepEqual(providerChain().map((p) => p.name), ['anthropic', 'openrouter'], 'openrouter joins as failover when its key is set')
  process.env.SUPERMEGA_OLLAMA_ENABLED = '1'
  assert.deepEqual(providerChain().map((p) => p.name), ['anthropic', 'openrouter'], 'local inference requires an explicit valid model')
  process.env.SUPERMEGA_OLLAMA_MODEL = 'qwen3.5:0.8b'
  assert.deepEqual(providerChain().map((p) => p.name), ['ollama-local', 'anthropic', 'openrouter'], 'explicit local inference is first to avoid paid work')
  process.env.VERCEL = '1'
  assert.deepEqual(providerChain().map((p) => p.name), ['anthropic', 'openrouter'], 'hosted runtimes never admit the loopback provider')
  restore()
})

test('complete() fails clearly when no provider key is configured', async () => {
  clearKeys()
  await assert.rejects(
    () => complete({ system: 'x', messages: [{ role: 'user', content: 'hi' }] }),
    /gateway_missing_api_key/,
  )
  restore()
})

test('local-only policy never falls through to paid providers', async () => {
  clearKeys()
  process.env.ANTHROPIC_API_KEY = 'sk-ant-test'
  process.env.OPENROUTER_API_KEY = 'sk-or-test'
  process.env.SUPERMEGA_AI_PROVIDER_POLICY = 'local-only'
  assert.equal(providerPolicy(), 'local-only')
  assert.deepEqual(providerChain().map((provider) => provider.name), [])
  await assert.rejects(
    () => complete({ system: 'x', messages: [{ role: 'user', content: 'hi' }] }),
    /gateway_local_provider_unavailable/,
  )
  process.env.SUPERMEGA_OLLAMA_ENABLED = '1'
  process.env.SUPERMEGA_OLLAMA_MODEL = 'qwen3.5:0.8b'
  assert.deepEqual(providerChain().map((provider) => provider.name), ['ollama-local'])
  process.env.SUPERMEGA_AI_PROVIDER_POLICY = 'unexpected'
  assert.equal(providerPolicy(), 'invalid')
  assert.deepEqual(providerChain().map((provider) => provider.name), [])
  await assert.rejects(
    () => complete({ system: 'x', messages: [{ role: 'user', content: 'hi' }] }),
    /gateway_provider_policy_invalid/,
  )
  restore()
})

test('local Ollama is loopback-only, single-attempt, structured-capable, and scale-to-zero', async () => {
  clearKeys()
  process.env.SUPERMEGA_OLLAMA_ENABLED = '1'
  process.env.SUPERMEGA_OLLAMA_MODEL = 'qwen3.5:0.8b'
  const originalFetch = globalThis.fetch
  const requests = []
  try {
    globalThis.fetch = async (url, options) => {
      const body = JSON.parse(options.body)
      requests.push({ url: String(url), options, body })
      const content = body.format ? JSON.stringify({ decision: 'hold' }) : 'local answer'
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ done: true, message: { content }, prompt_eval_count: 12, eval_count: 4 }),
      }
    }
    const plain = await complete({ system: 'bounded system', messages: [{ role: 'user', content: 'hello' }], tier: 'bulk', maxTokens: 16, cacheKey: 'ollama-local-plain' })
    assert.equal(plain.text, 'local answer')
    assert.equal(plain.provider, 'ollama-local')
    assert.equal(plain.model, 'qwen3.5:0.8b')
    assert.deepEqual(plain.usage, { input_tokens: 12, output_tokens: 4 })
    const structured = await complete({
      system: 'bounded system',
      messages: [{ role: 'user', content: 'decide' }],
      schema: { type: 'object', properties: { decision: { type: 'string' } }, required: ['decision'], additionalProperties: false },
      tier: 'bulk',
      maxTokens: 16,
      cacheKey: 'ollama-local-structured',
    })
    assert.deepEqual(structured.data, { decision: 'hold' })
    assert.equal(requests.length, 2)
    for (const request of requests) {
      assert.equal(request.url, 'http://127.0.0.1:11434/api/chat')
      assert.equal(request.options.redirect, 'error')
      assert.equal(request.body.stream, false)
      assert.equal(request.body.think, false)
      assert.equal(request.body.keep_alive, 0)
      assert.equal(request.body.options.num_predict, 16)
    }
  } finally {
    globalThis.fetch = originalFetch
    restore()
  }
})

test('local Ollama rejects invalid models and fails one bounded attempt on hostile responses', async () => {
  clearKeys()
  process.env.SUPERMEGA_OLLAMA_ENABLED = '1'
  process.env.SUPERMEGA_OLLAMA_MODEL = '../invalid model'
  assert.deepEqual(providerChain().map((provider) => provider.name), [])
  process.env.SUPERMEGA_OLLAMA_MODEL = 'qwen3.5:0.8b'
  const originalFetch = globalThis.fetch
  let fetchCalls = 0
  try {
    globalThis.fetch = async () => {
      fetchCalls += 1
      return { ok: false, status: 503, text: async () => 'hostile local service detail' }
    }
    await assert.rejects(
      complete({ system: 'x', messages: [{ role: 'user', content: 'y' }], tier: 'bulk', maxTokens: 8, cacheKey: 'ollama-local-503' }),
      (error) => {
        assert.match(error.message, /ollama-local_503/)
        assert.equal(error.detail, '', 'local service response details are never retained')
        return true
      },
    )
    assert.equal(fetchCalls, 1, 'local inference never retries on this constrained host')

    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ done: true, message: { content: 'x'.repeat(1024 * 1024) }, prompt_eval_count: 1, eval_count: 1 }),
    })
    await assert.rejects(
      complete({ system: 'x', messages: [{ role: 'user', content: 'oversized' }], tier: 'bulk', maxTokens: 8, cacheKey: 'ollama-local-oversized' }),
      /ollama_local_response_too_large/,
    )

    let streamCancelled = false
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      body: {
        getReader: () => ({
          read: async () => ({ done: false, value: new Uint8Array((1024 * 1024) + 1) }),
          cancel: async () => { streamCancelled = true },
        }),
      },
    })
    await assert.rejects(
      complete({ system: 'x', messages: [{ role: 'user', content: 'oversized stream' }], tier: 'bulk', maxTokens: 8, cacheKey: 'ollama-local-oversized-stream' }),
      /ollama_local_response_too_large/,
    )
    assert.equal(streamCancelled, true, 'oversized local response streams are cancelled immediately')

    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ done: true, message: { content: '[]' }, prompt_eval_count: 1, eval_count: 1 }),
    })
    await assert.rejects(
      complete({ system: 'x', messages: [{ role: 'user', content: 'structured' }], schema: { type: 'object' }, tier: 'bulk', maxTokens: 8, cacheKey: 'ollama-local-bad-structured' }),
      /gateway_bad_tool_json/,
    )
  } finally {
    globalThis.fetch = originalFetch
    restore()
  }
})
