import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import { browserWorkspaceSummary, buildBrowserOutreach, saveBrowserWorkspaceLeads } from '../lib/browserWorkspace'
import { publicLeadFinderAvailable, searchPublicLeads } from '../lib/publicLeadFinder'
import { bootstrapPublicWorkspace, getWorkspaceSession, hasLiveWorkspaceApi, importLeadPipeline } from '../lib/workspaceApi'
import { downloadLeadCsv, parseLeads, type LeadRow, type LeadSource } from '../lib/tooling'

const sourceLabels: Array<{ key: LeadSource; label: string }> = [
  { key: 'web', label: 'Web' },
  { key: 'social', label: 'Social' },
  { key: 'maps', label: 'Maps' },
]

function rowKey(row: LeadRow) {
  return [row.name, row.website, row.phone, row.source_url].filter(Boolean).join('|')
}

function contactLine(row: LeadRow) {
  return row.email || row.phone || row.website || 'No direct contact yet'
}

export function PublicLeadFinderPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [keywords, setKeywords] = useState('spa,wellness,massage,yangon')
  const [limit, setLimit] = useState(8)
  const [manualInput, setManualInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [rows, setRows] = useState<LeadRow[]>([])
  const [provider, setProvider] = useState('')
  const [message, setMessage] = useState('')
  const [shortlist, setShortlist] = useState<string[]>([])
  const [savedTotal, setSavedTotal] = useState(browserWorkspaceSummary().total)
  const [sources, setSources] = useState<Record<LeadSource, boolean>>({ web: true, social: false, maps: true })
  const bootstrapped = useRef(false)

  const searchKeywords = useMemo(
    () =>
      keywords
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
    [keywords],
  )

  const selectedSources = useMemo(
    () =>
      (Object.entries(sources) as Array<[LeadSource, boolean]>)
        .filter(([, enabled]) => enabled)
        .map(([source]) => source),
    [sources],
  )

  const shortlistRows = useMemo(() => {
    const wanted = new Set(shortlist)
    return rows.filter((row) => wanted.has(rowKey(row)))
  }, [rows, shortlist])

  useEffect(() => {
    if (bootstrapped.current) {
      return
    }

    const params = new URLSearchParams(location.search)
    const queryFromUrl = params.get('q')?.trim() ?? ''
    const keywordsFromUrl = params.get('keywords')?.trim() ?? ''

    if (queryFromUrl) {
      setQuery(queryFromUrl)
    }
    if (keywordsFromUrl) {
      setKeywords(keywordsFromUrl)
    }

    bootstrapped.current = true
  }, [location.search])

  async function runSearch() {
    setBusy(true)
    setMessage('')

    try {
      const mergedRows: LeadRow[] = []
      const payload = await searchPublicLeads({
        query,
        keywords: searchKeywords,
        sources: selectedSources.length ? selectedSources : ['web', 'maps'],
        limit,
      })

      mergedRows.push(...payload.rows)
      if (manualInput.trim()) {
        mergedRows.push(...parseLeads(manualInput))
      }

      const nextRows = [...new Map(mergedRows.map((row) => [rowKey(row), row])).values()]
      setRows(nextRows)
      setProvider(payload.provider)
      setShortlist([])

      if (!nextRows.length) {
        setMessage('No results returned. Try a broader query or use the manual fallback.')
      }
    } catch (error) {
      setRows([])
      setMessage(error instanceof Error ? error.message : 'Search failed on this host.')
    } finally {
      setBusy(false)
    }
  }

  function toggleShortlist(row: LeadRow) {
    const key = rowKey(row)
    setShortlist((current) => (current.includes(key) ? current.filter((item) => item !== key) : [...current, key]))
  }

  async function saveToWorkspace() {
    const candidates = shortlistRows.length ? shortlistRows : rows.slice(0, 5)
    if (!candidates.length) {
      setMessage('Search first, then keep at least one lead.')
      return
    }

    if (hasLiveWorkspaceApi()) {
      try {
        const session = await getWorkspaceSession()
        if (!session.authenticated) {
          await bootstrapPublicWorkspace({ company: query.trim() || 'My Workspace' })
        }

        const imported = await importLeadPipeline(
          candidates.map((row) => {
            const outreach = buildBrowserOutreach(row, query, searchKeywords)
            return {
              name: row.name,
              stage: 'offer_ready',
              status: 'open',
              owner: 'Growth Studio',
              service_pack: 'Action OS',
              wedge_product: 'Lead Finder',
              semi_products: ['Lead Finder'],
              outreach_subject: outreach.subject,
              outreach_message: outreach.message,
              email: row.email,
              phone: row.phone,
              website: row.website,
              source: 'public_lead_finder',
              source_url: row.source_url,
              provider,
              score: row.score,
              notes: row.fit_reasons.join(', '),
            }
          }),
          query.trim() || 'Run first outreach',
        )

        setMessage(`Saved ${imported.saved_count || candidates.length} lead${(imported.saved_count || candidates.length) === 1 ? '' : 's'} into the live workspace.`)
        navigate('/app/leads', { replace: true })
        return
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Could not save to the live workspace.')
        return
      }
    }

    const result = saveBrowserWorkspaceLeads(candidates, {
      query,
      keywords: searchKeywords,
    })
    setSavedTotal(result.totalCount)
    setMessage(`Saved ${candidates.length} lead${candidates.length === 1 ? '' : 's'} and ${result.actionCount} follow-up action${result.actionCount === 1 ? '' : 's'} into the browser workspace.`)
  }

  async function copyOutreach(row: LeadRow) {
    const draft = buildBrowserOutreach(row, query, searchKeywords)
    await navigator.clipboard.writeText(`${draft.subject}\n\n${draft.message}`)
    setMessage(`Copied outreach for ${row.name}.`)
  }

  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="Lead Finder"
        title="Search a market."
        description="Type a place or niche, keep the right leads, and move them into the workspace."
      />

      <section className="grid gap-6 lg:grid-cols-[0.82fr_1.18fr]">
        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Search</p>
          <h2 className="mt-3 text-3xl font-bold text-white">Find real businesses.</h2>

          <div className="mt-5 grid gap-4">
            <label className="grid gap-2 text-sm font-semibold text-[var(--sm-muted)]">
              What are you looking for?
              <input className="sm-input" onChange={(event) => setQuery(event.target.value)} placeholder="spa in yangon" value={query} />
            </label>

            <div className="flex flex-wrap gap-3">
              <button className="sm-button-primary" disabled={busy || !query.trim()} onClick={() => void runSearch()} type="button">
                {busy ? 'Searching...' : 'Search'}
              </button>
              <button className="sm-button-secondary" disabled={!rows.length} onClick={() => downloadLeadCsv(rows)} type="button">
                Export CSV
              </button>
              <Link className="sm-button-secondary" to="/workspace">
                Keep shortlist
              </Link>
            </div>

            <details className="sm-details">
              <summary>Advanced</summary>
              <div className="sm-details-content grid gap-4">
                <label className="grid gap-2 text-sm font-semibold text-[var(--sm-muted)]">
                  Fit keywords
                  <input className="sm-input" onChange={(event) => setKeywords(event.target.value)} value={keywords} />
                </label>

                <div className="grid gap-3 md:grid-cols-3">
                  {sourceLabels.map((source) => (
                    <button
                      className={`sm-chip text-left ${sources[source.key] ? 'border-[rgba(37,208,255,0.28)] text-white' : 'text-[var(--sm-muted)]'}`}
                      key={source.key}
                      onClick={() => setSources((current) => ({ ...current, [source.key]: !current[source.key] }))}
                      type="button"
                    >
                      {source.label}
                    </button>
                  ))}
                </div>

                <label className="grid gap-2 text-sm font-semibold text-[var(--sm-muted)]">
                  Result count
                  <select className="sm-input" onChange={(event) => setLimit(Number(event.target.value) || 8)} value={limit}>
                    {[6, 8, 10, 12].map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="grid gap-2 text-sm font-semibold text-[var(--sm-muted)]">
                  Manual list fallback
                  <textarea
                    className="sm-input min-h-32"
                    onChange={(event) => setManualInput(event.target.value)}
                    placeholder="Paste a list if you already have one."
                    value={manualInput}
                  />
                </label>
              </div>
            </details>
          </div>

          <div className="mt-4 sm-chip text-[var(--sm-muted)]">
            Provider: {provider || (publicLeadFinderAvailable() ? 'browser search ready' : 'manual mode')}
          </div>
          {message ? <div className="mt-3 sm-chip text-[var(--sm-muted)]">{message}</div> : null}
        </article>

        <article className="sm-terminal p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Results</p>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">
                {rows.length ? `${rows.length} result${rows.length === 1 ? '' : 's'} returned` : 'Run a search to get leads.'}
              </p>
            </div>
            <span className="sm-status-pill">{busy ? 'SEARCHING' : 'READY'}</span>
          </div>

          <div className="mt-5 space-y-4">
            {rows.length ? (
              rows.map((row) => {
                const kept = shortlist.includes(rowKey(row))
                return (
                  <div className="sm-proof-card" key={rowKey(row)}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-lg font-bold text-white">{row.name}</p>
                        <p className="mt-1 text-sm text-[var(--sm-muted)]">{row.snippet || row.source || 'Public result'}</p>
                      </div>
                      <span className="sm-status-pill">Score {row.score}</span>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-[0.68fr_0.32fr]">
                      <div className="sm-chip text-white">
                        <p className="sm-kicker text-[var(--sm-accent)]">Contact</p>
                        <p className="mt-2 text-sm">{contactLine(row)}</p>
                      </div>
                      <div className="sm-chip text-white">
                        <p className="sm-kicker text-[var(--sm-accent-alt)]">Match</p>
                        <p className="mt-2 text-sm">{row.fit_reasons[0] || 'Public search match'}</p>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-3">
                      <button className="sm-button-primary" onClick={() => toggleShortlist(row)} type="button">
                        {kept ? 'Remove' : 'Keep'}
                      </button>
                      <button className="sm-button-secondary" onClick={() => void copyOutreach(row)} type="button">
                        Copy outreach
                      </button>
                      {row.source_url ? (
                        <a className="sm-button-secondary" href={row.source_url} rel="noreferrer" target="_blank">
                          Open source
                        </a>
                      ) : null}
                    </div>
                  </div>
                )
              })
            ) : manualInput.trim() ? (
              <div className="sm-chip text-[var(--sm-muted)]">Manual fallback is filled. Run search to merge it with browser results.</div>
            ) : (
              <div className="sm-chip text-[var(--sm-muted)]">
                Try a place or niche, then keep the best 3 results. Examples: spa in Yangon, rubber supplier Myanmar, warehouse Yangon.
              </div>
            )}
          </div>
        </article>
      </section>

      <section className="grid gap-6 lg:grid-cols-[0.84fr_1.16fr]">
        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Workspace</p>
          <h2 className="mt-3 text-3xl font-bold text-white">Keep the shortlist.</h2>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            <div className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent)]">Saved leads</p>
              <p className="mt-2 text-3xl font-bold">{savedTotal}</p>
            </div>
            <div className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Kept now</p>
              <p className="mt-2 text-3xl font-bold">{shortlistRows.length || 0}</p>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <button className="sm-button-primary" disabled={!rows.length} onClick={() => void saveToWorkspace()} type="button">
              Save to workspace
            </button>
            <Link className="sm-button-secondary" to="/workspace">
              Open shortlist
            </Link>
          </div>
          <div className="mt-4 sm-chip text-[var(--sm-muted)]">
            {hasLiveWorkspaceApi()
              ? 'This host can save into the live workspace.'
              : 'This host saves into the browser workspace on this device.'}
          </div>
        </article>

        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">What you get</p>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="sm-chip text-white">Shortlist</div>
            <div className="sm-chip text-white">Copied outreach</div>
            <div className="sm-chip text-white">Follow-up actions</div>
          </div>
          <div className="mt-5 grid gap-3">
            <div className="sm-chip text-white">Search first.</div>
            <div className="sm-chip text-white">Keep only the leads worth chasing.</div>
            <div className="sm-chip text-white">Move the shortlist into Workspace or Action OS.</div>
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link className="sm-button-secondary" to="/workspace">
              Open shortlist
            </Link>
            <Link className="sm-button-secondary" to="/action-os">
              Open Action OS
            </Link>
          </div>
        </article>
      </section>
    </div>
  )
}
