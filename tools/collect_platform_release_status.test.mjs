import test from 'node:test'
import assert from 'node:assert/strict'
import { assessReleaseStatus } from './collect_platform_release_status.mjs'

const commit = 'a'.repeat(40)
test('saved and pushed source does not imply deployment or hosted acceptance', () => {
  const result = assessReleaseStatus({ commit, dirty: false, remoteCommit: commit, surfaces: [{ name: 'app', commit: 'b'.repeat(40) }] })
  assert.equal(result.source.remote, 'CURRENT')
  assert.equal(result.surfaces[0].status, 'DIFFERENT')
  assert.equal(result.hostedAcceptance, 'NOT_ASSESSED')
})
test('failed reads and absent branches remain distinct', () => {
  const input = { commit, dirty: true, surfaces: [{ name: 'app', error: 'RELEASE_READ_FAILED' }] }
  assert.equal(assessReleaseStatus(input).source.remote, 'UNKNOWN')
  const result = assessReleaseStatus({ ...input, remoteCommit: null })
  assert.equal(result.source.saved, 'UNCOMMITTED_CHANGES')
  assert.equal(result.source.remote, 'NOT_PUSHED')
  assert.equal(result.surfaces[0].status, 'UNKNOWN')
})
test('matching live identity still does not assert customer acceptance', () => {
  const result = assessReleaseStatus({ commit, dirty: false, remoteCommit: commit, surfaces: [{ name: 'website', commit }] })
  assert.equal(result.surfaces[0].status, 'CURRENT')
  assert.equal(result.hostedAcceptance, 'NOT_ASSESSED')
  assert.equal(result.externalWrites, false)
})
