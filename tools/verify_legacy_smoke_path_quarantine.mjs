import fs from 'node:fs'
import path from 'node:path'

const repoRoot = process.cwd()
const targets = [
  'package.json',
  'tools/run_local_smoke.ps1',
  'tools/run_local_portal_smoke.ps1',
  'tools/run_local_smoke.sh',
  'tools/run_local_portal_smoke.sh',
]

const ownerConfirmation = 'I UNDERSTAND LEGACY SMOKE IS NOT READINESS PROOF'

const requiredSnippets = {
  'package.json': [
    '"preapp:verify": "npm run security:legacy-credential-paths:verify && npm run security:legacy-smoke-paths:verify && npm run shop:run001:claims:verify"',
    '"preapp:verify:local": "npm run security:legacy-credential-paths:verify && npm run security:legacy-smoke-paths:verify && npm run shop:run001:claims:verify"',
    '"security:legacy-smoke-paths:verify": "node tools/verify_legacy_smoke_path_quarantine.mjs"',
  ],
  'tools/run_local_smoke.ps1': [
    '[switch]$AllowLegacyLocalSmoke',
    ownerConfirmation,
    'not SuperMega readiness proof',
    'legacy serve_solution.py / mark1_pilot local smoke only',
  ],
  'tools/run_local_portal_smoke.ps1': [
    '[switch]$AllowLegacyLocalSmoke',
    ownerConfirmation,
    'not SuperMega readiness proof',
    'legacy serve_solution.py / mark1_pilot portal smoke only',
  ],
  'tools/run_local_smoke.sh': [
    'SUPERMEGA_ALLOW_LEGACY_LOCAL_SMOKE',
    ownerConfirmation,
    'not SuperMega readiness proof',
    'legacy serve_solution.py / mark1_pilot local smoke only',
  ],
  'tools/run_local_portal_smoke.sh': [
    'SUPERMEGA_ALLOW_LEGACY_LOCAL_SMOKE',
    ownerConfirmation,
    'not SuperMega readiness proof',
    'legacy serve_solution.py / mark1_pilot portal smoke only',
  ],
}

const errors = []
const files = []

for (const rel of targets) {
  const abs = path.join(repoRoot, rel)
  if (!fs.existsSync(abs)) {
    errors.push(`missing:${rel}`)
    continue
  }
  const text = fs.readFileSync(abs, 'utf8')
  const sha256 = await digest(text)
  files.push({ path: rel, bytes: Buffer.byteLength(text), sha256 })

  for (const snippet of requiredSnippets[rel] ?? []) {
    if (!text.includes(snippet)) {
      errors.push(`missing_required_snippet:${rel}:${snippet}`)
    }
  }
}

const result = {
  ok: errors.length === 0,
  contract: 'supermega.legacy-smoke-path-quarantine.v1',
  checkedAt: new Date().toISOString(),
  files,
  legacyEntrypoints: [
    'tools/serve_solution.py',
    'mark1_pilot',
  ],
  legacySmokeBlockedByDefault: errors.length === 0,
  readinessProofBlocked: errors.length === 0,
  ownerConfirmation,
  errors,
}

console.log(JSON.stringify(result, null, 2))
if (errors.length > 0) {
  process.exit(1)
}

async function digest(text) {
  const { createHash } = await import('node:crypto')
  return createHash('sha256').update(text).digest('hex')
}
