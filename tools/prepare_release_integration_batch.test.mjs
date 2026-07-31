import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import test from 'node:test'

import {
  APP_SHELL_BATCH,
  APP_SHELL_REQUIREMENTS,
  ECOMMERCE_BATCH,
  ECOMMERCE_REQUIREMENTS,
  RELEASE_SECURITY_HQ_BATCH,
  RELEASE_SECURITY_HQ_REQUIREMENTS,
  IDENTITY_DATA_REQUIREMENTS,
  RELEASE_INTEGRATION_BATCH_CONTRACT,
  assessAppShellSources,
  assessEcommerceSources,
  assessReleaseSecurityHqSources,
  assessIdentityDataSources,
  buildAppShellComparison,
  buildEcommerceComparison,
  buildReleaseSecurityHqComparison,
  buildIdentityDataComparison,
  validateAppShellComparison,
  validateEcommerceComparison,
  validateReleaseSecurityHqComparison,
  validateIdentityDataComparison,
  writeExclusiveJson,
} from './prepare_release_integration_batch.mjs'

const sha = (value) => value.repeat(40)
const files = [...new Set(IDENTITY_DATA_REQUIREMENTS.map((entry) => entry.file))].sort()
const appShellFiles = [...new Set(APP_SHELL_REQUIREMENTS.map((entry) => entry.file))].sort()
const ecommerceFiles = [...new Set(ECOMMERCE_REQUIREMENTS.map((entry) => entry.file))].sort()
const finalBatchFiles = [...new Set(RELEASE_SECURITY_HQ_REQUIREMENTS.map((entry) => entry.file))].sort()

function sources(authorities = ['upstream', 'candidate']) {
  return Object.fromEntries(files.map((file) => [file, IDENTITY_DATA_REQUIREMENTS
    .filter((entry) => entry.file === file && authorities.includes(entry.authority))
    .flatMap((entry) => entry.tokens).join('\n') || '// retained source']))
}

function tree(ref, commit, authorities) {
  return { ref, commit, sources: sources(authorities), blobs: Object.fromEntries(files.map((file, index) => [file, String((index % 8) + 1).repeat(40)])) }
}

function comparison() {
  return buildIdentityDataComparison({
    generatedAt: '2026-07-30T15:00:00.000Z',
    upstream: tree('origin/main', sha('a'), ['upstream']),
    candidate: tree('HEAD', sha('b'), ['candidate']),
  })
}

function appShellSources(authorities = ['upstream', 'candidate']) {
  return Object.fromEntries(appShellFiles.map((file) => [file, APP_SHELL_REQUIREMENTS
    .filter((entry) => entry.file === file && authorities.includes(entry.authority))
    .flatMap((entry) => entry.tokens).join('\n') || '// retained source']))
}

function appShellTree(ref, commit, authorities) {
  return {
    ref,
    commit,
    sources: appShellSources(authorities),
    blobs: Object.fromEntries(appShellFiles.map((file, index) => [file, String((index % 8) + 1).repeat(40)])),
  }
}

function ecommerceSources(authorities = ['upstream', 'candidate']) {
  return Object.fromEntries(ecommerceFiles.map((file) => [file, ECOMMERCE_REQUIREMENTS
    .filter((entry) => entry.file === file && authorities.includes(entry.authority))
    .flatMap((entry) => entry.tokens).join('\n') || '// retained source']))
}

function ecommerceTree(ref, commit, authorities) {
  return {
    ref,
    commit,
    sources: ecommerceSources(authorities),
    blobs: Object.fromEntries(ecommerceFiles.map((file, index) => [file, String((index % 8) + 1).repeat(40)])),
  }
}

function finalBatchSources(authorities = ['upstream', 'candidate']) {
  return Object.fromEntries(finalBatchFiles.map((file) => [file, RELEASE_SECURITY_HQ_REQUIREMENTS
    .filter((entry) => entry.file === file && authorities.includes(entry.authority))
    .flatMap((entry) => entry.tokens).join('\n') || '// retained source']))
}

function finalBatchTree(ref, commit, authorities) {
  return { ref, commit, sources: finalBatchSources(authorities), blobs: Object.fromEntries(finalBatchFiles.map((file, index) => [file, String((index % 8) + 1).repeat(40)])) }
}

test('neither current side can satisfy the required union alone', () => {
  const upstream = assessIdentityDataSources(sources(['upstream']))
  const candidate = assessIdentityDataSources(sources(['candidate']))
  assert.equal(upstream.ok, false)
  assert.equal(upstream.authority.upstream.passed, true)
  assert.equal(upstream.authority.candidate.passed, false)
  assert.equal(candidate.ok, false)
  assert.equal(candidate.authority.upstream.passed, false)
  assert.equal(candidate.authority.candidate.passed, true)
})

test('one composed tree must retain both authorities', () => {
  const integrated = assessIdentityDataSources(sources())
  assert.equal(integrated.ok, true)
  assert.equal(integrated.authority.upstream.passed, true)
  assert.equal(integrated.authority.candidate.passed, true)
  const missing = sources()
  missing['showroom/src/core/managed-trial.ts'] = missing['showroom/src/core/managed-trial.ts'].replace('requestManagedPasswordRecovery', '')
  assert.equal(assessIdentityDataSources(missing).ok, false)
})

test('client demo workspace authority stays in its owning onboarding module', () => {
  const integrated = sources()
  const onboardingFile = 'showroom/src/core/client-onboarding.ts'
  const settingsFile = 'showroom/src/core/SettingsPage.tsx'
  assert.equal(files.includes(onboardingFile), true)
  const token = 'export function createClientDemoWorkspace'
  integrated[onboardingFile] = integrated[onboardingFile].replace(token, '')
  integrated[settingsFile] += `\n${token}`
  const assessment = assessIdentityDataSources(integrated)
  assert.equal(assessment.ok, false)
  assert.deepEqual(
    assessment.requirements.filter((entry) => !entry.passed).map(({ id, missing }) => ({ id, missing })),
    [{ id: 'candidate-client-demo-workspace-core', missing: [token] }],
  )
})

test('unrelated YTF source is rejected from the SuperMega batch', () => {
  const contaminated = sources()
  contaminated['supermega_runtime/trial_runtime.py'] += '\n# Yangon Tyre'
  const assessment = assessIdentityDataSources(contaminated)
  assert.equal(assessment.ok, false)
  assert.deepEqual(assessment.forbiddenSourceFiles, ['supermega_runtime/trial_runtime.py'])
})

test('comparison is exact, digest-bound, and grants no mutation authority', () => {
  const packet = comparison()
  assert.equal(packet.contract, RELEASE_INTEGRATION_BATCH_CONTRACT)
  assert.equal(packet.decision.status, 'manual_union_required')
  assert.equal(packet.upstream.authority.upstream.passed, true)
  assert.equal(packet.candidate.authority.candidate.passed, true)
  assert.equal(packet.authority.sourceFilesModified, false)
  assert.equal(packet.authority.mergeApproved, false)
  assert.equal(validateIdentityDataComparison(packet).digest, packet.digest)
  packet.authority.mergeApproved = true
  assert.throws(() => validateIdentityDataComparison(packet), /release_integration_batch_packet_invalid/)
})

test('malformed sources and duplicate refs fail closed', () => {
  const invalidSources = sources()
  delete invalidSources[files[0]]
  assert.throws(() => assessIdentityDataSources(invalidSources), /release_integration_batch_sources_invalid/)
  assert.throws(() => buildIdentityDataComparison({
    generatedAt: '2026-07-30T15:00:00.000Z',
    upstream: tree('origin/main', sha('a'), ['upstream']),
    candidate: tree('HEAD', sha('a'), ['candidate']),
  }), /release_integration_batch_refs_not_distinct/)
})

test('comparison output is exclusive and non-overwriting', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'supermega-integration-batch-'))
  const output = join(directory, 'batch.json')
  try {
    const packet = comparison()
    const receipt = await writeExclusiveJson(output, packet)
    assert.equal(receipt.bytes > 0, true)
    assert.equal(JSON.parse(await readFile(output, 'utf8')).digest, packet.digest)
    await assert.rejects(() => writeExclusiveJson(output, packet), /release_integration_batch_output_exists/)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('app shell requires production safeguards and candidate task-first UX together', () => {
  const upstream = assessAppShellSources(appShellSources(['upstream']))
  const candidate = assessAppShellSources(appShellSources(['candidate']))
  const integrated = assessAppShellSources(appShellSources())
  assert.equal(upstream.ok, false)
  assert.equal(upstream.authority.upstream.passed, true)
  assert.equal(candidate.ok, false)
  assert.equal(candidate.authority.candidate.passed, true)
  assert.equal(integrated.ok, true)

  const withoutSignIn = appShellSources()
  withoutSignIn['showroom/src/core/CoreShell.tsx'] = withoutSignIn['showroom/src/core/CoreShell.tsx'].replaceAll('Company sign in', '')
  assert.equal(assessAppShellSources(withoutSignIn).ok, false)

  const withoutBoundary = appShellSources()
  withoutBoundary['showroom/src/core/CoreApp.tsx'] = withoutBoundary['showroom/src/core/CoreApp.tsx'].replace('counter-local-boundary', '')
  assert.equal(assessAppShellSources(withoutBoundary).ok, false)

  const detachedShopSizing = appShellSources()
  const shopRule = '.shop-counter-module > .shop-counter-surface { min-height: 500px; flex: 0 0 clamp(500px,calc(100svh - 280px),620px); overflow: hidden; }'
  detachedShopSizing['showroom/src/core/core-app.css'] = detachedShopSizing['showroom/src/core/core-app.css']
    .replace(shopRule, '.shop-counter-module > .shop-counter-surface { min-height: 500px; overflow: hidden; }\n.decoy { flex: 0 0 clamp(500px,calc(100svh - 280px),620px); }')
  assert.equal(assessAppShellSources(detachedShopSizing).ok, false)

  const detachedMobileSetup = appShellSources()
  const mobileSetupRule = '.product-home-setup > summary { align-items: flex-start; padding-block: 12px; }'
  detachedMobileSetup['showroom/src/core/core-app.css'] = detachedMobileSetup['showroom/src/core/core-app.css']
    .replace(mobileSetupRule, '.product-home-setup > summary { align-items: flex-start; }\n.decoy { padding-block: 12px; }')
  assert.equal(assessAppShellSources(detachedMobileSetup).ok, false)
})

test('app shell comparison is exact, no-write, and batch-specific', () => {
  const packet = buildAppShellComparison({
    generatedAt: '2026-07-30T15:30:00.000Z',
    upstream: appShellTree('origin/main', sha('c'), ['upstream']),
    candidate: appShellTree('HEAD', sha('d'), ['candidate']),
  })
  assert.equal(packet.batch, APP_SHELL_BATCH)
  assert.equal(packet.decision.status, 'manual_union_required')
  assert.match(packet.decision.acceptanceCommand, /--batch app-shell$/)
  assert.equal(packet.upstream.authority.upstream.passed, true)
  assert.equal(packet.candidate.authority.candidate.passed, true)
  assert.equal(validateAppShellComparison(packet).digest, packet.digest)
  assert.throws(() => validateIdentityDataComparison(packet), /release_integration_batch_packet_invalid/)
})

test('Ecommerce requires simple private UX and governed lifecycle depth together', () => {
  const upstream = assessEcommerceSources(ecommerceSources(['upstream']))
  const candidate = assessEcommerceSources(ecommerceSources(['candidate']))
  const integrated = assessEcommerceSources(ecommerceSources())
  assert.equal(upstream.ok, false)
  assert.equal(upstream.authority.upstream.passed, true)
  assert.equal(candidate.ok, false)
  assert.equal(candidate.authority.candidate.passed, true)
  assert.equal(integrated.ok, true)

  const exposed = ecommerceSources()
  exposed['showroom/src/products/ecommerce/EcommerceProduct.tsx'] = exposed['showroom/src/products/ecommerce/EcommerceProduct.tsx'].replace('Managed Shop - connected company', '')
  assert.equal(assessEcommerceSources(exposed).ok, false)

  const shallow = ecommerceSources()
  shallow['showroom/src/products/ecommerce/EcommerceBuyingWorkspace.tsx'] = shallow['showroom/src/products/ecommerce/EcommerceBuyingWorkspace.tsx'].replace('function submitCorrectionRequest', '')
  assert.equal(assessEcommerceSources(shallow).ok, false)
})

test('Ecommerce comparison is exact, no-write, and batch-specific', () => {
  const packet = buildEcommerceComparison({
    generatedAt: '2026-07-30T16:00:00.000Z',
    upstream: ecommerceTree('origin/main', sha('e'), ['upstream']),
    candidate: ecommerceTree('HEAD', sha('f'), ['candidate']),
  })
  assert.equal(packet.batch, ECOMMERCE_BATCH)
  assert.equal(packet.decision.status, 'manual_union_required')
  assert.match(packet.decision.acceptanceCommand, /--batch ecommerce$/)
  assert.equal(packet.upstream.authority.upstream.passed, true)
  assert.equal(packet.candidate.authority.candidate.passed, true)
  assert.equal(validateEcommerceComparison(packet).digest, packet.digest)
  assert.throws(() => validateAppShellComparison(packet), /release_integration_batch_packet_invalid/)
})

test('final batch requires production activation gates and candidate product operations together', () => {
  const upstream = assessReleaseSecurityHqSources(finalBatchSources(['upstream']))
  const candidate = assessReleaseSecurityHqSources(finalBatchSources(['candidate']))
  assert.equal(upstream.authority.upstream.passed, true)
  assert.equal(upstream.ok, false)
  assert.equal(candidate.authority.candidate.passed, true)
  assert.equal(candidate.ok, false)
  assert.equal(assessReleaseSecurityHqSources(finalBatchSources()).ok, true)
})

test('final batch comparison is exact and no-write', () => {
  const packet = buildReleaseSecurityHqComparison({
    generatedAt: '2026-07-30T16:30:00.000Z',
    upstream: finalBatchTree('origin/main', sha('1'), ['upstream']),
    candidate: finalBatchTree('HEAD', sha('2'), ['candidate']),
  })
  assert.equal(packet.batch, RELEASE_SECURITY_HQ_BATCH)
  assert.match(packet.decision.acceptanceCommand, /--batch release-security-hq$/)
  assert.equal(validateReleaseSecurityHqComparison(packet).digest, packet.digest)
  assert.throws(() => validateEcommerceComparison(packet), /release_integration_batch_packet_invalid/)
})
