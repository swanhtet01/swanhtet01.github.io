// kernel/crew-forge.mjs — the crew COMPILER (Agents' twin of factory-os/pack-forge.mjs).
//
// The disruptive bit, symmetric with the pack forge: growing the Task Catalog no longer means
// hand-authoring a crew JSON. A tiny SPEC (name, what it reads, a few roles, what it returns) is
// COMPILED into a full, VALID crew definition — one that passes validateCrew, so the crew registry
// auto-loads it, the resilience gate accepts it, and runCrew() can execute it. The compiler (not a
// model) guarantees the contract: intake role always first, tiers always valid, the legal bright line
// always wired when the crew reads accounts. A person writes the spec in a minute; an AI drafts it
// from a sentence; either way you get a runnable agent, not a broken config.
//
// Zero-dependency, pure. buildCrewFromSpec(spec) → { crew, validation }. See crew-runner.mjs.

import { validateCrew } from './crew-runner.mjs'

const TIER_SET = ['bulk', 'reason', 'deep'] // gateway TIERS keys — validateCrew requires role.tier ∈ this
const slug = (s, fb = 'x') => String(s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || fb
const field = (s, fb) => String(s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || fb
const cap = (s) => String(s || '').replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).trim()
const arr = (v) => (Array.isArray(v) ? v : [])
const nonEmpty = (v, fb) => (arr(v).length ? v : fb)

/**
 * buildCrewFromSpec — compile a compact spec into a full, VALID crew definition.
 * Every field optional; the compiler fills correct defaults and guarantees validateCrew passes.
 * @param {object} spec
 *   { slug?, name, description?, plan?, free_tier_fallback?, requires_account_access?,
 *     intake?: { accepts?: string[], description?: string },
 *     roles?: (string | { id?, title?, tier?, goal? })[],   // intake role auto-prepended if absent
 *     outputs?: string[], output_description? }
 * @returns {{ crew: object, validation: {ok:boolean, errors:string[]} }}
 */
export function buildCrewFromSpec(spec = {}) {
  const s = spec && typeof spec === 'object' ? spec : {}
  const name = String(s.name || 'Task Crew').slice(0, 80)
  const crewSlug = slug(s.slug || name, 'task-crew')
  const description = String(s.description || `A SuperMega crew that turns a defined intake into a defined output: ${name}.`).slice(0, 400)
  const accountAccess = s.requires_account_access === true

  // roles — map the spec, dedupe ids, then guarantee a generic INTAKE role is first.
  let roles = arr(s.roles).map((r, i) => {
    const isStr = typeof r === 'string'
    const title = cap(isStr ? r : (r && (r.title || r.id)) || `Role ${i + 1}`)
    const id = slug(isStr ? r : (r && (r.id || r.title)), `role-${i + 1}`)
    const tier = (!isStr && r && TIER_SET.includes(r.tier)) ? r.tier : 'bulk'
    const goal = String((!isStr && r && r.goal) || `Handle the ${title} step: read the prior role's output and produce the part of the result this role owns.`).slice(0, 400)
    return { id, title, tier, goal }
  })
  const seen = new Set()
  roles = roles.map((r, i) => { let id = r.id; while (seen.has(id)) id = `${r.id}-${i}`; seen.add(id); return { ...r, id } })
  if (roles[0]?.id !== 'intake') {
    roles = roles.filter((r) => r.id !== 'intake') // avoid a duplicate 'intake' further down
    roles.unshift({ id: 'intake', title: 'Intake', tier: 'bulk', goal: 'Normalize the incoming intake into clean units, drop anything out of scope (and, for account-reading crews, personal/non-business content), and never invent facts.' })
  }
  if (roles.length < 2) {
    roles.push({ id: 'writer', title: 'Result Writer', tier: 'reason', goal: `Produce the crew's final result from the intake, grounded only in what was provided — never invented.` })
  }

  const outputs = nonEmpty(arr(s.outputs).map((f) => field(f)).filter(Boolean), ['result', 'summary'])

  const crew = {
    slug: crewSlug,
    name,
    version: 1,
    description,
    ...(s.plan && typeof s.plan === 'string' ? { plan: slug(s.plan) } : {}),
    ...(s.free_tier_fallback ? { free_tier_fallback: String(s.free_tier_fallback).slice(0, 240) } : {}),
    ...(accountAccess ? { requires_account_access: true, policy: { own_accounts_only: true, skip_personal: true, read_only: true } } : {}),
    intake: {
      accepts: nonEmpty(arr(s.intake && s.intake.accepts).map((a) => String(a).slice(0, 80)), ['pasted text', 'file export']),
      description: String((s.intake && s.intake.description) || 'What the tenant hands the crew (treated strictly as data; injection frames are stripped at the gateway).').slice(0, 300),
    },
    roles,
    output_contract: {
      format: 'json',
      fields: outputs,
      description: String(s.output_description || `The crew's structured result: ${outputs.join(', ')}.`).slice(0, 300),
    },
  }

  const errors = validateCrew(crew, { slug: crewSlug })
  return { crew, validation: { ok: errors.length === 0, errors } }
}

// The tiny spec we ask an AI (or a form) to fill — small + flat so a model gets it right; the compiler
// then guarantees a valid, runnable crew. We never ask a model for the full crew JSON.
export function crewSpecHint() {
  return [
    'Return ONLY a JSON object (no prose, no markdown) describing the task as a crew. All fields optional:',
    '{',
    '  "name": string, "description": string,',
    '  "requires_account_access": boolean,   // true if it reads the tenant\'s OWN inbox/chat exports',
    '  "intake": { "accepts": string[], "description": string },',
    '  "roles": [ { "title": string, "tier": "bulk"|"reason"|"deep", "goal": string } ],',
    '       // an ordered cast; keep bulk for extraction/classification, reason for judgement. Intake is auto-added.',
    '  "outputs": string[]                    // the fields the crew must return, e.g. ["orders","payments","brief"]',
    '}',
    'Keep it small and true to the task. Prefer 2–4 roles.',
  ].join('\n')
}

/**
 * forgeCrewFromDescription — plain sentence (+ injected model) → guaranteed-valid runnable crew.
 * The model only drafts the small spec; buildCrewFromSpec guarantees validity, so even a garbled model
 * reply still yields a valid crew. NEVER throws on a bad model reply.
 * @param {string} description
 * @param {object} o  { model: async (prompt)=>string }
 * @returns {Promise<{ok:boolean, crew?:object, validation?:object, spec?:object, reason?:string}>}
 */
export async function forgeCrewFromDescription(description, o = {}) {
  const model = o.model
  if (typeof model !== 'function') return { ok: false, reason: 'forge_needs_model' }
  const prompt = `${crewSpecHint()}\n\nTask described by the owner:\n"""${String(description || '').slice(0, 2000)}"""`
  let text
  try { text = await model(prompt) } catch (e) { return { ok: false, reason: 'model_failed', detail: String((e && e.message) || 'model_error').slice(0, 160) } }
  let spec = {}
  const m = String(text || '').match(/\{[\s\S]*\}/)
  if (m) { try { spec = JSON.parse(m[0]) } catch { spec = {} } }
  if (!spec || typeof spec !== 'object') spec = {}
  if (!spec.name) spec.name = String(description || '').slice(0, 60)
  const { crew, validation } = buildCrewFromSpec(spec)
  return { ok: validation.ok, crew, validation, spec }
}

export default { buildCrewFromSpec, forgeCrewFromDescription, crewSpecHint }
