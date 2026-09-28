import { useId, useState } from 'react'
import { emptyBusinessBrief, readBusinessBrief, saveBusinessBrief, type BusinessBriefDraft } from './business-brief-draft'
import './assisted-delivery-scope.css'

type Product = 'website' | 'ecommerce'

export function AssistedDeliveryScope({ product }: { product: Product }) {
  return <section className="assisted-delivery-scope" aria-label="Get setup help">
    <a className="assisted-delivery-request" href={`/${product}/${product === 'ecommerce' ? '?setup=1' : ''}`}>Tell us about your business</a>
  </section>
}


export function BusinessBrief({ product, onPreparePreview }: { product: Product; onOpenWorkspace: () => void; onPreparePreview?: (draft: BusinessBriefDraft) => string | null }) {
  const id = useId()
  const [draft, setDraft] = useState(() => {
    try { return readBusinessBrief(window.sessionStorage, product) } catch { return emptyBusinessBrief() }
  })
  const [draftUnavailable, setDraftUnavailable] = useState(false)
  const [handoffFailed, setHandoffFailed] = useState(false)
  const [previewIssue, setPreviewIssue] = useState<string | null>(null)
  const { company, description, reference } = draft
  function updateDraft(patch: Partial<BusinessBriefDraft>) {
    const next = { ...draft, ...patch }
    setDraft(next)
    try { setDraftUnavailable(!saveBusinessBrief(window.sessionStorage, product, next)) } catch { setDraftUnavailable(true) }
  }
  return <section className="business-brief" aria-labelledby={`${id}-title`}>
    <header>
      <span className="business-brief-kicker">{product === 'website' ? 'Sites' : 'Commerce'}</span>
      <h1 id={`${id}-title`}>{product === 'website' ? 'Your business, online.' : 'Your products, ready to browse.'}</h1>
      <p>Share your business details.</p>
    </header>
    <form onSubmit={event => {
      event.preventDefault()
      if (onPreparePreview) {
        try { setPreviewIssue(onPreparePreview(draft)) }
        catch { setPreviewIssue('Could not prepare your preview. Your details are still here.') }
        return
      }
      const goal = `${description.trim()}${reference.trim() ? `\nExisting page or catalog: ${reference.trim()}` : ''}`
      const query = new URLSearchParams({ product, source: `${product}-brief` })
      const handoff = new URLSearchParams({ company: company.trim(), goal })
      setHandoffFailed(false)
      try { window.location.assign(`https://supermega.dev/contact/?${query}#${handoff}`) } catch { setHandoffFailed(true) }
    }}>
      <label htmlFor={`${id}-company`}>Business name</label>
      <input id={`${id}-company`} autoComplete="organization" required maxLength={onPreparePreview ? 60 : 180} pattern=".*\S.*" value={company} onChange={event => updateDraft({ company: event.target.value })} />
      <label htmlFor={`${id}-description`}>{product === 'website' ? 'What does your business offer?' : 'What do you sell?'}</label>
      <textarea id={`${id}-description`} required maxLength={onPreparePreview ? 140 : 3000} rows={4} value={description} onChange={event => updateDraft({ description: event.target.value })} placeholder={product === 'website' ? 'Services, location and how customers reach you.' : 'Products, prices and where you deliver.'} />
      {!onPreparePreview ? <details className="business-brief-reference">
        <summary>Existing page or catalog <span>optional</span></summary>
        <label htmlFor={`${id}-reference`}>Facebook page, website or public catalog</label>
        <input id={`${id}-reference`} maxLength={700} value={reference} onChange={event => updateDraft({ reference: event.target.value })} />
      </details> : null}
      <button type="submit" disabled={!company.trim() || !description.trim()}>{onPreparePreview ? 'Create preview' : 'Continue'}</button>
      {handoffFailed ? <small role="alert">Could not open contact. Your details are still here. Try Continue again.</small> : null}
      {draftUnavailable ? <small role="status">This browser cannot keep your draft. Copy it before leaving this page.</small> : null}
      {previewIssue ? <small role="alert">{previewIssue}</small> : null}
      <small>{onPreparePreview ? 'Preview on this device. Not published.' : 'Next: your contact details.'}</small>
    </form>
  </section>
}
