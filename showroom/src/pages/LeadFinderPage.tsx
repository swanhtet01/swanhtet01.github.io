import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import { checkWorkspaceHealth, workspaceFetch } from '../lib/workspaceApi'
import { downloadLeadCsv, LEAD_SAMPLE_QUERY, LEAD_SAMPLE_TEXT, type LeadRow, type LeadSource, parseLeads } from '../lib/tooling'

const sourceLabels: Array<{ key: LeadSource; label: string; hint: string }> = [
  { key: 'web', label: 'Websites', hint: 'Find company sites and directories' },
  { key: 'social', label: 'Social', hint: 'Pull public profile clues' },
  { key: 'maps', label: 'Maps', hint: 'Look for listings and location pages' },
]

export function LeadFinderPage() {
  const [apiReady, setApiReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [query, setQuery] = useState('')
  const [keywords, setKeywords] = useState('spa,wellness,massage,yangon')
  const [limit, setLimit] = useState(8)
  const [sources, setSources] = useState<Record<LeadSource, boolean>>({ web: true, social: true, maps: true })
  const [manualInput, setManualInput] = useState('')
  const [rows, setRows] = useState<LeadRow[]>([])
  const [provider, setProvider] = useState('')
  const [shortlist, setShortlist] = useState<string[]>([])

  useEffect(() => {
    let cancelled = false
    async function checkApi() {
      const result = await checkWorkspaceHealth()
      if (!cancelled) {
        setApiReady(result.ready)
      }
    }
    void checkApi()
    return () => {
      cancelled = true
    }
  }, [])

  const selectedSources = useMemo(
    () =>
      (Object.entries(sources) as Array<[LeadSource, boolean]>)
        .filter(([, enabled]) => enabled)
        .map(([source]) => source),
    [sources],
  )

  async function runSearch({ nextQuery = query, nextInput = manualInput }: { nextQuery?: string; nextInput?: string } = {}) {
    setBusy(true)
    try {
      if (apiReady && (nextQuery.trim() || nextInput.trim())) {
        const payload = await workspaceFetch<{ rows: LeadRow[]; provider?: string }>(
          '/api/tools/lead-finder',
          {
            method: 'POST',
            body: JSON.stringify({
              raw_text: nextInput,
              query: nextQuery,
              keywords: keywords
                .split(',')
                .map((value) => value.trim())
                .filter(Boolean),
              sources: selectedSources,
              limit,
            }),
          },
        )
        setRows(payload.rows ?? [])
        setProvider(payload.provider ?? '')
        return
      }

      setRows(parseLeads(nextInput))
      setProvider('Manual')
    } finally {
      setBusy(false)
    }
  }

  function toggleShortlist(name: string) {
    setShortlist((current) => (current.includes(name) ? current.filter((item) => item !== name) : [...current, name]))
  }

  const shortlistedRows = rows.filter((row) => shortlist.includes(row.name))

  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="Free product"
        title="Lead Finder"
        description="Search by market and business type, then pull a cleaner lead list from public web, social, and map-style sources."
      />

      <section className="grid gap-6 lg:grid-cols-[0.92fr_1.08fr]">
        <article className="sm-surface-deep p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Search setup</p>
          <h2 className="mt-3 text-3xl font-bold text-white">Tell it what to hunt.</h2>
          <p className="mt-3 max-w-2xl text-sm text-[var(--sm-muted)]">
            Start with one market search, choose where to look, then review a ranked stream with contact clues and fit reasons.
          </p>

          <div className="mt-6 grid gap-4">
            <label className="grid gap-2 text-sm font-semibold text-[var(--sm-muted)]">
              Search intent
              <input
                className="rounded-2xl border border-white/8 bg-[rgba(255,255,255,0.03)] px-4 py-3 text-sm font-normal text-white"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="For example: spa in yangon"
                value={query}
              />
            </label>

            <label className="grid gap-2 text-sm font-semibold text-[var(--sm-muted)]">
              Fit keywords
              <input
                className="rounded-2xl border border-white/8 bg-[rgba(255,255,255,0.03)] px-4 py-3 text-sm font-normal text-white"
                onChange={(event) => setKeywords(event.target.value)}
                value={keywords}
              />
            </label>

            <div className="grid gap-3 md:grid-cols-3">
              {sourceLabels.map((source) => (
                <button
                  className={`rounded-2xl border px-4 py-4 text-left transition ${
                    sources[source.key]
                      ? 'border-[rgba(37,208,255,0.34)] bg-[rgba(37,208,255,0.1)] text-white'
                      : 'border-white/8 bg-[rgba(255,255,255,0.03)] text-[var(--sm-muted)]'
                  }`}
                  key={source.key}
                  onClick={() => setSources((current) => ({ ...current, [source.key]: !current[source.key] }))}
                  type="button"
                >
                  <p className="font-semibold">{source.label}</p>
                  <p className="mt-2 text-sm">{source.hint}</p>
                </button>
              ))}
            </div>

            <label className="grid gap-2 text-sm font-semibold text-[var(--sm-muted)]">
              Result count
              <select
                className="rounded-2xl border border-white/8 bg-[rgba(255,255,255,0.03)] px-4 py-3 text-sm font-normal text-white"
                onChange={(event) => setLimit(Number(event.target.value))}
                value={limit}
              >
                <option value={6}>6</option>
                <option value={8}>8</option>
                <option value={10}>10</option>
                <option value={12}>12</option>
              </select>
            </label>

            <details className="sm-chip">
              <summary className="cursor-pointer font-semibold text-white">Manual list fallback</summary>
              <div className="mt-3 grid gap-2">
                <textarea
                  className="min-h-40 rounded-2xl border border-white/8 bg-[rgba(255,255,255,0.03)] px-4 py-3 text-sm font-normal text-white"
                  onChange={(event) => setManualInput(event.target.value)}
                  placeholder="Paste a lead list if you already have one."
                  value={manualInput}
                />
              </div>
            </details>

            <div className="flex flex-wrap gap-3">
              <button className="sm-button-primary" onClick={() => void runSearch()} type="button">
                {busy ? 'Searching...' : 'Find leads'}
              </button>
              <button
                className="sm-button-secondary"
                onClick={() => {
                  setQuery(LEAD_SAMPLE_QUERY)
                  setManualInput(LEAD_SAMPLE_TEXT)
                  void runSearch({ nextQuery: LEAD_SAMPLE_QUERY, nextInput: LEAD_SAMPLE_TEXT })
                }}
                type="button"
              >
                Load sample
              </button>
              <button className="sm-button-secondary" disabled={rows.length === 0} onClick={() => downloadLeadCsv(rows)} type="button">
                Export CSV
              </button>
            </div>
          </div>
        </article>

        <article className="sm-terminal p-6">
          <div className="flex items-center justify-between gap-3 border-b border-white/8 pb-4">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Live results</p>
              <h2 className="mt-2 text-2xl font-bold text-white">Ranked lead stream</h2>
            </div>
            <span className="sm-status-pill">
              <span className={`sm-led ${rows.length ? 'bg-emerald-400' : 'bg-slate-500'}`} />
              {provider || 'Ready'}
            </span>
          </div>

          <div className="mt-5 space-y-3">
            {rows.length === 0 ? (
              <div className="sm-chip text-[var(--sm-muted)]">Run a search to see companies, contact clues, fit reasons, and shortlist state.</div>
            ) : (
              rows.map((row) => {
                const isSaved = shortlist.includes(row.name)
                return (
                  <div className="sm-proof-card" key={`${row.name}-${row.source_url}`}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-lg font-bold text-white">{row.name}</p>
                        <p className="mt-1 text-sm text-[var(--sm-muted)]">{row.snippet || row.source || 'Public source result'}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="sm-status-pill">Score {row.score}</span>
                        <button className={isSaved ? 'sm-button-accent' : 'sm-button-secondary'} onClick={() => toggleShortlist(row.name)} type="button">
                          {isSaved ? 'Shortlisted' : 'Save'}
                        </button>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <div className="sm-chip text-sm text-white">
                        <p className="sm-kicker text-[var(--sm-accent)]">Contact clues</p>
                        <p className="mt-2">{row.email || 'No email found'}</p>
                        <p className="mt-1">{row.phone || 'No phone found'}</p>
                        <p className="mt-1 break-all">{row.website || 'No website found'}</p>
                      </div>
                      <div className="sm-chip text-sm text-white">
                        <p className="sm-kicker text-[var(--sm-accent-alt)]">Why it matched</p>
                        <ul className="mt-2 space-y-1">
                          {(row.fit_reasons.length ? row.fit_reasons : ['Public source matched your market search']).map((reason) => (
                            <li key={reason}>- {reason}</li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-3">
                      {row.source_url ? (
                        <a className="sm-link" href={row.source_url} rel="noreferrer" target="_blank">
                          Open source
                        </a>
                      ) : null}
                      {row.social_profiles.map((profile) => (
                        <a className="sm-link" href={profile} key={profile} rel="noreferrer" target="_blank">
                          Social
                        </a>
                      ))}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </article>
      </section>

      <section className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Shortlist</p>
          <h2 className="mt-3 text-2xl font-bold text-white">Keep the best names.</h2>
          <div className="mt-5 grid gap-3">
            {shortlistedRows.length === 0 ? (
              <div className="sm-chip text-[var(--sm-muted)]">Save a few results here. This becomes the first step toward a richer outbound workflow.</div>
            ) : (
              shortlistedRows.map((row) => (
                <div className="sm-chip" key={`shortlist-${row.name}`}>
                  <p className="font-semibold text-white">{row.name}</p>
                  <p className="mt-2 text-sm text-[var(--sm-muted)]">{row.email || row.phone || row.website || 'Public source only'}</p>
                </div>
              ))
            )}
          </div>
        </article>

        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Next step</p>
          <h2 className="mt-3 text-2xl font-bold text-white">Want this on your own market?</h2>
          <p className="mt-3 text-sm text-[var(--sm-muted)]">
            We can turn the same search logic into a reusable lead workflow for your market, city, or buyer type.
          </p>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <div className="sm-chip text-white">Use your own search terms</div>
            <div className="sm-chip text-white">Add your own scoring logic</div>
            <div className="sm-chip text-white">Export clean lead packs daily</div>
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link className="sm-button-accent" to="/contact?package=Lead%20Finder">
              Use on my market
            </Link>
            <Link className="sm-button-secondary" to="/products">
              See core products
            </Link>
          </div>
        </article>
      </section>
    </div>
  )
}
