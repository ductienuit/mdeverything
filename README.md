<p align="center"><img src="assets/wordmark-light.png" alt="mdeverything" width="360"></p>

**Read, comment on and edit Markdown — then hand it to your AI.** mdeverything is a free
web app that runs entirely in your browser: open a Markdown document, leave inline comments
on any passage, tweak the source in a built-in editor, then export a clean, structured
context package for ChatGPT, Claude, Gemini, or your coding assistant.

🔗 **Live app:** https://ductienuit.github.io/mdeverything/

> Formerly **Marginalia** (`ductienuit.github.io/marginalia`). The old address now shows a
> short "what's new" page and then brings visitors here.

![mdeverything — read, comment and edit Markdown for AI review](og-image.png)

## What it does

You read a Markdown document inside mdeverything. Select a passage and a comment box opens
right there, Claude-artifact style. Each comment can hold a question, a request or a reply
thread, and can be resolved when it's handled. When you're done, **Export for AI** copies a
structured bundle an assistant can act on:

- the exact **quoted passage**
- its **section location** and a **line hint**
- the **surrounding context** (so duplicate wording is never confused)
- your **comment**, its **replies**, and whether it's **resolved**

## Features

- **Inline comments** — select text or use the margin button to comment on a whole block;
  hover to preview, click for the card with Edit · Resolve · Delete · Reply
- **Comments panel** — optional side list (hidden by default) with a resolved filter
- **Outline** — table of contents with scroll-spy; drawer on small screens
- **Markdown editor** — formatting toolbar, shortcuts (Ctrl/Cmd+B · I · K), live preview;
  comments re-anchor after you apply changes
- **Three reading themes** — Paper, Sepia (cream paper + Merriweather), Night
- **Autosave** — your document, comments and preferences stay in your browser between visits
- Renders GitHub-flavored Markdown, wide tables and **Mermaid** diagrams
- Export modes: **full context**, **notes only**, or **raw Markdown**
- Keyboard accessible, responsive from mobile to desktop, `prefers-reduced-motion` aware

## Privacy

mdeverything runs **entirely in your browser**. There is no server, no account and no
tracking. Your document and comments never leave your device; they're saved in your
browser's local storage. Third-party libraries (Markdown, sanitizer, diagrams) and fonts are
loaded from public CDNs.

## Use it locally

No build step. Either:

- Open `index.html` directly in a browser, **or**
- Serve the folder: `python -m http.server 8000` then visit `http://localhost:8000/`

## Tech

`index.html` with vanilla JavaScript and CSS, plus logo assets in `assets/`. Uses
[marked](https://github.com/markedjs/marked) for Markdown,
[DOMPurify](https://github.com/cure53/DOMPurify) for sanitization and
[Mermaid](https://github.com/mermaid-js/mermaid) for diagrams (all via CDN).
`make_og.py` regenerates the social preview image from the logo assets.

## License

[MIT](LICENSE) © 2026 ductienuit
