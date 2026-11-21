import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const workflow = await readFile(
  path.join(root, '.github/workflows/shop-windows-uia-capability.yml'),
  'utf8',
)
const driver = await readFile(path.join(root, 'tools/shop_windows_uia_capability.ps1'))
const fixture = await readFile(path.join(root, 'tools/shop_windows_uia_fixture.ps1'))
const attributes = await readFile(path.join(root, '.gitattributes'), 'utf8')

test('only the scoped PR label can admit a ten-minute, read-only hosted probe', () => {
  assert.match(workflow, /^on:\n  pull_request:\n    types: \[labeled\]/m)
  assert.doesNotMatch(workflow, /workflow_dispatch:|\bpush:|\bpull_request_target:/)
  assert.match(workflow, /permissions:\n  contents: read/)
  assert.doesNotMatch(workflow, /\b(actions|packages|issues|pull-requests): write\b/)
  assert.match(workflow, /github\.event\.label\.name == 'shop-windows-uia-capability'/)
  assert.match(workflow, /github\.event\.pull_request\.number == 752/)
  assert.match(workflow, /github\.event\.pull_request\.state == 'open'/)
  assert.match(workflow, /github\.event\.pull_request\.draft == true/)
  assert.match(workflow, /github\.event\.pull_request\.base\.ref == 'codex\/shop-main-integration-20261022'/)
  assert.match(workflow, /github\.event\.pull_request\.head\.ref == 'codex\/postgres17-provenance-integration-20261031'/)
  assert.match(workflow, /github\.event\.pull_request\.head\.repo\.full_name == github\.repository/)
  assert.match(workflow, /runs-on: windows-latest\n    timeout-minutes: 10/)
  assert.match(workflow, /ref: \$\{\{ github\.event\.pull_request\.head\.sha \}\}/)
  assert.match(workflow, /persist-credentials: false/)
  assert.doesNotMatch(workflow, /mobile\/shop_pos\/|download-artifact|secrets\./i)
})

test('fixed scripts are read from the event head; proof remains non-authoritative', () => {
  assert.match(workflow, /shop_windows_uia_capability\.ps1/)
  assert.match(workflow, /shop_windows_uia_fixture\.ps1/)
  assert.match(attributes, /^tools\/shop_windows_uia_capability\.ps1 text eol=lf$/m)
  assert.match(attributes, /^tools\/shop_windows_uia_fixture\.ps1 text eol=lf$/m)
  assert.match(workflow, /if: success\(\)[\s\S]*?fixture-window\.png[\s\S]*?result\.json[\s\S]*?retention-days: 1/)
  assert.match(workflow, /if: always\(\)[\s\S]*?uia_capability_evidence_owner_mismatch[\s\S]*?uia_capability_evidence_cleanup_failed/)
  assert.doesNotMatch(workflow, /\$\{\{\s*secrets\./)
})

test('probe requires an external UIA action, visible fixture pixels and scoped cleanup', () => {
  const source = driver.toString('utf8')
  const fixtureSource = fixture.toString('utf8')
  assert.match(source, /OpenInputDesktop/)
  assert.match(source, /GetForegroundWindow/)
  assert.match(source, /AutomationElement\]::FromHandle/)
  assert.match(source, /InvokePattern\]::Pattern/)
  assert.match(source, /\.Invoke\(\)/)
  assert.match(source, /ClientToScreen/)
  assert.match(source, /\$width = 180\n  \$height = 80/)
  assert.match(source, /CopyFromScreen\(\$clientOrigin\.X, \$clientOrigin\.Y/)
  assert.match(source, /uia_capability_fixture_pixels_missing/)
  assert.match(source, /if \(-not \$child\.WaitForExit\(2000\)\)/)
  assert.match(source, /Remove-Item -LiteralPath \$fixtureRoot -Recurse -Force/)
  assert.match(fixtureSource, /\$button\.Add_Click/)
  assert.doesNotMatch(source, /PerformClick|SendKeys|supermega_shop_qa\.exe|flutter build/i)
})

test('fixture cleanup failure removes owned proof before workflow outputs exist', () => {
  const source = driver.toString('utf8')
  const cleanupStart = source.indexOf('$cleanupFailed = $true\n  try {')
  const cleanupEnd = source.indexOf('$cleanupFailed = $false', cleanupStart)
  const guaranteedCleanup = source.indexOf('} finally {', cleanupEnd)
  const removeProof = source.indexOf('Remove-Item -LiteralPath $evidenceRoot -Recurse -Force', guaranteedCleanup)
  const workflowOutput = source.indexOf('Add-Content -LiteralPath $env:GITHUB_OUTPUT', removeProof)
  assert.ok(cleanupStart > 0 && cleanupEnd > cleanupStart)
  assert.ok(guaranteedCleanup > cleanupEnd && removeProof > guaranteedCleanup)
  assert.ok(workflowOutput > removeProof)
  assert.match(
    source.slice(guaranteedCleanup, removeProof),
    /\(\$null -eq \$proof -or \$cleanupFailed\)[\s\S]*\$ownsEvidence[\s\S]*Test-Path -LiteralPath \$evidenceRoot/,
  )
})
