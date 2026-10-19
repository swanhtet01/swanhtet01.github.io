# Shop-first launch gate — 19 October 2026

**Decision: NO-GO.** Customer-managed launch scope is Shop only; Sites and Commerce remain internal. Production promotion, customer access, commercial claims, and customer contact remain separately gated.

| Gate | Result | Current evidence |
|---|---|---|
| Shop-only customer scope | **PASS — local source** | `site-manifest.json` exposes Shop as the active product and retains Plant, Sites, and Commerce without deleting their workspace records. `tools/product_visibility.test.mjs` passes 11 tests against the generated output. |
| Public website | **FAIL — live site mismatches scope** | The current public page lists Shop, Sites, and Commerce, and labels all three images “illustrative records.” This is not the requested Shop-only, actual-capture showcase. No live deployment was performed. |
| Local website candidate | **PASS — review-only** | Static output has 7 routes and 34 static files. Artifact budget is 44 files / 1.43 MB; landing-page checks pass 345/345. Compatibility routes do not offer new Sites, Commerce, or Plant setup. |
| Product capture provenance | **PASS — source-bound local captures; NOT publishable** | `tools/capture_public_gallery.mjs` captured 22 actual component views from commit `a4fa5a89fe7d730468654cfd616ae12449dfe9a1`; 12 Shop captures are bound to public-gallery assets (Today, Counter, Orders, Inventory at 1440×900, 768×1024, and 390×844). The fixture uses synthetic records, external requests were denied, and `publicationReady=false`. |
| Payment / fulfilment semantics | **PASS — local source tests** | Pending payment no longer becomes “late” from a delivery promise; payment and fulfilment lateness have separate labels. AR aging (50 checks), customer receivables (66 checks), and order-attention/localization (5 tests) pass. Physical payment reconciliation is not proven. |
| Full English / Burmese experience | **FAIL — incomplete** | `tools/audit_shop_locale_surface.mjs` reports `coverageComplete=false`, with 1,226 raw English fragments across six audited Shop surfaces. Only the new payment/fulfilment labels are covered by this change. |
| Managed preview migration chain | **FAIL** | Data-less branch `supermega-shop-preview-20261019` (`e9593100-0304-49af-8a2b-b357a3707603`, ref `tnzgzimmqzbwbjpvkfer`) is `MIGRATIONS_FAILED`; its public schema and migration ledger are empty. The first production-ledger migration expects `public.enterprise_users`, but production history omits the repository's earlier legacy baseline. |
| Managed Auth / tenant isolation / hosted reload | **NOT RUN / NOT PROVEN** | No approved two-user synthetic tenant journey, cross-tenant denial, save/reload, or hosted recovery was verified on this branch. No customer identities were created. |
| Shop barcode scanner / receipt printer | **NOT RUN** | No named device/browser matrix or physical scanner, printer, paper, and Myanmar-font proof is bound to this candidate. |
| Paid-VPS agents | **NOT RUN** | No accepted worker installation, authenticated heartbeat, or isolated job completion is bound to this candidate. No local inference is used as a substitute. |
| Exact-head CI and review | **BLOCKED** | Existing PR #682 remains open at prior head `6ec25179d7aa8a7720957926f070d841f42f8f31`; its latest checks include a GitGuardian failure, while the new local commit `a4fa5a89fe7d730468654cfd616ae12449dfe9a1` has no remote CI or independent review yet. |
| Production release | **NOT RUN — separate owner gate** | No production migration, deployment, domain update, customer action, or commercial claim was made. |

## Next actions

1. Reconcile migration source/history without touching production unless separately authorized; a dashboard-created branch replays production history, whereas a GitHub-connected branch builds from repository migrations ([Supabase branching](https://supabase.com/docs/guides/deployment/branching), [MIGRATIONS_FAILED guidance](https://supabase.com/docs/guides/troubleshooting/branch-in-migrations-failed-status)).
2. Update the existing review candidate and prove exact-head CI, security review, and an eligible independent reviewer. Do not merge or promote it.
3. Run managed Auth, tenant isolation, Shop purchase/stock, Burmese, physical scanner/printer, and VPS-worker acceptance on the working preview.
4. Re-read the production website and all release gates before any owner-authorized deployment decision.
