// Connector: ai — Google Gemini via REST (no SDK dependency).
//
// Wraps the Gemini generateContent + transcribeAudio endpoints used across
// the YTF app for Burmese voice transcription and multimodal extraction.
// Exposes a connector shape so the integration console can show Gemini health.
//
// Env:
//   GEMINI_API_KEY  (required)  Google AI Studio key → aistudio.google.com/apikey
//
// Models used:
//   gemini-1.5-flash    — fast multimodal (text + vision), default
//   gemini-1.5-pro      — high quality for long audio/complex extraction
//
// Key capability already in production (ytf-app/api/ocr.js, viber-webhook.js):
//   transcribeAudio(base64, mimeType) — Burmese voice → text in <8s

import { register } from './registry.mjs'

const API_KEY   = () => String(process.env.GEMINI_API_KEY || '').trim()
const configured = () => Boolean(API_KEY())
const BASE      = 'https://generativelanguage.googleapis.com/v1beta/models'
const TIMEOUT   = 30000

/**
 * generate — text or multimodal content generation.
 * @param {object} o
 * @param {string}              o.prompt
 * @param {string}              [o.model='gemini-1.5-flash']
 * @param {Array<{b64:string, mime:string}>} [o.media]  inline media parts (images, audio)
 * @param {number}              [o.maxTokens=1024]
 * @param {number}              [o.temperature=0.2]
 * @returns {Promise<{ok:boolean, text?:string, reason?:string}>}
 */
export async function generate({ prompt, model = 'gemini-1.5-flash', media = [], maxTokens = 1024, temperature = 0.2 } = {}) {
  if (!configured()) return { ok: false, reason: 'gemini_not_configured' }
  try {
    const parts = []
    for (const m of media) {
      parts.push({ inline_data: { mime_type: m.mime, data: m.b64 } })
    }
    parts.push({ text: prompt })

    const body = {
      contents: [{ parts }],
      generationConfig: { maxOutputTokens: maxTokens, temperature },
    }

    const res = await fetch(`${BASE}/${model}:generateContent?key=${API_KEY()}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      return { ok: false, reason: `gemini_${res.status}: ${(json.error?.message || '').slice(0, 120)}` }
    }
    const text = json.candidates?.[0]?.content?.parts?.[0]?.text || ''
    return { ok: true, text }
  } catch (err) {
    return { ok: false, reason: String(err.message).slice(0, 160) }
  }
}

/**
 * transcribeAudio — transcribe audio bytes to text (optimised for Burmese).
 * @param {object} o
 * @param {string} o.b64       base64-encoded audio
 * @param {string} o.mimeType  e.g. 'audio/ogg', 'audio/mpeg', 'audio/mp4'
 * @param {string} [o.hint]    language hint appended to the prompt, e.g. 'Burmese (Myanmar)'
 * @returns {Promise<{ok:boolean, text?:string, reason?:string}>}
 */
export async function transcribeAudio({ b64, mimeType, hint = 'Burmese (Myanmar) or English' } = {}) {
  if (!b64 || !mimeType) return { ok: false, reason: 'gemini_transcribe_missing_audio' }
  return generate({
    model: 'gemini-1.5-pro',
    prompt: `Transcribe this audio accurately. Language: ${hint}. Return only the transcription, no commentary.`,
    media: [{ b64, mime: mimeType }],
    maxTokens: 2048,
    temperature: 0,
  })
}

/**
 * extractFromImage — extract structured data from an image (factory whiteboard, QC sheet, etc).
 * @param {object} o
 * @param {string} o.b64          base64-encoded image
 * @param {string} [o.mimeType]   default 'image/jpeg'
 * @param {string} [o.prompt]     what to extract (defaults to 5W1H factory template)
 * @returns {Promise<{ok:boolean, text?:string, reason?:string}>}
 */
export async function extractFromImage({ b64, mimeType = 'image/jpeg', prompt } = {}) {
  const defaultPrompt = `Read this factory image (whiteboard, form, or document).
Extract: what happened, where, who is responsible, when, and any numbers.
Return a JSON object with keys: what, where, who, when, numbers (array of {label,value,unit}), notes.
If this is a production board, include output_count and any defect counts.`
  return generate({
    model: 'gemini-1.5-flash',
    prompt: prompt || defaultPrompt,
    media: [{ b64, mime: mimeType }],
    maxTokens: 1024,
    temperature: 0.1,
  })
}

// ─── connector object ────────────────────────────────────────────────────────

export const aiGemini = {
  key:      'ai-gemini',
  name:     'Google Gemini',
  category: 'ai',
  docs:     'kernel/connectors/ai-gemini.mjs',
  configured,
  async health() {
    if (!configured()) return { ok: false, detail: 'missing GEMINI_API_KEY' }
    // Cheap ping: 1-token generation
    const r = await generate({ prompt: 'hi', maxTokens: 1 })
    if (!r.ok) return { ok: false, detail: r.reason }
    return { ok: true, detail: 'gemini-1.5-flash responding' }
  },
  generate,
  transcribeAudio,
  extractFromImage,
}

register(aiGemini)
export default aiGemini
