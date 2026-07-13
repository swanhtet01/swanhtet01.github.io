import { readFile } from 'node:fs/promises'
import { EventEmitter } from 'node:events'
import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  GUIDED_BOOTSTRAP_INPUT,
  collectGuidedEnvironment,
  guidedInputGroups,
  runGuidedActivation,
} from './workcell-guided-activation.mjs'
import { TerminalPrompt } from './terminal-prompt.mjs'

const MANIFEST = {
  version: 1,
  clientSlug: 'guided-owner',
  clientName: 'Guided Owner',
  workcells: ['owner-command'],
  timeZone: 'Asia/Yangon',
  currency: 'MMK',
  lookbackHours: 24,
  clickupListId: '',
  deliveryUtc: '01:30',
  tokenCap: 150000,
}

function valueFor(inputName) {
  if (inputName === 'SUPERMEGA_NEW_CLIENT_SUPABASE_URL') return 'https://client-project.supabase.co'
  if (inputName === GUIDED_BOOTSTRAP_INPUT) {
    return 'postgresql://postgres:bootstrap-password@db.client-project.supabase.co:5432/postgres?sslmode=require'
  }
  return `secret-value-for-${inputName}`
}

class FakeInput extends EventEmitter {
  constructor() {
    super()
    this.isTTY = true
    this.isRaw = false
    this.rawModes = []
  }

  setRawMode(value) {
    this.isRaw = Boolean(value)
    this.rawModes.push(this.isRaw)
  }

  resume() {}
}

class FakeOutput {
  constructor() {
    this.isTTY = true
    this.chunks = []
  }

  write(value) {
    this.chunks.push(String(value))
  }
}

test('guided inputs derive only client-scoped names for the selected workcell', () => {
  const groups = guidedInputGroups(MANIFEST)
  assert.equal(groups.length, 6)
  assert.ok(groups.every((group) => group.inputNames.every((name) => name.startsWith('SUPERMEGA_NEW_CLIENT_'))))
  assert.ok(groups.some((group) => group.inputNames.includes('SUPERMEGA_NEW_CLIENT_TELEGRAM_BOT_TOKEN')))
  assert.equal(groups.some((group) => group.inputNames.includes('SUPERMEGA_NEW_CLIENT_CLICKUP_ACCESS_TOKEN')), false)
  assert.equal(groups.some((group) => group.inputNames.includes('SUPERMEGA_NEW_CLIENT_PAYPAL_CLIENT_SECRET')), false)
  assert.equal(groups.some((group) => group.inputNames.includes('SUPERMEGA_NEW_CLIENT_PIPEDRIVE_ACCESS_TOKEN')), false)
})

test('guided collector chooses one alias per group and keeps bootstrap separate', async () => {
  const requested = []
  const env = await collectGuidedEnvironment(MANIFEST, {
    chooseInput: async (group) => group.inputNames.at(-1),
    readSecret: async ({ inputName }) => { requested.push(inputName); return valueFor(inputName) },
    confirmBootstrap: async () => true,
  })
  assert.equal(Object.getPrototypeOf(env), null)
  assert.equal(env.SUPERMEGA_NEW_CLIENT_OPENROUTER_API_KEY, valueFor('SUPERMEGA_NEW_CLIENT_OPENROUTER_API_KEY'))
  assert.equal(env.SUPERMEGA_NEW_CLIENT_ANTHROPIC_API_KEY, undefined)
  assert.equal(env[GUIDED_BOOTSTRAP_INPUT], valueFor(GUIDED_BOOTSTRAP_INPUT))
  assert.equal(requested.at(-1), GUIDED_BOOTSTRAP_INPUT)
  assert.ok(Object.keys(env).every((name) => name.startsWith('SUPERMEGA_NEW_CLIENT_')))
})

test('guided activation prints a value-free plan, requires exact confirmation, and scrubs inputs', async () => {
  const secretValues = []
  let planOutput = ''
  let applyCalls = 0
  let appliedEnvironment
  const result = await runGuidedActivation(MANIFEST, {
    scope: 'test-team',
    sourceDirectory: 'C:\\clean-kernel',
    chooseInput: async (group) => group.inputNames[0],
    readSecret: async ({ inputName }) => {
      const value = valueFor(inputName)
      secretValues.push(value)
      return value
    },
    confirmBootstrap: async () => true,
    onPlan: async (plan) => { planOutput = JSON.stringify(plan) },
    readConfirmation: async (confirmation) => confirmation,
    apply: async (_manifest, options) => {
      applyCalls += 1
      appliedEnvironment = options.env
      assert.equal(options.confirm, 'PROVISION supermega-wc-guided-owner')
      assert.equal(options.env.SUPERMEGA_NEW_CLIENT_SUPABASE_URL, 'https://client-project.supabase.co')
      return { ok: true, projectName: 'supermega-wc-guided-owner' }
    },
  })
  assert.equal(result.ok, true)
  assert.equal(applyCalls, 1)
  for (const value of secretValues) assert.equal(planOutput.includes(value), false)
  assert.deepEqual(Object.keys(appliedEnvironment), [])
})

test('guided activation stops before apply on wrong confirmation', async () => {
  let applyCalls = 0
  await assert.rejects(
    runGuidedActivation(MANIFEST, {
      scope: 'test-team',
      chooseInput: async (group) => group.inputNames[0],
      readSecret: async ({ inputName }) => valueFor(inputName),
      confirmBootstrap: async () => true,
      readConfirmation: async () => 'PROVISION wrong-project',
      apply: async () => { applyCalls += 1 },
    }),
    /confirmation_required:PROVISION supermega-wc-guided-owner/,
  )
  assert.equal(applyCalls, 0)
})

test('terminal prompt masks values, supports correction, and restores raw mode', async () => {
  const input = new FakeInput()
  const output = new FakeOutput()
  const prompt = new TerminalPrompt(input, output)
  const reading = prompt.read('Masked input: ', { masked: true })
  input.emit('keypress', 'x', {})
  input.emit('keypress', 'y', {})
  input.emit('keypress', '', { name: 'backspace' })
  input.emit('keypress', 'z', {})
  input.emit('keypress', '\r', { name: 'return' })
  assert.equal(await reading, 'xz')
  const transcript = output.chunks.join('')
  assert.equal(transcript.includes('xz'), false)
  assert.match(transcript, /\*\*\x08 \x08\*/)
  assert.deepEqual(input.rawModes, [true, false])
  assert.equal(input.listenerCount('keypress'), 0)
})

test('terminal prompt cancels without leaving raw mode enabled', async () => {
  const input = new FakeInput()
  const output = new FakeOutput()
  const prompt = new TerminalPrompt(input, output)
  const reading = prompt.read('Masked input: ', { masked: true })
  input.emit('keypress', '', { name: 'c', ctrl: true })
  await assert.rejects(reading, /activation_cancelled/)
  assert.equal(input.isRaw, false)
  assert.equal(input.listenerCount('keypress'), 0)
})

test('guided CLI masks client values and never exports them to process environment or arguments', async () => {
  const source = await readFile(new URL('./scripts/activate-workcell-client.mjs', import.meta.url), 'utf8')
  const terminalSource = await readFile(new URL('./terminal-prompt.mjs', import.meta.url), 'utf8')
  assert.match(source, /\{ masked: true \}/)
  assert.match(source, /remain in memory only/)
  assert.match(terminalSource, /interactive_terminal_required/)
  assert.match(terminalSource, /masked \? '\*'\.repeat/)
  assert.doesNotMatch(source, /process\.env\[[^\]]*SUPERMEGA_NEW_CLIENT|process\.env\s*=|writeFile|appendFile|--token|--secret/)
})
