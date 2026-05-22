# Troubleshooting

When the converted .pptx looks wrong, work through this list. The issues are ordered from most to least common.

## Defects and fixes

### PowerPoint file fails to open (error dialog, "cannot open", or blank presentation)

This is almost always a font issue. The most common cause: the HTML uses `Segoe UI` as the primary font. `Segoe UI` is Windows-only — PowerPoint on macOS can't find it and, depending on version, either substitutes silently, causes text reflow, or refuses to open the file.

**Diagnosis:** Extract the PPTX and search the XML for the font name:
```bash
cd /tmp && mkdir pptx-debug && cp output.pptx pptx-debug/out.zip
cd pptx-debug && unzip -q out.zip
grep -r "typeface" ppt/slides/ | grep -v Calibri | grep -v Arial | head -20
```

Any unusual `typeface` value (especially `Segoe UI`, custom Google Fonts names, or macOS-only fonts like `.AppleSystemUIFont`) is the culprit.

**Fix:** Change the font stack in the HTML to lead with `Calibri`:
```css
font-family: Calibri, 'Segoe UI', system-ui, -apple-system, sans-serif;
```

`Calibri` ships with every Office install on every platform and is pptxgenjs's native default. The editable converter's `normalizeFontFamily()` already maps `Segoe UI` → `Calibri`, so if your HTML leads with Calibri this is never an issue.

---

### Only 1 slide (or wrong number of slides) extracted

The `--selector` is matching the wrong element. Inspect the HTML and find the outermost per-slide wrapper. Count how many top-level elements match your selector — should match the expected slide count.

```bash
# Quick check without running the extractor:
grep -c 'class="slide"' deck.html
```

### Extraction times out / hangs on large decks

Default Playwright timeout is 120 seconds. For decks with many large embedded images or 50+ slides, bump `--out`-less extract first to see which slide it stalls on:

```bash
node scripts/extract.js deck.html --out /tmp/slides.json 2>&1 | tail
```

The stderr log shows progress per slide. If it consistently times out mid-deck, the cause is usually heavy gradient screenshots — tag fewer elements as gradients by simplifying the HTML, or use `--use-background-images` (fewer per-element screenshots, one full-slide shot instead).

### Text renders below its intended position (e.g., labels sitting below pill shapes)

Should be handled by the `valign: "middle"` + symmetric-pad strategy in `addTextLayer` in `build.js`. If you see this defect, the extractor probably measured the text bbox too narrowly — check that the element's computed text rect (via `Range.getClientRects()`) covered the full text. In the JSON, look at the bbox `h` for the offending text layer — should be roughly 1.2× the font size.

### Text wraps too early in the .pptx compared to HTML

The horizontal widening (`+4px + 6%` in `addTextLayer`) isn't enough for the specific font at that size. PowerPoint's font metrics can be noticeably wider than Chrome's for uncommon fonts. Either:

- Switch the HTML to a more common font (`Calibri`, `Arial`, `Segoe UI`) and re-extract, OR
- Bump `widthPadFrac` to `0.10` in `build.js`'s `addTextLayer`.

Be careful bumping the pad — boxes that are already near the slide edge will get clamped, which could shift center-aligned text.

### Text that overflows the slide edge

The opposite problem: widening pushes the text box past the slide. The clamp-to-slide line in `addTextLayer` prevents the box from exceeding slide width, but text already close to the edge can still appear cut off in LibreOffice's PDF rasterizer (used by `soffice --convert-to pdf`) even when it displays correctly in real PowerPoint. **Always verify in real PowerPoint before chasing fixes for edge-clipping — LibreOffice's font rendering is often narrower than the browser's, causing false positives.**

### Duplicate text (bold version stacked on top of regular version)

You hit the inline-text-duplication bug. Check that `isTextBlock()` in `extract.js` is returning `true` for the parent element. The most common cause: a block element containing `<strong>` whose `<strong>` in turn contains a `<span>` with `display: block`. That breaks the "inline-only content" check. Fix the HTML or treat the case in the extractor.

### Colored dots / bullets render as black

Inline `<span>` elements with `color: #xxx` inside a cell: my table handler reads the cell's computed color, not per-child. For complex tables with colored dots, the `isComplexTable()` detection should route to the image-fallback path, which preserves colors perfectly. If you're seeing black dots, the table is being treated as simple. Inspect for rowspan/colspan/transforms and confirm complexity heuristic is triggered.

### Gradient backgrounds render as a flat color (or the wrong color)

The screenshot step failed. Check stderr for `"gradient ... screenshot failed"` messages. Most common cause: the gradient element has `display: none` at screenshot time (a parent CSS transition or JS hid it). Solution: wait for the page to fully settle before walking:

```javascript
await page.waitForLoadState("networkidle");
await page.evaluate(() => document.fonts && document.fonts.ready);
```

Both are already in `extract.js`. If the issue persists, the HTML may have JS-driven transitions — pre-render the HTML to static state before passing to the skill.

### Icons or shapes look fuzzy / low-res

SVGs are rasterized at Playwright's `deviceScaleFactor: 2` — should look sharp. If they don't, either (a) the SVG itself is low-res relative to its display size, or (b) LibreOffice downsampled during the PDF conversion. Open the .pptx in real PowerPoint to rule out (b).

### Missing image placeholder shows up where an image should render

Either the file isn't present or the filename doesn't match (case-sensitive, spaces preserved). Check stderr for no load errors — if the image loaded correctly during extraction, the `<img>` would have been screenshotted and embedded. If you see a placeholder, the image's `naturalWidth` was 0 at extract time.

```bash
# Verify the file is where you think it is, with the exact name the HTML wants:
grep -oE '<img src="[^"]*"' deck.html | sort -u
ls -la /path/to/image/directory/
```

### Build fails with `ENOENT: no such file or directory`

Legacy path: the extractor emitted an `image` layer with `src: "http://..."` (not a dataUrl) and the builder tried to fetch that URL at write time. Current extractor always bakes images as data URLs, so this shouldn't happen — if it does, re-run the extraction; the JSON is stale.

### The PowerPoint file opens but shows "file is corrupt"

Usually one of:

- A hex color includes the `#` prefix → color propagated to pptxgenjs options → file corruption. Grep the build output / JSON for color strings starting with `#`.
- A shadow's `offset` is negative → file corruption. Check `addShapeLayer`.
- 8-character hex (e.g. `"FFFFFF80"` for alpha) → file corruption. The code uses separate `transparency` property, but if a custom tweak introduced this, it corrupts.

Run `unzip -l output.pptx` to confirm the zip structure is valid; if zip is valid but PowerPoint rejects it, open `ppt/slides/slide1.xml` from the unpacked pptx and look for malformed values.

## Verification workflow

After any fix, do this loop:

```bash
# Rebuild
node scripts/convert.js deck.html --out out.pptx

# Rasterize for quick visual inspection
soffice --headless --convert-to pdf out.pptx
rm -f slide-*.jpg
pdftoppm -jpeg -r 120 out.pdf slide
ls slide-*.jpg
```

Then `view` the rendered JPEGs. If you made a targeted fix (e.g., table handling), view only the affected slides.

**Final check: open in real PowerPoint.** LibreOffice's renderer is good-not-great. It sometimes:
- Wraps text earlier than PowerPoint does
- Renders custom fonts as fallbacks even when PPT would find them
- Cuts off text very close to shape boundaries

So LibreOffice-rendered output is a SUPERSET of real-PowerPoint defects. A slide that looks clean in LibreOffice looks clean in PowerPoint. A slide with minor issues in LibreOffice may or may not have them in PowerPoint — always verify in the real thing before writing code to fix.

## When to give up and fall back to `--use-background-images`

If a deck uses extensive CSS filters, backdrop-filter, custom blend modes, or animation frames in non-initial states, the per-element extraction will miss too much. Rather than writing elaborate workarounds, fall back to full-slide screenshots:

```bash
node scripts/convert.js deck.html --use-background-images --out out.pptx
```

This gives you:
- Perfect visual fidelity (the deck looks identical to HTML)
- Background is a raster image, NOT editable
- Overlay text and shapes ARE still editable and in the right positions
- ~3× larger .pptx file size

This is a sensible default for "presentation-only" use cases where the user will lightly edit text but won't restructure layouts.
