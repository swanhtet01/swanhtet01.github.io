import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { copyFile, mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
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
    await check(module.inspectWindowsAuthenticode)
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
