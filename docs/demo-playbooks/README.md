# SuperMega client demo playbooks

One playbook per customer product. A founder or sales agent follows the playbook verbatim: every route, query parameter, button label, and copy string written in backticks exists word-for-word in the app source or the public-site generator at this commit, and the drift guard (tools/test_demo_playbooks.mjs, run via the `demo:playbooks:verify` npm script inside `app:verify`) fails the build if any of them drifts.

## Playbooks

- [shop.md](shop.md) — counter sales, orders, stock, and daily close
- [plant.md](plant.md) — jobs, output, materials, problems, and shift close
- [website.md](website.md) — brief to responsive website file
- [ecommerce.md](ecommerce.md) — Shop-connected online ordering

## Surfaces

- Public site: `https://supermega.dev` — home, `/shop/`, `/plant/`, `/website/`, `/ecommerce/`, `/contact/`, `/privacy/`. The header carries `Company sign in`.
- App: `https://app.supermega.dev` — local working products and explicit samples. Opening `/` resumes the last product (Shop on first visit); `/?choose=1` opens the `Switch product` screen. The sidebar shows the current product, `Switch product`, `Company login`, and the runtime badge, which reads `Local mode` before a company account is connected.
- Guided setup (the target of every public `Start free sample` button): `https://app.supermega.dev/settings/?product=shop`, `/settings/?product=plant`, `/settings/?product=website`, `/settings/?product=ecommerce`. The product parameter also accepts the internal aliases `commerce`, `production`, `retail`, and `factory`.
- Legacy entry: the app root and the `legacy-entry` route accept a demo query parameter with the values `shop`, `retail`, `plant`, `factory`, `website`, `site`, `ecommerce`, `storefront`, and `online-orders`, redirecting to the matching product route.

## Before any demo

1. Use a normal browser window you control. The samples are browser-local; nothing about the demo requires an account.
2. If the workspace was used before, open `/settings/#controls` (the sidebar labels it `Recovery`; the page heading is `Status and recovery`). Use `Save restore point` or `Download workspace backup`, then the destructive `Reset this device` disclosure: `Prepare local reset`, then `Confirm local reset`.
3. Run the product's guided setup from its playbook so the first task is already on screen when the client sits down.

## Honest-demo rules

- Every demo runs on browser-local sample records. Say so out loud; the app says it too (setup shows `Stays on this device. Nothing is sent or published.`).
- A local demo proves the workflow, not a live customer system, revenue, or production persistence. Do not present sample orders, sample stock, or generated files as live company records (CURRENT.md, Product status).
- The public site carries no pricing. Amounts appear only inside app sample data. Do not quote prices in a demo; route commercial questions to the contact flow.
- Ecommerce ships as a local release candidate (site-manifest status `release-candidate-local`); demo it as a working sample plus Shop handoff, never as hosted storefront proof.
- Never perform a real send, payment, publish, deployment, or production write during a demo. The approved line: `Every real send, payment, publish, access change, stock movement, or production write stays behind explicit authority and verified server-side controls.`
