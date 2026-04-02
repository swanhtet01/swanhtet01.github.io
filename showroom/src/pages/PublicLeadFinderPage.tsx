import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import { browserWorkspaceSummary, buildBrowserOutreach, saveBrowserWorkspaceLeads } from '../lib/browserWorkspace'
import { publicLeadFinderAvailable, searchPublicLeads } from '../lib/publicLeadFinder'
import { bootstrapPublicWorkspace, getWorkspaceSession, hasLiveWorkspaceApi, importLeadPipeline } from '../lib/workspaceApi'
import { downloadLeadCsv, parseLeads, type LeadRow } from '../lib/tooling'

const quickSearches = [
  { label: 'Spas in Yangon', query: 'spa in yangon', keywords: 'spa,wellness,massage,yangon' },
  { label: 'Rubber suppliers in Myanmar', query: 'rubber supplier myanmar', keywords: 'rubber,supplier,industrial,myanmar' },
  { label: 'Warehouses in Yangon', query: 'warehouse yangon', keywords: 'warehouse,logistics,storage,yangon' },
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
  const [savedKeys, setSavedKeys] = useState<string[]>([])
  const [savedTotal, setSavedTotal] = useState(browserWorkspaceSummary().total)
  const bootstrapped = useRef(false)

  const searchKeywords = useMemo(
    () =>
      keywords
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
    [keywords],
  )

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

  function applyQuickSearch(nextQuery: string, nextKeywords: string) {
    setQuery(nextQuery)
    setKeywords(nextKeywords)
    setRows([])
    setSavedKeys([])
    setMessage('')
  }

  async function runSearch() {
    setBusy(true)
    setMessage('')

    try {
      const mergedRows: LeadRow[] = []
      const payload = await searchPublicLeads({
        query,
        keywords: searchKeywords,
        sources: ['web', 'maps'],
        limit,
      })

      mergedRows.push(...payload.rows)
      if (manualInput.trim()) {
        mergedRows.push(...parseLeads(manualInput))
      }

      const nextRows = [...new Map(mergedRows.map((row) => [rowKey(row), row])).values()]
      setRows(nextRows)
      setProvider(payload.provider)
      setSavedKeys([])

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

  async function saveRowsToWorkspace(candidates: LeadRow[], successMessage: string) {
    if (!candidates.length) {
      setMessage('Search first, then keep at least one lead.')
      return false
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

        setMessage(successMessage.replace('{count}', String(imported.saved_count || candidates.length)))
        return true
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Could not save to the live workspace.')
        return false
      }
    }

    const result = saveBrowserWorkspaceLeads(candidates, {
      query,
      keywords: searchKeywords,
    })
    setSavedTotal(result.totalCount)
    setMessage(successMessage.replace('{count}', String(candidates.length)))
    return true
  }

  async function saveLead(row: LeadRow) {
    const key = rowKey(row)
    if (savedKeys.includes(key)) {
      setMessage(`${row.name} is already in the workspace.`)
      return
    }

    const saved = await saveRowsToWorkspace([row], `Saved {count} lead into ${hasLiveWorkspaceApi() ? 'the live workspace' : 'workspace'} and created the next action.`)
    if (saved) {
      setSavedKeys((current) => (current.includes(key) ? current : [...current, key]))
      navigate('/workspace')
    }
  }

  async function saveTopResults() {
    const candidates = rows.slice(0, 3)
    const saved = await saveRowsToWorkspace(
      candidates,
      `Saved {count} leads into ${hasLiveWorkspaceApi() ? 'the live workspace' : 'workspace'} and created the next actions.`,
    )
    if (saved) {
      setSavedKeys(candidates.map((row) => rowKey(row)))
      navigate('/workspace')
    }
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
        title="Find businesses worth contacting."
        description="Search by place or niche, keep the best leads, and save them into the shortlist."
      />

      <section className="grid gap-6 lg:grid-cols-[0.82fr_1.18fr]">
        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Search</p>
          <h2 className="mt-3 text-3xl font-bold text-white">Run one search.</h2>

          <div className="mt-5 grid gap-4">
            <label className="grid gap-2 text-sm font-semibold text-[var(--sm-muted)]">
              What are you looking for?
              <input className="sm-input" onChange={(event) => setQuery(event.target.value)} placeholder="spa in yangon" value={query} />
            </label>

            <div className="flex flex-wrap gap-3">
              <button className="sm-button-primary" disabled={busy || !query.trim()} onClick={() => void runSearch()} type="button">
                {busy ? 'Searching...' : 'Search'}
              </button>
              <button className="sm-button-secondary" disabled={!rows.length} onClick={() => void saveTopResults()} type="button">
                Keep top 3
              </button>
              <Link className="sm-button-secondary" to="/workspace">
                Open shortlist
              </Link>
            </div>

            <div className="grid gap-2">
              <p className="sm-kicker text-[var(--sm-accent)]">Try one</p>
              <div className="flex flex-wrap gap-2">
                {quickSearches.map((item) => (
                  <button className="sm-button-secondary" key={item.label} onClick={() => applyQuickSearch(item.query, item.keywords)} type="button">
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <details className="sm-details">
              <summary>Advanced</summary>
              <div className="sm-details-content grid gap-4">
                <label className="grid gap-2 text-sm font-semibold text-[var(--sm-muted)]">
                  Fit keywords
                  <input className="sm-input" onChange={(event) => setKeywords(event.target.value)} value={keywords} />
                </label>

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

                <div>
                  <button className="sm-button-secondary" disabled={!rows.length} onClick={() => downloadLeadCsv(rows)} type="button">
                    Export CSV
                  </button>
                </div>
              </div>
            </details>
          </div>

          <div className="mt-4 sm-chip text-[var(--sm-muted)]">
            {provider ? `Search source: ${provider}` : publicLeadFinderAvailable() ? 'Browser search is ready on this host.' : 'Manual mode only on this host.'}
          </div>
          {message ? <div className="mt-3 sm-chip text-[var(--sm-muted)]">{message}</div> : null}
        </article>

        <article className="sm-terminal p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Results</p>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">
                {rows.length ? `${rows.length} result${rows.length === 1 ? '' : 's'} returned. Keep the best 3.` : 'Run a search to get leads.'}
              </p>
            </div>
            <span className="sm-status-pill">{busy ? 'SEARCHING' : 'READY'}</span>
          </div>

          <div className="mt-5 space-y-4">
            {rows.length ? (
              rows.map((row) => {
                const saved = savedKeys.includes(rowKey(row))
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
                      <button className="sm-button-primary" onClick={() => void saveLead(row)} type="button">
                        {saved ? 'Saved' : 'Keep'}
                      </button>
                      {row.source_url ? (
                        <a className="sm-button-secondary" href={row.source_url} rel="noreferrer" target="_blank">
                          Open source
                        </a>
                      ) : null}
                      <button className="sm-button-secondary" onClick={() => void copyOutreach(row)} type="button">
                        Copy outreach
                      </button>
                    </div>
                  </div>
                )
              })
            ) : manualInput.trim() ? (
              <div className="sm-chip text-[var(--sm-muted)]">Manual fallback is filled. Run search to merge it with browser results.</div>
            ) : (
              <div className="sm-chip text-[var(--sm-muted)]">
                Try one of the quick searches above, then keep the best 3 results.
              </div>
            )}
          </div>
        </article>
      </section>

      <section className="sm-surface p-6">
        <p className="sm-kicker text-[var(--sm-accent)]">Next step</p>
        <h2 className="mt-3 text-3xl font-bold text-white">Keep the shortlist, then run follow-up.</h2>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <div className="sm-chip text-white">
            <p className="sm-kicker text-[var(--sm-accent)]">Saved already</p>
            <p className="mt-2 text-3xl font-bold">{savedTotal}</p>
          </div>
          <div className="sm-chip text-white">
            <p className="sm-kicker text-[var(--sm-accent-alt)]">Search rule</p>
            <p className="mt-2 text-sm">Keep only the 3 leads worth chasing first.</p>
          </div>
          <div className="sm-chip text-white">
            <p className="sm-kicker text-[var(--sm-accent)]">After save</p>
            <p className="mt-2 text-sm">Shortlist stores the leads and creates the follow-up queue.</p>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          <button className="sm-button-primary" disabled={!rows.length} onClick={() => void saveTopResults()} type="button">
            Keep top 3
          </button>
          <Link className="sm-button-secondary" to="/workspace">
            Open shortlist
          </Link>
          <Link className="sm-button-secondary" to="/action-os">
            Open queue
          </Link>
        </div>
        <div className="mt-4 sm-chip text-[var(--sm-muted)]">
          {hasLiveWorkspaceApi() ? 'This host can save into the shared app.' : 'This host saves into the browser shortlist on this device.'}
        </div>
      </section>
    </div>
  )
}
