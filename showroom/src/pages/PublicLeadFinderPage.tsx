import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

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
  { label: 'Local service businesses', query: 'local service business', keywords: 'service,local,business' },
  { label: 'Regional distributors', query: 'regional distributor', keywords: 'distributor,regional,wholesale' },
  { label: 'Industrial suppliers', query: 'industrial supplier', keywords: 'industrial,supplier,factory' },
]

const flowSteps = [
  ['1', 'Search companies'],
  ['2', 'Keep the shortlist'],
  ['3', 'Open Company List'],
] as const

const DEFAULT_PUBLIC_KEYWORDS = 'service,local,business'

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
  const navigate = useNavigate()
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
      setMessage('Enter a business type, niche, or place first.')
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
      return 0
    }

    if (hasLiveWorkspaceApi()) {
      if (!hasSharedProfile) {
        promptWorkspaceSetup('Enter your company and work email before saving this company.')
        return 0
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
              service_pack: 'Find Clients',
              wedge_product: 'Find Clients',
              semi_products: ['Find Clients', 'Company List'],
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

        const savedCount = saved.saved_count || candidates.length
        setSavedTotal((current) => Math.max(current, savedCount, current + savedCount))
        setMessage(successMessage.replace('{count}', String(savedCount)))
        return savedCount
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Could not save to the team list on this host.')
        return 0
      }
    }

    const result = saveBrowserWorkspaceLeads(candidates, {
      query,
      keywords: searchKeywords,
    })
    setSavedTotal(result.totalCount)
    setMessage(successMessage.replace('{count}', String(candidates.length)))
    return candidates.length
  }

  async function saveLead(row: LeadRow) {
    const key = rowKey(row)
    if (savedKeys.includes(key)) {
      setMessage(`${row.name} is already in your list.`)
      return
    }

    const savedCount = await saveRowsToWorkspace([row], 'Saved {count} company and created the first follow-up.')
    if (savedCount) {
      trackEvent('company_kept', {
        source: 'find_companies',
        count: savedCount,
        provider,
      })
      setSavedKeys((current) => (current.includes(key) ? current : [...current, key]))
    }
  }

  async function saveTopResultsAndContinue() {
    const candidates = rows.slice(0, 3)
    const savedCount = await saveRowsToWorkspace(
      candidates,
      'Saved {count} companies and created the first follow-ups.',
    )
    if (savedCount) {
      trackEvent('company_kept', {
        source: 'find_companies',
        count: savedCount,
        provider,
      })
      setSavedKeys(candidates.map((row) => rowKey(row)))
      navigate(`/company-list?source=find-clients&saved=${savedCount}`)
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
        <p className="sm-kicker text-[var(--sm-accent)]">Find Clients</p>
        <h1 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Search public sources and build a shortlist.</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)]">
          Use this when you need new names. Type a business type, niche, or place, then keep the companies worth contacting with fit reasons, contact clues, and first outreach ready.
        </p>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {flowSteps.map(([step, title]) => (
            <div className="sm-chip text-white" key={title}>
              <p className="sm-kicker text-[var(--sm-accent)]">Step {step}</p>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">{title}</p>
            </div>
          ))}
        </div>

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
                placeholder="industrial supplier"
                value={query}
              />
            </label>

            <div className="flex flex-wrap gap-3">
              <button className="sm-button-primary" disabled={busy || !query.trim()} onClick={() => void runSearch()} type="button">
                {busy ? 'Searching...' : 'Search companies'}
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
                <p className="sm-kicker text-[var(--sm-accent)]">Use with your team</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">
                  Enter your company and work email once. After that, kept companies can go into the same shared list for the team.
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
          <p className="sm-kicker text-[var(--sm-accent)]">Next step</p>
          <h2 className="mt-3 text-3xl font-bold text-white">Save the shortlist into Company List.</h2>
          <div className="mt-5 flex flex-wrap gap-3">
            {rows.length ? (
              <button className="sm-button-primary" onClick={() => void saveTopResultsAndContinue()} type="button">
                Keep first 3 and open Company List
              </button>
            ) : null}
            {savedTotal ? (
              <Link className="sm-button-secondary" to="/company-list?source=find-clients">
                Open Company List
              </Link>
            ) : null}
            {hasLiveWorkspaceApi() ? (
              <button className="sm-button-secondary" onClick={() => setShowWorkspaceSetup((current) => !current)} type="button">
                {showWorkspaceSetup ? 'Hide team setup' : 'Save online for your team'}
              </button>
            ) : null}
          </div>
          <div className="mt-4 sm-chip text-[var(--sm-muted)]">
            {hasLiveWorkspaceApi()
              ? hasSharedProfile
                ? `Saved companies will land in Company List for ${profile.company}.`
                : 'Save will ask for company and work email once.'
              : 'On this host, kept companies stay in this browser and then open in Company List.'}
          </div>
        </section>
      ) : null}
    </div>
  )
}
