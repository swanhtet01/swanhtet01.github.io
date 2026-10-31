# Native Shop — Vivian acceptance card

This is the current execution card for the internal Local Pilot evaluation. It is
subordinate to Gates 3–6 of the [Shop release runbook](SHOP-RELEASE-RUNBOOK.md)
and cannot approve signing, physical hardware, commercial terms, production, or
go-live by itself. Keep merchant data and evidence in the approved private
store; record only non-secret references here.

## Exact candidate

- PR: #734
- Source commit: `de648ecda569c639f1b5da8fcf8cd874c1f712d4`
- Source tree: `198c188372bb4a33777168f49e6260b63c330751`
- Native Shop tree: `5417a23dd9e5e3f99832e921c29ff55a620e642b`
- Public gallery evidence successor: `fd90cff3dbefe65d734f0a2c88f6df7958b2cd52`
- Signed build filename / SHA-256: `BLOCKED — owner-supplied`
- Signing identity / distribution channel: `BLOCKED — owner-supplied`
- Device / OS / installation date: `NOT RUN`
- Observer / language (`EN` or `MY`) / private evidence reference: `NOT RUN`

Any source change creates a new candidate and requires this identity block and
affected checks to be refreshed.

## Before Vivian starts

- [ ] The exact signed artifact, signing identity, and approved channel match.
- [ ] The representative fixture and expected prices, stock, totals, IDs, and
      close values are approved before entry.
- [ ] The operator role and workspace are named; correction issuer, pinned key,
      immutable workspace binding, and online availability are verified.
- [ ] A backup password custodian is named; never record the password here.
- [ ] Device, scanner, printer, firmware, transport, and paper width are named.
- [ ] Physical evidence is labelled separately from simulator/CI evidence.

## One complete merchant journey

Record every row as `PASS`, `FAIL`, `BLOCKED`, or `NOT RUN`.

| Step | Expected result | Observed result | Status | Private evidence reference |
| --- | --- | --- | --- | --- |
| Catalog | Add one product or review a menu-photo draft; uncertain fields require confirmation |  |  |  |
| Cash sale | Correct items, quantities, price, payment, immutable receipt |  |  |  |
| Wallet sale | Local payment state is truthful; no provider settlement is implied |  |  |  |
| Stock | Once-only sale movement matches expected on-hand quantity |  |  |  |
| Cash correction | Online owner authorization; reason required; immutable original; explicit restock and cash-return review |  |  |  |
| Wallet correction | Local reversal remains externally pending until separate provider evidence |  |  |  |
| Retry | Double tap/interruption creates no duplicate sale, stock, reversal, or cash effect |  |  |  |
| Close | Gross, reversals, net, cash returned, and wallet liability reconcile |  |  |  |
| Export | Agreed fields and SHA-256 match the retained operational record |  |  |  |
| Restart | Process/device restart retains exact IDs, counts, totals, and settings |  |  |  |
| Restore | Encrypted backup restores to a fresh target with expected IDs, counts, totals, audit, and retry protection |  |  |  |

Operator must be able to explain: ordinary selling works offline; correction is
an online-authorized owner action; the original sale is never rewritten; the
reason and actor are retained; restock is explicit; wallet reversal does not
claim money was returned; ambiguous printer delivery is checked before manual
reprint.

## Platform and language matrix

| Target | EN signed installed | MY signed installed | Restart/restore | Physical scanner | Physical LAN printer/Burmese paper |
| --- | --- | --- | --- | --- | --- |
| Android tablet | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN |
| iPad | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN |
| Windows PC | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN |

Hardware-free HID/TCP/raster tests are engineering evidence only. They do not
turn a model, transport, paper width, or Burmese receipt into physical PASS.

## Commercial and support decisions

Local Pilot is an internal evaluation label, not a separately priced offer.
The current commercial direction is subscription-only with no setup fee;
assisted setup is included help only when the owners approve the subscription
offer and its support boundary. Managed Cloud and Multi-site are not for sale.

| Decision | Recorded answer / owner / date |
| --- | --- |
| Pilot price and payment timing |  |
| Included setup, import, training, and revision allowance |  |
| Excluded work and stop conditions |  |
| Supported OS/device/hardware promise |  |
| Hardware supplied, recommended, or merchant-owned |  |
| Backup responsibility and recovery help |  |
| Support channel, hours, response expectation, escalation owner |  |
| Onboarding, cancellation, export, and retention expectations |  |
| Claims approved for the public page |  |

## Decisions and disposition

Founder scope decision recorded 23 October 2026: **full-sale-only
correction/refund is accepted for launch; partial/item refunds and exchanges
are deferred.** Vivian evaluates whether this disclosed customer promise works
for the pilot; she does not need to repeat the founder scope decision.

- Merchant journey: `ACCEPT | REJECT | BLOCKED`
- Full-sale-only promise acceptable for this pilot: `YES | NO`
- Commercial/support packet: `ACCEPT | REJECT | BLOCKED`
- Findings / blocker / owner / due date:
- Vivian / date:

After completion, attach this private evidence reference to Gate 5, then obtain
eligible independent human review (Gate 7) and the Swan/Vivian exact-candidate
go/no-go (Gate 8). No agent or synthetic result may sign those gates.
