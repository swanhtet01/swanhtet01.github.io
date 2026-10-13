// Product photo rendering, backed by product-image-store.ts.
//
// Photos are device-local presentation data (see the architecture note in
// product-image-store.ts). Every consumer renders through these components so
// the fallback rule is uniform: no photo -> the surface's existing text or
// artwork rendering, byte-identical to before photos existed. The inventory
// editor lives in ShopProductPhotoControl.tsx and loads only when needed.
import type { ReactNode } from 'react'
import { useProductImageUrl } from './use-product-image'

/**
 * The SKU's photo when one is stored on this device; otherwise the given
 * fallback (the surface's pre-photo rendering). The photo is decorative — the
 * product name is always adjacent text — so the img stays alt="".
 */
export function ProductPhoto({ className, fallback, scope, sku }: { className: string; fallback: ReactNode; scope: string; sku: string }) {
  const url = useProductImageUrl(scope, sku)
  if (!url) return <>{fallback}</>
  return <img alt="" className={className} src={url} />
}
