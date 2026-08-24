# Shop — client demo playbook

## 1. Client and the 30-second pitch

Who this is for: counter-first businesses that sell and track stock — the manifest ships internal template packs for `Retail`, `Cafe`, `Restaurant`, `Spa`, `Gym`, and `School`, over the workflow templates `Social commerce`, `Retail and wholesale`, and `Restaurant ordering`.

The pitch, verbatim from approved copy (eyebrow `Shop operations`):

- `Operating software for Myanmar companies.`
- `Sell, track stock, and close the day.`
- `Use the working Shop sample for counter sales, orders, stock, purchases, receipts, returns, and daily close. Real payments, messages, delivery, and stock writes stay behind review.`

## 2. Pre-demo setup

1. Open `https://app.supermega.dev/settings/?product=shop` — the same destination as the `Start free sample` button on the public `/shop/` landing page.
2. Under `Name your workspace`, enter the client's name in `Business name` (the field shows `Example: Golden Valley Trading`).
3. Press `Create Shop and start selling`. The app provisions the industry sample and opens the first task at `/shop/?tab=counter`. The stated first result is `Complete a sample sale`.
4. Confirm the sidebar badge reads `Demo mode` and the counter heading shows the working-sample pack context.

Shop trade links may include a reviewed `template` query parameter, such as ?product=shop&template=mini-mart. Guided setup resolves it to the matching trade and industry pack, keeps the business-type picker visible, and provisions that local working sample only after the user submits setup. Service businesses without a trade template use the `pack` parameter, such as ?product=shop&pack=spa. Unknown values fail back to an explicit setup choice; never describe a query parameter alone as client activation.

## 3. Demo script

1. Start on the `Sell` tab (`/shop/?tab=counter`). Read the heading: `Tap an item to add it`. Point out the sample catalog tiles with prices and stock counts.
2. Tap two or three items. The `Current sale` panel fills; on a phone the cart is the bottom bar. Tiles show a stored photo where the shop has added one; otherwise the built-in artwork, so a catalog with no photos never looks broken.
3. Show the two ways to find an item without scrolling. Type into `Search or scan SKU`, then tap the camera control beside it — its label is `Scan a barcode with the camera`. On a phone this is the moment that lands: the client points their own camera at a barcode from their own shelf and the item appears. If the browser refuses camera permission, say so plainly and fall back to typing the SKU; do not retry the prompt in front of the client.
4. In the sale panel, leave Customer as `Guest` or type a name, then pick a payment method: `Cash`, `KBZPay`, or `WavePay`.
5. If the shop has saved a merchant QR on this device and you picked `KBZPay` or `WavePay`, a `Show` QR control appears carrying the amount due. Open it: the dialog reads `Scan to pay` above the code and `Amount due` above the figure. **Say what this is and is not** — it displays the shop's own saved QR so the customer can scan and type the amount. SuperMega takes no payment, sees no payment, and confirms nothing; the owner still confirms money arrived in `Orders`. If no QR is saved yet the app says so and points to `Add your merchant QR`, which is the honest thing to demo when it happens.
6. Tap `Review order`. The accountable gate opens (`Review counter order`) and asks for the `Cashier` name. Read the boundary line under the form aloud — it is the privacy pitch (quoted in section 4).
7. Tap `Create order`. The order is created and sample stock is reserved. The footer already told the client: `Confirm to create the order. Finish payment and handoff in Orders.`
8. Open the `Orders` tab (`/shop/?tab=orders`). Advance the new order through its owned steps: `Start preparing`, then `Mark ready`, then `Reconcile payment` when payment review becomes the primary action, then `Complete`.
9. Open the `Stock` tab (`/shop/?tab=inventory`). Show that the sale moved stock and where low-stock items surface; imports live at `/shop/?tab=inventory#shop-catalog-import`. Open one catalog item and show the photo control — `Add photo for` the item when none is stored, `Remove` when one is. Photos stay on this device: not uploaded, not synced, not in the exported CSV. For a shop whose staff cannot read every SKU, this is what makes the counter usable, so give it a moment rather than rushing past it.
10. Finish on the `Today` tab: the next job with `Open next step` and `New sale`, the metrics `Open orders`, `Today's sales`, `Stock alerts`, `Outstanding`, and the disclosures `More Shop tools` and `Shop safeguards`. For an owner-focused client, show `Save daily close` under finance controls at `/shop/?tab=orders#shop-close-controls`.

### 3a. If you are demoing on a phone

Demo on a phone whenever the client runs their counter on one — it is the
hardware the product is for, and the phone layout is not a shrunken desktop.

- The four work modes sit in the bottom bar: `Today`, `Sell`, `Orders`,
  `Stock`. Thumb-reachable, and the same four names the script above uses.
- The current sale is the bottom bar on the counter, not a side panel. Tap it
  to expand.
- Do the **first** load with connectivity, then turn the network off and keep
  selling. That is the honest way to show the offline claim: the app shell is
  precached, so a counter that has already loaded keeps working through a
  dropout. Do not claim a first-ever visit works offline — it does not.

### 3b. Two surfaces to show only if the client asks for them

Neither is on by default. Offering them unprompted lengthens the demo and
invites a question the free tier does not answer.

- **Receipt.** After an order exists, the receipt dialog (`Order record`)
  offers `Print receipt` and `Copy text`. Printing goes through the browser to
  whatever printer the device already has. There is no thermal/ESC-POS receipt
  printer support — if the client asks for one, say it is not built rather
  than implying the browser path is equivalent.
- **Loyalty points.** Off unless the shop turns it on for this device. Once on,
  a known customer's balance appears at the counter as a `pts` chip, and
  `Points balance` shows on the receipt. Points are a projection over sales
  this device recorded — they are not an account, they do not sync between
  devices, and nothing is redeemed without the owner confirming it.

## 4. Objection handling: the boundary

"Is this touching my real money or messaging my customers?" — read the gate's own line:

- `Browser-local sample only. Confirming creates a sample order and reserves sample stock in this browser. Payment and fulfilment stay pending for review in Orders. No payment is captured, no customer is contacted, no server or company account is written, and no real stock is moved.`

"Where does my data go?" — setup says `Stays on this device. Nothing is sent or published.` Nothing in the demo requires an account.

"What do I get free, and what is paid?" — use the approved framing only: `Free product. Managed intelligence.` and `Run the products free. Add managed company intelligence when the workflow proves value.` The free lane is `Operate without a stripped-down plan.` with `No account or model call required`. Managed service is gated: `Managed activation proceeds only after identity, tenant isolation, recovery, and write controls pass for the company.` Never quote a price; the public site carries none.

"What stops a mistake from going live?" — `Every real send, payment, publish, access change, stock movement, or production write stays behind explicit authority and verified server-side controls.`

## 5. The close

- Self-serve close: send them to the public `/shop/` page and have them press `Start free sample` (`https://app.supermega.dev/settings/?product=shop`) on their own phone before they leave.
- Assisted close: the public landing page's second button `Set up Shop data` opens `/contact/?product=shop`, pre-selecting Shop in the `Starting point` field. The form asks `What happens now, and what should be better?` and submits with `Send workflow`; the confirmation starts with `Request received: ` and an ID to keep.
- From inside the app: the setup page's "Ask SuperMega to set up Shop" link carries the workflow template, for example `https://supermega.dev/contact/?product=shop&template=social-commerce&utm_source=app&utm_medium=guided_trial`.
- Managed pilot close (multi-product or AI-context interest): `/contact/?product=guide&source=managed-intelligence` — the contact page retitles itself and the submit button becomes `Request managed pilot`.
