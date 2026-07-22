import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { createServer } from "node:http";
import { basename, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const PACKAGE_ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const OUTPUT_ROOT = resolve(PACKAGE_ROOT, process.argv[2] || ".vercel/output");
const FUNCTIONS_ROOT = resolve(OUTPUT_ROOT, "functions");

function walkDirectories(root) {
  if (!existsSync(root)) return [];
  const found = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const path = resolve(root, entry.name);
    found.push(path, ...walkDirectories(path));
  }
  return found;
}

function walkFiles(root) {
  if (!existsSync(root)) return [];
  const found = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = resolve(root, entry.name);
    if (entry.isDirectory()) found.push(...walkFiles(path));
    else if (entry.isFile()) found.push(path);
  }
  return found;
}

function findFunction(functionDirectories, name) {
  const pattern = new RegExp(`^${name}(?:\\.[^.]+)?\\.func$`, "i");
  const matches = functionDirectories.filter((directory) => pattern.test(basename(directory)));
  assert.equal(
    matches.length,
    1,
    `Expected one ${name} function bundle, found ${matches.map((path) => relative(FUNCTIONS_ROOT, path)).join(", ") || "none"}.`,
  );
  return matches[0];
}

async function loadHandler(functionDirectory) {
  const configPath = resolve(functionDirectory, ".vc-config.json");
  assert.ok(existsSync(configPath), `${relative(OUTPUT_ROOT, configPath)} is missing.`);
  const config = JSON.parse(readFileSync(configPath, "utf8"));
  assert.match(config.runtime, /^nodejs24(?:\.x)?$/);
  assert.equal(typeof config.handler, "string");
  const handlerPath = resolve(functionDirectory, config.handler);
  assert.ok(existsSync(handlerPath), `${relative(OUTPUT_ROOT, handlerPath)} is missing.`);
  const module = await import(pathToFileURL(handlerPath).href);
  const handler = module.default?.default || module.default || module.handler;
  assert.equal(typeof handler, "function", `${config.handler} does not export a Node request handler.`);
  return handler;
}

async function listen(handler) {
  const server = createServer(handler);
  await new Promise((resolvePromise, rejectPromise) => {
    server.listen(0, "127.0.0.1", resolvePromise);
    server.once("error", rejectPromise);
  });
  return { server, url: `http://127.0.0.1:${server.address().port}` };
}

const outputConfigPath = resolve(OUTPUT_ROOT, "config.json");
assert.ok(existsSync(outputConfigPath), "Vercel Build Output config.json is missing.");
const outputConfig = JSON.parse(readFileSync(outputConfigPath, "utf8"));
assert.equal(outputConfig.version, 3);

const functionDirectories = walkDirectories(FUNCTIONS_ROOT).filter((path) => path.endsWith(".func"));
const mcpFunction = findFunction(functionDirectories, "mcp");
const healthFunction = findFunction(functionDirectories, "healthz");
const mcpFiles = walkFiles(mcpFunction).map((path) => relative(mcpFunction, path).replaceAll("\\", "/"));
assert.ok(mcpFiles.some((path) => path.endsWith("catalog.snapshot.json")), "MCP bundle omitted the public catalogue snapshot.");
assert.ok(mcpFiles.some((path) => path.endsWith("public/pilot-brief-v1.html")), "MCP bundle omitted the widget HTML.");

const previousAllowedHosts = process.env.SUPERMEGA_MCP_ALLOWED_HOSTS;
process.env.SUPERMEGA_MCP_ALLOWED_HOSTS = "127.0.0.1";
try {
  const health = await listen(await loadHandler(healthFunction));
  try {
    const response = await fetch(`${health.url}/api/healthz`);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).access, "public-read-only");
  } finally {
    await new Promise((resolvePromise) => health.server.close(resolvePromise));
  }

  const mcp = await listen(await loadHandler(mcpFunction));
  const client = new Client({ name: "vercel-output-contract", version: "1.0.0" });
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(`${mcp.url}/api/mcp`)));
    const tools = await client.listTools();
    assert.deepEqual(
      tools.tools.map((tool) => tool.name).sort(),
      ["fetch", "prepare_pilot_brief", "search"],
    );
  } finally {
    await client.close().catch(() => undefined);
    await new Promise((resolvePromise) => mcp.server.close(resolvePromise));
  }
} finally {
  if (previousAllowedHosts === undefined) delete process.env.SUPERMEGA_MCP_ALLOWED_HOSTS;
  else process.env.SUPERMEGA_MCP_ALLOWED_HOSTS = previousAllowedHosts;
}

console.log(
  JSON.stringify({
    ok: true,
    contract: "supermega_chatgpt_vercel_output",
    functions: [relative(FUNCTIONS_ROOT, mcpFunction), relative(FUNCTIONS_ROOT, healthFunction)],
    mcp_bundle_files: mcpFiles.length,
  }),
);
