# SuperMega product quality report

Updated: 2026-08-04
Status: local candidate; production not verified by this report

## Current result

`npm run qa:routes` passes the committed regression and usability policy across 14 public/app routes at 390 x 844 and 1280 x 900: 28 checks, zero horizontal overflow, zero unnamed visible actions, zero duplicate IDs, zero placeholder links, zero mobile touch targets below 44 px, zero console errors, zero page errors, and zero external requests. `simplicityTargetsMet` remains false, so the stricter `npm run qa:routes:strict` gate correctly stays blocked.

This is a browser-local artifact check. It does not prove hosted persistence, production activation, payment execution, deployment identity, or production security readiness.

The 2026-08-04 dependency audit reports zero known vulnerabilities at the configured low-severity threshold across the root, Showroom, and Kernel packages after updating `brace-expansion` to 5.0.9 and PostCSS to 8.5.25. Registry advisories can change, so this command remains a release-time check rather than a permanent security claim.

## Simplicity scorecard

The regression ceiling stops action density from increasing. The lower target is the intended simple experience. A route may pass the technical gate while remaining above its simplicity target; those gaps stay visible in every report.

| Surface | Mobile actions | Desktop actions | Simplicity target | Decision |
| --- | ---: | ---: | ---: | --- |
| Public home | 9 | 9 | 9 | Target met |
| Public product page | 7 | 7 | 7 | Target met |
| Public contact | 10 | 10 | 10 | Target met |
| Shop home | 25 | 26 | 20 | Reduce secondary controls |
| Shop Orders | 114 | 115 | 44 | Highest-priority redesign |
| Shop Stock | 43 | 44 | 32 | Move purchasing depth behind the selected task |
| Plant Jobs | 33 | 34 | 30 | Near target after the focused drawer change |
| Plant Problems | 33 | 34 | 30 | Near target; preserve quality depth behind issue context |
| Website | 22 | 26 | 22 | Mobile target met; reduce desktop-only secondary controls |
| Ecommerce | 53 | 54 | 36 | Move advanced order tools behind the current request |
| Shop setup | 8 | 9 | 9 | Target met |

## Defects fixed during this audit

- Shop order details, local acknowledgement, and cancellation controls now meet the 44 px mobile target.
- Website preview CTA meets 44 px and the embedded customer-page preview is identified as a nested document.
- Ecommerce request filters have a 44 x 44 px minimum target.
- The auditor measures labelled checkbox/radio hit areas instead of incorrectly failing the small native input glyph.
- Hidden, inert, or accessibility-hidden honeypots are excluded from visible-action findings.

## Next product slice

Redesign Shop Orders first. Preserve every workflow and evidence boundary, but show only the daily queue, the current order state, one primary action, and one contextual `More` control. Move reports, imports, service schedules, finance, supplier, and enterprise controls behind task-labelled disclosures or drawers. Acceptance is no more than 44 visible actions at either viewport, no increase in first-viewport actions, and the complete route/app/security gate remaining green.

After Shop Orders, use the same pattern for Ecommerce advanced order tools and Shop Stock purchasing controls. Do not add a fifth customer product or a component-framework migration while these target gaps remain.

## Reproduce

Run `npm run qa:routes`. After the artifacts are built, use `node tools/audit_product_routes.mjs --route <route-id> --viewport mobile --details` when investigating one route. Set `SUPERMEGA_QA_BROWSER_PATH` only when Edge, Chrome, or Chromium is not in a supported system location. The runner uses Playwright Core and the installed system browser, starts one local static server at a time, launches one browser, blocks external requests, and writes no report unless an explicit unused `--out` path is supplied.
