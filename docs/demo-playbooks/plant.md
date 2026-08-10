# Plant — client proof playbook

## 1. Client and the 30-second pitch

Who this is for: factories and workshops that plan production jobs, record output and material use by shift, contain problems, and leave an accountable handoff.

The short pitch:

- `Operating software for Myanmar companies.`
- `Plan jobs, record output, and close shifts.`
- Start with the client's reviewed jobs, prove one shift action, and keep consequential changes behind a named review. `Machine control and live production writes stay behind review.`

## 2. Pre-demo setup

1. Open `https://app.supermega.dev/settings/?product=plant`.
2. Under `Name your workspace`, enter the client's name in `Business name`.
3. Open `Bring existing data`. It is required before Plant. Download `Download CSV template`, replace the example with the client's opening jobs, and choose the completed CSV.
4. Check `Column matching` and `Review rows`, approve the clean rows, then use `Confirm import`. Nothing should open Plant until the reviewed rows are accepted.
5. Open Jobs with the accepted row count. Confirm the first screen says `Local production plan` and `Local business records on this device`; no built-in or industry-sample job should remain.

## 3. Demo script

1. Begin on Jobs. The `Start here` panel should point to the first incomplete action for the reviewed production plan.
2. Choose the current client job and use `Record output`. Enter a small, truthful good-output quantity rather than completing the target for theatre.
3. At the accountable gate, retain the imported job owner or `Business owner`, add the real reason and evidence reference, and confirm `Record output`.
4. Reload the page and show that the same job, output, owner, shift, and local plan recover without a second entry.
5. Continue with `Record material use` for the same job and shift. The material trace must agree with the production record before close is available.
6. Open Problems and show that quality, critical/high problems, downtime, or maintenance exceptions prevent an accountable close.
7. Return to Jobs. Only when output, material trace, and blockers are valid should the owner receive `Close shift`; review the named person, reason, evidence, and shift reference before confirmation.

## 4. Objection handling: the boundary

"Is this another fake demo?" — the primary path begins with reviewed client job rows. An untouched built-in or industry sample is replaced, while a changed workspace fails closed instead of silently mixing records.

"Can we explore without a file?" — `Just exploring?` keeps `Industry demo is optional`. Choose one of the five industry packs and use its demo button; the resulting workspace stays explicitly labelled `Local sample records on this device`.

"Where does client data live?" — this current trial says `Local business records on this device`. It is browser-local evidence, not proof of hosted persistence, tenant isolation, backup, or production activation.

"Who is accountable for a bad entry?" — consequential actions use exact gates such as `Record output`, `Record material use`, and `Close shift`, with a named person, reason, and evidence reference. The on-screen boundary remains `Plant changes require accountable review.`

## 5. The close

- Self-serve proof: open `https://app.supermega.dev/settings/?product=plant`, import reviewed jobs, and complete one recoverable output action on the supervisor's phone.
- Assisted setup: `Set up Plant data` opens `/contact/?product=plant`; the founder can prepare the CSV with the client without claiming a managed deployment.
- Inside the app, the setup handoff can use `https://supermega.dev/contact/?product=plant&template=production-control&utm_source=app&utm_medium=guided_trial`.
- Managed pilot: `/contact/?product=guide&source=managed-intelligence` remains owner-gated until identity, isolation, recovery, write control, and a named operator are proven.
