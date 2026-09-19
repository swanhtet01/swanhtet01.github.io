import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, resolve } from 'node:path'
import { preparePairedPreviewSources } from './prepare_paired_preview_sources.mjs'

const fixtureRoot = mkdtempSync(resolve(tmpdir(), 'supermega-preview-source-test-'))
const repository = resolve(fixtureRoot, 'repo')
mkdirSync(repository)
const git = args => execFileSync('git', args, { cwd: repository, encoding: 'utf8', stdio: 'pipe' }).trim()
git(['init'])
git(['config', 'core.autocrlf', 'false'])
writeFileSync(resolve(repository, 'fixture.txt'), 'synthetic source\n')
git(['add', 'fixture.txt'])
git(['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'core.hooksPath=/dev/null', 'commit', '-m', 'fixture'])
const commit = git(['rev-parse', 'HEAD'])
after(() => {
  if (realpathSync(dirname(fixtureRoot)) !== realpathSync(tmpdir()) || !basename(fixtureRoot).startsWith('supermega-preview-source-test-')) throw new Error('unsafe_fixture_cleanup')
  rmSync(fixtureRoot, { recursive: true, force: true })
})

test('prepare two exact clean isolated sources with digest and no external authority', () => {
  const result = preparePairedPreviewSources({ repository, commit, output: resolve(fixtureRoot, 'pair') })
  assert.equal(result.state, 'local_sources_prepared')
  assert.deepEqual(result.sources.map(x => x.kind), ['app', 'public'])
  assert.ok(result.sources.every(x => x.commit === commit && x.clean))
  assert.equal(result.controls.localWorktreesConfirmed, 2)
  assert.equal(result.localMutationOutcome, 'confirmed_complete')
  for (const [key, value] of Object.entries(result.controls)) if (key !== 'localWorktreesConfirmed') assert.equal(value, false, key)
  const { digest, ...body } = JSON.parse(readFileSync(result.receiptPath, 'utf8'))
  assert.equal(digest, `sha256:${createHash('sha256').update(JSON.stringify(body)).digest('hex')}`)
  writeFileSync(resolve(result.sources[0].path, 'fixture.txt'), 'app-only change\n')
  assert.equal(readFileSync(resolve(result.sources[1].path, 'fixture.txt'), 'utf8'), 'synthetic source\n')
  assert.equal(git(['status', '--porcelain']), '')
})

test('post-mutation and readback failures preserve unresolved attempted path without retry', () => {
  for (const failure of ['add', 'readback']) {
    const output = resolve(fixtureRoot, `failure-${failure}`)
    let adds = 0
    const runner = (cwd, args) => {
      if (failure === 'readback' && cwd !== repository) throw new Error('injected_readback_failure')
      const result = execFileSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'core.fsmonitor=false', ...args], {
        cwd, encoding: 'utf8', stdio: 'pipe', env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1',
          GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null' },
      }).trim()
      if (args.includes('worktree') && args.includes('add')) {
        adds += 1
        if (failure === 'add') throw new Error('injected_lost_add_result')
      }
      return result
    }
    assert.throws(() => preparePairedPreviewSources({ repository, commit, output }, runner), /preparation_incomplete/)
    const receipt = JSON.parse(readFileSync(resolve(output, 'preparation.json'), 'utf8'))
    assert.equal(adds, 1)
    assert.equal(receipt.state, 'incomplete_local_preparation')
    assert.equal(receipt.localMutationOutcome, 'unresolved')
    assert.equal(receipt.controls.localWorktreesConfirmed, 0)
    assert.equal(receipt.attempts.length, 1)
    assert.equal(receipt.attempts[0].path, resolve(output, 'app'))
    assert.equal(receipt.attempts[0].outcome, 'unresolved')
    assert.equal(receipt.attempts[0].stage, failure === 'add' ? 'worktree_add' : 'source_readback')
    assert.equal(readFileSync(resolve(output, 'app/fixture.txt'), 'utf8'), 'synthetic source\n')
  }
})

test('wrong commit, existing output, nested output and dirty checkout fail closed', () => {
  assert.throws(() => preparePairedPreviewSources({ repository, commit: 'a'.repeat(40), output: resolve(fixtureRoot, 'wrong') }), /head_mismatch/)
  assert.throws(() => preparePairedPreviewSources({ repository, commit, output: resolve(fixtureRoot, 'pair') }), /output_exists/)
  assert.throws(() => preparePairedPreviewSources({ repository, commit, output: resolve(repository, 'nested') }), /overlaps_repository/)
  assert.throws(() => preparePairedPreviewSources({ repository, commit: 'main', output: resolve(fixtureRoot, 'bad') }), /commit_invalid/)
  git(['config', 'filter.synthetic.smudge', 'must-not-execute'])
  assert.throws(() => preparePairedPreviewSources({ repository, commit, output: resolve(fixtureRoot, 'filtered') }), /checkout_filters_require_review/)
  git(['config', '--unset', 'filter.synthetic.smudge'])
  writeFileSync(resolve(repository, 'untracked.txt'), 'synthetic\n')
  assert.throws(() => preparePairedPreviewSources({ repository, commit, output: resolve(fixtureRoot, 'dirty') }), /checkout_dirty/)
})
