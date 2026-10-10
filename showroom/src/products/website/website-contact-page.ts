// Apply to the pages included in the current view or approved artifact.
// Preserve the managed publisher's contact-slug / first-page fallback policy.
export function websiteContactPage<T extends { id: string; slug: string }>(pages: readonly T[], preferredId?: string): T | undefined {
  return pages.find(page => page.id === preferredId)
    ?? pages.find(page => /contact/i.test(page.slug)) ?? pages[0]
}
