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
| **Fire a follow-up after an initial send** | Follow-up sequencing agent, on founder's standing approval of the sequence design | **Required once, to approve the sequence design; the individual follow-up still needs the founder to have approved the original send it follows** |

This mirrors the product's own `ProductionActionProof` discipline described
in `CLAUDE.md`: an agent proposes, a human actor confirms, and nothing
"counts" — here, nothing is *sent* — until that confirmation exists. The
readiness ledger's own `forbiddenUntilReady` list (`customer_message` among
them) is the same principle applied to the hosted platform; this document
applies it to GTM.

---

## (c) Drafted trial-invitation email

**DRAFT — NOT SENT, PENDING FOUNDER REVIEW.**

Grounded in `MARKETING-POSITIONING.md` (a), (b), and the free-forever list.
Honest about local/no-account status per `SELF-SERVE-ONBOARDING-SPEC.md` (no
hosted self-serve signup exists yet — this points at the local product only).
No pressure language, no invented statistics, no fake testimonials, no price.

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
> You can try it here, right now, with no sign-up: https://app.supermega.dev/shop/
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
loaded — section (c) of the positioning doc, ten trade cards. The link points
at the actual local app route (`app.supermega.dev/[product]/` per
`site-manifest.json`), not a hosted signup that doesn't exist. No mention of
premium, AI intake, managed workspaces, or any capability gated per section
(e) of the positioning doc. No price. No "trusted by," no invented user
count, no testimonial.

---

## (d) Drafted one-touch follow-up email

**DRAFT — NOT SENT, PENDING FOUNDER REVIEW.**

Sent only after a founder has approved and sent the initial email above, and
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
> it here with no sign-up: https://app.supermega.dev/shop/
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
  edits made per business, if personalized — not just the template in (c)
  and (d).
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
