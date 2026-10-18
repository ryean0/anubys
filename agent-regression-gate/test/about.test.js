import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { FOUNDERS, founderContact, renderFoundersHtml } from "../js/founders.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BIO = "Early career software engineer specialising in cloud migration of CI/CD automation. Led end-to-end migration of SaaS delivery stack from AWS Amplify V1 to V2, built an air-gapped Kubernetes cluster customised for on-satellite ML workloads for image segmentation tasks in Pytorch & Tensorflow. Anubys is my portfolio product aimed at delivering scalable, cost-efficient & effective AI model infrastructure to guarantee accountable, reproducible, and retraceable ML workflows for enterprise-scale tooling and/or individual hobbyists.";
const LINKEDIN = "https://www.linkedin.com/in/rphua-dev";

function htmlFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "test") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) htmlFiles(full, out);
    else if (entry.name.endsWith(".html")) out.push(full);
  }
  return out;
}

function sliceNav(html, marker) {
  const start = html.indexOf(marker);
  assert.notEqual(start, -1, marker);
  const end = html.indexOf("</nav>", start);
  assert.notEqual(end, -1, marker);
  return html.slice(start, end);
}

test("the about route exists and is in the primary nav and footer", () => {
  const page = path.join(root, "about", "index.html");
  assert.equal(fs.existsSync(page), true);
  const html = fs.readFileSync(page, "utf8");
  assert.match(html, /https:\/\/anubys\.dev\/about\//);
  const nav = sliceNav(html, 'aria-label="Primary"');
  assert.match(nav, /href="\.\.\/about\/" aria-current="page">About<\/a>/);
  const footer = html.slice(html.indexOf("<footer"), html.indexOf("</footer>"));
  assert.match(footer, /href="\.\.\/about\/">About<\/a>/);

  for (const file of htmlFiles(root)) {
    const source = fs.readFileSync(file, "utf8");
    const label = path.relative(root, file);
    assert.match(sliceNav(source, 'aria-label="Primary"'), />About<\/a>/, `${label} primary nav`);
    const pages = source.slice(source.indexOf("<footer"), source.indexOf("</footer>"));
    assert.match(pages, />About<\/a>/, `${label} footer`);
  }
});

test("the founders section is one card for Ryan Phua and verdicts do not say Fail", () => {
  const html = fs.readFileSync(path.join(root, "about", "index.html"), "utf8");
  const source = fs.readFileSync(path.join(root, "js", "founders.js"), "utf8");
  assert.equal(FOUNDERS.length, 1);
  assert.equal(FOUNDERS[0].name, "Ryan Phua");
  assert.equal(FOUNDERS[0].title, "Founder");
  assert.equal(FOUNDERS[0].initials, "RP");
  assert.equal(FOUNDERS[0].photo, "");
  assert.equal(FOUNDERS[0].bio, BIO);
  assert.equal(FOUNDERS[0].github, "https://github.com/ryean0");
  assert.equal(FOUNDERS[0].linkedin, LINKEDIN);
  assert.equal(founderContact(FOUNDERS[0]), LINKEDIN);
  assert.doesNotMatch(source, /mailto:/i);
  assert.doesNotMatch(html, /mailto:/i);
  assert.equal(html.includes("Bio coming soon."), false);
  assert.match(html, /id="founder-list"/);
  assert.match(html, /<noscript>[\s\S]*linkedin\.com\/in\/rphua-dev/);
  assert.doesNotMatch(html, /\[at\]/);
  const cards = [...renderFoundersHtml().matchAll(/<li class="founder-card">[\s\S]*?<\/li>/g)];
  assert.equal(cards.length, 1);
  assert.match(cards[0][0], /Ryan Phua/);
  assert.match(cards[0][0], /Founder/);
  assert.match(cards[0][0], />RP</);
  assert.match(cards[0][0], /href="https:\/\/github\.com\/ryean0"/);
  assert.match(cards[0][0], /href="https:\/\/www\.linkedin\.com\/in\/rphua-dev"/);
  assert.match(cards[0][0], />LinkedIn</);
  assert.doesNotMatch(cards[0][0], />Email</);
  assert.match(cards[0][0], /image segmentation tasks/);
  assert.equal(cards[0][0].includes("taskss"), false);
  const main = fs.readFileSync(path.join(root, "js", "main.js"), "utf8");
  assert.match(main, /renderFoundersHtml/);
  assert.match(main, /bindFounderEmails/);
  assert.match(html, /Pass/);
  assert.match(html, /Block/);
  assert.match(html, /Insufficient evidence/);
  assert.match(html, /Invalid run/);
  assert.doesNotMatch(html, /\bFail\b/);
  assert.doesNotMatch(html, /\d+\/20\b/);
  assert.doesNotMatch(html, /gemini-/);
});
