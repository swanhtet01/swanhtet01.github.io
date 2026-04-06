import { type FormEvent, useEffect, useState } from 'react'

import { PageIntro } from '../components/PageIntro'
import {
  checkWorkspaceHealth,
  getWorkspaceSession,
  inviteTeamMember,
  listTeamMembers,
  workspaceFetch,
  type TeamMemberRow,
} from '../lib/workspaceApi'

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

const roleOptions = ['member', 'operator', 'manager', 'owner'] as const

export function AgentTeamsPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [agentPayload, setAgentPayload] = useState<AgentTeamPayload | null>(null)
  const [members, setMembers] = useState<TeamMemberRow[]>([])
  const [inviteBusy, setInviteBusy] = useState(false)
  const [inviteMessage, setInviteMessage] = useState<string | null>(null)
  const [inviteForm, setInviteForm] = useState({
    name: '',
    email: '',
    role: 'member',
    password: '',
  })

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
          setError('Login is required to open Team.')
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
        const [nextAgentPayload, nextMembersPayload] = await Promise.all([
          workspaceFetch<AgentTeamPayload>('/api/agent-teams'),
          listTeamMembers(),
        ])
        if (!cancelled) {
          setAgentPayload(nextAgentPayload)
          setMembers(nextMembersPayload.rows ?? [])
          setError(null)
        }
      } catch {
        if (!cancelled) {
          setError('Team data could not be loaded right now.')
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

  async function handleInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!inviteForm.email.trim()) {
      setInviteMessage('Enter an email first.')
      return
    }

    setInviteBusy(true)
    setInviteMessage(null)
    try {
      const payload = await inviteTeamMember({
        email: inviteForm.email,
        name: inviteForm.name,
        role: inviteForm.role,
        password: inviteForm.password,
      })
      setMembers(payload.rows ?? [])
      setInviteForm({
        name: '',
        email: '',
        role: 'member',
        password: '',
      })
      const temporaryPassword = String(payload.generated_password ?? '').trim()
      if (temporaryPassword) {
        setInviteMessage(`Member added. Share this initial password once: ${temporaryPassword}`)
      } else if (payload.created) {
        setInviteMessage('Member added.')
      } else {
        setInviteMessage('Member access updated.')
      }
    } catch (nextError) {
      setInviteMessage(nextError instanceof Error ? nextError.message : 'Could not add this member right now.')
    } finally {
      setInviteBusy(false)
    }
  }

  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="Team"
        title="Run the company with people and agent loops."
        description="Invite managers, see who has access, and monitor the loops that keep sales and delivery moving."
      />

      <section className="grid gap-4 md:grid-cols-4">
        <div className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent)]">Members</p>
          <p className="mt-3 text-3xl font-bold text-white">{members.length}</p>
        </div>
        <div className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Agent loops</p>
          <p className="mt-3 text-3xl font-bold text-white">{agentPayload?.summary?.team_count ?? 0}</p>
        </div>
        <div className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent)]">Core loops</p>
          <p className="mt-3 text-3xl font-bold text-white">{agentPayload?.summary?.shared_core_team_count ?? 0}</p>
        </div>
        <div className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Autonomy</p>
          <p className="mt-3 text-3xl font-bold text-white">{agentPayload?.summary?.autonomy_score ?? 0}</p>
          <p className="mt-1 text-sm text-[var(--sm-muted)]">{agentPayload?.summary?.autonomy_level || 'unknown'}</p>
        </div>
      </section>

      {loading ? <div className="sm-chip text-[var(--sm-muted)]">Loading Team...</div> : null}
      {error ? <div className="sm-chip text-[var(--sm-muted)]">{error}</div> : null}

      {!loading && !error ? (
        <>
          <section className="grid gap-6 lg:grid-cols-[1.02fr_0.98fr]">
            <article className="sm-surface p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="sm-kicker text-[var(--sm-accent)]">People</p>
                  <h2 className="mt-2 text-2xl font-bold text-white">Who is in the workspace</h2>
                </div>
                <span className="sm-status-pill">{members.length} active</span>
              </div>

              <div className="mt-5 space-y-3">
                {members.length ? (
                  members.map((member) => (
                    <div className="sm-proof-card" key={member.membership_id}>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-lg font-bold text-white">{member.display_name || member.email}</p>
                          <p className="mt-2 text-sm text-[var(--sm-muted)]">{member.email}</p>
                        </div>
                        <span className="sm-status-pill">
                          {member.role} / {member.status}
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="sm-chip text-[var(--sm-muted)]">No team members added yet.</div>
                )}
              </div>
            </article>

            <article className="sm-surface p-6">
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Invite</p>
              <h2 className="mt-2 text-2xl font-bold text-white">Add a manager or operator</h2>
              <p className="mt-3 text-sm text-[var(--sm-muted)]">
                This creates or updates login access for the current workspace. If you leave password blank, a one-time password is generated.
              </p>

              <form className="mt-5 grid gap-4" onSubmit={(event) => void handleInvite(event)}>
                <label className="grid gap-2 text-sm font-semibold text-[var(--sm-muted)]">
                  Name
                  <input
                    className="sm-input"
                    onChange={(event) => setInviteForm((current) => ({ ...current, name: event.target.value }))}
                    placeholder="Plant manager"
                    value={inviteForm.name}
                  />
                </label>
                <label className="grid gap-2 text-sm font-semibold text-[var(--sm-muted)]">
                  Email
                  <input
                    className="sm-input"
                    onChange={(event) => setInviteForm((current) => ({ ...current, email: event.target.value }))}
                    placeholder="manager@company.com"
                    type="email"
                    value={inviteForm.email}
                  />
                </label>
                <label className="grid gap-2 text-sm font-semibold text-[var(--sm-muted)]">
                  Role
                  <select
                    className="sm-input"
                    onChange={(event) => setInviteForm((current) => ({ ...current, role: event.target.value }))}
                    value={inviteForm.role}
                  >
                    {roleOptions.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-2 text-sm font-semibold text-[var(--sm-muted)]">
                  Password
                  <input
                    className="sm-input"
                    onChange={(event) => setInviteForm((current) => ({ ...current, password: event.target.value }))}
                    placeholder="Leave blank to auto-generate"
                    value={inviteForm.password}
                  />
                </label>
                <div className="flex flex-wrap gap-3">
                  <button className="sm-button-primary" disabled={inviteBusy} type="submit">
                    {inviteBusy ? 'Adding...' : 'Add member'}
                  </button>
                </div>
              </form>

              {inviteMessage ? <div className="sm-chip mt-4 text-[var(--sm-muted)]">{inviteMessage}</div> : null}
            </article>
          </section>

          <section className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
            <article className="sm-surface p-6">
              <p className="sm-kicker text-[var(--sm-accent)]">Agent loops</p>
              <div className="mt-4 space-y-3">
                {(agentPayload?.scaling_model?.core_loop ?? []).map((item) => (
                  <div className="sm-chip text-white" key={item}>
                    {item}
                  </div>
                ))}
                {!(agentPayload?.scaling_model?.core_loop ?? []).length ? (
                  <div className="sm-chip text-[var(--sm-muted)]">No core loop loaded yet.</div>
                ) : null}
              </div>

              <div className="mt-6 space-y-4">
                {(agentPayload?.teams ?? []).map((team) => (
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
                  </div>
                ))}
              </div>
            </article>

            <div className="space-y-6">
              <article className="sm-surface p-6">
                <p className="sm-kicker text-[var(--sm-accent-alt)]">Founder attention</p>
                <div className="mt-4 space-y-3">
                  {(agentPayload?.scaling_model?.founder_focus ?? []).map((item) => (
                    <div className="border-b border-white/8 pb-3 text-sm text-[var(--sm-muted)] last:border-b-0 last:pb-0" key={item}>
                      {item}
                    </div>
                  ))}
                </div>
              </article>

              <article className="sm-surface p-6">
                <p className="sm-kicker text-[var(--sm-accent)]">Control rules</p>
                <div className="mt-4 space-y-3">
                  {(agentPayload?.scaling_model?.rules ?? []).map((item) => (
                    <div className="border-b border-white/8 pb-3 text-sm text-[var(--sm-muted)] last:border-b-0 last:pb-0" key={item}>
                      {item}
                    </div>
                  ))}
                </div>
              </article>

              <article className="sm-surface p-6">
                <p className="sm-kicker text-[var(--sm-accent-alt)]">Next moves</p>
                <div className="mt-4 space-y-3">
                  {(agentPayload?.next_moves ?? []).map((item) => (
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
