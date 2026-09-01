import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export * from './website-release-foundation.ts'`,
    resolveDir: 'showroom/src/products/website',
    sourcefile: 'showroom/src/products/website/website-domain-handoff-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const model = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`)
const uiSource = await readFile('showroom/src/products/website/WebsiteReleaseFoundation.tsx', 'utf8')

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

function rejects(action, label) {
  checks += 1
  assert.throws(action, undefined, label)
}

function proof(sequence, actor, reason) {
  return {
    actionId: `website-domain-action-${sequence}`,
    capturedAt: `2026-09-02T10:00:0${sequence}+06:30`,
    actor,
    reason,
    evidenceReference: `website-domain-evidence-${sequence}`,
  }
}

const scope = 'website:domain-handoff-test'
const digest = (label) => model.websiteReleaseEvidenceDigest({ label })
const candidate = model.buildWebsiteReleasePackage({
  packageId: 'website-domain-package-v2',
  source: {
    scope,
    snapshotId: 'website-domain-snapshot-1',
    websiteFingerprint: 'web-1a2b3c4d',
    artifactDigest: digest('approved-site'),
    contentRevision: 1,
    contentApprovalId: 'website-domain-content-approval',
    contentApprovalActor: 'Website owner',
    contentApprovalAt: '2026-09-02T09:30:00+06:30',
    evidence: [
      { id: 'website-domain-content', kind: 'content', reference: 'local review', verifiedBy: 'Website owner', verifiedAt: '2026-09-02T09:10:00+06:30' },
      { id: 'website-domain-links', kind: 'links', reference: 'local link check', verifiedBy: 'Release reviewer', verifiedAt: '2026-09-02T09:15:00+06:30' },
      { id: 'website-domain-responsive', kind: 'responsive', reference: 'local mobile and desktop check', verifiedBy: 'Release reviewer', verifiedAt: '2026-09-02T09:20:00+06:30' },
    ],
  },
  template: model.websiteReleaseTemplate(2),
  brand: {
    schema: model.WEBSITE_BRAND_TOKEN_CONTRACT,
    palette: { accent: '#087f5b', ink: '#17211b', surface: '#f7f8f4' },
    typography: { body: 'noto-sans-myanmar', heading: 'system-sans' },
    radiusPx: 12,
  },
  locales: [{ locale: 'en', isDefault: true, status: 'approved', contentDigest: digest('English content') }],
  media: [],
  roles: [
    { role: 'content_owner', actor: 'Website owner' },
    { role: 'release_manager', actor: 'Release manager' },
    { role: 'release_reviewer', actor: 'Release reviewer' },
  ],
})

const empty = model.createEmptyWebsiteReleaseState(scope)
const prepared = model.prepareWebsiteReleasePackage(
  empty,
  candidate,
  proof(1, 'Release manager', 'prepared exact Website package'),
  empty.headDigest,
).state
const approved = model.approveWebsiteReleasePackage(prepared, {
  approvalId: 'website-domain-release-approval',
  packageDigest: candidate.packageDigest,
  note: 'Exact Website package and domain handoff boundary reviewed.',
  proof: proof(2, 'Release reviewer', 'approved exact Website package'),
  expectedHeadDigest: prepared.headDigest,
}).state

const plannedState = model.prepareWebsiteDeployPlan(approved, {
  planId: 'website-domain-plan-1',
  packageDigest: candidate.packageDigest,
  approvalId: 'website-domain-release-approval',
  target: { provider: 'vercel', projectRef: 'owner-bound-at-execution', environment: 'production', protection: 'required' },
  previousDeployment: null,
  proof: proof(3, 'Release manager', 'prepared owner-gated deploy plan'),
  expectedHeadDigest: approved.headDigest,
}).state
const planned = model.projectWebsiteRelease(plannedState)
const handoff = model.buildWebsiteDomainHandoff({
  hostname: 'WWW.Mingalar-Spa.COM',
  release: {
    scope: planned.scope,
    headDigest: planned.headDigest,
    packageDigest: planned.package.packageDigest,
    artifactDigest: planned.package.source.artifactDigest,
    approvalId: planned.approval.id,
    deployPlanDigest: model.websiteReleaseEvidenceDigest(planned.deployPlan),
  },
})

check(planned.status === 'plan_ready' && planned.deployPlan.steps.length === 4, 'existing deploy plan remains unchanged')
check(!Object.hasOwn(planned.deployPlan.target, 'domain'), 'customer hostname is absent from persisted release state')
check(handoff.contract === model.WEBSITE_DOMAIN_HANDOFF_CONTRACT, 'domain handoff has the exact contract')
check(handoff.hostname === 'www.mingalar-spa.com', 'ASCII domain is canonicalized')
check(handoff.release.headDigest === planned.headDigest, 'handoff binds the exact release state')
check(handoff.release.deployPlanDigest === model.websiteReleaseEvidenceDigest(planned.deployPlan), 'handoff binds the exact deploy plan')
check(handoff.status === 'not_executed' && handoff.currentGate === 'domain_ownership_unverified', 'handoff starts fail closed')
check(handoff.stages.length === 7, 'domain lifecycle has seven explicit evidence gates')
check(handoff.stages.map((stage) => stage.action).join(',') === 'verify_domain_ownership,add_domain_to_provider_project,capture_provider_dns_challenge,apply_exact_dns_mapping,verify_provider_domain_ready,verify_https_and_live_routes,activate_canonical_domain', 'domain lifecycle order is exact')
check(handoff.stages.every((stage) => stage.status === 'not_executed'), 'every domain stage remains unexecuted')
check(handoff.rollback.requiredEvidence.join(',') === 'provider_domain_removal_receipt,dns_restore_receipt,https_previous_route_receipt', 'domain rollback has explicit removal and restore evidence')
check(handoff.rollback.blockers.join(',') === 'known_good_previous_domain_state_missing,owner_rollback_approval_missing', 'domain rollback remains blocked')
check(Object.values(handoff.controls).every((value) => value === false), 'all handoff write and activation controls remain false')
check(JSON.stringify(model.validateWebsiteDomainHandoff(handoff)) === JSON.stringify(handoff), 'downloaded packet validates exactly')
const parityHandoff = model.buildWebsiteDomainHandoff({
  hostname: 'WWW.Mingalar-Spa.COM',
  release: {
    scope: 'website:domain-parity',
    headDigest: `sha256:${'1'.repeat(64)}`,
    packageDigest: `sha256:${'2'.repeat(64)}`,
    artifactDigest: `sha256:${'3'.repeat(64)}`,
    approvalId: 'website-domain-parity-approval',
    deployPlanDigest: `sha256:${'4'.repeat(64)}`,
  },
})
check(parityHandoff.packetDigest === 'sha256:beca88a43f6442214cb14b0e1caa2d90b86ba1521ec7245a59c9438ae295a444', 'TypeScript and Python packet digest parity is pinned')
check(uiSource.includes('Customer domain') && uiSource.includes('www.example.com'), 'owner UI exposes the domain handoff input')
check(uiSource.includes('It is not saved to Website history'), 'owner UI discloses the non-persistent hostname boundary')
const downloadFunction = uiSource.slice(uiSource.indexOf('function downloadDomainHandoff'), uiSource.indexOf('\n  if (!publishIsCurrent', uiSource.indexOf('function downloadDomainHandoff')))
check(downloadFunction.includes('buildWebsiteDomainHandoff') && !downloadFunction.includes('saveTransition') && !downloadFunction.includes('setItem'), 'domain download path has no persistence transition')

check(model.normalizeWebsiteDomainHostname('xn--fa-hia.de') === 'xn--fa-hia.de', 'explicit ASCII punycode is accepted deterministically')
for (const invalid of [
  'မင်္ဂလာ.com',
  'faß.de',
  'https://example.com',
  'example.com/path',
  'example.com:443',
  'user@example.com',
  'localhost',
  'shop.local',
  'shop.example',
  '127.0.0.1',
  'singlelabel',
  '-bad.example.com',
]) rejects(() => model.normalizeWebsiteDomainHostname(invalid), `invalid domain rejected: ${invalid}`)

const tampered = structuredClone(handoff)
tampered.controls.providerWritesPerformed = true
rejects(() => model.validateWebsiteDomainHandoff(tampered), 'a claimed provider write is rejected')
const driftedStage = structuredClone(handoff)
driftedStage.stages[2].action = 'skip_provider_dns_challenge'
const driftedBody = structuredClone(driftedStage)
delete driftedBody.packetDigest
driftedStage.packetDigest = model.websiteReleaseEvidenceDigest(driftedBody)
rejects(() => model.validateWebsiteDomainHandoff(driftedStage), 'a rehashed lifecycle drift is rejected')

console.log(JSON.stringify({ ok: true, contract: model.WEBSITE_DOMAIN_HANDOFF_CONTRACT, checks }))
