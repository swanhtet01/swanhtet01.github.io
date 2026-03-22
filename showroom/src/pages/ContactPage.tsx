import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'

type LeadFormState = {
  name: string
  email: string
  company: string
  package: string
  priority: string
  brief: string
}

const initialForm: LeadFormState = {
  name: '',
  email: '',
  company: '',
  package: '',
  priority: 'This month',
  brief: '',
}

function buildLeadMailto(payload: LeadFormState) {
  const subject = `[SuperMega Lead] ${payload.company || payload.name || 'New inquiry'}`
  const body = [
    `Name: ${payload.name}`,
    `Email: ${payload.email}`,
    `Company: ${payload.company}`,
    `Requested package: ${payload.package || 'Not selected'}`,
    `Priority: ${payload.priority}`,
    '',
    'Business brief:',
    payload.brief || '(none)',
  ].join('\n')
  return `mailto:swanhtet@supermega.dev?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

export function ContactPage() {
  const [searchParams] = useSearchParams()
  const requestedPackage = searchParams.get('package') ?? ''
  const [form, setForm] = useState<LeadFormState>({ ...initialForm, package: requestedPackage })
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'fallback' | 'error'>('idle')
  const leadEndpoint = import.meta.env.VITE_LEAD_ENDPOINT as string | undefined

  const leadPreview = useMemo(
    () => JSON.stringify(form, null, 2),
    [form],
  )

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setStatus('sending')

    if (!leadEndpoint) {
      setStatus('fallback')
      window.location.href = buildLeadMailto(form)
      return
    }

    try {
      const response = await fetch(leadEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          source: 'supermega.dev',
          submittedAt: new Date().toISOString(),
        }),
      })
      if (!response.ok) {
        throw new Error(`Lead endpoint returned ${response.status}`)
      }
      setStatus('sent')
      setForm({ ...initialForm, package: requestedPackage })
    } catch {
      setStatus('error')
    }
  }

  async function copyLeadPreview() {
    try {
      await navigator.clipboard.writeText(leadPreview)
    } catch {
      // no-op fallback for restricted browsers
    }
  }

  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="Contact and Book Call"
        title="Tell us your goal. We send a scoped proposal in under 24 hours after discovery."
        description="Use this form to request a package or a custom scope. Leads move to qualification, discovery, and proposal stages with explicit next steps."
      />

      <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <form className="rounded-3xl border border-[var(--sm-line)] bg-white/92 p-6" onSubmit={handleSubmit}>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="flex flex-col gap-2 text-sm font-semibold text-[var(--sm-muted)]">
              Name
              <input
                className="rounded-xl border border-[var(--sm-line)] bg-[var(--sm-paper)] px-3 py-2 text-sm font-normal"
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                required
                type="text"
                value={form.name}
              />
            </label>
            <label className="flex flex-col gap-2 text-sm font-semibold text-[var(--sm-muted)]">
              Email
              <input
                className="rounded-xl border border-[var(--sm-line)] bg-[var(--sm-paper)] px-3 py-2 text-sm font-normal"
                onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
                required
                type="email"
                value={form.email}
              />
            </label>
            <label className="flex flex-col gap-2 text-sm font-semibold text-[var(--sm-muted)]">
              Company
              <input
                className="rounded-xl border border-[var(--sm-line)] bg-[var(--sm-paper)] px-3 py-2 text-sm font-normal"
                onChange={(event) => setForm((prev) => ({ ...prev, company: event.target.value }))}
                required
                type="text"
                value={form.company}
              />
            </label>
            <label className="flex flex-col gap-2 text-sm font-semibold text-[var(--sm-muted)]">
              Package
              <select
                className="rounded-xl border border-[var(--sm-line)] bg-[var(--sm-paper)] px-3 py-2 text-sm font-normal"
                onChange={(event) => setForm((prev) => ({ ...prev, package: event.target.value }))}
                value={form.package}
              >
                <option value="">Select package</option>
                <option value="Starter">Starter</option>
                <option value="Growth">Growth</option>
                <option value="Scale">Scale</option>
                <option value="Custom">Custom</option>
              </select>
            </label>
            <label className="flex flex-col gap-2 text-sm font-semibold text-[var(--sm-muted)] md:col-span-2">
              Priority
              <select
                className="rounded-xl border border-[var(--sm-line)] bg-[var(--sm-paper)] px-3 py-2 text-sm font-normal"
                onChange={(event) => setForm((prev) => ({ ...prev, priority: event.target.value }))}
                value={form.priority}
              >
                <option>This week</option>
                <option>This month</option>
                <option>Next quarter</option>
              </select>
            </label>
            <label className="flex flex-col gap-2 text-sm font-semibold text-[var(--sm-muted)] md:col-span-2">
              Brief
              <textarea
                className="min-h-40 rounded-xl border border-[var(--sm-line)] bg-[var(--sm-paper)] px-3 py-2 text-sm font-normal"
                onChange={(event) => setForm((prev) => ({ ...prev, brief: event.target.value }))}
                placeholder="Current process, problem, and desired outcome."
                required
                value={form.brief}
              />
            </label>
          </div>
          <button
            className="mt-5 rounded-full bg-[var(--sm-accent)] px-5 py-3 text-sm font-bold text-white hover:bg-[#0a5b5d] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={status === 'sending'}
            type="submit"
          >
            {status === 'sending' ? 'Submitting...' : 'Book call and request proposal'}
          </button>
          <p className="mt-3 text-sm text-[var(--sm-muted)]">
            {status === 'sent' && 'Lead submitted successfully. We will contact you shortly.'}
            {status === 'fallback' && 'No API endpoint configured. Your mail app was opened with lead details.'}
            {status === 'error' && 'Lead endpoint failed. Use mail fallback or send details directly.'}
            {status === 'idle' &&
              'If no API endpoint is configured, the form falls back to email so inquiries still reach inbox.'}
          </p>
        </form>

        <aside className="rounded-3xl border border-[#184a4a] bg-[#112d31] p-6 text-sm text-slate-100">
          <h2 className="text-lg font-bold">Pipeline stages</h2>
          <ul className="mt-3 space-y-2">
            <li className="rounded-2xl border border-white/15 px-3 py-2">New Lead</li>
            <li className="rounded-2xl border border-white/15 px-3 py-2">Qualified</li>
            <li className="rounded-2xl border border-white/15 px-3 py-2">Discovery Done</li>
            <li className="rounded-2xl border border-white/15 px-3 py-2">Proposal Sent</li>
            <li className="rounded-2xl border border-white/15 px-3 py-2">Won or Lost</li>
          </ul>
          <button
            className="mt-4 rounded-full border border-white/25 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] hover:bg-white/10"
            onClick={copyLeadPreview}
            type="button"
          >
            Copy lead JSON preview
          </button>
          <pre className="mt-3 overflow-x-auto rounded-2xl border border-white/20 bg-black/20 p-3 text-xs leading-relaxed">
            {leadPreview}
          </pre>
        </aside>
      </section>
    </div>
  )
}
