import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import {
  getSeedPlantAWarehouseDataset,
  loadPlantAWarehouseDataset,
  syncPlantAWarehouseDataset,
  type PlantAWarehouseDataset,
} from '../lib/plantAWarehouseApi'
import { getTenantBrandLabel, getTenantConfig } from '../lib/tenantConfig'
import { getWorkspaceSession } from '../lib/workspaceApi'

function formatDateTime(value: string | null) {
  if (!value) return 'Not synced yet'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString()
}

const plantScopeCards = [
  {
    title: 'Floor A',
    detail: 'Yangon / Shwe Pyi Thar. Bias, nylon, and agricultural tyre operations.',
  },
  {
    title: 'Floor B',
    detail: 'Bilin / Mon State. Radial and motorcycle tyre lane at the rented No.2 Large Machinery Factory.',
  },
  {
    title: 'Shared / head office',
    detail: 'Finance, supply chain, sales, and documents that need review before being tied to one plant.',
  },
]

const primaryDoors = [
  {
    title: 'Enter today',
    detail: 'One issue, one proof, one next move.',
    route: '/app/daily-entry',
    cta: 'New entry',
  },
  {
    title: 'Review actions',
    detail: 'Route open work by issue, team, and due time.',
    route: '/app/action-board',
    cta: 'Open board',
  },
  {
    title: 'Read data',
    detail: 'See transformed source signals, not raw Drive folders.',
    route: '/app/change-monitor',
    cta: 'Open changes',
  },
]

export function PlantATransitionPage() {
  const location = useLocation()
  const tenant = getTenantConfig()
  const [warehouse, setWarehouse] = useState<PlantAWarehouseDataset>(() => getSeedPlantAWarehouseDataset())
  const [authenticated, setAuthenticated] = useState(false)
  const [syncingWarehouse, setSyncingWarehouse] = useState(false)
  const [runtimeNote, setRuntimeNote] = useState('Checking Floor A data memory.')

  useEffect(() => {
    let cancelled = false

    async function load() {
      const [nextWarehouse, sessionPayload] = await Promise.all([
        loadPlantAWarehouseDataset(),
        getWorkspaceSession().catch(() => null),
      ])
      if (cancelled) return

      setWarehouse(nextWarehouse)
      setAuthenticated(Boolean(sessionPayload?.authenticated))
      setRuntimeNote(
        nextWarehouse.mode === 'live'
          ? `${nextWarehouse.liveItemCount.toLocaleString()} source items are already transformed into Floor A memory.`
          : nextWarehouse.connectorMessage,
      )
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const loginHref = `/login?next=${encodeURIComponent(`${location.pathname}${location.search}` || '/app/plant-a')}`
  const sourceSignals = warehouse.topRecordTypes.slice(0, 4)
  const sourceBehaviors = warehouse.topBehaviors.slice(0, 3)
  const recentSyncs = warehouse.recentSyncs.slice(0, 3)

  async function handleSyncWarehouse() {
    setSyncingWarehouse(true)
    try {
      const nextWarehouse = await syncPlantAWarehouseDataset()
      setWarehouse(nextWarehouse)
      setRuntimeNote(
        nextWarehouse.mode === 'live'
          ? `Synced ${nextWarehouse.liveItemCount.toLocaleString()} live items into Floor A memory.`
          : nextWarehouse.connectorMessage,
      )
    } catch (error) {
      setRuntimeNote(error instanceof Error ? error.message : 'Floor A sync is unavailable right now.')
    } finally {
      setSyncingWarehouse(false)
    }
  }

  return (
    <div className="mx-auto grid max-w-5xl gap-4 pb-8">
      <PageIntro
        compact
        eyebrow={`${getTenantBrandLabel(tenant)} / Floor A`}
        title="Floor A home."
        description="Three doors only: enter work, review actions, read transformed data. Keep raw files behind the system."
      />

      <section className="grid gap-3 md:grid-cols-3">
        {primaryDoors.map((door) => (
          <Link className="sm-calm-surface grid gap-3 p-5 no-underline" key={door.title} to={door.route}>
            <span className="sm-kicker text-[var(--sm-accent)]">{door.cta}</span>
            <strong className="text-2xl text-[var(--sm-ink)]">{door.title}</strong>
            <span className="text-sm leading-relaxed text-[var(--sm-muted)]">{door.detail}</span>
          </Link>
        ))}
      </section>

      <section className="sm-calm-surface grid gap-4 p-5 lg:grid-cols-[1fr_0.9fr]">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="sm-status-pill">{warehouse.mode === 'live' ? 'live data' : 'seeded data'}</span>
            <span className="sm-status-pill">last sync {formatDateTime(warehouse.lastSyncedAt)}</span>
          </div>
          <h2 className="mt-4 text-3xl font-bold text-[var(--sm-ink)]">What the system knows now.</h2>
          <p className="mt-2 text-sm leading-relaxed text-[var(--sm-muted)]">{runtimeNote}</p>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <article className="sm-ytf-stat-card">
              <span>Sources</span>
              <strong>{warehouse.sourceItemCount.toLocaleString()}</strong>
            </article>
            <article className="sm-ytf-stat-card">
              <span>Records</span>
              <strong>{warehouse.canonicalRecordCount.toLocaleString()}</strong>
            </article>
            <article className="sm-ytf-stat-card">
              <span>Shortcuts</span>
              <strong>{warehouse.shortcutCount.toLocaleString()}</strong>
            </article>
            <article className="sm-ytf-stat-card">
              <span>Lanes</span>
              <strong>{warehouse.sourceLaneCount.toLocaleString()}</strong>
            </article>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {authenticated ? (
              <button className="sm-button-secondary" disabled={syncingWarehouse} onClick={() => void handleSyncWarehouse()} type="button">
                {syncingWarehouse ? 'Syncing' : 'Sync data'}
              </button>
            ) : (
              <Link className="sm-button-secondary" to={loginHref}>
                Login to sync
              </Link>
            )}
            <Link className="sm-button-secondary" to="/app/data-fabric">
              Data setup
            </Link>
          </div>
        </div>

        <div className="grid gap-2">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Do not mix plant data</p>
          {plantScopeCards.map((card) => (
            <article className="sm-ytf-list-row" key={card.title}>
              <span>
                <strong>{card.title}</strong>
                <small>{card.detail}</small>
              </span>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="sm-calm-surface p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-bold text-[var(--sm-ink)]">Transformed signals</h2>
            <Link className="sm-link" to="/app/change-monitor">
              Review
            </Link>
          </div>
          <div className="mt-4 grid gap-2">
            {sourceSignals.length ? (
              sourceSignals.map((item) => (
                <article className="sm-ytf-list-row" key={item.recordType || 'record-type'}>
                  <span>
                    <strong>{(item.recordType || 'source record').replaceAll('_', ' ')}</strong>
                    <small>Candidate record type from the Floor A warehouse.</small>
                  </span>
                  <strong>{item.count.toLocaleString()}</strong>
                </article>
              ))
            ) : (
              <p className="text-sm text-[var(--sm-muted)]">No transformed signal rows yet.</p>
            )}
          </div>
        </article>

        <article className="sm-calm-surface p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-bold text-[var(--sm-ink)]">Latest behavior</h2>
            <Link className="sm-link" to="/app/action-board">
              Act
            </Link>
          </div>
          <div className="mt-4 grid gap-2">
            {sourceBehaviors.length ? (
              sourceBehaviors.map((item) => (
                <article className="sm-ytf-list-row" key={item.sourceBehavior || 'source-behavior'}>
                  <span>
                    <strong>{(item.sourceBehavior || 'source behavior').replaceAll('_', ' ')}</strong>
                    <small>How files or records are behaving before manager review.</small>
                  </span>
                  <strong>{item.count.toLocaleString()}</strong>
                </article>
              ))
            ) : (
              <p className="text-sm text-[var(--sm-muted)]">No behavior summary yet.</p>
            )}
          </div>
        </article>
      </section>

      <details className="sm-calm-surface p-5">
        <summary className="cursor-pointer text-base font-bold text-[var(--sm-ink)]">Advanced sync details</summary>
        <div className="mt-4 grid gap-2">
          {recentSyncs.length ? (
            recentSyncs.map((sync) => (
              <article className="sm-ytf-list-row" key={sync.runId || sync.syncedAt}>
                <span>
                  <strong>{formatDateTime(sync.syncedAt)}</strong>
                  <small>
                    {sync.mode || 'sync'} / {sync.connectorStatus || 'status unknown'}
                  </small>
                </span>
                <strong>{sync.canonicalCount.toLocaleString()} records</strong>
              </article>
            ))
          ) : (
            <p className="text-sm text-[var(--sm-muted)]">No sync run details available yet.</p>
          )}
        </div>
      </details>
    </div>
  )
}
