import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const publicCatalog = JSON.parse(
  readFileSync(resolve(MODULE_DIR, "catalog.snapshot.json"), "utf8"),
);

function normalize(value) {
  return String(value || "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function buildSearchText(item) {
  return normalize(
    [
      item.id,
      item.name,
      item.headline,
      item.description,
      item.status,
      ...item.modules,
      ...item.templates.flatMap((template) => [
        template.id,
        template.name,
        template.outcome,
        template.metric,
        ...template.workflow,
        ...template.entryPoints,
      ]),
    ].join(" "),
  );
}

export const CATALOG_VERSION = publicCatalog.catalogVersion;

export const CATALOG = Object.freeze(
  publicCatalog.products.map((product) => {
    const catalogItem = {
      id: product.id,
      name: product.name,
      status: product.status,
      headline: product.headline,
      description: product.description,
      url: product.primaryCta.url,
      modules: Object.freeze([...(product.modules || [])]),
      nextGate: `Confirm one ${product.name} workflow, baseline, accountable owner, and acceptance measure before connecting an external system.`,
      templates: Object.freeze(
        (product.templates || []).map((template) =>
          Object.freeze({
            id: template.id,
            name: template.name,
            outcome: template.outcome,
            workflow: Object.freeze([...template.workflow]),
            entryPoints: Object.freeze([...template.entryPoints]),
            metric: template.metric,
          }),
        ),
      ),
    };

    return Object.freeze({ ...catalogItem, searchText: buildSearchText(catalogItem) });
  }),
);

export const PRODUCT_IDS = Object.freeze(CATALOG.map((item) => item.id));

export function searchCatalog(query, limit = 5) {
  const terms = normalize(query).split(" ").filter(Boolean);
  if (terms.length === 0) {
    return [];
  }

  return CATALOG.map((item) => {
    const exactId = terms.includes(normalize(item.id)) ? 20 : 0;
    const exactName = normalize(item.name) === terms.join(" ") ? 16 : 0;
    const matches = terms.reduce(
      (score, term) => score + (item.searchText.includes(term) ? 2 : 0),
      0,
    );
    return { item, score: exactId + exactName + matches };
  })
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score || left.item.name.localeCompare(right.item.name))
    .slice(0, Math.max(1, Math.min(Number(limit) || 5, 5)))
    .map(({ item }) => ({ id: item.id, title: item.name, url: item.url }));
}

export function getCatalogItem(id) {
  return CATALOG.find((item) => item.id === id) || null;
}

export function fetchCatalogItem(id) {
  const item = getCatalogItem(id);
  if (!item) {
    return null;
  }

  const templateText = item.templates
    .map(
      (template) =>
        `${template.name}: ${template.outcome} Workflow: ${template.workflow.join(" -> ")}. Measurement: ${template.metric}.`,
    )
    .join("\n");

  return {
    id: item.id,
    title: item.name,
    text: [
      item.headline,
      item.description,
      `Current status: ${item.status}.`,
      `Modules: ${item.modules.join(", ")}.`,
      templateText,
      `Next evidence gate: ${item.nextGate}`,
    ].join("\n"),
    url: item.url,
    metadata: {
      status: item.status,
      category: "operating-software",
      modules: [...item.modules],
      templates: item.templates.map((template) => ({ id: template.id, name: template.name })),
      next_gate: item.nextGate,
      catalog_version: CATALOG_VERSION,
    },
  };
}

const CURRENT_SYSTEM_LABELS = Object.freeze({
  paper: "Paper or manual records",
  spreadsheet: "Spreadsheet records",
  chat: "Chat-based coordination",
  "existing-software": "Existing business software",
  mixed: "A mix of manual and digital tools",
  unknown: "Current system not yet confirmed",
});

export const CURRENT_SYSTEMS = Object.freeze(Object.keys(CURRENT_SYSTEM_LABELS));
export const PILOT_TIMELINES = Object.freeze([7, 14, 30]);

export function preparePilotBrief({
  product_id: productId,
  template_id: templateId,
  goal,
  current_system: currentSystem,
  timeline_days: timelineDays,
}) {
  const product = getCatalogItem(productId);
  if (!product) {
    throw new Error("Choose a product from the public SuperMega catalogue.");
  }

  const template = product.templates.find((candidate) => candidate.id === templateId);
  if (!template) {
    throw new Error(`Template ${templateId} does not belong to ${product.name}.`);
  }

  if (!CURRENT_SYSTEM_LABELS[currentSystem]) {
    throw new Error("Choose one of the supported current-system categories.");
  }
  if (!PILOT_TIMELINES.includes(timelineDays)) {
    throw new Error("Pilot timeline must be 7, 14, or 30 days.");
  }

  const workflow = [...template.workflow];
  const baseline = template.metric;

  return {
    schema_version: "supermega.pilot-brief.v1",
    action_mode: "draft_only",
    persisted: false,
    approval_required: true,
    product: {
      id: product.id,
      name: product.name,
      status: product.status,
      url: product.url,
      template: template.name,
    },
    goal: goal.trim(),
    current_system: CURRENT_SYSTEM_LABELS[currentSystem],
    timeline_days: timelineDays,
    workflow,
    baseline_measure: baseline,
    acceptance_evidence: [
      "A baseline value recorded before the pilot starts",
      "At least one completed workflow record with source and owner evidence",
      "Exceptions and consequential decisions reviewed by a named human",
      "A final accept, revise, or stop decision recorded against the stated goal",
    ],
    owner_decisions: [
      "Confirm the pilot scope and accountable human owner",
      "Confirm which records may be used and what must remain private",
      "Approve any external send, payment, publish, access change, or production write",
    ],
    limits: [
      "This brief is not saved and does not access a customer workspace",
      "It does not send messages, publish content, take payment, or change production data",
      "Product statuses and readiness gates remain visible rather than being presented as live capabilities",
    ],
    next_step: product.nextGate,
  };
}
