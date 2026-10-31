# SuperMega client demo playbooks

These are operator-led demo playbooks, not instructions customers must complete themselves. Shop is the customer-facing offer; Sites and Commerce remain internal, and Plant is retained reference only. SuperMega prepares any setup or deliverable after scope agreement; customers review the result. The drift guard (tools/test_demo_playbooks.mjs, run via the `demo:playbooks:verify` npm script inside `app:verify`) checks backticked tokens against source. Token presence alone does not verify a whole journey or prove that a source-only change is deployed.

## Playbooks

- [shop.md](shop.md) — counter sales, orders, stock, and daily close
- [plant.md](plant.md) — jobs, output, materials, problems, and shift close
- [website.md](website.md) — brief to responsive website file
- [ecommerce.md](ecommerce.md) — Shop-connected online ordering

## Surfaces

- Public site: `https://supermega.dev` — Shop is the only customer product entry at `/shop/`, with `/contact/` and `/privacy/`. The public `/plant/`, `/website/` and `/ecommerce/` routes return 404. The header offers a secondary Sign in route for existing merchants.
- App: `https://app.supermega.dev` is the intended hosted app origin, not proof this commit is deployed. In the current source, a fresh visitor sees the service-first entry; retained setups can resume, and `/?choose=1` opens product choice. The sidebar includes `Switch product` and `Login`; local samples show `Local workspace`. Verify the exact hosted release before using these instructions with a customer.
- Legacy internal rehearsal setup (not a public acquisition CTA): `https://app.supermega.dev/settings/?product=shop`, `/settings/?product=plant`, `/settings/?product=website`, `/settings/?product=ecommerce`. The product parameter also accepts the internal aliases `commerce`, `production`, `retail`, and `factory`.
- Retired entries: old `demo` query links and the legacy entry route return to the account home. They no longer select or open a product.

## Before any demo

1. Use a disposable browser profile you control and fictional business/customer details. The samples are browser-local; nothing about the demo requires an account. Contact submission described under the close is a separate authorized follow-up, not part of the no-send demo.
2. Use a separate disposable browser profile for synthetic demos. Never reset an existing customer's workspace to prepare a demonstration. `/settings/#controls` exposes `Recovery` / `Status and recovery`, including `Save restore point` and `Download workspace backup`; destructive reset is a separate owner-authorized recovery action, not routine demo preparation.
3. Use the current Shop walkthrough for customer conversations. Sites and Commerce business-brief and setup routes are internal operator rehearsals, not required customer onboarding.

## Honest-demo rules

- Every demo runs on browser-local sample records. Say so out loud; the app says it too (setup shows `Stays on this device. Nothing is sent or published.`).
- A local demo proves the workflow, not a live customer system, revenue, or production persistence. Do not present sample orders, sample stock, or generated files as live company records (CURRENT.md, Product status).
- The public site carries no pricing. Amounts appear only inside app sample data. Do not quote prices in a demo; route commercial questions to the contact flow.
- Ecommerce ships as a local release candidate (site-manifest status `release-candidate-local`); demo it as a working sample plus Shop handoff, never as hosted storefront proof.
- Never perform a real send, payment, publish, deployment, or production write during a demo. The approved line: Real sends, payments, publishing, access changes and stock writes require their applicable authority and verified server controls.
