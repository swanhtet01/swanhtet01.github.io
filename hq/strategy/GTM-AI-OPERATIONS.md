# GTM & AI operations — lead-gen, AI-employee design, and drafted outreach

Status: first pass, 2026-08-19. Written at the founder's direction to turn
"strategy and marketing and social media" into a concrete, executable plan.
**Nothing in this document has been sent, posted, or contacted.** No real
email went out and no real social post went live from the work that produced
this file. Every claim about the product is traced to `MARKETING-POSITIONING.md`
and its do-not-say list (section (e) there), which is binding on everything
drafted below. Every claim about hosted/self-serve state is traced to
`hq/readiness/managed-pilot-readiness.json` and `SELF-SERVE-ONBOARDING-SPEC.md`.
This document does not repeat `MARKETING-POSITIONING.md`'s content — it cites it.

---

## (a) Where Myanmar SME owners actually are, and what's realistic to automate

**The channel reality, stated plainly, not aspirationally.**

Myanmar small-business marketing runs overwhelmingly on **Facebook** — Facebook
Pages and Facebook groups are where SMEs in this market post their own products,
find suppliers, and get found by customers. This is not a stylistic preference;
it reflects actual mobile data usage and platform penetration in Myanmar, where
Facebook has functioned as something close to "the internet" for small business
for years. Twitter/X and LinkedIn are not where Myanmar SME owners spend time
doing business — defaulting to them because Western GTM playbooks default to
them would be importing the wrong market's channel mix. This document does not
do that.

Beyond Facebook, three channels matter for this segment specifically:

- **Viber and Telegram business/community groups** — widely used for supplier
  coordination, trade-association chatter, and word-of-mouth referral in
  Myanmar SME circles. Reaching these well requires being *in* the group as a
  known, trusted participant, not broadcasting into it as an outside sender —
  cold posting into a Viber/Telegram group with no relationship reads as spam
  and burns trust in a group that will likely still contain the same forty
  people in a year.
- **Local business directories and trade-association listings** — slower,
  lower-volume, but a channel where a business's presence signals legitimacy
  to other business owners in a way a cold Facebook ad does not.
- **Physical presence and referral** — trade associations, market
  co-location, word of mouth between shop owners who know each other. This is
  the channel that closes deals in this market. It is also the channel that
  cannot be automated by an AI agent at all; it requires the founder (or a
  future human hire) actually showing up.

**The honest assessment: automation reach vs. relationship reach.**

Myanmar SME sales in this specific market leans heavily on trust and local
presence. This document says that plainly rather than overselling what
automation can do here. A well-drafted Facebook post or a well-targeted
outreach message can *open* a conversation — it can surface the product to
someone who would not otherwise have heard of it, and it can save the founder
research time finding who to talk to. It cannot *close* a Myanmar SME owner
on trusting a new business tool with their sales, stock, and money records.
That close happens through a human conversation, usually more than one, often
helped by a shared trade association, a mutual acquaintance, or simple
repeated visibility over time. Treat AI-assisted lead-gen and outreach as
**pipeline generation**, not as a substitute for the founder's own relationship
work. Any plan that promises "AI closes deals" for this segment is not
grounded in how this market actually buys, and this document does not make
that promise.

What's realistic to automate, concretely:

- Finding and cataloguing candidate businesses that fit the ten trade-card
  profiles in `MARKETING-POSITIONING.md` (c) — mini-mart, pharmacy, phone shop,
  fashion, hardware, tea shop, auto parts, restaurant, spa, bakery — via public
  web search, public Facebook Page listings, and public directory listings.
- Drafting outreach copy, follow-up copy, and social posts for founder review.
- Tracking, in a plain reviewable list, who has been contacted and when — once
  the founder has approved a real send.

What is not realistic to automate, and this document does not pretend otherwise:

- Building the actual trust that gets a Myanmar SME owner to hand over their
  daily sales record to a new tool.
- Engaging naturally inside a Viber/Telegram community group as a member
  rather than an outside broadcaster.
- Any in-person trade-association or market-floor relationship work.

---

## (b) AI-employee operating design

This section proposes a small set of specialized agents, each with a narrow
job, modeled on the same discipline the product itself uses for guided
samples: **propose, never fabricate; a human confirms before anything counts
as real** (see `MARKETING-POSITIONING.md` (e).13 and the guided-sample
identification rule in `CLAUDE.md`). No agent below is authorized to contact
a real person, post to a real account, or send a real email. Every step that
touches a real external party has an explicit founder-approval checkpoint
before it, named below.

### What tools exist today vs. what's missing

Available in this environment today, usable by an agent right now:

- Web search / web research, for finding candidate businesses and their
  public contact information (a Facebook Page, a phone number, a listed
  address).
- Drafting text — outreach emails, follow-ups, social posts — as files or
  artifacts for review.
- Reading this repo's own source-grounded facts (`MARKETING-POSITIONING.md`,
  the readiness ledger, the pricing document) so drafted copy stays truthful.

Not available today, and required before any real outreach can go live:

- **A real CRM or lead database.** Today a "lead list" produced by an agent is
  a plain file (e.g. a table in a document) for the founder to review — not a
  system that tracks status, dedupes, or prevents double-contacting someone.
  Building or connecting a real lead tracker is future infrastructure work,
  separate from this document.
- **A connected social media posting account.** No Facebook Page posting
  credential is connected to this environment. Nothing here can publish a
  post; it can only draft one.
- **A connected outbound email sending identity, with the founder's real
  consent to send under it.** This session has Gmail *tool access* available
  in principle, but using it to send real outreach requires the founder to
  explicitly decide which address sends, review what it sends, and consent to
  sending under their name/brand to real strangers — that consent has not
  been given for this task and this document does not treat tool
  *availability* as tool *authorization*.
- **A way to track replies.** Once a real email or message goes out, someone
  will reply. There is currently no defined inbox-monitoring or
  reply-routing process for outbound GTM messages (the existing
  `CUSTOMER-SUPPORT-RUNBOOK.md` covers inbound support from the contact form,
  not outbound sales replies) — this is a gap to close before real volume,
  not before a first hand-reviewed test.

### Proposed first architecture: three narrow agents

**1. Lead research agent.**
Job: given a target trade-card profile (e.g. "mini-mart owners in a given
township") and a channel (Facebook Page search, public directory), find
candidate businesses and produce a reviewable list: business name, trade
type, public contact surface found (Facebook Page URL, phone, or listed
email if publicly posted), and a one-line note on why this business fits one
of the ten trade-card profiles. Output: a plain document, nothing more.
**Never contacts anyone.** Never marks a lead as "outreach sent" — that state
only exists after a human sends something.

**2. Content drafting agent.**
Job: given the lead research agent's output or a general request, draft
outreach emails, follow-up emails, and social posts, using only claims
traceable to `MARKETING-POSITIONING.md` and never violating its do-not-say
list. Output: drafts, clearly labeled DRAFT — NOT SENT. Section (c) and (d)
below are this agent's first output.

**3. Follow-up sequencing agent.**
Job: for a lead where the founder has approved and sent an initial message,
propose the next touch (a single follow-up, per the do-not-say list's ban on
pressure language — no drip campaigns, no cadence of nagging) and draft it.
**Only fires after a founder has approved the initial send** — it has no
authority to originate a first contact, and no authority to send its own
draft; it hands the draft back for the same founder review every other
outbound message gets.

### The founder-approval checkpoints (the actual control)

| Step | Who/what does it | Approval checkpoint before it |
| --- | --- | --- |
| Find candidate businesses | Lead research agent | None needed — pure research, no external write, same class as `safeAutomatedActions` in the readiness ledger |
| Produce a reviewable lead list | Lead research agent | None needed — output is a document, not a contact |
| Draft outreach/follow-up copy | Content drafting agent | None needed — a draft is not a send |
| Draft social posts | Content drafting agent | None needed — a draft is not a post |
| **Send a real email to a real business** | Founder | **Required, every time, per message or per approved batch — see checklist in (e)** |
| **Post to a real social account** | Founder | **Required, every time, per post or per approved batch** |
| Draft a proposed follow-up after an approved initial send | Follow-up sequencing agent | None needed to draft — a draft is not a send, same as row above; requires the founder to have already approved the original send it follows |
| **Send that follow-up** | Founder | **Required every time, the same per-message review as any other outbound email — the agent never sends its own draft, "approving the sequence design" once does not stand in for reviewing the actual follow-up text** |

This mirrors the product's own `ProductionActionProof` discipline described
in `CLAUDE.md`: an agent proposes, a human actor confirms, and nothing
"counts" — here, nothing is *sent* — until that confirmation exists. The
readiness ledger's own `forbiddenUntilReady` list (`customer_message` among
them) is the same principle applied to the hosted platform; this document
applies it to GTM.

---

## (c) Drafted trial-invitation emails — four trade drafts

Grounded in `MARKETING-POSITIONING.md` (a), (b), and the free-forever list.
Honest about local/no-account status per `SELF-SERVE-ONBOARDING-SPEC.md` (no
hosted self-serve signup exists yet — this points at the local product only).
No pressure language, no invented statistics, no fake testimonials, no price.

Four drafts follow: the original generic draft (usable as-is for a mini-mart
or any other trade), then three trade-specific variants — pharmacy,
restaurant, hardware — added 2026-08-19. Each variant reuses the generic
draft's opening, closing, and setup-link boundary text verbatim. Two things
change per variant and both need founder review as new claims: the middle
capability bullets, and a trade-specific clause inserted into the sample-shop
line naming the staged sample that trade's template actually ships (the
clinic wholesale order, the family table booking, the site-delivery order).
Every changed line is traceable to that trade's own card in
`MARKETING-POSITIONING.md` (c). The
`[trade-specific setup link]` placeholder mechanism documented after the
generic draft applies to every draft in this section.

### (c).1 Generic — mini-mart and any other trade (original draft, unchanged)

**DRAFT — NOT SENT, PENDING FOUNDER REVIEW.**

> **Subject: A free till and daily-close tool for [business name] — no account, works offline**
>
> Hello [owner name],
>
> I'm reaching out because [business name] looks like a [mini-mart / pharmacy
> / tea shop / etc.] — is that right?
>
> I've been building a free tool called SuperMega for shop owners like you.
> It runs on your own phone or laptop, needs no account to try, and keeps
> working even when the internet is down, because your records stay on your
> own device.
>
> What it does today, for free, for as long as you use it:
>
> - Ring up a sale — cash, KBZPay, or WavePay — and watch your stock update
>   on its own.
> - See what's running low before a customer asks for it.
> - Count your drawer at the end of the day against what the day should
>   hold, and keep a note of any difference.
> - Hand your accountant a set of records that add up, instead of a
>   notebook only you can read.
>
> It comes with a sample [mini-mart / pharmacy / etc.] shop already loaded,
> so you can see how it works before you type anything of your own in.
>
> You can try it here, right now, with no sign-up: [trade-specific setup link]
>
> If you'd like to talk it through first, or you're not sure it fits your
> shop, just reply to this email — I'm happy to explain more or answer
> questions.
>
> Thank you for your time,
> [Founder name]
> SuperMega — supermega.dev

**Why each claim is safe:** "free," "no account," "works offline" — (a) and
(b) of `MARKETING-POSITIONING.md`, backed by the service worker and
device-storage citations there. Counter sale / stock fall / KBZPay / WavePay
— the `shop-counter` free-forever row. Low-stock — `shop-inventory` row.
Daily close — `shop-daily-close` row, quoted verbatim spirit ("charging for
it would be charging for honesty," not repeated here but consistent with
it). Accountant handoff — `shop-accounting-handoff` row. Sample shop already
loaded — section (c) of the positioning doc, ten trade cards. No mention of
premium, AI intake, managed workspaces, or any capability gated per section
(e) of the positioning doc. No price. No "trusted by," no invented user
count, no testimonial.

**[trade-specific setup link] is a placeholder to fill in, not a literal
URL to use as-is** — this is the finding a reviewer correctly caught: the
plain `app.supermega.dev/shop/` route opens the generic seed workspace, not
the trade sample the email just promised (a pharmacy prospect would land on
"Daily essentials basket" instead of pharmacy items). The app already has a
canonical helper for exactly this, `shopBusinessTemplateSetupPath(id)`
(`showroom/src/products/shop/business-templates.ts:559-561`), which builds
`/settings/?product=shop&template=${id}` for a given
`ShopBusinessTemplateId` (`bakery`, `pharmacy`, `mini-mart`, `fashion`,
`hardware`, `tea-coffee`, `auto-parts`, `restaurant`, `beauty-spa`,
`phone-electronics`) — that route (`SettingsEntry` in `App.tsx`, reading
both `?product=` and `?template=`) is what actually resolves to
`ProductOnboardingPage.tsx:105`'s trade selection. The content drafting
agent must generate `https://app.supermega.dev` + that helper's path for
the specific trade a prospect is being personalized for, never the bare
`/shop/` route, whenever this template is actually filled in for a real
send.

This mechanism note applies to all four drafts in this section: for the
variants below, `shopBusinessTemplateSetupPath` is called with `pharmacy`,
`restaurant`, or `hardware` as the `ShopBusinessTemplateId`.

### (c).2 Pharmacy variant

**DRAFT — NOT SENT, PENDING FOUNDER REVIEW.**

> **Subject: A free till and daily-close tool for [business name] — no account, works offline**
>
> Hello [owner name],
>
> I'm reaching out because [business name] looks like a pharmacy — is that
> right?
>
> I've been building a free tool called SuperMega for shop owners like you.
> It runs on your own phone or laptop, needs no account to try, and keeps
> working even when the internet is down, because your records stay on your
> own device.
>
> What it does today, for free, for as long as you use it:
>
> - Ring up a sale — cash, KBZPay, or WavePay — and watch your stock update
>   on its own.
> - Keep who moved each box, when, and why on the record — so when a clinic
>   account or an inspector asks about stock, the answer is a record with a
>   name on it, not a memory.
> - Count your stock without stopping trade, with the expected number, the
>   counted number, and any difference kept as one record.
> - Count your drawer at the end of the day against what the day should
>   hold, and keep a note of any difference.
>
> It comes with a sample pharmacy already loaded — including a sample clinic
> wholesale order — so you can see how it works before you type anything of
> your own in.
>
> You can try it here, right now, with no sign-up: [trade-specific setup link]
>
> If you'd like to talk it through first, or you're not sure it fits your
> shop, just reply to this email — I'm happy to explain more or answer
> questions.
>
> Thank you for your time,
> [Founder name]
> SuperMega — supermega.dev

**Why each claim is safe:** the who/when/why stock record and the
expected/counted/difference count are the pharmacy card,
`MARKETING-POSITIONING.md` (c).2 — stock movements are evidenced events
carrying `actionId`, `capturedAt`, `actor`, `reason` and
`evidenceReference`, and a stock count records expected, counted and the
difference as one attributable record. The clinic wholesale sample order
ships in the `pharmacy` template (the card's "repeat trade account is set
up before the owner types anything"); it is presented as a sample, never
as a customer, per (e).15 there. Counter sale — `shop-counter` row;
counting without stopping trade — `shop-inventory` row; daily close —
`shop-daily-close` row. **Deliberately absent:** no expiry, batch, or lot
claim — Shop has none, and (e).6 of the positioning doc forbids claiming
it. No price, no pressure language.

### (c).3 Restaurant variant

**DRAFT — NOT SENT, PENDING FOUNDER REVIEW.**

> **Subject: A free till and daily-close tool for [business name] — no account, works offline**
>
> Hello [owner name],
>
> I'm reaching out because [business name] looks like a restaurant — is
> that right?
>
> I've been building a free tool called SuperMega for shop owners like you.
> It runs on your own phone or laptop, needs no account to try, and keeps
> working even when the internet is down, because your records stay on your
> own device.
>
> What it does today, for free, for as long as you use it:
>
> - Hold a table for a booking, with the host and the table zone written
>   down — and a second booking on the same table at the same time is
>   refused outright.
> - Take a reservation deposit at the counter, so a held table is money on
>   the record, not just a name in a diary.
> - Follow each booking from held to confirmed to checked-in to completed,
>   with who moved it and why kept at every step — so the evening shift
>   reads the record, not the diary.
> - Count your drawer at the end of the day against what the day should
>   hold, and keep a note of any difference.
>
> It comes with a sample restaurant already loaded — including a sample
> family table booking — so you can see how it works before you type
> anything of your own in.
>
> You can try it here, right now, with no sign-up: [trade-specific setup link]
>
> If you'd like to talk it through first, or you're not sure it fits your
> shop, just reply to this email — I'm happy to explain more or answer
> questions.
>
> Thank you for your time,
> [Founder name]
> SuperMega — supermega.dev

**Why each claim is safe:** all three booking bullets are the restaurant
card, `MARKETING-POSITIONING.md` (c).8 — the restaurant pack speaks
"Reservations" / "Hold a table" with a host and a table zone as bookable
resources (`core/shop-service-scheduling.ts`), the reservation deposit is
the chargeable SKU `REST-SVC-DEPOSIT`, bookings move `held` → `confirmed`
→ `checked_in` → `completed` with each step appending an event with actor
and reason (`advanceShopServiceBooking`), and a second booking on the same
table zone in the same window is refused. Daily close — `shop-daily-close`
row. **Deliberately absent:** no counter or ring-up bullet at all, and no
speed claim of any kind — the restaurant card's own instruction is "Do not
pitch counter speed here yet", per (e).11's ban on speed pitches and
tap-count comparisons. Note: (e).11 was written when the one-tap cash sale
was queued; it has since shipped (design phase 2 item 1, PR #436 per
`DESIGN-PROGRAM.md`), but (e) is binding as written until the founder
updates the positioning doc — so this draft still makes no speed claim.
No price, no pressure language.

### (c).4 Hardware variant

**DRAFT — NOT SENT, PENDING FOUNDER REVIEW.**

> **Subject: A free till and daily-close tool for [business name] — no account, works offline**
>
> Hello [owner name],
>
> I'm reaching out because [business name] looks like a hardware and
> construction supply shop — is that right?
>
> I've been building a free tool called SuperMega for shop owners like you.
> It runs on your own phone or laptop, needs no account to try, and keeps
> working even when the internet is down, because your records stay on your
> own device.
>
> What it does today, for free, for as long as you use it:
>
> - Ring up a sale — cash, KBZPay, or WavePay — and watch your stock update
>   on its own.
> - Take a bulk order with a promised time and a pickup-or-delivery choice,
>   so a foreman's site delivery is a recorded promise, not a phone memory.
> - See who still owes you, how much, and how long it has been owed — from
>   current to long overdue, with the most-overdue customer named.
> - Give a regular account a credit limit and payment terms, and put an
>   account on hold when it needs it.
> - Count your drawer at the end of the day against what the day should
>   hold, and keep a note of any difference.
>
> It comes with a sample hardware shop already loaded — including a sample
> site-delivery order — so you can see how it works before you type
> anything of your own in.
>
> You can try it here, right now, with no sign-up: [trade-specific setup link]
>
> If you'd like to talk it through first, or you're not sure it fits your
> shop, just reply to this email — I'm happy to explain more or answer
> questions.
>
> Thank you for your time,
> [Founder name]
> SuperMega — supermega.dev

**Why each claim is safe:** the order, ageing, and credit bullets are the
hardware card, `MARKETING-POSITIONING.md` (c).5 — orders carry a
fulfilment method (pickup or delivery) and a promised time, and the
`hardware` template's staged sample order is a site delivery with a
loading note; money owed is aged into the `current` / `1_7` / `8_30` /
`31_60` / `over_60` day buckets with the most-overdue customer named
(`core/shop-ar-aging-summary.ts`); and a customer can carry a credit
policy with a limit, payment terms, and an active/hold status
(`core/shop-customer-credit-policy-summary.ts`). Counter sale —
`shop-counter` row; daily close — `shop-daily-close` row. No price, no
invented statistics, no pressure language.

---

## (d) Drafted one-touch follow-up email

**DRAFT — NOT SENT, PENDING FOUNDER REVIEW.**

Sent only after a founder has approved and sent one of the four initial
emails above (the follow-up is trade-agnostic and serves all four), and
only once — consistent with the do-not-say list's ban on pressure language
(`upgrade`, `trial ends`, `expires`, `only`, `unlock now` are forbidden in
product copy; this follow-up avoids the same spirit of manufactured urgency
even though it is marketing copy rather than in-product copy).

> **Subject: Following up — any questions about SuperMega?**
>
> Hello [owner name],
>
> I wrote to you last week about SuperMega, the free till and daily-close
> tool for shop owners. I wanted to follow up once, in case the first email
> got buried.
>
> No pressure at all — if it's not useful for your shop right now, that's a
> completely fine answer, and I won't write again after this.
>
> If you did have a chance to look, I'd genuinely like to hear what you
> thought, good or not. And if you have two minutes, you're welcome to try
> it here with no sign-up: [same trade-specific setup link as the initial email]
>
> Thank you,
> [Founder name]
> SuperMega — supermega.dev

**Why this is the whole sequence, not a step in a longer one:** the
follow-up sequencing agent in (b) is scoped to exactly one follow-up per
approved initial send, explicitly stated in the email itself ("I won't write
again after this"), matching the product's own anti-pressure design
philosophy rather than a Western drip-campaign norm that would read as
aggressive and untrustworthy to a Myanmar SME owner being approached cold.

---

## (e) Social content calendar sketch — Facebook Business Page

**Why Facebook, not Twitter/LinkedIn:** stated in (a) above — Facebook is
where Myanmar SME owners actually are. A Facebook Business Page is the
realistic default channel for this market's GTM, not a Western-playbook
default.

**Realistic starter cadence:** 2–3 posts per week. Not daily — a small
operation (a founder plus AI drafting help, no dedicated social hire) posting
daily either burns out or starts padding with filler, and filler undermines
the credibility this product's whole pitch depends on ("evidence-gated," "no
invented statistics"). A sustainable, credible cadence beats a burst that
stops.

**Suggested weekly rhythm (illustrative, not a rigid schedule):**
- One "how it works" or capability post.
- One "permanence / trust" post (free-forever, evidence, no lock-in).
- Occasionally a "behind the build" or trade-specific post tailored to one
  of the ten trade cards.

### Five fully drafted example posts

All DRAFT — NOT POSTED, PENDING FOUNDER REVIEW. All claims traced to
`MARKETING-POSITIONING.md`; none violate the do-not-say list in section (e)
there.

**1. The permanence promise**

> Free is not a trial here.
>
> Your till, your stock count, your daily close, your accountant export —
> free, on your own device, for as long as you use SuperMega. Not "free for
> 30 days." Not "free until you grow." Free, because it costs us nothing to
> give you a tool that runs on your own phone.
>
> No account needed to try it: [link]

**2. A specific capability — daily close**

> At the end of the day, does your counted cash match what your sales say it
> should? Most shops find out the answer lives in someone's memory.
>
> SuperMega counts your drawer against what the day says it should hold —
> per payment method — and won't let a difference go unrecorded without a
> reason. Not to catch anyone out. To make your own numbers something you
> can trust tomorrow.
>
> Try it free, no account: [link]

**3. A specific capability — the accounting handoff**

> "Can you send this to my accountant?"
>
> With SuperMega, the answer is yes — a balanced set of records, not a photo
> of a notebook page. Getting your own records out is never a paid feature.
> It's yours; it should leave freely.
>
> [link]

**4. How it works — explainer**

> How SuperMega actually works, in plain terms:
>
> 1. Install it on your own phone or laptop — no account needed.
> 2. Try a sample shop already loaded with items and a few sales, so you can
>    see it working before you type anything.
> 3. Ring up your own sales, watch your stock update, close your day.
> 4. Everything stays on your device. Take an encrypted backup any time you
>    want extra safety.
>
> No sign-up, no card, no catch: [link]

**5. Trade-specific — mini-mart / pharmacy angle**

> Two hundred items on your shelf, and the first time you learn the rice is
> gone is when a customer asks for it.
>
> SuperMega tells you what's running low before that happens — and shows you
> a suggested reorder list. It advises; it never orders behind your back.
>
> Built for shops like yours. Try the mini-mart sample free: [link]

### Three trade-specific post drafts (added 2026-08-19)

All DRAFT — NOT POSTED, PENDING FOUNDER REVIEW, same as the five above.
Each is grounded solely in its trade's card in `MARKETING-POSITIONING.md`
(c) — the same cards behind the email variants in (c).2–(c).4 — and the
`[link]` in each must be the trade-specific setup link built by
`shopBusinessTemplateSetupPath` for that trade (see the mechanism note in
(c)), never the bare `/shop/` route.

**6. Trade-specific — pharmacy**

> A clinic account or an inspector asks who moved that box of stock, and on
> whose word. In most shops, the answer is a memory.
>
> In SuperMega, every stock movement carries a name, a time and a reason —
> and a stock count keeps the expected number, the counted number and the
> difference as one record. Not to catch anyone out. So the answer is on
> paper, not in your head.
>
> Try the pharmacy sample free, no account: [link]

*(Grounded in the pharmacy card only: evidenced stock movements and the
attributable stock count. No expiry or batch claim — (e).6 forbids it.)*

**7. Trade-specific — restaurant**

> A family of twelve books two tables for Saturday — and the only record is
> a name in a diary the evening shift has not read.
>
> SuperMega holds the table with a host, a table zone, a deposit and a
> written reason behind it — and it refuses a second booking on the same
> table at the same time. The evening shift reads the record, not the diary.
>
> Try the restaurant sample free, no account: [link]

*(Grounded in the restaurant card only: reservations with host and table
zone, the chargeable deposit, double-booking refused. No counter-speed
claim — the card and (e).11 forbid it.)*

**8. Trade-specific — hardware**

> Twenty bags of cement, on site before the pour, on the workshop's account
> — and last month's bill still open.
>
> SuperMega takes the order with a promised delivery time, then shows you
> exactly who still owes you, how much, and how late — with the most-overdue
> customer named. A regular account can carry a credit limit, and go on hold
> when it has to.
>
> Try the hardware sample free, no account: [link]

*(Grounded in the hardware card only: fulfilment method and promised time,
aged receivables, customer credit policy. No price, no amounts.)*

---

## (f) What's needed from the founder before ANY of this goes live

**This is the actual blocker — not anything technical.** The lead research
and content drafting agents in (b) can run today with existing tools. Nothing
downstream of them can go live without the founder doing every item below.
None of these are optional or "nice to have first" — treat this list as a
hard gate, the same way `production_activation` is a hard gate on the hosted
platform.

- [ ] **Approve the target lead list.** Before any real business is
  contacted, the founder reviews the lead research agent's output list and
  says which businesses, if any, may actually be approached.
- [ ] **Approve the outreach copy.** Before any email or message is sent,
  the founder reviews and signs off on the exact text — including any
  edits made per business, if personalized — not just the templates in (c)
  (four trade drafts as of 2026-08-19: generic/mini-mart, pharmacy,
  restaurant, hardware), (d), and the trade-specific post drafts in (e).
- [ ] **Connect a real sending email identity and confirm consent to send
  under it.** The founder decides which address sends outreach, confirms
  they consent to messages going out under their name/brand, and this
  consent is given explicitly for this purpose — tool access existing in
  this environment is not the same thing as this consent being granted.
- [ ] **Connect a real social media account.** No Facebook Page posting
  credential is connected today. The founder must connect one and approve
  each post (or an approved batch of posts) before anything publishes.
- [ ] **Decide on cadence and volume limits.** How many businesses get
  contacted per week, how many follow-ups (this document proposes exactly
  one), and what the posting cadence is (this document proposes 2–3
  posts/week) — all are proposals here, not decisions; the founder sets the
  real numbers.
- [ ] **Decide how replies get tracked and who answers them.** Once real
  messages go out, real replies will come back. There is no defined process
  for this yet (see gap noted in (b)) — the founder should either approve a
  simple manual process (replies land in the founder's own inbox, same as
  today's support channel) or ask for that infrastructure to be built before
  volume increases.

Until every box above is checked by the founder, this document's job is
done: it is a plan and a set of drafts, not an action.
