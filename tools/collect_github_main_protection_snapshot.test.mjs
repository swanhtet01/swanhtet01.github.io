import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { access, mkdtemp, readFile, rm, rmdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  GITHUB_MAIN_PROTECTION_SNAPSHOT_CONTRACT,
  buildGitHubMainProtectionSnapshot,
  collectGitHubMainProtectionSnapshot,
  sanitizeBranchSnapshot,
  sanitizeRulesetsSnapshot,
  validateGitHubMainProtectionSnapshot,
} from './collect_github_main_protection_snapshot.mjs'
import { REQUIRED_MAIN_CHECKS } from './verify_github_main_protection.mjs'

const branch = {
  name: 'main',
  protected: false,
  commit: {
    sha: 'a'.repeat(40),
    commit: {
      author: { email: 'private@example.com' },
      verification: { signature: '-----BEGIN PGP SIGNATURE-----\nignored\n-----END PGP SIGNATURE-----' },
    },
  },
  protection: { enabled: false, required_status_checks: { contexts: [], checks: [] } },
}

const rulesets = [{
  id: 123,
  node_id: 'private-node-id-not-needed',
  name: 'SuperMega main release gate',
  target: 'branch',
  enforcement: 'active',
  conditions: { ref_name: { include: ['refs/heads/main'], exclude: [] } },
  rules: [
    { type: 'deletion' },
    { type: 'non_fast_forward' },
    { type: 'pull_request', parameters: { required_review_thread_resolution: true, required_approving_review_count: 1 } },
    {
      type: 'required_status_checks',
      parameters: { required_status_checks: REQUIRED_MAIN_CHECKS.map((context) => ({ context, integration_id: 999 })) },
    },
  ],
}]

const listedRuleset = {
  id: 123,
  name: 'SuperMega main release gate',
  target: 'branch',
  enforcement: 'active',
  rules: [],
}

function jsonResponse(body) {
  return {
    ok: true,
    status: 200,
    async text() {
      return JSON.stringify(body)
    },
  }
}

function reseal(packet) {
  const body = JSON.parse(JSON.stringify(packet))
  delete body.digest
  return {
    ...body,
    digest: `sha256:${createHash('sha256').update(JSON.stringify(body)).digest('hex')}`,
  }
}

async function assertOutputsAbsent(paths) {
  for (const path of paths) {
    await assert.rejects(access(path), (error) => error?.code === 'ENOENT')
  }
}

async function removeTestDirectory(directory, paths) {
  for (const path of paths) await rm(path, { force: true })
  await rmdir(directory)
}

test('sanitizes branch snapshots down to verifier fields and removes identity details', () => {
  const sanitized = sanitizeBranchSnapshot(branch)
  assert.equal(sanitized.name, 'main')
  assert.equal(sanitized.commit.sha, 'a'.repeat(40))
  const text = JSON.stringify(sanitized)
  assert.ok(!text.includes('private@example.com'))
  assert.ok(!text.includes('PGP SIGNATURE'))
})

test('builds failing live-style packet for unprotected main and empty rulesets', () => {
  const packet = buildGitHubMainProtectionSnapshot({
    generatedAt: '2026-08-25T00:00:00.000Z',
    branch,
    rulesets: [],
    tokenEnv: null,
  })
  assert.equal(packet.contract, GITHUB_MAIN_PROTECTION_SNAPSHOT_CONTRACT)
  assert.equal(packet.assessment.ok, false)
  assert.ok(packet.assessment.failures.includes('main_unprotected'))
  assert.equal(packet.currentAction, 'apply_github_main_protection_after_owner_approval')
  assert.equal(packet.controls.githubWritesPerformed, false)
  assert.equal(validateGitHubMainProtectionSnapshot(packet), packet)
})

test('passes when an active ruleset covers main with required checks', () => {
  const packet = buildGitHubMainProtectionSnapshot({
    generatedAt: '2026-08-25T00:00:00.000Z',
    branch,
    rulesets,
    tokenEnv: 'GITHUB_TOKEN',
  })
  assert.equal(packet.assessment.ok, true)
  assert.equal(packet.source.tokenPresent, true)
  assert.equal(packet.source.tokenValueExposed, false)
  assert.equal(packet.currentAction, 'main_protection_verified_continue_to_review_branch_push')
  assert.deepEqual(packet.assessment.observedRequiredChecks.sort(), [...REQUIRED_MAIN_CHECKS].sort())
  assert.ok(!JSON.stringify(packet).includes('ghp_'))
})

test('ruleset sanitizer keeps only protection-relevant fields', () => {
  const sanitized = sanitizeRulesetsSnapshot(rulesets)
  assert.deepEqual(sanitized[0].rules.map((rule) => rule.type), ['deletion', 'non_fast_forward', 'pull_request', 'required_status_checks'])
  assert.ok(!JSON.stringify(sanitized).includes('private-node-id-not-needed'))
  assert.ok(!JSON.stringify(sanitized).includes('integration_id'))
})

test('collector expands ruleset list entries before protection assessment', async () => {
  const calls = []
  const request = async (url) => {
    calls.push(String(url))
    let body
    if (String(url).endsWith('/branches/main')) body = branch
    else if (String(url).endsWith('/rulesets')) body = [listedRuleset]
    else if (String(url).endsWith('/rulesets/123')) body = rulesets[0]
    else throw new Error(`unexpected_url:${url}`)
    return {
      ok: true,
      status: 200,
      async text() {
        return JSON.stringify(body)
      },
    }
  }
  const { packet } = await collectGitHubMainProtectionSnapshot({ request, env: {} })
  assert.equal(packet.assessment.ok, true)
  assert.deepEqual(calls.map((url) => url.slice(url.indexOf('/repos/'))), [
    '/repos/swanhtet01/swanhtet01.github.io/branches/main',
    '/repos/swanhtet01/swanhtet01.github.io/rulesets',
    '/repos/swanhtet01/swanhtet01.github.io/rulesets/123',
  ])
  assert.equal(Object.hasOwn(listedRuleset, 'conditions'), false)
  assert.deepEqual(packet.rulesets, sanitizeRulesetsSnapshot(rulesets))
})

test('collector retries the full ruleset endpoint after a transient required-detail failure', async () => {
  let listCalls = 0
  let detailCalls = 0
  const delays = []
  const { packet } = await collectGitHubMainProtectionSnapshot({
    attempts: 2,
    request: async (url) => {
      if (String(url).endsWith('/branches/main')) return jsonResponse(branch)
      if (String(url).endsWith('/rulesets')) {
        listCalls += 1
        return jsonResponse([listedRuleset])
      }
      if (String(url).endsWith('/rulesets/123')) {
        detailCalls += 1
        return jsonResponse(detailCalls === 1 ? null : rulesets[0])
      }
      throw new Error(`unexpected_url:${url}`)
    },
    env: {},
    delay: async (milliseconds) => delays.push(milliseconds),
  })
  assert.equal(listCalls, 2)
  assert.equal(detailCalls, 2)
  assert.deepEqual(delays, [250])
  assert.equal(packet.assessment.ok, true)
  assert.deepEqual(packet.rulesets, sanitizeRulesetsSnapshot(rulesets))
})

test('collector rejects mismatched shared identity and empty required details after bounded retries without writing', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'supermega-main-protection-detail-no-write-'))
  const paths = [join(directory, 'snapshot.json'), join(directory, 'branch.json'), join(directory, 'rulesets.json')]
  const invalidDetails = [
    { ...rulesets[0], id: 999 },
    { ...rulesets[0], name: 'Different release gate' },
    { ...rulesets[0], target: 'tag' },
    { ...rulesets[0], enforcement: 'disabled' },
    { ...rulesets[0], rules: [] },
  ]
  let listCalls = 0
  let detailCalls = 0
  try {
    await assert.rejects(
      collectGitHubMainProtectionSnapshot({
        outputPath: paths[0],
        branchOutputPath: paths[1],
        rulesetsOutputPath: paths[2],
        attempts: 5,
        request: async (url) => {
          if (String(url).endsWith('/branches/main')) return jsonResponse(branch)
          if (String(url).endsWith('/rulesets')) {
            listCalls += 1
            return jsonResponse([listedRuleset])
          }
          if (String(url).endsWith('/rulesets/123')) {
            const response = invalidDetails[detailCalls]
            detailCalls += 1
            return jsonResponse(response)
          }
          throw new Error(`unexpected_url:${url}`)
        },
        env: {},
        delay: async () => {},
      }),
      /github_main_protection_snapshot_unavailable:github_main_protection_snapshot_ruleset_detail_invalid/,
    )
    assert.equal(listCalls, 5)
    assert.equal(detailCalls, 5)
    await assertOutputsAbsent(paths)
  } finally {
    await removeTestDirectory(directory, paths)
  }
})

test('collector retries null and non-record branch responses before writing one complete packet', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'supermega-main-protection-retry-'))
  const outputPath = join(directory, 'snapshot.json')
  const branchOutputPath = join(directory, 'branch.json')
  const rulesetsOutputPath = join(directory, 'rulesets.json')
  const branchResponses = [null, [], branch]
  const delays = []
  let branchCalls = 0
  let rulesetsCalls = 0
  const request = async (url) => {
    if (String(url).endsWith('/branches/main')) {
      const response = branchResponses[branchCalls]
      branchCalls += 1
      return jsonResponse(response)
    }
    if (String(url).endsWith('/rulesets')) {
      rulesetsCalls += 1
      return jsonResponse(rulesets)
    }
    throw new Error(`unexpected_url:${url}`)
  }
  try {
    const result = await collectGitHubMainProtectionSnapshot({
      outputPath,
      branchOutputPath,
      rulesetsOutputPath,
      request,
      env: {},
      attempts: 3,
      delay: async (milliseconds) => delays.push(milliseconds),
    })
    assert.equal(branchCalls, 3)
    assert.equal(rulesetsCalls, 1)
    assert.deepEqual(delays, [250, 500])
    assert.equal(result.packet.assessment.ok, true)
    assert.equal(result.packet.source.branchEvidence.kind, 'github_branch_endpoint')
    assert.equal(result.packet.source.branchEvidence.fallbackUsed, false)
    assert.deepEqual(JSON.parse(await readFile(outputPath, 'utf8')), result.packet)
    assert.deepEqual(JSON.parse(await readFile(branchOutputPath, 'utf8')), result.packet.branch)
    assert.deepEqual(JSON.parse(await readFile(rulesetsOutputPath, 'utf8')), result.packet.rulesets)
  } finally {
    await removeTestDirectory(directory, [outputPath, branchOutputPath, rulesetsOutputPath])
  }
})

test('collector requires an explicit expected main after bounded branch exhaustion and writes nothing', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'supermega-main-protection-no-write-'))
  const outputPath = join(directory, 'snapshot.json')
  const branchOutputPath = join(directory, 'branch.json')
  const rulesetsOutputPath = join(directory, 'rulesets.json')
  let branchCalls = 0
  const request = async (url) => {
    assert.ok(String(url).endsWith('/branches/main'))
    branchCalls += 1
    return jsonResponse(null)
  }
  try {
    await assert.rejects(
      collectGitHubMainProtectionSnapshot({
        outputPath,
        branchOutputPath,
        rulesetsOutputPath,
        request,
        env: {},
        attempts: 3,
        delay: async () => {},
      }),
      /github_main_protection_snapshot_expected_main_required:github_main_protection_snapshot_branch_invalid/,
    )
    assert.equal(branchCalls, 3)
    await assertOutputsAbsent([outputPath, branchOutputPath, rulesetsOutputPath])
  } finally {
    await removeTestDirectory(directory, [outputPath, branchOutputPath, rulesetsOutputPath])
  }
})

test('collector prefers the real branch endpoint when it matches the expected remote main', async () => {
  let branchCalls = 0
  let rulesetsCalls = 0
  const { packet } = await collectGitHubMainProtectionSnapshot({
    expectedMainCommit: branch.commit.sha,
    request: async (url) => {
      if (String(url).endsWith('/branches/main')) {
        branchCalls += 1
        return jsonResponse(branch)
      }
      if (String(url).endsWith('/rulesets')) {
        rulesetsCalls += 1
        return jsonResponse(rulesets)
      }
      throw new Error(`unexpected_url:${url}`)
    },
    env: {},
    delay: async () => {},
  })
  assert.equal(branchCalls, 1)
  assert.equal(rulesetsCalls, 1)
  assert.deepEqual(packet.source.branchEvidence, {
    kind: 'github_branch_endpoint',
    branchEndpointAvailable: true,
    expectedRemoteMainCommit: branch.commit.sha,
    fallbackUsed: false,
    classicBranchProtectionEvidence: 'endpoint_observed',
  })
})

test('collector uses only the exact expected main fallback after branch exhaustion and relies on complete active rulesets', async () => {
  let branchCalls = 0
  let rulesetsCalls = 0
  const { packet } = await collectGitHubMainProtectionSnapshot({
    expectedMainCommit: branch.commit.sha,
    attempts: 2,
    request: async (url) => {
      if (String(url).endsWith('/branches/main')) {
        branchCalls += 1
        return jsonResponse(null)
      }
      if (String(url).endsWith('/rulesets')) {
        rulesetsCalls += 1
        return jsonResponse(rulesets)
      }
      throw new Error(`unexpected_url:${url}`)
    },
    env: {},
    delay: async () => {},
  })
  assert.equal(branchCalls, 2)
  assert.equal(rulesetsCalls, 1)
  assert.equal(packet.assessment.ok, true)
  assert.deepEqual(packet.branch, {
    name: 'main',
    protected: false,
    commit: { sha: branch.commit.sha },
    protection: {
      enabled: false,
      required_status_checks: { contexts: [], checks: [] },
      allow_force_pushes: null,
      allow_deletions: null,
      required_pull_request_reviews: null,
      required_conversation_resolution: null,
    },
  })
  assert.deepEqual(packet.source.branchEvidence, {
    kind: 'expected_remote_main_fallback',
    branchEndpointAvailable: false,
    expectedRemoteMainCommit: branch.commit.sha,
    fallbackUsed: true,
    classicBranchProtectionEvidence: 'unavailable_not_claimed',
  })
})

test('collector rejects malformed or mismatched expected main bindings before fallback', async () => {
  let requests = 0
  await assert.rejects(
    collectGitHubMainProtectionSnapshot({
      expectedMainCommit: 'not-a-commit',
      request: async () => { requests += 1; return jsonResponse(branch) },
      env: {},
    }),
    /github_main_protection_snapshot_expected_main_invalid/,
  )
  assert.equal(requests, 0)

  await assert.rejects(
    collectGitHubMainProtectionSnapshot({
      expectedMainCommit: 'b'.repeat(40),
      request: async (url) => {
        requests += 1
        assert.ok(String(url).endsWith('/branches/main'))
        return jsonResponse(branch)
      },
      env: {},
    }),
    /github_main_protection_snapshot_expected_main_mismatch/,
  )
  assert.equal(requests, 1)
})

test('fallback rejects incomplete rulesets and writes no partial output', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'supermega-main-protection-fallback-no-write-'))
  const paths = [join(directory, 'snapshot.json'), join(directory, 'branch.json'), join(directory, 'rulesets.json')]
  try {
    await assert.rejects(
      collectGitHubMainProtectionSnapshot({
        outputPath: paths[0],
        branchOutputPath: paths[1],
        rulesetsOutputPath: paths[2],
        expectedMainCommit: branch.commit.sha,
        attempts: 2,
        request: async (url) => jsonResponse(String(url).endsWith('/branches/main') ? null : []),
        env: {},
        delay: async () => {},
      }),
      /github_main_protection_snapshot_fallback_rulesets_incomplete/,
    )
    await assertOutputsAbsent(paths)
  } finally {
    await removeTestDirectory(directory, paths)
  }
})

test('fallback provenance is digest-bound and rejects an internally inconsistent resealed binding', async () => {
  const { packet } = await collectGitHubMainProtectionSnapshot({
    expectedMainCommit: branch.commit.sha,
    attempts: 1,
    request: async (url) => jsonResponse(String(url).endsWith('/branches/main') ? null : rulesets),
    env: {},
    delay: async () => {},
  })
  const tampered = JSON.parse(JSON.stringify(packet))
  tampered.source.branchEvidence.expectedRemoteMainCommit = 'b'.repeat(40)
  assert.throws(
    () => validateGitHubMainProtectionSnapshot(reseal(tampered)),
    /github_main_protection_snapshot_fallback_branch_invalid/,
  )
  const missingProvenance = JSON.parse(JSON.stringify(packet))
  delete missingProvenance.source.branchEvidence
  assert.throws(
    () => validateGitHubMainProtectionSnapshot(reseal(missingProvenance)),
    /github_main_protection_snapshot_branch_evidence_invalid/,
  )
  const inventedProvenance = JSON.parse(JSON.stringify(packet))
  inventedProvenance.source.branchEndpointClaim = 'available'
  assert.throws(
    () => validateGitHubMainProtectionSnapshot(reseal(inventedProvenance)),
    /github_main_protection_snapshot_source_invalid/,
  )
})

test('endpoint provenance rejects null or malformed branch commits even after resealing', () => {
  const packet = buildGitHubMainProtectionSnapshot({
    generatedAt: '2026-08-25T00:00:00.000Z',
    branch,
    rulesets,
  })
  for (const invalidCommit of [null, 'not-a-commit']) {
    const tampered = JSON.parse(JSON.stringify(packet))
    tampered.branch.commit.sha = invalidCommit
    assert.throws(
      () => validateGitHubMainProtectionSnapshot(reseal(tampered)),
      /github_main_protection_snapshot_branch_commit_invalid/,
    )
  }
})

test('rejects tampered write controls and digest mismatch', () => {
  const packet = buildGitHubMainProtectionSnapshot({
    generatedAt: '2026-08-25T00:00:00.000Z',
    branch,
    rulesets: [],
  })
  assert.throws(() => validateGitHubMainProtectionSnapshot({
    ...packet,
    controls: { ...packet.controls, githubWritesPerformed: true },
  }), /github_main_protection_snapshot_control_not_false/)
  assert.throws(() => validateGitHubMainProtectionSnapshot({
    ...packet,
    currentAction: 'main_protection_verified_continue_to_review_branch_push',
  }), /github_main_protection_snapshot_action_invalid/)
})
