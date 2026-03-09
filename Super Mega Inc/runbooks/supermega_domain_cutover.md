# SuperMega Domain Cutover Runbook

Canonical host: `supermega.dev`  
Secondary host: `www.supermega.dev` (redirect to apex)

## Current status (observed 2026-03-09)

- DNS is correctly pointed to GitHub Pages:
  - apex `A`: `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
  - `www CNAME`: `swanhtet01.github.io`
  - TXT challenge present for GitHub domain verification.
- Public access to `https://supermega.dev` still fails, so the remaining blocker is GitHub Pages deployment/certificate state.

## Target architecture

- Host: GitHub Pages (Actions deployment from `showroom/` build).
- Artifact root: `showroom/dist`.
- Optional custom domain file: `CNAME` with value `supermega.dev`.
- Apex serves the site.
- `www` resolves and redirects to apex.

## Repo and branch facts

- Repo: `swanhtet01/swanhtet01.github.io`
- Local path: `C:\Users\swann\OneDrive - BDA\swanhtet01.github.io.worktrees\copilot-worktree-2026-03-04T08-10-33`
- Showroom app: `showroom/`
- Deploy workflow: `.github/workflows/showroom-pages.yml`
- Workflow now deploys on push to `main` and `copilot/**`, plus manual dispatch.

## Step-by-step cutover (GitHub side)

1. Enable GitHub Pages source to **GitHub Actions** in repository settings.
2. In Pages settings, set custom domain to `supermega.dev`.
3. Wait until GitHub shows domain verification success and certificate provisioning starts.
4. Push branch with `.github/workflows/showroom-pages.yml` and `showroom/` changes.
5. Confirm Action `Deploy SuperMega Showroom` finishes successfully.
6. Confirm environment `github-pages` has a successful deployment.
7. Enable **Enforce HTTPS** once certificate is ready.

## DNS reference (already configured)

- Apex `A` records:
  - Apex `A` records to GitHub Pages:
    - `185.199.108.153`
    - `185.199.109.153`
    - `185.199.110.153`
    - `185.199.111.153`
- `www` `CNAME` to `swanhtet01.github.io`
- TXT challenge host:
  - `_github-pages-challenge-swanhtet01.supermega.dev`

## Validation commands

```powershell
nslookup supermega.dev 8.8.8.8
nslookup www.supermega.dev 8.8.8.8
curl.exe -I https://supermega.dev
curl.exe -I https://www.supermega.dev
```

Expected after cutover completion:

- DNS ready for apex and `www`.
- TLS valid for both hosts.
- HTTP 200 for:
  - `/`
  - `/solutions/`
  - `/packages/`
  - `/case-studies/`
  - `/dqms/`
  - `/about/`
  - `/contact/`

## 24-hour acceptance gate

Pass if all checks are green for 24 hours from at least two networks:

- local workstation run
- GitHub Actions scheduled check (`supermega-domain-health.yml`)

If either fails, keep cutover open and resolve DNS/TLS before marketing traffic.
