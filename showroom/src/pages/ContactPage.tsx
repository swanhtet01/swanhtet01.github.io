import { useState } from 'react'
import type { FormEvent } from 'react'

import { PageIntro } from '../components/PageIntro'

type LeadFormState = {
  name: string
  email: string
  company: string
  agent: string
  brief: string
}

const initialForm: LeadFormState = {
  name: '',
  email: '',
  company: '',
  agent: 'Supplier Watch Agent',
  brief: '',
}

function buildLeadMailto(payload: LeadFormState) {
  const subject = `[SuperMega Pilot] ${payload.company || payload.name || 'New inquiry'}`
  const body = [
    'SuperMega Pilot Inquiry',
    '',
    `Name: ${payload.name}`,
    `Email: ${payload.email}`,
    `Company: ${payload.company}`,
    `Agent of interest: ${payload.agent}`,
    '',
    'Brief:',
    payload.brief,
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
        title="Start a real pilot."
        description="Pick the workflow you want first. We scope one useful agent and move fast."
      />

      <section className="grid gap-6 lg:grid-cols-[0.92fr_1.08fr]">
        <aside className="sm-surface-deep p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Direct path</p>
          <h2 className="mt-3 text-3xl font-bold text-white">No fake funnel.</h2>
          <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">
            If the agent is useful, we scope the pilot on your real data. If it is not useful, we do not force it.
          </p>

          <div className="mt-6 grid gap-3">
            <a className="sm-chip block" href="mailto:swanhtet@supermega.dev">
              <p className="sm-kicker text-[var(--sm-accent)]">Email</p>
              <p className="mt-2 text-white">swanhtet@supermega.dev</p>
            </a>
            <div className="sm-chip">
              <p className="sm-kicker text-[var(--sm-accent)]">Best starting agents</p>
              <p className="mt-2 text-white">Supplier Watch, Quality CAPA, Director Command</p>
            </div>
            <div className="sm-chip">
              <p className="sm-kicker text-[var(--sm-accent)]">Pilot shape</p>
              <p className="mt-2 text-white">One workflow. One owner view. Two-week first sprint.</p>
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
              Agent
              <select
                className="rounded-xl border border-white/8 bg-white/4 px-3 py-2 text-sm font-normal text-white"
                onChange={(event) => setForm((prev) => ({ ...prev, agent: event.target.value }))}
                value={form.agent}
              >
                <option>Supplier Watch Agent</option>
                <option>Quality CAPA Agent</option>
                <option>Director Command Agent</option>
                <option>Cash Control Agent</option>
                <option>Lead-to-Pilot Agent</option>
                <option>SuperMega OS</option>
              </select>
            </label>
            <label className="flex flex-col gap-2 text-sm font-semibold text-[var(--sm-muted)] md:col-span-2">
              Brief
              <textarea
                className="min-h-52 rounded-xl border border-white/8 bg-white/4 px-3 py-3 text-sm font-normal text-white"
                onChange={(event) => setForm((prev) => ({ ...prev, brief: event.target.value }))}
                placeholder="What workflow do you want fixed first?"
                required
                value={form.brief}
              />
            </label>
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <button className="sm-button-accent" type="submit">
              {status === 'sending' ? 'Opening email...' : 'Email this brief'}
            </button>
            <a className="sm-button-secondary" href="mailto:swanhtet@supermega.dev">
              Email directly
            </a>
          </div>
          <p className="mt-3 text-sm text-[var(--sm-muted)]">This opens a direct email draft. No fake forms, no dead-end funnel.</p>
        </form>
      </section>
    </div>
  )
}
