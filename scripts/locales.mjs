// The languages mdeverything is built in. Adding a language = add locales/<code>.json
// (+ optional locales/samples/<code>.md and <code>.annotations.json) and ONE line below,
// then run `node scripts/build.mjs`.
//
//   code       BCP 47 tag; also the name of the locale file (locales/<code>.json) and the page language
//   dir        output folder ("" = site root). Lowercase, e.g. "pt-br" for pt-BR
//   htmlLang   <html lang>, the `lang` of the language link, Intl formatting
//   ogLocale   Open Graph locale (og:locale / og:locale:alternate)
//   nativeName the language in its own name (menus, links, the AI bundle's "UI language" line)
//   hreflang   <link rel="alternate" hreflang> / sitemap alternates
//   short      (optional) label on the header button on wide screens; default: code before "-", uppercased
//   textDir    (optional) "rtl" for right-to-left languages; default "ltr"
export const SITE_URL = "https://ductienuit.github.io/mdeverything/";
export const DEFAULT_LOCALE = "en";
// <lastmod> written to sitemap.xml (kept fixed so builds are reproducible; bump it when content changes)
export const SITE_LASTMOD = "2026-11-07";

export const LOCALES = [
  { code: "en", dir: "",   htmlLang: "en", ogLocale: "en_US", nativeName: "English",    hreflang: "en" },
  { code: "vi", dir: "vi", htmlLang: "vi", ogLocale: "vi_VN", nativeName: "Tiếng Việt", hreflang: "vi" },
  { code: "ja",    dir: "ja",    htmlLang: "ja",    ogLocale: "ja_JP", nativeName: "日本語",              hreflang: "ja" },
  { code: "pt-BR", dir: "pt-br", htmlLang: "pt-BR", ogLocale: "pt_BR", nativeName: "Português (Brasil)", hreflang: "pt-BR" },
  { code: "es",    dir: "es",    htmlLang: "es",    ogLocale: "es_ES", nativeName: "Español",            hreflang: "es" },
];
