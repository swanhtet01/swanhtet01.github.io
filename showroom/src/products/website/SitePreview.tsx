import { normalizeSlug, type PreviewDevice, type WebsitePage } from './website-model'

type SitePreviewProps = {
  device: PreviewDevice
  page: WebsitePage
  pages: WebsitePage[]
  siteName: string
  onSelectPage: (pageId: string) => void
}

export function SitePreview({ device, page, pages, siteName, onSelectPage }: SitePreviewProps) {
  const visiblePages = pages.filter((candidate) => candidate.navigation.visible)
  const ctaHref = page.hero.ctaHref.trim()
  const ctaPage = pages.find((candidate) => candidate.slug === normalizeSlug(ctaHref))
  const safeStandaloneCta = ctaHref.startsWith('https://') || ctaHref.startsWith('#') ? ctaHref : ''

  return (
    <section className="website-preview-panel" aria-labelledby="site-preview-title">
      <header className="website-preview-toolbar">
        <div className="website-window-dots" aria-hidden="true"><i /><i /><i /></div>
        <div>
          <strong id="site-preview-title">Draft preview</strong>
          <code>local.preview{page.slug || '/'}</code>
        </div>
        <span>{device}</span>
      </header>

      <div className="website-preview-stage">
        <div className={'website-preview-frame is-' + device}>
          <article className="website-preview-site" aria-label={page.internalName + ' page preview'} role="document">
            <header className="preview-site-header">
              <strong>{siteName || 'Untitled site'}</strong>
              <nav aria-label="Preview navigation">
                {visiblePages.map((candidate) => (
                  <button
                    aria-current={candidate.id === page.id ? 'page' : undefined}
                    className={candidate.id === page.id ? 'is-current' : ''}
                    key={candidate.id}
                    onClick={() => onSelectPage(candidate.id)}
                    type="button"
                  >
                    {candidate.navigation.label || candidate.internalName}
                  </button>
                ))}
              </nav>
              <i aria-hidden="true">MENU</i>
            </header>

            <div className="preview-site-main">
              <section className="preview-hero">
                <span>{page.hero.eyebrow || 'Page eyebrow'}</span>
                <h1>{page.hero.headline || 'Add a clear page headline.'}</h1>
                <p>{page.hero.summary || 'The page summary will appear here as you write.'}</p>
                {page.hero.ctaLabel && ctaPage ? (
                  <button className="preview-cta" onClick={() => onSelectPage(ctaPage.id)} type="button">
                    {page.hero.ctaLabel}<i aria-hidden="true">→</i>
                  </button>
                ) : null}
                {page.hero.ctaLabel && !ctaPage && safeStandaloneCta ? (
                  <a className="preview-cta" href={safeStandaloneCta} rel="noreferrer" target="_blank">
                    {page.hero.ctaLabel}<i aria-hidden="true">→</i>
                  </a>
                ) : null}
                {page.hero.ctaLabel && !ctaPage && !safeStandaloneCta ? (
                  <span aria-disabled="true" className="preview-cta is-disabled">
                    {page.hero.ctaLabel}<i aria-hidden="true">→</i>
                  </span>
                ) : null}
              </section>

              <section className="preview-section-grid">
                {page.sections.length ? page.sections.map((section) => (
                  <article key={section.id}>
                    <span>{section.eyebrow || 'Section'}</span>
                    <h2>{section.title || 'Untitled section'}</h2>
                    <p>{section.body || 'Add section copy in the content editor.'}</p>
                  </article>
                )) : (
                  <article className="is-placeholder">
                    <span>Content</span>
                    <h2>No sections yet.</h2>
                    <p>Add a section in the editor to complete this page.</p>
                  </article>
                )}
              </section>
            </div>

            <footer className="preview-site-footer">
              <span>{siteName || 'Untitled site'}</span>
              <small>Local draft preview · not deployed</small>
            </footer>
          </article>
        </div>
      </div>
    </section>
  )
}
