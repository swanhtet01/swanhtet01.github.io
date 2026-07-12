// Connector: ai — Google Vertex AI (Gemini) via REST, service-account auth (no SDK).
//
// This is the SAME backbone the live demo funnel uses as its PRIMARY provider (api/ai.js,
// api/lead.js): Vertex is production-grade and region-pinned (not geo-blocked / not the
// consumer AI-Studio quota), so it's the right default for server-side generation. This
// connector brings that capability into the kernel registry so any kernel code / app view
// can call it and the console can health-check it.
//
// Auth: reuses _google-auth.mjs (signs an RS256 service-account JWT, exchanges for an OAuth2
// token with the cloud-platform scope, caches it). Needs a SERVICE ACCOUNT (not OAuth user
// creds) because Vertex is addressed by GCP project + location.
//
// Env:
//   GOOGLE_SERVICE_ACCOUNT_JSON   (required*) full service-account JSON (string or base64), OR
//   GOOGLE_APPLICATION_CREDENTIALS(required*) path to that JSON file   (* one of the two)
//     The SA must have the "Vertex AI User" role (roles/aiplatform.user) on the project.
//   VERTEX_PROJECT_ID / GCP_PROJECT_ID  (optional) project override; defaults to the SA's project_id
//   VERTEX_LOCATION  (optional, default us-central1)  the regional endpoint
//   VERTEX_MODEL     (optional, default gemini-2.5-flash)
//
// Capability beyond the interface:
//   generate({ prompt, model?, media?, system?, maxTokens?, temperature? }) -> { ok, text }

import { register } from './registry.mjs'
import { saConfigured, readServiceAccount, getAccessToken } from './_google-auth.mjs'

const SCOPES = ['https://www.googleapis.com/auth/cloud-platform']
const TIMEOUT = 30000

const LOCATION = () => String(process.env.VERTEX_LOCATION || 'us-central1').trim()
const MODEL = () => String(process.env.VERTEX_MODEL || 'gemini-2.5-flash').trim()

// Project comes from an explicit env override, else the service account's own project_id.
function project() {
  const env = String(process.env.VERTEX_PROJECT_ID || process.env.GCP_PROJECT_ID || '').trim()
  if (env) return env
  try { const sa = readServiceAccount(); return sa && sa.project_id ? String(sa.project_id) : '' } catch { return '' }
}

const configured = () => saConfigured() && Boolean(project())

/**
 * generate — text or multimodal content generation via Vertex generateContent.
 * @param {object} o
 * @param {string}  o.prompt
 * @param {string}  [o.model]                    defaults to VERTEX_MODEL
 * @param {Array<{b64:string, mime:string}>} [o.media]  inline media parts (images, audio)
 * @param {string}  [o.system]                   optional system instruction
 * @param {number}  [o.maxTokens=1024]
 * @param {number}  [o.temperature=0.2]
 * @returns {Promise<{ok:boolean, text?:string, model?:string, reason?:string}>}
 */
export async function generate(_input = {}) {
  const { prompt, model = MODEL(), media = [], system, maxTokens = 1024, temperature = 0.2 } = _input || {}
  if (!configured()) return { ok: false, reason: 'vertex_not_configured' }
  if (!prompt && !(Array.isArray(media) && media.length)) return { ok: false, reason: 'vertex_no_prompt' }
  try {
    const token = await getAccessToken(SCOPES)
    const parts = []
    for (const m of (Array.isArray(media) ? media : [])) {
      if (m && m.b64 && m.mime) parts.push({ inlineData: { mimeType: m.mime, data: m.b64 } })
    }
    if (prompt) parts.push({ text: String(prompt) })

    const body = { contents: [{ role: 'user', parts }], generationConfig: { maxOutputTokens: maxTokens, temperature } }
    if (system) body.systemInstruction = { parts: [{ text: String(system) }] }

    const url = `https://${LOCATION()}-aiplatform.googleapis.com/v1/projects/${project()}/locations/${LOCATION()}/publishers/google/models/${model}:generateContent`
    const res = await fetch(url, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'user-agent': 'supermega-kernel/1.0' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, reason: `vertex_${res.status}: ${(json.error?.message || '').slice(0, 120)}` }
    const text = (json.candidates?.[0]?.content?.parts || []).map((p) => (p && p.text) || '').join('')
    return { ok: true, text, model }
  } catch (err) {
    return { ok: false, reason: String((err && err.message) || 'vertex_error').slice(0, 160) }
  }
}

export const aiVertex = {
  key: 'ai-vertex',
  name: 'Google Vertex AI (Gemini)',
  category: 'ai',
  docs: 'kernel/connectors/ai-vertex.mjs',
  configured,
  // Cheap probe: mint a cloud-platform access token (proves the SA parses + Google accepts the JWT)
  // WITHOUT spending on inference. Reports the project/location/model it would target.
  async health() {
    if (!saConfigured()) return { ok: false, detail: 'missing GOOGLE_SERVICE_ACCOUNT_JSON / GOOGLE_APPLICATION_CREDENTIALS (service account required for Vertex)' }
    if (!project()) return { ok: false, detail: 'no project id (set VERTEX_PROJECT_ID or use a SA JSON with project_id)' }
    try {
      await getAccessToken(SCOPES)
      return { ok: true, detail: `auth ok (project=${project()}, ${LOCATION()}, ${MODEL()})` }
    } catch (e) {
      return { ok: false, detail: String((e && e.message) || 'vertex_auth_error').slice(0, 160) }
    }
  },
  generate,
}

register(aiVertex)
export default aiVertex
