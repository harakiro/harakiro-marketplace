# CSS Print Stylesheet Reference

Quick reference for authoring print-ready HTML that converts cleanly to PDF and PPTX.

## @page Rules

```css
/* Set page size and margins */
@page {
  size: A4;              /* A4, letter, legal, A3, or specific: 210mm 297mm */
  margin: 2cm;
}

@page :first {
  margin-top: 3cm;       /* Extra top margin on first page */
}

@page :left {
  margin-left: 3cm;      /* Binding margin for left pages */
}

@page :right {
  margin-right: 3cm;     /* Binding margin for right pages */
}

/* Landscape */
@page {
  size: A4 landscape;
}

/* Named pages */
@page cover { margin: 0; }
.cover-page { page: cover; }
```

## Page Breaks

```css
/* Force a page break before an element */
h1 { page-break-before: always; }  /* or: break-before: page; */

/* Force a page break after an element */
.section { page-break-after: always; }  /* or: break-after: page; */

/* Prevent breaks inside an element */
figure, table, .card {
  page-break-inside: avoid;         /* or: break-inside: avoid; */
}

/* Keep heading with following content */
h2, h3 {
  page-break-after: avoid;
}

/* Minimum lines before/after a break (widows & orphans) */
p {
  widows: 3;
  orphans: 3;
}
```

## Background Printing

```css
/* Force backgrounds to print (colors, gradients, images) */
* {
  -webkit-print-color-adjust: exact !important;
  print-color-adjust: exact !important;
}
```

## Tables Across Pages

```css
/* Repeat table header on each page */
thead { display: table-header-group; }
tfoot { display: table-footer-group; }

/* Avoid breaking inside rows */
tr { page-break-inside: avoid; }
```

## Print Media Query

```css
@media print {
  /* Hide non-print elements */
  nav, .sidebar, .no-print { display: none !important; }

  /* Reset backgrounds for print */
  body { background: white; color: black; }

  /* Ensure links show URL */
  a[href]::after { content: " (" attr(href) ")"; font-size: 0.8em; }
}

@media screen {
  /* Screen-only styles */
}
```

## Font Embedding

```css
/* Google Fonts — use @import or <link> */
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');

/* Base64 embedded font (for offline/file:// use) */
@font-face {
  font-family: 'CustomFont';
  src: url(data:font/woff2;base64,...) format('woff2');
  font-weight: 400;
  font-style: normal;
}
```

## Images

```css
/* Prevent images from breaking across pages */
img {
  page-break-inside: avoid;
  max-width: 100%;
}
```

**Best practices for images:**
- Use absolute URLs or base64 data URIs for reliability
- For file:// protocol, use absolute paths or paths relative to the HTML file
- Set explicit width/height to prevent layout shifts during rendering

## Print-Appropriate Units

| Use for | Recommended | Avoid |
|---------|-------------|-------|
| Page margins | `cm`, `mm`, `in` | `px`, `em` |
| Font sizes | `pt`, `px` | `em`, `rem` (inconsistent in print) |
| Element widths | `%`, `cm`, `mm` | `vw`, `vh` |
| Borders | `pt`, `px` | `em` |

**Conversion:** 1in = 2.54cm = 25.4mm = 72pt = 96px (at 96dpi)

## PPTX-Specific: Slide Boundaries

For explicit slide control when converting to PowerPoint, use `data-slide` attributes:

```html
<section data-slide="1">
  <h1>Title Slide</h1>
  <p>Subtitle</p>
</section>

<section data-slide="2">
  <h2>Content Slide</h2>
  <ul><li>Point one</li></ul>
</section>
```

Or use CSS page breaks — the converter detects both:

```css
section + section { page-break-before: always; }
```

## Common Presets

### Report
```css
@page { size: A4; margin: 2cm; }
body { font-family: 'Georgia', serif; font-size: 11pt; line-height: 1.6; }
h1 { page-break-before: always; }
h1:first-of-type { page-break-before: avoid; }
```

### Invoice
```css
@page { size: A4; margin: 1.5cm; }
body { font-family: 'Helvetica', sans-serif; font-size: 10pt; }
table { width: 100%; border-collapse: collapse; }
```

### Slides / Presentation
```css
@page { size: 13.33in 7.5in; margin: 0; }
section { width: 100%; height: 100%; page-break-after: always; padding: 2em; box-sizing: border-box; }
```

### Legal
```css
@page { size: letter; margin: 1in; }
body { font-family: 'Times New Roman', serif; font-size: 12pt; line-height: 2; }
p { text-indent: 0.5in; }
```
