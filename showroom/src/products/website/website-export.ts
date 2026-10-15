import { WEBSITE_PUBLIC_CSS } from './website-presentation.ts'
import { websiteDocumentLanguage } from './website-language.ts'
import { websiteContactPage } from './website-contact-page.ts'
import { isWebsiteImage, type WebsiteImage } from './website-media.ts'
import { type WebsiteArtifact } from './website-model.ts'

export const WEBSITE_HTML_MIME_TYPE = 'text/html;charset=utf-8' as const

export type WebsiteExportIssue = Readonly<{
  path: string
  message: string
}>

export type WebsiteHtmlDownload = Readonly<{
  filename: string
  mimeType: typeof WEBSITE_HTML_MIME_TYPE
  content: string
}>

type PageTarget = Readonly<{
  anchor: string
  slug: string
}>

type SafeDestination = Readonly<{
  external: boolean
  href: string
}>

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

const RESERVED_FILENAMES = new Set([
  'aux',
  'com1',
  'com2',
  'com3',
  'com4',
  'com5',
  'com6',
  'com7',
  'com8',
  'com9',
  'con',
  'lpt1',
  'lpt2',
  'lpt3',
  'lpt4',
  'lpt5',
  'lpt6',
  'lpt7',
  'lpt8',
  'lpt9',
  'nul',
  'prn',
])

export function sanitizeWebsiteFilename(siteName: string): string {
  const stem = siteName
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Mark}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
  const boundedStem = [...stem].slice(0, 64).join('')
  const safeStem = !boundedStem || RESERVED_FILENAMES.has(boundedStem) ? 'website' : boundedStem
  return `${safeStem}.html`
}

export function validateWebsiteArtifactForExport(artifact: WebsiteArtifact): WebsiteExportIssue[] {
  const issues: WebsiteExportIssue[] = []
  const siteName = artifact.siteName.trim()
  const targets = createPageTargets(artifact)
  const slugs = targets.map((target) => target.slug)
  const visiblePages = artifact.pages.filter((page) => page.navigation.visible)

  if (!siteName) {
    issues.push({ path: 'siteName', message: 'Add a site name.' })
  }
  if (!artifact.pages.length) {
    issues.push({ path: 'pages', message: 'Include at least one ready page.' })
  }
  if (slugs.filter((slug) => slug === '/').length !== 1) {
    issues.push({ path: 'pages', message: 'Include exactly one ready home page at /.' })
  }
  if (new Set(slugs).size !== slugs.length) {
    issues.push({ path: 'pages', message: 'Ready page paths must be unique.' })
  }
  if (!visiblePages.length) {
    issues.push({ path: 'pages.navigation', message: 'Show at least one ready page in navigation.' })
  }

  artifact.pages.forEach((page, pageIndex) => {
    const path = `pages[${pageIndex}]`
    const ctaLabel = page.hero.ctaLabel.trim()
    const ctaHref = page.hero.ctaHref.trim()

    if (!isValidPageSlug(page.slug)) {
      issues.push({ path: `${path}.slug`, message: 'Use a safe local path such as / or /about.' })
    }
    if (page.navigation.visible && !page.navigation.label.trim()) {
      issues.push({ path: `${path}.navigation.label`, message: 'Visible navigation needs a label.' })
    }
    if (!page.hero.headline.trim()) {
      issues.push({ path: `${path}.hero.headline`, message: 'Add a hero headline.' })
    }
    if (!page.hero.summary.trim()) {
      issues.push({ path: `${path}.hero.summary`, message: 'Add a hero summary.' })
    }
    if (Boolean(ctaLabel) !== Boolean(ctaHref)) {
      issues.push({ path: `${path}.hero`, message: 'Complete both CTA fields or leave both empty.' })
    } else if (ctaHref && !resolveSafeDestination(ctaHref, targets)) {
      issues.push({
        path: `${path}.hero.ctaHref`,
        message: 'CTA destinations must be a ready page, a valid page anchor, or an HTTPS URL.',
      })
    }
    if (!page.sections.length) {
      issues.push({ path: `${path}.sections`, message: 'Add at least one content section.' })
    }
    if (page.hero.image !== undefined && !isWebsiteImage(page.hero.image)) {
      issues.push({ path: `${path}.hero.image`, message: 'Use a public HTTPS image and its description.' })
    }
    page.sections.forEach((section, sectionIndex) => {
      if (section.image !== undefined && !isWebsiteImage(section.image)) {
        issues.push({ path: `${path}.sections[${sectionIndex}].image`, message: 'Use a public HTTPS image and its description.' })
      }
      if (!section.title.trim()) {
        issues.push({ path: `${path}.sections[${sectionIndex}].title`, message: 'Add a section title.' })
      }
      if (!section.body.trim()) {
        issues.push({ path: `${path}.sections[${sectionIndex}].body`, message: 'Add section copy.' })
      }
    })
    if (!page.seo.title.trim()) {
      issues.push({ path: `${path}.seo.title`, message: 'Add an SEO title.' })
    }
    if (!page.seo.description.trim()) {
      issues.push({ path: `${path}.seo.description`, message: 'Add an SEO description.' })
    }
  })

  return issues
}

export function buildWebsiteHtml(artifact: WebsiteArtifact, privateImages: ReadonlyMap<string, string> = new Map()): string {
  const issues = validateWebsiteArtifactForExport(artifact)
  if (issues.length) {
    throw new Error(`Website artifact is not exportable: ${issues.map((issue) => `${issue.path}: ${issue.message}`).join(' ')}`)
  }

  const targets = createPageTargets(artifact)
  const homeIndex = targets.findIndex((target) => target.slug === '/')
  const homePage = artifact.pages[homeIndex]
  const homeTarget = targets[homeIndex]
  if (!homePage || !homeTarget) {
    throw new Error('Website artifact is not exportable: a home page is required.')
  }

  const siteName = cleanText(artifact.siteName)
  const inquiryPage = websiteContactPage(artifact.pages) ?? homePage
  const inquiryTarget = targets.find(target => target.slug === inquiryPage.slug) ?? homeTarget
  const skipLinks = targets.map((target) => (
    `  <a class="skip-link" data-home="${target.slug === '/'}" data-page="${target.anchor}" href="#${target.anchor}">Skip to content</a>`
  )).join('\n')
  const activeSkipStyles = targets.map((target) => (
    `      body:has(.site-page[id="${target.anchor}"]:target) .skip-link[data-page="${target.anchor}"] { display: block; }`
  )).join('\n')
  const activeNavStyles = targets.map(target => (
    `  body:has(.site-page[id="${target.anchor}"]:target) .site-nav a[href="#${target.anchor}"] { background: #eeedff; color: #4338ca; }`
  )).join('\n')
  const navigation = artifact.pages
    .map((page, index) => ({ page, target: targets[index] }))
    .filter((entry): entry is { page: WebsiteArtifact['pages'][number]; target: PageTarget } => (
      Boolean(entry.target) && entry.page.navigation.visible
    ))
    .map(({ page, target }) => (
      `          <a href="#${target.anchor}">${escapeHtml(cleanText(page.navigation.label))}</a>`
    ))
    .join('\n')
  const pages = artifact.pages
    .map((page, index) => renderPage(page, targets[index] as PageTarget, targets, privateImages, page.id === inquiryPage.id, siteName))
    .join('\n')

  const documentLanguage = websiteDocumentLanguage(siteName, artifact.pages)

  return `<!doctype html>
<html lang="${documentLanguage}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; object-src 'none'">
  <meta name="color-scheme" content="light">
  <meta name="referrer" content="no-referrer">
  <meta name="robots" content="index,follow">
  <title>${escapeHtml(cleanText(homePage.seo.title))}</title>
  <meta name="description" content="${escapeHtml(cleanText(homePage.seo.description))}">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${escapeHtml(cleanText(homePage.seo.title))}">
  <meta property="og:description" content="${escapeHtml(cleanText(homePage.seo.description))}">
  <style>
${WEBSITE_PUBLIC_CSS}
/* Navigation for a portable, script-free single-file website. */
.sm-site .site-page + .site-page { margin-top: 32px; }
.sm-site .skip-link { display: none; }
.sm-site .skip-link[data-home="true"] { display: block; }
@supports selector(main:has(.site-page:target)) {
  .sm-site .skip-link[data-home="true"] { display: none; }
  body:not(:has(.site-page:target)) .skip-link[data-home="true"] { display: block; }
${activeSkipStyles}
${activeNavStyles}
  body:not(:has(.site-page:target)) .site-nav a[href="#${homeTarget.anchor}"] { background: #eeedff; color: #4338ca; }
  .sm-site .site-page { display: none; }
  .sm-site .site-page:target { display: block; }
  .sm-site .site-main:not(:has(.site-page:target)) .site-page[data-home="true"] { display: block; }
}
  </style>
</head>
<body class="sm-site">
${skipLinks}
  <header class="site-header">
    <div class="site-header-inner">
      <a class="site-name" href="#${homeTarget.anchor}">${escapeHtml(siteName)}</a>
      <nav class="site-nav" aria-label="Primary navigation">
${navigation}
      </nav>
    </div>
  </header>
  <main class="site-main" id="content" tabindex="-1">
${pages}
  </main>
  <footer class="site-footer">
    <span>${escapeHtml(siteName)}</span>
    <a href="#${inquiryTarget.anchor}">Contact us</a>
  </footer>
</body>
</html>
`
}

export function createWebsiteHtmlDownload(artifact: WebsiteArtifact, privateImages?: ReadonlyMap<string, string>): WebsiteHtmlDownload {
  return {
    filename: sanitizeWebsiteFilename(artifact.siteName),
    mimeType: WEBSITE_HTML_MIME_TYPE,
    content: buildWebsiteHtml(artifact, privateImages),
  }
}

function renderPage(
  page: WebsiteArtifact['pages'][number],
  target: PageTarget,
  targets: PageTarget[],
  privateImages: ReadonlyMap<string, string>,
  isInquiryPage: boolean,
  siteName: string,
) {
  const eyebrow = cleanText(page.hero.eyebrow)
  const destination = resolveSafeDestination(page.hero.ctaHref, targets)
  const cta = page.hero.ctaLabel.trim() && destination
    ? renderCta(cleanText(page.hero.ctaLabel), destination)
    : ''
  const sections = page.sections.map((section, sectionIndex) => {
    const headingId = `${target.anchor}-section-${sectionIndex + 1}`
    const sectionEyebrow = cleanText(section.eyebrow)
    return `      <section class="content-section${section.image ? ' has-image' : ''}" aria-labelledby="${headingId}">
${renderImage(section.image, privateImages)}
<div class="section-copy">
${sectionEyebrow ? `        <p class="eyebrow">${escapeHtml(sectionEyebrow)}</p>\n` : ''}        <h2 id="${headingId}">${escapeHtml(cleanText(section.title))}</h2>
        <p>${escapeHtml(cleanText(section.body))}</p></div>
      </section>`
  }).join('\n')

  return `    <article class="site-page" id="${target.anchor}" data-home="${target.slug === '/'}" itemscope itemtype="https://schema.org/WebPage" tabindex="-1">
      <meta itemprop="name" content="${escapeHtml(cleanText(page.seo.title))}">
      <meta itemprop="description" content="${escapeHtml(cleanText(page.seo.description))}">
      <section class="hero" aria-labelledby="${target.anchor}-title">
${renderImage(page.hero.image, privateImages, true)}
${eyebrow ? `        <p class="eyebrow">${escapeHtml(eyebrow)}</p>\n` : ''}        <h1 id="${target.anchor}-title">${escapeHtml(cleanText(page.hero.headline))}</h1>
        <p class="summary">${escapeHtml(cleanText(page.hero.summary))}</p>
${cta}
      </section>
      <div class="section-grid">
${sections}
      </div>
${isInquiryPage ? `<section class="inquiry-section"><h2>Get in touch</h2><form class="inquiry-form" aria-label="Offline contact form">
<fieldset disabled><label>Name<input autocomplete="name" maxlength="80"></label><label>Email or phone<input autocomplete="email" maxlength="120"></label><label>Message<textarea rows="4" maxlength="500"></textarea></label><label class="consent"><input type="checkbox"><span>I agree to share these details with ${escapeHtml(siteName)} so they can respond.</span></label></fieldset>
<button type="button" disabled>Send message</button><p class="inquiry-status">Downloaded copy. Publish through Sites to receive messages in your inbox.</p></form></section>` : ''}
    </article>`
}

function renderImage(image: WebsiteImage | undefined, privateImages: ReadonlyMap<string, string>, priority = false) {
  if (!image) return ''
  const src = 'src' in image ? image.src : privateImages.get(image.assetId)
  if (!src || ('assetId' in image && !/^data:image\/webp;base64,[A-Za-z0-9+/]+={0,2}$/.test(src))) {
    throw new Error('A saved photo could not be included. Sign in to its workspace and try again.')
  }
  return `        <img class="content-image" src="${escapeHtml(src)}" alt="${escapeHtml(image.alt)}" loading="${priority ? 'eager' : 'lazy'}" decoding="async" referrerpolicy="no-referrer">`
}

function renderCta(label: string, destination: SafeDestination) {
  const externalAttributes = destination.external
    ? ' rel="noopener noreferrer" target="_blank"'
    : ''
  const externalNotice = destination.external
    ? '<span class="visually-hidden"> (opens in a new tab)</span>'
    : ''
  return `        <a class="cta" href="${escapeHtml(destination.href)}"${externalAttributes}>${escapeHtml(label)} <span aria-hidden="true">&rarr;</span>${externalNotice}</a>`
}

function createPageTargets(artifact: WebsiteArtifact): PageTarget[] {
  const usedIds = new Set(['content'])
  return artifact.pages.map((page) => {
    const slug = normalizePageSlug(page.slug)
    const base = slug === '/' ? 'home' : slug.slice(1).replaceAll('/', '-')
    let anchor = base
    let suffix = 1
    const documentIds = (candidate: string) => [
      candidate,
      `${candidate}-title`,
      ...page.sections.map((_, index) => `${candidate}-section-${index + 1}`),
    ]
    // Reserve the complete page namespace, not just its flattened path: a
    // later page can otherwise collide with an earlier page's section heading.
    while (documentIds(anchor).some((id) => usedIds.has(id))) {
      suffix += 1
      anchor = `${base}-${suffix}`
    }
    documentIds(anchor).forEach((id) => usedIds.add(id))
    return { anchor, slug }
  })
}

function resolveSafeDestination(value: string, targets: PageTarget[]): SafeDestination | null {
  const destination = value.trim()
  if (!destination) return null

  if (destination.startsWith('/')) {
    if (!isValidPageSlug(destination)) return null
    const target = targets.find((candidate) => candidate.slug === normalizePageSlug(destination))
    return target ? { external: false, href: `#${target.anchor}` } : null
  }

  if (destination.startsWith('#')) {
    if (!/^#[a-z0-9]+(?:-[a-z0-9]+)*$/.test(destination)) return null
    return targets.some((target) => `#${target.anchor}` === destination)
      ? { external: false, href: destination }
      : null
  }

  try {
    const url = new URL(destination)
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) return null
    return { external: true, href: url.href }
  } catch {
    return null
  }
}

function isValidPageSlug(value: string) {
  return /^\/(?:[a-z0-9]+(?:-[a-z0-9]+)*\/?)*$/.test(value.trim())
}

function normalizePageSlug(value: string) {
  const trimmed = value.trim()
  return trimmed === '/' ? '/' : trimmed.replace(/\/+$/, '')
}

function cleanText(value: string) {
  return value.replace(/\r\n?/g, '\n').trim()
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => HTML_ESCAPES[character] ?? character)
}
