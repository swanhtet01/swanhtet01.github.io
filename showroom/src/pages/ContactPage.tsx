import { useState } from 'react'
import type { FormEvent } from 'react'

import { PageIntro } from '../components/PageIntro'

type LeadFormState = {
  name: string
  email: string
  company: string
  workflow: string
  data: string
  goal: string
}

const initialForm: LeadFormState = {
  name: '',
  email: '',
  company: '',
  workflow: 'Supplier Watch',
  data: 'Gmail + Drive',
  goal: '',
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

export function ContactPage() {
  const [form, setForm] = useState<LeadFormState>(initialForm)
  const [status, setStatus] = useState<'idle' | 'sending'>('idle')

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setStatus('sending')
    window.location.href = buildLeadMailto(form)
    window.setTimeout(() => setStatus('idle'), 800)
  }

  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="Contact"
        title="Start one useful pilot."
        description="Tell us the workflow, the data you already have, and the outcome you want first."
      />

      <section className="grid gap-6 lg:grid-cols-[0.92fr_1.08fr]">
        <aside className="sm-terminal p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Direct path</p>
          <h2 className="mt-3 text-3xl font-bold text-white">Short brief. Fast reply.</h2>
          <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">
            We use this to scope the first useful rollout. No fake funnel. No dead-end request form.
          </p>

          <div className="mt-6 grid gap-3">
            <a className="sm-chip block" href="mailto:swanhtet@supermega.dev">
              <p className="sm-kicker text-[var(--sm-accent)]">Email</p>
              <p className="mt-2 text-white">swanhtet@supermega.dev</p>
            </a>
            <div className="sm-chip">
              <p className="sm-kicker text-[var(--sm-accent)]">Good first workflows</p>
              <p className="mt-2 text-white">Supplier risk, quality closeout, cash control, daily action board</p>
            </div>
            <div className="sm-chip">
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Pilot shape</p>
              <p className="mt-2 text-white">One workflow. One owner view. Two-week first sprint.</p>
            </div>
            <div className="sm-chip">
              <p className="sm-kicker text-[var(--sm-accent)]">What helps</p>
              <p className="mt-2 text-white">One sample sheet, one mailbox, one raw process we can clean up first.</p>
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
                <option>Supplier Watch</option>
                <option>Quality Closeout</option>
                <option>Cash Watch</option>
                <option>Action Board</option>
                <option>News Brief</option>
                <option>Lead Finder</option>
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
              {status === 'sending' ? 'Opening email...' : 'Email this brief'}
            </button>
            <a className="sm-button-primary" href="/examples">
              Try the tools first
            </a>
            <a className="sm-button-secondary" href="mailto:swanhtet@supermega.dev">
              Email directly
            </a>
          </div>
          <p className="mt-3 text-sm text-[var(--sm-muted)]">This opens a direct email draft. Keep it short and concrete.</p>
        </form>
      </section>
    </div>
  )
}
