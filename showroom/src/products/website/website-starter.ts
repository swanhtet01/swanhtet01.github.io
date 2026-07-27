import {
  createInitialWorkspace,
  workspaceFingerprint,
  type WebsiteWorkspace,
} from './website-model.ts'

export type WebsiteStarterBrief = {
  businessName: string
  audience: string
  offer: string
  proof: string
  contactHref: string
}

export type WebsiteStarterBriefIssue = {
  field: keyof WebsiteStarterBrief
  message: string
}

function normalizedLine(value: string) {
  return value.trim().replace(/\s+/gu, ' ')
}

function hasControlCharacters(value: string) {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0
    return codePoint <= 31 || codePoint === 127
  })
}

function isBoundedLine(value: string, maxLength: number) {
  const normalized = normalizedLine(value)
  return normalized.length > 0
    && normalized.length <= maxLength
    && !hasControlCharacters(normalized)
}

function isSafeHttpsDestination(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && Boolean(url.hostname) && !url.username && !url.password
  } catch {
    return false
  }
}

function isCanonicalTimestamp(value: string) {
  const parsed = new Date(value)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value
}

export function websiteStarterBriefIssues(brief: WebsiteStarterBrief) {
  const issues: WebsiteStarterBriefIssue[] = []
  const contactHref = normalizedLine(brief.contactHref)

  if (!isBoundedLine(brief.businessName, 50)) {
    issues.push({ field: 'businessName', message: 'Add a business name of 50 characters or fewer.' })
  }
  if (!isBoundedLine(brief.audience, 70)) {
    issues.push({ field: 'audience', message: 'Describe the customer in 70 characters or fewer.' })
  }
  if (!isBoundedLine(brief.offer, 140)) {
    issues.push({ field: 'offer', message: 'Describe the main offer in 140 characters or fewer.' })
  }
  if (!isBoundedLine(brief.proof, 360)) {
    issues.push({ field: 'proof', message: 'Add one supportable fact in 360 characters or fewer.' })
  }
  if (contactHref && (contactHref.length > 160 || !isSafeHttpsDestination(contactHref))) {
    issues.push({ field: 'contactHref', message: 'Use a complete HTTPS contact link or leave it blank.' })
  }

  return issues
}

export function isUntouchedWebsiteStarter(workspace: WebsiteWorkspace) {
  const starter = createInitialWorkspace()
  return workspace.contentRevision === 0
    && workspace.evidence.length === 0
    && workspace.approvals.length === 0
    && workspace.localPublishes.length === 0
    && workspace.events.length === 0
    && workspaceFingerprint(workspace) === workspaceFingerprint(starter)
}

export function applyWebsiteStarterBrief(
  workspace: WebsiteWorkspace,
  brief: WebsiteStarterBrief,
  capturedAt: string,
) {
  if (!isUntouchedWebsiteStarter(workspace)
    || websiteStarterBriefIssues(brief).length > 0
    || !isCanonicalTimestamp(capturedAt)) return workspace

  const home = workspace.pages.find((page) => page.slug.trim() === '/')
  if (!home || home.sections.length === 0) return workspace

  const businessName = normalizedLine(brief.businessName)
  const audience = normalizedLine(brief.audience)
  const offer = normalizedLine(brief.offer)
  const proof = normalizedLine(brief.proof)
  const contactHref = normalizedLine(brief.contactHref)

  return {
    ...workspace,
    siteName: businessName,
    selectedPageId: home.id,
    pages: [{
      ...home,
      internalName: 'Home',
      slug: '/',
      stage: 'draft' as const,
      navigation: { label: 'Home', visible: true },
      hero: {
        eyebrow: `For ${audience}`,
        headline: offer,
        summary: `${businessName} · ${audience}`,
        ctaLabel: contactHref ? 'Contact us' : '',
        ctaHref: contactHref,
      },
      sections: [{
        id: home.sections[0].id,
        eyebrow: 'Proof',
        title: `Why choose ${businessName}?`,
        body: proof,
      }],
      seo: {
        title: `${businessName} | Home`,
        description: offer,
      },
      updatedAt: capturedAt,
    }],
  }
}
