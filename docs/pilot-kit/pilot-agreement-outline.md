# Shop pilot agreement — plain-language outline

NOT LEGAL ADVICE. This is an outline of talking points to align on with the design partner before day 1, in plain language. It is not a contract, it creates no obligations, and anything either side wants to be binding needs its own properly reviewed document. It contains no commitments beyond what the repo's own contracts already state.

## What the partner gets

- The working Shop product, free, on their own device. The approved framing is `Free product. Managed intelligence.` — the free lane needs `No account or model call required`, and the pilot runs entirely in it.
- Five founder-led days rehearsing reviewed client import, prepaid package sale, matching treatment redemption, daily close, and recovery, with the founder on-site per the [acceptance checklist](acceptance-checklist.md).
- Their own measured numbers, before and after: the operating baseline plus `client_import_minutes`, `package_sale_minutes`, `treatment_redemption_minutes`, `package_balance_result`, `close_minutes_per_day`, `operator_corrections`, and `reload_and_retry_result`. The numbers belong to them.
- A backup of their workspace at the end (`Download workspace backup`), whatever they decide.

## What the partner gives

- One named operator's attention: the operator personally runs and reviews every pilot run, day 2 through day 5.
- Permission for the founder to observe at least three runs of their current manual process before day 1, with a timer, for the baseline.
- A few review minutes per day and an honest verdict on each run — an error recorded honestly is worth more to the pilot than a polite pass.
- An honest day-5 decision, in their own words.

## Their data stays theirs

- The pilot runs browser-local on the shop's own device. Setup states it directly: `Stays on this device. Nothing is sent or published.` SuperMega's servers receive no customer records, no sales, and no stock data during the pilot.
- The shop's identity stays private on SuperMega's side. The sales workflow's reporting boundary applies: notes leaving the private workspace carry stage and hashes, never the contact's name, email, or company (`docs/supermega-shop-sales-agent.md`).
- If the founder later approves hosted activation, the separate decision is `managed-production-activation`. It binds the dedicated runtime login, first named owner, exact production release, and managed activation window. The first Shop workspace is durable production data, not a disposable preview; rollback closes writes and suspends access without deleting the customer's records. That activation is not part of the five browser-local pilot days.

## Money

- No payment during the pilot. The readiness contract's does-not-authorize list includes `payment`, and the handoff's commercial draft records `paymentAccepted` as false with tax and payment terms unapproved. A fixed pilot fee exists only as draft text for a later, separate conversation.
- No price is quoted during the pilot; the public site carries no pricing.

## What the pilot never does

Read the app's own gate line together — it is the whole boundary in one sentence: `Browser-local sample only. Confirming creates a sample order and reserves sample stock in this browser. Payment and fulfilment stay pending for review in Orders. No payment is captured, no customer is contacted, no server or company account is written, and no real stock is moved.`

In the handoff generator's words: `This pilot does not include automatic customer messages, provider payment, accounting posting, deployment, or production activation.` And on results: `no improvement is guaranteed before the final review`.

Managed activation afterward is gated, not implied: `Managed activation proceeds only after identity, tenant isolation, recovery, and write controls pass for the company.`

## Stopping

- Either side can stop the pilot at any time, any day, for any reason. Nothing needs to be justified.
- If the pilot stops, the shop keeps its device, its data, and its backup; SuperMega keeps only the private evidence notes, under the same privacy boundary.

## What this outline deliberately does not contain

No uptime or availability promise, no delivery dates, no roadmap commitments, no exclusivity, no discount or future-price promise, no data-processing terms, no liability terms. If the pilot goes well and both sides want more, those belong in a real agreement drafted with proper advice.
