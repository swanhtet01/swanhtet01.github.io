# Ecommerce — client demo playbook

## 1. Client and the 30-second pitch

Who this is for: sellers who take orders in chat or by phone and want a controlled online ordering page feeding Shop — the manifest ships the templates `Social storefront`, `Pickup and preorder`, and `Wholesale request`, all entered from a `Shop catalog`.

The pitch, verbatim from approved copy (eyebrow `Ecommerce maker`):

- `Operating software for Myanmar companies.`
- `Create an online ordering page connected to Shop.`
- `Choose Shop-backed products, build a cart, review a deterministic 15-minute quote, and save a recoverable request receipt. Payment, fulfilment, returns, and refunds are completed in Shop.`

Honesty note: Ecommerce's manifest status is `release-candidate-local`. Demo it as a local working storefront and Shop handoff — never as hosted storefront proof.

## 2. Pre-demo setup

1. Prepare a small client product CSV. Ecommerce uses the same reviewed Shop catalogue as counter sales, stock, and order review; it does not create a second product ledger.
2. Open `https://app.supermega.dev/settings/?product=ecommerce` — the same destination as the `Start free sample` button on the public `/ecommerce/` landing page.
3. Under `Name your workspace`, enter the client's name in `Business name`. In Bring existing data, choose the product CSV; this step is marked Required before Ecommerce.
4. Review the matched rows, approve the import, and use the count-labelled Add action to place only those accepted items in Shop. Then press the primary count-labelled Build action to open `/ecommerce/`. The stated first result is `Open a working online store`.
5. Confirm the local-mode badge remains honest and the store header eyebrow reads `Business store`. The fresh-store headline is `Take the next customer order` with the button `Start customer order`. If the client only wants to explore, `Use demo products` is a separate optional path and remains labelled `Sample store`.

## 3. Demo script

1. Start on `/ecommerce/`. Press `Start customer order` in the `Start here` panel, or scroll to `Customer storefront` directly — this is what the client's customer would see.
2. Tap `Add to cart` on one or two products; the button flips to `In cart`, and availability is honest per item (`Available` or `Sold out`).
3. Open the `Cart and checkout` panel (`Review one total before Shop`). Show the cart lines with quantities and the products total.
4. Fill the customer fields — Name and Phone — then `Receive order`: `Pickup · included` or `Delivery · Shop confirms`. Payment shows the sample notice (quoted in section 4); the empty-cart copy already set the rule: `Nothing goes to Shop until you review the exact quote.`
5. Press `Send order request`. The receipt appears with the `Request sent` pill, one exact total, and a countdown — the approved workflow step is `Review a 15-minute whole-MMK quote`.
6. Press `Continue in Shop`. The app navigates to the Shop order queue (`/shop/?tab=orders&source=ecommerce`) where a named person reviews the request — this is the accountability handoff, the core selling moment.
7. Confirm the draft in Shop, then return to Ecommerce: the receipt now reads `Confirmed in Shop` with the Shop order ID, and offers `Start another order`.
8. Wrap on the order workspace panel (`Order workspace`): in the business-data path it reads `Take a customer order`, and after confirmation the timeline shows the one path from cart to return, with `Open Shop order queue` linking back.

## 4. Objection handling: the boundary

"Did that charge anyone?" — the checkout says it itself: `Browser-local sample payment. No charge or payment-provider request is made.` Approved boundaries add `No payment authorization or charge` and, on the proof side, `Payment remains unauthorized before Shop`.

"Can a customer order break my stock?" — `Nothing goes to Shop until you review the exact quote.`, and the approved boundary is `No Shop order or stock reservation before separate accountable confirmation`. Refunds and returns stay in one place: `Returns and refunds are completed in Shop`.

"Is this a second stock system?" — approved boundary: `No duplicate stock ledger`. The storefront reads the Shop catalog; Shop keeps the accountable order, stock, and close records.

"What do I get free, and what is paid?" — approved framing only: `Free product. Managed intelligence.`, free lane `Operate without a stripped-down plan.` with `No account or model call required`, managed gate `Managed activation proceeds only after identity, tenant isolation, recovery, and write controls pass for the company.` No prices — the public site carries none.

## 5. The close

- Self-serve close: public `/ecommerce/` page, `Start free sample` (`https://app.supermega.dev/settings/?product=ecommerce`), on the seller's own phone.
- Assisted close: the landing page's `Set up Ecommerce data` button opens `/contact/?product=ecommerce` with Ecommerce pre-selected in `Starting point`; submit with `Send workflow`, confirmation starts `Request received: `.
- From inside the app: the setup page's "Ask SuperMega to set up Ecommerce" link carries the template, for example `https://supermega.dev/contact/?product=ecommerce&template=social-storefront&utm_source=app&utm_medium=guided_trial`.
- Managed pilot close (usually paired with Shop): `/contact/?product=guide&source=managed-intelligence` — submit button becomes `Request managed pilot`.
