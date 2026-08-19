import { useEffect, useRef, useState } from 'react'

// Camera barcode scanning for the Shop counter and catalog SKU entry.
//
// Deliberately built on the platform BarcodeDetector API alone (Chromium/Android — the
// phone hardware Myanmar counters actually run) with NO scanning library: package.json is
// digest-bound, so a dependency cannot be added outside the rehearsal cascade. Where the
// API is missing (Firefox, desktop Safari) this component renders nothing and the existing
// keyboard-wedge scanner path through the plain input keeps working unchanged.
//
// BarcodeDetector has not landed in lib.dom yet, so a minimal ambient declaration lives
// here instead of an @types package. Only the members this file uses are declared.
type DetectedBarcode = { rawValue: string }

type BarcodeDetectorLike = { detect(source: HTMLVideoElement): Promise<DetectedBarcode[]> }

type BarcodeDetectorConstructor = new () => BarcodeDetectorLike

declare global {
  interface Window { BarcodeDetector?: BarcodeDetectorConstructor }
}

// Low-end Android is the target device: detect on a slow interval, never per frame. Each
// pass also skips itself while the previous detect() is still in flight, so a slow decoder
// degrades to a slower scan instead of a growing queue.
const DETECT_INTERVAL_MS = 400

function scanUnavailableMessage() {
  return 'Camera scanning is not available in this browser. Type the code into the field instead.'
}

function cameraFailureMessage(cause: unknown) {
  const name = cause instanceof DOMException ? cause.name : ''
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'Camera access was blocked. Allow camera access for this site in the browser settings, or type the code instead.'
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return 'No usable camera was found on this device. Type the code instead.'
  }
  return 'The camera could not be started. Close any other app using the camera, or type the code instead.'
}

export function BarcodeScanButton({ disabled, label, onDetected }: {
  disabled?: boolean
  label: string
  onDetected: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState('')
  const dialogRef = useRef<HTMLDialogElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const onDetectedRef = useRef(onDetected)

  useEffect(() => {
    onDetectedRef.current = onDetected
  }, [onDetected])

  useEffect(() => {
    if (!open) return
    const dialog = dialogRef.current
    const video = videoRef.current
    if (!dialog || !video) return
    if (!dialog.open) dialog.showModal()
    let cancelled = false
    let stream: MediaStream | null = null
    let timer: number | undefined
    let detecting = false

    async function start() {
      if (!video) return
      const Detector = window.BarcodeDetector
      if (typeof Detector !== 'function' || !navigator.mediaDevices?.getUserMedia) {
        setError(scanUnavailableMessage())
        return
      }
      let detector: BarcodeDetectorLike
      try {
        detector = new Detector()
      } catch {
        setError(scanUnavailableMessage())
        return
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' } } })
      } catch (cause) {
        setError(cameraFailureMessage(cause))
        return
      }
      if (cancelled) {
        stream.getTracks().forEach((track) => track.stop())
        stream = null
        return
      }
      video.srcObject = stream
      try {
        await video.play()
      } catch {
        // Autoplay refusal. The stream stays attached, so frames still reach detect()
        // once the browser lets the element run; the interval below tolerates a video
        // that has not produced data yet.
      }
      timer = window.setInterval(() => {
        if (detecting || cancelled || video.readyState < 2) return
        detecting = true
        detector.detect(video)
          .then((barcodes) => {
            if (cancelled) return
            const value = barcodes.map((barcode) => barcode.rawValue.trim()).find(Boolean)
            if (!value) return
            cancelled = true
            onDetectedRef.current(value)
            setOpen(false)
          })
          .catch(() => {
            // One failed pass (frame not decodable yet, transient detector error) must
            // not end the session; the next interval tick simply tries again.
          })
          .finally(() => {
            detecting = false
          })
      }, DETECT_INTERVAL_MS)
    }

    void start()

    return () => {
      // Releasing the camera is mandatory: this runs on cancel, on successful detection,
      // and on unmount, so no code path can leave the camera light on.
      cancelled = true
      if (timer !== undefined) window.clearInterval(timer)
      stream?.getTracks().forEach((track) => track.stop())
      video.srcObject = null
      if (dialog.open) dialog.close()
    }
  }, [open])

  // Feature-detect the platform API. Without it the button renders nothing at all and the
  // text input remains the only (fully working) path — no polyfill, no dead control.
  if (typeof window === 'undefined' || typeof window.BarcodeDetector !== 'function') return null

  return <>
    <button
      aria-label={label}
      className="barcode-scan-button"
      disabled={disabled}
      onClick={() => { setError(''); setOpen(true) }}
      title={label}
      type="button"
    >
      <svg aria-hidden="true" fill="none" height="20" stroke="currentColor" strokeLinecap="round" strokeWidth="2" viewBox="0 0 24 24" width="20">
        <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" />
        <path d="M7 8v8M10.5 8v8M14 8v8M17 8v8" />
      </svg>
    </button>
    {open ? <dialog aria-label={label} className="barcode-scan-dialog" onClose={() => setOpen(false)} ref={dialogRef}>
      <header className="barcode-scan-head">
        <span className="core-eyebrow">Camera scan</span>
        <h2>Point the camera at the barcode</h2>
      </header>
      {/* muted + playsInline keep mobile browsers rendering the preview inline without sound. */}
      <video className="barcode-scan-video" muted playsInline ref={videoRef} />
      {error
        ? <p className="barcode-scan-error" role="alert">{error}</p>
        : <p className="barcode-scan-hint">The code is added automatically as soon as it is recognized. Nothing is recorded or uploaded — the camera only reads the code.</p>}
      <div className="barcode-scan-actions">
        <button className="core-button compact" onClick={() => setOpen(false)} type="button">Cancel</button>
      </div>
    </dialog> : null}
  </>
}
