# Shop pilot runner field guide — for a runner who is not the founder

Read the other three kit documents first. This one does not replace them.

- [baseline-measurement.md](baseline-measurement.md) — the form you fill in with the owner before day 1.
- [acceptance-checklist.md](acceptance-checklist.md) — the five-day plan and what an accepted run means.
- [pilot-agreement-outline.md](pilot-agreement-outline.md) — what the partner gets and gives.

Those three are written as if the founder is standing in the shop. This one is
for the case where a **trained runner** is standing there instead. It covers
only what changes when the person on the floor is not the founder: how to spend
the hours, which numbers are real and which are your handwriting, what you must
never do, what to say when the product disappoints the owner, and what you hand
back on day 5.

**This document is a plan. Running it is a founder decision.** It authorizes no
customer contact, no deploy, no production write, no payment, and no billing or
entitlement change. It quotes no price, because none is approved.

**Five things the founder must settle before you go.** Do not start without
written answers; each one blocks a step you cannot improvise. They are listed
in section 8.

---

## 1. What you are, and what you are not

You are an **observer with a stopwatch and a notebook**. The named operator —
the shop's own person — does every action in the product. You never touch the
shop's device to make a record. You watch, you time, you write down, and you
ask short questions afterwards.

The product says the same thing in its own words on the Shop screens:
`Owner confirms orders, payments, refunds, deliveries, cancellations, and stock changes.`
That sentence is your job description in reverse. Everything it lists is the
operator's, not yours.

Three consequences worth stating plainly:

1. **If the operator is not there, there is no run that day.** A run the runner
   performed is not evidence. Record the day as having no runs and say why.
2. **You do not fix the shop's problem.** If the operator is stuck, you may read
   the screen aloud and point. You may not take the phone.
3. **You write down what happened, not what it means.** The founder decides what
   it means. Section 7 says what that looks like.

---

## 2. Before you travel

| Check | Done when |
| --- | --- |
| The founder has confirmed all four start gates | `isolatedNonProductionTenantApproved`, `namedOperatorAuthorized`, `pilotDataHandlingApproved`, `ownerReviewedCommercialDraft` are all true, so the private handoff reads `ready-for-private-pilot` and not `blocked-owner-review` |
| Dates are fixed | The review date is exactly the start date plus four days. The generator refuses anything else (`review_date_must_close_five_day_plan`) |
| The baseline form is filled in with the owner | At least three real runs of the current manual process, observed and timed by a person, not recalled |
| You have the answers from section 8 | In writing, from the founder |
| The workspace exists on the **shop's own device** | Created at `https://app.supermega.dev/settings/?product=shop` with the real name typed into `Business name`. Setup states `Stays on this device. Nothing is sent or published.` |
| The badge reads `Demo mode` | Check it on the sidebar. If it does not, stop and call the founder |

Carry: a watch with a second hand or a phone stopwatch, paper, two pens, and a
printed copy of the run sheet in section 4. Paper does not run out of battery
in a shop with an unreliable supply, and it does not need the shop's network.

---

## 3. The five days

### 3.1 How to set the clock

Do not plan against clock times before you arrive. Plan against the **shop's own
day**, and fix the real times with the owner in the first thirty minutes of day 1.

Every shop day has the same five parts. Ask the owner to name them:

| Block | What it is | What you do in it |
| --- | --- | --- |
| **A — before open** | Doors shut, staff arriving | Set up, talk, review yesterday |
| **B — first rush** | Busiest stretch of the morning | **Observe only.** No runs |
| **C — the quiet** | The slow middle of the day | Runs. This is where the pilot happens |
| **D — second rush** | Late-day busy stretch | **Observe only.** No runs |
| **E — close** | Doors shut, counting money | The daily close, timed |

Write the owner's real times into that table on day 1 and use it for all five
days. If the shop has no quiet block at all, that is itself a finding — record
it and call the founder, because a shop with no block C cannot supply four
accepted runs a day.

### 3.2 Day 1 — baseline, import review, and the shape of the week

**Done looks like:** the owner has re-confirmed the baseline numbers on site, the
client import has been reviewed row by row, and you can name block A through E in
real clock times. Zero product runs are expected today.

| Block | Hour by hour |
| --- | --- |
| A | Arrive before the shop opens. Introduce yourself to every person who will be near the counter this week, not only the operator. Say plainly: you are here to watch and time, you are not here to sell, and no money changes hands this week. |
| A | Confirm the sidebar badge reads `Demo mode` and the business name is right. |
| B | Stand where you can see the counter and stay out of the way. Time nothing. Count: how many customers, how many times the operator had to write something on paper, how many times a customer waited. This is your first real observation and it costs the shop nothing. |
| C | Sit down with the owner for the baseline re-confirmation. Read each number from the form back to them out loud and ask "is that still right this week?" Correct on the form; do not overwrite the original. Both versions go in the handback. |
| C | Review the client import **with the operator**, one row at a time. Duplicates, missing identities, invalid rows — resolve each before any sample data is applied. Start the stopwatch when the first row appears on screen and stop it when the last row is resolved. That number is `client_import_minutes`. |
| D | Observe only. |
| E | Watch the shop's **current** close — the paper one, the notebook, the counting. Time it. This is the honest comparator for `close_minutes_per_day` later in the week. |
| after | Write the day up before you sleep. A day written up the next morning is a day half lost. |

If the owner wants to see the product working on day 1, use the guided sample and
say what it is: a demonstration, not their shop's record. **Do not write a guided
sample down as a run.** See boundary 5.

### 3.3 Day 2 — the first real runs, and the package sale

**Done looks like:** four or more accepted runs recorded, each timed, each
reviewed by the operator; **one of those runs is the reviewed client's prepaid
package sale, settled so the payment is reconciled**; and a timed close.

The run, in the product, is exactly this sequence, and the operator does all of it:

1. On the `Sell` mode, tap items into the sale.
2. Choose the customer and the payment method — `Cash`, `KBZPay` or `WavePay`.
3. Tap `Review order`. The screen states what that does:
   `Confirm to create the order. Finish payment and handoff in Orders.`
   Stock is reserved. **Money has not been asserted to have arrived.**
4. In `Orders`, the operator settles the sale. The record's own summary text ends
   `paid and handed over`. That is the moment the sale is complete.

**Start the stopwatch** when the operator's hand touches the device to begin the
sale. **Stop it** when the settle action is confirmed. That is one value of
`median_minutes_per_order`. Write it on the sheet immediately, not from memory.

**The package sale is that same sequence with a different line on it.** The
vertical pack ships two prepaid packages: `Myanmar massage · 5 sessions`, SKU
`SPA-PACK-MASSAGE-5`, and `Facial treatment · 3 sessions`, SKU
`SPA-PACK-FACIAL-3`. Sell one of them to the client whose import row you reviewed
yesterday, **by name** — not to a walk-in, and not to `Guest`, because an unnamed
buyer earns no balance and tomorrow will have nothing to spend. Settling the sale
is what marks the payment `reconciled`, and nothing counts as a package until it
is settled. Time this run on its own and write it down as `package_sale_minutes`.
It is also one of the day's accepted runs; it does not replace them.

This is not a scheduling choice you are free to move. The generated handoff fixes
day 2 as `Spa services vertical pack package sale` and will ask you for the
reconciled sale by name. A day 2 without one hands the founder back a plan with a
hole where a proof should be.

| Block | Hour by hour |
| --- | --- |
| A | Ask the operator for one sentence about yesterday. Write it in their words. |
| B | Observe only. Count exceptions: anything that did not go the normal way. |
| C | **The package sale first**, while everyone is fresh: the reviewed client by name, a package SKU, settled through `Orders`. Time it end to end — that is `package_sale_minutes`. Do not book the treatment yet; that is tomorrow. |
| C | Then ordinary counter sales. Aim for five runs on the day counting the package sale, expect four. Between runs, say nothing except what the operator asks. Silence is a measurement instrument. |
| C | After each run, ask the operator two questions and only two: "was that right?" and "did you have to fix anything?" Their answer, not yours, decides whether the run is accepted. |
| D | Observe only. |
| E | The operator taps `Save daily close`. Time it from the first tap to the confirmed close. That is one value of `close_minutes_per_day`. |
| E | Note the close's own numbers: how many orders, and how many payment and stock exceptions it recorded. |

### 3.4 Day 3 — the treatment, the redemption, and one deliberate refusal

**Done looks like:** a completed treatment matching yesterday's package, one
redemption recorded against it, the refusal pair captured in writing, and a timed
close.

Yesterday's package is already paid for; today it gets used. The balance is not
something you compute: `spaMembershipBalances` projects the remaining sessions
from the reconciled orders and the redemption events. Read it off the screen.

| Block | Hour by hour |
| --- | --- |
| A | Agree with the operator which refusal pair you will rehearse today, and tell the owner it is being rehearsed on purpose so nobody thinks the product broke. |
| C | Book and complete the treatment that matches the package, then redeem the session. Time it end to end. That is `treatment_redemption_minutes`. Read the remaining sessions off the screen afterwards and write that number down: it is `package_balance_result`. |
| C | **The deliberate refusal.** Read 3.4.1 before you attempt it. The product refuses this by withholding the action rather than by printing a message, so the evidence you have to capture is not the evidence you would expect. |
| D | Observe only. |
| E | Close, timed. Note whether the counted money matched. |

#### 3.4.1 The refusal is a missing button, not a message

Expect no error text at all. This catches people out, so read it once slowly.

`Use package` is not a button that accepts a redemption and then judges it. The
screen builds `membershipByBookingId` first, and a booking earns an entry only
when every one of these holds: the booking is `completed`, no redemption has been
recorded against it already, and `spaMembershipBalances` reports a balance for
that exact client **and** that exact treatment with sessions still left. The
button is drawn only for a booking that has an entry. And `spaMembershipBalances`
counts a package only from an order that is `completed`, with `paymentStatus`
`reconciled`, and not refunded.

Follow that through and the mismatches you might have expected to stage all land
in the same place: for a wrong client, a wrong treatment, an unsettled package or
a refunded one there is no entry, so **there is no button to press**. Nothing
refuses you, because nothing is offered. Two of the four you cannot stage on day
3 at all — a package that was never settled earns no balance to mis-spend in the
first place, and the product will not let a completed, paid order be cancelled,
so you cannot refund yesterday's package to watch the entitlement be withdrawn.

So do not stand there waiting for a sentence to copy down. There is none, and a
runner who waits for one leaves the most important box on the sheet empty.
**The absence of the action is the evidence.** But absence is only evidence when
you can show the same screen offering the action a moment earlier, on a booking
that deserved it. So capture it as a pair, in this order:

| Half | What the operator does | What you write down |
| --- | --- | --- |
| **The covered treatment** | Complete the `Traditional Myanmar massage` booking for the client who holds `SPA-PACK-MASSAGE-5` — the redemption run above. | That `Use package` was present, and the session count shown on it. |
| **The uncovered treatment** | For the **same client**, on the **same day**, book and complete a `Facial treatment` — a service that client holds no package for. Look at that booking. | That no `Use package` is on it. The booking, the client, the treatment, and the clock time. |

One client, one screen, two bookings, one action offered and one withheld. That
is a refusal a reader can check, and unlike a note saying nothing happened it
cannot be mistaken for a screen that had not finished loading. If you would
rather vary the client than the treatment, complete a `Traditional Myanmar
massage` booking for a **different** client who holds no package and read that
row instead. Either way both halves must be on the screen at the same time.

**The line that matters most.** If `Use package` appears where it should not —
on the facial, on a client with no package, or on a booking whose session was
already used — stop. That is the single most important line you will write all
week. Write the booking, the client, the treatment and the exact button text
word for word, and call the founder the same day. The same applies if the
operator presses it and the screen takes a session it should not have taken.

Two smaller notes, neither of which is the day-3 evidence. Once a session has
been used, `Use package` disappears from that booking — the guard against
spending one session twice is the same withheld action, with a notice ending
`already used its package session.` behind it for a stale screen that gets there
first. And a package sold to an unnamed buyer produces no balance at all, which
is why day 2 insists on the client by name.

### 3.5 Day 4 — the close, the reload, and recovery

**Done looks like:** a reviewed close checked against the shop's paper book, a
reload proved mid-day, a retry that created no duplicate, and stock checked
against the shelf.

| Block | Hour by hour |
| --- | --- |
| C | Runs as normal, timed. |
| C | **The reload.** Mid-day, with records already made, the operator closes the browser completely and reopens it. Then the operator retries one step that was already done. Two things to write down: did the record survive, and did the retry create a second record or not. That is `reload_and_retry_result`. It has exactly three answers in the tool: passed, failed, or `not-tested`. Never guess. |
| C | One correction or refund boundary, rehearsed end to end, with the operator's own words on how they would have handled it on paper. |
| C | On `Stock`, check on-hand against what is physically on the shelf for a few items. A `Receive stock` rehearsal belongs here if a real delivery arrives. |
| E | The reviewed close. The operator runs the close; the **owner** checks the day's numbers against the paper day book, line by line. Time the close and write down every difference the owner found. The product makes this explicit: `Count every payment method. Any variance needs a responsible owner and a clear review reason before close.` |

### 3.6 Day 5 — comparison, backup, and the owner's decision

**Done looks like:** every measurement on the sheet has a value and a provenance
mark, the owner has given a decision in their own words, and the shop has its
backup.

| Block | Hour by hour |
| --- | --- |
| A | Total the sheet yourself before you speak to anyone: total runs, accepted runs, the longest unbroken streak of accepted runs. |
| C | Sit with the owner and the operator together. Read the baseline number and this week's number side by side, one measurement at a time. Do not lead. Do not say "so it is faster". Say "the baseline said X, this week said Y" and stop talking. |
| C | Ask for the decision in their own words. **Write the sentence in the language they say it in.** Do not translate it on the sheet; a translation is an interpretation and the founder needs the original. Note who said it and at what time. |
| C | The owner taps `Download workspace backup` and keeps the file. If they also want a readable copy of the week's sales for their accountant, `Download sales archive` produces a spreadsheet — it is a record to keep and read, not a file Shop can load back in. |
| D | Observe only. Say thank you and leave the floor alone. |
| E | Final close, timed, as on every other day. |

Nothing in the handoff contract lets you claim an improvement before this
review: `improvementClaimAllowedBeforeReview` is false. On day 5 you report the
comparison. The founder decides what it means.

### 3.7 When the shop is too busy to talk

This will happen. Plan for it rather than pushing through it.

- **Never start a run during a rush.** A run interrupted halfway is not accepted,
  and one non-accepted run resets the consecutive-accepted count to zero. A
  recorded hour of zero runs costs you far less than one bad run.
- **If a real customer arrives mid-run, stop the stopwatch and void the run.**
  The half-built sale itself survives — the counter keeps a draft on the device
  (`SHOP_COUNTER_DRAFT_KEY`), so the operator does not lose the basket — but the
  *timing* is dead. Discard it and observe another. This is the same rule the
  baseline form already uses for the manual process.
- **Busy is data.** In an hour when you cannot run anything, count instead:
  customers served, exceptions, times the operator reached for paper. This costs
  the shop nothing and it is the only way to get a real exception count.
- **Do not move the runs into the rush to hit a target.** If you finish the week
  short of runs, that is a true finding. A padded week is a false one, and a
  false one is worse than no week at all.
- **If two whole days are lost**, stop and call the founder. Extending, moving,
  or shortening the pilot is a founder decision, not yours.

---

## 4. The measurement sheet

### 4.1 The rule that makes this sheet worth anything

**Nothing in this pilot is measured automatically by the product today.** Two
authority documents promise an auto-measured baseline. That promise is not kept
in shipped code: nothing in the app computes any of the nine required
measurements. Anyone who tells you the numbers will appear by themselves is
working from the plan, not the product.

So every number on your sheet must carry a mark saying where it came from. Three
marks, and only three:

| Mark | Meaning | What you write |
| --- | --- | --- |
| **[P] the product tells you** | You read it off a Shop screen or an export. No stopwatch involved. | The number, and where on screen you read it |
| **[W] you watch and write it down** | The product could compute this one day but does not today. Your stopwatch or your tally is the only source. | The number, and that you timed it yourself |
| **[H] only a human can say** | This is a judgement, not a record. No future version of the product produces it. | The sentence first, the number second |

A sheet without these marks will produce numbers that look measured and are not.
That is the exact failure this whole kit exists to prevent, and it is worse than
a sheet with gaps in it. **Never write a number you did not see.** The generator
says it in one line and it is the rule of the week:
`Record failures and operator interventions; do not convert missing evidence into a success claim.`

### 4.2 The nine measurements, marked

The handoff contract requires exactly these nine. This is what each one really is.

| Measurement | Mark | Why |
| --- | --- | --- |
| `median_minutes_per_order` | **[W]** | The pilot means operator handling minutes. The order record carries no per-step timestamps, so this cannot be derived. The one shipped projection over order records measures something else — order-created to order-completed elapsed time, rounded down to whole **hours**. Wrong quantity, wrong unit. Your stopwatch is the only source. |
| `close_minutes_per_day` | **[W]** | `CommerceClose` stores one timestamp: the instant the close was saved. There is no close-start time, so the close's *duration* does not exist in the record at all. |
| `client_import_minutes` | **[W]** | A duration. Same reason. |
| `package_sale_minutes` | **[W]** | A duration. Same reason. |
| `treatment_redemption_minutes` | **[W]** | A duration. Same reason. |
| `weekly_exception_rate` | **[P] partly, under a narrower name** | Each `CommerceClose` records `paymentExceptionOrderIds` and `stockExceptionSkus` against its order count, so a **domain-recorded exception rate** is real and readable. What it cannot see is a problem the operator noticed and worked around without it ever becoming a record. Write the readable rate marked [P], and your observed count marked [W], as **two separate lines**. Never merge them. |
| `package_balance_result` | **[P]** | `spaMembershipBalances` projects remaining sessions from reconciled orders and redemption events. The number on screen is the record. Read it, do not recompute it. |
| `operator_corrections` | **[H]** | The product does store corrections, but they are **financial** ledger entries with money reason codes. Whether an edit was the operator fixing their own slip or a legitimate business change is a judgement the record does not carry. Counting those entries and calling them operator corrections would be a mislabel. Ask the operator after each run and write their answer. |
| `reload_and_retry_result` | **[H]** | "This operator, on this device, on this day, reloaded and retried and the record survived." That the system replays safely is provable by test; that this person saw it happen is not. Only three answers exist: passed, failed, `not-tested`. |

**Two [P], five [W], two [H].** Nothing here is going to fill itself in.

### 4.3 The run sheet

One row per run. Copy this onto paper before you travel.

| Field | Notes |
| --- | --- |
| Run number | Sequential across the whole week, never restarting per day |
| Day (1–5) | The tool only accepts 1 through 5 |
| Time started | Clock time, not elapsed |
| Minutes taken | **[W]** — from your stopwatch |
| Which run type | Counter sale, package sale, redemption, close, or recovery |
| Operator reviewed it? | Yes / No. If No, the run is not accepted |
| Operator says it was correct? | Their word, not yours |
| Corrections needed | **[H]** — the sentence, then the count |
| Wrong-target actions | Must be zero. Anything else, write what happened and call the founder |
| External effects | Must be none: no real message, no real payment, no real stock move |
| **Accepted?** | Yes only if every line above holds |

**The streak matters and nobody will tell you at the time.** The evidence tool
computes `acceptedConsecutiveRuns` from the end of the list backwards, and only
sets `promotionEvidenceMet` at **twenty consecutive accepted runs**. Day 1
produces none. That leaves four days to produce twenty unbroken — five a day,
with no failures. One non-accepted run in the file resets the count to zero —
and a run the file will not accept at all does not reset it, which is worse; see
caution 3 in 4.4. Know this on day 2, not on day 5. It is not your job to
protect the streak by hiding a bad run; it is your job to know what the streak
means, and what it quietly leaves out, when you hand it back.

### 4.4 The evidence tool, and why you may not be able to use it live

There is a shipped recorder: `tools/record_shop_pilot_observed_run.mjs`, run as
`client:pilot:observed-evidence` with `--record` and `--workspace`. It writes
`observed-runs.private.jsonl` and `observed-summary.private.json`, refuses a
duplicate `runId` (`shop_observed_run_id_duplicate`), rejects any file where a
stored row has been edited after the fact, and returns counts — `runCount`,
`acceptedRunCount`, `acceptedConsecutiveRuns`, `promotionEvidenceMet` — with no
private identity in them.

Understand exactly what it is: **a tamper-evident place to put your handwriting.**
It reads nothing from the product. Every one of its numbers —
`durationMinutesPerOrder`, `exceptionCount`, `closeMinutes`,
`operatorCorrectionCount`, `reloadRetryOutcome` — is typed in by a person. It
does not make anything measured. It makes what you attested hard to alter later,
which is a real and different kind of value.

Three cautions, and the third is the one that costs you if you miss it.

1. **It covers five of the nine measurements.** `client_import_minutes`,
   `package_sale_minutes`, `treatment_redemption_minutes` and
   `package_balance_result` have no field in it. Those live on paper, and they
   must reach the handback some other way.
2. **Two of its required fields have no documented meaning anywhere in the
   repository:** `evidenceReferenceDigest` and `independentAnchorDigest`. Until
   the founder rules on what each is a digest *of* (section 8), do not invent an
   answer and do not run the tool live. Instead, on every run, write down the
   literal strings a digest would be taken from — including the order's own
   `evidenceReference` value — so that whatever the founder decides, the rows
   that *can* be loaded can be loaded afterwards **without anyone going back to
   the shop to ask**. Read caution 3 before you assume that means all of them.

3. **It cannot hold every run, and this is the limit that will bite.** Of the
   judgement fields the recorder demands, only `accepted` may be false — it is
   the one field checked with an ordinary boolean test. `operatorReviewed` and
   `targetCorrect` are checked with `exactTrue`, which accepts nothing but
   `true` and otherwise refuses the whole row on `operator_reviewed` or
   `target_correct`. The same exact-`true` test guards `noRealMessageSent`,
   `noPaymentAccepted`, `noStockMovement`, `noServerWrite` and `noHostedWrite`.

   Read what that means. The two worst things a run can do — the operator never
   checked it, or it landed on the wrong record — are precisely the two the file
   can **never** carry, no matter what the founder later rules about the
   digests. A run that ends that way is not "pending a decision". It is not
   loadable, and no future decision makes it loadable. Neither is a run that
   moved real stock, sent a real message, or wrote to a real server.

   Do not let that silence read as a clean week. A refused row does not merely
   go missing: the streak is counted from the end of the recorded list
   backwards, so the good runs on either side of the gap join up and report a
   longer unbroken run than actually happened. `acceptedConsecutiveRuns` would
   then be an overstatement produced by the tool's own admission rules, and
   nobody reading the file afterwards can see the hole. So:

   - Write the run up on paper in full, exactly as section 4.3 requires. The
     paper sheet, not the tool, is the record of the week.
   - Mark it on the sheet **not loadable**, and name the field that failed —
     review, or target, or which boundary it crossed.
   - In the handback, put the tool's `acceptedConsecutiveRuns` and the true
     streak from your sheet side by side whenever they differ, and say which is
     which. The tool's number is not wrong; it is answering a narrower question
     than the owner is asking.
   - A run that *was* reviewed and *did* hit the right record but failed for any
     other reason — an exception, a correction, a time nobody is happy with —
     belongs in the file with `accepted` false. Those the tool handles honestly,
     and those are the ones that should break the streak inside it.

---

## 5. The boundaries — stop and call the founder

These are not office rules. Each one exists because crossing it does damage that
cannot be undone by apologising. Read the reason, not only the rule; a rule whose
reason you understand survives a shop floor, and one you memorised does not.

**1. If you are about to say that money arrived — stop.**
Confirming a payment is an assertion that money actually reached an account.
Only a person who can see that account can make it. The product splits this on
purpose: creating an order reserves stock and asserts nothing about money, and
settling it is a separate, human, one-review action. During the pilot no payment
happens at all; `payment` is on the readiness kernel's forbidden list and the
handoff's own commercial draft records `paymentAccepted` as false. If the owner
hands you cash, or asks you to confirm a transfer landed, or asks you to accept
a pilot fee — you say you cannot, and you call the founder.

**2. If you are about to say a price — stop.**
No price is approved. Not a monthly figure, not a pilot fee, not a discount, not
"probably around", not a range, not "cheaper than what you use now". Setting a
price is a commercial and legal act and it belongs to the founder alone. The
handoff generator does require a fee number (`fixedPilotFeeUsd`) and prints it in
the private draft — that draft is between the founder and the owner, and its tax
and payment terms are explicitly unapproved. Your line is: "I do not set prices.
I will write your question down and the founder will answer it directly."

**3. If you are about to contact a stranger — stop.**
The pilot covers the owner and the named operator. Anyone else — a supplier, a
customer, another shop the owner recommends, a relative, a friend who "also has a
shop" — is outreach, and consent to contact a stranger cannot be delegated to
you. The readiness kernel lists `customer_message` in what is forbidden until
ready. Take the name down, hand it to the founder, contact nobody. This also
means no photos of customers and no customer names leaving the shop.

**4. If you are about to connect anything to anything — stop.**
The pilot is browser-local on the shop's own device. `deploy`, `publish`,
`production_write` and `hosted_scheduler_activation` are all forbidden until
ready, and arming a real database is the hardest step in the company to reverse:
once real customer tenants exist, they exist. If you find yourself signing into a
company account, moving the workspace to another machine, uploading a backup
anywhere, or being asked to "put it online so head office can see it" — stop and
call the founder. `Demo mode` on the sidebar is the check that you are still
inside the boundary.

**5. If a sample is about to be recorded as real — stop.**
Guided samples exist so an owner can see the product work before they have their
own data. They must never fabricate a record that earns a product its proof.
Sample records are identified by an `actionId` prefix (`ACT-GUIDED-SAMPLE-`) —
never by whose name is on them, because names are display text and get rewritten.
So: a guided sale is a demonstration, never a run on your sheet. The contract is
explicit that `sampleEvidenceCanCloseGate` is false. And do not type real
customer names into sample data to "make it realistic" — that mixes a person's
real identity into a record that exists to be thrown away.

**6. If real goods or real money are about to move — stop.**
`stock_move` and `payment` are both forbidden. Nothing you do this week may take
an item off a shelf, put one back, open the till, or change what the shop
actually owes or is owed. If the operator needs to serve a real customer, they
leave the pilot run and serve them — see section 3.7.

**7. If you are about to write a number you did not see — stop.**
This is the boundary that decides whether the entire week was worth anything.
A missing measurement is recorded as missing. An interrupted run is recorded as
not accepted. A day with no runs is recorded as a day with no runs. Every one of
those is a usable result. An invented number is not a weaker result — it is a
poison, because the founder cannot tell it apart from a real one and will make a
decision on it.

**8. If you are about to promise something — stop.**
No feature, no date, no "we can add that", no uptime, no exclusivity, no future
price. Section 6 is how you answer instead.

---

## 6. When the product disappoints the owner

It will. Three gaps are known and real. Your job is an honest, non-defensive
answer and an accurate note — not a save. An owner who hears a straight "no, not
yet" trusts the next sentence you say. An owner who hears a soft "yes, soon"
stops believing all of it.

The shape of every answer is the same: **what it does today, what it does not do,
what that costs you this week, and I will write your question down.**

### 6.1 "It cannot print my receipt on my printer"

**What is true today.** Shop has a `Print receipt` action. It opens your device's
own print dialog with a document laid out for a **roll**, not a sheet — the layout
adapts to narrow rolls and to sheet paper separately, so it is not the
full-page receipt it used to produce.

**What is not true today.** Shop does not talk to a thermal printer directly.
Whether your device's printing service reaches your particular printer has never
been tested — **no SuperMega receipt has ever been printed on a thermal printer at
all.** And the document it prints is an order record for evidence, not a customer
slip: it carries record identifiers, it is in English, and it says on its face
`Not a tax invoice, receipt, or payment confirmation.` A customer-facing slip with
your shop's name on it and no record identifiers is a separate thing that does
not exist yet.

**What to say.** "It can print, through your phone or tablet's own printing, and
the paper layout is built for a roll. We have never tested it on a printer like
yours. If your printer is here, let us try it today and I will write down exactly
what came out — a real result on your printer is worth more to us than a promise,
and I cannot promise you the direct-to-printer version."

**What to record.** Printer make and model, how it connects, what the print dialog
offered, what physically came out, and whether the owner considers the result
usable. This is a genuinely valuable half-hour.

### 6.2 "My staff cannot read this — it is in English"

**What is true today — and be careful which words you point at.** Thirty-three
common action words are signed off by a native speaker, but **only five are
actually wired to a control that exists**: `Cancel`, `Close`, `Open`, `Back` and
`Clear`, across seven places. Those five render as English, a middle dot, then
Burmese. The other twenty-eight are signed off and have no call site anywhere, so
they render nothing — do **not** name `Save`, `Receive`, `Return`, `Export` or
`Complete` as examples, because an owner who goes looking for them will find
English and you will have been wrong in front of them.

The owner's **own** product names can carry Burmese today, with one distinction
worth keeping straight. The plain `Item name` field is free text, so a
Burmese-only product name works immediately and shows on the tile, the sale line
and the receipt. What no form can set is the *bilingual pair* — English and
Burmese on the same row. That pair is written only by the working-sample and
business-template provisioning, for rows that sell a bookable service, which is
why the shipped spa template already carries names such as
`စပါ အလှပြင်ဆိုင်` and a mini-mart's rice and oil do not.

**What is not true today.** Most of what a cashier actually reads at the counter
is still English on purpose. The four work modes (`Today`, `Sell`, `Orders`,
`Stock`), `Total`, `Payment`, `Create order`, `Print receipt` and the rest of the
counter have Burmese drafted, but each is marked `pending_native_review`, and the
app deliberately shows English for anything not marked `confirmed`. That is a
choice: an unchecked Burmese word on a button a cashier taps all day is worse
than an English one, because the cashier cannot tell it is wrong.

**What to say.** "The words your staff read most already have Burmese written for
them. We do not show it yet because no Burmese speaker has checked it, and we
would rather show you English than a wrong word. Your own product names can be in
Burmese today — let us put a few in now and see. And if you or one of your staff
would sit for an hour and check our Burmese against what you would actually say
at a counter, that is the single fastest way to make this Burmese, and I will
take that back with me today."

That offer is a real one and it is inside the pilot: it involves the owner and
their own staff, nobody outside. Do not extend it to anyone else — see boundary 3.

**What to record.** Which specific words the operator stumbled over, in order.
Which they read fine in English. Whether the owner would supply a reviewer.

### 6.3 "It does not know when a KBZPay or Wave payment arrives"

**What is true today.** The three payment buttons at the counter are `Cash`,
`KBZPay` and `WavePay`. The owner can store their own merchant QR on the device
and show it beside the amount due at the exact moment of payment, so the customer
scans it in their own banking app. And the daily close forces a real count:
`Count every payment method. Any variance needs a responsible owner and a clear review reason before close.`

**What is not true today.** Shop has no connection to any payment provider. It
reads no payment status and writes none. The product says so in the QR dialog
itself:
`The customer scans this code in their own app and types the amount themselves. Check the confirmation on their screen — payment review in Orders stays manual, exactly as before.`

**What to say.** "Shop will never tell you the money arrived. You will. It does
not talk to KBZPay or Wave and it does not pretend to. What it does is make the
count at the end of the day show you a difference instead of hiding one, and make
somebody put their name against that difference. If you want the bank to tell the
app directly, that is not built, and I am not going to tell you when it will be."

**What to record.** How the shop reconciles non-cash today, how long it takes,
how often it is wrong, and what the last mistake cost. That is a baseline number
nobody has, and it is more useful than the objection.

### 6.4 How to record any objection so it reaches the roadmap

One line per objection, on its own page of the sheet. Six fields, and no seventh:

| Field | Rule |
| --- | --- |
| Day and block | 3, block C |
| What the owner was trying to do | The task, not the feature they asked for |
| Their exact words | **In their language. Transcribe, do not translate.** |
| What it cost them | Minutes, money, or nothing. If nothing, write nothing |
| Would they still use Shop with this gap? | Their answer, yes/no/unsure, plus one sentence |
| Did you promise anything? | Must be "no" |

Never rank them. Never write "we should build X". You did not see the roadmap and
neither did the owner. The founder ranks.

---

## 7. The handback

The test of a good handback is one sentence: **the founder can make a decision
from it without going back to the shop to ask anything.** Assume you will not be
available and the shop will not answer the phone.

One folder or one envelope, five things, in this order.

**1. The baseline, both versions.** The form as filled before day 1, and the day-1
on-site re-confirmation. Never overwritten — the founder needs to see what moved
between them.

**2. The run sheet, complete.** Every run, in order, including the ones that were
not accepted and the hours with no runs. At the top of the sheet, three totals you
worked out yourself: total runs, accepted runs, longest unbroken run of accepted
runs. If any hour or day has no runs, one line saying why — "block C did not
happen on day 4, wholesale delivery" is a complete answer.

**3. The nine measurements, each with its mark.** One page. Nine rows. Each row:
the measurement name, the value, its mark **[P] / [W] / [H]**, and where it came
from in one phrase. Keep the domain-recorded exception rate and your observed
exception count as two separate rows. If a measurement has no value, the row says
so — an empty row is a result and a filled-in guess is not.

**4. The owner's decision, in their own words.** The sentence as they said it, in
the language they said it in. Who said it, when, and who else was in the room. If
you want to add an English rendering, put it underneath and label it as yours.

**5. The objection list.** Section 6.4's six fields, one line each, unranked.

**And then a single cover page, and nothing more.** On it: the five dates, who was
present, what did **not** happen and why, and the four boundary confirmations
that no real message went out, no payment was accepted, no real stock moved, and
nothing was written to any server. Those four are exactly what the evidence tool
demands anyway, so they must be true before you write them.

**Write no recommendation.** Not "I think they will buy", not "this went well".
You saw one shop for five days; the founder is deciding across the whole company
and has context you do not. A runner who reports and does not conclude is
trusted with the next pilot. If the founder wants your opinion they will ask you
for it, and then you give it out loud, not on the sheet.

**If the founder settled the digest questions in section 8**, also hand over the
evidence-tool files — `observed-runs.private.jsonl` and
`observed-summary.private.json` — and say which of the nine measurements are
*not* in them. If the questions were not settled, hand over the paper plus the
literal strings, and say plainly that the tool was not run and why.

**Privacy, on every page.** The shop's identity, the operator's name, customer
names and any photograph stay in this private handback. They do not go into a
message, a report, a chat, or anywhere else. The sales workflow's rule applies to
everything in this kit: what leaves the private workspace carries stage and
hashes, never a name, an email, or a company.

---

## 8. What the founder must settle before day 1

Five open questions. Each blocks something. None is yours to answer.

**1. What are `evidenceReferenceDigest` and `independentAnchorDigest` digests of?**
The evidence tool requires both on every run and validates their shape, but no
document in this repository defines what either one refers to. Until this is
answered the tool cannot be used correctly in the field — see 4.4. *Blocks:*
recording runs in the tool as they happen.

**2. Is this partner a spa?** The handoff generator currently accepts exactly one
vertical pack (`spa-services`) and one profile (`spa-prepaid-membership-v1`) and
throws on anything else. A general retail counter pilot — one where the flow is a
counter sale, a stock receipt, a daily close and an accountant handoff, with no
prepaid packages at all — **cannot produce a handoff packet today.** If the design
partner is not a spa, the founder decides what happens before you travel. *Blocks:*
the whole packet, and four of the nine measurements.

**3. Are twenty accepted runs expected in five days?** The tool sets
`promotionEvidenceMet` only at twenty consecutive accepted runs, and day 1
produces none. Either the five-day pilot is expected to reach twenty (five a day,
four days, no failures), or it is explicitly a partial contribution to a longer
count. The runner must know which before day 2. *Blocks:* what "done" means.

**4. How does a runner sign?** The baseline form has a field for "Founder
recording this baseline" and no field for anyone else. The founder decides how a
non-founder observer is named on the record, and whether the founder
counter-signs. *Blocks:* the baseline form.

**5. What exactly may be said about commercial terms?** The answer may well be
"nothing", and if so say so in writing, because "nothing" is much easier to hold
on a shop floor than a boundary the runner has to judge. *Blocks:* boundary 2.

---

## 9. What this document does not do

It authorizes no customer contact, no deploy, no production write, no migration,
no release dispatch, no billing or entitlement transition, and no gate change. It
quotes no price. It proposes no change to any hard limit. It invents no Burmese —
every Burmese string it shows is quoted from a source file already in this
repository. It names no real shop, no real person, and no real result. The
five-day rehearsal it describes runs on browser-local data on the shop's own
device and cannot, by itself, close the `shop-spa-owner-pilot` gate in
`hq/portfolio.json` or satisfy `acceptanceEvidenceRequired`; the authenticated
run on an isolated hosted tenant remains a separate step behind the founder
decision `managed-production-activation`.
