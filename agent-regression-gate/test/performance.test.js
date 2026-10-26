import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { readTiming, renderTimingHtml } from "../js/timing.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function section(html, start, end) {
  const from = html.indexOf(start);
  const to = html.indexOf(end, from);
  assert.ok(from > 0 && to > from, `${start} → ${end}`);
  return html.slice(from, to);
}

const sample = JSON.parse(read("data/timing.sample.json"));
const results = JSON.parse(read("data/results.preliminary.json"));

test("the landing section compares a runtime guardrail with the CI path", () => {
  const home = read("index.html");
  const latency = section(home, 'id="latency"', 'id="pipeline"');
  assert.match(latency, /Zero latency in production/);
  assert.match(latency, /Anubys never sits in the live request path/);
  assert.match(latency, /CI check when a PR opens/);
  assert.match(latency, /0 ms/);
  assert.match(latency, /production model responses/);
  assert.match(latency, /time on the PR check/);
  assert.match(latency, /Runtime guardrail/);
  assert.match(latency, /Latency on every request/);
  assert.match(latency, /baseline vs candidate/);
  assert.match(latency, /class="path-flow path-flow-ci"/);
  assert.match(latency, /Untouched/);
  assert.match(latency, /Orange marks the Anubys CI path/);
  assert.match(latency, /Cassette replay <span class="ship-tag">Built<\/span>/);
  assert.doesNotMatch(latency, /harness #14/);
  assert.equal(latency.includes("Built today"), false);
  assert.match(latency, /<a class="more" href="performance\/">More details<\/a>/);
  assert.match(home, /<a href="performance\/">Performance<\/a>/);
  assert.equal(/p95/i.test(latency), false);
  assert.equal(/parallel/i.test(latency), false);
  const guardrail = latency.slice(latency.indexOf("Runtime guardrail"), latency.indexOf("Anubys</p>"));
  assert.equal(guardrail.includes("path-flow-ci"), false);
});

test("the performance route states the built mitigations and the rollout tradeoff", () => {
  const html = read("performance/index.html");
  assert.match(html, /<link rel="canonical" href="https:\/\/anubys\.dev\/performance\/"/);
  assert.match(html, /property="og:url" content="https:\/\/anubys\.dev\/performance\/"/);
  assert.match(html, /href="\.\.\/performance\/" aria-current="page">Performance</);
  assert.match(html, /Zero latency in production/);
  assert.match(html, /Anubys never sits in the live request path/);
  assert.match(html, /0 ms to production model responses/);
  assert.match(html, /class="path-flow path-flow-ci"/);
  assert.match(html, /Orange marks the Anubys CI path/);
  for (const fact of [
    "Cassette replay",
    "recorded model calls",
    "No API waits",
    "No spend",
    "max_steps",
    "can't hang the check",
    "Monthly spend check",
    "No servers or proxies",
    "GitHub's runners",
    "then exits",
    "Pinned model ids",
    "Direct provider calls",
    "No extra hop",
    "Rollouts per arm is the overhead knob",
    "smaller MDE",
    "longer check",
    "Measured numbers coming from Oct cost runs",
    "No per-family verdict",
    'id="timing-root"',
    'data-timing="data/timing.sample.json"',
    'href="../data/timing.sample.json"',
  ]) {
    assert.ok(html.includes(fact), fact);
  }
  assert.match(html, /class="example-tag">Example</);
  const builtAt = html.indexOf('class="mitigations"');
  const builtList = html.slice(builtAt, html.indexOf("</ul>", builtAt));
  assert.match(builtList, /Cassette replay/);
  assert.doesNotMatch(html, /harness #14/);
  assert.doesNotMatch(html, /S3 upload/);
  const spend = read("docs/guides/spend/index.html");
  const integrations = read("integrations/index.html");
  assert.match(spend, /Cassette replay is Built/);
  assert.doesNotMatch(spend, /hard stop/i);
  assert.match(integrations, /Record\/replay cassettes · Built/);
  assert.equal(/cassettes are planned/i.test(integrations), false);
  assert.equal(/cassettes · planned/i.test(integrations), false);
  assert.match(integrations, /GitHub Action · planned/);
  const css = read("css/site.css");
  assert.match(css, /\.ship-tag\s*\{[^}]*color:\s*var\(--faint\)/);
  assert.equal(/\.ship-tag\s*\{[^}]*#ff7a1a/.test(css), false);
  assert.equal(/p95/i.test(html), false);
  assert.equal(/parallel/i.test(html), false);
  assert.equal(html.includes("https://anubys.dev/performance/\" >"), false);
});

test("example timings render from the sample and ignore a missing field", () => {
  assert.equal(Object.hasOwn(sample, "p95"), false);
  assert.equal(JSON.stringify(sample).toLowerCase().includes("p95"), false);

  const view = readTiming(sample);
  assert.equal(view.present, true);
  assert.deepEqual(view.families.map((row) => row.familyId), ["refund", "support"]);
  const html = renderTimingHtml(view);
  assert.equal((html.match(/>Example</g) || []).length, 7);
  assert.match(html, />900 s</);
  assert.match(html, />45 s</);
  assert.match(html, />12 s</);
  assert.match(html, />80 s</);
  assert.match(html, />4</);
  assert.match(html, /Slowest families by wall-clock/);
  assert.match(html, /No per-family verdict/);
  assert.equal(/p95/i.test(html), false);
  assert.equal(/parallel/i.test(html), false);
  assert.equal(/Pass|Block|Insufficient|Invalid/.test(html.slice(html.indexOf("timing-families"), html.indexOf("</ol>"))), false);

  const bare = renderTimingHtml(readTiming(results));
  assert.equal(readTiming(results).present, false);
  assert.match(bare, /No timing field in this file/);
  assert.equal(bare.includes("Example"), false);
  assert.equal(readTiming({ ...results, timing: null }).present, false);
  assert.equal(readTiming({ ...results, timing: sample }).gateWallClockS.live, 900);
  assert.equal(readTiming(null).present, false);
  assert.equal(readTiming(undefined).present, false);

  const partial = readTiming({
    timing: {
      gate_wall_clock_s: { live: 1 },
      rollout_s: { p50: 2, p95: 99 },
      per_family_wall_clock_s: [{ family_id: "support", seconds: 3, p95: 50 }],
    },
  });
  assert.equal(partial.present, true);
  assert.equal(partial.gateWallClockS.replay, null);
  assert.equal(partial.rolloutS.max, null);
  assert.equal(partial.retries429, null);
  const partialHtml = renderTimingHtml(partial);
  assert.match(partialHtml, /Not in this file/);
  assert.equal(/p95/i.test(partialHtml), false);
  assert.equal((partialHtml.match(/>Example</g) || []).length, 3);
});
