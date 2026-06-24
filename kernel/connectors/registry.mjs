// SUPERMEGA connector framework — one registry in front of every integration.
//
// Why this exists: adding a new payment processor, messaging channel, data store, or AI
// provider should be "write one adapter + register() it" — NOT editing handlers across
// repos. Every connector implements the same tiny interface, so the CEO console can list
// them, group them by category, and health-check them all from a single endpoint.
//
// This file is additive. It does not touch gateway.mjs / store.mjs — the adapters WRAP them.
// Zero dependencies (matches gateway.mjs / store.mjs). ESM. See ../../PLATFORM.md.

/**
 * @typedef {'payment'|'messaging'|'data'|'ai'} ConnectorCategory
 *
 * @typedef {object} Connector
 * @property {string} key                 stable id, e.g. 'payment-stripe' (unique in the registry)
 * @property {string} name                human label, e.g. 'Stripe'
 * @property {ConnectorCategory} category one of the four lanes
 * @property {() => boolean} configured   true when the env/credentials needed are present
 * @property {() => Promise<{ok:boolean, detail?:string}>} health  cheap liveness probe
 * @property {string} [docs]              optional pointer to where the real impl lives
 */

export const CATEGORIES = ['payment', 'messaging', 'data', 'ai']

const registry = new Map() // key -> Connector

/** Validate the minimal shape so a malformed adapter fails loudly at register-time, not in prod. */
function assertConnector(c) {
  if (!c || typeof c !== 'object') throw new Error('connector_must_be_object')
  if (!c.key || typeof c.key !== 'string') throw new Error('connector_missing_key')
  if (!c.name || typeof c.name !== 'string') throw new Error(`connector_missing_name: ${c.key}`)
  if (!CATEGORIES.includes(c.category)) throw new Error(`connector_bad_category: ${c.key} (${c.category})`)
  if (typeof c.configured !== 'function') throw new Error(`connector_missing_configured: ${c.key}`)
  if (typeof c.health !== 'function') throw new Error(`connector_missing_health: ${c.key}`)
}

/**
 * register — add a connector. Idempotent on key (re-registering replaces, so hot-reload is safe).
 * @param {Connector} connector
 * @returns {Connector}
 */
export function register(connector) {
  assertConnector(connector)
  registry.set(connector.key, connector)
  return connector
}

/** list — every registered connector (config-only metadata, no health probe). */
export function list() {
  return [...registry.values()].map((c) => ({
    key: c.key,
    name: c.name,
    category: c.category,
    configured: safeBool(c),
    docs: c.docs || null,
  }))
}

/** byCategory — connectors in one lane. */
export function byCategory(cat) {
  return list().filter((c) => c.category === cat)
}

/** get — the raw connector by key (so callers can use its capabilities, e.g. createCheckout). */
export function get(key) {
  return registry.get(key) || null
}

function safeBool(c) {
  try { return Boolean(c.configured()) } catch { return false }
}

// A health probe must never hang the whole page — cap each one.
async function probe(c, timeoutMs) {
  const base = { key: c.key, name: c.name, category: c.category, docs: c.docs || null }
  let configured
  try { configured = Boolean(c.configured()) } catch { configured = false }
  base.configured = configured
  if (!configured) return { ...base, ok: false, detail: 'not_configured' }
  try {
    const r = await Promise.race([
      Promise.resolve().then(() => c.health()),
      new Promise((_, rej) => setTimeout(() => rej(new Error('health_timeout')), timeoutMs)),
    ])
    return { ...base, ok: Boolean(r && r.ok), detail: (r && r.detail) || (r && r.ok ? 'ok' : 'unhealthy') }
  } catch (e) {
    return { ...base, ok: false, detail: String((e && e.message) || 'health_error').slice(0, 160) }
  }
}

/**
 * healthAll — probe every connector in parallel. Each probe is isolated + time-capped, so one
 * dead integration can't break the page. Returns a console-ready summary.
 * @param {object} [o]
 * @param {number} [o.timeoutMs=4000] per-connector probe ceiling
 * @returns {Promise<{ok:boolean, counts:object, byCategory:object, connectors:Array}>}
 */
export async function healthAll({ timeoutMs = 4000 } = {}) {
  const all = [...registry.values()]
  const connectors = await Promise.all(all.map((c) => probe(c, timeoutMs)))
  const counts = {
    total: connectors.length,
    configured: connectors.filter((c) => c.configured).length,
    healthy: connectors.filter((c) => c.ok).length,
  }
  const byCat = {}
  for (const cat of CATEGORIES) {
    const inCat = connectors.filter((c) => c.category === cat)
    byCat[cat] = { total: inCat.length, configured: inCat.filter((c) => c.configured).length, healthy: inCat.filter((c) => c.ok).length }
  }
  // ok = every CONFIGURED connector is healthy. Unconfigured ones are expected (not yet wired).
  const ok = connectors.filter((c) => c.configured).every((c) => c.ok)
  return { ok, counts, byCategory: byCat, connectors }
}

export default { CATEGORIES, register, list, byCategory, get, healthAll }
