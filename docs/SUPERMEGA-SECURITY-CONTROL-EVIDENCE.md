# SuperMega security control and evidence register

Status: scoped engineering register, 24 October 2026. This is not an ISO
certificate, audit opinion, penetration-test result, or claim of compliance.

## Reference baseline

- [ISO/IEC 27001:2022](https://www.iso.org/standard/27001) plus Amendment
  1:2024 — information-security management and risk treatment.
- ISO/IEC 27002:2022 — implementation guidance for information-security
  controls.
- ISO/IEC 25010:2023 — product-quality model.
- [NIST Cybersecurity Framework 2.0](https://www.nist.gov/cyberframework) —
  Govern, Identify, Protect, Detect, Respond and Recover.
- [NIST SP 800-218 SSDF 1.1](https://csrc.nist.gov/pubs/sp/800/218/final) —
  secure-software development practices. SSDF 1.2 is draft and is not the
  release baseline.
- [OWASP ASVS 5.0.0](https://owasp.org/www-project-application-security-verification-standard/)
  — applicable Level 2 requirements for the account portal and managed APIs.
- [OWASP MASVS](https://mas.owasp.org/MASVS/) — applicable mobile/native
  storage, authentication, network, platform, code and resilience checks.

ISO/IEC 27701:2025 may later support a privacy-management system. It is not a
coding checklist and is not claimed here.

## Control-to-evidence register

| Control outcome | Current mechanism and evidence | State | Accountable owner | Required next proof |
| --- | --- | --- | --- | --- |
| Scope, authority and risk governance | `supergoal.md`, `AGENTS.md`, owner-gated release workflows, this register | PARTIAL | Swan; Vivian for business policy | Define ISMS scope, asset/data register, risk owners, treatment decisions, review cadence and applicable-control rationale |
| Merchant tenant isolation | Workspace membership, capability checks, product entitlements, forced-RLS design and cross-tenant tests | PARTIAL | Technical owner | Exact-current hosted denial, revocation and browser-role quarantine on an approved isolated target |
| Internal staff identity | One-use operator sessions, scoped roles, secure cookies, expiry/revocation; owner-key bootstrap remains | FAIL for staff rollout | Swan | Named staff identities, MFA, least privilege, joiner/mover/leaver, break-glass alerts and no shared owner key |
| Merchant/staff separation | Separate portal and console concepts; source policy forbids merchant session reuse | PARTIAL | Swan | Threat model and executable denial tests across portal, support and console authority |
| Financial and loyalty integrity | Immutable billing events, entitlement checks, sale/correction idempotency, member/loyalty reference contract | PARTIAL | Swan | Authenticated merchant billing endpoint; native loyalty storage/atomicity; multi-register coordination and signed installed tests |
| Protected audit history | Append-only correction/billing evidence and actor/reason fields | PARTIAL | Technical owner | Retention policy, staff-admin event coverage, clock/sequence monitoring and operational review evidence |
| Secrets and credentials | Secret-shaped input rejection, redacted evidence, credential quarantine rules | PARTIAL | Swan | Current owner/custody/rotation register, break-glass procedure and tested compromise rotation |
| Dependency and source security | Lockfile audits, frozen Python hashes, GitGuardian history, pinned actions and fail-closed release checks | PARTIAL | Technical owner | SAST decision, SBOM generation/retention, vulnerability SLA and signed build provenance |
| Native supply chain | Exact source/tree and artifact-digest contracts; packages remain unsigned | FAIL for release | Swan | Android/Apple/Windows key custody, signed artifacts, approved channels, rollback and compromised-key procedure |
| Backup, restore and continuity | Encrypted native backup, corruption checks, no-replace proof, recovery runbooks | PARTIAL | Swan + operations owner | Signed installed restart/update/restore, RTO/RPO by system and restore rehearsal evidence |
| Detection and incident response | Dependency/security checks, security-advisor receipts and bounded alerts; incident log is not an operating program | FAIL operationally | Swan + named incident commander | Severity model, intake, containment, evidence handling, communications ownership, tabletop and corrective actions |
| Privacy and data minimization | Tenant scoping, non-PII member token reference, export privacy canaries, secret redaction | PARTIAL | Swan + Vivian for business data policy | Data inventory, purpose/retention/deletion rules, subject-request process and processor register |
| AI-agent authorization and spend | Human-owned consequential actions, bounded roles, tenant budget reservation and daily ceilings | PARTIAL | Swan | Connector-by-connector permission inventory, named recovery owner, audit retention and incident kill switch proof |
| Product quality | CI, deterministic fixtures, accessibility checks, recovery and release-gate evidence | PARTIAL | Technical owner | Exact-head full CI, protected preview, installed/hardware proof, independent review and merchant acceptance |

## P0 release and staff blockers

1. Do not expose an internal console to staff until named identities, MFA,
   least-privilege roles, offboarding and actor-attributed admin events exist.
   `console.supermega.dev` is only a possible hostname; DNS is not authority.
2. Re-prove exact-current tenant isolation and revocation on an approved,
   isolated non-production target before authenticated merchant testing.
3. Produce signed distributions, SBOM/provenance, installed recovery and
   compromised-signing-key procedures before customer distribution.
4. Establish and rehearse incident response for credential compromise, tenant
   leakage, fraudulent correction, lost device and failed restore.
5. Keep merchant subscription billing separate from Shop customer tenders and
   keep pending/manual records distinct from provider-confirmed money movement.

## Evidence rules

- Source review, local tests, CI, protected preview, installed proof, merchant
  acceptance and production acceptance are different evidence levels.
- A test name, policy document or hostname never proves an operating control.
- Each gap closes only with evidence bound to the exact system and candidate.
- Live IAM, MFA, network, credential, signing, domain and production changes
  remain separately authorized owner actions.
