import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { DOCS_INDEX } from "../js/docs-index.js";
import { docsHref, filterHeadings } from "../js/docs-search.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function docsHtml() {
  const found = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".html")) found.push(full);
    }
  }
  walk(path.join(root, "docs"));
  return found;
}

test("docs search keeps relative hrefs and filters headings", () => {
  assert.equal(docsHref("./", "", "between"), "./#between");
  assert.equal(docsHref("../", "quickstart/", ""), "../quickstart/");
  assert.equal(docsHref("../../", "reference/data/", "cloud"), "../../reference/data/#cloud");
  assert.equal(filterHeadings(DOCS_INDEX, "   ").length, 0);
  const misses = filterHeadings(DOCS_INDEX, "Misses");
  assert.equal(misses.some((hit) => hit.id === "misses" && hit.path === "concepts/"), true);
  const cloud = filterHeadings(DOCS_INDEX, "your cloud");
  assert.equal(cloud.some((hit) => hit.id === "cloud"), true);
  assert.equal(filterHeadings(DOCS_INDEX, "no-such-heading-xyz").length, 0);
});

test("every docs page has a sidebar, search, on-this-page list, and pager", () => {
  const files = docsHtml();
  assert.equal(files.length, DOCS_INDEX.length);
  for (const file of files) {
    const html = fs.readFileSync(file, "utf8");
    assert.match(html, /class="docs-shell"/);
    assert.match(html, /id="docs-q"/);
    assert.match(html, /Search headings/);
    assert.match(html, /aria-labelledby="on-this-page"/);
    assert.match(html, /class="docs-pager"/);
    assert.match(html, /aria-label="Documentation"/);
    assert.match(html, /js\/docs\.js"/);
    const rel = path.relative(root, file);
    const page = DOCS_INDEX.find((item) => {
      const indexFile = item.path ? path.join("docs", item.path, "index.html") : path.join("docs", "index.html");
      return indexFile === rel;
    });
    assert.ok(page, rel);
    for (const heading of page.headings) {
      assert.ok(html.includes(`id="${heading.id}"`), `${rel} ${heading.id}`);
      assert.ok(html.includes(heading.text), `${rel} ${heading.text}`);
    }
  }
});

test("guides and reference ship copyable samples", () => {
  for (const rel of [
    "docs/quickstart/index.html",
    "docs/guides/scenarios/index.html",
    "docs/guides/adapters/index.html",
    "docs/guides/spend/index.html",
    "docs/reference/results/index.html",
    "docs/reference/adapter/index.html",
    "docs/reference/ci/index.html",
  ]) {
    assert.match(read(rel), /class="code-copy"/);
    assert.match(read(rel), /<pre tabindex="0"><code>/);
  }
});

test("quickstart names the five steps and marks the unshipped workflow", () => {
  const html = read("docs/quickstart/index.html");
  for (const step of ["Add the workflow", "Add the adapter", "Allowlist the model", "Set the secret", "Open a pull request"]) {
    assert.ok(html.includes(step), step);
  }
  assert.match(html, /id="workflow"[\s\S]*data-state="planned"/);
  assert.match(html, /id="adapter"[\s\S]*data-state="built"/);
  assert.match(html, /a pinned Gemini Flash-Lite model id \(lives in <code>config\/allowed_models\.txt<\/code> and is passed with <code>--model<\/code>\)/);
  assert.match(html, /The pinned model id lives in <code>config\/allowed_models\.txt<\/code> and is passed with <code>--model<\/code>/);
  assert.doesNotMatch(html, /passed with --model \(listed/);
  assert.doesNotMatch(html, /gemini-/);
});

test("concepts keep the gate rule, the four statuses, and the miss cap", () => {
  const html = read("docs/concepts/index.html");
  assert.match(html, /non-inferiority, δ = 5 pp/i);
  assert.match(html, /90% interval/);
  assert.match(html, /above −5 pp/);
  assert.match(html, /below −5 pp/);
  for (const status of ["Pass", "Block", "Insufficient evidence", "Invalid run"]) {
    assert.ok(html.includes(status), status);
  }
  assert.match(html, /Likely regression warning/);
  for (const kind of ["agent_timeout", "agent_error", "infra_timeout", "rate_limit", "http_5xx", "ci_kill", "env_miss"]) {
    assert.ok(html.includes(kind), kind);
  }
  assert.match(html, /The cap is 5% of the scheduled rollouts/);
  assert.match(html, /Exactly 5% still scores/);
  assert.match(html, /invalid_run/);
  assert.match(html, /minimum detectable effect/i);
  assert.match(html, /Showing the MDE on the check is planned with Milestone B \(target November 10\)/);
  assert.doesNotMatch(html, /Showing the MDE on the check is Next/);
  const results = read("docs/reference/results/index.html");
  assert.match(results, /schema_version/);
  assert.match(results, /verdicts\.overall\.model_ids/);
  assert.match(results, /δ = 5 pp \/ 90%/);
  assert.match(results, /Still in progress/);
  assert.match(results, /No per-family verdict|no verdict/);
});

test("enterprise strip labels data residency Planned and the other three Built", () => {
  const home = read("index.html");
  assert.match(home, /id="why"/);
  assert.match(home, /Dashboards and tracing tools score a run and keep the trace/);
  assert.match(home, /gates the merge on statistics, with a spend cap/);
  const why = home.slice(home.indexOf('id="why"'), home.indexOf('id="pipeline"'));
  assert.equal(why.toLowerCase().includes("logo"), false);
  const strip = home.slice(home.indexOf('class="enterprise"'), home.indexOf('href="docs/">More details'));
  function card(name) {
    const anchors = [...strip.matchAll(/<a\b[\s\S]*?<\/a>/g)].map((match) => match[0]);
    const found = anchors.find((anchor) => anchor.includes(name));
    assert.ok(found, name);
    return found;
  }
  assert.match(card("Keyless CI"), /data-state="planned"/);
  assert.match(card("Keyless CI"), /In progress/);
  assert.match(card("Keyless CI"), /roles deployed, CI wiring in progress/);
  assert.match(card("Spend governance"), /data-state="built"/);
  assert.match(card("Reproducible audit trail"), /data-state="planned"/);
  assert.match(card("Reproducible audit trail"), /run_summary\.json/);
  const data = card("Data stays in your cloud");
  assert.match(data, /data-state="planned"/);
  assert.match(data, /Nothing uploads results yet/);
  assert.match(data, /post-MVP/);
  assert.equal(/data-state="built"/.test(data), false);
  assert.doesNotMatch(data, /S3 bucket/);
  assert.match(data, /href="docs\/reference\/data\/#cloud"/);
});

test("data residency docs match the Planned strip", () => {
  const data = read("docs/reference/data/index.html");
  assert.match(data, /Data stays in your cloud is Planned/);
  assert.match(data, /Nothing uploads results yet/);
  assert.doesNotMatch(data, /S3 bucket/);
  assert.match(data, /post-MVP/);
  assert.match(data, /id="cloud"[\s\S]*data-state="planned"/);
  const ci = read("docs/reference/ci/index.html");
  assert.match(ci, /no stored cloud key|does not store a cloud key/i);
  assert.match(ci, /read-only/i);
  assert.match(ci, /roles deployed, CI wiring in progress/);
  assert.doesNotMatch(ci, /S3 bucket/);
  assert.match(ci, /post-MVP/);
});

test("roadmap lanes are Built, Next, and Planned", () => {
  const html = read("docs/roadmap/index.html");
  assert.match(html, /id="built"/);
  assert.match(html, /id="next"/);
  assert.match(html, /id="planned"/);
  assert.match(html, /Dates are targets and can move/);
  assert.doesNotMatch(html, /Wk4/);
  assert.match(html, /Gemini adapter/);
  assert.match(html, /Monthly spend check/);
  const spend = read("docs/guides/spend/index.html");
  assert.match(spend, /<code>harness run<\/code> stops new live rollouts at a fixed \$38\. The standalone <code>scripts\/check_monthly_spend\.py<\/code> takes <code>--threshold<\/code> \/ <code>MONTHLY_SPEND_CAP_USD<\/code>/);
  assert.doesNotMatch(spend, /real knob/);
  assert.match(html, /Stats gate rule/);
  assert.match(html, /Milestone B \(target November 10\)/);
  assert.match(html, /October 23/);
  assert.match(html, /October 29/);
  assert.match(html, /No per-family verdict/);
  assert.match(html, /The gate stays on the pooled result/);
  assert.match(html, /Cost per verdict/);
  assert.match(html, /MDE on the check/);
  const nextLane = html.slice(html.indexOf('id="next"'), html.indexOf('id="planned"'));
  const plannedLane = html.slice(html.indexOf('id="planned"'));
  assert.equal(nextLane.includes("MDE on the check"), false);
  assert.match(plannedLane, /MDE on the check/);
  assert.match(plannedLane, /Showing the MDE on the check is planned with Milestone B \(target November 10\)/);
  for (const item of [
    "Packaged GitHub Action",
    "A second provider",
    "Bring-your-own scenarios",
    "OTel trace import",
    "Bring-your-own bucket",
  ]) {
    assert.ok(html.includes(item), item);
  }
  assert.match(html, /OpenAI or Anthropic/);
  assert.match(html, /Data stays in your cloud is Planned, and post-MVP/);
  const css = read("css/site.css");
  assert.match(css, /prefers-reduced-motion:\s*reduce[\s\S]*\.roadmap/);
  assert.match(css, /\.docs-nav a\[aria-current="page"\]\s*\{[^}]*color:\s*var\(--block\)/);
  assert.match(css, /\.road-lane\s*\{[^}]*rgba\(255,\s*122,\s*26/);
  assert.match(css, /\.why-card:has\(\.why-orange\)\s*\{[^}]*rgba\(255,\s*122,\s*26/);
  assert.equal(css.includes(".docs-side"), false);
  assert.equal(css.includes(".docs-links"), false);
});

test("dns setup points anubys.dev at GitHub Pages and omits the verification value", () => {
  const html = read("docs/dns-setup/index.html");
  assert.match(html, /https:\/\/anubys\.dev\/docs\/dns-setup\//);
  assert.match(html, /hosted on GitHub Pages/);
  assert.match(html, /Squarespace only provides DNS/);
  assert.match(html, /no Squarespace site plan/);
  assert.match(html, /class="dns-flow"/);
  assert.match(html, /<strong>Browser<\/strong>/);
  assert.match(html, /DNS lookup at Squarespace/);
  assert.match(html, /ryean0\/anubys/);
  assert.match(html, /HTTPS certificate/);
  for (const address of [
    "185.199.108.153",
    "185.199.109.153",
    "185.199.110.153",
    "185.199.111.153",
    "2606:50c0:8000::153",
    "2606:50c0:8001::153",
    "2606:50c0:8002::153",
    "2606:50c0:8003::153",
  ]) {
    assert.ok(html.includes(address), address);
  }
  assert.match(html, /<td>A<\/td>/);
  assert.match(html, /<td>AAAA<\/td>/);
  assert.match(html, /<td>CNAME<\/td>/);
  assert.match(html, /<td>TXT<\/td>/);
  assert.match(html, /<code>www<\/code>/);
  assert.match(html, /<code>ryean0\.github\.io<\/code>/);
  assert.match(html, /Alias so www\.anubys\.dev follows along/);
  assert.match(html, /for redundancy/);
  assert.match(html, /newer networks and phones/);
  assert.match(html, /Account-specific\. Copy from GitHub/);
  assert.match(html, /not listed on this page/);
  assert.match(html, /blocks a takeover/);
  assert.equal(html.includes("ryean0.github.io/anubys"), false);
  assert.doesNotMatch(html, /_github-pages-challenge-[A-Za-z0-9.-]+=\S+/);
  assert.match(html, /Remove the Squarespace default records/);
  assert.match(html, /parking page/);
  assert.match(html, /Leave Domain Nameservers untouched/);
  assert.match(html, /Leave DNSSEC untouched/);
  assert.match(html, /\.dev requires HTTPS/);
  assert.match(html, /up to 24 hours/);
  assert.match(html, /tick Enforce HTTPS/);
  assert.match(html, /dig anubys\.dev \+short/);
  assert.match(html, /dig www\.anubys\.dev CNAME \+short/);
  assert.match(html, /curl -I https:\/\/anubys\.dev/);
  assert.match(html, /href="\.\.\/\.\.\/performance\/">Performance</);
  assert.match(html, /class="wordmark"/);
  assert.match(html, /wordmark-name">Anubys</);
  assert.match(html, /wordmark-tld">\.dev</);
  const page = DOCS_INDEX.find((item) => item.path === "dns-setup/");
  assert.ok(page);
  assert.equal(page.title, "DNS setup");
  for (const file of docsHtml()) {
    const source = fs.readFileSync(file, "utf8");
    const label = path.relative(root, file);
    assert.match(source, />DNS setup<\/a>/, label);
    if (label !== path.join("docs", "dns-setup", "index.html")) {
      assert.match(source, /href="[^"]*dns-setup\/"/, label);
    }
  }
  const roadmap = read("docs/roadmap/index.html");
  assert.match(roadmap, /class="docs-next" href="\.\.\/dns-setup\/"/);
  assert.match(html, /class="docs-prev" href="\.\.\/roadmap\/"/);
});
