import { useState } from 'react'
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

function buildLeadSummary(payload: LeadFormState) {
  return [
    'SuperMega Pilot Request',
    `Name: ${payload.name}`,
    `Email: ${payload.email}`,
    `Company: ${payload.company}`,
    `Requested Tier: ${payload.package || 'Not selected'}`,
    `Priority: ${payload.priority}`,
    '',
    'Brief:',
    payload.brief || '(none)',
  ].join('\n')
}

function buildLeadMailto(payload: LeadFormState) {
  const subject = `[SuperMega Lead] ${payload.company || payload.name || 'New inquiry'}`
  return `mailto:swanhtet@supermega.dev?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(buildLeadSummary(payload))}`
}

function downloadLeadSummary(text: string) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'supermega_lead_request.txt'
  a.click()
  URL.revokeObjectURL(url)
}

export function ContactPage() {
  const [searchParams] = useSearchParams()
  const requestedPackage = searchParams.get('package') ?? ''
  const [form, setForm] = useState<LeadFormState>({ ...initialForm, package: requestedPackage })
  const [summary, setSummary] = useState('')
  const [status, setStatus] = useState<'idle' | 'ready' | 'copied' | 'submitted' | 'error'>('idle')
  const leadEndpoint = import.meta.env.VITE_LEAD_ENDPOINT as string | undefined

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const generated = buildLeadSummary(form)
    setSummary(generated)
    setStatus('ready')

    if (!leadEndpoint) {
      return
    }

    try {
      const response = await fetch(leadEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          summary: generated,
          source: 'supermega.dev',
          submittedAt: new Date().toISOString(),
        }),
      })
      if (!response.ok) {
        throw new Error('Lead endpoint failed')
      }
      setStatus('submitted')
    } catch {
      setStatus('error')
    }
  }

  async function handleCopy() {
    if (!summary) {
      return
    }
    try {
      await navigator.clipboard.writeText(summary)
      setStatus('copied')
    } catch {
      setStatus('error')
    }
  }

  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="Contact"
        title="Start your pilot request."
        description="Submit once, then copy, download, or email the request instantly."
      />

      <section className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <form className="rounded-3xl border border-white/45 bg-white/55 p-6 backdrop-blur-xl" onSubmit={handleSubmit}>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="flex flex-col gap-2 text-sm font-semibold text-[var(--sm-muted)]">
              Name
              <input
                className="rounded-xl border border-[var(--sm-line)] bg-white/70 px-3 py-2 text-sm font-normal"
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                required
                type="text"
                value={form.name}
              />
            </label>
            <label className="flex flex-col gap-2 text-sm font-semibold text-[var(--sm-muted)]">
              Email
              <input
                className="rounded-xl border border-[var(--sm-line)] bg-white/70 px-3 py-2 text-sm font-normal"
                onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
                required
                type="email"
                value={form.email}
              />
            </label>
            <label className="flex flex-col gap-2 text-sm font-semibold text-[var(--sm-muted)]">
              Company
              <input
                className="rounded-xl border border-[var(--sm-line)] bg-white/70 px-3 py-2 text-sm font-normal"
                onChange={(event) => setForm((prev) => ({ ...prev, company: event.target.value }))}
                required
                type="text"
                value={form.company}
              />
            </label>
            <label className="flex flex-col gap-2 text-sm font-semibold text-[var(--sm-muted)]">
              Tier
              <select
                className="rounded-xl border border-[var(--sm-line)] bg-white/70 px-3 py-2 text-sm font-normal"
                onChange={(event) => setForm((prev) => ({ ...prev, package: event.target.value }))}
                value={form.package}
              >
                <option value="">Select tier</option>
                <option value="Starter">Starter</option>
                <option value="Growth">Growth</option>
                <option value="Scale">Scale</option>
                <option value="Custom">Custom</option>
              </select>
            </label>
            <label className="flex flex-col gap-2 text-sm font-semibold text-[var(--sm-muted)] md:col-span-2">
              Priority
              <select
                className="rounded-xl border border-[var(--sm-line)] bg-white/70 px-3 py-2 text-sm font-normal"
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
                className="min-h-40 rounded-xl border border-[var(--sm-line)] bg-white/70 px-3 py-2 text-sm font-normal"
                onChange={(event) => setForm((prev) => ({ ...prev, brief: event.target.value }))}
                placeholder="What do you want automated first?"
                required
                value={form.brief}
              />
            </label>
          </div>
          <button
            className="mt-5 rounded-full bg-[var(--sm-accent)] px-5 py-3 text-sm font-bold text-white hover:bg-cyan-700"
            type="submit"
          >
            Generate Request
          </button>
          <p className="mt-3 text-sm text-[var(--sm-muted)]">
            {status === 'idle' && 'Generates a request immediately, with or without backend.'}
            {status === 'ready' && 'Request generated. Use Copy, Download, or Email buttons.'}
            {status === 'copied' && 'Request copied to clipboard.'}
            {status === 'submitted' && 'Request submitted to endpoint and generated locally.'}
            {status === 'error' && 'Copy or endpoint failed. Download or Email still works.'}
          </p>
        </form>

        <aside className="rounded-3xl border border-white/30 bg-[linear-gradient(145deg,rgba(10,21,38,0.88),rgba(17,45,65,0.86))] p-6 text-sm text-slate-100">
          <h2 className="text-lg font-bold">Request Output</h2>
          <textarea
            className="mt-4 min-h-72 w-full rounded-2xl border border-white/20 bg-white/5 px-3 py-3 font-mono text-xs text-slate-100"
            readOnly
            value={summary}
          />
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              className="rounded-full bg-cyan-400 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-cyan-300"
              onClick={handleCopy}
              type="button"
            >
              Copy
            </button>
            <button
              className="rounded-full border border-white/25 bg-white/10 px-4 py-2 text-xs font-bold text-white hover:bg-white/20"
              onClick={() => downloadLeadSummary(summary)}
              type="button"
            >
              Download
            </button>
            <a
              className="rounded-full bg-orange-500 px-4 py-2 text-xs font-bold text-white hover:bg-orange-400"
              href={buildLeadMailto(form)}
            >
              Email
            </a>
          </div>
        </aside>
      </section>
    </div>
  )
}
