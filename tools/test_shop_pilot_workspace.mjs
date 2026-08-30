// Gate for the private Shop pilot sales workspace (tools/manage_shop_pilot_workspace.mjs).
//
// WHAT THIS REPLACED, AND WHY IT HAD TO BE REPLACED.
//
// app:verify used to run this as the workspace gate:
//
//     node --test --test-name-pattern=workspace tools/create_shop_pilot_handoff.test.mjs
//
// `node --test` exits 0 when a name pattern selects NOTHING. It prints `ok 1 - <filename>`
// and `# pass 1` -- one passing "test" that is the file itself -- so the gate is green whether
// the three workspace tests ran or no longer exist. Rename them, delete them, or mistype the
// pattern, and app:verify keeps reporting a pass for a lifecycle nobody checked. It also sat
// directly after `client:pilot:handoff:self-test`, which runs that whole file including those
// same three tests, so on its best day it re-ran a strict subset of the gate before it and
// added no signal at all.
//
// This gate keeps the intent -- the workspace lifecycle is covered, for real -- and makes the
// three ways it can go quiet all fail loudly:
//
//   1. The selection is verified, not assumed. The pattern run is parsed and every workspace
//      test that must exist is required BY NAME in the results. An empty selection now fails
//      instead of reporting `pass 1`.
//   2. Every exported stage of the workspace tool must appear in those tests. Adding a fifth
//      lifecycle stage without covering it fails here rather than shipping uncovered.
//   3. The operator instructions the tool writes into each private workspace must name npm
//      scripts that exist and still point at this tool. The README tells a person to run
//      `npm.cmd run client:pilot:workspace -- --prepare`; renaming the script without
//      rewriting the guide leaves a customer-facing instruction that cannot work.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const TOOL = 'tools/manage_shop_pilot_workspace.mjs'
const TEST_FILE = 'tools/create_shop_pilot_handoff.test.mjs'
const PATTERN = 'workspace'

// The lifecycle these tests have to keep covering. Named individually so a rename fails here
// with the missing name rather than silently shrinking the selection.
const REQUIRED_TESTS = [
  'renders a private mobile Shop workspace intake starter with Spa vertical pack and every authority closed',
  'starts and verifies a blank private Shop intake workspace without client data',
  'initializes a protected workspace from one canonical private intake bundle',
  'renders an offline responsive workspace owner intake form with closed gates',
  'runs the complete private workspace lifecycle without external action',
  'rejects unsafe initialization and incomplete workspace stages',
  'CLI initializes and verifies a metadata-only private workspace',
]

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

// --- 1. the pattern selects the workspace tests, and they pass -----------------------------
const run = spawnSync(
  process.execPath,
  ['--test', '--test-reporter=tap', `--test-name-pattern=${PATTERN}`, TEST_FILE],
  { encoding: 'utf8', timeout: 240000 },
)

check(run.status === 0, `the workspace tests pass\n${run.stdout ?? ''}\n${run.stderr ?? ''}`)

const passed = new Set()
const failed = []
for (const line of (run.stdout ?? '').split('\n')) {
  const ok = /^ok \d+ - (.+?)(?: # .*)?$/.exec(line.trimEnd())
  if (ok) passed.add(ok[1].trim())
  const notOk = /^not ok \d+ - (.+?)(?: # .*)?$/.exec(line.trimEnd())
  if (notOk) failed.push(notOk[1].trim())
}

check(failed.length === 0, `no workspace test failed, got: ${failed.join(', ')}`)

// This is the check the old gate could not make. When the pattern matches nothing, the only
// `ok` line TAP emits is the test file's own path, so requiring the real names by hand is the
// difference between "three tests ran" and "node found a file".
for (const name of REQUIRED_TESTS) {
  check(
    passed.has(name),
    `--test-name-pattern=${PATTERN} selected and ran "${name}".\n`
      + `  node --test exits 0 with "pass 1" when a name pattern matches nothing, so a gate that only\n`
      + `  checks the exit code is green for an empty selection. Selected: ${[...passed].join(' | ') || '(nothing)'}`,
  )
}

// --- 2. every exported stage of the workspace tool is exercised ----------------------------
const toolSource = readFileSync(TOOL, 'utf8')
const testSource = readFileSync(TEST_FILE, 'utf8')

const exportedStages = [...toolSource.matchAll(/export\s+async\s+function\s+(\w+)/g)].map((match) => match[1])
check(exportedStages.length >= 4, `the workspace tool exports its lifecycle stages, found ${exportedStages.length}`)
for (const stage of exportedStages) {
  check(
    testSource.includes(stage),
    `workspace stage "${stage}" is referenced by ${TEST_FILE}; a lifecycle stage with no test is how this gate went quiet the first time`,
  )
}

// --- 3. the instructions written into a customer's private workspace still work -------------
const packageScripts = JSON.parse(readFileSync('package.json', 'utf8')).scripts ?? {}

// The guide text lives in the tool, so read the commands out of the tool rather than
// re-stating them here: a guide that changes and a gate that does not is the same rot again.
const guidedScripts = [...toolSource.matchAll(/npm(?:\.cmd)?\s+run\s+([\w:-]+)/g)].map((match) => match[1])
check(guidedScripts.length > 0, 'the workspace guide tells the operator which npm script to run')

for (const script of new Set(guidedScripts)) {
  check(
    Object.prototype.hasOwnProperty.call(packageScripts, script),
    `the workspace README instructs the operator to run "npm run ${script}", and package.json defines it`,
  )
  check(
    (packageScripts[script] ?? '').includes(TOOL),
    `"${script}" still runs ${TOOL}; the README hands this command to a customer's private workspace`,
  )
}

// And the gate the chain runs is wired to this file, not back to a bare pattern.
check(
  (packageScripts['client:pilot:workspace:self-test'] ?? '').includes('tools/test_shop_pilot_workspace.mjs'),
  'client:pilot:workspace:self-test runs this gate',
)
check(
  !/--test-name-pattern/.test(packageScripts['client:pilot:workspace:self-test'] ?? ''),
  'client:pilot:workspace:self-test is not a bare --test-name-pattern gate again -- that form reports "pass 1" for an empty selection',
)

// --- 4. the tool still refuses misuse rather than half-running it --------------------------
const misuse = spawnSync(process.execPath, [resolve(TOOL), '--prepare'], { encoding: 'utf8', timeout: 60000 })
check(misuse.status !== 0, 'the workspace tool exits non-zero when called without --workspace')
check(/usage:|_required|_invalid/.test(misuse.stderr ?? ''), `the refusal names what was wrong, got: ${(misuse.stderr ?? '').trim().slice(0, 200)}`)
check(
  /"externalWritesPerformed":false/.test((misuse.stderr ?? '').replaceAll(' ', '')),
  'even a refusal reports that nothing external was written',
)

console.log(`shop pilot sales workspace gate: ${checks} checks passed (${REQUIRED_TESTS.length} workspace tests selected by name, ${exportedStages.length} exported stages, ${new Set(guidedScripts).size} guided npm scripts)`)
