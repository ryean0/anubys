/**
 * Method flowchart: step copy, pop-up state, connector geometry, and contrast.
 * This module does not touch the DOM.
 */

export const WIDE_LAYOUT_MIN = 1100;

/** Non-inferiority rule, δ = 5 pp. One sentence, used as the suite technical line. */
export const DECISION_RULE = "Pass if the 90% interval's lower bound is above −5 pp, block if its upper bound is below −5 pp, otherwise insufficient evidence; an invalid run isn't scored.";

export const METHOD_STEPS = [
  {
    id: "scenarios",
    index: "01",
    node: "n1",
    title: "Scenarios",
    subtitle: "Content hash",
    plain: "Both versions face the same tasks. The tasks are locked in before the run starts, so neither side gets an easier set.",
    technical: "Each scenario is sealed with a SHA-256 content hash.",
  },
  {
    id: "runner",
    index: "02",
    node: "n2",
    title: "CI runner",
    subtitle: "One job",
    plain: "After the build, one job in your existing CI runs the suite on both versions before the change merges.",
    technical: "One job runs both arms and can fail the check.",
  },
  {
    id: "baseline",
    index: "03",
    node: "n3",
    title: "Baseline",
    subtitle: "Repeated rollouts",
    pop: "down",
    plain: "The agent customers already have is tried many times, so today's behavior is a stable picture instead of one lucky answer.",
    technical: "Repeated rollouts per arm. Agent timeouts score 0. Infrastructure is excluded.",
  },
  {
    id: "candidate",
    index: "04",
    node: "n3",
    title: "Candidate",
    subtitle: "Repeated rollouts",
    plain: "The new version is tried on those same tasks, so you can see whether it still completes them.",
    technical: "Repeated rollouts per arm. Each scenario still counts once.",
  },
  {
    id: "scorer",
    index: "05",
    node: "n4",
    title: "Scorer",
    subtitle: "90% interval",
    plain: "For each task, the harness compares how often the two versions pass, then checks whether the gap is real.",
    technical: "Pass rates are paired by scenario. The gap gets a 90% interval.",
  },
  {
    id: "suite",
    index: "06",
    node: "n5",
    title: "Suite check",
    subtitle: "One status",
    plain: "You get one suite answer: Pass, Block, Insufficient evidence, or Invalid run. Insufficient evidence can carry a Likely regression warning. Likely regression is a spec flag, not computed in v0.1 (deferred to v0.2).",
    technical: DECISION_RULE,
  },
];

export const USE_CASES = [
  {
    id: "founders",
    title: "For founders and teams new to AI",
    paragraphs: [
      "An AI agent can change its behavior between versions even when the screens around it look the same. Moving from Gemini Flash-Lite to a newer Flash, a prompt edit, or a new tool can make yesterday's request fail today.",
      "This check runs the version you are about to ship against the one customers already have, on the same tasks, and flags a drop larger than 5 points when the evidence is clear, and says when it can't tell yet. The check is provider-agnostic: Gemini comes first, and OpenAI and Anthropic are on the roadmap.",
    ],
  },
  {
    id: "engineers",
    title: "For ML and platform engineers",
    points: [
      "CI gate on the candidate versus the agent already in production.",
      "Repeated rollouts, so one noisy try becomes a pass rate.",
      `Non-inferiority, δ = 5 pp. ${DECISION_RULE}`,
      "Invalid-run detection when too many rollouts are missing or broken by infrastructure.",
    ],
  },
];

/** Text and surface colors used in the method section. */
export const METHOD_TEXT_PAIRS = [
  ["#f4f4f5", "#070708"],
  ["#f4f4f5", "#16161c"],
  ["#f4f4f5", "#141416"],
  ["#d4d4dc", "#16161c"],
  ["#d4d4dc", "#141416"],
  ["#d4d4dc", "#101012"],
  ["#ff7a1a", "#141416"],
  ["#ff7a1a", "#16161c"],
  ["#ff7a1a", "#070708"],
  ["#ff7a1a", "#101012"],
  ["#a1a1aa", "#101012"],
  ["#a1a1aa", "#070708"],
];

export function createFlowState() {
  return {
    openId: null,
    pinnedId: null,
    hoverId: null,
    focusId: null,
    dismissedId: null,
    heldFocusId: null,
  };
}

function computeOpen(state) {
  if (state.hoverId && state.hoverId !== state.dismissedId) return state.hoverId;
  if (state.focusId && state.focusId !== state.dismissedId && state.focusId !== state.heldFocusId) return state.focusId;
  if (state.pinnedId && state.pinnedId !== state.dismissedId) return state.pinnedId;
  return null;
}

/**
 * Hover, keyboard focus, and touch/pen tap all open a card. Escape dismisses
 * the open card until the pointer and focus leave it. A mouse click does not
 * pin the card; hover and focus already show it.
 */
export function reduceFlow(state, event) {
  const next = {
    openId: state.openId,
    pinnedId: state.pinnedId,
    hoverId: state.hoverId,
    focusId: state.focusId,
    dismissedId: state.dismissedId,
    heldFocusId: state.heldFocusId,
  };
  const id = event.id;
  switch (event.type) {
    case "pointerenter":
      if (event.pointerType === "touch") break;
      next.hoverId = id;
      break;
    case "pointerleave":
      if (next.hoverId === id) next.hoverId = null;
      if (next.dismissedId === id && next.focusId !== id) next.dismissedId = null;
      break;
    case "focus":
      next.focusId = id;
      break;
    case "blur":
      if (next.focusId === id) next.focusId = null;
      if (next.heldFocusId === id) next.heldFocusId = null;
      if (next.dismissedId === id && next.hoverId !== id) next.dismissedId = null;
      break;
    case "activate": {
      if (event.keyboard) break;
      const pin = event.pointerType === "touch" || event.pointerType === "pen" || event.coarse === true;
      if (!pin) break;
      if (next.pinnedId === id && next.dismissedId !== id) {
        next.pinnedId = null;
        next.dismissedId = id;
        next.hoverId = null;
      } else {
        next.pinnedId = id;
        next.dismissedId = null;
      }
      break;
    }
    case "escape":
      if (next.openId) {
        next.dismissedId = next.openId;
        if (next.pinnedId === next.openId) next.pinnedId = null;
        if (next.hoverId === next.openId) next.hoverId = null;
        if (next.focusId) next.heldFocusId = next.focusId;
      }
      break;
    case "outside":
      next.pinnedId = null;
      next.hoverId = null;
      break;
    default:
      break;
  }
  next.openId = computeOpen(next);
  return next;
}

export function layoutMode(viewportWidth) {
  return viewportWidth >= WIDE_LAYOUT_MIN ? "wide" : "narrow";
}

export function presentationForMotion(prefersReduced) {
  if (prefersReduced) {
    return { animate: false, settled: true, drawn: 1, step: 4, cardMotion: "none" };
  }
  return { animate: true, settled: false, drawn: 0, step: 0, cardMotion: "rise" };
}

/** Scroll progress for the method connectors. Matches the page's draw curve. */
export function flowScrollState(rectTop, viewHeight) {
  const view = Number(viewHeight);
  if (!Number.isFinite(view) || view <= 0 || !Number.isFinite(rectTop)) {
    return { drawn: 0, step: 0 };
  }
  const drawn = Math.min(1, Math.max(0, (view * 0.9 - rectTop) / (view * 0.38)));
  const step = Math.min(4, Math.floor(drawn * 5));
  return { drawn, step };
}

export function edgePoint(box, side) {
  if (side === "left") return { x: box.x, y: box.y + box.h / 2 };
  if (side === "right") return { x: box.x + box.w, y: box.y + box.h / 2 };
  if (side === "top") return { x: box.x + box.w / 2, y: box.y };
  if (side === "bottom") return { x: box.x + box.w / 2, y: box.y + box.h };
  throw new Error(`unknown side ${side}`);
}

function round(value) {
  return Math.round(value * 10) / 10;
}

export function curvePath(from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    const mid = from.x + dx / 2;
    return `M${round(from.x)} ${round(from.y)} C${round(mid)} ${round(from.y)} ${round(mid)} ${round(to.y)} ${round(to.x)} ${round(to.y)}`;
  }
  const mid = from.y + dy / 2;
  return `M${round(from.x)} ${round(from.y)} C${round(from.x)} ${round(mid)} ${round(to.x)} ${round(mid)} ${round(to.x)} ${round(to.y)}`;
}

const STEP_IDS = ["scenarios", "runner", "baseline", "candidate", "scorer", "suite"];

export function methodConnectorPaths(boxes, layout) {
  for (const id of STEP_IDS) {
    if (!boxes[id]) throw new Error(`missing box ${id}`);
  }
  const side = (id, edge) => edgePoint(boxes[id], edge);
  if (layout === "narrow") {
    return [
      curvePath(side("scenarios", "bottom"), side("runner", "top")),
      curvePath(side("runner", "bottom"), side("baseline", "top")),
      curvePath(side("runner", "bottom"), side("candidate", "top")),
      curvePath(side("baseline", "bottom"), side("scorer", "top")),
      curvePath(side("candidate", "bottom"), side("scorer", "top")),
      curvePath(side("scorer", "bottom"), side("suite", "top")),
    ];
  }
  return [
    curvePath(side("scenarios", "right"), side("runner", "left")),
    curvePath(side("runner", "right"), side("baseline", "left")),
    curvePath(side("runner", "right"), side("candidate", "left")),
    curvePath(side("baseline", "right"), side("scorer", "left")),
    curvePath(side("candidate", "right"), side("scorer", "left")),
    curvePath(side("scorer", "right"), side("suite", "left")),
  ];
}

/**
 * Place a card near its step and keep it inside the viewport.
 * `topInset` leaves room for the sticky navigation bar.
 */
function overlaps(a, b, pad = 6) {
  return a.left < b.right - pad && a.right > b.left + pad && a.top < b.bottom - pad && a.bottom > b.top + pad;
}

function placementCandidate(anchor, card, viewport, placement, margin, topInset) {
  const top = placement === "below" ? anchor.bottom + margin : anchor.top - card.height - margin;
  const maxLeft = Math.max(margin, viewport.width - margin - card.width);
  const left = Math.min(Math.max(margin, anchor.left + anchor.width / 2 - card.width / 2), maxLeft);
  const fits = top >= topInset && top + card.height <= viewport.height - margin;
  return {
    top,
    left,
    placement,
    fits,
    caret: anchor.left + anchor.width / 2 - left,
  };
}

/**
 * Place a card near its step and keep it inside the viewport.
 * `topInset` leaves room for the sticky navigation bar.
 * `obstacles` are other step boxes the card should not cover when another side fits.
 */
export function placeFlowCard(anchor, card, viewport, preference = "above", options = {}) {
  const margin = options.margin ?? 12;
  const topInset = options.topInset ?? margin;
  const preferred = preference === "below" ? "below" : "above";
  const opposite = preferred === "above" ? "below" : "above";
  const first = placementCandidate(anchor, card, viewport, preferred, margin, topInset);
  const second = placementCandidate(anchor, card, viewport, opposite, margin, topInset);
  const obstacles = options.obstacles || [];
  const hits = (place) => {
    const rect = { left: place.left, top: place.top, right: place.left + card.width, bottom: place.top + card.height };
    return obstacles.some((box) => overlaps(rect, box));
  };
  let chosen = first;
  if ((!first.fits || hits(first)) && second.fits && !hits(second)) chosen = second;
  else if (!first.fits && second.fits) chosen = second;
  else if (!first.fits && !second.fits) {
    const top = Math.max(topInset, Math.min(first.top, viewport.height - margin - card.height));
    chosen = { ...first, top };
  }
  return {
    top: Math.round(chosen.top),
    left: Math.round(chosen.left),
    placement: chosen.placement,
    caret: Math.round(chosen.caret),
  };
}

function channel(value) {
  const s = value / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex) {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((part) => part + part).join("") : h;
  const n = Number.parseInt(full, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(foreground, background) {
  const lighter = Math.max(relativeLuminance(foreground), relativeLuminance(background));
  const darker = Math.min(relativeLuminance(foreground), relativeLuminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

export function validateMethodContent(steps = METHOD_STEPS) {
  const errors = [];
  const ids = new Set();
  for (const step of steps) {
    if (ids.has(step.id)) errors.push(`duplicate id ${step.id}`);
    ids.add(step.id);
    if (!step.plain || !step.plain.trim()) errors.push(`${step.id} missing plain language`);
    if (!step.technical || !step.technical.trim()) errors.push(`${step.id} missing technical line`);
    if (/\n/.test(step.technical)) errors.push(`${step.id} technical line has a line break`);
    if (step.technical.length > 240) errors.push(`${step.id} technical line is too long`);
    if (step.plain === step.technical) errors.push(`${step.id} plain and technical are the same`);
  }
  if (steps.length !== 6) errors.push("expected 6 steps");
  return errors;
}

export function validateUseCases(cases = USE_CASES) {
  const errors = [];
  const founders = cases.find((item) => item.id === "founders");
  const engineers = cases.find((item) => item.id === "engineers");
  if (!founders || founders.title !== "For founders and teams new to AI") errors.push("founders title");
  if (!engineers || engineers.title !== "For ML and platform engineers") errors.push("engineers title");
  const founderText = (founders?.paragraphs || []).join(" ");
  if (!/behavior between versions/i.test(founderText)) errors.push("founders behavior");
  if (!/flags a drop larger than 5 points when the evidence is clear, and says when it can't tell yet/.test(founderText)) errors.push("founders evidence");
  if (/before customers notice/i.test(founderText)) errors.push("old customer phrase");
  if (!/Gemini Flash-Lite to a newer Flash/.test(founderText)) errors.push("founders flash upgrade");
  const geminiAt = founderText.indexOf("Gemini");
  const openAiAt = founderText.indexOf("OpenAI");
  const anthropicAt = founderText.indexOf("Anthropic");
  if (geminiAt < 0 || openAiAt < geminiAt || anthropicAt < openAiAt) errors.push("provider order");
  if (!/provider-agnostic/i.test(founderText)) errors.push("founders provider-agnostic");
  if (!/roadmap/i.test(founderText)) errors.push("founders roadmap");
  if (/GPT-4\.1-nano/i.test(founderText)) errors.push("forbidden model name");
  const points = (engineers?.points || []).join(" ");
  if (!/CI gate/i.test(points)) errors.push("engineers ci");
  if (!/repeated rollouts/i.test(points)) errors.push("engineers rollouts");
  if (!/90%/.test(points)) errors.push("engineers interval");
  if (!/invalid-run/i.test(points)) errors.push("engineers invalid");
  if (!points.includes(DECISION_RULE)) errors.push("engineers decision rule");
  if (!/non-inferiority, δ = 5 pp/i.test(points)) errors.push("engineers delta");
  const suite = METHOD_STEPS.find((step) => step.id === "suite");
  if (!suite || suite.technical !== DECISION_RULE) errors.push("suite decision rule");
  if (!/Pass, Block, Insufficient evidence, or Invalid run/.test(suite?.plain || "")) errors.push("verdicts");
  if (!/Likely regression warning/.test(suite?.plain || "")) errors.push("regression warning");
  const stepText = METHOD_STEPS.map((step) => `${step.subtitle} ${step.plain} ${step.technical}`).join("\n");
  if (new RegExp(`${"20"} rollouts|5 rollouts|${"20"} baseline|5 candidate`).test(stepText)) errors.push("fixed rollout budget");
  if (!/repeated rollouts per arm/i.test(stepText)) errors.push("repeated rollouts per arm");
  return errors;
}

/** Escape closes a flowchart card only while focus is inside that flowchart. */
export function flowEscapeApplies(state, targetInsideFlow) {
  return Boolean(state?.openId) && targetInsideFlow === true;
}
