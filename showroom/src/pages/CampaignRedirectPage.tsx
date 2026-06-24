import { useEffect } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'

import { trackEvent } from '../lib/analytics'

function campaignDestination(slug: string, content: string) {
  const params = new URLSearchParams({
    utm_source: 'business_card',
    utm_medium: 'qr',
    utm_campaign: slug,
    utm_content: content,
  })
  return `/contact/?${params.toString()}`
}

export function CampaignRedirectPage() {
  const { campaignSlug } = useParams()
  const [searchParams] = useSearchParams()
  const slug = (campaignSlug || 'business-card').trim()
  const content = searchParams.get('utm_content')?.trim() || 'front_qr'
  const destination = campaignDestination(slug, content)

  useEffect(() => {
    trackEvent('campaign_qr_scan', { campaign: slug, source: 'business_card', medium: 'qr', content })
    const timeout = window.setTimeout(() => {
      window.location.replace(destination)
    }, 180)
    return () => window.clearTimeout(timeout)
  }, [content, destination, slug])

  return (
    <div className="sm-card-page">
      <section className="sm-card-hero" aria-label="Opening SUPERMEGA contact">
        <div className="sm-card-copy">
          <p className="sm-kicker text-[var(--sm-accent)]">SUPERMEGA.dev</p>
          <h1>Opening contact.</h1>
          <p>Tracking this card scan and sending you to the right page.</p>
          <div className="sm-card-actions">
            <Link className="sm-button-primary" to={destination}>
              Continue
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
