# SuperMega release reconciliation

Evidence captured: 2026-07-25  
Mode: read-only external audit plus local documentation  
Repository: `swanhtet01/swanhtet01.github.io`  
Integration branch: `agent/supermega-release-candidate`

## Release decision

The canonical release pair is:

1. `supermega.dev` from the Vercel project `supermega-public`.
2. `app.supermega.dev` from the Vercel project `megaos`.

Both canonical domains currently serve GitHub `main` checkpoint `6885c3201d523d42d176c3dcd91de28dc1e17f6f`. The validated local product work is not live.

Do not deploy the similarly named Vercel projects `supermega-platform` or `swanhtet01.github.io`. Their latest observed production build was the older, unrelated `3d1d9e3` checkpoint. Do not use `supermega-demo` as the product app.

## GitHub evidence

- Pull request: [#258 - Simplify SuperMega products and harden managed delivery](https://github.com/swanhtet01/swanhtet01.github.io/pull/258)
- State: open draft; base `main`; head `agent/supermega-release-candidate`; GitHub reported it mergeable.
- Live `main`: `6885c3201d523d42d176c3dcd91de28dc1e17f6f`.
- Live pull-request head: `338b6fd11bc27da9b7aa42bee2c293a5c0e3a9ef`.
- Audited implementation checkpoint: `49b4e0e79461adb744b151314396ed1b8a2a06c3`.
- GitHub's live comparison of `main` to the remote pull-request head is 46 commits ahead and 0 behind.
- Fast-forward relation: yes; the audited implementation checkpoint is 0 commits behind and 134 commits ahead of the remote pull-request head.
- It is 180 commits ahead of live `main`.
- Change surface from the remote pull-request head: 75 files changed, 30,188 insertions, 2,768 deletions.
- The 134-commit local range contains no merge commits and no YTF, Yangon Tyre, or POS solution paths.
- `CLAUDE.md` only records that Claude is paused and forbids implementation or external changes until explicitly reactivated.

The existing green SuperMega App CI and GitGuardian results cover remote checkpoint `338b6fd`, not the audited local implementation checkpoint. They must not be treated as evidence for the unpushed work.

At `49b4e0e`, local lint/build, release, security, database, and HQ contracts pass, along with all 156 Python tests. This is local evidence, not production proof.

## Vercel and domain evidence

| Domain | Result | Vercel project | Production deployment | Git checkpoint |
| --- | --- | --- | --- | --- |
| `supermega.dev` | HTTP 200; current public title | `supermega-public` | `dpl_Dc5U4M2fXkob3KejYAYDv4jAjEw1` | `6885c320` |
| `app.supermega.dev` | HTTP 200; `Today \| SuperMega` | `megaos` | `dpl_FL5eESWF2vGJffydGAVNA4vPQzdp` | `6885c320` |
| `demo.supermega.dev` | HTTP 200; old `SuperMega - open the app` page | `supermega-demo` | separate older deployment | `a62273d` |
| `shop.supermega.dev` | no DNS record | none resolved | none | none |

The two canonical projects had no runtime error clusters in the reviewed seven-day window. That does not prove the unshipped local work.

`demo.supermega.dev` is a separate legacy demo, not a third canonical product surface. `shop.supermega.dev` is not configured and must not be presented as a working app domain.

## Single next safe integration action

After explicit founder approval, perform one fast-forward-only push of the then-current exact local tip of `agent/supermega-release-candidate` to the same remote branch so draft PR #258 can receive fresh checks.

Before that push, resolve and state the exact local SHA and re-confirm that remote `338b6fd11bc27da9b7aa42bee2c293a5c0e3a9ef` is its ancestor. Do not force push. Do not merge, deploy, promote, change aliases or domains, alter environment variables, write hosted data, or activate production in the same action.

After the push, fresh CI and GitGuardian results plus a human review of the full delta are prerequisites for a separate merge decision.

Suggested approval wording:

> I approve a fast-forward-only push of the exact stated local tip to `origin/agent/supermega-release-candidate` for PR #258. I do not approve merge, deployment, domain, environment, database, credential, or production changes.

## Audit boundary

No GitHub, Vercel, DNS, Supabase, domain, deployment, alias, environment, credential, or production state was changed during this reconciliation.
