import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const root = new URL('../', import.meta.url)
const read = (path) => readFile(new URL(path, root), 'utf8')

test('staff handoff commands bind existing private preparation entry points', async () => {
  const guide = await read('hq/strategy/CUSTOMER-SUPPORT-RUNBOOK.md')
  const { scripts } = JSON.parse(await read('package.json'))
  const expected = new Map([
    ['client:workspace:contact:review-template', '--contact-review-template'],
    ['client:workspace:from-contact', '--init-from-contact'],
    ['client:workspace:contact:verify', '--verify-contact-workspace'],
    ['client:prepare', ''],
    ['client:prepare:verify', '--verify'],
  ])
  const commands = [...guide.matchAll(/^npm\.cmd run ([\w:-]+) -- /gm)].map((match) => match[1])
  assert.deepEqual(commands, [...expected.keys()])
  for (const [name, flag] of expected) {
    assert.equal(scripts[name], `node tools/prepare_client_demo.mjs${flag ? ` ${flag}` : ''}`)
  }
})

test('staff handoff preserves review, sample and private-output boundaries', async () => {
  const guide = await read('hq/strategy/CUSTOMER-SUPPORT-RUNBOOK.md')
  for (const text of [
    'Leave gates false until that review occurs.',
    'An absent CSV deliberately retains',
    'not a shareable',
    'never overwrite it or invent approval',
    'Hosted receipt-to-staff discovery still requires separate observed evidence.',
  ]) assert.ok(guide.includes(text), text)
})
