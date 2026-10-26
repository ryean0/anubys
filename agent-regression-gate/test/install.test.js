import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { DOCS_INDEX } from "../js/docs-index.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HARNESS = "https://github.com/rphua-dev/ci-agent-regression-harness";

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function htmlFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "test") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) htmlFiles(full, out);
    else if (entry.name.endsWith(".html")) out.push(full);
  }
  return out;
}

test("install guide exists, is marked beta, and has no real-looking key", () => {
  const rel = path.join("docs", "install", "index.html");
  assert.equal(fs.existsSync(path.join(root, rel)), true);
  const html = read(rel);
  assert.match(html, /https:\/\/anubys\.dev\/docs\/install\//);
  assert.match(html, /class="beta-banner">\(beta testing\)</);
  assert.match(html, /GEMINI_API_KEY/);
  assert.match(html, /your-key-here/);
  assert.match(html, /Coming soon/);
  assert.match(html, /class="code-copy"/);
  assert.match(html, /Python 3\.11 or newer/);
  assert.match(html, /git clone https:\/\/github\.com\/rphua-dev\/ci-agent-regression-harness\.git/);
  assert.match(html, /cd ci-agent-regression-harness/);
  assert.match(html, /python -m pip install --require-hashes -r requirements\.lock/);
  assert.match(html, /python -m pip install --no-deps -e \./);
  assert.doesNotMatch(html, /python -m pip install -e "\.\[dev\]"/);
  for (const command of [
    "pytest",
    "python -m harness validate suites/tau_retail",
    "python -m harness validate-results docs/examples/results.preliminary.json",
    "python -m harness gates suites/tau_retail/scenarios",
    "python scripts/check_monthly_spend.py",
    "ruff check .",
    "ruff format --check .",
    "terraform init -backend=false",
    "terraform fmt -check -recursive",
    "terraform validate",
  ]) {
    assert.ok(html.includes(command), command);
  }
  assert.match(html, /<details class="docs-fold">/);
  assert.equal(html.includes("<details class=\"docs-fold\" open"), false);
  assert.match(html, /id="verdict"[\s\S]*Coming soon/);
  assert.match(html, /action\/[\s\S]*intentional stub|intentional stub/);
  assert.match(html, /live-experiments/);
  assert.match(html, /does not receive an OIDC token/);
  assert.doesNotMatch(html, /python -m harness run/);
  assert.match(html, /The rollout runner is implemented/);
  assert.match(html, /Suite scoring, statistics, and report rendering are still placeholders/);
  assert.doesNotMatch(html, /the runner, environments, scoring/);
  assert.equal(html.includes("$40"), false);
  assert.match(html, /class="wordmark"/);
  assert.doesNotMatch(html, /AIza[0-9A-Za-z\-_]{10,}/);
  assert.doesNotMatch(html, /\bsk-[A-Za-z0-9]{8,}/);
  assert.doesNotMatch(html, /\bAKIA[0-9A-Z]{8,}/);
  assert.doesNotMatch(html, /\bghp_[A-Za-z0-9]{8,}/);
  assert.doesNotMatch(html, /\bgithub_pat_[A-Za-z0-9_]{8,}/);
  assert.match(html, /export GEMINI_API_KEY="your-key-here"/);
  assert.match(html, /never in a file/i);
  assert.equal(html.includes("your-key-here"), true);
  assert.doesNotMatch(html, /\bFail\b/);
  assert.doesNotMatch(html, /\d+\/20\b/);
  assert.doesNotMatch(html, /gemini-/);
  const amounts = [...html.matchAll(/\$38/g)];
  assert.ok(amounts.length >= 1);
  for (const amount of amounts) {
    const around = html.slice(Math.max(0, amount.index - 40), amount.index + 3);
    if (around.includes("fixed $38")) continue;
    assert.match(html.slice(Math.max(0, amount.index - 80), amount.index), /Example/);
  }
  assert.equal((html.match(/harness run<\/code> stops new live rollouts at a fixed \$38/g) || []).length, 2);
  assert.equal((html.match(/scripts\/check_monthly_spend\.py<\/code> takes <code>--threshold<\/code> \/ <code>MONTHLY_SPEND_CAP_USD<\/code>/g) || []).length, 2);
  const page = DOCS_INDEX.find((item) => item.path === "install/");
  assert.ok(page);
  assert.equal(page.title, "Install and setup");
  for (const heading of page.headings) {
    assert.ok(html.includes(`id="${heading.id}"`), heading.id);
    assert.ok(html.includes(heading.text), heading.text);
  }
});

test("the install guide does not link the private repository", () => {
  const html = read("docs/install/index.html");
  const links = [...html.matchAll(/<a\b[^>]*href="(https:\/\/github\.com\/rphua-dev\/ci-agent-regression-harness[^"]*)"[^>]*>[\s\S]*?<\/a>/g)];
  assert.equal(links.length, 0);
  assert.equal(html.includes(HARNESS), true);
  assert.doesNotMatch(html, /docs\/BACKGROUND\.md/);
  assert.match(html, /docs\/GETTING_STARTED\.md/);
  assert.match(html, /private beta/);
  assert.match(html, /MIT license planned/);
  assert.match(html, /Not on PyPI yet/);
  assert.match(html, /Invalid run/);
  assert.match(html, /The only free run step is the dry run/);
});

test("install nav links resolve and the landing page offers Get started", () => {
  const page = read("docs/install/index.html");
  for (const match of page.matchAll(/<a\b[^>]*href="([^"]+)"/g)) {
    const href = match[1];
    if (/^(https?:|mailto:|#)/.test(href)) continue;
    const clean = href.split("#")[0].split("?")[0];
    if (!clean) continue;
    const abs = path.resolve(path.join(root, "docs", "install"), clean);
    const target = fs.existsSync(abs) && fs.statSync(abs).isDirectory() ? path.join(abs, "index.html") : abs;
    assert.equal(fs.existsSync(target), true, href);
  }
  const home = read("index.html");
  assert.match(home, /class="btn btn-primary" href="docs\/getting-started\/">Get started</);
  assert.match(home, /href="docs\/install\/">Install</);
  for (const file of htmlFiles(root)) {
    const html = fs.readFileSync(file, "utf8");
    const label = path.relative(root, file);
    const footer = html.slice(html.indexOf("<footer"), html.indexOf("</footer>"));
    assert.match(footer, />Install<\/a>/, `${label} footer`);
    if (label.startsWith(`docs${path.sep}`)) {
      assert.match(html, /aria-label="Documentation"[\s\S]*?>Install<\/a>/, `${label} sidebar`);
    }
  }
});
