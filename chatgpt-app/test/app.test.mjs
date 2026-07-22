import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Socket } from "node:net";
import { after, before, test } from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

import {
  DEFAULT_WIDGET_DOMAIN,
  TOOL_REVIEW,
  WIDGET_URI,
  createHttpApp,
} from "../server.mjs";
import { CATALOG } from "../catalog.mjs";

let httpServer;
let baseUrl;
let client;

async function listen(app) {
  const server = await new Promise((resolvePromise, rejectPromise) => {
    const candidate = app.listen(0, "127.0.0.1", () => resolvePromise(candidate));
    candidate.once("error", rejectPromise);
  });
  const address = server.address();
  return { server, url: `http://127.0.0.1:${address.port}` };
}

before(async () => {
  const app = createHttpApp({
    host: "127.0.0.1",
    allowedHosts: ["127.0.0.1"],
    widgetDomain: DEFAULT_WIDGET_DOMAIN,
  });
  const listening = await listen(app);
  httpServer = listening.server;
  const address = httpServer.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
  client = new Client({ name: "supermega-contract-test", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`)));
});

after(async () => {
  await client?.close().catch(() => undefined);
  await new Promise((resolvePromise) => httpServer?.close(resolvePromise));
});

test("health endpoint states the public read-only boundary", async () => {
  const response = await fetch(`${baseUrl}/healthz`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.status, "ok");
  assert.equal(body.access, "public-read-only");
  assert.equal(body.service, "supermega-chatgpt-app");
});

test("anonymous catalogue is restricted to the public Commerce and Production projection", () => {
  assert.deepEqual(
    CATALOG.map((item) => item.id).sort(),
    ["commerce", "production"],
  );
  const source = readFileSync(new URL("../catalog.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /hq[\\/]portfolio|\.\.\/["']?hq/i);
  assert.doesNotMatch(JSON.stringify(CATALOG), /agent teams \(internal\)|prototype-local/i);
  assert.ok(CATALOG.every((item) => item.modules.length > 0 && item.templates.length > 0));
});

test("MCP exposes only the three bounded tools with complete review metadata", async () => {
  const result = await client.listTools();
  const tools = [...result.tools].sort((left, right) => left.name.localeCompare(right.name));
  assert.deepEqual(
    tools.map((tool) => tool.name),
    ["fetch", "prepare_pilot_brief", "search"],
  );

  for (const tool of tools) {
    assert.deepEqual(tool.annotations, {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    });
    assert.ok(tool.outputSchema, `${tool.name} must declare outputSchema`);
    assert.deepEqual(tool._meta?.securitySchemes, [{ type: "noauth" }]);
    assert.equal(tool.title, TOOL_REVIEW[tool.name].title);
    assert.equal(tool.description, TOOL_REVIEW[tool.name].description);
  }

  const serialized = JSON.stringify(tools);
  assert.doesNotMatch(
    serialized,
    /mark1_execute|mark1_files|mark1_leads|lead-pipeline|SUPERMEGA_APP_PASSWORD|requested_by/,
  );
  const pilotTool = tools.find((tool) => tool.name === "prepare_pilot_brief");
  assert.ok(pilotTool.inputSchema.required.includes("template_id"));
});

test("search and fetch follow the read-only knowledge result contract", async () => {
  const searchResult = await client.callTool({
    name: "search",
    arguments: { query: "chat orders stock fulfilment" },
  });
  assert.equal(searchResult.isError, undefined);
  assert.equal(searchResult.content.length, 1);
  assert.equal(searchResult.content[0].type, "text");
  const searchPayload = JSON.parse(searchResult.content[0].text);
  assert.deepEqual(searchPayload, searchResult.structuredContent);
  assert.ok(searchPayload.results.some((item) => item.id === "commerce"));

  const fetchResult = await client.callTool({
    name: "fetch",
    arguments: { id: "production" },
  });
  assert.equal(fetchResult.content.length, 1);
  const fetchPayload = JSON.parse(fetchResult.content[0].text);
  assert.deepEqual(fetchPayload, fetchResult.structuredContent);
  assert.equal(fetchPayload.id, "production");
  assert.match(fetchPayload.url, /^https:\/\/app\.supermega\.dev\//);
  assert.ok(fetchPayload.metadata.modules.includes("Equipment and maintenance"));
  assert.ok(fetchPayload.metadata.templates.some((item) => item.id === "maintenance-downtime"));
});

test("pilot brief is deterministic, draft-only, and fails closed on a mismatched template", async () => {
  const input = {
    product_id: "commerce",
    template_id: "social-commerce",
    goal: "Reduce the time needed to turn chat orders into fulfilled orders.",
    current_system: "chat",
    timeline_days: 14,
  };
  const first = await client.callTool({ name: "prepare_pilot_brief", arguments: input });
  const second = await client.callTool({ name: "prepare_pilot_brief", arguments: input });
  assert.deepEqual(first.structuredContent, second.structuredContent);
  assert.equal(first.structuredContent.action_mode, "draft_only");
  assert.equal(first.structuredContent.persisted, false);
  assert.equal(first.structuredContent.approval_required, true);
  assert.equal(first.structuredContent.product.template, "Social commerce");
  assert.match(
    first.structuredContent.limits.join(" "),
    /does not send messages, publish content, take payment, or change production data/i,
  );

  const invalid = await client.callTool({
    name: "prepare_pilot_brief",
    arguments: { ...input, product_id: "production" },
  });
  assert.equal(invalid.isError, true);
  assert.match(invalid.content[0].text, /does not belong to Production/);
});

test("widget resource has a narrow CSP and no network or unsafe HTML rendering", async () => {
  const result = await client.readResource({ uri: WIDGET_URI });
  assert.equal(result.contents.length, 1);
  const resource = result.contents[0];
  assert.equal(resource.mimeType, "text/html;profile=mcp-app");
  assert.equal(resource._meta?.ui?.domain, DEFAULT_WIDGET_DOMAIN);
  assert.deepEqual(resource._meta?.ui?.csp, { connectDomains: [], resourceDomains: [] });
  assert.doesNotMatch(resource.text, /\bfetch\s*\(|innerHTML\s*=|<script[^>]+src=/i);
  assert.match(resource.text, /ui\/notifications\/tool-result/);
});

test("unsupported MCP methods fail closed", async () => {
  const getResponse = await fetch(`${baseUrl}/mcp`);
  assert.equal(getResponse.status, 405);
  assert.equal(getResponse.headers.get("allow"), "POST");
  const deleteResponse = await fetch(`${baseUrl}/mcp`, { method: "DELETE" });
  assert.equal(deleteResponse.status, 405);
});

test("MCP validates supplied origins while allowing server-to-server requests without one", async () => {
  const rejected = await fetch(`${baseUrl}/mcp`, {
    headers: { Origin: "https://evil.example" },
  });
  assert.equal(rejected.status, 403);
  assert.equal((await rejected.json()).error.message, "Origin is not allowed.");

  const approved = await fetch(`${baseUrl}/mcp`, {
    headers: { Origin: "https://chatgpt.com" },
  });
  assert.equal(approved.status, 405);
  const noOrigin = await fetch(`${baseUrl}/mcp`);
  assert.equal(noOrigin.status, 405);
});

test("parser failures return bounded JSON-RPC errors without paths or stack traces", async () => {
  const malformed = await fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://chatgpt.com" },
    body: "{",
  });
  assert.equal(malformed.status, 400);
  const malformedText = await malformed.text();
  assert.match(malformedText, /Invalid JSON request body/);
  assert.doesNotMatch(malformedText, /<html|node_modules|[A-Z]:\\|server\.mjs:\d+/i);

  const oversized = await fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://chatgpt.com" },
    body: JSON.stringify({ value: "x".repeat(110_000) }),
  });
  assert.equal(oversized.status, 413);
  const oversizedText = await oversized.text();
  assert.match(oversizedText, /Request body is too large/);
  assert.doesNotMatch(oversizedText, /<html|node_modules|[A-Z]:\\|server\.mjs:\d+/i);
});

test("anonymous MCP requests have a process-level rate limit", async () => {
  const app = createHttpApp({
    host: "127.0.0.1",
    allowedHosts: ["127.0.0.1"],
    requestLimit: 1,
  });
  const listening = await listen(app);
  try {
    const first = await fetch(`${listening.url}/mcp`, {
      headers: { Origin: "https://evil.example" },
    });
    assert.equal(first.status, 403);
    const second = await fetch(`${listening.url}/mcp`, {
      headers: { Origin: "https://evil.example" },
    });
    assert.equal(second.status, 429);
    assert.equal((await second.json()).error.message, "Request limit exceeded.");
  } finally {
    await new Promise((resolvePromise) => listening.server.close(resolvePromise));
  }
});

test("absolute deadline and concurrency guards stop a trickled JSON body", async () => {
  const app = createHttpApp({
    host: "127.0.0.1",
    allowedHosts: ["127.0.0.1"],
    requestLimit: 10,
    maxConcurrentRequests: 1,
    requestTimeoutMs: 1_000,
  });
  const listening = await listen(app);
  const port = listening.server.address().port;
  const socket = new Socket();
  let rawResponse = "";
  let trickle;
  const closed = new Promise((resolvePromise, rejectPromise) => {
    const timer = setTimeout(() => rejectPromise(new Error("Slow request was not closed.")), 2_500);
    socket.setEncoding("utf8");
    socket.on("data", (chunk) => {
      rawResponse += chunk;
    });
    socket.once("close", () => {
      clearTimeout(timer);
      clearInterval(trickle);
      resolvePromise();
    });
    socket.once("error", (error) => {
      clearTimeout(timer);
      clearInterval(trickle);
      rejectPromise(error);
    });
  });

  try {
    await new Promise((resolvePromise, rejectPromise) => {
      socket.connect(port, "127.0.0.1", resolvePromise);
      socket.once("error", rejectPromise);
    });
    const startedAt = Date.now();
    socket.write(
      [
        "POST /mcp HTTP/1.1",
        `Host: 127.0.0.1:${port}`,
        "Content-Type: application/json",
        "Content-Length: 100",
        "Connection: keep-alive",
        "",
        "{",
      ].join("\r\n"),
    );
    trickle = setInterval(() => {
      if (!socket.destroyed) socket.write(" ");
    }, 250);
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));

    const concurrent = await fetch(`${listening.url}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    assert.equal(concurrent.status, 503);
    assert.equal((await concurrent.json()).error.message, "Server is busy. Retry later.");

    await closed;
    assert.ok(Date.now() - startedAt < 2_300);
    assert.match(rawResponse, /HTTP\/1\.1 408 Request Timeout/);
    assert.match(rawResponse, /Request timed out/);
  } finally {
    socket.destroy();
    await new Promise((resolvePromise) => listening.server.close(resolvePromise));
  }
});

test("a rejected host closes an incomplete request before body parsing", async () => {
  const app = createHttpApp({
    host: "127.0.0.1",
    allowedHosts: ["127.0.0.1"],
    requestTimeoutMs: 2_000,
  });
  const listening = await listen(app);
  const port = listening.server.address().port;
  const socket = new Socket();
  let rawResponse = "";
  const closed = new Promise((resolvePromise, rejectPromise) => {
    const timer = setTimeout(() => rejectPromise(new Error("Rejected request socket stayed open.")), 1_000);
    socket.setEncoding("utf8");
    socket.on("data", (chunk) => {
      rawResponse += chunk;
    });
    socket.once("close", () => {
      clearTimeout(timer);
      resolvePromise();
    });
    socket.once("error", (error) => {
      clearTimeout(timer);
      rejectPromise(error);
    });
  });

  try {
    await new Promise((resolvePromise, rejectPromise) => {
      socket.connect(port, "127.0.0.1", resolvePromise);
      socket.once("error", rejectPromise);
    });
    socket.write(
      [
        "POST /mcp HTTP/1.1",
        "Host: evil.example",
        "Content-Type: application/json",
        "Content-Length: 100",
        "Connection: keep-alive",
        "",
        "{",
      ].join("\r\n"),
    );
    await closed;
    assert.match(rawResponse, /HTTP\/1\.1 403 Forbidden/);
    assert.match(rawResponse, /Host is not allowed/);
    assert.match(rawResponse, /Connection: close/i);
  } finally {
    socket.destroy();
    await new Promise((resolvePromise) => listening.server.close(resolvePromise));
  }
});
