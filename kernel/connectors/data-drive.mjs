// Connector: data — Google Drive. Create folders/files, upload+update content, and share with a
// real user — all as the SERVICE ACCOUNT itself (no domain-wide delegation needed). Fetch-based,
// zero-dependency (no googleapis SDK), matches the kernel's _google-auth.mjs JWT flow.
//
// category 'data' · configured = a Google service-account credential env is present.
//
// WHY THIS WORKS WITHOUT DELEGATION — AND THE QUOTA CATCH:
//   A service account can create+share files via the API without domain-wide delegation. BUT a bare
//   service account has ZERO Drive storage quota of its own: it can create empty folders, yet ANY
//   attempt to put bytes in "My Drive" (even a zero-byte native Google Doc) fails with
//   403 "Service Accounts do not have storage quota" / "storage quota has been exceeded".
//   The fix that works TODAY (no DWD, no Workspace-admin change) is a SHARED DRIVE: it has its own
//   pooled quota, so the SA — once it's a member — can create folders AND file content inside it,
//   and the owner (added as a member or via folder share) sees everything. This connector therefore
//   targets a shared drive when one is available (auto-discovered, or via GOOGLE_SHARED_DRIVE_ID).
//   It still falls back to My-Drive create for *folders* (works) but content upload there will 403 —
//   that path is DWD/Shared-Drive-gated and reported as such.
//
// Env:
//   GOOGLE_SERVICE_ACCOUNT_JSON / GOOGLE_APPLICATION_CREDENTIALS  (one required — see _google-auth)
//   GOOGLE_SHARED_DRIVE_ID    (optional) target shared drive id; auto-discovered if omitted
//   (no GOOGLE_WORKSPACE_SUBJECT needed — SA acts as itself)
//
// Capabilities beyond the interface:
//   firstSharedDriveId()                        -> string | null         (auto-discover a usable drive)
//   ensureFolder(name, { parentId, driveId, shareWith }) -> { id, url, created }   idempotent by name
//   findByName(name, { parentId, mimeType, driveId })    -> { id, name, mimeType } | null
//   uploadOrUpdate({ name, parentId, content, mimeType, convertTo }) -> { id, url, updated }
//   shareWith(fileId, email, { role })          -> { id, role }
//   getFile(fileId)                             -> { id, name, webViewLink, ... }

import { register } from './registry.mjs'
import { credsConfigured, saConfigured, readServiceAccount, getAccessToken } from './_google-auth.mjs'
import { oauthConfigured } from './_google-oauth.mjs'

const DRIVE = 'https://www.googleapis.com/drive/v3'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3'
// drive scope (full) is needed to create+share files the SA owns. drive.file would only see files
// the SA itself created via this app — which is actually all we touch — but full drive is simplest
// and lets the util also re-find a folder created in a prior run.
const SCOPES = ['https://www.googleapis.com/auth/drive']

const FOLDER_MIME = 'application/vnd.google-apps.folder'

const configured = credsConfigured

// Every files/permissions call sets these so the API spans My-Drive AND shared drives uniformly.
const ALL_DRIVES = { supportsAllDrives: 'true', includeItemsFromAllDrives: 'true' }

async function driveFetch(method, path, { query, body, base = DRIVE } = {}) {
  const token = await getAccessToken(SCOPES)
  const qs = query ? `?${new URLSearchParams({ ...ALL_DRIVES, ...query }).toString()}` : `?${new URLSearchParams(ALL_DRIVES).toString()}`
  const res = await fetch(`${base}${path}${qs}`, {
    method,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10000),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(`drive_${res.status}: ${json?.error?.message || ''}`.slice(0, 220))
    err.status = res.status
    throw err
  }
  return json
}

/** Multipart upload (metadata + media) — used to create OR update a file's content in one call. */
async function driveUpload({ method, fileId, metadata, content, mimeType, convertTo }) {
  const token = await getAccessToken(SCOPES)
  const boundary = `smega_${Date.now()}_${Math.random().toString(36).slice(2)}`
  const meta = { ...metadata }
  // When convertTo is set (e.g. a Google Doc), Drive transcodes the uploaded media into that type.
  if (convertTo) meta.mimeType = convertTo
  const body =
    `--${boundary}\r\n` +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    `${JSON.stringify(meta)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: ${mimeType || 'text/plain'}; charset=UTF-8\r\n\r\n` +
    `${content}\r\n` +
    `--${boundary}--`
  const path = method === 'PATCH' ? `/files/${encodeURIComponent(fileId)}` : '/files'
  const res = await fetch(`${UPLOAD}${path}?uploadType=multipart&supportsAllDrives=true&fields=id,name,webViewLink,mimeType`, {
    method,
    headers: { authorization: `Bearer ${token}`, 'content-type': `multipart/related; boundary=${boundary}` },
    body,
    signal: AbortSignal.timeout(15000),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(`drive_upload_${res.status}: ${json?.error?.message || ''}`.slice(0, 220))
    err.status = res.status
    throw err
  }
  return json
}

/** Escape a value for a Drive query string literal (single-quoted). */
function q(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

const sharedDriveIdEnv = () => String(process.env.GOOGLE_SHARED_DRIVE_ID || '').trim() || undefined

/**
 * firstSharedDriveId — the configured shared-drive id, else the first shared drive the SA can see.
 * Returns null when the SA is a member of no shared drive (then content upload is DWD-gated).
 * @returns {Promise<string|null>}
 */
export async function firstSharedDriveId() {
  if (!configured()) throw new Error('drive_not_configured')
  const env = sharedDriveIdEnv()
  if (env) return env
  const json = await driveFetch('GET', '/drives', { query: { pageSize: '10', fields: 'drives(id,name)' } })
  return (json.drives && json.drives[0] && json.drives[0].id) || null
}

/**
 * findByName — locate a non-trashed file/folder by exact name (optionally within a parent / of a type).
 * Searches across My-Drive and shared drives; pass driveId to scope the search to one shared drive.
 * @returns {Promise<{id,name,mimeType,webViewLink}|null>}
 */
export async function findByName(name, { parentId, mimeType, driveId } = {}) {
  if (!configured()) throw new Error('drive_not_configured')
  const clauses = [`name = '${q(name)}'`, 'trashed = false']
  if (parentId) clauses.push(`'${q(parentId)}' in parents`)
  if (mimeType) clauses.push(`mimeType = '${q(mimeType)}'`)
  const query = {
    q: clauses.join(' and '),
    fields: 'files(id,name,mimeType,webViewLink)',
    pageSize: '10',
  }
  // Scope to one shared drive when given (faster, avoids cross-drive name collisions).
  if (driveId) { query.corpora = 'drive'; query.driveId = driveId }
  else { query.corpora = 'allDrives' }
  const json = await driveFetch('GET', '/files', { query })
  return (json.files && json.files[0]) || null
}

/**
 * ensureFolder — get-or-create a folder by name (idempotent), optionally share it with a user.
 * When driveId is given (a shared drive), the folder is created INSIDE that drive so file content
 * can later be stored under it (My-Drive folders work but can't hold SA-uploaded bytes — see header).
 * @param {string} name
 * @param {object} [o]
 * @param {string} [o.parentId]   create inside this folder (wins over driveId as the parent)
 * @param {string} [o.driveId]    shared-drive id to create the folder in (its quota hosts the bytes)
 * @param {string} [o.shareWith]  email to grant writer access (so the owner sees it in "Shared with me")
 * @param {string} [o.shareRole='writer']
 * @returns {Promise<{ id:string, url:string, created:boolean }>}
 */
export async function ensureFolder(name, { parentId, driveId, shareWith, shareRole = 'writer' } = {}) {
  if (!configured()) throw new Error('drive_not_configured')
  const parent = parentId || driveId // a shared-drive root is itself a valid parent id
  const existing = await findByName(name, { parentId: parent, mimeType: FOLDER_MIME, driveId })
  let folder = existing
  let created = false
  if (!folder) {
    folder = await driveFetch('POST', '/files', {
      query: { fields: 'id,name,webViewLink' },
      body: { name, mimeType: FOLDER_MIME, ...(parent ? { parents: [parent] } : {}) },
    })
    created = true
  }
  if (shareWith) {
    await shareWithUser(folder.id, shareWith, { role: shareRole }).catch(() => {}) // idempotent-ish; ignore dup
  }
  return { id: folder.id, url: folder.webViewLink || `https://drive.google.com/drive/folders/${folder.id}`, created }
}

/**
 * uploadOrUpdate — create a file by name in a folder, or update its content if it already exists.
 * @param {object} o
 * @param {string} o.name
 * @param {string} [o.parentId]
 * @param {string} o.content       the file body (text)
 * @param {string} [o.mimeType='text/plain']  source mime of `content`
 * @param {string} [o.convertTo]   target Google type, e.g. 'application/vnd.google-apps.document'
 * @returns {Promise<{ id:string, url:string, updated:boolean }>}
 */
export async function uploadOrUpdate(_input = {}) {
  const { name, parentId, content, mimeType = 'text/plain', convertTo } = _input || {}
  if (!configured()) throw new Error('drive_not_configured')
  if (!name || content == null) throw new Error('drive_missing_args')
  // Match an existing file by name in the folder. When converting (Google Doc), the stored mime is
  // the converted type, so don't constrain findByName by mimeType — just match name+parent.
  const existing = await findByName(name, { parentId })
  if (existing) {
    const updated = await driveUpload({
      method: 'PATCH', fileId: existing.id,
      metadata: { name }, content, mimeType, convertTo,
    })
    return { id: updated.id, url: updated.webViewLink || `https://drive.google.com/file/d/${updated.id}/view`, updated: true }
  }
  const meta = { name, ...(parentId ? { parents: [parentId] } : {}) }
  const created = await driveUpload({ method: 'POST', metadata: meta, content, mimeType, convertTo })
  return { id: created.id, url: created.webViewLink || `https://drive.google.com/file/d/${created.id}/view`, updated: false }
}

/**
 * shareWithUser — grant a user a role on a file the SA owns. Idempotent enough for repeat runs
 * (Drive returns the existing permission's shape; a duplicate grant is harmless).
 * @param {string} fileId
 * @param {string} email
 * @param {object} [o]
 * @param {string} [o.role='writer']  reader | commenter | writer
 * @param {boolean} [o.notify=false]  send Google's share-notification email
 * @returns {Promise<{ id:string, role:string }>}
 */
export async function shareWithUser(fileId, email, { role = 'writer', notify = false } = {}) {
  if (!configured()) throw new Error('drive_not_configured')
  if (!fileId || !email) throw new Error('drive_missing_args')
  const json = await driveFetch('POST', `/files/${encodeURIComponent(fileId)}/permissions`, {
    query: { sendNotificationEmail: String(notify), fields: 'id,role' },
    body: { type: 'user', role, emailAddress: email },
  })
  return { id: json.id, role: json.role || role }
}

/** getFile — fetch metadata (incl. webViewLink) for a file id. */
export async function getFile(fileId) {
  if (!configured()) throw new Error('drive_not_configured')
  return driveFetch('GET', `/files/${encodeURIComponent(fileId)}`, {
    query: { fields: 'id,name,mimeType,webViewLink,modifiedTime,owners(emailAddress)' },
  })
}

/**
 * trashFile — move a file to trash. Prefer this over hard delete: inside a Shared Drive the SA is a
 * fileOrganizer (canTrash) but usually NOT an organizer (canDelete:false), so DELETE 404s while a
 * PATCH trashed=true succeeds.
 * @returns {Promise<{ id:string, trashed:true }>}
 */
export async function trashFile(fileId) {
  if (!configured()) throw new Error('drive_not_configured')
  if (!fileId) throw new Error('drive_missing_args')
  const json = await driveFetch('PATCH', `/files/${encodeURIComponent(fileId)}`, {
    query: { fields: 'id' },
    body: { trashed: true },
  })
  return { id: json.id || fileId, trashed: true }
}

export const dataDrive = {
  key: 'data-drive',
  name: 'Google Drive',
  category: 'data',
  docs: 'kernel/connectors/data-drive.mjs',
  configured,
  // Cheap probe: mint a Drive token + about.get. Proves creds parse and the Drive API is reachable
  // for the service account (which acts as itself — no subject needed).
  async health() {
    if (!configured()) return { ok: false, detail: 'missing google creds (set GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_OAUTH_* env vars)' }
    try {
      const json = await driveFetch('GET', '/about', { query: { fields: 'user(emailAddress)' } })
      const who = json?.user?.emailAddress || (saConfigured() ? readServiceAccount()?.client_email : 'oauth2-user')
      const mode = saConfigured() ? 'sa' : 'oauth2'
      return { ok: true, detail: `auth ok (${mode}=${who})` }
    } catch (e) {
      return { ok: false, detail: String(e.message || 'google_drive_error').slice(0, 160) }
    }
  },
  firstSharedDriveId,
  ensureFolder,
  findByName,
  uploadOrUpdate,
  shareWithUser,
  getFile,
  trashFile,
}

// Constants other modules may want.
export const GOOGLE_DOC_MIME = 'application/vnd.google-apps.document'
export const GOOGLE_FOLDER_MIME = FOLDER_MIME

register(dataDrive)
export default dataDrive
