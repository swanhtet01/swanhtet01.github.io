# Tenant Identity And Defaults

This file defines the current general-vs-YTF split on the platform.

## 1. Default platform identity

Current default tenant:
- key: `default`
- brand: `SuperMega`
- kind: `general-platform`

Current default workspace fallback:
- slug: `supermega-lab`
- name: `SuperMega Lab`
- plan: `pilot`

Current default auth fallback in code:
- username: `owner`
- password: `supermega-demo`

That fallback exists only when:
- `SUPERMEGA_APP_USERNAME` is unset
- `SUPERMEGA_APP_PASSWORD` is unset

If those env vars are set, the platform uses the configured values instead.

## 2. YTF tenant identity

Current YTF tenant:
- key: `ytf-plant-a`
- brand: `Yangon Tyre Plant A`
- kind: `tenant-vertical`
- default workspace slug: `ytf-plant-a`

YTF is not the default platform identity.

It is selected only when:
- hostname is `ytf.supermega.dev`
- hostname is `www.ytf.supermega.dev`
- query param is `?tenant=ytf`
- query param is `?tenant=ytf-plant-a`

## 3. Current behavior

Today the platform is still general SuperMega first.

That means:
- the public company story should stay SuperMega-first
- the main app defaults should stay SuperMega-first
- YTF should be treated as a tenant on the platform

This is correct for now.

## 4. What env vars define identity

Primary auth and workspace identity:
- `SUPERMEGA_AUTH_REQUIRED`
- `SUPERMEGA_APP_USERNAME`
- `SUPERMEGA_APP_PASSWORD`
- `SUPERMEGA_APP_DISPLAY_NAME`
- `SUPERMEGA_APP_ROLE`
- `SUPERMEGA_WORKSPACE_SLUG`
- `SUPERMEGA_WORKSPACE_NAME`
- `SUPERMEGA_WORKSPACE_PLAN`
- `SUPERMEGA_SESSION_HOURS`

Google auth layer:
- `SUPERMEGA_GOOGLE_AUTH_ENABLED`
- `SUPERMEGA_GOOGLE_AUTH_ALLOW_AUTO_PROVISION`
- `GOOGLE_OAUTH_CLIENT_JSON`
- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`
- `GOOGLE_OAUTH_REDIRECT_URI`
- `GOOGLE_OAUTH_ALLOWED_DOMAINS`

App host routing:
- `VITE_WORKSPACE_APP_BASE`
- `VITE_WORKSPACE_API_BASE`

## 5. Current tenant model

### General SuperMega modules
- Sales System
- Operations Inbox
- Founder Brief
- Client Portal
- KPI Review
- Approvals

### YTF-first modules
- Receiving
- Task List
- Founder Brief
- KPI Review
- Approvals

Rule:
- general platform modules should stay reusable
- YTF-specific behavior should come from tenant rules and modules, not a forked codebase

## 6. Roadmap for YTF-specific branding

YTF still needs:
- YTF-specific logo asset
- YTF-specific app header treatment
- YTF-specific module ordering
- YTF-specific KPI language
- YTF-specific founder and manager review views

That is the right next step.

Do not make YTF a separate platform unless:
- compliance requires it
- scale requires it
- data isolation requirements go beyond tenant separation

## 7. Blunt rule

SuperMega should remain the default platform.

YTF should become a strong tenant on top of that platform, with:
- its own logo
- its own modules
- its own data connectors
- its own KPI rules

But not its own codebase by default.
