import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { scanAddedLines } from './verify_repository_secret_diff.mjs'

const workflow = await readFile('.github/workflows/dependency-security.yml', 'utf8')

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
    assert.deepEqual(result.findings, [{ rule, file: 'example.txt', line: 1 }], rule)
    assert.equal(JSON.stringify(result).includes(value), false, rule)
    assert.equal(result.valuesExposed, false, rule)
  }
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
})
