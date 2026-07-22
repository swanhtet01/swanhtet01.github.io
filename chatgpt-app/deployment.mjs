import { createHttpApp } from "./server.mjs";

const AUTOMATIC_VERCEL_HOST_KEYS = Object.freeze([
  "VERCEL_URL",
  "VERCEL_BRANCH_URL",
  "VERCEL_PROJECT_PRODUCTION_URL",
]);

function splitList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeHostname(value) {
  const candidate = String(value || "").trim();
  if (!candidate) return null;
  const url = new URL(candidate.includes("://") ? candidate : `https://${candidate}`);
  if (url.username || url.password || (url.pathname && url.pathname !== "/") || url.search || url.hash) {
    throw new Error("Deployment hosts must be hostnames, not URLs with credentials, paths, or query data.");
  }
  return url.hostname.toLowerCase();
}

export function resolveDeploymentHosts(environment = {}) {
  const candidates = splitList(environment.SUPERMEGA_MCP_ALLOWED_HOSTS);
  for (const key of AUTOMATIC_VERCEL_HOST_KEYS) {
    if (environment[key]) candidates.push(environment[key]);
  }
  return [...new Set(candidates.map(normalizeHostname).filter(Boolean))];
}

function optionalNumber(value) {
  if (value === undefined || value === null || value === "") return undefined;
  return Number(value);
}

export function createDeploymentApp(environment = process.env) {
  const allowedOrigins = splitList(environment.SUPERMEGA_MCP_ALLOWED_ORIGINS);
  return createHttpApp({
    host: "0.0.0.0",
    allowedHosts: resolveDeploymentHosts(environment),
    allowedOrigins: allowedOrigins.length > 0 ? allowedOrigins : undefined,
    widgetDomain: environment.SUPERMEGA_WIDGET_DOMAIN || undefined,
    requestLimit: optionalNumber(environment.SUPERMEGA_MCP_REQUEST_LIMIT),
    maxConcurrentRequests: optionalNumber(environment.SUPERMEGA_MCP_MAX_CONCURRENT_REQUESTS),
    requestTimeoutMs: optionalNumber(environment.SUPERMEGA_MCP_REQUEST_TIMEOUT_MS),
    trustProxy: 1,
  });
}

function configurationUnavailable(response) {
  response.statusCode = 503;
  response.shouldKeepAlive = false;
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Connection", "close");
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.end(
    JSON.stringify({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Service configuration unavailable." },
      id: null,
    }),
  );
}

export function createVercelHandler(routePath, options = {}) {
  if (!["/mcp", "/healthz"].includes(routePath)) {
    throw new Error("Vercel handler route must be /mcp or /healthz.");
  }
  const environment = options.environment || process.env;
  const reportConfigurationError =
    options.reportConfigurationError ||
    ((error) => {
      console.error(
        "SuperMega deployment configuration failed:",
        error instanceof Error ? error.name : "Error",
      );
    });
  let app;

  return (request, response) => {
    try {
      app ||= createDeploymentApp(environment);
    } catch (error) {
      reportConfigurationError(error);
      configurationUnavailable(response);
      return;
    }

    const requestUrl = String(request.url || "");
    const queryIndex = requestUrl.indexOf("?");
    request.url = `${routePath}${queryIndex >= 0 ? requestUrl.slice(queryIndex) : ""}`;
    return app(request, response);
  };
}
