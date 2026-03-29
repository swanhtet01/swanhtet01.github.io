import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import { bookingUrl } from '../content'
import { checkWorkspaceHealth, workspaceFetch } from '../lib/workspaceApi'

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
      return 'Your request was saved and pushed into the follow-up queue.'
    }
    if (status === 'saved_local') {
      return 'The request was saved only in this browser because the public backend is not attached on this host yet.'
    }
    if (status === 'error') {
      return 'The request could not be saved. Try the live app host or refresh and submit again.'
    }
    return 'Keep it short. One team and one workflow is enough to start.'
  }, [status])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setStatus('saving')

    if (apiReady) {
      try {
        await workspaceFetch('/api/contact-submissions', {
          method: 'POST',
          body: JSON.stringify({
            ...form,
            workflow: 'Discovery request',
          }),
        })
        setStatus('saved')
        return
      } catch {
        setStatus('error')
        return
      }
    }

    try {
      window.localStorage.setItem('supermega_contact_draft', JSON.stringify({ ...form, saved_at: new Date().toISOString() }))
      setStatus('saved_local')
    } catch {
      setStatus('error')
    }
  }

  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="Contact"
        title="Keep the first request simple."
        description="One workflow. One team. One starting point."
      />

      <section className="grid gap-6 lg:grid-cols-[0.72fr_1.28fr]">
        <aside className="sm-terminal p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Best next step</p>
          <div className="mt-5 grid gap-3">
            <div className="sm-chip text-white">Book a demo if you want to see it live.</div>
            <div className="sm-chip text-white">Use this form if you want us to scope the first rollout.</div>
          </div>

          <div className="mt-6 grid gap-3">
            {bookingUrl ? (
              <a className="sm-button-accent text-center" href={bookingUrl} rel="noreferrer" target="_blank">
                Book demo now
              </a>
            ) : (
              <Link className="sm-button-accent text-center" to="/signup">
                Create workspace
              </Link>
            )}
            <Link className="sm-button-secondary text-center" to="/lead-finder">
              Try Lead Finder
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
              What data do you already have?
              <input
                className="rounded-xl border border-white/8 bg-white/4 px-3 py-2 text-sm font-normal text-white"
                onChange={(event) => setForm((prev) => ({ ...prev, data: event.target.value }))}
                placeholder="For example: Gmail + Drive + Sheets"
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
              {status === 'saving' ? 'Saving...' : 'Send request'}
            </button>
            {bookingUrl ? (
              <a className="sm-button-secondary" href={bookingUrl} rel="noreferrer" target="_blank">
                Book demo instead
              </a>
            ) : null}
          </div>

          <p className="mt-3 text-sm text-[var(--sm-muted)]">{statusText}</p>
        </form>
      </section>
    </div>
  )
}
