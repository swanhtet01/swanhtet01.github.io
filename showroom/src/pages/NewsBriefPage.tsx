import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import { checkWorkspaceHealth, workspaceFetch } from '../lib/workspaceApi'
import { buildMarketBrief, MARKET_SAMPLE_TEXT, MARKET_SAMPLE_URLS, type MarketOutput } from '../lib/tooling'

export function NewsBriefPage() {
  const [apiReady, setApiReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [urls, setUrls] = useState('')
  const [notes, setNotes] = useState('')
  const [output, setOutput] = useState<MarketOutput | null>(null)

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

  async function runBrief(nextNotes = notes, nextUrls = urls) {
    setBusy(true)
    try {
      if (apiReady) {
        const payload = await workspaceFetch<{ summary: string; themes: string[]; watch_items: string[]; actions: string[] }>(
          '/api/tools/news-brief',
          {
            method: 'POST',
            body: JSON.stringify({
              raw_text: nextNotes,
              urls: nextUrls
                .split(/\r?\n|,/)
                .map((value) => value.trim())
                .filter(Boolean),
            }),
          },
        )
        setOutput({
          summary: payload.summary,
          themes: payload.themes,
          watchItems: payload.watch_items,
          actions: payload.actions,
        })
        return
      }

      setOutput(buildMarketBrief(nextNotes))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="Free product"
        title="News Brief"
        description="Pull a few URLs or notes into one clean director-ready brief with themes, watch items, and next actions."
      />

      <section className="grid gap-6 lg:grid-cols-[0.92fr_1.08fr]">
        <article className="sm-surface-deep p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Source intake</p>
          <h2 className="mt-3 text-3xl font-bold text-white">Give it a few links and signals.</h2>
          <p className="mt-3 text-sm text-[var(--sm-muted)]">
            This is built for directors and managers who need a shorter watch layer, not another long research dump.
          </p>

          <div className="mt-6 grid gap-4">
            <label className="grid gap-2 text-sm font-semibold text-[var(--sm-muted)]">
              Source URLs
              <textarea
                className="min-h-32 rounded-2xl border border-white/8 bg-[rgba(255,255,255,0.03)] px-4 py-3 text-sm font-normal text-white"
                onChange={(event) => setUrls(event.target.value)}
                placeholder="Paste source URLs, one per line."
                value={urls}
              />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-[var(--sm-muted)]">
              Notes or headlines
              <textarea
                className="min-h-48 rounded-2xl border border-white/8 bg-[rgba(255,255,255,0.03)] px-4 py-3 text-sm font-normal text-white"
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Paste headlines, copied text, or rough notes."
                value={notes}
              />
            </label>

            <div className="flex flex-wrap gap-3">
              <button className="sm-button-primary" onClick={() => void runBrief()} type="button">
                {busy ? 'Building...' : 'Build brief'}
              </button>
              <button
                className="sm-button-secondary"
                onClick={() => {
                  setUrls(MARKET_SAMPLE_URLS)
                  setNotes(MARKET_SAMPLE_TEXT)
                  void runBrief(MARKET_SAMPLE_TEXT, MARKET_SAMPLE_URLS)
                }}
                type="button"
              >
                Load sample
              </button>
            </div>
          </div>
        </article>

        <article className="sm-terminal p-6">
          <div className="flex items-center justify-between gap-3 border-b border-white/8 pb-4">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Brief output</p>
              <h2 className="mt-2 text-2xl font-bold text-white">One clear view, not twenty tabs.</h2>
            </div>
            <span className="sm-status-pill">
              <span className={`sm-led ${output ? 'bg-emerald-400' : 'bg-slate-500'}`} />
              {output ? 'Ready' : 'Waiting'}
            </span>
          </div>

          {output ? (
            <div className="mt-5 grid gap-4">
              <div className="sm-proof-card">
                <p className="sm-kicker text-[var(--sm-accent)]">Summary</p>
                <p className="mt-3 text-xl font-bold text-white">{output.summary}</p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="sm-chip text-white">
                  <p className="sm-kicker text-[var(--sm-accent)]">Themes</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {output.themes.map((theme) => (
                      <span className="rounded-full border border-white/10 bg-white/6 px-3 py-1 text-xs font-semibold text-white" key={theme}>
                        {theme}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="sm-chip text-white">
                  <p className="sm-kicker text-[var(--sm-accent-alt)]">Next moves</p>
                  <ul className="mt-3 space-y-2 text-sm">
                    {output.actions.map((action) => (
                      <li key={action}>- {action}</li>
                    ))}
                  </ul>
                </div>
              </div>
              <div className="sm-chip text-white">
                <p className="sm-kicker text-[var(--sm-accent)]">Watch items</p>
                <ul className="mt-3 space-y-2 text-sm">
                  {output.watchItems.map((item) => (
                    <li key={item}>- {item}</li>
                  ))}
                </ul>
              </div>
            </div>
          ) : (
            <div className="mt-5 sm-chip text-[var(--sm-muted)]">Add a few URLs or rough notes to build a market or management brief.</div>
          )}
        </article>
      </section>

      <section className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Best fit</p>
          <h2 className="mt-3 text-2xl font-bold text-white">Use this when your watch layer is too noisy.</h2>
          <div className="mt-5 grid gap-3">
            <div className="sm-chip text-white">Daily logistics or policy watch</div>
            <div className="sm-chip text-white">Weekly market briefing for directors</div>
            <div className="sm-chip text-white">Sales or procurement signal review</div>
          </div>
        </article>

        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Next step</p>
          <h2 className="mt-3 text-2xl font-bold text-white">Use your own sources and review rhythm.</h2>
          <p className="mt-3 text-sm text-[var(--sm-muted)]">
            This can become a daily director brief, market watch bot, or a risk digest tied to your own categories and escalation rules.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link className="sm-button-accent" to="/contact?package=News%20Brief">
              Use on my sources
            </Link>
            <Link className="sm-button-secondary" to="/products">
              See deployable systems
            </Link>
          </div>
        </article>
      </section>
    </div>
  )
}
