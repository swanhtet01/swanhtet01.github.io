import { useEffect, useRef, useState } from 'react'
import type { StockCountDraft } from './CoreApp'
import { clearShopStocktakeDraft, persistShopStocktakeDraft, readShopStocktakeDraft, shopStocktakeDraftKey, shopStocktakeDraftRecovery, type ShopStocktakeStorage } from './shop-stocktake-draft-store'
type Status = 'saved' | 'saving' | 'unavailable' | 'idle'

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
  const storageKey = shopStocktakeDraftKey(scopeKey)

  useEffect(() => {
    setHydrated(false)
    invalidStoredDraft.current = false
    if (scopeKey === 'checking') {
      setStatus('idle')
      setHydrated(true)
      onReady(true)
      return
    }
    let storage: ShopStocktakeStorage | null = null
    try { storage = sessionStorage } catch { /* Recovery remains unavailable. */ }
    const recovery = shopStocktakeDraftRecovery(readShopStocktakeDraft(storage, storageKey))
    setCurrent(recovery.status === 'saved' ? recovery.snapshot.current : null)
    setLines(recovery.status === 'saved' ? recovery.snapshot.lines : [])
    invalidStoredDraft.current = recovery.status === 'unavailable'
    setStatus(recovery.status)
    setHydrated(true)
    onReady(true)
  }, [storageKey, setCurrent, setLines, onReady])

  useEffect(() => {
    if (!hydrated) return
    if (scopeKey === 'checking') return
    const hasDraft = Boolean(current?.quantity.trim() || lines.length)
    if (!hasDraft && invalidStoredDraft.current) return
    if (!hasDraft) {
      let storage: ShopStocktakeStorage | null = null
      try { storage = sessionStorage } catch { /* Storage is unavailable. */ }
      setStatus(clearShopStocktakeDraft(storage, storageKey) ? 'idle' : 'unavailable')
      return
    }
    setStatus('saving')
    let storage: ShopStocktakeStorage | null = null
    try { storage = sessionStorage } catch { /* Storage is unavailable. */ }
    const saved = persistShopStocktakeDraft(storage, storageKey, { current, lines })
    setStatus(saved ? 'saved' : 'unavailable')
    if (saved) invalidStoredDraft.current = false
  }, [hydrated, scopeKey, storageKey, current, lines])

  if (!active || status === 'idle') return null
  const copy = status === 'saved' ? 'Draft saved in this tab. Stock changes after review.'
    : status === 'saving' ? 'Saving this count draft…'
      : 'Draft recovery is unavailable. Keep this page open until review.'
  return <p aria-live="polite" className="form-notice" data-stocktake-draft={status}>{copy}</p>
}
