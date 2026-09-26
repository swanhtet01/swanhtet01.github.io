import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const root = resolve(import.meta.dirname, '..')
const sha = /^[a-f0-9]{40}$/

export function assessReleaseStatus({ commit, dirty, remoteCommit, surfaces }) {
  return {
    schema: 'supermega.platform-release-status.v1',
    checkedAt: new Date().toISOString(),
    source: { commit, saved: dirty ? 'UNCOMMITTED_CHANGES' : 'COMMITTED',
      remote: remoteCommit === undefined ? 'UNKNOWN' : remoteCommit === commit ? 'CURRENT' : remoteCommit === null ? 'NOT_PUSHED' : 'DIFFERENT',
      remoteCommit: remoteCommit ?? null },
    surfaces: surfaces.map(({ name, commit: liveCommit, error }) => ({
      name, status: error || !sha.test(liveCommit || '') ? 'UNKNOWN' : liveCommit === commit ? 'CURRENT' : 'DIFFERENT',
      commit: sha.test(liveCommit || '') ? liveCommit : null,
      ...(error ? { reason: error } : {}),
    })),
    hostedAcceptance: 'NOT_ASSESSED',
    externalWrites: false,
  }
}

function git(...args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', timeout: 15000, stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

async function readRelease(name, url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(10000), redirect: 'error' })
    if (!response.ok) return { name, error: `HTTP_${response.status}` }
    // Read only the public release identity; never emit response bodies or errors with URLs.
    const reader = response.body.getReader()
    const chunks = []
    let bytes = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      bytes += value.length
      if (bytes > 65536) { await reader.cancel(); return { name, error: 'RESPONSE_TOO_LARGE' } }
      chunks.push(Buffer.from(value))
    }
    const metadata = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    return sha.test(metadata.commit || '') ? { name, commit: metadata.commit } : { name, error: 'INVALID_RELEASE_IDENTITY' }
  } catch {
    return { name, error: 'RELEASE_READ_FAILED' }
  }
}

async function main() {
  const commit = git('rev-parse', 'HEAD')
  const dirty = Boolean(git('status', '--porcelain=v1'))
  const branch = git('symbolic-ref', '--short', 'HEAD')
  let remoteCommit
  try {
    const remote = git('ls-remote', 'origin', `refs/heads/${branch}`)
    remoteCommit = remote ? remote.split(/\s+/)[0] : null
  } catch { /* Unknown is distinct from a branch that has not been pushed. */ }
  const surfaces = []
  for (const [name, url] of [['website', 'https://supermega.dev/__release.json'], ['app', 'https://app.supermega.dev/__release.json']]) {
    surfaces.push(await readRelease(name, url))
  }
  console.log(JSON.stringify(assessReleaseStatus({ commit, dirty, remoteCommit, surfaces }), null, 2))
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(() => { console.error('Platform release status could not read local source state.'); process.exitCode = 1 })
}
