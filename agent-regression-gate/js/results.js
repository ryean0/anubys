/**
 * results.json v1, harness schema 2.0.0, and harness schema 2.1.0.
 *
 * RESULTS_PATH is the only results file the results panel loads. Replace that
 * file in place with real harness output (expected around 30 October 2026).
 * Example check timings live in data/timing.sample.json and are not a results
 * file. Run summary numbers live in RUN_SUMMARY_PATH, a separate example of
 * the file `harness run` writes. That file is not a field of results.json.
 *
 * parseResults still accepts version 1. A 2.x.y file with arms, including
 * 2.0.0 and an older 2.1.0 arms document, is read by parseResultsV2.
 * A harness 2.1.0 document (schema_version "2.1.0", environment_misses, no
 * arms) is read by the harness path. It is not schema 3.0.0.
 *
 * Legacy suite labels come from the file, not from scenario rows:
 *   likely_regression false → Pass
 *   likely_regression true → Block
 *   likely_regression null, and invalid_run is not true → Insufficient evidence
 *   invalid_run true → Invalid run
 *
 * Harness 2.1.0 labels come from verdicts.overall.verdict:
 *   pass, block, insufficient_evidence, invalid_run.
 * likely_regression is a boolean on that verdict. It is true only when the
 * verdict is insufficient_evidence and difference is below -delta.
 *
 * Scenario rows are diagnostics. They never become a per-scenario pass or block.
 * Version 2.0.0 adds an optional one-sentence caption on each scenario and arm,
 * and an optional model_id on each arm. Harness 2.1.0 does not. Model ids are
 * verdicts.overall.model_ids.baseline and .candidate, plus baseline_pool_model_id.
 * screening, baseline, and aa share one id. gate may use a different candidate
 * id, and its baseline id must equal baseline_pool_model_id.
 * When delta and the CI level are missing, the page shows δ = 5 pp / 90%.
 */

import { exceedsRate, formatRatio, parseRational, parseSignedRational } from "./rational.js";

const ARM_NAMES = ["baseline", "candidate"];
const V2_VERSION = /^2\.\d+\.\d+$/;
const RUN_KINDS = new Set(["screening", "baseline", "aa", "gate"]);
/** Shown when verdicts.overall does not record delta and a CI level. */
export const INTERVAL_FALLBACK = "δ = 5 pp / 90%";

/** Drop real harness output at this path. */
export const RESULTS_PATH = "data/results.preliminary.json";

/** Example of the separate run_summary.json written by harness run. schema_version 1.1.0. */
export const RUN_SUMMARY_PATH = "data/run_summary.example.json";

const RATE_SLASH = "/";
const RATE_DENOMINATOR = "20";

/** Show a misses/scheduled fraction as a percentage, with no denominator. */
export function publicText(value) {
  const pattern = new RegExp(`(\\d+)${RATE_SLASH}${RATE_DENOMINATOR}\\b`, "g");
  return String(value ?? "").replace(pattern, (_, count) => (
    `Example: ${percentFromNumber(Number(count) / Number(RATE_DENOMINATOR))}`
  ));
}

/** Render a misses/scheduled fraction as an Example percentage. */
export function formatMissRate(rate) {
  const shown = publicText(rate);
  if (/^Example: \d+(?:\.\d+)?%$/.test(shown)) return `${shown} miss rate`;
  return shown;
}

export function parseResults(doc) {
  const version = requireSupported(doc);
  if (isHarnessDocument(doc)) return buildHarnessView(doc);
  if (version === 1) return buildView(doc, version);
  return parseResultsV2(doc);
}

/** Harness results schema 2.0.0 and 2.1.0, and any later 2.x.y file. Version 1 is rejected here. */
export function parseResultsV2(doc) {
  const version = requireSupported(doc);
  if (version === 1) throw new Error("unsupported results version 1");
  if (isHarnessDocument(doc)) return buildHarnessView(doc);
  return buildView(doc, version);
}

function isHarnessDocument(doc) {
  return Boolean(
    doc
    && typeof doc === "object"
    && !Array.isArray(doc)
    && doc.schema_version === "2.1.0"
    && !doc.arms
    && doc.environment_misses
    && doc.verdicts,
  );
}

function requireSupported(doc) {
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
    throw new Error("results.json must be an object");
  }
  return supportedVersion(doc);
}

function buildView(doc, version) {
  const status = doc.status;
  if (status !== "preliminary" && status !== "final") {
    throw new Error("status must be \"preliminary\" or \"final\"");
  }
  assertLevel(doc.level);
  const schema210 = isSchema210(doc, version);
  const likelyRegression = readLikelyRegression(doc, schema210);
  const invalidRun = doc.invalid_run === true;
  const overall = readOverall(doc, schema210);
  const modelIdSources = {};
  const arms = {};
  for (const name of ARM_NAMES) {
    const resolved = resolveModelId(doc.arms?.[name], name, overall.modelIds?.[name] ?? "");
    modelIdSources[name] = resolved.source;
    arms[name] = parseArm(doc.arms?.[name], name, resolved.modelId);
  }

  const verdict = invalidRun
    ? "invalid_run"
    : likelyRegression === null
      ? "insufficient_evidence"
      : likelyRegression
        ? "likely_regression"
        : "no_regression";

  return {
    version,
    schemaVersion: schemaVersionOf(doc),
    status,
    level: 0.9,
    likelyRegression,
    invalidRun,
    verdict,
    headline: headlineFor(verdict),
    why: whyFor(verdict),
    banner: bannerFor(status),
    summaryNote: noteText(doc.notes, "summary"),
    suite: typeof doc.suite === "string" ? doc.suite : "",
    suiteId: readSuiteId(doc),
    runSummary: readRunSummary(doc),
    runKind: readRunKind(doc),
    baselinePoolModelId: readPoolModelId(doc),
    minValidFraction: readMinValidFraction(doc),
    rolloutsPerScenario: readRolloutsPerScenario(doc),
    modelIds: {
      baseline: arms.baseline.modelId || "",
      candidate: arms.candidate.modelId || "",
    },
    modelIdSources,
    interval: intervalView(overall),
    arms,
    scenarios: parseScenarios(doc.scenarios),
    diagnostics: parseDiagnostics(doc.diagnostics),
    charts: {
      mde: parseChart(doc, "mde", {
        status: "preliminary",
        title: "Smallest drop we can reliably catch",
        xLabel: "Rollout budget",
        yLabel: "Smallest drop",
      }),
      aa: parseChart(doc, "aa", {
        status: "coming_soon",
        title: "The gate doesn't cry wolf",
        xLabel: "",
        yLabel: "",
      }),
    },
  };
}

function supportedVersion(doc) {
  const version = doc.version;
  const schemaVersion = doc.schema_version;
  if (schemaVersion != null && (typeof schemaVersion !== "string" || !V2_VERSION.test(schemaVersion))) {
    throw new Error("schema_version must be a 2.x.y string");
  }
  if (version === 1) {
    if (schemaVersion != null) throw new Error("schema_version is not used on results version 1");
    return 1;
  }
  if (typeof version === "string" && V2_VERSION.test(version)) {
    if (schemaVersion != null && schemaVersion !== version) {
      throw new Error("schema_version must match version");
    }
    return version;
  }
  if ((version == null || version === "") && schemaVersion) return schemaVersion;
  throw new Error(`unsupported results version ${versionToken(version)}`);
}

function schemaVersionOf(doc) {
  return typeof doc.schema_version === "string" ? doc.schema_version : null;
}

function readSuiteId(doc) {
  if (doc.suite_id == null) return "";
  if (typeof doc.suite_id !== "string") throw new Error("suite_id must be a string");
  if (doc.suite_id.length < 1) throw new Error("suite_id must not be empty");
  return doc.suite_id.trim();
}

function readRunSummary(doc) {
  if (doc.run_summary == null) return null;
  const raw = doc.run_summary;
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("run_summary must be an object");
  }
  return readSummaryFields(raw, "run_summary");
}

/** run_summary.json versions this page reads. harness main writes 1.1.0, which adds model_version. */
export const RUN_SUMMARY_VERSIONS = Object.freeze(["1.0.0", "1.1.0"]);

/** Read run_summary.json (schema_version 1.0.0 or 1.1.0). This object is not inside results.json. */
export function parseRunSummary(doc) {
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
    throw new Error("run_summary.json must be an object");
  }
  if (!RUN_SUMMARY_VERSIONS.includes(doc.schema_version)) {
    throw new Error("run_summary schema_version must be 1.0.0 or 1.1.0");
  }
  return readSummaryFields(doc, "run_summary");
}

function readSummaryFields(raw, label) {
  return {
    plannedRollouts: readOptionalCount(raw.planned_rollouts, `${label}.planned_rollouts`),
    completedRollouts: readOptionalCount(raw.completed_rollouts, `${label}.completed_rollouts`),
    infraMisses: readOptionalCount(raw.infra_misses, `${label}.infra_misses`),
    stopped: readStopped(raw.stopped),
    totalCostUsd: readOptionalMoney(raw.total_cost_usd, `${label}.total_cost_usd`),
    totalCachedInputTokens: readOptionalCount(raw.total_cached_input_tokens, `${label}.total_cached_input_tokens`),
    rolloutDurationP50S: readOptionalNumber(raw.rollout_duration_p50_s, `${label}.rollout_duration_p50_s`),
    rolloutDurationMaxS: readOptionalNumber(raw.rollout_duration_max_s, `${label}.rollout_duration_max_s`),
  };
}

function readStopped(value) {
  if (value == null) return null;
  if (value === "monthly_cap") return "monthly_cap";
  throw new Error("run_summary.stopped must be null or \"monthly_cap\"");
}

function readOptionalCount(value, label) {
  if (value == null) return null;
  return requireCount(value, label);
}

function readOptionalNumber(value, label) {
  if (value == null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a non-negative number`);
  }
  return value;
}

/** Money from harness run: a non-negative number, or a decimal string such as "0.0123".
 * Decimal strings never use exponent notation or a leading minus. */
const MONEY_STRING = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;

function readOptionalMoney(value, label) {
  if (value == null) return null;
  if (typeof value === "number") return readOptionalNumber(value, label);
  if (typeof value !== "string") {
    throw new Error(`${label} must be a non-negative number or decimal string`);
  }
  const text = value.trim();
  if (/[eE]/.test(text) || text.startsWith("-") || !MONEY_STRING.test(text)) {
    throw new Error(`${label} must be a non-negative number or decimal string`);
  }
  const parsed = Number(text);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${label} must be a non-negative number or decimal string`);
  }
  return parsed;
}

/** Rows for the results panel. Numbers are marked so the page can tag them Example. */
export function summaryRows(summary) {
  if (!summary) return [];
  return [
    summaryRow("Planned rollouts", summary.plannedRollouts, "count"),
    summaryRow("Completed rollouts", summary.completedRollouts, "count"),
    summaryRow("Infrastructure misses", summary.infraMisses, "count"),
    summaryRow("Stopped", summary.stopped, "stop"),
    summaryRow("Total cost", summary.totalCostUsd, "usd"),
    summaryRow("Cached input tokens", summary.totalCachedInputTokens, "count"),
    summaryRow("Rollout duration p50", summary.rolloutDurationP50S, "seconds", summary.completedRollouts),
    summaryRow("Rollout duration max", summary.rolloutDurationMaxS, "seconds", summary.completedRollouts),
  ];
}

function summaryRow(label, value, kind, completedRollouts) {
  const noDuration = kind === "seconds" && value === 0 && completedRollouts === 0;
  const missing = (kind !== "stop" && value == null) || noDuration;
  return {
    label,
    text: noDuration ? "n/a" : formatSummaryValue(value, kind),
    example: !missing && kind !== "stop",
  };
}

function formatSummaryValue(value, kind) {
  if (kind === "stop") return value == null ? "None" : value;
  if (value == null) return "Not in this file";
  const text = Number.isInteger(value) ? String(value) : String(Math.round(value * 1000) / 1000);
  if (kind === "usd") return `$${text}`;
  if (kind === "seconds") return `${text} s`;
  return text;
}

function isSchema210(doc, version) {
  return version === "2.1.0" || doc.schema_version === "2.1.0";
}

function readLikelyRegression(doc, schema210) {
  if (schema210) {
    const value = doc.verdicts?.overall?.likely_regression;
    if (typeof value !== "boolean") {
      throw new Error("verdicts.overall.likely_regression must be a boolean");
    }
    if (doc.likely_regression !== undefined && doc.likely_regression !== true && doc.likely_regression !== false && doc.likely_regression !== null) {
      throw new Error("likely_regression must be true, false, or null");
    }
    return value;
  }
  if (doc.likely_regression !== true && doc.likely_regression !== false && doc.likely_regression !== null) {
    throw new Error("likely_regression must be true, false, or null");
  }
  return doc.likely_regression;
}

function versionToken(version) {
  if (typeof version === "string" || typeof version === "number" || typeof version === "boolean") {
    return String(version);
  }
  if (version == null) return "missing";
  return "unrecognized";
}

function assertLevel(level) {
  if (level === 0.9) return;
  if (typeof level === "string") {
    const ratio = parseRational(level);
    if (ratio.numerator * 10 === ratio.denominator * 9) return;
  }
  throw new Error("level must be 0.9");
}

function readOverall(doc, required) {
  if (doc.verdicts == null) {
    if (required) throw new Error("verdicts.overall is required");
    return { modelIds: null, delta: null, ciLevel: null };
  }
  if (typeof doc.verdicts !== "object" || Array.isArray(doc.verdicts)) {
    throw new Error("verdicts must be an object");
  }
  if (doc.verdicts.overall == null) {
    if (required) throw new Error("verdicts.overall is required");
    return { modelIds: null, delta: null, ciLevel: null };
  }
  const overall = doc.verdicts.overall;
  if (typeof overall !== "object" || Array.isArray(overall)) {
    throw new Error("verdicts.overall must be an object");
  }
  return {
    modelIds: readModelIdPair(overall.model_ids, "verdicts.overall.model_ids", required),
    delta: overall.delta === undefined ? null : readFraction(overall.delta, "verdicts.overall.delta").text,
    ciLevel: overall.difference_ci === undefined ? null : readDifferenceCi(overall.difference_ci, "verdicts.overall.difference_ci").level,
  };
}

function readModelIdPair(modelIds, label, required) {
  if (modelIds == null) {
    if (required) throw new Error(`${label} is required`);
    return null;
  }
  if (typeof modelIds !== "object" || Array.isArray(modelIds)) {
    throw new Error(`${label} must be an object`);
  }
  return {
    baseline: readNamedModelId(modelIds, "baseline", label, required),
    candidate: readNamedModelId(modelIds, "candidate", label, required),
  };
}

function readNamedModelId(modelIds, name, label, required) {
  if (!Object.prototype.hasOwnProperty.call(modelIds, name)) {
    if (required) throw new Error(`${label}.${name} is required`);
    return "";
  }
  const id = readModelId(modelIds[name], `${label}.${name}`);
  if (required && !id) throw new Error(`${label}.${name} is required`);
  return id;
}

function readRunKind(doc) {
  if (doc.run_kind == null) return "";
  if (!RUN_KINDS.has(doc.run_kind)) {
    throw new Error("run_kind must be screening, baseline, aa, or gate");
  }
  return doc.run_kind;
}

function readPoolModelId(doc) {
  if (doc.baseline_pool_model_id == null) return "";
  return readModelId(doc.baseline_pool_model_id, "baseline_pool_model_id");
}

function readMinValidFraction(doc) {
  if (doc.min_valid_fraction_per_scenario == null) return null;
  const fraction = readFraction(doc.min_valid_fraction_per_scenario, "min_valid_fraction_per_scenario");
  return fraction;
}

function readRolloutsPerScenario(doc) {
  if (doc.rollouts_per_scenario == null) return null;
  const pair = readCountPair(doc.rollouts_per_scenario, "rollouts_per_scenario");
  if (pair.baseline !== pair.candidate) {
    throw new Error("rollouts_per_scenario baseline and candidate must be equal");
  }
  return pair;
}

function readFraction(value, label) {
  if (typeof value !== "string") {
    throw new Error(`${label} must be a string such as "0.6"`);
  }
  const text = value.trim();
  if (!text) throw new Error(`${label} must be a string such as "0.6"`);
  return { text, ratio: parseRational(text) };
}

function readSignedFraction(value, label) {
  if (typeof value !== "string") {
    throw new Error(`${label} must be a string such as "0.05" or "-0.05"`);
  }
  const text = value.trim();
  if (!text) throw new Error(`${label} must be a string such as "0.05" or "-0.05"`);
  return { text, ratio: parseSignedRational(text) };
}

function readDifferenceCi(raw, label) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`${label} must be an object`);
  }
  const lower = readSignedFraction(raw.lower, `${label}.lower`);
  const upper = readSignedFraction(raw.upper, `${label}.upper`);
  assertLevel(raw.level);
  return { lower, upper, level: raw.level };
}

function readCountPair(raw, label) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`${label} must be an object`);
  }
  return {
    baseline: requireCount(raw.baseline, `${label}.baseline`),
    candidate: requireCount(raw.candidate, `${label}.candidate`),
  };
}

function readCountMap(raw, label) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`${label} must be an object`);
  }
  const counts = {};
  for (const key of Object.keys(raw)) {
    counts[key] = requireCount(raw[key], `${label}.${key}`);
  }
  return counts;
}

function readStringList(raw, label) {
  if (!Array.isArray(raw)) throw new Error(`${label} must be an array`);
  return raw.map((item, index) => {
    if (typeof item !== "string") throw new Error(`${label}[${index}] must be a string`);
    return item;
  });
}

function parseDiagnostics(raw) {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) throw new Error("diagnostics must be an array");
  return raw.map((row, index) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      throw new Error(`diagnostics[${index}] must be an object`);
    }
    const label = `diagnostics[${index}]`;
    const scenarioId = readModelId(row.scenario_id, `${label}.scenario_id`);
    if (!scenarioId) throw new Error(`${label}.scenario_id is required`);
    const familyId = readModelId(row.family_id, `${label}.family_id`);
    if (!familyId) throw new Error(`${label}.family_id is required`);
    const baseline = readFraction(row.baseline_pass_rate, `${label}.baseline_pass_rate`);
    const candidate = readFraction(row.candidate_pass_rate, `${label}.candidate_pass_rate`);
    const difference = readSignedFraction(row.difference, `${label}.difference`);
    const differenceCi = readDifferenceCi(row.difference_ci, `${label}.difference_ci`);
    const cassette = row.missing_cassette_keys;
    if (!cassette || typeof cassette !== "object" || Array.isArray(cassette)) {
      throw new Error(`${label}.missing_cassette_keys must be an object`);
    }
    return {
      scenarioId,
      familyId,
      scheduledRollouts: readCountPair(row.scheduled_rollouts, `${label}.scheduled_rollouts`),
      missCounts: {
        baseline: readCountMap(row.miss_counts?.baseline, `${label}.miss_counts.baseline`),
        candidate: readCountMap(row.miss_counts?.candidate, `${label}.miss_counts.candidate`),
      },
      missingCassetteKeys: {
        baseline: readStringList(cassette.baseline, `${label}.missing_cassette_keys.baseline`),
        candidate: readStringList(cassette.candidate, `${label}.missing_cassette_keys.candidate`),
      },
      baselineText: formatRatio(baseline.ratio),
      candidateText: formatRatio(candidate.ratio),
      differenceText: formatRatio(difference.ratio),
      differenceCi: {
        lowerText: formatRatio(differenceCi.lower.ratio),
        upperText: formatRatio(differenceCi.upper.ratio),
        level: differenceCi.level,
      },
    };
  });
}

function intervalView(overall) {
  if (overall.delta == null && overall.ciLevel == null) {
    return { fromFile: false, text: INTERVAL_FALLBACK, delta: null, ciLevel: null };
  }
  const deltaText = overall.delta == null ? "δ = 5 pp" : formatDelta(overall.delta);
  const ciText = overall.ciLevel == null ? "90%" : formatCi(overall.ciLevel);
  return {
    fromFile: true,
    text: `${deltaText} · ${ciText}`,
    delta: overall.delta,
    ciLevel: overall.ciLevel,
  };
}

function resolveModelId(raw, name, preferred) {
  const fromArm = readModelId(raw?.model_id, `arms.${name}.model_id`);
  if (preferred) return { modelId: preferred, source: "overall" };
  if (fromArm) return { modelId: fromArm, source: "arm" };
  return { modelId: "", source: "none" };
}

function parseArm(raw, name, modelId) {
  if (!raw || typeof raw !== "object") {
    throw new Error(`arms.${name} is required`);
  }
  for (const field of ["scheduled_rollouts", "environment_misses", "miss_counts"]) {
    if (raw[field] === undefined) {
      throw new Error(`arms.${name}.${field} is required`);
    }
  }
  const scheduled = requireCount(raw.scheduled_rollouts, `arms.${name}.scheduled_rollouts`);
  const environmentMisses = requireCount(raw.environment_misses, `arms.${name}.environment_misses`);
  const missCounts = parseMissCounts(raw.miss_counts, name);
  const counted = Object.values(missCounts).reduce((sum, value) => sum + value, 0);
  if (counted !== environmentMisses) {
    throw new Error(
      `arms.${name}.environment_misses (${environmentMisses}) must equal the sum of miss_counts (${counted})`,
    );
  }
  const passRate = raw.pass_rate === undefined ? null : parseRational(raw.pass_rate);
  const caption = readCaption(raw.caption, `arms.${name}.caption`);
  const arm = {
    scheduled,
    environmentMisses,
    missCounts,
    passRate,
    passRateText: passRate ? formatRatio(passRate) : "n/a",
    overMissLimit: exceedsRate(environmentMisses, scheduled, 1, 20),
  };
  if (caption) arm.caption = caption;
  if (modelId) arm.modelId = modelId;
  return arm;
}

function parseMissCounts(raw, arm) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`arms.${arm}.miss_counts must be an object`);
  }
  const counts = {};
  const keys = Object.keys(raw);
  if (keys.length === 0) {
    throw new Error(`arms.${arm}.miss_counts must name each miss kind`);
  }
  for (const key of keys) {
    counts[key] = requireCount(raw[key], `arms.${arm}.miss_counts.${key}`);
  }
  return counts;
}

function requireCount(value, label) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer`);
  }
  return value;
}

function parseScenarios(raw) {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) throw new Error("scenarios must be an array");
  return raw.map((scenario, index) => {
    if (!scenario || typeof scenario !== "object") {
      throw new Error(`scenarios[${index}] must be an object`);
    }
    const id = typeof scenario.id === "string" && scenario.id ? scenario.id : `scenario-${index + 1}`;
    const name = typeof scenario.name === "string" && scenario.name ? scenario.name : id;
    const baseline = readScenarioRate(scenario, "baseline", index);
    const candidate = readScenarioRate(scenario, "candidate", index);
    const caption = readCaption(scenario.caption, `scenarios[${index}].caption`);
    const row = {
      id,
      name,
      baselineText: formatRatio(baseline),
      candidateText: formatRatio(candidate),
    };
    if (caption) row.caption = caption;
    return row;
  });
}

function readCaption(value, label) {
  if (value == null) return "";
  if (typeof value !== "string") {
    throw new Error(`${label} must be a string`);
  }
  return value.trim();
}

function readModelId(value, label) {
  if (value == null) return "";
  if (typeof value !== "string") {
    throw new Error(`${label} must be a string`);
  }
  return value.trim();
}

function rawText(value) {
  return typeof value === "string" ? value.trim() : String(value);
}

function ratioOf(value) {
  try {
    return parseRational(rawText(value));
  } catch {
    return null;
  }
}

function ratePercent(value) {
  const ratio = ratioOf(value);
  if (!ratio || ratio.numerator > ratio.denominator) return null;
  const scaled = ratio.numerator * 100;
  if (scaled % ratio.denominator === 0) return `${scaled / ratio.denominator}%`;
  const tenths = Math.round((scaled * 10) / ratio.denominator);
  const whole = Math.trunc(tenths / 10);
  const frac = Math.abs(tenths % 10);
  return `${whole}.${frac}%`;
}

function formatDelta(value) {
  const raw = rawText(value);
  if (/pp/i.test(raw)) return raw.includes("δ") ? raw : `δ = ${raw}`;
  const pct = ratePercent(value);
  if (pct) return `δ = ${pct.slice(0, -1)} pp`;
  return `δ = ${raw} pp`;
}

function formatCi(value) {
  const raw = rawText(value);
  if (/ci/i.test(raw)) return raw;
  if (raw.includes("%")) return `${raw} CI`;
  const pct = ratePercent(value);
  if (pct) return `${pct} CI`;
  return `${raw} CI`;
}

function readScenarioRate(scenario, arm, index) {
  const flat = scenario[`${arm}_rate`];
  const nested = scenario[arm]?.pass_rate;
  const value = flat !== undefined ? flat : nested;
  if (value === undefined) {
    throw new Error(`scenarios[${index}] needs ${arm}_rate or ${arm}.pass_rate`);
  }
  return parseRational(value);
}

function parseChart(doc, id, defaults) {
  const raw = doc.charts?.[id] ?? {};
  const status = raw.status ?? defaults.status;
  if (status !== "preliminary" && status !== "final" && status !== "coming_soon") {
    throw new Error(`charts.${id}.status is not recognized`);
  }
  const caption = stringNote(raw.notes) || noteText(doc.notes, id) || "";
  const points = status === "coming_soon" ? [] : parsePoints(raw.points, id);
  return {
    id,
    status,
    title: typeof raw.title === "string" && raw.title ? raw.title : defaults.title,
    caption,
    xLabel: typeof raw.x_label === "string" && raw.x_label ? raw.x_label : defaults.xLabel,
    yLabel: typeof raw.y_label === "string" && raw.y_label ? raw.y_label : defaults.yLabel,
    points,
  };
}

function parsePoints(raw, id) {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) throw new Error(`charts.${id}.points must be an array`);
  return raw.map((point, index) => {
    const budget = point?.budget;
    if (typeof budget !== "number" || !Number.isInteger(budget) || budget < 0) {
      throw new Error(`charts.${id}.points[${index}].budget must be a non-negative integer`);
    }
    const drop = parseRational(point.drop);
    return { budget, dropText: formatRatio(drop) };
  });
}

function noteText(notes, key) {
  if (!notes) return "";
  if (typeof notes === "string") return key === "summary" ? notes : "";
  if (typeof notes === "object") return stringNote(notes[key]);
  return "";
}

function stringNote(value) {
  return typeof value === "string" ? value.trim() : "";
}

const HARNESS_VERDICTS = new Set(["pass", "block", "insufficient_evidence", "invalid_run"]);
const SOURCES = new Set(["screening", "baseline_pool", "replay"]);

function buildHarnessView(doc) {
  if (doc.status !== "preliminary" && doc.status !== "final") {
    throw new Error("status must be \"preliminary\" or \"final\"");
  }
  if (!SOURCES.has(doc.source)) {
    throw new Error("source must be screening, baseline_pool, or replay");
  }
  const runKind = readRunKind(doc);
  if (!runKind) throw new Error("run_kind must be screening, baseline, aa, or gate");
  const poolId = readPoolModelId(doc);
  if (!poolId) throw new Error("baseline_pool_model_id is required");
  const note = readCaption(doc.note, "note");
  if (!note) throw new Error("note is required");
  const baselineId = readModelId(doc.baseline_id, "baseline_id");
  if (!baselineId) throw new Error("baseline_id is required");
  if (typeof doc.generated_at !== "string" || !doc.generated_at.trim()) {
    throw new Error("generated_at is required");
  }
  const rollouts = readRolloutsPerScenario(doc);
  if (!rollouts) throw new Error("rollouts_per_scenario is required");
  const total = readCountPair(doc.total_rollouts, "total_rollouts");
  const minValid = readMinValidFraction(doc);
  if (!minValid) throw new Error("min_valid_fraction_per_scenario is required");
  const environmentMisses = readEnvironmentMisses(doc.environment_misses);
  if (typeof doc.cost_usd !== "number" || !Number.isFinite(doc.cost_usd) || doc.cost_usd < 0) {
    throw new Error("cost_usd must be a non-negative number");
  }
  const verdicts = doc.verdicts;
  if (!verdicts || typeof verdicts !== "object" || Array.isArray(verdicts)) {
    throw new Error("verdicts must be an object");
  }
  const overall = verdicts.overall;
  if (!overall || typeof overall !== "object" || Array.isArray(overall)) {
    throw new Error("verdicts.overall is required");
  }
  if (!HARNESS_VERDICTS.has(overall.verdict)) {
    throw new Error("verdicts.overall.verdict must be pass, block, insufficient_evidence, or invalid_run");
  }
  const modelIds = readModelIdPair(overall.model_ids, "verdicts.overall.model_ids", true);
  assertArmModelIds(runKind, poolId, modelIds);
  const numbers = readHarnessNumbers(overall);
  const likelyRegression = assertHarnessLikely(overall.verdict, overall.likely_regression, numbers);
  const diagnostics = parseHarnessDiagnostics(verdicts.diagnostics, rollouts);
  if (
    total.baseline !== rollouts.baseline * diagnostics.length
    || total.candidate !== rollouts.candidate * diagnostics.length
  ) {
    throw new Error("total_rollouts must equal rollouts_per_scenario times the diagnostics");
  }
  for (const name of ARM_NAMES) {
    if (environmentMisses[name].scheduled !== total[name]) {
      throw new Error(`environment_misses.${name}.scheduled must equal total_rollouts.${name}`);
    }
  }
  const verdictKey = overall.verdict === "pass"
    ? "no_regression"
    : overall.verdict === "block"
      ? "likely_regression"
      : overall.verdict;
  const recordedCaption = verdicts.verdict_captions?.[overall.verdict]?.caption;
  const why = typeof recordedCaption === "string" && recordedCaption.trim()
    ? recordedCaption.trim()
    : whyFor(verdictKey);
  const arms = {};
  for (const name of ARM_NAMES) {
    const miss = environmentMisses[name];
    arms[name] = {
      scheduled: miss.scheduled,
      environmentMisses: miss.misses,
      missCounts: {},
      passRate: null,
      passRateText: "Not in this file",
      rateText: formatMissRate(miss.rate),
      overMissLimit: exceedsRate(miss.misses, miss.scheduled, 1, 20),
      modelId: modelIds[name],
    };
  }
  return {
    version: "2.1.0",
    schemaVersion: "2.1.0",
    shape: "harness",
    status: doc.status,
    source: doc.source,
    level: numbers.ciLevel ?? 0.9,
    likelyRegression,
    invalidRun: overall.verdict === "invalid_run",
    verdict: verdictKey,
    headline: headlineFor(verdictKey),
    why: publicText(why),
    banner: bannerFor(doc.status),
    summaryNote: publicText(note),
    suite: "",
    suiteId: readSuiteId(doc),
    runSummary: null,
    runKind,
    baselineId,
    baselinePoolModelId: poolId,
    minValidFraction: minValid,
    rolloutsPerScenario: rollouts,
    totalRollouts: total,
    costUsd: doc.cost_usd,
    modelIds,
    modelIdSources: { baseline: "overall", candidate: "overall" },
    interval: harnessInterval(numbers),
    arms,
    scenarios: diagnostics.map((row) => ({
      id: row.scenarioId,
      name: row.scenarioId,
      baselineText: row.baselineText,
      candidateText: row.candidateText,
    })),
    diagnostics,
    charts: {
      mde: readMde(doc.mde),
      aa: readAa(doc.aa),
    },
  };
}

function readEnvironmentMisses(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("environment_misses must be an object");
  }
  const out = {};
  for (const name of ARM_NAMES) {
    const arm = raw[name];
    if (!arm || typeof arm !== "object" || Array.isArray(arm)) {
      throw new Error(`environment_misses.${name} is required`);
    }
    const scheduled = requireCount(arm.scheduled, `environment_misses.${name}.scheduled`);
    const misses = requireCount(arm.misses, `environment_misses.${name}.misses`);
    if (typeof arm.rate !== "string" || !arm.rate.trim()) {
      throw new Error(`environment_misses.${name}.rate must be a fraction string`);
    }
    out[name] = { scheduled, misses, rate: arm.rate.trim() };
  }
  return out;
}

function readHarnessNumbers(overall) {
  const required = overall.verdict !== "invalid_run";
  const difference = readBoundedNumber(overall.difference, "verdicts.overall.difference", -1, 1, required);
  const delta = readBoundedNumber(overall.delta, "verdicts.overall.delta", 0, 1, required, true);
  if (overall.difference_ci == null) {
    if (required) throw new Error("verdicts.overall.difference_ci is required");
    return { difference, delta, lower: null, upper: null, ciLevel: null };
  }
  const ci = readHarnessCi(overall.difference_ci);
  return { difference, delta, lower: ci.lower, upper: ci.upper, ciLevel: ci.level };
}

function readHarnessCi(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("verdicts.overall.difference_ci must be an object");
  }
  const lower = readBoundedNumber(raw.lower, "verdicts.overall.difference_ci.lower", -1, 1, true);
  const upper = readBoundedNumber(raw.upper, "verdicts.overall.difference_ci.upper", -1, 1, true);
  assertLevel(raw.level);
  return { lower, upper, level: raw.level };
}

function readBoundedNumber(value, label, min, max, required, exclusive = false) {
  if (value == null) {
    if (required) throw new Error(`${label} is required`);
    return null;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a number`);
  }
  const below = exclusive ? value <= min : value < min;
  const above = exclusive ? value >= max : value > max;
  if (below || above) throw new Error(`${label} is out of range`);
  return value;
}

function assertHarnessLikely(verdict, flag, numbers) {
  if (typeof flag !== "boolean") {
    throw new Error("verdicts.overall.likely_regression must be a boolean");
  }
  if (verdict !== "insufficient_evidence") {
    if (flag) throw new Error("likely_regression is false unless the verdict is insufficient_evidence");
    return false;
  }
  if (numbers.difference == null || numbers.delta == null) return flag;
  const expected = numbers.difference < -numbers.delta;
  if (flag !== expected) {
    throw new Error("likely_regression must be true only when difference is below -delta");
  }
  return flag;
}

function assertArmModelIds(runKind, poolId, modelIds) {
  if (!modelIds?.baseline || !modelIds?.candidate) {
    throw new Error("verdicts.overall.model_ids baseline and candidate are required");
  }
  if (runKind === "gate") {
    if (modelIds.baseline !== poolId) {
      throw new Error("gate baseline model id must equal baseline_pool_model_id");
    }
    return;
  }
  if (modelIds.baseline !== modelIds.candidate) {
    throw new Error(`${runKind} requires one shared model id across both arms`);
  }
}

function parseHarnessDiagnostics(raw, rollouts) {
  if (!Array.isArray(raw)) throw new Error("verdicts.diagnostics must be an array");
  return raw.map((row, index) => {
    const label = `verdicts.diagnostics[${index}]`;
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      throw new Error(`${label} must be an object`);
    }
    const scenarioId = readModelId(row.scenario_id, `${label}.scenario_id`);
    if (!scenarioId) throw new Error(`${label}.scenario_id is required`);
    const familyId = row.family_id == null ? "" : readModelId(row.family_id, `${label}.family_id`);
    const scheduled = readCountPair(row.scheduled_rollouts, `${label}.scheduled_rollouts`);
    if (scheduled.baseline !== rollouts.baseline || scheduled.candidate !== rollouts.candidate) {
      throw new Error(`${label}.scheduled_rollouts must equal rollouts_per_scenario`);
    }
    const missCounts = readCountPair(row.miss_counts, `${label}.miss_counts`);
    const cassette = row.missing_cassette_keys;
    if (!cassette || typeof cassette !== "object" || Array.isArray(cassette)) {
      throw new Error(`${label}.missing_cassette_keys must be an object`);
    }
    const missingCassetteKeys = {
      baseline: readStringList(cassette.baseline, `${label}.missing_cassette_keys.baseline`),
      candidate: readStringList(cassette.candidate, `${label}.missing_cassette_keys.candidate`),
    };
    for (const name of ARM_NAMES) {
      if (missingCassetteKeys[name].length > missCounts[name]) {
        throw new Error(`${label}.missing_cassette_keys.${name} cannot be longer than miss_counts`);
      }
    }
    const baselineRate = readOptionalUnit(row.baseline_pass_rate, `${label}.baseline_pass_rate`);
    const candidateRate = readOptionalUnit(row.candidate_pass_rate, `${label}.candidate_pass_rate`);
    const difference = readOptionalUnit(row.difference, `${label}.difference`, -1);
    return {
      scenarioId,
      familyId,
      scheduledRollouts: scheduled,
      missCounts,
      missingCassetteKeys,
      baselineText: baselineRate == null ? "Not in this file" : percentFromNumber(baselineRate),
      candidateText: candidateRate == null ? "Not in this file" : percentFromNumber(candidateRate),
      differenceText: difference == null ? "Not in this file" : pointsFromNumber(difference),
      note: row.note == null ? "" : publicText(readCaption(row.note, `${label}.note`)),
    };
  });
}

function readOptionalUnit(value, label, min = 0) {
  if (value == null) return null;
  return readBoundedNumber(value, label, min, 1, true);
}

function percentFromNumber(value) {
  const tenths = Math.round(value * 1000);
  const whole = Math.trunc(tenths / 10);
  const frac = Math.abs(tenths % 10);
  return frac === 0 ? `${whole}%` : `${whole}.${frac}%`;
}

function pointsFromNumber(value) {
  const tenths = Math.round(value * 1000);
  const abs = Math.abs(tenths);
  const whole = Math.trunc(abs / 10);
  const frac = abs % 10;
  const body = frac === 0 ? String(whole) : `${whole}.${frac}`;
  if (tenths > 0) return `+${body} pp`;
  if (tenths < 0) return `-${body} pp`;
  return "0 pp";
}

function harnessInterval(numbers) {
  if (numbers.delta == null && numbers.ciLevel == null) {
    return { fromFile: false, text: INTERVAL_FALLBACK, delta: null, ciLevel: null };
  }
  const deltaText = numbers.delta == null ? "δ = 5 pp" : formatDelta(String(numbers.delta));
  const ciText = numbers.ciLevel == null ? "90%" : formatCi(String(numbers.ciLevel));
  return {
    fromFile: true,
    text: `${deltaText} · ${ciText}`,
    delta: numbers.delta,
    ciLevel: numbers.ciLevel,
  };
}

function readMde(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("mde is required");
  const status = raw.status ?? "preliminary";
  if (status !== "preliminary" && status !== "final" && status !== "coming_soon") {
    throw new Error("mde.status is not recognized");
  }
  const rows = Array.isArray(raw.rows) ? raw.rows : [];
  const points = status === "coming_soon" ? [] : rows.map((row, index) => {
    const budget = row?.rollouts;
    if (typeof budget !== "number" || !Number.isInteger(budget) || budget < 0) {
      throw new Error(`mde.rows[${index}].rollouts must be a non-negative integer`);
    }
    const effect = row.minimum_detectable_effect;
    if (typeof effect !== "number" || effect <= 0 || effect > 1) {
      throw new Error(`mde.rows[${index}].minimum_detectable_effect must be a number in (0, 1]`);
    }
    return { budget, dropText: percentFromNumber(effect) };
  });
  return {
    id: "mde",
    status,
    title: "Smallest drop we can reliably catch",
    caption: publicText(readCaption(raw.caption, "mde.caption")),
    xLabel: "Rollout budget",
    yLabel: "Smallest drop",
    points,
  };
}

function readAa(raw) {
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : { status: "coming_soon" };
  const status = source.status ?? "coming_soon";
  if (status !== "preliminary" && status !== "final" && status !== "coming_soon") {
    throw new Error("aa.status is not recognized");
  }
  return {
    id: "aa",
    status,
    title: "The gate doesn't cry wolf",
    caption: publicText(readCaption(source.caption, "aa.caption")),
    xLabel: "",
    yLabel: "",
    points: [],
  };
}

function headlineFor(verdict) {
  if (verdict === "likely_regression") return "Block";
  if (verdict === "insufficient_evidence") return "Insufficient evidence";
  if (verdict === "invalid_run") return "Invalid run";
  return "Pass";
}

function whyFor(verdict) {
  if (verdict === "likely_regression") {
    return "The check fails on Block. Scenario rows are diagnostics, not separate gates.";
  }
  if (verdict === "insufficient_evidence") {
    return "No suite verdict is published. likely_regression is null and the run is not marked invalid. Scenario rows remain diagnostics.";
  }
  if (verdict === "invalid_run") {
    return "An invalid run isn't scored. Scenario rows remain diagnostics.";
  }
  return "The suite check passes. Scenario rows are diagnostics, not separate gates.";
}

export function bannerFor(status) {
  if (status === "preliminary") {
    return {
      tone: "preliminary",
      title: "Preliminary",
      body: "Not a final gate, and not a customer benchmark.",
    };
  }
  return {
    tone: "final",
    title: "Final",
    body: "This results file is the recorded suite check.",
  };
}
