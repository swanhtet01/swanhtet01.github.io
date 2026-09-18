import { useId, useState } from 'react'
import { templatesFor } from '../core/product-setup'
import './assisted-delivery-scope.css'

type Product = 'website' | 'ecommerce'

function deliveryTemplates(product: Product) {
  return templatesFor(product)
}

function deliverySetupLink(product: Product, templateId: string) {
  const template = deliveryTemplates(product).find(item => item.id === templateId)
  const query = new URLSearchParams({ product, source: `${product}-preview` })
  if (!template) return `https://supermega.dev/contact/?${query}`
  query.set('template', template.id)
  const goal = `Please prepare ${template.name}. Desired outcome: ${template.outcome} Please confirm scope, price and timing before work. I will review the preview; publishing and activation require separate approval.`
  return `https://supermega.dev/contact/?${query}#${new URLSearchParams({ goal })}`
}

export function AssistedDeliveryScope({ product }: { product: Product }) {
  const id = useId()
  const [selection, setSelection] = useState('')
  const templates = deliveryTemplates(product)
  const selected = templates.find(item => item.id === selection)
  return <section className="assisted-delivery-scope" aria-label="Choose your setup outcome">
    <a className="assisted-delivery-request" href={deliverySetupLink(product, selection)} target="_blank" rel="noopener noreferrer">{product === 'website' ? 'Request Website setup' : 'Request catalog setup'}<span className="sr-only"> (opens in a new tab)</span></a>
    <small>Nothing is sent until you submit it. Your saved workspace stays unchanged.</small>
    <details className="assisted-delivery-options">
      <summary>{selected ? `Starting point: ${selected.name}` : 'Choose a starting point · optional'}</summary>
      <label htmlFor={id}>What should this do for your business?</label>
      <select id={id} value={selection} onChange={event => setSelection(event.target.value)}>
        <option value="">Help me choose</option>
        {templates.map(template => <option key={template.id} value={template.id}>{template.name}</option>)}
      </select>
      <div aria-live="polite">
        <p>{selected ? selected.outcome : 'SuperMega can recommend one. You do not need to choose a template or build the site yourself.'}</p>
        {selected && <div className="assisted-delivery-outline">
          <strong>How we prepare this with you</strong>
          <ol>{selected.workflow.map(step => <li key={step}>{step}</li>)}</ol>
          <p>You review the result and confirm the business details. We handle the preparation.</p>
        </div>}
      </div>
    </details>
    <details>
      <summary>What happens next</summary>
      {selected && <p><strong>Useful starting material:</strong> choose whichever you already have: {selected.entryPoints.join(', ')}. You do not need to prepare all of these. Share public material first; private files use a separate safe transfer.</p>}
      <p>Your selection fills the request form. We confirm scope, price and timing, prepare the preview and handle setup. Publishing, domains, payment and stock actions are not enabled here.</p>
    </details>
  </section>
}
