import { useEffect, useRef, useState } from 'react'

type DetectedBarcode = { rawValue: string }

type BarcodeDetectorLike = { detect(source: HTMLVideoElement): Promise<DetectedBarcode[]> }

type BarcodeDetectorConstructor = new () => BarcodeDetectorLike

declare global {
  interface Window { BarcodeDetector?: BarcodeDetectorConstructor }
}

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

export function BarcodeScannerDialog({ label, onDetected, onClose }: {
  label: string
  onDetected: (value: string) => void
  onClose: () => void
}) {
  const [error, setError] = useState('')
  const dialogRef = useRef<HTMLDialogElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const onDetectedRef = useRef(onDetected)
  const onCloseRef = useRef(onClose)
  const cancelledRef = useRef(false)

  useEffect(() => {
    onDetectedRef.current = onDetected
  }, [onDetected])

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    const dialog = dialogRef.current
    const video = videoRef.current
    if (!dialog || !video) return
    if (!dialog.open) dialog.showModal()
    let cancelled = false
    cancelledRef.current = false
    let stream: MediaStream | null = null
    let timer: number | undefined
    let detecting = false

    async function start(activeVideo: HTMLVideoElement) {
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
        if (!cancelled) setError(cameraFailureMessage(cause))
        return
      }
      if (cancelled) {
        stream.getTracks().forEach((track) => track.stop())
        stream = null
        return
      }
      activeVideo.srcObject = stream
      try {
        await activeVideo.play()
      } catch {
        // Autoplay refusal. The stream stays attached, so frames still reach detect()
        // once the browser lets the element run; the interval below tolerates a video
        // that has not produced data yet.
      }
      timer = window.setInterval(() => {
        if (detecting || cancelled || activeVideo.readyState < 2) return
        detecting = true
        detector.detect(activeVideo)
          .then((barcodes) => {
            if (cancelled) return
            const value = barcodes.map((barcode) => barcode.rawValue.trim()).find(Boolean)
            if (!value) return
            cancelled = true
            cancelledRef.current = true
            onDetectedRef.current(value)
            onCloseRef.current()
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

    void start(video)

    return () => {
      // Releasing the camera is mandatory: this runs on cancel, on successful detection,
      // and on unmount, so no code path can leave the camera light on.
      cancelled = true
      cancelledRef.current = true
      if (timer !== undefined) window.clearInterval(timer)
      stream?.getTracks().forEach((track) => track.stop())
      video.srcObject = null
      if (dialog.open) dialog.close()
    }
  }, [])

  function requestClose() {
    if (!cancelledRef.current) onCloseRef.current()
  }

  return <dialog aria-label={label} className="barcode-scan-dialog" onClose={requestClose} ref={dialogRef}>
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
      <button className="core-button compact" onClick={requestClose} type="button">Cancel</button>
    </div>
  </dialog>
}
