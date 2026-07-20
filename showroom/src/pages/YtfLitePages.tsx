import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

type YtfFeedPayload = Record<string, any>
type YtfLiteMode = 'entry' | 'erp' | 'data'
type YtfScope = 'plant-a' | 'plant-b' | 'company'

const YTF_FEED_URL = 'https://ytf.supermega.dev/api/feed'

function scopeFromUrl(): YtfScope {
  if (typeof window === 'undefined') return 'company'
  const params = new URLSearchParams(window.location.search)
  const plant = params.get('plant')?.toLowerCase()
  if (plant === 'plant-a' || plant === 'plant-b') return plant
  return 'company'
}

function scopeLabel(scope: YtfScope) {
  if (scope === 'plant-a') return 'Plant A'
  if (scope === 'plant-b') return 'Plant B'
  return 'Company'
}

function numberLabel(value: unknown) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric.toLocaleString() : '0'
}

function dateLabel(value: unknown) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return raw
  return parsed.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

function ytfHome(scope: YtfScope, mode?: string) {
  const params = new URLSearchParams()
  if (scope !== 'company') params.set('plant', scope)
  if (mode) params.set('mode', mode)
  const suffix = params.toString()
  return `https://ytf.supermega.dev/${suffix ? `?${suffix}` : ''}`
}

function plantRoute(scope: YtfScope) {
  const plant = scope === 'plant-b' ? 'plant-b' : 'plant-a'
  const params = new URLSearchParams({ tenant: 'ytf', plant, from: 'ytf', screen: 'plant' })
  return `/app/plant-manager?${params.toString()}`
}

function modeCopy(mode: YtfLiteMode) {
  if (mode === 'entry') {
    return {
      eyebrow: 'Entry',
      title: 'Add the factory update in YTF ERP.',
      description: 'Keep input short: daily summary, board photo, abnormality, or stock count.',
    }
  }
  if (mode === 'erp') {
    return {
      eyebrow: 'ERP',
      title: 'Open the YTF operating records.',
      description: 'Production, stock, quality, sales, and purchase records stay in the live YTF ERP.',
    }
  }
  return {
    eyebrow: 'Data',
    title: 'Review the current operating picture.',
    description: 'Use this for sales, materials, production status, and plant follow-up context.',
  }
}

function YtfLitePage({ mode }: { mode: YtfLiteMode }) {
  const [scope, setScope] = useState<YtfScope>(() => scopeFromUrl())
  const [feed, setFeed] = useState<YtfFeedPayload | null>(null)
  const [feedState, setFeedState] = useState<'loading' | 'ready' | 'offline'>('loading')

  useEffect(() => {
    let cancelled = false
    async function loadFeed() {
      try {
        const response = await fetch(YTF_FEED_URL, { cache: 'no-store' })
        if (!response.ok) throw new Error(`Feed failed: ${response.status}`)
        const payload = (await response.json()) as YtfFeedPayload
        if (!cancelled) {
          setFeed(payload)
          setFeedState('ready')
        }
      } catch {
        if (!cancelled) setFeedState('offline')
      }
    }

    void loadFeed()
    return () => {
      cancelled = true
    }
  }, [])

  const copy = modeCopy(mode)
  const plantSignals = scope === 'company' ? feed?.manager_signals?.company : feed?.manager_signals?.by_plant?.[scope]
  const cards = useMemo(() => {
    const daily = feed?.daily_production || {}
    const mtd = daily.mtd || {}
    const sales = feed?.sales_current || {}
    const material = feed?.material_position || {}
    const materialSummary = material.summary || {}
    const productionValue = scope === 'plant-a' ? 'Update due' : Number(mtd.produced || 0) ? `${numberLabel(mtd.produced)} pcs` : 'Not loaded'
    const productionNote =
      scope === 'plant-a'
        ? 'Plant A needs a daily summary or board photo for current output.'
        : `${daily.status?.label || 'Current month'}${daily.as_of ? ` / ${dateLabel(daily.as_of)}` : ''}`

    return [
      { label: 'Production', value: productionValue, note: productionNote },
      {
        label: 'Sales batch',
        value: Number(sales.total_qty || 0) ? `${numberLabel(sales.total_qty)} pcs` : 'Not loaded',
        note: sales.as_of ? `${sales.as_of} / company-wide` : 'Use YTF ERP for dispatch detail.',
      },
      {
        label: 'Materials',
        value: `${numberLabel(materialSummary.at_risk || 0)} at risk`,
        note: `${numberLabel(materialSummary.out || 0)} out / ${material.period_label || 'latest balance'}`,
      },
      {
        label: 'Open work',
        value: Number(plantSignals?.open_count || 0) ? `${numberLabel(plantSignals.open_count)} open` : 'Clear',
        note: Number(plantSignals?.due_count || 0) ? `${numberLabel(plantSignals.due_count)} section updates due` : 'No open plant follow-up in this view.',
      },
    ]
  }, [feed, plantSignals, scope])

  const actions = [
    { label: 'Daily summary', detail: 'Short shift close and handover.', href: ytfHome(scope, 'daily_routine') },
    { label: 'Board photo', detail: 'Upload one board photo for current values.', href: ytfHome(scope, 'whiteboard_snapshot') },
    { label: 'Abnormality 5W1H', detail: 'Log issue, cause, containment, owner, and next action.', href: ytfHome(scope, 'normal_abnormal') },
    { label: 'Stock count', detail: 'Record one counted material, WIP, or finished-good number.', href: ytfHome(scope, 'stock') },
  ]

  return (
    <div className="space-y-5">
      <section className="sm-surface-deep p-5 lg:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <img alt="" className="h-12 w-12 rounded-2xl bg-white p-1" src="/brand/yangon-tyre-mark.svg" />
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Yangon Tyre ERP / {copy.eyebrow}</p>
              <h1 className="mt-2 text-3xl font-black text-white lg:text-5xl">{copy.title}</h1>
              <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[var(--sm-muted)]">{copy.description}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {(['company', 'plant-a', 'plant-b'] as const).map((item) => (
              <button className={item === scope ? 'sm-button-primary' : 'sm-button-secondary'} key={item} onClick={() => setScope(item)} type="button">
                {scopeLabel(item)}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <article className="sm-metric-card" key={card.label}>
            <p className="sm-kicker text-[var(--sm-accent)]">{card.label}</p>
            <p className="mt-3 text-3xl font-black text-white">{card.value}</p>
            <p className="mt-2 text-sm leading-relaxed text-[var(--sm-muted)]">{card.note}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
        <article className="sm-surface p-5 lg:p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">{scopeLabel(scope)}</p>
              <h2 className="mt-2 text-2xl font-black text-white">Choose one action.</h2>
            </div>
            <a className="sm-button-primary" href={ytfHome(scope)}>
              Open live YTF ERP
            </a>
          </div>
          <div className="mt-5 grid gap-3">
            {actions.map((action) => (
              <a className="sm-manager-row" href={action.href} key={action.label}>
                <div>
                  <p className="font-semibold text-white">{action.label}</p>
                  <p className="mt-1 text-sm leading-relaxed text-[var(--sm-muted)]">{action.detail}</p>
                </div>
                <span className="sm-link">Open</span>
              </a>
            ))}
          </div>
        </article>

        <article className="sm-surface-deep p-5 lg:p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Context</p>
              <h2 className="mt-2 text-2xl font-black text-white">Keep the record in one place.</h2>
            </div>
            <span className="sm-status-pill">
              {feedState === 'ready' ? `Updated ${dateLabel(feed?.generated_at) || 'recently'}` : feedState === 'loading' ? 'Loading' : 'Open live ERP'}
            </span>
          </div>
          <div className="mt-5 grid gap-3">
            <Link className="sm-manager-row" to={plantRoute(scope)}>
              <div>
                <p className="font-semibold text-white">Plant workspace</p>
                <p className="mt-1 text-sm leading-relaxed text-[var(--sm-muted)]">Daily close, open work, and plant handoff.</p>
              </div>
              <span className="sm-link">Open</span>
            </Link>
            <a className="sm-manager-row" href={ytfHome(scope)}>
              <div>
                <p className="font-semibold text-white">Current YTF ERP</p>
                <p className="mt-1 text-sm leading-relaxed text-[var(--sm-muted)]">Use this as the source of truth for live entry and review.</p>
              </div>
              <span className="sm-link">Open</span>
            </a>
          </div>
        </article>
      </section>
    </div>
  )
}

export function YtfLiteEntryPage() {
  return <YtfLitePage mode="entry" />
}

export function YtfLiteErpPage() {
  return <YtfLitePage mode="erp" />
}

export function YtfLiteDataPage() {
  return <YtfLitePage mode="data" />
}
