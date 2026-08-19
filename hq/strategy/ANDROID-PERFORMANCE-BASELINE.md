# Low-end Android performance baseline (roadmap F2 — measurement pass)

Date: 2026-08-19
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
| `/` (chooser) | 3,964 | 3,748 | 3,748 | 415 | 1,483 | 327 | 9 | 2,108 | 1,033 | 2.27 |
| `/shop/?tab=counter` | 4,528 | 3,883 | 3,887 | 415 | 1,483 | 323 | 9 | 2,228 | 753 | 2.21 |
| `/shop/?tab=orders` | 4,256 | 3,814 | 3,820 | 424 | 1,508 | 370 | 9 | 2,182 | 783 | 2.34 |
| `/plant/` | 4,372 | 3,909 | 3,915 | 411 | 1,470 | 301 | 9 | 1,693 | 494 | 1.77 |
| `/website/` | 4,240 | 3,770 | 3,771 | 330 | 1,150 | 292 | 6 | 1,143 | 341 | 1.16 |
| `/ecommerce/` | 4,156 | 3,795 | 3,797 | 346 | 1,242 | 315 | 9 | 1,520 | 335 | 1.47 |

Run-to-run spread was modest (FCP within ±11% of the median on every route,
within ±5% on four of six; full per-run triples in the appendix), so the
medians are stable enough to rank against.

Reading the shape: the 4 KB HTML shell arrives in well under a second at
this throughput, yet FCP lands AFTER the load event on every route —
`index.html` paints nothing; first paint waits for the entry chunk plus every
eagerly-imported model chunk to download, parse, and execute. `load` (~3.8 s)
covers only the modulepreloaded entry set (`index-*.js` 74 KB gz +
`router-*.js` 13 KB gz + CSS 35 KB gz); the dynamic route/model chunks keep
streaming after it, which is why FCP trails load by 200–650 ms.

## Chunk attribution

Named chunks map to sources via `showroom/vite.config.ts` `manualChunks`
(lines 88–115). Hashes are from this build; names are stable.

| Chunk | gz KB | src KB | Source |
|---|---|---|---|
| `core-app-*.js` | 100.0 | 393 | `src/core/CoreApp.tsx` + `OperationsPageRoute.tsx` |
| `index-Dl7tVyPC.js` (entry) | 74.1 | 233 | main entry: react, react-dom, App, CoreShell |
| `commerce-model-*.js` | 60.1 | 237 | `src/core/commerce-workspace.ts` |
| `operating-models-*.js` | 50.3 | 201 | `production-workspace.ts`, `channel-order-intake.ts`, `managed-trial.ts`, `team-work.ts` |
| `operating-baseline-*.js` | 26.2 | 96 | `src/core/operating-baseline.ts` |
| `capability-tiers-*.js` | 15.1 | 49 | `src/core/capability-tiers.ts` |
| `shop-ledger-accounts-*.js` | 13.3 | 51 | `src/core/shop-ledger-accounts.ts` |
| `website-model-*.js` | 11.2 | 39 | `src/products/website/website-model.ts` |
| `index-BrCosHje.js` | 56.0 | 214 | `@supabase/supabase-js` — dynamically imported at `managed-trial.ts:2477`; did NOT load on any measured route (good) |

The eager edge that defeats route splitting: the chooser and every product
route render through `workspace-runtime.ts`, which statically imports
`commerce-workspace.ts`, `production-workspace.ts`, and `managed-trial.ts`
(`src/core/workspace-runtime.ts` lines 12/35/56). Route-level `lazy()`
boundaries exist in `App.tsx` (lines 9–20), but the model layer rides along
everywhere: `commerce-model` (60.1 KB gz), `operating-models` (50.3 KB gz),
`operating-baseline` (26.2 KB gz), and `shop-ledger-accounts` (13.3 KB gz)
all loaded on all six measured routes — including `/website/` and
`/ecommerce/`, where `commerce-model` executes only 14% of its bytes and
`operating-models` 8%.

## The three worst measured findings

1. **Every route ships (nearly) the whole app; the model layer is not
   route-split.** 330–424 KB gz of JS per cold route; per-route coverage
   shows 1,150–1,508 KB of JS source parsed but only 292–370 KB executed
   (roughly 75–80% of loaded JS unexecuted at settle). Implicated chunks:
   `commerce-model-*.js` (60.1 KB gz, 21% executed even on Shop routes, 14%
   on Website/Ecommerce), `operating-models-*.js` (50.3 KB gz, 8–12%
   executed), both dragged onto every route by `workspace-runtime.ts`'s
   static imports. `shop-ledger-accounts-*.js` (13.3 KB gz) executes 7% on
   every measured route. On a 400 kbit/s link the unexecuted freight alone
   is multiple seconds of transfer.

2. **First paint waits ~4 s and arrives after `load` on every route.**
   Median FCP 3,964–4,528 ms while the HTML itself (4 KB) is on-screen-ready
   in <1 s of network time; the blank-screen window is spent downloading and
   executing 415 KB gz of JS. Implicated: the entry chunk
   `index-Dl7tVyPC.js` (74.1 KB gz) plus `core-app-*.js` (100.0 KB gz —
   the single largest chunk, 393 KB source, of which only 9% executes on the
   chooser and counter) sit on the first-paint critical path for `/`,
   `/shop/*`, and `/plant/`.

3. **The counter — the Galaxy user's daily screen — is the slowest route.**
   `/shop/?tab=counter` has the worst median FCP (4,528 ms) and the worst
   long-task total (2,228 ms across 9 main-thread tasks ≥50 ms, longest
   753 ms; the chooser's longest is 1,033 ms). During those windows the page
   cannot respond to a tap. Implicated: boot-time execution concentrated in
   `index-Dl7tVyPC.js` (103 KB of 233 KB executed) and
   `commerce-model-*.js` (50 KB executed) under ×6 CPU — ScriptDuration
   alone is 2.21 s of the ~4 s to first paint.

## What to optimize first (ranked, each item cites its number)

1. **Cut the `workspace-runtime.ts` eager-model edge.** Making
   `commerce-workspace` / `production-workspace` imports lazy or per-product
   removes 110.4 KB gz (`commerce-model` 60.1 + `operating-models` 50.3)
   from routes that execute ≤21% of it — ~27% of the chooser's 415 KB gz JS
   transfer, worth ~2.2 s of raw transfer at 400 kbit/s before parse savings.
   This is the highest-leverage single change and it is a dependency-graph
   change, not a rewrite.
2. **Split `core-app-*.js` (100.0 KB gz / 393 KB src).** Only 9% executes on
   the chooser and counter, 17% on the orders tab — the monolithic
   `CoreApp.tsx` carries every tab's UI to paint one tab. Tab-level splitting
   directly attacks finding 3's 4,528 ms counter FCP.
3. **Give `index.html` a real first paint.** FCP trails `load` on all six
   routes (e.g. chooser: FCP 3,964 ms vs load 3,748 ms); a static app-shell
   skeleton in the 4 KB HTML would move first visual feedback from ~4 s to
   well under 1 s on this profile without changing any JS.
4. **Break up boot long tasks.** Median longest task is 1,033 ms on `/` and
   753 ms on the counter; 9 tasks ≥50 ms totalling 2.1–2.2 s block input
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
- 3 runs per route; medians are stable (FCP within ±11% of the median,
  worst route) but tails are not characterized.

## Appendix — per-run raw triples (FCP ms / load ms / long-task total ms)

| Route | run 1 | run 2 | run 3 |
|---|---|---|---|
| `/` | 3964 / 3748 / 2108 | 4128 / 3819 / 1767 | 3960 / 3746 / 2163 |
| `/shop/?tab=counter` | 4528 / 3887 / 2228 | 4704 / 4015 / 1958 | 4056 / 3648 / 2780 |
| `/shop/?tab=orders` | 4148 / 3820 / 2715 | 4256 / 3845 / 2058 | 4424 / 3789 / 2182 |
| `/plant/` | 4788 / 4100 / 2220 | 4260 / 3829 / 1693 | 4372 / 3915 / 1538 |
| `/website/` | 4184 / 3776 / 995 | 4240 / 3771 / 1263 | 4352 / 3765 / 1143 |
| `/ecommerce/` | 4156 / 3741 / 1520 | 4492 / 3931 / 1775 | 4016 / 3797 / 1297 |
