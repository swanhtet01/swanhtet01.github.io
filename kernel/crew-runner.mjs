// SUPERMEGA crew runner — loads + validates crew definitions (kernel/crews/*.json).
// A "crew" is the One Factory unit of sale: a fixed cast of roles that turns a defined intake into
// a defined output contract, with a gateway tier pinned per role so cost is decided at design time,
// not at runtime. Schema + conventions: kernel/crews/README.md.
//
// This module is the LOADER — enumeration + validation. Execution lives in crew-run.mjs (runCrew),
// which routes every model call through gateway.complete() with the role's tier and the tenant's
// clientId, never the SDK directly; forging (crew-forge.mjs), installing (crew-install.mjs), and the
// HTTP surface (api/crew.mjs) build on this loader. See crews/README.md for the full loop.

import { readFile, readdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { TIERS } from './gateway.mjs'

const CREWS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'crews')
const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/
const INTAKE_ROLE = 'intake' // every crew starts with the generic INTAKE role

// The legal bright line (SUPERMEGA-MASTER-STRATEGY): any crew that reads a tenant's accounts
// (inbox/chat exports) MUST carry all three flags, set true. Validation refuses the crew otherwise.
export const BRIGHT_LINE_FLAGS = ['own_accounts_only', 'skip_personal', 'read_only']

// Validate a crew definition against the convention. Returns an array of human-readable errors
// (empty = valid). Pure — no I/O — so tests and future tooling can call it on any object.
export function validateCrew(def, { slug } = {}) {
  const errors = []
  const fail = (m) => { errors.push(m) }
  if (!def || typeof def !== 'object' || Array.isArray(def)) return ['crew definition must be a JSON object']
  if (typeof def.slug !== 'string' || !SLUG_RE.test(def.slug)) fail('slug: required, lowercase kebab-case')
  if (slug && def.slug !== slug) fail(`slug: must match the filename ('${slug}')`)
  if (typeof def.name !== 'string' || !def.name.trim()) fail('name: required')
  if (typeof def.description !== 'string' || !def.description.trim()) fail('description: required')
  if (!Number.isInteger(def.version) || def.version < 1) fail('version: positive integer required')
  if (def.plan !== undefined && typeof def.plan !== 'string') fail('plan: string when present')

  // intake — what the crew accepts at the front door
  if (!def.intake || typeof def.intake !== 'object' || Array.isArray(def.intake)) fail('intake: required object { accepts[], description }')
  else {
    if (!Array.isArray(def.intake.accepts) || !def.intake.accepts.length) fail('intake.accepts: non-empty array required')
    if (typeof def.intake.description !== 'string' || !def.intake.description.trim()) fail('intake.description: required')
  }

  // roles — explicit list, tier per role, generic INTAKE role first
  if (!Array.isArray(def.roles) || !def.roles.length) fail('roles: non-empty array required')
  else {
    const ids = new Set()
    def.roles.forEach((r, i) => {
      if (!r || typeof r !== 'object') { fail(`roles[${i}]: object required`); return }
      if (typeof r.id !== 'string' || !SLUG_RE.test(r.id)) fail(`roles[${i}].id: lowercase kebab-case required`)
      else if (ids.has(r.id)) fail(`roles[${i}].id: duplicate '${r.id}'`)
      else ids.add(r.id)
      if (typeof r.title !== 'string' || !r.title.trim()) fail(`roles[${i}].title: required`)
      if (!TIERS[r.tier]) fail(`roles[${i}].tier: must be a gateway tier (${Object.keys(TIERS).join('|')})`)
      if (typeof r.goal !== 'string' || !r.goal.trim()) fail(`roles[${i}].goal: required`)
    })
    if (def.roles[0]?.id !== INTAKE_ROLE) fail(`roles[0]: every crew starts with the generic INTAKE role (id '${INTAKE_ROLE}')`)
  }

  // output contract — what the crew is contractually obliged to emit
  if (!def.output_contract || typeof def.output_contract !== 'object' || Array.isArray(def.output_contract)) fail('output_contract: required object { format, fields[] }')
  else {
    if (typeof def.output_contract.format !== 'string' || !def.output_contract.format.trim()) fail('output_contract.format: required')
    if (!Array.isArray(def.output_contract.fields) || !def.output_contract.fields.length) fail('output_contract.fields: non-empty array required')
  }

  // legal bright line — enforced structurally, not by convention
  if (def.requires_account_access) {
    const p = def.policy || {}
    for (const flag of BRIGHT_LINE_FLAGS) {
      if (p[flag] !== true) fail(`policy.${flag}: must be true for account-reading crews (legal bright line)`)
    }
  }
  return errors
}

// Load one crew by slug. Throws crew_bad_slug / crew_bad_json / crew_invalid (with .errors).
export async function loadCrew(slug) {
  if (typeof slug !== 'string' || !SLUG_RE.test(slug)) throw new Error('crew_bad_slug')
  const raw = await readFile(join(CREWS_DIR, `${slug}.json`), 'utf8')
  let def
  try { def = JSON.parse(raw) } catch { throw new Error(`crew_bad_json: ${slug}`) }
  const errors = validateCrew(def, { slug })
  if (errors.length) {
    const e = new Error(`crew_invalid: ${slug} — ${errors.join('; ')}`)
    e.errors = errors
    throw e
  }
  return def
}

// Enumerate every valid crew in kernel/crews/. A malformed crew is logged and skipped — one bad
// definition never takes down the fleet (same posture as the connector registry).
export async function listCrews() {
  let files = []
  try { files = await readdir(CREWS_DIR) } catch { return [] }
  const out = []
  for (const f of files.filter((n) => n.endsWith('.json')).sort()) {
    const slug = f.slice(0, -'.json'.length)
    try { out.push(await loadCrew(slug)) }
    catch (e) { console.warn(`[crews] skipped ${f} — ${String((e && e.message) || 'load_failed').slice(0, 200)}`) }
  }
  return out
}

export default { loadCrew, listCrews, validateCrew, BRIGHT_LINE_FLAGS }
