import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

const verifier = resolve(import.meta.dirname, 'verify_vercel_domain_state.mjs')
const retiredVerifier = resolve(import.meta.dirname, 'verify_retired_vercel_alias_state.mjs')

function run(kind, names) {
  return spawnSync(process.execPath, [verifier, kind], {
    input: JSON.stringify({ domains: names.map((name) => ({ name })) }),
    encoding: 'utf8',
  })
}

function parse(result) {
  return JSON.parse(result.status === 0 ? result.stdout : result.stderr)
}

function runRetired(payload) {
  return spawnSync(process.execPath, [retiredVerifier, 'pos.supermega.dev'], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
  })
}

const app = run('app', ['megaos.vercel.app', 'app.supermega.dev'])
if (app.status !== 0 || parse(app).actualDomains.join(',') !== 'app.supermega.dev') throw new Error('canonical_app_domain_failed')

const publicSite = run('public', ['supermega-public.vercel.app', 'www.supermega.dev', 'supermega.dev'])
if (publicSite.status !== 0 || parse(publicSite).actualDomains.length !== 2) throw new Error('canonical_public_domains_failed')

const missing = run('public', ['supermega.dev'])
if (missing.status === 0 || !parse(missing).failures.includes('canonical_domain_ownership_wrong')) throw new Error('missing_www_domain_allowed')

const legacy = run('app', ['app.supermega.dev', 'pos.supermega.dev'])
if (legacy.status === 0 || !parse(legacy).failures.includes('canonical_domain_ownership_wrong')) throw new Error('legacy_domain_attachment_allowed')

const retiredAbsent = runRetired({ aliases: [] })
if (retiredAbsent.status !== 0 || parse(retiredAbsent).liveRetiredAliases.length !== 0) throw new Error('retired_alias_absence_rejected')

const retiredLive = runRetired({ aliases: [{ alias: 'pos.supermega.dev', projectId: 'prj_legacy' }] })
if (retiredLive.status === 0 || !parse(retiredLive).failures.includes('retired_alias_still_live')) throw new Error('retired_alias_allowed')

const retiredMalformed = runRetired({ domains: [] })
if (retiredMalformed.status === 0 || !retiredMalformed.stderr.includes('retired_alias_state_invalid')) throw new Error('malformed_retired_alias_state_allowed')

console.log(JSON.stringify({ ok: true, contract: 'supermega_vercel_domain_state_tests', checks: 7 }, null, 2))
