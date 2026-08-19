// CSS contract check -- the two rules scoped as P3.0 in hq/strategy/DESIGN-PROGRAM.md.
//
// 1. HEX-LITERAL RATCHET. Every batch of the literal-retirement programme lowers the number
//    of raw hex colours in a stylesheet; nothing may raise it again in between. Each file's
//    current count is recorded in HEX_CEILINGS below and a file FAILS when it exceeds its
//    ceiling. This is a ratchet, not a ban: attrition tightens it and it never demands a
//    sweep. Two carve-outs, both live in the stylesheets today, keep the metric honest:
//      - hex inside a var() fallback is EXEMPT: `var(--core-quiet, #5f6f67)` (the item-12
//        --website-quiet repair at the foot of website-product.css) is the sanctioned shape
//        for a literal -- the token wins whenever it is defined, so the literal is inert.
//      - hex inside a comment is EXEMPT: 17 of ecommerce-product.css's 129 raw hexes are
//        documentation (e.g. :21, :77, :198-199), and turning prose into a violation would
//        punish exactly the kind of note the retirement programme needs.
//
// 2. NO FALLBACK-LESS CONSUMPTION OF AN UNDEFINED CUSTOM PROPERTY. `var(--x)` where no
//    stylesheet in the same cascade declares `--x:` computes to nothing, silently: the
//    declaration parses, the browser drops it at computed-value time, and no tool complains.
//    The shadow-ramp and --website-quiet incidents were both exactly this shape -- silent
//    dead tokens found by eye, late. A consumption that carries a fallback is fine (that is
//    the sanctioned resilience shape, see index.css's .route-error), so only fallback-less
//    consumption of an undefined property fails.
//
// Why this is a hand-rolled script and not stylelint: no stylelint dependency or config
// exists anywhere in the repo (showroom devDependencies are the eslint family, postcss and
// autoprefixer only), and the repo convention for exactly this kind of check is an .mjs
// verifier -- tools/test_theme_surface_contract.mjs already parses these same stylesheets
// with its own scanner. A stylelint install buys a dependency, a config dialect and a
// plugin to express two rules this file states directly.
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const SELF = fileURLToPath(import.meta.url)
const ROOT = resolve(dirname(SELF), '..')

const INDEX_CSS = 'showroom/src/index.css'
const CORE_CSS = 'showroom/src/core/core-app.css'
const ECOMMERCE_CSS = 'showroom/src/products/ecommerce/ecommerce-product.css'
const WEBSITE_CSS = 'showroom/src/products/website/website-product.css'
const PUBLISH_CSS = 'showroom/src/products/website/publish-workspace.css'

// Per-file ceilings on LIVE hex occurrences (raw hex minus the two carve-outs above).
// Measured 2026-08-19 against the raw counts in DESIGN-PROGRAM.md's P3.0 table
// (core 104 raw - 5 in comments; ecommerce 129 - 17 in comments; website 82 - 12 in
// comments - 10 in var() fallbacks; publish-workspace 1).
//
// HOW THIS TABLE CHANGES. It only goes DOWN, and the tool does the writing: when a run
// measures fewer live hexes than a ceiling, it rewrites that number below in place --
// commit the change with the batch that retired the literals. Raising a number by hand is
// the one forbidden move; if this check fails, retire the literal you just added (use a
// token, a color-mix() of tokens, or a var() fallback) instead of widening the budget.
const HEX_CEILINGS = new Map([
  ['showroom/src/core/core-app.css', 99],
  ['showroom/src/products/ecommerce/ecommerce-product.css', 112],
  ['showroom/src/products/website/website-product.css', 60],
  ['showroom/src/products/website/publish-workspace.css', 1],
])

// What "the same cascade" means for rule 2, per scanned file. index.css is loaded
// unconditionally by main.tsx and core-app.css by the shell every route renders inside, so
// both are visible to every product sheet. publish-workspace.css additionally sees
// website-product.css because PublishWorkspace renders only inside WebsiteProduct, which
// imports that sheet -- both facts are pinned against the source below, so a refactor that
// breaks either assumption fails here instead of silently widening the definition pool.
const CASCADES = new Map([
  [CORE_CSS, [INDEX_CSS, CORE_CSS]],
  [ECOMMERCE_CSS, [INDEX_CSS, CORE_CSS, ECOMMERCE_CSS]],
  [WEBSITE_CSS, [INDEX_CSS, CORE_CSS, WEBSITE_CSS]],
  [PUBLISH_CSS, [INDEX_CSS, CORE_CSS, WEBSITE_CSS, PUBLISH_CSS]],
])

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

function read(path) {
  return readFileSync(resolve(ROOT, path), 'utf8').replaceAll('\r\n', '\n')
}

function lineOf(source, index) {
  return source.slice(0, index).split('\n').length
}

// --- scanners ---------------------------------------------------------------------------

const HEX_TOKEN = /#[0-9a-fA-F]{3,8}\b/g

function commentSpans(source) {
  const spans = []
  for (const match of source.matchAll(/\/\*[\s\S]*?\*\//g)) spans.push([match.index, match.index + match[0].length])
  return spans
}

function inSpans(index, spans) {
  return spans.some(([start, end]) => index >= start && index < end)
}

// Every var() consumption outside comments: the property name, whether a top-level comma
// (i.e. a fallback) exists, and the span. Parenthesis-balanced by hand because fallbacks
// nest freely -- `var(--a, calc(100% - var(--b, 4px)))` is three tokens deep -- and the
// INNER consumptions are real: if --a is missing the browser asks --b, and a missing --b
// is the same silent dead token rule 2 exists for. So nested var() consumptions are
// reported individually, each with its own fallback status.
function varOccurrences(source, comments) {
  const out = []
  const opener = /var\(/g
  let match
  while ((match = opener.exec(source))) {
    if (inSpans(match.index, comments)) continue
    let depth = 1
    let i = match.index + 4
    let comma = -1
    while (i < source.length && depth > 0) {
      const character = source[i]
      if (character === '(') depth += 1
      else if (character === ')') depth -= 1
      else if (character === ',' && depth === 1 && comma === -1) comma = i
      i += 1
    }
    assert.ok(depth === 0, `unbalanced parentheses in a var() expression at offset ${match.index}`)
    const name = source.slice(match.index + 4, comma === -1 ? i - 1 : comma).trim()
    out.push({ name, hasFallback: comma !== -1, start: match.index, end: i, fallbackStart: comma })
  }
  return out
}

// Every custom property the stylesheet declares, comments stripped. Conditionality (media
// queries, .theme-dark blocks) is deliberately ignored: a declaration anywhere in the
// cascade is a definition, matching how the tokens are actually organised (light values on
// :root, dark overrides under .theme-dark).
function customPropertyDefinitions(source) {
  const stripped = source.replace(/\/\*[\s\S]*?\*\//g, '')
  const defs = new Set()
  for (const match of stripped.matchAll(/(?:^|[{;\s])(--[A-Za-z0-9_-]+)\s*:/g)) defs.add(match[1])
  return defs
}

// Raw hex occurrences classified into the ratchet's three bins.
function hexAudit(source) {
  const comments = commentSpans(source)
  const vars = varOccurrences(source, comments)
  const live = []
  let inComments = 0
  let inFallbacks = 0
  for (const match of source.matchAll(HEX_TOKEN)) {
    if (inSpans(match.index, comments)) { inComments += 1; continue }
    if (vars.some((v) => v.fallbackStart !== -1 && match.index > v.fallbackStart && match.index < v.end)) { inFallbacks += 1; continue }
    live.push(match.index)
  }
  return { live, inComments, inFallbacks, vars }
}

// --- scanner probes ---------------------------------------------------------------------

// Pins the classification rules so they cannot quietly narrow: [css, live, inComments,
// inFallbacks]. The carve-outs are load-bearing (they are what makes the recorded ceilings
// mean "live literals"), so each one is exercised, including the nested-paren fallback.
const HEX_PROBES = [
  ['a { color: #fff; }', 1, 0, 0],
  ['a { color: #FfF0; border-color: #ffffff80; }', 2, 0, 0],
  ['/* #fff #000 */ a { color: #123456; }', 1, 2, 0],
  ['a { border: 1px solid var(--core-quiet, #5f6f67); }', 0, 0, 1],
  ['a { background: var(--x, linear-gradient(135deg, #fff, rgba(0,0,0,.2), #000)); }', 0, 0, 2],
  ['/* var(--x, #fff) */ a { color: var(--y, #0b745e); }', 0, 1, 1],
  ['a { color: var(--ink); background: #f6f4ee; }', 1, 0, 0],
]
for (const [css, live, inComments, inFallbacks] of HEX_PROBES) {
  const audit = hexAudit(css)
  check(
    audit.live.length === live && audit.inComments === inComments && audit.inFallbacks === inFallbacks,
    `hex classification of \`${css}\` is live=${live} comments=${inComments} fallbacks=${inFallbacks}, got live=${audit.live.length} comments=${audit.inComments} fallbacks=${audit.inFallbacks}`,
  )
}

// Pins the var() parser: [css, [name, hasFallback][]].
const VAR_PROBES = [
  ['a { color: var(--ink); }', [['--ink', false]]],
  ['a { color: var(--ink, #123); }', [['--ink', true]]],
  ['a { background: var(--a, var(--b)); }', [['--a', true], ['--b', false]]],
  ['a { width: var( --w , calc(100% - var(--pad, 4px)) ); }', [['--w', true], ['--pad', true]]],
  ['/* var(--ghost) */ a { margin: 0; }', []],
]
for (const [css, expected] of VAR_PROBES) {
  const got = varOccurrences(css, commentSpans(css)).map((v) => [v.name, v.hasFallback])
  check(
    JSON.stringify(got) === JSON.stringify(expected),
    `var() parse of \`${css}\` is ${JSON.stringify(expected)}, got ${JSON.stringify(got)}`,
  )
}

// Pins the definition scanner, including that comments and consumptions never count.
const DEFINITION_PROBES = [
  [':root { --core-line: rgba(31,68,51,.12); }', ['--core-line'], []],
  ['.theme-dark .x { --y:#000; color: var(--y); }', ['--y'], []],
  ['/* --z: gone */ a { color: var(--z); }', [], ['--z']],
]
for (const [css, present, absent] of DEFINITION_PROBES) {
  const defs = customPropertyDefinitions(css)
  for (const name of present) check(defs.has(name), `\`${css}\` defines ${name}`)
  for (const name of absent) check(!defs.has(name), `\`${css}\` must not count ${name} as defined`)
}

// --- the cascade assumptions, pinned against the source ---------------------------------

check(
  read('showroom/src/main.tsx').includes("import './index.css'"),
  'index.css is imported unconditionally by main.tsx; if this moved, revisit CASCADES',
)
check(
  read('showroom/src/core/CoreShell.tsx').includes("import './core-app.css'"),
  'core-app.css is imported by the shell every route renders inside; if this moved, revisit CASCADES',
)
const websiteProductTsx = read('showroom/src/products/website/WebsiteProduct.tsx')
check(
  websiteProductTsx.includes("import { PublishWorkspace } from './PublishWorkspace'"),
  'PublishWorkspace renders only inside WebsiteProduct; if this import is gone, publish-workspace.css can no longer borrow website-product.css definitions in CASCADES',
)
check(
  websiteProductTsx.includes("import './website-product.css'"),
  'WebsiteProduct imports website-product.css, which is what puts it in publish-workspace.css\'s cascade',
)

// The ceilings table and the scanned-file set must be the same set, and every row must be
// machine-rewritable (the lowering below edits this file in place, so a formatting drift
// that breaks the rewrite pattern has to fail loudly here, not silently skip the ratchet).
const selfSource = readFileSync(SELF, 'utf8')
const escapeForRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
check(
  JSON.stringify([...HEX_CEILINGS.keys()].sort()) === JSON.stringify([...CASCADES.keys()].sort()),
  'HEX_CEILINGS and CASCADES cover the same stylesheets',
)
for (const path of HEX_CEILINGS.keys()) {
  const anchors = selfSource.match(new RegExp(`\\['${escapeForRegex(path)}', \\d+\\]`, 'g')) ?? []
  check(anchors.length === 1, `exactly one rewritable ceiling row for ${path}, got ${anchors.length}`)
}

// --- the scan ---------------------------------------------------------------------------

const definitionsByFile = new Map()
for (const path of new Set([...CASCADES.values()].flat())) definitionsByFile.set(path, customPropertyDefinitions(read(path)))

check(definitionsByFile.get(CORE_CSS).size >= 40, `core-app.css declares the token vocabulary, got ${definitionsByFile.get(CORE_CSS).size} definitions`)
check(definitionsByFile.get(INDEX_CSS).has('--sm-bg'), 'index.css still carries the global --sm-* tokens')

const ratchetOffenders = []
const lowerings = []
const undefinedOffenders = []
let liveHexTotal = 0
let varUseTotal = 0

for (const [path, cascade] of CASCADES) {
  const source = read(path)
  const audit = hexAudit(source)
  const ceiling = HEX_CEILINGS.get(path)
  liveHexTotal += audit.live.length
  varUseTotal += audit.vars.length

  if (audit.live.length > ceiling) {
    ratchetOffenders.push({ path, count: audit.live.length, ceiling, lines: audit.live.map((index) => lineOf(source, index)) })
  } else if (audit.live.length < ceiling) {
    lowerings.push({ path, from: ceiling, to: audit.live.length })
  }

  const defined = new Set(cascade.flatMap((entry) => [...definitionsByFile.get(entry)]))
  for (const consumption of audit.vars) {
    if (consumption.hasFallback || defined.has(consumption.name)) continue
    undefinedOffenders.push({ path, name: consumption.name, line: lineOf(source, consumption.start) })
  }
}

// The var() corpus only grows as tokenization proceeds, so this floor is a safe pin that
// the scanner is really reading the stylesheets. There is deliberately NO such floor on
// live hex: the programme's end state is zero, and a corpus floor would fight the ratchet.
check(varUseTotal > 1500, `the scan saw the stylesheets' var() corpus, got ${varUseTotal}`)

check(
  ratchetOffenders.length === 0,
  ratchetOffenders.length === 0
    ? 'no stylesheet exceeds its live-hex ceiling'
    : `hex-literal ratchet exceeded:\n${ratchetOffenders
        .map((entry) => `    ${entry.path}: ${entry.count} live hex literals, ceiling ${entry.ceiling} (lines ${entry.lines.join(', ')})`)
        .join('\n')}\n  Retire the literal you added: use a token, a color-mix() of tokens, or park it as a var() fallback. Never raise a ceiling.`,
)

check(
  undefinedOffenders.length === 0,
  undefinedOffenders.length === 0
    ? 'every fallback-less var() resolves to a definition in its own cascade'
    : `fallback-less var() of properties no stylesheet in the cascade defines:\n${undefinedOffenders
        .map((entry) => `    var(${entry.name}) at ${entry.path}:${entry.line}`)
        .join('\n')}\n  Define the property in the cascade, add a fallback, or fix the name -- this is the silent-dead-token shape of the shadow-ramp and --website-quiet incidents.`,
)

// Ratchet lowering: write the new floors in place (see HOW THIS TABLE CHANGES above), and
// say so loudly enough that the re-stamped file gets committed with the batch.
if (lowerings.length) {
  let next = selfSource
  for (const { path, from, to } of lowerings) {
    next = next.replace(new RegExp(`(\\['${escapeForRegex(path)}', )${from}(\\])`), `$1${to}$2`)
  }
  check(next !== selfSource, 'ceiling lowering rewrote this file')
  writeFileSync(SELF, next)
  for (const { path, from, to } of lowerings) console.log(`css contracts: hex ceiling for ${path} lowered ${from} -> ${to}`)
  console.log('css contracts: NEW FLOORS WRITTEN to tools/check_css_contracts.mjs -- commit this file with the batch that retired the literals')
}

console.log(
  `css contracts: ${checks} checks passed (${liveHexTotal} live hex under ${[...HEX_CEILINGS.values()].reduce((a, b) => a + b, 0)} ceiling across ${CASCADES.size} stylesheets, ${varUseTotal} var() consumptions all resolving, ${lowerings.length} ceilings lowered)`,
)
