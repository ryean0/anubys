import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { INTERVAL_FALLBACK, RUN_SUMMARY_PATH, parseResults, parseResultsV2, parseRunSummary, summaryRows } from "../js/results.js";

const shipped = JSON.parse(
  readFileSync(new URL("../data/results.preliminary.json", import.meta.url), "utf8"),
);
const bundled = JSON.parse(
  readFileSync(new URL("./fixtures/results.invalid-legacy.json", import.meta.url), "utf8"),
);
const runSummary = JSON.parse(
  readFileSync(new URL(`../${RUN_SUMMARY_PATH}`, import.meta.url), "utf8"),
);

test("the shipped harness preliminary file parses as insufficient evidence", () => {
  const view = parseResults(shipped);
  assert.equal(parseResultsV2(shipped).headline, view.headline);
  assert.equal(view.version, "2.1.0");
  assert.equal(view.schemaVersion, "2.1.0");
  assert.equal(view.shape, "harness");
  assert.equal(view.headline, "Insufficient evidence");
  assert.equal(view.verdict, "insufficient_evidence");
  assert.equal(view.likelyRegression, false);
  assert.equal(view.status, "preliminary");
  assert.equal(view.runKind, "screening");
  assert.equal(view.baselinePoolModelId, "tau-retail-baseline-pool");
  assert.equal(view.modelIds.baseline, "tau-retail-baseline-pool");
  assert.equal(view.modelIds.candidate, "tau-retail-baseline-pool");
  assert.equal(view.modelIdSources.baseline, "overall");
  assert.equal(view.modelIdSources.candidate, "overall");
  assert.equal(view.arms.baseline.modelId, view.modelIds.baseline);
  assert.equal(view.interval.fromFile, true);
  assert.equal(view.interval.delta, 0.05);
  assert.equal(view.interval.ciLevel, 0.9);
  assert.equal(view.interval.text, "δ = 5 pp · 90% CI");
  assert.doesNotMatch(view.interval.text, /\d+\/20\b/);
  assert.equal(view.runSummary, null);
  assert.equal(view.costUsd, 1.25);
  assert.equal(view.arms.baseline.rateText, "Example: 0% miss rate");
  assert.equal(view.arms.candidate.rateText, "Example: 5% miss rate");
  assert.equal(view.arms.candidate.overMissLimit, false);
  assert.equal(view.arms.candidate.environmentMisses, 1);
  const broken = view.diagnostics.find((row) => row.scenarioId === "example.broken.v1");
  const clean = view.diagnostics.find((row) => row.scenarioId === "example.clean.v1");
  assert.equal(broken.familyId, "example.broken");
  assert.equal(broken.baselineText, "Not in this file");
  assert.equal(broken.candidateText, "Not in this file");
  assert.equal(broken.missCounts.candidate, 1);
  assert.deepEqual(broken.missingCassetteKeys.candidate, ["example.broken.v1/get_order_details"]);
  assert.doesNotMatch(broken.note, /of 20/);
  assert.doesNotMatch(broken.note, /\/20(?!\d)/);
  assert.match(broken.note, /5%/);
  assert.equal(clean.familyId, "example.clean");
  assert.equal(clean.baselineText, "90%");
  assert.equal(clean.candidateText, "90%");
  assert.equal(clean.differenceText, "0 pp");
  assert.equal(view.charts.mde.status, "preliminary");
  assert.equal(view.charts.mde.points.length, 3);
  assert.equal(view.charts.mde.points[0].dropText, "25%");
  assert.equal(view.charts.aa.status, "coming_soon");
  assert.equal(view.charts.aa.points.length, 0);
  const summary = parseRunSummary(runSummary);
  assert.equal(summary.plannedRollouts, 40);
  assert.equal(summary.stopped, null);
  assert.equal(summary.totalCostUsd, 1.25);
  assert.equal(summary.rolloutDurationP50S, 12);
  assert.equal(summary.rolloutDurationMaxS, 40);
  const rows = summaryRows(summary);
  assert.equal(rows.filter((row) => row.example).length, 7);
  assert.equal(rows.find((row) => row.label === "Stopped").text, "None");
  assert.equal(rows.find((row) => row.label === "Stopped").example, false);
  assert.equal(rows.some((row) => /p95/i.test(row.label)), false);
});

test("harness run_kind rules refuse a model id mismatch", () => {
  const shared = structuredClone(shipped);
  shared.verdicts.overall.model_ids.baseline = "other-pool";
  shared.verdicts.overall.model_ids.candidate = "other-pool";
  assert.equal(parseResults(shared).modelIds.baseline, "other-pool");

  const split = structuredClone(shipped);
  split.verdicts.overall.model_ids.candidate = "other-candidate";
  assert.throws(() => parseResults(split), /shared model id/);

  const gate = structuredClone(shipped);
  gate.run_kind = "gate";
  gate.verdicts.overall.model_ids.candidate = "other-candidate";
  assert.equal(parseResults(gate).runKind, "gate");
  gate.verdicts.overall.model_ids.baseline = "not-the-pool";
  assert.throws(() => parseResults(gate), /baseline_pool_model_id/);
});

test("an invalid legacy file parses and banners", () => {
  const view = parseResults(bundled);
  assert.equal(view.version, "2.1.0");
  assert.equal(view.schemaVersion, "2.1.0");
  assert.equal(view.headline, "Pass");
  assert.equal(view.status, "preliminary");
  assert.equal(view.banner.tone, "preliminary");
  assert.match(view.banner.title, /Preliminary/);
  assert.equal(view.verdict, "no_regression");
  assert.equal(view.arms.baseline.modelId, "baseline model id (lives in config/allowed_models.txt and is passed with --model)");
  assert.equal(view.arms.candidate.modelId, "a pinned Gemini Flash-Lite model id (lives in config/allowed_models.txt and is passed with --model)");
  assert.equal(view.modelIdSources.baseline, "overall");
  assert.equal(view.modelIdSources.candidate, "overall");
  assert.equal(view.modelIds.baseline, "baseline model id (lives in config/allowed_models.txt and is passed with --model)");
  assert.equal(view.modelIds.candidate, "a pinned Gemini Flash-Lite model id (lives in config/allowed_models.txt and is passed with --model)");
  assert.equal(view.runKind, "screening");
  assert.equal(view.baselinePoolModelId, "baseline model id (lives in config/allowed_models.txt and is passed with --model)");
  assert.equal(view.minValidFraction.text, "0.6");
  assert.deepEqual(view.minValidFraction.ratio, { numerator: 3, denominator: 5 });
  assert.deepEqual(view.rolloutsPerScenario, { baseline: 20, candidate: 20 });
  assert.equal(view.interval.fromFile, true);
  assert.equal(view.interval.delta, "0.05");
  assert.equal(view.interval.ciLevel, "0.9");
  assert.equal(view.interval.text, "δ = 5 pp · 90% CI");
  assert.equal(view.suiteId, "");
  assert.equal(view.diagnostics.length, 2);
  assert.equal(view.diagnostics[0].scenarioId, "example.clean.v1");
  assert.equal(view.diagnostics[1].scenarioId, "example.broken.v1");
  assert.equal(view.diagnostics[0].familyId, "example");
  assert.equal(view.diagnostics[0].baselineText, "9/10");
  assert.equal(view.diagnostics[0].candidateText, "4/5");
  assert.equal(view.diagnostics[0].differenceText, "-1/10");
  assert.equal(view.diagnostics[0].missingCassetteKeys.baseline.length, 0);
  assert.equal("verdict" in view.diagnostics[0], false);
  assert.equal(view.likelyRegression, false);
  assert.equal(view.arms.candidate.passRateText, "3/5");
  assert.equal(view.arms.candidate.environmentMisses, 1);
  assert.equal(view.arms.candidate.overMissLimit, false);
  assert.equal(bundled.arms.baseline.model_id, view.modelIds.baseline);
  assert.equal(bundled.arms.candidate.model_id, view.modelIds.candidate);
  assert.equal(view.scenarios[0].id, "example.clean.v1");
  assert.equal(view.scenarios[0].candidateText, "4/5");
  assert.equal(view.scenarios[1].id, "example.broken.v1");
  assert.equal(view.scenarios[1].candidateText, "3/5");
  assert.equal(view.runSummary.plannedRollouts, 8);
  assert.equal(view.runSummary.completedRollouts, 8);
  assert.equal(view.runSummary.infraMisses, 1);
  assert.equal(view.runSummary.stopped, null);
  assert.equal(view.runSummary.totalCostUsd, 1.25);
  assert.equal(view.runSummary.totalCachedInputTokens, 120);
  assert.equal(view.runSummary.rolloutDurationP50S, 12);
  assert.equal(view.runSummary.rolloutDurationMaxS, 40);
  const rows = summaryRows(view.runSummary);
  assert.equal(rows.filter((row) => row.example).length, 7);
  assert.equal(rows.find((row) => row.label === "Stopped").example, false);
  assert.equal(rows.find((row) => row.label === "Stopped").text, "None");
  assert.equal(rows.some((row) => /p95/i.test(row.label)), false);
  assert.equal(view.charts.mde.status, "preliminary");
  assert.equal(view.charts.mde.title, "Smallest drop we can reliably catch");
  assert.match(view.charts.mde.caption, /Smallest drop/);
  assert.equal(view.charts.aa.status, "coming_soon");
  assert.match(view.charts.aa.caption, /cry wolf/);
  assert.equal(view.charts.aa.points.length, 0);
});

test("scenario diagnostics never carry a pass or block", () => {
  const view = parseResults({
    ...bundled,
    scenarios: [
      {
        id: "reset-locked-account",
        name: "Reset a locked account",
        baseline_rate: "18/20",
        candidate_rate: "0.6",
        blocked: true,
        passed: false,
        verdict: "likely_regression",
      },
    ],
  });
  assert.equal(view.scenarios.length, 1);
  assert.deepEqual(Object.keys(view.scenarios[0]).sort(), [
    "baselineText",
    "candidateText",
    "id",
    "name",
  ]);
});

test("a final file does not use the preliminary banner", () => {
  const view = parseResults({ ...bundled, status: "final" });
  assert.equal(view.banner.tone, "final");
  assert.doesNotMatch(view.banner.title, /Preliminary/);
});

test("suite likely_regression true is the only regression call", () => {
  const view = parseResults(withLikely(true));
  assert.equal(view.verdict, "likely_regression");
  assert.equal(view.headline, "Block");
  assert.equal(view.scenarios.some((row) => "verdict" in row), false);
});

test("null likely_regression without invalid_run is insufficient evidence", () => {
  const doc = asVersion2();
  doc.likely_regression = null;
  const view = parseResults(doc);
  assert.equal(view.verdict, "insufficient_evidence");
  assert.equal(view.headline, "Insufficient evidence");
  assert.equal(view.invalidRun, false);
  assert.equal(view.scenarios.length, bundled.scenarios.length);
  assert.equal(view.scenarios.some((row) => "verdict" in row), false);
});

test("6% environment misses are recorded without becoming scenario verdicts", () => {
  const view = parseResults({
    ...bundled,
    likely_regression: null,
    invalid_run: true,
    arms: {
      ...bundled.arms,
      candidate: {
        scheduled_rollouts: 100,
        environment_misses: 6,
        miss_counts: { missing: 1, infrastructure: 5 },
        pass_rate: "90/94",
      },
    },
  });
  assert.equal(view.verdict, "invalid_run");
  assert.equal(view.arms.candidate.overMissLimit, true);
  assert.equal(view.arms.baseline.overMissLimit, false);
});

test("exactly 5% environment misses are not over the limit", () => {
  const view = parseResults({
    ...bundled,
    arms: {
      ...bundled.arms,
      candidate: {
        scheduled_rollouts: 100,
        environment_misses: 5,
        miss_counts: { infrastructure: 5 },
        pass_rate: "0.6",
      },
    },
  });
  assert.equal(view.arms.candidate.overMissLimit, false);
  assert.equal(view.arms.candidate.passRateText, "3/5");
});

test("miss_counts must sum to environment_misses", () => {
  const broken = structuredClone(bundled);
  broken.arms.candidate.environment_misses = 4;
  assert.throws(() => parseResults(broken), /miss_counts/);
});

test("version 1 files stay free of caption fields", () => {
  const view = parseResults(asVersion1());
  assert.equal(view.version, 1);
  assert.equal(view.headline, "Pass");
  assert.equal(view.verdict, "no_regression");
  assert.equal("caption" in view.arms.baseline, false);
  assert.equal("caption" in view.arms.candidate, false);
  assert.equal("modelId" in view.arms.baseline, false);
  assert.equal("modelId" in view.arms.candidate, false);
  assert.equal(view.scenarios.every((row) => !("caption" in row)), true);
});

test("a version 1 file still shows a model id when one is recorded", () => {
  const doc = asVersion1();
  doc.arms.candidate.model_id = "gemini-3.5-flash-lite";
  const view = parseResults(doc);
  assert.equal(view.version, 1);
  assert.equal("modelId" in view.arms.baseline, false);
  assert.equal(view.arms.candidate.modelId, "gemini-3.5-flash-lite");
  assert.equal(view.headline, "Pass");
});

test("an invalid legacy file still parses", () => {
  assert.equal(bundled.version, "2.1.0");
  assert.equal(bundled.schema_version, "2.1.0");
  const viaV2 = parseResultsV2(bundled);
  assert.deepEqual(parseResults(bundled), viaV2);
  assert.equal(viaV2.version, "2.1.0");
  assert.equal(viaV2.schemaVersion, "2.1.0");
  assert.equal(viaV2.headline, "Pass");
  assert.equal(viaV2.verdict, "no_regression");
  assert.equal(viaV2.arms.baseline.modelId, "baseline model id (lives in config/allowed_models.txt and is passed with --model)");
  assert.equal(viaV2.arms.candidate.modelId, "a pinned Gemini Flash-Lite model id (lives in config/allowed_models.txt and is passed with --model)");
  assert.equal(viaV2.modelIdSources.baseline, "overall");
  assert.equal(viaV2.modelIdSources.candidate, "overall");
  assert.equal(viaV2.interval.fromFile, true);
  assert.equal(viaV2.interval.text, "δ = 5 pp · 90% CI");
  assert.equal(viaV2.runKind, "screening");
  assert.match(viaV2.arms.baseline.caption, /0\.05/);
  assert.match(viaV2.arms.candidate.caption, /\$1\.25/);
  assert.equal(viaV2.scenarios.every((row) => typeof row.caption === "string" && row.caption.length > 0), true);
  assert.throws(() => parseResultsV2(asVersion1()), /unsupported results version 1/);
});

test("version 2.0.0 still parses from per-arm model ids and falls back the interval line", () => {
  const doc = asVersion2();
  const view = parseResultsV2(doc);
  assert.equal(view.version, "2.0.0");
  assert.equal(view.schemaVersion, null);
  assert.equal(view.headline, "Pass");
  assert.equal(view.verdict, "no_regression");
  assert.equal(view.modelIdSources.baseline, "arm");
  assert.equal(view.modelIdSources.candidate, "arm");
  assert.equal(view.arms.baseline.modelId, "baseline model id (lives in config/allowed_models.txt and is passed with --model)");
  assert.equal(view.arms.candidate.modelId, "a pinned Gemini Flash-Lite model id (lives in config/allowed_models.txt and is passed with --model)");
  assert.equal(view.modelIds.baseline, view.arms.baseline.modelId);
  assert.equal(view.modelIds.candidate, view.arms.candidate.modelId);
  assert.equal(view.interval.fromFile, false);
  assert.equal(view.interval.text, INTERVAL_FALLBACK);
  assert.match(view.arms.baseline.caption, /0\.05/);
  assert.match(view.arms.candidate.caption, /\$1\.25/);
});

test("verdict labels are Pass, Block, Insufficient evidence, and Invalid run", () => {
  assert.equal(parseResults(withLikely(false, false)).headline, "Pass");
  assert.equal(parseResults(withLikely(true, false)).headline, "Block");
  const thin = asVersion2();
  thin.likely_regression = null;
  thin.invalid_run = false;
  assert.equal(parseResults(thin).headline, "Insufficient evidence");
  assert.equal(parseResults(withLikely(true, true)).headline, "Invalid run");
});

test("a model id that is not a string is rejected", () => {
  const doc = structuredClone(bundled);
  doc.arms.baseline.model_id = 3;
  assert.throws(() => parseResultsV2(doc), /arms\.baseline\.model_id must be a string/);
});

test("model ids are omitted when the file does not record them", () => {
  const doc = structuredClone(bundled);
  delete doc.arms.baseline.model_id;
  delete doc.arms.candidate.model_id;
  doc.version = "2.0.0";
  delete doc.verdicts;
  delete doc.schema_version;
  const view = parseResultsV2(doc);
  assert.equal("modelId" in view.arms.baseline, false);
  assert.equal("modelId" in view.arms.candidate, false);
  assert.equal(view.modelIdSources.baseline, "none");
  assert.equal(view.modelIdSources.candidate, "none");
  assert.equal(view.version, "2.0.0");
  assert.equal(view.interval.fromFile, false);
  assert.equal(view.interval.text, INTERVAL_FALLBACK);
});

test("version 2.0.0 accepts arm and scenario captions, including decimals and amounts", () => {
  const doc = {
    ...bundled,
    version: "2.0.0",
    arms: {
      baseline: {
        ...bundled.arms.baseline,
        caption: "  Baseline stayed within 0.05 of the previous gate.  ",
      },
      candidate: {
        ...bundled.arms.candidate,
        caption: "Candidate fees stayed at $1.25. <b>not bold</b>",
      },
    },
    scenarios: [
      {
        id: "reset-locked-account",
        name: "Reset a locked account",
        baseline_rate: "18/20",
        candidate_rate: "0.6",
        caption: "Locked resets missed by 0.05 after the $1.25 credit.",
      },
      {
        id: "refund-duplicate-charge",
        name: "Refund a duplicate charge",
        baseline_rate: "17/20",
        candidate_rate: "4/5",
      },
    ],
  };
  delete doc.schema_version;
  const view = parseResults(doc);
  assert.equal(view.version, "2.0.0");
  assert.equal(view.verdict, "no_regression");
  assert.equal(view.arms.baseline.caption, "Baseline stayed within 0.05 of the previous gate.");
  assert.equal(view.arms.candidate.caption, "Candidate fees stayed at $1.25. <b>not bold</b>");
  assert.equal(view.arms.candidate.passRateText, "3/5");
  assert.equal(view.scenarios[0].caption, "Locked resets missed by 0.05 after the $1.25 credit.");
  assert.equal(view.scenarios[0].candidateText, "3/5");
  assert.equal("caption" in view.scenarios[1], false);
  assert.deepEqual(Object.keys(view.scenarios[0]).sort(), [
    "baselineText",
    "candidateText",
    "caption",
    "id",
    "name",
  ]);
});

test("a later 2.x file without captions still parses", () => {
  const doc = structuredClone(bundled);
  doc.version = "2.1.0";
  delete doc.arms.baseline.caption;
  delete doc.arms.candidate.caption;
  for (const scenario of doc.scenarios) delete scenario.caption;
  const view = parseResults(doc);
  assert.equal(view.version, "2.1.0");
  assert.equal(view.scenarios[0].name, bundled.scenarios[0].name);
  assert.equal("caption" in view.scenarios[0], false);
  assert.equal(view.arms.candidate.modelId, bundled.arms.candidate.model_id);
});

test("any other major version names itself instead of failing quietly", () => {
  assert.throws(
    () => parseResults({ ...bundled, version: "3.0.0" }),
    (error) => {
      assert.equal(error.message, "unsupported results version 3.0.0");
      return true;
    },
  );
  assert.throws(
    () => parseResults({ ...bundled, version: 2 }),
    /unsupported results version 2/,
  );
  assert.throws(
    () => parseResults({ ...bundled, version: "1.0.0" }),
    /unsupported results version 1\.0\.0/,
  );
});

test("coming soon charts drop any stray series", () => {
  const view = parseResults({
    ...bundled,
    charts: {
      ...bundled.charts,
      aa: {
        status: "coming_soon",
        title: "The gate doesn't cry wolf",
        points: [{ budget: 20, drop: "1/10" }],
      },
    },
  });
  assert.deepEqual(view.charts.aa.points, []);
});

test("schema 2.1.0 prefers verdicts.overall.model_ids over the per-arm model_id", () => {
  const doc = structuredClone(bundled);
  doc.arms.baseline.model_id = "arm-baseline-id";
  doc.arms.candidate.model_id = "arm-candidate-id";
  doc.verdicts.overall.model_ids.baseline = "gemini-2.5-flash-lite-001";
  doc.verdicts.overall.model_ids.candidate = "gemini-3.5-flash-lite";
  const view = parseResults(doc);
  assert.equal(view.version, "2.1.0");
  assert.equal(view.schemaVersion, "2.1.0");
  assert.equal(view.headline, "Pass");
  assert.equal(view.arms.baseline.modelId, "gemini-2.5-flash-lite-001");
  assert.equal(view.arms.candidate.modelId, "gemini-3.5-flash-lite");
  assert.equal(view.modelIdSources.baseline, "overall");
  assert.equal(view.modelIdSources.candidate, "overall");
});

test("schema 2.1.0 requires overall model ids and likely_regression", () => {
  const missingIds = structuredClone(bundled);
  delete missingIds.verdicts.overall.model_ids;
  assert.throws(() => parseResultsV2(missingIds), /verdicts\.overall\.model_ids is required/);

  const missingCall = structuredClone(bundled);
  delete missingCall.verdicts.overall.likely_regression;
  assert.throws(
    () => parseResults(missingCall),
    /verdicts\.overall\.likely_regression must be a boolean/,
  );
});

test("a 2.0.0 file can take one overall model id and keep the other arm id", () => {
  const doc = asVersion2();
  doc.verdicts = { overall: { model_ids: { baseline: "gemini-2.5-flash-lite-001" } } };
  doc.arms.baseline.model_id = "arm-baseline-id";
  const view = parseResultsV2(doc);
  assert.equal(view.version, "2.0.0");
  assert.equal(view.modelIdSources.baseline, "overall");
  assert.equal(view.modelIdSources.candidate, "arm");
  assert.equal(view.arms.baseline.modelId, "gemini-2.5-flash-lite-001");
  assert.equal(view.arms.candidate.modelId, "a pinned Gemini Flash-Lite model id (lives in config/allowed_models.txt and is passed with --model)");
  assert.equal(view.headline, "Pass");
});

test("delta and the CI level come from verdicts.overall, and a gate block is ignored", () => {
  const older = parseResults(asVersion1());
  assert.equal(older.interval.fromFile, false);
  assert.equal(older.interval.text, INTERVAL_FALLBACK);
  assert.equal(older.interval.text, "δ = 5 pp / 90%");

  const doc = structuredClone(bundled);
  doc.gate = { alpha: "0.1", ci_level: "0.95", miss_cap: "0.05", delta: "0.2" };
  doc.alpha = "0.1";
  doc.ci_level = "0.95";
  doc.miss_cap = "1/20";
  const view = parseResults(doc);
  assert.equal(view.interval.fromFile, true);
  assert.equal(view.interval.delta, "0.05");
  assert.equal(view.interval.ciLevel, "0.9");
  assert.equal(view.interval.text, "δ = 5 pp · 90% CI");
  assert.equal(view.headline, "Pass");
  assert.equal("gate" in view, false);
});

test("2.1.0 fraction strings are exact and rollouts_per_scenario counts must match", () => {
  const numeric = structuredClone(bundled);
  numeric.min_valid_fraction_per_scenario = 0.6;
  assert.throws(() => parseResults(numeric), /min_valid_fraction_per_scenario must be a string/);

  const numericDelta = structuredClone(bundled);
  numericDelta.verdicts.overall.delta = 0.05;
  assert.throws(() => parseResults(numericDelta), /verdicts\.overall\.delta must be a string/);

  const uneven = structuredClone(bundled);
  uneven.rollouts_per_scenario = { baseline: 20, candidate: 5 };
  assert.throws(
    () => parseResults(uneven),
    /rollouts_per_scenario baseline and candidate must be equal/,
  );

  const kind = structuredClone(bundled);
  kind.run_kind = "explore";
  assert.throws(() => parseResults(kind), /run_kind must be screening, baseline, aa, or gate/);
});

test("suite_id is optional on schema 2.1.0 and a non-string is rejected", () => {
  const doc = structuredClone(bundled);
  assert.equal(Object.hasOwn(doc, "suite_id"), false);
  assert.equal(parseResults(doc).suiteId, "");
  doc.suite_id = "example";
  assert.equal(parseResults(doc).suiteId, "example");
  assert.equal(parseResults(doc).version, "2.1.0");
  doc.suite_id = "";
  assert.throws(() => parseResults(doc), /suite_id must not be empty/);
  doc.suite_id = 3;
  assert.throws(() => parseResults(doc), /suite_id must be a string/);
});

test("run_summary stopped is null or monthly_cap", () => {
  const doc = structuredClone(bundled);
  doc.run_summary.stopped = "monthly_cap";
  assert.equal(parseResults(doc).runSummary.stopped, "monthly_cap");
  assert.equal(parseResults(doc).headline, "Pass");
  doc.run_summary.stopped = "hard_stop";
  assert.throws(() => parseResults(doc), /run_summary\.stopped must be null or "monthly_cap"/);
  delete doc.run_summary;
  assert.equal(parseResults(doc).runSummary, null);
  assert.equal(summaryRows(null).length, 0);
});

test("money accepts a number or a decimal string and rejects exponents and negatives", () => {
  const base = {
    schema_version: "1.0.0",
    planned_rollouts: 2,
    completed_rollouts: 2,
    infra_misses: 0,
    stopped: null,
    total_cached_input_tokens: 0,
    rollout_duration_p50_s: 1.5,
    rollout_duration_max_s: 1.5,
  };
  const fromNumber = summaryRows(parseRunSummary({ ...base, total_cost_usd: 0.0123 }));
  const fromString = summaryRows(parseRunSummary({ ...base, total_cost_usd: "0.0123" }));
  assert.equal(parseRunSummary({ ...base, total_cost_usd: "0.0123" }).totalCostUsd, 0.0123);
  assert.equal(parseRunSummary({ ...base, total_cost_usd: 0.0123 }).totalCostUsd, 0.0123);
  assert.equal(
    fromString.find((row) => row.label === "Total cost").text,
    fromNumber.find((row) => row.label === "Total cost").text,
  );
  assert.equal(fromString.find((row) => row.label === "Total cost").text, "$0.012");
  for (const bad of ["1e2", "1E-2", "1.5e1", "-1", "-0.5", " -0.1", "unset", "1.2.3", ""]) {
    assert.throws(() => parseRunSummary({ ...base, total_cost_usd: bad }), /decimal string/);
  }
  assert.throws(() => parseRunSummary({ ...base, total_cost_usd: -1 }), /non-negative number/);
  assert.equal(parseRunSummary({ ...base, total_cost_usd: "0", ceiling: null, per_rollout_cost_usd: "0.01" }).totalCostUsd, 0);
});

test("a zero duration with no completed rollouts renders n/a", () => {
  const idle = parseRunSummary({
    schema_version: "1.0.0",
    planned_rollouts: 1,
    completed_rollouts: 0,
    infra_misses: 0,
    stopped: null,
    total_cost_usd: "0.0",
    total_cached_input_tokens: 0,
    rollout_duration_p50_s: 0.0,
    rollout_duration_max_s: 0,
  });
  const rows = summaryRows(idle);
  for (const label of ["Rollout duration p50", "Rollout duration max"]) {
    const row = rows.find((item) => item.label === label);
    assert.equal(row.text, "n/a");
    assert.equal(row.example, false);
    assert.notEqual(row.text, "0 s");
    assert.notEqual(row.text, "0s");
    assert.notEqual(row.text, "0 ms");
  }
  const running = summaryRows(parseRunSummary({
    schema_version: "1.0.0",
    planned_rollouts: 1,
    completed_rollouts: 1,
    infra_misses: 0,
    stopped: null,
    total_cost_usd: 0,
    total_cached_input_tokens: 0,
    rollout_duration_p50_s: 0,
    rollout_duration_max_s: 0,
  }));
  assert.equal(running.find((row) => row.label === "Rollout duration p50").text, "0 s");
});

test("schema_version 2.1.0 can stand in for version and must agree when both are set", () => {
  const doc = structuredClone(bundled);
  delete doc.version;
  const view = parseResults(doc);
  assert.equal(view.version, "2.1.0");
  assert.equal(view.schemaVersion, "2.1.0");
  assert.equal(view.headline, "Pass");

  const mismatch = structuredClone(bundled);
  mismatch.version = "2.0.0";
  assert.throws(() => parseResults(mismatch), /schema_version must match version/);

  const bad = structuredClone(bundled);
  bad.schema_version = 2.1;
  assert.throws(() => parseResults(bad), /schema_version must be a 2\.x\.y string/);
});

test("a non-string overall model id is rejected", () => {
  const doc = structuredClone(bundled);
  doc.verdicts.overall.model_ids.candidate = 3;
  assert.throws(
    () => parseResultsV2(doc),
    /verdicts\.overall\.model_ids\.candidate must be a string/,
  );
});

test("recorded delta and CI level do not change Pass, Block, Insufficient evidence, or Invalid run", () => {
  assert.equal(parseResults(withLikely(false, false)).headline, "Pass");
  assert.equal(parseResults(withLikely(true, false)).headline, "Block");
  const thin = asVersion2();
  thin.likely_regression = null;
  thin.invalid_run = false;
  assert.equal(parseResults(thin).headline, "Insufficient evidence");
  assert.equal(parseResults(withLikely(true, true)).headline, "Invalid run");
});

function withLikely(likely, invalid = false, doc = bundled) {
  const copy = structuredClone(doc);
  copy.likely_regression = likely;
  copy.invalid_run = invalid;
  if (copy.verdicts?.overall && typeof likely === "boolean") {
    copy.verdicts.overall.likely_regression = likely;
  }
  return copy;
}

function asVersion2(doc = bundled) {
  const copy = structuredClone(doc);
  copy.version = "2.0.0";
  delete copy.schema_version;
  delete copy.verdicts;
  delete copy.gate;
  return copy;
}

function asVersion1(doc = bundled) {
  const copy = structuredClone(doc);
  copy.version = 1;
  delete copy.schema_version;
  delete copy.verdicts;
  delete copy.gate;
  for (const name of ["baseline", "candidate"]) {
    delete copy.arms[name].caption;
    delete copy.arms[name].model_id;
  }
  for (const scenario of copy.scenarios) delete scenario.caption;
  return copy;
}

test("run_summary reads 1.1.0 from harness main and still reads 1.0.0", () => {
  const base = {
    planned_rollouts: 1,
    completed_rollouts: 1,
    infra_misses: 0,
    stopped: null,
    total_cost_usd: "0.01",
    total_cached_input_tokens: 0,
    rollout_duration_p50_s: 1,
    rollout_duration_max_s: 1,
  };
  assert.equal(parseRunSummary({ ...base, schema_version: "1.1.0", model_version: "v" }).totalCostUsd, 0.01);
  assert.equal(parseRunSummary({ ...base, schema_version: "1.1.0", model_version: null }).totalCostUsd, 0.01);
  assert.equal(parseRunSummary({ ...base, schema_version: "1.0.0" }).totalCostUsd, 0.01);
  for (const bad of ["1.2.0", "2.0.0", "1", undefined]) {
    assert.throws(() => parseRunSummary({ ...base, schema_version: bad }), /must be 1\.0\.0 or 1\.1\.0/);
  }
});
