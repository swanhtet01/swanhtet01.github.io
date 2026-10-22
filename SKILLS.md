# SuperMega capability map

This is a repository routing guide. It does **not** install a Codex skill, grant
credentials, expand scope, or authorize production work. Agents read it only
after `supergoal.md`, `CURRENT.md`, and the applicable `AGENTS.md`.

Use a capability route when its trigger matches the assigned outcome. If two
routes overlap, choose one primary route and list the other as a reviewer or
gate; do not start duplicate implementations.

| Capability | Use when | Primary sources | Minimum proof | Human boundary |
| --- | --- | --- | --- | --- |
| Native Shop product/UI | A counter, catalog, stock, settings, language, or responsive behavior changes | `mobile/shop_pos/lib/`, `mobile/shop_pos/test/`, `mobile/shop_pos/README.md` | Focused widget/unit test, analysis, full Flutter suite, exact-head native CI | Vivian accepts operator usability; Swan owns integration |
| Sale, stock, wallet, and recovery correctness | A change can affect money, inventory, correction/refund, pending wallet intent, cash close, backup, restore, or restart | `mobile/shop_pos/lib/shop_database.dart`, `mobile/shop_pos/lib/shop_backup.dart`, `mobile/shop_pos/lib/shop_startup.dart`, `docs/SHOP-ROLE-WORKSTATION-DELIVERY.md`, and focused tests | Immutable original/audit linkage, exact authorization binding, failure/retry and idempotency regression, malformed snapshot rejection, broader native CI | Never infer settlement or operator authority; release needs a real verifier plus installed restore evidence |
| Public Shop and gallery provenance | Product copy, public routing, screenshots, or gallery evidence changes | `site-manifest.json`, `tools/public-assets/`, `tools/create_public_vercel_output.mjs`, `tools/public_native_shop_gallery.mjs` | `public:build`, `public:verify`, gallery regression, source/artifact identity | Public promotion and marketing claims stay owner-controlled |
| Release candidate verification | Work is proposed for the active integration lane | `CURRENT.md`, the active PR, `.github/workflows/shop-native-ci.yml`, release runbook | Exact final head, required checks, review findings resolved or explicitly blocked | Merge, signing, and production go/no-go are separate decisions |
| Device and peripheral acceptance | App installation, restart, scanner, or receipt printing is being evaluated | Native README plus `docs/SHOP-RELEASE-RUNBOOK.md` | Named OS/device/build, steps, observed result, retained receipt/photo/log reference | Physical evidence must be collected by an authorized operator |
| Merchant-journey acceptance | The release is ready for operations review | `docs/FOUNDER-OPERATING-MODEL.md`, release runbook | Catalog → sale → stock → correction/refund → close → export → restart → restore receipt | Vivian owns acceptance; agents cannot self-approve it |
| Commercial and support readiness | Pricing, setup, printer promise, support channel, or onboarding is being decided | Founder operating model and approved operations record | Decision owner, effective offer, excluded promises, support owner, next review date | Swan + Vivian approve price and customer promise changes |
| Dots/external-work intake | An external workspace, export, draft, or branch is shared | Exact supplied artifact plus current Git candidate | Provenance, overlap review, and Keep/Merge/Pause/Archive/Client-specific classification | No action from an unattributed or inaccessible source |
| Local-to-cloud recovery | The original local machine or session becomes available | Git status/branch/HEAD, staged and unstaged diff, stash, untracked inventory | Bounded patch with provenance and no duplicated candidate work | Never migrate secrets, caches, or broad private folders |

## Standard capability packet

Before implementation, write a short packet:

```text
Outcome:
Operator/customer:
Primary capability:
Inputs and source revision:
Bounded paths:
Acceptance check:
Evidence level sought:
Human decision or hardware needed:
```

At handoff, add:

```text
Result: Keep | Merge | Pause | Archive | Client-specific
Changed paths:
Candidate identity:
Checks and links:
Known limits:
Next owner and action:
```

## Adding a capability

Add a row only after the work has repeated and has a stable input, output, and
acceptance check. Link to maintained source or a runbook; do not paste another
roadmap. A capability description must state its human boundary and cannot
silently introduce a new product, provider, agent framework, or release lane.
