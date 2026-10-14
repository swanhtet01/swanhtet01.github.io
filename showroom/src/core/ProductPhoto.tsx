// Product photo rendering for managed and device-local Shop workspaces.
//
// Managed photos come from a private, tenant-bound server binding. Local-only
// workspaces keep their device store. Every consumer retains its existing
// artwork/text fallback if a photo is missing or unavailable.
import type { ReactNode } from 'react'
import { useProductImageUrl } from './use-product-image'

/**
 * The SKU's current photo or the surface's existing fallback. The photo is
 * decorative; the product name is always adjacent text, so the img stays alt="".
 */
export function ProductPhoto({ className, fallback, scope, sku }: { className: string; fallback: ReactNode; scope: string; sku: string }) {
  const url = useProductImageUrl(scope, sku)
  if (!url) return <>{fallback}</>
  return <img alt="" className={className} src={url} />
}
