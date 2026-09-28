# SuperMega Shop sales agent guide

Use this guide from a Bionic Code Project or another local coding agent whose working directory is `C:\Users\thesw\Projects\supermega-platform`.

Start a focused session with:

> Read `docs/supermega-shop-sales-agent.md` completely. Operate one private Shop pilot sales workspace. Keep all customer identity private, never infer owner approval, never send a message or accept payment, and verify every transition.

## Safe demo

Run the synthetic lifecycle before using a real event:

```powershell
npm.cmd run client:pilot:workspace:self-test
```

The test uses fictional temporary data and removes its workspaces.

## Real workflow

Initialize a new private directory from one qualified contact event:

```powershell
npm.cmd run client:pilot:workspace -- --init --contact-event "<private-event.json>" --workspace "<new-private-workspace>"
```

Review `owner-input.json` privately. Leave every authority gate false unless the owner explicitly confirms it in the current task. The captured role and baseline come from the canonical sanitized event; do not retype or replace them.

Prepare the digest-bound handoff, reply, and owner-decision template:

```powershell
npm.cmd run client:pilot:workspace -- --prepare --workspace "<private-workspace>"
```

Review `private-handoff.md` and `private-reply.txt` without printing them into chat. In `decision-input.json`, keep both digests unchanged and use exactly one decision: `approve-manual-send`, `revise`, or `decline`. Approval permits only the owner to manually send the exact reviewed draft after independently checking the recipient and terms.

Record and verify the decision:

```powershell
npm.cmd run client:pilot:workspace -- --decide --workspace "<private-workspace>"
npm.cmd run client:pilot:workspace -- --verify --workspace "<private-workspace>"
```

## Day-0 baseline and observed pilot evidence

After the owner has captured the private baseline, commit it through one new atomic baseline-completion directory before any pilot-day recording. The private baseline JSON must use distinct `runId` values across order, package-redemption, and daily-close streams. The completion command validates and verifies all four artifacts before committing the directory; require the sealed receipt digest as `owner_safe_baseline_completion_receipt_digest`. Day-0 readiness must be bound to the current release handoff and GitHub protection snapshot; never treat a stale release gate as pilot-ready.

```powershell
npm.cmd run shop:pilot:baseline-complete -- --input "<private-baseline-input.json>" --output-dir "<private-baseline-completion-directory>"
npm.cmd run shop:pilot:baseline-complete -- --verify-dir "<private-baseline-completion-directory>"
npm.cmd run shop:pilot:intake-packet -- --output "<owner-safe-intake-packet.json>"
npm.cmd run shop:pilot:launch-gate -- --baseline-packet "<private-baseline-completion-directory>/owner-safe-baseline-packet.json" --intake-packet "<owner-safe-intake-packet.json>" --output "<owner-safe-launch-gate-report.json>"
npm.cmd run shop:pilot:launch-gate:verify -- --verify-report "<owner-safe-launch-gate-report.json>"
npm.cmd run shop:pilot:day0-readiness -- --launch-gate-report "<owner-safe-launch-gate-report.json>" --release-handoff "<release-handoff.json>" --github-protection-snapshot "<github-protection-snapshot.json>" --output "<owner-safe-day0-packet.json>" --markdown-output "<owner-safe-day0-packet.md>"
```

Do not hand-edit or manually replace any file in the completion directory, and do not recreate the owner-safe packet with the retired separate lint/generate/verify flow. The launch gate may consume only `<private-baseline-completion-directory>/owner-safe-baseline-packet.json` after `--verify-dir` succeeds and `owner-safe-baseline-completion-receipt.json` remains sealed. On an existing directory, partial output, digest mismatch, or validation failure, stop and preserve the evidence for owner review.

During the five-day private pilot, create and validate one private run input per real observed run before recording it:

```powershell
npm.cmd run client:pilot:observed-evidence:template -- --workspace "<private-observed-workspace>" --output "<private-observed-run-input.json>"
npm.cmd run client:pilot:observed-evidence:validate -- --run-input "<private-observed-run-input.json>"
npm.cmd run client:pilot:observed-evidence -- --record --workspace "<private-observed-workspace>" --run-input "<private-observed-run-input.json>"
npm.cmd run client:pilot:observed-evidence -- --verify --workspace "<private-observed-workspace>"
```

Every counted run requires `evidenceReferenceDigest` for the private evidence receipt and `independentAnchorDigest` for the independently sealed private anchor. If either digest is missing, reused, or equal to the other digest, the run does not count. Promotion evidence still requires 20 consecutive accepted real runs covering pilot days 1 through 5 and at least 5 distinct observed calendar dates; synthetic or sample runs do not close the gate.

Never overwrite existing outputs. On `stage_incomplete`, `stale_or_tampered`, `binding_mismatch`, or another validation error, stop the transition and preserve the files for owner review.

## Reporting boundary

Report only the contract, stage, decision when present, hashes when useful, and the false external-action controls. Never expose the contact name, email, company, goal, owner note, handoff, or reply. This workflow performs no automatic send, customer write, payment, deployment, production activation, or hosted mutation.
