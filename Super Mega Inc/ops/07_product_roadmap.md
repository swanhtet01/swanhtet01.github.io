# Product Roadmap

This is the current company build order.

## Now

### 1. Sell and deliver the first 3 products
- Distributor Sales Desk
- Receiving Control
- Founder Brief

### 2. Make the public site sharper
- keep public navigation to Home, Products, Contact
- show real product pages, not vague capability claims
- add real screenshots from the shared app
- reduce copy further

### 3. Make the company operate like a company
- add a dedicated Deals / Revenue surface in the app
- route contact submissions into tracked deals
- show active clients, delivery status, and blocked rollouts in one place

### 4. Finish the reliability layer
- finish Resend DNS so contact, invite, and brief emails deliver
- rebuild the frontend with Sentry enabled
- keep Cloud Tasks and worker processing as the default runtime path

## Next

### 5. Productize the next 4 systems
- Approval Flow
- Order Inbox Desk
- QR Ordering Desk
- Client Portal Starter

### 6. Split the runtime cleanly
- web service
- worker service
- later browser worker service

### 7. Add company guardrails
- Release Guard
- Deals Clerk
- Delivery Watch
- failed-job and retry visibility in Agent Ops

## Later

### 8. Expand into larger system shapes
- Commerce Back Office
- Learning Hub
- supplier scorecards
- service dispatch / field work control

### 9. Add browser sidecars selectively
- use Browser Use or a dedicated Chrome worker only where there is no API
- keep browser automation out of the system-of-record layer

## Success checks

### Revenue
- 3 paid client rollouts
- 10 qualified deals in pipeline
- contact-to-follow-up in less than 24 hours

### Delivery
- every client has one named queue owner
- every rollout has a visible blocker list
- every starter pack can be provisioned with one repeatable playbook

### Runtime
- scheduler and queue workers stay green
- failures appear in Sentry and incident logs
- founder brief arrives daily without manual intervention

## What to avoid

- rebuilding all of ecommerce from scratch before there is a buyer
- building giant abstractions before the first 3 products are selling
- using browser automation as the main control plane
- shipping product names without a clear buyer and daily user
