import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { TOOL_REVIEW } from "../server.mjs";

function publicProductProjection(product) {
  return {
    id: product.id,
    name: product.name,
    status: product.status,
    headline: product.headline,
    description: product.description,
    primaryCta: { url: product.primaryCta.url },
    modules: product.modules,
    templates: product.templates.map(({ id, name, outcome, workflow, entryPoints, metric }) => ({
      id,
      name,
      outcome,
      workflow,
      entryPoints,
      metric,
    })),
  };
}

test("deployable catalogue snapshot exactly matches the public site manifest projection", () => {
  const manifest = JSON.parse(
    readFileSync(new URL("../../site-manifest.json", import.meta.url), "utf8"),
  );
  const snapshot = JSON.parse(
    readFileSync(new URL("../catalog.snapshot.json", import.meta.url), "utf8"),
  );
  assert.deepEqual(snapshot, {
    catalogVersion: manifest.catalogVersion,
    products: manifest.products.map(publicProductProjection),
  });
});

test("submission import matches the live descriptors and required case counts", () => {
  const submission = JSON.parse(
    readFileSync(new URL("../../chatgpt-app-submission.json", import.meta.url), "utf8"),
  );
  assert.equal(submission.schema_version, 1);
  assert.ok(submission.app_info.subtitle.length <= 30);
  assert.equal(submission.test_cases.length, 5);
  assert.equal(submission.negative_test_cases.length, 3);
  assert.deepEqual(Object.keys(submission.tools).sort(), Object.keys(TOOL_REVIEW).sort());
  for (const tool of Object.values(submission.tools)) {
    assert.deepEqual(tool.annotations, {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    });
    assert.ok(
      Object.values(tool.justifications).every(
        (value) => typeof value === "string" && value.length > 20,
      ),
    );
  }
});

test("Vercel contract exposes canonical routes but cannot auto-deploy", () => {
  const config = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
  assert.equal(config.git.deploymentEnabled, false);
  assert.equal(config.installCommand, "npm ci --ignore-scripts");
  assert.equal(config.buildCommand, "npm run build:vercel");
  assert.deepEqual(config.rewrites, [
    { source: "/mcp", destination: "/api/mcp" },
    { source: "/healthz", destination: "/api/healthz" },
  ]);
  assert.equal(config.functions["api/*.mjs"].maxDuration, 30);
  assert.equal(config.functions["api/*.mjs"].includeFiles, "{catalog.snapshot.json,public/**}");
});
