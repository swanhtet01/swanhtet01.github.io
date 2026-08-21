// Regression guard for the dark-theme surface work.
//
// Every dark-mode contrast defect fixed in this branch had the same shape: a rule paints a
// hardcoded LIGHT background, no .theme-dark counterpart exists, and text lands on it in
// dark mode carrying the shell's near-white tokens. That produced invisible product names
// on the Stock tab (1.07:1), unreadable SKUs in the catalog import table (2.2:1), and 23
// vanished labels behind the Ecommerce enterprise controls (1.36:1).
//
// Contrast on an ARBITRARY surface cannot be measured without a browser -- it depends on
// cascade, inheritance and what is actually on screen, and this branch has several cases
// where static reading gave the WRONG answer in both directions. So the scan below does not
// attempt it. It pins the one thing that is decidable from the stylesheet: a light surface
// with no dark counterpart is a defect unless it is on a list below, and every entry on
// those lists carries the reason it is there.
//
// Two later sections DO pin colour outcomes, and are careful about the difference:
//   - the cascade pins (banner family, and `.theme-dark .core-button`) are pure source
//     facts -- "this rule must not declare these properties" -- and need no rendering;
//   - the AA-floor pins recompute a ratio from the CURRENT token values against surface
//     compositions that were read out of a real browser and recorded here. They are not a
//     substitute for measuring; they are a ratchet on figures already measured, so that a
//     token nudged for one screen cannot silently drop another under 4.5:1.
// Anything this file cannot derive is labelled as RECORDED rather than computed.
//
// A GREEN RUN OF THIS FILE IS NOT EVIDENCE THE COLOURS ARE RIGHT. It skips listed surfaces
// as documented exceptions; text has shipped at 1.01:1 with it fully green; and four light
// surfaces sat between 4.32:1 and 4.47:1 for as long as the tints have existed while every
// gate in this repo passed. Measure in a browser, then pin what you measured.
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

// --- the banner-tint cascade trap, pinned -----------------------------------------------
//
// A defect this file's scan above CANNOT see, because it is not a light surface with a
// missing dark counterpart -- it is a dark counterpart that exists and wins when it should
// not.
//
// The Shop's storage and write banners paint their warning tint from plain 0-2-0 rules
// (`.production-mode-banner[data-write="blocked"]`, `.storage-durability-banner[...]`).
// `.theme-dark .production-mode-banner` is ALSO 0-2-0 and sat ~890 lines later in
// core-app.css, so while it declared `background` and `border-color` it won on source order
// alone and all three tints rendered as a plain untinted panel in dark mode -- measured in
// the browser at #0d131b, byte-identical to an untinted banner, instead of amber or red.
//
// It never needed those two declarations: the banner's BASE rule already sets the same two
// tokens (`var(--core-line)`, `var(--core-panel)`) and both retint themselves inside
// .theme-dark, so the only declaration doing real work was the box-shadow. The fix removed
// the redundant pair rather than escalating the tints to 0-3-0, because escalating repairs
// the rules that exist today and leaves the trap armed for the next one anybody adds.
//
// So: a .theme-dark rule targeting the banner family may set anything EXCEPT the two
// properties the tints use. Restoring either re-arms the trap silently -- nothing else in
// this repo would notice, since the stylesheet still parses, the ratchets are unmoved and
// the tint is translucent rather than a light surface the scan above reaches.
const BANNER_FAMILY = ['.production-mode-banner', '.storage-durability-banner']
const TINT_PROPERTIES = /(?:^|[;{\s])(?:background(?:-color)?|border-color)\s*:/

const coreSource = readFileSync('showroom/src/core/core-app.css', 'utf8')
  .replaceAll('\r\n', '\n')
  .replace(/\/\*[\s\S]*?\*\//g, '')

const bannerThemeRules = []
for (const match of coreSource.matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
  const prelude = match[1].trim()
  if (!prelude || prelude.startsWith('@')) continue
  for (const part of prelude.split(',')) {
    const selector = part.trim().replace(/\s+/g, ' ')
    if (!selector.startsWith('.theme-dark ')) continue
    if (!BANNER_FAMILY.some((cls) => selector.includes(cls))) continue
    bannerThemeRules.push({ selector, body: match[2] })
  }
}

check(
  bannerThemeRules.length > 0,
  'the banner family still has a .theme-dark rule for this pin to hold to the contract',
)
for (const rule of bannerThemeRules) {
  check(
    !TINT_PROPERTIES.test(rule.body),
    `"${rule.selector}" declares background or border-color. It is 0-2-0 and sits AFTER the banner tints, which are also 0-2-0, so it silently defeats them in dark mode -- the exact defect this pin exists for. Declare only what differs from the base rule; the base rule already sets both of these tokens and they retint themselves under .theme-dark.`,
  )
}

// ...and the tints being protected must still exist, so the pin above cannot pass vacuously
// once someone renames or deletes the rules it is guarding.
const BANNER_TINTS = [
  '.production-mode-banner[data-write="blocked"]',
  '.storage-durability-banner[data-durability="evictable"]',
  '.storage-durability-banner[data-durability="full"]',
  '.storage-durability-banner[data-headroom="tight"]',
  '.storage-durability-banner[data-headroom="urgent"]',
]
for (const selector of BANNER_TINTS) {
  check(
    declaredSelectors.has(selector),
    `banner tint "${selector}" is still declared -- the .theme-dark pin above protects nothing without it`,
  )
}

// --- the SAME trap on the destructive button, pinned the same way ------------------------
//
// The banner pin above is written for one family. The trap is not: it fires wherever a
// `.theme-dark <class>` rule RESTATES a token the base rule already sets, because a restated
// token paints nothing new on its own target but still out-cascades every equal-specificity
// variant written earlier in the file.
//
// `.core-button` (:180) declares `border: 1px solid var(--core-line-strong)` and
// `color: var(--core-ink)`. `.theme-dark .core-button` restated BOTH -- no-ops for itself,
// but it is 0-2-0 and sits ~1550 lines after `.core-button.danger` (:188, also 0-2-0), so
// the destructive button lost its red text AND its red border in dark mode. Measured in the
// real dark shell before the fix: color rgb(245,248,251), border-color rgba(166,190,214,.24)
// -- byte-identical to the plain `.core-button` beside it. A button about to do something
// irreversible looked exactly like one that was not.
//
// `background` is NOT in the forbidden set here, unlike the banner pin: the button's base
// rule paints a hardcoded `#fff`, so the dark rule genuinely has to override it. That
// asymmetry is the whole point of the convention -- declare what DIFFERS, nothing else.
const BUTTON_BASE_RESTATEMENTS = /(?:^|[;{\s])(?:color|border-color)\s*:/

const buttonThemeRules = []
for (const match of coreSource.matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
  const prelude = match[1].trim()
  if (!prelude || prelude.startsWith('@')) continue
  for (const part of prelude.split(',')) {
    const selector = part.trim().replace(/\s+/g, ' ')
    // Only the bare `.theme-dark .core-button`. The `.primary` and `:hover` variants are
    // 0-3-0, out-specify `.core-button.danger` on their own merits, and legitimately need
    // to restate colour -- pinning them would be wrong, not merely strict.
    if (selector !== '.theme-dark .core-button') continue
    buttonThemeRules.push({ selector, body: match[2] })
  }
}

check(
  buttonThemeRules.length === 1,
  `exactly one bare ".theme-dark .core-button" rule for this pin to hold to the contract, got ${buttonThemeRules.length}`,
)
for (const rule of buttonThemeRules) {
  check(
    !BUTTON_BASE_RESTATEMENTS.test(rule.body),
    `"${rule.selector}" declares color or border-color. The base rule .core-button already sets both (var(--core-ink), var(--core-line-strong)) and both retint themselves under .theme-dark, so this restates a token rather than overriding one -- and because this rule is 0-2-0 and sits AFTER .core-button.danger (also 0-2-0), it silently strips the destructive button of its red text and red border in dark mode. That is a safety affordance, not a cosmetic one. Declare only what differs from the base rule; here that is "background" alone.`,
  )
}

// ...and the variant being protected must still exist and still carry its own colour, so the
// pin cannot pass vacuously if someone deletes or restyles it.
check(
  declaredSelectors.has('.core-button.danger'),
  '".core-button.danger" is still declared -- the .theme-dark .core-button pin above protects nothing without it',
)
const dangerRule = coreSource.match(/(?:^|\})\s*\.core-button\.danger\s*\{([^{}]*)\}/)
check(
  Boolean(dangerRule) && /color\s*:\s*var\(--core-danger\)/.test(dangerRule[1]),
  '".core-button.danger" still paints its text from var(--core-danger); if it stops, the pin above is guarding a rule that no longer says anything',
)

// --- the light-mode AA floor on the surfaces this repo has actually measured --------------
//
// The header above says contrast cannot be decided from the stylesheet, and for an ARBITRARY
// surface that is still true -- you cannot know what is behind an element without rendering
// it. What this section pins is narrower and is decidable: for a handful of surfaces whose
// composition was read out of a real browser and recorded here, recompute the ratio from the
// CURRENT token values and fail if it drops under the 4.5:1 AA floor.
//
// This exists because a green run of this file is NOT evidence the colours are right. It
// skips listed surfaces as documented exceptions, and text has shipped at 1.01:1 with this
// suite fully green. These four figures were under the floor for as long as the light tints
// have existed -- 4.32 to 4.47 -- while every gate in the repo was passing.
//
// Each entry names the SELECTOR the text was measured on, not the token and not the surface
// it is assumed to belong to. A note in core-app.css once recorded "--core-quiet 4.80:1" for
// a token used on 156 selectors; nobody could check it, and it was wrong. The element was
// `.storage-headroom-detail`.
const AA_FLOOR = 4.5

// Resolves a :root token to a literal, following alias chains. Several tokens are declared
// as aliases (`--core-warning: var(--core-warn)`), and because a var() inside a custom
// property is substituted against the element the property is DECLARED on, a :root alias
// freezes to the :root value -- which is exactly what the browser does in light mode, so
// following the chain here reproduces it. .theme-dark redeclares both the alias and its
// target, which is why this section only ever speaks about light mode.
function tokenValue(name, seen = new Set()) {
  assert.ok(!seen.has(name), `token ${name} does not alias in a cycle`)
  seen.add(name)
  const root = coreSource.match(/:root\s*\{([\s\S]*?)\n\}/)
  assert.ok(root, ':root block is parseable')
  const found = root[1].match(new RegExp(`(?:^|[;{\\s])${name}\\s*:\\s*([^;]+);`))
  assert.ok(found, `${name} is declared on :root`)
  const value = found[1].trim()
  const alias = value.match(/^var\(\s*(--[a-z-]+)\s*\)$/)
  return alias ? tokenValue(alias[1], seen) : value
}

function ruleBody(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const found = coreSource.match(new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^{}]*)\\}`))
  assert.ok(found, `rule "${selector}" is declared`)
  return found[1]
}

// The file-level parseColour() above returns {luminance, alpha} -- enough for the
// light-surface scan, but compositing needs the actual channels, so this returns rgba.
function aaColour(text) {
  const hex = text.trim().match(/^#([0-9a-f]{6})$/i)
  if (hex) {
    const n = parseInt(hex[1], 16)
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 }
  }
  const rgba = text.trim().match(/^rgba?\(([^)]+)\)$/i)
  assert.ok(rgba, `colour "${text}" is hex or rgb()/rgba()`)
  const parts = rgba[1].split(',').map((p) => Number(p.trim()))
  return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 }
}

// src-over composite of a translucent layer onto an opaque one -- what the browser paints.
function composite(top, bottom) {
  return {
    r: top.r * top.a + bottom.r * (1 - top.a),
    g: top.g * top.a + bottom.g * (1 - top.a),
    b: top.b * top.a + bottom.b * (1 - top.a),
    a: 1,
  }
}

// srgb mix, matching color-mix(in srgb, <top> <pct>%, <bottom>).
function mix(top, bottom, pct) {
  const f = pct / 100
  return { r: top.r * f + bottom.r * (1 - f), g: top.g * f + bottom.g * (1 - f), b: top.b * f + bottom.b * (1 - f), a: 1 }
}

// Reuses the file's own relativeLuminance()/toLinear() so the AA pins and the light-surface
// scan can never disagree about what a colour's luminance is.
function contrast(a, b) {
  const [hi, lo] = [relativeLuminance(a.r, a.g, a.b), relativeLuminance(b.r, b.g, b.b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

// Pull the text colour from the rule that actually paints it, so that re-pointing a selector
// at a different token moves the pin with it instead of leaving it measuring a ghost.
function textColourOf(selector) {
  const body = ruleBody(selector)
  const declared = body.match(/(?:^|[;{\s])color\s*:\s*([^;]+)/)
  assert.ok(declared, `"${selector}" declares a color`)
  const viaToken = declared[1].trim().match(/^var\(\s*(--[a-z-]+)\s*\)$/)
  return aaColour(viaToken ? tokenValue(viaToken[1]) : declared[1])
}

// Pull a banner tint out of its own rule and composite it over the shell background, exactly
// as the browser does -- the tints are translucent, so the surface is not the declared value.
function bannerSurface(tintSelector) {
  const body = ruleBody(tintSelector)
  const bg = body.match(/(?:^|[;{\s])background\s*:\s*([^;]+)/)
  assert.ok(bg, `"${tintSelector}" declares a background`)
  return composite(aaColour(bg[1]), aaColour(tokenValue('--core-bg')))
}

const AA_PINS = [
  {
    text: '.storage-headroom-detail',
    on: '.storage-durability-banner[data-headroom="tight"]',
    surface: () => bannerSurface('.storage-durability-banner[data-headroom="tight"]'),
    was: 4.47,
  },
  {
    text: '.storage-headroom-detail',
    on: '.storage-durability-banner[data-headroom="urgent"]',
    surface: () => bannerSurface('.storage-durability-banner[data-headroom="urgent"]'),
    was: 4.38,
  },
  {
    // The durability and write banners render .status-pill.pending; only the URGENT headroom
    // banner swaps in .status-pill.danger (CoreApp.tsx:2943). The pending pill on the red
    // tint is therefore a real combination, not a hypothetical one.
    text: '.status-pill.pending',
    on: '.storage-durability-banner[data-durability="evictable"]',
    surface: () => bannerSurface('.storage-durability-banner[data-durability="evictable"]'),
    was: 4.42,
  },
  {
    text: '.status-pill.pending',
    on: '.storage-durability-banner[data-durability="full"]',
    surface: () => bannerSurface('.storage-durability-banner[data-durability="full"]'),
    was: 4.32,
  },
  {
    // NOT repaired by this lane -- it was already over the floor at 4.71 and --core-green did
    // not move. Pinned anyway because it is the tightest figure on the red tint that no token
    // change is watching, so deepening the tint would drop it silently while every pin above
    // still passed. Stricter than the defect required, deliberately.
    text: '.production-mode-banner > a',
    on: '.storage-durability-banner[data-headroom="urgent"]',
    surface: () => bannerSurface('.storage-durability-banner[data-headroom="urgent"]'),
    was: 4.71,
  },
  {
    // Warn text on a 14% warn tint of its own -- text and surface move together, so this one
    // is only safe to change while watching both. It was 4.34:1 and nobody had filed it.
    text: '.shop-today-module-grid > a[data-tone="attention"] b',
    on: 'its own color-mix(--core-warning 14%, --core-panel) background',
    surface: () => mix(
      aaColour(tokenValue('--core-warn')), // --core-warning is declared as var(--core-warn)
      aaColour(tokenValue('--core-panel')),
      14,
    ),
    was: 4.34,
  },
]

for (const pin of AA_PINS) {
  const ratio = contrast(textColourOf(pin.text), pin.surface())
  check(
    ratio >= AA_FLOOR,
    `"${pin.text}" on ${pin.on} computes ${ratio.toFixed(2)}:1 against the ${AA_FLOOR}:1 AA floor. It measured ${pin.was}:1 before the token darkening and was a real, shipped accessibility failure -- light mode is what a shop owner reads in daylight on a cheap tablet. Raise the text token or lighten the tint; do not lower this floor.`,
  )
}

// A surface read from the browser that this file CANNOT derive: it is a nested composite of
// panel backgrounds on the Shop inventory tab. Recorded here as a literal, and labelled as
// recorded rather than derived so nobody mistakes it for something the parser computed.
// Measured 2026-08-21 on /shop/?tab=inventory at
// `section.supplier-performance > div.supplier-performance-heading > small`, 9px.
// It is the reason the token was darkened instead of the banner tints being lightened: this
// one is not a banner at all, and a banner-local fix would have left it at 4.43:1.
const RECORDED_SURFACE_SUPPLIER_HEADING = '#e2edea'
{
  const ratio = contrast(aaColour(tokenValue('--core-quiet')), aaColour(RECORDED_SURFACE_SUPPLIER_HEADING))
  check(
    ratio >= AA_FLOOR,
    `--core-quiet on the recorded surface ${RECORDED_SURFACE_SUPPLIER_HEADING} (.supplier-performance-heading small) computes ${ratio.toFixed(2)}:1, under the ${AA_FLOOR}:1 AA floor. It measured 4.43:1 before the token darkening.`,
  )
}

console.log(`theme surface contract: ${checks} checks passed (${surfacesScanned} light surfaces scanned, ${THEME_BLIND.size} documented exceptions, ${UNCOVERED_LIGHT_SURFACES.size} parked defects, ${bannerThemeRules.length} banner theme rules and ${buttonThemeRules.length} button theme rule held clear of the properties their base rules already set, ${AA_PINS.length + 1} light-mode AA floors recomputed from current token values)`)
