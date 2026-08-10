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
  offer: 'Daily groceries, pantry packs, and local delivery with clear pickup windows.',
  proof: 'Public proof: same-day neighborhood delivery, visible prices, and a reviewed phone or chat contact route.',
  contactHref: 'https://m.me/mingalarfreshmart',
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
  const [tradeId, setTradeId] = useState(opening.tradeId)
  // The wording currently on offer from us rather than from the owner. Starts as whatever we
  // opened with, so that opening draft counts as "not yet edited" and picking a trade
  // replaces it.
  const [lastDrafted, setLastDrafted] = useState<WebsiteStarterBrief>(() => ({ ...opening.brief }))
  const starterFormRef = useRef<HTMLFormElement>(null)
  const issues = websiteStarterBriefIssues(brief)
  const issueFor = (field: keyof WebsiteStarterBrief) => (
    attempted ? issues.find((issue) => issue.field === field) : undefined
  )
  const businessNameIssue = issueFor('businessName')
  const audienceIssue = issueFor('audience')
  const contactIssue = issueFor('contactHref')
  const offerIssue = issueFor('offer')
  const proofIssue = issueFor('proof')

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
          <span className="website-eyebrow">Quick setup</span>
          <h2 id="website-starter-title">Change the sample into your website</h2>
          <p>Answer the basics only. SuperMega makes a three-page preview you can check before saving.</p>
        </div>
        <span className="website-status is-draft">Example ready</span>
      </header>

      <form className="website-editor-scroll website-starter-form" noValidate onSubmit={submit} ref={starterFormRef}>
        <footer className="website-starter-actions">
          <button className="website-button is-secondary" onClick={onViewSample} type="button">View sample</button>
          <button className="website-button is-primary" type="submit">Make preview</button>
        </footer>

        <label className="website-starter-trade">
          <span>What kind of business is this?</span>
          <select onChange={(event) => chooseTrade(event.target.value)} value={tradeId}>
            <option value="">Start from the sample</option>
            {websiteTradeBriefOptions().map((trade) => (
              <option key={trade.id} value={trade.id}>{trade.label}</option>
            ))}
          </select>
          <small>
            {opening.detected
              ? 'Taken from your Shop setup. Change it here if this website is for something else — anything you have already written is kept.'
              : 'Fills the wording below for that trade. Anything you have already written is kept.'}
          </small>
        </label>

        <div className="website-form-grid two-columns website-starter-identity-grid">
          <label>
            <span>Type of website</span>
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
            <span>Why should customers trust it?</span>
            <textarea
              aria-describedby={proofIssue ? 'website-starter-proof-help website-starter-error-proof' : 'website-starter-proof-help'}
              aria-invalid={Boolean(proofIssue)}
              maxLength={360}
              onChange={(event) => updateBrief('proof', event.target.value)}
              placeholder="e.g. A real, verifiable reason customers choose this business."
              required
              rows={3}
              value={brief.proof}
            />
            <small id="website-starter-proof-help">Use approved public copy only. Do not paste private customer data.</small>
            {proofIssue ? <small className="website-field-error" id="website-starter-error-proof">{proofIssue.message}</small> : null}
          </label>
        </div>

      </form>
    </section>
  )
}
