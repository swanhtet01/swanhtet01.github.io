import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { copyFile, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import test from 'node:test'
import { inspectWindowsAuthenticode } from './postgres17_toolchain_profile.mjs'

test('Windows canonical inspector executes the full script atomically', {
  skip: process.platform !== 'win32',
  timeout: 45000,
}, async () => {
  // Inspect the already-running Node executable; never launch an installer,
  // PostgreSQL, or an untrusted executable as a test fixture.
  const target = process.execPath
  const metadata = await stat(target)
  const hasher = createHash('sha256')
  for await (const bytes of createReadStream(target)) hasher.update(bytes)
  const observed = await inspectWindowsAuthenticode(target)
  assert.equal(observed.contract, 'supermega.windows-authenticode-observation.v1')
  assert.equal(observed.artifactFileName, basename(target))
  assert.equal(observed.artifactBytes, metadata.size)
  assert.equal(observed.artifactSha256, hasher.digest('hex'))
  assert.equal(typeof observed.signatureStatus, 'string')
  assert.ok(observed.signatureStatus.length > 0)
})

async function withInspectorFixture(source, check) {
  const fixture = await mkdtemp(join(tmpdir(), 'supermega-signature-source-test-'))
  try {
    for (const name of ['postgres17_toolchain_profile.mjs', 'postgres17_source_registry.mjs']) {
      await copyFile(new URL(name, import.meta.url), join(fixture, name))
    }
    await writeFile(join(fixture, 'inspect_windows_authenticode.ps1'), source, 'utf8')
    const module = await import(pathToFileURL(join(fixture, 'postgres17_toolchain_profile.mjs')).href)
    await check(module.inspectWindowsAuthenticode, fixture)
  } finally {
    await rm(fixture, { recursive: true, force: true })
  }
}

const fixtureJson = '[ordered]@{ contract = "supermega.windows-authenticode-observation.v1"; signatureStatus = "Valid" } | ConvertTo-Json -Compress'

test('Windows inspector rejects an early terminating error even when later JSON exists', {
  skip: process.platform !== 'win32', timeout: 45000,
}, async () => {
  await withInspectorFixture(
    '$ErrorActionPreference = "Stop"\nthrow "synthetic_inspector_failure"\n' + fixtureJson + '\n',
    async (inspect) => assert.rejects(inspect(process.execPath), /database_rehearsal_authenticode_inspection_failed/),
  )
})

test('Windows inspector rejects stderr accompanying parseable JSON', {
  skip: process.platform !== 'win32', timeout: 45000,
}, async () => {
  await withInspectorFixture(
    '[Console]::Error.WriteLine("synthetic_inspector_stderr")\n' + fixtureJson + '\n',
    async (inspect) => assert.rejects(inspect(process.execPath), /database_rehearsal_authenticode_inspection_failed/),
  )
})


test('Windows inspector ignores caller module paths without changing its parent', {
  skip: process.platform !== 'win32', timeout: 45000,
}, async () => {
  const inspector = await readFile(new URL('inspect_windows_authenticode.ps1', import.meta.url), 'utf8')
  await withInspectorFixture(inspector, async (inspect, fixture) => {
    const moduleRoot = join(fixture, 'modules')
    const modulePath = join(moduleRoot, 'Microsoft.PowerShell.Security')
    const sentinel = join(fixture, 'caller-module-loaded.txt')
    await mkdir(modulePath, { recursive: true })
    await writeFile(join(modulePath, 'Microsoft.PowerShell.Security.psd1'),
      "@{ RootModule = 'Microsoft.PowerShell.Security.psm1'; ModuleVersion = '1.0.0'; FunctionsToExport = @('Get-AuthenticodeSignature') }", 'utf8')
    const sentinelLiteral = sentinel.replaceAll("'", "''")
    await writeFile(join(modulePath, 'Microsoft.PowerShell.Security.psm1'),
      "function Get-AuthenticodeSignature { [IO.File]::WriteAllText('" + sentinelLiteral + "', 'loaded'); throw 'synthetic_caller_module_loaded' }\nExport-ModuleMember -Function Get-AuthenticodeSignature\n", 'utf8')
    const before = process.env.PSModulePath
    try {
      process.env.PSModulePath = moduleRoot
      const observation = await inspect(process.execPath)
      assert.ok(observation.signatureStatus.length > 0)
      assert.equal(observation.artifactFileName, basename(process.execPath))
      await assert.rejects(stat(sentinel), { code: 'ENOENT' })
      assert.equal(process.env.PSModulePath, moduleRoot)
    } finally {
      if (before === undefined) delete process.env.PSModulePath
      else process.env.PSModulePath = before
    }
  })
})


test('Windows inspector runtime searches only the pinned Windows module directory', {
  skip: process.platform !== 'win32', timeout: 45000,
}, async () => {
  await withInspectorFixture(
    '[ordered]@{ effectiveModulePath = $env:PSModulePath } | ConvertTo-Json -Compress\n',
    async (inspect) => {
      const observation = await inspect(process.execPath)
      assert.equal(observation.effectiveModulePath,
        'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\Modules')
    },
  )
})
