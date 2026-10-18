/**
 * Plain-language "How it works" story.
 * Verdicts are pass, block, insufficient evidence, or invalid run.
 * Likely regression is only a warning on insufficient evidence.
 * The decision is non-inferiority at δ = 5 percentage points.
 * This module does not score the console and does not read results.json.
 */

import { exceedsRate } from "./rational.js";

export const DELTA_PP = 5;
export const MISS_LIMIT = { numerator: 1, denominator: 20 };
export const STORY_ACTIVATION = 0.42;

export const CLEAR_DROP_CLAUSE =
  "flags a drop larger than 5 points when the evidence is clear, and says when it can't tell yet";

export const VERDICT_COPY = {
  pass: "Pass",
  block: "Block",
  insufficient_evidence: "Insufficient evidence",
  invalid_run: "Invalid run",
};

export const WARNING_COPY = "Likely regression";

const SHORT_VERDICT = {
  pass: "Pass",
  block: "Block",
  insufficient_evidence: "Can't tell",
  invalid_run: "Invalid",
};

export const VERDICT_MARKS = [
  { id: "pass", label: VERDICT_COPY.pass, regression: false, warning: null },
  { id: "block", label: VERDICT_COPY.block, regression: true, warning: null },
  {
    id: "insufficient_evidence",
    label: VERDICT_COPY.insufficient_evidence,
    regression: false,
    warning: WARNING_COPY,
  },
  { id: "invalid_run", label: VERDICT_COPY.invalid_run, regression: false, warning: null },
];

export const STORY_INTRO = {
  kicker: "How it works",
  title: "From the change you made to the answer on the pull request.",
  lede: "Eleven short steps. Each one is a single idea, in plain language. Open Deep dive for the technical name.",
};

const AXIS = { min: -18, max: 4, left: 8, right: 124 };

export const THRESHOLD_EXAMPLES = [
  { id: "small-dip", lower: -3, upper: -0.5, expect: "pass" },
  { id: "cant-tell", lower: -12, upper: -2, expect: "insufficient_evidence" },
  { id: "big-drop", lower: -16, upper: -7, expect: "block" },
];

export function gapAxis(pp) {
  const span = AXIS.max - AXIS.min;
  return Math.round(AXIS.left + ((pp - AXIS.min) / span) * (AXIS.right - AXIS.left));
}

/**
 * Non-inferiority at δ = 5 pp.
 * Pass when the lower bound is above −5. Block when the upper bound is below −5.
 * Otherwise a valid run is insufficient evidence.
 * Likely regression is a warning, and only when that insufficient interval lies entirely below zero.
 * Invalid runs are not scored.
 */
export function classifyGap({ lower, upper, valid = true } = {}) {
  if (valid === false || !Number.isFinite(lower) || !Number.isFinite(upper) || upper < lower) {
    return { verdict: "invalid_run", scored: false, warning: null };
  }
  if (lower > -DELTA_PP) return { verdict: "pass", scored: true, warning: null };
  if (upper < -DELTA_PP) return { verdict: "block", scored: true, warning: null };
  return {
    verdict: "insufficient_evidence",
    scored: true,
    warning: upper < 0 ? "likely_regression" : null,
  };
}

export function missesInvalidate(excluded, scheduled) {
  return exceedsRate(excluded, scheduled, MISS_LIMIT.numerator, MISS_LIMIT.denominator);
}

export function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function activationLine(scrollY, viewportHeight, activation = STORY_ACTIVATION) {
  const scroll = Number.isFinite(scrollY) ? scrollY : 0;
  const view = Number.isFinite(viewportHeight) ? viewportHeight : 0;
  const ratio = Number.isFinite(activation) ? activation : STORY_ACTIVATION;
  return scroll + view * ratio;
}

/**
 * Map a reading line to a step index and a 0–1 rail fill.
 * `offsets` are step tops in the same coordinate as `line`. `end` is the bottom of the last step.
 */
export function storyPosition(line, offsets, end) {
  const count = offsets.length;
  if (count === 0 || !Number.isFinite(line) || !Number.isFinite(end)) return { index: 0, progress: 0 };
  if (line <= offsets[0]) return { index: 0, progress: 0 };
  if (line >= end) return { index: count - 1, progress: 1 };
  for (let i = 0; i < count; i += 1) {
    const start = offsets[i];
    const next = i + 1 < count ? offsets[i + 1] : end;
    if (line < next || i === count - 1) {
      const span = next - start;
      const local = span > 0 ? clamp01((line - start) / span) : 0;
      return { index: i, progress: clamp01((i + local) / count) };
    }
  }
  return { index: count - 1, progress: 1 };
}

export function railIndexFromKey(key, index, count) {
  const total = Math.max(0, count | 0);
  if (total === 0) return null;
  const current = Math.min(total - 1, Math.max(0, index | 0));
  if (key === "ArrowDown" || key === "ArrowRight") return Math.min(total - 1, current + 1);
  if (key === "ArrowUp" || key === "ArrowLeft") return Math.max(0, current - 1);
  if (key === "Home") return 0;
  if (key === "End") return total - 1;
  return null;
}

export function storyMotion(prefersReducedMotion) {
  return {
    reveal: !prefersReducedMotion,
    animateGraphics: !prefersReducedMotion,
    railTracksScroll: true,
  };
}

export function sentenceCount(text) {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) return 0;
  const matches = trimmed.match(/[.!?]+/g);
  return matches ? matches.length : 0;
}

export function visibleCopy(steps = STORY_STEPS, intro = STORY_INTRO) {
  const parts = [intro.kicker, intro.title, intro.lede];
  for (const step of steps) {
    parts.push(step.headline, step.support, step.dive, step.rail, ...(step.terms ?? []));
  }
  return parts.join("\n");
}

export function validateStory(steps = STORY_STEPS) {
  const errors = [];
  if (steps.length !== 11) errors.push(`expected 11 steps, got ${steps.length}`);
  const copy = visibleCopy(steps);
  if (/before customers notice/i.test(copy)) errors.push("banned phrase");
  if (new RegExp(`\\d+${"/"}20\\b`).test(copy)) errors.push("banned phrase");
  if (/\b20\b/.test(copy) || /\btwenty\b/i.test(copy)) errors.push("specific rollout count");
  if (/\b5 candidate\b/i.test(copy) || /\bfive candidate\b/i.test(copy) || /\b5 rollouts\b/i.test(copy)) {
    errors.push("candidate rollout count");
  }
  if (!copy.includes("repeated rollouts per arm")) errors.push("missing repeated rollouts per arm");
  if (!copy.includes(CLEAR_DROP_CLAUSE)) errors.push("missing clear-drop line");
  if (/GPT-4\.1-nano/i.test(copy)) errors.push("forbidden model name");
  if (copy.includes("likely_regression")) errors.push("warning code used as copy");
  if (!copy.includes(WARNING_COPY)) errors.push("missing warning name");
  if (!/only a warning/i.test(copy)) errors.push("warning not labeled as only a warning");
  if (!/Gemini Flash-Lite to a newer Flash/.test(copy)) errors.push("missing model example");
  const ids = new Set();
  const regression = [];
  for (const step of steps) {
    if (ids.has(step.id)) errors.push(`duplicate id ${step.id}`);
    ids.add(step.id);
    if (sentenceCount(step.headline) !== 1) errors.push(`${step.id} headline sentences`);
    if (sentenceCount(step.support) !== 1) errors.push(`${step.id} support sentences`);
    const diveSentences = sentenceCount(step.dive);
    const diveMax = step.id === "verdict" || step.id === "gate" ? 8 : 2;
    if (diveSentences < 1 || diveSentences > diveMax) errors.push(`${step.id} dive sentences ${diveSentences}`);
    if (!step.terms?.length) errors.push(`${step.id} missing term`);
    if (!step.rail) errors.push(`${step.id} missing rail label`);
    if (!step.graphic?.includes("<svg")) errors.push(`${step.id} missing graphic`);
    if (!/[.!?]$/.test(step.headline)) errors.push(`${step.id} headline ending`);
    if (step.signalsRegression) regression.push(step.id);
    else if (step.graphic.includes("how-reg")) errors.push(`${step.id} uses regression color`);
  }
  if (regression.join(",") !== "threshold,verdict") errors.push(`regression graphics ${regression.join(",")}`);
  const verdictIds = VERDICT_MARKS.map((mark) => mark.id);
  if (verdictIds.includes("likely_regression")) errors.push("warning is a verdict");
  if (verdictIds.join(",") !== "pass,block,insufficient_evidence,invalid_run") errors.push("verdict order");
  const warned = VERDICT_MARKS.filter((mark) => mark.warning);
  if (warned.length !== 1 || warned[0].id !== "insufficient_evidence" || warned[0].warning !== WARNING_COPY) {
    errors.push("warning attachment");
  }
  return errors;
}

export function regressionGraphicIds(html) {
  const ids = [];
  const re = /<figure\b[^>]*\bdata-graphic="([^"]+)"[^>]*>[\s\S]*?<\/figure>/g;
  for (const match of html.matchAll(re)) {
    if (match[0].includes("how-reg")) ids.push(match[1]);
  }
  return ids;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function figure(id, inner) {
  return `<figure class="how-fig" data-graphic="${id}" aria-hidden="true"><svg class="how-svg" viewBox="0 0 220 150" focusable="false">${inner}</svg></figure>`;
}

function changeGraphic() {
  return figure("change", `
    <rect class="how-box" x="8" y="52" width="104" height="44" rx="6"/>
    <text class="how-label" x="60" y="79" text-anchor="middle">Flash-Lite</text>
    <path class="draw" pathLength="1" d="M120 74 H146" style="--d:1"/>
    <path class="draw" pathLength="1" d="M138 66 L150 74 L138 82" style="--d:2"/>
    <g class="pop" style="--d:3">
      <rect class="how-box" x="156" y="52" width="56" height="44" rx="6"/>
      <text class="how-label" x="184" y="79" text-anchor="middle">Flash</text>
    </g>`);
}

function stochasticGraphic() {
  const rows = [
    [52, 86],
    [86, 140],
    [120, 196],
  ];
  const lines = rows.map(([y, x], index) => `
    <path class="draw" pathLength="1" d="M18 ${y} H${x}" style="--d:${index}"/>
    <circle class="pop how-dot" cx="${x}" cy="${y}" r="3.5" style="--d:${index + 1}"/>`).join("");
  return figure("stochastic", `<text class="how-faint" x="18" y="30">same prompt</text>${lines}`);
}

function pairedGraphic() {
  return figure("paired", `
    <rect class="how-box" x="10" y="54" width="62" height="42" rx="6"/>
    <text class="how-label" x="41" y="79" text-anchor="middle">Exam</text>
    <path class="draw" pathLength="1" d="M72 75 H96 V40 H118" style="--d:1"/>
    <path class="draw" pathLength="1" d="M96 75 V110 H118" style="--d:2"/>
    <g class="pop" style="--d:3">
      <rect class="how-box" x="118" y="22" width="90" height="36" rx="6"/>
      <text class="how-label" x="163" y="45" text-anchor="middle">Current</text>
    </g>
    <g class="pop" style="--d:4">
      <rect class="how-box" x="118" y="92" width="90" height="36" rx="6"/>
      <text class="how-label" x="163" y="115" text-anchor="middle">New</text>
    </g>`);
}

function rolloutsGraphic() {
  const cells = [];
  for (let i = 0; i < 12; i += 1) {
    const x = 16 + (i % 6) * 32;
    const y = 42 + Math.floor(i / 6) * 40;
    cells.push(`<rect class="pop how-cell" x="${x}" y="${y}" width="20" height="20" rx="2" style="--d:${i}"/>`);
  }
  return figure("rollouts", cells.join(""));
}

function passRateGraphic() {
  return figure("pass-rate", `
    <text class="how-faint" x="16" y="48">passes / finished</text>
    <rect class="how-track" x="16" y="78" width="188" height="8" rx="4"/>
    <rect class="how-bar" x="16" y="78" width="128" height="8" rx="4"/>`);
}

function intervalGraphic() {
  return figure("interval", `
    <text class="how-faint" x="16" y="36">90%</text>
    <path class="draw" pathLength="1" d="M20 90 H200"/>
    <path class="how-axis" d="M120 76 V104"/>
    <text class="how-faint" x="120" y="68" text-anchor="middle">0</text>
    <rect class="how-bar" x="74" y="84" width="92" height="12" rx="6"/>`);
}

function thresholdGraphic() {
  const deltaX = gapAxis(-DELTA_PP);
  const zeroX = gapAxis(0);
  const rows = THRESHOLD_EXAMPLES.map((example, index) => {
    const result = classifyGap(example);
    const y = 32 + index * 34;
    const x1 = gapAxis(example.lower);
    const x2 = gapAxis(example.upper);
    const regression = result.verdict === "block";
    const label = SHORT_VERDICT[result.verdict];
    return `<rect class="${regression ? "how-bar how-reg-fill" : "how-bar"}" x="${x1}" y="${y}" width="${Math.max(6, x2 - x1)}" height="8" rx="4" style="--d:${index}"/>
      <text class="${regression ? "how-side how-reg" : "how-side"}" x="136" y="${y + 8}">${escapeHtml(label)}</text>`;
  }).join("");
  return figure("threshold", `
    <path class="how-axis" d="M${deltaX} 24 V126"/>
    <path class="how-axis" d="M${zeroX} 24 V126"/>
    <text class="how-faint" x="${deltaX}" y="144" text-anchor="middle">−5</text>
    <text class="how-faint" x="${zeroX}" y="144" text-anchor="middle">0</text>
    ${rows}`);
}

function verdictGraphic() {
  const layout = [
    { y: 24 },
    { y: 52 },
    { y: 80, warningY: 100 },
    { y: 128 },
  ];
  const body = VERDICT_MARKS.map((mark, index) => {
    const y = layout[index].y;
    const boxClass = mark.regression ? "how-reg-fill" : mark.id === "invalid_run" ? "how-dash" : "how-box-fill";
    const textClass = mark.regression ? "how-label how-reg" : "how-label";
    const warning = mark.warning
      ? `<text class="how-warn how-reg" x="26" y="${layout[index].warningY}">${escapeHtml(mark.warning)}</text>`
      : "";
    return `<g class="how-row" style="--d:${index}"><rect class="${boxClass}" x="8" y="${y - 12}" width="10" height="10" rx="2"/><text class="${textClass}" x="26" y="${y}">${escapeHtml(mark.label)}</text>${warning}</g>`;
  }).join("");
  return figure("verdict", body);
}

function missGraphic() {
  return figure("misses", `
    <text class="how-faint" x="16" y="40">miss rate</text>
    <rect class="how-track" x="16" y="72" width="188" height="10" rx="5"/>
    <rect class="how-bar how-hatch" x="16" y="72" width="132" height="10" rx="5"/>
    <path class="how-axis" d="M110 58 V94"/>
    <text class="how-faint" x="110" y="50" text-anchor="middle">5%</text>
    <text class="how-label" x="16" y="122">Invalid run</text>`);
}

function limitsGraphic() {
  return figure("limits", `
    <rect class="how-box" x="16" y="24" width="188" height="36" rx="6"/>
    <text class="how-label" x="110" y="47" text-anchor="middle">Preliminary</text>
    <path class="draw" pathLength="1" d="M40 100 H180" style="--d:1"/>
    <path class="draw" pathLength="1" d="M40 88 V112" style="--d:1"/>
    <path class="draw" pathLength="1" d="M180 88 V112" style="--d:2"/>
    <text class="how-faint" x="110" y="134" text-anchor="middle">wide interval</text>`);
}

function gateGraphic() {
  return figure("gate", `
    <rect class="how-box" x="16" y="28" width="188" height="94" rx="6"/>
    <text class="how-faint" x="32" y="56">Pull request</text>
    <path class="draw" pathLength="1" d="M32 74 H188" style="--d:1"/>
    <path class="draw how-check" pathLength="1" d="M32 112 L44 124 L68 96" style="--d:2"/>
    <text class="how-label" x="80" y="118">suite check</text>`);
}

export const STORY_STEPS = [
  {
    id: "change",
    rail: "The change",
    headline: "You changed your AI.",
    support: "A new prompt, a newer model, or a different tool can change the answers.",
    terms: ["Candidate change"],
    dive: "The check compares the agent you already run with the agent in this change. The change might be a prompt, a swap from Gemini Flash-Lite to a newer Flash, or the tools it can call.",
    graphic: changeGraphic(),
    signalsRegression: false,
  },
  {
    id: "stochastic",
    rail: "One try",
    headline: "One try proves nothing.",
    support: "Ask the same thing twice and the answer can change.",
    terms: ["Stochastic outputs"],
    dive: "The model samples from many plausible answers, so a single run is not a measurement. The check repeats the work before it trusts a score.",
    graphic: stochasticGraphic(),
    signalsRegression: false,
  },
  {
    id: "paired",
    rail: "Same exam",
    headline: "Give both versions the same exam.",
    support: "The current agent and the new one face the same tasks.",
    terms: ["Paired scenario suite"],
    dive: "Each task runs on both arms, and each task counts once. Pairing keeps the comparison about your change, not about an easier or harder set.",
    graphic: pairedGraphic(),
    signalsRegression: false,
  },
  {
    id: "rollouts",
    rail: "Many runs",
    headline: "Run each arm many times.",
    support: "Repeating the exam turns one lucky answer into a pattern.",
    terms: ["Repeated rollouts"],
    dive: "Each attempt is a rollout, and both sides use repeated rollouts per arm. One finished attempt is still a single sample.",
    graphic: rolloutsGraphic(),
    signalsRegression: false,
  },
  {
    id: "pass-rate",
    rail: "Pass rate",
    headline: "Count how often each arm passes.",
    support: "A finished success is a pass, and a finished failure is not.",
    terms: ["Pass rate"],
    dive: "A pass scores 1 and a fail scores 0. The pass rate is the passes divided by the attempts that finished on that arm.",
    graphic: passRateGraphic(),
    signalsRegression: false,
  },
  {
    id: "interval",
    rail: "Real or luck",
    headline: "Is the gap real, or is it luck?",
    support: "A lower score can be noise, so the check looks at a range, not one number.",
    terms: ["90% confidence interval"],
    dive: "The check places a 90% confidence interval around the gap in pass rate. The decision uses that whole range, not the midpoint alone.",
    graphic: intervalGraphic(),
    signalsRegression: false,
  },
  {
    id: "threshold",
    rail: "How big",
    headline: "A small dip is fine, and a big drop is not.",
    support: `It ${CLEAR_DROP_CLAUSE}.`,
    terms: ["Non-inferiority", "δ = 5 pp"],
    dive: "Pass if the 90% interval's lower bound is above −5 pp, and block if its upper bound is below −5 pp. Any valid run that clears neither bar is insufficient evidence.",
    graphic: thresholdGraphic(),
    signalsRegression: true,
  },
  {
    id: "verdict",
    rail: "The answer",
    headline: "You get one of four answers.",
    support: 'Pass, Block, Insufficient evidence, or Invalid run, with "Likely regression" only as a warning on insufficient evidence.',
    terms: ["CI verdict"],
    dive: "Gate spec. The rules are fixed. Computing them on real runs lands with Milestone B (target November 10). Today harness run runs rollouts and writes run_summary.json, not a verdict. Pass, block, and insufficient evidence are scored from that interval, and an invalid run is not scored. Likely regression is only a warning attached to insufficient evidence.",
    graphic: verdictGraphic(),
    signalsRegression: true,
  },
  {
    id: "misses",
    rail: "Unfinished",
    headline: "If too many runs never finish, we say so.",
    support: "The check tests itself, and it does not guess from a broken run.",
    terms: ["Miss rate above 5% → invalid_run"],
    dive: "A miss rate above 5% on either arm returns an invalid run. Exactly 5% still scores.",
    graphic: missGraphic(),
    signalsRegression: false,
  },
  {
    id: "limits",
    rail: "Limits",
    headline: "The result shows its own limits.",
    support: "An early file stays marked preliminary, and a small sample can only see a large drop.",
    terms: ["Preliminary banner", "Sample size"],
    dive: "The preliminary banner means the file is an early result, not a final benchmark. Fewer repeated rollouts per arm leave a wider interval, so only a larger drop gets through.",
    graphic: limitsGraphic(),
    signalsRegression: false,
  },
  {
    id: "gate",
    rail: "Every PR",
    headline: "It runs on every pull request.",
    support: "The same check starts on the change and posts one answer before the change merges.",
    terms: ["CI gate"],
    dive: "Gate spec. The rules are fixed. Computing them on real runs lands with Milestone B (target November 10). Today harness run runs rollouts and writes run_summary.json, not a verdict. The check would fail on Block once the packaged Action ships.",
    graphic: gateGraphic(),
    signalsRegression: false,
  },
];

export const STORY_TEXT_PAIRS = [
  ["#f4f4f5", "#070708"],
  ["#f4f4f5", "#101012"],
  ["#f4f4f5", "#141416"],
  ["#d4d4dc", "#070708"],
  ["#d4d4dc", "#101012"],
  ["#d4d4dc", "#141416"],
  ["#a1a1aa", "#070708"],
  ["#a1a1aa", "#101012"],
  ["#a1a1aa", "#141416"],
  ["#9a9aa3", "#070708"],
  ["#9a9aa3", "#101012"],
  ["#ff7a1a", "#070708"],
  ["#ff7a1a", "#101012"],
  ["#ff7a1a", "#141416"],
];

function stepMarkup(step, index) {
  const number = String(index + 1).padStart(2, "0");
  const terms = step.terms.map((term) => `<span class="how-term">${escapeHtml(term)}</span>`).join("");
  return `<li class="how-step reveal" id="how-${step.id}" data-step="${step.id}">
    <div class="how-step-copy">
      <p class="how-index">${number}</p>
      <h3>${escapeHtml(step.headline)}</h3>
      <p class="how-support">${escapeHtml(step.support)}</p>
    </div>
    ${step.graphic}
    <details class="how-dive">
      <summary aria-label="Deep dive: ${escapeHtml(step.headline)}">Deep dive</summary>
      <p class="how-terms">${terms}</p>
      <p class="how-dive-body">${escapeHtml(step.dive)}</p>
    </details>
  </li>`;
}

export function renderStoryHtml(steps = STORY_STEPS) {
  const total = String(steps.length).padStart(2, "0");
  const links = steps.map((step, index) => {
    const number = String(index + 1).padStart(2, "0");
    return `<li><a href="#how-${step.id}" data-how-index="${index}"><span class="how-rail-no">${number}</span><span class="how-rail-label">${escapeHtml(step.rail)}</span></a></li>`;
  }).join("");
  const items = steps.map((step, index) => stepMarkup(step, index)).join("");
  return `<div class="how-layout">
    <div class="how-rail-col">
      <nav class="how-rail" aria-label="How it works steps">
        <a class="how-skip" href="#how-steps">Skip to the story</a>
        <p class="how-rail-count" aria-hidden="true"><span id="how-rail-now">01</span> / <span>${total}</span></p>
        <div class="how-rail-body">
          <div class="how-rail-track" aria-hidden="true"><span id="how-rail-fill"></span></div>
          <ol class="how-rail-list">${links}</ol>
        </div>
      </nav>
    </div>
    <ol class="how-steps" id="how-steps" tabindex="-1">${items}</ol>
  </div>`;
}

export function bindStory(doc = document) {
  const layout = doc.querySelector(".how-layout");
  if (!layout) return () => {};
  const stepsEl = layout.querySelector(".how-steps");
  const steps = [...layout.querySelectorAll(".how-step")];
  const links = [...layout.querySelectorAll("[data-how-index]")];
  const fill = layout.querySelector("#how-rail-fill");
  const now = layout.querySelector("#how-rail-now");
  const list = layout.querySelector(".how-rail-list");
  let lastIndex = -1;

  const update = () => {
    const line = activationLine(window.scrollY, window.innerHeight);
    const offsets = steps.map((step) => step.getBoundingClientRect().top + window.scrollY);
    const end = stepsEl.getBoundingClientRect().bottom + window.scrollY;
    const position = storyPosition(line, offsets, end);
    if (fill) fill.style.setProperty("--how-progress", position.progress.toFixed(4));
    const index = position.index;
    if (now) now.textContent = String(index + 1).padStart(2, "0");
    steps.forEach((step, i) => step.classList.toggle("is-active", i === index));
    links.forEach((link, i) => {
      if (i === index) link.setAttribute("aria-current", "step");
      else link.removeAttribute("aria-current");
    });
    if (index !== lastIndex && list && links[index] && list.scrollWidth > list.clientWidth + 4) {
      const link = links[index];
      list.scrollLeft = Math.max(0, link.offsetLeft - (list.clientWidth - link.offsetWidth) / 2);
    }
    lastIndex = index;
  };

  update();
  window.addEventListener("scroll", update, { passive: true });
  window.addEventListener("resize", update);
  layout.querySelector(".how-rail")?.addEventListener("keydown", (event) => {
    const current = links.indexOf(doc.activeElement);
    if (current < 0) return;
    const next = railIndexFromKey(event.key, current, links.length);
    if (next == null) return;
    event.preventDefault();
    links[next].focus();
  });
  return update;
}

/** Landing sequence: one graphic at a time. The full story stays on its own route. */
export function renderFilmHtml(steps = STORY_STEPS) {
  const frames = steps.map((step, index) => {
    const hidden = index === 0 ? "" : " hidden";
    return `<li class="film-frame"${hidden} data-film="${escapeHtml(step.id)}">
      ${step.graphic}
      <p class="film-rail">${escapeHtml(step.rail)}</p>
    </li>`;
  }).join("");
  const dots = steps.map((step, index) => {
    const current = index === 0 ? ' aria-current="true"' : "";
    return `<button type="button" class="film-dot" data-film-index="${index}" aria-label="${escapeHtml(step.rail)}"${current}></button>`;
  }).join("");
  return `<div class="film">
    <p class="film-line" aria-live="polite">${escapeHtml(steps[0]?.headline ?? "")}</p>
    <div class="film-stage">
      <ol class="film-frames">${frames}</ol>
    </div>
    <div class="film-controls">
      <button type="button" class="film-nav" data-film-dir="-1">Previous</button>
      <div class="film-dots" role="group" aria-label="How it works sequence">${dots}</div>
      <button type="button" class="film-nav" data-film-dir="1">Next</button>
      <button type="button" class="film-pause" aria-pressed="false">Pause</button>
    </div>
  </div>`;
}

export function bindFilm(root, win = typeof window === "undefined" ? null : window) {
  if (!root || !win) return () => {};
  const film = root.querySelector(".film") || root;
  const frames = [...film.querySelectorAll(".film-frame")];
  const dots = [...film.querySelectorAll(".film-dot")];
  const line = film.querySelector(".film-line");
  const pauseBtn = film.querySelector(".film-pause");
  const steps = STORY_STEPS;
  if (frames.length === 0) return () => {};
  let index = 0;
  let timer = 0;
  let paused = false;
  const reduce = win.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const show = (next) => {
    const count = frames.length;
    index = ((next % count) + count) % count;
    if (!reduce) {
      frames.forEach((frame, i) => {
        frame.hidden = i !== index;
      });
    }
    dots.forEach((dot, i) => {
      if (i === index) dot.setAttribute("aria-current", "true");
      else dot.removeAttribute("aria-current");
    });
    if (line && !reduce) line.textContent = steps[index]?.headline ?? "";
  };

  const stop = () => win.clearInterval(timer);
  const start = () => {
    stop();
    if (paused || reduce) return;
    timer = win.setInterval(() => show(index + 1), 2200);
  };

  if (reduce) {
    film.classList.add("is-static");
    frames.forEach((frame) => {
      frame.hidden = false;
    });
    if (line) {
      line.textContent = "";
      line.setAttribute("aria-hidden", "true");
    }
    if (pauseBtn) pauseBtn.hidden = true;
  } else {
    show(0);
    start();
    film.addEventListener("mouseenter", stop);
    film.addEventListener("mouseleave", start);
    film.addEventListener("focusin", stop);
    film.addEventListener("focusout", (event) => {
      if (!film.contains(event.relatedTarget)) start();
    });
  }

  film.querySelectorAll("[data-film-dir]").forEach((button) => {
    button.addEventListener("click", () => show(index + Number(button.dataset.filmDir)));
  });
  dots.forEach((dot) => {
    dot.addEventListener("click", () => show(Number(dot.dataset.filmIndex)));
  });
  film.querySelector(".film-dots")?.addEventListener("keydown", (event) => {
    const current = dots.indexOf(win.document.activeElement);
    if (current < 0) return;
    const next = railIndexFromKey(event.key, current, dots.length);
    if (next == null) return;
    event.preventDefault();
    show(next);
    dots[next].focus();
  });
  pauseBtn?.addEventListener("click", () => {
    paused = !paused;
    pauseBtn.setAttribute("aria-pressed", String(paused));
    pauseBtn.textContent = paused ? "Play" : "Pause";
    if (paused) stop();
    else start();
  });
  return stop;
}
