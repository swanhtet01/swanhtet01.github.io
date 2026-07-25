import { useState, type FormEvent } from 'react'

import {
  websiteStarterBriefIssues,
  type WebsiteStarterBrief,
} from './website-starter'

type WebsiteStarterSetupProps = {
  onCreate: (brief: WebsiteStarterBrief) => void
  onViewSample: () => void
}

const EMPTY_BRIEF: WebsiteStarterBrief = {
  businessName: '',
  audience: '',
  offer: '',
  proof: '',
  contactHref: '',
}

export function WebsiteStarterSetup({ onCreate, onViewSample }: WebsiteStarterSetupProps) {
  const [brief, setBrief] = useState(EMPTY_BRIEF)
  const [attempted, setAttempted] = useState(false)
  const issues = websiteStarterBriefIssues(brief)
  const issueFor = (field: keyof WebsiteStarterBrief) => (
    attempted ? issues.find((issue) => issue.field === field) : undefined
  )
  const businessNameIssue = issueFor('businessName')
  const audienceIssue = issueFor('audience')
  const contactIssue = issueFor('contactHref')
  const offerIssue = issueFor('offer')
  const proofIssue = issueFor('proof')

  function updateBrief(field: keyof WebsiteStarterBrief, value: string) {
    setBrief((current) => ({ ...current, [field]: value }))
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setAttempted(true)
    if (issues.length > 0) return
    onCreate(brief)
  }

  return (
    <section className="website-editor-panel website-starter-setup" aria-labelledby="website-starter-title">
      <header className="website-panel-head">
        <div>
          <span className="website-eyebrow">One-page starter</span>
          <h2 id="website-starter-title">Start with your business</h2>
          <p>Answer five short questions. Preview before saving; no website or domain changes here.</p>
        </div>
        <span className="website-status is-draft">Not saved</span>
      </header>

      <form className="website-editor-scroll website-starter-form" noValidate onSubmit={submit}>
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
            <span>Who is it for?</span>
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
            <span>Main offer</span>
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
            <span>One fact you can support</span>
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

        {attempted && issues.length > 0 ? (
          <div className="website-starter-errors" role="alert">
            <strong>Review the brief</strong>
            <ul>{issues.map((issue) => <li key={issue.field}>{issue.message}</li>)}</ul>
          </div>
        ) : null}

        <footer className="website-starter-actions">
          <button className="website-button is-secondary" onClick={onViewSample} type="button">View sample</button>
          <button className="website-button is-primary" type="submit">Preview my site</button>
        </footer>
      </form>
    </section>
  )
}
