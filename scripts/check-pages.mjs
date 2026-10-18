import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { TAGLINE } from "../agent-regression-gate/js/brand.js";
import { RESULTS_PATH, RUN_SUMMARY_PATH, parseResultsV2, parseRunSummary } from "../agent-regression-gate/js/results.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const site = path.join(root, "agent-regression-gate");
const routes = [
  "index.html",
  "how-it-works/index.html",
  "method/index.html",
  "gate/index.html",
  "results/index.html",
  "performance/index.html",
  "integrations/index.html",
  "about/index.html",
  "use-cases/index.html",
  "docs/index.html",
  "docs/quickstart/index.html",
  "docs/getting-started/index.html",
  "docs/install/index.html",
  "docs/concepts/index.html",
  "docs/guides/scenarios/index.html",
  "docs/guides/adapters/index.html",
  "docs/guides/spend/index.html",
  "docs/reference/results/index.html",
  "docs/reference/adapter/index.html",
  "docs/reference/ci/index.html",
  "docs/reference/data/index.html",
  "docs/changelog/index.html",
  "docs/roadmap/index.html",
  "docs/dns-setup/index.html",
];

function htmlFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) htmlFiles(full, out);
    else if (entry.name.endsWith(".html")) out.push(full);
  }
  return out;
}

function attr(source, pattern) {
  const match = source.match(pattern);
  assert.ok(match, `missing ${pattern}`);
  return match[1];
}

function refsIn(html) {
  const refs = [];
  for (const match of html.matchAll(/<link\b[^>]*\bhref="([^"]+)"/g)) refs.push(match[1]);
  for (const match of html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)) refs.push(match[1]);
  for (const match of html.matchAll(/<a\b[^>]*\bhref="([^"]+)"/g)) refs.push(match[1]);
  for (const match of html.matchAll(/<meta\b[^>]*\b(?:property|name)="(?:og:image|twitter:image|og:url)"[^>]*\bcontent="([^"]+)"/g)) {
    refs.push(match[1]);
  }
  return refs;
}

function resolveRef(fromFile, ref) {
  assert.equal(ref.startsWith("/"), false, `${ref} is root-absolute`);
  assert.equal(/^https?:/i.test(ref), false, `${ref} is absolute`);
  const clean = ref.split("#")[0].split("?")[0];
  if (!clean || clean.startsWith("mailto:")) return null;
  const abs = path.resolve(path.dirname(fromFile), clean);
  assert.ok(abs === site || abs.startsWith(site + path.sep), `${ref} escapes the site`);
  if (fs.existsSync(abs) && fs.statSync(abs).isDirectory()) {
    const index = path.join(abs, "index.html");
    assert.equal(fs.existsSync(index), true, `${ref} has no index.html`);
    return index;
  }
  assert.equal(fs.existsSync(abs), true, `${ref} is missing`);
  return abs;
}

function pageUrl(fromFile, base) {
  let rel = path.relative(site, fromFile).split(path.sep).join("/");
  if (rel === "index.html") rel = "";
  else rel = rel.replace(/index\.html$/, "");
  return new URL(rel, base);
}

const ORIGIN = "https://anubys.dev/";
const SHARE_IMAGE = new URL("og.png", ORIGIN).href;

function performanceTargetMissing(fromFile, ref) {
  const clean = ref.split("#")[0].split("?")[0];
  if (!/(?:^|\/)performance\/(?:index\.html)?$/.test(clean)) return false;
  const abs = path.resolve(path.dirname(fromFile), clean);
  const index = abs.endsWith(`${path.sep}index.html`) ? abs : path.join(abs, "index.html");
  return !fs.existsSync(index);
}

function pageCanonical(rel) {
  const route = rel === "index.html" ? "" : rel.replace(/index\.html$/, "");
  return new URL(route, ORIGIN).href;
}

function assertNoRetiredAbsoluteSiteUrl(text, label) {
  assert.equal(text.includes("ryean0.github.io/anubys"), false, `${label} still uses ryean0.github.io/anubys`);
  for (const raw of text.match(/https?:\/\/[^\s"'<>)]+/g) || []) {
    const url = new URL(raw);
    // npm run preview mounts the artifact folder on loopback. That path is the
    // repo folder name, not a published site URL.
    const loopback = url.hostname === "127.0.0.1" || url.hostname === "localhost";
    const namesFolder = url.hostname.includes("agent-regression-gate") || url.pathname.includes("/agent-regression-gate");
    assert.equal(namesFolder && !loopback, false, `${label} absolute site URL still names the repo folder: ${raw}`);
  }
}

function assertShare(rel, html) {
  const canonical = pageCanonical(rel);
  assert.equal(attr(html, /<link rel="canonical" href="([^"]+)"/), canonical, `${rel} canonical`);
  assert.equal(attr(html, /property="og:url" content="([^"]+)"/), canonical, `${rel} og:url`);
  assert.equal(attr(html, /property="og:image" content="([^"]+)"/), SHARE_IMAGE, `${rel} og:image`);
  assert.equal(attr(html, /name="twitter:image" content="([^"]+)"/), SHARE_IMAGE, `${rel} twitter:image`);
  for (const url of [canonical, SHARE_IMAGE]) {
    assert.equal(url.startsWith(ORIGIN), true, `${rel} share URL ${url}`);
    assert.equal(url.includes("agent-regression-gate"), false, `${rel} share URL ${url}`);
  }
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  if (rel === "index.html") assert.equal(blocks.length, 1, "home json-ld");
  for (const block of blocks) {
    const data = JSON.parse(block[1]);
    assert.equal(data.url, canonical, `${rel} json-ld url`);
    assert.equal(String(data.url).startsWith(ORIGIN), true, `${rel} json-ld url`);
  }
  for (const match of html.matchAll(/<a\b[^>]*\bhref="([^"]+)"/g)) {
    assert.equal(match[1].startsWith(ORIGIN), false, `${rel} keeps in-site links relative: ${match[1]}`);
  }
  for (const match of html.matchAll(/<(?:link|script)\b[^>]*>/g)) {
    const tag = match[0];
    if (/\brel="canonical"/.test(tag)) continue;
    const ref = tag.match(/\b(?:href|src)="([^"]+)"/);
    if (!ref) continue;
    assert.equal(/^https?:\/\//i.test(ref[1]), false, `${rel} asset stays relative: ${ref[1]}`);
  }
}

const found = htmlFiles(site).map((file) => path.relative(site, file).split(path.sep).join("/")).sort();
assert.deepEqual(found, [...routes].sort());

const seen = new Set();
function walkScript(file) {
  const abs = path.resolve(file);
  if (seen.has(abs)) return;
  seen.add(abs);
  assert.ok(abs.startsWith(site + path.sep), abs);
  const source = fs.readFileSync(abs, "utf8");
  assert.equal(/mullion/i.test(source), false, `${path.relative(site, abs)} names the retired brand`);
  for (const match of source.matchAll(/from\s+"(\.[^"]+)"/g)) {
    let next = path.resolve(path.dirname(abs), match[1]);
    if (!next.endsWith(".js")) next += ".js";
    walkScript(next);
  }
  for (const match of source.matchAll(/asset\(\s*"([^"]+)"\s*\)/g)) {
    const fetched = path.resolve(site, match[1]);
    assert.equal(fs.existsSync(fetched), true, match[1]);
    if (match[1].endsWith(".json")) {
      const doc = JSON.parse(fs.readFileSync(fetched, "utf8"));
      const versionOk = doc.version === 1 || (typeof doc.version === "string" && /^2\.\d+\.\d+$/.test(doc.version));
      assert.equal(versionOk, true, `${match[1]} version`);
      assert.ok(doc.status === "preliminary" || doc.status === "final");
    }
  }
}

const bases = [ORIGIN];
for (const rel of routes) {
  const file = path.join(site, rel);
  const html = fs.readFileSync(file, "utf8");
  assert.equal(/mullion/i.test(html), false, `${rel} names the retired brand`);
  assert.equal(html.includes("agent-regression-gate"), false, `${rel} hardcodes the repo path`);
  assertNoRetiredAbsoluteSiteUrl(html, rel);
  assertShare(rel, html);
  assert.match(html, /property="og:title" content="Anubys"/);
  assert.match(html, /name="twitter:title" content="Anubys"/);
  assert.match(html, new RegExp(`property="og:description" content="${TAGLINE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
  assert.match(html, /class="brand-mark"/);
  for (const label of ["Product", "How it works", "Method", "Gate", "Results", "Performance", "Integrations", "Docs", "About"]) {
    assert.ok(html.includes(`>${label}</a>`), `${rel} nav ${label}`);
  }
  const dataBase = attr(html, /data-base="([^"]*)"/);
  assert.equal(path.resolve(path.dirname(file), dataBase), site, `${rel} data-base`);
  for (const ref of refsIn(html)) {
    if (/^(https?:|mailto:|#)/i.test(ref)) {
      if (/^https?:/i.test(ref)) assertNoRetiredAbsoluteSiteUrl(ref, `${rel} ${ref}`);
      continue;
    }
    // /performance/ lands on its own. Keep the nav link, and check the file once it is in the tree.
    if (!performanceTargetMissing(file, ref)) resolveRef(file, ref);
    for (const base of bases) {
      const resolved = new URL(ref, pageUrl(file, base));
      assert.ok(resolved.href.startsWith(base), `${ref} on ${rel} left ${base}`);
    }
  }
  const script = attr(html, /<script type="module" src="([^"]+)"/);
  walkScript(resolveRef(file, script));
}

assert.ok([...seen].some((file) => file.endsWith(`${path.sep}js${path.sep}results.js`)));
assert.ok([...seen].some((file) => file.endsWith(`${path.sep}js${path.sep}brand.js`)));

const home = fs.readFileSync(path.join(site, "index.html"), "utf8");
assert.match(home, /<title>Anubys<\/title>/);
assert.match(home, /Catch agent regressions/);
assert.match(home, new RegExp(TAGLINE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
assert.match(home, /"name": "Anubys"/);
assert.doesNotMatch(home, /CI Agent Regression Harness/);
assert.ok((home.match(/More details/g) || []).length >= 7);
assert.match(home, /class="scale\b/);
assert.match(home, /Baseline/);
assert.match(home, /Candidate/);

const favicon = resolveRef(path.join(site, "index.html"), attr(home, /<link rel="icon" href="([^"]+)"/));
assert.match(fs.readFileSync(favicon, "utf8"), /#ff7a1a|#070708/i);
resolveRef(path.join(site, "index.html"), attr(home, /<link rel="stylesheet" href="([^"]+)"/));

assert.equal(RESULTS_PATH, "data/results.preliminary.json");
const shipped = JSON.parse(fs.readFileSync(path.join(site, RESULTS_PATH), "utf8"));
assert.equal(shipped.schema_version, "2.1.0");
assert.equal(shipped.version, undefined);
assert.ok(shipped.status === "preliminary" || shipped.status === "final");
const shippedView = parseResultsV2(shipped);
assert.equal(shippedView.version, "2.1.0");
assert.equal(shippedView.schemaVersion, "2.1.0");
assert.equal(shippedView.headline, "Insufficient evidence");
assert.equal(shippedView.runKind, "screening");
assert.equal(shippedView.interval.fromFile, true);
assert.equal(shippedView.interval.delta, 0.05);
assert.equal(shippedView.interval.ciLevel, 0.9);
assert.equal(shippedView.modelIdSources.baseline, "overall");
assert.equal(shippedView.modelIdSources.candidate, "overall");
assert.equal(shippedView.modelIds.baseline, shipped.baseline_pool_model_id);
assert.equal(shippedView.modelIds.candidate, shipped.verdicts.overall.model_ids.candidate);
assert.equal(shipped.arms, undefined);
const summary = JSON.parse(fs.readFileSync(path.join(site, RUN_SUMMARY_PATH), "utf8"));
assert.equal(summary.schema_version, "1.0.0");
assert.equal(parseRunSummary(summary).stopped, null);

const mainSource = fs.readFileSync(path.join(site, "js/main.js"), "utf8");
assert.match(mainSource, /parseResultsV2/);
assert.match(mainSource, /RESULTS_PATH/);
assert.match(mainSource, /BRAND/);
assert.doesNotMatch(mainSource, /asset\(\s*"data\/results\.preliminary\.json"\s*\)/);

const og = resolveRef(path.join(site, "index.html"), "./og.png");
const png = fs.readFileSync(og);
assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
assert.equal(png.readUInt32BE(16), 1200);
assert.equal(png.readUInt32BE(20), 630);

assert.equal(fs.existsSync(path.join(site, ".nojekyll")), true);
assert.equal(fs.existsSync(path.join(site, "CNAME")), false, "custom domain is set in Pages settings, so the artifact has no CNAME");
for (const name of ["sitemap.xml", "robots.txt"]) {
  const file = path.join(site, name);
  if (!fs.existsSync(file)) continue;
  const text = fs.readFileSync(file, "utf8");
  assertNoRetiredAbsoluteSiteUrl(text, name);
  for (const raw of text.match(/https?:\/\/[^\s"'<>)]+/g) || []) {
    assert.equal(raw.startsWith(ORIGIN), true, `${name} absolute URL ${raw}`);
  }
}

const published = new Set(htmlFiles(site));
published.add(path.join(root, "README.md"));
published.add(path.join(site, "README.md"));
published.add(path.join(root, ".github/workflows/pages.yml"));
function addText(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "test" || entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) addText(full);
    else if (/\.(html|js|css|json|svg|md|txt|xml|yml)$/.test(entry.name)) published.add(full);
  }
}
addText(site);
addText(path.join(root, "docs"));
for (const file of published) {
  assertNoRetiredAbsoluteSiteUrl(fs.readFileSync(file, "utf8"), path.relative(root, file));
}
assert.match(fs.readFileSync(path.join(site, "css/site.css"), "utf8"), /#ff7a1a/);
assert.match(fs.readFileSync(path.join(site, "css/site.css"), "utf8"), /\.scale-beam[\s\S]*prefers-reduced-motion:\s*reduce[\s\S]*\.scale-beam[\s\S]*animation:\s*none/);

const integrations = fs.readFileSync(path.join(site, "integrations/index.html"), "utf8");
assert.match(integrations, /id="integrations"/);
assert.match(integrations, /adapter example/);
assert.match(integrations, /a pinned Gemini Flash-Lite model id \(lives in <code>config\/allowed_models\.txt<\/code> and is passed with <code>--model<\/code>\)/);
assert.match(integrations, /Gemini is the only adapter today/);
assert.doesNotMatch(integrations, /does not ship an adapter/);
assert.doesNotMatch(integrations, /gemini-/);
assert.match(integrations, /Gemini adapter is Built/);
assert.match(integrations, /OpenAI Agents SDK · adapter example/);
assert.match(integrations, /Claude Agent SDK · adapter example/);
assert.match(integrations, /GitHub Action · planned/);
assert.match(integrations, /Record\/replay cassettes · Built/);
assert.match(integrations, /No official partnerships/);
assert.doesNotMatch(integrations, /gpt-4\.1-nano/i);
assert.doesNotMatch(integrations, /GPT-4\.1-nano/);

function rejectNano(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      rejectNano(file);
      continue;
    }
    if (!/\.(html|js|css|md|json|svg)$/.test(entry.name)) continue;
    const text = fs.readFileSync(file, "utf8");
    assert.doesNotMatch(text, /gpt-4\.1-nano/i, `${path.relative(site, file)} mentions GPT-4.1-nano`);
  }
}
rejectNano(site);

const workflow = fs.readFileSync(path.join(root, ".github/workflows/pages.yml"), "utf8");
assert.match(workflow, /pull_request:/);
assert.match(workflow, /path:\s*agent-regression-gate/);
assert.match(workflow, /include-hidden-files:\s*true/);
assert.match(workflow, /needs:\s*test/);
assert.match(workflow, /enablement:\s*true/);
assert.match(workflow, /continue-on-error:\s*true/);

const stylesheet = fs.readFileSync(path.join(site, "css/site.css"), "utf8");
const overflow = fixedWidthsThatOverflow(stylesheet);
assert.deepEqual(overflow, [], `fixed widths that overflow a 320px screen:\n${overflow.join("\n")}`);

console.log(`pages check ok (${routes.length} routes, ${seen.size} scripts, results file, favicon, og.png)`);

function fixedWidthsThatOverflow(css) {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const risks = [];
  const decl = /(?<![\w-(])((?:min-)?)width\s*:\s*([^;}{]+)/g;
  for (const match of text.matchAll(decl)) {
    const property = `${match[1]}width`;
    const value = match[2].trim();
    const bare = stripFluidFunctions(value);
    const px = [...bare.matchAll(/(\d+(?:\.\d+)?)px/g)].map((item) => Number(item[1]));
    const rem = [...bare.matchAll(/(\d+(?:\.\d+)?)rem/g)].map((item) => Number(item[1]) * 16);
    const wide = [...px, ...rem].filter((size) => size > 320);
    if (wide.length) risks.push(`${property}: ${value} (${wide.join(", ")}px)`);
  }
  return risks;
}

function stripFluidFunctions(value) {
  let out = "";
  let index = 0;
  while (index < value.length) {
    const fn = /^(?:min|max|clamp|calc)\(/.exec(value.slice(index));
    if (!fn) {
      out += value[index];
      index += 1;
      continue;
    }
    let depth = 0;
    let end = index;
    for (; end < value.length; end += 1) {
      if (value[end] === "(") depth += 1;
      else if (value[end] === ")") {
        depth -= 1;
        if (depth === 0) {
          end += 1;
          break;
        }
      }
    }
    const chunk = value.slice(index, end);
    out += /%|vw|vh|vmin|vmax|svw|dvw|cqw/.test(chunk) ? " 0px " : chunk;
    index = end;
  }
  return out;
}
