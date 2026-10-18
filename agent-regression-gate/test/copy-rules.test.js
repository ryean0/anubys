import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repo = path.resolve(root, "..");

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const EM_DASH = /\u2014/;

function filesUnder(dir, pred, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "test" || entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) filesUnder(full, pred, out);
    else if (pred(entry.name)) out.push(full);
  }
  return out;
}

test("site pages, site JS, and both READMEs stay clear of banned copy", () => {
  const files = [
    ...filesUnder(root, (name) => name.endsWith(".html")),
    ...filesUnder(path.join(root, "js"), (name) => name.endsWith(".js")),
    path.join(root, "README.md"),
    path.join(repo, "README.md"),
  ];
  assert.ok(files.length > 20);
  const paypal = /https?:\/\/paypal\.me\/[A-Za-z0-9]+/gi;
  for (const file of files) {
    const text = fs.readFileSync(file, "utf8");
    const label = path.relative(repo, file);
    assert.doesNotMatch(text, EMAIL, `${label} email`);
    assert.doesNotMatch(text, /hard stop/i, `${label} hard stop`);
    assert.doesNotMatch(text, EM_DASH, `${label} em dash`);
    assert.doesNotMatch(text, /monthly_hard_stop_usd/, `${label} monthly_hard_stop_usd`);
    assert.doesNotMatch(text, /Public beta/, `${label} Public beta`);
    for (const link of text.match(paypal) || []) {
      assert.equal(link.toLowerCase(), "https://paypal.me/ryanphua17", `${label} donate link`);
    }
  }
});
