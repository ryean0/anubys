import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  METHOD_STEPS,
  METHOD_TEXT_PAIRS,
  USE_CASES,
  contrastRatio,
  createFlowState,
  DECISION_RULE,
  curvePath,
  flowEscapeApplies,
  flowScrollState,
  layoutMode,
  methodConnectorPaths,
  placeFlowCard,
  presentationForMotion,
  reduceFlow,
  validateMethodContent,
  validateUseCases,
} from "../js/method.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("each step is plain language, then one technical line", () => {
  assert.deepEqual(validateMethodContent(), []);
  for (const step of METHOD_STEPS) {
    assert.equal(step.technical.includes("\n"), false);
    assert.notEqual(step.plain, step.technical);
  }
});

test("use cases name both audiences and the facts they need", () => {
  assert.deepEqual(validateUseCases(), []);
  assert.equal(USE_CASES[0].id, "founders");
  assert.equal(USE_CASES[1].id, "engineers");
});

test("hover, focus, and tap open a card; Escape dismisses it", () => {
  let state = createFlowState();
  state = reduceFlow(state, { type: "pointerenter", id: "scenarios", pointerType: "mouse" });
  assert.equal(state.openId, "scenarios");
  state = reduceFlow(state, { type: "pointerleave", id: "scenarios" });
  assert.equal(state.openId, null);

  state = reduceFlow(state, { type: "focus", id: "runner" });
  assert.equal(state.openId, "runner");
  state = reduceFlow(state, { type: "escape" });
  assert.equal(state.openId, null);
  assert.equal(state.dismissedId, "runner");
  state = reduceFlow(state, { type: "pointerenter", id: "runner", pointerType: "mouse" });
  assert.equal(state.openId, null);
  state = reduceFlow(state, { type: "blur", id: "runner" });
  state = reduceFlow(state, { type: "pointerleave", id: "runner" });
  state = reduceFlow(state, { type: "pointerenter", id: "runner", pointerType: "mouse" });
  assert.equal(state.openId, "runner");

  state = reduceFlow(state, { type: "pointerleave", id: "runner" });
  state = reduceFlow(state, { type: "activate", id: "baseline", pointerType: "touch", coarse: true });
  assert.equal(state.openId, "baseline");
  assert.equal(state.pinnedId, "baseline");
  state = reduceFlow(state, { type: "activate", id: "baseline", pointerType: "touch", coarse: true });
  assert.equal(state.openId, null);
  state = reduceFlow(state, { type: "activate", id: "candidate", pointerType: "pen", coarse: false });
  assert.equal(state.openId, "candidate");
  state = reduceFlow(state, { type: "escape" });
  assert.equal(state.openId, null);
  assert.equal(state.pinnedId, null);
});

test("a mouse click does not pin, and touch hover does not stick", () => {
  let state = createFlowState();
  state = reduceFlow(state, { type: "pointerenter", id: "scorer", pointerType: "mouse" });
  state = reduceFlow(state, { type: "activate", id: "scorer", pointerType: "mouse", coarse: false, keyboard: false });
  assert.equal(state.pinnedId, null);
  assert.equal(state.openId, "scorer");

  state = reduceFlow(state, { type: "pointerleave", id: "scorer" });
  state = reduceFlow(state, { type: "pointerenter", id: "suite", pointerType: "touch" });
  assert.equal(state.hoverId, null);
  state = reduceFlow(state, { type: "activate", id: "suite", pointerType: "mouse", coarse: false, keyboard: true });
  assert.equal(state.openId, null);
});

test("Escape applies only while a flowchart card is open and focus is inside it", () => {
  assert.equal(flowEscapeApplies({ openId: "suite" }, true), true);
  assert.equal(flowEscapeApplies({ openId: "suite" }, false), false);
  assert.equal(flowEscapeApplies({ openId: null }, true), false);
  assert.equal(flowEscapeApplies(null, true), false);
  assert.equal(DECISION_RULE.includes("−5 pp"), true);

  const main = fs.readFileSync(path.join(root, "js/main.js"), "utf8");
  const init = main.slice(main.indexOf("function initFlow"), main.indexOf("function initChrome"));
  assert.match(init, /flow\.addEventListener\(\s*"keydown"/);
  assert.equal(init.includes("preventDefault"), false);
  assert.equal(init.includes("stopPropagation"), false);
  assert.equal(init.includes("aria-expanded"), false);
});

test("Escape closes the visible card without revealing a different focused step", () => {
  let state = createFlowState();
  state = reduceFlow(state, { type: "focus", id: "baseline" });
  state = reduceFlow(state, { type: "pointerenter", id: "scorer", pointerType: "mouse" });
  assert.equal(state.openId, "scorer");
  state = reduceFlow(state, { type: "escape" });
  assert.equal(state.openId, null);
  assert.equal(state.heldFocusId, "baseline");
  state = reduceFlow(state, { type: "blur", id: "baseline" });
  state = reduceFlow(state, { type: "focus", id: "suite" });
  assert.equal(state.openId, "suite");
});

test("focus moves from one step to the next", () => {
  let state = createFlowState();
  state = reduceFlow(state, { type: "focus", id: "scenarios" });
  state = reduceFlow(state, { type: "blur", id: "scenarios" });
  state = reduceFlow(state, { type: "focus", id: "runner" });
  assert.equal(state.openId, "runner");
  assert.equal(state.dismissedId, null);
});

test("coarse pointer toggles the pinned card", () => {
  let state = createFlowState();
  state = reduceFlow(state, { type: "activate", id: "scenarios", pointerType: "mouse", coarse: true });
  assert.equal(state.pinnedId, "scenarios");
  state = reduceFlow(state, { type: "outside" });
  assert.equal(state.openId, null);
  assert.equal(state.pinnedId, null);
});

test("scroll draw progress matches the connector curve", () => {
  assert.deepEqual(flowScrollState(900, 1000), { drawn: 0, step: 0 });
  assert.equal(flowScrollState(0, 1000).drawn, 1);
  assert.equal(flowScrollState(0, 1000).step, 4);
  const mid = flowScrollState(1000 * 0.9 - 1000 * 0.38 * 0.5, 1000);
  assert.ok(Math.abs(mid.drawn - 0.5) < 1e-9);
  assert.equal(mid.step, 2);
  assert.deepEqual(flowScrollState(0, 0), { drawn: 0, step: 0 });
  assert.deepEqual(flowScrollState(Number.NaN, 800), { drawn: 0, step: 0 });
});

test("reduced motion settles the flowchart and skips card motion", () => {
  assert.deepEqual(presentationForMotion(true), {
    animate: false,
    settled: true,
    drawn: 1,
    step: 4,
    cardMotion: "none",
  });
  assert.equal(presentationForMotion(false).cardMotion, "rise");
  assert.equal(presentationForMotion(false).drawn, 0);
});

test("layout mode switches at the wide breakpoint", () => {
  assert.equal(layoutMode(1099), "narrow");
  assert.equal(layoutMode(1100), "wide");
});

test("connectors meet the step edges", () => {
  const boxes = {
    scenarios: { x: 0, y: 100, w: 100, h: 40 },
    runner: { x: 200, y: 100, w: 100, h: 40 },
    baseline: { x: 400, y: 0, w: 100, h: 40 },
    candidate: { x: 400, y: 200, w: 100, h: 40 },
    scorer: { x: 600, y: 100, w: 100, h: 40 },
    suite: { x: 800, y: 100, w: 100, h: 40 },
  };
  const wide = methodConnectorPaths(boxes, "wide");
  const narrow = methodConnectorPaths(boxes, "narrow");
  assert.equal(wide.length, 6);
  assert.equal(narrow.length, 6);
  assert.equal(wide[0], curvePath({ x: 100, y: 120 }, { x: 200, y: 120 }));
  assert.equal(narrow[0], curvePath({ x: 50, y: 140 }, { x: 250, y: 100 }));
  assert.throws(() => methodConnectorPaths({ scenarios: boxes.scenarios }, "wide"), /missing box runner/);
});

test("cards stay on screen and remember which side they opened", () => {
  const viewport = { width: 1200, height: 800 };
  const card = { width: 200, height: 120 };
  const above = placeFlowCard(
    { left: 400, top: 300, width: 100, height: 40, right: 500, bottom: 340 },
    card,
    viewport,
    "above",
  );
  assert.equal(above.placement, "above");
  assert.equal(above.top, 168);
  assert.equal(above.left, 350);

  const flipped = placeFlowCard(
    { left: 400, top: 20, width: 100, height: 40, right: 500, bottom: 60 },
    card,
    viewport,
    "above",
    { topInset: 64 },
  );
  assert.equal(flipped.placement, "below");
  assert.equal(flipped.top, 72);

  const clamped = placeFlowCard(
    { left: 0, top: 300, width: 40, height: 40, right: 40, bottom: 340 },
    card,
    { width: 320, height: 800 },
    "above",
  );
  assert.equal(clamped.left, 12);
  assert.equal(clamped.caret, 8);

  const avoided = placeFlowCard(
    { left: 400, top: 200, width: 80, height: 40, right: 480, bottom: 240 },
    { width: 180, height: 80 },
    viewport,
    "below",
    { obstacles: [{ left: 390, top: 250, right: 590, bottom: 360 }] },
  );
  assert.equal(avoided.placement, "above");

  const below = placeFlowCard(
    { left: 400, top: 200, width: 80, height: 40, right: 480, bottom: 240 },
    { width: 180, height: 80 },
    viewport,
    "below",
  );
  assert.equal(below.placement, "below");
  assert.equal(below.top, 252);
});

test("method text colors meet WCAG AA contrast", () => {
  assert.ok(Math.abs(contrastRatio("#000000", "#ffffff") - 21) < 0.01);
  assert.ok(contrastRatio("#777777", "#ffffff") < 4.5);
  assert.ok(contrastRatio("#595959", "#ffffff") >= 4.5);
  for (const [foreground, background] of METHOD_TEXT_PAIRS) {
    const ratio = contrastRatio(foreground, background);
    assert.ok(ratio >= 4.5, `${foreground} on ${background} is ${ratio.toFixed(2)}`);
  }
});

function htmlRoutes(dir) {
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...htmlRoutes(full));
    else if (entry.name.endsWith(".html")) found.push(full);
  }
  return found;
}

test("every route avoids the retired gate phrases", () => {
  const files = htmlRoutes(root).filter((file) => !file.includes(`${path.sep}test${path.sep}`));
  assert.ok(files.length >= 7);
  for (const file of files) {
    const html = fs.readFileSync(file, "utf8");
    const lower = html.toLowerCase();
    for (const phrase of [
      "below zero",
      "above zero",
      "entire interval",
      "full interval",
      "twenty",
      "five rollouts",
      "five scheduled",
      "20 baseline",
      "5 candidate",
      "before customers notice",
    ]) {
      assert.equal(lower.includes(phrase), false, `${path.relative(root, file)} ${phrase}`);
    }
    const visible = html.replace(/<span class="term-tip"[\s\S]*?<\/span>/g, " ");
    const text = visible.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    assert.equal(/\d+\/20\b/.test(text), false, `${path.relative(root, file)} visible copy matches /20`);
    const withoutWarning = text
      .replace(/likely regression warning/gi, "")
      .replace(/warning · likely regression/gi, "")
      .replace(/likely regression: a warning flag shown on insufficient evidence\. not a separate status\./gi, "");
    assert.equal(/likely regression/i.test(withoutWarning), false, path.relative(root, file));
    assert.equal(/gpt-4\.1-nano/i.test(html), false, path.relative(root, file));
  }
});

test("the method section markup carries the cards and both audiences", () => {
  const html = fs.readFileSync(path.join(root, "method/index.html"), "utf8");
  const start = html.indexOf('id="method"');
  const end = html.indexOf("</main>");
  assert.ok(start > 0 && end > start);
  const method = html.slice(start, end);
  assert.match(method, /aria-describedby="flow-card-/);
  assert.match(method, /role="tooltip"/);
  assert.equal(method.includes("aria-expanded"), false);
  assert.equal(method.includes("aria-controls"), false);
  let cursor = 0;
  for (const step of METHOD_STEPS) {
    const cardAt = method.indexOf(`id="flow-card-${step.id}"`, cursor);
    assert.ok(cardAt > cursor, step.id);
    const plainAt = method.indexOf(step.plain, cardAt);
    const technicalAt = method.indexOf(step.technical, plainAt);
    assert.ok(plainAt > cardAt, `${step.id} plain`);
    assert.ok(technicalAt > plainAt, `${step.id} technical follows plain`);
    assert.match(method, new RegExp(`aria-describedby="flow-card-${step.id}"`));
    cursor = technicalAt;
  }
  const figureEnd = method.indexOf("</figure>");
  const foundersAt = method.indexOf(USE_CASES[0].title);
  const engineersAt = method.indexOf(USE_CASES[1].title);
  assert.ok(figureEnd > 0 && foundersAt > figureEnd && engineersAt > foundersAt);
  const text = method.replace(/<[^>]+>/g, "");
  for (const paragraph of USE_CASES[0].paragraphs) assert.ok(text.includes(paragraph));
  for (const point of USE_CASES[1].points) assert.ok(text.includes(point));
  assert.ok(text.indexOf("Gemini") < text.indexOf("OpenAI"));
  assert.ok(text.indexOf("OpenAI") < text.indexOf("Anthropic"));
  assert.equal(html.toLowerCase().includes(["gpt", "4.1", "nano"].join("-")), false);
  assert.match(fs.readFileSync(path.join(root, "css/site.css"), "utf8"), /prefers-reduced-motion:\s*reduce/);
});
