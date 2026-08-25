import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const repoRoot = process.cwd()
const targets = [
  'package.json',
  'tools/bootstrap_supermega_ops.ps1',
  'tools/sync_local_secrets.ps1',
  'tools/github_secret_sync.py',
]

const requiredSnippets = {
  'package.json': [
    '"preapp:verify": "npm run security:legacy-credential-paths:verify && npm run security:legacy-smoke-paths:verify && npm run shop:run001:claims:verify"',
    '"preapp:verify:local": "npm run security:legacy-credential-paths:verify && npm run security:legacy-smoke-paths:verify && npm run shop:run001:claims:verify"',
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
  'tools/github_secret_sync.py': [
    'EXPECTED_OWNER_CONFIRMATION = "I APPROVE SUPERMEGA GITHUB SECRET WRITE"',
    'parser.add_argument("--allow-external-write", action="store_true"',
    'parser.add_argument("--owner-confirmation", default=""',
    'parser.add_argument("--token-env", default=""',
    'Refusing --token. Set GITHUB_TOKEN or GH_TOKEN and pass --token-env instead.',
    'Quarantined legacy GitHub secret sync',
    'secret_value_loaded = _load_secret_value(',
    '"external_writes_performed": False',
    '"secret_values_exposed": False',
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
  'parser.add_argument("--token", required=True',
  '.expanduser()',
  '"response": key_resp.text',
]

const errors = []
const files = []
const behaviorChecks = []

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

runGitHubSecretSyncBehaviorChecks()

const result = {
  ok: errors.length === 0,
  contract: 'supermega.legacy-credential-path-quarantine.v1',
  checkedAt: new Date().toISOString(),
  files,
  behaviorChecks,
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

function runGitHubSecretSyncBehaviorChecks() {
  const script = path.join(repoRoot, 'tools', 'github_secret_sync.py')
  if (!fs.existsSync(script)) {
    errors.push('github_secret_sync_behavior_missing_script')
    return
  }

  const cases = [
    {
      name: 'plan_no_write',
      args: [
        script,
        '--repo', 'swanhtet01/swanhtet01.github.io',
        '--name', 'UNIT_TEST_SECRET',
        '--value-env', 'UNIT_TEST_SECRET_VALUE',
        '--token-env', 'GITHUB_TOKEN',
        '--plan',
      ],
      expectedStatus: 0,
      expectedJson: { status: 'planned', external_write_attempted: false, external_writes_performed: false },
    },
    {
      name: 'approval_required_before_secret_read',
      args: [
        script,
        '--repo', 'swanhtet01/swanhtet01.github.io',
        '--name', 'UNIT_TEST_SECRET',
        '--value-env', 'UNIT_TEST_SECRET_VALUE',
        '--token-env', 'GITHUB_TOKEN',
      ],
      expectedStatus: 1,
      expectedErrorIncludes: 'Quarantined legacy GitHub secret sync',
      forbiddenErrorIncludes: 'Environment variable is empty',
      expectedJson: { external_write_attempted: false, external_writes_performed: false },
    },
    {
      name: 'command_line_token_rejected_even_in_plan_mode',
      args: [
        script,
        '--repo', 'swanhtet01/swanhtet01.github.io',
        '--name', 'UNIT_TEST_SECRET',
        '--value-env', 'UNIT_TEST_SECRET_VALUE',
        '--token', 'placeholder-token',
        '--plan',
      ],
      expectedStatus: 1,
      expectedErrorIncludes: 'Refusing --token',
      expectedJson: { external_write_attempted: false, external_writes_performed: false },
    },
    {
      name: 'token_required_before_secret_read_after_approval',
      args: [
        script,
        '--repo', 'swanhtet01/swanhtet01.github.io',
        '--name', 'UNIT_TEST_SECRET',
        '--value-env', 'UNIT_TEST_SECRET_VALUE',
        '--token-env', 'GITHUB_TOKEN',
        '--allow-external-write',
        '--owner-confirmation', 'I APPROVE SUPERMEGA GITHUB SECRET WRITE',
      ],
      expectedStatus: 1,
      expectedErrorIncludes: 'Token environment variable is empty: GITHUB_TOKEN',
      forbiddenErrorIncludes: 'UNIT_TEST_SECRET_VALUE',
      expectedJson: { external_write_attempted: false, external_writes_performed: false },
    },
  ]

  for (const testCase of cases) {
    const child = runPython(testCase.args)
    const output = String(child.stdout || '').trim()
    let packet = null
    try {
      packet = JSON.parse(output)
    } catch {
      errors.push(`github_secret_sync_behavior_json_invalid:${testCase.name}`)
    }

    const errorText = String(packet?.error || '')
    const statusOk = child.status === testCase.expectedStatus
    const contractOk = packet?.contract === 'supermega.github-secret-sync.quarantine.v1'
    const secretSafe = packet?.secret_values_exposed === false
    const expectedFieldsOk = Object.entries(testCase.expectedJson || {})
      .every(([key, value]) => packet?.[key] === value)
    const expectedErrorOk = !testCase.expectedErrorIncludes || errorText.includes(testCase.expectedErrorIncludes)
    const forbiddenErrorOk = !testCase.forbiddenErrorIncludes || !errorText.includes(testCase.forbiddenErrorIncludes)
    const stderrSafe = !/ghp_|github_pat_|sk-[A-Za-z0-9]|sb_secret_|Bearer\s+[A-Za-z0-9._-]+/i.test(String(child.stderr || ''))
    const ok = statusOk && contractOk && secretSafe && expectedFieldsOk && expectedErrorOk && forbiddenErrorOk && stderrSafe

    behaviorChecks.push({
      name: testCase.name,
      ok,
      status: child.status,
      externalWritesPerformed: packet?.external_writes_performed === true,
      secretValuesExposed: packet?.secret_values_exposed === true,
    })
    if (!ok) errors.push(`github_secret_sync_behavior_failed:${testCase.name}`)
  }
}

function runPython(args) {
  const python = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3')
  return spawnSync(python, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      GITHUB_TOKEN: '',
      GH_TOKEN: '',
      UNIT_TEST_SECRET_VALUE: '',
    },
    timeout: 10_000,
    windowsHide: true,
  })
}
