# SuperMega ChatGPT app

This package exposes a small, public, read-only SuperMega workflow catalogue and pilot-planning app over MCP Streamable HTTP.

It intentionally does **not** expose customer workspaces, leads, local files, shell execution, approvals, payments, publishing, messages, access changes, or production writes.

## Tools

| Tool | Purpose | Effect |
| --- | --- | --- |
| `search` | Find a public SuperMega product, workflow, module, or template | Read-only catalogue search |
| `fetch` | Retrieve one current workflow and its readiness gate | Read-only catalogue fetch |
| `prepare_pilot_brief` | Compute a bounded draft pilot brief and render it in ChatGPT | In-memory computation only |

All tools explicitly advertise anonymous access because they operate only on public product metadata. If a future tool reads customer-specific data or changes state, it must use OAuth 2.1 and verify token signature, issuer, audience, expiry, and scopes before execution.

## Local development

```powershell
npm.cmd ci --ignore-scripts
npm.cmd run check
npm.cmd start
```

The local endpoint is `http://127.0.0.1:2091/mcp`; health is available at `http://127.0.0.1:2091/healthz`.

Environment variables:

- `PORT` - listener port, default `2091`.
- `SUPERMEGA_MCP_HOST` - listener host, default `127.0.0.1`.
- `SUPERMEGA_MCP_ALLOWED_HOSTS` - comma-separated hostname allowlist, mandatory for a non-local bind and for custom deployment domains.
- `SUPERMEGA_MCP_ALLOWED_ORIGINS` - comma-separated exact browser origins; defaults to `https://chatgpt.com` while requests without an `Origin` header remain valid for server-to-server MCP clients.
- `SUPERMEGA_WIDGET_DOMAIN` - dedicated HTTPS widget origin, default `https://mcp.supermega.dev`.
- `SUPERMEGA_MCP_REQUEST_LIMIT` - per-process requests per minute, default `60`.
- `SUPERMEGA_MCP_MAX_CONCURRENT_REQUESTS` - per-process active request ceiling, default `16`.
- `SUPERMEGA_MCP_REQUEST_TIMEOUT_MS` - absolute request deadline, default `15000`.

For ChatGPT Developer Mode, expose the local port through an HTTPS tunnel, add the resulting URL with `/mcp`, and refresh the app after descriptor or widget changes.

## Vercel deployment contract

Use `chatgpt-app/` as the root directory of a new, dedicated Vercel project. Do not attach it to the existing `supermega-public` website project. The package is self-contained at runtime: `catalog.snapshot.json` is the public catalogue used by the function, and the repository check fails if that snapshot drifts from the public `site-manifest.json` projection.

`vercel.json` provides canonical `/mcp` and `/healthz` routes backed by Node.js functions. It keeps Git deployment disabled so connecting the project cannot deploy this branch automatically. Vercel-provided preview, branch, and production hostnames are admitted automatically; `mcp.supermega.dev` must still be set explicitly in `SUPERMEGA_MCP_ALLOWED_HOSTS` before assigning that custom domain.

Before the first preview, enable **Automatically expose System Environment Variables** in the dedicated Vercel project's environment-variable settings. Set `SUPERMEGA_DEPLOYMENT_TARGET=preview` for Preview and `SUPERMEGA_DEPLOYMENT_TARGET=production` for Production. The Vercel build runs `verify-deployment-env.mjs`; preview builds require `VERCEL_URL` or `VERCEL_BRANCH_URL`, and production builds require `VERCEL_PROJECT_PRODUCTION_URL`. An explicit custom hostname cannot bypass that check.

No OpenAI API key is used by this app. It only needs non-secret deployment configuration:

```text
SUPERMEGA_MCP_ALLOWED_HOSTS=mcp.supermega.dev
SUPERMEGA_MCP_ALLOWED_ORIGINS=https://chatgpt.com
SUPERMEGA_WIDGET_DOMAIN=https://mcp.supermega.dev
```

After the owner approves creation of the dedicated project, use an explicit project and team when linking. Build and test a preview first, inspect its runtime logs, validate `/healthz` and `/mcp` in Developer Mode, and promote that exact preview only after it passes. Do not use a direct production deployment as the first live test.

After the dedicated project is explicitly linked on a trusted owner machine, run a non-deploying build with pinned Vercel CLI `50.28.0`, then run `npm run verify:vercel-output`. The verifier checks that the catalogue and widget were bundled and invokes the generated health and MCP functions. For an offline contract build, set `SUPERMEGA_DEPLOYMENT_TARGET=offline-contract`, `SUPERMEGA_ALLOW_OFFLINE_VERCEL_BUILD=1`, and a `.invalid` allowed hostname only for that build process. Do not place a deployment-capable Vercel token in a workflow that checks out and executes pull-request code.

## Production gate

Do not submit or call this production-ready until all of these are true:

1. A stable HTTPS `/mcp` endpoint and the dedicated widget origin are live from the dedicated ChatGPT app project.
2. Deployment-edge host/origin allowlisting, distributed request limits, logs, latency/error metrics, and incident ownership are active; the process-level limits are defense in depth only.
3. The live endpoint passes MCP Inspector and ChatGPT Developer Mode tests.
4. SuperMega business verification and the required OpenAI app-management permissions are confirmed.
5. The published privacy policy, support contact, app metadata, logo, screenshots, and review prompts match the shipped app.

The generated submission import is at `../chatgpt-app-submission.json`. It is an accurate review draft, not evidence that the endpoint has been deployed or submitted.
