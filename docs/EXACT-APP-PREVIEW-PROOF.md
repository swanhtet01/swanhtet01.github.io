# Exact app preview proof v1

`supermega.exact-app-preview-rendered.v1` is the technical browser proof for
one exact Vercel preview commit. It joins the existing GET-only post-deploy
operations receipt to a fresh, ephemeral browser run across Public, Shop,
Plant, Website, and Ecommerce at desktop and 390 x 844 mobile sizes. The
target preview commit and the clean verifier commit are bound separately, so
an accepted proof tool can inspect a sealed candidate without changing it.

It does not deploy, promote, roll back, create a pull request, write provider
state, contact a customer, capture payment, move stock, or activate managed
persistence. It deliberately reports `exactPreviewAccepted:false` and
`releaseAuthorized:false`; an independent person must still inspect all twelve
screenshots and record the separate release decision.

Keep these screenshots internal. They contain synthetic product/customer
fixtures and are technical review evidence, not approved marketing imagery.

## Preconditions

- Run the tool from the exact clean verifier commit supplied as
  `--verifier-head`. The verifier tree must remain unchanged for the run.
- Supply the exact target preview commit as `--expected-commit`. It must equal
  the commit bound by the operations receipt and may differ from the verifier
  commit.
- First collect a passing `supermega.post-deploy-operations-receipt.v2` for
  the paired Public and app previews. That receipt must bind release identity,
  isolated-demo health, all four app-route security headers, camera access,
  app and Public Web Analytics/Speed Insights delivery readiness, a zero-error
  runtime window, and the paired prior rollback commit. Preview source or
  script delivery is not provider-observed telemetry evidence; production
  visibility remains a separate owner-attested gate.
- Both origins must be non-production `*.vercel.app` deployments. The tool
  rejects `supermega.dev`, `app.supermega.dev`, and the stable Vercel production
  aliases.
- Put the evidence directory outside the verifier checkout. The verifier must
  stay clean while it rereads its Git HEAD/tree and the exact verifier and
  browser-harness bytes before accepting or generating evidence.
- Do not supply a Vercel bypass token, browser session, credential, or
  production URL. The browser profile is newly created and deleted per run,
  and every matrix case runs in a separate ephemeral browser context so local
  state cannot leak from one viewport or product proof into another.
- Use a new empty evidence directory. The report and screenshots are written
  exclusively and never overwrite prior evidence.

## Exact rendered matrix

The order is fixed and duplicates, omissions, extra cases, changed viewports,
changed routes, or renamed screenshots fail closed.

| Surface | Desktop | Mobile | Required technical boundary |
| --- | --- | --- | --- |
| Public | 1280 x 900 | 390 x 844 | Product entry is visible |
| Shop Counter | 1280 x 900 | 390 x 844 | Exact `/shop/?template=mini-mart` checkout, payment, total, open-order choice, and review action are above fold |
| Shop Profit Control | 1280 x 900 | 390 x 844 | Exact `/shop/?tab=today` renders the untouched source-owned fresh Shop seed as `attention` / `3 open`, led by `payment_pending` (`Reconcile pending payments`) with its exact payment-review action and target, objective closure, and read-only boundary |
| Plant | 1280 x 900 | 390 x 844 | Working-sample timeline is explicitly not today's production |
| Website | 1280 x 900 | 390 x 844 | Local working sample visibly says nothing was deployed |
| Ecommerce | 1280 x 900 | 390 x 844 | Completed sample request remains visibly browser-local, with no managed Shop receipt claim |

Every case also requires meaningful content, the exact route and query set, no horizontal
overflow, no framework/runtime error or console/log warning, no mutating browser
request, and one exclusive PNG screenshot. Both Shop flows retain their
accessibility and mobile target checks. The Ecommerce path retains its reload/local-persistence and claim
boundary checks from the existing rendered browser harness. After all product
interactions, each case rereads `location.origin`, pathname, search, and hash
immediately before and after screenshot capture. Both reads must be stable and
match the receipt-bound origin and exact route with an empty hash. A late
cross-origin redirect therefore fails even when its destination serves a
plausible route.

The Shop Profit Control cases do not edit browser storage. Each fresh isolated
context follows the product's source-owned Commerce seed path, whose first
priority is `payment_pending`: `Review payments` links to
`/shop/?tab=orders#shop-order-queue`, and the card closes only when every pending
payment has reviewed external evidence or an explicit unpaid state.

## Generate

```powershell
npm.cmd run app:preview:rendered:verify -- `
  --expected-commit <40_HEX_TARGET_PREVIEW_COMMIT> `
  --verifier-head <40_HEX_CLEAN_VERIFIER_COMMIT> `
  --operations-receipt <ABSOLUTE_POST_DEPLOY_RECEIPT_JSON> `
  --screenshot-dir <NEW_EMPTY_ABSOLUTE_EVIDENCE_DIRECTORY> `
  --out <ABSOLUTE_EVIDENCE_DIRECTORY\exact-preview.json>
```

The operations receipt supplies both preview origins. There is intentionally
no free-form origin flag, so the rendered proof cannot silently diverge from
the already validated release/health/header/rollback evidence. Immediately
before and after the twelve browser cases, the tool performs fresh GET-only,
manual-redirect `/__release.json` probes on both origins and requires the
exact target commit and expected service identity. A redirect or alias commit
change fails closed.

## Validate later without opening a browser

```powershell
npm.cmd run app:preview:rendered:verify -- `
  --verify <ABSOLUTE_EVIDENCE_DIRECTORY\exact-preview.json> `
  --expected-commit <40_HEX_TARGET_PREVIEW_COMMIT> `
  --verifier-head <40_HEX_CLEAN_VERIFIER_COMMIT> `
  --operations-receipt <ABSOLUTE_POST_DEPLOY_RECEIPT_JSON>
```

Validation rechecks the exact operations packet and file digests, target
commit, clean verifier source tree, verifier and browser-harness digests,
ordered case matrix, viewport/route/screenshot identities, derived gates,
authority boundary, and compact report digest. It reopens every PNG beside
the report, rejects symlinks or missing/duplicate images, checks the PNG
signature, and recomputes exact bytes and SHA-256 digests. The source and tool
checks are not accepted from the report alone: validation inspects the current
checkout, requires its clean HEAD/tree to equal `--verifier-head`, and rereads
both tool files to recompute their byte counts and SHA-256 digests.

## Remaining human gate

The report proves a bounded technical browser run; its digests are integrity
metadata, not identity or proof that a person inspected the images. A reviewer
must visually inspect all twelve PNG files, including both Shop Counter and
Shop Profit Control at desktop and mobile sizes, for clipping, hierarchy, truthful
claims, and the intended product job. Only a separately reviewed acceptance
artifact may advance the exact-preview gate. Production release still requires
its own owner action afterward.
