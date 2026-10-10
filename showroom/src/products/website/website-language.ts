import type { WebsiteArtifactPage } from './website-model'

export function websiteDocumentLanguage(siteName: string, pages: WebsiteArtifactPage[]) {
  const readable = [siteName, ...pages.flatMap(page => [page.navigation.label, page.hero.eyebrow,
    page.hero.headline, page.hero.summary, page.seo.title, page.seo.description,
    ...page.sections.flatMap(section => [section.eyebrow, section.title, section.body])])].join(' ')
  const letters = readable.match(/\p{L}/gu) ?? []
  const myanmar = letters.filter(letter => /[\u1000-\u109f\ua9e0-\ua9ff\uaa60-\uaa7f]/u.test(letter)).length
  return letters.length && myanmar / letters.length > 0.5 ? 'my' : 'en'
}
