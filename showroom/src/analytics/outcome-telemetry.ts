import { emitMetric, type MetricProduct } from './metrics-collector'

// Optional production visibility for the already-local outcome-proof contract.
//
// The device-local MetricEvent remains the source of truth. This bridge only gives the owner a
// coarse funnel count on the existing Vercel Web Analytics surface. Vercel custom events are
// plan-dependent, so queueing an event never proves that the provider accepted or retained it.
// A commit-bound production operations receipt must establish that separately.

declare global {
  interface Window {
    va?: (event: string, properties?: unknown) => void
    vaq?: unknown[][]
  }
}

export const OUTCOME_TELEMETRY_EVENT_NAME = 'supermega_local_outcome' as const
export const OUTCOME_TELEMETRY_REDACTED_PATH = '/__telemetry/local-outcome' as const
export const OUTCOME_TELEMETRY_STAGES = [
  'workflow_started',
  'workflow_completed',
  'proof_accepted',
  'action_closed',
  'result_reviewed',
] as const
export const OUTCOME_TELEMETRY_MAX_PER_SESSION = 20
const OUTCOME_TELEMETRY_MAX_RECEIPTS_PER_SESSION = 100

const PILOT_PRODUCT_MAP = {
  commerce: 'shop',
  production: 'plant',
  website: 'website',
  ecommerce: 'ecommerce',
} as const satisfies Record<string, Exclude<MetricProduct, 'hq'>>

const OUTCOME_TELEMETRY_SESSION_SCHEMA = 'supermega.outcome-telemetry.session.v2'
const OUTCOME_TELEMETRY_SESSION_KEY = OUTCOME_TELEMETRY_SESSION_SCHEMA
const OUTCOME_TELEMETRY_LEGACY_SESSION_KEY = 'supermega.outcome-telemetry.sent.v1'
const RECEIPT_DIGEST = /^sha256:[a-f0-9]{64}$/
const memoryReceipts = new Set<string>()
let sessionStateLoaded = false
let memoryOutboundQueued = 0
let sessionStorageAvailable = true
let vercelPrivacyBoundaryConfigured = false

type OutcomeTelemetrySessionState = {
  receipts: Set<string>
  outboundQueued: number
  storageAvailable: boolean
}

type VercelBeforeSendEvent = {
  type: 'pageview' | 'event'
  url: string
}

export type PilotOutcomeProduct = keyof typeof PILOT_PRODUCT_MAP
export type OutcomeTelemetryStage = (typeof OUTCOME_TELEMETRY_STAGES)[number]

export type OutcomeTelemetryTransition = {
  pilotProduct: PilotOutcomeProduct
  stage: OutcomeTelemetryStage
  evidenceDigest: string
}

export type OutcomeTelemetryResult = {
  handled: boolean
  localDispatched: boolean
  outboundQueued: boolean
  reason: 'queued' | 'non_production' | 'duplicate' | 'session_cap' | 'invalid' | 'unavailable'
}

export function validOutcomeTelemetryTransition(value: unknown): value is OutcomeTelemetryTransition {
  if (!value || typeof value !== 'object') return false
  const transition = value as Partial<OutcomeTelemetryTransition>
  if (typeof transition.pilotProduct !== 'string'
    || !Object.prototype.hasOwnProperty.call(PILOT_PRODUCT_MAP, transition.pilotProduct)) return false
  if (!OUTCOME_TELEMETRY_STAGES.includes(transition.stage as OutcomeTelemetryStage)) return false
  if (typeof transition.evidenceDigest !== 'string' || !RECEIPT_DIGEST.test(transition.evidenceDigest)) return false
  const keys = Object.keys(transition)
  return keys.length === 3
    && keys.every((key) => key === 'pilotProduct' || key === 'stage' || key === 'evidenceDigest')
}

export function isOutcomeTelemetryHost(hostname: string): boolean {
  return /(^|\.)supermega\.dev$/.test(hostname)
}

function receiptKey(transition: OutcomeTelemetryTransition): string {
  return `${PILOT_PRODUCT_MAP[transition.pilotProduct]}:${transition.stage}:${transition.evidenceDigest}`
}

function addStoredReceipts(values: unknown[]): void {
  for (const value of values.slice(-OUTCOME_TELEMETRY_MAX_RECEIPTS_PER_SESSION)) {
    if (typeof value === 'string' && value.length <= 120) memoryReceipts.add(value)
  }
}

function readSessionState(target: Window): OutcomeTelemetrySessionState {
  if (!sessionStateLoaded) {
    sessionStateLoaded = true
    try {
      const raw = target.sessionStorage.getItem(OUTCOME_TELEMETRY_SESSION_KEY)
      if (raw) {
        const parsed: unknown = JSON.parse(raw)
        if (parsed && typeof parsed === 'object') {
          const candidate = parsed as Partial<{ schema: string, receipts: unknown, outboundQueued: unknown }>
          if (candidate.schema === OUTCOME_TELEMETRY_SESSION_SCHEMA && Array.isArray(candidate.receipts)) {
            addStoredReceipts(candidate.receipts)
            memoryOutboundQueued = Number.isInteger(candidate.outboundQueued)
              && Number(candidate.outboundQueued) >= 0
              && Number(candidate.outboundQueued) <= OUTCOME_TELEMETRY_MAX_PER_SESSION
              ? Number(candidate.outboundQueued)
              : OUTCOME_TELEMETRY_MAX_PER_SESSION
          }
        }
      } else {
        const legacyRaw = target.sessionStorage.getItem(OUTCOME_TELEMETRY_LEGACY_SESSION_KEY)
        const legacyParsed: unknown = legacyRaw ? JSON.parse(legacyRaw) : []
        if (Array.isArray(legacyParsed)) addStoredReceipts(legacyParsed)
      }
    } catch {
      // If session storage is unavailable, keep local evidence working but fail closed on the
      // optional outbound lane: a reload-safe per-session cap could not be guaranteed.
      sessionStorageAvailable = false
    }
  }
  return {
    receipts: new Set(memoryReceipts),
    outboundQueued: memoryOutboundQueued,
    storageAvailable: sessionStorageAvailable,
  }
}

function persistSessionState(target: Window, state: OutcomeTelemetrySessionState): boolean {
  if (!state.storageAvailable) return false
  try {
    target.sessionStorage.setItem(
      OUTCOME_TELEMETRY_SESSION_KEY,
      JSON.stringify({
        schema: OUTCOME_TELEMETRY_SESSION_SCHEMA,
        receipts: [...state.receipts],
        outboundQueued: state.outboundQueued,
      }),
    )
    return true
  } catch {
    sessionStorageAvailable = false
    state.storageAvailable = false
    return false
  }
}

function rememberReceipt(target: Window, key: string, state: OutcomeTelemetrySessionState): void {
  state.receipts.add(key)
  memoryReceipts.add(key)
  while (state.receipts.size > OUTCOME_TELEMETRY_MAX_RECEIPTS_PER_SESSION) state.receipts.delete(state.receipts.values().next().value as string)
  while (memoryReceipts.size > OUTCOME_TELEMETRY_MAX_RECEIPTS_PER_SESSION) memoryReceipts.delete(memoryReceipts.values().next().value as string)
  persistSessionState(target, state)
}

function reserveOutboundSlot(target: Window, state: OutcomeTelemetrySessionState): boolean {
  if (!state.storageAvailable || state.outboundQueued >= OUTCOME_TELEMETRY_MAX_PER_SESSION) return false
  state.outboundQueued += 1
  memoryOutboundQueued = state.outboundQueued
  return persistSessionState(target, state)
}

function ensureVercelQueue(target: Window): void {
  if (target.va) return
  target.va = (...args: unknown[]) => {
    target.vaq = target.vaq ?? []
    target.vaq.push(args)
  }
}

function configureVercelPrivacyBoundary(target: Window): void {
  if (vercelPrivacyBoundaryConfigured) return
  ensureVercelQueue(target)
  const redactedUrl = `https://${target.location.hostname}${OUTCOME_TELEMETRY_REDACTED_PATH}`
  const beforeSend = (value: unknown): VercelBeforeSendEvent | null => {
    if (!value || typeof value !== 'object') return null
    const event = value as Partial<VercelBeforeSendEvent>
    if ((event.type !== 'pageview' && event.type !== 'event') || typeof event.url !== 'string') return null
    if (event.type === 'pageview') return { type: 'pageview', url: event.url }
    // Vercel's documented beforeSend event exposes only type and URL. Every custom event after
    // this boundary uses one coarse URL, so the source route, query, and hash do not leave through
    // that field. Provider-generated time/session/device/referrer metadata remains provider-owned.
    return { type: 'event', url: redactedUrl }
  }
  target.va?.('beforeSend', beforeSend)
  vercelPrivacyBoundaryConfigured = true
}

export function emitOutcomeTelemetry(transition: OutcomeTelemetryTransition): OutcomeTelemetryResult {
  try {
    if (!validOutcomeTelemetryTransition(transition) || typeof window === 'undefined') {
      return { handled: false, localDispatched: false, outboundQueued: false, reason: 'invalid' }
    }

    const target = window
    const key = receiptKey(transition)
    const sessionState = readSessionState(target)
    if (sessionState.receipts.has(key)) {
      return { handled: false, localDispatched: false, outboundQueued: false, reason: 'duplicate' }
    }
    rememberReceipt(target, key, sessionState)

    const product = PILOT_PRODUCT_MAP[transition.pilotProduct]
    let localDispatched = false
    try {
      emitMetric({
        product,
        capability: 'outcome-proof',
        action: `outcome.${transition.stage}`,
        ts: Date.now(),
      })
      localDispatched = true
    } catch {
      // The optional metric cannot change the outcome transition that already committed.
    }

    if (!isOutcomeTelemetryHost(target.location.hostname)) {
      return { handled: true, localDispatched, outboundQueued: false, reason: 'non_production' }
    }
    if (sessionState.outboundQueued >= OUTCOME_TELEMETRY_MAX_PER_SESSION) {
      return { handled: true, localDispatched, outboundQueued: false, reason: 'session_cap' }
    }
    if (!reserveOutboundSlot(target, sessionState)) {
      return { handled: true, localDispatched, outboundQueued: false, reason: 'unavailable' }
    }

    // Exactly two low-cardinality primitive data properties. The evidence digest is used only
    // for local session deduplication and is deliberately absent from the provider payload.
    const data = { product, stage: transition.stage } satisfies Record<string, string>
    try {
      configureVercelPrivacyBoundary(target)
      target.va?.('event', { name: OUTCOME_TELEMETRY_EVENT_NAME, data })
      return { handled: true, localDispatched, outboundQueued: true, reason: 'queued' }
    } catch {
      return { handled: true, localDispatched, outboundQueued: false, reason: 'unavailable' }
    }
  } catch {
    return { handled: false, localDispatched: false, outboundQueued: false, reason: 'unavailable' }
  }
}
