// Regression guard for SuperMega's fixed-light application shell.
//
// The product intentionally has no theme switcher. This guard prevents a future change from
// reintroducing one through the application root or CoreShell, while retaining the light-mode
// contrast floors derived from measured operator surfaces below. It does not claim browser or
// hosted acceptance; those require their own journey checks.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

function toLinear(value) {
  return value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4)
}

function relativeLuminance(red, green, blue) {
  return 0.2126 * toLinear(red / 255) + 0.7152 * toLinear(green / 255) + 0.0722 * toLinear(blue / 255)
}

const coreSource = readFileSync('showroom/src/core/core-app.css', 'utf8')
  .replaceAll('\r\n', '\n')
  .replace(/\/\*[\s\S]*?\*\//g, '')
const shellSource = readFileSync('showroom/src/core/CoreShell.tsx', 'utf8')
const appSource = readFileSync('showroom/src/index.css', 'utf8').replaceAll('\r\n', '\n')
const ecommerceSource = readFileSync('showroom/src/products/ecommerce/ecommerce-product.css', 'utf8')
  .replaceAll('\r\n', '\n')
  .replace(/\/\*[\s\S]*?\*\//g, '')
const websiteSource = readFileSync('showroom/src/products/website/website-product.css', 'utf8')
  .replaceAll('\r\n', '\n')
  .replace(/\/\*[\s\S]*?\*\//g, '')

check(
  coreSource.includes(':root {\n  color-scheme: light;'),
  'core-app.css declares a fixed light color-scheme at :root',
)
check(
  appSource.includes('color-scheme: light;'),
  'the application entry stylesheet declares a fixed light color-scheme',
)
check(
  !coreSource.includes('.theme-toggle'),
  'the core stylesheet contains no theme-toggle control styling',
)
check(!coreSource.includes('.theme-dark'), 'the core stylesheet contains no dark-theme selectors')
check(!ecommerceSource.includes('.theme-dark'), 'the Commerce stylesheet contains no dark-theme selectors')
check(!websiteSource.includes('.theme-dark'), 'the Sites stylesheet contains no dark-theme selectors')
check(!coreSource.includes('color-scheme: dark;'), 'the core stylesheet has no dark color scheme')
check(!ecommerceSource.includes('color-scheme: dark;'), 'the Commerce stylesheet has no dark color scheme')
check(!websiteSource.includes('color-scheme: dark;'), 'the Sites stylesheet has no dark color scheme')
check(
  shellSource.includes("document.documentElement.dataset.supermegaTheme = 'light'"),
  'CoreShell pins the document theme dataset to light',
)
check(
  shellSource.includes('core-shell theme-light'),
  'CoreShell renders the fixed light shell class',
)
check(
  !shellSource.includes("theme === 'dark'"),
  'CoreShell has no dynamic dark-theme rendering branch',
)

// --- the light-mode AA floor on measured operator surfaces ---------------------------
// These are token-ratio ratchets from measured browser compositions. They validate only the
// stated light surfaces; a passing result is not browser, hosted, or customer acceptance.

const AA_FLOOR = 4.5

// Resolves a :root token to a literal, following alias chains. Several tokens are declared
// as aliases (`--core-warning: var(--core-warn)`), and because a var() inside a custom
// property is substituted against the element the property is DECLARED on, a :root alias
// freezes to the :root value -- which is exactly what the browser does in light mode, so
// following the chain here reproduces it. The remaining legacy dark declarations are
// inactive under the fixed-light shell, so this section deliberately speaks only about light mode.
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
// contrast recomputation needs the actual channels, so this returns rgba.
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

console.log(`fixed light surface contract: ${checks} checks passed (fixed-light shell policy and ${AA_PINS.length + 1} light-mode AA floors recomputed from current token values)`)
