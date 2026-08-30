# Managed template provisioning: does a company account get its trade's catalog?

**Verdict: no — a signed-in managed account never receives a trade template's catalog, because Shop
onboarding writes the template into browser-local storage and the managed Shop reads its state from
the server, which the provisioner never contacts.**

Both prior agents were half right, and neither half was the answer. The provisioner *is* called
unconditionally for a managed account (the refutation was correct about that), and it does *not*
refuse — it reports `installed` and succeeds. But it succeeds against `window.localStorage`, a store
the managed Shop does not read. The company workspace stays at version 0 and renders its
"Not provisioned" boundary. The refusal the first agent found is real, but it is a different
refusal that only fires in a case the real flow never reaches.

The good news buried in this: the empty managed workspace is not an accident. There is a deliberate,
designed managed onboarding path — a "Create the real catalog" form that takes the first real
inventory item — carrying the explicit copy *"No browser demo orders, customers, or stock records
are copied into this workspace."* So a paying customer does not land in a blank screen with no
recourse. What they land in is a *different* setup flow than the one the trade picker just promised
them.

## The question

When a signed-in (managed) company account runs Shop onboarding and picks a trade template, does it
actually get that trade's catalog, or does it land in an empty workspace? Two prior audits
disagreed and neither executed anything. Every trading day in the recent ten-trade audit ran in the
browser-local sample lane, so the managed path was genuinely unproven.

## Method

Clean worktree at `research/managed-template-provisioning` off `origin/main` (ten templates present,
confirming the dirty Codex clone's eight-template `commerce-workspace.ts` was not in play). The
relevant modules were bundled with esbuild into a scratchpad and the real exported functions driven
under Node against constructed base states, with a fake `localStorage`, a pass-through
`navigator.locks`, and — for the decisive run — a spy on `fetch`.

Nothing was executed against a live account. No managed signup was attempted.

## What was traced

`ProductOnboardingPage.tsx:225-229` calls the commerce provisioner with no identity check at all:

```
const schedule = provisionLocalShopIndustryPack(selectedShopIndustryPack.id)
const disposition = selectedBusinessTemplate
  ? await provisionLocalShopBusinessTemplateSample(selectedBusinessTemplate.id)
  : await provisionLocalShopWorkingSample(schedule.industryPackId, onboardingTemplate.id)
```

The asymmetry that gives the game away is twenty lines below, at line 245, where the *ecommerce*
branch does consult identity: `if (product === 'ecommerce' && !managedIdentity)`. `managedIdentity`
is in scope in this component (line 93). The commerce branch simply never asks.

`provisionLocalShopBusinessTemplateSample` (`product-onboarding-runtime.ts`) reaches storage through
`loadCommerceWorkspace()` and `mutateCommerceWorkspace()` called with no storage argument. Both
default to `browserStorage()`, which is `globalThis.localStorage`, under the key
`supermega.commerce.workspace.v2`. There is no managed variant of either function.

Meanwhile the managed Shop reads from somewhere else entirely. `useCommerceWorkspace`
(`workspace-runtime.ts:706`) loads `loadManagedBootstrap(managedIdentity)` and passes the result to
`managedCommerceView`, whose version-0 branch is the empty state in question:

```
return { state: createEmptyCommerce(), mode: 'managed-unprovisioned', workspaceId, version: 0,
         error: 'This company account has no Shop catalog yet.', writeReady: false }
```

Managed writes go out over `saveManagedCommerceCommand` → `authorizedRequest('/api/trial/v1/commands')`
— an HTTP call. That is the only route into server-authoritative state, and the provisioner has no
path to it.

## What was executed and observed

**The guard, in isolation.** `installCommerceWorkingSampleCatalog` run directly against each base:

```
MANAGED base = createEmptyCommerce()
  threw: no   returned: null (REFUSED)
LOCAL base = createSeedCommerce()
  threw: no   returned: state with 6 items (INSTALLED)
```

The first agent's guard is genuine. It is these three lines (`commerce-workspace.ts:6471-6473`):

```
const seedAnchor = commerceSeedAnchor(base)
if (seedAnchor === null) return null
if (JSON.stringify(base) !== JSON.stringify(createSeedCommerce(seedAnchor))) return null
```

`commerceSeedAnchor` looks for a catalog baseline whose `proof.actionId` is
`'ACT-DEMO-CATALOG-BASELINE'`. An empty state has no baselines, so the anchor is `null` and the
function refuses on the first of the three lines. The base must be byte-identical to the demo seed.

**The full provisioner, both lanes.** Against a store pre-loaded with `createEmptyCommerce()`:

```
threw: no
returned disposition: preserved
items in store after: 0   orders: 0
```

Against a fresh empty store, where `loadCommerceWorkspace()` first seeds the demo seed as it does on
every real page load:

```
loadCommerceWorkspace() on empty storage -> source='seed', items=5
threw: no
returned disposition: installed
items after: 20   orders: 7   movements: 27
commerceWorkingSampleCatalogId after: "mini-mart"
sample order ids: ["SETUP-SAMPLE-MINI-MART-SALE-1", "SETUP-SAMPLE-MINI-MART-SALE-2",
                   "SETUP-SAMPLE-MINI-MART-SALE-3", "SETUP-SAMPLE-MINI-MART-ORDER"]
```

So it neither throws nor refuses in the real flow — it installs, cleanly, into the wrong store.

**The decisive run.** A fresh store, a `fetch` spy, and every storage key recorded:

```
disposition: installed
fetch calls during provisioning: 0 []
storage keys WRITTEN: ["supermega.commerce.workspace.v2"]
local items after: 21   local orders after: 7
```

Zero network calls. One browser-local key. The managed server workspace cannot have been touched,
so it remains at version 0 and `managedCommerceView` returns `managed-unprovisioned`.

This is the whole finding. Onboarding reports success, navigates the owner into Shop, and Shop —
being managed — renders the boundary panel instead of the catalog that was just "installed."

## Follow-up 1: does the sample activity reach managed accounts?

No, and neither does the catalog, so the known day-one activity bug is not exposed to managed
customers at all. Two independent reasons, both executed:

`installCommerceWorkingSampleActivity` refuses an empty base on its own account
(`commerce-workspace.ts:6513`): `if (commerceWorkingSampleCatalogId(source) !== sampleId) return null`.
Run directly, `commerceWorkingSampleCatalogId(createEmptyCommerce())` is `null`, never `'mini-mart'`,
and the call returns `null (REFUSED)`. The activity is gated on the catalog having landed first,
which on a managed base it never does.

And more simply: the provisioning run makes no network call whatsoever, so nothing — catalog or
activity — reaches the server. Managed customers are insulated from the activity bug by the same
defect that denies them the catalog.

## Follow-up 2: the smallest correct fix

It is not a one-liner, and it is larger than it looks, so nothing was changed here.

The obvious-seeming fix — hand the template state to the managed `commerce.workspace.initialized`
command — does not work, because the server's contract for that event
(`supermega_runtime/commerce_runtime.py:10567`) requires a non-empty catalog **and no operating
history at all**:

```
if (not next_state["items"] or next_state["orders"] or next_state["movements"]
    or next_state["closes"] or ... ):
    raise TrialValidationError("Commerce initialization requires a non-empty catalog and no operating history.")
```

Applying that predicate to real states, executed:

```
seed-only state          -> false (orders: 3 movements: 3)
CoreApp single-item init -> true
One sample item installed produces: 1 opening movement(s), kind = opening
```

Every catalog row `installCommerceWorkingSampleCatalog` writes carries an `opening` stock movement,
one per item, because that is how opening stock is evidenced. A template catalog therefore always
has a non-empty `movements` array and can *never* satisfy the server predicate. The sample activity
adds three or four orders on top, which the predicate also forbids.

So the smallest correct fix is a real feature, roughly:

1. Derive an items-plus-`catalogBaselines` state from the template with **no** movements and **no**
   orders, and send that as the single `commerce.workspace.initialized` command. The server accepts
   N items — it is not limited to the one item `CoreApp.initializeManagedCatalog` sends today — so
   the whole price list can land in one command.
2. Establish opening stock afterwards, per item, through the events that exist for it
   (`commerce.stock.counted` or `commerce.inventory.initialized`), each carrying its own evidence.
3. Decide deliberately whether managed accounts get the sample *activity* at all. My recommendation
   is that they should not: a paying customer's ledger should not open with three fictional sales in
   it, and the "no browser demo orders are copied into this workspace" promise on the existing
   boundary panel is the right instinct.

Is it safe given server-authoritative state? Yes, provided it goes through the existing command
rail rather than around it. The version/expected-version handshake, the idempotent-replay
reconciliation, and the server-side transition validation all stay in force, and step 1 is a strict
widening of a path the product already ships. The unsafe version of this fix is any attempt to push
browser-local state up wholesale — that is precisely what the server contract is written to refuse,
and it should keep refusing.

**A smaller, honest interim fix** worth considering separately: make the commerce branch of
`ProductOnboardingPage.startGuidedWorkspace` consult `managedIdentity` the way the ecommerce branch
already does, so a signed-in owner is not told a catalog was installed when the workspace they are
about to open will not have one. That removes the false success without pretending to solve
provisioning. It is still not a one-liner — it needs a notice the owner can act on, pointing at the
managed "Create the real catalog" path — so it was left for a decision rather than applied here.

## Follow-up 3: does it vary across the ten templates?

It is uniform. All ten were run against both base states:

| template | managed base | items | local base | items | sample orders |
|---|---|---|---|---|---|
| mini-mart | preserved | 0 | installed | 20 | 4 |
| pharmacy | preserved | 0 | installed | 20 | 3 |
| phone-electronics | preserved | 0 | installed | 20 | 4 |
| fashion | preserved | 0 | installed | 19 | 3 |
| hardware | preserved | 0 | installed | 20 | 4 |
| tea-coffee | preserved | 0 | installed | 19 | 4 |
| auto-parts | preserved | 0 | installed | 20 | 3 |
| restaurant | preserved | 0 | installed | 20 | 4 |
| beauty-spa | preserved | 0 | installed | 21 | 4 |
| bakery | preserved | 0 | installed | 19 | 4 |

Every template installs in the local lane and every template installs nothing in the managed lane.
The counts differ only because the templates carry different numbers of products and sample sales.
There is no trade-specific behaviour here, which is expected: the divergence is in which *store* is
written, and that is decided well above the template.

Worth noting for the founder's first customer specifically: `beauty-spa` behaves exactly like the
other nine. The spa pilot's outcome depends entirely on which tier it runs on, not on the template.

## What could not be settled without a live account

Only one thing, and it does not change the verdict. I could not observe a real server response to a
real `loadManagedBootstrap` for a newly provisioned company, so the claim "a fresh managed workspace
arrives at version 0" rests on the client contract (`managedCommerceView`, which treats version 0 as
unprovisioned and throws if version 0 arrives carrying state) and on the server's own initialization
guard refusing to run twice. Both point the same way. To close it fully, the founder would need to
sign in to an actual company account and read the Shop screen: seeing the "Create the real catalog"
panel after completing trade onboarding confirms this report end to end. That takes one minute and
requires no code.
