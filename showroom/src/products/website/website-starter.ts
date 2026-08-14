import {
  createInitialWorkspace,
  loadWebsiteWorkspace,
  mutateWebsiteWorkspace,
  websiteEditSessionStorageKey,
  WEBSITE_LOCAL_EDIT_SESSION_SCOPES,
  workspaceFingerprint,
  type WebsiteLockManager,
  type WebsiteStorage,
  type WebsiteWorkspace,
} from './website-model.ts'
import { readStoredWebsiteLeads, websiteInboxLeads } from './website-leads.ts'

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

export type WebsiteWorkingSampleInput = {
  templateId: WebsiteStarterTemplateId
  businessName: string
  capturedAt: string
}

export type WebsiteWorkingSampleActivationResult =
  | { ok: true; status: 'installed' | 'current'; workspace: WebsiteWorkspace }
  | { ok: false; error: string }

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
  if (!isBoundedLine(brief.businessName, 60)) {
    issues.push({ field: 'businessName', message: 'Add a business name of 60 characters or fewer.' })
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

// A search engine shows this text verbatim under the link, so a cut mid-word is read by every
// visitor who has not clicked yet. Cutting at 160 with slice() alone produced descriptions
// ending "...items families buy most k" for three of the seven trade drafts once the business
// name was long -- measured by rendering the site, not guessed at.
//
// Cuts at the last word boundary and drops any punctuation left dangling at the end. Falls
// back to a hard cut only when there is no space to break on, which means a single 160+
// character word.
function boundedSeoDescription(value: string, maximum = 160) {
  const normalized = normalizedLine(value)
  if (normalized.length <= maximum) return normalized
  const clipped = normalized.slice(0, maximum)
  const lastSpace = clipped.lastIndexOf(' ')
  const trimmed = lastSpace > 0 ? clipped.slice(0, lastSpace) : clipped
  return trimmed.replace(/[\s,;:.–—-]+$/u, '')
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
  const secondary = workspace.pages.find((page) => page.id === 'page-products')
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
  const contactDescription = boundedSeoDescription(`Contact ${businessName} about ${offer}`)

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

function websiteWorkingSampleBrief(input: WebsiteWorkingSampleInput): WebsiteStarterBrief {
  const businessName = normalizedLine(input.businessName)
  if (input.templateId === 'lead-generation') {
    return {
      templateId: input.templateId,
      businessName,
      audience: 'customers ready to ask for help or a quote',
      offer: `Tell ${businessName} what you need and get one clear next step.`,
      proof: 'Demo proof placeholder: replace this with one approved result, credential, or customer fact before release.',
      contactHref: '',
    }
  }
  if (input.templateId === 'catalog-showcase') {
    return {
      templateId: input.templateId,
      businessName,
      audience: 'customers comparing products or packages',
      offer: `Explore what ${businessName} offers and ask about the right option.`,
      proof: 'Demo catalog placeholder: replace this with approved products, buying details, and availability before release.',
      contactHref: '',
    }
  }
  return {
    templateId: 'business-presence',
    businessName,
    audience: 'customers looking for clear company information',
    offer: `Meet ${businessName} and understand the easiest way to get help.`,
    proof: 'Demo company placeholder: replace this with one approved fact about the business before release.',
    contactHref: '',
  }
}

function replaceableWebsiteWorkingSample(workspace: WebsiteWorkspace) {
  if (isUntouchedWebsiteStarter(workspace)) return true
  const marker = workspace.workingSample
  const releaseRecords = workspace.releaseRecords ?? []
  const workspaceLeads = workspace.leadLedger
  return Boolean(marker
    && marker.contentFingerprint === workspaceFingerprint(workspace)
    && workspace.evidence.length === 0
    && workspace.approvals.length === 0
    && workspace.localPublishes.length === 0
    && workspace.events.length === 0
    && releaseRecords.every((record) => record.revision === 0)
    && (!workspaceLeads || (workspaceLeads.revision === 0 && workspaceLeads.leads.length === 0)))
}

export function installWebsiteWorkingSample(workspace: WebsiteWorkspace, input: WebsiteWorkingSampleInput) {
  const brief = websiteWorkingSampleBrief(input)
  if (websiteStarterBriefIssues(brief).length > 0 || !isCanonicalTimestamp(input.capturedAt)) return null
  const seed = createInitialWorkspace()
  const preparedDraft = applyWebsiteStarterBrief(seed, brief, input.capturedAt)
  if (preparedDraft === seed) return null
  const prepared = {
    ...preparedDraft,
    pages: preparedDraft.pages.map((page) => ({ ...page, stage: 'ready' as const })),
  }
  const contentFingerprint = workspaceFingerprint(prepared)
  if (workspace.workingSample?.templateId === input.templateId
    && workspace.workingSample.contentFingerprint === contentFingerprint
    && workspaceFingerprint(workspace) === contentFingerprint) return workspace
  if (!replaceableWebsiteWorkingSample(workspace)) return null
  return {
    ...prepared,
    revision: workspace.revision,
    contentRevision: workspace.contentRevision,
    ...(workspace.releaseRecords ? { releaseRecords: workspace.releaseRecords } : {}),
    ...(workspace.leadLedger ? { leadLedger: workspace.leadLedger } : {}),
    workingSample: {
      contract: 'supermega.website.working-sample.v1' as const,
      templateId: input.templateId,
      contentFingerprint,
      installedAt: input.capturedAt,
    },
  }
}

// `sessions` is where the builder holds an unsaved preview: sessionStorage, under the scoped key
// websiteEditSessionStorageKey(scope). This guard used to read the bare WEBSITE_EDIT_SESSION_KEY
// out of `storage` (localStorage) -- a different medium AND a different key shape from what
// WebsiteProduct writes -- so it never once fired, and running onboarding replaced page copy the
// owner had typed but not yet saved. The shared key builder is imported from the model now, and
// both device-local scopes are checked because the workspace being replaced here is the local one.
export async function activateLocalWebsiteWorkingSample(
  input: WebsiteWorkingSampleInput,
  storage: WebsiteStorage | undefined = globalThis.localStorage,
  locks: WebsiteLockManager | undefined = globalThis.navigator?.locks as WebsiteLockManager | undefined,
  sessions: Pick<WebsiteStorage, 'getItem'> | undefined = globalThis.sessionStorage,
): Promise<WebsiteWorkingSampleActivationResult> {
  if (!storage) return { ok: false, error: 'Browser storage is unavailable.' }
  const loaded = loadWebsiteWorkspace(storage)
  if (!loaded.ok) return loaded
  const storedLeads = readStoredWebsiteLeads(storage, 'the sample can change')
  if (!storedLeads.ok) return storedLeads
  const unsavedPreviewHeld = sessions !== undefined && WEBSITE_LOCAL_EDIT_SESSION_SCOPES.some((scope) => {
    try {
      return sessions.getItem(websiteEditSessionStorageKey(scope)) !== null
    } catch {
      // An unreadable preview store is treated as holding a preview: refusing costs the owner one
      // retry, guessing wrong costs them the copy they typed.
      return true
    }
  })
  let installed: WebsiteWorkspace | null = null
  const mutation = await mutateWebsiteWorkspace((current) => {
    installed = installWebsiteWorkingSample(current, input)
    if (!installed) throw new Error('Existing Website edits or release evidence were preserved.')
    // Inquiries are keyed to this device's ledger, not to the site's display name. Checking the
    // name here meant a renamed site looked lead-free and its customers' details were handed to
    // whatever business onboarding installed next.
    if (installed !== current
      && (unsavedPreviewHeld || websiteInboxLeads(storedLeads.ledger).length > 0)) {
      throw new Error('Unsaved Website edits or inquiries were preserved.')
    }
    return installed
  }, loaded.workspace.revision, loaded.workspace.contentRevision, storage, locks)
  if (!mutation.ok) return mutation
  return { ok: true, status: mutation.changed ? 'installed' : 'current', workspace: mutation.workspace }
}
