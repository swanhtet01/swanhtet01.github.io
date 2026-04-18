import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'

import { PageIntro } from '../components/PageIntro'
import { bookingUrl } from '../content'
import { trackEvent } from '../lib/analytics'
import { checkWorkspaceHealth, createContactSubmission } from '../lib/workspaceApi'

const rolloutIncludes = ['One working screen', 'Imported current data', 'Role-based access', 'History and approvals'] as const
const bringToStart = ['One painful workflow', 'One real user group', 'One messy file or data source'] as const
const whatHappensNext = ['We review the workflow', 'We map the right product', 'We scope the first rollout'] as const

type LeadFormState = {
  name: string
  email: string
  company: string
  data: string
  goal: string
}

function requestedPackageFromQuery() {
  return new URLSearchParams(window.location.search).get('package')?.trim() ?? ''
}

function initialFormFromQuery(): LeadFormState {
  const requestedPackage = requestedPackageFromQuery()
  return {
    name: '',
    email: '',
    company: '',
    data: 'Gmail + Drive + Sheets + CSV',
    goal: requestedPackage ? `I want to start with ${requestedPackage}.` : '',
  }
}

export function ContactPage() {
  const [form, setForm] = useState<LeadFormState>(initialFormFromQuery)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'draft_only' | 'error'>('idle')
  const [apiStatus, setApiStatus] = useState<'checking' | 'ready' | 'unavailable'>('checking')
  const requestedPackage = requestedPackageFromQuery()

  useEffect(() => {
    let cancelled = false
    async function checkApi() {
      try {
        const result = await checkWorkspaceHealth()
        if (!cancelled) {
          setApiStatus(result.ready ? 'ready' : 'unavailable')
        }
      } catch {
        if (!cancelled) {
          setApiStatus('unavailable')
        }
      }
    }
    void checkApi()
    return () => {
      cancelled = true
    }
  }, [])

  const statusText = useMemo(() => {
    if (status === 'saved') {
      return 'Your rollout request was saved. We can now follow it up inside the live app.'
    }
    if (status === 'draft_only') {
      return 'This request is saved only on this device. It has not reached SUPERMEGA.dev yet.'
    }
    if (status === 'error') {
      return 'The rollout request could not be saved. Try again.'
    }
    return 'Tell us the first workflow, the current tools, and who needs the first live screen.'
  }, [status])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setStatus('saving')

    if (apiStatus === 'ready') {
      try {
        await createContactSubmission({
          ...form,
          workflow: 'Website onboarding',
        })
        trackEvent('contact_submit', { source: 'contact_page', mode: 'api', company: form.company })
        setStatus('saved')
        return
      } catch {
        setStatus('error')
        return
      }
    }

    try {
      window.localStorage.setItem('supermega_contact_draft', JSON.stringify({ ...form, saved_at: new Date().toISOString() }))
      trackEvent('contact_submit', { source: 'contact_page', mode: 'local' })
      setStatus('draft_only')
    } catch {
      setStatus('error')
    }
  }

  return (
    <div className="space-y-8">
      <PageIntro
        compact
        eyebrow="Start rollout"
        title="Tell us the first workflow to fix."
        description="Use this page to start a customer rollout. We use it to scope the right product, connect the current data, and set up the first live screen."
      />

      <section className="grid gap-4 md:grid-cols-3">
        <article className="sm-proof-card">
          <p className="sm-kicker text-[var(--sm-accent)]">First rollout includes</p>
          <div className="mt-4 space-y-2">
            {rolloutIncludes.map((item) => (
              <p className="text-sm text-white" key={item}>
                {item}
              </p>
            ))}
          </div>
        </article>
        <article className="sm-proof-card">
          <p className="sm-kicker text-[var(--sm-accent)]">Bring to start</p>
          <div className="mt-4 space-y-2">
            {bringToStart.map((item) => (
              <p className="text-sm text-white" key={item}>
                {item}
              </p>
            ))}
          </div>
        </article>
        <article className="sm-proof-card">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">What happens next</p>
          <div className="mt-4 space-y-2">
            {whatHappensNext.map((item) => (
              <p className="text-sm text-white" key={item}>
                {item}
              </p>
            ))}
          </div>
        </article>
      </section>

      <section>
        <form className="sm-surface p-6 lg:p-8" onSubmit={handleSubmit}>
          {requestedPackage ? (
            <div className="mb-5 sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent)]">Requested product</p>
              <p className="mt-2 text-lg font-semibold">{requestedPackage}</p>
            </div>
          ) : null}
          {apiStatus === 'unavailable' ? (
            <div className="mb-5 sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Live intake unavailable</p>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">
                This page cannot send your request to the live backend right now. The form button below only saves a draft on this device. Use the rollout call button for immediate contact.
              </p>
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
              What are you using now?
              <input
                className="rounded-xl border border-white/8 bg-white/4 px-3 py-2 text-sm font-normal text-white"
                onChange={(event) => setForm((prev) => ({ ...prev, data: event.target.value }))}
                placeholder="For example: Gmail, Google Drive, Sheets, CSV, ERP export, uploaded files, API"
                required
                type="text"
                value={form.data}
              />
            </label>
            <label className="flex flex-col gap-2 text-sm font-semibold text-[var(--sm-muted)] md:col-span-2">
              What do you want fixed first?
              <textarea
                className="min-h-48 rounded-xl border border-white/8 bg-white/4 px-3 py-3 text-sm font-normal text-white"
                onChange={(event) => setForm((prev) => ({ ...prev, goal: event.target.value }))}
                placeholder="For example: lead follow-up is scattered, the company list is not trusted, receiving issues are not visible, or approvals are stuck in chat."
                required
                value={form.goal}
              />
            </label>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <button className="sm-button-accent" type="submit">
              {status === 'saving' ? 'Sending...' : apiStatus === 'ready' ? 'Send rollout request' : 'Save draft on this device'}
            </button>
            {bookingUrl ? (
              <a
                className="sm-button-secondary"
                href={bookingUrl}
                onClick={() => trackEvent('contact_calendar_click', { source: 'contact_page' })}
                rel="noreferrer"
                target="_blank"
              >
                Book rollout call
              </a>
            ) : null}
          </div>

          <p className="mt-3 text-sm text-[var(--sm-muted)]">{statusText}</p>
        </form>
      </section>
    </div>
  )
}
