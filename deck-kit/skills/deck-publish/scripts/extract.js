#!/usr/bin/env node
/**
 * extract.js — Load an HTML deck in Playwright, walk each slide's DOM,
 * and emit a normalized JSON description of every visible layer.
 *
 * Usage: node extract.js <html-path> [--selector ".slide"] [--out slide_data.json]
 *
 * The output JSON has this shape:
 * {
 *   slideWidthPx, slideHeightPx,
 *   slides: [
 *     { index, backgroundColor, backgroundImageDataUrl?, layers: [ {type, bbox, ...} ] }
 *   ]
 * }
 *
 * Layer types: "shape", "text", "image", "table".
 */

require("./lib/bootstrap");

const fs = require("fs");
const path = require("path");
const { launchBrowser, loadPage } = require("./lib/browser");

function parseArgs(argv) {
  const args = { selector: null, out: "slide_data.json", html: null, captureFullSlide: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--selector" || a === "--slide-selector") args.selector = argv[++i];
    else if (a === "--out") args.out = argv[++i];
    else if (a === "--capture-full-slide") args.captureFullSlide = true;
    else if (!a.startsWith("--")) args.html = a;
  }
  if (!args.html) {
    console.error("Usage: extract.js <html-path> [--selector <css>] [--out out.json] [--capture-full-slide]");
    console.error("If --selector is omitted, auto-detects: data-slide → page-break+fixed-size → .slide");
    process.exit(2);
  }
  return args;
}

// This function runs inside the browser page. It is serialized by Playwright,
// so it must be self-contained (no outer closures / node modules).
function extractInPage(selector) {
  // ---- helpers ----------------------------------------------------------
  const round2 = (n) => Math.round(n * 100) / 100;

  function parseColor(str) {
    if (!str) return null;
    const m = str.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const parts = m[1].split(",").map((s) => parseFloat(s.trim()));
    const [r, g, b] = parts;
    const a = parts.length === 4 ? parts[3] : 1;
    if (a === 0) return null; // fully transparent
    const hex = [r, g, b]
      .map((v) => Math.round(v).toString(16).padStart(2, "0").toUpperCase())
      .join("");
    return { hex, a };
  }

  function hasBackground(bg) {
    return !!bg && parseColor(bg);
  }

  function hasGradient(bgImage) {
    return bgImage && bgImage !== "none" && bgImage.includes("gradient");
  }

  function hasBorder(cs) {
    const bw = parseFloat(cs.borderTopWidth) || 0;
    if (bw <= 0) return false;
    const c = parseColor(cs.borderTopColor);
    return !!c;
  }

  function borderInfo(cs) {
    // Returns { top, right, bottom, left } widths (px) and a representative
    // color. Only sides with width > 0 AND a visible color are "active".
    const sides = {};
    let color = null;
    for (const side of ["Top", "Right", "Bottom", "Left"]) {
      const w = parseFloat(cs["border" + side + "Width"]) || 0;
      const c = parseColor(cs["border" + side + "Color"]);
      if (w > 0 && c) {
        sides[side.toLowerCase()] = w;
        if (!color) color = c.hex;
      } else {
        sides[side.toLowerCase()] = 0;
      }
    }
    const active = Object.values(sides).filter((w) => w > 0).length;
    return { sides, color, active };
  }

  function radiusPx(cs) {
    // Use the largest corner radius; pptxgenjs only supports uniform radius
    const keys = [
      "borderTopLeftRadius",
      "borderTopRightRadius",
      "borderBottomLeftRadius",
      "borderBottomRightRadius",
    ];
    return Math.max(...keys.map((k) => parseFloat(cs[k]) || 0));
  }

  function isHidden(el, cs) {
    if (cs.display === "none" || cs.visibility === "hidden") return true;
    if (parseFloat(cs.opacity) === 0) return true;
    const r = el.getBoundingClientRect();
    if (r.width < 0.5 || r.height < 0.5) return true;
    return false;
  }

  function normalizeWeight(w) {
    const n = parseInt(w, 10);
    if (isNaN(n)) return 400;
    return n;
  }

  // Is an element inline (or inline-block/inline-flex/etc.)?
  function isInline(el) {
    const disp = window.getComputedStyle(el).display;
    return disp.startsWith("inline");
  }

  // Is the content of `el` purely inline-level? (text nodes + inline
  // elements whose subtrees are also inline). Empty elements return true.
  function isInlineOnlyContent(el) {
    for (const child of el.children) {
      if (!isInline(child)) return false;
      if (!isInlineOnlyContent(child)) return false;
    }
    return true;
  }

  // A "text block" is a block-level (or flex/grid/inline-block) element
  // whose content is inline-only and contains some text. Such elements
  // should emit a SINGLE rich-text layer spanning all their text, rather
  // than one layer for each inline text fragment (which would overlap).
  function isTextBlock(el) {
    if (isInline(el)) return false;
    if (!el.textContent || !el.textContent.trim()) return false;
    return isInlineOnlyContent(el);
  }

  // A table is "complex" if it can't be losslessly represented as a native
  // PowerPoint grid: merged cells (rowspan/colspan), vertical writing mode,
  // any transform, or inline-styled content (colored spans etc.) that
  // can't round-trip through a flat cell text. Complex tables fall back
  // to a screenshot image for visual fidelity (at the cost of editability).
  function isComplexTable(table) {
    const cells = table.querySelectorAll("td, th");
    for (const cell of cells) {
      const rs = parseInt(cell.getAttribute("rowspan") || "1", 10);
      const cs = parseInt(cell.getAttribute("colspan") || "1", 10);
      if (rs > 1 || cs > 1) return true;
      const descendants = cell.querySelectorAll("*");
      for (const d of descendants) {
        const dcs = window.getComputedStyle(d);
        if (dcs.writingMode && dcs.writingMode !== "" && !dcs.writingMode.startsWith("horizontal")) return true;
        if (dcs.transform && dcs.transform !== "none") return true;
      }
    }
    return false;
  }

  // Recursively collect styled text runs from an element's subtree.
  // Each run is { text, color, bold, italic, underline, fontSize, breakLine? }.
  // `<br>` elements become breakLine markers on the preceding run.
  function collectRuns(el, runs) {
    for (const child of el.childNodes) {
      if (child.nodeType === 3) {
        // Text node — collapse whitespace like the browser.
        let text = child.textContent;
        if (!text) continue;
        text = text.replace(/[\t\n\r ]+/g, " ");
        if (!text) continue;
        // Skip leading whitespace-only content at the very start
        if (text === " " && runs.length === 0) continue;
        // Style comes from the text node's parent element
        const parent = child.parentElement;
        const pcs = window.getComputedStyle(parent);
        const col = parseColor(pcs.color);
        const size = parseFloat(pcs.fontSize);
        runs.push({
          text,
          color: col ? col.hex : null,
          bold: normalizeWeight(pcs.fontWeight) >= 600,
          italic: pcs.fontStyle === "italic",
          underline: pcs.textDecorationLine && pcs.textDecorationLine.includes("underline"),
          fontSize: isNaN(size) ? null : size,
        });
      } else if (child.nodeType === 1) {
        const tag = child.tagName.toLowerCase();
        if (tag === "br") {
          if (runs.length === 0) {
            runs.push({ text: "", breakLine: true });
          } else {
            runs[runs.length - 1].breakLine = true;
          }
        } else {
          // Recurse into inline child
          collectRuns(child, runs);
        }
      }
    }
  }

  function bboxRelative(el, origin) {
    const r = el.getBoundingClientRect();
    return {
      x: round2(r.left - origin.left),
      y: round2(r.top - origin.top),
      w: round2(r.width),
      h: round2(r.height),
    };
  }

  // Collect direct-child text-node content (text that is a direct child, not
  // from descendants). Also returns the concatenated trimmed string.
  function directTextContent(el) {
    let s = "";
    for (const n of el.childNodes) {
      if (n.nodeType === 3) s += n.textContent;
    }
    return s.replace(/\s+/g, " ").trim();
  }

  // Build a text layer from an element that has direct text. Uses a Range to
  // measure only the text (excluding descendants), so nested elements don't
  // bloat the bounding box.
  function buildTextLayer(el, origin) {
    const cs = window.getComputedStyle(el);
    if (isHidden(el, cs)) return null;

    const direct = directTextContent(el);
    if (!direct) return null;

    // Measure union rect of direct text nodes only
    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
    for (const n of el.childNodes) {
      if (n.nodeType !== 3 || !n.textContent.trim()) continue;
      const range = document.createRange();
      range.selectNode(n);
      const rects = range.getClientRects();
      for (const r of rects) {
        left = Math.min(left, r.left);
        top = Math.min(top, r.top);
        right = Math.max(right, r.right);
        bottom = Math.max(bottom, r.bottom);
      }
    }
    if (!isFinite(left)) return null;

    const color = parseColor(cs.color);
    const fontSize = parseFloat(cs.fontSize);
    const lineHeight = parseFloat(cs.lineHeight);

    // Expand to the element's padded box horizontally if the element is
    // narrow enough (better for alignment: center/right need the full box).
    const elRect = el.getBoundingClientRect();
    const align = cs.textAlign;
    const padL = parseFloat(cs.paddingLeft) || 0;
    const padR = parseFloat(cs.paddingRight) || 0;
    let boxLeft = left, boxRight = right;
    let boxTop = top, boxBottom = bottom;
    let alignFinal = align;

    // Pill / label detection: a shrink-fit element with its own visible
    // background and direct text. In HTML these *look* centered because the
    // padding is symmetric around the shrink-fit content, but text-align is
    // technically "left/start". When PPT renders with a different font
    // (e.g. Calibri vs Segoe UI), the narrower glyphs sit flush-left inside
    // the bg and look off-center. To preserve the visual intent, make the
    // text shape match the element's bbox (== the bg shape) and force
    // align=center. Only when the author hasn't picked an explicit alignment.
    //
    // "Shrink-fit" = element content-box width ≈ rendered text width: the
    // element wraps the text snugly. Catches inline spans (blockified by
    // flex parents to display:block) as well as inline-block badges/pills.
    const bgColor = parseColor(cs.backgroundColor);
    const hasBgImg = cs.backgroundImage && cs.backgroundImage !== "none";
    const hasBg = !!(bgColor || hasBgImg);
    const innerW = elRect.width - padL - padR;
    const textW = right - left;
    const isShrinkFit = textW > 0 && innerW > 0 && Math.abs(innerW - textW) < 2.5;
    const alignIsDefault = !align || align === "start" || align === "left";
    const isPillLike = hasBg && isShrinkFit && alignIsDefault;
    if (isPillLike) {
      boxLeft = elRect.left;
      boxRight = elRect.right;
      boxTop = elRect.top;
      boxBottom = elRect.bottom;
      alignFinal = "center";
    } else if (align === "center" || align === "right" || align === "justify") {
      // Use the element's content box horizontally
      boxLeft = elRect.left + padL;
      boxRight = elRect.right - padR;
    }

    // Pad the text box slightly on the vertical to avoid clipping descenders.
    // Skip when we already replaced the box with the bg's exact bounds.
    const padY = isPillLike ? 0 : 2;

    return {
      type: "text",
      bbox: {
        x: round2(boxLeft - origin.left),
        y: round2(boxTop - origin.top - padY),
        w: round2(boxRight - boxLeft),
        h: round2(boxBottom - boxTop + padY * 2),
      },
      text: direct,
      style: {
        color: color ? color.hex : "000000",
        fontSize: round2(fontSize),
        fontFamily: cs.fontFamily,
        fontWeight: normalizeWeight(cs.fontWeight),
        italic: cs.fontStyle === "italic",
        underline: cs.textDecorationLine && cs.textDecorationLine.includes("underline"),
        textTransform: cs.textTransform,
        letterSpacing: parseFloat(cs.letterSpacing) || 0,
        lineHeight: isNaN(lineHeight) ? null : lineHeight,
        align: alignFinal === "start" ? "left" : alignFinal === "end" ? "right" : alignFinal,
      },
    };
  }

  // Build a rich-text layer for a text-block element. Emits a single text
  // layer covering all the element's text, with per-run styling for any
  // inline children (strong, em, span, etc.).
  function buildRichTextLayer(el, origin) {
    const cs = window.getComputedStyle(el);
    if (isHidden(el, cs)) return null;

    const runs = [];
    collectRuns(el, runs);
    // Strip trailing whitespace-only run
    while (runs.length && !runs[runs.length - 1].text.trim() && !runs[runs.length - 1].breakLine) {
      runs.pop();
    }
    if (runs.length === 0) return null;

    // Measure the union of every text node's client rects inside the element.
    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
    const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
    let tn;
    while ((tn = tw.nextNode())) {
      if (!tn.textContent || !tn.textContent.trim()) continue;
      const range = document.createRange();
      range.selectNode(tn);
      const rects = range.getClientRects();
      for (const r of rects) {
        left = Math.min(left, r.left);
        top = Math.min(top, r.top);
        right = Math.max(right, r.right);
        bottom = Math.max(bottom, r.bottom);
      }
    }
    if (!isFinite(left)) return null;

    const elRect = el.getBoundingClientRect();
    const align = cs.textAlign;
    const padL = parseFloat(cs.paddingLeft) || 0;
    const padR = parseFloat(cs.paddingRight) || 0;
    let boxLeft = left, boxRight = right;
    let boxTop = top, boxBottom = bottom;
    let alignFinal = align;

    // See buildTextLayer: pill/label detection (shrink-fit element with bg
    // and a default-aligned inline-only child). When the PPT font is
    // narrower than the HTML font, the glyphs would otherwise hug the
    // shape's left edge inside the visible bg. Match the bg shape and
    // force align=center so the glyphs stay visually centered.
    const bgColor = parseColor(cs.backgroundColor);
    const hasBgImg = cs.backgroundImage && cs.backgroundImage !== "none";
    const hasBg = !!(bgColor || hasBgImg);
    const innerW = elRect.width - padL - padR;
    const textW = right - left;
    const isShrinkFit = textW > 0 && innerW > 0 && Math.abs(innerW - textW) < 2.5;
    const alignIsDefault = !align || align === "start" || align === "left";
    const isPillLike = hasBg && isShrinkFit && alignIsDefault;
    if (isPillLike) {
      boxLeft = elRect.left;
      boxRight = elRect.right;
      boxTop = elRect.top;
      boxBottom = elRect.bottom;
      alignFinal = "center";
    } else if (align === "center" || align === "right" || align === "justify") {
      boxLeft = elRect.left + padL;
      boxRight = elRect.right - padR;
    }

    const padY = isPillLike ? 0 : 2;
    const baseColor = parseColor(cs.color);
    const baseSize = parseFloat(cs.fontSize);

    return {
      type: "text",
      bbox: {
        x: round2(boxLeft - origin.left),
        y: round2(boxTop - origin.top - padY),
        w: round2(boxRight - boxLeft),
        h: round2(boxBottom - boxTop + padY * 2),
      },
      runs,
      style: {
        // Outer/default styling for the text box
        color: baseColor ? baseColor.hex : "000000",
        fontSize: round2(baseSize),
        fontFamily: cs.fontFamily,
        fontWeight: normalizeWeight(cs.fontWeight),
        italic: cs.fontStyle === "italic",
        underline: cs.textDecorationLine && cs.textDecorationLine.includes("underline"),
        textTransform: cs.textTransform,
        letterSpacing: parseFloat(cs.letterSpacing) || 0,
        lineHeight: isNaN(parseFloat(cs.lineHeight)) ? null : parseFloat(cs.lineHeight),
        align: alignFinal === "start" ? "left" : alignFinal === "end" ? "right" : alignFinal,
      },
    };
  }

  function buildShapeLayer(el, origin) {
    const cs = window.getComputedStyle(el);
    if (isHidden(el, cs)) return null;

    const bgColor = parseColor(cs.backgroundColor);
    const bgImage = cs.backgroundImage;
    const hasBg = !!bgColor;
    const hasGrad = hasGradient(bgImage);
    const bi = borderInfo(cs);
    const hasAnyBorder = bi.active > 0;
    // Ignore the root slide container shape — we treat that as slide background.
    if (!hasBg && !hasGrad && !hasAnyBorder) return null;

    const bbox = bboxRelative(el, origin);
    // Tag this element so the post-pass can screenshot it for gradient fills.
    if (hasGrad) {
      el.setAttribute("data-htmp-grad", `g_${Math.random().toString(36).slice(2, 10)}`);
    }
    const shape = {
      type: "shape",
      bbox,
      fill: bgColor ? bgColor.hex : null,
      fillAlpha: bgColor ? bgColor.a : 1,
      hasGradient: hasGrad,
      gradientId: hasGrad ? el.getAttribute("data-htmp-grad") : null,
      radius: round2(radiusPx(cs)),
    };
    // Full rectangular border only when all 4 sides are active (avoids
    // drawing a 4-sided box around elements that only have, e.g., a top
    // accent bar).
    if (bi.active === 4) {
      shape.border = {
        color: bi.color || "000000",
        width: round2(Math.max(bi.sides.top, bi.sides.right, bi.sides.bottom, bi.sides.left)),
      };
    } else if (hasAnyBorder) {
      // Partial border → caller will emit thin line shapes for the active
      // sides. We don't render them here; just record them.
      shape.partialBorder = {
        color: bi.color || "000000",
        sides: bi.sides,
      };
    }
    if (cs.boxShadow && cs.boxShadow !== "none") shape.shadow = true;
    return shape;
  }

  // ---- per-slide extraction --------------------------------------------
  const slideEls = Array.from(document.querySelectorAll(selector));
  const result = { slides: [] };
  if (slideEls.length === 0) return result;

  const first = slideEls[0].getBoundingClientRect();
  result.slideWidthPx = round2(first.width);
  result.slideHeightPx = round2(first.height);

  for (let i = 0; i < slideEls.length; i++) {
    const slideEl = slideEls[i];
    const origin = slideEl.getBoundingClientRect();
    const slideCs = window.getComputedStyle(slideEl);

    const slideData = {
      index: i + 1,
      widthPx: round2(origin.width),
      heightPx: round2(origin.height),
      backgroundColor: null,
      backgroundHasGradient: false,
      layers: [],
    };

    const rootBg = parseColor(slideCs.backgroundColor);
    if (rootBg) slideData.backgroundColor = rootBg.hex;
    if (hasGradient(slideCs.backgroundImage)) {
      slideData.backgroundHasGradient = true;
      slideEl.setAttribute("data-htmp-grad", `slide${i + 1}_root`);
      slideData.backgroundGradientId = `slide${i + 1}_root`;
    }

    // Walk all descendants depth-first in DOM order. Skip subtrees inside SVG
    // and TABLE (those become single layers themselves).
    const walker = document.createTreeWalker(slideEl, NodeFilter.SHOW_ELEMENT, null);
    const toVisit = [];
    let node;
    while ((node = walker.nextNode())) toVisit.push(node);

    // Subtrees to skip entirely (SVG, TABLE descendants — they're one layer).
    const skipSubtrees = new WeakSet();
    // Text-block ancestors. Descendants inherit "no text emission" because
    // the text block already emitted one rich-text layer covering them.
    const textBlockAncestors = new WeakSet();

    for (const el of toVisit) {
      // Skip if inside a fully-skipped subtree (svg/table)
      let p = el.parentElement;
      let hardSkip = false;
      while (p && p !== slideEl) {
        if (skipSubtrees.has(p)) { hardSkip = true; break; }
        p = p.parentElement;
      }
      if (hardSkip) continue;

      // Determine whether text emission is suppressed (inside an already-
      // emitted rich-text block). Shapes may still be emitted — e.g. a
      // <span> pill background inside a text block becomes a shape layer
      // even though its text is already in the rich-text runs.
      let suppressText = false;
      p = el.parentElement;
      while (p && p !== slideEl) {
        if (textBlockAncestors.has(p)) { suppressText = true; break; }
        p = p.parentElement;
      }

      const tag = el.tagName.toLowerCase();

      if (tag === "svg") {
        const cs = window.getComputedStyle(el);
        if (!isHidden(el, cs)) {
          const bbox = bboxRelative(el, origin);
          slideData.layers.push({
            type: "svg",
            bbox,
            svgId: `slide${i + 1}_svg${slideData.layers.filter(l => l.type === "svg").length}`,
          });
        }
        skipSubtrees.add(el);
        continue;
      }

      if (tag === "table") {
        const cs = window.getComputedStyle(el);
        if (!isHidden(el, cs)) {
          if (isComplexTable(el)) {
            // Tables with merged cells or transformed content can't
            // round-trip through a native PPT table. Tag for screenshot
            // so the post-pass rasterizes it; emit as an image layer.
            const id = `table_${Math.random().toString(36).slice(2, 10)}`;
            el.setAttribute("data-htmp-img", id);
            slideData.layers.push({
              type: "image",
              bbox: bboxRelative(el, origin),
              imageId: id,
              isTableFallback: true,
            });
          } else {
            slideData.layers.push(buildTableLayer(el, origin));
          }
        }
        skipSubtrees.add(el);
        continue;
      }

      if (tag === "img") {
        const cs = window.getComputedStyle(el);
        if (!isHidden(el, cs)) {
          const bbox = bboxRelative(el, origin);
          const src = el.getAttribute("src") || "";
          const loaded = el.complete && el.naturalWidth > 0;
          if (loaded) {
            // Tag for screenshot in the post-pass — bakes the image into
            // the JSON as base64 so the PPTX is self-contained.
            const id = `img_${Math.random().toString(36).slice(2, 10)}`;
            el.setAttribute("data-htmp-img", id);
            slideData.layers.push({
              type: "image",
              bbox,
              imageId: id,
              origSrc: src,
            });
          } else {
            // Image failed to load. Emit a placeholder so the slide shows
            // *something* and the caller can see what's missing.
            slideData.layers.push({
              type: "image_placeholder",
              bbox,
              filename: src,
            });
          }
        }
        continue;
      }

      // Shape layer (background/border): emit regardless of suppressText.
      // This preserves pill/badge backgrounds inside text blocks.
      if (el !== slideEl) {
        const shapeLayer = buildShapeLayer(el, origin);
        if (shapeLayer) slideData.layers.push(shapeLayer);
      }

      // Text handling
      if (suppressText) continue;

      if (isTextBlock(el)) {
        // Block-level element whose content is inline-only. Emit one
        // rich-text layer and mark its subtree as text-suppressed.
        const rich = buildRichTextLayer(el, origin);
        if (rich) {
          slideData.layers.push(rich);
          textBlockAncestors.add(el);
        }
      } else if (directTextContent(el)) {
        // Mixed case: element has both direct text and block children.
        // Emit just the direct text at its measured position.
        const textLayer = buildTextLayer(el, origin);
        if (textLayer) slideData.layers.push(textLayer);
      }
    }

    result.slides.push(slideData);
  }

  return result;

  // ---- table builder (inner function; called from the loop) -------------
  function buildTableLayer(table, origin) {
    const cs = window.getComputedStyle(table);
    const bbox = bboxRelative(table, origin);
    const rows = [];
    // Gather rows from thead + tbody in visual order
    const trs = Array.from(table.querySelectorAll("tr"));
    for (const tr of trs) {
      const cells = [];
      for (const cell of tr.children) {
        const ccs = window.getComputedStyle(cell);
        const bg = parseColor(ccs.backgroundColor);
        const col = parseColor(ccs.color);
        cells.push({
          text: (cell.textContent || "").replace(/\s+/g, " ").trim(),
          isHeader: cell.tagName.toLowerCase() === "th",
          fill: bg ? bg.hex : null,
          color: col ? col.hex : "000000",
          fontSize: round2(parseFloat(ccs.fontSize)),
          bold: normalizeWeight(ccs.fontWeight) >= 600 || cell.tagName.toLowerCase() === "th",
          align: ccs.textAlign === "start" ? "left" : ccs.textAlign,
        });
      }
      rows.push(cells);
    }
    return {
      type: "table",
      bbox,
      rows,
      fontFamily: cs.fontFamily,
    };
  }
}

async function main() {
  const args = parseArgs(process.argv);
  const htmlPath = path.resolve(args.html);
  if (!fs.existsSync(htmlPath)) {
    console.error(`File not found: ${htmlPath}`);
    process.exit(2);
  }

  const browser = await launchBrowser();
  const page = await loadPage(browser, htmlPath, {
    viewportWidth: 1400,
    viewportHeight: 4000,
    deviceScaleFactor: 2,
    waitForFonts: true,
    timeout: 120000,
  });

  // Auto-detect slide selector if not provided. Priority:
  //   1. --selector flag (caller override)
  //   2. [data-slide] attributes (most explicit)
  //   3. Common class shared by all page-break-bearing fixed-size elements
  //   4. Fallback to .slide (the deck-create convention)
  let selector = args.selector;
  if (!selector) {
    selector = await page.evaluate(() => {
      // 2. data-slide attribute
      if (document.querySelectorAll("[data-slide]").length >= 2) {
        return "[data-slide]";
      }

      // 3. Fixed-size elements with page-break (the /deck-create pattern)
      const all = Array.from(document.querySelectorAll("*"));
      const withBreaks = all.filter((el) => {
        const s = window.getComputedStyle(el);
        return (
          s.pageBreakAfter === "always" ||
          s.breakAfter === "page" ||
          s.pageBreakBefore === "always" ||
          s.breakBefore === "page"
        );
      });
      if (withBreaks.length < 2) return null;
      const first = withBreaks[0].getBoundingClientRect();
      if (first.width < 100 || first.height < 100) return null;
      const allSameSize = withBreaks.every((el) => {
        const r = el.getBoundingClientRect();
        return Math.abs(r.width - first.width) < 2 && Math.abs(r.height - first.height) < 2;
      });
      if (!allSameSize) return null;
      // Find a class that matches exactly these elements
      for (const cls of Array.from(withBreaks[0].classList)) {
        const matched = document.querySelectorAll(`.${cls}`);
        if (matched.length === withBreaks.length) return `.${cls}`;
      }
      return null;
    });
    // 4. Final fallback: the convention from /deck-create
    if (!selector) selector = ".slide";
    console.error(`Auto-detected slide selector: ${selector}`);
  }

  const data = await page.evaluate(extractInPage, selector);

  // Helper: screenshot an element capturing only its own background/gradient,
  // with no overlapping foreground content baked in. The element's bbox often
  // covers the whole slide (e.g. a position:absolute .noise overlay with
  // inset:0), so we can't just hide descendants — siblings and cousins inside
  // the slide render INSIDE the bbox at higher z-index and would otherwise
  // bake their text into the screenshot, producing visible duplication when
  // editable text layers are overlaid in the PPTX.
  //
  // Strategy: walk up from `el` to its containing slide. Hide every element
  // inside the slide that is NOT on the el → slide ancestor path AND NOT a
  // descendant of `el`. The slide root stays visible so its background color
  // shows through any alpha in the gradient.
  async function screenshotBackgroundOnly(handle, slideHandle) {
    await handle.evaluate((el, slide) => {
      const scope = slide || document.body;

      // Build the el → scope ancestor path (inclusive on both ends).
      const path = new Set();
      let p = el;
      while (p && p !== scope.parentElement) {
        path.add(p);
        p = p.parentElement;
      }

      // Hide every element under scope that isn't on the path and isn't a
      // descendant of el. We preserve layout (visibility:hidden, not display)
      // so el's bbox doesn't shift between hide → screenshot → restore.
      const hidden = [];
      const all = scope.querySelectorAll("*");
      for (const node of all) {
        if (path.has(node)) continue;
        if (el.contains(node)) continue;
        hidden.push([node, node.style.visibility]);
        node.style.visibility = "hidden";
      }
      el.__htmp_hiddenSiblings = hidden;

      // Blank any text nodes inside el (rare — gradient overlays are usually
      // empty divs — but safe to handle).
      const textNodes = [];
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
      let n;
      while ((n = walker.nextNode())) {
        if (n.textContent && n.textContent.length) {
          textNodes.push([n, n.textContent]);
          n.textContent = "";
        }
      }
      el.__htmp_savedTextNodes = textNodes;
    }, slideHandle);

    let buf;
    try {
      buf = await handle.screenshot({ type: "png" });
    } finally {
      await handle.evaluate((el) => {
        const hidden = el.__htmp_hiddenSiblings || [];
        for (const [node, prev] of hidden) {
          if (prev) node.style.visibility = prev;
          else node.style.removeProperty("visibility");
        }
        delete el.__htmp_hiddenSiblings;

        const saved = el.__htmp_savedTextNodes || [];
        for (const [node, text] of saved) {
          node.textContent = text;
        }
        delete el.__htmp_savedTextNodes;
      });
    }
    return buf;
  }

  // Post-pass: rasterize (a) all SVG elements and (b) all elements we tagged
  // with data-htmp-grad (gradient backgrounds), and attach base64 PNGs.
  const slideHandles = await page.$$(selector);
  for (let i = 0; i < slideHandles.length; i++) {
    const slide = slideHandles[i];

    // --- SVGs (match by DOM order to svg layers) ---
    const svgHandles = await slide.$$("svg");
    const svgLayers = data.slides[i].layers.filter((l) => l.type === "svg");
    for (let k = 0; k < svgLayers.length && k < svgHandles.length; k++) {
      try {
        const buf = await svgHandles[k].screenshot({ omitBackground: true, type: "png" });
        svgLayers[k].dataUrl = "data:image/png;base64," + Buffer.from(buf).toString("base64");
      } catch (e) {
        svgLayers[k].error = String(e.message || e);
      }
    }

    // --- Gradient elements: screenshot with descendants hidden, so only the
    // gradient fill is captured. Editable text/shape layers will overlay. ---
    const sd = data.slides[i];
    const gradIds = new Set();
    if (sd.backgroundGradientId) gradIds.add(sd.backgroundGradientId);
    for (const L of sd.layers) {
      if (L.type === "shape" && L.hasGradient && L.gradientId) gradIds.add(L.gradientId);
    }
    for (const gid of gradIds) {
      try {
        const handle = await page.$(`[data-htmp-grad="${gid}"]`);
        if (!handle) continue;
        const buf = await screenshotBackgroundOnly(handle, slide);
        const dataUrl = "data:image/png;base64," + Buffer.from(buf).toString("base64");
        if (gid === sd.backgroundGradientId) {
          sd.backgroundImageDataUrl = dataUrl;
        } else {
          const layer = sd.layers.find((L) => L.gradientId === gid);
          if (layer) layer.dataUrl = dataUrl;
        }
      } catch (e) {
        console.error(`Slide ${i + 1} gradient ${gid} screenshot failed:`, e.message);
      }
    }

    // --- Elements tagged data-htmp-img (e.g. complex tables) ---
    // Screenshot each tagged element WITH its contents visible, and attach
    // the PNG data URL to the matching image layer. This is the escape
    // hatch for content that can't be represented natively in PPT.
    const imgIds = new Set();
    for (const L of sd.layers) {
      if (L.type === "image" && L.imageId) imgIds.add(L.imageId);
    }
    for (const iid of imgIds) {
      try {
        const handle = await page.$(`[data-htmp-img="${iid}"]`);
        if (!handle) continue;
        const buf = await handle.screenshot({ type: "png" });
        const dataUrl = "data:image/png;base64," + Buffer.from(buf).toString("base64");
        const layer = sd.layers.find((L) => L.imageId === iid);
        if (layer) layer.dataUrl = dataUrl;
      } catch (e) {
        console.error(`Slide ${i + 1} image ${iid} screenshot failed:`, e.message);
      }
    }

    // --- Full-slide reference render (only when caller needs it) ---
    if (args.captureFullSlide) {
      try {
        const full = await slide.screenshot({ type: "png" });
        data.slides[i].fullRenderDataUrl = "data:image/png;base64," + Buffer.from(full).toString("base64");
      } catch (e) { /* ignore */ }
    }
  }

  await browser.close();

  fs.writeFileSync(args.out, JSON.stringify(data, null, 2));
  console.error(`Extracted ${data.slides.length} slides → ${args.out}`);
  console.error(`Slide size: ${data.slideWidthPx} × ${data.slideHeightPx} px`);
  const totalLayers = data.slides.reduce((a, s) => a + s.layers.length, 0);
  console.error(`Total layers: ${totalLayers}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
