import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import { bookingUrl } from '../content'
import { trackEvent } from '../lib/analytics'
import { STARTER_PACK_DETAILS } from '../lib/salesControl'
import { SOFTWARE_MODULE_DETAILS } from '../lib/softwareCatalog'
import { createContactSubmission, savePublicWorkspaceProfile } from '../lib/workspaceApi'

const requestChecklist = ['Starting product', 'First team', 'Current systems or files', 'Main blocker'] as const
const whatHappensNext = [
  'We reply with the recommended first rollout.',
  'We confirm the first users, connectors, and live scope.',
  'We launch one working workspace, not a demo.',
] as const
const teamOptions = ['Sales', 'Operations', 'Procurement', 'Quality', 'Maintenance', 'Leadership', 'Admin'] as const
const systemOptions = ['Gmail', 'Google Drive', 'Google Sheets', 'Google Calendar', 'CSV / Excel', 'ERP export', 'CRM export', 'Uploaded files'] as const
const packageOptionsBase = Array.from(
  new Set([
    ...STARTER_PACK_DETAILS.map((item) => item.name),
    ...SOFTWARE_MODULE_DETAILS.filter((item) => item.featured).map((item) => item.name),
    'Revenue System Package',
    'Operations Control Package',
    'Industrial Quality Package',
    'Portal Network Package',
  ]),
)
const commonStacks = [
  'Sales team with Gmail, Sheets, and CSV exports.',
  'Operations team with ERP exports, receiving files, and approvals in chat.',
  'Client service team with Drive folders, email threads, and uploaded documents.',
] as const

type LeadFormState = {
  name: string
  email: string
  company: string
  packageName: string
  team: string
  systems: string[]
  otherSystems: string
  goal: string
}

function requestedPackageFromQuery() {
  if (typeof window === 'undefined') {
    return ''
  }
  return new URLSearchParams(window.location.search).get('package')?.trim() ?? ''
}

function initialFormFromQuery(): LeadFormState {
  const requestedPackage = requestedPackageFromQuery()
  return {
    name: '',
    email: '',
    company: '',
    packageName: requestedPackage || 'Find Clients',
    team: '',
    systems: [],
    otherSystems: '',
    goal: requestedPackage ? `I want to start with ${requestedPackage}.` : '',
  }
}

function selectionClass(active: boolean) {
  return `rounded-full border px-3 py-2 text-sm font-semibold transition ${
    active
      ? 'border-[rgba(37,208,255,0.42)] bg-[rgba(37,208,255,0.12)] text-white'
      : 'border-white/10 bg-white/4 text-[var(--sm-muted)] hover:border-white/16 hover:text-white'
  }`
}

export function ContactPage() {
  const [form, setForm] = useState<LeadFormState>(initialFormFromQuery)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const requestedPackage = requestedPackageFromQuery()
  const productOptions = useMemo(() => {
    const values: string[] = [...packageOptionsBase]
    if (requestedPackage && !values.includes(requestedPackage)) {
      values.unshift(requestedPackage)
    }
    return Array.from(new Set(values))
  }, [requestedPackage])

  const statusText = useMemo(() => {
    if (status === 'saved') {
      return 'Request sent. We will reply with the recommended first rollout and the next step.'
    }
    if (status === 'error') {
      return 'We could not send the request from this host. Try again or book a call.'
    }
    return 'Keep it simple: pick the first product, first team, current systems, and the blocker.'
  }, [status])

  const currentSystemsSummary = useMemo(() => {
    return [...form.systems, form.otherSystems.trim()].filter(Boolean).join(', ')
  }, [form.otherSystems, form.systems])

  function toggleSystem(value: string) {
    setForm((prev) => ({
      ...prev,
      systems: prev.systems.includes(value) ? prev.systems.filter((item) => item !== value) : [...prev.systems, value],
    }))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setStatus('saving')

    try {
      await createContactSubmission({
        name: form.name,
        email: form.email,
        company: form.company,
        workflow: form.packageName,
        requested_package: form.packageName,
        goal: form.goal,
        data: currentSystemsSummary,
        team: form.team,
      })
      savePublicWorkspaceProfile({ name: form.name, email: form.email, company: form.company })
      trackEvent('contact_submit', { source: 'contact_page', mode: 'api', company: form.company, workflow: form.packageName })
      setStatus('saved')
      return
    } catch {
      setStatus('error')
    }
  }

  return (
    <div className="space-y-8">
      <PageIntro
        compact
        eyebrow="Contact"
        title={requestedPackage ? `Start with ${requestedPackage}.` : 'Tell us the first rollout you want live.'}
        description="Pick the first product, the first team, and the current systems involved. We use that to shape the first live rollout."
      />

      <section className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
        <form className="sm-surface p-6 lg:p-8" onSubmit={handleSubmit}>
          {requestedPackage ? (
            <div className="mb-5 sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent)]">Requested product</p>
              <p className="mt-2 text-lg font-semibold">{requestedPackage}</p>
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2">
            <label className="flex flex-col gap-2 text-sm font-semibold text-[var(--sm-muted)]">
              Name
              <input
                className="rounded-xl border border-white/8 bg-white/4 px-3 py-2 text-sm font-normal text-white"
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                required
                type="text"
                value={form.name}
              />
            </label>
            <label className="flex flex-col gap-2 text-sm font-semibold text-[var(--sm-muted)]">
              Email
              <input
                className="rounded-xl border border-white/8 bg-white/4 px-3 py-2 text-sm font-normal text-white"
                onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
                required
                type="email"
                value={form.email}
              />
            </label>
            <label className="flex flex-col gap-2 text-sm font-semibold text-[var(--sm-muted)] md:col-span-2">
              Company
              <input
                className="rounded-xl border border-white/8 bg-white/4 px-3 py-2 text-sm font-normal text-white"
                onChange={(event) => setForm((prev) => ({ ...prev, company: event.target.value }))}
                required
                type="text"
                value={form.company}
              />
            </label>
            <label className="flex flex-col gap-2 text-sm font-semibold text-[var(--sm-muted)] md:col-span-2">
              Starting product or package
              <select
                className="rounded-xl border border-white/8 bg-white/4 px-3 py-2 text-sm font-normal text-white"
                onChange={(event) => setForm((prev) => ({ ...prev, packageName: event.target.value }))}
                required
                value={form.packageName}
              >
                {productOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-5 space-y-5">
            <div>
              <p className="text-sm font-semibold text-[var(--sm-muted)]">First team</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {teamOptions.map((option) => (
                  <button
                    aria-pressed={form.team === option}
                    className={selectionClass(form.team === option)}
                    key={option}
                    onClick={() => setForm((prev) => ({ ...prev, team: option }))}
                    type="button"
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-sm font-semibold text-[var(--sm-muted)]">Current systems and data sources</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {systemOptions.map((option) => (
                  <button
                    aria-pressed={form.systems.includes(option)}
                    className={selectionClass(form.systems.includes(option))}
                    key={option}
                    onClick={() => toggleSystem(option)}
                    type="button"
                  >
                    {option}
                  </button>
                ))}
              </div>
              <label className="mt-3 flex flex-col gap-2 text-sm font-semibold text-[var(--sm-muted)]">
                Other current system or file source
                <input
                  className="rounded-xl border border-white/8 bg-white/4 px-3 py-2 text-sm font-normal text-white"
                  onChange={(event) => setForm((prev) => ({ ...prev, otherSystems: event.target.value }))}
                  placeholder="For example: SAP export, Odoo, Salesforce, shared folder, vendor portal"
                  type="text"
                  value={form.otherSystems}
                />
              </label>
            </div>

            <label className="flex flex-col gap-2 text-sm font-semibold text-[var(--sm-muted)]">
              What do you want fixed first?
              <textarea
                className="min-h-32 rounded-xl border border-white/8 bg-white/4 px-3 py-3 text-sm font-normal text-white"
                onChange={(event) => setForm((prev) => ({ ...prev, goal: event.target.value }))}
                placeholder="For example: sales follow-up is scattered, receiving issues are not visible, the company list is not trusted, or approvals are stuck in chat."
                required
                value={form.goal}
              />
            </label>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <button className="sm-button-accent" type="submit">
              {status === 'saving' ? 'Sending...' : 'Send rollout request'}
            </button>
            <Link className="sm-button-secondary" to="/signup">
              Create workspace
            </Link>
            {bookingUrl ? (
              <a
                className="sm-button-secondary"
                href={bookingUrl}
                onClick={() => trackEvent('contact_calendar_click', { source: 'contact_page' })}
                rel="noreferrer"
                target="_blank"
              >
                Book intro call
              </a>
            ) : null}
          </div>

          <p className="mt-3 text-sm text-[var(--sm-muted)]">{statusText}</p>
        </form>

        <div className="space-y-4">
          <article className="sm-proof-card">
            <p className="sm-kicker text-[var(--sm-accent)]">Send us</p>
            <div className="mt-4 space-y-3">
              {requestChecklist.map((item) => (
                <div className="sm-site-point" key={item}>
                  <span className="sm-site-point-dot" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </article>

          <article className="sm-proof-card">
            <p className="sm-kicker text-[var(--sm-accent-alt)]">What happens next</p>
            <div className="mt-4 space-y-3">
              {whatHappensNext.map((item) => (
                <div className="sm-site-point" key={item}>
                  <span className="sm-site-point-dot" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </article>

          <article className="sm-proof-card">
            <p className="sm-kicker text-[var(--sm-accent)]">Common starting stacks</p>
            <div className="mt-4 space-y-3 text-sm text-white">
              {commonStacks.map((item) => (
                <p key={item}>{item}</p>
              ))}
            </div>
          </article>
        </div>
      </section>
    </div>
  )
}
