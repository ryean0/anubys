import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { DOCS_INDEX } from "../js/docs-index.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function mainOf(html) {
  const start = html.indexOf("<main");
  const end = html.indexOf("</main>", start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  return html.slice(start, end);
}

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PIP_URL = 'python -m pip install "git+https://github.com/rphua-dev/ci-agent-regression-harness"';

function rejectForbidden(html, label) {
  assert.doesNotMatch(html, EMAIL, `${label} email`);
  assert.doesNotMatch(html, /mailto:/i, `${label} mailto`);
  assert.doesNotMatch(html, /\bFail\b/, `${label} Fail verdict`);
  assert.doesNotMatch(html, /hard stop/i, `${label} hard stop`);
  assert.doesNotMatch(html, /\d+\/20\b/, `${label} n/20`);
  assert.doesNotMatch(html.replaceAll("https://ai.google.dev/gemini-api/docs/api-key", ""), /gemini-/i, `${label} model version`);
  assert.doesNotMatch(html, /py --version/, `${label} py launcher`);
  assert.doesNotMatch(html, /py -m venv/, `${label} py venv`);
  assert.doesNotMatch(html, /git\+https:\/\/github\.com\/rphua-dev\/ci-agent-regression-harness\.git/, `${label} pip URL suffix`);
  assert.doesNotMatch(html, /rollout runner|retail simulator/, `${label} advanced tools`);
  for (const match of html.matchAll(/<pre[^>]*>\s*<code>([\s\S]*?)<\/code>/g)) {
    assert.equal(/^\s*pip install anubys\b/i.test(match[1]), false, `${label} PyPI install block`);
    if (/pip install/i.test(match[1])) {
      const allowed = match[1].includes("--require-hashes") || match[1].includes("--no-deps") || match[1].includes("--upgrade pip") || match[1].includes("git+https://github.com/rphua-dev/ci-agent-regression-harness");
      assert.equal(allowed, true, `${label} pip line: ${match[1]}`);
    }
  }
}

function assertCostsTagged(html, label) {
  for (const amount of html.matchAll(/\$38|\$0|\$5/g)) {
    assert.match(html.slice(Math.max(0, amount.index - 120), amount.index), /Example/, `${label} ${amount[0]}`);
  }
}

const COMMANDS = [
  "python3 --version",
  "python --version",
  "git --version",
  "python3 -m venv .venv",
  "source .venv/bin/activate",
  "python -m venv .venv",
  ".venv\\Scripts\\Activate.ps1",
  "Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass",
  "sudo apt install python3-venv",
  ".venv\\Scripts\\python.exe -m harness validate suites/tau_retail/examples",
  ".venv\\Scripts\\python.exe -m pip install --require-hashes -r requirements.lock",
  ".venv\\Scripts\\python.exe -m pip install --no-deps -e .",
  PIP_URL,
  "python -m harness --help",
  "git clone https://github.com/rphua-dev/ci-agent-regression-harness.git",
  "cd ci-agent-regression-harness",
  "python -m pip install --require-hashes -r requirements.lock",
  "python -m pip install --no-deps -e .",
  "python -m harness validate suites/tau_retail/examples",
  "python -m harness validate suites/tau_retail",
  "python -m harness gates suites/tau_retail/scenarios",
  "python -m harness validate-results docs/examples/results.preliminary.json",
  "python scripts/show_verdict.py docs/examples/results.preliminary.json",
  "python -m harness convert-tau-retail --dry-run",
  'export GEMINI_API_KEY="paste-the-key-here"',
  'export GEMINI_API_KEY="paste-your-key-here"',
  '$env:GEMINI_API_KEY = "paste-the-key-here"',
  '$env:GEMINI_API_KEY="paste-your-key-here"',
  `python -c "import os; print('set' if os.environ.get('GEMINI_API_KEY','').strip() else 'missing')"`,
  "python scripts/check_monthly_spend.py --threshold 38",
];

const OUTPUTS = [
  "python: command not found",
  "No module named pip",
  "Error: [Errno 13] Permission denied: '/tmp/noperm/venv'",
  "Defaulting to user installation because normal site-packages is not writeable",
  "ERROR: Package 'ci-agent-regression-harness' requires a different Python: 3.10.22 not in '>=3.11'",
  "/tmp/does-not-exist-scenarios: path does not exist",
  "1 error(s) in 0 file(s); 0 scenario(s) parsed",
  "Successfully installed ci-agent-regression-harness-0.0.1",
  "ok 9 scenario(s), 0 suite file(s)",
  "ok 87 scenario(s), 1 suite file(s)",
  "ok 6 gate(s)",
  "1 gate(s) failed: synthetic-pii",
  "ok 1 results file(s)",
  "insufficient_evidence",
  "This test cannot yet tell whether the new agent is close enough, so it is not a yes or a no.",
  "fatal: could not read Username for 'https://github.com': terminal prompts disabled",
  "python: can't open file '/tmp/scripts/check_monthly_spend.py': [Errno 2] No such file or directory",
  "The virtual environment was not created successfully because ensurepip is not",
  "[notice] A new release of pip is available: 24.0 -> 26.2.1",
  "[notice] To update, run: python -m pip install --upgrade pip",
  "split test: 115 tasks",
  "allowed: 104",
  "must_refuse: 7",
  "ambiguous: 4",
  "missing",
  "2026-10 logged spend is $0, under the $38 cap.",
];

test("getting started ports the verified guide", () => {
  const html = read("docs/getting-started/index.html");
  const main = mainOf(html);
  assert.match(html, /https:\/\/anubys\.dev\/docs\/getting-started\//);
  assert.match(main, /There is no <code>pip install anubys<\/code> package/);
  assert.match(main, /The free parts need no API key and no money\./);
  assert.match(main, /MIT license planned/);
  assert.match(main, /Suite scoring, statistics, and report rendering are still placeholders/);
  assert.match(main, /https:\/\/www\.python\.org\/downloads\//);
  assert.doesNotMatch(main, /python\.org\/downloads\/macos/);
  assert.doesNotMatch(main, /python\.org\/downloads\/windows/);
  assert.match(main, /https:\/\/git-scm\.com\/downloads/);
  assert.match(main, /Python 3\.11\.17/);
  assert.match(main, /Git 2\.43\.0/);
  assert.match(main, /docs\/GETTING_STARTED\.md/);
  assert.match(main, /private beta/);
  assert.match(main, /role="tablist"/);
  assert.match(main, /aria-label="Choose your computer"/);
  assert.match(main, /macOS/);
  assert.match(main, /Windows \(PowerShell\)/);
  assert.match(main, /Linux/);
  assert.match(main, /aria-selected="true"/);
  assert.match(main, /tabindex="-1"/);
  assert.match(main, /data-os="windows"/);
  assert.match(main, /You should see/);
  assert.match(main, /not public yet/);
  assert.match(main, /\(beta testing\)/);
  assert.match(main, /Coming soon/);
  assert.match(main, /Do not start a live run from this page/);
  assert.match(main, /experiment\.yml/);
  assert.match(main, /after a required reviewer approves/);
  assert.doesNotMatch(main, /after Ryan approves/);
  assert.match(main, /Anubys records that rollout as an error with reason <code>spend_ceiling<\/code>\. It counts as an error: a failed rollout in the pass rate, scored 0\./);
  assert.match(main, /stays a miss even if it also went over the ceiling/);
  assert.match(main, /Outside a checkout, the live log is <code>~\/\.anubys\/spend_log\.jsonl<\/code> and nothing else\./);
  assert.match(main, /creates <code>~\/\.anubys<\/code> with mode 0700/);
  assert.match(main, /including <code>\.\/spend\/spend_log\.jsonl<\/code>/);
  assert.match(main, /per user and per machine/);
  assert.match(main, /until an approved live run appends a row/);
  assert.doesNotMatch(main, /being changed to count as a fail|Miss today|team decision October 16|previous logged row|labeled experiment/);
  assert.match(main, /The 115 is the original tau-bench task list\. The 87 earlier are the scenarios Anubys converted from it, so the numbers are not supposed to match\./);
  assert.match(main, /Block: clearly worse, by more than the allowed margin\./);
  assert.match(main, /Stay in this folder\./);
  assert.match(main, /Every new terminal forgets the folder and the environment\./);
  assert.match(main, /python3-venv/);
  assert.match(main, /python3\.12-venv/);
  assert.equal((main.match(/<code>Username for 'https:\/\/github\.com':<\/code>/g) || []).length, 2);
  assert.equal((main.match(/Press Ctrl\+C\. Do not type a username or a password\./g) || []).length, 2);
  assert.match(main, /Without access, Git stops and waits at this prompt:/);
  assert.match(main, /Press Ctrl\+C\. Do not type a username or a password\. The repository is still private\. Wait for the public launch, or use a copy someone has already shared with you\./);
  assert.equal((main.match(/If Git cannot ask, for example when there is no terminal, it prints this instead:/g) || []).length, 2);
  assert.match(main, /That line means the same thing\./);
  assert.match(main, /stop and wait at this prompt:/);
  assert.match(main, /This installs the missing venv tool for the system Python\. You only need it when the ensurepip message appears\. If apt says there is no installation candidate, run <code>sudo apt update<\/code> and then run the install command again\./);
  assert.match(main, /If a notice about a new pip release appears, it is harmless\. Ubuntu's pip often prints no notice\. When one does appear, the version numbers can differ\. It can look like this:/);
  assert.match(main, /This opens the results file and prints the verdict word plus one plain sentence\./);
  assert.doesNotMatch(main, /When Git can't ask/);
  assert.doesNotMatch(main, /pip upgrade notice after/);
  assert.doesNotMatch(main, /printed this notice afterward/);
  assert.doesNotMatch(main, /It opens the results file/);
  assert.doesNotMatch(main, /[—–]/);
  assert.doesNotMatch(main, /verdict_captions/);
  assert.doesNotMatch(main, /Going over that limit counts as a fail, not a miss/);
  const optionB = main.indexOf('id="option-b"');
  const warning = main.indexOf("The repository is private until the public launch.");
  const optionA = main.indexOf('id="option-a"');
  assert.ok(optionB > -1 && optionB < warning && warning < optionA);
  const order = ["what-anubys-does", "before-you-start", "install-anubys", "sample-use-cases", "keeping-it-free-and-safe", "glossary", "getting-help"];
  let cursor = -1;
  for (const id of order) {
    const at = main.indexOf(`id="${id}"`);
    assert.ok(at > cursor, id);
    cursor = at;
  }
  for (const command of COMMANDS) assert.ok(main.includes(command), command);
  for (const output of OUTPUTS) assert.ok(main.includes(output), output);
  const copies = main.match(/class="code-copy"/g) || [];
  assert.ok(copies.length >= 20);
  for (const chunk of main.split('<div class="docs-code">').slice(1)) {
    const piece = chunk.slice(0, chunk.indexOf("</pre>"));
    const code = piece.match(/<code>([\s\S]*?)<\/code>/);
    if (!code) continue;
    const first = code[1].split("\n")[0];
    if (/^(python3? |git |source |\.venv|export |\$env|sudo |Set-ExecutionPolicy)/.test(first)) {
      assert.match(piece, /class="code-copy"/, code[1].slice(0, 60));
    }
  }
  rejectForbidden(html, "getting started");
  assertCostsTagged(main, "getting started");
  const page = DOCS_INDEX.find((item) => item.path === "getting-started/");
  assert.ok(page);
  assert.equal(page.title, "Getting started");
  for (const heading of page.headings) {
    assert.ok(html.includes(`id="${heading.id}"`), heading.id);
    assert.ok(html.includes(heading.text), heading.text);
  }
});

test("sample use cases follow the verified checks", () => {
  const html = read("use-cases/index.html");
  const main = mainOf(html);
  assert.match(html, /https:\/\/anubys\.dev\/use-cases\//);
  assert.match(main, /They do not call a model, and they do not spend money\./);
  assert.match(main, /Suite scoring, statistics, and report rendering are still placeholders/);
  assert.match(main, /stub that exits with an error on purpose/);
  assert.match(main, /Coming soon/);
  assert.match(main, /Do not start a live run from this page/);
  assert.match(main, /after a required reviewer approves/);
  assert.doesNotMatch(main, /after Ryan approves/);
  assert.match(main, /Anubys records that rollout as an error with reason <code>spend_ceiling<\/code>\. It counts as an error: a failed rollout in the pass rate, scored 0\./);
  assert.match(main, /stays a miss even if it also went over the ceiling/);
  assert.match(main, /Outside a checkout, the live log is <code>~\/\.anubys\/spend_log\.jsonl<\/code> and nothing else\./);
  assert.match(main, /creates <code>~\/\.anubys<\/code> with mode 0700/);
  assert.match(main, /including <code>\.\/spend\/spend_log\.jsonl<\/code>/);
  assert.match(main, /per user and per machine/);
  assert.match(main, /until an approved live run appends a row/);
  assert.doesNotMatch(main, /being changed to count as a fail|Miss today|team decision October 16|previous logged row|labeled experiment/);
  assert.match(main, /The 115 is the original tau-bench task list\. The 87 earlier are the scenarios Anubys converted from it, so the numbers are not supposed to match\./);
  assert.match(main, /clearly worse, by more than the allowed margin/);
  assert.match(main, /python scripts\/show_verdict\.py docs\/examples\/results\.preliminary\.json/);
  assert.match(main, /Read the verdict with:/);
  assert.match(main, /This opens the results file and prints the verdict word plus one plain sentence\./);
  assert.match(main, /Keeping it free and safe/);
  assert.doesNotMatch(main, /[—–]/);
  assert.doesNotMatch(main, /verdict_captions/);
  assert.match(main, /data-state="block">Block/);
  assert.match(main, /role="tablist"/);
  assert.match(main, /href="\.\.\/docs\/getting-started\/"/);
  for (const id of ["why-youd-use-this", "validate-examples", "safety-checks", "results-file", "replay", "tau-preview", "live-model", "github-ci", "keeping-it-free-and-safe"]) {
    assert.ok(main.includes(`id="${id}"`), id);
  }
  for (const verdict of ["Pass", "Block", "Insufficient evidence", "Invalid run"]) {
    assert.ok(main.includes(verdict), verdict);
  }
  for (const output of ["ok 9 scenario(s), 0 suite file(s)", "ok 87 scenario(s), 1 suite file(s)", "ok 6 gate(s)", "split test: 115 tasks", "2026-10 logged spend is $0, under the $38 cap."]) {
    assert.ok(main.includes(output), output);
  }
  const copies = main.match(/class="code-copy"/g) || [];
  assert.ok(copies.length >= 8);
  rejectForbidden(html, "use cases");
  assertCostsTagged(main, "use cases");
  const home = read("index.html");
  assert.match(home, /href="use-cases\/"/);
  assert.match(home, /class="btn btn-primary" href="docs\/getting-started\/">Get started/);
  for (const href of [
    "use-cases/#why-youd-use-this",
    "use-cases/#validate-examples",
    "use-cases/#safety-checks",
    "use-cases/#results-file",
    "use-cases/#replay",
    "use-cases/#tau-preview",
    "use-cases/#live-model",
    "use-cases/#github-ci",
  ]) {
    assert.ok(home.includes(href), href);
  }
  const nav = home.slice(home.indexOf('aria-label="Primary"'), home.indexOf("</nav>"));
  assert.match(nav, />Use cases<\/a>/);
  assert.match(nav, />Guide<\/a>/);
});

test("guide styles keep orange on the active tab, copy hover, and Block chip only", () => {
  const css = read("css/site.css");
  assert.match(css, /\.guide-no\s*\{[^}]*color:\s*var\(--accent\)/);
  assert.match(css, /\.os-tab\[aria-selected="true"\]\s*\{[^}]*color:\s*var\(--accent\)/);
  assert.match(css, /\.code-copy:hover,\s*\.code-copy:focus-visible\s*\{[^}]*var\(--accent\)/);
  const block = css.match(/\.verdict-chip\[data-state="block"\]\s*\{([^}]*)\}/);
  assert.ok(block, "block chip");
  assert.match(block[1], /box-shadow:\s*var\(--block-glow\)/);
  assert.equal(css.includes('.verdict-chip[data-state="pass"]'), false);
  assert.equal(css.includes('.verdict-chip[data-state="insufficient"]'), false);
  assert.equal(css.includes('.verdict-chip[data-state="invalid"]'), false);
  const js = read("js/main.js");
  assert.match(read("js/docs.js"), /import "\.\/main\.js"/);
  assert.match(js, /ArrowRight/);
  assert.match(js, /ArrowLeft/);
  assert.match(js, /Home/);
  assert.match(js, /End/);
  assert.match(js, /aria-selected/);
});
