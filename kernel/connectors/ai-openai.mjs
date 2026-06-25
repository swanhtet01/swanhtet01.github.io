// Connector: ai — OpenAI (GPT-4o, GPT-4o-mini, o-series).
// Allows workflows to call OpenAI models as an alternative or complement to Claude.
// Useful for clients who already have an OpenAI key, or for cost-triage (mini for bulk).
//
// category 'ai' · configured = OPENAI_API_KEY present.
//
// Env:
//   OPENAI_API_KEY   (required)  from platform.openai.com/api-keys
//   OPENAI_ORG_ID    (optional)  organization ID for org-scoped billing
//
// Capabilities:
//   chat(messages, opts)   -> { ok, text, usage, model }
//   health()               -> { ok, detail }

import { register } from './registry.mjs'

const BASE = 'https://api.openai.com/v1'
const apiKey = () => String(process.env.OPENAI_API_KEY || '').trim()
const orgId = () => String(process.env.OPENAI_ORG_ID || '').trim()
const configured = () => Boolean(apiKey())

function headers() {
  const h = {
    Authorization: `Bearer ${apiKey()}`,
    'Content-Type': 'application/json',
  }
  const org = orgId()
  if (org) h['OpenAI-Organization'] = org
  return h
}

/**
 * chat — send a messages array to an OpenAI chat-completion model.
 * @param {Array<{role:string,content:string}>} messages  conversation turns
 * @param {object} [opts]
 * @param {string}  [opts.model]      default 'gpt-4o-mini'
 * @param {number}  [opts.maxTokens]  default 1024
 * @param {number}  [opts.temperature]
 * @param {number}  [opts.timeout]    ms, default 20000
 * @returns {Promise<{ ok:boolean, text:string, usage:object, model:string, reason?:string }>}
 */
export async function chat(messages, { model = 'gpt-4o-mini', maxTokens = 1024, temperature, timeout = 20000 } = {}) {
  if (!configured()) return { ok: false, reason: 'openai_not_configured' }
  if (!Array.isArray(messages) || !messages.length) return { ok: false, reason: 'openai_empty_messages' }

  const body = {
    model,
    messages,
    max_completion_tokens: maxTokens,
  }
  if (typeof temperature === 'number') body.temperature = temperature

  try {
    const res = await fetch(`${BASE}/chat/completions`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeout),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      return {
        ok: false,
        reason: `openai_${res.status}: ${data?.error?.message || ''}`.slice(0, 200),
      }
    }
    const text = data?.choices?.[0]?.message?.content || ''
    return { ok: true, text, usage: data?.usage || {}, model: data?.model || model }
  } catch (e) {
    return { ok: false, reason: String(e?.message || 'openai_error').slice(0, 200) }
  }
}

export const aiOpenai = {
  key: 'ai-openai',
  name: 'OpenAI (GPT)',
  category: 'ai',
  docs: 'kernel/connectors/ai-openai.mjs',
  configured,
  async health() {
    if (!configured()) return { ok: false, detail: 'missing OPENAI_API_KEY' }
    const result = await chat([{ role: 'user', content: 'ping' }], { model: 'gpt-4o-mini', maxTokens: 5, timeout: 10000 })
    return result.ok
      ? { ok: true, detail: `model=${result.model}` }
      : { ok: false, detail: result.reason }
  },
  chat,
}

register(aiOpenai)
export default aiOpenai
