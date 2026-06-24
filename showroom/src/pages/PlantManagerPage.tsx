import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import { getSeedDataFabricDataset, loadDataFabricDataset, type DataFabricDataset } from '../lib/dataFabricApi'
import { buildYangonTyreAnalyticsMart, getYangonTyreAnalyticsMartView } from '../lib/yangonTyreAnalyticsMart'
import { loadManagerHomeDataset, type ManagerHomeDataset } from '../lib/managerHomeApi'
import {
  YANGON_TYRE_DQMS_SUMMARY_SEED,
  YANGON_TYRE_OPERATIONS_SUMMARY_SEED,
  YANGON_TYRE_OPERATIONS_ACTIONS_SEED,
  YANGON_TYRE_PLANT_CONTROL_UPDATED_AT,
  YANGON_TYRE_PLANT_MANAGER_REVIEW_RHYTHMS,
  YANGON_TYRE_PLANT_MANAGER_SHIFT_BOARDS,
  YANGON_TYRE_QUALITY_INCIDENTS_SEED,
} from '../lib/yangonTyrePlantControl'
import { getTenantConfig } from '../lib/tenantConfig'
import { resolveTenantRoleExperience } from '../lib/tenantRoleExperience'
import { YTF_PORTAL_RUNTIME, YTF_SHIFT_START_PROTOCOL } from '../lib/ytfPortalRuntime'

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return 'Not yet'
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }

  return parsed.toLocaleString()
}

function buildSeedPlantManagerDataset(tenantKey: string): ManagerHomeDataset {
  const experience = resolveTenantRoleExperience(tenantKey as never, 'plant manager')

  return {
    source: 'seed',
    updatedAt: YANGON_TYRE_PLANT_CONTROL_UPDATED_AT,
    experience,
    headline: 'Plant manager command should stay usable even before the full live runtime is connected.',
    metrics: [
      {
        label: 'Open follow-up',
        value: String(YANGON_TYRE_OPERATIONS_SUMMARY_SEED.actions.total_items),
        detail: 'Seeded plant follow-up queue from the combined operations and DQMS surface.',
      },
      {
        label: 'Receiving holds',
        value: String(YANGON_TYRE_OPERATIONS_SUMMARY_SEED.receiving.hold_count),
        detail: 'Current seeded inbound holds that can affect release and line stability.',
      },
      {
        label: 'Open incidents',
        value: String(YANGON_TYRE_DQMS_SUMMARY_SEED.quality.by_status.open),
        detail: 'Seeded DQMS incident load requiring containment or closeout.',
      },
      {
        label: 'Review loops',
        value: String(YANGON_TYRE_PLANT_MANAGER_REVIEW_RHYTHMS.length),
        detail: 'Explicit plant-manager review cadences already modeled in the interface.',
      },
    ],
    actions: YANGON_TYRE_OPERATIONS_ACTIONS_SEED.slice(0, 4).map((item) => ({
      id: item.id,
      title: item.title,
      detail: item.action,
      route: '/app/operations',
      emphasis: item.priority.toLowerCase() === 'high' ? 'attention' : 'secondary',
    })),
    signals: [
      {
        id: 'seed-quality-signal',
        label: 'Containment still active',
        detail: 'Seeded DQMS issues show that release and containment still need one linked review loop.',
        route: '/app/dqms',
        tone: 'attention',
      },
      {
        id: 'seed-receiving-signal',
        label: 'Inbound variance remains visible',
        detail: 'Receiving holds are part of the same plant-control rhythm, not a separate admin issue.',
        route: '/app/receiving',
        tone: 'watch',
      },
    ],
    routines: YANGON_TYRE_PLANT_MANAGER_REVIEW_RHYTHMS.map((item) => ({
      id: item.id,
      name: item.name,
      cadence: item.cadence,
      purpose: item.purpose,
      script: 'Open the lane, review what changed, assign the next owner, and close the loop before the next review.',
      doneWhen: 'Every abnormal item has an owner, next step, and next review time.',
      route: item.route,
    })),
    methods: [
      {
        id: 'seed-bottleneck',
        name: 'Bottleneck focus',
        question: 'Which process step is limiting plant flow right now?',
        measure: 'Queue pressure, downtime, and quality containment in the same review.',
        route: '/app/operations',
      },
      {
        id: 'seed-first-pass-yield',
        name: 'First-pass yield',
        question: 'Where is the process losing good units before release?',
        measure: 'B+R baseline, repeat defects, and open containment.',
        route: '/app/dqms',
      },
    ],
    modules: [
      { id: 'ops', title: 'Operations control', route: '/app/operations', detail: 'Shift flow, receiving, and escalation control.', status: 'Seeded', reason: 'Usable now while live data expands.' },
      { id: 'dqms', title: 'DQMS and quality', route: '/app/dqms', detail: 'Incidents, CAPA, containment, and KPI review.', status: 'Seeded', reason: 'Usable now while live writeback expands.' },
      { id: 'maint', title: 'Maintenance', route: '/app/maintenance', detail: 'Reliability follow-up and asset review.', status: 'Available', reason: 'Supports the same plant control loop.' },
      { id: 'fabric', title: 'Data Fabric', route: '/app/data-fabric', detail: 'Plant analytics, source behavior, and feature engineering.', status: 'Available', reason: 'Feeds the macro plant review.' },
    ],
    supportTools: [
      { id: 'ops', label: 'Operations', route: '/app/operations', detail: 'Run today queue and plant flow.' },
      { id: 'dqms', label: 'DQMS', route: '/app/dqms', detail: 'Run incidents and CAPA.' },
      { id: 'fabric', label: 'Data Fabric', route: '/app/data-fabric', detail: 'Read micro and macro plant signals.' },
    ],
    trainingSequence: [
      'Start every shift from the plant manager interface.',
      'Open the right desk and record the abnormality there, not in side chat.',
      'Use DQMS and operations together when the same issue affects flow and quality.',
    ],
    managerRules: [
      'No carryover without owner and due time.',
      'Containment before explanation.',
      'Repeated pain must become a feature, method, or workflow change.',
    ],
  }
}

export function PlantManagerPage() {
  const tenant = getTenantConfig()
  const [loading, setLoading] = useState(true)
  const [statusNote, setStatusNote] = useState('Loading plant manager command surface...')
  const [source, setSource] = useState<'live' | 'seed'>('seed')
  const [managerDataset, setManagerDataset] = useState<ManagerHomeDataset>(() => buildSeedPlantManagerDataset(tenant.key))
  const [fabricDataset, setFabricDataset] = useState<DataFabricDataset>(() => getSeedDataFabricDataset())

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const [managerPayload, fabricPayload] = await Promise.all([
          loadManagerHomeDataset(tenant.key, 'plant manager'),
          loadDataFabricDataset(),
        ])

        if (cancelled) {
          return
        }

        const nextSource = managerPayload.source === 'live' || fabricPayload.source === 'live' ? 'live' : 'seed'
        setManagerDataset(managerPayload)
        setFabricDataset(fabricPayload)
        setSource(nextSource)
        setStatusNote(
          nextSource === 'live'
            ? 'Live manager-home and data-fabric signals are connected.'
            : 'Using the seeded plant manager command surface while the live workspace is still partial.',
        )
      } catch {
        if (cancelled) {
          return
        }

        setSource('seed')
        setManagerDataset(buildSeedPlantManagerDataset(tenant.key))
        setStatusNote('Plant manager command is running in seeded mode. The interface is usable now while live connectors and writeback continue to come online.')
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
  }, [tenant.key])

  const analyticsMart = useMemo(() => buildYangonTyreAnalyticsMart(fabricDataset), [fabricDataset])
  const operationsView = useMemo(() => getYangonTyreAnalyticsMartView(analyticsMart, 'operations'), [analyticsMart])
  const qualityView = useMemo(() => getYangonTyreAnalyticsMartView(analyticsMart, 'quality'), [analyticsMart])
  const actionRows = useMemo(
    () => [...(managerDataset?.actions ?? []), ...YANGON_TYRE_OPERATIONS_ACTIONS_SEED.map((item) => ({
      id: item.id,
      title: item.title,
      detail: item.action,
      route: '/app/operations',
      emphasis: item.priority.toLowerCase() === 'high' ? 'attention' as const : 'secondary' as const,
    }))].slice(0, 6),
    [managerDataset],
  )

  if (loading && source === 'live') {
    return <section className="sm-surface p-6 text-sm text-[var(--sm-muted)]">Opening plant manager command...</section>
  }

  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="Plant manager"
        title="Run shift control, quality drift, and handoff from one command surface."
        description="This is the combined plant manager interface for Yangon Tyre: operations, DQMS, maintenance, receiving, and data-fabric review on one working page."
      />

      <section className="sm-surface-deep relative overflow-hidden p-6 lg:p-8">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(132,194,176,0.16),_transparent_36%),radial-gradient(circle_at_bottom_left,_rgba(207,166,122,0.12),_transparent_44%)]" />
        <div className="relative grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
          <div>
            <div className="sm-status-bar">
              <span className="sm-status-pill">{YTF_PORTAL_RUNTIME.domain}</span>
              <span className="sm-status-pill">{source === 'live' ? 'Live workspace' : 'Seeded control'}</span>
              <span className="sm-status-pill">{YTF_PORTAL_RUNTIME.provider}</span>
            </div>
            <h2 className="mt-5 max-w-4xl text-4xl font-bold text-white">Open this surface first when the plant needs one command language.</h2>
            <p className="mt-4 max-w-3xl text-sm leading-relaxed text-[var(--sm-muted)]">
              Use Plant Manager for the first five minutes of a shift, abnormal review, or leadership escalation. Then move into the specific working desk only after the owner and evidence are clear.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link className="sm-button-primary" to="/app/operations">
                Open operations
              </Link>
              <Link className="sm-button-secondary" to="/app/dqms">
                Open DQMS
              </Link>
              <Link className="sm-button-secondary" to="/app/portal">
                Open tenant portal
              </Link>
            </div>
          </div>

          <article className="sm-manager-method">
            <p className="sm-kicker text-[var(--sm-accent-alt)]">First five minutes</p>
            <h3 className="mt-2 text-2xl font-bold text-white">Run the shift in this order</h3>
            <div className="mt-5 grid gap-3">
              {YTF_SHIFT_START_PROTOCOL.map((item, index) => (
                <div className="sm-manager-rule" key={item.id}>
                  <span className="sm-manager-rule-index">{index + 1}</span>
                  <div>
                    <p className="font-semibold text-white">{item.title}</p>
                    <p className="mt-2 text-sm leading-relaxed text-[var(--sm-muted)]">{item.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </article>
        </div>
      </section>

      <section className="sm-surface-deep p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent-alt)]">Command status</p>
            <h2 className="mt-3 text-3xl font-bold text-white">This surface is available now.</h2>
            <p className="mt-4 max-w-4xl text-sm leading-relaxed text-[var(--sm-muted)]">
              {statusNote} Updated {formatDateTime(managerDataset.updatedAt ?? fabricDataset.updatedAt ?? YANGON_TYRE_PLANT_CONTROL_UPDATED_AT)}.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <span className="sm-status-pill">{source === 'live' ? 'live + seed' : 'seed + manager rules'}</span>
            <Link className="sm-button-primary" to="/app/operations">
              Open operations
            </Link>
            <Link className="sm-button-secondary" to="/app/dqms">
              Open DQMS
            </Link>
            <Link className="sm-button-secondary" to="/app/maintenance">
              Open maintenance
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <article className="sm-manager-stat">
          <p className="sm-kicker text-[var(--sm-accent)]">Micro means</p>
          <p className="mt-3 text-2xl font-bold text-white">One batch, one defect, one machine</p>
          <p className="mt-2 text-sm text-[var(--sm-muted)]">Use DQMS, receiving, and maintenance lanes for the immediate abnormality and the next containment move.</p>
        </article>
        <article className="sm-manager-stat">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Macro means</p>
          <p className="mt-3 text-2xl font-bold text-white">Throughput, drift, and repeat loss</p>
          <p className="mt-2 text-sm text-[var(--sm-muted)]">Use the KPI layer and data fabric when the issue repeats across shifts, SKUs, or sections of the plant.</p>
        </article>
        <article className="sm-manager-stat">
          <p className="sm-kicker text-[var(--sm-accent)]">Live host</p>
          <p className="mt-3 text-2xl font-bold text-white">{YTF_PORTAL_RUNTIME.domain}</p>
          <p className="mt-2 text-sm text-[var(--sm-muted)]">Keep the plant operating record inside the live tenant host so review, escalation, and analytics stay connected.</p>
        </article>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {managerDataset.metrics.map((metric) => (
          <article className="sm-metric-card" key={metric.label}>
            <p className="sm-kicker text-[var(--sm-accent)]">{metric.label}</p>
            <p className="mt-3 text-3xl font-bold text-white">{metric.value}</p>
            <p className="mt-2 text-sm text-[var(--sm-muted)]">{metric.detail}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.04fr_0.96fr]">
        <article className="sm-surface p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">What to do now</p>
              <h2 className="mt-2 text-3xl font-bold text-white">Plant-manager priority queue</h2>
            </div>
            <Link className="sm-link" to="/app/actions">
              Open queue
            </Link>
          </div>
          <div className="mt-6 grid gap-4">
            {actionRows.map((item) => (
              <Link className="sm-proof-card" key={item.id} to={item.route}>
                <p className="font-semibold text-white">{item.title}</p>
                <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{item.detail}</p>
              </Link>
            ))}
          </div>
        </article>

        <article className="sm-surface-deep p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Shift command boards</p>
              <h2 className="mt-2 text-3xl font-bold text-white">Use one language for the plant, not separate screens.</h2>
            </div>
            <Link className="sm-link" to="/app/data-fabric">
              Open data fabric
            </Link>
          </div>
          <div className="mt-6 grid gap-4">
            {YANGON_TYRE_PLANT_MANAGER_SHIFT_BOARDS.map((item) => (
              <article className="sm-proof-card" key={item.id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="sm-kicker text-[var(--sm-accent)]">{item.label}</p>
                    <p className="mt-2 text-xl font-bold text-white">{item.title}</p>
                  </div>
                  <Link className="sm-link" to={item.route}>
                    Open lane
                  </Link>
                </div>
                <p className="mt-4 text-sm leading-relaxed text-[var(--sm-muted)]">{item.detail}</p>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <article className="sm-surface p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Micro review</p>
              <h2 className="mt-2 text-3xl font-bold text-white">Quality containment and process loss</h2>
            </div>
            <Link className="sm-link" to="/app/dqms">
              Open DQMS
            </Link>
          </div>
          <div className="mt-6 grid gap-4">
            {YANGON_TYRE_QUALITY_INCIDENTS_SEED.map((item) => (
              <article className="sm-proof-card" key={item.incident_id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-white">{item.title}</p>
                    <p className="mt-2 text-sm text-[var(--sm-muted)]">{item.summary}</p>
                  </div>
                  <span className="sm-status-pill">{item.severity}</span>
                </div>
                <p className="mt-4 text-sm text-white/80">{item.owner} · due {item.target_close_date || 'review now'}</p>
              </article>
            ))}
          </div>
        </article>

        <article className="sm-surface-deep p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Macro review</p>
              <h2 className="mt-2 text-3xl font-bold text-white">Operations and quality KPIs in one management frame</h2>
            </div>
            <Link className="sm-link" to="/app/insights">
              Open insights
            </Link>
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {[...operationsView.kpis.slice(0, 2), ...qualityView.kpis.slice(0, 2)].map((metric) => (
              <article className="sm-proof-card" key={metric.id}>
                <p className="sm-kicker text-[var(--sm-accent)]">{metric.label}</p>
                <p className="mt-3 text-3xl font-bold text-white">{metric.value}</p>
                <p className="mt-2 text-sm text-white/80">{metric.trend}</p>
                <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{metric.detail}</p>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.02fr_0.98fr]">
        <article className="sm-surface p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Review cadence</p>
              <h2 className="mt-2 text-3xl font-bold text-white">Run the plant with explicit rhythms.</h2>
            </div>
            <Link className="sm-link" to="/app/adoption-command">
              Open adoption
            </Link>
          </div>
          <div className="mt-6 grid gap-4">
            {YANGON_TYRE_PLANT_MANAGER_REVIEW_RHYTHMS.map((item) => (
              <article className="sm-proof-card" key={item.id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-white">{item.name}</p>
                    <p className="mt-2 text-sm text-[var(--sm-muted)]">{item.cadence}</p>
                  </div>
                  <Link className="sm-link" to={item.route}>
                    Open lane
                  </Link>
                </div>
                <p className="mt-4 text-sm leading-relaxed text-white/80">{item.purpose}</p>
              </article>
            ))}
          </div>
        </article>

        <article className="sm-surface-deep p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Launch desks</p>
              <h2 className="mt-2 text-3xl font-bold text-white">Move fast between the core plant lanes.</h2>
            </div>
            <Link className="sm-link" to="/app/portal">
              Open manager home
            </Link>
          </div>
          <div className="mt-6 grid gap-3">
            {[
              { label: 'Operations control', route: '/app/operations', detail: 'Shift flow, receiving pressure, approvals, and exceptions.' },
              { label: 'DQMS and quality', route: '/app/dqms', detail: 'Incidents, CAPA, containment, and quality KPI review.' },
              { label: 'Maintenance', route: '/app/maintenance', detail: 'Reliability follow-up and breakdown patterns.' },
              { label: 'Receiving', route: '/app/receiving', detail: 'Inbound discrepancy and release control.' },
              { label: 'Data Fabric', route: '/app/data-fabric', detail: 'Warehouse, features, source behavior, and plant-level analytics.' },
              { label: 'Insights', route: '/app/insights', detail: 'Story layer for managers and leadership.' },
            ].map((item) => (
              <Link className="sm-manager-row" key={item.route} to={item.route}>
                <div>
                  <p className="font-semibold text-white">{item.label}</p>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--sm-muted)]">{item.detail}</p>
                </div>
                <span className="sm-link">Open</span>
              </Link>
            ))}
          </div>
        </article>
      </section>
    </div>
  )
}
