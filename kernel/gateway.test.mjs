// AI gateway — multi-provider failover chain selection. `node --test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'

const KEYS = ['ANTHROPIC_API_KEY', 'CLAUDE_API_KEY', 'OPENROUTER_API_KEY']
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]))
const clearKeys = () => { for (const k of KEYS) delete process.env[k] }
const restore = () => { for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k] } }

const { providerChain, complete } = await import('./gateway.mjs')

test('providerChain is additive — reflects which API keys are configured', () => {
  clearKeys()
  assert.deepEqual(providerChain().map((p) => p.name), [], 'no keys → no providers')
  process.env.ANTHROPIC_API_KEY = 'sk-ant-test'
  assert.deepEqual(providerChain().map((p) => p.name), ['anthropic'], 'anthropic only when only its key is set (no regression)')
  process.env.OPENROUTER_API_KEY = 'sk-or-test'
  assert.deepEqual(providerChain().map((p) => p.name), ['anthropic', 'openrouter'], 'openrouter joins as failover when its key is set')
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
