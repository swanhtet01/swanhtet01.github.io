# SuperMega product quality report

Updated: 2026-08-04
Status: local candidate; production not verified by this report

## Current result

`npm run qa:routes` passes the committed regression and usability policy across 14 public/app routes at 390 x 844 and 1280 x 900: 28 checks, zero horizontal overflow, zero unnamed visible actions, zero duplicate IDs, zero placeholder links, zero mobile touch targets below 44 px, zero console errors, zero page errors, zero external requests, and zero disclosure interaction failures. `simplicityTargetsMet` is true, so the stricter `npm run qa:routes:strict` gate is now expected to pass.

This is a browser-local artifact check. It does not prove hosted persistence, production activation, payment execution, deployment identity, or production security readiness.

The 2026-08-04 dependency audit reports zero known vulnerabilities at the configured low-severity threshold across the root, Showroom, and Kernel packages after updating `brace-expansion` to 5.0.9 and PostCSS to 8.5.25. Registry advisories can change, so this command remains a release-time check rather than a permanent security claim.

## Simplicity scorecard

The regression ceiling stops action density from increasing. The lower target is the intended simple experience. A route may pass the technical gate while remaining above its simplicity target; those gaps stay visible in every report.

| Surface | Mobile actions | Desktop actions | Simplicity target | Decision |
| --- | ---: | ---: | ---: | --- |
| Public home | 9 | 9 | 9 | Target met |
| Public product page | 7 | 7 | 7 | Target met |
| Public contact | 10 | 10 | 10 | Target met |
| Shop home | 14 | 15 | 15 | Target met |
| Shop Orders | 22 | 23 | 23 | Target met; advanced workflows remain available on demand |
| Shop Stock | 20 | 21 | 21 | Target met |
| Plant Jobs | 19 | 20 | 20 | Target met |
| Plant Problems | 19 | 20 | 20 | Target met |
| Website | 14 | 18 | 18 | Target met |
| Ecommerce | 18 | 19 | 19 | Target met |
| Shop setup | 8 | 9 | 9 | Target met |

## Defects fixed during this audit

- Shop order details, local acknowledgement, and cancellation controls now meet the 44 px mobile target.
- Website preview CTA meets 44 px and the embedded customer-page preview is identified as a nested document.
- Ecommerce request filters have a 44 x 44 px minimum target.
- The auditor measures labelled checkbox/radio hit areas instead of incorrectly failing the small native input glyph.
- Hidden, inert, or accessibility-hidden honeypots are excluded from visible-action findings.
- Closed native disclosure content is explicitly hidden at the author CSS layer, preventing component layout rules from exposing every advanced form at once.
- Shop Orders now verifies that Daily tools, Order overview, and Appointments each start closed, open through their summary control, and close again.

## Next product slice

Open a useful sample workspace before asking a prospect to configure or import anything, then measure first value from sample entry and imported data. Preserve the newly sealed action-density ceilings while proving the first complete Shop, Plant, Website, and Ecommerce job at both viewports.

After first-value proof, close managed persistence, tenant isolation, recovery rehearsal, and hosted activation gates. Do not add a fifth customer product or a component-framework migration while those production boundaries remain open.

## Reproduce

Run `npm run qa:routes`. After the artifacts are built, use `node tools/audit_product_routes.mjs --route <route-id> --viewport mobile --details` when investigating one route. Set `SUPERMEGA_QA_BROWSER_PATH` only when Edge, Chrome, or Chromium is not in a supported system location. The runner uses Playwright Core and the installed system browser, starts one local static server at a time, launches one browser, blocks external requests, and writes no report unless an explicit unused `--out` path is supplied.
