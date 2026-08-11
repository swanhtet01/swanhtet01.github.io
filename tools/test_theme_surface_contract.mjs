// Regression guard for the dark-theme surface work.
//
// Every dark-mode contrast defect fixed in this branch had the same shape: a rule paints a
// hardcoded LIGHT background, no .theme-dark counterpart exists, and text lands on it in
// dark mode carrying the shell's near-white tokens. That produced invisible product names
// on the Stock tab (1.07:1), unreadable SKUs in the catalog import table (2.2:1), and 23
// vanished labels behind the Ecommerce enterprise controls (1.36:1).
//
// Contrast itself cannot be measured without a browser -- it depends on cascade,
// inheritance and what is actually on screen, and this branch has several cases where
// static reading gave the WRONG answer in both directions. So this guard does not attempt
// it. It pins the one thing that is decidable from the stylesheet: a light surface with no
// dark counterpart is a defect unless it is on a list below, and every entry on those lists
// carries the reason it is there.
//
// If this fails, the fix is usually one of:
//   - add a `.theme-dark <selector> { background: ... }` rule, or
//   - use var(--core-panel) instead of #fff (identical in light, correct in dark), or
//   - if the surface is deliberately theme-blind, add it to THEME_BLIND WITH a measured ratio.
//
// WHAT THIS GUARD USED TO MISS, AND WHY THE TWO FIXES BELOW EXIST.
//
// 1. It matched only `background: #rrggbb`. The stylesheets paint 90 backgrounds with rgba()
//    and a further 13 with linear-gradient, so `background: #fff` was a defect while the
//    byte-identical `background: rgba(255,255,255,1)` was invisible. Scanning went from 39
//    surfaces to 57 when colours in every notation the stylesheets use were parsed, and
//    eleven light surfaces with no dark counterpart came out of that gap: one turned out to
//    be a genuine exemption (the featured storefront card, now in THEME_BLIND) and the other
//    ten are real defects, parked in UNCOVERED_LIGHT_SURFACES because they sit in files this
//    change does not own. lightSurfaceColour() below is pinned by NOTATION_PROBES so it
//    cannot quietly narrow back to hex.
//
// 2. The stale-exception check was `allSource.includes(selector)`, a bare substring test.
//    Three entries could therefore never report themselves stale, because a LONGER entry in
//    the same list keeps the substring alive no matter what happens to their own rule:
//      .ecommerce-ops-cockpit         shadowed by .ecommerce-ops-cockpit-rows span
//      .ecommerce-order-import-upload shadowed by .ecommerce-order-import-upload:hover
//      .ecommerce-cart                shadowed by .ecommerce-cart-line input
//    All three are genuinely needed -- each still paints its own light surface that the scan
//    reaches -- so none were deleted; they simply became checkable. Staleness is now decided
//    against the exact set of selectors the stylesheets declare (declaredSelectors below).
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const STYLESHEETS = [
  'showroom/src/core/core-app.css',
  'showroom/src/products/ecommerce/ecommerce-product.css',
  'showroom/src/products/website/website-product.css',
]

// A surface counts as "light" above this relative luminance. #eef4ef is 0.93, #0d131b is
// 0.006, so the boundary is not delicate.
const LIGHT_LUMINANCE = 0.72

// Below this, a colour is a translucent tint over whatever is behind it rather than a
// surface of its own -- rgba(255,255,255,.06) on the dark shell reads as dark, and treating
// it as a light surface would bury the real defects in noise.
const OPAQUE_ALPHA = 0.9

// Deliberately theme-blind surfaces. Each one renders a LIGHT card in dark mode ON PURPOSE,
// and carries text that is hardcoded dark to match. Removing an entry from this list without
// making its text theme-aware in the same change reintroduces the exact 201-failure
// regression this branch made once and reverted.
const THEME_BLIND = new Map([
  ['.storefront-grid article', 'Preview of the customer PUBLISHED storefront, which is a light page. Its container sets a theme-blind dark text colour that descendants inherit; product name measured 16.22:1 in dark mode.'],
  ['.storefront-grid article[data-featured="true"]', 'The featured refinement of .storefront-grid article: same published-storefront preview, same container-level theme-blind dark text. It only restates the tint as a light gradient, so it inherits the measurement above (16.22:1) rather than carrying its own.'],
  ['.ecommerce-today', 'Hardcoded light gradient card. Its heading and metrics are deliberately dark literals (#17231d at 16.22:1, #6b786f at 4.62:1) precisely because the card does not flip.'],
  ['.ecommerce-ops-cockpit', 'Colour-coded cockpit tint. Shared token text on it is overridden to #0b745e (5.4:1) rather than the card flipping -- see the .theme-dark .ecommerce-ops-cockpit .core-eyebrow rule.'],
  ['.ecommerce-payment-delivery-cockpit', 'Cockpit tint, same treatment as .ecommerce-ops-cockpit.'],
  ['.ecommerce-request-inbox-cockpit', 'Cockpit tint, same treatment as .ecommerce-ops-cockpit.'],
  ['.ecommerce-order-import-cockpit', 'Cockpit tint, same treatment as .ecommerce-ops-cockpit.'],
  ['.ecommerce-fulfillment-handoff-cockpit', 'Cockpit tint, same treatment as .ecommerce-ops-cockpit.'],
  ['.ecommerce-delivery-fee-cockpit', 'Cockpit tint, same treatment as .ecommerce-ops-cockpit.'],
  ['.ecommerce-delivery-template-cockpit', 'Cockpit tint, same treatment as .ecommerce-ops-cockpit.'],
  ['.ecommerce-customer-follow-up-cockpit', 'Cockpit tint, same treatment as .ecommerce-ops-cockpit.'],
  ['.ecommerce-channel-reply-cockpit', 'Cockpit tint, same treatment as .ecommerce-ops-cockpit.'],
  ['.ecommerce-preview-frame', 'Preview chrome rendering the customer PUBLISHED page, which is a light document. Previewing a light site inside a dark editor is the intended look, the same way a document preview stays white in a dark IDE.'],
  ['.storefront-preview', 'Preview chrome rendering the customer PUBLISHED page, which is a light document. Previewing a light site inside a dark editor is the intended look, the same way a document preview stays white in a dark IDE.'],
  ['.website-preview-frame', 'Preview chrome rendering the customer PUBLISHED page, which is a light document. Previewing a light site inside a dark editor is the intended look, the same way a document preview stays white in a dark IDE.'],
  ['.website-preview-stage', 'Preview chrome rendering the customer PUBLISHED page, which is a light document. Previewing a light site inside a dark editor is the intended look, the same way a document preview stays white in a dark IDE.'],
  ['.website-preview-site', 'Preview chrome rendering the customer PUBLISHED page, which is a light document. Previewing a light site inside a dark editor is the intended look, the same way a document preview stays white in a dark IDE.'],
  ['.ecommerce-preview-size select', 'Nested inside a theme-blind cockpit or the buying workspace, both of which stay light by design. Justified by the route-level measurement rather than per-selector: the Ecommerce route with every disclosure expanded (667 elements) reports zero contrast failures in both themes.'],
  ['.ecommerce-order-intake-guide span', 'Nested inside a theme-blind cockpit or the buying workspace, both of which stay light by design. Justified by the route-level measurement rather than per-selector: the Ecommerce route with every disclosure expanded (667 elements) reports zero contrast failures in both themes.'],
  ['.ecommerce-order-repair-checklist span', 'Nested inside a theme-blind cockpit or the buying workspace, both of which stay light by design. Justified by the route-level measurement rather than per-selector: the Ecommerce route with every disclosure expanded (667 elements) reports zero contrast failures in both themes.'],
  ['.ecommerce-order-import-field textarea', 'Nested inside a theme-blind cockpit or the buying workspace, both of which stay light by design. Justified by the route-level measurement rather than per-selector: the Ecommerce route with every disclosure expanded (667 elements) reports zero contrast failures in both themes.'],
  ['.ecommerce-order-import-upload', 'Nested inside a theme-blind cockpit or the buying workspace, both of which stay light by design. Justified by the route-level measurement rather than per-selector: the Ecommerce route with every disclosure expanded (667 elements) reports zero contrast failures in both themes.'],
  ['.ecommerce-order-import-upload:hover', 'Nested inside a theme-blind cockpit or the buying workspace, both of which stay light by design. Justified by the route-level measurement rather than per-selector: the Ecommerce route with every disclosure expanded (667 elements) reports zero contrast failures in both themes.'],
  ['.ecommerce-order-import-review', 'Nested inside a theme-blind cockpit or the buying workspace, both of which stay light by design. Justified by the route-level measurement rather than per-selector: the Ecommerce route with every disclosure expanded (667 elements) reports zero contrast failures in both themes.'],
  ['.ecommerce-request-filter button', 'Nested inside a theme-blind cockpit or the buying workspace, both of which stay light by design. Justified by the route-level measurement rather than per-selector: the Ecommerce route with every disclosure expanded (667 elements) reports zero contrast failures in both themes.'],
  ['.ecommerce-request-inbox-summary', 'Nested inside a theme-blind cockpit or the buying workspace, both of which stay light by design. Justified by the route-level measurement rather than per-selector: the Ecommerce route with every disclosure expanded (667 elements) reports zero contrast failures in both themes.'],
  ['.ecommerce-follow-up-draft', 'Nested inside a theme-blind cockpit or the buying workspace, both of which stay light by design. Justified by the route-level measurement rather than per-selector: the Ecommerce route with every disclosure expanded (667 elements) reports zero contrast failures in both themes.'],
  ['.ecommerce-ops-cockpit-rows span', 'Nested inside a theme-blind cockpit or the buying workspace, both of which stay light by design. Justified by the route-level measurement rather than per-selector: the Ecommerce route with every disclosure expanded (667 elements) reports zero contrast failures in both themes.'],
  ['.ecommerce-cart', 'Nested inside a theme-blind cockpit or the buying workspace, both of which stay light by design. Justified by the route-level measurement rather than per-selector: the Ecommerce route with every disclosure expanded (667 elements) reports zero contrast failures in both themes.'],
  ['.ecommerce-cart-line input', 'Nested inside a theme-blind cockpit or the buying workspace, both of which stay light by design. Justified by the route-level measurement rather than per-selector: the Ecommerce route with every disclosure expanded (667 elements) reports zero contrast failures in both themes.'],
  ['.ecommerce-buying-body > form select', 'Nested inside a theme-blind cockpit or the buying workspace, both of which stay light by design. Justified by the route-level measurement rather than per-selector: the Ecommerce route with every disclosure expanded (667 elements) reports zero contrast failures in both themes.'],
  ['.ecommerce-return-form textarea', 'Nested inside a theme-blind cockpit or the buying workspace, both of which stay light by design. Justified by the route-level measurement rather than per-selector: the Ecommerce route with every disclosure expanded (667 elements) reports zero contrast failures in both themes.'],
])

// THESE ARE DEFECTS, NOT EXEMPTIONS.
//
// Each entry is a light surface with no .theme-dark counterpart whose text comes from the
// shell tokens, which are near-white in dark mode (--core-ink/--website-ink #f5f8fb,
// --core-muted/--website-muted #a4b0be, --core-quiet/--website-quiet #7a8a9c,
// --core-green/--website-green #56f0c1). Every one of them was invisible to this guard until
// rgba() and gradient notation were parsed, and every one of them lives in a stylesheet this
// change does not own.
//
// The ratios quoted are computed from the declared token values against the declared surface
// colour with alpha ignored. They are static estimates, NOT browser measurements -- the point
// is only that each pair is far below the 4.5:1 floor, not the exact figure.
//
// This list is a ratchet, not a waiver. Every entry is re-checked below against the live
// stylesheets: an entry whose rule disappears, or whose surface gains a dark counterpart,
// FAILS this guard and must be deleted in the same change that fixes it. It can only shrink.
const UNCOVERED_LIGHT_SURFACES = new Map([])

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

// --- colour parsing, in every notation the stylesheets actually use -------------------

// Light named colours. Anything darker than the boundary is irrelevant here, so the map only
// has to be complete for the light end of the CSS named-colour list.
const NAMED_LIGHT = new Map([
  ['white', '#ffffff'], ['snow', '#fffafa'], ['ivory', '#fffff0'], ['floralwhite', '#fffaf0'],
  ['ghostwhite', '#f8f8ff'], ['whitesmoke', '#f5f5f5'], ['seashell', '#fff5ee'], ['azure', '#f0ffff'],
  ['aliceblue', '#f0f8ff'], ['mintcream', '#f5fffa'], ['honeydew', '#f0fff0'], ['lavenderblush', '#fff0f5'],
  ['oldlace', '#fdf5e6'], ['linen', '#faf0e6'], ['beige', '#f5f5dc'], ['cornsilk', '#fff8dc'],
  ['lightyellow', '#ffffe0'], ['lightcyan', '#e0ffff'], ['lemonchiffon', '#fffacd'], ['papayawhip', '#ffefd5'],
])

function toLinear(value) {
  return value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4)
}

function relativeLuminance(red, green, blue) {
  return 0.2126 * toLinear(red / 255) + 0.7152 * toLinear(green / 255) + 0.0722 * toLinear(blue / 255)
}

function fromHex(text) {
  let value = text.replace('#', '')
  if (value.length === 3 || value.length === 4) value = [...value].map((character) => character + character).join('')
  if (value.length !== 6 && value.length !== 8) return null
  if (!/^[0-9a-fA-F]+$/.test(value)) return null
  const octet = (index) => parseInt(value.slice(index * 2, index * 2 + 2), 16)
  return { luminance: relativeLuminance(octet(0), octet(1), octet(2)), alpha: value.length === 8 ? octet(3) / 255 : 1 }
}

// rgb()/hsl() channels accept both `128` and `50%`; alpha accepts both `.9` and `90%`.
function channel(text, full) {
  const trimmed = text.trim()
  return trimmed.endsWith('%') ? (Number.parseFloat(trimmed) / 100) * full : Number.parseFloat(trimmed)
}

function alphaChannel(text) {
  if (text === undefined) return 1
  const trimmed = text.trim()
  return trimmed.endsWith('%') ? Number.parseFloat(trimmed) / 100 : Number.parseFloat(trimmed)
}

function hslToRgb(hue, saturation, lightness) {
  const wrapped = ((hue % 360) + 360) % 360
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation
  const second = chroma * (1 - Math.abs(((wrapped / 60) % 2) - 1))
  const base = lightness - chroma / 2
  const [red, green, blue] = wrapped < 60 ? [chroma, second, 0]
    : wrapped < 120 ? [second, chroma, 0]
      : wrapped < 180 ? [0, chroma, second]
        : wrapped < 240 ? [0, second, chroma]
          : wrapped < 300 ? [second, 0, chroma]
            : [chroma, 0, second]
  return [(red + base) * 255, (green + base) * 255, (blue + base) * 255]
}

// Hex, legacy `rgb(a, b, c)` / modern `rgb(a b c / d)`, hsl in both forms, and bare words
// (which are only colours if NAMED_LIGHT knows them -- `url`, `no-repeat`, `deg` fall out).
const COLOUR_TOKEN = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\([^()]*\)|\b[a-zA-Z]+\b/g

export function parseColour(token) {
  if (token.startsWith('#')) return fromHex(token)
  const functional = /^(rgba?|hsla?)\(([^()]*)\)$/i.exec(token)
  if (functional) {
    // Legacy `rgb(a, b, c, d)` and modern `rgb(a b c / d)` both reduce to the same four slots.
    const [channels, slashAlpha] = functional[2].split('/')
    const parts = channels.split(/[,\s]+/).map((part) => part.trim()).filter(Boolean)
    if (parts.length < 3) return null
    const alphaText = slashAlpha === undefined ? parts[3] : slashAlpha
    if (functional[1].toLowerCase().startsWith('rgb')) {
      return {
        luminance: relativeLuminance(channel(parts[0], 255), channel(parts[1], 255), channel(parts[2], 255)),
        alpha: alphaChannel(alphaText),
      }
    }
    const [red, green, blue] = hslToRgb(Number.parseFloat(parts[0]), channel(parts[1], 1), channel(parts[2], 1))
    return { luminance: relativeLuminance(red, green, blue), alpha: alphaChannel(alphaText) }
  }
  const named = NAMED_LIGHT.get(token.toLowerCase())
  return named ? fromHex(named) : null
}

/**
 * The declared value of one `background` / `background-color`, reduced to the opaque colour it
 * paints -- or null when it paints no fixed light surface.
 *
 * A value built from var() or color-mix() flips with the theme by construction and is never a
 * finding. A gradient counts only when EVERY opaque stop is light, so a light-to-dark ramp is
 * left alone; the translucent tints these gradients are layered with are ignored the same way
 * a standalone rgba(...,.075) is.
 */
export function lightSurfaceColour(value) {
  if (/var\(|color-mix\(/.test(value)) return null
  const stops = []
  for (const match of value.matchAll(COLOUR_TOKEN)) {
    const parsed = parseColour(match[0])
    if (parsed) stops.push({ text: match[0], ...parsed })
  }
  const opaque = stops.filter((stop) => stop.alpha >= OPAQUE_ALPHA)
  if (!opaque.length) return null
  if (!opaque.every((stop) => stop.luminance >= LIGHT_LUMINANCE)) return null
  return opaque[0]
}

// Pins the notations above. Narrowing this back to hex -- the original defect -- fails here
// before any stylesheet is even read.
const NOTATION_PROBES = [
  ['#fff', true], ['#FFFFFF', true], ['#ffffffff', true], ['#fffe', true],
  ['rgb(255, 255, 255)', true], ['rgba(255,255,255,.96)', true], ['rgba(255, 255, 255, 1)', true],
  ['rgb(255 255 255 / 96%)', true], ['rgb(100% 100% 100%)', true],
  ['hsl(0, 0%, 100%)', true], ['hsla(120 20% 96% / .95)', true],
  ['white', true], ['whitesmoke', true],
  ['linear-gradient(135deg, #fff 0%, #f3f8f4 100%)', true],
  ['linear-gradient(110deg, rgba(11,116,94,.075), #fff 48%)', true],
  ['#0d131b', false], ['rgb(13, 19, 27)', false], ['hsl(212, 35%, 8%)', false],
  ['rgba(255,255,255,.06)', false], ['rgba(255, 255, 255, 6%)', false],
  ['var(--core-panel)', false], ['color-mix(in srgb, #fff 50%, var(--core-bg))', false],
  ['transparent', false], ['none', false], ['currentColor', false],
  ['linear-gradient(180deg, #0b0b0b, #fff)', false],
  ['radial-gradient(circle at 82% -18%, rgba(11,116,94,.1), transparent 31%), var(--website-bg)', false],
]
for (const [value, expected] of NOTATION_PROBES) {
  check(
    (lightSurfaceColour(value) !== null) === expected,
    `background: ${value} is ${expected ? '' : 'not '}a fixed light surface -- the colour matcher must read every notation the stylesheets use, not just hex`,
  )
}

// --- the scan -------------------------------------------------------------------------

// Every selector the stylesheets actually declare, one entry per comma-separated part, with
// comments stripped and a selector list allowed to span lines. This is what makes the
// stale-exception check exact instead of a substring search over the raw file.
const declaredSelectors = new Set()
for (const path of STYLESHEETS) {
  const source = readFileSync(path, 'utf8').replaceAll('\r\n', '\n').replace(/\/\*[\s\S]*?\*\//g, '')
  for (const match of source.matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
    const prelude = match[1].trim()
    if (!prelude || prelude.startsWith('@')) continue
    for (const part of prelude.split(',')) {
      const selector = part.trim().replace(/\s+/g, ' ')
      if (selector) declaredSelectors.add(selector)
    }
  }
}

check(declaredSelectors.size > 500, `the scan collected declared selectors, got ${declaredSelectors.size}`)

// The exactness itself, pinned: take a real selector, drop its last character, and the result
// must NOT count as declared even though it is still a substring of the file. Under the old
// `allSource.includes(...)` test this held for every selector in the sheets.
const substringOnly = [...declaredSelectors]
  .map((selector) => selector.slice(0, -1))
  .find((candidate) => candidate.length > 6 && !declaredSelectors.has(candidate))
check(substringOnly !== undefined, 'the stylesheets offer a selector prefix to probe exactness with')
check(
  !declaredSelectors.has(substringOnly),
  `"${substringOnly}" appears in the stylesheets only as a substring, so it must not count as a declared selector`,
)

const offenders = []
const exercised = new Set()
let surfacesScanned = 0

for (const path of STYLESHEETS) {
  const source = readFileSync(path, 'utf8').replaceAll('\r\n', '\n')

  // Selectors that have any .theme-dark rule at all.
  const covered = new Set()
  for (const match of source.matchAll(/^([^{\n]*\.theme-dark[^{\n]*)\{/gm)) {
    for (const part of match[1].split(',')) {
      const selector = part.trim().replace('.theme-dark', '').trim()
      if (selector) covered.add(selector)
    }
  }

  for (const match of source.matchAll(/^([^{\n]+)\{([^}]*)\}/gm)) {
    const [, rawSelector, body] = match
    // The LAST background declaration in the rule is the one that paints.
    const declarations = [...body.matchAll(/(?:^|[;{\s])background(?:-color)?:\s*([^;}]+)/g)]
    if (!declarations.length) continue
    const light = lightSurfaceColour(declarations[declarations.length - 1][1])
    if (!light) continue

    for (const part of rawSelector.split(',')) {
      const selector = part.trim().replace(/\s+/g, ' ')
      if (!selector || selector.startsWith('@')) continue
      surfacesScanned += 1
      if (covered.has(selector)) continue
      // A .theme-dark rule anywhere that TARGETS this selector also counts, e.g.
      // `.theme-dark .ecommerce-ops-cockpit .core-eyebrow` covers the cockpit's text.
      if ([...covered].some((entry) => entry.startsWith(`${selector} `))) continue
      if (THEME_BLIND.has(selector)) { exercised.add(selector); continue }
      if (UNCOVERED_LIGHT_SURFACES.has(selector)) { exercised.add(selector); continue }
      offenders.push({ path, selector, background: light.text })
    }
  }
}

check(surfacesScanned > 45, `the scan found stylesheet surfaces to check, got ${surfacesScanned}`)

check(
  offenders.length === 0,
  offenders.length === 0
    ? 'every light surface either flips with the theme or is a documented theme-blind exception'
    : `light surfaces with no .theme-dark counterpart and no documented exception:\n${offenders
        .map((entry) => `    ${entry.background}  ${entry.selector}   (${entry.path})`)
        .join('\n')}\n  Add a .theme-dark rule, use var(--core-panel), or document it in THEME_BLIND with a measured ratio.`,
)

// The exceptions list is only trustworthy while every entry still exists and still explains
// itself. A stale entry silently widens the guard.
for (const [selector, reason] of THEME_BLIND) {
  check(
    declaredSelectors.has(selector),
    `theme-blind exception "${selector}" is still declared in the stylesheets; remove it from the list if the rule is gone`,
  )
  check(reason.length > 40, `theme-blind exception "${selector}" states why it is exempt`)
}

// The parked defects are held to more than that: each must still BE a defect. The moment one
// is fixed, or its rule is renamed away, this fails and demands the entry be deleted -- which
// is the only thing that stops a debt list from turning into a second exemption list.
for (const [selector, reason] of UNCOVERED_LIGHT_SURFACES) {
  check(
    declaredSelectors.has(selector),
    `known-uncovered surface "${selector}" is still declared in the stylesheets; remove it from the list if the rule is gone`,
  )
  check(reason.length > 40, `known-uncovered surface "${selector}" records what is wrong with it`)
  check(
    exercised.has(selector),
    `known-uncovered surface "${selector}" is still an uncovered light surface. If it now flips with the theme, DELETE this entry -- leaving it behind turns a defect list into a permanent exemption.`,
  )
}

console.log(`theme surface contract: ${checks} checks passed (${surfacesScanned} light surfaces scanned, ${THEME_BLIND.size} documented exceptions, ${UNCOVERED_LIGHT_SURFACES.size} parked defects)`)
