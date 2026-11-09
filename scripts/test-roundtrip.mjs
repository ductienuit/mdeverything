#!/usr/bin/env node
// Round trip of the AI export format, per built language page:
//   build the bundle (with "Answer each comment" on) → a sample AI answer (a quote edit, Replace/With, a question)
//   → parse it → every answer must reach the right note with the right edit kind.
// The functions are taken from the BUILT page (index.html, <dir>/index.html) and run in a vm sandbox,
// so this tests exactly what ships, including the embedded dictionary. Run after `node scripts/build.mjs`.
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import assert from "node:assert/strict";
import { LOCALES } from "./locales.mjs";
import { rel, readText } from "./i18n-lib.mjs";

const NEED = ["sourceLine", "buildBundle", "aiHash36", "aiNoteIds", "aiLatest", "aiEdits", "expRequests",
  "aiEditsSummary", "aiHowToAnswer", "aiHeadText", "aiCleanSection", "aiHeading", "aiTidy", "aiPartText",
  "aiUnfence", "aiEmptyMarker", "aiUnwrapSuggest", "aiBuildEdits", "aiParseAnswer", "aiEditsKey", "aiMatch"];

// source of `function name(…){…}` (brace matching that skips strings, template literals, regex literals and comments)
function extractFunction(src, name) {
  const start = src.search(new RegExp(`\\nfunction ${name}\\(`));
  if (start < 0) throw new Error(`function ${name} not found`);
  let i = src.indexOf("{", src.indexOf(")", start)), depth = 0;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === '"' || c === "'" || c === "`") { const q = c; for (i++; i < src.length && src[i] !== q; i++) if (src[i] === "\\") i++; continue; }
    if (c === "/" && src[i + 1] === "/") { i = src.indexOf("\n", i); continue; }
    if (c === "/" && src[i + 1] === "*") { i = src.indexOf("*/", i) + 1; continue; }
    if (c === "/") {                                   // regex literal after an operator / bracket
      const prev = src.slice(0, i).replace(/\s+$/, "").slice(-1);
      if (/[(,=:[!&|?{};+]/.test(prev)) {
        let inClass = false;
        for (i++; i < src.length; i++) {
          if (src[i] === "\\") { i++; continue; }
          if (src[i] === "[") inClass = true; else if (src[i] === "]") inClass = false;
          else if (src[i] === "/" && !inClass) break;
        }
        continue;
      }
    }
    if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return src.slice(start + 1, i + 1);
  }
  throw new Error(`unbalanced function ${name}`);
}
function between(src, a, b) {
  const i = src.indexOf(a); if (i < 0) throw new Error(`marker not found: ${a}`);
  const j = src.indexOf(b, i); if (j < 0) throw new Error(`marker not found: ${b}`);
  return src.slice(i, j);
}

function sandboxFor(file) {
  const html = readText(file);
  const json = id => html.match(new RegExp(`<script type="application/json" id="${id}">([\\s\\S]*?)</script>`))[1];
  const main = html.match(/<script>\n"use strict";([\s\S]*?)<\/script>/)[1];
  const code = [
    between(main, "const I18N = ", "/* ============ state ============ */"),
    "let SRC = '', ANN = [];",
    between(main, "const HEAD={", "function sourceLine"),
    "const AI_FENCE_RE=" + main.match(/const AI_FENCE_RE=(.*);/)[1] + ";",
    "function aiExportFmtOn(){ return true; }",
    "const annById = id => ANN.find(a => a.id === id);",
    ...NEED.map(n => extractFunction(main, n)),
    "globalThis.api = { buildBundle, aiParseAnswer, aiMatch, aiNoteIds, t, LANG, I18N, set(src, ann){ SRC = src; ANN = ann; } };",
  ].join("\n");
  const ctx = { document: { getElementById: id => ({ textContent: json(id) }) }, Intl, console };
  vm.createContext(ctx);
  vm.runInContext(code, ctx, { filename: file });
  return ctx.api;
}

let failures = 0;
for (const loc of LOCALES) {
  const file = rel(loc.dir || "", "index.html");
  try {
    const api = sandboxFor(file);
    assert.equal(api.LANG, loc.htmlLang, "page language");
    const SRC = [
      "# Pricing", "",
      "Free for teams of up to 5 people. Billing starts on day one for everyone else.", "",
      "## Limits", "",
      "Each workspace keeps 10 documents. Old drafts are removed after 30 days.", "",
      "Contact sales for more seats.",
    ].join("\n");
    const ANN = [
      { id: "a1", quote: "Billing starts on day one", note: "Is that right? I thought there's a 14-day trial.", replies: [], section: "Pricing", prefix: "people. ", suffix: " for everyone", createdAt: new Date(2026, 10, 9, 14, 5).getTime() },
      { id: "a2", quote: "Old drafts are removed after 30 days", note: "Make this 60 days.", replies: [{ text: "Agreed." }], section: "Limits", prefix: "", suffix: "" },
      { id: "a3", quote: "Contact sales", note: "Who do we contact exactly?", replies: [], section: "Limits", prefix: "", suffix: "" },
    ];
    api.set(SRC, ANN);
    const bundle = api.buildBundle(true, { answer: true });
    const ids = api.aiNoteIds();
    // the AI instructions stay English everywhere; labels are localized
    assert.match(bundle, /^You are reviewing a Markdown document/, "English instructions");
    assert.match(bundle, /===== HOW TO ANSWER =====/);
    assert.match(bundle, /===== DOCUMENT \(markdown\) =====/);
    ANN.forEach((a, i) => assert.ok(bundle.includes(`[${i + 1}] {#${ids.get(a.id)}}`), `note ${a.id} has its id`));
    assert.ok(!/\[(?:NEW|FOLLOW-UP|ANSWERED)\]/.test(bundle), "no round tags");
    const locLines = bundle.split("\n").filter(l => /^\[\d+\]/.test(l));
    assert.ok(locLines[0].endsWith(" · 2026-11-09 14:05"), "created time on the note's Location line");
    assert.ok(!/\d{4}-\d\d-\d\d \d\d:\d\d/.test(locLines[1]), "no time for a note without createdAt");
    assert.ok(!/REVIEWER'S INSTRUCTIONS/.test(bundle), "no requests section when nothing was asked");
    // extra instructions + "mark the edits" go at the top of the instructions; without answers: no ids, no HOW TO ANSWER
    const asked = api.buildBundle(true, { mark: true, extra: "Keep my tone" });
    assert.match(asked, /===== REVIEWER'S INSTRUCTIONS =====\n\nKeep my tone\n\n/);
    assert.ok(asked.includes(api.t("exp2.markPrompt")), "localized mark-the-edits sentence");
    assert.ok(asked.indexOf("REVIEWER'S INSTRUCTIONS") < asked.indexOf("===== DOCUMENT"), "requests before the document");
    assert.ok(!/\{#n/.test(asked) && !/HOW TO ANSWER/.test(asked), "plain format without answers");
    assert.ok(bundle.includes(api.t("bundle.quoted")), "localized 'Quoted passage' label");
    assert.ok(bundle.includes(api.t("bundle.replies", { n: 1 })), "localized 'Replies' label");
    if (loc.code === "en") assert.ok(!/UI language is/.test(bundle), "no UI-language line in English");
    else assert.ok(bundle.includes(`The reviewer's UI language is ${loc.nativeName}.`), "UI-language line");

    const answer = [
      "Here you go:", "",
      "````mdeverything",
      `## [1] {#${ids.get("a1")}}`,
      "Paid plans start with a 14-day trial.",
      "### Suggested edit",
      "Billing starts after a 14-day free trial",
      "",
      `## [2] {#${ids.get("a2")}}`,
      "Updated the retention period.",
      "### Replace",
      "Old drafts are removed after 30 days.",
      "### With",
      "Old drafts are removed after 60 days.",
      "",
      `## [3] {#${ids.get("a3")}}`,
      "Write to sales@example.com.",
      "",
      "## General",
      "Looks good overall.",
      "````",
    ].join("\n");
    const parsed = api.aiParseAnswer(answer);
    assert.equal(parsed.answers.length, 3, "3 answers parsed");
    assert.equal(parsed.general, "Looks good overall.");
    const items = api.aiMatch(parsed);
    const byNote = Object.fromEntries(items.map(it => [it.a && it.a.id, it]));
    assert.equal(items.map(it => it.status).join(), "ok,ok,ok", "all matched");
    assert.equal(byNote.a1.edits.length, 1); assert.equal(byNote.a1.edits[0].kind, "quote");
    assert.equal(byNote.a1.edits[0].text, "Billing starts after a 14-day free trial");
    assert.equal(byNote.a2.edits.length, 1); assert.equal(byNote.a2.edits[0].kind, "replace");
    assert.equal(byNote.a2.edits[0].find, "Old drafts are removed after 30 days.");
    assert.equal(byNote.a3.edits.length, 0, "a question gets no edit");
    assert.equal(byNote.a3.text, "Write to sales@example.com.");
    // a number-only heading still matches (and a wrong id is reported, not attached)
    const p2 = api.aiParseAnswer("```mdeverything\n## [2]\nSure.\n## [9] {#nzzzz}\nNope.\n```");
    const m2 = api.aiMatch(p2);
    assert.equal(m2[0].a.id, "a2"); assert.equal(m2[0].how, "number");
    assert.equal(m2[1].status, "nomatch");
    console.log(`ok   ${loc.code}  (${path.relative(rel(), file)})`);
  } catch (e) {
    failures++;
    console.error(`FAIL ${loc.code}: ${e.message}`);
  }
}
process.exit(failures ? 1 : 0);
