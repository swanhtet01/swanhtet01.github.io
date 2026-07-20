import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { catalogExport, loadShopCatalog, normalizeCommerceMachineBlueprint, type CommerceCatalogSource, type CommerceCatalogItem, type CommerceMachinePolicy } from '../lib/commerceMachineAdapter'
import { trackEvent } from '../lib/analytics'

type Product = CommerceCatalogItem
type Stage = 'intake' | 'draft' | 'review' | 'handoff'
type MachinePolicy = CommerceMachinePolicy

const DEFAULT_PRODUCTS: Product[] = [
  { id: 'tea', name: 'Myanmar milk tea', price: 2500, stock: 18, unit: 'cup' },
  { id: 'coffee', name: 'Iced coffee', price: 3500, stock: 12, unit: 'cup' },
  { id: 'mohinga', name: 'Mohinga', price: 3000, stock: 7, unit: 'bowl' },
]

const money = (value: number) => `${new Intl.NumberFormat('en-US').format(value)} MMK`
const DEFAULT_POLICY: MachinePolicy = { language: 'Myanmar + English', fulfillment: 'Delivery or pickup', approvalThreshold: 100000, autoReply: true, autoFollowUp: true, lowStockThreshold: 3 }
const WORKERS = [
  ['Commerce Closer', 'Answers questions and turns intent into a draft order.'],
  ['Inventory Watch', 'Checks stock and flags low or conflicting quantities.'],
  ['Payment Guard', 'Keeps payment and release decisions human-approved.'],
  ['Follow-up Worker', 'Prepares reminders for abandoned or unanswered orders.'],
  ['Owner Brief', 'Summarizes only exceptions and decisions for the owner.'],
] as const

function normalizeDigits(value: string) {
  return value.replace(/[၀-၉]/g, (digit) => String('၀၁၂၃၄၅၆၇၈၉'.indexOf(digit)))
}

function parseRequestedQuantity(message: string) {
  const normalized = normalizeDigits(message).toLowerCase()
  const numeric = normalized.match(/\b(\d{1,3})\b/)
  if (numeric) return Math.max(1, Number(numeric[1]))
  const words: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5 }
  const word = Object.keys(words).find((item) => new RegExp(`\\b${item}\\b`).test(normalized))
  return word ? words[word] : 1
}

function readStoredProducts(): Product[] {
  try {
    const stored = JSON.parse(localStorage.getItem('sm-commerce-products') || 'null')
    if (!Array.isArray(stored) || stored.length === 0) return DEFAULT_PRODUCTS
    const valid = stored.filter((item): item is Product => Boolean(item && item.id && item.name && Number.isFinite(Number(item.price)) && Number.isFinite(Number(item.stock))))
    return valid.length ? valid : DEFAULT_PRODUCTS
  } catch {
    return DEFAULT_PRODUCTS
  }
}

export function CommerceMachinePage() {
  const [businessName, setBusinessName] = useState(() => localStorage.getItem('sm-commerce-business') || 'Demo shop')
  const [channel, setChannel] = useState(() => localStorage.getItem('sm-commerce-channel') || 'Messenger')
  const [products, setProducts] = useState<Product[]>(readStoredProducts)
  const [selectedProductId, setSelectedProductId] = useState(() => localStorage.getItem('sm-commerce-product') || DEFAULT_PRODUCTS[0].id)
  const [catalogSource, setCatalogSource] = useState<CommerceCatalogSource>(() => (localStorage.getItem('sm-commerce-source') as CommerceCatalogSource) || 'demo')
  const [quantity, setQuantity] = useState(2)
  const [customerName, setCustomerName] = useState('New customer')
  const [customerMessage, setCustomerMessage] = useState('Hello, do you have milk tea? I want two cups for delivery.')
  const [conversationReady, setConversationReady] = useState(false)
  const [parseNote, setParseNote] = useState('Waiting for a message to be classified.')
  const [stage, setStage] = useState<Stage>('intake')
  const [policy, setPolicy] = useState<MachinePolicy>(() => {
    try { return { ...DEFAULT_POLICY, ...(JSON.parse(localStorage.getItem('sm-commerce-policy') || 'null') || {}) } } catch { return DEFAULT_POLICY }
  })
  const [enabledWorkers, setEnabledWorkers] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('sm-commerce-workers') || 'null') || WORKERS.map(([name]) => name) } catch { return WORKERS.map(([name]) => name) }
  })
  const selectedProduct = products.find((item) => item.id === selectedProductId) || products[0] || DEFAULT_PRODUCTS[0]
  const total = useMemo(() => selectedProduct.price * quantity, [quantity, selectedProduct])
  const stockAfterDraft = selectedProduct.stock - quantity
  const paymentState = total >= policy.approvalThreshold ? 'owner approval required' : 'payment proof required'

  useEffect(() => { localStorage.setItem('sm-commerce-business', businessName); localStorage.setItem('sm-commerce-channel', channel); localStorage.setItem('sm-commerce-products', JSON.stringify(products)); localStorage.setItem('sm-commerce-product', selectedProduct.id); localStorage.setItem('sm-commerce-source', catalogSource); localStorage.setItem('sm-commerce-policy', JSON.stringify(policy)); localStorage.setItem('sm-commerce-workers', JSON.stringify(enabledWorkers)) }, [businessName, channel, products, selectedProduct.id, catalogSource, policy, enabledWorkers])
  useEffect(() => { const controller = new AbortController(); void loadShopCatalog(controller.signal).then((catalog) => { if (catalog) { setProducts(catalog.items); setSelectedProductId(catalog.items[0].id); setCatalogSource(catalog.source) } }); return () => controller.abort() }, [])

  function importCatalog(file: File) {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result))
        const blueprint = normalizeCommerceMachineBlueprint(parsed)
        if (blueprint) {
          setBusinessName(blueprint.businessName); setChannel(blueprint.channel); setProducts(blueprint.catalog); setSelectedProductId(blueprint.catalog[0].id); setCatalogSource(blueprint.catalogSource); setPolicy(blueprint.policy); setEnabledWorkers(blueprint.enabledWorkers.length ? blueprint.enabledWorkers : WORKERS.map(([name]) => name)); setStage('draft')
          trackEvent('commerce_blueprint_imported', { catalog_source: blueprint.catalogSource, item_count: blueprint.catalog.length, channel: blueprint.channel })
          return
        }
        if (!Array.isArray(parsed) || parsed.length === 0 || parsed.some((item) => !item.id || !item.name || !Number.isFinite(Number(item.price)) || !Number.isFinite(Number(item.stock)))) throw new Error('Catalog needs at least one item with id, name, price, and stock, or import a valid machine blueprint.')
        const next = parsed.map((item) => ({ id: String(item.id), name: String(item.name), price: Number(item.price), stock: Number(item.stock), unit: String(item.unit || 'item') }))
        setProducts(next); setSelectedProductId(next[0].id); setCatalogSource('client-import'); setStage('draft'); trackEvent('commerce_catalog_imported', { item_count: next.length, source: 'client_import' })
      } catch (error) { window.alert(error instanceof Error ? error.message : 'Could not import catalog.') }
    }
    reader.readAsText(file)
  }

  function exportHandoff() {
    const packet = {
      version: 1,
      businessName,
      channel,
      catalogSource,
      createdAt: new Date().toISOString(),
      order: { product: selectedProduct.name, quantity, total, currency: 'MMK' },
      customer: { name: customerName, channel, message: customerMessage },
      checks: { catalog: 'approved-demo-catalog', stock: stockAfterDraft >= 0 ? 'available' : 'blocked', payment: 'awaiting-human-proof', approvalRequired: total >= policy.approvalThreshold },
      policy,
      enabledWorkers,
      integrations: ['Catalog', 'Inventory', 'Owner inbox'],
      nextAction: 'Operator confirms delivery details and payment evidence before release.',
    }
    const blob = new Blob([JSON.stringify(packet, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${businessName.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'commerce'}-handoff.json`
    anchor.click()
    trackEvent('commerce_handoff_exported', { catalog_source: catalogSource, stage, item_count: products.length })
    URL.revokeObjectURL(url)
  }

  function exportBlueprint() {
    const blueprint = { version: 1, kind: 'supermega-commerce-machine', businessName, channel, catalogSource, policy, enabledWorkers, integrations: ['Catalog', 'Inventory', 'Owner inbox'], approvalRules: ['Never send final payment or delivery confirmation without an operator gate.', 'Block drafts when requested quantity exceeds available stock.', 'Escalate orders at or above the configured approval threshold.'], catalog: products, createdAt: new Date().toISOString() }
    const blob = new Blob([JSON.stringify(blueprint, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${businessName.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'commerce'}-machine-blueprint.json`; anchor.click(); URL.revokeObjectURL(url)
    trackEvent('commerce_blueprint_exported', { catalog_source: catalogSource, item_count: products.length, channel })
  }

  function parseConversation() {
    const normalizedMessage = normalizeDigits(customerMessage).toLowerCase()
    const matchedProduct = products.find((product) => normalizedMessage.includes(product.name.toLowerCase()))
    const quantityRequested = parseRequestedQuantity(customerMessage)
    const hasPurchaseIntent = /(want|need|order|buy|available|have|ယူ|လို|မှာ|ရှိ)/i.test(normalizedMessage)
    if (!matchedProduct) {
      setConversationReady(false)
      setParseNote('No catalog item matched. Choose an item or add its exact name to the message before drafting.')
      return
    }
    if (!hasPurchaseIntent) {
      setConversationReady(false)
      setParseNote(`Found ${matchedProduct.name}, but the message does not contain a clear order request.`)
      return
    }
    const safeQuantity = Math.min(quantityRequested, Math.max(1, matchedProduct.stock))
    setSelectedProductId(matchedProduct.id)
    setQuantity(safeQuantity)
    setConversationReady(true)
    setStage('draft')
    setParseNote(quantityRequested > matchedProduct.stock ? `Requested ${quantityRequested}; capped at ${matchedProduct.stock} available in the approved catalog.` : `Matched ${matchedProduct.name}, quantity ${safeQuantity}, with ${matchedProduct.stock - safeQuantity} remaining after draft.`)
    trackEvent('commerce_conversation_parsed', { channel, item_count: products.length })
  }

  function advanceMachine() {
    if (stage === 'handoff') return
    if (!conversationReady) {
      setParseNote('Parse a clear order message before advancing beyond intake.')
      return
    }
    if (stockAfterDraft < 0) {
      setParseNote(`Blocked: ${selectedProduct.name} has only ${selectedProduct.stock} available, but this draft requires ${quantity}.`)
      return
    }
    const nextStage = stage === 'intake' ? 'draft' : stage === 'draft' ? 'review' : 'handoff'
    setStage(nextStage)
    trackEvent('commerce_stage_advanced', { from_stage: stage, to_stage: nextStage, catalog_source: catalogSource })
  }

  function downloadCatalogTemplate() {
    const blob = new Blob([catalogExport([{ id: 'item-001', name: 'Replace with your product name', price: 0, stock: 0, unit: 'item' }])], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'commerce-machine.catalog.json'
    anchor.click()
    URL.revokeObjectURL(url)
    trackEvent('commerce_catalog_template_downloaded', { source: 'machine_setup' })
  }

  return <div className="space-y-8 pb-12">
    <section className="sm-site-panel">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div><p className="sm-kicker text-[var(--sm-accent)]">Commerce Machine / configurable template</p><h1 className="mt-3 max-w-4xl text-4xl font-extrabold tracking-tight text-white lg:text-6xl">Sell from the channels customers already use.</h1><p className="mt-4 max-w-3xl text-base leading-relaxed text-[var(--sm-muted)] lg:text-lg">A reusable sales worker that reads an approved catalog, drafts an order, checks stock, and prepares a human-safe handoff. Configure it once per business.</p></div>
        <span className="sm-status-pill">Demo mode / no connector required</span>
      </div>
    </section>

    <section className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
      <article className="sm-terminal p-6"><p className="sm-kicker text-[var(--sm-accent)]">1. Configure</p><h2 className="mt-2 text-2xl font-bold text-white">Business template</h2>
        <label className="mt-6 block space-y-2 text-sm text-[var(--sm-muted)]"><span>Business name</span><input className="sm-input" value={businessName} onChange={(event) => setBusinessName(event.target.value)} onBlur={() => trackEvent('commerce_template_edited', { field: 'business_name' })} /></label>
        <label className="mt-4 block space-y-2 text-sm text-[var(--sm-muted)]"><span>Customer channel</span><select className="sm-input" value={channel} onChange={(event) => { setChannel(event.target.value); trackEvent('commerce_channel_selected', { channel: event.target.value }) }}><option>Messenger</option><option>Viber</option><option>WhatsApp</option><option>Website chat</option></select></label>
        <div className="mt-6 space-y-3 text-sm text-[var(--sm-muted)]"><p><span className="text-emerald-300">Ready</span> {products.length} catalog items</p><p><span className="text-emerald-300">Ready</span> stock reservation check</p><p><span className="text-amber-300">Human gate</span> payment and final send</p><p>Catalog source: <span className="capitalize text-white">{catalogSource.replace('-', ' ')}</span></p></div>
        <div className="mt-6 border-t border-white/10 pt-5"><p className="text-sm font-semibold text-white">Operating rules</p><label className="mt-3 block space-y-2 text-sm text-[var(--sm-muted)]"><span>Customer language</span><select className="sm-input" value={policy.language} onChange={(event) => setPolicy({ ...policy, language: event.target.value })}><option>Myanmar + English</option><option>English</option><option>Myanmar</option><option>Thai + English</option></select></label><label className="mt-3 block space-y-2 text-sm text-[var(--sm-muted)]"><span>Fulfillment</span><select className="sm-input" value={policy.fulfillment} onChange={(event) => setPolicy({ ...policy, fulfillment: event.target.value })}><option>Delivery or pickup</option><option>Delivery only</option><option>Pickup only</option><option>Appointment or quote</option></select></label><label className="mt-3 block space-y-2 text-sm text-[var(--sm-muted)]"><span>Owner approval above (MMK)</span><input className="sm-input" min={0} type="number" value={policy.approvalThreshold} onChange={(event) => setPolicy({ ...policy, approvalThreshold: Math.max(0, Number(event.target.value) || 0) })} /></label><label className="mt-3 block space-y-2 text-sm text-[var(--sm-muted)]"><span>Low-stock alert at</span><input className="sm-input" min={0} type="number" value={policy.lowStockThreshold} onChange={(event) => setPolicy({ ...policy, lowStockThreshold: Math.max(0, Number(event.target.value) || 0) })} /></label><label className="mt-3 flex items-center gap-3 text-sm text-[var(--sm-muted)]"><input checked={policy.autoReply} onChange={(event) => setPolicy({ ...policy, autoReply: event.target.checked })} type="checkbox" /> Draft instant replies for review</label><label className="mt-3 flex items-center gap-3 text-sm text-[var(--sm-muted)]"><input checked={policy.autoFollowUp} onChange={(event) => setPolicy({ ...policy, autoFollowUp: event.target.checked })} type="checkbox" /> Prepare follow-up reminders</label></div>
        <div className="mt-6 border-t border-white/10 pt-5"><p className="text-sm font-semibold text-white">Workers in this machine</p><div className="mt-3 space-y-2">{WORKERS.map(([name, detail]) => <label className="flex gap-3 border border-white/10 p-3 text-sm text-[var(--sm-muted)]" key={name}><input checked={enabledWorkers.includes(name)} onChange={(event) => { setEnabledWorkers(event.target.checked ? [...enabledWorkers, name] : enabledWorkers.filter((worker) => worker !== name)); trackEvent('commerce_worker_toggled', { enabled: event.target.checked }) }} type="checkbox" /><span><strong className="block text-white">{name}</strong><span>{detail}</span></span></label>)}</div></div>
        <button className="sm-button-secondary mt-4 w-full" type="button" onClick={() => { const blob = new Blob([catalogExport(products)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${businessName.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'commerce'}-catalog.json`; anchor.click(); URL.revokeObjectURL(url); trackEvent('commerce_catalog_exported', { catalog_source: catalogSource, item_count: products.length }) }}>Download current catalog</button>
        <label className="mt-6 block cursor-pointer border border-dashed border-white/20 p-4 text-sm text-[var(--sm-muted)] hover:border-[var(--sm-accent)]"><span className="block font-semibold text-white">Import client catalog or blueprint</span><span className="mt-1 block">Catalog JSON or a saved SuperMega machine blueprint.</span><input className="sr-only" accept="application/json,.json" type="file" onChange={(event) => { const file = event.target.files?.[0]; if (file) importCatalog(file); event.currentTarget.value = '' }} /></label>
        <button className="sm-button-secondary mt-3 w-full" type="button" onClick={downloadCatalogTemplate}>Download starter catalog</button>
        <button className="sm-button-secondary mt-3 w-full" type="button" onClick={exportBlueprint}>Export reusable machine blueprint</button>
      </article>

      <article className="sm-surface-deep p-6"><div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 pb-5"><div><p className="sm-kicker text-[var(--sm-accent)]">2. Run the worker</p><h2 className="mt-2 text-2xl font-bold text-white">One order, four accountable states</h2></div><span className="sm-status-pill">{businessName} / {channel}</span></div>
        <div className="mt-5 grid gap-2 sm:grid-cols-4">{(['intake', 'draft', 'review', 'handoff'] as Stage[]).map((item, index) => <button key={item} type="button" className={`border p-3 text-left text-sm ${stage === item ? 'border-[var(--sm-accent)] bg-[var(--sm-accent)]/10 text-white' : 'border-white/10 text-[var(--sm-muted)]'}`} onClick={() => { const targetIndex = index; const currentIndex = ['intake', 'draft', 'review', 'handoff'].indexOf(stage); if (targetIndex <= currentIndex || (conversationReady && stockAfterDraft >= 0 && targetIndex === currentIndex + 1)) setStage(item); else setParseNote('Complete the current evidence gate before moving to this stage.') }}><span className="block text-xs uppercase tracking-widest">0{index + 1}</span><strong className="mt-2 block capitalize">{item}</strong></button>)}</div>
        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_0.9fr]">
          <div><p className="text-sm text-[var(--sm-muted)]">Customer conversation</p><label className="mt-3 block space-y-2 text-sm text-[var(--sm-muted)]"><span>Customer name</span><input className="sm-input" value={customerName} onChange={(event) => setCustomerName(event.target.value)} /></label><label className="mt-3 block space-y-2 text-sm text-[var(--sm-muted)]"><span>Incoming message</span><textarea className="sm-input min-h-28" value={customerMessage} onChange={(event) => { setCustomerMessage(event.target.value); setConversationReady(false); setParseNote('Message changed. Parse again to update the draft.') }} /></label><div className="mt-3 flex flex-wrap gap-2"><span className="sm-chip text-white">Channel / {channel}</span><span className="sm-chip text-white">Intent / {conversationReady ? 'ready to buy' : 'unclassified'}</span><span className="sm-chip text-white">Match / {conversationReady ? 'catalog item found' : 'needs review'}</span></div><button className="sm-button-secondary mt-4" type="button" onClick={parseConversation}>Parse conversation</button><p className="mt-3 text-xs leading-relaxed text-[var(--sm-muted)]">{parseNote}</p><div className="mt-4 space-y-3 text-sm leading-relaxed"><div className="ml-auto max-w-[85%] bg-white/10 p-4 text-white">{customerMessage || 'Waiting for a customer message.'}</div><div className="max-w-[85%] border border-[var(--sm-accent)]/30 bg-[var(--sm-accent)]/10 p-4 text-white">{conversationReady ? `Thanks ${customerName}. I found ${selectedProduct.name} and can prepare an order for review.` : 'The worker will draft a reply after the operator parses the message.'}</div></div></div>
            <div><label className="block space-y-2 text-sm text-[var(--sm-muted)]"><span>Recommended item</span><select className="sm-input" value={selectedProduct.id} onChange={(event) => setSelectedProductId(event.target.value)}>{products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label><label className="mt-4 block space-y-2 text-sm text-[var(--sm-muted)]"><span>Quantity</span><input className="sm-input" min={1} max={selectedProduct.stock} type="number" value={quantity} onChange={(event) => setQuantity(Math.max(1, Number(event.target.value) || 1))} /></label><div className="mt-5 grid gap-3 sm:grid-cols-2"><div className="sm-chip text-white"><span className="text-[var(--sm-muted)]">Order total</span><strong className="mt-1 block text-xl">{money(total)}</strong></div><div className="sm-chip text-white"><span className="text-[var(--sm-muted)]">Stock after draft</span><strong className={`mt-1 block text-xl ${stockAfterDraft < 3 ? 'text-amber-300' : 'text-emerald-300'}`}>{stockAfterDraft} {selectedProduct.unit}s</strong></div></div></div>
        </div>
        <div className="mt-6 border-t border-white/10 pt-5 text-sm text-[var(--sm-muted)]"><p>Current state: <strong className="capitalize text-white">{stage}</strong></p><p className="mt-2">Decision gate: <span className="text-white">{paymentState}; no payment or delivery message is sent automatically.</span></p><p className="mt-2">Next action: <span className="text-white">{stage === 'handoff' ? 'Operator confirms delivery details and payment evidence.' : 'Advance the order when the preceding evidence is present.'}</span></p></div>
        <div className="mt-5 flex flex-wrap gap-3"><button className="sm-button-primary" onClick={advanceMachine} type="button">Advance machine</button><button className="sm-button-secondary" disabled={!conversationReady || stockAfterDraft < 0} onClick={exportHandoff} type="button">Export handoff packet</button></div>
      </article>
    </section>

    <section className="grid gap-4 md:grid-cols-3">{[['Commerce Closer', 'Answers product questions and drafts orders.'], ['Ops Watch', 'Flags low stock, payment gaps, and stale follow-up.'], ['Owner Brief', 'Shows only the decisions that need a person today.']].map(([name, detail]) => <article className="sm-site-panel" key={name}><p className="font-semibold text-white">{name}</p><p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{detail}</p></article>)}</section>
    <div className="flex flex-wrap gap-3"><Link className="sm-button-primary" to="/contact?package=Commerce%20Machine">Set up this machine</Link><Link className="sm-button-secondary" to="/products/commerce-machine">Product details</Link></div>
  </div>
}
