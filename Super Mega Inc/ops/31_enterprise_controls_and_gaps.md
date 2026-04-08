# Enterprise Controls And Gaps

This file defines the minimum enterprise-grade controls for SuperMega and the gaps that still exist on the current platform.

Use this as the operating checklist for moving from a working platform to a platform that can survive larger customers, audits, and internal scale.

## 1. Standards baseline

SuperMega should align to these baselines:
- OWASP ASVS Level 2 for the web application control baseline
- NIST SP 800-63B for authentication and authenticator management
- Google Cloud official guidance for:
  - Cloud Run service identity and ingress restrictions
  - Cloud Audit Logs
  - Cloud SQL HA, backups, and point-in-time recovery

These are the minimum reference standards.

## 2. Current status summary

What is already present:
- Cloud Run app runtime
- Cloud Tasks and Cloud Scheduler
- Cloud SQL-backed state
- Sentry path available
- local HQ mirror
- branch/release workflow docs

What is still not enterprise-grade:
- fallback default credentials still exist if env vars are unset
- tenant separation is mostly configuration and routing, not a full control model
- auditability is partial
- observability is partial
- restore and failover are not yet documented as tested controls
- privacy and retention controls are not yet formalized
- local setup is still practical, not standardized

## 3. Control matrix

### 3.1 Security and auth

Current gap:
- app can still fall back to `owner` / `supermega-demo` if env vars are missing
- MFA / passkey policy is not enforced
- Google login exists as a path but is not the formal default control

Enterprise target:
- no production fallback credentials
- phishing-resistant authentication for operators and founders where practical
- role-based access per workspace and per tenant

Required controls:
- production startup must fail if `SUPERMEGA_APP_USERNAME` or `SUPERMEGA_APP_PASSWORD` are still default values
- require explicit user provisioning and disable demo fallback on production
- prefer Google Sign-In plus strong session controls for user auth
- add step-up auth for sensitive actions:
  - tenant settings
  - exports
  - invites
  - approval overrides
- define roles clearly:
  - founder
  - manager
  - operator
  - agent-worker

Proof:
- auth settings review
- login control tests
- prod config check

### 3.2 Tenancy

Current gap:
- YTF vs default is explicit, but tenant isolation is still mostly naming, routing, and workspace defaults

Enterprise target:
- tenant identity, access, branding, data sources, and KPI rules must be isolated by configuration and data enforcement

Required controls:
- every user session must resolve a tenant/workspace context
- every query that reads or writes business data must be scoped by workspace or tenant
- tenant config must live in one canonical registry
- tenant custom domains must not imply access by themselves
- tenant-specific connectors must be explicit:
  - mailbox
  - Drive folder mapping
  - scorecards
  - approvals

Proof:
- tenant access matrix
- workspace-scoped API review
- negative tests for cross-tenant access

### 3.3 Auditability

Current gap:
- some business actions are saved, but there is not yet a complete immutable audit layer for security and admin events

Enterprise target:
- answer who did what, where, and when for auth, approvals, settings changes, exports, and privileged actions

Required controls:
- keep Cloud Audit Logs enabled
- enable and retain Data Access logs for the relevant services
- create application audit events for:
  - login
  - logout
  - team invite
  - role change
  - approval decision
  - export
  - contact-to-deal conversion
  - tenant config change
- treat audit events as append-only records

Proof:
- audit event queries
- incident drill showing event reconstruction

### 3.4 Release management

Current gap:
- release workflow exists, but enforcement is still social rather than hard-gated

Enterprise target:
- every release has evidence, checks, rollback path, and a known operator decision

Required controls:
- protect `main`
- require build, lint, smoke, and screenshot evidence for user-facing changes
- require explicit release approval before production promotion
- keep release log and incident log current
- define rollback procedure and rehearse it

Proof:
- release checklist
- release log entry
- rollback drill record

### 3.5 Observability

Current gap:
- runtime visibility exists but is incomplete across metrics, traces, alerts, and queue lag

Enterprise target:
- one operator can see service health, queue health, release health, and customer-facing failures quickly

Required controls:
- Sentry browser and backend DSNs live
- Cloud Logging dashboards for web and worker services
- Cloud Monitoring alerts for:
  - 5xx spikes
  - queue backlog
  - failed scheduled jobs
  - contact/invite email delivery failures
  - failed auth callbacks
- define basic SLOs:
  - app availability
  - worker success rate
  - founder brief freshness

Proof:
- alert test
- dashboard links
- incident log references

### 3.6 Backup and recovery

Current gap:
- platform uses Cloud SQL, but enterprise posture requires tested recovery, not only configured storage

Enterprise target:
- recover the control plane and tenant data within a defined window

Required controls:
- Cloud SQL should run with high availability for production
- automated backups enabled
- point-in-time recovery enabled
- restore test on a schedule
- export critical operating artifacts:
  - ops docs
  - latest reports
  - site proof assets

Proof:
- backup configuration
- restore drill
- recovery notes in ops docs

### 3.7 Privacy and data governance

Current gap:
- privacy boundaries are implied, not formalized

Enterprise target:
- the company knows what data it stores, why it stores it, how long it keeps it, and how to delete it

Required controls:
- define data classes:
  - public marketing
  - internal operational
  - customer confidential
  - credentials and secrets
- define retention and deletion rules for:
  - contact records
  - Gmail/Drive ingested content
  - screenshots and preview artifacts
  - audit logs
- no secrets in docs, repo, or screenshots
- formalize tenant export and delete process

Proof:
- retention matrix
- deletion procedure
- secrets handling standard

### 3.8 Local-replicable setup

Current gap:
- founder machine workflows exist, but they are not yet a standardized enterprise workstation build

Enterprise target:
- a new secure workstation or runner can be provisioned repeatably and audited

Required controls:
- documented required tools and versions
- gcloud auth standard
- secrets pulled from Secret Manager, not copied from ad hoc files
- local HQ mirror reproducible from one script path
- browser sidecars isolated from founder personal browsing

Proof:
- workstation setup doc
- rebuild on clean machine or VM

## 4. Priority order

Implement in this order:
1. remove production fallback credentials
2. enforce tenant/workspace scoping and test it
3. complete audit events and Cloud Audit Logs coverage
4. complete Sentry and monitoring alerts
5. turn backup configuration into tested recovery
6. standardize local enterprise workstation and runner setup

## 5. Blunt rule

SuperMega becomes enterprise-grade when:
- auth is explicit
- tenancy is enforced
- privileged actions are auditable
- releases are gated
- failures are visible
- recovery is tested

If any of those are missing, the platform is still pilot-grade.

## 6. Reference guidance

- OWASP ASVS:
  - https://owasp.org/www-project-application-security-verification-standard/
- NIST SP 800-63B:
  - https://pages.nist.gov/800-63-4/sp800-63b.html
- Cloud Run service-to-service auth:
  - https://cloud.google.com/run/docs/authenticating/service-to-service
- Cloud Run ingress:
  - https://cloud.google.com/run/docs/securing/ingress
- Cloud Audit Logs:
  - https://docs.cloud.google.com/logging/docs/audit
- Cloud SQL HA:
  - https://cloud.google.com/sql/docs/sqlserver/high-availability
- Cloud SQL backups and PITR:
  - https://cloud.google.com/sql/docs/sqlserver/backup-recovery/pitr
- Operations best practices:
  - https://docs.cloud.google.com/architecture/blueprints/security-foundations/operation-best-practices
