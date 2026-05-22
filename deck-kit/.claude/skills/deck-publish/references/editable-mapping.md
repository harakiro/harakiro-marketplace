# HTML → PPTX mapping reference

Detailed documentation of how each HTML construct is translated into PowerPoint. Read this when you need to understand why something rendered a certain way, or when you're changing the extractor / builder logic.

## Slide dimensions

The first element matching `--selector` sets the slide's pixel dimensions. The `.pptx` is built with a custom layout matching those dimensions in inches (px / 96). Any slide that's a different size from the first will be rendered clipped or padded to the first slide's dimensions — the HTML should keep all slides the same size.

## Element classification

For every non-skipped element under a slide, the extractor may emit:

- A **shape layer** if the element has a visible `background-color`, `background-image`, or `border`.
- A **text layer** if the element has direct text content and no block-level descendants (a "text block" — content is inline-only).
- An **image layer** if the element is an `<img>` that loaded successfully, or an `<svg>` element.
- A **table layer** if the element is `<table>`.
- An **image_placeholder** layer if the element is an `<img>` that failed to load.

An element may contribute both a shape AND a text layer — e.g., a colored card with text inside emits a shape for the card background and a text layer for the card's text.

## Text

**Text blocks.** A block-level element (or `flex` / `grid` / `inline-block`) whose entire subtree contains only inline elements (`<strong>`, `<em>`, `<span>`, etc.) becomes a single PowerPoint text box with rich-text runs. This is the critical case: `<p>Start <strong>bold</strong> end</p>` becomes ONE text box with three runs, not three overlapping text boxes. The extractor measures the union of all text-node client rects for the bbox.

**Mixed content.** An element with direct text AND block-level children emits a text layer for its direct text at the measured position of that text. Descendants will emit their own layers separately.

**Line breaks.** `<br>` becomes a `breakLine: true` marker on the preceding run. HTML text is whitespace-collapsed (browser rules): runs of whitespace including newlines become a single space.

**Vertical centering.** Text boxes are placed with `valign: "middle"` and expanded symmetrically above and below the measured text extent. This sidesteps pptxgenjs's internal top/bottom text-box insets, which vary with font size and would otherwise shift small text visibly downward.

**Horizontal sizing.** Text boxes are widened by `+4px + 6%` and then clamped to the slide edge. PowerPoint's font metrics are slightly wider than Chrome's for the same px/pt size; without this padding, PPT would wrap text one or two words earlier than HTML did.

**Alignment.** `text-align: center` / `right` grows the box symmetrically around the measured text (left-align grows only rightward). This preserves the intended alignment relative to the surrounding layout.

**Style properties carried over:** color, font-size (px → pt × 0.75), font-family (first family in the stack), font-weight (≥600 → bold), font-style (italic), text-decoration-line (underline), text-transform (uppercase / lowercase applied before emission), letter-spacing (px → pt, clamped to ±4pt, applied as `charSpacing`).

## Shapes

Elements with a background, gradient, or border become shape layers:

- **Solid background color** → `RECTANGLE` with `fill: { color }`. RGBA alpha becomes `fill.transparency`.
- **Border radius ≥ 2px** → `ROUNDED_RECTANGLE` with `rectRadius` = radius / (shorter dimension), capped at 0.5.
- **Gradient background** → element is screenshotted with descendants temporarily hidden (`visibility: hidden`), producing a clean gradient-only PNG. That PNG is placed as an image layer at the element's bbox. Foreground text layers from the same element and its children still overlay on top as editable text.
- **Full rectangular border** (all 4 sides set) → `line: { color, width }` on the shape.
- **Partial border** (e.g., `border-top: 3px solid ...`) → main shape has no border; thin filled-rectangle strips are added on the active sides. This preserves "card with top accent stripe" patterns cleanly.

The slide container itself is NOT emitted as a shape — it becomes the slide background.

## Slide backgrounds

Priority order:

1. If `--use-background-images` flag is set AND a full-slide screenshot was captured → use the screenshot (everything loses editability, visual fidelity guaranteed).
2. Else if the slide's root element has a gradient → use the gradient-only screenshot as the slide background.
3. Else if the root has a solid background color → use that color.
4. Else → white.

## SVGs

Every `<svg>` is rasterized via Playwright's `elementHandle.screenshot({ omitBackground: true })` and embedded as a base64 PNG image layer. Doing per-shape translation of SVG to PPT shapes is a rabbit hole; SVGs in slides are almost always icons/decorations, so rasterization is the right trade-off. Text layers adjacent to the SVG stay editable.

## Tables

**Simple tables** → native PPT table via `slide.addTable()`. Cell fills, per-cell colors, per-cell bold, per-cell font sizes all preserved. This is fully editable in PowerPoint.

**Complex tables** → detected by `isComplexTable()` and rendered as an image. Triggers for complexity:
- Any `<td>` / `<th>` with `rowspan > 1` or `colspan > 1`
- Any descendant with `writing-mode` that isn't horizontal (e.g., `vertical-lr`, `vertical-rl`)
- Any descendant with a `transform` other than `none`

The image-fallback loses cell editability but preserves visual fidelity. Surrounding elements (titles, legends, footers) remain editable.

## Images

`<img>` elements are screenshotted via `elementHandle.screenshot()` at extract time and embedded as base64 PNGs in the JSON. This makes the resulting `.pptx` fully self-contained — no external file dependencies when opened later.

**Missing images** (where `naturalWidth === 0` on the element — image failed to load) become `image_placeholder` layers: a dashed red-bordered rectangle with "Missing image: filename" label. The filename matches the original `src` attribute so callers know exactly what's missing.

## Elements that are ignored

- `<script>`, `<style>` (don't render anyway)
- Elements with `display: none` or `visibility: hidden` or `opacity: 0`
- Elements with bounding box smaller than 0.5px
- Pseudo-elements (`::before`, `::after`) — the tree walker only visits real DOM nodes

## Post-pass element screenshots

Three kinds of elements get screenshotted AFTER the DOM walk (when we have element handles in Playwright):

1. **SVGs** — always, unconditionally.
2. **Elements with gradients** — tagged with `data-htmp-grad` during the walk, screenshotted with descendants hidden to capture background-only.
3. **Elements tagged `data-htmp-img`** — currently: `<img>` elements that loaded, and complex tables.

The screenshots are stored as data URLs inline in the JSON, not on disk.
