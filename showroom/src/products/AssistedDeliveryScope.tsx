import { useId, useState } from 'react'
import { emptyBusinessBrief, readBusinessBrief, saveBusinessBrief, type BusinessBriefDraft } from './business-brief-draft'
import './assisted-delivery-scope.css'

type Product = 'website' | 'ecommerce'

export function AssistedDeliveryScope({ product }: { product: Product }) {
  return <section className="assisted-delivery-scope" aria-label="Get setup help">
    <a className="assisted-delivery-request" href={`/${product}/${product === 'ecommerce' ? '?setup=1' : ''}`}>Tell us about your business</a>
    <details>
      <summary>Before we start</summary>
      <p>Share your business details or a public page. We agree scope, price and timing before work. Publishing needs your approval.</p>
    </details>
  </section>
}


export function BusinessBrief({ product, onOpenWorkspace }: { product: Product; onOpenWorkspace: () => void }) {
  const id = useId()
  const [draft, setDraft] = useState(() => {
    try { return readBusinessBrief(window.sessionStorage, product) } catch { return emptyBusinessBrief() }
  })
  const [draftUnavailable, setDraftUnavailable] = useState(false)
  const [handoffFailed, setHandoffFailed] = useState(false)
  const { company, description, reference } = draft
  function updateDraft(patch: Partial<BusinessBriefDraft>) {
    const next = { ...draft, ...patch }
    setDraft(next)
    try { setDraftUnavailable(!saveBusinessBrief(window.sessionStorage, product, next)) } catch { setDraftUnavailable(true) }
  }
  return <section className="business-brief" aria-labelledby={`${id}-title`}>
    <header>
      <span className="business-brief-kicker">{product === 'website' ? 'Website' : 'Ecommerce'}</span>
      <h1 id={`${id}-title`}>{product === 'website' ? 'Your business, online.' : 'Your products, ready to browse.'}</h1>
      <p>Tell us the essentials. We prepare it. You review.</p>
    </header>
    <form onSubmit={event => {
      event.preventDefault()
      const goal = `${description.trim()}${reference.trim() ? `\nExisting page or catalog: ${reference.trim()}` : ''}`
      const query = new URLSearchParams({ product, source: `${product}-brief` })
      const handoff = new URLSearchParams({ company: company.trim(), goal })
      setHandoffFailed(false)
      try { window.location.assign(`https://supermega.dev/contact/?${query}#${handoff}`) } catch { setHandoffFailed(true) }
    }}>
      <label htmlFor={`${id}-company`}>Business name</label>
      <input id={`${id}-company`} autoComplete="organization" required maxLength={180} pattern=".*\S.*" value={company} onChange={event => updateDraft({ company: event.target.value })} />
      <label htmlFor={`${id}-description`}>{product === 'website' ? 'What does your business offer?' : 'What do you sell?'}</label>
      <textarea id={`${id}-description`} required maxLength={3000} rows={4} value={description} onChange={event => updateDraft({ description: event.target.value })} placeholder={product === 'website' ? 'Services, location and how customers reach you.' : 'A few products and prices are enough to start.'} />
      <label htmlFor={`${id}-reference`}>Existing page or catalog <span>optional</span></label>
      <input id={`${id}-reference`} maxLength={700} value={reference} onChange={event => updateDraft({ reference: event.target.value })} placeholder="Facebook page, website or public catalog" />
      <button type="submit" disabled={!company.trim() || !description.trim()}>Continue</button>
      {handoffFailed ? <small role="alert">Could not open contact. Your details are still here. Try Continue again.</small> : null}
      {draftUnavailable ? <small role="status">This browser cannot keep your draft. Copy it before leaving this page.</small> : <small>Your draft stays in this tab for up to one hour.</small>}
      <small>Next: add your contact details and review before sending. No passwords or private customer data.</small>
    </form>
    <footer><span>Scope and price agreed before work begins.</span><button type="button" onClick={onOpenWorkspace}>Open existing workspace</button></footer>
  </section>
}
