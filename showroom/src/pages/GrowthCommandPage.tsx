import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

type SocialPost = {
  id: string
  date: string
  channel: string
  campaign: string
  offer: string
  offer_id: string
  status: string
  asset: string
  cta: string
  post_text: string
  review_gate: string
  next_action: string
  posted_url: string
  reply_count: number
  lead_count: number
}

type SocialQueue = {
  status: string
  generated_at: string
  generated_for: string
  review_required: boolean
  metrics: {
    post_count: number
    outreach_draft_count: number
    offer_count: number
    review_required_count: number
  }
  posts: SocialPost[]
}

type OAuthProvider = {
  id: string
  name: string
  purpose: string
  status: string
  publish_allowed: boolean
  required_env_present: string[]
  optional_env_present: string[]
  local_artifacts: Array<{ file: string; status: string; redirect_uri_count?: number }>
  next_action: string
  safety_gate: string
}

type OAuthReadiness = {
  status: string
  generated_at: string
  public_publish_allowed: boolean
  metrics: {
    provider_count: number
    ready_for_private_test: number
    local_material_present: number
    missing_setup: number
  }
  providers: OAuthProvider[]
  operator_checklist: string[]
}

function compactDate(value?: string) {
  if (!value) return 'Not scheduled'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function statusLabel(value?: string) {
  return String(value || 'draft')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function metric(value?: number) {
  return Number(value || 0).toLocaleString()
}

function postPreview(post?: SocialPost | null) {
  if (!post) return 'No post selected.'
  return post.post_text.length > 420 ? `${post.post_text.slice(0, 420).trimEnd()}...` : post.post_text
}

function nextPost(posts: SocialPost[]) {
  return posts.find((post) => !post.posted_url && post.status.includes('review')) ?? posts[0] ?? null
}

export function GrowthCommandPage() {
  const [queue, setQueue] = useState<SocialQueue | null>(null)
  const [oauth, setOauth] = useState<OAuthReadiness | null>(null)
  const [selectedPostId, setSelectedPostId] = useState('')
  const [copied, setCopied] = useState('')

  useEffect(() => {
    let cancelled = false

    async function load() {
      const [queueResponse, oauthResponse] = await Promise.all([
        fetch('/site/social-post-queue.json', { cache: 'no-store' }).catch(() => null),
        fetch('/site/social-oauth-readiness.json', { cache: 'no-store' }).catch(() => null),
      ])
      if (cancelled) return
      if (queueResponse?.ok) {
        const payload = (await queueResponse.json()) as SocialQueue
        setQueue(payload)
        setSelectedPostId((current) => current || nextPost(payload.posts)?.id || '')
      }
      if (oauthResponse?.ok) {
        setOauth((await oauthResponse.json()) as OAuthReadiness)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const posts = queue?.posts ?? []
  const selectedPost = posts.find((post) => post.id === selectedPostId) ?? nextPost(posts)
  const linkedInPosts = posts.filter((post) => post.channel.toLowerCase() === 'linkedin')
  const facebookPosts = posts.filter((post) => post.channel.toLowerCase() === 'facebook')
  const blockedProviders = (oauth?.providers ?? []).filter((provider) => !provider.publish_allowed)
  const readyProviders = (oauth?.providers ?? []).filter((provider) => provider.publish_allowed)
  const approvalRows = [
    {
      label: 'Draft',
      detail: 'The system prepares the post, asset, offer, CTA, and campaign hypothesis.',
      status: posts.length ? 'ready' : 'waiting',
    },
    {
      label: 'Review',
      detail: 'Founder edits the post, checks claims, and confirms the account identity.',
      status: queue?.review_required ? 'required' : 'ready',
    },
    {
      label: 'Publish',
      detail: 'Manual or connector publish only after provider scope, account, and audit row are verified.',
      status: oauth?.public_publish_allowed ? 'enabled' : 'blocked',
    },
    {
      label: 'Learn',
      detail: 'Posted URL, replies, and leads return to the growth ledger.',
      status: 'manual entry',
    },
  ]

  async function copySelectedPost() {
    if (!selectedPost) return
    await navigator.clipboard.writeText(`${selectedPost.post_text}\n\n${selectedPost.cta}`.trim())
    setCopied(selectedPost.id)
    window.setTimeout(() => setCopied(''), 1800)
  }

  return (
    <div className="min-h-screen bg-[var(--sm-page-bg)] px-4 py-8 text-[var(--sm-ink)] lg:px-8">
      <section className="sm-site-hero mx-auto max-w-7xl">
        <div>
          <p className="sm-kicker text-[var(--sm-accent)]">Growth command</p>
          <h1 className="mt-3 text-4xl font-black tracking-tight text-white md:text-6xl">Marketing workbench, human approval.</h1>
          <p className="mt-5 max-w-3xl text-lg leading-8 text-[var(--sm-muted)]">
            Drafts, connector status, approval gates, and learning loops in one place. Posting stays gated until the account identity,
            provider scope, and audit trail are verified.
          </p>
        </div>
        <div className="sm-hero-card">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Next action</p>
          <h2 className="mt-2 text-2xl font-black text-white">{selectedPost ? `${selectedPost.channel}: ${selectedPost.offer}` : 'Load queue'}</h2>
          <p className="mt-3 text-sm leading-6 text-[var(--sm-muted)]">{selectedPost?.next_action || 'Generate the social queue before publishing.'}</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <button className="sm-button-primary" disabled={!selectedPost} onClick={() => void copySelectedPost()} type="button">
              {copied ? 'Copied' : 'Copy post'}
            </button>
            <Link className="sm-button-secondary" to="/app/revenue/pipeline">
              Open pipeline
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto mt-8 grid max-w-7xl gap-4 md:grid-cols-4">
        {[
          ['Posts', metric(queue?.metrics?.post_count)],
          ['Outreach drafts', metric(queue?.metrics?.outreach_draft_count)],
          ['Review gates', metric(queue?.metrics?.review_required_count)],
          ['Publish connectors', `${readyProviders.length}/${oauth?.metrics?.provider_count ?? 0}`],
        ].map(([label, value]) => (
          <article className="sm-surface p-5" key={label}>
            <p className="sm-kicker text-[var(--sm-accent)]">{label}</p>
            <strong className="mt-2 block text-3xl font-black text-[var(--sm-ink)]">{value}</strong>
          </article>
        ))}
      </section>

      <section className="mx-auto mt-8 grid max-w-7xl gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <article className="sm-site-panel">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Social queue</p>
              <h2 className="mt-2 text-3xl font-black text-white">Scheduled drafts.</h2>
            </div>
            <div className="flex gap-2">
              <span className="sm-status-pill">LinkedIn {linkedInPosts.length}</span>
              <span className="sm-status-pill">Facebook {facebookPosts.length}</span>
            </div>
          </div>
          <div className="mt-6 grid gap-3">
            {posts.slice(0, 8).map((post) => (
              <button
                className={`sm-proof-card text-left ${selectedPost?.id === post.id ? 'ring-2 ring-[var(--sm-accent)]' : ''}`}
                key={post.id}
                onClick={() => setSelectedPostId(post.id)}
                type="button"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-white">{post.offer}</p>
                    <p className="mt-1 text-sm text-[var(--sm-muted)]">
                      {post.channel} / {compactDate(post.date)} / {post.campaign}
                    </p>
                  </div>
                  <span className="sm-status-pill">{statusLabel(post.status)}</span>
                </div>
              </button>
            ))}
            {!posts.length ? <div className="sm-chip text-white">No social queue loaded yet.</div> : null}
          </div>
        </article>

        <article className="sm-site-panel">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Selected draft</p>
          <h2 className="mt-2 text-3xl font-black text-white">{selectedPost?.offer || 'No post selected'}</h2>
          <pre className="mt-5 max-h-[28rem] overflow-auto whitespace-pre-wrap rounded-3xl border border-white/10 bg-black/20 p-5 text-sm leading-7 text-[var(--sm-muted)]">
            {postPreview(selectedPost)}
          </pre>
          <div className="mt-5 grid gap-3">
            <a className="sm-button-secondary" href={selectedPost?.asset || '/social/campaign/one-workflow.png'} rel="noreferrer" target="_blank">
              Open asset
            </a>
            <Link className="sm-button-secondary" to="/app/revenue/offers">
              Review offer
            </Link>
          </div>
        </article>
      </section>

      <section className="mx-auto mt-8 grid max-w-7xl gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <article className="sm-site-panel">
          <p className="sm-kicker text-[var(--sm-accent)]">Connector readiness</p>
          <h2 className="mt-2 text-3xl font-black text-white">Do not publish blind.</h2>
          <div className="mt-6 grid gap-3">
            {(oauth?.providers ?? []).map((provider) => (
              <div className="sm-proof-card" key={provider.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-white">{provider.name}</p>
                    <p className="mt-2 text-sm leading-6 text-[var(--sm-muted)]">{provider.purpose}</p>
                  </div>
                  <span className="sm-status-pill">{provider.publish_allowed ? 'publish enabled' : statusLabel(provider.status)}</span>
                </div>
                <p className="mt-3 text-xs uppercase tracking-[0.16em] text-[var(--sm-muted)]">{provider.next_action}</p>
              </div>
            ))}
            {!oauth ? <div className="sm-chip text-white">OAuth readiness not loaded.</div> : null}
          </div>
        </article>

        <article className="sm-site-panel">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Approval loop</p>
          <h2 className="mt-2 text-3xl font-black text-white">How this becomes autonomous safely.</h2>
          <div className="mt-6 grid gap-3 md:grid-cols-2">
            {approvalRows.map((row) => (
              <div className="sm-proof-card" key={row.label}>
                <span className="sm-status-pill">{statusLabel(row.status)}</span>
                <h3 className="mt-4 text-lg font-semibold text-white">{row.label}</h3>
                <p className="mt-2 text-sm leading-6 text-[var(--sm-muted)]">{row.detail}</p>
              </div>
            ))}
          </div>
          <div className="mt-6 rounded-3xl border border-white/10 bg-white/5 p-5">
            <p className="sm-kicker text-[var(--sm-accent)]">Blocked until verified</p>
            <p className="mt-2 text-sm leading-6 text-[var(--sm-muted)]">
              {blockedProviders.length
                ? `${blockedProviders.map((provider) => provider.name).join(', ')} still require token, scope, account identity, approval record, and audit row.`
                : 'All providers are publish-enabled.'}
            </p>
          </div>
        </article>
      </section>
    </div>
  )
}
