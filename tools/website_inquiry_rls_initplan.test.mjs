import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

const [publishingSql, followupSql, optimizationSql] = await Promise.all([
  read("supabase/migrations/20261010063000_website_publishing_and_inquiries.sql"),
  read("supabase/migrations/20261010120857_website_inquiry_followup.sql"),
  read("supabase/migrations/20261016143945_optimize_sites_inquiry_rls_initplans.sql"),
]);

const baseline = `${publishingSql}\n${followupSql}`;
const policyNames = [
  "website_inquiry_channel_read",
  "website_inquiry_channel_create",
  "website_inbox_read",
  "website_inquiry_actions_read",
];

function policy(sql, name) {
  const match = sql.match(new RegExp(`create\\s+policy\\s+${name}\\b[\\s\\S]*?;`, "i"));
  assert.ok(match, `missing CREATE POLICY ${name}`);
  return match[0];
}

function optimizedFrom(original) {
  return original
    .replace(/current_setting\(\s*('[^']+')\s*,\s*(true|false)\s*\)/gi,
      "(select current_setting($1, $2))")
    .replace(/app_private\.website_review_can\(\s*'website\.write'\s*\)/gi,
      "(select app_private.website_review_can('website.write'))");
}

function canonical(sql) {
  return sql.replace(/\s+/g, "").toLowerCase();
}

for (const name of policyNames) {
  assert.match(optimizationSql, new RegExp(`drop\\s+policy\\s+${name}\\b`, "i"));
  assert.equal(
    canonical(policy(optimizationSql, name)),
    canonical(optimizedFrom(policy(baseline, name))),
    `${name} must preserve its original role and predicate while wrapping stable lookups`,
  );
}

const creates = [...optimizationSql.matchAll(/create\s+policy\s+([a-z0-9_]+)/gi)].map((match) => match[1]);
const drops = [...optimizationSql.matchAll(/drop\s+policy\s+([a-z0-9_]+)/gi)].map((match) => match[1]);
assert.deepEqual(creates.sort(), [...policyNames].sort(), "migration may only recreate the four advisor-flagged policies");
assert.deepEqual(drops.sort(), [...policyNames].sort(), "migration may only replace the four advisor-flagged policies");
assert.match(optimizationSql, /^\s*--[\s\S]*?begin\s*;/i);
assert.match(optimizationSql, /commit\s*;\s*$/i);
assert.doesNotMatch(optimizationSql, /\b(grant|revoke|alter\s+table|drop\s+table|truncate)\b/i);

console.log("PASS: four Sites inquiry RLS policies retain their exact access logic and use statement-level stable lookups");
