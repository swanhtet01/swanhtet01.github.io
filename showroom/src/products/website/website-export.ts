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
    page.sections.forEach((section, sectionIndex) => {
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

export function buildWebsiteHtml(artifact: WebsiteArtifact): string {
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
    .map((page, index) => renderPage(page, targets[index] as PageTarget, targets))
    .join('\n')

  return `<!doctype html>
<html lang="und">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; object-src 'none'">
  <meta name="color-scheme" content="light">
  <meta name="referrer" content="no-referrer">
  <meta name="robots" content="index,follow">
  <title>${escapeHtml(cleanText(homePage.seo.title))}</title>
  <meta name="description" content="${escapeHtml(cleanText(homePage.seo.description))}">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${escapeHtml(cleanText(homePage.seo.title))}">
  <meta property="og:description" content="${escapeHtml(cleanText(homePage.seo.description))}">
  <style>
    :root {
      color-scheme: light;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-synthesis: none;
      --accent: #3157d5;
      --accent-strong: #2443a8;
      --background: #f4f6fa;
      --border: #d9deea;
      --ink: #151923;
      --muted: #5d6575;
      --surface: #ffffff;
    }
    * { box-sizing: border-box; }
    html { background: var(--background); scroll-behavior: smooth; }
    body { margin: 0; min-width: 280px; background: var(--background); color: var(--ink); line-height: 1.6; }
    a { color: inherit; }
    a:focus-visible { border-radius: 8px; outline: 3px solid #90a7f1; outline-offset: 3px; }
    .skip-link {
      position: fixed;
      z-index: 20;
      top: 12px;
      left: 12px;
      padding: 10px 14px;
      border-radius: 10px;
      background: var(--ink);
      color: #ffffff;
      transform: translateY(-160%);
    }
    .skip-link:focus { transform: translateY(0); }
    .site-header {
      position: sticky;
      z-index: 10;
      top: 0;
      border-bottom: 1px solid rgba(217, 222, 234, 0.9);
      background: rgba(255, 255, 255, 0.94);
      backdrop-filter: blur(16px);
    }
    .site-header-inner, .site-main, .site-footer {
      width: min(1120px, calc(100% - 40px));
      margin-inline: auto;
    }
    .site-header-inner {
      display: flex;
      min-height: 72px;
      align-items: center;
      justify-content: space-between;
      gap: 24px;
    }
    .site-name {
      display: inline-flex;
      min-height: 44px;
      align-items: center;
      font-size: 1.05rem;
      font-weight: 780;
      letter-spacing: -0.02em;
      text-decoration: none;
    }
    .site-nav { display: flex; align-items: center; justify-content: flex-end; gap: 4px; }
    .site-nav a {
      display: inline-flex;
      min-height: 44px;
      align-items: center;
      padding: 8px 12px;
      border-radius: 10px;
      color: var(--muted);
      font-weight: 650;
      text-decoration: none;
    }
    .site-nav a:hover { background: var(--background); color: var(--ink); }
    .site-main { padding-block: clamp(32px, 6vw, 72px); }
    .site-page {
      overflow: hidden;
      border: 1px solid var(--border);
      border-radius: 28px;
      background: var(--surface);
      box-shadow: 0 24px 70px rgba(28, 37, 61, 0.08);
      scroll-margin-top: 96px;
    }
    .site-page + .site-page { margin-top: 32px; }
    @supports selector(main:has(.site-page:target)) {
      .site-page { display: none; }
      .site-page:target { display: block; }
      .site-main:not(:has(.site-page:target)) .site-page[data-home="true"] { display: block; }
    }
    .hero {
      display: grid;
      min-height: min(620px, 72vh);
      align-content: center;
      justify-items: start;
      padding: clamp(40px, 8vw, 104px);
      background:
        radial-gradient(circle at 90% 10%, rgba(49, 87, 213, 0.14), transparent 34%),
        linear-gradient(145deg, #ffffff 20%, #f6f8ff 100%);
    }
    .eyebrow {
      margin: 0 0 14px;
      color: var(--accent);
      font-size: 0.78rem;
      font-weight: 800;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }
    h1, h2 { margin: 0; line-height: 1.08; letter-spacing: -0.04em; text-wrap: balance; }
    h1 { max-width: 850px; font-size: clamp(2.35rem, 7vw, 5.6rem); }
    h2 { font-size: clamp(1.45rem, 3vw, 2.2rem); }
    .summary {
      max-width: 720px;
      margin: 24px 0 0;
      color: var(--muted);
      font-size: clamp(1.05rem, 2vw, 1.3rem);
      white-space: pre-line;
    }
    .cta {
      display: inline-flex;
      min-height: 48px;
      align-items: center;
      gap: 10px;
      margin-top: 32px;
      padding: 12px 18px;
      border-radius: 12px;
      background: var(--accent);
      color: #ffffff;
      font-weight: 760;
      text-decoration: none;
    }
    .cta:hover { background: var(--accent-strong); }
    .section-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 20px;
      padding: clamp(24px, 5vw, 64px);
      border-top: 1px solid var(--border);
    }
    .content-section {
      min-width: 0;
      padding: clamp(24px, 4vw, 40px);
      border: 1px solid var(--border);
      border-radius: 20px;
      background: #fbfcff;
    }
    .content-section p:last-child {
      margin: 18px 0 0;
      color: var(--muted);
      white-space: pre-line;
    }
    .site-footer {
      display: flex;
      min-height: 92px;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      color: var(--muted);
      font-size: 0.9rem;
    }
    .visually-hidden {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }
    @media (max-width: 720px) {
      .site-header { position: static; }
      .site-header-inner { display: block; padding-block: 10px 12px; }
      .site-nav { justify-content: flex-start; overflow-x: auto; padding-bottom: 2px; }
      .site-header-inner, .site-main, .site-footer { width: min(100% - 24px, 1120px); }
      .site-main { padding-block: 20px; }
      .site-page { border-radius: 20px; }
      .hero { min-height: auto; padding: 44px 22px 52px; }
      .summary { margin-top: 18px; }
      .cta { width: 100%; justify-content: center; }
      .section-grid { grid-template-columns: 1fr; padding: 16px; }
      .content-section { padding: 24px 20px; }
    }
    @media (prefers-reduced-motion: reduce) {
      html { scroll-behavior: auto; }
    }
    @media print {
      .site-header, .skip-link { display: none; }
      .site-main { width: 100%; padding: 0; }
      .site-page { display: block !important; break-after: page; box-shadow: none; }
    }
  </style>
</head>
<body>
  <a class="skip-link" href="#content">Skip to content</a>
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
    <strong>${escapeHtml(siteName)}</strong>
  </footer>
</body>
</html>
`
}

export function createWebsiteHtmlDownload(artifact: WebsiteArtifact): WebsiteHtmlDownload {
  return {
    filename: sanitizeWebsiteFilename(artifact.siteName),
    mimeType: WEBSITE_HTML_MIME_TYPE,
    content: buildWebsiteHtml(artifact),
  }
}

function renderPage(
  page: WebsiteArtifact['pages'][number],
  target: PageTarget,
  targets: PageTarget[],
) {
  const eyebrow = cleanText(page.hero.eyebrow)
  const destination = resolveSafeDestination(page.hero.ctaHref, targets)
  const cta = page.hero.ctaLabel.trim() && destination
    ? renderCta(cleanText(page.hero.ctaLabel), destination)
    : ''
  const sections = page.sections.map((section, sectionIndex) => {
    const headingId = `${target.anchor}-section-${sectionIndex + 1}`
    const sectionEyebrow = cleanText(section.eyebrow)
    return `      <section class="content-section" aria-labelledby="${headingId}">
${sectionEyebrow ? `        <p class="eyebrow">${escapeHtml(sectionEyebrow)}</p>\n` : ''}        <h2 id="${headingId}">${escapeHtml(cleanText(section.title))}</h2>
        <p>${escapeHtml(cleanText(section.body))}</p>
      </section>`
  }).join('\n')

  return `    <article class="site-page" id="${target.anchor}" data-home="${target.slug === '/'}" itemscope itemtype="https://schema.org/WebPage" tabindex="-1">
      <meta itemprop="name" content="${escapeHtml(cleanText(page.seo.title))}">
      <meta itemprop="description" content="${escapeHtml(cleanText(page.seo.description))}">
      <section class="hero" aria-labelledby="${target.anchor}-title">
${eyebrow ? `        <p class="eyebrow">${escapeHtml(eyebrow)}</p>\n` : ''}        <h1 id="${target.anchor}-title">${escapeHtml(cleanText(page.hero.headline))}</h1>
        <p class="summary">${escapeHtml(cleanText(page.hero.summary))}</p>
${cta}
      </section>
      <div class="section-grid">
${sections}
      </div>
    </article>`
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
  const counts = new Map<string, number>()
  return artifact.pages.map((page) => {
    const slug = normalizePageSlug(page.slug)
    const base = slug === '/' ? 'home' : slug.slice(1).replaceAll('/', '-')
    const count = (counts.get(base) ?? 0) + 1
    counts.set(base, count)
    return { anchor: count === 1 ? base : `${base}-${count}`, slug }
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
