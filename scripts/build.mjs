#!/usr/bin/env node
// Builds one static page per language from src/index.html + locales/*.json:
//   index.html (default language), <dir>/index.html for the others, sitemap.xml.
//   node scripts/build.mjs           write the files
//   node scripts/build.mjs --check   exit 1 if a generated file is out of date (nothing is written)
// No dependencies. Missing keys fall back to English (with a warning).
//
// Template mechanisms (src/index.html):
//   data-i18n="key"                 element content = translation (escaped; keys ending in _html are inserted as HTML)
//   data-i18n-attr="title:key;aria-label:key;placeholder:key"   attribute values
//   <!--t:key-->English<!--/t-->    a run of text inside mixed content (icons + text)
//   {{t:key}} (HTML-escaped), {{css:key}} (inside a CSS string), and page placeholders ({{canonical}} …)
import fs from "node:fs";
import path from "node:path";
import { LOCALES, DEFAULT_LOCALE, SITE_URL, SITE_LASTMOD } from "./locales.mjs";
import { rel, readText, loadLocale, loadSample, parseMessage } from "./i18n-lib.mjs";

const CHECK = process.argv.includes("--check");
const QUIET = process.argv.includes("--quiet");
const warns = [];
const warn = m => warns.push(m);
const fail = m => { console.error("build: " + m); process.exit(1); };

const escHtml = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escAttr = s => escHtml(s).replace(/"/g, "&quot;").replace(/\n/g, "&#10;");
const escCss = s => String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\A ");
// JSON safe inside <script>: no "</script", no U+2028/2029
const LS = String.fromCharCode(0x2028), PS = String.fromCharCode(0x2029);
const jsonScript = v => JSON.stringify(v).replace(/</g, "\\u003c").split(LS).join("\\u2028").split(PS).join("\\u2029");

const def = LOCALES.find(l => l.code === DEFAULT_LOCALE);
if (!def) fail(`DEFAULT_LOCALE "${DEFAULT_LOCALE}" is not in LOCALES`);
if (def.dir) fail("the default language must be built at the site root (dir: \"\")");
const EN = loadLocale(DEFAULT_LOCALE);
if (!EN) fail(`locales/${DEFAULT_LOCALE}.json is missing`);
for (const [k, v] of Object.entries(EN)) { try { parseMessage(v); } catch (e) { fail(`${DEFAULT_LOCALE}.json ${k}: ${e.message}`); } }

const TEMPLATE = readText(rel("src", "index.html"));
const pageUrl = l => SITE_URL + (l.dir ? l.dir + "/" : "");
const relHref = (from, to) => ((from.dir ? "../" : "") + (to.dir ? to.dir + "/" : "")) || "./";
const shortOf = l => l.short || l.code.split("-")[0].toUpperCase();

// ---------- keys the template uses (so a typo in a key is caught at build time) ----------
function templateKeys(tpl) {
  const keys = new Set();
  for (const m of tpl.matchAll(/data-i18n="([^"]+)"/g)) keys.add(m[1]);
  for (const m of tpl.matchAll(/data-i18n-attr="([^"]+)"/g)) m[1].split(";").forEach(p => keys.add(p.split(":")[1]));
  for (const m of tpl.matchAll(/<!--t:([\w.-]+)-->/g)) keys.add(m[1]);
  for (const m of tpl.matchAll(/\{\{(?:t|css):([\w.-]+)\}\}/g)) keys.add(m[1]);
  for (const m of tpl.matchAll(/\b(?:t|te)\("([\w.-]+)"/g)) if (!m[1].endsWith(".")) keys.add(m[1]);
  return keys;
}
const used = templateKeys(TEMPLATE);
for (const k of used) if (!(k in EN)) fail(`src/index.html uses "${k}", which is not in locales/${DEFAULT_LOCALE}.json`);

// ---------- markup filling ----------
function parseAttrs(s) {
  const out = [];
  const re = /([^\s=]+)(?:\s*=\s*"([^"]*)")?/g;
  let m;
  while ((m = re.exec(s))) out.push([m[1], m[2] === undefined ? null : m[2]]);
  return out;
}
function findClose(src, from, tag) {
  const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, "gi");
  re.lastIndex = from;
  let depth = 1, m;
  while ((m = re.exec(src))) {
    if (m[1]) { if (--depth === 0) return m.index; }
    else if (!/\/>$/.test(m[0])) depth++;
  }
  throw new Error(`no closing </${tag}> after offset ${from}`);
}
function fillMarkup(src, T) {
  let out = "", i = 0, n = 0;
  const tagRe = /<([a-zA-Z][\w-]*)((?:\s+[^\s=>\/]+(?:\s*=\s*"[^"]*")?)*)\s*(\/?)>/g;
  for (;;) {
    tagRe.lastIndex = i;
    const m = tagRe.exec(src);
    if (!m) { out += src.slice(i); break; }
    if (!/\sdata-i18n(-attr)?=/.test(m[2])) { out += src.slice(i, tagRe.lastIndex); i = tagRe.lastIndex; continue; }
    out += src.slice(i, m.index);
    const attrs = parseAttrs(m[2]);
    const get = name => { const a = attrs.find(x => x[0] === name); return a ? a[1] : null; };
    const key = get("data-i18n"), spec = get("data-i18n-attr");
    if (spec) for (const pair of spec.split(";")) {
      const [name, k] = pair.split(":").map(x => x.trim());
      const a = attrs.find(x => x[0] === name);
      if (a) a[1] = escAttr(T(k)); else attrs.push([name, escAttr(T(k))]);
    }
    const keep = attrs.filter(([k2]) => k2 !== "data-i18n" && k2 !== "data-i18n-attr");
    out += `<${m[1]}${keep.map(([a, v]) => v === null ? " " + a : ` ${a}="${v}"`).join("")}${m[3] ? "/" : ""}>`;
    i = tagRe.lastIndex; n++;
    if (key) {
      const close = findClose(src, i, m[1]);
      out += key.endsWith("_html") ? T(key) : escHtml(T(key));
      i = close;
    }
  }
  return { html: out, n };
}

// ---------- one page ----------
function buildPage(loc) {
  const own = loc.code === DEFAULT_LOCALE ? EN : loadLocale(loc.code);
  if (!own) fail(`locales/${loc.code}.json is missing (listed in scripts/locales.mjs)`);
  const dict = {};
  const missing = [];
  for (const k of Object.keys(EN)) {
    if (k in own && own[k] !== "") {
      try { parseMessage(own[k]); dict[k] = own[k]; }
      catch (e) { warn(`${loc.code}: ${k}: ${e.message} — using English`); dict[k] = EN[k]; }
    } else { dict[k] = EN[k]; missing.push(k); }
  }
  if (missing.length) warn(`${loc.code}: ${missing.length} missing key(s) use English: ${missing.slice(0, 8).join(", ")}${missing.length > 8 ? " …" : ""}`);
  const extra = Object.keys(own).filter(k => !(k in EN));
  if (extra.length) warn(`${loc.code}: ${extra.length} key(s) not in ${DEFAULT_LOCALE}.json are ignored: ${extra.slice(0, 8).join(", ")}`);
  const T = k => { if (!(k in dict)) fail(`unknown key "${k}"`); return dict[k]; };

  const sample = loadSample(loc.code);
  if (sample.fallback) warn(`${loc.code}: no locales/samples/${loc.code}.md + .annotations.json — the demo is in ${DEFAULT_LOCALE}`);
  sample.notes.forEach((n, i) => { if (!sample.md.includes(n.quote)) warn(`${loc.code}: sample note ${i + 1}: quote not found in the sample text: "${n.quote}"`); });

  const base = loc.dir ? "../" : "";
  const locales = LOCALES.map(l => ({ code: l.code, htmlLang: l.htmlLang, dir: l.textDir || "ltr", nativeName: l.nativeName, href: relHref(loc, l) }));
  const i18n = { lang: loc.htmlLang, code: loc.code, nativeName: loc.nativeName, base, locales, dict: {} };
  for (const [k, v] of Object.entries(dict)) if (!k.startsWith("meta.")) i18n.dict[k] = v;
  if (loc.code === DEFAULT_LOCALE) {           // the first-visit suggestion bar, written in each target language
    i18n.suggest = {};
    for (const l of LOCALES) {
      if (l.code === DEFAULT_LOCALE) continue;
      const d = loadLocale(l.code) || {};
      i18n.suggest[l.code] = { text: d["lang.suggest"] || EN["lang.suggest"], go: d["lang.suggestGo"] || EN["lang.suggestGo"], dismiss: d["lang.suggestDismiss"] || EN["lang.suggestDismiss"] };
    }
  }

  const check = '<svg class="ico mi-check" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  const langMenu = LOCALES.map(l => `        <a role="menuitemradio" href="${relHref(loc, l)}" hreflang="${l.hreflang}" lang="${l.htmlLang}" data-lang="${l.code}" aria-checked="${l === loc}"><span class="mi-txt">${escHtml(l.nativeName)}</span>${check}</a>`).join("\n");
  const langLinks = LOCALES.map(l => `<a href="${relHref(loc, l)}" hreflang="${l.hreflang}" lang="${l.htmlLang}" data-lang="${l.code}"${l === loc ? ' aria-current="page"' : ""}>${escHtml(l.nativeName)}</a>`).join("");
  const hreflang = LOCALES.map(l => `<link rel="alternate" hreflang="${l.hreflang}" href="${pageUrl(l)}">`)
    .concat(`<link rel="alternate" hreflang="x-default" href="${pageUrl(def)}">`).join("\n");
  const ogAlt = LOCALES.filter(l => l !== loc).map(l => `<meta property="og:locale:alternate" content="${l.ogLocale}">`).join("\n");
  let langRedirect = "";
  if (loc.code === DEFAULT_LOCALE && LOCALES.length > 1) {
    const map = Object.fromEntries(LOCALES.filter(l => l !== loc).map(l => [l.code, relHref(loc, l)]));
    // a saved, explicit language choice opens that page before anything paints (crawlers have no storage)
    langRedirect = `<script>(function(){try{var m=${JSON.stringify(map)},l=localStorage.getItem("marginalia:lang:v1");if(l&&m[l])location.replace(m[l]+location.search+location.hash);}catch(e){}})();</script>\n`;
  }
  const jsonld = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "mdeverything",
    alternateName: T("meta.ldAlternateName"),
    description: T("meta.ldDescription"),
    url: pageUrl(loc),
    image: SITE_URL + "og-image.png",
    screenshot: SITE_URL + "og-image.png",
    applicationCategory: "ProductivityApplication",
    operatingSystem: T("meta.ldOs"),
    browserRequirements: T("meta.ldBrowser"),
    isAccessibleForFree: true,
    inLanguage: loc.htmlLang,
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    featureList: Object.keys(EN).filter(k => /^meta\.ldFeature\d+$/.test(k)).map(T),
  }, null, 2).replace(/</g, "\\u003c");

  const vars = {
    htmlLang: loc.htmlLang, dir: loc.textDir || "ltr", canonical: pageUrl(loc), siteUrl: SITE_URL, base,
    hreflang, ogLocale: loc.ogLocale, ogLocaleAlternates: ogAlt, jsonld, langRedirect,
    langShort: escHtml(shortOf(loc)), langMenu, langLinks,
    i18nJson: jsonScript(i18n), sampleJson: jsonScript({ md: sample.md, notes: sample.notes }),
  };

  // markup: <body> up to the first <script> (all data-i18n lives there)
  let html = TEMPLATE;
  const b0 = html.indexOf("<body>"), b1 = html.indexOf("<script", b0);
  const filled = fillMarkup(html.slice(b0, b1), T);
  const expected = (html.slice(b0, b1).match(/\sdata-i18n(-attr)?="/g) || []).length;
  const got = (filled.html.match(/\sdata-i18n(-attr)?="/g) || []).length;
  if (got) fail(`${got} data-i18n attribute(s) were not processed (tag syntax?)`);
  if (!expected) fail("no data-i18n found in src/index.html");
  html = html.slice(0, b0) + filled.html + html.slice(b1);
  html = html.replace(/<!--t:([\w.-]+)-->[\s\S]*?<!--\/t-->/g, (_, k) => escHtml(T(k)));
  html = html.replace(/\{\{(t|css):([\w.-]+)\}\}/g, (_, kind, k) => kind === "css" ? escCss(T(k)) : escAttr(T(k)));
  html = html.replace(/\{\{(\w+)\}\}/g, (all, k) => { if (!(k in vars)) fail(`unknown placeholder ${all}`); return vars[k]; });
  if (/\{\{|<!--\/?t[:-]/.test(html.replace(/<script>[\s\S]*?<\/script>/g, ""))) fail("unfilled placeholder left in the page");
  return html;
}

// ---------- sitemap ----------
function sitemap() {
  const alts = LOCALES.map(l => `    <xhtml:link rel="alternate" hreflang="${l.hreflang}" href="${pageUrl(l)}"/>`)
    .concat(`    <xhtml:link rel="alternate" hreflang="x-default" href="${pageUrl(def)}"/>`).join("\n");
  const urls = LOCALES.map(l => `  <url>
    <loc>${pageUrl(l)}</loc>
    <lastmod>${SITE_LASTMOD}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>${l === def ? "1.0" : "0.9"}</priority>
${alts}
  </url>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls}
</urlset>
`;
}

// ---------- write / check ----------
const outputs = new Map();
for (const loc of LOCALES) outputs.set(path.join(loc.dir || "", "index.html"), buildPage(loc));
outputs.set("sitemap.xml", sitemap());

let stale = 0;
for (const [file, content] of outputs) {
  const abs = rel(file);
  const cur = fs.existsSync(abs) ? readText(abs) : null;
  if (CHECK) { if (cur !== content) { console.error(`stale: ${file}`); stale++; } continue; }
  if (cur === content) continue;
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
  if (!QUIET) console.log(`wrote ${file}`);
}
if (!QUIET) warns.forEach(w => console.warn("warning: " + w));
if (CHECK) {
  if (stale) { console.error(`${stale} generated file(s) are out of date — run: node scripts/build.mjs`); process.exit(1); }
  console.log(`build --check: ${outputs.size} file(s) up to date`);
} else if (!QUIET) console.log(`built ${LOCALES.map(l => l.code).join(", ")} (${outputs.size} files)`);
