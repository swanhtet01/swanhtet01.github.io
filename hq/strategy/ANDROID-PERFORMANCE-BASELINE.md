# Low-end Android performance baseline (roadmap F2 — measurement pass)

Date: 2026-08-19 (revised same day: the original "chooser" row actually
measured the default-entry redirect — see the route-semantics note in Method)

> **2026-08-20 corrections — read this before acting on anything below.** Three
> claims in this document turned out to be wrong, and all three were load-bearing
> for the ranked recommendations:
>
> 1. The model chunks on the chooser were blamed on `workspace-runtime.ts`'s
>    static imports. The cause is `WorkspaceStatusPanel`.
> 2. First paint was blamed on a serial dynamic-import waterfall. There is no
>    waterfall on the first-paint path: pre-FCP JS is the 91.3 KB gz entry set on
>    every route, identically.
> 3. The chooser's 261 KB was framed as mostly unexecuted freight. ~150 KB of it
>    is shared with the product routes and is already downloaded when the visitor
>    taps through; withholding it costs the destination ~931 ms.
>
> Each is corrected in place below and marked. The evidence, an optimization pass
> that was **measured and withdrawn**, and a second one **measured and rejected**,
> are in
> **[2026-08-20: corrections, two rejected optimizations, and what actually moves FCP](#2026-08-20-corrections-two-rejected-optimizations-and-what-actually-moves-fcp)**
> at the end.

Status (2026-08-19): measurement only. No optimization was performed in this pass; the
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
- **[STALE as of 2026-08-30 — see "the instrument was measuring its own cache"
  at the foot of this document. This premise died when G3 shipped a real
  service worker, and every run of the harness between then and 2026-08-30
  reported medians that were roughly 10x optimistic. The numbers in the table
  below predate that and are sound; a re-run before the fix would not be.]**
  The build's `dist/` contains no `sw.js`, so the service-worker registration
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
   transfer.

   > **Corrected 2026-08-20, twice.** (a) The clause "both dragged onto every
   > surface by `workspace-runtime.ts`'s static imports" was removed: on the
   > chooser the carrier is `WorkspaceStatusPanel`, not `workspace-runtime`; on
   > the product routes both are live and which dominates has not been
   > separated. (b) More importantly, **"unexecuted freight" is the wrong frame
   > for the chooser row.** Of its 261 KB gz, ~150 KB is shared with the product
   > routes and is already downloaded when the visitor taps through — measured,
   > withholding it costs the destination route ~931 ms. Only 20.1 KB is
   > genuinely chooser-only. See
   > [the withdrawn slice 1](#slice-1-implemented-measured-withdrawn-defer-the-choosers-attention-panel)
   > and the section after it. The freight framing still holds on the product
   > routes, where the model layer really is loaded and mostly not executed.

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
   > file: the carrier is `WorkspaceStatusPanel`. That half was attempted on
   > 2026-08-20 and **withdrawn after measurement** — deferring it made the
   > chooser's tap-through ~931 ms slower, because ~150 KB of what it loads is
   > shared with the product route the visitor is heading to (see the section at
   > the end). Two things also have to be said plainly about the remaining
   > product-route half, because this item as written oversells it: (a) it will not move FCP, since none of these chunks
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

## 2026-08-20: corrections, two rejected optimizations, and what actually moves FCP

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

### Slice 1 (implemented, measured, WITHDRAWN): defer the chooser's attention panel

The plan was to stop `WorkspaceStatusPanel` from mounting during the chooser's
first render, so its ~170 KB gz subtree would not sit on the critical path. It
was built, reviewed, measured three ways, and then **withdrawn — the measurements
disproved its premise.** No app code from this slice ships. The reasoning is
recorded here because the disproof is a reusable fact about this codebase, not
because the change was interesting.

**Step 1 — cold-load numbers: no effect, as the pre-FCP column predicted.**
Deferring the mount left FCP and settle-transfer unchanged. Chooser deltas
(−88 ms FCP, −64 ms long-task) sat inside the control band established by the six
routes the change cannot touch (FCP −88 to +44 ms, long-task −108 to +116 ms).
Not a result — the panel was never on the pre-FCP path, so taking it off first
render could not move first paint.

**Step 2 — the deferral was not deferring.** A PR review (Codex, PR #494) caught
that `requestIdleCallback(show, { timeout: 1200 })` treats 1,200 ms as a *maximum*
wait, not a minimum delay. Measured on the throttled profile, this is exactly what
happens: the main thread goes idle the instant the tiles paint — nothing else is
runnable, everything is waiting on a 400 kbit/s pipe — so the callback fired a
median of **56 ms after FCP** (36–59 ms across three runs) and the graph then held
the pipe from 3,888 ms to 7,965 ms. Rebuilding it as a genuine minimum (grace
`setTimeout` first, then `requestIdleCallback` with its own 400 ms ceiling) moved
the graph's first request to **FCP+1,212 ms**, confirming both the diagnosis and
the fix.

**Step 3 — the interaction measurement, which killed the slice.** The claimed
benefit was that an early tapper would stop paying for a panel they never read.
Measured directly: load the chooser, tap the Shop tile 1,000 ms after FCP, and
time how long the Shop route takes to become usable. Three runs per variant,
same throttling.

| Variant | panel requests started before the tap | Shop usable after tap | `core-app` downloaded after tap |
|---|---|---|---|
| **No deferral** (what `main` already does) | 7 | **6,964 ms** | **6,404 ms** |
| Deferred, as first shipped (fires at FCP+56 ms) | 7 | 7,145 ms | 6,530 ms |
| Deferred, genuine minimum (fires at FCP+1,212 ms) | 0 | **7,895 ms** | 7,317 ms |

**Deferring made the early tap monotonically worse — by 931 ms once the deferral
actually worked.** The reason is a dependency fact nobody had checked: of the
170.3 KB gz the chooser pulls for the panel, only **20.1 KB is panel-exclusive**
(`WorkspaceStatusPanel` 6.8 + `website-model` 11.3 + `website-leads` 2.0). The
other ~150 KB — `commerce-model`, `operating-models`, `operating-baseline`,
`shop-ledger-accounts` — is **shared with the product routes**, which load it
through `workspace-runtime.ts` the moment the visitor picks Shop or Plant. So on
the chooser those bytes are not waste being spent on a panel; they are a
head start on wherever the visitor is about to go. Withholding them delays the
destination.

The gap is well outside noise: run-to-run spread within each variant is ~±180 ms
against a 931 ms separation, and the ordering is identical in all nine runs.

**Withdrawn.** The slice does not improve FCP, does not reduce transfer, and
costs 181–931 ms on the tap that most chooser visitors actually perform. It also
added a module-scope mutable flag and a pop-in. `main` is already the better
behaviour. What survives from the attempt is the harness metric, this section,
and the correction to finding 1 below.

### Consequence: "unexecuted freight" is the wrong frame for the chooser

Finding 1 above counts 75–80% of each route's JS as unexecuted at settle and
calls it freight. For the chooser specifically that reading is now measured to be
wrong. Its 261 KB gz breaks down as 91.0 KB entry set + 20.1 KB panel-exclusive +
~150 KB shared with whichever product the visitor opens next. Since the chooser
exists to send people to a product, that ~150 KB is prefetch, and the early-tap
table above shows removing it costs the destination roughly a second. "Executed
on this route" is simply the wrong success metric for a menu screen; "already
downloaded when the next screen needs it" is the right one.

This does not rehabilitate the 20.1 KB that is genuinely chooser-only, nor the
model layer's cost on the product routes themselves, where it really is loaded
and mostly not executed. It does mean **the chooser is the wrong place to hunt
for savings**, and any future attempt to trim it must measure the tap-through
path, not the chooser in isolation.

### Slice 2 (implemented, measured, REJECTED): `modulepreload` in `index.html`

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
4. **Do not re-attempt chooser trimming without measuring tap-through.** Two
   optimizations were built and measured off this baseline in one day and both
   were reverted; the common cause was optimizing a number (chooser transfer,
   preload hops) instead of a journey. Any future F2 change should be measured
   on the path a visitor actually walks — cold load *and* the tap that follows —
   using `probe`-style instrumentation like the early-tap harness described
   above, not on a single route in isolation.

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
- The early-tap numbers use a synthetic tap at a fixed 1,000 ms after FCP,
  fired from inside the page. Real visitors tap at a spread of delays, and a
  visitor who takes longer than the panel needs to load sees none of this cost.
  The 1,000 ms figure was chosen as a plausible fast tap on a screen with four
  options; the ordering between the three variants held across every run, but
  the size of the gap is specific to that tap time.
- Nothing here measures CLS, tap latency, or scrolling. `jsTransferBytes`
  counts to settle, so it cannot by itself distinguish "moved off the critical
  path" from "never loaded" — that is what `jsTransferBeforeFcpBytes` was added
  for, and the early-tap probe covers the interaction axis neither of them sees.

---

## 2026-08-30: the instrument was measuring its own cache, and the app shell landed

Two findings, one of which invalidates a slice of this document's own future.

### 1. The harness was reporting ~10x optimistic medians

`Network.setCacheDisabled` disables the HTTP cache and nothing else. It does
not touch a service worker's Cache Storage. This document's methodology note
said runs were clean because "`dist/` contains no `sw.js`" — true when it was
written, and false the moment G3 shipped a real service worker. From then on,
run 1 of each route registered the worker and precached 35 files (1.98 MB),
and every run after it was served entirely out of Cache Storage.

Measured on `/`, three runs, before the fix:

| Run | FCP (ms) | load (ms) | JS transfer (B) |
|---|---|---|---|
| 1 (cold) | 4,440 | 4,215 | 99,209 |
| 2 | 400 | 243 | **0** |
| 3 | 392 | 230 | **0** |
| **reported median** | **400** | **243** | **0** |

A median of 400 ms for a route that actually takes 4,440 ms cold. The zero
transfer bytes are the tell, and they were being reported in the output all
along.

Fixed in `tools/perf/measure-android-baseline.mjs` by clearing the origin's
storage (`Storage.clearDataForOrigin`, `storageTypes: 'all'`) per run, which
restores the cold navigation the script claims to measure. Post-fix control on
the same unmodified build: `/` FCP 4,400 ms / load 4,207 ms, `/?choose=1` FCP
4,516 ms / load 4,249 ms — consistent run to run, and back in line with the
original table.

**How to tell whether a given number was affected — and the good news for this
document.** The pollution has a specific signature: because the median of three
runs lands on one of the two warm runs, a polluted median is *sub-second* and
carries *zero* JS transfer bytes. It does not look like a slightly-optimistic
cold number; it looks like a 400 ms one.

G3 landed 2026-08-20 (`677b61e1`, merged as #519 on 2026-08-21), so everything
recorded here on or after that date was at risk. Checked every measured figure
in this document against the signature: none of them show it. The 2026-08-20
corrections section quotes 3,804 / 3,840 / 3,884 ms controls and a 5,372 ms
modulepreload result; the tap-through probe quotes ~931 ms. All cold-range.
**So the recorded numbers stand, including the two rejected optimizations and
the prohibitions that rest on them — do not discard them on account of this
bug.** What was at risk was any *future* run, and the fix lands before one.

If you find a sub-second median with zero transfer bytes anywhere, that row is
a cache hit and must be re-run.

### 2. Recommendation 3 (static app-shell skeleton) — SHIPPED, and it works

`showroom/index.html` now carries a boot shell: inline critical CSS plus a few
skeleton blocks, retired by `#root:not(:empty)+#boot-shell{display:none}` the
instant React commits. No JS — `script-src 'self'` refuses inline script, and
`verify_app_build.mjs` enforces that separately, so the removal had to be pure
CSS. The CSS is inline rather than in `core-app.css` because pointing at the
stylesheet would make first paint wait on the very fetch that is the problem.

Measured cold, 3 runs each, same build, same profile, before and after:

| Route | FCP before | FCP after | Δ | load before | load after |
|---|---|---|---|---|---|
| `/` | 4,400 ms | **3,280 ms** | **−1,120 ms (−25.5%)** | 4,207 ms | 4,247 ms |
| `/?choose=1` | 4,516 ms | **3,244 ms** | **−1,272 ms (−28.2%)** | 4,249 ms | 4,228 ms |

Load is flat, so the win is not bought from somewhere else, and long-task
totals are unchanged (`/`: 956 → 962 ms; chooser: 503 → 476 ms).

**This item's own prediction was wrong, and by a lot.** It said a skeleton
"moves first visual feedback to well under 1 s on this profile". It does not:
FCP is 3.2 s, not sub-second. The reason is that a render-blocking
`<script src="/theme-restore.js">` and a 35 KB stylesheet still sit between the
document and first paint, and on a 400 ms RTT / 50 KB/s pipe those cost roughly
two seconds before the skeleton is allowed to draw. A −1.1 s improvement for
~1 KB of HTML is a good trade, but do not carry "under 1 s" forward as
achievable without also moving those two blockers — and note that
`theme-restore.js` cannot simply be deferred, because it exists to prevent a
dark-theme user seeing a light flash.

Dark theme verified rather than assumed: with
`supermega-interface-theme=dark` in localStorage and CPU throttled x20, the
shell sampled at t=428 ms reads `background: rgb(5, 8, 13)` with
`#root.children.length === 0` — genuinely pre-mount, and dark on the first
frame. No light flash.

### Known regression this introduced: a failed boot now looks like a slow one

Measured, not theorised. Serving the app with every `/assets/*.js` returning
503 and waiting 10 s: `#boot-shell` is still `display: flex` with "SUPERMEGA"
on screen and `#root.children.length === 0`. **The skeleton stays forever, with
nothing indicating anything is wrong.**

Before this change that same failure produced a blank white page. Blank reads
as broken and prompts a reload; a skeleton reads as *loading*, and this
product's users are on connections that genuinely do take many seconds, so they
are conditioned to wait rather than retry. In the success case the shell is a
clear win; in the failure case it is a mild regression, and pretending
otherwise would be dishonest about a change made in the name of perceived speed.

Scope, stated accurately: a returning device with the service worker installed
is served the precached bundle (35 files) and does not hit this. It bites on a
**first** visit, before any worker exists, when an asset fetch fails — which is
also the worst case to mishandle, because it is a first impression.

**Proposed mitigation, not yet built: a pure-CSS stall message.** A
zero-duration animation with a long `animation-delay` on a hidden element
reveals a line after ~20 s with no JS, so it survives `script-src 'self'` and
needs no mount hook — the same constraint the removal rule already works
within. It is deliberately NOT in this change because the revealed line is
customer-facing copy, and `DESIGN-PROGRAM.md` P3.8 requires founder sign-off on
customer-facing sentences (there is live precedent: P3.8 batch 1 is built and
held in a draft PR for exactly that). Shipping the mechanism is an hour;
shipping the sentence is a decision.

### SHIPPED: the stylesheet no longer blocks first paint

**FCP 3,236 -> 1,484 ms. −1,752 ms, −54%.** Measured 2026-08-30 on the fixed
harness, 3 cold runs per arm, both arms built from the same commit WITH the boot
shell present.

The mechanism is the boot shell's own trick applied one level up. `index.html`
carries a render-blocking `<link rel="stylesheet">` to a **230,018-byte** file.
The boot shell's CSS is fully inline, so it needs none of it to paint — but the
render-blocking link stalls first paint anyway. The variant replaces that link
with a small external script that injects it:

```js
var l = document.createElement('link')
l.rel = 'stylesheet'
l.href = document.currentScript.getAttribute('data-href')
document.head.appendChild(l)
```

External, not inline, for the same reason as `/theme-restore.js`: `script-src`
is `'self'` with no hash. This is the existing three-shell-script pattern, not a
new one.

**The end state is verified identical**, which is what rules out "it is only
fast because the page is broken": control and variant both finish with 2
stylesheets, **1,813 CSS rules**, the same `Geist, Inter, ui-sans-serif` stack,
the same `rgb(246, 244, 238)` body background and the same mounted tree.

Stacked on the boot shell, that is **4,400 -> 1,484 ms from the original
baseline: −2,916 ms, a 66% reduction.**

**Why this is recorded as a lead and not shipped.** Three things are genuinely
open, and one of them is a warning about this document's own method:

1. **FOUC: MEASURED CLEAN.** A `requestAnimationFrame` probe keyed on the
   stylesheet's own presence in `document.styleSheets` (not on a guessed
   colour) gives, on the async variant: stylesheet live at **3,498 ms**, boot
   shell retired and React mounted at **4,353 ms** — **855 ms of margin**, and
   **zero** frames with content mounted and no stylesheet. The control shows
   the same ordering (3,230 / 4,289). The change does not introduce a flash.

   Recorded because it nearly went the other way: my FIRST probe watched for a
   background colour, used the wrong sentinel, and reported that the stylesheet
   never applied at all and that the app rendered unstyled for 92 samples. Both
   false. A broken *check* is indistinguishable from a broken *feature*, and a
   −1.7 s win was one bad assertion away from being discarded. Key the probe on
   the thing itself, not on a proxy for it.
2. **THE BLOCKER, and it is not obvious: this change would blind a size guard.**
   `verify_app_build.mjs:20734` builds the Shop first-paint closure by regexing
   the built document for stylesheet links:
   `matchAll(/<link[^>]+rel="stylesheet"[^>]+href="\/([^"]+)"/g)`. Replace that
   link with a `<script src="/css-async.js" data-href="...">` and
   `documentStyles` is EMPTY — the 230,018-byte stylesheet silently leaves the
   closure, the measured 457,284 br q3 collapses to roughly 180,000, and the
   guard that rations Shop's first paint stops seeing the largest thing in it.
   That is exactly the failure mode this file already documents at ~20780
   ("a walk that stops resolving specifiers makes both pass while seeing only
   the entry chunk"), and shipping it would trade a real perf win for a blind
   ratchet. **Any implementation MUST teach the closure walk to follow
   `data-href` in the same commit, and re-measure the closure to confirm the
   stylesheet is still counted.** The floor check will catch it if you forget —
   but only if the floor is not lowered to accommodate the drop, which is the
   tempting wrong move.
3. Still open: `css-async.js` must be generated by
   `tools/write_app_release_metadata.mjs` like the other three shell scripts
   (it writes to `public-app/`, pre-build), the rewrite itself belongs in a
   Vite `transformIndexHtml` plugin beside the existing `localHealthPlugin`
   (`showroom/vite.config.ts` is not digest-bound), the offline precache list
   grows from 35 files, and `404.html`/the public shell need deciding on
   separately — `rootPageSource` is checked for the three shell scripts today.

**Shipped on the real build**, not the throwaway variant: FCP median **1,492 ms**
(runs 1,472 / 1,492 / 1,492), FOUC clean with the stylesheet live at 3,524 ms
against a 4,359 ms mount — **835 ms of margin, zero unstyled frames**. Gate
652/652, lint 0 errors.

**A SECOND asset walk had to be taught the same shape, and the local gate does
not cover it.** `tools/verify_app_release_live.mjs` builds its release-asset
corpus from the root document the same way, in two places. CI failed on
`missing_current_release_asset:launcher:#0b745e` — the brand accent lives only
in the stylesheet, so with the `<link>` gone the CSS never entered the corpus
and every value checked from it stopped being checked. Same blindness as the
closure walk, in a file the 652-step gate never runs: **`run_app_verify.mjs` is
NOT a superset of CI**, and this is the counter-example. Both walks now match
`data-href`, both were mutation-tested against CI's exact error, and the live
walk throws `live_release_found_no_stylesheet` if it ever finds none.

The closure guard was taught the new shape in the same commit, and the fix was
verified by breaking it: with the `data-href` branch removed the build fails
`shop_route_closure_found_no_stylesheet` rather than passing blind. The closure
now measures **458,562 br q3 across 25 assets** (was 457,284 across 24 — the new
shell script is the 25th), so the 230KB stylesheet is demonstrably still inside
it. Had it dropped out, that number would have collapsed to roughly 180,000.

### Remaining identified FCP levers

1. **Shrink the 91 KB gz entry set.** Needs its own planning pass.
2. **The 35 KB render-blocking stylesheet.**
3. **`/theme-restore.js` — a 253-byte file costing a whole round trip.** Worth
   naming precisely because there is an obvious-looking fix that is a trap.
   The file is tiny, so its ~400 ms cost on this profile is almost entirely
   latency, and inlining it would remove that from the critical path. **Do not
   simply inline it.** `script-src 'self'` has no `'unsafe-inline'`, so an
   inline block is silently REFUSED — that exact failure is why the service
   worker never registered for months (G3), and `verify_app_build.mjs` now
   fails the build on any inline `<script>` in the shell specifically to keep
   it from recurring. Making this work would mean adding a `'sha256-...'`
   source to the policy in BOTH `index.html`'s meta and `vercel.json`, keeping
   the hash in lockstep with the script body, and deliberately relaxing a
   guard whose comment explains why it exists. That is a security-surface
   change, not a perf tweak, and it needs its own pass with that framing —
   the payoff is roughly 400 ms, which is real but does not justify doing it
   carelessly.

