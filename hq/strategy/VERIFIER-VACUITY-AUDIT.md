# Verifier vacuity audit — 2026-08-21

Scope: one defect class across the verifier belt — **a check that appears to pass
while measuring nothing.** It surfaced six times in two days, every time by
accident. This pass went looking for it deliberately.

Rule used throughout: **a finding is only a finding if the mutation that should
break it was actually run and the check went red.** Everything below is labelled
by what was executed, not by what the source reads like.

---

## Confirmed and fixed

### V1 — `prototype_sources_not_linted` pinned a sample, not an inventory

`tools/verify_app_build.mjs` carried

```js
if (!appPackage.scripts?.lint?.includes('src/products')) fail('prototype_sources_not_linted')
```

The reason code claims the app's sources are linted. The predicate only asserts
that the lint script *mentions* one directory. `showroom/src/analytics/` was
never in the lint script and the guard reported green the whole time.

`showroom/src/analytics/metrics-collector.ts` is not dead code: `main.tsx`
imports `startMetricsCollector` from it at app entry, and
`EcommerceProduct.tsx`, `EcommerceBuyingWorkspace.tsx`, `WebsiteProduct.tsx`,
`CoreApp.tsx`, `WorkspaceControlsPage.tsx` and `core/client-error-reporter.ts`
all import from it. It ships in every build. ESLint had never seen it.

**Mutation that proved it.** Appended to `metrics-collector.ts`:

```ts
export function proofOfUnlintedFile(input: any) {
  const neverUsed = input
  return 1
}
```

Two hard errors (`@typescript-eslint/no-explicit-any`,
`@typescript-eslint/no-unused-vars`, confirmed by running `npx eslint
src/analytics` directly: 2 errors, exit 1). With that file in the tree:

- `npm --prefix showroom run lint` → `17 problems (0 errors, 17 warnings)`, exit 0
- `node tools/verify_app_build.mjs` → `"ok": true`

**Fix.** `showroom/package.json` lint script now includes `src/analytics`, and
the verifier check is an inventory rather than a sample: every directory under
`showroom/src` that contains TypeScript, **and every loose `.ts`/`.tsx` file
directly in `showroom/src`**, must be named in the lint script.

Two things the inventory deliberately avoids, because a code review of the first
version found each of them to be the same failure returning by another door:

- It does not use `includes()` on the script text. `src/products` is a *prefix*
  of `src/products-legacy`, so a substring pin survives a rename that drops the
  real directory; and `--ignore-pattern src/analytics` names the path precisely
  in order to skip it, satisfying a substring pin while ESLint ignores the
  directory. Arguments are tokenised and matched exactly, and flags — plus the
  value following `--ignore-pattern` / `--ignore-path` — are not targets.
- It does not look at directories only. A loose `showroom/src/feature-flags.ts`
  imported from `main.tsx` is byte-for-byte the `src/analytics` defect one
  directory level up.

`eslint src` / `eslint .` short-circuits the inventory, since either already
covers every source.

**Negative tests on the fix** (each run, then restored):

| Mutation | Result |
| --- | --- |
| remove `src/analytics` from the lint script again | `prototype_sources_not_linted:src/analytics`, exit 1 |
| add `showroom/src/newlane/thing.ts` | red on the new root, exit 1 |
| rename the target to `src/products-legacy` (prefix trick) | `prototype_sources_not_linted:src/products`, exit 1 |
| narrow to `src/analytics/metrics-collector.ts` | `prototype_sources_not_linted:src/analytics`, exit 1 |
| `--ignore-pattern src/analytics` | `prototype_sources_not_linted:src/analytics`, exit 1 |
| add loose `showroom/src/feature-flags.ts` | `prototype_sources_not_linted:src/feature-flags.ts`, exit 1 |
| replace the enumeration with `eslint src scripts eslint.config.js` | `"ok": true` — no false positive |
| add `showroom/src/assetsdir/data.json` / `showroom/src/data.json` (no TypeScript) | `"ok": true` — no false positive |

`src/analytics` lints clean on main, so the lint baseline stays at 17 warnings.

### V2 — `initial_javascript_budget` was a ceiling with no floor

`tools/verify_app_build.mjs` walks the initial JavaScript graph from the entry
script, sums it, and fails above 300,000 bytes. The same walked set is what
`product_operations_eagerly_loaded_on_home` scans immediately below.

The walk resolves dependencies with a regex over bundler output. If that regex
stops matching — the ordinary consequence of a Rollup/Vite output-format change
— the set silently collapses to the entry chunk alone and **both** checks pass
while measuring almost nothing. The shop-route closure guard 60 lines above
already states the rule this one was missing:

> FLOOR before ceiling. A guard that can only fail upward is one broken regex
> away from passing on an empty set, which has already happened once in this repo.

**Mutation that proved it.** The specifier regex inside
`visitInitialJavascriptAsset` was changed to `\.\/NO-SUCH-PREFIX-([^"']+\.js)`
(simulating output the pattern no longer matches). The measured graph fell from
**4 assets / 294,567 bytes to 1 asset / 249,633 bytes** — 45KB of the real
initial payload invisible — and `node tools/verify_app_build.mjs` still printed
`"ok": true`.

**Fix.** A count floor and a byte floor, documented in place with the raise/lower
contract:

```js
if (initialJavascriptAssets.size < 3) fail(`initial_javascript_graph_implausible:${...}`)
if (initialJavascriptBytes < 260_000) fail(`initial_javascript_budget_implausible:${...}`)
```

**Negative test on the fix.** The identical regex mutation now fails with
`initial_javascript_graph_implausible:1` and
`initial_javascript_budget_implausible:249633`, exit 1. Restored → `"ok": true`.

---

## Confirmed, NOT fixed — needs a chain step (`package.json` is a STOP condition)

### V3 — `tools/verify_supabase_branch_parity.mjs` is executed by nothing

213 lines of verifier plus a 145-line `node:test` suite
(`tools/verify_supabase_branch_parity.test.mjs`), and the evidence file they
validate (`hq/readiness/supabase-branch-parity.json`) sits in the readiness
ledger.

Enumerated: the transitive closure of `package.json`'s `app:verify` (676 scripts
/ 683 executed files), every `.github/workflows/*.yml`, and every import and
spawn reachable from those. Then grepped the whole repo. The complete set of
references to either file is **one line** — the test importing the verifier:

```
tools/verify_supabase_branch_parity.test.mjs:12:} from './verify_supabase_branch_parity.mjs'
```

No script, no workflow, no importer. The branch-parity evidence in the readiness
ledger is therefore unverified by anything that runs.

**Not fixed here, deliberately.** Wiring it in means adding a chain step, which
is a `package.json` edit and a STOP condition for this lane. #515 worked around
exactly this by having an *existing* chain step import the new test — that is the
route to take, and the natural host is the step that already covers Supabase
migration evidence.

**Caveat for whoever picks this up:** the test does not pass in a Linux agent
sandbox as-is. `computeExpectedSurfaceDigest()` replays the reviewed migrations
through PGlite and dies on `extension "uuid-ossp" is not available`. Establish
whether it passes on CI's Node 24 image before wiring it into the gate; if it
does not, that is a second finding, not a reason to weaken the test.

### V4 — four shipped browser scripts and two config files are linted by nothing

`showroom/package.json`'s lint script enumerates paths explicitly. Outside
`src/` and `scripts/`, these are never linted:

- `showroom/public-app/sw.js` — the service worker, shipped to every browser
- `showroom/public-app/sw-register.js` — one of the three files #519 moved out of
  the shell to make the service worker register at all
- `showroom/public-app/theme-restore.js`
- `showroom/public-app/vercel-insights.js`
- `showroom/vite.config.ts`, `showroom/postcss.config.mjs`

V1's inventory does not cover these: it walks `showroom/src` only, and
`eslint.config.js` scopes its rule block to `**/*.{ts,tsx}`, so the four `.js`
files would need a config block of their own before they could be linted at all.
That is a config change with its own review surface, not a one-line fix — hence
reported rather than built. `sw.js` is the one that matters: it is runtime code
on every client and nothing static-analyses it.

---

## Rigorous negatives — enumerated, executed, clean

These are the parts of the hunt that found nothing. That is the result, not a
gap in the search.

| Shape | How it was enumerated | Result |
| --- | --- | --- |
| **Orphaned tests** | Transitive closure of `app:verify` + all 7 workflows + imports/spawns, diffed against all 705 `test_*.mjs` / `*.test.mjs` on disk | 62 apparent orphans; 59 are `kernel/**` covered by `npm --prefix kernel run verify` (`node --test` glob discovery) via `kernel-deploy.yml`, 2 are `tools/test_{connector,crew}_resilience.mjs` run by that same kernel `verify`. **1 real orphan: V3.** |
| **Orphaned Python tests** | `find` for `test_*.py`; `python3 -m unittest discover -s tests -p 'test_*.py'` run and its output read | 632 tests execute, including `tests/telemetry/` (it has `__init__.py`, so discovery recurses). Only `hyper_unicorn/tests/test_system.py` is outside — that tree is recorded in `hq/research/product-rd-2026-07.md` as a historical trace, not live product. Clean. |
| **Guards that no longer catch their defect** | Ran `tools/audit_guard_mutations.mjs` — 53 real source mutations, each executing the guard that should catch it | **52/53 caught.** The one miss is documented in-file as deliberately redundant (the zero/negative subtotal check, also refused downstream). Clean. |
| **Assertions that pass for the wrong reason** | Instrumented all 110 error-swallowing `catch {}` blocks in `verify_app_build.mjs` to record what they actually caught, then ran the verifier | 406 catches, **every one a real domain rejection message** ("Only one amendment request may exist for an Ecommerce order.", "Downtime history for MC-1 starts a second open interval.", …). No `TypeError`, no `is not a function`, no `ReferenceError`. The 13 non-domain catches are the `exists()` helper's ENOENTs, all legitimate absence probes. Clean. |
| **Vacuous `.every()` / `!.some()` over empty arrays** | Monkey-patched `Array.prototype.every`/`some` to record every empty-receiver call site; ran it against `verify_app_build.mjs` and all 653 other chain-executed files | 8 distinct sites, **all correct-by-semantics** (validation predicates over optional-empty lists, `inSpans` with no comments, argv checks). `verify_app_deploy_workflow.mjs:292`'s inline-script `!some()` is the #519 shape and is genuinely empty because the shell has no inline scripts — and it is double-checked by `app_shell_inline_script_blocked_by_content_policy` in `verify_app_build.mjs:519`. Clean. |
| **Assertion helpers that never escalate** | Static scan of every `check`/`assert`/`ensure`/`must` helper definition in `tools/*.mjs` for a throw / non-zero exit / failure-collection path | 0 suspects. Clean. |
| **Guards disabled by syntax** | Grep for `it.skip` / `describe.skip` / `.todo(` / `.only(` / `if (false)` / commented-out `fail(` / `throw` / `process.exit(1)` across `tools/`, `kernel/`, `showroom/src` | 0. The only `if (false)` is a mutation string inside `audit_guard_mutations.mjs`. All byte-budget guards (`artifact_total_backstop`, `shop_route_wire_cost`, `javascript_chunk_budget`, `javascript_headroom_budget`, `account_routes_chunk_budget`, `internal_settings_chunk_budget`) are live, none commented. Clean. |
| **Prose-only assertions (#519 shape)** | Scan for comment lines asserting must/never/always/cannot with no executable check in the following 15 lines, across all `tools/verify_*` and `tools/test_*` | 58 hits triaged; every one is narrative sitting further than 15 lines from its check, or a `NOTE`/rationale block. The original #519 comment at `verify_app_deploy_workflow.mjs:269` now names the check that backs it. Clean. |
| **Order dependencies (#502 shape)** | Read `tools/run_app_verify.mjs`'s scheduler end to end | Fixed and *guarded*: the dist producer is preluded ahead of the pool, and `app_verify_dist_producer_not_ordered_before_pool` throws at scheduling time if a future chain edit reintroduces the race. `--only verify_app_build` is deliberately exempt. Clean. |
| **Silently-skipped runtime blocks** | Checked all 33 `verify*Runtime()` functions in `verify_app_build.mjs` for early returns before their assertions, and their call sites for conditional invocation | All 33 are unconditionally awaited and every one wraps its asserts in `try/catch → fail(...)`, so an import failure is reported rather than skipped. No early returns. Clean. |

### One structural observation, not a defect

39 `*RuntimeChecks` counters in `verify_app_build.mjs` and a `checks` counter in
611 test files are **reported but never asserted against a minimum**. Today this
is harmless: every `assert(...)` call is straight-line source in the file, so the
count cannot silently fall to zero. It is worth knowing that the counters are
telemetry, not guards — if a runtime block ever becomes loop-driven or
conditionally populated, the counter will not notice.
