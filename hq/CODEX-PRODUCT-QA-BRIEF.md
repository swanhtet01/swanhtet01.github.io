# Codex task brief: verify the corrected SuperMega product map

Work item: `QA-002`
Role: Product / QA Codex
Base: current integration branch
Mode: read-only
Token mode: lean

## Objective

Prove that Shop and Plant are the clear canonical products, Website remains truthful, Ecommerce and AI Agent Solutions are visibly planned without fake buttons, and old operation routes preserve the same underlying records.

## In-scope paths

1. `showroom/src/App.tsx`
2. `showroom/src/core/CoreApp.tsx`
3. `site-manifest.json`
4. `tools/verify_app_build.mjs`
5. `tools/verify_public_vercel_output.mjs`

## Out of scope

- No file edits, branches, commits, pushes, deployments, connector writes, or hosted mutations.
- No YTF, POS, Claude, lead-ledger, payment, external message, or production database work.
- No new product modules or visual redesign.

## Journeys

1. Open `/` and confirm the first actionable products are Shop, Plant, and Website.
2. Open `/shop/?tab=orders`, change only browser-local sample state, and confirm the route and UI stay Shop.
3. Open `/plant/?tab=production`, review Jobs and Problems, and confirm the route and UI stay Plant.
4. Open `/operations/commerce/?tab=orders` and `/operations/production/?tab=production`; confirm each canonicalizes to Shop or Plant without resetting its current record.
5. Open Products and confirm Ecommerce and AI Agent Solutions are one compact planned block with no demo button.
6. Open Website Publish and confirm the optional handoff says Shop and returns to `/shop/?tab=orders`.

Run at 1280 px and 375 px.

## Acceptance

- No horizontal overflow, error overlay, console error, or broken focus.
- Shop and Plant are the only customer-facing names for the two implemented operating runtimes.
- Internal `commerce` and `production` IDs remain intact and no local data migration occurs.
- Ecommerce clearly owns future storefront/order intent; Shop owns order, stock, fulfilment, payment-status, and close.
- Agents clearly prepare work for human review and have no active demo button.
- Visible controls are at least 44 px high on mobile.
- Return one compact evidence packet with exact routes, measurements, and any remaining blocker.
