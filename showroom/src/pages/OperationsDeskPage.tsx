import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import {
  YANGON_TYRE_APPROVAL_ROWS_SEED,
  YANGON_TYRE_INVENTORY_ROWS_SEED,
  YANGON_TYRE_OPERATIONS_ACTIONS_SEED,
  YANGON_TYRE_OPERATIONS_EXCEPTIONS_SEED,
  YANGON_TYRE_OPERATIONS_SUMMARY_SEED,
  YANGON_TYRE_PLANT_CONTROL_UPDATED_AT,
  YANGON_TYRE_PLANT_MANAGER_REVIEW_RHYTHMS,
  YANGON_TYRE_PLANT_MANAGER_SHIFT_BOARDS,
  YANGON_TYRE_RECEIVING_ROWS_SEED,
} from '../lib/yangonTyrePlantControl'
import { getTenantConfig } from '../lib/tenantConfig'
import { YANGON_TYRE_DATA_PROFILE } from '../lib/yangonTyreDataProfile'
import { checkWorkspaceHealth, getCapabilityProfileForRole, getWorkspaceSession, sessionHasCapability, workspaceFetch } from '../lib/workspaceApi'

type SummaryPayload = {
  actions?: { total_items?: number }
  approvals?: { approval_count?: number; by_status?: Record<string, number> }
  receiving?: { hold_count?: number; variance_count?: number; receiving_count?: number }
  inventory?: { reorder_count?: number; watch_count?: number }
}

type ActionRow = {
  id: string
  lane: string
  title: string
  action: string
  owner: string
  priority: string
  due: string
  status: string
}

type ExceptionRow = {
  exception_id: string
  source_type: string
  priority: string
  title: string
  summary: string
  owner: string
  route: string
}

type ReceivingRow = {
  receiving_id: string
  supplier: string
  material: string
  grn_or_batch: string
  variance_note: string
  status: string
  owner: string
  next_action: string
}

type ApprovalRow = {
  approval_id: string
  title: string
  approval_gate: string
  owner: string
  status: string
  due: string
  related_route: string
}

type InventoryRow = {
  inventory_id: string
  item_name: string
  warehouse: string
  available_qty: string
  reorder_point: string
  status: string
  next_action: string
}

export function OperationsDeskPage() {
  const tenant = getTenantConfig()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusNote, setStatusNote] = useState<string>('Using seeded plant-control surface while the live workspace connects.')
  const [source, setSource] = useState<'live' | 'seed'>('seed')
  const [summary, setSummary] = useState<SummaryPayload | null>(YANGON_TYRE_OPERATIONS_SUMMARY_SEED)
  const [actions, setActions] = useState<ActionRow[]>(YANGON_TYRE_OPERATIONS_ACTIONS_SEED)
  const [exceptions, setExceptions] = useState<ExceptionRow[]>(YANGON_TYRE_OPERATIONS_EXCEPTIONS_SEED)
  const [receivingRows, setReceivingRows] = useState<ReceivingRow[]>(YANGON_TYRE_RECEIVING_ROWS_SEED)
  const [approvalRows, setApprovalRows] = useState<ApprovalRow[]>(YANGON_TYRE_APPROVAL_ROWS_SEED)
  const [inventoryRows, setInventoryRows] = useState<InventoryRow[]>(YANGON_TYRE_INVENTORY_ROWS_SEED)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setError(null)
      const health = await checkWorkspaceHealth()
      if (cancelled) return
      if (!health.ready) {
        setSource('seed')
        setStatusNote('Workspace API is not connected on this host yet. Showing the seeded plant-control surface.')
        setLoading(false)
        return
      }

      try {
        const session = await getWorkspaceSession()
        if (cancelled) return
        if (!session.authenticated) {
          setSource('seed')
          setStatusNote('Workspace login is not active here. Showing the seeded plant-control surface.')
          setLoading(false)
          return
        }
        if (!sessionHasCapability(session.session, 'operations.view') && !sessionHasCapability(session.session, 'receiving.view')) {
          setSource('seed')
          setStatusNote(`Live operations access is not available for the current role (${getCapabilityProfileForRole(session.session?.role).label}). Showing the seeded plant-control surface.`)
          setLoading(false)
          return
        }
      } catch {
        if (!cancelled) {
          setSource('seed')
          setStatusNote('Workspace login could not be verified on this host yet. Showing the seeded plant-control surface.')
          setLoading(false)
        }
        return
      }

      try {
        const [summaryPayload, actionPayload, exceptionPayload, receivingPayload, approvalPayload, inventoryPayload] = await Promise.all([
          workspaceFetch<SummaryPayload>('/api/summary'),
          workspaceFetch<{ items?: ActionRow[] }>('/api/actions?limit=18'),
          workspaceFetch<{ rows?: ExceptionRow[] }>('/api/exceptions?limit=8'),
          workspaceFetch<{ rows?: ReceivingRow[] }>('/api/receiving/records?limit=8'),
          workspaceFetch<{ rows?: ApprovalRow[] }>('/api/approvals?limit=8'),
          workspaceFetch<{ rows?: InventoryRow[] }>('/api/inventory/records?status=reorder&limit=6'),
        ])
        if (cancelled) return
        setSource('live')
        setStatusNote('Live operations and receiving signals are connected.')
        setSummary(summaryPayload)
        setActions(actionPayload.items ?? [])
        setExceptions(exceptionPayload.rows ?? [])
        setReceivingRows(receivingPayload.rows ?? [])
        setApprovalRows(approvalPayload.rows ?? [])
        setInventoryRows(inventoryPayload.rows ?? [])
      } catch {
        if (!cancelled) {
          setSource('seed')
          setStatusNote('Live operations data could not be loaded right now. Showing the seeded plant-control surface.')
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

  const urgentActions = useMemo(
    () =>
      actions.filter((row) => {
        const priority = String(row.priority || '').toLowerCase()
        const lane = String(row.lane || '').toLowerCase()
        return priority === 'high' || lane.includes('do_now') || lane.includes('receiv') || lane.includes('ops')
      }),
    [actions],
  )

  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="Operations desk"
        title="Run plant flow, receiving, and escalation from one desk."
        description="This is the Yangon Tyre operations home: today queue, inbound issues, approvals, exceptions, and stock pressure in one working surface."
      />

      <section className="sm-chip text-white">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="font-semibold">{source === 'live' ? 'Live operations surface connected.' : 'Seeded plant-control surface active.'}</p>
            <p className="mt-2 text-sm text-[var(--sm-muted)]">
              {statusNote} Updated signal: {source === 'live' ? 'Live workspace snapshot' : new Date(YANGON_TYRE_PLANT_CONTROL_UPDATED_AT).toLocaleString()}.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link className="sm-button-primary" to="/app/plant-manager">
              Plant manager
            </Link>
            <Link className="sm-button-secondary" to="/app/dqms">
              Open DQMS
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        <div className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent)]">Open actions</p>
          <p className="mt-3 text-3xl font-bold text-white">{summary?.actions?.total_items ?? 0}</p>
        </div>
        <div className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Receiving holds</p>
          <p className="mt-3 text-3xl font-bold text-white">{summary?.receiving?.hold_count ?? 0}</p>
        </div>
        <div className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent)]">Pending approvals</p>
          <p className="mt-3 text-3xl font-bold text-white">{summary?.approvals?.by_status?.pending ?? 0}</p>
        </div>
        <div className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Reorder watch</p>
          <p className="mt-3 text-3xl font-bold text-white">{summary?.inventory?.reorder_count ?? 0}</p>
        </div>
      </section>

      {tenant.key === 'ytf-plant-a' ? (
        <section className="grid gap-4 md:grid-cols-4">
          <div className="sm-chip text-white">
            <p className="sm-kicker text-[var(--sm-accent)]">Line model</p>
            <p className="mt-2 text-lg font-bold">PD-1 to PD-4</p>
            <p className="mt-2 text-sm text-[var(--sm-muted)]">{YANGON_TYRE_DATA_PROFILE.productionLines.join(' / ')}</p>
          </div>
          <div className="sm-chip text-white">
            <p className="sm-kicker text-[var(--sm-accent-alt)]">Quality target</p>
            <p className="mt-2 text-lg font-bold">B+R below 3.0%</p>
            <p className="mt-2 text-sm text-[var(--sm-muted)]">Best 2024 month: {YANGON_TYRE_DATA_PROFILE.bestMonth2024.month} at {YANGON_TYRE_DATA_PROFILE.bestMonth2024.bPlusRRate}%.</p>
          </div>
          <div className="sm-chip text-white">
            <p className="sm-kicker text-[var(--sm-accent)]">Focus SKU</p>
            <p className="mt-2 text-lg font-bold">{YANGON_TYRE_DATA_PROFILE.focusProducts2025[0].name}</p>
            <p className="mt-2 text-sm text-[var(--sm-muted)]">{YANGON_TYRE_DATA_PROFILE.focusProducts2025[0].units.toLocaleString()} units in early 2025 weekly production.</p>
          </div>
          <div className="sm-chip text-white">
            <p className="sm-kicker text-[var(--sm-accent-alt)]">Annual output</p>
            <p className="mt-2 text-lg font-bold">{YANGON_TYRE_DATA_PROFILE.annualBiasOutput2024.toLocaleString()}</p>
            <p className="mt-2 text-sm text-[var(--sm-muted)]">Bias tyres captured in the 2024 monthly workbook.</p>
          </div>
        </section>
      ) : null}

      {tenant.key === 'ytf-plant-a' ? (
        <section className="grid gap-6 xl:grid-cols-[1.02fr_0.98fr]">
          <article className="sm-surface-deep p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="sm-kicker text-[var(--sm-accent-alt)]">Plant manager command</p>
                <h2 className="mt-2 text-3xl font-bold text-white">Use one shift language across flow, quality, and handoff.</h2>
              </div>
              <Link className="sm-link" to="/app/plant-manager">
                Open full interface
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

          <article className="sm-surface p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="sm-kicker text-[var(--sm-accent)]">Review rhythms</p>
                <h2 className="mt-2 text-3xl font-bold text-white">The plant should run on explicit review loops.</h2>
              </div>
              <Link className="sm-link" to="/app/data-fabric">
                Open data fabric
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
        </section>
      ) : null}

      {tenant.key === 'ytf-plant-a' ? (
        <section className="sm-calm-surface p-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Manager routine</p>
              <h2 className="mt-2 text-2xl font-bold text-white">Start daily review in Plant Manager.</h2>
              <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[var(--sm-muted)]">
                Use Operations Control for live execution detail. Use Plant Manager when you need the review loop, teaching packs, and the next desk to open for plant supervisors.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link className="sm-button-primary" to="/app/plant-manager">
                Open plant manager
              </Link>
              <Link className="sm-button-secondary" to="/app/pilot">
                Log training gap
              </Link>
            </div>
          </div>
        </section>
      ) : null}

      {loading && source === 'live' ? (
        <section className="sm-surface p-6 text-sm text-[var(--sm-muted)]">Loading operations desk...</section>
      ) : error ? (
        <section className="sm-surface p-6">
          <p className="text-sm text-[var(--sm-muted)]">{error}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link className="sm-button-primary" to="/login?next=/app/operations">
              Login
            </Link>
            <Link className="sm-button-secondary" to="/app/receiving">
              Open receiving
            </Link>
          </div>
        </section>
      ) : (
        <>
          <section className="grid gap-6 lg:grid-cols-[1.04fr_0.96fr]">
            <article className="sm-surface p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="sm-kicker text-[var(--sm-accent)]">Today queue</p>
                  <h2 className="mt-2 text-2xl font-bold text-white">What operations must move now</h2>
                </div>
                <Link className="sm-link" to="/app/actions">
                  Open full queue
                </Link>
              </div>
              <div className="mt-5 space-y-3">
                {(urgentActions.length ? urgentActions : actions.slice(0, 8)).map((row) => (
                  <article className="sm-proof-card" key={row.id}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-lg font-bold text-white">{row.title}</p>
                        <p className="mt-2 text-sm text-[var(--sm-muted)]">{row.action}</p>
                      </div>
                      <span className="sm-status-pill">{row.priority}</span>
                    </div>
                    <div className="mt-4 grid gap-3 md:grid-cols-3">
                      <div className="sm-chip text-white">
                        <p className="sm-kicker text-[var(--sm-accent)]">Owner</p>
                        <p className="mt-2">{row.owner}</p>
                      </div>
                      <div className="sm-chip text-white">
                        <p className="sm-kicker text-[var(--sm-accent-alt)]">Lane</p>
                        <p className="mt-2">{row.lane || 'operations'}</p>
                      </div>
                      <div className="sm-chip text-white">
                        <p className="sm-kicker text-[var(--sm-accent)]">Due</p>
                        <p className="mt-2">{row.due || 'Review today'}</p>
                      </div>
                    </div>
                  </article>
                ))}
                {!actions.length ? <div className="sm-chip text-[var(--sm-muted)]">No live operation rows yet.</div> : null}
              </div>
            </article>

            <article className="sm-terminal p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="sm-kicker text-[var(--sm-accent-alt)]">Inbound watch</p>
                  <h2 className="mt-2 text-2xl font-bold text-white">Receiving and stock pressure</h2>
                </div>
                <Link className="sm-link" to="/app/receiving">
                  Log receipt
                </Link>
              </div>
              <div className="mt-5 space-y-3">
                {receivingRows.slice(0, 4).map((row) => (
                  <article className="sm-chip text-white" key={row.receiving_id}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">{row.supplier} · {row.material}</p>
                        <p className="mt-2 text-sm text-[var(--sm-muted)]">{row.grn_or_batch || 'No batch'} · {row.variance_note || row.next_action}</p>
                      </div>
                      <span className="sm-status-pill">{row.status}</span>
                    </div>
                  </article>
                ))}
                {inventoryRows.slice(0, 3).map((row) => (
                  <article className="sm-chip text-white" key={row.inventory_id}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">{row.item_name}</p>
                        <p className="mt-2 text-sm text-[var(--sm-muted)]">
                          {row.warehouse} · available {row.available_qty || '0'} / reorder {row.reorder_point || '0'}
                        </p>
                      </div>
                      <span className="sm-status-pill">{row.status}</span>
                    </div>
                  </article>
                ))}
                {!receivingRows.length && !inventoryRows.length ? <div className="sm-chip text-[var(--sm-muted)]">No inbound or stock watch rows yet.</div> : null}
              </div>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link className="sm-button-primary" to="/app/receiving">
                  Receiving
                </Link>
                <Link className="sm-button-secondary" to="/app/inventory">
                  Inventory
                </Link>
              </div>
            </article>
          </section>

          <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
            <article className="sm-surface p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="sm-kicker text-[var(--sm-accent)]">Escalations</p>
                  <h2 className="mt-2 text-2xl font-bold text-white">Approvals blocking execution</h2>
                </div>
                <Link className="sm-link" to="/app/approvals">
                  Open approvals
                </Link>
              </div>
              <div className="mt-5 space-y-3">
                {approvalRows.map((row) => (
                  <article className="sm-proof-card" key={row.approval_id}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-lg font-bold text-white">{row.title}</p>
                        <p className="mt-2 text-sm text-[var(--sm-muted)]">{row.approval_gate} · owner {row.owner}</p>
                      </div>
                      <span className="sm-status-pill">{row.status}</span>
                    </div>
                    <p className="mt-4 text-sm text-white/80">Due: {row.due || 'Review now'}</p>
                  </article>
                ))}
                {!approvalRows.length ? <div className="sm-chip text-[var(--sm-muted)]">No live approvals returned.</div> : null}
              </div>
            </article>

            <article className="sm-surface p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="sm-kicker text-[var(--sm-accent-alt)]">Exception watch</p>
                  <h2 className="mt-2 text-2xl font-bold text-white">Signals that need intervention</h2>
                </div>
                <Link className="sm-link" to="/app/exceptions">
                  Open queue
                </Link>
              </div>
              <div className="mt-5 space-y-3">
                {exceptions.map((row) => (
                  <article className="sm-chip text-white" key={row.exception_id}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">{row.title}</p>
                        <p className="mt-2 text-sm text-[var(--sm-muted)]">{row.summary}</p>
                      </div>
                      <span className="sm-status-pill">{row.priority}</span>
                    </div>
                    <p className="mt-3 text-sm text-white/80">{row.source_type} · {row.owner}</p>
                  </article>
                ))}
                {!exceptions.length ? <div className="sm-chip text-[var(--sm-muted)]">No current exception rows.</div> : null}
              </div>
            </article>
          </section>

          <section className="sm-surface p-6">
            <p className="sm-kicker text-[var(--sm-accent)]">Next desks</p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link className="sm-button-primary" to="/app/dqms">
                Open DQMS
              </Link>
              <Link className="sm-button-secondary" to="/app/maintenance">
                Open maintenance
              </Link>
              <Link className="sm-button-secondary" to="/app/director">
                Open CEO brief
              </Link>
            </div>
          </section>
        </>
      )}
    </div>
  )
}
