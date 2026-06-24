const email = 'swanhtet@supermega.dev'
const phone = '+95 9 500 0721'
const tel = '+9595000721'
const contactHref = '/'

export function CardPage() {
  return (
    <div className="sm-card-page">
      <section className="sm-card-hero" aria-label="Swan Htet contact card">
        <div className="sm-card-copy">
          <p className="sm-kicker text-[var(--sm-accent)]">SUPERMEGA.dev</p>
          <h1>Swan Htet</h1>
          <p>Founder</p>
          <p className="sm-card-pitch">Custom business software.</p>
          <div className="sm-card-contact" aria-label="Contact details">
            <a href={`mailto:${email}`}>{email}</a>
            <a href={`tel:${tel}`}>{phone}</a>
          </div>
          <div className="sm-card-actions">
            <a className="sm-button-primary" href={contactHref}>
              Website
            </a>
          </div>
        </div>
      </section>
    </div>
  )
}
