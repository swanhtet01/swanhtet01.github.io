import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'

import { browserWorkspaceSummary, buildBrowserOutreach, saveBrowserWorkspaceLeads } from '../lib/browserWorkspace'
import { trackEvent } from '../lib/analytics'
import { searchPublicLeads } from '../lib/publicLeadFinder'
import {
  hasLiveWorkspaceApi,
  isPublicWorkspaceProfileReady,
  loadPublicWorkspaceProfile,
  savePublicLeadsToWorkspace,
  savePublicWorkspaceProfile,
  type PublicWorkspaceProfile,
} from '../lib/workspaceApi'
import { downloadLeadCsv, parseLeads, type LeadRow } from '../lib/tooling'

const quickSearches = [
  { label: 'Tyre shops in Yangon', query: 'tyre shop in yangon', keywords: 'tyre,auto,service,yangon' },
  { label: 'Warehouses in Mandalay', query: 'warehouse in mandalay', keywords: 'warehouse,logistics,mandalay' },
  { label: 'Rubber suppliers in Thailand', query: 'rubber supplier thailand', keywords: 'rubber,supplier,industrial,thailand' },
]

const DEFAULT_PUBLIC_KEYWORDS = 'tyre,auto,service,yangon'

function keywordsFromQuery(value: string) {
  return value
    .split(/[\s,]+/)
    .map((part) => part.trim().toLowerCase())
    .filter((part) => part.length > 2)
    .slice(0, 6)
    .join(',')
}

function rowKey(row: LeadRow) {
  return [row.name, row.website, row.phone, row.source_url].filter(Boolean).join('|')
}

function contactLine(row: LeadRow) {
  return row.email || row.phone || row.website || 'No direct contact yet'
}

function evidenceLine(row: LeadRow) {
  const evidence: string[] = []
  if (row.website) evidence.push('website')
  if (row.phone) evidence.push('phone')
  if (row.email) evidence.push('email')
  if (row.fit_reasons[0]) evidence.push(row.fit_reasons[0])
  return evidence.length ? evidence.join(' | ') : 'public search match'
}

export function PublicLeadFinderPage() {
  const location = useLocation()
  const [profile, setProfile] = useState<PublicWorkspaceProfile>(() => loadPublicWorkspaceProfile())
  const [showWorkspaceSetup, setShowWorkspaceSetup] = useState(false)
  const [query, setQuery] = useState('')
  const [keywords, setKeywords] = useState(DEFAULT_PUBLIC_KEYWORDS)
  const [manualInput, setManualInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [rows, setRows] = useState<LeadRow[]>([])
  const [provider, setProvider] = useState('')
  const [message, setMessage] = useState('')
  const [savedKeys, setSavedKeys] = useState<string[]>([])
  const [savedTotal, setSavedTotal] = useState(browserWorkspaceSummary().total)
  const bootstrapped = useRef(false)
  const hasSharedProfile = isPublicWorkspaceProfileReady(profile)

  const searchKeywords = useMemo(
    () =>
      keywords
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
    [keywords],
  )

  function applyQuickSearch(nextQuery: string, nextKeywords: string) {
    setQuery(nextQuery)
    setKeywords(nextKeywords)
    setRows([])
    setSavedKeys([])
    setMessage('')
    void runSearch({
      query: nextQuery,
      keywords: nextKeywords
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
    })
  }

  function updateProfileField(field: keyof PublicWorkspaceProfile, value: string) {
    const nextProfile = savePublicWorkspaceProfile({
      ...profile,
      [field]: value,
    })
    setProfile(nextProfile)
  }

  function promptWorkspaceSetup(nextMessage: string) {
    setShowWorkspaceSetup(true)
    setMessage(nextMessage)
  }

  const runSearch = useCallback(async (overrides?: { query?: string; keywords?: string[] }) => {
    const nextQuery = (overrides?.query ?? query).trim()
    const nextKeywords = overrides?.keywords ?? searchKeywords

    if (!nextQuery) {
      setMessage('Enter a place or niche first.')
      return
    }

    setBusy(true)
    setMessage('')

    try {
      const mergedRows: LeadRow[] = []
      const payload = await searchPublicLeads({
        query: nextQuery,
        keywords: nextKeywords,
        sources: ['web', 'maps'],
        limit: 8,
      })

      mergedRows.push(...payload.rows)
      if (manualInput.trim()) {
        mergedRows.push(...parseLeads(manualInput))
      }

      const nextRows = [...new Map(mergedRows.map((row) => [rowKey(row), row])).values()]
      setRows(nextRows)
      setProvider(payload.provider)
      setSavedKeys([])
      trackEvent('find_companies_search', {
        query: nextQuery,
        keywords: nextKeywords.join(','),
        result_count: nextRows.length,
        provider: payload.provider,
      })

      if (!nextRows.length) {
        setMessage('No results returned. Try a broader query or use the manual fallback.')
      }
    } catch (error) {
      setRows([])
      setMessage(error instanceof Error ? error.message : 'Search failed on this host.')
    } finally {
      setBusy(false)
    }
  }, [manualInput, query, searchKeywords])

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

    if (queryFromUrl) {
      void runSearch({
        query: queryFromUrl,
        keywords: (keywordsFromUrl || DEFAULT_PUBLIC_KEYWORDS)
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean),
      })
    }

    bootstrapped.current = true
  }, [location.search, runSearch])

  async function saveRowsToWorkspace(candidates: LeadRow[], successMessage: string) {
    if (!candidates.length) {
      setMessage('Search first, then save at least one company.')
      return false
    }

    if (hasLiveWorkspaceApi()) {
      if (!hasSharedProfile) {
        promptWorkspaceSetup('Enter your company and work email before saving into Company List.')
        return false
      }

      const nextProfile = savePublicWorkspaceProfile(profile)
      setProfile(nextProfile)
      setShowWorkspaceSetup(false)
      try {
        const saved = await savePublicLeadsToWorkspace({
          name: nextProfile.name,
          email: nextProfile.email,
          company: nextProfile.company,
          goal: 'Save leads into Company List',
          campaign_goal: query.trim() || 'Run first outreach',
          rows: candidates.map((row) => {
            const outreach = buildBrowserOutreach(row, query, searchKeywords)
            return {
              name: row.name,
              stage: 'offer_ready',
              status: 'open',
              owner: 'Growth Studio',
              service_pack: 'Sales Setup',
              wedge_product: 'Find Companies',
              semi_products: ['Find Companies', 'Company List'],
              outreach_subject: outreach.subject,
              outreach_message: outreach.message,
              email: row.email,
              phone: row.phone,
              website: row.website,
              source_url: row.source_url,
              provider,
              score: row.score,
              notes: row.fit_reasons.join(', '),
              task_title: `Follow up ${row.name}`,
              task_owner: 'Sales',
              task_priority: 'High',
              task_due: 'Today',
              task_notes: 'First outreach',
              task_template: 'lead_follow_up',
            }
          }),
        })

        setSavedTotal((current) => Math.max(current, saved.saved_count || candidates.length, current + candidates.length))
        setMessage(
          successMessage.replace('{count}', String(saved.saved_count || candidates.length)).replace('shared app', 'Company List'),
        )
        return true
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Could not save to Company List on this host.')
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
      setMessage(`${row.name} is already in Company List.`)
      return
    }

    const saved = await saveRowsToWorkspace([row], 'Saved {count} company into Company List and created the first follow-up.')
    if (saved) {
      trackEvent('company_kept', {
        source: 'find_companies',
        count: 1,
        provider,
      })
      setSavedKeys((current) => (current.includes(key) ? current : [...current, key]))
    }
  }

  async function saveTopResults() {
    const candidates = rows.slice(0, 3)
    const saved = await saveRowsToWorkspace(
      candidates,
      'Saved {count} companies into Company List and created the first follow-ups.',
    )
    if (saved) {
      trackEvent('company_kept', {
        source: 'find_companies',
        count: candidates.length,
        provider,
      })
      setSavedKeys(candidates.map((row) => rowKey(row)))
    }
  }

  async function copyOutreach(row: LeadRow) {
    const draft = buildBrowserOutreach(row, query, searchKeywords)
    await navigator.clipboard.writeText(`${draft.subject}\n\n${draft.message}`)
    trackEvent('outreach_copied', {
      source: 'find_companies',
      company: row.name,
    })
    setMessage(`Copied outreach for ${row.name}.`)
  }

  return (
    <div className="space-y-6">
      <section className="sm-surface p-6 lg:p-8">
        <p className="sm-kicker text-[var(--sm-accent)]">Find Companies</p>
        <h1 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Find companies in one search.</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)]">
          Type a place and business type, then keep the companies worth contacting.
        </p>

          <div className="mt-5 grid gap-4">
            <label className="grid gap-2 text-sm font-semibold text-[var(--sm-muted)]">
              Search
              <input
                autoComplete="off"
                className="sm-input"
                onChange={(event) => {
                  const nextValue = event.target.value
                  setQuery(nextValue)
                  setKeywords(keywordsFromQuery(nextValue) || DEFAULT_PUBLIC_KEYWORDS)
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    void runSearch()
                  }
                }}
                placeholder="tyre shop in Yangon"
                value={query}
              />
            </label>

            <div className="flex flex-wrap gap-3">
              <button className="sm-button-primary" disabled={busy || !query.trim()} onClick={() => void runSearch()} type="button">
                {busy ? 'Searching...' : 'Find companies'}
              </button>
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

            {hasLiveWorkspaceApi() && showWorkspaceSetup ? (
              <div className="sm-proof-card">
                <p className="sm-kicker text-[var(--sm-accent)]">Save to team workspace</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">
                  Enter your company and work email once. After that, kept companies can go into the same team workspace.
                </p>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <label className="grid gap-2 text-sm font-semibold text-[var(--sm-muted)]">
                    Name
                    <input className="sm-input" onChange={(event) => updateProfileField('name', event.target.value)} placeholder="Your name" value={profile.name} />
                  </label>
                  <label className="grid gap-2 text-sm font-semibold text-[var(--sm-muted)]">
                    Work email
                    <input className="sm-input" onChange={(event) => updateProfileField('email', event.target.value)} placeholder="you@company.com" value={profile.email} />
                  </label>
                  <label className="grid gap-2 text-sm font-semibold text-[var(--sm-muted)]">
                    Company
                    <input className="sm-input" onChange={(event) => updateProfileField('company', event.target.value)} placeholder="Company name" value={profile.company} />
                  </label>
                </div>
                <div className="mt-3 sm-chip text-[var(--sm-muted)]">
                  {hasSharedProfile ? `Ready to save into the team workspace for ${profile.company}.` : 'Company and work email are required before save.'}
                </div>
                <div className="mt-4 flex flex-wrap gap-3">
                  <button className="sm-button-secondary" onClick={() => setShowWorkspaceSetup(false)} type="button">
                    Hide
                  </button>
                </div>
              </div>
            ) : null}

            <details className="sm-details">
              <summary>More options</summary>
              <div className="sm-details-content grid gap-4">
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
                    Export results
                  </button>
                </div>
              </div>
            </details>
          </div>

          {message ? <div className="mt-3 sm-chip text-[var(--sm-muted)]">{message}</div> : null}
      </section>

      {rows.length || manualInput.trim() || message ? (
        <article className="sm-terminal p-6">
          <div>
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Results</p>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">
                {rows.length ? `${rows.length} result${rows.length === 1 ? '' : 's'} returned. Keep the companies worth chasing.` : 'Run a search to get companies.'}
              </p>
            </div>
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
                        <p className="mt-1 text-sm text-[var(--sm-muted)]">{row.provider || row.source || 'Public result'}</p>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-[0.68fr_0.32fr]">
                      <div className="sm-chip text-white">
                        <p className="sm-kicker text-[var(--sm-accent)]">Contact</p>
                        <p className="mt-2 text-sm">{contactLine(row)}</p>
                      </div>
                      <div className="sm-chip text-white">
                        <p className="sm-kicker text-[var(--sm-accent-alt)]">Why keep it</p>
                        <p className="mt-2 text-sm">{evidenceLine(row)}</p>
                      </div>
                    </div>

                    <div className="mt-4 sm-chip text-[var(--sm-muted)]">{row.snippet || row.source || 'Public result'}</div>

                    <div className="mt-4 flex flex-wrap gap-3">
                      <button className="sm-button-primary" onClick={() => void saveLead(row)} type="button">
                        {saved ? 'Kept' : 'Keep'}
                      </button>
                      <button className="sm-button-secondary" onClick={() => void copyOutreach(row)} type="button">
                        Copy outreach
                      </button>
                      {row.source_url ? (
                        <a className="sm-link self-center" href={row.source_url} rel="noreferrer" target="_blank">
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
                Try one of the quick searches above, then keep the companies worth chasing.
              </div>
            )}

          </div>
        </article>
      ) : null}

      {(rows.length || savedTotal) ? (
        <section className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Next</p>
              <h2 className="mt-3 text-3xl font-bold text-white">Keep a few, then open Company List.</h2>
          <div className="mt-5 flex flex-wrap gap-3">
            {rows.length ? (
              <button className="sm-button-primary" onClick={() => void saveTopResults()} type="button">
                Keep first 3
              </button>
            ) : null}
            {savedTotal ? (
                <Link className="sm-button-secondary" to="/company-list">
                  Open Company List
                </Link>
            ) : null}
            {hasLiveWorkspaceApi() ? (
              <button className="sm-button-secondary" onClick={() => setShowWorkspaceSetup((current) => !current)} type="button">
                {showWorkspaceSetup ? 'Hide workspace setup' : 'Save to team workspace'}
              </button>
            ) : null}
          </div>
          <div className="mt-4 sm-chip text-[var(--sm-muted)]">
            {hasLiveWorkspaceApi()
              ? hasSharedProfile
                ? `Ready to save into ${profile.company}.`
                : 'Save will ask for company and work email once.'
              : 'On this host, kept companies stay in this browser on this computer.'}
          </div>
        </section>
      ) : null}
    </div>
  )
}
