import { useMemo, useState } from 'react'

import { START_REQUEST_PRESETS, normalizePackageKey } from '../lib/publicProductRequestPresets'
import { SAAS_KILLER_TARGETS } from '../lib/saasKillerOfferModel'

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
    id: 'replace-crm-work',
    title: 'Back-office review queue',
    summary: 'Recurring account notes, inbox work, and follow-up packets need one reviewed queue with owner decisions.',
    recommended: 'Recommended first proof: one queue with drafted output and blocked actions.',
    requestedPackage: 'Back Office Workflow Desk',
    workflowLabel: 'Back Office review queue',
  },
  {
    id: 'replace-erp-chasing',
    title: 'Operations action layer',
    summary: 'Managers still chase exceptions, approvals, and explanations outside the record system.',
    recommended: 'Recommended first proof: one reviewed exception board with owner decisions.',
    requestedPackage: 'Factory Operations App Sprint',
    workflowLabel: 'Operations action layer',
  },
  {
    id: 'replace-service-ops',
    title: 'Service desk and close packets',
    summary: 'Items, payment proof, staff notes, and daily close are split across tools and still need a review queue.',
    recommended: 'Recommended first proof: one service desk queue with payment proof and manager closeout.',
    requestedPackage: 'Restaurant POS + Inventory Sprint',
    workflowLabel: 'Service desk and close packets',
  },
  {
    id: 'replace-manual-browser-work',
    title: 'Document extraction ledger',
    summary: 'Files, screenshots, exports, and forms need to become reviewed records before anyone pushes them downstream.',
    recommended: 'Recommended first proof: one reviewed ledger with extracted fields and export-ready rows.',
    requestedPackage: 'Document Extraction Ledger',
    workflowLabel: 'Document Extraction Ledger',
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

function readInitialRequest() {
  if (typeof window === 'undefined') {
    return { situationId: INTAKE_SITUATIONS[0]?.id ?? '', requestedPackage: '' }
  }
  const search = new URLSearchParams(window.location.search)
  const requested = normalizePackageKey(search.get('package') || search.get('wedge') || search.get('situation') || '')
  const preset = START_REQUEST_PRESETS[requested]
  const directSituation = INTAKE_SITUATIONS.find((situation) => situation.id === requested)
  return {
    situationId: preset?.situationId ?? directSituation?.id ?? INTAKE_SITUATIONS[0]?.id ?? '',
    requestedPackage: preset?.requestedPackage ?? '',
  }
}

export function PublicStartPage() {
  const [initialRequest] = useState(readInitialRequest)
  const [activeSituationId, setActiveSituationId] = useState(initialRequest.situationId)
  const [requestedPackageOverride, setRequestedPackageOverride] = useState(initialRequest.requestedPackage)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [company, setCompany] = useState('')
  const [goal, setGoal] = useState('')
  const [sourceLinks, setSourceLinks] = useState('')
  const [honeypot, setHoneypot] = useState('')
  const [sourceFields] = useState<{ page_path: string; referrer: string; source_url: string }>(() => readSourceFields('/start'))
  const [utm] = useState(() => readUtm())

  const selectedSituation = useMemo(
    () => INTAKE_SITUATIONS.find((situation) => situation.id === activeSituationId) ?? INTAKE_SITUATIONS[0],
    [activeSituationId],
  )

  return (
    <div className="sm-simple-scope">
      <section className="sm-simple-scope-hero" aria-label="Start a workflow build">
        <div>
          <h1>Start one workflow desk.</h1>
          <p>Send one real sample, the first queue, and the approval boundary. We reply with the first proof path, source checklist, and blocked-action rules.</p>
        </div>
      </section>

      <section className="sm-simple-scope-grid" aria-label="Workflow build intake">
        <form action="/api/contact-submissions" className="sm-simple-form" method="post">
          <div className="sm-simple-fields">
            <fieldset className="sm-simple-wide">
              <legend className="text-sm font-black text-[var(--sm-muted)]">Pick 1 starting point</legend>
              <div className="mt-3 grid gap-3">
                {INTAKE_SITUATIONS.map((situation) => {
                  const active = situation.id === activeSituationId
                  return (
                    <label
                      className={`rounded-2xl border p-4 transition ${
                        active ? 'border-[var(--sm-accent)] bg-white shadow-sm' : 'border-slate-200 bg-white/70 hover:border-slate-300'
                      }`}
                      key={situation.id}
                    >
                      <input
                        checked={active}
                        className="sr-only"
                        name="situation"
                        onChange={() => {
                          setActiveSituationId(situation.id)
                          setRequestedPackageOverride('')
                        }}
                        type="radio"
                        value={situation.id}
                      />
                      <div className="flex flex-col gap-2">
                        <strong className="text-base font-black text-[var(--sm-ink)]">{situation.title}</strong>
                        <span className="text-sm text-[var(--sm-muted)]">{situation.summary}</span>
                        <span className="text-xs font-black uppercase tracking-[0.16em] text-[var(--sm-accent)]">{situation.recommended}</span>
                      </div>
                    </label>
                  )
                })}
              </div>
            </fieldset>

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
              <span>First queue to prepare</span>
              <textarea
                className="sm-input"
                name="goal"
                onChange={(event) => setGoal(event.target.value)}
                placeholder="Describe the repeated workflow, who reviews it, and what the first proof should show."
                required
                value={goal}
              />
            </label>
            <label className="sm-simple-wide">
              <span>Source links / files</span>
              <textarea
                className="sm-input"
                name="data"
                onChange={(event) => setSourceLinks(event.target.value)}
                placeholder="Can you send one real sample? Paste Drive links, filenames, columns, exports, screenshots, or browser steps."
                value={sourceLinks}
              />
            </label>
          </div>

          <input aria-hidden="true" className="hidden" name="website" onChange={(event) => setHoneypot(event.target.value)} tabIndex={-1} value={honeypot} />

          <input name="workflow" type="hidden" value={selectedSituation?.workflowLabel ?? 'First workflow build'} />
          <input name="requested_package" type="hidden" value={requestedPackageOverride || selectedSituation?.requestedPackage || 'Workflow Sprint'} />
          <input name="team" type="hidden" value="Buyer" />

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
              Send workflow request
            </button>
            <a className="sm-link" href="/products/">
              Review offer
            </a>
          </div>

          <p className="sm-simple-status">
            Human review first: we confirm scope, source access, and rollout before posting, external claims, automation, or client-system writeback.
          </p>
        </form>

        <aside className="sm-simple-next" aria-label="What happens next">
          <h2>What you get next</h2>
          <ol>
            <li>A receipt with lead + task IDs.</li>
            <li>A recommended workflow desk map.</li>
            <li>A human approval boundary before anything external.</li>
          </ol>
          <div className="mt-5 rounded-3xl border border-slate-200 bg-white/70 p-4">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--sm-accent)]">Replacement examples</p>
            <div className="mt-3 grid gap-2">
              {SAAS_KILLER_TARGETS.slice(0, 4).map((target) => (
                <a className="rounded-2xl bg-[var(--sm-soft)] px-4 py-3 text-sm font-bold text-[var(--sm-ink)]" href={`/contact?package=${target.id}`} key={target.id}>
                  {target.name}
                  <span className="mt-1 block text-xs font-semibold text-[var(--sm-muted)]">{target.firstWorkflow}</span>
                </a>
              ))}
            </div>
          </div>
          <p className="mt-4 text-sm text-[var(--sm-muted)]">Prefer sending links over uploads. If you cannot share, describe the file names, fields, and review step.</p>
          <a className="sm-button-secondary mt-4 inline-flex" href="/intake/">
            More detailed intake
          </a>
        </aside>
      </section>
    </div>
  )
}
