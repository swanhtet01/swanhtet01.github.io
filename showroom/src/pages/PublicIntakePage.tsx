import { useMemo, useState } from 'react'

import { INTAKE_REQUEST_PRESETS, normalizePackageKey } from '../lib/publicProductRequestPresets'

type IntakeSituation = {
  id: string
  title: string
  summary: string
  recommended: string
  requestedPackage: string
  workflowLabel: string
}

const INTAKE_SITUATIONS: IntakeSituation[] = [
  {
    id: 'crm-replacement',
    title: 'Back-office review queue',
    summary: 'Recurring packets, account notes, inbox work, and follow-up tasks need one review queue with owner decisions.',
    recommended: 'Recommended first proof: one managed queue with drafted output, reviewer handoff, and blocked actions.',
    requestedPackage: 'Back Office Workflow Desk',
    workflowLabel: 'Back Office review queue',
  },
  {
    id: 'erp-action-layer',
    title: 'Operations action layer',
    summary: 'The record system exists, but managers still chase exceptions, approvals, and missed follow-ups manually.',
    recommended: 'Recommended first proof: one reviewed action layer with exception status, owner, and approval boundary.',
    requestedPackage: 'Factory Operations App Sprint',
    workflowLabel: 'Operations action layer',
  },
  {
    id: 'service-ops-replacement',
    title: 'Service desk and close packets',
    summary: 'Items, payment proof, staff notes, expenses, and daily close still need reviewed packets before someone acts.',
    recommended: 'Recommended first proof: one service desk queue with payment proof, exceptions, and manager closeout.',
    requestedPackage: 'Restaurant POS + Inventory Sprint',
    workflowLabel: 'Service desk and close packets',
  },
  {
    id: 'data-room-replacement',
    title: 'Document extraction ledger',
    summary: 'PDFs, screenshots, sheets, forms, and exports need to become reviewed records before anyone moves data downstream.',
    recommended: 'Recommended first proof: one reviewed ledger with extracted fields, confidence flags, and export-ready rows.',
    requestedPackage: 'Document Extraction Ledger',
    workflowLabel: 'Document Extraction Ledger',
  },
  {
    id: 'browser-work-replacement',
    title: 'Portal prep and submission packets',
    summary: 'Staff still gather attachments, fill drafts, and prepare portal submissions manually before the final approval step.',
    recommended: 'Recommended first proof: one approved prep queue with blocked submit actions and source proof.',
    requestedPackage: 'Back Office Workflow Desk',
    workflowLabel: 'Portal prep queue',
  },
]

function readUtm() {
  if (typeof window === 'undefined') {
    return { utm_source: '', utm_medium: '', utm_campaign: '', utm_content: '', utm_term: '' }
  }
  const search = new URLSearchParams(window.location.search)
  return {
    utm_source: search.get('utm_source')?.trim() ?? '',
    utm_medium: search.get('utm_medium')?.trim() ?? '',
    utm_campaign: search.get('utm_campaign')?.trim() ?? '',
    utm_content: search.get('utm_content')?.trim() ?? '',
    utm_term: search.get('utm_term')?.trim() ?? '',
  }
}

function readSourceFields(fallbackPath: string) {
  if (typeof window === 'undefined') {
    return {
      page_path: fallbackPath,
      referrer: '',
      source_url: `https://supermega.dev${fallbackPath}`,
    }
  }
  return {
    page_path: `${window.location.pathname}${window.location.search}`,
    referrer: document.referrer || '',
    source_url: window.location.href,
  }
}

function initialSituationFromBrowser() {
  if (typeof window === 'undefined') return INTAKE_SITUATIONS[0]?.id ?? ''
  const search = new URLSearchParams(window.location.search)
  const requested = normalizePackageKey(search.get('package') || search.get('wedge') || search.get('situation') || '')
  const match = INTAKE_SITUATIONS.find((situation) => situation.id === requested)
  if (INTAKE_REQUEST_PRESETS[requested]) return INTAKE_REQUEST_PRESETS[requested].situationId
  return match?.id ?? INTAKE_SITUATIONS[0]?.id ?? ''
}

function initialPackageOverrideFromBrowser() {
  if (typeof window === 'undefined') return ''
  const search = new URLSearchParams(window.location.search)
  const requested = normalizePackageKey(search.get('package') || search.get('wedge') || '')
  return INTAKE_REQUEST_PRESETS[requested]?.requestedPackage ?? ''
}

export function PublicIntakePage() {
  const [activeSituationId, setActiveSituationId] = useState(initialSituationFromBrowser)
  const [requestedPackageOverride, setRequestedPackageOverride] = useState(initialPackageOverrideFromBrowser)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [company, setCompany] = useState('')
  const [approver, setApprover] = useState('')
  const [workflowGoal, setWorkflowGoal] = useState('')
  const [sourceLinks, setSourceLinks] = useState('')
  const [outputFields, setOutputFields] = useState('')
  const [exportDestination, setExportDestination] = useState('')
  const [blockedActions, setBlockedActions] = useState('')
  const [sourceFiles, setSourceFiles] = useState<string[]>([])
  const [honeypot, setHoneypot] = useState('')
  const [sourceFields] = useState<{ page_path: string; referrer: string; source_url: string }>(() => readSourceFields('/intake'))
  const [utm] = useState(() => readUtm())

  const selectedSituation = useMemo(
    () => INTAKE_SITUATIONS.find((situation) => situation.id === activeSituationId) ?? INTAKE_SITUATIONS[0],
    [activeSituationId],
  )

  const compiledGoal = useMemo(() => {
    const parts = [
      workflowGoal.trim(),
      approver.trim() ? `Reviewer or approver: ${approver.trim()}` : '',
      outputFields.trim() ? `Required fields or output: ${outputFields.trim()}` : '',
      exportDestination.trim() ? `Export destination: ${exportDestination.trim()}` : '',
      blockedActions.trim() ? `Blocked actions: ${blockedActions.trim()}` : '',
      sourceLinks.trim() ? `Source links: ${sourceLinks.trim()}` : '',
    ].filter(Boolean)
    return parts.join('\n\n')
  }, [approver, blockedActions, exportDestination, outputFields, sourceLinks, workflowGoal])

  const sourceFileSummary = sourceFiles.length ? sourceFiles.join('; ') : ''

  return (
    <div className="sm-simple-scope">
      <section className="sm-simple-scope-hero" aria-label="Detailed workflow desk intake">
        <div>
          <h1>Workflow desk intake.</h1>
          <p>Send the first queue, files, and approval boundary. SuperMega maps one reviewed workflow desk before any risky integration runs.</p>
        </div>
      </section>

      <section className="sm-simple-scope-grid" aria-label="Intake form">
        <form action="/api/contact-submissions" className="sm-simple-form" encType="multipart/form-data" method="post">
          <div className="sm-simple-fields">
            <label className="sm-simple-wide">
              <span>Starting point</span>
              <select
                className="sm-input"
                name="situation"
                onChange={(event) => {
                  setActiveSituationId(event.target.value)
                  setRequestedPackageOverride('')
                }}
                value={activeSituationId}
              >
                {INTAKE_SITUATIONS.map((situation) => (
                  <option key={situation.id} value={situation.id}>
                    {situation.title}
                  </option>
                ))}
              </select>
            </label>

            <div className="sm-simple-wide rounded-2xl border border-slate-200 bg-white/70 p-4">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--sm-accent)]">Recommended first step</p>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">{selectedSituation?.recommended}</p>
            </div>

            <label>
              <span>Name</span>
              <input className="sm-input" name="name" onChange={(event) => setName(event.target.value)} required value={name} />
            </label>
            <label>
              <span>Work email</span>
              <input className="sm-input" name="email" onChange={(event) => setEmail(event.target.value)} required type="email" value={email} />
            </label>
            <label className="sm-simple-wide">
              <span>Company</span>
              <input className="sm-input" name="company" onChange={(event) => setCompany(event.target.value)} required value={company} />
            </label>
            <label className="sm-simple-wide">
              <span>Reviewer or approver</span>
              <input
                className="sm-input"
                name="approver"
                onChange={(event) => setApprover(event.target.value)}
                placeholder="Owner, operations lead, finance reviewer, admin manager"
                value={approver}
              />
            </label>
            <label className="sm-simple-wide">
              <span>First queue to prepare</span>
              <textarea
                className="sm-input"
                onChange={(event) => setWorkflowGoal(event.target.value)}
                placeholder="Describe the repeated job, when it arrives, who reviews it, and what done looks like."
                required
                value={workflowGoal}
              />
            </label>
            <label className="sm-simple-wide">
              <span>Upload source files</span>
              <input
                className="sm-input sm-file-input"
                multiple
                name="source_files"
                onChange={(event) => {
                  const files = Array.from(event.currentTarget.files ?? []).map((file) => `${file.name} (${Math.ceil(file.size / 1024)} KB)`)
                  setSourceFiles(files)
                }}
                type="file"
              />
              {sourceFiles.length ? (
                <div className="sm-upload-list" aria-live="polite">
                  {sourceFiles.map((file) => (
                    <span key={file}>{file}</span>
                  ))}
                </div>
              ) : null}
            </label>
            <label className="sm-simple-wide">
              <span>Source links or notes</span>
              <textarea
                className="sm-input"
                onChange={(event) => setSourceLinks(event.target.value)}
                placeholder="Paste Drive links, sample filenames, exports, screenshots, folders, or notes about the source packet."
                value={sourceLinks}
              />
            </label>
            <label className="sm-simple-wide">
              <span>Required fields or output</span>
              <textarea
                className="sm-input"
                name="output_fields"
                onChange={(event) => setOutputFields(event.target.value)}
                placeholder="Example: invoice number, owner, due date, status, exception reason, next action."
                value={outputFields}
              />
            </label>
            <label className="sm-simple-wide">
              <span>Export destination</span>
              <input
                className="sm-input"
                name="export_destination"
                onChange={(event) => setExportDestination(event.target.value)}
                placeholder="CSV export, reviewed sheet, client room register, inbox draft, portal prep packet"
                value={exportDestination}
              />
            </label>
            <label className="sm-simple-wide">
              <span>Blocked actions</span>
              <textarea
                className="sm-input"
                name="blocked_actions"
                onChange={(event) => setBlockedActions(event.target.value)}
                placeholder="What must never send, submit, write back, bill, or change without approval?"
                value={blockedActions}
              />
            </label>
          </div>

          <input aria-hidden="true" className="hidden" name="website" onChange={(event) => setHoneypot(event.target.value)} tabIndex={-1} value={honeypot} />

          <input name="goal" type="hidden" value={compiledGoal} />
          <input name="data" type="hidden" value={[sourceLinks, sourceFileSummary].filter(Boolean).join(' | ')} />
          <input name="workflow" type="hidden" value={selectedSituation?.workflowLabel ?? 'First workflow desk'} />
          <input name="requested_package" type="hidden" value={requestedPackageOverride || selectedSituation?.requestedPackage || 'Back Office Workflow Desk'} />
          <input name="team" type="hidden" value={approver.trim() ? approver.trim() : 'Reviewer'} />
          <input name="source_file_names" type="hidden" value={sourceFileSummary} />
          <input name="source_file_count" type="hidden" value={String(sourceFiles.length)} />

          <input name="page_path" type="hidden" value={sourceFields.page_path} />
          <input name="referrer" type="hidden" value={sourceFields.referrer} />
          <input name="source_url" type="hidden" value={sourceFields.source_url} />

          <input name="utm_source" type="hidden" value={utm.utm_source} />
          <input name="utm_medium" type="hidden" value={utm.utm_medium} />
          <input name="utm_campaign" type="hidden" value={utm.utm_campaign} />
          <input name="utm_content" type="hidden" value={utm.utm_content} />
          <input name="utm_term" type="hidden" value={utm.utm_term} />

          <div className="sm-simple-action-row">
            <button className="sm-button-primary" type="submit">
              Send workflow intake
            </button>
            <a className="sm-link" href="/products/">
              Review offer
            </a>
          </div>

          <p className="sm-simple-status">
            Human scope and price approval required before payment, posting, billing activation, public claims, production deploys, or client-system writeback.
          </p>
        </form>

        <aside className="sm-simple-next" aria-label="Help">
          <h2>Tips</h2>
          <ol>
            <li>Send 5 to 20 real files, screenshots, or exports.</li>
            <li>Name the reviewer and the blocked actions.</li>
            <li>State the fields or export you need first.</li>
          </ol>
          <a className="sm-button-secondary mt-4 inline-flex" href="/contact/">
            Short start
          </a>
        </aside>
      </section>
    </div>
  )
}
