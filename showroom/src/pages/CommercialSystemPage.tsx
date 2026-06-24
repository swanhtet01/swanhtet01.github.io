import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import {
  COMMERCIAL_AGENT_TEAM,
  COMMERCIAL_CHECKLISTS,
  COMMERCIAL_OFFERS,
  COMMERCIAL_PERSONAS,
  COMMERCIAL_POSITIONING,
  COMMERCIAL_PRICING_TIERS,
  COMMERCIAL_SOCIAL_APPROVAL_POLICY,
  COMMERCIAL_SOCIAL_CADENCE,
  COMMERCIAL_SOLUTION_BLUEPRINTS,
  COMMERCIAL_TEMPLATES,
  type CommercialOffer,
  type CommercialSolutionBlueprint,
  type CommercialTemplate,
} from '../lib/commercialOperatingSystem'
import { PRODUCTIZED_OFFERS, PRODUCTIZED_OFFER_SEQUENCE } from '../lib/productizedOffers'
import { DEFAULT_WORKSPACE_ROUTE_ACCESS, resolveWorkspaceRouteAccess, type WorkspaceRouteAccess } from '../lib/workspaceRouteAccess'

const requiredCapabilities = ['sales.view', 'agent_ops.view', 'tenant_admin.view', 'platform_admin.view'] as const

type CommercialExecutionBoard = {
  generated_at: string
  generated_for: string
  metrics: {
    post_count: number
    outreach_draft_count: number
    review_required_count: number
    campaign_experiment_count: number
    proof_task_count: number
  }
  approval_lanes: {
    id: string
    name: string
    owner: string
    count: number
    status: string
    next_action: string
  }[]
  campaign_experiments: {
    id: string
    status: string
    offer_id: string
    channel: string
    audience: string
    hypothesis: string
    weekly_action: string
    success_metric: string
  }[]
  proof_tasks: {
    id: string
    name: string
    output: string
    owner: string
    due: string
  }[]
  daily_control_actions: string[]
  safety_policy: {
    social_posting: string
    outreach_sending: string
    external_writes: string
    reason: string
  }
}

type CommercialSocialQueue = {
  generated_at: string
  generated_for: string
  metrics: {
    post_count: number
    outreach_draft_count: number
    offer_count: number
    review_required_count: number
  }
  posts: {
    id: string
    date: string
    channel: string
    offer: string
    offer_id: string
    status: string
    asset: string
    post_text: string
    review_gate: string
    next_action: string
  }[]
}

type ClientStartPacket = {
  id: string
  status: string
  priority: number
  situation_label: string
  plain_language_pain: string
  no_client_choice_required: boolean
  primary_tool: {
    name: string
    route: string
    approval_boundary: string
  }
  first_deliverable: {
    name: string
    first_screen: string
    price_hint: string
    expected_output: string
    acceptance_checks: string[]
  }
  source_checklist: string[]
  sales_operator_checklist: string[]
  sales_reply_template: string
  public_routes: {
    intake: string
    products: string
    tool: string
    packet_json: string
  }
  receipt_contract: {
    ids: string[]
    next_steps: string[]
  }
  payment_readiness: {
    status: string
    rule: string
  }
}

type ClientStartPackets = {
  generated_at: string
  generated_for: string
  metrics: {
    packet_count: number
    source_check_count: number
    acceptance_check_count: number
    quote_ready_count: number
    no_client_choice_required_count: number
  }
  onboarding_sequence: {
    step: number
    name: string
    output: string
  }[]
  owner_control_contract: {
    rule: string
    owner_decides: string[]
    system_prepares: string[]
  }
  packets: ClientStartPacket[]
}

function compactList(items: string[]) {
  return items.join(' | ')
}

function templateText(template: CommercialTemplate, offer: CommercialOffer) {
  const replacements: Record<string, string> = {
    '{{workflow}}': offer.firstWorkflow,
    '{{team}}': offer.targetBuyer,
    '{{pain}}': offer.qualifyingPain,
    '{{company}}': 'the company',
    '{{first_name}}': 'there',
  }
  let body = template.body
  for (const [token, value] of Object.entries(replacements)) {
    body = body.replaceAll(token, value)
  }
  return body
}

function OfferCard({
  active,
  offer,
  onSelect,
}: {
  active: boolean
  offer: CommercialOffer
  onSelect: (offerId: string) => void
}) {
  return (
    <button
      className={`rounded-[1.2rem] border p-4 text-left transition ${
        active ? 'border-[var(--sm-accent)] bg-white shadow-sm' : 'border-slate-200 bg-white/70 hover:border-slate-300'
      }`}
      onClick={() => onSelect(offer.id)}
      type="button"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[0.68rem] font-black uppercase tracking-[0.18em] text-[var(--sm-muted)]">{offer.category}</p>
          <h3 className="mt-2 text-xl font-black leading-tight text-[var(--sm-ink)]">{offer.name}</h3>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-black text-slate-600">{offer.starterPrice}</span>
      </div>
      <p className="mt-3 text-sm leading-6 text-[var(--sm-muted)]">{offer.promise}</p>
    </button>
  )
}

export function CommercialSystemPage() {
  const [access, setAccess] = useState<WorkspaceRouteAccess>(DEFAULT_WORKSPACE_ROUTE_ACCESS)
  const [selectedOfferId, setSelectedOfferId] = useState(COMMERCIAL_OFFERS[0]?.id ?? '')
  const [selectedBlueprintId, setSelectedBlueprintId] = useState(COMMERCIAL_SOLUTION_BLUEPRINTS[0]?.id ?? '')
  const [copiedTemplateId, setCopiedTemplateId] = useState<string | null>(null)
  const [copiedPacketId, setCopiedPacketId] = useState<string | null>(null)
  const [executionBoard, setExecutionBoard] = useState<CommercialExecutionBoard | null>(null)
  const [socialQueue, setSocialQueue] = useState<CommercialSocialQueue | null>(null)
  const [clientPackets, setClientPackets] = useState<ClientStartPackets | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadAccess() {
      const nextAccess = await resolveWorkspaceRouteAccess({
        requiredCapabilities: [...requiredCapabilities],
        unauthenticatedMessage: 'Login is required to open the commercial system.',
        previewMessage: 'Commercial system needs the authenticated app host.',
      })
      if (!cancelled) {
        setAccess(nextAccess)
      }
    }

    void loadAccess()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function loadExecutionBoard() {
      try {
        const response = await fetch('/site/commercial-execution-board.json', { cache: 'no-store' })
        if (!response.ok) {
          return
        }
        const payload = (await response.json()) as CommercialExecutionBoard
        if (!cancelled) {
          setExecutionBoard(payload)
        }
      } catch {
        if (!cancelled) {
          setExecutionBoard(null)
        }
      }
    }

    void loadExecutionBoard()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function loadSocialQueue() {
      try {
        const response = await fetch('/site/social-post-queue.json', { cache: 'no-store' })
        if (!response.ok) {
          return
        }
        const payload = (await response.json()) as CommercialSocialQueue
        if (!cancelled) {
          setSocialQueue(payload)
        }
      } catch {
        if (!cancelled) {
          setSocialQueue(null)
        }
      }
    }

    void loadSocialQueue()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function loadClientPackets() {
      try {
        const response = await fetch('/site/client-start-packets.json', { cache: 'no-store' })
        if (!response.ok) {
          return
        }
        const payload = (await response.json()) as ClientStartPackets
        if (!cancelled) {
          setClientPackets(payload)
        }
      } catch {
        if (!cancelled) {
          setClientPackets(null)
        }
      }
    }

    void loadClientPackets()
    return () => {
      cancelled = true
    }
  }, [])

  const selectedOffer = useMemo(
    () => COMMERCIAL_OFFERS.find((offer) => offer.id === selectedOfferId) ?? COMMERCIAL_OFFERS[0],
    [selectedOfferId],
  )

  const selectedBlueprint = useMemo(
    () => COMMERCIAL_SOLUTION_BLUEPRINTS.find((blueprint) => blueprint.id === selectedBlueprintId) ?? COMMERCIAL_SOLUTION_BLUEPRINTS[0],
    [selectedBlueprintId],
  )

  async function copyTemplate(template: CommercialTemplate) {
    const text = templateText(template, selectedOffer)
    try {
      await navigator.clipboard.writeText(template.subject ? `${template.subject}\n\n${text}` : text)
      setCopiedTemplateId(template.id)
      window.setTimeout(() => setCopiedTemplateId(null), 1800)
    } catch {
      setCopiedTemplateId(null)
    }
  }

  async function copyClientPacket(packet: ClientStartPacket) {
    const text = [
      packet.sales_reply_template,
      '',
      `Intake link: ${packet.public_routes.intake}`,
      `Tool: ${packet.primary_tool.name}`,
      `Approval boundary: ${packet.primary_tool.approval_boundary}`,
    ].join('\n')
    try {
      await navigator.clipboard.writeText(text)
      setCopiedPacketId(packet.id)
      window.setTimeout(() => setCopiedPacketId(null), 1800)
    } catch {
      setCopiedPacketId(null)
    }
  }

  function selectBlueprint(blueprint: CommercialSolutionBlueprint) {
    setSelectedBlueprintId(blueprint.id)
    setSelectedOfferId(blueprint.primaryOfferId)
  }

  if (access.loading) {
    return <div className="sm-chip text-white">Loading commercial system...</div>
  }

  if (!access.allowed) {
    return (
      <section className="sm-app-auth-panel">
        <p className="sm-kicker text-[var(--sm-accent)]">Commercial System</p>
        <h1 className="text-3xl font-black text-white">Sales access required.</h1>
        <p className="mt-3 max-w-2xl text-sm text-white/68">{access.error ?? 'Use a sales, operator, tenant admin, or platform admin account.'}</p>
      </section>
    )
  }

  return (
    <div className="grid gap-6 pb-28">
      <section className="sm-calm-surface overflow-hidden p-0">
        <div className="grid gap-0 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="p-6 md:p-8">
            <p className="text-[0.7rem] font-black uppercase tracking-[0.22em] text-[var(--sm-accent)]">Commercial operating system</p>
            <h1 className="mt-3 max-w-4xl text-4xl font-black text-[var(--sm-ink)] md:text-6xl">
              Sell the exact workflow first, then expand into the company workspace.
            </h1>
            <p className="mt-4 max-w-3xl text-sm leading-6 text-[var(--sm-muted)]">{COMMERCIAL_POSITIONING.salesRule}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link className="sm-button-primary" to="/app/revenue/pipeline">
                Work pipeline
              </Link>
              <Link className="sm-button-secondary" to="/app/revenue/growth">
                Open growth machine
              </Link>
              <a className="sm-button-secondary" href="https://supermega.dev/contact" rel="noreferrer" target="_blank">
                Open public CTA
              </a>
            </div>
          </div>
          <div className="border-t border-slate-200 bg-[#eef4ef] p-6 md:p-8 xl:border-l xl:border-t-0">
            <div className="grid gap-4">
              {[
                ['Buyer asks for', COMMERCIAL_POSITIONING.thesis],
                ['Risk to avoid', COMMERCIAL_POSITIONING.antithesis],
                ['SuperMega answer', COMMERCIAL_POSITIONING.synthesis],
              ].map(([label, value]) => (
                <article className="rounded-[1.2rem] border border-slate-200 bg-white/78 p-4" key={label}>
                  <p className="text-[0.68rem] font-black uppercase tracking-[0.18em] text-[var(--sm-muted)]">{label}</p>
                  <p className="mt-2 text-sm font-bold leading-6 text-[var(--sm-ink)]">{value}</p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
        <article className="sm-terminal p-5 md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Execution board</p>
              <h2 className="mt-2 text-3xl font-black text-white">Commercial loop state.</h2>
            </div>
            <a className="sm-button-secondary" href="/site/commercial-execution-board.json" rel="noreferrer" target="_blank">
              Open JSON
            </a>
          </div>
          {executionBoard ? (
            <>
              <p className="mt-4 text-sm leading-6 text-[var(--sm-muted)]">
                Generated for {executionBoard.generated_for}. Posting and outreach stay manual until account approval and connector state are explicit.
              </p>
              <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {[
                  ['Posts', executionBoard.metrics.post_count],
                  ['Outreach', executionBoard.metrics.outreach_draft_count],
                  ['Review', executionBoard.metrics.review_required_count],
                  ['Experiments', executionBoard.metrics.campaign_experiment_count],
                  ['Proof tasks', executionBoard.metrics.proof_task_count],
                ].map(([label, value]) => (
                  <div className="rounded-[1.1rem] border border-white/10 bg-white/[0.04] p-4" key={label}>
                    <strong className="block text-3xl font-black text-white">{value}</strong>
                    <span className="mt-1 block text-[0.66rem] font-black uppercase tracking-[0.16em] text-[var(--sm-muted)]">{label}</span>
                  </div>
                ))}
              </div>
              <div className="mt-5 rounded-[1.2rem] border border-white/10 bg-white/[0.04] p-4">
                <p className="text-[0.66rem] font-black uppercase tracking-[0.16em] text-[var(--sm-muted)]">Safety policy</p>
                <p className="mt-2 text-sm leading-6 text-white/78">{executionBoard.safety_policy.reason}</p>
              </div>
            </>
          ) : (
            <p className="mt-4 text-sm leading-6 text-[var(--sm-muted)]">
              Run <span className="font-black text-white">npm run commercial:board</span> after refreshing the social queue to publish the current execution board.
            </p>
          )}
        </article>

        <article className="sm-calm-surface p-5 md:p-6">
          <p className="text-[0.7rem] font-black uppercase tracking-[0.22em] text-[var(--sm-accent)]">Approval lanes</p>
          <h2 className="mt-2 text-3xl font-black text-[var(--sm-ink)]">Every autonomous action has a gate.</h2>
          <div className="mt-5 grid gap-3 lg:grid-cols-2">
            {(executionBoard?.approval_lanes ?? [
              {
                id: 'fallback-review',
                name: 'Review required',
                owner: 'Founder',
                count: 0,
                status: 'run_board',
                next_action: 'Generate the board to load live queue state.',
              },
            ]).map((lane) => (
              <article className="rounded-[1.2rem] border border-slate-200 bg-white/78 p-4" key={lane.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-xl font-black text-[var(--sm-ink)]">{lane.name}</h3>
                    <p className="mt-1 text-xs font-bold uppercase tracking-[0.14em] text-[var(--sm-muted)]">{lane.owner}</p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-black text-slate-600">
                    {lane.count} / {lane.status}
                  </span>
                </div>
                <p className="mt-3 text-sm leading-6 text-[var(--sm-muted)]">{lane.next_action}</p>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.86fr_1.14fr]">
        <article className="sm-terminal p-5 md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Client start packets</p>
              <h2 className="mt-2 text-3xl font-black text-white">Let buyers describe the situation, not choose software.</h2>
            </div>
            <a className="sm-button-secondary" href="/site/client-start-packets.json" rel="noreferrer" target="_blank">
              Open packets
            </a>
          </div>
          <p className="mt-4 text-sm leading-6 text-[var(--sm-muted)]">
            {clientPackets
              ? `${clientPackets.metrics.packet_count} packets convert simple buyer language into a source checklist, proof scope, receipt contract, and quote-ready gate.`
              : 'Run npm run commercial:refresh to publish the client packet lane.'}
          </p>
          <div className="mt-5 grid gap-3">
            {(clientPackets?.onboarding_sequence ?? []).map((step) => (
              <div className="rounded-[1.1rem] border border-white/10 bg-white/[0.04] p-4" key={step.step}>
                <p className="text-[0.66rem] font-black uppercase tracking-[0.16em] text-[var(--sm-accent)]">Step {step.step}</p>
                <h3 className="mt-2 text-lg font-black text-white">{step.name}</h3>
                <p className="mt-2 text-sm leading-6 text-[var(--sm-muted)]">{step.output}</p>
              </div>
            ))}
          </div>
          {clientPackets ? (
            <div className="mt-5 rounded-[1.2rem] border border-white/10 bg-white/[0.04] p-4">
              <p className="text-[0.66rem] font-black uppercase tracking-[0.16em] text-[var(--sm-muted)]">Owner control</p>
              <p className="mt-2 text-sm leading-6 text-white/82">{clientPackets.owner_control_contract.rule}</p>
            </div>
          ) : null}
        </article>

        <article className="sm-calm-surface p-5 md:p-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-[0.7rem] font-black uppercase tracking-[0.22em] text-[var(--sm-accent)]">Situation router</p>
              <h2 className="mt-2 text-3xl font-black text-[var(--sm-ink)]">One packet becomes the first reply, source ask, and proof promise.</h2>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-slate-600">
              {clientPackets?.metrics.quote_ready_count ?? 0} quote-ready
            </span>
          </div>
          <div className="mt-5 grid gap-4 xl:grid-cols-2">
            {(clientPackets?.packets ?? []).map((packet) => (
              <article className="rounded-[1.2rem] border border-slate-200 bg-white/78 p-4" key={packet.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[0.68rem] font-black uppercase tracking-[0.18em] text-[var(--sm-muted)]">
                      Priority {packet.priority} | {packet.status}
                    </p>
                    <h3 className="mt-2 text-xl font-black leading-tight text-[var(--sm-ink)]">{packet.situation_label}</h3>
                  </div>
                  <button className="sm-button-secondary" onClick={() => void copyClientPacket(packet)} type="button">
                    {copiedPacketId === packet.id ? 'Copied' : 'Copy reply'}
                  </button>
                </div>
                <p className="mt-3 text-sm leading-6 text-[var(--sm-muted)]">{packet.plain_language_pain}</p>
                <div className="mt-4 rounded-[1rem] bg-slate-50 p-3">
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--sm-accent)]">{packet.primary_tool.name}</p>
                  <p className="mt-2 text-sm font-bold leading-6 text-[var(--sm-ink)]">{packet.first_deliverable.name}</p>
                  <p className="mt-1 text-sm leading-6 text-[var(--sm-muted)]">{packet.first_deliverable.price_hint}</p>
                </div>
                <div className="mt-4 grid gap-2">
                  {packet.source_checklist.slice(0, 3).map((item) => (
                    <p className="grid grid-cols-[auto_1fr] gap-2 text-sm leading-6 text-[var(--sm-muted)]" key={item}>
                      <span className="mt-2 h-2 w-2 rounded-full bg-[var(--sm-accent)]" />
                      <span>{item}</span>
                    </p>
                  ))}
                </div>
                <p className="mt-4 text-xs font-bold leading-5 text-slate-500">{packet.payment_readiness.rule}</p>
              </article>
            ))}
          </div>
        </article>
      </section>

      {executionBoard ? (
        <section className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
          <article className="sm-calm-surface p-5 md:p-6">
            <p className="text-[0.7rem] font-black uppercase tracking-[0.22em] text-[var(--sm-accent)]">Campaign experiments</p>
            <h2 className="mt-2 text-3xl font-black text-[var(--sm-ink)]">Test one market belief at a time.</h2>
            <div className="mt-5 grid gap-3">
              {executionBoard.campaign_experiments.map((experiment) => (
                <article className="rounded-[1.2rem] border border-slate-200 bg-white/78 p-4" key={experiment.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-xl font-black text-[var(--sm-ink)]">{experiment.audience}</h3>
                      <p className="mt-1 text-xs font-bold uppercase tracking-[0.14em] text-[var(--sm-muted)]">
                        {experiment.channel} | {experiment.offer_id}
                      </p>
                    </div>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-black text-slate-600">{experiment.status}</span>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-[var(--sm-muted)]">{experiment.hypothesis}</p>
                  <p className="mt-3 text-sm font-black text-[var(--sm-ink)]">{experiment.weekly_action}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-500">{experiment.success_metric}</p>
                </article>
              ))}
            </div>
          </article>

          <article className="sm-calm-surface p-5 md:p-6">
            <p className="text-[0.7rem] font-black uppercase tracking-[0.22em] text-[var(--sm-accent)]">Proof system</p>
            <h2 className="mt-2 text-3xl font-black text-[var(--sm-ink)]">Capture evidence before making bigger claims.</h2>
            <div className="mt-5 grid gap-3">
              {executionBoard.proof_tasks.map((task) => (
                <article className="rounded-[1.2rem] border border-slate-200 bg-white/78 p-4" key={task.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <h3 className="text-lg font-black text-[var(--sm-ink)]">{task.name}</h3>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-black text-slate-600">{task.due}</span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-[var(--sm-muted)]">{task.output}</p>
                  <p className="mt-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-500">{task.owner}</p>
                </article>
              ))}
            </div>
          </article>
        </section>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <article className="sm-calm-surface p-5 md:p-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-[0.7rem] font-black uppercase tracking-[0.22em] text-[var(--sm-accent)]">Client fit builder</p>
              <h2 className="mt-2 text-3xl font-black text-[var(--sm-ink)]">Pick the buyer situation, then sell the exact first system.</h2>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-slate-600">
              {COMMERCIAL_SOLUTION_BLUEPRINTS.length} playbooks
            </span>
          </div>
          <div className="mt-5 grid gap-3">
            {COMMERCIAL_SOLUTION_BLUEPRINTS.map((blueprint) => (
              <button
                className={`rounded-[1.2rem] border p-4 text-left transition ${
                  selectedBlueprint.id === blueprint.id
                    ? 'border-[var(--sm-accent)] bg-white shadow-sm'
                    : 'border-slate-200 bg-white/78 hover:border-slate-300'
                }`}
                key={blueprint.id}
                onClick={() => selectBlueprint(blueprint)}
                type="button"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-xl font-black text-[var(--sm-ink)]">{blueprint.name}</h3>
                    <p className="mt-1 text-xs font-bold uppercase tracking-[0.14em] text-[var(--sm-muted)]">{blueprint.firstScreen}</p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-black text-slate-600">{blueprint.priceTierId}</span>
                </div>
                <p className="mt-3 text-sm leading-6 text-[var(--sm-muted)]">{blueprint.buyerSituation}</p>
              </button>
            ))}
          </div>
        </article>

        <article className="sm-terminal p-5 md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Selected client playbook</p>
              <h2 className="mt-2 text-3xl font-black text-white">{selectedBlueprint.name}</h2>
            </div>
            <Link className="sm-button-secondary" to={selectedBlueprint.proofRoute}>
              Open proof
            </Link>
          </div>
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <div className="rounded-[1.2rem] border border-white/10 bg-white/[0.04] p-4">
              <p className="text-[0.66rem] font-black uppercase tracking-[0.16em] text-[var(--sm-muted)]">They ask for</p>
              <p className="mt-2 text-sm leading-6 text-white/82">{selectedBlueprint.whatTheyThinkTheyWant}</p>
            </div>
            <div className="rounded-[1.2rem] border border-white/10 bg-white/[0.04] p-4">
              <p className="text-[0.66rem] font-black uppercase tracking-[0.16em] text-[var(--sm-muted)]">Sell instead</p>
              <p className="mt-2 text-sm leading-6 text-white/82">{selectedBlueprint.whatTheyActuallyNeed}</p>
            </div>
          </div>
          <div className="mt-5 rounded-[1.2rem] border border-white/10 bg-white/[0.04] p-4">
            <p className="text-[0.66rem] font-black uppercase tracking-[0.16em] text-[var(--sm-muted)]">Proposal opening</p>
            <p className="mt-2 text-sm leading-6 text-white/82">{selectedBlueprint.proposalOpening}</p>
          </div>
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <div>
              <p className="text-[0.66rem] font-black uppercase tracking-[0.16em] text-[var(--sm-accent)]">Discovery questions</p>
              <ul className="mt-3 grid gap-2">
                {selectedBlueprint.discoveryQuestions.map((item) => (
                  <li className="text-sm leading-6 text-white/82" key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-[0.66rem] font-black uppercase tracking-[0.16em] text-[var(--sm-accent)]">Source checklist</p>
              <ul className="mt-3 grid gap-2">
                {selectedBlueprint.sourceChecklist.map((item) => (
                  <li className="text-sm leading-6 text-white/82" key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
          <div className="mt-5 rounded-[1.2rem] border border-white/10 bg-white/[0.04] p-4">
            <p className="text-[0.66rem] font-black uppercase tracking-[0.16em] text-[var(--sm-muted)]">Risk to control</p>
            <p className="mt-2 text-sm leading-6 text-white/82">{selectedBlueprint.decisionRisk}</p>
          </div>
        </article>
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <article className="sm-calm-surface p-5 md:p-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-[0.7rem] font-black uppercase tracking-[0.22em] text-[var(--sm-accent)]">Offer menu</p>
              <h2 className="mt-2 text-3xl font-black text-[var(--sm-ink)]">Main products and core offerings.</h2>
            </div>
          </div>
          <div className="mt-5 grid gap-3">
            {COMMERCIAL_OFFERS.map((offer) => (
              <OfferCard active={selectedOffer.id === offer.id} key={offer.id} offer={offer} onSelect={setSelectedOfferId} />
            ))}
          </div>
        </article>

        <article className="sm-terminal p-5 md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Selected offer</p>
              <h2 className="mt-2 text-3xl font-black text-white">{selectedOffer.name}</h2>
            </div>
            <Link className="sm-button-secondary" to={selectedOffer.proofRoute}>
              Open proof route
            </Link>
          </div>
          <p className="mt-4 text-sm leading-6 text-[var(--sm-muted)]">{selectedOffer.promise}</p>
          <div className="mt-6 grid gap-3 md:grid-cols-3">
            {[
              ['Starter', selectedOffer.starterPrice],
              ['Pilot', selectedOffer.pilotPrice],
              ['Retainer', selectedOffer.retainerPrice],
            ].map(([label, value]) => (
              <div className="rounded-[1.2rem] border border-white/10 bg-white/[0.04] p-4" key={label}>
                <p className="text-[0.66rem] font-black uppercase tracking-[0.16em] text-[var(--sm-muted)]">{label}</p>
                <p className="mt-2 text-xl font-black text-white">{value}</p>
              </div>
            ))}
          </div>
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <div>
              <p className="text-[0.66rem] font-black uppercase tracking-[0.16em] text-[var(--sm-accent)]">Qualifying pain</p>
              <p className="mt-2 text-sm leading-6 text-white/82">{selectedOffer.qualifyingPain}</p>
            </div>
            <div>
              <p className="text-[0.66rem] font-black uppercase tracking-[0.16em] text-[var(--sm-accent)]">First workflow</p>
              <p className="mt-2 text-sm leading-6 text-white/82">{selectedOffer.firstWorkflow}</p>
            </div>
          </div>
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <div className="rounded-[1.2rem] border border-white/10 bg-white/[0.04] p-4">
              <p className="text-[0.66rem] font-black uppercase tracking-[0.16em] text-[var(--sm-muted)]">Source inputs</p>
              <p className="mt-2 text-sm leading-6 text-white/82">{compactList(selectedOffer.sourceInputs)}</p>
            </div>
            <div className="rounded-[1.2rem] border border-white/10 bg-white/[0.04] p-4">
              <p className="text-[0.66rem] font-black uppercase tracking-[0.16em] text-[var(--sm-muted)]">Prepared checks</p>
              <p className="mt-2 text-sm leading-6 text-white/82">{compactList(selectedOffer.agentJobs)}</p>
            </div>
          </div>
          <div className="mt-6 rounded-[1.2rem] border border-white/10 bg-white/[0.04] p-4">
            <p className="text-[0.66rem] font-black uppercase tracking-[0.16em] text-[var(--sm-muted)]">Objection response</p>
            <p className="mt-2 text-sm leading-6 text-white/82">{selectedOffer.objectionResponse}</p>
          </div>
        </article>
      </section>

      <section className="sm-calm-surface p-5 md:p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-[0.7rem] font-black uppercase tracking-[0.22em] text-[var(--sm-accent)]">Fast sprint products</p>
            <h2 className="mt-2 text-3xl font-black text-[var(--sm-ink)]">Use these when a buyer wants something concrete this week.</h2>
          </div>
          <div className="max-w-xl rounded-[1.1rem] bg-slate-100 p-3 text-sm leading-6 text-[var(--sm-muted)]">
            {PRODUCTIZED_OFFER_SEQUENCE.join(' ')}
          </div>
        </div>
        <div className="mt-5 grid gap-4 xl:grid-cols-3">
          {PRODUCTIZED_OFFERS.map((offer) => (
            <article className="rounded-[1.2rem] border border-slate-200 bg-white/78 p-4" key={offer.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <h3 className="max-w-sm text-xl font-black leading-tight text-[var(--sm-ink)]">{offer.name}</h3>
                <Link className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-slate-600" to={offer.proofRoute}>
                  Proof route
                </Link>
              </div>
              <p className="mt-3 text-sm font-black text-[var(--sm-accent)]">{offer.buyer}</p>
              <p className="mt-3 text-sm leading-6 text-[var(--sm-muted)]">{offer.firstValue}</p>
              <p className="mt-3 rounded-[1rem] bg-slate-50 p-3 text-sm font-bold leading-6 text-[var(--sm-ink)]">{offer.closeScript}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {offer.modules.slice(0, 4).map((module) => (
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600" key={module}>
                    {module}
                  </span>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="sm-calm-surface p-5 md:p-6">
        <p className="text-[0.7rem] font-black uppercase tracking-[0.22em] text-[var(--sm-accent)]">Pricing ladder</p>
        <h2 className="mt-2 text-3xl font-black text-[var(--sm-ink)]">Quote from a tier, then tighten after discovery.</h2>
        <div className="mt-5 grid gap-4 xl:grid-cols-5">
          {COMMERCIAL_PRICING_TIERS.map((tier) => (
            <article className="rounded-[1.2rem] border border-slate-200 bg-white/78 p-4" key={tier.id}>
              <h3 className="text-lg font-black leading-tight text-[var(--sm-ink)]">{tier.name}</h3>
              <p className="mt-2 text-xl font-black text-[var(--sm-accent)]">{tier.price}</p>
              <p className="mt-3 text-sm leading-6 text-[var(--sm-muted)]">{tier.buyerFit}</p>
              <ul className="mt-4 grid gap-2">
                {tier.includes.map((item) => (
                  <li className="text-xs font-bold leading-5 text-slate-600" key={item}>{item}</li>
                ))}
              </ul>
              <p className="mt-4 text-xs leading-5 text-slate-500">{tier.upgradeWhen}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <article className="sm-calm-surface p-5 md:p-6">
          <p className="text-[0.7rem] font-black uppercase tracking-[0.22em] text-[var(--sm-accent)]">Personas</p>
          <h2 className="mt-2 text-3xl font-black text-[var(--sm-ink)]">Sell to the real psychological job.</h2>
          <div className="mt-5 grid gap-3">
            {COMMERCIAL_PERSONAS.map((persona) => (
              <article className="rounded-[1.2rem] border border-slate-200 bg-white/78 p-4" key={persona.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-xl font-black text-[var(--sm-ink)]">{persona.name}</h3>
                    <p className="mt-1 text-xs font-bold uppercase tracking-[0.14em] text-[var(--sm-muted)]">{persona.buyerTitle}</p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-black text-slate-600">{persona.firstOffer}</span>
                </div>
                <p className="mt-3 text-sm leading-6 text-[var(--sm-muted)]">{persona.urgentMoment}</p>
                <p className="mt-3 text-sm font-black text-[var(--sm-ink)]">{persona.emotionalFrame}</p>
                <p className="mt-2 text-sm leading-6 text-slate-500">{persona.proofNeeded}</p>
              </article>
            ))}
          </div>
        </article>

        <article className="sm-calm-surface p-5 md:p-6">
          <p className="text-[0.7rem] font-black uppercase tracking-[0.22em] text-[var(--sm-accent)]">Checklists</p>
          <h2 className="mt-2 text-3xl font-black text-[var(--sm-ink)]">Use the same gates every time.</h2>
          <div className="mt-5 grid gap-3">
            {COMMERCIAL_CHECKLISTS.map((checklist) => (
              <details className="rounded-[1.2rem] border border-slate-200 bg-white/78 p-4" key={checklist.id} open={checklist.id === 'qualification'}>
                <summary className="cursor-pointer text-lg font-black text-[var(--sm-ink)]">
                  {checklist.name}
                  <span className="ml-2 text-xs font-bold uppercase tracking-[0.14em] text-[var(--sm-muted)]">{checklist.owner}</span>
                </summary>
                <ul className="mt-4 grid gap-2">
                  {checklist.items.map((item) => (
                    <li className="grid grid-cols-[auto_1fr] gap-2 text-sm leading-6 text-[var(--sm-muted)]" key={item}>
                      <span className="mt-2 h-2 w-2 rounded-full bg-[var(--sm-accent)]" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </details>
            ))}
          </div>
        </article>
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <article className="sm-terminal p-5 md:p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Sales support desk</p>
          <h2 className="mt-2 text-3xl font-black text-white">Delegated review lanes with clear gates.</h2>
          <div className="mt-5 grid gap-3">
            {COMMERCIAL_AGENT_TEAM.map((seat) => (
              <article className="rounded-[1.2rem] border border-white/10 bg-white/[0.04] p-4" key={seat.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <h3 className="text-xl font-black text-white">{seat.name}</h3>
                  <span className="rounded-full border border-white/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-[var(--sm-muted)]">{seat.reviewGate}</span>
                </div>
                <p className="mt-3 text-sm leading-6 text-[var(--sm-muted)]">{seat.mission}</p>
                <p className="mt-3 text-sm font-bold text-white">{seat.output}</p>
                <p className="mt-2 text-xs leading-5 text-white/58">{compactList(seat.tools)}</p>
              </article>
            ))}
          </div>
        </article>

        <article className="sm-calm-surface p-5 md:p-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-[0.7rem] font-black uppercase tracking-[0.22em] text-[var(--sm-accent)]">Templates</p>
              <h2 className="mt-2 text-3xl font-black text-[var(--sm-ink)]">Basic copy that matches the selected offer.</h2>
            </div>
            <Link className="sm-button-secondary" to="/app/revenue/growth">
              Social cadence
            </Link>
          </div>
          <div className="mt-5 grid gap-4">
            {COMMERCIAL_TEMPLATES.map((template) => {
              const body = templateText(template, selectedOffer)
              return (
                <article className="rounded-[1.2rem] border border-slate-200 bg-white/78 p-4" key={template.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-black text-[var(--sm-ink)]">{template.name}</h3>
                      <p className="mt-1 text-xs font-bold uppercase tracking-[0.14em] text-[var(--sm-muted)]">{template.channel}</p>
                    </div>
                    <button className="sm-button-secondary" onClick={() => void copyTemplate(template)} type="button">
                      {copiedTemplateId === template.id ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  {template.subject ? <p className="mt-3 text-sm font-black text-[var(--sm-ink)]">Subject: {template.subject}</p> : null}
                  <textarea
                    className="mt-3 min-h-28 w-full resize-y rounded-[1rem] border border-slate-200 bg-white p-3 text-sm leading-6 text-slate-700 outline-none focus:border-[var(--sm-accent)]"
                    readOnly
                    value={body}
                  />
                </article>
              )
            })}
          </div>
        </article>
      </section>

      <section className="sm-calm-surface p-5 md:p-6">
        <p className="text-[0.7rem] font-black uppercase tracking-[0.22em] text-[var(--sm-accent)]">Social and distribution cadence</p>
        <h2 className="mt-2 text-3xl font-black text-[var(--sm-ink)]">Prepare posts continuously; publish after account approval.</h2>
        <div className="mt-5 grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
          <div className="grid gap-4 md:grid-cols-2">
            {COMMERCIAL_SOCIAL_CADENCE.map((row) => (
              <article className="rounded-[1.2rem] border border-slate-200 bg-white/78 p-4" key={row.channel}>
                <h3 className="text-lg font-black text-[var(--sm-ink)]">{row.channel}</h3>
                <p className="mt-2 text-sm font-black text-[var(--sm-accent)]">{row.cadence}</p>
                <p className="mt-3 text-sm leading-6 text-[var(--sm-muted)]">{row.job}</p>
              </article>
            ))}
          </div>
          <article className="rounded-[1.2rem] border border-slate-200 bg-white/78 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-xl font-black text-[var(--sm-ink)]">Draft queue for LinkedIn and Facebook</h3>
                <p className="mt-1 text-sm leading-6 text-[var(--sm-muted)]">
                  {socialQueue
                    ? `${socialQueue.metrics.post_count} posts and ${socialQueue.metrics.outreach_draft_count} outreach drafts generated for ${socialQueue.generated_for}.`
                    : 'Run npm run marketing:queue to refresh the visible draft queue.'}
                </p>
              </div>
              <a className="sm-button-secondary" href="/site/social-post-queue.json" rel="noreferrer" target="_blank">
                Open queue
              </a>
            </div>
            <div className="mt-4 grid gap-3">
              {(socialQueue?.posts ?? []).slice(0, 3).map((post) => (
                <article className="rounded-[1rem] border border-slate-200 bg-white p-3" key={post.id}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--sm-accent)]">{post.channel} | {post.offer}</p>
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black text-slate-600">{post.status}</span>
                  </div>
                  <p className="mt-2 max-h-28 overflow-hidden whitespace-pre-line text-sm leading-6 text-[var(--sm-muted)]">{post.post_text}</p>
                  <p className="mt-2 text-xs font-bold text-slate-500">{post.review_gate}</p>
                </article>
              ))}
            </div>
          </article>
        </div>

        <div className="mt-5 grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
          <article className="rounded-[1.2rem] border border-slate-200 bg-white/78 p-4">
            <p className="text-[0.68rem] font-black uppercase tracking-[0.18em] text-[var(--sm-muted)]">Can draft now</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {COMMERCIAL_SOCIAL_APPROVAL_POLICY.canDraft.map((item) => (
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600" key={item}>{item}</span>
              ))}
            </div>
            <p className="mt-4 text-[0.68rem] font-black uppercase tracking-[0.18em] text-[var(--sm-muted)]">Cannot automate yet</p>
            <div className="mt-3 grid gap-2">
              {COMMERCIAL_SOCIAL_APPROVAL_POLICY.cannotDoYet.map((item) => (
                <p className="text-sm leading-6 text-[var(--sm-muted)]" key={item}>{item}</p>
              ))}
            </div>
          </article>
          <article className="rounded-[1.2rem] border border-slate-200 bg-white/78 p-4">
            <p className="text-[0.68rem] font-black uppercase tracking-[0.18em] text-[var(--sm-muted)]">Publish checklist</p>
            <div className="mt-3 grid gap-2">
              {COMMERCIAL_SOCIAL_APPROVAL_POLICY.publishChecklist.map((item) => (
                <p className="grid grid-cols-[auto_1fr] gap-2 text-sm leading-6 text-[var(--sm-muted)]" key={item}>
                  <span className="mt-2 h-2 w-2 rounded-full bg-[var(--sm-accent)]" />
                  <span>{item}</span>
                </p>
              ))}
            </div>
          </article>
        </div>
      </section>
    </div>
  )
}
