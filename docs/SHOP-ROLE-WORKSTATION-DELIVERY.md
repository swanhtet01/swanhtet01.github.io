# Shop role and workstation delivery

Status: source audit and implementation sequence, not live staff/device management. 18 September 2026.

## Source truth

`enterprise-staff-roles.ts` defines role assignments but has no application callers of `canPerformWrite`; tests are not server enforcement. Numeric rank previously allowed unrelated job roles to inherit writes. Use explicit job-family checks as a helper only. Managed commerce currently exposes broad commerce.read/commerce.write capabilities; narrower command scopes and server-side checks are required before issuing waiter or kitchen accounts. Do not provide broad commerce.write and merely hide buttons.

## Identity and workstation contract

The signed-in user plus workspace membership authorizes actions. A registered device selects a convenient default station and layout, never authority. Staff can use another approved device without sharing another person's login. Switching staff on a shared tablet must lock the previous session, separate cached data/outboxes and confirm ownership of pending work. PIN/biometric fast unlock may only unlock an established authorized session; it is not a replacement for server authentication or a universal shared PIN.

| Template/station | Focused page | Restricted actions |
| --- | --- | --- |
| Restaurant waiter/tablet | Tables, own/open tickets, modifiers, send to kitchen, status | No tender, refunds, stock corrections or employee administration by default |
| Kitchen/display | Accepted ticket queue, preparation/ready status | No customer contact details, prices, payment or sale edits unless required and authorized |
| Cashier/counter | Open bills, manual tender, receipt, shift close | Discounts/voids/refunds above policy require supervisor approval |
| Retail sales/mobile or counter | Item search, variants, cart, handoff to cashier | Scope tender separately; no access to full financial reports |
| Service reception/tablet | Appointment requests, check-in, staff/room availability | No therapist notes by default; no automatic booking or money settlement |
| Owner/admin portal | Workspace members, active/revoked sessions, station assignments, orders, close exceptions, audit events | Tenant-scoped only; provider/support access is separately delegated and logged |

Station choice comes from template plus explicit selection, not guessed from user-agent or viewport. Responsive layout adapts to phone/tablet/desktop. Keep manual switching available only among the user's authorized jobs. Show user, workspace, station and sync state clearly; a layout switch cannot broaden access.

## Ordered implementation and acceptance

1. Define fine-grained command capabilities against actual commerce/service-schedule endpoints; test every denied role-command pair, revoked membership and wrong tenant. Approval is a separately validated receipt, not a rank comparison.
2. Add server-owned device/session registration and revocation, privacy-minimal audit records and last-seen timestamps. No fingerprint-based authorization. Owner dashboard must distinguish last seen from currently online; record actor, station, command ID and result without raw customer/payment payloads.
3. Implement waiter/cashier/kitchen views as projections of the same order state. Preserve idempotent command IDs, expected versions and explicit conflict recovery. Pending offline work cannot silently transfer to a different staff member.
4. Owner invitation and named-account onboarding; fast return to an approved station; test stolen/revoked sessions and shared-tablet logout. Do not infer that an invitation equals accepted membership.
5. Test one restaurant end to end across two devices: waiter ticket, kitchen update, cashier tender record, supervisor correction and owner close. Simulated tests precede hosted isolation/concurrency checks and observed staff testing.

Related products: Website customers get review/approve views, not internal publishing controls; Ecommerce staff get catalog/request/fulfillment queues according to capabilities. Shared navigation and identity do not grant cross-product access. Shop remains the primary workflow. No new provider accounts, database changes, device enrollment or customer activation occurred with this document.
