import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { resolveDeploymentHosts } from "./deployment.mjs";

function exactHttpsOrigin(value, label) {
  const candidate = String(value || "").trim();
  let url;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error(`${label} must be an exact HTTPS origin.`);
  }
  if (url.protocol !== "https:" || url.origin !== candidate) {
    throw new Error(`${label} must be an exact HTTPS origin.`);
  }
  return url.origin;
}

export function verifyDeploymentEnvironment(environment = process.env) {
  const deploymentTarget = String(environment.SUPERMEGA_DEPLOYMENT_TARGET || "").trim();
  if (!["preview", "production", "offline-contract"].includes(deploymentTarget)) {
    throw new Error(
      "SUPERMEGA_DEPLOYMENT_TARGET must be preview, production, or offline-contract.",
    );
  }
  if (deploymentTarget === "preview" && !environment.VERCEL_URL && !environment.VERCEL_BRANCH_URL) {
    throw new Error(
      "Preview builds require VERCEL_URL or VERCEL_BRANCH_URL. Enable Vercel's Automatically expose System Environment Variables setting.",
    );
  }
  if (deploymentTarget === "production" && !environment.VERCEL_PROJECT_PRODUCTION_URL) {
    throw new Error(
      "Production builds require VERCEL_PROJECT_PRODUCTION_URL. Enable Vercel's Automatically expose System Environment Variables setting.",
    );
  }
  if (
    deploymentTarget === "offline-contract" &&
    environment.SUPERMEGA_ALLOW_OFFLINE_VERCEL_BUILD !== "1"
  ) {
    throw new Error(
      "Offline contract builds require SUPERMEGA_ALLOW_OFFLINE_VERCEL_BUILD=1.",
    );
  }
  if (
    deploymentTarget === "offline-contract" &&
    [
      environment.VERCEL,
      environment.VERCEL_ENV,
      environment.VERCEL_URL,
      environment.VERCEL_BRANCH_URL,
      environment.VERCEL_PROJECT_PRODUCTION_URL,
    ].some(Boolean)
  ) {
    throw new Error("Offline contract builds cannot run inside a Vercel environment.");
  }
  if (
    environment.VERCEL_ENV &&
    deploymentTarget !== "offline-contract" &&
    environment.VERCEL_ENV !== deploymentTarget
  ) {
    throw new Error("SUPERMEGA_DEPLOYMENT_TARGET must match VERCEL_ENV.");
  }

  const hosts = resolveDeploymentHosts(environment);
  if (hosts.length === 0) {
    throw new Error(
      "No deployment host is available. Enable Vercel's Automatically expose System Environment Variables setting or set SUPERMEGA_MCP_ALLOWED_HOSTS explicitly.",
    );
  }
  if (
    deploymentTarget === "offline-contract" &&
    hosts.some((host) => !host.endsWith(".invalid"))
  ) {
    throw new Error("Offline contract builds require .invalid hostnames.");
  }

  const origins = String(environment.SUPERMEGA_MCP_ALLOWED_ORIGINS || "https://chatgpt.com")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map((origin) => exactHttpsOrigin(origin, "Allowed browser origin"));
  if (origins.length === 0) {
    throw new Error("At least one allowed browser origin is required.");
  }

  const widgetDomain = exactHttpsOrigin(
    environment.SUPERMEGA_WIDGET_DOMAIN || "https://mcp.supermega.dev",
    "Widget domain",
  );

  return Object.freeze({
    ready: true,
    deployment_target: deploymentTarget,
    host_count: hosts.length,
    origin_count: origins.length,
    widget_domain_configured: Boolean(widgetDomain),
  });
}

const isMain = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  try {
    console.log(JSON.stringify(verifyDeploymentEnvironment()));
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Deployment environment is invalid.");
    process.exitCode = 1;
  }
}
