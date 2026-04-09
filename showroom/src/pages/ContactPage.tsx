import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import { bookingUrl, ytfDeployment } from '../content'
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
    data: 'Gmail + Drive + Sheets + CSV',
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
      return 'Your rollout request was saved. We can now follow it up inside the live app.'
    }
    if (status === 'saved_local') {
      return 'Your rollout request was saved in this browser.'
    }
    if (status === 'error') {
      return 'The rollout request could not be saved. Try again.'
    }
    return 'One workflow, one team, and one messy file is enough to start.'
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
        eyebrow="Start rollout"
        title="Bring us the first workflow to fix."
        description="Tell us the process, the current tools, and who needs the first live screen. We will map the right product, the controls, and the rollout path."
      />

      <section className="grid gap-6 lg:grid-cols-[0.88fr_1.12fr]">
        <aside className="space-y-6">
          <div className="sm-terminal p-6">
            <p className="sm-kicker text-[var(--sm-accent)]">What we map first</p>
            <div className="mt-5 grid gap-3">
              <div className="sm-chip text-white">The first workflow and the people who touch it every day.</div>
              <div className="sm-chip text-white">The right live product and the first owner queue.</div>
              <div className="sm-chip text-white">The roles, approvals, and review habit around that queue.</div>
              <div className="sm-chip text-white">The current files, inboxes, exports, and APIs to connect first.</div>
            </div>

            {requestedPackage ? (
              <div className="mt-6 sm-chip text-white">
                <p className="sm-kicker text-[var(--sm-accent)]">Requested product</p>
                <p className="mt-2 text-lg font-semibold">{requestedPackage}</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">We will map the live module, imports, roles, and the first automation around this starting point.</p>
              </div>
            ) : null}

            <div className="mt-6 grid gap-3">
              {bookingUrl ? (
                <a className="sm-button-secondary text-center" href={bookingUrl} onClick={() => trackEvent('contact_calendar_click', { source: 'contact_page' })} rel="noreferrer" target="_blank">
                  Book rollout call
                </a>
              ) : (
                <Link className="sm-button-secondary text-center" to={liveAppAvailable ? '/signup' : '/products'}>
                  {liveAppAvailable ? 'Open app' : 'See live products'}
                </Link>
              )}
              <Link className="sm-button-secondary text-center" to="/find-companies">
                Open Find Clients
              </Link>
            </div>
          </div>

          <div className="sm-surface p-6">
            <p className="sm-kicker text-[var(--sm-accent)]">What we can connect first</p>
            <div className="mt-5 grid gap-3">
              <div className="sm-demo-mini">
                <strong>Gmail + Drive + Sheets</strong>
                <span>Draft workflows, imports, exports, links, and shared file context around the product.</span>
              </div>
              <div className="sm-demo-mini">
                <strong>CSV + uploads + ERP exports</strong>
                <span>Bring the current rows, files, and reports in before deeper write-back automation.</span>
              </div>
              <div className="sm-demo-mini">
                <strong>API-backed app state</strong>
                <span>Keep the queue, history, approvals, and agent jobs inside one saved workspace.</span>
              </div>
            </div>
          </div>

          <div className="sm-surface p-6">
            <p className="sm-kicker text-[var(--sm-accent)]">Named tenant example</p>
            <h2 className="mt-3 text-2xl font-bold text-white">{ytfDeployment.domain}</h2>
            <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{ytfDeployment.summary}</p>
            <p className="mt-4 text-sm text-[var(--sm-muted)]">Modules: {ytfDeployment.modules.join(', ')}</p>
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
              {status === 'saving' ? 'Sending...' : 'Send rollout request'}
            </button>
            {bookingUrl ? (
              <a className="sm-button-secondary" href={bookingUrl} rel="noreferrer" target="_blank">
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
