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

function initialFormFromQuery(): LeadFormState {
  const params = new URLSearchParams(window.location.search)
  const requestedPackage = params.get('package')?.trim()
  return {
    name: '',
    email: '',
    company: '',
    data: 'Gmail + Drive + Sheets',
    goal: requestedPackage ? `I want to start with ${requestedPackage}.` : '',
  }
}

export function ContactPage() {
  const [form, setForm] = useState<LeadFormState>(initialFormFromQuery)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'saved_local' | 'error'>('idle')
  const [apiReady, setApiReady] = useState(false)
  const liveAppAvailable = hasLiveWorkspaceApp()

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
      return 'Your request was saved. We can now follow it up inside the live app.'
    }
    if (status === 'saved_local') {
      return 'Your request was saved in this browser.'
    }
    if (status === 'error') {
      return 'The request could not be saved. Try again.'
    }
    return 'Keep it short. One workflow is enough to start.'
  }, [status])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setStatus('saving')

    if (apiReady) {
      try {
        await createContactSubmission({
          ...form,
          workflow: 'Website contact',
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
        eyebrow="Contact"
        title="Tell us the first workflow you want fixed."
        description="Keep it simple. Sales, orders, client updates, approvals, receiving, or management review is enough."
      />

      <section className="grid gap-6 lg:grid-cols-[0.88fr_1.12fr]">
        <aside className="sm-terminal p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">What happens next</p>
          <div className="mt-5 grid gap-3">
            <div className="sm-chip text-white">We review the workflow and the tools you already use.</div>
            <div className="sm-chip text-white">We map it to the smallest system that will actually help.</div>
            <div className="sm-chip text-white">We reply with the next rollout step.</div>
          </div>

          <div className="mt-6 grid gap-3">
            {bookingUrl ? (
              <a className="sm-button-secondary text-center" href={bookingUrl} onClick={() => trackEvent('contact_calendar_click', { source: 'contact_page' })} rel="noreferrer" target="_blank">
                Prefer a call
              </a>
            ) : (
              <Link className="sm-button-secondary text-center" to={liveAppAvailable ? '/signup' : '/products'}>
                {liveAppAvailable ? 'Open app' : 'See products'}
              </Link>
            )}
            <Link className="sm-button-secondary text-center" to="/products">
              View products
            </Link>
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
                placeholder="For example: Gmail, Drive, Excel, Facebook page, Viber or WhatsApp"
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
                placeholder="For example: supplier follow-up is scattered, receiving is messy, or directors have no clean board."
                required
                value={form.goal}
              />
            </label>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <button className="sm-button-accent" type="submit">
              {status === 'saving' ? 'Sending...' : 'Contact us'}
            </button>
            {bookingUrl ? (
              <a className="sm-button-secondary" href={bookingUrl} rel="noreferrer" target="_blank">
                Prefer a call
              </a>
            ) : null}
          </div>

          <p className="mt-3 text-sm text-[var(--sm-muted)]">{statusText}</p>
        </form>
      </section>
    </div>
  )
}
