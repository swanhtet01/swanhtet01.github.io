import { useRef, useState, type FormEvent } from 'react'

import {
  websiteStarterTemplates,
  websiteStarterBriefIssues,
  type WebsiteStarterBrief,
} from './website-starter'
import { websiteTradeBrief, websiteTradeBriefOptions } from './website-trade-brief'
import type { ShopBusinessTemplateId } from '../shop/business-templates'

type WebsiteStarterSetupProps = {
  onCreate: (brief: WebsiteStarterBrief) => void
  onViewSample: () => void
  // The trade this device's Shop was set up as, or null when it is not known.
  //
  // Passed in rather than read here on purpose. This component is required to be free of
  // device reads -- verify_app_build.mjs fails the build if it so much as names a browser
  // storage API -- so the shell does the reading and this stays a pure function of its
  // props, which is also what makes every opening state reachable in a test.
  initialTradeId?: ShopBusinessTemplateId | null
  // The business name the owner gave during onboarding, or null. Same rule: read by the
  // shell, passed in here, and used verbatim rather than repaired.
  initialBusinessName?: string | null
}

const SAMPLE_BRIEF: WebsiteStarterBrief = {
  templateId: 'catalog-showcase',
  businessName: 'Mingalar Fresh Mart',
  audience: 'families and office buyers in Yangon',
  offer: 'Ask about daily groceries and pantry packs for your next shopping trip.',
  proof: 'Share your list and quantities. Confirm current prices, availability and pickup or delivery options with the business.',
  contactHref: '',
}

// Open on the wording for the trade the shop already declared, when it is known. The owner
// answered this during Shop setup; asking again is the kind of small re-asking that makes
// software feel like paperwork.
//
// Pure: same prop in, same opening state out. Held in useState so it is computed once at
// mount, which also means a Shop change in another tab cannot rewrite wording the owner is
// halfway through editing.
function openingState(
  initialTradeId: ShopBusinessTemplateId | null | undefined,
  initialBusinessName: string | null | undefined,
) {
  // The owner's own name wins over the sample's whenever we have one.
  const businessName = initialBusinessName && initialBusinessName.trim()
    ? initialBusinessName
    : SAMPLE_BRIEF.businessName
  if (!initialTradeId) return { tradeId: '', brief: { ...SAMPLE_BRIEF, businessName }, detected: false }
  const drafted = websiteTradeBrief({
    tradeId: initialTradeId,
    businessName,
    contactHref: SAMPLE_BRIEF.contactHref,
  })
  return drafted
    ? { tradeId: initialTradeId as string, brief: drafted, detected: true }
    : { tradeId: '', brief: { ...SAMPLE_BRIEF, businessName }, detected: false }
}

export function WebsiteStarterSetup({
  onCreate, onViewSample, initialTradeId, initialBusinessName,
}: WebsiteStarterSetupProps) {
  const [opening] = useState(() => openingState(initialTradeId, initialBusinessName))
  const [brief, setBrief] = useState<WebsiteStarterBrief>(() => ({ ...opening.brief }))
  const [attempted, setAttempted] = useState(false)
  const [businessStage, setBusinessStage] = useState<'new' | 'existing'>('new')
  const [offeringRows, setOfferingRows] = useState<{ name: string; details: string }[]>([])
  const [importPreview, setImportPreview] = useState<{ name: string; details: string }[] | null>(null)
  const [importMessage, setImportMessage] = useState('')
  const [importBusy, setImportBusy] = useState(false)
  const importAttempt = useRef(0)
  const [tradeId, setTradeId] = useState(opening.tradeId)
  // The wording currently on offer from us rather than from the owner. Starts as whatever we
  // opened with, so that opening draft counts as "not yet edited" and picking a trade
  // replaces it.
  const [lastDrafted, setLastDrafted] = useState<WebsiteStarterBrief>(() => ({ ...opening.brief }))
  const starterFormRef = useRef<HTMLFormElement>(null)
  const issues = websiteStarterBriefIssues(brief)
  if (offeringRows.some((row) => row.name.includes('|'))) issues.push({ field: 'offerings', message: 'Use a name without the | character.' })
  const issueFor = (field: keyof WebsiteStarterBrief) => (
    attempted ? issues.find((issue) => issue.field === field) : undefined
  )
  const businessNameIssue = issueFor('businessName')
  const audienceIssue = issueFor('audience')
  const contactIssue = issueFor('contactHref')
  const offerIssue = issueFor('offer')
  const proofIssue = issueFor('proof')
  const offeringsIssue = issueFor('offerings')

  function updateOfferings(rows: { name: string; details: string }[]) {
    setOfferingRows(rows)
    setBrief((current) => ({ ...current, offerings: rows.map((row) => `${row.name} | ${row.details.replace(/\s+/gu, ' ')}`).join('\n') }))
  }

  async function previewOfferingFile(file: File | undefined) {
    const attempt = ++importAttempt.current
    setImportPreview(null)
    setImportMessage('')
    if (!file) { setImportBusy(false); return }
    setImportBusy(true)
    try {
      if (!file.name.toLowerCase().endsWith('.csv') || file.size > 64 * 1024) throw new Error('Choose a .csv file smaller than 64 KB.')
      const { previewWebsiteOfferingCsv } = await import('./website-offering-import')
      const rows = previewWebsiteOfferingCsv(await file.text())
      if (attempt !== importAttempt.current) return
      setImportPreview(rows)
      setImportMessage('Preview only. Check every entry against your current menu or service list before adding it. Nothing was uploaded.')
    } catch (error) {
      if (attempt === importAttempt.current) setImportMessage(error instanceof Error ? error.message : 'Could not read this file. Your existing entries are unchanged.')
    } finally {
      if (attempt === importAttempt.current) setImportBusy(false)
    }
  }

  function updateBrief<Field extends keyof WebsiteStarterBrief>(field: Field, value: WebsiteStarterBrief[Field]) {
    setBrief((current) => ({ ...current, [field]: value }))
  }

  // Choosing a trade rewrites the wording -- but only the wording nobody has changed.
  //
  // The rule is that this never destroys something the owner typed. We remember exactly what
  // was last drafted, and a field is only replaced while it still holds that draft verbatim.
  // Once the owner edits a line it stops matching and is theirs from then on, so switching
  // trade to compare options cannot silently throw away their sentence.
  function chooseTrade(nextTradeId: string) {
    setTradeId(nextTradeId)
    const drafted = websiteTradeBrief({
      tradeId: nextTradeId as ShopBusinessTemplateId,
      businessName: brief.businessName,
      contactHref: brief.contactHref,
    })
    if (!drafted) return
    setBrief((current) => ({
      ...current,
      templateId: current.templateId === lastDrafted.templateId ? drafted.templateId : current.templateId,
      audience: current.audience === lastDrafted.audience ? drafted.audience : current.audience,
      offer: current.offer === lastDrafted.offer ? drafted.offer : current.offer,
      proof: current.proof === lastDrafted.proof ? drafted.proof : current.proof,
    }))
    setLastDrafted(drafted)
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setAttempted(true)
    if (issues.length > 0) {
      requestAnimationFrame(() => {
        const firstInvalidField = starterFormRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')
        firstInvalidField?.scrollIntoView({ block: 'center' })
        firstInvalidField?.focus({ preventScroll: true })
      })
      return
    }
    onCreate(brief)
  }

  return (
    <section className="website-editor-panel website-starter-setup" aria-labelledby="website-starter-title">
      <header className="website-panel-head">
        <div>
          <span className="website-eyebrow">Prepared by SuperMega</span>
          <h2 id="website-starter-title">Tell us the basics. We prepare the Website.</h2>
          <p>Give us only the details that must be correct. SuperMega drafts a private three-page Website for your review; nothing is published from here.</p>
        </div>
        <span className="website-status is-draft">Private draft</span>
      </header>

      <form className="website-editor-scroll website-starter-form" noValidate onSubmit={submit} ref={starterFormRef}>
        <footer className="website-starter-actions">
          <button className="website-button is-secondary" onClick={onViewSample} type="button">View example</button>
          <button className="website-button is-primary" type="submit">Prepare private draft</button>
        </footer>

        <label className="website-starter-trade">
          <span>Business type</span>
          <select onChange={(event) => chooseTrade(event.target.value)} value={tradeId}>
            <option value="">Start from the sample</option>
            {websiteTradeBriefOptions().map((trade) => (
              <option key={trade.id} value={trade.id}>{trade.label}</option>
            ))}
          </select>
          <small>
            {opening.detected
              ? 'Taken from your Shop setup. Change it only if this Website is for another business; anything you have already written stays yours.'
              : 'SuperMega uses this to start with relevant wording. Anything you have already written stays yours.'}
          </small>
        </label>

        <div className="website-form-grid two-columns website-starter-identity-grid">
          <label>
            <span>Is the business already operating?</span>
            <select value={businessStage} onChange={(event) => setBusinessStage(event.target.value as 'new' | 'existing')} aria-describedby="website-business-stage-help">
              <option value="new">New business or planning a launch</option>
              <option value="existing">Existing business</option>
            </select>
            <small id="website-business-stage-help">{businessStage === 'existing'
              ? 'Reuse your approved menu, service list or catalog in the featured entries below. Check current prices and details first. This form does not scrape websites or import customer records; changing this choice keeps your draft.'
              : 'Start with the services or products you are ready to describe. Leave unconfirmed prices out. This creates a private draft, not a booking, live store or published Website.'}</small>
          </label>
          <label>
            <span>Starting layout <small>Optional</small></span>
            <select onChange={(event) => updateBrief('templateId', event.target.value as WebsiteStarterBrief['templateId'])} value={brief.templateId}>
              {websiteStarterTemplates.map((template) => <option key={template.id} value={template.id}>{template.label} — {template.detail}</option>)}
            </select>
          </label>
          <label>
            <span>Business name</span>
            <input
              aria-describedby={businessNameIssue ? 'website-starter-error-business-name' : undefined}
              aria-invalid={Boolean(businessNameIssue)}
              autoComplete="organization"
              maxLength={50}
              onChange={(event) => updateBrief('businessName', event.target.value)}
              placeholder="e.g. Shwe Family Store"
              required
              value={brief.businessName}
            />
            {businessNameIssue ? <small className="website-field-error" id="website-starter-error-business-name">{businessNameIssue.message}</small> : null}
          </label>
          <label>
            <span>Main customers</span>
            <input
              aria-describedby={audienceIssue ? 'website-starter-error-audience' : undefined}
              aria-invalid={Boolean(audienceIssue)}
              maxLength={70}
              onChange={(event) => updateBrief('audience', event.target.value)}
              placeholder="e.g. Families in Yangon"
              required
              value={brief.audience}
            />
            {audienceIssue ? <small className="website-field-error" id="website-starter-error-audience">{audienceIssue.message}</small> : null}
          </label>
          <label>
            <span>Contact link <small>Optional</small></span>
            <input
              aria-describedby={contactIssue ? 'website-starter-error-contact' : undefined}
              aria-invalid={Boolean(contactIssue)}
              autoCapitalize="none"
              maxLength={160}
              onChange={(event) => updateBrief('contactHref', event.target.value)}
              placeholder="https://m.me/your-business"
              spellCheck={false}
              type="url"
              value={brief.contactHref}
            />
            {contactIssue ? <small className="website-field-error" id="website-starter-error-contact">{contactIssue.message}</small> : null}
          </label>
        </div>

        <div className="website-form-grid two-columns website-starter-copy-grid">
          <label>
            <span>What do you sell or provide?</span>
            <textarea
              aria-describedby={offerIssue ? 'website-starter-error-offer' : undefined}
              aria-invalid={Boolean(offerIssue)}
              maxLength={140}
              onChange={(event) => updateBrief('offer', event.target.value)}
              placeholder="e.g. Fresh everyday groceries with same-day local delivery."
              required
              rows={3}
              value={brief.offer}
            />
            {offerIssue ? <small className="website-field-error" id="website-starter-error-offer">{offerIssue.message}</small> : null}
          </label>

          <label>
            <span>What should customers know before contacting you?</span>
            <textarea
              aria-describedby={proofIssue ? 'website-starter-proof-help website-starter-error-proof' : 'website-starter-proof-help'}
              aria-invalid={Boolean(proofIssue)}
              maxLength={360}
              onChange={(event) => updateBrief('proof', event.target.value)}
              placeholder="e.g. Details to confirm, useful inquiry information, or a verified business fact."
              required
              rows={3}
              value={brief.proof}
            />
            <small id="website-starter-proof-help">Review the suggested wording against the actual business. Use approved public copy only; do not paste customer data. SuperMega will prepare the finished revision for your review.</small>
            {proofIssue ? <small className="website-field-error" id="website-starter-error-proof">{proofIssue.message}</small> : null}
          </label>
        </div>

        <details open={offeringsIssue ? true : undefined}>
          <summary>Menu, services or featured products — optional</summary>
          <p id="website-offerings-help">Add up to four featured entries using approved public details. They appear on your Services, Catalog or About page. Displaying a price does not collect payment.</p>
          {businessStage === 'existing' ? <div>
            <label><span>Preview an existing CSV — optional</span><input type="file" accept=".csv,text/csv" disabled={importBusy} onChange={(event) => { void previewOfferingFile(event.target.files?.[0]); event.target.value = '' }} aria-describedby="website-import-help website-import-status" /></label>
            <p id="website-import-help">Columns: name, description. Up to four featured entries; include approved prices or durations in description. The file stays on this device. Existing entries are never replaced by import.</p>
            <p role="status" id="website-import-status">{importBusy ? 'Reading local file…' : importMessage}</p>
            {importBusy ? <button type="button" className="website-button is-secondary" onClick={() => { importAttempt.current++; setImportBusy(false); setImportPreview(null); setImportMessage('Import canceled. Your draft is unchanged.') }}>Cancel file preview</button> : null}
            {importPreview ? <div><ul>{importPreview.map(row => <li key={row.name}><strong>{row.name}</strong> — {row.details}</li>)}</ul><button type="button" className="website-button is-secondary" disabled={offeringRows.length > 0} onClick={() => { if (offeringRows.length) return; updateOfferings(importPreview); setImportPreview(null); setImportMessage('Reviewed entries added to this draft. Nothing is published.') }}>Use reviewed entries</button>{offeringRows.length > 0 ? <p>Keep your existing entries, or remove them explicitly before using this preview.</p> : null}<button type="button" className="website-button is-secondary" onClick={() => setImportPreview(null)}>Discard preview</button></div> : null}
          </div> : null}
          {offeringRows.map((row, index) => (
            <fieldset key={index}>
              <legend>Featured entry {index + 1}</legend>
              <label><span>Name</span><input maxLength={80} value={row.name} aria-invalid={Boolean(offeringsIssue)} aria-describedby="website-offerings-error" onChange={(event) => updateOfferings(offeringRows.map((item, position) => position === index ? { ...item, name: event.target.value } : item))} /></label>
              <label><span>Description, price or duration</span><textarea rows={3} maxLength={360} value={row.details} aria-invalid={Boolean(offeringsIssue)} aria-describedby="website-offerings-help website-offerings-error" onChange={(event) => updateOfferings(offeringRows.map((item, position) => position === index ? { ...item, details: event.target.value } : item))} /></label>
              <button type="button" className="website-button is-secondary" onClick={() => updateOfferings(offeringRows.filter((_, position) => position !== index))}>Remove entry {index + 1}</button>
            </fieldset>
          ))}
          <button type="button" className="website-button is-secondary" disabled={offeringRows.length >= 4} onClick={() => updateOfferings([...offeringRows, { name: '', details: '' }])}>Add featured entry</button>
          <p className="website-field-error" id="website-offerings-error" role="status">{offeringsIssue ? 'Complete each entry with a name and description, or remove the unfinished entry. Names cannot contain |.' : ''}</p>
        </details>
      </form>
    </section>
  )
}
