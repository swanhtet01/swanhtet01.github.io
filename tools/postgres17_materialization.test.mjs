import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { link, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  POSTGRES17_MATERIALIZATION_CONTRACT,
  inspectPostgres17MaterializationEvidence,
  inventoryPostgres17MaterializedTree,
  verifyDeterministicMaterializationPasses,
  verifyPostgres17MaterializedTree,
  verifyTwoPassMaterializationRoots,
} from './postgres17_materialization.mjs'

const sha256 = (value) => createHash('sha256').update(value).digest('hex')

function fixture() {
  const postgres = Buffer.from('postgres bytes')
  const libpq = Buffer.from('libpq bytes')
  const archiveSha256 = sha256('installer')
  const profile = {
    archive: { sha256: archiveSha256 },
    extractedRootName: 'pgsql',
    artifacts: [{
      role: 'postgres', relativePath: 'bin/postgres.exe', bytes: postgres.length,
      sha256: sha256(postgres), sourceArtifactSha256: archiveSha256,
    }],
    dependencies: [{
      role: 'libpq', relativePath: 'bin/libpq.dll', bytes: libpq.length,
      sha256: sha256(libpq), sourceArtifactSha256: archiveSha256,
    }],
  }
  const evidence = {
    contract: POSTGRES17_MATERIALIZATION_CONTRACT,
    status: 'reviewed',
    method: 'two-pass-reviewed-installer-v1',
    sourceArtifactSha256: archiveSha256,
    outputRootName: 'pgsql',
    installerArguments: ['--mode', 'unattended', '--prefix', '{destination}'],
    directories: ['bin'],
    files: [
      { relativePath: 'bin/postgres.exe', bytes: postgres.length, sha256: sha256(postgres) },
      { relativePath: 'bin/libpq.dll', bytes: libpq.length, sha256: sha256(libpq) },
    ],
    approval: {
      status: 'reviewed', reviewedBy: 'synthetic-reviewer',
      reviewedAt: '2026-10-31T00:00:00.000Z',
    },
  }
  return { profile, evidence, postgres, libpq }
}

async function writeTree(root, input = fixture()) {
  await mkdir(join(root, 'bin'), { recursive: true })
  await writeFile(join(root, 'bin', 'postgres.exe'), input.postgres)
  await writeFile(join(root, 'bin', 'libpq.dll'), input.libpq)
}

test('reviewed materialization manifest binds the signed installer and every execution binding', () => {
  const input = fixture()
  const result = inspectPostgres17MaterializationEvidence(input.profile, input.evidence)
  assert.equal(result.files.length, 2)
  const wrongInstaller = structuredClone(input.evidence)
  wrongInstaller.sourceArtifactSha256 = sha256('different installer')
  assert.throws(
    () => inspectPostgres17MaterializationEvidence(input.profile, wrongInstaller),
    /materialization_manifest_invalid/,
  )
  const partial = structuredClone(input.evidence)
  partial.files.pop()
  assert.throws(
    () => inspectPostgres17MaterializationEvidence(input.profile, partial),
    /materialization_binding_mismatch/,
  )
})

test('exact materialized tree passes and extra or missing files fail closed', async () => {
  const input = fixture()
  const root = await mkdtemp(join(tmpdir(), 'supermega-pg17-materialized-'))
  try {
    await writeTree(root, input)
    assert.equal((await verifyPostgres17MaterializedTree({ ...input, root })).files.length, 2)
    await writeFile(join(root, 'bin', 'extra.dll'), 'extra')
    await assert.rejects(
      verifyPostgres17MaterializedTree({ ...input, root }),
      /materialization_tree_mismatch/,
    )
    await rm(join(root, 'bin', 'extra.dll'))
    await rm(join(root, 'bin', 'libpq.dll'))
    await assert.rejects(
      verifyPostgres17MaterializedTree({ ...input, root }),
      /materialization_tree_mismatch/,
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('traversal, alternate-stream syntax, and case-fold collisions are rejected', () => {
  for (const relativePath of ['../escape', '/absolute', 'bin\\postgres.exe', 'bin/file:stream']) {
    const input = fixture()
    input.evidence.files[0].relativePath = relativePath
    assert.throws(
      () => inspectPostgres17MaterializationEvidence(input.profile, input.evidence),
      /materialization_manifest_invalid/,
    )
  }
  const input = fixture()
  input.evidence.files[1].relativePath = 'BIN/POSTGRES.EXE'
  assert.throws(
    () => inspectPostgres17MaterializationEvidence(input.profile, input.evidence),
    /materialization_case_collision/,
  )
})

test('symlinked materialization entries fail as reparse points', async () => {
  const input = fixture()
  const root = await mkdtemp(join(tmpdir(), 'supermega-pg17-materialized-link-'))
  const outside = join(root, 'outside')
  try {
    await writeFile(outside, input.postgres)
    await mkdir(join(root, 'bin'))
    await symlink(outside, join(root, 'bin', 'postgres.exe'))
    await writeFile(join(root, 'bin', 'libpq.dll'), input.libpq)
    await assert.rejects(
      inventoryPostgres17MaterializedTree(root),
      /materialization_reparse_point/,
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('hard-linked materialization entries fail closed', async () => {
  const input = fixture()
  const root = await mkdtemp(join(tmpdir(), 'supermega-pg17-materialized-hardlink-'))
  try {
    await mkdir(join(root, 'bin'))
    await writeFile(join(root, 'source'), input.postgres)
    await link(join(root, 'source'), join(root, 'bin', 'postgres.exe'))
    await writeFile(join(root, 'bin', 'libpq.dll'), input.libpq)
    await assert.rejects(
      inventoryPostgres17MaterializedTree(root),
      /materialization_hardlink/,
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('two materialization passes must be byte-identical', () => {
  const input = fixture()
  const inventory = inspectPostgres17MaterializationEvidence(input.profile, input.evidence)
  assert.deepEqual(verifyDeterministicMaterializationPasses(inventory, inventory), inventory)
  const changed = structuredClone(inventory)
  changed.files[0].sha256 = sha256('changed')
  assert.throws(
    () => verifyDeterministicMaterializationPasses(inventory, changed),
    /materialization_nondeterministic/,
  )
})

test('integrated two-pass verifier requires distinct exact roots', async () => {
  const input = fixture()
  const firstRoot = await mkdtemp(join(tmpdir(), 'supermega-pg17-pass-a-'))
  const secondRoot = await mkdtemp(join(tmpdir(), 'supermega-pg17-pass-b-'))
  try {
    await writeTree(firstRoot, input)
    await writeTree(secondRoot, input)
    const result = await verifyTwoPassMaterializationRoots({
      ...input, firstRoot, secondRoot,
    })
    assert.equal(result.files.length, 2)
    await assert.rejects(
      verifyTwoPassMaterializationRoots({
        ...input, firstRoot, secondRoot: firstRoot,
      }),
      /materialization_passes_invalid/,
    )
    await writeFile(join(secondRoot, 'bin', 'postgres.exe'), 'changed')
    await assert.rejects(
      verifyTwoPassMaterializationRoots({ ...input, firstRoot, secondRoot }),
      /materialization_tree_mismatch/,
    )
  } finally {
    await rm(firstRoot, { recursive: true, force: true })
    await rm(secondRoot, { recursive: true, force: true })
  }
})
