#!/usr/bin/env node

import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  assessGitHubMainProtection,
  REQUIRED_MAIN_CHECKS,
} from './verify_github_main_protection.mjs'

export const GITHUB_MAIN_PROTECTION_PROPOSAL_CONTRACT = 'supermega.github-main-protection-proposal.v1'

const root = resolve(import.meta.dirname, '..')
const output = resolve(root, 'hq', 'readiness', 'github-main-protection-proposal.json')
const REPOSITORY = 'swanhtet01/swanhtet01.github.io'
const SOURCES = [
  'package.json',
  'tools/verify_github_main_protection.mjs',
  'tools/prepare_github_main_protection_packet.mjs',
  'tools/apply_github_main_protection.mjs',
]

function fail(code) {
  throw new Error(code)
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function sha256(value) {
  return createHash('sha256').update(String(value || '').replace(/\r\n?/g, '\n')).digest('hex')
}

function digest(value) {
  return `sha256:${sha256(value)}`
}

function buildRulesetPayload() {
  return {
    name: 'SuperMega main release gate',
    target: 'branch',
    enforcement: 'active',
    bypass_actors: [],
    conditions: {
      ref_name: {
        include: ['refs/heads/main'],
        exclude: [],
      },
    },
    rules: [
      { type: 'deletion' },
      { type: 'non_fast_forward' },
      {
        type: 'pull_request',
        parameters: {
          allowed_merge_methods: ['merge', 'squash', 'rebase'],
          dismiss_stale_reviews_on_push: true,
          require_code_owner_review: false,
          require_last_push_approval: true,
          required_approving_review_count: 1,
          required_review_thread_resolution: true,
        },
      },
      {
        type: 'required_status_checks',
        parameters: {
          do_not_enforce_on_create: false,
          required_status_checks: REQUIRED_MAIN_CHECKS.map((context) => ({ context })),
          strict_required_status_checks_policy: true,
        },
      },
    ],
  }
}

function proposalSimulation(payload) {
  return assessGitHubMainProtection({
    branch: {
      name: 'main',
      protected: false,
      protection: { enabled: false, required_status_checks: { contexts: [], checks: [] } },
    },
    rulesets: [payload],
  })
}

function validateRulesetPayload(payload) {
  if (!isRecord(payload)) fail('github_main_protection_proposal_payload_invalid')
  if (payload.name !== 'SuperMega main release gate') fail('github_main_protection_proposal_name_invalid')
  if (payload.target !== 'branch') fail('github_main_protection_proposal_target_invalid')
  if (payload.enforcement !== 'active') fail('github_main_protection_proposal_enforcement_invalid')
  if (!Array.isArray(payload.bypass_actors) || payload.bypass_actors.length !== 0) fail('github_main_protection_proposal_bypass_invalid')
  if (payload.conditions?.ref_name?.include?.join(',') !== 'refs/heads/main') fail('github_main_protection_proposal_ref_invalid')
  if (!Array.isArray(payload.conditions?.ref_name?.exclude) || payload.conditions.ref_name.exclude.length !== 0) fail('github_main_protection_proposal_ref_invalid')

  const rules = new Map((Array.isArray(payload.rules) ? payload.rules : []).map((rule) => [rule?.type, rule]))
  for (const type of ['deletion', 'non_fast_forward', 'pull_request', 'required_status_checks']) {
    if (!rules.has(type)) fail(`github_main_protection_proposal_rule_missing:${type}`)
  }
  const pullRequest = rules.get('pull_request')?.parameters
  if (!Array.isArray(pullRequest?.allowed_merge_methods) || pullRequest.allowed_merge_methods.join(',') !== 'merge,squash,rebase') fail('github_main_protection_proposal_merge_methods_invalid')
  if (pullRequest.dismiss_stale_reviews_on_push !== true) fail('github_main_protection_proposal_stale_reviews_invalid')
  if (pullRequest.require_code_owner_review !== false) fail('github_main_protection_proposal_codeowners_invalid')
  if (pullRequest.require_last_push_approval !== true) fail('github_main_protection_proposal_last_push_invalid')
  if (pullRequest.required_approving_review_count !== 1) fail('github_main_protection_proposal_review_count_invalid')
  if (pullRequest.required_review_thread_resolution !== true) fail('github_main_protection_proposal_conversations_invalid')

  const statusChecks = rules.get('required_status_checks')?.parameters
  const contexts = (Array.isArray(statusChecks?.required_status_checks) ? statusChecks.required_status_checks : []).map((check) => check?.context)
  if (contexts.join(',') !== REQUIRED_MAIN_CHECKS.join(',')) fail('github_main_protection_proposal_checks_invalid')
  if (statusChecks.strict_required_status_checks_policy !== true) fail('github_main_protection_proposal_strict_checks_invalid')
  if (statusChecks.do_not_enforce_on_create !== false) fail('github_main_protection_proposal_create_escape_invalid')

  const simulation = proposalSimulation(payload)
  if (simulation.ok !== true) fail('github_main_protection_proposal_verifier_rejected')
  return payload
}

export function buildGitHubMainProtectionPacket({ sourceReceipts = [] } = {}) {
  const proposal = validateRulesetPayload(buildRulesetPayload())
  const simulation = proposalSimulation(proposal)
  const body = {
    contract: GITHUB_MAIN_PROTECTION_PROPOSAL_CONTRACT,
    digestScope: 'utf8_compact_json_without_digest',
    repository: REPOSITORY,
    mode: 'owner_approval_required',
    purpose: 'Make the GitHub main-protection blocker executable without approving any other release action.',
    githubApi: {
      method: 'POST',
      path: '/repos/swanhtet01/swanhtet01.github.io/rulesets',
      apiVersion: '2026-03-10',
      requiredPermission: 'Administration repository permission: write',
      docs: [
        'https://docs.github.com/en/rest/repos/rules#create-a-repository-ruleset',
        'https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets',
      ],
    },
    proposedRuleset: proposal,
    verifierCompatibility: {
      verifier: 'tools/verify_github_main_protection.mjs',
      contract: simulation.contract,
      simulatedOk: simulation.ok,
      requiredChecks: [...REQUIRED_MAIN_CHECKS],
      simulatedFailures: simulation.failures,
    },
    controls: {
      githubWritesApproved: false,
      githubWritesPerformed: false,
      repositorySettingsMutated: false,
      branchMutated: false,
      pullRequestCreated: false,
      mergePerformed: false,
      deploymentPerformed: false,
      supabaseMutated: false,
      credentialValuesRequired: false,
    },
    applicator: {
      tool: 'tools/apply_github_main_protection.mjs',
      planCommand: 'npm run github:main-protection:apply:plan',
      executeCommand: 'node tools/apply_github_main_protection.mjs --execute',
      requiredApprovalEnv: 'SUPERMEGA_GITHUB_MAIN_PROTECTION_APPROVAL',
      tokenEnv: ['GITHUB_TOKEN', 'GH_TOKEN'],
      defaultMode: 'plan_only_no_github_write',
      executeRequiresExactOwnerApproval: true,
      afterApplyVerifier: 'tools/verify_github_main_protection.mjs',
      credentialValueExposed: false,
    },
    ownerApprovalTemplate: 'I approve one GitHub repository settings write to create or update the main protection ruleset for swanhtet01/swanhtet01.github.io using the reviewed SuperMega main release gate proposal only. I do not approve push, PR creation, merge, deployment, Supabase mutation, credential change, customer contact, payment, stock, domain, hosted-write, or managed activation.',
    afterApplyVerification: {
      readOnlySnapshotCommands: [
        'GET /repos/swanhtet01/swanhtet01.github.io/branches/main',
        'GET /repos/swanhtet01/swanhtet01.github.io/rulesets',
      ],
      localVerificationCommand: 'node tools/verify_github_main_protection.mjs --branch-file <branch-snapshot.json> --rulesets-file <rulesets-snapshot.json>',
      requiredResult: 'ok:true',
    },
    sourceReceipts,
  }
  return { ...body, digest: digest(JSON.stringify(body)) }
}

export function validateGitHubMainProtectionPacket(packet) {
  if (!isRecord(packet)) fail('github_main_protection_proposal_packet_invalid')
  if (packet.contract !== GITHUB_MAIN_PROTECTION_PROPOSAL_CONTRACT) fail('github_main_protection_proposal_contract_invalid')
  if (packet.repository !== REPOSITORY) fail('github_main_protection_proposal_repository_invalid')
  if (packet.mode !== 'owner_approval_required') fail('github_main_protection_proposal_mode_invalid')
  if (packet.githubApi?.method !== 'POST' || packet.githubApi?.path !== '/repos/swanhtet01/swanhtet01.github.io/rulesets') fail('github_main_protection_proposal_api_invalid')
  if (packet.githubApi?.apiVersion !== '2026-03-10') fail('github_main_protection_proposal_api_version_invalid')
  validateRulesetPayload(packet.proposedRuleset)
  if (packet.verifierCompatibility?.verifier !== 'tools/verify_github_main_protection.mjs') fail('github_main_protection_proposal_verifier_invalid')
  if (packet.verifierCompatibility?.simulatedOk !== true) fail('github_main_protection_proposal_simulation_invalid')
  if (packet.verifierCompatibility?.simulatedFailures?.length !== 0) fail('github_main_protection_proposal_simulation_invalid')
  if (packet.verifierCompatibility?.requiredChecks?.join(',') !== REQUIRED_MAIN_CHECKS.join(',')) fail('github_main_protection_proposal_required_checks_invalid')
  if (packet.controls?.githubWritesApproved !== false
    || packet.controls?.githubWritesPerformed !== false
    || packet.controls?.repositorySettingsMutated !== false
    || packet.controls?.branchMutated !== false
    || packet.controls?.pullRequestCreated !== false
    || packet.controls?.mergePerformed !== false
    || packet.controls?.deploymentPerformed !== false
    || packet.controls?.supabaseMutated !== false
    || packet.controls?.credentialValuesRequired !== false) {
    fail('github_main_protection_proposal_controls_invalid')
  }
  if (!String(packet.ownerApprovalTemplate || '').includes('I approve one GitHub repository settings write')) fail('github_main_protection_proposal_approval_invalid')
  if (packet.applicator?.tool !== 'tools/apply_github_main_protection.mjs'
    || packet.applicator?.planCommand !== 'npm run github:main-protection:apply:plan'
    || packet.applicator?.executeCommand !== 'node tools/apply_github_main_protection.mjs --execute'
    || packet.applicator?.requiredApprovalEnv !== 'SUPERMEGA_GITHUB_MAIN_PROTECTION_APPROVAL'
    || packet.applicator?.tokenEnv?.join(',') !== 'GITHUB_TOKEN,GH_TOKEN'
    || packet.applicator?.defaultMode !== 'plan_only_no_github_write'
    || packet.applicator?.executeRequiresExactOwnerApproval !== true
    || packet.applicator?.afterApplyVerifier !== 'tools/verify_github_main_protection.mjs'
    || packet.applicator?.credentialValueExposed !== false) {
    fail('github_main_protection_proposal_applicator_invalid')
  }
  if (!Array.isArray(packet.sourceReceipts) || packet.sourceReceipts.length !== SOURCES.length) fail('github_main_protection_proposal_sources_invalid')
  for (const receipt of packet.sourceReceipts) {
    if (!SOURCES.includes(receipt.path) || !/^sha256:[0-9a-f]{64}$/.test(String(receipt.digest || ''))) fail('github_main_protection_proposal_sources_invalid')
  }
  const { digest: packetDigest, ...body } = packet
  if (packetDigest !== digest(JSON.stringify(body))) fail('github_main_protection_proposal_digest_invalid')
  return packet
}

async function currentPacket() {
  const sourceReceipts = []
  for (const source of SOURCES) {
    const text = await readFile(resolve(root, source), 'utf8')
    sourceReceipts.push({ path: source, digest: digest(text) })
  }
  return buildGitHubMainProtectionPacket({ sourceReceipts })
}

async function writeCurrentPacket() {
  const packet = await currentPacket()
  await mkdir(dirname(output), { recursive: true })
  const staged = resolve(dirname(output), `.github-main-protection-proposal.${randomUUID()}.tmp`)
  await writeFile(staged, `${JSON.stringify(packet, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
  await rename(staged, output)
  return packet
}

function runSelfTest() {
  const packet = buildGitHubMainProtectionPacket({
    sourceReceipts: SOURCES.map((path) => ({ path, digest: `sha256:${'0'.repeat(64)}` })),
  })
  const valid = validateGitHubMainProtectionPacket(packet)
  const simulated = proposalSimulation(valid.proposedRuleset)
  return {
    ok: valid.contract === GITHUB_MAIN_PROTECTION_PROPOSAL_CONTRACT
      && simulated.ok === true
      && valid.controls.githubWritesPerformed === false,
    contract: `${GITHUB_MAIN_PROTECTION_PROPOSAL_CONTRACT}.self-test`,
    checks: {
      proposal_packet_valid: valid.contract === GITHUB_MAIN_PROTECTION_PROPOSAL_CONTRACT,
      verifier_accepts_proposal: simulated.ok === true,
      no_github_write_authorized: valid.controls.githubWritesApproved === false,
      no_github_write_performed: valid.controls.githubWritesPerformed === false,
    },
  }
}

async function main() {
  const args = process.argv.slice(2)
  if (args.length > 1 || (args[0] && !['--verify', '--self-test'].includes(args[0]))) fail('github_main_protection_proposal_usage_invalid')
  if (args[0] === '--self-test') {
    const result = runSelfTest()
    console.log(JSON.stringify(result, null, 2))
    if (!result.ok) process.exitCode = 1
    return
  }
  if (args[0] === '--verify') {
    const actual = validateGitHubMainProtectionPacket(JSON.parse(await readFile(output, 'utf8')))
    const expected = await currentPacket()
    if (JSON.stringify(actual) !== JSON.stringify(expected)) fail('github_main_protection_proposal_stale')
    console.log(JSON.stringify({
      ok: true,
      contract: actual.contract,
      repository: actual.repository,
      requiredChecks: actual.verifierCompatibility.requiredChecks.length,
      githubWritesApproved: false,
      githubWritesPerformed: false,
    }))
    return
  }
  const packet = await writeCurrentPacket()
  console.log(JSON.stringify({
    ok: true,
    contract: packet.contract,
    output: relative(root, output).split(sep).join('/'),
    repository: packet.repository,
    requiredChecks: packet.verifierCompatibility.requiredChecks.length,
    githubWritesApproved: false,
    githubWritesPerformed: false,
  }))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(JSON.stringify({
      ok: false,
      contract: GITHUB_MAIN_PROTECTION_PROPOSAL_CONTRACT,
      error: String(error?.message || 'github_main_protection_proposal_failed').slice(0, 240),
      githubWritesPerformed: false,
      repositorySettingsMutated: false,
    }))
    process.exitCode = 1
  })
}
