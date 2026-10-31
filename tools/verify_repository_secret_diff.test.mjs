import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

import { scanAddedLines } from './verify_repository_secret_diff.mjs'

const workflow = await readFile('.github/workflows/dependency-security.yml', 'utf8')
const appDeployVerifier = await readFile('tools/verify_app_deploy_workflow.mjs', 'utf8')
const verifierPath = fileURLToPath(new URL('./verify_repository_secret_diff.mjs', import.meta.url))

const patch = (line) => [
  'diff --git a/example.txt b/example.txt',
  '--- a/example.txt',
  '+++ b/example.txt',
  '@@ -0,0 +1 @@',
  `+${line}`,
  '',
].join('\n')

test('ordinary additions pass without exposing values', () => {
  const result = scanAddedLines(patch('const status = "synthetic-ready"'))
  assert.deepEqual(result, {
    ok: true,
    contract: 'supermega.repository-secret-diff.v1',
    addedLines: 1,
    findingCount: 0,
    findings: [],
    valuesExposed: false,
  })
})

test('credential shapes fail with redacted coordinates only', () => {
  const fixtures = [
    ['private-key', ['-----BEGIN ', 'PRIVATE KEY', '-----'].join('')],
    ['private-key', ['-----BEGIN ', 'ENCRYPTED PRIVATE KEY', '-----'].join('')],
    ['github-token', ['ghp_', 'a'.repeat(36)].join('')],
    ['openai-key', ['sk-', 'a'.repeat(24)].join('')],
    ['google-api-key', ['AIza', 'a'.repeat(35)].join('')],
    ['aws-access-key', ['AKIA', 'A'.repeat(16)].join('')],
    ['slack-token', ['xoxb-', 'a'.repeat(24)].join('')],
    ['stripe-live-secret', ['sk_live_', 'a'.repeat(24)].join('')],
    ['supabase-secret-key', ['sb_secret_', 'a'.repeat(24)].join('')],
    ['jwt', ['eyJ', 'a'.repeat(16), '.', 'b'.repeat(16), '.', 'c'.repeat(16)].join('')],
    ['bearer-token', ['Bearer ', 'a'.repeat(24)].join('')],
    ['member-card-token', ['SMC1.', 'a'.repeat(40)].join('')],
    ['credential-url', ['postgresql://user:', 'a'.repeat(24), '@example.invalid/db'].join('')],
  ]

  for (const [rule, value] of fixtures) {
    const result = scanAddedLines(patch(value))
    assert.equal(result.ok, false, rule)
    assert.equal(result.findings[0].rule, rule)
    assert.equal(result.findings[0].line, 1)
    assert.match(result.findings[0].pathDigest, /^sha256:[0-9a-f]{64}$/)
    assert.equal(JSON.stringify(result).includes(value), false, rule)
    assert.equal(JSON.stringify(result).includes('example.txt'), false, rule)
    assert.equal(result.valuesExposed, false, rule)
  }
})

test('added content beginning with plus characters is not mistaken for a file header', () => {
  const value = ['ghp_', 'a'.repeat(36)].join('')
  const result = scanAddedLines(patch(`++${value}`))
  assert.equal(result.findings[0].rule, 'github-token')
  assert.equal(result.findings[0].line, 1)
  assert.match(result.findings[0].pathDigest, /^sha256:[0-9a-f]{64}$/)
})

test('the CLI forces text scanning for files that contain NUL bytes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'shop-secret-diff-'))
  try {
    execFileSync('git', ['init', '-q'], { cwd: directory })
    execFileSync('git', ['config', 'user.name', 'Synthetic Test'], { cwd: directory })
    execFileSync('git', ['config', 'user.email', 'synthetic@example.invalid'], { cwd: directory })
    await writeFile(join(directory, 'baseline.txt'), 'baseline\n')
    execFileSync('git', ['add', 'baseline.txt'], { cwd: directory })
    execFileSync('git', ['commit', '-qm', 'baseline'], { cwd: directory })
    const base = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: directory, encoding: 'utf8' }).trim()
    const value = ['ghp_', 'a'.repeat(36)].join('')
    await writeFile(join(directory, 'binary.dat'), Buffer.from(`${value}\u0000suffix`))
    execFileSync('git', ['add', 'binary.dat'], { cwd: directory })
    execFileSync('git', ['commit', '-qm', 'binary fixture'], { cwd: directory })
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: directory, encoding: 'utf8' }).trim()
    const result = spawnSync(process.execPath, [verifierPath, '--base', base, '--head', head], {
      cwd: directory,
      encoding: 'utf8',
    })
    assert.equal(result.status, 1)
    const report = JSON.parse(result.stdout)
    assert.equal(report.findings[0].rule, 'github-token')
    assert.equal(report.findings[0].line, 1)
    assert.match(report.findings[0].pathDigest, /^sha256:[0-9a-f]{64}$/)
    assert.equal(result.stdout.includes(value), false)
    assert.equal(result.stdout.includes('binary.dat'), false)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('credential-shaped filenames are represented only by a path digest', () => {
  const pathValue = ['ghp_', 'p'.repeat(36)].join('')
  const contentValue = ['sk-', 'c'.repeat(24)].join('')
  const result = scanAddedLines([
    `diff --git a/${pathValue} b/${pathValue}`,
    `--- a/${pathValue}`,
    `+++ b/${pathValue}`,
    '@@ -0,0 +1 @@',
    `+${contentValue}`,
    '',
  ].join('\n'))
  assert.equal(result.ok, false)
  assert.match(result.findings[0].pathDigest, /^sha256:[0-9a-f]{64}$/)
  const output = JSON.stringify(result)
  assert.equal(output.includes(pathValue), false)
  assert.equal(output.includes(contentValue), false)
})

test('removed and context credentials are outside the added-line contract', () => {
  const value = ['ghp_', 'a'.repeat(36)].join('')
  const result = scanAddedLines([
    'diff --git a/example.txt b/example.txt',
    '--- a/example.txt',
    '+++ b/example.txt',
    '@@ -1,2 +1,2 @@',
    `-${value}`,
    ` ${value}`,
    '+replacement',
    '',
  ].join('\n'))
  assert.equal(result.ok, true)
  assert.equal(result.addedLines, 1)
})

test('dependency security requires the redacted scanner result', () => {
  for (const token of [
    'secret-diff:',
    'uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1',
    'fetch-depth: 0',
    'persist-credentials: false',
    'npm run security:secret-diff:verify',
    'node tools/verify_repository_secret_diff.mjs --base "$base" --head "$head"',
    'needs: [npm-audit, pip-audit, secret-diff]',
    'SECRET_DIFF_RESULT: ${{ needs.secret-diff.result }}',
    "process.env.SECRET_DIFF_RESULT !== 'success'",
  ]) {
    assert.equal(workflow.includes(token), true, token)
  }

  for (const token of [
    "aggregate.includes('    needs: [npm-audit, pip-audit, secret-diff]\\n')",
    "aggregate.includes('      SECRET_DIFF_RESULT: ${{ needs.secret-diff.result }}\\n')",
    'SECRET_DIFF_RESULT: secretDiffResult',
    "secretDiffResult === 'success'",
  ]) {
    assert.equal(appDeployVerifier.includes(token), true, token)
  }
})
