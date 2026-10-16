export type CameraBarcodeScanSession = {
  visibleCodes: Map<string, { absentSince: number | null }>
}

export const CAMERA_BARCODE_REARM_ABSENCE_MS = 1200

export function createCameraBarcodeScanSession(): CameraBarcodeScanSession {
  return { visibleCodes: new Map() }
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
