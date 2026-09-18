# Ecommerce — client demo playbook

## 1. Client and the 30-second pitch

Who this is for: sellers who take orders in chat or by phone and want a controlled online ordering page feeding Shop — the manifest ships the templates `Social storefront`, `Pickup and preorder`, and `Wholesale request`, all entered from a `Shop catalog`.

The pitch, verbatim from approved copy (eyebrow `Ecommerce maker`):

- `Start with POS-independent Shop Profit Control, with Ecommerce requests and Website delivery as connected workflows.`
- `Draft an ordering page from the current local Shop workspace.`
- `Choose items from the current local Shop workspace, draft a browser-local catalog, cart, and quote, and save a recoverable request receipt. Nothing is published or sent to a managed Shop inbox; no payment is taken, and no stock is reserved or moved. Shop remains the price and stock record.`

Honesty note: Ecommerce's manifest status is `release-candidate-local`. Demo it as a working sample and a Shop handoff — never as hosted storefront proof.

## 2. Pre-demo setup

1. Best demo order: run the Shop guided setup first (see shop.md) so the handoff has a Shop side to land in; the two samples share the browser workspace.
2. Open `https://app.supermega.dev/settings/?product=ecommerce` — the same destination as the `Start free sample` button on the public `/ecommerce/` landing page.
3. Under `Name your workspace`, enter a fictional demonstration name in `Business name`, not the client's private data.
4. Press `Create Ecommerce and open the store`. A storefront and checkout sample are provisioned and the app opens `/ecommerce/`. The stated first result is `Open a working online store`.
5. Confirm the sidebar badge reads `Demo mode` and the store header eyebrow reads `Sample store`. The `Start here` panel offers `Try sample request`. Its headline is `Let SuperMega prepare your catalog` on the assisted entry or `Try one sample request` on a ready local sample. Neither entry proves a live store or a confirmed order.

## 3. Demo script

1. Start on `/ecommerce/`. Press `Try sample request` in the `Start here` panel, or scroll to the storefront directly — this previews the customer flow without publishing a store.
2. Tap `Add to cart` on one or two products; the button flips to `In cart`, and availability is honest per item (`Available` or `Sold out`).
3. Open the `Cart and checkout` panel (`Review one total before Shop`). Show the cart lines with quantities and the products total.
4. Fill the customer fields — Name and Phone — then `Receive order`: `Pickup · included` or `Delivery · Shop confirms`. Payment shows the sample notice (quoted in section 4); the empty-cart copy already set the rule: `Nothing goes to Shop until you review the exact quote.`
5. Press `Save request on this device`. The receipt must say `Request saved on this device`; show the total and browser-local boundary. The quote step is `Review a 15-minute whole-MMK quote`. Do not describe this as delivered to a company.
6. Explain the distinction: `Send order request` and `Request sent to Shop` belong to the separately configured managed path. A local receipt does not prove that path, a confirmed order, payment or stock reservation. Do not run a managed write during this demo.
7. Finish with `Request catalog setup`. SuperMega prepares the catalog after scope is agreed; the customer should not have to learn the operator builder. Explain preview review and separate publication, rather than promising an already-live store.

## 4. Objection handling: the boundary

"Did that charge anyone?" — the checkout says it itself: `Browser-local sample payment. No charge or payment-provider request is made.` Approved boundaries add `No payment authorization or charge` and, on the proof side, `Payment remains unauthorized before Shop`.

"Can a customer order break my stock?" — `Nothing goes to Shop until you review the exact quote.`, and the approved boundary is `No Shop order or stock reservation before separate accountable confirmation`. Refunds and returns stay in one place: `Returns and refunds are completed in Shop`.

"Is this a second stock system?" — approved boundary: `No duplicate stock ledger`. The storefront reads the Shop catalog; Shop keeps the accountable order, stock, and close records.

"What do I get free, and what is paid?" — current public framing: `Explore local examples free. Assisted setup and ongoing service are scoped separately. A sample or submitted brief is not a live business account.` Agree a reviewed quote before paid preparation; do not infer a managed entitlement. The activation gate remains: `Managed activation proceeds only after identity, tenant isolation, recovery, and write controls pass for the company.`

## 5. The close

- Primary close: the landing page's `Request assisted setup` button opens `/contact/?product=ecommerce` with Ecommerce pre-selected in `What do you need?`; submit with `Request setup` only when the customer authorizes sending their brief. Confirmation starts `Request received: `; keep the ID. This is brief receipt, not delivery of a working store.
- Optional sample: `Start free sample` (`https://app.supermega.dev/settings/?product=ecommerce`) is for exploration, not a required customer setup task.
- From inside the app: the setup page's "Ask SuperMega to set up Ecommerce" link carries the template, for example `https://supermega.dev/contact/?product=ecommerce&template=social-storefront&utm_source=app&utm_medium=guided_trial`.
- Help choosing services: `/contact/?product=guide&source=assisted-setup` — submit with `Request setup` only after authorization. Shop handoff and managed activation require separate scope and acceptance; submitting a brief does not publish a catalog or accept an order.
