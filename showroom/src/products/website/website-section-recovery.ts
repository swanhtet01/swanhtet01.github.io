import type { PageSection, WebsitePage } from './website-model.ts'

export type WebsiteRemovedContentSection = Readonly<{
  pageId: string
  section: PageSection
  index: number
  remainingSectionIds: readonly string[]
}>

export type WebsiteContentSectionRemoval =
  | Readonly<{ ok: true; sections: PageSection[]; removed: WebsiteRemovedContentSection }>
  | Readonly<{ ok: false; reason: 'invalid_page' | 'section_missing' }>

export type WebsiteContentSectionRecovery =
  | Readonly<{ ok: true; sections: PageSection[] }>
  | Readonly<{
      ok: false
      reason: 'already_present' | 'invalid_recovery' | 'page_changed' | 'sections_changed'
    }>

function validSection(value: unknown): value is PageSection {
  if (!value || typeof value !== 'object') return false
  const section = value as Partial<PageSection>
  return typeof section.id === 'string'
    && section.id.length > 0
    && section.id.length <= 120
    && section.id.trim() === section.id
    && typeof section.eyebrow === 'string'
    && section.eyebrow.length <= 60
    && typeof section.title === 'string'
    && section.title.length <= 120
    && typeof section.body === 'string'
    && section.body.length <= 360
}

function validPageIdentity(page: WebsitePage | undefined) {
  return Boolean(page
    && typeof page.id === 'string'
    && page.id.length > 0
    && page.id.length <= 120
    && page.id.trim() === page.id
    && Array.isArray(page.sections)
    && page.sections.every(validSection)
    && new Set(page.sections.map((section) => section.id)).size === page.sections.length)
}

function idsEqual(left: readonly string[], right: readonly string[]) {
  return left.length === right.length
    && left.every((value, index) => value === right[index])
}

export function removeWebsiteContentSection(
  page: WebsitePage,
  sectionId: string,
): WebsiteContentSectionRemoval {
  if (!validPageIdentity(page)
    || typeof sectionId !== 'string'
    || !sectionId
    || sectionId.trim() !== sectionId) return { ok: false, reason: 'invalid_page' }
  const index = page.sections.findIndex((section) => section.id === sectionId)
  if (index < 0) return { ok: false, reason: 'section_missing' }
  const section = page.sections[index]
  const sections = page.sections
    .filter((candidate) => candidate.id !== sectionId)
    .map((candidate) => ({ ...candidate }))
  return {
    ok: true,
    sections,
    removed: {
      pageId: page.id,
      section: { ...section },
      index,
      remainingSectionIds: sections.map((candidate) => candidate.id),
    },
  }
}

export function recoverWebsiteContentSection(
  page: WebsitePage,
  removed: WebsiteRemovedContentSection,
): WebsiteContentSectionRecovery {
  if (!validPageIdentity(page)
    || !removed
    || typeof removed.pageId !== 'string'
    || !validSection(removed.section)
    || !Number.isSafeInteger(removed.index)
    || removed.index < 0
    || !Array.isArray(removed.remainingSectionIds)
    || removed.remainingSectionIds.some((id) => typeof id !== 'string' || !id || id.trim() !== id)
    || new Set(removed.remainingSectionIds).size !== removed.remainingSectionIds.length
    || removed.index > removed.remainingSectionIds.length
    || removed.remainingSectionIds.includes(removed.section.id)) {
    return { ok: false, reason: 'invalid_recovery' }
  }
  if (page.id !== removed.pageId) return { ok: false, reason: 'page_changed' }
  if (page.sections.some((section) => section.id === removed.section.id)) {
    return { ok: false, reason: 'already_present' }
  }
  if (!idsEqual(page.sections.map((section) => section.id), removed.remainingSectionIds)) {
    return { ok: false, reason: 'sections_changed' }
  }
  const sections = page.sections.map((section) => ({ ...section }))
  sections.splice(removed.index, 0, { ...removed.section })
  return { ok: true, sections }
}
