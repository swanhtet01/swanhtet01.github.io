// Connector: data — Google Calendar. Create + list events via the Calendar REST API using a
// service-account JWT (fetch-based, zero-dependency — no googleapis SDK). Lets agents book
// kickoff/handoff meetings on a real calendar.
//
// category 'data' · configured = a Google service-account credential env is present.
//
// Calendar access model: either
//   (a) share a calendar with the service account's client_email (no delegation needed), and pass
//       that calendarId; or
//   (b) use domain-wide delegation + GOOGLE_WORKSPACE_SUBJECT to act on a real user's 'primary'.
//
// Env:
//   GOOGLE_SERVICE_ACCOUNT_JSON / GOOGLE_APPLICATION_CREDENTIALS  (one required — see _google-auth)
//   GOOGLE_WORKSPACE_SUBJECT   (optional) user to impersonate for their 'primary' calendar
//   GOOGLE_CALENDAR_ID         (optional) default calendar id (defaults to 'primary')
//
// Capabilities beyond the interface:
//   createEvent({ summary, start, end, attendees, description, calendarId, timeZone })
//        -> { id, htmlLink, status }
//   listEvents({ calendarId, maxResults, timeMin }) -> { items }

import { register } from './registry.mjs'
import { credsConfigured, readServiceAccount, getAccessToken } from './_google-auth.mjs'

const API = 'https://www.googleapis.com/calendar/v3'
const SCOPES = ['https://www.googleapis.com/auth/calendar.events']

const configured = credsConfigured
const subjectEnv = () => String(process.env.GOOGLE_WORKSPACE_SUBJECT || '').trim() || undefined
const defaultCalendarId = () => String(process.env.GOOGLE_CALENDAR_ID || '').trim() || 'primary'

async function calFetch(method, path, { query, body, subject } = {}) {
  const token = await getAccessToken(SCOPES, { subject: subject || subjectEnv() })
  const qs = query ? `?${new URLSearchParams(query).toString()}` : ''
  const res = await fetch(`${API}${path}${qs}`, {
    method,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10000),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(`calendar_${res.status}: ${json?.error?.message || ''}`.slice(0, 200))
    err.status = res.status
    throw err
  }
  return json
}

// Accept either an RFC-3339 string (timed) or a YYYY-MM-DD string (all-day) and shape it for the API.
function timePoint(value, timeZone) {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) return { date: value }
  const obj = { dateTime: value }
  if (timeZone) obj.timeZone = timeZone
  return obj
}

/**
 * createEvent — create a calendar event.
 * @param {object} o
 * @param {string} o.summary       event title
 * @param {string} o.start         RFC-3339 dateTime ('2026-07-01T10:00:00+06:30') or 'YYYY-MM-DD'
 * @param {string} o.end           same format as start
 * @param {string[]} [o.attendees] attendee emails
 * @param {string} [o.description]
 * @param {string} [o.calendarId]  defaults to GOOGLE_CALENDAR_ID or 'primary'
 * @param {string} [o.timeZone]    IANA tz for timed events (e.g. 'Asia/Yangon')
 * @param {string} [o.subject]     impersonate this user
 * @returns {Promise<{ id:string, htmlLink:string, status:string }>}
 */
export async function createEvent({ summary, start, end, attendees, description, calendarId, timeZone, subject } = {}) {
  if (!configured()) throw new Error('calendar_not_configured')
  if (!summary || !start || !end) throw new Error('calendar_missing_args') // need title + start + end
  const calId = calendarId || defaultCalendarId()
  const body = {
    summary,
    description: description || undefined,
    start: timePoint(start, timeZone),
    end: timePoint(end, timeZone),
  }
  if (Array.isArray(attendees) && attendees.length) body.attendees = attendees.map((email) => ({ email }))
  const json = await calFetch('POST', `/calendars/${encodeURIComponent(calId)}/events`, { body, subject })
  return { id: json.id, htmlLink: json.htmlLink, status: json.status }
}

/**
 * listEvents — list upcoming events (defaults to now → forward, sorted by start).
 * @param {object} [o]
 * @param {string} [o.calendarId]
 * @param {number} [o.maxResults=10]
 * @param {string} [o.timeMin]  RFC-3339; defaults to now
 * @param {string} [o.subject]
 * @returns {Promise<{ items:Array }>}
 */
export async function listEvents({ calendarId, maxResults = 10, timeMin, subject } = {}) {
  if (!configured()) throw new Error('calendar_not_configured')
  const calId = calendarId || defaultCalendarId()
  const json = await calFetch('GET', `/calendars/${encodeURIComponent(calId)}/events`, {
    query: {
      maxResults: String(maxResults),
      singleEvents: 'true',
      orderBy: 'startTime',
      timeMin: timeMin || new Date().toISOString(),
    },
    subject,
  })
  return { items: json.items || [] }
}

export const dataCalendar = {
  key: 'data-calendar',
  name: 'Google Calendar',
  category: 'data',
  docs: 'kernel/connectors/data-calendar.mjs',
  configured,
  // Cheap probe: creds must parse + Google accepts the JWT for the calendar scope.
  async health() {
    if (!configured()) return { ok: false, detail: 'missing GOOGLE_SERVICE_ACCOUNT_JSON / GOOGLE_APPLICATION_CREDENTIALS' }
    const sa = readServiceAccount()
    if (!sa) return { ok: false, detail: 'google creds present but unparseable (need client_email + private_key)' }
    try {
      await getAccessToken(SCOPES, { subject: subjectEnv() })
      const where = subjectEnv() ? `as ${subjectEnv()}` : `sa=${sa.client_email}`
      return { ok: true, detail: `auth ok (${where}, cal=${defaultCalendarId()})` }
    } catch (e) {
      return { ok: false, detail: String(e.message || 'google_token_error').slice(0, 160) }
    }
  },
  createEvent,
  listEvents,
}

register(dataCalendar)
export default dataCalendar
