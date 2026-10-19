import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { parseRunSummary, summaryRows } from "../js/results.js";
import { validate } from "./helpers/schema-lite.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repo = path.resolve(root, "..");
const read = (rel) => fs.readFileSync(path.join(root, rel));

// sha256 of harness/schema/run_summary.schema.json at harness main 8bb1633 (git blob bcda2343afb5cd0bd9d616c157f82608764bb113).
const HARNESS_SCHEMA_SHA256 = "9d028895e64ff249dde41be7687b21e3a5f235347acd6cc15963694b5cb0c6c0";

const schema = JSON.parse(read("schema/run_summary.schema.json").toString("utf8"));
const example = JSON.parse(read("data/run_summary.example.json").toString("utf8"));

test("schema/run_summary.schema.json is byte-identical to the harness copy", () => {
  const bytes = read("schema/run_summary.schema.json");
  assert.equal(createHash("sha256").update(bytes).digest("hex"), HARNESS_SCHEMA_SHA256);
  assert.equal(bytes.length, 4074);
});

test("the example run_summary validates against the copied schema", () => {
  assert.deepEqual(validate(schema, example), []);
  assert.equal(example.counts_by_outcome.pass + example.counts_by_outcome.fail + example.counts_by_outcome.env_miss
    + example.counts_by_outcome.timeout + example.counts_by_outcome.error, example.completed_rollouts);
  assert.equal(example.per_rollout_cost_usd.length, example.completed_rollouts);
  const parsed = parseRunSummary(example);
  assert.equal(parsed.totalCostUsd, 1.25);
  assert.equal(summaryRows(parsed).find((row) => row.label === "Total cost").text, "$1.25");
});

test("the schema rejects a JSON-number dollar amount and a missing key", () => {
  assert.notDeepEqual(validate(schema, { ...example, total_cost_usd: 1.25 }), []);
  const missing = { ...example };
  delete missing.counts_by_outcome;
  assert.notDeepEqual(validate(schema, missing), []);
  assert.notDeepEqual(validate(schema, { ...example, counts_by_outcome: { ...example.counts_by_outcome, spend_ceiling: 1 } }), []);
});

test("no page still says spend_ceiling is a miss being changed", () => {
  const files = [];
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (["test", "node_modules", ".git"].includes(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(html|js|json|md)$/.test(entry.name)) files.push(full);
    }
  })(root);
  files.push(path.join(repo, "README.md"));
  assert.ok(files.length > 20);
  for (const file of files) {
    const text = fs.readFileSync(file, "utf8");
    const label = path.relative(repo, file);
    assert.doesNotMatch(text, /being changed to count as a fail/i, label);
    assert.doesNotMatch(text, /being changed \(team decision/i, label);
    assert.doesNotMatch(text, /spend_ceiling<\/code><\/td><td>Miss/, label);
    assert.doesNotMatch(text, /<span>spend_ceiling<\/span><b>Miss/, label);
  }
});
