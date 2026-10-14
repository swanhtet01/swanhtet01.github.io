import { useEffect, useState } from 'react'

import { getProductImage, subscribeProductImages } from './product-image-store'
import { loadManagedProductPhoto, subscribeManagedProductPhotos } from './shop-managed-media-client'

/**
 * The current photo for a SKU as an object URL, or null. Scope is required (see
 * product-image-store.ts's workspace-scope note — an unscoped lookup surfaces
 * another company's photo for a colliding SKU): pass
 * `productImageScopeForWorkspace(workspaceId)`. Revokes each URL when it is
 * replaced or the consumer unmounts, and refreshes when any control in this tab
 * stores or removes this scope+SKU's photo. Lives apart from ProductPhoto.tsx
 * so that file exports only components (react-refresh contract).
 */
export function useProductImageState(scope: string, sku: string): { url: string | null; issue: string | null } {
  const [state, setState] = useState<{ scope: string; sku: string; url: string | null; issue: string | null }>(
    { scope, sku, url: null, issue: null },
  )
  useEffect(() => {
    let active = true
    let objectUrl: string | null = null
    let controller: AbortController | null = null
    const managed = scope.startsWith('managed:')
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
      controller?.abort()
      controller = new AbortController()
      const photo = managed
        ? loadManagedProductPhoto(scope, sku, controller.signal)
        : getProductImage(scope, sku).then((record) => record?.blob ?? null)
      photo.then((blob) => {
        if (!active || sequence !== latest) return
        release()
        objectUrl = blob ? URL.createObjectURL(blob) : null
        setState({ scope, sku, url: objectUrl, issue: null })
      }).catch((error) => {
        if (!active || sequence !== latest) return
        release()
        setState({ scope, sku, url: null, issue: managed
          ? error instanceof Error && error.message ? error.message : 'Shared product photos are unavailable.'
          : null })
      })
    }
    load()
    const subscribe = managed ? subscribeManagedProductPhotos : subscribeProductImages
    const unsubscribe = subscribe((changedScope, changedSku) => {
      if (changedScope === scope && changedSku === sku) load()
    })
    const reloadWhenVisible = () => { if (!document.hidden) load() }
    if (managed) document.addEventListener('visibilitychange', reloadWhenVisible)
    return () => {
      active = false
      controller?.abort()
      unsubscribe()
      if (managed) document.removeEventListener('visibilitychange', reloadWhenVisible)
      release()
    }
  }, [scope, sku])
  return state.scope === scope && state.sku === sku
    ? { url: state.url, issue: state.issue }
    : { url: null, issue: null }
}

export function useProductImageUrl(scope: string, sku: string): string | null {
  return useProductImageState(scope, sku).url
}
