# Connected-site event visibility boundary (source-only)

This is a default-off design contract, not an enabled feed or a merchant policy.
The only implemented read is the unmounted, manager/owner-only **metadata**
page in `supermega_runtime/connected_site_event_feed.py`. It returns sequence
and digest headers, never `event_json`. A signed lease and current authority
are required for each read. Replaying the same authenticated read within its
30-second freshness window is allowed; no client download cursor is durable.

## Source-grounded payload inventory

| Source event family | Payload fields or content established in source | Risk / current read decision |
| --- | --- | --- |
| Retail/café stock reserve and release | Workspace/site, actor/device, product IDs, quantities, reservation state and times | Inventory and staff activity; **no payload projection approved** |
| Derived stock committed/expired | Before/after reservation, transition and sale binding including sale ID and command digest | Links stock to financial activity; **no payload projection approved** |
| Café put, state, cancel and kitchen status | Service area/table labels, product names, quantities, modifiers, unit prices and a free-text remark of up to 240 characters | Price disclosure and potential personal information in free text; **no raw delivery approved** |
| Other future event types | The SQL column accepts any JSON object; Python command validation currently accepts any dictionary payload with a matching digest | Cannot infer privacy from a digest; **deny by default** |

The SQL source is `supabase/migrations/20261101090000_private_trial_backend_v15_connected_site.sql`
(`connected_site_events.event_json`). Signed event types and binding are in
`supermega_runtime/connected_site_v15.py`; native command-to-event copying is
in `mobile/shop_pos/lib/shop_connected_site_database_adapter.dart`. The café
payload shape is in `mobile/shop_pos/lib/shop_cafe_order_contract.dart` and
stock/reservation shapes are in `mobile/shop_pos/lib/shop_connected_stock_reservation.dart`.

## Role boundary before payload delivery

| Role | Established workflow need | Current cloud event-read result |
| --- | --- | --- |
| Manager/owner | Management read and site oversight | Signed current `managementRead` lease permits **headers only** |
| Cashier | Open bill and counter-authoritative tender/receipt | No event payload or all-site header grant |
| Waiter | Own/open café tickets and handoff | No event payload or all-site header grant |
| Kitchen/bar | Accepted ticket and preparation state; no customer contacts, prices or payment | No event payload or all-site header grant |
| Stock staff | Product and quantity activity | No event payload or all-site header grant |

Role capabilities are defined in `supermega_runtime/connected_site_lease_issuer.py`.
The workstation restrictions are in `docs/SHOP-ROLE-WORKSTATION-DELIVERY.md`.
These needs do **not** authorize raw payload exposure or define a new merchant
access policy.

An unmounted `project_retail_reservation_held` source candidate accepts only
the exact retail reserve/held envelope and line shape for a current manager/
owner lease. It emits product IDs, quantities, reservation ID/state and
candidate digests, omitting actor/device IDs, timestamps, prices and free text.
Its caller-provided digest proves only internal consistency: no PostgreSQL row,
signed upload, page sequence or durable client cursor is yet bound to that
candidate. Release, expiry and commit projections are also absent. It must
not drive stock availability or be delivered to any client in this state.

## Required next contract and decisions

Before any event payload endpoint is mounted, reject unknown event types and
unknown/extra payload fields at ingestion; establish a versioned privacy
classification for every permitted field; build separately versioned,
role-specific projections. A kitchen projection must omit prices, customer
contacts and payment data. A cursor-preserving projection must use explicit
opaque gap markers rather than skipping invisible sequence numbers. Then prove
tenant isolation, actor/lease revocation, ordering, reconnect and durable
client cursor recovery with a real disposable PostgreSQL 17 transaction test
and installed two-device evidence.

Swan/Vivian must decide whether free-text remarks may reach kitchen, how ticket
ownership is assigned for waiter reads, and which roles may see prices or
member identity. Until these are explicit, the implementation must fail closed:
no raw `event_json`, no role payload feed, and no production connected mode.
