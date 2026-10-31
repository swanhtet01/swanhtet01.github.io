# SuperMega capability map

This is a repository routing guide. It does **not** install a Codex skill, grant
credentials, expand scope, or authorize production work. Agents read it only
after `supergoal.md`, `CURRENT.md`, and the applicable `AGENTS.md`.

This repository deliberately uses this single `SKILLS.md` capability map. Do
not invent a `.agents/skills` tree or `SKILL.md` package merely to restate these
routes. Add a packaged skill only when the repository has an approved runnable
workflow, maintained assets or scripts, and a named owner.

Use a capability route when its trigger matches the assigned outcome. If two
routes overlap, choose one primary route and list the other as a reviewer or
gate; do not start duplicate implementations.

| Capability | Use when | Primary sources | Minimum proof | Human boundary |
| --- | --- | --- | --- | --- |
| Native Shop product/UI | A counter, catalog, stock, settings, language, or responsive behavior changes | `mobile/shop_pos/lib/`, `mobile/shop_pos/test/`, `mobile/shop_pos/README.md` | Focused widget/unit test, analysis, full Flutter suite, exact-head native CI | Vivian accepts operator usability; Swan owns integration |
| Sale, stock, wallet, and recovery correctness | A change can affect money, inventory, correction/refund, pending wallet intent, cash close, backup, restore, or restart | `mobile/shop_pos/lib/shop_database.dart`, `mobile/shop_pos/lib/shop_backup.dart`, `mobile/shop_pos/lib/shop_startup.dart`, `docs/SHOP-ROLE-WORKSTATION-DELIVERY.md`, and focused tests | Immutable original/audit linkage, server-authentic asymmetric proof against a reviewed source-pinned key, exact workspace/actor/capability/command binding, failure/retry and idempotency regression, native SQLite migration fixtures, direct-open semantic validation, malformed snapshot rejection, broader native CI; hosted database proof is separate | Never infer settlement or operator authority; absent issuer/pin means unavailable, pilot correction is online-only, and release still needs installed restore evidence |
| Public Shop and gallery provenance | Product copy, public routing, screenshots, or gallery evidence changes | `site-manifest.json`, `tools/public-assets/`, `tools/create_public_vercel_output.mjs`, `tools/public_native_shop_gallery.mjs` | `public:build`, `public:verify`, gallery regression, source/artifact identity | Public promotion and marketing claims stay owner-controlled |
| Release candidate verification | Work is proposed for the active integration lane | `CURRENT.md`, the active PR, `.github/workflows/shop-native-ci.yml`, release runbook | Exact base/head/tree, included and excluded checkpoints, checks tied to that tree, first failure plus later NOT RUN stages, review findings resolved or explicitly blocked | Merge, signing, and production go/no-go are separate decisions |
| Remote QA and device/peripheral acceptance | App installation, restart, scanner, receipt printing, or an emulator run is being evaluated | Native README, `docs/REMOTE-ANDROID-QA-PILOT.md`, and `docs/SHOP-RELEASE-RUNBOOK.md` | Named remote host/OS/build/artifact, package and signature status, steps, observed result, retained receipt/image/log reference; simulated and physical evidence separated | User-local workloads stay prohibited; provider access, spend, installation and physical acceptance retain their exact gates |
| Merchant-journey acceptance | The release is ready for operations review | `docs/FOUNDER-OPERATING-MODEL.md`, release runbook | Catalog → sale → stock → correction/refund → close → export → restart → restore receipt | Vivian owns acceptance; agents cannot self-approve it |
| Commercial and support readiness | Pricing, setup, printer promise, support channel, or onboarding is being decided | Founder operating model and approved operations record | Decision owner, effective offer, excluded promises, support owner, next review date | Swan + Vivian approve price and customer promise changes |
| Engineering-to-BD/Ops handoff | Operations, marketing, support, or social work needs technical product facts | `CURRENT.md`, exact PR/CI/artifact evidence, and the founder operating model | Plain-language implemented/not-proven matrix with source links and no unsupported parity, launch, price, or availability claim | BD/Ops owns content and outreach; engineering does not build or operate social agents in the Shop release lane, and output stays draft-only without verified destination access and authority |
| Dots/external-work intake | An external workspace, export, draft, or branch is shared | Exact supplied artifact plus current Git candidate | Provenance, overlap review, and Keep/Merge/Pause/Archive/Client-specific classification | No action from an unattributed or inaccessible source |
| Local-to-cloud evidence recovery | The owner explicitly authorizes a named read-only recovery action from an original local machine or session | Git status/branch/HEAD, staged and unstaged diff, stash, untracked inventory | Bounded evidence or patch with provenance and no duplicated candidate work | Availability is not authority: do not run an app, emulator, database, agent workload, install, or service locally; never migrate secrets, caches, or broad private folders |

## Standard capability packet

Before implementation, write a short packet:

```text
Outcome:
Operator/customer:
Primary capability:
Inputs and source revision:
Base/head/tree and included checkpoints:
Bounded paths:
Acceptance check:
Evidence level sought:
Human decision, remote environment, spend, or hardware needed:
```

At handoff, add:

```text
Result: Keep | Merge | Pause | Archive | Client-specific
Changed paths:
Candidate identity:
Checks and links:
Executed, failed, skipped, and not-run checks:
Known limits:
Next owner and action:
```

## Adding a capability

Add a row only after the work has repeated and has a stable input, output, and
acceptance check. Link to maintained source or a runbook; do not paste another
roadmap. A capability description must state its human boundary and cannot
silently introduce a new product, provider, agent framework, or release lane.
