import { useEffect, useState } from 'react'

import { getProductImage, subscribeProductImages } from './product-image-store'

/**
 * The current photo for a SKU as an object URL, or null. Scope is required (see
 * product-image-store.ts's workspace-scope note — an unscoped lookup surfaces
 * another company's photo for a colliding SKU): pass
 * `productImageScopeForWorkspace(workspaceId)`. Revokes each URL when it is
 * replaced or the consumer unmounts, and refreshes when any control in this tab
 * stores or removes this scope+SKU's photo. Lives apart from ProductPhoto.tsx
 * so that file exports only components (react-refresh contract).
 */
export function useProductImageUrl(scope: string, sku: string): string | null {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    let objectUrl: string | null = null
    // Each load() is an independent IndexedDB read on its own connection, so two
    // in flight have no ordering guarantee. Replacing a photo twice quickly fires
    // two change notifications and therefore two concurrent loads within ONE
    // effect instance (`active` is true for both, so neither is discarded); if
    // the first resolved last it revoked the URL the second had just rendered
    // and installed the older blob, leaving the stale photo on screen until
    // remount. Only the newest load may touch the state.
    let latest = 0
    function release() {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl)
        objectUrl = null
      }
    }
    function load() {
      latest += 1
      const sequence = latest
      getProductImage(scope, sku).then((record) => {
        if (!active || sequence !== latest) return
        release()
        objectUrl = record ? URL.createObjectURL(record.blob) : null
        setUrl(objectUrl)
      }).catch(() => {
        if (!active || sequence !== latest) return
        release()
        setUrl(null)
      })
    }
    load()
    const unsubscribe = subscribeProductImages((changedScope, changedSku) => {
      if (changedScope === scope && changedSku === sku) load()
    })
    return () => {
      active = false
      unsubscribe()
      release()
    }
  }, [scope, sku])
  return url
}
