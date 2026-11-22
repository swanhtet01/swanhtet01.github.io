import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { basename } from 'node:path'
import test from 'node:test'
import { inspectWindowsAuthenticode } from './postgres17_toolchain_profile.mjs'

test('Windows canonical inspector flushes its final JSON over stdin', {
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
