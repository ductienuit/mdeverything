#!/usr/bin/env node
// Checks every locale in scripts/locales.mjs against locales/en.json:
//   missing / extra keys, placeholder mismatch ({name}, {n, plural, …}), malformed plurals,
//   HTML tags in *_html keys, and the demo sample (each annotation quote occurs exactly once).
// Exit code 1 on any error.   node scripts/check-locales.mjs
import fs from "node:fs";
import { LOCALES, DEFAULT_LOCALE } from "./locales.mjs";
import { rel, loadLocale, messageArgs, messageTags, samplePaths, readText } from "./i18n-lib.mjs";

let errors = 0, warnings = 0;
const err = m => { errors++; console.error("error: " + m); };
const warn = m => { warnings++; console.warn("warning: " + m); };

const EN = loadLocale(DEFAULT_LOCALE);
if (!EN) { console.error(`locales/${DEFAULT_LOCALE}.json is missing`); process.exit(1); }
const enArgs = {};
for (const [k, v] of Object.entries(EN)) {
  try { enArgs[k] = messageArgs(v).join(","); } catch (e) { err(`${DEFAULT_LOCALE}: ${k}: ${e.message}`); }
}

function checkSample(code) {
  const p = samplePaths(code);
  const hasMd = fs.existsSync(p.md), hasAnn = fs.existsSync(p.ann);
  if (!hasMd && !hasAnn) { if (code !== DEFAULT_LOCALE) warn(`${code}: no demo sample (the ${DEFAULT_LOCALE} demo is used)`); return; }
  if (hasMd !== hasAnn) { err(`${code}: samples need both ${code}.md and ${code}.annotations.json`); return; }
  const md = readText(p.md);
  let notes;
  try { notes = JSON.parse(readText(p.ann)); } catch (e) { err(`${code}.annotations.json: ${e.message}`); return; }
  if (!Array.isArray(notes)) { err(`${code}.annotations.json must be an array`); return; }
  notes.forEach((n, i) => {
    const where = `${code}.annotations.json #${i + 1}`;
    if (!n || typeof n.quote !== "string" || !n.quote) return err(`${where}: missing "quote"`);
    if (typeof n.note !== "string" || !n.note.trim()) err(`${where}: missing "note"`);
    if (n.kind === "diagram") {   // a note on a Mermaid shape: its label + source line live in a ```mermaid block
      const blocks = [...md.matchAll(/^```mermaid[^\n]*\n([\s\S]*?)^```/gm)].map(m => m[1]);
      const b = blocks[n.diagram | 0];
      if (!b) return err(`${where}: diagram ${(n.diagram | 0) + 1} not found in ${code}.md`);
      if (!b.includes(n.label || n.quote)) err(`${where}: label not in diagram ${(n.diagram | 0) + 1}: "${n.label || n.quote}"`);
      if (n.mermaidLine && !b.includes(n.mermaidLine)) err(`${where}: mermaidLine not in diagram ${(n.diagram | 0) + 1}: "${n.mermaidLine}"`);
      return;
    }
    const count = md.split(n.quote).length - 1;
    if (count !== 1) err(`${where}: quote must occur exactly once in ${code}.md (found ${count}): "${n.quote}"`);
    if (/[*`|\[\]\n]/.test(n.quote)) err(`${where}: quote must be plain rendered text (no Markdown syntax / newline): "${n.quote}"`);
    (n.replies || []).forEach((r, j) => {
      if (typeof r === "string") return;
      if (!r || typeof r.text !== "string") return err(`${where} reply ${j + 1}: needs "text"`);
      (r.edits || []).forEach(e => { if (e.kind === "quote" && e.text === n.quote) err(`${where}: AI edit text equals the quote`); });
    });
  });
}

const known = new Set(LOCALES.map(l => l.code));
for (const f of fs.readdirSync(rel("locales"))) {
  if (f.endsWith(".json") && !known.has(f.slice(0, -5))) warn(`locales/${f} is not listed in scripts/locales.mjs (it is not built)`);
}
for (const loc of LOCALES) {
  checkSample(loc.code);
  if (loc.code === DEFAULT_LOCALE) continue;
  let L;
  try { L = loadLocale(loc.code); } catch (e) { err(`${loc.code}.json: ${e.message}`); continue; }
  if (!L) { err(`locales/${loc.code}.json is missing`); continue; }
  const missing = Object.keys(EN).filter(k => !(k in L));
  const extra = Object.keys(L).filter(k => !(k in EN));
  missing.forEach(k => err(`${loc.code}: missing key ${k}`));
  extra.forEach(k => err(`${loc.code}: extra key ${k} (not in ${DEFAULT_LOCALE}.json)`));
  for (const [k, v] of Object.entries(L)) {
    if (!(k in EN)) continue;
    if (!v.trim()) { err(`${loc.code}: ${k} is empty`); continue; }
    let a;
    try { a = messageArgs(v).join(","); } catch (e) { err(`${loc.code}: ${k}: ${e.message}`); continue; }
    if (a !== enArgs[k]) err(`${loc.code}: ${k}: placeholders [${a}] ≠ English [${enArgs[k]}]`);
    if (k.endsWith("_html") && messageTags(v).join() !== messageTags(EN[k]).join()) err(`${loc.code}: ${k}: HTML tags differ from English`);
    for (const sep of [" · ", " — "]) if (EN[k].startsWith(sep) && !v.startsWith(sep)) warn(`${loc.code}: ${k} should start with "${sep}" like English`);
  }
}
console.log(`check-locales: ${LOCALES.map(l => l.code).join(", ")} — ${errors} error(s), ${warnings} warning(s)`);
process.exit(errors ? 1 : 0);
