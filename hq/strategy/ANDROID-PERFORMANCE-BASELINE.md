# Low-end Android performance baseline (roadmap F2 — measurement pass)

Date: 2026-08-19 (revised same day: the original "chooser" row actually
measured the default-entry redirect — see the route-semantics note in Method)

> **2026-08-20 correction — read this before acting on anything below.** The
> chunk-attribution paragraph in this document originally blamed
> `workspace-runtime.ts`'s static imports for the model chunks loading on the
> chooser. That was wrong; the cause is `WorkspaceStatusPanel`. Two of the
> ranked recommendations rested on that misattribution and on a second wrong
> claim — that the dynamic-import waterfall sets first paint. Both are corrected
> in place below (each correction is marked) and the evidence, plus an
> optimization pass and its measured before/after, is in
> **[2026-08-20: correction, slice 1, and what actually moves FCP](#2026-08-20-correction-slice-1-and-what-actually-moves-fcp)**
> at the end.

Status: measurement only. No optimization was performed in this pass; the
roadmap's F2 verdict ("no measured low-end-device profile exists — measure
first", `hq/strategy/PRODUCT-SUPREMACY-ROADMAP.md` §1 F2) is what this
document closes. Every number below is a measured median from the run
described in Method; nothing here is estimated or extrapolated.

Reproduce with:

```
npm --prefix showroom run build
node tools/perf/measure-android-baseline.mjs --runs 3 --out baseline.json
```

## Method

- Build: production `showroom/dist` (vite 7.3.6, `es2022` target), served by
  the measurement script's own local static server with on-the-fly gzip
  (level 6) and SPA fallback — so transfer bytes approximate real gzip
  hosting, not raw file sizes.
- Browser: Chromium 141.0.7390.37 headless (`/opt/pw-browsers/chromium-1194`),
  driven over raw CDP by `tools/perf/measure-android-baseline.mjs`
  (standalone Node script, zero dependencies, not wired into any verify
  chain).
- Throttling (the "Galaxy-class" emulation), applied per page session before
  navigation:
  - CPU: `Emulation.setCPUThrottlingRate` ×6
  - Network: `Network.emulateNetworkConditions` — 400 ms round-trip latency,
    400 kbit/s (50,000 bytes/s) down and up, `cellular3g` (Slow-3G-ish;
    between DevTools' Slow 3G and Fast 3G presets)
  - Viewport: 360×800 @ 3× DPR, mobile, Android 13 SM-A135F (Galaxy A13)
    user-agent string
- Route semantics (verified in source): bare `/` is NOT the chooser.
  `ProductHomeEntry` redirects it to the remembered product, defaulting to
  Shop (`CoreShell.tsx` ~513–525, `DEFAULT_ENTRY_PRODUCT = 'commerce'` at
  `CoreShell.tsx:93`), and a missing `?tab=` resolves to `counter`
  (`commerce-tabs.ts:21–22`). So `/` is measured as its own row — it is the
  real first-load path a fresh or returning-Shop user hits (redirect →
  counter) — and the chooser screen is measured at `/?choose=1`.
- Per run: fresh tab, HTTP cache disabled (`Network.setCacheDisabled`), cold
  navigation, then settle until main thread and network were both quiet for
  3 s (45 s cap). 3 runs per route; the table reports medians.
- Metrics: FCP / DOMContentLoaded / load from the page's Performance
  timeline; long tasks from a `PerformanceObserver('longtask')` injected
  before navigation; JS transfer bytes from `Network.loadingFinished`
  (gzip-encoded, Script resources only); JS source/executed bytes from
  `Profiler.takePreciseCoverage` (detailed, block-level); ScriptDuration /
  TaskDuration from `Performance.getMetrics`.
- The build's `dist/` contains no `sw.js`, so the service-worker registration
  in `showroom/index.html:59` 404s and no SW cache interferes with runs.

## Per-route results (median of 3 cold loads)

| Route | FCP (ms) | DCL (ms) | load (ms) | JS transfer (KB gz) | JS source (KB) | JS executed (KB) | Long tasks | Long-task total (ms) | Longest task (ms) | ScriptDuration (s) |
|---|---|---|---|---|---|---|---|---|---|---|
| `/` (default entry: redirect → Shop counter) | 3,940 | 3,690 | 3,690 | 415 | 1,483 | 327 | 7 | 1,412 | 627 | 1.68 |
| `/?choose=1` (chooser) | 4,052 | 3,677 | 3,678 | 261 | 926 | 213 | 4 | 819 | 314 | 0.77 |
| `/shop/?tab=counter` | 4,088 | 3,724 | 3,726 | 415 | 1,483 | 323 | 7 | 1,767 | 745 | 1.75 |
| `/shop/?tab=orders` | 4,100 | 3,742 | 3,742 | 424 | 1,508 | 370 | 8 | 2,031 | 758 | 2.27 |
| `/plant/` | 4,056 | 3,710 | 3,711 | 411 | 1,470 | 301 | 8 | 1,358 | 463 | 1.52 |
| `/website/` | 4,088 | 3,715 | 3,716 | 330 | 1,150 | 292 | 5 | 1,102 | 330 | 1.05 |
| `/ecommerce/` | 4,168 | 3,748 | 3,749 | 346 | 1,242 | 315 | 8 | 1,394 | 331 | 1.34 |

Run-to-run spread in this run was tight (FCP within ±3% of the median on
every route; full per-run triples in the appendix), so the medians are
stable enough to rank against.

Reading the shape: the 4 KB HTML shell arrives in well under a second at
this throughput, yet FCP lands AFTER the load event on every route —
`index.html` paints nothing; first paint waits for the entry chunk plus every
eagerly-imported model chunk to download, parse, and execute. `load`
(~3.7 s) covers only the modulepreloaded entry set (`index-*.js` 74 KB gz +
`router-*.js` 13 KB gz + CSS 35 KB gz); the dynamic route/model chunks keep
streaming after it, which is why FCP trails load by 250–450 ms.

The chooser row is the tell: `/?choose=1` ships 37% less JS than the counter
(261 vs 415 KB gz, 11 vs 22 scripts) yet paints in the same ~4.05 s. First
paint on this profile is dominated by the serial critical path — HTML →
entry chunk → dynamically imported model chunks, each dynamic-import hop
paying the 400 ms RTT — not by total bytes.

## Chunk attribution

Named chunks map to sources via `showroom/vite.config.ts` `manualChunks`
(lines 88–115). Hashes are from this build; names are stable.

| Chunk | gz KB | src KB | Source |
|---|---|---|---|
| `core-app-*.js` | 100.0 | 393 | `src/core/CoreApp.tsx` + `OperationsPageRoute.tsx` — loads on `/`, `/shop/*`, `/plant/`; NOT on the chooser, `/website/`, `/ecommerce/` |
| `index-Dl7tVyPC.js` (entry) | 74.1 | 233 | main entry: react, react-dom, App, CoreShell |
| `commerce-model-*.js` | 60.1 | 237 | `src/core/commerce-workspace.ts` |
| `operating-models-*.js` | 50.3 | 201 | `production-workspace.ts`, `channel-order-intake.ts`, `managed-trial.ts`, `team-work.ts` |
| `operating-baseline-*.js` | 26.2 | 96 | `src/core/operating-baseline.ts` |
| `capability-tiers-*.js` | 15.1 | 49 | `src/core/capability-tiers.ts` |
| `shop-ledger-accounts-*.js` | 13.3 | 51 | `src/core/shop-ledger-accounts.ts` |
| `website-model-*.js` | 11.2 | 39 | `src/products/website/website-model.ts` |
| `index-BrCosHje.js` | 56.0 | 214 | `@supabase/supabase-js` — dynamically imported at `managed-trial.ts:2477`; did NOT load on any measured route (good) |

The eager edge that defeats route splitting: the model layer rides along
everywhere. `commerce-model` (60.1 KB gz), `operating-models` (50.3 KB gz),
`operating-baseline` (26.2 KB gz), and `shop-ledger-accounts` (13.3 KB gz) load
on all seven measured rows. On the chooser — a menu of four product tiles —
those model chunks plus `website-model` total ~161 KB gz (62% of its 261 KB
transfer) and execute 10–18% of their bytes; on `/website/` and `/ecommerce/`,
`commerce-model` executes only 14% and `operating-models` 8%.

> **Corrected 2026-08-20 — WHY they load on the chooser.** This paragraph
> originally attributed the chooser's model chunks to `workspace-runtime.ts`
> statically importing `commerce-workspace.ts` / `production-workspace.ts` /
> `managed-trial.ts` (lines 12/35/56). That attribution is wrong on the chooser,
> and it was self-refuting: `workspace-runtime.ts` never imports
> `website-model`, yet `website-model` was measured loading on the chooser. The
> chooser's real cause is `WorkspaceStatusPanel.tsx` — 48 lines that statically
> import `loadCommerceWorkspace`, `loadProductionWorkspace`,
> `buildOperationalReport` AND `loadWebsiteWorkspace`, to render at most six
> links (`MAX_SHOWN = 6`). `workspace-runtime.ts` is reached through
> `ProductSystemNavigator`, which `CoreShell.tsx` renders only when
> `routeProduct` is non-null — and `routeProduct` is null on `/?choose=1`. The
> per-script transfer log confirms it end to end: no `workspace-runtime-*.js`
> request appears on the chooser at all, while every chunk that does appear is
> either the entry set or reachable from `WorkspaceStatusPanel`. Route-level
> `lazy()` boundaries in `App.tsx` (lines 9–20) are not what leaks here.

## The three worst measured findings

1. **Every surface ships the full model layer; routes are not model-split.**
   330–424 KB gz of JS per cold product route, 261 KB gz even for the
   chooser menu; per-route coverage shows 926–1,508 KB of JS source parsed
   but only 213–370 KB executed (roughly 75–80% unexecuted at settle on
   every row). Implicated chunks: `commerce-model-*.js` (60.1 KB gz, ≤22%
   executed anywhere, 14% on the chooser and Website/Ecommerce) and
   `operating-models-*.js` (50.3 KB gz, 8–12% executed);
   `shop-ledger-accounts-*.js` (13.3 KB gz) executes 7–12% everywhere. On a
   400 kbit/s link the unexecuted freight alone is multiple seconds of
   transfer. (*Corrected 2026-08-20: the clause "both dragged onto every
   surface by `workspace-runtime.ts`'s static imports" was removed. On the
   chooser the carrier is `WorkspaceStatusPanel`, not `workspace-runtime`; on
   the product routes both are live, and which one dominates has not been
   separated.*)

2. **First paint waits ~4 s and arrives after `load` on every route — and
   bytes are not the binding constraint.** Median FCP is 3,940–4,168 ms on
   all seven rows while the HTML itself (4 KB) is on-screen-ready in <1 s of
   network time. The chooser proves bytes are not the constraint: 261 KB gz vs
   the counter's 415 KB gz, identical ~4.05 s FCP.

   > **Corrected 2026-08-20 — the mechanism named here was wrong.** This
   > finding originally blamed "the serial chain of entry chunk then
   > dynamic-import waterfall (each hop paying 400 ms RTT)", with
   > `core-app-*.js` on the first-paint path for `/`, `/shop/*` and `/plant/`.
   > A direct measurement of *script bytes already transferred when FCP fires*
   > (`jsTransferBeforeFcpBytes`, added to the harness 2026-08-20) returns
   > **91.3 KB gz on all seven routes, identically** — exactly the four
   > HTML-discoverable files: the entry chunk, `router`, the react chunk and
   > `preload-helper`. No dynamically imported chunk — not `core-app`, not
   > `commerce-model`, not the route chunks — is on the first-paint path on any
   > route. React renders the shell, suspends the lazy subtrees on a null
   > fallback, and paints; everything else lands afterwards. So FCP is set by
   > one HTML round-trip plus 91 KB gz at 400 kbit/s plus parse/execute under
   > ×6 CPU, and nothing else. There is no waterfall to flatten.

3. **Shop work routes carry the heaviest main-thread boot — on the screens
   a Galaxy user lives in.** `/shop/?tab=orders` has the worst long-task
   totals (2,031 ms across 8 tasks ≥50 ms) and worst ScriptDuration
   (2.27 s); the counter is close behind (1,767 ms; longest single task
   745 ms median, during which the page cannot respond to a tap). The
   chooser, by contrast, blocks for only 819 ms total. Implicated:
   boot-time execution concentrated in `index-Dl7tVyPC.js` (~104 KB of
   233 KB executed) plus `commerce-model-*.js` (50 KB executed) plus
   `core-app-*.js` (35–65 KB executed of 393 KB) under ×6 CPU.

## What to optimize first (ranked, each item cites its number)

1. **Cut the eager-model edge.** Making `commerce-workspace` /
   `production-workspace` imports lazy or per-product removes 110.4 KB gz
   (`commerce-model` 60.1 + `operating-models` 50.3) from surfaces that execute
   ≤22% of it — ~27% of the counter's 415 KB gz JS transfer and 42% of the
   chooser's 261 KB gz, worth ~2.2 s of raw transfer at 400 kbit/s before parse
   savings. It is a dependency-graph change, not a rewrite.

   > **Corrected 2026-08-20.** This item was headed "Cut the
   > `workspace-runtime.ts` eager-model edge". On the chooser that is the wrong
   > file: the carrier is `WorkspaceStatusPanel`, and the 2026-08-20 pass took
   > that half (see the section at the end). Two things also have to be said
   > plainly about the remaining product-route half, because this item as
   > written oversells it: (a) it will not move FCP, since none of these chunks
   > is on the pre-FCP path (finding 2 correction); (b) it is blocked as
   > scoped — `useCommerceWorkspace` calls `loadCommerceWorkspace()`
   > synchronously inside a `useState` initializer
   > (`workspace-runtime.ts:509–512`) and sample seeding runs on that same
   > synchronous path, so the import cannot simply be made lazy. It needs its
   > own planning pass.
2. **Split `core-app-*.js` (100.0 KB gz / 393 KB src).** Only 9% executes on
   the counter and `/plant/`, 17% on the orders tab — the monolithic
   `CoreApp.tsx` carries every tab's UI to paint one tab, and it sits on the
   first-paint path of `/`, `/shop/*`, and `/plant/` (finding 2).
3. **Give `index.html` a real first paint.** FCP trails `load` on all seven
   rows (e.g. `/`: FCP 3,940 ms vs load 3,690 ms). A static app-shell skeleton
   in the 4 KB HTML moves first visual feedback to well under 1 s on this
   profile with no JS changes. With the waterfall theory dead, this and
   shrinking the 91 KB gz entry set are the only identified levers on FCP, and
   this is the highest-value unclaimed item in this document.

   > **Corrected 2026-08-20 — the modulepreload half of this item was wrong,
   > and was measured wrong.** The original text advised
   > `<link rel="modulepreload">` for "the route's known chunk chain" to remove
   > "400 ms per eliminated hop". There is no hop to eliminate (finding 2
   > correction), and a static SPA serves one `index.html` to every route, so
   > any preload it names is paid by every route. Measured, 3 runs, by adding
   > `core-app` (102.8 KB gz — the first dynamic hop for `/`, `/shop/*` and
   > `/plant/`) to the entry preload list: **FCP got 1.5 s worse on every route,
   > including the ones it was meant to help** — measured against the identical
   > build with the preload line removed (3,804 / 3,840 / 3,884 ms in that
   > pairing): `/` → 5,372 ms, `/shop/?tab=counter` → 5,356 ms, `/?choose=1`
   > → 5,396 ms, a +1.5 s regression roughly 15× the control band, and
   > the chooser additionally carried +100.7 KB gz (261.0 → 361.7) it never
   > executes. Cause: the preload shares the 400 kbit/s pipe with the entry set,
   > which is the one thing that does gate first paint, so 102.8 KB gz at
   > 50 KB/s pushes the entry chunk ~2 s later. Do not add speculative
   > `modulepreload` to `index.html` on this profile. A preload only pays when
   > the pipe has headroom the critical path is not using; here it has none.
4. **Break up boot long tasks on the Shop routes.** 2,031 ms (orders) and
   1,767 ms (counter) of ≥50 ms tasks, longest 745–758 ms, block input
   during boot. Worth doing after 1–2, since smaller chunks shrink these
   tasks for free first.

Do not spend effort on: `@supabase/supabase-js` (56 KB gz — verified it never
loads on any measured route), or `client-capability-plan` /
`business-templates` (96–97% executed — they are pulling their weight).

## Limitations — read before comparing against other numbers

- Sandbox x86 CPU ×6-throttled is not a Galaxy A13's cores; absolute
  milliseconds will differ on real hardware. The relative ranking between
  routes and between chunks is the reliable signal.
- Headless Chromium, no touch input, no scroll/interaction measurement —
  this profiles cold navigation only, not tap latency inside the app.
- Local server: 400 ms emulated RTT but zero real network jitter/loss;
  real Myanmar mobile links will be worse and more variable.
- Coverage "executed bytes" is measured at post-load settle; code that runs
  on later interaction counts as unexecuted here. It measures boot cost, not
  dead code.
- 3 runs per route; medians are stable in this run (FCP within ±3% of the
  median; an earlier same-day run of the same build showed up to ±11%) but
  tails are not characterized.
- `/` was measured with cold `localStorage`, so its redirect lands on the
  default product (Shop counter). A returning user whose last product was
  Plant/Website/Ecommerce redirects there instead; those targets are
  covered by their own rows.

## Appendix — per-run raw triples (FCP ms / load ms / long-task total ms)

| Route | run 1 | run 2 | run 3 |
|---|---|---|---|
| `/` | 3940 / 3740 / 1647 | 3848 / 3690 / 1345 | 4040 / 3651 / 1412 |
| `/?choose=1` | 4052 / 3688 / 819 | 4052 / 3678 / 811 | 4092 / 3675 / 936 |
| `/shop/?tab=counter` | 4088 / 3726 / 1767 | 4036 / 3726 / 1800 | 4112 / 3753 / 1683 |
| `/shop/?tab=orders` | 4068 / 3729 / 2031 | 4100 / 3742 / 1911 | 4104 / 3795 / 2033 |
| `/plant/` | 4056 / 3711 / 1358 | 4064 / 3726 / 1280 | 4032 / 3696 / 1531 |
| `/website/` | 4104 / 3763 / 1102 | 4036 / 3702 / 1031 | 4088 / 3716 / 1246 |
| `/ecommerce/` | 4168 / 3749 / 1415 | 4184 / 3756 / 1394 | 4108 / 3746 / 1364 |

---

## 2026-08-20: correction, slice 1, and what actually moves FCP

Date: 2026-08-20. Status: one optimization shipped, one rejected on evidence,
two attributions in the 2026-08-19 document corrected. Same harness, same
throttling profile, same method as above. Every number is a median of 3 cold
loads; `dist/` contained no `sw.js` in every run on this page, matching the
2026-08-19 method note.

### What changed in the harness

One metric was **added** (nothing existing was altered, so the rows above stay
comparable): `jsTransferBeforeFcpBytes` — script bytes already transferred when
first contentful paint fires, read from resource timing, which shares FCP's
navigation-start clock. It exists because `jsTransferBytes` counts to settle and
therefore cannot tell "moved off the critical path" from "never loaded". It
turned out to be the most informative number in this whole document.

### Re-measured before (unchanged code, 2026-08-20)

The 2026-08-19 table was re-measured on this day's `main` (`4a5d406b`) so the
after-numbers compare against the same code, machine and load, not against
yesterday's. Four feature PRs landed in between, and machine noise is real, so
these differ slightly from the table at the top — that gap **is** the noise
floor, and it is the yardstick for reading the deltas below.

| Route | FCP (ms) | load (ms) | JS transfer (KB gz) | **pre-FCP JS (KB gz)** | Long-task total (ms) | Longest task (ms) |
|---|---|---|---|---|---|---|
| `/` | 3,880 | 3,682 | 415.6 | **91.3** | 918 | 440 |
| `/?choose=1` | 3,992 | 3,684 | 260.9 | **91.3** | 676 | 246 |
| `/shop/?tab=counter` | 3,912 | 3,667 | 415.6 | **91.3** | 1,000 | 451 |
| `/shop/?tab=orders` | 3,840 | 3,646 | 425.0 | **91.3** | 1,127 | 447 |
| `/plant/` | 3,908 | 3,649 | 411.5 | **91.3** | 835 | 322 |
| `/website/` | 3,944 | 3,667 | 330.2 | **91.3** | 803 | 294 |
| `/ecommerce/` | 3,936 | 3,661 | 346.1 | **91.3** | 811 | 197 |

**91.3 KB gz on every route, to the tenth of a kilobyte.** That is the entry
chunk + `router` + the react chunk + `preload-helper` — the four files the HTML
names directly. Nothing dynamically imported reaches the screen before the first
pixel does, on any route. This single column invalidates finding 2's stated
mechanism and recommendation 3's preload advice, and it sets the ceiling on what
any lazy-loading work can win: **in this app, deferring a chunk that was already
post-FCP cannot improve FCP.** Scope that claim carefully — it holds here only
because every dynamic import is issued after the entry set has finished
downloading *and* executing, so those requests never contend with it for the
pipe. A request that overlaps the entry set on a 400 kbit/s link absolutely can
push FCP out; the rejected slice 2 below is precisely that counterexample.

### The chooser's 261 KB, attributed correctly

Per-script transfer on `/?choose=1`, from the run log:

| Chunk | KB gz | On the chooser because |
|---|---|---|
| `index-*.js` (entry) | 74.1 | HTML `<script>` |
| `router-*.js` | 13.0 | entry static import, modulepreloaded |
| react chunk + `preload-helper` | 3.9 | entry static imports, modulepreloaded |
| `commerce-model-*.js` | 60.1 | `WorkspaceStatusPanel` → `loadCommerceWorkspace` |
| `operating-models-*.js` | 50.3 | `WorkspaceStatusPanel` → `loadProductionWorkspace` |
| `operating-baseline-*.js` | 26.2 | transitively, same subtree |
| `shop-ledger-accounts-*.js` | 13.3 | transitively, same subtree |
| `website-model-*.js` | 11.2 | `WorkspaceStatusPanel` → `loadWebsiteWorkspace` |
| `WorkspaceStatusPanel-*.js` | 6.8 | the panel itself |
| `website-leads-*.js` | 1.9 | transitively, same subtree |

91.0 KB gz of entry set, 169.9 KB gz (65%) of `WorkspaceStatusPanel` subtree,
and **no `workspace-runtime-*.js` request at all**. `workspace-runtime` is a
real chunk in this build and it is simply not requested here, which is the
cleanest possible disproof of the original attribution.

### Slice 1 (shipped): mount the chooser's attention panel after first paint

`WorkspaceStatusPanel` was already `lazy()`, but it was rendered unconditionally
inside `ProductHomePage`, so its subtree started downloading during the chooser's
first render. It now mounts on `requestIdleCallback`, raced against a 1,200 ms
`setTimeout` so a tab that never reports idle — or a browser without
`requestIdleCallback` — still gets the panel rather than losing it. The wait is
paid once per document: once the panel has mounted, its chunks are in the module
registry, so a later client-side return to the chooser (the mobile Products door
from `/shop/`) renders it immediately — verified at 34 ms after the tiles, versus
391–500 ms on a cold load. The panel itself, its markup and its CSS are untouched.

| Route | FCP before → after (ms) | Δ FCP | JS transfer before → after (KB gz) | pre-FCP JS (KB gz) | Long-task total before → after (ms) | Δ LT | Longest task (ms) |
|---|---|---|---|---|---|---|---|
| **`/?choose=1`** | 3,992 → **3,904** | **−88** | 260.9 → **261.0** | 91.3 → 91.4 | 676 → **612** | **−64** | 246 → 216 |
| `/` *(control)* | 3,880 → 3,792 | −88 | 415.6 → 415.7 | 91.3 → 91.4 | 918 → 917 | −1 | 440 → 459 |
| `/shop/?tab=counter` *(control)* | 3,912 → 3,852 | −60 | 415.6 → 415.7 | 91.3 → 91.4 | 1,000 → 1,015 | +15 | 451 → 456 |
| `/shop/?tab=orders` *(control)* | 3,840 → 3,884 | +44 | 425.0 → 425.1 | 91.3 → 91.4 | 1,127 → 1,243 | +116 | 447 → 465 |
| `/plant/` *(control)* | 3,908 → 3,872 | −36 | 411.5 → 411.7 | 91.3 → 91.4 | 835 → 808 | −27 | 322 → 347 |
| `/website/` *(control)* | 3,944 → 3,876 | −68 | 330.2 → 330.3 | 91.3 → 91.4 | 803 → 722 | −81 | 294 → 201 |
| `/ecommerce/` *(control)* | 3,936 → 3,864 | −72 | 346.1 → 346.3 | 91.3 → 91.4 | 811 → 703 | −108 | 197 → 193 |

The panel renders only on the chooser, so the other six rows are a built-in
control, and their spread is this harness's real resolution limit: FCP
**−88 to +44 ms**, long-task total **−108 to +116 ms**. The chooser's own deltas
(−88 ms FCP, −64 ms long-task) sit inside both bands — **on this harness slice 1
is not distinguishable from noise**, exactly as the pre-FCP column predicts.
Note the control band is wider than the "±3% of median" spread quoted for the
2026-08-19 run: that figure described within-run repeatability, not the
build-to-build band, and the control rows are the honest number to hold new work
to.

**Honest read, against the targets this slice was given:**

| Target | Result | |
|---|---|---|
| chooser JS transfer < 150 KB gz | **261.0 KB gz — missed** | The harness counts transfer to settle. Deferral moves the download; it does not delete it. Only not loading the subtree at all could hit this. |
| chooser FCP < 3,650 ms | **3,904 ms — missed** | Predicted by the pre-FCP column: the panel was never on the pre-FCP path, so taking it out of first render cannot move FCP. The −88 ms delta sits exactly on the control band's edge — not a result. |
| chooser long-task total < 819 ms | **612 ms — nominally met, but not a result** | The same-day before was already 676 ms, so the real delta is −64 ms, inside the control band of −108 to +116 ms. The 819 ms this target was set from was a noisier day's number. This slice cannot be credited with a main-thread win on this evidence. |

Ordering was verified directly on an unthrottled run (`.wsp-panel` first seen at
391–500 ms vs. four product tiles at 73–121 ms and FCP at 116–196 ms, across
mobile/desktop × light/dark), and the panel arrived in all four combinations with
its theme tokens resolved.

So on this harness slice 1 measures as **no result** — nothing it changed clears
the control band. Its value is on the axis the harness does not measure at all: a
visitor who taps a product tile within ~1.2 s now never downloads 169.9 KB gz of
model chunks for a panel they never read — on a metered 400 kbit/s link that is
~3.4 s of pipe handed back to the product they asked for. That is a claim about
real usage, not a measured number, and it is labelled as such.

### Slice 2 (rejected on evidence): `modulepreload` in `index.html`

Measured and rejected — see the correction under recommendation 3 for the
numbers and the mechanism. Summary: +1.5 s FCP on every route measured,
including the two it was intended to help. Not shipped.

### What this leaves for the next pass

1. **A static app-shell skeleton in `index.html`** (recommendation 3, corrected).
   With the waterfall theory dead, this is the only identified lever that can
   move first *visual* feedback, and it needs no JS change.
2. **Shrink the 91.3 KB gz entry set.** It is the entire pre-FCP critical path
   on all seven routes, so it is the only other thing FCP responds to. Nobody
   has looked at what is in it beyond "react, react-dom, App, CoreShell".
3. **The product-route model-split** (recommendation 1, corrected) — worth real
   transfer and parse on `/shop/*` and `/plant/`, will not move FCP, and is
   blocked as scoped on the synchronous `useState` initializer in
   `workspace-runtime.ts:509–512`. Needs its own planning pass.

### Limitations specific to this pass

- `jsTransferBeforeFcpBytes` uses resource timing's `transferSize`, which
  includes response headers; it reads a few hundred bytes per request above the
  CDP `encodedDataLength` totals in the `JS transfer` columns. The two are not
  interchangeable to the byte.
- Same-day re-measure or not, three runs on this harness cannot resolve a change
  smaller than the control band measured in this pass: **−88 to +44 ms FCP** and
  **−108 to +116 ms long-task total**, taken from the six routes the change
  cannot touch. Hold future F2 deltas to those bands, not to the tighter
  within-run ±3% quoted for the 2026-08-19 run. Everything claimed as a result
  above clears that bar or is explicitly called out as not clearing it.
- The layout shift when the panel arrives (`.product-home-note` is pushed down)
  was accepted, not measured — this harness reports no CLS. The panel renders
  `null` whenever nothing needs attention, so reserving its height would trade a
  shift below the last line of the page for a permanent hole on the common case.
  If a CLS budget is ever adopted, revisit that trade rather than assuming it.
