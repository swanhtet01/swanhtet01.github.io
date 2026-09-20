import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const digest = value => `sha256:${createHash('sha256').update(value).digest('hex')}`
const fail = code => { throw new Error(`paired_preview_plan_${code}`) }
const sha = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value)
const targets = {
  team: 'team_wI4l7ZgSxcEztQPSlCCYVeJ5',
  app: 'prj_1GAMPH8qlSAXno5BhO1wkYx1jkGG',
  public: 'prj_Yaf0cZYbiFXcLkMcKaAm4alPWMhR',
}

function git(path, args) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith('GIT_')))
  Object.assign(env, { GIT_TERMINAL_PROMPT: '0', GIT_NO_LAZY_FETCH: '1', GIT_OPTIONAL_LOCKS: '0',
    GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null' })
  return execFileSync('git', ['-c', 'core.fsmonitor=false', '-c', 'core.hooksPath=/dev/null', ...args], {
    cwd: path, env, timeout: 5000, maxBuffer: 1024 * 1024, windowsHide: true,
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
}

export function inspectSource(path) {
  try {
    const root = realpathSync(path)
    if (realpathSync(git(root, ['rev-parse', '--show-toplevel'])) !== root) fail('root_required')
    return { root, commit: git(root, ['rev-parse', 'HEAD']), tree: git(root, ['rev-parse', 'HEAD^{tree}']),
      clean: git(root, ['status', '--porcelain', '--untracked-files=all']) === '' }
  } catch { fail('source_inspection_failed') }
}

// This is a local readiness plan, never an executable provider authorization.
// No caller-supplied runtime/protection booleans can clear uncollected gates.
export function planPairedPreview({ preparationBytes, expectedCommit, expectedTree, tooling, now = new Date() }, inspect = inspectSource) {
  if (!sha(expectedCommit) || !sha(expectedTree)) fail('candidate_invalid')
  if (!tooling || !sha(tooling.commit) || !sha(tooling.tree) || tooling.clean !== true
    || !/^sha256:[a-f0-9]{64}$/.test(tooling.moduleDigest || '')) fail('tooling_invalid')
  let receipt
  try { receipt = JSON.parse(preparationBytes) } catch { fail('receipt_invalid') }
  if (!receipt || Array.isArray(receipt)) fail('receipt_invalid')
  const { digest: declared, ...body } = receipt
  if (declared !== digest(JSON.stringify(body))) fail('receipt_digest_mismatch')
  if (receipt.contract !== 'supermega.paired-preview-source-preparation.v1'
    || receipt.state !== 'local_sources_prepared' || receipt.localMutationOutcome !== 'confirmed_complete'
    || receipt.commit !== expectedCommit || receipt.tree !== expectedTree) fail('receipt_binding_mismatch')
  if (!Array.isArray(receipt.sources) || receipt.sources.length !== 2) fail('sources_invalid')
  const sources = ['app', 'public'].map(kind => {
    const matches = receipt.sources.filter(source => source?.kind === kind)
    if (matches.length !== 1) fail('sources_invalid')
    const source = matches[0]
    if (source.commit !== expectedCommit || source.tree !== expectedTree || source.clean !== true
      || typeof source.path !== 'string' || !source.path) fail('source_binding_mismatch')
    const actual = inspect(source.path)
    if (actual.commit !== expectedCommit || actual.tree !== expectedTree || actual.clean !== true) fail('source_changed')
    return { kind, ...actual }
  })
  if (sources[0].root === sources[1].root) fail('sources_not_distinct')
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) fail('time_invalid')
  const result = {
    contract: 'supermega.paired-preview-readiness-plan.v1', mode: 'local_readiness_only',
    generatedAt: now.toISOString(), expiresAt: new Date(now.getTime() + 600000).toISOString(),
    candidate: { commit: expectedCommit, tree: expectedTree }, tooling,
    preparationFileDigest: digest(preparationBytes), preparationBodyDigest: declared,
    sources, intendedTargets: targets,
    steps: ['collect_read_only_project_protection_and_nonproduction_runtime_evidence',
      'verify_exact_app_preview_build', 'separate_owner_approved_app_preview_deployment',
      'read_back_exact_protected_app_deployment', 'build_public_with_verified_app_origin',
      'separate_owner_approved_public_preview_deployment', 'verify_exact_pair_and_customer_journeys'],
    blockers: ['provider_target_and_protection_unverified', 'nonproduction_runtime_unverified',
      'app_build_provenance_missing', 'public_build_and_app_binding_missing',
      'reviewed_paired_apply_tooling_missing', 'physical_owner_approval_missing'],
    controls: { providerReadPerformed: false, providerWritePerformed: false, buildPerformed: false,
      credentialsRead: false, deploymentPerformed: false, productionMutated: false,
      ownerApprovalConsumed: false, executionAuthorized: false, hostedAcceptanceProven: false },
  }
  return { ...result, digest: digest(JSON.stringify(result)) }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [receiptPath, expectedCommit, expectedTree, output, ...extra] = process.argv.slice(2)
    if (!receiptPath || !output || extra.length) fail('arguments_invalid')
    if (statSync(receiptPath).size > 1024 * 1024) fail('receipt_too_large')
    const modulePath = fileURLToPath(import.meta.url)
    const actual = inspectSource(resolve(dirname(modulePath), '..'))
    const plan = planPairedPreview({ preparationBytes: readFileSync(receiptPath), expectedCommit, expectedTree,
      tooling: { commit: actual.commit, tree: actual.tree, clean: actual.clean,
        moduleDigest: digest(readFileSync(modulePath)) } })
    // Exclusive create: never overwrite evidence, source, or an existing plan.
    writeFileSync(output, `${JSON.stringify(plan, null, 2)}\n`, { flag: 'wx' })
    console.log(JSON.stringify({ contract: plan.contract, digest: plan.digest, blockers: plan.blockers,
      executionAuthorized: false }))
  } catch (error) {
    const code = /^paired_preview_plan_[a-z_]+$/.test(error?.message || '') ? error.message : 'paired_preview_plan_failed'
    console.error(code)
    process.exitCode = 1
  }
}
