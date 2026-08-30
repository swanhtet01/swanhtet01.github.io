import fs from 'node:fs'
import os from 'node:os'
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
    '$CloudAiProviderKeys = @(',
    'Assert-NoCloudAiProviderSecrets -EnvMap $envMap',
    'Hosted AI provider secret key is quarantined for this SuperMega release lane',
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
    'Remove-CloudAiProviderMaterial -Target $envMap',
    '$envMap["SUPERMEGA_LLM_PROVIDER"] = "ollama"',
    '$envMap["SUPERMEGA_OLLAMA_ENABLED"] = "1"',
    '$envMap["SUPERMEGA_OLLAMA_MODEL"] = "llama3.2:1b"',
    '$envMap["OLLAMA_KEEP_ALIVE"] = "0s"',
  ],
  'tools/github_secret_sync.py': [
    'EXPECTED_OWNER_CONFIRMATION = "I APPROVE SUPERMEGA GITHUB SECRET WRITE"',
    'parser.add_argument("--allow-external-write", action="store_true"',
    'parser.add_argument("--owner-confirmation", default=""',
    'parser.add_argument("--token-env", default=""',
    'Refusing --token. Set GITHUB_TOKEN or GH_TOKEN and pass --token-env instead.',
    'Quarantined legacy GitHub secret sync',
    'secret_value_loaded = _load_secret_value(',
    '"external_writes_performed": performed_by_outcome[outcome]',
    'WRITE_OUTCOME_UNKNOWN = "outcome_unknown"',
    '"external_write_retry_allowed": False',
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
  '$envMap["ANTHROPIC_API_KEY"] = $anthropic',
  '$envMap["OPENAI_API_KEY"] = $openai',
  'Set-GitHubSecret -RepoName $Repo -Name "OPENAI_API_KEY"',
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

runPowerShellResolverBehaviorCheck()
runGitHubSecretSyncBehaviorChecks()
runLocalSecretMaterializerBehaviorChecks()

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
      expectedJson: {
        status: 'planned',
        external_write_attempted: false,
        external_writes_performed: false,
        external_write_outcome: 'confirmed_not_performed',
        external_write_retry_allowed: false,
      },
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
      expectedJson: {
        external_write_attempted: false,
        external_writes_performed: false,
        external_write_outcome: 'confirmed_not_performed',
        external_write_retry_allowed: false,
      },
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
      expectedJson: {
        external_write_attempted: false,
        external_writes_performed: false,
        external_write_outcome: 'confirmed_not_performed',
        external_write_retry_allowed: false,
      },
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
      expectedJson: {
        external_write_attempted: false,
        external_writes_performed: false,
        external_write_outcome: 'confirmed_not_performed',
        external_write_retry_allowed: false,
      },
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

  runGitHubSecretSyncPutOutcomeChecks(script)
}

function runGitHubSecretSyncPutOutcomeChecks(script) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'supermega-github-secret-sync-'))
  const fakeModules = path.join(tempRoot, 'fake-modules')
  const tracePath = path.join(tempRoot, 'request-trace.txt')
  const secretSentinel = 'SUPERMEGA_TEST_SECRET_SENTINEL_DO_NOT_PRINT'
  fs.mkdirSync(path.join(fakeModules, 'nacl'), { recursive: true })
  fs.writeFileSync(path.join(fakeModules, 'nacl', '__init__.py'), '', 'utf8')
  fs.writeFileSync(path.join(fakeModules, 'nacl', 'encoding.py'), 'class Base64Encoder:\n    pass\n', 'utf8')
  fs.writeFileSync(path.join(fakeModules, 'nacl', 'public.py'), [
    'class PublicKey:',
    '    def __init__(self, value, encoder):',
    '        self.value = value',
    '',
    'class SealedBox:',
    '    def __init__(self, public_key):',
    '        self.public_key = public_key',
    '    def encrypt(self, value):',
    '        return b"encrypted-test-value"',
    '',
  ].join('\n'), 'utf8')
  fs.writeFileSync(path.join(fakeModules, 'requests.py'), [
    'import os',
    '',
    'class Response:',
    '    def __init__(self, status_code):',
    '        self.status_code = status_code',
    '    def json(self):',
    '        return {"key": "dGVzdC1wdWJsaWMta2V5", "key_id": "test-key-id"}',
    '',
    'def _trace(value):',
    '    with open(os.environ["FAKE_REQUEST_TRACE"], "a", encoding="utf-8") as handle:',
    '        handle.write(value + "\\n")',
    '',
    'def get(url, headers, timeout):',
    '    _trace("GET")',
    '    if os.environ.get("FAKE_REQUEST_MODE") == "public_key_non_2xx":',
    '        return Response(503)',
    '    return Response(200)',
    '',
    'def put(url, headers, json, timeout):',
    '    _trace("PUT")',
    '    mode = os.environ.get("FAKE_REQUEST_MODE")',
    '    if mode == "timeout":',
    '        raise TimeoutError(os.environ["SECRET_SENTINEL"])',
    '    if mode == "connection":',
    '        raise ConnectionError(os.environ["SECRET_SENTINEL"])',
    '    if mode == "response_loss":',
    '        raise RuntimeError(os.environ["SECRET_SENTINEL"])',
    '    if mode == "non_2xx":',
    '        return Response(422)',
    '    if mode == "server_error":',
    '        return Response(503)',
    '    return Response(204)',
    '',
  ].join('\n'), 'utf8')

  const cases = [
    {
      name: 'put_success_confirmed_performed',
      mode: 'success',
      expectedStatus: 0,
      expectedOutcome: 'confirmed_performed',
      expectedPerformed: true,
      expectedPutCount: 1,
      expectedStatusCode: 204,
    },
    {
      name: 'put_non_2xx_confirmed_not_performed',
      mode: 'non_2xx',
      expectedStatus: 1,
      expectedOutcome: 'confirmed_not_performed',
      expectedPerformed: false,
      expectedPutCount: 1,
      expectedStatusCode: 422,
    },
    {
      name: 'put_timeout_outcome_unknown_no_retry',
      mode: 'timeout',
      expectedStatus: 1,
      expectedOutcome: 'outcome_unknown',
      expectedPerformed: null,
      expectedPutCount: 1,
    },
    {
      name: 'put_server_error_outcome_unknown_no_retry',
      mode: 'server_error',
      expectedStatus: 1,
      expectedOutcome: 'outcome_unknown',
      expectedPerformed: null,
      expectedPutCount: 1,
      expectedStatusCode: 503,
    },
    {
      name: 'put_connection_failure_outcome_unknown_no_retry',
      mode: 'connection',
      expectedStatus: 1,
      expectedOutcome: 'outcome_unknown',
      expectedPerformed: null,
      expectedPutCount: 1,
    },
    {
      name: 'put_response_loss_outcome_unknown_no_retry',
      mode: 'response_loss',
      expectedStatus: 1,
      expectedOutcome: 'outcome_unknown',
      expectedPerformed: null,
      expectedPutCount: 1,
    },
    {
      name: 'public_key_rejection_prevents_put',
      mode: 'public_key_non_2xx',
      expectedStatus: 1,
      expectedOutcome: 'confirmed_not_performed',
      expectedPerformed: false,
      expectedPutCount: 0,
      expectedStatusCode: 503,
    },
  ]

  try {
    for (const testCase of cases) {
      fs.writeFileSync(tracePath, '', 'utf8')
      const child = runPython([
        script,
        '--repo', 'swanhtet01/swanhtet01.github.io',
        '--name', 'UNIT_TEST_SECRET',
        '--value-env', 'UNIT_TEST_SECRET_VALUE',
        '--token-env', 'GITHUB_TOKEN',
        '--allow-external-write',
        '--owner-confirmation', 'I APPROVE SUPERMEGA GITHUB SECRET WRITE',
      ], {
        GITHUB_TOKEN: 'github-test-token-placeholder',
        UNIT_TEST_SECRET_VALUE: secretSentinel,
        PYTHONPATH: fakeModules,
        FAKE_REQUEST_MODE: testCase.mode,
        FAKE_REQUEST_TRACE: tracePath,
        SECRET_SENTINEL: secretSentinel,
      })
      let packet = null
      try {
        packet = JSON.parse(String(child.stdout || '').trim())
      } catch {
        errors.push(`github_secret_sync_put_json_invalid:${testCase.name}`)
      }
      const trace = fs.readFileSync(tracePath, 'utf8').trim().split(/\r?\n/).filter(Boolean)
      const putCount = trace.filter((value) => value === 'PUT').length
      const output = `${child.stdout || ''}${child.stderr || ''}`
      const ok = child.status === testCase.expectedStatus
        && packet?.contract === 'supermega.github-secret-sync.quarantine.v1'
        && packet?.secret_values_exposed === false
        && packet?.external_write_attempted === (testCase.expectedPutCount === 1)
        && packet?.external_writes_performed === testCase.expectedPerformed
        && packet?.external_write_outcome === testCase.expectedOutcome
        && packet?.external_write_retry_allowed === false
        && putCount === testCase.expectedPutCount
        && (testCase.expectedStatusCode === undefined || packet?.status_code === testCase.expectedStatusCode)
        && !output.includes(secretSentinel)

      behaviorChecks.push({
        name: testCase.name,
        ok,
        status: child.status,
        putCount,
        outcome: packet?.external_write_outcome ?? null,
        externalWritesPerformed: packet?.external_writes_performed,
        secretValuesExposed: packet?.secret_values_exposed === true,
      })
      if (!ok) errors.push(`github_secret_sync_put_behavior_failed:${testCase.name}`)
    }
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true })
  }
}

function runPython(args, envOverrides = {}) {
  const python = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3')
  return spawnSync(python, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      GITHUB_TOKEN: '',
      GH_TOKEN: '',
      UNIT_TEST_SECRET_VALUE: '',
      ...envOverrides,
    },
    timeout: 10_000,
    windowsHide: true,
  })
}

function runLocalSecretMaterializerBehaviorChecks() {
  const script = path.join(repoRoot, 'tools', 'sync_local_secrets.ps1')
  if (!fs.existsSync(script)) {
    errors.push('local_secret_materializer_behavior_missing_script')
    return
  }

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'supermega-secret-materializer-'))
  try {
    const source = path.join(tempRoot, 'owner-secrets.txt')
    const appEnv = path.join(tempRoot, '.env.app.local')
    const showroomEnv = path.join(tempRoot, '.env.showroom.local')
    fs.writeFileSync(source, [
      'claude api',
      'anthropic-legacy-placeholder',
      'google places api',
      'google-places-placeholder',
      'openai',
      'supermega',
      'openai-legacy-placeholder',
      'client id',
      'gmail-client-placeholder',
      'secret',
      'GOCSPX-gmail-placeholder',
      '',
    ].join('\n'), 'utf8')
    fs.writeFileSync(appEnv, [
      'OPENAI_API_KEY=existing-openai-placeholder',
      'ANTHROPIC_API_KEY=existing-anthropic-placeholder',
      'OPENROUTER_API_KEY=existing-openrouter-placeholder',
      'SUPERMEGA_OR_MODEL_REASON=openai/gpt-4o',
      '',
    ].join('\n'), 'utf8')
    fs.writeFileSync(showroomEnv, '', 'utf8')

    const child = runPowerShell([
      '-NoProfile',
      '-ExecutionPolicy', 'Bypass',
      '-File', script,
      '-SecretsFile', source,
      '-OutputPath', appEnv,
      '-ShowroomOutputPath', showroomEnv,
      '-AllowLocalSecretWrite',
      '-OwnerConfirmation', 'I APPROVE SUPERMEGA LOCAL SECRET MATERIALIZATION',
    ])
    const appText = fs.readFileSync(appEnv, 'utf8')
    const showroomText = fs.readFileSync(showroomEnv, 'utf8')
    const forbidden = [
      'OPENAI_API_KEY=',
      'ANTHROPIC_API_KEY=',
      'CLAUDE_API_KEY=',
      'OPENROUTER_API_KEY=',
      'AI_GATEWAY_API_KEY=',
      'SUPERMEGA_OR_MODEL_REASON=',
      'anthropic-legacy-placeholder',
      'openai-legacy-placeholder',
      'existing-openai-placeholder',
      'existing-anthropic-placeholder',
      'existing-openrouter-placeholder',
    ]
    const required = [
      'SUPERMEGA_LLM_PROVIDER=ollama',
      'SUPERMEGA_OLLAMA_ENABLED=1',
      'SUPERMEGA_OLLAMA_MODEL=llama3.2:1b',
      'OLLAMA_KEEP_ALIVE=0s',
      'GOOGLE_PLACES_API_KEY=google-places-placeholder',
      'GMAIL_OAUTH_CLIENT_ID=gmail-client-placeholder',
    ]
    const ok = child.status === 0
      && required.every((snippet) => appText.includes(snippet))
      && forbidden.every((snippet) => !appText.includes(snippet) && !showroomText.includes(snippet))
      && !/anthropic|openai|openrouter/i.test(String(child.stdout || '') + String(child.stderr || ''))

    behaviorChecks.push({
      name: 'local_secret_materializer_scrubs_hosted_ai_keys',
      ok,
      status: child.status,
      externalWritesPerformed: false,
      secretValuesExposed: false,
    })
    if (!ok) errors.push('local_secret_materializer_behavior_failed:local_secret_materializer_scrubs_hosted_ai_keys')
  } finally {
    const resolvedTempRoot = path.resolve(tempRoot)
    const resolvedOsTemp = path.resolve(os.tmpdir())
    if (resolvedTempRoot.startsWith(resolvedOsTemp + path.sep)) {
      fs.rmSync(resolvedTempRoot, { recursive: true, force: true })
    }
  }
}

function runPowerShellResolverBehaviorCheck() {
  const cases = [
    ['win32', 'powershell'],
    ['linux', 'pwsh'],
    ['darwin', 'pwsh'],
  ]
  const ok = cases.every(([platform, expected]) => resolvePowerShellExecutable(platform) === expected)

  behaviorChecks.push({
    name: 'powershell_host_resolves_cross_platform',
    ok,
    status: ok ? 0 : 1,
    externalWritesPerformed: false,
    secretValuesExposed: false,
  })
  if (!ok) errors.push('powershell_host_resolution_failed')
}

function resolvePowerShellExecutable(platform = process.platform) {
  return platform === 'win32' ? 'powershell' : 'pwsh'
}

function runPowerShell(args) {
  return spawnSync(resolvePowerShellExecutable(), args, {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      OPENAI_API_KEY: '',
      ANTHROPIC_API_KEY: '',
      CLAUDE_API_KEY: '',
      OPENROUTER_API_KEY: '',
      AI_GATEWAY_API_KEY: '',
    },
    timeout: 15_000,
    windowsHide: true,
  })
}
