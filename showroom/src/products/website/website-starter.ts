import {
  createInitialWorkspace,
  workspaceFingerprint,
  type WebsiteWorkspace,
} from './website-model.ts'

export const websiteStarterTemplates = [
  { id: 'business-presence', label: 'Business presence', detail: 'Home, About, and Contact for a clear company website.' },
  { id: 'lead-generation', label: 'Lead generation', detail: 'Home, Services, and Contact with a direct inquiry path.' },
  { id: 'catalog-showcase', label: 'Catalog showcase', detail: 'Home, Catalog, and Contact for products or packages.' },
] as const

export type WebsiteStarterTemplateId = (typeof websiteStarterTemplates)[number]['id']

export type WebsiteStarterBrief = {
  templateId: WebsiteStarterTemplateId
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

  if (!websiteStarterTemplates.some((template) => template.id === brief.templateId)) {
    issues.push({ field: 'templateId', message: 'Choose a supported website layout.' })
  }
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
  const secondary = workspace.pages.find((page) => page.slug.trim() === '/products')
  const contact = workspace.pages.find((page) => page.slug.trim() === '/contact')
  if (!home || home.sections.length < 2 || !secondary?.sections.length || !contact?.sections.length) return workspace

  const businessName = normalizedLine(brief.businessName)
  const audience = normalizedLine(brief.audience)
  const offer = normalizedLine(brief.offer)
  const proof = normalizedLine(brief.proof)
  const contactHref = normalizedLine(brief.contactHref)
  const secondaryPage = brief.templateId === 'business-presence'
    ? { name: 'About', slug: '/about', eyebrow: 'Our business', headline: `Why ${businessName} exists`, sectionEyebrow: 'How we work', sectionTitle: 'Clear service, clear next step.' }
    : brief.templateId === 'lead-generation'
      ? { name: 'Services', slug: '/services', eyebrow: 'Services', headline: `How ${businessName} can help`, sectionEyebrow: 'What to expect', sectionTitle: 'A simple path from inquiry to answer.' }
      : { name: 'Catalog', slug: '/catalog', eyebrow: 'Catalog', headline: `Explore ${businessName}`, sectionEyebrow: 'Products and packages', sectionTitle: 'Start with the right option.' }
  const contactDestination = contactHref || '/contact'
  const contactDescription = `Contact ${businessName} about ${offer}`.slice(0, 160).trim()

  return {
    ...workspace,
    siteName: businessName,
    selectedPageId: home.id,
    pages: [
      {
        ...home,
        internalName: 'Home',
        slug: '/',
        stage: 'draft' as const,
        navigation: { label: 'Home', visible: true },
        hero: {
          eyebrow: `For ${audience}`,
          headline: offer,
          summary: `${businessName} helps ${audience}.`,
          ctaLabel: `View ${secondaryPage.name.toLowerCase()}`,
          ctaHref: secondaryPage.slug,
        },
        sections: [
          { ...home.sections[0], eyebrow: 'Proof', title: `Why choose ${businessName}?`, body: proof },
          { ...home.sections[1], eyebrow: 'Next step', title: 'Know what happens before you contact us.', body: `Review our ${secondaryPage.name.toLowerCase()}, then use one clear contact route when you are ready.` },
        ],
        seo: { title: `${businessName} | Home`, description: offer },
        updatedAt: capturedAt,
      },
      {
        ...secondary,
        internalName: secondaryPage.name,
        slug: secondaryPage.slug,
        stage: 'draft' as const,
        navigation: { label: secondaryPage.name, visible: true },
        hero: {
          eyebrow: secondaryPage.eyebrow,
          headline: secondaryPage.headline,
          summary: offer,
          ctaLabel: 'Contact us',
          ctaHref: contactDestination,
        },
        sections: [{ ...secondary.sections[0], eyebrow: secondaryPage.sectionEyebrow, title: secondaryPage.sectionTitle, body: proof }],
        seo: { title: `${secondaryPage.name} | ${businessName}`, description: offer },
        updatedAt: capturedAt,
      },
      {
        ...contact,
        internalName: 'Contact',
        slug: '/contact',
        stage: 'draft' as const,
        navigation: { label: 'Contact', visible: true },
        hero: {
          eyebrow: 'Contact',
          headline: `Talk to ${businessName}`,
          summary: `Tell us what you need and when you need it. ${businessName} will review the request before making a promise.`,
          ctaLabel: contactHref ? 'Open contact channel' : '',
          ctaHref: contactHref,
        },
        sections: [{ ...contact.sections[0], eyebrow: 'Before you send', title: 'Share the need, quantity, location, and timing.', body: `This page is for ${audience}. Contact details and claims still require owner review before release.` }],
        seo: { title: `Contact | ${businessName}`, description: contactDescription },
        updatedAt: capturedAt,
      },
    ],
  }
}
