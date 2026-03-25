import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'

import { PageIntro } from '../components/PageIntro'
import { checkWorkspaceHealth, workspaceFetch } from '../lib/workspaceApi'

type LeadFormState = {
  name: string
  email: string
  company: string
  data: string
  goal: string
}

function buildLeadMailto(payload: LeadFormState) {
  const subject = `[SuperMega Pilot] ${payload.company || payload.name || 'New inquiry'}`
  const body = [
    'SuperMega Inquiry',
    '',
    `Name: ${payload.name}`,
    `Email: ${payload.email}`,
    `Company: ${payload.company}`,
    `Data already available: ${payload.data}`,
    '',
    'What needs fixing first:',
    payload.goal,
  ].join('\n')
  return `mailto:swanhtet@supermega.dev?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

function initialFormFromQuery(): LeadFormState {
  const params = new URLSearchParams(window.location.search)
  const requestedPackage = params.get('package')?.trim()
  return {
    name: '',
    email: '',
    company: '',
    data: 'Gmail + Drive',
    goal: requestedPackage ? `I want to start with ${requestedPackage}.` : '',
  }
}

export function ContactPage() {
  const [form, setForm] = useState<LeadFormState>(initialFormFromQuery)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'fallback'>('idle')
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

  const mailtoUrl = useMemo(() => buildLeadMailto(form), [form])

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
        setStatus('fallback')
      }
    }

    window.location.href = mailtoUrl
    window.setTimeout(() => setStatus('idle'), 800)
  }

  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="Contact"
        title="Book a live walkthrough."
        description="Send a short note about what you want fixed and what data you already have. We will use that to shape the first useful rollout."
      />

      <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <aside className="sm-terminal p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">What happens next</p>
          <h2 className="mt-3 text-3xl font-bold text-white">We look for one fast win.</h2>
          <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">
            We do not start with a bloated ERP project. We look for one team, one workflow, and one first live result that is worth keeping.
          </p>

          <div className="mt-6 grid gap-3">
            <div className="sm-chip">
              <p className="sm-kicker text-[var(--sm-accent)]">Good first systems</p>
              <p className="mt-2 text-white">Action OS, Supplier Watch, Quality Closeout, Cash Watch</p>
            </div>
            <div className="sm-chip">
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Good enough data</p>
              <p className="mt-2 text-white">Gmail, Drive, Sheets, or one messy folder and a simple owner list</p>
            </div>
            <div className="sm-chip">
              <p className="sm-kicker text-[var(--sm-accent)]">Typical first step</p>
              <p className="mt-2 text-white">One workflow, one control board, one review rhythm</p>
            </div>
            <div className="sm-chip">
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Response</p>
              <p className="mt-2 text-white">Reply within 24 hours with fit, scope, and next step</p>
            </div>
            <a className="sm-chip block" href="mailto:swanhtet@supermega.dev">
              <p className="sm-kicker text-[var(--sm-accent)]">Direct email</p>
              <p className="mt-2 text-white">swanhtet@supermega.dev</p>
            </a>
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
                placeholder="For example: Gmail + Drive, one shared sheet, or one messy folder"
                required
                type="text"
                value={form.data}
              />
            </label>
            <label className="flex flex-col gap-2 text-sm font-semibold text-[var(--sm-muted)] md:col-span-2">
              What do you want fixed first?
              <textarea
                className="min-h-52 rounded-xl border border-white/8 bg-white/4 px-3 py-3 text-sm font-normal text-white"
                onChange={(event) => setForm((prev) => ({ ...prev, goal: event.target.value }))}
                placeholder="For example: supplier follow-up is scattered, directors have no clean brief, or quality issues are not closing."
                required
                value={form.goal}
              />
            </label>
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <button className="sm-button-accent" type="submit">
              {status === 'saving' ? 'Sending...' : 'Book walkthrough'}
            </button>
            <a className="sm-button-secondary" href={mailtoUrl}>
              Email directly
            </a>
          </div>
          <p className="mt-3 text-sm text-[var(--sm-muted)]">
            {status === 'saved'
              ? 'Thanks. Your note is in and we will follow up with the next step.'
              : status === 'fallback'
                ? 'The web form fell back to email so your note does not get lost.'
                : 'Keep it short. One team and one problem is enough to start.'}
          </p>
        </form>
      </section>
    </div>
  )
}
