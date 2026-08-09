import { useEffect, useRef, useState, type FormEvent } from 'react'

import {
  websiteStarterTemplates,
  websiteStarterBriefIssues,
  type WebsiteStarterBrief,
} from './website-starter'

type WebsiteStarterSetupProps = {
  onCreate: (brief: WebsiteStarterBrief) => void
  onViewSample: () => void
}

const EMPTY_BRIEF: WebsiteStarterBrief = {
  templateId: 'business-presence',
  businessName: '',
  audience: '',
  offer: '',
  proof: '',
  contactHref: '',
}

export function WebsiteStarterSetup({ onCreate, onViewSample }: WebsiteStarterSetupProps) {
  const [brief, setBrief] = useState<WebsiteStarterBrief>(() => ({ ...EMPTY_BRIEF }))
  const [attempted, setAttempted] = useState(false)
  const starterFormRef = useRef<HTMLFormElement>(null)
  const businessNameRef = useRef<HTMLInputElement>(null)
  const issues = websiteStarterBriefIssues(brief)
  const issueFor = (field: keyof WebsiteStarterBrief) => (
    attempted ? issues.find((issue) => issue.field === field) : undefined
  )
  const businessNameIssue = issueFor('businessName')
  const audienceIssue = issueFor('audience')
  const contactIssue = issueFor('contactHref')
  const offerIssue = issueFor('offer')
  const proofIssue = issueFor('proof')

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      businessNameRef.current?.focus({ preventScroll: true })
      businessNameRef.current?.select()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [])

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
          <span className="website-eyebrow">Quick setup</span>
          <h2 id="website-starter-title">Start your website</h2>
          <p>Five answers make a three-page preview. Nothing is saved yet.</p>
        </div>
        <span className="website-status is-draft">New website</span>
      </header>

      <form className="website-editor-scroll website-starter-form" noValidate onSubmit={submit} ref={starterFormRef}>
        <footer className="website-starter-actions">
          <button className="website-button is-secondary" onClick={onViewSample} type="button">View example</button>
          <button className="website-button is-primary" type="submit">Make preview</button>
        </footer>

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
              data-website-starter-primary-field="true"
              maxLength={50}
              onChange={(event) => updateBrief('businessName', event.target.value)}
              placeholder="e.g. Shwe Family Store"
              ref={businessNameRef}
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
