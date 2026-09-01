export const WEBSITE_RELEASE_STATE_SCHEMA = 'supermega.website.release_foundation.v1' as const
export const WEBSITE_RELEASE_PACKAGE_CONTRACT = 'supermega.website.release_package.v1' as const
export const WEBSITE_RELEASE_PROJECTION_CONTRACT = 'supermega.website.release_projection.v1' as const
export const WEBSITE_DEPLOY_PLAN_CONTRACT = 'supermega.website.deploy_plan.v1' as const
export const WEBSITE_BRAND_TOKEN_CONTRACT = 'supermega.website.brand_tokens.v1' as const
export const EMPTY_WEBSITE_RELEASE_DIGEST = `sha256:${'0'.repeat(64)}`
export const WEBSITE_RELEASE_STORAGE_PREFIX = 'supermega.website.release-foundation.v1:'

export type WebsiteReleaseProof = {
  actionId: string
  capturedAt: string
  actor: string
  reason: string
  evidenceReference: string
}

export type WebsiteReleaseSourceEvidence = {
  id: string
  kind: 'content' | 'links' | 'responsive'
  reference: string
  verifiedBy: string
  verifiedAt: string
}

export type WebsiteReleaseSource = {
  scope: string
  snapshotId: string
  websiteFingerprint: string
  artifactDigest: string
  contentRevision: number
  contentApprovalId: string
  contentApprovalActor: string
  contentApprovalAt: string
  evidence: WebsiteReleaseSourceEvidence[]
}

export type WebsiteReleaseTemplate = {
  templateId: 'TPL-BUSINESS-001'
  version: 1 | 2
  components: Array<{ componentId: string; version: number }>
}

export type WebsiteBrandTokens = {
  schema: typeof WEBSITE_BRAND_TOKEN_CONTRACT
  palette: { accent: string; ink: string; surface: string }
  typography: { body: 'system-sans' | 'noto-sans-myanmar' | 'system-serif'; heading: 'system-sans' | 'noto-sans-myanmar' | 'system-serif' }
  radiusPx: number
}

export type WebsiteReleaseLocale = {
  locale: string
  isDefault: boolean
  status: 'approved' | 'draft'
  contentDigest: string
}

export type WebsiteReleaseMedia = {
  assetId: string
  kind: 'image'
  digest: string
  bytes: number
  decorative: boolean
  alt: Array<{ locale: string; text: string }>
}

export type WebsiteReleaseRole = {
  role: 'content_owner' | 'release_manager' | 'release_reviewer'
  actor: string
}

export type WebsiteTemplateMigration = {
  migrationId: string
  fromPackageDigest: string
  fromTemplateVersion: 1
  toTemplateVersion: 2
  operations: string[]
  preserved: { source: string; brand: string; locales: string; media: string; roles: string }
}

export type WebsiteReleasePackage = {
  contract: typeof WEBSITE_RELEASE_PACKAGE_CONTRACT
  packageId: string
  source: WebsiteReleaseSource
  template: WebsiteReleaseTemplate
  brand: WebsiteBrandTokens
  locales: WebsiteReleaseLocale[]
  media: WebsiteReleaseMedia[]
  roles: WebsiteReleaseRole[]
  previousPackageDigest: string | null
  migration: WebsiteTemplateMigration | null
  packageDigest: string
}

type PreparePackageCommand = { kind: 'prepare_package'; id: string; package: WebsiteReleasePackage; proof: WebsiteReleaseProof }
type UpgradeTemplateCommand = { kind: 'upgrade_template'; id: string; package: WebsiteReleasePackage; proof: WebsiteReleaseProof }
type ApproveReleaseCommand = { kind: 'approve_release'; id: string; packageDigest: string; note: string; proof: WebsiteReleaseProof }
type PrepareDeployPlanCommand = {
  kind: 'prepare_deploy_plan'
  id: string
  packageDigest: string
  approvalId: string
  target: {
    provider: 'vercel'
    projectRef: string
    environment: 'production'
    protection: 'required'
    domain?: WebsiteDomainHandoff
  }
  previousDeployment: { deploymentId: string; packageDigest: string; artifactDigest: string } | null
  proof: WebsiteReleaseProof
}

export type WebsiteDomainHandoff = {
  hostname: string
  ownership: 'unverified_owner_supplied'
  dnsChange: 'separate_owner_action'
  tls: 'required'
  previewAcceptance: 'required_before_activation'
  ownerActivationApproval: 'required'
}
export type WebsiteReleaseCommandPayload = PreparePackageCommand | UpgradeTemplateCommand | ApproveReleaseCommand | PrepareDeployPlanCommand
export type WebsiteReleaseCommand = { sequence: number; previousDigest: string; payload: WebsiteReleaseCommandPayload; digest: string }
export type WebsiteReleaseState = {
  schema: typeof WEBSITE_RELEASE_STATE_SCHEMA
  scope: string
  revision: number
  headDigest: string
  commands: WebsiteReleaseCommand[]
}

export type WebsiteDeployPlan = {
  contract: typeof WEBSITE_DEPLOY_PLAN_CONTRACT
  planId: string
  status: 'not_executed'
  candidate: { packageDigest: string; artifactDigest: string; approvalId: string; approvedLocales: string[] }
  target: PrepareDeployPlanCommand['target']
  steps: Array<{ sequence: number; action: string; gate: string; authority: string }>
  rollback: {
    mode: 'promote_exact_previous_deployment' | 'blocked_until_previous_deployment_bound'
    deploymentId: string | null
    packageDigest: string | null
    artifactDigest: string | null
    status: 'not_executed'
    ownerApprovalRequired: true
  }
  domainActivation: {
    hostname: string | null
    status: 'not_executed'
    blockers: string[]
    ownerApprovalRequired: true
    providerWritesPerformed: false
    dnsWritesPerformed: false
  }
  proof: WebsiteReleaseProof
  ownerApprovalRequired: true
}

export type WebsiteReleaseProjection = {
  contract: typeof WEBSITE_RELEASE_PROJECTION_CONTRACT
  scope: string
  revision: number
  headDigest: string
  status: 'unprepared' | 'needs_release_review' | 'ready_for_plan' | 'plan_ready'
  package: WebsiteReleasePackage | null
  approval: { id: string; packageDigest: string; reviewer: string; note: string; proof: WebsiteReleaseProof } | null
  deployPlan: WebsiteDeployPlan | null
  approvedLocales: string[]
  draftLocales: string[]
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
type LockLike = { request: <T>(name: string, options: { mode: 'exclusive' }, callback: () => T | Promise<T>) => Promise<T> }

const digestPattern = /^sha256:[0-9a-f]{64}$/
const websiteFingerprintPattern = /^web-[0-9a-f]{8}$/
const tokenPattern = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,179}$/
const languageTagPattern = /^[a-z]{2,3}(?:-[A-Z]{2})?$/
const hexColorPattern = /^#[0-9a-f]{6}$/
const timestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/
const sourceEvidenceKinds = ['content', 'links', 'responsive'] as const
const requiredRoles = ['content_owner', 'release_manager', 'release_reviewer'] as const
const fontTokens = new Set(['system-sans', 'noto-sans-myanmar', 'system-serif'])
const templateComponents = {
  1: [['CMP-CONTENT', 1], ['CMP-HERO', 1], ['CMP-NAVIGATION', 1]],
  2: [['CMP-CONTENT', 1], ['CMP-HERO', 2], ['CMP-NAVIGATION', 2]],
} as const
const migrationOperations = ['CMP-HERO:1->2', 'CMP-NAVIGATION:1->2'] as const
const commandKinds = new Set(['prepare_package', 'upgrade_template', 'approve_release', 'prepare_deploy_plan'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function exact(value: unknown, field: string, fields: string[]) {
  if (!isRecord(value)) throw new Error(`${field} must be an object.`)
  const keys = Object.keys(value)
  if (keys.length !== fields.length || keys.some((key) => !fields.includes(key))) throw new Error(`${field} fields do not match the contract.`)
  return value
}

function array(value: unknown, field: string, minimum: number, maximum: number) {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) throw new Error(`${field} must contain between ${minimum} and ${maximum} items.`)
  return value
}

function text(value: unknown, field: string, maximum = 240, allowBlank = false) {
  if (typeof value !== 'string' || value !== value.trim() || (!allowBlank && !value) || value.normalize('NFC') !== value) throw new Error(`${field} must be normalized trimmed text.`)
  if (Array.from(value).some((character) => {
    const code = character.codePointAt(0) ?? 0
    return code <= 31 || code === 127
  }) || value.length > maximum) throw new Error(`${field} is not canonical text.`)
  return value
}

function token(value: unknown, field: string) {
  const candidate = text(value, field, 180)
  if (!tokenPattern.test(candidate)) throw new Error(`${field} must be a canonical token.`)
  return candidate
}

export function normalizeWebsiteDomainHostname(value: unknown) {
  const candidate = text(value, 'domain.hostname', 253).toLowerCase()
  if (candidate.includes('://') || /[/?#@:]/.test(candidate)) throw new Error('domain.hostname must be a hostname without a scheme, port, path, query, fragment, or credentials.')
  let hostname: string
  try {
    hostname = new URL(`https://${candidate}/`).hostname.toLowerCase()
  } catch {
    throw new Error('domain.hostname must be a valid public hostname.')
  }
  if (!hostname || hostname.length > 253 || hostname.endsWith('.') || hostname.includes('..')) throw new Error('domain.hostname must be a canonical public hostname.')
  const labels = hostname.split('.')
  if (labels.length < 2 || labels.some((label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) throw new Error('domain.hostname must contain valid DNS labels.')
  const finalLabel = labels.at(-1) ?? ''
  if (finalLabel.length < 2 || /^\d+$/.test(finalLabel)) throw new Error('domain.hostname must have a public top-level domain.')
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local') || hostname.endsWith('.test') || hostname.endsWith('.invalid') || hostname.endsWith('.example')) throw new Error('domain.hostname must not use a local or reserved suffix.')
  return hostname
}

function integer(value: unknown, field: string, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || Number(value) < minimum || Number(value) > maximum) throw new Error(`${field} must be a supported integer.`)
  return Number(value)
}

function boolean(value: unknown, field: string) {
  if (typeof value !== 'boolean') throw new Error(`${field} must be true or false.`)
  return value
}

function digest(value: unknown, field: string) {
  const candidate = text(value, field, 71)
  if (!digestPattern.test(candidate)) throw new Error(`${field} must be a SHA-256 digest.`)
  return candidate
}

function timestampMicros(value: unknown, field: string) {
  const candidate = text(value, field, 40)
  if (!timestampPattern.test(candidate)) throw new Error(`${field} must be an ISO timestamp with an explicit offset.`)
  const parsed = Date.parse(candidate)
  if (!Number.isFinite(parsed)) throw new Error(`${field} must be a real calendar timestamp.`)
  const fraction = /\.(\d{1,6})/.exec(candidate)?.[1] ?? ''
  return { value: candidate, micros: BigInt(parsed) * 1_000n + BigInt(fraction.padEnd(6, '0').slice(3) || '0') }
}

function unique(values: string[], field: string) {
  if (new Set(values).size !== values.length) throw new Error(`${field} contains duplicates.`)
}

function compareCanonicalText(left: string, right: string) {
  const leftPoints = Array.from(left, (character) => character.codePointAt(0) ?? 0)
  const rightPoints = Array.from(right, (character) => character.codePointAt(0) ?? 0)
  for (let index = 0; index < Math.min(leftPoints.length, rightPoints.length); index += 1) {
    if (leftPoints[index] !== rightPoints[index]) return leftPoints[index] - rightPoints[index]
  }
  return leftPoints.length - rightPoints.length
}

function sorted(values: string[], field: string) {
  const ordered = [...values].sort(compareCanonicalText)
  if (values.some((value, index) => value !== ordered[index])) throw new Error(`${field} must use canonical order.`)
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue)
  if (isRecord(value)) return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]))
  return value
}

function canonicalJson(value: unknown) {
  return JSON.stringify(canonicalValue(value))
}

function canonicalCopy<T>(value: T): T {
  return JSON.parse(canonicalJson(value)) as T
}

const sha256RoundConstants = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
])

function rotateRight(value: number, bits: number) {
  return (value >>> bits) | (value << (32 - bits))
}

function sha256Hex(source: string) {
  const input = new TextEncoder().encode(source)
  const paddedLength = Math.ceil((input.length + 9) / 64) * 64
  const padded = new Uint8Array(paddedLength)
  padded.set(input); padded[input.length] = 0x80
  const view = new DataView(padded.buffer)
  const bitLength = BigInt(input.length) * 8n
  view.setUint32(paddedLength - 8, Number(bitLength >> 32n), false)
  view.setUint32(paddedLength - 4, Number(bitLength & 0xffffffffn), false)
  const hash = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19])
  const words = new Uint32Array(64)
  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let index = 0; index < 16; index += 1) words[index] = view.getUint32(offset + index * 4, false)
    for (let index = 16; index < 64; index += 1) {
      const before15 = words[index - 15]; const before2 = words[index - 2]
      const sigma0 = rotateRight(before15, 7) ^ rotateRight(before15, 18) ^ (before15 >>> 3)
      const sigma1 = rotateRight(before2, 17) ^ rotateRight(before2, 19) ^ (before2 >>> 10)
      words[index] = (words[index - 16] + sigma0 + words[index - 7] + sigma1) >>> 0
    }
    let [a, b, c, d, e, f, g, h] = hash
    for (let index = 0; index < 64; index += 1) {
      const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25)
      const choice = (e & f) ^ (~e & g)
      const temporary1 = (h + sum1 + choice + sha256RoundConstants[index] + words[index]) >>> 0
      const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22)
      const majority = (a & b) ^ (a & c) ^ (b & c)
      const temporary2 = (sum0 + majority) >>> 0
      h = g; g = f; f = e; e = (d + temporary1) >>> 0; d = c; c = b; b = a; a = (temporary1 + temporary2) >>> 0
    }
    hash[0] = (hash[0] + a) >>> 0; hash[1] = (hash[1] + b) >>> 0; hash[2] = (hash[2] + c) >>> 0; hash[3] = (hash[3] + d) >>> 0
    hash[4] = (hash[4] + e) >>> 0; hash[5] = (hash[5] + f) >>> 0; hash[6] = (hash[6] + g) >>> 0; hash[7] = (hash[7] + h) >>> 0
  }
  return Array.from(hash, (value) => value.toString(16).padStart(8, '0')).join('')
}

export function websiteReleaseEvidenceDigest(value: unknown) {
  return `sha256:${sha256Hex(canonicalJson(value))}`
}

function actionProof(value: unknown, field: string): WebsiteReleaseProof {
  const source = exact(value, field, ['actionId', 'capturedAt', 'actor', 'reason', 'evidenceReference'])
  return {
    actionId: token(source.actionId, `${field}.actionId`),
    capturedAt: timestampMicros(source.capturedAt, `${field}.capturedAt`).value,
    actor: text(source.actor, `${field}.actor`, 120),
    reason: text(source.reason, `${field}.reason`, 300),
    evidenceReference: text(source.evidenceReference, `${field}.evidenceReference`, 220),
  }
}

function sourceEvidence(value: unknown, field: string): WebsiteReleaseSourceEvidence[] {
  const rows = array(value, field, 3, 3).map((candidate, index) => {
    const rowField = `${field}[${index}]`; const source = exact(candidate, rowField, ['id', 'kind', 'reference', 'verifiedBy', 'verifiedAt'])
    if (!sourceEvidenceKinds.includes(source.kind as typeof sourceEvidenceKinds[number])) throw new Error(`${rowField}.kind is unsupported.`)
    return {
      id: token(source.id, `${rowField}.id`),
      kind: source.kind as WebsiteReleaseSourceEvidence['kind'],
      reference: text(source.reference, `${rowField}.reference`, 220),
      verifiedBy: text(source.verifiedBy, `${rowField}.verifiedBy`, 120),
      verifiedAt: timestampMicros(source.verifiedAt, `${rowField}.verifiedAt`).value,
    }
  })
  const kinds = rows.map((row) => row.kind); unique(kinds, `${field} kinds`); sorted(kinds, `${field} kinds`)
  if (kinds.join(',') !== sourceEvidenceKinds.join(',')) throw new Error(`${field} must cover content, links, and responsive review.`)
  unique(rows.map((row) => row.id), `${field} IDs`)
  return rows
}

function releaseSource(value: unknown, field: string): WebsiteReleaseSource {
  const source = exact(value, field, ['scope', 'snapshotId', 'websiteFingerprint', 'artifactDigest', 'contentRevision', 'contentApprovalId', 'contentApprovalActor', 'contentApprovalAt', 'evidence'])
  const fingerprint = text(source.websiteFingerprint, `${field}.websiteFingerprint`, 12)
  if (!websiteFingerprintPattern.test(fingerprint)) throw new Error(`${field}.websiteFingerprint is unsupported.`)
  return {
    scope: token(source.scope, `${field}.scope`),
    snapshotId: token(source.snapshotId, `${field}.snapshotId`),
    websiteFingerprint: fingerprint,
    artifactDigest: digest(source.artifactDigest, `${field}.artifactDigest`),
    contentRevision: integer(source.contentRevision, `${field}.contentRevision`, 1),
    contentApprovalId: token(source.contentApprovalId, `${field}.contentApprovalId`),
    contentApprovalActor: text(source.contentApprovalActor, `${field}.contentApprovalActor`, 120),
    contentApprovalAt: timestampMicros(source.contentApprovalAt, `${field}.contentApprovalAt`).value,
    evidence: sourceEvidence(source.evidence, `${field}.evidence`),
  }
}

function releaseTemplate(value: unknown, field: string): WebsiteReleaseTemplate {
  const source = exact(value, field, ['templateId', 'version', 'components'])
  if (source.templateId !== 'TPL-BUSINESS-001') throw new Error(`${field}.templateId is unsupported.`)
  const version = integer(source.version, `${field}.version`, 1, 2) as 1 | 2
  const components = array(source.components, `${field}.components`, 3, 3).map((candidate, index) => {
    const rowField = `${field}.components[${index}]`; const row = exact(candidate, rowField, ['componentId', 'version'])
    return { componentId: token(row.componentId, `${rowField}.componentId`), version: integer(row.version, `${rowField}.version`, 1, 20) }
  })
  if (components.some((row, index) => row.componentId !== templateComponents[version][index][0] || row.version !== templateComponents[version][index][1])) throw new Error(`${field}.components do not match the template version.`)
  return { templateId: 'TPL-BUSINESS-001', version, components }
}

export function websiteReleaseTemplate(version: 1 | 2 = 2): WebsiteReleaseTemplate {
  return { templateId: 'TPL-BUSINESS-001', version, components: templateComponents[version].map(([componentId, componentVersion]) => ({ componentId, version: componentVersion })) }
}

function brandTokens(value: unknown, field: string): WebsiteBrandTokens {
  const source = exact(value, field, ['schema', 'palette', 'typography', 'radiusPx'])
  if (source.schema !== WEBSITE_BRAND_TOKEN_CONTRACT) throw new Error(`${field}.schema is unsupported.`)
  const paletteSource = exact(source.palette, `${field}.palette`, ['accent', 'ink', 'surface'])
  const palette = Object.fromEntries(['accent', 'ink', 'surface'].map((name) => {
    const color = text(paletteSource[name], `${field}.palette.${name}`, 7)
    if (!hexColorPattern.test(color)) throw new Error(`${field}.palette.${name} must be a lowercase six-digit color.`)
    return [name, color]
  })) as WebsiteBrandTokens['palette']
  const typographySource = exact(source.typography, `${field}.typography`, ['body', 'heading'])
  const body = typographySource.body; const heading = typographySource.heading
  if (!fontTokens.has(String(body)) || !fontTokens.has(String(heading))) throw new Error(`${field}.typography is unsupported.`)
  return { schema: WEBSITE_BRAND_TOKEN_CONTRACT, palette, typography: { body, heading } as WebsiteBrandTokens['typography'], radiusPx: integer(source.radiusPx, `${field}.radiusPx`, 0, 32) }
}

function releaseLocales(value: unknown, field: string): WebsiteReleaseLocale[] {
  const rows = array(value, field, 1, 8).map((candidate, index) => {
    const rowField = `${field}[${index}]`; const source = exact(candidate, rowField, ['locale', 'isDefault', 'status', 'contentDigest'])
    const locale = text(source.locale, `${rowField}.locale`, 12)
    if (!languageTagPattern.test(locale)) throw new Error(`${rowField}.locale must be a canonical language tag.`)
    if (source.status !== 'approved' && source.status !== 'draft') throw new Error(`${rowField}.status is unsupported.`)
    return { locale, isDefault: boolean(source.isDefault, `${rowField}.isDefault`), status: source.status, contentDigest: digest(source.contentDigest, `${rowField}.contentDigest`) } as WebsiteReleaseLocale
  })
  const localeIds = rows.map((row) => row.locale); unique(localeIds, `${field} locale tags`); sorted(localeIds, `${field} locale tags`)
  const defaults = rows.filter((row) => row.isDefault)
  if (defaults.length !== 1 || defaults[0].status !== 'approved') throw new Error(`${field} must have one approved default locale.`)
  return rows
}

function releaseMedia(value: unknown, field: string, locales: WebsiteReleaseLocale[]): WebsiteReleaseMedia[] {
  const localeIds = new Set(locales.map((row) => row.locale)); const approvedLocaleIds = locales.filter((row) => row.status === 'approved').map((row) => row.locale)
  const rows = array(value, field, 0, 100).map((candidate, index) => {
    const rowField = `${field}[${index}]`; const source = exact(candidate, rowField, ['assetId', 'kind', 'digest', 'bytes', 'decorative', 'alt'])
    if (source.kind !== 'image') throw new Error(`${rowField}.kind is unsupported.`)
    const decorative = boolean(source.decorative, `${rowField}.decorative`)
    const alt = array(source.alt, `${rowField}.alt`, 0, 8).map((altCandidate, altIndex) => {
      const altField = `${rowField}.alt[${altIndex}]`; const altSource = exact(altCandidate, altField, ['locale', 'text']); const locale = text(altSource.locale, `${altField}.locale`, 12)
      if (!localeIds.has(locale)) throw new Error(`${altField}.locale is not in the package locale manifest.`)
      return { locale, text: text(altSource.text, `${altField}.text`, 240) }
    })
    const altLocales = alt.map((row) => row.locale); unique(altLocales, `${rowField}.alt locales`); sorted(altLocales, `${rowField}.alt locales`)
    if (decorative && alt.length) throw new Error(`${rowField} decorative images cannot claim alternative text.`)
    if (!decorative && (altLocales.length !== approvedLocaleIds.length || altLocales.some((locale, altIndex) => locale !== approvedLocaleIds[altIndex]))) throw new Error(`${rowField} must have alternative text for every approved locale.`)
    return { assetId: token(source.assetId, `${rowField}.assetId`), kind: 'image' as const, digest: digest(source.digest, `${rowField}.digest`), bytes: integer(source.bytes, `${rowField}.bytes`, 1, 50 * 1024 * 1024), decorative, alt }
  })
  const assetIds = rows.map((row) => row.assetId); unique(assetIds, `${field} asset IDs`); sorted(assetIds, `${field} asset IDs`)
  return rows
}

function releaseRoles(value: unknown, field: string): WebsiteReleaseRole[] {
  const rows = array(value, field, 3, 3).map((candidate, index) => {
    const rowField = `${field}[${index}]`; const source = exact(candidate, rowField, ['role', 'actor'])
    if (!requiredRoles.includes(source.role as typeof requiredRoles[number])) throw new Error(`${rowField}.role is unsupported.`)
    return { role: source.role as WebsiteReleaseRole['role'], actor: text(source.actor, `${rowField}.actor`, 120) }
  })
  const roleIds = rows.map((row) => row.role); unique(roleIds, `${field} roles`); sorted(roleIds, `${field} roles`)
  if (roleIds.join(',') !== requiredRoles.join(',')) throw new Error(`${field} must assign all required release roles.`)
  return rows
}

function roleActor(packageValue: Pick<WebsiteReleasePackage, 'roles'>, role: WebsiteReleaseRole['role']) {
  const actor = packageValue.roles.find((row) => row.role === role)?.actor
  if (!actor) throw new Error(`Website release package is missing ${role}.`)
  return actor
}

function templateMigration(value: unknown, field: string): WebsiteTemplateMigration {
  const source = exact(value, field, ['migrationId', 'fromPackageDigest', 'fromTemplateVersion', 'toTemplateVersion', 'operations', 'preserved'])
  const operations = array(source.operations, `${field}.operations`, 2, 2).map((entry, index) => text(entry, `${field}.operations[${index}]`, 80))
  if (operations.some((entry, index) => entry !== migrationOperations[index])) throw new Error(`${field}.operations are unsupported.`)
  const preserved = exact(source.preserved, `${field}.preserved`, ['source', 'brand', 'locales', 'media', 'roles'])
  const fromTemplateVersion = integer(source.fromTemplateVersion, `${field}.fromTemplateVersion`, 1, 2)
  const toTemplateVersion = integer(source.toTemplateVersion, `${field}.toTemplateVersion`, 1, 2)
  if (fromTemplateVersion !== 1 || toTemplateVersion !== 2) throw new Error(`${field} must describe the v1 to v2 migration.`)
  return {
    migrationId: token(source.migrationId, `${field}.migrationId`),
    fromPackageDigest: digest(source.fromPackageDigest, `${field}.fromPackageDigest`),
    fromTemplateVersion: 1,
    toTemplateVersion: 2,
    operations,
    preserved: Object.fromEntries(['source', 'brand', 'locales', 'media', 'roles'].map((name) => [name, digest(preserved[name], `${field}.preserved.${name}`)])) as WebsiteTemplateMigration['preserved'],
  }
}

function validatePackage(value: unknown): WebsiteReleasePackage {
  const source = exact(value, 'Website release package', ['contract', 'packageId', 'source', 'template', 'brand', 'locales', 'media', 'roles', 'previousPackageDigest', 'migration', 'packageDigest'])
  if (source.contract !== WEBSITE_RELEASE_PACKAGE_CONTRACT) throw new Error('Website release package.contract is unsupported.')
  const checkedSource = releaseSource(source.source, 'Website release package.source')
  const checkedTemplate = releaseTemplate(source.template, 'Website release package.template')
  const checkedBrand = brandTokens(source.brand, 'Website release package.brand')
  const checkedLocales = releaseLocales(source.locales, 'Website release package.locales')
  const checkedMedia = releaseMedia(source.media, 'Website release package.media', checkedLocales)
  const checkedRoles = releaseRoles(source.roles, 'Website release package.roles')
  if (roleActor({ roles: checkedRoles }, 'content_owner') !== checkedSource.contentApprovalActor) throw new Error('Website release package content owner must match the approved content actor.')
  const previous = source.previousPackageDigest === null ? null : digest(source.previousPackageDigest, 'Website release package.previousPackageDigest')
  const migration = source.migration === null ? null : templateMigration(source.migration, 'Website release package.migration')
  if ((previous === null) !== (migration === null)) throw new Error('Website release package migration and previous digest must appear together.')
  if (migration) {
    if (migration.fromPackageDigest !== previous || checkedTemplate.version !== 2) throw new Error('Website release package migration does not match its template lineage.')
    const preserved = { source: websiteReleaseEvidenceDigest(checkedSource), brand: websiteReleaseEvidenceDigest(checkedBrand), locales: websiteReleaseEvidenceDigest(checkedLocales), media: websiteReleaseEvidenceDigest(checkedMedia), roles: websiteReleaseEvidenceDigest(checkedRoles) }
    if (canonicalJson(preserved) !== canonicalJson(migration.preserved)) throw new Error('Website release package migration preservation evidence drifted.')
  }
  const body = { contract: WEBSITE_RELEASE_PACKAGE_CONTRACT, packageId: token(source.packageId, 'Website release package.packageId'), source: checkedSource, template: checkedTemplate, brand: checkedBrand, locales: checkedLocales, media: checkedMedia, roles: checkedRoles, previousPackageDigest: previous, migration }
  const packageDigest = digest(source.packageDigest, 'Website release package.packageDigest')
  if (packageDigest !== websiteReleaseEvidenceDigest(body)) throw new Error('Website release package.packageDigest does not match its content.')
  return canonicalCopy({ ...body, packageDigest })
}

export function buildWebsiteReleasePackage(input: { packageId: unknown; source: unknown; template: unknown; brand: unknown; locales: unknown; media: unknown; roles: unknown }) {
  const checkedLocales = releaseLocales(input.locales, 'locales')
  const body = { contract: WEBSITE_RELEASE_PACKAGE_CONTRACT, packageId: token(input.packageId, 'packageId'), source: releaseSource(input.source, 'source'), template: releaseTemplate(input.template, 'template'), brand: brandTokens(input.brand, 'brand'), locales: checkedLocales, media: releaseMedia(input.media, 'media', checkedLocales), roles: releaseRoles(input.roles, 'roles'), previousPackageDigest: null, migration: null }
  return validatePackage({ ...body, packageDigest: websiteReleaseEvidenceDigest(body) })
}

export function upgradeWebsiteReleasePackage(packageValue: unknown, input: { packageId: unknown; migrationId: unknown }) {
  const previous = validatePackage(packageValue)
  if (previous.template.version !== 1) throw new Error('Only the supported Website template v1 can upgrade to v2.')
  const preserved = Object.fromEntries(['source', 'brand', 'locales', 'media', 'roles'].map((name) => [name, websiteReleaseEvidenceDigest(previous[name as keyof WebsiteReleasePackage])])) as WebsiteTemplateMigration['preserved']
  const migration: WebsiteTemplateMigration = { migrationId: token(input.migrationId, 'migrationId'), fromPackageDigest: previous.packageDigest, fromTemplateVersion: 1, toTemplateVersion: 2, operations: [...migrationOperations], preserved }
  const body = { contract: WEBSITE_RELEASE_PACKAGE_CONTRACT, packageId: token(input.packageId, 'packageId'), source: previous.source, template: websiteReleaseTemplate(2), brand: previous.brand, locales: previous.locales, media: previous.media, roles: previous.roles, previousPackageDigest: previous.packageDigest, migration }
  return validatePackage({ ...body, packageDigest: websiteReleaseEvidenceDigest(body) })
}

function deployTarget(value: unknown, field: string): PrepareDeployPlanCommand['target'] {
  if (!isRecord(value)) throw new Error(`${field} must be an object.`)
  const hasDomain = Object.prototype.hasOwnProperty.call(value, 'domain')
  const source = exact(value, field, hasDomain
    ? ['provider', 'projectRef', 'environment', 'protection', 'domain']
    : ['provider', 'projectRef', 'environment', 'protection'])
  if (source.provider !== 'vercel' || source.environment !== 'production') throw new Error(`${field} must describe the reviewed Vercel production target.`)
  if (source.protection !== 'required') throw new Error(`${field}.protection must remain required.`)
  const target: PrepareDeployPlanCommand['target'] = { provider: 'vercel', projectRef: token(source.projectRef, `${field}.projectRef`), environment: 'production', protection: 'required' }
  if (hasDomain) {
    const domain = exact(source.domain, `${field}.domain`, ['hostname', 'ownership', 'dnsChange', 'tls', 'previewAcceptance', 'ownerActivationApproval'])
    if (domain.ownership !== 'unverified_owner_supplied'
      || domain.dnsChange !== 'separate_owner_action'
      || domain.tls !== 'required'
      || domain.previewAcceptance !== 'required_before_activation'
      || domain.ownerActivationApproval !== 'required') throw new Error(`${field}.domain must preserve every owner and activation gate.`)
    target.domain = {
      hostname: normalizeWebsiteDomainHostname(domain.hostname),
      ownership: 'unverified_owner_supplied',
      dnsChange: 'separate_owner_action',
      tls: 'required',
      previewAcceptance: 'required_before_activation',
      ownerActivationApproval: 'required',
    }
  }
  return target
}

function previousDeployment(value: unknown, field: string): PrepareDeployPlanCommand['previousDeployment'] {
  if (value === null) return null
  const source = exact(value, field, ['deploymentId', 'packageDigest', 'artifactDigest'])
  return { deploymentId: token(source.deploymentId, `${field}.deploymentId`), packageDigest: digest(source.packageDigest, `${field}.packageDigest`), artifactDigest: digest(source.artifactDigest, `${field}.artifactDigest`) }
}

function commandPayload(value: unknown, field: string): WebsiteReleaseCommandPayload {
  if (!isRecord(value) || !commandKinds.has(String(value.kind))) throw new Error(`${field}.kind is unsupported.`)
  if (value.kind === 'prepare_package' || value.kind === 'upgrade_template') {
    const source = exact(value, field, ['kind', 'id', 'package', 'proof']); const packageValue = validatePackage(source.package); const id = token(source.id, `${field}.id`)
    const expectedId = value.kind === 'prepare_package' ? packageValue.packageId : packageValue.migration?.migrationId
    if (id !== expectedId) throw new Error(`${field}.id does not match its package evidence.`)
    return { kind: value.kind, id, package: packageValue, proof: actionProof(source.proof, `${field}.proof`) }
  }
  if (value.kind === 'approve_release') {
    const source = exact(value, field, ['kind', 'id', 'packageDigest', 'note', 'proof'])
    return { kind: 'approve_release', id: token(source.id, `${field}.id`), packageDigest: digest(source.packageDigest, `${field}.packageDigest`), note: text(source.note, `${field}.note`, 300), proof: actionProof(source.proof, `${field}.proof`) }
  }
  const source = exact(value, field, ['kind', 'id', 'packageDigest', 'approvalId', 'target', 'previousDeployment', 'proof'])
  return { kind: 'prepare_deploy_plan', id: token(source.id, `${field}.id`), packageDigest: digest(source.packageDigest, `${field}.packageDigest`), approvalId: token(source.approvalId, `${field}.approvalId`), target: deployTarget(source.target, `${field}.target`), previousDeployment: previousDeployment(source.previousDeployment, `${field}.previousDeployment`), proof: actionProof(source.proof, `${field}.proof`) }
}

function assertUpgrade(previous: WebsiteReleasePackage, upgraded: WebsiteReleasePackage) {
  if (previous.template.version !== 1 || upgraded.template.version !== 2) throw new Error('Website release template upgrade must be v1 to v2.')
  if (upgraded.previousPackageDigest !== previous.packageDigest) throw new Error('Website release template upgrade lost its previous package.')
  for (const field of ['source', 'brand', 'locales', 'media', 'roles'] as const) if (canonicalJson(upgraded[field]) !== canonicalJson(previous[field])) throw new Error(`Website release template upgrade changed approved ${field}.`)
}

function createDeployPlan(packageValue: WebsiteReleasePackage, approval: NonNullable<WebsiteReleaseProjection['approval']>, command: PrepareDeployPlanCommand): WebsiteDeployPlan {
  const previous = command.previousDeployment
  const rollback: WebsiteDeployPlan['rollback'] = previous
    ? { mode: 'promote_exact_previous_deployment', deploymentId: previous.deploymentId, packageDigest: previous.packageDigest, artifactDigest: previous.artifactDigest, status: 'not_executed', ownerApprovalRequired: true }
    : { mode: 'blocked_until_previous_deployment_bound', deploymentId: null, packageDigest: null, artifactDigest: null, status: 'not_executed', ownerApprovalRequired: true }
  const domainBlockers = command.target.domain
    ? ['domain_ownership_unverified', 'preview_acceptance_missing', 'dns_plan_unverified', 'owner_activation_approval_missing']
    : ['customer_domain_not_bound']
  return {
    contract: WEBSITE_DEPLOY_PLAN_CONTRACT,
    planId: command.id,
    status: 'not_executed',
    candidate: { packageDigest: packageValue.packageDigest, artifactDigest: packageValue.source.artifactDigest, approvalId: approval.id, approvedLocales: packageValue.locales.filter((row) => row.status === 'approved').map((row) => row.locale) },
    target: command.target,
    steps: [
      { sequence: 1, action: 'build_prebuilt_candidate', gate: 'local_release_contracts_pass', authority: 'release_manager_review' },
      { sequence: 2, action: 'create_protected_preview', gate: 'exact_project_and_credentials_bound', authority: 'owner_credentialed_action' },
      { sequence: 3, action: 'verify_exact_candidate', gate: 'health_logs_links_mobile_desktop_pass', authority: 'release_reviewer' },
      ...(command.target.domain ? [{ sequence: 4, action: 'verify_domain_ownership_and_dns_plan', gate: 'owner_domain_control_and_provider_records_verified', authority: 'release_reviewer' }] : []),
      { sequence: command.target.domain ? 5 : 4, action: 'promote_exact_candidate', gate: 'single_use_owner_approval', authority: 'owner_only' },
      ...(command.target.domain ? [{ sequence: 6, action: 'attach_verified_domain_and_check_https', gate: 'separate_domain_activation_approval', authority: 'owner_only' }] : []),
    ],
    rollback,
    domainActivation: {
      hostname: command.target.domain?.hostname ?? null,
      status: 'not_executed',
      blockers: domainBlockers,
      ownerApprovalRequired: true,
      providerWritesPerformed: false,
      dnsWritesPerformed: false,
    },
    proof: command.proof,
    ownerApprovalRequired: true,
  }
}

function replayCommands(commands: WebsiteReleaseCommandPayload[], scope: string): Omit<WebsiteReleaseProjection, 'contract' | 'scope' | 'revision' | 'headDigest'> {
  if (!commands.length) return { status: 'unprepared', package: null, approval: null, deployPlan: null, approvedLocales: [], draftLocales: [] }
  let packageValue: WebsiteReleasePackage | null = null; let approval: WebsiteReleaseProjection['approval'] = null; let deployPlan: WebsiteDeployPlan | null = null
  for (const [index, command] of commands.entries()) {
    const field = `commands[${index}].payload`
    if (index === 0 && command.kind !== 'prepare_package') throw new Error('The first Website release command must prepare a package.')
    if (command.kind === 'prepare_package') {
      if (packageValue || index !== 0) throw new Error(`${field} attempts to replace the initial package.`)
      if (command.package.previousPackageDigest !== null) throw new Error(`${field} cannot import forged migration lineage.`)
      if (command.package.source.scope !== scope) throw new Error(`${field} crosses the Website release workspace scope.`)
      if (command.proof.actor !== roleActor(command.package, 'release_manager')) throw new Error(`${field} actor is not the assigned release manager.`)
      packageValue = command.package; continue
    }
    if (!packageValue) throw new Error(`${field} has no prepared Website release package.`)
    if (command.kind === 'upgrade_template') {
      if (approval || deployPlan) throw new Error(`${field} follows release review or planning.`)
      assertUpgrade(packageValue, command.package)
      if (command.proof.actor !== roleActor(packageValue, 'release_manager')) throw new Error(`${field} actor is not the assigned release manager.`)
      packageValue = command.package; continue
    }
    if (command.kind === 'approve_release') {
      if (approval) throw new Error(`${field} attempts to approve the package twice.`)
      if (deployPlan || command.packageDigest !== packageValue.packageDigest) throw new Error(`${field} references a stale Website release package.`)
      if (command.proof.actor !== roleActor(packageValue, 'release_reviewer')) throw new Error(`${field} actor is not the assigned release reviewer.`)
      approval = { id: command.id, packageDigest: packageValue.packageDigest, reviewer: command.proof.actor, note: command.note, proof: command.proof }; continue
    }
    if (deployPlan) throw new Error(`${field} attempts to replace the immutable deploy plan.`)
    if (!approval || command.approvalId !== approval.id) throw new Error(`${field} requires the current release review.`)
    if (command.packageDigest !== packageValue.packageDigest) throw new Error(`${field} references a stale Website release package.`)
    if (command.proof.actor !== roleActor(packageValue, 'release_manager')) throw new Error(`${field} actor is not the assigned release manager.`)
    if (command.previousDeployment?.packageDigest === packageValue.packageDigest) throw new Error(`${field} rollback target cannot equal the candidate package.`)
    deployPlan = createDeployPlan(packageValue, approval, command)
  }
  if (!packageValue) throw new Error('Website release history lacks its package.')
  return { status: deployPlan ? 'plan_ready' : approval ? 'ready_for_plan' : 'needs_release_review', package: packageValue, approval, deployPlan, approvedLocales: packageValue.locales.filter((row) => row.status === 'approved').map((row) => row.locale), draftLocales: packageValue.locales.filter((row) => row.status === 'draft').map((row) => row.locale) }
}

export function createEmptyWebsiteReleaseState(scope: unknown): WebsiteReleaseState {
  return { schema: WEBSITE_RELEASE_STATE_SCHEMA, scope: token(scope, 'scope'), revision: 0, headDigest: EMPTY_WEBSITE_RELEASE_DIGEST, commands: [] }
}

export function validateWebsiteReleaseState(value: unknown): WebsiteReleaseState {
  const source = exact(value, 'Website release state', ['schema', 'scope', 'revision', 'headDigest', 'commands'])
  if (source.schema !== WEBSITE_RELEASE_STATE_SCHEMA) throw new Error('Website release state.schema is unsupported.')
  const scope = token(source.scope, 'Website release state.scope'); const revision = integer(source.revision, 'Website release state.revision'); const headDigest = digest(source.headDigest, 'Website release state.headDigest')
  const rawCommands = array(source.commands, 'Website release state.commands', 0, 100)
  if (revision !== rawCommands.length) throw new Error('Website release state.revision must equal its command count.')
  const commands: WebsiteReleaseCommand[] = []; const commandIds: string[] = []; const actionIds: string[] = []; let priorDigest = EMPTY_WEBSITE_RELEASE_DIGEST; let priorMicros: bigint | null = null
  rawCommands.forEach((candidate, index) => {
    const field = `Website release state.commands[${index}]`; const envelope = exact(candidate, field, ['sequence', 'previousDigest', 'payload', 'digest']); const sequence = integer(envelope.sequence, `${field}.sequence`, 1)
    if (sequence !== index + 1) throw new Error(`${field}.sequence is not contiguous.`)
    const previousDigest = digest(envelope.previousDigest, `${field}.previousDigest`); if (previousDigest !== priorDigest) throw new Error(`${field}.previousDigest breaks the command chain.`)
    const payload = commandPayload(envelope.payload, `${field}.payload`); const payloadMicros = timestampMicros(payload.proof.capturedAt, `${field}.payload.proof.capturedAt`).micros
    if (priorMicros !== null && payloadMicros < priorMicros) throw new Error(`${field}.payload.proof.capturedAt moves backwards.`)
    const body = { sequence, previousDigest, payload }; const commandDigest = digest(envelope.digest, `${field}.digest`)
    if (commandDigest !== websiteReleaseEvidenceDigest(body)) throw new Error(`${field}.digest does not match its command evidence.`)
    commands.push({ ...body, digest: commandDigest }); commandIds.push(payload.id); actionIds.push(payload.proof.actionId); priorDigest = commandDigest; priorMicros = payloadMicros
  })
  unique(commandIds, 'Website release command IDs'); unique(actionIds, 'Website release action IDs')
  if (headDigest !== (commands.length ? priorDigest : EMPTY_WEBSITE_RELEASE_DIGEST)) throw new Error('Website release state.headDigest does not match its command chain.')
  replayCommands(commands.map((command) => command.payload), scope)
  return canonicalCopy({ schema: WEBSITE_RELEASE_STATE_SCHEMA, scope, revision, headDigest, commands })
}

export function projectWebsiteRelease(state: unknown): WebsiteReleaseProjection {
  const validated = validateWebsiteReleaseState(state); const projection = replayCommands(validated.commands.map((command) => command.payload), validated.scope)
  return canonicalCopy({ contract: WEBSITE_RELEASE_PROJECTION_CONTRACT, scope: validated.scope, revision: validated.revision, headDigest: validated.headDigest, ...projection })
}

function appendCommand(state: unknown, payload: unknown, expectedHeadDigest: unknown) {
  const current = validateWebsiteReleaseState(state); const checkedPayload = commandPayload(payload, 'command payload')
  for (const command of current.commands) {
    if (command.payload.id !== checkedPayload.id) continue
    if (canonicalJson(command.payload) !== canonicalJson(checkedPayload)) throw new Error('The Website release command ID was reused with different evidence.')
    return { state: current, replayed: true }
  }
  if (digest(expectedHeadDigest, 'expectedHeadDigest') !== current.headDigest) throw new Error('The Website release snapshot changed before this command was applied.')
  const sequence = current.revision + 1; const body = { sequence, previousDigest: current.headDigest, payload: checkedPayload }; const envelope = { ...body, digest: websiteReleaseEvidenceDigest(body) }
  const candidate = { schema: WEBSITE_RELEASE_STATE_SCHEMA, scope: current.scope, revision: sequence, headDigest: envelope.digest, commands: [...current.commands, envelope] }
  return { state: validateWebsiteReleaseState(candidate), replayed: false }
}

export function prepareWebsiteReleasePackage(state: unknown, packageValue: unknown, proof: unknown, expectedHeadDigest: unknown) {
  const reviewed = validatePackage(packageValue)
  return appendCommand(state, { kind: 'prepare_package', id: reviewed.packageId, package: reviewed, proof: actionProof(proof, 'proof') }, expectedHeadDigest)
}

export function applyWebsiteTemplateUpgrade(state: unknown, packageValue: unknown, proof: unknown, expectedHeadDigest: unknown) {
  const upgraded = validatePackage(packageValue)
  if (!upgraded.migration) throw new Error('Website template upgrade requires migration evidence.')
  return appendCommand(state, { kind: 'upgrade_template', id: upgraded.migration.migrationId, package: upgraded, proof: actionProof(proof, 'proof') }, expectedHeadDigest)
}

export function approveWebsiteReleasePackage(state: unknown, input: { approvalId: unknown; packageDigest: unknown; note: unknown; proof: unknown; expectedHeadDigest: unknown }) {
  return appendCommand(state, { kind: 'approve_release', id: input.approvalId, packageDigest: input.packageDigest, note: input.note, proof: actionProof(input.proof, 'proof') }, input.expectedHeadDigest)
}

export function prepareWebsiteDeployPlan(state: unknown, input: { planId: unknown; packageDigest: unknown; approvalId: unknown; target: unknown; previousDeployment: unknown; proof: unknown; expectedHeadDigest: unknown }) {
  return appendCommand(state, { kind: 'prepare_deploy_plan', id: input.planId, packageDigest: input.packageDigest, approvalId: input.approvalId, target: input.target, previousDeployment: input.previousDeployment, proof: actionProof(input.proof, 'proof') }, input.expectedHeadDigest)
}

export function websiteReleaseStorageKey(scope: string) {
  return `${WEBSITE_RELEASE_STORAGE_PREFIX}${encodeURIComponent(token(scope, 'scope'))}`
}

export function loadWebsiteReleaseWorkspace(storage: StorageLike, scope: string) {
  const key = websiteReleaseStorageKey(scope); const retained = storage.getItem(key)
  if (retained === null) return { state: createEmptyWebsiteReleaseState(scope), source: 'empty' as const, error: '' }
  try {
    const state = validateWebsiteReleaseState(JSON.parse(retained))
    if (state.scope !== token(scope, 'scope')) throw new Error('Website release workspace scope does not match storage.')
    return { state, source: 'current' as const, error: '' }
  } catch (error) {
    return { state: createEmptyWebsiteReleaseState(scope), source: 'recovery' as const, error: error instanceof Error ? error.message : 'Website release package could not be recovered.' }
  }
}

export async function mutateWebsiteReleaseWorkspace(
  scope: string,
  transition: (state: WebsiteReleaseState) => { state: WebsiteReleaseState; replayed: boolean },
  storage: StorageLike,
  locks: LockLike | null | undefined,
) {
  if (!locks?.request) return { ok: false as const, error: 'Website release preparation requires an exclusive browser lock.' }
  try {
    return await locks.request(websiteReleaseStorageKey(scope), { mode: 'exclusive' }, () => {
      const key = websiteReleaseStorageKey(scope); const previousRaw = storage.getItem(key); const snapshot = loadWebsiteReleaseWorkspace(storage, scope)
      if (snapshot.source === 'recovery') throw new Error(`Website release recovery required: ${snapshot.error}`)
      const result = transition(snapshot.state); const checked = validateWebsiteReleaseState(result.state)
      try {
        storage.setItem(key, canonicalJson(checked)); const retained = loadWebsiteReleaseWorkspace(storage, scope)
        if (retained.source !== 'current' || retained.state.headDigest !== checked.headDigest) throw new Error('Website release write verification failed.')
        return { ok: true as const, state: retained.state, replayed: result.replayed }
      } catch (error) {
        try { if (previousRaw === null) storage.removeItem(key); else storage.setItem(key, previousRaw) } catch { /* Report failure and never claim commit. */ }
        throw error
      }
    })
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : 'Website release transition failed.' }
  }
}
