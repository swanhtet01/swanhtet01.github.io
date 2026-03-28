import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import { checkWorkspaceHealth, getWorkspaceSession, workspaceFetch } from '../lib/workspaceApi'

type InsightRow = {
  key: string
  title: string
  summary: string
  category: string
  route: string
}

type InsightPayload = {
  headline?: string
  engine?: string
  insights?: InsightRow[]
  recommended_actions?: string[]
}

export function InsightsPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [payload, setPayload] = useState<InsightPayload | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      const health = await checkWorkspaceHealth()
      if (cancelled) return
      if (!health.ready) {
        setError('Workspace API is not connected on this host yet.')
        setLoading(false)
        return
      }

      try {
        const session = await getWorkspaceSession()
        if (cancelled) return
        if (!session.authenticated) {
          setError('Login is required to open insights.')
          setLoading(false)
          return
        }
      } catch {
        if (cancelled) return
        setError('Workspace login could not be verified on this host yet.')
        setLoading(false)
        return
      }

      try {
        const nextPayload = await workspaceFetch<InsightPayload>('/api/insights')
        if (cancelled) return
        setPayload(nextPayload)
      } catch {
        if (cancelled) return
        setError('Insights could not be generated right now.')
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="Insights"
        title="See what the system thinks matters now."
        description="This view turns the live queues into one short operating brief with suggested next moves."
      />

      <section className="sm-surface p-6">
        {loading ? (
          <p className="text-sm text-[var(--sm-muted)]">Building operating brief...</p>
        ) : error ? (
          <div className="space-y-4">
            <p className="text-sm text-[var(--sm-muted)]">{error}</p>
            <Link className="sm-button-primary" to="/login?next=/app/insights">
              Login
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="sm-proof-card">
              <p className="sm-kicker text-[var(--sm-accent)]">Auto brief</p>
              <h2 className="mt-3 text-3xl font-bold text-white">{payload?.headline || 'No major signal yet.'}</h2>
              <p className="mt-3 text-sm text-[var(--sm-muted)]">
                Engine: {payload?.engine || 'rules+live-state'}
              </p>
            </div>

            <div className="grid gap-6 lg:grid-cols-[1.08fr_0.92fr]">
              <div className="space-y-3">
                {(payload?.insights || []).map((row) => (
                  <article className="sm-proof-card" key={row.key}>
                    <p className="text-lg font-bold text-white">{row.title}</p>
                    <p className="mt-2 text-sm text-[var(--sm-muted)]">{row.summary}</p>
                    <div className="mt-4 flex flex-wrap gap-3">
                      <span className="sm-status-pill">{row.category}</span>
                      <Link className="sm-button-secondary" to={row.route || '/app'}>
                        Open screen
                      </Link>
                    </div>
                  </article>
                ))}
              </div>

              <article className="sm-terminal p-6">
                <p className="sm-kicker text-[var(--sm-accent-alt)]">Recommended next moves</p>
                <div className="mt-4 space-y-3">
                  {(payload?.recommended_actions || []).map((item, index) => (
                    <div className="sm-chip text-white" key={`${item}-${index}`}>
                      {item}
                    </div>
                  ))}
                </div>
                <div className="mt-6 flex flex-wrap gap-3">
                  <Link className="sm-button-primary" to="/app/exceptions">
                    Open exceptions
                  </Link>
                  <Link className="sm-button-secondary" to="/app/director">
                    Open director
                  </Link>
                </div>
              </article>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
