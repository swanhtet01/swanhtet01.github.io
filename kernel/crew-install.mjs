// kernel/crew-install.mjs — land a forged crew into the registry (kernel/crews/), so "describe a task"
// ends at a LIVE crew: the registry is filesystem-enumerated, so a written file is auto-discovered by
// listCrews(), gate-checked by test_crew_resilience.mjs, and runnable by runCrew(). Node-only (fs) —
// crew-forge.mjs stays pure/browser-safe. installCrewFromSpec refuses to write an invalid crew (the
// compiler guarantees valid, but we verify) and refuses to silently overwrite an existing crew.
//   node crew-install.mjs '<json spec>'        → forge + install one crew
import { writeFile, access } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCrewFromSpec } from './crew-forge.mjs'
import { validateCrew } from './crew-runner.mjs'

const CREWS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'crews')

/**
 * installCrewFromSpec — compile a spec → a crew JSON in kernel/crews/. Returns a result envelope.
 * @param {object} spec  see buildCrewFromSpec
 * @param {object} [o]  { dir=kernel/crews, overwrite=false }
 * @returns {Promise<{ok:boolean, slug?:string, file?:string, crew?:object, reason?:string, errors?:string[]}>}
 */
export async function installCrewFromSpec(spec, o = {}) {
  const dir = o.dir || CREWS_DIR
  const { crew, validation } = buildCrewFromSpec(spec)
  // Belt + suspenders: the compiler guarantees valid, but never write one that isn't.
  const errors = validation.ok ? validateCrew(crew, { slug: crew.slug }) : validation.errors
  if (errors.length) return { ok: false, reason: 'invalid_crew', errors }
  const file = join(dir, `${crew.slug}.json`)
  if (!o.overwrite) {
    try { await access(file); return { ok: false, reason: 'exists', slug: crew.slug, file } } catch { /* absent → ok to write */ }
  }
  await writeFile(file, JSON.stringify(crew, null, 2) + '\n', 'utf8')
  return { ok: true, slug: crew.slug, file, crew }
}

export default { installCrewFromSpec }

// CLI
const isMain = (() => { try { return process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop()) } catch { return false } })()
if (isMain && process.argv[2]) {
  let spec
  try { spec = JSON.parse(process.argv[2]) } catch { console.error("usage: node crew-install.mjs '<json spec>'"); process.exit(1) }
  const r = await installCrewFromSpec(spec, { overwrite: process.argv.includes('--overwrite') })
  if (r.ok) { console.log(`✓ installed crew '${r.slug}' → ${r.file}`); process.exit(0) }
  console.error(`✗ ${r.reason}${r.errors ? ': ' + r.errors.join('; ') : ''}${r.file ? ' (' + r.file + ')' : ''}`); process.exit(1)
}
