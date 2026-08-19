# Low-end Android performance baseline (roadmap F2 — measurement pass)

Date: 2026-08-19 (revised same day: the original "chooser" row actually
measured the default-entry redirect — see the route-semantics note in Method)
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

The eager edge that defeats route splitting: every measured surface —
including the chooser — renders through `workspace-runtime.ts`, which
statically imports `commerce-workspace.ts`, `production-workspace.ts`, and
`managed-trial.ts` (`src/core/workspace-runtime.ts` lines 12/35/56).
Route-level `lazy()` boundaries exist in `App.tsx` (lines 9–20), but the
model layer rides along everywhere: `commerce-model` (60.1 KB gz),
`operating-models` (50.3 KB gz), `operating-baseline` (26.2 KB gz), and
`shop-ledger-accounts` (13.3 KB gz) all loaded on all seven measured rows.
On the chooser — a menu of four product tiles — those model chunks plus
`website-model` total ~161 KB gz (62% of its 261 KB transfer) and execute
10–18% of their bytes; on `/website/` and `/ecommerce/`, `commerce-model`
executes only 14% and `operating-models` 8%.

## The three worst measured findings

1. **Every surface ships the full model layer; routes are not model-split.**
   330–424 KB gz of JS per cold product route, 261 KB gz even for the
   chooser menu; per-route coverage shows 926–1,508 KB of JS source parsed
   but only 213–370 KB executed (roughly 75–80% unexecuted at settle on
   every row). Implicated chunks: `commerce-model-*.js` (60.1 KB gz, ≤22%
   executed anywhere, 14% on the chooser and Website/Ecommerce) and
   `operating-models-*.js` (50.3 KB gz, 8–12% executed), both dragged onto
   every surface by `workspace-runtime.ts`'s static imports;
   `shop-ledger-accounts-*.js` (13.3 KB gz) executes 7–12% everywhere. On a
   400 kbit/s link the unexecuted freight alone is multiple seconds of
   transfer.

2. **First paint waits ~4 s and arrives after `load` on every route — and
   bytes are not the binding constraint.** Median FCP is 3,940–4,168 ms on
   all seven rows while the HTML itself (4 KB) is on-screen-ready in <1 s of
   network time. The chooser proves the mechanism: 261 KB gz vs the
   counter's 415 KB gz, identical ~4.05 s FCP — the cost is the serial
   chain of entry chunk (`index-Dl7tVyPC.js`, 74.1 KB gz) then
   dynamic-import waterfall (each hop paying 400 ms RTT) then parse/execute
   under ×6 CPU, with `core-app-*.js` (100.0 KB gz, the largest chunk, 9%
   executed on the counter) on that path for `/`, `/shop/*`, and `/plant/`.

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

1. **Cut the `workspace-runtime.ts` eager-model edge.** Making
   `commerce-workspace` / `production-workspace` imports lazy or per-product
   removes 110.4 KB gz (`commerce-model` 60.1 + `operating-models` 50.3)
   from surfaces that execute ≤22% of it — ~27% of the counter's 415 KB gz
   JS transfer and 42% of the chooser's 261 KB gz, worth ~2.2 s of raw
   transfer at 400 kbit/s before parse savings. Highest-leverage single
   change, and it is a dependency-graph change, not a rewrite.
2. **Split `core-app-*.js` (100.0 KB gz / 393 KB src).** Only 9% executes on
   the counter and `/plant/`, 17% on the orders tab — the monolithic
   `CoreApp.tsx` carries every tab's UI to paint one tab, and it sits on the
   first-paint path of `/`, `/shop/*`, and `/plant/` (finding 2).
3. **Give `index.html` a real first paint and flatten the import
   waterfall.** FCP trails `load` on all seven rows (e.g. `/`: FCP 3,940 ms
   vs load 3,690 ms), and the chooser's same-FCP-at-37%-less-JS datum shows
   serial RTT hops + parse, not bytes, set the floor. A static app-shell
   skeleton in the 4 KB HTML moves first visual feedback to well under 1 s
   on this profile with no JS changes; `<link rel="modulepreload">` for the
   route's known chunk chain removes 400 ms per eliminated hop.
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
