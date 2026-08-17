// Client error lane on the existing no-PII beacon (Observability rec 2 in
// hq/strategy/ENTERPRISE-READINESS-SCORECARD.md: error lane on the beacon, not Sentry).
//
// Two window listeners ('error', 'unhandledrejection') classify each failure into a
// closed error-class enum, hash the message text one-way (FNV-1a, 8 hex chars -- the
// raw text never leaves the device), and hand a flat, bounded event to the same
// hostname-gated Vercel Web Analytics script beacon that showroom/index.html already
// loads (/_vercel/insights/script.js). Custom events ride the documented plain-script
// queue: window.va is stubbed to push argument arrays into window.vaq, and the
// insights script drains the queue when it arrives -- the same shape the official
// @vercel/analytics inject() writes, so load order does not matter.
//
// Degradation is fail-open at every rail:
//  - Non-production hostname: main.tsx never installs the listeners (isBeaconHost).
//  - Insights script blocked or absent: at most MAX_REPORTS_PER_SESSION tiny entries
//    sit in the in-memory window.vaq queue and nothing is sent. No retry, no storage.
//  - /__release.json unreachable: the event still sends with commit 'unknown'.
//  - Vercel plan without custom events: the edge drops the event server-side; the
//    page never knows and never cares.
//  - An error inside the reporter itself is swallowed; the lane can never add a
//    second failure to the page it is observing.
//
// PII rule (same architecture as hq/research/analytics-design-2026-08.md section 6):
// exclusion is structural, not scrubbed. The event payload has exactly four fields --
// an enum member from ERROR_CLASSES, a one-way message hash, a coarse surface label
// from the metrics-collector SURFACE_MAP (never the raw URL, hash, or query), and the
// build commit from /__release.json. No stack frames, no free text, no identifiers.

import { surfaceFromHash } from '../analytics/metrics-collector'

declare global {
  interface Window {
    va?: (event: string, properties?: unknown) => void
    vaq?: unknown[][]
  }
}

// Exported so a test or reviewer can assert the closed allowlist directly: nothing
// outside this list can ever appear in an outbound event's class field.
export const ERROR_CLASSES = [
  'chunk_load', // stale deploy or dropped request on a lazy route chunk
  'network_fetch', // fetch/XHR-shaped TypeError
  'quota_exceeded', // storage quota (localStorage-heavy app, worth its own bucket)
  'security', // SecurityError DOMException
  'type',
  'reference',
  'range',
  'syntax',
  'uri',
  'dom', // any other DOMException
  'generic_error', // an Error subclass not covered above
  'opaque', // cross-origin "Script error." with all detail masked by the browser
  'non_error', // a thrown/rejected value that is not an Error at all
  'unknown',
] as const

export type ClientErrorClass = (typeof ERROR_CLASSES)[number]

export type ClientErrorEvent = {
  class: ClientErrorClass
  hash: string
  route: string
  commit: string
}

// Mirrors CHUNK_FAILURE in RouteErrorBoundary.tsx: webpack, Chrome, Firefox and
// Safari dynamic-import rejections plus Vite's own CSS preload wording.
const CHUNK_FAILURE = /ChunkLoadError|Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS/i

const MAX_REPORTS_PER_SESSION = 5

// Identical expression to the beacon loader gate in showroom/index.html. The error
// lane exists only where the beacon exists, so local, dev and preview hosts never
// install the listeners and never emit anything.
export function isBeaconHost(hostname: string = window.location.hostname): boolean {
  return /(^|\.)supermega\.dev$/.test(hostname)
}

export function classifyError(candidate: unknown, fallbackMessage: string): ClientErrorClass {
  const name = candidate instanceof Error ? candidate.name : ''
  const message = candidate instanceof Error ? candidate.message : fallbackMessage
  if (CHUNK_FAILURE.test(`${name} ${message}`)) return 'chunk_load'
  if (/^Script error\.?$/.test(message.trim())) return 'opaque'
  if (candidate instanceof Error) {
    if (name === 'TypeError' && /fetch|network|load failed/i.test(message)) return 'network_fetch'
    if (name === 'QuotaExceededError') return 'quota_exceeded'
    if (name === 'SecurityError') return 'security'
    if (name === 'TypeError') return 'type'
    if (name === 'ReferenceError') return 'reference'
    if (name === 'RangeError') return 'range'
    if (name === 'SyntaxError') return 'syntax'
    if (name === 'URIError') return 'uri'
    if (typeof DOMException !== 'undefined' && candidate instanceof DOMException) return 'dom'
    return 'generic_error'
  }
  if (candidate !== undefined && candidate !== null) return 'non_error'
  return fallbackMessage ? 'non_error' : 'unknown'
}

// FNV-1a 32-bit. A dedupe key, not a fingerprint: one-way, fixed width, and the
// input text is discarded immediately after hashing.
export function hashErrorMessage(text: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

// Coarse surface label only ('shop.orders', 'hq.home', ...). The raw location hash
// can carry record ids and query params, so it is resolved through the same closed
// SURFACE_MAP the metrics collector uses and anything unmapped becomes 'other'.
function currentRouteLabel(): string {
  const resolved = surfaceFromHash()
  return resolved ? `${resolved.product}.${resolved.surface}` : 'other'
}

// The build commit lives in /__release.json (written by write_app_release_metadata.mjs
// and precached by the service worker), not in the bundle. Fetched lazily on the first
// error, once per session, and never allowed to reject.
let commitPromise: Promise<string> | null = null
function releaseCommit(): Promise<string> {
  commitPromise ??= fetch('/__release.json')
    .then((response) => (response.ok ? (response.json() as Promise<{ commit?: unknown }>) : null))
    .then((release) => {
      const commit = typeof release?.commit === 'string' ? release.commit.trim() : ''
      return commit ? commit.slice(0, 12) : 'unknown'
    })
    .catch(() => 'unknown')
  return commitPromise
}

// The documented plain-script custom-event bridge: identical queue shape to the
// official @vercel/analytics inject() stub. If the insights script loaded first,
// window.va already exists and this is a no-op; if it loads later, it drains vaq.
function ensureBeaconQueue(): void {
  if (window.va) return
  window.va = (...args: unknown[]) => {
    window.vaq = window.vaq ?? []
    window.vaq.push(args)
  }
}

let reportsSent = 0
const reportedKeys = new Set<string>()
const sessionReports: ClientErrorEvent[] = []

// Exported so RouteErrorBoundary can report a caught render crash directly.
// React's componentDidCatch does NOT propagate to window.onerror or
// unhandledrejection, so the two listeners below never see a route crash on
// their own -- calling report() from the boundary is the only way that class
// of failure (the stale-deploy chunk load this reporter exists for) ever
// reaches the beacon. Same dedupe/rate-limit/fail-open guarantees either way.
export function report(candidate: unknown, fallbackMessage: string): void {
  try {
    if (reportsSent >= MAX_REPORTS_PER_SESSION) return
    const errorClass = classifyError(candidate, fallbackMessage)
    const messageText = candidate instanceof Error ? candidate.message : fallbackMessage
    const hash = hashErrorMessage(messageText)
    const key = `${errorClass}:${hash}`
    // A render loop rethrowing one error must not burn the whole session budget.
    if (reportedKeys.has(key)) return
    reportedKeys.add(key)
    reportsSent += 1
    const route = currentRouteLabel()
    ensureBeaconQueue()
    void releaseCommit().then((commit) => {
      const event: ClientErrorEvent = { class: errorClass, hash, route, commit }
      sessionReports.push(event)
      window.va?.('event', { name: 'client_error', data: event })
    })
  } catch {
    // The error lane must never throw an error of its own into the page.
  }
}

// In-memory record of what this session actually reported (already PII-free by
// construction). Mirrors getSessionEvents() in the metrics collector: inspectable
// from the console or a future diagnostics surface, gone when the tab closes.
export function getReportedErrors(): readonly ClientErrorEvent[] {
  return sessionReports
}

export function startClientErrorReporter(): void {
  window.addEventListener('error', (event) => {
    report(event.error, typeof event.message === 'string' ? event.message : '')
  })
  window.addEventListener('unhandledrejection', (event) => {
    const reason: unknown = event.reason
    report(reason, typeof reason === 'string' ? reason : '')
  })
}
