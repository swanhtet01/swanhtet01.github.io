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

const OUTCOME_TELEMETRY_SESSION_KEY = 'supermega.outcome-telemetry.sent.v1'
const RECEIPT_DIGEST = /^sha256:[a-f0-9]{64}$/
const memoryReceipts = new Set<string>()
let sessionReceiptsLoaded = false
let outboundQueued = 0

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

function readSessionReceipts(target: Window): Set<string> {
  if (!sessionReceiptsLoaded) {
    sessionReceiptsLoaded = true
    try {
      const raw = target.sessionStorage.getItem(OUTCOME_TELEMETRY_SESSION_KEY)
      const parsed: unknown = raw ? JSON.parse(raw) : []
      if (Array.isArray(parsed)) {
        for (const value of parsed.slice(-OUTCOME_TELEMETRY_MAX_RECEIPTS_PER_SESSION)) {
          if (typeof value === 'string' && value.length <= 120) memoryReceipts.add(value)
        }
      }
    } catch {
      // Private mode or blocked storage must not affect the product. The in-memory set remains.
    }
  }
  return new Set(memoryReceipts)
}

function rememberReceipt(target: Window, key: string, receipts: Set<string>): void {
  receipts.add(key)
  memoryReceipts.add(key)
  while (receipts.size > OUTCOME_TELEMETRY_MAX_RECEIPTS_PER_SESSION) receipts.delete(receipts.values().next().value as string)
  while (memoryReceipts.size > OUTCOME_TELEMETRY_MAX_RECEIPTS_PER_SESSION) memoryReceipts.delete(memoryReceipts.values().next().value as string)
  try {
    target.sessionStorage.setItem(
      OUTCOME_TELEMETRY_SESSION_KEY,
      JSON.stringify([...receipts]),
    )
  } catch {
    // Optional telemetry never blocks a Shop action.
  }
}

function ensureVercelQueue(target: Window): void {
  if (target.va) return
  target.va = (...args: unknown[]) => {
    target.vaq = target.vaq ?? []
    target.vaq.push(args)
  }
}

export function emitOutcomeTelemetry(transition: OutcomeTelemetryTransition): OutcomeTelemetryResult {
  try {
    if (!validOutcomeTelemetryTransition(transition) || typeof window === 'undefined') {
      return { handled: false, localDispatched: false, outboundQueued: false, reason: 'invalid' }
    }

    const target = window
    const key = receiptKey(transition)
    const receipts = readSessionReceipts(target)
    if (receipts.has(key)) {
      return { handled: false, localDispatched: false, outboundQueued: false, reason: 'duplicate' }
    }
    rememberReceipt(target, key, receipts)

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
    if (outboundQueued >= OUTCOME_TELEMETRY_MAX_PER_SESSION) {
      return { handled: true, localDispatched, outboundQueued: false, reason: 'session_cap' }
    }

    // Exactly two low-cardinality primitive data properties. The evidence digest is used only
    // for local session deduplication and is deliberately absent from the provider payload.
    const data = { product, stage: transition.stage } satisfies Record<string, string>
    try {
      ensureVercelQueue(target)
      target.va?.('event', { name: OUTCOME_TELEMETRY_EVENT_NAME, data })
      outboundQueued += 1
      return { handled: true, localDispatched, outboundQueued: true, reason: 'queued' }
    } catch {
      return { handled: true, localDispatched, outboundQueued: false, reason: 'unavailable' }
    }
  } catch {
    return { handled: false, localDispatched: false, outboundQueued: false, reason: 'unavailable' }
  }
}
