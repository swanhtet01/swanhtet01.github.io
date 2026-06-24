import { type MouseEvent, useEffect } from 'react'
import { Link } from 'react-router-dom'

import { EnterpriseSolutionCanvas } from '../components/EnterpriseSolutionCanvas'
import { PUBLIC_PRODUCT_ALIAS_BY_PORTAL_ID } from '../lib/publicProductAliases'
import { getTenantConfig } from '../lib/tenantConfig'

const productGalleries = [
  {
    ...PUBLIC_PRODUCT_ALIAS_BY_PORTAL_ID['agency-client-operator'],
    line: 'Client requests, assets, approvals, reports.',
    features: ['Clients', 'Assets', 'Reports'],
    portalId: 'agency-client-operator',
  },
  {
    ...PUBLIC_PRODUCT_ALIAS_BY_PORTAL_ID['ai-workflow-desk'],
    line: 'Source records, queue, approvals.',
    features: ['Intake', 'Queue', 'Proof'],
    portalId: 'ai-workflow-desk',
  },
  {
    ...PUBLIC_PRODUCT_ALIAS_BY_PORTAL_ID['operations-digital-twin'],
    line: 'Assets, readings, CAPA, closeout.',
    features: ['Assets', 'Signals', 'CAPA'],
    portalId: 'operations-digital-twin',
  },
  {
    ...PUBLIC_PRODUCT_ALIAS_BY_PORTAL_ID['restaurant-group-os'],
    line: 'Orders, stock, menu, daily close.',
    features: ['Orders', 'Stock', 'Menu'],
    portalId: 'restaurant-group-os',
  },
] as const

const productContactPackages: Record<string, string> = {
  'agency-client-operator': 'agency-client-operator',
  'ai-workflow-desk': 'document-extraction-ledger',
  'operations-digital-twin': 'factory-issues-maintenance-quality',
  'restaurant-group-os': 'restaurant-pos-menu-inventory',
}

const productShotVersion = '20260523-uncropped'

function productShotSrc(src: string) {
  if (!src || src.includes('?')) return src
  return `${src}?v=${productShotVersion}`
}

function productContactHref(portalId: string) {
  return `/contact/?package=${encodeURIComponent(productContactPackages[portalId] ?? 'back-office-workflow-desk')}`
}

function syncProductGalleryHeight(carousel: Element | null) {
  const track = carousel?.querySelector<HTMLElement>('.sm-product-gallery-media')
  if (!track) return
  const slides = Array.from(track.querySelectorAll<HTMLElement>('figure'))
  const width = track.getBoundingClientRect().width || track.clientWidth || 1
  const index = Math.max(0, Math.min(slides.length - 1, Math.round(track.scrollLeft / width)))
  const activeSlide = slides[index]
  if (activeSlide) {
    track.style.height = `${activeSlide.offsetHeight}px`
  }
  carousel?.querySelectorAll<HTMLButtonElement>('.sm-product-carousel-dots button').forEach((dot, dotIndex) => {
    dot.classList.toggle('active', dotIndex === index)
    if (dotIndex === index) {
      dot.setAttribute('aria-current', 'true')
    } else {
      dot.removeAttribute('aria-current')
    }
  })
}

function scrollProductGallery(event: MouseEvent<HTMLButtonElement>, direction: number) {
  const carousel = event.currentTarget.closest('.sm-product-carousel')
  const track = carousel?.querySelector<HTMLElement>('.sm-product-gallery-media')
  if (!track) return
  track.scrollBy({ left: direction * (track.clientWidth || 1), behavior: 'smooth' })
  window.setTimeout(() => syncProductGalleryHeight(carousel), 520)
}

function scrollProductGalleryTo(event: MouseEvent<HTMLButtonElement>, index: number) {
  const carousel = event.currentTarget.closest('.sm-product-carousel')
  const track = carousel?.querySelector<HTMLElement>('.sm-product-gallery-media')
  if (!track) return
  track.scrollTo({ left: index * (track.clientWidth || 1), behavior: 'smooth' })
  window.setTimeout(() => syncProductGalleryHeight(carousel), 520)
}

export function HomePage() {
  const tenant = getTenantConfig()

  useEffect(() => {
    const syncAll = () => {
      document.querySelectorAll('.sm-product-carousel').forEach((carousel) => syncProductGalleryHeight(carousel))
    }
    const images = Array.from(document.querySelectorAll<HTMLImageElement>('.sm-product-gallery-media img'))
    images.forEach((image) => image.addEventListener('load', syncAll, { once: true }))
    window.addEventListener('resize', syncAll)
    window.requestAnimationFrame(syncAll)
    return () => {
      images.forEach((image) => image.removeEventListener('load', syncAll))
      window.removeEventListener('resize', syncAll)
    }
  }, [])

  if (tenant.key !== 'default') {
    return (
      <div className="space-y-10 pb-16">
        <section className="sm-site-panel">
          <div className="grid gap-8 xl:grid-cols-[0.92fr_1.08fr] xl:items-center">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">{tenant.homeEyebrow}</p>
              <h1 className="mt-4 max-w-4xl text-4xl font-extrabold tracking-tight text-white lg:text-6xl">{tenant.homeTitle}</h1>
              <p className="mt-4 max-w-3xl text-base leading-relaxed text-[var(--sm-muted)] lg:text-lg">{tenant.homeDescription}</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link className="sm-button-primary" to={tenant.homePrimaryCta.to}>
                  {tenant.homePrimaryCta.label}
                </Link>
                <Link className="sm-button-secondary" to={tenant.homeSecondaryCta.to}>
                  {tenant.homeSecondaryCta.label}
                </Link>
              </div>
            </div>

            <div className="grid gap-4">
              <EnterpriseSolutionCanvas className="animate-rise-delayed" solutionId="client-workspace" />
              <div className="grid gap-4 md:grid-cols-3">
                {tenant.toolCards.map((item) => (
                  <article className="sm-proof-card" key={item.title}>
                    <p className="font-semibold text-white">{item.title}</p>
                    <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{item.detail}</p>
                    <div className="mt-4">
                      <Link className="sm-link" to={item.to}>
                        Open
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="sm-luxe-home sm-home-recut sm-public-premium pb-12">
      <section className="sm-cinematic-hero sm-public-hero" aria-label="SUPERMEGA.dev homepage">
        <div className="sm-cinematic-grid sm-public-grid" />

        <div className="sm-cinematic-inner">
          <div className="sm-cinematic-copy">
            <h1>One workflow. One simple app.</h1>
            <p>
              Send a file, sheet, email, photo, export, or repeated task. We turn it into a private app your team can use.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link className="sm-button-primary" to="/contact/">
                Contact
              </Link>
              <a className="sm-button-secondary" href="#products">
                Products
              </a>
            </div>
          </div>

          <div className="sm-hero-product-shot" aria-label="SUPERMEGA product screenshot">
              <img alt="SuperMega Document Extraction Ledger screen showing reviewed records, proof, owner, and next action" src={productShotSrc(PUBLIC_PRODUCT_ALIAS_BY_PORTAL_ID['ai-workflow-desk'].mainShot)} />
          </div>
        </div>
      </section>

      <section className="sm-product-gallery-stack mt-10" id="products" aria-label="Actual SuperMega product screenshots">
        <h2 className="max-w-3xl text-3xl font-extrabold tracking-tight text-white md:text-5xl">Products</h2>

        {productGalleries.map((product) => {
          return (
            <article className="sm-product-gallery-block" id={product.requestPackage} key={product.portalId}>
              <div className="sm-product-gallery-copy">
                <h2>{product.publicName}</h2>
                <p>{product.line}</p>
                <div className="sm-product-gallery-checks">
                  {product.features.map((item) => (
                    <span key={item}>{item}</span>
                  ))}
                </div>
                <Link className="sm-button-primary mt-5 w-fit" to={productContactHref(product.portalId)}>
                  Contact
                </Link>
              </div>
              <div className="sm-product-carousel" aria-label={`${product.publicName} screenshot gallery`}>
                <button aria-label="Previous screenshot" className="sm-product-carousel-btn prev" onClick={(event) => scrollProductGallery(event, -1)} type="button">
                  &lsaquo;
                </button>
                <div className="sm-product-gallery-media" onScroll={(event) => syncProductGalleryHeight(event.currentTarget.closest('.sm-product-carousel'))}>
                  {product.gallery.map((shot) => (
                    <figure key={shot.src}>
                      <a className="sm-product-shot-link" href={productShotSrc(shot.src)} rel="noopener noreferrer" target="_blank" aria-label={`Open ${shot.caption} screenshot`}>
                        <img alt={shot.alt} src={productShotSrc(shot.src)} />
                      </a>
                      <figcaption>{shot.caption}</figcaption>
                    </figure>
                  ))}
                </div>
                <div className="sm-product-carousel-dots" aria-label="Screenshot slides">
                  {product.gallery.map((shot, index) => (
                    <button aria-current={index === 0 ? 'true' : undefined} aria-label={`Show ${shot.caption}`} className={index === 0 ? 'active' : ''} key={shot.src} onClick={(event) => scrollProductGalleryTo(event, index)} type="button" />
                  ))}
                </div>
                <button aria-label="Next screenshot" className="sm-product-carousel-btn next" onClick={(event) => scrollProductGallery(event, 1)} type="button">
                  &rsaquo;
                </button>
              </div>
            </article>
          )
        })}
      </section>

      <section className="sm-site-panel mt-6">
        <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-white md:text-4xl">Send one source.</h2>
        <Link className="sm-button-primary mt-6 inline-flex" to="/contact/">
          Contact
        </Link>
      </section>
    </div>
  )
}
