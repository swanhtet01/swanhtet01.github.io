import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import { workspaceFetch } from '../lib/workspaceApi'

type SignupPayload = {
  name: string
  email: string
  company: string
  password: string
  goal: string
}

export function SignupPage() {
  const navigate = useNavigate()
  const [form, setForm] = useState<SignupPayload>({
    name: '',
    email: '',
    company: '',
    password: '',
    goal: '',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const payload = await workspaceFetch<{
        authenticated?: boolean
        generated_password?: string
      }>('/api/auth/signup', {
        method: 'POST',
        body: JSON.stringify(form),
      })
      if (payload.generated_password) {
        setMessage(`Workspace created. Generated password: ${payload.generated_password}`)
      }
      if (payload.authenticated) {
        navigate('/app', { replace: true })
        return
      }
      setError('Signup did not finish.')
    } catch {
      setError('Could not create the workspace on this host.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="Start free"
        title="Create your workspace."
        description="One account. One workspace. Start with Action OS and Lead Finder."
      />

      <section className="grid gap-6 lg:grid-cols-[0.82fr_1.18fr]">
        <aside className="sm-terminal p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">What you get</p>
          <div className="mt-5 grid gap-3">
            {['Lead Finder pipeline', 'Action board', 'Exception queue', 'Director view'].map((item) => (
              <div className="sm-chip text-white" key={item}>
                {item}
              </div>
            ))}
          </div>
          <p className="mt-6 text-sm text-[var(--sm-muted)]">Keep the first rollout simple. One team and one workflow is enough.</p>
        </aside>

        <form className="sm-surface p-6" onSubmit={handleSubmit}>
          <div className="grid gap-4">
            <label className="grid gap-2 text-sm font-semibold text-[var(--sm-muted)]">
              Name
              <input className="sm-input" onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} required value={form.name} />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-[var(--sm-muted)]">
              Work email
              <input className="sm-input" onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))} required type="email" value={form.email} />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-[var(--sm-muted)]">
              Company
              <input className="sm-input" onChange={(event) => setForm((prev) => ({ ...prev, company: event.target.value }))} required value={form.company} />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-[var(--sm-muted)]">
              Password
              <input
                className="sm-input"
                onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
                placeholder="Leave blank to auto-generate"
                type="password"
                value={form.password}
              />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-[var(--sm-muted)]">
              First workflow
              <textarea
                className="sm-input min-h-28"
                onChange={(event) => setForm((prev) => ({ ...prev, goal: event.target.value }))}
                placeholder="For example: supplier follow-up, receiving, or director updates."
                value={form.goal}
              />
            </label>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <button className="sm-button-primary" disabled={busy} type="submit">
              {busy ? 'Creating...' : 'Create workspace'}
            </button>
            <Link className="sm-button-secondary" to="/login">
              Login instead
            </Link>
          </div>

          {message ? <div className="mt-4 sm-chip text-white">{message}</div> : null}
          {error ? <div className="mt-4 sm-chip text-white">{error}</div> : null}
        </form>
      </section>
    </div>
  )
}
