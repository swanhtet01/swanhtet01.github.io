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
// dark counterpart is a defect unless it is on the list below, and every entry on that list
// carries the reason it is there and the measurement that justifies it.
//
// If this fails, the fix is usually one of:
//   - add a `.theme-dark <selector> { background: ... }` rule, or
//   - use var(--core-panel) instead of #fff (identical in light, correct in dark), or
//   - if the surface is deliberately theme-blind, add it below WITH a measured ratio.
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

// Deliberately theme-blind surfaces. Each one renders a LIGHT card in dark mode ON PURPOSE,
// and carries text that is hardcoded dark to match. Removing an entry from this list without
// making its text theme-aware in the same change reintroduces the exact 201-failure
// regression this branch made once and reverted.
const THEME_BLIND = new Map([
  ['.storefront-grid article', 'Preview of the customer PUBLISHED storefront, which is a light page. Its container sets a theme-blind dark text colour that descendants inherit; product name measured 16.22:1 in dark mode.'],
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

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

function luminance(hex) {
  let value = hex.replace('#', '')
  if (value.length === 3) value = [...value].map((character) => character + character).join('')
  if (value.length !== 6) return null
  const channel = (pair) => {
    const raw = parseInt(pair, 16) / 255
    return raw <= 0.03928 ? raw / 12.92 : Math.pow((raw + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * channel(value.slice(0, 2)) + 0.7152 * channel(value.slice(2, 4)) + 0.0722 * channel(value.slice(4, 6))
}

const offenders = []
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
    const background = /background(?:-color)?:\s*(#[0-9a-fA-F]{3,6})\b/.exec(body)
    if (!background) continue
    const light = luminance(background[1])
    if (light === null || light < LIGHT_LUMINANCE) continue

    for (const part of rawSelector.split(',')) {
      const selector = part.trim()
      if (!selector || selector.startsWith('@')) continue
      surfacesScanned += 1
      if (covered.has(selector)) continue
      // A .theme-dark rule anywhere that TARGETS this selector also counts, e.g.
      // `.theme-dark .ecommerce-ops-cockpit .core-eyebrow` covers the cockpit's text.
      if ([...covered].some((entry) => entry.startsWith(`${selector} `))) continue
      if (THEME_BLIND.has(selector)) continue
      offenders.push({ path, selector, background: background[1] })
    }
  }
}

check(surfacesScanned > 20, `the scan found stylesheet surfaces to check, got ${surfacesScanned}`)

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
const allSource = STYLESHEETS.map((path) => readFileSync(path, 'utf8')).join('\n')
for (const [selector, reason] of THEME_BLIND) {
  check(
    allSource.includes(selector),
    `theme-blind exception "${selector}" still exists in the stylesheets; remove it from the list if the rule is gone`,
  )
  check(reason.length > 40, `theme-blind exception "${selector}" states why it is exempt`)
}

console.log(`theme surface contract: ${checks} checks passed (${surfacesScanned} light surfaces scanned, ${THEME_BLIND.size} documented exceptions)`)
