## Solo creator operating model

### The paradigm

SuperMega should not behave like a generic AI platform.

It should behave like:

- small public tools anyone can try
- repeatable paid setup templates
- durable internal agent loops on shared data
- a founder who approves direction and closes real client work

### Public proof layer

Keep the public layer simple:

1. Find Companies
2. Company List
3. Receiving Log

Each tool must work with any client's own data, not only SuperMega data.

### Paid template layer

Use only a few repeatable paid setups:

- Sales Setup
- Company Cleanup
- Receiving Control

Every client starts with one template, not a platform rollout.

### Private shared app

Use `app.supermega.dev` as the saved team app.

The shared app should hold:

- leads
- tasks
- issues
- approvals
- daily briefs

### Agent team

#### Revenue Scout

- reruns saved company hunts
- adds fresh prospects
- keeps the prospecting loop alive

#### List Clerk

- cleans imported rows
- normalizes contacts
- keeps company lists usable

#### Task Triage

- turns messy notes into short next-step tasks
- reduces manual cleanup work

#### Founder Brief

- summarizes the current state
- highlights only what needs attention

#### Release Guard

- runs build, lint, smoke, live route checks
- catches drift before deploy

### Founder role

The founder should spend time on:

- choosing the ICP
- approving the offer ladder
- talking to clients
- closing paid setups
- deciding what graduates from template to product

The founder should not spend time on:

- hand-running every smoke check
- manually cleaning every imported list
- re-explaining the product story every week

### Infrastructure stack

Core runtime:

- Cloud Run
- Cloud SQL Postgres
- Secret Manager
- Cloud Scheduler
- Cloud Tasks

Core agent/application stack:

- OpenAI Responses API
- OpenAI Agents SDK
- FastAPI
- Playwright for browser verification

Business stack:

- PostHog
- Sentry
- Resend
- Stripe later, not first

### Tooling principle

Use browser agents such as Browser Use or OpenClaw-class tools only as sidecars for narrow browser tasks or R&D.

Do not make them the main production control plane.

The main control plane should stay:

- typed
- schedulable
- observable
- retryable

### Operating cadence

Every day:

1. check live app and public routes
2. review Founder Brief
3. review new companies and tasks
4. ship one product improvement or one client template improvement

Every week:

1. remove one source of naming drift
2. simplify one user flow
3. improve one template pack
4. close one new client setup

### Rule

If a new idea does not strengthen:

- Find Companies
- Company List
- Receiving Log
- one paid setup
- one durable agent loop

it should not get priority.
