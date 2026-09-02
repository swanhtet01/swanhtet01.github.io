# App entry rendered proof v2

This gate records a browser-rendered local build and then verifies the saved evidence from disk. It is a candidate-integrity check, not a deployment, exact Vercel preview, customer pilot, production, revenue, or managed-persistence claim.

## Generate one exact proof

Start from the reviewed clean commit. Use a new evidence directory that does not already contain files. Do not use real customer names, phone numbers, credentials, or private business records in screenshots.

```powershell
$expectedHead = git rev-parse HEAD
$evidenceDir = 'C:\reviewed\supermega-app-entry-proof'
$priorVercelCommit = $env:VERCEL_GIT_COMMIT_SHA

try {
  $env:VERCEL_GIT_COMMIT_SHA = $expectedHead
  npm.cmd run app:build
} finally {
  if ($null -eq $priorVercelCommit) {
    Remove-Item Env:VERCEL_GIT_COMMIT_SHA -ErrorAction SilentlyContinue
  } else {
    $env:VERCEL_GIT_COMMIT_SHA = $priorVercelCommit
  }
}
npm.cmd run app:entry:rendered:verify -- --out "$evidenceDir\report.json" --screenshot-dir "$evidenceDir" --expected-head $expectedHead
```

The required generation arguments are:

- `--out`: the new JSON report path inside the evidence directory.
- `--screenshot-dir`: the same new evidence directory.
- `--expected-head`: the exact reviewed 40-character commit.
- One optional bounded scope: `--shop-only` or `--ecommerce-claim-only`. Omit both only for the full route set. Supplying both fails closed.

The process-local `VERCEL_GIT_COMMIT_SHA` makes the local release metadata name the exact reviewed commit; the `finally` block restores the caller's environment. Without that exact stamp, the disk consumer rejects the build. The bare npm alias intentionally fails without the paths and expected commit. The renderer also fails if the Git tree is dirty, the build is missing, the evidence directory is not empty, the source changes during the run, or a browser case fails.

Full scope preserves five nonvisual launcher/query/redirect checks and writes this exact ordered visual matrix:

| Surface | Desktop | Mobile |
| --- | --- | --- |
| App launcher | `app-launcher-desktop-1280x900.png` | `app-launcher-mobile-390x844.png` |
| Shop | `shop-counter-mini-mart-desktop-1280x900.png` | `shop-counter-mini-mart-mobile-390x844.png` |
| Plant | `plant-working-sample-desktop-1280x900.png` | `plant-working-sample-mobile-390x844.png` |
| Website | `website-working-sample-desktop-1280x900.png` | `website-working-sample-mobile-390x844.png` |
| Ecommerce | `ecommerce-local-request-desktop-1280x900.png` | `ecommerce-local-request-mobile-390x844.png` |

Desktop is exactly `1280x900`; mobile is exactly `390x844`. The launcher and every product case require meaningful route text, exact final path, an empty hash, the requested viewport, zero horizontal overflow, zero runtime errors, and zero mutating requests. Shop keeps its checkout/layout/accessibility checks and Ecommerce keeps its browser-local request boundary checks.

## Validate the saved report

Run the disk consumer in the same clean worktree, on the same commit and unchanged build used to generate the report:

```powershell
npm.cmd run app:entry:rendered:report:verify -- --report "$evidenceDir\report.json" --expected-head $expectedHead --expected-scope full
```

`--expected-scope` must be exactly `full`, `shop-counter`, or `ecommerce-claim`. The consumer returns `supermega.app-entry-rendered-validation.v1` only after it independently checks:

- the report-body digest and successful case/runtime state;
- exact clean Git commit and tree plus matching built release metadata;
- verifier bytes and the sorted complete `showroom/dist` manifest;
- every declared screenshot's path, byte count, and digest;
- the exact ordered full-scope case, route, viewport, and ten-screenshot matrix;
- measured viewport and horizontal-overflow evidence plus zero mutating requests for every case;
- no path escape or symlink in the bound source and evidence paths;
- Shop layout/accessibility evidence in both `full` and `shop-counter` scopes;
- the browser-local receipt boundary, absent managed-Shop claims, local persistence, zero mutating requests, and no horizontal overflow in both `full` and `ecommerce-claim` scopes.

Any source, build, verifier, report, or screenshot change invalidates the result. Rebuild and generate a fresh proof rather than editing an evidence packet.

## Release boundary

Keep screenshots with person-shaped or phone-shaped fixtures internal. A green local proof does not satisfy the release no-go for the exact commit-bound Vercel preview. The reviewed preview must separately prove all four product routes and the Ecommerce local-only wording before any owner-approved promotion.
