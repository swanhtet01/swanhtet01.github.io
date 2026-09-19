# Design critique receipt v1

This local contract binds an independent visual review to one already validated
`supermega.app-entry-rendered.v2` proof. It closes the gap between deterministic
browser checks and human visual acceptance. It is not a Vercel preview,
production acceptance, customer proof, revenue proof, or release approval.

## Preconditions

- Use the exact clean worktree and unchanged build that produced the rendered
  proof.
- Validate the rendered report first with
  `tools/validate_app_entry_rendered_report.mjs`.
- The implementer and reviewer must use different role labels.
- `independenceAttested` is an accountable reviewer assertion, not
  cryptographic proof of a person's identity.
- The reviewer must manually inspect every screenshot returned by the rendered
  report validator. Digests prove file integrity, not that a person looked.
- Use synthetic privacy-safe evidence only. Do not include names, contacts,
  credentials, customer records, private paths, or raw private evidence.
- Version 1 accepts only the exact public reference root
  `https://github.com/nexu-io/open-design` (an optional trailing slash is
  canonicalized away). Any different host, subpath, query, fragment, or
  encoded path is rejected; adding another reference requires a reviewed
  contract change.

The current rendered-proof scopes map to these critique products:

| Rendered scope | Required product |
| --- | --- |
| `shop-counter` | `shop` |
| `ecommerce-claim` | `ecommerce` |
| `full` | `portfolio` |

## Prepare the review input

Keep the review input outside the final receipt directory. Copy the exact
screenshot file names and digests from the successful rendered validation.
The five dimensions and their order are fixed. Each evidence object must name
one inspected screenshot plus privacy-safe UI-element and finding slugs.
Free-form evidence prose is rejected.

```json
{
  "contract": "supermega.design-critique-review-input.v1",
  "reviewedAt": "2026-08-29T00:00:00.000Z",
  "product": "shop",
  "userRole": "cashier",
  "firstJob": "sell_from_trade_specific_counter",
  "visualDirection": "task_first_truthful_local_operation",
  "reference": {
    "url": "https://github.com/nexu-io/open-design",
    "accessedOn": "2026-08-29",
    "principle": "repository_owned_contract_and_evidence_backed_critique"
  },
  "implementerRole": "senior_engineer",
  "reviewerRole": "risk_reviewer",
  "independenceAttested": true,
  "manualVisualInspection": true,
  "inspectedScreenshots": [
    {
      "file": "shop-counter-mini-mart-desktop-1280x900.png",
      "digest": "sha256:REPLACE_WITH_EXACT_VALIDATED_DIGEST"
    },
    {
      "file": "shop-counter-mini-mart-mobile-390x844.png",
      "digest": "sha256:REPLACE_WITH_EXACT_VALIDATED_DIGEST"
    }
  ],
  "dimensions": [
    {
      "id": "job_clarity",
      "score": 3,
      "evidence": {
        "screenshot": "shop-counter-mini-mart-desktop-1280x900.png",
        "element": "trade_identity_and_sell_job",
        "finding": "primary_operator_job_is_obvious"
      }
    },
    {
      "id": "truth_and_safety",
      "score": 3,
      "evidence": {
        "screenshot": "shop-counter-mini-mart-desktop-1280x900.png",
        "element": "local_payment_and_review_boundary",
        "finding": "consequential_effect_is_explicit"
      }
    },
    {
      "id": "completion_hierarchy",
      "score": 3,
      "evidence": {
        "screenshot": "shop-counter-mini-mart-desktop-1280x900.png",
        "element": "item_total_and_review_action",
        "finding": "complete_sale_path_is_coherent"
      }
    },
    {
      "id": "mobile_and_access",
      "score": 3,
      "evidence": {
        "screenshot": "shop-counter-mini-mart-mobile-390x844.png",
        "element": "mobile_checkout",
        "finding": "complete_without_horizontal_overflow"
      }
    },
    {
      "id": "system_coherence",
      "score": 3,
      "evidence": {
        "screenshot": "shop-counter-mini-mart-mobile-390x844.png",
        "element": "shop_counter_surface",
        "finding": "shared_tokens_preserve_shop_job"
      }
    }
  ],
  "keep": [
    "trade_specific_identity",
    "complete_sale_path"
  ],
  "fix": [],
  "verdict": "accept"
}
```

Every score must be an integer from 3 through 4. A lower score or a non-accept
verdict is a failed critique and must not produce an acceptance receipt.

## Generate once

Create a new empty directory for the output. The generator refuses an occupied
directory and writes the receipt with exclusive-create semantics.

```powershell
$expectedHead = git rev-parse HEAD
$evidenceDir = 'C:\reviewed\supermega-app-entry-proof'
$reviewPath = 'C:\reviewed\supermega-design-review\review.json'
$receiptDir = 'C:\reviewed\supermega-design-critique-receipt'

New-Item -ItemType Directory -Path $receiptDir -ErrorAction Stop | Out-Null

npm.cmd run design:critique:generate -- `
  --review $reviewPath `
  --report "$evidenceDir\report.json" `
  --expected-head $expectedHead `
  --expected-scope shop-counter `
  --out "$receiptDir\receipt.json"
```

The generator independently reruns the rendered-report disk validator before
writing. It binds the clean commit and tree, report file/body digests, built
artifact digest, renderer and validator digests, scope, and every required
screenshot.

## Validate from disk

```powershell
npm.cmd run design:critique:verify -- `
  --receipt "$receiptDir\receipt.json" `
  --report "$evidenceDir\report.json" `
  --expected-head $expectedHead `
  --expected-scope shop-counter
```

The validator reruns the rendered-proof consumer and rejects any changed source,
build, report, screenshot, review, score, role separation, gate, control, or
receipt digest.

## Developer verification

Run the focused receipt suite, the underlying rendered-proof suite, and the
repository tool-syntax guard serially:

```powershell
npm.cmd run design:critique:preflight
```

## Release boundary

A successful result is `supermega.design-critique-validation.v1` with
`readyForSourceReview: true`, `exactPreviewAccepted: false`, and
`releaseAuthorized: false`. It never authorizes a PR, merge, deployment,
database write, customer contact, payment, stock movement, domain change, or
managed activation. Those gates remain separate.
