// Shared helpers for build.mjs, check-locales.mjs and test-roundtrip.mjs (Node, no dependencies).
import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { LOCALES, DEFAULT_LOCALE } from "./locales.mjs";

export const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..");
export const rel = (...p) => path.join(ROOT, ...p);
export const readText = f => fs.readFileSync(f, "utf8").replace(/\r\n?/g, "\n");

// { a: { b: "x" } } → { "a.b": "x" }
export function flatten(obj, pre = "", out = {}) {
  for (const [k, v] of Object.entries(obj || {})) {
    const key = pre ? pre + "." + k : k;
    if (v && typeof v === "object" && !Array.isArray(v)) flatten(v, key, out);
    else if (typeof v === "string") out[key] = v;
    else throw new Error(`${key}: values must be strings (got ${Array.isArray(v) ? "array" : typeof v})`);
  }
  return out;
}

export function localeFile(code) { return rel("locales", code + ".json"); }
export function loadLocale(code) {
  const f = localeFile(code);
  if (!fs.existsSync(f)) return null;
  return flatten(JSON.parse(readText(f)));
}
export function defaultLocale() { return LOCALES.find(l => l.code === DEFAULT_LOCALE); }

// Message syntax (same as t() in src/index.html): "{name}" and
// "{n, plural, one {# x} other {# xs}}" / "{v, select, a {…} other {…}}".
// Returns the AST; throws on malformed plural / select blocks.
export function parseMessage(s) {
  let i = 0;
  const seq = inBranch => {
    const out = []; let buf = "";
    const flush = () => { if (buf) { out.push(buf); buf = ""; } };
    while (i < s.length) {
      const c = s[i];
      if (inBranch && c === "}") break;
      if (inBranch && c === "#") { flush(); out.push({ hash: true }); i++; continue; }
      if (c === "{") {
        const rest = s.slice(i);
        let m = /^\{\s*([A-Za-z_]\w*)\s*\}/.exec(rest);
        if (m) { flush(); out.push({ arg: m[1] }); i += m[0].length; continue; }
        m = /^\{\s*([A-Za-z_]\w*)\s*,\s*(plural|select)\s*,/.exec(rest);
        if (m) {
          flush(); i += m[0].length;
          const node = { arg: m[1], type: m[2], br: {} };
          for (;;) {
            while (i < s.length && /\s/.test(s[i])) i++;
            if (i >= s.length) throw new Error(`unclosed {${m[1]}, ${m[2]}, …}`);
            if (s[i] === "}") { i++; break; }
            const k = /^(=\d+|[A-Za-z]+)\s*\{/.exec(s.slice(i));
            if (!k) throw new Error(`bad branch in {${m[1]}, ${m[2]}, …} near "${s.slice(i, i + 20)}"`);
            i += k[0].length;
            node.br[k[1]] = seq(true);
            if (s[i] !== "}") throw new Error(`unclosed branch "${k[1]}" in {${m[1]}, ${m[2]}, …}`);
            i++;
          }
          if (!node.br.other) throw new Error(`{${m[1]}, ${m[2]}, …} needs an "other" branch`);
          out.push(node); continue;
        }
      }
      buf += c; i++;
    }
    flush();
    return out;
  };
  const ast = seq(false);
  if (i < s.length) throw new Error(`unexpected "}" at ${i}`);
  return ast;
}
// sorted, de-duplicated names of every parameter a message uses ({name}, {n, plural, …}, nested)
export function messageArgs(s) {
  const names = new Set();
  const walk = ast => ast.forEach(n => {
    if (typeof n === "string" || n.hash) return;
    names.add(n.arg + (n.type ? ":" + n.type : ""));
    if (n.br) Object.values(n.br).forEach(walk);
  });
  walk(parseMessage(s));
  return [...names].sort();
}
// HTML tag names used in an _html message (to compare translations with English)
export function messageTags(s) {
  return (s.match(/<\/?[a-zA-Z][\w-]*/g) || []).map(x => x.toLowerCase()).sort();
}

export function samplePaths(code) {
  return { md: rel("locales", "samples", code + ".md"), ann: rel("locales", "samples", code + ".annotations.json") };
}
// the demo for a language: its own pair of files, else the default language's
export function loadSample(code) {
  let p = samplePaths(code), fallback = false;
  if (!fs.existsSync(p.md) || !fs.existsSync(p.ann)) { p = samplePaths(DEFAULT_LOCALE); fallback = code !== DEFAULT_LOCALE; }
  const md = readText(p.md).replace(/\n$/, "");
  const notes = JSON.parse(readText(p.ann));
  return { md, notes, fallback };
}
