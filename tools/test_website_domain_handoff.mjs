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

function domainTarget(hostname) {
  return {
    provider: 'vercel',
    projectRef: 'owner-bound-at-execution',
    environment: 'production',
    protection: 'required',
    domain: {
      hostname,
      ownership: 'unverified_owner_supplied',
      dnsChange: 'separate_owner_action',
      tls: 'required',
      previewAcceptance: 'required_before_activation',
      ownerActivationApproval: 'required',
    },
  }
}

const plannedState = model.prepareWebsiteDeployPlan(approved, {
  planId: 'website-domain-plan-1',
  packageDigest: candidate.packageDigest,
  approvalId: 'website-domain-release-approval',
  target: domainTarget('WWW.Mingalar-Spa.COM'),
  previousDeployment: null,
  proof: proof(3, 'Release manager', 'prepared no-write customer domain handoff'),
  expectedHeadDigest: approved.headDigest,
}).state
const planned = model.projectWebsiteRelease(plannedState)

check(planned.status === 'plan_ready', 'domain plan is ready for owner handoff')
check(planned.deployPlan.target.domain.hostname === 'www.mingalar-spa.com', 'domain is canonicalized')
check(planned.deployPlan.steps.length === 6, 'domain handoff adds ownership and activation gates')
check(planned.deployPlan.steps[3].action === 'verify_domain_ownership_and_dns_plan', 'domain ownership check precedes promotion')
check(planned.deployPlan.steps[5].action === 'attach_verified_domain_and_check_https', 'domain activation is explicit')
check(planned.deployPlan.domainActivation.status === 'not_executed', 'domain activation is not executed')
check(planned.deployPlan.domainActivation.ownerApprovalRequired === true, 'domain activation requires owner approval')
check(planned.deployPlan.domainActivation.providerWritesPerformed === false, 'provider write remains false')
check(planned.deployPlan.domainActivation.dnsWritesPerformed === false, 'DNS write remains false')
check(planned.deployPlan.domainActivation.blockers.join(',') === 'domain_ownership_unverified,preview_acceptance_missing,dns_plan_unverified,owner_activation_approval_missing', 'all domain blockers remain explicit')
check(uiSource.includes('Customer domain') && uiSource.includes('www.example.com'), 'owner UI exposes the domain handoff input')
check(uiSource.includes('This records no DNS or provider change.'), 'owner UI preserves the no-write boundary')
check(uiSource.includes('preview, DNS, HTTPS, activation, candidate promotion, and rollback all remain unexecuted'), 'owner UI states every remaining gate')

check(model.normalizeWebsiteDomainHostname('မင်္ဂလာ.com').endsWith('.com'), 'Myanmar IDN input canonicalizes to a public ASCII hostname')
for (const invalid of [
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

const oldPlanState = model.prepareWebsiteDeployPlan(approved, {
  planId: 'website-domain-plan-legacy',
  packageDigest: candidate.packageDigest,
  approvalId: 'website-domain-release-approval',
  target: { provider: 'vercel', projectRef: 'owner-bound-at-execution', environment: 'production', protection: 'required' },
  previousDeployment: null,
  proof: proof(3, 'Release manager', 'prepared legacy no-domain plan'),
  expectedHeadDigest: approved.headDigest,
}).state
const oldPlan = model.projectWebsiteRelease(oldPlanState).deployPlan
check(!Object.hasOwn(oldPlan.target, 'domain'), 'legacy target remains byte-shape compatible')
check(oldPlan.steps.length === 4, 'legacy plan retains its four-step sequence')
check(oldPlan.domainActivation.blockers[0] === 'customer_domain_not_bound', 'legacy plan truthfully reports missing domain')

const tampered = structuredClone(plannedState)
tampered.commands.at(-1).payload.target.domain.hostname = 'other.example.com'
rejects(() => model.validateWebsiteReleaseState(tampered), 'domain tampering breaks the command digest')

console.log(JSON.stringify({ ok: true, contract: 'supermega.website.domain-handoff.v1', checks }))
