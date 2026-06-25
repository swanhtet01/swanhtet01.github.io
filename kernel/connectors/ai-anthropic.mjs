// Connector: ai — Anthropic (Claude).
// The flagship AI connector — this whole platform is built on Claude (see CLAUDE.md),
// so this is the recommended default. Complements ai-gateway (tiers/retry/cost-caps),
// ai-gemini (Burmese voice + vision), and ai-openai (GPT alternative). Use this for a
// direct, dependency-free Messages API call when you just need Claude text out.
//
// category 'ai' · configured = ANTHROPIC_API_KEY present.
//
// Env:
//   ANTHROPIC_API_KEY  (required)  from console.anthropic.com → API Keys
//   ANTHROPIC_MODEL    (optional)  default 'claude-haiku-4-5-20251001'
//
// Capabilities:
//   complete({ model, system, messages, maxTokens }) -> { ok, text, raw }
//   health()                                         -> { ok, detail }

import { register } from './registry.mjs'

const BASE = 'https://api.anthropic.com/v1'
const VERSION = '2023-06-01'
const apiKey = () => String(process.env.ANTHROPIC_API_KEY || '').trim()
const defaultModel = () => String(process.env.ANTHROPIC_MODEL || '').trim() || 'claude-haiku-4-5-20251001'
const configured = () => Boolean(apiKey())

function headers() {
  return {
    'x-api-key': apiKey(),
    'anthropic-version': VERSION,
    'content-type': 'application/json',
  }
}

/**
 * complete — call Claude's Messages API and return the joined text.
 * @param {object} o
 * @param {string}  [o.model]      default ANTHROPIC_MODEL or 'claude-haiku-4-5-20251001'
 * @param {string}  [o.system]     optional system prompt
 * @param {Array<{role:string,content:string}>|string} [o.messages]  conversation turns; a bare string becomes one user turn
 * @param {number}  [o.maxTokens]  default 1024
 * @param {number}  [o.timeout]    ms, default 10000
 * @returns {Promise<{ ok:boolean, text?:string, raw?:object, reason?:string }>}
 */
export async function complete({ model = defaultModel(), system, messages, maxTokens = 1024, timeout = 10000 } = {}) {
  if (!configured()) return { ok: false, reason: 'anthropic_not_configured' }
  const turns = typeof messages === 'string'
    ? [{ role: 'user', content: messages }]
    : Array.isArray(messages) ? messages : []
  if (!turns.length) return { ok: false, reason: 'anthropic_empty_messages' }

  const body = { model, max_tokens: maxTokens, messages: turns }
  if (system) body.system = system

  try {
    const res = await fetch(`${BASE}/messages`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeout),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      return { ok: false, reason: `anthropic_${res.status}: ${data?.error?.message || ''}`.slice(0, 200) }
    }
    const text = Array.isArray(data?.content)
      ? data.content.filter((b) => b && typeof b.text === 'string').map((b) => b.text).join('')
      : ''
    return { ok: true, text, raw: data }
  } catch (e) {
    return { ok: false, reason: String(e?.message || 'anthropic_error').slice(0, 200) }
  }
}

export const aiAnthropic = {
  key: 'ai-anthropic',
  name: 'Anthropic (Claude)',
  category: 'ai',
  docs: 'kernel/connectors/ai-anthropic.mjs',
  configured,
  async health() {
    if (!configured()) return { ok: false, detail: 'missing ANTHROPIC_API_KEY' }
    try {
      // Cheap auth check: list models costs no tokens.
      const res = await fetch(`${BASE}/models`, {
        method: 'GET',
        headers: { 'x-api-key': apiKey(), 'anthropic-version': VERSION },
        signal: AbortSignal.timeout(8000),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        return { ok: false, detail: `anthropic_${res.status}: ${data?.error?.message || ''}`.slice(0, 160) }
      }
      const models = Array.isArray(data?.data) ? data.data : []
      const first = models[0]?.id
      return { ok: true, detail: first ? `model=${first}` : `models=${models.length}` }
    } catch (e) {
      return { ok: false, detail: String(e?.message || 'anthropic_error').slice(0, 160) }
    }
  },
  complete,
}

register(aiAnthropic)
export default aiAnthropic
