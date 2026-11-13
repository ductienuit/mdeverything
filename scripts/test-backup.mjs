#!/usr/bin/env node
// Round trip of the Markdown backup (.mdeverything.md), per built language page:
//   documents with tricky content → libBkSerialize → libBkParse → identical text, notes and replies.
//   Also: a plain document that only mentions the markers stays plain; without the exact copy the
//   readable section rebuilds notes + replies; several documents come back in order.
// The functions are taken from the BUILT page and run in a vm sandbox. Run after `node scripts/build.mjs`.
import path from "node:path";
import vm from "node:vm";
import assert from "node:assert/strict";
import { LOCALES } from "./locales.mjs";
import { rel, readText } from "./i18n-lib.mjs";

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
    between(main, "/* ---------- the Markdown backup (.mdeverything.md)", "function libDownload("),
    "globalThis.api = { libBkSerialize, libBkParse, libBkIsBackup, libBkCounts, t, LANG };",
  ].join("\n");
  const ctx = { document: { getElementById: id => ({ textContent: json(id) }) }, Intl, console, Date };
  vm.createContext(ctx);
  vm.runInContext(code, ctx, { filename: file });
  return ctx.api;
}
const plain = x => JSON.parse(JSON.stringify(x));

const SRC = [
  "# Kế hoạch ra mắt — tiếng Việt có dấu",
  "",
  "Mục tiêu: giảm thời gian review -- từ 3 ngày xuống 1 ngày --> rồi đo lại.",
  "",
  "<!-- a real HTML comment in the document -->",
  "",
  "## Bảng",
  "",
  "| Cột A | Cột B |",
  "|---|---|",
  "| `a -- b` | <!-- x --> |",
  "",
  "```js",
  "const s = \"<!-- mdeverything:data {} -->\"; // not a marker: inside a string",
  "```",
  "",
  "```mermaid",
  "flowchart LR",
  "  A[Viết] --> B[Review]",
  "```",
  "",
  "Mentions `<!-- mdeverything:review v1 -->` inline only.",
  "",
].join("\n");
const T0 = new Date(2026, 10, 12, 9, 30).getTime();
const ANN = [
  { id: "n2", quote: "rồi đo lại", prefix: "1 ngày --> ", suffix: ".", note: "Đo bằng gì? -- KPI nào?\n\n<!-- mdeverything:review v1 -->\n```\ncode -->\n```",
    createdAt: T0, editedAt: T0 + 60000,
    replies: [
      { id: "r1", text: "Dùng thời gian trung bình.", ts: T0 + 120000 },
      { id: "r2", text: "Đề xuất: đo **lead time** --> báo cáo tuần.", ts: T0 + 180000, by: "ai", round: 1,
        edits: [{ kind: "quote", text: "rồi đo lead time mỗi tuần", state: "accepted", at: T0 + 200000, rs: [1, 2] },
                { kind: "replace", find: "3 ngày", text: "72 giờ" }] },
      { id: "r3", text: "Thêm vòng 2?", ts: T0 + 240000, editedAt: T0 + 250000 },
      { id: "r4", text: "Vòng 2: giữ nguyên.", ts: T0 + 300000, by: "ai", round: 2, nh: "abc" },
    ] },
  { id: "n1", quote: "Kế hoạch ra mắt", prefix: "", suffix: " — tiếng", note: "Title ok?", createdAt: T0 - 1000, replies: [] },
  { id: "d1", kind: "diagram", diagram: 0, label: "Review", quote: "Review", shape: "node", mermaidLine: "  A[Viết] --> B[Review]",
    prefix: "", suffix: "", note: "", replies: [{ id: "r5", text: "Node label fine.", ts: T0 + 5 }] },
];
const DOC = { name: "Kế hoạch \"Q4\" -- v2.md", src: SRC, ann: ANN, createdAt: new Date(T0).toISOString(), updatedAt: new Date(T0 + 9e5).toISOString() };

let failures = 0;
for (const loc of LOCALES) {
  const file = rel(loc.dir || "", "index.html");
  try {
    const api = sandboxFor(file);
    // single document: exact round trip
    const out = api.libBkSerialize([DOC], false);
    assert.ok(out.startsWith(SRC + "\n\n<!-- mdeverything:review v1 -->\n"), "document first, then the review block");
    const dataLine = out.split("\n").find(l => l.startsWith("<!-- mdeverything:data "));
    assert.ok(dataLine && !dataLine.slice(4, -3).includes("--"), "no '--' inside the data comment");
    const OPEN = "\n<!-- mdeverything:review v1 -->\n", review = out.slice(out.indexOf(OPEN) + OPEN.length, out.indexOf("\n<!-- /mdeverything:review -->"));
    assert.ok(!review.includes("<!--"), "nothing in the readable section opens an HTML comment");
    assert.ok(review.includes("## " + api.t("lib.bkHeading")), "localized heading");
    assert.ok(review.includes(api.t("lib.bkAi", { n: 2 })), "AI round label");
    assert.ok(review.indexOf("Title ok?") < review.indexOf("Đo bằng gì?"), "notes in document order");
    const p = api.libBkParse(out);
    assert.ok(p && p.docs.length === 1 && p.rebuilt === 0, "one document, exact");
    assert.equal(p.docs[0].src, SRC, "Markdown identical");
    assert.equal(p.docs[0].name, DOC.name);
    assert.deepEqual(plain(p.docs[0].ann), plain(ANN), "notes + replies identical");
    assert.deepEqual(plain(api.libBkCounts(p.docs)), { docs: 1, notes: 3, replies: 5 });
    // CRLF (e.g. saved by a Windows editor) still restores
    const crlf = api.libBkParse(out.replace(/\n/g, "\r\n"));
    assert.deepEqual(plain(crlf.docs[0].ann), plain(ANN), "CRLF: notes identical");
    assert.equal(crlf.docs[0].src, SRC.replace(/\n/g, "\r\n"), "CRLF: text kept as saved");
    // a plain document that only mentions the markers is not a backup
    assert.equal(api.libBkParse(SRC), null, "plain Markdown stays plain");
    assert.equal(api.libBkIsBackup("# Hi\n\nNo markers."), false);
    // several documents
    const DOC2 = { name: "Second", src: "# Two\n\nShort.\n\n\n", ann: [], createdAt: DOC.createdAt, updatedAt: DOC.updatedAt };
    const multi = api.libBkSerialize([DOC, DOC2], true);
    assert.ok(multi.startsWith('<!-- mdeverything:doc name="'), "doc markers");
    const pm = api.libBkParse(multi);
    assert.equal(pm.docs.length, 2);
    assert.equal(pm.docs[0].src, SRC); assert.equal(pm.docs[1].src, DOC2.src);
    assert.equal(pm.docs[0].name, DOC.name); assert.equal(pm.docs[1].name, "Second");
    assert.deepEqual(plain(pm.docs[0].ann), plain(ANN));
    // no exact copy → rebuilt from the readable section
    const noData = out.split("\n").filter(l => !l.startsWith("<!-- mdeverything:data ")).join("\n");
    const pr = api.libBkParse(noData);
    assert.ok(pr && pr.rebuilt === 1, "rebuilt");
    assert.equal(pr.docs[0].src, SRC);
    const byQuote = Object.fromEntries(pr.docs[0].ann.map(a => [a.quote, a]));
    assert.equal(byQuote["rồi đo lại"].note, ANN[0].note, "note text rebuilt (incl. '<!--')");
    assert.equal(byQuote["rồi đo lại"].replies.length, 4);
    assert.equal(byQuote["rồi đo lại"].replies[1].text, ANN[0].replies[1].text, "AI reply text without the edit");
    assert.equal(byQuote["rồi đo lại"].replies[1].by, "ai"); assert.equal(byQuote["rồi đo lại"].replies[3].round, 2);
    assert.equal(byQuote["rồi đo lại"].replies[0].ts, T0 + 120000, "reply time (minute precision)");
    assert.equal(byQuote["rồi đo lại"].createdAt, T0);
    assert.equal(byQuote["Review"].note, "", "empty note stays empty");
    assert.equal(byQuote["Kế hoạch ra mắt"].note, "Title ok?");
    console.log(`ok   ${loc.code}  (${path.relative(rel(), file)})`);
  } catch (e) {
    failures++;
    console.error(`FAIL ${loc.code}: ${e.stack || e.message}`);
  }
}
process.exit(failures ? 1 : 0);
