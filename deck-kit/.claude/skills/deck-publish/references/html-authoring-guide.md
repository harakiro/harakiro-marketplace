# HTML Authoring Guide for deck-publish

This guide is for content creation agents (or humans) writing HTML that will be converted to PDF or PPTX using the `deck-publish` skill. Following these patterns ensures the converter correctly detects pages, slides, and layout.

---

## How the Converter Detects Structure

The converter uses Puppeteer (headless Chrome) to render your HTML, then applies detection heuristics to find page/slide boundaries. Understanding these heuristics is key to getting correct output.

### PPTX Detection (in priority order)

1. **`data-slide` attributes** — Elements with `[data-slide]` are treated as individual slides
2. **Fixed-size elements with page breaks** — Elements that have `page-break-after: always` (or `break-after: page`, or the `-before` variants), are ≥100px in both dimensions, and **all share identical dimensions** (within 2px tolerance)
3. **Viewport-height fallback** — If nothing else matches, the page is sliced into viewport-height chunks (720px tall at 1280px wide) — this is the least reliable method

### PDF Detection

- **Document mode (default):** Standard Puppeteer PDF rendering. Respects CSS `@page` rules and `page-break-before`/`page-break-after` for pagination
- **Slide mode (auto-detected):** If the converter finds ≥2 elements with `page-break-after: always` or `break-after: page` that all share the same fixed dimensions, it switches to slide mode — setting the PDF page size to match the element dimensions exactly (zero margins, tight fit)

---

## Pattern 1: Presentation / Slide Deck (PPTX or PDF)

This is the most reliable pattern. Each slide is a fixed-size container with a page break.

### Required Structure

```html
<style>
  .slide {
    width: 960px;
    height: 540px;          /* 16:9 aspect ratio */
    page-break-after: always;
    position: relative;
    overflow: hidden;
    box-sizing: border-box;
  }

  /* Preserve backgrounds in print */
  * {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }

  @media print {
    body { background: #fff; margin: 0; padding: 0; }
    .slide { box-shadow: none; margin: 0; }
  }
</style>

<div class="slide">
  <!-- Slide 1 content -->
</div>

<div class="slide">
  <!-- Slide 2 content -->
</div>
```

### What makes this work

| Requirement | Why |
|---|---|
| Fixed `width` + `height` on every slide element | Detection checks that all candidate elements share identical dimensions (±2px) |
| `page-break-after: always` on every slide | This is the trigger the detector scans for — without it, elements won't be found |
| Same CSS class on all slides | The detector tries to build a CSS selector by finding a class that matches all break-bearing elements of the same size |
| Dimensions ≥ 100px in both axes | Elements smaller than 100×100 are ignored by detection |
| At least 2 slide elements | Detection requires ≥2 matching elements to activate |

### Common Aspect Ratios

| Ratio | Width × Height | Use case |
|---|---|---|
| 16:9 | `960px × 540px` | Standard widescreen slides |
| 16:9 (HD) | `1280px × 720px` | Higher resolution slides |
| 4:3 | `960px × 720px` | Traditional presentation |
| 4:3 | `1024px × 768px` | Classic 4:3 |

### Alternative: `data-slide` Attributes

For PPTX conversion, you can use `data-slide` attributes instead of (or in addition to) page breaks. This is the highest-priority detection method for PPTX.

```html
<section data-slide="1" class="slide">
  <h1>Title Slide</h1>
</section>

<section data-slide="2" class="slide">
  <h2>Content</h2>
</section>
```

> `data-slide` is only checked by the PPTX converter. For PDF slide detection, you must use the page-break + fixed-size pattern.

---

## Pattern 2: Multi-Page Document (PDF)

For reports, documents, and long-form content that should flow naturally across pages.

### Minimal Structure

```html
<!DOCTYPE html>
<html>
<head>
  <style>
    @page {
      size: A4;
      margin: 2cm;
    }

    body {
      font-family: 'Segoe UI', system-ui, sans-serif;
      font-size: 11pt;
      line-height: 1.6;
      color: #1a1a1a;
    }

    /* Force page breaks at major sections */
    h1 {
      page-break-before: always;
    }
    h1:first-of-type {
      page-break-before: avoid;   /* Don't break before the first heading */
    }

    /* Keep headings with their content */
    h2, h3 {
      page-break-after: avoid;
    }

    /* Don't break inside these elements */
    figure, table, .card, blockquote, pre {
      page-break-inside: avoid;
      break-inside: avoid;
    }

    /* Avoid orphaned/widowed lines */
    p {
      widows: 3;
      orphans: 3;
    }

    /* Repeat table headers across pages */
    thead { display: table-header-group; }
    tr { page-break-inside: avoid; }

    /* Print backgrounds */
    * {
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
  </style>
</head>
<body>
  <h1>Section One</h1>
  <p>Content flows naturally...</p>

  <h1>Section Two</h1>
  <p>New page starts here...</p>
</body>
</html>
```

### Key rules for documents

- Use `@page { size: A4; margin: 2cm; }` (or `letter`, `legal`, etc.) — the converter honors `@page` by default
- Use `page-break-before: always` on `<h1>` to separate major sections
- Use `break-inside: avoid` on tables, figures, code blocks, and cards
- Use `<thead>` and `<tbody>` in tables — Chrome auto-repeats `<thead>` on each page
- **Do NOT use `height: 100vh`** on body or sections — this causes blank pages in print

---

## Pattern 3: Single-Page Document (PDF)

Invoices, certificates, single-page flyers.

```html
<style>
  @page {
    size: A4;
    margin: 1.5cm;
  }

  * {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
</style>

<div class="invoice">
  <!-- All content fits on one page -->
</div>
```

No page breaks needed. Keep content within the printable area of one page.

---

## Critical Rules (Things That Break Conversion)

### DO

- **Always include `print-color-adjust: exact`** — without it, Chrome strips backgrounds and colors in print
- **Set explicit `width` and `height` on images and SVGs** — headless Chrome can missize them otherwise
- **Use a `@media print` block** to reset body background to white and remove box shadows/margins used for on-screen preview
- **Use absolute URLs, base64 data URIs, or file-relative paths for images** — remote URLs work only if Chrome can fetch them
- **Load web fonts via `<link>` tags to Google Fonts** or embed as base64 `@font-face` — and use the `--wait-for-fonts` flag

### DON'T

- **Don't use `height: 100vh`** on body, sections, or slide containers — it causes blank pages and layout breakage in print mode
- **Don't mix slide sizes** — all slide elements must be the same dimensions for auto-detection to work
- **Don't rely on system fonts** for consistent output — headless Chrome on Linux has a different font set than Windows/macOS
- **Don't use `em`/`rem` for margins on `@page` rules** — use `cm`, `mm`, `in`, or `pt`
- **Don't forget `box-sizing: border-box`** on fixed-size containers — without it, padding pushes content outside the slide boundary
- **Don't put content outside slide containers** in slide-deck HTML — it will appear between slides and break detection
- **Don't use `Segoe UI` as your primary font** — it is Windows-only. On macOS, PowerPoint substitutes it with a wider fallback (often Cambria), causing text to reflow or the file to fail to open entirely. Always lead with `Calibri`: `font-family: Calibri, 'Segoe UI', system-ui, sans-serif`
- **Don't put `height: 100%` on card grids or content containers inside a slide** — this forces every card to stretch and fill the entire slide body, making content look bloated regardless of how much text is there. Let containers size to their content; use `justify-content: center` on the slide body flex container so natural-height content sits centered with breathing room above and below

---

## Vertical Space Budget

For a standard **960×540** content slide with the typical chrome (5px accent bar + ~30px header + ~25px footer + ~20px body padding), you have roughly **460–470px** of usable content height.

Before committing a layout, estimate whether your planned elements fit:

| If estimated total is… | Action |
|---|---|
| Under 380px | Consider merging with an adjacent slide |
| 380–450px | Good — content will sit naturally with breathing room |
| 450–460px | Tight but workable — reduce padding or font sizes slightly |
| Over 460px | Split the slide; content will overflow or require dangerous compression |

This check prevents the most common layout defect: content that looked right in the browser (where the page scrolls) but overflows or gets clipped in the fixed-size PPTX slide.

---

## Complete Slide Deck Template

Copy-paste starting point for a presentation:

```html
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    background: #e8e8e8;
    font-family: Calibri, 'Segoe UI', system-ui, -apple-system, sans-serif;
  }

  /* Print fidelity */
  * {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }

  /* === SLIDE CONTAINER === */
  .slide {
    width: 960px;
    height: 540px;
    margin: 20px auto;
    background: #fff;
    position: relative;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    box-shadow: 0 2px 12px rgba(0,0,0,0.12);
    page-break-after: always;
  }

  @media print {
    body { background: #fff; }
    .slide { box-shadow: none; margin: 0; }
  }

  /* === COMMON SLIDE PARTS === */
  .slide-header {
    padding: 14px 40px 10px;
    /* your brand color */
  }

  .slide-body {
    flex: 1;
    padding: 16px 40px 44px;
    display: flex;
    flex-direction: column;
  }

  .slide-footer {
    padding: 5px 40px;
    display: flex;
    justify-content: space-between;
    font-size: 7px;
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
  }
</style>
</head>
<body>

<!-- SLIDE 1: COVER -->
<div class="slide" style="justify-content: center; align-items: center; text-align: center; padding: 60px;">
  <h1 style="font-size: 36px; font-weight: 800;">Presentation Title</h1>
  <p style="font-size: 14px; margin-top: 12px; opacity: 0.7;">Subtitle or date</p>
</div>

<!-- SLIDE 2: CONTENT -->
<div class="slide">
  <div class="slide-header">
    <h2>Slide Title</h2>
  </div>
  <div class="slide-body">
    <p>Slide content goes here.</p>
  </div>
  <div class="slide-footer">
    <span>Company Name</span>
    <span>2</span>
  </div>
</div>

<!-- SLIDE 3: CONTENT -->
<div class="slide">
  <div class="slide-header">
    <h2>Another Slide</h2>
  </div>
  <div class="slide-body">
    <p>More content.</p>
  </div>
  <div class="slide-footer">
    <span>Company Name</span>
    <span>3</span>
  </div>
</div>

</body>
</html>
```

---

## Complete Document Template

Copy-paste starting point for a multi-page PDF report:

```html
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  @page {
    size: A4;
    margin: 2cm;
  }

  * {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }

  body {
    font-family: 'Segoe UI', system-ui, sans-serif;
    font-size: 11pt;
    line-height: 1.6;
    color: #1a1a1a;
  }

  h1 {
    font-size: 22pt;
    margin-bottom: 0.5em;
    page-break-before: always;
  }
  h1:first-of-type {
    page-break-before: avoid;
  }

  h2 {
    font-size: 16pt;
    margin-top: 1.5em;
    margin-bottom: 0.5em;
    page-break-after: avoid;
  }

  p { widows: 3; orphans: 3; }

  table {
    width: 100%;
    border-collapse: collapse;
    break-inside: avoid;
  }
  thead { display: table-header-group; }
  th, td {
    border: 1px solid #ddd;
    padding: 6px 10px;
    text-align: left;
  }
  tr { break-inside: avoid; }

  figure, pre, blockquote {
    break-inside: avoid;
  }
</style>
</head>
<body>

<h1>Document Title</h1>
<p>Introduction paragraph...</p>

<h2>Subsection</h2>
<p>Content...</p>

<h1>Section Two</h1>
<p>This starts on a new page...</p>

</body>
</html>
```

---

## Quick Reference: Detection Checklist

Before converting, verify:

- [ ] Every slide has the **same class** and **identical fixed dimensions** (width + height in px)
- [ ] Every slide has `page-break-after: always`
- [ ] `print-color-adjust: exact` is set (for colored backgrounds/gradients)
- [ ] `@media print` resets body background and removes box shadows
- [ ] No `100vh` anywhere in slide/section heights
- [ ] Images have explicit `width`/`height` attributes or CSS
- [ ] At least 2 slide elements exist (detection requires ≥2)
- [ ] No stray content between slide containers
- [ ] `box-sizing: border-box` is set on slide containers
