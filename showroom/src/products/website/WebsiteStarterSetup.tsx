import { useRef, useState, type FormEvent } from 'react'

import {
  websiteStarterBriefIssues,
  websiteStarterTemplates,
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
  templateId: 'business-presence',
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
  const starterFormRef = useRef<HTMLFormElement>(null)
  const issues = websiteStarterBriefIssues(brief)
  const issueFor = (field: keyof WebsiteStarterBrief) => (
    attempted ? issues.find((issue) => issue.field === field) : undefined
  )
  const businessNameIssue = issueFor('businessName')
  const offerIssue = issueFor('offer')
  const contactIssue = issueFor('contactHref')

  function updateBrief<Field extends keyof WebsiteStarterBrief>(field: Field, value: WebsiteStarterBrief[Field]) {
    setBrief((current) => ({ ...current, [field]: value }))
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
          <span className="website-eyebrow">Sites</span>
          <h2 id="website-starter-title">Start your website</h2>
          <p>Choose a starting point. Add pages, services and products whenever you need them.</p>
        </div>
        <span className="website-status is-draft">Not published</span>
      </header>

      <form className="website-editor-scroll website-starter-form" noValidate onSubmit={submit} ref={starterFormRef}>
        {opening.detected ? <p className="website-starter-context">We used the business details already saved in Shop. You can change anything below.</p> : null}

        <div aria-label="Choose a starting point" className="website-template-grid" role="group">
          {websiteStarterTemplates.map((template) => {
            const label = template.id === 'business-presence' ? 'Business site'
              : template.id === 'lead-generation' ? 'Get inquiries'
                : 'Show products'
            return <button aria-label={`${label}. ${template.detail}`} aria-pressed={brief.templateId === template.id} className={`website-button website-template-card${brief.templateId === template.id ? ' is-primary' : ' is-secondary'}`} key={template.id} onClick={() => updateBrief('templateId', template.id)} type="button">
              <strong>{label}</strong><small>{template.detail}</small>
            </button>
          })}
        </div>

        <div className="website-form-grid two-columns website-starter-essentials">
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
            <span>What do you sell or provide?</span>
            <textarea
              aria-describedby={offerIssue ? 'website-starter-error-offer' : undefined}
              aria-invalid={Boolean(offerIssue)}
              maxLength={140}
              onChange={(event) => updateBrief('offer', event.target.value)}
              placeholder="e.g. Fresh everyday groceries with same-day local delivery."
              required
              rows={2}
              value={brief.offer}
            />
            {offerIssue ? <small className="website-field-error" id="website-starter-error-offer">{offerIssue.message}</small> : null}
          </label>
        </div>

        <label className="website-starter-contact">
          <span>How can customers reach you? <small>Optional</small></span>
          <input
            aria-describedby={contactIssue ? 'website-starter-error-contact' : undefined}
            aria-invalid={Boolean(contactIssue)}
            autoComplete="url"
            maxLength={160}
            onChange={(event) => updateBrief('contactHref', event.target.value)}
            placeholder="https://facebook.com/yourpage or https://example.com/contact"
            value={brief.contactHref}
          />
          {contactIssue ? <small className="website-field-error" id="website-starter-error-contact">{contactIssue.message}</small> : null}
        </label>

        <footer className="website-starter-actions">
          <button className="website-button is-primary" type="submit">Create my website</button>
        </footer>
      </form>
    </section>
  )
}
