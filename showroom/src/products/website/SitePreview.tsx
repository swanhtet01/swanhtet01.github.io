import { WebsiteImage } from './WebsiteImage'
import { normalizeSlug, type PreviewDevice, type WebsitePage } from './website-model'
import { websiteDocumentLanguage } from './website-language'
import { websiteContactPage } from './website-contact-page'
import './website-presentation.css'

type SitePreviewProps = {
  device: PreviewDevice
  page: WebsitePage
  pages: WebsitePage[]
  siteName: string
  inquiryPageId?: string
  onSelectPage: (pageId: string) => void
}

export function SitePreview({ device, page, pages, siteName, inquiryPageId, onSelectPage }: SitePreviewProps) {
  const visiblePages = pages.filter(candidate => candidate.navigation.visible)
  const home = pages.find(candidate => candidate.slug === '/') ?? pages[0]
  const contact = websiteContactPage(pages, inquiryPageId)
  const ctaHref = page.hero.ctaHref.trim()
  const ctaPage = pages.find(candidate => ctaHref.startsWith('#')
    ? (candidate.slug === '/' ? 'home' : candidate.slug.slice(1).replaceAll('/', '-')) === ctaHref.slice(1)
    : ctaHref.startsWith('/') && candidate.slug === normalizeSlug(ctaHref))
  let externalHref = ''
  try {
    const url = new URL(ctaHref)
    if (url.protocol === 'https:' && url.hostname && !url.username && !url.password) externalHref = url.href
  } catch { /* An incomplete destination stays disabled in the editor. */ }

  return <section className="website-preview-panel" aria-label={siteName + ' site canvas'}>
    <div className="website-preview-stage"><div className={'website-preview-frame is-' + device}>
      <article className="sm-site" lang={websiteDocumentLanguage(siteName, pages)} aria-label={page.internalName + ' page canvas'} role="document">
        <header className="site-header"><div className="site-header-inner">
          <button className="site-name" type="button" onClick={() => home && onSelectPage(home.id)}>{siteName || 'Untitled site'}</button>
          <nav className="site-nav" aria-label="Site navigation">{visiblePages.map(candidate => <button aria-current={candidate.id === page.id ? 'page' : undefined} key={candidate.id} onClick={() => onSelectPage(candidate.id)} type="button">{candidate.navigation.label || candidate.internalName}</button>)}</nav>
        </div></header>
        <div className="site-main"><article className="site-page">
          <section className="hero">
            <WebsiteImage image={page.hero.image} priority />
            <p className="eyebrow">{page.hero.eyebrow}</p>
            <h1>{page.hero.headline || 'Add a clear page headline.'}</h1>
            <p className="summary">{page.hero.summary}</p>
            {page.hero.ctaLabel && ctaPage ? <button className="cta" onClick={() => onSelectPage(ctaPage.id)} type="button">{page.hero.ctaLabel}<span aria-hidden="true">→</span></button> : null}
            {page.hero.ctaLabel && !ctaPage && externalHref ? <a className="cta" href={externalHref} rel="noopener noreferrer" target="_blank">{page.hero.ctaLabel}<span aria-hidden="true">→</span><span className="visually-hidden"> (opens in a new tab)</span></a> : null}
            {page.hero.ctaLabel && !ctaPage && !externalHref ? <span aria-disabled="true" className="cta">{page.hero.ctaLabel}</span> : null}
          </section>
          <div className="section-grid">{page.sections.map(section => <section className={'content-section' + (section.image ? ' has-image' : '')} key={section.id}><WebsiteImage image={section.image} /><div className="section-copy"><p className="eyebrow">{section.eyebrow}</p><h2>{section.title || 'Untitled section'}</h2><p>{section.body}</p></div></section>)}</div>
          {page.id === contact?.id ? <section className="inquiry-section"><h2>Get in touch</h2><form className="inquiry-form" aria-label="Contact form preview" onSubmit={event => event.preventDefault()}>
            <fieldset disabled><label>Name<input autoComplete="name" maxLength={80} /></label><label>Email or phone<input autoComplete="email" maxLength={120} /></label><label>Message<textarea rows={4} maxLength={500} /></label><label className="consent"><input type="checkbox" /><span>I agree to share these details with {siteName} so they can respond.</span></label></fieldset>
            <button disabled type="button">Send message</button><p className="inquiry-status">Preview only. Messages can be sent from the published website.</p>
          </form></section> : null}
        </article></div>
        <footer className="site-footer"><span>{siteName || 'Untitled site'}</span>{contact ? <button className="site-contact-link" type="button" onClick={() => onSelectPage(contact.id)}>Contact us</button> : null}</footer>
      </article>
    </div></div>
  </section>
}
