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

const missingFieldName = {
  business_name: 'business name',
  audience: 'main customers',
  offer: 'main offer',
  proof: 'one approved fact',
  contact_href: 'contact link',
}

export function WebsiteStarterSetup({ onCreate, onViewSample }: WebsiteStarterSetupProps) {
  const [brief, setBrief] = useState<WebsiteStarterBrief>(() => ({ ...EMPTY_BRIEF }))
  const [mode, setMode] = useState<'brief' | 'details'>('brief')
  const [sourceText, setSourceText] = useState('')
  const [aiState, setAiState] = useState<'idle' | 'working' | 'ready' | 'error'>('idle')
  const [aiNotice, setAiNotice] = useState('')
  const [attempted, setAttempted] = useState(false)
  const starterFormRef = useRef<HTMLFormElement>(null)
  const sourceTextRef = useRef<HTMLTextAreaElement>(null)
  const businessNameRef = useRef<HTMLInputElement>(null)
  const localAiEligible = typeof window !== 'undefined'
    && ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname)
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
      const field = mode === 'brief' ? sourceTextRef.current : businessNameRef.current
      field?.focus({ preventScroll: true })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [mode])

  function updateBrief<Field extends keyof WebsiteStarterBrief>(field: Field, value: WebsiteStarterBrief[Field]) {
    setBrief((current) => ({ ...current, [field]: value }))
  }

  function showDetails() {
    setAttempted(false)
    setAiNotice('Enter only approved public details. You review everything before a preview is made.')
    setMode('details')
  }

  async function draftWithLocalAi() {
    const source = sourceText.trim()
    if (source.length < 20) {
      setAiState('error')
      setAiNotice('Describe the business, customers, offer, and one real reason to trust it.')
      sourceTextRef.current?.focus({ preventScroll: true })
      return
    }
    setAiState('working')
    setAiNotice('Drafting on this device…')
    try {
      const { prepareLocalWebsiteBrief } = await import('./website-ai-brief')
      const draft = await prepareLocalWebsiteBrief(source)
      setBrief({
        templateId: draft.template_id,
        businessName: draft.business_name ?? '',
        audience: draft.audience ?? '',
        offer: draft.offer ?? '',
        proof: draft.proof ?? '',
        contactHref: draft.contact_href ?? '',
      })
      setSourceText('')
      setAttempted(false)
      setAiState('ready')
      setAiNotice(draft.missing_fields.length
        ? `Local draft ready. Add ${draft.missing_fields.map((field) => missingFieldName[field]).join(', ')}.`
        : 'Local draft ready. Check every detail, then make the preview.')
      setMode('details')
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : ''
      setAiState('error')
      setAiNotice(code === 'local_website_brief_unavailable'
        ? 'Local AI is off. Start Ollama or enter the details yourself.'
        : code === 'local_website_brief_request_invalid'
          ? 'Add a clearer business description, then try again.'
          : 'The local model could not make a safe draft. Try again or enter the details yourself.')
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (mode !== 'details') return
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
          <span className="website-eyebrow">Website starter</span>
          <h2 id="website-starter-title">{mode === 'brief' ? 'Describe your business' : 'Review the details'}</h2>
          <p>{mode === 'brief'
            ? 'One short brief becomes a three-page draft. Nothing is saved or published.'
            : 'These details make the editable preview. You approve the next step.'}</p>
        </div>
        <span className="website-status is-draft">{aiState === 'ready' ? 'AI draft' : 'New website'}</span>
      </header>

      <form className="website-editor-scroll website-starter-form" noValidate onSubmit={submit} ref={starterFormRef}>
        {mode === 'brief' ? (
          <>
            <label className="website-starter-brief">
              <span>What should customers know?</span>
              <textarea
                maxLength={1_800}
                onChange={(event) => { setSourceText(event.target.value); setAiState('idle'); setAiNotice('') }}
                placeholder="Example: Mya Beauty Spa in Yangon offers facials and massage for busy women. Open daily since 2024. Contact https://m.me/myabeautyspa"
                ref={sourceTextRef}
                rows={7}
                value={sourceText}
              />
              <small>Use approved public facts only. Do not paste private customer or employee data.</small>
            </label>
            {aiNotice ? <p aria-live="polite" className="website-starter-ai-notice" data-state={aiState}>{aiNotice}</p> : null}
            <footer className="website-starter-actions">
              <button className="website-button is-secondary" onClick={onViewSample} type="button">View example</button>
              <button className="website-button is-primary" disabled={aiState === 'working'} onClick={localAiEligible ? () => void draftWithLocalAi() : showDetails} type="button">
                {aiState === 'working' ? 'Drafting…' : localAiEligible ? 'Draft with local AI' : 'Enter details'}
              </button>
            </footer>
            {localAiEligible ? <button className="website-text-button website-starter-manual" onClick={showDetails} type="button">Enter details manually</button> : null}
          </>
        ) : (
          <>
            {aiNotice ? <p aria-live="polite" className="website-starter-ai-notice" data-state={aiState}>{aiNotice}</p> : null}
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
                  maxLength={60}
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
                <small id="website-starter-proof-help">Use one approved fact. AI is not allowed to invent proof.</small>
                {proofIssue ? <small className="website-field-error" id="website-starter-error-proof">{proofIssue.message}</small> : null}
              </label>
            </div>

            <footer className="website-starter-actions">
              <button className="website-button is-secondary" onClick={() => { setMode('brief'); setAiState('idle'); setAiNotice('') }} type="button">Back</button>
              <button className="website-button is-primary" type="submit">Make preview</button>
            </footer>
          </>
        )}
      </form>
    </section>
  )
}
