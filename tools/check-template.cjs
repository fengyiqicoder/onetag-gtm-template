#!/usr/bin/env node
// Offline checks for template.tpl. No dependencies. Run: node tools/check-template.cjs
// 1. The sections exist, in order, and the JSON ones parse.
// 2. INFO, parameters and permissions have what the Gallery needs.
// 3. The sandboxed JS runs in Node with stand-ins for the GTM APIs, and every
//    ___TESTS___ scenario passes (mock, runCode, assertThat, assertApi).
// 4. Every URL the code builds matches the inject_script permission.
// This is not GTM. Import the template in GTM and run its Tests tab before you ship.
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const assert = require("node:assert");

const file = process.argv[2] || path.join(__dirname, "..", "template.tpl");
const text = fs.readFileSync(file, "utf8").replace(/^﻿/, "");
let failed = 0;
const ok = (name, fn) => {
  try { fn(); console.log("ok    " + name); } catch (e) { failed++; console.log("FAIL  " + name + "\n      " + e.message); }
};

const ORDER = ["___TERMS_OF_SERVICE___", "___INFO___", "___TEMPLATE_PARAMETERS___", "___SANDBOXED_JS_FOR_WEB_TEMPLATE___", "___WEB_PERMISSIONS___", "___TESTS___", "___NOTES___"];
const sections = {};
const found = [];
const parts = text.split(/^(___[A-Z_]+___)\s*$/m);
for (let i = 1; i < parts.length; i += 2) { found.push(parts[i]); sections[parts[i]] = parts[i + 1].trim(); }

ok("sections present and in order", () => assert.deepStrictEqual(found, ORDER));
let info, params, perms;
ok("INFO is JSON", () => { info = JSON.parse(sections.___INFO___); });
ok("TEMPLATE_PARAMETERS is JSON", () => { params = JSON.parse(sections.___TEMPLATE_PARAMETERS___); });
ok("WEB_PERMISSIONS is JSON", () => { perms = JSON.parse(sections.___WEB_PERMISSIONS___); });

ok("INFO fields", () => {
  assert.strictEqual(info.type, "TAG");
  assert.strictEqual(info.id, "cvt_temp_public_id");
  assert.deepStrictEqual(info.categories, ["CHAT"]);
  assert.deepStrictEqual(info.containerContexts, ["WEB"]);
  assert.ok(info.displayName && info.description && info.brand && info.brand.thumbnail.startsWith("data:image/png;base64,"));
});
ok("parameters: siteKey, label, position, color, lang", () => {
  assert.deepStrictEqual(params.map((p) => p.name), ["siteKey", "label", "position", "color", "lang"]);
  for (const p of params) for (const v of p.valueValidators || []) if (v.type === "REGEX") new RegExp(v.args[0]);
  const keyRe = new RegExp(params[0].valueValidators.find((v) => v.type === "REGEX").args[0]);
  assert.ok(keyRe.test("ot_demo000000000000000000000") && !keyRe.test("demo"));
});

let patterns = [];
ok("only permission is inject_script for https://onetagai.com/ask-docs.js*", () => {
  assert.strictEqual(perms.length, 1);
  assert.strictEqual(perms[0].instance.key.publicId, "inject_script");
  patterns = perms[0].instance.param.find((p) => p.key === "urls").value.listItem.map((l) => l.string);
  assert.deepStrictEqual(patterns, ["https://onetagai.com/ask-docs.js*"]);
});
// GTM URL patterns: scheme and host exact, "*" in the path is a wildcard.
const escapeRe = (s) => s.replace(/[.?+^$()[\]{}|\\]/g, "\\$&");
const allowed = (url) => patterns.some((p) => new RegExp("^" + escapeRe(p).replace(/\*/g, ".*") + "$").test(url));

// Minimal GTM sandbox stand-ins.
function sandbox() {
  const calls = {};
  const mocks = {};
  const injected = [];
  const record = (name, args) => { (calls[name] = calls[name] || []).push(args); };
  const real = {
    encodeUriComponent: (s) => encodeURIComponent(s),
    makeString: (v) => String(v),
    queryPermission: (perm, url) => perm === "inject_script" && allowed(url),
    injectScript: (url, onSuccess) => { onSuccess(); },
  };
  const requireApi = (name) => {
    if (!(name in real)) throw new Error("require('" + name + "') is not a GTM API this checker knows");
    return (...args) => {
      record(name, args);
      if (name === "injectScript") injected.push(args[0]);
      return (mocks[name] || real[name])(...args);
    };
  };
  const runCode = (data) => {
    const d = Object.assign({}, data, {
      gtmOnSuccess: (...a) => record("gtmOnSuccess", a),
      gtmOnFailure: (...a) => record("gtmOnFailure", a),
    });
    vm.runInNewContext(sections.___SANDBOXED_JS_FOR_WEB_TEMPLATE___, { require: requireApi, data: d });
  };
  const assertThat = (actual) => ({
    isEqualTo: (want) => assert.deepStrictEqual(actual, want),
    isNotEqualTo: (want) => assert.notDeepStrictEqual(actual, want),
    hasLength: (n) => assert.strictEqual(actual.length, n),
  });
  const assertApi = (name) => ({
    wasCalled: () => assert.ok(calls[name], name + " was not called"),
    wasNotCalled: () => assert.ok(!calls[name], name + " was called"),
  });
  const mock = (name, fn) => { mocks[name] = fn; };
  return { runCode, assertThat, assertApi, mock, injected };
}

const scenarios = sections.___TESTS___.split(/^- name: /m).slice(1).map((chunk) => {
  const name = chunk.split("\n")[0].trim();
  const body = chunk.split(/\n  code: \|-\n/)[1].split(/\nsetup:/)[0];
  const code = body.split("\n").map((l) => l.replace(/^ {4}/, "")).join("\n");
  return { name, code };
});
ok("___TESTS___ has scenarios", () => assert.ok(scenarios.length >= 3));
const urls = [];
for (const s of scenarios) {
  ok("scenario: " + s.name, () => {
    const box = sandbox();
    vm.runInNewContext(s.code, box);
    urls.push(...box.injected);
  });
}

// Built URLs for sample inputs, with the default injectScript stand-in (no mocks).
const samples = [
  { siteKey: "ot_demo000000000000000000000", position: "auto", lang: "" },
  { siteKey: "ot_abc", label: "Ask our docs", position: "float", color: "#0F766E", lang: "zh-TW" },
  { siteKey: "ot_abc", label: "Frag & Antwort / 100%", position: "none" },
];
for (const data of samples) {
  const box = sandbox();
  box.runCode(data);
  console.log("built " + box.injected[0]);
  urls.push(...box.injected);
}
ok("every built URL is allowed by the permission and parses back to the inputs", () => {
  assert.ok(urls.length > 0);
  for (const u of urls) {
    assert.ok(allowed(u), u + " is not allowed");
    const q = new URL(u);
    assert.strictEqual(q.origin + q.pathname, "https://onetagai.com/ask-docs.js");
    assert.strictEqual(q.searchParams.get("ref"), "gtm");
    assert.ok(/^ot_/.test(q.searchParams.get("key")));
  }
  assert.strictEqual(new URL(urls[urls.length - 1]).searchParams.get("label"), "Frag & Antwort / 100%");
});
ok("a URL outside the permission is refused", () => {
  assert.ok(!allowed("https://evil.example/ask-docs.js") && !allowed("https://onetagai.com/other.js"));
});

console.log(failed ? failed + " failed" : "all checks passed");
process.exit(failed ? 1 : 0);
