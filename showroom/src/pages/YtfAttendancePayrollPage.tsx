import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

import {
  YTF_ATTENDANCE_AGENT_LANES,
  YTF_ATTENDANCE_DRIVE_SOURCES,
  YTF_ATTENDANCE_EXCEPTIONS,
  YTF_ATTENDANCE_MEETING_POINTS,
  YTF_ATTENDANCE_PAYROLL_METRICS,
  YTF_ATTENDANCE_RULE_LAYERS,
  YTF_PAYROLL_PREVIEW_ROWS,
} from '../lib/ytfAttendancePayrollModel'
import {
  createAttendanceReviewDecision,
  createAttendanceCheckin,
  exportAttendancePayrollCsv,
  getAttendanceControlPlane,
  listAttendanceCheckins,
  type AttendanceControlPlanePayload,
  type AttendanceCheckinRow,
  type AttendanceEnrollmentRow,
  type AttendanceExceptionRow,
} from '../lib/workspaceApi'

type PunchForm = {
  employee_name: string
  employee_code: string
  shift_name: string
  station: string
  status: string
  note: string
}

type PermissionProbeState = 'granted' | 'prompt' | 'denied' | 'unsupported'

type BrowserPermissionProbe = {
  secureContext: boolean
  camera: PermissionProbeState
  microphone: PermissionProbeState
  notifications: PermissionProbeState
  clipboardWrite: PermissionProbeState
  checkedAt: string
}

const fallbackAttendanceRows: AttendanceCheckinRow[] = [
  {
    id: 'preview-3',
    created_at: new Date(Date.now() - 1000 * 60 * 19).toISOString(),
    employee_name: 'Pilot worker',
    employee_code: 'YT-03',
    shift_name: 'Day shift',
    station: 'Floor A gate tablet',
    status: 'present',
    method: 'photo_checkin',
    evidence_url: 'drive-photo-seed',
    note: 'Preview event. Live records load after workspace login.',
  },
  {
    id: 'preview-7',
    created_at: new Date(Date.now() - 1000 * 60 * 44).toISOString(),
    employee_name: 'Pilot worker',
    employee_code: 'YT-07',
    shift_name: 'Day shift',
    station: 'Floor A gate tablet',
    status: 'needs_review',
    method: 'photo_checkin',
    evidence_url: 'low-confidence',
    note: 'Low-confidence or missing checkout stays out of payroll.',
  },
]

function formatDateTime(value?: string) {
  if (!value) return 'No time'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function statusTone(status?: string) {
  const normalized = String(status || '').trim().toLowerCase()
  if (normalized.includes('ready') || normalized.includes('present') || normalized.includes('locked') || normalized.includes('approved')) {
    return 'text-emerald-300'
  }
  if (normalized.includes('blocked') || normalized.includes('missing') || normalized.includes('low')) {
    return 'text-rose-300'
  }
  return 'text-amber-300'
}

function methodLabel(value?: string) {
  return String(value || 'photo_checkin').replace(/[_-]+/g, ' ')
}

async function probePermission(name: string): Promise<PermissionProbeState> {
  if (typeof navigator === 'undefined' || !navigator.permissions?.query) {
    return 'unsupported'
  }
  try {
    const result = await navigator.permissions.query({ name: name as PermissionName })
    const state = String(result.state || '').trim().toLowerCase()
    if (state === 'granted' || state === 'prompt' || state === 'denied') {
      return state as PermissionProbeState
    }
    return 'unsupported'
  } catch {
    return 'unsupported'
  }
}

export function YtfAttendancePayrollPage() {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [cameraStatus, setCameraStatus] = useState('Camera not started')
  const [permissionProbe, setPermissionProbe] = useState<BrowserPermissionProbe | null>(null)
  const [permissionStatus, setPermissionStatus] = useState('Permission check not started.')
  const [rows, setRows] = useState<AttendanceCheckinRow[]>(fallbackAttendanceRows)
  const [apiStatus, setApiStatus] = useState('Loading attendance records...')
  const [controlPlane, setControlPlane] = useState<AttendanceControlPlanePayload | null>(null)
  const [controlStatus, setControlStatus] = useState('Loading replacement control plane...')
  const [reviewingKey, setReviewingKey] = useState('')
  const [exporting, setExporting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<PunchForm>({
    employee_name: 'Pilot worker',
    employee_code: 'YT-03',
    shift_name: 'Day shift',
    station: 'Floor A gate tablet',
    status: 'present',
    note: 'Tablet photo check-in for attendance-to-OT pilot.',
  })

  useEffect(() => {
    let cancelled = false
    listAttendanceCheckins(20)
      .then((payload) => {
        if (cancelled) return
        setRows(payload.rows.length ? payload.rows : fallbackAttendanceRows)
        setApiStatus(payload.rows.length ? `Live events loaded: ${payload.rows.length}` : 'No live events yet. Preview rows shown.')
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setApiStatus(error instanceof Error ? `Workspace login needed: ${error.message}` : 'Workspace login needed for live attendance.')
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    getAttendanceControlPlane(100)
      .then((payload) => {
        if (cancelled) return
        setControlPlane(payload)
        setControlStatus(
          payload.replacement_readiness?.can_replace_qhrm_for_pilot
            ? 'Pilot replacement layer is ready. Full payroll replacement still needs approved rules and enrollment.'
            : 'Control plane loaded; pilot replacement still needs setup.',
        )
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setControlStatus(error instanceof Error ? `Control plane needs login/API: ${error.message}` : 'Control plane needs workspace login.')
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    return () => {
      stream?.getTracks().forEach((track) => track.stop())
    }
  }, [stream])

  const statusCounts = useMemo(() => {
    return rows.reduce<Record<string, number>>((accumulator, row) => {
      const key = String(row.status || 'unknown').trim() || 'unknown'
      accumulator[key] = (accumulator[key] ?? 0) + 1
      return accumulator
    }, {})
  }, [rows])

  const exceptionRows = useMemo<AttendanceExceptionRow[]>(() => {
    if (controlPlane?.exceptions?.length) {
      return controlPlane.exceptions
    }
    return YTF_ATTENDANCE_EXCEPTIONS.map((row, index) => ({
      event_id: `preview-${index + 1}`,
      employee_code: row.worker.split('/')[0]?.trim() || row.worker,
      signal: row.signal,
      decision: row.decision,
      owner: row.owner,
      payroll_impact: row.payrollImpact,
      source_event: {},
    }))
  }, [controlPlane])

  const payrollRows = useMemo(() => {
    if (controlPlane?.payroll_preview?.length) {
      return controlPlane.payroll_preview
    }
    return YTF_PAYROLL_PREVIEW_ROWS.map((row) => ({
      employee_code: row.worker,
      employee_name: row.worker,
      attendance_events: 0,
      approved_days: Number.parseFloat(row.base) || 0,
      held_events: row.net === 'Blocked' ? 1 : 0,
      ot_minutes: Number.parseFloat(row.ot) ? Math.round(Number.parseFloat(row.ot) * 60) : 0,
      payroll_status: row.net.toLowerCase(),
      reason: row.approval,
    }))
  }, [controlPlane])

  async function runPermissionProbe() {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
      setPermissionStatus('Browser permission checks are not available in this runtime.')
      return
    }
    setPermissionStatus('Checking browser permission state...')
    const [camera, microphone, notifications, clipboardWrite] = await Promise.all([
      probePermission('camera'),
      probePermission('microphone'),
      probePermission('notifications'),
      probePermission('clipboard-write'),
    ])
    const snapshot: BrowserPermissionProbe = {
      secureContext: Boolean(window.isSecureContext),
      camera,
      microphone,
      notifications,
      clipboardWrite,
      checkedAt: new Date().toISOString(),
    }
    setPermissionProbe(snapshot)
    if (!snapshot.secureContext) {
      setPermissionStatus('Camera requires HTTPS (or localhost). Open the secure app URL and retry.')
      return
    }
    if (snapshot.camera === 'denied') {
      setPermissionStatus('Camera is blocked in browser settings. Allow camera for this site and retry.')
      return
    }
    setPermissionStatus(`Permission check complete. Camera state: ${snapshot.camera}.`)
  }

  async function startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraStatus('This browser does not expose camera capture.')
      return
    }
    if (typeof window !== 'undefined' && !window.isSecureContext) {
      setCameraStatus('Camera needs HTTPS (or localhost). Open the secure app URL and retry.')
      return
    }

    try {
      const nextStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: 'user', width: { ideal: 960 }, height: { ideal: 720 } },
      })
      setStream(nextStream)
      if (videoRef.current) {
        videoRef.current.srcObject = nextStream
        await videoRef.current.play()
      }
      setCameraStatus('Camera ready. Capture stays local until the check-in is saved.')
    } catch (error) {
      if (error instanceof DOMException) {
        if (error.name === 'NotAllowedError') {
          setCameraStatus('Camera access is blocked. Allow camera permission for this site in Chrome and retry.')
          return
        }
        if (error.name === 'NotFoundError') {
          setCameraStatus('No camera device was found on this machine.')
          return
        }
      }
      setCameraStatus(error instanceof Error ? error.message : 'Camera permission was not granted.')
    }
  }

  function stopCamera() {
    stream?.getTracks().forEach((track) => track.stop())
    setStream(null)
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    setCameraStatus('Camera stopped')
  }

  function snapshotReference() {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || !stream) {
      return `manual-tablet-${Date.now()}`
    }

    const width = video.videoWidth || 640
    const height = video.videoHeight || 480
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (context) {
      context.drawImage(video, 0, 0, width, height)
    }
    return `tablet-frame-${Date.now()}`
  }

  async function capturePunch() {
    setSaving(true)
    const evidenceRef = snapshotReference()
    const payload = {
      ...form,
      method: stream ? 'tablet_photo_checkin' : 'manual_photo_checkin',
      evidence_url: evidenceRef,
      note: `${form.note} Evidence ref: ${evidenceRef}. Face match remains pending until enrollment worker is approved.`,
    }

    try {
      const result = await createAttendanceCheckin(payload)
      setRows((current) => [result.attendance, ...current].slice(0, 20))
      setApiStatus(result.message || 'Attendance event captured.')
      getAttendanceControlPlane(100)
        .then((nextControlPlane) => setControlPlane(nextControlPlane))
        .catch(() => {
          // The punch is already saved; keep the current control-plane snapshot if refresh fails.
        })
    } catch (error) {
      const previewRow: AttendanceCheckinRow = {
        id: `local-${Date.now()}`,
        created_at: new Date().toISOString(),
        employee_name: payload.employee_name,
        employee_code: payload.employee_code,
        shift_name: payload.shift_name,
        station: payload.station,
        status: payload.status,
        method: payload.method,
        evidence_url: payload.evidence_url,
        note: payload.note,
      }
      setRows((current) => [previewRow, ...current].slice(0, 20))
      setApiStatus(error instanceof Error ? `Local preview saved. Live API said: ${error.message}` : 'Local preview saved.')
    } finally {
      setSaving(false)
    }
  }

  function loadEnrollmentIntoStation(row: AttendanceEnrollmentRow) {
    setForm((current) => ({
      ...current,
      employee_code: row.employee_code,
      employee_name: row.display_label,
      station: current.station || 'Floor A gate tablet',
      note: `Enrollment source ${row.photo_file_id}. ${row.next_step}`,
    }))
    setApiStatus(`Loaded ${row.employee_code} into the punch station.`)
  }

  async function reviewException(row: AttendanceExceptionRow, decision: string, payrollImpact = 'hold') {
    const key = `${row.event_id}-${decision}`
    setReviewingKey(key)
    try {
      const result = await createAttendanceReviewDecision({
        event_id: row.event_id,
        employee_code: row.employee_code,
        decision,
        owner: row.owner || 'Plant Manager',
        payroll_impact: payrollImpact,
        note: `${row.signal}. ${row.decision}`,
      })
      setControlPlane((current) => {
        if (!current) return current
        return {
          ...current,
          review_decisions: [result.decision, ...(current.review_decisions ?? [])].slice(0, 20),
        }
      })
      setControlStatus(`Review saved: ${decision} for ${row.employee_code || row.event_id}.`)
    } catch (error) {
      setControlStatus(error instanceof Error ? `Review failed: ${error.message}` : 'Review failed.')
    } finally {
      setReviewingKey('')
    }
  }

  async function downloadPayrollCsv() {
    setExporting(true)
    try {
      const csv = await exportAttendancePayrollCsv()
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `ytf-attendance-payroll-${new Date().toISOString().slice(0, 10)}.csv`
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
      setControlStatus('Payroll CSV exported from approved attendance preview.')
    } catch (error) {
      setControlStatus(error instanceof Error ? `Payroll export failed: ${error.message}` : 'Payroll export failed.')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="sm-ytf-simple-page">
      <section className="sm-ytf-hero-row">
        <div>
          <p className="sm-kicker text-[var(--sm-accent)]">YTF Attendance OS</p>
          <h1>Face attendance to approved OT and payroll evidence.</h1>
          <p>
            Replace the broken sync layer first: phone or tablet check-ins, source-linked employee enrollment, shift rules,
            exception review, OT approval, and payroll-ready export.
          </p>
        </div>
        <div className="sm-ytf-status-stack">
          <span>Tablet capture ready</span>
          <span>Drive photo source mapped</span>
          <span>Payroll approval-gated</span>
        </div>
      </section>

      <section className="sm-ytf-action-grid sm-ytf-action-grid-five">
        <a className="sm-ytf-action-tile is-primary" href="#punch-station">
          <span>
            <strong>Punch station</strong>
            <small>Camera-ready tablet workflow.</small>
          </span>
          <span className="sm-ytf-action-arrow">Open</span>
        </a>
        <a className="sm-ytf-action-tile" href="#exception-board">
          <span>
            <strong>Exceptions</strong>
            <small>Late, absent, duplicate, missing checkout.</small>
          </span>
          <span className="sm-ytf-action-arrow">Open</span>
        </a>
        <a className="sm-ytf-action-tile" href="#payroll-export">
          <span>
            <strong>Payroll bridge</strong>
            <small>Approved rows only.</small>
          </span>
          <span className="sm-ytf-action-arrow">Open</span>
        </a>
        <a className="sm-ytf-action-tile" href="#drive-sources">
          <span>
            <strong>Drive sources</strong>
            <small>Photos, employee details, OT, salary.</small>
          </span>
          <span className="sm-ytf-action-arrow">Open</span>
        </a>
        <Link className="sm-ytf-action-tile" to="/app/platform-admin">
          <span>
            <strong>Admin setup</strong>
            <small>Roles, data jobs, and privacy checks.</small>
          </span>
          <span className="sm-ytf-action-arrow">Open</span>
        </Link>
      </section>

      <section className="sm-ytf-metric-strip is-four">
        {YTF_ATTENDANCE_PAYROLL_METRICS.map((metric) => (
          <article key={metric.label}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
            <small>{metric.detail}</small>
          </article>
        ))}
      </section>

      <section className="sm-ytf-panel">
        <div className="sm-ytf-section-head">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Replacement readiness</p>
            <h2>What works now versus what still needs payroll lock.</h2>
          </div>
          <span className="sm-status-pill">
            {controlPlane?.replacement_readiness?.can_replace_qhrm_for_pilot ? 'Pilot replaceable' : 'Loading'}
          </span>
        </div>
        <p className="mt-3 text-sm text-[var(--sm-muted)]">{controlStatus}</p>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <article className="rounded-2xl border border-emerald-300/20 bg-emerald-300/[0.07] p-4">
            <span className="sm-status-pill">Yes</span>
            <h3 className="mt-3 text-base font-bold text-white">Replace device sync</h3>
            <p className="mt-2 text-sm text-[var(--sm-muted)]">
              Tablet and phone events can become the cleaner source before ZKTeco exports are trusted.
            </p>
          </article>
          <article className="rounded-2xl border border-emerald-300/20 bg-emerald-300/[0.07] p-4">
            <span className="sm-status-pill">Yes</span>
            <h3 className="mt-3 text-base font-bold text-white">Replace QHRM for pilot</h3>
            <p className="mt-2 text-sm text-[var(--sm-muted)]">
              One gate, one employee register, one payroll cycle, and exception evidence are enough to prove replacement value.
            </p>
          </article>
          <article className="rounded-2xl border border-amber-300/20 bg-amber-300/[0.07] p-4">
            <span className="sm-status-pill">Payroll lock</span>
            <h3 className="mt-3 text-base font-bold text-white">No auto payroll from face</h3>
            <p className="mt-2 text-sm text-[var(--sm-muted)]">
              Face/photo evidence must pass enrollment, confidence, supervisor, and payroll locks before money changes.
            </p>
          </article>
        </div>
        {controlPlane ? (
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            <article className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <h3 className="text-base font-bold text-white">Ready now</h3>
              <ul className="mt-3 grid gap-2 text-sm text-[var(--sm-muted)]">
                {controlPlane.replacement_readiness.ready_now.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </article>
            <article className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <h3 className="text-base font-bold text-white">Needs sign-off for full replacement</h3>
              <ul className="mt-3 grid gap-2 text-sm text-[var(--sm-muted)]">
                {controlPlane.replacement_readiness.still_needed_for_full_replacement.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </article>
          </div>
        ) : null}
      </section>

      <section className="sm-ytf-split" id="punch-station">
        <article className="sm-ytf-panel">
          <div className="sm-ytf-section-head">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Phone / tablet station</p>
              <h2>Capture attendance without waiting for ZKTeco sync.</h2>
            </div>
            <span className="sm-status-pill">{stream ? 'Camera active' : 'Manual ready'}</span>
          </div>

          <div className="mt-5 overflow-hidden rounded-3xl border border-white/10 bg-black/30">
            <video ref={videoRef} className="aspect-video w-full bg-black object-cover" muted playsInline />
            <canvas ref={canvasRef} className="hidden" />
          </div>
          <p className="mt-3 text-sm text-[var(--sm-muted)]">{cameraStatus}</p>
          <p className="mt-1 text-sm text-[var(--sm-muted)]">{permissionStatus}</p>
          {permissionProbe ? (
            <div className="mt-3 grid gap-2 text-xs text-[var(--sm-muted)] md:grid-cols-2">
              <span className="sm-status-pill">Secure: {permissionProbe.secureContext ? 'yes' : 'no'}</span>
              <span className="sm-status-pill">Camera: {permissionProbe.camera}</span>
              <span className="sm-status-pill">Mic: {permissionProbe.microphone}</span>
              <span className="sm-status-pill">Notify: {permissionProbe.notifications}</span>
              <span className="sm-status-pill">Clipboard: {permissionProbe.clipboardWrite}</span>
              <span className="sm-status-pill">Checked: {formatDateTime(permissionProbe.checkedAt)}</span>
            </div>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-2">
            <button className="sm-button-secondary" onClick={() => void runPermissionProbe()} type="button">
              Check permissions
            </button>
            <button className="sm-button-primary" onClick={startCamera} type="button">
              Start camera
            </button>
            <button className="sm-button-secondary" onClick={stopCamera} type="button">
              Stop
            </button>
          </div>
        </article>

        <article className="sm-ytf-panel">
          <div className="sm-ytf-section-head">
            <div>
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Check-in form</p>
              <h2>One punch becomes a reviewable payroll signal.</h2>
            </div>
            <span className="sm-status-pill">{saving ? 'Saving' : 'Ready'}</span>
          </div>

          <div className="mt-5 grid gap-3">
            <label className="grid gap-1 text-sm font-semibold text-white">
              Employee code
              <input
                className="sm-input"
                onChange={(event) => setForm((current) => ({ ...current, employee_code: event.target.value }))}
                value={form.employee_code}
              />
            </label>
            <label className="grid gap-1 text-sm font-semibold text-white">
              Employee name
              <input
                className="sm-input"
                onChange={(event) => setForm((current) => ({ ...current, employee_name: event.target.value }))}
                value={form.employee_name}
              />
            </label>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="grid gap-1 text-sm font-semibold text-white">
                Shift
                <input
                  className="sm-input"
                  onChange={(event) => setForm((current) => ({ ...current, shift_name: event.target.value }))}
                  value={form.shift_name}
                />
              </label>
              <label className="grid gap-1 text-sm font-semibold text-white">
                Station
                <input
                  className="sm-input"
                  onChange={(event) => setForm((current) => ({ ...current, station: event.target.value }))}
                  value={form.station}
                />
              </label>
            </div>
            <label className="grid gap-1 text-sm font-semibold text-white">
              Payroll note
              <textarea
                className="sm-input min-h-24"
                onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))}
                value={form.note}
              />
            </label>
            <button className="sm-button-primary" disabled={saving} onClick={capturePunch} type="button">
              {saving ? 'Capturing...' : 'Capture check-in'}
            </button>
            <p className="text-sm text-[var(--sm-muted)]">{apiStatus}</p>
          </div>
        </article>
      </section>

      <section className="sm-ytf-panel" id="enrollment-queue">
        <div className="sm-ytf-section-head">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Enrollment queue</p>
            <h2>Turn Drive employee photos into approved face-match records.</h2>
          </div>
          <span className="sm-status-pill">{controlPlane?.enrollments?.length ?? 0} seeded</span>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {(controlPlane?.enrollments ?? []).map((employee) => (
            <article className="rounded-2xl border border-white/10 bg-white/[0.04] p-4" key={employee.photo_file_id}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="sm-status-pill">{employee.employee_code}</span>
                <span className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--sm-muted)]">{employee.department_hint}</span>
              </div>
              <h3 className="mt-3 text-base font-bold text-white">{employee.display_label}</h3>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">{employee.enrollment_status}</p>
              <p className="mt-2 text-sm text-white/80">{employee.next_step}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button className="sm-button-secondary" onClick={() => loadEnrollmentIntoStation(employee)} type="button">
                  Use in station
                </button>
                <a className="sm-button-secondary" href={employee.photo_url} rel="noreferrer" target="_blank">
                  Source photo
                </a>
              </div>
            </article>
          ))}
          {!controlPlane?.enrollments?.length ? (
            <article className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm text-[var(--sm-muted)]">
              Sign in to the workspace API to load the Drive enrollment queue.
            </article>
          ) : null}
        </div>
      </section>

      <section className="sm-ytf-panel">
        <div className="sm-ytf-section-head">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Live and preview events</p>
            <h2>Raw check-ins stay separate from payroll decisions.</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(statusCounts).map(([status, count]) => (
              <span className="sm-status-pill" key={status}>
                {status} {count}
              </span>
            ))}
          </div>
        </div>
        <div className="mt-5 grid gap-3">
          {rows.slice(0, 8).map((row) => (
            <article className="sm-ytf-list-row" key={row.id}>
              <span>
                <strong>{row.employee_code || 'No code'} / {row.employee_name || 'Unnamed worker'}</strong>
                <small>
                  {formatDateTime(row.created_at)} - {row.shift_name || 'No shift'} - {row.station || 'No station'} - {methodLabel(row.method)}
                </small>
              </span>
              <em className={statusTone(row.status)}>{row.status || 'review'}</em>
            </article>
          ))}
        </div>
      </section>

      <section className="sm-ytf-split" id="exception-board">
        <article className="sm-ytf-panel">
          <div className="sm-ytf-section-head">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Exception board</p>
              <h2>Every messy punch gets an owner before payroll.</h2>
            </div>
            <span className="sm-status-pill">Human review</span>
          </div>
          <div className="mt-5 grid gap-3">
            {exceptionRows.map((row) => (
              <article className="rounded-2xl border border-white/10 bg-white/[0.04] p-4" key={`${row.event_id}-${row.signal}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="sm-status-pill">{row.employee_code || 'No code'}</span>
                  <span className="sm-status-pill">{row.owner}</span>
                </div>
                <h3 className="mt-3 text-base font-bold text-white">{row.signal}</h3>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">{row.signal}</p>
                <p className="mt-3 text-sm text-white/85">{row.decision}</p>
                <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold uppercase tracking-[0.12em]">
                  <span className={statusTone(row.payroll_impact)}>{row.payroll_impact}</span>
                  <span className="text-[var(--sm-muted)]">event {row.event_id}</span>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    className="sm-button-secondary"
                    disabled={reviewingKey === `${row.event_id}-approve_for_payroll`}
                    onClick={() => reviewException(row, 'approve_for_payroll', 'ready')}
                    type="button"
                  >
                    Approve
                  </button>
                  <button
                    className="sm-button-secondary"
                    disabled={reviewingKey === `${row.event_id}-hold_for_review`}
                    onClick={() => reviewException(row, 'hold_for_review', 'hold')}
                    type="button"
                  >
                    Hold
                  </button>
                  <button
                    className="sm-button-secondary"
                    disabled={reviewingKey === `${row.event_id}-identity_review`}
                    onClick={() => reviewException(row, 'identity_review', 'excluded')}
                    type="button"
                  >
                    Identity
                  </button>
                </div>
              </article>
            ))}
          </div>
        </article>

        <article className="sm-ytf-panel" id="payroll-export">
          <div className="sm-ytf-section-head">
            <div>
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Payroll preview</p>
              <h2>Export money rows only after evidence is locked.</h2>
            </div>
            <button className="sm-button-secondary" disabled={exporting} onClick={downloadPayrollCsv} type="button">
              {exporting ? 'Exporting...' : 'Export CSV'}
            </button>
          </div>
          <div className="mt-5 overflow-hidden rounded-2xl border border-white/10">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="bg-white/[0.06] text-xs uppercase tracking-[0.12em] text-[var(--sm-muted)]">
                <tr>
                  <th className="p-3">Worker</th>
                  <th className="p-3">Events</th>
                  <th className="p-3">Approved days</th>
                  <th className="p-3">OT min</th>
                  <th className="p-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {payrollRows.map((row) => (
                  <tr className="border-t border-white/10" key={row.employee_code}>
                    <td className="p-3 font-semibold text-white">{row.employee_code}</td>
                    <td className="p-3 text-[var(--sm-muted)]">{row.attendance_events}</td>
                    <td className="p-3 text-[var(--sm-muted)]">{row.approved_days}</td>
                    <td className="p-3 text-[var(--sm-muted)]">{row.ot_minutes}</td>
                    <td className={`p-3 font-semibold ${statusTone(row.payroll_status)}`}>{row.payroll_status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 grid gap-3">
            {payrollRows.map((row) => (
              <p className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-sm text-[var(--sm-muted)]" key={`${row.employee_code}-approval`}>
                <strong className="text-white">{row.employee_code}</strong> - {row.reason}
              </p>
            ))}
          </div>
        </article>
      </section>

      <section className="sm-ytf-panel">
        <div className="sm-ytf-section-head">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Manager decisions</p>
            <h2>Approvals become an audit trail before salary export.</h2>
          </div>
          <span className="sm-status-pill">{controlPlane?.review_decisions?.length ?? 0} saved</span>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {(controlPlane?.review_decisions ?? []).slice(0, 6).map((decision) => (
            <article className="rounded-2xl border border-white/10 bg-white/[0.04] p-4" key={decision.id}>
              <div className="flex flex-wrap gap-2">
                <span className="sm-status-pill">{decision.employee_code || decision.event_id}</span>
                <span className="sm-status-pill">{decision.payroll_impact}</span>
              </div>
              <h3 className="mt-3 text-base font-bold text-white">{decision.decision}</h3>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">{decision.note || 'No note supplied.'}</p>
              <p className="mt-2 text-xs font-bold uppercase tracking-[0.12em] text-[var(--sm-muted)]">{decision.owner}</p>
            </article>
          ))}
          {!controlPlane?.review_decisions?.length ? (
            <article className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm text-[var(--sm-muted)]">
              Use the exception board approval buttons to create the first auditable manager decision.
            </article>
          ) : null}
        </div>
      </section>

      <section className="sm-ytf-panel">
        <div className="sm-ytf-section-head">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Rules engine</p>
            <h2>Identity, shifts, OT, and payroll are separate gates.</h2>
          </div>
          <Link className="sm-button-secondary" to="/app/platform-admin">
            Setup
          </Link>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {YTF_ATTENDANCE_RULE_LAYERS.map((layer, index) => (
            <article className="sm-manager-rule" key={layer.label}>
              <span className="sm-manager-rule-index">{index + 1}</span>
              <div>
                <p className="font-semibold text-white">{layer.label} - {layer.owner}</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">{layer.rule}</p>
                <p className="mt-2 text-sm text-white/80">{layer.gate}</p>
              </div>
            </article>
          ))}
        </div>
        {controlPlane?.shift_rules?.length ? (
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            {controlPlane.shift_rules.map((rule) => (
              <article className="rounded-2xl border border-white/10 bg-white/[0.04] p-4" key={rule.id}>
                <span className="sm-status-pill">{rule.window}</span>
                <h3 className="mt-3 text-base font-bold text-white">{rule.name}</h3>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">Late grace: {rule.late_grace_minutes} min</p>
                <p className="mt-1 text-sm text-[var(--sm-muted)]">OT threshold: {rule.ot_threshold_minutes} min</p>
                <p className="mt-3 text-sm text-white/84">{rule.payroll_gate}</p>
              </article>
            ))}
          </div>
        ) : null}
      </section>

      <section className="sm-ytf-panel" id="drive-sources">
        <div className="sm-ytf-section-head">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Drive-grounded sources</p>
            <h2>The pilot starts from real Factory Client files.</h2>
          </div>
          <span className="sm-status-pill">Source refs mapped</span>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {YTF_ATTENDANCE_DRIVE_SOURCES.map((source) => (
            <a className="sm-proof-card" href={source.route} key={source.id} rel="noreferrer" target="_blank">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="sm-status-pill">{source.status}</span>
                <span className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--sm-muted)]">{source.owner}</span>
              </div>
              <h3 className="mt-3 text-lg font-bold text-white">{source.label}</h3>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">{source.detail}</p>
              <p className="mt-3 text-sm text-white/84">{source.nextStep}</p>
            </a>
          ))}
        </div>
      </section>

      <section className="sm-ytf-split">
        <article className="sm-ytf-panel">
          <div className="sm-ytf-section-head">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Agent lanes</p>
              <h2>Use AI workers for cleanup, not uncontrolled payroll writes.</h2>
            </div>
            <span className="sm-status-pill">Approval first</span>
          </div>
          <div className="mt-5 grid gap-3">
            {YTF_ATTENDANCE_AGENT_LANES.map((lane) => (
              <article className="rounded-2xl border border-white/10 bg-white/[0.04] p-4" key={lane.lane}>
                <h3 className="text-base font-bold text-white">{lane.lane}</h3>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">Reads: {lane.reads}</p>
                <p className="mt-1 text-sm text-[var(--sm-muted)]">Writes: {lane.writes}</p>
                <p className="mt-3 text-sm text-white/84">{lane.guardrail}</p>
              </article>
            ))}
          </div>
        </article>

        <article className="sm-ytf-panel">
          <div className="sm-ytf-section-head">
            <div>
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Meeting stance</p>
              <h2>Beat broad HRMS by owning the factory payroll workflow.</h2>
            </div>
            <span className="sm-status-pill">May 15, 2026</span>
          </div>
          <div className="mt-5 grid gap-3">
            {YTF_ATTENDANCE_MEETING_POINTS.map((point, index) => (
              <div className="sm-manager-rule" key={point}>
                <span className="sm-manager-rule-index">{index + 1}</span>
                <p className="text-sm leading-relaxed text-[var(--sm-muted)]">{point}</p>
              </div>
            ))}
          </div>
        </article>
      </section>
    </div>
  )
}
