#!/usr/bin/env node
// Phone-width measurement sweep — visits every screen the four automated 390px
// browser journeys pass through (tools/journey_*.mjs) on the shared harness
// (tools/journey_lib.mjs) and MEASURES the live DOM at each one. It fixes nothing
// and asserts nothing about the product: findings are data, written to a JSON
// report and a Markdown summary, for a human to classify against the source.
//
// Why this exists: P3.10 (DESIGN-PROGRAM.md) was found by the Plant journey — a
// verifier-pinned phone rule hid the "Start here" status notice with display:none,
// which also removed it from the accessibility tree, so a phone operator never saw
// "shift close completed" or the write-blocked reason. That defect class (a phone
// rule quietly discarding load-bearing text) is invisible to the string-pinning
// verifier and to journeys that read the DOM; only computed style and geometry on
// the built app show it. This sweep measures that class everywhere the journeys go.
//
// What is measured on every screen, by getComputedStyle / getBoundingClientRect:
//   1. hiddenNotices  — elements with role=status|alert, aria-live, or a class name
//                       containing notice|status|alert|banner|hint|source, that carry
//                       text but are display:none, visibility:hidden or a 0x0 box.
//                       Each carries the CSSOM rule(s) that match it and hide it,
//                       resolved to showroom/src stylesheet file:line, whether the
//                       rule sits in a phone-width media query, and — when the
//                       element is hidden by an ancestor — which ancestor and why
//                       (closed <details>, closed <dialog>, [hidden], a hidden panel).
//   2. overflow       — elements whose box leaves the viewport horizontally by more
//                       than 1px, excluding descendants of an overflow-x:auto|scroll
//                       ancestor (those scroll by design) and descendants of an
//                       element already reported (the root cause is reported once).
//                       Off-canvas panels are flagged by their transform so a drawer
//                       parked off-screen is distinguishable from a wide table.
//   3. touchTargets   — button, a[href], input, select, textarea, [role=button],
//                       summary with a visible box under 44x44. Each is marked with
//                       the verifier pin that already guards it (PINNED_TOUCH_TARGETS
//                       below, mirrored from tools/verify_app_build.mjs), whether it
//                       renders inline in running text (WCAG 2.5.8 exempts those),
//                       and the box of its enclosing <label> when it has one.
//   4. smallText      — elements with direct text below 0.625rem (10px at the
//                       default root), split into caption contexts (<small>, <code>,
//                       .core-mono — the P3.10 item-2 question of whether the mono
//                       captions carry load-bearing sentences) and everything else.
//
// Navigation reuses the journeys' own routes, tab query strings and pointer clicks
// through runJourney, so a screen is measured exactly as the journey reaches it: a
// fresh profile per product, the guided sample provisioned by the app's own
// onboarding, every record made through the real UI. The record assertions the
// journeys make are NOT repeated here — the journeys own those; this tool only
// waits for each screen to be ready and measures it.
//
// Contract with the environment (same as the journeys): zero dependencies, Node
// built-ins only; Chromium from --chromium / $CHROMIUM_BIN / /opt/pw-browsers /
// PATH, never downloaded; the built app at showroom/dist served from loopback.
//
// Usage:
//   node tools/phone_width_sweep.mjs [--chromium /path/to/chrome] [--out-dir DIR] [--only shop,plant]
// Writes <out-dir>/phone-width-sweep.json and <out-dir>/phone-width-sweep.md and
// prints the JSON report to stdout. Exit 0 when every requested product's screens
// were reached and measured — findings are data, never a failure. Exit 1 only when
// the instrument itself could not complete (no build, no Chromium, a screen the
// journey navigation could not reach): a partial report is still written, and the
// `navigation` block names the product and step that stopped.
//
// Not wired into CI in this change: it is a measurement instrument first. Wiring
// would be one workflow step after the four journeys, uploading <out-dir> as an
// artifact, with a follow-up that turns agreed rows into assertions once each has
// been classified (defect / scope choice / cosmetic) against source.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'

import { JourneyError, PHONE_VIEWPORT, argValue, repoRoot, runJourney } from './journey_lib.mjs'

const CONTRACT = 'supermega.phone-width-sweep.v1'
const PRODUCTS = ['shop', 'plant', 'ecommerce', 'website']
const COMMERCE_KEY = 'supermega.commerce.workspace.v2'
const WEBSITE_KEY = 'supermega.website.workspace.v2'
const STYLESHEET_ROOT = join(repoRoot, 'showroom', 'src')
// Per-journey wall-clock budget. A journey alone runs well inside the harness
// default (90s); the sweep adds one measurement pass per screen on top.
const SWEEP_BUDGET_MS = 300_000

// Touch-target rules tools/verify_app_build.mjs already pins (line numbers as of
// 2026-09-02). A control matching one of these is reported with its pin so the
// summary can separate "not covered by any pin" from "pinned, yet measured under
// 44px" — the second is worth knowing about on its own: it means the pinned rule
// exists but is not what the phone actually renders.
const PINNED_TOUCH_TARGETS = [
  { selector: '.ecommerce-request-filter button', pin: 'verify_app_build.mjs:1180' },
  { selector: '.sidebar-foot .account-shell-link', pin: 'verify_app_build.mjs:1249' },
  { selector: '.topbar-meta > a', pin: 'verify_app_build.mjs:1250' },
  { selector: '.core-skip', pin: 'verify_app_build.mjs:2128' },
  { selector: '.evidence-disclosure > summary, .company-brief-disclosure > summary', pin: 'verify_app_build.mjs:2129' },
  { selector: '.release-review-link', pin: 'verify_app_build.mjs:2130' },
  { selector: '.company-brief-disclosure > .text-link', pin: 'verify_app_build.mjs:2131' },
  { selector: '.preview-hero > .preview-cta', pin: 'verify_app_build.mjs:4082' },
  { selector: '.website-inline-actions > button, .website-navigation-actions > button', pin: 'verify_app_build.mjs:4340' },
  { selector: '.order-record-details > summary', pin: 'verify_app_build.mjs:4506' },
  { selector: '.order-row-more > div .text-link', pin: 'verify_app_build.mjs:4514' },
  { selector: '.order-options > summary', pin: 'verify_app_build.mjs:4568' },
  { selector: '.action-error-detail > summary', pin: 'verify_app_build.mjs:4908' },
  { selector: '.compact-disclosure.setup-workflow-review > summary', pin: 'verify_app_build.mjs:5848' },
  { selector: '.data-row .text-link, .purchase-order-list .text-link', pin: 'verify_app_build.mjs:6505' },
  { selector: '.production-view .output-panel :is(button,input,select,summary)', pin: 'verify_app_build.mjs:7194' },
  { selector: '.product-onboarding-help a', pin: 'verify_app_build.mjs:7195' },
  { selector: '.action-history summary', pin: 'verify_app_build.mjs:7227' },
  { selector: '.shop-item-search input', pin: 'verify_app_build.mjs:7241' },
  { selector: '.order-row-actions .text-link', pin: 'verify_app_build.mjs:7246 (min-width only)' },
  { selector: '.boundary-list a', pin: 'verify_app_build.mjs:7247' },
  { selector: '.company-backup-fields input', pin: 'verify_app_build.mjs:21134' },
]

// ---- the in-page measurement: runs inside the built app, returns plain data ----
// Written as a function so it is linted and readable; serialised with toString()
// and invoked with its config. It must reference nothing outside its own scope.
function measureInPage(config) {
  const VW = window.innerWidth
  const rootPx = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
  const smallTextPx = rootPx * 0.625
  const NOTICE_SELECTOR = '[role="status"],[role="alert"],[aria-live],[class*="notice"],[class*="status"],[class*="alert"],[class*="banner"],[class*="hint"],[class*="source"]'
  const CONTROL_SELECTOR = 'button,a[href],input,select,textarea,[role="button"],summary'
  const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'HTML', 'HEAD', 'BODY'])

  const classes = (el) => (typeof el.className === 'string' ? el.className.split(/\s+/).filter(Boolean) : [])
  function segment(el) {
    let s = el.tagName.toLowerCase()
    if (el.id) return `${s}#${el.id}`
    const cls = classes(el).slice(0, 2)
    if (cls.length) s += `.${cls.join('.')}`
    const parent = el.parentElement
    if (parent) {
      const same = Array.from(parent.children).filter((c) => c.tagName === el.tagName && classes(c).slice(0, 2).join('.') === cls.join('.'))
      if (same.length > 1) s += `:nth-of-type(${Array.from(parent.children).filter((c) => c.tagName === el.tagName).indexOf(el) + 1})`
    }
    return s
  }
  function path(el) {
    const parts = []
    let node = el
    while (node && node !== document.body && parts.length < 5) {
      parts.unshift(segment(node))
      if (node.id) break
      node = node.parentElement
    }
    return parts.join(' > ')
  }
  const clip = (s) => (s || '').replace(/\s+/g, ' ').trim().slice(0, 80)
  const textOf = (el) => clip(el.innerText || el.textContent)
  const round = (n) => Math.round(n * 10) / 10
  const box = (r) => ({ left: round(r.left), right: round(r.right), top: round(r.top), width: round(r.width), height: round(r.height) })

  // Every CSSOM rule that hides, with its media chain. Same-origin sheets only;
  // a sheet that refuses access is recorded so the report says what was not seen.
  const hideRules = []
  const unreadableSheets = []
  function walkRules(list, media) {
    for (const rule of Array.from(list || [])) {
      if (rule.cssRules && (rule.media || rule.conditionText !== undefined)) {
        const text = rule.media ? rule.media.mediaText : rule.conditionText
        walkRules(rule.cssRules, media.concat(rule.media ? [text] : []))
      } else if (rule.selectorText && rule.style) {
        const display = rule.style.getPropertyValue('display')
        const visibility = rule.style.getPropertyValue('visibility')
        if (display === 'none' || visibility === 'hidden') {
          hideRules.push({ selectorText: rule.selectorText, display: display || null, visibility: visibility || null, important: rule.style.getPropertyPriority('display') === 'important', media })
        }
      }
    }
  }
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      walkRules(sheet.cssRules, [])
    } catch (error) {
      unreadableSheets.push(`${sheet.href || 'inline'}: ${error.message}`)
    }
  }
  function rulesHiding(el) {
    return hideRules.filter((rule) => {
      try {
        return el.matches(rule.selectorText)
      } catch {
        return false
      }
    }).map((rule) => ({ ...rule, mediaMatches: rule.media.every((m) => matchMedia(m).matches) })).filter((rule) => rule.mediaMatches)
  }

  // Container state attributes that mean "this pane is not the one on screen".
  const VIEW_STATE_SELECTOR = /\[(data-view|data-surface|data-pane|data-tab|aria-expanded|open)[\]=]/i

  // Why an element has no box when its own computed style does not hide it.
  // Collapsed content is distinguished from a hidden panel: a closed <details>
  // hides its content through the stylesheet's own `details:not([open]) > :not(summary)`
  // rule, and a closed <dialog> through the UA sheet — both are the element's
  // state, not a phone rule, and are labelled as such.
  function hiddenByAncestor(el) {
    let node = el.parentElement
    while (node && node !== document.documentElement) {
      if (node.tagName === 'DIALOG' && !node.open) return { kind: 'closed-dialog', selector: path(node) }
      if (node.hasAttribute('hidden')) return { kind: '[hidden]', selector: path(node) }
      const cs = getComputedStyle(node)
      const parent = node.parentElement
      const collapsed = parent && parent.tagName === 'DETAILS' && !parent.open && node.tagName !== 'SUMMARY'
      if (cs.display === 'none') {
        const rules = rulesHiding(node)
        // A two-pane surface hides its inactive pane through a state attribute on the
        // container (`[data-view="preview"] > .setup`), which is the same "you are looking
        // at the other pane" state as a closed disclosure — not a width rule discarding text.
        const viewPane = !collapsed && rules.some((r) => VIEW_STATE_SELECTOR.test(r.selectorText || ''))
        return { kind: collapsed ? 'closed-details' : viewPane ? 'inactive-view-pane' : 'display:none', selector: path(collapsed ? parent : node), rules }
      }
      if (cs.visibility === 'hidden') return { kind: 'visibility:hidden', selector: path(node), rules: rulesHiding(node) }
      node = node.parentElement
    }
    return null
  }
  function hasScrollingAncestor(el) {
    let node = el.parentElement
    while (node && node !== document.documentElement) {
      const cs = getComputedStyle(node)
      if (cs.overflowX === 'auto' || cs.overflowX === 'scroll') return path(node)
      node = node.parentElement
    }
    return null
  }
  function clippingAncestor(el) {
    let node = el.parentElement
    while (node && node !== document.documentElement) {
      const cs = getComputedStyle(node)
      if (cs.overflowX === 'hidden' || cs.overflowX === 'clip') return path(node)
      node = node.parentElement
    }
    return null
  }
  function transformedAncestor(el) {
    let node = el
    while (node && node !== document.documentElement) {
      const cs = getComputedStyle(node)
      if (cs.transform && cs.transform !== 'none') return { selector: path(node), transform: cs.transform }
      node = node.parentElement
    }
    return null
  }
  const isRendered = (el) => {
    const cs = getComputedStyle(el)
    if (cs.display === 'none' || cs.visibility === 'hidden') return false
    const r = el.getBoundingClientRect()
    return r.width > 0 || r.height > 0
  }

  // 1. Hidden notices. `visibleElsewhere` is whether the same sentence is rendered
  // somewhere on the screen (innerText omits display:none content) — the journeys
  // read several notices that way, so a hidden copy with a visible twin is not a
  // lost message.
  const hiddenNotices = []
  // Every distinct normalized string that is actually rendered somewhere on the screen.
  // This is a SET of whole values compared exactly, not one big haystack searched with
  // includes(): a notice reading "ready" would otherwise be judged visible elsewhere by
  // the word "already" or by "Site file ready" in an unrelated panel, and a notice
  // wrongly marked visible elsewhere is excluded from the candidate set — silently
  // suppressing exactly the regression this sweep exists to find.
  const renderedTexts = new Set()
  {
    const norm = (v) => (v || '').replace(/\s+/g, ' ').trim()
    const whole = norm(document.body.innerText)
    if (whole) renderedTexts.add(whole)
    for (const node of Array.from(document.body.querySelectorAll('*'))) {
      if (SKIP_TAGS.has(node.tagName)) continue
      if (!isRendered(node)) continue
      const t = norm(node.innerText !== undefined ? node.innerText : node.textContent)
      if (t) renderedTexts.add(t)
      for (const child of Array.from(node.childNodes)) {
        if (child.nodeType !== 3) continue
        const own = norm(child.textContent)
        if (own) renderedTexts.add(own)
      }
    }
  }
  for (const el of Array.from(document.querySelectorAll(NOTICE_SELECTOR))) {
    const fullText = (el.textContent || '').replace(/\s+/g, ' ').trim()
    const text = clip(fullText)
    if (!text) continue
    const cs = getComputedStyle(el)
    const r = el.getBoundingClientRect()
    const selfHidden = cs.display === 'none' || cs.visibility === 'hidden'
    const zeroBox = r.width === 0 && r.height === 0
    if (!selfHidden && !zeroBox) continue
    const entry = {
      selector: path(el),
      text,
      role: el.getAttribute('role'),
      ariaLive: el.getAttribute('aria-live'),
      display: cs.display,
      visibility: cs.visibility,
      box: box(r),
      hiddenBy: selfHidden ? 'self' : 'ancestor',
      visibleElsewhere: renderedTexts.has(fullText),
    }
    const parent = el.parentElement
    const collapsedChild = selfHidden && parent && parent.tagName === 'DETAILS' && !parent.open && el.tagName !== 'SUMMARY'
    if (collapsedChild) {
      // The direct child of a closed <details>: hidden by its own matched rule
      // (`details:not([open]) > :not(summary)`), but that is the disclosure's state.
      entry.hiddenBy = 'ancestor'
      entry.ancestor = { kind: 'closed-details', selector: path(parent), rules: rulesHiding(el) }
    } else if (selfHidden) {
      entry.rules = rulesHiding(el)
      // `visibility` INHERITS, so an element inside a closed slide-over panel computes to
      // visibility:hidden with no rule of its own — reporting that as "hidden by self, rule
      // unresolved" tells the reader nothing. When nothing the element itself matches sets
      // visibility, attribute it to the nearest ancestor that does.
      if (cs.visibility === 'hidden' && cs.display !== 'none'
        && !entry.rules.some((r) => r.visibility === 'hidden')) {
        const owner = hiddenByAncestor(el)
        if (owner && owner.kind === 'visibility:hidden') {
          entry.hiddenBy = 'ancestor'
          entry.ancestor = owner
          entry.rules = []
        }
      }
    } else entry.ancestor = hiddenByAncestor(el) || { kind: 'zero-box-without-hidden-ancestor', selector: null }
    hiddenNotices.push(entry)
  }

  // 2. Horizontal overflow.
  const overflow = []
  const reported = new Set()
  for (const el of Array.from(document.body.querySelectorAll('*'))) {
    if (SKIP_TAGS.has(el.tagName)) continue
    const r = el.getBoundingClientRect()
    if (r.width === 0 && r.height === 0) continue
    const right = r.right - VW
    const left = -r.left
    if (right <= 1 && left <= 1) continue
    let ancestorReported = false
    for (let node = el.parentElement; node; node = node.parentElement) {
      if (reported.has(node)) {
        ancestorReported = true
        break
      }
    }
    if (ancestorReported) continue
    const scrolling = hasScrollingAncestor(el)
    if (scrolling) continue
    const cs = getComputedStyle(el)
    reported.add(el)
    overflow.push({
      selector: path(el),
      text: textOf(el),
      overflowRight: round(Math.max(0, right)),
      overflowLeft: round(Math.max(0, left)),
      box: box(r),
      position: cs.position,
      visibility: cs.visibility,
      ariaHidden: el.getAttribute('aria-hidden'),
      transformed: transformedAncestor(el),
      clippedBy: clippingAncestor(el),
    })
  }

  // 3. Touch targets under 44x44.
  const touchTargets = []
  for (const el of Array.from(document.querySelectorAll(CONTROL_SELECTOR))) {
    if (el.tagName === 'INPUT' && el.type === 'hidden') continue
    if (!isRendered(el)) continue
    const r = el.getBoundingClientRect()
    if (r.width >= 44 && r.height >= 44) continue
    const cs = getComputedStyle(el)
    const label = el.closest('label')
    const pins = config.pinned.filter((pin) => {
      try {
        return el.matches(pin.selector)
      } catch {
        return false
      }
    }).map((pin) => pin.pin)
    const parentText = el.parentElement ? Array.from(el.parentElement.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim()) : false
    touchTargets.push({
      selector: path(el),
      tag: el.tagName.toLowerCase(),
      type: el.getAttribute('type'),
      text: textOf(el) || clip(el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.getAttribute('title')),
      width: round(r.width),
      height: round(r.height),
      display: cs.display,
      inlineInText: cs.display === 'inline' && parentText,
      disabled: el.disabled === true,
      labelBox: label && label !== el ? box(label.getBoundingClientRect()) : null,
      pins,
    })
  }

  // 4. Text under 0.625rem.
  const smallText = []
  for (const el of Array.from(document.body.querySelectorAll('*'))) {
    if (SKIP_TAGS.has(el.tagName)) continue
    const own = Array.from(el.childNodes).filter((n) => n.nodeType === 3).map((n) => n.textContent).join(' ')
    // Classified from the FULL string: clip() truncates at 80 characters, and a sentence
    // whose terminating punctuation falls past the cutoff would be judged "not a sentence",
    // understating the load-bearing count this report is read for.
    const full = own.replace(/\s+/g, ' ').trim()
    const text = clip(own)
    if (!text) continue
    const cs = getComputedStyle(el)
    const px = parseFloat(cs.fontSize)
    if (!(px < smallTextPx)) continue
    if (!isRendered(el)) continue
    const caption = el.closest('small, code, .core-mono')
    const words = full.split(' ').filter(Boolean).length
    smallText.push({
      selector: path(el),
      text,
      fontSizePx: round(px),
      fontSizeRem: round(px / rootPx * 100) / 100,
      captionContext: caption ? (caption.tagName === 'SMALL' || caption.tagName === 'CODE' ? caption.tagName.toLowerCase() : '.core-mono') : null,
      sentence: words >= 4 && /[.!?]/.test(full),
      mono: /mono/i.test(cs.fontFamily),
    })
  }

  return {
    url: location.pathname + location.search,
    viewportWidth: VW,
    rootFontSizePx: rootPx,
    smallTextThresholdPx: round(smallTextPx),
    documentScrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
    stylesheets: Array.from(document.styleSheets).map((s) => s.href || 'inline'),
    unreadableSheets,
    hideRuleCount: hideRules.length,
    hiddenNotices,
    overflow,
    touchTargets,
    smallText,
  }
}

const MEASURE_EXPRESSION = `(${measureInPage.toString()})(${JSON.stringify({ pinned: PINNED_TOUCH_TARGETS })})`

// ---- source stylesheet index: CSSOM selector -> showroom/src file:line ----
function listCssFiles(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) out.push(...listCssFiles(full))
    else if (name.endsWith('.css')) out.push(full)
  }
  return out.sort()
}

const normalizeSelector = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/=["']([^"'\]]*)["']\]/g, '=$1]')
  .replace(/\s*([>+~,])\s*/g, '$1')
  .replace(/\s+/g, ' ')
  .trim()
const normalizeMedia = (s) => s.replace(/\s+/g, '').replace(/^@media/, '').trim()

// A small scanner for the flat stylesheets in this repo (no nested style rules):
// every `selector { declarations }` with the @media/@supports chain above it, the
// line it starts on, and whether its declarations hide.
function indexStylesheet(file) {
  const raw = readFileSync(file, 'utf8')
  // Comments become spaces of the same length so line numbers stay exact.
  const src = raw.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  const rules = []
  const stack = []
  let preludeStart = 0
  let i = 0
  const lineAt = (pos) => src.slice(0, pos).split('\n').length
  while (i < src.length) {
    const ch = src[i]
    if (ch === '{') {
      const prelude = src.slice(preludeStart, i).trim()
      if (prelude.startsWith('@')) {
        stack.push(prelude)
        preludeStart = i + 1
        i += 1
        continue
      }
      const end = src.indexOf('}', i)
      const declarations = src.slice(i + 1, end === -1 ? src.length : end)
      rules.push({
        file: relative(repoRoot, file),
        line: lineAt(preludeStart + (src.slice(preludeStart, i).match(/^\s*/) || [''])[0].length),
        selector: prelude,
        media: stack.filter((p) => p.startsWith('@media')),
        declarations: declarations.replace(/\s+/g, ' ').trim(),
        hides: /(^|;)\s*display\s*:\s*none/.test(declarations) || /(^|;)\s*visibility\s*:\s*hidden/.test(declarations),
      })
      i = end === -1 ? src.length : end + 1
      preludeStart = i
      continue
    }
    if (ch === '}') {
      stack.pop()
      preludeStart = i + 1
      i += 1
      continue
    }
    if (ch === ';' && stack.length === 0) preludeStart = i + 1
    i += 1
  }
  return rules
}

function buildSourceIndex() {
  const files = existsSync(STYLESHEET_ROOT) ? listCssFiles(STYLESHEET_ROOT) : []
  const index = new Map()
  for (const file of files) {
    for (const rule of indexStylesheet(file)) {
      if (!rule.hides) continue
      const key = normalizeSelector(rule.selector)
      if (!index.has(key)) index.set(key, [])
      index.get(key).push(rule)
    }
  }
  return { files: files.map((f) => relative(repoRoot, f)), index }
}

// Every rule that reaches here already passed `matchMedia(...).matches` at the 390px
// measurement viewport, so any width-constrained query among its conditions is, by
// construction, one that is active on the phone. An earlier version additionally required
// the breakpoint to be <= 840px, which silently excluded real phone-affecting rules: the
// Website editor panel head is hidden at `max-width: 900px`, which matches at 390px but
// was reported as "phone media: no". A narrower flag than the thing it names is the same
// failure this tool exists to catch, so the arbitrary ceiling is gone.
const PHONE_MEDIA = /max-width:\s*\d/
function isPhoneWidthMedia(mediaList) {
  return mediaList.some((m) => PHONE_MEDIA.test(m))
}

function resolveRule(rule, sourceIndex) {
  const key = normalizeSelector(rule.selectorText)
  const candidates = sourceIndex.index.get(key) || []
  const wantMedia = rule.media.map(normalizeMedia).join('|')
  const exact = candidates.filter((c) => c.media.map(normalizeMedia).join('|') === wantMedia)
  const chosen = exact.length ? exact : candidates
  return {
    ...rule,
    phoneWidthMedia: isPhoneWidthMedia(rule.media),
    source: chosen.map((c) => ({ file: c.file, line: c.line, media: c.media, declarations: c.declarations })),
  }
}

function resolveScreen(screen, sourceIndex) {
  for (const notice of screen.hiddenNotices) {
    if (notice.rules) notice.rules = notice.rules.map((rule) => resolveRule(rule, sourceIndex))
    if (notice.ancestor && notice.ancestor.rules) notice.ancestor.rules = notice.ancestor.rules.map((rule) => resolveRule(rule, sourceIndex))
  }
  return screen
}

// ---- the four product drivers: the journeys' navigation, measured ----
async function sweepShop(j, capture) {
  await j.step('settings', async () => {
    await j.navigate('/settings/?product=shop')
    await j.waitUntil(`Boolean(window.__journey.q('input[autocomplete="organization"]'))`, 'the Business name field')
    await capture('settings-shop')
    await j.type('input[autocomplete="organization"]', null, 'Sweep Test Shop', 'Business name')
    await j.click('form.product-onboarding-form button[type="submit"]', null, 'the setup submit button')
  })
  let sale
  await j.step('counter', async () => {
    await j.waitUntil(`location.pathname === '/shop/' && new URLSearchParams(location.search).get('tab') === 'counter' && document.querySelectorAll('button.shop-product-tile').length > 1`, 'the counter with tiles')
    await capture('counter')
    const workspace = await j.readJson(COMMERCE_KEY)
    const first = workspace.items.findIndex((item) => item.onHand >= 2)
    const second = workspace.items.findIndex((item, i) => i !== first && item.onHand >= 1)
    j.expect(first >= 0 && second >= 0, 'the sample catalog has no two sellable items')
    sale = { first, second }
  })
  await j.step('cart', async () => {
    const tile = (i) => `button.shop-product-tile:nth-of-type(${i + 1})`
    await j.click(tile(sale.first), null, 'first tile')
    await j.click(tile(sale.first), null, 'first tile again')
    await j.click(tile(sale.second), null, 'second tile')
    await j.waitUntil(`Boolean(window.__journey.q('button.shop-mobile-cart'))`, 'the phone cart bar')
    await capture('counter-cart-bar')
    await j.click('button.shop-mobile-cart', null, 'the phone cart bar')
    await j.waitUntil(`Boolean(document.querySelector('.shop-current-sale.is-open'))`, 'the current-sale panel')
    await j.click('.shop-payment-options button', 'Cash', 'the Cash payment option')
    await capture('current-sale-open')
    await j.click('button.shop-review-sale', null, 'Review order')
    await j.waitUntil(`Boolean(document.querySelector('dialog.accountable-action-gate[open] #action-confirm-title'))`, 'the counter review gate')
    await capture('counter-review-gate')
    await j.type('dialog.accountable-action-gate[open] form input:not([readonly])', null, 'Sweep cashier', 'the Cashier field')
    await j.click('dialog.accountable-action-gate[open] form button[type="submit"]', null, 'Create order')
    await j.waitUntil(`!document.querySelector('dialog.accountable-action-gate[open]') && !document.querySelector('button.shop-mobile-cart')`, 'the gate to close')
    await capture('counter-after-order')
  })
  await j.step('orders', async () => {
    await j.navigate('/shop/?tab=orders')
    await j.waitUntil(`Boolean(window.__journey.q('.order-list button', 'Paid & handed over'))`, 'the Orders tab')
    await capture('orders-open')
    await j.click('.order-list button', 'Paid & handed over', 'Paid & handed over')
    await j.waitUntil(`Boolean(document.querySelector('dialog.accountable-action-gate[open] #action-confirm-title'))`, 'the settle gate')
    await capture('settle-gate')
    await j.type('dialog.accountable-action-gate[open] form input:not([readonly])', null, 'Sweep cashier', 'the settle gate name field')
    await j.click('dialog.accountable-action-gate[open] form button[type="submit"]', null, 'Confirm change')
    await j.waitUntil(`!document.querySelector('dialog.accountable-action-gate[open]') && document.body.innerText.includes('0 orders need action')`, 'the Orders tab after the settle')
    await capture('orders-after-settle')
  })
  await j.step('counter-again', async () => {
    await j.navigate('/shop/?tab=counter')
    await j.waitUntil(`document.querySelectorAll('button.shop-product-tile').length > 1 && Boolean(window.__journey.q('.shop-counter-summary a'))`, 'the counter after the sale')
    await capture('counter-after-sale')
  })
}

const SHIFT_CLOSE_DETAILS = `Array.from(document.querySelectorAll('details')).find((d) => ((d.querySelector('summary') || {}).textContent || '').trim().startsWith('Shift close'))`

async function sweepPlant(j, capture) {
  async function confirmGate(name) {
    await j.waitUntil(`Boolean(document.querySelector('dialog.accountable-action-gate[open] #action-confirm-title'))`, 'the gate')
    await capture(name)
    await j.type('dialog.accountable-action-gate[open] form input:not([readonly])', null, 'Sweep supervisor', 'the gate name field')
    await j.click('dialog.accountable-action-gate[open] form button[type="submit"]', null, 'Confirm change')
    await j.waitUntil(`!document.querySelector('dialog.accountable-action-gate[open]')`, 'the gate to close')
  }
  await j.step('settings', async () => {
    await j.navigate('/settings/?product=plant')
    await j.waitUntil(`Boolean(window.__journey.q('input[autocomplete="organization"]'))`, 'the Business name field')
    await capture('settings-plant')
    await j.type('input[autocomplete="organization"]', null, 'Sweep Test Plant', 'Business name')
    await j.click('form.product-onboarding-form button[type="submit"]', null, 'the setup submit button')
  })
  await j.step('production', async () => {
    await j.waitUntil(`location.pathname === '/plant/' && new URLSearchParams(location.search).get('tab') === 'production' && Boolean(document.querySelector('.plant-today[data-step="output"]'))`, 'the production tab')
    await capture('production-start-here')
    await j.click('.plant-today-priority button', 'Record output', 'Record output')
    await j.waitUntil(`Boolean(document.querySelector('.output-panel.is-open #plant-output-form select')) && Boolean((document.querySelector('#plant-output-form select') || {}).value)`, 'the output form')
    await capture('output-panel-open')
    await j.type('#plant-output-form input[name="plant-output-shift-reference"]', null, 'Sweep Day Shift', 'the shift reference')
    await j.type('#plant-output-form input[name="plant-output-quantity"]', null, '5', 'the good units')
    await j.click('#plant-output-form button[type="submit"]', null, 'Review good output')
    await confirmGate('output-gate')
    await j.waitUntil(`Boolean(document.querySelector('.output-panel.is-open details[open] form input[step="0.001"]'))`, 'the materials form')
    await capture('materials-form-open')
    await j.type('.output-panel details[open] form input[placeholder="e.g. Resin A or RM-001"]', null, 'RM-SWEEP-01', 'the Material used field')
    await j.type('.output-panel details[open] form input[placeholder="LOT-24"]', null, 'LOT-SWEEP-01', 'the Lot field')
    await j.type('.output-panel details[open] form input[step="0.001"]', null, '2.5', 'the material Quantity field')
    await j.click('.output-panel details[open] form button[type="submit"]', null, 'Review material record')
    await confirmGate('material-gate')
    await j.waitUntil(`!document.querySelector('.output-panel.is-open') && Boolean(document.querySelector('.plant-today[data-step="problems"]'))`, 'Start here to surface the blocker')
    await capture('production-blocker')
  })
  await j.step('problems', async () => {
    await j.click('.plant-today-priority button', 'Review blockers', 'Review blockers')
    await j.waitUntil(`new URLSearchParams(location.search).get('tab') === 'control' && Boolean(document.querySelector('.production-issue-launcher .issue-list article button'))`, 'the Problems tab')
    await capture('control-problems')
    await j.click('.production-issue-launcher .issue-list article button', 'Review CAPA', 'Review CAPA')
    await confirmGate('capa-gate')
    await j.waitUntil(`Boolean(document.querySelector('.plant-today[data-step="shift-close"]'))`, 'Start here to offer the shift close')
    await capture('control-shift-close-offered')
  })
  await j.step('shift-close', async () => {
    await j.click('.plant-today-priority button', 'Close shift', 'Close shift')
    await j.waitUntil(`(() => { const d = ${SHIFT_CLOSE_DETAILS}; return Boolean(d && d.open && d.querySelector('form input')); })()`, 'the Shift close disclosure')
    await capture('shift-close-disclosure')
    await j.click('details form button[type="submit"]', 'Prepare shift close file', 'Prepare shift close file')
    await j.waitUntil(`Boolean(document.querySelector('.plant-shift-close-grid')) && Boolean(window.__journey.q('details button.core-button.primary', 'Review shift close'))`, 'the shift close checklist')
    await capture('shift-close-prepared')
    await j.click('details button.core-button.primary', 'Review shift close', 'Review shift close')
    await confirmGate('close-gate')
    await j.waitUntil(`(document.querySelector('.plant-today-source small') || {}).textContent && (document.querySelector('.plant-today-source small') || {}).textContent.includes('completed')`, 'the close confirmation notice')
    await capture('after-close')
  })
  await j.step('control-reload', async () => {
    await j.navigate('/plant/?tab=control')
    await j.waitUntil(`(() => { const d = ${SHIFT_CLOSE_DETAILS}; const n = d && d.querySelector('.form-notice[role="status"]'); return Boolean(n && n.innerText.includes('Shift closed by')); })()`, 'the persisted close')
    await capture('control-after-reload')
  })
}

async function sweepEcommerce(j, capture) {
  await j.step('shop-setup', async () => {
    await j.navigate('/settings/?product=shop')
    await j.waitUntil(`Boolean(window.__journey.q('input[autocomplete="organization"]'))`, 'the Business name field')
    await j.type('input[autocomplete="organization"]', null, 'Sweep Test Store', 'Business name')
    await j.click('form.product-onboarding-form button[type="submit"]', null, 'the Shop setup submit button')
    await j.waitUntil(`location.pathname === '/shop/' && document.querySelectorAll('button.shop-product-tile').length > 1`, 'the counter')
  })
  await j.step('ecommerce-setup', async () => {
    await j.navigate('/settings/?product=ecommerce')
    await j.waitUntil(`Boolean(window.__journey.q('input[autocomplete="organization"]'))`, 'the Business name field')
    await capture('settings-ecommerce')
    await j.type('input[autocomplete="organization"]', null, 'Sweep Test Store', 'Business name')
    await j.click('form.product-onboarding-form button[type="submit"]', null, 'the Ecommerce setup submit button')
    await j.waitUntil(`location.pathname === '/ecommerce/' && document.querySelectorAll('.storefront-grid article').length > 0 && (() => { const d = document.getElementById('ecommerce-buying-workspace'); return Boolean(d && d.open && d.querySelector('.ecommerce-cart-line') && document.querySelector('.ecommerce-stale-quote strong')); })()`, 'the storefront with the recovered sample request')
    await capture('storefront-sample')
  })
  await j.step('request', async () => {
    await j.click('.storefront-grid article button.storefront-request-button', 'Add to cart', 'Add to cart')
    await j.waitUntil(`Boolean(document.querySelector('#ecommerce-buying-workspace .ecommerce-stale-quote strong')) && Array.from(document.querySelectorAll('.storefront-grid article button')).filter((b) => b.textContent === 'In cart').length > 1`, 'the cart to grow')
    await capture('storefront-cart-added')
    const form = '#ecommerce-buying-workspace form'
    await j.type(`${form} input[autocomplete="name"]`, null, 'Sweep customer', 'the customer Name field')
    await j.type(`${form} input[autocomplete="tel"]`, null, '09 700 000 002', 'the customer Phone field')
    await capture('checkout-filled')
    await j.click(`${form} button[type="submit"]`, null, 'Send order request')
    await j.waitUntil(`Boolean(window.__journey.q('#ecommerce-buying-workspace .ecommerce-quote-receipt[data-current="true"] button', 'Open Shop operator review'))`, 'the request receipt')
    await capture('checkout-receipt')
  })
  await j.step('shop-review', async () => {
    await j.click('#ecommerce-buying-workspace .ecommerce-quote-receipt[data-current="true"] button', 'Open Shop operator review', 'Open Shop operator review')
    await j.waitUntil(`location.pathname === '/shop/' && new URLSearchParams(location.search).get('source') === 'ecommerce' && Boolean(document.querySelector('.channel-source-ready')) && Boolean(document.getElementById('commerce-manual-order-form')) && Boolean(window.__journey.q('button[form="commerce-manual-order-form"]', 'Review order'))`, 'the order composer on the request')
    await capture('shop-orders-composer')
    await j.click('button[form="commerce-manual-order-form"]', 'Review order', 'Review order')
    await j.waitUntil(`Boolean(document.querySelector('dialog.accountable-action-gate[open] #action-confirm-title'))`, 'the order gate')
    await capture('ecommerce-review-gate')
    await j.type('dialog.accountable-action-gate[open] form input:not([readonly])', null, 'Sweep reviewer', 'the gate name field')
    await j.click('dialog.accountable-action-gate[open] form button[type="submit"]', null, 'Confirm change')
    await j.waitUntil(`!document.querySelector('dialog.accountable-action-gate[open]') && !new URLSearchParams(location.search).get('source') && document.body.innerText.includes('1 order needs action')`, 'the Orders tab after the review')
    await capture('shop-orders-after-review')
  })
  await j.step('store-reload', async () => {
    await j.navigate('/ecommerce/')
    await j.waitUntil(`(() => { const r = document.querySelector('#ecommerce-buying-workspace .ecommerce-quote-receipt[data-current="true"] .status-pill'); return Boolean(r && r.textContent === 'Confirmed in Shop'); })()`, 'the confirmed receipt')
    await capture('storefront-confirmed')
  })
}

async function sweepWebsite(j, capture) {
  const checklistReady = (active) => `(() => { const b = document.querySelector('.website-publish-workspace .publish-flow-nav li button[aria-current="step"] strong'); return Boolean(b && b.textContent === ${JSON.stringify(active)}); })()`
  await j.step('settings', async () => {
    await j.navigate('/settings/?product=website')
    await j.waitUntil(`Boolean(window.__journey.q('input[autocomplete="organization"]'))`, 'the Business name field')
    await capture('settings-website')
    await j.type('input[autocomplete="organization"]', null, 'Sweep Test Site', 'Business name')
    await j.click('form.product-onboarding-form button[type="submit"]', null, 'the Website setup submit button')
  })
  await j.step('preview', async () => {
    await j.waitUntil(`location.pathname === '/website/' && Boolean(document.querySelector('.website-today')) && Boolean(window.__journey.q('.website-primary-actions button', 'Edit page'))`, 'the Website preview')
    await capture('website-preview')
    await j.click('.website-primary-actions button', 'Edit page', 'Edit page')
    await j.waitUntil(`Boolean(document.querySelector('.website-editor-panel[aria-labelledby="content-editor-title"] fieldset[data-content-section="hero"] textarea[maxlength="140"]'))`, 'the content editor')
    await capture('website-editor')
    await j.type('fieldset[data-content-section="hero"] textarea[maxlength="140"]', null, 'A real headline saved from the phone by the sweep.', 'the Headline field')
    await j.waitUntil(`Boolean(window.__journey.q('.website-primary-actions button', 'Save'))`, 'the Save action')
    await capture('website-editor-unsaved')
    await j.click('.website-panel-actions button.is-primary', 'Mark page ready', 'Mark page ready')
    await j.click('.website-primary-actions button', 'Save', 'Save')
    await j.waitUntil(`(() => { const n = document.querySelector('.website-notice[data-priority="update"] p'); return Boolean(n && n.textContent.startsWith('Website saved once')); })()`, 'the save confirmation')
    await capture('website-saved')
  })
  await j.step('publish-view', async () => {
    await j.evaluate(`(() => { window.history.pushState(null, '', '/website/?view=publish'); window.dispatchEvent(new PopStateEvent('popstate', { state: null })); })()`)
    await j.waitUntil(checklistReady('Evidence'), 'the file checklist on Evidence')
    await capture('publish-evidence')
    for (let index = 0; index < 3; index += 1) {
      await j.waitUntil(`(() => { const raw = window.__journey.read(${JSON.stringify(WEBSITE_KEY)}); return raw && JSON.parse(raw).evidence.length === ${index} && Boolean(document.querySelector('form.website-evidence-form select')); })()`, `evidence form ${index + 1}`)
      await j.type('form.website-evidence-form input[maxlength="80"]', null, 'Sweep reviewer', 'the Checked by field')
      await j.click('form.website-evidence-form button[type="submit"]', null, 'Save review note')
      await j.waitUntil(`(() => { const raw = window.__journey.read(${JSON.stringify(WEBSITE_KEY)}); return raw && JSON.parse(raw).evidence.length === ${index + 1}; })()`, `evidence record ${index + 1}`)
    }
    await j.waitUntil(checklistReady('Review'), 'the checklist on Review')
    await capture('publish-review')
    await j.type('form.website-approval-form input[maxlength="80"]', null, 'Sweep reviewer', 'the Reviewer field')
    await j.click('form.website-approval-form input[type="checkbox"]', null, 'the review confirmation checkbox')
    await j.waitUntil(`(document.querySelector('form.website-approval-form input[type="checkbox"]') || {}).checked === true`, 'the confirmation')
    await j.click('form.website-approval-form button[type="submit"]', null, 'Save final review')
    await j.waitUntil(`${checklistReady('Site file')} && Boolean(window.__journey.q('#publish-step-snapshot .website-local-publish-controls button', 'Create site file'))`, 'the site-file step')
    await capture('publish-site-file')
    await j.click('#publish-step-snapshot .website-local-publish-controls button', 'Create site file', 'Create site file')
    await j.waitUntil(`Boolean(document.querySelector('#publish-step-snapshot .website-go-live')) && Boolean(document.querySelector('.website-publish-history article'))`, 'the site file recorded')
    await capture('publish-site-file-ready')
  })
  await j.step('publish-reload', async () => {
    await j.navigate('/website/?view=publish')
    await j.waitUntil(`Boolean(document.querySelector('#publish-step-snapshot .website-go-live')) && Boolean(document.querySelector('.website-today'))`, 'the publish view after reload')
    await capture('publish-after-reload')
  })
}

const DRIVERS = { shop: sweepShop, plant: sweepPlant, ecommerce: sweepEcommerce, website: sweepWebsite }

// ---- aggregation across screens: one row per distinct finding, listing screens ----
// The key drops what varies between screens and runs without changing the finding:
// sibling positions (a panel that is the 2nd <details> on one tab and the 4th on
// another), generated ids (ORD-/ACT-/ECR- uuids, #shop-order-… anchors) and
// clock times in the text.
const stableKey = (finding) => [
  finding.selector.replace(/:nth-of-type\(\d+\)/g, '').replace(/#[A-Za-z-]*[0-9A-F]{8}[0-9A-F-]*/g, '#<id>'),
  finding.text.replace(/\b[A-Z]{2,4}-[0-9A-F]{8}(-[0-9A-F]{4}){3}-[0-9A-F]{12}\b/g, '<uuid>').replace(/#[0-9A-F]{8}\b/g, '#<id>').replace(/\b\d{1,2}:\d{2}(?::\d{2})?\s?(?:AM|PM)?/g, '<time>').replace(/\d+/g, '#'),
].join('|')
function aggregate(screens) {
  const rows = { hiddenNotices: new Map(), overflow: new Map(), touchTargets: new Map(), smallText: new Map() }
  for (const screen of screens) {
    for (const category of Object.keys(rows)) {
      for (const finding of screen[category]) {
        const key = stableKey(finding)
        if (!rows[category].has(key)) rows[category].set(key, { ...finding, screens: [] })
        const row = rows[category].get(key)
        row.screens.push(screen.screen)
        // A notice hidden on one screen but rendered on another is worth knowing.
        if (category === 'hiddenNotices' && finding.visibleElsewhere) row.visibleElsewhere = true
      }
    }
  }
  return Object.fromEntries(Object.entries(rows).map(([k, m]) => [k, Array.from(m.values())]))
}

// A hidden notice that is neither collapsed disclosure/dialog content nor rendered
// elsewhere on the screen — the P3.10 shape, the rows to verify against source first.
// Ancestor states that mean "this content belongs to something the operator has not opened,
// or to the pane they are not looking at" — the content is reachable, so it is not the P3.10
// shape. `visibility:hidden` is in this set because that is how the slide-over panels park
// themselves closed (core-app.css .output-panel, .shop-current-sale), and it inherits.
const COLLAPSED = new Set(['closed-details', 'closed-dialog', '[hidden]', 'inactive-view-pane', 'visibility:hidden'])
const isCandidate = (n) => !n.visibleElsewhere && (n.hiddenBy === 'self' || !n.ancestor || !COLLAPSED.has(n.ancestor.kind))

function summarize(product) {
  const agg = product.aggregate
  return {
    screens: product.screens.length,
    hiddenNotices: agg.hiddenNotices.length,
    hiddenNoticesBySelf: agg.hiddenNotices.filter((n) => n.hiddenBy === 'self').length,
    hiddenNoticesInPhoneMedia: agg.hiddenNotices.filter((n) => (n.rules || (n.ancestor && n.ancestor.rules) || []).some((r) => r.phoneWidthMedia)).length,
    hiddenNoticesCandidates: agg.hiddenNotices.filter(isCandidate).length,
    overflow: agg.overflow.length,
    overflowNotTransformed: agg.overflow.filter((o) => !o.transformed).length,
    touchTargets: agg.touchTargets.length,
    touchTargetsUnpinned: agg.touchTargets.filter((t) => t.pins.length === 0 && !t.inlineInText).length,
    touchTargetsPinnedYetUnder: agg.touchTargets.filter((t) => t.pins.length > 0).length,
    touchTargetsInlineText: agg.touchTargets.filter((t) => t.inlineInText).length,
    smallText: agg.smallText.length,
    smallTextOutsideCaptions: agg.smallText.filter((s) => !s.captionContext).length,
    smallTextSentences: agg.smallText.filter((s) => s.sentence).length,
  }
}

const md = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ')
function renderMarkdown(report) {
  const lines = [`# Phone-width sweep — ${report.viewport}`, '', `Contract \`${report.contract}\` · browser ${report.browser || 'n/a'} · generated ${report.generatedAt}`, '']
  lines.push('| Product | Screens | Hidden notices (candidates / self-hidden / phone-media) | Overflow (not off-canvas) | Touch targets <44 (unpinned / pinned-yet-under / inline text) | Text <10px (outside captions / sentences) | Navigation |')
  lines.push('| --- | --- | --- | --- | --- | --- | --- |')
  for (const product of report.products) {
    const s = product.summary
    lines.push(`| ${product.product} | ${s.screens} | ${s.hiddenNotices} (${s.hiddenNoticesCandidates} / ${s.hiddenNoticesBySelf} / ${s.hiddenNoticesInPhoneMedia}) | ${s.overflow} (${s.overflowNotTransformed}) | ${s.touchTargets} (${s.touchTargetsUnpinned} / ${s.touchTargetsPinnedYetUnder} / ${s.touchTargetsInlineText}) | ${s.smallText} (${s.smallTextOutsideCaptions} / ${s.smallTextSentences}) | ${product.navigation.ok ? 'complete' : `STOPPED at ${product.navigation.step}`} |`)
  }
  lines.push('', 'A hidden-notice *candidate* is text that is not reachable by opening something: not inside a closed disclosure, dialog, slide-over panel or an inactive view pane, and not rendered elsewhere on the same screen — the P3.10 shape. Every row is data; classification against source is the reader\'s job.')
  for (const product of report.products) {
    const agg = product.aggregate
    lines.push('', `## ${product.product}`, '', `Screens: ${product.screens.map((s) => `\`${s.screen}\` (${s.url})`).join(', ')}`)
    lines.push('', '### Hidden notices', '', '| Candidate | Selector | Text | Hidden by | Rule → source | Phone media | Visible elsewhere | Screens |', '| --- | --- | --- | --- | --- | --- | --- | --- |')
    for (const n of agg.hiddenNotices) {
      const rules = n.hiddenBy === 'self' ? (n.rules || []) : ((n.ancestor && n.ancestor.rules) || [])
      const ruleText = rules.map((r) => `\`${r.selectorText}\` → ${r.source.map((s) => `${s.file}:${s.line}`).join(', ') || 'unresolved'}`).join('; ') || (n.ancestor ? n.ancestor.kind : '—')
      lines.push(`| ${isCandidate(n) ? 'YES' : 'no'} | \`${md(n.selector)}\` | ${md(n.text)} | ${n.hiddenBy}${n.ancestor ? ` (${n.ancestor.kind}: \`${md(n.ancestor.selector)}\`)` : ''} | ${md(ruleText)} | ${rules.some((r) => r.phoneWidthMedia) ? 'yes' : 'no'} | ${n.visibleElsewhere ? 'yes' : 'no'} | ${n.screens.join(', ')} |`)
    }
    lines.push('', '### Horizontal overflow', '', '| Selector | Text | Right / left overflow (px) | Box | Off-canvas transform | Clipped by | Screens |', '| --- | --- | --- | --- | --- | --- | --- |')
    for (const o of agg.overflow) {
      lines.push(`| \`${md(o.selector)}\` | ${md(o.text)} | ${o.overflowRight} / ${o.overflowLeft} | ${o.box.left}..${o.box.right} × ${o.box.width}w | ${o.transformed ? `\`${md(o.transformed.selector)}\`` : 'no'} | ${o.clippedBy ? `\`${md(o.clippedBy)}\`` : 'no'} | ${o.screens.join(', ')} |`)
    }
    lines.push('', '### Touch targets under 44×44', '', '| Selector | Text | Size | Inline text | Label box | Pin | Screens |', '| --- | --- | --- | --- | --- | --- | --- |')
    for (const t of agg.touchTargets) {
      lines.push(`| \`${md(t.selector)}\` | ${md(t.text)} | ${t.width}×${t.height} | ${t.inlineInText ? 'yes' : 'no'} | ${t.labelBox ? `${t.labelBox.width}×${t.labelBox.height}` : '—'} | ${t.pins.join(', ') || '—'} | ${t.screens.join(', ')} |`)
    }
    lines.push('', '### Text under 0.625rem', '', '| Selector | Text | Size | Caption context | Sentence | Screens |', '| --- | --- | --- | --- | --- | --- |')
    for (const s of agg.smallText) {
      lines.push(`| \`${md(s.selector)}\` | ${md(s.text)} | ${s.fontSizePx}px (${s.fontSizeRem}rem) | ${s.captionContext || '—'} | ${s.sentence ? 'yes' : 'no'} | ${s.screens.join(', ')} |`)
    }
  }
  return `${lines.join('\n')}\n`
}

// ---- main ----
// Set as soon as the report object and its output directory exist, so a failure ANYWHERE
// after that -- including a preflight throw before the first browser starts -- still
// leaves the partial report on disk. The tool's contract says instrument failures are
// reported rather than swallowed; without this the process exits with only a console
// line and automation gets no structured `navigation` failure data at all.
let partial = null

async function writeReport(report, outDir) {
  const json = JSON.stringify(report, null, 2)
  await writeFile(join(outDir, 'phone-width-sweep.json'), json)
  await writeFile(join(outDir, 'phone-width-sweep.md'), renderMarkdown(report))
  return json
}

async function main() {
  const only = (argValue('--only', '') || '').split(',').map((s) => s.trim()).filter(Boolean)
  const products = only.length ? PRODUCTS.filter((p) => only.includes(p)) : PRODUCTS
  const unknown = only.filter((p) => !PRODUCTS.includes(p))
  if (unknown.length) throw new JourneyError('args', `unknown product(s) ${unknown.join(', ')}; expected ${PRODUCTS.join(', ')}`)
  let outDir = argValue('--out-dir', '')
  if (!outDir) {
    outDir = await mkdtemp(join(tmpdir(), 'phone-width-sweep-'))
    // The harness writes its failure diagnostics to --out-dir; give it this one.
    process.argv.push('--out-dir', outDir)
  }
  await mkdir(outDir, { recursive: true })
  const sourceIndex = buildSourceIndex()

  const report = {
    contract: CONTRACT,
    viewport: `${PHONE_VIEWPORT.width}x${PHONE_VIEWPORT.height}`,
    browser: null,
    generatedAt: new Date().toISOString(),
    stylesheetsIndexed: sourceIndex.files,
    hideRulesIndexed: Array.from(sourceIndex.index.values()).reduce((n, rules) => n + rules.length, 0),
    pinnedTouchTargets: PINNED_TOUCH_TARGETS,
    products: [],
  }
  // Armed here: from this point a throw anywhere still leaves a report on disk.
  partial = { report, outDir }

  for (const product of products) {
    const screens = []
    const verdicts = []
    let failed = null
    let currentJourney = null
    const capture = async (screen) => {
      const measured = await currentJourney.evaluate(MEASURE_EXPRESSION)
      screens.push(resolveScreen({ screen, ...measured }, sourceIndex))
    }
    // runJourney prints its verdict line on stdout; the sweep's stdout is this
    // report, so the journey's line is captured into the navigation block instead.
    const originalLog = console.log
    console.log = (...args) => verdicts.push(args.map(String).join(' '))
    try {
      await runJourney({
        contract: `${CONTRACT}.${product}`,
        label: `PHONE-WIDTH SWEEP (${product.toUpperCase()})`,
        profilePrefix: `sweep-${product}`,
        budgetMs: SWEEP_BUDGET_MS,
      }, async (j) => {
        currentJourney = j
        report.browser = j.browser
        try {
          await DRIVERS[product](j, capture)
        } catch (error) {
          failed = { step: j.currentStep, error: error.message }
          throw error
        }
      })
    } finally {
      console.log = originalLog
    }
    const verdict = verdicts.map((line) => {
      try {
        return JSON.parse(line)
      } catch {
        return null
      }
    }).find((v) => v && v.contract === `${CONTRACT}.${product}`)
    const aggregateRows = aggregate(screens)
    const entry = {
      product,
      navigation: failed ? { ok: false, ...failed } : { ok: Boolean(verdict), steps: verdict ? verdict.steps.map((s) => s.step) : [], seconds: verdict ? verdict.seconds : null },
      screens,
      aggregate: aggregateRows,
    }
    entry.summary = summarize(entry)
    report.products.push(entry)
    if (failed) process.exitCode = 1
    console.error(`${product}: ${screens.length} screens measured${failed ? ` — navigation stopped at "${failed.step}": ${failed.error}` : ''}`)
  }

  report.ok = report.products.every((p) => p.navigation.ok)
  const json = await writeReport(report, outDir)
  partial = null
  console.error(`report: ${join(outDir, 'phone-width-sweep.json')} and phone-width-sweep.md`)
  process.stdout.write(`${json}\n`)
  if (!report.ok) process.exitCode = 1
}

main().catch(async (err) => {
  console.error(err instanceof JourneyError ? `PHONE-WIDTH SWEEP FAILED at "${err.step}": ${err.message}` : err)
  if (partial) {
    partial.report.ok = false
    partial.report.failure = {
      step: err instanceof JourneyError ? err.step : 'preflight',
      message: String(err && err.message ? err.message : err),
      productsMeasured: partial.report.products.map((p) => p.product),
    }
    try {
      await writeReport(partial.report, partial.outDir)
      console.error(`partial report: ${join(partial.outDir, 'phone-width-sweep.json')} and phone-width-sweep.md`)
    } catch (writeError) {
      console.error(`could not write the partial report: ${writeError.message}`)
    }
  }
  process.exit(1)
})
