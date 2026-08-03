import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import test from 'node:test'

import {
  buildSupabaseRehearsalPacket,
  validateSupabaseRehearsalPacket,
} from './prepare_supabase_rehearsal_packet.mjs'

const repositoryRoot = resolve(import.meta.dirname, '..')
const targetProjectRef = 'abcdefghijklmnopqrst'
const releaseCommit = 'a'.repeat(40)
const generatedAt = '2026-08-03T00:00:00.000Z'

test('builds an exact non-mutating v9 rehearsal packet', async () => {
  const manifest = JSON.parse(await readFile(resolve(repositoryRoot, 'package.json'), 'utf8'))
  const ignoreRules = await readFile(resolve(repositoryRoot, '.gitignore'), 'utf8')
  const runbook = await readFile(resolve(repositoryRoot, 'docs', 'supermega-enterprise-activation.md'), 'utf8')
  const packet = await buildSupabaseRehearsalPacket({
    repositoryRoot,
    targetProjectRef,
    releaseCommit,
    generatedAt,
  })
  await validateSupabaseRehearsalPacket(packet, { repositoryRoot, expectedReleaseCommit: releaseCommit })

  assert.equal(packet.contract, 'supermega.supabase-rehearsal-packet.v1')
  assert.equal(packet.state, 'prepared-not-executed')
  assert.equal(packet.release.schemaVersion, 9)
  assert.equal(packet.release.migrationCount, 10)
  assert.equal(packet.release.migrations.at(-1).name, '20260803063822_private_trial_backend_v9_metadata_rls.sql')
  assert.equal(packet.authority.rehearsalProjectRef, targetProjectRef)
  assert.equal(packet.controls.activationAllowed, false)
  assert.equal(packet.controls.externalMutationPerformed, false)
  assert.match(packet.packetDigest, /^sha256:[0-9a-f]{64}$/)
  assert.doesNotMatch(JSON.stringify(packet), /postgres(?:ql)?:\/\//i)
  assert.equal(manifest.scripts['database:supabase:packet'], 'node tools/prepare_supabase_rehearsal_packet.mjs')
  assert.match(ignoreRules, /^\.tmp\/$/m)
  assert.match(runbook, /all ten migrations/)
  assert.match(runbook, /Runtime readiness requires schema version 9/)
  assert.match(runbook, /database:supabase:packet:verify/)
})

test('rejects the protected production project', async () => {
  const manifest = JSON.parse(await readFile(resolve(repositoryRoot, 'package.json'), 'utf8'))
  await assert.rejects(
    buildSupabaseRehearsalPacket({
      repositoryRoot,
      targetProjectRef: manifest.supermega.productionSupabaseProjectRef,
      releaseCommit,
      generatedAt,
    }),
    /supabase_rehearsal_target_is_production/,
  )
})

test('rejects malformed target refs and stale evidence', async () => {
  await assert.rejects(
    buildSupabaseRehearsalPacket({ repositoryRoot, targetProjectRef: 'not-a-ref', releaseCommit, generatedAt }),
    /supabase_rehearsal_target_ref_invalid/,
  )

  const packet = await buildSupabaseRehearsalPacket({
    repositoryRoot,
    targetProjectRef,
    releaseCommit,
    generatedAt,
  })
  packet.release.migrations[0].sha256 = '0'.repeat(64)
  await assert.rejects(
    validateSupabaseRehearsalPacket(packet, { repositoryRoot, expectedReleaseCommit: releaseCommit }),
    /supabase_rehearsal_packet_evidence_stale/,
  )
})
