# Entry-set reduction — planning pass

Date: 2026-08-30. Status: **planning only, no app code changed.** This is the
planning pass `PRODUCT-SUPREMACY-ROADMAP.md` §3 item 1(b) requires before
implementation of "shrinking the 91.3 KB gz entry set", the last identified FCP
lever named alongside the static app-shell skeleton that shipped in #567.

> **Update 2026-08-31: this document's headline recommendation SHIPPED, and its
> mechanism model held up.** Section 3 concluded that the render-blocking
> stylesheet was worth ~2.3 s — "twice what deleting the entire entry set is
> worth, for a third of the bytes" — and that FCP is gated by the chain
> document → `theme-restore.js` → stylesheet, with the `type="module"` entry set
> competing for bandwidth rather than blocking. That is now implemented on
> `claude/batch/boot-shell-first-paint`: a build-only Vite plugin rewrites the
> emitted `<link rel="stylesheet">` into `/css-async.js`, which appends it after
> parsing. **Measured FCP 3,236 → 1,492 ms, and 4,400 → 1,492 ms cumulative with
> the boot shell — a 66% reduction.**
>
> The shipped −1,744 ms is smaller than p5's −2,284/−2,308, and the gap is the
> model predicting itself correctly: p5 DELETED the stylesheet, so it never
> competed for bandwidth at all, while the shipped change only stops it
> *blocking* — it still downloads and still competes. An independent
> confirmation of section 3's mechanism rather than a discrepancy.
>
> Two verifier walks discovered the stylesheet through `<link rel="stylesheet">`
> and had to be taught the new shape in the same change, or they would have gone
> silently blind: the Shop first-paint closure in `verify_app_build.mjs`, and the
> release-asset corpus in `verify_app_release_live.mjs` (which is NOT in the
> 652-step gate — CI caught it as
> `missing_current_release_asset:launcher:#0b745e`).
>
> **Everything below stands as written**; the entry set is still an honest zero
> and C1/the 5-byte ratchet are still the live items. Only the "what to do next"
> ranking moved, because the thing it ranked first is done. What remains of the
> render-blocking chain is `/theme-restore.js` and its ~400 ms.

Measured on `claude/batch/boot-shell-first-paint` (`6db8da16`), i.e. **with the
boot shell present**, using `tools/perf/measure-android-baseline.mjs` after its
2026-08-30 cache fix (`Storage.clearDataForOrigin`). Same profile as every other
number in `ANDROID-PERFORMANCE-BASELINE.md`: CPU x6, 400 kbit/s down, 400 ms
RTT, 360x800@3x. Every figure below is a median of 3 cold loads on two routes.
No row in this document carries the polluted-median signature (sub-second median
with zero JS transfer bytes); the one sub-second row that appears — p5 at 968 ms
— transferred 422 KB of JS and is a real cold load with the stylesheet deleted.

---

## Verdict, up front

**The item as scoped is an honest zero, and the roadmap's stated premise for it
is stale.**

Three findings, each measured:

1. **The entry set is no longer the pre-FCP critical path.** The premise this
   item inherited — "91.3 KB gz on every route… that is the entire pre-FCP
   critical path" — was true on 2026-08-20 and stopped being true when the boot
   shell landed ten days later. Post-shell, **19,068 bytes** of JS have finished
   transferring when FCP fires, identically on both routes and in all six runs.
   The 254 KB entry chunk has *not* finished; it is not what the user is waiting
   for.
2. **Byte reductions of achievable size buy nothing.** Removing **19.1 KB gz**
   from the entry chunk moved FCP by **+4 / −8 ms**. Removing **40.1 KB gz**
   moved it by **−20 / −4 ms**. Both are inside the ±88 ms control band this
   document's predecessor established. The entire app-authored share of the
   entry set is ~15 KB gz — smaller than the reduction that already measured
   zero.
3. **What the entry set costs FCP is request contention, not bytes.** Deleting
   the four `modulepreload` links — **zero bytes removed, the same five files
   still fetched** — moved FCP by **−428 / −448 ms**, and pushed `load` out by
   **+414 / +363 ms**. That is a real lever, it is not the lever the roadmap
   named, and its measured cost sits exactly where slice 1's did.

So: do not open a PR that shaves kilobytes off the entry set expecting FCP to
respond. It will not, and the harness cannot even tell you it did not, because
the change will land inside the noise band. What is worth doing is listed in
§6, and only one of those items is a perf change.

There is also an operational finding that has nothing to do with FCP and is
more urgent than any of it: **the entry set is 5 bytes under the gate's own
ceiling** (§7).

---

## 1. What is actually in the 91.3 → 94.7 KB gz entry set

The entry set has grown since it was last counted. `index.html` now names five
JS files, not four (`managed-workspace-selection` is new), and the total is
**94.7 KB gz / 299,995 bytes raw**:

| File | raw | gz | why the document fetches it |
|---|---|---|---|
| `index-CiYQNh9c.js` | 254,776 | 79,985 | the `<script type="module">` entry |
| `router-Zh6n5DDi.js` | 36,210 | 13,140 | entry static import, modulepreloaded |
| `index-elwlu7WY.js` (react core) | 7,614 | 2,914 | entry static import, modulepreloaded |
| `preload-helper-BXl3LOEh.js` | 1,110 | 650 | entry static import, modulepreloaded |
| `managed-workspace-selection-DlZqP7Va.js` | 285 | 252 | entry static import, modulepreloaded |
| **total** | **299,995** | **96,941 (94.7 KB)** | |
| *(for scale)* `index-B1L3eZuA.css` | 230,018 | 34,815 | render-blocking `<link rel="stylesheet">` |

gz figures are node `zlib.gzipSync` at its default level, which is what the
measurement harness's static server actually serves; they run a few hundred
bytes above a `gzip -9` of the same file.

### Composition of the entry chunk, by module

From `rollup-plugin-visualizer` (`ANALYZE=1`), which reports per-module
pre-minification source and per-module gzip. Per-module gzip does not sum to
whole-file gzip — 133,164 vs the real 79,985 — so the third column is that
proportion applied to the real chunk, and is approximate:

| Module | pre-min raw | share | ≈ real gz |
|---|---|---|---|
| `react-dom/cjs/react-dom-client.production.js` (+ react-dom shims) | 561,247 | 73.6% | 58.9 KB |
| `scheduler` | 11,420 | 2.1% | 1.7 KB |
| `react/jsx-runtime` | 1,644 | 0.6% | 0.5 KB |
| `vite/modulepreload-polyfill` | 1,168 | 0.4% | 0.3 KB |
| **`site-manifest.json`** | **20,501** | **4.8%** | **3.8 KB** |
| `src/core/CoreShell.tsx` | 35,032 | 6.1% | 4.9 KB |
| `src/core/i18n-actions.ts` | 17,128 | 3.8% | 3.0 KB |
| `src/App.tsx` | 9,274 | 1.0% | 0.8 KB |
| `src/core/product-setup.ts` | 7,053 | 1.6% | 1.3 KB |
| `src/core/behavior-trail.ts` | 6,334 | 1.4% | 1.1 KB |
| `src/core/client-error-reporter.ts` | 4,094 | 1.1% | 0.9 KB |
| `src/core/storage-durability.ts` | 3,834 | 0.9% | 0.7 KB |
| `src/analytics/metrics-collector.ts` | 3,739 | 1.0% | 0.8 KB |
| `src/core/RouteErrorBoundary.tsx` | 2,768 | 0.8% | 0.6 KB |
| `src/core/managed-product-access.ts` | 1,583 | 0.4% | 0.3 KB |
| `src/main.tsx`, `commerce-tabs`, `product-storage-keys` | 882 | 0.4% | 0.3 KB |

Rolled up across the whole five-file entry set:

| Bucket | ≈ gz | share of 94.7 KB |
|---|---|---|
| React + react-dom + scheduler + jsx-runtime | 63.9 KB | **67.5%** |
| react-router | 12.8 KB | 13.5% |
| app-authored source | 15.0 KB | 15.8% |
| `site-manifest.json` (data, not code) | 3.8 KB | 4.0% |
| Vite runtime (preload helper + polyfill) | 1.0 KB | 1.0% |

**Two-thirds of the entry set is React.** The app's own code is one sixth of it.
That single fact bounds every proposal below before any measurement: even a
perfect, zero-risk deletion of *all* app-authored entry code is a 15 KB gz
change, and §3 shows a 19 KB gz change measures as nothing.

### Why each app module is there, checked rather than assumed

- `CoreShell.tsx`, `App.tsx`, `RouteErrorBoundary.tsx`, `main.tsx`,
  `commerce-tabs.ts`, `managed-product-access.ts`,
  `managed-workspace-selection.ts` — genuinely first-paint. `CoreLayout` and
  `ProductHomeEntry` render the first frame; every product route in `App.tsx` is
  already `lazy()`. There is no router table pulling route modules in: the
  route table is 9 KB of pre-minified JSX and the routes themselves are absent
  from the entry chunk. That theory does not survive contact with the build.
- `i18n-actions.ts` — imported by `CoreShell` for `bi()` on nav labels. Needed.
- `behavior-trail.ts` — imported by `CoreShell`, called on first render.
- `metrics-collector.ts`, `client-error-reporter.ts` (and `storage-durability.ts`,
  which the reporter pulls) — module-scope side-effect calls in `main.tsx`.
  Deferrable in principle; see C3.
- `product-setup.ts` → **`site-manifest.json`** — the one genuinely accidental
  item, and the only one. See C1.

### The coverage gap is not dead weight

`jsExecutedBytes` vs `jsSourceBytes` for the entry set on `/`: entry chunk
118,293 / 251,947 (47%), router 16,314 / 36,210 (45%), react core 3,793 / 7,614
(50%). On `/?choose=1`: 43% / 36% / 48%.

A naive reading calls the other ~53% removable. It is not. The chunk is 73.6%
`react-dom-client.production.js`, and the unexecuted half of that is React's
untaken paths — suspense, error replay, hydration, the event plugins this app's
first render does not hit. There is no bundler configuration that removes them
and no import graph change that avoids them. **The coverage gap here is a
property of shipping React, not evidence of an import mistake**, and this
document is recording that so the next audit does not re-derive "75% of the
entry set is unexecuted freight" and act on it. The chooser's version of the
same mistake was already corrected on 2026-08-20.

---

## 2. The entry set is not on the pre-FCP critical path any more

`jsTransferBeforeFcpBytes` — script bytes fully transferred when FCP fires — on
the current build:

| Route | FCP | pre-FCP JS bytes |
|---|---|---|
| `/` | 3,252 ms | **19,068** |
| `/?choose=1` | 3,260 ms | **19,068** |

Identical across both routes and all six runs. The metric counts only resources
whose `responseEnd` precedes FCP, and 19,068 accounts for exactly the four
modulepreloaded siblings plus the three classic shell scripts, with resource-
timing header overhead:

    router 13,140 + react core 2,914 + preload-helper 650
      + managed-workspace-selection 252
      + theme-restore 220 + sw-register 125 + vercel-insights 182
      = 17,483, plus ~7 x ~225 B of response headers = ~19,058

**The 254 KB entry chunk is not in that sum.** It has not finished downloading
when the page paints. The boot shell paints from the document's own inline CSS
as soon as the render-blocking work above it clears, and the entry chunk is
still on the wire at that moment.

This is the whole reason the roadmap's framing needs restating. On 2026-08-20
the pre-FCP column read 91.3 KB on every route and the conclusion "the entry set
IS first paint" followed correctly. #567 changed what first paint is. The entry
set's remaining relationship to FCP is indirect: it competes for a 50 KB/s pipe
with the render-blocking stylesheet.

---

## 3. Dose-response: the measurement that decides this item

Seven variants, all against the same build, all 3 runs x 2 routes, taken back to
back on one machine. Variants are produced by mutating `showroom/dist` in a
throwaway worktree — never by changing app source — so the comparison is exact.
Where a variant leaves the app unable to mount (a truncated or emptied entry
chunk), that does not affect the measurement: FCP is the boot shell painting,
and the shell is pure CSS in the document.

| # | Variant | JS bytes removed (gz) | FCP `/` | FCP `/?choose=1` | Δ FCP | `load` Δ |
|---|---|---|---|---|---|---|
| — | **baseline** | 0 | **3,252** | **3,260** | — | — |
| p1 | entry chunk truncated | −19,080 | 3,256 | 3,252 | **+4 / −8** | −486 / −528 |
| p2 | entry chunk truncated | −40,120 | 3,232 | 3,256 | **−20 / −4** | −603 / −554 |
| p3 | entry chunk emptied | −79,700 | 2,604 | 2,208 | −648 / −1,052 | −1,198 / −2,036 |
| p4 | whole entry set removed | −94,700 | 2,116 | 2,136 | **−1,136 / −1,124** | −1,681 / −1,686 |
| p5 | stylesheet removed (JS intact) | 0 (CSS −34,815) | **968** | **952** | **−2,284 / −2,308** | −705 / −702 |
| p6 | 4 `modulepreload` links deleted | **0** | 2,824 | 2,812 | **−428 / −448** | **+414 / +363** |
| p7 | p3 + p6 | −79,700 | 2,144 | 2,116 | −1,108 / −1,144 | −1,659 / −1,702 |

Read the first three rows together. **Removing 19 KB gz: nothing. Removing 40 KB
gz: nothing. Removing the whole 79.7 KB chunk: 648–1,052 ms.** The response is a
step, not a slope. There is no "shave 10 KB, win 120 ms" trade available here;
the trade does not exist at any size a real change can reach.

Then read p5 and p6 against p4. **The render-blocking stylesheet is worth 2.3
seconds — twice what deleting the entire entry set is worth, for a third of the
bytes.** And p6 shows that removing zero bytes, while changing how many requests
are in flight, is worth 40% of what removing every byte is worth.

### Mechanism

FCP is gated by the render-blocking chain: document → `theme-restore.js` →
stylesheet. The entry set is `type="module"`, so it blocks nothing; it only
competes for bandwidth with the stylesheet. On a 400 kbit/s pipe the browser has
six requests in flight, and the stylesheet's share is set by *how many
competitors exist while it downloads*, not by how large they are. Shrinking one
competitor that is still downloading when the stylesheet completes changes the
stylesheet's share by nothing — which is p1 and p2. Removing a competitor
entirely, or removing four of them (p6), changes it immediately.

This also retro-explains the 2026-08-20 rejection of slice 2 cleanly: adding a
`modulepreload` for `core-app` cost +1.5 s FCP because it added a competitor
during the stylesheet's window. p6 is the same physics run backwards, and the
agreement between the two is the best evidence that this model is right rather
than a story fitted to one run.

---

## 4. What this means for the roadmap item

`PRODUCT-SUPREMACY-ROADMAP.md` §3 item 1(b) says the entry set "is the only
other thing FCP responds to". Measured: **FCP does not respond to entry-set size
at any achievable magnitude.** The item should be closed with an honest zero,
the same way P3.5b/c/d was closed in `DESIGN-PROGRAM.md` — by evidence, not by
completion.

That is not the same as saying the entry set does not matter. It is 300 KB of
raw JS that every visitor parses on a throttled phone, it is 5 bytes from the
gate's ceiling, and it dominates `load` (p1 and p2, which did nothing for FCP,
each took ~500 ms off `load`). Those are real and worth managing. They are just
not FCP, and the roadmap files it under FCP.

---

## 5. Candidates, each with mechanism, saving, risk, and verifiability

Every "expected FCP" below is read off §3's dose-response curve, not estimated
from bytes-per-second. Where it says 0 ms, that is a measured zero for a *larger*
reduction than the candidate proposes.

### C1 — Narrow the `site-manifest.json` import (the only real accident)

**Mechanism.** `showroom/src/core/product-setup.ts:4` imports the whole site
manifest with `with { type: 'json' }` and builds `productContracts` at module
scope. Rollup already tree-shakes the file down to its `customerProducts` array
(20,501 of the manifest's 36,059 bytes reach the chunk), but it cannot go
further: `requireProductContract` does a runtime `.find()` and reads six fields
(`id`, `runtimeId`, `name`, `status`, `headline`, `templates`), so the other nine
per-product fields — `kind`, `publicAnchor`, `appRoute`, `eyebrow`,
`description`, `primaryCta`, `secondaryCta`, `modules`, `internalTemplatePacks` —
ship to every visitor on every route and are never read by any client code.

`CoreShell` imports only `clientSetupPath` and `readProductSetup` from this
module, but both really do reach the manifest (`clientSetupPath` needs `slug`;
`readProductSetup` → `normalizeSetup` → `templateFor` → `productContracts`), so
this is not a case of a barrel dragging in an unrelated table. The waste is
field-level, inside the data.

**Measured saving.** Built twice, once with those nine fields removed from
`customerProducts`: entry chunk **254,776 → 244,444 raw (−10,332)** and
**79,699 → 76,375 gz (−3,324)**. `tsc -b` passed on the narrowed manifest, which
independently confirms nothing typed reads the dropped fields.

The implementation must not be the experiment: `site-manifest.json` is an
authority file with non-app consumers, so the mechanism is a narrowing at the
import boundary (a generated or hand-kept `product-contracts` module holding the
six fields, with a verifier assertion that it matches the manifest), never
deleting fields from the manifest.

**Expected FCP: 0 ms.** 3.3 KB gz is a sixth of the reduction that measured
zero.
**Real value:** 10,332 raw bytes of `initial_javascript_budget` headroom — see
§7, where that is currently 5.
**Risk:** low, but non-trivial in maintenance: it introduces a second place the
six fields live, so it needs a pin that fails when the two drift.
**Verifiable without a founder gate:** yes, entirely — build-output byte
comparison plus a `verify_app_build.mjs` assertion.

### C2 — Drop the four `modulepreload` links (`build.modulePreload: false`)

**Mechanism.** One line in `showroom/vite.config.ts`. Vite stops emitting
`<link rel="modulepreload">` for the entry chunk's static imports; the browser
discovers router, react, the preload helper and `managed-workspace-selection`
after parsing the entry chunk instead of from the preload scanner.

**Measured: −428 / −448 ms FCP, +414 / +363 ms `load` (p6).** Zero bytes change
hands. Long-task totals are unchanged (`/`: 888 → 1,011 ms; chooser: 489 →
522 ms, both inside the ±116 ms band).

**This is not the lever this document was commissioned to plan**, and it is
listed here because the measurement that killed the byte-shaving lever found it.
It is also **not** a re-proposal of the rejected slice 2: slice 2 *added* a
`modulepreload` for a chunk that was not in the entry graph, and made FCP worse
by putting a new competitor on the pipe during the stylesheet's window. C2
*removes* four existing competitors from that window. Same mechanism, opposite
sign, and the two results agree with each other.

**Risk: real, measured, and of exactly the shape that killed slice 1.** The
+390 ms on `load` is the app becoming interactive later, and `load` is a proxy —
the honest number is a tap-through one nobody has taken. Trading 436 ms of first
paint for ~390 ms of time-to-usable is not obviously a good trade, and on the
`/` route (which redirects to `/shop/`) the delayed discovery of `router` sits
directly in front of the redirect. **This must not ship on the numbers in this
document.** It needs its own pass with an early-tap probe of the kind described
in the 2026-08-20 section: load, tap a product tile at a fixed delay after FCP,
and time to usable, three runs per variant.
**Verifiable without a founder gate:** yes — but only after that probe exists,
and the probe has to be written first (the 2026-08-20 one was ad hoc and is not
in `tools/`).

### C3 — Defer `main.tsx`'s three module-scope side effects

**Mechanism.** `startMetricsCollector()`, `startClientErrorReporter()` and
`startStorageQuotaWatch()` run at module scope; move them behind a post-mount
dynamic import.

**Saving: ~2.4 KB gz** (`metrics-collector` + `client-error-reporter` +
`storage-durability` ≈ 3.0% of the entry chunk).
**Expected FCP: 0 ms** — an eighth of a reduction that measured zero.
**Risk:** this is a *deferral*, not a removal, and all three modules are also
imported by `CoreApp`/`commerce-workspace`, so the bytes reappear on the shop
route. That is precisely slice 1's failure mode: withholding bytes the
destination needs delays the destination. It also weakens two guarantees on
purpose — the error reporter would miss errors thrown during boot, which is when
a chunk-load failure happens, and the storage-quota watch is owner-facing and
installed on every host by deliberate comment.
**Recommendation: do not do this.** Zero measured upside, non-zero behavioural
cost.

### C4 — Prune the unrendered Burmese drafts from `i18n-actions.ts`

**This is the "obvious fix" of this audit, and it is deliberate, pinned
behaviour.** Recording it so the next pass does not spend a lane on it.

`ACTION_TRANSLATIONS` holds 93 entries, of which **60 are
`pending_native_review`** — `bi()` returns English for anything not
`'confirmed'`, so those 60 Burmese strings are downloaded by every visitor on
the critical path and can never be rendered. Standalone that is 6,353 raw /
~1.4 KB gz.

It is not removable. `verify_app_build.mjs` ~6115 slices `ACTION_TRANSLATIONS`
out of the source and pins the presence of specific keys in it (`'Today':`,
`'Sell':`, `'Orders':`, `'Stock':`, `'Review order':`, `'Create order':`,
`'Print receipt':`, `'Scan to pay':`) *and* the absence of one (`'Products':`, a
documented refusal). The design intent is stated in the pin's own comment: a
native reviewer's sign-off must be "a one-line status flip with zero call-site
churn". Moving the drafts out of the shipped table to save 1.4 KB gz — which
§3 says is worth 0 ms — would break that workflow and require rewriting the pins
that protect it.
**Expected FCP: 0 ms. Recommendation: rejected on design intent, not on size.**

### C5 — Replace `react-dom` (preact/compat or similar)

**Mechanism.** The only change large enough to reach p3's step: react-dom is
58.9 KB gz of the 94.7 KB entry set.
**Expected FCP:** unknown and probably still 0 — p2 shows a 40 KB gz cut does
nothing, and a ~50 KB cut lands between p2 (nothing) and p3 (−648 ms) with no
measured point in between. It would have to shrink the entry chunk enough to
*complete before the stylesheet does* to pay anything at all.

**It is NOT blocked by the rehearsal cascade, and the first draft of this
document said it was.** Checked rather than assumed: the digest-bound
`package.json` is the **root** one — it is `sourceReceipts[8]` in
`hq/readiness/managed-pilot-readiness.json`, alongside `hq/portfolio.json`,
`hq/NOW.md` and `kernel/managed-pilot-readiness.mjs`. `showroom/package.json`
is not in that list, and `verify_app_build.mjs` reads it for exactly one thing
(`appPackage.scripts.lint`, ~3894). So a showroom dependency change is an
ordinary change, and the PG17 blocker does not apply to it. Recording that
because "adding a dependency needs the cascade" is a plausible-sounding
generalisation that is wrong for `showroom/`, and it would wrongly park real
work — including, separately, anything that ever needs a package added to the
app rather than to the kernel.

**Rejected on merit instead:** predicted-zero FCP against a measured-zero at a
larger size, in exchange for swapping the rendering runtime under all four
products. Behavioural risk enormous, payoff unmeasurable.
**Recommendation: rejected, and not because it is blocked.**

### C6 — Split react-dom into its own manual chunk

**Mechanism.** Add a `manualChunks` branch for `/node_modules/react-dom/`.
**Saving: zero bytes.** It moves bytes between files and adds one request to the
entry set.
**Predicted FCP: worse.** This is p6 run backwards — one more competitor on the
pipe during the stylesheet's window — and slice 2 measured that direction at
+1.5 s. Listed only because "split the vendor bundle" is the reflex proposal
here and the model predicts it is harmful.
**Recommendation: rejected, with a falsifiable prediction attached.**

### C7 — Deep-import `react-router` to shed its SSR barrel

**Mechanism.** The router chunk carries `dom/ssr/components.js` (2,531),
`dom/ssr/links.js` (1,241), `dom/ssr/routeModules.js`, `single-fetch.js`,
`ssr/invariant.js` — ~4.8 KB of 34.6 KB per-module gz, ≈1.8 KB gz real — pulled
in through the package's barrel entry. (The `server-runtime/*` and
`turbo-stream` modules are already tree-shaken to 0 bytes, so the barrel is
mostly, but not entirely, shakeable.)
**Expected FCP: 0 ms.** Also a change to how a dependency is imported, for 1.8 KB.
**Recommendation: not worth a lane.**

---

## 6. Ranking

1. **C1 — narrow the manifest import.** The only genuinely accidental byte in
   the entry set, measured at −10,332 raw / −3,324 gz. Worth doing **for the
   budget headroom in §7, not for FCP**, and the PR should say so in those
   words.
2. **§7 — restate the `initial_javascript_budget` ratchet.** Not a perf change
   at all; an operational hazard with 5 bytes of margin. Highest actual
   urgency on this page.
3. **C2 — the modulepreload question.** The only measured FCP win here
   (−436 ms), and the only item that needs a further planning pass rather than
   an implementation. Blocked on writing a tap-through probe. Do not ship it on
   this document's numbers.
4. **C7, C3** — measured-zero FCP, small real bytes, non-zero risk. Skip.
5. **C4, C6, C5** — rejected: deliberate pinned behaviour, predicted harmful,
   and founder/cascade-blocked respectively.

**And the honest headline: the highest-value FCP work in this area is not in
this document's scope.** p5 measured the render-blocking stylesheet at
**−2,290 ms** — twice the entire entry set, for a third of the bytes. Combined
with the ~400 ms `theme-restore.js` round trip already recorded on 2026-08-30,
the render-blocking chain is where the remaining seconds are. That is
`ANDROID-PERFORMANCE-BASELINE.md`'s lever 2, and it should be promoted above
this one in `PRODUCT-SUPREMACY-ROADMAP.md` §3.

---

## 7. Operational finding: the entry-set budget has 5 bytes of headroom

Independent of everything above, and more urgent than any of it.

`tools/verify_app_build.mjs` ~20818 walks the document's JS entry graph and
budgets its **raw** bytes:

    if (initialJavascriptBytes < 260_000) fail(`initial_javascript_budget_implausible:...`)
    if (initialJavascriptBytes > 300_000) fail(`initial_javascript_budget:...`)

Reproducing that walk against the current build gives 5 assets and
**299,995 bytes**. **The gate has 5 bytes of margin.** The next PR that adds a
line of code to any module in the entry graph fails the build, and the failure
will read as a byte budget rather than as "you touched the entry graph" — which
is a confusing place for an unrelated feature PR to land.

Two things follow, and they pull in opposite directions, which is why this is a
decision rather than a task:

- The ceiling is doing its job. It is what has kept the entry graph from
  absorbing product code, and `CLAUDE.md` is explicit that budgets get raised
  for real product value, never lowered to make room.
- The floor is 260,000, so **any reduction larger than 39,995 raw bytes trips
  `initial_javascript_budget_implausible`**. C1 alone (−10,332) does not; C1
  plus anything ambitious would. The check's own comment already anticipates
  this: "when a real reduction trips the floor, lower the floor in the same
  commit and say what shrank."

Recommendation: land C1 with the floor and ceiling both moved down by its
measured saving in the same commit, so the ratchet keeps its grip instead of
banking the win as headroom for future growth. That is a `verify_app_build.mjs`
edit — in the gate chain, not digest-bound — and needs no `package.json` change
and no founder gate.

---

## 8. What would need a founder gate, and what would not

**Nothing in §5 or §7 needs a founder decision, and nothing in it is blocked by
the PG17 rehearsal cascade either.** C1, C7, C3 and the §7 ratchet are ordinary
app/verifier changes. C2 needs a tap-through probe, not a gate. C5 is rejected
on merit, not blocked — see the correction inside C5: only the root
`package.json` is digest-bound, and `showroom/package.json` is not.

Nothing here touches production Supabase, billing, pricing, or the release
workflow.

No change proposed here touches `showroom/index.html`, so **the Shop first-paint
brotli closure is unaffected**; reproducing that walk on this build gives 24
assets at **458,431 bytes brotli q3**, 16,569 under the 475,000 ceiling (within
3 bytes of the 458,434 on record).
C1 reduces the closure by C1's brotli saving rather than growing it. C2 removes
four `<link>` tags, shrinking `index.html` by exactly 336 bytes of markup and
leaving the closure membership identical.

---

## 9. Limitations

- **Variants are dist mutations, not builds of real changes.** p1/p2/p3
  truncate or empty the entry chunk, which leaves the app unable to mount. That
  is sound for FCP — the boot shell is pure inline CSS and paints regardless —
  and it is why `load` in those rows is not comparable to baseline (there is no
  app to settle). It is *not* sound for anything past first paint, so no
  interactivity claim is made from p1–p4 or p7.
- **The `load` deltas for p6 are a proxy for interactivity, not a measurement of
  it.** The number that decides C2 is a tap-through one, and it does not exist
  yet.
- **Three runs cannot resolve better than the control band** established on
  2026-08-20: −88 to +44 ms FCP, −108 to +116 ms long-task total. Every "0 ms"
  in this document means "inside that band", not "identical". p1's +4/−8 and
  p2's −20/−4 are comfortably inside it; p6's −428/−448, p4's −1,130 and p5's
  −2,300 are far outside it.
- **`jsTransferBeforeFcpBytes` counts only completed resources.** A partially
  transferred entry chunk contributes nothing to it, which is exactly the point
  being made in §2, but it means the metric understates bytes on the wire before
  paint. It is a "what finished" metric, not a "what was in flight" one.
- Per-module attribution in §1 comes from the visualizer's pre-minification
  sizes, and per-module gzip does not sum to whole-file gzip. The composition
  percentages are proportional estimates. The one place it mattered — the
  manifest — was checked directly against two real builds and came back at
  3,324 gz against the 3.8 KB the proportion predicted.
- Both routes measured here (`/` and `/?choose=1`) share an identical entry set
  and identical pre-FCP transfer, and the 2026-08-20 table showed the same
  91.3 KB on all seven routes. The other five were not re-measured for this
  pass; nothing in §3 depends on them.
