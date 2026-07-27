# Codex task brief: verify the current SuperMega product map

Work item: `QA-003`
Role: Product / QA Codex
Base: current release-candidate branch
Mode: read-only
Token mode: lean

## Objective

Prove that the app presents one coherent four-product portfolio without inventing production readiness: Shop and Plant are the operating products; Website and Ecommerce are local release candidates; AI assistance remains a shared, evaluation-gated capability.

## Authority and scope

Use only:

1. `hq/NOW.md`
2. `hq/portfolio.json`
3. `showroom/src/App.tsx`
4. `showroom/src/core/CoreApp.tsx`
5. `tools/verify_app_build.mjs`

Do not edit files or browser data. Do not create records, confirm actions, sign in, push, merge, deploy, change domains, call providers, send messages, or touch hosted storage. YTF, POS, Claude, lead-ledger, payments, and production systems are out of scope.

## Read-only journeys

Run each journey at 390 × 844 and 1280 × 900:

1. Open `/`. Confirm one clear next operator task appears before internal HQ work, then confirm Shop, Plant, Website, and Ecommerce are the visible product launchers.
2. Open `/shop/?tab=orders` and `/shop/?tab=inventory`. Confirm the two customer tabs are Orders and Stock; sample-data and managed-workspace boundaries remain explicit.
3. Open `/plant/?tab=production` and `/plant/?tab=control`. Confirm the two customer tabs are Jobs and Problems; equipment records are observations, never control claims.
4. Open `/website/`. Confirm the local Site → Preview → Publish lifecycle creates reviewable output and does not claim deployment.
5. Open `/ecommerce/`. Confirm Ecommerce builds a Shop-backed storefront and structured request path without duplicating Shop fulfilment, payment, stock, refund, or close.
6. Open `/agents/`. Confirm this compatibility path canonicalizes to HQ's delegated roles, not a product card or standalone product workspace.
7. Open `/operations/commerce/?tab=orders` and `/operations/production/?tab=production`. Confirm each canonicalizes to Shop or Plant without changing stored records.

## Acceptance evidence

- Exact final URL, page title, customer-visible product name, and tab labels for every route.
- No horizontal overflow, error overlay, console error, broken focus, or visible control below 44 px on mobile.
- Shop, Plant, Website, and Ecommerce are the only customer products. AI assistance is a shared capability; HQ, Work, R&D, Ops, Console, and agent teams remain internal.
- Internal `commerce` and `production` IDs remain compatibility details and no data migration occurs.
- Browser-local, managed, evaluation-gated, and owner-gated boundaries are visible and accurately worded.
- Website never claims publish/deploy success; Ecommerce never claims an order before Shop confirmation; AI assistance never claims provider quality or autonomy.
- Return one compact evidence packet with route measurements, failures, remaining blockers, and the single next safe integration action.
