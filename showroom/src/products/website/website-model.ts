import type { WebsiteReleaseState } from './website-release-foundation'
import { restoreWebsiteLeadLedger, type WebsiteLeadLedger } from './website-leads.ts'

export const WEBSITE_SCHEMA = 'supermega.website.workspace.v2'
export const WEBSITE_STORAGE_KEY = 'supermega.website.workspace.v2'
export const LEGACY_WEBSITE_STORAGE_KEY = 'supermega.website.workspace.v1'
export const WEBSITE_RECOVERY_INDEX_KEY = 'supermega.website.workspace.recovery.v1.index'
export const WEBSITE_EDIT_SESSION_KEY = 'supermega.website.edit-session.v1'
export const MAX_WEBSITE_PAGES = 4
export const MAX_WEBSITE_SECTIONS = 4

const WEBSITE_MUTATION_LOCK = 'supermega.website.workspace.mutation.v2'
const WEBSITE_RECOVERY_SCHEMA = 'supermega.website.workspace.recovery.v1'
const WEBSITE_EDIT_SESSION_SCHEMA = 'supermega.website.edit-session.v1'
const WEBSITE_RECOVERY_KEY_PREFIX = `${WEBSITE_RECOVERY_SCHEMA}.`
const INITIAL_CREATED_AT = '2026-07-23T00:00:00.000Z'
const fingerprintPattern = /^web-[a-f0-9]{8}$/
const WEBSITE_RELEASE_STATE_SCHEMA = 'supermega.website.release_foundation.v1'
const MAX_WEBSITE_RELEASE_RECORDS = 50

export const previewDevices = [
  { id: 'desktop', label: 'Desktop', width: '100%' },
  { id: 'tablet', label: 'Tablet', width: '768px' },
  { id: 'mobile', label: 'Mobile', width: '390px' },
] as const

export const evidenceRequirements = [
  {
    id: 'content',
    label: 'Content owner review',
    detail: 'Names the accountable reviewer and the reviewed copy reference.',
  },
  {
    id: 'responsive',
    label: 'Responsive preview review',
    detail: 'Records desktop, tablet, and mobile inspection evidence.',
  },
  {
    id: 'links',
    label: 'Destination review',
    detail: 'Records the source used to verify navigation and CTA destinations.',
  },
] as const

export type PreviewDevice = (typeof previewDevices)[number]['id']
export type EvidenceKind = (typeof evidenceRequirements)[number]['id']
export type WorkspaceView = 'content' | 'navigation' | 'publish'
export type PageStage = 'draft' | 'ready'

export type PageSection = {
  id: string
  eyebrow: string
  title: string
  body: string
}

export type WebsitePage = {
  id: string
  internalName: string
  slug: string
  stage: PageStage
  navigation: {
    label: string
    visible: boolean
  }
  hero: {
    eyebrow: string
    headline: string
    summary: string
    ctaLabel: string
    ctaHref: string
  }
  sections: PageSection[]
  seo: {
    title: string
    description: string
  }
  updatedAt: string
}

export type WebsiteSourceRef = {
  contentRevision: number
  digest: string
}

export type WebsiteArtifactPage = {
  id: string
  slug: string
  navigation: WebsitePage['navigation']
  hero: WebsitePage['hero']
  sections: PageSection[]
  seo: WebsitePage['seo']
}

export type WebsiteArtifact = {
  schema: 'supermega.website.artifact.v1'
  siteName: string
  fingerprint: string
  contentDigest: string
  source: WebsiteSourceRef
  pages: WebsiteArtifactPage[]
}

export type PublishEvidence = {
  id: string
  kind: EvidenceKind
  finding: string
  reference: string
  verifiedBy: string
  verifiedAt: string
  fingerprint: string
  source: WebsiteSourceRef
  migratedFromV1: boolean
}

export type PublishApproval = {
  id: string
  reviewer: string
  note: string
  approvedAt: string
  fingerprint: string
  evidenceIds: string[]
  source: WebsiteSourceRef
  migratedFromV1: boolean
}

export type LocalPublishRecord = {
  id: string
  recordedAt: string
  recordedBy: string
  fingerprint: string
  readyPageIds: string[]
  approvalId: string | null
  evidenceIds: string[]
  source: WebsiteSourceRef
  migratedFromV1: boolean
  artifact: WebsiteArtifact | null
}

export type WebsiteWorkflowEvent = {
  id: string
  createdAt: string
  actorKind: 'human'
  actor: string
  action: 'publish_evidence_recorded' | 'website_revision_approved' | 'local_snapshot_recorded'
  subjectId: string
  reason: string
  evidenceReference: string
  source: WebsiteSourceRef
}

export type WebsiteOpeningPlan = {
  contract: 'supermega.website.opening-plan.v1'
  packageDigest: string
  workflowTemplateId: 'business-presence' | 'lead-generation' | 'catalog-showcase'
  confirmedAt: string
  pageIds: string[]
}

export type WebsiteWorkspace = {
  schema: typeof WEBSITE_SCHEMA
  version: 2
  revision: number
  contentRevision: number
  siteName: string
  pages: WebsitePage[]
  selectedPageId: string
  evidence: PublishEvidence[]
  approvals: PublishApproval[]
  localPublishes: LocalPublishRecord[]
  events: WebsiteWorkflowEvent[]
  openingPlan?: WebsiteOpeningPlan
  releaseRecords?: WebsiteReleaseState[]
  leadLedger?: WebsiteLeadLedger
}

export type WebsiteEditSession = {
  schema: typeof WEBSITE_EDIT_SESSION_SCHEMA
  baseRevision: number
  baseContentRevision: number
  baseFingerprint: string
  workspace: WebsiteWorkspace
}

export type WebsiteEditSessionUpdateResult =
  | { ok: true; changed: boolean; session: WebsiteEditSession }
  | { ok: false; error: string }

export type ReadinessCheck = {
  id: string
  label: string
  detail: string
  passed: boolean
}

type LegacyPublishEvidence = Omit<PublishEvidence, 'source' | 'migratedFromV1'>
type LegacyPublishApproval = Omit<PublishApproval, 'evidenceIds' | 'source' | 'migratedFromV1'>
type LegacyLocalPublishRecord = Omit<LocalPublishRecord, 'approvalId' | 'evidenceIds' | 'source' | 'migratedFromV1' | 'artifact'>

type LegacyWebsiteWorkspace = {
  version: 1
  siteName: string
  pages: WebsitePage[]
  selectedPageId: string
  evidence: LegacyPublishEvidence[]
  approval: LegacyPublishApproval | null
  localPublishes: LegacyLocalPublishRecord[]
}

export type WebsiteStorage = Pick<Storage, 'getItem' | 'setItem'>
export type WebsiteRepairStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export type WebsiteLockManager = {
  request<T>(
    name: string,
    options: { mode: 'exclusive' },
    callback: () => Promise<T> | T,
  ): Promise<T>
}

export type WebsiteWorkspaceUpdate = (workspace: WebsiteWorkspace) => WebsiteWorkspace

export type WebsiteMutationResult =
  | { ok: true; changed: boolean; workspace: WebsiteWorkspace }
  | { ok: false; error: string }

export type WebsiteLoadResult =
  | { ok: true; source: 'v2' | 'v1' | 'seed'; workspace: WebsiteWorkspace }
  | { ok: false; error: string }

export type WebsiteInvalidLocalCandidate = Readonly<{
  source: 'v2' | 'v1'
  sourceKey: typeof WEBSITE_STORAGE_KEY | typeof LEGACY_WEBSITE_STORAGE_KEY
  expectedRaw: string
  observedAt: string
}>

export type WebsiteRepairFailureCode =
  | 'not_invalid'
  | 'stale_candidate'
  | 'storage_unavailable'
  | 'lock_unavailable'
  | 'archive_write_failed'
  | 'archive_confirmation_failed'
  | 'archive_index_failed'
  | 'replacement_write_failed'
  | 'replacement_confirmation_failed'

export type WebsiteLocalRepairResult =
  | {
      ok: true
      workspace: WebsiteWorkspace
      archiveKey: string
      archivedAt: string
      legacyCleanup: 'not-needed' | 'removed' | 'retained'
    }
  | {
      ok: false
      code: WebsiteRepairFailureCode
      error: string
      archiveKey?: string
      archiveConfirmed: boolean
      replacementConfirmed: boolean
    }

export type WebsiteRecoveryArchiveSummary = Readonly<{
  archiveKey: string
  archivedAt: string
  sourceKey: typeof WEBSITE_STORAGE_KEY | typeof LEGACY_WEBSITE_STORAGE_KEY
}>

export type WebsiteRecoveryDeleteResult =
  | { ok: true; archives: WebsiteRecoveryArchiveSummary[] }
  | { ok: false; error: string }

function now() {
  return new Date().toISOString()
}

export function createId(prefix: string) {
  const randomId = typeof globalThis.crypto?.randomUUID === 'function'
    ? globalThis.crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10)
  return prefix + '-' + randomId
}

export function createInitialWorkspace(): WebsiteWorkspace {
  return {
    schema: WEBSITE_SCHEMA,
    version: 2,
    revision: 0,
    contentRevision: 0,
    siteName: 'Mingalar Fresh Mart',
    selectedPageId: 'page-home',
    evidence: [],
    approvals: [],
    localPublishes: [],
    events: [],
    pages: [
      {
        id: 'page-home',
        internalName: 'Home',
        slug: '/',
        stage: 'ready',
        navigation: { label: 'Home', visible: true },
        hero: {
          eyebrow: 'Groceries in Yangon',
          headline: 'Fresh everyday groceries without the extra trip.',
          summary: 'Shop pantry staples, drinks, household refills, and ready-made family packs for pickup or local delivery.',
          ctaLabel: 'Browse the catalog',
          ctaHref: '/catalog',
        },
        sections: [
          {
            id: 'section-home-control',
            eyebrow: 'Clear ordering',
            title: 'See the product, price, and fulfilment choice.',
            body: 'Choose a practical pack, then confirm quantity, pickup or delivery, and timing before the order is accepted.',
          },
          {
            id: 'section-home-local',
            eyebrow: 'Local service',
            title: 'A simple order from request to handoff.',
            body: 'The store checks current stock and delivery details before confirming what is available.',
          },
        ],
        seo: {
          title: 'Mingalar Fresh Mart | Groceries in Yangon',
          description: 'Everyday groceries, pantry packs, pickup, and local delivery in Yangon.',
        },
        updatedAt: INITIAL_CREATED_AT,
      },
      {
        id: 'page-products',
        internalName: 'Catalog',
        slug: '/catalog',
        stage: 'ready',
        navigation: { label: 'Catalog', visible: true },
        hero: {
          eyebrow: 'Everyday essentials',
          headline: 'Stock the week in one simple order.',
          summary: 'Start with daily essentials, cold drinks, household refills, and personal care packs. Current availability is confirmed before purchase.',
          ctaLabel: 'Ask about availability',
          ctaHref: '/contact',
        },
        sections: [
          {
            id: 'section-products-workspaces',
            eyebrow: 'Popular choices',
            title: 'Practical packs for home and office.',
            body: 'Choose the products and quantities you need. The store reviews stock, fulfilment, and final total before confirmation.',
          },
        ],
        seo: {
          title: 'Catalog | Mingalar Fresh Mart',
          description: 'Browse practical grocery and household packs for pickup or local delivery in Yangon.',
        },
        updatedAt: INITIAL_CREATED_AT,
      },
      {
        id: 'page-contact',
        internalName: 'Contact',
        slug: '/contact',
        stage: 'ready',
        navigation: { label: 'Contact', visible: true },
        hero: {
          eyebrow: 'Order help',
          headline: 'Tell us what you need today.',
          summary: 'Share the item, quantity, township, and preferred pickup or delivery time. We will review availability before confirming.',
          ctaLabel: 'Browse products',
          ctaHref: '/catalog',
        },
        sections: [
          {
            id: 'section-contact-scope',
            eyebrow: 'What to include',
            title: 'One message is enough to start.',
            body: 'Include product names, quantities, location, and timing so the store can answer with a clear next step.',
          },
        ],
        seo: {
          title: 'Contact | Mingalar Fresh Mart',
          description: 'Ask Mingalar Fresh Mart about current stock, pickup, or local delivery in Yangon.',
        },
        updatedAt: INITIAL_CREATED_AT,
      },
    ],
  }
}

export type WebsitePageImportDraft = {
  slug: string
  title: string
  headline: string
  body: string
  contactUrl: string
}

export type WebsitePageDraftsImportResult = {
  workspace: WebsiteWorkspace
  created: number
  alreadyPresent: number
  replayed: boolean
}

export type WebsitePageDraftsActivationResult =
  | { ok: true; import: WebsitePageDraftsImportResult }
  | { ok: false; error: string }

function canonicalImportText(value: unknown, maximum: number, allowBlank = false): value is string {
  return typeof value === 'string'
    && value.length <= maximum
    && value === value.trim()
    && value === value.normalize('NFC')
    && Array.from(value).every((character) => {
      const codePoint = character.codePointAt(0) ?? 0
      return codePoint > 31 && codePoint !== 127
    })
    && (allowBlank || value.length > 0)
}

function websiteImportPage(input: WebsitePageImportDraft, sourceId: string, index: number, capturedAt: string): WebsitePage {
  const sequence = index + 1
  const pageId = `page-client-${sourceId}-${sequence}`
  return {
    id: pageId,
    internalName: input.title,
    slug: input.slug === 'home' ? '/' : `/${input.slug}`,
    stage: 'draft',
    navigation: { label: input.title, visible: false },
    hero: {
      eyebrow: '',
      headline: input.headline,
      summary: '',
      ctaLabel: input.contactUrl ? 'Contact' : '',
      ctaHref: input.contactUrl,
    },
    sections: [{
      id: `section-client-${sourceId}-${sequence}`,
      eyebrow: '',
      title: input.title,
      body: input.body,
    }],
    seo: { title: input.title, description: '' },
    updatedAt: capturedAt,
  }
}

function websiteImportContent(workspace: WebsiteWorkspace) {
  return {
    siteName: workspace.siteName,
    selectedPageId: workspace.selectedPageId,
    pages: workspace.pages.map((page) => Object.fromEntries(Object.entries(page).filter(([key]) => key !== 'updatedAt'))),
  }
}

export function importWebsitePageDrafts(current: WebsiteWorkspace, input: {
  siteName: string
  pages: WebsitePageImportDraft[]
  sourceDigest: string
  capturedAt: string
}): WebsitePageDraftsImportResult | null {
  if (!isWebsiteWorkspace(current)
    || !canonicalImportText(input?.siteName, 60)
    || !Array.isArray(input?.pages)
    || input.pages.length < 1
    || input.pages.length > MAX_WEBSITE_PAGES
    || typeof input.sourceDigest !== 'string'
    || !/^sha256:[0-9a-f]{64}$/.test(input.sourceDigest)
    || !isIsoTimestamp(input.capturedAt)) return null
  const validPages = input.pages.every((page) => canonicalImportText(page?.slug, 80)
    && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(page.slug)
    && canonicalImportText(page.title, 40)
    && canonicalImportText(page.headline, 140)
    && canonicalImportText(page.body, 360)
    && canonicalImportText(page.contactUrl, 160, true)
    && (!page.contactUrl || isValidDestination(page.contactUrl)))
  if (!validPages || new Set(input.pages.map((page) => page.slug)).size !== input.pages.length) return null
  const sourceId = input.sourceDigest.slice(7, 19)
  const pages = input.pages.map((page, index) => websiteImportPage(page, sourceId, index, input.capturedAt))
  const imported: WebsiteWorkspace = {
    ...current,
    siteName: input.siteName,
    pages,
    selectedPageId: pages[0].id,
  }
  if (serialize(websiteImportContent(current)) === serialize(websiteImportContent(imported))) {
    return { workspace: current, created: 0, alreadyPresent: pages.length, replayed: true }
  }
  if (serialize(current) !== serialize(createInitialWorkspace()) || !isWebsiteWorkspace(imported)) return null
  return { workspace: imported, created: pages.length, alreadyPresent: 0, replayed: false }
}

export async function activateLocalWebsitePageDrafts(input: {
  siteName: string
  pages: WebsitePageImportDraft[]
  sourceDigest: string
  capturedAt: string
}, storage: WebsiteStorage | undefined = globalThis.localStorage, locks: WebsiteLockManager | undefined = globalThis.navigator?.locks as WebsiteLockManager | undefined): Promise<WebsitePageDraftsActivationResult> {
  if (!storage) return { ok: false, error: 'Browser storage is unavailable.' }
  const loaded = loadWebsiteWorkspace(storage)
  if (!loaded.ok) return loaded
  let imported: WebsitePageDraftsImportResult | null = null
  const mutation = await mutateWebsiteWorkspace((current) => {
    imported = importWebsitePageDrafts(current, input)
    if (!imported) throw new Error('The Website sample already contains edited work. Reset it before initializing another client draft.')
    return imported.workspace
  }, loaded.workspace.revision, loaded.workspace.contentRevision, storage, locks)
  if (!mutation.ok) return mutation
  if (!imported) return { ok: false, error: 'The Website import could not be confirmed.' }
  return { ok: true, import: imported }
}

export function createBlankPage(sequence: number): WebsitePage {
  return {
    id: createId('page'),
    internalName: 'Untitled page',
    slug: '/untitled-' + sequence,
    stage: 'draft',
    navigation: { label: 'Untitled', visible: false },
    hero: { eyebrow: '', headline: '', summary: '', ctaLabel: '', ctaHref: '' },
    sections: [],
    seo: { title: '', description: '' },
    updatedAt: now(),
  }
}

export function duplicatePage(page: WebsitePage, sequence: number): WebsitePage {
  return {
    ...page,
    id: createId('page'),
    internalName: page.internalName + ' copy',
    slug: '/copy-' + sequence,
    stage: 'draft',
    navigation: { ...page.navigation, label: page.navigation.label + ' copy', visible: false },
    sections: page.sections.map((section) => ({ ...section, id: createId('section') })),
    updatedAt: now(),
  }
}

export function createBlankSection(): PageSection {
  return { id: createId('section'), eyebrow: '', title: '', body: '' }
}

export function pageIssues(page: WebsitePage) {
  const issues: string[] = []
  const hasCtaLabel = Boolean(page.hero.ctaLabel.trim())
  const hasCtaHref = Boolean(page.hero.ctaHref.trim())

  if (!page.internalName.trim()) issues.push('Add an internal page name.')
  if (!isValidSlug(page.slug)) issues.push('Use a path such as /about or /.')
  if (!page.hero.headline.trim()) issues.push('Add a hero headline.')
  if (!page.hero.summary.trim()) issues.push('Add a hero summary.')
  if (hasCtaLabel !== hasCtaHref) issues.push('Complete both CTA fields or leave both empty.')
  if (hasCtaHref && !isValidDestination(page.hero.ctaHref)) issues.push('Use a local path, anchor, or https URL for the CTA.')
  if (!page.sections.length) issues.push('Add at least one content section.')
  if (page.sections.some((section) => !section.title.trim() || !section.body.trim())) issues.push('Complete every section title and body.')
  if (!page.seo.title.trim()) issues.push('Add an SEO title.')
  if (!page.seo.description.trim()) issues.push('Add an SEO description.')
  return issues
}

export function workspaceFingerprint(workspace: WebsiteWorkspace) {
  const publishableState = {
    siteName: workspace.siteName.trim(),
    pages: workspace.pages.map((page) => ({
      id: page.id,
      internalName: page.internalName,
      slug: page.slug,
      stage: page.stage,
      navigation: page.navigation,
      hero: page.hero,
      sections: page.sections,
      seo: page.seo,
    })),
  }
  return 'web-' + canonicalDigest(publishableState)
}

export function createWebsiteEditSession(workspace: WebsiteWorkspace): WebsiteEditSession {
  return {
    schema: WEBSITE_EDIT_SESSION_SCHEMA,
    baseRevision: workspace.revision,
    baseContentRevision: workspace.contentRevision,
    baseFingerprint: workspaceFingerprint(workspace),
    workspace,
  }
}

export function updateWebsiteEditSession(
  session: WebsiteEditSession,
  update: WebsiteWorkspaceUpdate,
): WebsiteEditSessionUpdateResult {
  try {
    const candidate = update(session.workspace)
    if (!isWebsiteWorkspace(candidate)) {
      return { ok: false, error: 'Website edit produced an invalid draft.' }
    }
    if (candidate.revision !== session.baseRevision || candidate.contentRevision !== session.baseContentRevision) {
      return { ok: false, error: 'Website drafts cannot change saved revision metadata.' }
    }
    if (!sameReleaseHistory(candidate, session.workspace)) {
      return { ok: false, error: 'Evidence, approval, and snapshot actions cannot be staged as draft edits.' }
    }
    if (serialize(candidate) === serialize(session.workspace)) {
      return { ok: true, changed: false, session }
    }
    return { ok: true, changed: true, session: { ...session, workspace: candidate } }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Website draft edit failed.' }
  }
}

export function websiteEditSessionMatches(
  session: WebsiteEditSession,
  workspace: WebsiteWorkspace,
) {
  return session.baseRevision === workspace.revision
    && session.baseContentRevision === workspace.contentRevision
    && session.baseFingerprint === workspaceFingerprint(workspace)
}

export function commitWebsiteEditSession(
  current: WebsiteWorkspace,
  session: WebsiteEditSession,
): WebsiteWorkspace {
  if (!websiteEditSessionMatches(session, current)) {
    throw new Error('Website changed after this edit session started. The saved website was preserved; discard this preview and review the newer version.')
  }
  if (!sameReleaseHistory(session.workspace, current)) {
    throw new Error('Website edit-session history no longer matches the saved website.')
  }
  return {
    ...session.workspace,
    revision: current.revision,
    contentRevision: current.contentRevision,
    evidence: current.evidence,
    approvals: current.approvals,
    localPublishes: current.localPublishes,
    events: current.events,
  }
}

export function restoreWebsiteEditSession(value: unknown): WebsiteEditSession | null {
  try {
    const candidate = typeof value === 'string' ? JSON.parse(value) as unknown : value
    if (!isRecord(candidate)
      || !hasExactKeys(candidate, ['schema', 'baseRevision', 'baseContentRevision', 'baseFingerprint', 'workspace'])
      || candidate.schema !== WEBSITE_EDIT_SESSION_SCHEMA
      || !isNonNegativeInteger(candidate.baseRevision)
      || !isNonNegativeInteger(candidate.baseContentRevision)
      || candidate.baseContentRevision > candidate.baseRevision
      || typeof candidate.baseFingerprint !== 'string'
      || !fingerprintPattern.test(candidate.baseFingerprint)) return null
    const workspace = restoreWorkspace(candidate.workspace)
    if (!workspace
      || workspace.revision !== candidate.baseRevision
      || workspace.contentRevision !== candidate.baseContentRevision) return null
    return {
      schema: WEBSITE_EDIT_SESSION_SCHEMA,
      baseRevision: candidate.baseRevision,
      baseContentRevision: candidate.baseContentRevision,
      baseFingerprint: candidate.baseFingerprint,
      workspace,
    }
  } catch {
    return null
  }
}

function canonicalDigest(value: unknown) {
  const source = canonicalJson(value)
  let hash = 2166136261
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalValue(value))
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue)
  if (typeof value !== 'object' || value === null) return value
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      .map(([key, nested]) => [key, canonicalValue(nested)]),
  )
}

export function websiteSource(workspace: WebsiteWorkspace): WebsiteSourceRef {
  return { contentRevision: workspace.contentRevision, digest: workspaceFingerprint(workspace) }
}

export function createWebsiteArtifact(workspace: WebsiteWorkspace): WebsiteArtifact {
  const source = websiteSource(workspace)
  const content: Omit<WebsiteArtifact, 'contentDigest'> = {
    schema: 'supermega.website.artifact.v1',
    siteName: workspace.siteName,
    fingerprint: source.digest,
    source,
    pages: workspace.pages
      .filter((page) => page.stage === 'ready')
      .map((page) => ({
        id: page.id,
        slug: normalizeSlug(page.slug),
        navigation: { ...page.navigation },
        hero: { ...page.hero },
        sections: page.sections.map((section) => ({ ...section })),
        seo: { ...page.seo },
      })),
  }
  const artifact: WebsiteArtifact = {
    ...content,
    contentDigest: 'site-' + canonicalDigest(content),
  }
  if (!isWebsiteArtifact(artifact)) throw new Error('Approved Website content could not be retained safely.')
  return artifact
}

function sameSource(left: WebsiteSourceRef, right: WebsiteSourceRef) {
  return left.contentRevision === right.contentRevision && left.digest === right.digest
}

export function getCurrentEvidence(workspace: WebsiteWorkspace) {
  const source = websiteSource(workspace)
  return evidenceRequirements
    .map((requirement) => workspace.evidence.find((entry) => entry.kind === requirement.id && sameSource(entry.source, source)))
    .filter((entry): entry is PublishEvidence => Boolean(entry))
}

export function readinessChecks(workspace: WebsiteWorkspace, fingerprint = workspaceFingerprint(workspace)): ReadinessCheck[] {
  const readyPages = workspace.pages.filter((page) => page.stage === 'ready')
  const normalizedSlugs = readyPages.map((page) => normalizeSlug(page.slug))
  const uniqueSlugs = new Set(normalizedSlugs)
  const readyPaths = new Set(normalizedSlugs)
  const readyAnchors = new Set(normalizedSlugs.map(pageAnchorForSlug))
  const visibleNavigation = workspace.pages.filter((page) => page.navigation.visible)
  const completePages = readyPages.filter((page) => pageIssues(page).length === 0)
  const destinationsAreSafe = readyPages.every((page) => {
    const destination = page.hero.ctaHref.trim()
    return !destination
      || (destination.startsWith('#') && readyAnchors.has(destination.slice(1)))
      || isSafeHttpsDestination(destination)
      || (destination.startsWith('/') && readyPaths.has(normalizeSlug(destination)))
  })
  const currentSource = websiteSource(workspace)
  const currentEvidenceKinds = new Set(
    workspace.evidence
      .filter((entry) => entry.fingerprint === fingerprint && sameSource(entry.source, currentSource) && isPublishEvidence(entry))
      .map((entry) => entry.kind),
  )

  return [
    {
      id: 'site-identity',
      label: 'Site identity is present',
      detail: workspace.siteName.trim() ? workspace.siteName.trim() : 'Add a site name in Navigation.',
      passed: Boolean(workspace.siteName.trim()),
    },
    {
      id: 'ready-pages',
      label: 'Ready pages are complete',
      detail: readyPages.length
        ? String(completePages.length) + ' of ' + String(readyPages.length) + ' ready pages have complete content and metadata.'
        : 'Mark at least one complete page ready.',
      passed: readyPages.length > 0 && completePages.length === readyPages.length,
    },
    {
      id: 'home-path',
      label: 'A ready home page owns /',
      detail: 'Exactly one ready page must use the root path.',
      passed: readyPages.filter((page) => normalizeSlug(page.slug) === '/').length === 1,
    },
    {
      id: 'unique-paths',
      label: 'Ready page paths are unique',
      detail: String(uniqueSlugs.size) + ' unique paths across ' + String(readyPages.length) + ' ready pages.',
      passed: uniqueSlugs.size === readyPages.length,
    },
    {
      id: 'navigation',
      label: 'Navigation points to ready pages',
      detail: visibleNavigation.length
        ? String(visibleNavigation.length) + ' visible navigation items have labels and ready destinations.'
        : 'Show at least one page in navigation.',
      passed: visibleNavigation.length > 0
        && visibleNavigation.every((page) => page.stage === 'ready' && Boolean(page.navigation.label.trim())),
    },
    {
      id: 'destinations',
      label: 'Buttons use safe destinations',
      detail: destinationsAreSafe
        ? 'Every ready-page button uses a ready page, on-page anchor, or HTTPS destination.'
        : 'Point each ready-page button to another ready page, an on-page anchor, or an HTTPS destination.',
      passed: destinationsAreSafe,
    },
    ...evidenceRequirements.map((requirement) => ({
      id: 'evidence-' + requirement.id,
      label: requirement.label,
      detail: currentEvidenceKinds.has(requirement.id)
        ? 'Verified evidence is attached to content revision ' + String(workspace.contentRevision) + '.'
        : requirement.detail,
      passed: currentEvidenceKinds.has(requirement.id),
    })),
  ]
}

export function isCurrentApproval(approval: PublishApproval | undefined, workspace: WebsiteWorkspace) {
  if (!approval || approval.migratedFromV1 || !sameSource(approval.source, websiteSource(workspace))) return false
  const evidenceIds = getCurrentEvidence(workspace).map((entry) => entry.id)
  return evidenceIds.length === evidenceRequirements.length && sameStringSet(approval.evidenceIds, evidenceIds)
}

export function getCurrentApproval(workspace: WebsiteWorkspace) {
  return workspace.approvals.find((approval) => isCurrentApproval(approval, workspace)) ?? null
}

export function isCurrentPublish(record: LocalPublishRecord | undefined, workspace: WebsiteWorkspace) {
  if (!record || record.migratedFromV1 || !record.artifact || !sameSource(record.source, websiteSource(workspace))) return false
  const approval = getCurrentApproval(workspace)
  const readyPageIds = workspace.pages.filter((page) => page.stage === 'ready').map((page) => page.id)
  return Boolean(approval
    && record.approvalId === approval.id
    && record.recordedBy === approval.reviewer
    && sameStringSet(record.evidenceIds, approval.evidenceIds)
    && sameStringSet(record.readyPageIds, readyPageIds)
    && serialize(record.artifact) === serialize(createWebsiteArtifact(workspace)))
}

export function getCurrentPublish(workspace: WebsiteWorkspace) {
  return workspace.localPublishes.find((record) => isCurrentPublish(record, workspace)) ?? null
}

export function recordWebsiteEvidence(workspace: WebsiteWorkspace, input: {
  actionId: string
  capturedAt: string
  kind: EvidenceKind
  finding: string
  reference: string
  verifiedBy: string
}) {
  const source = websiteSource(workspace)
  const evidence: PublishEvidence = {
    id: input.actionId,
    kind: input.kind,
    finding: input.finding,
    reference: input.reference,
    verifiedBy: input.verifiedBy,
    verifiedAt: input.capturedAt,
    fingerprint: source.digest,
    source,
    migratedFromV1: false,
  }
  if (!isPublishEvidence(evidence)) throw new Error('Complete the evidence finding, source, reviewer, and timestamp.')
  const existing = workspace.evidence.find((entry) => entry.id === input.actionId)
  if (existing) {
    if (serialize(existing) === serialize(evidence)) return workspace
    throw new Error('Evidence action ID is already used by a different record.')
  }
  const event = createWorkflowEvent({
    actionId: input.actionId,
    createdAt: input.capturedAt,
    actor: input.verifiedBy,
    action: 'publish_evidence_recorded',
    subjectId: evidence.id,
    reason: input.finding,
    evidenceReference: input.reference,
    source,
  })
  return { ...workspace, evidence: [evidence, ...workspace.evidence], events: [event, ...workspace.events] }
}

export function approveWebsiteRevision(workspace: WebsiteWorkspace, input: {
  actionId: string
  capturedAt: string
  reviewer: string
  note: string
}) {
  const source = websiteSource(workspace)
  const evidenceIds = getCurrentEvidence(workspace).map((entry) => entry.id)
  if (!readinessChecks(workspace, source.digest).every((check) => check.passed)) {
    throw new Error('Complete all current readiness checks before approval.')
  }
  const approval: PublishApproval = {
    id: input.actionId,
    reviewer: input.reviewer,
    note: input.note,
    approvedAt: input.capturedAt,
    fingerprint: source.digest,
    evidenceIds,
    source,
    migratedFromV1: false,
  }
  if (!isPublishApproval(approval)) throw new Error('Complete the reviewer, decision note, and timestamp.')
  const existing = workspace.approvals.find((entry) => entry.id === input.actionId)
  if (existing) {
    if (serialize(existing) === serialize(approval)) return workspace
    throw new Error('Approval action ID is already used by a different decision.')
  }
  const current = getCurrentApproval(workspace)
  if (current) return workspace
  const event = createWorkflowEvent({
    actionId: input.actionId,
    createdAt: input.capturedAt,
    actor: input.reviewer,
    action: 'website_revision_approved',
    subjectId: approval.id,
    reason: input.note,
    evidenceReference: evidenceIds.join(','),
    source,
  })
  return { ...workspace, approvals: [approval, ...workspace.approvals], events: [event, ...workspace.events] }
}

export function recordWebsiteSnapshot(workspace: WebsiteWorkspace, input: {
  actionId: string
  capturedAt: string
}) {
  const source = websiteSource(workspace)
  const approval = getCurrentApproval(workspace)
  if (!approval || !readinessChecks(workspace, source.digest).every((check) => check.passed)) {
    throw new Error('A current evidence-bound human approval is required.')
  }
  const record: LocalPublishRecord = {
    id: input.actionId,
    recordedAt: input.capturedAt,
    recordedBy: approval.reviewer,
    fingerprint: source.digest,
    readyPageIds: workspace.pages.filter((page) => page.stage === 'ready').map((page) => page.id),
    approvalId: approval.id,
    evidenceIds: [...approval.evidenceIds],
    source,
    migratedFromV1: false,
    artifact: createWebsiteArtifact(workspace),
  }
  const existing = workspace.localPublishes.find((entry) => entry.id === input.actionId)
  if (existing) {
    if (serialize(existing) === serialize(record)) return workspace
    throw new Error('Snapshot action ID is already used by a different record.')
  }
  if (getCurrentPublish(workspace)) return workspace
  const event = createWorkflowEvent({
    actionId: input.actionId,
    createdAt: input.capturedAt,
    actor: approval.reviewer,
    action: 'local_snapshot_recorded',
    subjectId: record.id,
    reason: 'Approved browser-local snapshot recorded',
    evidenceReference: approval.id,
    source,
  })
  return { ...workspace, localPublishes: [record, ...workspace.localPublishes], events: [event, ...workspace.events] }
}

export function applyWebsiteWorkspaceUpdate(current: WebsiteWorkspace, update: WebsiteWorkspaceUpdate): WebsiteMutationResult {
  try {
    const candidate = update(current)
    if (!isWebsiteWorkspace(candidate, 1)) return { ok: false, error: 'Website transition produced an invalid workspace.' }
    if (candidate.revision !== current.revision || candidate.contentRevision !== current.contentRevision) {
      return { ok: false, error: 'Website transitions cannot set revision metadata directly.' }
    }
    if (serialize(candidate) === serialize(current)) return { ok: true, changed: false, workspace: current }
    const contentChanged = workspaceFingerprint(candidate) !== workspaceFingerprint(current)
    if (contentChanged && consequentialRecordCount(candidate) !== consequentialRecordCount(current)) {
      return { ok: false, error: 'Content and release evidence must be recorded in separate actions.' }
    }
    const next: WebsiteWorkspace = {
      ...candidate,
      revision: current.revision + 1,
      contentRevision: current.contentRevision + (contentChanged ? 1 : 0),
    }
    if (!isWebsiteWorkspace(next) || !preservesAppendOnlyHistory(current, next)) {
      return { ok: false, error: 'Website history or revision integrity check failed.' }
    }
    return { ok: true, changed: true, workspace: next }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Website transition failed.' }
  }
}

export async function mutateWebsiteWorkspace(
  update: WebsiteWorkspaceUpdate,
  expectedRevision: number,
  expectedContentRevision: number,
  storage: WebsiteStorage | undefined = globalThis.localStorage,
  locks: WebsiteLockManager | undefined = globalThis.navigator?.locks as WebsiteLockManager | undefined,
): Promise<WebsiteMutationResult> {
  if (!storage) return { ok: false, error: 'Browser storage is unavailable.' }
  if (!locks?.request) return { ok: false, error: 'Safe browser locking is unavailable.' }
  try {
    return await locks.request(WEBSITE_MUTATION_LOCK, { mode: 'exclusive' }, async () => {
      const loaded = loadWebsiteWorkspace(storage)
      if (!loaded.ok) return loaded
      if (loaded.workspace.revision !== expectedRevision
        && loaded.workspace.contentRevision !== expectedContentRevision) {
        return { ok: false, error: 'Website content changed in another tab. The current record was preserved; review the refreshed content revision.' }
      }
      const transitioned = applyWebsiteWorkspaceUpdate(loaded.workspace, update)
      if (!transitioned.ok || !transitioned.changed) return transitioned
      const encoded = serialize(transitioned.workspace)
      storage.setItem(WEBSITE_STORAGE_KEY, encoded)
      const confirmedRaw = storage.getItem(WEBSITE_STORAGE_KEY)
      if (confirmedRaw !== encoded) return { ok: false, error: 'Website storage did not confirm the write.' }
      const confirmed = parseStoredWorkspace(confirmedRaw)
      if (!confirmed || serialize(confirmed) !== encoded) return { ok: false, error: 'Website storage confirmation was invalid.' }
      return { ok: true, changed: true, workspace: confirmed }
    })
  } catch (error) {
    return { ok: false, error: 'Website write failed: ' + (error instanceof Error ? error.message : 'unknown storage error') }
  }
}

export function loadWebsiteWorkspace(storage: Pick<WebsiteStorage, 'getItem'>): WebsiteLoadResult {
  try {
    const currentRaw = storage.getItem(WEBSITE_STORAGE_KEY)
    if (currentRaw !== null) {
      const current = parseStoredWorkspace(currentRaw)
      return current
        ? { ok: true, source: 'v2', workspace: current }
        : { ok: false, error: 'Website saving is paused because the saved data on this device cannot be read safely. The original value is untouched; export a backup or review the guided repair.' }
    }
    const legacyRaw = storage.getItem(LEGACY_WEBSITE_STORAGE_KEY)
    if (legacyRaw !== null) {
      const legacy = parseLegacyWorkspace(legacyRaw)
      return legacy
        ? { ok: true, source: 'v1', workspace: migrateLegacyWorkspace(legacy) }
        : { ok: false, error: 'Website saving is paused because older data on this device cannot be read safely. The original value is untouched; export a backup or review the guided repair.' }
    }
    return { ok: true, source: 'seed', workspace: createInitialWorkspace() }
  } catch (error) {
    return { ok: false, error: 'Website storage could not be read: ' + (error instanceof Error ? error.message : 'unknown storage error') }
  }
}

function repairFailure(
  code: WebsiteRepairFailureCode,
  error: string,
  state: { archiveKey?: string; archiveConfirmed?: boolean; replacementConfirmed?: boolean } = {},
): WebsiteLocalRepairResult {
  return {
    ok: false,
    code,
    error,
    archiveKey: state.archiveKey,
    archiveConfirmed: state.archiveConfirmed ?? false,
    replacementConfirmed: state.replacementConfirmed ?? false,
  }
}

export async function repairInvalidWebsiteWorkspace(
  candidate: WebsiteInvalidLocalCandidate,
  replacement: WebsiteWorkspace,
  storage: WebsiteRepairStorage | undefined = globalThis.localStorage,
  locks: WebsiteLockManager | undefined = globalThis.navigator?.locks as WebsiteLockManager | undefined,
): Promise<WebsiteLocalRepairResult> {
  if (!storage) return repairFailure('storage_unavailable', 'Browser storage is unavailable, so the saved Website value was not changed.')
  if (!locks?.request) return repairFailure('lock_unavailable', 'Safe browser locking is unavailable, so the saved Website value was not changed.')
  if (!isWebsiteWorkspace(replacement)) return repairFailure('replacement_confirmation_failed', 'The current Website workspace is not valid enough to repair local storage.')
  const sourceMatches = (candidate.source === 'v2' && candidate.sourceKey === WEBSITE_STORAGE_KEY)
    || (candidate.source === 'v1' && candidate.sourceKey === LEGACY_WEBSITE_STORAGE_KEY)
  if (!sourceMatches) return repairFailure('stale_candidate', 'The Website repair candidate does not match its storage source.')

  const repairState: {
    archiveKey?: string
    archiveConfirmed: boolean
    replacementConfirmed: boolean
  } = {
    archiveConfirmed: false,
    replacementConfirmed: false,
  }

  try {
    return await locks.request(WEBSITE_MUTATION_LOCK, { mode: 'exclusive' }, async () => {
      const currentRaw = storage.getItem(candidate.sourceKey)
      if (currentRaw !== candidate.expectedRaw) {
        return repairFailure('stale_candidate', 'Saved Website data changed after repair was requested. Nothing was replaced.')
      }
      const isStillInvalid = candidate.source === 'v2'
        ? parseStoredWorkspace(currentRaw) === null
        : parseLegacyWorkspace(currentRaw) === null
      if (!isStillInvalid) return repairFailure('not_invalid', 'Saved Website data is now valid. Nothing was replaced.')
      if (candidate.source === 'v1' && storage.getItem(WEBSITE_STORAGE_KEY) !== null) {
        return repairFailure('stale_candidate', 'A newer Website workspace now exists. The old value was not repaired or replaced.')
      }

      const archivedAt = new Date().toISOString()
      const archiveId = createId('website-recovery')
      const archiveKey = `${WEBSITE_RECOVERY_KEY_PREFIX}${archiveId}`
      repairState.archiveKey = archiveKey
      if (storage.getItem(archiveKey) !== null) {
        return repairFailure('archive_write_failed', 'A Website recovery archive with this ID already exists. Nothing was replaced.', repairState)
      }
      const archiveRaw = serialize({
        schema: WEBSITE_RECOVERY_SCHEMA,
        archiveId,
        archivedAt,
        sourceKey: candidate.sourceKey,
        rawValue: currentRaw,
        replacementRevision: replacement.revision,
        replacementContentRevision: replacement.contentRevision,
      })
      try {
        storage.setItem(archiveKey, archiveRaw)
      } catch (error) {
        return repairFailure('archive_write_failed', `The invalid Website value could not be archived: ${error instanceof Error ? error.message : 'unknown storage error'}`, repairState)
      }
      if (storage.getItem(archiveKey) !== archiveRaw) {
        return repairFailure('archive_confirmation_failed', 'The Website recovery archive could not be confirmed. The saved value was not replaced.', repairState)
      }
      repairState.archiveConfirmed = true

      const currentIndexRaw = storage.getItem(WEBSITE_RECOVERY_INDEX_KEY)
      const currentArchives = parseWebsiteRecoveryIndex(currentIndexRaw)
      if (currentArchives === null) {
        return repairFailure('archive_index_failed', 'The Website recovery index is invalid. The archive was retained, but the saved value was not replaced.', repairState)
      }
      const nextIndexRaw = serialize({
        schema: WEBSITE_RECOVERY_SCHEMA,
        archives: [...currentArchives, { archiveKey, archivedAt, sourceKey: candidate.sourceKey }],
      })
      try {
        storage.setItem(WEBSITE_RECOVERY_INDEX_KEY, nextIndexRaw)
      } catch (error) {
        return repairFailure('archive_index_failed', `The Website recovery index could not be saved: ${error instanceof Error ? error.message : 'unknown storage error'}`, repairState)
      }
      if (storage.getItem(WEBSITE_RECOVERY_INDEX_KEY) !== nextIndexRaw) {
        return repairFailure('archive_index_failed', 'The Website recovery index could not be confirmed. The archive was retained, but the saved value was not replaced.', repairState)
      }

      if (storage.getItem(candidate.sourceKey) !== currentRaw) {
        return repairFailure('stale_candidate', 'Saved Website data changed while the recovery archive was being prepared. The archive was retained, but nothing was replaced.', repairState)
      }
      if (candidate.source === 'v1' && storage.getItem(WEBSITE_STORAGE_KEY) !== null) {
        return repairFailure('stale_candidate', 'A newer Website workspace appeared while the old value was being archived. The archive was retained, but the newer workspace was not replaced.', repairState)
      }
      const replacementRaw = serialize(replacement)
      try {
        storage.setItem(WEBSITE_STORAGE_KEY, replacementRaw)
      } catch (error) {
        return repairFailure('replacement_write_failed', `The valid Website workspace could not be saved: ${error instanceof Error ? error.message : 'unknown storage error'}`, repairState)
      }
      const confirmedRaw = storage.getItem(WEBSITE_STORAGE_KEY)
      const confirmed = confirmedRaw === replacementRaw ? parseStoredWorkspace(confirmedRaw) : null
      if (!confirmed || serialize(confirmed) !== replacementRaw) {
        return repairFailure('replacement_confirmation_failed', 'The repaired Website workspace could not be confirmed. The archive was retained and durable editing remains paused.', repairState)
      }
      repairState.replacementConfirmed = true

      let legacyCleanup: 'not-needed' | 'removed' | 'retained' = 'not-needed'
      if (candidate.source === 'v1') {
        try {
          storage.removeItem(LEGACY_WEBSITE_STORAGE_KEY)
          legacyCleanup = storage.getItem(LEGACY_WEBSITE_STORAGE_KEY) === null ? 'removed' : 'retained'
        } catch {
          legacyCleanup = 'retained'
        }
      }
      return { ok: true, workspace: confirmed, archiveKey, archivedAt, legacyCleanup }
    })
  } catch (error) {
    return repairFailure('storage_unavailable', `Website repair stopped because browser storage could not be confirmed: ${error instanceof Error ? error.message : 'unknown storage error'}`, repairState)
  }
}

function isWebsiteRecoverySourceKey(
  value: unknown,
): value is typeof WEBSITE_STORAGE_KEY | typeof LEGACY_WEBSITE_STORAGE_KEY {
  return value === WEBSITE_STORAGE_KEY || value === LEGACY_WEBSITE_STORAGE_KEY
}

function parseWebsiteRecoveryIndex(raw: string | null): WebsiteRecoveryArchiveSummary[] | null {
  if (raw === null) return []
  try {
    const candidate = JSON.parse(raw) as unknown
    if (!isRecord(candidate)
      || !hasExactKeys(candidate, ['schema', 'archives'])
      || candidate.schema !== WEBSITE_RECOVERY_SCHEMA
      || !Array.isArray(candidate.archives)) return null
    const archives: WebsiteRecoveryArchiveSummary[] = []
    const keys = new Set<string>()
    for (const entry of candidate.archives) {
      if (!isRecord(entry)
        || !hasExactKeys(entry, ['archiveKey', 'archivedAt', 'sourceKey'])
        || typeof entry.archiveKey !== 'string'
        || !entry.archiveKey.startsWith(WEBSITE_RECOVERY_KEY_PREFIX)
        || entry.archiveKey === WEBSITE_RECOVERY_INDEX_KEY
        || typeof entry.archivedAt !== 'string'
        || Number.isNaN(Date.parse(entry.archivedAt))
        || !isWebsiteRecoverySourceKey(entry.sourceKey)
        || keys.has(entry.archiveKey)) return null
      keys.add(entry.archiveKey)
      archives.push({
        archiveKey: entry.archiveKey,
        archivedAt: entry.archivedAt,
        sourceKey: entry.sourceKey,
      })
    }
    return archives
  } catch {
    return null
  }
}

export function readWebsiteRecoveryArchive(
  archiveKey: string,
  storage: Pick<WebsiteRepairStorage, 'getItem'> | undefined = globalThis.localStorage,
): string | null {
  if (!storage || !archiveKey.startsWith(WEBSITE_RECOVERY_KEY_PREFIX) || archiveKey === WEBSITE_RECOVERY_INDEX_KEY) return null
  const raw = storage.getItem(archiveKey)
  if (raw === null) return null
  try {
    const candidate = JSON.parse(raw) as {
      schema?: unknown
      archiveId?: unknown
      archivedAt?: unknown
      sourceKey?: unknown
      rawValue?: unknown
      replacementRevision?: unknown
      replacementContentRevision?: unknown
    }
    if (candidate.schema !== WEBSITE_RECOVERY_SCHEMA
      || typeof candidate.archiveId !== 'string'
      || archiveKey !== `${WEBSITE_RECOVERY_KEY_PREFIX}${candidate.archiveId}`
      || typeof candidate.archivedAt !== 'string'
      || !isWebsiteRecoverySourceKey(candidate.sourceKey)
      || typeof candidate.rawValue !== 'string'
      || !Number.isSafeInteger(candidate.replacementRevision)
      || !Number.isSafeInteger(candidate.replacementContentRevision)) return null
    return raw
  } catch {
    return null
  }
}

export function listWebsiteRecoveryArchives(
  storage: Pick<WebsiteRepairStorage, 'getItem'> | undefined = globalThis.localStorage,
): WebsiteRecoveryArchiveSummary[] {
  if (!storage) return []
  try {
    const index = parseWebsiteRecoveryIndex(storage.getItem(WEBSITE_RECOVERY_INDEX_KEY))
    if (!index) return []
    return index
      .filter((entry) => readWebsiteRecoveryArchive(entry.archiveKey, storage) !== null)
      .sort((left, right) => right.archivedAt.localeCompare(left.archivedAt))
  } catch {
    return []
  }
}

export async function deleteWebsiteRecoveryArchive(
  archiveKey: string,
  storage: WebsiteRepairStorage | undefined = globalThis.localStorage,
  locks: WebsiteLockManager | undefined = globalThis.navigator?.locks as WebsiteLockManager | undefined,
): Promise<WebsiteRecoveryDeleteResult> {
  if (!storage) return { ok: false, error: 'Browser storage is unavailable, so the recovery archive was not removed.' }
  if (!locks?.request) return { ok: false, error: 'Safe browser locking is unavailable, so the recovery archive was not removed.' }
  if (!archiveKey.startsWith(WEBSITE_RECOVERY_KEY_PREFIX) || archiveKey === WEBSITE_RECOVERY_INDEX_KEY) {
    return { ok: false, error: 'The selected Website recovery archive is not valid.' }
  }
  try {
    return await locks.request(WEBSITE_MUTATION_LOCK, { mode: 'exclusive' }, () => {
      const currentIndexRaw = storage.getItem(WEBSITE_RECOVERY_INDEX_KEY)
      const currentArchives = parseWebsiteRecoveryIndex(currentIndexRaw)
      if (!currentArchives) return { ok: false, error: 'The Website recovery index is invalid, so nothing was removed.' }
      if (!currentArchives.some((entry) => entry.archiveKey === archiveKey)
        || readWebsiteRecoveryArchive(archiveKey, storage) === null) {
        return { ok: false, error: 'The selected Website recovery archive no longer exists or failed validation.' }
      }
      const nextArchives = currentArchives.filter((entry) => entry.archiveKey !== archiveKey)
      const nextIndexRaw = serialize({ schema: WEBSITE_RECOVERY_SCHEMA, archives: nextArchives })
      storage.setItem(WEBSITE_RECOVERY_INDEX_KEY, nextIndexRaw)
      if (storage.getItem(WEBSITE_RECOVERY_INDEX_KEY) !== nextIndexRaw) {
        return { ok: false, error: 'The recovery index did not confirm the change, so the archive was retained.' }
      }
      try {
        storage.removeItem(archiveKey)
        if (storage.getItem(archiveKey) !== null) throw new Error('archive removal was not confirmed')
      } catch (error) {
        try {
          storage.setItem(WEBSITE_RECOVERY_INDEX_KEY, currentIndexRaw ?? serialize({
            schema: WEBSITE_RECOVERY_SCHEMA,
            archives: currentArchives,
          }))
        } catch {
          // The archive remains intact; a later reload will validate the index before showing it.
        }
        return {
          ok: false,
          error: `The recovery archive could not be removed: ${error instanceof Error ? error.message : 'unknown storage error'}`,
        }
      }
      return { ok: true, archives: listWebsiteRecoveryArchives(storage) }
    })
  } catch (error) {
    return { ok: false, error: `Website recovery archive removal failed: ${error instanceof Error ? error.message : 'unknown storage error'}` }
  }
}

// A restored device snapshot is structurally valid, not a signed audit checkpoint.
// In-app writes establish append-only history by comparing it with the prior workspace.
export function restoreWorkspace(value: unknown): WebsiteWorkspace | null {
  if (isWebsiteWorkspace(value)) return value
  const restoredV2 = restoreV2(value)
  if (restoredV2) return restoredV2
  if (isLegacyWorkspace(value)) return migrateLegacyWorkspace(value)
  return null
}

export function normalizeSlug(value: string) {
  const trimmed = value.trim()
  if (trimmed === '/') return '/'
  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed
}

function pageAnchorForSlug(value: string) {
  const normalized = normalizeSlug(value)
  return normalized === '/' ? 'home' : normalized.slice(1).replaceAll('/', '-')
}

export function formatTimestamp(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Unknown time'
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function migrateLegacyWorkspace(legacy: LegacyWebsiteWorkspace): WebsiteWorkspace {
  return {
    schema: WEBSITE_SCHEMA,
    version: 2,
    revision: 0,
    contentRevision: 0,
    siteName: legacy.siteName,
    pages: legacy.pages,
    selectedPageId: legacy.selectedPageId,
    evidence: [],
    approvals: [],
    localPublishes: [],
    events: [],
  }
}

function isUntouchedLegacyCorporateSample(workspace: WebsiteWorkspace) {
  return workspace.revision === 0
    && workspace.contentRevision === 0
    && workspace.siteName === 'SuperMega'
    && workspace.selectedPageId === 'page-home'
    && workspace.pages.length === 3
    && workspace.pages.some((page) => page.id === 'page-home' && page.slug === '/')
    && workspace.pages.some((page) => page.id === 'page-products' && page.slug === '/products')
    && workspace.pages.some((page) => page.id === 'page-contact' && page.slug === '/contact')
    && workspace.evidence.length === 0
    && workspace.approvals.length === 0
    && workspace.localPublishes.length === 0
    && workspace.events.length === 0
}

function parseStoredWorkspace(raw: string) {
  try {
    const restored = restoreV2(JSON.parse(raw) as unknown)
    return restored && isUntouchedLegacyCorporateSample(restored)
      ? createInitialWorkspace()
      : restored
  } catch { return null }
}

function parseLegacyWorkspace(raw: string) {
  try {
    const value: unknown = JSON.parse(raw)
    return isLegacyWorkspace(value) ? value : null
  } catch { return null }
}

function restoreV2(value: unknown) {
  if (isWebsiteWorkspace(value)) return value
  if (!isRecord(value) || !Array.isArray(value.localPublishes)) return null
  const localPublishes = value.localPublishes.map((record) => (
    isMetadataOnlyPublishRecord(record) ? { ...record, artifact: null } : record
  ))
  const migrated = { ...value, localPublishes }
  return isWebsiteWorkspace(migrated) ? migrated : null
}

function isWebsiteWorkspace(value: unknown, pendingReleaseRecords = 0): value is WebsiteWorkspace {
  if (!isRecord(value)) return false
  const workspaceKeys = [
    'schema', 'version', 'revision', 'contentRevision', 'siteName', 'pages', 'selectedPageId',
    'evidence', 'approvals', 'localPublishes', 'events',
  ]
  if (Object.hasOwn(value, 'openingPlan')) workspaceKeys.push('openingPlan')
  if (Object.hasOwn(value, 'releaseRecords')) workspaceKeys.push('releaseRecords')
  if (Object.hasOwn(value, 'leadLedger')) workspaceKeys.push('leadLedger')
  if (!hasExactKeys(value, workspaceKeys)) return false
  if (value.schema !== WEBSITE_SCHEMA || value.version !== 2) return false
  const revision = value.revision
  const contentRevision = value.contentRevision
  if (!isNonNegativeInteger(revision) || !isNonNegativeInteger(contentRevision) || contentRevision > revision) return false
  if (!isText(value.siteName, 60, true) || !Array.isArray(value.pages) || value.pages.length < 1 || value.pages.length > MAX_WEBSITE_PAGES) return false
  if (!value.pages.every(isWebsitePage) || !hasUniqueIds(value.pages) || !hasUniqueSectionIds(value.pages)) return false
  if (!isText(value.selectedPageId, 80) || !value.pages.some((page) => page.id === value.selectedPageId)) return false
  if (!Array.isArray(value.evidence) || !value.evidence.every(isPublishEvidence) || !hasUniqueIds(value.evidence)) return false
  if (!Array.isArray(value.approvals) || !value.approvals.every(isPublishApproval) || !hasUniqueIds(value.approvals)) return false
  if (!Array.isArray(value.localPublishes) || !value.localPublishes.every(isLocalPublishRecord) || !hasUniqueIds(value.localPublishes)) return false
  if (Object.hasOwn(value, 'openingPlan')) {
    if (!isRecord(value.openingPlan)
      || !hasExactKeys(value.openingPlan, ['contract', 'packageDigest', 'workflowTemplateId', 'confirmedAt', 'pageIds'])
      || value.openingPlan.contract !== 'supermega.website.opening-plan.v1'
      || typeof value.openingPlan.packageDigest !== 'string'
      || !/^sha256:[0-9a-f]{64}$/.test(value.openingPlan.packageDigest)
      || !['business-presence', 'lead-generation', 'catalog-showcase'].includes(String(value.openingPlan.workflowTemplateId))
      || !isIsoTimestamp(value.openingPlan.confirmedAt)
      || !Array.isArray(value.openingPlan.pageIds)
      || value.openingPlan.pageIds.length < 1
      || value.openingPlan.pageIds.length > MAX_WEBSITE_PAGES
      || !value.openingPlan.pageIds.every((pageId) => isText(pageId, 80))
      || !hasUniqueStrings(value.openingPlan.pageIds)) return false
  }
  if (Object.hasOwn(value, 'releaseRecords')) {
    if (!Array.isArray(value.releaseRecords)
      || value.releaseRecords.length > MAX_WEBSITE_RELEASE_RECORDS
      || !value.releaseRecords.every(isWebsiteReleaseStateEnvelope)
      || !hasUniqueStrings(value.releaseRecords.map((record) => record.scope))) return false
  }
  if (Object.hasOwn(value, 'leadLedger') && restoreWebsiteLeadLedger(value.leadLedger) === null) return false
  const releaseRecords = [...value.evidence, ...value.approvals, ...value.localPublishes]
  if (releaseRecords.some((record) => record.migratedFromV1)) return false
  const releaseRecordCount = releaseRecords.length
  const confirmedReleaseCount = revision - contentRevision
  if (releaseRecordCount > confirmedReleaseCount + pendingReleaseRecords) return false
  if (!Array.isArray(value.events) || !value.events.every(isWorkflowEvent) || !hasUniqueIds(value.events)
    || !hasUniqueStrings(value.events.map((event) => event.subjectId))) return false
  const sourceRevisionIsValid = [...value.evidence, ...value.approvals, ...value.localPublishes, ...value.events]
    .every((record) => record.source.contentRevision <= contentRevision)
  if (!sourceRevisionIsValid) return false
  const evidenceById = new Map(value.evidence.map((entry) => [entry.id, entry]))
  const eventBySubject = new Map(value.events.map((entry) => [entry.subjectId, entry]))
  const expectedEvents: Array<{ subjectId: string; action: WebsiteWorkflowEvent['action'] }> = [
    ...value.evidence.map((entry) => ({ subjectId: entry.id, action: 'publish_evidence_recorded' as const })),
    ...value.approvals.map((entry) => ({ subjectId: entry.id, action: 'website_revision_approved' as const })),
    ...value.localPublishes.map((entry) => ({ subjectId: entry.id, action: 'local_snapshot_recorded' as const })),
  ]
  if (!hasUniqueStrings(expectedEvents.map((entry) => entry.subjectId))) return false
  const expectedEventBySubject = new Map(expectedEvents.map((entry) => [entry.subjectId, entry.action]))
  if (value.events.length !== expectedEvents.length
    || !value.events.every((event) => expectedEventBySubject.get(event.subjectId) === event.action)) return false
  for (const evidence of value.evidence) {
    if (!evidence.migratedFromV1) {
      const event = eventBySubject.get(evidence.id)
      if (!event
        || event.action !== 'publish_evidence_recorded'
        || event.actor !== evidence.verifiedBy
        || event.createdAt !== evidence.verifiedAt
        || event.reason !== evidence.finding
        || event.evidenceReference !== evidence.reference
        || !sameSource(event.source, evidence.source)) return false
    }
  }
  for (const approval of value.approvals) {
    const boundEvidence = approval.evidenceIds.map((id) => evidenceById.get(id))
    if (boundEvidence.some((entry) => !entry)) return false
    if (!approval.migratedFromV1) {
      const event = eventBySubject.get(approval.id)
      const kinds = new Set(boundEvidence.map((entry) => entry?.kind))
      if (approval.evidenceIds.length !== evidenceRequirements.length
        || kinds.size !== evidenceRequirements.length
        || !boundEvidence.every((entry) => entry && sameSource(entry.source, approval.source))
        || !event
        || event.action !== 'website_revision_approved'
        || event.actor !== approval.reviewer
        || event.createdAt !== approval.approvedAt
        || event.reason !== approval.note
        || event.evidenceReference !== approval.evidenceIds.join(',')
        || !sameSource(event.source, approval.source)) return false
    }
  }
  const approvalById = new Map(value.approvals.map((entry) => [entry.id, entry]))
  for (const publish of value.localPublishes) {
    if (!publish.evidenceIds.every((id) => evidenceById.has(id))) return false
    if (!publish.migratedFromV1) {
      const approval = publish.approvalId ? approvalById.get(publish.approvalId) : undefined
      const event = eventBySubject.get(publish.id)
      if (!approval
        || !sameSource(approval.source, publish.source)
        || !sameStringSet(publish.evidenceIds, approval.evidenceIds)
        || publish.recordedBy !== approval.reviewer
        || Date.parse(publish.recordedAt) < Date.parse(approval.approvedAt)
        || !event
        || event.action !== 'local_snapshot_recorded'
        || event.actor !== publish.recordedBy
        || event.createdAt !== publish.recordedAt
        || event.evidenceReference !== publish.approvalId
        || !sameSource(event.source, publish.source)) return false
    }
  }
  return true
}

function isLegacyWorkspace(value: unknown): value is LegacyWebsiteWorkspace {
  if (!isRecord(value) || !hasExactKeys(value, ['version', 'siteName', 'pages', 'selectedPageId', 'evidence', 'approval', 'localPublishes'])) return false
  if (value.version !== 1 || !isText(value.siteName, 60, true)) return false
  if (!Array.isArray(value.pages) || value.pages.length < 1 || value.pages.length > MAX_WEBSITE_PAGES || !value.pages.every(isWebsitePage)) return false
  if (!hasUniqueIds(value.pages) || !hasUniqueSectionIds(value.pages) || !isText(value.selectedPageId, 80) || !value.pages.some((page) => page.id === value.selectedPageId)) return false
  if (!Array.isArray(value.evidence) || !value.evidence.every(isLegacyEvidence) || !hasUniqueIds(value.evidence)) return false
  if (value.approval !== null && !isLegacyApproval(value.approval)) return false
  if (!Array.isArray(value.localPublishes) || !value.localPublishes.every(isLegacyPublish) || !hasUniqueIds(value.localPublishes)) return false
  return true
}

function isWebsitePage(value: unknown): value is WebsitePage {
  if (!isRecord(value) || !hasExactKeys(value, ['id', 'internalName', 'slug', 'stage', 'navigation', 'hero', 'sections', 'seo', 'updatedAt'])) return false
  if (!isRecord(value.navigation) || !hasExactKeys(value.navigation, ['label', 'visible'])) return false
  if (!isRecord(value.hero) || !hasExactKeys(value.hero, ['eyebrow', 'headline', 'summary', 'ctaLabel', 'ctaHref'])) return false
  if (!isRecord(value.seo) || !hasExactKeys(value.seo, ['title', 'description'])) return false
  return isText(value.id, 80)
    && isText(value.internalName, 60, true)
    && isText(value.slug, 100, true)
    && (value.stage === 'draft' || value.stage === 'ready')
    && isText(value.navigation.label, 40, true)
    && typeof value.navigation.visible === 'boolean'
    && isText(value.hero.eyebrow, 80, true)
    && isText(value.hero.headline, 140, true)
    && isText(value.hero.summary, 280, true)
    && isText(value.hero.ctaLabel, 40, true)
    && isText(value.hero.ctaHref, 160, true)
    && Array.isArray(value.sections)
    && value.sections.length <= MAX_WEBSITE_SECTIONS
    && value.sections.every(isPageSection)
    && isText(value.seo.title, 70, true)
    && isText(value.seo.description, 160, true)
    && isIsoTimestamp(value.updatedAt)
}

function isPageSection(value: unknown): value is PageSection {
  return isRecord(value)
    && hasExactKeys(value, ['id', 'eyebrow', 'title', 'body'])
    && isText(value.id, 80)
    && isText(value.eyebrow, 60, true)
    && isText(value.title, 120, true)
    && isText(value.body, 360, true)
}

function isSource(value: unknown): value is WebsiteSourceRef {
  return isRecord(value)
    && hasExactKeys(value, ['contentRevision', 'digest'])
    && isNonNegativeInteger(value.contentRevision)
    && typeof value.digest === 'string'
    && fingerprintPattern.test(value.digest)
}

function isPublishEvidence(value: unknown): value is PublishEvidence {
  return isRecord(value)
    && hasExactKeys(value, ['id', 'kind', 'finding', 'reference', 'verifiedBy', 'verifiedAt', 'fingerprint', 'source', 'migratedFromV1'])
    && isText(value.id, 100)
    && evidenceRequirements.some((requirement) => requirement.id === value.kind)
    && isText(value.finding, 180)
    && isText(value.reference, 220)
    && isText(value.verifiedBy, 80)
    && isIsoTimestamp(value.verifiedAt)
    && typeof value.fingerprint === 'string'
    && fingerprintPattern.test(value.fingerprint)
    && isSource(value.source)
    && value.fingerprint === value.source.digest
    && typeof value.migratedFromV1 === 'boolean'
}

function isLegacyEvidence(value: unknown): value is LegacyPublishEvidence {
  return isRecord(value)
    && hasExactKeys(value, ['id', 'kind', 'finding', 'reference', 'verifiedBy', 'verifiedAt', 'fingerprint'])
    && isText(value.id, 100)
    && evidenceRequirements.some((requirement) => requirement.id === value.kind)
    && isText(value.finding, 180)
    && isText(value.reference, 220)
    && isText(value.verifiedBy, 80)
    && isIsoTimestamp(value.verifiedAt)
    && typeof value.fingerprint === 'string'
    && fingerprintPattern.test(value.fingerprint)
}

function isPublishApproval(value: unknown): value is PublishApproval {
  return isRecord(value)
    && hasExactKeys(value, ['id', 'reviewer', 'note', 'approvedAt', 'fingerprint', 'evidenceIds', 'source', 'migratedFromV1'])
    && isText(value.id, 100)
    && isText(value.reviewer, 80)
    && isText(value.note, 240)
    && isIsoTimestamp(value.approvedAt)
    && typeof value.fingerprint === 'string'
    && fingerprintPattern.test(value.fingerprint)
    && Array.isArray(value.evidenceIds)
    && value.evidenceIds.every((id) => isText(id, 100))
    && hasUniqueStrings(value.evidenceIds)
    && isSource(value.source)
    && value.fingerprint === value.source.digest
    && typeof value.migratedFromV1 === 'boolean'
}

function isLegacyApproval(value: unknown): value is LegacyPublishApproval {
  return isRecord(value)
    && hasExactKeys(value, ['id', 'reviewer', 'note', 'approvedAt', 'fingerprint'])
    && isText(value.id, 100)
    && isText(value.reviewer, 80)
    && isText(value.note, 240)
    && isIsoTimestamp(value.approvedAt)
    && typeof value.fingerprint === 'string'
    && fingerprintPattern.test(value.fingerprint)
}

function isWebsiteArtifact(value: unknown): value is WebsiteArtifact {
  if (!isRecord(value)
    || !hasExactKeys(value, ['schema', 'siteName', 'fingerprint', 'contentDigest', 'source', 'pages'])
    || value.schema !== 'supermega.website.artifact.v1'
    || !isText(value.siteName, 60)
    || typeof value.fingerprint !== 'string'
    || !fingerprintPattern.test(value.fingerprint)
    || typeof value.contentDigest !== 'string'
    || !/^site-[a-f0-9]{8}$/.test(value.contentDigest)
    || !isSource(value.source)
    || value.fingerprint !== value.source.digest
    || !Array.isArray(value.pages)
    || value.pages.length < 1
    || value.pages.length > MAX_WEBSITE_PAGES
    || !value.pages.every(isWebsiteArtifactPage)
    || !hasUniqueIds(value.pages)
    || !hasUniqueSectionIds(value.pages)) return false
  const { contentDigest, ...content } = value
  if (contentDigest !== 'site-' + canonicalDigest(content)) return false
  const slugs = value.pages.map((page) => page.slug)
  if (!hasUniqueStrings(slugs) || slugs.filter((slug) => slug === '/').length !== 1) return false
  const readyPaths = new Set(slugs)
  const readyAnchors = new Set(slugs.map(pageAnchorForSlug))
  return value.pages
    .filter((page) => page.navigation.visible)
    .length > 0
    && value.pages.every((page) => {
      const destination = page.hero.ctaHref.trim()
      return !destination
        || (destination.startsWith('#') && readyAnchors.has(destination.slice(1)))
        || isSafeHttpsDestination(destination)
        || (destination.startsWith('/') && readyPaths.has(normalizeSlug(destination)))
    })
}

function isWebsiteArtifactPage(value: unknown): value is WebsiteArtifactPage {
  if (!isRecord(value) || !hasExactKeys(value, ['id', 'slug', 'navigation', 'hero', 'sections', 'seo'])) return false
  if (!isRecord(value.navigation) || !hasExactKeys(value.navigation, ['label', 'visible'])) return false
  if (!isRecord(value.hero) || !hasExactKeys(value.hero, ['eyebrow', 'headline', 'summary', 'ctaLabel', 'ctaHref'])) return false
  if (!isRecord(value.seo) || !hasExactKeys(value.seo, ['title', 'description'])) return false
  const hasCtaLabel = typeof value.hero.ctaLabel === 'string' && Boolean(value.hero.ctaLabel.trim())
  const hasCtaHref = typeof value.hero.ctaHref === 'string' && Boolean(value.hero.ctaHref.trim())
  return isText(value.id, 80)
    && isText(value.slug, 100)
    && isValidSlug(value.slug)
    && normalizeSlug(value.slug) === value.slug
    && isText(value.navigation.label, 40, true)
    && typeof value.navigation.visible === 'boolean'
    && isText(value.hero.eyebrow, 80, true)
    && isText(value.hero.headline, 140)
    && isText(value.hero.summary, 280)
    && isText(value.hero.ctaLabel, 40, true)
    && isText(value.hero.ctaHref, 160, true)
    && hasCtaLabel === hasCtaHref
    && (!hasCtaHref || isValidDestination(value.hero.ctaHref))
    && Array.isArray(value.sections)
    && value.sections.length > 0
    && value.sections.length <= MAX_WEBSITE_SECTIONS
    && value.sections.every((section) => isPageSection(section)
      && Boolean(section.title.trim())
      && Boolean(section.body.trim()))
    && isText(value.seo.title, 70)
    && isText(value.seo.description, 160)
}

function isLocalPublishRecord(value: unknown): value is LocalPublishRecord {
  return isRecord(value)
    && hasExactKeys(value, ['id', 'recordedAt', 'recordedBy', 'fingerprint', 'readyPageIds', 'approvalId', 'evidenceIds', 'source', 'migratedFromV1', 'artifact'])
    && isText(value.id, 100)
    && isIsoTimestamp(value.recordedAt)
    && isText(value.recordedBy, 80)
    && typeof value.fingerprint === 'string'
    && fingerprintPattern.test(value.fingerprint)
    && Array.isArray(value.readyPageIds)
    && value.readyPageIds.every((id) => isText(id, 80))
    && hasUniqueStrings(value.readyPageIds)
    && (value.approvalId === null || isText(value.approvalId, 100))
    && Array.isArray(value.evidenceIds)
    && value.evidenceIds.every((id) => isText(id, 100))
    && hasUniqueStrings(value.evidenceIds)
    && isSource(value.source)
    && value.fingerprint === value.source.digest
    && typeof value.migratedFromV1 === 'boolean'
    && (value.artifact === null
      || (isWebsiteArtifact(value.artifact)
        && value.artifact.fingerprint === value.fingerprint
        && sameSource(value.artifact.source, value.source)
        && sameStringSet(value.artifact.pages.map((page) => page.id), value.readyPageIds)))
}

function isMetadataOnlyPublishRecord(value: unknown) {
  return isRecord(value)
    && hasExactKeys(value, ['id', 'recordedAt', 'recordedBy', 'fingerprint', 'readyPageIds', 'approvalId', 'evidenceIds', 'source', 'migratedFromV1'])
}

function isLegacyPublish(value: unknown): value is LegacyLocalPublishRecord {
  return isRecord(value)
    && hasExactKeys(value, ['id', 'recordedAt', 'recordedBy', 'fingerprint', 'readyPageIds'])
    && isText(value.id, 100)
    && isIsoTimestamp(value.recordedAt)
    && isText(value.recordedBy, 80)
    && typeof value.fingerprint === 'string'
    && fingerprintPattern.test(value.fingerprint)
    && Array.isArray(value.readyPageIds)
    && value.readyPageIds.every((id) => isText(id, 80))
    && hasUniqueStrings(value.readyPageIds)
}

function isWorkflowEvent(value: unknown): value is WebsiteWorkflowEvent {
  return isRecord(value)
    && hasExactKeys(value, ['id', 'createdAt', 'actorKind', 'actor', 'action', 'subjectId', 'reason', 'evidenceReference', 'source'])
    && isText(value.id, 120)
    && isIsoTimestamp(value.createdAt)
    && value.actorKind === 'human'
    && isText(value.actor, 80)
    && ['publish_evidence_recorded', 'website_revision_approved', 'local_snapshot_recorded'].includes(String(value.action))
    && isText(value.subjectId, 100)
    && isText(value.reason, 240)
    && isText(value.evidenceReference, 320)
    && isSource(value.source)
}

function createWorkflowEvent(input: Omit<WebsiteWorkflowEvent, 'id' | 'actorKind'> & { actionId: string }): WebsiteWorkflowEvent {
  return {
    id: 'event-' + input.actionId,
    createdAt: input.createdAt,
    actorKind: 'human',
    actor: input.actor,
    action: input.action,
    subjectId: input.subjectId,
    reason: input.reason,
    evidenceReference: input.evidenceReference,
    source: input.source,
  }
}

function preservesAppendOnlyHistory(current: WebsiteWorkspace, next: WebsiteWorkspace) {
  if (!hasSuffix(next.evidence, current.evidence) || !hasSuffix(next.approvals, current.approvals)
    || !hasSuffix(next.localPublishes, current.localPublishes) || !hasSuffix(next.events, current.events)) return false
  const evidenceAdded = next.evidence.length - current.evidence.length
  const approvalsAdded = next.approvals.length - current.approvals.length
  const publishesAdded = next.localPublishes.length - current.localPublishes.length
  const eventsAdded = next.events.length - current.events.length
  if ([evidenceAdded, approvalsAdded, publishesAdded].some((count) => count < 0 || count > 1)) return false
  if (eventsAdded !== evidenceAdded + approvalsAdded + publishesAdded) return false
  const expected = [
    evidenceAdded ? ['publish_evidence_recorded', next.evidence[0].id] : null,
    approvalsAdded ? ['website_revision_approved', next.approvals[0].id] : null,
    publishesAdded ? ['local_snapshot_recorded', next.localPublishes[0].id] : null,
  ].filter((entry): entry is string[] => Boolean(entry))
  return expected.every(([action, subjectId]) => next.events.slice(0, eventsAdded)
    .some((event) => event.action === action && event.subjectId === subjectId))
}

function sameReleaseHistory(left: WebsiteWorkspace, right: WebsiteWorkspace) {
  return serialize(left.evidence) === serialize(right.evidence)
    && serialize(left.approvals) === serialize(right.approvals)
    && serialize(left.localPublishes) === serialize(right.localPublishes)
    && serialize(left.events) === serialize(right.events)
    && serialize(left.releaseRecords ?? []) === serialize(right.releaseRecords ?? [])
}

function consequentialRecordCount(workspace: WebsiteWorkspace) {
  return workspace.evidence.length + workspace.approvals.length + workspace.localPublishes.length + workspace.events.length
    + (workspace.releaseRecords ?? []).reduce((total, record) => total + record.revision, 0)
}

function isWebsiteReleaseStateEnvelope(value: unknown): value is WebsiteReleaseState {
  if (!isRecord(value) || !hasExactKeys(value, ['schema', 'scope', 'revision', 'headDigest', 'commands'])) return false
  if (value.schema !== WEBSITE_RELEASE_STATE_SCHEMA || !isText(value.scope, 180) || !isNonNegativeInteger(value.revision)) return false
  return typeof value.headDigest === 'string' && Array.isArray(value.commands)
    && value.commands.length === value.revision && value.commands.length <= 100
}

function hasSuffix<T>(next: T[], current: T[]) {
  if (next.length < current.length) return false
  return serialize(next.slice(next.length - current.length)) === serialize(current)
}

function hasUniqueIds(values: Array<{ id: string }>) {
  return hasUniqueStrings(values.map((value) => value.id))
}

function hasUniqueSectionIds(pages: Array<{ sections: Array<{ id: string }> }>) {
  return hasUniqueStrings(pages.flatMap((page) => page.sections.map((section) => section.id)))
}

function hasUniqueStrings(values: string[]) {
  return new Set(values).size === values.length
}

function sameStringSet(left: string[], right: string[]) {
  return left.length === right.length && left.every((value) => right.includes(value))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasExactKeys(value: Record<string, unknown>, keys: string[]) {
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  return actual.length === expected.length && actual.every((key, index) => key === expected[index])
}

function isText(value: unknown, max: number, allowBlank = false): value is string {
  return typeof value === 'string' && value.length <= max && (allowBlank || value.trim().length > 0)
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const parsed = new Date(value)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value
}

function isValidSlug(value: string) {
  return /^\/(?:[a-z0-9]+(?:-[a-z0-9]+)*\/?)*$/.test(value.trim())
}

function isValidDestination(value: string) {
  const destination = value.trim()
  return destination.startsWith('/') || destination.startsWith('#') || isSafeHttpsDestination(destination)
}

function isSafeHttpsDestination(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && Boolean(url.hostname) && !url.username && !url.password
  } catch {
    return false
  }
}

function serialize(value: unknown) {
  return JSON.stringify(value)
}
