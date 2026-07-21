# >_ SuperMega operating platform

The platform supports the public company surface, the Shop/Plant product app, managed trials, releases, and a governed AI company. Internal machinery exists to operate the products; it is not a third public product.

## System boundaries

```text
supermega.dev
  public proof, templates, trust, qualified contact intake
        |
        v
app.supermega.dev
  Command | Shop | Plant | Assist | Setup | Trust
        |
        v
canonical FastAPI service
  signed identity | capabilities | state | events | approvals | scheduler
        |
        v
private Supabase Postgres
  dedicated runtime role | forced RLS | immutable audit | recovery
```

The isolated demo stops at browser-local state. The managed path is server-mediated and remains unavailable until every activation control passes.

## Internal operating machine

| Role | Accountable output | Hard boundary |
| --- | --- | --- |
| Product | Customer problem, scope, template, acceptance | Cannot invent demand or accept its own release |
| Engineering | Code, tests, migration, deployment candidate | Cannot promote around failed checks |
| Operations | Queue, owner, service health, incident coordination | Cannot hide or rewrite evidence |
| Growth | Lead qualification, demo plan, onboarding, follow-up drafts | Cannot contact externally without approval |
| Finance/Risk | Commercial review, access, claims, risk, approval record | Cannot self-approve a conflicted decision |

The human workspace owner remains accountable. Agents may research, draft, classify, test, and recommend within bounded tools; consequential side effects require an explicit policy and approval.

## Control plane

- Command is the shared work queue and role assignment surface.
- Hosted scheduler exposes only fixed queue and daily jobs through an HTTPS allowlist.
- Worker responses are bounded, sanitized, and treated as unverified until their side effects are explicitly reported.
- GitHub is source and review authority.
- Vercel builds immutable previews, promotes exact artifacts, and rolls back failed releases.
- Supabase is the managed trial store only after the read-only activation audit passes.
- Observability must cover health, release identity, scheduler state, errors, access changes, incidents, and recovery evidence without exposing secrets.

## Scale model

1. One canonical platform and shared contracts.
2. Configuration and templates before forks.
3. Bounded managed trials before expansion.
4. Feature flags and acceptance evidence for controlled rollout.
5. Automate repeated internal work while retaining named human authority.
6. Split services only when reliability, security, latency, or team ownership evidence justifies it.

## Non-negotiable controls

- No browser service role, database URL, or identity-signing secret.
- No privileged database runtime login.
- No cross-workspace read or write.
- No managed write without immutable event evidence.
- No agent-owned production promotion or external communication.
- No claim of readiness, value, or side effect without current evidence.
