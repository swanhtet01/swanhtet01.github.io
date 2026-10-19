export type CameraBarcodeScanSession = {
  visibleCodes: Map<string, { absentSince: number | null }>
  pendingCodes: string[]
}

export const CAMERA_BARCODE_REARM_ABSENCE_MS = 1200

export function createCameraBarcodeScanSession(): CameraBarcodeScanSession {
  return { visibleCodes: new Map(), pendingCodes: [] }
}

/** Keep every visible label present, but offer one new code per camera frame. */
export function nextCameraBarcodeScan(
  session: CameraBarcodeScanSession,
  observedValues: readonly string[],
  now: number,
): string | undefined {
  if (!Number.isFinite(now)) return undefined

  // A detector can miss a label for one frame while its barcode remains present.
  // Keep its queued scan during the same grace window used to re-arm visible labels.
  // Filter against the pre-update visibility state so a label returning after the
  // full absence window drops its stale queued scan before it is treated as new.
  const queuedBeforeFrame = new Set(session.pendingCodes.filter((code) => {
    const state = session.visibleCodes.get(code)
    return state !== undefined
      && (state.absentSince === null || now - state.absentSince < CAMERA_BARCODE_REARM_ABSENCE_MS)
  }))
  const newlyVisible = nextCameraBarcodeScans(session, observedValues, now)
  session.pendingCodes = session.pendingCodes.filter((code) => queuedBeforeFrame.has(code))
  const queued = new Set(session.pendingCodes)
  for (const code of newlyVisible) {
    if (queued.has(code)) continue
    session.pendingCodes.push(code)
    queued.add(code)
  }
  return session.pendingCodes.shift()
}

/** Return each code once per camera presentation, re-arming only after it leaves view. */
export function nextCameraBarcodeScans(
  session: CameraBarcodeScanSession,
  observedValues: readonly string[],
  now: number,
  rearmAfterMs = CAMERA_BARCODE_REARM_ABSENCE_MS,
): string[] {
  if (!Number.isFinite(now) || !Number.isFinite(rearmAfterMs) || rearmAfterMs < 0) return []

  const observed = [...new Set(observedValues.map((value) => value.trim()).filter(Boolean))]
  const currentlyVisible = new Set(observed)
  const newlyVisible: string[] = []

  for (const [code, state] of session.visibleCodes) {
    if (currentlyVisible.has(code)) {
      if (state.absentSince !== null && now - state.absentSince >= rearmAfterMs) {
        session.visibleCodes.delete(code)
        continue
      }
      state.absentSince = null
      continue
    }
    if (state.absentSince === null) {
      state.absentSince = now
      continue
    }
    if (now - state.absentSince >= rearmAfterMs) session.visibleCodes.delete(code)
  }

  for (const code of observed) {
    if (!session.visibleCodes.has(code)) {
      newlyVisible.push(code)
      session.visibleCodes.set(code, { absentSince: null })
    }
  }

  return newlyVisible
}
