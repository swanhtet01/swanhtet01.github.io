import { useEffect, useState } from 'react'
import type { StockCountDraft } from './CoreApp'
import { clearShopStocktakeDraft, persistShopStocktakeDraft, readShopStocktakeDraft, shopStocktakeDraftKey, shopStocktakeSessionStorage } from './shop-stocktake-draft-store'
type Status = 'unavailable' | 'idle'

export function ShopStocktakeDraftRecovery({ scopeKey, current, lines, active, setCurrent, setLines, onReady }: {
  scopeKey: string
  current: StockCountDraft | null
  lines: StockCountDraft[]
  active: boolean
  setCurrent: (draft: StockCountDraft | null) => void
  setLines: (drafts: StockCountDraft[]) => void
  onReady: (scopeKey: string) => void
}) {
  const [hydrated, setHydrated] = useState(false)
  const [status, setStatus] = useState<Status>('idle')
  const storageKey = shopStocktakeDraftKey(scopeKey)

  useEffect(() => {
    let cancelled = false
    const recovery = readShopStocktakeDraft(scopeKey === 'checking' ? null : shopStocktakeSessionStorage(), storageKey)
    queueMicrotask(() => {
      if (cancelled) return
      const snapshot = recovery.status === 'valid' ? recovery.snapshot : null
      setCurrent(snapshot?.current ?? null)
      setLines(snapshot?.lines ?? [])
      setHydrated(true)
      if (scopeKey !== 'checking') onReady(scopeKey)
    })
    return () => { cancelled = true }
  }, [scopeKey, storageKey, setCurrent, setLines, onReady])

  useEffect(() => {
    if (!hydrated || scopeKey === 'checking') return
    const hasDraft = Boolean(current?.quantity.trim() || lines.length)
    if (!hasDraft) {
      const nextStatus = clearShopStocktakeDraft(shopStocktakeSessionStorage(), storageKey) ? 'idle' : 'unavailable'
      queueMicrotask(() => setStatus(nextStatus))
      return
    }
    const saved = persistShopStocktakeDraft(shopStocktakeSessionStorage(), storageKey, { current, lines })
    const nextStatus = saved ? 'idle' : 'unavailable'
    queueMicrotask(() => setStatus(nextStatus))
  }, [hydrated, scopeKey, storageKey, current, lines])

  if (!active || status === 'idle') return null
  return <p aria-live="polite" className="form-notice">Draft unavailable. Keep this tab open until review.</p>
}
