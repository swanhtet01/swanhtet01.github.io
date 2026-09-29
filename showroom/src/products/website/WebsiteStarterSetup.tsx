import { useRef, useState, type FormEvent } from 'react'

import {
  websiteStarterBriefIssues,
  type WebsiteStarterBrief,
} from './website-starter'
import { websiteTradeBrief } from './website-trade-brief'
import type { ShopBusinessTemplateId } from '../shop/business-templates'

type WebsiteStarterSetupProps = {
  onCreate: (brief: WebsiteStarterBrief) => void
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

const EMPTY_BRIEF: WebsiteStarterBrief = {
  templateId: 'catalog-showcase',
  businessName: '',
  audience: '',
  offer: '',
  proof: '',
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
  // The owner's own name wins over the starting context whenever we have one.
  const businessName = initialBusinessName && initialBusinessName.trim()
    ? initialBusinessName
    : EMPTY_BRIEF.businessName
  if (!initialTradeId) return { brief: { ...EMPTY_BRIEF, businessName }, detected: false }
  const drafted = websiteTradeBrief({
    tradeId: initialTradeId,
    businessName,
    contactHref: EMPTY_BRIEF.contactHref,
  })
  return drafted
    ? { brief: drafted, detected: true }
    : { brief: { ...EMPTY_BRIEF, businessName }, detected: false }
}

export function WebsiteStarterSetup({
  onCreate, initialTradeId, initialBusinessName,
}: WebsiteStarterSetupProps) {
  const [opening] = useState(() => openingState(initialTradeId, initialBusinessName))
  const [brief, setBrief] = useState<WebsiteStarterBrief>(() => ({ ...opening.brief }))
  const [attempted, setAttempted] = useState(false)
  const [offeringRows, setOfferingRows] = useState<{ name: string; details: string }[]>([])
  const [importPreview, setImportPreview] = useState<{ name: string; details: string }[] | null>(null)
  const [importMessage, setImportMessage] = useState('')
  const [importBusy, setImportBusy] = useState(false)
  const importAttempt = useRef(0)
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

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (importBusy || importPreview) {
      setImportMessage(importBusy ? 'Wait for the file preview, or cancel it before preparing your draft.' : 'Use reviewed entries or discard the preview before preparing your draft.')
      return
    }
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
          <span className="website-eyebrow">Sites</span>
          <h2 id="website-starter-title">Tell us about the business</h2>
          <p>SuperMega will prepare the pages, wording and navigation.</p>
        </div>
        <span className="website-status is-draft">Not published</span>
      </header>

      <form className="website-editor-scroll website-starter-form" noValidate onSubmit={submit} ref={starterFormRef}>
        {opening.detected ? <p className="website-starter-context">We used the business details already saved in Shop. You can change anything below.</p> : null}

        <div className="website-form-grid two-columns website-starter-identity-grid">
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
            <small id="website-starter-proof-help">Use accurate public details, such as opening hours or service areas.</small>
            {proofIssue ? <small className="website-field-error" id="website-starter-error-proof">{proofIssue.message}</small> : null}
          </label>
        </div>

        <details open={offeringsIssue ? true : undefined}>
          <summary>Menu, services or featured products — optional</summary>
          <p id="website-offerings-help">Add up to four featured entries using approved public details. They appear on your Services, Catalog or About page. Displaying a price does not collect payment.</p>
          <div>
            <label><span>Import services or products — optional</span><input type="file" accept=".csv,text/csv" disabled={importBusy} onChange={(event) => { void previewOfferingFile(event.target.files?.[0]); event.target.value = '' }} aria-describedby="website-import-help website-import-status" /></label>
            <p id="website-import-help">Columns: name, description. Up to four featured entries; include approved prices or durations in description. The file stays on this device. Existing entries are never replaced by import.</p>
            <p role="status" id="website-import-status">{importBusy ? 'Reading local file…' : importMessage}</p>
            {importBusy ? <button type="button" className="website-button is-secondary" onClick={() => { importAttempt.current++; setImportBusy(false); setImportPreview(null); setImportMessage('Import canceled. Your website is unchanged.') }}>Cancel import</button> : null}
            {importPreview ? <div><ul>{importPreview.map(row => <li key={row.name}><strong>{row.name}</strong> — {row.details}</li>)}</ul><button type="button" className="website-button is-secondary" disabled={offeringRows.length > 0} onClick={() => { if (offeringRows.length) return; updateOfferings(importPreview); setImportPreview(null); setImportMessage('Reviewed entries added. Nothing is published.') }}>Add reviewed entries</button>{offeringRows.length > 0 ? <p>Keep your existing entries, or remove them before using this file.</p> : null}<button type="button" className="website-button is-secondary" onClick={() => setImportPreview(null)}>Discard file</button></div> : null}
          </div>
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

        <footer className="website-starter-actions">
          <button className="website-button is-primary" type="submit" disabled={importBusy || Boolean(importPreview)} aria-describedby={importBusy || importPreview ? 'website-import-pending' : undefined}>Create website</button>
          {importBusy || importPreview ? <p id="website-import-pending" role="status">{importBusy ? 'Wait for the file to finish, or cancel the import.' : 'Add the reviewed entries or discard the file before continuing.'}</p> : null}
        </footer>
      </form>
    </section>
  )
}
