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

- `PORT` — listener port, default `2091`.
- `SUPERMEGA_MCP_HOST` — listener host, default `127.0.0.1`.
- `SUPERMEGA_MCP_ALLOWED_HOSTS` — comma-separated hostname allowlist, mandatory for a non-local bind.
- `SUPERMEGA_MCP_ALLOWED_ORIGINS` — comma-separated exact browser origins; defaults to `https://chatgpt.com` while requests without an `Origin` header remain valid for server-to-server MCP clients.
- `SUPERMEGA_WIDGET_DOMAIN` — dedicated HTTPS widget origin, default `https://mcp.supermega.dev`.

For ChatGPT Developer Mode, expose the local port through an HTTPS tunnel, add the resulting URL with `/mcp`, and refresh the app after descriptor or widget changes.

## Production gate

Do not submit or call this production-ready until all of these are true:

1. A stable HTTPS `/mcp` endpoint and the dedicated widget origin are live.
2. Deployment-edge host/origin allowlisting, distributed request limits, logs, latency/error metrics, and incident ownership are active; the process-level limits are defense in depth only.
3. The live endpoint passes MCP Inspector and ChatGPT Developer Mode tests.
4. SuperMega business verification and the required OpenAI app-management permissions are confirmed.
5. The published privacy policy, support contact, app metadata, logo, screenshots, and review prompts match the shipped app.

The generated submission import is at `../chatgpt-app-submission.json`. It is an accurate review draft, not evidence that the endpoint has been deployed or submitted.
