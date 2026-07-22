#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  RESOURCE_MIME_TYPE,
  registerAppResource,
  registerAppTool,
} from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod/v4";

import {
  CATALOG_VERSION,
  CURRENT_SYSTEMS,
  PILOT_TIMELINES,
  PRODUCT_IDS,
  fetchCatalogItem,
  preparePilotBrief,
  searchCatalog,
} from "./catalog.mjs";

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const PACKAGE = JSON.parse(readFileSync(resolve(MODULE_DIR, "package.json"), "utf8"));
const WIDGET_HTML = readFileSync(resolve(MODULE_DIR, "public", "pilot-brief-v1.html"), "utf8");

export const WIDGET_URI = "ui://supermega/pilot-brief-v1.html";
export const DEFAULT_WIDGET_DOMAIN = "https://mcp.supermega.dev";
const NO_AUTH = Object.freeze([{ type: "noauth" }]);
const READ_ONLY_ANNOTATIONS = Object.freeze({
  readOnlyHint: true,
  openWorldHint: false,
  destructiveHint: false,
  idempotentHint: true,
});
const DEFAULT_ALLOWED_ORIGINS = Object.freeze(["https://chatgpt.com"]);

export const TOOL_REVIEW = Object.freeze({
  search: Object.freeze({
    title: "Search SuperMega workflows",
    description:
      "Use this when a user wants to find a public SuperMega product, workflow, module, or template. Returns catalogue links only and does not access customer data.",
    annotations: READ_ONLY_ANNOTATIONS,
  }),
  fetch: Object.freeze({
    title: "Fetch a SuperMega workflow",
    description:
      "Use this when a user chooses a SuperMega catalogue item and needs its public workflow, status, modules, templates, measurement, and next evidence gate.",
    annotations: READ_ONLY_ANNOTATIONS,
  }),
  prepare_pilot_brief: Object.freeze({
    title: "Prepare a SuperMega pilot brief",
    description:
      "Use this when a user asks to turn one SuperMega workflow into a draft 7-, 14-, or 30-day pilot brief. It computes a brief without saving, sending, publishing, approving, or accessing private data.",
    annotations: READ_ONLY_ANNOTATIONS,
  }),
});

function validateWidgetDomain(value) {
  const url = new URL(value || DEFAULT_WIDGET_DOMAIN);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) {
    throw new Error("SUPERMEGA_WIDGET_DOMAIN must use HTTPS outside localhost.");
  }
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new Error("SUPERMEGA_WIDGET_DOMAIN must be an origin without credentials, path, query, or hash.");
  }
  return url.origin;
}

function toolMeta(extra = {}) {
  return {
    securitySchemes: NO_AUTH,
    ...extra,
  };
}

const searchOutputSchema = {
  results: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      url: z.string().url(),
    }),
  ),
};

const fetchOutputSchema = {
  id: z.string(),
  title: z.string(),
  text: z.string(),
  url: z.string().url(),
  metadata: z.object({
    status: z.string(),
    category: z.string(),
    modules: z.array(z.string()),
    templates: z.array(z.object({ id: z.string(), name: z.string() })),
    next_gate: z.string(),
    catalog_version: z.string(),
  }),
};

const pilotOutputSchema = {
  schema_version: z.literal("supermega.pilot-brief.v1"),
  action_mode: z.literal("draft_only"),
  persisted: z.literal(false),
  approval_required: z.literal(true),
  product: z.object({
    id: z.string(),
    name: z.string(),
    status: z.string(),
    url: z.string().url(),
    template: z.string(),
  }),
  goal: z.string(),
  current_system: z.string(),
  timeline_days: z.union([z.literal(7), z.literal(14), z.literal(30)]),
  workflow: z.array(z.string()),
  baseline_measure: z.string(),
  acceptance_evidence: z.array(z.string()),
  owner_decisions: z.array(z.string()),
  limits: z.array(z.string()),
  next_step: z.string(),
};

function registerTools(server, widgetDomain) {
  server.registerTool(
    "search",
    {
      ...TOOL_REVIEW.search,
      inputSchema: {
        query: z
          .string()
          .trim()
          .min(1)
          .max(120)
          .describe("A short product, workflow, module, or operating-problem query."),
      },
      outputSchema: searchOutputSchema,
      securitySchemes: NO_AUTH,
      _meta: toolMeta({
        "openai/toolInvocation/invoking": "Searching workflows…",
        "openai/toolInvocation/invoked": "Workflow results ready",
      }),
    },
    async ({ query }) => {
      const payload = { results: searchCatalog(query) };
      return {
        structuredContent: payload,
        content: [{ type: "text", text: JSON.stringify(payload) }],
      };
    },
  );

  server.registerTool(
    "fetch",
    {
      ...TOOL_REVIEW.fetch,
      inputSchema: {
        id: z.enum(PRODUCT_IDS).describe("The exact item id returned by search."),
      },
      outputSchema: fetchOutputSchema,
      securitySchemes: NO_AUTH,
      _meta: toolMeta({
        "openai/toolInvocation/invoking": "Loading workflow…",
        "openai/toolInvocation/invoked": "Workflow loaded",
      }),
    },
    async ({ id }) => {
      const payload = fetchCatalogItem(id);
      if (!payload) {
        return {
          isError: true,
          content: [{ type: "text", text: "That workflow is not in the current SuperMega catalogue." }],
        };
      }
      return {
        structuredContent: payload,
        content: [{ type: "text", text: JSON.stringify(payload) }],
      };
    },
  );

  registerAppTool(
    server,
    "prepare_pilot_brief",
    {
      ...TOOL_REVIEW.prepare_pilot_brief,
      inputSchema: {
        product_id: z.enum(PRODUCT_IDS).describe("A product id returned by search or fetch."),
        template_id: z
          .string()
          .trim()
          .min(1)
          .max(64)
          .describe("The exact template id returned by fetch for the selected product."),
        goal: z
          .string()
          .trim()
          .min(10)
          .max(240)
          .describe(
            "The operational outcome to test. Do not include names, customer records, credentials, or confidential data.",
          ),
        current_system: z
          .enum(CURRENT_SYSTEMS)
          .describe("The broad type of record or system used today."),
        timeline_days: z
          .union(PILOT_TIMELINES.map((days) => z.literal(days)))
          .describe("A bounded pilot duration of 7, 14, or 30 days."),
      },
      outputSchema: pilotOutputSchema,
      securitySchemes: NO_AUTH,
      _meta: toolMeta({
        ui: { resourceUri: WIDGET_URI, visibility: ["model", "app"] },
        "openai/outputTemplate": WIDGET_URI,
        "openai/toolInvocation/invoking": "Preparing pilot brief…",
        "openai/toolInvocation/invoked": "Pilot brief ready",
      }),
    },
    async (input) => {
      try {
        const payload = preparePilotBrief(input);
        return {
          structuredContent: payload,
          content: [
            {
              type: "text",
              text: `Prepared a ${payload.timeline_days}-day draft pilot brief for ${payload.product.name}. It is not saved and still requires human approval.`,
            },
          ],
          _meta: {},
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: error instanceof Error ? error.message : "The pilot brief could not be prepared.",
            },
          ],
        };
      }
    },
  );

  const resourceMeta = {
    ui: {
      prefersBorder: true,
      domain: widgetDomain,
      csp: { connectDomains: [], resourceDomains: [] },
    },
    "openai/widgetDescription":
      "A compact SuperMega pilot brief showing the selected workflow, timeline, baseline, acceptance evidence, and human authority boundary.",
    "openai/widgetPrefersBorder": true,
    "openai/widgetDomain": widgetDomain,
    "openai/widgetCSP": { connect_domains: [], resource_domains: [] },
  };

  registerAppResource(
    server,
    "SuperMega pilot brief",
    WIDGET_URI,
    {
      title: "SuperMega pilot brief",
      description: "Read-only rendered pilot brief for the prepare_pilot_brief tool.",
      _meta: resourceMeta,
    },
    async () => ({
      contents: [
        {
          uri: WIDGET_URI,
          mimeType: RESOURCE_MIME_TYPE,
          text: WIDGET_HTML,
          _meta: resourceMeta,
        },
      ],
    }),
  );
}

export function createSuperMegaMcpServer(options = {}) {
  const widgetDomain = validateWidgetDomain(
    options.widgetDomain || process.env.SUPERMEGA_WIDGET_DOMAIN || DEFAULT_WIDGET_DOMAIN,
  );
  const server = new McpServer(
    { name: "supermega", version: PACKAGE.version },
    { capabilities: { tools: {}, resources: {} } },
  );
  registerTools(server, widgetDomain);
  return server;
}

function methodNotAllowed(req, res) {
  res.setHeader("Allow", "POST");
  rejectJsonRpc(req, res, 405, -32000, "Method not allowed.");
}

function normalizeOrigins(origins) {
  return [...new Set((origins || DEFAULT_ALLOWED_ORIGINS).map((value) => new URL(value).origin))];
}

function jsonRpcError(res, status, code, message) {
  res.status(status).json({ jsonrpc: "2.0", error: { code, message }, id: null });
}

function rejectJsonRpc(req, res, status, code, message) {
  res.shouldKeepAlive = false;
  res.setHeader("Connection", "close");
  res.once("finish", () => {
    if (!req.socket.destroyed) req.socket.end();
  });
  jsonRpcError(res, status, code, message);
}

function absoluteRequestDeadline(requestTimeoutMs) {
  return (req, res, next) => {
    const timer = setTimeout(() => {
      if (res.writableEnded || res.destroyed) return;
      if (!res.headersSent) {
        rejectJsonRpc(req, res, 408, -32000, "Request timed out.");
      } else {
        res.destroy();
      }
    }, requestTimeoutMs);
    timer.unref();
    const clearDeadline = () => clearTimeout(timer);
    res.once("finish", clearDeadline);
    res.once("close", clearDeadline);
    next();
  };
}

function hostGuard(allowedHosts) {
  return (req, res, next) => {
    const header = req.get("host");
    if (!header) {
      rejectJsonRpc(req, res, 403, -32000, "Host is not allowed.");
      return;
    }
    let hostname;
    try {
      hostname = new URL(`http://${header}`).hostname.toLowerCase();
    } catch {
      rejectJsonRpc(req, res, 403, -32000, "Host is not allowed.");
      return;
    }
    if (!allowedHosts.includes(hostname)) {
      rejectJsonRpc(req, res, 403, -32000, "Host is not allowed.");
      return;
    }
    next();
  };
}

export function createHttpApp(options = {}) {
  const host = options.host || "127.0.0.1";
  const localHosts = ["127.0.0.1", "localhost", "::1"];
  const allowedHosts = options.allowedHosts?.length
    ? parseAllowedHosts(options.allowedHosts.join(","))
    : localHosts.includes(host)
      ? ["127.0.0.1", "localhost", "[::1]"]
      : [];
  if (allowedHosts.length === 0) {
    throw new Error("Non-local MCP binding requires an allowed host list.");
  }
  const allowedOrigins = normalizeOrigins(options.allowedOrigins);
  const requestLimit = Number(options.requestLimit || 60);
  const maxConcurrentRequests = Number(options.maxConcurrentRequests || 16);
  const requestTimeoutMs = Number(options.requestTimeoutMs || 15_000);
  if (!Number.isInteger(requestLimit) || requestLimit < 1 || requestLimit > 10_000) {
    throw new Error("requestLimit must be an integer between 1 and 10000.");
  }
  if (!Number.isInteger(maxConcurrentRequests) || maxConcurrentRequests < 1 || maxConcurrentRequests > 256) {
    throw new Error("maxConcurrentRequests must be an integer between 1 and 256.");
  }
  if (!Number.isInteger(requestTimeoutMs) || requestTimeoutMs < 1_000 || requestTimeoutMs > 120_000) {
    throw new Error("requestTimeoutMs must be an integer between 1000 and 120000.");
  }
  const app = express();
  app.disable("x-powered-by");
  app.use(absoluteRequestDeadline(requestTimeoutMs));
  app.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Content-Type-Options", "nosniff");
    next();
  });
  app.use(hostGuard(allowedHosts));

  app.get("/healthz", (_req, res) => {
    res.json({
      status: "ok",
      service: "supermega-chatgpt-app",
      version: PACKAGE.version,
      catalog_version: CATALOG_VERSION,
      access: "public-read-only",
    });
  });

  app.use(
    "/mcp",
    rateLimit({
      windowMs: 60_000,
      limit: requestLimit,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      handler: (req, res) => rejectJsonRpc(req, res, 429, -32000, "Request limit exceeded."),
    }),
  );

  let activeRequests = 0;
  app.use("/mcp", (req, res, next) => {
    if (req.method !== "POST") {
      next();
      return;
    }
    if (activeRequests >= maxConcurrentRequests) {
      rejectJsonRpc(req, res, 503, -32000, "Server is busy. Retry later.");
      return;
    }
    activeRequests += 1;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      activeRequests -= 1;
    };
    res.once("finish", release);
    res.once("close", release);
    next();
  });

  app.use("/mcp", (req, res, next) => {
    const suppliedOrigin = req.get("origin");
    if (!suppliedOrigin) {
      next();
      return;
    }
    let normalizedOrigin;
    try {
      normalizedOrigin = new URL(suppliedOrigin).origin;
    } catch {
      rejectJsonRpc(req, res, 403, -32000, "Origin is not allowed.");
      return;
    }
    if (!allowedOrigins.includes(normalizedOrigin)) {
      rejectJsonRpc(req, res, 403, -32000, "Origin is not allowed.");
      return;
    }
    next();
  });

  app.use("/mcp", (req, res, next) => {
    if (req.method === "POST" && !req.is("application/json")) {
      rejectJsonRpc(req, res, 415, -32600, "Content-Type must be application/json.");
      return;
    }
    next();
  });
  app.use("/mcp", express.json({ limit: "64kb", strict: true }));

  app.post("/mcp", async (req, res) => {
    const server = createSuperMegaMcpServer(options);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    let closed = false;
    const close = async () => {
      if (closed) return;
      closed = true;
      await transport.close().catch(() => undefined);
      await server.close().catch(() => undefined);
    };
    res.once("close", () => void close());

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error("SuperMega MCP request failed:", error instanceof Error ? error.name : "Error");
      if (!res.headersSent) {
        rejectJsonRpc(req, res, 500, -32603, "Internal server error.");
      }
    } finally {
      if (res.writableEnded) {
        await close();
      }
    }
  });

  app.get("/mcp", (req, res) => methodNotAllowed(req, res));
  app.delete("/mcp", (req, res) => methodNotAllowed(req, res));
  app.use((req, res) => rejectJsonRpc(req, res, 404, -32601, "Route not found."));
  app.use((error, req, res, next) => {
    if (res.headersSent) {
      next(error);
      return;
    }
    if (error?.type === "entity.too.large") {
      rejectJsonRpc(req, res, 413, -32000, "Request body is too large.");
      return;
    }
    if (error instanceof SyntaxError) {
      rejectJsonRpc(req, res, 400, -32700, "Invalid JSON request body.");
      return;
    }
    rejectJsonRpc(req, res, 500, -32603, "Internal server error.");
  });
  return app;
}

function parseAllowedHosts(value) {
  if (!value) return [];
  const hosts = value
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
  for (const host of hosts) {
    if (!/^(?:localhost|127\.0\.0\.1|\[::1\]|[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?)$/.test(host)) {
      throw new Error(`Invalid host in SUPERMEGA_MCP_ALLOWED_HOSTS: ${host}`);
    }
  }
  return [...new Set(hosts)];
}

function parseAllowedOrigins(value) {
  if (!value) return [...DEFAULT_ALLOWED_ORIGINS];
  return normalizeOrigins(value.split(",").map((origin) => origin.trim()).filter(Boolean));
}

export async function startServer(options = {}) {
  const port = Number(options.port || process.env.PORT || 2091);
  const host = options.host || process.env.SUPERMEGA_MCP_HOST || "127.0.0.1";
  const allowedHosts =
    options.allowedHosts || parseAllowedHosts(process.env.SUPERMEGA_MCP_ALLOWED_HOSTS || "");
  const allowedOrigins =
    options.allowedOrigins || parseAllowedOrigins(process.env.SUPERMEGA_MCP_ALLOWED_ORIGINS || "");
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535.");
  }
  if (!["127.0.0.1", "localhost", "::1"].includes(host) && allowedHosts.length === 0) {
    throw new Error("Non-local MCP binding requires SUPERMEGA_MCP_ALLOWED_HOSTS.");
  }

  const app = createHttpApp({ ...options, host, allowedHosts, allowedOrigins });
  return new Promise((resolvePromise, rejectPromise) => {
    const httpServer = app.listen(port, host, (error) => {
      if (error) {
        rejectPromise(error);
        return;
      }
      console.log(`SuperMega ChatGPT app listening on http://${host}:${port}/mcp`);
      resolvePromise(httpServer);
    });
  });
}

const isMain =
  process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  startServer().catch((error) => {
    console.error(error instanceof Error ? error.message : "Unable to start SuperMega ChatGPT app.");
    process.exitCode = 1;
  });
}
