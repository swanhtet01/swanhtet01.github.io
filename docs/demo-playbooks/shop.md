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

1. Start on the `Sell` tab (`/shop/?tab=counter`). On a phone, point to the bottom task bar — `Today`, `Sell`, `Orders`, and `Stock` are the working modes, not setup pages. Read the heading: `Tap an item to add it`.
2. Show the item-finding paths before touching the cart: tap a tile, type into `Search or scan SKU`, and on Android Chrome tap `Scan a barcode with the camera` if the button appears. If the button is absent, say the app fell back to the keyboard-wedge/search path rather than pretending every browser has camera scanning.
3. Open `Stock` (`/shop/?tab=inventory`) and point at the product-photo control on a catalog row. If you have a non-private test image, attach it and return to `Sell` to show the same SKU as a photo tile; otherwise say product photos are device-local and skip the upload.
4. Add two or three items. The `Current sale` panel fills; on a phone the cart sits at the bottom so the cashier never leaves the counter flow.
5. In the sale panel, use a named customer if you are demonstrating points; otherwise leave Customer as `Guest`. If loyalty is enabled and the customer has a projected balance, point at the points chip only as a reviewed balance — do not call it a campaign, membership, or automated promotion.
6. Pick `Cash`, `KBZPay`, or `WavePay`. If a non-sensitive test merchant QR is already saved on this device, open the amount-due QR affordance and read `Scan to pay`; otherwise state the boundary: the QR feature is display-only and the owner must add their own provider-issued image.
7. Leave `Keep as open order` off for the routine walk-in path, then tap `Review & complete sale`. The accountable gate opens (`Review counter sale`) and asks for the `Cashier` name. Read the boundary line under the form aloud — it is the privacy pitch (quoted in section 4).
8. Tap `Complete sale`. One reviewed browser-local write creates the order record, reconciles the selected payment as operator evidence, records handoff, and updates sample stock. It does not charge a wallet or card; show the resulting receipt/order acknowledgement as the completed sample outcome.
9. To demonstrate pay-later or later handoff, start a second sample basket, enable `Keep as open order`, tap `Review order`, and then `Create order`; the app opens `Orders` (`/shop/?tab=orders`) automatically. If payment and handoff happen together, use the immediate `Paid & handed over` action. If payment is recorded separately, open `More`, choose `Record payment only`, then use `Start preparing`, `Mark ready`, and `Complete`. Never say the QR captured money.
10. Finish on `Today`: show `Open next step`, `New sale`, `Open orders`, `Today's sales`, `Stock alerts`, `Outstanding`, `More Shop tools`, and `Shop safeguards`. For an owner-focused client, open `/shop/?tab=orders#shop-close-controls`, show the settlement count, and use `Review and save close` or `Save daily close` only after the day's numbers have been checked.

Android phone smoke pass, before using this with a real owner: first load the sample while online, then turn off connectivity and repeat steps 1, 2, 4, 7, 8, 9, and 10. Record whether the camera prompt appears, whether the bottom bar remains usable with one thumb, whether the QR dialog opens or shows the no-saved-QR fallback, whether the completed-sale receipt survives reload, and whether the open-order/close path remains usable. This is still rehearsal evidence only; it is not hosted pilot proof.

For a recorded founder rehearsal, run the local `shop:android-smoke:packet` script and fill the private evidence fields it lists. Keep names, screenshots, and device notes in the private workspace; public reports get only pass/fail, counts, and digest.

## 4. Objection handling: the boundary

"Is this touching my real money or messaging my customers?" — read the gate's own line:

- `Browser-local sample only. Confirming records the cashier’s reviewed payment and handoff, completes the sale, and updates sample stock in this browser. It does not charge a wallet or card, contact a customer, write to a server or company account, or move real stock.`

"Where does my data go?" — setup says `Stays on this device. Nothing is sent or published.` Nothing in the demo requires an account.

"What do I get free, and what is paid?" — use the approved framing only: `Free product. Managed intelligence.` and `Run the products free. Add managed company intelligence when the workflow proves value.` The free lane is `Operate without a stripped-down plan.` with `No account or model call required`. Managed service is gated: `Managed activation proceeds only after identity, tenant isolation, recovery, and write controls pass for the company.` Never quote a price; the public site carries none.

"What stops a mistake from going live?" — `Every real send, payment, publish, access change, stock movement, or production write stays behind explicit authority and verified server-side controls.`

## 5. The close

- Self-serve close: send them to the public `/shop/` page and have them press `Start free sample` (`https://app.supermega.dev/settings/?product=shop`) on their own phone before they leave.
- Assisted close: the public landing page's second button `Set up Shop data` opens `/contact/?product=shop`, pre-selecting Shop in the `Starting point` field. The form asks `What happens now, and what should be better?` and submits with `Send workflow`; the confirmation starts with `Request received: ` and an ID to keep.
- From inside the app: the setup page's "Ask SuperMega to set up Shop" link carries the workflow template, for example `https://supermega.dev/contact/?product=shop&template=social-commerce&utm_source=app&utm_medium=guided_trial`.
- Managed pilot close (multi-product or AI-context interest): `/contact/?product=guide&source=managed-intelligence` — the contact page retitles itself and the submit button becomes `Request managed pilot`.
