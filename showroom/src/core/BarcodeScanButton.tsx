import { lazy, Suspense, useState } from 'react'

const BarcodeScannerDialog = lazy(() => import('./BarcodeScannerDialog').then((module) => ({ default: module.BarcodeScannerDialog })))

export function BarcodeScanButton({ disabled, label, onDetected }: {
  disabled?: boolean
  label: string
  onDetected: (value: string) => void
}) {
  const [open, setOpen] = useState(false)

  // Feature-detect the platform API. Without it the button renders nothing at all and the
  // text input remains the only (fully working) path — no polyfill, no dead control.
  if (typeof window === 'undefined' || typeof window.BarcodeDetector !== 'function') return null

  return <>
    <button
      aria-label={label}
      className="barcode-scan-button"
      disabled={disabled}
      onClick={() => setOpen(true)}
      title={label}
      type="button"
    >
      <svg aria-hidden="true" fill="none" height="20" stroke="currentColor" strokeLinecap="round" strokeWidth="2" viewBox="0 0 24 24" width="20">
        <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" />
        <path d="M7 8v8M10.5 8v8M14 8v8M17 8v8" />
      </svg>
    </button>
    {open ? <Suspense fallback={<span className="barcode-scan-hint" role="status">
      Opening camera scanner… <button className="core-button compact" onClick={() => setOpen(false)} type="button">Cancel</button>
    </span>}>
      <BarcodeScannerDialog label={label} onClose={() => setOpen(false)} onDetected={onDetected} />
    </Suspense> : null}
  </>
}
