import { useEffect, useState } from 'react'

import { getPaymentQr, subscribePaymentQr } from './payment-qr-store'

/**
 * The current merchant payment QR for a payment method label as an object URL,
 * or null. Revokes each URL when it is replaced or the consumer unmounts, and
 * refreshes when any control in this tab stores or removes the method's QR.
 * Lives apart from PaymentQr.tsx so that file exports only components
 * (react-refresh contract) — the same split as use-product-image.ts.
 */
export function usePaymentQrImageUrl(method: string): string | null {
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
      getPaymentQr(method).then((record) => {
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
    const unsubscribe = subscribePaymentQr((changedMethod) => {
      if (changedMethod === method) load()
    })
    return () => {
      active = false
      unsubscribe()
      release()
    }
  }, [method])
  return url
}
