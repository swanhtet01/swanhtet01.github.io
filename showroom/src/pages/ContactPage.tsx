import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import { bookingUrl } from '../content'
import { trackEvent } from '../lib/analytics'
import { checkWorkspaceHealth, createContactSubmission, hasLiveWorkspaceApp } from '../lib/workspaceApi'

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
    data: 'Gmail + Drive + Sheets + WhatsApp',
    goal: requestedPackage ? `I want to start with ${requestedPackage}.` : '',
  }
}

export function ContactPage() {
  const [form, setForm] = useState<LeadFormState>(initialFormFromQuery)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'saved_local' | 'error'>('idle')
  const [apiReady, setApiReady] = useState(false)
  const liveAppAvailable = hasLiveWorkspaceApp()
  const requestedPackage = requestedPackageFromQuery()

  useEffect(() => {
    let cancelled = false
    async function checkApi() {
      const result = await checkWorkspaceHealth()
      if (!cancelled) {
        setApiReady(result.ready)
      }
    }
    void checkApi()
    return () => {
      cancelled = true
    }
  }, [])

  const statusText = useMemo(() => {
    if (status === 'saved') {
      return 'Your onboarding request was saved. We can now follow it up inside the live app.'
    }
    if (status === 'saved_local') {
      return 'Your onboarding request was saved in this browser.'
    }
    if (status === 'error') {
      return 'The onboarding request could not be saved. Try again.'
    }
    return 'Keep it short. One workflow, one team, and one messy data source are enough to start.'
  }, [status])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setStatus('saving')

    if (apiReady) {
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
      setStatus('saved_local')
    } catch {
      setStatus('error')
    }
  }

  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="Start onboarding"
        title="Tell us what you want to fix first."
        description="Tell us the workflow, the tools you use now, and who needs the first live screen. We will map the right product, the connections, and the rollout."
      />

      <section className="grid gap-6 lg:grid-cols-[0.88fr_1.12fr]">
        <aside className="space-y-6">
          <div className="sm-terminal p-6">
            <p className="sm-kicker text-[var(--sm-accent)]">First rollout</p>
            <div className="mt-5 grid gap-3">
              <div className="sm-chip text-white">We map the first workflow and the people who touch it every day.</div>
              <div className="sm-chip text-white">We match it to the right product and live module.</div>
              <div className="sm-chip text-white">We plan the first queue, data import, and review habit.</div>
              <div className="sm-chip text-white">We connect the tools you already use before adding more complexity.</div>
            </div>

            {requestedPackage ? (
              <div className="mt-6 sm-chip text-white">
                <p className="sm-kicker text-[var(--sm-accent)]">Requested product</p>
                <p className="mt-2 text-lg font-semibold">{requestedPackage}</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">We will map the live module, imports, permissions, and the first automation around this starting point.</p>
              </div>
            ) : null}

            <div className="mt-6 grid gap-3">
              {bookingUrl ? (
                <a className="sm-button-secondary text-center" href={bookingUrl} onClick={() => trackEvent('contact_calendar_click', { source: 'contact_page' })} rel="noreferrer" target="_blank">
                  Book onboarding call
                </a>
              ) : (
                <Link className="sm-button-secondary text-center" to={liveAppAvailable ? '/signup' : '/products'}>
                  {liveAppAvailable ? 'Open app' : 'See products'}
                </Link>
              )}
              <Link className="sm-button-secondary text-center" to="/find-companies">
                Open live module
              </Link>
            </div>
          </div>

          <div className="sm-surface p-6">
            <p className="sm-kicker text-[var(--sm-accent)]">Good starting points</p>
            <div className="mt-5 grid gap-3">
              <div className="sm-demo-mini">
                <strong>Find Clients</strong>
                <span>Start here if the commercial team still prospects from search, tabs, and spreadsheets.</span>
              </div>
              <div className="sm-demo-mini">
                <strong>Company List</strong>
                <span>Start here when the names already exist but nobody trusts the spreadsheet enough to work from it.</span>
              </div>
              <div className="sm-demo-mini">
                <strong>Receiving Control</strong>
                <span>Use this first when shortages, holds, and supplier follow-up still live in notes and chat.</span>
              </div>
            </div>
          </div>
        </aside>

        <form className="sm-surface p-6" onSubmit={handleSubmit}>
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
                placeholder="For example: Gmail, Google Drive, Sheets, ERP export, API, CSV, WhatsApp"
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
                placeholder="For example: lead follow-up is scattered, the company list is messy, or receiving issues are not tracked cleanly."
                required
                value={form.goal}
              />
            </label>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <button className="sm-button-accent" type="submit">
              {status === 'saving' ? 'Sending...' : 'Start onboarding'}
            </button>
            {bookingUrl ? (
              <a className="sm-button-secondary" href={bookingUrl} rel="noreferrer" target="_blank">
                Book onboarding call
              </a>
            ) : null}
          </div>

          <p className="mt-3 text-sm text-[var(--sm-muted)]">{statusText}</p>
        </form>
      </section>
    </div>
  )
}
