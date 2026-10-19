import { Component, lazy, Suspense, useState, type ReactNode } from 'react'

const BarcodeScannerDialog = lazy(() => import('./BarcodeScannerDialog').then((module) => ({ default: module.BarcodeScannerDialog })))

class BarcodeScannerErrorBoundary extends Component<{ children: ReactNode; onDismiss: () => void }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    if (this.state.failed) return <div className="barcode-scan-hint" role="alert">
      Camera scanner could not load. Type the code manually.
      <button className="core-button compact" onClick={this.props.onDismiss} type="button">Close scanner</button>
    </div>
    return this.props.children
  }
}

export function BarcodeScanButton({ continuous = false, continuousMode = 'receiving', disabled, label, onDetected }: {
  continuous?: boolean
  continuousMode?: 'sale' | 'receiving'
  disabled?: boolean
  label: string
  onDetected: (value: string) => boolean | void
}) {
  const [open, setOpen] = useState(false)
  const [fallbackOpen, setFallbackOpen] = useState(false)
  const cameraAvailable = typeof window !== 'undefined' && typeof window.BarcodeDetector === 'function'

  // Keep the scan affordance visible on every device. Browsers without BarcodeDetector
  // still support manual entry and many keyboard-wedge scanners through the adjacent field.
  if (typeof window === 'undefined') return null

  return <>
    <button
      aria-label={cameraAvailable ? label : 'Camera scan unavailable; show scanner options'}
      className="barcode-scan-button"
      disabled={disabled}
      onClick={() => cameraAvailable ? setOpen(true) : setFallbackOpen((value) => !value)}
      title={cameraAvailable ? label : 'Camera scanning is unavailable here; view code-entry options'}
      type="button"
    >
      <svg aria-hidden="true" fill="none" height="20" stroke="currentColor" strokeLinecap="round" strokeWidth="2" viewBox="0 0 24 24" width="20">
        <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" />
        <path d="M7 8v8M10.5 8v8M14 8v8M17 8v8" />
      </svg>
    </button>
    {fallbackOpen && !cameraAvailable ? <span className="barcode-scan-hint" role="status">
      Camera scanning is unavailable in this browser. Use a connected scanner in the code field, or type the code.
    </span> : null}
    {open && cameraAvailable ? <BarcodeScannerErrorBoundary onDismiss={() => setOpen(false)}>
      <Suspense fallback={<span className="barcode-scan-hint" role="status">
        Opening camera scanner… <button className="core-button compact" onClick={() => setOpen(false)} type="button">Cancel</button>
      </span>}>
        <BarcodeScannerDialog continuous={continuous} continuousMode={continuousMode} label={label} onClose={() => setOpen(false)} onDetected={onDetected} />
      </Suspense>
    </BarcodeScannerErrorBoundary> : null}
  </>
}
