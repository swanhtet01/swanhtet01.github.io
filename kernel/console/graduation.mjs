// SUPERMEGA console — auto-graduation flywheel.
// The moat rule: "the 3rd time a client asks for the same thing, it graduates to a product."
// This is the piece that makes that AUTONOMOUS instead of a manual 'Add' button:
//  - on every saved deal packet we derive a normalized module/category SIGNATURE and bump its counter
//  - on every shipped project we record the build's modules (the "what we actually built" record)
//  - at count >= 3 the signature is auto-flagged graduation-ready (a field + a logged activity)
//
// Everything here is BEST-EFFORT: each export catches its own errors and resolves, so a failure
// in the flywheel can never break the deal-save or project-convert/ship path that calls it.
// The actual writes live in store.mjs (bumpGraduation / recordBuildModules / listGraduation).

import store from '../store.mjs'

const STOP = new Set(['the', 'and', 'for', 'with', 'a', 'an', 'of', 'to', 'in', 'on', 'app', 'system', 'module', 'tool', 'custom', 'management', 'manager', 'tracker', 'tracking', 'auto', 'automation', 'ai'])

// Normalize a single module/category name into a stable token slug.
// "Inventory Tracking" -> "inventory" ; "KBZPay / MMQR Reconciliation" -> "kbzpay-mmqr-reconciliation"
export function normalizeModule(name) {
  const words = String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((w) => w && w.length > 1 && !STOP.has(w))
  return words.join('-').slice(0, 80)
}

// Pull the list of normalized module signatures out of a deal packet (or a raw modules array).
// Accepts: packet object ({segment, modules:[{name}]}) OR an array of module objects/strings.
export function signaturesFromPacket(packet) {
  const out = []
  if (!packet) return out
  const mods = Array.isArray(packet) ? packet : Array.isArray(packet.modules) ? packet.modules : []
  for (const m of mods) {
    const name = typeof m === 'string' ? m : m?.name
    const sig = normalizeModule(name)
    if (sig) out.push({ signature: sig, label: String((typeof m === 'string' ? m : m?.name) || '').slice(0, 80) })
  }
  // de-dupe within a single packet so one deal never double-counts the same module
  const seen = new Set()
  return out.filter((s) => (seen.has(s.signature) ? false : (seen.add(s.signature), true)))
}

// HOOK 1 — call when a deal packet is saved. Bumps the counter for each module signature in the packet.
// `ref` is the deal/lead/project id used as the source attribution. Returns the bump results (or []).
export async function onDealSaved(packet, ref = null) {
  try {
    const sigs = signaturesFromPacket(packet)
    if (!sigs.length) return []
    const moduleNames = sigs.map((s) => s.label)
    const results = []
    for (const s of sigs) {
      const r = await store.bumpGraduation(s.signature, { label: s.label, source: ref, modules: moduleNames })
      if (r) {
        results.push(r)
        // The 3rd repeat just crossed the line — surface it so the console can say "productize this".
        if (r.graduated) {
          store.logActivity({ kind: 'graduation', summary: `Graduation: "${s.label}" asked ${r.count}× — productize it`, ref: s.signature }).catch(() => {})
        }
      }
    }
    return results
  } catch { return [] }
}

// HOOK 2 — call when a project ships (status → live). Records the build's modules and bumps signatures.
// `modules` should be the project's module list (e.g. from its saved deal packet). Best-effort.
export async function onProjectShipped(projectId, modules, ref = null) {
  try {
    const sigs = signaturesFromPacket(modules)
    const moduleNames = sigs.map((s) => s.label)
    await store.recordBuildModules(projectId, moduleNames, sigs[0]?.signature || null)
    const results = []
    for (const s of sigs) {
      const r = await store.bumpGraduation(s.signature, { label: s.label, source: ref || projectId, modules: moduleNames })
      if (r) {
        results.push(r)
        if (r.graduated) {
          store.logActivity({ kind: 'graduation', summary: `Graduation: "${s.label}" built/asked ${r.count}× — productize it`, ref: s.signature }).catch(() => {})
        }
      }
    }
    return results
  } catch { return [] }
}

export default { normalizeModule, signaturesFromPacket, onDealSaved, onProjectShipped }
