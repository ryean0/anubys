import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { parseResults, parseRunSummary, publicText, summaryRows } from "../js/results.js";

const resultsSchema = JSON.parse(readFileSync(new URL("../schema/results.schema.json", import.meta.url), "utf8"));
const stepSchema = JSON.parse(readFileSync(new URL("../schema/step.schema.json", import.meta.url), "utf8"));
const summarySchema = JSON.parse(readFileSync(new URL("../schema/run_summary.schema.json", import.meta.url), "utf8"));
const steps = JSON.parse(readFileSync(new URL("../data/step.example.json", import.meta.url), "utf8"));
const example = JSON.parse(readFileSync(new URL("../data/results.preliminary.json", import.meta.url), "utf8"));
const summary = JSON.parse(readFileSync(new URL("../data/run_summary.example.json", import.meta.url), "utf8"));

const FORBIDDEN = [
  [/\d+\/20\b/, "n/20"],
  [/\bFail\b/, "Fail verdict"],
  [/gemini-/i, "model version"],
  [/hard stop/i, "hard stop"],
  [/p95/i, "p95"],
  [/\u2014/, "em dash"],
  [/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i, "email"],
];

function rejectCopy(text, label) {
  for (const [pattern, name] of FORBIDDEN) {
    assert.doesNotMatch(text, pattern, `${label} ${name}`);
  }
}

function tokenField(schema, name) {
  const field = schema.properties[name];
  assert.deepEqual(field.anyOf, [{ minimum: 0, type: "integer" }, { type: "null" }], name);
  assert.equal(field.default, null, name);
  assert.equal(schema.required.includes(name), false, `${name} required`);
}

test("step.schema.json mirrors harness thinking_tokens and cached_tokens", () => {
  assert.equal(stepSchema.title, "Step");
  assert.equal(stepSchema.additionalProperties, false);
  assert.equal(stepSchema.$id, "https://ci-agent-regression-harness.local/schema/step/1.0.0.json");
  tokenField(stepSchema, "thinking_tokens");
  tokenField(stepSchema, "cached_tokens");
  assert.equal(
    stepSchema.properties.thinking_tokens.description,
    "Thoughts billed at the output rate. Not included in tokens_out on a live response. An older recording that folded thoughts into the output count is priced from that stored count.",
  );
  assert.equal(
    stepSchema.properties.cached_tokens.description,
    "Cached input tokens included in tokens_in. Summed across retries.",
  );
  for (const name of ["step_id", "run_id", "scenario_id", "family_id", "version_id", "rollout", "sequence_index", "operation_type", "status"]) {
    assert.equal(stepSchema.required.includes(name), true, name);
  }
  assert.equal(steps.length, 2);
  assert.equal(steps[0].thinking_tokens, 12);
  assert.equal(steps[0].cached_tokens, 30);
  assert.equal(steps[0].scenario_id, "example.clean.v1");
  assert.equal(steps[0].family_id, "example.clean");
  assert.equal(steps[1].thinking_tokens, null);
  assert.equal(steps[1].cached_tokens, null);
  assert.equal(steps[1].scenario_id, "example.broken.v1");
  assert.equal(steps[1].family_id, "example.broken");
  rejectCopy(JSON.stringify(stepSchema), "step schema");
  rejectCopy(JSON.stringify(steps), "step example");
});

test("results schema 2.1.0 records model ids on the suite verdict", () => {
  assert.equal(resultsSchema.title, "ResultsDocument");
  assert.equal(resultsSchema.additionalProperties, false);
  assert.equal(resultsSchema.properties.schema_version.const, "2.1.0");
  assert.equal(resultsSchema.required.includes("suite_id"), false);
  assert.equal(resultsSchema.properties.suite_id.type, "string");
  assert.equal(resultsSchema.properties.suite_id.default, "tau_retail");
  assert.equal(resultsSchema.properties.suite_id.minLength, 1);
  assert.equal(Object.hasOwn(resultsSchema.properties, "run_summary"), false);
  assert.equal(Object.hasOwn(resultsSchema.properties, "arms"), false);
  for (const name of ["schema_version", "run_kind", "baseline_pool_model_id", "verdicts", "environment_misses", "mde"]) {
    assert.equal(resultsSchema.required.includes(name), true, name);
  }
  const overall = resultsSchema.$defs.OverallVerdict;
  assert.equal(overall.required.includes("model_ids"), true);
  assert.equal(overall.required.includes("verdict"), true);
  assert.equal(overall.required.includes("likely_regression"), true);
  assert.deepEqual(overall.properties.verdict.enum, ["pass", "block", "insufficient_evidence", "invalid_run"]);
  assert.match(resultsSchema.properties.run_kind.description, /screening, baseline, and aa must share one model id/);
  assert.match(resultsSchema.properties.run_kind.description, /baseline_pool_model_id/);
  assert.equal(example.schema_version, "2.1.0");
  assert.equal(Object.hasOwn(example, "version"), false);
  assert.equal(Object.hasOwn(example, "arms"), false);
  assert.equal(Object.hasOwn(example, "suite_id"), false);
  assert.equal(Object.hasOwn(example, "run_summary"), false);
  assert.equal(example.baseline_pool_model_id, "tau-retail-baseline-pool");
  assert.equal(example.run_kind, "screening");
  assert.equal(example.verdicts.overall.model_ids.baseline, example.baseline_pool_model_id);
  assert.equal(example.verdicts.overall.model_ids.candidate, example.baseline_pool_model_id);
  const byId = Object.fromEntries(example.verdicts.diagnostics.map((row) => [row.scenario_id, row.family_id]));
  assert.equal(byId["example.broken.v1"], "example.broken");
  assert.equal(byId["example.clean.v1"], "example.clean");
  assert.equal(Object.hasOwn(byId["example.broken.v1"] ? example.verdicts.diagnostics.find((row) => row.scenario_id === "example.broken.v1") : {}, "baseline_pass_rate"), false);
  const view = parseResults(example);
  const shown = JSON.stringify({
    headline: view.headline,
    why: view.why,
    note: view.summaryNote,
    rates: view.diagnostics.map((row) => [row.baselineText, row.candidateText, row.note, row.differenceText]),
    miss: [view.arms.baseline.rateText, view.arms.candidate.rateText],
    interval: view.interval.text,
  });
  assert.equal(publicText("exactly 1/20"), "exactly Example: 5%");
  assert.equal(view.arms.baseline.rateText, "Example: 0% miss rate");
  assert.equal(view.arms.candidate.rateText, "Example: 5% miss rate");
  assert.doesNotMatch(shown, /of 20/);
  assert.doesNotMatch(shown, /\/20(?!\d)/);
  rejectCopy(JSON.stringify(summarySchema), "run summary schema");
  rejectCopy(JSON.stringify(summary), "run summary example");
});

test("suite_id is optional on the site schema and the parser accepts tau_retail", () => {
  assert.equal(resultsSchema.required.includes("suite_id"), false);
  assert.deepEqual(resultsSchema.properties.suite_id, {
    default: "tau_retail",
    description: "Suite this document belongs to. Omitted files default to tau_retail. Gate settings still come from the packaged tau_retail suite unless --suite is set.",
    minLength: 1,
    title: "Suite Id",
    type: "string",
  });
  const withSuite = structuredClone(example);
  withSuite.suite_id = "tau_retail";
  assert.equal(parseResults(withSuite).suiteId, "tau_retail");
  withSuite.suite_id = "";
  assert.throws(() => parseResults(withSuite), /suite_id must not be empty/);
});

test("run_summary example is a separate schema 1.1.0 file", () => {
  assert.equal(summarySchema.properties.schema_version.const, "1.1.0");
  assert.equal(summarySchema.required.includes("model_version"), true);
  assert.equal(summarySchema.required.includes("schema_version"), true);
  assert.equal(Object.hasOwn(summarySchema.properties, "rollout_duration_p95_s"), false);
  assert.equal(summary.schema_version, "1.1.0");
  assert.equal(typeof summary.model_version, "string");
  assert.equal(summary.stopped, null);
  for (const name of [
    "planned_rollouts",
    "completed_rollouts",
    "infra_misses",
    "total_cached_input_tokens",
    "rollout_duration_p50_s",
    "rollout_duration_max_s",
  ]) {
    assert.equal(typeof summary[name], "number", name);
  }
  assert.equal(typeof summary.total_cost_usd, "string");
  assert.match(summary.total_cost_usd, /^(0|[1-9][0-9]*)(\.[0-9]+)?$/);
  assert.equal(summary.per_rollout_cost_usd.every((value) => typeof value === "string"), true);
});

test("rendered results and site copy never show a count out of 20", () => {
  const view = parseResults(example);
  const rows = summaryRows(parseRunSummary(summary));
  const rendered = [
    view.headline,
    view.why,
    view.summaryNote,
    view.interval.text,
    view.runKind,
    view.baselinePoolModelId,
    view.modelIds.baseline,
    view.modelIds.candidate,
    view.arms.baseline.rateText,
    view.arms.candidate.rateText,
    view.arms.baseline.passRateText,
    view.arms.candidate.passRateText,
    String(view.costUsd),
    ...rows.map((row) => `${row.label} ${row.text}`),
    ...view.diagnostics.flatMap((row) => [
      row.scenarioId,
      row.familyId,
      row.baselineText,
      row.candidateText,
      row.differenceText,
      row.note,
    ]),
    view.charts.mde.title,
    view.charts.mde.caption,
    ...view.charts.mde.points.map((point) => `${point.budget} ${point.dropText}`),
    view.charts.aa.title,
    view.charts.aa.caption,
  ].join("\n");
  assert.equal(view.arms.candidate.rateText, "Example: 5% miss rate");
  assert.doesNotMatch(rendered, /of 20/i);
  assert.doesNotMatch(rendered, /\/20(?!\d)/);
  assert.match(JSON.stringify(example.environment_misses), /"0\/20"/);
  assert.match(JSON.stringify(example.environment_misses), /"1\/20"/);

  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const files = [];
  function walk(dir) {
    for (const name of readdirSync(dir)) {
      if (name === "test" || name === "node_modules" || name === ".git") continue;
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(html|js|css|md)$/.test(name)) files.push(full);
    }
  }
  walk(path.join(root, "agent-regression-gate"));
  files.push(path.join(root, "README.md"));
  assert.ok(files.length > 10);
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    assert.doesNotMatch(text, /of 20/i, path.relative(root, file));
    assert.doesNotMatch(text, /\/20(?!\d)/, path.relative(root, file));
  }
});

test("new results copy keeps the site rules", () => {
  const resultsPage = readFileSync(new URL("../results/index.html", import.meta.url), "utf8");
  const intro = resultsPage.slice(resultsPage.indexOf('id="results"'), resultsPage.indexOf('id="demo"'));
  const changelog = readFileSync(new URL("../docs/changelog/index.html", import.meta.url), "utf8");
  const section = changelog.slice(changelog.indexOf('id="example-results"'), changelog.indexOf('id="performance-day"'));
  const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
  rejectCopy(intro, "results page");
  rejectCopy(section, "changelog");
  rejectCopy(readme, "readme");
});
