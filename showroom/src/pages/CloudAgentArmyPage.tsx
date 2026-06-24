import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import {
  CLOUD_100K_GROWTH_LOOP,
  CLOUD_AGENT_ARMY_ACTIVATION_STATE,
  CLOUD_AGENT_ARMY_BUILD_SEQUENCE,
  CLOUD_AGENT_ARMY_CONTRACT,
  CLOUD_AGENT_LANES,
  CLOUD_AGENT_PODS,
  CLOUD_APPROVAL_GATES,
  CLOUD_DISPATCH_BOARD,
  BACKGROUND_WORKCELLS,
  INVISIBLE_CLIENT_AGENT_RULES,
  WORKCELL_QUEUE_PACKETS,
} from '../lib/cloudAgentArmyModel'
import {
  getAgentWorkcellsControl,
  queueAgentWorkcellPacket,
  type AgentWorkcellControlPayload,
} from '../lib/workspaceApi'

const statusTone = {
  ready: 'border-emerald-300/25 bg-emerald-400/10 text-emerald-100',
  blocked: 'border-rose-300/25 bg-rose-400/10 text-rose-100',
  designing: 'border-sky-300/25 bg-sky-400/10 text-sky-100',
  approval: 'border-amber-300/25 bg-amber-400/10 text-amber-100',
} as const

const firstApplications = ['Quote intake review', 'Support triage', 'Document extraction', 'CRM cleanup'] as const

function statusLabel(status: keyof typeof statusTone) {
  return status
    .split('-')
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(' ')
}

export function CloudAgentArmyPage() {
  const [liveControl, setLiveControl] = useState<AgentWorkcellControlPayload | null>(null)
  const [controlStatus, setControlStatus] = useState('Checking live API...')
  const [queueStatus, setQueueStatus] = useState('')

  useEffect(() => {
    let active = true
    getAgentWorkcellsControl()
      .then((payload) => {
        if (!active) return
        setLiveControl(payload)
        setControlStatus(payload.status || 'ready')
      })
      .catch((error: Error & { status?: number }) => {
        if (!active) return
        setControlStatus(error.status === 401 || error.status === 403 ? 'Sign in with an operator account to see live control.' : error.message)
      })
    return () => {
      active = false
    }
  }, [])

  const liveWorkcellCount = liveControl?.workcells?.length ?? BACKGROUND_WORKCELLS.length
  const liveQueuePacketCount = liveControl?.queue_packets?.length ?? WORKCELL_QUEUE_PACKETS.length
  const liveRecentRunCount = liveControl?.recent_runs?.length ?? 0
  const canQueueWorkcell = liveControl?.can_queue === true

  async function handleQueueIntakePacket() {
    setQueueStatus('Queueing packet...')
    try {
      const result = await queueAgentWorkcellPacket({
        workcell_id: 'intake-router',
        packet_id: 'packet-intake-to-product',
        source: 'cloud_agent_army_panel',
        notes: 'Operator requested the next client intake-to-product packet from the internal workcell panel.',
      })
      setQueueStatus(result.row?.run_id ? `Queued ${result.row.run_id}` : `${result.status || 'queued'} ${result.mode || ''}`.trim())
    } catch (error) {
      setQueueStatus(error instanceof Error ? error.message : 'Could not queue packet.')
    }
  }

  return (
    <div className="space-y-6">
      <section className="sm-app-panel overflow-hidden">
        <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr] xl:items-end">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Hosted Operations</p>
            <h1 className="mt-3 text-4xl font-black tracking-[-0.06em] text-white lg:text-6xl">
              Cloud work queues with controlled actions.
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)]">
              {CLOUD_AGENT_ARMY_CONTRACT.operatingMode} Start from one repeated back-office workflow, keep risky actions approval-only, and expand only after the first queue is used weekly.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link className="sm-button-primary" to="/app/documents">
                Open Document Extraction Ledger
              </Link>
              <Link className="sm-button-secondary" to="/app/agent-workbench">
                Open Build Review
              </Link>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <article className="rounded-3xl border border-white/10 bg-black/20 p-5">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--sm-accent)]">First applications</p>
              <p className="mt-3 text-2xl font-black tracking-[-0.04em] text-white">One queue at a time.</p>
              <p className="mt-3 text-sm font-semibold leading-relaxed text-[var(--sm-muted)]">{firstApplications.join(', ')}.</p>
            </article>
            <article className="rounded-3xl border border-white/10 bg-black/20 p-5">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--sm-accent)]">Approval boundary</p>
              <p className="mt-3 text-sm font-semibold leading-relaxed text-white">{CLOUD_AGENT_ARMY_CONTRACT.rule}</p>
              <p className="mt-3 text-sm font-semibold leading-relaxed text-[var(--sm-muted)]">{CLOUD_AGENT_ARMY_CONTRACT.ledger}</p>
            </article>
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
        <article className="sm-app-panel">
          <p className="sm-kicker text-[var(--sm-accent)]">Launch packet</p>
          <h2 className="mt-3 text-3xl font-black tracking-[-0.05em] text-white">Turn strategy into queued work orders.</h2>
          <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">
            Run <code>npm run cloud-agent-army:launch</code> to generate the latest cloud activation packet, then run{' '}
            <code>npm run audit:cloud-agent-launch</code> before any hosted activation.
          </p>
        </article>
        <article className="rounded-[1.6rem] border border-white/10 bg-white/[0.035] p-5">
          <div className="grid gap-3 md:grid-cols-3">
            {['Workcells', 'Queue payloads', 'Security controls'].map((label) => (
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4" key={label}>
                <p className="text-xs font-black uppercase tracking-[0.14em] text-white/45">{label}</p>
                <p className="mt-2 text-sm font-semibold leading-relaxed text-white">Generated before cloud activation.</p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-sm font-semibold leading-relaxed text-white">
            Latest artifacts: <code>Super Mega Inc/ops/latest_cloud_agent_army_launch_packet.json</code> and{' '}
            <code>latest_cloud_agent_army_launch_packet.md</code>.
          </p>
        </article>
      </section>

      <section className="sm-app-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Live workcell control</p>
            <h2 className="mt-3 text-3xl font-black tracking-[-0.05em] text-white">API-backed queue control, not just diagrams.</h2>
          </div>
          <button
            className="sm-button-primary disabled:cursor-not-allowed disabled:opacity-45"
            disabled={!canQueueWorkcell || queueStatus === 'Queueing packet...'}
            onClick={handleQueueIntakePacket}
            type="button"
          >
            Queue intake packet
          </button>
        </div>
        <div className="mt-6 grid gap-3 md:grid-cols-4">
          {[
            ['API status', controlStatus],
            ['Workcells', String(liveWorkcellCount)],
            ['Queue packets', String(liveQueuePacketCount)],
            ['Recent runs', String(liveRecentRunCount)],
          ].map(([label, value]) => (
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4" key={label}>
              <p className="text-xs font-black uppercase tracking-[0.14em] text-white/45">{label}</p>
              <p className="mt-2 text-sm font-semibold leading-relaxed text-white">{value}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.035] p-4">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--sm-accent)]">Queue result</p>
          <p className="mt-2 text-sm font-semibold leading-relaxed text-white">
            {queueStatus || 'No packet queued from this screen yet. The button is enabled only for roles with agent-ops control access.'}
          </p>
        </div>
      </section>

      <section className="sm-app-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Activation state</p>
            <h2 className="mt-3 text-3xl font-black tracking-[-0.05em] text-white">What can run, what is blocked, and what unlocks the queue.</h2>
          </div>
          <p className="max-w-xl text-sm leading-relaxed text-[var(--sm-muted)]">
            This is the difference between a demo and a production queue: every run has a ledger, every risky action has a stop point, and every unlock is explicit.
          </p>
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-4">
          {CLOUD_AGENT_ARMY_ACTIVATION_STATE.map((item) => (
            <article className="rounded-[1.6rem] border border-white/10 bg-white/[0.035] p-5" key={item.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-white/45">{item.label}</p>
                  <h3 className="mt-2 text-lg font-black text-white">{item.value}</h3>
                </div>
                <span className={`rounded-full border px-3 py-1 text-xs font-black uppercase tracking-[0.14em] ${statusTone[item.state]}`}>
                  {statusLabel(item.state)}
                </span>
              </div>
              <p className="mt-4 text-sm leading-relaxed text-[var(--sm-muted)]">{item.proof}</p>
              <p className="mt-3 text-sm font-semibold leading-relaxed text-white">Human unlock: {item.humanUnlock}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="sm-app-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Invisible by default</p>
            <h2 className="mt-3 text-3xl font-black tracking-[-0.05em] text-white">Clients see useful software. Operators see the workcells.</h2>
          </div>
          <p className="max-w-xl text-sm leading-relaxed text-[var(--sm-muted)]">
            The product should not feel like an agent lab. Background work is exposed only as controlled internal operations with proof, permissions, and review gates.
          </p>
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {INVISIBLE_CLIENT_AGENT_RULES.map((rule) => (
            <article className="rounded-[1.6rem] border border-white/10 bg-white/[0.035] p-5" key={rule.id}>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--sm-accent)]">{rule.rule}</p>
              <div className="mt-4 grid gap-3">
                <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-white/45">Client sees</p>
                  <p className="mt-2 text-sm font-semibold leading-relaxed text-white">{rule.clientSees}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-white/45">Operator sees</p>
                  <p className="mt-2 text-sm font-semibold leading-relaxed text-white">{rule.operatorSees}</p>
                </div>
              </div>
              <p className="mt-4 text-sm leading-relaxed text-[var(--sm-muted)]">{rule.auditSignal}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="sm-app-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Background workcells</p>
            <h2 className="mt-3 text-3xl font-black tracking-[-0.05em] text-white">The actual machine behind each product.</h2>
          </div>
          <p className="max-w-xl text-sm leading-relaxed text-[var(--sm-muted)]">
            Every workcell has a trigger, a user-visible output, a tool allowlist, blocked actions, evidence, and an approval owner.
          </p>
        </div>
        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          {BACKGROUND_WORKCELLS.map((workcell) => (
            <article className="rounded-[1.6rem] border border-white/10 bg-white/[0.035] p-5" key={workcell.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--sm-accent)]">{workcell.trigger}</p>
                  <h3 className="mt-2 text-xl font-black tracking-[-0.03em] text-white">{workcell.name}</h3>
                </div>
                <span className="sm-status-pill">{workcell.maturity}</span>
              </div>
              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-white/45">User output</p>
                  <p className="mt-2 text-sm font-semibold leading-relaxed text-white">{workcell.clientOutput}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-white/45">Internal control</p>
                  <p className="mt-2 text-sm font-semibold leading-relaxed text-white">{workcell.operatorControl}</p>
                </div>
              </div>
              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-white/45">Allowed tools</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {workcell.allowedTools.map((tool) => (
                      <span className="sm-status-pill" key={tool}>{tool}</span>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-white/45">Blocked</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {workcell.blockedActions.slice(0, 4).map((action) => (
                      <span className="rounded-full border border-rose-300/25 bg-rose-400/10 px-3 py-1 text-xs font-black text-rose-100" key={action}>
                        {action}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-3">
                <p className="text-xs font-black uppercase tracking-[0.14em] text-white/45">Review gate</p>
                <p className="mt-2 text-sm font-semibold leading-relaxed text-white">{workcell.reviewGate}</p>
              </div>
              <div className="mt-4 flex flex-wrap gap-2 text-xs font-black uppercase tracking-[0.14em]">
                <Link className="sm-status-pill" to={workcell.route}>Open route</Link>
                <span className="sm-status-pill">{workcell.api}</span>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-5">
        {CLOUD_AGENT_LANES.map((lane) => (
          <article className="rounded-[1.6rem] border border-white/10 bg-white/[0.035] p-5" key={lane.id}>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--sm-accent)]">{lane.provider}</p>
            <h2 className="mt-3 text-xl font-black tracking-[-0.03em] text-white">{lane.name}</h2>
            <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{lane.trigger}</p>
            <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-3">
              <p className="text-xs font-black uppercase tracking-[0.14em] text-white/45">State</p>
              <p className="mt-2 text-sm font-semibold leading-relaxed text-white">{lane.state}</p>
            </div>
          </article>
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <article className="sm-app-panel">
          <p className="sm-kicker text-[var(--sm-accent)]">100k loop</p>
          <h2 className="mt-3 text-3xl font-black tracking-[-0.05em] text-white">Growth becomes a cloud queue.</h2>
          <div className="mt-6 grid gap-3">
            {CLOUD_100K_GROWTH_LOOP.map((stage) => (
              <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-4" key={stage.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--sm-accent)]">{stage.target}</p>
                    <h3 className="mt-2 text-lg font-black text-white">{stage.label}</h3>
                  </div>
                  <span className="sm-status-pill">{stage.agentPod}</span>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{stage.output}</p>
                <p className="mt-3 text-sm font-semibold leading-relaxed text-white">{stage.revenueLogic}</p>
              </div>
            ))}
          </div>
        </article>

        <article className="sm-app-panel">
          <p className="sm-kicker text-[var(--sm-accent)]">Approval gates</p>
          <h2 className="mt-3 text-3xl font-black tracking-[-0.05em] text-white">The system is not allowed to freelance.</h2>
          <div className="mt-6 grid gap-3">
            {CLOUD_APPROVAL_GATES.map(([gate, rule]) => (
              <div className="rounded-3xl border border-white/10 bg-black/20 p-4" key={gate}>
                <p className="text-sm font-black text-white">{gate}</p>
                <p className="mt-2 text-sm leading-relaxed text-[var(--sm-muted)]">{rule}</p>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="sm-app-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
          <p className="sm-kicker text-[var(--sm-accent)]">Workcells</p>
          <h2 className="mt-3 text-3xl font-black tracking-[-0.05em] text-white">Each team has a measurable job.</h2>
          </div>
          <p className="max-w-xl text-sm leading-relaxed text-[var(--sm-muted)]">
            The team model lets SuperMega scale beyond one founder without giving background work uncontrolled access to client systems.
          </p>
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {CLOUD_AGENT_PODS.map((pod) => (
            <article className="rounded-[1.6rem] border border-white/10 bg-white/[0.035] p-5" key={pod.id}>
              <h3 className="text-xl font-black tracking-[-0.03em] text-white">{pod.name}</h3>
              <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{pod.mission}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {pod.agents.map((agent) => (
                  <span className="sm-status-pill" key={agent}>{agent}</span>
                ))}
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-white/45">Success</p>
                  <p className="mt-2 text-sm font-semibold leading-relaxed text-white">{pod.successMetric}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-white/45">Blocked until</p>
                  <p className="mt-2 text-sm font-semibold leading-relaxed text-white">{pod.blockedUntil}</p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <article className="sm-app-panel">
          <p className="sm-kicker text-[var(--sm-accent)]">Dispatch board</p>
          <h2 className="mt-3 text-3xl font-black tracking-[-0.05em] text-white">What the hosted workforce should work on next.</h2>
          <div className="mt-6 grid gap-3">
            {CLOUD_DISPATCH_BOARD.map((item) => (
              <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-4" key={item.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-base font-black text-white">{item.title}</h3>
                    <p className="mt-1 text-xs font-black uppercase tracking-[0.14em] text-white/45">{item.owner} / {item.cloudLane}</p>
                  </div>
                  <span className={`rounded-full border px-3 py-1 text-xs font-black uppercase tracking-[0.14em] ${statusTone[item.status]}`}>
                    {statusLabel(item.status)}
                  </span>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{item.nextAction}</p>
                <p className="mt-3 text-sm font-semibold leading-relaxed text-white">{item.proof}</p>
              </div>
            ))}
          </div>
        </article>

        <article className="sm-app-panel">
          <p className="sm-kicker text-[var(--sm-accent)]">Build sequence</p>
          <h2 className="mt-3 text-3xl font-black tracking-[-0.05em] text-white">Cloud first, controlled first.</h2>
          <div className="mt-6 grid gap-3">
            {CLOUD_AGENT_ARMY_BUILD_SEQUENCE.map((step, index) => (
              <div className="flex items-start gap-3 rounded-3xl border border-white/10 bg-black/20 p-4" key={step}>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--sm-accent)] text-sm font-black text-black">
                  {index + 1}
                </span>
                <p className="text-sm font-semibold leading-relaxed text-white">{step}</p>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="sm-app-panel">
        <p className="sm-kicker text-[var(--sm-accent)]">Queue packet pattern</p>
        <h2 className="mt-3 text-3xl font-black tracking-[-0.05em] text-white">Every run starts from a packet, not a chat wish.</h2>
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {WORKCELL_QUEUE_PACKETS.map((packet) => (
            <article className="rounded-[1.6rem] border border-white/10 bg-white/[0.035] p-5" key={packet.id}>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--sm-accent)]">{packet.workcellId}</p>
              <h3 className="mt-2 text-lg font-black text-white">{packet.output}</h3>
              <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{packet.source}</p>
              <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-3">
                <p className="text-xs font-black uppercase tracking-[0.14em] text-white/45">Owner</p>
                <p className="mt-2 text-sm font-semibold leading-relaxed text-white">{packet.reviewOwner}</p>
              </div>
              <p className="mt-4 text-sm leading-relaxed text-[var(--sm-muted)]">{packet.rollback}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
