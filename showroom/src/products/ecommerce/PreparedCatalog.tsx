import { validateStorefrontPreview } from './storefront-model'

/** Inert prepared content only. Access, revision verification and consent belong to the review route. */
export function PreparedCatalog({ preview }: { preview: unknown }) {
  const catalog = validateStorefrontPreview(preview)
  return <section className="storefront-preview" aria-label="Prepared catalog">
    <header><h2>{catalog.storeName}</h2><p>{catalog.summary}</p></header>
    <div className="storefront-grid">{catalog.items.map(item => <article key={item.sku}>
      {item.merchandising?.collection ? <small>{item.merchandising.collection}</small> : null}
      <h3>{item.merchandising?.displayName || item.name}</h3>
      {item.variant ? <p>{item.variant}</p> : null}
      <span>{new Intl.NumberFormat('en-US').format(item.unitPriceMmk)} MMK</span>
      <p>{item.availability === 'available' ? 'Available' : 'Sold out'}</p>
      {item.merchandising?.note ? <p>{item.merchandising.note}</p> : null}
    </article>)}</div>
    <footer>Prepared preview. Orders and payments are not active.</footer>
  </section>
}
