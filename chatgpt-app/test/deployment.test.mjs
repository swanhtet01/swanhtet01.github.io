import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

import { createVercelHandler, resolveDeploymentHosts } from "../deployment.mjs";
import { verifyDeploymentEnvironment } from "../verify-deployment-env.mjs";

async function listenHandler(handler) {
  const server = createServer(handler);
  await new Promise((resolvePromise, rejectPromise) => {
    server.listen(0, "127.0.0.1", resolvePromise);
    server.once("error", rejectPromise);
  });
  return { server, port: server.address().port };
}

async function request({ port, path = "/", method = "GET", headers = {}, body }) {
  const http = await import("node:http");
  return new Promise((resolvePromise, rejectPromise) => {
    const outgoing = http.request(
      { hostname: "127.0.0.1", port, path, method, headers },
      (incoming) => {
        incoming.setEncoding("utf8");
        let text = "";
        incoming.on("data", (chunk) => {
          text += chunk;
        });
        incoming.on("end", () =>
          resolvePromise({ status: incoming.statusCode, headers: incoming.headers, text }),
        );
      },
    );
    outgoing.once("error", rejectPromise);
    if (body) outgoing.write(body);
    outgoing.end();
  });
}

test("deployment hosts combine explicit and Vercel-provided domains", () => {
  assert.deepEqual(
    resolveDeploymentHosts({
      SUPERMEGA_MCP_ALLOWED_HOSTS: "mcp.supermega.dev, https://review.supermega.dev",
      VERCEL_URL: "supermega-chatgpt-git-main.vercel.app",
      VERCEL_BRANCH_URL: "supermega-chatgpt-main.vercel.app",
      VERCEL_PROJECT_PRODUCTION_URL: "supermega-chatgpt.vercel.app",
    }),
    [
      "mcp.supermega.dev",
      "review.supermega.dev",
      "supermega-chatgpt-git-main.vercel.app",
      "supermega-chatgpt-main.vercel.app",
      "supermega-chatgpt.vercel.app",
    ],
  );
  assert.throws(
    () => resolveDeploymentHosts({ SUPERMEGA_MCP_ALLOWED_HOSTS: "https://example.com/private" }),
    /hostnames/,
  );
});

test("deployment readiness requires a host and exact HTTPS origins", () => {
  assert.deepEqual(
    verifyDeploymentEnvironment({
      SUPERMEGA_DEPLOYMENT_TARGET: "preview",
      VERCEL_ENV: "preview",
      VERCEL_URL: "supermega-chatgpt-preview.vercel.app",
    }),
    {
      ready: true,
      deployment_target: "preview",
      host_count: 1,
      origin_count: 1,
      widget_domain_configured: true,
    },
  );
  assert.throws(() => verifyDeploymentEnvironment({}), /SUPERMEGA_DEPLOYMENT_TARGET/);
  assert.throws(
    () =>
      verifyDeploymentEnvironment({
        SUPERMEGA_DEPLOYMENT_TARGET: "preview",
        SUPERMEGA_MCP_ALLOWED_HOSTS: "mcp.supermega.dev",
      }),
    /Preview builds require VERCEL_URL/,
  );
  assert.equal(
    verifyDeploymentEnvironment({
      SUPERMEGA_DEPLOYMENT_TARGET: "offline-contract",
      SUPERMEGA_ALLOW_OFFLINE_VERCEL_BUILD: "1",
      SUPERMEGA_MCP_ALLOWED_HOSTS: "contract-build.invalid",
    }).deployment_target,
    "offline-contract",
  );
  assert.throws(
    () =>
      verifyDeploymentEnvironment({
        SUPERMEGA_DEPLOYMENT_TARGET: "offline-contract",
        SUPERMEGA_ALLOW_OFFLINE_VERCEL_BUILD: "1",
        SUPERMEGA_MCP_ALLOWED_HOSTS: "contract-build.invalid",
        VERCEL_ENV: "preview",
      }),
    /cannot run inside a Vercel environment/,
  );
  assert.throws(
    () =>
      verifyDeploymentEnvironment({
        SUPERMEGA_DEPLOYMENT_TARGET: "offline-contract",
        SUPERMEGA_ALLOW_OFFLINE_VERCEL_BUILD: "1",
        SUPERMEGA_MCP_ALLOWED_HOSTS: "mcp.supermega.dev",
      }),
    /require \.invalid hostnames/,
  );
  assert.throws(
    () =>
      verifyDeploymentEnvironment({
        SUPERMEGA_DEPLOYMENT_TARGET: "preview",
        VERCEL_URL: "supermega-chatgpt-preview.vercel.app",
        SUPERMEGA_WIDGET_DOMAIN: "http://mcp.supermega.dev",
      }),
    /Widget domain must be an exact HTTPS origin/,
  );
});

test("Vercel health handler normalizes its route and accepts the automatic deployment host", async () => {
  const handler = createVercelHandler("/healthz", {
    environment: { VERCEL_URL: "supermega-chatgpt-preview.vercel.app" },
  });
  const listening = await listenHandler(handler);
  try {
    const response = await request({
      port: listening.port,
      path: "/api/healthz?probe=1",
      headers: { Host: "supermega-chatgpt-preview.vercel.app" },
    });
    assert.equal(response.status, 200);
    assert.equal(JSON.parse(response.text).access, "public-read-only");
  } finally {
    await new Promise((resolvePromise) => listening.server.close(resolvePromise));
  }
});

test("Vercel MCP handler trusts one platform proxy and still follows the MCP method contract", async () => {
  const handler = createVercelHandler("/mcp", {
    environment: { VERCEL_URL: "supermega-chatgpt-preview.vercel.app" },
  });
  const listening = await listenHandler(handler);
  try {
    const response = await request({
      port: listening.port,
      path: "/api/mcp",
      headers: {
        Host: "supermega-chatgpt-preview.vercel.app",
        "X-Forwarded-For": "203.0.113.9",
      },
    });
    assert.equal(response.status, 405);
    assert.equal(JSON.parse(response.text).error.message, "Method not allowed.");
  } finally {
    await new Promise((resolvePromise) => listening.server.close(resolvePromise));
  }
});

test("Vercel MCP handler completes a stateless MCP handshake through the API route", async () => {
  const handler = createVercelHandler("/mcp", {
    environment: { SUPERMEGA_MCP_ALLOWED_HOSTS: "127.0.0.1" },
  });
  const listening = await listenHandler(handler);
  const client = new Client({ name: "vercel-handler-test", version: "1.0.0" });
  try {
    await client.connect(
      new StreamableHTTPClientTransport(
        new URL(`http://127.0.0.1:${listening.port}/api/mcp`),
      ),
    );
    const result = await client.listTools();
    assert.deepEqual(
      result.tools.map((tool) => tool.name).sort(),
      ["fetch", "prepare_pilot_brief", "search"],
    );
  } finally {
    await client.close().catch(() => undefined);
    await new Promise((resolvePromise) => listening.server.close(resolvePromise));
  }
});

test("misconfigured deployment fails closed without exposing an exception", async () => {
  const errors = [];
  const handler = createVercelHandler("/healthz", {
    environment: {},
    reportConfigurationError: (error) => errors.push(error),
  });
  const listening = await listenHandler(handler);
  try {
    const response = await request({ port: listening.port, headers: { Host: "unknown.example" } });
    assert.equal(response.status, 503);
    assert.match(response.headers["content-type"], /^application\/json/);
    assert.equal(response.headers.connection, "close");
    assert.equal(JSON.parse(response.text).error.message, "Service configuration unavailable.");
    assert.doesNotMatch(response.text, /stack|deployment\.mjs|node_modules/i);
    assert.equal(errors.length, 1);
  } finally {
    await new Promise((resolvePromise) => listening.server.close(resolvePromise));
  }
});
