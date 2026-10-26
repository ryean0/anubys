/**
 * Simulator decision rules. This module scores sample rollouts in the browser.
 * It does not read results.json and it does not override the suite verdict.
 */

import { BRAND } from "./brand.js";
import { coverageFloor, exceedsRate } from "./rational.js";

export const MISS_LIMIT = { numerator: 1, denominator: 20 };
export const COVERAGE_RATIO = { numerator: 3, denominator: 5 };
export const CONFIDENCE = 0.9;

export const METHOD_NOTES = {
  miss: "More than 5% of scheduled rollouts excluded in either arm invalidates the run. Exactly 5% is still scored. The 5% line is compared in integers.",
  coverage: "Each scenario needs at least ceil(0.6 × scheduled) valid rollouts on both arms. 0.6 is 3/5, and the ceiling uses integer arithmetic.",
  pairing: "The gap is the unweighted average of (candidate pass rate − baseline pass rate) across scenarios. Each scenario counts once. Scenarios are combined in id order, so the recorded order cannot change the verdict.",
  interval: "Uncertainty on each pass rate is a Jeffreys binomial variance, so an all-pass or all-fail arm still carries a little noise. The 90% interval is a normal approximation around the average gap.",
  regression: "Non-inferiority, δ = 5 pp. Pass if the 90% interval's lower bound is above −5 pp. Block if its upper bound is below −5 pp. Otherwise the result is insufficient evidence, which can carry a Likely regression warning. An invalid run isn't scored.",
  timeouts: "An agent timeout (a loop, or the step budget ran out) scores 0 and counts as a valid rollout. An infrastructure timeout (provider 5xx, a rate limit, or a killed CI runner) is excluded from the score and counts toward the 5% miss limit. A missing result is treated the same way.",
};

function assertInteger(name, value) {
  if (!Number.isInteger(value)) throw new Error(`${name} must be an integer`);
}

function assertRatio(ratio) {
  assertInteger("numerator", ratio.numerator);
  assertInteger("denominator", ratio.denominator);
  if (ratio.numerator < 0 || ratio.denominator <= 0) {
    throw new Error("ratio must be a non-negative integer over a positive integer");
  }
}

export function armMissExceeds(excluded, scheduled) {
  return exceedsRate(excluded, scheduled, MISS_LIMIT.numerator, MISS_LIMIT.denominator);
}

export function requiredValid(scheduled, ratio = COVERAGE_RATIO) {
  assertRatio(ratio);
  return coverageFloor(scheduled, ratio.numerator, ratio.denominator);
}

export function interpretSlot(kind) {
  switch (kind) {
    case "pass":
      return { kind, score: 1, valid: true };
    case "fail":
    case "agent_timeout":
      return { kind, score: 0, valid: true };
    case "infra_timeout":
    case "missing":
      return { kind, score: null, valid: false };
    default:
      throw new Error(`unknown rollout outcome: ${String(kind)}`);
  }
}

export function realizeSlots(arm) {
  assertInteger("scheduled", arm.scheduled);
  if (arm.scheduled < 0) throw new Error("scheduled rollouts cannot be negative");
  if (arm.slots.length > arm.scheduled) {
    return { slots: arm.slots.slice(), overflow: arm.slots.length - arm.scheduled };
  }
  const slots = arm.slots.slice();
  while (slots.length < arm.scheduled) slots.push("missing");
  return { slots, overflow: 0 };
}

export function summarizeArm(arm) {
  const { slots, overflow } = realizeSlots(arm);
  let passes = 0;
  let fails = 0;
  let agentTimeouts = 0;
  let infraTimeouts = 0;
  let missing = 0;
  for (const slot of slots) {
    if (slot === "pass") passes += 1;
    else if (slot === "fail") fails += 1;
    else if (slot === "agent_timeout") {
      fails += 1;
      agentTimeouts += 1;
    } else if (slot === "infra_timeout") infraTimeouts += 1;
    else if (slot === "missing") missing += 1;
    else interpretSlot(slot);
  }
  const valid = passes + fails;
  return {
    scheduled: arm.scheduled,
    valid,
    passes,
    fails,
    agentTimeouts,
    infraTimeouts,
    missing,
    excluded: infraTimeouts + missing,
    overflow,
    passRate: valid > 0 ? passes / valid : null,
  };
}

export function jeffreysVariance(successes, total) {
  if (total <= 0) return 0;
  const alpha = successes + 0.5;
  const beta = total - successes + 0.5;
  const sum = alpha + beta;
  return (alpha * beta) / (sum * sum * (sum + 1));
}

export function inverseNorm(p) {
  if (!(p > 0 && p < 1)) throw new Error("probability must be between 0 and 1");
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const plow = 0.02425;
  const phigh = 1 - plow;
  if (p < plow) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > phigh) {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  const q = p - 0.5;
  const r = q * q;
  return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

export function formatSignedNumber(delta) {
  const tenths = Math.round(delta * 1000);
  const sign = tenths > 0 ? "+" : tenths < 0 ? "−" : "";
  const absolute = Math.abs(tenths);
  const whole = Math.trunc(absolute / 10);
  const frac = absolute % 10;
  return `${sign}${whole}.${frac}`;
}

export function formatPoints(delta) {
  return `${formatSignedNumber(delta)} percentage points`;
}

export function formatPercent(count, total) {
  if (total <= 0) return "0%";
  const tenths = Math.round((count * 1000) / total);
  const whole = Math.trunc(tenths / 10);
  const frac = Math.abs(tenths % 10);
  return frac === 0 ? `${whole}%` : `${whole}.${frac}%`;
}

function emptyArm() {
  return {
    scheduled: 0, valid: 0, passes: 0, fails: 0, agentTimeouts: 0,
    infraTimeouts: 0, missing: 0, excluded: 0, overflow: 0, passRate: null,
  };
}

function addArm(total, arm) {
  for (const key of ["scheduled", "valid", "passes", "fails", "agentTimeouts", "infraTimeouts", "missing", "excluded", "overflow"]) {
    total[key] += arm[key];
  }
}

export function scoreRun(scenarios, options = {}) {
  const miss = options.maxMiss ?? MISS_LIMIT;
  const coverage = options.coverage ?? COVERAGE_RATIO;
  const confidence = options.confidence ?? CONFIDENCE;
  assertRatio(miss);
  assertRatio(coverage);
  if (!(confidence > 0 && confidence < 1)) throw new Error("confidence must be between 0 and 1");

  const baseline = emptyArm();
  const candidate = emptyArm();
  const rows = [];
  const invalidReasons = [];

  if (scenarios.length === 0) {
    invalidReasons.push("The suite has no scenarios, so there is nothing to compare.");
  }

  for (const scenario of scenarios) {
    const baselineArm = summarizeArm(scenario.baseline);
    const candidateArm = summarizeArm(scenario.candidate);
    addArm(baseline, baselineArm);
    addArm(candidate, candidateArm);
    const mismatch = Boolean(scenario.expectedHash) && scenario.recordedHash !== scenario.expectedHash;
    const baselineNeed = requiredValid(scenario.baseline.scheduled, coverage);
    const candidateNeed = requiredValid(scenario.candidate.scheduled, coverage);
    const delta = baselineArm.passRate !== null && candidateArm.passRate !== null
      ? candidateArm.passRate - baselineArm.passRate
      : null;
    rows.push({
      id: scenario.id,
      name: scenario.name,
      hashMismatch: mismatch,
      baseline: baselineArm,
      candidate: candidateArm,
      delta,
      baselineNeed,
      candidateNeed,
    });

    if (scenario.baseline.scheduled <= 0 || scenario.candidate.scheduled <= 0) {
      invalidReasons.push(`“${scenario.name}” has a scheduled run count of zero, so it cannot be compared.`);
    }
    if (baselineArm.overflow > 0 || candidateArm.overflow > 0) {
      invalidReasons.push(`“${scenario.name}” recorded more rollouts than were scheduled. The results are not usable.`);
    }
    if (mismatch) {
      invalidReasons.push(`“${scenario.name}” does not match its scenario hash. The test was edited or is out of date, so this run is invalid.`);
    }
    if (baselineArm.valid < baselineNeed) {
      invalidReasons.push(`“${scenario.name}” has ${baselineArm.valid} usable baseline runs. It needs at least ${baselineNeed}, which is 60% of the ${scenario.baseline.scheduled} scheduled, rounded up.`);
    }
    if (candidateArm.valid < candidateNeed) {
      invalidReasons.push(`“${scenario.name}” has ${candidateArm.valid} usable candidate runs. It needs at least ${candidateNeed}, which is 60% of the ${scenario.candidate.scheduled} scheduled, rounded up.`);
    }
  }

  baseline.passRate = baseline.valid > 0 ? baseline.passes / baseline.valid : null;
  candidate.passRate = candidate.valid > 0 ? candidate.passes / candidate.valid : null;

  if (scenarios.length > 0 && exceedsRate(baseline.excluded, baseline.scheduled, miss.numerator, miss.denominator)) {
    invalidReasons.push(missSentence("baseline", baseline));
  }
  if (scenarios.length > 0 && exceedsRate(candidate.excluded, candidate.scheduled, miss.numerator, miss.denominator)) {
    invalidReasons.push(missSentence("candidate", candidate));
  }

  if (coverage.numerator !== 3 || coverage.denominator !== 5) {
    for (let i = invalidReasons.length - 1; i >= 0; i -= 1) {
      if (invalidReasons[i].includes("which is 60%")) invalidReasons.splice(i, 1);
    }
    for (const row of rows) {
      if (row.baseline.valid < row.baselineNeed) {
        invalidReasons.push(`“${row.name}” has ${row.baseline.valid} usable baseline runs. It needs at least ${row.baselineNeed}.`);
      }
      if (row.candidate.valid < row.candidateNeed) {
        invalidReasons.push(`“${row.name}” has ${row.candidate.valid} usable candidate runs. It needs at least ${row.candidateNeed}.`);
      }
    }
  }

  if (invalidReasons.length > 0) {
    return {
      verdict: "invalid_run",
      headline: "Invalid run",
      why: `${invalidReasons.join(" ")} An invalid run isn't scored.`,
      invalidReasons,
      confidence,
      meanDelta: null,
      lower: null,
      upper: null,
      standardError: null,
      baseline,
      candidate,
      scenarios: rows,
    };
  }

  const ordered = [...rows].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const meanDelta = ordered.reduce((sum, row) => sum + (row.delta ?? 0), 0) / ordered.length;
  let varianceSum = 0;
  for (const row of ordered) {
    varianceSum += jeffreysVariance(row.baseline.passes, row.baseline.valid) + jeffreysVariance(row.candidate.passes, row.candidate.valid);
  }
  const standardError = Math.sqrt(varianceSum / (ordered.length * ordered.length));
  const z = inverseNorm(0.5 + confidence / 2);
  const lower = meanDelta - z * standardError;
  const upper = meanDelta + z * standardError;
  const nonInferiority = 0.05;
  const block = upper < -nonInferiority;
  const pass = lower > -nonInferiority;
  const gap = formatPoints(meanDelta);
  const band = `${formatPoints(lower)} to ${formatPoints(upper)}`;
  const percent = formatPercent(Math.round(confidence * 100), 100);
  const why = block
    ? `Suite gap ${gap} across ${rows.length} scenarios, candidate minus baseline. The ${percent} interval is ${band}. Its upper bound is below −5 pp, so the suite check blocks.`
    : pass
      ? `Suite gap ${gap} across ${rows.length} scenarios. The ${percent} interval is ${band}. Its lower bound is above −5 pp, so the suite check passes.`
      : `Suite gap ${gap} across ${rows.length} scenarios. The ${percent} interval is ${band}. That is insufficient evidence. It can carry a Likely regression warning.`;

  return {
    verdict: block ? "likely_regression" : pass ? "no_regression" : "insufficient",
    headline: block ? "Block" : pass ? "Pass" : "Insufficient evidence",
    why,
    invalidReasons: [],
    confidence,
    meanDelta,
    lower,
    upper,
    standardError,
    baseline,
    candidate,
    scenarios: rows,
  };
}

function missSentence(arm, summary) {
  return `On the ${arm} side, ${summary.excluded} of ${summary.scheduled} scheduled runs (${formatPercent(summary.excluded, summary.scheduled)}) were missing or broken by infrastructure. ${BRAND} allows up to 5%, and exactly 5% is still scored. This arm is over that line.`;
}
