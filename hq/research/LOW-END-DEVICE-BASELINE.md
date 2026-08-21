# What the app costs on the kind of phone a Myanmar shop owner actually carries

Date: 2026-08-21
Commit measured: `4a55916b` (`origin/main`, the #539 commit itself)
Status: **measurement only.** Nothing was optimised in this pass. Four findings
are recorded at the end as findings, not as fixes.

> **This is a model, not a device.** Every number below came from a desktop
> browser with its CPU deliberately slowed and its network shaped to 400 kbit/s.
> That is a *model* of a low-end Android. It is much better than the unthrottled
> desktop numbers this programme has been quoting all day, and it is **not** a
> substitute for running the app on the founder's sister's tablet. Nothing here
> may be recorded as a device measurement. This programme has already paid for
> that mistake once: a modelled contrast ratio was written down as a measured one
> and propagated for weeks.

## The answer, first

On a modelled low-end Android, **a shop owner's first visit to the till takes
about 4.9 seconds before anything appears on screen.** Every visit after that is
**about 0.6 seconds**, because a service worker now serves the app from the
phone's own storage and touches the network not at all.

**The fix in #539 is worth far more on that phone than its desktop number
suggests, and the throttle multiplier is not 6×.** Rebuilding order
acknowledgements after a sale, on a workspace driven to the 2 MiB storage
ceiling (1,503 orders, 2,099,502 bytes):

| | Desktop (unthrottled) | Modelled low-end Android | Multiplier |
|---|---|---|---|
| **After #539** | 46–48 ms | **0.5–1.3 s** | 11–28× |
| **Before #539** | 85.6 s (measured) | **~20 minutes** (derived) | ~14.6× |

The desktop framing — "50 seconds became 50 milliseconds" — understates what
#539 bought a real shop. On the modelled phone it is the difference between a
till that **pauses for about a second after each sale** and a till that
**cannot take sales at all**.

## What was run, and on what

- **Build**: `npm run app:build` (the root one) at `4a55916b`. Served by the
  measurement script's own local static server with on-the-fly gzip and SPA
  fallback.
- **Tool**: `tools/perf/measure-android-baseline.mjs`, **unmodified**. It already
  accepts `--chromium` / `$CHROMIUM_BIN`, which was all that was needed. No
  change was made to it in this pass or in this branch.
- **Browser**: **Microsoft Edge 151.0.4129.93**, headless, driven over raw CDP.
  **Edge drove the script cleanly.** `Browser.getVersion`,
  `Target.attachToTarget`, `Emulation.setCPUThrottlingRate`,
  `Network.emulateNetworkConditions`, `Emulation.setDeviceMetricsOverride`,
  `Profiler.startPreciseCoverage` and `Performance.getMetrics` all behaved
  exactly as the script expects.
- **Throttling**: CPU ×6 requested; network 400 kbit/s down, 400 ms round-trip;
  viewport 360×800 @3× mobile.

### The requested 6× throttle actually delivers about 8×, and more than that on real work

The acknowledgement bench carries its own control: a tight arithmetic loop timed
at throttle rate 1 and again at rate 6, in the same page, immediately before the
real measurements. It measured **8.19×** in one session and **8.33×** in
another — consistently more than the 6× requested.

On the workload that matters it is worse still and much less stable. The same
acknowledgement rebuild measured **11.3×** slower than unthrottled in one
session and **27.7×** in another. CDP CPU throttling is not a uniform multiplier;
it penalises allocation- and memory-heavy work (walking a 2 MiB object graph)
far more than register-bound arithmetic, and it interacts with garbage
collection state. **This is the single strongest argument in this document
against estimating instead of measuring.** "6× the desktop figure" would have
been wrong by a factor of two to five on the one operation anybody cared about.

### On the engine difference

The script's default Chromium is a 141 build, and the user-agent string it
emulates claims `Chrome/141`. Edge 151 is **ten Chromium majors newer** than the
engine the 2026-08-19 baseline in `hq/strategy/ANDROID-PERFORMANCE-BASELINE.md`
used. The gap is worth stating and does not look material here: the byte
accounting reproduces that run almost exactly (97,742 B of pre-paint JS and
34,183 B of CSS, identical on every route), and cold first paint lands within
roughly 15–20% of it. The user-agent string is only an override sent to the
page; it does not change which engine executed the code. Treat cross-engine
comparisons as indicative, and re-measure on one engine before attributing any
movement to a code change.

## The route baseline

Cold first visit, nothing in any cache, three separate runs per route, medians.

| Route | FCP | DCL | load | JS before paint | CSS | JS executed / shipped | Long tasks | ScriptDuration |
|---|---|---|---|---|---|---|---|---|
| `/` (redirects to the till) | **4,496 ms** | 4,257 ms | 4,261 ms | 97,742 B | 34,183 B | 344 KB / 1,550 KB | 1,284 ms | 1,663 ms |
| `/shop/?tab=counter` | **4,940 ms** | 4,483 ms | 4,489 ms | 97,742 B | 34,183 B | 340 KB / 1,550 KB | 1,477 ms | 1,769 ms |

Repeat visit, service worker warm:

| Route | FCP | load | Bytes off the network |
|---|---|---|---|
| `/` | **536–596 ms** (2 warm runs) | 345–404 ms | **0** |
| `/shop/?tab=counter` | **604–660 ms** (3 warm runs, median 616) | 340–370 ms | **0** |

### Which of these numbers are cold, and how that was checked

Because finding 1 below describes a defect that silently turns cold measurements
into warm ones, this document has to say plainly which side of it every figure
came from. It does.

**No number in the cold table above was taken from a warm run, and this was
verified rather than assumed.** The check is decisive: a service-worker-served
navigation reports **exactly zero** transfer bytes, because those responses never
reach the page target's `Network` domain. A cold navigation cannot report zero —
it has to fetch the document, the CSS and the entry JS. So non-zero transfer is
proof of a cold run.

All six runs behind the cold table reported non-zero transfer:

```
cold-root-1         /                    js= 97,217  css=34,183   COLD
cold-root-2         /                    js= 97,217  css=34,183   COLD
cold-root-3         /                    js=432,113  css=34,183   COLD
cold-shopcounter-1  /shop/?tab=counter   js=432,113  css=34,183   COLD
cold-shopcounter-2  /shop/?tab=counter   js=432,113  css=34,183   COLD
cold-shopcounter-3  /shop/?tab=counter   js=432,113  css=34,183   COLD
```

For contrast, in the shared-profile sweep only the very first navigation of the
whole session reported anything at all (466,296 B); all twenty other runs across
all seven routes reported exactly 0. The workaround held.

Three qualifications, so this is not read as tidier than it is:

- **The warm table is warm on purpose.** Its 0.6 s figures and its "0 bytes off
  the network" column come from that shared-profile sweep. They are labelled
  warm, they are *about* the warm case, and they are the one place in this
  document where the defect's output is the intended measurement.
- **Two cold `/` runs fetched only the entry set** (97,217 B) rather than the
  full closure (432,113 B) inside the measurement window. Both are cold — a warm
  run would read 0 — but they measured less of the route. The 432,113 B closure
  figure used below therefore comes from the four runs that fetched all of it:
  all three `/shop/?tab=counter` runs and `/` run 3.
- **The acknowledgement measurements cannot be affected at all.** That bench
  never loads a route. It evaluates a bundle in `about:blank` with no network
  and no service worker in the picture, so cold-versus-warm does not apply to
  any figure in that section.

### About the "8.5 seconds of transfer" figure

It roughly holds, and it was never the time to first paint. The Shop route's
compressed first-paint closure is about 467 KB; this run measured 432,113 B of
JS plus 34,183 B of CSS — 466,296 B, agreeing with the 467,765 B brotli figure
the build guard records. At 400 kbit/s that whole closure is **9.3 seconds of
pure transfer**, slightly worse than the 8.5 s previously quoted.

But the owner does not wait for the whole closure. Only **97,742 bytes** of JS
sit on the path to first paint, and that number is *identical on every route* —
it is the shared entry set. Everything else streams in behind the first paint.
That is why first paint lands at 4.9 s and not 9.3 s, and it is why shrinking
the route's total closure would not move first paint at all. The 2026-08-19
baseline reached the same conclusion on a different engine; this run reproduces
it independently.

## The measurement that matters: rebuilding acknowledgements after a sale

### How it was measured

`tools/perf/measure-android-baseline.mjs` measures page loads, not in-app
operations, so this needed a separate harness. It is a **scratch script, not
added to the repo** — the tool is deliberately outside every verify chain and
this pass left it that way. It works like the existing
`tools/test_commerce_order_integrity.mjs`: esbuild bundles
`showroom/src/core/commerce-workspace.ts` for the browser, and the bundle is
evaluated in a headless Edge page over CDP.

The workspace is driven to its enforced ceiling **through the real exported
transitions** — `reserveCommerceOrder`, `advanceCommerceOrder`,
`reconcileCommercePayment`, `cancelCommerceOrder`, `receiveCommerceStock` — not
assembled by hand, and `validateCommerceState` is asserted on the result before
anything is timed. The fixture reached **1,503 orders, 1,286 completed, 108
cancelled, 2,099,502 bytes**, closely comparable to the 1,262 orders / 1,081
completed / 2,097,406 bytes #539 recorded.

Fixture construction runs unthrottled — it is setup, not the thing measured.
`Emulation.setCPUThrottlingRate` is then applied and the timed work follows.

The two paths timed are:

- **After #539** — what `CommercePage` does now: one
  `commerceOrderAcknowledgementReader(commerce)` (which validates the workspace
  exactly once), then one document built per row actually rendered. This fixture
  puts **117 rows** on screen (109 needing action, plus one eight-row archive
  page); #539's fixture had 189, because its mix left more orders open.
- **Before #539** — one `commerceOrderAcknowledgement(commerce, orderId)` per
  order in the whole workspace. **No git archaeology was needed**: the exported
  single-order entry point still validates the entire workspace on every call,
  so calling it once per order is byte-for-byte the pre-#539 `CoreApp` memo. This
  is why reconstructing the pre-fix path was cheap and carried no risk of
  measuring a mis-restored version.

### The numbers

| Measurement | Desktop (unthrottled) | Modelled low-end Android (CPU ×6) |
|---|---|---|
| **After #539** — reader + 117 rendered rows | 46.2 / 48.3 ms | **547 ms and 1,282 ms** (two sessions) |
| One `validateCommerceState` of the 2 MiB workspace | 39.3 ms | 399 ms and 691 ms |
| **Before #539** — 1,503 orders, validated each | **85,586 ms** (85.6 s, measured) | **~1,251,000 ms (~20.9 min, derived)** |

Two independent cross-checks land where #539 said they would, which is the
reason to trust the rest: the post-fix desktop figure of **46–48 ms** reproduces
#539's reported 48 / 51 / 59 ms, and one validation at **39.3 ms** reproduces its
reported 31–36 ms.

### How the ~20 minute figure was derived, and why it is not a direct measurement

One throttled pre-#539 run over the full workspace projects to roughly 25
minutes of blocking script, which exceeds the harness's 600-second CDP
evaluation cap — it would have failed rather than reported. So it was measured
on a **100-order subset** instead: 4,102 ms unthrottled against 59,973 ms
throttled, a **14.62×** multiplier for that exact code path. Applying that
measured multiplier to the **directly measured** full-workspace unthrottled
figure of 85,586 ms gives **≈1,251,000 ms, about 20.9 minutes**.

Scaling the subset linearly to 1,503 orders instead gives only 15.0 minutes, and
that is a **floor, not an estimate**: the pre-fix path does an
`orders.find(...)` per order, which is O(n), so the first hundred orders are the
cheapest hundred in the workspace. The 85.6-second full-workspace measurement is
1.39× higher than linear scaling predicts, for exactly this reason.

Treat "about twenty minutes" as an order-of-magnitude figure, not a precise one.
The honest claim is **tens of minutes per sale**, and the conclusion does not
depend on the precision: the till was unusable either way.

## What this means for a shop owner, in plain language

The first time a shop owner opens SuperMega on a cheap Android over a slow
connection, they wait about **five seconds** before the screen shows anything.
That is a long pause with a customer at the counter, but it happens once. After
that the app opens in **about half a second** without touching the network at
all, because the service worker keeps a copy on the phone. For a till opened
each morning and left open all day, the half-second is the real experience.

The important part is what happens after a sale, once the shop has been trading
long enough to fill its storage — roughly 1,400 sales. **Today, each sale
freezes the till for about half a second to a second and a half** on this
modelled phone. That is noticeable and it is usable.

**Before #539 the same sale would have frozen the till for something like twenty
minutes.** Not slow — broken. The shop could not have taken a second customer.
The desktop measurement recorded that as 50 seconds, which sounds like a bad
delay; on the device the shop actually uses, it was the difference between a
working business and a dead one.

The remaining half-to-one-and-a-half seconds after each sale is real and it is
worth knowing about, but it is a pause, not a failure, and this pass did not
touch it.

## What remains unmeasured

None of this should be guessed at in a later document on the strength of this one.

1. **A real device.** No number here came from Android hardware. A throttled
   desktop models CPU speed with a crude and — as measured above — non-uniform
   multiplier. It does not model slow flash storage, memory pressure, thermal
   throttling, a real radio, or Chrome-on-Android's own differences. The
   founder's sister's tablet remains the measurement that would settle this, and
   it has still not been taken.
2. **A stable throttled figure for the acknowledgement path.** Two sessions
   disagreed by 1.7× (547 ms vs 1,282 ms) while their unthrottled figures agreed
   to within 5%. The spread is reported rather than averaged away. More sessions,
   and control of GC state between them, would narrow it.
3. **`/shop/?tab=orders` cold.** The heaviest route, and the one that renders the
   acknowledgement rows this document is about. Its cold run hung past the tool's
   own timeouts and was abandoned; only warm figures exist. See finding 2.
4. **Whether the service worker makes the first visit worse.** Cold first paint
   here (4.5–4.9 s) is slower than the 2026-08-19 pre-service-worker run
   (3.9–4.1 s). Two confounds — a different engine, and a service worker now
   precaching in parallel and competing for the same 400 kbit/s pipe — and this
   run cannot separate them. Open question.
5. **Storage and memory at the ceiling.** Nothing measured what holding a 2 MiB
   workspace costs in memory on a 2 GB phone, or how long it takes to load from
   IndexedDB on slow flash.
6. **Everything else.** Typing into the counter, adding a line, taking payment,
   the daily close, and the Plant, Website and Ecommerce products are all
   unmeasured on a slow CPU.

## Findings (recorded, not fixed)

### Finding 1 — the tool measures one cold load, then measures warm loads forever

`measure-android-baseline.mjs` creates one browser profile per process and reuses
it across every route and run. A service worker has since landed
(`showroom/dist/sw.js` with `sw-register.js`). So the *first* navigation of a
process is cold and every navigation after it is served from the service
worker's Cache Storage — which the page target's `Network` domain never sees.

In a single `--runs 3` invocation across all seven routes, exactly one run — the
very first — reported real bytes:

```
/ run1   fcp=4420  jsXfer=432113  cssXfer=34183
/ run2   fcp=536   jsXfer=0       cssXfer=0
/ run3   fcp=596   jsXfer=0       cssXfer=0
```

Every later run on every route reported `jsTransferBytes=0` and sub-second FCP.
Because the tool reports a **median of three**, the reported median was the
*warm* number and the reported transfer bytes were **zero for six of seven
routes**. Read without checking the per-run detail, that output says the Shop
route downloads no JavaScript and paints in 616 ms.

`Network.setCacheDisabled` does not help: it disables the HTTP cache for the page
session, while the service worker's Cache Storage lives in the shared profile.

**The workaround needed no code change.** Invoking the tool once per measurement
(`--runs 1 --routes "<one route>"`) gives each run a fresh `mkdtemp` profile.
Every cold number in this document was taken that way. The warm numbers are the
median-of-three from the single full invocation — a genuinely useful second
measurement, just not the one the tool claims to be reporting.

Every cold figure in this document was taken that way, and the section
"Which of these numbers are cold, and how that was checked" above records the
per-run evidence that the workaround held. Knowing about this defect is not the
same as being clear of it, so the check is written down rather than asserted.

Not fixed here: this pass was scoped to measure only.

### Finding 2 — a cold `/shop/?tab=orders` run hangs past the tool's own caps

The tool's caps are `LOAD_TIMEOUT_MS` 180 s and `SETTLE_MAX_MS` 45 s, so no
single run should exceed roughly four minutes. A cold `/shop/?tab=orders` run was
still alive after ten minutes and was killed. `evalInPage` (used in the settle
loop) and `Profiler.takePreciseCoverage` are both sent with no timeout, so
neither cap can fire if the browser stops answering — but that was not confirmed
and is recorded as a symptom, not a diagnosis. The route completes normally warm.

### Finding 3 — CDP CPU throttling is not a uniform multiplier

Requesting rate 6 produced 8.19× and 8.33× on arithmetic, and 11.3× and 27.7× on
the acknowledgement rebuild, in the same sessions. Any future document that
converts a desktop number into a device number by multiplying by 6 will be wrong,
possibly by a lot. Measure the operation under throttle; do not scale.

### Finding 4 — a sale at the ceiling still blocks the till for about a second

Post-#539, the acknowledgement rebuild costs 547–1,282 ms of blocking main-thread
work on the modelled phone, of which a single `validateCommerceState` of the
2 MiB workspace is 399–691 ms — the majority. #539 correctly reduced 1,503
validations to one; the one that remains is now the dominant cost of the
operation. Recorded, not acted on.

## Reproducing this

```
npm run app:build

# cold — one invocation per run, so each gets a fresh browser profile
CHROMIUM_BIN="C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" \
  node tools/perf/measure-android-baseline.mjs --runs 1 \
  --routes "/shop/?tab=counter" --out cold-1.json

# warm — one invocation, three runs; run 1 is cold, runs 2-3 are service-worker warm
CHROMIUM_BIN="..." node tools/perf/measure-android-baseline.mjs --runs 3 --out warm.json
```

On Windows, run these from PowerShell rather than Git Bash: Git Bash rewrites a
bare `"/"` route argument into a Windows path and the navigation fails with
`Cannot navigate to invalid URL`.

The acknowledgement bench is a scratch script and is deliberately not in the
repo. Its method is described in full above so it can be rebuilt: bundle
`commerce-workspace.ts` with esbuild for the browser exactly as
`tools/test_commerce_order_integrity.mjs` does, drive the workspace to the
ceiling through the real transitions, apply `Emulation.setCPUThrottlingRate`,
and time the reader path against one `commerceOrderAcknowledgement` per order.
Include the throttle control loop; without it there is no evidence the throttle
was applied at all.
