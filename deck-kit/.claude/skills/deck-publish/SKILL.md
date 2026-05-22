---
name: deck-publish
description: "Publish presentation decks by converting HTML to PDF or PowerPoint (PPTX). Three modes: PDF (for distribution and archiving), screenshot PPTX (pixel-perfect, default — slides are images), and editable PPTX (real editable text boxes and shapes). Use this skill whenever the user wants to publish a deck, export slides, save as PDF, convert to PowerPoint, make a pptx, or produce a distributable file from deck HTML. Also trigger on 'publish this', 'export this deck', 'make a pptx', 'save as pdf', 'deck-publish', or when the user has finished creating deck content with /deck-create. Companion to the deck-create skill."
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Glob
---

# Deck Publish Skill

Convert deck HTML to PDF or PowerPoint. Three modes covering the common publishing needs:

| Mode | Flag | Best for | Editability |
|---|---|---|---|
| PDF | `--to pdf` | Distribution, printing, archiving | N/A |
| Screenshot PPTX (default) | `--to pptx` | Pixel-perfect fidelity — gradients, complex CSS effects, custom fonts | None (slides are images) |
| Editable PPTX | `--to pptx --editable` | Users who will edit text, resize cards, rebrand after conversion | Full — text boxes, shapes, tables |

## When to pick which PPTX mode

**Screenshot (default).** Ship this unless the user asks to edit. It's the simplest and most reliable path — one failure mode, pixel-perfect visual fidelity, single-shot success rate near 100% on well-authored HTML. The trade-off is that every slide is a rasterized image; recipients who open the .pptx can't change a word without re-doing the slide.

**Editable.** Opt in with `--editable` when the user says they'll need to edit the output, make follow-on decks from it, rebrand for a different org, or hand it to a designer to tweak. Every text block becomes a real PowerPoint text box, colored divs become shapes, tables stay editable. The trade-off is more failure modes (text overflow, layer misalignment on unusual HTML constructs) — expect to verify output and iterate on hard decks.

## How to Convert

### 1. Identify the HTML source

- If the user provides an HTML file path, use that
- If the user asks to convert content you just created, write it to a `.html` file first
- If the user has inline HTML, write it to a temp file

### 2. Determine target format and mode

- Default: **PDF**
- Use **screenshot PPTX** if the user mentions: slides, PowerPoint, presentation, PPTX, deck
- Use **editable PPTX** if the user also says: "editable", "I need to edit it", "so I can change the text", or similar
- If ambiguous between screenshot and editable, pick screenshot and mention the flag

### 3. Run the right script

Scripts live next to this SKILL.md under `scripts/`:

```bash
# PDF
node <skill-dir>/scripts/convert-pdf.js <input.html> [output.pdf] [options]

# Screenshot PPTX (default)
node <skill-dir>/scripts/convert-pptx.js <input.html> [output.pptx] [options]

# Editable PPTX
node <skill-dir>/scripts/convert-pptx.js <input.html> --editable [options]
# (the --editable flag delegates to convert-pptx-editable.js internally)
```

Output from all three is JSON on stdout: `{ success, output, size, ... }` on success; `{ success: false, error }` on failure.

### 4. Report back

- Parse the JSON
- On success: report the output file path and human-readable size, plus mode/slide count for PPTX
- On failure: report the error; suggest fixes from `references/troubleshooting.md` if applicable

## Flag Reference

### PDF (`convert-pdf.js`)

| Flag | Default | Description |
|------|---------|-------------|
| `--format` | `A4` | Paper: A4, letter, legal, tabloid, a3-a6 |
| `--landscape` | off | Landscape orientation |
| `--margin` | `1cm` | All margins, or "top right bottom left" |
| `--margin-top/bottom/left/right` | | Individual overrides |
| `--page-numbers` | off | Add "Page X of Y" footer |
| `--header` | | Puppeteer header template HTML |
| `--footer` | | Puppeteer footer template HTML |
| `--scale` | `1` | Scale 0.1–2.0 |
| `--no-prefer-css-page-size` | | Ignore CSS @page declarations |
| `--no-print-background` | | Don't print CSS backgrounds |
| `--page-ranges` | | e.g. "1-5, 8" |
| `--wait` | `0` | Extra wait ms after page load |
| `--wait-for-fonts` | off | Wait for document.fonts.ready |
| `--wait-for-selector` | | Wait for CSS selector to appear |
| `--timeout` | `30000` | Navigation timeout ms |
| `--slide-selector` | auto | Force slide mode with this selector |

### Screenshot PPTX (`convert-pptx.js`)

| Flag | Default | Description |
|------|---------|-------------|
| `--slide-size` | `16:9` | `16:9` or `4:3` |
| `--quality` | `2` | Screenshot device scale factor (1-3) |
| `--viewport-width` | `1280` | Browser viewport width in px |
| `--split-by` | `auto` | Slide detection: `auto`, `page-breaks`, `data-slide`, `viewport` |
| `--slide-selector` | auto | Explicit CSS selector for slides |
| `--image-format` | `webp-lossless` | `webp-lossless`, `webp`, `png`, `jpeg` |
| `--wait` | `0` | Extra wait ms after page load |
| `--wait-for-fonts` | off | Wait for fonts to load |
| `--wait-for-selector` | | Wait for selector to appear |
| `--timeout` | `60000` | Navigation timeout ms |

### Editable PPTX (`convert-pptx.js --editable`)

| Flag | Default | Description |
|------|---------|-------------|
| `--editable` | off | Switch to editable mode |
| `--selector` / `--slide-selector` | auto-detect | CSS selector for slide containers (see Auto-detect below) |
| `--brand` | auto-discover | Path to `brand.yaml` for branding overlays |
| `--no-brand` | | Skip brand file even if one exists |
| `--use-background-images` | off | Use full-slide screenshots as backgrounds (preserves gradients/effects; foreground text/shapes stay editable) |
| `--keep-json` | off | Keep the intermediate `slide_data.json` for debugging |

## Auto-detect (editable mode)

When `--selector` isn't given, the extractor tries in order:

1. `[data-slide]` attributes — the most explicit convention
2. Common class among fixed-size elements with `page-break-after: always` — the `/deck-create` convention
3. `.slide` — final fallback

For decks produced by `/deck-create`, auto-detect just works. For hand-authored decks, add `class="slide"` with fixed width/height + `page-break-after: always` and auto-detect handles it.

## Brand (editable mode)

Drop a `brand.yaml` next to the HTML (or in a `brand/` subdirectory) and editable mode picks it up automatically. Supports footer text, logo placement, and document metadata. See `references/brand-schema.md` for the full format.

Discovery order:
1. `--brand <path>` (explicit override)
2. `./brand/brand.yaml` (or `.yml` / `.json`)
3. `./brand.yaml`
4. `/mnt/user-data/uploads/brand/` (Claude Desktop)
5. `/mnt/user-data/uploads/`

Both `deck-create` and `deck-publish --editable` read from the same `brand.yaml`. See `references/brand-schema.md` for the complete schema.

## HTML Authoring

The converter's input contract is documented in `references/html-authoring-guide.md`. Summary of rules that matter:

- Every slide is a fixed-size container with identical dimensions across all slides
- Use `page-break-after: always` on each slide container
- Use `box-sizing: border-box` on containers
- Set `print-color-adjust: exact` to preserve backgrounds
- Avoid `height: 100vh` (breaks print layout)
- Load web fonts via `<link>` to Google Fonts or base64-embedded `@font-face`
- At least 2 slide elements (auto-detect requires ≥2)

Decks produced by `/deck-create` follow all of these automatically. Hand-authored HTML should match the template in the authoring guide.

## Pre-Conversion Checklist

Before running the converter on a user-supplied HTML file:

- [ ] File has at least 2 slide elements
- [ ] Slide elements share identical dimensions
- [ ] `print-color-adjust: exact` is set somewhere
- [ ] Web fonts loaded via `<link>`, not assumed installed
- [ ] Images use absolute paths, relative paths from the HTML dir, or base64 data URIs

If any are missing, mention it and ask if the user wants to fix the HTML or proceed (output may not look right).

## Known limitations (editable mode)

Features that don't round-trip through PowerPoint:

- `transform: rotate/scale/skew` on shapes/text → ignored
- `filter`, `mask`, `backdrop-filter` → ignored
- `writing-mode: vertical-*` → standalone text ignored; tables with it fall back to image rendering
- Pseudo-elements `::before`, `::after` → not extracted
- CSS animations → first frame only
- `<canvas>`, `<video>` → ignored
- Gradient text (`background-clip: text`) → renders as solid color
- `<svg>` → rasterized to PNG (not per-shape editable)
- Tables with `rowspan`/`colspan` → fall back to image rendering (visually correct, not cell-editable)

For any of these, `--use-background-images` is the escape hatch: it preserves the visual and keeps only foreground text editable.

## Picking a default font (deck-create)

The editable converter substitutes `Segoe UI` → `Calibri` because Segoe UI isn't installed on Mac by default — without the substitution, PowerPoint picks a wider fallback (Cambria) and text wraps where it didn't in HTML.

For new decks, pick a font that ships with PowerPoint on every platform:

| Font | Notes |
|---|---|
| **Aptos** | Microsoft default since Office 2024. Modern, clean. Available everywhere on current Office. |
| **Calibri** | Microsoft default since 2007. Most universally compatible — every Office install has it. |
| **Arial / Verdana / Tahoma / Trebuchet MS / Georgia / Times New Roman** | Universal — installed at OS level on Mac and Windows, not just inside Office. |

Recommended default font stack for new decks:

```css
font-family: "Aptos", "Calibri", "Arial", system-ui, sans-serif;
```

Aptos for modern Office, Calibri for older installs, Arial for any system at all, then OS-defaults. Avoid `Segoe UI` as the primary unless every recipient has Office on Windows.

## File layout

```
deck-publish/
├── SKILL.md                          # this file
├── package.json                      # pptxgenjs dependency
├── scripts/
│   ├── lib/
│   │   └── browser.js                # Puppeteer launch + loadPage helpers
│   ├── convert-pdf.js                # PDF mode
│   ├── convert-pptx.js               # Screenshot PPTX (default) + --editable delegation
│   ├── convert-pptx-editable.js      # Editable-mode orchestrator
│   ├── extract.js                    # HTML → slide_data.json (Puppeteer DOM walk)
│   ├── build.js                      # slide_data.json → .pptx (pptxgenjs)
│   └── brand.js                      # brand.yaml loader + overlay helpers
└── references/
    ├── html-authoring-guide.md       # Full authoring guide for deck HTML
    ├── css-print-guide.md            # CSS rules for print-ready output
    ├── brand-schema.md               # brand.yaml schema (unified config used by both skills)
    ├── editable-mapping.md           # How editable mode translates HTML to PPTX
    └── troubleshooting.md            # Diagnostic guide for common defects
```

## Dependencies

- **Node 18+**
- **Puppeteer** + system Chrome (`/usr/bin/google-chrome-stable`) — already expected by the existing PDF and screenshot PPTX modes
- **pptxgenjs** (from `package.json`)

The editable mode adds no new runtime dependencies — it uses the same Puppeteer/Chrome pair via `lib/browser.js` that the screenshot mode uses.
