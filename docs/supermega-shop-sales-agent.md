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

Never overwrite existing outputs. On `stage_incomplete`, `stale_or_tampered`, `binding_mismatch`, or another validation error, stop the transition and preserve the files for owner review.

## Reporting boundary

Report only the contract, stage, decision when present, hashes when useful, and the false external-action controls. Never expose the contact name, email, company, goal, owner note, handoff, or reply. This workflow performs no automatic send, customer write, payment, deployment, production activation, or hosted mutation.
