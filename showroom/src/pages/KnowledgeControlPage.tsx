import { PageIntro } from '../components/PageIntro'
import { KNOWLEDGE_COLLECTIONS } from '../lib/runtimeControlModel'
import type { RuntimeHealthStatus } from '../lib/runtimeControlModel'

const statusOrder: RuntimeHealthStatus[] = ['Healthy', 'Warning', 'Degraded', 'Needs wiring']

export function KnowledgeControlPage() {
  const statusTotals = statusOrder.map((status) => ({
    status,
    count: KNOWLEDGE_COLLECTIONS.filter((collection) => collection.status === status).length,
  }))

  const tenantTotals = ['core', 'yangon-tyre'].map((tenant) => ({
    tenant,
    count: KNOWLEDGE_COLLECTIONS.filter((collection) => collection.tenant === (tenant as 'core' | 'yangon-tyre')).length,
  }))

  return (
    <div className="space-y-10 pb-12">
      <PageIntro
        eyebrow="Knowledge"
        title="Keep canon, relations, and promotions transparent instead of buried in folders."
        description="Every collection in this runtime must have ownership, quality checks, and a promotion path into the product portfolio. The page shows status, sources, canonical records, relation quality, and next moves for each collection."
      />

      <section className="grid gap-4 md:grid-cols-5">
        <article className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent)]">Collections</p>
          <p className="mt-3 text-3xl font-bold text-white">{KNOWLEDGE_COLLECTIONS.length}</p>
          <p className="mt-2 text-sm text-[var(--sm-muted)]">Canonical records powering every product line and tenant.</p>
        </article>
        {statusTotals.map((summary) => (
          <article className="sm-metric-card" key={summary.status}>
            <p className="sm-kicker text-[var(--sm-accent)]">{summary.status}</p>
            <p className="mt-3 text-3xl font-bold text-white">{summary.count}</p>
            <p className="mt-2 text-sm text-[var(--sm-muted)]">Collections in {summary.status.toLowerCase()} posture.</p>
          </article>
        ))}
        <article className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent)]">Tenants</p>
          <p className="mt-3 text-3xl font-bold text-white">{tenantTotals.reduce((total, item) => total + item.count, 0)}</p>
          <p className="mt-2 text-sm text-[var(--sm-muted)]">Collections mapped to tenants.</p>
        </article>
      </section>

      <section className="sm-site-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Knowledge canon</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Each collection is owned, measured, and tied to downstream modules.</h2>
          </div>
          <div className="flex flex-wrap gap-3 text-sm text-[var(--sm-muted)]">
            {tenantTotals.map((summary) => (
              <span key={summary.tenant} className="sm-chip text-white">
                {summary.tenant === 'core' ? 'Core platform' : 'Yangon Tyre'}: {summary.count} collections
              </span>
            ))}
          </div>
        </div>
        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          {KNOWLEDGE_COLLECTIONS.map((collection) => (
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
              <div className="mt-3 flex flex-wrap gap-3 text-sm text-white/80">
                <span>Canonical: {collection.canonicalRecords.join(', ')}</span>
                <span>Relations: {collection.relations.join(', ')}</span>
              </div>
              <div className="mt-3 grid gap-2 text-sm text-[var(--sm-muted)]">
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
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">These collections feed decision velocity, not just archival storage.</h2>
          </div>
          <p className="max-w-xl text-sm text-[var(--sm-muted)]">
            Keep the relations, sources, and canonical fields polished so every release train, director brief, and agent has trustworthy memory.
          </p>
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {KNOWLEDGE_COLLECTIONS.map((collection) => (
            <article className="sm-chip text-white" key={`${collection.id}-next`}>
              <p className="font-semibold">{collection.name}</p>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">{collection.nextMove}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
