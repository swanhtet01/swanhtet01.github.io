import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import { trackEvent } from '../lib/analytics'
import { checkWorkspaceHealth, createContactSubmission, hasLiveWorkspaceApp } from '../lib/workspaceApi'

const requestOptions = ['Sales follow-up', 'Operations workflow', 'Client portal', 'Not sure yet'] as const

type LeadFormState = {
  name: string
  email: string
  company: string
  workflow: string
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
    workflow: requestedPackage || 'Not sure yet',
    data: '',
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
      return 'Saved. The request is now in the workspace.'
    }
    if (status === 'saved_local') {
      return 'Saved locally in this browser.'
    }
    if (status === 'error') {
      return 'Could not save the request. Try again.'
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
        })
        trackEvent('contact_submit', { source: 'contact_page', mode: 'api', company: form.company, workflow: form.workflow })
        setStatus('saved')
        return
      } catch {
        setStatus('error')
        return
      }
    }

    try {
      window.localStorage.setItem('supermega_contact_draft', JSON.stringify({ ...form, saved_at: new Date().toISOString() }))
      trackEvent('contact_submit', { source: 'contact_page', mode: 'local', workflow: form.workflow })
      setStatus('saved_local')
    } catch {
      setStatus('error')
    }
  }

  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="Contact"
        title="Tell us what still feels fragmented."
        description="Name, company, email, and the first workflow you want fixed."
      />

      <section className="grid gap-6 lg:grid-cols-[0.88fr_1.12fr]">
        <aside className="sm-terminal p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">What happens next</p>
          <div className="mt-5 grid gap-3">
            <div className="sm-chip text-white">We review the workflow problem and current tools.</div>
            <div className="sm-chip text-white">We map it to the smallest working system we would ship first.</div>
            <div className="sm-chip text-white">We reply with the next rollout step.</div>
          </div>

          <div className="mt-6 grid gap-3">
            <Link className="sm-button-secondary text-center" to="/products">
              View systems
            </Link>
            <Link className="sm-button-secondary text-center" to="/products">
              See rollout options
            </Link>
            {liveAppAvailable ? (
              <a className="sm-link text-center" href="https://app.supermega.dev/login" rel="noreferrer" target="_blank">
                Existing client sign in
              </a>
            ) : null}
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
              What needs to work better first?
              <select
                className="rounded-xl border border-white/8 bg-white/4 px-3 py-2 text-sm font-normal text-white"
                onChange={(event) => setForm((prev) => ({ ...prev, workflow: event.target.value }))}
                required
                value={form.workflow}
              >
                {requestOptions.map((item) => (
                  <option className="bg-[var(--sm-bg)] text-white" key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-2 text-sm font-semibold text-[var(--sm-muted)] md:col-span-2">
              Current tools (optional)
              <input
                className="rounded-xl border border-white/8 bg-white/4 px-3 py-2 text-sm font-normal text-white"
                onChange={(event) => setForm((prev) => ({ ...prev, data: event.target.value }))}
                placeholder="For example: Gmail, Drive, Excel, Facebook page, Viber or WhatsApp"
                type="text"
                value={form.data}
              />
            </label>
            <label className="flex flex-col gap-2 text-sm font-semibold text-[var(--sm-muted)] md:col-span-2">
              What do you want fixed first?
              <textarea
                className="min-h-48 rounded-xl border border-white/8 bg-white/4 px-3 py-3 text-sm font-normal text-white"
                onChange={(event) => setForm((prev) => ({ ...prev, goal: event.target.value }))}
                placeholder="For example: follow-up is scattered, approvals are slow, or clients have no clear status view."
                required
                value={form.goal}
              />
            </label>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <button className="sm-button-accent" type="submit">
              {status === 'saving' ? 'Sending...' : 'Send request'}
            </button>
            <Link className="sm-button-secondary" to="/products">
              View systems
            </Link>
          </div>

          <p className="mt-3 text-sm text-[var(--sm-muted)]">{statusText}</p>
        </form>
      </section>
    </div>
  )
}
