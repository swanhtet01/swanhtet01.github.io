import { type PreviewDevice, type WebsitePage } from './website-model'

type SitePreviewProps = {
  device: PreviewDevice
  page: WebsitePage
  pages: WebsitePage[]
  siteName: string
}

export function SitePreview({ device, page, pages, siteName }: SitePreviewProps) {
  const visiblePages = pages.filter((candidate) => candidate.navigation.visible)

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
          <article className="website-preview-site" aria-label={page.internalName + ' page preview'}>
            <header className="preview-site-header">
              <strong><span aria-hidden="true">&gt;_</span>{siteName || 'Untitled site'}</strong>
              <nav aria-label="Preview navigation">
                {visiblePages.map((candidate) => (
                  <span className={candidate.id === page.id ? 'is-current' : ''} key={candidate.id}>
                    {candidate.navigation.label || candidate.internalName}
                  </span>
                ))}
              </nav>
              <i aria-hidden="true">MENU</i>
            </header>

            <div className="preview-site-main">
              <section className="preview-hero">
                <span>{page.hero.eyebrow || 'Page eyebrow'}</span>
                <h1>{page.hero.headline || 'Add a clear page headline.'}</h1>
                <p>{page.hero.summary || 'The page summary will appear here as you write.'}</p>
                {page.hero.ctaLabel ? <b>{page.hero.ctaLabel}<i aria-hidden="true">→</i></b> : null}
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
