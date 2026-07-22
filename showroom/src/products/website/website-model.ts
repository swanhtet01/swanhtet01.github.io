export const WEBSITE_STORAGE_KEY = 'supermega.website.workspace.v1'
export const MAX_WEBSITE_PAGES = 4
export const MAX_WEBSITE_SECTIONS = 4

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

export type PublishEvidence = {
  id: string
  kind: EvidenceKind
  finding: string
  reference: string
  verifiedBy: string
  verifiedAt: string
  fingerprint: string
}

export type PublishApproval = {
  id: string
  reviewer: string
  note: string
  approvedAt: string
  fingerprint: string
}

export type LocalPublishRecord = {
  id: string
  recordedAt: string
  recordedBy: string
  fingerprint: string
  readyPageIds: string[]
}

export type WebsiteWorkspace = {
  version: 1
  siteName: string
  pages: WebsitePage[]
  selectedPageId: string
  evidence: PublishEvidence[]
  approval: PublishApproval | null
  localPublishes: LocalPublishRecord[]
}

export type ReadinessCheck = {
  id: string
  label: string
  detail: string
  passed: boolean
}

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
  const createdAt = now()

  return {
    version: 1,
    siteName: 'SuperMega',
    selectedPageId: 'page-home',
    evidence: [],
    approval: null,
    localPublishes: [],
    pages: [
      {
        id: 'page-home',
        internalName: 'Home',
        slug: '/',
        stage: 'ready',
        navigation: { label: 'Home', visible: true },
        hero: {
          eyebrow: 'Company operating system',
          headline: 'Turn accountable work into visible progress.',
          summary: 'SuperMega gives teams one compact place to operate, review evidence, and keep consequential actions under human control.',
          ctaLabel: 'Explore products',
          ctaHref: '/products',
        },
        sections: [
          {
            id: 'section-home-control',
            eyebrow: 'Control',
            title: 'Software that shows its work.',
            body: 'Every important change keeps its owner, source, current state, and approval boundary close to the record.',
          },
          {
            id: 'section-home-local',
            eyebrow: 'Local first',
            title: 'Useful before it is connected.',
            body: 'Start with a bounded browser workspace, then connect identity, data, and deployment only when those controls are ready.',
          },
        ],
        seo: {
          title: 'SuperMega | Accountable company software',
          description: 'Compact operating software for teams that need evidence, clear ownership, and human approval.',
        },
        updatedAt: createdAt,
      },
      {
        id: 'page-products',
        internalName: 'Products',
        slug: '/products',
        stage: 'ready',
        navigation: { label: 'Products', visible: true },
        hero: {
          eyebrow: 'Products',
          headline: 'Focused workspaces for the work that matters.',
          summary: 'Run commerce, production, team delivery, and publishing from compact tools with explicit operational boundaries.',
          ctaLabel: 'Talk to us',
          ctaHref: '/contact',
        },
        sections: [
          {
            id: 'section-products-workspaces',
            eyebrow: 'Workspaces',
            title: 'Purpose-built, not page-built.',
            body: 'Each product starts with the records, decisions, and evidence its operators actually need.',
          },
        ],
        seo: {
          title: 'Products | SuperMega',
          description: 'Explore SuperMega workspaces for accountable commerce, production, team delivery, and websites.',
        },
        updatedAt: createdAt,
      },
      {
        id: 'page-contact',
        internalName: 'Contact',
        slug: '/contact',
        stage: 'ready',
        navigation: { label: 'Contact', visible: true },
        hero: {
          eyebrow: 'Start a conversation',
          headline: 'Bring one real workflow.',
          summary: 'We will map the record, the accountable owner, the evidence needed, and the actions that must remain human-controlled.',
          ctaLabel: 'Email SuperMega',
          ctaHref: 'https://supermega.dev',
        },
        sections: [
          {
            id: 'section-contact-scope',
            eyebrow: 'First step',
            title: 'Begin with a bounded outcome.',
            body: 'A useful pilot has one owner, one operating surface, a measurable acceptance condition, and no hidden production access.',
          },
        ],
        seo: {
          title: 'Contact | SuperMega',
          description: 'Start a bounded SuperMega pilot with a real workflow, evidence requirements, and clear authority.',
        },
        updatedAt: createdAt,
      },
    ],
  }
}

export function createBlankPage(sequence: number): WebsitePage {
  return {
    id: createId('page'),
    internalName: 'Untitled page',
    slug: '/untitled-' + sequence,
    stage: 'draft',
    navigation: { label: 'Untitled', visible: false },
    hero: {
      eyebrow: '',
      headline: '',
      summary: '',
      ctaLabel: '',
      ctaHref: '',
    },
    sections: [],
    seo: {
      title: '',
      description: '',
    },
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
    navigation: {
      ...page.navigation,
      label: page.navigation.label + ' copy',
      visible: false,
    },
    sections: page.sections.map((section) => ({ ...section, id: createId('section') })),
    updatedAt: now(),
  }
}

export function createBlankSection(): PageSection {
  return {
    id: createId('section'),
    eyebrow: '',
    title: '',
    body: '',
  }
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
  const source = JSON.stringify(publishableState)
  let hash = 2166136261

  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return 'web-' + (hash >>> 0).toString(16).padStart(8, '0')
}

export function readinessChecks(workspace: WebsiteWorkspace, fingerprint: string): ReadinessCheck[] {
  const readyPages = workspace.pages.filter((page) => page.stage === 'ready')
  const normalizedSlugs = readyPages.map((page) => normalizeSlug(page.slug))
  const uniqueSlugs = new Set(normalizedSlugs)
  const visibleNavigation = workspace.pages.filter((page) => page.navigation.visible)
  const completePages = readyPages.filter((page) => pageIssues(page).length === 0)
  const currentEvidenceKinds = new Set(
    workspace.evidence
      .filter((entry) => entry.fingerprint === fingerprint)
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
    ...evidenceRequirements.map((requirement) => ({
      id: 'evidence-' + requirement.id,
      label: requirement.label,
      detail: currentEvidenceKinds.has(requirement.id)
        ? 'Verified evidence is attached to ' + fingerprint + '.'
        : requirement.detail,
      passed: currentEvidenceKinds.has(requirement.id),
    })),
  ]
}

export function isCurrentApproval(approval: PublishApproval | null, fingerprint: string) {
  return approval?.fingerprint === fingerprint
}

export function isCurrentPublish(record: LocalPublishRecord | undefined, fingerprint: string) {
  return record?.fingerprint === fingerprint
}

export function normalizeSlug(value: string) {
  const trimmed = value.trim()
  if (trimmed === '/') return '/'
  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed
}

export function formatTimestamp(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Unknown time'
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

function isValidSlug(value: string) {
  return /^\/(?:[a-z0-9]+(?:-[a-z0-9]+)*\/?)*$/.test(value.trim())
}

function isValidDestination(value: string) {
  const destination = value.trim()
  return destination.startsWith('/')
    || destination.startsWith('#')
    || destination.startsWith('https://')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isWebsitePage(value: unknown): value is WebsitePage {
  if (!isRecord(value) || !isRecord(value.navigation) || !isRecord(value.hero) || !isRecord(value.seo)) return false
  return typeof value.id === 'string'
    && typeof value.internalName === 'string'
    && typeof value.slug === 'string'
    && (value.stage === 'draft' || value.stage === 'ready')
    && typeof value.navigation.label === 'string'
    && typeof value.navigation.visible === 'boolean'
    && typeof value.hero.eyebrow === 'string'
    && typeof value.hero.headline === 'string'
    && typeof value.hero.summary === 'string'
    && typeof value.hero.ctaLabel === 'string'
    && typeof value.hero.ctaHref === 'string'
    && Array.isArray(value.sections)
    && value.sections.every((section) => isRecord(section)
      && typeof section.id === 'string'
      && typeof section.eyebrow === 'string'
      && typeof section.title === 'string'
      && typeof section.body === 'string')
    && typeof value.seo.title === 'string'
    && typeof value.seo.description === 'string'
    && typeof value.updatedAt === 'string'
}

function isPublishEvidence(value: unknown): value is PublishEvidence {
  return isRecord(value)
    && typeof value.id === 'string'
    && evidenceRequirements.some((requirement) => requirement.id === value.kind)
    && typeof value.finding === 'string'
    && typeof value.reference === 'string'
    && typeof value.verifiedBy === 'string'
    && typeof value.verifiedAt === 'string'
    && typeof value.fingerprint === 'string'
}

function isPublishApproval(value: unknown): value is PublishApproval {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.reviewer === 'string'
    && typeof value.note === 'string'
    && typeof value.approvedAt === 'string'
    && typeof value.fingerprint === 'string'
}

function isLocalPublishRecord(value: unknown): value is LocalPublishRecord {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.recordedAt === 'string'
    && typeof value.recordedBy === 'string'
    && typeof value.fingerprint === 'string'
    && Array.isArray(value.readyPageIds)
    && value.readyPageIds.every((id) => typeof id === 'string')
}

export function restoreWorkspace(value: unknown): WebsiteWorkspace {
  const seed = createInitialWorkspace()
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.pages)) return seed

  const pages = value.pages.filter(isWebsitePage).slice(0, MAX_WEBSITE_PAGES).map((page) => ({
    ...page,
    sections: page.sections.slice(0, MAX_WEBSITE_SECTIONS),
  }))
  if (!pages.length) return seed

  const selectedPageId = typeof value.selectedPageId === 'string'
    && pages.some((page) => page.id === value.selectedPageId)
    ? value.selectedPageId
    : pages[0].id

  return {
    version: 1,
    siteName: typeof value.siteName === 'string' ? value.siteName : seed.siteName,
    pages,
    selectedPageId,
    evidence: Array.isArray(value.evidence) ? value.evidence.filter(isPublishEvidence).slice(0, 24) : [],
    approval: isPublishApproval(value.approval) ? value.approval : null,
    localPublishes: Array.isArray(value.localPublishes)
      ? value.localPublishes.filter(isLocalPublishRecord).slice(0, 5)
      : [],
  }
}
