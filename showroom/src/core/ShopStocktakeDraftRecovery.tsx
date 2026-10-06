import { useEffect, useRef, useState } from 'react'
import type { StockCountDraft } from './CoreApp'

type Snapshot = { current: StockCountDraft | null; lines: StockCountDraft[] }
type Status = 'saved' | 'saving' | 'unavailable' | 'idle'

function isDraft(value: unknown): value is StockCountDraft {
  if (!value || typeof value !== 'object') return false
  const draft = value as Partial<StockCountDraft>
  return typeof draft.sku === 'string' && draft.sku.length <= 120
    && typeof draft.stockUnitId === 'string' && draft.stockUnitId.length <= 180
    && typeof draft.locationId === 'string' && draft.locationId.length <= 180
    && typeof draft.quantity === 'string' && /^\d{0,16}$/.test(draft.quantity)
    && Number.isSafeInteger(draft.expectedOnHand) && (draft.expectedOnHand ?? -1) >= 0
    && Number.isSafeInteger(draft.expectedPhysicalQuantity) && (draft.expectedPhysicalQuantity ?? -1) >= 0
    && (draft.expectedHeadDigest === null || (typeof draft.expectedHeadDigest === 'string' && draft.expectedHeadDigest.length <= 100))
}

function parseSnapshot(raw: string | null): Snapshot | null {
  if (!raw) return { current: null, lines: [] }
  try {
    const value = JSON.parse(raw) as { version?: unknown; current?: unknown; lines?: unknown }
    if (value.version !== 1 || !Array.isArray(value.lines) || value.lines.length > 200
      || (value.current !== null && !isDraft(value.current)) || !value.lines.every(isDraft)) return null
    return { current: value.current as StockCountDraft | null, lines: value.lines as StockCountDraft[] }
  } catch { return null }
}

export function ShopStocktakeDraftRecovery({ scopeKey, current, lines, active, setCurrent, setLines, onReady }: {
  scopeKey: string
  current: StockCountDraft | null
  lines: StockCountDraft[]
  active: boolean
  setCurrent: (draft: StockCountDraft | null) => void
  setLines: (drafts: StockCountDraft[]) => void
  onReady: (ready: boolean) => void
}) {
  const [hydrated, setHydrated] = useState(false)
  const invalidStoredDraft = useRef(false)
  const [status, setStatus] = useState<Status>('idle')
  const storageKey = `supermega.shop.stocktake.draft.v1:${scopeKey}`

  useEffect(() => {
    setHydrated(false)
    invalidStoredDraft.current = false
    if (scopeKey === 'checking') {
      setStatus('idle')
      setHydrated(true)
      onReady(true)
      return
    }
    let raw: string | null = null
    let storageAvailable = true
    try { raw = sessionStorage.getItem(storageKey) } catch { storageAvailable = false }
    const snapshot = storageAvailable ? parseSnapshot(raw) : null
    if (!snapshot) {
      invalidStoredDraft.current = true
      setStatus('unavailable')
    } else {
      setCurrent(snapshot.current)
      setLines(snapshot.lines)
      setStatus(raw ? 'saved' : 'idle')
    }
    setHydrated(true)
    onReady(true)
  }, [storageKey, setCurrent, setLines, onReady])

  useEffect(() => {
    if (!hydrated) return
    if (scopeKey === 'checking') return
    const hasDraft = Boolean(current?.quantity.trim() || lines.length)
    if (!hasDraft && invalidStoredDraft.current) return
    if (!hasDraft) {
      try { sessionStorage.removeItem(storageKey); setStatus('idle') } catch { setStatus('unavailable') }
      return
    }
    setStatus('saving')
    try {
      const snapshot = { version: 1, current, lines }
      sessionStorage.setItem(storageKey, JSON.stringify(snapshot))
      const saved = parseSnapshot(sessionStorage.getItem(storageKey))
      const matches = saved !== null && JSON.stringify(saved) === JSON.stringify({ current, lines })
      setStatus(matches ? 'saved' : 'unavailable')
      if (matches) invalidStoredDraft.current = false
    } catch { setStatus('unavailable') }
  }, [hydrated, scopeKey, storageKey, current, lines])

  if (!active || status === 'idle') return null
  const copy = status === 'saved' ? 'Draft saved in this tab. Stock changes after review.'
    : status === 'saving' ? 'Saving this count draft…'
      : 'Draft recovery is unavailable. Keep this page open until review.'
  return <p aria-live="polite" className="form-notice" data-stocktake-draft={status}>{copy}</p>
}
