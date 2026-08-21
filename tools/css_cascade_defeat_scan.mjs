// CASCADE DEFEAT SCANNER -- finds the bug class this repo has now shipped three times.
//
// THE BUG CLASS. A later CSS rule at EQUAL specificity silently defeats an earlier one, so a
// style that was written, reviewed and merged simply never renders. Nothing warns: both rules
// parse, both are valid, both "apply" -- source order alone decides, and the loser leaves no
// trace in devtools unless you already know to look at the element it was written for.
//
// Two instances were found by eye and fixed by hand:
//
//   PR #528  `.theme-dark .production-mode-banner` (0-2-0, ~865 lines later) defeated three
//            storage banner tints. Dark-mode warning banners computed #0d131b -- byte-identical
//            to an untinted control. Its `background` and `border-color` RE-STATED the same
//            tokens the base rule already set, so they changed nothing on their own target and
//            existed only to out-cascade. Only its `box-shadow` was load-bearing.
//
//   PR #530  `.theme-dark .core-button` did the same to `.core-button.danger` (~1550 lines
//            earlier): a destructive-action button lost both its red text and its red border in
//            dark mode. Shape INVERTED -- here `color` and `border-color` were the no-ops and
//            `background` was load-bearing, because the base rule paints a literal #fff.
//
// The general rule both fixes landed on is "DECLARE ONLY WHAT DIFFERS": any redundant
// declaration in a later equal-specificity rule is a silent killer, whichever property it is.
// Both lanes deferred building a detector and both said there was no reason to believe two was
// the total. This is that detector.
//
// ---------------------------------------------------------------------------------------------
// THE HARD PART, AND HOW THIS SOLVES IT
//
// An earlier prototype paired selectors by their text and so could only see the case where one
// selector's classes are a subset of the other's. That finds #530 (`.core-button` vs
// `.core-button.danger`) and is BLIND to #528: `.theme-dark .production-mode-banner` and
// `.storage-durability-banner[data-durability="full"]` share no class token at all. They collide
// only because those two classes sit on the same <div> in CoreApp.tsx. Selector text cannot tell
// you that. Co-occurrence has to come from the markup.
//
// Three ways to get it were available:
//
//   (a) live DOM off a dev server, via CDP's CSS.getMatchedStylesForNode. Exact about matching --
//       and useless as a gate. No browser driver is installed and package.json is digest-sealed,
//       so one cannot be added. Worse, coverage would BE the result: reaching the storage banner
//       in its `blocked` state and the danger button in its armed state needs the app driven
//       through specific states, and any state the driver fails to reach reports as clean. That
//       is precisely the "silently stops matching, reads as all-clear forever" failure mode.
//
//   (b) pure static co-occurrence from the JSX, no live confirmation. Chosen. 2445 of the 2537
//       className expressions in showroom/src are plain string literals and the remaining 92 are
//       a narrow grammar (template literals and ternaries over string literals), so the shapes
//       are recoverable with high fidelity, and the ones that are NOT recoverable can be COUNTED
//       and reported rather than silently dropped -- see UNRESOLVED below.
//
//   (c) hybrid: propose statically, confirm with computed style. This is what the two PRs did by
//       hand, and it is the right workflow for a HUMAN triaging a finding. As an automated gate
//       it inherits (a)'s coverage problem for the confirm half.
//
// So: the cascade half is modelled EXACTLY from the stylesheets (specificity, source order,
// !important, at-rule context), and the co-occurrence half comes from element SHAPES harvested
// from the JSX. A shape is one concrete element: its tag, its classes, its attributes, and the
// file:line it is written at. A finding therefore names a real element in a real file, not a
// theoretical selector pair -- which is the difference between a scanner people use and a
// scanner people mute.
//
// WHY THE OUTPUT IS QUIET. Equal-specificity later-wins is also a normal, deliberate CSS idiom.
// The discriminator, taken straight from both PRs, is REDUNDANCY: if the defeating declaration's
// value is what its own target would compute anyway without it, that declaration paints nothing
// on the element it was written for and exists only to out-cascade earlier rules. That is never
// intentional. Redundancy is decided by TOKEN IDENTITY, not by colour: `var(--core-line-strong)`
// in a `.theme-dark` rule and `var(--core-line-strong)` in the base rule resolve to the same
// value on the same element in the same theme, whatever that value is. No colour maths, no
// browser, and exact. A defeat whose declaration is genuinely load-bearing is still reported, in
// a separate lower tier, because its fix is different (raise specificity, do not delete).
//
// WHAT THIS DELIBERATELY DOES NOT DECIDE. Everything it cannot decide soundly is counted and
// printed, so the blind spots are visible in every run instead of masquerading as a clean sweep:
//   - pairs whose ancestor contexts differ in a way that needs a real DOM tree (UNDECIDABLE)
//   - pairs in different @media/@supports contexts (CONTEXT-SPLIT)
//   - pairs whose pseudo-class state differs (STATE-SPLIT)
//   - className expressions too dynamic to evaluate (UNRESOLVED)
// A jump in any of these is a signal the scanner is going blind, and the FLOORS below fail the
// run if the corpus it actually examined shrinks.
//
// ANTI-VACUITY. This repo has shipped a check made vacuous by a regex that matched nothing, a
// "no corruption" guard that passed on already-destroyed data, and a count that passed against a
// hardcoded fixture. So the two known instances are baked in as FIXTURES and re-derived on EVERY
// run, from reconstructed pre-#528 and pre-#530 stylesheets, and the run fails unless the scanner
// reports exactly them. A scanner nobody has watched fire is not a scanner; this one fires every
// time it is invoked, and if it ever stops matching, the fixtures go red before the live scan can
// report "all clear".
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, relative } from 'node:path'

const SELF = fileURLToPath(import.meta.url)
const ROOT = resolve(dirname(SELF), '..')

// The same five stylesheets check_css_contracts.mjs scans, in the order the browser sees them.
// index.css is imported by main.tsx and core-app.css by the shell every route renders inside, so
// both precede the product sheets; the product sheets never load together on one route, but they
// are ordered here anyway so the model is total. Both assumptions are pinned in
// check_css_contracts.mjs against the actual imports.
export const STYLESHEETS = [
  'showroom/src/index.css',
  'showroom/src/core/core-app.css',
  'showroom/src/products/ecommerce/ecommerce-product.css',
  'showroom/src/products/website/website-product.css',
  'showroom/src/products/website/publish-workspace.css',
]

// AMBIENT ANCESTORS. `.theme-dark` / `.theme-light` is written onto the outermost shell div
// (CoreShell.tsx: `className={`core-shell theme-${theme}...`}`), so it is an ancestor of every
// element the app renders. That is what lets a `.theme-dark X` rule and a bare `X` rule be
// compared without a DOM tree: the theme prefix is satisfied unconditionally. Pinned against the
// source in assertAmbientIsReal() -- if the shell stops wrapping the app, this stops being true
// and the run fails rather than quietly producing wrong pairs.
const AMBIENT_CLASSES = new Set(['theme-dark', 'theme-light'])

// JSX component tags whose rendered element is known. react-router's Link/NavLink render <a>;
// anything else with a capitalised tag has an unknown rendered element and its tag conditions
// evaluate to MAYBE rather than to a wrong answer.
const COMPONENT_TAGS = new Map([['Link', 'a'], ['NavLink', 'a']])

// ---------------------------------------------------------------------------------------------
// CSS parsing
// ---------------------------------------------------------------------------------------------

// Line numbers come from a precomputed newline table rather than slice().split(), which would be
// O(file) per lookup and, over a few thousand rules, allocates gigabytes.
function lineIndex(source) {
  const offsets = [0]
  for (let i = 0; i < source.length; i += 1) if (source[i] === '\n') offsets.push(i + 1)
  return offsets
}

function lineAt(offsets, index) {
  let low = 0
  let high = offsets.length - 1
  while (low < high) {
    const middle = (low + high + 1) >> 1
    if (offsets[middle] <= index) low = middle
    else high = middle - 1
  }
  return low + 1
}

const lineOf = (source, index) => lineAt(lineIndex(source), index)

// Blanks comments while preserving every byte offset, so reported line numbers stay true.
function blankComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, ' '))
}

// Flattens a stylesheet to rules in source order, carrying the at-rule context each one sits in.
// @keyframes bodies are skipped: their `from`/`to`/`50%` blocks are not selectors and never
// participate in the cascade the way a rule does.
export function parseStylesheet(rawSource, path, fileOrder) {
  const source = blankComments(rawSource.replaceAll('\r\n', '\n'))
  const offsets = lineIndex(source)
  const rules = []
  const context = []
  let i = 0
  let blockStart = 0

  while (i < source.length) {
    const character = source[i]
    if (character === '"' || character === "'") {
      const quote = character
      i += 1
      while (i < source.length && source[i] !== quote) i += source[i] === '\\' ? 2 : 1
      i += 1
      continue
    }
    if (character === '{') {
      const prelude = source.slice(blockStart, i).trim()
      if (prelude.startsWith('@')) {
        const name = prelude.slice(1).split(/[\s({]/)[0].toLowerCase()
        if (name === 'keyframes' || name === '-webkit-keyframes' || name === 'font-face') {
          i = skipBlock(source, i)
          blockStart = i
          continue
        }
        context.push(prelude)
        i += 1
        blockStart = i
        continue
      }
      const end = skipBlock(source, i)
      const body = source.slice(i + 1, end - 1)
      // A nested block inside a rule body would mean CSS nesting; none of these sheets use it,
      // and pinAssumptions() fails the run if that ever changes rather than mis-parsing it.
      // Report the line the SELECTOR starts on, not the line the `{` happens to sit on.
      let preludeStart = blockStart
      while (preludeStart < i && /\s/.test(source[preludeStart])) preludeStart += 1
      rules.push({
        path,
        fileOrder,
        line: lineAt(offsets, preludeStart),
        selectorText: prelude,
        body,
        atContext: context.join(' >> '),
      })
      i = end
      blockStart = i
      continue
    }
    if (character === '}') {
      context.pop()
      i += 1
      blockStart = i
      continue
    }
    i += 1
  }
  return rules
}

function skipBlock(source, openIndex) {
  let depth = 0
  let i = openIndex
  while (i < source.length) {
    const character = source[i]
    if (character === '"' || character === "'") {
      const quote = character
      i += 1
      while (i < source.length && source[i] !== quote) i += source[i] === '\\' ? 2 : 1
      i += 1
      continue
    }
    if (character === '{') depth += 1
    else if (character === '}') {
      depth -= 1
      if (depth === 0) return i + 1
    }
    i += 1
  }
  return source.length
}

// Splits a declaration body into [property, value, important] triples. Parenthesis-aware so that
// `background: linear-gradient(a, b)` and `var(--x, y)` survive, and last-wins inside one rule is
// applied here, because a rule that declares a property twice only ever paints the last one.
export function parseDeclarations(body) {
  const declarations = []
  let depth = 0
  let current = ''
  for (let i = 0; i < body.length; i += 1) {
    const character = body[i]
    if (character === '"' || character === "'") {
      const quote = character
      let j = i + 1
      while (j < body.length && body[j] !== quote) j += body[j] === '\\' ? 2 : 1
      current += body.slice(i, j + 1)
      i = j
      continue
    }
    if (character === '(') depth += 1
    if (character === ')') depth -= 1
    if (character === ';' && depth === 0) {
      pushDeclaration(declarations, current)
      current = ''
      continue
    }
    current += character
  }
  pushDeclaration(declarations, current)

  const lastWins = new Map()
  for (const declaration of declarations) lastWins.set(declaration.property, declaration)
  return [...lastWins.values()]
}

function pushDeclaration(out, text) {
  const trimmed = text.trim()
  if (!trimmed) return
  const colon = trimmed.indexOf(':')
  if (colon < 0) return
  const property = trimmed.slice(0, colon).trim().toLowerCase()
  let value = trimmed.slice(colon + 1).trim()
  if (!property || property.startsWith('--')) return
  let important = false
  if (/!\s*important$/i.test(value)) {
    important = true
    value = value.replace(/!\s*important$/i, '').trim()
  }
  out.push({ property, value, important })
}

// ---------------------------------------------------------------------------------------------
// Selector parsing and specificity
// ---------------------------------------------------------------------------------------------

// Splits a selector list on top-level commas (`:is(a, b)` must not split).
export function splitSelectorList(selectorText) {
  const out = []
  let depth = 0
  let current = ''
  for (const character of selectorText) {
    if (character === '(' || character === '[') depth += 1
    if (character === ')' || character === ']') depth -= 1
    if (character === ',' && depth === 0) {
      if (current.trim()) out.push(current.trim())
      current = ''
      continue
    }
    current += character
  }
  if (current.trim()) out.push(current.trim())
  return out
}

// Parses one complex selector into compounds plus the combinators between them. The last compound
// is the SUBJECT -- the element the rule actually paints; the rest are its required ancestry.
export function parseSelector(selector) {
  const compounds = []
  const combinators = []
  let current = ''
  let depth = 0
  const flush = () => {
    if (current.trim()) compounds.push(parseCompound(current.trim()))
    current = ''
  }
  for (let i = 0; i < selector.length; i += 1) {
    const character = selector[i]
    if (character === '(' || character === '[') depth += 1
    if (character === ')' || character === ']') depth -= 1
    if (depth === 0 && (character === '>' || character === '+' || character === '~')) {
      flush()
      combinators.push(character)
      continue
    }
    if (depth === 0 && /\s/.test(character)) {
      if (current.trim()) {
        // A descendant combinator, unless the next non-space character is another combinator.
        const rest = selector.slice(i).trimStart()
        if (rest && !'>+~'.includes(rest[0])) {
          flush()
          combinators.push(' ')
        }
      }
      continue
    }
    current += character
  }
  flush()
  return { selector, compounds, combinators, subject: compounds[compounds.length - 1] }
}

function parseCompound(text) {
  const compound = { tag: null, id: null, classes: [], attributes: [], pseudoClasses: [], pseudoElement: null, raw: text }
  let i = 0
  while (i < text.length) {
    const character = text[i]
    if (character === '*') { i += 1; continue }
    if (character === '.') {
      const match = /^\.([A-Za-z0-9_-]+)/.exec(text.slice(i))
      if (!match) { i += 1; continue }
      compound.classes.push(match[1])
      i += match[0].length
      continue
    }
    if (character === '#') {
      const match = /^#([A-Za-z0-9_-]+)/.exec(text.slice(i))
      if (!match) { i += 1; continue }
      compound.id = match[1]
      i += match[0].length
      continue
    }
    if (character === '[') {
      let depth = 0
      let j = i
      while (j < text.length) {
        if (text[j] === '[') depth += 1
        if (text[j] === ']') { depth -= 1; if (depth === 0) break }
        j += 1
      }
      compound.attributes.push(parseAttribute(text.slice(i + 1, j)))
      i = j + 1
      continue
    }
    if (character === ':') {
      const isElement = text[i + 1] === ':'
      const start = i + (isElement ? 2 : 1)
      const nameMatch = /^([A-Za-z-]+)/.exec(text.slice(start))
      const name = nameMatch ? nameMatch[1].toLowerCase() : ''
      let j = start + (nameMatch ? nameMatch[0].length : 0)
      let argument = null
      if (text[j] === '(') {
        let depth = 0
        const open = j
        while (j < text.length) {
          if (text[j] === '(') depth += 1
          if (text[j] === ')') { depth -= 1; if (depth === 0) break }
          j += 1
        }
        argument = text.slice(open + 1, j)
        j += 1
      }
      // The legacy one-colon spellings of pseudo-ELEMENTS still occur in the wild.
      if (isElement || ['before', 'after', 'first-line', 'first-letter', 'placeholder', 'selection', 'backdrop', 'marker'].includes(name)) {
        compound.pseudoElement = name
      } else if (name) {
        compound.pseudoClasses.push({ name, argument })
      }
      i = j > i ? j : i + 1
      continue
    }
    const tagMatch = /^([A-Za-z][A-Za-z0-9-]*)/.exec(text.slice(i))
    if (tagMatch) {
      compound.tag = tagMatch[1].toLowerCase()
      i += tagMatch[0].length
      continue
    }
    i += 1
  }
  return compound
}

function parseAttribute(inner) {
  const match = /^\s*([A-Za-z0-9_:-]+)\s*(?:([~|^$*]?)=\s*("[^"]*"|'[^']*'|[^\s\]]+)\s*(i|s)?)?\s*$/.exec(inner)
  if (!match) return { name: inner.trim().toLowerCase(), operator: null, value: null, unparsed: true }
  const rawValue = match[3] === undefined ? null : match[3].replace(/^["']|["']$/g, '')
  return { name: match[1].toLowerCase(), operator: match[2] || (match[3] === undefined ? null : '='), value: rawValue }
}

// Specificity as [id, class, type]. `:not()/:is()/:has()` take the specificity of their most
// specific argument; `:where()` takes zero. Pseudo-ELEMENTS count as type, pseudo-CLASSES as class.
export function specificity(parsed) {
  const total = [0, 0, 0]
  for (const compound of parsed.compounds) {
    if (compound.id) total[0] += 1
    total[1] += compound.classes.length + compound.attributes.length
    if (compound.tag) total[2] += 1
    if (compound.pseudoElement) total[2] += 1
    for (const pseudo of compound.pseudoClasses) {
      if (pseudo.name === 'where') continue
      if (['not', 'is', 'has', 'matches', 'any'].includes(pseudo.name) && pseudo.argument) {
        let best = [0, 0, 0]
        for (const branch of splitSelectorList(pseudo.argument)) {
          const branchSpecificity = specificity(parseSelector(branch))
          if (compareSpecificity(branchSpecificity, best) > 0) best = branchSpecificity
        }
        total[0] += best[0]
        total[1] += best[1]
        total[2] += best[2]
        continue
      }
      total[1] += 1
    }
  }
  return total
}

export const compareSpecificity = (a, b) => (a[0] - b[0]) || (a[1] - b[1]) || (a[2] - b[2])
const sameSpecificity = (a, b) => compareSpecificity(a, b) === 0

// ---------------------------------------------------------------------------------------------
// Shorthand expansion -- only as far as the redundancy test actually needs
// ---------------------------------------------------------------------------------------------
//
// The redundancy test asks "does the base rule already give this element this value for this
// property?", and in both known instances the base rule says it with a SHORTHAND:
// `.core-button { border: 1px solid var(--core-line-strong) }` is what makes the theme rule's
// `border-color: var(--core-line-strong)` a no-op. Without expansion the scanner sees no shared
// property and calls a redundant declaration load-bearing -- a false negative on the exact shape
// it exists to catch. Expansion is deliberately narrow and REFUSES rather than guesses: an
// unexpandable value yields no longhand at all, and an absent longhand is treated as "cannot
// prove redundant", which downgrades a finding instead of inventing one.

// Is this value part plausibly the COLOUR slot of a shorthand? Function forms are matched by their
// opening token, because `var(--core-line)` and `rgba(148,98,0,.34)` are whole values, not prefixes.
// Anchoring the function alternatives with `$` -- as the first draft did -- silently made every
// `border: 1px solid var(--token)` unexpandable, which reported both known instances' `border-color`
// defeat as load-bearing when it was redundant. Exactly the declaration both PRs deleted.
const looksLikeColour = (part) =>
  /^(rgba?|hsla?|hwb|lab|lch|oklab|oklch|var|color-mix|color)\(/i.test(part) ||
  /^#[0-9a-fA-F]{3,8}$/.test(part) ||
  /^[a-z]+$/i.test(part)
const BORDER_STYLES = new Set(['none', 'hidden', 'dotted', 'dashed', 'solid', 'double', 'groove', 'ridge', 'inset', 'outset'])

// Which shorthand a derived longhand came from, so the report can collapse the pair back down.
const SHORTHAND_PARENT = new Map([
  ['background-color', 'background'],
  ['border-color', 'border'],
  ['border-top-color', 'border-top'],
  ['border-right-color', 'border-right'],
  ['border-bottom-color', 'border-bottom'],
  ['border-left-color', 'border-left'],
])

// Splits a value on top-level whitespace, keeping functions intact.
function valueParts(value) {
  const parts = []
  let depth = 0
  let current = ''
  for (const character of value) {
    if (character === '(') depth += 1
    if (character === ')') depth -= 1
    if (depth === 0 && /\s/.test(character)) {
      if (current) parts.push(current)
      current = ''
      continue
    }
    current += character
  }
  if (current) parts.push(current)
  return parts
}

export function expandShorthand(property, value) {
  const out = new Map()
  out.set(property, value)

  const borderSide = /^border(-(top|right|bottom|left))?$/.exec(property)
  if (borderSide) {
    const side = borderSide[2] ? `-${borderSide[2]}` : ''
    const parts = valueParts(value)
    // `1px solid var(--x)` -> the colour is the part that is neither a length nor a style.
    const colour = parts.find((part) => !/^-?[\d.]+[a-z%]*$/i.test(part) && !BORDER_STYLES.has(part.toLowerCase()) && looksLikeColour(part))
    if (parts.length === 1 && BORDER_STYLES.has(parts[0].toLowerCase())) {
      // `border: none` zeroes the colour too, but to what is not statically nameable. Refuse.
      return out
    }
    if (colour) out.set(`border${side}-color`, colour)
    return out
  }

  // `border-color` is deliberately NOT expanded into the four sides. It is already the canonical
  // property that `border:` expands TO, so expanding it further only duplicated every border
  // finding five times over (border-color plus four identical per-side rows) without adding
  // information. The cost is that a rule declaring `border-top-color` alone is not compared against
  // one declaring `border-color`; that shape does not occur in these stylesheets, and a missed
  // comparison is a quiet false negative rather than four rows of noise per real finding.

  if (property === 'background') {
    const parts = valueParts(value)
    // Only the single-value colour form is expandable with confidence. A layered background or
    // one carrying an image/gradient is refused: its effective colour is not one token.
    if (parts.length === 1 && !/^(url|linear-gradient|radial-gradient|conic-gradient|repeating-)/i.test(parts[0]) && looksLikeColour(parts[0])) {
      out.set('background-color', parts[0])
    }
    return out
  }

  return out
}

// Two declared values are the SAME PAINT when their normalised text matches. This is exact and
// deliberately narrow: `var(--core-line-strong)` in a `.theme-dark` rule and the same token in the
// base rule resolve identically on the same element in the same theme, whatever colour that is, so
// no colour maths is needed and none is done. Different spellings of the same colour
// (`#fff`/`#ffffff`/`white`) are NOT equated -- treating them as different can only downgrade a
// finding, never manufacture one.
export const normaliseValue = (value) => value.replace(/\s+/g, ' ').replace(/\s*,\s*/g, ',').trim().toLowerCase()

// ---------------------------------------------------------------------------------------------
// Element shapes, harvested from the JSX
// ---------------------------------------------------------------------------------------------
//
// A shape is one concrete element as written: `{ tag, classes, attributes, file, line }`. It is
// what turns "these two selectors could collide" into "this <div> at CoreApp.tsx:2879 renders
// with the wrong background".

const ATTRIBUTE_UNKNOWN = Symbol('unknown attribute value')

function listTsxFiles(directory) {
  const out = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = `${directory}/${entry.name}`
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== 'dist') out.push(...listTsxFiles(path))
      continue
    }
    if (/\.(tsx|jsx)$/.test(entry.name)) out.push(path)
  }
  return out
}

// Finds the end of a `{...}` JSX attribute value, respecting nesting, strings and templates.
function matchBrace(source, openIndex) {
  let depth = 0
  let i = openIndex
  while (i < source.length) {
    const character = source[i]
    if (character === '"' || character === "'" || character === '`') {
      const quote = character
      i += 1
      while (i < source.length && source[i] !== quote) {
        if (source[i] === '\\') { i += 2; continue }
        if (quote === '`' && source[i] === '$' && source[i + 1] === '{') { i = matchBrace(source, i + 1); continue }
        i += 1
      }
      i += 1
      continue
    }
    if (character === '{') depth += 1
    else if (character === '}') { depth -= 1; if (depth === 0) return i + 1 }
    i += 1
  }
  return source.length
}

const OPAQUE = Symbol('unevaluable expression')
const ALTERNATIVE_CAP = 24

// Evaluates the restricted expression grammar that 100% of this codebase's className values are
// written in: string literals, template literals, ternaries, `+` concatenation, and the empty
// forms (`''`, `undefined`, `null`). Returns the LIST of strings the expression can produce --
// enumerating a ternary's branches rather than unioning them, because `${x ? 'a' : 'b'}` never
// puts a and b on the same element and a union would invent a co-occurrence that cannot happen.
// Anything outside the grammar returns OPAQUE, which is counted, never guessed at.
export function evaluateExpression(text) {
  const source = text.trim()
  if (!source) return ['']
  if (source === 'undefined' || source === 'null') return ['']

  if (source[0] === '(' && matchParen(source, 0) === source.length) return evaluateExpression(source.slice(1, -1))

  const question = topLevelIndex(source, '?')
  if (question >= 0) {
    const colon = matchTernaryColon(source, question)
    if (colon < 0) return OPAQUE
    const whenTrue = evaluateExpression(source.slice(question + 1, colon))
    const whenFalse = evaluateExpression(source.slice(colon + 1))
    if (whenTrue === OPAQUE || whenFalse === OPAQUE) return OPAQUE
    const merged = [...whenTrue, ...whenFalse]
    return merged.length > ALTERNATIVE_CAP ? OPAQUE : merged
  }

  const plus = topLevelIndex(source, '+')
  if (plus > 0) {
    const left = evaluateExpression(source.slice(0, plus))
    const right = evaluateExpression(source.slice(plus + 1))
    if (left === OPAQUE || right === OPAQUE) return OPAQUE
    return cross(left, right)
  }

  if ((source[0] === '"' || source[0] === "'") && source[source.length - 1] === source[0] && closesAtEnd(source)) {
    return [source.slice(1, -1)]
  }

  if (source[0] === '`' && source[source.length - 1] === '`') return evaluateTemplate(source.slice(1, -1))

  return OPAQUE
}

function closesAtEnd(source) {
  const quote = source[0]
  let i = 1
  while (i < source.length) {
    if (source[i] === '\\') { i += 2; continue }
    if (source[i] === quote) return i === source.length - 1
    i += 1
  }
  return false
}

function evaluateTemplate(inner) {
  let results = ['']
  let i = 0
  let literal = ''
  while (i < inner.length) {
    if (inner[i] === '\\') { literal += inner.slice(i, i + 2); i += 2; continue }
    if (inner[i] === '$' && inner[i + 1] === '{') {
      const end = matchBrace(inner, i + 1)
      results = cross(results, [literal])
      literal = ''
      const hole = evaluateExpression(inner.slice(i + 2, end - 1))
      if (hole === OPAQUE) return OPAQUE
      results = cross(results, hole)
      if (results.length > ALTERNATIVE_CAP) return OPAQUE
      i = end
      continue
    }
    literal += inner[i]
    i += 1
  }
  return cross(results, [literal])
}

const cross = (left, right) => left.flatMap((a) => right.map((b) => a + b))

function matchParen(source, openIndex) {
  let depth = 0
  for (let i = openIndex; i < source.length; i += 1) {
    if (source[i] === '(') depth += 1
    else if (source[i] === ')') { depth -= 1; if (depth === 0) return i + 1 }
  }
  return -1
}

// Scans for `token` at nesting depth zero, skipping strings, templates and the `?.` / `??`
// spellings that are not the start of a conditional.
function topLevelIndex(source, token) {
  let depth = 0
  let i = 0
  while (i < source.length) {
    const character = source[i]
    if (character === '"' || character === "'" || character === '`') {
      const quote = character
      i += 1
      while (i < source.length && source[i] !== quote) {
        if (source[i] === '\\') { i += 2; continue }
        if (quote === '`' && source[i] === '$' && source[i + 1] === '{') { i = matchBrace(source, i + 1); continue }
        i += 1
      }
      i += 1
      continue
    }
    if ('([{'.includes(character)) depth += 1
    else if (')]}'.includes(character)) depth -= 1
    else if (depth === 0 && character === token) {
      if (token === '?' && (source[i + 1] === '.' || source[i + 1] === '?')) { i += 2; continue }
      if (token === '+' && (source[i + 1] === '+' || source[i - 1] === '+')) { i += 1; continue }
      return i
    }
    i += 1
  }
  return -1
}

// Given the `?` of a conditional, finds ITS `:` -- skipping the colons of any nested conditional,
// and the `:` of a `?.` chain, so `a ? b ? c : d : e` splits where it should.
function matchTernaryColon(source, questionIndex) {
  let depth = 0
  let pending = 0
  let i = questionIndex + 1
  while (i < source.length) {
    const character = source[i]
    if (character === '"' || character === "'" || character === '`') {
      const quote = character
      i += 1
      while (i < source.length && source[i] !== quote) {
        if (source[i] === '\\') { i += 2; continue }
        if (quote === '`' && source[i] === '$' && source[i + 1] === '{') { i = matchBrace(source, i + 1); continue }
        i += 1
      }
      i += 1
      continue
    }
    if ('([{'.includes(character)) depth += 1
    else if (')]}'.includes(character)) depth -= 1
    else if (depth === 0 && character === '?') {
      if (source[i + 1] === '.' || source[i + 1] === '?') { i += 2; continue }
      pending += 1
    } else if (depth === 0 && character === ':') {
      if (pending === 0) return i
      pending -= 1
    }
    i += 1
  }
  return -1
}

// Reads every JSX opening tag in one file into shapes. An element whose className cannot be
// evaluated still produces NO shape -- it is counted as unresolved instead, so the scanner never
// asserts a co-occurrence it cannot see.
export function extractShapes(source, file) {
  const shapes = []
  const offsets = lineIndex(source)
  let unresolved = 0
  // The open-element stack, so every shape knows its ancestors WITHIN THIS FILE. Without it a
  // finding about `.website-recovery-actions > button.is-quiet` names whichever `button.is-quiet`
  // the scan happened to reach first -- which, on the real repo, was a button in a different
  // component that the rule never touches. A finding that points at the wrong element is worse than
  // no finding, so ancestry is verified rather than assumed whenever a selector demands one.
  // Fragments (`<>...</>`) are correctly transparent: they never match the tag pattern, so they are
  // neither pushed nor popped, which is exactly how they behave in the DOM.
  const stack = []
  const tagPattern = /<(\/?)([A-Za-z][A-Za-z0-9.]*)(?=[\s/>])/g
  let match
  while ((match = tagPattern.exec(source))) {
    const closing = match[1] === '/'
    const tagName = match[2]
    if (closing) {
      for (let i = stack.length - 1; i >= 0; i -= 1) {
        if (stack[i].tagName === tagName) { stack.length = i; break }
      }
      continue
    }
    const end = findTagEnd(source, match.index + match[0].length)
    if (end < 0) continue
    const selfClosing = source[end - 1] === '/'
    const attributesText = source.slice(match.index + match[0].length, end)
    const attributes = new Map()
    let classes = null
    let opaqueClass = false

    const attributePattern = /([A-Za-z_][A-Za-z0-9_:-]*)\s*=\s*/g
    let attributeMatch
    while ((attributeMatch = attributePattern.exec(attributesText))) {
      const name = attributeMatch[1]
      const valueStart = attributeMatch.index + attributeMatch[0].length
      const first = attributesText[valueStart]
      let values
      if (first === '"' || first === "'") {
        const close = attributesText.indexOf(first, valueStart + 1)
        if (close < 0) continue
        values = [attributesText.slice(valueStart + 1, close)]
        attributePattern.lastIndex = close + 1
      } else if (first === '{') {
        const close = matchBrace(attributesText, valueStart)
        values = evaluateExpression(attributesText.slice(valueStart + 1, close - 1))
        attributePattern.lastIndex = close
      } else continue

      if (name === 'className') {
        if (values === OPAQUE) { opaqueClass = true; continue }
        classes = values
        continue
      }
      attributes.set(name.toLowerCase(), values === OPAQUE ? ATTRIBUTE_UNKNOWN : values)
    }

    const tag = /^[a-z]/.test(tagName) ? tagName.toLowerCase() : (COMPONENT_TAGS.get(tagName) ?? null)
    const line = lineAt(offsets, match.index)
    // For ANCESTOR purposes an element is the union of every class any branch can give it: a
    // container's identity is what a descendant rule keys off, and a container written with a
    // ternary is still that container in both branches.
    const unionClasses = new Set((classes ?? []).flatMap((text) => text.split(/\s+/).filter(Boolean)))
    const ancestors = stack.map((frame) => ({ tag: frame.tag, classes: frame.classes }))
    if (!selfClosing) stack.push({ tagName, tag, classes: unionClasses })

    if (opaqueClass) { unresolved += 1; continue }
    if (classes === null) continue

    // Each alternative of a ternary is its own element state, never merged.
    for (const classText of classes) {
      const classList = classText.split(/\s+/).filter(Boolean)
      if (!classList.length) continue
      shapes.push({ file, line, tag, classes: new Set(classList), attributes, ancestors, raw: classText })
    }
  }
  return { shapes, unresolved }
}

// Does this shape's recorded ancestry satisfy the selector's? Ancestor compounds are walked from
// the innermost outwards: `>` demands the immediate parent, a descendant combinator scans upwards.
// The AMBIENT theme compound is skipped -- it is on the shell root, which is above everything and
// therefore above whatever slice of the tree this file contains.
//
// Returns null when the selector demands an ancestry this file cannot speak to (the chain runs off
// the top of the file into a parent component). That is reported as unverified, never as a match:
// guessing here is what produced a finding pointing at the wrong button.
export function verifyAncestry(parsed, shape) {
  let compounds = parsed.compounds.slice(0, -1)
  let combinators = parsed.combinators.slice()
  if (compounds.length && isAmbientCompound(compounds[0]) && combinators[0] === ' ') {
    compounds = compounds.slice(1)
    combinators = combinators.slice(1)
  }
  if (!compounds.length) return true

  const chain = shape.ancestors
  let position = chain.length - 1
  for (let index = compounds.length - 1; index >= 0; index -= 1) {
    const compound = compounds[index]
    const combinator = combinators[index] ?? ' '
    if (combinator === '+' || combinator === '~') return null
    const satisfies = (frame) =>
      compound.classes.every((className) => frame.classes.has(className)) &&
      (!compound.tag || frame.tag === compound.tag) &&
      !compound.attributes.length && !compound.id
    if (combinator === '>') {
      if (position < 0) return null
      if (!satisfies(chain[position])) return false
      position -= 1
      continue
    }
    let found = -1
    for (let i = position; i >= 0; i -= 1) if (satisfies(chain[i])) { found = i; break }
    if (found < 0) return position < 0 ? null : false
    position = found - 1
  }
  return true
}

function findTagEnd(source, from) {
  let i = from
  while (i < source.length) {
    const character = source[i]
    if (character === '"' || character === "'") {
      const quote = character
      i += 1
      while (i < source.length && source[i] !== quote) i += source[i] === '\\' ? 2 : 1
      i += 1
      continue
    }
    if (character === '{') { i = matchBrace(source, i); continue }
    if (character === '>') return i
    if (character === '<') return -1
    i += 1
  }
  return -1
}

// ---------------------------------------------------------------------------------------------
// Matching a shape against a subject compound
// ---------------------------------------------------------------------------------------------

const MATCH_NO = 0
const MATCH_MAYBE = 1
const MATCH_YES = 2

// Matches one or MORE subject compounds against a shape AT THE SAME TIME. Matching them jointly is
// not an optimisation, it is the correctness requirement: a shape carries `data-priority` as the
// LIST of values its ternary can produce, so `[data-priority="urgent"]` and `[data-priority="low"]`
// each match the shape on their own, while no single rendered element is ever both. Testing them
// separately reports a defeat between two states that never coexist. Testing them together demands
// one attribute value that satisfies every constraint on that attribute, which is the real question.
//
// An unknown TAG is MATCH_NO, not MATCH_MAYBE. A shape whose element type cannot be read (a
// capitalised component tag with no known rendering) cannot confirm `p` or `small` or `body`, and
// letting it MAYBE-match every tag selector was the single largest source of nonsense in the first
// draft of this scanner -- `<div class="shop-product-art">` "matching" both `.x p` and `.x small`
// and being reported as the element where one defeats the other.
export function matchCompounds(compounds, shape) {
  let confidence = MATCH_YES
  for (const compound of compounds) {
    for (const className of compound.classes) if (!shape.classes.has(className)) return MATCH_NO
    if (compound.tag) {
      if (shape.tag === null) return MATCH_NO
      if (shape.tag !== compound.tag) return MATCH_NO
    }
    if (compound.id) {
      const id = shape.attributes.get('id')
      if (id === undefined || id === ATTRIBUTE_UNKNOWN) return MATCH_NO
      if (!id.includes(compound.id)) return MATCH_NO
    }
  }

  // Every attribute constraint from every compound, grouped by attribute name.
  const constraints = new Map()
  for (const compound of compounds) {
    for (const attribute of compound.attributes) {
      if (!constraints.has(attribute.name)) constraints.set(attribute.name, [])
      constraints.get(attribute.name).push(attribute)
    }
  }
  for (const [name, group] of constraints) {
    if (group.some((attribute) => attribute.unparsed)) { confidence = MATCH_MAYBE; continue }
    const present = shape.attributes.get(name)
    if (present === undefined) return MATCH_NO
    if (group.every((attribute) => attribute.operator === null)) continue
    if (present === ATTRIBUTE_UNKNOWN) { confidence = MATCH_MAYBE; continue }
    // One rendered value has to satisfy ALL of them, not one each. This is what stops
    // `[data-priority="urgent"]` and `[data-priority="low"]` -- two branches of one ternary, never
    // on the screen together -- from posing as a co-occurrence.
    const satisfying = present.filter((value) => group.every((attribute) => attributeSatisfied(attribute, value)))
    if (!satisfying.length) return MATCH_NO
    // A branch that satisfies the constraints is a CONFIRMED match, not a maybe. `data-write` is
    // written as `{canWrite ? 'ready' : 'blocked'}`, so `[data-write="blocked"]` really does render:
    // it is one of two enumerated literals, not an unknown. Treating "only some branches match" as
    // uncertainty is what silently dropped the entire #528 instance from the first draft of this
    // scanner -- every banner tint this bug class was named for is state-scoped by construction.
  }
  return confidence
}

export const matchCompound = (compound, shape) => matchCompounds([compound], shape)

function attributeSatisfied(attribute, value) {
  switch (attribute.operator) {
    case '=': return value === attribute.value
    case '~': return value.split(/\s+/).includes(attribute.value)
    case '^': return value.startsWith(attribute.value)
    case '$': return value.endsWith(attribute.value)
    case '*': return value.includes(attribute.value)
    case '|': return value === attribute.value || value.startsWith(`${attribute.value}-`)
    default: return true
  }
}

// ---------------------------------------------------------------------------------------------
// Pair comparability -- the part that decides what can be reasoned about without a DOM tree
// ---------------------------------------------------------------------------------------------
//
// Two rules are COMPARABLE when "does B always apply wherever A applies?" can be answered from the
// selectors alone. That is true in exactly two situations:
//
//   1. identical ancestry. Both selectors demand the same ancestor chain, so whatever tree makes A
//      apply also makes B apply. The claim "B defeats A here" is then unconditional, and needs no
//      knowledge of whether that chain exists.
//   2. ancestry differing only by an AMBIENT prefix. `.theme-dark X` versus `X`: the theme class is
//      on the shell root and is an ancestor of every element the app renders, so the prefix is
//      satisfied for free. This is the shape of both known instances.
//
// Anything else -- `.sidebar .pill` versus `.footer .pill` -- needs to know whether one element is
// ever inside both, which is a whole-tree question this scanner does not answer. Those pairs are
// counted as UNDECIDABLE and reported, never silently dropped.

const compoundKey = (compound) => {
  const classes = [...compound.classes].sort().map((c) => `.${c}`).join('')
  const attributes = compound.attributes.map((a) => `[${a.name}${a.operator ?? ''}${a.value ?? ''}]`).sort().join('')
  const pseudos = compound.pseudoClasses.map((p) => `:${p.name}${p.argument ? `(${p.argument})` : ''}`).sort().join('')
  return `${compound.tag ?? ''}${compound.id ? `#${compound.id}` : ''}${classes}${attributes}${pseudos}`
}

const isAmbientCompound = (compound) =>
  compound.classes.length === 1 &&
  AMBIENT_CLASSES.has(compound.classes[0]) &&
  !compound.tag && !compound.id && !compound.attributes.length && !compound.pseudoClasses.length

// Renders the ancestry (everything but the subject) as a comparable key, optionally after
// stripping a leading ambient compound followed by a descendant combinator.
function ancestryKey(parsed, { stripAmbient }) {
  let compounds = parsed.compounds.slice(0, -1)
  let combinators = parsed.combinators.slice()
  if (stripAmbient && compounds.length && isAmbientCompound(compounds[0]) && combinators[0] === ' ') {
    compounds = compounds.slice(1)
    combinators = combinators.slice(1)
  }
  return compounds.map((compound, index) => `${compoundKey(compound)}${combinators[index] ?? ''}`).join('')
}

const leadsWithAmbient = (parsed) =>
  parsed.compounds.length > 1 && isAmbientCompound(parsed.compounds[0]) && parsed.combinators[0] === ' '

// The ambient class a selector is scoped to, or null. `.theme-dark X` and `.theme-light X` are
// MUTUALLY EXCLUSIVE and must never be paired -- they cannot both apply to one element, so neither
// can defeat the other. Only equal ambients, or an ambient against a bare rule, may pair.
const ambientOf = (parsed) => (leadsWithAmbient(parsed) ? parsed.compounds[0].classes[0] : null)
const ambientsCompatible = (a, b) => a === b || a === null || b === null

// The COMPARABILITY GROUP. Every rule whose defeats can be reasoned about without a DOM tree gets
// a key here, and only rules sharing a key are ever paired. Ancestry is keyed with the ambient
// prefix stripped, which unifies the two admissible situations into one bucket: identical ancestry
// (both keys reduce to the same chain) and ambient-versus-bare (the themed rule's chain reduces to
// the bare one's). Pairing therefore costs a hash lookup instead of a comparison against every
// other rule of the same specificity -- which matters, because the naive pairing is ~1.8M pairs.
export function groupKey(entry) {
  const subject = entry.parsed.subject
  const state = subject.pseudoClasses.map((p) => `${p.name}(${p.argument ?? ''})`).sort().join()
  return [
    entry.specificity.join('-'),
    entry.atContext,
    subject.pseudoElement ?? '',
    state,
    ancestryKey(entry.parsed, { stripAmbient: true }),
  ].join('|')
}

// Kept as a named predicate so the reason a pair was admitted appears in the finding, and so the
// probes below can pin each branch independently.
export function comparability(earlier, later) {
  if (!ambientsCompatible(ambientOf(earlier.parsed), ambientOf(later.parsed))) return 'mutually-exclusive-theme'
  if (groupKey(earlier) !== groupKey(later)) return 'undecidable'
  return ancestryKey(earlier.parsed, { stripAmbient: false }) === ancestryKey(later.parsed, { stripAmbient: false })
    ? 'identical-ancestry'
    : 'ambient-ancestry'
}

// ---------------------------------------------------------------------------------------------
// The scan
// ---------------------------------------------------------------------------------------------

// Flattens the stylesheets into one cascade-ordered list of single-selector entries.
export function buildCascade(sheets) {
  const entries = []
  for (const [fileOrder, sheet] of sheets.entries()) {
    for (const rule of parseStylesheet(sheet.source, sheet.path, fileOrder)) {
      const declarations = parseDeclarations(rule.body)
      if (!declarations.length) continue
      for (const selector of splitSelectorList(rule.selectorText)) {
        const parsed = parseSelector(selector)
        if (!parsed.subject) continue
        entries.push({
          order: entries.length,
          path: rule.path,
          line: rule.line,
          atContext: rule.atContext,
          selector,
          parsed,
          specificity: specificity(parsed),
          declarations,
          ambient: ambientOf(parsed),
          strippedAncestry: ancestryKey(parsed, { stripAmbient: true }),
        })
      }
    }
  }
  return entries
}

// What this element computes for `property` from every rule that beats or precedes `limitOrder`,
// ignoring the rule at `limitOrder` itself. Used to answer "would the defeating declaration have
// changed anything on its OWN target?" -- the redundancy question.
// Resolves which rule actually PAINTS `property` on `shape`, among the rules that share an
// ancestry premise with it.
//
// The family restriction is what makes this sound without a DOM tree. Every rule with the same
// stripped ancestry key demands the same ancestor chain (or only the ambient theme prefix on top of
// it), so if any of them applies to this element, they all do, and ordinary cascade resolution --
// !important, then specificity, then source order -- gives the right answer among them. Rules with
// a DIFFERENT ancestry could in principle also win, which is why a finding is phrased as a claim
// about this family and not as an absolute computed value.
//
// This exists because "B is later and equally specific" is NOT sufficient for B to be what renders.
// `.theme-dark .core-button { background }` is later and equal to `.core-button.primary`, but
// `.theme-dark .core-button.primary` sits later still at 0-3-0 and is what actually paints, so the
// primary button never lost anything. Without this resolution that pair reports as a defeat, and it
// is not one -- which is exactly the sort of finding that teaches people to ignore a scanner.
function familyWinner(cascade, shape, property, family, ambient, { exclude = -1 } = {}) {
  let winner = null
  for (const entry of cascade) {
    if (entry.order === exclude) continue
    if (entry.parsed.subject.pseudoElement) continue
    if (entry.parsed.subject.pseudoClasses.length) continue
    if (entry.atContext) continue
    if (entry.strippedAncestry !== family) continue
    // A rule scoped to the OTHER theme is not in this element's cascade at all.
    if (entry.ambient !== null && ambient !== null && entry.ambient !== ambient) continue
    let declaration = null
    for (const [candidateProperty, candidate] of expandedDeclarations(entry)) {
      if (candidateProperty === property) declaration = candidate
    }
    if (declaration === null) continue
    if (matchCompound(entry.parsed.subject, shape) !== MATCH_YES) continue
    if (winner === null) { winner = { entry, declaration }; continue }
    if (winner.declaration.important && !declaration.important) continue
    if (!winner.declaration.important && declaration.important) { winner = { entry, declaration }; continue }
    if (compareSpecificity(entry.specificity, winner.entry.specificity) >= 0) winner = { entry, declaration }
  }
  return winner
}

const expandedCache = new WeakMap()
function expandedDeclarations(entry) {
  const cached = expandedCache.get(entry)
  if (cached) return cached
  const out = []
  for (const declaration of entry.declarations) {
    for (const [property, value] of expandShorthand(declaration.property, declaration.value)) {
      out.push([property, { ...declaration, property, value }])
    }
  }
  expandedCache.set(entry, out)
  return out
}

export function scanCascade(cascade, shapes) {
  const findings = []
  let comparedPairs = 0
  let matchedShapePairs = 0
  let unconfirmedPairs = 0
  let restoredPairs = 0
  let refinementPairs = 0
  let unverifiedPairs = 0

  // Index shapes by class so the pair search is not quadratic over 2500 elements.
  const shapesByClass = new Map()
  for (const shape of shapes) {
    for (const className of shape.classes) {
      if (!shapesByClass.has(className)) shapesByClass.set(className, [])
      shapesByClass.get(className).push(shape)
    }
  }
  // Narrow the witness search to the rarest class either subject demands. Both subjects have to
  // match, so any class from either one is a valid filter, and the rarest is the cheapest.
  const candidateShapes = (...compounds) => {
    let best = null
    for (const compound of compounds) {
      for (const className of compound.classes) {
        const list = shapesByClass.get(className) ?? []
        if (best === null || list.length < best.length) best = list
      }
    }
    return best ?? shapes
  }

  // Pairs only ever form inside a comparability group (see groupKey), which is what keeps this
  // from being the ~1.8M-pair sweep the naive equal-specificity pairing would be.
  const groups = new Map()
  for (const entry of cascade) {
    const key = groupKey(entry)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(entry)
  }

  // BLIND-SPOT ACCOUNTING, computed exactly and cheaply. Every same-specificity pair that shares a
  // property is a pair that COULD be a defeat; the ones not inside a shared group are the ones this
  // scanner declines to reason about, because deciding them needs a real DOM tree, a media-query
  // overlap analysis, or state reasoning. Counting them by difference costs two histograms instead
  // of the quadratic sweep, and printing the number every run is what keeps the blind spot visible
  // instead of letting it read as a clean sweep.
  const countPairs = (histogram) => [...histogram.values()].reduce((total, n) => total + (n * (n - 1)) / 2, 0)
  const bySpecificityProperty = new Map()
  const byGroupProperty = new Map()
  for (const entry of cascade) {
    const properties = new Set(expandedDeclarations(entry).map(([property]) => property))
    const specificityKey = entry.specificity.join('-')
    const group = groupKey(entry)
    for (const property of properties) {
      const a = `${specificityKey}|${property}`
      const b = `${group}|${property}`
      bySpecificityProperty.set(a, (bySpecificityProperty.get(a) ?? 0) + 1)
      byGroupProperty.set(b, (byGroupProperty.get(b) ?? 0) + 1)
    }
  }
  const candidatePairs = countPairs(bySpecificityProperty)
  const inGroupPairs = countPairs(byGroupProperty)
  const deferredPairs = candidatePairs - inGroupPairs

  for (const bucket of groups.values()) {
    if (bucket.length < 2) continue
    for (let a = 0; a < bucket.length; a += 1) {
      const earlier = bucket[a]
      for (let b = a + 1; b < bucket.length; b += 1) {
        const later = bucket[b]
        if (earlier.selector === later.selector) continue
        if (!ambientsCompatible(ambientOf(earlier.parsed), ambientOf(later.parsed))) continue

        // Which properties could collide at all, after shorthand expansion?
        const laterProperties = new Map(expandedDeclarations(later))
        const earlierProperties = new Map(expandedDeclarations(earlier))
        const shared = [...laterProperties.keys()].filter((property) => earlierProperties.has(property))
        if (!shared.length) continue

        const verdict = comparability(earlier, later)
        comparedPairs += 1

        // THE CO-OCCURRENCE QUESTION, answered by the markup: is there a real element that BOTH
        // subjects match? This is the step selector text alone cannot take, and it is the whole
        // reason `.theme-dark .production-mode-banner` versus
        // `.storage-durability-banner[data-durability="full"]` -- which share no class token -- is
        // visible here at all. Matched jointly, so mutually exclusive attribute states cannot pose
        // as a co-occurrence.
        const pairCompounds = [earlier.parsed.subject, later.parsed.subject]
        const needsAncestry = earlier.strippedAncestry !== '' || later.strippedAncestry !== ''
        let witness = null
        let witnessConfidence = MATCH_NO
        let sawUnverifiable = false
        for (const shape of candidateShapes(earlier.parsed.subject, later.parsed.subject)) {
          const confidence = matchCompounds(pairCompounds, shape)
          if (confidence === MATCH_NO) continue
          if (needsAncestry) {
            // Both selectors demand the same chain, so verifying either verifies both.
            const verified = verifyAncestry(later.parsed, shape) ?? verifyAncestry(earlier.parsed, shape)
            if (verified === null) { sawUnverifiable = true; continue }
            if (verified === false) continue
          }
          if (confidence > witnessConfidence) { witness = shape; witnessConfidence = confidence }
          if (confidence === MATCH_YES) break
        }
        if (!witness) {
          // A pair whose only candidate elements have ancestry this scanner cannot trace is a pair
          // it must not name an element for. Counted, not reported.
          if (sawUnverifiable) unverifiedPairs += 1
          continue
        }
        matchedShapePairs += 1
        // A witness that only MAYBE-matches (a dynamic attribute value, an unparsed selector) is
        // evidence the collision is possible, not that it happens. Those are counted and left out
        // of the report: an unconfirmable finding is exactly the kind of noise that gets a scanner
        // muted, and being muted is worse than not existing.
        if (witnessConfidence !== MATCH_YES) { unconfirmedPairs += 1; continue }

        const family = later.strippedAncestry
        const ambient = later.ambient ?? earlier.ambient

        for (const property of shared) {
          const earlierDeclaration = earlierProperties.get(property)
          const laterDeclaration = laterProperties.get(property)
          // !important reverses the outcome; then the earlier rule is not defeated at all.
          if (earlierDeclaration.important && !laterDeclaration.important) continue
          // A later rule restating the SAME value defeats nothing observable.
          if (normaliseValue(earlierDeclaration.value) === normaliseValue(laterDeclaration.value)) continue

          // Does the later rule actually PAINT this element, or does a third rule win anyway?
          const winner = familyWinner(cascade, witness, property, family, ambient)
          if (winner === null || winner.entry.order !== later.order) { restoredPairs += 1; continue }

          // Is the defeating declaration a no-op on its own target? That is what separates a silent
          // killer from a deliberate override, and it is the whole reason the report is short.
          const ownTarget = syntheticShape(later.parsed.subject)
          const without = ownTarget ? familyWinner(cascade, ownTarget, property, family, ambient, { exclude: later.order }) : null
          const redundant = without !== null && normaliseValue(without.declaration.value) === normaliseValue(laterDeclaration.value)

          // TIERS. `redundant` is the gate: the declaration paints nothing where it was written and
          // suppresses something where it was not, which is never intentional. `ambient-ancestry`
          // without redundancy is the advisory tier: a theme rule generically out-cascading an
          // earlier variant, which is the #530 `background` shape -- a real collision whose fix is a
          // judgement call (raise specificity, or accept), so it is listed but does not fail.
          // Everything else is one class refining another in the same premise, which is what the
          // cascade is FOR; those are counted only. Listing them was 94 findings of ordinary CSS.
          const tier = redundant ? 'redundant' : (verdict === 'ambient-ancestry' ? 'theme-override' : 'refinement')
          if (tier === 'refinement') { refinementPairs += 1; continue }

          findings.push({
            tier,
            property,
            defeated: { selector: earlier.selector, path: earlier.path, line: earlier.line, value: earlierDeclaration.value },
            defeating: { selector: later.selector, path: later.path, line: later.line, value: laterDeclaration.value },
            witness: { file: witness.file, line: witness.line, classes: [...witness.classes].join(' '), confidence: witnessConfidence },
            redundant,
            redundantAgainst: redundant ? { selector: without.entry.selector, line: without.entry.line, value: without.declaration.value } : null,
            specificity: earlier.specificity.join('-'),
            comparability: verdict,
          })
        }
      }
    }
  }

  // One declaration must produce one finding. Shorthand expansion deliberately emits both
  // `background` and the `background-color` it implies so that a shorthand on one side can be
  // compared with a longhand on the other -- but when BOTH sides declared the shorthand, the derived
  // longhand is the same defeat said twice. Drop a derived row whenever its parent shorthand is
  // already reported for the same pair on the same element.
  const deduped = findings.filter((finding) => {
    const parent = SHORTHAND_PARENT.get(finding.property)
    if (!parent) return true
    return !findings.some((other) =>
      other.property === parent &&
      other.defeated.line === finding.defeated.line &&
      other.defeating.line === finding.defeating.line &&
      other.witness.file === finding.witness.file &&
      other.witness.line === finding.witness.line)
  })

  deduped.sort((x, y) => Number(y.redundant) - Number(x.redundant) || x.defeated.path.localeCompare(y.defeated.path) || x.defeated.line - y.defeated.line || x.property.localeCompare(y.property))
  return { findings: deduped, comparedPairs, matchedShapePairs, unconfirmedPairs, restoredPairs, refinementPairs, unverifiedPairs, candidatePairs, deferredPairs }
}

// The element a rule was WRITTEN FOR: exactly the conditions its own subject demands, nothing
// more. Redundancy is a question about that element, not about any element in the app, so it is
// asked against this synthetic shape rather than against a witness that carries extra classes.
function syntheticShape(compound) {
  if (compound.pseudoElement || compound.pseudoClasses.length) return null
  const attributes = new Map()
  for (const attribute of compound.attributes) {
    if (attribute.operator === '=' && attribute.value !== null) attributes.set(attribute.name, [attribute.value])
    else attributes.set(attribute.name, ATTRIBUTE_UNKNOWN)
  }
  return { file: '<synthetic>', line: 0, tag: compound.tag, classes: new Set(compound.classes), attributes, ancestors: [], raw: '' }
}

// ---------------------------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------------------------

export function scan({ sheets, tsxRoot } = {}) {
  const resolvedSheets = sheets ?? STYLESHEETS.map((path) => ({ path, source: readFileSync(resolve(ROOT, path), 'utf8') }))
  const cascade = buildCascade(resolvedSheets)

  let shapes = []
  let unresolved = 0
  let tsxFiles = 0
  if (tsxRoot !== null) {
    const root = tsxRoot ?? resolve(ROOT, 'showroom/src')
    for (const file of listTsxFiles(root)) {
      tsxFiles += 1
      const extracted = extractShapes(readFileSync(file, 'utf8').replaceAll('\r\n', '\n'), relative(ROOT, file).replaceAll('\\', '/'))
      shapes = shapes.concat(extracted.shapes)
      unresolved += extracted.unresolved
    }
  }

  const result = scanCascade(cascade, shapes)
  return { ...result, cascade, shapes, unresolved, tsxFiles, ruleCount: cascade.length }
}

export function formatFinding(finding) {
  const tier = finding.redundant ? 'REDUNDANT' : 'theme-override'
  const lines = [
    `  [${tier}] ${finding.property} on <${finding.witness.classes}> at ${finding.witness.file}:${finding.witness.line}${finding.witness.confidence === MATCH_MAYBE ? ' (state-dependent)' : ''}`,
    `      written   ${finding.defeated.selector} { ${finding.property}: ${finding.defeated.value} }   ${finding.defeated.path}:${finding.defeated.line}`,
    `      defeated by ${finding.defeating.selector} { ${finding.property}: ${finding.defeating.value} }   ${finding.defeating.path}:${finding.defeating.line}  (both ${finding.specificity}, later wins)`,
  ]
  if (finding.redundant) {
    lines.push(`      the defeating declaration is a NO-OP on its own target: ${finding.redundantAgainst.selector} (line ${finding.redundantAgainst.line}) already gives it ${finding.redundantAgainst.value}`)
  }
  return lines.join('\n')
}

export { MATCH_YES, MATCH_MAYBE, MATCH_NO, AMBIENT_CLASSES, ROOT, ATTRIBUTE_UNKNOWN, OPAQUE, SHORTHAND_PARENT }
