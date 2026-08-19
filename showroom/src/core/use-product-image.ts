import { useEffect, useState } from 'react'

import { getProductImage, subscribeProductImages } from './product-image-store'

/**
 * The current photo for a SKU as an object URL, or null. Revokes each URL when
 * it is replaced or the consumer unmounts, and refreshes when any control in
 * this tab stores or removes the SKU's photo. Lives apart from ProductPhoto.tsx
 * so that file exports only components (react-refresh contract).
 */
export function useProductImageUrl(sku: string): string | null {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    let objectUrl: string | null = null
    function release() {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl)
        objectUrl = null
      }
    }
    function load() {
      getProductImage(sku).then((record) => {
        if (!active) return
        release()
        objectUrl = record ? URL.createObjectURL(record.blob) : null
        setUrl(objectUrl)
      }).catch(() => {
        if (!active) return
        release()
        setUrl(null)
      })
    }
    load()
    const unsubscribe = subscribeProductImages((changedSku) => {
      if (changedSku === sku) load()
    })
    return () => {
      active = false
      unsubscribe()
      release()
    }
  }, [sku])
  return url
}
