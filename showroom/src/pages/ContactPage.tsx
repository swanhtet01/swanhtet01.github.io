import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import { bookingUrl } from '../content'
import { trackEvent } from '../lib/analytics'
import { checkWorkspaceHealth, createContactSubmission, hasLiveWorkspaceApp } from '../lib/workspaceApi'

const moduleOptions = ['Sales OS', 'Operations OS', 'Founder Brief', 'Client Portal', 'Approval Flow', 'Commerce Back Office', 'QR Ordering'] as const

type LeadFormState = {
  name: string
  email: string
  company: string
  module: string
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
    module: requestedPackage || 'Sales OS',
    data: 'Gmail + Drive + Sheets',
    goal: requestedPackage ? `We want to start with ${requestedPackage}.` : '',
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
    return 'Keep it short. One module is enough to start.'
  }, [status])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setStatus('saving')

    if (apiReady) {
      try {
        await createContactSubmission({
          ...form,
          workflow: form.module,
        })
        trackEvent('contact_submit', { source: 'contact_page', mode: 'api', company: form.company, module: form.module })
        setStatus('saved')
        return
      } catch {
        setStatus('error')
        return
      }
    }

    try {
      window.localStorage.setItem('supermega_contact_draft', JSON.stringify({ ...form, saved_at: new Date().toISOString() }))
      trackEvent('contact_submit', { source: 'contact_page', mode: 'local', module: form.module })
      setStatus('saved_local')
    } catch {
      setStatus('error')
    }
  }

  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="Contact"
        title="Tell us which module you want first."
        description="Pick the closest module and tell us what tools you use now. Sales OS, Operations OS, Founder Brief, Client Portal, Approval Flow, or Commerce Back Office is enough."
      />

      <section className="grid gap-6 lg:grid-cols-[0.88fr_1.12fr]">
        <aside className="sm-terminal p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">What happens next</p>
          <div className="mt-5 grid gap-3">
            <div className="sm-chip text-white">We review the module you picked and the tools you already use.</div>
            <div className="sm-chip text-white">We map it to the first rollout that will actually help.</div>
            <div className="sm-chip text-white">We reply with the next module or setup step.</div>
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
              Which module do you want first?
              <select
                className="rounded-xl border border-white/8 bg-white/4 px-3 py-2 text-sm font-normal text-white"
                onChange={(event) => setForm((prev) => ({ ...prev, module: event.target.value }))}
                required
                value={form.module}
              >
                {moduleOptions.map((item) => (
                  <option className="bg-[var(--sm-bg)] text-white" key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
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
                placeholder="For example: follow-up is scattered, approvals are slow, or clients have no clean status view."
                required
                value={form.goal}
              />
            </label>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <button className="sm-button-accent" type="submit">
              {status === 'saving' ? 'Sending...' : 'Send request'}
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
