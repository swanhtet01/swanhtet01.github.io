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
  const observed = new Set(observedValues.map((value) => value.trim()).filter(Boolean))
  const newlyVisible = nextCameraBarcodeScans(session, observedValues, now)
  session.pendingCodes = session.pendingCodes.filter((code) => observed.has(code))
  session.pendingCodes.push(...newlyVisible)
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
