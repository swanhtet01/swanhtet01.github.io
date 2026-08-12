import { existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { copyFile, mkdir, mkdtemp, readFile as readRawFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { isAlias, isMap, isScalar, isSeq, parseDocument } from 'yaml'

import { validateSchedulerExecutionBudget } from './scheduler_authority_contract.mjs'

const normalizeSourceText = (value) => value.replace(/\r\n?/g, '\n')
const readFile = async (...args) => {
  const value = await readRawFile(...args)
  return typeof value === 'string' ? normalizeSourceText(value) : value
}

const root = resolve(import.meta.dirname, '..')
const appWorkflow = await readFile(resolve(root, '.github/workflows/supermega-app-deploy.yml'), 'utf8')
const workflow = await readFile(resolve(root, '.github/workflows/supermega-public-release.yml'), 'utf8')
const ciWorkflow = await readFile(resolve(root, '.github/workflows/showroom-ci.yml'), 'utf8')
const dependencyAuditWorkflow = await readFile(resolve(root, '.github/workflows/dependency-security.yml'), 'utf8')
const publicHealthWorkflow = await readFile(resolve(root, '.github/workflows/supermega-public-live-health.yml'), 'utf8')
const kernelWorkflow = await readFile(resolve(root, '.github/workflows/kernel-deploy.yml'), 'utf8')
const workflowDirectory = resolve(root, '.github/workflows')
const requiredWorkflowFiles = new Set(['showroom-ci.yml', 'dependency-security.yml', 'kernel-deploy.yml'])
const otherWorkflowSources = await Promise.all(
  (await readdir(workflowDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isFile()
      && /\.ya?ml$/i.test(entry.name)
      && !requiredWorkflowFiles.has(entry.name))
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((entry) => readFile(resolve(workflowDirectory, entry.name), 'utf8')),
)
const generator = await readFile(resolve(root, 'tools/write_app_vercel_config.mjs'), 'utf8')
const appVerifier = await readFile(resolve(root, 'tools/verify_app_release_live.mjs'), 'utf8')
const publicVerifier = await readFile(resolve(root, 'tools/verify_public_release_live.mjs'), 'utf8')
const packageJson = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'))
const gitIgnore = await readFile(resolve(root, '.gitignore'), 'utf8')
const releaseBarrier = await readFile(resolve(root, 'tools/verify_coordinated_release_live.mjs'), 'utf8')
const databaseValidator = await readFile(resolve(root, 'tools/validate_supermega_database_url.py'), 'utf8')
const migrationVerifier = await readFile(resolve(root, 'tools/verify_private_trial_migrations.mjs'), 'utf8')
const rollbackResolver = await readFile(resolve(root, 'tools/resolve_vercel_rollback_target.mjs'), 'utf8')
const releaseHandoff = await readFile(resolve(root, 'tools/prepare_release_handoff.mjs'), 'utf8')
const releaseIntegrationPlan = await readFile(resolve(root, 'tools/prepare_release_integration_plan.mjs'), 'utf8')
const releaseIntegrationBatch = await readFile(resolve(root, 'tools/prepare_release_integration_batch.mjs'), 'utf8')
const retiredAliasVerifier = await readFile(resolve(root, 'tools/verify_retired_vercel_alias_state.mjs'), 'utf8')
const previewServer = await readFile(resolve(root, 'tools/serve_solution.py'), 'utf8')
const previewLauncher = await readFile(resolve(root, 'tools/deploy_preview.sh'), 'utf8')
const retiredClaimableLauncher = await readFile(resolve(root, 'tools/deploy_claimable_preview.sh'), 'utf8')
const config = JSON.parse(await readFile(resolve(root, 'vercel.json'), 'utf8'))
const schedulerAuthority = JSON.parse(await readFile(resolve(root, 'tools/supermega_scheduler_authority.json'), 'utf8'))
const schedulerExecutionBudget = validateSchedulerExecutionBudget(schedulerAuthority)
const kernelConfig = JSON.parse(await readFile(resolve(root, 'kernel/vercel.json'), 'utf8'))
const agentConnectorMap = previewServer.slice(
  previewServer.indexOf('AGENT_JOB_CONNECTOR_MAP:'),
  previewServer.indexOf('AGENT_TEAM_RUNTIME_JOB_MAP:'),
)
const failures = []
const checks = []
const REQUIRED_PULL_REQUEST_TYPES = ['opened', 'synchronize', 'reopened', 'ready_for_review']
const REQUIRED_JOB_CONDITION = "github.event_name != 'pull_request' || github.event.pull_request.draft == false"
const REQUIRED_CONTEXTS = [
  'SuperMega App CI',
  'Dependency Security Audit',
  'Kernel Console - Verify & Owner-Gated Release',
]
const EXPECTED_APP_CI_JOB = {
  name: 'SuperMega App CI',
  if: REQUIRED_JOB_CONDITION,
  'runs-on': 'ubuntu-latest',
  'timeout-minutes': 10,
  steps: [
    { name: 'Checkout', uses: 'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1' },
    {
      name: 'Setup Node',
      uses: 'actions/setup-node@820762786026740c76f36085b0efc47a31fe5020',
      with: { 'node-version': 24, cache: 'npm', 'cache-dependency-path': 'package-lock.json\nshowroom/package-lock.json\n' },
    },
    {
      name: 'Setup Python',
      uses: 'actions/setup-python@5fda3b95a4ea91299a34e894583c3862153e4b97',
      with: { 'python-version': '3.12', cache: 'pip', 'cache-dependency-path': 'requirements-test.txt' },
    },
    {
      name: 'Verify canonical API contracts',
      run: "python -m pip install --disable-pip-version-check -r requirements-test.txt\npython -m unittest discover -s tests -p 'test_*.py' -v\n",
    },
    { name: 'Install migration verifier', run: 'npm ci --ignore-scripts' },
    {
      name: 'Verify coordinated release and RLS guards',
      run: 'python tools/validate_supermega_database_url.py --self-test\nnpm run database:migrations:verify\nnode tools/verify_coordinated_release_live.mjs --self-test\nnode tools/verify_app_deploy_workflow.mjs\nnode tools/verify_public_deploy_guard.mjs\n',
    },
    { name: 'Install dependencies', 'working-directory': 'showroom', run: 'npm ci' },
    { name: 'Lint app', 'working-directory': 'showroom', run: 'npm run lint' },
    { name: 'Generate app deployment contract', run: 'node tools/write_app_vercel_config.mjs' },
    {
      name: 'Build and verify canonical app',
      env: { SUPERMEGA_RELEASE_COMMIT: '${{ github.sha }}' },
      run: 'npm run app:build:checked',
    },
  ],
}
const EXPECTED_KERNEL_VERIFY_JOB = {
  name: 'Kernel Console - Verify & Owner-Gated Release',
  if: REQUIRED_JOB_CONDITION,
  'runs-on': 'ubuntu-latest',
  'timeout-minutes': 20,
  steps: [
    {
      name: 'Checkout the reviewed commit',
      uses: 'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1',
      with: { ref: '${{ github.sha }}', 'fetch-depth': 1 },
    },
    {
      name: 'Setup Node',
      uses: 'actions/setup-node@820762786026740c76f36085b0efc47a31fe5020',
      with: { 'node-version': 24, cache: 'npm', 'cache-dependency-path': 'kernel/package-lock.json' },
    },
    { name: 'Install kernel dependencies', run: 'npm --prefix kernel ci --no-audit --no-fund' },
    { name: 'Verify kernel and release contract', run: 'npm --prefix kernel run verify' },
  ],
}
const EXPECTED_CI_CONCURRENCY = {
  group: 'showroom-ci-${{ github.ref }}',
  'cancel-in-progress': true,
}
const EXPECTED_DEPENDENCY_CONCURRENCY = {
  group: 'dependency-security-${{ github.ref }}',
  'cancel-in-progress': true,
}
const EXPECTED_KERNEL_CONCURRENCY = {
  group: 'kernel-console-${{ github.ref }}',
  'cancel-in-progress': "${{ github.event_name == 'pull_request' }}",
}
const EXPECTED_KERNEL_PUSH = {
  branches: ['main'],
  paths: [
    'kernel/**',
    'tools/test_connector_resilience.mjs',
    'tools/test_crew_resilience.mjs',
    'tools/resolve_vercel_rollback_target.mjs',
    '.github/workflows/kernel-deploy.yml',
  ],
}
const EXPECTED_KERNEL_WORKFLOW_DISPATCH = {
  inputs: {
    release_sha: {
      description: 'Exact 40-character SHA at the current main tip',
      required: true,
      type: 'string',
    },
    confirmation: {
      description: 'Type RELEASE KERNEL followed by the exact SHA',
      required: true,
      type: 'string',
    },
  },
}
const EXPECTED_KERNEL_RELEASE_JOB_DIGEST = 'sha256:2b3bc3cb159f79cc80e40ea0bbb4a78b68aa16a2006a5d2d9425cc5dbe4e0bc0'

function plainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function exactKeys(value, expected) {
  return plainObject(value)
    && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort())
}

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`
}

function canonicalDigest(value) {
  return `sha256:${createHash('sha256').update(canonicalJson(value)).digest('hex')}`
}

function safeYamlNode(node) {
  if (node === null) return true
  if (isAlias(node) || node?.anchor || node?.tag) return false
  if (isScalar(node)) return true
  if (isSeq(node)) return node.items.every(safeYamlNode)
  if (isMap(node)) {
    return node.items.every((pair) => isScalar(pair.key)
      && typeof pair.key.value === 'string'
      && safeYamlNode(pair.key)
      && safeYamlNode(pair.value))
  }
  return false
}

function parseWorkflow(source) {
  if (typeof source !== 'string'
    || source.length > 256_000
    || source.includes('\0')
    || source.includes('\t')) return null
  let document
  try {
    document = parseDocument(normalizeSourceText(source), {
      prettyErrors: false,
      strict: true,
      uniqueKeys: true,
      version: '1.2',
    })
  } catch {
    return null
  }
  if (document.errors.length > 0
    || document.warnings.length > 0
    || !safeYamlNode(document.contents)) return null
  let value
  try {
    value = document.toJS({ maxAliasCount: 0 })
  } catch {
    return null
  }
  return plainObject(value) ? value : null
}

function mutateWorkflowSource(source, mutate) {
  const value = parseWorkflow(source)
  if (!value) throw new Error('workflow_fixture_invalid')
  mutate(value)
  return JSON.stringify(value)
}

function pullRequestRunsForEveryReviewableChange(workflow) {
  if (typeof workflow === 'string') workflow = parseWorkflow(workflow)
  const pullRequest = workflow?.on?.pull_request
  return exactKeys(pullRequest, ['types'])
    && JSON.stringify(pullRequest.types) === JSON.stringify(REQUIRED_PULL_REQUEST_TYPES)
    && !Object.hasOwn(workflow, 'defaults')
}

function jobNameIsGloballyUnique(workflow, context, expectedJobKey) {
  const matches = Object.entries(workflow.jobs || {})
    .filter(([, job]) => plainObject(job) && job.name === context)
    .map(([jobKey]) => jobKey)
  return matches.length === 1 && matches[0] === expectedJobKey
}

function jobNamesAreStatic(workflow) {
  return plainObject(workflow?.jobs)
    && Object.values(workflow.jobs).every((job) => !plainObject(job)
      || !Object.hasOwn(job, 'name')
      || (typeof job.name === 'string' && !job.name.includes('${{')))
}

function stepsAreBlocking(steps) {
  return Array.isArray(steps)
    && steps.length > 0
    && steps.every((step) => plainObject(step)
      && !Object.hasOwn(step, 'continue-on-error')
      && !Object.hasOwn(step, 'if'))
}

function exactBlockingRequiredJob(workflow, jobKey, context, expectedJob) {
  const job = workflow?.jobs?.[jobKey]
  return canonicalJson(job) === canonicalJson(expectedJob)
    && job.name === context
    && stepsAreBlocking(job.steps)
    && jobNameIsGloballyUnique(workflow, context, jobKey)
}

function exactRequiredWorkflowEnvelope(workflow, name, eventKeys, jobKeys, expectedConcurrency) {
  return exactKeys(workflow, ['name', 'on', 'permissions', 'concurrency', 'jobs'])
    && workflow.name === name
    && exactKeys(workflow.on, eventKeys)
    && exactKeys(workflow.permissions, ['contents'])
    && workflow.permissions.contents === 'read'
    && canonicalJson(workflow.concurrency) === canonicalJson(expectedConcurrency)
    && exactKeys(workflow.jobs, jobKeys)
}

function exactKernelProductionAuthority(workflow) {
  return canonicalJson(workflow?.on?.push) === canonicalJson(EXPECTED_KERNEL_PUSH)
    && canonicalJson(workflow?.on?.workflow_dispatch) === canonicalJson(EXPECTED_KERNEL_WORKFLOW_DISPATCH)
    && canonicalDigest(workflow?.jobs?.release) === EXPECTED_KERNEL_RELEASE_JOB_DIGEST
}

function exactDependencyAuditWorkflow(workflow) {
  if (!pullRequestRunsForEveryReviewableChange(workflow)
    || !exactRequiredWorkflowEnvelope(
      workflow,
      'Dependency Security Audit',
      ['pull_request', 'workflow_dispatch', 'schedule'],
      ['npm-audit', 'required-check'],
      EXPECTED_DEPENDENCY_CONCURRENCY,
    )
    || workflow.on.workflow_dispatch !== null
    || JSON.stringify(workflow.on.schedule) !== JSON.stringify([{ cron: '25 3 * * 1' }])) return false

  const audit = workflow.jobs['npm-audit']
  const expectedMatrix = [
    { package: 'platform', directory: '.' },
    { package: 'app', directory: 'showroom' },
    { package: 'kernel', directory: 'kernel' },
  ]
  if (!exactKeys(audit, ['name', 'if', 'runs-on', 'timeout-minutes', 'strategy', 'steps'])
    || audit.name !== 'Audit ${{ matrix.package }}'
    || audit.if !== REQUIRED_JOB_CONDITION
    || audit['runs-on'] !== 'ubuntu-latest'
    || audit['timeout-minutes'] !== 5
    || !exactKeys(audit.strategy, ['fail-fast', 'matrix'])
    || audit.strategy['fail-fast'] !== false
    || !exactKeys(audit.strategy.matrix, ['include'])
    || JSON.stringify(audit.strategy.matrix.include) !== JSON.stringify(expectedMatrix)
    || !stepsAreBlocking(audit.steps)
    || audit.steps.length !== 3
    || !exactKeys(audit.steps[0], ['name', 'uses'])
    || audit.steps[0].name !== 'Checkout'
    || audit.steps[0].uses !== 'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1'
    || !exactKeys(audit.steps[1], ['name', 'uses', 'with'])
    || audit.steps[1].name !== 'Setup Node'
    || audit.steps[1].uses !== 'actions/setup-node@820762786026740c76f36085b0efc47a31fe5020'
    || !exactKeys(audit.steps[1].with, ['node-version'])
    || audit.steps[1].with['node-version'] !== 24
    || !exactKeys(audit.steps[2], ['name', 'working-directory', 'run'])
    || audit.steps[2].name !== 'Audit locked dependencies'
    || audit.steps[2]['working-directory'] !== '${{ matrix.directory }}'
    || audit.steps[2].run !== 'npm audit --audit-level=low') return false

  const required = workflow.jobs['required-check']
  return exactKeys(required, ['name', 'if', 'needs', 'runs-on', 'timeout-minutes', 'steps'])
    && required.name === 'Dependency Security Audit'
    && required.if === '${{ always() }}'
    && required.needs === 'npm-audit'
    && required['runs-on'] === 'ubuntu-latest'
    && required['timeout-minutes'] === 2
    && jobNameIsGloballyUnique(workflow, 'Dependency Security Audit', 'required-check')
    && stepsAreBlocking(required.steps)
    && required.steps.length === 1
    && exactKeys(required.steps[0], ['name', 'env', 'run'])
    && required.steps[0].name === 'Require every dependency audit'
    && exactKeys(required.steps[0].env, ['AUDIT_RESULT'])
    && required.steps[0].env.AUDIT_RESULT === '${{ needs.npm-audit.result }}'
    && required.steps[0].run === 'test "$AUDIT_RESULT" = "success"'
}

function requiredCheckWorkflowsValid(ciSource, dependencySource, kernelSource, additionalSources = otherWorkflowSources) {
  const ci = parseWorkflow(ciSource)
  const dependency = parseWorkflow(dependencySource)
  const kernel = parseWorkflow(kernelSource)
  const additional = additionalSources.map(parseWorkflow)
  if (!ci
    || !dependency
    || !kernel
    || additional.some((workflow) => !workflow || !jobNamesAreStatic(workflow))) return false
  const contexts = [ci, dependency, kernel, ...additional].flatMap((workflow) => Object.values(workflow.jobs || {}))
    .filter(plainObject)
    .map((job) => job.name)
    .filter((name) => REQUIRED_CONTEXTS.includes(name))
  return JSON.stringify(contexts.sort()) === JSON.stringify([...REQUIRED_CONTEXTS].sort())
    && exactRequiredWorkflowEnvelope(
      ci,
      'SuperMega App CI',
      ['pull_request', 'workflow_dispatch'],
      ['validate'],
      EXPECTED_CI_CONCURRENCY,
    )
    && ci.on.workflow_dispatch === null
    && exactRequiredWorkflowEnvelope(
      kernel,
      'Kernel Console - Verify & Owner-Gated Release',
      ['push', 'pull_request', 'workflow_dispatch'],
      ['verify', 'release'],
      EXPECTED_KERNEL_CONCURRENCY,
    )
    && exactKernelProductionAuthority(kernel)
    && pullRequestRunsForEveryReviewableChange(ci)
    && pullRequestRunsForEveryReviewableChange(kernel)
    && exactBlockingRequiredJob(ci, 'validate', 'SuperMega App CI', EXPECTED_APP_CI_JOB)
    && exactDependencyAuditWorkflow(dependency)
    && exactBlockingRequiredJob(kernel, 'verify', 'Kernel Console - Verify & Owner-Gated Release', EXPECTED_KERNEL_VERIFY_JOB)
}

function requireContract(name, condition) {
  checks.push(name)
  if (!condition) failures.push(name)
}

const parsedKernelWorkflow = parseWorkflow(kernelWorkflow)
const parsedKernelRelease = parsedKernelWorkflow?.jobs?.release
const kernelReleaseSteps = Array.isArray(parsedKernelRelease?.steps) ? parsedKernelRelease.steps : []
const kernelReleaseStep = (name) => kernelReleaseSteps.find((step) => plainObject(step) && step.name === name)
const kernelReleaseRunText = kernelReleaseSteps
  .map((step) => (plainObject(step) && typeof step.run === 'string' ? step.run : ''))
  .join('\n')

requireContract('source line endings normalize across platforms',
  normalizeSourceText('line one\r\nline two\rline three') === 'line one\nline two\nline three')
requireContract('locked required checks are exact and run for every reviewable pull request',
  requiredCheckWorkflowsValid(ciWorkflow, dependencyAuditWorkflow, kernelWorkflow))
requireContract('required-check contract rejects every pull-request filter form and missing ready events',
  ['paths', 'paths-ignore', 'branches', 'branches-ignore'].every((key) =>
    !requiredCheckWorkflowsValid(
      ciWorkflow.replace(
        '    types: [opened, synchronize, reopened, ready_for_review]',
        `    types: [opened, synchronize, reopened, ready_for_review]\n    "${key}" : [main]`,
      ),
      dependencyAuditWorkflow,
      kernelWorkflow,
    ))
  && !requiredCheckWorkflowsValid(
    ciWorkflow,
    dependencyAuditWorkflow.replace(', ready_for_review', ''),
    kernelWorkflow,
  ))
requireContract('required-check contract rejects duplicate keys, aliases, renamed and duplicate contexts',
  !requiredCheckWorkflowsValid(
    ciWorkflow.replace('  workflow_dispatch:', '  pull_request:\n    types: [opened]\n  workflow_dispatch:'),
    dependencyAuditWorkflow,
    kernelWorkflow,
  )
  && !requiredCheckWorkflowsValid(
    ciWorkflow.replace('jobs:\n  validate:', 'jobs:\n  &jobkey validate:'),
    dependencyAuditWorkflow,
    kernelWorkflow,
  )
  && !requiredCheckWorkflowsValid(
    ciWorkflow.replace('jobs:\n  validate:', 'jobs:\n  !!str validate:'),
    dependencyAuditWorkflow,
    kernelWorkflow,
  )
  && !requiredCheckWorkflowsValid(
    ciWorkflow,
    dependencyAuditWorkflow,
    kernelWorkflow.replace('    name: Kernel Console - Verify & Owner-Gated Release', '    name: &required-context Kernel Console - Verify & Owner-Gated Release'),
  )
  && !requiredCheckWorkflowsValid(
    ciWorkflow,
    dependencyAuditWorkflow,
    kernelWorkflow.replace('    name: Kernel Console - Verify & Owner-Gated Release', '    name: Kernel Verify'),
  )
  && !requiredCheckWorkflowsValid(
    ciWorkflow.replace(
      'jobs:\n  validate:',
      'jobs:\n  duplicate-context:\n    name: "SuperMega App CI"\n    runs-on: ubuntu-latest\n    steps:\n      - run: true\n  validate:',
    ),
    dependencyAuditWorkflow,
    kernelWorkflow,
  )
  && !requiredCheckWorkflowsValid(
    ciWorkflow,
    dependencyAuditWorkflow,
    kernelWorkflow,
    [...otherWorkflowSources, ciWorkflow],
  )
  && !requiredCheckWorkflowsValid(
    ciWorkflow,
    dependencyAuditWorkflow,
    kernelWorkflow,
    [...otherWorkflowSources, mutateWorkflowSource(ciWorkflow, (value) => {
      value.name = 'Dynamic duplicate'
      value.jobs.validate.name = "${{ 'SuperMega App CI' }}"
    })],
  ))
requireContract('required-check contract pins workflow-specific concurrency groups',
  !requiredCheckWorkflowsValid(
    mutateWorkflowSource(ciWorkflow, (value) => { value.concurrency = EXPECTED_KERNEL_CONCURRENCY }),
    dependencyAuditWorkflow,
    kernelWorkflow,
  )
  && !requiredCheckWorkflowsValid(
    ciWorkflow,
    mutateWorkflowSource(dependencyAuditWorkflow, (value) => { value.concurrency = EXPECTED_CI_CONCURRENCY }),
    kernelWorkflow,
  )
  && !requiredCheckWorkflowsValid(
    ciWorkflow,
    dependencyAuditWorkflow,
    mutateWorkflowSource(kernelWorkflow, (value) => { value.concurrency = EXPECTED_DEPENDENCY_CONCURRENCY }),
  ))
requireContract('required-check contract pins kernel events and complete production authority',
  !requiredCheckWorkflowsValid(
    ciWorkflow,
    dependencyAuditWorkflow,
    mutateWorkflowSource(kernelWorkflow, (value) => { value.on.push = ['main'] }),
  )
  && !requiredCheckWorkflowsValid(
    ciWorkflow,
    dependencyAuditWorkflow,
    mutateWorkflowSource(kernelWorkflow, (value) => { value.on.workflow_dispatch = 'invalid' }),
  )
  && !requiredCheckWorkflowsValid(
    ciWorkflow,
    dependencyAuditWorkflow,
    mutateWorkflowSource(kernelWorkflow, (value) => { value.jobs.release.if = "${{ github.event_name == 'push' }}" }),
  )
  && !requiredCheckWorkflowsValid(
    ciWorkflow,
    dependencyAuditWorkflow,
    mutateWorkflowSource(kernelWorkflow, (value) => { delete value.jobs.release.needs }),
  )
  && !requiredCheckWorkflowsValid(
    ciWorkflow,
    dependencyAuditWorkflow,
    mutateWorkflowSource(kernelWorkflow, (value) => { delete value.jobs.release.environment }),
  )
  && !requiredCheckWorkflowsValid(
    ciWorkflow,
    dependencyAuditWorkflow,
    `${mutateWorkflowSource(kernelWorkflow, (value) => {
      value.jobs.release.if = "${{ github.event_name == 'push' }}"
      delete value.jobs.release.needs
      delete value.jobs.release.environment
    })}\n# needs: verify\n# environment: kernel-production\n# github.event_name == 'workflow_dispatch'`,
  ))
requireContract('required-check contract rejects skipped or non-blocking required jobs',
  !requiredCheckWorkflowsValid(
    ciWorkflow.replace(`    if: ${REQUIRED_JOB_CONDITION}`, '    if: false'),
    dependencyAuditWorkflow,
    kernelWorkflow,
  )
  && !requiredCheckWorkflowsValid(
    ciWorkflow.replace('    runs-on: ubuntu-latest', '    continue-on-error: true\n    runs-on: ubuntu-latest'),
    dependencyAuditWorkflow,
    kernelWorkflow,
  )
  && !requiredCheckWorkflowsValid(
    ciWorkflow.replace('      - name: Lint app', '      - name: Lint app\n        continue-on-error: true'),
    dependencyAuditWorkflow,
    kernelWorkflow,
  )
  && !requiredCheckWorkflowsValid(
    ciWorkflow,
    dependencyAuditWorkflow.replace('    runs-on: ubuntu-latest', '    continue-on-error: true\n    runs-on: ubuntu-latest'),
    kernelWorkflow,
  )
  && !requiredCheckWorkflowsValid(
    ciWorkflow,
    dependencyAuditWorkflow.replace('      - name: Audit locked dependencies', '      - name: Audit locked dependencies\n        continue-on-error: true'),
    kernelWorkflow,
  )
  && !requiredCheckWorkflowsValid(
    ciWorkflow,
    dependencyAuditWorkflow.replace('  required-check:\n    name:', '  required-check:\n    continue-on-error: true\n    name:'),
    kernelWorkflow,
  ))
requireContract('required-check contract rejects audit command and matrix bypasses',
  !requiredCheckWorkflowsValid(
    ciWorkflow,
    dependencyAuditWorkflow.replace('run: npm audit --audit-level=low', 'run: npm audit --audit-level=low || true'),
    kernelWorkflow,
  )
  && !requiredCheckWorkflowsValid(
    ciWorkflow,
    dependencyAuditWorkflow.replace('      fail-fast: false', '      fail-fast: false\n      continue-on-error: true'),
    kernelWorkflow,
  )
  && !requiredCheckWorkflowsValid(
    ciWorkflow,
    dependencyAuditWorkflow.replace('            directory: showroom', '            directory: .').replace('            directory: kernel', '            directory: .'),
    kernelWorkflow,
  )
  && !requiredCheckWorkflowsValid(
    ciWorkflow,
    dependencyAuditWorkflow.replace('        run: npm audit --audit-level=low', '        # run: npm audit --audit-level=low\n        run: true'),
    kernelWorkflow,
  )
  && !requiredCheckWorkflowsValid(
    ciWorkflow,
    dependencyAuditWorkflow.replace('        run: test "$AUDIT_RESULT" = "success"', '        # run: test "$AUDIT_RESULT" = "success"\n        run: true'),
    kernelWorkflow,
  ))
requireContract('dependency audit is read-only, scheduled, and aggregates every npm lockfile',
  packageJson.scripts?.['security:dependencies'] === 'npm audit --audit-level=low && npm --prefix showroom audit --audit-level=low && npm --prefix kernel audit --audit-level=low'
  && exactDependencyAuditWorkflow(parseWorkflow(dependencyAuditWorkflow))
  && dependencyAuditWorkflow.includes('workflow_dispatch:')
  && dependencyAuditWorkflow.includes("cron: '25 3 * * 1'")
  && dependencyAuditWorkflow.includes('contents: read')
  && !dependencyAuditWorkflow.includes('pull_request_target:')
  && !dependencyAuditWorkflow.includes('contents: write')
  && !dependencyAuditWorkflow.includes('pull-requests: write'))
requireContract('release handoff is exact, review-only, and cannot deploy',
  packageJson.scripts?.['release:handoff:prepare'] === 'node tools/prepare_release_handoff.mjs'
  && packageJson.scripts?.['release:handoff:self-test'] === 'node --test tools/prepare_release_handoff.test.mjs'
  && releaseHandoff.includes("export const RELEASE_HANDOFF_CONTRACT = 'supermega.release-handoff.v2'")
  && releaseHandoff.includes("mode: 'owner_review_only'")
  && releaseHandoff.includes('pushApproved: false')
  && releaseHandoff.includes('mergeApproved: false')
  && releaseHandoff.includes('workflowDispatchApproved: false')
  && releaseHandoff.includes('deploymentApproved: false')
  && releaseHandoff.includes('remoteWritesPerformed: false')
  && releaseHandoff.includes("digestScope: 'utf8_compact_json_without_digest'")
  && releaseHandoff.includes('digest: `sha256:${sha256(payload)}`')
  && releaseHandoff.includes('packetDigest: packet.digest')
  && releaseHandoff.includes("mode: 'owner_review_only'")
  && releaseHandoff.includes('verifyCurrentReleaseHandoff')
  && releaseHandoff.includes("fail('release_handoff_remote_state_changed')")
  && releaseHandoff.includes("fail('release_handoff_live_state_changed')")
  && releaseHandoff.includes("git('ls-remote', '--heads', 'origin', ref)")
  && releaseHandoff.includes("args: ['/d', '/s', '/c', 'npm.cmd run app:verify']")
  && releaseHandoff.includes("return { file: 'npm', args: ['run', 'app:verify'] }")
  && !/\b(?:vercel|gh)\s+(?:deploy|promote|rollback|workflow|api)\b/i.test(releaseHandoff))
requireContract('diverged release candidates produce one exact no-write integration plan',
  packageJson.scripts?.['release:integration:prepare'] === 'node tools/prepare_release_integration_plan.mjs'
  && packageJson.scripts?.['release:integration:self-test'] === 'node --test tools/prepare_release_integration_plan.test.mjs'
  && releaseIntegrationPlan.includes("export const RELEASE_INTEGRATION_PLAN_CONTRACT = 'supermega.release-integration-plan.v1'")
  && releaseIntegrationPlan.includes("mode: 'owner_review_only_no_git_mutation'")
  && releaseIntegrationPlan.includes("strategy: 'new_owner_approved_integration_branch_from_origin_main'")
  && releaseIntegrationPlan.includes("git('ls-remote', '--heads', 'origin', 'main')")
  && releaseIntegrationPlan.includes("['merge-tree', '--write-tree', '--name-only', '--no-messages', mainCommit, candidateCommit]")
  && releaseIntegrationPlan.includes('branchCreationApproved: false')
  && releaseIntegrationPlan.includes('mergeApproved: false')
  && releaseIntegrationPlan.includes('conflictResolutionApproved: false')
  && releaseIntegrationPlan.includes('pushApproved: false')
  && releaseIntegrationPlan.includes('deploymentApproved: false')
  && releaseIntegrationPlan.includes('forcePushAllowed: false')
  && releaseIntegrationPlan.includes("fail('release_integration_remote_tracking_stale')")
  && releaseIntegrationPlan.includes("fail('release_integration_state_changed')")
  && !/\b(?:merge|rebase|cherry-pick|push|reset|checkout|switch)\b/.test(releaseIntegrationPlan.match(/function git\([\s\S]+?function remoteMainHead/)?.[0] || '')
  && !/\b(?:vercel|gh)\s+(?:deploy|promote|rollback|workflow|api)\b/i.test(releaseIntegrationPlan))
requireContract('ordered integration batches preserve production safeguards and candidate product depth',
  packageJson.scripts?.['release:integration:batch:prepare'] === 'node tools/prepare_release_integration_batch.mjs'
  && packageJson.scripts?.['release:integration:batch:self-test'] === 'node --test tools/prepare_release_integration_batch.test.mjs'
  && releaseIntegrationBatch.includes("export const RELEASE_INTEGRATION_BATCH_CONTRACT = 'supermega.release-integration-batch.v1'")
  && releaseIntegrationBatch.includes("export const IDENTITY_DATA_BATCH = 'identity-data-onboarding'")
  && releaseIntegrationBatch.includes("export const APP_SHELL_BATCH = 'app-shell'")
  && releaseIntegrationBatch.includes("export const ECOMMERCE_BATCH = 'ecommerce'")
  && releaseIntegrationBatch.includes("export const RELEASE_SECURITY_HQ_BATCH = 'release-security-hq'")
  && releaseIntegrationBatch.includes('requestManagedPasswordRecovery')
  && releaseIntegrationBatch.includes('test_browser_auth_and_write_enablement_are_complete_and_ordered')
  && releaseIntegrationBatch.includes('validateManagedPlantEquipmentImport')
  && releaseIntegrationBatch.includes('createClientDemoWorkspace')
  && releaseIntegrationBatch.includes("file: 'showroom/src/core/client-onboarding.ts'")
  && releaseIntegrationBatch.includes('function managedLoginPath(product: string | null)')
  && releaseIntegrationBatch.includes('Browser-local sample only. Confirming creates a sample order and reserves sample stock in this browser.')
  && releaseIntegrationBatch.includes('loadManagedOwnerControlRun')
  && releaseIntegrationBatch.includes('const ProductSystemNavigator = lazy(')
  && releaseIntegrationBatch.includes('Choose what you want to run.')
  && releaseIntegrationBatch.includes('.product-system-workflows { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: 8px; }')
  && releaseIntegrationBatch.includes('startGuidedWorkspace')
  && releaseIntegrationBatch.includes('function ecommerceOrderAmendmentSummary')
  && releaseIntegrationBatch.includes('Already saved for this company as revision')
  && releaseIntegrationBatch.includes('<details aria-label="More order tools" className="ecommerce-enterprise-controls">')
  && releaseIntegrationBatch.includes('function submitAmendmentRequest')
  && releaseIntegrationBatch.includes('function submitCorrectionRequest')
  && releaseIntegrationBatch.includes('commerce.storefront_request.received')
  && releaseIntegrationBatch.includes('managed schema contract advances through additive v2 through v10 migrations')
  && releaseIntegrationBatch.includes('release:integration:batch:prepare')
  && releaseIntegrationBatch.includes('production Supabase target requires separately committed activation authority')
  && releaseIntegrationBatch.includes("resolutionRule: 'preserve_all_upstream_and_candidate_requirements_in_one_tree'")
  && releaseIntegrationBatch.includes('branchCreationApproved: false')
  && releaseIntegrationBatch.includes('conflictResolutionApproved: false')
  && releaseIntegrationBatch.includes('sourceFilesModified: false')
  && releaseIntegrationBatch.includes("fail('release_integration_batch_state_changed')")
  && !/\b(?:vercel|gh)\s+(?:deploy|promote|rollback|workflow|api)\b/i.test(releaseIntegrationBatch))

function runRollbackResolver(args, payload) {
  return spawnSync(
    process.execPath,
    [resolve(root, 'tools/resolve_vercel_rollback_target.mjs'), ...args],
    { input: JSON.stringify(payload), encoding: 'utf8' },
  )
}

async function verifyCanonicalPythonBundle() {
  const bundleRoot = await mkdtemp(join(tmpdir(), 'supermega-vercel-python-'))
  try {
    await mkdir(resolve(bundleRoot, 'supermega_runtime'), { recursive: true })
    for (const relativePath of [
      'supermega_runtime/__init__.py',
      'supermega_runtime/agent_governance.py',
      'supermega_runtime/cloud_runtime.py',
      'supermega_runtime/scheduler_activation.py',
    ]) {
      await copyFile(resolve(root, relativePath), resolve(bundleRoot, relativePath))
    }
    const localPython = process.platform === 'win32'
      ? resolve(root, '.venv/Scripts/python.exe')
      : resolve(root, '.venv/bin/python')
    const python = existsSync(localPython)
      ? localPython
      : (process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3'))
    return spawnSync(
      python,
      ['-c', [
        'import builtins',
        '_import = builtins.__import__',
        'def guarded(name, *args, **kwargs):',
        '    if name == "mark1_pilot" or name.startswith("mark1_pilot."):',
        '        raise RuntimeError("excluded_mark1_pilot_imported")',
        '    return _import(name, *args, **kwargs)',
        'builtins.__import__ = guarded',
        'from supermega_runtime.cloud_runtime import _SCHEDULER_ROUTES',
        'assert sum(len(route["job_types"]) for route in _SCHEDULER_ROUTES.values()) == 4',
        'print("canonical-python-bundle-import-ok")',
      ].join('\n')],
      {
        cwd: bundleRoot,
        encoding: 'utf8',
        env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1', PYTHONPATH: bundleRoot },
      },
    )
  } finally {
    await rm(bundleRoot, { recursive: true, force: true })
  }
}

const fixtureUrl = 'https://megaos-release-fixture.vercel.app'
const aliasFixture = {
  alias: 'app.supermega.dev',
  deploymentId: 'dpl_fixture123',
  deployment: { id: 'dpl_fixture123', url: 'megaos-release-fixture.vercel.app' },
  projectId: 'prj_1GAMPH8qlSAXno5BhO1wkYx1jkGG',
  redirect: null,
}
const validAliasResolution = runRollbackResolver(
  ['alias', 'app.supermega.dev', 'prj_1GAMPH8qlSAXno5BhO1wkYx1jkGG'],
  aliasFixture,
)
const invalidAliasResolution = runRollbackResolver(
  ['alias', 'app.supermega.dev', 'prj_1GAMPH8qlSAXno5BhO1wkYx1jkGG'],
  { ...aliasFixture, deploymentId: 'dpl_wrong' },
)
const validDeploymentResolution = runRollbackResolver(
  ['deployment', fixtureUrl, 'dpl_fixture123'],
  { id: 'dpl_fixture123', url: 'megaos-release-fixture.vercel.app', target: 'production', readyState: 'READY' },
)
const invalidDeploymentResolution = runRollbackResolver(
  ['deployment', fixtureUrl, 'dpl_fixture123'],
  { id: 'dpl_different', url: 'megaos-release-fixture.vercel.app', target: 'production', readyState: 'READY' },
)
const releaseBarrierSelfTest = spawnSync(
  process.execPath,
  [resolve(root, 'tools/verify_coordinated_release_live.mjs'), '--self-test'],
  { encoding: 'utf8' },
)
const appVerifierSelfTest = spawnSync(
  process.execPath,
  [resolve(root, 'tools/verify_app_release_live.mjs'), '--self-test'],
  { encoding: 'utf8' },
)
const canonicalPythonBundle = await verifyCanonicalPythonBundle()

requireContract('canonical app project id', workflow.includes('APP_VERCEL_PROJECT_ID: prj_1GAMPH8qlSAXno5BhO1wkYx1jkGG'))
requireContract('canonical public project id', workflow.includes('VERCEL_PROJECT_ID: prj_Yaf0cZYbiFXcLkMcKaAm4alPWMhR'))
requireContract('canonical project identities', workflow.includes('project inspect megaos') && workflow.includes('APP_VERCEL_PROJECT_ID: prj_1GAMPH8qlSAXno5BhO1wkYx1jkGG') && workflow.includes('PUBLIC_VERCEL_PROJECT_ID: prj_Yaf0cZYbiFXcLkMcKaAm4alPWMhR'))
requireContract('pinned Vercel CLI', workflow.includes('vercel@56.1.0'))
requireContract('app build contract',
  config.buildCommand === 'npm run app:build'
  && generator.includes("buildCommand: 'npm run app:build'")
  && packageJson.scripts?.['app:build'] === 'npm run app:release:write && npm --prefix showroom run build'
  && packageJson.scripts?.['app:build:checked'] === 'npm run app:build && npm run app:verify && node tools/verify_app_release_live.mjs --artifact-self-test'
  && ciWorkflow.includes('run: npm run app:build:checked'))
requireContract('remote dependency install contract', config.installCommand === 'npm --prefix showroom ci' && generator.includes("installCommand: 'npm --prefix showroom ci'"))
requireContract('remote security inputs are included', generator.includes("'!.env.app.example'"))
requireContract('canonical output directory', config.outputDirectory === 'showroom/dist')
requireContract('canonical SPA routes use one filesystem-first fallback',
  config.routes?.length === 3
  && config.routes[0]?.src === '/api/(.*)' && config.routes[0]?.dest === '/api/app.py'
  && config.routes[1]?.handle === 'filesystem'
  && config.routes[2]?.src === '/(.*)' && config.routes[2]?.dest === '/index.html')
requireContract('canonical API function', config.routes?.[0]?.dest === '/api/app.py' && JSON.stringify(Object.keys(config.functions || {}).sort()) === JSON.stringify(['api/app.py']) && config.functions?.['api/app.py']?.maxDuration === 60 && config.functions?.['api/app.py']?.includeFiles === '{supermega_runtime/**,hq/readiness/managed-pilot-readiness.json}' && generator.includes('maxDuration: 60') && generator.includes("includeFiles: '{supermega_runtime/**,hq/readiness/managed-pilot-readiness.json}'"))
requireContract('canonical Python function cold imports from included runtime only', canonicalPythonBundle.status === 0 && canonicalPythonBundle.stdout.includes('canonical-python-bundle-import-ok'))
requireContract('native Git deployment disabled in config', config.git?.deploymentEnabled === false && /deploymentEnabled:\s*false/.test(generator))
requireContract('deployment control files trigger non-mutating review gates',
  pullRequestRunsForEveryReviewableChange(ciWorkflow)
  && appWorkflow.includes("- 'vercel.json'")
  && appWorkflow.includes("- '.vercelignore'"))
requireContract('remote app build includes kernel release contract', generator.includes("['.github', 'kernel', 'supabase']"))
requireContract('retired alias control triggers non-mutating review gates',
  pullRequestRunsForEveryReviewableChange(ciWorkflow)
  && ciWorkflow.includes('npm run app:build:checked')
  && appWorkflow.includes('tools/verify_retired_vercel_alias_state.mjs'))
requireContract('app and public changes trigger non-mutating review before manual release',
  pullRequestRunsForEveryReviewableChange(ciWorkflow)
  && ciWorkflow.includes('npm run app:build:checked')
  && appWorkflow.includes("- 'showroom/**'")
  && appWorkflow.includes('tools/create_public_vercel_output.mjs')
  && appWorkflow.includes('tools/verify_coordinated_release_live.mjs'))
requireContract('HQ-only evidence validates without redeploying unchanged products',
  !workflow.includes("- 'hq/**'")
  && !workflow.includes('tools/verify_hq_contract.mjs')
  && pullRequestRunsForEveryReviewableChange(ciWorkflow)
  && ciWorkflow.includes('npm run app:build:checked'))
requireContract('all API tests trigger review and execute before manual release',
  pullRequestRunsForEveryReviewableChange(ciWorkflow)
  && appWorkflow.includes("- 'tests/**'")
  && ciWorkflow.includes("python -m unittest discover -s tests -p 'test_*.py' -v")
  && workflow.includes("python -m unittest discover -s tests -p 'test_*.py' -v"))
requireContract('runtime package changes trigger non-mutating review',
  pullRequestRunsForEveryReviewableChange(ciWorkflow)
  && appWorkflow.includes("- 'supermega_runtime/**'"))
requireContract('database activation controls trigger non-mutating review',
  pullRequestRunsForEveryReviewableChange(ciWorkflow)
  && ciWorkflow.includes('tools/validate_supermega_database_url.py')
  && appWorkflow.includes('tools/validate_supermega_database_url.py')
  && appWorkflow.includes('tools/activate_supermega_database.ps1'))
requireContract('rehearsal packet changes trigger both reviews and keep operator files ignored',
  pullRequestRunsForEveryReviewableChange(ciWorkflow)
  && appWorkflow.includes('tools/prepare_supabase_rehearsal_packet.mjs')
  && appWorkflow.includes('tools/prepare_supabase_rehearsal_packet.test.mjs')
  && appWorkflow.includes("- '.gitignore'")
  && appWorkflow.includes("- '.github/workflows/showroom-ci.yml'")
  && /^\.tmp\/$/m.test(gitIgnore))
requireContract('PostgreSQL 17 rehearsal changes trigger every non-mutating database review',
  pullRequestRunsForEveryReviewableChange(ciWorkflow)
  && appWorkflow.includes('tools/rehearse_supermega_postgres17.py')
  && appWorkflow.includes('tools/run_postgres17_rehearsal.mjs'))
requireContract('migration proof changes trigger every database-aware workflow',
  pullRequestRunsForEveryReviewableChange(ciWorkflow)
  && ciWorkflow.includes('npm run database:migrations:verify')
  && appWorkflow.includes('tools/verify_private_trial_migrations.mjs')
  && appWorkflow.includes('tools/verify_public_legacy_baseline.mjs')
  && appWorkflow.includes('package-lock.json')
  && workflow.includes('npm run database:migrations:verify')
  && packageJson.scripts?.['database:migrations:verify'] === 'node tools/verify_private_trial_migrations.mjs && node tools/verify_public_legacy_baseline.mjs')
requireContract('real migration proof precedes every production candidate',
  workflow.includes('npm ci --ignore-scripts')
  && workflow.includes('node tools/verify_private_trial_migrations.mjs')
  && workflow.indexOf('node tools/verify_private_trial_migrations.mjs') < workflow.indexOf('Deploy isolated app production candidate')
  && workflow.indexOf('node tools/verify_private_trial_migrations.mjs') < workflow.indexOf('Deploy isolated production candidate')
  && ciWorkflow.includes('node tools/verify_private_trial_migrations.mjs')
  && appWorkflow.includes('node tools/verify_private_trial_migrations.mjs')
  && migrationVerifier.includes("from '@electric-sql/pglite'")
  && migrationVerifier.includes('unsafe role rejected before foundation grants')
  && migrationVerifier.includes('hosted_postgres_17_proof_required: true'))
requireContract('app guard remains non-mutating but runs API tests', appWorkflow.includes("- 'supermega_runtime/**'") && appWorkflow.includes("python -m unittest discover -s tests -p 'test_*.py' -v") && !/vercel@56\.1\.0\s+(?:deploy|promote|rollback)\b/.test(appWorkflow) && !appWorkflow.includes('VERCEL_TOKEN') && !/environment:\s*production/.test(appWorkflow))
requireContract('protected app candidate verification', workflow.includes("VERCEL_PROTECTED_PREVIEW: '1'") && appVerifier.includes("'curl', path, '--deployment'") && appVerifier.includes('deploymentFunctions') && appVerifier.includes("JSON.stringify(['api/app'])") && appVerifier.includes('hosted_agent_runtime_contract_wrong'))
requireContract('current app asset contract gates local build and protected candidate',
  packageJson.scripts['app:build:checked'] === 'npm run app:build && npm run app:verify && node tools/verify_app_release_live.mjs --artifact-self-test'
  && workflow.includes('Verify immutable app asset contract')
  && workflow.includes('node tools/verify_app_release_live.mjs --artifact-self-test')
  && workflow.indexOf('Verify immutable app asset contract') < workflow.indexOf('Deploy isolated app production candidate')
  && appVerifier.includes("contract: 'supermega.current-release-assets.v1'")
  && appVerifier.includes("const legacyCopyAudit = process.env.SUPERMEGA_LEGACY_COPY_AUDIT === '1'")
  && appVerifier.includes('releaseAssetVerification = verifyCurrentReleaseAssets({'))
requireContract('app live identity validates brand context and catalog', appVerifier.includes('release.brandVersion !== manifest.brand.version') && appVerifier.includes('release.contextVersion !== manifest.contextVersion') && appVerifier.includes('release.catalogVersion !== manifest.catalogVersion'))
requireContract('operators can verify the exact checked-out release',
  packageJson.scripts['app:verify:live:current'] === 'node tools/verify_app_release_live.mjs --current-head'
  && packageJson.scripts['public:verify:live:current'] === 'node tools/verify_public_release_live.mjs --current-head'
  && appVerifier.includes("verificationScope = expectedCommit ? 'exact_release' : 'availability_and_contract'")
  && publicVerifier.includes("verificationScope = expectedCommit ? 'exact_release' : 'availability_and_contract'")
  && appVerifier.includes("reason: 'release_commit_mismatch'")
  && appVerifier.includes("execFileSync('git', ['rev-parse', 'HEAD']")
  && publicVerifier.includes("execFileSync('git', ['rev-parse', 'HEAD']"))
requireContract('isolated candidates exist for both domains', (workflow.match(/deploy --prebuilt --prod --skip-domain --yes/g) || []).length === 2 && workflow.includes('Deploy isolated app production candidate') && workflow.includes('Deploy isolated production candidate'))
requireContract('candidate identity barrier is protected', workflow.includes('Verify candidate release identity barrier') && workflow.includes('APP_BASE_URL: ${{ steps.deploy-app.outputs.url }}') && workflow.includes('PUBLIC_BASE_URL: ${{ steps.deploy.outputs.url }}') && releaseBarrier.includes('protected_preview_token_required'))
requireContract('candidate identity barrier selects each Vercel project', releaseBarrier.includes('APP_VERCEL_PROJECT_ID') && releaseBarrier.includes('PUBLIC_VERCEL_PROJECT_ID') && releaseBarrier.includes('VERCEL_PROJECT_ID: projectId') && releaseBarrier.includes("'--deployment', baseUrl, '--yes'"))
requireContract('public project switch clears app build and environment state', workflow.includes('rm -rf -- .vercel') && workflow.indexOf('rm -rf -- .vercel') < workflow.indexOf('npm run public:prebuilt'))
requireContract('cross-domain barrier validates complete release identity', releaseBarrier.includes("identityFields = ['commit', 'brandVersion', 'contextVersion', 'catalogVersion']") && releaseBarrier.includes('cross_domain_release_identity_mismatch') && releaseBarrier.includes('release_manifest_identity_mismatch'))
requireContract('release barrier fixtures pass', releaseBarrierSelfTest.status === 0 && releaseBarrierSelfTest.stdout.includes('"ok": true') && releaseBarrierSelfTest.stdout.includes('reject_catalog_drift'))
requireContract('app release evidence fixtures pass', appVerifierSelfTest.status === 0 && appVerifierSelfTest.stdout.includes('"ok": true') && appVerifierSelfTest.stdout.includes('supermega_app_live_evidence_extractor.v1'))
requireContract('cross-platform protected deployment requests', !appVerifier.includes("'--silent'") && !appVerifier.includes("'--show-error'") && !appVerifier.includes("'--location'") && !appVerifier.includes("'--token'") && appVerifier.includes('describeCliFailure'))
requireContract('both project controls are verified', workflow.includes('verify_vercel_project_state.mjs app') && workflow.includes('verify_vercel_project_state.mjs public') && workflow.includes('verify_vercel_domain_state.mjs app') && workflow.includes('verify_vercel_domain_state.mjs public') && workflow.includes('verify_vercel_environment_state.mjs app') && workflow.includes('verify_vercel_environment_state.mjs public'))
requireContract('canonical domains are reasserted before domain verification',
  workflow.includes('Reassert canonical app domain ownership')
  && workflow.includes('vercel@56.1.0 domains add app.supermega.dev megaos --force --token="$VERCEL_TOKEN"')
  && workflow.includes('Reassert canonical public domain ownership')
  && workflow.includes('vercel@56.1.0 domains add supermega.dev supermega-public --force --token="$VERCEL_TOKEN"')
  && workflow.includes('vercel@56.1.0 domains add www.supermega.dev supermega-public --force --token="$VERCEL_TOKEN"')
  && workflow.indexOf('Reassert canonical app domain ownership') < workflow.indexOf('verify_vercel_domain_state.mjs app')
  && workflow.indexOf('Reassert canonical public domain ownership') < workflow.indexOf('verify_vercel_domain_state.mjs public'))
requireContract('retired POS alias blocks release before and after promotion', (workflow.match(/api "\/v4\/aliases\?domain=pos\.supermega\.dev&teamId=\$VERCEL_ORG_ID"/g) || []).length === 2
  && (workflow.match(/verify_retired_vercel_alias_state\.mjs pos\.supermega\.dev/g) || []).length === 2
  && retiredAliasVerifier.includes("failures = liveRetiredAliases.length ? ['retired_alias_still_live'] : []")
  && retiredAliasVerifier.includes("contract: 'supermega_retired_vercel_alias_state'"))
requireContract('all control URLs use explicit project identities', workflow.includes('api "/v9/projects/$APP_VERCEL_PROJECT_ID"') && workflow.includes('/v9/projects/$APP_VERCEL_PROJECT_ID/domains?teamId=$VERCEL_ORG_ID') && workflow.includes('/v10/projects/$APP_VERCEL_PROJECT_ID/env?teamId=$VERCEL_ORG_ID') && workflow.includes('api "/v9/projects/$PUBLIC_VERCEL_PROJECT_ID"') && workflow.includes('/v9/projects/$PUBLIC_VERCEL_PROJECT_ID/domains?teamId=$VERCEL_ORG_ID') && workflow.includes('/v10/projects/$PUBLIC_VERCEL_PROJECT_ID/env?teamId=$VERCEL_ORG_ID') && workflow.includes('projectId=$PUBLIC_VERCEL_PROJECT_ID&teamId=$VERCEL_ORG_ID') && !workflow.includes('/v9/projects/megaos') && !workflow.includes('/v9/projects/supermega-public'))
requireContract('managed mode is selected only after metadata and effective-value verification', workflow.includes('id: app-environment') && workflow.includes("operating_mode=%s") && workflow.includes("['isolated_demo','managed_trial_candidate']") && workflow.includes('verify_managed_runtime_environment_values.mjs managed_trial') && workflow.includes('verify_managed_runtime_environment_values.mjs isolated_demo'))
requireContract('managed database audit uses the exact app runtime environment before candidate creation',
  workflow.includes('Enforce exact app runtime database and RLS gate')
  && workflow.includes('VERCEL_PROJECT_ID: ${{ env.APP_VERCEL_PROJECT_ID }}')
  && workflow.includes('vercel@56.1.0 env run --environment=production')
  && workflow.includes('python tools/validate_supermega_database_url.py --env-key SUPERMEGA_DATABASE_URL --ensure-schema --require-ready')
  && workflow.includes('EXPECTED_OPERATING_MODE: ${{ steps.app-environment.outputs.operating_mode }}')
  && appVerifier.includes('selected_operating_mode_runtime_mismatch')
  && workflow.includes('Operating mode selection is missing or invalid')
  && !workflow.includes('SUPERMEGA_DATABASE_URL: ${{ secrets.SUPERMEGA_DATABASE_URL }}')
  && workflow.indexOf('Enforce exact app runtime database and RLS gate') < workflow.indexOf('Deploy isolated app production candidate')
  && workflow.indexOf('Enforce exact app runtime database and RLS gate') < workflow.indexOf('Deploy isolated production candidate'))
requireContract('RLS and trigger validator rejects semantic bypasses',
  !databaseValidator.includes('def _contains_tokens')
  && databaseValidator.includes('def _policy_expression_matches')
  && databaseValidator.includes('EXPECTED_POLICY_FINGERPRINTS')
  && databaseValidator.includes('reject_dead_case_wrapper')
  && databaseValidator.includes('reject_weakened_status')
  && databaseValidator.includes('reject_inverted_identity_predicates')
  && databaseValidator.includes('reject_swapped_identity_settings')
  && databaseValidator.includes('security_constraints_exact')
  && databaseValidator.includes('backend_acl_scope_exact')
  && databaseValidator.includes('no_when_clause')
  && databaseValidator.includes('trigger_type')
  && databaseValidator.includes('function_source')
  && databaseValidator.includes('"--self-test"'))
requireContract('app rollback target captured from exact live alias', workflow.includes('api "/now/aliases/app.supermega.dev" --raw') && workflow.includes('resolve_vercel_rollback_target.mjs alias app.supermega.dev prj_1GAMPH8qlSAXno5BhO1wkYx1jkGG') && workflow.includes('id: app-rollback-target'))
requireContract('public rollback target captured from exact live alias', workflow.includes('api "/now/aliases/supermega.dev" --raw') && workflow.includes('resolve_vercel_rollback_target.mjs alias supermega.dev prj_Yaf0cZYbiFXcLkMcKaAm4alPWMhR') && workflow.includes('id: rollback-target'))
requireContract('rollback resolver validates exact deployment identity', workflow.includes('read -r PREVIOUS_URL PREVIOUS_ID') && workflow.includes('resolve_vercel_rollback_target.mjs deployment "$PREVIOUS_URL" "$PREVIOUS_ID"') && rollbackResolver.includes("mode === 'alias'") && rollbackResolver.includes("mode === 'deployment'") && rollbackResolver.includes("state.projectId !== expectedProjectId") && rollbackResolver.includes("nestedDeploymentId !== deploymentId") && rollbackResolver.includes("state.id !== expectedDeploymentId") && rollbackResolver.includes("state.target !== 'production'") && rollbackResolver.includes("state.readyState !== 'READY'"))
requireContract('rollback alias resolver fixtures', validAliasResolution.status === 0 && validAliasResolution.stdout === `${fixtureUrl} dpl_fixture123` && invalidAliasResolution.status !== 0 && invalidAliasResolution.stderr.includes('deployment_identity'))
requireContract('rollback deployment resolver fixtures', validDeploymentResolution.status === 0 && validDeploymentResolution.stdout === fixtureUrl && invalidDeploymentResolution.status !== 0 && invalidDeploymentResolution.stderr.includes('deployment_identity'))
requireContract('only coordinated workflow can promote app or public', (workflow.match(/vercel@56\.1\.0 promote/g) || []).length === 2 && !/vercel@56\.1\.0\s+promote\b/.test(appWorkflow))
requireContract('failed paired verification rolls back every attempted promotion', workflow.includes("failure() && (steps.promote-app.outputs.attempted == 'true' || steps.promote.outputs.attempted == 'true')") && (workflow.match(/attempted=true/g) || []).length === 2 && workflow.includes('APP_PROMOTION_ATTEMPTED') && workflow.includes('PUBLIC_PROMOTION_ATTEMPTED') && workflow.includes('steps.app-rollback-target.outputs.url') && workflow.includes('steps.rollback-target.outputs.url') && workflow.includes('VERIFY_RELEASE_PAIR_ONLY=1 node tools/verify_coordinated_release_live.mjs'))
requireContract('kernel native Git deployment is disabled', kernelConfig.git?.deploymentEnabled === false)
requireContract('kernel release is manual current-main and environment gated',
  exactKernelProductionAuthority(parsedKernelWorkflow)
  && parsedKernelRelease?.if === "${{ github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/main' && github.repository == 'swanhtet01/swanhtet01.github.io' }}"
  && parsedKernelRelease?.needs === 'verify'
  && parsedKernelRelease?.environment === 'kernel-production'
  && kernelReleaseStep('Require exact current-main release intent')?.run.includes('RELEASE KERNEL $ACTUAL_SHA')
  && kernelReleaseStep('Require exact current-main release intent')?.run.includes('git rev-parse origin/main'))
requireContract('kernel release promotes one exact isolated artifact',
  exactKernelProductionAuthority(parsedKernelWorkflow)
  && (kernelReleaseRunText.match(/vercel@56\.1\.0 deploy --prebuilt --prod --skip-domain --yes/g) || []).length === 1
  && (kernelReleaseRunText.match(/vercel@56\.1\.0 promote "\$CANDIDATE_URL"/g) || []).length === 1
  && kernelReleaseStep('Inspect and smoke the exact candidate')?.run.includes('vercel@56.1.0 curl /api/status --deployment "$CANDIDATE_URL"')
  && kernelReleaseSteps.indexOf(kernelReleaseStep('Reconfirm current main before promotion')) < kernelReleaseSteps.indexOf(kernelReleaseStep('Promote the exact verified candidate'))
  && !kernelReleaseRunText.includes('npx vercel deploy --prod -y'))
requireContract('kernel failed production verification restores the exact prior alias',
  exactKernelProductionAuthority(parsedKernelWorkflow)
  && kernelReleaseStep('Roll back a failed production verification')?.if === "${{ failure() && steps.promote.outputs.attempted == 'true' }}"
  && kernelReleaseStep('Capture the exact production rollback target')?.run.includes('resolve_vercel_rollback_target.mjs deployment "$PREVIOUS_URL" "$PREVIOUS_ID"')
  && kernelReleaseStep('Roll back a failed production verification')?.run.includes('vercel@56.1.0 rollback "$PREVIOUS_URL" --yes')
  && kernelReleaseStep('Roll back a failed production verification')?.run.includes('[ "$RESTORED_URL" != "$PREVIOUS_URL" ]'))
requireContract('production environment gate', /environment:\s*production/.test(workflow))
requireContract('production is main-only in the canonical repository', workflow.includes("if: ${{ github.ref == 'refs/heads/main' && github.repository == 'swanhtet01/swanhtet01.github.io' }}"))
requireContract('production release requires an exact manual owner instruction before checkout or credentials',
  workflow.includes('workflow_dispatch:')
  && workflow.includes('release_commit:')
  && workflow.includes('confirmation:')
  && workflow.includes('REQUESTED_RELEASE_COMMIT: ${{ inputs.release_commit }}')
  && workflow.includes('RELEASE_CONFIRMATION: ${{ inputs.confirmation }}')
  && workflow.includes('RELEASE_ACTOR: ${{ github.actor }}')
  && workflow.includes('[ "$REQUESTED_RELEASE_COMMIT" != "$GITHUB_SHA" ]')
  && workflow.includes('[ "$RELEASE_CONFIRMATION" != "DEPLOY SUPERMEGA PAIRED PRODUCTION" ]')
  && workflow.includes('[ "$RELEASE_ACTOR" != "swanhtet01" ]')
  && workflow.indexOf('Require exact owner release instruction') < workflow.indexOf('Checkout the release commit')
  && workflow.indexOf('Require exact owner release instruction') < workflow.indexOf('Require production deploy credential')
  && !/^\s*push:/m.test(workflow))
requireContract('deployment metadata uses the guarded runtime ref', (workflow.match(/githubCommitRef=\$\{\{ github\.ref_name \}\}/g) || []).length === 2 && !workflow.includes('githubCommitRef=main'))
const coreWorkflowActions = `${workflow}\n${appWorkflow}\n${ciWorkflow}\n${publicHealthWorkflow}\n${kernelWorkflow}`
requireContract('core actions are commit-pinned', !/uses:\s+[^\s#]+@v\d+/m.test(coreWorkflowActions) && /uses:\s+actions\/checkout@[0-9a-f]{40}/.test(workflow))
requireContract('core workflows use Node 24 action revisions',
  (coreWorkflowActions.match(/actions\/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1/g) || []).length === 6
  && (coreWorkflowActions.match(/actions\/setup-node@820762786026740c76f36085b0efc47a31fe5020/g) || []).length === 6
  && (coreWorkflowActions.match(/actions\/setup-python@5fda3b95a4ea91299a34e894583c3862153e4b97/g) || []).length === 3
  && !/(?:11d5960a326750d5838078e36cf38b85af677262|49933ea5288caeca8642d1e84afbd3f7d6820020|a26af69be951a213d495a4c3e4e4022e16d87065)/.test(coreWorkflowActions))
requireContract('uv build tool is immutable', workflow.includes('astral-sh/setup-uv@c771a70e6277c0a99b617c7a806ffedaca235ff9') && workflow.includes("version: '0.11.30'"))
requireContract('stale Cloud Run release authority is retired', !existsSync(resolve(root, '.github/workflows/supermega-app-cloud-run.yml')))
requireContract('orphan enterprise and free-mode gates are retired',
  !existsSync(resolve(root, '.github/workflows/supermega-enterprise-gate.yml'))
  && !existsSync(resolve(root, 'tools/smoke_free_mode_health.mjs'))
  && ![workflow, appWorkflow, ciWorkflow].some((source) => source.includes('SuperMega App Build and Deploy')))
requireContract('unlinked preview deployment is retired',
  previewServer.includes('PREVIEW_DEPLOY_MODE = "canonical_preview"')
  && previewServer.includes('CANONICAL_VERCEL_TEAM_ID = "team_wI4l7ZgSxcEztQPSlCCYVeJ5"')
  && previewServer.includes('CANONICAL_APP_VERCEL_PROJECT_ID = "prj_1GAMPH8qlSAXno5BhO1wkYx1jkGG"')
  && previewServer.includes('_require_canonical_preview_deploy_target()')
  && previewServer.includes('vercel@56.1.0')
  && !previewServer.includes('deploy_claimable_preview.sh')
  && !previewServer.includes('claimable_preview')
  && [previewLauncher, retiredClaimableLauncher].every((source) =>
    source.includes('Retired:')
    && source.includes('exit 78')
    && !source.includes('codex-deploy-skills.vercel.sh')
    && !source.includes('curl ')))
requireContract('preview release review is exact and server-owned',
  previewServer.includes('PREVIEW_RELEASE_REVIEW_CONTRACT = "supermega.preview-release-review.v1"')
  && previewServer.includes('PREVIEW_RELEASE_REVIEW_SOURCE = "system:preview_release_review"')
  && previewServer.includes('@app.post("/api/cloud/deployments/preview/reviews")')
  && previewServer.includes('def _build_preview_release_review_packet(')
  && previewServer.includes('def _validate_preview_release_review_packet(')
  && previewServer.includes('def _find_reusable_preview_release_review(')
  && previewServer.includes('"status": "human_review_required"')
  && previewServer.includes('"strategy": "discard_preview"')
  && previewServer.includes('"production_alias_mutation": False')
  && previewServer.includes('with preview_release_review_lock:')
  && previewServer.indexOf('_validate_preview_deploy_approval(') < previewServer.indexOf('_run_preview_deploy(payload.mode, revision=approved_revision)'))
requireContract('canonical preview deploys one pinned prebuilt artifact',
  previewServer.includes('deploy_environment["SUPERMEGA_RELEASE_COMMIT"] = normalized_revision')
  && previewServer.includes('["pull", "--yes", "--environment=preview"]')
  && previewServer.includes('["build", "--yes"]')
  && previewServer.includes('"--prebuilt"')
  && previewServer.includes('f"githubCommitSha={normalized_revision}"')
  && previewServer.includes('_require_canonical_preview_deploy_target()')
  && previewServer.includes('prebuilt_config.is_file()')
  && previewServer.includes('"prebuilt": True')
  && previewServer.includes('_run_preview_deploy(payload.mode, revision=approved_revision)')
  && !previewServer.includes('"--prod"')
  && !previewServer.includes('"--token"')
  && !previewServer.includes('"urls": urls')
  && previewServer.indexOf('["pull", "--yes", "--environment=preview"]') < previewServer.indexOf('["build", "--yes"]')
  && previewServer.indexOf('["build", "--yes"]') < previewServer.indexOf('"deploy",\n                "--prebuilt"'))

const normalizeCrons = (crons) => (crons || [])
  .map(({ path, schedule }) => ({ path, schedule }))
  .sort((left, right) => left.path.localeCompare(right.path))
const expectedCrons = normalizeCrons(schedulerAuthority.crons)
const actualCrons = normalizeCrons(config.crons)
requireContract('single production scheduler authority',
  schedulerAuthority.contract === 'supermega.scheduler-authority.v2'
  && schedulerAuthority.authority === 'vercel'
  && schedulerAuthority.environment === 'production'
  && schedulerAuthority.project_id === 'prj_1GAMPH8qlSAXno5BhO1wkYx1jkGG'
  && schedulerAuthority.activation?.state === 'dormant'
  && schedulerAuthority.activation?.runtime_environment_key === 'SUPERMEGA_HOSTED_SCHEDULER_ENABLED'
  && schedulerAuthority.activation?.enabled_value === '1'
  && schedulerAuthority.activation?.required_evidence?.length === 5
  && schedulerAuthority.crons?.length === 0
  && schedulerAuthority.maximum_scheduler_invocations_per_day === 0
  && schedulerExecutionBudget.maxClaimsPerInvocation === 1
  && schedulerExecutionBudget.maximumActivationInvocationsPerDay === 25
  && schedulerAuthority.activation_plan?.maximum_scheduler_invocations_per_day === 25
  && JSON.stringify(normalizeCrons(schedulerAuthority.activation_plan?.crons)) === JSON.stringify(normalizeCrons([
    { path: '/api/cron/supermega/agent-queue', schedule: '5 * * * *' },
    { path: '/api/cron/supermega/daily', schedule: '45 0 * * *' },
  ]))
  && JSON.stringify(normalizeCrons(schedulerAuthority.migration?.preflight_retiring_crons)) === JSON.stringify(normalizeCrons([
    { path: '/api/cron/supermega/agent-queue', schedule: '*/15 * * * *' },
    { path: '/api/cron/supermega/daily', schedule: '45 0 * * *' },
  ]))
  && schedulerAuthority.migration?.post_deploy_retiring_crons_allowed === false
  && schedulerAuthority.worker_dispatch?.mode === 'enqueue-on-demand'
  && schedulerAuthority.worker_dispatch?.polling_allowed === false
  && schedulerAuthority.retired_authority?.provider === 'google-cloud-scheduler'
  && schedulerAuthority.retired_authority?.mutation_allowed === false)
requireContract('canonical cron path and cadence contract', JSON.stringify(actualCrons) === JSON.stringify(expectedCrons))
requireContract('company automation events stay tenant-scoped and off YTF connectors',
  agentConnectorMap.startsWith('AGENT_JOB_CONNECTOR_MAP:')
  && agentConnectorMap.includes('"core-agent-operations"')
  && agentConnectorMap.includes('"core-github-build"')
  && !agentConnectorMap.includes('"ytf-')
  && previewServer.includes('def _scope_connector_catalog(')
  && previewServer.includes('connectors = _scope_connector_catalog(connectors, expected_tenant_key)')
  && previewServer.indexOf('connectors = _scope_connector_catalog(connectors, expected_tenant_key)') < previewServer.indexOf('connector_lookup = {'))
requireContract('Vercel config is generated from scheduler authority',
  generator.includes("readFileSync('tools/supermega_scheduler_authority.json'")
  && generator.includes('validateSchedulerExecutionBudget(schedulerAuthority)')
  && generator.includes('const canonicalCrons = schedulerAuthority.crons.map')
  && generator.includes("schedulerAuthority.activation?.state !== 'dormant'")
  && generator.includes('schedulerAuthority.activation_plan?.maximum_scheduler_invocations_per_day !== 25')
  && packageJson.scripts?.['vercel:contracts:test']?.includes('scheduler_authority_contract.test.mjs')
  && packageJson.scripts?.['vercel:contracts:test']?.includes('write_app_vercel_config.test.mjs'))
requireContract('public live health follows the canonical release workflow',
  publicHealthWorkflow.includes('SuperMega - Coordinated Verified Release')
  && !publicHealthWorkflow.includes('SuperMega Public - Verified Prebuilt Release'))
requireContract('scheduler authority changes trigger every non-mutating review gate',
  pullRequestRunsForEveryReviewableChange(ciWorkflow)
  && ciWorkflow.includes('npm run app:build:checked')
  && appWorkflow.includes('tools/supermega_scheduler_authority.json')
  && appWorkflow.includes('tools/verify_vercel_project_state.mjs')
  && appWorkflow.includes('tools/test_vercel_project_state.mjs'))

const combined = `${workflow}\n${appWorkflow}\n${generator}\n${JSON.stringify(config)}`
requireContract('no POS route', !/\/pos\/login/i.test(combined))
requireContract('no YTF schedule', !/\/api\/cron\/ytf/i.test(combined))

const orderedSteps = [
  'Enforce exact app runtime database and RLS gate',
  'Inspect and verify app candidate',
  'Verify protected candidate content',
  'Verify candidate release identity barrier',
  'Promote the verified app artifact',
  'Promote the verified artifact',
  'Verify production aliases and exact release',
  'Verify production project controls',
  'Roll back a failed production verification',
]
const positions = orderedSteps.map((step) => workflow.indexOf(step))
requireContract('coordinated release steps are ordered', positions.every((position) => position >= 0) && positions.every((position, index) => index === 0 || position > positions[index - 1]))

if (failures.length) {
  console.error(JSON.stringify({ ok: false, contract: 'supermega_coordinated_release_workflow', failures }, null, 2))
  process.exit(1)
}

console.log(JSON.stringify({ ok: true, contract: 'supermega_coordinated_release_workflow', checks: checks.length }, null, 2))
