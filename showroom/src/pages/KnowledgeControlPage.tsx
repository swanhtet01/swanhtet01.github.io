import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import { getSeedRuntimeControlDataset, loadRuntimeControlDataset } from '../lib/runtimeControlApi'
import type { RuntimeHealthStatus } from '../lib/runtimeControlModel'

const statusOrder: RuntimeHealthStatus[] = ['Healthy', 'Warning', 'Degraded', 'Needs wiring']

function formatUpdatedAt(value: string | null) {
  if (!value) {
    return 'Seeded runtime model'
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }
  return parsed.toLocaleString()
}

export function KnowledgeControlPage() {
  const [runtimeData, setRuntimeData] = useState(() => getSeedRuntimeControlDataset())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function load() {
      const nextData = await loadRuntimeControlDataset()
      if (cancelled) {
        return
      }
      setRuntimeData(nextData)
      setLoading(false)
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const collections = runtimeData.knowledgeCollections
  const statusTotals = statusOrder.map((status) => ({
    status,
    count: collections.filter((collection) => collection.status === status).length,
  }))
  const tenantTotals = [
    { tenant: 'core' as const, label: 'Core platform' },
    { tenant: 'yangon-tyre' as const, label: 'Yangon Tyre' },
  ].map((item) => ({
    ...item,
    count: collections.filter((collection) => collection.tenant === item.tenant).length,
  }))

  return (
    <div className="space-y-10 pb-12">
      <PageIntro
        eyebrow="Knowledge"
        title="Keep canon, relations, and promotions transparent instead of buried in folders."
        description="Each collection in the runtime needs ownership, quality checks, consumers, and a promotion path into product lines and tenant work."
      />

      <section className="sm-chip text-white">
        <p className="font-semibold">{loading ? 'Refreshing knowledge posture.' : runtimeData.source === 'live' ? 'Live runtime feed connected.' : 'Using seeded runtime model.'}</p>
        <p className="mt-2 text-sm text-[var(--sm-muted)]">
          Source timestamp: {formatUpdatedAt(runtimeData.updatedAt)}. The page is already wired for `/api/runtime/control`, so the knowledge canon can switch to live tenant state without another UI rewrite.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-5">
        <article className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent)]">Collections</p>
          <p className="mt-3 text-3xl font-bold text-white">{collections.length}</p>
          <p className="mt-2 text-sm text-[var(--sm-muted)]">Canonical collections feeding product lines, tenants, and control layers.</p>
        </article>
        {statusTotals.map((summary) => (
          <article className="sm-metric-card" key={summary.status}>
            <p className="sm-kicker text-[var(--sm-accent)]">{summary.status}</p>
            <p className="mt-3 text-3xl font-bold text-white">{summary.count}</p>
            <p className="mt-2 text-sm text-[var(--sm-muted)]">Collections in this posture.</p>
          </article>
        ))}
      </section>

      <section className="sm-site-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Knowledge canon</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Every collection needs sources, canonical records, relations, consumers, and quality checks.</h2>
          </div>
          <div className="flex flex-wrap gap-3 text-sm text-[var(--sm-muted)]">
            {tenantTotals.map((summary) => (
              <span className="sm-chip text-white" key={summary.tenant}>
                {summary.label}: {summary.count}
              </span>
            ))}
          </div>
        </div>
        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          {collections.map((collection) => (
            <article className="sm-demo-link sm-demo-link-card" key={collection.id}>
              <div className="flex items-center justify-between gap-3">
                <span className="sm-home-proof-label">{collection.status}</span>
                <span className="sm-status-pill">{collection.tenant === 'core' ? 'Core' : 'Yangon Tyre'}</span>
              </div>
              <strong>{collection.name}</strong>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">{collection.purpose}</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <article className="sm-chip">
                  <p className="text-xs uppercase tracking-[0.18em] text-[var(--sm-muted)]">Sources</p>
                  <p className="mt-1 text-sm text-white">{collection.sources.join(', ')}</p>
                </article>
                <article className="sm-chip">
                  <p className="text-xs uppercase tracking-[0.18em] text-[var(--sm-muted)]">Consumers</p>
                  <p className="mt-1 text-sm text-white">{collection.consumers.join(', ')}</p>
                </article>
              </div>
              <div className="mt-3 space-y-2 text-sm text-white/80">
                <p>Canonical records: {collection.canonicalRecords.join(', ')}</p>
                <p>Relations: {collection.relations.join(', ')}</p>
                <p>Quality checks: {collection.qualityChecks.join(', ')}</p>
                <p>Next move: {collection.nextMove}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="sm-site-panel">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Promotion queue</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Collections should graduate into live decision surfaces, not sit as passive archives.</h2>
          </div>
          <div className="flex flex-col items-start gap-3 lg:items-end">
            <p className="max-w-xl text-sm text-[var(--sm-muted)]">
              The best next work is the set of promotions that improves founder brief, director review, supplier recovery, and document-driven workflow state.
            </p>
            <Link className="sm-button-primary" to="/app/runtime">
              Open Runtime
            </Link>
          </div>
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {collections.map((collection) => (
            <article className="sm-chip text-white" key={`${collection.id}-next`}>
              <p className="font-semibold">{collection.name}</p>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">{collection.nextMove}</p>
            </article>
          ))}
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link className="sm-button-secondary" to="/app/platform-admin">
            Open Platform Admin
          </Link>
          <Link className="sm-button-secondary" to="/app/policies">
            Open Policies
          </Link>
        </div>
      </section>
    </div>
  )
}
