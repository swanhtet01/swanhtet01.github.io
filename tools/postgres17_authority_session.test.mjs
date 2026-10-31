import assert from 'node:assert/strict'
import { chmod, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  POSTGRES17_AUTHORITY_REQUEST_CONTRACT,
  buildPostgres17AuthorityRequest,
  claimPostgres17AuthorityRequest,
  validatePostgres17AuthorityRequest,
  writePostgres17AuthorityRequest,
} from './postgres17_authority_session.mjs'

const issued = Date.parse('2026-10-31T07:00:00.000Z')

function fixture(root = '/verified/pgsql') {
  const request = {
    contract: POSTGRES17_AUTHORITY_REQUEST_CONTRACT,
    authoritative: false,
    sessionId: '1'.repeat(32),
    nonce: '2'.repeat(64),
    issuedAt: new Date(issued).toISOString(),
    expiresAt: new Date(issued + 60_000).toISOString(),
    source: {
      head: '3'.repeat(40),
      tree: '4'.repeat(40),
      implementationDigest: `sha256:${'5'.repeat(64)}`,
    },
    toolchain: {
      profileId: 'synthetic-profile',
      manifestSha256: '6'.repeat(64),
      policyId: 'synthetic-policy',
      policySha256: '7'.repeat(64),
      sourceArtifactSha256: '8'.repeat(64),
      materializationEvidenceSha256: '9'.repeat(64),
      materializationInventorySha256: 'd'.repeat(64),
      loadClosureEvidenceSha256: 'a'.repeat(64),
      executionBundleSha256: 'b'.repeat(64),
    },
    execution: {
      archivePath: '/verified/postgresql-installer.exe',
      root,
      postgresBin: `${root}/bin`,
      openssl: `${root}/bin/openssl.exe`,
      python: `${root}/python/python.exe`,
      psycopg: `${root}/python/Lib/site-packages/psycopg/__init__.py`,
    },
    materialization: {
      firstRoot: root,
      secondRoot: `${root}-second`,
    },
    parent: {
      pid: 1234,
      executablePath: '/verified/node',
      executableSha256: 'c'.repeat(64),
    },
  }
  return { request, expected: structuredClone(request) }
}

test('fresh request is a correlation record and never declares itself authoritative', () => {
  const { request, expected } = fixture()
  const result = validatePostgres17AuthorityRequest(request, expected, { now: issued + 1_000 })
  assert.equal(result.authoritative, false)
  assert.match(result.digest, /^[0-9a-f]{64}$/)
})

test('builder emits a bounded non-authoritative request', () => {
  const { request } = fixture()
  const built = buildPostgres17AuthorityRequest({
    source: request.source,
    toolchain: request.toolchain,
    execution: request.execution,
    materialization: request.materialization,
    parent: request.parent,
    now: issued,
    lifetimeMs: 60_000,
    sessionId: request.sessionId,
    nonce: request.nonce,
  })
  assert.deepEqual(built, request)
})

test('mismatched source, policy, profile, execution path, nonce, or session fails closed', () => {
  for (const mutate of [
    (value) => { value.source.tree = 'c'.repeat(40) },
    (value) => { value.toolchain.manifestSha256 = 'c'.repeat(64) },
    (value) => { value.toolchain.profileId = 'substituted-profile' },
    (value) => { value.toolchain.policyId = 'substituted-policy' },
    (value) => { value.toolchain.policySha256 = 'c'.repeat(64) },
    (value) => { value.execution.python = '/substituted/python.exe' },
    (value) => { value.nonce = 'c'.repeat(64) },
    (value) => { value.sessionId = 'c'.repeat(32) },
    (value) => { value.parent.pid += 1 },
    (value) => { value.materialization.secondRoot = '/substituted/second' },
  ]) {
    const { request, expected } = fixture()
    mutate(request)
    assert.throws(
      () => validatePostgres17AuthorityRequest(request, expected, { now: issued + 1_000 }),
      /authority_request_(?:invalid|mismatch)/,
    )
  }
})

test('stale, future, or overlong requests fail closed', () => {
  for (const mutate of [
    (value) => { value.expiresAt = new Date(issued - 1).toISOString() },
    (value) => { value.issuedAt = new Date(issued + 10_000).toISOString() },
    (value) => { value.expiresAt = new Date(issued + 120_001).toISOString() },
  ]) {
    const { request, expected } = fixture()
    mutate(request)
    assert.throws(
      () => validatePostgres17AuthorityRequest(request, expected, { now: issued }),
      /authority_request_stale/,
    )
  }
})

test('freshness fields must exactly match the independently expected session', () => {
  for (const field of ['issuedAt', 'expiresAt']) {
    const { request, expected } = fixture()
    expected[field] = new Date(Date.parse(expected[field]) + 1_000).toISOString()
    assert.throws(
      () => validatePostgres17AuthorityRequest(request, expected, { now: issued + 1_000 }),
      /authority_request_mismatch/,
    )
  }
})

test('paths must be canonical and contained by the materialized root', () => {
  for (const path of ['/outside/python.exe', '/verified/pgsql/../outside', 'relative/python']) {
    const { request, expected } = fixture()
    request.execution.python = path
    expected.execution.python = path
    assert.throws(
      () => validatePostgres17AuthorityRequest(request, expected, { now: issued }),
      /authority_request_invalid/,
    )
  }
})

test('exclusive request is atomically claimed once and replay is rejected', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'supermega-pg17-authority-'))
  try {
    await chmod(directory, 0o700)
    const path = join(directory, 'request.json')
    const { request, expected } = fixture(directory)
    request.execution = {
      archivePath: join(directory, 'postgresql-installer.exe'),
      root: directory,
      postgresBin: join(directory, 'bin'),
      openssl: join(directory, 'bin', 'openssl.exe'),
      python: join(directory, 'python', 'python.exe'),
      psycopg: join(directory, 'python', 'psycopg.py'),
    }
    expected.execution = structuredClone(request.execution)
    request.materialization = {
      firstRoot: directory,
      secondRoot: `${directory}-second`,
    }
    expected.materialization = structuredClone(request.materialization)
    await mkdir(join(directory, 'bin'))
    await mkdir(join(directory, 'python'))
    await writePostgres17AuthorityRequest(path, request)
    const claimed = await claimPostgres17AuthorityRequest(
      path, expected, { now: issued + 1_000 },
    )
    assert.match(claimed.claimedPath, /\.claimed-/)
    await assert.rejects(
      claimPostgres17AuthorityRequest(path, expected, { now: issued + 1_000 }),
      /ENOENT/,
    )
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('group-readable session directories are rejected', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'supermega-pg17-authority-insecure-'))
  try {
    await chmod(directory, 0o750)
    const { request } = fixture(directory)
    await assert.rejects(
      writePostgres17AuthorityRequest(join(directory, 'request.json'), request),
      /authority_request_directory_insecure/,
    )
  } finally {
    await chmod(directory, 0o700)
    await rm(directory, { recursive: true, force: true })
  }
})

test('a symlink cannot substitute for the exclusive request file', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'supermega-pg17-authority-link-'))
  try {
    await chmod(directory, 0o700)
    const real = join(directory, 'real.json')
    const link = join(directory, 'request.json')
    const { request, expected } = fixture(directory)
    request.execution = {
      archivePath: join(directory, 'postgresql-installer.exe'),
      root: directory,
      postgresBin: join(directory, 'bin'),
      openssl: join(directory, 'bin', 'openssl.exe'),
      python: join(directory, 'python', 'python.exe'),
      psycopg: join(directory, 'python', 'psycopg.py'),
    }
    expected.execution = structuredClone(request.execution)
    request.materialization = {
      firstRoot: directory,
      secondRoot: `${directory}-second`,
    }
    expected.materialization = structuredClone(request.materialization)
    await writeFile(real, `${JSON.stringify(request)}\n`, { mode: 0o600 })
    await symlink(real, link)
    await assert.rejects(
      claimPostgres17AuthorityRequest(link, expected, { now: issued + 1_000 }),
      /authority_request_file_insecure/,
    )
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('a self-authored receipt cannot promote a request into authority', () => {
  const { request, expected } = fixture()
  request.authoritative = true
  assert.throws(
    () => validatePostgres17AuthorityRequest(request, expected, { now: issued + 1_000 }),
    /authority_request_invalid/,
  )
})
