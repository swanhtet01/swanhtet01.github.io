// CASCADE DEFEAT CONTRACT -- the assertions around tools/css_cascade_defeat_scan.mjs.
//
// Split from the scanner the way check_css_contracts.mjs is split from what it measures: the
// scanner is a library that answers "which declarations are silently defeated", this file is the
// contract that says the answer must be trustworthy and that the repo must contain no such defeat.
//
// It runs inside check_css_contracts.mjs (step 638 of the app:verify chain, ahead of the ~640
// preference) and also standalone: `node tools/test_css_cascade_defeats.mjs`.
//
// WHY THE PROOF LAYER IS THIS LARGE. This repo has shipped an assertion made vacuous by a corrupted
// regex that matched nothing, a "no corruption" guard that passed trivially on already-destroyed
// data, and a count that passed against a hardcoded fixture value. The failure mode a scanner is
// most exposed to is not a wrong answer, it is going quietly blind and reading as a clean sweep
// forever. So nothing here trusts that the scanner works:
//
//   1. PROBES pin every classifier against inline fixtures, so a regex or a parser branch cannot
//      narrow without saying so. Same discipline as check_css_contracts.mjs's HEX_PROBES -- and not
//      decorative: three of these probes were written after the behaviour they pin was WRONG, and
//      each failure had silently removed one of the two known instances from the report.
//   2. REGRESSIONS re-introduce the actual #528 and #530 defects into the REAL stylesheet and
//      require the scanner to report exactly them, against the real markup. Not a synthetic corpus
//      and not a count: an exact set of (defeated selector, property) pairs.
//   3. NEGATIVE CONTROLS prove it can be quiet. A detector that fires on the fixtures and also on
//      everything else is not a detector, it is a nuisance that gets muted.
//   4. FLOORS fail the run when the corpus actually examined shrinks. A scanner that examines
//      nothing passes every assertion about what it found.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import {
  ROOT, STYLESHEETS, ATTRIBUTE_UNKNOWN, OPAQUE, MATCH_YES, MATCH_MAYBE, MATCH_NO,
  scan, scanCascade, buildCascade, formatFinding,
  parseSelector, specificity, splitSelectorList, expandShorthand, evaluateExpression,
  matchCompounds, verifyAncestry,
} from './css_cascade_defeat_scan.mjs'

const SELF = fileURLToPath(import.meta.url)
const CORE_CSS = 'showroom/src/core/core-app.css'
const read = (path) => readFileSync(resolve(ROOT, path), 'utf8').replaceAll('\r\n', '\n')

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

// ---------------------------------------------------------------------------------------------
// 1. PROBES
// ---------------------------------------------------------------------------------------------

// SPECIFICITY. The whole scanner keys off an EQUAL-specificity tie, so an error here does not
// produce wrong findings, it produces no findings at all. Both known instances are 0-2-0 ties, and
// the pairs below are what such a tie looks like: an ancestor class paying for a variant class.
const SPECIFICITY_PROBES = [
  ['.core-button', [0, 1, 0]],
  ['.core-button.danger', [0, 2, 0]],
  ['.theme-dark .core-button', [0, 2, 0]],
  ['.production-mode-banner[data-write="blocked"]', [0, 2, 0]],
  ['.theme-dark .production-mode-banner', [0, 2, 0]],
  ['.storage-durability-banner[data-durability="full"]', [0, 2, 0]],
  ['.website-recovery-actions > button.is-quiet', [0, 2, 1]],
  ['.theme-dark .website-recovery-actions > button', [0, 2, 1]],
  ['a', [0, 0, 1]],
  ['#main .x', [1, 1, 0]],
  ['.a:hover', [0, 2, 0]],
  ['.a::before', [0, 1, 1]],
  ['.a:not(.b.c)', [0, 3, 0]],
  ['.a:where(.b.c)', [0, 1, 0]],
  ['.a:is(.b, .c.d)', [0, 3, 0]],
]
for (const [selector, expected] of SPECIFICITY_PROBES) {
  const got = specificity(parseSelector(selector))
  check(got.join('-') === expected.join('-'), `specificity of \`${selector}\` is ${expected.join('-')}, got ${got.join('-')}`)
}

// SELECTOR STRUCTURE.
check(parseSelector('.a .b > c').combinators.join('') === ' >', 'combinators are recorded in order')
check(parseSelector('.a .b > c').compounds.length === 3, 'compounds are split on combinators')
check(parseSelector('.a[href="x y"]').subject.attributes[0].value === 'x y', 'a quoted attribute value survives whitespace')
check(parseSelector('a::before').subject.pseudoElement === 'before', 'a pseudo-element is separated from its compound')
check(parseSelector('a:hover').subject.pseudoClasses[0].name === 'hover', 'a pseudo-class is recorded, not swallowed')
check(splitSelectorList('.a, .b:is(.c, .d)').length === 2, 'a selector list splits only on TOP-LEVEL commas')

// SHORTHAND EXPANSION. `border: 1px solid var(--token)` yielding its colour is what lets the
// scanner see that a `border-color` restating that token is redundant. When this was broken -- the
// colour pattern anchored function forms with `$`, so it matched no `var()` and no `rgba()` at all
// -- BOTH known instances reported their `border-color` defeat as load-bearing, which is precisely
// the declaration #528 and #530 each deleted. A silent narrowing here costs half the bug class.
const SHORTHAND_PROBES = [
  ['border', '1px solid var(--core-line-strong)', 'border-color', 'var(--core-line-strong)'],
  ['border', '1px solid rgba(31,68,51,.12)', 'border-color', 'rgba(31,68,51,.12)'],
  ['border', '1px solid #fff', 'border-color', '#fff'],
  ['border-left', '3px solid var(--core-warn)', 'border-left-color', 'var(--core-warn)'],
  ['background', 'var(--core-panel)', 'background-color', 'var(--core-panel)'],
  ['background', '#121a23', 'background-color', '#121a23'],
]
for (const [property, value, expectedProperty, expectedValue] of SHORTHAND_PROBES) {
  const expanded = expandShorthand(property, value)
  check(expanded.get(expectedProperty) === expectedValue, `\`${property}: ${value}\` yields ${expectedProperty}: ${expectedValue}, got ${expanded.get(expectedProperty)}`)
}
// ...and REFUSES rather than guessing, because a wrong expansion fabricates a redundancy proof.
check(!expandShorthand('background', 'linear-gradient(90deg, #fff, #000)').has('background-color'), 'a gradient background yields no background-color')
check(!expandShorthand('background', 'url(x.png) no-repeat center').has('background-color'), 'a layered background yields no background-color')
check(!expandShorthand('border', 'none').has('border-color'), '`border: none` yields no nameable colour')

// THE JSX EXPRESSION GRAMMAR. A ternary's branches are ENUMERATED, never unioned: if `'a'` and
// `'b'` merged into one element carrying both, the scanner would invent co-occurrences that never
// render, and every such invention is a finding a human has to disprove by hand.
const EXPRESSION_PROBES = [
  ["'core-button danger'", ['core-button danger']],
  ['`status-pill ${x ? \'approved\' : \'pending\'}`', ['status-pill approved', 'status-pill pending']],
  ['`shop-current-sale${open ? \' is-open\' : \'\'}`', ['shop-current-sale is-open', 'shop-current-sale']],
  ["'website-button is-quiet ' + (armed ? 'is-danger' : '')", ['website-button is-quiet is-danger', 'website-button is-quiet']],
  ["x ? 'a' : y ? 'b' : 'c'", ['a', 'b', 'c']],
  ['undefined', ['']],
  ["`a ${x?.y ? 'p' : 'q'}`", ['a p', 'a q']],
]
for (const [source, expected] of EXPRESSION_PROBES) {
  const got = evaluateExpression(source)
  const normalise = (list) => JSON.stringify(list.map((text) => text.trim()).sort())
  check(
    Array.isArray(got) && normalise(got) === normalise(expected),
    `evaluating \`${source}\` yields ${JSON.stringify(expected)}, got ${JSON.stringify(got)}`,
  )
}
check(evaluateExpression('navigationClass(item.to, isActive)') === OPAQUE, 'a call expression is OPAQUE, never guessed at')
check(evaluateExpression('someVariable') === OPAQUE, 'a bare identifier is OPAQUE, never guessed at')

// MATCHING.
const shapeOf = (classes, attributes = {}, tag = 'div', ancestors = []) => ({
  file: '<probe>',
  line: 0,
  tag,
  classes: new Set(classes.split(/\s+/).filter(Boolean)),
  attributes: new Map(Object.entries(attributes)),
  ancestors,
  raw: classes,
})
const subjectOf = (selector) => parseSelector(selector).subject

const banner = shapeOf('production-mode-banner storage-durability-banner', { 'data-durability': ['full', 'evictable'] })
check(matchCompounds([subjectOf('.theme-dark .production-mode-banner')], banner) === MATCH_YES, 'the theme rule matches the banner by its shared class')
check(matchCompounds([subjectOf('.storage-durability-banner[data-durability="full"]')], banner) === MATCH_YES, 'a state-scoped tint matches the branch that renders it')
check(
  matchCompounds([subjectOf('.theme-dark .production-mode-banner'), subjectOf('.storage-durability-banner[data-durability="full"]')], banner) === MATCH_YES,
  'THE CROSS-CLASS CASE: two selectors sharing no class token both match this one element. This is the #528 collision, and it is why selector text alone cannot find this bug class',
)
// Two branches of one ternary are not a co-occurrence.
const priority = shapeOf('job-schedule', { 'data-priority': ['urgent', 'low'] })
check(matchCompounds([subjectOf('.job-schedule[data-priority="urgent"]')], priority) === MATCH_YES, 'one branch of a ternary attribute matches on its own')
check(
  matchCompounds([subjectOf('.job-schedule[data-priority="urgent"]'), subjectOf('.job-schedule[data-priority="low"]')], priority) === MATCH_NO,
  'MUTUAL EXCLUSION: two values of one attribute never render together, so they are not a co-occurrence however well each matches alone',
)
check(matchCompounds([subjectOf('.x p')], shapeOf('x y', {}, null)) === MATCH_NO, 'an unreadable component tag cannot CONFIRM a tag selector')
check(matchCompounds([subjectOf('.x p')], shapeOf('x y', {}, 'small')) === MATCH_NO, 'a tag selector does not match a different tag')
check(matchCompounds([subjectOf('.b[data-headroom="tight"]')], shapeOf('b', { 'data-headroom': ATTRIBUTE_UNKNOWN })) === MATCH_MAYBE, 'an unreadable attribute value is MAYBE, never YES')

// ANCESTRY VERIFICATION. Without this the scanner named whichever `button.is-quiet` it reached
// first -- on this repo, one in a different component that the rule never touches. A finding
// pointing at the wrong element is worse than no finding, because it spends the reader's trust.
const nested = shapeOf('is-quiet', {}, 'button', [
  { tag: 'div', classes: new Set(['website-recovery-panel']) },
  { tag: 'div', classes: new Set(['website-recovery-actions']) },
])
const orphan = shapeOf('is-quiet', {}, 'button', [{ tag: 'div', classes: new Set(['page-actions']) }])
check(verifyAncestry(parseSelector('.website-recovery-actions > button.is-quiet'), nested) === true, 'a child combinator is satisfied by the immediate parent')
check(verifyAncestry(parseSelector('.website-recovery-actions > button.is-quiet'), orphan) === false, 'a button under a different container does NOT satisfy the ancestry')
check(verifyAncestry(parseSelector('.website-recovery-panel button.is-quiet'), nested) === true, 'a descendant combinator scans further up the chain')
check(verifyAncestry(parseSelector('.theme-dark .website-recovery-actions > button'), nested) === true, 'the ambient theme prefix is satisfied for free')
check(verifyAncestry(parseSelector('.outer button.is-quiet'), shapeOf('is-quiet', {}, 'button', [])) === null, 'an ancestry running off the top of the file is UNVERIFIABLE, not a match')

// THE AMBIENT ASSUMPTION, pinned against the source. Everything the `.theme-dark X` versus `X`
// comparison rests on. If the shell stops writing the theme class onto an ancestor of the whole
// app, those pairs stop being decidable and this must fail rather than keep reporting them.
const shellSource = read('showroom/src/core/CoreShell.tsx')
check(
  /className=\{`core-shell theme-\$\{theme\}/.test(shellSource),
  'CoreShell still writes `theme-${theme}` onto the shell root. If this moved, the theme classes are no longer an ancestor of every element and ambient-ancestry pairing is invalid',
)
check(
  /InterfaceTheme = 'light' \| 'dark'/.test(shellSource),
  "the theme union is still 'light' | 'dark', which is what makes the ambient class set exhaustive",
)

// ---------------------------------------------------------------------------------------------
// 2. REGRESSIONS -- the two known instances, re-derived from the real stylesheet
// ---------------------------------------------------------------------------------------------
//
// Each entry reverts one shipped fix in the LIVE core-app.css and states exactly what the scanner
// must then report. The anchors are asserted to appear exactly once, so a stylesheet edit that
// invalidates a fixture fails loudly here instead of quietly reverting nothing and "passing" --
// which is how a fixture-based check goes vacuous.

const REGRESSIONS = [
  {
    name: 'PR #528 -- .theme-dark .production-mode-banner defeats the storage banner tints',
    patches: [
      [
        '.theme-dark .core-panel, .theme-dark .accountable-action-gate, .theme-dark .receipt-dialog { border-color: var(--core-line); background: var(--core-panel); box-shadow: var(--core-panel-shadow); }\n.theme-dark .production-mode-banner { box-shadow: var(--core-panel-shadow); }',
        '.theme-dark .core-panel, .theme-dark .production-mode-banner, .theme-dark .accountable-action-gate, .theme-dark .receipt-dialog { border-color: var(--core-line); background: var(--core-panel); box-shadow: 0 18px 48px rgba(0,0,0,.22); }',
      ],
      // The headroom tints carried an extra class purely to reach 0-3-0 and escape this trap; #528
      // dropped the crutch once the trap was gone. Restoring the trap restores the crutch, or the
      // fixture would report five defeated rules where history recorded three.
      [
        '.storage-durability-banner[data-headroom="tight"] { border-color: rgba(148,98,0,.34); background: rgba(148,98,0,.06); }',
        '.production-mode-banner.storage-durability-banner[data-headroom="tight"] { border-color: rgba(148,98,0,.34); background: rgba(148,98,0,.06); }',
      ],
      [
        '.storage-durability-banner[data-headroom="urgent"] { border-color: rgba(197,58,58,.38); background: rgba(197,58,58,.07); }',
        '.production-mode-banner.storage-durability-banner[data-headroom="urgent"] { border-color: rgba(197,58,58,.38); background: rgba(197,58,58,.07); }',
      ],
    ],
    // "Three rules were defeated, not the two originally filed" -- PR #528. Two properties each,
    // and both of them redundant: "The rule never needed the two declarations that were doing the
    // damage." Its box-shadow was load-bearing and correctly does not appear.
    defeatedBy: '.theme-dark .production-mode-banner',
    expected: [
      '.production-mode-banner[data-write="blocked"] background',
      '.production-mode-banner[data-write="blocked"] border-color',
      '.storage-durability-banner[data-durability="evictable"] background',
      '.storage-durability-banner[data-durability="evictable"] border-color',
      '.storage-durability-banner[data-durability="full"] background',
      '.storage-durability-banner[data-durability="full"] border-color',
    ],
  },
  {
    name: 'PR #530 -- .theme-dark .core-button defeats .core-button.danger',
    patches: [
      [
        '.theme-dark .core-button { background: #121a23; }',
        '.theme-dark .core-button { border-color: var(--core-line-strong); background: #121a23; color: var(--core-ink); }',
      ],
    ],
    // Exactly the two declarations #530 deleted. `background: #121a23` must NOT appear: the base
    // rule paints #fff, so it is load-bearing and #530 kept it. A fixture that flagged all three
    // would be a scanner that cannot tell a bug from a necessary override -- and note the SHAPE IS
    // INVERTED from #528, where background was the no-op. The scanner has to derive which is which
    // rather than know it.
    defeatedBy: '.theme-dark .core-button',
    expected: [
      '.core-button.danger border-color',
      '.core-button.danger color',
    ],
  },
]

const liveSheets = STYLESHEETS.map((path) => ({ path, source: read(path) }))
const sourceOf = (path) => liveSheets.find((sheet) => sheet.path === path).source
const findingKey = (finding) => `${finding.defeated.selector} ${finding.property}`
const regressionsPresentInTree = []

for (const regression of REGRESSIONS) {
  let patched = sourceOf(CORE_CSS)
  let alreadyRegressed = false
  for (const [fixed, broken] of regression.patches) {
    const fixedCount = patched.split(fixed).length - 1
    if (fixedCount === 1) {
      const before = patched
      patched = patched.replace(fixed, broken)
      // The revert must actually change the source. A no-op patch would leave the fixture scanning
      // the FIXED stylesheet and then "proving" the scanner finds the defect in it -- which it would
      // not, so this would surface as a blindness failure rather than silently passing. Asserted
      // anyway, because a fixture that quietly reverts nothing is the exact shape of the vacuous
      // checks this file exists to avoid.
      check(patched !== before, `${regression.name}: reverting its fix must change ${CORE_CSS}`)
      continue
    }
    // The fixed form is gone. Either the defect is back in the tree -- in which case this fixture
    // needs no patch, the tree IS the fixture, and the live gate below will fail too -- or the rule
    // was legitimately rewritten and the anchor needs re-pointing. Distinguishing the two is what
    // stops a real regression from being reported as a confusing "stale fixture" error, and stops a
    // rewrite from silently reverting nothing and passing.
    if (patched.split(broken).length - 1 >= 1) {
      alreadyRegressed = true
      continue
    }
    check(
      false,
      `${regression.name}: its anchor appears ${fixedCount} times in ${CORE_CSS} and the defective form is not present either. The fixture is STALE -- re-anchor it against the rule as it now reads. Do not delete it: it is the only proof this scanner still catches a defect it was built for.`,
    )
  }
  // Deliberately does NOT throw here. When the defect is back in the tree, the unpatched source is
  // already the fixture, so the expected-findings assertion below still proves the scanner detects
  // it -- and the live gate at the foot of this file then fails with the full, actionable report of
  // which declarations are being suppressed and where. Throwing here would replace that report with
  // a fixture-bookkeeping error, which is the less useful of the two failures.
  if (alreadyRegressed) regressionsPresentInTree.push(regression.name)

  const sheets = liveSheets.map((sheet) => (sheet.path === CORE_CSS ? { ...sheet, source: patched } : sheet))
  const result = scan({ sheets })
  const reported = result.findings
    .filter((finding) => finding.redundant && finding.defeating.selector === regression.defeatedBy)
    .map(findingKey)
    .sort()

  check(
    JSON.stringify(reported) === JSON.stringify([...regression.expected].sort()),
    `${regression.name}\n    expected exactly:\n      ${regression.expected.join('\n      ')}\n    got:\n      ${reported.join('\n      ') || '(NOTHING -- the scanner has gone blind on a defect it is known to catch)'}`,
  )

  // Actionability: every fixture finding must name a concrete element in a real component file.
  for (const finding of result.findings.filter((f) => f.defeating.selector === regression.defeatedBy)) {
    check(
      /\.(tsx|jsx)$/.test(finding.witness.file) && finding.witness.line > 0,
      `${regression.name}: every finding must name a concrete element, got ${finding.witness.file}:${finding.witness.line}`,
    )
  }
}

// ---------------------------------------------------------------------------------------------
// 3. NEGATIVE CONTROLS -- proof it can be QUIET, not merely loud
// ---------------------------------------------------------------------------------------------
//
// These are the shapes closest to a defeat that are not one. Each must report nothing, and the
// positive control at the end proves the same tiny harness does report a real defeat -- otherwise
// the controls would pass simply because nothing can be reported through this path.
const controlShapes = [shapeOf('b v', {}, 'div'), shapeOf('b', {}, 'div')]
const NEGATIVE_CONTROLS = [
  {
    name: 'a later rule restating the same value defeats nothing observable',
    css: '.b { color: var(--t); }\n.b.v { color: var(--t); }\n.theme-dark .b { color: var(--t); }',
  },
  {
    name: 'a later declaration that genuinely differs on its own target is not redundant',
    css: '.b { color: #fff; }\n.b.v { color: red; }\n.theme-dark .b { color: #111; }',
    allowAdvisory: true,
  },
  {
    name: 'no co-occurrence in the markup means no finding, however the selectors read',
    css: '.b { color: #fff; }\n.nowhere-in-any-markup { color: red; }\n.theme-dark .b { color: #111; }',
  },
  {
    name: 'a higher-specificity rule later still restores the value, so nothing is defeated',
    css: '.b { color: #fff; }\n.b.v { color: red; }\n.theme-dark .b { color: #111; }\n.theme-dark .b.v { color: red; }',
  },
  {
    name: 'the two themes are mutually exclusive and cannot defeat each other',
    css: '.b { color: #fff; }\n.theme-light .b { color: #222; }\n.theme-dark .b { color: #111; }',
  },
  {
    name: 'an !important earlier declaration is not defeated by a later plain one',
    css: '.b { color: var(--t); }\n.b.v { color: red !important; }\n.theme-dark .b { color: var(--t); }',
  },
]
for (const control of NEGATIVE_CONTROLS) {
  const result = scanCascade(buildCascade([{ path: '<control>', source: control.css }]), controlShapes)
  const redundant = result.findings.filter((finding) => finding.redundant)
  check(redundant.length === 0, `negative control (${control.name}): expected no REDUNDANT finding, got ${redundant.map(findingKey).join(', ')}`)
  if (!control.allowAdvisory) {
    check(result.findings.length === 0, `negative control (${control.name}): expected no finding at all, got ${result.findings.map(findingKey).join(', ')}`)
  }
}
const positiveControl = scanCascade(
  buildCascade([{ path: '<control>', source: '.b { color: var(--t); }\n.b.v { color: red; }\n.theme-dark .b { color: var(--t); }' }]),
  controlShapes,
)
check(
  positiveControl.findings.filter((finding) => finding.redundant).map(findingKey).join(',') === '.b.v color',
  `positive control: the same harness DOES report a redundant defeat, got ${positiveControl.findings.map(findingKey).join(',') || '(nothing)'}`,
)

// ---------------------------------------------------------------------------------------------
// 4. FLOORS, and the gate
// ---------------------------------------------------------------------------------------------

const live = scan({ sheets: liveSheets })

// The failure mode being designed against is a scanner that silently stops matching and reads as
// "all clear" forever. These make an empty scan a FAILURE instead of a pass. They are floors, not
// pins: this corpus only grows, so legitimate work never has to move them.
check(live.ruleCount >= 3500, `the scan parsed the stylesheets, got ${live.ruleCount} rules (floor 3500)`)
check(live.tsxFiles >= 40, `the scan read the component tree, got ${live.tsxFiles} files (floor 40)`)
check(live.shapes.length >= 2000, `the scan harvested element shapes, got ${live.shapes.length} (floor 2000)`)
check(live.candidatePairs >= 500000, `the scan saw a real equal-specificity corpus, got ${live.candidatePairs} candidate pairs (floor 500000)`)
check(live.comparedPairs >= 100000, `the scan actually compared pairs, got ${live.comparedPairs} (floor 100000)`)
check(live.matchedShapePairs >= 60, `the scan confirmed pairs against real elements, got ${live.matchedShapePairs} (floor 60)`)
// The share of markup too dynamic to read is a CEILING, not a floor: it is the one number whose
// growth blinds the scanner, so it ratchets the other way.
check(
  live.unresolved <= 40,
  `className expressions too dynamic to evaluate: ${live.unresolved} (ceiling 40). Each one is an element this scanner cannot see. If a lane is adding them, widen evaluateExpression rather than the ceiling.`,
)

const redundantFindings = live.findings.filter((finding) => finding.redundant)
const advisoryFindings = live.findings.filter((finding) => !finding.redundant)

check(
  redundantFindings.length === 0,
  redundantFindings.length === 0
    ? 'no declaration is silently defeated by a later equal-specificity rule whose own declaration paints nothing where it was written'
    : `CASCADE DEFEAT -- a later equal-specificity rule silently suppresses these declarations, and the declaration doing it is a NO-OP on its own target:\n${redundantFindings.map(formatFinding).join('\n')}\n  Fix by DELETING the redundant declaration from the later rule, not by raising the earlier rule's specificity: that repairs the rules that exist today and leaves the trap armed for the next one added. Establish what else depends on the shared rule first -- #528 found two dialogs that genuinely needed the declarations it removed from the banner.`,
)

export function cascadeDefeatReport() {
  const lines = [
    `cascade defeats: ${checks} checks passed (${live.ruleCount} rules across ${STYLESHEETS.length} stylesheets, ${live.shapes.length} elements from ${live.tsxFiles} components, ${live.comparedPairs} comparable pairs, ${live.matchedShapePairs} confirmed on a real element, ${redundantFindings.length} silent defeats)`,
    `  not examined: ${live.deferredPairs} pairs needing a DOM tree, a media-query overlap or state reasoning; ${live.unconfirmedPairs} unconfirmable; ${live.unverifiedPairs} with untraceable ancestry; ${live.refinementPairs} deliberate refinements; ${live.restoredPairs} restored by a later rule; ${live.unresolved} elements with unreadable classNames`,
  ]
  if (advisoryFindings.length) {
    lines.push(`  ADVISORY (${advisoryFindings.length}) -- a theme rule out-cascades an earlier variant with a declaration that IS load-bearing where it was written. Not a silent no-op, so not a gate failure, but the earlier rule does not render:`)
    lines.push(advisoryFindings.map(formatFinding).join('\n'))
  }
  return lines.join('\n')
}

export const cascadeDefeatChecks = () => checks

if (process.argv[1] && resolve(process.argv[1]) === resolve(SELF)) console.log(cascadeDefeatReport())
