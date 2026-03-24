import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'

import { PageIntro } from '../components/PageIntro'
import { checkWorkspaceHealth, workspaceFetch } from '../lib/workspaceApi'

type LeadFormState = {
  name: string
  email: string
  company: string
  workflow: string
  data: string
  goal: string
}

function buildLeadMailto(payload: LeadFormState) {
  const subject = `[SuperMega Pilot] ${payload.company || payload.name || 'New inquiry'}`
  const body = [
    'SuperMega Pilot Inquiry',
    '',
    `Name: ${payload.name}`,
    `Email: ${payload.email}`,
    `Company: ${payload.company}`,
    `First workflow: ${payload.workflow}`,
    `Data already available: ${payload.data}`,
    '',
    'Goal:',
    payload.goal,
  ].join('\n')
  return `mailto:swanhtet@supermega.dev?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

function initialFormFromQuery(): LeadFormState {
  const params = new URLSearchParams(window.location.search)
  const requestedPackage = params.get('package')?.trim()
  const intent = params.get('intent')?.trim()

  return {
    name: '',
    email: '',
    company: '',
    workflow: requestedPackage || (intent === 'proposal' ? 'Action OS' : 'Action OS'),
    data: 'Gmail + Drive',
    goal: '',
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
          body: JSON.stringify(form),
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
        title="Start one useful pilot."
        description="Tell us the workflow, the data you already have, and the first outcome you want. If the workspace API is live, the request is saved directly."
      />

      <section className="grid gap-6 lg:grid-cols-[0.92fr_1.08fr]">
        <aside className="sm-terminal p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Direct path</p>
          <h2 className="mt-3 text-3xl font-bold text-white">Short brief. Fast reply.</h2>
          <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">
            This is meant to land one real pilot scope, not collect empty lead forms.
          </p>

          <div className="mt-6 grid gap-3">
            <div className="sm-chip">
              <p className="sm-kicker text-[var(--sm-accent)]">Mode</p>
              <p className="mt-2 text-white">{apiReady ? 'Workspace API save is live' : 'Direct email fallback'}</p>
            </div>
            <a className="sm-chip block" href="mailto:swanhtet@supermega.dev">
              <p className="sm-kicker text-[var(--sm-accent)]">Email</p>
              <p className="mt-2 text-white">swanhtet@supermega.dev</p>
            </a>
            <div className="sm-chip">
              <p className="sm-kicker text-[var(--sm-accent)]">Good first workflows</p>
              <p className="mt-2 text-white">Supplier Watch, Quality Closeout, Cash Watch, Action OS</p>
            </div>
            <div className="sm-chip">
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Mini add-ons</p>
              <p className="mt-2 text-white">Attendance check-in, reply draft, document intake, director flash</p>
            </div>
            <div className="sm-chip">
              <p className="sm-kicker text-[var(--sm-accent)]">Pilot shape</p>
              <p className="mt-2 text-white">One workflow. One owner view. One review rhythm. Two-week first sprint.</p>
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
            <label className="flex flex-col gap-2 text-sm font-semibold text-[var(--sm-muted)]">
              Company
              <input
                className="rounded-xl border border-white/8 bg-white/4 px-3 py-2 text-sm font-normal text-white"
                onChange={(event) => setForm((prev) => ({ ...prev, company: event.target.value }))}
                required
                type="text"
                value={form.company}
              />
            </label>
            <label className="flex flex-col gap-2 text-sm font-semibold text-[var(--sm-muted)]">
              First workflow
              <select
                className="rounded-xl border border-white/8 bg-white/4 px-3 py-2 text-sm font-normal text-white"
                onChange={(event) => setForm((prev) => ({ ...prev, workflow: event.target.value }))}
                value={form.workflow}
              >
                <option>Action OS</option>
                <option>Supplier Watch</option>
                <option>Quality Closeout</option>
                <option>Cash Watch</option>
                <option>Production Pulse</option>
                <option>Sales Signal</option>
                <option>Attendance Check-In</option>
                <option>Document Intake</option>
                <option>Director Flash</option>
                <option>SuperMega OS</option>
              </select>
            </label>
            <label className="flex flex-col gap-2 text-sm font-semibold text-[var(--sm-muted)] md:col-span-2">
              Data already available
              <input
                className="rounded-xl border border-white/8 bg-white/4 px-3 py-2 text-sm font-normal text-white"
                onChange={(event) => setForm((prev) => ({ ...prev, data: event.target.value }))}
                placeholder="For example: Gmail + Drive, or Sheets + shared folder"
                required
                type="text"
                value={form.data}
              />
            </label>
            <label className="flex flex-col gap-2 text-sm font-semibold text-[var(--sm-muted)] md:col-span-2">
              Goal
              <textarea
                className="min-h-52 rounded-xl border border-white/8 bg-white/4 px-3 py-3 text-sm font-normal text-white"
                onChange={(event) => setForm((prev) => ({ ...prev, goal: event.target.value }))}
                placeholder="What do you want fixed first?"
                required
                value={form.goal}
              />
            </label>
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <button className="sm-button-accent" type="submit">
              {status === 'saving'
                ? 'Saving...'
                : apiReady
                  ? 'Save pilot request'
                  : 'Email this brief'}
            </button>
            <a className="sm-button-primary" href={mailtoUrl}>
              Open email draft
            </a>
            <a className="sm-button-secondary" href="/workspace">
              Open workspace
            </a>
          </div>
          <p className="mt-3 text-sm text-[var(--sm-muted)]">
            {status === 'saved'
              ? 'Request saved in the workspace backend.'
              : status === 'fallback'
                ? 'Backend save failed, so direct email is still available.'
                : apiReady
                  ? 'This request will be saved directly when the workspace API is available.'
                  : 'This falls back to direct email when the workspace API is not running.'}
          </p>
        </form>
      </section>
    </div>
  )
}
