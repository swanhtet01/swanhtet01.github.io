import fs from 'node:fs'
import path from 'node:path'

const repoRoot = process.cwd()
const targets = [
  'package.json',
  'tools/bootstrap_supermega_ops.ps1',
  'tools/sync_local_secrets.ps1',
]

const requiredSnippets = {
  'package.json': [
    '"preapp:verify": "npm run security:legacy-credential-paths:verify"',
    '"preapp:verify:local": "npm run security:legacy-credential-paths:verify"',
    '"security:legacy-credential-paths:verify": "node tools/verify_legacy_credential_path_quarantine.mjs"',
  ],
  'tools/bootstrap_supermega_ops.ps1': [
    '[switch]$AllowExternalWrites',
    '[string]$OwnerConfirmation = ""',
    'I APPROVE SUPERMEGA GITHUB SECRET AND WORKFLOW WRITES',
    'Legacy default env-file discovery is quarantined',
    'Legacy service-account default paths are quarantined',
    'Refusing to infer a token from git remote URLs',
  ],
  'tools/sync_local_secrets.ps1': [
    '[switch]$AllowLocalSecretWrite',
    '[string]$OwnerConfirmation = ""',
    'I APPROVE SUPERMEGA LOCAL SECRET MATERIALIZATION',
    'Legacy default secret-source paths are quarantined',
    'Default app env-file writes are quarantined',
    'Default showroom env-file writes are quarantined',
    '$envMap["SUPERMEGA_LLM_PROVIDER"] = "ollama"',
    '$envMap["SUPERMEGA_OLLAMA_MODEL"] = "llama3.2:1b"',
  ],
}

const forbiddenSnippets = [
  'C:\\Users\\swann',
  '_tmp_keystore_20260328',
  'claude api.txt',
  'git remote get-url origin',
  '$envMap["SUPERMEGA_LLM_PROVIDER"] = "openai"',
  '$envMap["SUPERMEGA_OPENAI_MODEL"] = "gpt-5-mini"',
  '$envMap["SUPERMEGA_ANTHROPIC_MODEL"] = "claude-sonnet-4-20250514"',
]

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
  for (const snippet of forbiddenSnippets) {
    if (text.includes(snippet)) {
      errors.push(`forbidden_snippet:${rel}:${snippet}`)
    }
  }
}

const result = {
  ok: errors.length === 0,
  contract: 'supermega.legacy-credential-path-quarantine.v1',
  checkedAt: new Date().toISOString(),
  files,
  providerWritesBlockedByDefault: errors.length === 0,
  localSecretMaterializationBlockedByDefault: errors.length === 0,
  localOnlyAiDefault: errors.length === 0,
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
