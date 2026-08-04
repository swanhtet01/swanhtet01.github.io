import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  RUNTIME_TRUTH_CONTRACT,
  buildRuntimeTruth,
  validateRuntimeTruthPacket,
  writeExclusiveJson,
} from './report_supermega_runtime_truth.mjs'

const sha = (value) => value.repeat(40)
const digest = (value) => `sha256:${value.repeat(64)}`
const products = [
  { id: 'shop', path: '/shop/', status: 'release-candidate-local' },
  { id: 'plant', path: '/plant/', status: 'release-candidate-local' },
  { id: 'website', path: '/website/', status: 'release-candidate-local' },
  { id: 'ecommerce', path: '/ecommerce/', status: 'release-candidate-local' },
]
const manifestProducts = products.map((product) => ({
  id: product.id,
  publicAnchor: product.path,
  appRoute: `https://app.supermega.dev${product.path}`,
  status: product.id === 'ecommerce' ? 'release-candidate-local' : 'available-in-app',
}))

function valid(overrides = {}) {
  const head = sha('a')
  const live = { commit: sha('b'), brandVersion: 'jade-v2', contextVersion: '2026-08-04.1', catalogVersion: '2026-08-04.1' }
  return {
    generatedAt: '2026-08-05T12:00:00.000Z',
    repository: 'swanhtet01/swanhtet01.github.io',
    origin: 'https://github.com/swanhtet01/swanhtet01.github.io.git',
    local: { branch: 'codex/supermega-enterprise', head, clean: true, trackingMain: sha('c') },
    remote: { mainCommit: sha('c'), candidateCommit: null },
    live: { app: live, public: live },
    relations: {
      trackingMatchesRemote: true,
      remoteMain: { objectAvailable: true, isAncestor: true, headAhead: 92, headBehind: 0 },
      liveApp: { objectAvailable: true, isAncestor: true, headAhead: 98, headBehind: 0 },
      livePublic: { objectAvailable: true, isAncestor: true, headAhead: 98, headBehind: 0 },
      remoteCandidate: null,
    },
    managed: {
      contract: 'supermega.managed-pilot-readiness.v1',
      asOf: '2026-08-04T10:56:25.412Z',
      sourceDigest: digest('d'),
      status: 'blocked',
      hostedActivationReady: false,
      blockingGateCount: 2,
      gates: [
        { id: 'hosted_postgres17', status: 'blocked' },
        { id: 'named_pilot', status: 'blocked' },
        { id: 'local_postgres17', status: 'ready-local' },
      ],
    },
    routes: {
      appProductRoutes: ['/ecommerce/', '/plant/', '/shop/', '/website/'],
      appDeclaredPaths: ['*', 'ecommerce/*', 'plant/*', 'shop/*', 'website/*'],
      publicPageRoutes: ['/', '/contact/', '/ecommerce/', '/plant/', '/privacy/', '/shop/', '/website/'],
      portfolioProducts: products,
      manifestProducts,
      appSourceDigest: digest('e'),
      manifestDigest: digest('f'),
      portfolioDigest: digest('1'),
    },
    migrations: {
      count: 2,
      files: [
        'supabase/migrations/20260803063822_private_trial_backend_v9_metadata_rls.sql',
        'supabase/migrations/20260804102000_private_trial_backend_v10_supabase_session_revocation.sql',
      ],
      latest: 'supabase/migrations/20260804102000_private_trial_backend_v10_supabase_session_revocation.sql',
      aggregateDigest: digest('2'),
      quarantineDigest: digest('3'),
    },
    gates: { hqVerify: 'passed', appVerify: 'not_run', renderedRoutes: 'not_run', hostedActivation: 'not_proven' },
    ...overrides,
  }
}

test('runtime truth identifies one unpublished candidate ahead of paired live and main', () => {
  const packet = buildRuntimeTruth(valid())
  assert.equal(packet.contract, RUNTIME_TRUTH_CONTRACT)
  assert.equal(packet.assessment.releaseStatus, 'candidate_ahead_review_required')
  assert.equal(packet.assessment.remoteCandidateState, 'unpublished')
  assert.equal(packet.assessment.managedStatus, 'managed_activation_blocked')
  assert.equal(packet.assessment.productCount, 4)
  assert.equal(packet.assessment.publicPageCount, 7)
  assert.equal(packet.authority.remoteWritesPerformed, false)
  assert.equal(packet.authority.deploymentApproved, false)
  assert.equal(validateRuntimeTruthPacket(packet).digest, packet.digest)
})

test('live mismatch and stale tracking remain explicit instead of becoming release claims', () => {
  const mismatched = buildRuntimeTruth(valid({
    live: {
      ...valid().live,
      public: { ...valid().live.public, contextVersion: '2026-08-05.2' },
    },
  }))
  assert.equal(mismatched.assessment.releaseStatus, 'live_pair_mismatch')
  assert.equal(mismatched.assessment.nextAction, 'investigate_live_pair_before_release_work')

  const stale = buildRuntimeTruth(valid({
    remote: { mainCommit: sha('9'), candidateCommit: null },
    relations: { ...valid().relations, trackingMatchesRemote: false },
  }))
  assert.equal(stale.assessment.releaseStatus, 'remote_tracking_stale')
  assert.equal(stale.assessment.nextAction, 'refresh_origin_main_then_regenerate')
})

test('route, readiness, authority, and digest tampering fail closed', () => {
  assert.throws(() => buildRuntimeTruth(valid({
    routes: { ...valid().routes, appProductRoutes: ['/shop/', '/plant/', '/website/'] },
  })), /runtime_truth_app_routes_invalid/)
  assert.throws(() => buildRuntimeTruth(valid({
    managed: { ...valid().managed, blockingGateCount: 1 },
  })), /runtime_truth_managed_state_invalid/)
  const forged = buildRuntimeTruth(valid())
  forged.authority.deploymentApproved = true
  assert.throws(() => validateRuntimeTruthPacket(forged), /runtime_truth_packet_invalid/)
})

test('truth output is digest-bound, exclusive, and non-overwriting', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'supermega-runtime-truth-'))
  const output = join(directory, 'truth.json')
  try {
    const packet = buildRuntimeTruth(valid())
    const receipt = await writeExclusiveJson(output, packet)
    assert.equal(receipt.bytes > 0, true)
    assert.equal(JSON.parse(await readFile(output, 'utf8')).digest, packet.digest)
    await assert.rejects(() => writeExclusiveJson(output, packet), /runtime_truth_output_exists/)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
