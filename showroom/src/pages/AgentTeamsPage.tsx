import { useEffect, useState } from 'react'

import { PageIntro } from '../components/PageIntro'
import { checkWorkspaceHealth, getWorkspaceSession, workspaceFetch } from '../lib/workspaceApi'

type AgentUnit = {
  unit_id: string
  name: string
  role: string
  mode: string
  output_schema: string
  write_scope: string
  approval_gate: string
  focus: string
}

type AgentTeam = {
  team_id: string
  name: string
  status: string
  scaling_tier: string
  mission: string
  lead_agent: string
  cadence: string
  agents: AgentUnit[]
}

type AgentTeamPayload = {
  status: string
  summary?: {
    team_count?: number
    shared_core_team_count?: number
    client_pod_team_count?: number
    autonomy_score?: number
    autonomy_level?: string
  }
  teams?: AgentTeam[]
  gaps?: string[]
  next_moves?: string[]
  scaling_model?: {
    core_loop?: string[]
    founder_focus?: string[]
    rules?: string[]
  }
}

export function AgentTeamsPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [payload, setPayload] = useState<AgentTeamPayload | null>(null)

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
          setError('Login is required to open AI Team.')
          setLoading(false)
          return
        }
      } catch {
        if (!cancelled) {
          setError('Workspace login could not be verified on this host yet.')
          setLoading(false)
        }
        return
      }

      try {
        const nextPayload = await workspaceFetch<AgentTeamPayload>('/api/agent-teams')
        if (!cancelled) {
          setPayload(nextPayload)
        }
      } catch {
        if (!cancelled) {
          setError('AI Team could not be loaded right now.')
        }
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
        eyebrow="AI Team"
        title="See the agent org and the control loops."
        description="This is the internal AI operating model: who runs what, what each loop writes, and what still needs a human decision."
      />

      <section className="grid gap-4 md:grid-cols-4">
        <div className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent)]">Teams</p>
          <p className="mt-3 text-3xl font-bold text-white">{payload?.summary?.team_count ?? 0}</p>
        </div>
        <div className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Shared core</p>
          <p className="mt-3 text-3xl font-bold text-white">{payload?.summary?.shared_core_team_count ?? 0}</p>
        </div>
        <div className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent)]">Client pods</p>
          <p className="mt-3 text-3xl font-bold text-white">{payload?.summary?.client_pod_team_count ?? 0}</p>
        </div>
        <div className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Autonomy</p>
          <p className="mt-3 text-3xl font-bold text-white">{payload?.summary?.autonomy_score ?? 0}</p>
          <p className="mt-1 text-sm text-[var(--sm-muted)]">{payload?.summary?.autonomy_level || 'unknown'}</p>
        </div>
      </section>

      {loading ? <div className="sm-chip text-[var(--sm-muted)]">Loading AI Team...</div> : null}
      {error ? <div className="sm-chip text-[var(--sm-muted)]">{error}</div> : null}

      {payload ? (
        <>
          <section className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
            <article className="sm-surface p-6">
              <p className="sm-kicker text-[var(--sm-accent)]">Core loop</p>
              <div className="mt-4 space-y-3">
                {(payload.scaling_model?.core_loop ?? []).map((item) => (
                  <div className="sm-chip text-white" key={item}>
                    {item}
                  </div>
                ))}
                {!(payload.scaling_model?.core_loop ?? []).length ? (
                  <div className="sm-chip text-[var(--sm-muted)]">No core loop loaded yet.</div>
                ) : null}
              </div>

              <p className="sm-kicker mt-6 text-[var(--sm-accent-alt)]">Founder focus</p>
              <div className="mt-4 grid gap-2">
                {(payload.scaling_model?.founder_focus ?? []).map((item) => (
                  <div className="sm-chip text-white" key={item}>
                    {item}
                  </div>
                ))}
              </div>
            </article>

            <article className="sm-surface p-6">
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Operating rules</p>
              <div className="mt-4 space-y-3">
                {(payload.scaling_model?.rules ?? []).map((item) => (
                  <div className="border-b border-white/8 pb-3 text-sm text-[var(--sm-muted)] last:border-b-0 last:pb-0" key={item}>
                    {item}
                  </div>
                ))}
              </div>
            </article>
          </section>

          <section className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
            <article className="sm-surface p-6">
              <p className="sm-kicker text-[var(--sm-accent)]">Teams</p>
              <div className="mt-5 space-y-4">
                {(payload.teams ?? []).map((team) => (
                  <div className="sm-proof-card" key={team.team_id}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-xl font-bold text-white">{team.name}</p>
                        <p className="mt-2 text-sm text-[var(--sm-muted)]">{team.mission}</p>
                      </div>
                      <span className="sm-status-pill">
                        {team.status} / {team.scaling_tier}
                      </span>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <div className="sm-chip text-white">
                        <p className="sm-kicker text-[var(--sm-accent)]">Lead agent</p>
                        <p className="mt-2 text-sm">{team.lead_agent}</p>
                      </div>
                      <div className="sm-chip text-white">
                        <p className="sm-kicker text-[var(--sm-accent-alt)]">Cadence</p>
                        <p className="mt-2 text-sm">{team.cadence}</p>
                      </div>
                    </div>

                    <div className="mt-4 space-y-3">
                      {team.agents.map((agent) => (
                        <div className="sm-chip text-white" key={agent.unit_id}>
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="font-semibold text-white">{agent.name}</p>
                              <p className="mt-1 text-sm text-[var(--sm-muted)]">{agent.role}</p>
                            </div>
                            <span className="sm-status-pill">{agent.mode}</span>
                          </div>
                          <div className="mt-3 grid gap-2 md:grid-cols-3">
                            <div className="text-xs text-[var(--sm-muted)]">
                              <span className="block font-semibold uppercase tracking-[0.18em] text-[var(--sm-accent)]">Writes</span>
                              {agent.write_scope}
                            </div>
                            <div className="text-xs text-[var(--sm-muted)]">
                              <span className="block font-semibold uppercase tracking-[0.18em] text-[var(--sm-accent-alt)]">Output</span>
                              {agent.output_schema}
                            </div>
                            <div className="text-xs text-[var(--sm-muted)]">
                              <span className="block font-semibold uppercase tracking-[0.18em] text-[var(--sm-accent)]">Approval</span>
                              {agent.approval_gate}
                            </div>
                          </div>
                          <div className="mt-3 text-sm text-[var(--sm-muted)]">{agent.focus}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </article>

            <div className="space-y-6">
              <article className="sm-surface p-6">
                <p className="sm-kicker text-[var(--sm-accent-alt)]">Gaps</p>
                <div className="mt-4 space-y-3">
                  {(payload.gaps ?? []).map((item) => (
                    <div className="border-b border-white/8 pb-3 text-sm text-[var(--sm-muted)] last:border-b-0 last:pb-0" key={item}>
                      {item}
                    </div>
                  ))}
                </div>
              </article>

              <article className="sm-surface p-6">
                <p className="sm-kicker text-[var(--sm-accent)]">Next moves</p>
                <div className="mt-4 space-y-3">
                  {(payload.next_moves ?? []).map((item) => (
                    <div className="sm-chip text-white" key={item}>
                      {item}
                    </div>
                  ))}
                </div>
              </article>
            </div>
          </section>
        </>
      ) : null}
    </div>
  )
}
